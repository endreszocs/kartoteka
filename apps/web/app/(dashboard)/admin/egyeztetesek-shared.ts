/**
 * Admin kereszt-gyülekezeti egyeztetés — megosztott típusok (2026-08-09).
 *
 * Külön fájl, mert a Next.js 16 'use server' szabálya szerint az action-fájl
 * csak async függvényt exportálhat (típust/konstanst nem).
 */

export type CrossMatchAdminConfidence =
  | 'name_phone'
  | 'name_birth'
  | 'phone_only'
  | 'name_only'

export type CrossMatchAdminResolution =
  | 'same_person'
  | 'different_person'
  | 'dismissed'

export interface CrossMatchAdminRow {
  id: string
  notificationType: 'new_member' | 'update_match' | 'retroactive_scan'
  confidence: CrossMatchAdminConfidence
  createdAt: string
  resolution: CrossMatchAdminResolution | null
  resolvedAt: string | null
  adminNotifiedAt: string | null
  triggering: CrossMatchAdminSide
  matched: CrossMatchAdminSide
}

export interface CrossMatchAdminSide {
  szemelyId: number
  szemelyName: string | null
  szDatum: string | null
  cnp: string | null
  congregationId: string
  congregationName: string | null
  pastorUserId: string | null
  pastorName: string | null
  pastorEmail: string | null
}

export interface CrossMatchAdminListResult {
  rows?: CrossMatchAdminRow[]
  accessLevel?: 'master' | 'admin' | 'district_admin'
  /** true = a 2026-08-09-admin-kereszt-egyeztetes.sql még nincs lefuttatva. */
  needsSql?: boolean
  error?: string
}

export interface CrossMatchScanResult {
  success?: boolean
  newMatches?: number
  totalOpen?: number
  needsSql?: boolean
  error?: string
}

export interface CrossMatchNotifyResult {
  success?: boolean
  /** Hány lelkésznek ment ki e-mail. */
  emailed?: number
  /** Hány lelkész kapott app-on belüli értesítést. */
  inApp?: number
  /** Nem-blokkoló figyelmeztetések (pl. az egyik gyülekezetnek nincs lelkésze). */
  warnings?: string[]
  error?: string
}
