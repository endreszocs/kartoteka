'use server'

/**
 * Anyagraktár szerver akciók.
 *
 * 2 tábla:
 *   - materials: anyagtípusok (1 sor = 1 anyag)
 *   - material_movements: bevétel/kiadás mozgások
 *
 * A hivatalos Anyagraktárkönyv mintáját követi: minden anyagra folyamatos
 * mennyiség- és érték-egyenleget számolunk.
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface MaterialRow {
  id: string
  nev: string
  megnevezes: string | null
  mertekegyseg: string
  egysegar: number | null
  kategoria: string | null
  aktiv: boolean
  megjegyzes: string | null
  created_at: string
}

export interface MaterialWithStock extends MaterialRow {
  /** Jelenlegi készlet mennyisége (bevétel - kiadás, stornózott nélkül). */
  keszlet_mennyiseg: number
  /** Jelenlegi készlet értéke RON-ban. */
  keszlet_ertek: number
  /** Legutolsó mozgás dátuma. */
  utolso_mozgas: string | null
  /** Mozgások száma (nem stornózott). */
  mozgas_db: number
}

export interface MaterialMovementRow {
  id: number
  material_id: string
  datum: string
  tipus: 'bevetel' | 'kiadas'
  mennyiseg: number
  ertek: number
  irat_szama: string | null
  magyarazat: string | null
  kapcsolt_kiadas_id: number | null
  kapcsolt_befizetes_id: number | null
  stornozott: boolean
  stornozott_at: string | null
  stornozott_indok: string | null
  created_at: string
}

export interface MaterialMovementWithBalance extends MaterialMovementRow {
  /** Egyenleg a mozgás UTÁN (sorszám szerinti folyamatos). */
  egyenleg_mennyiseg: number
  egyenleg_ertek: number
  sorszam: number
}

// ─────────────────────────────────────────────────────────────────
// Listázás
// ─────────────────────────────────────────────────────────────────

export async function listMaterials(filter?: {
  aktivCsak?: boolean
  kategoria?: string | null
}): Promise<{ data?: MaterialWithStock[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  let q = access.supabase
    .from('materials')
    .select('*')
    .eq('congregation_id', access.effectiveCongregationId)
    .order('nev', { ascending: true })

  if (filter?.aktivCsak) q = q.eq('aktiv', true)
  if (filter?.kategoria) q = q.eq('kategoria', filter.kategoria)

  const { data: materialsData, error: materialsErr } = await q
  if (materialsErr) return { error: materialsErr.message }
  const materials = (materialsData || []) as MaterialRow[]

  if (materials.length === 0) return { data: [] }

  // Minden anyaghoz lekérdezzük az aggregált mozgás-adatokat
  const { data: movementsData } = await access.supabase
    .from('material_movements')
    .select('material_id, datum, tipus, mennyiseg, ertek, stornozott')
    .eq('congregation_id', access.effectiveCongregationId)
    .in('material_id', materials.map((m) => m.id))
    .eq('stornozott', false)

  const byMaterial = new Map<string, { keszletQ: number; keszletV: number; ultMozgas: string | null; count: number }>()
  for (const mv of movementsData || []) {
    const key = mv.material_id as string
    if (!byMaterial.has(key)) {
      byMaterial.set(key, { keszletQ: 0, keszletV: 0, ultMozgas: null, count: 0 })
    }
    const bucket = byMaterial.get(key)!
    const qty = Number(mv.mennyiseg) || 0
    const val = Number(mv.ertek) || 0
    if (mv.tipus === 'bevetel') {
      bucket.keszletQ += qty
      bucket.keszletV += val
    } else {
      bucket.keszletQ -= qty
      bucket.keszletV -= val
    }
    bucket.count += 1
    const dt = mv.datum as string | null
    if (dt && (!bucket.ultMozgas || dt > bucket.ultMozgas)) {
      bucket.ultMozgas = dt
    }
  }

  const result: MaterialWithStock[] = materials.map((m) => {
    const b = byMaterial.get(m.id)
    return {
      ...m,
      keszlet_mennyiseg: b?.keszletQ ?? 0,
      keszlet_ertek: b?.keszletV ?? 0,
      utolso_mozgas: b?.ultMozgas ?? null,
      mozgas_db: b?.count ?? 0,
    }
  })

  return { data: result }
}

// ─────────────────────────────────────────────────────────────────
// Anyagkönyv (1 anyag mozgásai folyamatos egyenleggel)
// ─────────────────────────────────────────────────────────────────

export async function getMaterialBook(
  materialId: string,
  opts?: { yearFilter?: number | null },
): Promise<{
  material?: MaterialRow
  movements?: MaterialMovementWithBalance[]
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const [materialRes, movementsRes] = await Promise.all([
    access.supabase
      .from('materials')
      .select('*')
      .eq('id', materialId)
      .eq('congregation_id', access.effectiveCongregationId)
      .maybeSingle(),
    access.supabase
      .from('material_movements')
      .select('*')
      .eq('material_id', materialId)
      .eq('congregation_id', access.effectiveCongregationId)
      .order('datum', { ascending: true })
      .order('id', { ascending: true }),
  ])

  if (materialRes.error) return { error: materialRes.error.message }
  if (!materialRes.data) return { error: 'Az anyag nem található.' }
  if (movementsRes.error) return { error: movementsRes.error.message }

  const material = materialRes.data as MaterialRow
  const allMovements = (movementsRes.data || []) as MaterialMovementRow[]

  // Folyamatos egyenleg számítás (az ÖSSZES mozgás alapján, de a szűrt
  // listát adjuk vissza — így az év-szűrésnél is helyesen látszik az egyenleg)
  let cumQ = 0
  let cumV = 0
  let sorszam = 0
  const withBalance: MaterialMovementWithBalance[] = allMovements.map((mv) => {
    sorszam += 1
    if (!mv.stornozott) {
      const qty = Number(mv.mennyiseg) || 0
      const val = Number(mv.ertek) || 0
      if (mv.tipus === 'bevetel') { cumQ += qty; cumV += val }
      else { cumQ -= qty; cumV -= val }
    }
    return { ...mv, egyenleg_mennyiseg: cumQ, egyenleg_ertek: cumV, sorszam }
  })

  // Év-szűrés opció
  let filtered = withBalance
  if (opts?.yearFilter) {
    const y = opts.yearFilter
    filtered = withBalance.filter((mv) => {
      const year = new Date(mv.datum).getFullYear()
      return year === y
    })
  }

  return { material, movements: filtered }
}

// ─────────────────────────────────────────────────────────────────
// Anyag létrehozása / szerkesztése
// ─────────────────────────────────────────────────────────────────

export interface MaterialInput {
  nev: string
  megnevezes?: string | null
  mertekegyseg?: string
  egysegar?: number | null
  kategoria?: string | null
  megjegyzes?: string | null
}

export async function createMaterial(input: MaterialInput): Promise<{
  success?: boolean
  id?: string
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const nev = (input.nev || '').trim()
  if (!nev) return { error: 'Az anyag megnevezése kötelező.' }
  const mertekegyseg = (input.mertekegyseg || 'db').trim() || 'db'

  const { data, error } = await access.supabase
    .from('materials')
    .insert({
      congregation_id: access.effectiveCongregationId,
      nev,
      megnevezes: input.megnevezes?.trim() || null,
      mertekegyseg,
      egysegar: input.egysegar ?? null,
      kategoria: input.kategoria?.trim() || null,
      megjegyzes: input.megjegyzes?.trim() || null,
      created_by: access.user.id,
      updated_by: access.user.id,
    })
    .select('id')
    .single()

  if (error) return { error: `Mentés hiba: ${error.message}` }

  revalidatePath('/leltar')
  return { success: true, id: data?.id }
}

export async function updateMaterial(
  id: string,
  input: MaterialInput,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const nev = (input.nev || '').trim()
  if (!nev) return { error: 'Az anyag megnevezése kötelező.' }

  const { error } = await access.supabase
    .from('materials')
    .update({
      nev,
      megnevezes: input.megnevezes?.trim() || null,
      mertekegyseg: (input.mertekegyseg || 'db').trim() || 'db',
      egysegar: input.egysegar ?? null,
      kategoria: input.kategoria?.trim() || null,
      megjegyzes: input.megjegyzes?.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: access.user.id,
    })
    .eq('id', id)
    .eq('congregation_id', access.effectiveCongregationId)

  if (error) return { error: `Mentés hiba: ${error.message}` }
  revalidatePath('/leltar')
  return { success: true }
}

export async function setMaterialActive(
  id: string,
  aktiv: boolean,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { error } = await access.supabase
    .from('materials')
    .update({ aktiv, updated_at: new Date().toISOString(), updated_by: access.user.id })
    .eq('id', id)
    .eq('congregation_id', access.effectiveCongregationId)

  if (error) return { error: `Mentés hiba: ${error.message}` }
  revalidatePath('/leltar')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// Mozgás létrehozása / szerkesztése / stornózása
// ─────────────────────────────────────────────────────────────────

export interface MovementInput {
  material_id: string
  datum: string
  tipus: 'bevetel' | 'kiadas'
  mennyiseg: number
  ertek?: number | null
  irat_szama?: string | null
  magyarazat?: string | null
  kapcsolt_kiadas_id?: number | null
  kapcsolt_befizetes_id?: number | null
}

export async function createMaterialMovement(
  input: MovementInput,
): Promise<{ success?: boolean; id?: number; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  if (!Number.isFinite(input.mennyiseg) || input.mennyiseg <= 0) {
    return { error: 'A mennyiség pozitív szám legyen.' }
  }
  if (!input.datum) return { error: 'Add meg a dátumot.' }

  // Ha az érték nincs megadva, az egységár * mennyiség default-ot használjuk
  let ertek = input.ertek ?? null
  if (ertek == null || !Number.isFinite(ertek)) {
    const { data: mat } = await access.supabase
      .from('materials')
      .select('egysegar')
      .eq('id', input.material_id)
      .eq('congregation_id', access.effectiveCongregationId)
      .maybeSingle()
    const eg = Number(mat?.egysegar) || 0
    ertek = eg * input.mennyiseg
  }

  // Kiadás esetén: ne menjen negatívba a készlet (figyelmeztetés)
  if (input.tipus === 'kiadas') {
    const { data: movs } = await access.supabase
      .from('material_movements')
      .select('tipus, mennyiseg')
      .eq('material_id', input.material_id)
      .eq('congregation_id', access.effectiveCongregationId)
      .eq('stornozott', false)
    const keszlet = (movs || []).reduce((s, m) => {
      const q = Number(m.mennyiseg) || 0
      return s + (m.tipus === 'bevetel' ? q : -q)
    }, 0)
    if (keszlet - input.mennyiseg < 0) {
      return {
        error: `A készlet nem elegendő. Jelenleg: ${keszlet}, kivenni kívánt: ${input.mennyiseg}.`,
      }
    }
  }

  const { data, error } = await access.supabase
    .from('material_movements')
    .insert({
      material_id: input.material_id,
      congregation_id: access.effectiveCongregationId,
      datum: input.datum,
      tipus: input.tipus,
      mennyiseg: input.mennyiseg,
      ertek,
      irat_szama: input.irat_szama?.trim() || null,
      magyarazat: input.magyarazat?.trim() || null,
      kapcsolt_kiadas_id: input.kapcsolt_kiadas_id ?? null,
      kapcsolt_befizetes_id: input.kapcsolt_befizetes_id ?? null,
      created_by: access.user.id,
      updated_by: access.user.id,
    })
    .select('id')
    .single()

  if (error) return { error: `Mentés hiba: ${error.message}` }
  revalidatePath('/leltar')
  return { success: true, id: data?.id }
}

export async function stornoMaterialMovement(
  id: number,
  indok: string,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const trimmed = (indok || '').trim()
  if (trimmed.length < 5) return { error: 'Az indoklás legalább 5 karakter legyen.' }

  const { error } = await access.supabase
    .from('material_movements')
    .update({
      stornozott: true,
      stornozott_at: new Date().toISOString(),
      stornozott_indok: trimmed,
      stornozott_by: access.user.id,
      updated_at: new Date().toISOString(),
      updated_by: access.user.id,
    })
    .eq('id', id)
    .eq('congregation_id', access.effectiveCongregationId)

  if (error) return { error: `Stornózás hiba: ${error.message}` }
  revalidatePath('/leltar')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// Statisztika a Vagyonleltári jelentéshez
// ─────────────────────────────────────────────────────────────────

export interface AnyagraktarStats {
  anyagok_szama: number
  aktiv_anyagok: number
  osszes_keszlet_ertek: number
  mozgasok_szama: number
}

export async function getAnyagraktarStats(): Promise<{
  data?: AnyagraktarStats
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const [matRes, movRes] = await Promise.all([
    access.supabase
      .from('materials')
      .select('id, aktiv')
      .eq('congregation_id', access.effectiveCongregationId),
    access.supabase
      .from('material_movements')
      .select('tipus, ertek')
      .eq('congregation_id', access.effectiveCongregationId)
      .eq('stornozott', false),
  ])

  if (matRes.error) return { error: matRes.error.message }
  if (movRes.error) return { error: movRes.error.message }

  const mats = matRes.data || []
  const movs = movRes.data || []

  const ertek = movs.reduce((s, m) => {
    const v = Number(m.ertek) || 0
    return s + (m.tipus === 'bevetel' ? v : -v)
  }, 0)

  return {
    data: {
      anyagok_szama: mats.length,
      aktiv_anyagok: mats.filter((m) => m.aktiv).length,
      osszes_keszlet_ertek: ertek,
      mozgasok_szama: movs.length,
    },
  }
}
