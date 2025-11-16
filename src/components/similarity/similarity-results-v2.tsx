'use client'

import { DatabaseDocument as Document } from '@/types/external-apis'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Search
} from 'lucide-react'
import { SearchResultsTable } from './search-results-table'

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
  // Apply max results limit if specified
  const limitedResults = maxResults && maxResults > 0
    ? results.slice(0, maxResults)
    : results

  return (
    <>
      <div className="mb-4">
        <Card className="card-enhanced">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Similarity Results
                </CardTitle>
                <CardDescription>
                  Showing {limitedResults.length} of {results.length} similar document{results.length !== 1 ? 's' : ''} to &quot;{sourceDocument.title}&quot;
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      <SearchResultsTable
        results={limitedResults}
        sourceDocument={sourceDocument}
        theme="blue"
        isLoading={isLoading}
      />
    </>
  )
}
