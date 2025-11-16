'use client'

import { useEffect, useState, useMemo } from 'react'
import { DatabaseDocument as Document } from '@/types/external-apis'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Sparkles
} from 'lucide-react'
import { clientLogger } from '@/lib/client-logger'
import { SearchResultsTable } from './search-results-table'

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

  // Transform results to the format expected by SearchResultsTable
  const transformedResults = useMemo(() => {
    return results.map(result => ({
      document: result.document,
      scores: {
        sourceScore: result.scores?.sourceScore ?? result.score,
        targetScore: result.scores?.targetScore ?? 0,
        matchedSourceCharacters: result.scores?.matchedSourceCharacters ?? 0,
        matchedTargetCharacters: result.scores?.matchedTargetCharacters ?? 0,
        explanation: '',
        lengthRatio: result.scores?.lengthRatio ?? null
      },
      matchedChunkCount: result.matching_chunks?.length ?? 0,
      sections: []
    }))
  }, [results])

  if (!sourceDocument) {
    return (
      <Card className="card-enhanced">
        <CardContent className="py-12 text-center space-y-3">
          <Sparkles className="mx-auto h-10 w-10 text-emerald-500" />
          <CardTitle className="text-lg">Select a source document to start</CardTitle>
          <CardDescription className="max-w-md mx-auto">
            Pick a document from the dashboard, then choose specific targets here to run a focused similarity search.
          </CardDescription>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="card-enhanced">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-500" />
                Selected Search Results
              </CardTitle>
              <CardDescription>
                Showing {transformedResults.length} selected document{transformedResults.length === 1 ? '' : 's'} compared to &quot;{sourceDocument.title}&quot;
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <SearchResultsTable
        results={transformedResults}
        sourceDocument={sourceDocument}
        theme="emerald"
        isLoading={isComparing}
      />
    </div>
  )
}
