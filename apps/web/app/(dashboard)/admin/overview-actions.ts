'use server'

/**
 * Admin ÁTTEKINTÉS — EGYETLEN adatköteg (2026-08-12).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * NÉGY SZABÁLY, AMIT EZ A FÁJL BETART
 * ════════════════════════════════════════════════════════════════════════════
 *
 * (1) `Promise.allSettled`, NEM `Promise.all`. Egy bukott ág nem viheti el a
 *     többit. Minden ág SAJÁT `{ ok } | { fajta, uzenet }` állapotot kap.
 *
 * (2) NINCS NÉMA NULLA. Ha egy lekérdezés elbukik, a csempe ezt MEGMONDJA —
 *     nem 0-t mutat. A nulla megnyugtat; egy elbukott ellenőrzés nem nyugtathat
 *     meg. (Ez a projekt visszatérő hibaosztálya, és tegnap is ez harapott meg:
 *     öt gyökeresen különböző állapot ugyanúgy nézett ki: sehogy.)
 *
 * (3) A DRÁGA LEKÉRDEZÉSEK NEM FUTNAK OLDALBETÖLTÉSKOR. Kimarad:
 *       · runQualityCheck        — a TELJES `szemely` állományt lapozza,
 *       · getAllUsersWithScope   — 20×1000 auth-lapozás,
 *       · getSubmissionMatrix    — országos, szűretlen dokumentum-mátrix,
 *       · getSystemFinanceSummary— árfolyam-lekéréssel (KÜLSŐ HÁLÓZAT),
 *       · reconcileDrive         — Google Drive hívás.
 *     Az első három GOMBRA fut a „Mélyebb ellenőrzések" panelben.
 *
 * (4) NEVEZŐ NÉLKÜL NINCS ORSZÁGOS SZÁM. 783 gyülekezet van, de országosan
 *     606 élő tag — vagyis szinte minden „országos" összesítő valójában egy-két
 *     gyülekezet adata. Minden ilyen csoport KIÍRJA a nevezőjét.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TELJESÍTMÉNY — MENNYI KÖRÚT FUT EGY BETÖLTÉSKOR (2026-08-12)
 * ════════════════════════════════════════════════════════════════════════════
 * 14 PÁRHUZAMOS ág (korábban 13). Az új, 14. ág 8 darab `count:'exact',
 * head:true` lekérdezés — ezek SOROKAT NEM HOZNAK, egymással is párhuzamosan
 * futnak, tehát a falióra-idő a leglassabb ághoz (a mentés-lefedettséghez)
 * képest gyakorlatilag nem nő.
 *
 * A LEGNAGYOBB NYERESÉG NEM ÚJ LEKÉRDEZÉS: a köteg eddig is kiszámolta a
 * gyülekezet-méreteket, a TOP10-et, a mentés tegnapi/mai lefedettségét, a
 * 14 napos pulzust és a rendszer születésnapját — és mindezt ELDOBTA. Ezek most
 * NULLA extra körút árán jelennek meg.
 *
 * Az egész köteg 60 másodpercre GYORSÍTÓTÁRAZVA, felhasználónként és bekapcsolt
 * profilonként. A „Frissítés" gomb üríti.
 */

import { revalidatePath } from 'next/cache'

import { FUTO_WEB_VERZIO } from '@/lib/app-verzio'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import {
  bukarestiNapKulcs,
  huIdopontRelativval,
  huNaptariIdopontBukarest,
} from '@/lib/utils/idopont-bukarest'
import {
  getLicenseLifecycle,
  isDeviceDormant,
  LICENSE_EXPIRY_WARNING_DAYS,
  DORMANT_DEVICE_DAYS,
  AUDIT_ACTION_LABELS,
} from './devices-licenses-shared'
import { getAdminOverview } from './actions'
import { getAccessRequestStats } from './access-requests-actions'
import { getOpenSupportTicketCountAction } from './support-kpi-actions'
import { listAuditLog } from './devices-licenses-actions'
import { listCrossMatchAdmin } from './egyeztetesek-actions'
import { listRecentWipesAction } from './wipe-actions'
import { listChangelogEntries } from './broadcasts-actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getBackupBannerStateAction } from './biztonsagi-mentes/actions'
import { listErtesitesekAction } from '@/lib/notifications/uzenetek-actions'
import { varKikuldesre, kiemelt } from '@/lib/broadcasts/changelog-status'
import type {
  AttekintesAdat,
  Ag,
  EgyhazmegyeSor,
  GyulekezetMeret,
  IdovonalSor,
  MentesPulzusNap,
  ModulPirula,
  PulzusCsempe,
  Riado,
  SzamCsoport,
  UjdonsagJelveny,
  UzenetSor,
} from './overview-shared'
import {
  agHiba,
  agOk,
  ablakban_szamol,
  csoportokSorrendben,
  eltelt_nap,
  erintetlenJelveny,
  hibatlanSorozat,
  idoJelveny,
  napKulonbseg,
  olvasatlanJelveny,
  riadokSorrendben,
  verzioFelirat,
} from './overview-shared'

// ────────────────────────────────────────────────────────────────────────────
// Gyorsítótár
// ────────────────────────────────────────────────────────────────────────────

const GYORSITOTAR_MS = 60_000
const gyorsitotar = new Map<string, { at: number; adat: AttekintesAdat }>()

function gyorsitoKulcs(access: Awaited<ReturnType<typeof getEffectiveAccessContext>>): string {
  return [
    access.user?.id ?? 'nincs',
    access.activeProfileRole?.scope ?? '-',
    access.activeProfileRole?.scopeId ?? '-',
    access.effectiveCongregationId ?? '-',
  ].join('|')
}

// ────────────────────────────────────────────────────────────────────────────
// Segédek
// ────────────────────────────────────────────────────────────────────────────

const NINCS_JOG_MINTA = /nincs jogosults|csak rendszergazda|nincs bejelentkez/i

/** A hiba-szövegből eldönti, hogy jogosultsági kérdésről van-e szó. */
function fajtaSzovegbol(uzenet: string): 'nincs_jog' | 'hiba' {
  return NINCS_JOG_MINTA.test(uzenet) ? 'nincs_jog' : 'hiba'
}

/** `allSettled` eredmény → `Ag`. */
function agBol<T>(
  r: PromiseSettledResult<{ data?: T; error?: string }>,
  mi: string,
): Ag<T> {
  if (r.status === 'rejected') {
    const uzenet = r.reason instanceof Error ? r.reason.message : String(r.reason)
    return agHiba(fajtaSzovegbol(uzenet), `${mi}: ${uzenet}`)
  }
  if (r.value.error) return agHiba(fajtaSzovegbol(r.value.error), `${mi}: ${r.value.error}`)
  if (r.value.data === undefined) return agHiba('hiba', `${mi}: üres válasz.`)
  return agOk(r.value.data)
}

function ezresek(n: number): string {
  return n.toLocaleString('hu-HU')
}

// ────────────────────────────────────────────────────────────────────────────
// ORSZÁGOS SZÁMLÁLÓK — 8 darab `head:true` count, EGY párhuzamos kötegben
// ────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ MIÉRT A SERVICE-ROLE KLIENS, ÉS MIÉRT NEM A FELHASZNÁLÓÉ.
 *
 * Egy `count:'exact', head:true` lekérdezés az RLS alatt NEM HIBÁZIK, ha a
 * policy elzárja a sorokat — egyszerűen `0`-t ad vissza. Az anyakönyvi táblák
 * policy-i gyülekezetre szűrnek; ha bármelyik nem enged országos olvasást, a
 * csempe „idén 0 keresztelő volt" feliratot mutatna. Ez PONTOSAN a projekt
 * tiltott hibaosztálya: a néma nulla megnyugtat, holott semmit nem tudunk.
 *
 * A service-role kliens ezt a bizonytalanságot szünteti meg. A jogosultsági
 * kaput a KÓD adja (`rendszerAdmin`), nem az RLS — ugyanaz a minta, amit a
 * mentés-sáv (`getBackupBannerStateAction`) is használ. Ha a
 * `SUPABASE_SERVICE_ROLE_KEY` hiányzik, a kliens DOB, az ág elbukik, és a
 * felület kiírja, hogy nem futott le. Fail-closed, nem néma.
 *
 * ⛔ Kerületi admin NEM kaphatja meg: az országos szám kilépne a hatóköréből.
 *    Neki `nincs_jog` jár, ami a felületen egyszerűen elhagyott csempe.
 */
interface OrszagosSzamok {
  ev: number
  belepett7nap: number | null
  ujFiok30nap: number | null
  auditEsemeny24ora: number | null
  keresztseg: number | null
  konfirmalas: number | null
  hazassag: number | null
  temetes: number | null
  penzugyiEvNyitva: number | null
  /** Ami NEM futott le — a felület kiírja, nem nullázza. */
  hibak: string[]
}

type FejEredmeny = { ertek: number | null; hiba: string | null }

async function fejSzam(
  mi: string,
  keres: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<FejEredmeny> {
  try {
    const { count, error } = await keres
    if (error) return { ertek: null, hiba: `${mi}: ${error.message}` }
    if (count === null || count === undefined) {
      return { ertek: null, hiba: `${mi}: a szám nem jött vissza.` }
    }
    return { ertek: count, hiba: null }
  } catch (e: unknown) {
    return { ertek: null, hiba: `${mi}: ${e instanceof Error ? e.message : 'ismeretlen hiba'}` }
  }
}

async function orszagosSzamlalok(
  rendszerAdmin: boolean,
  most: number,
): Promise<{ data?: OrszagosSzamok; error?: string }> {
  if (!rendszerAdmin) {
    return { error: 'Nincs jogosultsága az országos összesítőkhöz.' }
  }

  let supabase: ReturnType<typeof getSupabaseAdminClient>
  try {
    supabase = getSupabaseAdminClient()
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'A rendszer-kliens nem elérhető.' }
  }

  // Az ÉV bukaresti naptár szerint — UTC-ben szilveszter éjjel egy órán át
  // (télen kettőn) még az előző év lenne, és a csempe nullát mutatna.
  const ev = Number(bukarestiNapKulcs(new Date(most)).slice(0, 4))
  const evKezdet = `${ev}-01-01`
  const iso = (ms: number) => new Date(most - ms).toISOString()

  const [
    belepett,
    ujFiok,
    audit,
    keresztseg,
    konfirmalas,
    hazassag,
    temetes,
    penzugyiEv,
  ] = await Promise.all([
    // A `last_seen_at`-ot MINDEN dashboard-oldalbetöltés frissíti
    // (`lib/auth/touch-last-seen.ts`), és van rá index
    // (`idx_profiles_last_seen_at`). Bizonyítottan írt mező, nem elméleti.
    fejSzam(
      'belépett felhasználók',
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_seen_at', iso(7 * 86_400_000)),
    ),
    fejSzam(
      'új fiókok',
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', iso(30 * 86_400_000)),
    ),
    fejSzam(
      'napi tevékenység',
      supabase
        .from('audit_log_with_profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', iso(86_400_000)),
    ),
    fejSzam(
      'keresztelések',
      supabase.from('keresztseg').select('*', { count: 'exact', head: true }).gte('datum', evKezdet),
    ),
    fejSzam(
      'konfirmációk',
      supabase.from('konfirmalas').select('*', { count: 'exact', head: true }).gte('datum', evKezdet),
    ),
    fejSzam(
      'házasságkötések',
      supabase.from('hazassag').select('*', { count: 'exact', head: true }).gte('datum', evKezdet),
    ),
    fejSzam(
      'temetések',
      supabase.from('temetes').select('*', { count: 'exact', head: true }).gte('tdatum', evKezdet),
    ),
    // A `bealitas` elsődleges kulcsa (id, congregation_id), és az `id` maga az
    // ÉV szövegként — vagyis egy évre szűrt sorszám = ahány gyülekezet
    // megnyitotta az évet. Egyetlen head-count.
    fejSzam(
      'megnyitott pénzügyi évek',
      supabase.from('bealitas').select('*', { count: 'exact', head: true }).eq('id', String(ev)),
    ),
  ])

  const mind = [belepett, ujFiok, audit, keresztseg, konfirmalas, hazassag, temetes, penzugyiEv]
  return {
    data: {
      ev,
      belepett7nap: belepett.ertek,
      ujFiok30nap: ujFiok.ertek,
      auditEsemeny24ora: audit.ertek,
      keresztseg: keresztseg.ertek,
      konfirmalas: konfirmalas.ertek,
      hazassag: hazassag.ertek,
      temetes: temetes.ertek,
      penzugyiEvNyitva: penzugyiEv.ertek,
      hibak: mind.map((r) => r.hiba).filter((h): h is string => !!h),
    },
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A köteg
// ────────────────────────────────────────────────────────────────────────────

export async function getAdminOverviewTiles(opts?: {
  /** true → a gyorsítótár megkerülése (a „Frissítés" gomb ezt küldi). */
  frissites?: boolean
}): Promise<{ data?: AttekintesAdat; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  const nezheti = !!access.admin || !!access.master || !!access.egyhazkeruletiAdmin
  if (!nezheti) return { error: 'Nincs jogosultsága az admin áttekintéshez.' }

  const kulcs = gyorsitoKulcs(access)
  if (opts?.frissites) {
    gyorsitotar.delete(kulcs)
  } else {
    const talalat = gyorsitotar.get(kulcs)
    if (talalat && Date.now() - talalat.at < GYORSITOTAR_MS) {
      return { data: { ...talalat.adat, gyorsitotarbol: true } }
    }
  }

  const supabase = access.supabase
  const rendszerAdmin = !!access.admin || !!access.master
  const most = Date.now()

  // ── EGY köteg, allSettled. Minden ág külön hibázhat. ─────────────────────
  const [
    rOverview,
    rKerelem,
    rJegy,
    rLicenc,
    rEszkoz,
    rAudit,
    rImport,
    rDuplikatum,
    rTorles,
    rGodMode,
    rMentes,
    rFrissites,
    rHarang,
    rOrszagos,
  ] = await Promise.allSettled([
    getAdminOverview(),
    getAccessRequestStats(),
    getOpenSupportTicketCountAction(),
    // ⚠️ SZÁNDÉKOSAN közvetlen, minimális lekérdezés a listLicenses() helyett:
    //    ott a profil-nevek feloldása is lefut, ami itt fölösleges kör. A
    //    LEJÁRAT-SZÁMÍTÁS bit-azonos marad, mert ugyanazt a getLicenseLifecycle
    //    függvényt hívjuk, mint az /admin/eszkozok oldal.
    supabase.from('licenses').select('revoked, valid_until'),
    supabase.from('user_devices').select('revoked, last_seen, registered_at'),
    listAuditLog({ limit: 8 }),
    supabase
      .from('import_logs')
      .select('id, module, file_name, created_at, errors, lookup_stats')
      .order('created_at', { ascending: false })
      .limit(10),
    // ⚠️ SZÁNDÉKOSAN `false` MARAD. Az `includeResolved: true` ugyanennyibe
    //    kerülne, DE az RPC `p_limit: 300` korlátja ilyenkor a FELOLDOTT
    //    párokra is elmenne, és 300 fölött NÉMÁN csonkolna — a „12 nyitott"
    //    szám maga válna hamissá. Feloldott/nyitott arányt csak akkor
    //    mutatunk, ha az RPC lapozható lesz.
    listCrossMatchAdmin(false),
    listRecentWipesAction(3),
    // ⚠️ Ez a hívás LEJÁRT süti esetén törli a sütit, ami RENDERELÉS közben a
    //    Next.js-ben kivételt dob. Az `allSettled` elnyeli, és az eredmény
    //    HELYES: a lejárt God Mode nem aktív, tehát a csempe jogosan marad el.
    getGodModeStatus(),
    getBackupBannerStateAction(),
    listChangelogEntries(),
    listErtesitesekAction(),
    orszagosSzamlalok(rendszerAdmin, most),
  ])

  const riadok: Riado[] = []
  const ellenorizve: string[] = []
  const nemFutottLe: AttekintesAdat['nemFutottLe'] = []
  const modulPirulak: ModulPirula[] = []

  // A téma-csoportok sorai. A SORREND FIX — a csoportokon belül is.
  const gyulekezetSorok: PulzusCsempe[] = []
  const emberSorok: PulzusCsempe[] = []
  const anyakonyvSorok: PulzusCsempe[] = []
  const rendszerSorok: PulzusCsempe[] = []
  const gyulekezetHianyzo: string[] = []
  const emberHianyzo: string[] = []
  const anyakonyvHianyzo: string[] = []
  const rendszerHianyzo: string[] = []
  let gyulekezetMegjegyzes: string | null = null
  const emberMegjegyzes: string | null = null
  let anyakonyvMegjegyzes: string | null = null
  /** Hány gyülekezetnek van élő tagja — az országos számok NEVEZŐJE. */
  let nyilvantartottSzam: number | null = null

  function jelez(mi: string, ag: Ag<unknown>) {
    if (ag.ok) {
      ellenorizve.push(mi)
    } else if (ag.fajta !== 'nincs_jog') {
      // A „nincs jogod hozzá" NEM hiányzó ellenőrzés — az egyszerűen nem a te
      // dolgod. Csak a valódi bukást és a hiányzó SQL-t soroljuk fel.
      nemFutottLe.push({ mi, miert: ag.uzenet, fajta: ag.fajta })
    }
  }

  // ── 1) God Mode — a legveszélyesebb állapot, amiben a rendszer lehet ──────
  if (rGodMode.status === 'fulfilled' && rGodMode.value.active) {
    const lejar = rGodMode.value.expiresAt
    const perc = lejar ? Math.max(0, Math.round((lejar - most) / 60000)) : null
    riadok.push({
      id: 'god_mode',
      fokozat: 'kritikus',
      cim: 'God Mode aktív',
      mondat:
        'Korlátlan hozzáférésed van minden gyülekezet minden adatához.' +
        (perc !== null ? ` Magától ${perc} perc múlva jár le.` : ''),
      szam: null,
      gombFelirat: 'Kikapcsolom',
      ut: '/god-mode',
      jelvenyek: [],
      // 2026-08-12: a lejárat is a KÖZÖS, Europe/Bucharest-re szögezett
      // formázóból jön — `timeZone` nélkül a Railway-konténer UTC-jét vette,
      // és nyáron 3 órával korábbi lejáratot ígért.
      //
      // ⚠️ 2026-08-12 JAVÍTÁS: NAPTÁRI alak, NEM `huIdopontRelativval`. A God
      //    Mode lejárata a JÖVŐBEN van, a relatív formázó viszont szándékosan
      //    „az imént"-et ad negatív különbségre (idopont-bukarest.ts, önteszt
      //    N5). A csempe így önmagával került ellentmondásba: fent „Magától 42
      //    perc múlva jár le.", alatta „Lejárat: ma 15:12 (az imént)".
      //    A „még N perc" információt a fenti mondat MÁR hordozza — itt a
      //    pontos időpont a dolga.
      alsorok: lejar
        ? [`Lejárat: ${huNaptariIdopontBukarest(new Date(lejar).toISOString(), most)}`]
        : [],
    })
  }

  // ── 2) Mentés ─────────────────────────────────────────────────────────────
  let mentesPulzus: Ag<MentesPulzusNap[]> = agHiba('hiba', 'A mentés-pulzus nem olvasható.')
  if (rMentes.status === 'fulfilled') {
    const m = rMentes.value
    if (m.ok === 'allapot' && m.health) {
      ellenorizve.push('biztonsági mentés')
      // ⚠️ NEM DUPLÁZZUK A RIADÓT: a kritikus/elavult állapotot a
      //    dashboard-layout mentés-sávja MÁR kiírja minden admin oldal tetején.
      //    Itt a NYUGODT, egysoros állapot marad.
      const ikonSzo =
        m.health.allapot === 'friss'
          ? 'Igazolt'
          : m.health.allapot === 'elavult'
            ? 'Elavult'
            : m.health.allapot === 'kritikus'
              ? 'Kritikus'
              : 'Nincs mentés'
      rendszerSorok.push({
        id: 'mentes',
        cimke: 'Mentés állapota',
        ertek: ikonSzo,
        // ⚠️ 2026-08-12 JAVÍTÁS. Itt korábban a NYERS `health.oraSzam`
        //    lebegőpontos szám állt: „Utolsó igazolt mentés: 10.650685 órája".
        //    Mostantól az `utolsoIgazoltAt` ISO-időbélyegből, a KÖZÖS
        //    bukaresti formázóval: „ma 08:12 (10 órája)". A relatív idő SOHA
        //    nem áll magában, és az összehasonlítási pillanat a köteg `most`
        //    értéke — nem `Date.now()` —, különben a 60 mp-es gyorsítótár
        //    miatt elcsúszna a fejléc „Mérve: hh:mm" feliratától.
        alsor: m.health.utolsoIgazoltAt
          ? `Utolsó igazolt mentés: ${huIdopontRelativval(m.health.utolsoIgazoltAt, most)}`
          : 'Még nincs igazolt mentés',
        ut: m.ut ?? '/admin/biztonsagi-mentes',
      })
      modulPirulak.push({
        href: '/admin/biztonsagi-mentes',
        szam: m.health.allapot === 'friss' ? 0 : 1,
        felirat: ikonSzo,
      })

      // ── A MÁR KISZÁMOLT, EDDIG ELDOBOTT LEFEDETTSÉG (nulla extra körút) ──
      const lf = m.lefedettseg
      if (!lf) {
        rendszerHianyzo.push('a mentés lefedettsége (a kivonat nem érkezett meg)')
        mentesPulzus = agHiba('hiba', 'A mentés-pulzus nem érkezett meg.')
      } else if (lf.hiba) {
        // ⚠️ Ha a lefedettség-számítás hibázott, a számok NEM valósak. Ezt
        //    kimondjuk — nem írunk ki „0/0"-t.
        rendszerHianyzo.push(`a mentés lefedettsége: ${lf.hiba}`)
        mentesPulzus = agHiba('hiba', lf.hiba)
      } else {
        mentesPulzus = agOk(lf.pulzus)
        if (lf.tegnap.varhato > 0) {
          const hianyzo = lf.tegnap.problemasOsszesen
          rendszerSorok.push({
            id: 'mentes_lefedettseg',
            cimke: 'Tegnapi mentés',
            ertek: `${ezresek(lf.tegnap.igazolt)} / ${ezresek(lf.tegnap.varhato)}`,
            alsor:
              hianyzo > 0
                ? `${ezresek(hianyzo)} hatókörről hiányzik vagy hibás`
                : 'minden hatókörnek van igazolt mentése',
            ut: '/admin/biztonsagi-mentes',
          })
        }

        const sorozat = hibatlanSorozat(lf.pulzus)
        if (sorozat && sorozat.napok > 0) {
          rendszerSorok.push({
            id: 'mentes_sorozat',
            cimke: 'Hibátlan mentés',
            ertek: sorozat.teljesAblak ? `${sorozat.napok}+ nap` : `${sorozat.napok} nap`,
            alsor: sorozat.teljesAblak
              ? 'a teljes vizsgált időszakban egyetlen kimaradás sem volt'
              : 'megszakítás nélkül, a mai nap még nyitva',
            ut: '/admin/biztonsagi-mentes',
          })
        }

        // A rendszer kora — CSAK ha a nyom megbízható. A `naploOlvashato:false`
        // esetben a születés a FELÜLÍRHATÓ időbélyegekre esne vissza, tehát
        // hamis kort mondanánk. „Nem tudjuk" jobb, mint egy szép szám.
        if (lf.telepitesNap && lf.szuletesMegbizhato) {
          const kor = napKulonbseg(lf.telepitesNap, bukarestiNapKulcs(new Date(most)))
          if (kor !== null && kor >= 0) {
            rendszerSorok.push({
              id: 'mentes_kor',
              cimke: 'A mentés kora',
              ertek: kor === 0 ? 'ma indult' : `${ezresek(kor)} nap`,
              alsor: `${lf.telepitesNap} óta őrzi az adatokat`,
              ut: '/admin/biztonsagi-mentes',
            })
          }
        } else if (lf.telepitesNap && !lf.szuletesMegbizhato) {
          rendszerHianyzo.push('a mentés-rendszer kora (a napló legkorábbi sora nem olvasható)')
        }
      }
    } else if (m.ok === 'nincs_sql') {
      riadok.push({
        id: 'nincs_sql',
        fokozat: 'figyelem',
        cim: 'Egy adatbázis-lépés még nem futott le',
        mondat:
          'A biztonsági mentéshez tartozó adatbázis-lépés még nincs telepítve, ezért a mentés állapotáról semmit nem tudunk.',
        szam: null,
        gombFelirat: 'Mit kell futtatnom?',
        ut: '/admin/biztonsagi-mentes',
        jelvenyek: [],
        alsorok: [],
      })
      mentesPulzus = agHiba('nincs_sql', 'A mentés adatbázis-lépése még nem futott le.')
    } else if (m.ok === 'nincs_jog') {
      mentesPulzus = agHiba('nincs_jog', 'Ehhez a profilodhoz nem tartozik mentés-hatókör.')
    } else if (m.ok === 'hiba') {
      nemFutottLe.push({
        mi: 'biztonsági mentés',
        miert: m.hibaUzenet || 'A mentés állapota nem olvasható.',
        fajta: 'hiba',
      })
      mentesPulzus = agHiba('hiba', m.hibaUzenet || 'A mentés állapota nem olvasható.')
    }
  } else {
    const miert = rMentes.reason instanceof Error ? rMentes.reason.message : 'ismeretlen hiba'
    nemFutottLe.push({ mi: 'biztonsági mentés', miert, fajta: 'hiba' })
    mentesPulzus = agHiba('hiba', miert)
  }

  // ── 3) Áttekintő KPI-k ────────────────────────────────────────────────────
  const agOverview: Ag<Awaited<ReturnType<typeof getAdminOverview>>> =
    rOverview.status === 'fulfilled'
      ? agOk(rOverview.value)
      : agHiba(
          fajtaSzovegbol(
            rOverview.reason instanceof Error ? rOverview.reason.message : String(rOverview.reason),
          ),
          `alapszámok: ${rOverview.reason instanceof Error ? rOverview.reason.message : String(rOverview.reason)}`,
        )
  jelez('gyülekezetek, felhasználók, tagok', agOverview)

  const agKerelem = agBol(rKerelem, 'hozzáférés-kérelmek')
  const agJegy = agBol(rJegy, 'támogatási jegyek')
  jelez('hozzáférés-kérelmek', agKerelem)
  jelez('támogatási jegyek', agJegy)

  let legnagyobbak: Ag<GyulekezetMeret[]> = agOverview.ok
    ? agOk([])
    : agHiba(agOverview.fajta, agOverview.uzenet)

  if (agOverview.ok) {
    const o = agOverview.adat
    const m = o.meretek

    // ── GYÜLEKEZETEK ──────────────────────────────────────────────────────
    gyulekezetSorok.push({
      id: 'gyulekezetek',
      cimke: 'Gyülekezet',
      ertek: ezresek(o.kpis.congregations),
      alsor: null,
      ut: '/admin/gyulekezetek',
    })

    if (o.memberCountsAvailable) {
      gyulekezetSorok.push({
        id: 'nyilvantartott',
        cimke: 'Élő nyilvántartás',
        ertek: ezresek(m.nyilvantartott),
        // ⚠️ A HIÁNYZÓ RPC-SOR NEM NULLA, HANEM ÜRES GYÜLEKEZET. Ezt ki is
        //    mondjuk: a 783-as szám önmagában túlbecsült képet ad a rendszerről.
        alsor:
          m.ures > 0
            ? `${ezresek(m.ures)} gyülekezetben még nincs egyetlen élő tag sem`
            : null,
        ut: '/admin/gyulekezetek',
      })
      if (m.legnagyobb) {
        gyulekezetSorok.push({
          id: 'legnagyobb',
          cimke: 'Legnagyobb gyülekezet',
          ertek: ezresek(m.legnagyobb.members),
          alsor: `${m.legnagyobb.name} — élő tag`,
          ut: null,
        })
      }
      if (m.nyilvantartott >= 2 && m.legkisebbNemUres) {
        gyulekezetSorok.push({
          id: 'tipikus_meret',
          cimke: 'Tipikus méret',
          ertek: ezresek(m.mediaan),
          alsor: `medián · a legkisebb ${ezresek(m.legkisebbNemUres.members)} fő (${m.legkisebbNemUres.name})`,
          ut: null,
        })
      }
      legnagyobbak = agOk(
        o.top10
          .filter((t) => t.members > 0)
          .map((t) => ({ nev: t.name, tagok: t.members })),
      )
      // ⚠️ CSAK MÉRT ÁLLÍTÁS. Azt tudjuk, hogy hány gyülekezetnek van élő tagja
      //    — azt NEM, hogy a többi miért üres. A mondat ezért nem tippel okot.
      gyulekezetMegjegyzes =
        m.nyilvantartott > 0
          ? `A ${ezresek(o.kpis.congregations)} gyülekezetből ${ezresek(m.nyilvantartott)} vezet élő tagnyilvántartást; a többiben még nincs rögzített élő tag.`
          : null
      nyilvantartottSzam = m.nyilvantartott
    } else {
      // ⚠️ NEM NULLÁZUNK. Ha a bontás-RPC nem futott le, minden gyülekezet
      //    „üresnek" látszana — ezt inkább KIMONDJUK.
      gyulekezetHianyzo.push(
        'a gyülekezetenkénti tagszám (az összesítő adatbázis-lépés nem futott le), ezért az üres/legnagyobb/tipikus méret most nem olvasható',
      )
      legnagyobbak = agHiba('nincs_sql', 'A gyülekezetenkénti tagszám-összesítő nem elérhető.')
    }

    gyulekezetSorok.push({
      id: 'egyhazmegyek',
      cimke: 'Egyházmegye',
      ertek: ezresek(o.dioceseCount),
      alsor:
        o.orphanCongregations > 0
          ? `${ezresek(o.orphanCongregations)} gyülekezet egyházmegye nélkül`
          : null,
      ut: '/admin/gyulekezetek',
    })

    // ── EMBEREK ───────────────────────────────────────────────────────────
    emberSorok.push({
      id: 'tagok',
      cimke: 'Élő tag',
      ertek: ezresek(o.kpis.members),
      alsor: o.memberCountsAvailable
        ? `${ezresek(m.nyilvantartott)} gyülekezet nyilvántartásából`
        : null,
      ut: null,
    })
    emberSorok.push({
      id: 'felhasznalok',
      cimke: 'Aktív felhasználó',
      ertek: ezresek(o.kpis.activeUsers),
      alsor: null,
      ut: '/admin/felhasznalok',
    })

    // ── Elbírálásra váró regisztráció ──────────────────────────────────────
    // A FŐSZÁM a hatókör-szűrt `profiles.status='pending'`-ből jön; a 24 órás
    // és a „legrégebbi" alsor csak KIEGÉSZÍTÉS. Így a kerületi admin is valós
    // számot lát akkor is, ha a kérelem-statisztika kapuja kizárja.
    const fuggo = o.kpis.pendingUsers
    if (fuggo > 0) {
      const jelvenyek: UjdonsagJelveny[] = []
      const alsorok: string[] = []
      const e = erintetlenJelveny(fuggo, 'még nincs elbírálva')
      if (e) jelvenyek.push(e)
      if (agKerelem.ok) {
        const j = idoJelveny(agKerelem.adat.last24h, 24)
        if (j) jelvenyek.push(j)
        const nap = eltelt_nap(agKerelem.adat.oldestPendingCreatedAt, most)
        if (nap !== null && nap >= 1) {
          alsorok.push(`A legrégebbi kérelem ${nap} napja vár.`)
        }
      } else if (agKerelem.fajta === 'nincs_jog') {
        alsorok.push('A részletes kérelem-statisztikához a te profilod nem fér hozzá.')
      }
      riadok.push({
        id: 'kerelem',
        fokozat: 'figyelem',
        cim: 'Elbírálásra váró regisztráció',
        mondat:
          fuggo === 1
            ? 'Egy lelkész vár a jóváhagyásra — addig nem tud belépni a gyülekezete adataihoz.'
            : `${fuggo} regisztráció vár a jóváhagyásra — addig ők nem tudnak belépni a gyülekezetük adataihoz.`,
        szam: fuggo,
        gombFelirat: 'Elbírálom',
        ut: '/admin/felhasznalok',
        jelvenyek,
        alsorok,
      })
      modulPirulak.push({
        href: '/admin/felhasznalok',
        szam: fuggo,
        felirat: `${fuggo} elbírálásra vár`,
      })
    }

    // ── Támogatási jegy ────────────────────────────────────────────────────
    const nyitottJegy = agJegy.ok ? agJegy.adat.open : o.kpis.pendingTickets
    if (nyitottJegy > 0) {
      riadok.push({
        id: 'jegy',
        fokozat: 'figyelem',
        cim: 'Nyitott támogatási jegy',
        mondat:
          nyitottJegy === 1
            ? 'Egy kérdés vár válaszra — a másik oldalon egy lelkész elakadt.'
            : `${nyitottJegy} kérdés vár válaszra — mindegyik mögött egy elakadt felhasználó áll.`,
        szam: nyitottJegy,
        gombFelirat: 'Megnézem',
        ut: '/admin/tamogatas',
        jelvenyek: [],
        alsorok: [],
      })
      modulPirulak.push({
        href: '/admin/tamogatas',
        szam: nyitottJegy,
        felirat: `${nyitottJegy} nyitott jegy`,
      })
    }

    // ── Árva gyülekezet ────────────────────────────────────────────────────
    if (o.orphanCongregations > 0) {
      riadok.push({
        id: 'arva_gyulekezet',
        fokozat: 'tajekoztato',
        cim: 'Egyházmegye nélküli gyülekezet',
        mondat: `${o.orphanCongregations} gyülekezetnek nincs egyházmegyéje, ezért kimaradnak minden egyházmegyei összesítőből.`,
        szam: o.orphanCongregations,
        gombFelirat: 'Besorolom',
        ut: '/admin/gyulekezetek',
        jelvenyek: [],
        alsorok: [],
      })
    }
  } else {
    gyulekezetHianyzo.push(agOverview.uzenet)
    emberHianyzo.push(agOverview.uzenet)
  }

  // ── Kérelem-statisztika: a MÁR LEKÉRT, de eddig eldobott mezők ────────────
  if (agKerelem.ok) {
    const k = agKerelem.adat
    if (k.approved + k.rejected > 0) {
      emberSorok.push({
        id: 'elbiralt_kerelem',
        cimke: 'Elbírált kérelem',
        ertek: ezresek(k.approved + k.rejected),
        alsor: `${ezresek(k.approved)} jóváhagyva · ${ezresek(k.rejected)} elutasítva`,
        ut: '/admin/felhasznalok',
      })
    }
    if (k.last7d > 0) {
      emberSorok.push({
        id: 'kerelem_7nap',
        cimke: 'Új kérelem — 7 nap',
        ertek: ezresek(k.last7d),
        alsor: `ebből ${ezresek(k.last24h)} az elmúlt 24 órában`,
        ut: '/admin/felhasznalok',
      })
    }
  }

  // ── 4) Licencek és eszközök ───────────────────────────────────────────────
  const agLicenc: Ag<Array<{ revoked: boolean; valid_until: string }>> =
    rLicenc.status === 'fulfilled'
      ? rLicenc.value.error
        ? agHiba(fajtaSzovegbol(rLicenc.value.error.message), `licencek: ${rLicenc.value.error.message}`)
        : agOk((rLicenc.value.data || []) as Array<{ revoked: boolean; valid_until: string }>)
      : agHiba('hiba', 'licencek: a lekérdezés elhasalt.')
  jelez('licencek', agLicenc)

  const agEszkoz: Ag<Array<{ revoked: boolean; last_seen: string | null; registered_at: string }>> =
    rEszkoz.status === 'fulfilled'
      ? rEszkoz.value.error
        ? agHiba(fajtaSzovegbol(rEszkoz.value.error.message), `eszközök: ${rEszkoz.value.error.message}`)
        : agOk(
            (rEszkoz.value.data || []) as Array<{
              revoked: boolean
              last_seen: string | null
              registered_at: string
            }>,
          )
      : agHiba('hiba', 'eszközök: a lekérdezés elhasalt.')
  jelez('asztali eszközök', agEszkoz)

  if (agLicenc.ok) {
    const lejart = agLicenc.adat.filter((l) => getLicenseLifecycle(l, most) === 'expired').length
    const lejaro = agLicenc.adat.filter((l) => getLicenseLifecycle(l, most) === 'expiring').length
    const aktiv = agLicenc.adat.filter((l) => getLicenseLifecycle(l, most) === 'active').length
    const alvo = agEszkoz.ok ? agEszkoz.adat.filter((d) => isDeviceDormant(d, most)).length : 0

    if (lejart > 0 || lejaro > 0) {
      const alsorok: string[] = []
      if (lejaro > 0) alsorok.push(`${lejaro} licenc ${LICENSE_EXPIRY_WARNING_DAYS} napon belül lejár.`)
      if (alvo > 0) alsorok.push(`${alvo} eszköz ${DORMANT_DEVICE_DAYS}+ napja nem adott életjelet.`)
      riadok.push({
        id: 'licenc',
        fokozat: lejart > 0 ? 'kritikus' : 'figyelem',
        cim: lejart > 0 ? 'Lejárt licenc' : 'Hamarosan lejáró licenc',
        mondat:
          lejart > 0
            ? `${lejart} licenc már lejárt — az érintett gyülekezetek asztali programja nem indul el.`
            : `${lejaro} licenc ${LICENSE_EXPIRY_WARNING_DAYS} napon belül lejár.`,
        szam: lejart > 0 ? lejart : lejaro,
        gombFelirat: 'Megnézem',
        ut: '/admin/eszkozok',
        jelvenyek: [],
        alsorok,
      })
      modulPirulak.push({
        href: '/admin/eszkozok',
        szam: lejart + lejaro,
        felirat: lejart > 0 ? `${lejart} lejárt licenc` : `${lejaro} hamarosan lejár`,
      })
    }

    rendszerSorok.push({
      id: 'licencek',
      cimke: 'Aktív licenc',
      ertek: ezresek(aktiv),
      alsor: agEszkoz.ok
        ? `${ezresek(agEszkoz.adat.filter((d) => !d.revoked).length)} élő eszköz${
            alvo > 0 ? ` · ${ezresek(alvo)} alvó (${DORMANT_DEVICE_DAYS}+ napja néma)` : ''
          }`
        : 'Az eszközök száma most nem olvasható',
      ut: '/admin/eszkozok',
    })
  } else {
    rendszerHianyzo.push(agLicenc.uzenet)
  }

  // ── 5) Import ─────────────────────────────────────────────────────────────
  type ImportSor = {
    id: string
    module: string
    file_name: string | null
    created_at: string
    errors: Array<unknown> | null
    lookup_stats: { warnings?: string[] } | null
  }
  const agImport: Ag<ImportSor[]> =
    rImport.status === 'fulfilled'
      ? rImport.value.error
        ? agHiba(
            fajtaSzovegbol(rImport.value.error.message),
            `import-napló: ${rImport.value.error.message}`,
          )
        : agOk((rImport.value.data || []) as unknown as ImportSor[])
      : agHiba('hiba', 'import-napló: a lekérdezés elhasalt.')
  jelez('import-napló', agImport)

  if (agImport.ok) {
    // Csak az elmúlt 30 nap érdekes — örök riadót nem tartunk fenn.
    const friss = agImport.adat.filter((r) => {
      const nap = eltelt_nap(r.created_at, most)
      return nap !== null && nap <= 30
    })
    const hibasak = friss.filter((r) => (r.errors?.length ?? 0) > 0)
    if (hibasak.length > 0) {
      const legutobbi = hibasak[0]
      const hibaSzam = legutobbi.errors?.length ?? 0
      const nap = eltelt_nap(legutobbi.created_at, most) ?? 0
      const warn = legutobbi.lookup_stats?.warnings?.length ?? 0
      const j = idoJelveny(
        ablakban_szamol(hibasak.map((r) => r.created_at), most, 168),
        168,
      )
      riadok.push({
        id: 'import',
        fokozat: 'figyelem',
        cim: 'Hibával futott import',
        mondat: `A legutóbbi hibás import ${hibaSzam} hibával futott${nap === 0 ? ' ma' : ` ${nap} napja`}${legutobbi.file_name ? ` (${legutobbi.file_name})` : ''}.`,
        szam: hibaSzam,
        gombFelirat: 'Napló megnyitása',
        ut: '/admin/import',
        jelvenyek: j ? [j] : [],
        alsorok: warn > 0 ? [`Ezen felül ${warn} tétel párosítása nem sikerült — ezek adathiányt hagynak.`] : [],
      })
    }

    // 2026-08-12: a SIKERES import ténye is információ — eddig csak a hibás
    // kapott helyet, vagyis a „mikor került utoljára új adat a rendszerbe"
    // kérdésre sehol nem volt válasz. Ugyanabból a 10 betöltött sorból.
    const sikeres = agImport.adat.find((r) => (r.errors?.length ?? 0) === 0)
    if (sikeres) {
      rendszerSorok.push({
        id: 'utolso_import',
        cimke: 'Utolsó sikeres import',
        ertek: sikeres.module || 'ismeretlen modul',
        alsor: `${huIdopontRelativval(sikeres.created_at, most)}${sikeres.file_name ? ` · ${sikeres.file_name}` : ''}`,
        ut: '/admin/import',
      })
    }
  }

  // ── 6) Feloldatlan duplikátum-párok ───────────────────────────────────────
  if (rDuplikatum.status === 'fulfilled') {
    const d = rDuplikatum.value
    if (d.needsSql) {
      riadok.push({
        id: 'nincs_sql',
        fokozat: 'figyelem',
        cim: 'Egy adatbázis-lépés még nem futott le',
        mondat:
          'A kereszt-gyülekezeti egyeztetéshez tartozó adatbázis-lépés még nincs telepítve, ezért a duplikátumok számáról semmit nem tudunk.',
        szam: null,
        gombFelirat: 'Mit kell futtatnom?',
        ut: '/admin/egyeztetesek',
        jelvenyek: [],
        alsorok: [],
      })
    } else if (d.error) {
      nemFutottLe.push({ mi: 'tag-egyeztetések', miert: d.error, fajta: fajtaSzovegbol(d.error) })
    } else if (d.rows) {
      ellenorizve.push('tag-egyeztetések')
      const nyitott = d.rows.filter((r) => !r.resolution)
      if (nyitott.length > 0) {
        const ertesitetlen = nyitott.filter((r) => !r.adminNotifiedAt).length
        const jel = erintetlenJelveny(ertesitetlen, 'párról a lelkészek még nem tudnak')
        riadok.push({
          id: 'duplikatum',
          fokozat: 'tajekoztato',
          cim: 'Feloldatlan egyezés',
          mondat: `${nyitott.length} olyan egyezés vár feloldásra, ahol ugyanaz a személy két gyülekezetben szerepel.`,
          szam: nyitott.length,
          gombFelirat: 'Egyeztetések',
          ut: '/admin/egyeztetesek',
          jelvenyek: jel ? [jel] : [],
          alsorok: [],
        })
        modulPirulak.push({
          href: '/admin/egyeztetesek',
          szam: nyitott.length,
          felirat: `${nyitott.length} nyitott pár`,
        })
      }
    }
  } else {
    nemFutottLe.push({ mi: 'tag-egyeztetések', miert: 'a lekérdezés elhasalt.', fajta: 'hiba' })
  }

  // ── 7) Friss adattörlés ───────────────────────────────────────────────────
  if (rTorles.status === 'fulfilled' && rTorles.value.success) {
    ellenorizve.push('adattörlési napló')
    const friss = (rTorles.value.rows || []).filter((w) => {
      const nap = eltelt_nap(w.initiated_at, most)
      return nap !== null && nap <= 30
    })
    if (friss.length > 0) {
      const j = idoJelveny(ablakban_szamol(friss.map((w) => w.initiated_at), most, 168), 168)
      riadok.push({
        id: 'adattorles',
        fokozat: 'figyelem',
        cim: 'Friss adattörlés',
        mondat: `Az elmúlt 30 napban ${friss.length} adattörlés futott le. Ez visszafordíthatatlan művelet.`,
        szam: friss.length,
        gombFelirat: 'Törlési napló',
        ut: '/admin/veszelyes-zona',
        jelvenyek: j ? [j] : [],
        alsorok: friss.slice(0, 3).map((w) => {
          const nap = eltelt_nap(w.initiated_at, most)
          return `${w.congregation_name || 'Ismeretlen gyülekezet'} · ${ezresek(w.total_rows_deleted || 0)} sor · ${
            nap === 0 ? 'ma' : `${nap} napja`
          }`
        }),
      })
    }
  } else if (rTorles.status === 'fulfilled' && rTorles.value.error) {
    nemFutottLe.push({
      mi: 'adattörlési napló',
      miert: rTorles.value.error,
      fajta: fajtaSzovegbol(rTorles.value.error),
    })
  }

  // ── 8/a) A FUTÓ KIADÁS — a `package.json`-ból, NEM a changelogból ─────────
  // ⚠️ Ez a csempe a rendszer állapotáról TÉNYT állít, ezért az egyetlen
  //    hiteles forrásból jön: az `apps/web/package.json` `version` mezőjéből,
  //    amit a build magával visz. A changelog azt mondja meg, mit ÍRTUNK LE
  //    utoljára — az kettővel korábbi kiadásnál is tarthat (2026-08-12-én
  //    tartott is: changelog v0.9.162 ⇄ élesben v0.9.164).
  const futoVerzio = verzioFelirat(FUTO_WEB_VERZIO)
  if (futoVerzio) {
    rendszerSorok.push({
      id: 'futo_verzio',
      cimke: 'Futó kiadás',
      ertek: futoVerzio,
      alsor: 'a most futó webalkalmazás verziója',
      ut: null,
    })
  } else {
    // NINCS NÉMA NULLA: ha a build nem adta át a verziót, azt kimondjuk.
    rendszerHianyzo.push('a futó kiadás verziószáma (a build nem adta át)')
  }

  // ── 8/b) Kiküldésre váró frissítés + a rendszer kiadás-tempója ────────────
  if (rFrissites.status === 'fulfilled') {
    const f = rFrissites.value
    if (f.error && !f.data) {
      // ⚠️ Itt SOSEM írunk 0-t: pontosan ez a most javított hiba természete.
      nemFutottLe.push({ mi: 'kiküldésre váró frissítések', miert: f.error, fajta: 'hiba' })
      rendszerHianyzo.push('a rendszer kiadásai (a changelog beolvasása elbukott)')
    } else if (f.data) {
      ellenorizve.push('kiküldésre váró frissítések')
      const varakozo = f.data.filter(varKikuldesre)
      const kiemeltek = varakozo.filter(kiemelt)
      if (varakozo.length > 0) {
        riadok.push({
          id: 'frissites',
          fokozat: 'tajekoztato',
          cim: 'Kiküldésre váró frissítés',
          mondat: `${varakozo.length} fejlesztésről még nem kaptak értesítést a gyülekezetek.`,
          szam: varakozo.length,
          gombFelirat: 'Frissítések',
          ut: '/admin/frissitesek',
          jelvenyek: [],
          alsorok: kiemeltek.slice(0, 3).map((e) => `Kiemelt: ${e.title}`),
        })
        modulPirulak.push({
          href: '/admin/frissitesek',
          szam: varakozo.length,
          felirat: `${varakozo.length} kiküldésre vár`,
        })
      }

      // ── KIADÁSI JEGYZET ÉS TEMPÓ (nulla extra lekérdezés) ───────────────
      // ⚠️ SZÁNDÉKOSAN a legnagyobb dátumot keressük, nem az `entries[0]`-t: a
      //    lista sorrendje a fájl sorrendje, és egy kézi átrendezés némán rossz
      //    verziót írna ki.
      const legfrissebb = f.data.reduce<(typeof f.data)[number] | null>(
        (a, b) => (a === null || b.date > a.date ? b : a),
        null,
      )
      if (legfrissebb) {
        const verzios = f.data
          .filter((e) => !!e.version)
          .reduce<(typeof f.data)[number] | null>((a, b) => (a === null || b.date > a.date ? b : a), null)
        // ⚠️ A CÍMKE MOST MÁR IGAZAT MOND. Ez a szám a fejlesztési naplóból jön,
        //    tehát azt írja le, mit JEGYEZTÜNK FEL utoljára — a ténylegesen futó
        //    kiadás a fenti, `package.json`-alapú csempén áll. A kettő
        //    ELTÉRHET, és ha eltér, azt itt ki is mondjuk.
        const jegyzetVerzio = verzioFelirat(verzios?.version)
        const elter = !!jegyzetVerzio && !!futoVerzio && jegyzetVerzio !== futoVerzio
        rendszerSorok.push({
          id: 'kiadasi_jegyzet',
          cimke: 'Utolsó kiadási jegyzet',
          ertek: jegyzetVerzio ?? legfrissebb.dateLabel,
          // Nem tippelünk irányt („újabb"/„régebbi") — csak azt mondjuk ki, ami
          // mért tény: a két szám nem ugyanaz.
          alsor: elter
            ? `utolsó fejlesztés: ${legfrissebb.date} · a futó kiadás ettől eltér (${futoVerzio})`
            : `utolsó fejlesztés: ${legfrissebb.date}`,
          ut: '/admin/frissitesek',
        })
        const harmincNapja = bukarestiNapKulcs(new Date(most - 30 * 86_400_000))
        const utobbi30 = f.data.filter((e) => e.date >= harmincNapja).length
        if (utobbi30 > 0) {
          rendszerSorok.push({
            id: 'fejlesztes_tempo',
            cimke: 'Fejlesztés — 30 nap',
            ertek: ezresek(utobbi30),
            alsor: `összesen ${ezresek(f.data.length)} bejegyzés a fejlesztési naplóban`,
            ut: '/admin/frissitesek',
          })
        }
      }
    }
  }

  // ── 9) Idővonal ───────────────────────────────────────────────────────────
  const agAudit = agBol(rAudit, 'tevékenység-napló')
  jelez('tevékenység-napló', agAudit)
  const idovonal: Ag<IdovonalSor[]> = agAudit.ok
    ? agOk(
        agAudit.adat.map((r) => {
          const cimke = AUDIT_ACTION_LABELS[r.action] || r.action
          return {
            id: r.id,
            szoveg: cimke,
            ki: r.user_email,
            mikor: r.created_at,
            // Visszafordíthatatlan vagy jogosultsági esemény → kiemelt sor.
            kiemelt:
              r.action.startsWith('access_request') ||
              r.action.includes('revoke') ||
              r.action.includes('wipe') ||
              r.action.includes('god'),
          }
        }),
      )
    : agAudit

  // ── 10) Üzenetek (az EGYETLEN valódi „még nem láttad") ────────────────────
  let uzenetek: Ag<UzenetSor[]>
  if (rHarang.status === 'fulfilled') {
    const h = rHarang.value
    if (h.error) {
      uzenetek = agHiba('hiba', `harang-üzenetek: ${h.error}`)
      nemFutottLe.push({ mi: 'harang-üzenetek', miert: h.error, fajta: 'hiba' })
    } else {
      ellenorizve.push('harang-üzenetek')
      const sorok = (h.rows || [])
        .filter((r) => !r.archived)
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          cim: r.cim,
          mikor: r.createdAt,
          olvasatlan: !r.olvasva,
        }))
      uzenetek = agOk(sorok)
      const olvasatlan = (h.rows || []).filter((r) => !r.olvasva && !r.archived).length
      const j = olvasatlanJelveny(olvasatlan)
      if (j) {
        emberSorok.push({
          id: 'uzenetek',
          cimke: 'Neked szóló üzenet',
          ertek: ezresek(olvasatlan),
          alsor: 'még nem olvastad',
          ut: '/notifications',
        })
      }
    }
  } else {
    uzenetek = agHiba('hiba', 'harang-üzenetek: a lekérdezés elhasalt.')
    nemFutottLe.push({ mi: 'harang-üzenetek', miert: 'a lekérdezés elhasalt.', fajta: 'hiba' })
  }

  // ── 11) Országos számlálók (8 head-count) ────────────────────────────────
  const agOrszagos = agBol(rOrszagos, 'országos összesítők')
  jelez('országos összesítők', agOrszagos)
  if (agOrszagos.ok) {
    const sz = agOrszagos.adat
    // ⚠️ A NEVEZŐ. Az anyakönyvi számok a TELJES adatbázisra vonatkoznak, de a
    //    rendszerben ma csak néhány gyülekezetnek van élő nyilvántartása —
    //    e nélkül a mondat nélkül a szám országos lefedettséget sugallna.
    anyakonyvMegjegyzes =
      nyilvantartottSzam !== null
        ? `A ${sz.ev}. évben rögzített szolgálatok a teljes adatbázisból. Élő tagnyilvántartást ma ${ezresek(nyilvantartottSzam)} gyülekezet vezet — a régebbi anyakönyvi bejegyzések importból is származhatnak.`
        : `A ${sz.ev}. évben rögzített szolgálatok a teljes adatbázisból.`

    if (sz.belepett7nap !== null) {
      emberSorok.push({
        id: 'belepett7',
        cimke: 'Belépett — 7 nap',
        ertek: ezresek(sz.belepett7nap),
        alsor: 'a profilok utolsó aktivitása alapján',
        ut: '/admin/felhasznalok',
      })
    }
    if (sz.ujFiok30nap !== null && sz.ujFiok30nap > 0) {
      emberSorok.push({
        id: 'uj_fiok30',
        cimke: 'Új fiók — 30 nap',
        ertek: ezresek(sz.ujFiok30nap),
        alsor: null,
        ut: '/admin/felhasznalok',
      })
    }
    if (sz.auditEsemeny24ora !== null) {
      rendszerSorok.push({
        id: 'audit24',
        cimke: 'Esemény — 24 óra',
        ertek: ezresek(sz.auditEsemeny24ora),
        alsor: 'naplózott művelet az egész rendszerben',
        ut: '/admin/naplo',
      })
    }
    if (sz.penzugyiEvNyitva !== null) {
      gyulekezetSorok.push({
        id: 'penzugyi_ev',
        cimke: `${sz.ev}. évet megnyitotta`,
        ertek: ezresek(sz.penzugyiEvNyitva),
        alsor: 'gyülekezet használja a pénzügyi modult idén',
        ut: null,
      })
    }

    const anyakonyv: Array<[string, string, number | null]> = [
      ['keresztseg', 'Keresztelés', sz.keresztseg],
      ['konfirmalas', 'Konfirmáció', sz.konfirmalas],
      ['hazassag', 'Házasságkötés', sz.hazassag],
      ['temetes', 'Temetés', sz.temetes],
    ]
    for (const [id, cimke, ertek] of anyakonyv) {
      if (ertek === null) continue
      anyakonyvSorok.push({
        id,
        cimke,
        ertek: ezresek(ertek),
        alsor: `${sz.ev}-ben`,
        ut: null,
      })
    }

    // ⚠️ Ami ezen belül NEM futott le, azt csoportonként kiírjuk. Egyetlen
    //    elbukott head-count nem viheti el a többi hetet — de nullának sem
    //    látszhat.
    for (const h of sz.hibak) {
      if (/keresztel|konfirm|házasság|temet/i.test(h)) anyakonyvHianyzo.push(h)
      else if (/belépett|új fiók/i.test(h)) emberHianyzo.push(h)
      else if (/pénzügyi/i.test(h)) gyulekezetHianyzo.push(h)
      else rendszerHianyzo.push(h)
    }
  }

  // ── Összerakás ────────────────────────────────────────────────────────────
  // Kettőzés-szűrés: a „nincs_sql" riadó több modulból is jöhet — egyet mutatunk,
  // a mondatokat összefűzve, hogy ne legyen két egyforma csempe egymás alatt.
  const nincsSqlok = riadok.filter((r) => r.id === 'nincs_sql')
  let vegso = riadok.filter((r) => r.id !== 'nincs_sql')
  if (nincsSqlok.length > 0) {
    vegso = [
      ...vegso,
      {
        ...nincsSqlok[0],
        mondat:
          nincsSqlok.length === 1
            ? nincsSqlok[0].mondat
            : `${nincsSqlok.length} modulhoz tartozó adatbázis-lépés még nincs telepítve, ezért azok a számok most nem valósak.`,
        alsorok: nincsSqlok.length > 1 ? nincsSqlok.map((r) => r.mondat) : [],
      },
    ]
  }

  // Egyházmegyei bontás — NULLA extra lekérdezés, a getAdminOverview már hozta.
  const egyhazmegyek: Ag<{ sorok: EgyhazmegyeSor[]; tagszamElerheto: boolean }> = agOverview.ok
    ? agOk({
        sorok: agOverview.adat.dioceseStats.map((d) => ({
          nev: d.name,
          gyulekezetek: d.congregations,
          tagok: d.members,
        })),
        tagszamElerheto: agOverview.adat.memberCountsAvailable,
      })
    : agOverview

  // A CSOPORTOK SORRENDJE FIX — az izommemória itt ugyanúgy számít, mint a
  // riadóknál. Ami üres és nem is hiányzik, az kiesik (a csend elve).
  const szamCsoportok: SzamCsoport[] = csoportokSorrendben([
    {
      id: 'gyulekezetek',
      cim: 'Gyülekezetek',
      megjegyzes: gyulekezetMegjegyzes,
      sorok: gyulekezetSorok,
      hianyzo: gyulekezetHianyzo,
    },
    {
      id: 'emberek',
      cim: 'Emberek',
      megjegyzes: emberMegjegyzes,
      sorok: emberSorok,
      hianyzo: emberHianyzo,
    },
    {
      id: 'anyakonyv',
      cim: 'Anyakönyv',
      megjegyzes: anyakonyvMegjegyzes,
      sorok: anyakonyvSorok,
      hianyzo: anyakonyvHianyzo,
    },
    {
      id: 'rendszer',
      cim: 'Rendszer és mentés',
      megjegyzes: null,
      sorok: rendszerSorok,
      hianyzo: rendszerHianyzo,
    },
  ])

  const adat: AttekintesAdat = {
    mertAt: new Date(most).toISOString(),
    gyorsitotarbol: false,
    riadok: riadokSorrendben(vegso),
    szamCsoportok,
    idovonal,
    uzenetek,
    egyhazmegyek,
    legnagyobbak,
    mentesPulzus,
    modulPirulak,
    ellenorizve,
    nemFutottLe,
    rendszerAdmin,
  }

  gyorsitotar.set(kulcs, { at: most, adat })
  return { data: adat }
}

/** A „Frissítés" gomb: üríti a gyorsítótárat és újratölti az oldalt. */
export async function frissitAdminAttekintes(): Promise<{ success: true }> {
  const access = await getEffectiveAccessContext()
  if (access.user) gyorsitotar.delete(gyorsitoKulcs(access))
  revalidatePath('/admin')
  return { success: true }
}
