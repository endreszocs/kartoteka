'use client'

/**
 * OblioFolderWarningDialog — 2026-07-10 (S4 #10).
 *
 * Elegáns figyelmeztető dialog a Tranzakciók fülre: akkor jelenik meg, ha a
 * felhasználó Oblio-funkciót indítana (SPV-egyeztetés ikon), de még NINCS
 * kiválasztva a KARTOTEKA mappa (File System Access handle a Dexie-ben).
 *
 * A mappa-választó HELYBEN nyílik meg — a minta az
 * `oblio-ellenorzes-tab.tsx` `onOpenSettings` bekötése (pickRootDirectory +
 * Dexie perzisztálás), DE reload NÉLKÜL: sikeres választás után az `onReady`
 * callback fut, így a megszakított funkció (fülváltás) azonnal folytatódik.
 *
 * Mobil (375px): a DialogContent alapból max-w-[calc(100%-2rem)], a gombok
 * flex-wrap-pel törnek, min. 40px érintőfelülettel.
 */

import { useState } from 'react'
import { FolderCog, Loader2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  isFileSystemAccessSupported,
  pickRootDirectory,
} from '@/lib/offline/fs-handle-store'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Sikeres mappa-választás után hívjuk (reload nélkül) — a hívó frissíti a
   * saját `oblioFolderReady` állapotát és folytatja a megszakított funkciót.
   */
  onReady: (folderName: string) => void
}

export function OblioFolderWarningDialog({ open, onOpenChange, onReady }: Props) {
  const [picking, setPicking] = useState(false)
  const supported = isFileSystemAccessSupported()

  async function handlePick() {
    // 2026-07-10 (S4 #10): a gombkattintás érvényes user-gesture a
    // showDirectoryPicker-hez; a pickRootDirectory perzisztál (Dexie).
    // Az oblio-ellenorzes-tab onOpenSettings mintája — reload NÉLKÜL.
    setPicking(true)
    try {
      const handle = await pickRootDirectory()
      if (!handle) return // a felhasználó bezárta a választót
      toast.success(`KARTOTEKA mappa beállítva: ${handle.name}`)
      onReady(handle.name)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A mappa kiválasztása nem sikerült.')
    } finally {
      setPicking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-cyan-800">
            <FolderCog className="size-5 shrink-0 text-cyan-600" aria-hidden />
            Oblio mappa szükséges
          </DialogTitle>
        </DialogHeader>

        {/* Figyelmeztető kártya — cyan színvilág, a közös card-stílus szerint */}
        <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
              <FolderCog className="size-5" aria-hidden />
            </span>
            <p className="text-sm leading-relaxed text-cyan-900">
              Az Oblio számla-fájlok a számítógépeden tárolódnak — először
              válaszd ki a <strong>KARTOTEKA</strong> mappát.
            </p>
          </div>
        </div>

        {supported ? (
          <div className="flex flex-wrap justify-end gap-2">
            {/* size="lg" = 40px magas gombok — mobil érintőfelület-követelmény */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onOpenChange(false)}
              disabled={picking}
            >
              Mégse
            </Button>
            <Button
              type="button"
              size="lg"
              className="bg-cyan-600 text-white hover:bg-cyan-700"
              onClick={handlePick}
              disabled={picking}
            >
              {picking ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FolderCog className="size-4" aria-hidden />
              )}
              Mappa kiválasztása
            </Button>
          </div>
        ) : (
          // Firefox/Safari: nincs File System Access API — itt nem tudunk
          // mappát választani, csak tájékoztatunk (Chrome/Edge vagy desktop).
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Ez a böngésző nem támogatja a mappa-hozzáférést — használj
                Chrome/Edge böngészőt, vagy az asztali (offline) alkalmazást.
              </span>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => onOpenChange(false)}
              >
                Rendben
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
