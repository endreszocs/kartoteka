/**
 * Publikus weboldal — tisztségviselők + nyilvános programok betöltése
 * (2026-08-26, 5. kör; 2026-08-27: éves naptár + leírás).
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
  /**
   * A látogatónak szánt ismertető. Endre 2026-08-27-i kifejezett kérése, hogy
   * a nyilvános naptárban a leírás is látszódjon; a BELSŐ `megjegyzes` mező
   * továbbra sem hagyja el a rendszert.
   *
   * `null`, ha a program nem hordoz leírást — VAGY ha az élő adatbázisban még
   * a V1 RPC fut (lásd `hivEsemenyRpc`).
   */
  leiras: string | null
  datum: string
  datum_vege: string | null
  ido_kezdes: string | null
  ido_befejezes: string | null
  helyszin: string | null
  tipus: string
  egyedi_tipus_nev: string | null
  egyedi_emoji: string | null
}

function hianyzoRpc(code: string | undefined): boolean {
  return code === 'PGRST202' || code === '42883'
}

/**
 * A nyers (sorozat-alapsorokat is tartalmazó) programsorok lekérése.
 *
 * EXPAND/CONTRACT: a V2 RPC (éves ablak + leírás) telepíthető a frontend
 * UTÁN is, ezért ha még nem létezik, a már élő V1-re esünk vissza. A V1 nem
 * ismeri az évet és nem ad leírást — ilyenkor a naptár a következő 90 nap
 * alkalmait mutatja, leírás nélkül, de NEM hibázik és nem hazudik.
 */
async function hivEsemenyRpc(
  slug: string,
  ev: number | null,
): Promise<Array<Record<string, unknown>>> {
  const supabase = createPublicServerClient()

  const v2 = await supabase.rpc('public_site_events_v2', { p_slug: slug, p_ev: ev })
  if (!v2.error && Array.isArray(v2.data)) return v2.data as Array<Record<string, unknown>>
  if (!hianyzoRpc(v2.error?.code)) return []

  const v1 = await supabase.rpc('public_site_events', { p_slug: slug })
  if (v1.error || !Array.isArray(v1.data)) return []
  return v1.data as Array<Record<string, unknown>>
}

/** A nyers RPC-sor → az app Program-alakja (a kibontáshoz). */
function programAlak(r: Record<string, unknown>): Program {
  return {
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
    // A leírást a Program-típus nem ismeri (azt csak a desktop írja/olvassa),
    // ezért a kibontás UTÁN, a cím+dátum kulcsú térkép alapján tesszük vissza.
    megjegyzes: null,
    teljesitett: false,
    teljesites_datum: null,
    letrehozta_id: null,
    letrehozta_nev: null,
    congregation_id: null,
    created_at: '',
    updated_at: '',
  } as unknown as Program
}

function kimenet(p: Program, leirasok: Map<string, string>): PublicEsemeny {
  return {
    cim: p.cim,
    leiras: leirasok.get(p.cim) ?? null,
    datum: p.datum,
    datum_vege: p.datum_vege,
    ido_kezdes: p.ido_kezdes,
    ido_befejezes: p.ido_befejezes,
    helyszin: p.helyszin,
    tipus: p.tipus as string,
    egyedi_tipus_nev: p.egyedi_tipus_nev,
    egyedi_emoji: p.egyedi_emoji,
  }
}

/** cím → leírás (a sorozat minden alkalma ugyanazt az ismertetőt kapja). */
function leirasTerkep(sorok: Array<Record<string, unknown>>): Map<string, string> {
  const map = new Map<string, string>()
  for (const r of sorok) {
    const cim = String(r.cim || '')
    const leiras = typeof r.leiras === 'string' ? r.leiras.trim() : ''
    if (cim && leiras && !map.has(cim)) map.set(cim, leiras)
  }
  return map
}

/** A közelgő publikus események — az ismétlődő sorozatok alkalmakra bontva. */
export async function loadPublicEsemenyek(slug: string, maxDb = 12): Promise<PublicEsemeny[]> {
  const sorok = await hivEsemenyRpc(slug, null)
  if (sorok.length === 0) return []

  const ma = new Date().toISOString().slice(0, 10)
  const horizontEv = new Date().getFullYear() + 1
  const [hy, hm, hd] = ma.split('-').map(Number)
  const ablakVege = new Date(Date.UTC(hy, hm - 1, hd + 90)).toISOString().slice(0, 10)

  const leirasok = leirasTerkep(sorok)
  const kibontva = expandProgramOccurrences(sorok.map(programAlak), horizontEv)

  return kibontva
    .filter(p => p.datum >= ma && p.datum <= ablakVege && p.cim.trim().length > 0)
    .slice(0, maxDb)
    .map(p => kimenet(p, leirasok))
}

/**
 * Egy TELJES naptári év nyilvános programjai — az Alkalmaink oldal naptárához
 * és az éves program letöltéséhez. A múltbeli alkalmak is benne vannak: egy
 * éves programfüzet visszamenőleg is teljes kell legyen.
 */
export async function loadPublicEvProgram(slug: string, ev: number): Promise<PublicEsemeny[]> {
  const biztonsagosEv = Number.isInteger(ev) ? Math.min(2100, Math.max(2000, ev)) : new Date().getFullYear()
  const sorok = await hivEsemenyRpc(slug, biztonsagosEv)
  if (sorok.length === 0) return []

  const leirasok = leirasTerkep(sorok)
  const kibontva = expandProgramOccurrences(sorok.map(programAlak), biztonsagosEv)

  return kibontva
    .filter(
      p =>
        p.datum >= `${biztonsagosEv}-01-01` &&
        p.datum <= `${biztonsagosEv}-12-31` &&
        p.cim.trim().length > 0,
    )
    .map(p => kimenet(p, leirasok))
}
