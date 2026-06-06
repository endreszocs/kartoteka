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
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

type WebMonetaryTabProps = Pick<
  MonetaryTabProps,
  'expectedCashBalance' | 'currentYear' | 'bankAccounts' | 'internalTransfers' | 'congregationName'
>

export function MonetaryTabV2(props: WebMonetaryTabProps) {
  return (
    <MonetaryTab
      {...props}
      onPrint={async ({ mode, html, filename }) => {
        if (mode === 'pdf') {
          await printToPdf(html, filename || 'Monetar.pdf', { format: 'a4', orientation: 'portrait' })
        } else {
          await printToBrowser(html)
        }
      }}
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
