'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { DatabaseDocument as BaseDocument } from '@/types/external-apis'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select'
import { SearchModeModal } from '@/components/similarity/search-mode-modal'
import { EditDocumentMetadataModal } from './edit-document-metadata-modal'
import { KeywordResults } from '@/components/search/keyword-results'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { KeywordSearchResponse } from '@/types/search'
import {
  Target,
  Search,
  Filter,
  Download,
  AlertCircle,
  CheckCircle,
  Clock,
  MoreVertical,
  Trash2,
  X,
  Edit,
  Edit2,
  Scale,
  UserCircle,
  ClipboardList,
  Globe,
  ArrowUp,
  ArrowDown,
  FilterX,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  RotateCcw,
  ArrowUpDown
} from 'lucide-react'
import { useMetadataOptions } from '@/hooks/use-metadata-options'
import { format } from 'date-fns'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { clientLogger } from '@/lib/client-logger'
import { viewDocument, downloadDocument } from '@/lib/document-actions'
import { useResizableColumns } from '@/hooks/useResizableColumns'

type Document = BaseDocument & {
  updated_by_name?: string | null
  updated_by_email?: string | null
}

interface DocumentListProps {
  refreshTrigger?: number
}

interface RenameDocumentDialogState {
  document: Document | null
  isOpen: boolean
  newTitle: string
  isRenaming: boolean
}

interface DocumentStatus {
  status: Document['status']
  phase: string
  message: string
  progress?: number
  estimatedTimeRemaining?: string
  error?: string | null
  lastUpdated?: string
  isStale?: boolean
}

type MetadataOption = {
  value: string
  label: string
}

interface SearchModeState {
  document: Document | null
  isOpen: boolean
}

export function EnhancedDocumentList({ refreshTrigger = 0 }: DocumentListProps) {
  const supabase = useMemo(() => createSupabaseClient(), [])
  const [documents, setDocuments] = useState<Document[]>([])
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'name' | 'content'>('name')
  const [keywordResults, setKeywordResults] = useState<KeywordSearchResponse | null>(null)
  const [isKeywordSearching, setIsKeywordSearching] = useState(false)
  const [isLoadingMoreKeywordDocs, setIsLoadingMoreKeywordDocs] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('updated_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('')

  // Fetch metadata options from API
  const { options: lawFirmOptions } = useMetadataOptions('law_firm')
  const { options: fundManagerOptions } = useMetadataOptions('fund_manager')
  const { options: fundAdminOptions } = useMetadataOptions('fund_admin')
  const { options: jurisdictionOptions } = useMetadataOptions('jurisdiction')

  // Metadata filters
  const [showFilters, setShowFilters] = useState(false)
  const [lawFirmFilter, setLawFirmFilter] = useState<string[]>([])
  const [fundManagerFilter, setFundManagerFilter] = useState<string[]>([])
  const [fundAdminFilter, setFundAdminFilter] = useState<string[]>([])
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
  const [editingDocument, setEditingDocument] = useState<Document | null>(null)
  const [renameDialog, setRenameDialog] = useState<RenameDocumentDialogState>({
    document: null,
    isOpen: false,
    newTitle: '',
    isRenaming: false
  })

  const [deleteDialog, setDeleteDialog] = useState<{
    document: Document | null
    isOpen: boolean
    isDeleting: boolean
  }>({
    document: null,
    isOpen: false,
    isDeleting: false
  })
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [bulkDeleteState, setBulkDeleteState] = useState({
    total: 0,
    processed: 0,
    isDeleting: false,
  })

  const [realtimeUserId, setRealtimeUserId] = useState<string | null>(null)

  const [sourceForSelectionId, setSourceForSelectionId] = useState<string | null>(null)
  const [retryingDocuments, setRetryingDocuments] = useState<Set<string>>(new Set())
  const [cancellingDocuments, setCancellingDocuments] = useState<Set<string>>(new Set())
  const [cancelDialogOpen, setCancelDialogOpen] = useState<string | null>(null)

  // Search mode and source document state
  const [searchModeModal, setSearchModeModal] = useState<SearchModeState>({
    document: null,
    isOpen: false
  })

  // Track when we last kicked the cron endpoint so we don't spam requests
  const [lastProcessingTrigger, setLastProcessingTrigger] = useState<number>(0)

  // Enhanced processing status tracking
  const [documentStatuses, setDocumentStatuses] = useState<Map<string, DocumentStatus>>(new Map())

  // Refs for polling optimization (prevent infinite restarts)
  const documentsRef = useRef<Document[]>([])
  const isPageVisibleRef = useRef(true)
  const pollingStartTimesRef = useRef<Map<string, number>>(new Map())
  const keywordPageOffsetRef = useRef(0)

  // Resizable columns
  const { columnWidths, handleMouseDown } = useResizableColumns({
    checkbox: 48,
    name: 500,
    metadata: 180,
    pages: 80,
    lastModified: 180,
    actions: 150
  })

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const documentsPerPage = 10

  // Track previous filter state to detect user-initiated changes vs background updates
  const prevFiltersRef = useRef({
    searchQuery,
    statusFilter,
    lawFirmFilter,
    fundManagerFilter,
    fundAdminFilter,
    jurisdictionFilter,
    sortBy,
    sortOrder
  })

  // Router for navigation
  const router = useRouter()

  // Check if selection mode is active
  const isSelectMode = selectedDocuments.size > 0 || sourceForSelectionId !== null

  // Simple document fetching - no complex caching or polling
  const fetchDocuments = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true)
      setError('')

      const response = await fetch('/api/documents', { cache: 'no-store' })

      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.status}`)
      }

      const data = await response.json()
      setDocuments(data.documents || [])

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load documents'
      setError(errorMessage)
      clientLogger.error('Document fetch error:', err)
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }, [])

  const handleDocumentUpdate = (updatedDocument: Document) => {
    setDocuments(prev => prev.map(doc =>
      doc.id === updatedDocument.id ? updatedDocument : doc
    ))
    setEditingDocument(null)
  }

  /**
   * Perform keyword search on document content
   * @param query Search query string
   * @param append If true, appends results to existing; if false, replaces results
   */
  const performKeywordSearch = useCallback(async (query: string, append = false) => {
    if (!query.trim()) {
      setKeywordResults(null)
      keywordPageOffsetRef.current = 0
      return
    }

    try {
      if (append) {
        setIsLoadingMoreKeywordDocs(true)
      } else {
        setIsKeywordSearching(true)
        keywordPageOffsetRef.current = 0
      }
      setError('')

      const offset = append ? keywordPageOffsetRef.current : 0

      const response = await fetch('/api/documents/keyword-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          maxPagesPerDoc: 3,
          pageSize: 20,
          pageOffset: offset
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Search failed: ${response.status}`)
      }

      const data: KeywordSearchResponse = await response.json()

      if (append) {
        // Append new results to existing (use functional update to avoid dependency)
        setKeywordResults(prev => prev ? {
          ...data,
          results: [...prev.results, ...data.results]
        } : data)
      } else {
        // Replace with new results
        setKeywordResults(data)
      }

      // Update page offset for next load
      const newOffset = offset + data.results.length
      keywordPageOffsetRef.current = newOffset

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search documents'
      setError(errorMessage)
      clientLogger.error('Keyword search error:', err)
      if (!append) {
        setKeywordResults(null)
      }
    } finally {
      setIsKeywordSearching(false)
      setIsLoadingMoreKeywordDocs(false)
    }
  }, [])

  /**
   * Load more keyword search documents (pagination)
   */
  const loadMoreKeywordDocuments = useCallback(() => {
    if (searchQuery && !isLoadingMoreKeywordDocs && !isKeywordSearching) {
      performKeywordSearch(searchQuery, true)
    }
  }, [searchQuery, isLoadingMoreKeywordDocs, isKeywordSearching, performKeywordSearch])

  /**
   * Handle search mode changes
   */
  const handleSearchModeChange = (mode: 'name' | 'content') => {
    setSearchMode(mode)
    setKeywordResults(null)
    keywordPageOffsetRef.current = 0
    setError('')

    // If switching to content mode and there's a query, perform search
    if (mode === 'content' && searchQuery.trim()) {
      performKeywordSearch(searchQuery)
    }
  }

  /**
   * Handle search query changes
   */
  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query)
  }

  /**
   * Debounced keyword search effect
   */
  useEffect(() => {
    if (searchMode !== 'content') return undefined

    if (searchQuery.trim()) {
      const timeoutId = setTimeout(() => {
        performKeywordSearch(searchQuery)
      }, 500) // 500ms debounce

      return () => clearTimeout(timeoutId)
    } else {
      // Clear results when query is empty
      setKeywordResults(null)
      return undefined
    }
  }, [searchQuery, searchMode, performKeywordSearch])

  // Sync documents to ref for polling (prevents infinite effect restarts)
  useEffect(() => {
    documentsRef.current = documents
  }, [documents])

  // Track page visibility to pause polling when tab is inactive
  useEffect(() => {
    if (typeof document === 'undefined') return

    // Initialize visibility state
    isPageVisibleRef.current = !document.hidden

    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Resolve user ID for realtime subscriptions
  useEffect(() => {
    let isMounted = true
    supabase.auth.getUser()
      .then(({ data, error }) => {
        if (!isMounted) return
        if (error) {
          clientLogger.error('Failed to fetch Supabase user for realtime subscription:', error)
          return
        }
        if (data?.user?.id) {
          setRealtimeUserId(data.user.id)
        }
      })
      .catch((err) => {
        clientLogger.error('Unexpected Supabase auth error:', err)
      })

    return () => {
      isMounted = false
    }
  }, [supabase])

  // Fallback: infer user ID from documents if not already set
  useEffect(() => {
    if (!realtimeUserId && documents.length > 0) {
      const firstDocument = documents[0]
      if (firstDocument) {
        setRealtimeUserId(firstDocument.user_id)
      }
    }
  }, [documents, realtimeUserId])

  // Subscribe to realtime document updates to reflect status changes immediately
  useEffect(() => {
    if (!realtimeUserId) {
      return
    }

    const channel = supabase
      .channel(`documents-status-${realtimeUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents', filter: `user_id=eq.${realtimeUserId}` },
        (payload) => {
          const newDoc = payload.new as Document | null
          const oldDoc = payload.old as Document | null

          setDocuments(prev => {
            if (payload.eventType === 'DELETE' && oldDoc?.id) {
              return prev.filter(doc => doc.id !== oldDoc.id)
            }

            if (!newDoc) {
              return prev
            }

            if (payload.eventType === 'INSERT') {
              const exists = prev.some(doc => doc.id === newDoc.id)
              if (exists) {
                return prev.map(doc => doc.id === newDoc.id ? { ...doc, ...newDoc } : doc)
              }
              return [...prev, newDoc]
            }

            if (payload.eventType === 'UPDATE') {
              let found = false
              const updated = prev.map(doc => {
                if (doc.id === newDoc.id) {
                  found = true
                  return { ...doc, ...newDoc }
                }
                return doc
              })
              if (!found) {
                return [...prev, newDoc]
              }
              return updated
            }

            return prev
          })

          if (payload.eventType === 'DELETE' && oldDoc?.id) {
            setDocumentStatuses(prev => {
              const next = new Map(prev)
              next.delete(oldDoc.id)
              return next
            })
          }

          if (payload.eventType === 'UPDATE' && newDoc?.id) {
            const terminalStatuses: Document['status'][] = ['completed', 'error', 'cancelled']
            if (terminalStatuses.includes(newDoc.status)) {
              setDocumentStatuses(prev => {
                const next = new Map(prev)
                next.delete(newDoc.id)
                return next
              })
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, realtimeUserId])

  // Search mode handlers
  const handleSetSearchModeDocument = useCallback((document: Document) => {
    setSearchModeModal({
      document,
      isOpen: true
    })
  }, [])

  const handleSelectedSearchClick = useCallback(() => {
    if (searchModeModal.document) {
      const sourceDocId = searchModeModal.document.id
      setSourceForSelectionId(sourceDocId)
      setSelectedDocuments(prev => new Set(prev).add(sourceDocId))
    }
  }, [searchModeModal.document])

  const closeSearchModeModal = useCallback(() => {
    setSearchModeModal({
      document: null,
      isOpen: false
    })
  }, [])

  const openRenameDialog = (document: Document) => {
    setRenameDialog({
      document,
      isOpen: true,
      newTitle: document.title,
      isRenaming: false
    })
  }

  const closeRenameDialog = () => {
    setRenameDialog({
      document: null,
      isOpen: false,
      newTitle: '',
      isRenaming: false
    })
  }

  const handleRenameDocument = async () => {
    if (!renameDialog.document || !renameDialog.newTitle.trim()) return

    setRenameDialog(prev => ({ ...prev, isRenaming: true }))

    try {
      const response = await fetch(`/api/documents/${renameDialog.document.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: renameDialog.newTitle.trim()
        })
      })

      if (!response.ok) {
        throw new Error('Failed to rename document')
      }

      const updatedDocument = await response.json()

      // Update local state
      setDocuments(prev => prev.map(doc =>
        doc.id === updatedDocument.id ? updatedDocument : doc
      ))

      closeRenameDialog()
    } catch (error) {
      clientLogger.error('Error renaming document:', error)
      alert('Failed to rename document. Please try again.')
    } finally {
      setRenameDialog(prev => ({ ...prev, isRenaming: false }))
    }
  }


  // Cancel processing handler
  const handleCancelProcessing = useCallback(async (documentId: string) => {
    setCancellingDocuments(prev => {
      const next = new Set(prev)
      next.add(documentId)
      return next
    })

    try {
      setDocuments(prev => prev.map(doc =>
        doc.id === documentId ? {
          ...doc,
          status: 'cancelled' as Document['status'],
          processing_error: 'Cancelling...'
        } : doc
      ))

      const response = await fetch(`/api/documents/${documentId}/cancel`, {
        method: 'POST'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to cancel processing')
      }

      const result = await response.json()

      if (result.cleanedUp && result.status === 'deleted') {
        setDocuments(prev => prev.filter(doc => doc.id !== documentId))
        clientLogger.info('Document cancelled and completely removed:', result)
      } else {
        setDocuments(prev => prev.map(doc =>
          doc.id === documentId ? {
            ...doc,
            status: 'cancelled' as Document['status'],
            processing_error: result.message || 'Processing cancelled by user'
          } : doc
        ))
        clientLogger.warn('Document cancelled but cleanup incomplete:', result)
      }

      setDocumentStatuses(prev => {
        const next = new Map(prev)
        next.delete(documentId)
        return next
      })

    } catch (error) {
      clientLogger.error('Error cancelling processing:', error)
      await fetchDocuments()
      alert(error instanceof Error ? error.message : 'Failed to cancel processing. Please try again.')
    } finally {
      setCancellingDocuments(prev => {
        const next = new Set(prev)
        next.delete(documentId)
        return next
      })
      setCancelDialogOpen(prev => prev === documentId ? null : prev)
    }
  }, [fetchDocuments])

  const handleRetryProcessing = useCallback(async (document: Document) => {
    setRetryingDocuments(prev => {
      const next = new Set(prev)
      next.add(document.id)
      return next
    })

    try {
      const response = await fetch(`/api/documents/${document.id}/retry`, {
        method: 'POST'
      })

      if (!response.ok) {
        const { error: message } = await response.json().catch(() => ({ error: 'Failed to retry document' }))
        throw new Error(message || 'Failed to retry document')
      }

      const { document: updatedDocument } = await response.json() as { document: Document }

      setDocuments(prev => prev.map(doc =>
        doc.id === updatedDocument.id ? updatedDocument : doc
      ))

      setDocumentStatuses(prev => {
        const next = new Map(prev)
        next.delete(document.id)
        return next
      })

    } catch (error) {
      clientLogger.error('Error retrying document processing:', error)
      const message = error instanceof Error ? error.message : 'Failed to retry processing. Please try again.'
      alert(message)
    } finally {
      setRetryingDocuments(prev => {
        const next = new Set(prev)
        next.delete(document.id)
        return next
      })
    }
  }, [])

  // Enhanced status polling for processing documents
  useEffect(() => {
    const trackedStatuses: Document['status'][] = ['uploading', 'queued', 'processing', 'error']
    const TEN_MINUTES = 10 * 60 * 1000

    const pollStatuses = async () => {
      // Skip polling if page is not visible (tab switched away)
      if (!isPageVisibleRef.current) {
        return
      }

      const processingDocs = documentsRef.current.filter(doc => trackedStatuses.includes(doc.status))

      if (processingDocs.length === 0) {
        setDocumentStatuses(new Map())
        pollingStartTimesRef.current.clear()
        return
      }

      const now = Date.now()

      try {
        const statusPromises = processingDocs.map(async (doc) => {
          // Track when we started polling this document
          if (!pollingStartTimesRef.current.has(doc.id)) {
            pollingStartTimesRef.current.set(doc.id, now)
          }

          // Check if document has been polling for too long (stuck)
          const startTime = pollingStartTimesRef.current.get(doc.id)!
          if (now - startTime > TEN_MINUTES) {
            clientLogger.warn(`Document ${doc.id} has been polling for over 10 minutes, marking as stale`)
            pollingStartTimesRef.current.delete(doc.id)
            return {
              docId: doc.id,
              status: {
                documentId: doc.id,
                status: doc.status,
                phase: 'Processing timeout',
                progress: 0,
                message: 'Document has been processing for over 10 minutes. Please try retrying.',
                error: null,
                lastUpdated: new Date().toISOString(),
                isStale: true
              },
              isStale: true
            }
          }
          const response = await fetch(`/api/documents/${doc.id}/processing-status`, {
            cache: 'no-store'
          })
          if (response.ok) {
            const statusData = await response.json()
            return { docId: doc.id, status: statusData }
          }
          return null
        })

        const results = await Promise.all(statusPromises)

        setDocumentStatuses(prevStatuses => {
          const newStatuses = new Map(prevStatuses)

          results.forEach(result => {
            if (!result) return

            // Handle stale documents (polling timeout)
            if ('isStale' in result && result.isStale) {
              newStatuses.set(result.docId, { ...result.status, isStale: true })
              return
            }

            if (result.status.status === 'error') {
              newStatuses.delete(result.docId)
              pollingStartTimesRef.current.delete(result.docId)
            } else if (result.status.status === 'completed' || result.status.status === 'cancelled') {
              // Clean up polling start time for terminal states
              pollingStartTimesRef.current.delete(result.docId)
              newStatuses.set(result.docId, result.status)
            } else {
              newStatuses.set(result.docId, result.status)
            }
          })

          const processingIds = new Set(processingDocs.map(doc => doc.id))
          for (const [docId] of newStatuses) {
            if (!processingIds.has(docId)) {
              newStatuses.delete(docId)
            }
          }

          return newStatuses
        })

        const statusById = new Map<string, DocumentStatus>()
        results.forEach(result => {
          if (result?.status) {
            statusById.set(result.docId, result.status)
          }
        })

        setDocuments(prev => prev.map(doc => {
          const latestStatus = statusById.get(doc.id)
          if (!latestStatus) {
            return doc
          }

          const newStatus = latestStatus.status as Document['status']
          const sameStatus = newStatus === doc.status
          const incomingError = latestStatus.error ?? null
          const existingError = doc.processing_error ?? null

          if (sameStatus && (newStatus !== 'error' || incomingError === existingError)) {
            return doc
          }

          const updatedDoc: Document = { ...doc, status: newStatus }

          if (newStatus === 'error') {
            const message = incomingError || existingError || 'Document processing failed'
            updatedDoc.processing_error = message
          } else if ('processing_error' in updatedDoc) {
            updatedDoc.processing_error = undefined
          }

          return updatedDoc
        }))

        // Note: Removed fetchDocuments(false) call - rely on realtime subscription for completion updates
      } catch (error) {
        clientLogger.error('Error polling document statuses:', error)
      }
    }

    const interval = setInterval(pollStatuses, 3000)
    pollStatuses()

    // Capture ref in cleanup closure to satisfy ESLint
    const pollingStartTimes = pollingStartTimesRef.current
    return () => {
      clearInterval(interval)
      pollingStartTimes.clear()
    }
  }, []) // Empty dependencies - effect runs once, uses refs for latest values

  // Periodic full document refresh failsafe (every 25-35 seconds with jitter)
  // This ensures UI eventually syncs with database even when realtime subscription fails
  // Jitter prevents synchronized request spikes across multiple users
  useEffect(() => {
    const trackedStatuses: Document['status'][] = ['uploading', 'queued', 'processing', 'error']
    // Add jitter: 25-35 seconds randomized per client to distribute load
    const BASE_INTERVAL = 25000
    const JITTER = 10000
    const REFRESH_INTERVAL = BASE_INTERVAL + Math.random() * JITTER

    const periodicRefresh = setInterval(() => {
      // Only refresh if there are documents with tracked statuses that might need syncing
      const hasTrackedDocs = documentsRef.current.some(doc =>
        trackedStatuses.includes(doc.status)
      )

      if (hasTrackedDocs) {
        clientLogger.info('Periodic document refresh to ensure UI sync', {
          intervalMs: Math.round(REFRESH_INTERVAL)
        })
        fetchDocuments(false)
      }
    }, REFRESH_INTERVAL)

    return () => {
      clearInterval(periodicRefresh)
    }
  }, [fetchDocuments])

  // Automatically trigger the cron worker when queued documents are detected in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      return
    }

    const hasQueuedDoc = documents.some(doc => doc.status === 'queued')
    if (!hasQueuedDoc) {
      return
    }

    const now = Date.now()
    if (now - lastProcessingTrigger < 5000) {
      return
    }

    setLastProcessingTrigger(now)

    const triggerProcessing = async () => {
      try {
        const response = await fetch('/api/test/process-jobs')
        if (!response.ok) {
          clientLogger.warn('Manual cron trigger returned non-OK response')
        }
      } catch (error) {
        clientLogger.warn('Failed to trigger manual cron processing', error)
      }
    }

    triggerProcessing()
  }, [documents, lastProcessingTrigger])

  // Filter helper functions
  const clearAllFilters = () => {
    setLawFirmFilter([])
    setFundManagerFilter([])
    setFundAdminFilter([])
    setJurisdictionFilter([])
    setShowFilters(false)
  }

  const toggleFilters = () => {
    setShowFilters(!showFilters)
  }

  const hasActiveFilters = () => {
    return lawFirmFilter.length > 0 ||
           fundManagerFilter.length > 0 ||
           fundAdminFilter.length > 0 ||
           jurisdictionFilter.length > 0
  }

  // Multi-select helper functions
  const toggleDocumentSelection = (documentId: string) => {
    if (documentId === sourceForSelectionId) {
      return
    }
    const newSelected = new Set(selectedDocuments)
    if (newSelected.has(documentId)) {
      newSelected.delete(documentId)
    } else {
      newSelected.add(documentId)
    }
    setSelectedDocuments(newSelected)
  }

  // Check if all documents on current page are selected
  const areAllCurrentPageSelected = () => {
    return paginatedDocuments.every(doc => selectedDocuments.has(doc.id))
  }

  const toggleAllDocuments = () => {
    const newSelected = new Set(selectedDocuments)
    const currentPageIds = paginatedDocuments.map(doc => doc.id)

    if (areAllCurrentPageSelected()) {
      // Deselect all documents on current page EXCEPT the source document
      currentPageIds.forEach(id => {
        if (id !== sourceForSelectionId) {
          newSelected.delete(id)
        }
      })
      // sourceForSelectionId is preserved - Selected Search mode stays active
    } else {
      // Select all documents on current page (add to set)
      currentPageIds.forEach(id => newSelected.add(id))
    }

    setSelectedDocuments(newSelected)
  }

  const cancelSelection = () => {
    setSelectedDocuments(new Set())
    setSourceForSelectionId(null)
  }

  const deleteDocument = async (documentId: string) => {
    setDeleteDialog(prev => {
      if (prev.document?.id === documentId) {
        return { ...prev, isDeleting: true }
      }
      return prev
    })

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete document')
      }

      setDocuments(prev => prev.filter(doc => doc.id !== documentId))

      if (selectedDocuments.has(documentId)) {
        setSelectedDocuments(prev => {
          const newSelected = new Set(prev)
          newSelected.delete(documentId)
          return newSelected
        })
      }

    } catch (error) {
      clientLogger.error('Error deleting document:', error)
      alert('Failed to delete document. Please try again.')
    } finally {
      setDeleteDialog(prev => {
        if (prev.document?.id === documentId) {
          return { document: null, isOpen: false, isDeleting: false }
        }
        return prev
      })
    }
  }

  const deleteSelectedDocuments = async () => {
    if (selectedDocuments.size === 0) return

    setBulkDeleteState({ total: selectedDocuments.size, processed: 0, isDeleting: true })
    const documentIds = Array.from(selectedDocuments)

    try {
      for (const id of documentIds) {
        await deleteDocument(id)
        setBulkDeleteState(prev => ({ ...prev, processed: prev.processed + 1 }))
      }
      setBulkDeleteState(prev => ({ ...prev, isDeleting: false }))
      setSelectedDocuments(new Set())
      setSourceForSelectionId(null)
      setBulkDeleteDialogOpen(false)
      setBulkDeleteConfirmText('')
    } catch (error) {
      clientLogger.error('Error in bulk delete:', error)
      setBulkDeleteState(prev => ({ ...prev, isDeleting: false }))
      setBulkDeleteDialogOpen(false)
      setBulkDeleteConfirmText('')
    }
  }


  // Sort handler for column headers
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  // Initial load
  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Refresh when trigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      clientLogger.warn('📡 Refreshing document list after upload')
      fetchDocuments(false)
    }
  }, [refreshTrigger, fetchDocuments])

  // Apply filtering, sorting, and search directly with intelligent pagination reset
  useEffect(() => {
    // Check if filters/sort changed (user action) vs documents updated (background)
    const filtersChanged =
      prevFiltersRef.current.searchQuery !== searchQuery ||
      prevFiltersRef.current.statusFilter !== statusFilter ||
      JSON.stringify(prevFiltersRef.current.lawFirmFilter) !== JSON.stringify(lawFirmFilter) ||
      JSON.stringify(prevFiltersRef.current.fundManagerFilter) !== JSON.stringify(fundManagerFilter) ||
      JSON.stringify(prevFiltersRef.current.fundAdminFilter) !== JSON.stringify(fundAdminFilter) ||
      JSON.stringify(prevFiltersRef.current.jurisdictionFilter) !== JSON.stringify(jurisdictionFilter) ||
      prevFiltersRef.current.sortBy !== sortBy ||
      prevFiltersRef.current.sortOrder !== sortOrder

    // Update ref for next comparison
    prevFiltersRef.current = {
      searchQuery,
      statusFilter,
      lawFirmFilter,
      fundManagerFilter,
      fundAdminFilter,
      jurisdictionFilter,
      sortBy,
      sortOrder
    }

    let filtered = documents.filter(doc => {
      const matchesSearch = searchQuery === '' ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'processing' && ['uploading', 'queued', 'processing'].includes(doc.status)) ||
        doc.status === statusFilter

      const matchesLawFirm = lawFirmFilter.length === 0 ||
        (lawFirmFilter.includes('(blank)') && !doc.metadata?.law_firm) ||
        (doc.metadata?.law_firm && lawFirmFilter.includes(doc.metadata.law_firm))

      const matchesFundManager = fundManagerFilter.length === 0 ||
        (fundManagerFilter.includes('(blank)') && !doc.metadata?.fund_manager) ||
        (doc.metadata?.fund_manager && fundManagerFilter.includes(doc.metadata.fund_manager))

      const matchesFundAdmin = fundAdminFilter.length === 0 ||
        (fundAdminFilter.includes('(blank)') && !doc.metadata?.fund_admin) ||
        (doc.metadata?.fund_admin && fundAdminFilter.includes(doc.metadata.fund_admin))

      const matchesJurisdiction = jurisdictionFilter.length === 0 ||
        (jurisdictionFilter.includes('(blank)') && !doc.metadata?.jurisdiction) ||
        (doc.metadata?.jurisdiction && jurisdictionFilter.includes(doc.metadata.jurisdiction))

      return matchesSearch && matchesStatus && matchesLawFirm &&
             matchesFundManager && matchesFundAdmin && matchesJurisdiction
    })

    filtered = filtered.sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'updated_at':
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
          break
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
        case 'page_count':
          comparison = (a.page_count ?? 0) - (b.page_count ?? 0)
          break
        default:
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    setFilteredDocuments(filtered)

    // Smart pagination reset logic:
    // 1. Reset to page 1 if filters/sort changed (user action)
    // 2. Adjust to last valid page if current page is out of bounds (document deleted/filtered out)
    // 3. Otherwise preserve current page (background document updates)
    const newTotalPages = Math.ceil(filtered.length / documentsPerPage)

    if (filtersChanged) {
      // User changed filters/sort - reset to page 1
      setCurrentPage(1)
    } else if (currentPage > newTotalPages && newTotalPages > 0) {
      // Current page out of bounds - go to last valid page
      setCurrentPage(newTotalPages)
    }
    // Otherwise: preserve currentPage (background updates don't reset pagination)
  }, [documents, searchQuery, statusFilter, lawFirmFilter, fundManagerFilter, fundAdminFilter, jurisdictionFilter, sortBy, sortOrder, currentPage, documentsPerPage])

  // Calculate pagination
  const totalPages = Math.ceil(filteredDocuments.length / documentsPerPage)
  const startIndex = (currentPage - 1) * documentsPerPage
  const endIndex = startIndex + documentsPerPage
  const paginatedDocuments = filteredDocuments.slice(startIndex, endIndex)

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const getStatusConfig = (status: Document['status']) => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle,
          color: 'bg-green-50 text-green-700 border-green-200',
          label: 'Completed'
        }
      case 'processing':
        return {
          icon: Clock,
          color: 'bg-blue-50 text-blue-700 border-blue-200',
          label: 'Processing'
        }
      case 'uploading':
        return {
          icon: Clock,
          color: 'bg-amber-50 text-amber-700 border-amber-200',
          label: 'Uploading'
        }
      case 'queued':
        return {
          icon: Clock,
          color: 'bg-purple-50 text-purple-700 border-purple-200',
          label: 'Queued'
        }
      case 'error':
        return {
          icon: AlertCircle,
          color: 'bg-red-50 text-red-700 border-red-200',
          label: 'Error'
        }
      case 'cancelled':
        return {
          icon: X,
          color: 'bg-gray-50 text-gray-700 border-gray-200',
          label: 'Cancelled'
        }
      default:
        return {
          icon: AlertCircle,
          color: 'bg-gray-50 text-gray-700 border-gray-200',
          label: 'Unknown'
        }
    }
  }

  const statusCounts = useMemo(() => {
    const filteredByMetadata = documents.filter(doc => {
      const matchesSearch = searchQuery === '' ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesLawFirm = lawFirmFilter.length === 0 ||
        (lawFirmFilter.includes('(blank)') && !doc.metadata?.law_firm) ||
        (doc.metadata?.law_firm && lawFirmFilter.includes(doc.metadata.law_firm))

      const matchesFundManager = fundManagerFilter.length === 0 ||
        (fundManagerFilter.includes('(blank)') && !doc.metadata?.fund_manager) ||
        (doc.metadata?.fund_manager && fundManagerFilter.includes(doc.metadata.fund_manager))

      const matchesFundAdmin = fundAdminFilter.length === 0 ||
        (fundAdminFilter.includes('(blank)') && !doc.metadata?.fund_admin) ||
        (doc.metadata?.fund_admin && fundAdminFilter.includes(doc.metadata.fund_admin))

      const matchesJurisdiction = jurisdictionFilter.length === 0 ||
        (jurisdictionFilter.includes('(blank)') && !doc.metadata?.jurisdiction) ||
        (doc.metadata?.jurisdiction && jurisdictionFilter.includes(doc.metadata.jurisdiction))

      return matchesSearch && matchesLawFirm && matchesFundManager && matchesFundAdmin && matchesJurisdiction
    })

    return {
      all: filteredByMetadata.length,
      completed: filteredByMetadata.filter(d => d.status === 'completed').length,
      processing: filteredByMetadata.filter(d => ['uploading', 'queued', 'processing'].includes(d.status)).length,
      error: filteredByMetadata.filter(d => d.status === 'error').length,
    }
  }, [documents, searchQuery, lawFirmFilter, fundManagerFilter, fundAdminFilter, jurisdictionFilter])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex items-center justify-center p-12">
            <div className="animate-pulse flex flex-col items-center">
              <div className="h-12 w-12 bg-gray-200 rounded-lg mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-32"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Selection Controls */}
      {isSelectMode && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant="secondary">
            {selectedDocuments.size} selected
          </Badge>
          {sourceForSelectionId && (
            <Button
              size="sm"
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-400"
              disabled={selectedDocuments.size < 2}
              onClick={() => {
                const ids = Array.from(selectedDocuments)
                router.push(`/documents/selected-search?ids=${ids.join(',')}`)
              }}
            >
              <Search className="h-4 w-4 mr-2" />
              Search Selected ({selectedDocuments.size})
            </Button>
          )}
          {selectedDocuments.size > 0 && !sourceForSelectionId && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (bulkDeleteState.isDeleting) return
                setBulkDeleteDialogOpen(true)
                setBulkDeleteConfirmText('')
              }}
              disabled={bulkDeleteState.isDeleting}
            >
              {bulkDeleteState.isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting... ({bulkDeleteState.processed}/{bulkDeleteState.total})
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedDocuments.size})
                </>
              )}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={cancelSelection}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      )}

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="grid w-full grid-cols-4 rounded-lg p-1 h-auto bg-muted">
          <TabsTrigger value="all" className="flex items-center gap-2">
            All
            <Badge variant="secondary" className="ml-1">
              {statusCounts.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Completed
            <Badge variant="secondary" className="ml-1">
              {statusCounts.completed}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="processing" className="flex items-center gap-2">
            <Clock className="h-3 w-3" />
            Processing
            <Badge variant="secondary" className="ml-1">
              {statusCounts.processing}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="error" className="flex items-center gap-2">
            <AlertCircle className="h-3 w-3" />
            Errors
            <Badge variant="secondary" className="ml-1">
              {statusCounts.error}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Filters and Search */}
        <div className="space-y-3 mt-3">
          {/* Search Mode Toggle */}
          <RadioGroup
            value={searchMode}
            onValueChange={(value) => handleSearchModeChange(value as 'name' | 'content')}
            className="flex items-center gap-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="name" id="search-name" />
              <Label
                htmlFor="search-name"
                className="text-sm font-normal cursor-pointer"
              >
                Search by Document
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="content" id="search-content" />
              <Label
                htmlFor="search-content"
                className="text-sm font-normal cursor-pointer"
              >
                Search by Content
              </Label>
            </div>
          </RadioGroup>

          {/* Search Input and Filters Button */}
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" aria-hidden="true" />
              <Input
                placeholder={
                  searchMode === 'name'
                    ? 'Search documents by name...'
                    : 'Search document content by keywords...'
                }
                value={searchQuery}
                onChange={(e) => handleSearchQueryChange(e.target.value)}
                className="pl-10 input-brighter h-9"
                aria-label={
                  searchMode === 'name'
                    ? 'Search documents by title'
                    : 'Search documents by content keywords'
                }
              />
              {isKeywordSearching && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                </div>
              )}
            </div>
            {searchMode === 'name' && (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleFilters}
                className="flex items-center gap-2 button-brighter"
              >
                <Filter className="h-4 w-4" />
                Filters
                {hasActiveFilters() && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {lawFirmFilter.length + fundManagerFilter.length + fundAdminFilter.length + jurisdictionFilter.length}
                  </Badge>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Metadata Filters */}
        {showFilters && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted mt-3">
            {hasActiveFilters() && (
              <div className="flex items-center justify-end mb-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="text-xs h-auto py-1 px-2"
                >
                  <FilterX className="h-3 w-3 mr-1" />
                  Clear All
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Law Firm Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium">
                  <Scale className="h-3 w-3" />
                  Law Firm
                </Label>
                <SearchableMultiSelect
                  options={[...lawFirmOptions, { value: '(blank)', label: '(blank)' }]}
                  values={lawFirmFilter}
                  onValuesChange={setLawFirmFilter}
                  placeholder="Select law firms..."
                  searchPlaceholder="Search law firms..."
                />
              </div>

              {/* Fund Manager Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium">
                  <UserCircle className="h-3 w-3" />
                  Fund Manager
                </Label>
                <SearchableMultiSelect
                  options={[...fundManagerOptions, { value: '(blank)', label: '(blank)' }]}
                  values={fundManagerFilter}
                  onValuesChange={setFundManagerFilter}
                  placeholder="Select fund managers..."
                  searchPlaceholder="Search fund managers..."
                />
              </div>

              {/* Fund Admin Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium">
                  <ClipboardList className="h-3 w-3" />
                  Fund Admin
                </Label>
                <SearchableMultiSelect
                  options={[...fundAdminOptions, { value: '(blank)', label: '(blank)' }]}
                  values={fundAdminFilter}
                  onValuesChange={setFundAdminFilter}
                  placeholder="Select fund admins..."
                  searchPlaceholder="Search fund admins..."
                />
              </div>

              {/* Jurisdiction Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium">
                  <Globe className="h-3 w-3" />
                  Jurisdiction
                </Label>
                <SearchableMultiSelect
                  options={[...jurisdictionOptions, { value: '(blank)', label: '(blank)' }]}
                  values={jurisdictionFilter}
                  onValuesChange={setJurisdictionFilter}
                  placeholder="Select jurisdictions..."
                  searchPlaceholder="Search jurisdictions..."
                />
              </div>
            </div>
          </div>
        )}

        <TabsContent value={statusFilter} className="mt-3">
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <p className="text-red-800">{error}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Keyword Search Results (Content Mode) */}
          {searchMode === 'content' ? (
            <>
              <KeywordResults
                results={keywordResults?.results || []}
                query={searchQuery}
                isLoading={isKeywordSearching}
                onViewDocument={async (documentId, pageNumber) => {
                  const doc = documents.find(d => d.id === documentId)
                  if (!doc) return

                  try {
                    const response = await fetch(`/api/documents/${doc.id}/download`)
                    if (!response.ok) throw new Error('Failed to retrieve document')

                    const blob = await response.blob()
                    const url = window.URL.createObjectURL(blob)

                    // Add page number using PDF fragment identifier
                    const urlWithPage = pageNumber ? `${url}#page=${pageNumber}` : url

                    window.open(urlWithPage, '_blank', 'noopener,noreferrer')

                    setTimeout(() => window.URL.revokeObjectURL(url), 1000)
                  } catch (error) {
                    clientLogger.error('Failed to open document', {
                      error,
                      documentId: doc.id,
                      filename: doc.filename,
                      pageNumber
                    })
                    alert(`Failed to open "${doc.title}". Please try again.`)
                  }
                }}
              />

              {/* Load More Documents Button */}
              {keywordResults && keywordResults.hasMore && !isKeywordSearching && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <div className="text-sm text-gray-600">
                    Showing {keywordResults.results.length} of {keywordResults.totalDocuments} documents
                  </div>
                  <Button
                    onClick={loadMoreKeywordDocuments}
                    disabled={isLoadingMoreKeywordDocs}
                    variant="outline"
                    className="w-full max-w-md"
                  >
                    {isLoadingMoreKeywordDocs ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />
                        Loading more documents...
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4 mr-2" />
                        Load {Math.min(20, keywordResults.totalDocuments - keywordResults.results.length)} more document
                        {Math.min(20, keywordResults.totalDocuments - keywordResults.results.length) !== 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          ) : (
            /* Document List Table (Name Mode) */
            <>
          {filteredDocuments.length === 0 ? (
            <Card className="card-enhanced">
              <CardContent className="flex flex-col items-center justify-center p-12">
                <Image src="/logo/pdf.svg" alt="PDF" width={48} height={48} className="opacity-40 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No documents found
                </h3>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Table */}
              <Card className="card-enhanced">
                <Table style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: `${columnWidths.checkbox}px` }} />
                    <col style={{ width: `${columnWidths.name}px` }} />
                    <col style={{ width: `${columnWidths.metadata}px` }} />
                    <col style={{ width: `${columnWidths.pages}px` }} />
                    <col style={{ width: `${columnWidths.lastModified}px` }} />
                    <col style={{ width: `${columnWidths.actions}px` }} />
                  </colgroup>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted">
                      <TableHead className="h-10 py-2 rounded-tl-xl" style={{ width: `${columnWidths.checkbox}px` }}>
                        <Checkbox
                          checked={
                            paginatedDocuments.length === 0
                              ? false
                              : areAllCurrentPageSelected()
                              ? true
                              : paginatedDocuments.some(doc => selectedDocuments.has(doc.id))
                              ? 'indeterminate'
                              : false
                          }
                          onCheckedChange={toggleAllDocuments}
                          aria-label="Select all documents on current page"
                        />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 h-10 py-2 border-r border-gray-300 relative group"
                        onClick={() => handleSort('title')}
                        style={{ width: `${columnWidths.name}px` }}
                      >
                        <div className="flex items-center gap-2">
                          Name
                          {sortBy === 'title' ? (
                            sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                          ) : (
                            <ArrowUpDown className="h-4 w-4 opacity-50" />
                          )}
                        </div>
                        <div
                          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-gray-400"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            handleMouseDown(e, 'name')
                          }}
                        />
                      </TableHead>
                      <TableHead className="h-10 py-2 border-r border-gray-300 relative group" style={{ width: `${columnWidths.metadata}px` }}>
                        Metadata
                        <div
                          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-gray-400"
                          onMouseDown={(e) => handleMouseDown(e, 'metadata')}
                        />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 h-10 py-2 border-r border-gray-300 relative group"
                        onClick={() => handleSort('page_count')}
                        style={{ width: `${columnWidths.pages}px` }}
                      >
                        <div className="flex items-center gap-2">
                          Pages
                          {sortBy === 'page_count' ? (
                            sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                          ) : (
                            <ArrowUpDown className="h-4 w-4 opacity-50" />
                          )}
                        </div>
                        <div
                          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-gray-400"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            handleMouseDown(e, 'pages')
                          }}
                        />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 h-10 py-2 border-r border-gray-300 relative group"
                        onClick={() => handleSort('updated_at')}
                        style={{ width: `${columnWidths.lastModified}px` }}
                      >
                        <div className="flex items-center gap-2">
                          Last Modified
                          {sortBy === 'updated_at' ? (
                            sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                          ) : (
                            <ArrowUpDown className="h-4 w-4 opacity-50" />
                          )}
                        </div>
                        <div
                          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-gray-400"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            handleMouseDown(e, 'lastModified')
                          }}
                        />
                      </TableHead>
                      <TableHead className="text-right h-10 py-2 rounded-tr-xl" aria-label="Actions" style={{ width: `${columnWidths.actions}px` }}></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDocuments.map((document) => {
                      const statusConfig = getStatusConfig(document.status)
                      const StatusIcon = statusConfig.icon
                      const isSelected = selectedDocuments.has(document.id)
                      const isSource = sourceForSelectionId === document.id

                      return (
                        <TableRow
                          key={document.id}
                          data-state={isSelected ? "selected" : undefined}
                          className={isSource && !isSelected ? "bg-emerald-50" : ""}
                        >
                          {/* Checkbox */}
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleDocumentSelection(document.id)}
                              disabled={isSource}
                              aria-label={`Select ${document.title}`}
                            />
                          </TableCell>

                          {/* Name Column */}
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Image src="/logo/pdf.svg" alt="PDF" width={28} height={28} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {document.status === 'completed' ? (
                                    <button
                                      onClick={() => viewDocument(document)}
                                      className="font-medium text-gray-900 hover:text-gray-700 truncate text-left cursor-pointer"
                                    >
                                      {document.title}
                                    </button>
                                  ) : (
                                    <span className="font-medium text-gray-900 truncate">
                                      {document.title}
                                    </span>
                                  )}
                                  {isSource && (
                                    <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                                      <Target className="h-3 w-3 mr-1" />
                                      Source
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge className={`${statusConfig.color} flex items-center gap-1`}>
                                    <StatusIcon className="h-3 w-3" />
                                    {document.status === 'processing'
                                      ? documentStatuses.get(document.id)?.phase || statusConfig.label
                                      : statusConfig.label}
                                  </Badge>
                                  {document.processing_error && (
                                    <span className="text-xs text-red-600 truncate">
                                      {document.processing_error}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          {/* Metadata Column */}
                          <TableCell>
                            <div className="flex flex-col gap-1.5 text-xs">
                              <div className="flex items-center gap-1.5">
                                <Scale className="h-3 w-3 flex-shrink-0 text-gray-400" />
                                {document.metadata?.law_firm ? (
                                  <span className="truncate text-gray-600">{resolveOptionLabel(document.metadata.law_firm, lawFirmOptions)}</span>
                                ) : (
                                  <span className="truncate text-orange-500">(blank)</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <UserCircle className="h-3 w-3 flex-shrink-0 text-gray-400" />
                                {document.metadata?.fund_manager ? (
                                  <span className="truncate text-gray-600">{resolveOptionLabel(document.metadata.fund_manager, fundManagerOptions)}</span>
                                ) : (
                                  <span className="truncate text-orange-500">(blank)</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <ClipboardList className="h-3 w-3 flex-shrink-0 text-gray-400" />
                                {document.metadata?.fund_admin ? (
                                  <span className="truncate text-gray-600">{resolveOptionLabel(document.metadata.fund_admin, fundAdminOptions)}</span>
                                ) : (
                                  <span className="truncate text-orange-500">(blank)</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Globe className="h-3 w-3 flex-shrink-0 text-gray-400" />
                                {document.metadata?.jurisdiction ? (
                                  <span className="truncate text-gray-600">{resolveOptionLabel(document.metadata.jurisdiction, jurisdictionOptions)}</span>
                                ) : (
                                  <span className="truncate text-orange-500">(blank)</span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Pages Column */}
                          <TableCell>
                            <div className="text-xs text-gray-600">
                              {document.page_count ?? '-'}
                            </div>
                          </TableCell>

                          {/* Last Modified Column */}
                    <TableCell>
                      <div className="text-xs text-gray-600">
                        {format(new Date(document.updated_at), 'MMM dd, yyyy HH:mm')}
                        {(() => {
                          const name = document.updated_by_name?.trim()
                          const email = document.updated_by_email?.trim()
                          if (name || email) {
                            return ` by ${name || email}`
                          }
                          return ' by Unknown user'
                        })()}
                      </div>
                    </TableCell>

                          {/* Actions Column */}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Primary Action Buttons */}
                              {document.status === 'completed' && (
                                <>
                                  {document.metadata?.embeddings_skipped ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleRetryProcessing(document)}
                                      disabled={retryingDocuments.has(document.id)}
                                      className="h-8 text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-300"
                                    >
                                      {retryingDocuments.has(document.id) ? (
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      ) : (
                                        <RotateCcw className="h-3 w-3 mr-1" />
                                      )}
                                      Retry
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      onClick={() => handleSetSearchModeDocument(document)}
                                      className="h-8 bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-400 hover:from-blue-600 hover:via-cyan-600 hover:to-teal-500 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200"
                                    >
                                      <Search className="h-3 w-3 mr-1" />
                                      Search
                                    </Button>
                                  )}
                                </>
                              )}

                              {document.status === 'error' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRetryProcessing(document)}
                                  disabled={retryingDocuments.has(document.id)}
                                  className="h-8"
                                >
                                  {retryingDocuments.has(document.id) ? (
                                    <>
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      Retrying...
                                    </>
                                  ) : (
                                    'Retry'
                                  )}
                                </Button>
                              )}

                              {/* More Options Menu */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0 button-brighter"
                                    aria-label={`More options for ${document.title}`}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => downloadDocument(document)}
                                    className="flex items-center"
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    Download PDF
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setEditingDocument(document)}
                                    className="flex items-center"
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openRenameDialog(document)}
                                    className="flex items-center"
                                  >
                                    <Edit2 className="h-4 w-4 mr-2" />
                                    Rename Document
                                  </DropdownMenuItem>

                                  {/* Cancel Processing Option */}
                                  {['queued', 'processing'].includes(document.status) && (() => {
                                    const isCancelling = cancellingDocuments.has(document.id)
                                    const isDialogOpen = cancelDialogOpen === document.id
                                    return (
                                      <>
                                        <DropdownMenuSeparator />
                                        <AlertDialog
                                          open={isDialogOpen}
                                          onOpenChange={(open) => {
                                            if (!open) {
                                              if (isCancelling) {
                                                return
                                              }
                                              setCancelDialogOpen(null)
                                            } else {
                                              setCancelDialogOpen(document.id)
                                            }
                                          }}
                                        >
                                          <AlertDialogTrigger asChild>
                                            <DropdownMenuItem
                                              className="flex items-center text-orange-600"
                                              onSelect={(e) => e.preventDefault()}
                                            >
                                              <X className="h-4 w-4 mr-2" />
                                              Cancel Processing
                                            </DropdownMenuItem>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Cancel Processing</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                Are you sure you want to cancel processing for &quot;{document.title}&quot;?
                                                {isCancelling && (
                                                  <span className="block mt-2 text-orange-600">
                                                    Cancelling and cleaning up...
                                                  </span>
                                                )}
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel disabled={isCancelling}>
                                                Keep Processing
                                              </AlertDialogCancel>
                                              <Button
                                                type="button"
                                                onClick={() => handleCancelProcessing(document.id)}
                                                disabled={isCancelling}
                                                className="bg-orange-600 hover:bg-orange-700"
                                              >
                                                {isCancelling ? (
                                                  <>
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    Cancelling...
                                                  </>
                                                ) : (
                                                  'Cancel Processing'
                                                )}
                                              </Button>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </>
                                    )
                                  })()}

                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="flex items-center text-red-600"
                                    onSelect={() => {
                                      setDeleteDialog({ document, isOpen: true, isDeleting: false })
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Card>

              {/* Pagination Controls */}
              {filteredDocuments.length > documentsPerPage && (
                <div className="flex items-center justify-between pt-4">
                  <div className="text-sm text-gray-500">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredDocuments.length)} of {filteredDocuments.length} documents
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(1)}
                      disabled={currentPage === 1}
                      className="w-8 h-8 p-0"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="w-8 h-8 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }

                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => goToPage(pageNum)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="w-8 h-8 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="w-8 h-8 p-0"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          </>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Document Metadata Modal */}
      <EditDocumentMetadataModal
        document={editingDocument}
        isOpen={!!editingDocument}
        onClose={() => setEditingDocument(null)}
        onSuccess={handleDocumentUpdate}
      />

      {/* Search Mode Modal */}
      <SearchModeModal
        isOpen={searchModeModal.isOpen}
        onClose={closeSearchModeModal}
        documentId={searchModeModal.document?.id || ''}
        documentTitle={searchModeModal.document?.title || ''}
        onSelectedSearchClick={handleSelectedSearchClick}
      />

      {/* Rename Document Dialog */}
      <AlertDialog
        open={renameDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (renameDialog.isRenaming) {
              return
            }
            closeRenameDialog()
          }
        }}
      >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rename Document</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for &quot;{renameDialog.document?.title}&quot;
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <Input
              value={renameDialog.newTitle}
              onChange={(e) => setRenameDialog(prev => ({ ...prev, newTitle: e.target.value }))}
              placeholder="Document title"
              disabled={renameDialog.isRenaming}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !renameDialog.isRenaming && renameDialog.newTitle.trim()) {
                  handleRenameDocument()
                }
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={renameDialog.isRenaming}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={handleRenameDocument}
              disabled={renameDialog.isRenaming || !renameDialog.newTitle.trim()}
              className="min-w-[140px]"
            >
              {renameDialog.isRenaming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Renaming...
                </>
              ) : (
                'Rename Document'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={open => {
          if (!open) {
            if (bulkDeleteState.isDeleting) return
            setBulkDeleteDialogOpen(false)
            setBulkDeleteConfirmText('')
          }
        }}
      >
        <AlertDialogContent
          onKeyDown={event => {
            if (
              event.key === 'Enter' &&
              !bulkDeleteState.isDeleting &&
              bulkDeleteConfirmText.trim() === 'delete-document' &&
              selectedDocuments.size > 0
            ) {
              event.preventDefault()
              deleteSelectedDocuments()
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Documents</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedDocuments.size > 0
                ? `Are you sure you want to delete ${selectedDocuments.size} document${selectedDocuments.size > 1 ? 's' : ''}? This action cannot be undone.`
                : 'Are you sure you want to delete the selected documents? This action cannot be undone.'}
            </AlertDialogDescription>
            <div className="mt-3">
              <p className="text-sm text-gray-600 mb-2">
                Type <span className="font-semibold">delete-document</span> to confirm.
              </p>
              <Input
                value={bulkDeleteConfirmText}
                onChange={e => setBulkDeleteConfirmText(e.target.value)}
                placeholder="delete-document"
                autoFocus
              />
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteState.isDeleting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                if (bulkDeleteState.isDeleting) return
                if (bulkDeleteConfirmText.trim() !== 'delete-document') return
                deleteSelectedDocuments()
              }}
              disabled={
                bulkDeleteState.isDeleting ||
                bulkDeleteConfirmText.trim() !== 'delete-document' ||
                selectedDocuments.size === 0
              }
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkDeleteState.isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting... ({bulkDeleteState.processed}/{bulkDeleteState.total})
                </>
              ) : (
                `Delete (${selectedDocuments.size})`
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Document Dialog */}
      <AlertDialog
        open={deleteDialog.isOpen}
        onOpenChange={open => {
          if (!open) {
            if (deleteDialog.isDeleting) {
              return
            }
            setDeleteDialog({ document: null, isOpen: false, isDeleting: false })
            setDeleteConfirmText('')
          }
        }}
      >
        <AlertDialogContent
          onKeyDown={event => {
            if (
              event.key === 'Enter' &&
              !deleteDialog.isDeleting &&
              deleteDialog.document &&
              deleteConfirmText.trim() === 'delete-document'
            ) {
              event.preventDefault()
              deleteDocument(deleteDialog.document.id)
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.document
                ? `Are you sure you want to delete "${deleteDialog.document.title}"? This action cannot be undone.`
                : 'Are you sure you want to delete this document? This action cannot be undone.'}
            </AlertDialogDescription>
            <div className="mt-3">
              <p className="text-sm text-gray-600 mb-2">
                Type <span className="font-semibold">delete-document</span> to confirm.
              </p>
              <Input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="delete-document"
                autoFocus
              />
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDialog.isDeleting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                if (!deleteDialog.document || deleteDialog.isDeleting) return
                deleteDocument(deleteDialog.document.id)
              }}
              disabled={deleteDialog.isDeleting || deleteConfirmText.trim() !== 'delete-document'}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteDialog.isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Document'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default EnhancedDocumentList
const resolveOptionLabel = (
  value: string | null | undefined,
  options: ReadonlyArray<MetadataOption>
): string => {
  if (!value) {
    return ''
  }
  return options.find(option => option.value === value)?.label ?? value
}
