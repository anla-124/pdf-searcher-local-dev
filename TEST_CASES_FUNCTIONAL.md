# PDF SEARCHER - FUNCTIONAL TEST CASES

**Version:** 1.1
**Date:** November 25, 2025
**Total Test Cases:** 167

---

## TABLE OF CONTENTS
1. [Document Upload](#1-document-upload-26-test-cases)
2. [Document Processing Pipeline](#2-document-processing-pipeline-16-test-cases)
3. [Document List & Management](#3-document-list--management-37-test-cases)
4. [Similarity Search - General](#4-similarity-search---general-23-test-cases)
5. [Similarity Search - Selected](#5-similarity-search---selected-12-test-cases)
6. [Document Comparison (Draftable)](#6-document-comparison-draftable-10-test-cases)
7. [Authentication & Authorization](#7-authentication--authorization-25-test-cases)
8. [Health & Monitoring](#8-health--monitoring-18-test-cases)

---

## 1. DOCUMENT UPLOAD (26 Test Cases)

### TC-UP-001: Upload Single Small PDF
**Priority:** P0
**Preconditions:** User logged in, on dashboard
**Test Steps:**
1. Click "Upload Document" button
2. Select a 1-page PDF file (50 KB)
3. Click "Upload"

**Expected Results:**
- File uploads successfully
- Progress bar shows 100%
- Document appears in list with "queued" status
- Success notification displayed

**Actual Result:** _____
**Status:** _____
**Notes:** _____

---

### TC-UP-002: Upload Single Large PDF (Near Limit)
**Priority:** P1
**Preconditions:** User logged in
**Test Steps:**
1. Click "Upload Document"
2. Select a PDF file ~49 MB
3. Complete upload

**Expected Results:**
- Upload succeeds
- Processing queued
- File stored in Supabase Storage

**Actual Result:** _____
**Status:** _____

---

### TC-UP-003: Upload PDF Exceeding 50 MB Limit
**Priority:** P1
**Preconditions:** User logged in
**Test Steps:**
1. Attempt to upload 51 MB PDF

**Expected Results:**
- Upload rejected
- Error message: "File size exceeds 50 MB limit"
- File not uploaded to storage

**Actual Result:** _____
**Status:** _____

---

### TC-UP-004: Upload Non-PDF File
**Priority:** P1
**Preconditions:** User logged in
**Test Steps:**
1. Attempt to upload .docx file
2. Attempt to upload .jpg file

**Expected Results:**
- Upload rejected for both
- Error: "Only PDF files are supported"
- No file stored

**Actual Result:** _____
**Status:** _____

---

### TC-UP-005: Batch Upload - 5 Documents Simultaneously
**Priority:** P0
**Preconditions:** User logged in
**Test Steps:**
1. Select 5 PDF files (various sizes: 1 MB, 2 MB, 5 MB, 10 MB, 15 MB)
2. Upload all at once

**Expected Results:**
- All 5 files upload successfully
- Each shows individual progress
- All appear in document list
- All transition to "queued" or "processing" status

**Actual Result:** _____
**Status:** _____

---

### TC-UP-006: Upload with Metadata - All Fields Populated
**Priority:** P1
**Preconditions:** User logged in
**Test Steps:**
1. Upload PDF
2. Fill in metadata:
   - Law Firm: "Smith & Associates"
   - Fund Manager: "ABC Capital"
   - Fund Admin: "XYZ Admin"
   - Jurisdiction: "Delaware"
3. Submit

**Expected Results:**
- Metadata saved with document
- Metadata searchable later
- Metadata appears in document details

**Actual Result:** _____
**Status:** _____

---

### TC-UP-007: Upload with Partial Metadata
**Priority:** P2
**Preconditions:** User logged in
**Test Steps:**
1. Upload PDF
2. Fill only Law Firm field
3. Leave other fields empty
4. Submit

**Expected Results:**
- Upload succeeds
- Law Firm saved
- Other fields remain null
- No validation errors

**Actual Result:** _____
**Status:** _____

---

### TC-UP-008: Upload with Special Characters in Filename
**Priority:** P2
**Test Steps:**
1. Upload file named: "Contract #2024 (Final).pdf"
2. Upload file named: "Document & Agreement.pdf"

**Expected Results:**
- Both uploads succeed
- Filenames handled correctly in storage
- Special characters preserved or sanitized appropriately

**Actual Result:** _____
**Status:** _____

---

### TC-UP-009: Upload with Malformed JSON Metadata
**Priority:** P1
**Test Steps:**
1. Attempt to upload with malformed JSON metadata payload

**Expected Results:**
- Upload rejected
- Error: "Invalid metadata format"
- No file stored

**Actual Result:** _____
**Status:** _____

---

### TC-UP-010: Upload with Array Metadata (Invalid Type)
**Priority:** P1
**Test Steps:**
1. Attempt to upload with metadata as array instead of object

**Expected Results:**
- Upload rejected
- Error: "Metadata must be an object"
- No file stored

**Actual Result:** _____
**Status:** _____

---

### TC-UP-011: Upload with Non-Object Metadata Payload
**Priority:** P1
**Test Steps:**
1. Attempt to upload with metadata as string or number

**Expected Results:**
- Upload rejected
- Error: "Metadata must be an object"
- No file stored

**Actual Result:** _____
**Status:** _____

---

### TC-UP-012: Rate Limiting - Multiple Rapid Uploads Triggering 429
**Priority:** P1
**Test Steps:**
1. Upload 10 documents in rapid succession

**Expected Results:**
- Throttle kicks in after limit exceeded
- 429 response returned for throttled requests
- Error message displayed

**Actual Result:** _____
**Status:** _____

---

### TC-UP-013: Throttled Upload Error Message
**Priority:** P1
**Test Steps:**
1. Trigger upload throttling
2. Check error message

**Expected Results:**
- Clear error message: "Upload rate limit exceeded. Please try again later."
- Retry suggested

**Actual Result:** _____
**Status:** _____

---

### TC-UP-014: Concurrent Upload from Multiple Users
**Priority:** P2
**Test Steps:**
1. User A uploads document
2. User B uploads document simultaneously

**Expected Results:**
- Both uploads succeed
- No race conditions
- Each user sees only their own document

**Actual Result:** _____
**Status:** _____

---

### TC-UP-015: Upload with Very Long Filename (255+ chars)
**Priority:** P3
**Test Steps:**
1. Rename PDF to have 260-character filename
2. Upload

**Expected Results:**
- Filename truncated or error displayed
- Upload succeeds with truncated/sanitized name

**Actual Result:** _____
**Status:** _____

---

### TC-UP-016: Upload Duplicate Document
**Priority:** P2
**Test Steps:**
1. Upload "Contract.pdf"
2. Upload same "Contract.pdf" again

**Expected Results:**
- Both uploads succeed
- Second file renamed (e.g., "Contract (1).pdf") or timestamped
- No overwrite of first file

**Actual Result:** _____
**Status:** _____

---

### TC-UP-017: Cancel Upload Mid-Transfer
**Priority:** P3
**Status:** NOT SUPPORTED
**Note:** UI disables remove button during 'uploading' status. Cancel is only available for 'queued' and 'processing' statuses after upload completes.

**Test Steps:**
1. Start uploading large file (20 MB)
2. Attempt to click cancel while upload is in progress

**Expected Results:**
- Remove/cancel button is disabled during upload
- No way to cancel in-flight uploads from UI
- Can only cancel after upload completes (queued/processing status)

**Actual Result:** _____
**Status:** _____

---

### TC-UP-018: Upload with Network Interruption
**Priority:** P2
**Test Steps:**
1. Start upload
2. Disable network mid-transfer
3. Re-enable network

**Expected Results:**
- Upload fails with network error
- Retry option available
- Partial upload cleaned up

**Actual Result:** _____
**Status:** _____

---

### TC-UP-019: Upload - Drag and Drop Interface
**Priority:** P2
**Test Steps:**
1. Drag PDF file from desktop
2. Drop onto upload area

**Expected Results:**
- File accepted
- Upload begins immediately
- Same as click-to-upload behavior

**Actual Result:** _____
**Status:** _____

---

### TC-UP-020: Upload - Multiple Files Drag and Drop
**Priority:** P2
**Test Steps:**
1. Select 5 PDFs
2. Drag and drop all onto upload area

**Expected Results:**
- All 5 files accepted
- Batch upload begins
- All files process

**Actual Result:** _____
**Status:** _____

---

### TC-UP-021: Upload Encrypted/Password-Protected PDF
**Priority:** P2
**Test Steps:**
1. Upload password-protected PDF

**Expected Results:**
- Upload succeeds
- Processing fails gracefully with error: "Unable to process encrypted PDFs"
- Document marked as "failed"

**Actual Result:** _____
**Status:** _____

---

### TC-UP-022: Upload Corrupted PDF
**Priority:** P2
**Test Steps:**
1. Upload corrupted/malformed PDF file

**Expected Results:**
- Upload may succeed (file transfer)
- Processing fails with appropriate error
- Document marked as "failed"

**Actual Result:** _____
**Status:** _____

---

### TC-UP-023: Upload Scanned PDF (Image-Based)
**Priority:** P1
**Test Steps:**
1. Upload scanned document (images only, no text layer)

**Expected Results:**
- Upload succeeds
- Document AI OCR extracts text
- Processing completes
- Text searchable

**Actual Result:** _____
**Status:** _____

---

### TC-UP-024: Upload Native PDF (Text-Based)
**Priority:** P1
**Test Steps:**
1. Upload native PDF with text layer

**Expected Results:**
- Upload succeeds
- Text extracted successfully
- Processing faster than scanned PDF
- High OCR accuracy

**Actual Result:** _____
**Status:** _____

---

### TC-UP-025: Auto-Cron Trigger on Queued Upload
**Priority:** P1
**Test Steps:**
1. Upload document
2. Monitor cron endpoint calls

**Expected Results:**
- Upload triggers cron processing once
- Job processing begins automatically
- No manual intervention needed

**Actual Result:** _____
**Status:** _____

---

### TC-UP-026: Upload Triggers Cron Only Once
**Priority:** P1
**Test Steps:**
1. Upload document
2. Verify cron not called multiple times

**Expected Results:**
- Single cron call per upload
- No duplicate processing triggers
- Efficient job handling

**Actual Result:** _____
**Status:** _____

---

## 2. DOCUMENT PROCESSING PIPELINE (16 Test Cases)

### TC-PP-001: End-to-End Processing - Small Document
**Priority:** P0
**Preconditions:** User uploaded 5-page PDF
**Test Steps:**
1. Monitor processing status
2. Verify each stage: OCR → Chunking → Embeddings → Indexing

**Expected Results:**
- Status transitions: queued → processing → completed
- All stages complete successfully
- Document searchable after completion
- Processing time <2 minutes

**Actual Result:** _____
**Status:** _____

---

### TC-PP-002: End-to-End Processing - Large Document (100+ pages)
**Priority:** P1
**Test Steps:**
1. Upload 100-page PDF (10 MB)
2. Monitor processing

**Expected Results:**
- Processing completes successfully
- Chunked processing used (>15 pages)
- Processing time <10 minutes
- All chunks generated correctly

**Actual Result:** _____
**Status:** _____

---

### TC-PP-003: Processing - Very Large Document (200+ pages)
**Priority:** P1
**Test Steps:**
1. Upload 250-page PDF (25 MB)

**Expected Results:**
- Processing completes
- Memory managed efficiently
- Processing time <20 minutes
- All 250 pages indexed

**Actual Result:** _____
**Status:** _____

---

### TC-PP-004: Processing - Document at 50 MB Limit
**Priority:** P1
**Test Steps:**
1. Upload 49.5 MB PDF

**Expected Results:**
- Processing succeeds
- Timeout not reached (30 min limit)
- All content extracted

**Actual Result:** _____
**Status:** _____

---

### TC-PP-005: Cancel Processing - Early Stage
**Priority:** P1
**Test Steps:**
1. Upload document
2. Click "Cancel" during OCR stage

**Expected Results:**
- Processing stops immediately
- Document status: "cancelled"
- Partial data cleaned up (Supabase, Qdrant, Storage)
- No orphaned records

**Actual Result:** _____
**Status:** _____

---

### TC-PP-006: Cancel Processing - During Embedding Generation
**Priority:** P1
**Test Steps:**
1. Upload document
2. Cancel during embedding generation (mid-stage)

**Expected Results:**
- Processing cancelled
- Partial embeddings deleted
- Qdrant cleanup executed
- Storage file removed

**Actual Result:** _____
**Status:** _____

---

### TC-PP-007: Retry Failed Processing
**Priority:** P1
**Preconditions:** Document failed processing
**Test Steps:**
1. Click "Retry" on failed document

**Expected Results:**
- Processing restarts from beginning
- Status: queued → processing
- Attempts counter incremented
- If successful, status becomes "completed"

**Actual Result:** _____
**Status:** _____

---

### TC-PP-008: Max Retry Attempts Exhausted
**Priority:** P1
**Test Steps:**
1. Cause processing to fail
2. Retry 3 times (default max_attempts)

**Expected Results:**
- After 3rd failure, retry button disabled
- Status permanently "failed"
- Error message displayed
- Manual intervention required

**Actual Result:** _____
**Status:** _____

---

### TC-PP-009: Processing Timeout (30 min)
**Priority:** P1
**Test Steps:**
1. Upload document that takes >30 minutes
   (simulate with delayed Document AI response)

**Expected Results:**
- Job times out at 30 minutes
- Status: "failed" with error "Job timeout"
- Job released from processing
- Retry available

**Actual Result:** _____
**Status:** _____

---

### TC-PP-010: Concurrent Processing - 3 Documents
**Priority:** P0
**Preconditions:** Paid tier, MAX_CONCURRENT_DOCUMENTS=10
**Test Steps:**
1. Upload 3 documents simultaneously
2. Monitor all 3 processing in parallel

**Expected Results:**
- All 3 process concurrently
- No race conditions
- All complete successfully
- Processing times similar

**Actual Result:** _____
**Status:** _____

---

### TC-PP-011: Concurrent Processing - 10 Documents (Paid Tier)
**Priority:** P1
**Test Steps:**
1. Upload 10 documents at once

**Expected Results:**
- All 10 process in parallel
- Database connection pool remains healthy (<70% usage)
- No connection exhaustion
- All complete successfully

**Actual Result:** _____
**Status:** _____

---

### TC-PP-012: Processing - Document AI OCR Accuracy
**Priority:** P2
**Test Steps:**
1. Upload known document with measurable text
2. Compare extracted text to original

**Expected Results:**
- OCR accuracy >95% for typed text
- OCR accuracy >90% for scanned text
- Page numbers detected correctly

**Actual Result:** _____
**Status:** _____

---

### TC-PP-013: Processing - Chunk Count Accuracy
**Priority:** P2
**Test Steps:**
1. Upload 20-page document
2. Verify chunk count after processing

**Expected Results:**
- Chunk count matches expected (based on paragraph count)
- No duplicate chunks
- No missing content
- Character counts accurate

**Actual Result:** _____
**Status:** _____

---

### TC-PP-014: Processing - Centroid Computation
**Priority:** P2
**Test Steps:**
1. Upload document
2. Verify centroid embedding generated

**Expected Results:**
- Centroid stored in documents.centroid_embedding
- 768 dimensions
- Used for Stage 0 similarity search

**Actual Result:** _____
**Status:** _____

---

### TC-PP-015: Processing - Complex Layout (Tables, Columns)
**Priority:** P2
**Test Steps:**
1. Upload PDF with multi-column layout and tables

**Expected Results:**
- Content extracted in correct reading order
- Tables handled appropriately
- No garbled text

**Actual Result:** _____
**Status:** _____

---

### TC-PP-016: Auto-Cron Trigger Verification
**Priority:** P1
**Test Steps:**
1. Upload document
2. Verify cron processing triggered automatically

**Expected Results:**
- Queued upload triggers cron processing once
- Job begins processing without manual trigger
- Efficient automatic workflow

**Actual Result:** _____
**Status:** _____

---

## 3. DOCUMENT LIST & MANAGEMENT (37 Test Cases)

### TC-DL-001: View Document List - Empty State
**Priority:** P2
**Preconditions:** New user, no documents
**Test Steps:**
1. Navigate to dashboard

**Expected Results:**
- Empty state message displayed
- "Upload Document" CTA prominent
- No errors

**Actual Result:** _____
**Status:** _____

---

### TC-DL-002: View Document List - With Documents
**Priority:** P0
**Preconditions:** User has 5 uploaded documents
**Test Steps:**
1. View dashboard

**Expected Results:**
- All 5 documents displayed
- Columns: Title, Status, Pages, Date, Actions
- Correct status for each document
- Sorted by date (newest first by default)

**Actual Result:** _____
**Status:** _____

---

### TC-DL-003: Pagination - Navigate Pages
**Priority:** P1
**Preconditions:** User has 25 documents (10 per page)
**Test Steps:**
1. View page 1
2. Click "Next" to page 2
3. Click "Previous" back to page 1
4. Jump to page 3

**Expected Results:**
- Correct 10 documents per page
- Navigation works smoothly
- Page numbers accurate
- No duplicate documents across pages

**Actual Result:** _____
**Status:** _____

---

### TC-DL-004: Pagination - Negative Page Number
**Priority:** P1
**Test Steps:**
1. Request page -1 via API or URL manipulation

**Expected Results:**
- 400 Bad Request response
- Error: "Invalid page number"
- No data returned

**Actual Result:** _____
**Status:** _____

---

### TC-DL-005: Pagination - Limit Exceeding Maximum
**Priority:** P1
**Test Steps:**
1. Request limit=1000 (exceeds max allowed)

**Expected Results:**
- 400 Bad Request response
- Error: "Limit exceeds maximum allowed"
- No data returned

**Actual Result:** _____
**Status:** _____

---

### TC-DL-006: Pagination - Invalid Sort Parameter
**Priority:** P1
**Test Steps:**
1. Request with invalid sort parameter

**Expected Results:**
- 400 Bad Request response
- Error: "Invalid sort parameter"
- No data returned

**Actual Result:** _____
**Status:** _____

---

### TC-DL-007: Search Documents by Title
**Priority:** P1
**Test Steps:**
1. Type "Contract" in search box
2. Press Enter

**Expected Results:**
- Only documents with "Contract" in title/filename shown
- Search is case-insensitive
- Results update in real-time
- Count displayed: "5 documents found"

**Actual Result:** _____
**Status:** _____

---

### TC-DL-008: Filter by Status - Completed
**Priority:** P1
**Note:** Filters stored in component state only, reset on navigation/refresh.

**Test Steps:**
1. Select "Completed" from status filter dropdown
2. Navigate away and return to dashboard

**Expected Results:**
- Only completed documents shown while on page
- Processing/failed/queued documents hidden
- Filter resets to "All" on navigation/refresh (no persistence)

**Actual Result:** _____
**Status:** _____

---

### TC-DL-009: Filter by Status - Processing
**Priority:** P1
**Test Steps:**
1. Select "Processing" status filter

**Expected Results:**
- Only currently processing documents shown
- Real-time status updates (polling)
- Progress indicators visible

**Actual Result:** _____
**Status:** _____

---

### TC-DL-010: Filter by Status - Failed
**Priority:** P1
**Test Steps:**
1. Select "Failed" status filter

**Expected Results:**
- Only failed documents shown
- Error messages visible
- Retry button available for each

**Actual Result:** _____
**Status:** _____

---

### TC-DL-011: Filter by Metadata - Law Firm
**Priority:** P2
**Test Steps:**
1. Select "Smith & Associates" from Law Firm filter

**Expected Results:**
- Only documents with that law firm shown
- Count updated
- Other metadata filters still available

**Actual Result:** _____
**Status:** _____

---

### TC-DL-012: Combined Filters - Status + Metadata
**Priority:** P2
**Test Steps:**
1. Filter by Status: "Completed"
2. Add filter: Law Firm: "ABC Law"

**Expected Results:**
- Only completed documents from ABC Law shown
- Both filters applied (AND logic)
- Can clear individual filters

**Actual Result:** _____
**Status:** _____

---

### TC-DL-013: Sort by Title (A-Z)
**Priority:** P2
**Test Steps:**
1. Click "Title" column header

**Expected Results:**
- Documents sorted alphabetically A→Z
- Click again: reverse to Z→A
- Sort indicator (arrow) displayed

**Actual Result:** _____
**Status:** _____

---

### TC-DL-014: Sort by Date Created
**Priority:** P2
**Test Steps:**
1. Click "Date" column header

**Expected Results:**
- Sorted newest first (default)
- Click again: oldest first
- Date format consistent

**Actual Result:** _____
**Status:** _____

---

### TC-DL-015: Sort by Page Count
**Priority:** P3
**Test Steps:**
1. Click "Pages" column header

**Expected Results:**
- Sorted by page count (ascending/descending)
- Accurate page counts displayed

**Actual Result:** _____
**Status:** _____

---

### TC-DL-016: Rename Document
**Priority:** P1
**Test Steps:**
1. Click "Edit" on document
2. Change title from "Contract" to "Contract - Final Version"
3. Save

**Expected Results:**
- Title updated in database
- Filename in storage updated (file moved to new path)
- Qdrant metadata updated with new filename
- Change reflected immediately in list

**Actual Result:** _____
**Status:** _____

---

### TC-DL-017: Edit Metadata
**Priority:** P1
**Test Steps:**
1. Click "Edit" on document
2. Update Law Firm to "New Firm LLC"
3. Save

**Expected Results:**
- Metadata updated in database
- Metadata propagated to Qdrant vectors
- Searchable by new metadata

**Actual Result:** _____
**Status:** _____

---

### TC-DL-018: Delete Single Document
**Priority:** P0
**Test Steps:**
1. Click "Delete" on document
2. Confirm deletion

**Expected Results:**
- Document deleted from database (documents table)
- Embeddings deleted (document_embeddings table)
- Content deleted (document_content table)
- Vector IDs fetched and Qdrant cleanup queued
- File deleted from Storage
- Document removed from list

**Actual Result:** _____
**Status:** _____

---

### TC-DL-019: Delete with Confirmation Cancel
**Priority:** P2
**Test Steps:**
1. Click "Delete"
2. Click "Cancel" on confirmation

**Expected Results:**
- Deletion cancelled
- Document remains in list
- No data deleted

**Actual Result:** _____
**Status:** _____

---

### TC-DL-020: Bulk Delete - Multiple Documents
**Priority:** P1
**Note:** Frontend loops through deletes sequentially (no bulk delete API).

**Test Steps:**
1. Select 5 documents using checkboxes
2. Click "Delete Selected"
3. Confirm

**Expected Results:**
- UI shows progress: "Deleting... (1/5)", "Deleting... (2/5)", etc.
- Documents deleted sequentially (one at a time)
- Complete cleanup for each (database, Qdrant, storage)
- All 5 documents eventually deleted
- Progress indicator updates with each delete

**Actual Result:** _____
**Status:** _____

---

### TC-DL-021: Rate Limiting - Multiple Rapid Deletes Triggering 429
**Priority:** P1
**Test Steps:**
1. Delete 10 documents in rapid succession

**Expected Results:**
- Throttle kicks in after limit exceeded
- 429 response returned for throttled requests
- Error message displayed

**Actual Result:** _____
**Status:** _____

---

### TC-DL-022: Throttled Delete Error Message
**Priority:** P1
**Test Steps:**
1. Trigger delete throttling
2. Check error message

**Expected Results:**
- Clear error message: "Delete rate limit exceeded. Please try again later."
- Retry suggested

**Actual Result:** _____
**Status:** _____

---

### TC-DL-023: Qdrant Cleanup Queued on Delete
**Priority:** P1
**Test Steps:**
1. Delete document
2. Verify Qdrant cleanup worker queued

**Expected Results:**
- Vector IDs fetched before deletion
- Cleanup job queued with vectorIds
- Delete API succeeds even if cleanup pending

**Actual Result:** _____
**Status:** _____

---

### TC-DL-024: Delete Succeeds When Cleanup Fails
**Priority:** P1
**Test Steps:**
1. Delete document with Qdrant temporarily down

**Expected Results:**
- Delete API returns success
- Cleanup job queued for retry
- Database records deleted
- Cleanup happens asynchronously

**Actual Result:** _____
**Status:** _____

---

### TC-DL-025: Download Document
**Priority:** P1
**Test Steps:**
1. Click "Download" on document

**Expected Results:**
- PDF downloaded from storage
- Filename preserved
- File opens correctly

**Actual Result:** _____
**Status:** _____

---

### TC-DL-026: View Document Details
**Priority:** P2
**Test Steps:**
1. Click on document title

**Expected Results:**
- Detail view opens
- Shows: title, filename, size, pages, status, metadata, created date
- Actions available: Edit, Delete, Download, Compare

**Actual Result:** _____
**Status:** _____

---

### TC-DL-027: Real-Time Status Updates
**Priority:** P1
**Preconditions:** Document currently processing
**Test Steps:**
1. Observe document in list
2. Wait for processing to complete (don't refresh)

**Expected Results:**
- Status updates automatically (polling 25-35s)
- Progress updates if available
- Transitions to "completed" without page refresh

**Actual Result:** _____
**Status:** _____

---

### TC-DL-028: Processing Status - Happy Path
**Priority:** P1
**Note:** Endpoint used by UI polling to show real-time progress.

**Test Steps:**
1. Upload document and start processing
2. Call GET /api/documents/[id]/processing-status

**Expected Results:**
- Returns 200 OK
- Response includes: documentId, status, phase, progress, message
- Phase maps correctly: upload/extraction/analysis/embeddings/indexing
- Progress 0-100 based on document status
- Default message if processing_status table has no rows

**Actual Result:** _____
**Status:** _____

---

### TC-DL-029: Processing Status - Unauthenticated
**Priority:** P0
**Test Steps:**
1. Call GET /api/documents/[id]/processing-status without auth

**Expected Results:**
- Returns 401 Unauthorized
- Error message: "Unauthorized"

**Actual Result:** _____
**Status:** _____

---

### TC-DL-030: Processing Status - Wrong User
**Priority:** P0
**Test Steps:**
1. User A uploads document
2. User B calls GET /api/documents/[user-a-doc-id]/processing-status

**Expected Results:**
- Returns 403 Forbidden
- Error message: "Unauthorized"
- RLS prevents access to other user's documents

**Actual Result:** _____
**Status:** _____

---

### TC-DL-031: Processing Status - Document Not Found
**Priority:** P1
**Test Steps:**
1. Call GET /api/documents/[non-existent-id]/processing-status

**Expected Results:**
- Returns 404 Not Found
- Error message: "Document not found"

**Actual Result:** _____
**Status:** _____

---

### TC-DL-032: Processing Status - No Processing Status Rows
**Priority:** P2
**Note:** Tests resilience when processing_status table has no entries.

**Test Steps:**
1. Get processing status for document with no processing_status rows

**Expected Results:**
- Returns 200 OK (not 500)
- Uses default message based on document status
- Progress defaults to 0
- Handles missing data gracefully

**Actual Result:** _____
**Status:** _____

---

### TC-DL-033: Download - Unauthenticated
**Priority:** P0
**Test Steps:**
1. Call GET /api/documents/[id]/download without auth

**Expected Results:**
- Returns 401 Unauthorized
- Error message: "Unauthorized"
- No file download

**Actual Result:** _____
**Status:** _____

---

### TC-DL-034: Download - Wrong User
**Priority:** P0
**Test Steps:**
1. User A uploads document
2. User B attempts to download User A's document

**Expected Results:**
- Returns 404 Not Found (RLS hides document)
- Error message: "Document not found"
- No file download

**Actual Result:** _____
**Status:** _____

---

### TC-DL-035: Download - Missing File Path
**Priority:** P1
**Test Steps:**
1. Document exists in DB but file_path is null/missing

**Expected Results:**
- Returns 500 Internal Server Error
- Error message: "Document file path is missing"

**Actual Result:** _____
**Status:** _____

---

### TC-DL-036: Download - Storage Error
**Priority:** P2
**Test Steps:**
1. Document file_path points to non-existent storage file

**Expected Results:**
- Returns 500 Internal Server Error
- Error message: "Failed to download file"
- Error logged with documentId and filePath

**Actual Result:** _____
**Status:** _____

---

### TC-DL-037: Download - Success with Correct Headers
**Priority:** P1
**Test Steps:**
1. Download completed document
2. Verify response headers

**Expected Results:**
- Returns 200 OK
- Content-Type: application/pdf
- Content-Disposition: attachment; filename="[original-filename]"
- Content-Length header present
- PDF file downloads correctly

**Actual Result:** _____
**Status:** _____

---

## 4. SIMILARITY SEARCH - GENERAL (23 Test Cases)

### TC-SS-001: Basic Similarity Search
**Priority:** P0
**Preconditions:** User has 10+ completed documents
**Test Steps:**
1. Select source document
2. Click "Find Similar Documents"
3. Use default parameters

**Expected Results:**
- Search completes <5 seconds
- Results displayed with:
  - Target document title
  - Source score (0-100%)
  - Target score (0-100%)
  - Length ratio (percentage, e.g., 50.0%)
  - Top matching sections with page ranges
- Sorted by score (highest first)

**Actual Result:** _____
**Status:** _____

---

### TC-SS-002: Verify 3-Stage Pipeline Execution
**Priority:** P1
**Test Steps:**
1. Run similarity search
2. Check logs for stage execution

**Expected Results:**
- Stage 0: Centroid retrieval executed (600 candidates)
- Stage 1: Chunk prefilter executed (if >250 from Stage 0)
- Stage 2: Adaptive scoring executed
- Bidirectional matching performed
- Non-max suppression applied

**Actual Result:** _____
**Status:** _____

---

### TC-SS-003: Stage 0 - Centroid Candidate Retrieval
**Priority:** P1
**Test Steps:**
1. Perform search with stage0_topK=200

**Expected Results:**
- Exactly 200 candidates retrieved from Qdrant
- Uses document centroid embeddings
- Applies user_id filter (RLS)
- Fast execution (<1 second)

**Actual Result:** _____
**Status:** _____

---

### TC-SS-004: Stage 1 - Auto-Skip Logic
**Priority:** P1
**Test Steps:**
1. Search with stage0_topK=100 (less than stage1_topK default 250)

**Expected Results:**
- Stage 1 automatically skipped (log message)
- Proceeds directly to Stage 2
- Search still returns accurate results

**Actual Result:** _____
**Status:** _____

---

### TC-SS-005: Stage 1 - Chunk-Level Prefilter
**Priority:** P1
**Test Steps:**
1. Search with stage0_topK=600, stage1_topK=250

**Expected Results:**
- Stage 1 executes
- Narrows 600 candidates to 250
- Uses ANN search on chunk embeddings
- Dynamic neighborsPerChunk (36-60)

**Actual Result:** _____
**Status:** _____

---

### TC-SS-006: Stage 2 - Bidirectional Matching
**Priority:** P1
**Test Steps:**
1. Run search on asymmetric documents (short source, long target)

**Expected Results:**
- Both source→target and target→source scores calculated
- Length ratio computed as percentage
- Scores differ appropriately
- Asymmetry handled correctly

**Actual Result:** _____
**Status:** _____

---

### TC-SS-007: Stage 2 - Section Detection
**Priority:** P1
**Test Steps:**
1. Search document with known similar sections

**Expected Results:**
- Top sections identified
- Page ranges accurate
- Matching text displayed
- Non-max suppression prevents overlaps

**Actual Result:** _____
**Status:** _____

---

### TC-SS-008: Search with Page Range Filter - Source
**Priority:** P1
**Test Steps:**
1. Search with sourcePageRange: {start_page: 5, end_page: 10}

**Expected Results:**
- Only pages 5-10 of source considered
- Rest of source ignored
- Results reflect page range constraint

**Actual Result:** _____
**Status:** _____

---

### TC-SS-009: Search with Metadata Filter - Law Firm
**Priority:** P1
**Test Steps:**
1. Add filter: Law Firm = "ABC Law"
2. Run search

**Expected Results:**
- Only documents from ABC Law in results
- Metadata filter applied at Stage 0 (Qdrant)
- Efficient filtering (not post-search)

**Actual Result:** _____
**Status:** _____

---

### TC-SS-010: Search with Multiple Metadata Filters
**Priority:** P2
**Test Steps:**
1. Filter: Law Firm = "ABC" AND Fund Manager = "XYZ Capital"

**Expected Results:**
- Both filters applied (AND logic)
- Only documents matching both criteria
- Results count accurate

**Actual Result:** _____
**Status:** _____

---

### TC-SS-011: Search with Min Score Thresholds
**Priority:** P1
**Test Steps:**
1. Set source_min_score = 80%
2. Set target_min_score = 70%

**Expected Results:**
- Only results with source ≥80% AND target ≥70% shown
- Lower scoring matches excluded
- Empty results if no matches meet threshold

**Actual Result:** _____
**Status:** _____

---

### TC-SS-012: Search with topK Limit
**Priority:** P2
**Test Steps:**
1. Set topK = 10

**Expected Results:**
- Maximum 10 results returned
- Top 10 by score
- Even if more matches exist

**Actual Result:** _____
**Status:** _____

---

### TC-SS-013: Search Returns Zero Results
**Priority:** P2
**Test Steps:**
1. Search unique document with no similar content

**Expected Results:**
- "No similar documents found" message
- Empty results table
- No errors

**Actual Result:** _____
**Status:** _____

---

### TC-SS-014: Search - Character-Based Scoring Accuracy
**Priority:** P1
**Test Steps:**
1. Search with known similar documents
2. Verify score calculation

**Expected Results:**
- Scores based on character overlap (not chunk)
- More accurate than chunk-based scoring
- Scores range 0-100%

**Actual Result:** _____
**Status:** _____

---

### TC-SS-015: Search - Length Ratio as Percentage
**Priority:** P2
**Test Steps:**
1. Search short doc vs long doc (1:2 ratio)

**Expected Results:**
- Length ratio displayed as percentage (e.g., 50.0%)
- NOT displayed as "1:2" format
- Accurate calculation: source_chars / target_chars * 100

**Actual Result:** _____
**Status:** _____

---

### TC-SS-016: Search Performance - Response Time
**Priority:** P1
**Test Steps:**
1. Search with default parameters
2. Measure time from click to results displayed

**Expected Results:**
- Search completes <5 seconds (P95)
- UI remains responsive
- Loading indicator displayed

**Actual Result:** _____
**Status:** _____

---

### TC-SS-017: Search with Large Result Set (500+ candidates)
**Priority:** P2
**Test Steps:**
1. Search generic document likely to match many
2. Set stage0_topK=500

**Expected Results:**
- All 500 candidates processed
- Stage 2 handles large set efficiently
- Results returned within timeout
- Top matches accurate

**Actual Result:** _____
**Status:** _____

---

### TC-SS-018: Search - Concurrent Searches (Multiple Users)
**Priority:** P2
**Test Steps:**
1. User A runs search
2. User B runs search simultaneously

**Expected Results:**
- Both searches complete successfully
- No interference between searches
- Each user sees only their results
- Performance not degraded

**Actual Result:** _____
**Status:** _____

---

### TC-SS-019: Search - Sort Results by Score
**Priority:** P2
**Note:** Sort state stored in component state only, resets on navigation.

**Test Steps:**
1. Run search
2. Click column headers to sort
3. Navigate away and return

**Expected Results:**
- Can sort by: sourceScore, targetScore, lengthRatio
- Ascending/descending toggle works on page
- Sort resets to default on navigation (no persistence)

**Actual Result:** _____
**Status:** _____

---

### TC-SS-020: Search - View Match Details
**Priority:** P1
**Test Steps:**
1. Run search
2. Click "View Details" on result

**Expected Results:**
- Modal shows:
  - Full matching text
  - Page numbers
  - Score breakdown
  - Compare button (Draftable)

**Actual Result:** _____
**Status:** _____

---

### TC-SS-021: Search on Recently Uploaded Document
**Priority:** P1
**Test Steps:**
1. Upload document
2. Wait for processing to complete
3. Immediately search

**Expected Results:**
- Document available for search
- Results accurate
- Centroid computed correctly

**Actual Result:** _____
**Status:** _____

---

### TC-SS-022: Search Document Not Yet Completed
**Priority:** P1
**Test Steps:**
1. Try to search document still processing

**Expected Results:**
- Error: "Document not ready for search"
- Suggestion to wait for processing
- Status indicator shown

**Actual Result:** _____
**Status:** _____

---

### TC-SS-023: Search with Adjusted Stage 2 Workers
**Priority:** P2
**Preconditions:** SIMILARITY_STAGE2_WORKERS=1 (test env)
**Test Steps:**
1. Run search
2. Compare performance to default (8 workers)

**Expected Results:**
- Search completes (slower with 1 worker)
- Results identical
- Worker configuration respected

**Actual Result:** _____
**Status:** _____

---

## 5. SIMILARITY SEARCH - SELECTED (12 Test Cases)

### TC-SSS-001: Selected Search - Choose 3 Target Documents
**Priority:** P1
**Test Steps:**
1. Select source document
2. Click "Compare with Selected"
3. Choose 3 target documents
4. Run search

**Expected Results:**
- Search runs only against 3 selected targets
- All 3 targets in results (even if 0% match)
- Faster than general search (smaller candidate set)

**Actual Result:** _____
**Status:** _____

---

### TC-SSS-002: Selected Search - Include Zero-Score Matches
**Priority:** P1
**Test Steps:**
1. Select source + 5 targets
2. Run search
3. Verify results

**Expected Results:**
- All 5 targets in results
- Some may have 0% score
- Useful for completeness checking

**Actual Result:** _____
**Status:** _____

---

### TC-SSS-003: Selected Search - Many Targets (20+)
**Priority:** P2
**Test Steps:**
1. Select 25 target documents

**Expected Results:**
- All 25 processed
- Results for all 25
- Performance acceptable (<30 seconds)

**Actual Result:** _____
**Status:** _____

---

### TC-SSS-004: Selected Search with Page Range + Metadata Filters
**Priority:** P2
**Test Steps:**
1. Selected search with 5 targets
2. Add sourcePageRange filter
3. Add metadata filter

**Expected Results:**
- Filters applied correctly
- Only relevant sections compared
- Metadata constraints respected

**Actual Result:** _____
**Status:** _____

---

### TC-SSS-005: Selected Search - Source Not Completed
**Priority:** P1
**Test Steps:**
1. Select source document that is still processing
2. Attempt selected search

**Expected Results:**
- 400 Bad Request response
- Error: "Source document not completed"
- Search blocked until processing completes

**Actual Result:** _____
**Status:** _____

---

### TC-SSS-006: Selected Search - Target Not Found
**Priority:** P1
**Test Steps:**
1. Select source document
2. Include target document ID that doesn't exist

**Expected Results:**
- Graceful handling of missing target
- Error or skip missing target
- Other valid targets processed normally

**Actual Result:** _____
**Status:** _____

---

### TC-SSS-007: Selected Search - Search Interface UX
**Priority:** P2
**Test Steps:**
1. Navigate to selected search mode

**Expected Results:**
- Clear UI for selecting targets
- Search button disabled until targets selected
- Can deselect targets
- Count of selected shown

**Actual Result:** _____
**Status:** _____

---

### TC-SSS-008: Selected Search - Results Table
**Priority:** P1
**Test Steps:**
1. Run selected search

**Expected Results:**
- Table shows all selected targets
- Columns: Document, Source Score, Target Score, Length Ratio
- Sorted by score

**Actual Result:** _____
**Status:** _____

---

### TC-SSS-009: Selected Search vs General Search - Result Comparison
**Priority:** P2
**Test Steps:**
1. Run general search
2. Run selected search with top 5 from general search

**Expected Results:**
- Scores should match for same documents
- Selected search faster (smaller Stage 0)
- Results consistent

**Actual Result:** _____
**Status:** _____

---

### TC-SSS-010: Selected Search - Empty Selection
**Priority:** P2
**Test Steps:**
1. Click "Compare with Selected"
2. Don't select any targets
3. Try to run search

**Expected Results:**
- Error: "Please select at least one target document"
- Search button disabled
- Guidance displayed

**Actual Result:** _____
**Status:** _____

---

### TC-SSS-011: Selected Search - Target Selection Clears on Navigation
**Priority:** P3
**Note:** Selection state is stored in URL params, not in persistent storage.

**Test Steps:**
1. Select 5 targets for selected search
2. Navigate away to dashboard
3. Return to selected search page

**Expected Results:**
- Selection is cleared (selection comes from URL params)
- User must re-select targets
- No persistent storage of selection across navigation

**Actual Result:** _____
**Status:** _____

---

### TC-SSS-012: Selected Search - 404 Handling for Missing Targets
**Priority:** P2
**Test Steps:**
1. Run selected search with mix of valid and invalid target IDs

**Expected Results:**
- Invalid targets skipped or error shown
- Valid targets processed
- Clear error message for missing targets

**Actual Result:** _____
**Status:** _____

---

## 6. DOCUMENT COMPARISON (DRAFTABLE) (10 Test Cases)

### TC-DRAFT-001: Create Comparison - Two Documents
**Priority:** P1
**Test Steps:**
1. Select source document
2. Select target document
3. Click "Compare with Draftable"

**Expected Results:**
- API call to Draftable succeeds
- Comparison created
- Signed URL returned
- URL opens in new tab
- Side-by-side comparison displayed

**Actual Result:** _____
**Status:** _____

---

### TC-DRAFT-002: Comparison from Search Results
**Priority:** P1
**Test Steps:**
1. Run similarity search
2. Click "Compare" on a result

**Expected Results:**
- Comparison created for source + target
- Opens in new tab
- No errors

**Actual Result:** _____
**Status:** _____

---

### TC-DRAFT-003: Comparison - Signed URL Expiry
**Priority:** P2
**Test Steps:**
1. Create comparison
2. Wait appropriate time
3. Try to access URL

**Expected Results:**
- URL expires per Draftable policy
- Draftable error page shown
- Option to create new comparison

**Actual Result:** _____
**Status:** _____

---

### TC-DRAFT-004: Comparison - Invalid Document Format
**Priority:** P2
**Test Steps:**
1. Attempt to compare documents
   (note: all are PDFs, so this tests error handling)

**Expected Results:**
- Only PDF comparison supported
- Error if non-PDF somehow attempted

**Actual Result:** _____
**Status:** _____

---

### TC-DRAFT-005: Comparison - Large Documents
**Priority:** P2
**Test Steps:**
1. Compare two 200-page documents

**Expected Results:**
- Comparison succeeds
- May take longer (30s timeout in code)
- Draftable handles large files

**Actual Result:** _____
**Status:** _____

---

### TC-DRAFT-006: Comparison - Draftable API Timeout
**Priority:** P2
**Test Steps:**
1. Simulate Draftable API slow response (>30s)

**Expected Results:**
- Request times out gracefully
- Error message: "Comparison timed out"
- Retry option available

**Actual Result:** _____
**Status:** _____

---

### TC-DRAFT-007: Comparison - Draftable API Error
**Priority:** P2
**Test Steps:**
1. Simulate Draftable 500 error

**Expected Results:**
- Error caught and logged
- User-friendly error message
- No app crash

**Actual Result:** _____
**Status:** _____

---

### TC-DRAFT-008: Comparison - Missing Draftable Credentials
**Priority:** P2
**Preconditions:** DRAFTABLE_AUTH_TOKEN not set
**Test Steps:**
1. Try to create comparison

**Expected Results:**
- Error: "Draftable not configured"
- Feature disabled or error shown
- Graceful degradation

**Actual Result:** _____
**Status:** _____

---

### TC-DRAFT-009: Multiple Comparisons in Sequence
**Priority:** P2
**Test Steps:**
1. Create comparison A vs B
2. Create comparison A vs C
3. Create comparison B vs C

**Expected Results:**
- All 3 comparisons succeed
- Unique URLs for each
- No conflicts

**Actual Result:** _____
**Status:** _____

---

### TC-DRAFT-010: Comparison - Audit Logging
**Priority:** P3
**Test Steps:**
1. Create comparison
2. Check user_activity_logs

**Expected Results:**
- Activity logged with:
  - Action: "document_comparison"
  - Resource: both document IDs
  - Timestamp
  - User ID

**Actual Result:** _____
**Status:** _____

---

## 7. AUTHENTICATION & AUTHORIZATION (25 Test Cases)

### TC-AUTH-001: Sign Up with Google OAuth
**Priority:** P0
**Test Steps:**
1. Click "Sign in with Google"
2. Complete Google authentication
3. Grant permissions

**Expected Results:**
- Redirected to Google login
- After auth, redirected to dashboard
- User created in Supabase auth.users
- User record in public.users
- Session token set

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-002: Sign In with Google OAuth (Existing User)
**Priority:** P0
**Test Steps:**
1. Sign in with previously registered Google account

**Expected Results:**
- Authentication succeeds
- Redirected to dashboard
- User's documents loaded
- Session active

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-003: Sign Up with Email/Password (Local Dev Only)
**Priority:** P1
**Preconditions:** Running on localhost
**Test Steps:**
1. Enter email and password
2. Click "Sign Up"

**Expected Results:**
- User created
- Verification email sent (if configured)
- Can log in with credentials

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-004: Sign In with Email/Password (Local Dev)
**Priority:** P1
**Test Steps:**
1. Enter valid email/password
2. Click "Sign In"

**Expected Results:**
- Authentication succeeds
- Dashboard loads
- Session active

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-005: Sign In - Invalid Credentials
**Priority:** P1
**Test Steps:**
1. Enter wrong password

**Expected Results:**
- Error: "Invalid email or password"
- User remains on login page
- No session created

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-006: Email/Password Hidden in Production
**Priority:** P1
**Preconditions:** Production environment (not localhost)
**Test Steps:**
1. Load login page

**Expected Results:**
- Only "Sign in with Google" button visible
- Email/password form hidden
- Environment detection working

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-007: Session Persistence
**Priority:** P1
**Test Steps:**
1. Log in
2. Close browser
3. Reopen and navigate to app

**Expected Results:**
- User still logged in
- Session restored
- Dashboard loads without re-authentication

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-008: Session Expiration
**Priority:** P1
**Test Steps:**
1. Log in
2. Wait for session to expire (Supabase default: 1 hour)
3. Try to access protected route

**Expected Results:**
- Redirected to login page
- Message: "Session expired, please log in again"

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-009: Logout
**Priority:** P1
**Test Steps:**
1. Log in
2. Click "Logout"

**Expected Results:**
- Session destroyed
- Redirected to login page
- Cannot access dashboard without re-login

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-010: Protected Route Access (Unauthenticated)
**Priority:** P0
**Test Steps:**
1. Access /dashboard without logging in

**Expected Results:**
- Redirected to /login
- Error: "Please log in to access this page"
- After login, redirected to originally requested page

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-011: API Endpoint Protection (No Auth Token)
**Priority:** P0
**Test Steps:**
1. Call `GET /api/documents` without auth header

**Expected Results:**
- 401 Unauthorized response
- Error: "Authentication required"
- No data returned

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-012: RLS Policy - User Can Only See Own Documents
**Priority:** P0
**Test Steps:**
1. User A logs in
2. User A uploads document
3. User B logs in
4. User B views document list

**Expected Results:**
- User A sees only their document
- User B sees zero documents (or only theirs)
- User B cannot access User A's document ID directly

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-013: RLS Policy - Direct Document ID Access Blocked
**Priority:** P0
**Test Steps:**
1. User A gets document ID: "abc-123"
2. User B tries `GET /api/documents/abc-123`

**Expected Results:**
- 403 Forbidden or 404 Not Found
- RLS blocks access
- No data leaked

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-014: RLS Policy - Service Role Bypass
**Priority:** P1
**Test Steps:**
1. Cron job claims job with service_role client

**Expected Results:**
- Service role can access all documents
- Job claiming succeeds across all users
- RLS bypassed correctly

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-015: RLS Policy - Embeddings Table
**Priority:** P1
**Test Steps:**
1. User A creates embeddings
2. User B queries document_embeddings table

**Expected Results:**
- User B cannot see User A's embeddings
- RLS enforced via JOIN to documents table

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-016: RLS Policy - Document Jobs
**Priority:** P1
**Test Steps:**
1. User A has processing job
2. User B queries document_jobs

**Expected Results:**
- User B cannot see User A's jobs
- user_id filter enforced

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-017: Storage RLS - Upload
**Priority:** P1
**Test Steps:**
1. User A uploads file to storage

**Expected Results:**
- File stored in user_id folder: `{user_id}/filename.pdf`
- RLS policy allows upload only to own folder

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-018: Storage RLS - Download Own File
**Priority:** P1
**Test Steps:**
1. User A downloads their uploaded file

**Expected Results:**
- Download succeeds
- Signed URL generated
- File accessible

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-019: Storage RLS - Download Other User's File
**Priority:** P0
**Test Steps:**
1. User B tries to download User A's file

**Expected Results:**
- 403 Forbidden
- RLS blocks access
- No file download

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-020: Storage RLS - Service Role Access
**Priority:** P1
**Test Steps:**
1. Cron job downloads file for processing

**Expected Results:**
- Service role can access all files
- Processing succeeds

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-021: Token Refresh
**Priority:** P2
**Test Steps:**
1. Log in
2. Stay logged in for >50 minutes (near expiry)

**Expected Results:**
- Token automatically refreshed
- No logout
- Seamless experience

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-022: Concurrent Sessions
**Priority:** P2
**Test Steps:**
1. Log in on Chrome
2. Log in on Firefox (same user)

**Expected Results:**
- Both sessions active
- Independent sessions
- No conflicts

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-023: OAuth Callback Error Handling
**Priority:** P2
**Test Steps:**
1. Simulate OAuth error callback

**Expected Results:**
- Error caught gracefully
- User-friendly error message
- Can retry login

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-024: Password Reset (Email/Password, Local Dev)
**Priority:** P2
**Test Steps:**
1. Click "Forgot Password"
2. Enter email
3. Check email for reset link
4. Reset password

**Expected Results:**
- Reset email received
- Link works
- Password updated
- Can log in with new password

**Actual Result:** _____
**Status:** _____

---

### TC-AUTH-025: Anonymous/Public Access Blocked
**Priority:** P0
**Test Steps:**
1. Access any route without authentication

**Expected Results:**
- All routes require authentication
- No public access
- Redirected to login

**Actual Result:** _____
**Status:** _____

---

## 8. HEALTH & MONITORING (18 Test Cases)

### TC-HM-001: Basic Health Check Endpoint
**Priority:** P1
**Test Steps:**
1. Call `GET /api/health`

**Expected Results:**
- 200 OK response
- JSON: `{ status: "healthy", timestamp: "..." }`
- Response time <100ms

**Actual Result:** _____
**Status:** _____

---

### TC-HM-002: Connection Pool Health
**Priority:** P1
**Test Steps:**
1. Call `GET /api/health/pool`

**Expected Results:**
- Returns:
  - Total connections
  - Idle connections
  - Active connections
  - Utilization percentage

**Actual Result:** _____
**Status:** _____

---

### TC-HM-003: Health Pool - Throttling Metrics
**Priority:** P1
**Test Steps:**
1. Call `GET /api/health/pool`
2. Check throttling state

**Expected Results:**
- Returns throttling.upload.limit
- Returns throttling.upload.remaining
- Returns throttling.delete.limit
- Returns throttling.delete.remaining

**Actual Result:** _____
**Status:** _____

---

### TC-HM-004: Health Pool - Qdrant Cleanup Queue Depth
**Priority:** P1
**Test Steps:**
1. Call `GET /api/health/pool`
2. Check Qdrant cleanup metrics

**Expected Results:**
- Returns qdrantCleanup.queueDepth
- Returns qdrantCleanup.processing
- Returns qdrantCleanup.failed

**Actual Result:** _____
**Status:** _____

---

### TC-HM-005: Stuck Jobs Monitoring View
**Priority:** P1
**Test Steps:**
1. Query `SELECT * FROM stuck_jobs_monitoring;`

**Expected Results:**
- Returns jobs processing >15 minutes
- Shows: job ID, duration, worker_id, recovery status
- Accurate data

**Actual Result:** _____
**Status:** _____

---

### TC-HM-006: Database Connectivity Check
**Priority:** P1
**Test Steps:**
1. Health endpoint queries database

**Expected Results:**
- If DB unreachable, health check fails
- Error response
- Clear error message

**Actual Result:** _____
**Status:** _____

---

### TC-HM-007: Qdrant Connectivity Check
**Priority:** P1
**Test Steps:**
1. Health endpoint checks Qdrant

**Expected Results:**
- If Qdrant down, health degraded
- Partial health status
- Retry queue status

**Actual Result:** _____
**Status:** _____

---

### TC-HM-008: Activity Logging - Upload Action
**Priority:** P2
**Test Steps:**
1. Upload document
2. Query `user_activity_logs` table

**Expected Results:**
- Action logged: "document_upload"
- Resource ID: document UUID
- Metadata: filename, size
- Timestamp accurate

**Actual Result:** _____
**Status:** _____

---

### TC-HM-009: Activity Logging - Search Action
**Priority:** P2
**Test Steps:**
1. Perform similarity search
2. Check activity logs

**Expected Results:**
- Action: "similarity_search"
- Metadata: source_id, filters, result_count
- Duration logged

**Actual Result:** _____
**Status:** _____

---

### TC-HM-010: Activity Logging - Delete Action
**Priority:** P2
**Test Steps:**
1. Delete document
2. Check logs

**Expected Results:**
- Action: "document_delete"
- Resource: deleted document ID
- Logged before deletion (audit trail)

**Actual Result:** _____
**Status:** _____

---

### TC-HM-011: Cleanup Old Activity Logs Function
**Priority:** P2
**Test Steps:**
1. Execute `SELECT cleanup_old_activity_logs();`

**Expected Results:**
- Deletes logs >90 days old
- Returns count of deleted rows
- Recent logs preserved

**Actual Result:** _____
**Status:** _____

---

### TC-HM-012: Health Check - External Service Status
**Priority:** P2
**Test Steps:**
1. Call health endpoint
2. Check external service status (if implemented)

**Expected Results:**
- Shows Document AI status
- Shows Vertex AI status
- Shows Qdrant status
- Shows Storage status

**Actual Result:** _____
**Status:** _____

---

### TC-HM-013: Cron Endpoint with Missing CRON_SECRET
**Priority:** P1
**Test Steps:**
1. Call `GET /api/cron/process-jobs` without Authorization header

**Expected Results:**
- 401 Unauthorized response
- Error: "Missing or invalid CRON_SECRET"
- No job processing triggered

**Actual Result:** _____
**Status:** _____

---

### TC-HM-014: Cron Endpoint with Invalid CRON_SECRET
**Priority:** P1
**Test Steps:**
1. Call `GET /api/cron/process-jobs` with wrong Bearer token

**Expected Results:**
- 401 Unauthorized response
- Error: "Invalid CRON_SECRET"
- No job processing triggered

**Actual Result:** _____
**Status:** _____

---

### TC-HM-015: Cron Endpoint with Valid CRON_SECRET
**Priority:** P1
**Test Steps:**
1. Call `GET /api/cron/process-jobs` with correct Bearer token

**Expected Results:**
- 200 OK response
- Job processing triggered
- Response includes processed job count

**Actual Result:** _____
**Status:** _____

---

### TC-HM-016: Cron Endpoint GET Method
**Priority:** P1
**Test Steps:**
1. Call `GET /api/cron/process-jobs` with valid auth

**Expected Results:**
- GET method supported
- Jobs processed correctly
- Same behavior as POST

**Actual Result:** _____
**Status:** _____

---

### TC-HM-017: Cron Endpoint POST Method
**Priority:** P1
**Test Steps:**
1. Call `POST /api/cron/process-jobs` with valid auth

**Expected Results:**
- POST method supported
- Jobs processed correctly
- Same behavior as GET

**Actual Result:** _____
**Status:** _____

---

### TC-HM-018: Test Process Jobs Endpoint
**Priority:** P1
**Test Steps:**
1. Call `GET /api/test/process-jobs`
2. Call `POST /api/test/process-jobs`

**Expected Results:**
- Both GET and POST methods work
- Jobs processed in test mode
- Response includes job details

**Actual Result:** _____
**Status:** _____

---

## TEST CASE SUMMARY

| Feature Area | Test Cases | P0 | P1 | P2 | P3 |
|--------------|------------|----|----|----|----|
| Document Upload | 26 | 2 | 13 | 10 | 1 |
| Processing Pipeline | 16 | 2 | 9 | 5 | 0 |
| Document List & Management | 27 | 1 | 13 | 11 | 2 |
| Similarity Search - General | 23 | 1 | 11 | 10 | 1 |
| Similarity Search - Selected | 12 | 0 | 6 | 5 | 1 |
| Document Comparison | 10 | 0 | 3 | 6 | 1 |
| Authentication & Authorization | 25 | 7 | 11 | 7 | 0 |
| Health & Monitoring | 18 | 0 | 11 | 7 | 0 |
| **TOTAL** | **157** | **13** | **77** | **61** | **6** |

---

## TEST EXECUTION TEMPLATE

For each test case, record:
- **Actual Result**: What actually happened
- **Status**: ✅ Pass | ❌ Fail | ⏸️ Blocked | ⏭️ Skipped
- **Notes**: Any observations, screenshots, or additional context
- **Defect ID**: Link to defect if test failed

---

*END OF FUNCTIONAL TEST CASES*
