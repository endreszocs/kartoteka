'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { familySchema, type FamilyInput } from '@/lib/validations/members'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { fetchFamilyPaymentsCompat, fetchPaymentsByMemberIdsCompat } from '@/lib/finance/payment-compat'
import { getVisibleDistrictState, sanitizeDistrictReference } from '@/lib/members/district-visibility'

export interface FamilyRow {
  id: number
  c_szam: string | null
  isaktiv: boolean
  id_csoport: number | null
  ferfi: { id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; allapot: string | null; meghalt: boolean; namepattern: string | null; vallas: string | null } | null
  no: { id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; allapot: string | null; meghalt: boolean; namepattern: string | null; vallas: string | null } | null
  utca: { name: string } | null
}

async function getFamilyAccessContext() {
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  return { supabase, congregationId, userId }
}

async function getAllowedFamilyIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  congregationId: string,
): Promise<Set<number>> {
  const { data: memberRows } = await supabase
    .from('szemely')
    .select('id')
    .eq('congregation_id', congregationId)

  const memberIds = new Set((memberRows || []).map((row: { id: number }) => row.id))
  if (memberIds.size === 0) return new Set()

  const [familiesRes, childrenRes] = await Promise.all([
    supabase.from('csalad').select('id, id_ferfi, id_no'),
    supabase.from('gyerek').select('id_csalad, id_szemely'),
  ])

  const allowed = new Set<number>()
  ;(familiesRes.data || []).forEach((family: { id: number; id_ferfi: number | null; id_no: number | null }) => {
    if ((family.id_ferfi && memberIds.has(family.id_ferfi)) || (family.id_no && memberIds.has(family.id_no))) {
      allowed.add(family.id)
    }
  })
  ;(childrenRes.data || []).forEach((child: { id_csalad: number; id_szemely: number }) => {
    if (memberIds.has(child.id_szemely)) {
      allowed.add(child.id_csalad)
    }
  })

  return allowed
}

export async function getFamilies(): Promise<FamilyRow[]> {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return []
  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  const { data } = await supabase.from('csalad')
    .select('id, c_szam, isaktiv, id_csoport, ferfi:szemely!id_ferfi(id, csaladnev, k_nev, ferfi, sz_datum, allapot, meghalt, namepattern, vallas), no:szemely!id_no(id, csaladnev, k_nev, ferfi, sz_datum, allapot, meghalt, namepattern, vallas), utca:adrstreet!c_utcaid(name)')
  return ((data || []) as unknown as FamilyRow[]).filter(family => allowedFamilyIds.has(family.id))
}

export async function getFamilyDetails(id: number) {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return null
  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(id)) return null

  // 1. Alap adatok
  const [familyRes, childrenRes, districtState] = await Promise.all([
    supabase.from('csalad').select('*, ferfi:szemely!id_ferfi(id, csaladnev, k_nev, ferfi, sz_datum, meghalt, telefon, foglalkozas, vallas, namepattern, allapot), no:szemely!id_no(id, csaladnev, k_nev, ferfi, sz_datum, meghalt, telefon, foglalkozas, vallas, namepattern, allapot), utca:adrstreet!c_utcaid(name), csoport:csoport!id_csoport(nev)').eq('id', id).single(),
    supabase.from('gyerek').select('id_szemely, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum, meghalt, vallas, foglalkozas, namepattern, allapot)').eq('id_csalad', id),
    getVisibleDistrictState(supabase, congregationId),
  ])

  const family = familyRes.data
    ? sanitizeDistrictReference(
        familyRes.data as typeof familyRes.data & { id_csoport: number | null; csoport?: { nev: string } | null },
        districtState.visibleIds,
      )
    : null
  const children = (childrenRes.data || []).map((c: { szemely: unknown }) => c.szemely).filter(Boolean) as {
    id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; meghalt: boolean; vallas: string | null; foglalkozas?: string | null; namepattern?: string | null; allapot?: string | null
  }[]

  // 2. Tagok ID-k összegyűjtése az anyakönyvi lekérdezésekhez
  const memberIds = [family?.id_ferfi, family?.id_no, ...children.map(c => c.id)].filter(Boolean) as number[]

  // 3. Anyakönyvi adatok + családlátogatások
  const [directFamilyPayments, memberLinkedPayments, keresztRes, konfirmRes, hazassagRes, temetesRes] = await Promise.all([
    fetchFamilyPaymentsCompat(supabase, id),
    fetchPaymentsByMemberIdsCompat(supabase, memberIds),
    memberIds.length > 0 ? supabase.from('keresztseg').select('id_szemely, datum, adrlocality!helyid(name), lelkeszneve').in('id_szemely', memberIds) : Promise.resolve({ data: [] }),
    memberIds.length > 0 ? supabase.from('konfirmalas').select('id_szemely, datum, adrlocality!helyid(name), lelkeszneve').in('id_szemely', memberIds) : Promise.resolve({ data: [] }),
    family?.id_ferfi && family?.id_no
      ? supabase.from('hazassag').select('datum, adrlocality!helyid(name), lelkeszneve').eq('id_ferfi', family.id_ferfi).eq('id_no', family.id_no).maybeSingle()
      : Promise.resolve({ data: null }),
    memberIds.length > 0 ? supabase.from('temetes').select('id_szemely, hdatum').in('id_szemely', memberIds) : Promise.resolve({ data: [] }),
  ])

  const paymentsById = new Map<number, (typeof directFamilyPayments)[number]>()
  ;[...directFamilyPayments, ...memberLinkedPayments].forEach((payment) => {
    if (!paymentsById.has(payment.id)) {
      paymentsById.set(payment.id, payment)
    }
  })
  const payments = [...paymentsById.values()].sort((left, right) =>
    String(right.datum || '').localeCompare(String(left.datum || '')),
  )

  return {
    family,
    children,
    payments: payments,
    keresztelesek: (keresztRes.data || []) as unknown as { id_szemely: number; datum: string; adrlocality?: { name: string } | null; lelkeszneve?: string }[],
    konfirmaciok: (konfirmRes.data || []) as unknown as { id_szemely: number; datum: string; adrlocality?: { name: string } | null; lelkeszneve?: string }[],
    hazassag: hazassagRes.data as unknown as { datum?: string; adrlocality?: { name: string } | null; lelkeszneve?: string } | null,
    temetesek: (temetesRes.data || []) as unknown as { id_szemely: number; hdatum: string }[],
  }
}

export async function saveFamily(data: FamilyInput) {
  const parsed = familySchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, congregationId, userId } = await getFamilyAccessContext()
  const user = userId ? { id: userId } : null
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const d = parsed.data
  const selectedMemberIds = [d.id_ferfi, d.id_no, ...d.gyerekIds].filter(Boolean) as number[]
  if (selectedMemberIds.length > 0) {
    const { data: scopedMembers } = await supabase
      .from('szemely')
      .select('id')
      .eq('congregation_id', congregationId)
      .in('id', selectedMemberIds)

    if ((scopedMembers || []).length !== selectedMemberIds.length) {
      return { error: 'A család csak az aktuális gyülekezet tagjaiból állhat.' }
    }
  }

  const familyData: Record<string, unknown> = {
    id_ferfi: d.id_ferfi,
    id_no: d.id_no,
    c_utcaid: d.c_utcaid || null,
    c_szam: d.c_szam || null,
    id_csoport: d.id_csoport || null,
    isaktiv: true,
  }

  let familyId = d.id

  if (d.id) {
    const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
    if (!allowedFamilyIds.has(d.id)) {
      return { error: 'Nincs jogosultsága ennek a családnak a szerkesztéséhez.' }
    }
    const { error } = await supabase.from('csalad').update(familyData).eq('id', d.id)
    if (error) return { error: `Hiba: ${error.message}` }
    // Gyerekek frissítés: régi törlés + új insert
    await supabase.from('gyerek').delete().eq('id_csalad', d.id)
  } else {
    const { data: ins, error } = await supabase.from('csalad').insert([familyData]).select('id')
    if (error) return { error: `Hiba: ${error.message}` }
    if (!ins?.[0]) return { error: 'Nem kaptunk vissza azonosítót.' }
    familyId = ins[0].id
  }

  // Gyerekek hozzárendelés
  if (familyId && d.gyerekIds.length > 0) {
    const gyerekRows = d.gyerekIds.map(szemId => ({ id_csalad: familyId!, id_szemely: szemId }))
    await supabase.from('gyerek').insert(gyerekRows)
  }

  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// ── Szabad személy keresés (házasok kiszűrve) ────────────────

export async function searchFamilyMember(query: string, role: 'ferfi' | 'no' | 'gyerek', editFamilyId?: number) {
  if (query.trim().length < 2) return []
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return []
  const parts = query.trim().split(/\s+/)

  let q = supabase.from('szemely')
    .select('id, csaladnev, k_nev, ferfi, sz_datum, c_szam, c_utcaid, c_helysegid, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
    .eq('congregation_id', congregationId).eq('isvisible', true).eq('meghalt', false)

  if (role === 'ferfi') q = q.eq('ferfi', true)
  else if (role === 'no') q = q.eq('ferfi', false)

  if (parts.length === 1) q = q.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`)
  else q = q.ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`)

  const { data: members } = await q.limit(10)
  if (!members?.length) return []

  // Házasok kiszűrése
  const { data: allFamilies } = await supabase.from('csalad').select('id_ferfi, id_no')
  const marriedIds = new Set<number>()
  ;(allFamilies || []).forEach((f: { id_ferfi: number | null; id_no: number | null }) => {
    // Szerkesztéskor a jelenlegi család tagjait ne szűrjük ki
    if (role === 'ferfi' && f.id_ferfi) marriedIds.add(f.id_ferfi)
    if (role === 'no' && f.id_no) marriedIds.add(f.id_no)
  })

  return members.filter(m => !marriedIds.has(m.id) || (editFamilyId !== undefined))
}

export async function deleteFamily(id: number) {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }
  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(id)) return { error: 'Nincs jogosultsága ennek a családnak a törléséhez.' }
  await supabase.from('gyerek').delete().eq('id_csalad', id)
  const { error } = await supabase.from('csalad').delete().eq('id', id)
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// ── Családlátogatás ─────────────────────────────────────────

export async function getFamilyVisits(familyId: number) {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return []
  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(familyId)) return []
  const { data } = await supabase.from('csaladlatogatas')
    .select('*')
    .eq('id_csalad', familyId)
    .eq('congregation_id', congregationId)
    .order('datum', { ascending: false })
  return (data || []) as { id: string; datum: string; lelkesz: string; alapige: string | null; megjegyzes: string | null }[]
}

export async function saveFamilyVisit(data: { familyId: number; datum: string; lelkesz: string; alapige?: string; megjegyzes?: string; toMunkanaplo?: boolean }) {
  const { supabase, congregationId, userId } = await getFamilyAccessContext()
  const user = userId ? { id: userId } : null
  if (!user || !congregationId) return { error: 'Nincs bejelentkezve.' }
  if (!data.datum || !data.lelkesz) return { error: 'A dátum és a lelkész neve kötelező.' }

  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(data.familyId)) return { error: 'Nincs jogosultsága ehhez a családhoz.' }

  // Családlátogatás mentés
  const { error } = await supabase.from('csaladlatogatas').insert({
    id_csalad: data.familyId,
    datum: data.datum,
    lelkesz: data.lelkesz,
    alapige: data.alapige || null,
    megjegyzes: data.megjegyzes || null,
    congregation_id: congregationId,
  })
  if (error) return { error: error.message }

  // Munkanapló szinkron
  if (data.toMunkanaplo) {
    try {
      await supabase.from('munkanaplo').insert({
        idopont: data.datum,
        jellege: 'Családlátogatás',
        alapige: data.alapige || null,
        szolgalt: data.lelkesz,
        megjegyzes: data.megjegyzes || null,
        kategoria: 'latogatas',
        congregation_id: congregationId,
      })
    } catch { /* munkanapló hiba nem blokkolja a mentést */ }
  }

  revalidatePath('/tagnyilvantartas')
  return { success: true }
}
