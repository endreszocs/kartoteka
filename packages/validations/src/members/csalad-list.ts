/**
 * csalad-list zod sémák — M8.3a (2026-04-24).
 *
 * A `csalad_local` (Rust v17) lokális tükör olvasási oldala. A család-lista
 * oldalon és a tag-detail-modal "Család" szekciójában ezt használjuk.
 *
 * A csalad-modell röviden:
 *   - `csalad.id` integer sequence
 *   - `id_ferfi` → szemely.id (apa, nullable)
 *   - `id_no` → szemely.id (anya, nullable)
 *   - `c_utcaid` + `c_szam` + `c_tombhaz` + `c_lepcsohaz` + `c_emelet` + `c_ajto` — cím
 *   - `id_csoport` → körzet-FK (nullable)
 *   - `isaktiv` — aktív-e
 *   - gyerekek külön `gyerek_local` junction-táblán keresztül
 */

import { z } from 'zod'

/** A `csalad_local` SQLite-sor a lényegi mezőkkel. Integer-bool-ok 0/1. */
export const csaladListRowSchema = z.object({
  id: z.number().int().nonnegative(),
  id_ferfi: z.number().int().nullable(),
  id_no: z.number().int().nullable(),
  c_utcaid: z.number().int(),
  c_szam: z.string(),
  c_tombhaz: z.string().nullable(),
  c_lepcsohaz: z.string().nullable(),
  c_ajto: z.string().nullable(),
  c_emelet: z.string().nullable(),
  id_csoport: z.number().int().nullable(),
  isaktiv: z.number().int().min(0).max(1),
  revision: z.number().int().nonnegative(),
  updated_at: z.string().nullable(),
})
export type CsaladListRow = z.infer<typeof csaladListRowSchema>

/** A `gyerek_local` (junction csalad ↔ szemely) sor. */
export const gyerekRowSchema = z.object({
  id: z.number().int().nonnegative(),
  id_csalad: z.number().int().nonnegative(),
  id_szemely: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  updated_at: z.string().nullable(),
})
export type GyerekRow = z.infer<typeof gyerekRowSchema>

/** Lista-szűrő opciók. */
export const CSALAD_STATUS_FILTER_VALUES = ['mind', 'aktiv', 'inaktiv'] as const
export const csaladStatusFilterSchema = z.enum(CSALAD_STATUS_FILTER_VALUES)
export type CsaladStatusFilter = z.infer<typeof csaladStatusFilterSchema>

export const CSALAD_STATUS_FILTER_LABELS: Record<CsaladStatusFilter, string> = {
  mind: 'Mind',
  aktiv: 'Aktív',
  inaktiv: 'Inaktív',
}

export const csaladListInputSchema = z.object({
  congregationId: z.string().min(1),
  /** Keresés a családfő férfi / nő / gyerek neve alapján. */
  search: z.string().optional(),
  statusFilter: csaladStatusFilterSchema.optional().default('aktiv'),
  orderBy: z
    .enum(['csaladfo-nev-asc', 'csaladfo-nev-desc', 'id-desc'])
    .optional()
    .default('csaladfo-nev-asc'),
  limit: z.number().int().positive().max(5000).optional().default(1000),
})
export type CsaladListInput = z.infer<typeof csaladListInputSchema>

/**
 * Család-"portré" — a lista sor alapján egy humanizált representation
 * a UI-nak. A `CsaladListRow`-t a `TauriSqliteBackend` a név-feloldáshoz
 * join-olja a `szemely_local`-hez.
 */
export const csaladPortraitSchema = z.object({
  id: z.number().int().nonnegative(),
  /** Az apa egyszerű név-formájában (NULL ha nincs). */
  ferfi_name: z.string().nullable(),
  ferfi_id: z.number().int().nullable(),
  /** Az anya egyszerű név-formájában (NULL ha nincs). */
  no_name: z.string().nullable(),
  no_id: z.number().int().nullable(),
  /** Gyermekek száma (a gyerek_local junction-ból COUNT). */
  gyermekek_count: z.number().int().nonnegative(),
  /** Teljes szöveges cím (`c_szcim`-szerű helyettesítő az `adrstreet` nélkül). */
  cim_display: z.string().nullable(),
  isaktiv: z.number().int().min(0).max(1),
  revision: z.number().int().nonnegative(),
  updated_at: z.string().nullable(),
})
export type CsaladPortrait = z.infer<typeof csaladPortraitSchema>
