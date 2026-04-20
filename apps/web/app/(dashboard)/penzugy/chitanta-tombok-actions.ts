'use server'

/**
 * Nyugtatömb (chitanta_tombok) szerver akciók.
 *
 * - Listázás: az aktuális gyülekezet tömbjei
 * - Új tömb rögzítése (wizard)
 * - Aktív tömb státusz (maradék darabszám — élő követéshez)
 * - Éves kimutatás (a word mintához hasonló formátumban)
 * - Tömb lezárása (ha kézzel akarja befejezni)
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export interface ChitantaTomb {
  id: string
  congregation_id: string
  block_nr: string | null
  seria: string
  szam_kezdet: number
  szam_veg: number
  darabszam_ossz: number
  felhasznalt_darabszam: number
  vasarlas_datuma: string
  vasarlas_ara: number | null
  elso_hasznalat_datum: string | null
  utolso_hasznalat_datum: string | null
  aktiv: boolean
  megjegyzes: string | null
  created_at: string
}

// ─────────────────────────────────────────────────────────────
// Listázás + státusz
// ─────────────────────────────────────────────────────────────

export async function listChitantaTombok(): Promise<{
  data?: ChitantaTomb[]
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data, error } = await access.supabase
    .from('chitanta_tombok')
    .select('*')
    .eq('congregation_id', access.effectiveCongregationId)
    .order('szam_kezdet', { ascending: true })

  if (error) return { error: error.message }
  return { data: (data || []) as ChitantaTomb[] }
}

export async function getActiveChitantaTombStatus(): Promise<{
  active?: {
    id: string
    seria: string
    szam_kezdet: number
    szam_veg: number
    felhasznalt_darabszam: number
    darabszam_ossz: number
    maradek: number
    kovetkezo_szam: number
  } | null
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data, error } = await access.supabase
    .from('chitanta_tombok')
    .select('id, seria, szam_kezdet, szam_veg, felhasznalt_darabszam, darabszam_ossz')
    .eq('congregation_id', access.effectiveCongregationId)
    .eq('aktiv', true)
    .order('szam_kezdet', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { active: null }

  const maradek = (data.darabszam_ossz as number) - (data.felhasznalt_darabszam as number)
  return {
    active: {
      id: data.id as string,
      seria: data.seria as string,
      szam_kezdet: data.szam_kezdet as number,
      szam_veg: data.szam_veg as number,
      felhasznalt_darabszam: data.felhasznalt_darabszam as number,
      darabszam_ossz: data.darabszam_ossz as number,
      maradek,
      kovetkezo_szam: (data.szam_kezdet as number) + (data.felhasznalt_darabszam as number),
    },
  }
}

// ─────────────────────────────────────────────────────────────
// Új tömb rögzítése (wizard utolsó lépése)
// ─────────────────────────────────────────────────────────────

export interface CreateChitantaTombInput {
  block_nr?: string | null
  seria: string
  szam_kezdet: number
  szam_veg: number
  vasarlas_datuma: string
  vasarlas_ara?: number | null
  megjegyzes?: string | null
}

export async function createChitantaTomb(
  input: CreateChitantaTombInput,
): Promise<{ success?: boolean; error?: string; id?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  // Validációk
  if (!input.seria?.trim()) return { error: 'A Seria (pl. EREKC24) kötelező.' }
  if (!Number.isFinite(input.szam_kezdet) || !Number.isFinite(input.szam_veg)) {
    return { error: 'Adj meg érvényes kezdő és záró nyomdai számokat.' }
  }
  if (input.szam_veg < input.szam_kezdet) {
    return { error: 'A záró szám nem lehet kisebb, mint a kezdő szám.' }
  }
  const darabszam = input.szam_veg - input.szam_kezdet + 1
  if (darabszam > 100) {
    return { error: 'Egy tömbben max. 100 nyugta lehet — ellenőrizd a számokat.' }
  }

  // Átfedés-ellenőrzés: a congregation jelenlegi tömbjei közül nincs átfedés?
  const { data: existing } = await access.supabase
    .from('chitanta_tombok')
    .select('id, seria, szam_kezdet, szam_veg')
    .eq('congregation_id', access.effectiveCongregationId)

  for (const t of existing || []) {
    if (t.seria !== input.seria.trim()) continue
    const kezd = t.szam_kezdet as number
    const veg = t.szam_veg as number
    // Van átfedés?
    if (input.szam_kezdet <= veg && input.szam_veg >= kezd) {
      return {
        error: `Átfedés a meglévő ${t.seria} ${kezd}-${veg} tömbbel. Ellenőrizd a számokat.`,
      }
    }
  }

  const { data: inserted, error } = await access.supabase
    .from('chitanta_tombok')
    .insert({
      congregation_id: access.effectiveCongregationId,
      block_nr: input.block_nr?.trim() || null,
      seria: input.seria.trim(),
      szam_kezdet: input.szam_kezdet,
      szam_veg: input.szam_veg,
      darabszam_ossz: darabszam,
      felhasznalt_darabszam: 0,
      vasarlas_datuma: input.vasarlas_datuma,
      vasarlas_ara: input.vasarlas_ara ?? null,
      megjegyzes: input.megjegyzes?.trim() || null,
      aktiv: true,
      created_by: access.user.id,
    })
    .select('id')
    .single()

  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/penzugy')
  return { success: true, id: inserted?.id }
}

// ─────────────────────────────────────────────────────────────
// Több tömb rögzítése egyszerre (kerületi átvételnél tipikus: 3-5 tömb
// egyszerre, közös vásárlási dátummal és összesített árral).
// ─────────────────────────────────────────────────────────────

export interface CreateChitantaTombokBatchInput {
  /** Közös seria minden tömbre (pl. "EREKC24"). */
  seria: string
  /** Közös vásárlás dátuma. */
  vasarlas_datuma: string
  /** ÖSSZES tömb ára együttvéve RON-ban. A rendszer egyenlően elosztja. */
  vasarlas_ara_ossz?: number | null
  /** Közös megjegyzés (minden tömbre). */
  megjegyzes?: string | null
  /** A tömbök tartományai. */
  tombok: Array<{
    block_nr?: string | null
    szam_kezdet: number
    szam_veg: number
  }>
}

export async function createChitantaTombokBatch(
  input: CreateChitantaTombokBatchInput,
): Promise<{
  success?: boolean
  created?: number
  ids?: string[]
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const seria = (input.seria || '').trim()
  if (!seria) return { error: 'A Seria (pl. EREKC24) kötelező.' }
  if (!input.vasarlas_datuma) return { error: 'Add meg a vásárlás dátumát.' }
  if (!Array.isArray(input.tombok) || input.tombok.length === 0) {
    return { error: 'Legalább egy tömböt meg kell adnod.' }
  }

  // 1) Minden tömb önmagában érvényes?
  const darabszamok: number[] = []
  for (let i = 0; i < input.tombok.length; i++) {
    const t = input.tombok[i]
    if (!Number.isFinite(t.szam_kezdet) || !Number.isFinite(t.szam_veg)) {
      return { error: `${i + 1}. tömb: adj meg érvényes kezdő és záró számokat.` }
    }
    if (t.szam_veg < t.szam_kezdet) {
      return { error: `${i + 1}. tömb: a záró szám nem lehet kisebb a kezdőnél.` }
    }
    const darabszam = t.szam_veg - t.szam_kezdet + 1
    if (darabszam > 100) {
      return { error: `${i + 1}. tömb: egy tömbben max. 100 nyugta lehet (${darabszam} db).` }
    }
    darabszamok.push(darabszam)
  }

  // 2) Átfedés a batch-en belül?
  for (let i = 0; i < input.tombok.length; i++) {
    for (let j = i + 1; j < input.tombok.length; j++) {
      const a = input.tombok[i]
      const b = input.tombok[j]
      if (a.szam_kezdet <= b.szam_veg && a.szam_veg >= b.szam_kezdet) {
        return {
          error: `A ${i + 1}. és ${j + 1}. tömb tartományai átfedésben vannak. Ellenőrizd a számokat.`,
        }
      }
    }
  }

  // 3) Átfedés a meglévő tömbökkel?
  const { data: existing } = await access.supabase
    .from('chitanta_tombok')
    .select('id, seria, szam_kezdet, szam_veg')
    .eq('congregation_id', access.effectiveCongregationId)
    .eq('seria', seria)

  for (const e of existing || []) {
    const kezd = e.szam_kezdet as number
    const veg = e.szam_veg as number
    for (let i = 0; i < input.tombok.length; i++) {
      const t = input.tombok[i]
      if (t.szam_kezdet <= veg && t.szam_veg >= kezd) {
        return {
          error: `${i + 1}. tömb átfedésben van a meglévő ${seria} ${kezd}-${veg} tömbbel.`,
        }
      }
    }
  }

  // 4) Ár-elosztás: ha van közös összeg, egyenletesen osszuk
  const osszAr = typeof input.vasarlas_ara_ossz === 'number' ? input.vasarlas_ara_ossz : null
  const tombOnkentiAr = osszAr != null
    ? Number((osszAr / input.tombok.length).toFixed(2))
    : null

  // 5) Batch insert (a null-ellenőrzés a függvény elején megtörtént, de a TS
  //    a closure-ban nem őrzi meg — lokális változókba mentjük a narrowed értékeket)
  const userId = access.user.id
  const congregationId = access.effectiveCongregationId
  const rows = input.tombok.map((t, i) => ({
    congregation_id: congregationId,
    block_nr: t.block_nr?.trim() || null,
    seria,
    szam_kezdet: t.szam_kezdet,
    szam_veg: t.szam_veg,
    darabszam_ossz: darabszamok[i],
    felhasznalt_darabszam: 0,
    vasarlas_datuma: input.vasarlas_datuma,
    vasarlas_ara: tombOnkentiAr,
    megjegyzes: input.megjegyzes?.trim() || null,
    aktiv: true,
    created_by: userId,
  }))

  const { data: inserted, error } = await access.supabase
    .from('chitanta_tombok')
    .insert(rows)
    .select('id')

  if (error) return { error: `Hiba a tömbök mentésekor: ${error.message}` }

  revalidatePath('/penzugy')
  revalidatePath('/leltar')
  return {
    success: true,
    created: inserted?.length || 0,
    ids: (inserted || []).map((r) => r.id as string),
  }
}

// ─────────────────────────────────────────────────────────────
// Tömb lezárása (ha a lelkész kézzel akarja befejezni)
// ─────────────────────────────────────────────────────────────

export async function closeChitantaTomb(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { error } = await access.supabase
    .from('chitanta_tombok')
    .update({ aktiv: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('congregation_id', access.effectiveCongregationId)

  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/penzugy')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// Éves kimutatás — Endre Word-mintája szerint
// ─────────────────────────────────────────────────────────────

export interface ChitantaTombReport {
  id: string
  sorszam: number
  block_nr: string | null
  seria: string
  nyomdai_kezdet: number
  nyomdai_veg: number
  datum_kezdet: string | null
  datum_veg: string | null
  sajat_kezdet: number | null
  sajat_veg: number | null
  felhasznalt_darabszam: number
  darabszam_ossz: number
  aktiv: boolean
}

export async function getChitantaTombokReport(year: number): Promise<{
  data?: ChitantaTombReport[]
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  // Az év során bármennyit használt tömbök (felhasznalt > 0 és az első/utolsó
  // használat az adott évben van)
  const { data: tombok, error } = await access.supabase
    .from('chitanta_tombok')
    .select('*')
    .eq('congregation_id', access.effectiveCongregationId)
    .order('szam_kezdet', { ascending: true })

  if (error) return { error: error.message }

  // A gyülekezeti számok lekérdezése minden tömbre
  const { data: chitantak } = await access.supabase
    .from('oblio_szamlak')
    .select('tomb_id, gyulekezeti_szam')
    .eq('congregation_id', access.effectiveCongregationId)
    .eq('tipus', 'chitanta_papir')
    .eq('stornozott', false)
    .not('gyulekezeti_szam', 'is', null)

  const gyulSzamByTomb = new Map<string, { min: number; max: number }>()
  for (const c of chitantak || []) {
    if (!c.tomb_id || c.gyulekezeti_szam == null) continue
    const existing = gyulSzamByTomb.get(c.tomb_id as string)
    if (!existing) {
      gyulSzamByTomb.set(c.tomb_id as string, { min: c.gyulekezeti_szam as number, max: c.gyulekezeti_szam as number })
    } else {
      existing.min = Math.min(existing.min, c.gyulekezeti_szam as number)
      existing.max = Math.max(existing.max, c.gyulekezeti_szam as number)
    }
  }

  // Szűrjük azokat a tömböket, amelyek az adott évben voltak használatban
  const filtered = (tombok || []).filter((t) => {
    const elso = t.elso_hasznalat_datum as string | null
    const utolso = t.utolso_hasznalat_datum as string | null
    if (!elso && !utolso) return false
    const elsoYear = elso ? new Date(elso).getFullYear() : null
    const utolsoYear = utolso ? new Date(utolso).getFullYear() : null
    return elsoYear === year || utolsoYear === year
  })

  const report: ChitantaTombReport[] = filtered.map((t, idx) => {
    const gyul = gyulSzamByTomb.get(t.id as string)
    return {
      id: t.id as string,
      sorszam: idx + 1,
      block_nr: (t.block_nr as string | null) || null,
      seria: t.seria as string,
      nyomdai_kezdet: t.szam_kezdet as number,
      nyomdai_veg: t.szam_veg as number,
      datum_kezdet: (t.elso_hasznalat_datum as string | null) || null,
      datum_veg: (t.utolso_hasznalat_datum as string | null) || null,
      sajat_kezdet: gyul?.min ?? null,
      sajat_veg: gyul?.max ?? null,
      felhasznalt_darabszam: t.felhasznalt_darabszam as number,
      darabszam_ossz: t.darabszam_ossz as number,
      aktiv: t.aktiv as boolean,
    }
  })

  return { data: report }
}
