import 'server-only'

import type { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

/**
 * Iktató sorszám-számláló olvasása és ELŐNÉZET-számítás (2026-08-10).
 *
 * MIÉRT KÜLÖN MODUL: a Next.js 16 'use server' fájl csak async függvényt
 * exportálhat, és ugyanezt a logikát KÉT action-fájl használja
 * (`iktato/actions.ts` és `iktato/template-actions.ts`) — eddig mindkettő
 * SAJÁT, egymástól eltérő MAX+1 implementációt tartott fenn.
 *
 * A SZÁMOZÁS SZERZŐDÉSE:
 *   • KIOSZTÁS (atomikus, egyetlen igazság): `next_iktato_sequence` RPC —
 *     INSERT … ON CONFLICT DO UPDATE RETURNING, sor-szintű lockkal.
 *     A számláló CSAK felfelé lépked, a kiosztott számot sosem adja ki újra.
 *   • ELŐNÉZET (nem foglal): ez a modul. SOHA nem hívja az RPC-t — az minden
 *     dialógus-megnyitáskor elhasználna egy számot.
 *
 * MIÉRT `GREATEST(pointer, MAX)` (K4 iktatószám-diagnosztika #5):
 *   A korábbi előnézetek a SOROKAT olvasták (`MAX(sequence_number) + 1`), a
 *   kiosztás viszont a POINTER-t (`iktato_sequence_pointers.last_sequence`).
 *   Ha egy kiosztás után az INSERT elbukott (RLS, hálózat, validáció), a
 *   pointer előrelépett, a MAX nem — az előnézet onnantól TARTÓSAN kisebb
 *   számot mutatott, mint amit a mentés ténylegesen kiosztott. Fordítva
 *   (import után elmaradt pointer-szinkron) a MAX a nagyobb. A becslés ezért
 *   a kettő maximuma + 1.
 *
 * ⚠️ RLS-megjegyzés: az `iktato_sequence_pointers` SELECT-policyja a
 *    `profiles.congregation_id` SKALÁRT nézi — kerületi adminnak (vagy
 *    profile_roles-alapú gyülekezeti hozzáférésnél) a pointer-sor némán nem
 *    látszik. Ilyenkor `pointerVisible = false`, és a MAX-fallback él.
 */

type EffectiveSupabase = Awaited<ReturnType<typeof getEffectiveCongregationContext>>['supabase']

/**
 * 2026-08-15 (egyházmegyei szint, S4): a számláló-olvasás SCOPE-KULCSÚ lett —
 * a megyei iktató (diocese_id) UGYANEZT a logikát futtatja a saját számsorán
 * (a pointer-tábla diocese-sorai + az iktato diocese-sorai). NEM új
 * implementáció: kizárólag a szűrő-oszlop cserélődik.
 */
export interface SequenceScopeKey {
  col: 'congregation_id' | 'diocese_id'
  id: string
}

export interface SequenceState {
  /** `iktato_sequence_pointers.last_sequence` — 0, ha nincs/nem látszik. */
  pointer: number
  /** A legnagyobb LÉTEZŐ sorszám (törölt sorokkal együtt) — 0, ha nincs. */
  maxSequence: number
  /** false = a pointer-sor nem olvasható (RLS) vagy még nem létezik. */
  pointerVisible: boolean
}

/** A (scope, év) számláló-állapot beolvasása — pointer + MAX. */
export async function readSequenceState(
  supabase: EffectiveSupabase,
  scopeKey: SequenceScopeKey,
  year: number,
): Promise<SequenceState> {
  const { data: pointerRow } = await supabase
    .from('iktato_sequence_pointers')
    .select('last_sequence')
    .eq(scopeKey.col, scopeKey.id)
    .eq('year', year)
    .maybeSingle()
  const rawPointer = (pointerRow as { last_sequence: number } | null)?.last_sequence
  const pointer = typeof rawPointer === 'number' && rawPointer > 0 ? rawPointer : 0

  // A MAX-ot TÖRÖLTEKKEL EGYÜTT olvassuk: a törölt sor száma is a számlálótól
  // származik, a pointer nem lehet alatta. (A `.limit(1)` miatt itt nincs
  // PostgREST 1000-soros csonkulás.)
  const { data: maxRow } = await supabase
    .from('iktato')
    .select('sequence_number')
    .eq(scopeKey.col, scopeKey.id)
    .eq('year', year)
    .order('sequence_number', { ascending: false })
    .limit(1)
  const maxSequence = (maxRow?.[0]?.sequence_number as number | undefined) || 0

  return { pointer, maxSequence, pointerVisible: pointer > 0 }
}

/**
 * A sorszám-számláló aktuális állása — a visszamenőleges iktatás kapujához.
 *
 * ⚠️ SZÁNDÉKOSAN a NYERS pointert adja vissza (MAX-fallbackkel, ha a pointer
 * nem látszik), NEM a GREATEST-et: a kézi (visszamenőleges) szám biztonsági
 * érve az, hogy az automata a pointer FÖLÖTT osztogat, tehát a pointer alatti
 * szabad számok kiadása nem ütközhet. Ha ide a MAX-ot is beszámítanánk, egy
 * pointer alatti/fölötti sodródásnál kiadhatnánk olyan számot, amit az
 * automata később ÚJRA kiosztana.
 */
export async function readSequencePointer(
  supabase: EffectiveSupabase,
  scopeKey: SequenceScopeKey,
  year: number,
): Promise<number> {
  const state = await readSequenceState(supabase, scopeKey, year)
  return state.pointerVisible ? state.pointer : state.maxSequence
}

export interface SequencePreview {
  year: number
  /** A VÁRHATÓ következő sorszám — nem foglalt, csak becslés. */
  sequenceNumber: number
  /** Kanonikus formátum: `${year}/${sequenceNumber}` (padding NÉLKÜL). */
  iratszam: string
  /** false = a pointer nem volt olvasható → a becslés csak a sorokból készült. */
  pointerVisible: boolean
}

/** A következő iktatószám ELŐNÉZETE (nem foglal számot). */
export async function computeSequencePreview(
  supabase: EffectiveSupabase,
  scopeKey: SequenceScopeKey,
  year: number,
): Promise<SequencePreview> {
  const { pointer, maxSequence, pointerVisible } = await readSequenceState(supabase, scopeKey, year)
  const sequenceNumber = Math.max(pointer, maxSequence) + 1
  return {
    year,
    sequenceNumber,
    iratszam: `${year}/${sequenceNumber}`,
    pointerVisible,
  }
}
