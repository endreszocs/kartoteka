/**
 * Szállítói számla adatalap (7. pont B szelet) — típusok.
 *
 * Sima lib (NEM 'use server') — a Next.js 16 alatt a 'use server' fájl CSAK
 * async function-t exportálhat, ezért a típusok/konstansok itt élnek, és a
 * szamla-actions.ts + a (C szeletben épülő) UI innen importál.
 *
 * DB-kontraktus: migration-docs/sql/2026-08-15-szallitoi-szamlak.sql
 */

// ─────────────────────────────────────────────────────────────────
// A szallitoi_szamla tábla egy sora
// ─────────────────────────────────────────────────────────────────

export interface SzallitoiSzamla {
  id: string
  congregation_id: string
  /** ANAF SPV egyedi azonosító (cbc:UUID, ennek híján a fájlnévből) — a duplikátum-védelem kulcsa. */
  anaf_uuid: string
  /** 'szamla' = Invoice, 'jovairo' = CreditNote (az összeg mindkettőnél pozitívan tárolt). */
  tipus: 'szamla' | 'jovairo'
  szallito_nev: string | null
  szallito_cui: string | null
  szamla_szam: string | null
  kiallitas_datum: string | null
  fizetesi_hatarido: string | null
  /** Bruttó végösszeg (PayableAmount). */
  osszeg: number
  /** ISO 4217 (RON / EUR / ...). */
  penznem: string
  kifizetve: boolean
  kifizetve_at: string | null
  /** A dokumentumtár-beli e-Factura XML (a hiteles bizonylat). */
  xml_dokumentum_id: string | null
  /** A dokumentumtár-beli számla-PDF (ha volt a ZIP-ben). */
  pdf_dokumentum_id: string | null
  megjegyzes: string | null
  created_by_profile_id: string | null
  created_at: string
}

// ─────────────────────────────────────────────────────────────────
// Számla ↔ kiadás kapcsolat (egy számla TÖBB kiadáshoz, összeg-résszel)
// ─────────────────────────────────────────────────────────────────

/** Egy számla könyvelési párja a köteg-lekérdezésben (2026-08-28, UX-kör). */
export interface SzamlaParositasBejegyzes {
  kiadasId: number
  datum: string | null
  osszeg: number
  /** null = kassza; szám = bankszámla-id. */
  bankszamlaId: number | null
  /** A bank neve (kasszánál null). */
  bankNev: string | null
  /**
   * 2026-09-03 (átvilágítás P1): HALOTT KAPCSOLAT — a kapcsolt kiadást azóta
   * törölték vagy sztornózták. A sort SZÁNDÉKOSAN nem rejtjük el: a felület
   * pirosan jelzi, hogy bontani kell. (Az elrejtés azzal járna, hogy a számla
   * csendben „kifizetve" marad, és a lelkész sosem tudná meg, miért.)
   */
  ervenytelen: boolean
}

export interface SzamlaKiadasKapcsolat {
  id: string
  szamla_id: string
  kiadas_id: number
  congregation_id: string
  /** A számla összegéből ehhez a kiadáshoz tartozó rész. */
  osszeg_resz: number
  created_by_profile_id: string | null
  created_at: string
  /** PostgREST-embed a kiadas FK-n át (listSzamlaKiadasKapcsolatok tölti). */
  kiadas?: {
    id: number
    datum: string
    osszeg: number
    nyugta: string
    iratszam: string
    atvevo: string | null
  } | null
}

// ─────────────────────────────────────────────────────────────────
// Lista-bemenet + ZIP-feldolgozás összegzése
// ─────────────────────────────────────────────────────────────────

export interface SzallitoiSzamlaListaInput {
  /** true = csak kifizetett, false = csak kifizetetlen, null/undefined = mind. */
  kifizetve?: boolean | null
  /** Szállítónév- vagy számlaszám-részlet. */
  kereses?: string | null
  /** 1-től számozott oldal. */
  oldal?: number
  oldalMeret?: number
  /** Kiállítás dátuma szerint: 'desc' (alap, legújabb elöl) vagy 'asc'. */
  irany?: 'asc' | 'desc'
}

export interface UjSzamlaOsszefoglalo {
  fajlnev: string
  szamlaSzam: string | null
  szallitoNev: string | null
  osszeg: number
  penznem: string
  /** Volt-e a ZIP-ben hozzá párosított PDF is. */
  pdfCsatolva: boolean
}

export interface SzamlaDuplikatumJelzes {
  fajlnev: string
  anafUuid: string
  szamlaSzam: string | null
  /**
   * true = a korábbi sorhoz hiányzott a fájl-hivatkozás, és ez a futás
   * pótolta (ön-gyógyító újrafeldolgozás) — nem jött létre új sor.
   */
  fajlPotolva: boolean
  /**
   * 2026-09-04: a találat a RÉGI (2026-09-04 előtti, első-futam) kulccsal
   * rögzített sor. Nem hiba — de a lelkész lássa, hogy a fájl azonosítója
   * azóta pontosabb lett, és a régi sor a régi kulcsán marad.
   */
  regiKulcs?: boolean
}

/** A feldolgozSzamlaZipDokumentum action összegzése — a UI ezt mutatja meg. */
export interface SzamlaFeldolgozasEredmeny {
  ujSzamlak: UjSzamlaOsszefoglalo[]
  /** Már korábban rögzített számlák (ugyanaz a ZIP kétszer = nem duplikál, hanem jelez). */
  duplikatumok: SzamlaDuplikatumJelzes[]
  /** Kihagyott bejegyzések magyar indoklással (aláírás-XML, árva PDF, idegen típus…). */
  kihagyott: string[]
  /** Hangos hibák (parse-hiba, feltöltési hiba…) — sosem nyeljük el őket. */
  hibak: string[]
}
