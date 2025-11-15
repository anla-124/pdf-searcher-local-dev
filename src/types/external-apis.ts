/**
 * Comprehensive type definitions for external APIs
 * Enterprise-grade type safety for Google Document AI, Qdrant, Vertex AI, and Supabase
 */

// =============================================================================
// GOOGLE DOCUMENT AI TYPES
// =============================================================================

export interface DocumentAITextAnchor {
  textSegments?: Array<{
    startIndex?: string
    endIndex?: string
  }>
  content?: string
}

export interface DocumentAIBoundingBox {
  vertices?: Array<{
    x?: number
    y?: number
  }>
  normalizedVertices?: Array<{
    x?: number
    y?: number
  }>
}

export interface DocumentAILayout {
  textAnchor?: DocumentAITextAnchor
  confidence?: number
  boundingPoly?: DocumentAIBoundingBox
  orientation?: 'PAGE_UP' | 'PAGE_RIGHT' | 'PAGE_DOWN' | 'PAGE_LEFT'
}

export interface DocumentAIFormField {
  fieldName?: DocumentAILayout
  fieldValue?: DocumentAILayout
  nameDetectedLanguages?: Array<{
    languageCode?: string
    confidence?: number
  }>
  valueDetectedLanguages?: Array<{
    languageCode?: string
    confidence?: number
  }>
  valueType?: string
  correctedKeyText?: string
  correctedValueText?: string
  provenance?: {
    revision?: number
    id?: number
    parents?: Array<{
      revision?: number
      id?: number
      index?: number
    }>
    type?: 'DATASET' | 'HUMAN_LABELED' | 'AUTO_LABELED'
  }
}

export interface DocumentAITable {
  layout?: DocumentAILayout
  headerRows?: Array<{
    cells?: Array<{
      layout?: DocumentAILayout
      rowSpan?: number
      colSpan?: number
      detectedLanguages?: Array<{
        languageCode?: string
        confidence?: number
      }>
    }>
  }>
  bodyRows?: Array<{
    cells?: Array<{
      layout?: DocumentAILayout
      rowSpan?: number
      colSpan?: number
      detectedLanguages?: Array<{
        languageCode?: string
        confidence?: number
      }>
    }>
  }>
  detectedLanguages?: Array<{
    languageCode?: string
    confidence?: number
  }>
  provenance?: {
    revision?: number
    id?: number
    parents?: Array<{
      revision?: number
      id?: number
      index?: number
    }>
    type?: 'DATASET' | 'HUMAN_LABELED' | 'AUTO_LABELED'
  }
}

export interface DocumentAIPage {
  pageNumber?: number
  image?: {
    content?: string
    mimeType?: string
    width?: number
    height?: number
  }
  transforms?: Array<{
    rows?: number
    cols?: number
    type?: number
    data?: number[]
  }>
  dimension?: {
    width?: number
    height?: number
    unit?: string
  }
  layout?: DocumentAILayout
  detectedLanguages?: Array<{
    languageCode?: string
    confidence?: number
  }>
  blocks?: Array<{
    layout?: DocumentAILayout
    detectedLanguages?: Array<{
      languageCode?: string
      confidence?: number
    }>
    provenance?: {
      revision?: number
      id?: number
      parents?: Array<{
        revision?: number
        id?: number
        index?: number
      }>
      type?: 'DATASET' | 'HUMAN_LABELED' | 'AUTO_LABELED'
    }
  }>
  paragraphs?: Array<{
    layout?: DocumentAILayout
    detectedLanguages?: Array<{
      languageCode?: string
      confidence?: number
    }>
    provenance?: {
      revision?: number
      id?: number
      parents?: Array<{
        revision?: number
        id?: number
        index?: number
      }>
      type?: 'DATASET' | 'HUMAN_LABELED' | 'AUTO_LABELED'
    }
  }>
  lines?: Array<{
    layout?: DocumentAILayout
    detectedLanguages?: Array<{
      languageCode?: string
      confidence?: number
    }>
    provenance?: {
      revision?: number
      id?: number
      parents?: Array<{
        revision?: number
        id?: number
        index?: number
      }>
      type?: 'DATASET' | 'HUMAN_LABELED' | 'AUTO_LABELED'
    }
  }>
  tokens?: Array<{
    layout?: DocumentAILayout
    detectedBreak?: {
      type?: 'SPACE' | 'WIDE_SPACE' | 'HYPHEN'
    }
    detectedLanguages?: Array<{
      languageCode?: string
      confidence?: number
    }>
    provenance?: {
      revision?: number
      id?: number
      parents?: Array<{
        revision?: number
        id?: number
        index?: number
      }>
      type?: 'DATASET' | 'HUMAN_LABELED' | 'AUTO_LABELED'
    }
    styleInfo?: {
      fontSize?: number
      pixelFontSize?: number
      letterSpacing?: number
      fontType?: string
      bold?: boolean
      italic?: boolean
      underlined?: boolean
      strikeout?: boolean
      subscript?: boolean
      superscript?: boolean
      smallcaps?: boolean
      fontWeight?: number
      handwritten?: boolean
      textColor?: {
        red?: number
        green?: number
        blue?: number
        alpha?: number
      }
      backgroundColor?: {
        red?: number
        green?: number
        blue?: number
        alpha?: number
      }
    }
  }>
  visualElements?: Array<{
    layout?: DocumentAILayout
    type?: string
    detectedLanguages?: Array<{
      languageCode?: string
      confidence?: number
    }>
  }>
  tables?: DocumentAITable[]
  formFields?: DocumentAIFormField[]
  symbols?: Array<{
    layout?: DocumentAILayout
    detectedLanguages?: Array<{
      languageCode?: string
      confidence?: number
    }>
  }>
  detectedBarcodes?: Array<{
    layout?: DocumentAILayout
    barcode?: {
      format?: string
      valueFormat?: string
      rawValue?: string
    }
  }>
  imageQualityScores?: {
    qualityScore?: number
    detectedDefects?: Array<{
      type?: string
      confidence?: number
    }>
  }
  provenance?: {
    revision?: number
    id?: number
    parents?: Array<{
      revision?: number
      id?: number
      index?: number
    }>
    type?: 'DATASET' | 'HUMAN_LABELED' | 'AUTO_LABELED'
  }
}

export interface DocumentAIEntity {
  textAnchor?: DocumentAITextAnchor
  type?: string
  mentionText?: string
  mentionId?: string
  confidence?: number
  pageAnchor?: {
    pageRefs?: Array<{
      page?: string
      layoutType?: 'BLOCK' | 'PARAGRAPH' | 'LINE' | 'TOKEN' | 'VISUAL_ELEMENT'
      layoutId?: string
      boundingPoly?: DocumentAIBoundingBox
      confidence?: number
    }>
  }
  id?: string
  normalizedValue?: {
    text?: string
    moneyValue?: {
      currencyCode?: string
      units?: string
      nanos?: number
    }
    dateValue?: {
      year?: number
      month?: number
      day?: number
    }
    datetimeValue?: {
      timeZone?: {
        id?: string
        version?: string
      }
      day?: number
      month?: number
      year?: number
      hours?: number
      minutes?: number
      seconds?: number
      nanos?: number
      utcOffset?: string
    }
    addressValue?: {
      revision?: number
      regionCode?: string
      languageCode?: string
      postalCode?: string
      sortingCode?: string
      administrativeArea?: string
      locality?: string
      sublocality?: string
      addressLines?: string[]
      recipients?: string[]
      organization?: string
    }
    booleanValue?: boolean
    integerValue?: number
    floatValue?: number
  }
  properties?: Array<{
    textAnchor?: DocumentAITextAnchor
    type?: string
    mentionText?: string
    mentionId?: string
    confidence?: number
    pageAnchor?: {
      pageRefs?: Array<{
        page?: string
        layoutType?: 'BLOCK' | 'PARAGRAPH' | 'LINE' | 'TOKEN' | 'VISUAL_ELEMENT'
        layoutId?: string
        boundingPoly?: DocumentAIBoundingBox
        confidence?: number
      }>
    }
    id?: string
    normalizedValue?: {
      text?: string
      moneyValue?: {
        currencyCode?: string
        units?: string
        nanos?: number
      }
      dateValue?: {
        year?: number
        month?: number
        day?: number
      }
      datetimeValue?: {
        timeZone?: {
          id?: string
          version?: string
        }
        day?: number
        month?: number
        year?: number
        hours?: number
        minutes?: number
        seconds?: number
        nanos?: number
        utcOffset?: string
      }
      addressValue?: {
        revision?: number
        regionCode?: string
        languageCode?: string
        postalCode?: string
        sortingCode?: string
        administrativeArea?: string
        locality?: string
        sublocality?: string
        addressLines?: string[]
        recipients?: string[]
        organization?: string
      }
      booleanValue?: boolean
      integerValue?: number
      floatValue?: number
    }
    properties?: Array<unknown> // Recursive structure
    provenance?: {
      revision?: number
      id?: number
      parents?: Array<{
        revision?: number
        id?: number
        index?: number
      }>
      type?: 'DATASET' | 'HUMAN_LABELED' | 'AUTO_LABELED'
    }
  }>
  provenance?: {
    revision?: number
    id?: number
    parents?: Array<{
      revision?: number
      id?: number
      index?: number
    }>
    type?: 'DATASET' | 'HUMAN_LABELED' | 'AUTO_LABELED'
  }
  redacted?: boolean
}

export interface DocumentAIDocument {
  mimeType?: string
  text?: string
  textStyles?: Array<{
    textAnchor?: DocumentAITextAnchor
    color?: {
      red?: number
      green?: number
      blue?: number
      alpha?: number
    }
    backgroundColor?: {
      red?: number
      green?: number
      blue?: number
      alpha?: number
    }
    fontWeight?: string
    textStyle?: string
    textDecoration?: string
    fontSize?: {
      size?: number
      unit?: string
    }
  }>
  pages?: DocumentAIPage[]
  entities?: DocumentAIEntity[]
  entityRelations?: Array<{
    subjectId?: string
    objectId?: string
    relation?: string
  }>
  textChanges?: Array<{
    textAnchor?: DocumentAITextAnchor
    changedText?: string
    provenance?: Array<{
      revision?: number
      id?: number
      parents?: Array<{
        revision?: number
        id?: number
        index?: number
      }>
      type?: 'DATASET' | 'HUMAN_LABELED' | 'AUTO_LABELED'
    }>
  }>
  shardInfo?: {
    shardIndex?: string
    shardCount?: string
    textOffset?: string
  }
  error?: {
    code?: number
    message?: string
    details?: Array<{
      '@type'?: string
      [key: string]: unknown
    }>
  }
  revisions?: Array<{
    agent?: string
    processor?: string
    id?: string
    parent?: Array<number>
    parentIds?: string[]
    createTime?: string
    humanReview?: {
      state?: string
      stateMessage?: string
    }
  }>
  documentLayout?: {
    blocks?: Array<{
      textBlock?: {
        text?: string
        type?: string
        blocks?: Array<unknown> // Recursive structure
      }
      tableBlock?: {
        headerRows?: Array<{
          cells?: Array<{
            text?: string
            rowSpan?: number
            colSpan?: number
            blocks?: Array<unknown> // Recursive structure
          }>
        }>
        bodyRows?: Array<{
          cells?: Array<{
            text?: string
            rowSpan?: number
            colSpan?: number
            blocks?: Array<unknown> // Recursive structure
          }>
        }>
      }
      listBlock?: {
        listEntries?: Array<{
          blocks?: Array<unknown> // Recursive structure
        }>
        type?: string
      }
    }>
  }
}

export interface DocumentAIProcessResponse {
  document?: DocumentAIDocument
  humanReviewOperation?: string
  humanReviewStatus?: {
    state?: 'STATE_UNSPECIFIED' | 'SKIPPED' | 'VALIDATION_PASSED' | 'VALIDATION_FAILED' | 'ERROR'
    stateMessage?: string
    humanReviewOperation?: string
  }
}

export interface DocumentAIBatchProcessResponse {
  state?: 'STATE_UNSPECIFIED' | 'WAITING' | 'RUNNING' | 'SUCCEEDED' | 'CANCELLING' | 'CANCELLED' | 'FAILED'
  stateMessage?: string
  createTime?: string
  updateTime?: string
  metadata?: {
    state?: 'STATE_UNSPECIFIED' | 'WAITING' | 'RUNNING' | 'SUCCEEDED' | 'CANCELLING' | 'CANCELLED' | 'FAILED'
    stateMessage?: string
    createTime?: string
    updateTime?: string
    individualProcessStatuses?: Array<{
      inputGcsSource?: string
      status?: {
        code?: number
        message?: string
        details?: Array<{
          '@type'?: string
          [key: string]: unknown
        }>
      }
      outputGcsDestination?: string
      humanReviewOperation?: string
      humanReviewStatus?: {
        state?: 'STATE_UNSPECIFIED' | 'SKIPPED' | 'VALIDATION_PASSED' | 'VALIDATION_FAILED' | 'ERROR'
        stateMessage?: string
        humanReviewOperation?: string
      }
    }>
  }
  response?: {
    '@type'?: string
    [key: string]: unknown
  }
  error?: {
    code?: number
    message?: string
    details?: Array<{
      '@type'?: string
      [key: string]: unknown
    }>
  }
  name?: string
  done?: boolean
}

// =============================================================================
// VERTEX AI EMBEDDINGS TYPES
// =============================================================================

export interface VertexAIEmbeddingRequest {
  instances: Array<{
    content: string
    task_type?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION' | 'CLUSTERING'
    title?: string
  }>
  parameters?: {
    autoTruncate?: boolean
    outputDimensionality?: number
  }
}

export interface VertexAIEmbeddingResponse {
  predictions: Array<{
    embeddings: {
      statistics?: {
        truncated?: boolean
        token_count?: number
      }
      values: number[]
    }
  }>
  deployedModelId?: string
  model?: string
  modelDisplayName?: string
  modelVersionId?: string
}

export interface VertexAIBatchPredictionJob {
  name?: string
  displayName?: string
  model?: string
  modelVersionId?: string
  inputConfig?: {
    instancesFormat?: 'JSONL' | 'CSV' | 'BIGQUERY' | 'TF_RECORD' | 'TF_RECORD_GZIP' | 'FILE_LIST'
    gcsSource?: {
      uris?: string[]
    }
    bigquerySource?: {
      inputUri?: string
    }
  }
  outputConfig?: {
    predictionsFormat?: 'JSONL' | 'CSV' | 'BIGQUERY'
    gcsDestination?: {
      outputUriPrefix?: string
    }
    bigqueryDestination?: {
      outputUri?: string
    }
  }
  dedicatedResources?: {
    machineSpec?: {
      machineType?: string
      acceleratorType?: 'ACCELERATOR_TYPE_UNSPECIFIED' | 'NVIDIA_TESLA_K80' | 'NVIDIA_TESLA_P4' | 'NVIDIA_TESLA_P100' | 'NVIDIA_TESLA_V100' | 'NVIDIA_TESLA_T4' | 'NVIDIA_TESLA_A100' | 'TPU_V2' | 'TPU_V3'
      acceleratorCount?: number
    }
    startingReplicaCount?: number
    maxReplicaCount?: number
  }
  serviceAccount?: string
  manualBatchTuningParameters?: {
    batchSize?: number
  }
  generateExplanation?: boolean
  explanationSpec?: {
    parameters?: {
      sampledShapleyAttribution?: {
        pathCount?: number
      }
      integratedGradientsAttribution?: {
        stepCount?: number
        smoothGradConfig?: {
          noiseSigma?: number
          noisySampleCount?: number
        }
        blurBaselineConfig?: {
          maxBlurSigma?: number
        }
      }
      xraiAttribution?: {
        stepCount?: number
        smoothGradConfig?: {
          noiseSigma?: number
          noisySampleCount?: number
        }
        blurBaselineConfig?: {
          maxBlurSigma?: number
        }
      }
      examples?: {
        exampleGcsSource?: {
          dataFormat?: 'DATA_FORMAT_UNSPECIFIED' | 'JSONL'
          gcsSource?: {
            uris?: string[]
          }
        }
        nearestNeighborSearchConfig?: Record<string, unknown>
        presets?: {
          query?: 'PRECISE' | 'FAST'
          modality?: 'MODALITY_UNSPECIFIED' | 'IMAGE' | 'TEXT' | 'TABULAR'
        }
      }
      topK?: number
      outputIndices?: number[]
    }
    metadata?: {
      inputs?: Record<string, unknown>
      outputs?: Record<string, unknown>
      featureAttributionsSchemaUri?: string
    }
  }
  outputInfo?: {
    gcsOutputDirectory?: string
    bigqueryOutputDataset?: string
    bigqueryOutputTable?: string
  }
  state?: 'JOB_STATE_UNSPECIFIED' | 'JOB_STATE_QUEUED' | 'JOB_STATE_PENDING' | 'JOB_STATE_RUNNING' | 'JOB_STATE_SUCCEEDED' | 'JOB_STATE_FAILED' | 'JOB_STATE_CANCELLING' | 'JOB_STATE_CANCELLED' | 'JOB_STATE_PAUSED' | 'JOB_STATE_EXPIRED' | 'JOB_STATE_UPDATING' | 'JOB_STATE_PARTIALLY_SUCCEEDED'
  error?: {
    code?: number
    message?: string
    details?: Array<{
      '@type'?: string
      [key: string]: unknown
    }>
  }
  partialFailures?: Array<{
    code?: number
    message?: string
    details?: Array<{
      '@type'?: string
      [key: string]: unknown
    }>
  }>
  resourcesConsumed?: {
    replicaHours?: number
  }
  completionStats?: {
    successfulCount?: string
    failedCount?: string
    incompleteCount?: string
    successfulForecastPointCount?: string
  }
  createTime?: string
  startTime?: string
  endTime?: string
  updateTime?: string
  labels?: Record<string, string>
  encryptionSpec?: {
    kmsKeyName?: string
  }
  modelMonitoringConfig?: {
    alertConfig?: {
      emailAlertConfig?: {
        userEmails?: string[]
      }
      notificationChannels?: string[]
      enableLogging?: boolean
    }
    objectiveConfigs?: Array<{
      trainingDataset?: {
        dataFormat?: 'DATA_FORMAT_UNSPECIFIED' | 'CSV' | 'TF_RECORD'
        gcsSource?: {
          uris?: string[]
        }
        bigquerySource?: {
          inputUri?: string
        }
        targetField?: string
      }
      trainingPredictionSkewDetectionConfig?: {
        skewThresholds?: Record<string, {
          value?: number
        }>
        attributionScoreSkewThresholds?: Record<string, {
          dataType?: 'DATA_TYPE_UNSPECIFIED' | 'FLOAT' | 'DOUBLE' | 'INT64' | 'INT32' | 'UINT64' | 'UINT32' | 'BOOL' | 'STRING' | 'BYTES'
          threshold?: {
            value?: number
          }
        }>
        defaultSkewThreshold?: {
          value?: number
        }
      }
      predictionDriftDetectionConfig?: {
        driftThresholds?: Record<string, {
          value?: number
        }>
        attributionScoreDriftThresholds?: Record<string, {
          dataType?: 'DATA_TYPE_UNSPECIFIED' | 'FLOAT' | 'DOUBLE' | 'INT64' | 'INT32' | 'UINT64' | 'UINT32' | 'BOOL' | 'STRING' | 'BYTES'
          threshold?: {
            value?: number
          }
        }>
        defaultDriftThreshold?: {
          value?: number
        }
      }
      explanationConfig?: {
        enableFeatureAttributes?: boolean
        explanationBaseline?: {
          gcs?: {
            outputUriPrefix?: string
          }
          bigquery?: {
            outputUri?: string
          }
          predictionFormat?: 'PREDICTION_FORMAT_UNSPECIFIED' | 'JSONL' | 'CSV'
        }
      }
    }>
  }
  disableContainerLogging?: boolean
}

// =============================================================================
// SUPABASE TYPES
// =============================================================================

export interface SupabaseError {
  message: string
  details?: string
  hint?: string
  code?: string
}

export interface SupabaseResponse<T> {
  data: T | null
  error: SupabaseError | null
  count?: number | null
  status: number
  statusText: string
}

export interface SupabaseQueryBuilder<T> {
  select(columns?: string): SupabaseQueryBuilder<T>
  insert(values: Partial<T> | Partial<T>[]): SupabaseQueryBuilder<T>
  update(values: Partial<T>): SupabaseQueryBuilder<T>
  delete(): SupabaseQueryBuilder<T>
  eq(column: keyof T, value: unknown): SupabaseQueryBuilder<T>
  neq(column: keyof T, value: unknown): SupabaseQueryBuilder<T>
  gt(column: keyof T, value: unknown): SupabaseQueryBuilder<T>
  gte(column: keyof T, value: unknown): SupabaseQueryBuilder<T>
  lt(column: keyof T, value: unknown): SupabaseQueryBuilder<T>
  lte(column: keyof T, value: unknown): SupabaseQueryBuilder<T>
  like(column: keyof T, pattern: string): SupabaseQueryBuilder<T>
  ilike(column: keyof T, pattern: string): SupabaseQueryBuilder<T>
  is(column: keyof T, value: unknown): SupabaseQueryBuilder<T>
  in(column: keyof T, values: unknown[]): SupabaseQueryBuilder<T>
  contains(column: keyof T, value: unknown): SupabaseQueryBuilder<T>
  containedBy(column: keyof T, value: unknown): SupabaseQueryBuilder<T>
  rangeGt(column: keyof T, range: string): SupabaseQueryBuilder<T>
  rangeGte(column: keyof T, range: string): SupabaseQueryBuilder<T>
  rangeLt(column: keyof T, range: string): SupabaseQueryBuilder<T>
  rangeLte(column: keyof T, range: string): SupabaseQueryBuilder<T>
  rangeAdjacent(column: keyof T, range: string): SupabaseQueryBuilder<T>
  overlaps(column: keyof T, value: unknown): SupabaseQueryBuilder<T>
  textSearch(column: keyof T, query: string, options?: { type?: 'plain' | 'phrase' | 'websearch'; config?: string }): SupabaseQueryBuilder<T>
  match(query: Partial<T>): SupabaseQueryBuilder<T>
  not(column: keyof T, operator: string, value: unknown): SupabaseQueryBuilder<T>
  or(filters: string): SupabaseQueryBuilder<T>
  filter(column: keyof T, operator: string, value: unknown): SupabaseQueryBuilder<T>
  order(column: keyof T, options?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string }): SupabaseQueryBuilder<T>
  limit(count: number, options?: { foreignTable?: string }): SupabaseQueryBuilder<T>
  range(from: number, to: number, options?: { foreignTable?: string }): SupabaseQueryBuilder<T>
  abortSignal(signal: AbortSignal): SupabaseQueryBuilder<T>
  single(): Promise<SupabaseResponse<T>>
  maybeSingle(): Promise<SupabaseResponse<T | null>>
  csv(): Promise<SupabaseResponse<string>>
  geojson(): Promise<SupabaseResponse<Record<string, unknown>>>
  explain(options?: { analyze?: boolean; verbose?: boolean; settings?: boolean; buffers?: boolean; wal?: boolean; format?: 'text' | 'json' | 'yaml' | 'xml' }): Promise<SupabaseResponse<Record<string, unknown>>>
  rollback(): Promise<SupabaseResponse<null>>
  returns<NewResult = T>(): SupabaseQueryBuilder<NewResult>
}

// =============================================================================
// BUSINESS DOMAIN TYPES
// =============================================================================

export interface BusinessMetadata {
  law_firm?: string
  fund_manager?: string
  fund_admin?: string
  jurisdiction?: string
  document_type?: string
  // Backward compatibility: these exist at root level in database
  embeddings_skipped?: boolean
  embeddings_error?: string
  security_scan?: {
    risk_level?: 'low' | 'medium' | 'high' | 'critical'
    scan_timestamp?: string
    threat_indicators?: string[]
    malware_detected?: boolean
    suspicious_content?: boolean
  }
  processing_info?: {
    processing_method?: 'sync' | 'batch'
    processing_duration_ms?: number
    page_count?: number
    file_size_bytes?: number
    estimated_characters?: number
  }
  embeddings_info?: {
    embeddings_skipped?: boolean
    embeddings_error?: string
    embeddings_retry_success?: boolean
    embeddings_retry_timestamp?: string
    chunks_count?: number
    embedding_model?: string
    embedding_dimensions?: number
  }
}

export interface ExtractedField {
  name: string
  value: string
  type: 'text' | 'number' | 'date' | 'currency' | 'address' | 'phone' | 'email' | 'url' | 'boolean'
  confidence: number
  pageNumber?: number
  boundingBox?: DocumentAIBoundingBox
}

export interface SimplifiedEntity {
  type: string
  value: string
  confidence?: number
  pageNumber?: number | null
}

export interface SimplifiedTable {
  pageNumber?: number | null
  headerRows?: string[][]
  bodyRows: string[][]
}

export interface ProcessingResult {
  extractedText: string
  extractedFields: {
    fields: ExtractedField[]
    entities: SimplifiedEntity[]
    tables: SimplifiedTable[]
  }
  pageCount: number
  processingMethod: 'sync' | 'batch'
  switchedToBatch?: boolean
}

// =============================================================================
// DATABASE SCHEMA TYPES
// =============================================================================

export interface DatabaseDocument {
  id: string
  title: string
  filename: string
  file_path: string
  file_size: number
  content_type: string
  user_id: string
  // Status values match database schema (MASTER-DATABASE-SETUP.sql:66)
  // CHECK constraint: ('uploading', 'queued', 'processing', 'completed', 'error', 'cancelled')
  status: 'uploading' | 'queued' | 'processing' | 'completed' | 'error' | 'cancelled'
  extracted_fields?: Record<string, unknown>
  page_count?: number
  processing_error?: string
  metadata?: BusinessMetadata
  created_at: string
  updated_at: string
}

export interface DatabaseDocumentWithContent extends DatabaseDocument {
  document_content?: { extracted_text: string }[];
  extracted_text?: string;
}

export interface DatabaseDocumentJob {
  id: string
  document_id: string
  user_id: string
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  priority: number
  attempts: number
  max_attempts: number
  processing_method?: 'sync' | 'batch'
  batch_operation_id?: string
  error_message?: string
  metadata?: Record<string, unknown>
  created_at: string
  started_at?: string
  completed_at?: string
  updated_at: string
}

export interface DatabaseDocumentEmbedding {
  id: string
  document_id: string
  vector_id: string
  embedding: number[]
  chunk_text: string
  chunk_index: number
  page_number?: number
  created_at: string
  updated_at: string
}

// DatabaseExtractedField interface removed - extracted_fields table no longer exists
// OCR processor doesn't extract form fields (only Form Parser does, but app always uses OCR)
// Note: ExtractedField interface (line 980) is kept for Document AI API types

export interface DatabaseProcessingStatus {
  id: string
  document_id: string
  status: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled'
  progress_percentage: number
  current_step: string
  estimated_completion?: string
  error_details?: Record<string, unknown>
  created_at: string
  updated_at: string
}
