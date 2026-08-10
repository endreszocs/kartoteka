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
 * A `submissions` a BETÖLTÖTT évek beküldéseit tartalmazza — 2026-08-11
 * (5. kör, P2-#19) óta ez alapból a beszámolási szezon éve + az azt megelőző
 * év + a naptári év (lásd `loadedYears`), nem pedig az EGÉSZ archívum. Az
 * év-kulcsolási hiba (diagnosztika #5: a vagyonleltár year-1 kulcsú, a
 * januári számadás az előző évhez tartozik) így is kezelve marad, mert a
 * releváns évek mind benne vannak; a régebbi évek a felületen, kérésre
 * töltődnek (getSubmissionsForYear).
 *
 * A beküldések `snapshot_data` mezője a LISTA-lekérdezésben NINCS benne
 * (évente több MB jsonb utazott a böngészőbe egy ritkán kinyitott
 * részletkártyáért) — a pillanatképet a snapshot-néző kéri le külön
 * (getSubmissionSnapshot).
 */
export interface DocumentCenterData {
  congregations: DocumentCenterCongregation[]
  submissions: DocumentSubmission[]
  /** A beküldésekben előforduló ÖSSZES év (csökkenő) + az aktuális és előző év. */
  years: number[]
  /** Mely évek beküldései utaztak ténylegesen a `submissions`-ben. */
  loadedYears?: number[]
  /** A hatókör beküldéseinek TELJES darabszáma (minden évből) — az archívum-felirathoz. */
  totalCount?: number
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
