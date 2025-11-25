import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateAndIndexEmbeddings } from '@/lib/document-processing'
import { computeAndStoreCentroid } from '@/lib/document-processing'
import { DEFAULT_CHUNK_STRIDE } from '@/lib/constants/chunking'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    // Verify authorization - only allow authenticated admin/cron access
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env['CRON_SECRET']}`) {
      logger.warn('Unauthorized debug endpoint access attempt', {
        hasAuthHeader: !!authHeader,
        component: 'debug-retry-embeddings'
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createServiceClient()
    
    // Find completed documents that have no embeddings (skipped due to timeout)
    const { data: documentsWithoutEmbeddings, error } = await supabase
      .from('documents')
      .select('id, title, extracted_text, metadata')
      .eq('status', 'completed')
      .not('extracted_text', 'is', null)
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filter documents that have embeddings_skipped = true or no embeddings
    const documentsToFix = documentsWithoutEmbeddings?.filter(doc => {
      const metadata = (doc.metadata ?? {}) as Record<string, unknown>
      const embeddingsSkipped = metadata['embeddings_skipped'] === true
      const embeddingsError = typeof metadata['embeddings_error'] === 'string'
      return embeddingsSkipped || embeddingsError
    }) || []

    if (documentsToFix.length === 0) {
      return NextResponse.json({
        message: 'No documents found that need embedding retry',
        totalDocuments: documentsWithoutEmbeddings?.length || 0
      })
    }

    logger.info('Retrying embeddings for documents', { documentCount: documentsToFix.length })

    const results = []

    for (const doc of documentsToFix) {
      const documentId = typeof doc.id === 'string' ? doc.id : null
      const extractedText = typeof doc.extracted_text === 'string' ? doc.extracted_text : ''
      if (!documentId || extractedText.length === 0) {
        continue
      }

      try {
        logger.info('Generating embeddings for document', { documentId, title: doc.title })

        // Generate embeddings using the legacy function (simpler, no page tracking needed)
        await generateAndIndexEmbeddings(documentId, extractedText)

        // Compute and store centroid for similarity search
        const chunks = Math.ceil(extractedText.length / DEFAULT_CHUNK_STRIDE) // Rough estimate
        await computeAndStoreCentroid(documentId, chunks)

        // Update document metadata to remove embeddings_skipped flag
        const updatedMetadata = { ...(doc.metadata as Record<string, unknown> | undefined) }
        delete (updatedMetadata as Record<string, unknown>)['embeddings_skipped']
        delete (updatedMetadata as Record<string, unknown>)['embeddings_error']
        ;(updatedMetadata as Record<string, unknown>)['embeddings_retry_success'] = true
        ;(updatedMetadata as Record<string, unknown>)['embeddings_retry_timestamp'] = new Date().toISOString()

        await supabase
          .from('documents')
          .update({ metadata: updatedMetadata })
          .eq('id', documentId)

        results.push({
          documentId,
          title: doc.title,
          status: 'success'
        })

        logger.info('Successfully generated embeddings', { documentId, title: doc.title })

      } catch (error) {
        logger.error('Failed to generate embeddings', error as Error, { documentId, title: doc.title })
        results.push({
          documentId: documentId ?? 'unknown',
          title: doc.title,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    const successful = results.filter(r => r.status === 'success').length
    const failed = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      message: `Embedding retry completed: ${successful} successful, ${failed} failed`,
      totalProcessed: documentsToFix.length,
      successful,
      failed,
      results
    })

  } catch (error) {
    logger.error('Embedding retry error', error as Error)
    return NextResponse.json({ 
      error: 'Failed to retry embeddings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
