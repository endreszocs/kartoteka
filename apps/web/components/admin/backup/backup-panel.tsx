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
  getBackupRunStatusAction,
  listBackupsAction,
  startBackupRunAction,
  stopBackupRunAction,
} from '@/app/(dashboard)/admin/biztonsagi-mentes/actions'
import {
  GOOGLE_VISSZATERES_UZENETEK,
  type BackupLogRow,
  type BackupOverview,
  type MentesFutasAllapot,
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
 * Milyen sűrűn kérdezzük meg a szervertől, hol tart a mentés.
 *
 * ⚠️ EZ NEM VEZÉRLÉS, HANEM NÉZÉS. A felület már nem „hajtja" a mentést
 *    szeletenkénti hívásokkal — a futás a szerveren él. Ez a lekérdezés csak
 *    megmutatja, hol tart; ha elmarad (bezárt fül, halott hálózat), a mentés
 *    AKKOR IS megy tovább.
 *
 * 4 másodperc: egy hatókör ~18 másodpercig tart, tehát ennél sűrűbben kérdezni
 * fölösleges terhelés lenne az adatbázison — épp a mentés alatt.
 */
const ALLAPOT_LEKERDEZES_MS = 4_000

/**
 * A MEGSZAKADT FUTÁS JELENTÉSE (2026-08-11).
 *
 * ⚠️ MIÉRT KELL EZ KÜLÖN. A futás a szerver-folyamat memóriájában él. Egy
 *    TELEPÍTÉS (deploy) vagy egy folyamat-újraindulás megöli a ciklust, és a
 *    felügyelő üres állapotra áll: onnantól `fut: false` ÉS `indultAt: null`,
 *    tehát a szerver `jelentes: null`-t ad. Korábban a panel ilyenkor az ELŐZŐ
 *    jelentést hagyta a képernyőn — vagyis a doboz ezen a mondaton fagyott be:
 *    „A mentés FUT a szerveren… nyugodtan bezárhatod ezt az oldalt". Közben
 *    senki nem folytatta. A tulajdonos órákig várt volna egy halott futásra.
 */
const MEGSZAKADT_JELENTES: MentesFutasEredmeny = {
  success: false,
  error:
    'A futás MEGSZAKADT: a szerver közben újraindult (telepítés vagy újraindulás). Az addig ' +
    'elkészült mentések MEGMARADTAK — a maradékkal viszont senki nem foglalkozik tovább.',
  teendo:
    'Nyomd meg újra a „Mentés most" gombot — a folytatás a ma már kész hatóköröket kihagyja, ' +
    'és onnan viszi tovább, ahol abbamaradt.',
}

interface Props {
  /** A Google-visszatérés kódja (`?google=ok|hiba` + `?ok=<kód>`). */
  googleAllapot?: 'ok' | 'hiba' | null
  googleKod?: string | null
  /**
   * A harang-értesítésből érkező `?mentes-hiba=<nap>-<scope>-<id>` felbontva.
   *
   * ⚠️ 2026-08-11-ig ez a paraméter ÜRES ÍGÉRET volt: az értesítés „Megnyitás"
   * gombja ide hozott, az oldal viszont EL SEM OLVASTA. A tulajdonos annyit
   * látott, hogy semmi nem történik.
   */
  mentesHiba?: { runDate: string; scope: 'gyulekezet' | 'globalis'; congregationId: string | null } | null
}

export function BackupPanel({ googleAllapot, googleKod, mentesHiba }: Props) {
  const [overview, setOverview] = useState<BackupOverview | null>(null)
  const [rows, setRows] = useState<BackupLogRow[]>([])
  const [gyulekezetek, setGyulekezetek] = useState<Array<{ id: string; nev: string }>>([])
  const [listaHiba, setListaHiba] = useState<string | null>(null)
  const [betolt, setBetolt] = useState(true)
  const [listaBetolt, setListaBetolt] = useState(true)
  /** Egy GOMBKATTINTÁS kérése van úton (indítás/leállítás/próba) — nem a mentés. */
  const [muvelet, setMuvelet] = useState(false)
  /** A szerveren futó mentés állapota. `fut` = MOST is dolgozik. */
  const [futAllapot, setFutAllapot] = useState<MentesFutasAllapot | null>(null)
  const [futasEredmeny, setFutasEredmeny] = useState<MentesFutasEredmeny | null>(null)
  /**
   * A LEKÉRDEZÉS hibája — SZÁNDÉKOSAN külön a mentés hibájától.
   *
   * ⚠️ Ha az állapot-lekérdezés nem ér célba, az a hálózatról szól, NEM a
   *    mentésről. A mentés a szerveren fut tovább. Ezt a kettőt korábban
   *    összemostuk, és a felület egy működő mentésre írt ki bukást.
   */
  const [lekerdezesHiba, setLekerdezesHiba] = useState<string | null>(null)
  /** Az előző `fut` érték — ebből vesszük észre, hogy a futás MOST fejeződött be. */
  const elozoFutRef = useRef(false)

  /**
   * A szűrő KEZDŐÉRTÉKE az értesítés hivatkozásából jön: aki a harangból érkezik,
   * azonnal az ÉRINTETT gyülekezet sorait lássa, ne a 784 hatókör listáját.
   */
  const [szuroCong, setSzuroCong] = useState<string>(mentesHiba?.congregationId ?? '')
  const [csakHibas, setCsakHibas] = useState(false)
  const [reszlet, setReszlet] = useState<BackupLogRow | null>(null)

  /**
   * MEGOLDÓDOTT-E AZ A HIBA, AMIRŐL AZ ÉRTESÍTÉS SZÓLT?
   *
   * ⚠️ A VÁLASZ SOHA NEM AZ ÉRTESÍTÉS SZÖVEGÉBŐL JÖN. Az attól a pillanattól
   *    fogva elavult, hogy megírtuk — a tulajdonos 2026-08-11-én pont ezt látta:
   *    21:09-es hibaüzenet egy olyan gyülekezetről, amelyik 22:16-kor elkészült.
   *    A forrás a NAPLÓ: van-e erre a napra és hatókörre `igazolt` sor.
   *
   * `null` = még töltjük a listát, tehát NEM állítunk semmit.
   */
  const hibaMegoldva = useMemo<boolean | null>(() => {
    if (!mentesHiba) return null
    if (listaBetolt) return null
    return rows.some(
      (r) =>
        r.runDate === mentesHiba.runDate &&
        r.scope === mentesHiba.scope &&
        (mentesHiba.congregationId === null || r.congregationId === mentesHiba.congregationId) &&
        r.status === 'ok' &&
        r.driveVerifiedAt !== null,
    )
  }, [mentesHiba, listaBetolt, rows])

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
   * Megkérdezi a szervertől, hol tart a mentés.
   *
   * ⚠️ A HIBAÁGA A LEGFONTOSABB RÉSZE. Ha ez a lekérdezés nem ér célba, az a
   *    HÁLÓZATRÓL szól, nem feltétlenül a mentésről. Ezért NEM írunk bukást a
   *    mentés jelentésébe — külön, halk sorban jelezzük, hogy az állapotot nem
   *    tudtuk frissíteni.
   *
   * ⚠️ DE CSAK AZT MONDJUK KI, AMIT TUDUNK (2026-08-11). „A mentés a szerveren
   *    fut tovább" kizárólag akkor igaz, ha a MEGELŐZŐ, SIKERES lekérdezés
   *    `fut: true`-t adott. Ez a függvény BELÉPÉSKOR is lefut — nulla futás
   *    mellett ugyanez a mondat sima hazugság lenne.
   */
  const allapototKerdez = useCallback(async (): Promise<MentesFutasAllapot | null> => {
    // Az ELŐZŐ, SIKERES lekérdezés szerint futott-e mentés. Csak ebből mondhatunk
    // bármit arról, hogy „a mentés a szerveren fut tovább".
    const elozoFut = elozoFutRef.current
    try {
      const a = await getBackupRunStatusAction()
      setFutAllapot(a)
      if (a.jelentes) {
        setFutasEredmeny(a.jelentes)
      } else if (a.error) {
        // Az állapot-lekérdezés maga bukott el (lejárt munkamenet, adatbázis-hiba).
        // Ilyenkor NEM tudjuk, fut-e a mentés — a régi jelentést ezért levesszük,
        // és a hibát a maga nevén mondjuk ki (lásd lentebb, `futAllapot.error`).
        setFutasEredmeny(null)
      } else if (elozoFut) {
        // Az imént még FUTOTT, most viszont a szerver azt mondja, semmiről nem
        // tud: a folyamat újraindult (telepítés). NEM hagyjuk ott a „FUT" mondatot.
        setFutasEredmeny(MEGSZAKADT_JELENTES)
      }
      setLekerdezesHiba(null)
      return a
    } catch {
      // ⚠️ ITT NEM TIPPELÜNK (2026-08-11). Ez a hibaág BELÉPÉSKOR is lefut, akkor
      //    is, ha soha egyetlen mentés sem indult. Korábban feltétel nélkül azt
      //    írta ki, hogy „a mentés a szerveren fut tovább" — egy hálózati zökkenő
      //    a lap megnyitásakor tehát egy NEM LÉTEZŐ futásról állított valótlant.
      setLekerdezesHiba(
        elozoFut
          ? 'Az állapot frissítése nem sikerült (hálózati hiba). A mentés a szerveren fut tovább — ' +
              'a lenti számok csak nem frissülnek addig, amíg a kapcsolat helyre nem áll.'
          : 'Az állapotot nem tudtuk lekérdezni (hálózati hiba). Nyomd meg a „Frissítés" gombot, ' +
              'ha helyreállt a kapcsolat.',
      )
      return null
    }
  }, [])

  /**
   * BELÉPÉSKOR IS MEGKÉRDEZZÜK, fut-e mentés.
   *
   * ⚠️ EZ NEM KÉNYELMI FUNKCIÓ. A futás a szerveren él, nem ebben az ablakban:
   *    ha a tulajdonos bezárta a fület és később visszajön (vagy a telefonján
   *    nyitja meg), MEG KELL LÁTNIA, hogy a mentése azóta is dolgozik. Enélkül
   *    azt hinné, semmi nem történik, és fölöslegesen újraindítaná.
   */
  useEffect(() => {
    void allapototKerdez()
  }, [allapototKerdez])

  /** Amíg fut, másodpercenként nézzük. Ha nem fut, nem terheljük a szervert. */
  useEffect(() => {
    if (futAllapot?.fut !== true) return
    const id = setInterval(() => {
      void allapototKerdez()
    }, ALLAPOT_LEKERDEZES_MS)
    return () => clearInterval(id)
  }, [futAllapot?.fut, allapototKerdez])

  /**
   * Amikor a futás BEFEJEZŐDÖTT, frissítjük az áttekintőt és az előzmény-listát.
   *
   * ⚠️ A `frissit()` nem kerülhet a lekérdező ciklusba: a 14 napos lefedettség
   *    kiszámítása 783 gyülekezetet és több ezer napló-sort lapoz — négy
   *    másodpercenként lefuttatva épp a mentés alól venné el az adatbázist.
   */
  useEffect(() => {
    const most = futAllapot?.fut === true
    if (elozoFutRef.current && !most) frissit()
    elozoFutRef.current = most
  }, [futAllapot?.fut, frissit])

  /**
   * A TELJES ORSZÁGOS MENTÉS — EGY KATTINTÁS.
   *
   * ════════════════════════════════════════════════════════════════════════════
   * MIÉRT NEM A BÖNGÉSZŐ HAJTJA (2026-08-11)
   * ════════════════════════════════════════════════════════════════════════════
   * Korábban ez a függvény egy ciklusban hívogatta a szervert, szeletenként, és
   * a böngésző végig nyitva tartotta a kérést. Élesben 15 hatókör után ezt kapta
   * a tulajdonos: „An unexpected response was received from the server." — nem a
   * mi hibánk volt, hanem a Railway edge-proxyja, ami 300 másodperc után elvágja
   * azt a kérést, amiben nem mozog adat. Egy szerver-akció a munka teljes ideje
   * alatt nulla bájtot küld, tehát ránk MINDIG ez a 300 másodperc vonatkozik.
   * 784 hatókör ≈ 4 óra — ez semmilyen kérésbe nem fér bele.
   *
   * Mostantól a gomb ELINDÍT egy szerver-oldali futást, és a kérés azonnal
   * lezárul. A tulajdonos bezárhatja a fület, elveszítheti a hálózatot,
   * lezárhatja a telefonját: a mentés megy tovább. Ez az oldal csak NÉZI.
   */
  async function mentesMost() {
    setMuvelet(true)
    setFutasEredmeny(null)
    setLekerdezesHiba(null)
    try {
      const a = await startBackupRunAction()
      setFutAllapot(a)
      if (a.jelentes) setFutasEredmeny(a.jelentes)
    } catch {
      // ⚠️ ITT NEM TIPPELÜNK. Az indító kérés elveszett — de az, hogy elveszett,
      //    NEM mondja meg, elindult-e a futás a szerveren. Ahelyett hogy egy
      //    „lehet, hogy fut, lehet, hogy nem" mondatot írnánk ki (ezt kapta a
      //    tulajdonos 2026-08-11-én), MEGKÉRDEZZÜK a szervert.
      const a = await allapototKerdez()
      if (!a) {
        // ⚠️ EGY BAJ = EGY MONDAT. A lekérdezés hibasora ugyanezt a hálózati
        //    zökkenőt írná le, más szavakkal — két, egymás mellett álló doboz
        //    ugyanarról a bajról csak ijesztget. Az alábbi jelentés a beszédesebb.
        setLekerdezesHiba(null)
        setFutasEredmeny({
          success: false,
          error:
            'Az indítási kérés nem ért célba, és az állapotot sem tudtuk lekérdezni — ' +
            'valószínűleg megszakadt a hálózat.',
          teendo:
            'Ellenőrizd a hálózatot, majd nyomd meg a „Frissítés" gombot. Az oldal megmutatja, ' +
            'elindult-e a mentés; ha nem, indítsd újra — a ma már kész hatóköröket kihagyja.',
        })
      }
    } finally {
      setMuvelet(false)
    }
  }

  /** Leállítást kér. A FUTÓ hatókör befejeződik — félbehagyott munka nem marad. */
  async function leallit() {
    setMuvelet(true)
    try {
      const a = await stopBackupRunAction()
      setFutAllapot(a)
      if (a.jelentes) setFutasEredmeny(a.jelentes)
    } catch {
      await allapototKerdez()
    } finally {
      setMuvelet(false)
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
    setMuvelet(true)
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
      setMuvelet(false)
    }
  }

  if (betolt && !overview) {
    return (
      <div className="card-raised p-4 sm:p-5">
        <AdminSkeleton rows={6} />
      </div>
    )
  }

  /**
   * ⚠️ KÉT FORRÁS, EGY SÁV. Az SQL hiányát az áttekintő ÉS az állapot-lekérdezés
   *    is jelezheti. Ha csak az egyiket néznénk, a másik némán elveszne — és a
   *    „Mentés most" gomb tiltása magyarázat nélkül maradna.
   */
  const needsSql = overview?.needsSql === true || futAllapot?.needsSql === true
  const master = overview?.master === true
  /**
   * Indíthat-e mentést? A szerver-akció a kerületi admint (esperest) kizárja
   * (`requireAdminAccess({ allowDistrictAdmin: false })`) — a felület ezt
   * KÖVETI, nem mond mást. Egy gomb, ami mindig „Nincs jogosultság"-ot ad,
   * nem gomb, hanem csapda.
   */
  const indithat = overview?.accessLevel !== 'district_admin'
  /** FUT-e MOST mentés a SZERVEREN (nem ebben az ablakban). */
  const futASzerveren = futAllapot?.fut === true

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

      {/* ══════════════════════════════════════════════════════════════════════
          A HARANGBÓL ÉRKEZŐ ÚT VÉGE (2026-08-11)
          ══════════════════════════════════════════════════════════════════════
          Az értesítés „Megnyitás" gombja idáig hozza a lelkészt. Ez a doboz
          mondja ki, MIÉRT van itt, és mi lett a sorsa annak a hibának — a
          válasz a MAI lefedettségből jön, nem az értesítés szövegéből (az
          ugyanis attól a pillanattól fogva elavult, hogy megírtuk). */}
      {mentesHiba ? (
        <div
          role="status"
          className={[
            'rounded-2xl border p-3 text-sm leading-relaxed sm:p-4',
            hibaMegoldva === true
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : hibaMegoldva === false
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100'
                : 'border-border bg-muted/50 text-muted-foreground',
          ].join(' ')}
        >
          {hibaMegoldva === null ? (
            <>Betöltöm annak a futásnak az állapotát, amiről az értesítés szólt…</>
          ) : hibaMegoldva ? (
            <>
              <strong>Ez a hiba azóta elmúlt.</strong> Az értesítés a(z) {mentesHiba.runDate} napi
              futásról szólt; erre a hatókörre azóta elkészült az ellenőrzött mentés (feltöltve,
              visszaolvasva, ellenőrző összeg egyezett). Nincs teendőd — az alábbi lista a hatókör
              teljes előzményét mutatja.
            </>
          ) : (
            <>
              <strong>Ide a hiba-értesítésből érkeztél.</strong> Az érintett futás:{' '}
              {mentesHiba.runDate},{' '}
              {mentesHiba.scope === 'globalis'
                ? 'rendszerszintű (globális) mentés'
                : 'egy gyülekezet mentése'}
              . Az alábbi lista már erre a hatókörre van szűrve, és erről a napról{' '}
              <strong>még mindig nincs igazolt mentés</strong>. Nyomd meg a „Mentés most" gombot —
              a folytatás a ma már kész hatóköröket kihagyja.
            </>
          )}
        </div>
      ) : null}

      {overview ? <BackupOverviewCard overview={overview} onValtozas={frissit} /> : null}

      {/* Vezérlő gombsor */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* ⚠️ A kerületi admin (esperes) ezt a gombot NEM kapja meg: a szerver-akció
            úgyis elutasítaná (`allowDistrictAdmin: false`), és egy aktív gomb, ami
            mindig „Nincs jogosultság"-ot ad, rosszabb a hiányzó gombnál. */}
        {indithat ? (
          <Button
            type="button"
            onClick={() => void mentesMost()}
            disabled={futASzerveren || muvelet || needsSql}
            className="min-h-11 w-full gap-2 sm:w-auto"
            aria-label="A teljes biztonsági mentés indítása most"
          >
            {futASzerveren || muvelet ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <PlayCircle className="size-4" aria-hidden />
            )}
            {futASzerveren ? 'A mentés fut a szerveren…' : muvelet ? 'Indítás…' : 'Mentés most'}
          </Button>
        ) : null}

        {/* LEÁLLÍTÁS — a FUTÓ hatókör befejeződik, a kész mentések MEGMARADNAK.
            ⚠️ Egy gyülekezet mentését nem szakítjuk félbe: az „fut" állapotban
               ragadt napló-sort hagyna maga után, ami sem késznek, sem hibásnak
               nem látszik — pontosan az a homály, amit ez a rendszer kerül. */}
        {futASzerveren ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void leallit()}
            disabled={muvelet || futAllapot?.megallitasKerve === true}
            className="min-h-11 w-full gap-2 sm:w-auto"
            aria-label="A mentés leállítása a most futó gyülekezet után"
          >
            <Square className="size-4" aria-hidden />
            {futAllapot?.megallitasKerve ? 'Leállítás kérve…' : 'Leállítás'}
          </Button>
        ) : null}

        {indithat ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void keszEnnek()}
            disabled={futASzerveren || muvelet}
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

      {/* ⚠️ A GOMB SOHA NEM LEHET NÉMA (2026-08-11). A három szerver-akció
          (indítás / állapot / leállítás) jogosultsági bukásnál — lejárt
          munkamenet, szerepkör-változás — `error` mezőt ad vissza, jelentés
          nélkül. A panel korábban EZT A MEZŐT SOHA NEM RENDERELTE: a tulajdonos
          megnyomta a „Mentés most"-ot, és SEMMI nem történt a képernyőn. Egy
          néma gomb rosszabb a hibaüzenetnél, mert a felhasználó magát hibáztatja. */}
      {futAllapot?.error ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p className="min-w-0 flex-1">
            {futAllapot.error} Ha közben lejárt a munkameneted, lépj be újra, és próbáld meg
            ismét — a ma már kész mentéseket ez nem érinti.
          </p>
        </div>
      ) : null}

      {/* A BESZÉDES JELENTÉS: meddig jutott, mi a baj, mit tegyél, mennyi van hátra. */}
      {futasEredmeny ? <BackupRunReport eredmeny={futasEredmeny} fut={futASzerveren} /> : null}

      {/* ⚠️ A MEGSZAKADT FUTÁS NYOMA (2026-08-11). Ha EBBEN a szerver-folyamatban
          nem futott mentés (`voltFutas === false`), de a mai lefedettség hiányos,
          annak két oka lehet: még senki nem indított mentést, VAGY egy korábbi
          futást megölt egy telepítés. A második eset korábban TELJESEN néma volt:
          a tulajdonos elindította, bezárta a fület, és visszatérve semmit nem
          látott — sem azt, hogy megszakadt, sem azt, hogy újra kell indítani. */}
      {!futASzerveren &&
      !futasEredmeny &&
      futAllapot?.voltFutas === false &&
      !futAllapot?.error &&
      (overview?.ma.hianyzik ?? 0) > 0 ? (
        <p className="rounded-2xl border border-border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
          Ma <strong className="text-foreground">{overview?.ma.hianyzik}</strong> hatókörnek nincs
          még mentése. Ha korábban elindítottad, a futást megszakíthatta egy időközbeni telepítés
          vagy egy szerver-újraindulás — az elkészült mentések ilyenkor is megmaradnak. Nyomd meg
          újra a „Mentés most" gombot: a folytatás a ma már kész hatóköröket kihagyja.
        </p>
      ) : null}

      {/* ⚠️ A LEKÉRDEZÉS HIBÁJA KÜLÖN SORBAN ÁLL, ÉS NEM PIROSAN. Ez a hálózatról
          szól, nem a mentésről: a futás a szerveren megy tovább. Ha a mentés
          hibájaként írnánk ki, egy MŰKÖDŐ mentésre mondanánk bukást. */}
      {lekerdezesHiba ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{lekerdezesHiba}</span>
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
