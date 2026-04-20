'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, sortCellsHierarchically } from '@/lib/constants/finance'
import { finalizeBudget, requestBudgetUnlock, finalizeBudgetModification } from '@/app/(dashboard)/penzugy/actions'
import { submitDocument } from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
import { loadBudgetRowsCompat, saveBudgetRowsCompat, saveBudgetModification } from '@/lib/finance/budget-compat'
import type { SzamadasiCel, BealitasRow } from '@/lib/constants/finance'
import type { BudgetCompatRow } from '@/lib/finance/budget-compat'
import type { DocumentType } from '@/lib/constants/documents'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ArrowDownCircle, ArrowUpCircle, Scale, Lock, Check } from 'lucide-react'

interface BudgetTabProps {
  szamadasiCellek: SzamadasiCel[]
  settings: BealitasRow
  currentYear: number
}

type BudgetMode = 'base' | 'mod1' | 'mod2' | 'mod3'

const MODE_LABELS: Record<BudgetMode, string> = {
  base: 'Alap költségvetés',
  mod1: '1. módosítás',
  mod2: '2. módosítás',
  mod3: '3. módosítás',
}

export function BudgetTab({ szamadasiCellek, settings, currentYear }: BudgetTabProps) {
  const router = useRouter()
  const [budgetData, setBudgetData] = useState<Record<string, BudgetCompatRow>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<BudgetMode>('base')

  const isBaseFinalized = settings.budget_finalized
  const isMod1Finalized = settings.budget_mod1_finalized ?? false
  const isMod2Finalized = settings.budget_mod2_finalized ?? false
  const isMod3Finalized = settings.budget_mod3_finalized ?? false

  // Aktuális mód szerkeszthető-e
  const canEditBase = !isBaseFinalized
  const canEditMod1 = isBaseFinalized && !isMod1Finalized
  const canEditMod2 = isBaseFinalized && isMod1Finalized && !isMod2Finalized
  const canEditMod3 = isBaseFinalized && isMod1Finalized && isMod2Finalized && !isMod3Finalized

  const canEdit = mode === 'base' ? canEditBase
    : mode === 'mod1' ? canEditMod1
    : mode === 'mod2' ? canEditMod2
    : canEditMod3

  // 2026-04-18: a szerver mostantól MINDEN szintű szamadasicel-t visszaad (lookup kell),
  // itt a display-hez csak a gyülekezeti szintűekre szűrünk. A `szint` opcionális —
  // undefined esetén is 'gyulekezet'-ként kezeljük (backward compat).
  const isGyulekezetSzint = (c: SzamadasiCel) => !c.szint || c.szint === 'gyulekezet'
  const bevetelCellek = useMemo(
    () => szamadasiCellek.filter((c) => c.type === 'B' && c.id !== '100' && isGyulekezetSzint(c)).sort((a, b) => sortCellsHierarchically(a.id, b.id)),
    [szamadasiCellek],
  )
  const kiadasCellek = useMemo(
    () => szamadasiCellek.filter((c) => c.type === 'K' && isGyulekezetSzint(c)).sort((a, b) => sortCellsHierarchically(a.id, b.id)),
    [szamadasiCellek],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    async function loadBudget() {
      const supabase = createClient()
      try {
        const data = await loadBudgetRowsCompat(supabase, currentYear, settings.congregation_id)
        if (!cancelled) {
          const map: Record<string, BudgetCompatRow> = {}
          data.forEach((b) => { map[b.szamadasicelid] = b })
          setBudgetData(map)
        }
      } catch {
        if (!cancelled) toast.error('Hiba a költségvetés betöltésekor.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadBudget()
    return () => { cancelled = true }
  }, [currentYear, settings.congregation_id])

  // Érték olvasás a módtól függően — csoport szintű ID-k (pl. "101")
  // esetén a csoportba tartozó alcellák összegét adjuk vissza.
  function getValue(celId: string): number {
    // Csoport szintű? (nincs pont → csoport)
    if (!celId.includes('.')) {
      const prefix = celId + '.'
      // Bevétel és kiadás is lehet csoport
      const children = [...bevetelCellek, ...kiadasCellek].filter(
        (c) => c.id.startsWith(prefix) && c.id.includes('.'),
      )
      return children.reduce((sum, c) => sum + getLeafValue(c.id), 0)
    }
    return getLeafValue(celId)
  }

  // Alszint (konkrét tétel) értéke a módtól függően
  function getLeafValue(celId: string): number {
    const row = budgetData[celId]
    if (!row) return 0
    if (mode === 'base') return row.tervezett || 0
    if (mode === 'mod1') return row.modositott ?? row.tervezett ?? 0
    if (mode === 'mod2') return row.mod2 ?? row.modositott ?? row.tervezett ?? 0
    return row.mod3 ?? row.mod2 ?? row.modositott ?? row.tervezett ?? 0
  }

  // Előző mód értéke (a módosítás összehasonlításához)
  function getPreviousValue(celId: string): number {
    // Csoport szintű összegzés — ugyanúgy, mint getValue
    if (!celId.includes('.')) {
      const prefix = celId + '.'
      const children = [...bevetelCellek, ...kiadasCellek].filter(
        (c) => c.id.startsWith(prefix) && c.id.includes('.'),
      )
      return children.reduce((sum, c) => sum + getPreviousLeafValue(c.id), 0)
    }
    return getPreviousLeafValue(celId)
  }

  function getPreviousLeafValue(celId: string): number {
    const row = budgetData[celId]
    if (!row) return 0
    if (mode === 'mod1') return row.tervezett || 0
    if (mode === 'mod2') return row.modositott ?? row.tervezett ?? 0
    if (mode === 'mod3') return row.mod2 ?? row.modositott ?? row.tervezett ?? 0
    return 0
  }

  function setValue(celId: string, val: number) {
    setBudgetData((prev) => {
      const existing = prev[celId] || { szamadasicelid: celId, tervezett: 0, modositott: null, mod2: null, mod3: null }
      const updated = { ...existing }
      if (mode === 'base') updated.tervezett = val
      else if (mode === 'mod1') updated.modositott = val
      else if (mode === 'mod2') updated.mod2 = val
      else updated.mod3 = val
      return { ...prev, [celId]: updated }
    })
  }

  const totalIncome = bevetelCellek
    .filter((c) => c.id.includes('.'))
    .reduce((s, c) => s + getValue(c.id), 0)
  const totalExpense = kiadasCellek
    .filter((c) => c.id.includes('.'))
    .reduce((s, c) => s + getValue(c.id), 0)
  const balance = totalIncome - totalExpense

  async function handleSave() {
    setSaving(true)
    try {
      const supabase = createClient()
      if (mode === 'base') {
        await saveBudgetRowsCompat(supabase, currentYear, settings.congregation_id, Object.values(budgetData))
      } else {
        const modNum = mode === 'mod1' ? 1 : mode === 'mod2' ? 2 : 3
        const rows = Object.values(budgetData).map((r) => ({
          szamadasicelid: r.szamadasicelid,
          value: modNum === 1 ? (r.modositott ?? r.tervezett ?? 0) : modNum === 2 ? (r.mod2 ?? 0) : (r.mod3 ?? 0),
        }))
        await saveBudgetModification(supabase, currentYear, settings.congregation_id, modNum as 1 | 2 | 3, rows)
      }
      toast.success('Költségvetés mentve!')
    } catch {
      toast.error('Mentési hiba.')
    } finally {
      setSaving(false)
    }
  }

  async function handleFinalizeAndSubmit() {
    const modNum = mode === 'base' ? null : (mode === 'mod1' ? 1 : mode === 'mod2' ? 2 : 3)
    const docType: DocumentType = mode === 'base' ? 'koltsegvetes' : 'koltsegvetes_modositas'

    const confirmMsg = mode === 'base'
      ? 'Véglegesíti és beküldi az egyházmegyének az alap költségvetést?\n\nEzután csak feloldási kérelemmel módosítható. Az egyházmegye értesítést kap a csengőn.'
      : `Véglegesíti és beküldi az egyházmegyének a ${modNum}. módosítást?\n\nEzután csak feloldási kérelemmel módosítható. Az egyházmegye értesítést kap a csengőn.`

    if (!confirm(confirmMsg)) return

    setSaving(true)
    try {
      // 1. Mentés — hogy a snapshot a legfrissebb adatot tartalmazza
      await handleSave()

      // 2. Beküldés + értesítés az egyházmegyének (document_submissions + csengő)
      const snapshot: Record<string, unknown> = { budgetData, year: currentYear, mode }
      const submitResult = await submitDocument(docType, currentYear, snapshot, modNum)
      if ('error' in submitResult && submitResult.error) {
        toast.error(`Beküldés sikertelen: ${submitResult.error}`)
        return
      }

      // 3. Véglegesítés (beküldés sikere után) — a bealitas tábla flag-jeit állítja
      if (mode === 'base') {
        const result = await finalizeBudget(currentYear)
        if ('error' in result && result.error) {
          toast.error(`Beküldve, de véglegesítés sikertelen: ${result.error}`)
          return
        }
      } else {
        const result = await finalizeBudgetModification(currentYear, modNum as 1 | 2 | 3)
        if ('error' in result && result.error) {
          toast.error(`Beküldve, de véglegesítés sikertelen: ${result.error}`)
          return
        }
      }

      toast.success(
        mode === 'base'
          ? 'Költségvetés véglegesítve és beküldve az egyházmegyének!'
          : `${modNum}. módosítás véglegesítve és beküldve!`,
      )
      setTimeout(() => router.refresh(), 600)
    } finally {
      setSaving(false)
    }
  }

  async function handleUnlockRequest() {
    // A legutolsó véglegesített szakasz alapján adjuk meg a kontextust,
    // hogy az esperes pontosan lássa, mit kellene feloldani.
    const lastFinalizedLabel = isMod3Finalized ? '3. módosítás'
      : isMod2Finalized ? '2. módosítás'
      : isMod1Finalized ? '1. módosítás'
      : isBaseFinalized ? 'alap költségvetés'
      : null

    if (!lastFinalizedLabel) return

    const reason = prompt(
      `Feloldási kérelem — ${lastFinalizedLabel}\n\n` +
      `Kérjük, fogalmazza meg röviden, miért szükséges a javítás. ` +
      `Az egyházmegye bírálja el a kérelmet, és az indoklást a csengőben látja.`,
    )
    if (reason === null) return
    const trimmed = reason.trim()
    if (!trimmed) {
      toast.error('Kérjük, adja meg a javítás okát.')
      return
    }

    const fullReason = `[${lastFinalizedLabel}] ${trimmed}`
    const result = await requestBudgetUnlock(currentYear, fullReason)
    if ('error' in result && result.error) { toast.error(result.error); return }
    toast.success('Feloldási kérelem elküldve az egyházmegyének!')
    router.refresh()
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-400 animate-pulse">Költségvetés betöltése...</div>
  }

  const showModComparison = mode !== 'base'

  return (
    <div className="space-y-4">
      {/* Fejléc + mód választó */}
      <div className="card-raised p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-heading text-xl text-slate-800">{currentYear}. évi költségvetés</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {isBaseFinalized && (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  <Check className="mr-1 size-3" /> Alap véglegesítve
                </Badge>
              )}
              {isMod1Finalized && (
                <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                  <Check className="mr-1 size-3" /> 1. módosítás végleges
                </Badge>
              )}
              {isMod2Finalized && (
                <Badge className="bg-violet-50 text-violet-700 border-violet-200">
                  <Check className="mr-1 size-3" /> 2. módosítás végleges
                </Badge>
              )}
              {isMod3Finalized && (
                <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                  <Check className="mr-1 size-3" /> 3. módosítás végleges
                </Badge>
              )}
              {settings.unlock_requested && (
                <Badge variant="outline" className="border-red-200 text-red-600">
                  Feloldás elbírálás alatt...
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Mód választó gombok */}
            {(['base', 'mod1', 'mod2', 'mod3'] as BudgetMode[]).map((m) => {
              const isActive = mode === m
              const isAvailable = m === 'base'
                || (m === 'mod1' && isBaseFinalized)
                || (m === 'mod2' && isMod1Finalized)
                || (m === 'mod3' && isMod2Finalized)

              if (!isAvailable) return null

              return (
                <Button
                  key={m}
                  size="sm"
                  variant={isActive ? 'default' : 'outline'}
                  className="rounded-full"
                  onClick={() => setMode(m)}
                >
                  {MODE_LABELS[m]}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canEdit && (
            <>
              <Button size="sm" className="rounded-xl" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Mentés...' : 'Mentés'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={() => void handleFinalizeAndSubmit()}
                disabled={saving}
              >
                <Lock className="mr-1 size-3.5" />
                {mode === 'base'
                  ? 'Véglegesítés és beküldés'
                  : `${MODE_LABELS[mode]} véglegesítése és beküldése`}
              </Button>
            </>
          )}
          {/* Feloldási kérelem bármikor lehetséges, ha véglegesített szakasz van
              és nincs folyamatban kérelem. A lelkész utólag észrevett hibát is
              javíttathat az egyházmegye jóváhagyásával. */}
          {isBaseFinalized && !settings.unlock_requested && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl text-amber-700 border-amber-200 hover:bg-amber-50"
              onClick={() => void handleUnlockRequest()}
            >
              Javítási kérelem
            </Button>
          )}
        </div>

        {/* Folyamatban lévő feloldási kérelem részletes megjelenítése */}
        {settings.unlock_requested && settings.unlock_reason && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Javítási kérelem elbírálás alatt
            </p>
            <p className="mt-1 text-sm text-amber-900">{settings.unlock_reason}</p>
            <p className="mt-1 text-xs text-amber-600">
              Az egyházmegye döntéséről a csengőben fog értesülni.
            </p>
          </div>
        )}
      </div>

      {/* Bevételek és Kiadások táblák — egymás mellett desktopon, egymás alatt mobilon */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bevételek tábla — egységes dizájn a számadás fülhöz */}
        <div className="card-raised overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-emerald-50 border-emerald-100 px-4 py-3">
            <ArrowDownCircle className="size-4 text-emerald-600" />
            <span className="text-sm font-semibold text-slate-700">Bevételek</span>
            <span className="text-xs text-emerald-700 ml-auto font-semibold">{formatCurrency(totalIncome)} RON</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr>
                  <th className="p-2 text-left text-xs font-medium text-slate-500 w-16">Kód</th>
                  <th className="p-2 text-left text-xs font-medium text-slate-500">Megnevezés</th>
                  {showModComparison && <th className="p-2 text-right text-xs font-medium text-slate-500 w-28">Előző</th>}
                  <th className="p-2 text-right text-xs font-medium text-slate-500 w-32">{showModComparison ? MODE_LABELS[mode] : 'Terv (RON)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bevetelCellek.map((c) => {
                  const isGroup = !c.id.includes('.')
                  const val = getValue(c.id)
                  const prevVal = showModComparison ? getPreviousValue(c.id) : 0
                  const diff = showModComparison ? val - prevVal : 0

                  return (
                    <tr key={c.id} className={isGroup ? 'bg-slate-50/50 font-semibold' : 'hover:bg-slate-50/60'}>
                      <td className="p-2 text-xs text-slate-400">{c.id}</td>
                      <td className={`p-2 ${isGroup ? 'text-slate-700' : 'pl-6 text-xs text-slate-600'}`}>{c.nev}</td>
                      {showModComparison && <td className="p-2 text-right text-xs text-slate-400">{formatCurrency(prevVal)}</td>}
                      <td className="p-2 text-right">
                        {isGroup ? (
                          <span className="font-semibold text-emerald-600">{formatCurrency(val)}</span>
                        ) : canEdit ? (
                          <input
                            type="number"
                            value={val || ''}
                            onChange={(e) => setValue(c.id, Number(e.target.value) || 0)}
                            className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm"
                            step="0.01"
                            min="0"
                          />
                        ) : (
                          <span className={diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-slate-600'}>{formatCurrency(val)}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Kiadások tábla — egységes dizájn */}
        <div className="card-raised overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-rose-50 border-rose-100 px-4 py-3">
            <ArrowUpCircle className="size-4 text-rose-500" />
            <span className="text-sm font-semibold text-slate-700">Kiadások</span>
            <span className="text-xs text-rose-600 ml-auto font-semibold">{formatCurrency(totalExpense)} RON</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr>
                  <th className="p-2 text-left text-xs font-medium text-slate-500 w-16">Kód</th>
                  <th className="p-2 text-left text-xs font-medium text-slate-500">Megnevezés</th>
                  {showModComparison && <th className="p-2 text-right text-xs font-medium text-slate-500 w-28">Előző</th>}
                  <th className="p-2 text-right text-xs font-medium text-slate-500 w-32">{showModComparison ? MODE_LABELS[mode] : 'Terv (RON)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {kiadasCellek.map((c) => {
                  const isGroup = !c.id.includes('.')
                  const val = getValue(c.id)
                  const prevVal = showModComparison ? getPreviousValue(c.id) : 0
                  const diff = showModComparison ? val - prevVal : 0

                  return (
                    <tr key={c.id} className={isGroup ? 'bg-slate-50/50 font-semibold' : 'hover:bg-slate-50/60'}>
                      <td className="p-2 text-xs text-slate-400">{c.id}</td>
                      <td className={`p-2 ${isGroup ? 'text-slate-700' : 'pl-6 text-xs text-slate-600'}`}>{c.nev}</td>
                      {showModComparison && <td className="p-2 text-right text-xs text-slate-400">{formatCurrency(prevVal)}</td>}
                      <td className="p-2 text-right">
                        {isGroup ? (
                          <span className="font-semibold text-rose-500">{formatCurrency(val)}</span>
                        ) : canEdit ? (
                          <input
                            type="number"
                            value={val || ''}
                            onChange={(e) => setValue(c.id, Number(e.target.value) || 0)}
                            className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm"
                            step="0.01"
                            min="0"
                          />
                        ) : (
                          <span className={diff > 0 ? 'text-red-500' : diff < 0 ? 'text-emerald-600' : 'text-slate-600'}>{formatCurrency(val)}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Egyenleg összesítő */}
      <div className={`card-raised p-5 ${balance >= 0 ? 'border-blue-100 bg-blue-50/30' : 'border-red-100 bg-red-50/30'}`}>
        <div className="flex items-center gap-3">
          <Scale className={`size-5 ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Egyenleg</p>
            <p className={`text-2xl font-bold ${balance >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
              {balance >= 0 ? '+' : ''}{formatCurrency(balance)} RON
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
