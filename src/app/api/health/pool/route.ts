import { NextRequest, NextResponse } from 'next/server'
import { poolHealthCheck, getPoolMetrics, getPoolConfig } from '@/lib/supabase/server'
import { throttling } from '@/lib/concurrency-limiter'
import { getQdrantCleanupMetrics } from '@/lib/qdrant-cleanup-worker'
import { logger } from '@/lib/logger'

export async function GET(_request: NextRequest) {
  try {
    const healthCheck = await poolHealthCheck()
    const metrics = getPoolMetrics()
    const config = getPoolConfig()
    const throttlingMetrics = throttling.getMetrics()
    const qdrantMetrics = getQdrantCleanupMetrics()

    const maxConnections = config.unlimitedMode ? Number.POSITIVE_INFINITY : config.maxConnections
    const utilization =
      Number.isFinite(maxConnections) && maxConnections > 0
        ? metrics.activeConnections / maxConnections
        : 0
    
    return NextResponse.json({
      status: healthCheck.healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      connectionPool: {
        health: healthCheck,
        config: {
          minConnections: config.minConnections,
          maxConnections: config.unlimitedMode ? 'unlimited' : config.maxConnections,
          idleTimeoutMs: config.idleTimeout,
          connectionTimeoutMs: config.connectionTimeout,
          unlimitedMode: config.unlimitedMode,
        },
        metrics: {
          ...metrics,
          utilizationRate: Number.isFinite(maxConnections)
            ? Number((utilization * 100).toFixed(1))
            : null,
        },
      },
      throttling: throttlingMetrics,
      qdrantCleanup: qdrantMetrics,
    }, {
      status: healthCheck.healthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, must-revalidate',
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    logger.error('Pool health check failed', error as Error)
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      connectionPool: {
        health: { healthy: false, details: 'Health check failed' },
        metrics: null
      }
    }, { status: 500 })
  }
}
