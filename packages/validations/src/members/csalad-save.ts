/**
 * csalad-save zod sémák — M8.3c (2026-04-24).
 *
 * Új család létrehozása + szerkesztése.
 *
 * A `csalad` tábla szerkezete:
 *   - id (integer sequence)
 *   - id_ferfi → szemely.id (apa szerepkör, nullable)
 *   - id_no → szemely.id (anya szerepkör, nullable)
 *   - c_utcaid (integer FK, V1-ben dummy = -1)
 *   - c_szam, c_tombhaz, c_lepcsohaz, c_ajto, c_emelet — szöveges cím
 *   - id_csoport → körzet (opcionális)
 *   - isaktiv (boolean)
 *
 * V1 megközelítés:
 *   - Az `id_ferfi` / `id_no` opcionális — egyedülálló család (özvegy),
 *     vagy csak gyermekes nyilvántartás esetén nem kell szülő
 *   - A `c_utcaid` dummy -1 (szöveges cím a fő adat V1-ben)
 *   - Legalább az `id_ferfi` vagy `id_no` ki van választva (különben
 *     a család semmiképp sem „család"; a zod-séma erre refine-t használ)
 *   - `c_szam` kötelező a szerver-séma szerint (NOT NULL), de szövegesen akár "—"
 */

import { z } from 'zod'

export const csaladCreateInputSchema = z
  .object({
    id_ferfi: z.number().int().nullable().optional(),
    id_no: z.number().int().nullable().optional(),

    // Cím — a `c_szam` szerver-oldalon NOT NULL
    c_szam: z.string().trim().max(50).default('—'),
    c_tombhaz: z.string().trim().max(50).nullable().optional(),
    c_lepcsohaz: z.string().trim().max(50).nullable().optional(),
    c_emelet: z.string().trim().max(50).nullable().optional(),
    c_ajto: z.string().trim().max(50).nullable().optional(),

    // Körzet FK (opcionális)
    id_csoport: z.number().int().nullable().optional(),

    // Státusz
    isaktiv: z.boolean().optional().default(true),
  })
  .refine(
    (d) => d.id_ferfi != null || d.id_no != null,
    {
      message:
        'A családhoz legalább egy szülőt (apa vagy anya) ki kell választani. ' +
        'Egyedülálló szülőt is rögzítheted — csak a megfelelő mezőt töltsd.',
      path: ['id_ferfi'],
    },
  )
export type CsaladCreateInput = z.infer<typeof csaladCreateInputSchema>

export const csaladUpdateInputSchema = z.object({
  id_ferfi: z.number().int().nullable().optional(),
  id_no: z.number().int().nullable().optional(),

  c_szam: z.string().trim().max(50).optional(),
  c_tombhaz: z.string().trim().max(50).nullable().optional(),
  c_lepcsohaz: z.string().trim().max(50).nullable().optional(),
  c_emelet: z.string().trim().max(50).nullable().optional(),
  c_ajto: z.string().trim().max(50).nullable().optional(),

  id_csoport: z.number().int().nullable().optional(),
  isaktiv: z.boolean().optional(),
})
export type CsaladUpdateInput = z.infer<typeof csaladUpdateInputSchema>

/**
 * Üres-string → null normalizálás a create + update payload-okhoz.
 * A `c_szam`-ot tiszteletben tartjuk: ha a user üres string-et ad,
 * legyen '—' (NOT NULL kényszer miatt).
 */
export function normalizeCsaladPayload<T extends Record<string, unknown>>(
  input: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    if (typeof value === 'string' && value.trim() === '') {
      if (key === 'c_szam') {
        out[key] = '—'
      } else {
        out[key] = null
      }
    } else {
      out[key] = value
    }
  }
  return out
}
