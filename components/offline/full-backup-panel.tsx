'use client'

import { useState, useTransition } from 'react'
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  Loader2,
  Lock,
  ShieldAlert,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  createFullBackup,
  downloadBlob,
  type FullBackupResult,
} from '@/lib/offline/full-backup'

/**
 * Full Backup Panel — egy gombnyomással ZIP-elhető pillanatkép a teljes
 * gyülekezeti adatállományról. A user lementi USB stickre, titkosított
 * merevlemezre, vagy egyszerűen archiválja a havi/éves zárás után.
 */

export function FullBackupPanel({
  congregationId,
  congregationSlug,
  congregationName,
  exportedBy,
}: {
  congregationId: string | null
  congregationSlug: string
  congregationName?: string | null
  exportedBy: string
}) {
  const [isPending, startTransition] = useTransition()
  const [lastResult, setLastResult] = useState<FullBackupResult | null>(null)

  function handleCreateBackup() {
    if (!congregationId) {
      toast.error('Nincs aktív gyülekezet.')
      return
    }

    if (
      !confirm(
        '⚠️ Teljes backup létrehozása\n\n' +
          'Egy ZIP archívum készül a teljes gyülekezeti adatállományról ' +
          '(személyes adatok, pénzügyi adatok, anyakönyv stb.).\n\n' +
          'A fájl SZEMÉLYES ADATOKAT tartalmaz. Csak titkosított vagy ' +
          'biztonságos helyre mentsd! Ne küldd el e-mailben, ne tedd felhőbe.\n\n' +
          'Folytatás?',
      )
    ) {
      return
    }

    startTransition(async () => {
      try {
        // Browser-only: a getDb() is csak itt fut le
        const result = await createFullBackup({
          congregationId,
          congregationSlug,
          congregationName: congregationName ?? undefined,
          exportedBy,
          // A FullBackupResult nem használja a rootHandle-t (Dexie-ből dolgozik),
          // de az ExportContext típus megköveteli — egy fake handle-t adunk
          rootHandle: {} as FileSystemDirectoryHandle,
        })

        setLastResult(result)
        downloadBlob(result.blob, result.fileName)

        toast.success(
          `Backup kész! ${result.totalRows.toLocaleString('hu-HU')} rekord, ` +
            `${(result.size / 1024 / 1024).toFixed(2)} MB, ` +
            `${(result.durationMs / 1000).toFixed(1)}s.`,
        )
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : 'Backup létrehozása sikertelen.',
        )
      }
    })
  }

  return (
    <div className="card-raised overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-purple-50/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-purple-600" />
          <h3 className="font-heading text-lg text-slate-800">
            Teljes biztonsági mentés
          </h3>
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
            Fázis 6
          </span>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-4 text-sm text-purple-900">
          <p className="mb-2 font-semibold">
            <Archive className="mr-1 inline h-4 w-4" />
            Mit tartalmaz egy backup ZIP?
          </p>
          <ul className="list-inside list-disc space-y-0.5 pl-2 text-xs">
            <li>
              <strong>snapshot.json</strong> — teljes adatbázis pillanatkép a
              Dexie cache-ből (minden tábla, minden sor)
            </li>
            <li>
              <strong>META.json</strong> — gyülekezet info, időpont, statisztika
            </li>
            <li>
              <strong>README.txt</strong> — magyarázat és visszaállítási útmutató
            </li>
          </ul>
          <p className="mt-2 text-xs">
            Ezt a fájlt USB stickre, titkosított külső HDD-re, vagy katasztrófa
            esetére (pl. Iroda elektromos meghibásodás) tarthatod. Egy másik
            számítógépen vissza is tölthető.
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
          <p className="font-semibold">
            <ShieldAlert className="mr-1 inline h-4 w-4" />
            GDPR — biztonsági figyelmeztetés
          </p>
          <p className="mt-1 text-xs">
            A ZIP <strong>NEM titkosított</strong>. Tartalmaz neveket, CNP-ket,
            telefonszámokat, pénzügyi adatokat. Ezeket csak <strong>biztonságos
            helyen</strong> tarthatod:
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 pl-2 text-xs">
            <li>
              <Lock className="mr-1 inline h-3 w-3" />
              VeraCrypt vagy hasonló titkosított kötet
            </li>
            <li>
              <Lock className="mr-1 inline h-3 w-3" />
              BitLocker-titkosított külső merevlemez
            </li>
            <li>
              Fizikailag elzárt USB stick (pl. zárt szekrényben)
            </li>
          </ul>
          <p className="mt-1 text-xs font-semibold">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            NE küldd e-mailben, NE tedd OneDrive/Dropbox/Google Drive mappába!
          </p>
        </div>

        <Button
          size="lg"
          className="w-full rounded-xl bg-purple-600 hover:bg-purple-700"
          onClick={handleCreateBackup}
          disabled={isPending || !congregationId}
        >
          {isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-4 w-4" />
          )}
          {isPending
            ? 'Backup készítés folyamatban...'
            : 'Teljes backup letöltése (.zip)'}
        </Button>

        {lastResult && (
          <div className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/60">
            <div className="border-b border-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
              Utolsó backup ({new Date().toLocaleString('hu-HU')})
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 text-xs text-slate-700 sm:grid-cols-4">
              <div>
                <span className="block text-slate-500">Sor</span>
                <span className="font-semibold">
                  {lastResult.totalRows.toLocaleString('hu-HU')}
                </span>
              </div>
              <div>
                <span className="block text-slate-500">Méret</span>
                <span className="font-semibold">
                  {(lastResult.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <div>
                <span className="block text-slate-500">Idő</span>
                <span className="font-semibold">
                  {(lastResult.durationMs / 1000).toFixed(2)} s
                </span>
              </div>
              <div>
                <span className="block text-slate-500">Modul</span>
                <span className="font-semibold">
                  {lastResult.modulesExported}
                </span>
              </div>
            </div>
            <div className="border-t border-emerald-100 bg-white/60 px-3 py-2 text-[11px] font-mono text-slate-600">
              {lastResult.fileName}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
