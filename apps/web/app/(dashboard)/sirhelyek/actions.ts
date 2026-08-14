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

type SirhelySupabase = Awaited<ReturnType<typeof getCongId>>['supabase']

// 2026-08-15 (kereszt-gyülekezeti IDOR): a sirhely / sirhelyberles /
// sirhelyelhunyt tábláknak NINCS congregation_id oszlopuk, a tulajdonos
// KIZÁRÓLAG ezen a láncon oldható fel:
//     sirhelyelhunyt|sirhelyberles.sirhelyid → sirhely.id
//     sirhely.temetoid                       → sirhelytemeto.congregation_id
// Eddig a savePlot update-ága, a saveRental, a saveDeceased és mind a három
// törlő (deletePlot/deleteRental/deleteDeceased) CSAK a sor azonosítójára
// szűrt. Egy szerver-akció viszont ÉLŐ POST-végpont: bármely bejelentkezett
// felhasználó elküldhette egy MÁSIK gyülekezet sorának azonosítóját, és
// átírhatta vagy törölhette azt (elhunytak neve, anyja neve, bérlő címe…).
// A savePlot beszúró ága ezt a láncot már helyesen bejárta — innentől minden
// írás-út ugyanezt teszi, egyetlen közös helperen keresztül, fail-closed
// módon (bizonytalan állapotnál — hiányzó sor, NULL FK, RLS-megtagadás —
// tagadunk).
// Ez app-szintű védelem: az adatbázis-oldali őr (2026-08-10-nyitott-rls-
// policyk-takaritas.sql 5. szakasz) mellé jön, nem helyette — védelmi mélység.

/** A temető a hívó gyülekezetéé? (a lánc gyökere: itt van a congregation_id) */
async function temetoAMienk(
  supabase: SirhelySupabase,
  congId: string,
  temetoid: number | null | undefined,
): Promise<boolean> {
  if (typeof temetoid !== 'number') return false
  const { data } = await supabase
    .from('sirhelytemeto')
    .select('id')
    .eq('id', temetoid)
    .eq('congregation_id', congId)
    .maybeSingle()
  return !!data
}

/** A sírhely a hívó gyülekezetéé? (sirhely.temetoid → temető → gyülekezet) */
async function sirhelyAMienk(
  supabase: SirhelySupabase,
  congId: string,
  sirhelyid: number | null | undefined,
): Promise<boolean> {
  if (typeof sirhelyid !== 'number') return false
  const { data } = await supabase
    .from('sirhely')
    .select('temetoid')
    .eq('id', sirhelyid)
    .maybeSingle()
  const temetoid = (data as { temetoid: number | null } | null)?.temetoid
  return temetoAMienk(supabase, congId, temetoid)
}

/** Bérlet/elhunyt sor a hívó gyülekezetéé? (sor → sírhely → temető → gyülekezet) */
async function alsorAMienk(
  supabase: SirhelySupabase,
  congId: string,
  tabla: 'sirhelyberles' | 'sirhelyelhunyt',
  id: number | null | undefined,
): Promise<boolean> {
  if (typeof id !== 'number') return false
  const { data } = await supabase
    .from(tabla)
    .select('sirhelyid')
    .eq('id', id)
    .maybeSingle()
  const sirhelyid = (data as { sirhelyid: number | null } | null)?.sirhelyid
  return sirhelyAMienk(supabase, congId, sirhelyid)
}

// A lelkész számára érthető, cselekvésre irányító üzenetek (nincs zsargon).
const IDEGEN_SOR_MODOSITAS =
  'Ez a bejegyzés nem a te gyülekezeted temetőjéhez tartozik, ezért nem módosítható. Frissítsd az oldalt — ha a bejegyzés ezután is látszik, jelezd a rendszergazdának.'
const IDEGEN_SOR_TORLES =
  'Ez a bejegyzés nem a te gyülekezeted temetőjéhez tartozik, ezért nem törölhető. Frissítsd az oldalt — ha a bejegyzés ezután is látszik, jelezd a rendszergazdának.'
const ISMERETLEN_SIRHELY =
  'A megadott sírhely nem található, vagy nem a te gyülekezeted temetőjéhez tartozik. Frissítsd az oldalt, és válaszd ki újra a sírhelyet.'

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

  // Biztonsági ellenőrzés: a CÉL-temető a saját gyülekezetünkhöz tartozik
  if (!(await temetoAMienk(supabase, congId, d.temetoid))) {
    return { error: 'A megadott temető nem található vagy nem hozzáférhető.' }
  }

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
    // 2026-08-15: a FORRÁS-sor is a miénk kell legyen — a fenti ellenőrzés csak
    // a cél-temetőt igazolja, enélkül idegen sírhelyet lehetne „behúzni".
    if (!(await sirhelyAMienk(supabase, congId, d.id))) {
      return { error: IDEGEN_SOR_MODOSITAS }
    }
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
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!(await sirhelyAMienk(supabase, congId, id))) {
    return { error: IDEGEN_SOR_TORLES }
  }
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
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const d = parsed.data
  // A CÉL-sírhely a saját gyülekezetünk temetőjében van (beszúrásnál és
  // áthelyezésnél egyaránt) — a savePlot beszúró ágának mintája.
  if (!(await sirhelyAMienk(supabase, congId, d.sirhelyid))) {
    return { error: ISMERETLEN_SIRHELY }
  }
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
    // 2026-08-15: a FORRÁS-bérlet is a miénk kell legyen (lásd a fájl elején
    // a lánc-magyarázatot) — enélkül idegen bérlő adatai voltak átírhatók.
    if (!(await alsorAMienk(supabase, congId, 'sirhelyberles', d.id))) {
      return { error: IDEGEN_SOR_MODOSITAS }
    }
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
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!(await alsorAMienk(supabase, congId, 'sirhelyberles', id))) {
    return { error: IDEGEN_SOR_TORLES }
  }
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
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const d = parsed.data
  // A CÉL-sírhely a saját gyülekezetünk temetőjében van (beszúrásnál és
  // áthelyezésnél egyaránt) — a savePlot beszúró ágának mintája.
  if (!(await sirhelyAMienk(supabase, congId, d.sirhelyid))) {
    return { error: ISMERETLEN_SIRHELY }
  }
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
    // 2026-08-15: a FORRÁS-bejegyzés is a miénk kell legyen — enélkül idegen
    // elhunyt anyakönyvi adatai (név, anyja neve, dátumok) voltak átírhatók.
    if (!(await alsorAMienk(supabase, congId, 'sirhelyelhunyt', d.id))) {
      return { error: IDEGEN_SOR_MODOSITAS }
    }
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
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!(await alsorAMienk(supabase, congId, 'sirhelyelhunyt', id))) {
    return { error: IDEGEN_SOR_TORLES }
  }
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
