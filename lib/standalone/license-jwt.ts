/**
 * License JWT — kiállítás, validálás (SERVER-ONLY).
 *
 * 🔒 BIZTONSÁG: ez a fájl a `'server-only'` őrt használja, ami buildtime
 * hibát ad, ha véletlenül egy kliens komponens importálná.
 *
 * Tartalmaz:
 *   - DEFAULT_DEV_PUBLIC_KEY + DEFAULT_DEV_PRIVATE_KEY (csak fejlesztéshez!)
 *   - validateLicenseToken() — jose jwtVerify
 *   - issueLicenseToken() — jose SignJWT
 *
 * A típusok és a kliens-safe permission helperek a `license-types.ts`-ben
 * vannak — onnan importáld őket kliens komponensekben!
 */

// 🔒 SERVER-ONLY guard — buildtime hibát dob, ha kliens-import történne
import 'server-only'

import { jwtVerify, importSPKI, SignJWT, importPKCS8 } from 'jose'

import {
  type LicenseClaims,
  type LicenseValidationResult,
  calculateStatus,
} from './license-types'

// Re-export a típusokat is, hogy a server-side modulok egy importtal megkapják
export type { LicenseClaims, LicenseStatus, LicenseValidationResult } from './license-types'
export { calculateStatus, canWrite, canExportExcel, canExportBackup, shouldShowBanner, getBannerColor } from './license-types'

// ─────────────────────────────────────────────────────────────────
// RSA kulcspár (DEV-TEST!)
// ─────────────────────────────────────────────────────────────────

const DEFAULT_DEV_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoJPeEhURmPl23Y6y6hNW
PHiuJTfoQ/YEfEMmmhnZHC3jOb06ssbzruh8ADlqpVbp7oEV0xEPNFG7Je+L2FzW
VIEmOX3qQ3yaWksiv+EDig7EAek5Thcj/ETvmH/Wi1+SxTnj9mN2L0DaG7S2Oe99
AKVoEPZFaEzPyoXg5XZvxtlpnxTyW22OGecPSrnyCZiJ8rwNgvKcQPhj3NjFtuH4
8/4SM4/o1dFKVa0ugkYKe2ynLUGjSce8mrY7YjP9esCzWKFhllx3yRIW9xxCXLfR
fSWuMXrtXV6uMB2WK/BT5VoMKG6L0XqyqKeukaPw/4Y1Fx3xaAXYpxPGJK4Z1pab
tQIDAQAB
-----END PUBLIC KEY-----`

export const DEFAULT_DEV_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCgk94SFRGY+Xbd
jrLqE1Y8eK4lN+hD9gR8QyaaGdkcLeM5vTqyxvOu6HwAOWqlVunugRXTEQ80Ubsl
74vYXNZUgSY5fepDfJpaSyK/4QOKDsQB6TlOFyP8RO+Yf9aLX5LFOeP2Y3YvQNob
tLY5730ApWgQ9kVoTM/KheDldm/G2WmfFPJbbY4Z5w9KufIJmInyvA2C8pxA+GPc
2MW24fjz/hIzj+jV0UpVrS6CRgp7bKctQaNJx7yatjtiM/16wLNYoWGWXHfJEhb3
HEJct9F9Ja4xeu1dXq4wHZYr8FPlWgwobovRerKop66Ro/D/hjUXHfFoBdinE8Yk
rhnWlpu1AgMBAAECggEACLBfpp5VvK+ZBz2awFBKDQ0hrTlke9Ly5K90hgeqiBwS
jNQIulZKJteFKDTzKJ22nFWHUwu8BSJ8DD41VMCXR2zSnu9JjxvNtV+V8oiQOrb4
U7slQuy9IYAwb9HRD+scw8fRZkp1AXMSqkehyapEGxYYNrzAvjdT0hti8z+wpjOV
En0Gen+u6qv8yn32tkFlPv/+TRiZf5AY0BY5CgMhV78gMBRZQLovdigjPjOzuOw8
gLyCWBWtcJqoFXYILP06D2e/ZxCPSGBWgp/sOw3m8SIgvVdF4CuP/zRXXULRfgBI
udcG1SjjI91awjsvhuiYhX+YJu1svTqg64ARLuGdYQKBgQDL04+VCyT82JfZWDSF
6yCLTriovUWc87TLcsVd9Iorc4CH9xLlZQvUlCLynwwonA1/am6eRPgcQb7bz5yY
x1B+NCYdLIH0VnK7mmHNNQs0c6U2F6gR8E7DIPjb5m6oOWZKI++gizIwGMr0J24B
Ty6YuZ4ZyisQ+6oXTpGq/eE1VQKBgQDJrkcDgkM7RUApemqgIiSCEXPS/4rYWBqC
wzDCUj1IpabkFCHQmJHnSNU6OIVzmE3/bWyGCBy0TjQEOiIvTDJ25aeoxQfpzFg5
Dp/wSvutum6OssFIExCqBAUfOGi6pVhRl6cZB2QL5rlUIpEzV1MMxk8xsFRVhxyA
km9UKIvM4QKBgA5PPwBOtP0PU7HNkHpqZHGDSFGIYC/BqEq0Nwj+lwiv5jEldm0m
Z+s3rzBrXBYpxoTQew2fd++76eNSswLC03LYxGg97K2zuABVuVIHzE6VY97lUEZa
IZ1vXilKBzDGPtkrprIVs6NOykjTz9RFs9bDCUd0OwvJL0rNmEpx4nK1AoGBAKiu
qRqYMt859oY6qz+wDtTy/+r0bQ6x8cp4syl0W2mNk16kL/wl/7JwSlddutCKDIKc
5O3djxSHbB40+S6SDos/XdFcqlez3/4o60CxlnshuSKFA//iYkexAQ+xwHaLoKjt
rIbUlasWmN9z4foNCZtfqhEnKAI49W/cCl1bZEJBAoGAOQxmVBVf8xpq/i2lfUk5
AUXjcnxAUXkmtTkv0BQAY2xuS5e6Uw+X7/Zg7ONVNBU3UhlFZbRqiK5b7pXQ2eI0
/5/BIoH2XhXfwZWLSPZrgi/wJOsc5kNHBkml7GCMqDR9jOAHzrnps+WFlMbP7q0H
+TVtjyGOs56UNTEXQ4m6xdA=
-----END PRIVATE KEY-----`

function getPublicKeyPem(): string {
  return process.env.LICENSE_PUBLIC_KEY_PEM || DEFAULT_DEV_PUBLIC_KEY
}

// ─────────────────────────────────────────────────────────────────
// JWT verify (server-side)
// ─────────────────────────────────────────────────────────────────

export async function validateLicenseToken(
  token: string,
  expectedFingerprint: string,
): Promise<LicenseValidationResult> {
  if (!token) {
    return { valid: false, status: 'missing', reason: 'NO_TOKEN' }
  }

  let claims: LicenseClaims
  try {
    const publicKey = await importSPKI(getPublicKeyPem(), 'PS256')
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['PS256'],
    })
    claims = payload as unknown as LicenseClaims
  } catch (e) {
    return {
      valid: false,
      status: 'invalid',
      reason: 'INVALID_SIGNATURE: ' + (e instanceof Error ? e.message : 'Unknown'),
    }
  }

  // Fingerprint check
  const fingerprintMatch = claims.fp === expectedFingerprint
  if (!fingerprintMatch) {
    return {
      valid: false,
      status: 'invalid',
      reason: 'FINGERPRINT_MISMATCH — a licensz egy másik gépre lett kiállítva',
      claims,
      fingerprintMatch: false,
    }
  }

  // Lejárat + degradation
  const nowSec = Math.floor(Date.now() / 1000)
  const daysSinceIssued = Math.floor((nowSec - claims.iat) / 86400)
  const daysRemaining = Math.floor((claims.exp - nowSec) / 86400)

  const status = calculateStatus(daysSinceIssued)
  const valid = status !== 'blocked'

  return {
    valid,
    status,
    claims,
    daysRemaining,
    daysSinceLastSync: daysSinceIssued,
    fingerprintMatch: true,
  }
}

// ─────────────────────────────────────────────────────────────────
// JWT issue (server-side, dev-only)
// ─────────────────────────────────────────────────────────────────

export async function issueLicenseToken(params: {
  userId: string
  congregationId: string
  fingerprint: string
  privateKeyPem: string
  role?: string
  validityDays?: number
}): Promise<string> {
  const privateKey = await importPKCS8(params.privateKeyPem, 'PS256')
  const now = Math.floor(Date.now() / 1000)
  const validityDays = params.validityDays ?? 35
  const exp = now + validityDays * 86400

  const claims: LicenseClaims = {
    sub: params.userId,
    cong_id: params.congregationId,
    fp: params.fingerprint,
    iat: now,
    exp,
    lv: 1,
    role: params.role,
  }

  const jwt = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'PS256', typ: 'JWT' })
    .sign(privateKey)

  return jwt
}
