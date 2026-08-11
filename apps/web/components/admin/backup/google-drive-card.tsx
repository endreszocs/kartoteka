'use client'

/**
 * GOOGLE DRIVE KAPCSOLAT-KÁRTYA (2026-08-11).
 *
 * ─── AMIT A FELÜLET KIMOND (nem sugall) ────────────────────────────────────
 *  · a hatókör KIZÁRÓLAG `drive.file`: az alkalmazás CSAK a saját fájljait
 *    látja — a leveleidhez, fényképeidhez, irataidhoz nem fér hozzá,
 *  · a célmappát AZ ALKALMAZÁS hozza létre — kézzel készített mappát NEM lát,
 *  · ha a Drive felületén kézzel elmozgatod vagy törlöd a fájlokat, azok az
 *    alkalmazás számára ELTŰNNEK (ezért van napló ⇄ Drive egyeztetés),
 *  · a Google a FÁJLNEVET és a MÉRETET látja; a tartalmat nem, mert titkosított.
 */

import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
  PlugZap,
  RefreshCw,
  Unplug,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { AdminConfirmDialog } from '@/components/admin/admin-confirm-dialog'
import {
  disconnectDriveAction,
  reconcileDriveAction,
  testDriveConnectionAction,
} from '@/app/(dashboard)/admin/biztonsagi-mentes/actions'
import type { DriveConnectionStatus } from '@/app/(dashboard)/admin/biztonsagi-mentes/shared'

interface Props {
  drive: DriveConnectionStatus
  master: boolean
  onValtozas: () => void
}

interface Visszajelzes {
  ok: boolean
  szoveg: string
  lepesek?: Array<{ lepes: string; ok: boolean }>
}

export function GoogleDriveCard({ drive, master, onValtozas }: Props) {
  const [busy, setBusy] = useState<'teszt' | 'bont' | 'egyeztet' | null>(null)
  const [visszajelzes, setVisszajelzes] = useState<Visszajelzes | null>(null)
  const [bontasNyitva, setBontasNyitva] = useState(false)

  const hibas = drive.tokenAllapot === 'hiba'

  async function teszt() {
    setBusy('teszt')
    setVisszajelzes(null)
    try {
      const r = await testDriveConnectionAction()
      setVisszajelzes({
        ok: r.success,
        szoveg: r.success ? (r.uzenet ?? 'A kapcsolat működik.') : (r.error ?? 'A teszt elhasalt.'),
        lepesek: r.lepesek,
      })
      onValtozas()
    } finally {
      setBusy(null)
    }
  }

  async function egyeztet() {
    setBusy('egyeztet')
    setVisszajelzes(null)
    try {
      const r = await reconcileDriveAction()
      setVisszajelzes({ ok: r.success, szoveg: r.success ? (r.uzenet ?? 'Egyeztetve.') : (r.error ?? 'Az egyeztetés elhasalt.') })
      onValtozas()
    } finally {
      setBusy(null)
    }
  }

  async function bont() {
    setBusy('bont')
    setVisszajelzes(null)
    try {
      const r = await disconnectDriveAction()
      setVisszajelzes({ ok: r.success, szoveg: r.success ? (r.uzenet ?? 'Szétkapcsolva.') : (r.error ?? 'Nem sikerült.') })
      onValtozas()
    } finally {
      setBusy(null)
      setBontasNyitva(false)
    }
  }

  return (
    <section aria-label="Google Drive kapcsolat" className="card-raised space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div
          className={[
            'flex size-11 shrink-0 items-center justify-center rounded-2xl',
            drive.osszekotve && !hibas
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'bg-muted text-muted-foreground',
          ].join(' ')}
        >
          {drive.osszekotve && !hibas ? <Cloud className="size-6" /> : <CloudOff className="size-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-lg text-foreground">Google Drive</h2>
            {drive.osszekotve && !hibas ? (
              <StatusBadge intent="success" dot>
                összekötve
              </StatusBadge>
            ) : hibas ? (
              <StatusBadge intent="danger" dot>
                kapcsolat megszakadt
              </StatusBadge>
            ) : (
              <StatusBadge intent="warning" dot>
                nincs összekötve
              </StatusBadge>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {drive.osszekotve
              ? 'A napi mentések titkosítva kerülnek fel ebbe a Google-fiókba. A Google a fájlnevet és a méretet látja — a tartalmat nem.'
              : 'Amíg nincs összekötve, a mentések sehová nem kerülnek fel. A rendszer csak a saját maga által létrehozott fájlokat látja a Drive-on.'}
          </p>
          {drive.fiokEmail ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Fiók: <span className="font-mono text-foreground">{drive.fiokEmail}</span>
            </p>
          ) : null}
        </div>
      </div>

      {hibas && drive.tokenHiba ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{drive.tokenHiba}</p>
        </div>
      ) : null}

      {/* Amit a felület KIMOND */}
      <ul className="space-y-1 rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <li>
          <strong className="text-foreground">Csak a saját fájljaink.</strong> Az engedély
          (<span className="font-mono">drive.file</span>) kizárólag azokra a fájlokra érvényes, amelyeket
          ez az alkalmazás hozott létre. A leveleidhez, fényképeidhez, irataidhoz nem fér hozzá.
        </li>
        <li>
          <strong className="text-foreground">A mappát az alkalmazás hozza létre.</strong> Kézzel
          létrehozott mappát nem lát — ezért ne adj meg sajátot, és ne nevezd át.
        </li>
        <li>
          <strong className="text-foreground">Kézi elmozgatás = eltűnés.</strong> Ha a Drive felületén
          áthelyezed vagy törlöd a fájlokat, számunkra megszűnnek létezni. A rendszer ezt észreveszi és
          jelzi („a napló szerint 28 fájl kellene, a Drive-on 19 található”).
        </li>
      </ul>

      {master ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {/* Teljes oldal-navigáció a Google engedélyező oldalára — ezért `<a>`,
              nem gomb. A cél route `access_type=offline&prompt=consent`
              paraméterekkel hív; enélkül a Google NEM ad tartós hozzáférést. */}
          <a
            href="/api/auth/google-drive/start"
            aria-label={drive.osszekotve ? 'A Google Drive újracsatlakoztatása' : 'A Google Drive összekötése'}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/92 sm:w-auto"
          >
            <PlugZap className="size-4" aria-hidden />
            {drive.osszekotve ? 'Újracsatlakoztatás' : 'Google Drive összekötése'}
          </a>

          <Button
            type="button"
            variant="outline"
            onClick={() => void teszt()}
            disabled={busy !== null || !drive.osszekotve}
            className="min-h-11 w-full gap-2 sm:w-auto"
            aria-label="A Google Drive kapcsolat tesztelése próbafájllal"
          >
            {busy === 'teszt' ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Kapcsolat tesztelése
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => void egyeztet()}
            disabled={busy !== null || !drive.osszekotve}
            className="min-h-11 w-full gap-2 sm:w-auto"
            aria-label="A napló és a Drive tartalmának egyeztetése"
          >
            {busy === 'egyeztet' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Egyeztetés a Drive-val
          </Button>

          {drive.osszekotve ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setBontasNyitva(true)}
              disabled={busy !== null}
              className="min-h-11 w-full gap-2 text-destructive sm:w-auto"
              aria-label="A Google Drive kapcsolat bontása"
            >
              <Unplug className="size-4" aria-hidden />
              Szétkapcsolás
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          A Google-kapcsolat kezelése a fő rendszergazda joga — a mentések célhelye rendszerszintű döntés.
        </p>
      )}

      {visszajelzes ? (
        <div
          className={[
            'rounded-xl border p-3 text-sm',
            visszajelzes.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-destructive/40 bg-destructive/10 text-destructive',
          ].join(' ')}
          role="status"
        >
          <p>{visszajelzes.szoveg}</p>
          {visszajelzes.lepesek && visszajelzes.lepesek.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-xs">
              {visszajelzes.lepesek.map((l) => (
                <li key={l.lepes}>
                  {l.ok ? '✓' : '✗'} {l.lepes}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {drive.mappaId ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          A mentések a <span className="font-mono">KARTOTEKA mentesek</span> mappába kerülnek. Ha a fiók
          megtelik, az új mentés <strong>hangos hibával</strong> leáll — a rendszer SOHA nem töröl régi
          mentést azért, hogy helyet csináljon egy újnak.
        </p>
      ) : null}

      <AdminConfirmDialog
        open={bontasNyitva}
        onOpenChange={(o) => (busy ? undefined : setBontasNyitva(o))}
        title="Biztosan bontod a Google-kapcsolatot?"
        tone="danger"
        description={
          <>
            A szétkapcsolás után <strong>ÚJ MENTÉS NEM KÉSZÜL</strong>, amíg újra össze nem kötöd.
            <br />
            <br />
            A már feltöltött fájlok a Drive-on <strong>maradnak</strong> — azokat a Google felületén tudod
            kezelni. A tárolt hozzáférés (refresh token) viszont véglegesen törlődik.
          </>
        }
        confirmLabel="Igen, szétkapcsolom"
        loading={busy === 'bont'}
        onConfirm={() => void bont()}
      />
    </section>
  )
}
