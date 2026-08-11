'use client'

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ADAT-VISSZAÁLLÍTÁS — a rendszer legveszélyesebb gombja. 2026-08-11.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A folyamat SZÁNDÉKOSAN lassú, és nem lehet átugrani lépéseket:
 *
 *   1. gyülekezet  →  2. mentés  →  3. mentési jelszó
 *   4. SZÁRAZ FUTÁS (kötelező) — megmutatja, mi tűnne el, nevekkel
 *   5. a gyülekezet PONTOS neve begépelve
 *   6. a mentés DÁTUMA begépelve (hogy elolvasd, melyik pillanatot választod)
 *   7. megerősítő dialógus + kötelező indoklás + 5 másodperces késleltetés
 *
 * A 4. lépés kihagyhatatlansága NEM a felületen múlik: a szerver csak olyan
 * terv-tokent fogad el, amit a száraz futás adott ki, és az adatbázis egy
 * tokent EGYSZER enged felhasználni.
 *
 * MOBIL: ez az EGYETLEN felület a projektben, ami szándékosan asztali gépet
 * kér. Nem azért, mert nem fér ki — hanem mert a „mit veszítek" lista
 * végigolvasása nélkül ezt a gombot nem szabad megnyomni. Mobilon a gomb
 * HELYÉN áll a magyarázat, nem a gomb.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  History,
  LifeBuoy,
  Loader2,
  RotateCcw,
  Search,
  ShieldAlert,
  Smartphone,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AdminConfirmDialog } from '@/components/admin/admin-confirm-dialog'
import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'
import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { huIdopontBukarest } from '@/lib/utils/idopont-bukarest'

import {
  listRestorableBackupsAction,
  listRestoreCongregationsAction,
  restoreExecuteAction,
  restorePreviewAction,
} from '@/app/(dashboard)/admin/biztonsagi-mentes/restore-actions'
import {
  RESTORE_INDOKLAS_MIN,
  RESTORE_KESLELTETES_MP,
  type RestorableBackup,
  type RestoreExecuteResult,
  type RestorePreview,
} from '@/app/(dashboard)/admin/biztonsagi-mentes/restore-shared'

import { RestorePreviewPanel } from './restore-preview'

/**
 * ⚠️ 2026-08-11 JAVÍTÁS: `timeZone` nélkül a BÖNGÉSZŐ zónájában formázott.
 *    A visszaállító panelen a felhasználó ezekből az időpontokból választja ki,
 *    MELYIK mentést tölti vissza — ez a lehető legrosszabb hely egy elcsúszott
 *    órára. Mostantól mindig romániai idő.
 */
function datumIdo(iso: string | null | undefined): string {
  return huIdopontBukarest(iso, 'short')
}

const FAJTA_FELIRAT: Record<string, string> = {
  napi: 'napi',
  kezi: 'kézi',
  pre_restore: 'visszaállítás előtti',
}

export function RestorePanel({ onFinished }: { onFinished?: () => void }) {
  // ── betöltés ──────────────────────────────────────────────────────────
  const [congregations, setCongregations] = useState<Array<{ id: string; nev: string }>>([])
  const [betolt, setBetolt] = useState(true)
  const [betoltesHiba, setBetoltesHiba] = useState<string | null>(null)
  const [nincsJog, setNincsJog] = useState(false)

  // ── kiválasztás ───────────────────────────────────────────────────────
  const [congId, setCongId] = useState('')
  const [backups, setBackups] = useState<RestorableBackup[]>([])
  const [backupsBetolt, setBackupsBetolt] = useState(false)
  const [backupId, setBackupId] = useState('')
  const [jelszo, setJelszo] = useState('')

  // ── száraz futás ──────────────────────────────────────────────────────
  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [previewFut, setPreviewFut] = useState(false)
  const [previewHiba, setPreviewHiba] = useState<string | null>(null)

  // ── megerősítés ───────────────────────────────────────────────────────
  const [nevBegepelve, setNevBegepelve] = useState('')
  const [datumBegepelve, setDatumBegepelve] = useState('')
  const [dialogNyitva, setDialogNyitva] = useState(false)
  const [dialogNyitvaOta, setDialogNyitvaOta] = useState<number | null>(null)
  /** Másodperc-ütem a két visszaszámlálóhoz (terv-token lejárat + késleltetés). */
  const [most, setMost] = useState(() => Date.now())
  const [fut, setFut] = useState(false)
  const [eredmeny, setEredmeny] = useState<RestoreExecuteResult | null>(null)

  const load = useCallback(() => {
    setBetolt(true)
    setBetoltesHiba(null)
    setNincsJog(false)
    void listRestoreCongregationsAction()
      .then((res) => {
        if (res.success) {
          setCongregations(res.rows)
        } else if (res.nincsJog) {
          setNincsJog(true)
        } else {
          setBetoltesHiba(res.error ?? 'Nem sikerült betölteni a gyülekezeteket.')
        }
      })
      .catch((e: unknown) =>
        setBetoltesHiba(e instanceof Error ? e.message : 'Nem sikerült betölteni a gyülekezeteket.'),
      )
      .finally(() => setBetolt(false))
  }, [])

  useEffect(() => {
    const raf = requestAnimationFrame(() => load())
    return () => cancelAnimationFrame(raf)
  }, [load])

  // A gyülekezet váltása MINDENT nulláz — a száraz futás egy adott
  // pillanathoz tartozik, nem vihető át máshova.
  const valasztGyulekezet = useCallback((id: string) => {
    setCongId(id)
    setBackupId('')
    setPreview(null)
    setPreviewHiba(null)
    setNevBegepelve('')
    setDatumBegepelve('')
    setEredmeny(null)
    setBackups([])
    if (!id) return
    setBackupsBetolt(true)
    void listRestorableBackupsAction(id)
      .then((res) => {
        if (res.success) setBackups(res.rows)
        else setPreviewHiba(res.error ?? 'Nem sikerült betölteni a mentéseket.')
      })
      .catch((e: unknown) =>
        setPreviewHiba(e instanceof Error ? e.message : 'Nem sikerült betölteni a mentéseket.'),
      )
      .finally(() => setBackupsBetolt(false))
  }, [])

  // EGYETLEN másodperc-ütem hajtja mindkét visszaszámlálót (a terv-token
  // lejáratát és az 5 másodperces késleltetést). Így nincs setState az effekt
  // törzsében — a két időzítő SZÁMÍTOTT érték, nem külön állapot.
  useEffect(() => {
    const id = window.setInterval(() => setMost(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // A terv-token hátralévő ideje. Lejárat után a gomb letiltva — a látott
  // lista addigra elavulhatott.
  const lejaratMp = preview
    ? Math.max(0, Math.round((new Date(preview.planTokenLejar).getTime() - most) / 1000))
    : 0

  // 5 másodperces késleltetés a dialógus megnyitása után.
  const keslelteto =
    dialogNyitvaOta === null
      ? RESTORE_KESLELTETES_MP
      : Math.max(0, RESTORE_KESLELTETES_MP - Math.floor((most - dialogNyitvaOta) / 1000))

  const nyitDialogus = useCallback(() => {
    const t = Date.now()
    setMost(t)
    setDialogNyitvaOta(t)
    setDialogNyitva(true)
  }, [])

  const zarDialogus = useCallback(() => {
    setDialogNyitva(false)
    setDialogNyitvaOta(null)
  }, [])

  const valasztottBackup = useMemo(
    () => backups.find((b) => String(b.backupLogId) === backupId) ?? null,
    [backups, backupId],
  )

  const futtatSzarazFutas = useCallback(() => {
    if (!valasztottBackup || jelszo.trim().length === 0) return
    setPreviewFut(true)
    setPreviewHiba(null)
    setPreview(null)
    setNevBegepelve('')
    setDatumBegepelve('')
    setEredmeny(null)
    void restorePreviewAction(valasztottBackup.backupLogId, jelszo)
      .then((res) => {
        if (res.success && res.preview) setPreview(res.preview)
        else setPreviewHiba(res.error ?? 'A száraz futás nem sikerült.')
      })
      .catch((e: unknown) =>
        setPreviewHiba(e instanceof Error ? e.message : 'A száraz futás nem sikerült.'),
      )
      .finally(() => setPreviewFut(false))
  }, [valasztottBackup, jelszo])

  const nevEgyezik = !!preview && nevBegepelve.trim() === preview.congregationNev
  const datumEgyezik = !!preview && datumBegepelve.trim() === preview.runDate
  const blokkolva = !!preview && preview.blokkolo.length > 0
  const lejart = !!preview && lejaratMp <= 0
  const indithato =
    !!preview && nevEgyezik && datumEgyezik && !blokkolva && !lejart && jelszo.length > 0 && !fut

  const vegrehajt = useCallback(
    (indoklas?: string) => {
      if (!preview || !indithato) return
      setFut(true)
      setEredmeny(null)
      void restoreExecuteAction({
        planToken: preview.planToken,
        confirmName: nevBegepelve.trim(),
        confirmDate: datumBegepelve.trim(),
        passphrase: jelszo,
        indoklas: (indoklas ?? '').trim(),
      })
        .then((res) => {
          setEredmeny(res)
          if (res.success) {
            // A terv-token elhasználódott — új művelethez új száraz futás kell.
            setPreview(null)
            setNevBegepelve('')
            setDatumBegepelve('')
            setJelszo('')
            onFinished?.()
          }
        })
        .catch((e: unknown) =>
          setEredmeny({
            success: false,
            error: e instanceof Error ? e.message : 'A visszaállítás nem sikerült.',
          }),
        )
        .finally(() => {
          setFut(false)
          zarDialogus()
        })
    },
    [preview, indithato, nevBegepelve, datumBegepelve, jelszo, onFinished, zarDialogus],
  )

  if (betolt) return <AdminSkeleton rows={4} className="py-4" />

  // Nincs jogosultság → magyarázat, nem hibaüzenet. A DataWipeTab ugyanezt
  // teszi: végigjárni egy garantáltan elutasuló folyamatot értelmetlen.
  if (nincsJog) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" aria-hidden />
          </div>
          <div>
            <p className="font-heading text-base text-foreground">
              A visszaállítás csak a fő rendszergazdának érhető el
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Ez a rendszer legkockázatosabb művelete: felülírja egy gyülekezet élő adatait
              egy korábbi mentés tartalmával. A szerver a te szerepköröddel elutasítaná, ezért
              a felület sem jelenik meg. A lenti naplóban látod, ha valaha történt
              visszaállítás a hatókörödben.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5">
      {/* ── Fejléc ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <RotateCcw className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-lg text-foreground">
            Adat-visszaállítás biztonsági mentésből
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Ez a művelet egy gyülekezet adatait a kiválasztott mentés állapotára cseréli.
            Ami a mentés óta keletkezett, az eltűnik. Előbb mindig lefut egy száraz futás,
            ami megmutatja, pontosan mi változna — és mielőtt bármi megváltozna, a rendszer
            mentést készít a mostani állapotról.
          </p>
        </div>
      </div>

      {betoltesHiba && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {betoltesHiba}
        </div>
      )}

      {/* ── MOBIL: itt nem a gomb áll, hanem a magyarázat ────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 md:hidden">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <Smartphone className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          Ezt a műveletet számítógépről lehet elindítani
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          A visszaállítás előtt végig kell olvasnod, mely bejegyzések tűnnének el — nevekkel,
          összegekkel. Ez telefonon nem áttekinthető, és ez a rendszer legkockázatosabb
          művelete. Ülj le egy géphez, és onnan indítsd.
        </p>
      </div>

      {/* ── ASZTALI: a teljes folyamat ──────────────────────────────── */}
      <div className="hidden space-y-4 md:block">
        {/* 1–3. lépés */}
        <div className="space-y-3 rounded-xl border border-destructive/25 bg-card p-4">
          <div className="space-y-1">
            <Label htmlFor="restore-congregation">1. Melyik gyülekezet?</Label>
            <select
              id="restore-congregation"
              value={congId}
              onChange={(e) => valasztGyulekezet(e.currentTarget.value)}
              disabled={fut || previewFut}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">— válassz —</option>
              {congregations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nev}
                </option>
              ))}
            </select>
          </div>

          {congId && (
            <div className="space-y-1">
              <Label htmlFor="restore-backup">2. Melyik mentésből?</Label>
              {backupsBetolt ? (
                <AdminSkeleton rows={2} className="py-1" />
              ) : backups.length === 0 ? (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                  Ehhez a gyülekezethez nincs egyetlen IGAZOLT mentés sem. Egy mentés akkor
                  igazolt, ha a rendszer fel is töltötte, és vissza is olvasta. Enélkül nincs
                  mit visszaállítani.
                </p>
              ) : (
                <>
                  <select
                    id="restore-backup"
                    value={backupId}
                    onChange={(e) => {
                      setBackupId(e.currentTarget.value)
                      setPreview(null)
                      setPreviewHiba(null)
                      setNevBegepelve('')
                      setDatumBegepelve('')
                    }}
                    disabled={fut || previewFut}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="">— válassz —</option>
                    {backups.map((b) => (
                      <option key={b.backupLogId} value={String(b.backupLogId)}>
                        {b.runDate} · {FAJTA_FELIRAT[b.kind] ?? b.kind} ·{' '}
                        {b.totalRows.toLocaleString('hu-HU')} sor
                      </option>
                    ))}
                  </select>
                  {valasztottBackup && (
                    <p className="text-[11px] text-muted-foreground">
                      Készült: {datumIdo(valasztottBackup.keszult)} ·{' '}
                      <StatusBadge intent="success">igazolt</StatusBadge>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {backupId && (
            <div className="space-y-1">
              <Label htmlFor="restore-passphrase">3. A mentési jelszó</Label>
              <Input
                id="restore-passphrase"
                type="password"
                value={jelszo}
                onChange={(e) => setJelszo(e.currentTarget.value)}
                placeholder="A mentési jelszavad…"
                disabled={fut || previewFut}
                autoComplete="off"
                spellCheck={false}
                className="h-11"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Ez <strong>nem a bejelentkezési jelszavad</strong> — azt a rendszer soha nem
                is látja. Ez az a jelszó, amivel a mentés fájlja nyílik: nélküle a mentést
                sem elolvasni, sem visszaállítani nem lehet.
              </p>
            </div>
          )}

          {backupId && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={futtatSzarazFutas}
                disabled={previewFut || fut || jelszo.trim().length === 0}
                className="h-11 w-full gap-2 sm:w-auto"
              >
                {previewFut ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Search className="size-4" aria-hidden />
                )}
                {previewFut ? 'Száraz futás…' : '4. Száraz futás — mi változna?'}
              </Button>
            </div>
          )}

          {previewHiba && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {previewHiba}
            </div>
          )}
        </div>

        {/* 4. lépés eredménye */}
        {preview && (
          <div className="rounded-xl border border-border bg-card p-4">
            <RestorePreviewPanel preview={preview} />
          </div>
        )}

        {/* 5–7. lépés */}
        {preview && !blokkolva && (
          <div className="space-y-3 rounded-xl border border-destructive/40 bg-card p-4">
            <p className="text-sm font-semibold text-foreground">
              Ha végigolvastad, és így akarod:
            </p>

            {lejart ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                Az előnézet lejárt. Közben változhatott az adat, ezért a fenti lista már nem
                biztos, hogy igaz — futtasd le újra a száraz futást.
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Az előnézet még {Math.floor(lejaratMp / 60)}:
                {String(lejaratMp % 60).padStart(2, '0')} percig érvényes.
              </p>
            )}

            <div className="space-y-1">
              <Label htmlFor="restore-name">5. Írd be a gyülekezet pontos nevét</Label>
              <Input
                id="restore-name"
                value={nevBegepelve}
                onChange={(e) => setNevBegepelve(e.currentTarget.value)}
                placeholder="A gyülekezet pontos neve…"
                disabled={fut || lejart}
                autoComplete="off"
                spellCheck={false}
                className="h-11"
              />
              <p className="text-[11px] italic text-muted-foreground">
                Elvárt: <span className="font-mono">{preview.congregationNev}</span>
              </p>
              {nevBegepelve && !nevEgyezik && (
                <p className="text-[11px] text-destructive">
                  Nem egyezik pontosan (betűre, ékezetre).
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="restore-date">6. Írd be a mentés dátumát</Label>
              <Input
                id="restore-date"
                value={datumBegepelve}
                onChange={(e) => setDatumBegepelve(e.currentTarget.value)}
                placeholder="ÉÉÉÉ-HH-NN"
                disabled={fut || lejart}
                autoComplete="off"
                spellCheck={false}
                className="h-11"
              />
              <p className="text-[11px] italic text-muted-foreground">
                Elvárt: <span className="font-mono">{preview.runDate}</span> — ezt azért kérjük,
                hogy biztosan azt a napot állítsd vissza, amit szeretnél.
              </p>
              {datumBegepelve && !datumEgyezik && (
                <p className="text-[11px] text-destructive">
                  Nem egyezik a választott mentés dátumával.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
              A gomb megnyomása után a(z){' '}
              <strong>{preview.congregationNev}</strong> gyülekezet adatai a{' '}
              <strong>{preview.runDate}</strong>-i állapotra cserélődnek:{' '}
              <strong>{preview.osszesen.beszuras.toLocaleString('hu-HU')}</strong> sor
              visszakerül, <strong>{preview.osszesen.modositas.toLocaleString('hu-HU')}</strong>{' '}
              sor felülíródik, és{' '}
              <strong className="text-destructive">
                {preview.osszesen.torles.toLocaleString('hu-HU')} sor eltűnik
              </strong>
              . A rendszer előbb menti a mostani állapotot, így ez a lépés később
              visszafordítható.
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="destructive"
                onClick={nyitDialogus}
                disabled={!indithato}
                className="h-11 w-full gap-2 sm:w-auto"
              >
                {fut ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RotateCcw className="size-4" aria-hidden />
                )}
                {fut ? 'Visszaállítás folyamatban…' : '7. Visszaállítás indítása'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Végső megerősítés ────────────────────────────────────────────
          A `loading` az 5 másodperces késleltetés alatt is igaz — ettől a
          megerősítő gomb letiltott, tehát az előző mezőből Enterrel nem érhető
          el. KILÉPNI viszont bármikor lehet: Escape-pel vagy a háttérre
          kattintva a dialógus azonnal bezárul (a `fut` még hamis). A
          késleltetés a MEGERŐSÍTÉST lassítja, nem a meggondolást. */}
      <AdminConfirmDialog
        open={dialogNyitva}
        onOpenChange={(open) => {
          if (fut) return
          if (open) nyitDialogus()
          else zarDialogus()
        }}
        title="Biztosan visszaállítod az adatokat?"
        tone="danger"
        description={
          preview ? (
            <>
              A(z) <strong>{preview.congregationNev}</strong> gyülekezet adatai a{' '}
              <strong>{preview.runDate}</strong>-i mentés állapotára cserélődnek.{' '}
              <strong className="text-destructive">
                {preview.osszesen.torles.toLocaleString('hu-HU')} sor eltűnik
              </strong>
              , köztük minden, ami a mentés óta keletkezett.
              <br />
              <br />
              A rendszer előbb mentést készít a mostani állapotról, és csak akkor kezd hozzá,
              ha az sikerült. Az indoklás bekerül a naplóba.
            </>
          ) : null
        }
        confirmLabel={
          keslelteto > 0 ? `Várj még ${keslelteto} másodpercet…` : 'Igen, visszaállítom'
        }
        cancelLabel="Mégse"
        loading={fut || keslelteto > 0}
        reasonLabel="Indoklás (miért állítod vissza?)"
        reasonPlaceholder="Pl.: a családi kartonok tévedésből törlődtek ma délelőtt"
        reasonRequired
        reasonMinLength={RESTORE_INDOKLAS_MIN}
        onConfirm={(reason) => vegrehajt(reason)}
      />

      {/* ── Eredmény ─────────────────────────────────────────────────── */}
      {eredmeny && eredmeny.success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="size-5 shrink-0" aria-hidden />
            <p className="text-sm font-semibold">A visszaállítás lefutott</p>
          </div>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
            A(z) <strong>{eredmeny.congregationNev}</strong> gyülekezet adatai visszaálltak.
            A lelkész gépén a következő szinkronnál a rendszer teljes újratöltést kér — ez
            normális, és pár percig eltarthat.
          </p>

          {eredmeny.preRestoreBackupLogId && (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40">
              <p className="flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-200">
                <LifeBuoy className="size-4 shrink-0" aria-hidden />
                Visszaállítás előtti mentés — {datumIdo(eredmeny.preRestoreKeszult)}
              </p>
              <p className="mt-0.5 text-xs text-sky-900/90 dark:text-sky-200/90">
                Azonosító: <span className="font-mono">#{eredmeny.preRestoreBackupLogId}</span> ·
                90 napig megmarad. Ha mégsem ezt akartad, ebből a mentésből lehet visszatérni
                a művelet előtti állapotra — ugyanezen a felületen.
              </p>
            </div>
          )}

          {eredmeny.tablak && eredmeny.tablak.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-emerald-800 hover:underline dark:text-emerald-300">
                Részletek (táblák szerint)
              </summary>
              <ul className="mt-2 grid grid-cols-1 gap-1 text-xs text-emerald-900 dark:text-emerald-200 sm:grid-cols-2 md:grid-cols-3">
                {eredmeny.tablak.map((t) => (
                  <li key={t.tabla} className="break-all">
                    <span className="font-mono">{t.tabla}</span>:{' '}
                    {t.elotte.toLocaleString('hu-HU')} → <strong>{t.utana.toLocaleString('hu-HU')}</strong>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {eredmeny.figyelmeztetesek && eredmeny.figyelmeztetesek.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-950/40">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                Ezekre figyelj
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-900/90 dark:text-amber-200/90">
                {eredmeny.figyelmeztetesek.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {eredmeny && !eredmeny.success && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 shrink-0" aria-hidden />
            <p className="font-semibold">A visszaállítás nem futott le</p>
          </div>
          <p className="mt-1 break-words">{eredmeny.error}</p>
          <p className="mt-2 text-xs text-destructive/80">
            A kísérlet bekerült a naplóba. Ha újra próbálod, a száraz futást is meg kell
            ismételni — az előnézet egyszer használható.
          </p>
          {eredmeny.preRestoreBackupLogId && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-destructive/80">
              <History className="size-3.5 shrink-0" aria-hidden />
              A visszaállítás előtti mentés elkészült (#{eredmeny.preRestoreBackupLogId}).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
