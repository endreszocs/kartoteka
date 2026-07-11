'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, History, RefreshCw, ShieldAlert } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AdminEmptyState } from './_shared/admin-empty-state'
import { AdminSkeleton } from './_shared/admin-skeleton'
import { AdminTable } from './_shared/admin-table'
import { listRecentWipesAction } from '@/app/(dashboard)/admin/wipe-actions'

import { WipeCongregationPanel } from './wipe-congregation-panel'

type WipeLogRow = {
  id: string
  congregation_id: string | null
  congregation_name: string | null
  initiated_by: string | null
  initiated_at: string | null
  total_rows_deleted: number | null
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Admin "Veszélyes zóna" tab — gyülekezeti adatok törlése.
 *
 * Jogosultság (2026-06-07b RPC-migráció óta): a `wipe_congregation_data`
 * RPC-t CSAK a fő rendszergazda (role = 'admin') futtathatja — a kerületi
 * admin kérését a szerver elutasítja. Ezért a felület a betöltéskor lekérdezi
 * a hívó szerepkörét, és nem-admin esetén a törlés-panel HELYETT egyértelmű
 * magyarázatot mutat (ne lehessen végigjárni egy garantáltan elutasuló folyamatot).
 *
 * A gyülekezet-listát az RLS szűri; a szerver-oldali RPC a scope-ot és a
 * begépelt nevet újra ellenőrzi — a kliens-oldal csak a UX-et javítja.
 *
 * Minden törlés a `data_wipe_log` táblába naplózódik — az előzmények lent,
 * a „Korábbi adattörlések” szekcióban láthatók.
 */
export function DataWipeTab() {
  const [congregations, setCongregations] = useState<Array<{ id: string; nev: string }>>([])
  const [callerRole, setCallerRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [wipes, setWipes] = useState<WipeLogRow[]>([])
  const [wipesLoading, setWipesLoading] = useState(true)

  const loadWipes = useCallback(() => {
    setWipesLoading(true)
    listRecentWipesAction(10)
      .then((res) => {
        if (res.success) setWipes(res.rows as WipeLogRow[])
        // Hiba esetén nem blokkoljuk az oldalt — az előzmény-lista üresen marad.
      })
      .catch(() => {
        /* best-effort előzmény — a fő funkciót nem akasztja meg */
      })
      .finally(() => setWipesLoading(false))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const supabase = createClient()
        // A RLS a gyülekezet-listát szűri — csak amit a user láthat
        const [{ data: userData }, congRes] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from('congregations').select('id, name, nev_hu'),
        ])

        if (congRes.error) {
          setError(congRes.error.message)
          return
        }

        // A hívó szerepköre — a wipe-RPC csak role='admin'-t enged át.
        if (userData?.user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userData.user.id)
            .maybeSingle()
          setCallerRole((prof as { role?: string } | null)?.role ?? null)
        }

        const list = (congRes.data ?? [])
          .map((c) => ({
            id: c.id as string,
            nev: (c.nev_hu as string) || (c.name as string) || '(névtelen gyülekezet)',
          }))
          .filter((c) => !!c.id && !!c.nev)
          // Kliens-oldali hu-rendezés a megjelenített néven — így a nev_hu
          // nélküli (name-fallback) gyülekezetek is betűrendben állnak.
          .sort((a, b) => a.nev.localeCompare(b.nev, 'hu'))

        setCongregations(list)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ismeretlen hiba')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    // requestAnimationFrame — a setState-t egy frame-re kitoljuk (a synchronous
    // setState-in-effect lint elkerülésére).
    const raf = requestAnimationFrame(() => {
      load()
      loadWipes()
    })
    return () => cancelAnimationFrame(raf)
  }, [load, loadWipes])

  if (loading) {
    return <AdminSkeleton rows={4} className="py-4" />
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center dark:border-rose-900 dark:bg-rose-950/30">
        <p className="font-semibold text-rose-800 dark:text-rose-200">
          Nem sikerült betölteni a gyülekezet-listát
        </p>
        <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{error}</p>
        <Button onClick={load} variant="outline" className="mt-3 gap-2">
          <RefreshCw className="size-4" />
          Újrapróbálom
        </Button>
      </div>
    )
  }

  // Ha ismerjük a szerepkört és az NEM fő rendszergazda: a törlés-panel helyett
  // egyértelmű magyarázat (a szerver-oldali RPC úgyis elutasítaná a legvégén).
  const roleKnownAndNotAdmin = callerRole !== null && callerRole !== 'admin'

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="flex items-center gap-1.5 font-semibold">
          <AlertTriangle className="size-4 shrink-0" />
          Veszélyes zóna
        </p>
        <p className="mt-1 text-xs leading-relaxed">
          Az itt található műveletek <strong>visszavonhatatlanok</strong>. Csak akkor
          használd őket, ha biztos vagy benne — pl. a teszt-fázis után, mielőtt a
          gyülekezet élesre váltana. Minden művelet naplózódik; az előzményeket a
          lenti „Korábbi adattörlések” listában látod.
        </p>
      </div>

      {roleKnownAndNotAdmin ? (
        <div className="rounded-2xl border border-border bg-muted/30 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <p className="font-heading text-base text-foreground">
                A gyülekezeti adattörlés csak a fő rendszergazdának elérhető
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                A te szerepköröddel a szerver a törlési kérést biztonsági okból
                elutasítaná, ezért a törlés-panel nem jelenik meg. Ha egy gyülekezet
                adatainak tisztítására van szükség, kérd a fő rendszergazda segítségét.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <WipeCongregationPanel congregations={congregations} onWiped={loadWipes} />
      )}

      {/* Wipe-előzmények — a data_wipe_log utolsó bejegyzései */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 font-heading text-base text-foreground">
          <History className="size-4 text-muted-foreground" />
          Korábbi adattörlések
        </h3>
        <AdminTable<WipeLogRow>
          columns={[
            { key: 'congregation', label: 'Gyülekezet' },
            { key: 'date', label: 'Időpont', hideBelow: 'sm' },
            { key: 'rows', label: 'Törölt sorok', align: 'right', className: 'tabular-nums' },
          ]}
          rows={wipes}
          rowKey={(w) => w.id}
          loading={wipesLoading}
          skeletonRows={3}
          renderCell={(w, key) => {
            if (key === 'congregation')
              return (
                <span className="font-medium text-foreground">
                  {w.congregation_name || '(ismeretlen gyülekezet)'}
                </span>
              )
            if (key === 'date') return formatDateTime(w.initiated_at)
            if (key === 'rows') return (w.total_rows_deleted ?? 0).toLocaleString('hu-HU')
            return null
          }}
          renderMobileCard={(w) => (
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="font-medium text-foreground">
                {w.congregation_name || '(ismeretlen gyülekezet)'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(w.initiated_at)} ·{' '}
                {(w.total_rows_deleted ?? 0).toLocaleString('hu-HU')} törölt sor
              </p>
            </div>
          )}
          empty={
            <AdminEmptyState
              icon={History}
              title="Még nem történt adattörlés"
              hint="Az elvégzett törlések itt jelennek meg gyülekezettel, időponttal és a törölt sorok számával."
              className="py-6"
            />
          }
        />
      </div>
    </div>
  )
}
