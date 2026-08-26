/**
 * Leltar 3_43 import/export — akció-eredmény típusok (2026-08-26).
 * Külön fájlban a 'use server' korlátozás miatt (ott csak async function
 * exportálható).
 *
 * 2026-08-27 (javító-varázsló kör): az előnézet mostantól a TELJES,
 * soronkénti átnézetet is visszaadja (`sorok`), nem csak összesítő számokat —
 * a varázsló ebből építi az „Ellenőrzés" és a „Javítás" lépést. A régi,
 * összesítő mezők változatlanul megmaradnak.
 */

import type { Leltar343ReviewSor } from './leltar343-review'

export interface Leltar343PreviewLap {
  sheet: string
  cimke: string
  /** Importálható tételek (az összevont ±sorok feldolgozása UTÁN). */
  tetelek: number
  /** Ebből kivezetett (törlés-dátummal érkező) tétel. */
  kivezetett: number
  /** Le-/felértékeléssel érintett tételek. */
  ertekModositott: number
  /**
   * 2026-08-27: DARABSZÁM, nem lista. A teljes, soronkénti ellenőrzés a
   * `sorok` mezőben él — a lapónkénti hibalista ugyanazt küldte volna át
   * MÉGEGYSZER (kétszeres válasz-méret egy 4000 soros munkafüzetnél).
   */
  hibakSzama: number
  figyelmeztetesekSzama: number
}

export interface Leltar343Preview {
  success?: boolean
  error?: string
  fileName?: string
  egyhazmegye?: string | null
  intezmeny?: string | null
  vezeto?: string | null
  /** A Cimlap helyszín/felelős katalógusának mérete. */
  helyszinek?: number
  lapok?: Leltar343PreviewLap[]
  osszesTetel?: number
  /** Hány tétel leltári száma ütközik a MÁR RÖGZÍTETT tételekkel. */
  dbDuplikatumok?: number
  hianyzoLapok?: string[]
  /**
   * 2026-08-27: MINDEN átnézhető sor (elfogadott + elutasított), csonkolás
   * nélkül — ez a varázsló „teljes ellenőrzés" lépésének forrása.
   */
  sorok?: Leltar343ReviewSor[]
  /** A gyülekezetben MÁR kiadott, AKTÍV leltári számok (élő ütközés-jelzéshez). */
  aktivSzamok?: string[]
  /** KIVEZETETT tételek számai — a DB részleges indexe miatt újra kiadhatók. */
  kivezetettSzamok?: string[]
  /**
   * Véglegesítve van-e a CÉL-gyülekezet tárgyévi vagyonleltári jelentése?
   * Ilyenkor a MEGLÉVŐ tétel felülírása TILOS (csak egyházmegyei feloldással);
   * új tétel bevitele nincs zárolva.
   */
  veglegesitve?: boolean
  /**
   * Igaz, ha a lezárt állapotot NEM sikerült lekérdezni. Ilyenkor a rendszer
   * fail-closed módon véglegesítettnek tekinti az évet — a felület viszont ne
   * állítsa tényként a lezárást, hanem mondja meg, hogy nem tudta megmérni.
   */
  veglegesitesBizonytalan?: boolean
}

export interface Leltar343ImportResult {
  success?: boolean
  error?: string
  beszurt?: number
  /** 2026-08-27: felülírt (frissített) meglévő tételek száma. */
  frissitett?: number
  kihagyott?: number
  hibak?: Array<{ lap: string; sor: number; uzenet: string }>
  figyelmeztetesek?: string[]
}

export interface Leltar343ExportContext {
  error?: string
  egyhazmegye?: string | null
  intezmeny?: string | null
  vezeto?: string | null
  /** A beszámolási év (documentSeasonYear) — a Pénztár-blokk kezdő egyenlegéhez. */
  ev?: number
  penztarKezdo?: number | null
  kinnlevosegKezdo?: number | null
}
