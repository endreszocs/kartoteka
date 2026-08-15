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
// 2026-08-15 (egyházmegyei terv, 3.4 + 3.6): a megye SAJÁT iratainak felküldés-
// állapota és pótlása — CSAK megyei hatókörben jelenik meg.
import { DioceseFelkuldesCard } from '@/components/finance/diocese-felkuldes-card'
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
> & {
  /**
   * 2026-08-15: ellenőri (számvevői) nézet — a wrapper-szintű megyei kártya
   * gombjait rejti. A shared AccountingTab nem ismeri ezt a propot (a
   * véglegesítés-gombot ott a wizard-slot hiánya rejti), ezért NEM adjuk tovább.
   */
  readOnly?: boolean
}

export function AccountingTabV2({ readOnly = false, ...props }: AccountingTabV2Props) {
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
        // 2026-08-15 (egyházmegyei terv, 2.1): HATÓKÖR-TUDATOS betöltés. Megyei
        // nézetben a terv-sorok a `diocese_koltsegvetes` táblában vannak; a
        // scope elmaradása miatt eddig a gyülekezeti táblában kereste az
        // egyházmegye azonosítóját, és NÉMÁN üres tervet adott — a megyei
        // Számadás fül „0%-os megvalósulást" és 0 lejes tervezett egyenleget
        // mutatott, miközben a költségvetés ki volt töltve.
        const data = await loadBudgetRowsCompat(
          supabase,
          props.currentYear,
          props.settings.congregation_id,
          props.scope ?? 'congregation',
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
  }, [props.currentYear, props.settings.congregation_id, props.scope])

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

  // 2026-08-15 (egyházmegyei terv, 2.1): a megyei felületen CSAK az jelenjen
  // meg, aminek ott értelme van. A Tartozások/Kintlévőségek rögzítő a
  // GYÜLEKEZETI `bealitas.szamadas_tartozasok` oszlopba ír, megyei hatókörben
  // tehát némán 0 sort érintene — a lelkész kitöltötte volna, és semmi nem
  // mentődik. Helyette a megyei felküldés-kártya áll ott.
  const megyei = props.scope === 'diocese'

  return (
    <>
      {megyei && (
        <DioceseFelkuldesCard
          year={props.currentYear}
          settings={props.settings}
          readOnly={readOnly}
        />
      )}

      {/* 2026-08-14 (K2): Tartozások/Kintlévőségek (a hivatalos Számadás
          116–133. sora) — év végi rögzítő. Webes wrapper-szint: a desktop
          Könyvelés-nézete read-only pillanatkép, ott nincs értelme.
          Megyei hatókörben rejtve (lásd fent). */}
      {!megyei && (
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
      )}

      {!megyei && (
        <SzamadasTartozasokDialog
          open={tartozasokOpen}
          onOpenChange={setTartozasokOpen}
          year={props.currentYear}
          settings={props.settings}
          onSaved={() => router.refresh()}
        />
      )}

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
