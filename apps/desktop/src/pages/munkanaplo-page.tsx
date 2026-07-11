/**
 * Munkanapló oldal — a `/munkanaplo` route.
 *
 * A lelkész napi szolgálat-nyilvántartása offline is kereshető.
 * Pull (delta / full) a Supabase-ről, LIKE-keresés a lokális cache-en.
 *
 * 2026-07-11 (F2/W5 — webes paritás):
 *   - kategória-fülek (Szolgálat / Katekézis / Látogatás) a közös
 *     categorizeWorklogEntry szabállyal (webes tükör)
 *   - év-összkép stat-sor (alkalmak, átlagjelenlét, persely összesen) a
 *     lokális cache-ből számolva
 *   - a kártya-lista helyett TÁBLÁZATOS nézet (a webes munkanapló-táblázat
 *     oszlop-mintájára, kategória-függő oszlopokkal); sor-kattintás =
 *     szerkesztés a meglévő dialoggal
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { ClipboardList, Pencil, Plus, Search, Trash2 } from 'lucide-react'

import { Button, Card, CardContent, Input, Label } from '@kartoteka/ui'

import { DesktopShell } from '../lib/shell/desktop-shell'
import {
  NAPSZAK_SHORT_LABELS,
  WorklogCreateDialog,
  categorizeWorklogEntry,
  napszakFromRow,
  type WorklogCategory,
} from '../components/worklog-create-dialog'
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

// Offline létrehozott, még nem szinkronizált bejegyzés: ideiglenes NEGATÍV
// id-vel áll a lokális tükörben (lásd sync.ts createWorklogEntry). Szerver-id
// hiányában nem szerkeszthető / törölhető, amíg a sync le nem fut.
const isTempEntry = (e: WorklogLocalRow) => e.id < 0
const TEMP_ENTRY_HINT = 'Szinkronizálás után szerkeszthető / törölhető.'

// Kategória-fülek — a webes hármassal azonos szűrés (categorizeWorklogEntry).
const CATEGORY_TABS: { value: WorklogCategory; label: string }[] = [
  { value: 'szolgalat', label: 'Szolgálat' },
  { value: 'katekezis', label: 'Katekézis' },
  { value: 'latogatas', label: 'Látogatás' },
]

/** F/N/Gy cella: '2/3/1' — ha egyik mező sincs kitöltve, '—'. */
function formatJelenlet(e: WorklogLocalRow): string {
  if (e.jelenlet_ferfi === null && e.jelenlet_no === null && e.jelenlet_gyermek === null) {
    return '—'
  }
  return `${e.jelenlet_ferfi ?? 0}/${e.jelenlet_no ?? 0}/${e.jelenlet_gyermek ?? 0}`
}

/** ÚvT/ÚvB cella: '12/3' — ha egyik sincs kitöltve, '—'. */
function formatUrvacsora(e: WorklogLocalRow): string {
  if (e.uv_templomban == null && e.uv_betegnel == null) return '—'
  return `${e.uv_templomban ?? 0}/${e.uv_betegnel ?? 0}`
}

export function MunkanaploPage() {
  const [user, setUser] = useState<User | null>(null)
  const [entries, setEntries] = useState<WorklogLocalRow[]>([])
  // Év-összkép: a kiválasztott ÉV összes bejegyzése (hónap/keresés nélkül) —
  // a stat-sor ebből számol, a lokális cache-ből.
  const [yearEntries, setYearEntries] = useState<WorklogLocalRow[]>([])
  const [entryCount, setEntryCount] = useState<number>(0)
  const [search, setSearch] = useState('')
  // A lekérdezésekhez használt, 250 ms-os debounce-szal frissülő keresőérték —
  // az input azonnali marad, de nem fut 3 SQLite-lekérdezés minden leütésre.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // 2026-06-12 (Endre #5 munkanapló): év + hónap szűrő — a webes Munkanapló
  // oldal szűrőjének tükre. A hónap 0 értéke a teljes évet jelenti.
  const now = new Date()
  const [year, setYear] = useState<number>(now.getFullYear())
  const [monthNum, setMonthNum] = useState<number>(now.getMonth() + 1)
  // 2026-07-11 (F2/W5): kategória-fül — a webes fülek tükre.
  const [activeCategory, setActiveCategory] = useState<WorklogCategory>('szolgalat')
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

  // Kereső-debounce: 250 ms tétlenség után frissül a lekérdezési érték.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  // Közös lista-szűrő (keresés + év + hónap) — minden frissítési út ezt használja.
  const listOptions = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      year,
      month: monthNum === 0 ? undefined : monthNum,
    }),
    [debouncedSearch, year, monthNum],
  )

  // Közös lista-frissítő: szűrt lista + év-összkép + darabszám a cache-ből.
  const refreshLists = useCallback(async () => {
    if (!user) return
    const [rows, yearRows, count] = await Promise.all([
      getLocalWorklogOfOwnCongregation(user.id, listOptions),
      // Év-összkép: a teljes év, magas limittel (a default 200 kevés lehet)
      getLocalWorklogOfOwnCongregation(user.id, { year, limit: 5000 }),
      getLocalWorklogCount(user.id),
    ])
    setEntries(rows)
    setYearEntries(yearRows)
    setEntryCount(count)
  }, [user, listOptions, year])

  // Lista frissítés (+ utolsó pull-idő)
  useEffect(() => {
    if (!user) return
    let mounted = true
    Promise.all([refreshLists(), getLastPullWorklogIso(user.id)])
      .then(([, iso]) => {
        if (mounted) setLastPull(iso)
      })
      .catch(() => {
        // csendes
      })
    return () => {
      mounted = false
    }
  }, [user, refreshLists])

  // M9 — edit handler: dialog megnyitása pre-filled módban
  const handleEdit = useCallback((entry: WorklogLocalRow) => {
    if (isTempEntry(entry)) return // temp sor: sync-ig nem szerkeszthető
    setEditingEntry(entry)
    setCreateOpen(true)
  }, [])

  // M9 — delete handler: confirm + soft-delete + lista frissítés
  const handleDelete = useCallback(
    async (entry: WorklogLocalRow) => {
      if (!user) return
      if (isTempEntry(entry)) return // temp sor: sync-ig nem törölhető
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
        if (res.error) {
          setCreateBanner(`⚠ ${res.error}`)
        } else if (res.conflict) {
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

        await refreshLists()
      } catch (err) {
        setCreateBanner(`✗ Törlés-hiba: ${errorMessage(err)}`)
      } finally {
        setDeletingId(null)
      }
    },
    [user, refreshLists],
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
        await refreshLists()
      } catch (err: unknown) {
        setPullError(errorMessage(err))
      } finally {
        setPulling(false)
      }
    },
    [user, refreshLists],
  )

  // Kategória-szűrt lista + fülönkénti darabszám (a webes fülek tükre).
  const filtered = useMemo(
    () => entries.filter((e) => categorizeWorklogEntry(e) === activeCategory),
    [entries, activeCategory],
  )
  const categoryCounts = useMemo(() => {
    const counts: Record<WorklogCategory, number> = { szolgalat: 0, katekezis: 0, latogatas: 0 }
    for (const e of entries) counts[categorizeWorklogEntry(e)] += 1
    return counts
  }, [entries])

  // Év-összkép stat-sor: alkalmak + átlagjelenlét + persely összesen — a
  // teljes év lokális cache-éből (a webes "Lelkészi jelentés" fül számai).
  const yearStats = useMemo(() => {
    const alkalmak = yearEntries.length
    // Átlagjelenlét — webes paritás (WorklogOverview): CSAK a szolgálat-
    // kategóriájú alkalmak jelenléte számít (számláló ÉS nevező is), egészre
    // kerekítve.
    const szolgalatEntries = yearEntries.filter((e) => categorizeWorklogEntry(e) === 'szolgalat')
    const attendanceSum = szolgalatEntries.reduce(
      (sum, e) => sum + (e.jelenlet_ferfi ?? 0) + (e.jelenlet_no ?? 0) + (e.jelenlet_gyermek ?? 0),
      0,
    )
    const totalOffering = yearEntries.reduce((sum, e) => sum + Number(e.persely ?? 0), 0)
    const avgAttendance =
      szolgalatEntries.length > 0 ? Math.round(attendanceSum / szolgalatEntries.length) : 0
    return { alkalmak, avgAttendance, totalOffering }
  }, [yearEntries])

  // Kategória-függő oszlopok (a webes táblázat-minta bővítése):
  //   szolgalat: minden oszlop; katekezis: nincs napszak/biblia/úrvacsora;
  //   latogatas: mint a katekezis, de persely sincs.
  const showSzolgalatCols = activeCategory === 'szolgalat'
  const showPersely = activeCategory !== 'latogatas'

  return (
    <DesktopShell>
      <div className="space-y-6">
        {/* Fejléc */}
        <div className="flex flex-wrap items-end justify-between gap-4">
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
          <div className="flex flex-wrap gap-2">
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

        {/* Create-success / törlés banner */}
        {createBanner && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
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

        {/* 2026-07-11 (F2/W5): év-összkép stat-sor a lokális cache-ből */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="card-raised border-0">
            <CardContent className="pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Alkalmak · {year}
              </p>
              <p className="mt-1 font-heading text-3xl text-foreground">{yearStats.alkalmak}</p>
            </CardContent>
          </Card>
          <Card className="card-raised border-0">
            <CardContent className="pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Átlagjelenlét · {year}
              </p>
              <p className="mt-1 font-heading text-3xl text-foreground">
                {yearStats.avgAttendance}
                <span className="ml-1 text-sm font-normal text-muted-foreground">fő</span>
              </p>
            </CardContent>
          </Card>
          <Card className="card-raised border-0">
            <CardContent className="pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Persely összesen · {year}
              </p>
              <p className="mt-1 font-heading text-3xl text-foreground">
                {yearStats.totalOffering.toLocaleString('hu-HU', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                <span className="ml-1 text-sm font-normal text-muted-foreground">RON</span>
              </p>
            </CardContent>
          </Card>
        </div>

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
            <div className="flex flex-wrap items-center gap-4 border-t border-border pt-2 text-xs text-muted-foreground">
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

        {/* 2026-07-11 (F2/W5): kategória-fülek — a webes hármas tükre */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Munkanapló kategóriák">
          {CATEGORY_TABS.map((tab) => {
            const active = activeCategory === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveCategory(tab.value)}
                className={
                  active
                    ? 'inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground'
                    : 'inline-flex items-center gap-1.5 rounded-full border border-input bg-background px-4 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground'
                }
              >
                {tab.label}
                <span
                  className={
                    active
                      ? 'rounded-full bg-primary-foreground/20 px-1.5 text-xs'
                      : 'rounded-full bg-muted px-1.5 text-xs'
                  }
                >
                  {categoryCounts[tab.value]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Bejegyzések — táblázatos nézet (webes oszlop-minta, kategória-függő) */}
        {filtered.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-background">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dátum</th>
                  <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Jelleg</th>
                  {showSzolgalatCols && (
                    <>
                      <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Napszak</th>
                      <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bibliaolvasás</th>
                      <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Alapige</th>
                      <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Énekek</th>
                    </>
                  )}
                  <th
                    className="p-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    title="Jelenlét: férfi / nő / gyermek"
                  >
                    F/N/Gy
                  </th>
                  {showSzolgalatCols && (
                    <th
                      className="p-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                      title="Úrvacsorázók: templomban / betegnél"
                    >
                      ÚvT/ÚvB
                    </th>
                  )}
                  <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Szolgálattevő</th>
                  {showPersely && (
                    <th className="p-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Persely</th>
                  )}
                  <th className="w-20 p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => {
                  const temp = isTempEntry(e)
                  // Jelleg-cella 2. sora: látogatásnál cím híján a megjegyzés
                  // — így a látogatás lényegi tartalma is látszik a listában.
                  const jellegSub =
                    activeCategory === 'latogatas' ? e.cim || e.megjegyzes : e.cim
                  return (
                    <tr
                      key={e.id}
                      onClick={() => handleEdit(e)}
                      title={temp ? TEMP_ENTRY_HINT : 'Kattints a szerkesztéshez'}
                      className={
                        temp
                          ? 'bg-muted/20'
                          : 'cursor-pointer transition-colors hover:bg-muted/40'
                      }
                    >
                      <td className="whitespace-nowrap p-3 font-mono text-xs text-muted-foreground">
                        {e.idopont ?? '—'}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-foreground">{e.jellege ?? '—'}</span>
                          {temp && (
                            <span
                              title={TEMP_ENTRY_HINT}
                              className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                            >
                              szinkronizálásra vár
                            </span>
                          )}
                        </div>
                        {jellegSub && (
                          <div
                            title={jellegSub}
                            className="mt-0.5 max-w-[28rem] truncate text-xs text-muted-foreground"
                          >
                            {jellegSub}
                          </div>
                        )}
                      </td>
                      {showSzolgalatCols && (
                        <>
                          <td className="whitespace-nowrap p-3 text-muted-foreground">
                            {NAPSZAK_SHORT_LABELS[napszakFromRow(e)]}
                          </td>
                          <td className="p-3 text-muted-foreground">{e.bibliaolvasas || '—'}</td>
                          <td className="p-3 text-foreground">{e.alapige || '—'}</td>
                          <td className="p-3 text-muted-foreground">{e.enekek || '—'}</td>
                        </>
                      )}
                      <td className="whitespace-nowrap p-3 text-muted-foreground">
                        {formatJelenlet(e)}
                        {e.jelenlet_osszesen > 0 && (
                          <span className="ml-1 text-xs">({e.jelenlet_osszesen})</span>
                        )}
                      </td>
                      {showSzolgalatCols && (
                        <td className="whitespace-nowrap p-3 text-muted-foreground">
                          {formatUrvacsora(e)}
                        </td>
                      )}
                      <td className="p-3 text-muted-foreground">{e.szolgalt || '—'}</td>
                      {showPersely && (
                        <td className="whitespace-nowrap p-3 text-right font-medium text-foreground">
                          {e.persely !== null ? `${Number(e.persely).toFixed(2)} RON` : '—'}
                        </td>
                      )}
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation()
                              handleEdit(e)
                            }}
                            disabled={deletingId === e.id || temp}
                            title={temp ? TEMP_ENTRY_HINT : 'Szerkesztés'}
                            aria-label={`Bejegyzés szerkesztése: ${e.cim ?? e.jellege ?? ''}`}
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation()
                              void handleDelete(e)
                            }}
                            disabled={deletingId === e.id || temp}
                            title={temp ? TEMP_ENTRY_HINT : 'Törlés (kukába)'}
                            aria-label={`Bejegyzés törlése: ${e.cim ?? e.jellege ?? ''}`}
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Card className="card-raised border-0">
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {lastPull
                  ? entries.length > 0
                    ? 'Ebben a kategóriában nincs bejegyzés a jelenlegi szűrésre — válts fület, évet vagy hónapot.'
                    : 'Nincs találat a jelenlegi szűrésre (év/hónap/keresés) — válts évet vagy hónapot, vagy töröld a keresést.'
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
            await refreshLists()
          }}
        />
      )}
    </DesktopShell>
  )
}
