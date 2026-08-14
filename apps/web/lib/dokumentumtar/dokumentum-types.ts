/**
 * Gyülekezeti dokumentumtár (7. pont A szelet) — típusok és storage-konstansok.
 *
 * Sima lib (NEM 'use server') — kliens-oldalról is importálható, így a
 * dokumentumtár-felület és a server actions ugyanazokat a konstansokat
 * használják (bucket-név, méret-limit, engedélyezett MIME-típusok,
 * kategória-készlet).
 *
 * DB-kontraktus: migration-docs/sql/2026-08-15-dokumentumtar-gyulekezeti-fajlok.sql
 *
 * ÚTVONAL-KONVENCIÓ (Endre döntése, a név-slug hibaosztály ellen):
 *   {congregation_id}/{kategoria}/{uuid}-{fájlnév}
 * — az út MINDIG a gyülekezet AZONOSÍTÓJÁBÓL épül, SOHA nem a nevéből
 * (átnevezés = néma fájlvesztés volt a korábbi, slug-alapú webes mappánál).
 */

// Közös helperek az iktató-csatolmány libből — SZÁNDÉKOSAN import, nem
// másolat (munkaszabály: ne írjunk széthúzó duplikátumot).
import { sanitizeCsatolmanyFileName, formatBytes } from '@/lib/iktato/csomo-types'

// ─────────────────────────────────────────────────────────────────
// Kategóriák — a DB CHECK-kel és a storage-policy 2. szegmens-kötésével
// bit-azonos zárt készlet
// ─────────────────────────────────────────────────────────────────

export const GYDOK_KATEGORIAK = [
  {
    key: 'szallitoi-szamlak',
    label: 'Szállítói számlák',
    description:
      'Befogadott számlák: e-Factura XML, PDF, ANAF-os ZIP. Az SPV csak 60 napig őrzi őket — a törvény szerint 5–10 évig meg kell őrizni.',
  },
  {
    key: 'bizonylatok',
    label: 'Bizonylatok',
    description: 'Nyugták, banki kivonatok, kimutatások és egyéb pénzügyi bizonylatok.',
  },
  {
    key: 'szerzodesek',
    label: 'Szerződések',
    description: 'Bérleti, szolgáltatási és egyéb szerződések, megállapodások.',
  },
  {
    key: 'egyeb',
    label: 'Egyéb dokumentumok',
    description: 'Minden más gyülekezeti irat és fájl, ami nem illik a többi mappába.',
  },
] as const

export type GydokKategoria = (typeof GYDOK_KATEGORIAK)[number]['key']

/** A kategória-kulcsok listája (validációhoz). */
export const GYDOK_KATEGORIA_KEYS = GYDOK_KATEGORIAK.map((k) => k.key) as GydokKategoria[]

export function isGydokKategoria(value: string | null | undefined): value is GydokKategoria {
  return !!value && (GYDOK_KATEGORIA_KEYS as string[]).includes(value)
}

/** A kategória megjelenítendő neve — ismeretlen kulcsnál maga a kulcs (hangosan látszik a hiba). */
export function gydokKategoriaLabel(key: string): string {
  return GYDOK_KATEGORIAK.find((k) => k.key === key)?.label || key
}

// ─────────────────────────────────────────────────────────────────
// A gyulekezeti_dokumentum tábla egy sora
// ─────────────────────────────────────────────────────────────────

export interface GyulekezetiDokumentum {
  id: string
  congregation_id: string
  kategoria: GydokKategoria
  file_name: string
  /** Objektum-út a bucketben: {congregation_id}/{kategoria}/{uuid}-{fájlnév}. */
  storage_path: string
  mime_type: string | null
  meret_bytes: number | null
  megjegyzes: string | null
  /** true = a Kukában van (a fájl a bucketben marad, visszaállítható). */
  deleted: boolean
  deleted_at: string | null
  deleted_by_profile_id: string | null
  created_by_profile_id: string | null
  created_at: string
}

/**
 * A listDokumentumok server action bemenete. Itt él (nem az actions.ts-ben),
 * mert a 'use server' fájl Next.js 16 alatt CSAK async function-t exportálhat.
 */
export interface DokumentumListaInput {
  /** null/undefined = minden kategória. */
  kategoria?: GydokKategoria | null
  /** true = a Kuka (soft-deleted sorok), false/undefined = élő sorok. */
  kuka?: boolean
  /** Fájlnév-részlet (ilike, literális keresés). */
  kereses?: string | null
  /** 1-től számozott oldal. */
  oldal?: number
  oldalMeret?: number
  /** Feltöltés dátuma szerint: 'desc' (alap, legújabb elöl) vagy 'asc'. */
  irany?: 'asc' | 'desc'
}

// ─────────────────────────────────────────────────────────────────
// Storage-konstansok — a DB-kontraktussal (SQL) bit-azonosan
// ─────────────────────────────────────────────────────────────────

/** Privát bucket. Objektum-út: {congregation_id}/{kategoria}/{uuid}-{fájlnév}. */
export const GYDOK_BUCKET = 'gyulekezeti-dokumentumok'

/** Fájlméret-limit — a bucket file_size_limit-jével egyezik (25 MB). */
export const GYDOK_MAX_BYTES = 25 * 1024 * 1024

/**
 * A bucket allowed_mime_types listájával egyező engedélyezett típusok.
 * Ha itt bővítesz, a SQL bucket-definícióban IS bővíts — különben a
 * bucket némán 400-zal utasítaná el, amit az app már átengedett.
 */
export const GYDOK_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  // e-Factura archívum: XML + ANAF-aláírásos ZIP
  'application/xml',
  'text/xml',
  'application/zip',
  'application/x-zip-compressed',
  // irodai dokumentumok
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/plain',
  'text/csv',
] as const

/** Ember-olvasható összefoglaló az engedélyezett típusokról (hibaüzenetekhez, súgó-sorokhoz). */
export const GYDOK_ALLOWED_TYPES_LEIRAS =
  'PDF, kép (JPEG/PNG/WebP), XML, ZIP, Word/Excel/OpenDocument, szöveg vagy CSV'

/** A fájl-input `accept` attribútuma — a MIME-whitelist + kiterjesztések (Windows-barát). */
export const GYDOK_ACCEPT_ATTR = [
  ...GYDOK_ALLOWED_MIME_TYPES,
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.xml', '.zip',
  '.doc', '.docx', '.xls', '.xlsx', '.odt', '.ods', '.txt', '.csv',
].join(',')

export function isAllowedGydokMime(mime: string | null | undefined): boolean {
  return !!mime && (GYDOK_ALLOWED_MIME_TYPES as readonly string[]).includes(mime)
}

// A fájlnév-tisztítás és a méret-formázó KÖZÖS helper (iktató-csatolmány lib)
// — újraexportáljuk, hogy a dokumentumtár moduljai egy helyről importáljanak.
export { sanitizeCsatolmanyFileName as sanitizeGydokFileName, formatBytes }
