'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { DatabaseDocument as Document } from '@/types/external-apis'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Download,
  GitCompare,
  Scale,
  UserCircle,
  ClipboardList,
  Globe,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from 'lucide-react'
import { useMetadataOptions } from '@/hooks/use-metadata-options'
import { clientLogger } from '@/lib/client-logger'
import { useResizableColumns } from '@/hooks/useResizableColumns'

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

interface SearchResultsTableProps {
  results: SimilarityResultV2[]
  sourceDocument: Document
  theme?: 'blue' | 'emerald'
  isLoading?: boolean
}

type MetadataOption = {
  value: string
  label: string
}

export function SearchResultsTable({
  results,
  sourceDocument,
  theme = 'blue',
  isLoading = false
}: SearchResultsTableProps) {
  const [sortBy, setSortBy] = useState<string>('source_score')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [comparingDocs, setComparingDocs] = useState<Set<string>>(new Set())

  // Resizable columns
  const { columnWidths, handleMouseDown } = useResizableColumns({
    name: 500,
    metadata: 150,
    pages: 70,
    results: 140,
    actions: 210
  })

  // Fetch metadata options from API
  const { options: lawFirmOptions } = useMetadataOptions('law_firm')
  const { options: fundManagerOptions } = useMetadataOptions('fund_manager')
  const { options: fundAdminOptions } = useMetadataOptions('fund_admin')
  const { options: jurisdictionOptions } = useMetadataOptions('jurisdiction')

  // Theme colors
  const themeColors = useMemo(() => {
    if (theme === 'emerald') {
      return {
        iconBg: 'bg-emerald-100',
        iconColor: 'text-emerald-600',
        compareButton: 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-400',
        downloadIconColor: 'text-emerald-600'
      }
    }
    return {
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      compareButton: 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-400',
      downloadIconColor: 'text-blue-600'
    }
  }, [theme])

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

  const getScoreBadgeColor = (score: number) => {
    if (score >= 0.9) return 'bg-green-100 text-green-800'
    if (score >= 0.8) return 'bg-blue-100 text-blue-800'
    if (score >= 0.7) return 'bg-orange-100 text-orange-800'
    if (score >= 0.5) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const resolveOptionLabel = (
    value: string | null | undefined,
    options: ReadonlyArray<MetadataOption>
  ): string => {
    if (!value) return ''
    return options.find(option => option.value === value)?.label ?? value
  }

  // Sort handler for column headers
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  // Apply sorting
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'name':
          comparison = a.document.title.localeCompare(b.document.title)
          break
        case 'pages':
          comparison = (a.document.page_count ?? 0) - (b.document.page_count ?? 0)
          break
        case 'updated_at':
          comparison = new Date(a.document.updated_at).getTime() - new Date(b.document.updated_at).getTime()
          break
        case 'source_score':
          comparison = a.scores.sourceScore - b.scores.sourceScore
          break
        case 'target_score':
          comparison = a.scores.targetScore - b.scores.targetScore
          break
        case 'length_ratio':
          const ratioA = a.scores.lengthRatio ?? 0
          const ratioB = b.scores.lengthRatio ?? 0
          comparison = ratioA - ratioB
          break
        default:
          comparison = a.scores.sourceScore - b.scores.sourceScore
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [results, sortBy, sortOrder])

  if (isLoading) {
    return (
      <Card className="card-enhanced">
        <div className="flex items-center justify-center p-12">
          <div className="flex flex-col items-center">
            <div className="relative h-12 w-12 mb-4">
              <div className="h-full w-full rounded-full border-2 border-blue-100" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 border-l-blue-500 animate-spin [animation-duration:900ms]" />
            </div>
            <p className="text-gray-600 animate-[fade_1.6s_ease-in-out_infinite]">
              Searching for similar documents...
            </p>
          </div>
        </div>
      </Card>
    )
  }

  if (results.length === 0) {
    return (
      <Card className="card-enhanced">
        <div className="flex items-center justify-center p-12">
          <div className="flex flex-col items-center">
            <Image src="/logo/pdf.svg" alt="PDF" width={48} height={48} className="opacity-40 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Similar Documents Found
            </h3>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="card-enhanced">
        <Table style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: `${columnWidths.name}px` }} />
            <col style={{ width: `${columnWidths.metadata}px` }} />
            <col style={{ width: `${columnWidths.pages}px` }} />
            <col style={{ width: `${columnWidths.results}px` }} />
            <col style={{ width: `${columnWidths.actions}px` }} />
          </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent bg-muted">
            <TableHead
              className="cursor-pointer hover:bg-muted/50 h-10 py-2 border-r border-gray-300 relative group rounded-tl-xl"
              onClick={() => handleSort('name')}
              style={{ width: `${columnWidths.name}px` }}
            >
              <div className="flex items-center gap-2">
                Name
                {sortBy === 'name' ? (
                  sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-50" />
                )}
              </div>
              <div
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-gray-400:bg-gray-500"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  handleMouseDown(e, 'name')
                }}
              />
            </TableHead>
            <TableHead
              className="h-10 py-2 border-r border-gray-300 relative group"
              style={{ width: `${columnWidths.metadata}px` }}
            >
              Metadata
              <div
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-gray-400:bg-gray-500"
                onMouseDown={(e) => handleMouseDown(e, 'metadata')}
              />
            </TableHead>
            <TableHead
              className="cursor-pointer hover:bg-muted/50 h-10 py-2 border-r border-gray-300 relative group"
              onClick={() => handleSort('pages')}
              style={{ width: `${columnWidths.pages}px` }}
            >
              <div className="flex items-center gap-2">
                Pages
                {sortBy === 'pages' ? (
                  sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-50" />
                )}
              </div>
              <div
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-gray-400:bg-gray-500"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  handleMouseDown(e, 'pages')
                }}
              />
            </TableHead>
            <TableHead
              className="h-10 py-2 border-r border-gray-300 relative group"
              style={{ width: `${columnWidths.results}px` }}
            >
              Results
              <div
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-gray-400:bg-gray-500"
                onMouseDown={(e) => handleMouseDown(e, 'results')}
              />
            </TableHead>
            <TableHead
              className="text-right h-10 py-2 rounded-tr-xl"
              aria-label="Actions"
              style={{ width: `${columnWidths.actions}px` }}
            >
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedResults.map((result) => {
            const lengthRatio = result.scores?.lengthRatio ?? null

            return (
              <TableRow key={result.document.id}>
                {/* Name Column */}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Image src="/logo/pdf.svg" alt="PDF" width={16} height={16} />
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => viewPdf(result.document)}
                        className="block w-full font-medium text-gray-900 hover:text-gray-700 dark:text-gray-300 truncate text-left cursor-pointer"
                      >
                        {result.document.title}
                      </button>
                    </div>
                  </div>
                </TableCell>

                {/* Metadata Column */}
                <TableCell>
                  <div className="flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Scale className="h-3 w-3 flex-shrink-0 text-gray-400" />
                      {result.document.metadata?.law_firm ? (
                        <span className="truncate text-gray-600">
                          {resolveOptionLabel(result.document.metadata.law_firm, lawFirmOptions)}
                        </span>
                      ) : (
                        <span className="truncate text-orange-500">(blank)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <UserCircle className="h-3 w-3 flex-shrink-0 text-gray-400" />
                      {result.document.metadata?.fund_manager ? (
                        <span className="truncate text-gray-600">
                          {resolveOptionLabel(result.document.metadata.fund_manager, fundManagerOptions)}
                        </span>
                      ) : (
                        <span className="truncate text-orange-500">(blank)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ClipboardList className="h-3 w-3 flex-shrink-0 text-gray-400" />
                      {result.document.metadata?.fund_admin ? (
                        <span className="truncate text-gray-600">
                          {resolveOptionLabel(result.document.metadata.fund_admin, fundAdminOptions)}
                        </span>
                      ) : (
                        <span className="truncate text-orange-500">(blank)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3 w-3 flex-shrink-0 text-gray-400" />
                      {result.document.metadata?.jurisdiction ? (
                        <span className="truncate text-gray-600">
                          {resolveOptionLabel(result.document.metadata.jurisdiction, jurisdictionOptions)}
                        </span>
                      ) : (
                        <span className="truncate text-orange-500">(blank)</span>
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* Pages Column */}
                <TableCell>
                  <div className="text-xs text-gray-600">
                    {result.document.page_count ?? '-'}
                  </div>
                </TableCell>

                {/* Results Column - Scores displayed line by line */}
                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    <Badge className={`${getScoreBadgeColor(result.scores.sourceScore)} text-xs w-fit whitespace-nowrap`}>
                      Source: {Math.round(result.scores.sourceScore * 100)}%
                    </Badge>
                    <Badge className={`${getScoreBadgeColor(result.scores.targetScore)} text-xs w-fit whitespace-nowrap`}>
                      Target: {Math.round(result.scores.targetScore * 100)}%
                    </Badge>
                    {lengthRatio !== null && Number.isFinite(lengthRatio) && (
                      <Badge variant="outline" className="text-xs w-fit whitespace-nowrap">
                        Ratio: {(lengthRatio / 100).toFixed(2)}
                      </Badge>
                    )}
                  </div>
                </TableCell>

                {/* Action Column */}
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadPdf(result.document)}
                      className="h-8 w-8 p-0"
                      aria-label="Download PDF"
                    >
                      <Download className={`h-4 w-4 ${themeColors.downloadIconColor}`} />
                    </Button>
                    <Button
                      size="sm"
                      className={`h-8 text-white ${themeColors.compareButton}`}
                      onClick={() => handleDraftableCompare(result.document.id)}
                      disabled={comparingDocs.has(result.document.id)}
                    >
                      <GitCompare className="h-4 w-4 mr-1 text-white" />
                      {comparingDocs.has(result.document.id) ? 'Opening...' : 'Draftable'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        </Table>
    </Card>
  )
}
