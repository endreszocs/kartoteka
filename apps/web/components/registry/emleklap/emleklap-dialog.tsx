'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CertificateGenerator } from './certificate-generator'
import type { EmleklapType } from '@/lib/constants/emleklap-templates'

interface EmleklapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialType?: EmleklapType
  initialVariant?: 'erek' | 'kerek'
  initialData?: Record<string, string | undefined>
}

export function EmleklapDialog({
  open,
  onOpenChange,
  initialType,
  initialVariant,
  initialData,
}: EmleklapDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anyakönyvi emléklap-stúdió</DialogTitle>
        </DialogHeader>
        <CertificateGenerator
          initialType={initialType}
          initialVariant={initialVariant}
          initialData={initialData}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
