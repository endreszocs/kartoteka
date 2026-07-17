/**
 * Iktató F6 — iratcsomó + csatolmány típusok és storage-konstansok (K5).
 *
 * Sima lib (NEM 'use server') — kliens-oldalról is importálható, így a
 * csatolmány-panel és a server actions ugyanazokat a konstansokat használják
 * (bucket-név, méret-limit, engedélyezett MIME-típusok).
 *
 * DB-kontraktus: migration-docs/sql/2026-07-17-f6-iktato-csomok-csatolmanyok.sql
 */

import type { FilingEntry } from '@/lib/constants/filing'

// ─────────────────────────────────────────────────────────────────
// Iratcsomó
// ─────────────────────────────────────────────────────────────────

/** A public.iratcsomo tábla egy sora. */
export interface Iratcsomo {
  id: string
  congregation_id: string
  ev: number
  nev: string
  leiras: string | null
  /** true = lezárt csomó — az app nem enged bele új iratot rendezni. */
  lezarva: boolean
  created_at: string
  updated_at: string
}

/** Csomó a benne lévő (nem törölt) iratok darabszámával (listázáshoz). */
export interface IratcsomoWithCount extends Iratcsomo {
  iratSzam: number
}

/**
 * FilingEntry az F6-os `csomo_id` mezővel. A lib/constants/filing.ts
 * FilingEntry típusa (szándékosan) nem tartalmazza — a mező csak az F6-os
 * migráció lefuttatása után létezik a `select('*')` eredményében.
 */
export type FilingEntryWithCsomo = FilingEntry & { csomo_id?: string | null }

// ─────────────────────────────────────────────────────────────────
// Csatolmány
// ─────────────────────────────────────────────────────────────────

/** A public.iktato_csatolmany tábla egy sora. */
export interface IktatoCsatolmany {
  id: string
  iktato_id: string
  congregation_id: string
  /** NULL = csak metaadat-rögzítés (papíralapú irat, nincs digitalizált fájl). */
  storage_path: string | null
  file_name: string
  mime_type: string | null
  meret_bytes: number | null
  /** A csatolmány (oldal) sorrendje a tételen belül, 1-től. */
  oldal_sorszam: number
  megjegyzes: string | null
  created_by_profile_id: string | null
  created_at: string
}

// ─────────────────────────────────────────────────────────────────
// Storage-konstansok — a DB-kontraktussal (K1 SQL) bit-azonosan
// ─────────────────────────────────────────────────────────────────

/** Privát bucket a csatolmányoknak. Objektum-út: {congregation_id}/{iktato_id}/{uuid}-{fájlnév}. */
export const CSATOLMANY_BUCKET = 'iktato-csatolmanyok'

/** Fájlméret-limit — a bucket file_size_limit-jével egyezik (10 MB). */
export const CSATOLMANY_MAX_BYTES = 10 * 1024 * 1024

/** A bucket allowed_mime_types listájával egyező engedélyezett típusok. */
export const CSATOLMANY_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export function isAllowedCsatolmanyMime(mime: string | null | undefined): boolean {
  return !!mime && (CSATOLMANY_ALLOWED_MIME_TYPES as readonly string[]).includes(mime)
}

/**
 * Fájlnév-tisztítás a storage-úthoz (az access-request-form mintája szerint):
 * csak [a-zA-Z0-9._-] marad, max 80 karakter, üres esetén 'irat'.
 */
export function sanitizeCsatolmanyFileName(name: string): string {
  return (name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'irat'
}

/** Bájt-méret ember-olvashatóan (magyar tizedesvesszővel). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
