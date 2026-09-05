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
  // 2026-08-27: a LÁTOGATÓNAK szánt ismertető. Ez kerül ki a nyilvános
  // weboldalra (ha a program publikus); a `megjegyzes` továbbra sem.
  // A hossz korlátozva: ez egy naptár-bejegyzés ismertetője, nem cikk.
  leiras: z.string().max(2000, 'A leírás legfeljebb 2000 karakter lehet.').optional().or(z.literal('')),
  megjegyzes: z.string().optional().or(z.literal('')),
})

/**
 * 2026-09-05: a KÖZÖS sorrend-szabályok — egy helyen a sima és a tömeges séma
 * számára (a két refine eddig másolat volt).
 *  · datum_vege >= datum (ez volt eddig is);
 *  · ismetlodes_vege >= datum — e nélkül a sorozat 0 alkalommal bomlott ki, és
 *    a program MINDEN nézetből némán eltűnt (a felmérés P1-találata);
 *  · egynapos alkalomnál ido_befejezes >= ido_kezdes — az ICS különben
 *    éjszakába nyúlónak vette, az agenda „20:00–08:00"-t írt. Többnapos
 *    programnál (datum_vege > datum) az átnyúlás megengedett.
 */
function programSorrendSzabalyok(data: z.infer<typeof programBase>, ctx: z.RefinementCtx): void {
  if (data.datum_vege && data.datum_vege < data.datum) {
    ctx.addIssue({ code: 'custom', message: 'A záró dátum nem lehet a kezdő dátum előtt', path: ['datum_vege'] })
  }
  if (data.ismetlodes_tipus && data.ismetlodes_vege && data.ismetlodes_vege < data.datum) {
    ctx.addIssue({ code: 'custom', message: 'Az ismétlődés vége nem lehet az első alkalom előtt', path: ['ismetlodes_vege'] })
  }
  const egynapos = !data.datum_vege || data.datum_vege === data.datum
  if (egynapos && data.ido_kezdes && data.ido_befejezes && data.ido_befejezes < data.ido_kezdes) {
    ctx.addIssue({ code: 'custom', message: 'A befejezés nem lehet a kezdés előtt (egynapos alkalomnál)', path: ['ido_befejezes'] })
  }
}

export const programSchema = programBase.superRefine(programSorrendSzabalyok)
export type ProgramInput = z.infer<typeof programSchema>

export const batchRowSchema = programBase.omit({ id: true }).superRefine(programSorrendSzabalyok)
export type BatchRowInput = z.infer<typeof batchRowSchema>
