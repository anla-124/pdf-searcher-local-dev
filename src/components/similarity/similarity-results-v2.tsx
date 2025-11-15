'use client'

import { useState } from 'react'
import { DatabaseDocument as Document } from '@/types/external-apis'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search,
  FileText,
  Download,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Eye,
  ArrowUp,
  ArrowDown,
  Building,
  Users,
  Briefcase,
  Globe,
  GitCompare
} from 'lucide-react'
import { formatUploadDate } from '@/lib/date-utils'
import { clientLogger } from '@/lib/client-logger'

interface SimilarityScores {
  sourceScore: number
  targetScore: number
  matchedSourceCharacters: number
  matchedTargetCharacters: number
  explanation: string
  lengthRatio?: number | null
}

interface SectionMatch {
  docA_pageRange: string
  docB_pageRange: string
  avgScore: number
  chunkCount: number
  reusable: boolean
}

interface SimilarityResultV2 {
  document: Document
  scores: SimilarityScores
  matchedChunkCount: number
  sections: SectionMatch[]
}

interface SimilarityResultsV2Props {
  results: SimilarityResultV2[]
  sourceDocument: Document
  isLoading: boolean
  maxResults?: number
}

export function SimilarityResultsV2({ results, sourceDocument, isLoading, maxResults }: SimilarityResultsV2Props) {
  const [sortBy, setSortBy] = useState<string>('source_score')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [comparingDocs, setComparingDocs] = useState<Set<string>>(new Set())
  // selectedResult state removed - was only used by deleted SimilarityDetailsModal

  const handleDraftableCompare = async (targetDocId: string) => {
    setComparingDocs(prev => new Set(prev).add(targetDocId))
    try {
      const response = await fetch('/api/draftable/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDocId: sourceDocument.id,
          targetDocId: targetDocId
        })
      })

      const data = await response.json()

      if (data.success && data.viewerUrl) {
        // Open Draftable viewer in new tab
        window.open(data.viewerUrl, '_blank', 'noopener,noreferrer')
      } else {
        alert(`Failed to create comparison: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      clientLogger.error('Draftable comparison error', { error, sourceDocId: sourceDocument.id, targetDocId })
      alert('Failed to create comparison. Please try again.')
    } finally {
      setComparingDocs(prev => {
        const next = new Set(prev)
        next.delete(targetDocId)
        return next
      })
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatPageCount = (pageCount?: number) => {
    if (!pageCount || pageCount === 0) return null
    return pageCount === 1 ? '1 page' : `${pageCount} pages`
  }

  const getCreatedAtTime = (doc: Document) => {
    const timestamp = new Date(doc.created_at).getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
  }

  const compareScoreHierarchy = (a: SimilarityResultV2, b: SimilarityResultV2) => {
    const tolerance = 0.000001
    const sourceDiff = a.scores.sourceScore - b.scores.sourceScore
    if (Math.abs(sourceDiff) > tolerance) return sourceDiff

    const targetDiff = a.scores.targetScore - b.scores.targetScore
    if (Math.abs(targetDiff) > tolerance) return targetDiff

    const matchedCharDiff = a.scores.matchedTargetCharacters - b.scores.matchedTargetCharacters
    if (matchedCharDiff !== 0) return matchedCharDiff

    const uploadDiff = getCreatedAtTime(a.document) - getCreatedAtTime(b.document)
    if (uploadDiff !== 0) return uploadDiff

    // Final deterministic tie-breaker by document title then id
    const titleDiff = a.document.title.localeCompare(b.document.title)
    if (titleDiff !== 0) return titleDiff

    return a.document.id.localeCompare(b.document.id)
  }

  const sortResults = (results: SimilarityResultV2[]) => {
    const sorted = [...results].sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'target_score':
          comparison = a.scores.targetScore - b.scores.targetScore
          break
        case 'source_score':
          comparison = compareScoreHierarchy(a, b)
          break
        case 'upload_time':
          comparison = new Date(a.document.created_at).getTime() - new Date(b.document.created_at).getTime()
          break
        case 'name':
          comparison = a.document.title.localeCompare(b.document.title)
          break
        case 'size':
          comparison = a.document.file_size - b.document.file_size
          break
        default:
          comparison = a.scores.targetScore - b.scores.targetScore
      }

      if (comparison === 0) {
        comparison = compareScoreHierarchy(a, b)
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })
    const limit = Number.isFinite(maxResults ?? NaN) && (maxResults ?? 0) > 0
      ? Math.min(sorted.length, Math.floor(maxResults ?? 0))
      : sorted.length
    return sorted.slice(0, limit)
  }

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
  }

  const getScoreBadgeColor = (score: number) => {
    if (score >= 0.9) return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
    if (score >= 0.8) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
    if (score >= 0.7) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
    if (score >= 0.5) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
    return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
  }

  const downloadPdf = async (document: Document) => {
    try {
      const response = await fetch(`/api/documents/${document.id}/download`)

      if (!response.ok) {
        throw new Error('Failed to download document')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = document.filename
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      clientLogger.error('Error downloading document', { error, documentId: document.id, filename: document.filename })
      alert('Failed to download document. Please try again.')
    }
  }

  const viewPdf = async (document: Document) => {
    try {
      const response = await fetch(`/api/documents/${document.id}/download`)

      if (!response.ok) {
        throw new Error('Failed to load document')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      window.open(url, '_blank')

      setTimeout(() => {
        window.URL.revokeObjectURL(url)
      }, 1000)
    } catch (error) {
      clientLogger.error('Error viewing document', { error, documentId: document.id, filename: document.filename })
      alert('Failed to open document. Please try again.')
    }
  }

  const sortedResults = sortResults(results)
  const visibleCount = sortedResults.length
  const totalResults = results.length

  if (isLoading) {
    return (
      <Card className="card-enhanced">
        <CardContent className="flex items-center justify-center p-12">
          <div className="animate-pulse flex flex-col items-center">
            <Sparkles className="h-12 w-12 text-blue-500 mb-4 animate-spin" />
            <p className="text-gray-600 dark:text-gray-400">Searching for similar documents...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="card-enhanced">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Similarity Results
              </CardTitle>
              <CardDescription>
                Showing {visibleCount} of {totalResults} similar document{totalResults !== 1 ? 's' : ''} to &quot;{sourceDocument.title}&quot;
              </CardDescription>
            </div>
            {totalResults > 0 && (
              <div className="flex items-center gap-2">
                {totalResults > 1 && (
                  <>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="Sort by..." />
                      </SelectTrigger>
                      <SelectContent>
                    <SelectItem value="source_score">Source Score</SelectItem>
                    <SelectItem value="target_score">Target Score</SelectItem>
                    <SelectItem value="upload_time">Upload Time</SelectItem>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="size">Size</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSortOrder}
                      className="px-3"
                      aria-label={`Sort ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
                    >
                      {sortOrder === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {totalResults === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No Similar Documents Found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                Try adjusting your search parameters, lowering the minimum similarity threshold,
                or removing filters to find more results.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedResults.map(result => {
                const lengthRatio = result.scores?.lengthRatio ?? null

                return (
                <Card key={result.document.id} className="border border-blue-100 dark:border-blue-900">
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                          <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="space-y-2">
                          <div>
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                              {result.document.title}
                            </h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>{formatFileSize(result.document.file_size)}</span>
                            <span>{formatUploadDate(result.document.created_at)}</span>
                            {formatPageCount(result.document.page_count) && (
                              <span>{formatPageCount(result.document.page_count)}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-xs">
                            <div className="flex items-center gap-1">
                              <Building className="h-3 w-3 text-gray-400" />
                              {result.document.metadata?.law_firm ? (
                                <span className="text-gray-600 dark:text-gray-300">{result.document.metadata.law_firm}</span>
                              ) : (
                                <span className="text-orange-500 dark:text-orange-400">(blank)</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3 text-gray-400" />
                              {result.document.metadata?.fund_manager ? (
                                <span className="text-gray-600 dark:text-gray-300">{result.document.metadata.fund_manager}</span>
                              ) : (
                                <span className="text-orange-500 dark:text-orange-400">(blank)</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Briefcase className="h-3 w-3 text-gray-400" />
                              {result.document.metadata?.fund_admin ? (
                                <span className="text-gray-600 dark:text-gray-300">{result.document.metadata.fund_admin}</span>
                              ) : (
                                <span className="text-orange-500 dark:text-orange-400">(blank)</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Globe className="h-3 w-3 text-gray-400" />
                              {result.document.metadata?.jurisdiction ? (
                                <span className="text-gray-600 dark:text-gray-300">{result.document.metadata.jurisdiction}</span>
                              ) : (
                                <span className="text-orange-500 dark:text-orange-400">(blank)</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            <Badge className={`${getScoreBadgeColor(result.scores.targetScore)} text-xs`}>
                              Target: {Math.round(result.scores.targetScore * 100)}%
                            </Badge>
                            {lengthRatio !== null && Number.isFinite(lengthRatio) && (
                              <Badge variant="outline" className="text-xs">
                                Length Ratio: {(lengthRatio / 100).toFixed(2)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-start sm:items-end gap-2 min-w-[220px]">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-gray-400" />
                          <Badge className={`${getScoreBadgeColor(result.scores.sourceScore)} text-base px-3 py-1`}>
                            {Number((result.scores.sourceScore * 100).toFixed(1))}%
                          </Badge>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => viewPdf(result.document)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadPdf(result.document)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white focus-visible:ring-blue-400"
                            onClick={() => handleDraftableCompare(result.document.id)}
                            disabled={comparingDocs.has(result.document.id)}
                          >
                            <GitCompare className="h-4 w-4 mr-1 text-white" />
                            {comparingDocs.has(result.document.id) ? 'Opening...' : 'Compare with Draftable'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              )})}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Similarity Details Modal removed during cleanup */}
      {/* Modal can be re-added if detailed view is needed */}
    </>
  )
}
