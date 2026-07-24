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
  /** congregations.name (hivatalos név) — üresnél nev_hu fallback.
   *  Nyelvfüggetlen tartalék, ha a nyelv-specifikus név hiányzik. */
  hivatalosNev: string
  /** congregations.nev_hu — a magyar név (üresnél null, fallback: hivatalosNev). */
  nevHu: string | null
  /** congregations.nev_ro — a román név (üresnél null, fallback: hivatalosNev). */
  nevRo: string | null
  /** congregations.nev_en — az angol név (üresnél null, fallback: hivatalosNev). */
  nevEn: string | null
  /** Összerakott postai cím (magyar/rögzített változat):
   *  „irányítószám város, utca házszám". */
  cimHu: string | null
  /** Román cím-változat. A congregations strukturált cím-mezői (varos, cim,
   *  iranyitoszam, hazszam) EGYETLEN — jellemzően magyar — változatot tárolnak;
   *  a román helység-/utcanév az adrlocality.name_ro / adrstreet.name_ro
   *  oszlopokban élne (adrlocality_id/adrstreet_id join), ami a verifikált
   *  congregations-oszlopokon kívül esik → jelenleg mindig null, és a fejléc
   *  ilyenkor EGY közös cím-sort ír (follow-up: adrlocality-join). */
  cimRo: string | null
  telefon: string | null
  email: string | null
  /** congregations.adoszam (CIF). */
  cif: string | null
  web: string | null
  /** congregations.cimer_url — a fejléc-címer (logó) képe. */
  cimerUrl: string | null
}

/** A többnyelvű fejléc nyelvei. */
export type LetterheadLang = 'hu' | 'ro' | 'en'
