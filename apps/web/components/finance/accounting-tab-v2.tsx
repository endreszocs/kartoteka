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

import { requestAccountingUnlock } from '@/app/(dashboard)/penzugy/actions'
import { AccountingFinalizeWizard } from '@/components/modals/accounting-finalize-wizard-dialog'
import { loadBudgetRowsCompat } from '@/lib/finance/budget-compat'
import { createClient } from '@/lib/supabase/client'

type AccountingTabV2Props = Omit<
  AccountingTabProps,
  'budgetData' | 'loading' | 'onRequestUnlock' | 'onRefresh' | 'onToast' | 'finalizeWizardSlot'
>

export function AccountingTabV2(props: AccountingTabV2Props) {
  const router = useRouter()
  const [budgetData, setBudgetData] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

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

  return (
    <AccountingTab
      {...props}
      budgetData={budgetData}
      loading={loading}
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
  )
}
