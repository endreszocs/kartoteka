'use client'

// ── Gyülekezeti programok widget (Claude Design átültetés, 2026-06-07) ──
// Naptár (navigátor) + Agenda (részletes lista) szűk oszlopban, valós
// adatokkal és szerver-action-ökkel. A napra kattintás SZŰRI az agendát.
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ChevronDown, Sparkles,
  Calendar as CalendarIcon, List as ListIcon, Plus, Rows3, Smile, Inbox,
} from 'lucide-react'
import { getProgramsForYear, deleteProgram, toggleProgramDone } from '@/app/(dashboard)/programs/actions'
import { ProgramDialog } from '@/components/modals/program-dialog'
import { BatchProgramDialog } from '@/components/modals/batch-program-dialog'
import { AdminConfirmDialog } from '@/components/admin/admin-confirm-dialog'
import { ProgramCalendar } from './program-calendar'
import { AgendaCard } from './program-agenda-card'
import { AnnualPlanPrint } from './annual-plan-print'
import { GoogleCalendarDialog } from './google-calendar-dialog'
import { HU_MONTHS, HU_MONTHS_SHORT, HU_DAYS } from '@/lib/constants/dashboard'
import type { Program } from '@/lib/constants/dashboard'
import { expandProgramOccurrences } from '@/lib/utils/program-recurrence'
import { ymd, eventsForDay } from '@/lib/utils/program-day'
import { toast } from 'sonner'

interface ProgramSchedulerProps {
  initialYear: number
  congregationName: string
  congregationLogo?: string | null
}

/**
 * 2026-08-10 — görgetésmentes csempe-korlátok.
 * A widget az irányítópult három-csempés (egy magasságú) sorában ül, ezért
 * alapból csak ennyi tétel látszik; a többi a „+N további" gombbal bontható ki.
 */
const DAY_CAP = 2
const LIST_CAP = 4

/**
 * 2026-08-22 — KÉT HASÁBOS elrendezés széles csempén.
 *
 * A naptár melletti hasábban a napi agenda FÜGGŐLEGESEN sokkal több helyet
 * kap (nem a rács alatt osztozik), ezért ott bővebb a csonkolás — különben
 * fölöslegesen rejtenénk el tételeket ott, ahol bőven van hely.
 *
 * A küszöb a CSEMPE szélessége (nem a képernyőé!): a csempe az irányítópult
 * sorában akár 1280px fölött is keskeny lehet, 1280 alatt viszont — ahol a sor
 * egy hasábra esik szét — teljes szélességű. 700px az a méret, ahol két
 * hasábban is marad legalább akkora naptár-cella, mint egy hasábban
 * (`--kt-cell-max: 48px`), tehát a váltás nem KICSINYÍTI a naptárat.
 *
 * ⚠️ EGY FORRÁS: ugyanez a mérés adja az `is-2col` osztályt is (lásd
 * `packages/ui/src/kartoteka.css`), hogy a látvány és a csonkolás ne
 * húzhasson szét némán.
 */
const TWO_COL_MIN = 700
/** Törtpixel-ingadozás elleni holtsáv (ennél nagyobb NEM lehet: a visszaváltási
 *  sávban is legalább akkora cellát akarunk, mint egy hasábban). */
const TWO_COL_HISZTEREZIS = 8
const DAY_CAP_2COL = 6
const LIST_CAP_2COL = 12

// ── Hónap-választó popover ──
function MonthPicker({
  year, month, today, onPick, onClose,
}: {
  year: number; month: number; today: Date
  onPick: (y: number, m: number) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [vy, setVy] = useState(year)
  useEffect(() => {
    function out(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [onClose])
  return (
    <div className="kt-mp" ref={ref} role="dialog" aria-label="Hónap kiválasztása">
      <div className="kt-mp-yearrow">
        <button type="button" className="kt-mp-ybtn" onClick={() => setVy(vy - 1)} aria-label="Előző év">
          <ChevronLeft size={18} />
        </button>
        <span className="kt-mp-year">{vy}</span>
        <button type="button" className="kt-mp-ybtn" onClick={() => setVy(vy + 1)} aria-label="Következő év">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="kt-mp-grid">
        {HU_MONTHS_SHORT.map((mn, i) => {
          const active = vy === year && i === month
          const isThis = vy === today.getFullYear() && i === today.getMonth()
          return (
            <button
              key={i}
              type="button"
              className={`kt-mp-month${active ? ' is-active' : ''}${isThis ? ' is-this' : ''}`}
              onClick={() => onPick(vy, i)}
            >
              {mn}
            </button>
          )
        })}
      </div>
      <button type="button" className="kt-mp-today" onClick={() => onPick(today.getFullYear(), today.getMonth())}>
        <CalendarDays size={14} /> Ugrás a mai hónapra
      </button>
    </div>
  )
}

export function ProgramScheduler({ initialYear, congregationName, congregationLogo }: ProgramSchedulerProps) {
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }, [])
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(
    initialYear === today.getFullYear() ? today.getDate() : null
  )
  const [view, setView] = useState<'honap' | 'lista'>('honap')
  const [pickerOpen, setPickerOpen] = useState(false)
  // 2026-08-10: a csempében NINCS belső görgetés — alapból csak néhány tétel
  // látszik, a „+N további" gomb kérésre bontja ki a teljes listát.
  const [expanded, setExpanded] = useState(false)

  const [programDialogOpen, setProgramDialogOpen] = useState(false)
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [editingProgram, setEditingProgram] = useState<Program | null>(null)
  const [defaultDate, setDefaultDate] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  // 2026-08-02 (PR-20): Google Naptár összekötés dialógus
  const [gcalOpen, setGcalOpen] = useState(false)

  // ── Csempe-szélesség mérése (2026-08-22) ────────────────────────────────
  // A két hasábos elrendezés ÉS a tétel-korlátok is ebből az EGY mérésből
  // következnek. Kis hiszterézissel, hogy a törtpixel-ingadozás ne kapcsolgassa.
  const rootRef = useRef<HTMLDivElement>(null)
  const [twoCol, setTwoCol] = useState(false)
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const apply = (w: number) => {
      setTwoCol((prev) => {
        const next = prev ? w >= TWO_COL_MIN - TWO_COL_HISZTEREZIS : w >= TWO_COL_MIN
        return next === prev ? prev : next
      })
    }
    apply(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) apply(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const dayCap = twoCol ? DAY_CAP_2COL : DAY_CAP
  const listCap = twoCol ? LIST_CAP_2COL : LIST_CAP

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  // ── Adatbetöltés ──
  const loadPrograms = useCallback(async (y: number) => {
    setLoading(true)
    try {
      const data = await getProgramsForYear(y)
      setPrograms(data)
    } catch {
      toast.error('A programok betöltése nem sikerült. Próbáld újra.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void loadPrograms(year) })
    return () => { cancelled = true }
  }, [year, loadPrograms])

  const refreshPrograms = useCallback(() => { void loadPrograms(year) }, [year, loadPrograms])

  // Ismétlődő programok feloldása a tényleges alkalmakra — 2026-08-02 (PR-20):
  // a horizont a NÉZETT év vége, így az előző évben indult heti/havi sorozat
  // az új évben is megjelenik (eddig a kezdő év végén elhalt).
  const occurrences = useMemo(() => expandProgramOccurrences(programs, year), [programs, year])

  // Hó eseményei (a hónapot bármely napon érintők)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthPrograms = useMemo(() => {
    const mStart = ymd(year, month, 1)
    const mEnd = ymd(year, month, daysInMonth)
    return occurrences.filter((p) => {
      const s = p.datum
      const e = p.datum_vege && p.datum_vege > p.datum ? p.datum_vege : p.datum
      return s <= mEnd && e >= mStart
    })
  }, [occurrences, year, month, daysInMonth])
  const doneCount = monthPrograms.filter((p) => p.teljesitett).length

  // Lista nézet: a hónap minden napja eseményekkel csoportosítva
  const listGroups = useMemo(() => {
    const groups: { day: number; date: Date; events: Program[] }[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const evts = eventsForDay(occurrences, year, month, d)
      if (evts.length) groups.push({ day: d, date: new Date(year, month, d), events: evts })
    }
    return groups
  }, [occurrences, year, month, daysInMonth])

  const selectedDate = selectedDay ? new Date(year, month, selectedDay) : null
  const selectedEvents = selectedDay ? eventsForDay(occurrences, year, month, selectedDay) : []
  const selectedIsToday = !!selectedDay && isCurrentMonth && selectedDay === today.getDate()

  // ── Görgetésmentes korlátok (2026-08-10) ─────────────────────────────────
  // A csempe fix magasságú sorban ül, ezért alapból csak `dayCap` nap-esemény,
  // illetve `listCap` lista-tétel látszik. A többi a „+N további" gombbal
  // bontható ki — így semmi nem válik elérhetetlenné, de nincs scrollbar sem.
  // 2026-08-22: két hasábos (széles) csempén bővebb a korlát, mert ott a
  // hasáb magassága nem a naptár-rács alatti maradék.
  const shownDayEvents = expanded ? selectedEvents : selectedEvents.slice(0, dayCap)
  const hiddenDayEvents = selectedEvents.length - shownDayEvents.length

  const listTotal = useMemo(
    () => listGroups.reduce((sum, g) => sum + g.events.length, 0),
    [listGroups]
  )
  const shownListGroups = useMemo(() => {
    if (expanded) return listGroups
    const out: { day: number; date: Date; events: Program[] }[] = []
    let used = 0
    for (const g of listGroups) {
      if (used >= listCap) break
      const take = g.events.slice(0, listCap - used)
      out.push({ ...g, events: take })
      used += take.length
    }
    return out
  }, [listGroups, expanded, listCap])
  const hiddenListEvents = listTotal - shownListGroups.reduce((sum, g) => sum + g.events.length, 0)

  // Napváltás / hónapváltás / nézetváltás után újra a kompakt állapot az alap
  useEffect(() => { setExpanded(false) }, [selectedDay, month, year, view])

  // ── Navigáció ──
  function goMonth(delta: number) {
    let m = month + delta, y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setYear(y); setMonth(m)
    setSelectedDay(y === today.getFullYear() && m === today.getMonth() ? today.getDate() : 1)
  }
  function jumpTo(y: number, m: number) {
    setYear(y); setMonth(m); setPickerOpen(false)
    setSelectedDay(y === today.getFullYear() && m === today.getMonth() ? today.getDate() : 1)
    setView('honap')
  }
  function goToday() {
    setYear(today.getFullYear()); setMonth(today.getMonth())
    setSelectedDay(today.getDate()); setView('honap')
  }

  // ── Műveletek (valós action-ök) ──
  async function onToggleDone(p: Program) {
    const result = await toggleProgramDone(p.id, !p.teljesitett)
    if (result.error) toast.error(result.error)
    else refreshPrograms()
  }
  async function confirmDelete() {
    if (!deleteTargetId) return
    setDeleting(true)
    const result = await deleteProgram(deleteTargetId)
    setDeleting(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Program törölve.')
      setDeleteTargetId(null)
      refreshPrograms()
    }
  }
  function openNew(dateStr: string | null) {
    setEditingProgram(null); setDefaultDate(dateStr); setProgramDialogOpen(true)
  }
  function openEdit(p: Program) {
    // Az alkalom a sorozat valódi adatbázis-sorát hordozza (id) — azt szerkesztjük
    const real = programs.find((x) => x.id === p.id) || p
    setEditingProgram(real); setDefaultDate(null); setProgramDialogOpen(true)
  }
  function onDialogClose() {
    setProgramDialogOpen(false); setEditingProgram(null); setDefaultDate(null); refreshPrograms()
  }
  function onBatchClose() {
    setBatchDialogOpen(false); refreshPrograms()
  }

  // 2026-08-10: `kt-widget--tile` — kompakt csempe-változat az irányítópult
  // három-csempés sorához (egy magasság, belső görgetés nélkül).
  // 2026-08-22: `is-2col` — széles csempén a napi agenda a naptár MELLÉ kerül.
  return (
    <div
      ref={rootRef}
      className={`card-raised kt-widget kt-widget--flow kt-widget--tile${twoCol ? ' is-2col' : ''}`}
    >
      <div className="kt-glow" />

      {/* Fejléc */}
      <header className="kt-head">
        <div className="kt-head-title">
          <span className="kt-head-ico"><CalendarDays size={17} /></span>
          <div className="min-w-0">
            <span className="kt-head-eyebrow">Naptár</span>
            <h3>Gyülekezeti programok</h3>
          </div>
        </div>
        <button
          type="button"
          className="kt-today-btn"
          onClick={goToday}
          disabled={isCurrentMonth && selectedIsToday}
        >
          <Sparkles size={13} /> Ma
        </button>
      </header>

      {/* Egységes navigáció */}
      <div className="kt-nav">
        <button type="button" className="kt-nav-arrow" onClick={() => goMonth(-1)} aria-label="Előző hónap">
          <ChevronLeft size={20} />
        </button>
        <div className="kt-nav-center">
          <button type="button" className="kt-nav-label" onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen}>
            <span className="kt-nav-month">{HU_MONTHS[month]}</span>
            <span className="kt-nav-year">{year}</span>
            <ChevronDown size={15} className="kt-nav-caret" />
          </button>
          {pickerOpen && (
            <MonthPicker year={year} month={month} today={today} onPick={jumpTo} onClose={() => setPickerOpen(false)} />
          )}
        </div>
        <button type="button" className="kt-nav-arrow" onClick={() => goMonth(1)} aria-label="Következő hónap">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Hó-összegzés + nézetváltó */}
      <div className="kt-subbar">
        <span className="kt-month-summary">
          {monthPrograms.length === 0
            ? 'Nincs program'
            : <><strong>{monthPrograms.length}</strong> program · <strong>{doneCount}</strong> kész</>}
        </span>
        <div className="kt-viewtoggle" role="tablist" aria-label="Nézet">
          <button type="button" role="tab" aria-selected={view === 'honap'} className={view === 'honap' ? 'is-active' : ''} onClick={() => setView('honap')}>
            <CalendarIcon size={14} /> Hónap
          </button>
          <button type="button" role="tab" aria-selected={view === 'lista'} className={view === 'lista' ? 'is-active' : ''} onClick={() => setView('lista')}>
            <ListIcon size={14} /> Lista
          </button>
        </div>
      </div>

      <div className="kt-scroll">
        {loading ? (
          <div className="kt-empty"><p className="kt-empty-sub">Betöltés…</p></div>
        ) : view === 'honap' ? (
          <>
            {/* 2026-08-10: kis kockás, fix 6 hetes rács — a csempe magassága
                hónapváltáskor sem változik */}
            <ProgramCalendar
              programs={occurrences} year={year} month={month} today={today}
              selectedDay={selectedDay} onSelectDay={setSelectedDay} compact
            />
            {/* Kiválasztott nap agendája */}
            <section className="kt-dayagenda">
              <div className="kt-dayagenda-head">
                <div className="kt-dayagenda-date">
                  {selectedDate ? (
                    <>
                      <span className={`kt-dayagenda-num${selectedIsToday ? ' is-today' : ''}`}>{selectedDay}</span>
                      <span className="kt-dayagenda-dow">
                        {selectedIsToday && <em>Ma · </em>}
                        {HU_DAYS[selectedDate.getDay()]}
                      </span>
                    </>
                  ) : <span className="kt-dayagenda-dow">Válassz egy napot</span>}
                </div>
                {selectedDate && (
                  <button type="button" className="kt-day-add" onClick={() => openNew(ymd(year, month, selectedDay!))} title="Program erre a napra">
                    <Plus size={16} />
                  </button>
                )}
              </div>
              {selectedEvents.length === 0 ? (
                <div className="kt-empty kt-empty-day">
                  <span className="kt-empty-ico sm"><Smile size={22} /></span>
                  <p className="kt-empty-sub">Nincs program ezen a napon.</p>
                  {selectedDate && (
                    <button type="button" className="kt-empty-cta" onClick={() => openNew(ymd(year, month, selectedDay!))}>
                      <Plus size={14} /> Program hozzáadása
                    </button>
                  )}
                </div>
              ) : (
                <div className="kt-agenda-list">
                  {shownDayEvents.map((p) => (
                    <AgendaCard
                      key={`${p.id}-${p.datum}`} p={p} isToday={selectedIsToday} compact
                      onEdit={openEdit} onToggleDone={onToggleDone} onDelete={(x) => setDeleteTargetId(x.id)}
                    />
                  ))}
                  {/* 2026-08-10: görgetés helyett kibontható „+N további" */}
                  {hiddenDayEvents > 0 && (
                    <button type="button" className="kt-more-line" onClick={() => setExpanded(true)}>
                      +{hiddenDayEvents} további program
                    </button>
                  )}
                  {expanded && selectedEvents.length > dayCap && (
                    <button type="button" className="kt-more-line" onClick={() => setExpanded(false)}>
                      Kevesebb
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        ) : (
          /* Lista (agenda) nézet — egész hónap, nap szerint csoportosítva */
          <section className="kt-listview">
            {listGroups.length === 0 ? (
              <div className="kt-empty kt-empty-day">
                <span className="kt-empty-ico"><Inbox size={26} /></span>
                <p className="kt-empty-title sm">Üres hónap</p>
                <p className="kt-empty-sub">Ebben a hónapban nincs tervezett program.</p>
                <button type="button" className="kt-empty-cta" onClick={() => openNew(null)}>
                  <Plus size={14} /> Új program
                </button>
              </div>
            ) : (
              <>
                {shownListGroups.map((g) => {
                  const gToday = isCurrentMonth && g.day === today.getDate()
                  return (
                    <div key={g.day} className={`kt-listgroup${gToday ? ' is-today' : ''}`}>
                      <div className="kt-listgroup-head">
                        <span className="kt-listgroup-num">{g.day}</span>
                        <span className="kt-listgroup-dow">{HU_MONTHS_SHORT[month]}</span>
                        {gToday && <span className="kt-listgroup-today">Ma</span>}
                        <span className="kt-listgroup-line" />
                      </div>
                      <div className="kt-agenda-list">
                        {g.events.map((p) => (
                          <AgendaCard
                            key={`${p.id}-${g.day}`} p={p} isToday={gToday} compact
                            onEdit={openEdit} onToggleDone={onToggleDone} onDelete={(x) => setDeleteTargetId(x.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
                {/* 2026-08-10: görgetés helyett kibontható „+N további" */}
                {hiddenListEvents > 0 && (
                  <button type="button" className="kt-more-line" onClick={() => setExpanded(true)}>
                    +{hiddenListEvents} további program a hónapban
                  </button>
                )}
                {expanded && listTotal > listCap && (
                  <button type="button" className="kt-more-line" onClick={() => setExpanded(false)}>
                    Kevesebb
                  </button>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {/* Akciógombok — 2026-08-10: EGYSOROS sáv (elsődleges gomb + ikonos
          másodlagos műveletek), hogy a csempe beférjen a közös sormagasságba.
          Egyik művelet sem tűnt el, csak ikon-formát kapott tooltippel. */}
      <footer className="kt-actions kt-actions--compact">
        <button type="button" className="kt-btn kt-btn-primary" onClick={() => openNew(null)}>
          <Plus size={16} /> Új program
        </button>
        <div className="kt-actions-icons">
          <button
            type="button" className="kt-iconbtn" onClick={() => setBatchDialogOpen(true)}
            title="Tömeges bevitel" aria-label="Tömeges bevitel"
          >
            <Rows3 size={16} />
          </button>
          {/* 2026-08-02 (PR-20): naptár-feed összekötés (Google/Apple/Outlook) */}
          <button
            type="button" className="kt-iconbtn" onClick={() => setGcalOpen(true)}
            title="Google Naptár összekötése" aria-label="Google Naptár összekötése"
          >
            <CalendarPlus size={16} />
          </button>
          <AnnualPlanPrint
            allPrograms={programs}
            year={year}
            congregationLogo={congregationLogo}
            congregationName={congregationName}
            compact
          />
        </div>
      </footer>

      {/* Modálok */}
      <ProgramDialog
        open={programDialogOpen}
        onOpenChange={onDialogClose}
        editProgram={editingProgram}
        defaultDate={defaultDate}
      />
      <BatchProgramDialog
        open={batchDialogOpen}
        onOpenChange={onBatchClose}
        year={year}
      />
      <AdminConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(o) => { if (!o) setDeleteTargetId(null) }}
        title="Program törlése"
        description="Biztosan törlöd ezt a programot? Ismétlődő program esetén az összes alkalom törlődik. A művelet nem vonható vissza."
        confirmLabel="Törlés"
        tone="danger"
        loading={deleting}
        onConfirm={confirmDelete}
      />
      <GoogleCalendarDialog open={gcalOpen} onOpenChange={setGcalOpen} />
    </div>
  )
}
