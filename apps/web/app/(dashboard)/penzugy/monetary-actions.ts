'use server'

import { revalidatePath } from 'next/cache'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

export interface MonetaryDenomination {
  id: number
  name: string
  value: number
  divide: number
  displayValue: string
  category: 'bankjegy' | 'erme'
}

export interface MonetarySnapshot {
  denominations: MonetaryDenomination[]
  counts: Record<number, number>
  sourceId: string
}

const CANONICAL_DENOMINATIONS = [
  { label: '500 lejes bankjegy', value: 500, category: 'bankjegy' as const },
  { label: '200 lejes bankjegy', value: 200, category: 'bankjegy' as const },
  { label: '100 lejes bankjegy', value: 100, category: 'bankjegy' as const },
  { label: '50 lejes bankjegy', value: 50, category: 'bankjegy' as const },
  { label: '20 lejes bankjegy', value: 20, category: 'bankjegy' as const },
  { label: '10 lejes bankjegy', value: 10, category: 'bankjegy' as const },
  { label: '5 lejes bankjegy', value: 5, category: 'bankjegy' as const },
  { label: '1 lejes címlet', value: 1, category: 'bankjegy' as const },
  { label: '50 banis érme', value: 0.5, category: 'erme' as const },
  { label: '10 banis érme', value: 0.1, category: 'erme' as const },
  { label: '5 banis érme', value: 0.05, category: 'erme' as const },
  { label: '1 banis érme', value: 0.01, category: 'erme' as const },
]

function buildSourceId(congregationId: string, year: number) {
  return `${congregationId}:${year}`
}

/**
 * 2026-07-11 (S10): a globális `nom_cimlet` (címlettörzs) ÖNJAVÍTÓ pótlása.
 * A tábla RLS-e csak SELECT — a szerver-akció közvetlenül nem tud beszúrni —,
 * ezért egy SECURITY DEFINER függvényt (`ensure_cash_denominations`) hívunk,
 * ami biztonságosan pótolja a hiányzó 12 hivatalos címletet. Best-effort:
 * ha a függvény még nincs telepítve (migráció nem futott), csendben tovább
 * lép, és a mentés a régi, érthető hibaüzenettel jelez.
 */
async function ensureCanonicalDenominations(
  supabase: Awaited<ReturnType<typeof getEffectiveCongregationContext>>['supabase'],
): Promise<void> {
  try {
    await supabase.rpc('ensure_cash_denominations')
  } catch {
    // A migráció (2026-07-11-nom-cimlet-seed.sql) még nem futott — nem baj.
  }
}

function formatDisplayValue(value: number) {
  if (value >= 1) return `${value} RON`
  return `${Math.round(value * 100)} bani`
}

export async function getMonetarySnapshot(year: number): Promise<MonetarySnapshot | { error: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  // 2026-07-11 (S10): mielőtt olvasunk, pótoljuk a hiányzó címleteket — így a
  // widget VALÓDI (pozitív) id-kkal töltődik, és a mentés zökkenőmentes.
  await ensureCanonicalDenominations(supabase)

  const sourceId = buildSourceId(congregationId, year)
  const [denominationsRes, countsRes] = await Promise.all([
    supabase
      .from('nom_cimlet')
      .select('id, name, val, divide, deleted')
      .or('deleted.eq.false,deleted.is.null')
      .order('val', { ascending: false }),
    supabase
      .from('monetar')
      .select('cimlet_id, darab')
      .eq('source', 'congregation_cash_check')
      .eq('sourceid', sourceId),
  ])

  if (denominationsRes.error) return { error: denominationsRes.error.message }
  if (countsRes.error) return { error: countsRes.error.message }

  const actualDenominations = (denominationsRes.data || []).map((row) => {
    const value = Number(row.val) / Math.max(Number(row.divide) || 1, 1)
    return {
      id: Number(row.id),
      name: String(row.name),
      value,
      divide: Number(row.divide),
      displayValue: formatDisplayValue(value),
      category: value >= 1 ? 'bankjegy' : 'erme',
    } satisfies MonetaryDenomination
  })

  const actualByValue = new Map(actualDenominations.map((row) => [row.value.toFixed(2), row]))
  const denominations =
    actualDenominations.length >= CANONICAL_DENOMINATIONS.length
      ? actualDenominations
      : CANONICAL_DENOMINATIONS.map((item, index) => {
          const actual = actualByValue.get(item.value.toFixed(2))
          if (actual) return actual

          return {
            id: -(index + 1),
            name: item.label,
            value: item.value,
            divide: item.value >= 1 ? 1 : 100,
            displayValue: formatDisplayValue(item.value),
            category: item.category,
          } satisfies MonetaryDenomination
        })

  const counts = Object.fromEntries(
    (countsRes.data || []).map((row) => [Number(row.cimlet_id), Number(row.darab) || 0]),
  )

  return {
    denominations,
    counts,
    sourceId,
  }
}

/**
 * P3-14 (audit 2026-08-28, Endre döntése): a Monetár mentése VÉGLEGESÍTETT
 * évnél NEM tiltott, de a felület figyelmeztetést ajánl fel — ez a csak-olvasó
 * ellenőrzés adja hozzá az év-zár állapotát. FAIL-OPEN: figyelmeztetés, nem
 * védelem — hibánál nem akadályozzuk a mentést.
 */
export async function getMonetarEvZar(year: number): Promise<{ finalized: boolean }> {
  try {
    const { supabase, congregationId } = await getEffectiveCongregationContext()
    if (!congregationId) return { finalized: false }
    const { data } = await supabase
      .from('bealitas')
      .select('accounting_finalized')
      .eq('id', String(year))
      .eq('congregation_id', congregationId)
      .maybeSingle()
    return { finalized: Boolean((data as { accounting_finalized?: boolean } | null)?.accounting_finalized) }
  } catch {
    return { finalized: false }
  }
}

export async function saveMonetarySnapshot(
  year: number,
  counts: Array<{ denominationId: number; count: number }>,
) {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  const sourceId = buildSourceId(congregationId, year)
  let sanitizedCounts = counts
    .map((item) => ({
      denominationId: Number(item.denominationId),
      count: Math.max(0, Math.floor(Number(item.count) || 0)),
    }))
    .filter((item) => item.count > 0)

  // 2026-07-11 (S10): ha a widget MÉG szintetikus (negatív) id-kkal töltődött
  // (a címlettörzs üres volt betöltéskor), most pótoljuk a címleteket, és a
  // negatív id-kat a VALÓDI nom_cimlet id-kra képezzük le ÉRTÉK szerint. Így a
  // mentés akkor is sikerül, ha a widget a javítás/seed ELŐTT nyílt meg
  // (nem kell újratölteni). A negatív id determinisztikus: -(index+1) a
  // CANONICAL_DENOMINATIONS sorrendjében.
  if (sanitizedCounts.some((item) => item.denominationId < 0)) {
    await ensureCanonicalDenominations(supabase)
    const { data: freshRows, error: freshErr } = await supabase
      .from('nom_cimlet')
      .select('id, val, divide, deleted')
      .or('deleted.eq.false,deleted.is.null')
    if (freshErr) return { error: freshErr.message }
    const realIdByValue = new Map<string, number>()
    for (const row of freshRows || []) {
      const v = Number(row.val) / Math.max(Number(row.divide) || 1, 1)
      realIdByValue.set(v.toFixed(2), Number(row.id))
    }
    sanitizedCounts = sanitizedCounts.map((item) => {
      if (item.denominationId >= 0) return item
      const canonical = CANONICAL_DENOMINATIONS[-item.denominationId - 1]
      const realId = canonical ? realIdByValue.get(canonical.value.toFixed(2)) : undefined
      return { denominationId: realId ?? item.denominationId, count: item.count }
    })
  }

  if (sanitizedCounts.some((item) => item.denominationId < 0)) {
    return {
      error:
        'A címlettörzs (nom_cimlet) nincs feltöltve ezen a rendszeren, ezért a Monetár még nem menthető. ' +
        'A rendszergazda futtassa le a migration-docs/sql/2026-07-11-nom-cimlet-seed.sql fájlt a Supabase SQL editorban.',
    }
  }

  const deleteResult = await supabase
    .from('monetar')
    .delete()
    .eq('source', 'congregation_cash_check')
    .eq('sourceid', sourceId)

  if (deleteResult.error) return { error: deleteResult.error.message }

  if (sanitizedCounts.length > 0) {
    const insertResult = await supabase.from('monetar').insert(
      sanitizedCounts.map((item) => ({
        cimlet_id: item.denominationId,
        darab: item.count,
        source: 'congregation_cash_check',
        sourceid: sourceId,
      })),
    )

    if (insertResult.error) return { error: insertResult.error.message }
  }

  revalidatePath('/penzugy')
  return { success: true }
}
