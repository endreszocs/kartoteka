/**
 * Offline PIN hitelesítés TS wrapper (A-M6.9, 2026-04-22; 2026-09-05
 * PIN-tulajdonos + remember-jelző PIN-hez kötése).
 *
 * A Rust auth_pin modul Tauri command-jait hívjuk meg ezen a vékony
 * rétegen keresztül. Az invoke-hívások hibát DOBNAK (keyring-hiba) — a hívó
 * kód a `try/catch` vagy a Result-object alapján kezeli, LÁTHATÓ üzenettel.
 *
 * Ld. apps/desktop/src-tauri/src/auth_pin.rs a részletekért (lockout-szabályzat,
 * biztonsági határok, argon2 paraméterek); a tulajdonos-bejegyzés az
 * auth.rs `auth_*_item` parancsain át él (`auth-pin-owner` slot).
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

// ────────────────────────────────────────────────────────────────────────
// PIN-TULAJDONOS (2026-09-05, desk-auth-2 / P1)
// ────────────────────────────────────────────────────────────────────────
//
// MI VOLT A HIBA: a PIN-hash egyetlen, felhasználó nélküli keyring-slot volt.
// Ha A lelkész gépén később B lépett be online, B sosem kapott PIN-beállítást
// (a `hasPin()` igaz volt), és A kódjával bárki offline beléphetett B tükrébe.
//
// A JAVÍTÁS: a PIN mellé a tulajdonos user-id-ját is a keyringbe írjuk
// (`auth-pin-owner` — a Rust `auth_store_item` az `auth-` előtagú kulcsokat
// engedi). A PIN-belépő CSAK akkor enged, ha a tulajdonos megegyezik a gép
// utolsó ismert felhasználójával; online belépéskor az idegen PIN törlődik.
//
// FAIL-CLOSED: egy tulajdonos NÉLKÜLI PIN (a frissítés előtti telepítésekről
// örökölt) „idegen"-nek számít — nincs örökbefogadás a lastUser alapján, mert
// pont az a hibaeset, hogy a lastUser (B) nem az, aki a PIN-t adta (A).

const PIN_OWNER_KEY = 'auth-pin-owner'

/** A PIN tulajdonosának user-id-ja a keyringből (null = nincs bejegyezve). */
export async function getPinOwner(): Promise<string | null> {
  const raw = await invoke<string | null>('auth_read_item', { key: PIN_OWNER_KEY })
  return raw && raw.trim() ? raw.trim() : null
}

async function setPinOwner(userId: string): Promise<void> {
  await invoke<void>('auth_store_item', { key: PIN_OWNER_KEY, value: userId })
}

async function clearPinOwner(): Promise<void> {
  await invoke<void>('auth_clear_item', { key: PIN_OWNER_KEY })
}

/**
 * Új PIN beállítása a TULAJDONOSÁVAL együtt (csak online belépés után, a
 * bejelentkezett user id-jával hívható).
 *
 * Sorrend: előbb a hash, aztán a tulajdonos. Ha a tulajdonos írása elbukik,
 * a frissen írt hash-t is visszavonjuk — így SOHA nem marad tulajdonos
 * nélküli (= idegennek számító) PIN a gépen.
 */
export async function setPin(pin: string, ownerUserId: string): Promise<void> {
  if (!ownerUserId) throw new Error('A kód beállításához a bejelentkezett felhasználó azonosítója kell.')
  await invoke<void>('auth_pin_set', { pin })
  try {
    await setPinOwner(ownerUserId)
  } catch (err) {
    try {
      await invoke<void>('auth_pin_clear')
    } catch {
      /* a visszavonás best-effort — a hívó a tulajdonos-hibát kapja */
    }
    throw err
  }
}

export type PinTulajdonosAllapot = 'nincs' | 'sajat' | 'idegen'

/**
 * Kinek a PIN-je van a gépen az adott userhez képest?
 *   'nincs'  — nincs PIN-hash;
 *   'sajat'  — van, és a tulajdonos ez a user;
 *   'idegen' — van, de a tulajdonos más (vagy nincs bejegyezve — fail-closed).
 */
export async function pinTulajdonosEllenorzes(userId: string): Promise<PinTulajdonosAllapot> {
  const van = await hasPin()
  if (!van) return 'nincs'
  const owner = await getPinOwner()
  return owner !== null && owner === userId ? 'sajat' : 'idegen'
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

/**
 * PIN teljes törlése (logout / reset / tulajdonos-váltás): a hash, a
 * tulajdonos-bejegyzés ÉS az „Emlékezz erre a gépre" jelző együtt — a
 * remember-jelző PIN nélkül érvénytelen (ld. `offlineBelepesEngedett`).
 */
export async function clearPin(): Promise<void> {
  await invoke<void>('auth_pin_clear')
  await clearPinOwner()
  clearRememberOffline()
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

/**
 * Érvényes-e az offline (PIN-es) munkamenet ezen az indításon? (2026-09-05)
 *
 * MIÉRT: az „Emlékezz erre a gépre" jelző a localStorage-ban él, a PIN-hash
 * a keyringben — a kettő széthúzhat (a PIN törlődött: tulajdonos-váltás,
 * 10 hibás próbálkozás, „Elfelejtettem"; a jelző maradt). Egy PIN NÉLKÜLI
 * remember-jelző kulcs nélküli ajtó lenne, ezért itt ÖNJAVÍTÓAN töröljük.
 *
 * = isOfflineMode() ÉS van PIN. A pin-entry és a főoldal ezt kérdezi; az
 * AuthGate 2. kapuja ma még a puszta `isOfflineMode()`-ot nézi (más ügynök
 * fájlja — nyitott kérdésként jelezve).
 */
export async function offlineBelepesEngedett(): Promise<boolean> {
  if (!isOfflineMode()) return false
  let van = false
  try {
    van = await hasPin()
  } catch {
    // A kulcstár nem válaszol → nem bizonyítható a PIN → fail-closed.
    van = false
  }
  if (!van) {
    clearRememberOffline()
    setOfflineMode(false)
    return false
  }
  return true
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
  // A clearPin a tulajdonost és a remember-jelzőt is törli.
  await clearPin()
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
