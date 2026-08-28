/**
 * HASONLÓ (esetleg duplikált) TÉTEL — a párosítás TISZTA magja.
 *
 * Endre 8. kérése (2026-08-27), szó szerint: „A banki import után ha valaki pont
 * abban az összegben, pont azon a cégnévvel (itt a kb. egyezés is elég) és kb.
 * ugyanazon a napon (±3 nap) akarja bevezetni, akkor jelezze a rendszer, hogy egy
 * hasonló tételt már rögzítettünk a banki résznél — mindenképpen folytatni akarja?"
 *
 * ── MIÉRT ITT, A CORE-BAN ─────────────────────────────────────────────────
 * A figyelmeztetés a WEBEN és a DESKTOPON is fut. Ha a küszöbök vagy a párosítás
 * két példányban élnének, a két felület előbb-utóbb MÁST tekintene „kb. ugyanaz"-nak.
 * Ez a repóban már megégett hibaosztály. Ezért: az adat-lekérdezés felületenként
 * külön (a web serveraction, a desktop a saját Supabase-kliensével), de a DÖNTÉS
 * innen jön — egyetlen helyről.
 *
 * A modul SZÁNDÉKOSAN import-mentes (a `nameSimilarity`-n kívül): nincs benne
 * Supabase, nincs React, így mindkét oldalon és a selftestben is futtatható.
 */

import { nameSimilarity } from './jaro-winkler'

/** ±3 nap — Endre kérése szerint. */
export const HASONLO_NAP_ABLAK = 3

/**
 * Ennél nagyobb névhasonlóságnál tekintjük „kb. ugyanaz"-nak.
 *
 * A jaro-winkler.ts fejlécében rögzített kalibráció szerint 0.88 fölött van a
 * „biztos egyezés" sáv, 0.88 alatt a „nem egyezés". Itt SZÁNDÉKOSAN lejjebb,
 * 0.82-re megyünk: ez FIGYELMEZTETÉS, nem automatikus összevonás — a téves
 * riasztás ára egy kattintás, a kimaradt riasztásé egy duplán könyvelt tétel.
 */
export const HASONLO_NEV_KUSZOB = 0.82

/** Egy ellenőrzendő sor (a rögzítő küldi mentés előtt). */
export interface HasonloTetelKerdes {
  /** A rögzítő sorának azonosítója — a válasz ehhez rendelődik. */
  rowId: string
  type: 'income' | 'expense'
  /** ISO dátum (YYYY-MM-DD). */
  datum: string
  /** Összeg RON-ban (a rögzítő mindig lejt ír). */
  osszeg: number
  /** Partner neve (bevételnél a befizető, kiadásnál az átvevő). */
  nev: string
}

/** Egy már könyvelt, banki eredetű tétel — a lekérdező felület adja. */
export interface HasonloTetelMeglevo {
  datum: string
  osszeg: number
  nev: string
  iratszam: string | null
}

/** Egy megtalált, hasonló banki tétel. */
export interface HasonloTetelTalalat {
  rowId: string
  /** A meglévő tétel adatai — hogy a lelkész felismerje. */
  datum: string
  osszeg: number
  nev: string
  iratszam: string | null
  /** Névhasonlóság 0..1 (1 = azonos). */
  hasonlosag: number
  /** Hány nap eltérés a rögzíteni kívánt dátumtól. */
  napEltres: number
}

/** Két ISO dátum közti eltérés napokban (érvénytelen dátumnál +∞ → sosem talál). */
export function hasonloNapEltres(a: string, b: string): number {
  const ta = Date.parse((a || '').slice(0, 10))
  const tb = Date.parse((b || '').slice(0, 10))
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY
  return Math.round(Math.abs(ta - tb) / 86_400_000)
}

/** ISO dátum ± n nap — a lekérdezés dátum-ablakához. */
export function hasonloIsoNap(d: string, elt: number): string {
  const t = Date.parse((d || '').slice(0, 10))
  if (Number.isNaN(t)) return d
  return new Date(t + elt * 86_400_000).toISOString().slice(0, 10)
}

/**
 * A rögzíteni kívánt sorokhoz megkeresi a legjobb hasonló, MÁR KÖNYVELT tételt.
 *
 * Soronként legfeljebb EGY találatot ad vissza (a legjobbat): a lelkésznek egy
 * konkrét gyanút mutatunk, nem egy listát, amiben elveszik.
 */
export function hasonloTetelekKeresese(
  kerdesek: HasonloTetelKerdes[],
  meglevoBev: HasonloTetelMeglevo[],
  meglevoKia: HasonloTetelMeglevo[],
): HasonloTetelTalalat[] {
  const talalatok: HasonloTetelTalalat[] = []
  for (const s of kerdesek) {
    // Dátum vagy összeg nélkül nincs mit összevetni — ilyet a rögzítő úgyis elutasít.
    if (!s.datum || !Number.isFinite(s.osszeg) || s.osszeg <= 0) continue
    const halmaz = s.type === 'income' ? meglevoBev : meglevoKia
    let legjobb: HasonloTetelTalalat | null = null
    for (const m of halmaz) {
      // „pont abban az összegben" — a 0.01 csak a lebegőpontos ábrázolás miatt van.
      if (Math.abs(m.osszeg - s.osszeg) > 0.01) continue
      const nap = hasonloNapEltres(m.datum, s.datum)
      if (nap > HASONLO_NAP_ABLAK) continue
      // A név „kb. egyezése". Ha BÁRMELYIK oldalon üres a név, az összeg + a
      // néhány napos dátumközelség önmagában is elég erős jelzés — a banki
      // importban a partnernév gyakran hiányzik, és épp ott a legnagyobb a
      // duplázás kockázata.
      const hasonlosag = s.nev.trim() && m.nev.trim() ? nameSimilarity(s.nev, m.nev) : 1
      if (hasonlosag < HASONLO_NEV_KUSZOB) continue
      const jelolt: HasonloTetelTalalat = {
        rowId: s.rowId,
        datum: m.datum,
        osszeg: m.osszeg,
        nev: m.nev,
        iratszam: m.iratszam,
        hasonlosag,
        napEltres: nap,
      }
      // A legjobb = legnagyobb névhasonlóság, azon belül a legkisebb dátumeltérés.
      if (
        !legjobb ||
        jelolt.hasonlosag > legjobb.hasonlosag ||
        (jelolt.hasonlosag === legjobb.hasonlosag && jelolt.napEltres < legjobb.napEltres)
      ) {
        legjobb = jelolt
      }
    }
    if (legjobb) talalatok.push(legjobb)
  }
  return talalatok
}

/**
 * A lekérdezés dátum-ablaka a kérdezett sorokból (min−3 … max+3).
 *
 * MIÉRT EGY ABLAK, ÉS NEM SORONKÉNTI LEKÉRDEZÉS: 100 tételes rögzítésnél 100
 * szerver-hívás járhatatlan. Azonosító-listás `.in()` szűrőt sem használunk: sok
 * azonosítónál az URL-hossz miatt 414-et kapnánk — ez nálunk már megégett.
 *
 * ⚠️ MIÉRT VAN KIZÁRÓ FELSŐ HATÁR (`igExkl`) — MÉRT SÉMA-TÉNY, nem óvatoskodás:
 *   `befizetes.datum` típusa **date**, de `kiadas.datum` típusa
 *   **timestamp without time zone** (Database_schema.sql).
 *   Egy `datum <= '2026-03-23'` szűrő a kiadás-táblán ezért `2026-03-23 00:00:00`-t
 *   jelent: a +3. nap délelőttjén rögzített kiadás NÉMÁN kimaradna az ablakból —
 *   pont a határon, ahol a legvalószínűbb a duplázás. A `datum < '2026-03-24'`
 *   alak mindkét típuson helyes (date-en betűre ugyanaz).
 */
export function hasonloDatumAblak(
  kerdesek: HasonloTetelKerdes[],
): { tol: string; ig: string; igExkl: string } | null {
  const datumok = kerdesek.map((s) => s.datum).filter(Boolean).sort()
  if (!datumok.length) return null
  const ig = hasonloIsoNap(datumok[datumok.length - 1], HASONLO_NAP_ABLAK)
  return {
    tol: hasonloIsoNap(datumok[0], -HASONLO_NAP_ABLAK),
    ig,
    /** Kizáró felső határ (`< igExkl`) — lásd a fenti séma-indoklást. */
    igExkl: hasonloIsoNap(ig, 1),
  }
}
