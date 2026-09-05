/**
 * A profil-dialógus szerver-akcióinak TÍPUSAI és a mentés zod-sémája
 * (2026-09-05, profil-kör).
 *
 * Külön fájl, mert a Next.js 16-ban egy `'use server'` modul KIZÁRÓLAG async
 * függvényeket exportálhat: típus vagy konstans ott fordítási hibát ad.
 * (Projekt-konvenció: `*-shared.ts` testvérfájl.) A séma direktíva-mentes,
 * hogy a kliens-dialógus ELŐ-ellenőrzésre ugyanazt futtassa, amit a szerver
 * végül számon kér — egy igazságforrás, nincs két, széthúzó szabálykészlet.
 */

import { z } from 'zod'

// ── Konstansok ───────────────────────────────────────────────────────────────

export const PROFILE_PHOTO_MAX_BYTES = 2_097_152
export const PROFILE_PHOTO_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** A profil-dialógus megnyitását kérő ablak-esemény (a /profile hero gombja küldi). */
export const OPEN_PROFILE_DIALOG_EVENT = 'kartoteka:open-profile-dialog'

// ── Mentés-séma ──────────────────────────────────────────────────────────────

const DATUM_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/
// Laza telefon-minta: +, számjegyek, szóköz, zárójel, pont, perjel, kötőjel.
// Szigorú nemzetközi formátumot NEM követelünk (vezetékes, román, magyar).
const TELEFON_LAZA = /^[+0-9 ()./-]{6,20}$/

/** A mai nap `YYYY-MM-DD` alakban (a hívó zónájában — a szerver Bukarestben). */
export function maiNapKulcs(tz?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    ...(tz ? { timeZone: tz } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Üres sztring = „nincs megadva" — a séma mindkettőt elfogadja, a mentés null-t ír. */
const uresVagy = <T extends z.ZodTypeAny>(schema: T) => z.union([z.literal(''), schema])

const datumVagyUres = (hibauzenet: string) =>
  uresVagy(
    z
      .string()
      .regex(DATUM_YYYY_MM_DD, hibauzenet)
      .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), hibauzenet),
  )

const telefonVagyUres = uresVagy(
  z.string().trim().regex(TELEFON_LAZA, 'A telefonszám csak számjegyet, szóközt, +, (), ., / és - jelet tartalmazhat (6–20 karakter).'),
)

export const serviceHistoryRowSchema = z
  .object({
    hely: z.string().trim().min(1, 'A szolgálati hely neve kötelező.').max(200, 'A hely neve legfeljebb 200 karakter.'),
    szerep: z.string().trim().max(120, 'A szerep legfeljebb 120 karakter.'),
    evTol: z.number().int().min(1900, 'A kezdő év 1900 és 2100 közé essen.').max(2100, 'A kezdő év 1900 és 2100 közé essen.').nullable(),
    evIg: z.number().int().min(1900, 'A záró év 1900 és 2100 közé essen.').max(2100, 'A záró év 1900 és 2100 közé essen.').nullable(),
    megjegyzes: z.string().trim().max(500, 'A megjegyzés legfeljebb 500 karakter.'),
  })
  .refine((r) => r.evIg == null || r.evTol == null || r.evIg >= r.evTol, {
    message: 'A záró év nem lehet korábbi a kezdő évnél.',
    path: ['evIg'],
  })

export const profileSaveSchema = z.object({
  fullName: z.string().trim().min(2, 'A teljes név legalább 2 karakter legyen.').max(120, 'A teljes név legfeljebb 120 karakter.'),
  phone: telefonVagyUres,
  birthDate: datumVagyUres('A születési dátum ÉÉÉÉ-HH-NN alakú legyen.'),
  displayTitle: z.string().trim().max(80, 'A szolgálati cím legfeljebb 80 karakter.'),
  address: z.string().trim().max(300, 'A cím legfeljebb 300 karakter.'),
  emergencyPhone: telefonVagyUres,
  serviceStartedAt: datumVagyUres('A szolgálat kezdete ÉÉÉÉ-HH-NN alakú legyen.'),
  previousRoles: z.array(z.string().trim().max(120)).max(30, 'Legfeljebb 30 korábbi szerepkör adható meg.'),
  bio: z.string().max(4000, 'A bemutatkozás legfeljebb 4000 karakter.'),
  ministryNotes: z.string().max(4000, 'A szolgálati megjegyzés legfeljebb 4000 karakter.'),
  serviceHistory: z.array(serviceHistoryRowSchema).max(50, 'Legfeljebb 50 szolgálati hely rögzíthető.'),
  /**
   * A `profiles.revision` a betöltéskor. A mentés `.eq('revision', …)`-nel ír:
   * ha közben más (asztali app, varázsló) módosította, 0 sor → hangos hiba,
   * néma last-writer-wins helyett. `null` = régi kliens, kapu nélkül.
   */
  expectedRevision: z.number().int().nonnegative().nullable(),
  /**
   * A betöltéskor kapott SZERKESZTHETŐ alapmezők. A `profiles.revision`-t MINDEN
   * update bumpolja — az óránkénti `last_seen_at` heartbeat is —, ezért egy
   * revision-eltérés önmagában nem bizonyít ütközést. Ha az élő sor szerkeszthető
   * mezői még mindig ezek, a bump nem-szerkeszthető oszlopból jött, és a mentés
   * a friss revision-nel biztonságosan újrapróbálható.
   */
  betoltottAlap: z
    .object({
      fullName: z.string().nullable(),
      phone: z.string().nullable(),
      birthDate: z.string().nullable(),
    })
    .nullable(),
})

export type ProfileSaveInput = z.infer<typeof profileSaveSchema>
export type ServiceHistoryInput = z.infer<typeof serviceHistoryRowSchema>

// ── Szolgálati előzmény: „változott-e" ──────────────────────────────────────

export type ServiceHistoryOsszevetesSor = {
  hely: string
  szerep: string | null
  evTol: number | null
  evIg: number | null
  megjegyzes: string | null
}

/** Egy sor normalizált kulcsa (trim, üres = null) — a tartalom, id és sorrend nélkül. */
export const shKulcs = (r: ServiceHistoryOsszevetesSor) =>
  JSON.stringify([r.hely.trim(), (r.szerep || '').trim(), r.evTol, r.evIg, (r.megjegyzes || '').trim()])

/**
 * SORRENDTARTÓ összevetés a mentés előtti (adatbázis) és a beküldött lista között.
 *
 * MIÉRT sorrendtartó: a sorrend a szerkeszthető állapot része — a szerkesztő
 * „1. / 2. szolgálati hely"-ként mutatja, a mentés `sorrend = index`-et ír.
 * ELŐFELTÉTEL: mindkét lista a KANONIKUS rendben érkezik (a szerver egyetlen
 * rendezett lekérése adja a betöltést és a mentés-előtti olvasást is). Ha a két
 * oldal más rendben jönne, azonos tartalomra is „változott"-at mondana — ez volt
 * a hiba: minden mentés törölt+újraírt, és hamis audit-bejegyzést írt.
 */
export function shValtozottE(regi: ServiceHistoryOsszevetesSor[], uj: ServiceHistoryOsszevetesSor[]): boolean {
  if (regi.length !== uj.length) return true
  return regi.some((r, i) => shKulcs(r) !== shKulcs(uj[i]))
}

/** Mezőnkénti hibatérkép a zod-eredményből — a dialógus a mező alá írja. */
export function zodHibakMezonkent(error: z.ZodError): { fieldErrors: Record<string, string>; elso: string } {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    // `serviceHistory.2.evIg` → a sor-szerkesztő saját kulcsa; egyébként az első szegmens.
    const kulcs = issue.path.length > 0 ? issue.path.map(String).join('.') : '_'
    if (!fieldErrors[kulcs]) fieldErrors[kulcs] = issue.message
  }
  const elso = error.issues[0]?.message || 'Érvénytelen adat.'
  return { fieldErrors, elso }
}

/**
 * A DÁTUMOK NEM LEHETNEK JÖVŐBELIEK (születés, szolgálat kezdete). Külön
 * függvény, mert a „ma" a szerveren Bukarest, a kliensen a böngésző zónája —
 * a séma maga zóna-független marad.
 */
export function jovobeliDatumHibak(input: Pick<ProfileSaveInput, 'birthDate' | 'serviceStartedAt'>, ma: string): Record<string, string> {
  const hibak: Record<string, string> = {}
  if (input.birthDate && input.birthDate > ma) hibak.birthDate = 'A születési dátum nem lehet a mai napnál későbbi.'
  if (input.serviceStartedAt && input.serviceStartedAt > ma) hibak.serviceStartedAt = 'A szolgálat kezdete nem lehet a mai napnál későbbi.'
  return hibak
}

// ── A dialógus adat-szerződése ───────────────────────────────────────────────

export type ProfileScope = 'system' | 'district' | 'diocese' | 'congregation'

export interface ProfileDialogRoleRow {
  id: string
  scope: ProfileScope
  scopeId: string | null
  scopeName: string
  role: string
  customLabel: string | null
  grantedAt: string
  approvedAt: string | null
  approvedBy: string | null
  /** A Fázis-1 backfill sora: `approved_by` NULL és az `approved_at` a fiók napja. */
  orokolt: boolean
  aktiv: boolean
}

export interface ProfileDialogData {
  id: string
  /** Az AUTH e-mail (kanonikus, ezzel lép be). */
  email: string | null
  /** A `profiles.email` — csak eltérés-jelzésre. */
  emailNyilvantartott: string | null
  emailElteres: boolean
  fullName: string | null
  phone: string | null
  birthDate: string | null
  /** `profiles.role` — a nyilvántartott ELSŐDLEGES (legacy skalár) szerep. */
  role: string | null
  status: string
  createdAt: string | null
  revision: number | null
  /** Az AKTÍV kontextus (profile_roles sor a sütiből) — a felület igazsága. */
  aktiv: {
    id: string
    role: string
    customLabel: string | null
    scope: ProfileScope
    scopeName: string
  } | null
  /** `false` = a profile_roles NEM volt olvasható (fail-closed jelzés a felületen). */
  profileRolesFeloldhato: boolean
  /** Az aktív gyülekezet (gyülekezeti hatókörben), rövid magyar név. */
  congregationName: string | null
  /** A gyülekezet HIVATALOS neve (tooltip), ha eltér a rövidtől. */
  congregationOfficialName: string | null
  /** Egyházmegye a GYÜLEKEZET LÁNCÁBÓL (congregations.diocese_id → dioceses). */
  dioceseName: string | null
  /** Egyházkerület a láncból (dioceses.district_id → districts). */
  districtName: string | null
  /** A `profiles.diocese_id` skalár eltér a gyülekezet láncától. */
  dioceseElteres: boolean
  /** A skalár neve, ha eltér — a ⚠️ sor kiírja, mit tart nyilván a rendszer. */
  dioceseNyilvantartott: string | null
  /**
   * A gyülekezet/egyházmegye lánc-lekérésének HIBÁJA (átmeneti DB- vagy RLS-hiba,
   * nem látható sor). Ilyenkor a nevek a fejléc gyorstárából jönnek (vagy
   * hiányoznak), és az egyházmegye-eltérés ellenőrzése NEM futott le — a
   * felület ezt kimondja, nem „Nincs hozzárendelve"-t állít.
   */
  lancHiba: string | null
  /** A nyilvántartott (profiles.congregation_id) gyülekezet, ha NEM az aktív. */
  nyilvantartottCongregationName: string | null
  avatarUrl: string | null
  avatarSource: string | null
  /** Van-e Google-fiók-kép, amire „Google-fotó használata" gombbal át lehet váltani. */
  googlePictureElerheto: boolean
  extensionReady: boolean
  extensionMessage: string | null
  pastorProfile: {
    displayTitle: string
    address: string
    emergencyPhone: string
    serviceStartedAt: string
    /** Régi (szöveges) bejegyzések — CSAK OLVASHATÓ, a strukturált sorok mellett deduplikálva. */
    previousServicePlaces: string[]
    previousRoles: string[]
    bio: string
    ministryNotes: string
  }
  helyNaplo: Array<{
    id: string
    congregationNev: string | null
    elozoCongregationNev: string | null
    jelleg: 'kezdeti' | 'valtozas'
    createdAt: string
  }>
  serviceHistory: Array<{
    id: string
    hely: string
    szerep: string | null
    evTol: number | null
    evIg: number | null
    megjegyzes: string | null
  }>
  profileRoles: ProfileDialogRoleRow[]
}

export interface ProfileSaveResult {
  success?: string
  error?: string
  fieldErrors?: Record<string, string>
  /** Nem-blokkoló figyelmeztetés (pl. a régi sorok törlése nem sikerült). */
  warning?: string
  extensionReady?: boolean
  data?: ProfileDialogData | null
}

export interface ProfilePhotoResult {
  ok?: boolean
  error?: string
  warning?: string
  avatarUrl?: string | null
  avatarSource?: string | null
}
