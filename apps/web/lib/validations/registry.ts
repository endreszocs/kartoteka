import { z } from 'zod'
import { MOVEMENT_TYPES } from '@/lib/constants/registry'

export const baptismSchema = z.object({
  id: z.number().optional(),
  id_szemely: z.number({ message: 'Válasszon személyt' }),
  datum: z.string().min(1, 'A dátum kötelező'),
  okirat: z.string().nullable().optional(),
  egyhazi_szam: z.string().nullable().optional(),
  helyid: z.number().nullable().optional(),
  lelkeszneve: z.string().nullable().optional(),
  keresztszulok: z.string().nullable().optional(),
  alapige: z.string().nullable().optional(),
  apjaneve: z.string().nullable().optional(),
  anyjaneve: z.string().nullable().optional(),
  id_apja_cnp: z.string().nullable().optional(),
  id_anyja_cnp: z.string().nullable().optional(),
  apa_vallas: z.string().nullable().optional(),
  anya_vallas: z.string().nullable().optional(),
  anya_leanyneve: z.string().nullable().optional(),
  munkanaploba: z.boolean().default(false),
  megjegyzes: z.string().nullable().optional(),
})
export type BaptismInput = z.infer<typeof baptismSchema>

export const confirmationBatchSchema = z.object({
  datum: z.string().min(1, 'A dátum kötelező'),
  lelkeszneve: z.string().nullable().optional(),
  egyhazi_szam: z.string().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
  munkanaploba: z.boolean().default(false),
  candidates: z.array(z.number()).min(1, 'Minimum 1 konfirmandus szükséges'),
})
export type ConfirmationBatchInput = z.infer<typeof confirmationBatchSchema>

// Egyetlen konfirmáció szerkesztéséhez (a táblázat ✏️ gombja).
export const confirmationSingleSchema = z.object({
  id: z.number(),
  id_szemely: z.number({ message: 'Válasszon személyt' }),
  datum: z.string().min(1, 'A dátum kötelező'),
  egyhazi_szam: z.string().nullable().optional(),
  lelkeszneve: z.string().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
})
export type ConfirmationSingleInput = z.infer<typeof confirmationSingleSchema>

export const marriageSchema = z.object({
  id: z.number().optional(),
  id_ferfi: z.number({ message: 'Válasszon vőlegényt' }),
  id_no: z.number({ message: 'Válasszon menyasszonyt' }),
  datum: z.string().min(1, 'A dátum kötelező'),
  hlevel: z.string().nullable().optional(),
  egyhazi_szam: z.string().nullable().optional(),
  lelkeszneve: z.string().nullable().optional(),
  tanuk: z.string().nullable().optional(),
  helyid: z.number().nullable().optional(),
  vegyes: z.boolean().optional(),
  megjegyzes: z.string().nullable().optional(),
  munkanaploba: z.boolean().default(false),
  // 2026-05-30: emléklap-specifikus, opcionális adatok. A hazassag táblában
  // nincs külön oszlop nekik, ezért a megjegyzes-be sablon JSON-ként
  // perzisztáljuk (saveMarriage action ezt összerakja).
  husband_birth_place: z.string().nullable().optional(),
  wife_birth_place: z.string().nullable().optional(),
  verse_text: z.string().nullable().optional(),
  verse_reference: z.string().nullable().optional(),
})
export type MarriageInput = z.input<typeof marriageSchema>

export const burialSchema = z.object({
  id: z.number().optional(),
  id_szemely: z.number({ message: 'Válasszon személyt' }),
  hdatum: z.string().min(1, 'A halál dátuma kötelező'),
  tdatum: z.string().min(1, 'A temetés dátuma kötelező'),
  hoka: z.string().nullable().optional(),
  okirat: z.string().nullable().optional(),
  egyhazi_szam: z.string().nullable().optional(),
  hhelyid: z.number().nullable().optional(),
  thelyid: z.number().nullable().optional(),
  lelkeszneve: z.string().nullable().optional(),
  munkanaploba: z.boolean().default(false),
  megjegyzes: z.string().nullable().optional(),
  // 2026-05-30: gyászjelentés-specifikus mezők — a temetes táblának nincs
  // saját oszlopa rájuk, ezért a megjegyzes mezőben sablon JSON-ként
  // tárolódnak (a baptism mintára: `|sablon:{...}` suffix).
  funeral_time: z.string().nullable().optional(),
  funeral_place: z.string().nullable().optional(),
  vigil_date: z.string().nullable().optional(),
  vigil_time: z.string().nullable().optional(),
  vigil_place: z.string().nullable().optional(),
  verse_text: z.string().nullable().optional(),
  verse_reference: z.string().nullable().optional(),
  relative_relation: z.string().nullable().optional(),
  mourners: z.string().nullable().optional(),
})
export type BurialInput = z.infer<typeof burialSchema>

export const movementSchema = z.object({
  id: z.number().optional(),
  tipus: z.enum(MOVEMENT_TYPES),
  id_szemely: z.number({ message: 'Válasszon személyt' }),
  datum: z.string().min(1, 'A dátum kötelező'),
  helyid: z.number().nullable().optional(),
  felekezet: z.string().nullable().optional(),
  igazolas: z.string().nullable().optional(),
  egyhazi_szam: z.string().nullable().optional(),
  hova_congregation_id: z.string().nullable().optional(),
  kulfoldre: z.boolean().optional(),
  megjegyzes: z.string().nullable().optional(),
})
export type MovementInput = z.infer<typeof movementSchema>
