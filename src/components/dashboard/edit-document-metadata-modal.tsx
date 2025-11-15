'use client'

import { useState, useEffect } from 'react'
import { DatabaseDocument as Document } from '@/types/external-apis'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Building, Users, Briefcase, Globe, Loader2 } from 'lucide-react'
import { clientLogger } from '@/lib/client-logger'
import { 
  LAW_FIRM_OPTIONS, 
  FUND_MANAGER_OPTIONS, 
  FUND_ADMIN_OPTIONS, 
  JURISDICTION_OPTIONS,
  type LawFirmOption,
  type FundManagerOption,
  type FundAdminOption,
  type JurisdictionOption
} from '@/lib/metadata-constants'

interface EditDocumentMetadataModalProps {
  document: Document | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (updatedDocument: Document) => void
}

interface EditableMetadata {
  law_firm: LawFirmOption | ''
  fund_manager: FundManagerOption | ''
  fund_admin: FundAdminOption | ''
  jurisdiction: JurisdictionOption | ''
}

const coerceMetadataValue = <T extends string>(value: unknown): T | '' => {
  return typeof value === 'string' && value.length > 0 ? (value as T) : ''
}

export function EditDocumentMetadataModal({ 
  document: currentDocument, 
  isOpen, 
  onClose, 
  onSuccess 
}: EditDocumentMetadataModalProps) {
  const [metadata, setMetadata] = useState<EditableMetadata>({
    law_firm: '',
    fund_manager: '',
    fund_admin: '',
    jurisdiction: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Initialize metadata when document changes
  useEffect(() => {
    if (currentDocument && isOpen) {
      setMetadata({
        law_firm: coerceMetadataValue<LawFirmOption>(currentDocument.metadata?.law_firm),
        fund_manager: coerceMetadataValue<FundManagerOption>(currentDocument.metadata?.fund_manager),
        fund_admin: coerceMetadataValue<FundAdminOption>(currentDocument.metadata?.fund_admin),
        jurisdiction: coerceMetadataValue<JurisdictionOption>(currentDocument.metadata?.jurisdiction)
      })
      setError('')
    }
  }, [currentDocument, isOpen])

  // Reset form when modal opens/closes or document changes
  const handleOpenChange = (open: boolean) => {
    if (open && currentDocument) {
      setMetadata({
        law_firm: coerceMetadataValue<LawFirmOption>(currentDocument.metadata?.law_firm),
        fund_manager: coerceMetadataValue<FundManagerOption>(currentDocument.metadata?.fund_manager),
        fund_admin: coerceMetadataValue<FundAdminOption>(currentDocument.metadata?.fund_admin),
        jurisdiction: coerceMetadataValue<JurisdictionOption>(currentDocument.metadata?.jurisdiction)
      })
      setError('')
    } else if (!open) {
      onClose()
      setError('')
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!currentDocument) return

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/documents/${currentDocument.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata: {
            ...currentDocument.metadata,
            law_firm: metadata.law_firm,
            fund_manager: metadata.fund_manager,
            fund_admin: metadata.fund_admin,
            jurisdiction: metadata.jurisdiction
          }
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update document')
      }

      const updatedDocument = await response.json()
      onSuccess(updatedDocument)
      onClose()
    } catch (error) {
      clientLogger.error(
        'Error updating document metadata',
        error instanceof Error ? error : new Error(String(error))
      )
      setError(error instanceof Error ? error.message : 'Failed to update document metadata')
    } finally {
      setIsLoading(false)
    }
  }

  if (!currentDocument) return null

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <form className="space-y-4">
        <DialogHeader>
          <DialogTitle>Edit Document Details</DialogTitle>
          <DialogDescription>
            Update the metadata for &quot;{currentDocument.title}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="law-firm" className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Law Firm
              </Label>
              <SearchableSelect
                options={LAW_FIRM_OPTIONS as unknown as {value: string; label: string}[]}
                value={metadata.law_firm}
                onValueChange={(value: string) =>
                  setMetadata(prev => ({ ...prev, law_firm: value as LawFirmOption }))
                }
                placeholder="Please select a law firm"
                searchPlaceholder="Search law firms..."
                allowClear={true}
                emptyMessage="No law firms found"
                disablePortal
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fund-manager" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Fund Manager
              </Label>
              <SearchableSelect
                options={FUND_MANAGER_OPTIONS as unknown as {value: string; label: string}[]}
                value={metadata.fund_manager}
                onValueChange={(value: string) =>
                  setMetadata(prev => ({ ...prev, fund_manager: value as FundManagerOption }))
                }
                placeholder="Please select a fund manager"
                searchPlaceholder="Search fund managers..."
                allowClear={true}
                emptyMessage="No fund managers found"
                disablePortal
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fund-admin" className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Fund Admin
              </Label>
              <SearchableSelect
                options={FUND_ADMIN_OPTIONS as unknown as {value: string; label: string}[]}
                value={metadata.fund_admin}
                onValueChange={(value: string) =>
                  setMetadata(prev => ({ ...prev, fund_admin: value as FundAdminOption }))
                }
                placeholder="Please select a fund admin"
                searchPlaceholder="Search fund admins..."
                allowClear={true}
                emptyMessage="No fund admins found"
                disablePortal
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jurisdiction" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Jurisdiction
              </Label>
              <SearchableSelect
                options={JURISDICTION_OPTIONS as unknown as {value: string; label: string}[]}
                value={metadata.jurisdiction}
                onValueChange={(value: string) =>
                  setMetadata(prev => ({ ...prev, jurisdiction: value as JurisdictionOption }))
                }
                placeholder="Please select a jurisdiction"
                searchPlaceholder="Search jurisdictions..."
                allowClear={true}
                emptyMessage="No jurisdictions found"
                disablePortal
              />
            </div>
          </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/50 p-3 rounded">
            {error}
          </div>
        )}

        <DialogFooter className="flex flex-col gap-3 pt-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading}
            className="flex-1 sm:flex-none"
          >
            {isLoading ? (
              <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
        </DialogFooter>
        </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
