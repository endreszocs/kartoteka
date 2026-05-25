/**
 * Chitanță (papír nyugta) — kliens-oldalon is használt típusok.
 *
 * NEM `'use server'` fájl: Next.js 16 óta a server-action loader runtime hibát
 * dob, ha egy `'use server'` modulból bármilyen non-async-function exportot
 * importál a kliens (még pure type re-export is hibázik). Ezért ezeket a
 * típusokat különválasztottuk a `chitanta-actions.ts`-től.
 */

export type ChitantaIssueInput = {
  /** Sorozat (pl. „EREKC24"). Ha üres, a config alapértelmezést használjuk. */
  sorozat?: string
  /** Ha megadod, ezt a számot használjuk; egyébként az RPC adja. */
  szam?: number
  /** Nyugta dátuma (YYYY-MM-DD). */
  szamlaDatum: string
  /** Átvevő (befizető) neve — kötelező. */
  klienesseg_nev: string
  /** Cím (opcionális — pl. "Brates"). */
  klienesseg_cim?: string
  /** CIF — cégnél, magánszemélynél üres. */
  klienesseg_cui?: string
  /** Bruttó összeg (RON). */
  osszeg_brut: number
  /** „reprezentând (címén)" — pl. "Egyházfenntartó járulék 2024-2026". */
  reprezentand?: string
  /** Kapcsolódó befizetés ID (ha van). */
  befizetes_id?: number
  /** Belső megjegyzés. */
  megjegyzes?: string
}

export type ChitantaRow = {
  id: string
  sorozat: string
  szam: number
  szamla_datum: string
  klienesseg_nev: string
  klienesseg_cui: string | null
  klienesseg_cim: string | null
  osszeg_brut: number
  reprezentand: string | null
  befizetes_id: number | null
  stornozott: boolean
  stornozott_indok: string | null
  megjegyzes: string | null
  issued_by: string | null
  created_at: string
}

export type ChitantaConfig = {
  sorozat: string | null
  kovetkezoSzam: number | null
}
