/**
 * Keyword Search Results Component
 *
 * Displays keyword search results with document matches, page numbers,
 * and highlighted excerpts.
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { KeywordSearchResult, KeywordMatch } from '@/types/search'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Eye, ChevronDown, ChevronUp } from 'lucide-react'

interface KeywordResultsProps {
  results: KeywordSearchResult[]
  query: string
  isLoading?: boolean
  onViewDocument?: (documentId: string, pageNumber?: number) => void
}

export function KeywordResults({
  results,
  query,
  isLoading = false,
  onViewDocument
}: KeywordResultsProps) {
  const router = useRouter()
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())

  // Single state object for document states (Claude 2's recommendation)
  const [docStates, setDocStates] = useState<Record<string, {
    additionalPages: KeywordMatch[]
    isLoading: boolean
    fullyLoaded: boolean
    error: string | null
  }>>({})

  /**
   * Toggle expansion of a document's additional loaded pages
   * Only used after loading more pages from server
   */
  const toggleExpanded = (documentId: string) => {
    const newExpanded = new Set(expandedDocs)
    if (newExpanded.has(documentId)) {
      newExpanded.delete(documentId)
    } else {
      newExpanded.add(documentId)
    }
    setExpandedDocs(newExpanded)
  }

  /**
   * Load more pages for a specific document
   * Implements retry logic as recommended by Claude 2
   */
  const loadMorePages = async (documentId: string, currentMatches: number) => {
    try {
      // Set loading state
      setDocStates(prev => ({
        ...prev,
        [documentId]: {
          ...prev[documentId],
          isLoading: true,
          error: null,
          additionalPages: prev[documentId]?.additionalPages || [],
          fullyLoaded: prev[documentId]?.fullyLoaded || false
        }
      }))

      const response = await fetch('/api/documents/keyword-search/load-more-pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId,
          query,
          skipPages: currentMatches,
          fetchPages: 5
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to load more pages')
      }

      const data = await response.json()

      // Update state with new pages
      setDocStates(prev => ({
        ...prev,
        [documentId]: {
          additionalPages: [
            ...(prev[documentId]?.additionalPages || []),
            ...data.pages
          ],
          isLoading: false,
          fullyLoaded: !data.hasMore,
          error: null
        }
      }))

      // Auto-expand document to show new pages
      setExpandedDocs(prev => new Set([...prev, documentId]))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load more pages'

      // Set error state
      setDocStates(prev => ({
        ...prev,
        [documentId]: {
          ...prev[documentId],
          isLoading: false,
          error: errorMessage,
          additionalPages: prev[documentId]?.additionalPages || [],
          fullyLoaded: prev[documentId]?.fullyLoaded || false
        }
      }))

      console.error('Error loading more pages:', error)
    }
  }

  /**
   * Sanitize HTML excerpt to prevent XSS while preserving <b> tags
   * ts_headline() returns excerpts with <b> tags for highlighting
   */
  const sanitizeExcerpt = (excerpt: string): string => {
    return excerpt
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/&lt;b&gt;/g, '<strong>')
      .replace(/&lt;\/b&gt;/g, '</strong>')
  }

  /**
   * Handle viewing a document at a specific page
   */
  const handleViewPage = (documentId: string, pageNumber: number) => {
    if (onViewDocument) {
      onViewDocument(documentId, pageNumber)
    } else {
      // Default: navigate to document view page with page number
      router.push(`/documents/${documentId}?page=${pageNumber}`)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Searching for &quot;{query}&quot;...</p>
        </CardContent>
      </Card>
    )
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
          <p className="text-gray-600">
            No documents contain the keyword{query.includes(' ') ? 's' : ''} &quot;{query}&quot;
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Try different keywords or check your spelling
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3 keyword-results">
      {/* Results Summary */}
      <div className="text-sm text-gray-600">
        Found {results.length} document{results.length !== 1 ? 's' : ''} matching &quot;{query}&quot;
      </div>

      {/* Results List */}
      {results.map((doc) => {
        const docState = docStates[doc.documentId]
        const additionalPages = docState?.additionalPages || []
        const isLoadingMore = docState?.isLoading || false
        const hasError = docState?.error
        const fullyLoaded = docState?.fullyLoaded || false
        const isExpanded = expandedDocs.has(doc.documentId)

        // Combine initial matches with additional loaded pages
        const allMatches = [...doc.matches, ...additionalPages]
        // If we've loaded additional pages and document is collapsed, show only first 3
        // Otherwise show all matches
        const visibleMatches = (additionalPages.length > 0 && !isExpanded)
          ? doc.matches
          : allMatches

        // Calculate counts for display
        const loadedCount = allMatches.length
        const totalCount = doc.totalMatches
        const hasMoreToLoad = loadedCount < totalCount && !fullyLoaded

        return (
          <Card key={doc.documentId} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <CardTitle className="text-base truncate">
                      {doc.title}
                    </CardTitle>
                  </div>
                </div>
                <Badge variant="secondary" className="flex-shrink-0 text-xs">
                  {totalCount} match{totalCount !== 1 ? 'es' : ''}
                  {loadedCount < totalCount && (
                    <span className="ml-1 text-xs opacity-70">
                      (showing {loadedCount})
                    </span>
                  )}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              {/* Matches */}
              <div className="space-y-2">
                {visibleMatches.map((match, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-gray-50 rounded border border-gray-200 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs py-0">
                            Page {match.pageNumber}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            Relevance: {(match.score * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div
                          className="text-sm text-gray-700 leading-snug"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeExcerpt(match.excerpt)
                          }}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewPage(doc.documentId, match.pageNumber)}
                        className="flex-shrink-0 h-7 w-7 p-0"
                        aria-label="View page"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Show Less / Show All Button (only appears after loading more) */}
              {additionalPages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleExpanded(doc.documentId)}
                  className="w-full mt-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Show all {allMatches.length} page{allMatches.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              )}

              {/* Load More Pages Button */}
              {hasMoreToLoad && !isLoadingMore && !hasError && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadMorePages(doc.documentId, loadedCount)}
                  className="w-full mt-2"
                >
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Load {Math.min(5, totalCount - loadedCount)} more page
                  {Math.min(5, totalCount - loadedCount) !== 1 ? 's' : ''} ({totalCount - loadedCount} remaining)
                </Button>
              )}

              {/* Loading State */}
              {isLoadingMore && (
                <div className="flex items-center justify-center mt-2 py-2 text-sm text-gray-600">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />
                  Loading more pages...
                </div>
              )}

              {/* Error State with Retry */}
              {hasError && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                  <p className="text-sm text-red-600 mb-2">{hasError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadMorePages(doc.documentId, loadedCount)}
                    className="w-full text-red-600 border-red-300 hover:bg-red-50"
                  >
                    Retry
                  </Button>
                </div>
              )}

              {/* All Pages Loaded */}
              {fullyLoaded && loadedCount < totalCount && (
                <div className="mt-2 text-center text-xs text-gray-500">
                  All available pages loaded
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* CSS for highlighted keywords */}
      <style jsx global>{`
        .keyword-results strong {
          font-weight: 700;
          color: inherit;
        }
      `}</style>
    </div>
  )
}
