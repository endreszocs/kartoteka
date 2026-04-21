import { z } from 'zod'
import { PROGRAM_TYPES, PROGRAM_PRIORITIES, ISMETLODES_TYPES } from '@/lib/constants/dashboard'

const programBase = z.object({
  id: z.string().uuid().optional(),
  cim: z.string().min(1, 'A program neve kötelező'),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum formátum'),
  datum_vege: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  ido_kezdes: z.string().optional().or(z.literal('')),
  ido_befejezes: z.string().optional().or(z.literal('')),
  helyszin: z.string().optional().or(z.literal('')),
  tipus: z.enum(PROGRAM_TYPES, { message: 'Érvénytelen típus' }),
  prioritas: z.enum(PROGRAM_PRIORITIES, { message: 'Érvénytelen prioritás' }),
  ismetlodes_tipus: z.enum(ISMETLODES_TYPES).optional().or(z.literal('')),
  egyedi_tipus_nev: z.string().optional().or(z.literal('')),
  egyedi_emoji: z.string().optional().or(z.literal('')),
  megjegyzes: z.string().optional().or(z.literal('')),
})

export const programSchema = programBase.refine(
  (data) => !(data.datum_vege && data.datum_vege < data.datum),
  { message: 'A záró dátum nem lehet a kezdő dátum előtt', path: ['datum_vege'] }
)
export type ProgramInput = z.infer<typeof programSchema>

export const batchRowSchema = programBase.omit({ id: true }).refine(
  (data) => !(data.datum_vege && data.datum_vege < data.datum),
  { message: 'A záró dátum nem lehet a kezdő dátum előtt', path: ['datum_vege'] }
)
export type BatchRowInput = z.infer<typeof batchRowSchema>
