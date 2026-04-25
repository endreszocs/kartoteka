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
  const bevetelCellek = useMemo(
    () =>
      szamadasiCellek
        .filter((c) => c.type === 'B' && c.id !== '100' && isGyulekezetSzint(c))
        .sort((a, b) => sortCellsHierarchically(a.id, b.id)),
    [szamadasiCellek],
  )
  const kiadasCellek = useMemo(
    () =>
      szamadasiCellek
        .filter((c) => c.type === 'K' && isGyulekezetSzint(c))
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
      const submitResult = await submitDocument(docType, currentYear, snapshot, modNum)
      if (submitResult.error) {
        onToast?.(`Beküldés sikertelen: ${submitResult.error}`, 'error')
        return
      }

      if (mode === 'base') {
        const result = await finalizeBudget(currentYear)
        if (result.error) {
          onToast?.(`Beküldve, de véglegesítés sikertelen: ${result.error}`, 'error')
          return
        }
      } else {
        const result = await finalizeBudgetModification(
          currentYear,
          modNum as 1 | 2 | 3,
        )
        if (result.error) {
          onToast?.(`Beküldve, de véglegesítés sikertelen: ${result.error}`, 'error')
          return
        }
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
    return (
      <div className="p-8 text-center text-slate-400 animate-pulse">
        Költségvetés betöltése...
      </div>
    )
  }

  const showModComparison = mode !== 'base'

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BudgetCellTable
          icon={<ArrowDownCircle className="size-4 text-emerald-600" />}
          title="Bevételek"
          headerBg="bg-emerald-50 border-emerald-100"
          totalText="text-emerald-700"
          total={totalIncome}
          showModComparison={showModComparison}
          modeLabel={MODE_LABELS[mode]}
          cells={bevetelCellek}
          getValue={getValue}
          getPreviousValue={getPreviousValue}
          canEdit={canEdit}
          setValue={setValue}
          isIncome
        />
        <BudgetCellTable
          icon={<ArrowUpCircle className="size-4 text-rose-500" />}
          title="Kiadások"
          headerBg="bg-rose-50 border-rose-100"
          totalText="text-rose-600"
          total={totalExpense}
          showModComparison={showModComparison}
          modeLabel={MODE_LABELS[mode]}
          cells={kiadasCellek}
          getValue={getValue}
          getPreviousValue={getPreviousValue}
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
  modeLabel: string
  cells: SzamadasiCel[]
  getValue: (celId: string) => number
  getPreviousValue: (celId: string) => number
  canEdit: boolean
  setValue: (celId: string, val: number) => void
  isIncome: boolean
}

function BudgetCellTable({
  icon,
  title,
  headerBg,
  totalText,
  total,
  showModComparison,
  modeLabel,
  cells,
  getValue,
  getPreviousValue,
  canEdit,
  setValue,
  isIncome,
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
              <th className="p-2 text-right text-xs font-medium text-slate-500 w-32">
                {showModComparison ? modeLabel : 'Terv (RON)'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cells.map((c) => {
              const isGroup = !c.id.includes('.')
              const val = getValue(c.id)
              const prevVal = showModComparison ? getPreviousValue(c.id) : 0
              const diff = showModComparison ? val - prevVal : 0
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
                        className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm"
                        step="0.01"
                        min="0"
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
