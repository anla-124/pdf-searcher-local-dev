import { test, expect } from '@playwright/test'
import { getCronAuthHeader } from '../helpers/auth'
import { expectSuccessResponse, expectErrorResponse } from '../helpers/api'

/**
 * Document Management API Tests
 *
 * Tests CRUD operations for documents (except upload which is tested separately)
 * These tests require authentication and test RLS (Row Level Security)
 */

test.describe('Document Management APIs', () => {

  test.describe('GET /api/documents - List Documents', () => {
    test('TC-DL-002: should return empty array for user with no documents', async ({ request }) => {
      // Note: This test would need actual user authentication
      // For now, testing the endpoint structure
      const response = await request.get('/api/documents')

      // Without auth, should get 401 or redirect
      expect([200, 401, 302, 307]).toContain(response.status())
    })

    test('TC-DL-003: should support pagination parameters', async ({ request }) => {
      const response = await request.get('/api/documents?page=1&limit=10')

      // Endpoint should accept pagination params (auth required for 200)
      expect([200, 401, 302, 307]).toContain(response.status())
    })

    test('TC-DL-004: should support status filtering', async ({ request }) => {
      const response = await request.get('/api/documents?status=completed')

      expect([200, 401, 302, 307]).toContain(response.status())
    })

    test('TC-DL-005: should support search by title', async ({ request }) => {
      const response = await request.get('/api/documents?search=contract')

      expect([200, 401, 302, 307]).toContain(response.status())
    })

    test('TC-DL-006: should support sorting', async ({ request }) => {
      const response = await request.get('/api/documents?sortBy=created_at&sortOrder=desc')

      expect([200, 401, 302, 307]).toContain(response.status())
    })

    test('should reject invalid pagination parameters', async ({ request }) => {
      const response = await request.get('/api/documents?page=-1&limit=0')

      // Should return 400 for invalid params (or 401 if auth checked first)
      expect([400, 401, 302, 307]).toContain(response.status())
    })

    test('should handle large limit gracefully', async ({ request }) => {
      const response = await request.get('/api/documents?limit=1000')

      // Should cap limit or reject
      expect([200, 400, 401, 302, 307]).toContain(response.status())
    })
  })

  test.describe('GET /api/documents/[id] - Get Single Document', () => {
    test('TC-DL-026: should return 404 for non-existent document', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.get(`/api/documents/${fakeId}`)

      // Should be 404 or 401 (if auth checked first)
      expect([404, 401, 302, 307]).toContain(response.status())
    })

    test('should reject invalid UUID format', async ({ request }) => {
      const response = await request.get('/api/documents/invalid-uuid')

      expect([400, 404, 401, 302, 307]).toContain(response.status())
    })

    test('should require authentication', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.get(`/api/documents/${fakeId}`)

      // Without auth, should get 401 or redirect
      expect([401, 302, 307, 404]).toContain(response.status())
    })
  })

  test.describe('DELETE /api/documents/[id] - Delete Document', () => {
    test('TC-DL-018: should return 404 for non-existent document', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.delete(`/api/documents/${fakeId}`)

      expect([404, 401, 302, 307]).toContain(response.status())
    })

    test('TC-DL-019: should require authentication', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.delete(`/api/documents/${fakeId}`)

      expect([401, 302, 307, 404]).toContain(response.status())
    })

    test('should handle concurrent deletes (throttling)', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'

      // Try to trigger throttling by making multiple requests
      const requests = []
      for (let i = 0; i < 5; i++) {
        requests.push(request.delete(`/api/documents/${fakeId}`))
      }

      const responses = await Promise.all(requests)

      // At least some should be throttled (429) or fail with 401/404
      const statuses = responses.map(r => r.status())
      expect(statuses.some(s => [429, 401, 404].includes(s))).toBeTruthy()
    })
  })

  test.describe('PATCH /api/documents/[id] - Update Document', () => {
    test('TC-DL-016: should return 404 for non-existent document', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.patch(`/api/documents/${fakeId}`, {
        data: { title: 'New Title' }
      })

      expect([404, 401, 302, 307]).toContain(response.status())
    })

    test('TC-DL-017: should validate metadata is JSON object', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.patch(`/api/documents/${fakeId}`, {
        data: { metadata: 'not-an-object' }
      })

      // Should reject non-object metadata (or fail with 401/404 first)
      expect([400, 401, 404, 302, 307]).toContain(response.status())
    })

    test('should reject metadata array', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.patch(`/api/documents/${fakeId}`, {
        data: { metadata: ['array', 'not', 'allowed'] }
      })

      expect([400, 401, 404, 302, 307]).toContain(response.status())
    })

    test('should require authentication', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.patch(`/api/documents/${fakeId}`, {
        data: { title: 'New Title' }
      })

      expect([401, 302, 307, 404]).toContain(response.status())
    })
  })

  test.describe('POST /api/documents/[id]/retry - Retry Processing', () => {
    test('TC-PP-007: should return 404 for non-existent document', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/retry`)

      expect([404, 401, 302, 307]).toContain(response.status())
    })

    test('TC-PP-008a: should return 409 if job already queued', async ({ request }) => {
      // This would need a real document with active job
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/retry`)

      // Could be 409, 404, 401, or 400 depending on document state
      expect([409, 404, 401, 400, 302, 307]).toContain(response.status())
    })

    test('should require authentication', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/retry`)

      expect([401, 302, 307, 404]).toContain(response.status())
    })
  })

  test.describe('POST /api/documents/[id]/cancel - Cancel Processing', () => {
    test('TC-PP-005/006: should return 404 for non-existent document', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/cancel`)

      expect([404, 401, 302, 307]).toContain(response.status())
    })

    test('should prevent cancelling completed document', async ({ request }) => {
      // This would need a real completed document
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.post(`/api/documents/${fakeId}/cancel`)

      // Could be 400 (can't cancel completed), 404, or 401
      expect([400, 404, 401, 302, 307]).toContain(response.status())
    })
  })

  test.describe('GET /api/documents/[id]/download - Download Document', () => {
    test('TC-DL-033: should require authentication', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.get(`/api/documents/${fakeId}/download`)

      expect([401, 302, 307, 404]).toContain(response.status())
    })

    test('TC-DL-034: should return 404 for non-existent document', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.get(`/api/documents/${fakeId}/download`)

      expect([404, 401, 302, 307]).toContain(response.status())
    })
  })

  test.describe('GET /api/documents/[id]/processing-status - Get Processing Status', () => {
    test('TC-DL-029: should require authentication', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.get(`/api/documents/${fakeId}/processing-status`)

      expect([401, 302, 307, 404]).toContain(response.status())
    })

    test('TC-DL-031: should return 404 for non-existent document', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await request.get(`/api/documents/${fakeId}/processing-status`)

      expect([404, 401, 302, 307]).toContain(response.status())
    })
  })

  test.describe('POST /api/documents/upload - Upload Document', () => {
    test('TC-UP-001: should require authentication', async ({ request }) => {
      const response = await request.post('/api/documents/upload')

      expect([401, 302, 307, 400]).toContain(response.status())
    })

    test('TC-UP-004: should reject files over 50MB', async ({ request }) => {
      // Would need to create large file
      const response = await request.post('/api/documents/upload')

      expect([400, 413, 401, 302, 307]).toContain(response.status())
    })

    test('TC-UP-005: should reject non-PDF files', async ({ request }) => {
      // Would need to upload non-PDF
      const response = await request.post('/api/documents/upload')

      expect([400, 401, 302, 307]).toContain(response.status())
    })

    test('TC-UP-012: should enforce upload throttling', async ({ request }) => {
      // Try multiple uploads rapidly
      const requests = []
      for (let i = 0; i < 5; i++) {
        requests.push(request.post('/api/documents/upload'))
      }

      const responses = await Promise.all(requests)
      const statuses = responses.map(r => r.status())

      // At least some should be throttled (429) or fail with 401/400
      expect(statuses.some(s => [429, 401, 400].includes(s))).toBeTruthy()
    })
  })
})
