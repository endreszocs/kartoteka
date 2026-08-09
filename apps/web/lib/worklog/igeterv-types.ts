/**
 * Igehirdetési terv — megosztott típusok (2026-08-09).
 * Külön fájl, mert a 'use server' action-fájl csak async függvényt exportálhat.
 */

export type IgetervNapszak = 'de' | 'du' | 'este'

export interface SermonPlan {
  id: string
  datum: string // YYYY-MM-DD
  napszak: IgetervNapszak
  alkalom: string | null
  cim: string | null
  textus: string | null
  bibliaolvasas: string | null
  enekek: string | null
  szolgalattevo: string | null
  megjegyzes: string | null
  emlekeztetoNapok: number | null
  emlekeztetoElkuldve: string | null
  munkanaploId: number | null
  programId: string | null
  updatedAt: string | null
}

export interface SermonPlanInput {
  id?: string
  datum: string
  napszak: IgetervNapszak
  alkalom?: string | null
  cim?: string | null
  textus?: string | null
  bibliaolvasas?: string | null
  enekek?: string | null
  szolgalattevo?: string | null
  megjegyzes?: string | null
  emlekeztetoNapok?: number | null
  /** true = jelenjen meg a gyülekezeti naptárban is (gyulekezeti_programok). */
  naptarban?: boolean
}

export interface SermonPlanListResult {
  plans?: SermonPlan[]
  /** true = a 2026-08-09-igehirdetesi-terv.sql migráció még nincs lefuttatva. */
  needsSql?: boolean
  /** Az oldalbetöltéskor kiküldött emlékeztetők száma (app-értesítés). */
  remindersSent?: number
  error?: string
}

// ── Konkordancia (szentiras.eu) ─────────────────────────────────────────────

export interface KonkordanciaHit {
  /** Igehely (pl. 'Jn 3,16'). */
  ref: string
  /** A vers szövege. */
  text: string
  /** A fordítás rövidítése (pl. 'RUF', 'KG'). */
  translation: string | null
}

export interface KonkordanciaResult {
  hits?: KonkordanciaHit[]
  totalCount?: number | null
  /** true = nincs beállítva a SZENTIRAS_API_KEY környezeti változó. */
  needsKey?: boolean
  error?: string
}

export interface IgehelyResult {
  ref?: string
  verses?: Array<{ ref: string; text: string }>
  translation?: string | null
  needsKey?: boolean
  error?: string
}
