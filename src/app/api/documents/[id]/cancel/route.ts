import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { cleanupCancelledDocument } from '@/lib/document-processing'

/**
 * Cancel document processing
 * POST /api/documents/[id]/cancel
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params

  try {
    logger.info('Cancel processing requested', { documentId })

    const supabase = await createServiceClient()

    // 1. Get the document to verify it exists and check current status
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, title, status, user_id')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      logger.error('Document not found', docError ?? undefined, { documentId })
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // 2. Check if document is already completed - only block cancelling completed docs
    const documentStatus = typeof document.status === 'string' ? document.status : null

    // Allow cancellation from ANY status except 'completed'
    // Even if document is in 'error' or 'cancelled', user might want to clean up leftovers
    if (documentStatus === 'completed') {
      logger.warn('Cannot cancel completed document', {
        documentId,
        currentStatus: documentStatus
      })
      return NextResponse.json(
        {
          error: 'Cannot cancel a completed document',
          currentStatus: document.status
        },
        { status: 400 }
      )
    }

    // 3. Update document status to cancelled (this will trigger cancellation checks in processing)
    const { error: updateDocError } = await supabase
      .from('documents')
      .update({
        status: 'cancelled',
        processing_error: 'Processing cancelled by user',
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)

    if (updateDocError) {
      logger.error('Failed to update document status', updateDocError, { documentId })
      throw updateDocError
    }

    logger.info('Document status updated to cancelled', { documentId })

    // 4. Cancel ALL associated processing jobs (not just queued/processing)
    // This ensures we catch any jobs in any state
    const { error: cancelJobsError } = await supabase
      .from('document_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_details: {
          reason: 'Cancelled by user',
          timestamp: new Date().toISOString(),
          original_status: documentStatus
        }
      })
      .eq('document_id', documentId)
      .neq('status', 'cancelled') // Don't update already cancelled jobs

    if (cancelJobsError) {
      logger.error('Failed to cancel jobs', cancelJobsError, { documentId })
      // Continue with cleanup anyway - don't let this stop us
    } else {
      logger.info('Cancelled all processing jobs for document', { documentId })
    }

    // 5. Clean up ALL data immediately - no waiting, complete cleanup
    logger.info('Starting COMPLETE cleanup of cancelled document', { documentId })

    try {
      // Trigger COMPLETE cleanup - removes ALL data from EVERYWHERE
      // This includes: Supabase embeddings, Qdrant vectors, storage files,
      // document content, extracted fields, processing status, and the document itself
      await cleanupCancelledDocument(documentId)

      logger.info('Successfully cleaned up ALL data - document completely removed', {
        documentId,
        title: document.title
      })

      return NextResponse.json({
        success: true,
        message: 'Processing cancelled and all data completely removed',
        documentId,
        status: 'deleted', // Document is fully deleted
        cleanedUp: true
      })

    } catch (cleanupError) {
      logger.error('Failed to cleanup partial data', cleanupError as Error, { documentId })

      // Even if cleanup fails, the document is marked as cancelled
      // User can try cancelling again to clean up leftovers
      return NextResponse.json({
        success: true,
        message: 'Processing cancelled, but cleanup may be incomplete. Try cancelling again to clean up leftovers.',
        documentId,
        status: 'cancelled',
        cleanedUp: false,
        cleanupError: cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
      })
    }

  } catch (error) {
    logger.error('Failed to cancel document processing', error as Error, {
      documentId
    })

    return NextResponse.json(
      {
        error: 'Failed to cancel processing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
