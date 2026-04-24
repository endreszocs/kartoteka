/**
 * szemely-list zod sémák — M8.0a (2026-04-25).
 *
 * A `szemely_local` tábla (Rust v3+, OS-M7-ben pull-elve) lokál cache-éből
 * olvasott sorok shape-je. A desktop tagnyilvántartás-page (`members-page`)
 * ezeket listázza, szűri, kereshetővé teszi.
 *
 * Online-ag (későbbi M8.0b/c) a `szemely` tábla közvetlen olvasása + write —
 * de első iterációban offline-first: a már szinkronizált lokál cache-ből
 * dolgozunk.
 */

import { z } from 'zod'

/** A `szemely_local` SQLite-sor a lényegi mezőkkel. Integer-bool-ok 0/1. */
export const szemelyListRowSchema = z.object({
  id: z.number().int().nonnegative(),
  cnp: z.string(),
  szcs_nev: z.string().nullable(),
  k_nev: z.string().nullable(),
  csaladnev: z.string().nullable(),
  ferjk_nev: z.string().nullable(),
  allapot: z.string().nullable(),
  sz_datum: z.string().nullable(),               // ISO 'YYYY-MM-DD'
  ferfi: z.number().int().min(0).max(1),
  csaladfo: z.number().int().min(0).max(1),
  meghalt: z.number().int().min(0).max(1),
  member_status: z.string().nullable(),
  apjaneve: z.string().nullable(),
  anyjaneve: z.string().nullable(),
  c_szam: z.string().nullable(),
  c_tombhaz: z.string().nullable(),
  c_lepcsohaz: z.string().nullable(),
  c_ajto: z.string().nullable(),
  c_emelet: z.string().nullable(),
  c_szcim: z.string().nullable(),
  telefon: z.string().nullable(),
  email: z.string().nullable(),
  vallas: z.string().nullable(),
  foglalkozas: z.string().nullable(),
  nemzetiseg: z.string().nullable(),
  voter_eligible: z.number().int().min(0).max(1),
  congregation_id: z.string().nullable(),
  family_id: z.string().nullable(),
  type: z.string().nullable(),
  isvisible: z.number().int().min(0).max(1),
  megjegyzes: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  updated_at: z.string(),
})
export type SzemelyListRow = z.infer<typeof szemelyListRowSchema>

/** Status-szűrő opciók a UI-on (a webapp `MEMBER_STATUS_FILTERS` mintájára). */
export const SZEMELY_STATUS_FILTER_VALUES = [
  'mind',
  'aktiv',
  'meghalt',
  'rejtett',
] as const
export const szemelyStatusFilterSchema = z.enum(SZEMELY_STATUS_FILTER_VALUES)
export type SzemelyStatusFilter = z.infer<typeof szemelyStatusFilterSchema>

export const SZEMELY_STATUS_FILTER_LABELS: Record<SzemelyStatusFilter, string> = {
  mind: 'Mind',
  aktiv: 'Aktív',
  meghalt: 'Meghalt',
  rejtett: 'Rejtett',
}

/** Listázás-input — a backend listLocalSzemely(...)-be megy. */
export const szemelyListInputSchema = z.object({
  congregationId: z.string().min(1),
  /** Diakritika-toleráns kereső (csaladnev + k_nev + ferjk_nev + cím). */
  search: z.string().optional(),
  statusFilter: szemelyStatusFilterSchema.optional().default('aktiv'),
  /** Default 'csaladnev-asc' — a webapp megszokottja. */
  orderBy: z
    .enum([
      'csaladnev-asc',
      'csaladnev-desc',
      'sz_datum-asc',
      'sz_datum-desc',
      'id-desc',
    ])
    .optional()
    .default('csaladnev-asc'),
  limit: z.number().int().positive().max(2000).optional().default(500),
})
export type SzemelyListInput = z.infer<typeof szemelyListInputSchema>
