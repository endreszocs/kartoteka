'use server'

/**
 * Admin ÁTTEKINTÉS — EGYETLEN adatköteg (2026-08-12).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * HÁROM SZABÁLY, AMIT EZ A FÁJL BETART
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
 *       · getSystemFinanceSummary— árfolyam-lekéréssel.
 *     Az első három GOMBRA fut a „Mélyebb ellenőrzések" panelben; az utolsó
 *     szándékosan nem került az áttekintőre (lásd a záró jelentést).
 *
 * TELJESÍTMÉNY: az egész köteg 60 másodpercre GYORSÍTÓTÁRAZVA, felhasználónként
 * és bekapcsolt profilonként. Ez az oldal minden admin-belépéskor betölt; a
 * gyorsítótár nélkül minden F5 újra elindítaná a teljes köteget. A „Frissítés"
 * gomb üríti.
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
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
  IdovonalSor,
  ModulPirula,
  PulzusCsempe,
  Riado,
  UjdonsagJelveny,
  UzenetSor,
} from './overview-shared'
import {
  agHiba,
  agOk,
  ablakban_szamol,
  eltelt_nap,
  erintetlenJelveny,
  idoJelveny,
  olvasatlanJelveny,
  riadokSorrendben,
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
    listCrossMatchAdmin(false),
    listRecentWipesAction(3),
    // ⚠️ Ez a hívás LEJÁRT süti esetén törli a sütit, ami RENDERELÉS közben a
    //    Next.js-ben kivételt dob. Az `allSettled` elnyeli, és az eredmény
    //    HELYES: a lejárt God Mode nem aktív, tehát a csempe jogosan marad el.
    getGodModeStatus(),
    getBackupBannerStateAction(),
    listChangelogEntries(),
    listErtesitesekAction(),
  ])

  const most = Date.now()
  const riadok: Riado[] = []
  const pulzus: PulzusCsempe[] = []
  const ellenorizve: string[] = []
  const nemFutottLe: AttekintesAdat['nemFutottLe'] = []
  const modulPirulak: ModulPirula[] = []

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
      alsorok: lejar
        ? [`Lejárat: ${new Date(lejar).toLocaleString('hu-HU', { dateStyle: 'medium', timeStyle: 'short' })}`]
        : [],
    })
  }

  // ── 2) Mentés ─────────────────────────────────────────────────────────────
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
      pulzus.push({
        id: 'mentes',
        cimke: 'Mentés állapota',
        ertek: ikonSzo,
        alsor:
          m.health.oraSzam !== null
            ? `Utolsó igazolt mentés: ${m.health.oraSzam} órája`
            : 'Még nincs igazolt mentés',
        ut: m.ut ?? '/admin/biztonsagi-mentes',
      })
      modulPirulak.push({
        href: '/admin/biztonsagi-mentes',
        szam: m.health.allapot === 'friss' ? 0 : 1,
        felirat: ikonSzo,
      })
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
    } else if (m.ok === 'hiba') {
      nemFutottLe.push({
        mi: 'biztonsági mentés',
        miert: m.hibaUzenet || 'A mentés állapota nem olvasható.',
        fajta: 'hiba',
      })
    }
  } else {
    nemFutottLe.push({
      mi: 'biztonsági mentés',
      miert: rMentes.reason instanceof Error ? rMentes.reason.message : 'ismeretlen hiba',
      fajta: 'hiba',
    })
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

  if (agOverview.ok) {
    const o = agOverview.adat
    pulzus.push({
      id: 'gyulekezetek',
      cimke: 'Gyülekezet',
      ertek: ezresek(o.kpis.congregations),
      alsor:
        o.orphanCongregations > 0
          ? `ebből ${o.orphanCongregations} egyházmegye nélkül`
          : null,
      ut: '/admin/gyulekezetek',
    })
    pulzus.push({
      id: 'tagok',
      cimke: 'Élő tag',
      ertek: ezresek(o.kpis.members),
      // ⚠️ Ha a bontás-RPC nem futott le, azt KIMONDJUK — nem nullázzuk.
      alsor: o.memberCountsAvailable ? null : 'Az egyházmegyei bontás most nem elérhető',
      ut: null,
    })
    pulzus.push({
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

    pulzus.push({
      id: 'licencek',
      cimke: 'Aktív licenc',
      ertek: ezresek(aktiv),
      alsor: agEszkoz.ok
        ? `${ezresek(agEszkoz.adat.filter((d) => !d.revoked).length)} élő eszköz`
        : 'Az eszközök száma most nem olvasható',
      ut: '/admin/eszkozok',
    })
  }

  // ── 5) Hibával futott import ──────────────────────────────────────────────
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

  // ── 8) Kiküldésre váró frissítés ──────────────────────────────────────────
  if (rFrissites.status === 'fulfilled') {
    const f = rFrissites.value
    if (f.error && !f.data) {
      // ⚠️ Itt SOSEM írunk 0-t: pontosan ez a most javított hiba természete.
      nemFutottLe.push({ mi: 'kiküldésre váró frissítések', miert: f.error, fajta: 'hiba' })
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
        pulzus.push({
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

  const adat: AttekintesAdat = {
    mertAt: new Date(most).toISOString(),
    gyorsitotarbol: false,
    riadok: riadokSorrendben(vegso),
    pulzus,
    idovonal,
    uzenetek,
    egyhazmegyek,
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
