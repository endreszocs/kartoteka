'use client'

/**
 * Oblio kiadás-bevezetés wizard TARTALMA
 * (Sprint Q F2.2, v0.7.8, 2026-04-26).
 *
 * A felhasználó végigmegy az XML-eken, melyek nincsenek párosítva semmilyen
 * KARTOTEKA kiadással, és lépésről-lépésre **új kiadás-rekordokat hoz létre**
 * a beszállító adatai alapján. A bevezetés utáni párosítás automatikus.
 * Sorrend: kronológiai (a legrégebbi XML van elöl).
 *
 * Body-pattern: a Dialog shell webnél marad. Server actionök
 * (`getExpenseCategoriesForOblio`, `createKiadasFromXmlAndMatch`) callback
 * prop-okon. Toast callback-en.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PlusCircle,
  SkipForward,
} from 'lucide-react'

import type { UblInvoiceMeta } from './ubl-parser'

export type OblioWizardToastKind = 'success' | 'error' | 'info' | 'warning'

export interface WizardXmlItem {
  meta: UblInvoiceMeta
  fileName: string
}

export interface ExpenseCategoryOption {
  id: number
  kod: string
  nev: string
}

export interface OblioCreateKiadasPayload {
  anafUuid: string
  supplierName: string | null
  supplierCui: string | null
  invoiceNumber: string | null
  invoiceDate: string
  invoiceAmount: number
  localFileRelpath: string | null
  idKiadascel: number
  megjegyzes: string | null
}

export interface OblioKiadasWizardDialogBodyProps {
  xmls: WizardXmlItem[]
  /** Kategóriák lekérdezése — a wrapper a `getExpenseCategoriesForOblio` server actiont hívja. */
  onLoadCategories: () => Promise<{
    data?: ExpenseCategoryOption[]
    error?: string | null
  }>
  /** Kiadás létrehozása + automatikus match — a wrapper a server actiont hívja. */
  onCreateKiadasFromXml: (
    payload: OblioCreateKiadasPayload,
  ) => Promise<{ success?: boolean; kiadasId?: number; error?: string | null }>
  /** UI-feedback. */
  onToast?: (msg: string, kind: OblioWizardToastKind) => void
  /** Befejezés callback (a wizard ablakot bezárja, parent reload). */
  onCompleted?: () => void | Promise<void>
  /** Bezárás. */
  onClose: () => void
  /** A dialog épp nyitva van-e (effect-trigger). */
  open: boolean
}

export function OblioKiadasWizardDialogBody({
  xmls,
  onLoadCategories,
  onCreateKiadasFromXml,
  onToast,
  onCompleted,
  onClose,
  open,
}: OblioKiadasWizardDialogBodyProps) {
  const [step, setStep] = useState(0)
  const [categories, setCategories] = useState<ExpenseCategoryOption[]>([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [saving, setSaving] = useState(false)
  const [perItem, setPerItem] = useState<
    Record<
      number,
      { idKiadascel: number | null; megjegyzes: string; status: 'pending' | 'done' | 'skipped' }
    >
  >({})
  const [categorySearch, setCategorySearch] = useState('')

  const sortedXmls = useMemo(() => {
    return [...xmls].sort((a, b) => {
      const da = a.meta.issueDate || '9999-12-31'
      const db = b.meta.issueDate || '9999-12-31'
      return da.localeCompare(db)
    })
  }, [xmls])

  const total = sortedXmls.length
  const current = sortedXmls[step]

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setStep(0)
      setPerItem({})
      setCategorySearch('')
      setLoadingCats(true)
      onLoadCategories()
        .then((res) => {
          if (cancelled) return
          if (res.data) setCategories(res.data)
          else if (res.error) onToast?.(res.error, 'error')
        })
        .finally(() => {
          if (!cancelled) setLoadingCats(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [open, onLoadCategories, onToast])

  const currentState = current ? perItem[step] : undefined
  const filteredCats = useMemo(() => {
    const q = categorySearch.trim().toLowerCase()
    if (!q) return categories
    return categories.filter(
      (c) => c.kod.toLowerCase().includes(q) || c.nev.toLowerCase().includes(q),
    )
  }, [categories, categorySearch])

  function updateCurrentItem(
    patch: Partial<{ idKiadascel: number | null; megjegyzes: string }>,
  ) {
    setPerItem((prev) => ({
      ...prev,
      [step]: {
        idKiadascel: prev[step]?.idKiadascel ?? null,
        megjegyzes: prev[step]?.megjegyzes ?? '',
        status: prev[step]?.status ?? 'pending',
        ...patch,
      },
    }))
  }

  async function handleSaveCurrent() {
    if (!current) return
    const state = perItem[step]
    if (!state?.idKiadascel) {
      onToast?.('Válassz egy költségvetési kategóriát.', 'error')
      return
    }
    if (!current.meta.anafUuid) {
      onToast?.('Az XML-nek nincs ANAF UUID-ja — nem rögzíthető.', 'error')
      return
    }
    if (!current.meta.issueDate) {
      onToast?.('Az XML-ben nincs kibocsátási dátum.', 'error')
      return
    }
    if (current.meta.amounts.brut === null) {
      onToast?.('Az XML-ben nincs bruttó összeg.', 'error')
      return
    }

    setSaving(true)
    const res = await onCreateKiadasFromXml({
      anafUuid: current.meta.anafUuid,
      supplierName: current.meta.supplier.name,
      supplierCui: current.meta.supplier.cui,
      invoiceNumber: current.meta.invoiceNumber,
      invoiceDate: current.meta.issueDate,
      invoiceAmount: current.meta.amounts.brut,
      localFileRelpath: current.fileName,
      idKiadascel: state.idKiadascel,
      megjegyzes: state.megjegyzes || null,
    })
    setSaving(false)

    if (res.error && !res.success) {
      onToast?.(res.error, 'error')
      return
    }
    if (res.error) onToast?.(res.error, 'warning')
    onToast?.(`Kiadás bevezetve: #${res.kiadasId}`, 'success')

    setPerItem((prev) => ({
      ...prev,
      [step]: { ...prev[step]!, status: 'done' },
    }))

    if (step < total - 1) {
      setStep(step + 1)
    } else {
      handleFinish()
    }
  }

  function handleSkip() {
    setPerItem((prev) => ({
      ...prev,
      [step]: {
        idKiadascel: prev[step]?.idKiadascel ?? null,
        megjegyzes: prev[step]?.megjegyzes ?? '',
        status: 'skipped',
      },
    }))
    if (step < total - 1) setStep(step + 1)
    else handleFinish()
  }

  async function handleFinish() {
    if (onCompleted) await onCompleted()
    onClose()
    const doneCount = Object.values(perItem).filter((s) => s.status === 'done').length
    const skippedCount = Object.values(perItem).filter((s) => s.status === 'skipped').length
    onToast?.(
      `Wizard befejezve: ${doneCount} kiadás bevezetve, ${skippedCount} kihagyva.`,
      'success',
    )
  }

  return (
    <>
      {/* Header */}
      <div className="border-b border-cyan-100 bg-white/70 px-6 py-5 sm:px-8 sm:py-5">
        <h2 className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm">
            <PlusCircle className="size-5" />
          </span>
          Kiadás-bevezetés wizard
        </h2>
        <p className="text-sm leading-6 text-slate-600 mt-2">
          Rendezett kronológiai sorrendben végighaladunk azokon az Oblio XML-eken,
          amelyek még nincsenek párosítva KARTOTEKA kiadással. Minden XML-hez válaszd ki a
          megfelelő költségvetési tételt — a rendszer létrehozza a kiadást és összerendeli
          az XML-lel.
        </p>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>
              <strong>{step + 1}</strong> / {total}
            </span>
            <span>
              ✓ {Object.values(perItem).filter((s) => s.status === 'done').length} kész ·
              ⏭ {Object.values(perItem).filter((s) => s.status === 'skipped').length}{' '}
              kihagyva
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-teal-600 transition-all"
              style={{ width: `${total > 0 ? ((step + 1) / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-5 sm:px-8 sm:py-6 space-y-4">
        {!current ? (
          <div className="text-center py-8 text-sm text-slate-500">
            Nincs feldolgozandó XML.
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">
                Befogadott számla — XML adatai
              </p>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <Field label="Beszállító" value={current.meta.supplier.name || '—'} />
                <Field label="CUI" value={current.meta.supplier.cui || '—'} mono />
                <Field
                  label="Számlaszám"
                  value={current.meta.invoiceNumber || '—'}
                  mono
                />
                <Field label="Kibocsátás" value={current.meta.issueDate || '—'} />
                <Field
                  label="Bruttó"
                  value={
                    current.meta.amounts.brut !== null
                      ? `${current.meta.amounts.brut.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} ${current.meta.currency || 'RON'}`
                      : '—'
                  }
                />
                <Field label="ANAF UUID" value={current.meta.anafUuid || '—'} mono />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="cat-search" className="text-xs font-medium text-slate-700">
                  Költségvetési kategória *
                </label>
                {currentState?.idKiadascel != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-xs font-semibold">
                    <CheckCircle2 className="size-3" />
                    Kiválasztva:{' '}
                    {(() => {
                      const cat = categories.find((c) => c.id === currentState.idKiadascel)
                      return cat ? `${cat.kod} — ${cat.nev}` : '—'
                    })()}
                  </span>
                )}
              </div>
              <input
                id="cat-search"
                type="text"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Keresés kód vagy név alapján..."
                className="w-full h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                {loadingCats ? (
                  <div className="p-4 text-sm text-slate-500 text-center">
                    <Loader2 className="inline mr-2 size-4 animate-spin" /> Kategóriák
                    betöltése…
                  </div>
                ) : filteredCats.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 text-center">
                    Nincs találat.
                  </div>
                ) : (
                  filteredCats.map((cat) => {
                    const selected = Number(currentState?.idKiadascel) === Number(cat.id)
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => updateCurrentItem({ idKiadascel: cat.id })}
                        className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 text-sm transition-colors flex items-center gap-2 ${
                          selected
                            ? 'bg-emerald-50 border-l-4 border-l-emerald-500 font-semibold'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        {selected ? (
                          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                        ) : (
                          <span className="size-4 shrink-0" />
                        )}
                        <span className="font-mono text-xs text-slate-500">{cat.kod}</span>
                        <span
                          className={selected ? 'text-emerald-900' : 'text-slate-800'}
                        >
                          {cat.nev}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                Megjegyzés (opcionális)
              </span>
              <textarea
                value={currentState?.megjegyzes || ''}
                onChange={(e) => updateCurrentItem({ megjegyzes: e.target.value })}
                rows={2}
                placeholder="Pl. Áprilisi villanyszámla..."
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0 || saving}
                className="inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium border bg-white rounded-xl transition-colors disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-50"
              >
                <ChevronLeft className="mr-1 size-4" /> Vissza
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={saving}
                className="inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium border bg-white rounded-xl transition-colors disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-50"
              >
                <SkipForward className="mr-1 size-4" /> Kihagyás
              </button>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveCurrent}
                  disabled={saving || !currentState?.idKiadascel}
                  className="inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 transition-colors disabled:pointer-events-none disabled:opacity-50 shadow-sm"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" /> Mentés…
                    </>
                  ) : step === total - 1 ? (
                    <>
                      <CheckCircle2 className="mr-1.5 size-4" /> Mentés és befejezés
                    </>
                  ) : (
                    <>
                      Mentés és tovább <ChevronRight className="ml-1 size-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-slate-800 ${mono ? 'font-mono text-xs' : 'text-sm'} break-all`}>
        {value}
      </span>
    </div>
  )
}
