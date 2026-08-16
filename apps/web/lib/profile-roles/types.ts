/**
 * Profile roles — TypeScript típusok.
 *
 * ALAPELV (2026-04-17): egy felhasználónak több szerep + hatókör lehet.
 * Az aktív kontextust a JWT custom claim (jövőbeli) vagy cookie tárolja.
 */

export type ProfileRoleScope = 'system' | 'district' | 'diocese' | 'congregation'

export type ProfileRoleType =
  | 'admin'
  | 'egyhazkeruleti_admin'
  // 2026-08-15 (egyházkerületi S1): a 3. szint ELLENŐRE — csak olvas.
  | 'egyhazkeruleti_szamvevo'
  | 'egyhazmegyei_admin'
  | 'esperes'
  | 'egyhazmegyei_szamvevo'
  | 'lelkesz'
  | 'konyvelo'
  | 'custom'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revoked'

// 12 modul a rendszerben
export type ModuleKey =
  | 'penzugy'
  | 'tagnyilvantartas'
  | 'anyakonyv'
  | 'munkanaplo'
  | 'iktato'
  | 'leltar'
  | 'sirhelyek'
  | 'mm' // missziós műhely
  | 'publikus_oldal'
  | 'jegyzokonyvek'
  | 'eves_jelentes'
  | 'admin' // admin panel (csak admin/kerületi admin)

// 6 akció típus
export type ActionKey = 'read' | 'write' | 'delete' | 'finalize' | 'export' | 'import'

/**
 * Permissions — rugalmas JSONB object.
 * Hiányzó modul / action → FALSE (alapértelmezett).
 *
 * Példa:
 * {
 *   penzugy: { read: true, write: true, finalize: true },
 *   tagnyilvantartas: { read: true, write: true }
 * }
 */
export type Permissions = {
  [M in ModuleKey]?: {
    [A in ActionKey]?: boolean
  }
}

export interface ProfileRoleRow {
  id: string
  profile_id: string
  scope: ProfileRoleScope
  scope_id: string | null
  role: ProfileRoleType
  custom_label: string | null
  permissions: Permissions
  approval_status: ApprovalStatus
  approval_reason: string | null
  granted_by: string | null
  granted_at: string
  approved_by: string | null
  approved_at: string | null
  revoked_by: string | null
  revoked_at: string | null
  revoked_reason: string | null
  active: boolean
}

// Magyar címkék UI-hoz
export const SCOPE_LABELS: Record<ProfileRoleScope, string> = {
  system: 'Teljes rendszer',
  district: 'Egyházkerület',
  diocese: 'Egyházmegye',
  congregation: 'Gyülekezet',
}

export const ROLE_LABELS: Record<ProfileRoleType, string> = {
  admin: 'Rendszergazda',
  egyhazkeruleti_admin: 'Egyházkerületi admin',
  egyhazkeruleti_szamvevo: 'Egyházkerületi számvevő',
  egyhazmegyei_admin: 'Egyházmegyei admin',
  esperes: 'Esperes',
  egyhazmegyei_szamvevo: 'Egyházmegyei számvevő',
  lelkesz: 'Lelkipásztor',
  konyvelo: 'Könyvelő',
  custom: 'Egyedi szerepkör',
}

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Jóváhagyásra vár',
  approved: 'Aktív',
  rejected: 'Elutasítva',
  revoked: 'Visszavonva',
}
