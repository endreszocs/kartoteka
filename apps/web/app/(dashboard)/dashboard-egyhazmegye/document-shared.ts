/**
 * Hivatalos dokumentum-központ — megosztott típusok (2026-08-09).
 *
 * Külön fájl, mert a Next.js 16 'use server' szabálya szerint az action-fájl
 * (document-actions.ts) csak async függvényt exportálhat (típust/konstanst nem).
 */

import type { DocumentSubmission } from '@/lib/constants/documents'

/** A hatókör egy gyülekezete — a teljességi mátrix sora. */
export interface DocumentCenterCongregation {
  id: string
  name: string
  dioceseId: string | null
  /** Kerületi nézetben az egyházmegye neve (csoportosításhoz / alcímhez). */
  dioceseName: string | null
}

/**
 * A dokumentumközpont teljes adatcsomagja (getSubmissionMatrix eredménye).
 *
 * A `congregations` a hatókör TELJES gyülekezet-listája (nem a beküldésekből
 * származtatva!) — így a „ki nem adta be" kérdés megválaszolható (a régi
 * mátrix csak a beküldőket mutatta, diagnosztika #7).
 * A `submissions` MINDEN évet tartalmaz (év-kulcsolási hiba, diagnosztika #5:
 * a vagyonleltár year-1 kulcsú, a januári számadás az előző évhez tartozik) —
 * az év-szűrés a felületen történik.
 */
export interface DocumentCenterData {
  congregations: DocumentCenterCongregation[]
  submissions: DocumentSubmission[]
  /** A beküldésekben előforduló évek (csökkenő) + az aktuális és előző év. */
  years: number[]
  /** Feliratozott rendszergazdai (szűretlen) nézet jelzése — null = saját hatókör. */
  scopeNotice: string | null
  /** Fail-closed hibaüzenet (nincs feloldható hatókör / lekérdezési hiba). */
  error?: string
}

/** Egységes akció-eredmény ({ error } magyar szöveggel). */
export interface DocumentActionResult {
  success?: boolean
  error?: string
}
