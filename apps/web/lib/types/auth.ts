import type { DebtCalcMode } from '@/lib/constants/finance'

export type Role =
  | 'lelkesz'
  | 'esperes'
  | 'egyhazmegyei_admin'
  | 'egyhazkeruleti_admin'
  | 'admin'
  | 'konyvelo'
  | 'egyhazmegyei_szamvevo'

export type ProfileStatus = 'pending' | 'active'

export interface Profile {
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
