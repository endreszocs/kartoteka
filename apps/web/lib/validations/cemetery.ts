import { z } from 'zod'
import { PLOT_STATUSES } from '@/lib/constants/cemetery'

// Zod schemák a sirhely modulhoz — a valódi DB séma oszlopneveivel.

export const cemeterySchema = z.object({
  id: z.number().optional(),
  nev: z.string().min(1, 'A temető neve kötelező'),
  cim: z.string().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
  aktiv: z.boolean().optional().default(true),
})
// z.input lehetővé teszi az opcionális mezők elhagyását (a default-os mezők is)
export type CemeteryInput = z.input<typeof cemeterySchema>

export const plotSchema = z.object({
  id: z.number().optional(),
  temetoid: z.number({ message: 'Válasszon temetőt' }),
  parcella: z.string().min(1, 'A parcella kötelező'),
  sor: z.number({ message: 'A sor kötelező és szám' }),
  szam: z.string().min(1, 'A szám kötelező'),
  allapot: z.enum(PLOT_STATUSES),
  elhelyezkedes: z.string().nullable().optional(),
  meret: z.string().nullable().optional(),
  tipus: z.string().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
  gps_lat: z.number().nullable().optional(),
  gps_lng: z.number().nullable().optional(),
})
export type PlotInput = z.input<typeof plotSchema>

export const rentalSchema = z.object({
  id: z.number().optional(),
  sirhelyid: z.number(),
  befizetesid: z.number().nullable().optional(),
  berlo: z.string().min(1, 'A bérlő neve kötelező'),
  berloid: z.number().nullable().optional(),
  berlocim: z.string().nullable().optional(),
  berloelerhetoseg: z.string().nullable().optional(),
  megvaltas: z.string().min(1, 'A megváltás (kezdet) dátum kötelező'),
  lejarata: z.string().nullable().optional(),
  tipus: z.enum(['berles', 'megvaltas']).optional().default('berles'),
  osszeg: z.number().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
})
export type RentalInput = z.input<typeof rentalSchema>

export const deceasedSchema = z.object({
  id: z.number().optional(),
  sirhelyid: z.number(),
  temetesid: z.number().nullable().optional(),
  nev: z.string().min(1, 'A név kötelező'),
  sznev: z.string().nullable().optional(),
  ferfi: z.boolean().nullable().optional(),
  sz_datum: z.string().nullable().optional(),
  sz_hely: z.string().nullable().optional(),
  anyjaneve: z.string().nullable().optional(),
  hdatum: z.string().nullable().optional(),
  hhely: z.string().nullable().optional(),
  tdatum: z.string().nullable().optional(),
  ttipus: z.string().nullable().optional(),
  tmodja: z.string().nullable().optional(),
  elhelyezkedes: z.string().nullable().optional(),
  temetteto: z.string().nullable().optional(),
  szolgaltato: z.string().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
})
export type DeceasedInput = z.input<typeof deceasedSchema>
