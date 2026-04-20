'use client'

/**
 * Oblio kiadás-bevezetés wizard.
 *
 * A felhasználó végigmegy az XML-eken, melyek nincsenek párosítva semmilyen
 * KARTOTEKA kiadással, és lépésről-lépésre **új kiadás-rekordokat hoz létre**
 * a beszállító adatai alapján. A bevezetés utáni párosítás automatikus.
 *
 * Sorrend: kronológiai (a legrégebbi XML van elöl).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  SkipForward,
  PlusCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { UblInvoiceMeta } from '@/lib/finance/oblio/ubl-parser'
import {
  createKiadasFromXmlAndMatch,
  getExpenseCategoriesForOblio,
  type ExpenseCategoryOption,
} from '@/app/(dashboard)/penzugy/oblio-ellenorzes-actions'

export type WizardXmlItem = {
  meta: UblInvoiceMeta
  fileName: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  xmls: WizardXmlItem[]
  onCompleted?: () => void | Promise<void>
}

export function OblioKiadasWizardDialog({ open, onOpenChange, xmls, onCompleted }: Props) {
  const [step, setStep] = useState(0)
  const [categories, setCategories] = useState<ExpenseCategoryOption[]>([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [saving, setSaving] = useState(false)
  // Per-XML state — kategória, megjegyzés, „skipped" jelzés
  const [perItem, setPerItem] = useState<
    Record<
      number,
      { idKiadascel: number | null; megjegyzes: string; status: 'pending' | 'done' | 'skipped' }
    >
  >({})
  const [categorySearch, setCategorySearch] = useState('')

  // Kronológiai rendezés
  const sortedXmls = useMemo(() => {
    return [...xmls].sort((a, b) => {
      const da = a.meta.issueDate || '9999-12-31'
      const db = b.meta.issueDate || '9999-12-31'
      return da.localeCompare(db)
    })
  }, [xmls])

  const total = sortedXmls.length
  const current = sortedXmls[step]

  // Kategóriák lekérdezés egyszer a megnyitáskor
  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setStep(0)
      setPerItem({})
      setCategorySearch('')
      setLoadingCats(true)
      getExpenseCategoriesForOblio()
        .then((res) => {
          if (cancelled) return
          if (res.data) setCategories(res.data)
          else if (res.error) toast.error(res.error)
        })
        .finally(() => {
          if (!cancelled) setLoadingCats(false)
        })
    })
    return () => { cancelled = true }
  }, [open])

  // Aktuális XML state-je
  const currentState = current ? perItem[step] : undefined
  const filteredCats = useMemo(() => {
    const q = categorySearch.trim().toLowerCase()
    if (!q) return categories
    return categories.filter(
      (c) => c.kod.toLowerCase().includes(q) || c.nev.toLowerCase().includes(q),
    )
  }, [categories, categorySearch])

  function updateCurrentItem(patch: Partial<{ idKiadascel: number | null; megjegyzes: string }>) {
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
      toast.error('Válassz egy költségvetési kategóriát.')
      return
    }
    if (!current.meta.anafUuid) {
      toast.error('Az XML-nek nincs ANAF UUID-ja — nem rögzíthető.')
      return
    }
    if (!current.meta.issueDate) {
      toast.error('Az XML-ben nincs kibocsátási dátum.')
      return
    }
    if (current.meta.amounts.brut === null) {
      toast.error('Az XML-ben nincs bruttó összeg.')
      return
    }

    setSaving(true)
    const res = await createKiadasFromXmlAndMatch({
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
      toast.error(res.error)
      return
    }
    if (res.error) toast.warning(res.error)
    toast.success(`Kiadás bevezetve: #${res.kiadasId}`)

    setPerItem((prev) => ({
      ...prev,
      [step]: { ...prev[step]!, status: 'done' },
    }))

    // Automatikusan ugorjunk a következőre
    if (step < total - 1) {
      setStep(step + 1)
    } else {
      // Befejeztük
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
    onOpenChange(false)
    const doneCount = Object.values(perItem).filter((s) => s.status === 'done').length
    const skippedCount = Object.values(perItem).filter((s) => s.status === 'skipped').length
    toast.success(
      `Wizard befejezve: ${doneCount} kiadás bevezetve, ${skippedCount} kihagyva.`,
    )
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100%-1.5rem)] sm:w-full
          sm:max-w-2xl md:max-w-3xl
          max-h-[96vh] overflow-y-auto
          border border-cyan-200 bg-gradient-to-br from-white via-white to-cyan-50/30
          p-0 gap-0 rounded-2xl
        "
      >
        <DialogHeader className="border-b border-cyan-100 bg-white/70 px-6 py-5 sm:px-8 sm:py-5 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm">
              <PlusCircle className="size-5" />
            </span>
            Kiadás-bevezetés wizard
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            Rendezett kronológiai sorrendben végighaladunk azokon az Oblio XML-eken,
            amelyek még nincsenek párosítva KARTOTEKA kiadással. Minden XML-hez
            válaszd ki a megfelelő költségvetési tételt — a rendszer létrehozza
            a kiadást és összerendeli az XML-lel.
          </DialogDescription>
          {/* Progressz bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>
                <strong>{step + 1}</strong> / {total}
              </span>
              <span>
                ✓ {Object.values(perItem).filter((s) => s.status === 'done').length} kész ·{' '}
                ⏭ {Object.values(perItem).filter((s) => s.status === 'skipped').length} kihagyva
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-teal-600 transition-all"
                style={{ width: `${total > 0 ? ((step + 1) / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 sm:px-8 sm:py-6 space-y-4">
          {!current ? (
            <div className="text-center py-8 text-sm text-slate-500">
              Nincs feldolgozandó XML.
            </div>
          ) : (
            <>
              {/* XML adatok kártya */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">
                  Befogadott számla — XML adatai
                </p>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <Field label="Beszállító" value={current.meta.supplier.name || '—'} />
                  <Field label="CUI" value={current.meta.supplier.cui || '—'} mono />
                  <Field label="Számlaszám" value={current.meta.invoiceNumber || '—'} mono />
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

              {/* Kategória választó */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="cat-search" className="text-xs font-medium text-slate-700">
                    Költségvetési kategória *
                  </label>
                  {/* Kiválasztott kategória élő kijelzés */}
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
                <Input
                  id="cat-search"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Keresés kód vagy név alapján..."
                  className="h-10"
                />
                <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  {loadingCats ? (
                    <div className="p-4 text-sm text-slate-500 text-center">
                      <Loader2 className="inline mr-2 size-4 animate-spin" /> Kategóriák betöltése…
                    </div>
                  ) : filteredCats.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500 text-center">
                      Nincs találat.
                    </div>
                  ) : (
                    filteredCats.map((cat) => {
                      // Number cast — biztos összehasonlítás
                      const selected = Number(currentState?.idKiadascel) === Number(cat.id)
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            updateCurrentItem({ idKiadascel: cat.id })
                          }}
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
                          <span className={selected ? 'text-emerald-900' : 'text-slate-800'}>
                            {cat.nev}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Megjegyzés */}
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Megjegyzés (opcionális)
                </span>
                <Textarea
                  value={currentState?.megjegyzes || ''}
                  onChange={(e) => updateCurrentItem({ megjegyzes: e.target.value })}
                  rows={2}
                  className="mt-1"
                  placeholder="Pl. Áprilisi villanyszámla..."
                />
              </label>

              {/* Akciók */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setStep(Math.max(0, step - 1))}
                  disabled={step === 0 || saving}
                >
                  <ChevronLeft className="mr-1 size-4" /> Vissza
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={handleSkip}
                  disabled={saving}
                >
                  <SkipForward className="mr-1 size-4" /> Kihagyás
                </Button>
                <div className="ml-auto flex gap-2">
                  <Button
                    className="rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 shadow-sm"
                    onClick={handleSaveCurrent}
                    disabled={saving || !currentState?.idKiadascel}
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
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
