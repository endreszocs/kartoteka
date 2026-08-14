'use client'

import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getInventoryAmortizationCatalogEntry, type InventoryItem } from '@/lib/constants/inventory.next'
import { formatCurrency } from '@/lib/constants/finance'

interface InventoryAmortizationDialogProps {
  item: InventoryItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getAmortizationSnapshot(item: InventoryItem) {
  const purchaseValue = Number(item.beszerzes_erteke || 0) || 0
  const quantity = Number(item.mennyiseg || 1) || 1
  const usefulYears = Number(item.hasznalati_ido || 0) || 0
  const purchaseDate = item.beszerzes_datuma ? new Date(item.beszerzes_datuma.includes('T') ? item.beszerzes_datuma : `${item.beszerzes_datuma}T00:00:00`) : null

  if (!purchaseValue || !usefulYears || !purchaseDate || Number.isNaN(purchaseDate.getTime())) {
    return null
  }

  const now = new Date()
  const elapsedMonths = Math.max(
    0,
    (now.getFullYear() - purchaseDate.getFullYear()) * 12 + (now.getMonth() - purchaseDate.getMonth()),
  )
  const totalMonths = usefulYears * 12
  const monthlyDepreciation = purchaseValue / totalMonths
  const depreciatedAmount = Math.min(purchaseValue, elapsedMonths * monthlyDepreciation)
  const residualUnitValue = Math.max(0, purchaseValue - depreciatedAmount)

  return {
    elapsedMonths,
    totalMonths,
    monthlyDepreciation,
    depreciatedAmount,
    residualUnitValue,
    residualTotalValue: residualUnitValue * quantity,
    originalTotalValue: purchaseValue * quantity,
  }
}

export function InventoryAmortizationDialog({
  item,
  open,
  onOpenChange,
}: InventoryAmortizationDialogProps) {
  if (!item) return null

  const catalogEntry = getInventoryAmortizationCatalogEntry(item.katalogus_kod)
  const snapshot = getAmortizationSnapshot(item)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Amortizációs információk</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50/60 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-600">Alapeszköz</p>
                <h3 className="text-2xl font-semibold text-slate-900">{item.megnevezes}</h3>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <Badge variant="secondary">{item.leltari_szam || 'Nincs leltári szám'}</Badge>
                  <Badge variant="secondary">{item.helyszin || 'Nincs helyszín'}</Badge>
                  <Badge variant="secondary">{item.felelos_nev || 'Nincs felelős megadva'}</Badge>
                </div>
              </div>

              <div className="grid min-w-[220px] gap-3 sm:grid-cols-2">
                <InfoCard label="Beszerzési érték" value={`${formatCurrency(Number(item.beszerzes_erteke || 0))} RON`} />
                <InfoCard label="Mennyiség" value={`${item.mennyiseg || 1} ${item.mertekegyseg || 'db'}`} />
                <InfoCard label="Beszerzés dátuma" value={item.beszerzes_datuma || 'Nincs megadva'} />
                <InfoCard label="Használati idő" value={item.hasznalati_ido ? `${item.hasznalati_ido} év` : 'Nincs megadva'} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h4 className="text-lg font-semibold text-slate-900">Katalógus szerinti besorolás</h4>
                <p className="mt-1 text-sm text-slate-500">
                  A 2139/2004 jellegű amortizációs katalógus alapján rögzített hasznos idő és leírási információ.
                </p>
              </div>

              {catalogEntry ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">Katalóguskód</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">{catalogEntry.kod}</div>
                    <div className="mt-2 text-sm text-slate-700">{catalogEntry.nev}</div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <InfoCard label="Ajánlott minimum" value={`${catalogEntry.minEv} év`} />
                    <InfoCard label="Ajánlott maximum" value={`${catalogEntry.maxEv} év`} />
                    <InfoCard label="Alapértelmezett" value={`${catalogEntry.defEv} év`} />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Ennél az alapeszköznél még nincs kiválasztva katalóguskód. Ettől függetlenül kézi használati idővel már számolható az
                  amortizáció.
                </div>
              )}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h4 className="text-lg font-semibold text-slate-900">Értékcsökkenési összesítő</h4>
                <p className="mt-1 text-sm text-slate-500">
                  A rendszer a beszerzési értékből, a beszerzés dátumából és a használati időből számolja a maradványértéket.
                </p>
              </div>

              {snapshot ? (
                <div className="space-y-3">
                  <InfoCard label="Eltelt idő" value={`${snapshot.elapsedMonths} / ${snapshot.totalMonths} hónap`} />
                  <InfoCard label="Havi leírás" value={`${formatCurrency(snapshot.monthlyDepreciation)} RON / hó`} />
                  <InfoCard label="Elszámolt értékcsökkenés" value={`${formatCurrency(snapshot.depreciatedAmount * (item.mennyiseg || 1))} RON`} />
                  <InfoCard label="Maradványérték / darab" value={`${formatCurrency(snapshot.residualUnitValue)} RON`} />
                  <InfoCard label="Maradványérték összesen" value={`${formatCurrency(snapshot.residualTotalValue)} RON`} emphasis />
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  A részletes számításhoz szükség van beszerzési dátumra és használati időre. Ezeket az új vagy szerkesztett tételnél lehet
                  beállítani.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
            <h4 className="text-base font-semibold text-slate-900">Mit jelentenek ezek az adatok?</h4>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              <li>A katalóguskód a hivatalos amortizációs besorolást jelenti, és segít a helyes használati idő kiválasztásában.</li>
              <li>A havi leírás a beszerzési érték egyenletes havi elosztásából számolódik a teljes használati időre.</li>
              <li>A maradványérték az az összeg, amely a kiválasztott referencia-időpontban még a leltárban nyilvántartott értékként marad.</li>
              <li>Ha az eszköz teljesen leíródott, a rendszer a maradványértéket nullára állítja.</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InfoCard({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${emphasis ? 'border-emerald-200 bg-emerald-50/80' : 'border-slate-200 bg-white'}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</div>
      <div className={`mt-2 text-sm font-semibold ${emphasis ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</div>
    </div>
  )
}
