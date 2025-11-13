/**
 * Application Constants
 * Single source of truth for all magic numbers and configuration values
 */

// =============================================================================
// FILE HANDLING
// =============================================================================

/** Maximum file size for uploads (50MB) */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

/** Maximum file size in megabytes */
export const MAX_FILE_SIZE_MB = 50

/** Allowed file types for upload */
export const ALLOWED_FILE_TYPES = ['application/pdf'] as const

/** Allowed file extensions */
export const ALLOWED_FILE_EXTENSIONS = ['.pdf'] as const

// =============================================================================
// DOCUMENT PROCESSING
// =============================================================================

/** Default chunk size for document processing */
export const DEFAULT_CHUNK_SIZE = 50

/** Maximum chunk tokens for embedding */
export const MAX_CHUNK_TOKENS = 250

/** Large document threshold in megabytes */
export const LARGE_DOCUMENT_THRESHOLD_MB = 5

/** Maximum concurrent documents to process */
export const MAX_CONCURRENT_DOCUMENTS = 1

/** Maximum concurrent chunks per document */
export const MAX_CONCURRENT_CHUNKS_PER_DOC = 25

// =============================================================================
// API TIMEOUTS
// =============================================================================

/** Default API request timeout (30 seconds) */
export const DEFAULT_API_TIMEOUT_MS = 30000

/** Long-running operation timeout (3 minutes) */
export const LONG_OPERATION_TIMEOUT_MS = 180000

/** Draftable comparison creation timeout (30 seconds) */
export const DRAFTABLE_TIMEOUT_MS = 30000

/** Cron job processing timeout (5 minutes) */
export const CRON_TIMEOUT_MS = 300000

// =============================================================================
// SIGNED URLs & EXPIRY
// =============================================================================

/** Supabase signed URL expiry (1 hour) */
export const SIGNED_URL_EXPIRY_SECONDS = 3600

/** Draftable viewer URL validity (1 hour) */
export const DRAFTABLE_VIEWER_VALIDITY_MS = 60 * 60 * 1000

/** Draftable comparison expiry (2 hours) */
export const DRAFTABLE_COMPARISON_EXPIRY_MS = 120 * 60 * 1000

// =============================================================================
// DATABASE CONFIGURATION
// =============================================================================

/** Minimum database connections in pool */
export const DB_POOL_MIN_CONNECTIONS = 2

/** Maximum database connections in pool */
export const DB_POOL_MAX_CONNECTIONS = 40

/** Database connection idle timeout */
export const DB_POOL_IDLE_TIMEOUT_MS = 120000

/** Database connection timeout */
export const DB_POOL_CONNECTION_TIMEOUT_MS = 120000

// =============================================================================
// RATE LIMITING
// =============================================================================

/** Global upload rate limit */
export const UPLOAD_GLOBAL_LIMIT = 2

/** Per-user upload rate limit */
export const UPLOAD_PER_USER_LIMIT = 2

/** Global delete rate limit */
export const DELETE_GLOBAL_LIMIT = 2

/** Per-user delete rate limit */
export const DELETE_PER_USER_LIMIT = 2

// =============================================================================
// QDRANT CONFIGURATION
// =============================================================================

/** Maximum retries for Qdrant delete operations */
export const QDRANT_DELETE_MAX_RETRIES = 3

/** Backoff time between Qdrant delete retries */
export const QDRANT_DELETE_BACKOFF_MS = 2000

// =============================================================================
// SIMILARITY SEARCH
// =============================================================================

/** Default similarity threshold */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.85

/** Stage 2 parallel workers */
export const SIMILARITY_STAGE2_WORKERS = 1

// =============================================================================
// PAGINATION
// =============================================================================

/** Default page size for listings */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size for listings */
export const MAX_PAGE_SIZE = 100

// =============================================================================
// VALIDATION
// =============================================================================

/** Minimum document title length */
export const MIN_TITLE_LENGTH = 1

/** Maximum document title length */
export const MAX_TITLE_LENGTH = 255

// =============================================================================
// HTTP STATUS CODES (for consistency)
// =============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const

// =============================================================================
// ERROR CODES (for standardized error responses)
// =============================================================================

export const ERROR_CODES = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_PARAMETERS: 'INVALID_PARAMETERS',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',

  // Database
  DATABASE_ERROR: 'DATABASE_ERROR',
  QUERY_FAILED: 'QUERY_FAILED',
  CONNECTION_ERROR: 'CONNECTION_ERROR',

  // Processing
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  OCR_FAILED: 'OCR_FAILED',
  EMBEDDING_FAILED: 'EMBEDDING_FAILED',
  UPLOAD_FAILED: 'UPLOAD_FAILED',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

  // External Services
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  DRAFTABLE_ERROR: 'DRAFTABLE_ERROR',
  QDRANT_ERROR: 'QDRANT_ERROR',
  GOOGLE_CLOUD_ERROR: 'GOOGLE_CLOUD_ERROR',

  // Timeouts
  TIMEOUT: 'TIMEOUT',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
