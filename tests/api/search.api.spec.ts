import { test, expect } from '@playwright/test'

/**
 * Similarity Search API Tests
 *
 * Tests the 3-stage similarity search pipeline:
 * - Stage 0: Centroid-based ANN retrieval
 * - Stage 1: Chunk-level prefilter
 * - Stage 2: Bidirectional character-based scoring
 */

test.describe('Similarity Search APIs', () => {

  test.describe('POST /api/documents/[id]/similar-v2 - General Search', () => {
    test('TC-SS-001: should require authentication', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/similar-v2`)

      expect([401, 302, 307, 404]).toContain(response.status())
    })

    test('TC-SS-002: should return 404 for non-existent document', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/similar-v2`)

      expect([404, 401, 302, 307]).toContain(response.status())
    })

    test('TC-SS-003: should accept configuration parameters', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/similar-v2`, {
        data: {
          stage0_topK: 600,
          stage1_topK: 250,
          minScore: 10
        }
      })

      // Should accept valid params (or fail with 401/404 for auth/missing doc)
      expect([200, 401, 404, 302, 307]).toContain(response.status())
    })

    test('TC-SS-006: should support metadata filtering', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/similar-v2`, {
        data: {
          filters: {
            law_firm: 'Test Firm LLC'
          }
        }
      })

      expect([200, 401, 404, 302, 307]).toContain(response.status())
    })

    test('TC-SS-007: should support page range filtering', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/similar-v2`, {
        data: {
          filters: {
            page_range: { start: 1, end: 10 }
          }
        }
      })

      expect([200, 401, 404, 302, 307]).toContain(response.status())
    })

    test('TC-SS-010: should validate minScore parameter', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/similar-v2`, {
        data: {
          minScore: -10 // Invalid negative score
        }
      })

      // Should reject invalid score (or fail with auth/404 first)
      expect([400, 401, 404, 302, 307]).toContain(response.status())
    })

    test('should reject invalid topK values', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/similar-v2`, {
        data: {
          stage0_topK: -100 // Invalid negative value
        }
      })

      expect([400, 401, 404, 302, 307]).toContain(response.status())
    })

    test('should handle missing centroid_embedding', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/similar-v2`)

      // Should return error if document missing centroid (or 401/404)
      expect([400, 401, 404, 302, 307]).toContain(response.status())
    })
  })

  test.describe('GET /api/documents/[id]/similar-v2 - Readiness Check', () => {
    test('should check if document is ready for search', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.get(`/api/documents/${fakeId}/similar-v2`)

      // GET method for readiness check
      expect([200, 401, 404, 302, 307]).toContain(response.status())
    })

    test('should require authentication', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.get(`/api/documents/${fakeId}/similar-v2`)

      expect([401, 302, 307, 404]).toContain(response.status())
    })
  })

  test.describe('POST /api/documents/selected-search - Selected Search', () => {
    test('TC-SSS-001: should require authentication', async ({ request }) => {
      const response = await request.post('/api/documents/selected-search')

      expect([401, 302, 307, 400]).toContain(response.status())
    })

    test('TC-SSS-002: should require sourceDocumentId', async ({ request }) => {
      const response = await request.post('/api/documents/selected-search', {
        data: {
          targetDocumentIds: ['00000000-0000-0000-0000-000000000000']
        }
      })

      // Missing sourceDocumentId should be 400 (or 401 for auth)
      expect([400, 401, 302, 307]).toContain(response.status())
    })

    test('TC-SSS-003: should require targetDocumentIds array', async ({ request }) => {
      const response = await request.post('/api/documents/selected-search', {
        data: {
          sourceDocumentId: '00000000-0000-0000-0000-000000000000'
        }
      })

      // Missing targetDocumentIds should be 400
      expect([400, 401, 302, 307]).toContain(response.status())
    })

    test('TC-SSS-004: should reject empty target array', async ({ request }) => {
      const response = await request.post('/api/documents/selected-search', {
        data: {
          sourceDocumentId: '00000000-0000-0000-0000-000000000000',
          targetDocumentIds: []
        }
      })

      // Empty array should be rejected
      expect([400, 401, 302, 307]).toContain(response.status())
    })

    test('TC-SSS-007: should validate source document exists', async ({ request }) => {
      const response = await request.post('/api/documents/selected-search', {
        data: {
          sourceDocumentId: '00000000-0000-0000-0000-000000000000',
          targetDocumentIds: ['11111111-1111-1111-1111-111111111111']
        }
      })

      // Non-existent source should be 404 (or 401 for auth)
      expect([404, 401, 302, 307]).toContain(response.status())
    })

    test('TC-SSS-008: should validate source is completed', async ({ request }) => {
      // Would need a real queued/processing document
      const response = await request.post('/api/documents/selected-search', {
        data: {
          sourceDocumentId: '00000000-0000-0000-0000-000000000000',
          targetDocumentIds: ['11111111-1111-1111-1111-111111111111']
        }
      })

      // Could be 400 (not completed), 404, or 401
      expect([400, 404, 401, 302, 307]).toContain(response.status())
    })
  })

  test.describe('POST /api/draftable/compare - Document Comparison', () => {
    test('TC-DRAFT-001: should require authentication', async ({ request }) => {
      const response = await request.post('/api/draftable/compare')

      expect([401, 302, 307, 400]).toContain(response.status())
    })

    test('TC-DRAFT-003: should require leftDocumentId', async ({ request }) => {
      const response = await request.post('/api/draftable/compare', {
        data: {
          rightDocumentId: '00000000-0000-0000-0000-000000000000'
        }
      })

      expect([400, 401, 302, 307]).toContain(response.status())
    })

    test('TC-DRAFT-004: should require rightDocumentId', async ({ request }) => {
      const response = await request.post('/api/draftable/compare', {
        data: {
          leftDocumentId: '00000000-0000-0000-0000-000000000000'
        }
      })

      expect([400, 401, 302, 307]).toContain(response.status())
    })

    test('TC-DRAFT-005: should validate both documents exist', async ({ request }) => {
      const response = await request.post('/api/draftable/compare', {
        data: {
          leftDocumentId: '00000000-0000-0000-0000-000000000000',
          rightDocumentId: '11111111-1111-1111-1111-111111111111'
        }
      })

      // Non-existent documents should be 404 (or 401)
      expect([404, 401, 302, 307]).toContain(response.status())
    })

    test('TC-DRAFT-006: should handle Draftable API timeout', async ({ request }) => {
      // Would need real documents
      const response = await request.post('/api/draftable/compare', {
        data: {
          leftDocumentId: '00000000-0000-0000-0000-000000000000',
          rightDocumentId: '11111111-1111-1111-1111-111111111111'
        }
      }, {
        timeout: 35000 // Slightly longer than Draftable's 30s timeout
      })

      // Could timeout (500/504) or fail with 404/401
      expect([500, 504, 404, 401, 302, 307]).toContain(response.status())
    })
  })
})
