/**
 * gyerek-save zod sémák — M8.3d (2026-04-24).
 *
 * A `gyerek` tábla junction a csalad ↔ szemely kapcsolathoz.
 * Csak két művelet van: hozzáadás (új gyerek a családhoz) és eltávolítás.
 * Nincs update — ha egy gyerek átkerül másik családba, az egy delete + insert
 * kombó.
 */

import { z } from 'zod'

export const gyerekAddInputSchema = z.object({
  id_csalad: z.number().int().positive(),
  id_szemely: z.number().int().positive(),
})
export type GyerekAddInput = z.infer<typeof gyerekAddInputSchema>

export const gyerekRemoveInputSchema = z.object({
  id_gyerek: z.number().int().positive(),
})
export type GyerekRemoveInput = z.infer<typeof gyerekRemoveInputSchema>
