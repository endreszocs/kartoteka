'use client'

/**
 * Oblio ellenőrzés — kézi párosítás dialog.
 *
 * Egy XML-t kézzel hozzárendel egy meglévő `kiadas` rekordhoz.
 * A jelölteket összeg + dátum közelség alapján ajánljuk fel,
 * a felhasználó kereshet is név/iratszám szerint.
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Link as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveOblioMatch, type OblioMinimalKiadas } from '@/app/(dashboard)/penzugy/oblio-ellenorzes-actions'
import type { UblInvoiceMeta } from '@/lib/finance/oblio/ubl-parser'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Az XML, amelyhez kiadást keresünk. */
  xml: UblInvoiceMeta | null
  /** A fájl helyi relatív útvonala. */
  fileRelpath: string | null
  /** Lehetséges kiadás-jelöltek (a teljes éves lista). */
  kiadasok: OblioMinimalKiadas[]
  onSaved?: () => void | Promise<void>
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Number.POSITIVE_INFINITY
  return Math.abs(Math.round((da - db) / 86_400_000))
}

export function OblioManualMatchDialog({ open, onOpenChange, xml, fileRelpath, kiadasok, onSaved }: Props) {
  const [search, setSearch] = useState('')
  const [selectedKiadasId, setSelectedKiadasId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setSearch('')
      setSelectedKiadasId(null)
    })
    return () => { cancelled = true }
  }, [open])

  // A jelölteket pontozzuk: legfontosabb a dátum + összeg közelség
  const ranked = useMemo(() => {
    if (!xml) return []
    const xmlDate = xml.issueDate
    const xmlAmount = xml.amounts.brut
    const q = search.trim().toLowerCase()

    return kiadasok
      .map((k) => {
        const partner = (k.kedvezmenyzett || k.atvevo || '').toLowerCase()
        const matchesSearch = !q || partner.includes(q) || (k.iratszam || '').toLowerCase().includes(q)
        if (!matchesSearch) return null

        let score = 0
        let amountDelta: number | null = null
        let dateDelta: number | null = null
        if (xmlAmount !== null) {
          amountDelta = Math.abs(k.osszeg - xmlAmount)
          score += amountDelta < 0.5 ? 50 : amountDelta < 5 ? 20 : amountDelta < 50 ? 5 : 0
        }
        if (xmlDate) {
          dateDelta = daysBetween(k.datum, xmlDate)
          score += dateDelta <= 1 ? 30 : dateDelta <= 5 ? 15 : dateDelta <= 14 ? 5 : 0
        }
        return { k, amountDelta, dateDelta, score }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
  }, [xml, kiadasok, search])

  async function handleSave() {
    if (!xml || !xml.anafUuid || !selectedKiadasId) {
      toast.error('Válassz egy kiadást a párosításhoz.')
      return
    }
    setSaving(true)
    const res = await saveOblioMatch({
      kiadasId: selectedKiadasId,
      anafUuid: xml.anafUuid,
      supplierCui: xml.supplier.cui,
      supplierName: xml.supplier.name,
      invoiceNumber: xml.invoiceNumber,
      invoiceDate: xml.issueDate,
      invoiceAmount: xml.amounts.brut,
      localFileRelpath: fileRelpath,
      method: 'manual',
      confidence: 'high',
      syncCuiToKiadas: true,
    })
    setSaving(false)

    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Párosítás mentve.')
    if (onSaved) await onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100%-1.5rem)] sm:w-full
          sm:max-w-2xl md:max-w-3xl
          max-h-[90vh] overflow-y-auto
          border border-cyan-200 bg-gradient-to-br from-white via-white to-cyan-50/30
          p-0 gap-0 rounded-2xl
        "
      >
        <DialogHeader className="border-b border-cyan-100 bg-white/70 px-6 py-5 sm:px-8 sm:py-6 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm">
              <LinkIcon className="size-5" />
            </span>
            Kézi párosítás
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            Rendeld hozzá a befogadott e-Factura XML-t egy KARTOTEKA kiadás-rekordhoz.
            A párosítás után a kiadás CUI mezőjét is feltöltjük az XML alapján.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 sm:px-8 sm:py-6 space-y-4">
          {/* XML adatok megerősítés */}
          {xml && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Befogadott számla</p>
              <div className="grid sm:grid-cols-2 gap-2">
                <Row label="Beszállító" value={xml.supplier.name || '—'} />
                <Row label="CUI" value={xml.supplier.cui || '—'} mono />
                <Row label="Számlaszám" value={xml.invoiceNumber || '—'} mono />
                <Row label="Kibocsátás" value={xml.issueDate || '—'} />
                <Row
                  label="Bruttó összeg"
                  value={
                    xml.amounts.brut !== null
                      ? `${xml.amounts.brut.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} ${xml.currency || 'RON'}`
                      : '—'
                  }
                />
                <Row label="ANAF UUID" value={xml.anafUuid || '—'} mono />
              </div>
            </div>
          )}

          {/* Kereső */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kereső: partner név vagy iratszám..."
              className="pl-10 h-10"
            />
          </div>

          {/* Jelöltek */}
          <div className="space-y-1 max-h-[300px] overflow-y-auto rounded-xl border border-slate-200">
            {ranked.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">
                Nincs találat. Próbálj más kereső kifejezést, vagy {' '}
                <strong>először rögzítsd a kiadást</strong> a Pénzügy → Kiadás menüben.
              </div>
            ) : (
              ranked.map(({ k, amountDelta, dateDelta, score }) => {
                const selected = selectedKiadasId === k.id
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setSelectedKiadasId(k.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm border-b border-slate-100 last:border-0 transition-colors ${
                      selected
                        ? 'bg-cyan-50 ring-2 ring-cyan-300 ring-inset'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {k.kedvezmenyzett || k.atvevo || '—'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {k.datum.slice(0, 10)} · {k.iratszam || 'nincs irat'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-slate-800">
                        {k.osszeg.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} RON
                      </p>
                      <div className="flex gap-1 justify-end items-center text-[10px] text-slate-400">
                        {amountDelta !== null && (
                          <span className={amountDelta < 0.5 ? 'text-emerald-600' : ''}>
                            ±{amountDelta.toFixed(2)} RON
                          </span>
                        )}
                        {dateDelta !== null && (
                          <span className={dateDelta <= 1 ? 'text-emerald-600' : ''}>
                            ±{dateDelta} nap
                          </span>
                        )}
                        {score > 50 && (
                          <span className="rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 font-semibold">
                            jó találat
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Mentés gomb */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            <Button
              className="rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 shadow-sm"
              onClick={handleSave}
              disabled={saving || !selectedKiadasId}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" /> Mentés…
                </>
              ) : (
                'Párosítás mentése'
              )}
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Mégse
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-slate-800 ${mono ? 'font-mono text-xs' : 'text-sm'} break-all`}>
        {value}
      </span>
    </div>
  )
}
