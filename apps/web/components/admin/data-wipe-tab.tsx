'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

import { WipeCongregationPanel } from './wipe-congregation-panel'

/**
 * Admin "Veszélyes zóna" tab — gyülekezeti adatok törlése.
 *
 * A tab csak azokat a gyülekezeteket listázza, amikhez a hívó hozzáfér:
 *   - admin: minden gyülekezet
 *   - egyhazkeruleti_admin / egyhazmegyei_admin: a profile_congregations-ján
 *     keresztül kapcsoltak
 *   - Fallback: a profiles.congregation_id single-scope
 *
 * A szerver-oldali RPC újra-ellenőrzi a scope-ot — ez a kliens-oldal
 * csak a UX-et javítja (ne látsson olyan gyülekezetet a user, amihez
 * nincs joga).
 */
export function DataWipeTab() {
  const [congregations, setCongregations] = useState<Array<{ id: string; nev: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const supabase = createClient()
        // A RLS a gyülekezet-listát szűri — csak amit a user láthat
        const { data, error: fetchError } = await supabase
          .from('congregations')
          .select('id, name, nev_hu')
          .order('nev_hu', { ascending: true, nullsFirst: false })

        if (!mounted) return
        if (fetchError) {
          setError(fetchError.message)
          return
        }

        const list = (data ?? [])
          .map((c) => ({
            id: c.id as string,
            nev: (c.nev_hu as string) || (c.name as string) || '(névtelen gyülekezet)',
          }))
          .filter((c) => !!c.id && !!c.nev)

        setCongregations(list)
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Ismeretlen hiba')
        }
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <div className="size-4 animate-spin rounded-full border-2 border-rose-200 border-t-rose-600" />
        Gyülekezetek betöltése…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
        Nem sikerült betölteni a gyülekezet-listát: {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">⚠️ Veszélyes zóna</p>
        <p className="mt-1 text-xs leading-relaxed">
          Az itt található műveletek <strong>visszavonhatatlanok</strong>. Csak akkor
          használd őket, ha biztos vagy benne — pl. a teszt-fázis után, mielőtt a
          gyülekezet élesre váltana. Minden művelet naplózva a{' '}
          <code>data_wipe_log</code> táblában.
        </p>
      </div>

      <WipeCongregationPanel congregations={congregations} />
    </div>
  )
}
