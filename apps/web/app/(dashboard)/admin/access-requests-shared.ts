/**
 * Access Requests közös típusok + label-ek (M0.1).
 *
 * FIGYELEM: ez NEM 'use server' fájl.
 * A Next.js 16 szerint 'use server' fájlból csak async functions
 * exportálhatók — types/interfaces/const objects nem.
 * Ezért a ROLE_LABELS / STATUS_LABELS const-ok és a shared types itt élnek.
 *
 * A server actions (async function-ök) az `access-requests-actions.ts`-ben.
 */

// ─────────────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────────────

export type AccessRequestRole =
  | 'lelkesz'
  | 'esperes'
  | 'egyhazmegyei_admin'
  | 'egyhazkeruleti_admin'
  | 'konyvelo'
  | 'egyhazmegyei_szamvevo'
  // 2026-08-15 (egyhazkeruleti S1)
  | 'egyhazkeruleti_szamvevo'

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected'

export interface AccessRequest {
  id: string
  email: string
  full_name: string
  requested_role: AccessRequestRole
  congregation_slug: string | null
  phone: string | null
  justification: string | null
  referrer: string | null
  status: AccessRequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  admin_notes: string | null
  ip_hash: string | null
  user_agent: string | null
  created_at: string
  updated_at: string
  resulting_user_id: string | null
  // 2026-06-03 — egyházkerület/egyházmegye választás + opcionális igazolás
  requested_district_id: string | null
  requested_diocese_id: string | null
  document_path: string | null
  // 2026-06-04 — listából választott egyházközség (a jóváhagyáskor congregation_id)
  requested_congregation_id: string | null
  // A listázáskor join-olt nevek (districts/dioceses/congregations) — csak olvasásra
  district?: { name: string } | null
  diocese?: { name: string } | null
  congregation?: { name: string | null; nev_hu: string | null } | null
}

export interface AccessRequestStats {
  total: number
  pending: number
  approved: number
  rejected: number
  last24h: number
  last7d: number
  /**
   * 2026-08-12: a LEGRÉGEBBI még elbírálatlan kérelem beérkezése (ISO), vagy
   * `null`, ha nincs ilyen. NULLA extra lekérdezés — a sorok úgyis be vannak
   * töltve. Az admin ÁTTEKINTÉS ebből mondja meg, hogy „a legrégebbi 9 napja
   * vár": a másik oldalon egy lelkész ül, aki addig nem tud belépni.
   */
  oldestPendingCreatedAt: string | null
}

export interface ListFilter {
  status?: AccessRequestStatus | 'all'
  search?: string
}

export interface ApproveInput {
  id: string
  admin_notes?: string | null
}

export interface RejectInput {
  id: string
  rejection_reason: string
  admin_notes?: string | null
}

// ─────────────────────────────────────────────────────────────────────────
// Label-ek (magyar UI-szövegek)
// ─────────────────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<AccessRequestRole, string> = {
  lelkesz: 'Lelkész',
  esperes: 'Esperes',
  egyhazmegyei_admin: 'Egyházmegyei admin',
  egyhazkeruleti_admin: 'Egyházkerületi admin',
  konyvelo: 'Könyvelő',
  egyhazmegyei_szamvevo: 'Egyházmegyei számvevő',
  egyhazkeruleti_szamvevo: 'Egyházkerületi számvevő',
}

export const STATUS_LABELS: Record<AccessRequestStatus, string> = {
  pending: 'Várakozik',
  approved: 'Jóváhagyva',
  rejected: 'Elutasítva',
}
