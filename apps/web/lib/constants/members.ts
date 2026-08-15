// ── Státusz szűrők ───────────────────────────────────────────

export const MEMBER_STATUS_FILTERS = [
  { value: 'aktív', label: 'Aktív gyülekezeti tagok' },
  { value: 'meghalt', label: 'Elhunyt tagok' },
  { value: 'elkoltozott', label: 'Elköltözöttek' },
  { value: 'kitert', label: 'Kitértek' },
  { value: 'mas_vallasu', label: 'Más vallásúak' },
  { value: 'lebego', label: 'Csak család nélküli tagok' },
  { value: 'mind', label: 'Mindenki' },
] as const

export type MemberStatusFilter = typeof MEMBER_STATUS_FILTERS[number]['value']

// ── Fizetési státusz badge-ek ────────────────────────────────

export type PaymentStatus = 'elhunyt' | 'elkoltozott' | 'kitert' | 'felmentett' | 'rendezve' | 'hatralekos'

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; variant: string; icon?: string }> = {
  elhunyt: { label: 'Elhunyt', variant: 'bg-gray-200 text-gray-700' },
  elkoltozott: { label: 'Elköltözött', variant: 'bg-gray-100 text-gray-500' },
  kitert: { label: 'Kitért', variant: 'bg-amber-100 text-amber-700' },
  felmentett: { label: 'Felmentett', variant: 'bg-amber-100 text-amber-700', icon: '🛡️' },
  rendezve: { label: 'Rendezve', variant: 'bg-green-100 text-green-700', icon: '✓' },
  hatralekos: { label: 'Hátralékos', variant: 'bg-red-100 text-red-700' },
}

// ── Korcsoportok (11 db — áttekintés) ────────────────────────

export const AGE_GROUPS = [
  { key: '0-6', label: 'Kisgyermek', color: '#4dabf7' },
  { key: '7-12', label: 'Gyermek', color: '#3bc9db' },
  { key: '13-14', label: 'Serdülő', color: '#38d9a9' },
  { key: '15-18', label: 'Ifjú', color: '#69db7c' },
  { key: '19-30', label: 'Fiatal felnőtt', color: '#a9e34b' },
  { key: '31-40', label: 'Felnőtt', color: '#ffd43b' },
  { key: '41-65', label: 'Középkorú', color: '#ffa94d' },
  { key: '66-75', label: 'Idős', color: '#ff8787' },
  { key: '76-80', label: 'Agg', color: '#e599f7' },
  { key: '81-100', label: 'Matuzsálem', color: '#b197fc' },
  { key: '100+', label: 'Százéves+', color: '#da77f2' },
] as const

// ── Belépés oka ──────────────────────────────────────────────

export const ENTRY_REASONS = ['alap', 'bekoltozott', 'attert'] as const
export type EntryReason = typeof ENTRY_REASONS[number]

export const ENTRY_REASON_LABELS: Record<EntryReason, string> = {
  alap: 'Helyi gyülekezeti tag',
  bekoltozott: 'Beköltözött',
  attert: 'Áttért',
}

// ── Kivezetés oka ────────────────────────────────────────────
// 2026-08-15 (desktop-paritás 2. szelet): a kivezetés szótára a közös
// @kartoteka/validations csomagba került (members/szemely-remove.ts) — a
// desktop is onnan olvassa. Innen re-export a meglévő webes importok kedvéért.

export { REMOVE_REASONS, REMOVE_REASON_LABELS } from '@kartoteka/validations'
export type { RemoveReason } from '@kartoteka/validations'

// ── Rendezési oszlopok ───────────────────────────────────────

export const SORT_COLUMNS = ['name', 'age', 'birth', 'address', 'job', 'id'] as const
export type SortColumn = typeof SORT_COLUMNS[number]

// ── Nem-heurisztika kivétel lista (férfi nevek a/e végződéssel) ──

export const MALE_NAME_EXCEPTIONS = [
  'béla', 'árpád', 'attila', 'géza', 'kálmán', 'zoltán', 'milán',
  'iván', 'nándor', 'andor', 'tibor', 'ödön', 'ábrahám', 'illés',
  'tamás', 'andrás', 'lukács', 'miklós', 'péter', 'viktor',
]

// ── Enriched Member interface ────────────────────────────────

export interface MemberRow {
  id: number
  cnp: string | null
  csaladnev: string | null
  k_nev: string | null
  szcs_nev: string | null
  namepattern: string | null
  ferfi: boolean | null
  sz_datum: string | null
  sz_helyid: number | null
  foglalkozas: string | null
  vallas: string | null
  telefon: string | null
  email: string | null
  meghalt: boolean
  elkoltozott: boolean
  member_status: string | null
  isvisible: boolean
  // 2026-06-10 (Fázis 5): GDPR-hozzájárulások + választói jogosultság
  photo_url: string | null
  gdpr_consent_at: string | null
  photo_consent: boolean | null
  mailing_consent: boolean | null
  // #1 (2026-07-02): közösségi profil-link (a fénykép ebből tölthető) — az űrlap előtölti/menti
  social_profil_url: string | null
  voter_eligible: boolean | null
  voter_manual_override: number | null
  type: string | null
  befizetoev: number | null
  allapot: string | null
  id_apja: string | null
  id_anyja: string | null
  apjaneve: string | null
  anyjaneve: string | null
  megjegyzes: string | null
  c_helysegid: number | null
  c_utcaid: number | null
  c_szam: string | null
  c_tombhaz: string | null
  c_lepcsohaz: string | null
  c_emelet: string | null
  c_ajto: string | null
  congregation_id: string | null
  adrstreet: { name: string } | null
  adrlocality: { name: string } | null
  /** A születési hely feloldott neve (`sz_helyid` → `adrlocality`). */
  birthLocality: { name: string } | null
}

export interface EnrichedMember extends MemberRow {
  paymentStatus: PaymentStatus
  familyId: number | null
  /** Átjelentkezési kérelem folyamatban (member_transfer_notifications.status='pending').
   *  Ha kitöltött, a tagnyilvántartásban 🚪 badge jelenik meg ezzel a célgyülekezettel.
   *  2026-04-30 — Endre kérése. */
  pendingTransfer: {
    id: string
    target_congregation_name: string
    created_at: string
  } | null
  /** Bármikor fizetett egyházfenntartási járulékot (bármely évben).
   *  Az aktív-tag számítás használja: református VAGY hasEverPaid → aktív.
   *  2026-04-30 — Endre kérése. */
  hasEverPaid: boolean
}
