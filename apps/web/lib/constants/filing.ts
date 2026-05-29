export const FILING_DIRECTIONS = ['incoming', 'outgoing'] as const
export type FilingDirection = typeof FILING_DIRECTIONS[number]

export const FILING_DIRECTION_LABELS: Record<FilingDirection, string> = {
  incoming: 'Érkező',
  outgoing: 'Kimenő',
}

/**
 * LEGACY: a `file_folder` mező korábbi 3 érték rendszere (F.Á. / É.Á. / A.K.).
 * 2026-05-28 óta a `retention_type` mező (csak F.Á. / É.Á.) és az `ugykor_kod`
 * (új EREK 2024-es ügykörjegyzék) veszi át a szerepét. Backward-compat miatt
 * meghagyjuk, mert a régi rekordok ezt használják.
 *
 * Az A.K. (Anyakönyvi) érték értelmezhetetlen — az anyakönyv KÖTETES anyag,
 * NEM iktatott szálas irat. A régi A.K.-rekordok az új ügykörjegyzék 2-es
 * pontjába (Anya- és családkönyvi levelezés) tartoznak.
 */
export const FILING_FOLDERS = ['F.Á.', 'É.Á.', 'A.K.'] as const
export type FilingFolder = typeof FILING_FOLDERS[number]

export const FILING_FOLDER_LABELS: Record<FilingFolder, string> = {
  'F.Á.': 'Egyéb iratok',
  'É.Á.': 'Éves adminisztráció',
  'A.K.': 'Anyakönyvi (legacy)',
}

export interface FilingEntry {
  id: string // uuid PK!
  year: number
  sequence_number: number
  direction: string
  kelt: string
  subject: string
  sender_or_recipient: string | null
  file_folder: string
  targykivonat: string | null
  elintezes_ideje: string | null
  elintezes_modja: string | null
  irattarijel: string | null
  megjegyzes: string | null
  deleted: boolean
  // ─────────────────────────────────────────────────────────────────────
  // 2026-05-28: az EREK 2024-es ügykörjegyzék szerinti új mezők
  // ─────────────────────────────────────────────────────────────────────
  /** A küldő intézmény saját iktatószáma (pl. "Esperesi 479/2023."). PDF rovat #2. */
  external_ref_szam: string | null
  /** A beérkezett irat keltezése a küldő szerint. */
  external_ref_kelt: string | null
  /** Amikor a mi hivatalunkba érkezett az irat (≠ a kelt). PDF rovat #3. */
  beerkezes_ideje: string | null
  /** A beérkezett irat mellékleteinek száma. PDF rovat #4. */
  mellekletek_szama: number | null
  /** Kereszthivatkozás más iktatószámra (pl. "lásd 36/2023"). PDF rovat #9. */
  valasz_iktatoszam: string | null
  /** Új ügykörjegyzék (2024-) pontszáma (pl. "1.", "6/1.", "13/2."). PDF rovat #8. */
  ugykor_kod: string | null
  /** Megőrzési típus — F.Á. (folyamatosan) vagy É.Á. (évente). */
  retention_type: string | null
  /** 2026-05-29 (Fázis 3): jelzi, hogy van-e külön archivált másodpéldány. */
  has_duplicate: boolean
}

/**
 * 2026-05-29 (Fázis 3): Évvégi iktatókönyv-lezárás rekord.
 * Egy (congregation_id, year) pár csak egyszer lehet lezárva.
 */
export interface IktatoYearlyClosure {
  congregation_id: string
  year: number
  closed_at: string
  closed_by_profile_id: string | null
  closing_note: string | null
  total_entries_at_close: number | null
}
