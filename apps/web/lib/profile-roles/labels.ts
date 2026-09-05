/**
 * SZEREP- ÉS STÁTUSZ-CÍMKÉK — AZ EGYETLEN FORRÁS (2026-09-05, profil-kör D7).
 *
 * MIÉRT SZÜLETETT: a felmérés NÉGY párhuzamos szerep-címke térképet talált
 * (a kanonikus `ROLE_LABELS` mellett a profil-dialógus, a /profile oldal és a
 * fejléc tartott saját másolatot), és ezek széttartottak: a /profile switch-ből
 * hiányzott a `custom`, a dialógus térképe „Egyedi szerep"-et írt „Egyedi
 * szerepkör" helyett, a fejléc külön legacy-listát őrzött. Mostantól MINDEN
 * felület innen címkéz — nincs több lista, amit el lehet felejteni frissíteni.
 *
 * Direktíva-mentes modul (nincs `server-only` / `use client`): a kliens-
 * dialógus és a szerver-oldal ugyanezt hívja.
 */

import { ROLE_LABELS, SCOPE_LABELS, type ProfileRoleScope, type ProfileRoleType } from '@/lib/profile-roles/types'

/**
 * A `profiles.role` LEGACY kulcsai, amelyek NINCSENEK a kanonikus ROLE_LABELS-ben
 * (régi/technikai értékek, nem `ProfileRoleType`-ok). Korábban a fejlécben élt.
 */
export const LEGACY_ROLE_LABELS: Record<string, string> = {
  master_admin: 'Főadmin',
  master: 'Főadmin',
  pastor: 'Lelkipásztor',
  user: 'Felhasználó',
}

/**
 * Szerep-címke bármilyen forrásból jövő kulcsra.
 *
 * - ismert kulcs → kanonikus magyar címke;
 * - `custom` + egyedi felirat → az egyedi felirat;
 * - legacy kulcs → a legacy címke;
 * - ismeretlen → a NYERS kulcs olvashatóbban (aláhúzás nélkül), hogy a hiba
 *   LÁTSZÓDJON a felületen, ne egy hamis „Lelkipásztor" takarja.
 */
export function getRoleLabel(role: string | null | undefined, customLabel?: string | null): string {
  if (!role) return 'Nincs hozzárendelt szerepkör'
  if (role === 'custom' && customLabel && customLabel.trim()) return customLabel.trim()
  return (
    (ROLE_LABELS as Record<string, string>)[role] ||
    LEGACY_ROLE_LABELS[role] ||
    role.replace(/_/g, ' ')
  )
}

/** Hatókör-címke; ismeretlen kulcsnál a nyers kulcs. */
export function getScopeLabel(scope: string | null | undefined): string {
  if (!scope) return '—'
  return (SCOPE_LABELS as Record<string, string>)[scope] || scope
}

/**
 * A profil fejléc-„szemöldöke" a szerep szerint („Lelkipásztori profil").
 * A felmérés (data-14): eddig MINDEN szerepnél „Lelkipásztori profil" állt —
 * könyvelőnél, rendszergazdánál is.
 */
export function getProfileEyebrow(role: string | null | undefined): string {
  switch (role) {
    case 'lelkesz':
    case 'pastor':
      return 'Lelkipásztori profil'
    case 'esperes':
      return 'Esperesi profil'
    case 'konyvelo':
      return 'Könyvelői profil'
    case 'egyhazmegyei_szamvevo':
    case 'egyhazkeruleti_szamvevo':
      return 'Számvevői profil'
    case 'egyhazmegyei_admin':
      return 'Egyházmegyei adminisztrátori profil'
    case 'egyhazkeruleti_admin':
      return 'Egyházkerületi adminisztrátori profil'
    case 'admin':
    case 'master_admin':
    case 'master':
      return 'Rendszergazdai profil'
    default:
      return 'Profil'
  }
}

/**
 * A `profiles.status` ÉLŐ értékkészlete. A tábla CHECK nélkül tárolja; az
 * írók: handle_new_user ('pending'), admin_activate_user ('active'),
 * admin_reject_user ('rejected'), erase_my_account ('deleted').
 *
 * A felmérés (data-4): a dialógus eddig `=== 'active' ? 'Aktív' : 'Várakozik'`
 * volt — az elutasított és a törölt profil is „Várakozik"-nak látszott.
 */
export const PROFILE_STATUS_LABELS: Record<string, string> = {
  pending: 'Jóváhagyásra vár',
  active: 'Aktív',
  rejected: 'Elutasítva',
  deleted: 'Törölt',
}

/**
 * Státusz-címke. Ismeretlen kulcsnál a NYERS kulcsot adja vissza és jelzi,
 * hogy ismeretlen — a felület ⚠️-t tehet mellé (néma hamis címke tilos).
 */
export function getProfileStatusLabel(status: string | null | undefined): { label: string; ismeretlen: boolean } {
  if (!status) return { label: 'Nincs státusz', ismeretlen: true }
  const label = PROFILE_STATUS_LABELS[status]
  return label ? { label, ismeretlen: false } : { label: status, ismeretlen: true }
}

export type { ProfileRoleScope, ProfileRoleType }
