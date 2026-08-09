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

// A Konkordancia 2026-08-09-től NATÍV (beépített Károli-korpusz, kliens-oldali
// kereséssel — konkordancia-dialog.tsx); a korábbi szentiras.eu proxy-típusok
// kivezetve.
