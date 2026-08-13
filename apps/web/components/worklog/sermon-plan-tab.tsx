'use client'

/**
 * Igehirdetési terv fül (2026-08-09).
 *
 * Naptár- és lista-nézet az előre tervezett alkalmakról: dátum + napszak,
 * alkalom (ünnep-javaslattal a református liturgikus naptárból), cím/téma,
 * textus + lekció (IgehelyField), énekek (EnekekField), szolgálattevő,
 * emlékeztető (app-értesítés), gyülekezeti naptár-kapcsolat (ICS-feed).
 * Eszközök: Énekkereső (teljes szövegű keresés az énekeskönyvben) és
 * Konkordancia (szentiras.eu) — az eredmény egy kattintással beemelhető.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  BookOpenText,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Music,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  convertSermonPlanToWorklog,
  deleteSermonPlan,
  listSermonPlans,
  saveSermonPlan,
} from '@/app/(dashboard)/munkanaplo/igeterv-actions'
import type { IgetervNapszak, SermonPlan } from '@/lib/worklog/igeterv-types'
import { EnekekField } from '@/components/worklog/enekek-field'
import { IgehelyField } from '@/components/worklog/igehely-field'
import { EnekKeresoDialog } from '@/components/worklog/enek-kereso-dialog'
import { KonkordanciaDialog } from '@/components/worklog/konkordancia-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getHolidayForDate } from '@/lib/utils/reformed-holidays'
import { cn } from '@/lib/utils'

const HU_MONTHS_LOCAL = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
] as const

const NAPSZAK_LABELS: Record<IgetervNapszak, string> = { de: 'de.', du: 'du.', este: 'este' }

const EML_OPTIONS = [
  { value: '', label: 'Nincs emlékeztető' },
  { value: '1', label: '1 nappal előtte' },
  { value: '2', label: '2 nappal előtte' },
  { value: '3', label: '3 nappal előtte' },
  { value: '7', label: '1 héttel előtte' },
] as const

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/** Alkalom-javaslat a dátumból: ünnepnap neve, különben vasárnapi istentisztelet. */
function suggestAlkalom(datumIso: string): string | null {
  if (!datumIso) return null
  const d = new Date(`${datumIso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const holiday = getHolidayForDate(d)
  if (holiday) return holiday.name
  if (d.getDay() === 0) return 'Vasárnapi istentisztelet'
  return null
}

interface FormState {
  id?: string
  datum: string
  napszak: IgetervNapszak
  alkalom: string
  cim: string
  textus: string
  bibliaolvasas: string
  enekek: string
  szolgalattevo: string
  megjegyzes: string
  emlNapok: string
  naptarban: boolean
}

const emptyForm = (datum?: string): FormState => ({
  datum: datum || todayIso(),
  napszak: 'de',
  alkalom: datum ? suggestAlkalom(datum) || '' : '',
  cim: '',
  textus: '',
  bibliaolvasas: '',
  enekek: '',
  szolgalattevo: '',
  megjegyzes: '',
  emlNapok: '',
  naptarban: true,
})

export function SermonPlanTab({ year }: { year: number }) {
  const [plans, setPlans] = useState<SermonPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [needsSql, setNeedsSql] = useState(false)
  const [view, setView] = useState<'naptar' | 'lista'>('naptar')
  const [monthIdx, setMonthIdx] = useState(() =>
    year === new Date().getFullYear() ? new Date().getMonth() : 0,
  )
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [enekKeresoOpen, setEnekKeresoOpen] = useState(false)
  const [konkordanciaOpen, setKonkordanciaOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listSermonPlans(year)
    if (res.error) {
      toast.error(res.error)
    } else {
      setPlans(res.plans || [])
      setNeedsSql(!!res.needsSql)
      if (res.remindersSent) {
        toast.info(`${res.remindersSent} igehirdetési emlékeztető érkezett — lásd a harang ikont.`)
      }
    }
    setLoading(false)
  }, [year])

  useEffect(() => {
    void load()
  }, [load])

  const patchForm = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  function openEditor(plan?: SermonPlan, datum?: string) {
    if (plan) {
      setForm({
        id: plan.id,
        datum: plan.datum,
        napszak: plan.napszak,
        alkalom: plan.alkalom || '',
        cim: plan.cim || '',
        textus: plan.textus || '',
        bibliaolvasas: plan.bibliaolvasas || '',
        enekek: plan.enekek || '',
        szolgalattevo: plan.szolgalattevo || '',
        megjegyzes: plan.megjegyzes || '',
        emlNapok: plan.emlekeztetoNapok == null ? '' : String(plan.emlekeztetoNapok),
        naptarban: !!plan.programId,
      })
    } else {
      setForm(emptyForm(datum))
    }
    setEditorOpen(true)
  }

  async function handleSave() {
    if (!form.datum) {
      toast.error('A dátum kötelező.')
      return
    }
    setSaving(true)
    const res = await saveSermonPlan({
      id: form.id,
      datum: form.datum,
      napszak: form.napszak,
      alkalom: form.alkalom || null,
      cim: form.cim || null,
      textus: form.textus || null,
      bibliaolvasas: form.bibliaolvasas || null,
      enekek: form.enekek || null,
      szolgalattevo: form.szolgalattevo || null,
      megjegyzes: form.megjegyzes || null,
      emlekeztetoNapok: form.emlNapok === '' ? null : Number(form.emlNapok),
      naptarban: form.naptarban,
    })
    setSaving(false)
    if (res.needsSql) {
      setNeedsSql(true)
      setEditorOpen(false)
      return
    }
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success(form.id ? 'A terv frissült.' : 'Az alkalom felkerült a tervbe.')
    // A fül a munkanapló év-választójához kötött — másik évre mentett alkalom
    // itt nem látszana, ezért szólunk, hova került.
    const savedYear = Number(form.datum.slice(0, 4))
    if (Number.isFinite(savedYear) && savedYear !== year) {
      toast.info(`Az alkalom a(z) ${savedYear}. évhez került — a fejléc év-választójával tudod megnézni.`)
    }
    setEditorOpen(false)
    await load()
  }

  async function handleDelete(plan: SermonPlan) {
    if (!window.confirm(`Törlöd a tervből: ${plan.datum} — ${plan.alkalom || plan.cim || 'alkalom'}?`)) return
    setBusyId(plan.id)
    const res = await deleteSermonPlan(plan.id)
    setBusyId(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('A terv-bejegyzés törölve.')
    await load()
  }

  async function handleConvert(plan: SermonPlan) {
    if (!window.confirm('Munkanapló-bejegyzés készül a tervből (a jelenléti adatokat utána töltsd ki). Folytatod?')) return
    setBusyId(plan.id)
    const res = await convertSermonPlanToWorklog(plan.id)
    setBusyId(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Munkanapló-bejegyzés létrehozva — a Szolgálatok fülön szerkesztheted tovább.')
    await load()
  }

  const monthPlans = useMemo(() => {
    const prefix = `${year}-${String(monthIdx + 1).padStart(2, '0')}`
    return plans.filter((p) => p.datum.startsWith(prefix))
  }, [plans, monthIdx, year])

  const plansByDay = useMemo(() => {
    const map = new Map<string, SermonPlan[]>()
    for (const p of monthPlans) {
      const list = map.get(p.datum)
      if (list) list.push(p)
      else map.set(p.datum, [p])
    }
    return map
  }, [monthPlans])

  const sortedForList = useMemo(() => {
    const today = todayIso()
    const upcoming = plans.filter((p) => p.datum >= today)
    const past = plans.filter((p) => p.datum < today).reverse()
    return { upcoming, past }
  }, [plans])

  if (needsSql) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <CalendarDays className="mx-auto size-10 text-muted-foreground" />
        <h3 className="mt-3 font-heading text-lg text-foreground">Az igehirdetési tervhez adatbázis-frissítés szükséges</h3>
        <p className="mx-auto mt-1.5 max-w-lg text-sm text-muted-foreground">
          Futtasd le a <code className="rounded bg-muted px-1.5 py-0.5 text-xs">migration-docs/sql/2026-08-09-igehirdetesi-terv.sql</code>{' '}
          fájlt a Supabase SQL Editorban — ez hozza létre a terv tábláját. Utána kattints az Újrapróbálásra.
        </p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void load()}>
          <RefreshCcw className="mr-1.5 size-4" /> Újrapróbálás
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Eszköz-sor: nézetváltó + eszközök + új alkalom ─────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-border bg-muted/50 p-0.5">
          <button
            type="button"
            onClick={() => setView('naptar')}
            aria-pressed={view === 'naptar'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium transition',
              view === 'naptar' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <CalendarDays className="size-4" /> Naptár
          </button>
          <button
            type="button"
            onClick={() => setView('lista')}
            aria-pressed={view === 'lista'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium transition',
              view === 'lista' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ListChecks className="size-4" /> Lista
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setEnekKeresoOpen(true)}>
            <Music className="mr-1.5 size-4" /> Énekkereső
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setKonkordanciaOpen(true)}>
            <BookOpenText className="mr-1.5 size-4" /> Konkordancia
          </Button>
          <Button size="sm" className="rounded-xl" onClick={() => openEditor()}>
            <Plus className="mr-1.5 size-4" /> Új alkalom
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          A terv betöltése…
        </div>
      ) : view === 'naptar' ? (
        <CalendarView
          year={year}
          monthIdx={monthIdx}
          onMonthChange={setMonthIdx}
          plansByDay={plansByDay}
          onDayClick={(datum) => openEditor(undefined, datum)}
          onPlanClick={(plan) => openEditor(plan)}
        />
      ) : (
        <ListView
          upcoming={sortedForList.upcoming}
          past={sortedForList.past}
          busyId={busyId}
          onEdit={(p) => openEditor(p)}
          onDelete={(p) => void handleDelete(p)}
          onConvert={(p) => void handleConvert(p)}
        />
      )}

      <p className="text-xs text-muted-foreground">
        A „gyülekezeti naptárban is" jelölt alkalmak a kezdőlap naptárában és a Google Naptár-feedben is
        megjelennek. Az emlékeztető app-értesítésként érkezik (harang ikon).
      </p>

      {/* ── Szerkesztő ─────────────────────────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Alkalom szerkesztése' : 'Új alkalom a tervben'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Dátum *</Label>
              <Input
                type="date"
                value={form.datum}
                onChange={(e) => {
                  const datum = e.target.value
                  const suggestion = !form.alkalom.trim() ? suggestAlkalom(datum) : null
                  patchForm({ datum, ...(suggestion ? { alkalom: suggestion } : {}) })
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Napszak</Label>
              <div className="flex gap-1.5">
                {(['de', 'du', 'este'] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => patchForm({ napszak: n })}
                    aria-pressed={form.napszak === n}
                    className={cn(
                      'min-h-9 flex-1 rounded-lg border px-2 text-sm font-medium transition',
                      form.napszak === n
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {n === 'de' ? 'Délelőtt' : n === 'du' ? 'Délután' : 'Este'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Alkalom</Label>
              <Input
                value={form.alkalom}
                onChange={(e) => patchForm({ alkalom: e.target.value })}
                placeholder="pl. Vasárnapi istentisztelet, Húsvét"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Igehirdetés címe / témája</Label>
              <Input value={form.cim} onChange={(e) => patchForm({ cim: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label>Textus (alapige)</Label>
              <IgehelyField
                value={form.textus}
                onChange={(v) => patchForm({ textus: v })}
                placeholder="pl. Jn 3,16"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Lekció (bibliaolvasás)</Label>
              <IgehelyField
                value={form.bibliaolvasas}
                onChange={(v) => patchForm({ bibliaolvasas: v })}
                placeholder="pl. Zsolt 23"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Énekek</Label>
              <EnekekField
                value={form.enekek}
                onChange={(v) => patchForm({ enekek: v })}
                placeholder="pl. 90, 153, 430b"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Szolgálattevő</Label>
              <Input value={form.szolgalattevo} onChange={(e) => patchForm({ szolgalattevo: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label>Emlékeztető</Label>
              <select
                value={form.emlNapok}
                onChange={(e) => patchForm({ emlNapok: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {EML_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Megjegyzés</Label>
              <Input value={form.megjegyzes} onChange={(e) => patchForm({ megjegyzes: e.target.value })} />
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={form.naptarban}
                onChange={(e) => patchForm({ naptarban: e.target.checked })}
              />
              <CalendarPlus className="size-4 text-muted-foreground" aria-hidden />
              Jelenjen meg a gyülekezeti naptárban is (kezdőlap + Google Naptár-feed)
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mr-auto rounded-xl"
              onClick={() => setEnekKeresoOpen(true)}
            >
              <Music className="mr-1.5 size-3.5" /> Énekkereső
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setKonkordanciaOpen(true)}
            >
              <BookOpenText className="mr-1.5 size-3.5" /> Konkordancia
            </Button>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>Mégse</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Mentés…' : 'Mentés'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Eszközök: énekkereső + konkordancia ────────────────────────────── */}
      <EnekKeresoDialog
        open={enekKeresoOpen}
        onOpenChange={setEnekKeresoOpen}
        onInsert={
          editorOpen
            ? (azonosito) => {
                const cur = form.enekek.trim()
                const parts = cur ? cur.split(',').map((s) => s.trim()).filter(Boolean) : []
                if (!parts.includes(azonosito)) parts.push(azonosito)
                patchForm({ enekek: parts.join(', ') })
                toast.success(`A(z) ${azonosito}. ének a tervhez adva.`)
              }
            : undefined
        }
      />
      <KonkordanciaDialog
        open={konkordanciaOpen}
        onOpenChange={setKonkordanciaOpen}
        onInsertRef={
          editorOpen
            ? (ref) => {
                patchForm({ textus: ref })
                toast.success(`Textus beállítva: ${ref}`)
              }
            : undefined
        }
      />
    </div>
  )
}

// ─── Naptár-nézet ───────────────────────────────────────────────────────────

function CalendarView({
  year,
  monthIdx,
  onMonthChange,
  plansByDay,
  onDayClick,
  onPlanClick,
}: {
  year: number
  monthIdx: number
  onMonthChange: (m: number) => void
  plansByDay: Map<string, SermonPlan[]>
  onDayClick: (datum: string) => void
  onPlanClick: (plan: SermonPlan) => void
}) {
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
  const firstDay = new Date(year, monthIdx, 1)
  const offset = (firstDay.getDay() + 6) % 7 // hétfő-kezdés
  const cells: Array<{ day: number; iso: string } | null> = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, iso: `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }
  const today = todayIso()

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="size-9 rounded-lg p-0"
          onClick={() => onMonthChange(Math.max(0, monthIdx - 1))}
          disabled={monthIdx === 0}
          aria-label="Előző hónap"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <p className="font-heading text-base text-foreground">{HU_MONTHS_LOCAL[monthIdx]} {year}</p>
        <Button
          variant="ghost"
          size="sm"
          className="size-9 rounded-lg p-0"
          onClick={() => onMonthChange(Math.min(11, monthIdx + 1))}
          disabled={monthIdx === 11}
          aria-label="Következő hónap"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'].map((d, i) => (
          <div key={d} className={cn('py-1', i === 6 && 'text-primary')}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) =>
          cell === null ? (
            <div key={`e${i}`} />
          ) : (
            (() => {
              const dayPlans = plansByDay.get(cell.iso) || []
              const holiday = getHolidayForDate(new Date(`${cell.iso}T00:00:00`))
              const isSunday = new Date(`${cell.iso}T00:00:00`).getDay() === 0
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => (dayPlans.length === 1 ? onPlanClick(dayPlans[0]) : onDayClick(cell.iso))}
                  className={cn(
                    'flex min-h-[64px] flex-col items-stretch gap-0.5 rounded-lg border p-1 text-left transition sm:min-h-[80px]',
                    cell.iso === today
                      ? 'border-primary/60 bg-primary/5'
                      : dayPlans.length
                        ? 'border-border bg-muted/40 hover:bg-muted/70'
                        : 'border-transparent hover:border-border hover:bg-muted/40',
                  )}
                  title={holiday ? holiday.name : undefined}
                >
                  <span
                    className={cn(
                      'text-xs font-semibold tabular-nums',
                      isSunday || holiday ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {cell.day}
                  </span>
                  {holiday ? (
                    <span className="truncate text-[9px] leading-tight text-amber-700 dark:text-amber-400">{holiday.name}</span>
                  ) : null}
                  {dayPlans.slice(0, 2).map((p) => (
                    <span
                      key={p.id}
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => { e.stopPropagation(); onPlanClick(p) }}
                      className="truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium leading-tight text-primary hover:bg-primary/20"
                    >
                      {NAPSZAK_LABELS[p.napszak]} {p.alkalom || p.cim || 'alkalom'}
                      {p.munkanaploId ? ' ✓' : ''}
                    </span>
                  ))}
                  {dayPlans.length > 2 ? (
                    <span className="text-[9px] text-muted-foreground">+{dayPlans.length - 2} további</span>
                  ) : null}
                </button>
              )
            })()
          ),
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Üres napra kattintva új alkalmat rögzíthetsz; a ✓ jel = már készült belőle munkanapló-bejegyzés.
      </p>
    </div>
  )
}

// ─── Lista-nézet ────────────────────────────────────────────────────────────

function ListView({
  upcoming,
  past,
  busyId,
  onEdit,
  onDelete,
  onConvert,
}: {
  upcoming: SermonPlan[]
  past: SermonPlan[]
  busyId: string | null
  onEdit: (p: SermonPlan) => void
  onDelete: (p: SermonPlan) => void
  onConvert: (p: SermonPlan) => void
}) {
  if (upcoming.length === 0 && past.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center">
        <CalendarDays className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Még nincs tervezett alkalom ebben az évben — az „Új alkalom" gombbal kezdheted.
        </p>
      </div>
    )
  }

  const today = todayIso()

  const renderCard = (p: SermonPlan) => (
    <li key={p.id} className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-base text-foreground">{p.datum}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {p.napszak === 'de' ? 'délelőtt' : p.napszak === 'du' ? 'délután' : 'este'}
            </span>
            {p.emlekeztetoNapok != null ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                <BellRing className="size-3" /> {p.emlekeztetoNapok} nappal előtte
              </span>
            ) : null}
            {p.programId ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CalendarPlus className="size-3" /> naptárban
              </span>
            ) : null}
            {p.munkanaploId ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                <CheckCircle2 className="size-3" /> munkanaplóban
              </span>
            ) : null}
          </p>
          <p className="mt-1 truncate font-medium text-foreground">
            {[p.alkalom, p.cim].filter(Boolean).join(' — ') || 'Tervezett alkalom'}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {p.textus ? <span>Textus: <span className="font-medium text-foreground">{p.textus}</span></span> : null}
            {p.bibliaolvasas ? <span>Lekció: {p.bibliaolvasas}</span> : null}
            {p.enekek ? (
              <span className="inline-flex items-center gap-1">
                <Music className="size-3" /> {p.enekek}
              </span>
            ) : null}
            {p.szolgalattevo ? <span>Szolgál: {p.szolgalattevo}</span> : null}
          </p>
          {p.megjegyzes ? <p className="mt-1 text-xs text-muted-foreground">{p.megjegyzes}</p> : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {!p.munkanaploId && p.datum <= today ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-lg px-2 text-xs"
              disabled={busyId === p.id}
              onClick={() => onConvert(p)}
              title="Munkanapló-bejegyzés készítése a tervből"
            >
              <NotebookPen className="mr-1 size-3.5" /> Munkanaplóba
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-lg px-2 text-xs"
            disabled={busyId === p.id}
            onClick={() => onEdit(p)}
          >
            <Pencil className="mr-1 size-3.5" /> Szerk.
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-lg px-2 text-xs text-red-500"
            disabled={busyId === p.id}
            onClick={() => onDelete(p)}
          >
            <Trash2 className="mr-1 size-3.5" /> Törlés
          </Button>
        </div>
      </div>
    </li>
  )

  return (
    <div className="space-y-4">
      {upcoming.length > 0 ? (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Következő alkalmak
          </h3>
          <ul className="space-y-2">{upcoming.map(renderCard)}</ul>
        </section>
      ) : null}
      {past.length > 0 ? (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Korábbi alkalmak
          </h3>
          <ul className="space-y-2">{past.map(renderCard)}</ul>
        </section>
      ) : null}
    </div>
  )
}
