'use client'

/**
 * Webes MonetaryTabV2 wrapper.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.0): a vizuális réteg átkerült a
 * `@kartoteka/ui-app` shared package `MonetaryTab` komponensébe.
 */

import { toast } from 'sonner'

import { MonetaryTab, type MonetaryTabProps } from '@kartoteka/ui-app'

import {
  getMonetarySnapshot,
  saveMonetarySnapshot,
} from '@/app/(dashboard)/penzugy/monetary-actions'

type WebMonetaryTabProps = Pick<
  MonetaryTabProps,
  'expectedCashBalance' | 'currentYear' | 'bankAccounts' | 'internalTransfers'
>

export function MonetaryTabV2(props: WebMonetaryTabProps) {
  return (
    <MonetaryTab
      {...props}
      loadSnapshot={async (year) => {
        const result = await getMonetarySnapshot(year)
        if ('error' in result) {
          return { denominations: [], counts: {}, error: result.error }
        }
        return { denominations: result.denominations, counts: result.counts }
      }}
      saveSnapshot={async (year, items) => {
        const result = await saveMonetarySnapshot(year, items)
        return { error: 'error' in result ? result.error : null }
      }}
      onToast={(msg, kind) => {
        if (kind === 'error') toast.error(msg)
        else if (kind === 'success') toast.success(msg)
        else toast(msg)
      }}
    />
  )
}
