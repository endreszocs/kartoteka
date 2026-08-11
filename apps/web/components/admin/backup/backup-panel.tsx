'use client'

/**
 * BIZTONSÁGI MENTÉS — ADMIN VEZÉRLŐ (2026-08-11).
 *
 * A felület EGYETLEN kérdésre válaszol elsőként: „TEGNAP VALÓDI VOLT-E A
 * MENTÉS?" — minden más ez alá van rendelve.
 *
 * ─── AMIT A FELÜLET SOHA NEM TESZ ──────────────────────────────────────────
 *  · nem mutat zöldet, amit nem tud bizonyítani (`drive_verified_at` nélkül
 *    nincs siker),
 *  · nem tünteti el a rossz hírt (a hibás futásokat sem a lista, sem a
 *    nyesés nem takarítja el),
 *  · nem sugallja, hogy a mentés teljes rendszer-helyreállítás — kimondja,
 *    mit NEM ment.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  DatabaseZap,
  FileWarning,
  Info,
  Loader2,
  PlayCircle,
  RefreshCw,
} from 'lucide-react'

import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  getBackupOverviewAction,
  listBackupsAction,
  runBackupNowAction,
} from '@/app/(dashboard)/admin/biztonsagi-mentes/actions'
import {
  GOOGLE_VISSZATERES_UZENETEK,
  type BackupLogRow,
  type BackupOverview,
} from '@/app/(dashboard)/admin/biztonsagi-mentes/shared'

import { BackupDetailDialog } from './backup-detail-dialog'
import { BackupListTable } from './backup-list-table'
import { BackupOverviewCard } from './backup-overview-card'
import { BackupPassphraseCard } from './backup-passphrase-card'
import { BackupRetentionCard } from './backup-retention-card'
import { GoogleDriveCard } from './google-drive-card'

interface Props {
  /** A Google-visszatérés kódja (`?google=ok|hiba` + `?ok=<kód>`). */
  googleAllapot?: 'ok' | 'hiba' | null
  googleKod?: string | null
}

export function BackupPanel({ googleAllapot, googleKod }: Props) {
  const [overview, setOverview] = useState<BackupOverview | null>(null)
  const [rows, setRows] = useState<BackupLogRow[]>([])
  const [gyulekezetek, setGyulekezetek] = useState<Array<{ id: string; nev: string }>>([])
  const [listaHiba, setListaHiba] = useState<string | null>(null)
  const [betolt, setBetolt] = useState(true)
  const [listaBetolt, setListaBetolt] = useState(true)
  const [futtat, setFuttat] = useState(false)
  const [futasUzenet, setFutasUzenet] = useState<{ ok: boolean; szoveg: string } | null>(null)

  const [szuroCong, setSzuroCong] = useState<string>('')
  const [csakHibas, setCsakHibas] = useState(false)
  const [reszlet, setReszlet] = useState<BackupLogRow | null>(null)

  const googleUzenet = useMemo(() => {
    if (!googleAllapot) return null
    const kod = googleKod ?? (googleAllapot === 'ok' ? 'ok' : '')
    return {
      ok: googleAllapot === 'ok',
      szoveg: GOOGLE_VISSZATERES_UZENETEK[kod] ?? 'A Google-összekötés nem sikerült. Próbáld újra.',
    }
  }, [googleAllapot, googleKod])

  const attekintotTolt = useCallback(async () => {
    setBetolt(true)
    try {
      setOverview(await getBackupOverviewAction())
    } finally {
      setBetolt(false)
    }
  }, [])

  const listatTolt = useCallback(async () => {
    setListaBetolt(true)
    setListaHiba(null)
    try {
      const r = await listBackupsAction({
        congregationId: szuroCong || null,
        csakHibas,
        limit: 200,
      })
      setRows(r.rows ?? [])
      setGyulekezetek(r.gyulekezetek ?? [])
      if (r.error) setListaHiba(r.error)
    } finally {
      setListaBetolt(false)
    }
  }, [szuroCong, csakHibas])

  useEffect(() => {
    void attekintotTolt()
  }, [attekintotTolt])

  useEffect(() => {
    void listatTolt()
  }, [listatTolt])

  const frissit = useCallback(() => {
    void attekintotTolt()
    void listatTolt()
  }, [attekintotTolt, listatTolt])

  async function mentesMost() {
    setFuttat(true)
    setFutasUzenet(null)
    try {
      const r = await runBackupNowAction()
      setFutasUzenet({ ok: r.success, szoveg: r.success ? (r.uzenet ?? 'Lefutott.') : (r.error ?? 'Nem sikerült.') })
      frissit()
    } finally {
      setFuttat(false)
    }
  }

  if (betolt && !overview) {
    return (
      <div className="card-raised p-4 sm:p-5">
        <AdminSkeleton rows={6} />
      </div>
    )
  }

  const needsSql = overview?.needsSql === true
  const master = overview?.master === true

  return (
    <div className="space-y-4">
      {/* A Google-visszatérés emberi üzenete (a részletek SOHA nem az URL-ből jönnek) */}
      {googleUzenet ? (
        <div
          role="status"
          className={[
            'rounded-2xl border p-3 text-sm sm:p-4',
            googleUzenet.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-destructive/40 bg-destructive/10 text-destructive',
          ].join(' ')}
        >
          {googleUzenet.szoveg}
        </div>
      ) : null}

      {/* SQL-előfeltétel — kimondva, nem elrejtve */}
      {needsSql ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <FileWarning className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold text-amber-900 dark:text-amber-100">
                A mentés-rendszer adatbázis-része még nincs telepítve
              </p>
              <p className="mt-1 text-sm leading-relaxed text-amber-800 dark:text-amber-200/90">
                A rendszer <strong>JELENLEG NEM KÉSZÍT</strong> biztonsági mentést. Futtasd le a
                Supabase SQL-szerkesztőjében:{' '}
                <span className="font-mono">
                  migration-docs/sql/2026-08-11-biztonsagi-mentes.sql
                </span>
                . A fájl végén egyetlen ellenőrző lekérdezés megmondja, mi hiányzik még.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {overview?.error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{overview.error}</p>
        </div>
      ) : null}

      {overview ? <BackupOverviewCard overview={overview} /> : null}

      {/* Vezérlő gombsor */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          onClick={() => void mentesMost()}
          disabled={futtat || needsSql}
          className="min-h-11 w-full gap-2 sm:w-auto"
          aria-label="Biztonsági mentés indítása most"
        >
          {futtat ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
          {futtat ? 'Mentés folyamatban…' : 'Mentés most'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={frissit}
          disabled={betolt || listaBetolt}
          className="min-h-11 w-full gap-2 sm:w-auto"
          aria-label="Az állapot és a lista frissítése"
        >
          <RefreshCw className="size-4" aria-hidden />
          Frissítés
        </Button>
      </div>

      {futasUzenet ? (
        <p
          role="status"
          className={[
            'rounded-2xl border p-3 text-sm leading-relaxed',
            futasUzenet.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-destructive/40 bg-destructive/10 text-destructive',
          ].join(' ')}
        >
          {futasUzenet.szoveg}
        </p>
      ) : null}

      {/* Mit ment és mit NEM — kimondva, nem sugallva */}
      <section
        aria-label="Mit ment és mit nem ment a rendszer"
        className="rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-relaxed"
      >
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <Info className="size-4 shrink-0" aria-hidden />
          Mit ment ez, és mit nem?
        </p>
        <p className="mt-2 text-muted-foreground">
          <strong className="text-foreground">Menti:</strong> az adatbázisodat — tagok, családok,
          pénzügy, anyakönyv, munkanapló, iktató, leltár, temető, jegyzőkönyvek és a személyi fényképek.
        </p>
        <p className="mt-1.5 text-muted-foreground">
          <strong className="text-foreground">NEM menti:</strong> a feltöltött FÁJLOKAT (iktatói
          szkennek, dokumentumok) — azokat a Supabase tárolója őrzi. A belépési jelszavakat: azokat a
          rendszer soha nem is látja; visszaállítás után mindenkinek újat kell kérnie. Az adatbázis
          szerkezetét (jogosultsági szabályok, függvények).
        </p>
        <p className="mt-1.5 text-muted-foreground">
          <strong className="text-foreground">Ez adat-helyreállítás, nem teljes rendszer-helyreállítás.</strong>{' '}
          A valódi katasztrófa-helyreállítás a Supabase saját időpont-visszaállítása (PITR) — ez annak a
          KIEGÉSZÍTÉSE (téves törlés és adatvesztés ellen), nem a helyettesítője.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {overview ? (
          <GoogleDriveCard drive={overview.drive} master={master} onValtozas={frissit} />
        ) : null}
        {overview ? (
          <BackupPassphraseCard
            beallitva={overview.jelszoBeallitva}
            beallitvaAt={overview.jelszoBeallitvaAt}
            master={master}
            onValtozas={frissit}
          />
        ) : null}
      </div>

      {overview ? (
        <BackupRetentionCard
          retention={overview.retention}
          riasztasEmail={overview.riasztasEmail}
          master={master}
          onValtozas={frissit}
        />
      ) : null}

      {/* ELŐZMÉNY */}
      <section aria-label="Mentési előzmény" className="card-raised space-y-3 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <DatabaseZap className="size-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg text-foreground">Mentési előzmény</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Egy sor akkor <strong>igazolt</strong>, ha a rendszer a feltöltés után vissza is olvasta a
              fájlt a Drive-ról, és az ellenőrző összeg egyezett. A többi sor nem kész mentés.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="backup-filter-cong">Gyülekezet</Label>
            <select
              id="backup-filter-cong"
              value={szuroCong}
              onChange={(e) => setSzuroCong(e.currentTarget.value)}
              aria-label="Szűrés gyülekezetre"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Minden hatókör</option>
              {gyulekezetek.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nev}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={csakHibas}
              onChange={(e) => setCsakHibas(e.currentTarget.checked)}
              className="size-4"
              aria-label="Csak a hibás vagy nem igazolt futások mutatása"
            />
            Csak ami nem igazolt
          </label>
        </div>

        {listaHiba ? (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {listaHiba}
          </p>
        ) : null}

        <BackupListTable rows={rows} loading={listaBetolt} onOpen={setReszlet} />
      </section>

      <BackupDetailDialog
        sor={reszlet}
        open={reszlet !== null}
        onOpenChange={(o) => (o ? undefined : setReszlet(null))}
        letoltheto={master}
        jelszoBeallitva={overview?.jelszoBeallitva === true}
      />
    </div>
  )
}
