/**
 * Stage 1: Candidate-Aware Chunk-Level Pre-Filter
 * CRITICAL: Only aggregates candidates from Stage 0 (prevents noise from long-tail docs)
 * Reduces ~600 candidates → ~250 high-quality candidates in 5-20 seconds
 *
 * Purpose: Estimate coverage quickly, filter to small set for exact scoring
 */

import { getQdrantClient } from '@/lib/qdrant'
import { logger } from '@/lib/logger'
import { Chunk, Stage1Result } from '../types'

/**
 * Pre-filter candidates using chunk-level ANN matching
 * CRITICAL: Candidate-aware (only counts matches for Stage 0 candidates)
 *
 * @param sourceChunks - All chunks from source document
 * @param stage0CandidateIds - Candidate IDs from Stage 0 (filter to these only!)
 * @param options - Configuration options
 * @returns Top K candidates ranked by unique matched chunk count
 */
export async function stage1ChunkPrefilter(
  sourceChunks: Chunk[],
  stage0CandidateIds: string[],
  options: {
    topK?: number
    neighborsPerChunk?: number
    batchSize?: number
  } = {}
): Promise<Stage1Result> {

  const startTime = Date.now()
  const { topK = 250, neighborsPerChunk = 30, batchSize = 150 } = options

  try {
    logger.info('Stage 1: starting chunk-level pre-filter', {
      sourceChunkCount: sourceChunks.length,
      candidateCount: stage0CandidateIds.length,
      topK,
      neighborsPerChunk,
      batchSize
    })

    // CRITICAL: Create set for O(1) candidate lookup
    const stage0Set = new Set(stage0CandidateIds)

    // Track unique query chunks matched per candidate
    const candidateMatchCounts = new Map<string, Set<string>>()

    // Process chunks in batches for better performance
    for (let i = 0; i < sourceChunks.length; i += batchSize) {
      const batch = sourceChunks.slice(i, i + batchSize)

      // Parse embeddings if stored as strings in Supabase
      const chunkVectorPairs = batch.map(chunk => {
        let embeddingValue: unknown = chunk.embedding

        if (typeof embeddingValue === 'string') {
          try {
            embeddingValue = JSON.parse(embeddingValue)
          } catch (parseError) {
            logger.error(
              'Stage 1: failed to parse chunk embedding',
              parseError instanceof Error ? parseError : new Error(String(parseError)),
              { chunkId: chunk.id }
            )
            return null
          }
        }

        if (!Array.isArray(embeddingValue) || !embeddingValue.every(value => typeof value === 'number')) {
          logger.error(
            'Stage 1: chunk embedding is not a numeric array',
            undefined,
            {
              chunkId: chunk.id,
              type: typeof embeddingValue
            }
          )
          return null
        }

        return {
          chunk,
          vector: embeddingValue as number[]
        }
      }).filter((pair): pair is { chunk: Chunk; vector: number[] } => pair !== null)

      if (chunkVectorPairs.length === 0) {
        logger.warn('Stage 1: batch has no valid embeddings, skipping', { batchStartIndex: i })
        continue
      }

      // Query each vector individually
      const client = getQdrantClient()
      const collectionName = process.env['QDRANT_COLLECTION_NAME'] || 'documents'

      const batchQueryPromises = chunkVectorPairs.map(({ vector }) =>
        client.search(collectionName, {
          vector,
          limit: neighborsPerChunk,
          with_payload: true,
          with_vector: false
        })
      )

      const batchResults = await Promise.all(batchQueryPromises)

      // Process results for each query chunk in batch
      for (let j = 0; j < chunkVectorPairs.length; j++) {
        const pair = chunkVectorPairs[j]
        if (!pair) continue
        const { chunk: queryChunk } = pair
        const queryResult = batchResults[j]
        const neighbors = queryResult || []

        // NMS: Each query chunk contributes ≤1 match per candidate
        const seenCandidates = new Set<string>()

        for (const neighbor of neighbors) {
          const payload = neighbor.payload as { document_id?: string } | undefined
          const candidateDocId = payload?.document_id
          if (!candidateDocId) continue

          // ← CRITICAL: Only count Stage 0 candidates!
          if (!stage0Set.has(candidateDocId)) continue

          // NMS: Skip if already matched this candidate with this query chunk
          if (seenCandidates.has(candidateDocId)) continue
          seenCandidates.add(candidateDocId)

          // Track unique query chunks matched per candidate
          if (!candidateMatchCounts.has(candidateDocId)) {
            candidateMatchCounts.set(candidateDocId, new Set())
          }
          candidateMatchCounts.get(candidateDocId)!.add(queryChunk.id)
        }
      }
    }

    // Rank candidates by unique matched chunk count (NOT avg similarity!)
    const ranked = Array.from(candidateMatchCounts.entries())
      .map(([docId, matchedQueryChunks]) => ({
        docId,
        matchCount: matchedQueryChunks.size
      }))
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, topK)

    const candidateIds = ranked.map(r => r.docId)
    const matchCounts = ranked.map(r => r.matchCount)

    const timeMs = Date.now() - startTime

    logger.info('Stage 1: completed chunk pre-filter', {
      candidateCount: candidateIds.length,
      durationMs: timeMs,
      averageMatchedChunks: matchCounts.length > 0
        ? Number((matchCounts.reduce((sum, count) => sum + count, 0) / matchCounts.length).toFixed(1))
        : null
    })

    return { candidateIds, matchCounts, timeMs }

  } catch (error) {
    const timeMs = Date.now() - startTime
    logger.error(
      'Stage 1 failed',
      error instanceof Error ? error : new Error(String(error)),
      { durationMs: timeMs }
    )
    throw error
  }
}

/**
 * Estimate match coverage for a candidate
 * Useful for early filtering decisions
 */
export function estimateMatchCoverage(
  matchedChunkCount: number,
  totalSourceChunks: number
): {
  coverage: number  // Percentage of source chunks matched
  quality: 'high' | 'medium' | 'low'
} {

  const coverage = (matchedChunkCount / totalSourceChunks) * 100

  let quality: 'high' | 'medium' | 'low'
  if (coverage > 30) {
    quality = 'high'
  } else if (coverage > 10) {
    quality = 'medium'
  } else {
    quality = 'low'
  }

  return { coverage, quality }
}

/**
 * Filter candidates by minimum match count threshold
 * Use to reduce Stage 2 workload for very low-match candidates
 */
export function filterByMinimumMatches(
  stage1Result: Stage1Result,
  minMatchCount: number = 5
): Stage1Result {

  const filtered: { id: string; count: number }[] = []

  for (let i = 0; i < stage1Result.candidateIds.length; i++) {
    const candidateId = stage1Result.candidateIds[i]
    const matchCount = stage1Result.matchCounts[i]
    if (candidateId === undefined || matchCount === undefined) {
      continue
    }

    if (matchCount >= minMatchCount) {
      filtered.push({
        id: candidateId,
        count: matchCount
      })
    }
  }

  return {
    candidateIds: filtered.map(f => f.id),
    matchCounts: filtered.map(f => f.count),
    timeMs: stage1Result.timeMs
  }
}
