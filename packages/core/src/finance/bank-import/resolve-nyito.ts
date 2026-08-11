/**
 * Nyitó egyenlegek FELOLDÁSA — „előző évi záró = következő évi nyitó",
 * TISZTÁN OLVASVA (G5, 2026-07-25; user-kérés: ne kelljen minden évben megadni).
 *
 * ⚠️ SZÁNDÉKOSAN NEM ÍR A DB-BE. Az első tervezet materializálta a levezetett
 * nyitókat ('carryover' sorként) — az ellenőrzés három P1-et talált rajta:
 * lezárt (véglegesített) év nyitóját is felülírta volna, versenyhelyzetben a
 * kézi nyitót carryoverre cserélte, részleges materializációnál pedig a
 * „van-e idei sor" kapcsoló kiejtette a fel nem oldott számlák egyenlegét.
 * Írás nélkül mindez tárgytalan: a levezetett érték minden betöltéskor
 * frissen számolódik, és automatikusan követi az utólagos könyveléseket is.
 *
 * SZABÁLYOK:
 *   - az évre RÖGZÍTETT sor (kézi/import/korábbi carryover) mindig a hiteles;
 *   - ha nincs, a legutolsó korábbi rögzített sor + a közte lévő évek nettó
 *     forgalma adja a nyitót (számlánként külön, a kassza külön);
 *   - ha egyáltalán nincs rögzített sor, a bázis 0 (a rendszer-indulás előtti
 *     állapot ismeretlen) — a meglévő fallback-viselkedéssel azonos;
 *   - RON-ekvivalensben számol (osszeg_ron ?? osszeg), a stornózott/törölt
 *     tételek kizárva — a calculateBalances-szel azonos szemantika.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────
// Tiszta (pure) mag — web + desktop + teszt közös
// ─────────────────────────────────────────────────────────────────────────

export interface NyitoRecordedRow {
  eve: number
  ertek: number
  forrasa?: string | null
}

export interface ResolvedNyito {
  /** A feloldott nyitó (RON). */
  value: number
  /** Melyik év rögzített sorából indult (null = nem volt rögzített bázis). */
  baseYear: number | null
  /** true, ha nem az adott évre rögzített sor, hanem levezetés adta. */
  derived: boolean
  /** A bázis-sor forrása, ha volt (manual | import | carryover). */
  baseForrasa?: string | null
}

/**
 * Egy „számla" (bank vagy kassza) nyitójának feloldása a célévre.
 *
 * @param rows      az adott számla rögzített nyitó-sorai (év → érték)
 * @param netByYear évenkénti NETTÓ forgalom (bevétel − kiadás) RON-ban
 * @param maxDepth  hány évet láncolhat vissza legfeljebb (védelem elszállt
 *                  adat ellen; a bázison túli évek nem számítanak)
 */
export function resolveNyitoForYear(
  rows: NyitoRecordedRow[],
  netByYear: Map<number, number>,
  targetYear: number,
  maxDepth = 10,
): ResolvedNyito {
  const exact = rows.find((r) => r.eve === targetYear)
  if (exact) {
    return {
      value: Number(exact.ertek) || 0,
      baseYear: targetYear,
      derived: false,
      baseForrasa: exact.forrasa ?? null,
    }
  }

  // A legutolsó korábbi rögzített sor a bázis.
  let base: NyitoRecordedRow | null = null
  for (const r of rows) {
    if (r.eve < targetYear && (!base || r.eve > base.eve)) base = r
  }

  // A lánc a bázis évétől fut. Ha a bázis a megengedettnél régebbi, a bázist
  // EL KELL DOBNI (a részleges forgalommal megtartott bázis garantáltan hibás
  // összeget adna) — ilyenkor 0-ról indulunk az ablak elejéről.
  const windowStart = targetYear - maxDepth
  const useBase = base != null && base.eve >= windowStart
  const from = useBase ? (base as NyitoRecordedRow).eve : windowStart
  let value = useBase ? Number((base as NyitoRecordedRow).ertek) || 0 : 0
  for (let y = from; y < targetYear; y++) {
    value += netByYear.get(y) ?? 0
  }
  return {
    value: Number(value.toFixed(2)),
    baseYear: useBase ? (base as NyitoRecordedRow).eve : null,
    derived: true,
    baseForrasa: useBase ? ((base as NyitoRecordedRow).forrasa ?? null) : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Use-case: adatgyűjtés + feloldás (olvasás-only)
// ─────────────────────────────────────────────────────────────────────────

export interface ResolveNyitoCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export interface ResolveNyitoInput {
  congregationId: string
  /** A cél költségvetési év. */
  eve: number
  /** Hány évet láncolhat vissza (default 8). */
  maxDepth?: number
}

export interface ResolveNyitoResult {
  success: boolean
  error?: string
  /** Kassza (készpénz) nyitója. */
  cash: ResolvedNyito
  /** Bankszámlánkénti nyitó (bankszamla_id → feloldott érték). */
  bank: Record<number, ResolvedNyito>
  /** Összes bankszámla nyitója összegezve (a KPI-khoz). */
  bankTotal: number
}

const PAGE_SIZE = 1000

const EMPTY: ResolvedNyito = { value: 0, baseYear: null, derived: true }

/**
 * Az évek nettó forgalma számlánként + kasszára, EGY lapozott lekérdezés-párból.
 * A `bankszamla_id` NULL = kassza. Stornó/törölt kizárva; RON-ekvivalens.
 */
async function loadNetByYear(
  supabase: SupabaseClient,
  congregationId: string,
  fromYear: number,
  toYearInclusive: number,
): Promise<
  | { cash: Map<number, number>; bank: Map<number, Map<number, number>> }
  | { error: string }
> {
  const cash = new Map<number, number>()
  const bank = new Map<number, Map<number, number>>()
  if (fromYear > toYearInclusive) return { cash, bank }

  const from = `${fromYear}-01-01`
  const to = `${toYearInclusive + 1}-01-01`

  for (const [table, sign] of [
    ['befizetes', 1],
    ['kiadas', -1],
  ] as const) {
    for (let offset = 0; ; ) {
      const { data, error } = await supabase
        .from(table)
        .select('osszeg, osszeg_ron, bankszamla_id, datum')
        .eq('congregation_id', congregationId)
        .eq('deleted', false)
        .eq('stornozott', false)
        .gte('datum', from)
        .lt('datum', to)
        // 2026-08-11 (6. kör, P0 #2 — a K5-#7 hibaosztály): a lapozás MELLÉ
        // determinisztikus rendezés is kell. Minden `.range()` lap KÜLÖN
        // HTTP-kérés = külön DB-snapshot; ORDER BY nélkül a Postgres nem
        // garantálja a lapok közti stabil sorrendet, így 1000+ tételes évnél egy
        // tétel KÉTSZER is beeshet vagy kimaradhat. Ez a függvény MINDEN nyitó
        // egyenleg forrása (Registru, Számadás, Részszámadás) — a néma hiba itt
        // az összes hivatalos nyomtatványt elrontja.
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) return { error: error.message }
      const rows = (data || []) as Array<{
        osszeg: number | null
        osszeg_ron: number | null
        bankszamla_id: number | null
        datum: string | null
      }>
      for (const r of rows) {
        const year = r.datum ? Number(r.datum.slice(0, 4)) : NaN
        if (!Number.isFinite(year)) continue
        const amount = sign * (Number(r.osszeg_ron ?? r.osszeg) || 0)
        if (r.bankszamla_id == null) {
          cash.set(year, (cash.get(year) ?? 0) + amount)
        } else {
          let m = bank.get(r.bankszamla_id)
          if (!m) {
            m = new Map<number, number>()
            bank.set(r.bankszamla_id, m)
          }
          m.set(year, (m.get(year) ?? 0) + amount)
        }
      }
      // Csak az ÜRES lap a biztos stop (rövid lap még nem feltétlenül a vége).
      if (rows.length === 0) break
      offset += rows.length
    }
  }
  return { cash, bank }
}

/**
 * A kassza és MINDEN bankszámla nyitójának feloldása a célévre — olvasás-only.
 * Hibatűrő: bármely részlekérdezés hibája esetén a lehető legtöbb adattal tér
 * vissza (success=false + error, de a mezők használhatók maradnak).
 */
export async function resolveNyitoEgyenlegekUseCase(
  input: ResolveNyitoInput,
  ctx: ResolveNyitoCtx,
): Promise<ResolveNyitoResult> {
  const maxDepth = input.maxDepth ?? 8
  const fallback: ResolveNyitoResult = {
    success: false,
    cash: { ...EMPTY },
    bank: {},
    bankTotal: 0,
  }
  if (!input.congregationId) return { ...fallback, error: 'Hiányzó congregation_id.' }

  try {
    const [accountsRes, cashRowsRes, bankRowsRes] = await Promise.all([
      ctx.supabase.from('bankszamlak').select('id').eq('congregation_id', input.congregationId),
      ctx.supabase
        .from('keszpenz_nyito_egyenleg')
        .select('eve, nyito_egyenleg, forrasa')
        .eq('congregation_id', input.congregationId)
        .lte('eve', input.eve),
      ctx.supabase
        .from('bankszamla_nyito_egyenleg')
        .select('eve, nyito_egyenleg_ron, bankszamla_id, forrasa')
        .eq('congregation_id', input.congregationId)
        .lte('eve', input.eve),
    ])

    const firstErr = accountsRes.error || cashRowsRes.error || bankRowsRes.error
    if (firstErr) {
      console.error('[resolve-nyito] nyitó-lekérdezés hiba:', firstErr.message)
      return { ...fallback, error: firstErr.message }
    }

    const cashRows: NyitoRecordedRow[] = (cashRowsRes.data || []).map(
      (r: { eve: number; nyito_egyenleg: number; forrasa?: string | null }) => ({
        eve: Number(r.eve),
        ertek: Number(r.nyito_egyenleg) || 0,
        forrasa: r.forrasa ?? null,
      }),
    )
    const bankRowsById = new Map<number, NyitoRecordedRow[]>()
    for (const r of (bankRowsRes.data || []) as Array<{
      eve: number
      nyito_egyenleg_ron: number
      bankszamla_id: number | null
      forrasa?: string | null
    }>) {
      if (r.bankszamla_id == null) continue
      const list = bankRowsById.get(r.bankszamla_id) ?? []
      list.push({
        eve: Number(r.eve),
        ertek: Number(r.nyito_egyenleg_ron) || 0,
        forrasa: r.forrasa ?? null,
      })
      bankRowsById.set(r.bankszamla_id, list)
    }

    // Meddig kell visszamenni? A legkésőbbi bázis-évek alapján — de legfeljebb
    // maxDepth évet. A tipikus eset (tavalyi sor megvan) EGY évet jelent.
    const accountIds = ((accountsRes.data || []) as Array<{ id: number }>).map((a) => a.id)
    // A betöltendő ablak PONTOSAN az, amit a pure feloldó is használ (különben
    // egy bázis nélküli számla értéke attól függne, milyen régi egy MÁSIK
    // számla bázisa): pontos évi sor → nincs szükség forgalomra; van korábbi,
    // ablakon belüli bázis → attól az évtől; egyébként az ablak elejétől.
    const windowStart = input.eve - maxDepth
    const chainStartOf = (rows: NyitoRecordedRow[]): number => {
      let best: number | null = null
      for (const r of rows) {
        if (r.eve === input.eve) return input.eve // pontos sor — nem kell forgalom
        if (r.eve < input.eve && (best == null || r.eve > best)) best = r.eve
      }
      return best != null && best >= windowStart ? best : windowStart
    }
    let earliest = input.eve // ha mindenkinek pontos sora van, nem kell forgalom
    earliest = Math.min(earliest, chainStartOf(cashRows))
    for (const id of accountIds) earliest = Math.min(earliest, chainStartOf(bankRowsById.get(id) ?? []))
    for (const [id, rows] of bankRowsById) {
      if (!accountIds.includes(id)) earliest = Math.min(earliest, chainStartOf(rows))
    }
    const fromYear = earliest
    const toYear = input.eve - 1

    const nets = await loadNetByYear(ctx.supabase, input.congregationId, fromYear, toYear)
    if ('error' in nets) {
      console.error('[resolve-nyito] forgalom-lekérdezés hiba:', nets.error)
      return { ...fallback, error: nets.error }
    }

    const cash = resolveNyitoForYear(cashRows, nets.cash, input.eve, maxDepth)
    const bank: Record<number, ResolvedNyito> = {}
    let bankTotal = 0
    for (const id of accountIds) {
      const resolved = resolveNyitoForYear(
        bankRowsById.get(id) ?? [],
        nets.bank.get(id) ?? new Map<number, number>(),
        input.eve,
        maxDepth,
      )
      bank[id] = resolved
      bankTotal += resolved.value
    }
    // Olyan számla, amiről már nincs `bankszamlak` sor (törölt), de volt
    // forgalma/nyitója — az összegből ne essen ki.
    for (const [id, rows] of bankRowsById) {
      if (bank[id]) continue
      const resolved = resolveNyitoForYear(rows, nets.bank.get(id) ?? new Map(), input.eve, maxDepth)
      bank[id] = resolved
      bankTotal += resolved.value
    }
    for (const [id, m] of nets.bank) {
      if (bank[id]) continue
      const resolved = resolveNyitoForYear([], m, input.eve, maxDepth)
      bank[id] = resolved
      bankTotal += resolved.value
    }

    return { success: true, cash, bank, bankTotal: Number(bankTotal.toFixed(2)) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ismeretlen hiba a nyitók feloldásakor.'
    console.error('[resolve-nyito] váratlan hiba:', message)
    return { ...fallback, error: message }
  }
}
