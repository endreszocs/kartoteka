'use client'

/**
 * Webes DecontTab wrapper — Sprint Q F3.1 (v0.7.10).
 *
 * A korábbi 323-soros saját implementáció átalakult egy ~30-soros wrapper-ré,
 * ami a `@kartoteka/ui-app/finance/DecontTabBody`-t használja.
 * A nyomtatási logika és a toast kerete itt marad webes oldalon.
 */

import { DecontTabBody } from '@kartoteka/ui-app'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { toast } from 'sonner'

interface DecontTabProps {
  congregationName: string
}

export function DecontTab({ congregationName }: DecontTabProps) {
  return (
    <DecontTabBody
      congregationName={congregationName}
      onPrint={async ({ mode, html, filename }) => {
        if (mode === 'pdf') {
          await printToPdf(html, filename || 'Elszamolas.pdf', { format: 'a4', orientation: 'portrait' })
        } else {
          await printToBrowser(html)
        }
      }}
      onToast={(type, message) => {
        if (type === 'success') toast.success(message)
        else toast.error(message)
      }}
    />
  )
}
