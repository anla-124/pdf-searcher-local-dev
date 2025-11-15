/* eslint-disable no-console */
/**
 * Verify that threshold changes reduce false positives
 * Tests the full similarity search pipeline with different Jaccard thresholds
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local explicitly
config({ path: resolve(process.cwd(), '.env.local') })

import { executeSimilaritySearch } from '@/lib/similarity/orchestrator'

interface TestResult {
  threshold: number
  totalResults: number
  notSimilarDocFound: boolean
  notSimilarDocScore?: {
    sourceScore: number
    targetScore: number
    matchedChunks: number
    averageJaccard?: number
  }
  topResults: Array<{
    id: string
    title: string
    sourceScore: number
    targetScore: number
    matchedChunks: number
    averageJaccard?: number
    minJaccard?: number
    maxJaccard?: number
  }>
  timing: {
    stage0: number
    stage1: number
    stage2: number
    total: number
  }
}

async function testWithJaccardThreshold(
  sourceDocId: string,
  expectedNotSimilarDocId: string,
  jaccardThreshold: number
): Promise<TestResult> {

  // Temporarily override env variable for this test
  const originalThreshold = process.env['STAGE2_JACCARD_THRESHOLD']
  process.env['STAGE2_JACCARD_THRESHOLD'] = String(jaccardThreshold)

  try {
    const result = await executeSimilaritySearch(sourceDocId, {
      stage0_topK: 600,
      stage1_topK: 250,
      stage2_parallelWorkers: 1  // Use single worker for predictable timing
    })

    // Check if the "not similar" document appears in results
    const notSimilarDoc = result.results.find(r => r.document.id === expectedNotSimilarDocId)

    const topResults = result.results.slice(0, 5).map(doc => ({
      id: doc.document.id,
      title: doc.document.title || doc.document.filename,
      sourceScore: doc.scores.sourceScore,
      targetScore: doc.scores.targetScore,
      matchedChunks: doc.matchedChunks,
      averageJaccard: doc.scores.averageJaccard,
      minJaccard: doc.scores.minJaccard,
      maxJaccard: doc.scores.maxJaccard
    }))

    return {
      threshold: jaccardThreshold,
      totalResults: result.results.length,
      notSimilarDocFound: !!notSimilarDoc,
      notSimilarDocScore: notSimilarDoc ? {
        sourceScore: notSimilarDoc.scores.sourceScore,
        targetScore: notSimilarDoc.scores.targetScore,
        matchedChunks: notSimilarDoc.matchedChunks,
        averageJaccard: notSimilarDoc.scores.averageJaccard
      } : undefined,
      topResults,
      timing: {
        stage0: result.timing.stage0_ms,
        stage1: result.timing.stage1_ms,
        stage2: result.timing.stage2_ms,
        total: result.timing.total_ms
      }
    }
  } finally {
    // Restore original threshold
    if (originalThreshold !== undefined) {
      process.env['STAGE2_JACCARD_THRESHOLD'] = originalThreshold
    } else {
      delete process.env['STAGE2_JACCARD_THRESHOLD']
    }
  }
}

async function verifyThresholdChanges(sourceDocId: string, expectedNotSimilarDocId: string) {
  console.log('='.repeat(80))
  console.log('JACCARD THRESHOLD VERIFICATION TEST')
  console.log('='.repeat(80))
  console.log()
  console.log(`Source Document: ${sourceDocId}`)
  console.log(`Expected NOT Similar Document: ${expectedNotSimilarDocId}`)
  console.log()
  console.log(`Base Thresholds:`)
  console.log(`  STAGE2_THRESHOLD (Cosine): ${process.env['STAGE2_THRESHOLD'] || '0.90'}`)
  console.log(`  STAGE2_JACCARD_THRESHOLD: Testing 0, 0.50, 0.60, 0.70`)
  console.log()

  const thresholdsToTest = [0, 0.50, 0.60, 0.70]
  const results: TestResult[] = []

  for (const threshold of thresholdsToTest) {
    console.log('='.repeat(80))
    console.log(`TESTING: Jaccard Threshold = ${threshold.toFixed(2)}${threshold === 0 ? ' (DISABLED)' : ''}`)
    console.log('='.repeat(80))
    console.log()
    console.log('Running similarity search...')

    const result = await testWithJaccardThreshold(sourceDocId, expectedNotSimilarDocId, threshold)
    results.push(result)

    console.log(`✓ Complete in ${result.timing.total}ms`)
    console.log(`  Total Results: ${result.totalResults}`)
    console.log(`  Not-Similar Doc Found: ${result.notSimilarDocFound ? '⚠️  YES' : '✅ NO'}`)
    console.log()
  }

  // ========================================================================
  // COMPARISON TABLE
  // ========================================================================
  console.log()
  console.log('='.repeat(80))
  console.log('COMPARISON: Impact of Jaccard Threshold')
  console.log('='.repeat(80))
  console.log()
  console.log('Jaccard | Total   | Not-Similar | Stage 2   | Avg Jaccard')
  console.log('Thresh  | Results | Doc Found?  | Time (ms) | (Top Result)')
  console.log('-'.repeat(80))

  for (const result of results) {
    const notSimilarStatus = result.notSimilarDocFound ? '⚠️  YES' : '✅ NO '
    const avgJaccard = result.topResults[0]?.averageJaccard
      ? result.topResults[0].averageJaccard.toFixed(2)
      : 'N/A'

    console.log(
      `${result.threshold.toFixed(2)}    | ` +
      `${result.totalResults.toString().padStart(7)} | ` +
      `${notSimilarStatus}     | ` +
      `${result.timing.stage2.toString().padStart(9)} | ` +
      `${avgJaccard.padStart(12)}`
    )
  }

  console.log()

  // ========================================================================
  // DETAILED COMPARISON
  // ========================================================================
  console.log('='.repeat(80))
  console.log('DETAILED RESULTS BY THRESHOLD')
  console.log('='.repeat(80))
  console.log()

  for (const result of results) {
    console.log('-'.repeat(80))
    console.log(`Jaccard Threshold: ${result.threshold.toFixed(2)}${result.threshold === 0 ? ' (DISABLED - Cosine Only)' : ''}`)
    console.log('-'.repeat(80))
    console.log()

    // Check for not-similar document
    if (result.notSimilarDocFound && result.notSimilarDocScore) {
      console.log('⚠️  WARNING: Expected NOT similar document found in results!')
      console.log(`  Source Score: ${(result.notSimilarDocScore.sourceScore * 100).toFixed(1)}%`)
      console.log(`  Target Score: ${(result.notSimilarDocScore.targetScore * 100).toFixed(1)}%`)
      console.log(`  Matched Chunks: ${result.notSimilarDocScore.matchedChunks}`)
      if (result.notSimilarDocScore.averageJaccard !== undefined) {
        console.log(`  Average Jaccard: ${result.notSimilarDocScore.averageJaccard.toFixed(3)}`)
      }
      console.log()
    } else {
      console.log('✅ SUCCESS: Not-similar document correctly filtered out')
      console.log()
    }

    // Top 3 results
    console.log('Top 3 Results:')
    console.log()
    for (let i = 0; i < Math.min(3, result.topResults.length); i++) {
      const doc = result.topResults[i]!
      console.log(`${i + 1}. ${doc.title}`)
      console.log(`   ID: ${doc.id.substring(0, 8)}...`)
      console.log(`   Source Score: ${(doc.sourceScore * 100).toFixed(1)}% | Target Score: ${(doc.targetScore * 100).toFixed(1)}%`)
      console.log(`   Matched Chunks: ${doc.matchedChunks}`)
      if (doc.averageJaccard !== undefined) {
        console.log(`   Jaccard: Avg=${doc.averageJaccard.toFixed(3)}, Min=${doc.minJaccard?.toFixed(3)}, Max=${doc.maxJaccard?.toFixed(3)}`)
      }
      console.log()
    }
  }

  // ========================================================================
  // RECOMMENDATIONS
  // ========================================================================
  console.log('='.repeat(80))
  console.log('RECOMMENDATIONS')
  console.log('='.repeat(80))
  console.log()

  const baseline = results.find(r => r.threshold === 0)!
  const recommended = results.find(r => r.threshold === 0.60)!

  if (baseline.notSimilarDocFound && !recommended.notSimilarDocFound) {
    console.log('✅ JACCARD FILTERING IS EFFECTIVE!')
    console.log()
    console.log(`  Without Jaccard (0.00): ${baseline.totalResults} results, NOT-similar doc FOUND ⚠️`)
    console.log(`  With Jaccard (0.60):    ${recommended.totalResults} results, NOT-similar doc FILTERED ✅`)
    console.log()
    console.log('  Recommendation: Use STAGE2_JACCARD_THRESHOLD=0.60')
  } else if (!baseline.notSimilarDocFound) {
    console.log('ℹ️  NOT-SIMILAR DOCUMENT ALREADY FILTERED WITHOUT JACCARD')
    console.log()
    console.log('  The cosine threshold (0.90) is already sufficient for these documents.')
    console.log('  Jaccard provides additional precision but may not be necessary.')
    console.log()
    console.log('  Recommendation: Test with other document pairs to validate Jaccard benefit')
  } else {
    console.log('⚠️  NOT-SIMILAR DOCUMENT STILL APPEARING IN RESULTS')
    console.log()
    console.log('  Consider:')
    console.log('  1. Increase Jaccard threshold to 0.70')
    console.log('  2. Increase cosine threshold (STAGE2_THRESHOLD) to 0.91-0.92')
    console.log('  3. Check if documents truly are dissimilar')
  }

  console.log()
  console.log('='.repeat(80))
  console.log('VERIFICATION COMPLETE')
  console.log('='.repeat(80))
}

// Main execution
const sourceDoc = process.argv[2] || '68fb610f-2cb7-4f1a-9082-fbefc6122356'
const notSimilarDoc = process.argv[3] || '2f7382c3-5afb-4720-83cb-0c827ed0363d'

verifyThresholdChanges(sourceDoc, notSimilarDoc)
  .then(() => {
    console.log()
    process.exit(0)
  })
  .catch((error) => {
    console.error('Verification failed:', error)
    process.exit(1)
  })
