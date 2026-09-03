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
import {
  createChitantaTombUseCase,
  getActiveChitantaTombStatusUseCase,
  getChitantaTombUsageUseCase,
  listChitantaTombokUseCase,
} from '@kartoteka/core'
import { MAX_NYUGTA_TOMBBEN } from '@kartoteka/validations'

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
  /**
   * 2026-07-25 (G4): a berögzített kerületi nyugtaszámokból SZÁMÍTOTT
   * elhasználtság (DISTINCT nyomdai szám a tartományban, stornóval és
   * anuláltakkal együtt; vezető nullák nélkül egyeztetve). A kijelzéshez:
   * max(felhasznalt_darabszam, szamitott_felhasznalt) — egyik út se vesszen el.
   */
  szamitott_felhasznalt?: number
  /** Ebből 0 értékű (anulált) nyugta. */
  anulalt_darab?: number
}

// ─────────────────────────────────────────────────────────────
// Listázás + státusz
// ─────────────────────────────────────────────────────────────

export async function listChitantaTombok(): Promise<{
  data?: ChitantaTomb[]
  error?: string
}> {
  // A-M7.1a óta: a @kartoteka/core use-case hívja a Supabase-t és
  // zod-validálja a rekordokat. A web Server Action vékony adapter:
  // a scope-t (congregationId) átadja, és a return-értéket a meglévő
  // `ChitantaTomb` interface-hez igazítja (congregation_id non-null).
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const result = await listChitantaTombokUseCase(
    { congregationId: access.effectiveCongregationId },
    { supabase: access.supabase, runtime: 'web' },
  )
  if (!result.success) return { error: result.error }

  // A saját gyülekezet scope-jában a congregation_id mindig ki van töltve
  // (a core query-jét `.eq('congregation_id', …)`-szal szűri).
  const filtered = result.rows.filter(
    (r): r is typeof r & { congregation_id: string } => r.congregation_id !== null,
  )

  // 2026-07-25 (G4): valós elhasználtság a berögzített kerületi nyugtaszámokból.
  // Hiba esetén a lista attól még visszamegy (a kártya a DB-mezőre esik vissza) —
  // az RLS-divergencia (kerületi admin más gyülekezete) is így degradál kecsesen.
  const usageResult = await getChitantaTombUsageUseCase(
    {
      congregationId: access.effectiveCongregationId,
      tombok: filtered.map((r) => ({ id: r.id, szam_kezdet: r.szam_kezdet, szam_veg: r.szam_veg })),
    },
    { supabase: access.supabase, runtime: 'web' },
  )
  const usage = usageResult.success ? usageResult.usage : {}
  if (!usageResult.success) {
    console.error('[listChitantaTombok] használat-számítás hiba:', usageResult.error)
  }

  return {
    data: filtered.map((r) => ({
      id: r.id,
      congregation_id: r.congregation_id,
      block_nr: r.block_nr,
      seria: r.seria,
      szam_kezdet: r.szam_kezdet,
      szam_veg: r.szam_veg,
      darabszam_ossz: r.darabszam_ossz,
      felhasznalt_darabszam: r.felhasznalt_darabszam,
      vasarlas_datuma: r.vasarlas_datuma,
      vasarlas_ara: r.vasarlas_ara,
      elso_hasznalat_datum: r.elso_hasznalat_datum,
      utolso_hasznalat_datum: r.utolso_hasznalat_datum,
      aktiv: r.aktiv,
      megjegyzes: r.megjegyzes,
      created_at: r.created_at,
      szamitott_felhasznalt: usage[r.id]?.szamitottFelhasznalt,
      anulalt_darab: usage[r.id]?.anulaltDarab,
    })),
  }
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
  // A-M7.2a óta: a @kartoteka/core use-case számolja a derived státuszt
  // (computeChitantaTombStatus). A web adapter vékony.
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const result = await getActiveChitantaTombStatusUseCase(
    { congregationId: access.effectiveCongregationId },
    { supabase: access.supabase, runtime: 'web' },
  )
  if (!result.success) return { error: result.error }
  return { active: result.active }
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
  // A-M7.1b óta: a @kartoteka/core use-case kezeli a validálást + átfedés-
  // ellenőrzést + RLS-védett insert-et + zod-drift-check-et. A web adapter
  // vékony — csak a scope (congregationId) + userId kinyerése.
  const result = await createChitantaTombUseCase(
    {
      congregationId: access.effectiveCongregationId,
      block_nr: input.block_nr ?? null,
      seria: input.seria,
      szam_kezdet: input.szam_kezdet,
      szam_veg: input.szam_veg,
      vasarlas_datuma: input.vasarlas_datuma,
      vasarlas_ara: input.vasarlas_ara ?? null,
      megjegyzes: input.megjegyzes ?? null,
    },
    {
      supabase: access.supabase,
      runtime: 'web',
      userId: access.user.id,
    },
  )

  if (!result.success) return { error: result.error }

  revalidatePath('/penzugy')
  return { success: true, id: result.id }
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
    if (darabszam > MAX_NYUGTA_TOMBBEN) {
      return {
        error: `${i + 1}. tömb: egy nyugtatömb ${MAX_NYUGTA_TOMBBEN} lapos, a megadott tartomány ${darabszam} db. Ellenőrizd a kezdő- és a végszámot.`,
      }
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

  // 2026-07-25 (G4): valós használat a berögzített kerületi nyugtaszámokból —
  // a kizárólag kézzel használt tömb (elso/utolso_hasznalat_datum NULL, a
  // felhasznalt_darabszam 0) különben ki sem került volna az éves kimutatásba.
  const usageRes = await getChitantaTombUsageUseCase(
    {
      congregationId: access.effectiveCongregationId,
      tombok: (tombok || []).map((t) => ({
        id: t.id as string,
        szam_kezdet: t.szam_kezdet as number,
        szam_veg: t.szam_veg as number,
      })),
    },
    { supabase: access.supabase, runtime: 'web' },
  )
  const usageMap = usageRes.success ? usageRes.usage : {}
  if (!usageRes.success) {
    console.error('[getChitantaTombokReport] használat-számítás hiba:', usageRes.error)
  }

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

  // Szűrjük azokat a tömböket, amelyek az adott évben voltak használatban.
  // 2026-07-25 (G4): a DB-dátumok MELLETT a számított (kézi rögzítésből
  // származó) első/utolsó használat is számít, és az illeszkedés
  // tartomány-alapú (első ≤ év ≤ utolsó — a köztes évek se essenek ki).
  const yearOf = (d: string | null | undefined) => (d ? new Date(d).getFullYear() : null)
  const inYear = (elso: string | null | undefined, utolso: string | null | undefined) => {
    const e = yearOf(elso)
    const u = yearOf(utolso)
    if (e == null && u == null) return false
    return (e ?? u ?? 0) <= year && year <= (u ?? e ?? 0)
  }
  const filtered = (tombok || []).filter((t) => {
    const usage = usageMap[t.id as string]
    return (
      inYear(t.elso_hasznalat_datum as string | null, t.utolso_hasznalat_datum as string | null) ||
      inYear(usage?.elsoHasznalat, usage?.utolsoHasznalat)
    )
  })

  const minDate = (a: string | null, b: string | null) => (a && b ? (a < b ? a : b) : a || b)
  const maxDate = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : a || b)

  const report: ChitantaTombReport[] = filtered.map((t, idx) => {
    const gyul = gyulSzamByTomb.get(t.id as string)
    const usage = usageMap[t.id as string]
    return {
      id: t.id as string,
      sorszam: idx + 1,
      block_nr: (t.block_nr as string | null) || null,
      seria: t.seria as string,
      nyomdai_kezdet: t.szam_kezdet as number,
      nyomdai_veg: t.szam_veg as number,
      datum_kezdet: minDate((t.elso_hasznalat_datum as string | null) || null, usage?.elsoHasznalat ?? null),
      datum_veg: maxDate((t.utolso_hasznalat_datum as string | null) || null, usage?.utolsoHasznalat ?? null),
      sajat_kezdet: gyul?.min ?? null,
      sajat_veg: gyul?.max ?? null,
      felhasznalt_darabszam: Math.max(
        t.felhasznalt_darabszam as number,
        usage?.szamitottFelhasznalt ?? 0,
      ),
      darabszam_ossz: t.darabszam_ossz as number,
      aktiv: t.aktiv as boolean,
    }
  })

  return { data: report }
}
