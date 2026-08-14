'use client'

/**
 * Iktató F6 — Iratcsomó-panel (K5).
 *
 * Az iktatott iratok évenkénti fizikai/logikai csomókba (dossziékba)
 * rendezése:
 *  - csomó-lista a kiválasztott évre (irat-darabszámmal),
 *  - új csomó / átnevezés / lezárás-feloldás / törlés (csak üres csomó),
 *  - csomó kiválasztása → a benne lévő iratok listája + iratok
 *    hozzárendelése a csomó nélküli iratok közül,
 *  - „Leltár nyomtatása": A4 leltár-nyomtatvány élő (fit-to-width)
 *    előnézettel, „egyben" vagy „ügykör szerint csoportosítva" módban,
 *    PDF-mentéssel és direkt nyomtatással (print-engine-v2).
 *
 * Token-stílus + mobile-first: telefonon egyoszlopos, md-től kétoszlopos
 * (csomó-lista balra, kiválasztott csomó jobbra).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FolderArchive,
  FolderPlus,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Printer,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FILING_DIRECTION_LABELS } from '@/lib/constants/filing'
import type { FilingDirection } from '@/lib/constants/filing'
import { FILING_UGYKOROK_MAP } from '@/lib/constants/filing-ugykorjegyzek'
import type {
  FilingEntryWithCsomo,
  Iratcsomo,
  IratcsomoWithCount,
} from '@/lib/iktato/csomo-types'
import {
  assignEntryToCsomo,
  deleteIratcsomo,
  getCsomoEntries,
  listIratcsomok,
  saveIratcsomo,
  setIratcsomoLezarva,
} from '@/app/(dashboard)/iktato/csomo-actions'
import { getFilingEntries } from '@/app/(dashboard)/iktato/actions'
import { getCongregationHeader } from '@/app/(dashboard)/iktato/szemely-actions'
import { iratKepekBeagyazva, type IratKepek } from '@/lib/iktato/irat-kepek'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

export interface IratcsomoPanelProps {
  /** Az iktató-nézetben kiválasztott év — a csomók erre az évre szűrve. */
  year: number
  /** A gyülekezet neve a leltár-nyomtatvány fejlécéhez. */
  congregationName?: string
  /** Értesítés a szülőnek, ha a csomó-hozzárendelések változtak (irat-lista frissítéshez). */
  onChanged?: () => void
}

export function IratcsomoPanel({ year, congregationName, onChanged }: IratcsomoPanelProps) {
  // ── Csomó-lista ──────────────────────────────────────────────
  const [csomok, setCsomok] = useState<IratcsomoWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(
    () => csomok.find((c) => c.id === selectedId) ?? null,
    [csomok, selectedId],
  )

  const loadCsomok = useCallback(async () => {
    setLoading(true)
    const { csomok: data, error } = await listIratcsomok(year)
    if (error) toast.error(error)
    setCsomok(data)
    // Ha a kiválasztott csomó időközben eltűnt (törölték), engedjük el
    setSelectedId((prev) => (prev && data.some((c) => c.id === prev) ? prev : null))
    setLoading(false)
  }, [year])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void loadCsomok()
    })
    return () => {
      cancelled = true
    }
  }, [loadCsomok])

  // ── A kiválasztott csomó iratai ──────────────────────────────
  const [entries, setEntries] = useState<FilingEntryWithCsomo[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)

  const loadEntries = useCallback(async (csomoId: string) => {
    setEntriesLoading(true)
    const { entries: data, error } = await getCsomoEntries(csomoId)
    if (error) toast.error(error)
    setEntries(data)
    setEntriesLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (!selectedId) {
        setEntries([])
        return
      }
      void loadEntries(selectedId)
    })
    return () => {
      cancelled = true
    }
  }, [selectedId, loadEntries])

  // ── Új csomó / átnevezés dialógus ────────────────────────────
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Iratcsomo | null>(null)
  const [fNev, setFNev] = useState('')
  const [fLeiras, setFLeiras] = useState('')
  const [saving, setSaving] = useState(false)

  function openCreate() {
    setEditing(null)
    setFNev('')
    setFLeiras('')
    setFormOpen(true)
  }

  function openRename(csomo: Iratcsomo) {
    setEditing(csomo)
    setFNev(csomo.nev)
    setFLeiras(csomo.leiras || '')
    setFormOpen(true)
  }

  // Mentés type="button"+onClick-kel — NE Enter/submit útján (v0.9.70 tanulság)
  async function handleSave() {
    if (!fNev.trim()) {
      toast.error('A csomó neve nem lehet üres.')
      return
    }
    setSaving(true)
    const { csomo, error } = await saveIratcsomo({
      id: editing?.id,
      ev: year,
      nev: fNev,
      leiras: fLeiras || null,
    })
    setSaving(false)
    if (error || !csomo) {
      toast.error(error || 'A csomó mentése sikertelen.')
      return
    }
    toast.success(editing ? 'A csomó adatai frissültek.' : `Új iratcsomó létrehozva: ${csomo.nev}`)
    setFormOpen(false)
    if (!editing) setSelectedId(csomo.id)
    void loadCsomok()
  }

  // ── Lezárás / feloldás ───────────────────────────────────────
  const [togglingId, setTogglingId] = useState<string | null>(null)
  async function handleToggleLezarva(csomo: IratcsomoWithCount) {
    setTogglingId(csomo.id)
    const { error } = await setIratcsomoLezarva(csomo.id, !csomo.lezarva)
    setTogglingId(null)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(csomo.lezarva ? 'A csomó feloldva — újra rendezhetsz bele iratot.' : 'A csomó lezárva.')
    void loadCsomok()
  }

  // ── Törlés (csak üres csomó) ─────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null)
  async function handleDelete(csomo: IratcsomoWithCount) {
    if (!window.confirm(`Biztosan törlöd a(z) „${csomo.nev}" iratcsomót? Az iratok nem vesznek el.`)) return
    setDeletingId(csomo.id)
    const { error } = await deleteIratcsomo(csomo.id)
    setDeletingId(null)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('Az iratcsomó törölve.')
    void loadCsomok()
  }

  // ── Irat kivétele a csomóból ─────────────────────────────────
  const [removingEntryId, setRemovingEntryId] = useState<string | null>(null)
  async function handleRemoveEntry(entryId: string) {
    setRemovingEntryId(entryId)
    const { error } = await assignEntryToCsomo(entryId, null)
    setRemovingEntryId(null)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('Az irat kikerült a csomóból.')
    if (selectedId) void loadEntries(selectedId)
    void loadCsomok()
    onChanged?.()
  }

  // ── Iratok hozzárendelése (csomó nélküli iratok az évből) ────
  const [assignOpen, setAssignOpen] = useState(false)
  const [unassigned, setUnassigned] = useState<FilingEntryWithCsomo[]>([])
  const [unassignedLoading, setUnassignedLoading] = useState(false)
  const [assignFilter, setAssignFilter] = useState('')
  const [assigningId, setAssigningId] = useState<string | null>(null)

  async function openAssign() {
    setAssignOpen(true)
    setUnassignedLoading(true)
    // Az év ÖSSZES irata — kliens-oldalon szűrünk a csomó nélküliekre.
    // (A csomo_id csak az F6-migráció után létezik; addig minden irat
    // „csomó nélkülinek" látszik, a hozzárendelés pedig hangos hibát ad.)
    const all = (await getFilingEntries(year, 'all')) as FilingEntryWithCsomo[]
    setUnassigned(all.filter((e) => !e.csomo_id))
    setUnassignedLoading(false)
  }

  const filteredUnassigned = useMemo(() => {
    if (!assignFilter.trim()) return unassigned
    const q = assignFilter.toLowerCase()
    return unassigned.filter((e) =>
      [`${e.year}/${e.sequence_number}`, e.subject, e.sender_or_recipient, e.ugykor_kod]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [unassigned, assignFilter])

  async function handleAssign(entryId: string) {
    if (!selectedId) return
    setAssigningId(entryId)
    const { error } = await assignEntryToCsomo(entryId, selectedId)
    setAssigningId(null)
    if (error) {
      toast.error(error)
      return
    }
    setUnassigned((prev) => prev.filter((e) => e.id !== entryId))
    if (selectedId) void loadEntries(selectedId)
    void loadCsomok()
    onChanged?.()
  }

  // ── Leltár-nyomtatás ─────────────────────────────────────────
  const [printOpen, setPrintOpen] = useState(false)

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Fejléc */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderArchive className="size-4" aria-hidden />
          </div>
          <div>
            <h3 className="font-heading text-base font-semibold text-foreground sm:text-lg">
              Iratcsomók
            </h3>
            <p className="text-xs text-muted-foreground">
              {year}. évi dossziék — az iratok fizikai rendezéséhez
            </p>
          </div>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus data-icon="inline-start" aria-hidden />
          Új csomó
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Iratcsomók betöltése…
        </div>
      ) : csomok.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <FolderPlus className="size-6" aria-hidden />
          </div>
          <p className="mt-3 font-heading text-base text-foreground">
            {year}. évben még nincs iratcsomó
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            A csomó egy fizikai dossziénak felel meg — hozz létre egyet, majd rendezd
            bele az iktatott iratokat. A leltár egy gombbal nyomtatható.
          </p>
          <Button type="button" className="mt-4" onClick={openCreate}>
            <Plus data-icon="inline-start" aria-hidden />
            Első csomó létrehozása
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-[280px_minmax(0,1fr)] sm:gap-4">
          {/* ── Bal: csomó-lista ── */}
          <div className="space-y-2">
            {csomok.map((csomo) => {
              const active = csomo.id === selectedId
              return (
                <button
                  key={csomo.id}
                  type="button"
                  onClick={() => setSelectedId(active ? null : csomo.id)}
                  aria-pressed={active}
                  className={cn(
                    'w-full rounded-2xl border p-3 text-left transition',
                    active
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-card hover:bg-muted/50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {csomo.nev}
                    </p>
                    {csomo.lezarva ? (
                      <Badge variant="secondary" className="shrink-0">
                        <Lock aria-hidden />
                        Lezárva
                      </Badge>
                    ) : null}
                  </div>
                  {csomo.leiras ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{csomo.leiras}</p>
                  ) : null}
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {csomo.iratSzam} irat
                  </p>
                </button>
              )
            })}
          </div>

          {/* ── Jobb: kiválasztott csomó ── */}
          <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
            {!selected ? (
              <div className="flex h-full min-h-32 flex-col items-center justify-center text-center">
                <p className="text-sm text-muted-foreground">
                  Válassz egy csomót a listából — itt jelennek meg a benne lévő iratok.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Csomó-fejléc + műveletek */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-heading text-base font-semibold text-foreground">
                      {selected.nev}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {selected.ev}. év · {selected.iratSzam} irat
                      {selected.lezarva ? ' · lezárva' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openRename(selected)}
                    >
                      <Pencil data-icon="inline-start" aria-hidden />
                      Átnevezés
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={togglingId === selected.id}
                      onClick={() => void handleToggleLezarva(selected)}
                    >
                      {selected.lezarva ? (
                        <LockOpen data-icon="inline-start" aria-hidden />
                      ) : (
                        <Lock data-icon="inline-start" aria-hidden />
                      )}
                      {selected.lezarva ? 'Feloldás' : 'Lezárás'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={entries.length === 0}
                      onClick={() => setPrintOpen(true)}
                    >
                      <Printer data-icon="inline-start" aria-hidden />
                      Leltár nyomtatása
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      // Lezárt csomó nem törölhető (a deleteIratcsomo guardjának tükrözése)
                      disabled={deletingId === selected.id || selected.lezarva}
                      onClick={() => void handleDelete(selected)}
                      title={
                        selected.lezarva
                          ? 'A csomó lezárva — törléséhez előbb old fel.'
                          : selected.iratSzam > 0
                            ? 'Csak üres csomó törölhető — előbb vedd ki az iratokat.'
                            : 'Csomó törlése'
                      }
                    >
                      <Trash2 data-icon="inline-start" aria-hidden />
                      Törlés
                    </Button>
                  </div>
                </div>

                {/* A csomó iratai */}
                {entriesLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Iratok betöltése…
                  </div>
                ) : entries.length === 0 ? (
                  <p className="rounded-xl bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
                    Ez a csomó még üres — rendezz bele iratokat az alábbi gombbal.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {entries.map((entry) => (
                      <li key={entry.id} className="flex items-center gap-2 px-3 py-2">
                        <EntryRow entry={entry} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0"
                          aria-label={`${entry.year}/${entry.sequence_number} kivétele a csomóból`}
                          title={
                            selected.lezarva
                              ? 'A csomó lezárva — az irat kivételéhez előbb old fel.'
                              : 'Kivétel a csomóból'
                          }
                          // Lezárt csomóból kivenni sem lehet (a szerver-oldali
                          // guard tükrözése — assignEntryToCsomo)
                          disabled={removingEntryId === entry.id || selected.lezarva}
                          onClick={() => void handleRemoveEntry(entry.id)}
                        >
                          {removingEntryId === entry.id ? (
                            <Loader2 className="animate-spin" aria-hidden />
                          ) : (
                            <X aria-hidden />
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Iratok hozzárendelése */}
                {selected.lezarva ? (
                  <p className="text-xs text-muted-foreground">
                    A csomó lezárva — új irat rendezéséhez előbb old fel.
                  </p>
                ) : !assignOpen ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void openAssign()}>
                    <Plus data-icon="inline-start" aria-hidden />
                    Iratok hozzárendelése
                  </Button>
                ) : (
                  <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Csomó nélküli iratok — {year}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Hozzárendelő bezárása"
                        onClick={() => setAssignOpen(false)}
                      >
                        <X aria-hidden />
                      </Button>
                    </div>
                    <Input
                      value={assignFilter}
                      onChange={(e) => setAssignFilter(e.target.value)}
                      placeholder="Szűrés iktatószámra, tárgyra…"
                    />
                    {unassignedLoading ? (
                      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Betöltés…
                      </div>
                    ) : filteredUnassigned.length === 0 ? (
                      <p className="py-2 text-sm text-muted-foreground">
                        {unassigned.length === 0
                          ? 'Minden idei irat csomóban van — nincs mit hozzárendelni.'
                          : 'Nincs a szűrésnek megfelelő irat.'}
                      </p>
                    ) : (
                      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                        {filteredUnassigned.map((entry) => (
                          <li key={entry.id} className="flex items-center gap-2 px-3 py-2">
                            <EntryRow entry={entry} />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              disabled={assigningId === entry.id}
                              onClick={() => void handleAssign(entry.id)}
                            >
                              {assigningId === entry.id ? (
                                <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
                              ) : (
                                <Plus data-icon="inline-start" aria-hidden />
                              )}
                              Ide
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Új csomó / átnevezés dialógus ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Csomó átnevezése' : `Új iratcsomó — ${year}`}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'A név és a leírás módosítható — az iratok nem változnak.'
                : 'A csomó egy fizikai dossziénak felel meg (pl. „Esperesi levelezés").'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="csomo-nev">
                Csomó neve <span className="text-destructive">*</span>
              </Label>
              <Input
                id="csomo-nev"
                value={fNev}
                onChange={(e) => setFNev(e.target.value)}
                placeholder="pl. Esperesi levelezés"
                maxLength={120}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="csomo-leiras">Leírás (opcionális)</Label>
              <textarea
                id="csomo-leiras"
                rows={3}
                value={fLeiras}
                onChange={(e) => setFLeiras(e.target.value)}
                placeholder="pl. Az egyházmegyétől érkezett körlevelek és válaszaik"
                disabled={saving}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
                Mégse
              </Button>
              {/* type=button + onClick — nincs véletlen Enter-mentés (v0.9.70) */}
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
                    Mentés…
                  </>
                ) : editing ? (
                  'Mentés'
                ) : (
                  'Létrehozás'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Leltár-nyomtatás dialógus ── */}
      {selected ? (
        <CsomoLeltarDialog
          open={printOpen}
          onOpenChange={setPrintOpen}
          csomo={selected}
          entries={entries}
          congregationName={congregationName || 'Egyházközség'}
        />
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Irat-sor (csomó-nézet + hozzárendelő) — mobile-first, táblázat nélkül
// ─────────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: FilingEntryWithCsomo }) {
  const directionLabel =
    FILING_DIRECTION_LABELS[entry.direction as FilingDirection] ?? entry.direction
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {entry.year}/{entry.sequence_number}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {entry.kelt?.split('T')[0] || '—'}
        </span>
        <Badge variant="outline">{directionLabel}</Badge>
        {entry.ugykor_kod ? <Badge variant="ghost">{entry.ugykor_kod}</Badge> : null}
      </div>
      <p className="mt-0.5 truncate text-sm text-foreground">{entry.subject}</p>
      {entry.sender_or_recipient ? (
        <p className="truncate text-xs text-muted-foreground">{entry.sender_or_recipient}</p>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Leltár-nyomtatás dialógus — fit-to-width A4 előnézet
// (a worklog-print-dialog ResizeObserver+scale mintája szerint)
// ─────────────────────────────────────────────────────────────────

const A4_PORTRAIT_W = 812 // 210mm ≈ 794px (96 dpi) + ráhagyás
const PREVIEW_MIN_H = 820

type LeltarMode = 'egyben' | 'ugykor'

function CsomoLeltarDialog({
  open,
  onOpenChange,
  csomo,
  entries,
  congregationName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  csomo: Iratcsomo
  entries: FilingEntryWithCsomo[]
  congregationName: string
}) {
  const [mode, setMode] = useState<LeltarMode>('egyben')
  const [printing, setPrinting] = useState(false)
  const [savingPdf, setSavingPdf] = useState(false)

  // 24. pont: pecsét + aláírás kép a leltár-nyomtatványra — az ablak
  // megnyitásakor töltjük be, data: URI-ként beágyazva (irat-kepek helper):
  // az élő előnézet-iframe minden mód-váltásnál teljes srcDoc-újratöltést
  // kap, a PDF-mentés (html2canvas) pedig a más-originű képet CORS miatt
  // kihagyhatná. Hibánál némán kép nélkül készül a leltár (mai forma).
  const [iratKepek, setIratKepek] = useState<IratKepek>({ pecsetUrl: null, alairasUrl: null })
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const res = await getCongregationHeader()
        if (cancelled || res.error || !res.header) return
        const kepek = await iratKepekBeagyazva({
          pecsetUrl: res.header.pecsetUrl,
          alairasUrl: res.header.alairasUrl,
        })
        if (!cancelled) setIratKepek(kepek)
      } catch {
        // Néma: a leltár kép nélkül is teljes értékű.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const html = useMemo(
    () =>
      buildCsomoLeltarHtml({
        congregationName,
        csomo,
        entries,
        grouped: mode === 'ugykor',
        pecsetKepUrl: iratKepek.pecsetUrl,
        alairasKepUrl: iratKepek.alairasUrl,
      }),
    [congregationName, csomo, entries, mode, iratKepek],
  )

  // Fit-to-width előnézet: a konténer szélességét mérjük, a lapot arányosan
  // kicsinyítjük — telefonon is a teljes A4 látszik, vízszintes görgetés nélkül.
  const previewRef = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(0)
  useEffect(() => {
    if (!open) return
    const el = previewRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((obsEntries) => {
      const w = obsEntries[0]?.contentRect.width ?? 0
      if (w > 0) setBoxW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [contentH, setContentH] = useState(PREVIEW_MIN_H)
  const measurePreview = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    // Viewport-FÜGGETLEN mérés (a certificate-issue-dialog mintája): a
    // documentElement.scrollHeight sosem kisebb az iframe aktuális
    // magasságánál (= contentH), így azzal a magasság csak nőni tudott volna
    // („racsni") — az „Ügykör szerint" → „Egyben" váltás után üres lap-szakasz
    // maradt volna az előnézetben.
    const h = Math.ceil(doc.body?.getBoundingClientRect().height || 0)
    setContentH(Math.max(h, PREVIEW_MIN_H))
  }

  const targetW = boxW > 0 ? Math.max(0, boxW - 24) : A4_PORTRAIT_W
  const scale = Math.min(1, targetW / A4_PORTRAIT_W)
  const scaledW = Math.round(A4_PORTRAIT_W * scale)
  const scaledH = Math.round(contentH * scale)

  async function handlePdf() {
    setSavingPdf(true)
    try {
      await printToPdf(html, leltarFilename(csomo), {
        orientation: 'portrait',
        // WYSIWYG: a lap-margót a dokumentum saját paddingje adja
        margin: [0, 0],
        format: 'a4',
      })
      toast.success('A leltár PDF elkészült.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A PDF mentése nem sikerült.')
    } finally {
      setSavingPdf(false)
    }
  }

  async function handlePrint() {
    setPrinting(true)
    try {
      await printToBrowser(html)
      toast.success('A böngésző nyomtatási előnézete megnyílt.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A nyomtatás indítása nem sikerült.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle>Iratcsomó-leltár — {csomo.nev}</DialogTitle>
          <DialogDescription>
            {csomo.ev}. év · {entries.length} irat — A4 nyomtatvány élő előnézettel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pb-2">
          {/* Mód-választó + műveletek */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5" role="group" aria-label="Leltár rendezési módja">
              <Button
                type="button"
                variant={mode === 'egyben' ? 'default' : 'outline'}
                size="sm"
                aria-pressed={mode === 'egyben'}
                onClick={() => setMode('egyben')}
              >
                Egyben
              </Button>
              <Button
                type="button"
                variant={mode === 'ugykor' ? 'default' : 'outline'}
                size="sm"
                aria-pressed={mode === 'ugykor'}
                onClick={() => setMode('ugykor')}
              >
                Ügykör szerint csoportosítva
              </Button>
            </div>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handlePrint()}
                disabled={printing}
              >
                <Printer data-icon="inline-start" aria-hidden />
                {printing ? 'Nyomtatás…' : 'Nyomtatás'}
              </Button>
              <Button type="button" size="sm" onClick={() => void handlePdf()} disabled={savingPdf}>
                {savingPdf ? 'PDF készül…' : 'PDF-be mentés'}
              </Button>
            </div>
          </div>

          {/* Fit-to-width A4 előnézet */}
          <div
            ref={previewRef}
            className="max-h-[68dvh] min-h-[280px] overflow-y-auto rounded-2xl border border-border bg-muted/50 p-3"
          >
            <div
              className="mx-auto overflow-hidden rounded-lg border border-border bg-white shadow-sm"
              style={{ width: scaledW, height: scaledH }}
            >
              <iframe
                ref={iframeRef}
                onLoad={measurePreview}
                title={`Iratcsomó-leltár — ${csomo.nev}`}
                srcDoc={html}
                style={{
                  width: A4_PORTRAIT_W,
                  height: contentH,
                  border: '0',
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  background: '#fff',
                }}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────
// Leltár-HTML építő — önhordó A4 dokumentum (print-engine-v2 kompatibilis)
// ─────────────────────────────────────────────────────────────────

function escapeHtml(s: string | null | undefined): string {
  return (s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function fmtDateHu(s: string | null | undefined): string {
  const d = (s || '').split('T')[0]
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return y && m && day ? `${y}. ${m}. ${day}.` : d
}

function leltarFilename(csomo: Iratcsomo): string {
  const slug =
    csomo.nev
      .toLowerCase()
      .normalize('NFD')
      // Kombináló ékezet-jelek eltávolítása (á→a, ő→o, …) a fájlnévhez
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'csomo'
  return `iratcsomo-leltar-${csomo.ev}-${slug}.pdf`
}

function leltarRows(entries: FilingEntryWithCsomo[]): string {
  return entries
    .map((e) => {
      const directionLabel =
        FILING_DIRECTION_LABELS[e.direction as FilingDirection] ?? e.direction
      return `<tr>
        <td class="num">${e.year}/${e.sequence_number}</td>
        <td class="num">${fmtDateHu(e.kelt)}</td>
        <td>${escapeHtml(e.subject)}${e.sender_or_recipient ? `<div class="sub">${escapeHtml(e.sender_or_recipient)}</div>` : ''}</td>
        <td>${escapeHtml(directionLabel)}</td>
        <td class="num">${escapeHtml(e.ugykor_kod || '—')}</td>
      </tr>`
    })
    .join('')
}

const LELTAR_TABLE_HEAD = `<thead><tr>
  <th style="width:14%">Iktatószám</th>
  <th style="width:16%">Kelt</th>
  <th>Tárgy</th>
  <th style="width:12%">Irány</th>
  <th style="width:12%">Ügykör</th>
</tr></thead>`

/**
 * A4 iratcsomó-leltár nyomtatvány. `grouped=true` esetén az iratok ügykör
 * szerinti szakaszokba rendezve jelennek meg (a kód szerinti sorrendben,
 * a besorolatlanok a végén), különben egyetlen táblázatban.
 */
function buildCsomoLeltarHtml(params: {
  congregationName: string
  csomo: Iratcsomo
  entries: FilingEntryWithCsomo[]
  grouped: boolean
  /** 24. pont: a gyülekezet pecsét-képe (data: URI) — a két aláírás KÖZÉ,
   *  halványan. Hiányában a leltár a mai formájában készül. */
  pecsetKepUrl?: string | null
  /** 24. pont: a lelkipásztori aláírás képe — az „Összeállította" vonal FÖLÉ. */
  alairasKepUrl?: string | null
}): string {
  const { congregationName, csomo, entries, grouped, pecsetKepUrl, alairasKepUrl } = params

  let body: string
  if (!grouped) {
    body = `<table>${LELTAR_TABLE_HEAD}<tbody>${leltarRows(entries)}</tbody></table>`
  } else {
    // Csoportosítás ügykör-kód szerint; a kód nélküliek a végére
    const groups = new Map<string, FilingEntryWithCsomo[]>()
    for (const e of entries) {
      const key = e.ugykor_kod || ''
      const list = groups.get(key)
      if (list) list.push(e)
      else groups.set(key, [e])
    }
    const keys = Array.from(groups.keys()).sort((a, b) => {
      if (a === '') return 1
      if (b === '') return -1
      return a.localeCompare(b, 'hu', { numeric: true })
    })
    body = keys
      .map((key) => {
        const list = groups.get(key)!
        const nev = key ? FILING_UGYKOROK_MAP[key]?.nev ?? '' : ''
        const title = key ? `${key} ${nev}`.trim() : 'Ügykör nélkül'
        return `<h2>${escapeHtml(title)} <span class="count">(${list.length} irat)</span></h2>
          <table>${LELTAR_TABLE_HEAD}<tbody>${leltarRows(list)}</tbody></table>`
      })
      .join('')
  }

  const printedAt = fmtDateHu(new Date().toISOString())

  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8">
  <title>Iratcsomó-leltár — ${escapeHtml(csomo.nev)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #1f2937; margin: 0; padding: 12mm; font-size: 11pt; line-height: 1.4; background: #fff; }
    h1 { font-size: 15pt; margin: 0; text-align: center; text-transform: uppercase; letter-spacing: 0.08em; }
    .cong { text-align: center; font-size: 12pt; margin: 0 0 2px 0; }
    .subtitle { text-align: center; font-size: 10pt; color: #475569; margin: 4px 0 0 0; }
    h2 { font-size: 11pt; margin: 14px 0 4px 0; border-bottom: 1px solid #94a3b8; padding-bottom: 2px; }
    h2 .count { font-weight: normal; font-size: 9pt; color: #64748b; }
    .meta { margin: 12px 0 0 0; font-size: 10pt; }
    .meta td { padding: 1px 8px 1px 0; vertical-align: top; }
    .meta .k { color: #475569; white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9pt; }
    th, td { border: 1px solid #475569; padding: 4px 6px; vertical-align: top; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
    tr { break-inside: avoid; }
    td.num { white-space: nowrap; font-variant-numeric: tabular-nums; }
    td .sub { font-size: 8pt; color: #64748b; }
    .total { margin-top: 10px; font-size: 10pt; font-weight: 600; }
    .signature-row { margin-top: 36px; display: flex; gap: 24px; justify-content: space-between; align-items: flex-end; break-inside: avoid; }
    .signature-block { flex: 1; text-align: center; font-size: 10pt; }
    .signature-block .line { border-top: 1px solid #1f2937; margin: 36px 8px 4px 8px; }
    /* 24. pont: feltöltött pecsét- és aláírás-kép — a pecsét halványan a két
       aláírás KÖZÖTT, az aláírás-kép a vonal FÖLÉ, kissé rálógva. Kép híján
       egyik sem jelenik meg (a leltár a mai formájában marad). */
    .pecset-kep { width: 35mm; height: 35mm; object-fit: contain; opacity: .88; flex: 0 0 auto; align-self: center; }
    .signature-block .kep-vonal { position: relative; margin: 36px 8px 4px 8px; border-top: 1px solid #1f2937; }
    .signature-block .kep-vonal img { position: absolute; left: 50%; bottom: -1px; transform: translateX(-50%); max-height: 15mm; max-width: 55mm; object-fit: contain; }
    .printed { margin-top: 18px; text-align: right; font-size: 9pt; color: #64748b; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style></head><body>
    <p class="cong">${escapeHtml(congregationName)}</p>
    <h1>Iratcsomó-leltár</h1>
    <p class="subtitle">${csomo.ev}. évi iktatott iratok — ${grouped ? 'ügykör szerint csoportosítva' : 'iktatószám szerinti sorrendben'}</p>

    <table class="meta" style="border:none"><tbody>
      <tr><td class="k" style="border:none">Csomó neve:</td><td style="border:none"><strong>${escapeHtml(csomo.nev)}</strong></td></tr>
      ${csomo.leiras ? `<tr><td class="k" style="border:none">Leírás:</td><td style="border:none">${escapeHtml(csomo.leiras)}</td></tr>` : ''}
      <tr><td class="k" style="border:none">Állapot:</td><td style="border:none">${csomo.lezarva ? 'lezárt csomó' : 'nyitott csomó'}</td></tr>
    </tbody></table>

    ${body}

    <p class="total">Összesen: ${entries.length} irat</p>

    <div class="signature-row">
      <div class="signature-block">${
        alairasKepUrl
          ? `<div class="kep-vonal"><img src="${escapeHtml(alairasKepUrl)}" alt="" /></div>`
          : '<div class="line"></div>'
      }Összeállította</div>
      ${pecsetKepUrl ? `<img class="pecset-kep" src="${escapeHtml(pecsetKepUrl)}" alt="" />` : ''}
      <div class="signature-block"><div class="line"></div>Ellenőrizte</div>
    </div>

    <p class="printed">Nyomtatva: ${printedAt}</p>
  </body></html>`
}
