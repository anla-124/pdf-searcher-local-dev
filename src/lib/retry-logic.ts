import { logger } from '@/lib/logger'

type RetryableError = {
  code?: number | string
  status?: number
  message?: string
  details?: string
  [key: string]: unknown
}

const toRetryableError = (error: unknown): RetryableError => {
  if (error && typeof error === 'object') {
    return error as RetryableError
  }
  return { message: typeof error === 'string' ? error : String(error) }
}

interface RetryOptions {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffFactor: number
  retryableErrors: (error: RetryableError) => boolean
  onRetry?: (attempt: number, error: RetryableError) => void
}

interface RetryResult<T> {
  success: boolean
  result?: T
  error?: Error
  attempts: number
  totalTime: number
}

export class SmartRetry {
  private static defaultOptions: RetryOptions = {
    maxAttempts: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffFactor: 2,
    retryableErrors: (error: RetryableError) => {
      const includes = (term: string) => Boolean(error.message?.includes(term))
      // Enhanced retryable conditions for enterprise scale
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true
      if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') return true
      if (includes('timeout')) return true
      if (includes('network')) return true
      if (includes('connection')) return true
      if (includes('quota')) return true
      if (includes('rate limit')) return true
      const status = typeof error.status === 'number' ? error.status : undefined
      if (status !== undefined && status >= 500 && status < 600) return true // Server errors
      if (status === 429) return true // Rate limiting
      if (status === 503) return true // Service unavailable
      if (status === 502) return true // Bad gateway
      if (status === 504) return true // Gateway timeout
      return false
    }
  }

  // Enterprise-scale configurations for different services
  private static enterpriseConfigs = {
    vertexAI: {
      maxAttempts: 5,
      baseDelay: 2000,
      maxDelay: 60000,
      backoffFactor: 2.5,
      retryableErrors: (error: RetryableError) => {
        const status = typeof error.status === 'number' ? error.status : undefined
        const includes = (term: string) => Boolean(error.message?.includes(term))
        return (status === 429 || (status !== undefined && status >= 500) ||
               includes('quota') ||
               includes('rate'))
      }
    },
    qdrant: {
      maxAttempts: 4,
      baseDelay: 1500,
      maxDelay: 45000,
      backoffFactor: 2,
      retryableErrors: (error: RetryableError) => {
        const status = typeof error.status === 'number' ? error.status : undefined
        const includes = (term: string) => Boolean(error.message?.includes(term))
        return (status === 429 || (status !== undefined && status >= 500) ||
               includes('timeout'))
      }
    },
    documentAI: {
      maxAttempts: 3,
      baseDelay: 3000,
      maxDelay: 90000,
      backoffFactor: 3,
      retryableErrors: (error: RetryableError) => {
        const status = typeof error.status === 'number' ? error.status : undefined
        const includes = (term: string) => Boolean(error.message?.includes(term))
        return (status === 429 || (status !== undefined && status >= 500) ||
               includes('quota') ||
               includes('limit'))
      }
    }
  }

  // Helper methods for enterprise service configurations
  static async executeWithVertexAI<T>(operation: () => Promise<T>): Promise<RetryResult<T>> {
    logger.info('Using enterprise Vertex AI retry configuration')
    return this.execute(operation, this.enterpriseConfigs.vertexAI)
  }

  static async executeWithQdrant<T>(operation: () => Promise<T>): Promise<RetryResult<T>> {
    logger.info('Using enterprise Qdrant retry configuration')
    return this.execute(operation, this.enterpriseConfigs.qdrant)
  }

  static async executeWithDocumentAI<T>(operation: () => Promise<T>): Promise<RetryResult<T>> {
    logger.info('Using enterprise Document AI retry configuration')
    return this.execute(operation, this.enterpriseConfigs.documentAI)
  }

  static async execute<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<RetryResult<T>> {
    const config = { ...this.defaultOptions, ...options }
    const startTime = Date.now()
    
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await operation()
        return {
          success: true,
          result,
          attempts: attempt,
          totalTime: Date.now() - startTime
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        // Check if this error is retryable
        const retryCandidate = toRetryableError(error)

        if (!config.retryableErrors(retryCandidate)) {
          logger.error('Non-retryable error encountered', lastError, { attempt })
          break
        }

        // Don't retry on last attempt
        if (attempt === config.maxAttempts) {
          logger.error('Max retry attempts reached', lastError, { maxAttempts: config.maxAttempts })
          break
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelay
        )

        logger.warn('Retrying operation', { attempt, maxAttempts: config.maxAttempts, delayMs: delay, errorMessage: lastError.message })
        
        // Call retry callback if provided
        config.onRetry?.(attempt, retryCandidate)
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    return {
      success: false,
      error: lastError || new Error('Unknown error'),
      attempts: config.maxAttempts,
      totalTime: Date.now() - startTime
    }
  }
}

// Specialized retry configurations for different operations
export const RetryConfigs = {
  // Document AI processing - handle API rate limits and temporary failures
  documentAI: {
    maxAttempts: 5,
    baseDelay: 2000,
    maxDelay: 60000,
    backoffFactor: 2.5,
    retryableErrors: (error: RetryableError) => {
      const status = typeof error.status === 'number' ? error.status : undefined
      const includes = (term: string) => Boolean(error.message?.includes(term))
      if (error.code === 3 && Boolean(error.details?.includes('rate limit'))) return true
      if (error.code === 14) return true // Unavailable
      if (error.code === 4) return true // Deadline exceeded
      if (includes('timeout')) return true
      if (includes('UNAVAILABLE')) return true
      if (status === 503 || status === 429) return true
      return false
    },
    onRetry: (attempt: number, error: RetryableError) => {
      logger.warn('Document AI retry', { attempt, errorMessage: error.message })
    }
  },

  // Vertex AI embeddings - handle quota and API limits
  vertexEmbeddings: {
    maxAttempts: 4,
    baseDelay: 3000,
    maxDelay: 45000,
    backoffFactor: 2,
    retryableErrors: (error: RetryableError) => {
      const status = typeof error.status === 'number' ? error.status : undefined
      const includes = (term: string) => Boolean(error.message?.includes(term))
      if (status === 429) return true // Rate limit
      if (status === 503) return true // Service unavailable
      if (status === 502) return true // Bad gateway
      if (includes('quota')) return true
      if (includes('RATE_LIMIT_EXCEEDED')) return true
      return false
    },
    onRetry: (attempt: number, error: RetryableError) => {
      logger.warn('Vertex AI embeddings retry', { attempt, errorMessage: error.message })
    }
  },

  // Qdrant indexing - handle vector database issues
  qdrantIndexing: {
    maxAttempts: 3,
    baseDelay: 1500,
    maxDelay: 20000,
    backoffFactor: 2,
    retryableErrors: (error: RetryableError) => {
      const status = typeof error.status === 'number' ? error.status : undefined
      const includes = (term: string) => Boolean(error.message?.includes(term))
      if (status !== undefined && status >= 500) return true
      if (includes('timeout')) return true
      if (includes('connection')) return true
      if (includes('temporary')) return true
      return false
    },
    onRetry: (attempt: number, error: RetryableError) => {
      logger.warn('Qdrant indexing retry', { attempt, errorMessage: error.message })
    }
  },

  // Supabase operations - handle database connectivity issues
  supabaseOperations: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 15000,
    backoffFactor: 2,
    retryableErrors: (error: RetryableError) => {
      const status = typeof error.status === 'number' ? error.status : undefined
      if (error.code === 'PGRST301') return true // Connection error
      const includes = (term: string) => Boolean(error.message?.includes(term))
      if (includes('timeout')) return true
      if (includes('connection')) return true
      if (status !== undefined && status >= 500) return true
      return false
    },
    onRetry: (attempt: number, error: RetryableError) => {
      logger.warn('Supabase operation retry', { attempt, errorMessage: error.message })
    }
  },

  // File upload operations - handle network and storage issues
  fileUpload: {
    maxAttempts: 3,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffFactor: 2,
    retryableErrors: (error: RetryableError) => {
      const status = typeof error.status === 'number' ? error.status : undefined
      const includes = (term: string) => Boolean(error.message?.includes(term))
      if (status !== undefined && status >= 500) return true
      if (includes('network')) return true
      if (includes('timeout')) return true
      if (includes('connection')) return true
      return false
    },
    onRetry: (attempt: number, error: RetryableError) => {
      logger.warn('File upload retry', { attempt, errorMessage: error.message })
    }
  }
}

// Circuit breaker for protecting against cascading failures
export class CircuitBreaker {
  private failures = 0
  private lastFailTime = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  
  constructor(
    private maxFailures: number = 5,
    private timeoutMs: number = 60000 // 1 minute
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailTime > this.timeoutMs) {
        this.state = 'half-open'
        logger.warn('Circuit breaker half-open, testing service', { state: 'half-open' })
      } else {
        throw new Error('Circuit breaker is open - operation blocked')
      }
    }

    try {
      const result = await operation()

      if (this.state === 'half-open') {
        this.state = 'closed'
        this.failures = 0
        logger.info('Circuit breaker closed - service recovered', { state: 'closed' })
      }

      return result
    } catch (error) {
      this.failures++
      this.lastFailTime = Date.now()

      if (this.failures >= this.maxFailures) {
        this.state = 'open'
        logger.warn('Circuit breaker opened due to failures', { state: 'open', failures: this.failures })
      }

      throw error
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailTime: this.lastFailTime
    }
  }

  reset() {
    this.state = 'closed'
    this.failures = 0
    this.lastFailTime = 0
    logger.info('Circuit breaker manually reset', { state: 'closed' })
  }
}

// Global circuit breakers for different services
export const circuitBreakers = {
  documentAI: new CircuitBreaker(3, 120000), // 2 minutes
  vertexAI: new CircuitBreaker(5, 60000), // 1 minute
  qdrant: new CircuitBreaker(3, 90000), // 1.5 minutes
}
