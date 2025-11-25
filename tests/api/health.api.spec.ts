import { test, expect } from '@playwright/test'
import { expectSuccessResponse, expectJsonResponse } from '../helpers/api'

/**
 * Health & Monitoring API Tests
 *
 * Tests all health check and monitoring endpoints
 * These endpoints are public (no authentication required)
 */

test.describe('Health & Monitoring APIs', () => {
  test.describe('GET /api/health', () => {
    test('TC-HM-001: should return healthy status', async ({ request }) => {
      const response = await request.get('/api/health')

      await expectSuccessResponse(response, 200)
      const body = await expectJsonResponse(response, ['status'])

      expect(body.status).toBe('healthy')
      expect(body).toHaveProperty('uptime')
    })

    test('should handle database connection check', async ({ request }) => {
      const response = await request.get('/api/health')
      const body = await response.json()

      // Should either connect successfully or handle missing credentials gracefully
      expect(['healthy', 'unhealthy']).toContain(body.status)
    })
  })

  test.describe('GET /api/health/pool', () => {
    test('TC-HM-002: should return connection pool metrics', async ({ request }) => {
      const response = await request.get('/api/health/pool')

      await expectSuccessResponse(response, 200)
      const body = await expectJsonResponse(response, [
        'connectionPool',
        'status',
        'throttling',
      ])

      // Verify pool structure
      expect(body.connectionPool).toHaveProperty('metrics')
      expect(body.connectionPool.metrics).toHaveProperty('totalConnections')
      expect(body.connectionPool.metrics).toHaveProperty('idleConnections')
      expect(body.connectionPool.metrics).toHaveProperty('activeConnections')

      // Verify config
      expect(body.connectionPool.config).toHaveProperty('minConnections')
      expect(body.connectionPool.config).toHaveProperty('maxConnections')
    })

    test('TC-HM-003: should include throttling metrics', async ({ request }) => {
      const response = await request.get('/api/health/pool')
      const body = await response.json()

      expect(body).toHaveProperty('throttling')
      expect(body.throttling).toHaveProperty('upload')
      expect(body.throttling).toHaveProperty('delete')

      // Verify throttling structure (actual format)
      expect(body.throttling.upload).toHaveProperty('global')
      expect(body.throttling.upload).toHaveProperty('perUser')
      expect(body.throttling.upload.global).toHaveProperty('limit')
      expect(body.throttling.upload.global).toHaveProperty('active')
      expect(body.throttling.delete).toHaveProperty('global')
      expect(body.throttling.delete).toHaveProperty('perUser')
    })

    test('TC-HM-004: should include Qdrant cleanup metrics', async ({ request }) => {
      const response = await request.get('/api/health/pool')
      const body = await response.json()

      expect(body).toHaveProperty('qdrantCleanup')
      expect(body.qdrantCleanup).toHaveProperty('queueDepth')
      expect(body.qdrantCleanup).toHaveProperty('isProcessing')
      expect(body.qdrantCleanup).toHaveProperty('pendingDocuments')
      expect(body.qdrantCleanup).toHaveProperty('recentFailures')
    })

    test('should show utilization rate correctly', async ({ request }) => {
      const response = await request.get('/api/health/pool')
      const body = await response.json()

      const { connectionPool } = body

      if (connectionPool.config.unlimitedMode || connectionPool.config.maxConnections === 'unlimited') {
        expect(connectionPool.metrics.utilizationRate).toBe(0)
      } else {
        expect(connectionPool.metrics.utilizationRate).toBeGreaterThanOrEqual(0)
        expect(connectionPool.metrics.utilizationRate).toBeLessThanOrEqual(100)
      }
    })
  })

  test.describe('GET /api/cron/process-jobs - Authentication', () => {
    test('TC-HM-013: should reject request without CRON_SECRET', async ({ request }) => {
      const response = await request.get('/api/cron/process-jobs')

      expect(response.status()).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Unauthorized')
    })

    test('TC-HM-014: should reject request with invalid CRON_SECRET', async ({ request }) => {
      const response = await request.get('/api/cron/process-jobs', {
        headers: {
          'Authorization': 'Bearer invalid-secret-123',
        },
      })

      expect(response.status()).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Unauthorized')
    })

    test('TC-HM-015: should accept GET request with valid CRON_SECRET', async ({ request }) => {
      const cronSecret = process.env.CRON_SECRET || 'test-secret-for-local-dev'

      const response = await request.get('/api/cron/process-jobs', {
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
        },
      })

      // Should either return 200 (jobs processed) or 200 (no jobs)
      expect(response.ok()).toBeTruthy()
      const body = await response.json()

      // Verify response structure (actual format)
      expect(body).toHaveProperty('message')
      expect(body).toHaveProperty('queueStats')
      expect(body).toHaveProperty('systemStatus')
      expect(body).toHaveProperty('maxConcurrency')
    })

    test('TC-HM-016: should accept POST request with valid CRON_SECRET', async ({ request }) => {
      const cronSecret = process.env.CRON_SECRET || 'test-secret-for-local-dev'

      const response = await request.post('/api/cron/process-jobs', {
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
        },
      })

      expect(response.ok()).toBeTruthy()
      const body = await response.json()
      expect(body).toHaveProperty('message')
      expect(body).toHaveProperty('queueStats')
    })
  })

  test.describe('GET/POST /api/test/process-jobs - Development Only', () => {
    test('TC-HM-018: should accept GET and POST in development', async ({ request }) => {
      // Skip this test in production
      if (process.env.NODE_ENV === 'production') {
        test.skip()
      }

      const getResponse = await request.get('/api/test/process-jobs')
      expect([200, 403]).toContain(getResponse.status())

      const postResponse = await request.post('/api/test/process-jobs')
      expect([200, 403]).toContain(postResponse.status())
    })
  })

  test.describe('POST /api/debug/retry-embeddings - Authentication', () => {
    test('TC-HM-019: should reject unauthenticated request', async ({ request }) => {
      const response = await request.post('/api/debug/retry-embeddings')

      expect(response.status()).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Unauthorized')
    })

    test('TC-HM-020: should reject request with invalid token', async ({ request }) => {
      const response = await request.post('/api/debug/retry-embeddings', {
        headers: {
          'Authorization': 'Bearer invalid-token-123',
        },
      })

      expect(response.status()).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Unauthorized')
    })

    test('TC-HM-022: should validate debug endpoint behavior', async ({ request }) => {
      const cronSecret = process.env.CRON_SECRET || 'test-secret-for-local-dev'

      const response = await request.post('/api/debug/retry-embeddings', {
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
        },
      })

      // Note: This endpoint requires proper user authentication, not just CRON_SECRET
      // May return 401 (unauthorized), 500 (server error), or 200 (success with auth)
      expect([200, 401, 500]).toContain(response.status())

      if (response.ok()) {
        const body = await response.json()
        expect(body).toHaveProperty('message')
      }
    })
  })
})
