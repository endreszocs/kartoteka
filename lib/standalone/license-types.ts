/**
 * License típusok — KLIENS-SAFE.
 *
 * Ez a fájl SEM privát kulcsot, SEM JWT signing kódot NEM tartalmaz.
 * Bizton kliens komponensekbe importálható.
 *
 * A tényleges JWT verify/sign + DEFAULT_DEV_PRIVATE_KEY a `license-jwt.ts`-ben
 * van (server-only, `'server-only'` őrrel).
 */

export interface LicenseClaims {
  /** User ID (Supabase auth.users.id) */
  sub: string
  /** Congregation ID */
  cong_id: string
  /** Machine fingerprint (Level 2 DEEP SHA-256) */
  fp: string
  /** Issued at (Unix seconds) */
  iat: number
  /** Expires at (Unix seconds) */
  exp: number
  /** License version */
  lv: number
  /** Opcionális szerepkör */
  role?: string
}

export type LicenseStatus =
  | 'normal'            // 0-30 nap
  | 'reminder'          // 25-30 nap
  | 'warning'           // 30-35 nap
  | 'degraded'          // 35-45 nap (Excel export letiltva)
  | 'read_only'         // 45-60 nap (CRUD letiltva)
  | 'blocked'           // 60+ nap (full block)
  | 'invalid'           // Hibás signature / fingerprint
  | 'missing'           // Nincs license.dat

export interface LicenseValidationResult {
  valid: boolean
  status: LicenseStatus
  reason?: string
  claims?: LicenseClaims
  daysRemaining?: number
  daysSinceLastSync?: number
  fingerprintMatch?: boolean
}

// ─────────────────────────────────────────────────────────────────
// Kliens-safe permission helpers
// ─────────────────────────────────────────────────────────────────

export function canWrite(status: LicenseStatus): boolean {
  return (
    status === 'normal' ||
    status === 'reminder' ||
    status === 'warning' ||
    status === 'degraded'
  )
}

export function canExportExcel(status: LicenseStatus): boolean {
  return (
    status === 'normal' ||
    status === 'reminder' ||
    status === 'warning'
  )
}

export function canExportBackup(status: LicenseStatus): boolean {
  return status !== 'blocked'
}

export function shouldShowBanner(status: LicenseStatus): boolean {
  return (
    status === 'reminder' ||
    status === 'warning' ||
    status === 'degraded' ||
    status === 'read_only' ||
    status === 'blocked'
  )
}

export function getBannerColor(status: LicenseStatus): 'amber' | 'orange' | 'red' | 'slate' {
  switch (status) {
    case 'reminder':
      return 'slate'
    case 'warning':
      return 'amber'
    case 'degraded':
      return 'orange'
    case 'read_only':
    case 'blocked':
      return 'red'
    default:
      return 'slate'
  }
}

export function calculateStatus(daysSinceLastSync: number): LicenseStatus {
  if (daysSinceLastSync < 25) return 'normal'
  if (daysSinceLastSync < 30) return 'reminder'
  if (daysSinceLastSync < 35) return 'warning'
  if (daysSinceLastSync < 45) return 'degraded'
  if (daysSinceLastSync < 60) return 'read_only'
  return 'blocked'
}
