/**
 * Keyword Search API Endpoint
 *
 * POST /api/documents/keyword-search
 *
 * Searches for keywords within document content and returns matching documents
 * with page numbers and text excerpts.
 *
 * Features:
 * - Full-text search using PostgreSQL GIN indexes
 * - User-scoped results (only searches user's own documents)
 * - Configurable result limits (pages per document, total documents)
 * - Relevance-ranked results
 * - Excerpt generation with keyword highlighting
 *
 * Security:
 * - Requires authentication
 * - Uses parameterized queries (prevents SQL injection)
 * - Row-level security enforced
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type {
  KeywordSearchRequest,
  KeywordSearchResponse,
  KeywordSearchDBRow
} from '@/types/search'

/**
 * POST /api/documents/keyword-search
 *
 * Search for keywords in document content
 */
export async function POST(request: NextRequest) {
  try {
    // ========================================================================
    // 1. AUTHENTICATION
    // ========================================================================

    const supabase = await createClient()

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in to search documents' },
        { status: 401 }
      )
    }

    // ========================================================================
    // 2. PARSE & VALIDATE REQUEST
    // ========================================================================

    let body: Partial<KeywordSearchRequest>

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { query, maxPagesPerDoc = 3, pageSize = 20, pageOffset = 0 } = body

    // Validate query
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Search query is required and must be a string' },
        { status: 400 }
      )
    }

    const trimmedQuery = query.trim()

    if (trimmedQuery.length === 0) {
      return NextResponse.json(
        { error: 'Search query cannot be empty' },
        { status: 400 }
      )
    }

    if (trimmedQuery.length > 2000) {
      return NextResponse.json(
        { error: 'Search query is too long (max 2000 characters)' },
        { status: 400 }
      )
    }

    // Validate limits
    if (
      typeof maxPagesPerDoc !== 'number' ||
      maxPagesPerDoc < 1 ||
      maxPagesPerDoc > 20
    ) {
      return NextResponse.json(
        { error: 'maxPagesPerDoc must be between 1 and 20' },
        { status: 400 }
      )
    }

    if (
      typeof pageSize !== 'number' ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      return NextResponse.json(
        { error: 'pageSize must be between 1 and 100' },
        { status: 400 }
      )
    }

    if (
      typeof pageOffset !== 'number' ||
      pageOffset < 0
    ) {
      return NextResponse.json(
        { error: 'pageOffset must be >= 0' },
        { status: 400 }
      )
    }

    // ========================================================================
    // 3. EXECUTE SEARCH
    // ========================================================================

    const { data, error } = await supabase.rpc('search_document_keywords_paginated', {
      p_user_id: user.id,
      p_search_query: trimmedQuery,
      p_max_pages_per_doc: maxPagesPerDoc,
      p_page_size: pageSize,
      p_page_offset: pageOffset
    })

    if (error) {
      console.error('Keyword search database error:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        user_id: user.id,
        query: trimmedQuery
      })

      // Check if function doesn't exist (migration not run)
      if (error.message.includes('function') && error.message.includes('does not exist')) {
        return NextResponse.json(
          {
            error: 'Keyword search is not available. Please run database migration.',
            details: 'Run: npx tsx scripts/run-keyword-search-migration.ts'
          },
          { status: 503 }
        )
      }

      return NextResponse.json(
        { error: 'Search failed. Please try again.' },
        { status: 500 }
      )
    }

    // ========================================================================
    // 4. TRANSFORM RESULTS
    // ========================================================================

    const dbResults = (data || []) as Array<KeywordSearchDBRow & {
      total_documents: number
      has_more: boolean
    }>

    // Extract pagination metadata from first row (all rows have same values)
    const totalDocuments = dbResults[0]?.total_documents || 0
    const hasMore = dbResults[0]?.has_more || false

    const response: KeywordSearchResponse = {
      results: dbResults.map(row => ({
        documentId: row.document_id,
        title: row.title,
        filename: row.filename,
        totalMatches: Number(row.total_matches),
        matches: row.matches || [],
        // Add hasMorePages flag: true if totalMatches > number of matches returned
        hasMorePages: Number(row.total_matches) > (row.matches?.length || 0)
      })),
      query: trimmedQuery,
      total: dbResults.length,
      totalDocuments: Number(totalDocuments),
      hasMore,
      pageSize,
      pageOffset
    }

    // ========================================================================
    // 5. RETURN RESPONSE
    // ========================================================================

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache for 5 minutes (search results don't change frequently)
        'Cache-Control': 'private, max-age=300'
      }
    })
  } catch (error) {
    console.error('Unexpected error in keyword search:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Allow': 'POST, OPTIONS'
    }
  })
}
