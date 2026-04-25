import type { Role } from '@/lib/types/auth'

const MASTER_ADMIN_EMAIL = process.env.MASTER_ADMIN_EMAIL || ''
const KNOWN_ROLES = [
  'lelkesz',
  'esperes',
  'egyhazmegyei_admin',
  'egyhazkeruleti_admin',
  'admin',
  'konyvelo',
  'egyhazmegyei_szamvevo',
] as const

// ─────────────────────────────────────────────────────────────
// Alapszintű szerepkör-ellenőrzők
// ─────────────────────────────────────────────────────────────

export function isKnownRole(role: unknown): role is Role {
  return typeof role === 'string' && (KNOWN_ROLES as readonly string[]).includes(role)
}

export function isMasterAdmin(email: string | null | undefined): boolean {
  if (!email || !MASTER_ADMIN_EMAIL) return false
  return email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()
}

export function isAdminRole(role: Role, email?: string | null): boolean {
  return role === 'admin' || isMasterAdmin(email)
}

export function isEgyhazkeruletiAdminRole(role: Role, email?: string | null): boolean {
  return role === 'egyhazkeruleti_admin' || isAdminRole(role, email)
}

export function isEsperesRole(role: Role, email?: string | null): boolean {
  return (
    role === 'esperes' ||
    role === 'egyhazmegyei_admin' ||
    isEgyhazkeruletiAdminRole(role, email)
  )
}

export function isKonyveloRole(role: Role): boolean {
  return role === 'konyvelo'
}

export function isSzamvevoRole(role: Role): boolean {
  return role === 'egyhazmegyei_szamvevo'
}

// ─────────────────────────────────────────────────────────────
// Szakterületi jogosultság-ellenőrzők (pénzügy)
// ─────────────────────────────────────────────────────────────

/**
 * Olvashatja a gyülekezet pénzügyi adatait.
 * Lelkesz, esperes, egyházmegyei admin, egyházkerületi admin, admin, könyvelő, számvevő.
 */
export function canReadFinancial(role: Role, email?: string | null): boolean {
  return (
    role === 'lelkesz' ||
    role === 'konyvelo' ||
    role === 'egyhazmegyei_szamvevo' ||
    isEsperesRole(role, email)
  )
}

/**
 * Szerkesztheti a TVA kategória-zászlókat (szamadasicel.tva_plafonba_szamit).
 * Csak a könyvelő és admin.
 */
export function canEditTvaFlags(role: Role, email?: string | null): boolean {
  return role === 'konyvelo' || isAdminRole(role, email)
}

/**
 * Aktiválhatja a könyvelő szerepkört és gyülekezetekhez rendelheti.
 * Admin és egyházkerületi admin.
 */
export function canAssignKonyvelo(role: Role, email?: string | null): boolean {
  return isEgyhazkeruletiAdminRole(role, email)
}

/**
 * Hozzárendelheti az egyházmegyei számvevőt.
 * Admin, egyházkerületi admin, egyházmegyei admin.
 */
export function canAssignSzamvevo(role: Role, email?: string | null): boolean {
  return role === 'egyhazmegyei_admin' || isEgyhazkeruletiAdminRole(role, email)
}

/**
 * Szakmai pénzügyi review-t végezhet (pl. éves jelentés ellenőrzése).
 * Könyvelő + számvevő + esperes felfelé.
 */
export function canReviewFinancial(role: Role, email?: string | null): boolean {
  return role === 'konyvelo' || role === 'egyhazmegyei_szamvevo' || isEsperesRole(role, email)
}

// Supabase auth hibaüzenetek fordítása
const ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': 'Érvénytelen e-mail cím vagy jelszó.',
  'Email not confirmed': 'Kérem, erősítse meg az e-mail címét a fiókjába küldött linkkel!',
  'User already registered': 'Ez az e-mail cím már regisztrálva van.',
  'Password should be at least 6 characters': 'A jelszónak legalább 6 karakter hosszúnak kell lennie.',
  'Email rate limit exceeded': 'Túl sok próbálkozás. Kérem, várjon néhány percet.',
  'Signups not allowed for this instance': 'A regisztráció jelenleg nem engedélyezett.',
}

export function translateSupabaseError(message: string): string {
  for (const [eng, hun] of Object.entries(ERROR_MAP)) {
    if (message.includes(eng)) return hun
  }
  return `Hiba: ${message}`
}
