/**
 * Production-Ready Similarity Search API v2
 * Uses 3-stage adaptive similarity search with section detection
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { executeSimilaritySearch, validateDocumentForSimilarity } from '@/lib/similarity/orchestrator'
import { logger } from '@/lib/logger'

type RawFilters = Record<string, unknown>

const FILTER_OPERATOR_IN = '$in'
const FILTER_OPERATOR_EQ = '$eq'
const MAX_RESULT_LIMIT = 100

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const STAGE2_WORKERS_FALLBACK = parsePositiveInteger(process.env['SIMILARITY_STAGE2_WORKERS'])

function normalizeTopK(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) {
      return undefined
    }
    return Math.min(MAX_RESULT_LIMIT, Math.floor(value))
  }

  if (typeof value === 'string') {
    const parsed = parsePositiveInteger(value)
    if (parsed === undefined) {
      return undefined
    }
    return Math.min(MAX_RESULT_LIMIT, parsed)
  }

  return undefined
}

function normalizeFilterEntry(value: unknown): { vectorDb: unknown; client: unknown } | null {
  if (value === null || value === undefined) {
    return null
  }

  if (Array.isArray(value)) {
    const sanitized = value
      .map(item => {
        if (typeof item === 'string') {
          const trimmed = item.trim()
          return trimmed.length > 0 ? trimmed : null
        }
        return item ?? null
      })
      .filter((item): item is string | number | boolean => item !== null)

    if (sanitized.length === 0) {
      return null
    }

    if (sanitized.length === 1) {
      return {
        vectorDb: sanitized[0],
        client: sanitized[0]
      }
    }

    return {
      vectorDb: {
        [FILTER_OPERATOR_IN]: sanitized
      },
      client: sanitized
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      return null
    }
    return {
      vectorDb: trimmed,
      client: trimmed
    }
  }

  return {
    vectorDb: value,
    client: value
  }
}

function buildStage0Filters(rawFilters: RawFilters, userId: string): {
  vectorFilters: Record<string, unknown>
  appliedFilters: Record<string, unknown>
} {
  const vectorFilters: Record<string, unknown> = {
    user_id: { [FILTER_OPERATOR_EQ]: userId }
  }
  const appliedFilters: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(rawFilters)) {
    if (key === 'user_id') continue

    const normalized = normalizeFilterEntry(value)
    if (!normalized) continue

    vectorFilters[key] = normalized.vectorDb
    appliedFilters[key] = normalized.client
  }

  return { vectorFilters, appliedFilters }
}

interface SanitizedPageRangeResult {
  value?: {
    start_page: number
    end_page: number
  }
  useEntireDocument: boolean
  error?: string
}

function parsePageNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      return undefined
    }
    const parsed = Number.parseInt(trimmed, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function sanitizePageRangeInput(
  input: unknown,
  maxPage?: number
): SanitizedPageRangeResult {
  if (!input || typeof input !== 'object') {
    return { useEntireDocument: true }
  }

  const raw = input as Record<string, unknown>
  const useEntireDocument = raw.use_entire_document !== false

  if (useEntireDocument) {
    return { useEntireDocument: true }
  }

  const start = parsePageNumber(raw.start_page)
  const end = parsePageNumber(raw.end_page)

  if (start === undefined || end === undefined) {
    return {
      useEntireDocument: false,
      error: 'Enter both start and end pages.'
    }
  }

  if (start < 1 || end < 1) {
    return {
      useEntireDocument: false,
      error: 'Page numbers must be at least 1.'
    }
  }

  if (start > end) {
    return {
      useEntireDocument: false,
      error: 'Start page must be less than or equal to end page.'
    }
  }

  if (maxPage !== undefined) {
    if (start > maxPage || end > maxPage) {
      return {
        useEntireDocument: false,
        error: `Page range must be within 1-${maxPage}.`
      }
    }
  }

  return {
    useEntireDocument: false,
    value: {
      start_page: start,
      end_page: end
    }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    logger.info('Similarity search v2 requested', { documentId: id })

    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body for optional configuration
    const body = await request.json().catch(() => ({}))
    const {
      stage0_topK = 600,
      stage1_topK = 250,
      stage1_enabled = true,
      stage1_neighborsPerChunk,
      stage2_parallelWorkers = STAGE2_WORKERS_FALLBACK,
      stage2_fallbackThreshold = 0.8,
      filters: rawFilters = {},
      source_min_score = 0.7,
      target_min_score = 0.7
    }: {
      stage0_topK?: number
      stage1_topK?: number
      stage1_enabled?: boolean
      stage1_neighborsPerChunk?: number
      stage2_parallelWorkers?: number
      stage2_fallbackThreshold?: number
      filters?: Record<string, unknown>
      source_min_score?: number
      target_min_score?: number
    } = body

    // Extract non-vector-DB filter directives (handled in later stages)
    const {
      page_range: requestedPageRange,
      min_score: requestedMinScore,
      threshold: requestedThreshold,
      topK: requestedTopK,
      ...metadataFilters
    } = rawFilters as RawFilters

    const { vectorFilters, appliedFilters } = buildStage0Filters(metadataFilters, user.id)

    const normalizedStage2Workers =
      stage2_parallelWorkers !== undefined
        ? Math.max(1, Math.floor(stage2_parallelWorkers))
        : undefined

    // Verify document exists and belongs to user
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, title, status, centroid_embedding, effective_chunk_count, page_count, total_characters')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.status !== 'completed') {
      return NextResponse.json({
        error: 'Document is not ready for similarity search',
        status: document.status
      }, { status: 400 })
    }

    const {
      value: sanitizedPageRange,
      error: pageRangeError
    } = sanitizePageRangeInput(
      requestedPageRange,
      typeof document.page_count === 'number' ? document.page_count : undefined
    )

    if (pageRangeError) {
      return NextResponse.json({ error: pageRangeError }, { status: 400 })
    }

    // Validate document has required fields for similarity search
    const validation = await validateDocumentForSimilarity(id)
    if (!validation.valid) {
      return NextResponse.json({
        error: 'Document is not ready for similarity search v2',
        details: validation.errors,
        warnings: validation.warnings,
        instructions: [
          'This document needs to be reprocessed with the new pipeline.',
          'Option 1: Reupload the document',
          'Option 2: Run the backfill script: npm run backfill:centroids',
          'Option 3: Use the legacy /api/documents/[id]/similar endpoint'
        ]
      }, { status: 400 })
    }

    if (validation.warnings.length > 0) {
      logger.warn('Similarity search validation warnings', {
        documentId: id,
        warnings: validation.warnings
      })
    }

    logger.info('Similarity search execution starting', {
      documentId: id,
      documentTitle: document.title,
      stage0_topK,
      stage1_topK
    })

    // Execute 3-stage similarity search
    const searchResult = await executeSimilaritySearch(id, {
      stage0_topK,
      stage0_filters: vectorFilters,
      stage1_topK,
      stage1_enabled,
      stage1_neighborsPerChunk,
      stage2_parallelWorkers: normalizedStage2Workers,
      stage2_fallbackThreshold,
      sourcePageRange: sanitizedPageRange
    })

    const sourceTotalCharacters = typeof document.total_characters === 'number' && Number.isFinite(document.total_characters)
      ? document.total_characters
      : null

    const filteredResults = searchResult.results.filter(result =>
      result.scores.sourceScore >= source_min_score &&
      result.scores.targetScore >= target_min_score
    )

    const enrichedResults = filteredResults.map(result => {
      const targetTotalCharactersFromResult = typeof result.document.total_characters === 'number' && Number.isFinite(result.document.total_characters as number)
        ? (result.document.total_characters as number)
        : null
      const targetTotalCharactersFromEffective = typeof result.document.effective_chunk_count === 'number' && Number.isFinite(result.document.effective_chunk_count as number)
        ? (result.document.effective_chunk_count as number)
        : null
      const targetTotalCharacters = targetTotalCharactersFromResult ?? targetTotalCharactersFromEffective

      const lengthRatio = sourceTotalCharacters && targetTotalCharacters
        ? (sourceTotalCharacters / targetTotalCharacters) * 100
        : null

      return {
        ...result,
        scores: {
          ...result.scores,
          lengthRatio
        }
      }
    })

    const normalizedTopK = normalizeTopK(requestedTopK)
    const limitedResults = normalizedTopK !== undefined
      ? enrichedResults.slice(0, normalizedTopK)
      : enrichedResults

    logger.info('Similarity search completed', {
      documentId: id,
      stage0Candidates: searchResult.stages.stage0_candidates,
      stage1Candidates: searchResult.stages.stage1_candidates,
      finalResults: searchResult.stages.final_results,
      deliveredResults: limitedResults.length,
      appliedTopK: normalizedTopK ?? null,
      timing: searchResult.timing
    })

    // Format response
    const pageRangeConfig = requestedPageRange !== undefined
      ? sanitizedPageRange
        ? { ...sanitizedPageRange, use_entire_document: false }
        : { use_entire_document: true }
      : undefined

    const response = {
      document_id: id,
      document_title: document.title,
      results: limitedResults,
      total_results: limitedResults.length,
      timing: {
        stage0_ms: searchResult.timing.stage0_ms,
        stage1_ms: searchResult.timing.stage1_ms,
        stage2_ms: searchResult.timing.stage2_ms,
        total_ms: searchResult.timing.total_ms
      },
      stages: {
        stage0_candidates: searchResult.stages.stage0_candidates,
        stage1_candidates: searchResult.stages.stage1_candidates,
        final_results: searchResult.stages.final_results
      },
      config: {
        stage0_topK,
        stage1_topK,
        stage1_enabled,
        stage1_neighborsPerChunk,
        stage2_parallelWorkers: normalizedStage2Workers,
        stage2_fallbackThreshold,
        filters: {
          ...appliedFilters,
          ...(pageRangeConfig ? { page_range: pageRangeConfig } : {}),
          ...(requestedMinScore !== undefined ? { min_score: requestedMinScore } : {}),
          ...(requestedThreshold !== undefined ? { threshold: requestedThreshold } : {}),
          ...(normalizedTopK !== undefined ? { topK: normalizedTopK } : {})
        },
        source_min_score,
        target_min_score
      },
      version: '2.0.0',
      features: {
        adaptive_scoring: true,
        bidirectional_matching: true,
        section_detection: true,
        effective_chunk_count: true
      },
      timestamp: new Date().toISOString()
    }

    return NextResponse.json(response)

  } catch (error) {
    logger.error(
      'Similarity search v2 request failed',
      error instanceof Error ? error : new Error(String(error))
    )
    return NextResponse.json(
      {
        error: 'Similarity search failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint to check if document is ready for similarity search v2
 */
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

    // Verify document belongs to user
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, title, status, total_characters')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Validate document readiness
    const validation = await validateDocumentForSimilarity(id)

    return NextResponse.json({
      document_id: id,
      document_title: document.title,
      ready: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      status: document.status
    })

  } catch (error) {
    logger.error(
      'Similarity search readiness check failed',
      error instanceof Error ? error : new Error(String(error))
    )
    return NextResponse.json(
      {
        error: 'Readiness check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
