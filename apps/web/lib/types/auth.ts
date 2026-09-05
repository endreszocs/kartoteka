import type { DebtCalcMode } from '@/lib/constants/finance'

export type Role =
  | 'lelkesz'
  | 'esperes'
  | 'egyhazmegyei_admin'
  | 'egyhazkeruleti_admin'
  | 'admin'
  | 'konyvelo'
  | 'egyhazmegyei_szamvevo'
  // 2026-08-15 (egyházkerületi S1): a 3. szint ELLENŐRE. Az egyházkerületi
  // adminisztrátor ÍR, a kerületi számvevő CSAK OLVAS — pontosan úgy, ahogy a
  // megyei szinten az esperes ⇄ egyházmegyei számvevő páros.
  | 'egyhazkeruleti_szamvevo'

/**
 * A `profiles.status` ÉLŐ értékkészlete (2026-09-05, P3-utómunka).
 *
 * A táblán NINCS CHECK (a migration-docs/sql egyetlen fájlja sem tesz rá) — az
 * értékkészletet az ÍRÓK adják, és a típus eddig csak kettőt ismert belőlük:
 *   · 'pending'  — handle_new_user (2026-05-02 / 2026-09-04 auth-P0),
 *   · 'active'   — admin_activate_user (2026-05-04, 2026-07-01), transfer_execute,
 *   · 'rejected' — admin_reject_user (2026-05-04-admin-user-status-rpc.sql:183),
 *   · 'deleted'  — erase_my_account / admin-törlés (2026-06-05f/h).
 * A régi 'approved' értéket a 2026-05-02-profiles-approved-to-active.sql
 * egyszer s mindenkorra 'active'-ra írta át — a típusban nem szerepel.
 *
 * A `PROFILE_STATUS_VALUES` a futásidejű őr (típus-guard + kimerítő
 * címke-térkép a `lib/profile-roles/labels.ts`-ben: `Record<ProfileStatus, …>`,
 * így egy új érték fordítási hibával kényszeríti ki a címkét).
 */
export const PROFILE_STATUS_VALUES = ['pending', 'active', 'rejected', 'deleted'] as const
export type ProfileStatus = (typeof PROFILE_STATUS_VALUES)[number]

export function isProfileStatus(value: unknown): value is ProfileStatus {
  return typeof value === 'string' && (PROFILE_STATUS_VALUES as readonly string[]).includes(value)
}

export interface Profile {
  /** 2026-09-05: optimista egyidejűség-kapu a profil-mentéshez (profiles.revision). */
  revision?: number | null
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  congregation: string | null
  birth_date: string | null
  status: ProfileStatus
  role: Role
  congregation_id: string | null
  diocese_id: string | null
  district_id: string | null
  created_at: string
  // 2026-06-01: a layout-fetch optimalizációhoz — ha mindkettő igaz, az
  // onboarding-state lekérdezés (welcome-status + walkthrough-check)
  // teljesen átugorható.
  onboarding_completed_at?: string | null
  walkthrough_completed?: boolean | null
}

export interface Congregation {
  id: string
  name: string
  nev_hu: string | null
  nev_ro: string | null
  nev_en: string | null
  diocese: string | null
  diocese_id: string | null
  adoszam: string | null
  cim: string | null
  email: string | null
  telefon: string | null
  web: string | null
  eves_jarulek: number | null
  jarulek_kedvezmenyes: number | null
  jarulek_hatarid: string | null
  iban: string | null
  bank: string | null
  cimer_url: string | null
  tartozas_szamitas_mod: DebtCalcMode | null
}

export interface Diocese {
  id: string
  name: string
  district_id: string | null
}

export interface AdminAccessRequest {
  id: string
  admin_user_id: string
  congregation_id: string
  pastor_user_id: string | null
  reason: string
  status: 'pending' | 'approved' | 'denied' | 'expired'
  approved_at: string | null
  denied_at: string | null
  expires_at: string | null
  created_at: string
}

// Számított értékek a layout-ban — NEM DB oszlopok
export interface AuthContext {
  profile: Profile
  isMasterAdmin: boolean
  isAdmin: boolean
  isEsperes: boolean
  hasCongregation: boolean
  isGodMode: boolean
  congregationName: string | null
  congregationLogo: string | null
  override: {
    active: boolean
    congregationName?: string
    remainingMinutes?: number
  } | null
}
