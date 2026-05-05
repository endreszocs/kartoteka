/**
 * Offline PIN hitelesítés TS wrapper (A-M6.9, 2026-04-22).
 *
 * A Rust auth_pin modul Tauri command-jait hívjuk meg ezen a vékony
 * rétegen keresztül. Minden függvény **async** és **nem dob** — a hibát
 * a hívó kód a `try/catch` vagy a Result-object alapján kezeli.
 *
 * Ld. apps/desktop/src-tauri/src/auth_pin.rs a részletekért (lockout-szabályzat,
 * biztonsági határok, argon2 paraméterek).
 */

import { invoke } from '@tauri-apps/api/core'

export interface PinVerifyResult {
  /** Sikeres ellenőrzés — a kliens offline-módba léphet. */
  ok: boolean
  /** Ha aktív lockout, ez mondja meg, mikor próbálhat újra (ms epoch). */
  lockedUntilMs: number | null
  /** Hány kísérlet maradt a következő lockout-küszöbig (UI-nak). */
  attemptsRemaining: number | null
  /** Elérte-e a FORCE_LOGOUT küszöböt — ilyenkor a PIN törlődött, újra online-login kell. */
  forceLogout: boolean
}

export interface PinStatus {
  hasPin: boolean
  lockedUntilMs: number | null
  failedAttempts: number
  attemptsRemaining: number | null
}

/** Van-e beállítva PIN-hash? */
export async function hasPin(): Promise<boolean> {
  return invoke<boolean>('auth_pin_has')
}

/** Új PIN beállítása (csak online-módban hívható, pl. sikeres Supabase login után). */
export async function setPin(pin: string): Promise<void> {
  await invoke<void>('auth_pin_set', { pin })
}

/** PIN ellenőrzése (offline-belépéshez). */
export async function verifyPin(pin: string): Promise<PinVerifyResult> {
  const raw = await invoke<{
    ok: boolean
    locked_until_ms: number | null
    attempts_remaining: number | null
    force_logout: boolean
  }>('auth_pin_verify', { pin })
  return {
    ok: raw.ok,
    lockedUntilMs: raw.locked_until_ms,
    attemptsRemaining: raw.attempts_remaining,
    forceLogout: raw.force_logout,
  }
}

/** PIN teljes törlése (logout / reset). */
export async function clearPin(): Promise<void> {
  await invoke<void>('auth_pin_clear')
}

/** Aktuális PIN-státusz (UI-feedback-hez: lockout-counter, hátralévő kísérletek). */
export async function pinStatus(): Promise<PinStatus> {
  const raw = await invoke<{
    has_pin: boolean
    locked_until_ms: number | null
    failed_attempts: number
    attempts_remaining: number | null
  }>('auth_pin_status')
  return {
    hasPin: raw.has_pin,
    lockedUntilMs: raw.locked_until_ms,
    failedAttempts: raw.failed_attempts,
    attemptsRemaining: raw.attempts_remaining,
  }
}

// ────────────────────────────────────────────────────────────────────────
// Offline-mode flag (session-lifetime + opcionális frissítés-túlélő perzisztens flag)
// ────────────────────────────────────────────────────────────────────────

const OFFLINE_MODE_KEY = 'kartoteka-offline-mode'
const REMEMBER_OFFLINE_KEY = 'kartoteka-remember-offline'
const PIN_RESET_PENDING_KEY = 'kartoteka-pin-reset-pending'

/**
 * Jelzi, hogy a jelenlegi app-indítás offline-mode-ban fut (PIN-verify után).
 * A flag a sessionStorage-ban van — app újraindítás után nullára áll, és
 * újra PIN-t kell megadni — KIVÉVE, ha a "Emlékezz erre a gépre" perzisztens
 * flag aktív és nem járt le.
 */
export function setOfflineMode(active: boolean): void {
  if (typeof window === 'undefined') return
  if (active) {
    window.sessionStorage.setItem(OFFLINE_MODE_KEY, 'true')
  } else {
    window.sessionStorage.removeItem(OFFLINE_MODE_KEY)
  }
}

export function isOfflineMode(): boolean {
  if (typeof window === 'undefined') return false
  // Session-lifetime
  if (window.sessionStorage.getItem(OFFLINE_MODE_KEY) === 'true') return true
  // Frissítés-túlélő perzisztens flag (lejárati ms timestamp)
  return isRememberOfflineActive()
}

/**
 * "Emlékezz erre a gépre" — perzisztens flag a localStorage-ban.
 * Frissítés és app-újraindítás után is megmarad, X napig.
 *
 * Biztonsági megfontolás: a flag önmagában nem titok — csak azt jelzi, hogy
 * "ezen a gépen volt PIN-belépés és a felhasználó megbízhatónak találta".
 * Az igazi titok (PIN-hash) az OS keyring-ben van DPAPI-val védve, plusz
 * a Supabase session-token is — ezeket NEM érinti ez a flag.
 *
 * Ha a felhasználó kijelentkezik vagy "Elfelejtettem a kódot" gombot
 * használ, a flag azonnal törlődik.
 */
export function setRememberOffline(days: number): void {
  if (typeof window === 'undefined') return
  if (days <= 0) {
    window.localStorage.removeItem(REMEMBER_OFFLINE_KEY)
    return
  }
  const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000
  window.localStorage.setItem(REMEMBER_OFFLINE_KEY, String(expiresAt))
}

export function isRememberOfflineActive(): boolean {
  if (typeof window === 'undefined') return false
  const raw = window.localStorage.getItem(REMEMBER_OFFLINE_KEY)
  if (!raw) return false
  const expiresAt = parseInt(raw, 10)
  if (Number.isNaN(expiresAt)) return false
  if (Date.now() > expiresAt) {
    // Lejárt — takarítsuk
    window.localStorage.removeItem(REMEMBER_OFFLINE_KEY)
    return false
  }
  return true
}

export function clearRememberOffline(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(REMEMBER_OFFLINE_KEY)
}

export function getRememberOfflineExpiresAt(): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(REMEMBER_OFFLINE_KEY)
  if (!raw) return null
  const expiresAt = parseInt(raw, 10)
  if (Number.isNaN(expiresAt) || Date.now() > expiresAt) return null
  return expiresAt
}

// ────────────────────────────────────────────────────────────────────────
// "Elfelejtettem a kódot" reset flow
// ────────────────────────────────────────────────────────────────────────

/**
 * A user a PIN-entry oldalon az "Elfelejtettem a kódot" gombbal indítja —
 * ez törli a PIN-hash-et a keyring-ből, törli a remember-offline flagot, és
 * jelzi, hogy a következő online-bejelentkezés után automatikus PIN-setup
 * folyamatra kell vinni a felhasználót.
 */
export async function requestPinReset(): Promise<void> {
  await clearPin()
  clearRememberOffline()
  setOfflineMode(false)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PIN_RESET_PENDING_KEY, 'true')
  }
}

export function isPinResetPending(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(PIN_RESET_PENDING_KEY) === 'true'
}

export function clearPinResetPending(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(PIN_RESET_PENDING_KEY)
}

// ────────────────────────────────────────────────────────────────────────
// Felhasználóbarát magyar hibaüzenet lockout esetén
// ────────────────────────────────────────────────────────────────────────

/** Pasztorális, magyar nyelvű üzenet a lockout-idő hátralévő részéről. */
export function formatLockoutMessage(lockedUntilMs: number): string {
  const remainingMs = Math.max(0, lockedUntilMs - Date.now())
  if (remainingMs <= 0) return 'Próbálj újra.'

  const seconds = Math.ceil(remainingMs / 1000)
  if (seconds < 60) return `Kérlek, várj ${seconds} másodpercet, majd próbáld újra.`

  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `Kérlek, várj ${minutes} percet, majd próbáld újra.`

  const hours = Math.ceil(minutes / 60)
  return `Kérlek, várj ${hours} órát, majd próbáld újra.`
}
