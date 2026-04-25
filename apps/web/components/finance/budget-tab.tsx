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
  requestBudgetUnlock,
} from '@/app/(dashboard)/penzugy/actions'
import { submitDocument } from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
import {
  loadBudgetRowsCompat,
  saveBudgetModification as saveBudgetModificationCompat,
  saveBudgetRowsCompat,
} from '@/lib/finance/budget-compat'
import { createClient } from '@/lib/supabase/client'

type WebBudgetTabProps = Pick<
  BudgetTabProps,
  'szamadasiCellek' | 'settings' | 'currentYear'
>

export function BudgetTab(props: WebBudgetTabProps) {
  const router = useRouter()
  return (
    <SharedBudgetTab
      {...props}
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
      saveBudgetRows={async (year, congregationId, rows) => {
        const supabase = createClient()
        try {
          await saveBudgetRowsCompat(supabase, year, congregationId, rows)
          return { success: true }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'Mentési hiba' }
        }
      }}
      saveBudgetModification={async (year, congregationId, modNum, rows) => {
        const supabase = createClient()
        try {
          await saveBudgetModificationCompat(supabase, year, congregationId, modNum, rows)
          return { success: true }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'Mentési hiba' }
        }
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
