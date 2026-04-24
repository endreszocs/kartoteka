/**
 * szemely-save zod sémák — M8.0b (2026-04-24).
 *
 * A tagnyilvántartás-szerkesztés input-sémája. Az M8.0b iterációban csak
 * szerkesztést (UPDATE) támogatunk — a tag már létezik a `szemely` táblában,
 * szerkeszthető mezői a `SzemelyUpdateInput` patch-ben jönnek.
 *
 * UX-elvek:
 *   - Minden mező opcionális a patch-ben (csak a változottat küldjük el).
 *   - A nev-mezők üres-stringre engedik a null-t (a lelkész törölheti a
 *     férjezett nevet vagy a születési családnevet).
 *   - A dátum ISO 'YYYY-MM-DD' formátumban.
 *   - A boolean mezőket explicit boolean-ként hagyjuk — a desktop sync
 *     helper konvertálja integer-ré a SQLite optimistic-write-hoz.
 *
 * Admin-jellegű mezők (congregation_id, family_id, type, isvisible, CNP) nem
 * szerepelnek a patch-ben — azokhoz külön admin UI kell.
 */

import { z } from 'zod'

/**
 * Szerkesztési input — minden mező opcionális, csak a változottak mennek a
 * Supabase UPDATE-be. Üres string → null (a UI-oldali form control-okkal
 * konzisztens).
 */
export const szemelyUpdateInputSchema = z.object({
  // Személyes név-mezők (nullable — a lelkész törölheti)
  k_nev: z.string().trim().max(100).nullable().optional(),
  csaladnev: z.string().trim().max(100).nullable().optional(),
  szcs_nev: z.string().trim().max(100).nullable().optional(),
  ferjk_nev: z.string().trim().max(100).nullable().optional(),

  // Személyes adatok
  allapot: z.string().trim().max(40).nullable().optional(),
  sz_datum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum formátum: YYYY-MM-DD')
    .nullable()
    .optional(),
  ferfi: z.boolean().optional(),

  // Származás
  apjaneve: z.string().trim().max(200).nullable().optional(),
  anyjaneve: z.string().trim().max(200).nullable().optional(),

  // Cím (szöveges V1-ben)
  c_szcim: z.string().trim().max(500).nullable().optional(),
  c_szam: z.string().trim().max(50).nullable().optional(),
  c_tombhaz: z.string().trim().max(50).nullable().optional(),
  c_lepcsohaz: z.string().trim().max(50).nullable().optional(),
  c_emelet: z.string().trim().max(50).nullable().optional(),
  c_ajto: z.string().trim().max(50).nullable().optional(),

  // Elérhetőség
  telefon: z.string().trim().max(50).nullable().optional(),
  email: z
    .string()
    .trim()
    .max(200)
    .refine(
      (v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      { message: 'Érvénytelen e-mail-formátum.' },
    )
    .nullable()
    .optional(),

  // Identitás
  vallas: z.string().trim().max(80).nullable().optional(),
  foglalkozas: z.string().trim().max(200).nullable().optional(),
  nemzetiseg: z.string().trim().max(80).nullable().optional(),

  // Admin-jellegű (csak bizonyos szerepkörök — a UI-oldalon szűkítjük)
  csaladfo: z.boolean().optional(),
  voter_eligible: z.boolean().optional(),
  meghalt: z.boolean().optional(),
  member_status: z.string().trim().max(40).nullable().optional(),

  // Soft-delete — az M8.2 "Elrejtés / Visszahozás" toggle (a tagsági jelzés
  // független: ez csak lista-megjelenítés)
  isvisible: z.boolean().optional(),

  // Megjegyzés
  megjegyzes: z.string().trim().max(2000).nullable().optional(),
})
export type SzemelyUpdateInput = z.infer<typeof szemelyUpdateInputSchema>

/**
 * Üres-string → null normalizálás. A HTML input-ok üres stringet adnak,
 * de a Supabase-oldali UPDATE-nek NULL-t szeretnénk küldeni, hogy a mező
 * tényleg törölhető legyen. A patch-ben csak a változott mezőket tartjuk meg.
 */
export function normalizeSzemelyPatch(
  patch: SzemelyUpdateInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (typeof value === 'string' && value.trim() === '') {
      out[key] = null
    } else {
      out[key] = value
    }
  }
  return out
}
