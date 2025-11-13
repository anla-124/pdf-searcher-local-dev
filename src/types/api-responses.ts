/**
 * Enterprise-grade API response types
 * Standardized response interfaces for all API endpoints
 */

import type {
  DatabaseDocument,
  DatabaseDocumentEmbedding,
  // DatabaseExtractedField removed - table no longer exists
  DatabaseDocumentJob,
  DatabaseProcessingStatus,
  BusinessMetadata
} from './external-apis'

// =============================================================================
// STANDARD API RESPONSE TYPES
// =============================================================================

export interface BaseApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: ApiError
  metadata?: ResponseMetadata
  timestamp: string
  requestId: string
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
  stack?: string
  retryable?: boolean
  category: 'validation' | 'authentication' | 'authorization' | 'rate_limit' | 'server_error' | 'external_service' | 'network'
}

export interface ResponseMetadata {
  processingTimeMs: number
  pagination?: PaginationInfo
  version?: string
  deprecationWarning?: string
}

export interface PaginationInfo {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  nextCursor?: string
  previousCursor?: string
}

// =============================================================================
// DOCUMENT API RESPONSES
// =============================================================================

export interface DocumentListResponse extends BaseApiResponse<DatabaseDocument[]> {
  data: DatabaseDocument[]
  metadata: ResponseMetadata & {
    pagination: PaginationInfo
    filters?: {
      status?: string[]
      search?: string
      dateRange?: {
        start: string
        end: string
      }
    }
    queryMetadata?: {
      queryTimeMs: number
      includeJobs: boolean
    }
  }
}

export interface DocumentDetailResponse extends BaseApiResponse<DatabaseDocument> {
  data: DatabaseDocument & {
    embeddings?: DatabaseDocumentEmbedding[]
    // extractedFields removed - table no longer exists
    jobs?: DatabaseDocumentJob[]
    processingStatus?: DatabaseProcessingStatus
  }
}

export interface DocumentUploadResponse extends BaseApiResponse<{
  document: DatabaseDocument
  job: DatabaseDocumentJob
}> {
  data: {
    document: DatabaseDocument
    job: DatabaseDocumentJob
    securityScan: {
      passed: boolean
      riskLevel: 'low' | 'medium' | 'high' | 'critical'
      threats: string[]
    }
    processingEstimate: {
      estimatedDurationMs: number
      processingMethod: 'sync' | 'batch'
      queuePosition?: number
    }
  }
}

export interface DocumentProcessingStatusResponse extends BaseApiResponse<DatabaseProcessingStatus> {
  data: DatabaseProcessingStatus & {
    job?: DatabaseDocumentJob
    batchOperationStatus?: {
      operationId: string
      state: string
      progress?: number
      estimatedCompletion?: string
    }
  }
}

// =============================================================================
// SEARCH API RESPONSES
// =============================================================================

export interface SimilaritySearchResult {
  documentId: string
  title: string
  filename: string
  similarity: number
  matchingChunks: Array<{
    chunkId: string
    text: string
    pageNumber?: number
    similarity: number
    highlightedText?: string
  }>
  metadata?: BusinessMetadata
  relevanceScore: number
  keywordMatches?: Array<{
    term: string
    count: number
    positions: number[]
  }>
}

export interface SimilaritySearchResponse extends BaseApiResponse<SimilaritySearchResult[]> {
  data: SimilaritySearchResult[]
  metadata: ResponseMetadata & {
    searchMetadata: {
      query: string
      searchType: 'semantic' | 'keyword' | 'hybrid'
      processingTimeMs: number
      totalResults: number
      maxSimilarity: number
      minSimilarity: number
      filters: Record<string, unknown>
      rerankingApplied: boolean
    }
    hybridSearchBreakdown?: {
      semanticResults: number
      keywordResults: number
      combinedResults: number
      rerankingTimeMs: number
    }
  }
}

// =============================================================================
// JOB PROCESSING API RESPONSES
// =============================================================================

export interface JobProcessingResponse extends BaseApiResponse<{
  jobsProcessed: number
  successful: number
  failed: number
  summary: JobProcessingSummary
}> {
  data: {
    jobsProcessed: number
    successful: number
    failed: number
    summary: JobProcessingSummary
  }
}

export interface JobProcessingSummary {
  totalJobs: number
  successful: number
  failed: number
  processingTimeMs: number
  throughputJobsPerSec: number
  capacityUtilization: string | 'unlimited'
  systemStatus: 'ready' | 'enterprise-ready' | 'unlimited-ready' | 'unlimited-processing' | 'at-capacity'
  queueStats: {
    total: number
    queued: number
    processing: number
    completed: number
    failed: number
    cancelled: number
  }
  details: Array<{
    jobId: string
    documentId: string
    status: 'fulfilled' | 'rejected'
    error?: string
    processingMethod?: 'sync' | 'batch'
    switchedToBatch?: boolean
  }>
}

// =============================================================================
// BATCH OPERATION RESPONSES
// =============================================================================

export interface BatchStatusResponse extends BaseApiResponse<{
  totalProcessingJobs: number
  batchStatuses: BatchOperationStatus[]
}> {
  data: {
    totalProcessingJobs: number
    batchStatuses: BatchOperationStatus[]
  }
}

export interface BatchOperationStatus {
  jobId: string
  documentId: string
  documentTitle: string
  batchOperationId: string
  googleCloudStatus?: {
    status: 'STATE_UNSPECIFIED' | 'WAITING' | 'RUNNING' | 'SUCCEEDED' | 'CANCELLING' | 'CANCELLED' | 'FAILED'
    progress?: number
    error?: string
    createTime?: string
    updateTime?: string
  }
  processingDuration: number // in minutes
  error?: string
}

export interface EmbeddingRetryResponse extends BaseApiResponse<{
  totalProcessed: number
  successful: number
  failed: number
  results: EmbeddingRetryResult[]
}> {
  data: {
    message: string
    totalProcessed: number
    successful: number
    failed: number
    results: EmbeddingRetryResult[]
  }
}

export interface EmbeddingRetryResult {
  documentId: string
  title: string
  status: 'success' | 'failed'
  error?: string
}

// =============================================================================
// ADMIN API RESPONSES
// =============================================================================

export interface SystemHealthResponse extends BaseApiResponse<{
  status: 'healthy' | 'degraded' | 'unhealthy'
  services: ServiceHealthStatus[]
  performance: PerformanceMetrics
  capacity: CapacityMetrics
}> {
  data: {
    status: 'healthy' | 'degraded' | 'unhealthy'
    services: ServiceHealthStatus[]
    performance: PerformanceMetrics
    capacity: CapacityMetrics
    uptime: number
    version: string
    environment: string
  }
}

export interface ServiceHealthStatus {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unavailable'
  responseTime?: number
  lastCheck: string
  error?: string
  metrics?: Record<string, number>
}

export interface PerformanceMetrics {
  avgResponseTime: number
  requestsPerSecond: number
  errorRate: number
  cpuUsage: number
  memoryUsage: number
  diskUsage: number
  networkIO: {
    bytesIn: number
    bytesOut: number
  }
}

export interface CapacityMetrics {
  connectionPool: {
    active: number
    idle: number
    total: number
    maxConnections: number
    utilizationPercentage: number
  }
  processingQueue: {
    queued: number
    processing: number
    maxConcurrent: number | 'unlimited'
    utilizationPercentage: number | null
  }
  storage: {
    documentsCount: number
    totalSizeBytes: number
    averageFileSizeBytes: number
  }
  embeddings: {
    totalVectors: number
    totalChunks: number
    averageChunksPerDocument: number
  }
}

export interface UsageAnalyticsResponse extends BaseApiResponse<{
  period: string
  summary: UsageSummary
  daily: DailyUsage[]
  topUsers: UserUsage[]
  performance: PerformanceAnalytics
}> {
  data: {
    period: string
    summary: UsageSummary
    daily: DailyUsage[]
    topUsers: UserUsage[]
    performance: PerformanceAnalytics
  }
}

export interface UsageSummary {
  totalDocuments: number
  totalUsers: number
  totalProcessingTime: number
  totalSearches: number
  averageDocumentSize: number
  successRate: number
  errorRate: number
}

export interface DailyUsage {
  date: string
  documents: number
  users: number
  searches: number
  processingTime: number
  errors: number
}

export interface UserUsage {
  userId: string
  userEmail?: string
  documents: number
  searches: number
  processingTime: number
  lastActivity: string
}

export interface PerformanceAnalytics {
  averageProcessingTime: number
  averageSearchTime: number
  averageUploadTime: number
  p95ProcessingTime: number
  p95SearchTime: number
  throughput: {
    documentsPerHour: number
    searchesPerHour: number
  }
  bottlenecks: Array<{
    component: string
    impact: 'low' | 'medium' | 'high' | 'critical'
    description: string
    recommendation: string
  }>
}


// =============================================================================
// ERROR HANDLING TYPES
// =============================================================================

export interface ValidationError extends Omit<ApiError, 'details'> {
  category: 'validation'
  code: 'VALIDATION_ERROR'
  details: {
    field: string
    message: string
    value: unknown
    constraint: string
  }[]
}

export interface AuthenticationError extends ApiError {
  category: 'authentication'
  code: 'AUTHENTICATION_ERROR' | 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'TOKEN_MISSING'
}

export interface AuthorizationError extends ApiError {
  category: 'authorization'
  code: 'AUTHORIZATION_ERROR' | 'INSUFFICIENT_PERMISSIONS' | 'RESOURCE_FORBIDDEN'
  details: {
    requiredPermissions: string[]
    userPermissions: string[]
    resourceId?: string
  }
}

export interface RateLimitError extends ApiError {
  category: 'rate_limit'
  code: 'RATE_LIMIT_EXCEEDED'
  details: {
    limit: number
    remaining: number
    resetTime: string
    retryAfter: number
  }
}

export interface ExternalServiceError extends ApiError {
  category: 'external_service'
  code: 'EXTERNAL_SERVICE_ERROR' | 'DOCUMENT_AI_ERROR' | 'QDRANT_ERROR' | 'VERTEX_AI_ERROR' | 'STORAGE_ERROR'
  details: {
    service: string
    originalError: string
    statusCode?: number
    retryable: boolean
    retryAfter?: number
  }
}

export interface ServerError extends ApiError {
  category: 'server_error'
  code: 'INTERNAL_SERVER_ERROR' | 'DATABASE_ERROR' | 'TIMEOUT_ERROR' | 'MEMORY_ERROR' | 'UNKNOWN_ERROR'
  details: {
    errorId: string
    component: string
    operation: string
  }
}

// =============================================================================
// WEBHOOK TYPES
// =============================================================================

export interface WebhookPayload<T = unknown> {
  id: string
  event: string
  timestamp: string
  data: T
  signature: string
  version: string
}

export interface DocumentProcessingWebhook extends WebhookPayload<{
  documentId: string
  jobId: string
  status: 'completed' | 'failed'
  result?: {
    extractedText: string
    pageCount: number
    processingTimeMs: number
    chunksCreated: number
  }
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}> {
  event: 'document.processing.completed' | 'document.processing.failed'
}

export interface BatchOperationWebhook extends WebhookPayload<{
  operationId: string
  documentIds: string[]
  status: 'completed' | 'failed'
  results?: Array<{
    documentId: string
    success: boolean
    error?: string
  }>
}> {
  event: 'batch.operation.completed' | 'batch.operation.failed'
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type ApiResponseType<T> = T extends BaseApiResponse<infer U> ? U : never

export type ExtractDataType<T extends BaseApiResponse> = T['data']

export type ApiEndpointResponse<T> = Promise<T>

export type PaginatedResponse<T> = BaseApiResponse<T[]> & {
  metadata: ResponseMetadata & {
    pagination: PaginationInfo
  }
}

