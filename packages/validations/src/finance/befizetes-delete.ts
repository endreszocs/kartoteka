/**
 * Befizetés soft-delete + sztornó input-sémák — A-M7.3c (2026-04-24).
 *
 * A két művelet **szándékosan külön** — eltérő üzleti szemantika:
 *
 *   - **soft-delete** (`deleted=true`): „ez a befizetés sosem kellett volna,
 *     hogy rögzítve legyen" — pl. véletlen dupla-entry, elírás.
 *     Visszafordítható (undelete).
 *
 *   - **sztornó** (`stornozott=true` + indok + timestamp + user):
 *     „ez a befizetés valóban megtörtént, de érvénytelenítjük"
 *     (könyvelési fogalom). Audit-trail marad, indoklás kötelező,
 *     véglegesítés után már NEM sztornózható.
 *
 * A chitantákra vonatkozó stornozás cascade (a befizetéshez kapcsolt
 * papír-nyugták is stornózva) az A-M7.3c use-case része (opt-in flag-gel).
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────
// Soft-delete
// ─────────────────────────────────────────────────────────────────────────

export const softDeleteIncomeInputSchema = z.object({
  congregationId: z.string().uuid(),
  /** A befizetés belső ID-ja (a `befizetes.id` — integer). */
  befizetesId: z.number().int().positive(),
})
export type SoftDeleteIncomeInput = z.infer<typeof softDeleteIncomeInputSchema>

// ─────────────────────────────────────────────────────────────────────────
// Sztornó
// ─────────────────────────────────────────────────────────────────────────

export const stornoIncomeInputSchema = z.object({
  congregationId: z.string().uuid(),
  befizetesId: z.number().int().positive(),
  /** Kötelező indoklás (legalább 5 karakter — a lelkésznek érdemi oka legyen). */
  indok: z
    .string()
    .trim()
    .min(5, 'A sztornó indoklás legalább 5 karakter legyen.')
    .max(500, 'A sztornó indoklás legfeljebb 500 karakter lehet.'),
  /**
   * Ha true (default), a kapcsolt chitantákat (`oblio_szamlak.befizetes_id`)
   * is sztornózza. Az edit-storno-actions.ts mintája szerint ez a szokásos
   * viselkedés — a befizetés és a nyugta egyben tartoznak össze.
   */
  cascadeChitantas: z.boolean().optional(),
  /**
   * Ha true (default), a belső mozgás (kassza ↔ bank) párját is sztornózza.
   * A `belso_mozgas_xkey` alapján keresi a másik oldalt.
   */
  cascadeInternalTransfer: z.boolean().optional(),
  // P4-27 (audit 2026-08-28): a `skipYearFinalizedCheck` bypass-mező KIVEZETVE.
  // Soha senki nem hívta true-val, de nyitott hátsó ajtó volt az év-záron —
  // egy jövőbeli admin-override auditált, explicit útként épüljön, ne néma flaggel.
})
export type StornoIncomeInput = z.infer<typeof stornoIncomeInputSchema>
