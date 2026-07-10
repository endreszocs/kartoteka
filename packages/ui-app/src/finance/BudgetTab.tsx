'use client'

/**
 * BudgetTab — közös költségvetés-tab (Sprint Q F1, v0.7.0).
 *
 * Költségvetés (alap + 3 módosítás), bevétel/kiadás cellák kódonként,
 * mentés + véglegesítés + javítási kérelem flow.
 *
 * Callback-ek:
 *   - `loadBudgetRows(year, congregationId)` — adatlekérés
 *   - `saveBudgetRows(year, congregationId, rows)` — alap mentés
 *   - `saveBudgetModification(year, congregationId, modNum, rows)` — mod1/mod2/mod3
 *   - `submitDocument(docType, year, snapshot, modNum)` — beküldés egyházmegyéhez
 *   - `finalizeBudget(year)` / `finalizeBudgetModification(year, modNum)` — végleges flag
 *   - `requestBudgetUnlock(year, reason)` — javítási kérelem
 *   - `onRefresh()` — sikeres művelet után reload
 *   - `onToast(msg, kind)` — UI-feedback
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Check, Lock, Scale } from 'lucide-react'

import { Badge, Button } from '@kartoteka/ui'

import { FinanceLoadingState } from './FinanceLoadingState'
import { formatCurrency, sortCellsHierarchically } from './helpers'
import type { BealitasRow, BudgetCompatRow, SzamadasiCel } from './types'

export type BudgetMode = 'base' | 'mod1' | 'mod2' | 'mod3'
export type BudgetToastKind = 'success' | 'error' | 'info'

const MODE_LABELS: Record<BudgetMode, string> = {
  base: 'Alap költségvetés',
  mod1: '1. módosítás',
  mod2: '2. módosítás',
  mod3: '3. módosítás',
}

export interface BudgetTabProps {
  szamadasiCellek: SzamadasiCel[]
  settings: BealitasRow
  currentYear: number

  /**
   * 2026-07-10 (#2): NYITÓ egyenlegek (előző évi záró) — display-only blokk a
   * fül tetején, a hivatalos EREK-minta 1–3. sora szerint. OPCIONÁLIS: ha
   * undefined (pl. desktop hívó nem adja át), a blokk nem jelenik meg.
   * FONTOS: NEM kerül a budgetData-ba / mentésbe.
   */
  carryoverCash?: number
  carryoverBank?: number

  /** 2026-07-10 (S2 #9): a betöltő-állapot logója (web: '/kartoteka-icon.png'). */
  loadingLogoSrc?: string

  /**
   * 2026-07-10 (#2): előző évi TÉNY betöltése (szürke referencia-oszlop).
   * A `year` a NÉZETT év — a callback maga a `year - 1` évi tényt adja vissza
   * szamadasicel-kód szerint aggregálva. OPCIONÁLIS: ha nincs, az oszlop
   * nem jelenik meg (desktop hívók változatlanok).
   */
  loadPreviousActuals?: (year: number) => Promise<{
    actualIncome?: Record<string, number>
    actualExpense?: Record<string, number>
    error?: string
  }>

  loadBudgetRows: (
    year: number,
    congregationId: string,
  ) => Promise<{ rows: BudgetCompatRow[]; error?: string | null }>

  saveBudgetRows: (
    year: number,
    congregationId: string,
    rows: BudgetCompatRow[],
  ) => Promise<{ success?: boolean; error?: string | null }>

  saveBudgetModification: (
    year: number,
    congregationId: string,
    modNum: 1 | 2 | 3,
    rows: Array<{ szamadasicelid: string; value: number }>,
  ) => Promise<{ success?: boolean; error?: string | null }>

  finalizeBudget: (
    year: number,
  ) => Promise<{ success?: boolean; error?: string | null }>

  finalizeBudgetModification: (
    year: number,
    modNum: 1 | 2 | 3,
  ) => Promise<{ success?: boolean; error?: string | null }>

  submitDocument: (
    docType: 'koltsegvetes' | 'koltsegvetes_modositas',
    year: number,
    snapshot: Record<string, unknown>,
    modNum: number | null,
  ) => Promise<{ success?: boolean; error?: string | null }>

  requestBudgetUnlock: (
    year: number,
    reason: string,
  ) => Promise<{ success?: boolean; error?: string | null }>

  onRefresh?: () => void
  onToast?: (message: string, kind: BudgetToastKind) => void
}

export function BudgetTab({
  szamadasiCellek,
  settings,
  currentYear,
  carryoverCash,
  carryoverBank,
  loadingLogoSrc,
  loadPreviousActuals,
  loadBudgetRows,
  saveBudgetRows,
  saveBudgetModification,
  finalizeBudget,
  finalizeBudgetModification,
  submitDocument,
  requestBudgetUnlock,
  onRefresh,
  onToast,
}: BudgetTabProps) {
  const [budgetData, setBudgetData] = useState<Record<string, BudgetCompatRow>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<BudgetMode>('base')
  // 2026-07-10 (#2): előző évi (currentYear-1) TÉNY kódonként — szürke referencia.
  const [prevActuals, setPrevActuals] = useState<{
    income: Record<string, number>
    expense: Record<string, number>
  } | null>(null)

  const isBaseFinalized = settings.budget_finalized
  const isMod1Finalized = settings.budget_mod1_finalized ?? false
  const isMod2Finalized = settings.budget_mod2_finalized ?? false
  const isMod3Finalized = settings.budget_mod3_finalized ?? false

  const canEditBase = !isBaseFinalized
  const canEditMod1 = isBaseFinalized && !isMod1Finalized
  const canEditMod2 = isBaseFinalized && isMod1Finalized && !isMod2Finalized
  const canEditMod3 =
    isBaseFinalized && isMod1Finalized && isMod2Finalized && !isMod3Finalized

  const canEdit =
    mode === 'base'
      ? canEditBase
      : mode === 'mod1'
        ? canEditMod1
        : mode === 'mod2'
          ? canEditMod2
          : canEditMod3

  const isGyulekezetSzint = (c: SzamadasiCel) => !c.szint || c.szint === 'gyulekezet'
  // 2026-07-10 (#3/A): a type-guard mellé kód-prefix guard is — a belső mozgás
  // (100.xx pénztármaradvány + 3xx/4xx átvezetés) SOSEM költségvetési tétel.
  const bevetelCellek = useMemo(
    () =>
      szamadasiCellek
        .filter(
          (c) =>
            c.type === 'B' && c.id.startsWith('1') && !c.id.startsWith('100') && isGyulekezetSzint(c),
        )
        .sort((a, b) => sortCellsHierarchically(a.id, b.id)),
    [szamadasiCellek],
  )
  const kiadasCellek = useMemo(
    () =>
      szamadasiCellek
        .filter((c) => c.type === 'K' && c.id.startsWith('2') && isGyulekezetSzint(c))
        .sort((a, b) => sortCellsHierarchically(a.id, b.id)),
    [szamadasiCellek],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const result = await loadBudgetRows(currentYear, settings.congregation_id)
      if (cancelled) return
      if (result.error) {
        onToast?.('Hiba a költségvetés betöltésekor.', 'error')
      } else {
        const map: Record<string, BudgetCompatRow> = {}
        result.rows.forEach((b) => {
          map[b.szamadasicelid] = b
        })
        setBudgetData(map)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [currentYear, settings.congregation_id, loadBudgetRows, onToast])

  // 2026-07-10 (#2): előző évi tény betöltése (a callback a currentYear-1 évet
  // aggregálja). Hiba esetén csendben kimarad — a referencia-oszlop opcionális.
  useEffect(() => {
    if (!loadPreviousActuals) return
    let cancelled = false
    void (async () => {
      const result = await loadPreviousActuals(currentYear)
      if (cancelled || result.error) return
      setPrevActuals({
        income: result.actualIncome || {},
        expense: result.actualExpense || {},
      })
    })()
    return () => {
      cancelled = true
    }
  }, [currentYear, loadPreviousActuals])

  function getValue(celId: string): number {
    if (!celId.includes('.')) {
      const prefix = celId + '.'
      const children = [...bevetelCellek, ...kiadasCellek].filter(
        (c) => c.id.startsWith(prefix) && c.id.includes('.'),
      )
      return children.reduce((sum, c) => sum + getLeafValue(c.id), 0)
    }
    return getLeafValue(celId)
  }

  function getLeafValue(celId: string): number {
    const row = budgetData[celId]
    if (!row) return 0
    if (mode === 'base') return row.tervezett || 0
    if (mode === 'mod1') return row.modositott ?? row.tervezett ?? 0
    if (mode === 'mod2') return row.mod2 ?? row.modositott ?? row.tervezett ?? 0
    return row.mod3 ?? row.mod2 ?? row.modositott ?? row.tervezett ?? 0
  }

  function getPreviousValue(celId: string): number {
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

  // 2026-07-10 (#2): előző ÉVI tény — csoport-soroknál a levelek összege
  // (a getValue aggregáló mintája). A bevétel (1xx) és kiadás (2xx) kódok
  // diszjunktak, ezért a két map közös lookupja biztonságos.
  function getPrevYearActualLeaf(celId: string): number {
    if (!prevActuals) return 0
    return prevActuals.income[celId] ?? prevActuals.expense[celId] ?? 0
  }

  function getPrevYearActualValue(celId: string): number {
    if (!prevActuals) return 0
    if (!celId.includes('.')) {
      const prefix = celId + '.'
      const children = [...bevetelCellek, ...kiadasCellek].filter(
        (c) => c.id.startsWith(prefix) && c.id.includes('.'),
      )
      return children.reduce((sum, c) => sum + getPrevYearActualLeaf(c.id), 0)
    }
    return getPrevYearActualLeaf(celId)
  }

  function setValue(celId: string, val: number) {
    setBudgetData((prev) => {
      const existing = prev[celId] || {
        szamadasicelid: celId,
        tervezett: 0,
        modositott: null,
        mod2: null,
        mod3: null,
      }
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
      if (mode === 'base') {
        const result = await saveBudgetRows(
          currentYear,
          settings.congregation_id,
          Object.values(budgetData),
        )
        if (result.error) {
          onToast?.('Mentési hiba: ' + result.error, 'error')
          return
        }
      } else {
        const modNum = (mode === 'mod1' ? 1 : mode === 'mod2' ? 2 : 3) as 1 | 2 | 3
        const rows = Object.values(budgetData).map((r) => ({
          szamadasicelid: r.szamadasicelid,
          value:
            modNum === 1
              ? r.modositott ?? r.tervezett ?? 0
              : modNum === 2
                ? r.mod2 ?? 0
                : r.mod3 ?? 0,
        }))
        const result = await saveBudgetModification(
          currentYear,
          settings.congregation_id,
          modNum,
          rows,
        )
        if (result.error) {
          onToast?.('Mentési hiba: ' + result.error, 'error')
          return
        }
      }
      onToast?.('Költségvetés mentve!', 'success')
    } finally {
      setSaving(false)
    }
  }

  async function handleFinalizeAndSubmit() {
    if (typeof window === 'undefined') return
    const modNum = mode === 'base' ? null : mode === 'mod1' ? 1 : mode === 'mod2' ? 2 : 3
    const docType: 'koltsegvetes' | 'koltsegvetes_modositas' =
      mode === 'base' ? 'koltsegvetes' : 'koltsegvetes_modositas'

    const confirmMsg =
      mode === 'base'
        ? 'Véglegesíti és beküldi az egyházmegyének az alap költségvetést?\n\nEzután csak feloldási kérelemmel módosítható.'
        : `Véglegesíti és beküldi az egyházmegyének a ${modNum}. módosítást?\n\nEzután csak feloldási kérelemmel módosítható.`

    if (!window.confirm(confirmMsg)) return

    setSaving(true)
    try {
      await handleSave()

      const snapshot: Record<string, unknown> = { budgetData, year: currentYear, mode }

      // 2026-07-10 (#4/4): ZÁR-ELŐSZÖR sorrend — előbb a véglegesítés (lock),
      // utána a beküldés. Korábban fordítva volt: ha a zárás elbukott, a
      // dokumentum beküldött-de-nyitott maradt, és a beküldött snapshot csendben
      // elévülhetett (a szerkesztés tovább élt).
      if (mode === 'base') {
        const result = await finalizeBudget(currentYear)
        if (result.error) {
          onToast?.(`Véglegesítés sikertelen: ${result.error}`, 'error')
          return
        }
      } else {
        const result = await finalizeBudgetModification(
          currentYear,
          modNum as 1 | 2 | 3,
        )
        if (result.error) {
          onToast?.(`Véglegesítés sikertelen: ${result.error}`, 'error')
          return
        }
      }

      const submitResult = await submitDocument(docType, currentYear, snapshot, modNum)
      if (submitResult.error) {
        onToast?.(
          `Véglegesítve, de a beküldés sikertelen: ${submitResult.error} — ` +
            'próbáld újra a beküldést, vagy kérj javítási engedélyt.',
          'error',
        )
        return
      }

      onToast?.(
        mode === 'base'
          ? 'Költségvetés véglegesítve és beküldve!'
          : `${modNum}. módosítás véglegesítve és beküldve!`,
        'success',
      )
      setTimeout(() => onRefresh?.(), 600)
    } finally {
      setSaving(false)
    }
  }

  async function handleUnlockRequest() {
    if (typeof window === 'undefined') return
    const lastFinalizedLabel = isMod3Finalized
      ? '3. módosítás'
      : isMod2Finalized
        ? '2. módosítás'
        : isMod1Finalized
          ? '1. módosítás'
          : isBaseFinalized
            ? 'alap költségvetés'
            : null

    if (!lastFinalizedLabel) return

    const reason = window.prompt(
      `Feloldási kérelem — ${lastFinalizedLabel}\n\nKérjük, fogalmazza meg röviden, miért szükséges a javítás. Az egyházmegye bírálja el a kérelmet.`,
      '',
    )
    if (reason === null) return
    const trimmed = reason.trim()
    if (!trimmed) {
      onToast?.('Kérjük, adja meg a javítás okát.', 'error')
      return
    }

    const fullReason = `[${lastFinalizedLabel}] ${trimmed}`
    const result = await requestBudgetUnlock(currentYear, fullReason)
    if (result.error) {
      onToast?.(result.error, 'error')
      return
    }
    onToast?.('Feloldási kérelem elküldve az egyházmegyének!', 'success')
    onRefresh?.()
  }

  if (loading) {
    // 2026-07-10 (S2 #9): állapotsávos, logós betöltő.
    return <FinanceLoadingState label="Költségvetés betöltése…" logoSrc={loadingLogoSrc} />
  }

  const showModComparison = mode !== 'base'
  // 2026-07-10 (#2): az „Előző évi tény" halvány referencia-oszlop csak base
  // módban és csak betöltött előző évi adat mellett látszik.
  const showPrevYear = mode === 'base' && prevActuals !== null

  return (
    <div className="space-y-4">
      <div className="card-raised p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-heading text-xl text-slate-800">
              {currentYear}. évi költségvetés
            </h3>
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
            {(['base', 'mod1', 'mod2', 'mod3'] as BudgetMode[]).map((m) => {
              const isActive = mode === m
              const isAvailable =
                m === 'base' ||
                (m === 'mod1' && isBaseFinalized) ||
                (m === 'mod2' && isMod1Finalized) ||
                (m === 'mod3' && isMod2Finalized)

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
              <Button
                size="sm"
                className="rounded-xl"
                onClick={() => void handleSave()}
                disabled={saving}
              >
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

      {/* 2026-07-10 (S2 #8): a NYITÓ egyenlegek a hivatalos költségvetés_Minta.pdf
          szerint a TÁBLÁZAT 1–3. sorai (nem külön kártya) — a Bevételek tábla élén,
          automatikus, nem szerkeszthető sorokként. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BudgetCellTable
          icon={<ArrowDownCircle className="size-4 text-emerald-600" />}
          title="Bevételek"
          headerBg="bg-emerald-50 border-emerald-100"
          totalText="text-emerald-700"
          total={totalIncome}
          showModComparison={showModComparison}
          showPrevYear={showPrevYear}
          modeLabel={MODE_LABELS[mode]}
          cells={bevetelCellek}
          getValue={getValue}
          getPreviousValue={getPreviousValue}
          getPrevYearActual={getPrevYearActualValue}
          canEdit={canEdit}
          setValue={setValue}
          isIncome
          openingRows={
            carryoverCash != null && carryoverBank != null
              ? [
                  {
                    nr: '1',
                    nev: 'Múlt évi pénztármaradvány (Disponibil din anul precedent)',
                    value: carryoverCash + carryoverBank,
                    group: true,
                  },
                  { nr: '2', nev: 'Készpénz egyenleg (Casa)', value: carryoverCash, group: false },
                  { nr: '3', nev: 'Banki egyenleg (Banca)', value: carryoverBank, group: false },
                ]
              : undefined
          }
        />
        <BudgetCellTable
          icon={<ArrowUpCircle className="size-4 text-rose-500" />}
          title="Kiadások"
          headerBg="bg-rose-50 border-rose-100"
          totalText="text-rose-600"
          total={totalExpense}
          showModComparison={showModComparison}
          showPrevYear={showPrevYear}
          modeLabel={MODE_LABELS[mode]}
          cells={kiadasCellek}
          getValue={getValue}
          getPreviousValue={getPreviousValue}
          getPrevYearActual={getPrevYearActualValue}
          canEdit={canEdit}
          setValue={setValue}
          isIncome={false}
        />
      </div>

      <div
        className={`card-raised p-5 ${
          balance >= 0
            ? 'border-blue-100 bg-blue-50/30'
            : 'border-red-100 bg-red-50/30'
        }`}
      >
        <div className="flex items-center gap-3">
          <Scale
            className={`size-5 ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Egyenleg
            </p>
            <p
              className={`text-2xl font-bold ${
                balance >= 0 ? 'text-blue-700' : 'text-red-700'
              }`}
            >
              {balance >= 0 ? '+' : ''}
              {formatCurrency(balance)} RON
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

interface BudgetCellTableProps {
  icon: React.ReactNode
  title: string
  headerBg: string
  totalText: string
  total: number
  showModComparison: boolean
  /** 2026-07-10 (#2): halvány „Előző évi tény" referencia-oszlop (base mód). */
  showPrevYear: boolean
  modeLabel: string
  cells: SzamadasiCel[]
  getValue: (celId: string) => number
  getPreviousValue: (celId: string) => number
  /** 2026-07-10 (#2): előző évi tény érték (csoportnál levelek összege). */
  getPrevYearActual: (celId: string) => number
  canEdit: boolean
  setValue: (celId: string, val: number) => void
  isIncome: boolean
  /** 2026-07-10 (S2 #8): a hivatalos nyomtatvány 1–3. NYITÓ sora a tábla élén —
   *  automatikus, nem szerkeszthető sorok (Disponibil / Casa / Banca). */
  openingRows?: Array<{ nr: string; nev: string; value: number; group: boolean }>
}

function BudgetCellTable({
  icon,
  title,
  headerBg,
  totalText,
  total,
  showModComparison,
  showPrevYear,
  modeLabel,
  cells,
  getValue,
  getPreviousValue,
  getPrevYearActual,
  canEdit,
  setValue,
  isIncome,
  openingRows,
}: BudgetCellTableProps) {
  return (
    <div className="card-raised overflow-hidden">
      <div className={`flex items-center gap-2 border-b ${headerBg} px-4 py-3`}>
        {icon}
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <span className={`text-xs ${totalText} ml-auto font-semibold`}>
          {formatCurrency(total)} RON
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80">
            <tr>
              <th className="p-2 text-left text-xs font-medium text-slate-500 w-16">Kód</th>
              <th className="p-2 text-left text-xs font-medium text-slate-500">Megnevezés</th>
              {showModComparison && (
                <th className="p-2 text-right text-xs font-medium text-slate-500 w-28">
                  Előző
                </th>
              )}
              {showPrevYear && (
                <th className="p-2 text-right text-xs font-medium text-slate-400 w-28">
                  Előző évi tény
                </th>
              )}
              <th className="p-2 text-right text-xs font-medium text-slate-500 w-32">
                {showModComparison ? modeLabel : 'Terv (RON)'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* 2026-07-10 (S2 #8): hivatalos NYITÓ sorok (1–3.) a tábla élén —
                automatikus, nem szerkeszthető (a mentés nem érinti őket). */}
            {openingRows?.map((row) => (
              <tr
                key={`opening-${row.nr}`}
                className={row.group ? 'bg-sky-50/60 font-semibold' : 'bg-sky-50/30'}
                title="Automatikus nyitó egyenleg — az előző évi záróból, nem szerkeszthető"
              >
                <td className="p-2 text-xs text-slate-400">{row.nr}</td>
                <td
                  className={`p-2 ${
                    row.group ? 'text-slate-700' : 'pl-6 text-xs text-slate-600'
                  }`}
                >
                  {row.nev}
                </td>
                {showModComparison && <td className="p-2 text-right text-xs text-slate-300">–</td>}
                {showPrevYear && <td className="p-2 text-right text-xs text-slate-300">–</td>}
                <td className="p-2 text-right">
                  <span className={row.group ? 'font-semibold text-slate-700' : 'text-slate-600'}>
                    {formatCurrency(row.value)}
                  </span>
                </td>
              </tr>
            ))}
            {cells.map((c) => {
              const isGroup = !c.id.includes('.')
              const val = getValue(c.id)
              const prevVal = showModComparison ? getPreviousValue(c.id) : 0
              const diff = showModComparison ? val - prevVal : 0
              // 2026-07-10 (#2): előző évi tény — halvány oszlop + üres input placeholdere.
              const prevYearVal = showPrevYear ? getPrevYearActual(c.id) : 0
              const positiveColor = isIncome ? 'text-emerald-600' : 'text-red-500'
              const negativeColor = isIncome ? 'text-red-500' : 'text-emerald-600'

              return (
                <tr
                  key={c.id}
                  className={
                    isGroup ? 'bg-slate-50/50 font-semibold' : 'hover:bg-slate-50/60'
                  }
                >
                  <td className="p-2 text-xs text-slate-400">{c.id}</td>
                  <td
                    className={`p-2 ${
                      isGroup ? 'text-slate-700' : 'pl-6 text-xs text-slate-600'
                    }`}
                  >
                    {c.nev}
                  </td>
                  {showModComparison && (
                    <td className="p-2 text-right text-xs text-slate-400">
                      {formatCurrency(prevVal)}
                    </td>
                  )}
                  {showPrevYear && (
                    <td className="p-2 text-right text-xs text-slate-400">
                      {prevYearVal !== 0 ? formatCurrency(prevYearVal) : '–'}
                    </td>
                  )}
                  <td className="p-2 text-right">
                    {isGroup ? (
                      <span className={`font-semibold ${positiveColor}`}>
                        {formatCurrency(val)}
                      </span>
                    ) : canEdit ? (
                      <input
                        type="number"
                        value={val || ''}
                        onChange={(e) => setValue(c.id, Number(e.target.value) || 0)}
                        className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm placeholder:text-slate-300"
                        step="0.01"
                        min="0"
                        placeholder={
                          showPrevYear && prevYearVal !== 0
                            ? formatCurrency(prevYearVal)
                            : undefined
                        }
                      />
                    ) : (
                      <span
                        className={
                          diff > 0
                            ? positiveColor
                            : diff < 0
                              ? negativeColor
                              : 'text-slate-600'
                        }
                      >
                        {formatCurrency(val)}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
