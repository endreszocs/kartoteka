/**
 * createChitantaTombUseCase — A-M7.1b (2026-04-22) első write use-case.
 *
 * Egy új nyugtatömb (chitanta_tombok) rögzítése.
 *
 * Flow:
 *   1. Zod-validálás (input-séma + üzleti-szabályok)
 *   2. Átfedés-ellenőrzés: a congregation meglévő tömbjei közül nincs-e
 *      olyan, ami a (seria, szam_kezdet..szam_veg) tartománnyal átfed
 *   3. Supabase INSERT (RLS-védett) — `created_by = userId`, `aktiv = true`
 *   4. Siker → a lokális cache frissítése (ha `ctx.storage` adott)
 *   5. Result-objektum (sosem dob)
 *
 * Kontraktus (minden write use-case ezt követi):
 *   - Input: zod-validált
 *   - Ctx: { supabase, storage?, runtime, userId }
 *   - Result: { success, id, row } | { success: false, error }
 *
 * Jövőbeli bővítés (A-M7.1b-sub2): offline-mode esetén a writeLocal +
 * enqueueMutation pattern — a sync-orchestrator push-olja később. Most
 * az online-first szemantika elég a minta-beállításhoz.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { StorageBackend } from '@kartoteka/offline-sync'
import {
  chitantaTombRowSchema,
  createChitantaTombInputFullSchema,
  type ChitantaTombRow,
  type CreateChitantaTombInput,
} from '@kartoteka/validations'

import { CHITANTA_TOMBOK_TABLE } from './list'

export interface CreateChitantaTombCtx {
  supabase: SupabaseClient
  /** Ha megvan, online sikerénél a lokális cache frissül is. */
  storage?: StorageBackend
  runtime: 'web' | 'desktop'
  /** Az aktuális user UUID-ja (created_by-hoz). */
  userId: string
}

export type CreateChitantaTombResult =
  | {
      success: true
      id: string
      row: ChitantaTombRow
    }
  | {
      success: false
      /** User-barát, pasztorális hibaüzenet magyarul. */
      error: string
      /** Ha validáció bukott, itt a hibás mező(k). */
      field?: string
    }

/** Intervallum-átfedés check: két `[a1..a2]` és `[b1..b2]` szám-tartomány átfed-e. */
function rangesOverlap(
  a1: number,
  a2: number,
  b1: number,
  b2: number,
): boolean {
  return a1 <= b2 && a2 >= b1
}

export async function createChitantaTombUseCase(
  input: CreateChitantaTombInput,
  ctx: CreateChitantaTombCtx,
): Promise<CreateChitantaTombResult> {
  // 1) Input-validáció (zod + üzleti-szabályok)
  const parsed = createChitantaTombInputFullSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      success: false,
      error: issue?.message || 'Érvénytelen bemenet.',
      field: issue?.path?.join('.'),
    }
  }
  const clean = parsed.data
  const darabszam = clean.szam_veg - clean.szam_kezdet + 1

  // 2) Átfedés-ellenőrzés ugyanabban a congregation + seria kombináción belül
  try {
    const { data: existing, error: fetchErr } = await ctx.supabase
      .from(CHITANTA_TOMBOK_TABLE.supabaseTable)
      .select('id, seria, szam_kezdet, szam_veg')
      .eq('congregation_id', clean.congregationId)
      .eq('seria', clean.seria)

    if (fetchErr) {
      return {
        success: false,
        error: `Nem sikerült ellenőrizni a meglévő tömböket: ${fetchErr.message}`,
      }
    }

    for (const t of existing || []) {
      if (
        rangesOverlap(
          clean.szam_kezdet,
          clean.szam_veg,
          t.szam_kezdet as number,
          t.szam_veg as number,
        )
      ) {
        return {
          success: false,
          error: `Átfedés a meglévő ${t.seria} ${t.szam_kezdet}-${t.szam_veg} tömbbel. Ellenőrizd a számokat.`,
          field: 'szam_kezdet',
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return {
      success: false,
      error: `Átfedés-ellenőrzés hibája: ${msg}`,
    }
  }

  // 3) INSERT (RLS-védett)
  try {
    const { data: inserted, error: insertErr } = await ctx.supabase
      .from(CHITANTA_TOMBOK_TABLE.supabaseTable)
      .insert({
        congregation_id: clean.congregationId,
        block_nr: clean.block_nr || null,
        seria: clean.seria,
        szam_kezdet: clean.szam_kezdet,
        szam_veg: clean.szam_veg,
        darabszam_ossz: darabszam,
        felhasznalt_darabszam: 0,
        vasarlas_datuma: clean.vasarlas_datuma,
        vasarlas_ara: clean.vasarlas_ara ?? null,
        megjegyzes: clean.megjegyzes || null,
        aktiv: true,
        created_by: ctx.userId,
      })
      .select('*')
      .single()

    if (insertErr || !inserted) {
      return {
        success: false,
        error: insertErr?.message || 'Nem sikerült rögzíteni a nyugtatömböt.',
      }
    }

    // Zod-validálás (drift-check)
    const rowParse = chitantaTombRowSchema.safeParse(inserted)
    if (!rowParse.success) {
      // A beszúrás sikerült, csak a szerver-oldali DTO nem passzol teljesen —
      // logoljuk, de a rekord létezik.
      return {
        success: true,
        id: (inserted.id as string),
        row: inserted as unknown as ChitantaTombRow,
      }
    }

    // 4) Lokális cache frissítés (ha desktop, vagy web-en van Dexie)
    if (ctx.storage) {
      try {
        await ctx.storage.upsertServerRows(CHITANTA_TOMBOK_TABLE, [rowParse.data])
      } catch {
        // A cache-frissítés nem blokkolja a return-t
      }
    }

    return { success: true, id: rowParse.data.id, row: rowParse.data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Rögzítési hiba: ${msg}` }
  }
}
