'use client'

/**
 * Webes DecontTab wrapper — a hivatalos Elszamolas_2026.xlsx sablonnal.
 *
 * A megosztott `DecontTabBody` adja az UI-t és az élő előnézetet; ez a
 * wrapper köti be a server-action callback-eket (sorszám, mentés+könyvelés)
 * és a nyomtatást.
 */

import { DecontTabBody, type DecontCategoryOption } from '@kartoteka/ui-app'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { getNextDecontNumber, saveDecont } from '@/app/(dashboard)/penzugy/decont-actions'
import { toast } from 'sonner'

interface DecontTabProps {
  congregationName: string
  categories: DecontCategoryOption[]
}

export function DecontTab({ congregationName, categories }: DecontTabProps) {
  return (
    <DecontTabBody
      congregationName={congregationName}
      categories={categories}
      onGetNextNumber={getNextDecontNumber}
      onSaveDecont={saveDecont}
      onPrint={async ({ mode, html, filename }) => {
        if (mode === 'pdf') {
          await printToPdf(html, filename || 'Decont.pdf', { format: 'a4', orientation: 'portrait' })
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
