'use client'

import { useEffect, useState } from 'react'
import { DatabaseDocument as Document } from '@/types/external-apis'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  FileText,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Eye,
  Download,
  ArrowUp,
  ArrowDown,
  Building,
  Briefcase,
  Globe,
  Users,
  GitCompare
} from 'lucide-react'
import { formatUploadDate } from '@/lib/date-utils'
import { viewDocument, downloadDocument } from '@/lib/document-actions'
import { clientLogger } from '@/lib/client-logger'

interface SelectedSearchInterfaceProps {
  sourceDocument: Document | null
  autoSearchTargets?: string[]
}

interface SimilarityResult {
  document: Document
  score: number
  scores: {
    sourceScore: number
    targetScore: number
    matchedSourceCharacters: number
    matchedTargetCharacters: number
    lengthRatio?: number | null
  }
  matching_chunks: Array<{ text: string; score: number }>
}

export function SelectedSearchInterface({ sourceDocument, autoSearchTargets }: SelectedSearchInterfaceProps) {
  const [isComparing, setIsComparing] = useState(false)
  const [results, setResults] = useState<SimilarityResult[]>([])
  const [sortBy, setSortBy] = useState<string>('source_score')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [comparingDocs, setComparingDocs] = useState<Set<string>>(new Set())

  const handleDraftableCompare = async (targetDocId: string) => {
    if (!sourceDocument) return

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

  useEffect(() => {
    if (!sourceDocument) {
      setResults([])
      return
    }

    const targetIds = (autoSearchTargets ?? []).filter(id => id !== sourceDocument.id)

    if (targetIds.length === 0) {
      setResults([])
      return
    }

    const runAutoSearch = async () => {
      setIsComparing(true)
      try {
        const response = await fetch('/api/documents/selected-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceDocumentId: sourceDocument.id,
            targetDocumentIds: targetIds
          })
        })

        if (!response.ok) {
          throw new Error('Failed to compare documents')
        }

        const data = await response.json()
        setResults(data)
      } catch (error) {
        clientLogger.error('Auto-search failed', error)
      } finally {
        setIsComparing(false)
      }
    }

    runAutoSearch()
  }, [autoSearchTargets, sourceDocument])

  if (!sourceDocument) {
    return (
      <Card className="card-enhanced">
        <CardContent className="py-12 text-center space-y-3">
          <Sparkles className="mx-auto h-10 w-10 text-blue-500" />
          <CardTitle className="text-lg">Select a source document to start</CardTitle>
          <CardDescription className="max-w-md mx-auto">
            Pick a document from the dashboard, then choose specific targets here to run a focused similarity search.
          </CardDescription>
        </CardContent>
      </Card>
    )
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const units = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`
  }

  const formatPageCount = (pageCount?: number) => {
    if (!pageCount || pageCount === 0) return null
    return pageCount === 1 ? '1 page' : `${pageCount} pages`
  }

  const compareScoreHierarchy = (a: SimilarityResult, b: SimilarityResult) => {
    const tolerance = 0.000001
    const sourceDiff = a.scores.sourceScore - b.scores.sourceScore
    if (Math.abs(sourceDiff) > tolerance) return sourceDiff

    const targetDiff = a.scores.targetScore - b.scores.targetScore
    if (Math.abs(targetDiff) > tolerance) return targetDiff

    const matchedCharDiff = a.scores.matchedTargetCharacters - b.scores.matchedTargetCharacters
    if (matchedCharDiff !== 0) return matchedCharDiff

    const uploadDiff = new Date(a.document.created_at).getTime() - new Date(b.document.created_at).getTime()
    if (uploadDiff !== 0) return uploadDiff

    return a.document.title.localeCompare(b.document.title)
  }

  const sortResults = (items: SimilarityResult[]) => {
    const sorted = [...items].sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'upload_time':
          comparison = new Date(a.document.created_at).getTime() - new Date(b.document.created_at).getTime()
          break
        case 'name':
          comparison = a.document.title.localeCompare(b.document.title)
          break
        case 'size':
          comparison = a.document.file_size - b.document.file_size
          break
        case 'target_score':
          comparison = a.scores.targetScore - b.scores.targetScore
          break
        case 'source_score':
        default:
          comparison = compareScoreHierarchy(a, b)
      }
      if (comparison === 0) {
        comparison = compareScoreHierarchy(a, b)
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
    return sorted
  }

  const toggleSortOrder = () => {
    setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
  }

  const getScoreBadgeColor = (score: number) => {
    if (score >= 0.9) return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
    if (score >= 0.8) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
    if (score >= 0.7) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
    if (score >= 0.5) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
    return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
  }

  const sortedResults = sortResults(results)

  return (
    <div className="space-y-6">
      <Card className="card-enhanced">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" />
                Selected Search Results
              </CardTitle>
              <CardDescription>
                Showing {sortedResults.length} of {results.length} selected document{results.length === 1 ? '' : 's'} compared to &quot;{sourceDocument.title}&quot;
              </CardDescription>
            </div>
            {results.length > 1 && (
              <div className="flex items-center gap-2">
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
                  {sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isComparing ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-pulse flex flex-col items-center">
                <Sparkles className="mb-4 h-12 w-12 text-emerald-500 animate-spin" />
                <p className="text-gray-600 dark:text-gray-400">Running selected similarity search...</p>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="mx-auto mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No Similar Documents Found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                None of the selected documents met the similarity threshold. Try selecting different documents or lowering your thresholds.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedResults.map(result => {
                const sourceScore = result.scores?.sourceScore ?? result.score
                const targetScore = result.scores?.targetScore ?? 0
                const lengthRatio = result.scores?.lengthRatio ?? null

                return (
                <Card
                  key={result.document.id}
                  className="border border-blue-100 dark:border-blue-900"
                >
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                          <FileText className="h-6 w-6 text-emerald-600 dark:text-emerald-300" />
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
                            <Badge className={`${getScoreBadgeColor(targetScore)} text-xs`}>
                              Target: {(targetScore * 100).toFixed(0)}%
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
                          <Badge className={`${getScoreBadgeColor(sourceScore)} text-base px-3 py-1`}>
                            {(sourceScore * 100).toFixed(1)}%
                          </Badge>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => viewDocument(result.document)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadDocument(result.document)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white focus-visible:ring-emerald-400"
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
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
