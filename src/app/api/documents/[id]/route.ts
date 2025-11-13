import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateDocumentMetadataInQdrant, getVectorIdsForDocument } from '@/lib/qdrant'
import { activityLogger } from '@/lib/activity-logger'
import { DatabaseDocumentWithContent } from '@/types/external-apis'
import { logger } from '@/lib/logger'
import { throttling } from '@/lib/concurrency-limiter'
import { queueQdrantDeletion } from '@/lib/qdrant-cleanup-worker'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: document, error: dbError } = await supabase
      .from('documents')
      .select(
        'id, user_id, title, filename, file_path, file_size, content_type, status, processing_error, extracted_fields, metadata, page_count, created_at, updated_at, document_content(extracted_text)'
      )
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle<DatabaseDocumentWithContent>()

    if (dbError) {
      if (dbError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      logger.error('Documents API: database error', dbError)
      return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
    }

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.document_content && document.document_content.length > 0) {
      document.extracted_text = document.document_content[0]?.extracted_text ?? ''
      delete document.document_content
    }

    return NextResponse.json(document)

  } catch (error) {
    logger.error('Documents API: document fetch error', error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return throttling.delete.run(user.id, async () => {
      // Get document to check ownership and get file path FIRST
      const { data: document, error: fetchError } = await supabase
        .from('documents')
        .select('file_path, filename')
        .eq('id', id)
        .eq('user_id', user.id)
        .single<{ file_path: string | null; filename: string | null }>()

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }
        return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
      }

      let vectorIds: string[] = []
      try {
        vectorIds = await getVectorIdsForDocument(id)
        logger.debug('Documents API: prefetched Qdrant vector IDs for deletion', {
          documentId: id,
          vectorCount: vectorIds.length,
        })
      } catch (vectorError) {
        logger.error('Documents API: failed to prefetch vector IDs', vectorError instanceof Error ? vectorError : new Error(String(vectorError)), {
          documentId: id,
        })
      }

      // Delete from storage
      const filePath = typeof document?.file_path === 'string' ? document.file_path : null
      if (filePath) {
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove([filePath])

        if (storageError) {
          logger.error('Documents API: storage deletion error', storageError)
        }
      } else {
        logger.warn('Documents API: document missing file_path during deletion', { documentId: id })
      }

      // Queue Qdrant cleanup with retry/backoff
      queueQdrantDeletion(id, vectorIds)
      logger.info('Documents API: queued Qdrant vector cleanup', { documentId: id })

      // Delete from database (CASCADE will handle related records)
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (deleteError) {
        logger.error('Documents API: database deletion error', deleteError)
        return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
      }

      // Log activity
      await activityLogger.logActivity({
        userId: user.id,
        userEmail: user.email || '',
        action: 'delete',
        resourceType: 'document',
        resourceId: id,
        resourceName: typeof document?.filename === 'string' ? document.filename : 'Unknown',
        endpoint: `/api/documents/${id}`,
        method: 'DELETE',
        statusCode: 200
      }, request)

      logger.info('Documents API: document deleted successfully', { documentId: id })
      return NextResponse.json({ message: 'Document deleted successfully' })
    })

  } catch (error) {
    logger.error('Documents API: document deletion error', error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as {
      metadata?: Record<string, unknown>
      title?: string
    }
    const { metadata, title } = body

    if (!metadata && !title) {
      return NextResponse.json({ error: 'Metadata or title is required' }, { status: 400 })
    }

    // Verify the document exists and belongs to the user
    const { data: existingDocument, error: fetchError } = await supabase
      .from('documents')
      .select('id, user_id, title, filename, file_path, file_size, content_type, status, processing_error, extracted_fields, metadata, page_count, created_at, updated_at, document_content(extracted_text)')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle<DatabaseDocumentWithContent>()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
    }

    if (!existingDocument) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Flatten extracted_text from document_content
    if (existingDocument.document_content && existingDocument.document_content.length > 0) {
      existingDocument.extracted_text = existingDocument.document_content[0]?.extracted_text ?? '';
      delete existingDocument.document_content;
    } else {
      existingDocument.extracted_text = ''; // Ensure it's always a string
    }

    // Prepare for a full rename operation: storage, database, and metadata
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }

    if (title) {
      // 1. Construct new filename and file path
      const newFilename = `${title}.pdf`
      const oldFilepath = existingDocument.file_path

      if (!oldFilepath || typeof oldFilepath !== 'string') {
        logger.error('Documents API: missing or invalid file_path for rename', undefined, { documentId: id })
        return NextResponse.json({ error: 'Document file path is missing' }, { status: 500 })
      }

      const newFilepath = oldFilepath.substring(0, oldFilepath.lastIndexOf('/') + 1) + newFilename

      // 2. Move the file in Supabase Storage
      const { error: moveError } = await supabase.storage
        .from('documents')
        .move(oldFilepath, newFilepath)

      if (moveError) {
        logger.error('Documents API: storage file move error', moveError)
        return NextResponse.json({ error: 'Failed to rename document in storage.' }, { status: 500 })
      }

      // 3. Prepare database update object
      updateData.title = title
      updateData.filename = newFilename
      updateData.file_path = newFilepath
    }
    
    if (metadata) {
      updateData.metadata = metadata
    }

    // Update the document
    const { data: updatedDocument, error: updateError } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, user_id, title, filename, file_path, file_size, content_type, status, processing_error, extracted_fields, metadata, page_count, created_at, updated_at, document_content(extracted_text)')
      .maybeSingle<DatabaseDocumentWithContent>()

    if (updateError) {
      logger.error('Database update error', updateError as Error, { documentId: id })
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
    }

    if (!updatedDocument) {
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
    }

    // Update Qdrant vector metadata if title or metadata changed
    if (title || metadata) {
      try {
        const vectorMetadata: Record<string, unknown> = {}

        if (title) {
          // The new filename is derived from the new title
          const newFilename = `${title}.pdf`
          vectorMetadata.filename = newFilename
          vectorMetadata.original_filename = newFilename
          logger.info('Documents API: preparing Qdrant metadata filename update', {
            documentId: id,
            newFilename
          })
        }

        // If business metadata changed, include those updates too
        if (metadata) {
          if (metadata.law_firm) vectorMetadata.law_firm = metadata.law_firm
          if (metadata.fund_manager) vectorMetadata.fund_manager = metadata.fund_manager
          if (metadata.fund_admin) vectorMetadata.fund_admin = metadata.fund_admin
          if (metadata.jurisdiction) vectorMetadata.jurisdiction = metadata.jurisdiction
          logger.info('Documents API: updating Qdrant business metadata', { documentId: id })
        }

        await updateDocumentMetadataInQdrant(id, vectorMetadata)
        logger.info('Documents API: Qdrant metadata updated', { documentId: id })
      } catch (qdrantError) {
        logger.error(
          'Documents API: Qdrant metadata update error (non-fatal)',
          qdrantError instanceof Error ? qdrantError : new Error(String(qdrantError)),
          { documentId: id }
        )
        // Don't fail the entire request if Qdrant update fails
        // The database update was successful, which is the primary concern
      }
    }

    // Log the successful update activity
    await activityLogger.logActivity({
      userId: user.id,
      userEmail: user.email || '',
      action: 'upload',
      resourceType: 'document',
      resourceId: id,
      resourceName: title || existingDocument.title || 'Unknown',
      details: title ? { action: 'rename', newTitle: title } : { action: 'update_metadata' },
      endpoint: `/api/documents/${id}`,
      method: 'PATCH',
      statusCode: 200
    }, request)

    logger.info('Documents API: document updated successfully', { documentId: id })
    return NextResponse.json(updatedDocument)

  } catch (error) {
    logger.error('Documents API: document update error', error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
