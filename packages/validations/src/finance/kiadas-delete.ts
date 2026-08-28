/**
 * Kiadás soft-delete + sztornó input-sémák — A-M7.4c (2026-04-24).
 *
 * A `befizetes-delete.ts` tükörképe. A két művelet szemantikája azonos:
 *   - soft-delete: „ez sosem kellett volna rögzítve lenni"
 *   - sztornó: „valódi művelet, de érvénytelenítjük" + audit-trail
 *
 * Kiadás-specifikus:
 *   - NINCS chitanta cascade (a kiadás nem állít ki papír-nyugtát)
 *   - VAN belső-mozgás párja (ha `belso_mozgas_xkey` töltve)
 *   - `kiadasikiseroiv` (kísérőív) táblához NINCS cascade — annak nincs
 *     `stornozott` oszlopa, egyszerű supplementary lista.
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────
// Soft-delete
// ─────────────────────────────────────────────────────────────────────────

export const softDeleteExpenseInputSchema = z.object({
  congregationId: z.string().uuid(),
  /** A kiadás belső ID-ja (`kiadas.id` — integer). */
  kiadasId: z.number().int().positive(),
})
export type SoftDeleteExpenseInput = z.infer<typeof softDeleteExpenseInputSchema>

// ─────────────────────────────────────────────────────────────────────────
// Sztornó
// ─────────────────────────────────────────────────────────────────────────

export const stornoExpenseInputSchema = z.object({
  congregationId: z.string().uuid(),
  kiadasId: z.number().int().positive(),
  indok: z
    .string()
    .trim()
    .min(5, 'A sztornó indoklás legalább 5 karakter legyen.')
    .max(500, 'A sztornó indoklás legfeljebb 500 karakter lehet.'),
  /**
   * Belső mozgás (kassza ↔ bank) párját is sztornózza (ha van
   * `belso_mozgas_xkey`). Default true.
   */
  cascadeInternalTransfer: z.boolean().optional(),
  // P4-27 (audit 2026-08-28): a `skipYearFinalizedCheck` bypass-mező KIVEZETVE
  // (nyitott, hívatlan hátsó ajtó volt az év-záron).
})
export type StornoExpenseInput = z.infer<typeof stornoExpenseInputSchema>
