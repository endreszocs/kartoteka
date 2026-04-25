/**
 * Befizetés-cél (kategória) list-sémák — A-M7.3d1 (2026-04-24).
 *
 * A `befizetescel` tábla ~50 soros kategória-lista (járulék, persely,
 * adomány, stb.). A befizetés-form dropdown-jához kell lekérdezni.
 * Read-only, közös minden gyülekezet számára (nem congregation-scope).
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────
// List-row
// ─────────────────────────────────────────────────────────────────────────

export const befizetesCelRowSchema = z.object({
  id: z.number().int(),
  /** Magyar név (pl. „Egyházfenntartó járulék"). */
  nev: z.string(),
  /** Román név (ROI-ban). */
  nevro: z.string(),
  aktiv: z.boolean(),
  /** Szamadasicel-kód (pl. „101.07"). */
  id_szamadasicel: z.string(),
  /** Belső tétel besorolás (opcionális). */
  belsotetel: z.string().nullable(),
  /** Parent ID — hierarchikus kategóriák (opcionális). */
  parentid: z.number().int().nullable(),
})
export type BefizetesCelRow = z.infer<typeof befizetesCelRowSchema>

// ─────────────────────────────────────────────────────────────────────────
// List-input (minimal)
// ─────────────────────────────────────────────────────────────────────────

export const listBefizetesCelekInputSchema = z.object({
  /** Csak az aktív kategóriákat (default true). Az inaktívak csak admin-nézetben. */
  onlyActive: z.boolean().optional(),
})
export type ListBefizetesCelekInput = z.infer<typeof listBefizetesCelekInputSchema>
