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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  DatabaseZap,
  FileWarning,
  Info,
  Loader2,
  PlayCircle,
  RefreshCw,
  Square,
  Stethoscope,
} from 'lucide-react'

import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  checkBackupReadinessAction,
  getBackupOverviewAction,
  listBackupsAction,
  runBackupNowAction,
} from '@/app/(dashboard)/admin/biztonsagi-mentes/actions'
import {
  GOOGLE_VISSZATERES_UZENETEK,
  type BackupLogRow,
  type BackupOverview,
  type MentesFutasEredmeny,
} from '@/app/(dashboard)/admin/biztonsagi-mentes/shared'

import { BackupDetailDialog } from './backup-detail-dialog'
import { BackupListTable } from './backup-list-table'
import { BackupOverviewCard } from './backup-overview-card'
import { BackupPassphraseCard } from './backup-passphrase-card'
import { BackupRetentionCard } from './backup-retention-card'
import { BackupRunReport } from './backup-run-report'
import { GoogleDriveCard } from './google-drive-card'

/**
 * Ennyi szeletnél tovább egy kattintás nem megy.
 *
 * ⚠️ MIÉRT KELL FELSŐ KORLÁT. A folytatás addig hívja újra a motort, amíg van
 *    hátralévő hatókör. Ha egy hatókör TARTÓSAN bukik, a hátralévők száma nem
 *    csökkenne, és a böngésző a végtelenségig hívogatná a szervert. A korlát
 *    inkább bevallja: „ennyit vitt el, a többihez nyomd meg újra."
 */
const MAX_SZELET = 40

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
  const [futasEredmeny, setFutasEredmeny] = useState<MentesFutasEredmeny | null>(null)
  /** A „Leállítás" gomb jelzése. `ref`, mert a futó ciklusnak AZONNAL látnia kell. */
  const megallitasRef = useRef(false)

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

  /**
   * A TELJES országos mentés — SZELETEKBEN.
   *
   * ════════════════════════════════════════════════════════════════════════════
   * MIÉRT NEM EGY HÍVÁS (2026-08-11)
   * ════════════════════════════════════════════════════════════════════════════
   * 784 hatókör (783 aktív gyülekezet + a rendszerszintű) egyetlen HTTP-kérésbe
   * nem fér bele: nagyságrendileg 150 000 adatbázis-körfordulás, órákban mérve.
   * A régi kód mégis ezt tette, 15 perces időkorláttal — és amikor a kapcsolat
   * elhalt, a felhasználó SEMMIT nem látott (a `mentesMost()`-ban `catch` sem
   * volt, a hiba „Uncaught (in promise)"-ként végezte a konzolban).
   *
   * Mostantól minden hívás egy ~4 perces SZELET. A haladás LÁTHATÓ, bármikor
   * megállítható, és A MÁR ELKÉSZÜLT MENTÉSEK MEGMARADNAK: a napi kulcs miatt a
   * következő szelet pontosan ott folytatja, ahol az előző abbahagyta.
   *
   * ════════════════════════════════════════════════════════════════════════════
   * EGY BUKOTT GYÜLEKEZET NEM ÁLLÍTJA MEG A TÖBBIT (2026-08-11 JAVÍTÁS)
   * ════════════════════════════════════════════════════════════════════════════
   * A ciklus korábban `return`-ölt, ha a válasz nem volt `success` — a szerver
   * pedig `success: false`-t adott, ha BÁRMELYIK hatókör elbukott. A kettő együtt
   * azt jelentette, hogy egy tartósan bukó gyülekezet miatt a tulajdonosnak
   * 24-szer kellett volna újrakattintania, hogy a maradék ~700 gyülekezet
   * mentése egyáltalán elinduljon.
   *
   * Mostantól a hatökör-hiba MEGJELENIK a jelentésben, de a következő szelet
   * ELINDUL. Megállunk, ha (a) maga a szelet bukott el, (b) a tulajdonos a
   * „Leállítás" gombot nyomta, vagy (c) egy szelet NULLA sikerrel és legalább
   * egy bukással zárult — az utóbbi rendszerszintű baj (halott tároló), amit a
   * továbbpróbálkozás csak sokszorozna.
   */
  async function mentesMost() {
    setFuttat(true)
    megallitasRef.current = false
    setFutasEredmeny(null)

    // ⚠️ MIÉRT NEM ADJUK ÖSSZE A SZELETEK SZÁMAIT.
    //    Minden szelet a MAI NAP EGÉSZÉT látja: a `kihagyva` mezőjében ott van
    //    MINDEN, amit korábbi szeletek (vagy az éjszakai cron) már elkészítettek.
    //    Ha a `kihagyva`-t szeletenként összeadnánk, a 2. szelettől kezdve
    //    ÚJRA MEGSZÁMOLNÁNK a saját korábbi sikereinket — a haladás-sáv 100%
    //    fölé szaladna, és a felület TÖBB kész mentést mutatna, mint amennyi van.
    //    Ezért: `sikeres` = amit MI készítettünk ebben a futásban (összeadva),
    //           `kihagyva` = ami MÁR AZELŐTT kész volt, hogy elindultunk (az
    //                        ELSŐ szelet értéke, rögzítve).
    let osszSikeres = 0
    let korabbanKesz: number | null = null
    /**
     * Volt-e BÁRMELYIK korábbi szeletben bukott hatókör?
     *
     * ⚠️ NEM ez adja a doboz színét — azt az AKTUÁLIS szelet hibaszáma adja. Egy
     *    korábban elbukott hatökört a következő szelet ÚJRA megpróbál (a napi
     *    kulcs csak az IGAZOLTAT hagyja ki), tehát ha a végén 0 a hibaszám,
     *    akkor a mentés TÉNYLEG teljes — pirosat mutatni rá hazugság lenne
     *    visszafelé. De az átmeneti bukást KIMONDJUK, nem tüntetjük el.
     */
    let voltAtmenetiBukas = false

    try {
      for (let szelet = 0; szelet < MAX_SZELET; szelet++) {
        const r = await runBackupNowAction()

        // ── (1) MAGA A SZELET bukott el (jogosultság, előkészítő fázis, elterelt
        //        kérés, vagy „a szelet semmit nem vitt el"). Ilyenkor tényleg
        //        nincs értelme folytatni — a következő szelet ugyanide futna.
        if (!r.success) {
          setFutasEredmeny({
            ...r,
            sikeres: osszSikeres + (r.sikeres ?? 0),
            kihagyva: korabbanKesz ?? r.kihagyva,
          })
          return
        }

        if (korabbanKesz === null) korabbanKesz = r.kihagyva ?? 0
        osszSikeres += r.sikeres ?? 0

        const hatralevo = r.hatralevo ?? 0
        // Az UTOLSÓ szelet hibaszáma a mérvadó: egy korábban elbukott hatökört a
        // következő szelet ÚJRA megpróbál (a napi kulcs csak az IGAZOLTAT hagyja
        // ki), tehát a szeletenkénti hibaszámok összege sokszorosan számolna.
        const sikertelen = r.sikertelen ?? 0
        const megallitva = megallitasRef.current
        const utolsoSzelet = szelet === MAX_SZELET - 1

        // ⛔ RENDSZERSZINTŰ BAJ: nulla siker + volt bukás = nem egy gyülekezet
        //    gondja, hanem a tárolóé, a hálózaté vagy az adatbázisé. A folytatás
        //    csak sokszorozná a hibát és a riasztásokat.
        const rendszerszintu = sikertelen > 0 && (r.sikeres ?? 0) === 0

        // ⚠️ Az „egyszer elbukott, aztán sikerült" TÉNY, de nem baj — kimondjuk,
        //    és nem festjük pirosra miatta a kész mentést.
        const atmenetiMondat =
          voltAtmenetiBukas && sikertelen === 0
            ? ' Közben volt átmeneti hiba, de az újrapróbálás sikerült — a részletek a ' +
              '„Mentési előzmény" listában.'
            : ''
        if (sikertelen > 0) voltAtmenetiBukas = true

        setFutasEredmeny({
          ...r,
          // ⚠️ A JELENTÉS PIROS, ha EBBEN a szeletben maradt bukott hatókör. A
          //    `success` itt NEM „a szelet lefutott" (az `r.success` volt az),
          //    hanem „nincs bukott hatókör" — a felület ebből színez. A kettőt
          //    azért kell szétválasztani, mert a folytatásról a SZELET sikere
          //    dönt: egyetlen bukott gyülekezet nem foszthatja meg a maradék
          //    ~700-at a mentéstől.
          success: sikertelen === 0,
          mindenSikeres: sikertelen === 0,
          sikeres: osszSikeres,
          sikertelen,
          kihagyva: korabbanKesz,
          hatralevo,
          futottVegig: hatralevo === 0,
          uzenet:
            sikertelen > 0
              ? undefined
              : (hatralevo === 0
                  ? `KÉSZ: ${osszSikeres} hatókör mentése készült el most` +
                    (korabbanKesz > 0 ? `, ${korabbanKesz} már korábban kész volt` : '') +
                    `. A futás végigment mind a ${r.osszes ?? '?'} hatókörön.`
                  : megallitva
                    ? `LEÁLLÍTVA: ${osszSikeres} hatókör mentése készült el. MÉG ${hatralevo} ` +
                      'HÁTRAVAN — az elkészült mentések MEGMARADTAK, a folytatás onnan veszi fel ' +
                      'a fonalat, ahol abbahagytuk.'
                    : utolsoSzelet
                      ? `${osszSikeres} hatókör kész. MÉG ${hatralevo} HÁTRAVAN — nyomd meg újra a ` +
                        '„Mentés most" gombot a folytatáshoz.'
                      : `${osszSikeres} hatókör kész — ${hatralevo} hátravan…`) + atmenetiMondat,
          error:
            sikertelen > 0
              ? `${sikertelen} hatókör mentése ELBUKOTT — nézd meg alább, melyik. ` +
                `${osszSikeres} hatókör mentése ettől függetlenül elkészült` +
                ((korabbanKesz ?? 0) > 0 ? `, ${korabbanKesz} már korábban kész volt` : '') +
                (rendszerszintu
                  ? '. EBBEN A SZELETBEN EGYETLEN MENTÉS SEM SIKERÜLT: ez nem egy gyülekezet ' +
                    'gondja, hanem a tárolóé, a hálózaté vagy az adatbázisé — ezért MEGÁLLTUNK. ' +
                    `${hatralevo} hatókör mentése EBBEN A FUTÁSBAN ELMARADT.`
                  : hatralevo > 0
                    ? `. Még ${hatralevo} hatókör hátravan — a futás FOLYTATÓDIK, a bukott ` +
                      'hatóköröket a következő szelet újrapróbálja.'
                    : '. A futás minden hatókörhöz hozzáért.')
              : undefined,
        })

        if (hatralevo === 0 || megallitva || rendszerszintu) break
      }
    } catch (e: unknown) {
      // ⚠️ EZ A `catch` HIÁNYZOTT. Enélkül egy elszállt hívás után a gomb
      //    visszaállt, és a felhasználó SEMMILYEN üzenetet nem kapott — a hiba
      //    „Uncaught (in promise)"-ként végezte a böngésző konzoljában.
      setFutasEredmeny({
        success: false,
        error:
          'A kérés nem ért célba (hálózati hiba vagy időtúllépés). A mentés állapota ' +
          'ISMERETLEN — lehet, hogy a szerveren tovább fut.',
        teendo:
          'Nyomd meg a „Frissítés" gombot, és nézd meg a „Mentési előzmény" listát: ami ' +
          'elkészült, ott IGAZOLTKÉNT látszik. Utána nyugodtan indítsd újra a mentést — a ' +
          'kész hatóköröket kihagyja.',
        reszlet: e instanceof Error ? e.message : String(e),
        sikeres: osszSikeres,
        kihagyva: korabbanKesz ?? undefined,
      })
    } finally {
      megallitasRef.current = false
      setFuttat(false)
      frissit()
    }
  }

  /**
   * „KÉSZ-E A RENDSZER A MENTÉSRE?" — 2 másodperc, MENTÉS NÉLKÜL.
   *
   * A 2026-08-11-i hiba pont az a fajta volt, amit ez a próba a helyes szöveggel
   * azonnal megmutatott volna: az előkészítő fázis bukott el, mielőtt egyetlen
   * gyülekezethez hozzáértünk volna.
   */
  async function keszEnnek() {
    setFuttat(true)
    setFutasEredmeny(null)
    try {
      setFutasEredmeny(await checkBackupReadinessAction())
    } catch (e: unknown) {
      setFutasEredmeny({
        success: false,
        error: 'Az ellenőrzés nem ért célba (hálózati hiba).',
        teendo: 'Frissítsd az oldalt, és próbáld újra.',
        reszlet: e instanceof Error ? e.message : String(e),
      })
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
  /**
   * Indíthat-e mentést? A szerver-akció a kerületi admint (esperest) kizárja
   * (`requireAdminAccess({ allowDistrictAdmin: false })`) — a felület ezt
   * KÖVETI, nem mond mást. Egy gomb, ami mindig „Nincs jogosultság"-ot ad,
   * nem gomb, hanem csapda.
   */
  const indithat = overview?.accessLevel !== 'district_admin'

  return (
    <div className="space-y-4">
      {/* A Google-visszatérés emberi üzenete (a részletek SOHA nem az URL-ből jönnek)
          ⚠️ 2026-08-11: a hiba-ág szövegszíne `text-foreground`, nem
             `text-destructive`. Az utóbbi a `bg-destructive/10` tinten (ezen az
             oldalon nincs kártya-burkolat, tehát az oldalháttérre keveredik)
             kert-világoson 3,72:1 — AA-bukás normál méretű szövegen, hat
             témavariánsból négyben. A piros a keretet és az ikont festi: ott a
             küszöb 3:1, azt teljesíti. Lásd `backup-run-report.tsx` fejléce. */}
      {googleUzenet ? (
        <div
          role="status"
          className={[
            'flex items-start gap-2 rounded-2xl border p-3 text-sm sm:p-4',
            googleUzenet.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-destructive/40 bg-destructive/10 text-foreground',
          ].join(' ')}
        >
          {googleUzenet.ok ? null : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          )}
          <span className="min-w-0 flex-1">{googleUzenet.szoveg}</span>
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
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p>{overview.error}</p>
        </div>
      ) : null}

      {overview ? <BackupOverviewCard overview={overview} /> : null}

      {/* Vezérlő gombsor */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* ⚠️ A kerületi admin (esperes) ezt a gombot NEM kapja meg: a szerver-akció
            úgyis elutasítaná (`allowDistrictAdmin: false`), és egy aktív gomb, ami
            mindig „Nincs jogosultság"-ot ad, rosszabb a hiányzó gombnál. */}
        {indithat ? (
          <Button
            type="button"
            onClick={() => void mentesMost()}
            disabled={futtat || needsSql}
            className="min-h-11 w-full gap-2 sm:w-auto"
            aria-label="A teljes biztonsági mentés indítása most"
          >
            {futtat ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <PlayCircle className="size-4" aria-hidden />
            )}
            {futtat ? 'Mentés folyamatban…' : 'Mentés most'}
          </Button>
        ) : null}

        {/* LEÁLLÍTÁS — a futó szelet befejeződik, a kész mentések MEGMARADNAK. */}
        {futtat ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              megallitasRef.current = true
            }}
            className="min-h-11 w-full gap-2 sm:w-auto"
            aria-label="A mentés leállítása a futó szelet után"
          >
            <Square className="size-4" aria-hidden />
            Leállítás
          </Button>
        ) : null}

        {indithat ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void keszEnnek()}
            disabled={futtat}
            className="min-h-11 w-full gap-2 sm:w-auto"
            aria-label="Ellenőrzés: kész-e a rendszer a mentésre (mentés nélkül)"
          >
            <Stethoscope className="size-4" aria-hidden />
            Kész-e a mentésre?
          </Button>
        ) : null}

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

      {/* A BESZÉDES JELENTÉS: meddig jutott, mi a baj, mit tegyél, mennyi van hátra. */}
      {futasEredmeny ? <BackupRunReport eredmeny={futasEredmeny} fut={futtat} /> : null}

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
          <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <span className="min-w-0 flex-1">{listaHiba}</span>
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
