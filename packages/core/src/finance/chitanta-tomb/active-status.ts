/**
 * getActiveChitantaTombStatusUseCase — A-M7.2a (2026-04-22).
 *
 * A gyülekezet aktuálisan aktív nyugtatömbjét (aktiv=true, legkisebb
 * szam_kezdet) adja vissza, a **derived mezőkkel együtt**:
 *   - maradek        — hány kiállítható nyugta van még hátra
 *   - kovetkezo_szam — a következő kiállítandó nyugta sorszáma
 *
 * Ez az állapot a lelkésznek napi kritikus — a pénzügyi dashboard
 * jobb-felső sarkában mindig látható, hogy tudja:
 *   - lehet-e még chitantát kiállítani
 *   - új tömböt kell-e vásárolni / nyitni
 *
 * Online-first + offline-fallback, mint a list use-case (A-M7.1a minta).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { StorageBackend } from '@kartoteka/offline-sync'
import {
  chitantaTombRowSchema,
  computeChitantaTombStatus,
  type ChitantaTombRow,
  type ChitantaTombStatus,
} from '@kartoteka/validations'

import { CHITANTA_TOMBOK_TABLE } from './list'

export interface GetActiveChitantaTombStatusInput {
  congregationId: string
}

export interface GetActiveChitantaTombStatusCtx {
  supabase: SupabaseClient
  storage?: StorageBackend
  runtime: 'web' | 'desktop'
}

export type GetActiveChitantaTombStatusResult =
  | {
      success: true
      source: 'supabase' | 'local'
      /** Ha NULL, egyáltalán nincs aktív tömb — új rögzítés szükséges. */
      active: ChitantaTombStatus | null
    }
  | {
      success: false
      error: string
    }

export async function getActiveChitantaTombStatusUseCase(
  input: GetActiveChitantaTombStatusInput,
  ctx: GetActiveChitantaTombStatusCtx,
): Promise<GetActiveChitantaTombStatusResult> {
  if (!input.congregationId) {
    return { success: false, error: 'Hiányzó congregation_id.' }
  }

  // 1) Online-first: Supabase
  try {
    const { data, error } = await ctx.supabase
      .from(CHITANTA_TOMBOK_TABLE.supabaseTable)
      .select('*')
      .eq('congregation_id', input.congregationId)
      .eq('aktiv', true)
      .order('szam_kezdet', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!error) {
      if (!data) {
        return { success: true, source: 'supabase', active: null }
      }
      const parsed = chitantaTombRowSchema.safeParse(data)
      if (parsed.success) {
        // Opcionális cache-frissítés
        if (ctx.storage) {
          try {
            await ctx.storage.upsertServerRows(CHITANTA_TOMBOK_TABLE, [parsed.data])
          } catch {
            /* ne blokkolja a visszatérést */
          }
        }
        return {
          success: true,
          source: 'supabase',
          active: computeChitantaTombStatus(parsed.data),
        }
      }
      // Drift esetén is visszaadjuk a derived status-t cast-tal
      return {
        success: true,
        source: 'supabase',
        active: computeChitantaTombStatus(data as unknown as ChitantaTombRow),
      }
    }

    if (!ctx.storage) {
      return {
        success: false,
        error: error?.message || 'Ismeretlen Supabase hiba.',
      }
    }
    // különben lefelé eső lokális fallback
  } catch (err) {
    if (!ctx.storage) {
      const msg = err instanceof Error ? err.message : 'ismeretlen'
      return { success: false, error: `Hálózati hiba: ${msg}` }
    }
  }

  // 2) Offline fallback — a lokális cache-ből keresünk aktív tömböt
  if (ctx.storage) {
    try {
      const rows = await ctx.storage.findAll<ChitantaTombRow>(
        CHITANTA_TOMBOK_TABLE,
        { congregation_id: input.congregationId, aktiv: true },
      )
      if (rows.length === 0) {
        return { success: true, source: 'local', active: null }
      }
      // A SQLite oldalán a `findAll` nem garantálja az `ORDER BY szam_kezdet`-et
      // (kivéve ha a backend indexet használ) — a JS oldalon rendezünk a
      // konzisztens viselkedéshez.
      const sorted = [...rows].sort((a, b) => a.szam_kezdet - b.szam_kezdet)
      return {
        success: true,
        source: 'local',
        active: computeChitantaTombStatus(sorted[0]),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ismeretlen'
      return {
        success: false,
        error: `Sem online, sem offline nem sikerült az aktív-státuszt olvasni: ${msg}`,
      }
    }
  }

  return {
    success: false,
    error: 'Nem sikerült az aktív-státuszt olvasni.',
  }
}
