/**
 * Kiadás (expense) list + kiadascel sémák — A-M7.4a (2026-04-24).
 *
 * A `kiadas` tábla ~29 oszlopos. Különbségek a `befizetes`-hez képest:
 *   - `atvevoid` (FK szemely) — ki vette át a pénzt (ha tag)
 *   - `atvevo` (text) — név, ha nem tag (pl. idegen cég)
 *   - `kedvezmenyezett_cui` — CUI/adószám cég esetén
 *   - `vonatkozo_idoszak` — pl. „2026 01" (melyik hónapra / időszakra szól)
 *   - NINCS család-koncepció (a kiadás nem család-szintű)
 *   - `datum` TIMESTAMP (nem DATE, mint a befizetes-ben)
 *
 * A `kiadascel` kategória-tábla hasonló a `befizetescel`-hez.
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────
// Kiadás list-row
// ─────────────────────────────────────────────────────────────────────────

export const kiadasListRowSchema = z.object({
  id: z.number().int(),
  xkey: z.string(),
  /** Dátum (ISO, lehet a `kiadas.datum` timestamp bármilyen reprezentációban). */
  datum: z.string(),
  osszeg: z.number(),
  osszeg_ron: z.number().nullable(),
  arfolyam: z.number().nullable(),
  /** Iratszám (belső nyilvántartás). */
  iratszam: z.string(),
  irattipus: z.string(),
  /** Kapcsolt nyugta hivatkozás. */
  nyugta: z.string(),
  is_potlas: z.boolean(),
  id_kiadascel: z.number().int(),
  bankszamla_id: z.number().int().nullable(),
  /** Átvevő tag ID (ha tag). */
  atvevoid: z.number().int().nullable(),
  /** Átvevő neve (szöveg — ha nem tag). */
  atvevo: z.string().nullable(),
  /** Cég esetén CUI/adószám. */
  kedvezmenyezett_cui: z.string().nullable(),
  /** Az időszak, amire a kiadás vonatkozik (pl. „2026 01"). */
  vonatkozo_idoszak: z.string().nullable(),
  megjegyzes: z.string().nullable(),

  /** Soft-delete + sztornó. */
  deleted: z.boolean(),
  stornozott: z.boolean(),
  stornozott_indok: z.string().nullable(),
  stornozott_at: z.string().nullable(),

  // ── Join-eredmények ──
  kiadascel_nev: z.string().nullable(),
  atvevo_nev: z.string().nullable(), // a szemely táblából összerakva (ha atvevoid van)
  bankszamla_nev: z.string().nullable(),

  // ── Technikai metadat ──
  userid: z.string().uuid(),
  congregation_id: z.string().uuid(),
  revision: z.number().int(),
  updated_at: z.string(),
  created: z.string().nullable(),
})
export type KiadasListRow = z.infer<typeof kiadasListRowSchema>

// ─────────────────────────────────────────────────────────────────────────
// List-input
// ─────────────────────────────────────────────────────────────────────────

export const listExpenseInputSchema = z.object({
  congregationId: z.string().uuid(),
  /** Év — ha megadva, csak az adott év kiadásai (datum szerint). */
  year: z.number().int().min(2000).max(2100).optional(),
  /** Átvevő tag ID (ha tag). */
  atvevoId: z.number().int().positive().optional().nullable(),
  /** Kiadás-cél kategória. */
  kiadasceId: z.number().int().positive().optional().nullable(),
  /** Soft-deleted-et is (default: false). */
  includeDeleted: z.boolean().optional(),
  /** Sztornózottakat is (default: true). */
  includeStornozott: z.boolean().optional(),
  orderBy: z.enum(['datum-desc', 'datum-asc', 'osszeg-desc']).optional(),
  limit: z.number().int().min(1).max(2000).optional(),
})
export type ListExpenseInput = z.infer<typeof listExpenseInputSchema>

// ─────────────────────────────────────────────────────────────────────────
// Kiadascel list
// ─────────────────────────────────────────────────────────────────────────

export const kiadasCelRowSchema = z.object({
  id: z.number().int(),
  nev: z.string(),
  nevro: z.string(),
  aktiv: z.boolean(),
  id_szamadasicel: z.string(),
  belsotetel: z.string().nullable(),
  parentid: z.number().int().nullable(),
})
export type KiadasCelRow = z.infer<typeof kiadasCelRowSchema>

export const listKiadasCelekInputSchema = z.object({
  onlyActive: z.boolean().optional(),
})
export type ListKiadasCelekInput = z.infer<typeof listKiadasCelekInputSchema>
