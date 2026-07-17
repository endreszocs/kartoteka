/**
 * Iktató F6 — igazolás-kiállítás típusok (KONTRAKTUS B).
 *
 * A személy/anyakönyv-adat API (szemely-actions.ts) és a fejléc-építő
 * (letterheads.ts) közös típusai. Külön fájlban, mert a `'use server'`
 * modul NEM exportálhat típust/konstanst (Next.js 16 runtime-szabály).
 */

/** Egy kiválasztott személy igazolás-kitöltéshez szükséges anyakönyvi adatai. */
export interface PersonCertData {
  id: number
  /** Családnév + keresztnév (elhunytnál is a sima név, jelölés nélkül). */
  teljesNev: string
  /** ISO dátum (YYYY-MM-DD) vagy null. */
  szuletesiDatum: string | null
  apjaNeve: string | null
  anyjaNeve: string | null
  vallas: string | null
  /** keresztseg.datum, ennek híján konfirmalas.keresztelesideje. */
  keresztelesDatum: string | null
  keresztszulok: string | null
  /** keresztseg.helyid → adrlocality.name feloldva. */
  keresztelesHelye: string | null
  konfirmalasDatum: string | null
  /** A legutóbbi egyházi házasság dátuma (hazassag.datum). */
  hazassagDatum: string | null
  /** A házastárs teljes neve (a hazassag másik felének szemely-sorából). */
  hazastarsNev: string | null
  nem: 'ferfi' | 'no' | null
}

/** A személy-kereső (searchPersonsForCertificate) egy találata. */
export interface CertificatePersonHit {
  id: number
  /** Megjelenítendő név — elhunytnál " (†)" utótaggal. */
  nev: string
  szuletesiDatum: string | null
  anyjaNeve: string | null
}

/** A gyülekezet hivatalos fejléc-adatai (congregations tábla). */
export interface CongregationHeaderData {
  /** congregations.name (hivatalos név) — üresnél nev_hu fallback. */
  hivatalosNev: string
  /** Összerakott postai cím: irányítószám + város, utca + házszám. */
  cim: string | null
  telefon: string | null
  email: string | null
  /** congregations.adoszam (CIF). */
  cif: string | null
  web: string | null
  /** congregations.cimer_url — a fejléc-címer képe. */
  cimerUrl: string | null
}

/** A többnyelvű fejléc nyelvei. */
export type LetterheadLang = 'hu' | 'ro'
