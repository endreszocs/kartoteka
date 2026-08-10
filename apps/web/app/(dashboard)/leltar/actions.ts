'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { selectAllPaged } from '@kartoteka/supabase-client'
import { initFinance, listFinanceYears } from '@/app/(dashboard)/penzugy/actions'
import { documentSeasonYear } from '@/lib/constants/documents'
import { inventoryKategoriaForExpenseKod } from '@/lib/constants/finance'
import type { ExpensePickerResult, ExpensePickerRow } from '@/lib/inventory/expense-picker-types'
import { inventoryItemSchema, type InventoryItemInput } from '@/lib/validations/inventory'
import {
  INVENTORY_CATEGORY_PREFIXES,
  normalizeInventoryCategory,
  serializeInventoryCategory,
} from '@/lib/constants/inventory.next'
import type { InventoryItem, InventoryCategory } from '@/lib/constants/inventory.next'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import type { InventoryPrintFinanceSummary } from '@/lib/inventory/reporting'
import { calculateBalances } from '@/lib/utils/finance-helpers'

type InventoryRow = Record<string, unknown>

async function getCongId() {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId }
}

function normalizeInventoryRow(row: InventoryRow): InventoryItem {
  const rawCategory = typeof row.kategoria === 'string' ? row.kategoria : 'alapeszkoz'

  return {
    id: String(row.id || ''),
    leltari_szam: (row.leltari_szam as string | null) || null,
    regi_leltari_szam: (row.regi_leltari_szam as string | null) || null,
    megnevezes: String(row.megnevezes || ''),
    kategoria: rawCategory,
    kategoria_key: normalizeInventoryCategory(rawCategory),
    beszerzes_erteke: Number(row.beszerzes_erteke ?? row.beszerzesi_ertek ?? 0),
    beszerzes_datuma: (row.beszerzes_datuma as string | null) || null,
    beszerzes_bizonylat: (row.beszerzes_bizonylat as string | null) || null,
    katalogus_kod: (row.katalogus_kod as string | null) || null,
    hasznalati_ido: Number(row.hasznalati_ido ?? row.hasznalati_ido_ev ?? 0) || null,
    helyszin: (row.helyszin as string | null) || null,
    felelos_szemely_id: row.felelos_szemely_id == null ? null : Number(row.felelos_szemely_id) || null,
    felelos_nev: (row.felelos_nev as string | null) || (row.felelos_neve as string | null) || null,
    vonalkod: (row.vonalkod as string | null) || null,
    megjegyzes: (row.megjegyzes as string | null) || null,
    mennyiseg: Number(row.mennyiseg ?? 1) || 1,
    mertekegyseg: (row.mertekegyseg as string | null) || 'db',
    torles_datuma: (row.torles_datuma as string | null) || null,
    torles_bizonylat: (row.torles_bizonylat as string | null) || null,
    torles_indoklasa: (row.torles_indoklasa as string | null) || null,
    penzugy_xkey: (row.penzugy_xkey as string | null) || null,
    szerzo: (row.szerzo as string | null) || null,
    konyv_isbn: (row.konyv_isbn as string | null) || null,
    konyv_kiado: (row.konyv_kiado as string | null) || null,
    konyv_kiadas_helye: (row.konyv_kiadas_helye as string | null) || null,
    konyv_kiadas_eve: row.konyv_kiadas_eve == null ? null : Number(row.konyv_kiadas_eve) || null,
    konyv_terjedelem: (row.konyv_terjedelem as string | null) || null,
    konyv_sorozatcim: (row.konyv_sorozatcim as string | null) || null,
    created_at: (row.created_at as string | null) || null,
    deleted: Boolean(row.deleted ?? row.is_deleted ?? false),
  }
}

async function fetchInventoryRowsCompat(supabase: SupabaseClient, congId: string): Promise<InventoryRow[]> {
  const baseQuery = () =>
    supabase
      .from('leltar_tetelek')
      .select('*')
      .eq('congregation_id', congId)
      .order('created_at', { ascending: false })

  const result = await baseQuery()
  if (result.error) {
    throw new Error(result.error.message)
  }

  return (result.data || []) as InventoryRow[]
}

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const { supabase, congId } = await getCongId()
  if (!congId) return []
  const rows = await fetchInventoryRowsCompat(supabase, congId)
  return rows.map(normalizeInventoryRow)
}

export async function generateNextLeltariSzam(category: InventoryCategory): Promise<string> {
  const { supabase, congId } = await getCongId()
  if (!congId) return `${INVENTORY_CATEGORY_PREFIXES[category]}-001`
  const prefix = INVENTORY_CATEGORY_PREFIXES[category]
  // 2026-08-09 (review-fix): LAPOZVA olvassuk az összes számot — a PostgREST 1000
  // soros néma plafonja miatt 1000+ tételnél (pl. könyvtár, 'K-%') már kiadott
  // szám ismétlődne (a nyugtaszám-P0 hibaosztálya). Szöveges szám miatt
  // order+limit(1) sem lenne jó ('K-999' > 'K-1000' szövegként).
  //
  // 2026-08-11 (5. kör, P3 #15): KÖZÖS `selectAllPaged` + FAIL-CLOSED hiba.
  // Két baj volt itt: (1) a `rows.length < PAGE` stop-feltétel leszállított
  // szerver-plafonnál az első lap után kilépett, (2) az `if (error) break` a
  // lekérdezés hibáját ELNYELTE, és a függvény `max = 0`-val „PREFIX-001"-et
  // adott vissza — vagyis egy hálózati hiba után a rendszer egy MÁR HASZNÁLT
  // leltári számot javasolt. Számot generáló kapunál nincs olyan hiba, ami után
  // a „tippeljünk egyet" lenne a jó válasz, ezért most hangosan dobunk.
  const { data: rows, error } = await selectAllPaged<{ leltari_szam: string | null }>(
    supabase
      .from('leltar_tetelek')
      .select('leltari_szam')
      .eq('congregation_id', congId)
      .ilike('leltari_szam', `${prefix}-%`),
  )
  if (error) {
    throw new Error(
      'Nem sikerült lekérdezni a már kiadott leltári számokat ' +
        `(${error.message}), ezért új számot sem adhatunk ki — különben egy már ` +
        'használt leltári szám ismétlődne. Ellenőrizd az internetkapcsolatot, és ' +
        'próbáld újra; ha újra hibázik, jelezd a rendszergazdának.',
    )
  }
  let max = 0
  for (const r of rows) {
    const m = String(r.leltari_szam || '').match(/-(\d+)$/)
    if (m) { const n = parseInt(m[1]); if (n > max) max = n }
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

export async function saveInventoryItem(data: InventoryItemInput) {
  const parsed = inventoryItemSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const d = parsed.data
  // 2026-08-11 (5. kör, P3 #15): a `generateNextLeltariSzam` mostantól DOB, ha nem
  // tudja hitelesen megállapítani a következő számot (korábban némán „PREFIX-001"-re
  // esett vissza) — a hibát itt fordítjuk a lelkésznek megjeleníthető válasszá.
  let leltariSzam: string | undefined
  if (!d.id) {
    try {
      leltariSzam = await generateNextLeltariSzam(d.kategoria)
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'A leltári szám generálása nem sikerült.' }
    }
  }
  const serializedCategory = serializeInventoryCategory(d.kategoria)
  // 2026-08-09: kapcsolt kiadás (penzugy_xkey) — CSAK akkor nyúlunk hozzá, ha a
  // hívó ténylegesen küldte a mezőt (undefined = régi hívó → a meglévő link marad).
  const penzugyXkeyPatch =
    d.penzugy_xkey !== undefined ? { penzugy_xkey: d.penzugy_xkey || null } : {}
  // Az új (kanonikus DB séma) szerinti mezőnevek. A `vonalkod` mező NEM létezik
  // a `leltar_tetelek` táblában — ezért nem tesszük be a payload-ba.
  const record: Record<string, unknown> = {
    megnevezes: d.megnevezes, kategoria: serializedCategory, beszerzesi_ertek: d.beszerzes_erteke,
    beszerzes_datuma: d.beszerzes_datuma || null, katalogus_kod: d.katalogus_kod || null,
    hasznalati_ido_ev: d.hasznalati_ido || null, helyszin: d.helyszin || null,
    felelos_neve: d.felelos_nev || null,
    megjegyzes: d.megjegyzes || null, is_deleted: false, congregation_id: congId,
    mennyiseg: d.mennyiseg ?? 1,
    mertekegyseg: d.mertekegyseg || 'db',
    beszerzes_bizonylat: d.beszerzes_bizonylat || null,
    ...penzugyXkeyPatch,
  }
  // Backward-compat fallback (régi mezőnevek), ha az új séma még nincs migrálva.
  const modernFallback: Record<string, unknown> = {
    megnevezes: d.megnevezes, kategoria: serializedCategory, beszerzes_erteke: d.beszerzes_erteke,
    beszerzes_datuma: d.beszerzes_datuma || null, katalogus_kod: d.katalogus_kod || null,
    hasznalati_ido: d.hasznalati_ido || null, helyszin: d.helyszin || null,
    felelos_nev: d.felelos_nev || null,
    megjegyzes: d.megjegyzes || null, deleted: false, congregation_id: congId,
    mennyiseg: d.mennyiseg ?? 1,
    mertekegyseg: d.mertekegyseg || 'db',
    beszerzes_bizonylat: d.beszerzes_bizonylat || null,
    ...penzugyXkeyPatch,
  }
  if (!d.id) record.leltari_szam = leltariSzam
  if (!d.id) modernFallback.leltari_szam = leltariSzam

  if (d.id) {
    let { error } = await supabase.from('leltar_tetelek').update(record).eq('id', d.id).eq('congregation_id', congId)
    if (error?.message?.match(/beszerzes_erteke|deleted|felelos_nev|hasznalati_ido/)) {
      const retry = await supabase.from('leltar_tetelek').update(modernFallback).eq('id', d.id).eq('congregation_id', congId)
      error = retry.error
    }
    if (error) return { error: `Hiba: ${error.message}` }
  }
  else {
    // 2026-08-09 (review-fix): párhuzamos rögzítésnél két hívó ugyanazt a következő
    // számot kaphatja — az egyediségi index (2026-08-09-leltari-szam-unique-index.sql)
    // 23505-tel utasítja el a másodikat; ilyenkor ÚJ számmal (max 3x) újrapróbálunk.
    let lastError: { code?: string; message: string } | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) {
        let freshSzam: string
        try {
          freshSzam = await generateNextLeltariSzam(d.kategoria)
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'A leltári szám generálása nem sikerült.' }
        }
        record.leltari_szam = freshSzam
        modernFallback.leltari_szam = freshSzam
      }
      let { error } = await supabase.from('leltar_tetelek').insert([record])
      if (error?.message?.match(/beszerzes_erteke|deleted|felelos_nev|hasznalati_ido/)) {
        const retry = await supabase.from('leltar_tetelek').insert([modernFallback])
        error = retry.error
      }
      if (!error) { lastError = null; break }
      lastError = error
      if (error.code !== '23505') break
    }
    if (lastError) return { error: `Hiba: ${lastError.message}` }
  }
  revalidatePath('/leltar')
  return { success: true }
}

/**
 * 2026-08-09: „Kikeresés a könyvelésből" — a leltár-dialógus kiadás-választója.
 *
 * A gyülekezet adott évi kiadásait adja vissza (stornó és belső mozgás nélkül),
 * megjelölve (1) a leltár-köteles jogcíműeket (205.01 → alapeszköz, 201.12 →
 * csekély; ezek kerülnek a lista elejére) és (2) hogy van-e már hozzájuk
 * kapcsolt leltári tétel (leltar_tetelek.penzugy_xkey egyezés). Minden olvasás
 * LAPOZOTT (a PostgREST 1000 soros néma plafonja ismert hibaosztály).
 */
export async function listExpensesForInventoryPicker(year: number): Promise<ExpensePickerResult> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }

  // 2026-08-11 (5. kör, P3 #15): a lokális `fetchPaged` helyett a KÖZÖS
  // `selectAllPaged`. A régi változat a `rows.length < PAGE` stop-feltételt
  // használta — leszállított szerver-plafonnál a kikeresőben a kiadások fele
  // egyszerűen nem jelent volna meg, és a lelkész „nincs ilyen tétel" alapon
  // rögzített volna újat.
  const throwOnError = <T,>(res: { data: T[]; error: { message: string } | null }): T[] => {
    if (res.error) throw new Error(res.error.message)
    return res.data
  }

  try {
    const [kiadasRes, kiaCelRes, celRes, linkedRes, years] = await Promise.all([
      selectAllPaged<Record<string, unknown>>(
        supabase
          .from('kiadas')
          .select('id, xkey, datum, osszeg, atvevo, iratszam, nyugta, irattipus, megjegyzes, id_kiadascel, stornozott, belso_mozgas_xkey')
          .eq('congregation_id', congId)
          .eq('deleted', false)
          .gte('datum', `${year}-01-01`)
          .lte('datum', `${year}-12-31`)
          .order('datum', { ascending: false })
          .order('id', { ascending: false }),
        // A rendezés DIREKT fordított (dátum szerint csökkenő, `id` a döntetlen-bontó),
        // ezért a helper ne fűzzön hozzá saját növekvő `id`-t — de a lapok közti
        // dedup az `id`-n továbbra is kell.
        { orderColumn: null, dedupeBy: 'id' },
      ),
      supabase.from('kiadascel').select('id, id_szamadasicel'),
      supabase.from('szamadasicel').select('id, nev'),
      selectAllPaged<{ penzugy_xkey: string | null }>(
        supabase
          .from('leltar_tetelek')
          .select('penzugy_xkey')
          .eq('congregation_id', congId)
          // A törölt leltári tétel NEM foglalja a kiadást (újra kikereshető).
          .eq('is_deleted', false)
          .not('penzugy_xkey', 'is', null),
      ),
      listFinanceYears(),
    ])
    const kiadasRows = throwOnError(kiadasRes)
    const linkedRows = throwOnError(linkedRes)

    const kodById = new Map<number, string>()
    ;((kiaCelRes.data || []) as Array<{ id: number; id_szamadasicel: string | null }>).forEach((c) => {
      if (c.id_szamadasicel) kodById.set(Number(c.id), String(c.id_szamadasicel))
    })
    const nevByKod = new Map<string, string>()
    ;((celRes.data || []) as Array<{ id: string; nev: string | null }>).forEach((c) => {
      if (c.nev) nevByKod.set(String(c.id), c.nev)
    })
    const linkedXkeys = new Set(linkedRows.map((r) => String(r.penzugy_xkey)))

    const rows: ExpensePickerRow[] = kiadasRows
      .filter((r) => !r.stornozott && !r.belso_mozgas_xkey && r.xkey)
      .map((r) => {
        const kod = kodById.get(Number(r.id_kiadascel)) ?? null
        return {
          id: Number(r.id),
          xkey: String(r.xkey),
          datum: String(r.datum || '').slice(0, 10),
          osszeg: Number(r.osszeg) || 0,
          atvevo: (r.atvevo as string | null) || null,
          iratszam: (r.iratszam as string | null) || null,
          nyugta: (r.nyugta as string | null) || null,
          irattipus: (r.irattipus as string | null) || null,
          megjegyzes: (r.megjegyzes as string | null) || null,
          kod,
          kodNev: kod ? nevByKod.get(kod) ?? null : null,
          invKategoria: inventoryKategoriaForExpenseKod(kod),
          linked: linkedXkeys.has(String(r.xkey)),
        }
      })
      // Leltár-köteles jogcíműek elöl, azon belül dátum szerint csökkenő.
      .sort((a, b) => {
        const ai = a.invKategoria ? 0 : 1
        const bi = b.invKategoria ? 0 : 1
        if (ai !== bi) return ai - bi
        return b.datum.localeCompare(a.datum)
      })

    return { rows, years }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'A kiadások betöltése nem sikerült.' }
  }
}

export async function deleteInventoryItem(id: string) {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }

  let { error } = await supabase.from('leltar_tetelek').update({ is_deleted: true }).eq('id', id).eq('congregation_id', congId)
  if (error?.message?.includes('is_deleted')) {
    const retry = await supabase.from('leltar_tetelek').update({ deleted: true }).eq('id', id).eq('congregation_id', congId)
    error = retry.error
  }
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/leltar')
  return { success: true }
}

// ── H9: Véglegesítés + feloldás ──────────────────────────────

/**
 * 2026-08-11 (P1 #24): a vagyonleltári jelentés KANONIKUS év-kulcsa.
 *
 * Eddig három különböző kulcs élt egymás mellett ugyanarra a jelentésre:
 *   - `finalizeLeltar` / `getLeltarFinalizationStatus`: `getFullYear()`
 *   - a beküldés (inventory-main-v3.tsx): `getFullYear() - 1`
 *   - az egyházmegyei teljességi mátrix: `documentSeasonYear()`
 * Emiatt a lelkész az egyik évet véglegesítette és egy MÁSIKAT küldött be:
 * az esperes „Hiányzik"-ot látott, vagy a felülírás-védelem az előző évi,
 * már véglegesített sorra hivatkozva utasította el a beküldést — kiút nélkül.
 *
 * Egy forrás maradt: a `documentSeasonYear()` (lib/constants/documents.ts),
 * vagyis a beszámolási szezon éve (január–március = az előző, tárgyév).
 * Ez azonos azzal, amit a számadás és a lelkészi jelentés is használ a
 * beküldéskor, és amivel a mátrix az oszlopokat kulcsolja — így a véglegesítés,
 * a beküldés és az egyházmegyei nézet egyszerre ugyanarról az évről beszél.
 * Ráadásul januárban a MÚLT évi `bealitas` sorra írunk, ami már létezik
 * (az idei évi gyakran még nem — lásd a P1 #23-at alább).
 */
function leltarReportYear(): number {
  return documentSeasonYear()
}

/**
 * A „nincs év-sor" eset egyetlen, cselekvésre váltható üzenete (P1 #23).
 * Szándékosan megmondja, HOL hozza létre a lelkész a hiányzó évet.
 */
function missingYearSettingsMessage(year: number): string {
  return (
    `A(z) ${year}. évhez még nincs éves beállítás a rendszerben, ezért a művelet NEM mentődött el. ` +
    `Nyisd meg a Pénzügy modult, és válaszd ki fent a(z) ${year}. évet — a rendszer ilyenkor létrehozza az évet ` +
    `(ha éves járulékot kér, add meg). Utána térj vissza ide, és próbáld újra.`
  )
}

/** A kliens (inventory-main-v3.tsx) is ezt kéri le, hogy a beküldés év-kulcsa
 *  bit-azonos legyen a véglegesítésével. */
export async function getLeltarReportYear(): Promise<number> {
  return leltarReportYear()
}

export async function getLeltarFinalizationStatus(): Promise<{ finalized: boolean; unlockRequested: boolean }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { finalized: false, unlockRequested: false }
  const year = leltarReportYear()
  const { data } = await supabase.from('bealitas').select('leltar_finalized, leltar_unlock_requested').eq('id', String(year)).eq('congregation_id', congId).maybeSingle()
  return { finalized: !!data?.leltar_finalized, unlockRequested: !!data?.leltar_unlock_requested }
}

/**
 * 2026-08-11 (P1 #23): a `bealitas` UPDATE 0 sort érinthet — ilyenkor a
 * PostgREST NEM ad hibát, tehát a régi kód `{ success: true }`-t adott vissza,
 * a UI zöld „A vagyonleltári jelentés véglegesítve lett." toastot mutatott, a
 * gomb pedig ott maradt „Jelentés véglegesítése" felirattal, mert a
 * visszaolvasott állapot változatlanul `false` volt. Ez az ÚJ gyülekezet és
 * minden januári eset: az év-sor csak akkor jön létre, ha a Pénzügy modult
 * megnyitották az adott évre (a pénzügy ugyanezt `upsert … ignoreDuplicates`
 * mintával kezeli — penzugy/actions.ts `createYearlySettings`).
 *
 * A `.select('id')` visszakéri az érintett sorokat, így a „semmi sem történt"
 * eset már NEM néma siker, hanem konkrét, cselekvésre váltható magyar üzenet.
 * (Szándékosan nem hozunk létre itt év-sort: a `bealitas` a pénzügyi modul
 * rekordja, kötelező járulék-mezőkkel — azt ott, a helyén kell kitölteni.)
 */
export async function finalizeLeltar() {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const year = leltarReportYear()
  const { data, error } = await supabase
    .from('bealitas')
    .update({ leltar_finalized: true })
    .eq('id', String(year))
    .eq('congregation_id', congId)
    .select('id')
  if (error) return { error: `Hiba: ${error.message}` }
  if (!data || data.length === 0) return { error: missingYearSettingsMessage(year) }
  revalidatePath('/leltar')
  return { success: true }
}

export async function requestLeltarUnlock(reason?: string | null) {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-08-11 (K5-#12): AZ INDOKLÁS KÖTELEZŐ. Eddig az üres sztring is átment
  // (`reason?.trim() || null`), így az esperes indoklás nélküli feloldási
  // kérelmet kapott — nem tudta elbírálni —, a lelkész viszont sikeres
  // visszajelzést látott. Fail-closed: inkább hangos hiba, mint néma, üres
  // kérelem. (A kliens-oldali dialógus megkerülhető, ezért a szerver is ellenőrzi.)
  const trimmedReason = (reason || '').trim()
  if (trimmedReason.length < 10) {
    return {
      error:
        'Írja le legalább egy mondatban, miért kéri a jelentés feloldását — enélkül az egyházmegye nem tudja elbírálni a kérelmet.',
    }
  }
  const year = leltarReportYear()
  // 2026-08-11 (P1 #23): ugyanaz a néma 0-soros update-csapda, mint a
  // finalizeLeltar-nál — a feloldási kérelem is „elküldve" visszajelzést adott,
  // miközben az egyházmegye sosem látta meg.
  const { data, error } = await supabase
    .from('bealitas')
    .update({ leltar_unlock_requested: true, leltar_unlock_reason: trimmedReason })
    .eq('id', String(year))
    .eq('congregation_id', congId)
    .select('id')
  if (error) return { error: `Hiba: ${error.message}` }
  if (!data || data.length === 0) return { error: missingYearSettingsMessage(year) }
  revalidatePath('/leltar')
  return { success: true }
}

function parseComparableDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function sumAmountsBetween<T extends { datum?: string | null; osszeg: number; irattipus?: string | null }>(
  rows: T[],
  startDate: Date,
  endDate: Date,
  mode: 'cash' | 'all',
) {
  return rows.reduce((sum, row) => {
    const date = parseComparableDate(row.datum)
    if (!date) return sum
    if (date.getTime() < startDate.getTime() || date.getTime() > endDate.getTime()) return sum
    if (mode === 'cash' && row.irattipus !== 'Készpénz') return sum
    return sum + (Number(row.osszeg) || 0)
  }, 0)
}

export async function getInventoryPrintFinanceSummary(params: {
  year: number
  periodStart?: string | null
  periodEnd?: string | null
}): Promise<InventoryPrintFinanceSummary | null> {
  const finance = await initFinance(params.year)
  if (!finance) return null

  const startDate = parseComparableDate(params.periodStart) || new Date(params.year, 0, 1)
  const endDate = parseComparableDate(params.periodEnd) || new Date(params.year, 11, 31, 23, 59, 59, 999)
  const dayBeforeStart = new Date(startDate)
  dayBeforeStart.setDate(dayBeforeStart.getDate() - 1)
  dayBeforeStart.setHours(23, 59, 59, 999)

  const openingIncome = finance.initialIncome.filter((row) => {
    const date = parseComparableDate(row.datum)
    return !!date && date.getTime() <= dayBeforeStart.getTime()
  })
  const openingExpense = finance.initialExpense.filter((row) => {
    const date = parseComparableDate(row.datum)
    return !!date && date.getTime() <= dayBeforeStart.getTime()
  })
  const openingBalances = calculateBalances(openingIncome, openingExpense, finance.carryoverCash, finance.carryoverBank)

  const periodCashIncome = sumAmountsBetween(finance.initialIncome, startDate, endDate, 'cash')
  const periodCashExpense = sumAmountsBetween(finance.initialExpense, startDate, endDate, 'cash')
  const periodIncome = sumAmountsBetween(finance.initialIncome, startDate, endDate, 'all')
  const periodExpense = sumAmountsBetween(finance.initialExpense, startDate, endDate, 'all')

  const accumulatedIncome = finance.initialIncome.filter((row) => {
    const date = parseComparableDate(row.datum)
    return !!date && date.getTime() <= endDate.getTime()
  })
  const accumulatedExpense = finance.initialExpense.filter((row) => {
    const date = parseComparableDate(row.datum)
    return !!date && date.getTime() <= endDate.getTime()
  })
  const closingBalances = calculateBalances(accumulatedIncome, accumulatedExpense, finance.carryoverCash, finance.carryoverBank)

  let openingReceivables = 0
  if (!params.periodStart || startDate.getMonth() === 0) {
    const previousFinance = await initFinance(params.year - 1)
    if (previousFinance) {
      openingReceivables = previousFinance.debtRows.reduce((sum, row) => sum + (Number(row.debt) || 0), 0)
    }
  }
  const closingReceivables = finance.debtRows.reduce((sum, row) => sum + (Number(row.debt) || 0), 0)

  return {
    openingCash: openingBalances.cashBalance,
    periodCashIncome,
    periodCashExpense,
    closingCash: closingBalances.cashBalance,
    bankBalance: closingBalances.bankBalance,
    periodIncome,
    periodExpense,
    openingReceivables,
    closingReceivables,
  }
}
