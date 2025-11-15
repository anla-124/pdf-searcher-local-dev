/* eslint-disable no-console */
/**
 * Analyze cosine similarity distribution between two documents
 * This helps determine the optimal threshold for filtering paraphrases
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local explicitly
config({ path: resolve(process.cwd(), '.env.local') })

import { createServiceClient, releaseServiceClient } from '@/lib/supabase/server'
import { cosineSimilarity } from '@/lib/similarity/utils/vector-operations'
import { countCharacters } from '@/lib/chunking/paragraph-chunker'

interface Chunk {
  id: string
  index: number
  text: string
  characterCount: number
  embedding: number[]
}

async function fetchDocumentChunks(documentId: string): Promise<Chunk[]> {
  const supabase = await createServiceClient()
  try {
    const { data, error } = await supabase
      .from('document_embeddings')
      .select('chunk_index, chunk_text, character_count, embedding')
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

interface Match {
  chunkAIndex: number
  chunkBIndex: number
  chunkAText: string
  chunkBText: string
  similarity: number
  chunkAChars: number
  chunkBChars: number
}

async function analyzeDocumentPair(docIdA: string, docIdB: string) {
  console.log('='.repeat(80))
  console.log('DOCUMENT SIMILARITY ANALYSIS')
  console.log('='.repeat(80))
  console.log(`Document A: ${docIdA}`)
  console.log(`Document B: ${docIdB}`)
  console.log()

  // Fetch chunks
  console.log('Fetching chunks...')
  const [chunksA, chunksB] = await Promise.all([
    fetchDocumentChunks(docIdA),
    fetchDocumentChunks(docIdB)
  ])

  console.log(`Document A: ${chunksA.length} chunks`)
  console.log(`Document B: ${chunksB.length} chunks`)
  console.log()

  // Compute all pairwise similarities
  console.log('Computing pairwise similarities...')
  const allMatches: Match[] = []

  for (const chunkA of chunksA) {
    for (const chunkB of chunksB) {
      const similarity = cosineSimilarity(chunkA.embedding, chunkB.embedding)
      allMatches.push({
        chunkAIndex: chunkA.index,
        chunkBIndex: chunkB.index,
        chunkAText: chunkA.text.substring(0, 200), // First 200 chars for preview
        chunkBText: chunkB.text.substring(0, 200),
        similarity,
        chunkAChars: chunkA.characterCount,
        chunkBChars: chunkB.characterCount
      })
    }
  }

  // Sort by similarity (highest first)
  allMatches.sort((a, b) => b.similarity - a.similarity)

  // Analyze distribution
  console.log('='.repeat(80))
  console.log('SIMILARITY SCORE DISTRIBUTION')
  console.log('='.repeat(80))

  const thresholds = [0.95, 0.93, 0.90, 0.87, 0.85, 0.82, 0.80, 0.75]
  for (const threshold of thresholds) {
    const count = allMatches.filter(m => m.similarity >= threshold).length
    const percentage = ((count / allMatches.length) * 100).toFixed(2)
    console.log(`>= ${threshold.toFixed(2)}: ${count.toString().padStart(6)} matches (${percentage}%)`)
  }

  console.log()
  console.log(`Total pairs analyzed: ${allMatches.length}`)
  console.log()

  // Show top 20 matches
  console.log('='.repeat(80))
  console.log('TOP 20 HIGHEST SIMILARITY MATCHES')
  console.log('='.repeat(80))

  for (let i = 0; i < Math.min(20, allMatches.length); i++) {
    const match = allMatches[i]
    if (!match) continue
    console.log()
    console.log(`Match #${i + 1}: Score = ${match.similarity.toFixed(4)}`)
    console.log(`Chunk A[${match.chunkAIndex}] (${match.chunkAChars} chars):`)
    console.log(`  "${match.chunkAText}${match.chunkAText.length >= 200 ? '...' : ''}"`)
    console.log(`Chunk B[${match.chunkBIndex}] (${match.chunkBChars} chars):`)
    console.log(`  "${match.chunkBText}${match.chunkBText.length >= 200 ? '...' : ''}"`)
  }

  // Show borderline matches (0.88-0.92 range)
  console.log()
  console.log('='.repeat(80))
  console.log('BORDERLINE MATCHES (0.88 - 0.92 range)')
  console.log('='.repeat(80))
  console.log('These would PASS with 0.85 threshold but might FAIL with 0.90+ threshold')
  console.log()

  const borderline = allMatches.filter(m => m.similarity >= 0.88 && m.similarity <= 0.92)

  for (let i = 0; i < Math.min(10, borderline.length); i++) {
    const match = borderline[i]
    if (!match) continue
    console.log()
    console.log(`Score = ${match.similarity.toFixed(4)}`)
    console.log(`Chunk A[${match.chunkAIndex}]:`)
    console.log(`  "${match.chunkAText}${match.chunkAText.length >= 200 ? '...' : ''}"`)
    console.log(`Chunk B[${match.chunkBIndex}]:`)
    console.log(`  "${match.chunkBText}${match.chunkBText.length >= 200 ? '...' : ''}"`)
  }

  console.log()
  console.log('='.repeat(80))
  console.log('ANALYSIS COMPLETE')
  console.log('='.repeat(80))
  console.log()
  console.log('RECOMMENDATIONS:')
  console.log()

  const matches90 = allMatches.filter(m => m.similarity >= 0.90).length
  const matches85 = allMatches.filter(m => m.similarity >= 0.85).length

  console.log(`Current threshold (0.85): ${matches85} matches`)
  console.log(`With threshold (0.90): ${matches90} matches (${((matches90/matches85)*100).toFixed(1)}% retained)`)
  console.log()

  if (matches90 < matches85 * 0.5) {
    console.log('⚠️  WARNING: 0.90 threshold filters out >50% of matches')
    console.log('   This might be too aggressive. Consider 0.87-0.88 instead.')
  } else if (matches90 < matches85 * 0.8) {
    console.log('✅ 0.90 threshold filters 20-50% of matches')
    console.log('   This could be effective if the filtered matches are paraphrases.')
  } else {
    console.log('ℹ️  0.90 threshold filters <20% of matches')
    console.log('   You may need lexical filtering for more selectivity.')
  }

  console.log()
  console.log('ACTION: Review the "BORDERLINE MATCHES" section above.')
  console.log('        If those are paraphrases you want to exclude → use 0.90+ threshold')
  console.log('        If those are acceptable matches → keep 0.85 and add lexical filter')
}

// Main execution
const docA = process.argv[2] || '68fb610f-2cb7-4f1a-9082-fbefc6122356'
const docB = process.argv[3] || '2f7382c3-5afb-4720-83cb-0c827ed0363d'

analyzeDocumentPair(docA, docB)
  .then(() => {
    console.log()
    console.log('Analysis complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
