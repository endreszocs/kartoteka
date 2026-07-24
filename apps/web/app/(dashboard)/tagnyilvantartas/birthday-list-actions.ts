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

  const [membersRes, congRes] = await Promise.all([
    supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, namepattern, sz_datum, ferfi')
      .eq('congregation_id', congregationId)
      .eq('isvisible', true)
      .eq('meghalt', false),
    supabase
      .from('congregations')
      .select('name, nev_hu, cimer_url')
      .eq('id', congregationId)
      .maybeSingle(),
  ])

  if (membersRes.error) {
    console.error('[tagnyilvantartas/birthday-list] tagok lekérdezése hiba:', membersRes.error.message)
  }

  const cong = congRes.data as { name: string | null; nev_hu: string | null; cimer_url: string | null } | null
  return {
    members: ((membersRes.data || []) as unknown as Array<Record<string, unknown>>).map((m) => ({
      id: String(m.id),
      csaladnev: (m.csaladnev as string | null) ?? null,
      k_nev: (m.k_nev as string | null) ?? null,
      namepattern: (m.namepattern as string | null) ?? null,
      sz_datum: (m.sz_datum as string | null) ?? null,
      ferfi: (m.ferfi as boolean | null) ?? null,
    })),
    congregationName: cong?.nev_hu || cong?.name || 'Gyülekezet',
    congregationLogo: cong?.cimer_url ?? null,
  }
}
