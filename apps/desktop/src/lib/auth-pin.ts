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
// Offline-mode flag (session-lifetime)
// ────────────────────────────────────────────────────────────────────────

const OFFLINE_MODE_KEY = 'kartoteka-offline-mode'

/**
 * Jelzi, hogy a jelenlegi app-indítás offline-mode-ban fut (PIN-verify után).
 * A flag a sessionStorage-ban van — app újraindítás után nullára áll, és
 * újra PIN-t kell megadni.
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
  return window.sessionStorage.getItem(OFFLINE_MODE_KEY) === 'true'
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
