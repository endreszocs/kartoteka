'use client'

/**
 * MENTÉS RÉSZLETEI (2026-08-11).
 *
 * ⚠️ EZ A DIALÓGUS JELSZÓ NÉLKÜL MŰKÖDIK, ÉS EZ SZÁNDÉKOS.
 * A `backup_log.row_counts` titkosítatlan, mert CSAK SZÁMOK vannak benne —
 * se név, se CNP, se összeg. Cserébe a mentés-előzmény böngészése, a napi
 * darabszámok és a kárjelző NEM jár SEMMILYEN adatfeltárással: a mentés
 * tartalmához hozzáférni csak a mentési jelszóval, letöltés útján lehet.
 *
 * A táblánkénti KÜLÖNBSÉG (előző naphoz mérve) azért van itt, mert ez fogja
 * meg a legcsendesebb hibát: ha egy tábla sorszáma hirtelen nullára esik, a
 * mentés „sikeres" marad, miközben az adat már nincs benne.
 */

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, Loader2 } from 'lucide-react'
import { useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { huIdopontBukarest } from '@/lib/utils/idopont-bukarest'
import { formatBajt, type BackupLogRow } from '@/app/(dashboard)/admin/biztonsagi-mentes/shared'

/**
 * ⚠️ 2026-08-11 JAVÍTÁS: `timeZone` nélkül ez a BÖNGÉSZŐ zónájában formázott.
 *    Romániában véletlenül jó volt, de egy külföldön járó esperes (vagy egy más
 *    zónára állított gép) más órát látott volna — épp azokon az időpontokon,
 *    amelyek alapján a visszaállítandó mentést kiválasztja.
 */
function huIdopont(iso: string | null): string {
  return huIdopontBukarest(iso, 'short')
}

interface Props {
  sor: BackupLogRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Csak a fő rendszergazda tölthet le. */
  letoltheto: boolean
  jelszoBeallitva: boolean
}

export function BackupDetailDialog({ sor, open, onOpenChange, letoltheto, jelszoBeallitva }: Props) {
  const [jelszo, setJelszo] = useState('')
  const [busy, setBusy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  async function letolt(media: boolean) {
    if (!sor) return
    setBusy(true)
    setHiba(null)
    try {
      // ⚠️ POST, nem GET: a jelszó SOHA nem kerülhet URL-be (proxy-napló,
      // böngésző-előzmény, Referer).
      const response = await fetch('/api/admin/backup/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ backupLogId: sor.id, jelszo, media }),
      })

      if (!response.ok) {
        let uzenet = 'A letöltés nem sikerült.'
        try {
          const t = (await response.json()) as { error?: string }
          if (t.error) uzenet = t.error
        } catch {
          /* marad az alapértelmezett */
        }
        setHiba(uzenet)
        return
      }

      const blob = await response.blob()
      const fejlec = response.headers.get('content-disposition') ?? ''
      const talalat = /filename="([^"]+)"/.exec(fejlec)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = talalat?.[1] ?? `kartoteka-mentes-${sor.runDate}.kbk`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setJelszo('')
    } catch (e: unknown) {
      setHiba(e instanceof Error ? e.message : 'A letöltés nem sikerült.')
    } finally {
      setBusy(false)
    }
  }

  if (!sor) return null

  const igazolt = sor.status === 'ok' && !!sor.driveVerifiedAt
  const tablak = Object.entries(sor.rowCounts).sort((a, b) => b[1] - a[1])

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8 text-lg text-foreground">
            {sor.congregationNev ?? 'Rendszerszintű (globális) mentés'} — {sor.runDate}
          </DialogTitle>
          <DialogDescription render={<div />} className="leading-relaxed">
            {igazolt
              ? 'Ez a mentés elkészült, feltöltődött, ÉS a rendszer vissza is olvasta a Drive-ról — a tartalom ellenőrizve.'
              : sor.status === 'hiba'
                ? 'Ez a futás HIBÁRA FUTOTT. A mentés nem használható.'
                : 'Ez a futás elindult, de NINCS igazolva (nem lett visszaolvasva a Drive-ról). Nem tekinthető kész mentésnek.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { cimke: 'Állapot', ertek: igazolt ? 'igazolt' : sor.status === 'hiba' ? 'hiba' : 'nem igazolt' },
            { cimke: 'Sorok', ertek: sor.totalRows.toLocaleString('hu-HU') },
            { cimke: 'Fájlméret', ertek: formatBajt(sor.ciphertextBytes) },
            { cimke: 'Fényképek', ertek: formatBajt(sor.mediaBytes) },
          ].map((s) => (
            <div key={s.cimke} className="rounded-xl bg-muted/60 px-3 py-2 ring-1 ring-border">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {s.cimke}
              </p>
              <p className="mt-0.5 font-heading text-sm font-semibold tabular-nums text-foreground">{s.ertek}</p>
            </div>
          ))}
        </div>

        <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <div className="flex justify-between gap-2 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">Indult</dt>
            <dd className="tabular-nums text-foreground">{huIdopont(sor.startedAt)}</dd>
          </div>
          <div className="flex justify-between gap-2 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">Befejeződött</dt>
            <dd className="tabular-nums text-foreground">{huIdopont(sor.finishedAt)}</dd>
          </div>
          <div className="flex justify-between gap-2 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">Visszaolvasva (igazolás)</dt>
            <dd className="tabular-nums text-foreground">{huIdopont(sor.driveVerifiedAt)}</dd>
          </div>
          <div className="flex justify-between gap-2 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">Környezet</dt>
            <dd className="text-foreground">{sor.env === 'test' ? 'TESZT' : 'éles'}</dd>
          </div>
          {sor.sha256 ? (
            <div className="col-span-full flex flex-col gap-0.5 border-b border-border/60 py-1">
              <dt className="text-muted-foreground">Ellenőrző összeg (SHA-256)</dt>
              <dd className="break-all font-mono text-[10px] text-foreground">{sor.sha256}</dd>
            </div>
          ) : null}
        </dl>

        {sor.status === 'hiba' && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              Hiba a(z) „{sor.failureStage ?? 'ismeretlen'}" lépésben
            </p>
            <p className="mt-1 text-xs">{sor.failureMessage ?? 'Nincs részletes hibaüzenet.'}</p>
          </div>
        )}

        {sor.figyelmeztetesek.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold">Figyelmeztetések</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {sor.figyelmeztetesek.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        {/* TÁBLÁNKÉNTI SORSZÁM — jelszó nélkül, mert csak számok */}
        {tablak.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-foreground">
              Mi van benne? ({tablak.length} tábla)
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              Csak darabszámok látszanak — a mentés tartalmához a mentési jelszó kell.
              A jobb oldali szám az előző naphoz mért különbség.
            </p>
            <ul className="max-h-64 overflow-y-auto rounded-xl border border-border">
              {tablak.map(([tabla, db]) => {
                const delta = sor.rowCountsDelta?.[tabla]
                return (
                  <li
                    key={tabla}
                    className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5 text-xs last:border-b-0 odd:bg-transparent even:bg-muted/30"
                  >
                    <span className="truncate font-mono text-foreground">{tabla}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-foreground">{db.toLocaleString('hu-HU')}</span>
                      {typeof delta === 'number' && delta !== 0 ? (
                        <span
                          className={[
                            'inline-flex items-center gap-0.5 tabular-nums',
                            delta < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                          ].join(' ')}
                        >
                          {delta < 0 ? (
                            <ArrowDownRight className="size-3" aria-hidden />
                          ) : (
                            <ArrowUpRight className="size-3" aria-hidden />
                          )}
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      ) : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* LETÖLTÉS */}
        {letoltheto && igazolt && !sor.prunedAt && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-sm font-semibold text-foreground">Letöltés</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              A letöltött fájl <strong>titkosított</strong>. A rendszer szándékosan nem fejti vissza a
              kiszolgálón: a megnyitás a saját gépeden történik, a{' '}
              <span className="font-mono">kartoteka-mentes-megnyitas.mjs</span> szkripttel és a mentési
              jelszóval. Így a nyílt adat soha nem megy át a hálózaton.
            </p>

            {!jelszoBeallitva ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
                Előbb állítsd be a mentési jelszót — enélkül nincs letöltés.
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  <Label htmlFor="backup-download-pass">Mentési jelszó</Label>
                  <Input
                    id="backup-download-pass"
                    type="password"
                    value={jelszo}
                    onChange={(e) => setJelszo(e.currentTarget.value)}
                    placeholder="A mentési jelszavad…"
                    autoComplete="off"
                    disabled={busy}
                    aria-label="Mentési jelszó a letöltéshez"
                  />
                </div>
                {hiba ? <p className="text-xs text-destructive">{hiba}</p> : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    onClick={() => void letolt(false)}
                    disabled={busy || jelszo.length === 0}
                    className="min-h-11 w-full gap-2 sm:w-auto"
                    aria-label="A mentés adatfájljának letöltése"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                    Adatfájl letöltése
                  </Button>
                  {sor.mediaDriveFileId ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void letolt(true)}
                      disabled={busy || jelszo.length === 0}
                      className="min-h-11 w-full gap-2 sm:w-auto"
                      aria-label="A fényképeket tartalmazó fájl letöltése"
                    >
                      <Download className="size-4" />
                      Fényképek letöltése
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        )}

        {sor.prunedAt && (
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <StatusBadge intent="neutral">nyesve</StatusBadge>{' '}
            Ez a mentés a megőrzési idő letelte után törlődött a Drive-ról ({huIdopont(sor.prunedAt)}).
            A napló-bejegyzés megmaradt, hogy az előzmény olvasható legyen.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
