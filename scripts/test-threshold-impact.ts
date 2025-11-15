/* eslint-disable no-console */
/**
 * Test how different thresholds affect the sourceScore
 * This helps find the optimal threshold to filter out boilerplate matches
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local explicitly
config({ path: resolve(process.cwd(), '.env.local') })

import { createServiceClient, releaseServiceClient } from '@/lib/supabase/server'
import { cosineSimilarity } from '@/lib/similarity/utils/vector-operations'
import { countCharacters } from '@/lib/chunking/paragraph-chunker'
import { computeAdaptiveScore } from '@/lib/similarity/core/adaptive-scoring'

interface Chunk {
  id: string
  index: number
  text: string
  characterCount: number
  embedding: number[]
}

interface ChunkMatch {
  chunkA: {
    id: string
    index: number
    pageNumber: number
    characterCount: number
  }
  chunkB: {
    id: string
    index: number
    pageNumber: number
    characterCount: number
  }
  score: number
}

async function fetchDocumentChunks(documentId: string): Promise<Chunk[]> {
  const supabase = await createServiceClient()
  try {
    const { data, error } = await supabase
      .from('document_embeddings')
      .select('chunk_index, chunk_text, character_count, embedding, page_number')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true })

    if (error || !data) {
      throw new Error(`Failed to fetch chunks for ${documentId}: ${error?.message}`)
    }

    const chunks: Chunk[] = []
    for (const row of data) {
      let embedding = row.embedding
      if (typeof embedding === 'string') {
        embedding = JSON.parse(embedding)
      }

      if (!Array.isArray(embedding)) {
        console.warn(`Skipping chunk ${row.chunk_index} - invalid embedding`)
        continue
      }

      const chunkText = String(row.chunk_text || '')
      const charCount = (row.character_count as number) ?? (chunkText ? countCharacters(chunkText) : 0)

      chunks.push({
        id: `${documentId}_chunk_${Number(row.chunk_index)}`,
        index: Number(row.chunk_index),
        text: chunkText,
        characterCount: charCount,
        embedding: embedding as number[]
      })
    }

    return chunks
  } finally {
    releaseServiceClient(supabase)
  }
}

async function testThresholdImpact(docIdA: string, docIdB: string) {
  console.log('='.repeat(80))
  console.log('THRESHOLD IMPACT ANALYSIS')
  console.log('='.repeat(80))
  console.log(`Source Document: ${docIdA}`)
  console.log(`Target Document: ${docIdB}`)
  console.log()

  // Fetch chunks
  console.log('Fetching chunks...')
  const [chunksA, chunksB] = await Promise.all([
    fetchDocumentChunks(docIdA),
    fetchDocumentChunks(docIdB)
  ])

  const totalCharsA = chunksA.reduce((sum, c) => sum + c.characterCount, 0)
  const totalCharsB = chunksB.reduce((sum, c) => sum + c.characterCount, 0)

  console.log(`Source: ${chunksA.length} chunks, ${totalCharsA} total characters`)
  console.log(`Target: ${chunksB.length} chunks, ${totalCharsB} total characters`)
  console.log()

  // Compute all pairwise similarities
  console.log('Computing pairwise similarities...')
  interface PairMatch {
    chunkA: Chunk
    chunkB: Chunk
    similarity: number
  }

  const allPairs: PairMatch[] = []
  for (const chunkA of chunksA) {
    for (const chunkB of chunksB) {
      const similarity = cosineSimilarity(chunkA.embedding, chunkB.embedding)
      allPairs.push({ chunkA, chunkB, similarity })
    }
  }

  // Test different thresholds
  const thresholds = [0.85, 0.87, 0.88, 0.89, 0.90, 0.91, 0.92, 0.93, 0.94, 0.95]

  console.log('='.repeat(80))
  console.log('TESTING DIFFERENT THRESHOLDS')
  console.log('='.repeat(80))
  console.log()
  console.log('Threshold | Matches | SourceScore | TargetScore | Matched Chars')
  console.log('-'.repeat(80))

  for (const threshold of thresholds) {
    // Find best match for each source chunk
    const matches: ChunkMatch[] = []

    for (const chunkA of chunksA) {
      const candidates = allPairs.filter(p =>
        p.chunkA.id === chunkA.id && p.similarity >= threshold
      )

      if (candidates.length === 0) continue

      // Find best match
      const best = candidates.reduce((prev, curr) =>
        curr.similarity > prev.similarity ? curr : prev
      )

      matches.push({
        chunkA: {
          id: chunkA.id,
          index: chunkA.index,
          pageNumber: 1,
          characterCount: chunkA.characterCount
        },
        chunkB: {
          id: best.chunkB.id,
          index: best.chunkB.index,
          pageNumber: 1,
          characterCount: best.chunkB.characterCount
        },
        score: best.similarity
      })
    }

    // Compute adaptive score
    if (matches.length === 0) {
      console.log(`${threshold.toFixed(2)}    |    0    |     0.0%    |     0.0%    |       0`)
      continue
    }

    const scores = computeAdaptiveScore(matches, totalCharsA, totalCharsB)

    const sourceScorePct = (scores.sourceScore * 100).toFixed(1)
    const targetScorePct = (scores.targetScore * 100).toFixed(1)

    console.log(
      `${threshold.toFixed(2)}    | ${matches.length.toString().padStart(4)}   | ` +
      `${sourceScorePct.padStart(7)}%    | ${targetScorePct.padStart(7)}%    | ` +
      `${scores.matchedSourceCharacters.toString().padStart(7)}`
    )
  }

  console.log()
  console.log('='.repeat(80))
  console.log('RECOMMENDATION')
  console.log('='.repeat(80))
  console.log()
  console.log('Look for the threshold where:')
  console.log('1. SourceScore drops below 10-20% (filters out boilerplate)')
  console.log('2. Still retains some matches (not too aggressive)')
  console.log()
  console.log('If even 0.95 threshold shows high sourceScore, then these documents')
  console.log('share significant identical content (not just boilerplate).')
}

// Main execution
const docA = process.argv[2] || '68fb610f-2cb7-4f1a-9082-fbefc6122356'
const docB = process.argv[3] || '2f7382c3-5afb-4720-83cb-0c827ed0363d'

testThresholdImpact(docA, docB)
  .then(() => {
    console.log()
    console.log('Analysis complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
