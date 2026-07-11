/**
 * Devices + Licenses + Audit-log közös típusok (M0.5).
 * NEM 'use server' fájl — a komponensek innen importálhatnak types-t.
 *
 * 2026-07-11 (admin-redesign 2. kör): licenc-életciklus helperek + alvó-eszköz
 * számítás + licenc user-kereső típus — a KPI-sáv és a licenc-CRUD közös alapja.
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

/** A licenc-kibocsátó dialógus user-keresőjének találata. */
export interface LicenseUserOption {
  id: string
  email: string | null
  full_name: string | null
  congregation_id: string | null
  congregation_name: string | null
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
  'license.extend': 'Licenc hosszabbítva',
  'license.update': 'Licenc módosítva',
  'license.revoke': 'Licenc visszavonva',
  'license.restore': 'Licenc visszaállítva',
  'document.upload': 'Dokumentum feltöltve',
  'document.download': 'Dokumentum letöltve',
  'sync.push': 'Sync feltöltés',
  'sync.pull': 'Sync letöltés',
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] || action
}

// ─────────────────────────────────────────────────────────────────────────
// Licenc-életciklus + alvó eszköz — a KPI-sáv és a státusz-jelvények
// KÖZÖS számítása (bit-azonos minden nézetben)
// ─────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

/** Hány napon belüli lejárat számít „hamarosan lejár"-nak. */
export const LICENSE_EXPIRY_WARNING_DAYS = 30

/** Ennyi nap inaktivitás után számít egy eszköz „alvónak". */
export const DORMANT_DEVICE_DAYS = 30

/**
 * Licenc-lejárat: a dátum-only string (YYYY-MM-DD) a nap VÉGÉIG érvényes
 * lokális idő szerint. A nyers `new Date(str)` UTC-éjfélre esne, ami
 * Romániában (UTC+2/3) már hajnaltól tévesen lejártnak mutatná az aznap
 * még érvényes licencet.
 */
export function licenseValidityEndMs(validUntil: string): number {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(validUntil)
    ? new Date(`${validUntil}T23:59:59.999`)
    : new Date(validUntil)
  return d.getTime()
}

export type LicenseLifecycle = 'active' | 'expiring' | 'expired' | 'revoked'

export function getLicenseLifecycle(
  license: Pick<License, 'revoked' | 'valid_until'>,
  now: number = Date.now(),
): LicenseLifecycle {
  if (license.revoked) return 'revoked'
  const end = licenseValidityEndMs(license.valid_until)
  if (end < now) return 'expired'
  if (end - now <= LICENSE_EXPIRY_WARNING_DAYS * DAY_MS) return 'expiring'
  return 'active'
}

/** Hány nap van hátra a licenc érvényességéből (lejártnál negatív). */
export function licenseDaysLeft(validUntil: string, now: number = Date.now()): number {
  return Math.ceil((licenseValidityEndMs(validUntil) - now) / DAY_MS)
}

/**
 * „Alvó" eszköz: nem visszavont, de 30+ napja nem adott életjelet
 * (ha sosem jelentkezett, a regisztráció dátumától számolunk).
 */
export function isDeviceDormant(
  device: Pick<UserDevice, 'revoked' | 'last_seen' | 'registered_at'>,
  now: number = Date.now(),
): boolean {
  if (device.revoked) return false
  const reference = device.last_seen ?? device.registered_at
  return now - new Date(reference).getTime() > DORMANT_DEVICE_DAYS * DAY_MS
}
