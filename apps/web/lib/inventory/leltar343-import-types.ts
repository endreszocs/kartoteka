/**
 * Leltar 3_43 import/export — akció-eredmény típusok (2026-08-26).
 * Külön fájlban a 'use server' korlátozás miatt (ott csak async function
 * exportálható).
 */

export interface Leltar343PreviewLap {
  sheet: string
  cimke: string
  /** Importálható tételek (az összevont ±sorok feldolgozása UTÁN). */
  tetelek: number
  /** Ebből kivezetett (törlés-dátummal érkező) tétel. */
  kivezetett: number
  /** Le-/felértékeléssel érintett tételek. */
  ertekModositott: number
  hibak: Array<{ sor: number; uzenet: string }>
  figyelmeztetesek: Array<{ sor: number; uzenet: string }>
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
  /** Hány tétel leltári száma ütközik a MÁR RÖGZÍTETT tételekkel (kihagynánk). */
  dbDuplikatumok?: number
  hianyzoLapok?: string[]
}

export interface Leltar343ImportResult {
  success?: boolean
  error?: string
  beszurt?: number
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
