import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { DatabaseDocument as AppDocument } from '@/types/external-apis'
import { DashboardLayout } from '@/components/dashboard/layout'
import { SelectedSearchInterface } from '@/components/similarity/selected-search-interface'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft,
  FileText,
  Users,
  Target,
  Scale,
  UserCircle,
  ClipboardList,
  Globe
} from 'lucide-react'
import { formatUploadDate } from '@/lib/date-utils'
import {
  LAW_FIRM_OPTIONS,
  FUND_MANAGER_OPTIONS,
  FUND_ADMIN_OPTIONS,
  JURISDICTION_OPTIONS
} from '@/lib/metadata-constants'
import { SourceDocumentActions } from '@/components/similarity/source-document-actions'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

type MetadataOption = { value: string; label: string }

const resolveOptionLabel = (value: unknown, options: ReadonlyArray<MetadataOption>): string => {
  if (typeof value !== 'string' || value.length === 0) {
    return value ? String(value) : ''
  }
  return options.find(opt => opt.value === value)?.label ?? value
}

const formatFileSize = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export default async function SelectedSearchPage({ searchParams }: PageProps) {
  const params = await searchParams
  const idsParam = typeof params['ids'] === 'string' ? params['ids'] : undefined
  
  // New logic: derive source and targets from a single 'ids' parameter
  let sourceId: string | undefined = undefined
  let targetIds: string[] = []

  if (idsParam) {
    const allIds = idsParam.split(',')
    if (allIds.length > 0) {
      sourceId = allIds[0] // First document is the source
    }
    if (allIds.length > 1) {
      targetIds = allIds.slice(1) // The rest are targets
    }
  }
  
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch the source document if provided
  let sourceDocument: AppDocument | null = null
  if (sourceId) {
    const { data: document, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', sourceId)
      .eq('user_id', user.id)
      .single<AppDocument>()

    if (!error && document?.status === 'completed') {
      sourceDocument = document
    }
  }

  // If we have both source and targets, show auto-search results
  // Otherwise, show the selection interface
  const shouldAutoSearch = sourceDocument && targetIds.length > 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div className="h-6 border-l border-gray-300 dark:border-gray-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="h-6 w-6 text-emerald-500" />
                Selected Search
              </h1>
            </div>
          </div>
        </div>

        {/* Source Document Card */}
        {sourceDocument && (
          <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
                <Target className="h-5 w-5" />
                Source Document
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                    <FileText className="h-6 w-6 text-emerald-600 dark:text-emerald-300" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {sourceDocument.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatFileSize(sourceDocument.file_size)}</span>
                      <span>{formatUploadDate(sourceDocument.created_at)}</span>
                      {sourceDocument.page_count && (
                        <span>{sourceDocument.page_count === 1 ? '1 page' : `${sourceDocument.page_count} pages`}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <div className="flex items-center gap-1">
                        <Scale className="h-3 w-3 text-gray-400" />
                        {sourceDocument.metadata?.law_firm ? (
                          <span className="text-gray-600 dark:text-gray-300">{resolveOptionLabel(sourceDocument.metadata?.law_firm, LAW_FIRM_OPTIONS)}</span>
                        ) : (
                          <span className="text-orange-500 dark:text-orange-400">(blank)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <UserCircle className="h-3 w-3 text-gray-400" />
                        {sourceDocument.metadata?.fund_manager ? (
                          <span className="text-gray-600 dark:text-gray-300">{resolveOptionLabel(sourceDocument.metadata?.fund_manager, FUND_MANAGER_OPTIONS)}</span>
                        ) : (
                          <span className="text-orange-500 dark:text-orange-400">(blank)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <ClipboardList className="h-3 w-3 text-gray-400" />
                        {sourceDocument.metadata?.fund_admin ? (
                          <span className="text-gray-600 dark:text-gray-300">{resolveOptionLabel(sourceDocument.metadata?.fund_admin, FUND_ADMIN_OPTIONS)}</span>
                        ) : (
                          <span className="text-orange-500 dark:text-orange-400">(blank)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Globe className="h-3 w-3 text-gray-400" />
                        {sourceDocument.metadata?.jurisdiction ? (
                          <span className="text-gray-600 dark:text-gray-300">{resolveOptionLabel(sourceDocument.metadata?.jurisdiction, JURISDICTION_OPTIONS)}</span>
                        ) : (
                          <span className="text-orange-500 dark:text-orange-400">(blank)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <SourceDocumentActions document={sourceDocument} accent="emerald" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search Interface and Results */}
        <SelectedSearchInterface 
          sourceDocument={sourceDocument} 
          autoSearchTargets={shouldAutoSearch ? targetIds : []}
        />
      </div>
    </DashboardLayout>
  )
}
