'use client'

/**
 * Egyházmegyei dashboard — gyülekezet drill-down modal.
 * Kattintásra a gyülekezet kártyájáról nyílik meg, és összesített képet ad
 * a tagokról, dokumentumokról, kérelmekről, pénzügyi-misszói státuszról.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  Building2,
  FileCheck,
  HandHeart,
  ShieldCheck,
  Vote,
} from 'lucide-react'
import type { UnlockRequest } from '@/lib/constants/documents'

export interface CongregationDetail {
  congregationId: string
  congregationName: string
  documentCount: number
  pendingDocuments: number
  unlockRequests: UnlockRequest[]
  /** Választók száma — csak ha a gyülekezet leadta a választók névjegyzékét */
  voterCount: number | null
}

interface CongregationDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregation: CongregationDetail | null
  /** Master vagy admin felhasználó esetén megjelenik az "Admin Override" gomb */
  canOverride: boolean
}

const TYPE_LABELS: Record<string, string> = {
  budget: 'Költségvetés',
  accounting: 'Számadás',
  inventory: 'Vagyonleltár',
}

export function CongregationDetailModal({
  open,
  onOpenChange,
  congregation,
  canOverride,
}: CongregationDetailModalProps) {
  if (!congregation) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="border-b border-violet-100 bg-gradient-to-br from-violet-50 to-white px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-violet-100 p-2.5">
              <Building2 className="size-5 text-violet-700" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="font-heading text-2xl text-slate-800">
                {congregation.congregationName}
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-500">
                Gyülekezeti összesítő — aktuális év
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* KPI sor — CSAK az egyházmegye számára engedélyezett, összesített adatok */}
          <div className="grid grid-cols-3 gap-3">
            <DetailKpi
              icon={<FileCheck className="size-4 text-sky-600" />}
              label="Beküldött dok."
              value={`${congregation.documentCount}`}
              hint={congregation.pendingDocuments > 0 ? `${congregation.pendingDocuments} függő` : 'mind kész'}
              tone="sky"
            />
            <DetailKpi
              icon={<AlertTriangle className="size-4 text-amber-600" />}
              label="Kérelem"
              value={`${congregation.unlockRequests.length}`}
              hint={congregation.unlockRequests.length === 0 ? 'nincs új' : 'bírálatra'}
              tone={congregation.unlockRequests.length > 0 ? 'amber' : 'slate'}
            />
            <DetailKpi
              icon={<Vote className="size-4 text-violet-600" />}
              label="Választó"
              value={congregation.voterCount === null ? '—' : congregation.voterCount.toLocaleString('hu-HU')}
              hint={congregation.voterCount === null ? 'névjegyzék nincs leadva' : 'leadva'}
              tone={congregation.voterCount === null ? 'slate' : 'violet'}
            />
          </div>

          {/* Aktív kérelmek listája */}
          {congregation.unlockRequests.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">
                Bírálatra váró javítási kérelmek
              </h3>
              <ul className="space-y-1.5">
                {congregation.unlockRequests.map((r) => (
                  <li key={`${r.year}-${r.type}`} className="text-sm text-amber-900 flex items-baseline gap-2">
                    <Badge variant="outline" className="border-amber-300 text-amber-700 bg-white">
                      {TYPE_LABELS[r.type] || r.type}
                    </Badge>
                    <span className="text-xs text-amber-700/80">{r.year}.</span>
                    {r.reason && <span className="text-amber-900/80">— {r.reason}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-700">
                A bírálatot a Kérelmek fülön végezheti el.
              </p>
            </section>
          )}

          {/* Gyülekezeti autonómia tájékoztató — engedély nélkül NEM látható részletes adat */}
          <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-start gap-3">
              <HandHeart className="size-5 text-slate-500 mt-0.5" />
              <div className="text-sm text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-700 mb-1">A gyülekezet autonómiája védett</p>
                <p>
                  Az egyházmegye CSAK a kötelezően leadott évi dokumentumokat (költségvetés,
                  számadás, vagyonleltár, választók névjegyzéke) láthatja, részletes
                  pénzügyi és tagnyilvántartási adatokat nem. A gyülekezet adatvédelmét
                  a lelkész és a presbitérium felügyeli.
                </p>
              </div>
            </div>
          </section>

          {canOverride && (
            <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="size-5 text-indigo-600 mt-0.5" />
                <div className="text-sm text-slate-700 leading-relaxed">
                  <p className="font-semibold text-indigo-800 mb-1">Rendszergazdai betekintés</p>
                  <p className="text-slate-600">
                    Ön rendszergazdai jogosultsággal rendelkezik. Az „Admin Override” kéréssel
                    a gyülekezet teljes nézetébe beléphet — de a lelkész jóváhagyását kell kérnie,
                    és minden hozzáférés időkorlátos és naplózott.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Bezárás
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailKpi({
  icon,
  label,
  value,
  hint,
  tone = 'slate',
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone?: 'emerald' | 'sky' | 'amber' | 'slate' | 'violet'
}) {
  const toneClasses: Record<string, string> = {
    emerald: 'border-emerald-200 bg-emerald-50/60',
    sky: 'border-sky-200 bg-sky-50/60',
    amber: 'border-amber-200 bg-amber-50/60',
    slate: 'border-slate-200 bg-slate-50/60',
    violet: 'border-violet-200 bg-violet-50/60',
  }
  return (
    <div className={`rounded-xl border p-3 ${toneClasses[tone]}`}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-bold text-slate-800 leading-tight">{value}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  )
}
