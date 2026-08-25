import { z } from 'zod'

// FONTOS: a mezőnevek a valódi DB séma (munkanaplo tábla) szerintiek.
// `leiras`/`resztvevok_*`/`igehely`/`szolgalatvezeto`/`id_szemely`/`id_csalad`
// helyett `bibliaolvasas`/`alapige`/`enekek`/`jelenlet_*`/`szolgalt`/`mediapath`.

export const worklogSchema = z.object({
  id: z.number().optional(),
  // 2026-07-11 (konkurencia): optimista zároláshoz — szerkesztéskor a kliens
  // visszaküldi a betöltött revision-t, a mentés csak azonos revision mellett fut.
  revision: z.number().int().nonnegative().optional(),
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
  // 2026-07-11 (F2): napszak — a legacy `du` boolean finomítása (de/du/este).
  // A `du`-val szinkronban tartjuk: du = napszak 'du' VAGY 'du2' (saveWorklog).
  // 2026-08-14 (18. pont): + de2/du2 — a második de./du. alkalom (EREK 2.2).
  napszak: z.enum(['de', 'du', 'este', 'de2', 'du2']).nullable().optional(),
  // Úrvacsorázók száma — templomban / betegnél (csak szolgálat kategóriánál értelmezett).
  uv_templomban: z.number().int('Az úrvacsorázók száma egész szám legyen').min(0, 'Az úrvacsorázók száma nem lehet negatív').nullable().optional(),
  uv_betegnel: z.number().int('Az úrvacsorázók száma egész szám legyen').min(0, 'Az úrvacsorázók száma nem lehet negatív').nullable().optional(),
  // 2026-08-25 (gyülekezeti egységek): az alkalom helyszíne — gyulekezeti_egysegek
  // sor uuid-ja; null = anyaközpont. `undefined` = a kliens nem küldte (a mentés
  // ilyenkor NEM nyúl az oszlophoz — lásd a saveWorklog mediapath-mintáját).
  egyseg_id: z.string().uuid('Érvénytelen egység-azonosító').nullable().optional(),
})

export type WorklogInput = z.input<typeof worklogSchema>
