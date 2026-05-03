/**
 * Költségvetési kód feloldó: szamadasicel "101.01" → befizetescel/kiadascel ID.
 *
 * Az EREK könyvelési számhalom kódjai (gyakori példák a 2025-ös Kasszából):
 *   - 101.01 = Egyházfenntartói járulék (360 sor)         → bevétel
 *   - 101.04 = Adományok hívektől (104 sor)               → bevétel
 *   - 101.03 = Perselypénz                                → bevétel
 *   - 104.05 = Területek bérjövedelme                     → bevétel
 *   - 201.13 = Karbantartási kiadások (27 sor)            → kiadás
 *   - 202.01 = Gyerek és ifjúsági tevékenységek           → kiadás
 *   - 201.09 = Fogyóanyagok, más anyagok (10 sor)         → kiadás
 *   - 400.01 = Készpénzletétel/-felvétel (15 sor)          → belső mozgás
 *
 * Konvenció: a "100"-as prefix bevétel, a "200"-as kiadás, a "400"-as belső
 * mozgás. A `befizetescel.id_szamadasicel` és `kiadascel.id_szamadasicel`
 * UNIQUE FK-vel köti a kódot a `szamadasicel.id`-hez. Egy kód → max 1 cel
 * rekord oldalon.
 *
 * 2026-05-02 (Fázis 2): teljes implementáció — 3 batch SELECT a Supabase-ből,
 * Map-építés, kódnormalizálás (magyar tizedesvessző).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type BudgetCodeResolution =
  | { kind: 'income'; befizetescelId: number; szamadasicel: string; nev: string }
  | { kind: 'expense'; kiadascelId: number; szamadasicel: string; nev: string }
  | {
      kind: 'internal-transfer'
      szamadasicel: string
      nev: string
      /** A 400.xx kódhoz tartozó befizetescel ID (kassza→bank esetén bank-oldal) */
      befizetescelId: number | null
      /** A 400.xx kódhoz tartozó kiadascel ID (kassza→bank esetén kassza-oldal) */
      kiadascelId: number | null
    }
  | { kind: 'unknown'; reason: string; rawKod: string }

export interface BudgetCodeMaps {
  /** szamadasicel.id ("101.01") → { nev, type } */
  szamadasicel: Map<string, { nev: string; type: string }>
  /** szamadasicel.id → { id: befizetescel.id, nev: befizetescel.nev } */
  befizetescel: Map<string, { id: number; nev: string }>
  /** szamadasicel.id → { id: kiadascel.id, nev: kiadascel.nev } */
  kiadascel: Map<string, { id: number; nev: string }>
}

/**
 * 3 batch SELECT-tel felépíti a kód-térképeket az adott gyülekezethez.
 *
 *   1. szamadasicel — a kódhalom alaptáblája (gyakran shared, congregation_id nélkül)
 *   2. befizetescel — a gyülekezet bevétel-kategóriái (FK: id_szamadasicel)
 *   3. kiadascel — a gyülekezet kiadás-kategóriái (FK: id_szamadasicel)
 *
 * @param supabase Supabase kliens (server-side javasolt)
 * @param congregationId Gyülekezet UUID
 */
export async function buildBudgetCodeMaps(
  supabase: SupabaseClient,
  congregationId: string,
): Promise<BudgetCodeMaps> {
  const maps: BudgetCodeMaps = {
    szamadasicel: new Map(),
    befizetescel: new Map(),
    kiadascel: new Map(),
  }

  // 1. szamadasicel — gyülekezet-szintű, NEM congregation_id-szűrt
  // (a séma szerint a kódhalom a system-szintű és gyülekezeti szinten egyaránt
  // lehet — a "szint" oszlop dönti el, de minden congregation látja az
  // alapszintet)
  const { data: szRows, error: szErr } = await supabase
    .from('szamadasicel')
    .select('id, nev, type')
    .eq('aktiv', true)

  if (szErr) {
    throw new Error(`szamadasicel betöltés hiba: ${szErr.message}`)
  }

  for (const row of szRows || []) {
    if (row.id) {
      maps.szamadasicel.set(String(row.id), {
        nev: row.nev || String(row.id),
        type: row.type || 'unknown',
      })
    }
  }

  // 2. befizetescel — congregation-szűrt
  const { data: befRows, error: befErr } = await supabase
    .from('befizetescel')
    .select('id, nev, id_szamadasicel')
    .eq('aktiv', true)

  if (befErr) {
    throw new Error(`befizetescel betöltés hiba: ${befErr.message}`)
  }

  for (const row of befRows || []) {
    if (row.id_szamadasicel) {
      maps.befizetescel.set(String(row.id_szamadasicel), {
        id: row.id as number,
        nev: row.nev || '',
      })
    }
  }

  // 3. kiadascel — congregation-szűrt
  const { data: kiaRows, error: kiaErr } = await supabase
    .from('kiadascel')
    .select('id, nev, id_szamadasicel')
    .eq('aktiv', true)

  if (kiaErr) {
    throw new Error(`kiadascel betöltés hiba: ${kiaErr.message}`)
  }

  for (const row of kiaRows || []) {
    if (row.id_szamadasicel) {
      maps.kiadascel.set(String(row.id_szamadasicel), {
        id: row.id as number,
        nev: row.nev || '',
      })
    }
  }

  // congregationId paramétert egyelőre nem használjuk, mert a séma szerint
  // a befizetescel/kiadascel a system-szinten élnek (UNIQUE constraint az
  // id_szamadasicel-en). Ha bevezetjük a per-gyülekezeti kategóriákat, itt
  // bekerül egy `.eq('congregation_id', congregationId)` szűrő.
  void congregationId

  return maps
}

/**
 * Egy kódot felold a megfelelő befizetescel/kiadascel-id-re.
 *
 * @param kod Kód, lehet "101.01", "102,14" (magyar tizedesvessző), "101_01"
 * @param maps A `buildBudgetCodeMaps` által épített térképek
 */
export function resolveBudgetCode(
  kod: string | number | null | undefined,
  maps: BudgetCodeMaps,
): BudgetCodeResolution {
  if (kod === null || kod === undefined || kod === '') {
    return { kind: 'unknown', reason: 'üres kód', rawKod: '' }
  }

  const normalized = normalizeBudgetCode(kod)
  if (!normalized) {
    return {
      kind: 'unknown',
      reason: `nem értelmezhető kód: "${kod}"`,
      rawKod: String(kod),
    }
  }

  const sz = maps.szamadasicel.get(normalized)
  if (!sz) {
    return {
      kind: 'unknown',
      reason: `ismeretlen kód: ${normalized}`,
      rawKod: String(kod),
    }
  }

  // Belső mozgás (400-as prefix) — készpénz-bank közötti átvitel.
  // Mindkét oldal ID-ját megpróbáljuk kiolvasni: a párhuzamos befizetes +
  // kiadas INSERT-hez kell a kassza-oldal `kiadascel.id` és a bank-oldal
  // `befizetescel.id` (vagy fordítva, az iránytól függően).
  if (normalized.startsWith('400')) {
    const bef = maps.befizetescel.get(normalized) || null
    const kia = maps.kiadascel.get(normalized) || null
    return {
      kind: 'internal-transfer',
      szamadasicel: normalized,
      nev: sz.nev,
      befizetescelId: bef?.id ?? null,
      kiadascelId: kia?.id ?? null,
    }
  }

  // Bevétel oldal (befizetescel találat)
  const bef = maps.befizetescel.get(normalized)
  if (bef) {
    return {
      kind: 'income',
      befizetescelId: bef.id,
      szamadasicel: normalized,
      nev: bef.nev,
    }
  }

  // Kiadás oldal (kiadascel találat)
  const kia = maps.kiadascel.get(normalized)
  if (kia) {
    return {
      kind: 'expense',
      kiadascelId: kia.id,
      szamadasicel: normalized,
      nev: kia.nev,
    }
  }

  // Konvenció szerinti besorolás (ha nincs befizetescel/kiadascel rekord)
  if (normalized.startsWith('1')) {
    return {
      kind: 'unknown',
      reason: `1xx-prefixű kód (${sz.nev}), de nincs befizetescel rekord — szükséges egy admin felületen létrehozni`,
      rawKod: String(kod),
    }
  }
  if (normalized.startsWith('2')) {
    return {
      kind: 'unknown',
      reason: `2xx-prefixű kód (${sz.nev}), de nincs kiadascel rekord — szükséges egy admin felületen létrehozni`,
      rawKod: String(kod),
    }
  }

  return {
    kind: 'unknown',
    reason: `kód létezik szamadasicel-ben (${sz.nev}, type=${sz.type}), de nem azonosítható típus`,
    rawKod: String(kod),
  }
}

/**
 * "102,14" → "102.14"; "101_01" → "101.01"; "" → null.
 */
export function normalizeBudgetCode(input: string | number | null | undefined): string | null {
  if (input === null || input === undefined) return null
  const s = String(input).trim()
  if (!s) return null
  // Magyar tizedesvessző és aláhúzás → pont
  const normalized = s.replace(/,/g, '.').replace(/_/g, '.')
  // Validáció: csak szám-pont kombináció
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  return normalized
}

/* ───────────────────────────────────────────────────────────────────────
 * @testdata — manuális smoke test (Fázis 2)
 *
 *   normalizeBudgetCode('102,14')   // → '102.14'
 *   normalizeBudgetCode('101.01')   // → '101.01'
 *   normalizeBudgetCode('400_01')   // → '400.01'
 *   normalizeBudgetCode('')         // → null
 *   normalizeBudgetCode('abc')      // → null
 *
 * resolveBudgetCode('101.01', maps) // → { kind: 'income', befizetescelId: ..., nev: 'Egyházfenntartói járulék' }
 * resolveBudgetCode('201.13', maps) // → { kind: 'expense', kiadascelId: ..., nev: 'Karbantartási kiadások' }
 * resolveBudgetCode('400.01', maps) // → { kind: 'internal-transfer', szamadasicel: '400.01', ... }
 * resolveBudgetCode('999.99', maps) // → { kind: 'unknown', reason: 'ismeretlen kód: 999.99', ... }
 * ─────────────────────────────────────────────────────────────────────── */
