/**
 * A MENTÉS-RENDSZER KORA — TISZTA FÜGGVÉNYEK (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT EZ A FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-08-11-én a napi mentés ELŐSZÖR futott végig: mind a 784 hatókörnek lett
 * ellenőrzött mentése, 22:16-kor. A lap tetején mégis piros vész állt:
 *
 *   „TEGNAP (2026. 08. 10.) 784 hatókörnek NEM készült ellenőrzött mentése."
 *
 * Tegnap a mentés-rendszer MÉG NEM LÉTEZETT. Az őrszem olyan napot kért
 * számon, amelyiken nem volt mit számonkérni — és ezzel pontosan azon a napon
 * vált hiteltelenné, amelyiken először mondhatott volna jó hírt.
 *
 * A motor saját futás-riportja HELYESEN fogalmazott („HA EZ NEM AZ ELSŐ FUTÁS,
 * akkor a mentés napok óta nem működik"), csak épp nem tudta eldönteni, első
 * futás-e. Ez a fájl azt a bizonytalanságot SZÜNTETI MEG — nem lemásolja.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ A KIVÉTEL NEM VÁLHAT ÖRÖKÖS ELNÉMÍTÁSSÁ
 * ════════════════════════════════════════════════════════════════════════════
 * A „bejáratás" NEM fix napszám és NEM kapcsoló: a TELEPÍTÉS NAPJÁHOZ van
 * kötve, és MAGÁTÓL LEJÁR.
 *
 *   · a telepítés napja ELŐTTI nap        → 'elotte'    (nincs mit számonkérni)
 *   · MAGA a telepítés napja              → 'bejaratas' (a hajnali cron már
 *                                            elment, mire telepítettünk)
 *   · a telepítés napja UTÁNI MINDEN nap  → 'eles'      (teljes szigor)
 *
 * KONKRÉTAN: 2026-08-11-i telepítésnél 2026-08-12-én reggel a sáv még
 * elnézően fogalmaz (tegnap = 08-11 = a telepítés napja), 2026-08-13-tól
 * viszont a 08-12-i napot MÁR TELJES SZIGORRAL kéri számon. Ha a mentés
 * tényleg leáll, a vész 2026-08-13-án megszólal.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIBŐL DŐL EL A TELEPÍTÉS NAPJA — ÉS MIÉRT A LEGKORÁBBI NYER
 * ════════════════════════════════════════════════════════════════════════════
 * Három, egymástól független nyom van rá:
 *   1) a `backup_log` LEGKORÁBBI sorának `run_date`-je,
 *   2) `backup_settings.drive_connected_at`,
 *   3) `backup_settings.passphrase_set_at`.
 *
 * A telepítés napja a HÁROM KÖZÜL A LEGKORÁBBI. Ez szándékos, és ez a fájl
 * legfontosabb biztonsági döntése:
 *
 *   ⚠️ A `drive_connected_at` ÚJRA-összekötéskor FELÜLÍRÓDIK (settings.ts →
 *      `saveDriveConnection`). Ha ez ÖNMAGÁBAN döntene, akkor egy fél év múlvai
 *      Drive-újracsatlakozás VISSZAÁLLÍTANÁ a bejáratást — vagyis egy ártatlan
 *      karbantartó mozdulat elnémítaná az őrszemet pont akkor, amikor a mentés
 *      esetleg tényleg áll. A legkorábbi nyom viszont csak REGRESSZÁLHAT
 *      (a napló legkorábbi sora idővel nem lesz újabb), tehát a bejáratási
 *      ablak SOHA nem nyílhat ki újra.
 *
 * Ha EGYIK nyom sincs meg (`telepitesNap === null`), a válasz 'eles' —
 * fail-loud. „Nem tudom, mikor telepítettük" SOHA nem lehet indok a hallgatásra.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ EZ A MODUL SZÁNDÉKOSAN DIREKTÍVA- ÉS FUTÁSIDEJŰ IMPORT-MENTES
 * ════════════════════════════════════════════════════════════════════════════
 * Nincs rajta `server-only` és `use client` sem, és CSAK `import type`-ot
 * használ. Két oka van:
 *   · a döntést a SZERVER (sáv, motor) és a BÖNGÉSZŐ (áttekintő kártya) is
 *     ugyanabból a forrásból olvassa — két másolat előbb-utóbb széthúzna,
 *     és pontosan ez a projekt visszatérő hibaosztálya;
 *   · így a `scripts/selftest-backup.mjs` önállóan le tudja fordítani és
 *     állításokkal ellenőrizni (a sáv-döntés és a lejárat TESZTELHETŐ).
 */

import type { BackupHealth, DailyCoverage } from '@/lib/google-drive/types'

// ─────────────────────────────────────────────────────────────────────────────
// Naptári segédek — `YYYY-MM-DD` alakon, DST-függetlenül
// ─────────────────────────────────────────────────────────────────────────────

/** Naptári eltolás `YYYY-MM-DD` alakon (nincs benne óra, tehát DST sem érinti). */
export function napEltol(nap: string, napokkal: number): string {
  const [y, m, d] = nap.split('-').map((s) => Number(s))
  const t = Date.UTC(y, (m ?? 1) - 1, d ?? 1) + napokkal * 86_400_000
  const dt = new Date(t)
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}

/** `2026-08-11` → `2026. 08. 11.` */
export function huNap(nap: string): string {
  if (!nap) return '—'
  const [y, m, d] = nap.split('-')
  return `${y}. ${m}. ${d}.`
}

// ─────────────────────────────────────────────────────────────────────────────
// A RENDSZER SZÜLETÉSNAPJA
// ─────────────────────────────────────────────────────────────────────────────

/** Melyik nyomból derült ki a telepítés napja — a felület KIÍRJA (nincs varázslat). */
export type SzuletesForras =
  | 'naplo' // a `backup_log` legkorábbi sora
  | 'drive-osszekotes' // `backup_settings.drive_connected_at`
  | 'mentesi-jelszo' // `backup_settings.passphrase_set_at`
  | 'ismeretlen' // egyik nyom sincs meg → fail-loud, teljes szigor

export interface MentesSzuletes {
  /**
   * A LEGKORÁBBI nap, amelyen a mentés-rendszer BIZONYÍTHATÓAN létezett
   * (Europe/Bucharest helyi nap, `YYYY-MM-DD`). `null` = nincs rá nyom.
   */
  telepitesNap: string | null
  /**
   * Az ELSŐ nap, amelyet a rendszer TELJES SZIGORRAL számonkér.
   * Ez a bejáratási kivétel LEJÁRATA — nem elrejtett napszám, hanem kiírható
   * dátum, amit a felület meg is mutat a tulajdonosnak.
   */
  elsoSzamonkertNap: string | null
  /**
   * ⚠️ 2026-08-11 — A SÁV LEJÁRATA. Az a nap, amelyiken a felső figyelmeztető
   * sáv ELŐSZÖR kéri számon teljes szigorral az ELŐZŐ napot, vagyis
   * `elsoSzamonkertNap + 1`.
   *
   * MIÉRT KÜLÖN MEZŐ, ÉS MIÉRT NEM SZÁMOLJA KI MINDENKI MAGÁNAK. A két felület
   * (a sáv és az áttekintő kártya) UGYANARRÓL a szabályról KÉT DÁTUMOT mondott:
   * a sáv „2026. 08. 13.-tól ez már hibának számít", a kártya ugyanakkor
   * „2026. 08. 12.-tól viszont minden hiányzó előző nap hibának számít". A
   * kártya az `elsoSzamonkertNap`-ot (a SZÁMONKÉRT napot) összemosta a
   * SZÁMONKÉRÉS napjával. Egy másolat mindig széthúz — ezért itt lakik.
   */
  elsoSzigoruSavNap: string | null
  forras: SzuletesForras
  /**
   * ⚠️ FALSE = NYOM-BIZONYTALANSÁG: a `backup_log` legkorábbi sorát NEM tudtuk
   * kiolvasni (RLS-változás, időtúllépés, séma-eltérés). Ilyenkor a születés
   * SOHA nem eshet vissza a `drive_connected_at` / `passphrase_set_at`
   * időbélyegekre, mert AZOK FELÜLÍRÓDNAK (újra-összekötés, jelszócsere) —
   * vagyis egy néma napló-hiba kinyithatná a bejáratási ablakot fél évvel
   * később is. Bizonytalanságnál teljes szigor.
   */
  naploOlvashato: boolean
}

export const ISMERETLEN_SZULETES: MentesSzuletes = {
  telepitesNap: null,
  elsoSzamonkertNap: null,
  elsoSzigoruSavNap: null,
  forras: 'ismeretlen',
  naploOlvashato: true,
}

/**
 * A NAPLÓ NEM VOLT OLVASHATÓ. Ugyanúgy 'eles' (teljes szigor), mint a
 * `ISMERETLEN_SZULETES` — de a `naploOlvashato: false` megkülönbözteti a
 * „megnéztük, és nincs nyom" esettől a „meg sem tudtuk nézni" esetet.
 */
export const NAPLO_OLVASHATATLAN_SZULETES: MentesSzuletes = {
  ...ISMERETLEN_SZULETES,
  naploOlvashato: false,
}

/**
 * A három nyomból a LEGKORÁBBI nyer (lásd a fájl fejlécét: az újra-összekötés
 * nem nyithatja ki újra a bejáratási ablakot).
 *
 * A bemenetek NAPOK, nem időbélyegek: a zóna-átváltás (Europe/Bucharest) a
 * hívó dolga (`bukarestiNapKulcs`), így ez a függvény tiszta és tesztelhető marad.
 *
 * ⚠️ `naploOlvashato: false` esetén a függvény AZONNAL a teljes szigorra fut, és
 *    a másik két nyomot MEG SEM NÉZI. Lásd a `MentesSzuletes.naploOlvashato`
 *    magyarázatát: azok a nyomok előre tudnak mozogni, a napló nem.
 */
export function szuletesbol(input: {
  elsoNaploNap: string | null
  driveOsszekotveNap: string | null
  jelszoBeallitvaNap: string | null
  /** Alap: `true`. `false` = a napló-lekérdezés HIBÁZOTT (nem: üres volt). */
  naploOlvashato?: boolean
}): MentesSzuletes {
  if (input.naploOlvashato === false) return NAPLO_OLVASHATATLAN_SZULETES

  const jeloltek: Array<{ nap: string; forras: SzuletesForras }> = []
  if (input.elsoNaploNap) jeloltek.push({ nap: input.elsoNaploNap, forras: 'naplo' })
  if (input.driveOsszekotveNap) {
    jeloltek.push({ nap: input.driveOsszekotveNap, forras: 'drive-osszekotes' })
  }
  if (input.jelszoBeallitvaNap) {
    jeloltek.push({ nap: input.jelszoBeallitvaNap, forras: 'mentesi-jelszo' })
  }
  if (jeloltek.length === 0) return ISMERETLEN_SZULETES

  let legkorabbi = jeloltek[0]
  for (const j of jeloltek) {
    if (j.nap < legkorabbi.nap) legkorabbi = j
  }
  const elsoSzamonkertNap = napEltol(legkorabbi.nap, 1)
  return {
    telepitesNap: legkorabbi.nap,
    elsoSzamonkertNap,
    // A SÁV egy nappal később szólal meg teljes szigorral: az `elsoSzamonkertNap`
    // a számonkért NAP, a sáv viszont mindig a TEGNAPOT nézi.
    elsoSzigoruSavNap: napEltol(elsoSzamonkertNap, 1),
    forras: legkorabbi.forras,
    naploOlvashato: true,
  }
}

/** Egy nap viszonya a rendszer korához. */
export type NapEletkor =
  | 'elotte' // a rendszer ekkor MÉG NEM LÉTEZETT — nincs mit számonkérni
  | 'bejaratas' // a telepítés napja — a hajnali cron már elment, mire telepítettünk
  | 'eles' // teljes szigor

export function napEletkora(nap: string, szuletes: MentesSzuletes): NapEletkor {
  // ⚠️ FAIL-LOUD. Ha nincs egyetlen nyom sem, NEM hallgatunk el: teljes szigor.
  if (!szuletes.telepitesNap || !szuletes.elsoSzamonkertNap) return 'eles'
  if (nap < szuletes.telepitesNap) return 'elotte'
  if (nap < szuletes.elsoSzamonkertNap) return 'bejaratas'
  return 'eles'
}

// ─────────────────────────────────────────────────────────────────────────────
// A FIGYELMEZTETŐ SÁV DÖNTÉSE — EGY HELYEN, TISZTA FÜGGVÉNYBEN
// ─────────────────────────────────────────────────────────────────────────────

export interface SavBemenet {
  /** Az időbélyeg-alapú alap-állapot (`computeBackupHealth`). */
  alap: BackupHealth
  tegnap: DailyCoverage
  ma: DailyCoverage
  szuletes: MentesSzuletes
}

/** Hány hatókörrel van baj egy napon (hiányzó + hibás + befejezetlen). */
export function bajosDarab(cov: DailyCoverage): number {
  return cov.hianyzik + cov.hibas + cov.befejezetlen
}

function maiAllas(ma: DailyCoverage): string {
  if (ma.varhato === 0) return 'Ma nincs olyan hatókör, amire mentést várnánk.'
  if (ma.igazolt >= ma.varhato) {
    return `Ma mind a(z) ${ma.varhato} hatókörnek van ellenőrzött mentése.`
  }
  return `Ma eddig ${ma.igazolt}/${ma.varhato} hatókörnek van ellenőrzött mentése.`
}

/**
 * A SÁV ÁLLAPOTA ÉS MONDATA.
 *
 * ─── A SORREND, ÉS MIÉRT ÉPP EZ ────────────────────────────────────────────
 *  1) Amit az időbélyeg-ág már kimondott (nincs telepítve / SOHA nem volt
 *     igazolt mentés), azt NEM írjuk felül: az erősebb és pontosabb igazság.
 *  2) A rendszer SZÜLETÉSE ELŐTTI napot nem kérjük számon — de a MAI állást
 *     akkor is kimondjuk, mert az az egyetlen, ami akkor számít.
 *  3) Ha tegnap minden rendben volt, marad az alap-állapot.
 *  4) BEJÁRATÁS: tájékoztató hangnem, SOHA nem 'kritikus'.
 *  5) ÉLES: a régi, szigorú mondat — DE mostantól a MAI állást is kimondja.
 *     Egy őrszem, ami elhallgatja a jó hírt, ugyanúgy félrevezet, mint amelyik
 *     elhallgatja a rosszat.
 */
export function savDontes(be: SavBemenet): BackupHealth {
  const { alap, tegnap, ma, szuletes } = be

  // 1) Az erősebb igazságot nem írjuk felül.
  if (alap.allapot === 'sql_hianyzik' || alap.allapot === 'nincs_mentes') return alap

  const kor = napEletkora(tegnap.nap, szuletes)

  // 2) A SZÜLETÉS ELŐTTI NAP — nincs mit számonkérni.
  if (kor === 'elotte') {
    const teljes = ma.varhato > 0 && ma.igazolt >= ma.varhato
    return {
      ...alap,
      // Teljes mai lefedettségnél a sáv EL IS TŰNIK (a `friss` állapotot a
      // `backup-stale-banner` nem rajzolja ki) — a jó hír nem sáv-anyag.
      allapot: teljes ? 'friss' : 'elavult',
      mondat:
        `A napi biztonsági mentés ${huNap(szuletes.telepitesNap ?? ma.nap)}-én indult el, ` +
        `tegnap (${huNap(tegnap.nap)}) még nem működött — arra a napra nincs mit számonkérni. ` +
        `${maiAllas(ma)} ` +
        (szuletes.elsoSzamonkertNap
          ? `${huNap(szuletes.elsoSzamonkertNap)}-tól a rendszer minden nap ellenőrzi az előző napit.`
          : 'Holnaptól a rendszer minden nap ellenőrzi az előző napit.'),
    }
  }

  const bajos = bajosDarab(tegnap)

  // 3) Tegnap minden hatókör igazolt volt → az alap-állapot marad (az időbélyeg
  //    „elavult/kritikus" jelzését SEM írjuk felül: ha az utolsó igazolt mentés
  //    mégis régi, az továbbra is baj).
  if (bajos === 0 || tegnap.varhato === 0) return alap

  const nevek = tegnap.problemasNevek.slice(0, 5).join(', ')
  // ⚠️ A TELJES darabszámból számolunk, nem a max. 20-ra csonkolt névlistából.
  //    Korábban a sáv egyetlen mondaton belül mondott ellent önmagának:
  //    „784 hatókörnek NEM készült … : 5 név és még 15."
  const tobb = tegnap.problemasOsszesen > 5 ? ` és még ${tegnap.problemasOsszesen - 5}` : ''

  // 4) BEJÁRATÁS — tájékoztatás, nem vész.
  if (kor === 'bejaratas') {
    const teljes = ma.varhato > 0 && ma.igazolt >= ma.varhato
    return {
      ...alap,
      allapot: teljes ? 'friss' : 'elavult',
      mondat:
        `Ez a mentés-rendszer bejáratási időszaka: ${huNap(szuletes.telepitesNap ?? tegnap.nap)}-én ` +
        `indult el, ezért a tegnapi nap (${huNap(tegnap.nap)}) még hiányos — ${bajos} hatókörnek ` +
        `nincs róla ellenőrzött mentése. ${maiAllas(ma)} ` +
        // ⚠️ EGY FORRÁS. A dátum a `MentesSzuletes.elsoSzigoruSavNap`-ból jön,
        //    NEM helyben számolva — az áttekintő kártya ugyanezt a mezőt írja ki.
        //    Korábban a kártya saját számítása egy nappal korábbit mondott.
        (szuletes.elsoSzigoruSavNap
          ? `${huNap(szuletes.elsoSzigoruSavNap)}-tól ez már hibának számít.`
          : ''),
    }
  }

  // 5) ÉLES — a szigorú mondat, a mai állással együtt.
  return {
    ...alap,
    // A hiány MÉRTÉKE dönt: ha minden hatókör kimaradt, az nem „elavult",
    // hanem a mentés-rendszer leállása.
    allapot: bajos >= tegnap.varhato ? 'kritikus' : 'elavult',
    mondat:
      `TEGNAP (${huNap(tegnap.nap)}) ${bajos} hatókörnek NEM készült ellenőrzött mentése ` +
      `(${tegnap.igazolt}/${tegnap.varhato} kész)` +
      (nevek ? `: ${nevek}${tobb}.` : '.') +
      ` ${maiAllas(ma)}`,
  }
}
