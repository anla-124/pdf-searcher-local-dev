import { deleteDocumentFromQdrant } from '@/lib/qdrant'
import { logger } from '@/lib/logger'

type CleanupTask = {
  documentId: string
  attempt: number
  enqueuedAt: number
  lastError?: string
  vectorIds?: string[]
}

type CleanupFailure = {
  documentId: string
  attempts: number
  error: string
  failedAt: number
}

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BACKOFF_MS = 2000
const MAX_BACKOFF_MS = 60000
const FAILURE_HISTORY_LIMIT = 10

const parseEnvInt = (key: string, fallback: number) => {
  const value = process.env[key]
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

const maxRetries = parseEnvInt('QDRANT_DELETE_MAX_RETRIES', DEFAULT_MAX_RETRIES)
const baseBackoffMs = parseEnvInt('QDRANT_DELETE_BACKOFF_MS', DEFAULT_BACKOFF_MS)

const queue: CleanupTask[] = []
const pendingTasks = new Map<string, CleanupTask>()
const failureHistory: CleanupFailure[] = []

let processing = false
let activeTask: CleanupTask | null = null

const scheduleProcessing = () => {
  if (!processing) {
    void processQueue()
  }
}

const processQueue = async () => {
  processing = true
  try {
    while (queue.length > 0) {
      const task = queue.shift()
      if (!task) {
        continue
      }

      activeTask = task
      await handleTask(task)
      activeTask = null
    }
  } finally {
    processing = false
    activeTask = null
    if (queue.length > 0) {
      scheduleProcessing()
    }
  }
}

const handleTask = async (task: CleanupTask) => {
  try {
    const hasPrefetchedIds = Array.isArray(task.vectorIds) && task.vectorIds.length > 0
    if (hasPrefetchedIds) {
      await deleteDocumentFromQdrant(task.documentId, task.vectorIds)
    } else {
      await deleteDocumentFromQdrant(task.documentId)
    }
    pendingTasks.delete(task.documentId)
    logger.info('Qdrant cleanup completed', {
      documentId: task.documentId,
      attempts: task.attempt + 1,
      vectorIdsProvided: hasPrefetchedIds ? task.vectorIds?.length : 0,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    task.attempt += 1
    task.lastError = message

    if (task.attempt > maxRetries) {
      pendingTasks.delete(task.documentId)
      failureHistory.push({
        documentId: task.documentId,
        attempts: task.attempt,
        error: message,
        failedAt: Date.now(),
      })

      while (failureHistory.length > FAILURE_HISTORY_LIMIT) {
        failureHistory.shift()
      }
      logger.error(
        'Qdrant cleanup failed after maximum retries',
        undefined,
        {
          documentId: task.documentId,
          attempts: task.attempt,
          errorMessage: message,
        },
      )
      return
    }

    const delayMs = Math.min(
      baseBackoffMs * Math.pow(2, task.attempt - 1),
      MAX_BACKOFF_MS,
    )

    logger.warn('Qdrant cleanup scheduled for retry', {
      documentId: task.documentId,
      attempts: task.attempt,
      retryInMs: delayMs,
      error: message,
    })

    setTimeout(() => {
      queue.push(task)
      scheduleProcessing()
    }, delayMs)
  }
}

export const queueQdrantDeletion = (documentId: string, vectorIds?: string[]) => {
  if (!documentId) {
    return
  }

  const existingTask = pendingTasks.get(documentId)
  if (existingTask) {
    // Update timestamp to reflect the latest request
    existingTask.enqueuedAt = Date.now()
    if (Array.isArray(vectorIds) && vectorIds.length > 0) {
      existingTask.vectorIds = vectorIds
    }
    return
  }

  const task: CleanupTask = {
    documentId,
    attempt: 0,
    enqueuedAt: Date.now(),
    vectorIds: Array.isArray(vectorIds) && vectorIds.length > 0 ? [...vectorIds] : undefined,
  }

  pendingTasks.set(documentId, task)
  queue.push(task)
  scheduleProcessing()
}

export const getQdrantCleanupMetrics = () => {
  return {
    queueDepth: queue.length,
    pendingDocuments: pendingTasks.size,
    isProcessing: processing,
    activeTask: activeTask
      ? {
          documentId: activeTask.documentId,
          attempt: activeTask.attempt,
          enqueuedAt: activeTask.enqueuedAt,
          lastError: activeTask.lastError,
        }
      : null,
    retryConfig: {
      maxRetries,
      baseBackoffMs,
      maxBackoffMs: MAX_BACKOFF_MS,
    },
    recentFailures: failureHistory.slice(-FAILURE_HISTORY_LIMIT),
  }
}
