'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Upload, FileText, Loader2, Scale, UserCircle, ClipboardList, Globe, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { useFileValidation } from '@/lib/file-validation'
import { 
  LAW_FIRM_OPTIONS, 
  FUND_MANAGER_OPTIONS, 
  FUND_ADMIN_OPTIONS, 
  JURISDICTION_OPTIONS,
  DEFAULT_METADATA,
  type LawFirmOption,
  type FundManagerOption,
  type FundAdminOption,
  type JurisdictionOption
} from '@/lib/metadata-constants'

interface DocumentMetadata {
  law_firm: LawFirmOption | ''
  fund_manager: FundManagerOption | ''
  fund_admin: FundAdminOption | ''
  jurisdiction: JurisdictionOption | ''
}

interface TouchedFields {
  law_firm: boolean
  fund_manager: boolean
  fund_admin: boolean
  jurisdiction: boolean
}

interface UploadFile {
  file: File
  id: string
  progress: number
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error' | 'validating'
  error?: string
  metadata: DocumentMetadata
  touchedFields: TouchedFields
  validation?: {
    isValid: boolean
    issues: string[]
    warnings: string[]
    fileInfo: {
      sizeFormatted: string
      [key: string]: unknown
    }
  }
}

interface DocumentUploadProps {
  onUploadComplete?: () => void
}

interface ValidationSummary {
  total: number
  valid: number
  invalid: number
  totalWarnings: number
  totalIssues: number
  canProceed: boolean
}

export function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { validateFiles, getValidationSummary } = useFileValidation()

  const handleFileSelect = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return


    const allFiles = Array.from(selectedFiles)
    const pdfFiles = allFiles.filter(file => file.type === 'application/pdf')
    const nonPdfCount = allFiles.length - pdfFiles.length

    // Show alert if non-PDF files were selected
    if (nonPdfCount > 0) {
      alert(`${nonPdfCount} file(s) were skipped. Only PDF files are allowed.`)
    }

    // Limit to 10 files
    const filesToProcess = pdfFiles.slice(0, 10)
    if (pdfFiles.length > 10) {
      alert(`Only the first 10 files will be processed. ${pdfFiles.length - 10} files were skipped.`)
    }

    // Create initial file objects with validating status
    const newFiles: UploadFile[] = filesToProcess.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      progress: 0,
      status: 'validating' as const,
      metadata: { ...DEFAULT_METADATA },
      touchedFields: {
        law_firm: false,
        fund_manager: false,
        fund_admin: false,
        jurisdiction: false
      }
    }))

    setFiles(prev => [...prev, ...newFiles])
    setValidationSummary(null)
    setStatusMessage(null)
    setError(null)

    try {
      // Validate files
      const validationResults = await validateFiles(filesToProcess)
      
      // Update files with validation results
      setFiles(prev => prev.map(f => {
        const validation = validationResults.get(f.file.name)
        if (validation) {
          return {
            ...f,
            status: validation.isValid ? 'pending' as const : 'error' as const,
            validation,
            error: validation.isValid ? '' : validation.issues.join(', ')
          }
        }
        return f
      }))

      // Show validation summary
      const summary = getValidationSummary(validationResults)
      if (summary.invalid > 0) {
        alert(`${summary.invalid} file(s) failed validation. Please check the issues and try again.`)
      } else if (summary.totalWarnings > 0) {
        setValidationSummary(summary)
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Validation failed')
      // Mark all new files as error if validation fails
      setFiles(prev => prev.map(f =>
        newFiles.some(nf => nf.id === f.id)
          ? { ...f, status: 'error' as const, error: 'Validation failed' }
          : f
      ))
    }
  }, [validateFiles, getValidationSummary])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const [uploadConcurrency, setUploadConcurrency] = useState<number>(2)

  useEffect(() => {
    const controller = new AbortController()
    let isMounted = true

    const hydrateConcurrency = async () => {
      try {
        const response = await fetch('/api/health/pool', {
          method: 'GET',
          headers: {
            'cache-control': 'no-cache'
          },
          signal: controller.signal
        })

        if (!response.ok) {
          return
        }

        const data = await response.json()
        const globalLimit = data?.throttling?.upload?.global?.limit
        const perUserLimit = data?.throttling?.upload?.perUser?.limit

        const toFiniteNumber = (value: unknown) => {
          const numberValue = typeof value === 'number' ? value : Number(value)
          return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : null
        }

        const parsedGlobal = toFiniteNumber(globalLimit)
        const parsedPerUser = toFiniteNumber(perUserLimit)

        const effectiveLimitCandidates = [
          parsedGlobal ?? Number.POSITIVE_INFINITY,
          parsedPerUser ?? Number.POSITIVE_INFINITY
        ]

        const effectiveLimit = Math.min(...effectiveLimitCandidates)

        if (isMounted && Number.isFinite(effectiveLimit) && effectiveLimit > 0) {
          setUploadConcurrency(Math.max(1, effectiveLimit))
        }
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          return
        }
        // Non-fatal: fall back to default concurrency
      }
    }

    void hydrateConcurrency()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [])

  const uploadFiles = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending')
    
    // Parallel upload processing, aligned with backend throttling limits
    const CONCURRENCY_LIMIT = Math.max(1, uploadConcurrency)
    for (let i = 0; i < pendingFiles.length; i += CONCURRENCY_LIMIT) {
      const batch = pendingFiles.slice(i, i + CONCURRENCY_LIMIT)
      
      const batchPromises = batch.map(uploadFile => uploadSingleFile(uploadFile))
      
      // Wait for current batch to complete before starting next batch
      await Promise.allSettled(batchPromises)
    }
    
    // Optional: Trigger batch job processing after all uploads complete
    try {
      await fetch('/api/test/process-jobs')
    } catch {
      // Non-fatal: manual cron trigger unavailable
    }
  }

  const uploadSingleFile = async (uploadFile: UploadFile): Promise<void> => {
    try {
      // Update status to uploading
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'uploading' as const, progress: 10 } 
          : f
      ))

      const formData = new FormData()
      formData.append('file', uploadFile.file)
      formData.append('metadata', JSON.stringify(uploadFile.metadata))

      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id && f.progress < 90
            ? { ...f, progress: Math.min(f.progress + 10, 90) }
            : f
        ))
      }, 200)

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(errorData.error || 'Upload failed')
      }

      const _result = await response.json()

      // Upload completed successfully
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'completed' as const, progress: 100 } 
          : f
      ))

      setStatusMessage(`Uploaded ${uploadFile.file.name}`)
      
      // Trigger document list refresh
      if (onUploadComplete) {
        onUploadComplete()
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      setStatusMessage(`Upload failed for ${uploadFile.file.name}`)
      
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'error' as const, error: errorMessage, progress: 0 } 
          : f
      ))
    }
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const clearCompleted = () => {
    setFiles(prev => prev.filter(f => f.status !== 'completed'))
  }

const updateFileMetadata = (fileId: string, field: keyof DocumentMetadata, value: string | number | boolean | null) => {
  setFiles(prev => prev.map(f =>
    f.id === fileId
      ? {
          ...f,
          metadata: { ...f.metadata, [field]: value },
          touchedFields: { ...f.touchedFields, [field]: true }
        }
      : f
  ))
}

const getDropdownClassName = (_uploadFile: UploadFile, _field: keyof DocumentMetadata) => {
  // Neutral styling for optional fields
  return "h-8 text-xs transition-colors duration-200"
}

const canUpload = () => {
    const pendingFiles = files.filter(f => f.status === 'pending')
    return pendingFiles.length > 0 &&
           pendingFiles.every(f => f.validation?.isValid !== false)
  }

  const getFileStatusIcon = (uploadFile: UploadFile) => {
    switch (uploadFile.status) {
      case 'validating':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'pending':
        return uploadFile.validation?.isValid ? 
          <CheckCircle className="h-4 w-4 text-green-500" /> :
          <FileText className="h-4 w-4 text-gray-400" />
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      default:
        return <FileText className="h-4 w-4 text-gray-400" />
    }
  }

  return (
    <Card className="card-enhanced" data-testid="upload-form">
      <CardHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-5 sm:pb-3">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold sm:text-sm">
          <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
          Upload Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0 sm:space-y-4 sm:px-6 sm:pb-6">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {statusMessage && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        )}

        {validationSummary && validationSummary.totalWarnings > 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {validationSummary.totalWarnings} warning{validationSummary.totalWarnings === 1 ? '' : 's'} detected during validation. You can proceed, but review the highlighted fields.
            </AlertDescription>
          </Alert>
        )}

        <div
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors sm:p-5 ${
            isDragOver
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-upload')?.click()}
        >
          <FileText className="mx-auto h-10 w-10 text-gray-400 mb-3 sm:h-12 sm:w-12 sm:mb-4" />
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1.5 sm:mb-2">
            Drop PDF files here or click to browse
          </p>
          <Input
            id="file-upload"
            type="file"
            multiple
            accept=".pdf"
            className="hidden"
            data-testid="file-input"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Upload Queue</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCompleted}
                disabled={!files.some(f => f.status === 'completed')}
              >
                Clear Completed
              </Button>
            </div>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {files.map((uploadFile) => (
                <div key={uploadFile.id} className="border rounded-lg p-3 space-y-2.5 sm:p-4 sm:space-y-3 border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/20">
                  {/* File Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getFileStatusIcon(uploadFile)}
                      <div className="flex-1">
                        <p className="text-sm font-medium truncate">
                          {uploadFile.file.name}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-gray-500 capitalize">
                            {uploadFile.status}
                            {uploadFile.error && `: ${uploadFile.error}`}
                          </p>
                          
                          {/* Validation status */}
                          {uploadFile.validation && (
                            <>
                              {uploadFile.validation.isValid ? (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                                  ✓ Validated
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">
                                  ✗ Invalid
                                </Badge>
                              )}
                              
                              {/* File info */}
                              <span className="text-xs text-gray-400">
                                {uploadFile.validation.fileInfo.sizeFormatted}
                              </span>
                            </>
                          )}
                          
                          {/* File status badge */}
                          {uploadFile.status === 'pending' && uploadFile.validation?.isValid && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                              ✓ Ready
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(uploadFile.id)}
                      disabled={uploadFile.status === 'uploading' || uploadFile.status === 'processing'}
                    >
                      ×
                    </Button>
                  </div>

                  {/* Validation Issues and Warnings */}
                  {uploadFile.validation && (uploadFile.validation.issues.length > 0 || uploadFile.validation.warnings.length > 0) && (
                    <div className="space-y-1.5">
                      {uploadFile.validation.issues.length > 0 && (
                        <Alert className="border-red-200 bg-red-50">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <AlertDescription className="text-sm text-red-800">
                            <div className="font-medium">Issues found:</div>
                            <ul className="list-disc list-inside mt-1">
                              {uploadFile.validation.issues.map((issue, idx) => (
                                <li key={idx}>{issue}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}
                      
                      {uploadFile.validation.warnings.length > 0 && (
                        <Alert className="border-amber-200 bg-amber-50">
                          <Info className="h-4 w-4 text-amber-600" />
                          <AlertDescription className="text-sm text-amber-800">
                            <div className="font-medium">Warnings:</div>
                            <ul className="list-disc list-inside mt-1">
                              {uploadFile.validation.warnings.map((warning, idx) => (
                                <li key={idx}>{warning}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {/* Metadata Dropdowns */}
                  {uploadFile.status === 'pending' && uploadFile.validation?.isValid && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="flex items-center gap-2 text-xs">
                            <Scale className="h-3 w-3" />
                            Law Firm
                          </Label>
                          <SearchableSelect
                            options={LAW_FIRM_OPTIONS as unknown as {value: string; label: string}[]}
                            value={uploadFile.metadata.law_firm}
                            onValueChange={(value: string) =>
                              updateFileMetadata(uploadFile.id, 'law_firm', value as LawFirmOption)
                            }
                            placeholder="Please select"
                            searchPlaceholder="Search law firms..."
                            allowClear={true}
                            emptyMessage="No law firms found"
                            className={getDropdownClassName(uploadFile, 'law_firm')}
                            data-testid="law-firm-select"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="flex items-center gap-2 text-xs">
                            <UserCircle className="h-3 w-3" />
                            Fund Manager
                          </Label>
                          <SearchableSelect
                            options={FUND_MANAGER_OPTIONS as unknown as {value: string; label: string}[]}
                            value={uploadFile.metadata.fund_manager}
                            onValueChange={(value: string) =>
                              updateFileMetadata(uploadFile.id, 'fund_manager', value as FundManagerOption)
                            }
                            placeholder="Please select"
                            searchPlaceholder="Search fund managers..."
                            allowClear={true}
                            emptyMessage="No fund managers found"
                            className={getDropdownClassName(uploadFile, 'fund_manager')}
                            data-testid="fund-manager-select"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="flex items-center gap-2 text-xs">
                            <ClipboardList className="h-3 w-3" />
                            Fund Admin
                          </Label>
                          <SearchableSelect
                            options={FUND_ADMIN_OPTIONS as unknown as {value: string; label: string}[]}
                            value={uploadFile.metadata.fund_admin}
                            onValueChange={(value: string) =>
                              updateFileMetadata(uploadFile.id, 'fund_admin', value as FundAdminOption)
                            }
                            placeholder="Please select"
                            searchPlaceholder="Search fund admins..."
                            allowClear={true}
                            emptyMessage="No fund admins found"
                            className={getDropdownClassName(uploadFile, 'fund_admin')}
                            data-testid="fund-admin-select"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="flex items-center gap-2 text-xs">
                            <Globe className="h-3 w-3" />
                            Jurisdiction
                          </Label>
                          <SearchableSelect
                            options={JURISDICTION_OPTIONS as unknown as {value: string; label: string}[]}
                            value={uploadFile.metadata.jurisdiction}
                            onValueChange={(value: string) =>
                              updateFileMetadata(uploadFile.id, 'jurisdiction', value as JurisdictionOption)
                            }
                            placeholder="Please select"
                            searchPlaceholder="Search jurisdictions..."
                            allowClear={true}
                            emptyMessage="No jurisdictions found"
                            className={getDropdownClassName(uploadFile, 'jurisdiction')}
                            data-testid="jurisdiction-select"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Progress Bar */}
                  {uploadFile.progress > 0 && (
                    <div className="w-full bg-gray-200 rounded-full h-1">
                      <div 
                        className="bg-blue-600 h-1 rounded-full transition-all"
                        style={{ width: `${uploadFile.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Button
              onClick={uploadFiles}
              disabled={!canUpload()}
              className="w-full"
              data-testid="upload-submit-button"
            >
              {files.some(f => f.status === 'uploading' || f.status === 'processing')
                ? 'Processing...'
                : canUpload()
                  ? `Upload ${files.filter(f => f.status === 'pending').length} Files`
                  : 'Add valid files to upload'
              }
            </Button>
            
          </div>
        )}
      </CardContent>
    </Card>
  )
}
