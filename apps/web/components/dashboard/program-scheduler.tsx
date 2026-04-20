'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getProgramsForYear, deleteProgram, toggleProgramDone } from '@/app/(dashboard)/programs/actions'
import { ProgramDialog } from '@/components/modals/program-dialog'
import { BatchProgramDialog } from '@/components/modals/batch-program-dialog'
import { ProgramCalendar } from './program-calendar'
import { ProgramList } from './program-list'
import { AnnualPlanPrint } from './annual-plan-print'
import { HU_MONTHS_SHORT } from '@/lib/constants/dashboard'
import type { Program } from '@/lib/constants/dashboard'
import { toast } from 'sonner'

interface ProgramSchedulerProps {
  initialYear: number
  congregationName: string
  congregationLogo?: string | null
}

export function ProgramScheduler({ initialYear, congregationName, congregationLogo }: ProgramSchedulerProps) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(new Date().getMonth())
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [programDialogOpen, setProgramDialogOpen] = useState(false)
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [editingProgram, setEditingProgram] = useState<Program | null>(null)
  const [defaultDate, setDefaultDate] = useState<string | null>(null)

  const today = new Date()

  const loadPrograms = useCallback(async (y: number) => {
    const data = await getProgramsForYear(y)
    setPrograms(data)
    setLoading(false)
  }, [])

  const refreshPrograms = useCallback((targetYear = year) => {
    setLoading(true)
    void loadPrograms(targetYear)
  }, [year, loadPrograms])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void loadPrograms(year)
      }
    })
    return () => {
      cancelled = true
    }
  }, [year, loadPrograms])

  // Hónapok szerinti csoportosítás
  const programsByMonth: Record<number, Program[]> = {}
  for (let i = 0; i < 12; i++) programsByMonth[i] = []
  programs.forEach(p => {
    const m = new Date(p.datum).getMonth()
    if (programsByMonth[m]) programsByMonth[m].push(p)
  })

  const monthPrograms = programsByMonth[month] || []

  // Hónapváltás
  function navMonth(dir: number) {
    let m = month + dir
    let y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    if (y !== year) {
      setLoading(true)
      setYear(y)
    }
    setMonth(m)
  }

  // Év-választó
  // Év-választék: a jelenlegi évtől +5-re előre, -10 évig visszamenőleg —
  // a lelkész előre is tervezhet, visszamenőleg is nyomtathat (2026-04-21q)
  const yearOptions: number[] = []
  for (let y = initialYear + 5; y >= initialYear - 10; y--) yearOptions.push(y)

  // Naptár-nap kattintás → új program
  function onDayClick(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setEditingProgram(null)
    setDefaultDate(dateStr)
    setProgramDialogOpen(true)
  }

  // Program szerkesztés
  function onEdit(id: string) {
    const prog = programs.find(p => p.id === id)
    if (prog) {
      setEditingProgram(prog)
      setDefaultDate(null)
      setProgramDialogOpen(true)
    }
  }

  // Program törlés
  async function onDelete(id: string) {
    if (!confirm('Biztosan törlöd ezt a programot?')) return
    const result = await deleteProgram(id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Program törölve.')
      refreshPrograms()
    }
  }

  // Teljesítve toggle
  async function onToggleDone(id: string, done: boolean) {
    const result = await toggleProgramDone(id, done)
    if (result.error) {
      toast.error(result.error)
    } else {
      refreshPrograms()
    }
  }

  // Modal bezárás → újratöltés
  function onDialogClose() {
    setProgramDialogOpen(false)
    setEditingProgram(null)
    setDefaultDate(null)
    refreshPrograms()
  }

  function onBatchClose() {
    setBatchDialogOpen(false)
    refreshPrograms()
  }

  function changeYear(delta: number) {
    const newYear = year + delta
    setLoading(true)
    setYear(newYear)
    setMonth(newYear === today.getFullYear() ? today.getMonth() : 0)
  }

  function jumpToYear(newYear: number) {
    if (newYear === year) return
    setLoading(true)
    setYear(newYear)
    setMonth(newYear === today.getFullYear() ? today.getMonth() : 0)
  }

  return (
    <div className="card-raised relative flex h-full flex-col overflow-hidden">
      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-teal-100/55 blur-3xl" />
      <div className="shrink-0 px-5 pb-3 pt-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Gyülekezeti programok</h3>
          {/* Év-léptetés — 2026-04-21u: a natív <select> nem volt egyértelmű,
              ezért explicit gomb-pár + nagy év-badge + dropdown a gyors
              ugráshoz (pl. 2028 → 2019). A gomb-pár rögtön látható, a
              dropdown kompakt fallback régi évekhez. */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white/80 shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={() => changeYear(-1)}
              aria-label="Előző év"
              title="Előző év"
              className="flex size-7 items-center justify-center rounded-md text-slate-600 transition hover:bg-teal-50 hover:text-teal-700"
            >
              ◄
            </button>
            <div className="relative">
              <select
                value={year}
                onChange={(e) => jumpToYear(Number(e.target.value))}
                aria-label="Év kiválasztása"
                className="cursor-pointer appearance-none bg-transparent px-2 py-1 text-sm font-bold text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-200 rounded-md"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => changeYear(1)}
              aria-label="Következő év"
              title="Következő év"
              className="flex size-7 items-center justify-center rounded-md text-slate-600 transition hover:bg-teal-50 hover:text-teal-700"
            >
              ►
            </button>
            {year !== today.getFullYear() && (
              <button
                type="button"
                onClick={() => jumpToYear(today.getFullYear())}
                aria-label="Vissza a jelenlegi évhez"
                title="Jelenlegi évre"
                className="ml-0.5 rounded-md border-l border-slate-200 bg-teal-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-teal-700 transition hover:bg-teal-100"
              >
                Ma
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-5">
        {/* Hónap-fülek */}
        <div className="flex flex-wrap gap-1">
          {HU_MONTHS_SHORT.map((name, i) => {
            const count = programsByMonth[i]?.length || 0
            const doneCount = (programsByMonth[i] || []).filter(p => p.teljesitett).length
            const isActive = i === month
            const isToday = year === today.getFullYear() && i === today.getMonth()
            return (
              <button
                key={i}
                onClick={() => setMonth(i)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : isToday ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                {name}
                {count > 0 && (
                  <Badge
                    variant="secondary"
                    className={`ml-1 text-[10px] px-1 py-0 ${
                      doneCount === count ? 'bg-green-100 text-green-700' : 'bg-teal-100 text-teal-700'
                    }`}
                  >
                    {doneCount}/{count}
                  </Badge>
                )}
              </button>
            )
          })}
        </div>

        {/* Hónap navigáció */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navMonth(-1)}>◄</Button>
          <span className="text-sm font-semibold text-slate-700">
            {HU_MONTHS_SHORT[month]} {year}
          </span>
          <Button variant="ghost" size="sm" onClick={() => navMonth(1)}>►</Button>
        </div>

        {/* Mini naptár */}
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Betöltés...</div>
        ) : (
          <>
            {/* H3: Motiváló üzenet ha az egész évben nincs program */}
            {programs.length === 0 && (
              <div className="py-4 text-center bg-blue-50 rounded-lg">
                <p className="text-blue-700 font-medium">Kezdd el a tervezést!</p>
                <p className="text-blue-500 text-xs mt-1">Adj hozzá programokat az &bdquo;Új program&rdquo; vagy a &bdquo;Gyors bevitel&rdquo; gombbal.</p>
              </div>
            )}
            <ProgramCalendar
              events={monthPrograms}
              month={month}
              year={year}
              today={today}
              onDayClick={onDayClick}
            />
            <ProgramList
              events={monthPrograms}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleDone={onToggleDone}
            />
          </>
        )}

        {/* Akciógombok */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button size="sm" onClick={() => { setEditingProgram(null); setDefaultDate(null); setProgramDialogOpen(true) }}>
            + Új program
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBatchDialogOpen(true)}>
            Gyors bevitel
          </Button>
          <AnnualPlanPrint
            allPrograms={programs}
            year={year}
            congregationLogo={congregationLogo}
            congregationName={congregationName}
          />
        </div>

        {/* Modal-ok */}
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
      </div>
    </div>
  )
}
