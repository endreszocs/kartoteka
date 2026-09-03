/**
 * Nyugtatömb (chitanta_tombok) zod validációs sémák — A-M7.1a (2026-04-22).
 *
 * A `chitanta_tombok` tábla egy előnyomott nyugtatömböt (bizonylat-tömb)
 * reprezentál: seria + szám-tartomány + darabszám-követés. Minden gyülekezet
 * saját tömböket vásárol és vezet nyilván; az aktív tömbből állítjuk ki
 * a chitanta (bizonylat) rekordokat.
 *
 * Supabase séma (2026-04-22):
 *   - id uuid PK, congregation_id uuid, diocese_id uuid (scope szerint)
 *   - block_nr text | null, seria text, szam_kezdet + szam_veg int
 *   - darabszam_ossz int > 0, felhasznalt_darabszam int (default 0)
 *   - vasarlas_datuma date, vasarlas_ara numeric | null
 *   - elso_hasznalat_datum date | null, utolso_hasznalat_datum date | null
 *   - aktiv bool (default true), megjegyzes text | null
 *   - scope 'gyulekezet' | 'egyhazmegye' (default gyulekezet)
 *   - created_at, updated_at timestamps, created_by uuid
 *
 * Ez a zod séma a server-row (DB lekérdezés eredménye) típusát ragadja meg,
 * amit a list/read use-case-ek validálnak.
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────
// Enum — scope
// ─────────────────────────────────────────────────────────────────────────

export const chitantaTombScopeSchema = z.enum(['gyulekezet', 'egyhazmegye'])
export type ChitantaTombScope = z.infer<typeof chitantaTombScopeSchema>

// ─────────────────────────────────────────────────────────────────────────
// Row séma (Supabase-ből érkező rekord)
// ─────────────────────────────────────────────────────────────────────────

export const chitantaTombRowSchema = z.object({
  id: z.string().uuid(),
  congregation_id: z.string().uuid().nullable(),
  diocese_id: z.string().uuid().nullable(),
  block_nr: z.string().nullable(),
  seria: z.string().min(1),
  szam_kezdet: z.number().int().nonnegative(),
  szam_veg: z.number().int().nonnegative(),
  darabszam_ossz: z.number().int().positive(),
  felhasznalt_darabszam: z.number().int().nonnegative(),
  vasarlas_datuma: z.string(),        // ISO date (YYYY-MM-DD)
  vasarlas_ara: z.number().nullable(),
  elso_hasznalat_datum: z.string().nullable(),
  utolso_hasznalat_datum: z.string().nullable(),
  aktiv: z.boolean(),
  megjegyzes: z.string().nullable(),
  scope: chitantaTombScopeSchema,
  created_at: z.string(),              // ISO timestamp
  created_by: z.string().uuid().nullable(),
  updated_at: z.string(),
})
export type ChitantaTombRow = z.infer<typeof chitantaTombRowSchema>

// ─────────────────────────────────────────────────────────────────────────
// Üzleti-logikai derived mezők (aktív tömb maradék-követés)
// ─────────────────────────────────────────────────────────────────────────

export interface ChitantaTombStatus {
  id: string
  seria: string
  szam_kezdet: number
  szam_veg: number
  felhasznalt_darabszam: number
  darabszam_ossz: number
  maradek: number
  kovetkezo_szam: number
}

/** Maradék és következő szám kiszámítása egy aktív tömbből. */
export function computeChitantaTombStatus(
  row: Pick<
    ChitantaTombRow,
    'id' | 'seria' | 'szam_kezdet' | 'szam_veg' | 'felhasznalt_darabszam' | 'darabszam_ossz'
  >,
): ChitantaTombStatus {
  const maradek = row.darabszam_ossz - row.felhasznalt_darabszam
  const kovetkezo_szam = row.szam_kezdet + row.felhasznalt_darabszam
  return {
    id: row.id,
    seria: row.seria,
    szam_kezdet: row.szam_kezdet,
    szam_veg: row.szam_veg,
    felhasznalt_darabszam: row.felhasznalt_darabszam,
    darabszam_ossz: row.darabszam_ossz,
    maradek,
    kovetkezo_szam,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Create input séma (új nyugtatömb rögzítése) — A-M7.1b
// ─────────────────────────────────────────────────────────────────────────

/**
 * Egy nyugtatömb létrehozásához szükséges user-input.
 *
 * Üzleti szabályok (a use-case érvényesíti):
 *   - `seria` nem üres, trim-elve
 *   - `szam_veg >= szam_kezdet`
 *   - `szam_veg - szam_kezdet + 1 <= MAX_NYUGTA_TOMBBEN` — egy tömbben max 50 nyugta
 *   - Nincs átfedés a congregation meglévő tömbjeivel (ua. seria + tartomány)
 *   - `vasarlas_datuma` ISO date (YYYY-MM-DD)
 */
export const createChitantaTombInputSchema = z.object({
  congregationId: z.string().uuid('A congregationId UUID kell legyen.'),
  block_nr: z.string().trim().min(1).max(64).optional().nullable(),
  seria: z
    .string()
    .trim()
    .min(1, 'A Seria (pl. EREKC24) kötelező.')
    .max(32, 'A Seria legfeljebb 32 karakter.'),
  szam_kezdet: z
    .number()
    .int('A kezdő szám egész kell legyen.')
    .nonnegative('A kezdő szám nem lehet negatív.'),
  szam_veg: z
    .number()
    .int('A záró szám egész kell legyen.')
    .nonnegative('A záró szám nem lehet negatív.'),
  vasarlas_datuma: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'A vásárlás dátuma YYYY-MM-DD formátumú.'),
  vasarlas_ara: z.number().nonnegative().nullable().optional(),
  megjegyzes: z.string().trim().max(500).nullable().optional(),
})

export type CreateChitantaTombInput = z.infer<typeof createChitantaTombInputSchema>

/**
 * EGY NYUGTATÖMB LAPSZÁMA — a fizikai valóság.
 *
 * Endre javítása (2026-09-02): „A nyugtatömbökben nem 100, hanem 50 lap van."
 * Az EREK-től (Egyházkerület) vásárolt, sorszámozott nyugtatömb 50 lapos.
 *
 * ⚠️ EGYETLEN FORRÁS: a webes varázsló, a kerületi és az egyházmegyei rögzítő
 * MIND ezt a konstanst használja. Korábban három helyen élt külön a 100-as
 * korlát — egy javítás így némán kihagyhatott volna egy felületet.
 *
 * ⚠️ CSAK A RÖGZÍTÉSRE vonatkozik. A már rögzített tömbök (köztük a régi,
 * 100-as tartománnyal felvittek) érintetlenek maradnak: a `chitantaTombRowSchema`
 * SZÁNDÉKOSAN nem tartalmazza ezt a korlátot, különben a meglévő sorok
 * beolvasása bukna el.
 */
export const MAX_NYUGTA_TOMBBEN = 50

/** Bővített séma az üzleti szabályokkal (számtartomány, tömb-méret). */
export const createChitantaTombInputFullSchema = createChitantaTombInputSchema
  .refine((v) => v.szam_veg >= v.szam_kezdet, {
    message: 'A záró szám nem lehet kisebb, mint a kezdő szám.',
    path: ['szam_veg'],
  })
  .refine((v) => v.szam_veg - v.szam_kezdet + 1 <= MAX_NYUGTA_TOMBBEN, {
    message: `Egy nyugtatömb ${MAX_NYUGTA_TOMBBEN} lapos — ellenőrizd a kezdő- és a végszámot.`,
    path: ['szam_veg'],
  })
