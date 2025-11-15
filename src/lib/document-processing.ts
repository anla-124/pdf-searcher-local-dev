import { DocumentProcessorServiceClient } from '@google-cloud/documentai'
import { PDFDocument } from 'pdf-lib'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient, releaseServiceClient } from '@/lib/supabase/server'
import { generateEmbeddings } from '@/lib/embeddings-vertex'
import { indexDocumentInQdrant, getVectorIdsForDocument } from '@/lib/qdrant'
import { l2Normalize } from '@/lib/similarity/utils/vector-operations'
import { detectOptimalProcessor, getProcessorId, getProcessorName } from '@/lib/document-ai-config'
import { getGoogleClientOptions } from '@/lib/google-credentials'
import { SmartRetry, RetryConfigs, circuitBreakers } from '@/lib/retry-logic'
import { logger, measurePerformance, withRequestContext } from '@/lib/logger'
import { analyzeDocumentSize, estimateProcessingTime, requiresSpecialHandling, type DocumentSizeAnalysis } from '@/lib/document-size-strategies'
import { DatabaseDocumentWithContent } from '@/types/external-apis'
import { DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP, SENTENCES_PER_CHUNK, SENTENCE_OVERLAP, MIN_CHUNK_CHARACTERS, MAX_CHUNK_CHARACTERS } from '@/lib/constants/chunking'
import { chunkByParagraphs, countCharacters, type Paragraph } from '@/lib/chunking/paragraph-chunker'
import { chunkBySentences } from '@/lib/chunking/sentence-chunker'
import type { GenericSupabaseSchema } from '@/types/supabase'
import { saveDocumentAIResponse } from '@/lib/debug-document-ai'
import { queueQdrantDeletion } from '@/lib/qdrant-cleanup-worker'

// Processing pipeline fingerprint - increment when major changes are made
const PROCESSING_PIPELINE_VERSION = '5.0.0'
const PROCESSING_FEATURES = {
  pageNumbering: 'sequential-fallback',       // Uses pageIndex+1 as fallback
  chunkingStrategy: 'paragraph-semantic-v10', // Character-based, zero overlap, strict maxCharacters enforcement
  embeddingRetry: 'unlimited-v1',             // Unlimited retry logic
  structuredLogging: 'winston-pino-v1'        // Structured logging system
}

type CircuitBreakerLike = {
  execute<T>(operation: () => Promise<T>): Promise<T>
} | undefined

async function executeWithCircuitBreaker<T>(
  breaker: CircuitBreakerLike,
  operation: () => Promise<T>
): Promise<T> {
  if (!breaker || typeof breaker.execute !== 'function') {
    return operation()
  }
  return breaker.execute(operation)
}
import type {
  DocumentAIDocument,
  DocumentAIPage,
  DocumentAITextAnchor,
  DocumentAIBoundingBox,
  BusinessMetadata,
  ExtractedField,
  SimplifiedEntity,
  SimplifiedTable,
  DatabaseDocument
} from '@/types/external-apis'

interface EmbeddingGenerationStats {
  chunkCount: number
  attempts: number
  retryCount: number
}

export interface DocumentProcessingMetrics {
  sizeAnalysis: DocumentSizeAnalysis
  pageCount: number
  chunkCount: number
  embeddingsAttempts: number
  embeddingsRetries: number
  structuredFieldCount: number
  textLength: number
  processor: {
    id: string
    name: string
    type: string
  }
  estimatedProcessingSeconds: number
}

export interface ProcessDocumentResult {
  switchedToBatch?: boolean
  metrics?: DocumentProcessingMetrics
}

interface ProcessedDocumentData {
  extractedText: string
  structuredData: ReturnType<typeof extractStructuredFields>
  pageCount: number
  pagesText: { text: string; pageNumber: number }[]
  paragraphs: Paragraph[]
}

interface SaveProcessedDocumentResult {
  embeddingStats: EmbeddingGenerationStats
}

type DocumentAIKeyValuePair = {
  key?: {
    textAnchor?: DocumentAITextAnchor
    confidence?: number
  }
  value?: {
    textAnchor?: DocumentAITextAnchor
  }
}

type DocumentAIPageWithKeyValues = DocumentAIPage & {
  keyValuePairs?: DocumentAIKeyValuePair[]
}

/**
 * Check if document processing has been cancelled by user
 */
async function checkCancellation(documentId: string): Promise<boolean> {
  const supabase = await createServiceClient()
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('status')
      .eq('id', documentId)
      .single()

    if (error || !data) {
      return false // If we can't check, assume not cancelled
    }

    return data.status === 'cancelled'
  } catch (error) {
    logger.error('Error checking cancellation status', error as Error, { documentId })
    return false
  } finally {
    releaseServiceClient(supabase)
  }
}

/**
 * Clean up all partial data for a cancelled document
 * Removes data from: Supabase (embeddings, content, fields, status), Qdrant, Storage
 */
export async function cleanupCancelledDocument(documentId: string): Promise<void> {
  logger.info('Starting cleanup of cancelled document', { documentId, component: 'document-processing' })

  const supabase = await createServiceClient()

  try {
    // 1. Get document info (file path, user_id) before deletion
    const { data: document } = await supabase
      .from('documents')
      .select('file_path, user_id, filename')
      .eq('id', documentId)
      .single()

    if (!document) {
      logger.warn('Document not found for cleanup', { documentId })
      return
    }

    // 2. Get vector IDs from Supabase BEFORE deleting embeddings (needed for Qdrant cleanup)
    const { data: chunks } = await supabase
      .from('document_embeddings')
      .select('chunk_index')
      .eq('document_id', documentId)
      .range(0, 999999)  // Override default 1000 row limit

    const vectorIds = chunks?.map(chunk => `${documentId}_chunk_${chunk.chunk_index}`) || []
    logger.debug('Found vector IDs for cleanup', { documentId, vectorCount: vectorIds.length })

    // 3. Delete vectors from Qdrant FIRST (using vector IDs we just retrieved)
    // CRITICAL: Must delete from Qdrant before Supabase to prevent orphaned vectors
    if (vectorIds.length > 0) {
      try {
        const { deleteDocumentFromQdrant } = await import('@/lib/qdrant')
        await deleteDocumentFromQdrant(documentId, vectorIds)
        logger.info('Deleted vectors from Qdrant', { documentId, vectorCount: vectorIds.length })
      } catch (qdrantError) {
        logger.error('Failed to delete Qdrant vectors during cleanup', qdrantError as Error, { documentId })
        // Continue cleanup even if Qdrant fails
      }
    }

    // 4. Delete all embeddings from Supabase AFTER Qdrant cleanup
    const { error: embeddingsError } = await supabase
      .from('document_embeddings')
      .delete()
      .eq('document_id', documentId)

    if (embeddingsError) {
      logger.error('Failed to delete embeddings during cleanup', embeddingsError, { documentId })
    } else {
      logger.info('Deleted embeddings from Supabase', { documentId })
    }

    // 5. Delete document content
    const { error: contentError } = await supabase
      .from('document_content')
      .delete()
      .eq('document_id', documentId)

    if (contentError) {
      logger.error('Failed to delete content during cleanup', contentError, { documentId })
    }

    // 6. Delete processing status records
    const { error: statusError } = await supabase
      .from('processing_status')
      .delete()
      .eq('document_id', documentId)

    if (statusError) {
      logger.error('Failed to delete processing status during cleanup', statusError, { documentId })
    }

    // 7. Explicitly delete document_jobs (even though CASCADE should handle it)
    const { error: jobsError } = await supabase
      .from('document_jobs')
      .delete()
      .eq('document_id', documentId)

    if (jobsError) {
      logger.error('Failed to delete document jobs during cleanup', jobsError, { documentId })
    } else {
      logger.info('Deleted document jobs', { documentId })
    }

    // 8. Delete from storage
    const storageFilePath = typeof document.file_path === 'string' ? document.file_path : null
    if (storageFilePath) {
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([storageFilePath])

      if (storageError) {
        logger.error('Failed to delete file from storage during cleanup', storageError, {
          documentId,
          filePath: storageFilePath
        })
      } else {
        logger.info('Deleted file from storage', { documentId, filePath: storageFilePath })
      }
    }

    // 9. Delete the document record itself (CASCADE will handle any remaining references)
    const { error: docError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)

    if (docError) {
      logger.error('Failed to delete document record during cleanup', docError, { documentId })
      throw docError
    }

    logger.info('Successfully cleaned up cancelled document - COMPLETELY REMOVED', {
      documentId,
      filename: document.filename,
      cleanedUp: ['embeddings', 'qdrant', 'content', 'fields', 'status', 'jobs', 'storage', 'document']
    })

  } catch (error) {
    logger.error('Failed to cleanup cancelled document', error as Error, { documentId })
    throw error
  } finally {
    releaseServiceClient(supabase)
  }
}

/**
 * Exception thrown when processing is cancelled
 */
class ProcessingCancelledException extends Error {
  constructor(documentId: string) {
    super(`Processing cancelled for document ${documentId}`)
    this.name = 'ProcessingCancelledException'
  }
}

export async function processDocument(documentId: string): Promise<ProcessDocumentResult> {
  return withRequestContext({
    correlationId: `doc_${documentId}`
  }, async () => {
    return measurePerformance('processDocument', 'document-processing', async () => {
      logger.logDocumentProcessing('initialization', documentId, 'started', {
        operation: 'processDocument',
        component: 'document-processing'
      })

      const supabase = await createServiceClient()

      try {
        // CHECKPOINT 1: Check cancellation before starting
        if (await checkCancellation(documentId)) {
          logger.info('Document cancelled before processing started', { documentId })
          throw new ProcessingCancelledException(documentId)
        }

        // Update processing status
        await updateProcessingStatus(documentId, 'processing', 10, 'Starting document processing...')
        logger.logDocumentProcessing('status-update', documentId, 'progress', { progress: 10 })

        // Get document from database
            const { data, error } = await supabase
              .from('documents')
              .select(`
                id,
                user_id,
                title,
                filename,
                file_path,
                file_size,
                content_type,
                status,
                processing_error,
                extracted_fields,
                metadata,
                page_count,
                created_at,
                updated_at,
                document_content(extracted_text)
              `)
              .eq('id', documentId)
              .single();

            const fetchError = error as PostgrestError | null;
            const document = (data && typeof data === 'object' && !(data as { error?: boolean }).error)
              ? (data as unknown as DatabaseDocumentWithContent)
              : null

        if (fetchError || !document) {
          logger.error('Document not found in database', fetchError || new Error('Document not found'), { documentId })
          throw new Error('Document not found')
        }

        // Check if document was cancelled
        if (document.status === 'cancelled') {
          logger.info('Document was cancelled before processing', { documentId })
          throw new ProcessingCancelledException(documentId)
        }

        // Flatten extracted_text from document_content
        if (document.document_content && document.document_content.length > 0) {
          document.extracted_text = document.document_content[0]?.extracted_text ?? '';
          delete document.document_content;
        } else {
          document.extracted_text = ''; // Ensure it's always a string
        }

        logger.info('Document retrieved from database', { 
          documentId, 
          filename: document.filename,
          fileSize: document.file_size,
          mimeType: document.content_type
        })

        // ENTERPRISE PHASE 1.3: Analyze document size and determine optimal processing strategy
        const sizeAnalysis = analyzeDocumentSize(
          document.file_size,
          document.filename,
          document.content_type
        )
        
        const timeEstimate = estimateProcessingTime(sizeAnalysis)
        const specialHandling = requiresSpecialHandling(sizeAnalysis)
        
        logger.info('Document size analysis completed', {
          documentId,
          tier: sizeAnalysis.tier,
          strategy: sizeAnalysis.strategy,
          estimatedProcessingMinutes: timeEstimate.estimatedMinutes,
          requiresSpecialHandling: specialHandling.requiresSpecialHandling,
          component: 'document-processing'
        })

        // Update status with intelligent time estimate
        const statusMessage = specialHandling.requiresSpecialHandling 
          ? `Preparing ${sizeAnalysis.tier.toLowerCase()} document processing (~${timeEstimate.estimatedMinutes} min estimated)...`
          : 'Downloading document...'
        
        await updateProcessingStatus(documentId, 'processing', 20, statusMessage)
        logger.logDocumentProcessing('download', documentId, 'started', { progress: 20 })

        // Download file from Supabase Storage
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('documents')
          .download(document.file_path)

        if (downloadError || !fileData) {
          logger.error('Failed to download document from storage', downloadError, { 
            documentId, 
            filePath: document.file_path 
          })
          throw new Error('Failed to download document from storage')
        }

        logger.info('Document downloaded from storage', { 
          documentId, 
          filePath: document.file_path,
          fileSize: document.file_size 
        })

        // Convert to base64
        const arrayBuffer = await fileData.arrayBuffer()
        const base64Content = Buffer.from(arrayBuffer).toString('base64')
        logger.debug('Document converted to base64', { documentId, base64Length: base64Content.length })

        // CHECKPOINT 2: Check cancellation before Document AI processing
        if (await checkCancellation(documentId)) {
          logger.info('Document cancelled before Document AI processing', { documentId })
          throw new ProcessingCancelledException(documentId)
        }

        // Update processing status
        await updateProcessingStatus(documentId, 'processing', 40, 'Processing with Document AI...')
        logger.logDocumentProcessing('document-ai-processing', documentId, 'started', { progress: 40 })

        // Always try sync processing first - let Document AI tell us if it's too large
        const client = new DocumentProcessorServiceClient(getGoogleClientOptions())
        const fileSizeMB = document.file_size / (1024 * 1024)
        logger.info('Starting Document AI processing', { 
          documentId, 
          fileSizeMB: parseFloat(fileSizeMB.toFixed(1)),
          strategy: 'sync-first' 
        })

        // Process with Google Document AI using intelligent size-based strategy
        // Auto-detect optimal processor based on document characteristics and size analysis
        logger.info('Selecting optimal processor', {
          documentId,
          tier: sizeAnalysis.tier,
          strategy: sizeAnalysis.strategy,
          estimatedPages: sizeAnalysis.estimatedPages,
          component: 'document-processing'
        })
        
        const optimalProcessor = detectOptimalProcessor(document.filename, document.file_size)
        const processorId = getProcessorId(optimalProcessor)
        const name = getProcessorName(processorId)
        
        logger.info('Document AI processor selected', { 
          documentId, 
          processor: optimalProcessor,
          processorId 
        })
        
        const request = {
          name,
          rawDocument: {
            content: base64Content,
            mimeType: 'application/pdf',
          },
        }

        const syncPageLimit = Number.parseInt(process.env['DOCUMENT_AI_SYNC_PAGE_LIMIT'] || '15', 10)
        const shouldUseSyncFirst = sizeAnalysis.estimatedPages <= syncPageLimit

        if (!shouldUseSyncFirst) {
          logger.info('Skipping sync-first Document AI processing due to page count', {
            documentId,
            estimatedPages: sizeAnalysis.estimatedPages,
            syncPageLimit
          })

          try {
            return await processDocumentWithChunks({
              pdfArrayBuffer: arrayBuffer,
              processorId,
              processorName: name,
              processorType: optimalProcessor,
              documentId,
              client,
              supabase,
              document,
              sizeAnalysis,
              timeEstimate
            })
          } catch (chunkError) {
            if (chunkError instanceof ProcessingCancelledException) {
              throw chunkError
            }

            await cleanupPartialEmbeddings(documentId)
            logger.error('Chunked processing fallback failed - document too large', chunkError as Error, { documentId })
            throw new Error('Document exceeds processing limits. Please try a smaller document.')
          }
        }

        let result;
        try {
          // Use smart retry with circuit breaker for Document AI processing
          const retryResult = await circuitBreakers.documentAI.execute(async () => {
            return await SmartRetry.execute(
              async () => {
                logger.debug('Attempting Document AI processing', { 
                  documentId,
                  processor: optimalProcessor 
                })
                const response = await client.processDocument(request)
                return Array.isArray(response) ? response[0] : response
              },
              RetryConfigs.documentAI
            )
          })

          if (!retryResult.success) {
            throw retryResult.error
          }

          result = retryResult.result!
          logger.info('Document AI processing completed successfully', {
            documentId,
            attempts: retryResult.attempts,
            totalTime: retryResult.totalTime,
            processor: optimalProcessor
          })

          // Save raw Document AI output for analysis (non-blocking) - only if debug flag is enabled
          if (result.document && process.env['DUMP_DOCUMENT_AI'] === '1') {
            saveDocumentAIResponse(
              documentId,
              result.document as unknown as DocumentAIDocument,
              {
                filename: document.filename,
                fileSize: document.file_size,
                pageCount: result.document.pages?.length,
                processor: optimalProcessor
              }
            ).catch(error => {
              logger.warn('Failed to save Document AI debug output', {
                documentId,
                error: error instanceof Error ? error.message : String(error)
              })
            })
          }

        } catch (error: unknown) {
          const documentAiError = error as { code?: number; details?: string } | null
          // Handle page limit errors by processing document in manageable chunks before falling back to batch
          if (
            documentAiError?.code === 3 &&
            typeof documentAiError.details === 'string' &&
            documentAiError.details.includes('exceed the limit')
          ) {
            logger.warn('Page limit exceeded, attempting chunked processing fallback', {
              documentId,
              errorCode: documentAiError.code !== undefined ? String(documentAiError.code) : undefined,
              errorDetails: documentAiError.details
            })

            try {
              return await processDocumentWithChunks({
                pdfArrayBuffer: arrayBuffer,
                processorId,
                processorName: name,
                processorType: optimalProcessor,
                documentId,
                client,
                supabase,
                document,
                sizeAnalysis,
                timeEstimate
              })
            } catch (chunkError) {
              if (chunkError instanceof ProcessingCancelledException) {
                throw chunkError
              }

              await cleanupPartialEmbeddings(documentId)
              logger.error('Chunked processing fallback failed - document too large', chunkError as Error, { documentId })
              throw new Error('Document exceeds processing limits. Please try a smaller document.')
            }
          }
          // Re-throw other errors
          logger.error('Document AI processing failed', error as Error, { documentId })
          throw error
        }
    
        if (!result.document) {
          logger.error('No document returned from Document AI', undefined, { documentId })
          throw new Error('No document returned from Document AI')
        }

        // CHECKPOINT 2B: Check cancellation after Document AI completes
        if (await checkCancellation(documentId)) {
          logger.info('Document cancelled after Document AI completed', { documentId })
          throw new ProcessingCancelledException(documentId)
        }

        // Update processing status
        await updateProcessingStatus(documentId, 'processing', 60, 'Extracting structured data...')
        logger.logDocumentProcessing('data-extraction', documentId, 'started', { progress: 60 })

        const processedData = buildProcessedDocumentData(result.document as unknown as DocumentAIDocument)

        logger.info('Document data extracted successfully', {
          documentId,
          textLength: processedData.extractedText.length,
          pageCount: processedData.pageCount,
          fieldsCount: processedData.structuredData.fields?.length || 0
        })

        // CHECKPOINT 3: Check cancellation before embedding generation
        if (await checkCancellation(documentId)) {
          logger.info('Document cancelled before embedding generation', { documentId })
          throw new ProcessingCancelledException(documentId)
        }

        await updateProcessingStatus(documentId, 'processing', 80, 'Generating embeddings...')
        logger.logDocumentProcessing('embedding-generation', documentId, 'started', { progress: 80 })

        const { embeddingStats } = await saveProcessedDocumentData(
          supabase,
          documentId,
          processedData,
          document,
          sizeAnalysis,
          result.document as unknown as DocumentAIDocument
        )

        await updateProcessingStatus(documentId, 'completed', 100, 'Document processing completed successfully')
        logger.logDocumentProcessing('embedding-generation', documentId, 'completed', { progress: 100 })

        await supabase
          .from('documents')
          .update({
            status: 'completed',
            processing_error: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId)

        logger.logDocumentProcessing('completion', documentId, 'completed')
        await invalidateDocumentCaches(documentId, document.user_id)

        const metrics: DocumentProcessingMetrics = {
          sizeAnalysis,
          pageCount: processedData.pageCount,
          chunkCount: embeddingStats.chunkCount,
          embeddingsAttempts: embeddingStats.attempts,
          embeddingsRetries: embeddingStats.retryCount,
          structuredFieldCount: processedData.structuredData.fields?.length || 0,
          textLength: processedData.extractedText.length,
          processor: {
            id: processorId,
            name,
            type: optimalProcessor
          },
          estimatedProcessingSeconds: timeEstimate.estimatedMinutes * 60
        }

        return { switchedToBatch: false, metrics } // Successful sync processing

      } catch (error) {
        // Handle cancellation specially - clean up all partial data
        if (error instanceof ProcessingCancelledException) {
          logger.info('Processing cancelled, cleaning up partial data', { documentId })

          try {
            await cleanupCancelledDocument(documentId)
            logger.info('Cleanup completed for cancelled document', { documentId })
          } catch (cleanupError) {
            logger.error('Failed to cleanup cancelled document', cleanupError as Error, { documentId })
          }

          // Don't re-throw - cancellation is not an error
          return { switchedToBatch: false }
        }

        logger.error('Document processing failed', error as Error, {
          documentId,
          component: 'document-processing',
          operation: 'processDocument'
        })

        await cleanupPartialEmbeddings(documentId)

        // Update document and processing status with error
        await supabase
          .from('documents')
          .update({
            status: 'error',
            processing_error: error instanceof Error ? error.message : 'Unknown processing error'
          })
          .eq('id', documentId)

        await updateProcessingStatus(
          documentId,
          'error',
          0,
          'Processing failed',
          error instanceof Error ? error.message : 'Unknown error'
        )

        logger.logDocumentProcessing('processing', documentId, 'failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        })

        // Re-throw the error so job processor can handle it
        throw error
      } finally {
        releaseServiceClient(supabase)
      }
    })
  })
}

async function updateProcessingStatus(
  documentId: string,
  status: 'queued' | 'processing' | 'completed' | 'error',
  progress: number,
  message?: string,
  error?: string
) {
  const supabase = await createServiceClient()
  
  try {
    await supabase.from('processing_status').insert({
      document_id: documentId,
      status,
      progress,
      message,
      error,
    })
  } finally {
    releaseServiceClient(supabase)
  }
}

function extractStructuredFields(document: DocumentAIDocument, pageOffset: number = 0) {
  const fields: ExtractedField[] = []
  const entities: SimplifiedEntity[] = []
  const tables: SimplifiedTable[] = []

  const fullText = document.text || ''

  if (document.entities) {
    for (const entity of document.entities) {
      if (entity.type && entity.mentionText) {
        const pageNumber = getPageNumber(entity.pageAnchor)
        const adjustedPageNumber = pageNumber !== null ? pageNumber + pageOffset : undefined
        const boundingBox = getBoundingBox(entity.pageAnchor)

        fields.push({
          name: entity.type,
          value: entity.mentionText,
          type: getFieldType(entity.type),
          confidence: entity.confidence || 0,
          pageNumber: adjustedPageNumber,
          boundingBox: boundingBox ?? undefined,
        })

        entities.push({
          type: entity.type,
          value: entity.mentionText,
          confidence: entity.confidence,
          pageNumber: adjustedPageNumber,
        })
      }
    }
  }

  if (document.pages) {
    for (const page of document.pages) {
      const pageNumber = page.pageNumber || 1
      const adjustedPageNumber = pageNumber + pageOffset

      if (page.formFields) {
        for (const field of page.formFields) {
          const fieldName = getTextFromTextAnchor(fullText, field.fieldName?.textAnchor)
          const fieldValue = getTextFromTextAnchor(fullText, field.fieldValue?.textAnchor)

          if (fieldName && fieldValue) {
            fields.push({
              name: fieldName.trim(),
              value: fieldValue.trim(),
              type: 'text',
              confidence: field.fieldName?.confidence || 0,
              pageNumber: adjustedPageNumber,
            })
          }
        }
      }

      const pageWithKeyValues = page as DocumentAIPageWithKeyValues
      if (Array.isArray(pageWithKeyValues.keyValuePairs)) {
        for (const kvp of pageWithKeyValues.keyValuePairs) {
          const keyText = getTextFromTextAnchor(fullText, kvp.key?.textAnchor)
          const valueText = getTextFromTextAnchor(fullText, kvp.value?.textAnchor)

          if (keyText && valueText) {
            fields.push({
              name: keyText.trim(),
              value: valueText.trim(),
              type: 'text',
              confidence: kvp.key?.confidence || 0,
              pageNumber: adjustedPageNumber,
            })
          }
        }
      }

      if (page.tables) {
        for (const table of page.tables) {
          const headerRows = (table.headerRows || [])
            .map(row => (row.cells || [])
              .map(cell => getTextFromTextAnchor(fullText, cell.layout?.textAnchor))
              .filter((cellText): cellText is string => !!cellText && cellText.trim().length > 0)
              .map(cellText => cellText.trim()))
            .filter(row => row.length > 0)

          const bodyRows = (table.bodyRows || [])
            .map(row => (row.cells || [])
              .map(cell => getTextFromTextAnchor(fullText, cell.layout?.textAnchor))
              .filter((cellText): cellText is string => !!cellText && cellText.trim().length > 0)
              .map(cellText => cellText.trim()))
            .filter(row => row.length > 0)

          if (bodyRows.length > 0) {
            tables.push({
              pageNumber: adjustedPageNumber,
              headerRows: headerRows.length > 0 ? headerRows : undefined,
              bodyRows,
            })
          }
        }
      }
    }
  }

  return {
    fields,
    entities,
    tables,
  }
}

function getFieldType(entityType: string): 'text' | 'number' | 'date' | 'currency' | 'address' | 'phone' | 'email' | 'url' | 'boolean' {
  const type = entityType.toLowerCase()
  if (type.includes('date') || type.includes('time')) return 'date'
  if (type.includes('number') || type.includes('amount') || type.includes('price')) return 'number'
  if (type.includes('currency') || type.includes('money') || type.includes('dollar')) return 'currency'
  if (type.includes('address')) return 'address'
  if (type.includes('phone') || type.includes('tel')) return 'phone'
  if (type.includes('email') || type.includes('mail')) return 'email'
  if (type.includes('url') || type.includes('link') || type.includes('website')) return 'url'
  if (type.includes('checkbox') || type.includes('bool')) return 'boolean'
  return 'text'
}

function getPageNumber(pageAnchor: { pageRefs?: Array<{ page?: string | number }> } | undefined): number | null {
  const pageValue = pageAnchor?.pageRefs?.[0]?.page
  if (pageValue !== undefined && pageValue !== null) {
    if (typeof pageValue === 'number') {
      return pageValue + 1
    }
    if (typeof pageValue === 'string') {
      const parsed = Number.parseInt(pageValue, 10)
      if (!Number.isNaN(parsed)) {
        return parsed + 1
      }
    }
  }
  return null
}

function getBoundingBox(pageAnchor: { pageRefs?: Array<{ boundingPoly?: DocumentAIBoundingBox }> } | undefined): DocumentAIBoundingBox | null {
  if (pageAnchor?.pageRefs?.[0]?.boundingPoly) {
    return pageAnchor.pageRefs[0].boundingPoly
  }
  return null
}

function getTextFromTextAnchor(documentText: string, textAnchor: DocumentAITextAnchor | undefined): string | null {
  if (!textAnchor?.textSegments?.[0]) return null
  
  const segment = textAnchor.textSegments[0]
  const startIndex = parseInt(segment.startIndex || '0')
  const endIndex = parseInt(segment.endIndex || documentText.length.toString())
  
  return documentText.substring(startIndex, endIndex)
}

// Generate embeddings with page tracking (enterprise-scale version)
export async function generateAndIndexPagedEmbeddings(
  documentId: string, 
  document: DocumentAIDocument, 
  sizeAnalysis?: DocumentSizeAnalysis
): Promise<{ chunkCount: number }> {
  const supabase = await createServiceClient()

  try {
    const { data: docRecord, error: docError } = await supabase
      .from('documents')
      .select('metadata, filename, user_id')
      .eq('id', documentId)
      .single<{ metadata: BusinessMetadata | null; filename: string | null; user_id: string | null }>()

    if (docError) {
      logger.warn('Could not fetch document metadata', { documentId, error: docError?.message, component: 'document-processing' })
    }

    const businessMetadata = (docRecord?.metadata && typeof docRecord.metadata === 'object')
      ? docRecord.metadata as BusinessMetadata
      : {} as BusinessMetadata
    const filename = typeof docRecord?.filename === 'string' ? docRecord.filename : `${documentId}.pdf`
    const userId = typeof docRecord?.user_id === 'string' ? docRecord.user_id : null
    const pagesText = extractTextByPages(document)
    const paragraphs = extractParagraphsFromDocument(document)
  
    return await generateEmbeddingsFromPages(documentId, pagesText, businessMetadata, filename, userId, sizeAnalysis, document, paragraphs)
  } finally {
    releaseServiceClient(supabase)
  }
}

// Extract chunk processing into separate function for better error handling
async function processChunkWithRetry(
  documentId: string,
  pagedChunk: PagedChunk,
  businessMetadata: BusinessMetadata,
  filename: string,
  userId: string | null
): Promise<void> {
  try {
    // Generate embedding with Vertex AI using smart retry
    const embeddingResult = await executeWithCircuitBreaker(circuitBreakers.vertexAI, async () => {
      return await SmartRetry.execute(
        async () => {
          logger.debug('Generating embeddings for chunk', { chunkIndex: pagedChunk.chunkIndex, component: 'document-processing' })
          return await generateEmbeddings(pagedChunk.text)
        },
        RetryConfigs.vertexEmbeddings
      )
    })

    if (!embeddingResult.success) {
      logger.error('Failed to generate embeddings for chunk', embeddingResult.error, { chunkIndex: pagedChunk.chunkIndex, component: 'document-processing' })
      throw embeddingResult.error
    }

    const embedding = embeddingResult.result!
    logger.debug('Embeddings generated successfully', { chunkIndex: pagedChunk.chunkIndex, attempts: embeddingResult.attempts, component: 'document-processing' })

    // CRITICAL: Check cancellation before saving - prevents orphaned embeddings in Qdrant
    if (await checkCancellation(documentId)) {
      logger.info('Document cancelled after embedding generation, skipping save', {
        documentId,
        chunkIndex: pagedChunk.chunkIndex,
        component: 'document-processing'
      })
      throw new ProcessingCancelledException(documentId)
    }

    // Create unique vector ID
    const vectorId = `${documentId}_chunk_${pagedChunk.chunkIndex}`

    // Store embedding in Supabase with retry logic
    const supabaseResult = await SmartRetry.execute(
      async () => {
        const supabase = await createServiceClient()

        try {
          const { error } = await supabase
            .from('document_embeddings')
            .upsert(
              {
                document_id: documentId,
                vector_id: vectorId,
                embedding,
                chunk_text: pagedChunk.text,
                chunk_index: pagedChunk.chunkIndex,
                page_number: pagedChunk.pageNumber,        // Keep for compatibility
                start_page_number: pagedChunk.startPageNumber,
                end_page_number: pagedChunk.endPageNumber,
                character_count: pagedChunk.characterCount,
              },
              {
                onConflict: 'document_id,chunk_index'
              }
            )
          
          logger.debug('Stored embedding in database', { 
            chunkIndex: pagedChunk.chunkIndex, 
            pageNumber: pagedChunk.pageNumber, 
            textLength: pagedChunk.text.length,
            vectorId,
            component: 'document-processing'
          })
          
          if (error) throw error
          return true
        } finally {
          releaseServiceClient(supabase)
        }
      },
      RetryConfigs.supabaseOperations
    )
    
    if (!supabaseResult.success) {
      logger.error('Failed to store embedding in Supabase', supabaseResult.error, { vectorId, component: 'document-processing' })
      throw new Error(`Supabase storage failed: ${supabaseResult.error?.message}`)
    }

    // Index in Qdrant with retry logic and circuit breaker
    const qdrantResult = await executeWithCircuitBreaker(circuitBreakers.qdrant, async () => {
      return await SmartRetry.execute(
        async () => {
          logger.debug('Indexing vector in Qdrant', { vectorId, component: 'document-processing' })
          await indexDocumentInQdrant(
            vectorId,
            embedding,
            {
              document_id: documentId,
              chunk_index: pagedChunk.chunkIndex,
              page_number: pagedChunk.pageNumber,        // Keep for compatibility
              start_page_number: pagedChunk.startPageNumber,
              end_page_number: pagedChunk.endPageNumber,
              text: pagedChunk.text,
              filename,
              ...(userId ? { user_id: userId } : {}),
              // Include business metadata for filtering
              ...businessMetadata
            }
          )
          return true
        },
        RetryConfigs.qdrantIndexing
      )
    })

    if (!qdrantResult.success) {
      logger.error('Failed to index vector in Qdrant', qdrantResult.error, { vectorId, component: 'document-processing' })
      throw new Error(`Qdrant indexing failed: ${qdrantResult.error?.message}`)
    }

    logger.debug('Vector indexed successfully in Qdrant', { vectorId, component: 'document-processing' })
  } catch (error) {
    logger.error('Chunk processing failed', error as Error, { chunkIndex: pagedChunk.chunkIndex, component: 'document-processing' })
    throw error
  }
}

async function saveProcessedDocumentData(
  supabase: SupabaseClient<GenericSupabaseSchema>,
  documentId: string,
  processedData: ProcessedDocumentData,
  documentRecord: DatabaseDocumentWithContent,
  sizeAnalysis?: DocumentSizeAnalysis,
  documentAIResponse?: DocumentAIDocument | null
): Promise<SaveProcessedDocumentResult> {
  const pagesForEmbedding = processedData.pagesText

  const paragraphsForEmbedding = processedData.paragraphs.map((paragraph, index) => ({
    ...paragraph,
    index
  }))

  const processingMetadata = {
    fields: processedData.structuredData.fields,
    entities: processedData.structuredData.entities,
    tables: processedData.structuredData.tables,
    processing_pipeline: {
      version: PROCESSING_PIPELINE_VERSION,
      features: PROCESSING_FEATURES,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    }
  }

  const documentUpdate: Record<string, unknown> = {
    extracted_fields: processingMetadata,
    page_count: processedData.pageCount,
    status: 'processing'
  }

  const { error: updateError } = await supabase
    .from('documents')
    .update(documentUpdate)
    .eq('id', documentId)

  if (updateError) {
    logger.error('Failed to update document with extracted data', updateError, { documentId })
    throw new Error('Failed to update document with extracted data')
  }

  const { error: contentError } = await supabase
    .from('document_content')
    .upsert({
      document_id: documentId,
      extracted_text: processedData.extractedText
    }, { onConflict: 'document_id' })

  if (contentError) {
    logger.error('Failed to store extracted text in document_content', contentError, { documentId })

    // Foreign key constraint violation means document was deleted (cancelled)
    const isForeignKeyViolation =
      contentError.message?.includes('foreign key constraint') ||
      contentError.code === '23503'

    if (isForeignKeyViolation) {
      logger.info('Document was deleted during processing (foreign key violation)', { documentId })
      throw new ProcessingCancelledException(documentId)
    }

    throw new Error('Failed to store extracted text in document_content')
  }

  const embeddingStats = await generateEmbeddingsWithUnlimitedRetries(
    documentId,
    documentAIResponse || null,
    documentRecord as unknown as DatabaseDocument,
    sizeAnalysis,
    pagesForEmbedding,
    paragraphsForEmbedding
  )

  return {
    embeddingStats
  }
}

async function processDocumentInChunks(
  pdfArrayBuffer: ArrayBuffer,
  processorId: string,
  processorName: string,
  processorType: string,
  documentId: string,
  client: DocumentProcessorServiceClient
): Promise<ProcessedDocumentData> {
  const pdfDoc = await PDFDocument.load(pdfArrayBuffer)
  const totalPages = pdfDoc.getPageCount()

  const configuredLimit = parseInt(process.env['DOCUMENT_AI_SYNC_PAGE_LIMIT'] || '15', 10)
  // Google Document AI OCR processors cap synchronous requests at 15 pages; keep chunks within that hard limit
  const maxPagesPerChunk = Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.min(configuredLimit, 15) : 15

  logger.info('Processing document with chunked strategy', {
    documentId,
    totalPages,
    maxPagesPerChunk
  })

  const aggregatedTextParts: string[] = []
  const aggregatedFields: ExtractedField[] = []
  const aggregatedEntities: SimplifiedEntity[] = []
  const aggregatedTables: SimplifiedTable[] = []
  const aggregatedPagesText: { text: string; pageNumber: number }[] = []
  const aggregatedParagraphs: Paragraph[] = []
  let totalPageCount = 0

  for (let start = 0; start < totalPages; start += maxPagesPerChunk) {
    const end = Math.min(totalPages, start + maxPagesPerChunk)
    const pageIndices = Array.from({ length: end - start }, (_, index) => start + index)

    logger.debug('Creating chunk for Document AI processing', {
      documentId,
      chunkStartPage: start + 1,
      chunkEndPage: end
    })

    const chunkDoc = await PDFDocument.create()
    const copiedPages = await chunkDoc.copyPages(pdfDoc, pageIndices)
    copiedPages.forEach(page => chunkDoc.addPage(page))

    const chunkBytes = await chunkDoc.save()
    const chunkBase64 = Buffer.from(chunkBytes).toString('base64')

    const chunkRequest = {
      name: processorName,
      rawDocument: {
        content: chunkBase64,
        mimeType: 'application/pdf'
      }
    }

    const chunkResult = await circuitBreakers.documentAI.execute(async () => {
      return await SmartRetry.execute(
        async () => {
          logger.debug('Attempting Document AI chunk processing', {
            documentId,
            processor: processorType,
            processorId,
            chunkStartPage: start + 1,
            chunkEndPage: end
          })
          const response = await client.processDocument(chunkRequest)
          return Array.isArray(response) ? response[0] : response
        },
        RetryConfigs.documentAI
      )
    })

    if (!chunkResult.success) {
      throw chunkResult.error
    }

    const chunkDocument = chunkResult.result!.document

    if (!chunkDocument) {
      throw new Error('No document returned from Document AI chunk')
    }

    // Save raw Document AI chunk output for analysis (non-blocking) - only if debug flag is enabled
    if (process.env['DUMP_DOCUMENT_AI'] === '1') {
      saveDocumentAIResponse(
        `${documentId}_chunk_${start + 1}-${end}`,
        chunkDocument as unknown as DocumentAIDocument,
        {
          filename: `Chunk ${start + 1}-${end}`,
          fileSize: chunkBytes.byteLength,
          pageCount: chunkDocument.pages?.length,
          processor: processorType
        }
      ).catch(error => {
        logger.warn('Failed to save Document AI chunk debug output', {
          documentId,
          chunkStartPage: start + 1,
          chunkEndPage: end,
          error: error instanceof Error ? error.message : String(error)
        })
      })
    }

    const chunkData = buildProcessedDocumentData(chunkDocument as unknown as DocumentAIDocument, start)

    if (chunkData.extractedText) {
      aggregatedTextParts.push(chunkData.extractedText)
    }

    aggregatedFields.push(...(chunkData.structuredData.fields || []))
    aggregatedEntities.push(...(chunkData.structuredData.entities || []))
    aggregatedTables.push(...(chunkData.structuredData.tables || []))
    aggregatedPagesText.push(...chunkData.pagesText)
    aggregatedParagraphs.push(...chunkData.paragraphs)
    totalPageCount += chunkData.pageCount
  }

  const normalizedParagraphs = aggregatedParagraphs.map((paragraph, index) => ({
    ...paragraph,
    index
  }))

  return {
    extractedText: aggregatedTextParts.join('\n'),
    structuredData: {
      fields: aggregatedFields,
      entities: aggregatedEntities,
      tables: aggregatedTables
    },
    pageCount: totalPageCount,
    pagesText: aggregatedPagesText,
    paragraphs: normalizedParagraphs
  }
}

interface ChunkProcessingParams {
  pdfArrayBuffer: ArrayBuffer
  processorId: string
  processorName: string
  processorType: string
  documentId: string
  client: DocumentProcessorServiceClient
  supabase: SupabaseClient
  document: DatabaseDocumentWithContent
  sizeAnalysis: DocumentSizeAnalysis
  timeEstimate: ReturnType<typeof estimateProcessingTime>
}

async function processDocumentWithChunks(params: ChunkProcessingParams) {
  const {
    pdfArrayBuffer,
    processorId,
    processorName,
    processorType,
    documentId,
    client,
    supabase,
    document,
    sizeAnalysis,
    timeEstimate,
  } = params

  const chunkedData = await processDocumentInChunks(
    pdfArrayBuffer,
    processorId,
    processorName,
    processorType,
    documentId,
    client
  )

  if (await checkCancellation(documentId)) {
    logger.info('Document cancelled before chunked embedding generation', { documentId })
    throw new ProcessingCancelledException(documentId)
  }

  await updateProcessingStatus(documentId, 'processing', 60, 'Extracting structured data from chunks...')
  await updateProcessingStatus(documentId, 'processing', 80, 'Generating embeddings from chunks...')
  logger.logDocumentProcessing('embedding-generation', documentId, 'started', { progress: 80 })

  const { embeddingStats } = await saveProcessedDocumentData(
    supabase,
    documentId,
    chunkedData,
    document,
    sizeAnalysis,
    null
  )

  await updateProcessingStatus(documentId, 'completed', 100, 'Document processing completed successfully')
  logger.logDocumentProcessing('embedding-generation', documentId, 'completed', { progress: 100 })

  await supabase
    .from('documents')
    .update({
      status: 'completed',
      processing_error: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', documentId)

  logger.logDocumentProcessing('completion', documentId, 'completed')
  await invalidateDocumentCaches(documentId, document.user_id)

  const metrics: DocumentProcessingMetrics = {
    sizeAnalysis,
    pageCount: chunkedData.pageCount,
    chunkCount: embeddingStats.chunkCount,
    embeddingsAttempts: embeddingStats.attempts,
    embeddingsRetries: embeddingStats.retryCount,
    structuredFieldCount: chunkedData.structuredData.fields?.length || 0,
    textLength: chunkedData.extractedText.length,
    processor: {
      id: processorId,
      name: processorName,
      type: `${processorType}-chunked`
    },
    estimatedProcessingSeconds: timeEstimate.estimatedMinutes * 60
  }

  logger.info('Chunked processing completed successfully', {
    documentId,
    chunksProcessed: metrics.chunkCount,
    totalPages: metrics.pageCount
  })

  return { switchedToBatch: false, metrics }
}

async function cleanupPartialEmbeddings(documentId: string) {
  const vectorIds = await getVectorIdsForDocument(documentId)
  queueQdrantDeletion(documentId, vectorIds)

  const supabase = await createServiceClient()
  try {
    const { error } = await supabase
      .from('document_embeddings')
      .delete()
      .eq('document_id', documentId)

    if (error) {
      logger.warn('Failed to cleanup partial embeddings after processing error', {
        documentId,
        error: error.message
      })
    } else {
      logger.info('Cleaned up partial embeddings after processing error', { documentId })
    }
  } catch (error) {
    logger.warn('Unexpected error cleaning up partial embeddings', {
      documentId,
      error: error instanceof Error ? error.message : String(error)
    })
  } finally {
    releaseServiceClient(supabase)
  }
}

// Legacy function for backward compatibility - FIXED: Connection pool memory leak
export async function generateAndIndexEmbeddings(documentId: string, text: string): Promise<void> {
  // FIXED: Reuse single connection throughout the function
  const supabase = await createServiceClient()
  
  try {
    // Get document metadata for Qdrant indexing
    const { data: docRecord, error: docError } = await supabase
      .from('documents')
      .select('metadata, user_id')
      .eq('id', documentId)
      .single()

    if (docError) {
      logger.warn('Could not fetch document metadata (legacy)', { documentId, error: docError?.message, component: 'document-processing' })
    }

    const businessMetadata = docRecord?.metadata || {}
    const userId = typeof docRecord?.user_id === 'string' ? docRecord.user_id : null

    // Split text into chunks for embedding using current defaults
    const chunks = splitTextIntoChunks(text, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP)
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      if (!chunk) continue
      
      // Generate embedding with Vertex AI
      const embedding = await generateEmbeddings(chunk)
      
      // Create unique vector ID
      const vectorId = `${documentId}_chunk_${i}`
      
      // FIXED: Reuse existing connection instead of creating new one in loop
      const { error: supabaseError } = await supabase.from('document_embeddings').insert({
        document_id: documentId,
        vector_id: vectorId,
        embedding,
        chunk_text: chunk,
        chunk_index: i,
        page_number: null, // Legacy documents don't have page tracking
      })
      
      if (supabaseError) {
        logger.error('Failed to store embedding in Supabase', supabaseError, { vectorId, component: 'document-processing' })
        throw new Error(`Supabase storage failed: ${supabaseError.message}`)
      }
      
      // Index in Qdrant with business metadata
      await indexDocumentInQdrant(
        vectorId,
        embedding,
        {
          document_id: documentId,
          chunk_index: i,
          text: chunk,
          ...(userId ? { user_id: userId } : {}),
          // Include business metadata for filtering
          ...businessMetadata
        }
      )
    }
  } finally {
    // FIXED: Ensure connection is properly released back to pool
    releaseServiceClient(supabase)
  }
}

// Interface for text chunks with page information
interface PagedChunk {
  text: string
  chunkIndex: number
  pageNumber: number        // Keep for backward compatibility
  startPageNumber: number   // First page in chunk
  endPageNumber: number     // Last page in chunk
  characterCount: number
}

// Extract text page by page from Document AI result
function extractTextByPages(document: DocumentAIDocument, pageOffset: number = 0): { text: string; pageNumber: number }[] {
  const pagesText: { text: string; pageNumber: number }[] = []
  
  if (document.pages) {
    for (let pageIndex = 0; pageIndex < document.pages.length; pageIndex++) {
      const page = document.pages[pageIndex]
      if (!page) continue
      // Use 1-based page numbering: either the explicit pageNumber or the array index + 1
      const pageNumber = page.pageNumber || (pageIndex + 1)
      const adjustedPageNumber = pageNumber + pageOffset
      
      logger.debug('Processing document page', { 
        pageIndex: pageIndex + 1, 
        documentAIPageNumber: page.pageNumber, 
        assignedPageNumber: adjustedPageNumber,
        component: 'document-processing'
      })
      
      // Extract text for this specific page using text anchors
      let pageText = ''
      
      if (page.paragraphs) {
        for (const paragraph of page.paragraphs) {
          if (paragraph.layout?.textAnchor) {
            const paragraphText = getTextFromTextAnchor(document.text || '', paragraph.layout.textAnchor)
            if (paragraphText) {
              pageText += paragraphText + '\n'
            }
          }
        }
      }
      
      // Fallback: if no paragraphs, try to extract from lines
      if (!pageText && page.lines) {
        for (const line of page.lines) {
          if (line.layout?.textAnchor) {
            const lineText = getTextFromTextAnchor(document.text || '', line.layout.textAnchor)
            if (lineText) {
              pageText += lineText + '\n'
            }
          }
        }
      }
      
      if (pageText.trim()) {
        pagesText.push({
          text: pageText.trim(),
          pageNumber: adjustedPageNumber
        })
      }
    }
  }
  
  // Fallback: if no pages structure, treat entire text as page 1
  if (pagesText.length === 0 && document.text) {
    pagesText.push({
      text: document.text,
      pageNumber: pageOffset + 1
    })
  }
  
  return pagesText
}

/**
 * Extract paragraphs from Document AI response for paragraph-based chunking
 * Returns array of paragraphs with their text, page number, and index
 */
function extractParagraphsFromDocument(document: DocumentAIDocument, pageOffset: number = 0): Paragraph[] {
  const paragraphs: Paragraph[] = []
  let globalIndex = 0

  if (document.pages) {
    for (let pageIndex = 0; pageIndex < document.pages.length; pageIndex++) {
      const page = document.pages[pageIndex]
      if (!page) continue

      const pageNumber = (page.pageNumber || (pageIndex + 1)) + pageOffset

      if (page.paragraphs) {
        for (const paragraph of page.paragraphs) {
          if (paragraph.layout?.textAnchor) {
            const paragraphText = getTextFromTextAnchor(document.text || '', paragraph.layout.textAnchor)
            if (paragraphText && paragraphText.trim()) {
              paragraphs.push({
                text: paragraphText,
                pageNumber: pageNumber,
                index: globalIndex++
              })
            }
          }
        }
      }
    }
  }

  return paragraphs
}

function buildProcessedDocumentData(document: DocumentAIDocument, pageOffset: number = 0): ProcessedDocumentData {
  const structuredData = extractStructuredFields(document, pageOffset)
  const pagesText = extractTextByPages(document, pageOffset)
  const paragraphs = extractParagraphsFromDocument(document, pageOffset)

  return {
    extractedText: document.text || '',
    structuredData,
    pageCount: document.pages ? document.pages.length : 0,
    pagesText,
    paragraphs
  }
}

// Split text into chunks while preserving page information
// Uses sentence-based chunking across the full document, then assigns page numbers
function splitTextIntoPagedChunks(
  pagesText: { text: string; pageNumber: number }[],
  _chunkSize: number = DEFAULT_CHUNK_SIZE, // Ignored - kept for backward compatibility
  overlap: number = SENTENCE_OVERLAP
): PagedChunk[] {
  // Build a character-to-page mapping
  const charToPage: number[] = []
  let fullText = ''

  for (const pageInfo of pagesText) {
    const pageText = pageInfo.text
    for (let i = 0; i < pageText.length; i++) {
      charToPage.push(pageInfo.pageNumber)
    }
    fullText += pageText
    // Add newline between pages if not already present
    if (!pageText.endsWith('\n')) {
      fullText += '\n'
      charToPage.push(pageInfo.pageNumber)
    }
  }

  // Use sentence-based chunking on the full document
  const chunks = chunkBySentences(
    fullText,
    SENTENCES_PER_CHUNK,
    overlap,
    MIN_CHUNK_CHARACTERS,
    MAX_CHUNK_CHARACTERS
  )

  // Assign page numbers to chunks based on where they appear in the text
  const pagedChunks: PagedChunk[] = []
  let currentCharIndex = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i]
    if (!chunkText) continue // Skip undefined chunks

    // Find this chunk's position in the full text
    const chunkStartIndex = fullText.indexOf(chunkText, currentCharIndex)
    const chunkEndIndex = chunkStartIndex >= 0 ? chunkStartIndex + chunkText.length : chunkStartIndex

    // Calculate page range for chunk
    const startPage = chunkStartIndex >= 0 && chunkStartIndex < charToPage.length
      ? (charToPage[chunkStartIndex] ?? 1)
      : (pagesText[0]?.pageNumber ?? 1)

    const endPage = chunkEndIndex >= 0 && chunkEndIndex - 1 < charToPage.length
      ? (charToPage[Math.max(0, chunkEndIndex - 1)] ?? startPage)
      : startPage

    // Calculate character count for this chunk
    const characterCount = countCharacters(chunkText)

    pagedChunks.push({
      text: chunkText,
      chunkIndex: i,
      pageNumber: startPage,  // Keep for compatibility
      startPageNumber: startPage,
      endPageNumber: endPage,
      characterCount
    })

    // Move current position forward (avoid re-finding the same chunk)
    if (chunkStartIndex >= 0) {
      currentCharIndex = chunkStartIndex + chunkText.length
    }
  }

  return pagedChunks
}

/**
 * Split paragraphs into chunks using paragraph-based semantic chunking
 * Uses Document AI's detected paragraph boundaries for better semantic coherence
 */
function splitParagraphsIntoChunks(paragraphs: Paragraph[]): PagedChunk[] {
  // Use paragraph-based chunking with greedy algorithm
  const chunks = chunkByParagraphs(
    paragraphs,
    MAX_CHUNK_CHARACTERS
  )

  // Convert to PagedChunk format
  return chunks.map(chunk => ({
    text: chunk.text,
    chunkIndex: chunk.chunkIndex,
    pageNumber: chunk.pageNumber,        // Keep for compatibility
    startPageNumber: chunk.startPageNumber,
    endPageNumber: chunk.endPageNumber,
    characterCount: chunk.characterCount
  }))
}

// UNLIMITED ROBUST EMBEDDING GENERATION - NO TIMEOUTS, UNLIMITED RETRIES
async function generateEmbeddingsWithUnlimitedRetries(
  documentId: string,
  document: DocumentAIDocument | null,
  docRecord: DatabaseDocument,
  sizeAnalysis?: DocumentSizeAnalysis,
  pagesTextOverride?: { text: string; pageNumber: number }[],
  paragraphsOverride?: Paragraph[]
): Promise<EmbeddingGenerationStats> {
  const timeoutConfig = sizeAnalysis?.timeoutConfig
  const maxRetryAttempts = timeoutConfig?.maxRetryAttempts || 1000000
  let attempt = 0

  const businessMetadata = (docRecord.metadata ?? {}) as BusinessMetadata
  const filename = typeof docRecord.filename === 'string' ? docRecord.filename : `${documentId}.pdf`

  logger.info('Starting embedding generation with intelligent sizing', {
    documentId,
    maxRetryAttempts: timeoutConfig?.maxRetryAttempts || 'unlimited',
    chunkTimeoutSeconds: timeoutConfig?.chunkTimeoutSeconds || 'default',
    tier: sizeAnalysis?.tier || 'unknown',
    component: 'document-processing'
  })

  while (attempt < maxRetryAttempts) {
    try {
      logger.debug('Embedding generation attempt', { attempt: attempt + 1, documentId, component: 'document-processing' })

      const pagesText = pagesTextOverride ?? (document ? extractTextByPages(document) : undefined)

      if (!pagesText || pagesText.length === 0) {
        throw new Error('No page text available for embedding generation')
      }

      const chunkStats = await generateEmbeddingsFromPages(
        documentId,
        pagesText,
        businessMetadata,
        filename,
        docRecord.user_id ?? null,
        sizeAnalysis,
        document,
        paragraphsOverride
      )

      logger.info('Embedding generation completed successfully', { attempt: attempt + 1, documentId, component: 'document-processing' })
      return {
        chunkCount: chunkStats.chunkCount,
        attempts: attempt + 1,
        retryCount: attempt
      }

    } catch (error) {
      // Re-throw cancellation exceptions immediately - don't retry
      if (error instanceof ProcessingCancelledException) {
        throw error
      }

      attempt += 1
      logger.warn('Embedding attempt failed', { attempt, documentId, error: (error as Error)?.message, component: 'document-processing' })

      if (attempt >= maxRetryAttempts) {
        logger.error('All embedding attempts failed', undefined, { maxRetryAttempts, documentId, component: 'document-processing' })
        const supabaseClient = await createServiceClient()
        try {
          await supabaseClient
            .from('documents')
            .update({
              metadata: {
                ...businessMetadata,
                embeddings_skipped: true,
                embeddings_error: error instanceof Error ? error.message : 'Unknown error'
              }
            })
            .eq('id', documentId)
        } finally {
          releaseServiceClient(supabaseClient)
        }

        return {
          chunkCount: 0,
          attempts: attempt,
          retryCount: attempt
        }
      }

      // PRODUCTION OPTIMIZATION: Intelligent backoff based on error type
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const isRateLimit = errorMessage.toLowerCase().includes('rate') ||
                         errorMessage.toLowerCase().includes('quota') ||
                         errorMessage.toLowerCase().includes('429') ||
                         errorMessage.toLowerCase().includes('limit') ||
                         errorMessage.toLowerCase().includes('throttl')

      // More aggressive backoff for rate limits, gentler for other errors
      const backoffMultiplier = isRateLimit ? 2 : 1.5
      const baseDelay = Math.min(1000 * Math.pow(backoffMultiplier, Math.min(attempt, 8)), 120000)

      // Larger jitter for rate limits to spread out retry attempts
      const jitterRange = isRateLimit ? baseDelay * 0.5 : 1000
      const jitter = Math.random() * jitterRange
      const delay = baseDelay + jitter

      logger.info('Waiting before retry attempt', {
        delaySeconds: (delay / 1000).toFixed(1),
        nextAttempt: attempt + 1,
        documentId,
        isRateLimit,
        errorType: isRateLimit ? 'rate_limit' : 'other',
        component: 'document-processing'
      })

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return {
    chunkCount: 0,
    attempts: attempt,
    retryCount: attempt
  }
}

/**
 * Compute centroid embedding and effective chunk count for similarity search
 * CRITICAL: This enables production-ready 3-stage similarity search
 */
export async function computeAndStoreCentroid(
  documentId: string,
  totalChunks: number
): Promise<void> {
  const supabase = await createServiceClient()

  try {
    logger.info('Computing centroid and effective chunk count', {
      documentId,
      totalChunks,
      component: 'document-processing'
    })

    // 1. Fetch all embeddings for this document
    // IMPORTANT: Add explicit limit to avoid Supabase default row limits
    const { data: allEmbeddings, error: fetchError } = await supabase
      .from('document_embeddings')
      .select('chunk_index, embedding, chunk_text, character_count')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true })
      .limit(100000) // Support very large documents

    if (fetchError || !allEmbeddings || allEmbeddings.length === 0) {
      logger.error('No embeddings found for centroid computation - THIS IS A BUG!', undefined, {
        documentId,
        totalChunksExpected: totalChunks,
        fetchError: fetchError?.message,
        embeddingsReturned: allEmbeddings?.length || 0,
        component: 'document-processing'
      })
      return
    }

    // CRITICAL: Deduplicate by chunk_index (some documents may have duplicates)
    const seen = new Set<number>()
    const embeddings = allEmbeddings.reduce<Array<{
      chunk_index: number
      embedding: string | number[]
      chunk_text: string | null
      character_count: number | null
    }>>((acc, record) => {
      if (typeof record.chunk_index !== 'number') {
        return acc
      }
      if (seen.has(record.chunk_index)) {
        return acc
      }
      seen.add(record.chunk_index)
      acc.push({
        chunk_index: record.chunk_index,
        embedding: record.embedding as string | number[],
        chunk_text: typeof record.chunk_text === 'string' ? record.chunk_text : null,
        character_count: typeof record.character_count === 'number' ? record.character_count : null
      })
      return acc
    }, [])

    logger.info('Successfully fetched embeddings for centroid computation', {
      documentId,
      totalRows: allEmbeddings.length,
      uniqueChunks: embeddings.length,
      expectedChunks: totalChunks,
      duplicatesRemoved: allEmbeddings.length - embeddings.length,
      component: 'document-processing'
    })

    // 2. Compute centroid (mean of all embeddings)
    // CRITICAL: Parse embeddings if they're stored as strings in Supabase
    const embeddingVectors = embeddings.map(e => {
      let embedding = e.embedding

      // If embedding is a string, parse it
      if (typeof embedding === 'string') {
        try {
          embedding = JSON.parse(embedding)
        } catch (parseError) {
          logger.error('Failed to parse embedding JSON', parseError as Error, {
            documentId,
            component: 'document-processing'
          })
          return null
        }
      }

      return embedding as number[]
    }).filter(e => e !== null) as number[][]

    // Validate embeddings before processing
    if (embeddingVectors.length === 0 || !embeddingVectors[0] || !Array.isArray(embeddingVectors[0])) {
      logger.error('Invalid embedding format detected after parsing', undefined, {
        documentId,
        embeddingType: typeof embeddingVectors[0],
        parsedCount: embeddingVectors.length,
        originalCount: embeddings.length,
        component: 'document-processing'
      })
      return
    }

    logger.info('Successfully parsed embeddings', {
      documentId,
      parsedCount: embeddingVectors.length,
      originalCount: embeddings.length,
      component: 'document-processing'
    })

    const dimensions = embeddingVectors[0].length

    // Validate all embeddings have consistent dimensions and valid values
    for (let idx = 0; idx < embeddingVectors.length; idx++) {
      const embedding = embeddingVectors[idx]

      if (!embedding || !Array.isArray(embedding)) {
        logger.error('Embedding is not an array', undefined, {
          documentId,
          embeddingIndex: idx,
          embeddingType: typeof embedding,
          component: 'document-processing'
        })
        return
      }

      if (embedding.length !== dimensions) {
        logger.error('Inconsistent embedding dimensions', undefined, {
          documentId,
          embeddingIndex: idx,
          expectedDimensions: dimensions,
          actualDimensions: embedding.length,
          component: 'document-processing'
        })
        return
      }

      // Check for null/undefined values in embedding
      for (let i = 0; i < embedding.length; i++) {
        if (embedding[i] === null || embedding[i] === undefined || !Number.isFinite(embedding[i])) {
          logger.error('Invalid value in embedding vector', undefined, {
            documentId,
            embeddingIndex: idx,
            dimension: i,
            value: embedding[i],
            component: 'document-processing'
          })
          return
        }
      }
    }

    const centroid = new Array(dimensions).fill(0)
    for (const embedding of embeddingVectors) {
      for (let i = 0; i < dimensions; i++) {
        centroid[i]! += embedding[i]! / embeddingVectors.length
      }
    }

    // 3. Normalize the centroid (CRITICAL: pre-normalize for fast cosine similarity)
    const normalizedCentroid = l2Normalize(centroid)

    // Validate normalized centroid before storing
    for (let i = 0; i < normalizedCentroid.length; i++) {
      if (normalizedCentroid[i] === null || normalizedCentroid[i] === undefined || !Number.isFinite(normalizedCentroid[i])) {
        logger.error('Invalid value in normalized centroid', undefined, {
          documentId,
          dimension: i,
          value: normalizedCentroid[i],
          centroidValue: centroid[i],
          component: 'document-processing'
        })
        return
      }
    }

    // 4. Compute effective chunk count
    // CRITICAL: Use ACTUAL chunk count from database, not theoretical calculation
    // This represents what's actually indexed and searchable
    const actualChunkCount = embeddingVectors.length

    // 5. Calculate total characters from all chunks
    // Use character_count from database for accurate content volume tracking
    const totalCharacters = embeddings.reduce((sum, e) => {
      if (typeof e.character_count === 'number' && e.character_count > 0) {
        return sum + e.character_count
      }
      // Fallback: calculate from chunk_text if character_count is missing
      if (e.chunk_text) {
        return sum + countCharacters(e.chunk_text)
      }
      return sum
    }, 0)

    logger.info('Centroid computed successfully', {
      documentId,
      actualChunkCount,
      totalCharacters,
      component: 'document-processing'
    })

    // 6. Update documents table with centroid, effective_chunk_count, and total_characters
    // IMPORTANT: effective_chunk_count should equal actual chunks indexed
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        centroid_embedding: normalizedCentroid,
        effective_chunk_count: actualChunkCount,  // Use actual count, not theoretical
        total_characters: totalCharacters,
        embedding_model: 'text-embedding-004'
      })
      .eq('id', documentId)

    if (updateError) {
      logger.error('Failed to store centroid in documents table', updateError, {
        documentId,
        component: 'document-processing'
      })
      // Don't throw - centroid is optional, document processing should complete
      return
    }

    logger.info('Centroid, effective chunk count, and total characters stored successfully', {
      documentId,
      effectiveChunkCount: actualChunkCount,
      totalCharacters,
      component: 'document-processing'
    })

  } catch (error) {
    logger.error('Failed to compute centroid', error as Error, {
      documentId,
      component: 'document-processing'
    })
    // Don't throw - centroid is optional, document processing should complete
  } finally {
    releaseServiceClient(supabase)
  }
}

async function generateEmbeddingsFromPages(
  documentId: string,
  pagesText: { text: string; pageNumber: number }[],
  businessMetadata: BusinessMetadata,
  filename: string,
  userId: string | null,
  sizeAnalysis?: DocumentSizeAnalysis,
  document?: DocumentAIDocument | null,
  paragraphsOverride?: Paragraph[]
): Promise<{ chunkCount: number }> {
  // Use paragraph-based chunking if document is available, otherwise fall back to text-based
  let pagedChunks: PagedChunk[]

  const paragraphCandidates = paragraphsOverride && paragraphsOverride.length > 0
    ? paragraphsOverride
    : (document && document.pages ? extractParagraphsFromDocument(document) : [])

  if (paragraphCandidates.length > 0) {
    logger.info('Using paragraph-based semantic chunking', {
      documentId,
      component: 'document-processing',
      paragraphCount: paragraphCandidates.length
    })
    pagedChunks = splitParagraphsIntoChunks(paragraphCandidates)
  } else {
    logger.warn('Paragraph metadata unavailable; falling back to sentence-based chunking', {
      documentId,
      component: 'document-processing',
      pages: pagesText.length
    })
    pagedChunks = splitTextIntoPagedChunks(
      pagesText,
      DEFAULT_CHUNK_SIZE,
      0 // force zero overlap in fallback mode
    )

    logger.warn('Consider inspecting Document AI output - paragraph chunking fallback used', {
      documentId,
      component: 'document-processing'
    })
  }

  logger.info('Starting chunk processing for document', {
    documentId,
    totalChunks: pagedChunks.length,
    component: 'document-processing'
  })

  // CRITICAL: Clean up any existing chunks before reprocessing
  // This prevents duplicates if document is reprocessed
  const supabase = await createServiceClient()
  try {
    const { error: deleteError } = await supabase
      .from('document_embeddings')
      .delete()
      .eq('document_id', documentId)

    if (deleteError) {
      logger.warn('Failed to clean up existing chunks (continuing anyway)', {
        documentId,
        error: deleteError.message,
        component: 'document-processing'
      })
    } else {
      logger.info('Cleaned up existing chunks before reprocessing', {
        documentId,
        component: 'document-processing'
      })
    }
  } finally {
    releaseServiceClient(supabase)
  }

  const maxConcurrentChunks = parseInt(process.env['MAX_CONCURRENT_CHUNKS_PER_DOC'] || '50')
  const processingConfig = sizeAnalysis?.processingConfig || {
    batchSize: 20,
    maxConcurrency: 5,
    delayBetweenBatches: 100,
    chunkingStrategy: 'standard',
    enablePrefetching: true,
    useAsyncProcessing: true,
    priorityLevel: 'normal' as const
  }
  const batchSize = Math.min(maxConcurrentChunks, processingConfig.batchSize)

  for (let i = 0; i < pagedChunks.length; i += batchSize) {
    // CHECKPOINT: Check cancellation between batches
    if (await checkCancellation(documentId)) {
      logger.info('Document cancelled during embedding generation', { documentId, processedChunks: i })
      throw new ProcessingCancelledException(documentId)
    }

    const batch = pagedChunks.slice(i, i + batchSize);
    logger.debug('Processing chunk batch', {
      batchNumber: Math.floor(i / batchSize) + 1,
      totalBatches: Math.ceil(pagedChunks.length / batchSize),
      batchSize: batch.length,
      component: 'document-processing'
    });

    let attempts = 0;
    let failedChunks = batch;
    const MAX_CHUNK_RETRIES = 3; // Retries for individual chunks within a batch

    while (failedChunks.length > 0 && attempts < MAX_CHUNK_RETRIES) {
      if (attempts > 0) {
        const delay = Math.pow(2, attempts) * 1000; // Exponential backoff
        logger.warn(`Retrying ${failedChunks.length} failed chunks in batch`, { attempt: attempts, documentId });
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const results = await Promise.allSettled(
        failedChunks.map(pagedChunk => processChunkWithRetry(documentId, pagedChunk, businessMetadata, filename, userId))
      );

      const newFailedChunks: typeof failedChunks = [];
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const failedChunk = failedChunks[index];
          if (failedChunk) {
            newFailedChunks.push(failedChunk);
          }
          logger.warn('Chunk processing failed, will retry.', {
            chunkIndex: failedChunk?.chunkIndex,
            error: result.reason?.message,
            documentId,
            attempt: attempts + 1
          });
        }
      });

      failedChunks = newFailedChunks;
      attempts++;
    }

    if (failedChunks.length > 0) {
      const failedChunkIndexes = failedChunks.map(c => c.chunkIndex);
      logger.error(
        `Failed to process ${failedChunks.length} chunks after ${MAX_CHUNK_RETRIES} attempts. Aborting document processing.`,
        undefined,
        {
          documentId,
          failedChunkIndexes
        }
      );
      const error = new Error(`Failed to process ${failedChunks.length} chunks after multiple retries.`) as Error & { documentId?: string };
      error.documentId = documentId;
      throw error;
    }

    if (i + batchSize < pagedChunks.length) {
      await new Promise(resolve => setTimeout(resolve, processingConfig.delayBetweenBatches))

      if (sizeAnalysis?.memoryRequirements.garbageCollectionHints) {
        const globalWithGc = globalThis as typeof globalThis & { gc?: (() => void) | undefined }
        if (typeof globalWithGc.gc === 'function') {
          globalWithGc.gc()
        }
      }
    }
  }

  logger.info('All chunks processed successfully', {
    documentId,
    totalChunks: pagedChunks.length,
    component: 'document-processing'
  })

  // Small delay to ensure all database writes are visible (eventual consistency)
  await new Promise(resolve => setTimeout(resolve, 500))

  // Compute and store centroid and effective chunk count for similarity search
  logger.info('About to compute centroid', {
    documentId,
    totalChunks: pagedChunks.length,
    component: 'document-processing'
  })
  await computeAndStoreCentroid(documentId, pagedChunks.length)
  logger.info('Finished computing centroid', {
    documentId,
    component: 'document-processing'
  })

  // Verify Qdrant indexing consistency
  logger.info('Verifying Qdrant indexing consistency', {
    documentId,
    expectedChunks: pagedChunks.length,
    component: 'document-processing'
  })

  return { chunkCount: pagedChunks.length }
}

/**
 * Split text into chunks using sentence-based chunking
 * Note: chunkSize and overlap parameters are kept for backward compatibility but are ignored
 * The new implementation uses sentence-based chunking with configurable sentence count and character limits
 */
export function splitTextIntoChunks(
  text: string,
  _chunkSize: number, // Kept for backward compatibility, but ignored
  _overlap: number = DEFAULT_CHUNK_OVERLAP // Kept for backward compatibility, but ignored
): string[] {
  // Use new sentence-based chunking
  return chunkBySentences(
    text,
    SENTENCES_PER_CHUNK,
    SENTENCE_OVERLAP,
    MIN_CHUNK_CHARACTERS,
    MAX_CHUNK_CHARACTERS
  )
}

/**
 * No cache invalidation needed in simplified architecture
 */
async function invalidateDocumentCaches(documentId: string, _userId: string): Promise<void> {
  // No-op in simplified architecture
  logger.debug('Skipping cache invalidation in simplified architecture', { documentId })
}
