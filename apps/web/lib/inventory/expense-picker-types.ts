/**
 * „Kikeresés a könyvelésből" — a leltár-dialógus kiadás-választójának típusai
 * (2026-08-09). Külön fájl, mert a 'use server' action-fájl típust nem exportálhat.
 */

export interface ExpensePickerRow {
  id: number
  /** A kiadás xkey-e — mentéskor a leltar_tetelek.penzugy_xkey ezt kapja. */
  xkey: string
  /** Dátum (YYYY-MM-DD, a timestampból levágva). */
  datum: string
  osszeg: number
  atvevo: string | null
  iratszam: string | null
  nyugta: string | null
  irattipus: string | null
  megjegyzes: string | null
  /** A jogcím hivatalos kódja (pl. '205.01') — null, ha nincs meg a leképezés. */
  kod: string | null
  /** A jogcím neve (szamadasicel.nev), ha ismert. */
  kodNev: string | null
  /** Leltár-köteles jogcím? ('alapeszkoz' | 'csekely' | null) — rangsoroláshoz + kategória-előtöltéshez. */
  invKategoria: 'alapeszkoz' | 'csekely' | null
  /** Van-e már leltári tétel ehhez a kiadáshoz kapcsolva (penzugy_xkey egyezés). */
  linked: boolean
}

export interface ExpensePickerResult {
  rows?: ExpensePickerRow[]
  /** Az évek, amelyekben van pénzügyi adat (év-választóhoz). */
  years?: number[]
  error?: string
}
