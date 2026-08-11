'use server'

/**
 * ÉRTESÍTÉSEK (harang-üzenetek) — SZERVER-AKCIÓK (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT
 * ════════════════════════════════════════════════════════════════════════════
 * Az `ertesitesek` táblát az egész alkalmazásban EGYETLEN felület olvasta:
 * a fejléc-csengő lenyíló panelje. Aki elolvasott egy üzenetet és eltelt
 * 24 óra (`READ_RETENTION_HOURS`), annak az üzenet VÉGLEG elérhetetlenné vált —
 * a sor ott maradt az adatbázisban, de nem volt felület, ami megmutatta volna.
 * A `/notifications` oldal MÁS táblát mutat (átjelentkezési kérelmek), és
 * gyülekezeti hatókör nélküli profilban (rendszergazda, esperes) még azt sem:
 * csak egy hibadobozt.
 *
 * A tulajdonos kérése szó szerint ez volt: „nem jelenik meg az értesítések
 * oldal, ahol részletesebben és szépen átnézhetem az üzeneteket".
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ MINDEN `'use server'` EXPORT ÉLŐ POST-VÉGPONT
 * ════════════════════════════════════════════════════════════════════════════
 * A védelem NEM a felület, hanem az RLS + a saját `user_id` szűrő:
 *   · a lekérdezés a BEJELENTKEZETT felhasználó kliensével fut (nem
 *     service_role!), tehát az `ertesitesek` RLS-e érvényesül;
 *   · minden írás `.eq('user_id', userId)`-vel megy, tehát idegen sort akkor
 *     sem lehetne módosítani, ha az RLS valaha megengedőbb lenne.
 * ⛔ SERVICE_ROLE KLIENS ITT SOHA.
 */

import { createClient } from '@/lib/supabase/server'

import type { UzenetLista, UzenetMuveletEredmeny, UzenetSor } from './uzenetek-shared'
import { MEGOLDVA_CIM_ELOTAG } from './uzenetek-shared'

/** Egyszerre ennyi üzenetet töltünk be. A felület kiírja, ha több van. */
const ALAP_LIMIT = 200

interface NyersSor {
  id: string
  tipus: string | null
  cim: string | null
  uzenet: string | null
  olvasva: boolean | null
  archived: boolean | null
  created_at: string
  read_at: string | null
  hivatkozas: string | null
  admin_request_id: string | null
  congregation_id: string | null
  // ⚠️ Csak akkor létezik, ha a 2026-08-11-ertesites-megoldva.sql lefutott.
  megoldva?: boolean | null
  megoldva_at?: string | null
  megoldas_uzenet?: string | null
}

/**
 * A felhasználó ÖSSZES harang-üzenete — az archiváltakkal és a 24 óránál
 * régebben olvasottakkal együtt.
 *
 * ⚠️ `select('*')`, NEM oszlop-lista. A `megoldva` / `megoldva_at` /
 *    `megoldas_uzenet` oszlopok csak a migráció lefutása után léteznek; egy
 *    nevesített lista addig 42703-mal elhasalna, és az EGÉSZ oldal üres lenne.
 *    A csillag mindkét világban működik, a hiányzó mezők `undefined`-ok.
 */
export async function listErtesitesekAction(): Promise<UzenetLista> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data, error } = await supabase
    .from('ertesitesek')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(ALAP_LIMIT + 1)

  if (error) return { error: `Az üzenetek nem tölthetők be: ${error.message}` }

  const nyers = ((data ?? []) as unknown as NyersSor[]).slice(0, ALAP_LIMIT)
  const nevek = await gyulekezetNevek(supabase, nyers)

  return {
    rows: nyers.map((r) => alakit(r, nevek)),
    tobbVan: (data ?? []).length > ALAP_LIMIT,
  }
}

function alakit(r: NyersSor, nevek: Map<string, string>): UzenetSor {
  const cim = (r.cim ?? '').trim()
  return {
    id: r.id,
    tipus: r.tipus ?? 'info',
    cim: cim || 'Értesítés',
    uzenet: r.uzenet ?? '',
    olvasva: r.olvasva === true,
    archived: r.archived === true,
    createdAt: r.created_at,
    readAt: r.read_at ?? null,
    hivatkozas: r.hivatkozas ?? null,
    adminRequestId:
      r.admin_request_id ??
      (r.hivatkozas?.startsWith('admin_access:')
        ? r.hivatkozas.replace('admin_access:', '')
        : null),
    congregationNev: r.congregation_id ? (nevek.get(r.congregation_id) ?? null) : null,
    // ⚠️ KÉT FORRÁS. Oszlop, ha van; egyébként a cím-előtag (a feloldás
    //    fail-closed ága azt írja be, ha a migráció még nem futott le).
    megoldva: r.megoldva === true || cim.startsWith(MEGOLDVA_CIM_ELOTAG),
    megoldvaAt: r.megoldva_at ?? null,
    megoldasUzenet: r.megoldas_uzenet ?? null,
  }
}

/**
 * A gyülekezet-nevek feloldása. FAIL-SOFT: ha az RLS nem enged (pl. idegen
 * gyülekezet azonosítója egy régi üzenetben), a név egyszerűen `null` marad —
 * az üzenet ettől még megjelenik. Egy hiányzó név nem érhet annyit, hogy
 * elvegye a teljes listát.
 */
async function gyulekezetNevek(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sorok: NyersSor[],
): Promise<Map<string, string>> {
  const idk = [...new Set(sorok.map((s) => s.congregation_id).filter((v): v is string => !!v))]
  if (idk.length === 0) return new Map()
  try {
    const { data } = await supabase.from('congregations').select('id, name, nev_hu').in('id', idk)
    const map = new Map<string, string>()
    for (const c of (data ?? []) as Array<{ id: string; name: string | null; nev_hu: string | null }>) {
      map.set(c.id, (c.nev_hu || c.name || '').trim())
    }
    return map
  } catch {
    return new Map()
  }
}

/** Olvasottnak jelöl. A `read_at`-ot adatbázis-trigger tölti ki. */
export async function jelolOlvasottnakAction(id: string): Promise<UzenetMuveletEredmeny> {
  return sajatSorFrissites(id, { olvasva: true })
}

/** Vissza olvasatlanra — ha a lelkész vissza akar térni rá. */
export async function jelolOlvasatlannakAction(id: string): Promise<UzenetMuveletEredmeny> {
  return sajatSorFrissites(id, { olvasva: false, read_at: null })
}

export async function archivalErtesitestAction(id: string): Promise<UzenetMuveletEredmeny> {
  return sajatSorFrissites(id, { archived: true, archived_at: new Date().toISOString() })
}

/**
 * VISSZAHOZÁS AZ ARCHÍVUMBÓL.
 *
 * ⚠️ MIÉRT KELL. Az archiválás eddig EGYIRÁNYÚ volt: a harangból eltűnt, és
 * nem létezett felület, ami visszahozta volna. Egy téves kattintás így véglegesen
 * elrejtett egy üzenetet — miközben a sor ott volt az adatbázisban.
 */
export async function visszaallitErtesitestAction(id: string): Promise<UzenetMuveletEredmeny> {
  return sajatSorFrissites(id, { archived: false, archived_at: null })
}

export async function jelolMindOlvasottnakAction(): Promise<UzenetMuveletEredmeny> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nincs bejelentkezett felhasználó.' }

  const { error } = await supabase
    .from('ertesitesek')
    .update({ olvasva: true })
    .eq('user_id', user.id)
    .eq('olvasva', false)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * ⚠️ MINDEN ÍRÁS A SAJÁT SORRA. Az `.eq('user_id', user.id)` az RLS MELLETT áll,
 * nem helyette: ha az `ertesitesek` policy valaha megengedőbbé válna (pl. egy
 * globális hozzáférésű szerep miatt), ez a szűrő akkor is megvédi az idegen
 * sorokat egy elgépelt azonosítótól.
 */
async function sajatSorFrissites(
  id: string,
  mezok: Record<string, unknown>,
): Promise<UzenetMuveletEredmeny> {
  if (!id) return { success: false, error: 'Hiányzó azonosító.' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nincs bejelentkezett felhasználó.' }

  const { error } = await supabase
    .from('ertesitesek')
    .update(mezok)
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
