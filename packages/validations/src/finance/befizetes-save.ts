/**
 * Befizetés mentés + kiegészítő use-case input-sémák — A-M7.3b (2026-04-24).
 *
 * 5 use-case:
 *   1. saveIncomeUseCase          — új befizetés rögzítése
 *   2. getNextReceiptNumberUseCase — iratszám auto-generálás (Készpénz fix)
 *   3. checkReceiptDuplicateUseCase — duplikátum-ellenőrzés
 *   4. searchMembersForFinanceUseCase — tag-autocomplete a form-ban
 *   5. getFamilyIdForPersonUseCase — tag → család FK-resolver
 *
 * **Irat-típus konvenció:** a web-oldali `RECEIPT_TYPES = ['Készpénz', 'Banki']`
 * megtartva, a lelkészek magyarul olvassák, és a meglévő `befizetes.irattipus`
 * oszlop ilike szűrés történt rá.
 */

import { z } from 'zod'

// #5 (Endre): az irattipus szabad szöveges bizonylattípus-címke (Chitanță/Factură/Készpénz/
// Banki/Extras/OP…). A régi 2-értékű enum túl szűk volt — a DB-oszlop `text`, nincs CHECK.
const irattipusSchema = z.string().trim().min(1, 'Az irattípus kötelező').max(50)

/** Jövőbeli dátum-prevenció — a refine() alatt kell. */
const today = () => new Date().toISOString().slice(0, 10)

// ─────────────────────────────────────────────────────────────────────────
// 1. Save — új befizetés rögzítése
// ─────────────────────────────────────────────────────────────────────────

export const saveIncomeInputSchema = z
  .object({
    congregationId: z.string().uuid('A congregationId UUID kell legyen.'),

    /** Bruttó összeg (a rögzített pénznemben, általában RON). */
    osszeg: z
      .number({ message: 'Az összeg kötelező' })
      .positive('Az összeg pozitív szám kell legyen'),

    /** A befizetés dátuma (YYYY-MM-DD). */
    datum: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum (YYYY-MM-DD)'),

    /** Befizetés-cél ID (a `befizetescel` tábla id-ja). */
    id_befizetescel: z.number({ message: 'Válasszon kategóriát' }).int().positive(),

    /** Tag ID — személyi befizetés esetén (kölcsönösen kizárólagos az id_csalad-dal). */
    id_szemely: z.number().int().positive().nullable().optional(),

    /** Család ID — családi befizetés esetén. */
    id_csalad: z.number().int().positive().nullable().optional(),

    /** Forrás rövid szöveges leírása (pl. "Kézi rögzítés", "perselypénz", "bank"). */
    forrasa: z.string().trim().max(100).nullable().optional(),

    /** Iratszám — ha üres, a use-case `getNextReceiptNumberUseCase`-sel tölt automatikusan.
     *  #3 (Endre): ez a KERÜLETI (nyomdai) szám — a kerülettől kapott szám. */
    iratszam: z.string().trim().max(50).nullable().optional(),

    /** #3 (Endre): gyülekezeti saját sorszám → befizetes.nyugta (a kerületi = iratszam mellett). */
    nyugta: z.string().trim().max(50).nullable().optional(),

    /** Irat-/bizonylattípus (Chitanță/Factură/Készpénz/Banki/…) — szabad szöveges címke. */
    irattipus: irattipusSchema,

    /** Melyik évre szól a fizetés (ha pótlás, nem mindig = datum.year). */
    fizetettev: z.number().int().min(2000).max(2100).nullable().optional(),

    megjegyzes: z.string().trim().max(500).nullable().optional(),

    /** Pótlás-e (előző évi tartozás rendezése). */
    is_potlas: z.boolean().optional(),

    /** Kapcsolt bankszámla ID (ha Banki típus). */
    bankszamla_id: z.number().int().positive().nullable().optional(),
  })
  .refine((d) => d.datum <= today(), {
    message: 'Jövőbeli dátum nem engedélyezett',
    path: ['datum'],
  })
  .refine((d) => !(d.id_szemely && d.id_csalad), {
    message: 'Egy befizetés vagy tag vagy család — nem mindkettő.',
    path: ['id_szemely'],
  })
export type SaveIncomeInput = z.infer<typeof saveIncomeInputSchema>

/** A save eredménye — az új sor ID-ja és a véglegesen használt iratszám. */
export interface SaveIncomeResult {
  id: number
  iratszam: string
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Next receipt number
// ─────────────────────────────────────────────────────────────────────────

export const nextReceiptNumberInputSchema = z.object({
  congregationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
})
export type NextReceiptNumberInput = z.infer<typeof nextReceiptNumberInputSchema>

// ─────────────────────────────────────────────────────────────────────────
// 3. Check receipt duplicate
// ─────────────────────────────────────────────────────────────────────────

export const checkReceiptDuplicateInputSchema = z.object({
  congregationId: z.string().uuid(),
  iratszam: z.string().trim().min(1, 'Üres iratszám nem ellenőrizhető.').max(50),
  /** Ha megadva, ezt az ID-t kihagyja (pl. UPDATE közben nem hamis-pozitív). */
  excludeId: z.number().int().positive().optional(),
})
export type CheckReceiptDuplicateInput = z.infer<
  typeof checkReceiptDuplicateInputSchema
>

// ─────────────────────────────────────────────────────────────────────────
// 4. Search members for finance
// ─────────────────────────────────────────────────────────────────────────

export const searchMembersForFinanceInputSchema = z.object({
  congregationId: z.string().uuid(),
  /** A kereső szöveg — name vagy CNP (a szemely-táblából normalizáltan). */
  query: z.string().trim().min(2, 'Legalább 2 karakter a kereséshez.').max(100),
  /** Max találat (1–20). */
  limit: z.number().int().min(1).max(20).optional(),
})
export type SearchMembersForFinanceInput = z.infer<
  typeof searchMembersForFinanceInputSchema
>

/** A kereső minimális tag-row-a (a form-drop-downhoz). */
export interface MemberSearchResult {
  id: number
  csaladnev: string | null
  k_nev: string | null
  sz_datum: string | null
  /** Cím összerakva (adrlocality + adrstreet + c_szam) */
  cim_nev: string | null
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Get family ID for person
// ─────────────────────────────────────────────────────────────────────────

export const familyIdForPersonInputSchema = z.object({
  congregationId: z.string().uuid(),
  personId: z.number().int().positive(),
})
export type FamilyIdForPersonInput = z.infer<typeof familyIdForPersonInputSchema>
