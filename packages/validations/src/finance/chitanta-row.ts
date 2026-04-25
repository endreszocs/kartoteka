/**
 * Chitanța list-row + sztornó input zod sémák — A-M7.2e (2026-04-23).
 *
 * A teljes `oblio_szamlak` tábla ~30 oszlopos; a chitanța-listához és
 * a sztornó művelethez csak egy szűkített halmaz kell. A `ChitantaListRow`
 * a list use-case visszatérő-típusa.
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────
// List-item séma (a chitanta-lista soronkénti típusa)
// ─────────────────────────────────────────────────────────────────────────

export const chitantaListRowSchema = z.object({
  id: z.string().uuid(),
  sorozat: z.string(),
  szam: z.number().int(),
  szamla_datum: z.string(),                 // ISO YYYY-MM-DD
  klienesseg_nev: z.string(),
  klienesseg_cui: z.string().nullable(),
  klienesseg_cim: z.string().nullable(),
  osszeg_brut: z.number(),
  reprezentand: z.string().nullable(),
  befizetes_id: z.number().int().nullable(),
  stornozott: z.boolean(),
  stornozott_indok: z.string().nullable(),
  megjegyzes: z.string().nullable(),
  issued_by: z.string().uuid().nullable(),
  created_at: z.string(),
})
export type ChitantaListRow = z.infer<typeof chitantaListRowSchema>

// ─────────────────────────────────────────────────────────────────────────
// List input séma
// ─────────────────────────────────────────────────────────────────────────

export const listChitantasInputSchema = z.object({
  congregationId: z.string().uuid(),
  /** Év-tól szűrő (szamla_datum >= YYYY-01-01). */
  yearFrom: z.number().int().min(2000).max(2100).optional(),
  /** Év-ig szűrő (szamla_datum <= YYYY-12-31). */
  yearTo: z.number().int().min(2000).max(2100).optional(),
  /** Sorozat szűrő (pontos egyezés). */
  sorozat: z.string().trim().min(1).max(32).optional(),
  /** Sztornózottak-is kapcsoló — default `true` (mindent listázunk). */
  includeStornozott: z.boolean().optional(),
})
export type ListChitantasInput = z.infer<typeof listChitantasInputSchema>

// ─────────────────────────────────────────────────────────────────────────
// Sztornó input séma
// ─────────────────────────────────────────────────────────────────────────

export const stornoChitantaInputSchema = z.object({
  congregationId: z.string().uuid(),
  chitantaId: z.string().uuid('A chitanța ID UUID kell legyen.'),
  indok: z
    .string()
    .trim()
    .min(5, 'A sztornó indoklás legalább 5 karakter legyen.')
    .max(500, 'A sztornó indoklás legfeljebb 500 karakter lehet.'),
})
export type StornoChitantaInput = z.infer<typeof stornoChitantaInputSchema>
