/**
 * Befizetés (income / pénzbeszedés) list-row + input zod sémák — A-M7.3a (2026-04-24).
 *
 * A `befizetes` tábla ~33 oszlopos; a lista-megjelenítéshez csak a user-
 * releváns mezőket tartjuk meg, plusz a foreign-key join-ok eredményeit
 * (szemely nev + befizetescel nev + bankszamla nev).
 *
 * A `BefizetesListRow` a list use-case visszatérő-típusa — a desktop és
 * a web form-jai ezt kapják közvetlenül.
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────
// List-item séma (a befizetés-lista soronkénti típusa)
// ─────────────────────────────────────────────────────────────────────────

export const befizetesListRowSchema = z.object({
  id: z.number().int(),
  /** Kliens-generált dedup-kulcs (legacy `xkey` mező) */
  xkey: z.string(),
  /** Rögzítés dátuma (nem a `created` timestamp, hanem a pénzügyi dátum) */
  datum: z.string(),                    // ISO YYYY-MM-DD
  /** Rögzített évhez tartozik — fizetettev. Nem mindig = datum.year */
  fizetettev: z.number().int(),
  /** Bruttó összeg a saját pénznemben (általában RON) */
  osszeg: z.number(),
  /** Ha deviza, a konvertált RON összeg — a `osszeg_ron` */
  osszeg_ron: z.number().nullable(),
  /** BNR árfolyam, ha deviza */
  arfolyam: z.number().nullable(),
  /** Forrása (kassza / bank / pénztár / bankszámla_nev) */
  forrasa: z.string(),
  /** Saját iratszám (a gyülekezet belső nyilvántartása) */
  iratszam: z.string(),
  /** Irat-típus ('nyugta' / 'bank-kivonat' / stb.) */
  irattipus: z.string(),
  /** Kapcsolt chitanța (hivatkozás a papír-nyugta sorszámára, ha van) */
  nyugta: z.string(),
  /** Pótlás-e (az előző évi tartozás rendezése) */
  is_potlas: z.boolean(),
  /** Családi befizetés-e (id_csalad aktív), vagy egyéni (id_szemely) */
  csalad: z.boolean(),
  /** Családi ID — csak ha csalad=true */
  id_csalad: z.number().int().nullable(),
  /** Tag ID — csak ha csalad=false */
  id_szemely: z.number().int().nullable(),
  /** Befizetés-cél ID (kategória) */
  id_befizetescel: z.number().int(),
  /** Bankszámla ID (ha bank-forrás) */
  bankszamla_id: z.number().int().nullable(),
  megjegyzes: z.string().nullable(),
  /** Soft-delete és sztornó — mint a chitantánál */
  deleted: z.boolean(),
  stornozott: z.boolean(),
  stornozott_indok: z.string().nullable(),
  stornozott_at: z.string().nullable(),

  // ── Join-eredmények (a UI-nak — név-mezők a kapcsolt táblákból) ──
  befizetescel_nev: z.string().nullable(),
  szemely_nev: z.string().nullable(),
  bankszamla_nev: z.string().nullable(),

  // ── Technikai metadat ──
  userid: z.string().uuid(),
  congregation_id: z.string().uuid(),
  revision: z.number().int(),
  updated_at: z.string(),
  created: z.string().nullable(),
})
export type BefizetesListRow = z.infer<typeof befizetesListRowSchema>

// ─────────────────────────────────────────────────────────────────────────
// List-input séma
// ─────────────────────────────────────────────────────────────────────────

export const listIncomeInputSchema = z.object({
  congregationId: z.string().uuid('A congregationId UUID kell legyen.'),
  /** Év — ha megadva, csak az adott év befizetései (fizetettev vagy datum). */
  year: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .optional(),
  /**
   * Szűrési mód ha `year` meg van adva:
   *   - `'fizetettev'`: `fizetettev = year` (melyik évre szól, ez a default)
   *   - `'datum'`: `datum BETWEEN year-01-01 AND year-12-31` (mikor rögzítettük)
   */
  yearField: z.enum(['fizetettev', 'datum']).optional(),
  /** Csak egy adott tag befizetései (ha megadva). */
  szemelyId: z.number().int().positive().optional().nullable(),
  /** Csak egy adott család befizetései (ha megadva — kölcsönösen kizárólagos a szemelyId-vel). */
  csaladId: z.number().int().positive().optional().nullable(),
  /** Csak egy adott cél (pl. járulék, persely) befizetései. */
  befizetescelId: z.number().int().positive().optional().nullable(),
  /** Soft-deleted (`deleted=true`) bejegyzéseket is mutassa? Default: false. */
  includeDeleted: z.boolean().optional(),
  /** Sztornózott bejegyzéseket is mutassa? Default: true. */
  includeStornozott: z.boolean().optional(),
  /** Rendezés (default: datum-desc — a legfrissebb először). */
  orderBy: z.enum(['datum-desc', 'datum-asc', 'osszeg-desc']).optional(),
  /** Max sorszám — default 500, max 2000. */
  limit: z.number().int().min(1).max(2000).optional(),
})
export type ListIncomeInput = z.infer<typeof listIncomeInputSchema>
