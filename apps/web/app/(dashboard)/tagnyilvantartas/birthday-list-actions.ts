'use server'

/**
 * A tagnyilvántartás Áttekintés fül „E havi születésnaposok" doboza a
 * dashboard-éval AZONOS BirthdayListDialog-ot nyitja (2026-07-24, PR-9,
 * 6. észrevétel). Ez a lazy loader adja a dialógus bemenetét: a látható
 * tagok minimál-listája + a gyülekezet fejléc-adatai. (A lakcímek a
 * dialóguson belül, „Lakhely megjelenítése" kapcsoló mögött töltődnek.)
 */

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

export interface BirthdayListMember {
  id: string
  csaladnev: string | null
  k_nev: string | null
  namepattern: string | null
  /** 2026-08-01 (PR-19): az özv./elv. előtaghoz */
  allapot: string | null
  sz_datum: string | null
  ferfi: boolean | null
}

export interface BirthdayListData {
  members: BirthdayListMember[]
  congregationName: string
  congregationLogo: string | null
}

export async function getBirthdayListData(): Promise<BirthdayListData> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { members: [], congregationName: 'Gyülekezet', congregationLogo: null }

  // 2026-08-01 (PR-19): lapozott lekérés (1000-es Supabase-plafon felett eddig
  // némán csonkolt) + elköltözöttek kizárása (dashboard-paritás — eddig itt
  // a már elköltözött tag is születésnaposként jelent meg).
  const PAGE = 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  let membersError: string | null = null
  for (let fromIdx = 0; ; fromIdx += PAGE) {
    const { data, error } = await supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, namepattern, allapot, sz_datum, ferfi')
      .eq('congregation_id', congregationId)
      .eq('isvisible', true)
      .eq('meghalt', false)
      .order('id', { ascending: true })
      .range(fromIdx, fromIdx + PAGE - 1)
    if (error) { membersError = error.message; break }
    rows.push(...(data || []))
    if ((data || []).length < PAGE) break
  }

  const [elkoltozottRes, congRes] = await Promise.all([
    supabase
      .from('elkoltozott')
      .select('id_szemely')
      .eq('congregation_id', congregationId),
    supabase
      .from('congregations')
      .select('name, nev_hu, cimer_url')
      .eq('id', congregationId)
      .maybeSingle(),
  ])

  if (membersError) {
    console.error('[tagnyilvantartas/birthday-list] tagok lekérdezése hiba:', membersError)
  }

  const movedIds = new Set(
    ((elkoltozottRes.data || []) as { id_szemely: number | null }[])
      .map((e) => (e.id_szemely != null ? String(e.id_szemely) : null))
      .filter((v): v is string => v !== null),
  )

  const cong = congRes.data as { name: string | null; nev_hu: string | null; cimer_url: string | null } | null
  return {
    members: rows
      .map((m) => ({
        id: String(m.id),
        csaladnev: (m.csaladnev as string | null) ?? null,
        k_nev: (m.k_nev as string | null) ?? null,
        namepattern: (m.namepattern as string | null) ?? null,
        allapot: (m.allapot as string | null) ?? null,
        sz_datum: (m.sz_datum as string | null) ?? null,
        ferfi: (m.ferfi as boolean | null) ?? null,
      }))
      .filter((m) => !movedIds.has(m.id)),
    congregationName: cong?.nev_hu || cong?.name || 'Gyülekezet',
    congregationLogo: cong?.cimer_url ?? null,
  }
}
