/**
 * Devices + Licenses + Audit-log közös típusok (M0.5).
 * NEM 'use server' fájl — a komponensek innen importálhatnak types-t.
 */

export interface UserDevice {
  id: string
  user_id: string
  device_fingerprint: string
  device_name: string | null
  platform: string
  registered_at: string
  last_seen: string | null
  revoked: boolean
  revoked_by: string | null
  revoked_at: string | null
  revoke_reason: string | null
  user_email?: string | null
  user_full_name?: string | null
}

export interface License {
  id: string
  user_id: string
  congregation_id: string | null
  device_limit: number
  valid_from: string
  valid_until: string
  revoked: boolean
  created_at: string
  updated_at: string
  notes: string | null
  user_email?: string | null
  user_full_name?: string | null
}

export interface AuditLogEntry {
  id: string
  user_id: string | null
  device_id: string | null
  action: string
  target_table: string | null
  target_id: string | null
  metadata: unknown
  ip: string | null
  user_agent: string | null
  created_at: string
  user_email?: string | null
}

/**
 * Audit action-ek címkéi (magyar).
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'login': 'Bejelentkezés',
  'logout': 'Kijelentkezés',
  'access_request.approve': 'Hozzáférés elfogadva',
  'access_request.reject': 'Hozzáférés elutasítva',
  'device.register': 'Eszköz regisztrálva',
  'device.revoke': 'Eszköz visszavonva',
  'device.restore': 'Eszköz visszaállítva',
  'license.issue': 'Licenc kibocsátva',
  'license.revoke': 'Licenc visszavonva',
  'document.upload': 'Dokumentum feltöltve',
  'document.download': 'Dokumentum letöltve',
  'sync.push': 'Sync feltöltés',
  'sync.pull': 'Sync letöltés',
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] || action
}
