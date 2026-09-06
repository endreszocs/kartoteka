'use client'

// ── Gyülekezeti programok widget (Claude Design átültetés, 2026-06-07) ──
// Naptár (navigátor) + Agenda (részletes lista) szűk oszlopban, valós
// adatokkal és szerver-action-ökkel. A napra kattintás SZŰRI az agendát.
//
// 2026-09-05 (Endre 2. pontja): RÉTEGEK a programok fölött — anyakönyvi
// tények, születésnapok, névnapok (`getNaptarRetegek`), három kapcsolóval;
// a tervezett anyakönyvi alkalom a kártyáról anyakönyvezhető (D1/D12), a
// kötött program „anyakönyvezve" jelzést kap, a tény nem duplázódik
// (naptar-retegek-osszefesules.ts — tiszta, önellenőrzött függvények).
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ChevronDown, Sparkles,
  Calendar as CalendarIcon, List as ListIcon, Plus, Rows3, Smile, Inbox,
  BookMarked, Cake, Flower, AlertTriangle,
} from 'lucide-react'
import {
  getProgramsForYear, deleteProgram, toggleProgramDone,
  kapcsolProgramAnyakonyvhoz, bontProgramAnyakonyv,
} from '@/app/(dashboard)/programs/actions'
import { getNaptarRetegek } from '@/app/(dashboard)/naptar/retegek-actions'
import { ProgramDialog } from '@/components/modals/program-dialog'
import { BatchProgramDialog } from '@/components/modals/batch-program-dialog'
import { AdminConfirmDialog } from '@/components/admin/admin-confirm-dialog'
import { ProgramCalendar } from './program-calendar'
import { AgendaCard, RetegAgendaCard } from './program-agenda-card'
import { AnnualPlanPrint } from './annual-plan-print'
import { SzuletesnaposNaptarPrint } from './szuletesnapos-naptar-print'
import { GoogleCalendarDialog } from './google-calendar-dialog'
import { HU_MONTHS, HU_MONTHS_SHORT, HU_DAYS, isAnyakonyviProgramTipus } from '@/lib/constants/dashboard'
import type { Program } from '@/lib/constants/dashboard'
import { expandProgramOccurrences } from '@/lib/utils/program-recurrence'
import { ymd } from '@/lib/utils/program-day'
import {
  NAPTAR_RETEG_ALAP, NAPTAR_RETEG_LS_KULCS, ANYAKONYV_TABLA_CIMKE, PROGRAM_TIPUS_ANYAKONYV_TABLA,
  ISMETLODO_SOROZAT_ANYAKONYV_HIBA,
} from '@/lib/calendar/naptar-retegek-types'
import type { AnyakonyviEsemeny, NaptarRetegKapcsolok, NaptarRetegek } from '@/lib/calendar/naptar-retegek-types'
import { napTetelei, retegPottyokNaponkent, retegekSzamaHonapban } from '@/lib/calendar/naptar-retegek-osszefesules'
import type { NaptarNapTetel, ProgramAnyakonyvLink } from '@/lib/calendar/naptar-retegek-osszefesules'
import { toast } from 'sonner'

/**
 * 2026-09-05: a négy anyakönyvi dialógus (emléklap-vászonnal, ~30–45 KB
 * forrás egyenként) LAZY töltődik — az irányítópult a leggyakrabban nyitott
 * képernyő, az anyakönyvezés viszont ritka művelet (a minta: celebrations.tsx).
 * A portálba renderelő dialógus betöltés-jelzője lebegő „pirula".
 */
const dialogBetoltes = () => (
  <span className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-lg">
    Anyakönyvi rögzítő betöltése…
  </span>
)
const BaptismDialog = dynamic(() => import('@/components/modals/baptism-dialog').then((m) => m.BaptismDialog), { ssr: false, loading: dialogBetoltes })
const MarriageDialog = dynamic(() => import('@/components/modals/marriage-dialog').then((m) => m.MarriageDialog), { ssr: false, loading: dialogBetoltes })
const ConfirmationDialog = dynamic(() => import('@/components/modals/confirmation-dialog').then((m) => m.ConfirmationDialog), { ssr: false, loading: dialogBetoltes })
const BurialDialog = dynamic(() => import('@/components/modals/burial-dialog').then((m) => m.BurialDialog), { ssr: false, loading: dialogBetoltes })

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
 * egy hasábra esik szét — teljes szélességű.
 *
 * 2026-09-05 (D8): a küszöb 700 → 750px, mert a cella felső korlátja 48 → 52px
 * lett. A szabály változatlan: két hasábban sem kaphat KISEBB naptár-cellát a
 * csempe, mint egy hasábban. Levezetés (a CSS-ből: belső padding 2×14px,
 * hasábköz 18px, hasábarány 1.25:1, rés 4px×6): ((w − 46) × 0,5556 − 24) / 7 ≥ 52
 * → w ≥ 745; a 8px-es hiszterézis-sáv alján is ≥ 51,75px kell → w ≥ 750.
 * A 2026-09-05-ös csempesor-arányokkal 1920px-es ablakban a csempe ≈772px,
 * tehát a két hasáb ott VALÓBAN bekapcsol (eddig csak ~2300px-nél).
 *
 * ⚠️ EGY FORRÁS: ugyanez a mérés adja az `is-2col` osztályt is (lásd
 * `packages/ui/src/kartoteka.css`), hogy a látvány és a csonkolás ne
 * húzhasson szét némán. Őrszem: scripts/selftest-naptar-geometria.mjs.
 */
const TWO_COL_MIN = 750
/** Törtpixel-ingadozás elleni holtsáv (ennél nagyobb NEM lehet: a visszaváltási
 *  sávban is legalább akkora cellát akarunk, mint egy hasábban). */
const TWO_COL_HISZTEREZIS = 8
const DAY_CAP_2COL = 6
const LIST_CAP_2COL = 12

type AnyakonyvTabla = AnyakonyviEsemeny['tabla']

/** A localStorage-ból olvasott kapcsolók — csak a három ismert kulcs, csak boolean. */
function kapcsolokBetoltese(): NaptarRetegKapcsolok | null {
  try {
    const raw = localStorage.getItem(NAPTAR_RETEG_LS_KULCS)
    if (!raw) return null
    const j = JSON.parse(raw) as Partial<Record<keyof NaptarRetegKapcsolok, unknown>>
    const b = (k: keyof NaptarRetegKapcsolok) => (typeof j[k] === 'boolean' ? (j[k] as boolean) : NAPTAR_RETEG_ALAP[k])
    return { anyakonyv: b('anyakonyv'), szuletesnapok: b('szuletesnapok'), nevnapok: b('nevnapok') }
  } catch {
    // Sérült vagy elérhetetlen tároló (privát mód, letiltott site-data) → alapértelmezés.
    return null
  }
}

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

  // ── 2026-09-05: RÉTEGEK (anyakönyv / születésnap / névnap) ──────────────
  // A rétegek a programokkal PÁRHUZAMOSAN töltődnek (külön kérés, külön
  // hibakezelés): egy hiányzó SQL-függvény miatt a programok nem várhatnak,
  // és a hiba sem néma — a `retegHiba` + `retegek.hibak` a csempén látszik.
  const [retegek, setRetegek] = useState<NaptarRetegek | null>(null)
  const [retegHiba, setRetegHiba] = useState<string | null>(null)
  const [kapcsolok, setKapcsolok] = useState<NaptarRetegKapcsolok>(NAPTAR_RETEG_ALAP)
  // A tárolt kapcsoló-állás betöltése MOUNT után (SSR-en nincs localStorage; a
  // szinkron setState effektben tilos → mikrotaszk, a repó bevett mintája).
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const tarolt = kapcsolokBetoltese()
      if (tarolt) setKapcsolok(tarolt)
    })
    return () => { cancelled = true }
  }, [])
  function valtKapcsolo(k: keyof NaptarRetegKapcsolok) {
    const next = { ...kapcsolok, [k]: !kapcsolok[k] }
    setKapcsolok(next)
    try { localStorage.setItem(NAPTAR_RETEG_LS_KULCS, JSON.stringify(next)) } catch { /* kényelmi tárolás — hibája nem számít */ }
  }

  // ── Anyakönyvezés a naptárból (D1/D12) ───────────────────────────────────
  // `anyakonyvezes` = melyik dialógus van FELCSATOLVA (az utolsó célpont),
  // `anyakonyvNyitva` = nyitva-e. A bezárás NEM csatolja le a dialógust: a
  // mentés után annak SAJÁT munkanapló-rögzítője nyílik meg (worklog-prefill),
  // ami egy lecsatolt komponensből elveszne.
  const [anyakonyvezes, setAnyakonyvezes] = useState<{ tabla: AnyakonyvTabla; program: ProgramAnyakonyvLink } | null>(null)
  const [anyakonyvNyitva, setAnyakonyvNyitva] = useState(false)
  const [bontasTarget, setBontasTarget] = useState<ProgramAnyakonyvLink | null>(null)
  const [bontasFolyamatban, setBontasFolyamatban] = useState(false)

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
  // A kérés sorszáma: gyors évváltásnál a KÉSŐBB indított, de korábban
  // visszaérő válasz nem írhatja felül a frissebbet (programnál és rétegnél is).
  const keresSorszam = useRef(0)
  const loadPrograms = useCallback(async (y: number) => {
    const sorszam = ++keresSorszam.current
    setLoading(true)
    const retegKeres = getNaptarRetegek(y)
      .then((r) => {
        if (keresSorszam.current !== sorszam) return
        setRetegek(r)
        setRetegHiba(null)
      })
      .catch((e: unknown) => {
        if (keresSorszam.current !== sorszam) return
        setRetegek(null)
        setRetegHiba(`Az anyakönyvi, születésnapi és névnapi réteg nem tölthető be: ${e instanceof Error ? e.message : 'ismeretlen hiba'}`)
      })
    try {
      const data = await getProgramsForYear(y)
      if (keresSorszam.current === sorszam) setPrograms(data)
    } catch {
      toast.error('A programok betöltése nem sikerült. Próbáld újra.')
    } finally {
      if (keresSorszam.current === sorszam) setLoading(false)
    }
    await retegKeres
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
  // A `select('*')` a 2026-09-05-ös link-oszlopokat (anyakonyv_tabla/-_id) is
  // hozza, ezért az alkalmak a kötést is hordozzák (ProgramAnyakonyvLink).
  const occurrences = useMemo(
    () => expandProgramOccurrences(programs, year) as ProgramAnyakonyvLink[],
    [programs, year],
  )

  // A rétegek pöttyei naponként (a kapcsolók + a dedupe már érvényesítve).
  const retegPottyok = useMemo(
    () => retegPottyokNaponkent(retegek, kapcsolok, occurrences),
    [retegek, kapcsolok, occurrences],
  )

  // Hó eseményei (a hónapot bármely napon érintők)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const honapKulcs = `${year}-${String(month + 1).padStart(2, '0')}`
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
  const retegDbHonap = useMemo(() => retegekSzamaHonapban(retegPottyok, honapKulcs), [retegPottyok, honapKulcs])

  // Lista nézet: a hónap minden napja a tételekkel (programok + rétegek) csoportosítva
  const listGroups = useMemo(() => {
    const groups: { day: number; date: Date; tetelek: NaptarNapTetel[] }[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const tetelek = napTetelei(ymd(year, month, d), occurrences, retegek, kapcsolok)
      if (tetelek.length) groups.push({ day: d, date: new Date(year, month, d), tetelek })
    }
    return groups
  }, [occurrences, retegek, kapcsolok, year, month, daysInMonth])

  const selectedDate = selectedDay ? new Date(year, month, selectedDay) : null
  const selectedTetelek = useMemo(
    () => (selectedDay ? napTetelei(ymd(year, month, selectedDay), occurrences, retegek, kapcsolok) : []),
    [selectedDay, year, month, occurrences, retegek, kapcsolok],
  )
  const selectedIsToday = !!selectedDay && isCurrentMonth && selectedDay === today.getDate()

  // ── Görgetésmentes korlátok (2026-08-10) ─────────────────────────────────
  // A csempe fix magasságú sorban ül, ezért alapból csak `dayCap` nap-tétel,
  // illetve `listCap` lista-tétel látszik. A többi a „+N további" gombbal
  // bontható ki — így semmi nem válik elérhetetlenné, de nincs scrollbar sem.
  // 2026-08-22: két hasábos (széles) csempén bővebb a korlát, mert ott a
  // hasáb magassága nem a naptár-rács alatti maradék.
  const shownDayTetelek = expanded ? selectedTetelek : selectedTetelek.slice(0, dayCap)
  const hiddenDayTetelek = selectedTetelek.length - shownDayTetelek.length

  const listTotal = useMemo(
    () => listGroups.reduce((sum, g) => sum + g.tetelek.length, 0),
    [listGroups]
  )
  const shownListGroups = useMemo(() => {
    if (expanded) return listGroups
    const out: { day: number; date: Date; tetelek: NaptarNapTetel[] }[] = []
    let used = 0
    for (const g of listGroups) {
      if (used >= listCap) break
      const take = g.tetelek.slice(0, listCap - used)
      out.push({ ...g, tetelek: take })
      used += take.length
    }
    return out
  }, [listGroups, expanded, listCap])
  const hiddenListTetelek = listTotal - shownListGroups.reduce((sum, g) => sum + g.tetelek.length, 0)

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

  // ── Anyakönyvezés a kártyáról (D1): a megfelelő anyakönyvi dialógus a
  //    program NAPJÁVAL nyílik; mentés után a program megkapja a kapcsolatot.
  function onAnyakonyvezes(p: ProgramAnyakonyvLink) {
    if (!isAnyakonyviProgramTipus(p.tipus)) return
    // A sorozat valódi sora (id) + az ALKALOM napja (ismétlődő anyakönyvi program
    // nem életszerű, de a dedupe és a dátum így is helyes marad).
    const real = (programs as ProgramAnyakonyvLink[]).find((x) => x.id === p.id) ?? p
    // 2026-09-05 (P3-utómunka): ISMÉTLŐDŐ sorozatot NEM engedünk az anyakönyvi
    // dialógusig. A szerver (kapcsolProgramAnyakonyvhoz) úgyis elutasítaná az
    // összekötést — de akkor már ott állna egy KÖTETLEN anyakönyvi sor
    // (félkész állapot). Ugyanaz az üzenet, mint a szerveré: egy forrás.
    if (real.ismetlodes_tipus) {
      toast.error(ISMETLODO_SOROZAT_ANYAKONYV_HIBA, { duration: 9000 })
      return
    }
    setAnyakonyvezes({ tabla: PROGRAM_TIPUS_ANYAKONYV_TABLA[p.tipus], program: { ...real, datum: p.datum } })
    setAnyakonyvNyitva(true)
  }
  async function osszekot(program: ProgramAnyakonyvLink, tabla: AnyakonyvTabla, anyakonyvId: number) {
    const res = await kapcsolProgramAnyakonyvhoz({ programId: program.id, anyakonyvId })
    if (!res.ok) {
      // Az anyakönyvi sor ekkor MÁR mentve van (az onSaved a sikeres mentés
      // után hív) — a lelkész tudja meg, hogy a bejegyzés megvan, csak a
      // program nincs hozzákötve; nem néma, nem félrevezető.
      toast.error(
        `${res.error ?? 'A program és az anyakönyvi bejegyzés összekötése nem sikerült.'} Az anyakönyvi bejegyzés mentve maradt, csak a programhoz nincs hozzákötve.`,
        { duration: 12000 },
      )
    } else {
      toast.success(`A program összekötve az anyakönyvi bejegyzéssel (${ANYAKONYV_TABLA_CIMKE[tabla].toLowerCase()}) — a naptár mostantól „anyakönyvezve" jelzi.`)
    }
    refreshPrograms()
  }
  async function confirmBontas() {
    if (!bontasTarget) return
    setBontasFolyamatban(true)
    const res = await bontProgramAnyakonyv(bontasTarget.id)
    setBontasFolyamatban(false)
    if (!res.ok) {
      toast.error(res.error ?? 'A kapcsolat bontása nem sikerült.')
    } else {
      toast.success('A kapcsolat bontva — a program és az anyakönyvi bejegyzés is megmaradt.')
      setBontasTarget(null)
      refreshPrograms()
    }
  }

  /** Egy napi tétel kártyája — program (műveletekkel) vagy réteg (csak olvasható). */
  function tetelKartya(t: NaptarNapTetel, isToday: boolean) {
    if (t.reteg === 'program') {
      return (
        <AgendaCard
          key={t.kulcs} p={t.program} isToday={isToday} compact
          onEdit={openEdit} onToggleDone={onToggleDone} onDelete={(x) => setDeleteTargetId(x.id)}
          onAnyakonyvezes={onAnyakonyvezes} onBontas={(x) => setBontasTarget(x)}
        />
      )
    }
    return <RetegAgendaCard key={t.kulcs} tetel={t} compact />
  }

  // A rétegek hibái — CSAK a bekapcsolt rétegekre (a kikapcsolt réteg hibája a
  // bekapcsolásakor jelenik meg), plusz a teljes betöltési hiba.
  const lathatoRetegHibak = (retegek?.hibak ?? []).filter((h) => kapcsolok[h.reteg])
  const vanRetegHiba = !!retegHiba || lathatoRetegHibak.length > 0
  const evRetegek = retegek && retegek.ev === year ? retegek : null

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
          {retegDbHonap > 0 && (
            <span title="Anyakönyvi események, születésnapok és névnapok a bekapcsolt rétegek szerint">
              {' '}· <strong>{retegDbHonap}</strong> jelzés
            </span>
          )}
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

      {/* 2026-09-05: réteg-kapcsolók (per-böngésző megjegyezve) */}
      <div className="kt-reteg-kapcsolok" role="group" aria-label="Naptár-rétegek">
        <button
          type="button"
          className={`kt-reteg-chip${kapcsolok.anyakonyv ? ' is-on' : ''}`}
          aria-pressed={kapcsolok.anyakonyv}
          onClick={() => valtKapcsolo('anyakonyv')}
          title="Anyakönyvi események (keresztelő, esküvő, konfirmáció, temetés) — az anyakönyvből olvasva"
        >
          <BookMarked size={12} /> Anyakönyv
        </button>
        <button
          type="button"
          className={`kt-reteg-chip kt-reteg-chip--szuletesnap${kapcsolok.szuletesnapok ? ' is-on' : ''}`}
          aria-pressed={kapcsolok.szuletesnapok}
          onClick={() => valtKapcsolo('szuletesnapok')}
          title="A tagok születésnapjai (életkorral) — a tagnyilvántartásból"
        >
          <Cake size={12} /> Születésnap
        </button>
        <button
          type="button"
          className={`kt-reteg-chip${kapcsolok.nevnapok ? ' is-on' : ''}`}
          aria-pressed={kapcsolok.nevnapok}
          onClick={() => valtKapcsolo('nevnapok')}
          title="A tagok névnapjai — a névnap-katalógus és a keresztnév egyeztetéséből"
        >
          <Flower size={12} /> Névnap
        </button>
      </div>

      {/* 2026-09-05: a rétegek hibája LÁTHATÓ — a néma üres réteg tilos */}
      {vanRetegHiba && (
        <div className="kt-reteg-hibak" role="status">
          <AlertTriangle size={13} />
          <div>
            {retegHiba && <p>{retegHiba}</p>}
            {lathatoRetegHibak.map((h) => <p key={h.reteg}>{h.uzenet}</p>)}
          </div>
        </div>
      )}

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
              retegPottyok={retegPottyok}
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
              {selectedTetelek.length === 0 ? (
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
                  {shownDayTetelek.map((t) => tetelKartya(t, selectedIsToday))}
                  {/* 2026-08-10: görgetés helyett kibontható „+N további" */}
                  {hiddenDayTetelek > 0 && (
                    <button type="button" className="kt-more-line" onClick={() => setExpanded(true)}>
                      +{hiddenDayTetelek} további
                    </button>
                  )}
                  {expanded && selectedTetelek.length > dayCap && (
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
                        {g.tetelek.map((t) => tetelKartya(t, gToday))}
                      </div>
                    </div>
                  )
                })}
                {/* 2026-08-10: görgetés helyett kibontható „+N további" */}
                {hiddenListTetelek > 0 && (
                  <button type="button" className="kt-more-line" onClick={() => setExpanded(true)}>
                    +{hiddenListTetelek} további a hónapban
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
          {/* 2026-09-05: a nyomtatványok a csempe MÁR BETÖLTÖTT rétegeit kapják
              (ugyanaz az év) — nem kérik le még egyszer. */}
          <AnnualPlanPrint
            allPrograms={programs}
            year={year}
            congregationLogo={congregationLogo}
            congregationName={congregationName}
            retegek={evRetegek}
            compact
          />
          <SzuletesnaposNaptarPrint
            year={year}
            congregationName={congregationName}
            congregationLogo={congregationLogo}
            retegek={evRetegek}
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
      {/* 2026-09-05 (D12): a kapcsolat bontása — a program és a bejegyzés marad */}
      <AdminConfirmDialog
        open={!!bontasTarget}
        onOpenChange={(o) => { if (!o) setBontasTarget(null) }}
        title="Anyakönyvi kapcsolat bontása"
        description="A program és az anyakönyvi bejegyzés is megmarad, csak a kettő közti kapcsolat szűnik meg — a naptár az anyakönyvi eseményt ezután külön mutatja. Később újra összeköthetők."
        confirmLabel="Bontás"
        loading={bontasFolyamatban}
        onConfirm={confirmBontas}
      />
      <GoogleCalendarDialog open={gcalOpen} onOpenChange={setGcalOpen} />

      {/* 2026-09-05 (D1): anyakönyvezés a naptárból — a megfelelő anyakönyvi
          dialógus a program napjával; a mentett sor id-jával kötjük a programot.
          A dialógus a bezárás után is FELCSATOLVA marad (a saját munkanapló-
          rögzítője miatt), csak az `open` vált. */}
      {anyakonyvezes?.tabla === 'keresztseg' && (
        <BaptismDialog
          open={anyakonyvNyitva}
          onOpenChange={(o) => { if (!o) setAnyakonyvNyitva(false) }}
          congregationName={congregationName}
          initialDate={anyakonyvezes.program.datum}
          onSaved={(id) => void osszekot(anyakonyvezes.program, anyakonyvezes.tabla, id)}
        />
      )}
      {anyakonyvezes?.tabla === 'hazassag' && (
        <MarriageDialog
          open={anyakonyvNyitva}
          onOpenChange={(o) => { if (!o) setAnyakonyvNyitva(false) }}
          congregationName={congregationName}
          initialDate={anyakonyvezes.program.datum}
          onSaved={(id) => void osszekot(anyakonyvezes.program, anyakonyvezes.tabla, id)}
        />
      )}
      {anyakonyvezes?.tabla === 'konfirmalas' && (
        <ConfirmationDialog
          open={anyakonyvNyitva}
          onOpenChange={(o) => { if (!o) setAnyakonyvNyitva(false) }}
          congregationName={congregationName}
          initialDate={anyakonyvezes.program.datum}
          onSaved={(id) => void osszekot(anyakonyvezes.program, anyakonyvezes.tabla, id)}
        />
      )}
      {anyakonyvezes?.tabla === 'temetes' && (
        <BurialDialog
          open={anyakonyvNyitva}
          onOpenChange={(o) => { if (!o) setAnyakonyvNyitva(false) }}
          congregationName={congregationName}
          initialDate={anyakonyvezes.program.datum}
          onSaved={(id) => void osszekot(anyakonyvezes.program, anyakonyvezes.tabla, id)}
        />
      )}
    </div>
  )
}
