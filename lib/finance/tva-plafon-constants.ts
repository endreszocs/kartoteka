/**
 * TVA (ÁFA) plafon figyelő — konstansok és típusok.
 *
 * Jogszabályi alap:
 * - OG nr. 22/2025: a TVA-alany plafon 300 000 → 395 000 RON (érvényes: 2025.09.01)
 * - Codul fiscal art. 310: a plafon-forgalom számítása naptári év alapján
 * - Art. 292 alin. (1) lit. k): cult religios mentesség (tagi kollektív érdek)
 * - Art. 292 alin. (2) lit. e): ingatlan-bérbeadás mentes, de SZÁMÍT a plafonba
 *
 * FONTOS: ha a jogszabály változik (plafon emelkedik/csökken), ezeket a
 * konstansokat kell frissíteni. A rendszer egyetlen helyen olvassa.
 */

/** A TVA-alany plafon: 395 000 RON 2025.09.01-től (OG 22/2025). */
export const TVA_PLAFON_RON = 395_000

/** Figyelmeztetés sárga szintje (a plafon 80%-ánál): 316 000 RON. */
export const TVA_FIGYELMEZTETES_SARGA_SZAZALEK = 0.80

/** Figyelmeztetés narancs szintje (a plafon 90%-ánál): 355 500 RON. */
export const TVA_FIGYELMEZTETES_NARANCS_SZAZALEK = 0.90

/** Figyelmeztetés piros szintje (túllépés): 395 000 RON és felette. */
export const TVA_FIGYELMEZTETES_PIROS_SZAZALEK = 1.00

/** Figyelmeztetési szintek — UI színek és üzenetek ezeket használják. */
export type TvaFigyelmeztetesSzint = 'nyugodt' | 'sarga' | 'narancs' | 'piros'

/** A 4 szint sorrendje (növekvő kockázat szerint). */
export const TVA_SZINT_SORREND: TvaFigyelmeztetesSzint[] = [
  'nyugodt',
  'sarga',
  'narancs',
  'piros',
]

/**
 * Egy beszámító tétel (szamadasicel kód) összesítője.
 * A UI ezt használja a kategóriánkénti bontás megjelenítéséhez.
 */
export interface TvaBeszamitoTetel {
  /** A szamadasicel.id, pl. '104.05' */
  szamadasicelKod: string
  /** A szamadasicel.nev (magyar név) */
  celNev: string
  /** Az adott évre és kódra összesített bevétel RON-ban */
  osszesen: number
  /** Ha van, a tva_mentesseg_hivatkozas szöveges jogi alap */
  jogszabalyiHivatkozas: string | null
}

/**
 * A TVA-plafon számítás eredménye egy adott gyülekezetre és évre.
 */
export interface TvaPlafonResult {
  /** Az év, amelyre számoltunk (naptári év, pl. 2026) */
  year: number

  /** A beszámító bevételek összege RON-ban */
  szamoltForgalomRon: number

  /** A hatályos plafon (jelenleg 395 000 RON) */
  tvaPlafonRon: number

  /** A forgalom százaléka a plafonhoz képest (0 - 150+) */
  szazalek: number

  /** A figyelmeztetés szintje */
  szint: TvaFigyelmeztetesSzint

  /** Kategóriánkénti bontás — a UI ezt jeleníti meg */
  beszamitoTetelek: TvaBeszamitoTetel[]

  /** A számítás időpontja (UI cache-hez) */
  utolsoFrissites: string

  /**
   * Ha TRUE, a gyülekezet már TVA-alany (congregations.tva_alany).
   * Ilyenkor a plafon-figyelő nem releváns — a UI más üzenetet mutat.
   */
  maris_tva_alany: boolean
}

/**
 * Meghatározza a figyelmeztetési szintet a százalék alapján.
 * - < 80%: nyugodt (még messze a küszöb)
 * - 80-89%: sarga (közeledik, érdemes beszélni a könyvelővel)
 * - 90-99%: narancs (sürgős, lépéseket kell tervezni)
 * - >= 100%: piros (túllépés — 10 napon belül a könyvelő benyújtja a 010-est)
 */
export function tvaFigyelmeztetesSzint(szazalek: number): TvaFigyelmeztetesSzint {
  if (szazalek >= TVA_FIGYELMEZTETES_PIROS_SZAZALEK * 100) return 'piros'
  if (szazalek >= TVA_FIGYELMEZTETES_NARANCS_SZAZALEK * 100) return 'narancs'
  if (szazalek >= TVA_FIGYELMEZTETES_SARGA_SZAZALEK * 100) return 'sarga'
  return 'nyugodt'
}

/**
 * Emberi szöveges üzenet a szinthez (a UI widgeten megjelenő rövid címke).
 */
export function tvaSzintLabel(szint: TvaFigyelmeztetesSzint): string {
  switch (szint) {
    case 'nyugodt':
      return 'Nyugodt'
    case 'sarga':
      return 'Figyelj!'
    case 'narancs':
      return 'Sürgős'
    case 'piros':
      return 'Túllépés'
  }
}

/**
 * Részletes magyarázat a szinthez (a widget tooltip / dialog).
 */
export function tvaSzintMagyarazat(szint: TvaFigyelmeztetesSzint): string {
  switch (szint) {
    case 'nyugodt':
      return 'A gazdasági forgalom még messze van a TVA-alany küszöbtől. Nincs tennivaló.'
    case 'sarga':
      return 'A gazdasági forgalom meghaladta a plafon 80%-át. Érdemes egyeztetned a könyvelővel a várható alakulásról.'
    case 'narancs':
      return 'A gazdasági forgalom eléri a plafon 90%-át. Kritikus szint — a könyvelővel tervezzétek meg a lépéseket a TVA-regisztrációra.'
    case 'piros':
      return 'Az éves gazdasági forgalom meghaladta a 395 000 RON-t. A törvény szerint 10 napon belül a könyvelőnek be kell nyújtania a 010-es nyomtatványt az ANAF-hoz. A következő hónap elsejétől a gyülekezet TVA-alannyá válik.'
  }
}
