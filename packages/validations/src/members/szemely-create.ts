/**
 * szemely-create zod sémák — M8.1 (2026-04-24).
 *
 * Az új-tag INSERT input-sémája. Kötelező mezők: `cnp`, `csaladnev` (vagy
 * `szcs_nev`), `k_nev`, `sz_datum`, `ferfi`, `congregation_id`. A többi
 * opcionális és a `szemelyUpdateInputSchema`-val kompatibilis.
 *
 * A CNP román személyi azonosító — 13 számjegy, checksum-algoritmussal
 * validált. Részletek: `validateRomanianCnp` helper.
 */

import { z } from 'zod'

/**
 * Román CNP checksum ellenőrzés.
 *
 * Formátum: 13 számjegy.
 *   - [0]      — nem nulla: nem (1/3/5/7 férfi, 2/4/6/8 nő, 9 külföldi)
 *   - [1-6]    — születési dátum YYMMDD (nem teljes évvel, de a [0] századot ad)
 *   - [7-8]    — megye-kód (01-52)
 *   - [9-11]   — sorrend-szám
 *   - [12]     — checksum
 *
 * Checksum: `sum(digit[i] * weight[i] for i in 0..11) mod 11`,
 * ahol `weight = [2,7,9,1,4,6,3,5,8,2,7,9]`; ha az eredmény 10 → 1.
 *
 * Forrás: https://ro.wikipedia.org/wiki/Cod_numeric_personal_(Rom%C3%A2nia)
 */
export function validateRomanianCnp(cnp: string): boolean {
  if (!/^\d{13}$/.test(cnp)) return false
  if (cnp[0] === '0') return false

  // Hó (pozíció 3-4): 01-12; nap (5-6): 01-31 — alap sanity, nem naptár-precíz
  const month = Number(cnp.slice(3, 5))
  const day = Number(cnp.slice(5, 7))
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false

  const weights = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9]
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(cnp[i]) * weights[i]
  let control = sum % 11
  if (control === 10) control = 1
  return control === Number(cnp[12])
}

/**
 * Új tag input-séma. A `szemelyUpdateInputSchema` szuperszete a kötelező
 * mezőkkel. A szemely-save (M8.0b) teljesen opcionális, itt a create-nél
 * csak a minimális identity-mezők kötelezők.
 */
export const szemelyCreateInputSchema = z.object({
  // Kötelező identity
  congregation_id: z.string().uuid('A gyülekezet-azonosító érvénytelen.'),
  cnp: z
    .string()
    .trim()
    .refine((v) => /^\d{13}$/.test(v), 'A CNP pontosan 13 számjegy.')
    .refine(validateRomanianCnp, 'A CNP ellenőrző számjegye nem stimmel.'),
  k_nev: z.string().trim().min(1, 'A keresztnév kötelező.').max(100),
  csaladnev: z.string().trim().min(1, 'A családnév kötelező.').max(100),
  sz_datum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Születési dátum formátum: YYYY-MM-DD'),
  ferfi: z.boolean(),

  // Opcionális név-változatok
  szcs_nev: z.string().trim().max(100).nullable().optional(),
  ferjk_nev: z.string().trim().max(100).nullable().optional(),
  allapot: z.string().trim().max(40).nullable().optional(),

  // Származás
  apjaneve: z.string().trim().max(200).nullable().optional(),
  anyjaneve: z.string().trim().max(200).nullable().optional(),
  id_apja: z.string().trim().max(13).nullable().optional(),
  id_anyja: z.string().trim().max(13).nullable().optional(),

  // Cím (szöveges)
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

  // Adminisztratív flag-ek (egyelőre default-álható)
  csaladfo: z.boolean().optional().default(false),
  voter_eligible: z.boolean().optional().default(false),
  /** 2026-07-24 (PR-8): kézi választói felülbírálás létrehozáskor (null=auto). */
  voter_manual_override: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
  meghalt: z.boolean().optional().default(false),
  member_status: z.string().trim().max(40).nullable().optional().default('aktív'),
  isvisible: z.boolean().optional().default(true),

  // Család-hozzárendelés (opcionális)
  family_id: z.string().uuid().nullable().optional(),

  // Egyéb
  type: z.string().trim().max(40).nullable().optional().default('normal'),
  megjegyzes: z.string().trim().max(2000).nullable().optional(),
})
export type SzemelyCreateInput = z.infer<typeof szemelyCreateInputSchema>

/**
 * Üres-string → null normalizálás a create-payloadhoz, a
 * `normalizeSzemelyPatch` create-megfelelője.
 */
export function normalizeSzemelyCreate(
  input: SzemelyCreateInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    if (typeof value === 'string' && value.trim() === '') {
      out[key] = null
    } else {
      out[key] = value
    }
  }
  return out
}

/**
 * Lokális pending-sor a `szemely_pending_local` SQLite-tábláról olvasva.
 * A sync-status-indicator és a pending-lista használja.
 */
export const szemelyPendingRowSchema = z.object({
  id: z.string(), // 'local-<uuid>'
  server_id: z.number().int().nullable(),
  congregation_id: z.string(),
  cnp: z.string(),
  csaladnev: z.string().nullable(),
  k_nev: z.string().nullable(),
  ferjk_nev: z.string().nullable(),
  sz_datum: z.string().nullable(),
  ferfi: z.number().int().min(0).max(1),
  userid: z.string(),
  sync_state: z.enum(['pending', 'synced', 'conflict']),
  sync_error: z.string().nullable(),
  retry_count: z.number().int().nonnegative(),
  created_at: z.string(),
})
export type SzemelyPendingRow = z.infer<typeof szemelyPendingRowSchema>
