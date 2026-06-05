/**
 * Broadcast üzenet típusok.
 * 'use server' fájlból nem exportálható const/type — ezért van külön fájlban.
 */

export type BroadcastTipus = 'info' | 'success' | 'warning' | 'danger' | 'release'

export type BroadcastTargetScope = 'all' | 'role' | 'congregation' | 'diocese' | 'district'

export type BroadcastTargetRole =
  | 'lelkesz'
  | 'esperes'
  | 'egyhazmegyei_admin'
  | 'egyhazkeruleti_admin'
  | 'admin'
  | 'konyvelo'
  | 'egyhazmegyei_szamvevo'

export type ReleaseCategory = 'bugfix' | 'feature' | 'improvement' | 'security' | 'breaking'

export interface BroadcastComposeInput {
  cim: string
  uzenet: string
  tipus: BroadcastTipus
  hivatkozas?: string | null
  targetScope: BroadcastTargetScope
  targetRole?: BroadcastTargetRole | null
  targetCongregationIds?: string[]
  targetDioceseIds?: string[]
  targetDistrictIds?: string[]
  sendEmail: boolean
  releaseVersion?: string | null
  releaseCategory?: ReleaseCategory | null
  releaseChangelogKey?: string | null
}

export interface BroadcastRow {
  id: string
  sent_by: string
  sent_at: string
  cim: string
  uzenet: string
  tipus: BroadcastTipus
  hivatkozas: string | null
  target_scope: BroadcastTargetScope
  target_role: BroadcastTargetRole | null
  target_congregation_ids: string[] | null
  target_diocese_ids: string[] | null
  target_district_ids: string[] | null
  send_email: boolean
  email_sent_at: string | null
  email_error: string | null
  recipient_count: number
  release_version: string | null
  release_category: ReleaseCategory | null
  release_changelog_key: string | null
}

export interface ChangelogBroadcastStatus {
  sentAt: string
  recipientCount: number
  targetScope: BroadcastTargetScope
  targetRole: BroadcastTargetRole | null
  sendEmail: boolean
  emailSentAt: string | null
  emailError: string | null
}

export interface ChangelogEntry {
  key: string
  date: string
  title: string
  category: ReleaseCategory | null
  version: string | null
  targetsHint: string | null
  bodyMarkdown: string
  /** True, ha már broadcast-olva lett (meglévő release_changelog_key a DB-ben) */
  alreadySent: boolean
  broadcastStatus: ChangelogBroadcastStatus | null
  /**
   * True, ha a bejegyzés a "régi/archivált" küszöb (NEWSLETTER_READ_CUTOFF) előtti,
   * és nem lett ténylegesen kiküldve — ezeket NEM küldjük ki hírlevélben, és nem
   * számítanak "kiküldésre vár"-nak. (Endre kérése 2026-06-05: a május előtti
   * bejegyzések legyenek olvasottnak tekintve.)
   */
  readMarked?: boolean
}

/**
 * A változásnapló-küszöb: az ennél a dátumnál régebbi (és még ki nem küldött)
 * bejegyzéseket "olvasott / archivált" állapotúnak tekintjük — nem kerülnek bele
 * a hírlevélbe és a "kiküldésre vár" listába.
 */
export const NEWSLETTER_READ_CUTOFF = '2026-05-01'

export const BROADCAST_TIPUS_LABELS: Record<BroadcastTipus, string> = {
  info: 'Tájékoztatás',
  success: 'Sikeres művelet',
  warning: 'Figyelmeztetés',
  danger: 'Fontos/sürgős',
  release: 'Új verzió / frissítés',
}

export const BROADCAST_TARGET_SCOPE_LABELS: Record<BroadcastTargetScope, string> = {
  all: 'Mindenki',
  role: 'Szerepkör szerint',
  congregation: 'Konkrét gyülekezet(ek)',
  diocese: 'Konkrét egyházmegyé(k)',
  district: 'Egyházkerület',
}

export const BROADCAST_TARGET_ROLE_LABELS: Record<BroadcastTargetRole, string> = {
  lelkesz: 'Lelkipásztorok',
  esperes: 'Esperesek',
  egyhazmegyei_admin: 'Egyházmegyei adminok',
  egyhazkeruleti_admin: 'Egyházkerületi adminok',
  admin: 'Rendszergazdák',
  konyvelo: 'Könyvelők',
  egyhazmegyei_szamvevo: 'Egyházmegyei számvevők',
}

export const RELEASE_CATEGORY_LABELS: Record<ReleaseCategory, string> = {
  bugfix: 'Hibajavítás',
  feature: 'Új funkció',
  improvement: 'Fejlesztés',
  security: 'Biztonsági javítás',
  breaking: 'Átalakító változás',
}

// Szerepkör opciók — az UI dropdown-hoz (NEM 'server-only' — kliens importolhatja)
export const ROLE_OPTIONS: Array<{ value: BroadcastTargetRole; label: string }> = [
  { value: 'lelkesz', label: 'Lelkipásztorok' },
  { value: 'esperes', label: 'Esperesek' },
  { value: 'egyhazmegyei_admin', label: 'Egyházmegyei adminok' },
  { value: 'egyhazkeruleti_admin', label: 'Egyházkerületi adminok' },
  { value: 'admin', label: 'Rendszergazdák' },
  { value: 'konyvelo', label: 'Könyvelők' },
  { value: 'egyhazmegyei_szamvevo', label: 'Egyházmegyei számvevők' },
]
