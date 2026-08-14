'use server'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { TABLE_REGISTRY } from '@/lib/offline/table-registry'

/**
 * Kuka — pontos törlés-dátumok a szerverről (2026-08-14, 6. pont 2. ütem).
 *
 * MIÉRT KÜLÖN AKCIÓ, MIÉRT NEM A SYNC-PULL: a soft-delete táblák pull-select
 * listái EXPLICITEK — ha a `deleted_at`-ot most beletennénk, a szinkron
 * 42703-mal (nincs ilyen oszlop) törne el MINDEN gépen, amíg a
 * 2026-08-14-kuka-deleted-at.sql migráció nem fut le élesben. Ez az akció
 * ehelyett FAIL-SOFT: ha az oszlop (még) nem létezik, üres térképet ad
 * vissza, és a Kuka a régi, „legfeljebb N nap" becslést mutatja tovább.
 *
 * Biztonság:
 *  - FAIL-CLOSED hatókör: congregation-kontextus nélkül ÜRES a válasz — a
 *    „NULL skalár → szűretlen lista" hibaosztály (2026-08-09) tiltott minta;
 *  - a tábla-nevek a TABLE_REGISTRY-vel szemben validálódnak (csak
 *    soft-delete tábla kérdezhető), a sorokat az RLS is szűri;
 *  - CSAK a kliens által ténylegesen mutatott azonosítókra kérdezünk
 *    (darabolt .in), nem a teljes törölt állományra.
 */

// Egy PostgREST-kérésben ennyi id megy (URL-hossz korlát miatt darabolunk).
const ID_CHUNK = 100
// Táblánként legfeljebb ennyi id-t szolgálunk ki — a Kuka-nézet 500/tábla
// sort mutat, ez bőven fedezi; a plafon HANGOS (levágásnál warn).
const MAX_IDS_PER_TABLE = 600

export async function fetchExactDeletedAt(
  items: Array<{ table: string; ids: Array<string | number> }>,
): Promise<Record<string, string>> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()

  // Fail-closed: a Kuka gyülekezet-szintű felület. Kontextus nélkül nem
  // esünk vissza szűretlen lekérdezésre — üres térkép megy vissza.
  if (!congregationId) return {}

  const result: Record<string, string> = {}

  for (const item of items) {
    const entry = TABLE_REGISTRY.find(
      t => t.dexieTable === item.table && t.softDelete,
    )
    if (!entry) continue // ismeretlen vagy nem soft-delete tábla — nem kérdezzük
    if (!Array.isArray(item.ids) || item.ids.length === 0) continue

    const ids = item.ids
      .filter(id => typeof id === 'string' || typeof id === 'number')
      .slice(0, MAX_IDS_PER_TABLE)
    if (item.ids.length > MAX_IDS_PER_TABLE) {
      console.warn(
        '[kuka fetchExactDeletedAt] id-plafon:',
        item.table,
        `${item.ids.length} → ${MAX_IDS_PER_TABLE}`,
      )
    }

    const jelzo = entry.softDeleteColumn ?? 'deleted'
    try {
      for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const chunk = ids.slice(i, i + ID_CHUNK)
        let query = supabase
          .from(entry.supabaseTable)
          .select('id, deleted_at')
          .eq(jelzo, true)
          .in('id', chunk)
        if (entry.scopeFilter === 'congregation_id') {
          query = query.eq('congregation_id', congregationId)
        }
        const { data, error } = await query
        if (error) {
          // 42703 (nincs deleted_at oszlop) várható, amíg a migráció nem fut le.
          console.warn('[kuka fetchExactDeletedAt]', item.table, error.message)
          break
        }
        for (const row of (data ?? []) as Array<{
          id: string | number
          deleted_at: string | null
        }>) {
          if (row.deleted_at) result[`${item.table}:${row.id}`] = row.deleted_at
        }
      }
    } catch (e) {
      console.warn('[kuka fetchExactDeletedAt]', item.table, e)
    }
  }

  return result
}
