/**
 * Publikus weboldal — tisztségviselők + közelgő események betöltése
 * (2026-08-26, 5. kör).
 *
 * KIZÁRÓLAG a dedikált SECURITY DEFINER RPC-ken át (anon kliens) — a kapu
 * (show_* kapcsoló + publikus jelölés + aktív mandátum + név-publikálási
 * hozzájárulás) az RPC WHERE-ágában él, ezért ha a kapcsoló ki van kapcsolva
 * vagy nincs publikálható adat, ÜRES lista jön — a szekciók ilyenkor nem
 * renderelődnek. Bázistábla-olvasás nincs, és hibánál sem esünk vissza rá.
 */

import { createPublicServerClient } from '@/lib/supabase/public-server'
import { expandProgramOccurrences } from '@/lib/utils/program-recurrence'
import type { Program } from '@/lib/constants/dashboard'

export interface PublicTisztseg {
  kod: string
  nev: string
  sorrend: number
}

export async function loadPublicTisztsegek(slug: string): Promise<PublicTisztseg[]> {
  const supabase = createPublicServerClient()
  const { data, error } = await supabase.rpc('public_site_tisztsegek', { p_slug: slug })
  if (error || !Array.isArray(data)) return []
  return (data as PublicTisztseg[]).filter(r => r && typeof r.nev === 'string' && r.nev.trim().length > 0)
}

export interface PublicEsemeny {
  cim: string
  datum: string
  datum_vege: string | null
  ido_kezdes: string | null
  ido_befejezes: string | null
  helyszin: string | null
  tipus: string
  egyedi_tipus_nev: string | null
  egyedi_emoji: string | null
}

/** A közelgő publikus események — az ismétlődő sorozatok alkalmakra bontva. */
export async function loadPublicEsemenyek(slug: string, maxDb = 12): Promise<PublicEsemeny[]> {
  const supabase = createPublicServerClient()
  const { data, error } = await supabase.rpc('public_site_events', { p_slug: slug })
  if (error || !Array.isArray(data)) return []

  const ma = new Date().toISOString().slice(0, 10)
  const horizontEv = new Date().getFullYear() + 1
  const [hy, hm, hd] = ma.split('-').map(Number)
  const ablakVege = new Date(Date.UTC(hy, hm - 1, hd + 90)).toISOString().slice(0, 10)

  // A sorozat-alapsorok kibontása az app-pal azonos szabállyal, majd a
  // 90 napos ablakra szűrés.
  const kibontva = expandProgramOccurrences(
    (data as Array<Record<string, unknown>>).map(r => ({
      id: String(r.cim || '') + String(r.datum || ''),
      cim: String(r.cim || ''),
      datum: String(r.datum || ''),
      datum_vege: (r.datum_vege as string | null) || null,
      ido_kezdes: (r.ido_kezdes as string | null) || null,
      ido_befejezes: (r.ido_befejezes as string | null) || null,
      helyszin: (r.helyszin as string | null) || null,
      tipus: String(r.tipus || 'egyeb'),
      prioritas: 'normal',
      ismetlodes_tipus: (r.ismetlodes_tipus as string | null) || null,
      ismetlodes_vege: (r.ismetlodes_vege as string | null) || null,
      egyedi_tipus_nev: (r.egyedi_tipus_nev as string | null) || null,
      egyedi_emoji: (r.egyedi_emoji as string | null) || null,
      megjegyzes: null,
      teljesitett: false,
      teljesites_datum: null,
      letrehozta_id: null,
      letrehozta_nev: null,
      congregation_id: null,
      created_at: '',
      updated_at: '',
    }) as unknown as Program),
    horizontEv,
  )

  return kibontva
    .filter(p => p.datum >= ma && p.datum <= ablakVege && p.cim.trim().length > 0)
    .slice(0, maxDb)
    .map(p => ({
      cim: p.cim,
      datum: p.datum,
      datum_vege: p.datum_vege,
      ido_kezdes: p.ido_kezdes,
      ido_befejezes: p.ido_befejezes,
      helyszin: p.helyszin,
      tipus: p.tipus as string,
      egyedi_tipus_nev: p.egyedi_tipus_nev,
      egyedi_emoji: p.egyedi_emoji,
    }))
}
