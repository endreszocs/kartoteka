'use client'

/**
 * Oblio ellenőrzés — kézi párosítás dialog TARTALMA
 * (Sprint Q F2.2, v0.7.8, 2026-04-26).
 *
 * Egy XML-t kézzel hozzárendel egy meglévő `kiadas` rekordhoz.
 * A jelölteket összeg + dátum közelség alapján ajánljuk fel,
 * a felhasználó kereshet is név/iratszám szerint.
 *
 * Body-pattern: a Dialog shell (shadcn-radix DialogContent + Header)
 * a webes wrapper-ben marad. Ez a komponens csak a tartalmat (XML
 * részletek + kereső + jelölt-lista + mentés gomb) tartalmazza.
 *
 * Pure UI: csak react + lucide-react. Server action (`saveOblioMatch`)
 * callback prop-on (`onSaveMatch`). Toast callback-en (`onToast`).
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Link as LinkIcon } from 'lucide-react'

import type { UblInvoiceMeta } from './ubl-parser'

export type OblioManualMatchToastKind = 'success' | 'error' | 'info' | 'warning'

/**
 * A kiadás-jelöltek minimális típusa — kompatibilis a webes
 * `OblioMinimalKiadas`-szal (a server action visszatérési típusával).
 */
export interface OblioManualMatchKiadas {
  id: number
  datum: string
  osszeg: number
  kedvezmenyzett?: string | null
  atvevo?: string | null
  iratszam?: string | null
  kedvezmenyezett_cui?: string | null
}

export interface OblioManualMatchSavePayload {
  kiadasId: number
  anafUuid: string
  supplierCui: string | null
  supplierName: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  invoiceAmount: number | null
  localFileRelpath: string | null
  method: 'manual'
  confidence: 'high'
  syncCuiToKiadas: boolean
}

export interface OblioManualMatchDialogBodyProps {
  /** Az XML, amelyhez kiadást keresünk. */
  xml: UblInvoiceMeta | null
  /** A fájl helyi relatív útvonala. */
  fileRelpath: string | null
  /** Lehetséges kiadás-jelöltek (a teljes éves lista). */
  kiadasok: OblioManualMatchKiadas[]
  /**
   * Sikeres mentés callback. A wrapper a `saveOblioMatch` server actiont
   * hívja a payload-dal. iOS-en külön implementációval cserélhető.
   */
  onSaveMatch: (
    payload: OblioManualMatchSavePayload,
  ) => Promise<{ success?: boolean; error?: string | null }>
  /** UI-feedback. */
  onToast?: (msg: string, kind: OblioManualMatchToastKind) => void
  /** Sikeres mentés után parent reload. */
  onSaved?: () => void | Promise<void>
  /** Bezárás. */
  onClose: () => void
  /** A dialog épp nyitva van-e (effect-trigger-hez). */
  open: boolean
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Number.POSITIVE_INFINITY
  return Math.abs(Math.round((da - db) / 86_400_000))
}

export function OblioManualMatchDialogBody({
  xml,
  fileRelpath,
  kiadasok,
  onSaveMatch,
  onToast,
  onSaved,
  onClose,
  open,
}: OblioManualMatchDialogBodyProps) {
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
    return () => {
      cancelled = true
    }
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
        const matchesSearch =
          !q || partner.includes(q) || (k.iratszam || '').toLowerCase().includes(q)
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
      onToast?.('Válassz egy kiadást a párosításhoz.', 'error')
      return
    }
    setSaving(true)
    const res = await onSaveMatch({
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
      onToast?.(res.error, 'error')
      return
    }
    onToast?.('Párosítás mentve.', 'success')
    if (onSaved) await onSaved()
    onClose()
  }

  return (
    <>
      {/* Header — DialogTitle a wrapper-ben, ez csak a header tartalom */}
      <div className="border-b border-cyan-100 bg-white/70 px-6 py-5 sm:px-8 sm:py-6">
        <h2 className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm">
            <LinkIcon className="size-5" />
          </span>
          Kézi párosítás
        </h2>
        <p className="text-sm leading-6 text-slate-600 mt-2">
          Rendeld hozzá a befogadott e-Factura XML-t egy KARTOTEKA kiadás-rekordhoz. A
          párosítás után a kiadás CUI mezőjét is feltöltjük az XML alapján.
        </p>
      </div>

      <div className="px-6 py-5 sm:px-8 sm:py-6 space-y-4">
        {/* XML adatok megerősítés */}
        {xml && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
              Befogadott számla
            </p>
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
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kereső: partner név vagy iratszám..."
            className="w-full pl-10 h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* Jelöltek */}
        <div className="space-y-1 max-h-[300px] overflow-y-auto rounded-xl border border-slate-200">
          {ranked.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              Nincs találat. Próbálj más kereső kifejezést, vagy{' '}
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
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !selectedKiadasId}
            className="inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 transition-colors disabled:pointer-events-none disabled:opacity-50 shadow-sm"
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" /> Mentés…
              </>
            ) : (
              'Párosítás mentése'
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium border bg-white rounded-xl transition-colors hover:bg-slate-50"
          >
            Mégse
          </button>
        </div>
      </div>
    </>
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
