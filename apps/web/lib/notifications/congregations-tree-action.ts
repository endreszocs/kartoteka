'use server'

/**
 * Congregations + dioceses fa-szerkezet — a wizard congregation-választójához.
 *
 * 2026-04-30 — Endre kérése: a kiköltözés-import wizard speciális mezőjén
 * a felhasználó kiválaszthassa a célgyülekezetet egy egyházmegyei csoportos
 * dropdownból.
 *
 * Output:
 *   [
 *     { diocese_id: 'uuid', diocese_name: 'Sepsi Református Egyházmegye',
 *       congregations: [
 *         { id: 'uuid', name: 'Sepsiszentgyörgy I. — Vártemplomi...', city: 'Sepsiszentgyörgy' },
 *         ...
 *       ]
 *     },
 *     ...
 *   ]
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

export interface CongregationOption {
  id: string
  name: string
  nev_hu: string | null
  varos: string | null
}

export interface DioceseTreeNode {
  diocese_id: string
  diocese_name: string
  district_name: string | null
  congregations: CongregationOption[]
}

export interface CongregationsTreeResult {
  data?: DioceseTreeNode[]
  /** Olyan gyülekezetek, amelyek NEM tartoznak egyetlen egyházmegyéhez sem
   *  (diocese_id IS NULL). Ezeket a UI külön szekcióban jeleníti meg. */
  unassigned?: CongregationOption[]
  error?: string
}

export async function listCongregationsTree(): Promise<CongregationsTreeResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const supabase = await createClient()

  // Egyházkerület + egyházmegye + gyülekezet egy lekérdezésben
  const { data: congs, error } = await supabase
    .from('congregations')
    .select(`
      id, name, nev_hu, varos, diocese_id,
      diocese:dioceses(
        id, name,
        district:districts(name)
      )
    `)
    .order('name')

  if (error) return { error: `Lekérési hiba: ${error.message}` }

  type CongRow = {
    id: string
    name: string
    nev_hu: string | null
    varos: string | null
    diocese_id: string | null
    diocese: {
      id: string
      name: string
      district: { name: string | null } | null
    } | null
  }

  // Csoportosítás egyházmegye szerint
  const map = new Map<string, DioceseTreeNode>()
  const unassigned: CongregationOption[] = []

  for (const c of (congs || []) as unknown as CongRow[]) {
    const cong: CongregationOption = {
      id: c.id,
      name: c.nev_hu || c.name,
      nev_hu: c.nev_hu,
      varos: c.varos,
    }

    if (!c.diocese_id || !c.diocese) {
      unassigned.push(cong)
      continue
    }

    const key = c.diocese_id
    if (!map.has(key)) {
      map.set(key, {
        diocese_id: c.diocese_id,
        diocese_name: c.diocese.name,
        district_name: c.diocese.district?.name || null,
        congregations: [],
      })
    }
    map.get(key)!.congregations.push(cong)
  }

  // Egyházmegye-fa rendezés (név szerint)
  const tree = Array.from(map.values()).sort((a, b) =>
    a.diocese_name.localeCompare(b.diocese_name, 'hu'),
  )

  return { data: tree, unassigned: unassigned.length > 0 ? unassigned : undefined }
}
