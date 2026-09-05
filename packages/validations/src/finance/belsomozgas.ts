/**
 * Belső mozgás (internal transfer) zod sémák — A-M7.6a (2026-04-24).
 *
 * A `belsomozgas` tábla rögzíti a gyülekezeti készpénz mozgását:
 *   - kassza_bank: perselypénz a bankba
 *   - bank_kassza: pénzfelvétel a bankból a kasszába
 *   - bank_bank: átutalás két bank-számla között
 *   - valutacsere: deviza-váltás (EUR → RON stb.)
 *
 * Jelen fázisban a négy típus közül **kassza_bank** és **bank_kassza** a
 * primér napi használat; a `bank_bank` és `valutacsere` ritkább (és
 * bonyolultabb — pl. `valutacsere`-nél `cel_osszeg` + `arfolyam` is kell).
 */

import { z } from 'zod'

import { localTodayIso } from '../local-date'
import { CENT_UZENET, isCentPontos } from '../money'

const TRANSFER_TYPES = ['kassza_bank', 'bank_kassza', 'bank_bank', 'valutacsere'] as const
export type TransferType = (typeof TRANSFER_TYPES)[number]

const today = () => localTodayIso()

// ─────────────────────────────────────────────────────────────────────────
// List-row
// ─────────────────────────────────────────────────────────────────────────

export const belsomozgasListRowSchema = z.object({
  id: z.number().int(),
  datum: z.string(),                 // ISO date
  tipus: z.enum(TRANSFER_TYPES),
  /** Forrás (szöveg: „Kassza", „Bank XYZ") */
  forras: z.string(),
  /** Cél (szöveg: „Bank XYZ", „Kassza") */
  cel: z.string(),
  osszeg: z.number(),
  /** Cél-összeg valutacsere esetén (más pénznem). */
  cel_osszeg: z.number().nullable(),
  /** Árfolyam valutacsere esetén. */
  arfolyam: z.number().nullable(),
  megjegyzes: z.string().nullable(),
  deleted: z.boolean(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
  congregation_id: z.string().uuid(),
  revision: z.number().int(),
  updated_at: z.string(),
})
export type BelsomozgasListRow = z.infer<typeof belsomozgasListRowSchema>

// ─────────────────────────────────────────────────────────────────────────
// List-input
// ─────────────────────────────────────────────────────────────────────────

export const listInternalTransfersInputSchema = z.object({
  congregationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100).optional(),
  tipus: z.enum(TRANSFER_TYPES).optional(),
  includeDeleted: z.boolean().optional(),
  orderBy: z.enum(['datum-desc', 'datum-asc', 'osszeg-desc']).optional(),
  limit: z.number().int().min(1).max(2000).optional(),
})
export type ListInternalTransfersInput = z.infer<typeof listInternalTransfersInputSchema>

// ─────────────────────────────────────────────────────────────────────────
// Save
// ─────────────────────────────────────────────────────────────────────────

export const saveInternalTransferInputSchema = z
  .object({
    congregationId: z.string().uuid(),
    datum: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum (YYYY-MM-DD)'),
    tipus: z.enum(TRANSFER_TYPES),
    forras: z.string().trim().min(1, 'A forrás kötelező').max(100),
    cel: z.string().trim().min(1, 'A cél kötelező').max(100),
    osszeg: z
      .number({ message: 'Az összeg kötelező' })
      .positive('Az összeg pozitív szám kell legyen')
      .refine(isCentPontos, CENT_UZENET),
    cel_osszeg: z.number().positive().refine(isCentPontos, CENT_UZENET).optional().nullable(),
    arfolyam: z.number().positive().optional().nullable(),
    megjegyzes: z.string().trim().max(500).optional().nullable(),
    /**
     * 2026-08-27: az ERINTETT bankszamla azonositoja.
     *
     * MIERT KELL: a `forras`/`cel` SZABAD SZOVEG („Kassza", „Bank XYZ"), abbol a
     * konyveles tukor-sorainak `bankszamla_id`-ja nem allithato be. Enelkul a
     * desktopon rogzitett atvezetes CSAK a `belsomozgas` mestertablaba kerult,
     * a `befizetes`/`kiadas` par NEM jott letre — vagyis a penz NEM MOZDULT a
     * konyvben: sem a kassza, sem a bank egyenlege nem valtozott.
     * Opcionalis, hogy a meglevo hivok valtozatlanul mukodjenek; ha meg van adva,
     * a use-case letrehozza a konyvelesi part is.
     */
    bankszamlaId: z.number().int().positive().optional().nullable(),
    /**
     * 2026-08-29 (D5): bank→bank átvezetésnél a CÉL-számla azonosítója —
     * ezzel a use-case a könyvelési párt is létrehozza (kiadás a forrás-,
     * bevétel a cél-bankon, 402.02), RON↔RON számlapárnál.
     */
    celBankszamlaId: z.number().int().positive().optional().nullable(),
    /**
     * 2026-09-03 (Endre 1., P0-javítás): ÖRÖKBEFOGADÁS — a rögzítő „Párosítatlan
     * tétel átvétele" választójával kijelölt, MÁR LÉTEZŐ könyvelési sor.
     *
     * ⛔ MIÉRT KELL. E nélkül az „átvétel" nem párosított, hanem DUPLIKÁLT: a
     * use-case friss `belso_mozgas_xkey`-jel MINDKÉT lábat újra beszúrta, a
     * kiválasztott árva sor pedig érintetlen maradt — ugyanarra a pénzre két
     * könyvelési sor keletkezett, a figyelmeztetés viszont nem tűnt el (most a
     * régi árva maradt pár nélkül), ami a lelkészt ÚJABB átvételre csábította.
     *
     * Ha meg van adva, a use-case CSAK A HIÁNYZÓ LÁBAT hozza létre, és a meglévő
     * sort ugyanazzal a párosító kulccsal jelöli meg.
     *
     * `oldal` = a MEGLÉVŐ sor oldala ('income' = befizetes, 'expense' = kiadas);
     * a use-case ennek az ELLENTÉTÉT szúrja be.
     */
    parositando: z
      .object({
        oldal: z.enum(['income', 'expense']),
        id: z.number().int().positive(),
      })
      .optional()
      .nullable(),
  })
  .refine((d) => d.datum <= today(), {
    message: 'Jövőbeli dátum nem engedélyezett',
    path: ['datum'],
  })
  .refine((d) => d.forras !== d.cel, {
    message: 'A forrás és a cél nem lehet ugyanaz.',
    path: ['cel'],
  })
  .refine(
    (d) => {
      // Valutacsere esetén a cel_osszeg és arfolyam kötelező
      if (d.tipus === 'valutacsere') {
        return d.cel_osszeg !== null && d.cel_osszeg !== undefined && d.arfolyam !== null && d.arfolyam !== undefined
      }
      return true
    },
    {
      message: 'Valutacsere esetén a cél-összeg és az árfolyam kötelező.',
      path: ['cel_osszeg'],
    },
  )
export type SaveInternalTransferInput = z.infer<typeof saveInternalTransferInputSchema>

export interface SaveInternalTransferResult {
  id: number
}

// ─────────────────────────────────────────────────────────────────────────
// Soft-delete
// ─────────────────────────────────────────────────────────────────────────

export const softDeleteInternalTransferInputSchema = z.object({
  congregationId: z.string().uuid(),
  transferId: z.number().int().positive(),
})
export type SoftDeleteInternalTransferInput = z.infer<
  typeof softDeleteInternalTransferInputSchema
>
