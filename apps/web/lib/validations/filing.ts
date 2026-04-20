import { z } from 'zod'
import { FILING_DIRECTIONS, FILING_FOLDERS } from '@/lib/constants/filing'

export const filingEntrySchema = z.object({
  id: z.string().optional(), // uuid PK
  direction: z.enum(FILING_DIRECTIONS, { message: 'Válasszon irányt' }),
  kelt: z.string().min(1, 'A dátum kötelező'),
  subject: z.string().min(1, 'A tárgy kötelező'),
  sender_or_recipient: z.string().nullable().optional(),
  file_folder: z.enum(FILING_FOLDERS, { message: 'Válasszon mappát' }),
  targykivonat: z.string().nullable().optional(),
  elintezes_ideje: z.string().nullable().optional(),
  elintezes_modja: z.string().nullable().optional(),
  irattarijel: z.string().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
})
export type FilingEntryInput = z.infer<typeof filingEntrySchema>
