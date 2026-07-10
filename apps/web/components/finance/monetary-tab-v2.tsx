'use client'

/**
 * Webes MonetaryTabV2 wrapper.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.0): a vizuális réteg átkerült a
 * `@kartoteka/ui-app` shared package `MonetaryTab` komponensébe.
 */

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { MonetaryTab, type MonetaryTabProps } from '@kartoteka/ui-app'

import { softDeleteInternalTransferAction } from '@/app/(dashboard)/penzugy/belsomozgas-actions'
import {
  getMonetarySnapshot,
  saveMonetarySnapshot,
} from '@/app/(dashboard)/penzugy/monetary-actions'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

// 2026-07-10 (S3 #2): a `compact` prop is átmegy — a lebegő Monetár-widget
// (monetar-floating-widget.tsx) kompakt módban mountolja ugyanezt a wrappert,
// így a mentés/nyomtatás/törlés funkcionalitás EGYETLEN helyen él tovább.
type WebMonetaryTabProps = Pick<
  MonetaryTabProps,
  'expectedCashBalance' | 'currentYear' | 'bankAccounts' | 'internalTransfers' | 'congregationName' | 'compact'
>

export function MonetaryTabV2(props: WebMonetaryTabProps) {
  const router = useRouter()
  return (
    <MonetaryTab
      {...props}
      // 2026-07-10 (holtkód-javítás): a mester-mozgás (valutacsere/bank↔bank)
      // törlése — a softDeleteInternalTransferAction eddig hívó nélkül állt.
      onDeleteTransfer={async (transferId) => {
        const res = await softDeleteInternalTransferAction(transferId)
        if (res.success) router.refresh()
        return { success: res.success, error: res.success ? null : res.error }
      }}
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
