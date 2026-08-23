/**
 * Adatvédelmi fedezet (Profil) — MEGOSZTOTT TÍPUSOK.
 *
 * ⚠️ MIÉRT KÜLÖN FÁJL: az `adatvedelem-actions.ts` `'use server'` fájl, és a
 * Next.js törésesváltozatában az CSAK async függvényt exportálhat. A típusok és
 * a konstansok ezért ide kerülnek — a kliens-komponensek innen importálnak.
 */

import type {
  ExportTablaEredmeny,
  GyulekezetiExportCsomag,
} from '@/lib/export/gyulekezeti-export'
import type { BetekintesBejegyzes } from '@/lib/export/betekintes-naplo'

export type { ExportTablaEredmeny, GyulekezetiExportCsomag, BetekintesBejegyzes }

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportTervLepes {
  tabla: string
  cim: string
}

export type ExportTervValasz =
  | {
      ok: true
      gyulekezetId: string
      gyulekezetNev: string | null
      keszitetteNev: string | null
      keszitetteEmail: string | null
      lepesek: ExportTervLepes[]
    }
  | { ok: false; uzenet: string }

export type ExportSzeletValasz =
  | { ok: true; eredmeny: ExportTablaEredmeny }
  | { ok: false; uzenet: string }

// ─────────────────────────────────────────────────────────────────────────────
// Betekintés-kimutatás
// ─────────────────────────────────────────────────────────────────────────────

/** A kimutatás két, jogosultságában eltérő szelete. */
export type BetekintesSzelet = 'sajat' | 'gyulekezet'

export interface BetekintesSzuro {
  /** Hány napra visszamenőleg. */
  napok: number
  /** Melyik szelet: a saját tevékenységem vagy a gyülekezet adatain végzett műveletek. */
  szelet: BetekintesSzelet
}

export type BetekintesValasz =
  | {
      ok: true
      bejegyzesek: BetekintesBejegyzes[]
      /** `false`, ha a napló-réteg (RPC/tábla) még nincs telepítve élesben. */
      naploElerheto: boolean
      /** Magyar magyarázat, ha a napló nem elérhető vagy csonka. */
      megjegyzes: string | null
      /** `true`, ha elértük a lekérdezési plafont (van még régebbi bejegyzés). */
      csonkolt: boolean
    }
  | { ok: false; uzenet: string }

/** A kimutatás felső korlátja — a felület ennél többet nem tölt be egyszerre. */
export const BETEKINTES_PLAFON = 500

/** A választható időtávok (nap). */
export const BETEKINTES_IDOTAVOK: { napok: number; cimke: string }[] = [
  { napok: 30, cimke: 'Utolsó 30 nap' },
  { napok: 90, cimke: 'Utolsó 3 hónap' },
  { napok: 365, cimke: 'Utolsó 1 év' },
]
