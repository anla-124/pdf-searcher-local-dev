/**
 * Stage 0: Document-Level Centroid Candidate Retrieval
 * Fast filtering using pre-computed document centroids
 * Reduces 2000+ documents → ~600 candidates in ~5 seconds
 *
 * Purpose: Cast wide net for high recall (don't miss true matches)
 */

import { createServiceClient, releaseServiceClient } from '@/lib/supabase/server'
import { getQdrantClient, convertToQdrantFilter } from '@/lib/qdrant'
import { logger } from '@/lib/logger'
import { Stage0Result } from '../types'

const FILTER_OPERATOR_IN = '$in'
const FILTER_OPERATOR_EQ = '$eq'
const FILTER_OPERATOR_NE = '$ne'

function sanitizeDocumentIdFilter(
  existingFilter: unknown,
  sourceDocId: string
): Record<string, unknown> {
  if (existingFilter === undefined) {
    return { [FILTER_OPERATOR_NE]: sourceDocId }
  }

  if (typeof existingFilter === 'string') {
    if (existingFilter === sourceDocId) {
      return { [FILTER_OPERATOR_IN]: [] }
    }
    return { [FILTER_OPERATOR_IN]: [existingFilter] }
  }

  if (existingFilter && typeof existingFilter === 'object' && !Array.isArray(existingFilter)) {
    const filter = { ...(existingFilter as Record<string, unknown>) }

    const rawIn = filter[FILTER_OPERATOR_IN]
    if (Array.isArray(rawIn)) {
      const allowed = rawIn.filter(
        (value): value is string => typeof value === 'string' && value !== sourceDocId
      )
      filter[FILTER_OPERATOR_IN] = allowed
      if (allowed.length === 0) {
        return { [FILTER_OPERATOR_IN]: [] }
      }
    }

    const rawEq = filter[FILTER_OPERATOR_EQ]
    if (typeof rawEq === 'string') {
      if (rawEq === sourceDocId) {
        return { [FILTER_OPERATOR_IN]: [] }
      }
    }

    if (
      filter[FILTER_OPERATOR_IN] === undefined &&
      filter[FILTER_OPERATOR_EQ] === undefined &&
      filter[FILTER_OPERATOR_NE] === undefined
    ) {
      filter[FILTER_OPERATOR_NE] = sourceDocId
    } else if (filter[FILTER_OPERATOR_IN] === undefined && filter[FILTER_OPERATOR_EQ] === undefined) {
      // Ensure source document is excluded even when other constraints exist
      filter[FILTER_OPERATOR_NE] = sourceDocId
    }

    return filter
  }

  return { [FILTER_OPERATOR_NE]: sourceDocId }
}

/**
 * Retrieve top candidates using document-level centroid similarity
 * CRITICAL: Uses pre-computed and cached centroids for speed
 *
 * @param sourceDocId - ID of source document
 * @param options - Configuration options
 * @returns Top K candidate document IDs with scores
 */
export async function stage0CandidateRetrieval(
  sourceDocId: string,
  options: {
    topK?: number
    filters?: Record<string, unknown>
    overrideSourceVector?: number[]
    sourcePageRange?: {
      start_page: number
      end_page: number
    }
  } = {}
): Promise<Stage0Result> {

  const startTime = Date.now()
  const {
    topK = 600,
    filters = {},
    overrideSourceVector,
    sourcePageRange
  } = options

  const supabase = await createServiceClient()
  try {
    // 1. Get source document centroid (pre-computed and cached)
    const { data: sourceDoc, error: fetchError } = await supabase
      .from('documents')
      .select('id, centroid_embedding, effective_chunk_count')
      .eq('id', sourceDocId)
      .single()

    if (fetchError || !sourceDoc) {
      throw new Error(`Source document not found: ${sourceDocId}`)
    }

    if (!overrideSourceVector && !sourceDoc.centroid_embedding) {
      throw new Error(
        `Source document ${sourceDocId} missing centroid_embedding. ` +
        `Please reprocess or run backfill script.`
      )
    }

    if (!sourceDoc.effective_chunk_count) {
      throw new Error(
        `Source document ${sourceDocId} missing effective_chunk_count. ` +
        `Please reprocess or run backfill script.`
      )
    }

    // 2. Query Qdrant with source centroid
    logger.info('Stage 0: querying Qdrant with centroid', {
      sourceDocId,
      desiredTopK: topK
    })

    // Build Qdrant filter
    const existingDocumentIdFilter = Object.prototype.hasOwnProperty.call(filters, 'document_id')
      ? (filters as Record<string, unknown>)[ 'document_id' ]
      : undefined

    const searchFilter: Record<string, unknown> = {
      ...filters,
      document_id: sanitizeDocumentIdFilter(existingDocumentIdFilter, sourceDocId)
    }

    const qdrantFilter = convertToQdrantFilter(searchFilter)

    // Parse centroid if stored as string in Supabase
    let centroidVector: unknown = overrideSourceVector ?? sourceDoc.centroid_embedding

    if (!overrideSourceVector) {
      if (typeof centroidVector === 'string') {
        try {
          centroidVector = JSON.parse(centroidVector)
        } catch (parseError) {
          throw new Error(`Failed to parse centroid embedding for document ${sourceDocId}: ${parseError}`)
        }
      }
    }

    if (!Array.isArray(centroidVector) || centroidVector.length === 0) {
      throw new Error(`Invalid centroid embedding format for document ${sourceDocId}`)
    }

    // Query using centroid
    logger.debug('Stage 0: Qdrant query params', {
      vectorLength: centroidVector.length,
      limit: topK * 2,
      filter: qdrantFilter,
      ...(sourcePageRange
        ? {
            pageRange: {
              start_page: sourcePageRange.start_page,
              end_page: sourcePageRange.end_page
            }
          }
        : {})
    })

    const client = getQdrantClient()
    const collectionName = process.env['QDRANT_COLLECTION_NAME'] || 'documents'

    const queryResponse = await client.search(collectionName, {
      vector: centroidVector,
      limit: topK * 2,  // Get extra to account for deduplication
      filter: qdrantFilter,
      with_payload: true,
      with_vector: false
    })

    logger.debug('Stage 0: Qdrant response sample', {
      matchesCount: queryResponse.length,
      sample: queryResponse.slice(0, 3).map(m => ({
        id: m.id,
        score: m.score,
        documentId: (m.payload as { document_id?: string } | undefined)?.document_id
      }))
    })

    // 3. Extract and deduplicate document IDs
    const candidateMap = new Map<string, number>()  // doc_id -> best_score

    for (const match of queryResponse) {
      const payload = match.payload as { document_id?: string } | undefined
      if (!payload?.document_id) continue

      const docId = payload.document_id
      const score = match.score || 0

      // Keep highest score if document appears multiple times
      if (!candidateMap.has(docId) || candidateMap.get(docId)! < score) {
        candidateMap.set(docId, score)
      }
    }

    // 4. Sort and take top K
    const candidates = Array.from(candidateMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)

    const candidateIds = candidates.map(c => c[0])
    const scores = candidates.map(c => c[1])

    if (candidateIds.length === 0 && 'user_id' in searchFilter) {
      const { user_id: _userFilter, ...fallbackFilter } = searchFilter
      const fallbackQdrantFilter = convertToQdrantFilter(fallbackFilter)

      try {
        const fallbackResponse = await client.search(collectionName, {
          vector: centroidVector,
          limit: topK * 2,
          filter: fallbackQdrantFilter,
          with_payload: true,
          with_vector: false
        })

        const fallbackMatches = fallbackResponse.length
        if (fallbackMatches > 0) {
          logger.warn('Stage 0: user_id filter eliminated all candidates', {
            sourceDocId,
            fallbackMatches
          })
        }
      } catch (fallbackError) {
        logger.warn('Stage 0: fallback query without user filter failed', {
          sourceDocId,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        })
      }
    }

    const timeMs = Date.now() - startTime

    logger.info('Stage 0: completed centroid retrieval', {
      sourceDocId,
      candidateCount: candidateIds.length,
      durationMs: timeMs,
      averageScore: scores.length > 0
        ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(3))
        : null
    })

    return { candidateIds, scores, timeMs }

  } catch (error) {
    const timeMs = Date.now() - startTime

    // Enhanced error logging with safe property access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorObj = error as any
    logger.error(
      'Stage 0 failed',
      error instanceof Error ? error : new Error(String(error)),
      {
        sourceDocId,
        durationMs: timeMs,
        // Safely access nested error properties
        errorDetails: {
          message: errorObj?.message,
          name: errorObj?.name,
          ...(errorObj?.response && {
            response: {
              data: errorObj.response.data,
              status: errorObj.response.status,
              statusText: errorObj.response.statusText,
            }
          }),
          ...(errorObj?.config?.data && {
            requestData: errorObj.config.data
          }),
          // Catch-all for unexpected error shapes
          fullError: JSON.stringify(errorObj, Object.getOwnPropertyNames(errorObj))
        },
        // Log what we tried to send
        queryContext: {
          filters,
          qdrantFilter: convertToQdrantFilter({
            ...filters,
            document_id: sanitizeDocumentIdFilter(
              Object.prototype.hasOwnProperty.call(filters, 'document_id')
                ? (filters as Record<string, unknown>)['document_id']
                : undefined,
              sourceDocId
            )
          }),
          collectionName: process.env['QDRANT_COLLECTION_NAME'] || 'documents',
          topK
        }
      }
    )
    throw error
  } finally {
    releaseServiceClient(supabase)
  }
}

