# PDF SEARCHER - INTEGRATION TEST CASES

**Version:** 1.2
**Date:** November 25, 2025
**Total Test Cases:** 71

---

## 1. EXTERNAL SERVICE INTEGRATIONS (25 Test Cases)

### 1.1 Google Document AI (10 Test Cases)

**TC-INT-DOC-001:** Successful OCR Processing
- **Priority:** P0
- **Expected:** Text extracted accurately, page numbers detected, processing completes

**TC-INT-DOC-002:** Document AI Timeout Handling
- **Priority:** P1
- **Expected:** Graceful timeout, retry logic triggered, error logged

**TC-INT-DOC-003:** Document AI Rate Limit (429)
- **Priority:** P1
- **Expected:** Exponential backoff, retry succeeds, circuit breaker pattern

**TC-INT-DOC-004:** Invalid API Credentials
- **Priority:** P1
- **Expected:** 401/403 error, clear error message, processing fails gracefully

**TC-INT-DOC-005:** Large Document Chunked Processing
- **Priority:** P1
- **Expected:** Document split into chunks, all chunks processed, results combined

**TC-INT-DOC-006:** Scanned Document OCR Accuracy
- **Priority:** P1
- **Expected:** >90% accuracy on typed text, page detection correct

**TC-INT-DOC-007:** Complex Layout Handling
- **Priority:** P2
- **Expected:** Tables, columns, headers extracted in reading order

**TC-INT-DOC-008:** Document AI API Version Compatibility
- **Priority:** P2
- **Expected:** Compatible with current API version, no breaking changes

**TC-INT-DOC-009:** Processor Selection Logic
- **Priority:** P2
- **Expected:** Correct processor ID used (OCR vs general processor)

**TC-INT-DOC-010:** Error Response Parsing
- **Priority:** P1
- **Expected:** All Document AI error codes handled appropriately

---

### 1.2 Google Vertex AI Embeddings (5 Test Cases)

**TC-INT-VERTEX-001:** Embedding Generation Success
- **Priority:** P0
- **Expected:** 768-dimensional vector returned, embedding accurate

**TC-INT-VERTEX-002:** Text Truncation (>3072 chars)
- **Priority:** P1
- **Expected:** Text truncated to 3072 characters, embedding generated

**TC-INT-VERTEX-003:** Batch Embedding Generation
- **Priority:** P1
- **Expected:** Multiple chunks embedded efficiently, concurrency respected

**TC-INT-VERTEX-004:** Vertex AI Rate Limit Handling
- **Priority:** P1
- **Expected:** Unlimited retry with backoff, eventually succeeds

**TC-INT-VERTEX-005:** Invalid Text Handling
- **Priority:** P2
- **Expected:** Empty/null text handled, error message clear

---

### 1.3 Qdrant Vector Database (5 Test Cases)

**TC-INT-QDRANT-001:** Vector Upsert Success
- **Priority:** P0
- **Expected:** Vectors indexed, payload includes metadata

**TC-INT-QDRANT-002:** Vector Search (Cosine Similarity)
- **Priority:** P0
- **Expected:** Correct results returned, scores accurate, filters applied

**TC-INT-QDRANT-003:** Vector Deletion
- **Priority:** P1
- **Expected:** All document vectors deleted, collection clean

**TC-INT-QDRANT-004:** Qdrant Connection Failure Handling
- **Priority:** P1
- **Expected:** Retry queue utilized, exponential backoff, eventual consistency

**TC-INT-QDRANT-005:** Metadata Filtering in Search
- **Priority:** P1
- **Expected:** Filters work correctly (law_firm, fund_manager, etc.)

---

### 1.4 Supabase Storage (4 Test Cases)

**TC-INT-STORAGE-001:** File Upload with RLS
- **Priority:** P0
- **Expected:** File stored in user folder, RLS enforced

**TC-INT-STORAGE-002:** File Download with Signed URL
- **Priority:** P1
- **Expected:** Signed URL generated, file downloadable, URL expires correctly

**TC-INT-STORAGE-003:** File Deletion
- **Priority:** P1
- **Expected:** File removed from storage, no orphaned files

**TC-INT-STORAGE-004:** Qdrant Cleanup Queueing
- **Priority:** P1
- **Expected:** Delete operation queues vector IDs for background cleanup without blocking response

---

### 1.5 Draftable Comparison API (2 Test Cases)

**TC-INT-DRAFT-001:** Comparison Creation
- **Priority:** P1
- **Expected:** Comparison created, signed URL returned, expires in 1 hour

**TC-INT-DRAFT-002:** API Error Handling
- **Priority:** P2
- **Expected:** Timeout/error handled gracefully, user notified

---

## 2. DATABASE OPERATIONS (27 Test Cases)

### 2.1 CRUD Operations (8 Test Cases)

**TC-INT-DB-001:** Document CRUD with RLS
- **Priority:** P0
- **Expected:** Create, read, update, delete all respect RLS

**TC-INT-DB-002:** Embedding CRUD Operations
- **Priority:** P1
- **Expected:** Batch insert efficient, reads filtered by document_id

**TC-INT-DB-003:** Job Queue Operations
- **Priority:** P1
- **Expected:** Jobs queued, claimed, updated atomically

**TC-INT-DB-004:** Foreign Key Cascade Delete
- **Priority:** P1
- **Expected:** Deleting document cascades to embeddings, content, jobs

**TC-INT-DB-005:** Transaction Rollback on Error
- **Priority:** P1
- **Expected:** Failed transaction rolls back, no partial data

**TC-INT-DB-006:** Concurrent Insert Performance
- **Priority:** P2
- **Expected:** Multiple users insert simultaneously without conflicts

**TC-INT-DB-007:** Index Usage Verification
- **Priority:** P1
- **Expected:** EXPLAIN ANALYZE shows index scans, no seq scans on large tables

**TC-INT-DB-008:** Connection Pool Management
- **Priority:** P1
- **Expected:** Connections acquired/released properly, no leaks

---

### 2.2 RLS Policy Enforcement (5 Test Cases)

**TC-INT-RLS-001:** Documents Table RLS
- **Priority:** P0
- **Expected:** Users see only their documents

**TC-INT-RLS-002:** Embeddings Table RLS
- **Priority:** P1
- **Expected:** JOIN to documents enforces user isolation

**TC-INT-RLS-003:** Jobs Table RLS
- **Priority:** P1
- **Expected:** user_id filter enforced

**TC-INT-RLS-004:** Service Role Bypass
- **Priority:** P1
- **Expected:** service_role client bypasses RLS

**TC-INT-RLS-005:** Storage RLS Policies
- **Priority:** P1
- **Expected:** Upload/download restricted to user's folder

---

### 2.3 Database Functions & Views (7 Test Cases)

**TC-INT-FUNC-001:** claim_jobs_for_processing() Function - Basic Job Claiming
- **Priority:** P0
- **Test Steps:**
  1. Create 5 jobs with status='queued'
  2. Call claim_jobs_for_processing(limit_count=3, worker_id='worker-1')
  3. Verify returned jobs
  4. Check database state
- **Expected Results:**
  - Function returns exactly 3 jobs (respects limit_count)
  - All 3 jobs have status='processing' in database
  - All 3 jobs have metadata.worker_id='worker-1'
  - All 3 jobs have metadata.claimed_at timestamp
  - All 3 jobs have attempts incremented by 1
  - started_at timestamp is set to NOW()
  - metadata.recovered=false for fresh claims
  - Remaining 2 jobs still have status='queued'

**TC-INT-FUNC-001a:** claim_jobs_for_processing() - Concurrent Claiming (SKIP LOCKED)
- **Priority:** P0
- **Test Steps:**
  1. Create 10 jobs with status='queued'
  2. Simultaneously call function from 3 workers:
     - Worker-A: claim_jobs_for_processing(5, 'worker-A')
     - Worker-B: claim_jobs_for_processing(5, 'worker-B')
     - Worker-C: claim_jobs_for_processing(5, 'worker-C')
  3. Verify no overlapping claims
- **Expected Results:**
  - Total 10 jobs claimed across all workers (no duplicates)
  - Each job claimed by exactly one worker
  - No race conditions (FOR UPDATE SKIP LOCKED prevents duplicates)
  - Each worker gets different jobs
  - No errors or deadlocks
  - Database consistency maintained

**TC-INT-FUNC-001b:** claim_jobs_for_processing() - Stuck Job Recovery (>15 min)
- **Priority:** P0
- **Test Steps:**
  1. Create job with status='processing', started_at=NOW() - 20 minutes
  2. Set metadata.worker_id='worker-old'
  3. Call claim_jobs_for_processing(1, 'worker-new')
  4. Verify job is recovered
- **Expected Results:**
  - Stuck job (>15 min) is re-claimed
  - Job status remains 'processing'
  - metadata.worker_id updated to 'worker-new'
  - metadata.previous_worker_id='worker-old'
  - metadata.recovered=true
  - metadata.claimed_at updated to NOW()
  - attempts counter incremented
  - Job is included in returned results

**TC-INT-FUNC-001c:** claim_jobs_for_processing() - Priority Ordering
- **Priority:** P1
- **Test Steps:**
  1. Create jobs with different priorities:
     - Job A: priority=5, status='queued', created_at=T0
     - Job B: priority=10, status='queued', created_at=T1
     - Job C: priority=1, status='queued', created_at=T0-1h
     - Job D: priority=10, status='processing', started_at=NOW()-20min (stuck)
  2. Call claim_jobs_for_processing(10, 'worker-1')
- **Expected Results:**
  - Stuck jobs claimed FIRST (Job D first)
  - Then queued jobs by priority DESC (Job B before Job A)
  - Then by created_at ASC (older jobs first)
  - Order: D, B, A, C

**TC-INT-FUNC-001d:** claim_jobs_for_processing() - Max Attempts Respected
- **Priority:** P1
- **Test Steps:**
  1. Create stuck job: status='processing', attempts=2, max_attempts=3, started_at=NOW()-20min
  2. Create stuck job: status='processing', attempts=3, max_attempts=3, started_at=NOW()-20min
  3. Call claim_jobs_for_processing(10, 'worker-1')
- **Expected Results:**
  - First job recovered (attempts < max_attempts)
  - Second job NOT recovered (attempts >= max_attempts)
  - Only first job returned
  - Second job remains stuck (needs manual intervention)

**TC-INT-FUNC-001e:** claim_jobs_for_processing() - Single Query Optimization
- **Priority:** P1
- **Test Steps:**
  1. Create job with all document fields populated
  2. Call claim_jobs_for_processing(1, 'worker-1')
  3. Verify returned fields
- **Expected Results:**
  - Returns job fields: id, user_id, document_id, status, priority, processing_method, processing_config, result_summary, created_at, started_at, completed_at, attempts, error_message, metadata, max_attempts
  - Returns document fields: doc_title, doc_filename, doc_file_path, doc_file_size, doc_user_id
  - All data returned in single query (no N+1 queries needed)
  - 60% query reduction vs separate queries

**TC-INT-FUNC-002:** Stuck Jobs Monitoring View
- **Priority:** P1
- **Expected:** Accurate data, shows jobs >15 min, metadata correct

**TC-INT-FUNC-003:** cleanup_old_activity_logs() Function
- **Priority:** P2
- **Expected:** Deletes logs >90 days, returns count

**TC-INT-FUNC-004:** Function Permission Checks
- **Priority:** P1
- **Expected:** Only authorized roles can execute functions

**TC-INT-FUNC-005:** View Performance
- **Priority:** P2
- **Expected:** Views execute efficiently, use indexes

**TC-INT-FUNC-006:** Function Error Handling
- **Priority:** P1
- **Expected:** Functions handle errors gracefully, no crashes

**TC-INT-FUNC-007:** Function Idempotency
- **Priority:** P2
- **Expected:** Safe to call multiple times, no side effects

---

### 2.4 Validation & Data Integrity (2 Test Cases)

**TC-INT-DB-009:** Qdrant Cleanup Worker
- **Priority:** P1
- **Expected:** Delete endpoint queues vector IDs for background cleanup, worker processes queue

**TC-INT-DB-010:** Pagination Validation
- **Priority:** P1
- **Expected:** Invalid pagination parameters return 400 with error details

**TC-INT-DB-011:** Metadata Validation
- **Priority:** P1
- **Expected:** Non-object metadata is rejected with clear error message

---

## 3. API ENDPOINT INTEGRATION (19 Test Cases)

### 3.1 Document API Endpoints (8 Test Cases)

**TC-INT-API-001:** POST /api/documents/upload
- **Priority:** P0
- **Expected:** File uploaded, database record created, job queued

**TC-INT-API-002:** GET /api/documents
- **Priority:** P0
- **Expected:** List filtered by user_id, pagination works, filters applied

**TC-INT-API-003:** GET /api/documents/[id]
- **Priority:** P1
- **Expected:** Returns document details, RLS enforced

**TC-INT-API-004:** PATCH /api/documents/[id]
- **Priority:** P1
- **Expected:** Metadata updated, Qdrant synced

**TC-INT-API-005:** DELETE /api/documents/[id]
- **Priority:** P0
- **Expected:** Complete cleanup (DB, Qdrant, Storage)

**TC-INT-API-006:** POST /api/documents/[id]/cancel
- **Priority:** P1
- **Expected:** Processing cancelled, partial data cleaned

**TC-INT-API-007:** POST /api/documents/[id]/retry
- **Priority:** P1
- **Expected:** Job re-queued, attempts incremented

**TC-INT-API-016:** POST /api/documents/upload - Auto-Cron Trigger
- **Priority:** P1
- **Expected:** queueMicrotask calls triggerCronProcessing after upload completes

---

### 3.2 Search API Endpoints (4 Test Cases)

**TC-INT-API-008:** POST /api/documents/[id]/similar-v2
- **Priority:** P0
- **Expected:** 3-stage pipeline executes, results accurate

**TC-INT-API-009:** GET /api/documents/[id]/similar-v2
- **Priority:** P1
- **Expected:** Readiness check works

**TC-INT-API-010:** POST /api/documents/selected-search
- **Priority:** P1
- **Expected:** Selected targets processed, all results returned

**TC-INT-API-011:** POST /api/draftable/compare
- **Priority:** P1
- **Expected:** Comparison created, URL returned

---

### 3.3 Cron & Health Endpoints (7 Test Cases)

**TC-INT-API-012:** POST /api/cron/process-jobs
- **Priority:** P0
- **Expected:** CRON_SECRET validated, jobs claimed and processed

**TC-INT-API-012a:** GET /api/cron/process-jobs
- **Priority:** P1
- **Expected:** Returns processing status, accepts GET requests for monitoring

**TC-INT-API-013:** GET /api/health
- **Priority:** P1
- **Expected:** Returns 200, status healthy

**TC-INT-API-014:** GET /api/health/pool
- **Priority:** P1
- **Expected:** Returns connection pool metrics

**TC-INT-API-015:** POST /api/test/process-jobs
- **Priority:** P2
- **Expected:** Development-only endpoint. Returns 403 in production. Still requires CRON_SECRET header (or falls back to 'test-secret-for-local-dev' in development). Triggers job processing in non-production environments.

**TC-INT-API-015a:** GET /api/test/process-jobs
- **Priority:** P2
- **Expected:** Development-only endpoint. Returns 403 in production. Accepts GET requests for testing. Requires CRON_SECRET or uses test default in dev.

**TC-INT-API-017:** GET /api/health/pool - Complete Metrics
- **Priority:** P1
- **Expected:** Response includes throttling.upload, throttling.delete, and qdrantCleanup fields with accurate data

---

## TEST EXECUTION SUMMARY

| Integration Area | Test Cases | Critical |
|------------------|------------|----------|
| External Services | 25 | 15 |
| Database Operations | 27 | 19 |
| API Endpoints | 19 | 10 |
| **TOTAL** | **71** | **44** |

---

*END OF INTEGRATION TEST CASES*
