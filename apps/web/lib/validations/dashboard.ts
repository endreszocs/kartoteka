import { z } from 'zod'
import { PROGRAM_TYPES, PROGRAM_PRIORITIES, ISMETLODES_TYPES } from '@/lib/constants/dashboard'

const programBase = z.object({
  // 2026-08-25: '' is érvényes (= új program). A dialógus rejtett id-mezője
  // új programnál üres sztringet ad — a szigorú uuid-séma ezen NÉMÁN elbukott
  // (az id-nek nincs kirajzolt hibaüzenete), és a Mentés gomb „nem csinált
  // semmit". A saveProgram `if (d.id)` ága az ''-t amúgy is új programként
  // kezeli.
  id: z.string().uuid().optional().or(z.literal('')),
  cim: z.string().min(1, 'A program neve kötelező'),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum formátum'),
  datum_vege: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  ido_kezdes: z.string().optional().or(z.literal('')),
  ido_befejezes: z.string().optional().or(z.literal('')),
  helyszin: z.string().optional().or(z.literal('')),
  tipus: z.enum(PROGRAM_TYPES, { message: 'Érvénytelen típus' }),
  prioritas: z.enum(PROGRAM_PRIORITIES, { message: 'Érvénytelen prioritás' }),
  ismetlodes_tipus: z.enum(ISMETLODES_TYPES).optional().or(z.literal('')),
  // 2026-08-26 (5. kör): a sorozat záró napja — e nélkül a heti sorozat
  // „örökre futott" (nem volt modellezhető a vége).
  ismetlodes_vege: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  // 2026-08-26 (5. kör): megjelenhet a gyülekezet nyilvános weboldalán.
  publikus: z.boolean().optional(),
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
