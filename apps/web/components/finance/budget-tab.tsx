'use client'

/**
 * Webes BudgetTab wrapper.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.0): a vizuális réteg átkerült a
 * `@kartoteka/ui-app` shared package `BudgetTab` komponensébe.
 */

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { BudgetTab as SharedBudgetTab, type BudgetTabProps } from '@kartoteka/ui-app'

import {
  finalizeBudget,
  finalizeBudgetModification,
  getPreviousYearActuals,
  requestBudgetUnlock,
  saveBudgetModificationAction,
  saveBudgetRowsAction,
} from '@/app/(dashboard)/penzugy/actions'
import { submitDocument } from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
// 2026-07-10 (S3-#4): a MENTÉS szerver-akción megy (zár-ellenőrzéssel) — kliens-oldali
// compat-hívás csak az OLVASÁSRA (loadBudgetRowsCompat) maradt.
import { loadBudgetRowsCompat } from '@/lib/finance/budget-compat'
import { createClient } from '@/lib/supabase/client'

// 2026-07-10 (#2): carryoverCash/carryoverBank (nyitó blokk) átengedése a shared tabnak.
type WebBudgetTabProps = Pick<
  BudgetTabProps,
  'szamadasiCellek' | 'settings' | 'currentYear' | 'carryoverCash' | 'carryoverBank'
>

export function BudgetTab(props: WebBudgetTabProps) {
  const router = useRouter()
  return (
    <SharedBudgetTab
      {...props}
      // 2026-07-10 (S2 #9): logós betöltő-állapot.
      loadingLogoSrc="/kartoteka-icon.png"
      // 2026-07-10 (#2): előző évi tény betöltése (szürke referencia-oszlop) —
      // a server action a year-1 évet aggregálja szamadasicel-kód szerint.
      loadPreviousActuals={async (year) => await getPreviousYearActuals(year)}
      loadBudgetRows={async (year, congregationId) => {
        const supabase = createClient()
        try {
          const data = await loadBudgetRowsCompat(supabase, year, congregationId)
          return { rows: data, error: null }
        } catch (e) {
          return {
            rows: [],
            error: e instanceof Error ? e.message : 'Ismeretlen hiba',
          }
        }
      }}
      // 2026-07-10 (S3-#4): a mentés SZERVER-akció — a budget_finalized /
      // budget_modN_finalized zárat a szerver ellenőrzi (a kliens-oldali írás
      // a zárat megkerülhette). A scope-ot (congregationId) a szerver oldja fel.
      saveBudgetRows={async (year, _congregationId, rows) => {
        const result = await saveBudgetRowsAction(year, rows)
        return result.error ? { error: result.error } : { success: true }
      }}
      saveBudgetModification={async (year, _congregationId, modNum, rows) => {
        const result = await saveBudgetModificationAction(year, modNum, rows)
        return result.error ? { error: result.error } : { success: true }
      }}
      finalizeBudget={async (year) => {
        const result = await finalizeBudget(year)
        return { error: 'error' in result ? result.error : null }
      }}
      finalizeBudgetModification={async (year, modNum) => {
        const result = await finalizeBudgetModification(year, modNum)
        return { error: 'error' in result ? result.error : null }
      }}
      submitDocument={async (docType, year, snapshot, modNum) => {
        const result = await submitDocument(docType, year, snapshot, modNum)
        return { error: 'error' in result ? result.error : null }
      }}
      requestBudgetUnlock={async (year, reason) => {
        const result = await requestBudgetUnlock(year, reason)
        return { error: 'error' in result ? result.error : null }
      }}
      onRefresh={() => router.refresh()}
      onToast={(msg, kind) => {
        if (kind === 'error') toast.error(msg)
        else if (kind === 'success') toast.success(msg)
        else toast(msg)
      }}
    />
  )
}
