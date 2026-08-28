import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * BELSŐ MOZGÁS — a kizáráshoz szükséges junction-tábla azonosítók (2026-08-27).
 *
 * ── MIÉRT KELL ────────────────────────────────────────────────────────────
 * Az összesítő lekérdezések a belső mozgást eddig KIZÁRÓLAG a
 * `belso_mozgas_xkey IS NULL` feltétellel zárták ki. A `scope-financial.ts`
 * saját kommentje meg is nevezte a rést:
 *
 *   „Az itteni szűrő csak az xkey-t nézi, mert a kód-szűréshez cél-join
 *    kellene; a régi, IMPORTÁLT (xkey nélküli, csak kód-alapú) belső mozgások
 *    ezért még benne maradhatnak."
 *
 * 2026-08-27-én ez elő is jött: egy hibás banki import 7 db `301.01` kódú
 * („Készpénzletétel a kasszából") sort hozott be párosító kulcs NÉLKÜL,
 * 65 425 RON értékben. Ezek a Pénzügy fülön helyesen kimaradnak (az KÓD szerint
 * is szűr), az xkey-alapú összesítőkben viszont VALÓDI BEVÉTELKÉNT szerepelnek —
 * így ugyanarra az évre KÉT KÜLÖNBÖZŐ bevétel-végösszeg látszik, attól függően,
 * hol nézi az ember.
 *
 * ── A PREDIKÁTUM ──────────────────────────────────────────────────────────
 * Pontosan ugyanaz, amit a jelentés-oldal használ (reporting.ts, AccountingTab,
 * FinanceDashboard): a kód 3-mal vagy 4-gyel kezdődik, VAGY `100`, VAGY `100.`-tal
 * kezdődik (legacy pénztármaradvány-fejezet).
 *
 * ── MIÉRT ID-LISTA ÉS NEM EMBED-JOIN ──────────────────────────────────────
 * A `!inner` embed a NULL kategóriájú sorokat NÉMÁN eldobná. Itt ez ma nem
 * fordulhat elő (`befizetes.id_befizetescel` és `kiadas.id_kiadascel` egyaránt
 * NOT NULL — élesben mérve), de egy id-lista alapú `not.in` akkor is helyes
 * marad, ha ez valaha változik. Egy fölösleges sor kihagyása súlyosabb hiba
 * lenne, mint egy fölösleges sor bennhagyása: az előbbi PÉNZT tüntet el.
 */

/** A belső mozgás junction-azonosítói — a `not.in` szűrőkhöz. */
export type BelsoMozgasCelIds = { bev: number[]; kia: number[] }

/** Igaz, ha a számadási kód a belső mozgás / pénztármaradvány fejezetbe esik. */
export function belsoMozgasKod(kod: string | null | undefined): boolean {
  const k = (kod ?? '').toString().trim()
  if (!k) return false
  return /^[34]/.test(k) || k === '100' || k.startsWith('100.')
}

/**
 * Feloldja a belső mozgás befizetescel/kiadascel azonosítóit.
 *
 * FAIL-CLOSED-ot a HÍVÓ dönt el: hiba esetén `error`-t adunk vissza, és a hívó
 * feladata eldönteni, hogy inkább nem mutat számot, mint hogy rosszat mutasson.
 */
export async function loadBelsoMozgasCelIds(
  supabase: SupabaseClient,
): Promise<BelsoMozgasCelIds | { error: string }> {
  const [bevRes, kiaRes] = await Promise.all([
    supabase.from('befizetescel').select('id, id_szamadasicel'),
    supabase.from('kiadascel').select('id, id_szamadasicel'),
  ])
  if (bevRes.error) return { error: `befizetescel: ${bevRes.error.message}` }
  if (kiaRes.error) return { error: `kiadascel: ${kiaRes.error.message}` }

  type Sor = { id: number; id_szamadasicel: string | null }
  const bev = ((bevRes.data || []) as Sor[])
    .filter((r) => belsoMozgasKod(r.id_szamadasicel))
    .map((r) => Number(r.id))
  const kia = ((kiaRes.data || []) as Sor[])
    .filter((r) => belsoMozgasKod(r.id_szamadasicel))
    .map((r) => Number(r.id))
  return { bev, kia }
}

/**
 * PostgREST `not.in` lista-literál: `(1,2,3)`.
 * Üres listánál `null`-t adunk — a hívó ilyenkor NE tegyen rá szűrőt
 * (egy `in.()` üres lista szintaktikai hiba lenne).
 */
export function notInLista(ids: number[]): string | null {
  if (!ids.length) return null
  return `(${ids.join(',')})`
}
