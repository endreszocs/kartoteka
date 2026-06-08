'use server'

/**
 * Gyülekezeti célok (jövőbeli célok) — szerver-oldali olvasás/mentés.
 * A `gyulekezeti_celok` tábla (2026-06-08 migráció) tárolja évenként/pillérenként.
 * Ha a tábla még nincs létrehozva, gracefully üres listát / hibát adunk vissza
 * (a prezentáció enélkül is működik, a helyi szöveges célokkal).
 */

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

export interface GoalRow {
  id?: string
  /** 1 = Lélekszámbeli, 2 = Lelki, 3 = Anyagi */
  piller: number
  /** Ismert metrika a tényadat automatikus kiszámításához, vagy null (szabad szöveg). */
  metrika: string | null
  celertek: number | null
  szoveg: string | null
}

export async function getGoals(year: number): Promise<GoalRow[]> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return []
  try {
    const { data, error } = await supabase
      .from('gyulekezeti_celok')
      .select('id, piller, metrika, celertek, szoveg')
      .eq('congregation_id', congregationId)
      .eq('ev', year)
    if (error) return [] // tábla még nincs / hiba → üres
    return (data || []) as GoalRow[]
  } catch {
    return []
  }
}

export async function saveGoals(year: number, rows: GoalRow[]): Promise<{ success?: true; error?: string }> {
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user || !congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }
  try {
    // „Csere" stratégia: az adott év céljait töröljük, majd újraírjuk.
    const del = await supabase.from('gyulekezeti_celok').delete().eq('congregation_id', congregationId).eq('ev', year)
    if (del.error) return { error: `Hiba: ${del.error.message}` }

    const clean = rows.filter((r) => (r.szoveg && r.szoveg.trim()) || r.celertek != null)
    if (clean.length > 0) {
      const ins = await supabase.from('gyulekezeti_celok').insert(
        clean.map((r) => ({
          congregation_id: congregationId,
          ev: year,
          piller: r.piller,
          metrika: r.metrika || null,
          celertek: r.celertek ?? null,
          szoveg: r.szoveg || null,
          created_by: user.id,
        })),
      )
      if (ins.error) return { error: `Hiba: ${ins.error.message}` }
    }
    return { success: true }
  } catch {
    return { error: 'A célok mentése nem sikerült.' }
  }
}
