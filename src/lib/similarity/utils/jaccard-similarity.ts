/**
 * Jaccard Similarity Utility
 *
 * Computes word-level Jaccard similarity between two text strings.
 * Used to filter out paraphrased content while allowing minor variations
 * (e.g., "US" vs "United States").
 *
 * Formula: |A ∩ B| / |A ∪ B|
 * - Intersection: Words present in both texts
 * - Union: All unique words across both texts
 * - Result: 0 (no overlap) to 1 (identical)
 *
 * Example:
 * - "The Investor is a US Person" vs "The Investor is a United States Person"
 *   → High Jaccard (~0.625 for sentence, ~0.90 in full chunk context)
 *
 * - "Investors must submit..." vs "To redeem shares, investors must provide..."
 *   → Low Jaccard (~0.20) - filtered as paraphrase
 */

/**
 * Extract normalized words from text
 *
 * Strategy:
 * - Lowercase normalization (case-insensitive matching)
 * - Remove punctuation
 * - Keep ALL words including stop words (important for this use case)
 * - No stemming/lemmatization (want exact lexical matches)
 *
 * @param text - Input text to extract words from
 * @returns Array of normalized words
 */
export function extractWords(text: string): string[] {
  if (!text) return []

  return text
    .toLowerCase()                      // Normalize case: "Investor" → "investor"
    .replace(/[^\w\s]/g, ' ')          // Remove punctuation: "Person." → "Person "
    .split(/\s+/)                       // Split on whitespace
    .filter(word => word.length > 0)    // Remove empty strings
}

/**
 * Compute Jaccard similarity between two text strings
 *
 * @param textA - First text
 * @param textB - Second text
 * @returns Jaccard similarity score (0 to 1)
 *
 * @example
 * ```typescript
 * // Minor variation (should match)
 * jaccardSimilarity(
 *   "The Investor is a US Person",
 *   "The Investor is a United States Person"
 * ) // → 0.625
 *
 * // Paraphrase (should not match)
 * jaccardSimilarity(
 *   "Investors must submit redemption requests in writing",
 *   "To redeem shares, investors must provide written notice"
 * ) // → ~0.20
 * ```
 */
export function jaccardSimilarity(textA: string, textB: string): number {
  const wordsA = extractWords(textA)
  const wordsB = extractWords(textB)

  // Handle empty inputs
  if (wordsA.length === 0 && wordsB.length === 0) {
    return 1.0  // Both empty = identical
  }
  if (wordsA.length === 0 || wordsB.length === 0) {
    return 0.0  // One empty = no similarity
  }

  // Convert to Sets for efficient intersection/union operations
  const setA = new Set(wordsA)
  const setB = new Set(wordsB)

  // Calculate intersection: words present in both
  const intersection = new Set([...setA].filter(word => setB.has(word)))

  // Calculate union: all unique words across both texts
  const union = new Set([...setA, ...setB])

  // Jaccard coefficient: |A ∩ B| / |A ∪ B|
  return intersection.size / union.size
}

/**
 * Check if two texts meet a Jaccard similarity threshold
 *
 * @param textA - First text
 * @param textB - Second text
 * @param threshold - Minimum Jaccard score required (0 to 1)
 * @returns True if Jaccard similarity >= threshold
 *
 * @example
 * ```typescript
 * meetsJaccardThreshold(
 *   "The Investor is a US Person. Minimum investment is $100,000.",
 *   "The Investor is a United States Person. Minimum investment is $100,000.",
 *   0.60
 * ) // → true (high overlap despite "US" vs "United States")
 * ```
 */
export function meetsJaccardThreshold(
  textA: string,
  textB: string,
  threshold: number
): boolean {
  if (threshold <= 0) {
    return true  // Threshold disabled
  }

  const similarity = jaccardSimilarity(textA, textB)
  return similarity >= threshold
}
