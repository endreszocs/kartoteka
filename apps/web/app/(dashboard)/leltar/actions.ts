'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { initFinance } from '@/app/(dashboard)/penzugy/actions'
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
  let max = 0
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('leltar_tetelek')
      .select('leltari_szam')
      .eq('congregation_id', congId)
      .ilike('leltari_szam', `${prefix}-%`)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) break
    const rows = (data || []) as Array<{ leltari_szam: string | null }>
    rows.forEach((r) => {
      const m = String(r.leltari_szam || '').match(/-(\d+)$/)
      if (m) { const n = parseInt(m[1]); if (n > max) max = n }
    })
    if (rows.length < PAGE) break
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

export async function saveInventoryItem(data: InventoryItemInput) {
  const parsed = inventoryItemSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const d = parsed.data
  const leltariSzam = d.id ? undefined : await generateNextLeltariSzam(d.kategoria)
  const serializedCategory = serializeInventoryCategory(d.kategoria)
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
        const freshSzam = await generateNextLeltariSzam(d.kategoria)
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

export async function getLeltarFinalizationStatus(): Promise<{ finalized: boolean; unlockRequested: boolean }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { finalized: false, unlockRequested: false }
  const year = new Date().getFullYear()
  const { data } = await supabase.from('bealitas').select('leltar_finalized, leltar_unlock_requested').eq('id', String(year)).eq('congregation_id', congId).maybeSingle()
  return { finalized: !!data?.leltar_finalized, unlockRequested: !!data?.leltar_unlock_requested }
}

export async function finalizeLeltar() {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const year = new Date().getFullYear()
  const { error } = await supabase.from('bealitas').update({ leltar_finalized: true }).eq('id', String(year)).eq('congregation_id', congId)
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/leltar')
  return { success: true }
}

export async function requestLeltarUnlock(reason?: string | null) {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const year = new Date().getFullYear()
  const { error } = await supabase
    .from('bealitas')
    .update({ leltar_unlock_requested: true, leltar_unlock_reason: reason?.trim() || null })
    .eq('id', String(year))
    .eq('congregation_id', congId)
  if (error) return { error: `Hiba: ${error.message}` }
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
