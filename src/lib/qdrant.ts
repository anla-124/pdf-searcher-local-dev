import { QdrantClient } from '@qdrant/js-client-rest'
import { createServiceClient, releaseServiceClient } from '@/lib/supabase/server'
import type {
  BusinessMetadata
} from '@/types/external-apis'
import { logger } from '@/lib/logger'

// Lazy initialization to avoid errors during build
let qdrant: QdrantClient | null = null

function getQdrantClient(): QdrantClient {
  if (!qdrant) {
    const url = process.env['QDRANT_URL'] || 'http://localhost:6333'
    const apiKey = process.env['QDRANT_API_KEY']

    qdrant = new QdrantClient({
      url,
      ...(apiKey ? { apiKey } : {})
    })

    logger.info('Qdrant client initialized', { url })
  }
  return qdrant
}

export { getQdrantClient }

function getCollectionName(): string {
  return process.env['QDRANT_COLLECTION_NAME'] || 'documents'
}

/**
 * Hash a string ID to a consistent positive integer for Qdrant
 * Uses a simple but consistent hash function
 */
function hashStringToNumber(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  // Ensure positive number
  return Math.abs(hash)
}

export interface SimilaritySearchResult {
  id: string
  score: number
  document_id: string
  text: string
  metadata?: BusinessMetadata
}

/**
 * Qdrant filter condition types
 */
interface QdrantMatchCondition {
  key: string
  match: { value?: unknown; any?: unknown[] }
}

interface QdrantRangeCondition {
  key: string
  range: {
    gte?: unknown
    lte?: unknown
    gt?: unknown
    lt?: unknown
  }
}

type QdrantCondition = QdrantMatchCondition | QdrantRangeCondition

interface QdrantFilter {
  must?: QdrantCondition[]
  must_not?: QdrantCondition[]
  should?: QdrantCondition[]
}

/**
 * Convert MongoDB-style filter to Qdrant filter format
 *
 * Input: { field: { $eq: "value" } }
 * Qdrant: { must: [{ key: "field", match: { value: "value" } }] }
 */
export function convertToQdrantFilter(filter: Record<string, unknown>): QdrantFilter | undefined {
  const must: QdrantCondition[] = []
  const must_not: QdrantCondition[] = []
  const should: QdrantCondition[] = []

  for (const [field, condition] of Object.entries(filter)) {
    if (condition === null || condition === undefined) continue

    // Handle simple string/number/boolean values (implicit equality)
    if (typeof condition === 'string' || typeof condition === 'number' || typeof condition === 'boolean') {
      must.push({ key: field, match: { value: condition } })
      continue
    }

    // Handle array (implicit $in)
    if (Array.isArray(condition)) {
      if (condition.length === 1) {
        must.push({ key: field, match: { value: condition[0] } })
      } else if (condition.length > 1) {
        must.push({ key: field, match: { any: condition } })
      }
      continue
    }

    // Handle operator objects
    if (typeof condition === 'object') {
      const operators = condition as Record<string, unknown>

      // $eq operator
      if ('$eq' in operators) {
        must.push({ key: field, match: { value: operators['$eq'] } })
      }

      // $ne operator
      if ('$ne' in operators) {
        must_not.push({ key: field, match: { value: operators['$ne'] } })
      }

      // $in operator
      if ('$in' in operators && Array.isArray(operators['$in'])) {
        const values = operators['$in'] as unknown[]
        if (values.length === 1) {
          must.push({ key: field, match: { value: values[0] } })
        } else if (values.length > 1) {
          must.push({ key: field, match: { any: values } })
        } else {
          // Empty array means no results should match
          must.push({ key: field, match: { value: '__impossible_value_no_match__' } })
        }
      }

      // $gte, $lte, $gt, $lt (range operators)
      const hasRangeOps = '$gte' in operators || '$lte' in operators || '$gt' in operators || '$lt' in operators
      if (hasRangeOps) {
        const range: {
          gte?: unknown
          lte?: unknown
          gt?: unknown
          lt?: unknown
        } = {}
        if ('$gte' in operators) range.gte = operators['$gte']
        if ('$lte' in operators) range.lte = operators['$lte']
        if ('$gt' in operators) range.gt = operators['$gt']
        if ('$lt' in operators) range.lt = operators['$lt']
        must.push({ key: field, range })
      }
    }
  }

  // Build final filter object
  const result: QdrantFilter = {}
  if (must.length > 0) result.must = must
  if (must_not.length > 0) result.must_not = must_not
  if (should.length > 0) result.should = should

  // If no conditions, return undefined (no filter)
  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Index a document chunk in Qdrant
 */
export async function indexDocumentInQdrant(
  id: string,
  vector: number[],
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const client = getQdrantClient()
    const collectionName = getCollectionName()

    // Store the original string ID in the payload
    const fullPayload = {
      ...payload,
      vector_id: id  // Store the original string ID for reference
    }

    // Generate a consistent numeric ID from the string ID
    const numericId = hashStringToNumber(id)

    await client.upsert(collectionName, {
      wait: true,
      points: [{
        id: numericId,
        vector,
        payload: fullPayload
      }]
    })

    logger.info('Indexed document chunk in Qdrant', { chunkId: id, numericId, collection: collectionName })
  } catch (error) {
    logger.error('Failed to index document chunk in Qdrant', error as Error, { chunkId: id })
    throw error
  }
}

/**
 * Search for similar documents
 */
export async function searchSimilarDocuments(
  documentId: string,
  options: {
    topK?: number
    filter?: Record<string, unknown>
    threshold?: number
    userId?: string
    pageRange?: {
      start_page: number
      end_page: number
    }
  } = {}
): Promise<SimilaritySearchResult[]> {
  try {
    const { topK = 10, filter = {}, threshold = 0.7, pageRange } = options

    // Get the vector for the source document (with optional page range)
    const sourceVector = await getDocumentVector(documentId, pageRange)
    if (!sourceVector) {
      throw new Error(`No vector found for document ${documentId}`)
    }

    // Build filter excluding source document
    const searchFilter = {
      ...filter,
      document_id: { $ne: documentId }
    }

    const qdrantFilter = convertToQdrantFilter(searchFilter)

    // Search for similar vectors
    const client = getQdrantClient()
    const collectionName = getCollectionName()

    const searchResults = await client.search(collectionName, {
      vector: sourceVector,
      limit: topK + 10, // Get extra results to filter out any edge cases
      filter: qdrantFilter,
      with_payload: true,
      with_vector: false
    })

    // Filter results by threshold and format
    const results: SimilaritySearchResult[] = []

    for (const match of searchResults) {
      if (match.score < threshold) continue

      const payload = match.payload as Record<string, unknown> | undefined
      const metadataDocumentId = payload?.document_id
      if (typeof metadataDocumentId !== 'string' || !payload) {
        continue
      }

      const metadataText = payload.text

      results.push({
        id: String(match.id),
        score: match.score,
        document_id: metadataDocumentId,
        text: typeof metadataText === 'string' ? metadataText : '',
        metadata: payload as BusinessMetadata
      })

      if (results.length >= topK) break
    }

    logger.info('Similarity search completed', { sourceDocumentId: documentId, resultsCount: results.length })
    return results

  } catch (error) {
    logger.error('Similarity search failed', error as Error, { documentId })
    throw error
  }
}

/**
 * Vector search with query vector
 */
export async function vectorSearch(
  queryVector: number[],
  options: {
    topK?: number
    filter?: Record<string, unknown>
    threshold?: number
  } = {}
): Promise<SimilaritySearchResult[]> {
  try {
    const { topK = 20, filter = {}, threshold = 0.7 } = options

    const qdrantFilter = convertToQdrantFilter(filter)

    const client = getQdrantClient()
    const collectionName = getCollectionName()

    const searchResults = await client.search(collectionName, {
      vector: queryVector,
      limit: topK,
      filter: qdrantFilter,
      with_payload: true,
      with_vector: false
    })

    // Filter and format results
    const results: SimilaritySearchResult[] = []

    for (const match of searchResults) {
      if (match.score < threshold) continue

      const payload = match.payload as Record<string, unknown> | undefined
      const metadataDocumentId = payload?.document_id
      if (typeof metadataDocumentId !== 'string' || !payload) {
        continue
      }

      const metadataText = payload.text

      results.push({
        id: String(match.id),
        score: match.score,
        document_id: metadataDocumentId,
        text: typeof metadataText === 'string' ? metadataText : '',
        metadata: payload as BusinessMetadata
      })
    }

    logger.info('Vector search completed', { resultsCount: results.length })
    return results

  } catch (error) {
    logger.error('Vector search failed', error as Error)
    throw error
  }
}

/**
 * Delete document vectors from Qdrant
 */
export async function deleteDocumentFromQdrant(documentId: string, presetVectorIds?: string[]): Promise<void> {
  try {
    const vectorIds = Array.isArray(presetVectorIds) && presetVectorIds.length > 0
      ? [...presetVectorIds]
      : await fetchVectorIdsFromSupabase(documentId)

    if (!vectorIds || vectorIds.length === 0) {
      logger.warn('No vector IDs available for document deletion', { documentId })
      return
    }

    const BATCH_SIZE = 1000
    let totalAttempted = 0

    const client = getQdrantClient()
    const collectionName = getCollectionName()

    for (let i = 0; i < vectorIds.length; i += BATCH_SIZE) {
      const batch = vectorIds.slice(i, i + BATCH_SIZE)

      // Convert string IDs to numeric IDs
      const numericIds = batch.map(id => hashStringToNumber(id))

      await client.delete(collectionName, {
        wait: true,
        points: numericIds
      })

      totalAttempted += batch.length

      if (vectorIds.length > BATCH_SIZE) {
        logger.info('Deleted vector batch', {
          documentId,
          batchNumber: Math.floor(i / BATCH_SIZE) + 1,
          totalBatches: Math.ceil(vectorIds.length / BATCH_SIZE),
          batchSize: batch.length
        })
      }
    }

    logger.info('Successfully deleted all vectors from Qdrant', { documentId, vectorsDeleted: totalAttempted })
  } catch (error) {
    logger.error('Failed to delete vectors from Qdrant', error as Error, { documentId })
    throw error
  }
}

async function fetchVectorIdsFromSupabase(documentId: string): Promise<string[] | null> {
  const supabase = await createServiceClient()
  try {
    const { data: chunks, error: dbError } = await supabase
      .from('document_embeddings')
      .select('chunk_index')
      .eq('document_id', documentId)
      .range(0, 999999)

    if (dbError) {
      throw new Error(`Failed to fetch chunk info for deletion from database: ${dbError.message}`)
    }

    if (!chunks || chunks.length === 0) {
      return null
    }

    return chunks.map(chunk => `${documentId}_chunk_${chunk.chunk_index}`)
  } finally {
    releaseServiceClient(supabase)
  }
}

export async function getVectorIdsForDocument(documentId: string): Promise<string[]> {
  const ids = await fetchVectorIdsFromSupabase(documentId)
  return Array.isArray(ids) ? ids : []
}

/**
 * Update document metadata in Qdrant
 * Qdrant allows direct payload updates without fetching the entire vector
 */
export async function updateDocumentMetadataInQdrant(
  documentId: string,
  newMetadata: Record<string, unknown>
): Promise<void> {
  try {
    logger.info('Starting Qdrant metadata update', { documentId })

    // 1. Get all vector IDs from the database
    const supabase = await createServiceClient()
    try {
      const { data: chunks, error: dbError } = await supabase
        .from('document_embeddings')
        .select('chunk_index')
        .eq('document_id', documentId)
        .range(0, 999999) // Override default 1000 row limit

      if (dbError) {
        throw new Error(`Failed to fetch chunk info from database: ${dbError.message}`)
      }

      if (!chunks || chunks.length === 0) {
        logger.warn('No chunks found for Qdrant metadata update', { documentId })
        return
      }

      const vectorIds = chunks.map(chunk => `${documentId}_chunk_${chunk.chunk_index}`)

      // Convert string IDs to numeric IDs (Qdrant requirement)
      const numericIds = vectorIds.map(id => hashStringToNumber(id))

      // 2. Update payload in Qdrant
      // Qdrant setPayload merges new payload with existing payload
      const client = getQdrantClient()
      const collectionName = getCollectionName()

      await client.setPayload(collectionName, {
        payload: newMetadata,
        points: numericIds,
        wait: true
      })

      logger.info('Successfully updated metadata in Qdrant', { documentId, vectorsUpdated: vectorIds.length })

    } finally {
      releaseServiceClient(supabase)
    }
  } catch (error) {
    logger.error('Failed to update Qdrant metadata', error as Error, { documentId })
    throw error
  }
}

/**
 * Get document vector by ID
 * If pageRange is provided, returns the centroid (average) of vectors within that page range
 * Otherwise, returns the first chunk's vector
 */
async function getDocumentVector(
  documentId: string,
  pageRange?: {
    start_page: number
    end_page: number
  }
): Promise<number[] | null> {
  try {
    // Build filter
    const filter: Record<string, unknown> = {
      document_id: { $eq: documentId }
    }

    if (pageRange) {
      filter['page_number'] = {
        $gte: pageRange.start_page,
        $lte: pageRange.end_page
      }
      logger.info('Fetching vectors with page range', {
        documentId,
        startPage: pageRange.start_page,
        endPage: pageRange.end_page
      })
    }

    const qdrantFilter = convertToQdrantFilter(filter)

    const client = getQdrantClient()
    const collectionName = getCollectionName()

    // Scroll through all matching vectors if page range specified
    const limit = pageRange ? 10000 : 1

    // Use search with a dummy vector to get vectors by filter
    const dummyVector = new Array(768).fill(0)

    const searchResults = await client.search(collectionName, {
      vector: dummyVector,
      limit,
      filter: qdrantFilter,
      with_vector: true,
      with_payload: pageRange ? true : false
    })

    if (!searchResults || searchResults.length === 0) {
      logger.warn('No vectors found for document', {
        documentId,
        pageRange: pageRange ? `${pageRange.start_page}-${pageRange.end_page}` : undefined
      })
      return null
    }

    // If page range specified, compute centroid of all matching vectors
    if (pageRange && searchResults.length > 1) {
      const vectors = searchResults
        .filter(m => m.vector && Array.isArray(m.vector))
        .map(m => m.vector as number[])

      if (vectors.length === 0) return null

      logger.info('Computing centroid from page range vectors', {
        documentId,
        vectorCount: vectors.length,
        startPage: pageRange.start_page,
        endPage: pageRange.end_page
      })

      const firstVector = vectors[0]
      if (!firstVector) return null

      const dimension = firstVector.length
      const centroid = new Array(dimension).fill(0)

      // Sum all vectors
      for (const vector of vectors) {
        for (let i = 0; i < dimension; i++) {
          centroid[i] += vector[i]
        }
      }

      // Average
      for (let i = 0; i < dimension; i++) {
        centroid[i] /= vectors.length
      }

      // L2 normalization for cosine similarity
      const magnitude = Math.sqrt(centroid.reduce((sum, val) => sum + val * val, 0))
      if (magnitude > 0) {
        for (let i = 0; i < dimension; i++) {
          centroid[i] /= magnitude
        }
      }

      return centroid
    }

    // Otherwise, return first chunk's vector
    if (searchResults[0] && searchResults[0].vector) {
      return searchResults[0].vector as number[]
    }

    return null
  } catch (error) {
    logger.error('Failed to get vector for document', error as Error, { documentId })
    return null
  }
}

/**
 * Get collection statistics
 */
export async function getQdrantStats() {
  try {
    const client = getQdrantClient()
    const collectionName = getCollectionName()

    const collectionInfo = await client.getCollection(collectionName)

    return {
      totalVectorCount: collectionInfo.points_count || 0,
      dimension: collectionInfo.config?.params?.vectors?.size || 768,
      status: collectionInfo.status
    }
  } catch (error) {
    logger.error('Failed to get Qdrant stats', error as Error)
    return null
  }
}
