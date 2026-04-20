import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { TABLE_REGISTRY } from '@/lib/offline/table-registry'
import { isStandaloneMode } from '@/lib/standalone/runtime-detect'
import { getSqliteDb, upsertRecord } from '@/lib/standalone/sqlite-db'

/**
 * POST /api/standalone/initial-pull
 *
 * Letölti a gyülekezet **teljes** adatkészletét a Supabase-ről a lokális
 * SQLite-ba. Első indítás után futtatjuk.
 *
 * A TABLE_REGISTRY-ben felsorolt összes tábla (26 db) sorára megy.
 * Congregation scope szerint szűr (amit lehet).
 *
 * Payload: { congregationId }
 *
 * Időkorlát: A wizard online indul, de a hálózat menet közben elszakadhat.
 * Per-tábla 30s timeout-tal védjük a hosszú/leak-elt fetch-eket — ennyi alatt
 * a Supabase válasza el kell jusson, különben "offline-szakadás" történt és
 * a wizard hibát kell jelezzen, NEM várjon végtelenül.
 */
const PER_TABLE_TIMEOUT_MS = 30_000

export async function POST(request: Request) {
  if (!isStandaloneMode()) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  try {
    const { congregationId } = await request.json()
    if (!congregationId) {
      return NextResponse.json(
        { error: 'Hiányzó gyülekezet azonosító' },
        { status: 400 },
      )
    }

    // Egy közös AbortController a teljes pull-hoz — ha a hálózat menet közben
    // elszakad, NEM várunk órákig a Supabase-re.
    // A `global.fetch` opció a `createClient` alatt minden SDK-hívásra rátesz
    // egy AbortController-t, és a per-tábla loop-ban felülírjuk a signal-t.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          fetch: (url, init) => {
            const controller = new AbortController()
            const timer = setTimeout(
              () => controller.abort(),
              PER_TABLE_TIMEOUT_MS,
            )
            return fetch(url, {
              ...init,
              signal: controller.signal,
            }).finally(() => clearTimeout(timer))
          },
        },
      },
    )

    const db = getSqliteDb()
    const stats: Record<string, number> = {}
    const errors: Array<{ table: string; error: string }> = []
    let totalRows = 0

    // Az elsődleges (congregation-scoped) táblák, aztán a children
    const sortedTables = [...TABLE_REGISTRY].sort((a, b) => a.priority - b.priority)

    for (const entry of sortedTables) {
      try {
        let query = supabase.from(entry.supabaseTable).select('*')
        if (entry.scopeFilter === 'congregation_id') {
          query = query.eq('congregation_id', congregationId)
        }
        // A child-tables (sirhely, stb.) scope-ot nem tudjuk itt szűrni
        // közvetlenül — a pull-ban minden rekordot lehoznak, a RLS-nél
        // Supabase oldalon szűrődik.

        const { data, error } = await query
        if (error) {
          errors.push({ table: entry.dexieTable, error: error.message })
          continue
        }

        const rows = (data || []) as Record<string, unknown>[]
        if (rows.length === 0) {
          stats[entry.dexieTable] = 0
          continue
        }

        // Batch upsert a SQLite-ba
        const upsertTxn = db.transaction((batch: Record<string, unknown>[]) => {
          for (const row of batch) {
            upsertRecord(entry.dexieTable, row)
          }
        })
        upsertTxn(rows)

        // Sync-meta frissítés (utolsó pull időpont)
        db.prepare(
          `UPDATE _sync_meta SET last_pull_at = ? WHERE table_name = ?`,
        ).run(new Date().toISOString(), entry.dexieTable)

        stats[entry.dexieTable] = rows.length
        totalRows += rows.length
      } catch (e) {
        const isAbort =
          e instanceof Error &&
          (e.name === 'AbortError' || /aborted/i.test(e.message))
        errors.push({
          table: entry.dexieTable,
          error: isAbort
            ? `Időtúllépés (${PER_TABLE_TIMEOUT_MS / 1000}s) — ellenőrizd az internet kapcsolatot`
            : e instanceof Error
              ? e.message
              : String(e),
        })
      }
    }

    return NextResponse.json({
      success: true,
      totalRows,
      tablesCount: Object.keys(stats).length,
      perTable: stats,
      errors,
    })
  } catch (e) {
    console.error('[/api/standalone/initial-pull]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ismeretlen hiba' },
      { status: 500 },
    )
  }
}
