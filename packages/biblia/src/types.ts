/**
 * @kartoteka/biblia — közös típusok.
 *
 * VERS-AZONOSÍTÓ FORMÁTUM (expandToVerseIds / coverage):
 *   'KÖNYVKÓD.fejezet.vers'  — pl. 'GEN.1.1', 'JHN.3.16'
 * Ember által olvasható, stabil (a karoli.json kulcsaival azonos könyvkód),
 * és string-halmazként (Set<string>) olcsón kezelhető — a lefedettség-számítás
 * DB-ben tárolt azonosítói is ezt a formát használják.
 */

/**
 * Egy igehely-hivatkozás egy összefüggő szakasza.
 *
 * Null-szemantika:
 *   - startChapter === null  → a TELJES KÖNYV (csak könyv-hivatkozás, pl. 'Máté');
 *     ilyenkor a többi mező is null.
 *   - startVerse === null    → a fejezet(ek) egésze, vers-megkötés nélkül
 *     ('Mt 5' → 5. fejezet; 'Mt 5-7' → 5–7. fejezet).
 *   - endVerse === null vers-kezdet mellett → a záró fejezet végéig.
 */
export interface IgehelySzegmens {
  /** Kanonikus könyvkód (pl. 'GEN', 'JHN'). */
  book: string
  startChapter: number | null
  startVerse: number | null
  endChapter: number | null
  endVerse: number | null
  /** Betűs vers-utótag ('Jn 3,16b' → 'b') — az értelmezésben nem számít, a formázás megőrzi. */
  startVerseSuffix?: string
  endVerseSuffix?: string
}

export type IgehelyHibaKod =
  /** Üres vagy csak whitespace bemenet. */
  | 'ures'
  /** A könyvnév nem azonosítható. */
  | 'ismeretlen-konyv'
  /** A könyv utáni fejezet/vers rész nem értelmezhető. */
  | 'ertelmezhetetlen'

export interface IgehelyHiba {
  code: IgehelyHibaKod
  /** Magyar, felhasználónak mutatható üzenet. */
  message: string
  /** Az eredeti bemenet. */
  raw: string
}

export type ParseReferenceResult =
  | {
      ok: true
      /** A feloldott könyv (mindegyik szegmens ugyanarra a könyvre mutat). */
      book: { code: string; canonical: string; abbrev: string }
      segments: IgehelySzegmens[]
      raw: string
    }
  | { ok: false; error: IgehelyHiba }

/** A beépített versszám-katalógus alakja (packages/biblia/src/data/verse-counts.json). */
export interface VerseCounts {
  /** Könyvkódok kanonikus sorrendben. */
  order: string[]
  /** Könyvkód → fejezetenkénti versszám (index 0 = 1. fejezet). */
  counts: Record<string, number[]>
}

export interface ValidationResult {
  valid: boolean
  /** Magyar hibaleírások — üres, ha valid. */
  problemak: string[]
}

export interface CoverageResult {
  /** A teljes Károli-korpusz versszáma (31126). */
  osszes: number
  /** Az egyedi, létező érintett versek száma. */
  erintett: number
  /** Százalék két tizedesre kerekítve. */
  szazalek: number
}
