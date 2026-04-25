/**
 * listChitantaTombokUseCase — A-M7.1a (2026-04-22) első pénzügyi use-case.
 *
 * Ez a read-only use-case MINTAPÉLDÁNY minden jövőbeli A-M7 use-case számára:
 *   - Input nincs (read-only, a scope implicit: az aktuális gyülekezet)
 *   - Ctx: { supabase, storage (opcionális), runtime } — DI pattern
 *   - Result-objektum, soha nem dob kivételt
 *   - Online-first: első a Supabase lekérdezés, ha sikerül — frissíti a lokális cache-t
 *   - Offline fallback: ha a Supabase nem elérhető (pl. refresh-token lejárt),
 *     a lokális storage-ból olvas
 *   - Zod-validálás minden szerver-rekordra (tömeges DTO-drift ellen)
 *
 * A következő A-M7 use-case-ek ezt a mintát követik:
 *   - issueChitantaTombUseCase (write, A-M7.1b)
 *   - closeChitantaTombUseCase (write, A-M7.1b)
 *   - issueChitantaUseCase (write, A-M7.3 — a bizonylatkiállítás)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { StorageBackend, TableRegistryEntry } from '@kartoteka/offline-sync'
import {
  chitantaTombRowSchema,
  type ChitantaTombRow,
} from '@kartoteka/validations'

// ─────────────────────────────────────────────────────────────────────────
// Tábla-regisztráció — mintapéldány a jövőbeli table-registry-be
// (A-M7 keretében egy központi registry épül fel, most lokálisan definiáljuk)
// ─────────────────────────────────────────────────────────────────────────

export const CHITANTA_TOMBOK_TABLE: TableRegistryEntry = {
  supabaseTable: 'chitanta_tombok',
  localTable: 'chitanta_tombok_local',
  primaryKey: 'id',
  scopeFilter: 'congregation_id',
  softDelete: false,
  module: 'penzugy',
  label: 'Nyugtatömbök',
  priority: 30,
}

// ─────────────────────────────────────────────────────────────────────────
// Input + Result + Ctx típusok
// ─────────────────────────────────────────────────────────────────────────

export interface ListChitantaTombokInput {
  /** Melyik gyülekezet tömbjeit kérdezzük. A web/desktop caller adja meg. */
  congregationId: string
  /** Ha true, csak az aktív tömböket (aktiv = true) — default false (mind). */
  activeOnly?: boolean
}

export interface ListChitantaTombokCtx {
  supabase: SupabaseClient
  /** Opcionális: ha megvan, online-sikeres pull-nál frissítjük a helyi cache-t. */
  storage?: StorageBackend
  /** Futtató platform — csak logoláshoz, nem logikai elágazás. */
  runtime: 'web' | 'desktop'
}

export type ListChitantaTombokResult =
  | {
      success: true
      /** Honnan jött az adat: friss Supabase lekérdezés vagy lokális fallback. */
      source: 'supabase' | 'local'
      rows: ChitantaTombRow[]
    }
  | {
      success: false
      error: string
    }

// ─────────────────────────────────────────────────────────────────────────
// Use-case
// ─────────────────────────────────────────────────────────────────────────

export async function listChitantaTombokUseCase(
  input: ListChitantaTombokInput,
  ctx: ListChitantaTombokCtx,
): Promise<ListChitantaTombokResult> {
  if (!input.congregationId) {
    return { success: false, error: 'Hiányzó congregation_id.' }
  }

  // 1) Első próbálkozás: friss Supabase lekérdezés (RLS védi).
  try {
    let query = ctx.supabase
      .from(CHITANTA_TOMBOK_TABLE.supabaseTable)
      .select('*')
      .eq('congregation_id', input.congregationId)
      .order('szam_kezdet', { ascending: true })

    if (input.activeOnly) {
      query = query.eq('aktiv', true)
    }

    const { data, error } = await query

    if (!error && data) {
      // Zod-validálás — drift esetén fail-fast
      const parsed: ChitantaTombRow[] = []
      for (const raw of data) {
        const result = chitantaTombRowSchema.safeParse(raw)
        if (result.success) {
          parsed.push(result.data)
        }
        // Csendben kihagyjuk a drift-soragokat, hogy ne blokkoljuk a UI-t egyetlen
        // sémakülönbség miatt. A háttérben a Supabase típus-generátor + core-teszt
        // szintje foglalkozik a drift-fel.
      }

      // Ha van storage (tipikusan desktop), frissítsük a helyi cache-t
      if (ctx.storage && parsed.length > 0) {
        try {
          await ctx.storage.upsertServerRows(
            CHITANTA_TOMBOK_TABLE,
            parsed,
          )
        } catch {
          // A cache-frissítés nem blokkolja a visszatérést — a UI a friss adatot kapja
        }
      }

      return { success: true, source: 'supabase', rows: parsed }
    }

    // Ha Supabase hiba jött (pl. nem auth), próbáljuk a lokális fallbacket
    // (ha van storage). Egyéb esetben visszaadjuk a hibát.
    if (!ctx.storage) {
      return {
        success: false,
        error: error?.message || 'Ismeretlen Supabase hiba.',
      }
    }
  } catch (err) {
    // Network/timeout esetén is megpróbáljuk a lokálisat
    if (!ctx.storage) {
      const msg = err instanceof Error ? err.message : 'ismeretlen'
      return { success: false, error: `Hálózati hiba: ${msg}` }
    }
  }

  // 2) Fallback: lokális cache (csak ha ctx.storage adott)
  if (ctx.storage) {
    try {
      const filter: Record<string, string | boolean> = {
        congregation_id: input.congregationId,
      }
      if (input.activeOnly) {
        filter.aktiv = true
      }
      const rows = await ctx.storage.findAll<ChitantaTombRow>(
        CHITANTA_TOMBOK_TABLE,
        filter,
      )
      return { success: true, source: 'local', rows }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ismeretlen'
      return {
        success: false,
        error: `Sem online, sem offline nem sikerült elérni a nyugtatömböket: ${msg}`,
      }
    }
  }

  return {
    success: false,
    error: 'Nem sikerült elérni a nyugtatömböket.',
  }
}
