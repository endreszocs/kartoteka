'use client'

/**
 * Webes FinanceSugoTab wrapper.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.3): a vizuális réteg + a checklist átkerült
 * a `@kartoteka/ui-app/finance` shared package-be (FinanceSugoTab +
 * FinanceSugoChecklist komponensek). A wrapper a webes oldalon a
 * print engine-t (`print-engine-v2.ts` + `guide-pdfs.ts`) köti be a callback
 * prop-okra, és a `sonner` toast-ot biztosítja. A `finalizeHref` a webes
 * routing-on alapul.
 *
 * A shared komponens platform-független — desktop (Tauri) és iOS
 * (Tauri-mobile) oldalon ugyanaz a komponens fut, csak a print/toast
 * implementáció cserélődik a wrapperben.
 */

import { toast } from 'sonner'

import {
  FinanceSugoTab as SharedFinanceSugoTab,
  type FinanceSugoTopicPdfData,
} from '@kartoteka/ui-app'

import { buildTopicPdfHtml } from '@/lib/finance/guide-pdfs'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

export function FinanceSugoTab() {
  return (
    <SharedFinanceSugoTab
      finalizeHref="/penzugy?tab=accounting"
      onPrintTopicToBrowser={async (topicData: FinanceSugoTopicPdfData) => {
        const html = buildTopicPdfHtml(topicData)
        await printToBrowser(html)
      }}
      onPrintTopicToPdf={async (topicData: FinanceSugoTopicPdfData, filename: string) => {
        const html = buildTopicPdfHtml(topicData)
        await printToPdf(html, filename, {
          orientation: 'portrait',
          margin: [15, 15],
          format: 'a4',
        })
      }}
      onToast={(msg, kind) => {
        if (kind === 'error') toast.error(msg)
        else if (kind === 'success') toast.success(msg)
        else if (kind === 'warning') toast.warning(msg)
        else toast(msg)
      }}
    />
  )
}
