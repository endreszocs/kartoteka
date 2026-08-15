/**
 * Dokumentum típusok és konstansok a workflow rendszerhez.
 * Külön fájlban, mert 'use server' fájlból nem exportálható const/type.
 */

export type DocumentType =
  | 'szamadas'
  | 'koltsegvetes'
  | 'koltsegvetes_modositas'
  | 'vagyonleltar'
  | 'valasztok_nevjegyzeke'
  // 2026-07-16 (F5): éves hivatalos lelkészi jelentés (I–X. fejezet) beküldése
  // az egyházmegyének — a document_submissions.document_type-on nincs CHECK,
  // a migráció (2026-07-16-f5-lelkeszi-jelentes.sql) dokumentálja az értéket.
  | 'lelkeszi_jelentes'

// 2026-08-09: + 'returned' — az egyházmegye visszaküldheti a dokumentumot a
// gyülekezetnek javításra (kötelező indoklással, a notes oszlopba naplózva).
// A táblán nincs CHECK a status oszlopon — az érték app-oldali konvenció.
export type DocumentStatus = 'submitted' | 'received' | 'reviewed' | 'finalized' | 'returned'

export interface DocumentSubmission {
  id: string
  congregation_id: string
  congregation_name?: string
  /** 2026-08-09: kerületi nézetben a gyülekezet egyházmegyéjének neve. */
  diocese_name?: string | null
  diocese_id: string | null
  year: number
  document_type: DocumentType
  modification_number: number | null
  status: DocumentStatus
  submitted_at: string
  // 2026-08-09: a teljes workflow-idővonal a dokumentumközpontban látszik
  received_at?: string | null
  reviewed_at?: string | null
  finalized_at: string | null
  forwarded_to_kerulet: boolean
  forwarded_at?: string | null
  /** A beküldött fagyasztott pillanatkép (a snapshot-nézőben jelenik meg). */
  snapshot_data?: Record<string, unknown> | null
  notes: string | null
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  szamadas: 'Számadás',
  koltsegvetes: 'Költségvetés',
  koltsegvetes_modositas: 'Költségvetés módosítás',
  vagyonleltar: 'Vagyonleltári jelentés',
  valasztok_nevjegyzeke: 'Választók névjegyzéke',
  lelkeszi_jelentes: 'Lelkészi jelentés',
}

// 2026-08-09: magyar státusz-címkék a dokumentumközponthoz (mindkét szint).
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  submitted: 'Beküldve',
  received: 'Átvéve',
  reviewed: 'Ellenőrizve',
  finalized: 'Véglegesítve',
  returned: 'Visszaküldve',
}

/**
 * 2026-08-09: a teljességi mátrix oszlopai — az ÖT kötelező évi dokumentum.
 * A koltsegvetes_modositas szándékosan nincs köztük (opcionális, év közbeni).
 * Az értékek a tényleges submitDocument-hívókkal egyeznek (voters-tab,
 * inventory-main-v3, BudgetTab, penzugy/actions, lelkeszi-jelentes-actions).
 */
export const REQUIRED_DOCUMENT_TYPES: DocumentType[] = [
  'szamadas',
  'koltsegvetes',
  'vagyonleltar',
  'valasztok_nevjegyzeke',
  'lelkeszi_jelentes',
]

/**
 * 2026-08-09 (diagnosztika #5 — év-kulcsolási hiba): az „aktuális beszámolási
 * szezon" éve. A számadás/lelkészi jelentés a TÁRGYÉV kulcsával, de a KÖVETKEZŐ
 * év januárjában érkezik; a vagyonleltár mindig year-1 kulccsal kerül be.
 * Január–márciusban ezért az előző év a releváns alapértelmezés — a naptári
 * évre szűrő régi nézetben ezek a dokumentumok láthatatlanok voltak.
 */
export function documentSeasonYear(date: Date = new Date()): number {
  return date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear()
}

// Feloldási kérelem típus (az egyházmegyei actions.ts-ből kiemelve)
export interface UnlockRequest {
  congregationId: string
  congregationName: string
  year: string
  // 2026-07-17 (F5): 'jelentes' = a hivatalos lelkészi jelentés feloldása
  // (lelkeszi_jelentes tábla, unlock_requested/unlock_reason flow)
  // 2026-08-15 (Endre 4. szakasz): 'valasztok' = a választók névjegyzékének
  // feloldása (bealitas.valasztok_finalized / valasztok_unlock_requested)
  type: 'budget' | 'accounting' | 'inventory' | 'jelentes' | 'valasztok'
  reason: string | null
  requestedAt: string | null
}

export const DOCUMENT_DEADLINES: Record<DocumentType, string> = {
  szamadas: 'Január 31.',
  koltsegvetes: 'Január 31.',
  koltsegvetes_modositas: 'Év közben (opcionális)',
  vagyonleltar: 'Január 31.',
  valasztok_nevjegyzeke: 'Május 31.',
  // Az éves jelentést a presbitérium + közgyűlés tárgyalása után küldi be a
  // gyülekezet — jellemzően az év eleji rendes közgyűlést követően.
  lelkeszi_jelentes: 'Évi rendes közgyűlés után',
}
