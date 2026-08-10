'use server'

import { revalidatePath } from 'next/cache'
import {
  cemeterySchema,
  plotSchema,
  rentalSchema,
  deceasedSchema,
  type CemeteryInput,
  type PlotInput,
  type RentalInput,
  type DeceasedInput,
} from '@/lib/validations/cemetery'
import type { Cemetery, Plot, Rental, Deceased } from '@/lib/constants/cemetery'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

async function getCongId() {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId }
}

// ─────────────────────────────────────────────────────────────────
// Temetők (sirhelytemeto)
// ─────────────────────────────────────────────────────────────────

export async function getCemeteries(): Promise<Cemetery[]> {
  const { supabase, congId } = await getCongId()
  if (!congId) return []
  const { data } = await supabase
    .from('sirhelytemeto')
    .select('*')
    .eq('congregation_id', congId)
    .eq('deleted', false)
    .order('nev')
  return (data || []) as unknown as Cemetery[]
}

export async function saveCemetery(data: CemeteryInput) {
  const parsed = cemeterySchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const d = parsed.data
  const record = {
    nev: d.nev,
    cim: d.cim || null,
    megjegyzes: d.megjegyzes || null,
    aktiv: d.aktiv ?? true,
    deleted: false,
    congregation_id: congId,
  }
  if (d.id) {
    const { error } = await supabase
      .from('sirhelytemeto')
      .update(record)
      .eq('id', d.id)
      .eq('congregation_id', congId)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('sirhelytemeto').insert([record])
    if (error) return { error: error.message }
  }
  revalidatePath('/sirhelyek')
  return { success: true }
}

// 2026-08-11 (P1 #22): mind a 4 törlő-akció DESTRUKTURÁLÁS NÉLKÜL hívta az
// update-et, tehát a Supabase hibáját (RLS-megtagadás, hálózati hiba, séma-drift)
// eldobta, és feltétel nélkül `{ success: true }`-t adott vissza. A lelkész zöld
// „… törölve." visszajelzést kapott, a sor viszont ott maradt a listán — a néma
// siker a legrosszabb fajta hiba. A mentő-akciók (saveCemetery/savePlot/…) ezt
// mindig is helyesen ellenőrizték; a törlők most ugyanazt a mintát követik.
export async function deleteCemetery(id: number) {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  // A `.select('id')` azért kell, mert a PostgREST a 0 sort érintő UPDATE-re is
  // hibátlan választ ad (pl. RLS-megtagadás vagy már törölt sor) — enélkül a
  // „semmi sem történt" eset megint sikernek látszana.
  const { data, error } = await supabase
    .from('sirhelytemeto')
    .update({ deleted: true })
    .eq('id', id)
    .eq('congregation_id', congId)
    .select('id')
  if (error) {
    return { error: `A temető törlése nem sikerült: ${error.message}. Frissítsd az oldalt és próbáld újra — ha újra elmarad, jelezd a rendszergazdának.` }
  }
  if (!data || data.length === 0) {
    return { error: 'A temetőt nem sikerült törölni — lehet, hogy közben más már törölte, vagy nincs hozzá jogosultságod. Frissítsd az oldalt.' }
  }
  revalidatePath('/sirhelyek')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// Sírhelyek (sirhely) + bérletek + elhunytak
// A sirhely / sirhelyberles / sirhelyelhunyt tábláknak NINCS
// congregation_id mezőjük — a temető-FK-n keresztül szűrünk.
// ─────────────────────────────────────────────────────────────────

export async function getPlots(): Promise<{
  plots: Plot[]
  rentals: Record<number, Rental[]>
  deceased: Record<number, Deceased[]>
}> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { plots: [], rentals: {}, deceased: {} }

  // 1) A gyülekezet temetőinek ID-jai
  const { data: cems } = await supabase
    .from('sirhelytemeto')
    .select('id')
    .eq('congregation_id', congId)
    .eq('deleted', false)
  const temetoIds = (cems || []).map((c: { id: number }) => c.id)
  if (temetoIds.length === 0) return { plots: [], rentals: {}, deceased: {} }

  // 2) Sírhelyek + bérletek + elhunytak (a temető-FK-n keresztül szűrve)
  const { data: plotsData } = await supabase
    .from('sirhely')
    .select('*')
    .in('temetoid', temetoIds)
    .eq('deleted', false)
    .order('id', { ascending: false })
  const plotIds = (plotsData || []).map((p: { id: number }) => p.id)

  if (plotIds.length === 0) {
    return {
      plots: (plotsData || []) as unknown as Plot[],
      rentals: {},
      deceased: {},
    }
  }

  const [rentalsRes, deceasedRes] = await Promise.all([
    supabase
      .from('sirhelyberles')
      .select('*')
      .in('sirhelyid', plotIds)
      .eq('deleted', false),
    supabase
      .from('sirhelyelhunyt')
      .select('*')
      .in('sirhelyid', plotIds)
      .eq('deleted', false),
  ])

  const rentalsMap: Record<number, Rental[]> = {}
  for (const rental of (rentalsRes.data || []) as Rental[]) {
    if (!rentalsMap[rental.sirhelyid]) rentalsMap[rental.sirhelyid] = []
    rentalsMap[rental.sirhelyid].push(rental)
  }
  const deceasedMap: Record<number, Deceased[]> = {}
  for (const d of (deceasedRes.data || []) as Deceased[]) {
    if (!deceasedMap[d.sirhelyid]) deceasedMap[d.sirhelyid] = []
    deceasedMap[d.sirhelyid].push(d)
  }

  return {
    plots: (plotsData || []) as unknown as Plot[],
    rentals: rentalsMap,
    deceased: deceasedMap,
  }
}

export async function savePlot(data: PlotInput) {
  const parsed = plotSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const d = parsed.data

  // Biztonsági ellenőrzés: a temető a saját gyülekezetünkhöz tartozik
  const { data: temeto } = await supabase
    .from('sirhelytemeto')
    .select('id')
    .eq('id', d.temetoid)
    .eq('congregation_id', congId)
    .single()
  if (!temeto) return { error: 'A megadott temető nem található vagy nem hozzáférhető.' }

  const record = {
    temetoid: d.temetoid,
    parcella: d.parcella,
    sor: d.sor,
    szam: d.szam,
    allapot: d.allapot,
    elhelyezkedes: d.elhelyezkedes || null,
    meret: d.meret || null,
    tipus: d.tipus || null,
    megjegyzes: d.megjegyzes || null,
    gps_lat: d.gps_lat ?? null,
    gps_lng: d.gps_lng ?? null,
    deleted: false,
  }
  if (d.id) {
    const { error } = await supabase.from('sirhely').update(record).eq('id', d.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('sirhely').insert([record])
    if (error) return { error: error.message }
  }
  revalidatePath('/sirhelyek')
  return { success: true }
}

// 2026-08-11 (P1 #22): lásd a deleteCemetery feletti megjegyzést — eddig a hiba
// eldobódott, és a kliens zöld „Sírhely törölve." toastot mutatott akkor is, ha
// a sor a helyén maradt.
export async function deletePlot(id: number) {
  const { supabase } = await getCongId()
  const { data, error } = await supabase
    .from('sirhely')
    .update({ deleted: true })
    .eq('id', id)
    .select('id')
  if (error) {
    return { error: `A sírhely törlése nem sikerült: ${error.message}. Frissítsd az oldalt és próbáld újra.` }
  }
  if (!data || data.length === 0) {
    return { error: 'A sírhelyet nem sikerült törölni — lehet, hogy közben más már törölte, vagy nincs hozzá jogosultságod. Frissítsd az oldalt.' }
  }
  revalidatePath('/sirhelyek')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// Bérletek (sirhelyberles)
// ─────────────────────────────────────────────────────────────────

export async function saveRental(data: RentalInput) {
  const parsed = rentalSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase } = await getCongId()
  const d = parsed.data
  const record = {
    sirhelyid: d.sirhelyid,
    befizetesid: d.befizetesid ?? null,
    berlo: d.berlo,
    berloid: d.berloid ?? null,
    berlocim: d.berlocim || null,
    berloelerhetoseg: d.berloelerhetoseg || null,
    megvaltas: d.megvaltas,
    lejarata: d.lejarata || null,
    tipus: d.tipus,
    osszeg: d.osszeg ?? null,
    megjegyzes: d.megjegyzes || null,
    deleted: false,
  }
  if (d.id) {
    const { error } = await supabase.from('sirhelyberles').update(record).eq('id', d.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('sirhelyberles').insert([record])
    if (error) return { error: error.message }
  }
  revalidatePath('/sirhelyek')
  return { success: true }
}

// 2026-08-11 (P1 #22): lásd a deleteCemetery feletti megjegyzést.
export async function deleteRental(id: number) {
  const { supabase } = await getCongId()
  // Soft delete (a 2026-04-15-recycle-bin-cleanup.sql cron rendezi 30 nap után)
  const { data, error } = await supabase
    .from('sirhelyberles')
    .update({ deleted: true })
    .eq('id', id)
    .select('id')
  if (error) {
    return { error: `A bérlet törlése nem sikerült: ${error.message}. Frissítsd az oldalt és próbáld újra.` }
  }
  if (!data || data.length === 0) {
    return { error: 'A bérletet nem sikerült törölni — lehet, hogy közben más már törölte, vagy nincs hozzá jogosultságod. Frissítsd az oldalt.' }
  }
  revalidatePath('/sirhelyek')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// Elhunytak (sirhelyelhunyt)
// ─────────────────────────────────────────────────────────────────

export async function saveDeceased(data: DeceasedInput) {
  const parsed = deceasedSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase } = await getCongId()
  const d = parsed.data
  const record = {
    sirhelyid: d.sirhelyid,
    temetesid: d.temetesid ?? null,
    nev: d.nev,
    sznev: d.sznev || null,
    ferfi: d.ferfi ?? null,
    sz_datum: d.sz_datum || null,
    sz_hely: d.sz_hely || null,
    anyjaneve: d.anyjaneve || null,
    hdatum: d.hdatum || null,
    hhely: d.hhely || null,
    tdatum: d.tdatum || null,
    ttipus: d.ttipus || null,
    tmodja: d.tmodja || null,
    elhelyezkedes: d.elhelyezkedes || null,
    temetteto: d.temetteto || null,
    szolgaltato: d.szolgaltato || null,
    megjegyzes: d.megjegyzes || null,
    deleted: false,
  }
  if (d.id) {
    const { error } = await supabase.from('sirhelyelhunyt').update(record).eq('id', d.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('sirhelyelhunyt').insert([record])
    if (error) return { error: error.message }
  }
  revalidatePath('/sirhelyek')
  return { success: true }
}

// 2026-08-11 (P1 #22): lásd a deleteCemetery feletti megjegyzést.
export async function deleteDeceased(id: number) {
  const { supabase } = await getCongId()
  const { data, error } = await supabase
    .from('sirhelyelhunyt')
    .update({ deleted: true })
    .eq('id', id)
    .select('id')
  if (error) {
    return { error: `Az elhunyt-bejegyzés törlése nem sikerült: ${error.message}. Frissítsd az oldalt és próbáld újra.` }
  }
  if (!data || data.length === 0) {
    return { error: 'Az elhunyt-bejegyzést nem sikerült törölni — lehet, hogy közben más már törölte, vagy nincs hozzá jogosultságod. Frissítsd az oldalt.' }
  }
  revalidatePath('/sirhelyek')
  return { success: true }
}
