/**
 * Chitanță (papír nyugta) kiállítás zod validáció — A-M7.2b (2026-04-22).
 *
 * A nyugta a felhasználó hivatalos nyugtatömbjéhez illeszkedő, lokálisan
 * generált, NEM Oblio-ra felmenő dokumentum. Az `oblio_szamlak` táblába
 * kerül `tipus = 'chitanta_papir'` jelöléssel, az `oblio_fiok_id = null`
 * értékkel (nincs Oblio API-hívás).
 *
 * Számozás:
 *   - sorozat: user-input vagy `oblio_fiokok.chitanta_sorozat_default`
 *   - szám: user-input **vagy** szerver-oldali `next_chitanta_number()`
 *     PL/pgSQL RPC (concurrency-safe) — ezért **ONLINE-kötelező** most
 */

import { z } from 'zod'

/**
 * Chitanță kiállítás input (validáció a kliens oldalon is + core use-case-ben).
 */
export const chitantaIssueInputSchema = z.object({
  congregationId: z.string().uuid('A congregationId UUID kell legyen.'),

  /** Sorozat (pl. „EREKC24"). Ha üres, a config alapértelmezést használjuk. */
  sorozat: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .optional(),

  /** Ha megadod, ezt a számot használjuk; egyébként az RPC adja. */
  szam: z.number().int().positive().optional(),

  /** Nyugta dátuma (YYYY-MM-DD). */
  szamlaDatum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'A számla dátuma YYYY-MM-DD formátumú.'),

  /** Átvevő (befizető) neve — kötelező. */
  klienesseg_nev: z
    .string()
    .trim()
    .min(1, 'Az átvevő (befizető) neve kötelező.')
    .max(200),

  /** Cím (opcionális — pl. "Brates"). */
  klienesseg_cim: z.string().trim().max(200).optional().nullable(),

  /** CIF — cégnél, magánszemélynél üres. */
  klienesseg_cui: z.string().trim().max(32).optional().nullable(),

  /** Bruttó összeg (RON). */
  osszeg_brut: z
    .number()
    .positive('Az összeg pozitív szám legyen.')
    .max(10_000_000, 'Az összeg túl magas — ellenőrizd.'),

  /** „reprezentând (címén)" — pl. "Egyházfenntartó járulék 2024-2026". */
  reprezentand: z.string().trim().max(300).optional().nullable(),

  /** Kapcsolódó befizetés ID (ha van). */
  befizetes_id: z.number().int().positive().optional().nullable(),

  /** Belső megjegyzés. */
  megjegyzes: z.string().trim().max(500).optional().nullable(),
})

export type ChitantaIssueInput = z.infer<typeof chitantaIssueInputSchema>

/** A kiállított chitanță minimális ack-ja a Supabase insert-vissza-adta adatok alapján. */
export interface ChitantaIssueResult {
  chitantaId: string
  sorozat: string
  szam: number
}
