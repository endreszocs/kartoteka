'use client'

/**
 * Webes AccountingTabV2 wrapper.
 *
 * 2026-04-25 (Sprint Q Fázis 1, v0.6.2): a vizuális réteg átkerült a
 * `@kartoteka/ui-app` shared package `AccountingTab` komponensébe. Ez a
 * wrapper:
 *   - Supabase-ből tölti a költségvetési terveket (budgetData prop)
 *   - A `requestAccountingUnlock` server-action callback-ként megy át
 *   - Az `AccountingFinalizeWizard` modalt slot-prop-on adja át
 *   - `router.refresh` és `toast` callback-ekként
 *
 * Eredmény: a webes oldal változatlanul működik. A desktop ugyanezt
 * a `<AccountingTab>`-ot importálhatja a saját Tauri-data wrapper-ével.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { AccountingTab, type AccountingTabProps } from '@kartoteka/ui-app'

import {
  getPreviousYearActuals,
  requestAccountingUnlock,
} from '@/app/(dashboard)/penzugy/actions'
import { AccountingFinalizeWizard } from '@/components/modals/accounting-finalize-wizard-dialog'
import { SzamadasTartozasokDialog } from '@/components/finance/szamadas-tartozasok-dialog'
import { loadBudgetRowsCompat } from '@/lib/finance/budget-compat'
import { createClient } from '@/lib/supabase/client'

// 2026-07-10 (#2): a prevActualIncome/prevActualExpense-t a wrapper tölti be
// (getPreviousYearActuals), ezért Omit-oljuk; a carryoverCash/carryoverBank
// viszont kívülről (finance-tabs) érkezik, így átfolyik a props-on.
type AccountingTabV2Props = Omit<
  AccountingTabProps,
  | 'budgetData'
  | 'loading'
  | 'onRequestUnlock'
  | 'onRefresh'
  | 'onToast'
  | 'finalizeWizardSlot'
  | 'prevActualIncome'
  | 'prevActualExpense'
>

export function AccountingTabV2(props: AccountingTabV2Props) {
  const router = useRouter()
  const [budgetData, setBudgetData] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  // 2026-08-14 (K2): a hivatalos Számadás 116–133. sorainak rögzítője.
  const [tartozasokOpen, setTartozasokOpen] = useState(false)
  // 2026-07-10 (#2): előző évi (currentYear-1) tény kódonként — halvány
  // „Előző évi tény" oszlop a terv/tény táblákban.
  const [prevActuals, setPrevActuals] = useState<{
    income?: Record<string, number>
    expense?: Record<string, number>
  }>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const map: Record<string, number> = {}
      try {
        const data = await loadBudgetRowsCompat(
          supabase,
          props.currentYear,
          props.settings.congregation_id,
        )
        data.forEach((row) => {
          map[row.szamadasicelid] = row.tervezett
        })
      } catch {
        toast.error('Hiba a költségvetés betöltésekor.')
      }
      setBudgetData(map)
      setLoading(false)
    }

    void load()
  }, [props.currentYear, props.settings.congregation_id])

  // 2026-07-10 (#2): előző évi tény betöltése — hiba esetén csendben kimarad
  // (a referencia-oszlop opcionális, nem blokkolja a fület).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await getPreviousYearActuals(props.currentYear)
      if (cancelled || result.error) return
      setPrevActuals({ income: result.actualIncome, expense: result.actualExpense })
    })()
    return () => {
      cancelled = true
    }
  }, [props.currentYear])

  return (
    <>
      {/* 2026-08-14 (K2): Tartozások/Kintlévőségek (a hivatalos Számadás
          116–133. sora) — év végi rögzítő. Webes wrapper-szint: a desktop
          Könyvelés-nézete read-only pillanatkép, ott nincs értelme. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Év végi tartozások és kintlévőségek</strong> — a
          hivatalos Számadás 116–133. sora. Az Útmutató szerint azt is jegyzőkönyvezni kell, ha
          nincs tartozás.
        </p>
        <button
          type="button"
          onClick={() => setTartozasokOpen(true)}
          className="inline-flex min-h-9 items-center rounded-lg border border-input bg-background px-3 text-sm font-medium shadow-sm transition hover:bg-accent"
        >
          Rögzítés / megtekintés…
        </button>
      </div>

      <SzamadasTartozasokDialog
        open={tartozasokOpen}
        onOpenChange={setTartozasokOpen}
        year={props.currentYear}
        settings={props.settings}
        onSaved={() => router.refresh()}
      />

    <AccountingTab
      {...props}
      budgetData={budgetData}
      loading={loading}
      loadingLogoSrc="/kartoteka-icon.png"
      prevActualIncome={prevActuals.income}
      prevActualExpense={prevActuals.expense}
      onRequestUnlock={async (year, reason) => {
        return await requestAccountingUnlock(year, reason)
      }}
      onRefresh={() => router.refresh()}
      onToast={(msg, kind) => {
        if (kind === 'error') toast.error(msg)
        else if (kind === 'success') toast.success(msg)
        else toast(msg)
      }}
      finalizeWizardSlot={({ open, onOpenChange, summary }) => (
        <AccountingFinalizeWizard
          open={open}
          onOpenChange={onOpenChange}
          year={props.currentYear}
          scope={props.scope ?? 'congregation'}
          summary={summary}
          onFinalized={async () => {
            router.refresh()
          }}
        />
      )}
    />
    </>
  )
}
