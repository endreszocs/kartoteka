import { z } from 'zod'
import { FILING_DIRECTIONS, FILING_FOLDERS } from '@/lib/constants/filing'

export const filingEntrySchema = z.object({
  id: z.string().optional(), // uuid PK
  direction: z.enum(FILING_DIRECTIONS, { message: 'Válasszon irányt' }),
  kelt: z.string().min(1, 'A dátum kötelező'),
  subject: z.string().min(1, 'A tárgy kötelező'),
  sender_or_recipient: z.string().nullable().optional(),
  /** LEGACY (2024 előtti rekordok), opcionális. */
  file_folder: z.enum(FILING_FOLDERS).nullable().optional(),
  targykivonat: z.string().nullable().optional(),
  elintezes_ideje: z.string().nullable().optional(),
  elintezes_modja: z.string().nullable().optional(),
  irattarijel: z.string().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),

  // ─── 2026-05-28: EREK 2024-es ügykörjegyzék szerinti új mezők ───
  external_ref_szam: z.string().nullable().optional(),
  external_ref_kelt: z.string().nullable().optional(),
  beerkezes_ideje: z.string().nullable().optional(),
  mellekletek_szama: z.number().int().min(0).nullable().optional(),
  valasz_iktatoszam: z.string().nullable().optional(),
  ugykor_kod: z.string().nullable().optional(),
  retention_type: z.enum(['F.Á.', 'É.Á.']).nullable().optional(),
})

export type FilingEntryInput = z.infer<typeof filingEntrySchema>
