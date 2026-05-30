'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CertificateGenerator } from './certificate-generator'
import type { EmleklapType } from '@/lib/constants/emleklap-templates'

interface EmleklapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialType?: EmleklapType
  initialVariant?: 'erek' | 'kerek' | 'kek' | 'hagyomanyos'
  initialData?: Record<string, string | undefined>
  /** Ha true, a stúdió ahhoz a sablon-típushoz van rögzítve, amivel megnyílt
   *  (a típus-választó eltűnik). Defaults to true — a dialog mindig egy konkrét
   *  anyakönyvi kontextusból nyílik. A keresztelés tabról nyitva csak
   *  keresztelő látszik, konfirmáció tabról csak konfirmáció, stb. */
  lockType?: boolean
}

export function EmleklapDialog({
  open,
  onOpenChange,
  initialType,
  initialVariant,
  initialData,
  lockType = true,
}: EmleklapDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* sm:max-w-6xl felülírja a Dialog komponens default sm:max-w-sm beállítását */}
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anyakönyvi emléklap-stúdió</DialogTitle>
        </DialogHeader>
        <CertificateGenerator
          initialType={initialType}
          initialVariant={initialVariant}
          initialData={initialData}
          onClose={() => onOpenChange(false)}
          lockType={lockType}
        />
      </DialogContent>
    </Dialog>
  )
}
