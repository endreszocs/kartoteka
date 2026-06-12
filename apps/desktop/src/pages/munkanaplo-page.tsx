/**
 * Munkanapló oldal — a `/munkanaplo` route.
 *
 * A lelkész napi szolgálat-nyilvántartása offline is kereshető.
 * Pull (delta / full) a Supabase-ről, LIKE-keresés a lokális cache-en.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { BookOpen, ClipboardList, Pencil, Plus, Search, Trash2 } from 'lucide-react'

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@kartoteka/ui'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { WorklogCreateDialog } from '../components/worklog-create-dialog'
import { errorMessage } from '../lib/error'
import { getDesktopUser } from '../lib/desktop-user'
import {
  deleteWorklogEntry,
  getLastPullWorklogIso,
  getLocalWorklogCount,
  getLocalWorklogOfOwnCongregation,
  pullWorklogOfOwnCongregation,
  type WorklogLocalRow,
} from '../lib/sync'

// A webes lib/constants/dashboard HU_MONTHS tükre (web-azonos feliratok).
const HU_MONTHS = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
] as const

export function MunkanaploPage() {
  const [user, setUser] = useState<User | null>(null)
  const [entries, setEntries] = useState<WorklogLocalRow[]>([])
  const [entryCount, setEntryCount] = useState<number>(0)
  const [search, setSearch] = useState('')
  // 2026-06-12 (Endre #5 munkanapló): év + hónap szűrő — a webes Munkanapló
  // oldal szűrőjének tükre. A hónap 0 értéke a teljes évet jelenti.
  const now = new Date()
  const [year, setYear] = useState<number>(now.getFullYear())
  const [monthNum, setMonthNum] = useState<number>(now.getMonth() + 1)
  const [lastPull, setLastPull] = useState<string | null>(null)
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState<string | null>(null)
  const [pullResult, setPullResult] = useState<string | null>(null)

  // M9 — create/edit dialog state + success banner + delete handling
  const [createOpen, setCreateOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<WorklogLocalRow | null>(null)
  const [createBanner, setCreateBanner] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Auth
  useEffect(() => {
    let mounted = true
    getDesktopUser().then((resolvedUser) => {
      if (mounted) setUser(resolvedUser)
    })
    return () => {
      mounted = false
    }
  }, [])

  // Közös lista-szűrő (keresés + év + hónap) — minden frissítési út ezt használja.
  const listOptions = useMemo(
    () => ({
      search: search.trim() || undefined,
      year,
      month: monthNum === 0 ? undefined : monthNum,
    }),
    [search, year, monthNum],
  )

  // Lista frissítés
  useEffect(() => {
    if (!user) return
    let mounted = true
    Promise.all([
      getLocalWorklogOfOwnCongregation(user.id, listOptions),
      getLocalWorklogCount(user.id),
      getLastPullWorklogIso(user.id),
    ])
      .then(([rows, count, iso]) => {
        if (!mounted) return
        setEntries(rows)
        setEntryCount(count)
        setLastPull(iso)
      })
      .catch(() => {
        // csendes
      })
    return () => {
      mounted = false
    }
  }, [user, listOptions])

  // M9 — edit handler: dialog megnyitása pre-filled módban
  const handleEdit = useCallback((entry: WorklogLocalRow) => {
    setEditingEntry(entry)
    setCreateOpen(true)
  }, [])

  // M9 — delete handler: confirm + soft-delete + lista frissítés
  const handleDelete = useCallback(
    async (entry: WorklogLocalRow) => {
      if (!user) return
      const title = entry.cim || '(nincs cím)'
      const datum = entry.idopont ?? 'ismeretlen dátum'
      const ok = window.confirm(
        `Biztosan törlöd a következő bejegyzést?\n\n` +
          `${datum} — ${entry.jellege ?? ''}: ${title}\n\n` +
          `A bejegyzés áthelyezésre kerül a kukába (soft-delete). ` +
          `A rendszergazda visszaállíthatja később.`,
      )
      if (!ok) return

      setDeletingId(entry.id)
      try {
        const res = await deleteWorklogEntry(user.id, entry.id, entry.revision)
        if (res.conflict) {
          setCreateBanner(
            '⚠ Konfliktus: a bejegyzés időközben megváltozott (másik eszközről vagy webről). ' +
              'A lista frissítésre került — próbáld újra.',
          )
        } else if (res.queuedToOutbox) {
          setCreateBanner(
            '✓ Törlés mentve offline — a következő online-kapcsolatnál szinkronizálódik.',
          )
        } else {
          setCreateBanner(`✓ Bejegyzés (id: ${entry.id}) törölve.`)
        }
        setTimeout(() => setCreateBanner(null), 5000)

        // Lista frissítés
        const [rows, count] = await Promise.all([
          getLocalWorklogOfOwnCongregation(user.id, listOptions),
          getLocalWorklogCount(user.id),
        ])
        setEntries(rows)
        setEntryCount(count)
      } catch (err) {
        setCreateBanner(`✗ Törlés-hiba: ${errorMessage(err)}`)
      } finally {
        setDeletingId(null)
      }
    },
    [user, listOptions],
  )

  const handlePull = useCallback(
    async (mode: 'delta' | 'full') => {
      if (!user) return
      setPulling(true)
      setPullError(null)
      setPullResult(null)
      try {
        const res = await pullWorklogOfOwnCongregation(user.id, mode)
        setLastPull(res.lastPullIso)
        if (res.mode === 'no-congregation') {
          setPullResult('Nincs gyülekezet hozzárendelve a profilhoz.')
        } else {
          const modeLabel =
            res.mode === 'delta'
              ? 'Delta'
              : res.mode === 'full-initial'
                ? 'Full (első futás)'
                : 'Full'
          setPullResult(
            res.pulledRows === 0
              ? `${modeLabel} pull: nincs új / változott bejegyzés.`
              : `${modeLabel} pull: ${res.pulledRows} bejegyzés frissítve.`,
          )
        }
        const [rows, count] = await Promise.all([
          getLocalWorklogOfOwnCongregation(user.id, listOptions),
          getLocalWorklogCount(user.id),
        ])
        setEntries(rows)
        setEntryCount(count)
      } catch (err: unknown) {
        setPullError(errorMessage(err))
      } finally {
        setPulling(false)
      }
    },
    [user, listOptions],
  )

  return (
    <DesktopShell>
      <div className="space-y-6">
        {/* Fejléc */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-500 text-white icon-raised">
              <ClipboardList className="size-6" />
            </div>
            <h1 className="font-heading text-3xl text-foreground">Munkanapló</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A lelkészi szolgálatok — istentiszteletek, látogatások, alkalmak —
              napi nyilvántartása. Offline is kereshető + szűrhető.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handlePull('delta')}
              disabled={!user || pulling}
            >
              {pulling ? 'Pull…' : 'Delta Pull'}
            </Button>
            <Button
              variant="outline"
              onClick={() => handlePull('full')}
              disabled={!user || pulling}
            >
              {pulling ? 'Pull…' : 'Full Pull'}
            </Button>
            <Button onClick={() => setCreateOpen(true)} disabled={!user}>
              <Plus className="mr-1.5 size-4" />
              Új bejegyzés
            </Button>
          </div>
        </div>

        {/* Create-success banner */}
        {createBanner && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            {createBanner}
          </div>
        )}

        {/* Pull eredmény / hiba */}
        {pullResult && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
            {pullResult}
          </div>
        )}
        {pullError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            Pull hiba: {pullError}
          </div>
        )}

        {/* Kereső + év/hónap szűrő + státusz */}
        <Card className="card-raised border-0">
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1 space-y-1">
                <Label htmlFor="worklog-search">Keresés (cím, alapige, bibliaolvasás, szolgáló, megjegyzés)</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="worklog-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                    placeholder="pl. Jn 3,16 vagy húsvét..."
                    className="pl-9"
                  />
                </div>
              </div>
              {/* 2026-06-12 (Endre #5): év + hónap szűrő — a webes szűrő tükre
                  (a hónapnál "Egész év" opcióval) */}
              <div className="space-y-1">
                <Label htmlFor="worklog-year">Év</Label>
                <select
                  id="worklog-year"
                  value={year}
                  onChange={(e) => setYear(Number(e.currentTarget.value))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {Array.from({ length: 8 }, (_, i) => now.getFullYear() - i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="worklog-month">Hónap</Label>
                <select
                  id="worklog-month"
                  value={monthNum}
                  onChange={(e) => setMonthNum(Number(e.currentTarget.value))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value={0}>Egész év</option>
                  {HU_MONTHS.map((name, i) => (
                    <option key={i + 1} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-muted-foreground">
                Utolsó pull:{' '}
                {lastPull ? <span className="font-mono">{lastPull}</span> : <em>még nem futott</em>}
              </div>
            </div>
            <div className="flex items-center gap-4 border-t border-border pt-2 text-xs text-muted-foreground">
              <span>
                Lokálisan cache-elve:{' '}
                <strong className="text-foreground">{entryCount}</strong>
              </span>
              <span>
                Listában:{' '}
                <strong className="text-foreground">{entries.length}</strong>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Bejegyzések */}
        {entries.length > 0 ? (
          <div className="space-y-3">
            {entries.map((e) => (
              <Card key={e.id} className="card-raised border-0">
                <CardHeader className="space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <CardTitle className="font-heading text-xl text-foreground">
                        {e.cim || '(nincs cím)'}
                      </CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        {e.idopont && (
                          <span className="font-mono text-muted-foreground">{e.idopont}</span>
                        )}
                        {e.jellege && (
                          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-primary">
                            {e.jellege}
                          </span>
                        )}
                        {e.du === 1 && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-700">
                            délután
                          </span>
                        )}
                        {e.szolgalt && <span className="text-muted-foreground">— {e.szolgalt}</span>}
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      {e.jelenlet_osszesen > 0 && (
                        <div className="rounded-xl border border-border bg-muted/30 px-3 py-1.5 text-center">
                          <div className="font-heading text-xl text-foreground">
                            {e.jelenlet_osszesen}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            jelenlét
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(e)}
                          disabled={deletingId === e.id}
                          title="Szerkesztés"
                          aria-label={`Bejegyzés szerkesztése: ${e.cim ?? ''}`}
                          className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-white text-slate-600 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(e)}
                          disabled={deletingId === e.id}
                          title="Törlés (kukába)"
                          aria-label={`Bejegyzés törlése: ${e.cim ?? ''}`}
                          className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-white text-slate-500 transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {(e.bibliaolvasas || e.alapige) && (
                    <div className="flex items-start gap-2">
                      <BookOpen className="mt-0.5 size-4 shrink-0 text-primary/70" />
                      <div className="flex-1 text-foreground">
                        {e.bibliaolvasas && (
                          <span className="font-medium">{e.bibliaolvasas}</span>
                        )}
                        {e.bibliaolvasas && e.alapige && (
                          <span className="text-muted-foreground"> • </span>
                        )}
                        {e.alapige && (
                          <span className="italic text-muted-foreground">
                            Alapige: {e.alapige}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {e.enekek && (
                    <p className="text-xs text-muted-foreground">
                      <strong>Énekek:</strong> {e.enekek}
                    </p>
                  )}
                  {e.megjegyzes && (
                    <p className="text-xs italic text-muted-foreground">{e.megjegyzes}</p>
                  )}
                  {(e.jelenlet_ferfi !== null ||
                    e.jelenlet_no !== null ||
                    e.jelenlet_gyermek !== null ||
                    e.persely !== null) && (
                    <div className="flex flex-wrap gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
                      {e.jelenlet_ferfi !== null && (
                        <span>
                          Férfi: <strong className="text-foreground">{e.jelenlet_ferfi}</strong>
                        </span>
                      )}
                      {e.jelenlet_no !== null && (
                        <span>
                          Nő: <strong className="text-foreground">{e.jelenlet_no}</strong>
                        </span>
                      )}
                      {e.jelenlet_gyermek !== null && (
                        <span>
                          Gyerek:{' '}
                          <strong className="text-foreground">{e.jelenlet_gyermek}</strong>
                        </span>
                      )}
                      {e.persely !== null && (
                        <span>
                          Persely: <strong className="text-foreground">{e.persely} RON</strong>
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="card-raised border-0">
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {lastPull
                  ? 'Nincs találat a jelenlegi szűrésre (év/hónap/keresés) — válts évet vagy hónapot, vagy töröld a keresést.'
                  : 'Még nincs lokálisan cache-elt munkanapló-bejegyzés. Kattints a „Full Pull" gombra az első letöltéshez.'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* M9 — create / edit dialog */}
      {user && (
        <WorklogCreateDialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open)
            // Dialog-zárás után ürítsük az editingEntry-t — a következő
            // "Új bejegyzés" kattintás így tisztán create módban nyit
            if (!open) setEditingEntry(null)
          }}
          userId={user.id}
          editEntry={editingEntry}
          onSuccess={async ({ id, queuedToOutbox, isEdit }) => {
            // Siker-banner
            if (queuedToOutbox) {
              setCreateBanner(
                isEdit
                  ? '✓ Módosítás mentve offline — a következő online-kapcsolatnál szinkronizálódik.'
                  : '✓ Új bejegyzés mentve offline — a következő online-kapcsolatnál szinkronizálódik.',
              )
            } else if (isEdit) {
              setCreateBanner(`✓ Bejegyzés (id: ${id}) frissítve.`)
            } else {
              setCreateBanner(
                id
                  ? `✓ Bejegyzés rögzítve (id: ${id}). A lista frissítésre került.`
                  : '✓ Bejegyzés rögzítve.',
              )
            }
            setTimeout(() => setCreateBanner(null), 5000)

            // Lista újratöltése a cache-ből
            const [rows, count] = await Promise.all([
              getLocalWorklogOfOwnCongregation(user.id, listOptions),
              getLocalWorklogCount(user.id),
            ])
            setEntries(rows)
            setEntryCount(count)
          }}
        />
      )}
    </DesktopShell>
  )
}
