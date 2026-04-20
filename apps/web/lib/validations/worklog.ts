import { z } from 'zod'

// FONTOS: a mezőnevek a valódi DB séma (munkanaplo tábla) szerintiek.
// `leiras`/`resztvevok_*`/`igehely`/`szolgalatvezeto`/`id_szemely`/`id_csalad`
// helyett `bibliaolvasas`/`alapige`/`enekek`/`jelenlet_*`/`szolgalt`/`mediapath`.

export const worklogSchema = z.object({
  id: z.number().optional(),
  idopont: z.string().min(1, 'A dátum kötelező'),
  jellege: z.string().min(1, 'A típus kötelező'),
  kategoria: z.string().nullable().optional().default('szolgalat'),
  id_jellege: z.string().nullable().optional(),
  bibliaolvasas: z.string().nullable().optional(),
  alapige: z.string().nullable().optional(),
  cim: z.string().nullable().optional(),
  enekek: z.string().nullable().optional(),
  jelenlet_ferfi: z.number().min(0).nullable().optional(),
  jelenlet_no: z.number().min(0).nullable().optional(),
  jelenlet_gyermek: z.number().min(0).nullable().optional(),
  jelenlet_osszesen: z.number().min(0).optional().default(0),
  szolgalt: z.string().nullable().optional(),
  persely: z.number().min(0).nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
  mediapath: z.string().nullable().optional(),
  du: z.boolean().optional().default(false),
})

export type WorklogInput = z.input<typeof worklogSchema>
