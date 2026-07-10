'use client'

/**
 * Webes wrapper — Sprint Q F2.3, v0.7.9 (2026-04-26).
 *
 * A teljes OblioEllenőrzés tab átkerült a `@kartoteka/ui-app/finance/oblio`-ba.
 * Itt a wrapper bekötéseket biztosítja:
 *   - `BrowserOblioFileSystem` adapter (FSAccess + jszip)
 *   - 5 server action callback
 *   - 4 modal slot (Dialog shell-lel mountolva)
 *   - sonner toast
 *   - `onOpenSettings` → HELYBEN nyitja a KARTOTEKA mappa-választót
 *     (pickRootDirectory + Dexie perzisztálás). 2026-07-10-ig tévesen a
 *     /profile?tab=offline-ra navigált, amit a profil-oldal nem kezel — a
 *     lelkésznek sehol nem volt elérhető beállító (a diagnosztika admin-only).
 *
 * A régi 1637 soros implementáció a sharedban él (drift-elkerülés).
 */

import { toast } from 'sonner'

import { OblioEllenorzesTab as SharedOblioEllenorzesTab } from '@kartoteka/ui-app'
import { BrowserOblioFileSystem } from '@/lib/finance/oblio/oblio-folder'
import { isFileSystemAccessSupported, pickRootDirectory } from '@/lib/offline/fs-handle-store'
import {
  bulkSaveOblioMatches,
  listOblioMatchesAndKiadasok,
  recordOblioDownloadNow,
  removeOblioMatch,
  saveOblioMatch,
} from '@/app/(dashboard)/penzugy/oblio-ellenorzes-actions'

import { OblioManualMatchDialog } from '@/components/modals/oblio-manual-match-dialog'
import { OblioInvoicePrintDialog } from '@/components/modals/oblio-invoice-print-dialog'
import { OblioMatchDiagnosticDialog } from '@/components/modals/oblio-match-diagnostic-dialog'
import { OblioKiadasWizardDialog } from '@/components/modals/oblio-kiadas-wizard-dialog'

interface OblioEllenorzesTabProps {
  congregationSlug: string
  congregationName: string
  currentYear: number
}

export function OblioEllenorzesTab({
  congregationSlug,
  congregationName,
  currentYear,
}: OblioEllenorzesTabProps) {
  return (
    <SharedOblioEllenorzesTab
      congregationSlug={congregationSlug}
      congregationName={congregationName}
      currentYear={currentYear}
      fileSystem={BrowserOblioFileSystem}
      onLoadMatchesAndKiadasok={async (year) => {
        return await listOblioMatchesAndKiadasok(year)
      }}
      onBulkSaveMatches={async (inputs) => {
        return await bulkSaveOblioMatches(inputs)
      }}
      onSaveSingleMatch={async (input) => {
        const res = await saveOblioMatch(input)
        return {
          success: 'success' in res ? res.success : undefined,
          error: 'error' in res ? res.error : undefined,
        }
      }}
      onRemoveMatch={async (matchId) => {
        const res = await removeOblioMatch(matchId)
        return {
          success: 'success' in res ? res.success : undefined,
          error: 'error' in res ? res.error : undefined,
        }
      }}
      onRecordDownloadNow={async (timestamp) => {
        return await recordOblioDownloadNow(timestamp)
      }}
      onToast={(msg, kind) => {
        if (kind === 'error') toast.error(msg)
        else if (kind === 'success') toast.success(msg)
        else if (kind === 'warning') toast.warning(msg)
        else toast(msg)
      }}
      onOpenSettings={async () => {
        // 2026-07-10 (Oblio zsákutca-javítás): a mappa-választó HELYBEN nyílik.
        // A korábbi /profile?tab=offline cél HALOTT volt (a profil-oldal a `tab`
        // paramétert nem kezeli), az /offline/diagnostika pedig ADMIN-ONLY —
        // a lelkésznek sehol nem volt elérhető beállító. A gombkattintás érvényes
        // user-gesture a showDirectoryPicker-hez; a pickRootDirectory perzisztál
        // (Dexie), majd reload — a fül mount-kor újraellenőrzi a mappát.
        if (!isFileSystemAccessSupported()) {
          toast.error(
            'Ez a böngésző nem támogatja a mappa-hozzáférést — használj Chrome/Edge böngészőt, vagy az asztali (offline) alkalmazást.',
          )
          return
        }
        try {
          const handle = await pickRootDirectory()
          if (!handle) return // a felhasználó bezárta a választót
          toast.success(`KARTOTEKA mappa beállítva: ${handle.name}`)
          window.location.reload()
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'A mappa kiválasztása nem sikerült.')
        }
      }}
      manualMatchDialogSlot={(s) => (
        <OblioManualMatchDialog
          open={s.open}
          onOpenChange={s.onOpenChange}
          xml={s.xml}
          fileRelpath={s.fileRelpath}
          kiadasok={s.kiadasok}
          onSaved={s.onSaved}
        />
      )}
      invoicePrintDialogSlot={(s) => (
        <OblioInvoicePrintDialog
          open={s.open}
          onOpenChange={s.onOpenChange}
          meta={s.meta}
          pdfHandle={s.pdfHandle}
          fileName={s.fileName}
          congregationName={s.congregationName}
        />
      )}
      matchDiagnosticDialogSlot={(s) => (
        <OblioMatchDiagnosticDialog
          open={s.open}
          onOpenChange={s.onOpenChange}
          diagnostics={s.diagnostics}
          onManualMatch={s.onManualMatch}
          onAutoMatch={s.onAutoMatch}
          onDismiss={s.onDismiss}
        />
      )}
      kiadasWizardDialogSlot={(s) => (
        <OblioKiadasWizardDialog
          open={s.open}
          onOpenChange={s.onOpenChange}
          xmls={s.xmls}
          onCompleted={s.onCompleted}
        />
      )}
    />
  )
}
