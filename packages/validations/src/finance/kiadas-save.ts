/**
 * Kiadás mentés + kiegészítő use-case input-sémák — A-M7.4b (2026-04-24).
 *
 * 3 use-case:
 *   1. saveExpenseUseCase                    — új kiadás rögzítése
 *   2. getNextReceiptNumberForExpenseUseCase — iratszám auto-gen
 *   3. checkExpenseReceiptDuplicateUseCase   — duplikátum-check
 *
 * A tag-kereső (`searchMembersForFinanceUseCase`) és a család-resolver
 * (`getFamilyIdForPersonUseCase`) a befizetés-körből már megvan — a kiadás-
 * form is ezeket hívja (az `atvevoid` tag-FK-hoz). Nincs külön use-case
 * a kiadás-szövegkörnyezetben.
 */

import { z } from 'zod'

import { localTodayIso } from '../local-date'

// #5 (Endre): az irattipus szabad szöveges bizonylattípus-címke (lásd befizetes-save.ts).
const irattipusSchema = z.string().trim().min(1, 'Az irattípus kötelező').max(50)

const today = () => localTodayIso()

// ─────────────────────────────────────────────────────────────────────────
// Save — új kiadás
// ─────────────────────────────────────────────────────────────────────────

export const saveExpenseInputSchema = z
  .object({
    congregationId: z.string().uuid('A congregationId UUID kell legyen.'),

    osszeg: z
      .number({ message: 'Az összeg kötelező' })
      .positive('Az összeg pozitív szám kell legyen'),

    /** Dátum (YYYY-MM-DD — a timestamp-mezőben a 00:00:00 sufix-szel kerül). */
    datum: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum (YYYY-MM-DD)'),

    /** Kiadás-cél ID (a `kiadascel` tábla id-ja). */
    id_kiadascel: z.number({ message: 'Válasszon kategóriát' }).int().positive(),

    /** Átvevő tag ID — ha tag kapta a pénzt (pl. lelkész, gondnok). */
    atvevoid: z.number().int().positive().nullable().optional(),

    /** Átvevő neve szövegként — ha nem tag (idegen cég, kereskedő). */
    atvevo: z.string().trim().max(200).nullable().optional(),

    /** Cég esetén CUI/adószám (TVA-követelmény). */
    kedvezmenyezett_cui: z.string().trim().max(32).nullable().optional(),

    /** Iratszám — ha üres, a `getNextReceiptNumberForExpenseUseCase` tölti. */
    iratszam: z.string().trim().max(50).nullable().optional(),

    /** Irat-típus (Készpénz vagy Banki). */
    irattipus: irattipusSchema,

    megjegyzes: z.string().trim().max(500).nullable().optional(),

    /** Pótlás-e (előző időszak rendezése). */
    is_potlas: z.boolean().optional(),

    /** Bankszámla-id (ha Banki típus). */
    bankszamla_id: z.number().int().positive().nullable().optional(),

    /** Melyik időszakra (szöveg, pl. „2026 01"). */
    vonatkozo_idoszak: z.string().trim().max(50).nullable().optional(),
  })
  .refine((d) => d.datum <= today(), {
    message: 'Jövőbeli dátum nem engedélyezett',
    path: ['datum'],
  })
  .refine((d) => d.atvevoid || (d.atvevo && d.atvevo.trim().length > 0), {
    message: 'Meg kell adnod átvevő tagot VAGY az átvevő nevét szövegként.',
    path: ['atvevo'],
  })
export type SaveExpenseInput = z.infer<typeof saveExpenseInputSchema>

export interface SaveExpenseResult {
  id: number
  iratszam: string
}

// ─────────────────────────────────────────────────────────────────────────
// Next receipt number
// ─────────────────────────────────────────────────────────────────────────

export const nextExpenseReceiptNumberInputSchema = z.object({
  congregationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
})
export type NextExpenseReceiptNumberInput = z.infer<
  typeof nextExpenseReceiptNumberInputSchema
>

// ─────────────────────────────────────────────────────────────────────────
// Check duplicate
// ─────────────────────────────────────────────────────────────────────────

export const checkExpenseReceiptDuplicateInputSchema = z.object({
  congregationId: z.string().uuid(),
  iratszam: z.string().trim().min(1).max(50),
  excludeId: z.number().int().positive().optional(),
})
export type CheckExpenseReceiptDuplicateInput = z.infer<
  typeof checkExpenseReceiptDuplicateInputSchema
>
