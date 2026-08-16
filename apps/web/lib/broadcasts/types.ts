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
  // 2026-08-15 (egyhazkeruleti S1)
  | 'egyhazkeruleti_szamvevo'

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

/**
 * KÉZI jelölés egy CHANGELOG-bejegyzésen (2026-08-12).
 *
 * KÖZÖS (nem személyes) — a `changelog_jelolesek` tábla egy sora. Az indoklás
 * a `migration-docs/sql/2026-08-12-changelog-jelolesek.sql` fejlécében áll.
 */
export interface ChangelogJeloles {
  /** Csillagozott („Kiemelt") bejegyzés. */
  kiemelt: boolean
  kiemelteNev: string | null
  kiemelveAt: string | null
  /**
   * KÉZZEL kiküldöttnek jelölve. ⚠️ Ez NEM valódi kiküldés — a felületen
   * SOHA nem szabad ugyanazzal a jelvénnyel mutatni, mint az `alreadySent`-et.
   */
  kikuldottnekJelolveAt: string | null
  kikuldottnekJelolteNev: string | null
  megjegyzes: string | null
}

export interface ChangelogEntry {
  key: string
  /**
   * True, ha a bejegyzésnek NINCS saját `<!-- key: -->` mezője, ezért a kulcs a
   * CÍMBŐL generálódott. Néma csapda: egy elgépelés-javítás a címben új kulcsot
   * csinál, és a korábbi kiküldés „elveszik". A felület ezt kiírja.
   */
  keyGenerated: boolean
  /** A dátum sima része (ÉÉÉÉ-HH-NN) — rendezéshez és a küszöb-számításhoz. */
  date: string
  /** A fejléc TELJES címkéje a betűtoldalékkal (pl. `2026-05-06c`). */
  dateLabel: string
  title: string
  category: ReleaseCategory | null
  version: string | null
  targetsHint: string | null
  bodyMarkdown: string
  /** True, ha már broadcast-olva lett (meglévő release_changelog_key a DB-ben) */
  alreadySent: boolean
  broadcastStatus: ChangelogBroadcastStatus | null
  /** Kézi jelölés (csillag / „kiküldöttnek jelölve"). `null` = nincs jelölve. */
  jeloles: ChangelogJeloles | null
  /**
   * True, ha a bejegyzés archivált: nem lett ténylegesen kiküldve, nincs kézi
   * jelölése, ÉS a rendszer mégsem kínálja fel kiküldésre. KÉT ok lehet:
   *  · a "régi/archivált" küszöb (NEWSLETTER_READ_CUTOFF) előtti — Endre kérése
   *    2026-06-05: a május előtti bejegyzések legyenek olvasottnak tekintve;
   *  · a 2026-08-12-es elemző-javítás hozta felszínre (betűvel toldott dátumú
   *    fejléc a javítás előttről) — lásd `elemzoJavitasHoztaFelszinre()`.
   * Az archivált bejegyzések a felületen az összecsukható „Archivált korábbi
   * bejegyzések" csoportban végig megnézhetők; nem tűnnek el.
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
  egyhazkeruleti_szamvevo: 'Egyházkerületi számvevők',
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
  { value: 'egyhazkeruleti_szamvevo', label: 'Egyházkerületi számvevők' },
]
