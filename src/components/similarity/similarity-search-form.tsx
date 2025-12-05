'use client'

import React, { useState, useRef } from 'react'
import { DatabaseDocument as Document } from '@/types/external-apis'
import type { SearchFilters } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Search, Loader2, RotateCcw, X, Scale, UserCircle, ClipboardList, Globe } from 'lucide-react'
import { SimilarityResultsV2 } from './similarity-results-v2'
import {
  LAW_FIRM_OPTIONS,
  FUND_MANAGER_OPTIONS,
  FUND_ADMIN_OPTIONS,
  JURISDICTION_OPTIONS,
} from '@/lib/metadata-constants'
import { clientLogger } from '@/lib/client-logger'

interface SimilaritySearchFormProps {
  documentId: string
  sourceDocument: Document
}

export function SimilaritySearchForm({ documentId, sourceDocument }: SimilaritySearchFormProps) {
  const [isSearching, setIsSearching] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [results, setResults] = useState<any[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [filters, setFilters] = useState<SearchFilters>({
    page_range: {
      use_entire_document: true
    }
  })
  const [sourceMinScore, setSourceMinScore] = useState(0.7)
  const [targetMinScore, setTargetMinScore] = useState(0.7)
  const [topK, setTopK] = useState(10)
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  const pageRange = filters.page_range
  const isPageRangeActive = pageRange?.use_entire_document === false
  const startPage = typeof pageRange?.start_page === 'number' ? pageRange.start_page : undefined
  const endPage = typeof pageRange?.end_page === 'number' ? pageRange.end_page : undefined
  const pageRangeError = (() => {
    if (!isPageRangeActive) return undefined
    if (startPage === undefined || endPage === undefined) {
      return 'Enter both start and end pages.'
    }
    if (startPage < 1 || endPage < 1) {
      return 'Page numbers must be at least 1.'
    }
    if (startPage > endPage) {
      return 'Start page must be less than or equal to end page.'
    }
    return undefined
  })()

  const handleSearch = async () => {
    if (pageRangeError) {
      return
    }

    setIsSearching(true)
    setHasSearched(true)
    // Cancel any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Track the lifetime of this request to avoid stale updates from previous responses
    const nextRequestId = requestIdRef.current + 1
    requestIdRef.current = nextRequestId
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch(`/api/documents/${documentId}/similar-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: {
            ...filters,
            topK
          },
          stage0_topK: 600, // Stage 0: Wide centroid sweep for high recall
          stage1_topK: 250, // Stage 1: Preserve broad candidate set for Stage 2
          source_min_score: sourceMinScore,
          target_min_score: targetMinScore,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error('Failed to search for similar documents')
      }

      const data = await response.json()
      if (requestIdRef.current === nextRequestId) {
        setResults(Array.isArray(data.results) ? data.results : [])
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (requestIdRef.current === nextRequestId) {
          clientLogger.warn('Search cancelled by user')
          setResults([])
        }
      } else {
        clientLogger.error('Similarity search error', error)
        alert('Failed to search for similar documents. Please try again.')
      }
    } finally {
      if (requestIdRef.current === nextRequestId) {
        setIsSearching(false)
        abortControllerRef.current = null
      }
    }
  }

  const handleStopSearch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsSearching(false)
      abortControllerRef.current = null
    }
  }

  const resetSearch = () => {
    setResults([])
    setHasSearched(false)
    setFilters({ 
        page_range: {
        use_entire_document: true
      }
    })
    setTopK(15)
  }

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card className="card-enhanced">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Similarity Search
              </CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={resetSearch}
              disabled={!hasSearched}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Page Range Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Search Scope</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={filters.page_range?.use_entire_document ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilters(prev => ({
                  ...prev,
                  page_range: {
                    ...(prev.page_range ?? {}),
                    use_entire_document: true
                  }
                }))}
              >
                Search entire document
              </Button>
              <Button
                type="button"
                variant={!filters.page_range?.use_entire_document ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilters(prev => ({
                  ...prev,
                  page_range: {
                    ...(prev.page_range ?? {}),
                    use_entire_document: false
                  }
                }))}
              >
                Search specific page range
              </Button>
              {!filters.page_range?.use_entire_document && (
                <div className="flex items-center gap-2">
                  <Input
                    id="startPage"
                    type="number"
                    min="1"
                    placeholder="From"
                    className="h-8 w-24"
                    value={startPage !== undefined ? startPage : ''}
                    aria-invalid={pageRangeError !== undefined}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      page_range: {
                        ...(prev.page_range ?? {}),
                        use_entire_document: false,
                        start_page: e.target.value ? parseInt(e.target.value, 10) : undefined
                      }
                    }))}
                  />
                  <Input
                    id="endPage"
                    type="number"
                    min="1"
                    placeholder="To"
                    className="h-8 w-24"
                    value={endPage !== undefined ? endPage : ''}
                    aria-invalid={pageRangeError !== undefined}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      page_range: {
                        ...(prev.page_range ?? {}),
                        use_entire_document: false,
                        end_page: e.target.value ? parseInt(e.target.value, 10) : undefined
                      }
                    }))}
                  />
                </div>
              )}
              <div className="ml-auto flex gap-2">
                {isSearching ? (
                  <>
                    <Button
                      onClick={handleStopSearch}
                      variant="destructive"
                      size="sm"
                      className="h-8"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Stop
                    </Button>
                    <Button
                      disabled
                      variant="outline"
                      size="sm"
                      className="h-8 px-6 min-w-[240px]"
                    >
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Searching...
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleSearch}
                    size="sm"
                    className="h-8 px-6 min-w-[240px]"
                    disabled={pageRangeError !== undefined}
                  >
                    <Search className="h-3 w-3 mr-1" />
                    Search
                  </Button>
                )}
              </div>
            </div>
            {pageRangeError && (
              <p className="text-xs text-destructive">
                {pageRangeError}
              </p>
            )}
          </div>

          {/* Business Metadata Filters */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Filters</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  <Scale className="h-3 w-3" />
                  Law Firm
                </Label>
                <SearchableMultiSelect
                  options={LAW_FIRM_OPTIONS}
                  values={filters.law_firm ?? []}
                  onValuesChange={(values) =>
                    setFilters(prev => ({
                      ...prev,
                      law_firm: values
                    }))
                  }
                  placeholder="Any law firm"
                  searchPlaceholder="Search law firms..."
                  className="h-7 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  <UserCircle className="h-3 w-3" />
                  Fund Manager
                </Label>
                <SearchableMultiSelect
                  options={FUND_MANAGER_OPTIONS}
                  values={filters.fund_manager ?? []}
                  onValuesChange={(values) =>
                    setFilters(prev => ({
                      ...prev,
                      fund_manager: values
                    }))
                  }
                  placeholder="Any fund manager"
                  searchPlaceholder="Search fund managers..."
                  className="h-7 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  <ClipboardList className="h-3 w-3" />
                  Fund Admin
                </Label>
                <SearchableMultiSelect
                  options={FUND_ADMIN_OPTIONS}
                  values={filters.fund_admin ?? []}
                  onValuesChange={(values) =>
                    setFilters(prev => ({
                      ...prev,
                      fund_admin: values
                    }))
                  }
                  placeholder="Any fund admin"
                  searchPlaceholder="Search fund admins..."
                  className="h-7 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  <Globe className="h-3 w-3" />
                  Jurisdiction
                </Label>
                <SearchableMultiSelect
                  options={JURISDICTION_OPTIONS}
                  values={filters.jurisdiction ?? []}
                  onValuesChange={(values) =>
                    setFilters(prev => ({
                      ...prev,
                      jurisdiction: values
                    }))
                  }
                  placeholder="Any jurisdiction"
                  searchPlaceholder="Search jurisdictions..."
                  className="h-7 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Search Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="topK" className="text-xs">Number of Results</Label>
              <Select value={topK.toString()} onValueChange={(value) => setTopK(parseInt(value))}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 results</SelectItem>
                  <SelectItem value="10">10 results</SelectItem>
                  <SelectItem value="15">15 results</SelectItem>
                  <SelectItem value="20">20 results</SelectItem>
                  <SelectItem value="25">25 results</SelectItem>
                  <SelectItem value="30">30 results</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Minimum Source Score: {Math.round(sourceMinScore * 100)}%</Label>
              <div className="px-1 py-1">
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[Math.round(sourceMinScore * 100)]}
                  onValueChange={value => setSourceMinScore((value[0] ?? 70) / 100)}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Minimum Target Score: {Math.round(targetMinScore * 100)}%</Label>
              <div className="px-1 py-1">
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[Math.round(targetMinScore * 100)]}
                  onValueChange={value => setTargetMinScore((value[0] ?? 70) / 100)}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {hasSearched && (
        <SimilarityResultsV2
          results={results}
          sourceDocument={sourceDocument}
          isLoading={isSearching}
          maxResults={topK}
        />
      )}
    </div>
  )
}
