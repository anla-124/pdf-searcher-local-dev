import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

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

    // Get document to verify ownership
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('user_id, status')
      .eq('id', id)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get latest processing status
    const { data: statusData, error: statusError } = await supabase
      .from('processing_status')
      .select('*')
      .eq('document_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (statusError && statusError.code !== 'PGRST116') {
      logger.error('Error fetching processing status', statusError as Error, { documentId: id })
      return NextResponse.json({ error: 'Failed to fetch processing status' }, { status: 500 })
    }

    // Map document status to processing phases
    const documentStatus = typeof document.status === 'string' ? document.status : 'unknown'
    const statusMessage = typeof statusData?.message === 'string' ? statusData.message : ''
    const statusProgress = typeof statusData?.progress === 'number' ? statusData.progress : 0
    const phase = getProcessingPhase(documentStatus, statusMessage)
    const progress = getPhaseProgress(documentStatus, statusProgress)

    const response = {
      documentId: id,
      status: documentStatus,
      phase,
      progress,
      message: statusMessage || getDefaultMessage(documentStatus),
      error: statusData?.error || null,
      lastUpdated: statusData?.created_at || new Date().toISOString()
    }

    return NextResponse.json(response)

  } catch (error) {
    logger.error('Processing status error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function getProcessingPhase(documentStatus: string, message: string): string {
  // Map status and message to specific phase
  if (documentStatus === 'uploading' || message.includes('upload')) {
    return 'upload'
  }
  
  if (documentStatus === 'queued') {
    return 'upload' // Upload completed, queued for processing
  }
  
  if (documentStatus === 'processing') {
    if (message.includes('Document AI') || message.includes('processing')) {
      return 'extraction'
    }
    if (message.includes('structured') || message.includes('fields')) {
      return 'analysis'
    }
    if (message.includes('embedding') || message.includes('generating')) {
      return 'embeddings'
    }
    if (message.includes('index') || message.includes('Qdrant')) {
      return 'indexing'
    }
    // Default to extraction if no specific phase detected
    return 'extraction'
  }
  
  if (documentStatus === 'completed') {
    return 'indexing' // All phases complete
  }
  
  if (documentStatus === 'error') {
    // Try to determine which phase failed
    if (message.includes('upload') || message.includes('storage')) return 'upload'
    if (message.includes('Document AI') || message.includes('processing')) return 'extraction'
    if (message.includes('embedding')) return 'embeddings'
    if (message.includes('Qdrant') || message.includes('index')) return 'indexing'
    return 'extraction' // Default error phase
  }
  
  return 'upload'
}

function getPhaseProgress(documentStatus: string, statusProgress: number): number {
  switch (documentStatus) {
    case 'uploading':
      return Math.min(statusProgress, 100)
    case 'queued':
      return 100 // Upload complete, ready for processing
    case 'processing':
      return Math.min(Math.max(statusProgress, 10), 95) // Processing in progress
    case 'completed':
      return 100
    case 'error':
      return 0
    default:
      return 0
  }
}

function getDefaultMessage(status: string): string {
  switch (status) {
    case 'uploading':
      return 'Uploading document to secure storage...'
    case 'queued':
      return 'Document uploaded successfully, queued for processing...'
    case 'processing':
      return 'Processing document with AI...'
    case 'completed':
      return 'Document processing completed successfully'
    case 'error':
      return 'Document processing failed'
    default:
      return 'Processing status unknown'
  }
}
