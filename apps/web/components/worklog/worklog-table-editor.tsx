'use client'

// 2026-07-11 (F2 — W3): táblázatos havi rögzítő a hivatalos nyomtatott
// munkanapló logikája szerint. Soron belüli szerkesztés: minden sor saját
// draft-state-tel dolgozik, és akkor mentődik (saveWorklog, id + revision),
// amikor a fókusz elhagyja a sort vagy Entert nyomnak. A táblázat alján
// mindig áll egy üres beviteli sor az új bejegyzéshez.
//
// Adat-kontraktus (F2): napszak: 'de' | 'du' | 'este', a legacy `du`
// boolean-nal szinkronban (du = napszak === 'du'); uv_templomban /
// uv_betegnel: number | null — csak szolgálat kategóriánál értelmezett.
//
// MOBIL: a rács overflow-x-auto konténerben él (az oldal sosem görget
// vízszintesen), md alatt rövid jelzés ajánlja a dialógusos rögzítést.
//
// PERF (F4-review follow-up): az EditorRow memo-zott, sor-kulcsos (dispatch)
// callbackekkel és cache-elt baseline-draftokkal — egy cella gépelése csak a
// SAJÁT sorát rendereli újra („Egész év” nézetben 150+ sor mellett is).

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, Ref } from 'react'
import { Loader2, Pencil, Plus, Smartphone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { deleteWorklog, saveWorklog } from '@/app/(dashboard)/munkanaplo/actions'
import { NAPSZAK_OPTIONS, WORKLOG_TYPES } from '@/lib/constants/worklog'
import type { WorklogCategory, WorklogEntry } from '@/lib/constants/worklog'
import type { WorklogInput } from '@/lib/validations/worklog'
import { cn } from '@/lib/utils'
// A két „okos” mezőt párhuzamos munkafolyam készíti — a kontraktus:
// { value, onChange, onBlur?, onKeyDown?, className?, placeholder?, compact?, id? }
import { EnekekField } from './enekek-field'
import { IgehelyField } from './igehely-field'

export interface WorklogTableEditorProps {
  /** A TELJES év adott kategóriájú bejegyzései, dátum szerint növekvő sorrendben. */
  yearEntries: WorklogEntry[]
  year: number
  /** 1-12, vagy null = egész év. */
  month: number | null
  category: WorklogCategory
  /** Mentés/törlés után a szülő újratölt. */
  onChanged: () => void
  /**
   * Dialógusos (űrlapos) szerkesztés megnyitása — a táblázatban nem látható
   * mezők (pl. Megjegyzés/Cím minden kategóriánál) is szerkeszthetők vele.
   * Ha meg van adva, a műveletek-cellában ceruza-ikon jelenik meg.
   */
  onEditEntry?: (entry: WorklogEntry) => void
}

// ---------------------------------------------------------------------------
// Draft-modell: minden mező stringként él a state-ben ('' → null mentéskor),
// a napszak kivételével. A draft MINDEN menthető mezőt tartalmaz — a nem
// renderelt oszlopok értéke a betöltött sorból öröklődik, így a mentés nem
// nullázza ki a más kategóriában rögzített adatokat (a saveWorklog a teljes
// rekordot írja).
// ---------------------------------------------------------------------------

type Napszak = 'de' | 'du' | 'este'

interface RowDraft {
  idopont: string
  jellege: string
  napszak: Napszak
  cim: string
  bibliaolvasas: string
  alapige: string
  enekek: string
  szolgalt: string
  megjegyzes: string
  jelenlet_ferfi: string
  jelenlet_no: string
  jelenlet_gyermek: string
  uv_templomban: string
  uv_betegnel: string
  persely: string
}

const DRAFT_KEYS: (keyof RowDraft)[] = [
  'idopont', 'jellege', 'napszak', 'cim', 'bibliaolvasas', 'alapige', 'enekek',
  'szolgalt', 'megjegyzes', 'jelenlet_ferfi', 'jelenlet_no', 'jelenlet_gyermek',
  'uv_templomban', 'uv_betegnel', 'persely',
]

function numToStr(n: number | null | undefined): string {
  return n == null ? '' : String(n)
}

/** '' vagy értelmezhetetlen érték → null; különben nemnegatív egész. */
function toInt(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  if (Number.isNaN(n)) return null
  return Math.max(0, Math.trunc(n))
}

/** '' vagy értelmezhetetlen érték → null; különben nemnegatív szám (persely). */
function toDecimal(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  if (Number.isNaN(n)) return null
  return Math.max(0, n)
}

function entryToDraft(e: WorklogEntry): RowDraft {
  return {
    idopont: (e.idopont || '').split('T')[0] || '',
    jellege: e.jellege || '',
    // Legacy sorok: ha nincs napszak, a du boolean dönt (kontraktus).
    napszak: e.napszak ?? (e.du ? 'du' : 'de'),
    cim: e.cim || '',
    bibliaolvasas: e.bibliaolvasas || '',
    alapige: e.alapige || '',
    enekek: e.enekek || '',
    szolgalt: e.szolgalt || '',
    megjegyzes: e.megjegyzes || '',
    jelenlet_ferfi: numToStr(e.jelenlet_ferfi),
    jelenlet_no: numToStr(e.jelenlet_no),
    jelenlet_gyermek: numToStr(e.jelenlet_gyermek),
    uv_templomban: numToStr(e.uv_templomban),
    uv_betegnel: numToStr(e.uv_betegnel),
    persely: numToStr(e.persely),
  }
}

function isDirty(a: RowDraft, b: RowDraft): boolean {
  return DRAFT_KEYS.some((k) => a[k] !== b[k])
}

/**
 * Egy mező cseréje a draftban. A cast a `napszak` literál-uniója miatt kell
 * (generikus computed-key spreadet a TS nem szűkíti vissza RowDraft-ra) —
 * a hívóhelyek generikus onField-szignatúrája garantálja a típushelyességet.
 */
function withField(base: RowDraft, field: keyof RowDraft, value: string): RowDraft {
  return { ...base, [field]: value } as RowDraft
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Új-sor dátum-default: a kiválasztott hónap 1-je, vagy a mai nap, ha az aktuális hónap. */
function defaultNewDate(year: number, month: number | null): string {
  const now = new Date()
  if (month != null) {
    if (year === now.getFullYear() && month === now.getMonth() + 1) return localToday()
    return `${year}-${pad2(month)}-01`
  }
  return year === now.getFullYear() ? localToday() : `${year}-01-01`
}

function emptyDraft(year: number, month: number | null): RowDraft {
  return {
    idopont: defaultNewDate(year, month),
    jellege: '',
    napszak: 'de',
    cim: '', bibliaolvasas: '', alapige: '', enekek: '', szolgalt: '', megjegyzes: '',
    jelenlet_ferfi: '', jelenlet_no: '', jelenlet_gyermek: '',
    uv_templomban: '', uv_betegnel: '', persely: '',
  }
}

/**
 * A teljes draft megy ki — a nem látható mezők a betöltött sor értékét
 * hordozzák, így a saveWorklog teljes-rekord írása nem töröl adatot.
 * (mediapath és id_jellege szándékosan NEM megy: azokat az action védi.)
 */
function toInput(draft: RowDraft, category: WorklogCategory, entry?: WorklogEntry): WorklogInput {
  return {
    id: entry?.id,
    // Optimista zárolás: a betöltött revision megy vissza (legacy soron nincs).
    revision: entry?.revision ?? undefined,
    idopont: draft.idopont,
    jellege: draft.jellege,
    kategoria: category,
    cim: draft.cim.trim() || null,
    bibliaolvasas: draft.bibliaolvasas.trim() || null,
    alapige: draft.alapige.trim() || null,
    enekek: draft.enekek.trim() || null,
    szolgalt: draft.szolgalt.trim() || null,
    megjegyzes: draft.megjegyzes.trim() || null,
    jelenlet_ferfi: toInt(draft.jelenlet_ferfi),
    jelenlet_no: toInt(draft.jelenlet_no),
    jelenlet_gyermek: toInt(draft.jelenlet_gyermek),
    persely: toDecimal(draft.persely),
    // Kontraktus: du = napszak === 'du' (a legacy boolean szinkronban marad).
    napszak: draft.napszak,
    du: draft.napszak === 'du',
    uv_templomban: toInt(draft.uv_templomban),
    uv_betegnel: toInt(draft.uv_betegnel),
  }
}

// ---------------------------------------------------------------------------
// Cella-stílusok — token-alapú, kompakt (keret nélkül, fókusz-ringgel).
// ---------------------------------------------------------------------------

const CELL_INPUT =
  'h-8 w-full min-w-0 rounded-md border-0 bg-transparent px-2 text-sm text-foreground outline-none ' +
  'placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring'

const NUM_INPUT =
  'px-1 text-right tabular-nums [appearance:textfield] ' +
  '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

function Th({ children, className, title }: { children?: ReactNode; className?: string; title?: string }) {
  return (
    <th
      scope="col"
      title={title}
      className={cn(
        'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-2 py-2 text-left',
        'text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  )
}

function NumInput({
  value, onChange, label, className, decimal,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  className?: string
  decimal?: boolean
}) {
  return (
    <input
      type="number"
      inputMode={decimal ? 'decimal' : 'numeric'}
      min={0}
      step={decimal ? '0.01' : '1'}
      value={value}
      aria-label={label}
      title={label}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      className={cn(CELL_INPUT, NUM_INPUT, className)}
    />
  )
}

// ---------------------------------------------------------------------------
// Egy sor (meglévő VAGY az alsó, mindig-üres új sor).
//
// PERF: a sor memo-zott — minden propja referencia-stabil (a draft a szülő
// cache-éből / state-éből jön, a callbackek sor-kulcsos dispatchek), így egy
// másik sor gépelése ezt a sort NEM rendereli újra.
// ---------------------------------------------------------------------------

/** Sor-kulcs: meglévő sor id-ja vagy 'new' (az alsó, mindig-üres sor). */
type RowKey = number | 'new'

interface EditorRowProps {
  /** A sor kulcsa — a stabil (dispatch-stílusú) callbackek ezzel hívódnak. */
  rowKey: RowKey
  category: WorklogCategory
  /** CSAK a saját sor draftja — referencia-stabil, amíg a sort nem érintik (memo!). */
  draft: RowDraft
  /** Éven belüli folyamatos sorszám (csak megjelenítés); új sornál nem jelenik meg. */
  ssz?: number
  dirty: boolean
  saving: boolean
  deleting?: boolean
  isNew?: boolean
  onField: (rowKey: RowKey, field: keyof RowDraft, value: string) => void
  /** Enter — a sor azonnali mentése. */
  onCommit: (rowKey: RowKey) => void
  /** A fókusz elhagyta a sort — mentés, ha piszkos. */
  onRowLeave: (rowKey: RowKey) => void
  onDelete?: (rowKey: number) => void
  /** Dialógusos (űrlapos) szerkesztés — minden mező elérhető benne. */
  onEditForm?: (rowKey: number) => void
  dateRef?: Ref<HTMLInputElement>
}

const EditorRow = memo(function EditorRow({
  rowKey, category, draft, ssz, dirty, saving, deleting, isNew,
  onField: onFieldProp, onCommit: onCommitProp, onRowLeave: onRowLeaveProp,
  onDelete: onDeleteProp, onEditForm: onEditFormProp, dateRef,
}: EditorRowProps) {
  const rowRef = useRef<HTMLTableRowElement | null>(null)

  // Lokális wrapperek: a dispatch-propok sor-kulccsal hívódnak, a JSX pedig a
  // korábbi (kulcs nélküli) szignatúrát használja. Ezek a wrapperek csak a sor
  // SAJÁT renderelésekor készülnek újra — a memo-határt nem érintik; az
  // EnekekField/IgehelyField amúgy sem memo-zott, propjaik frissessége számít.
  function onField<K extends keyof RowDraft>(field: K, value: RowDraft[K]) {
    onFieldProp(rowKey, field, value)
  }
  const onCommit = () => onCommitProp(rowKey)
  const onRowLeave = () => onRowLeaveProp(rowKey)
  // Törlés/űrlap-szerkesztés csak meglévő (szám-kulcsú) sorokra érkezik.
  const numericRowKey = rowKey === 'new' ? null : rowKey
  const deleteCb = onDeleteProp
  const editCb = onEditFormProp
  const onDelete = deleteCb && numericRowKey !== null ? () => deleteCb(numericRowKey) : undefined
  const onEditForm = editCb && numericRowKey !== null ? () => editCb(numericRowKey) : undefined

  // A blur-időzítő mindig a legfrissebb handlert hívja (stale closure ellen).
  // Effect-ben frissül (render közbeni ref-írás lint-hibát adna); dep-lista
  // nélkül minden render után lefut, így a 120 ms-os időzítő sosem lát elavultat.
  const leaveRef = useRef(onRowLeave)
  useEffect(() => {
    leaveRef.current = onRowLeave
  })

  // React onBlur = focusout (bubbol): kis késleltetéssel ellenőrizzük, hogy a
  // fókusz tényleg elhagyta-e a sort — cellák közti Tab / okos-mező legördülő
  // közben nem mentünk.
  function handleBlur() {
    window.setTimeout(() => {
      const row = rowRef.current
      if (row && !row.contains(document.activeElement)) leaveRef.current()
    }, 120)
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLTableRowElement>) {
    if (e.key !== 'Enter' || e.defaultPrevented) return
    // Gombon (pl. törlés) az Enter a gombot aktiválja, nem a sort menti.
    if ((e.target as HTMLElement).tagName === 'BUTTON') return
    e.preventDefault()
    onCommit()
  }

  const types = WORKLOG_TYPES[category] || []
  const td = 'px-1 py-0.5 align-middle'

  return (
    <tr
      ref={rowRef}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn('transition-colors', isNew ? 'bg-muted/30' : 'hover:bg-muted/30')}
    >
      {/* Ssz. + piszkos-jelzés (bal szegély-token) + mentés-spinner */}
      <td
        className={cn(
          'w-10 border-l-2 px-2 py-1 text-center align-middle text-xs tabular-nums text-muted-foreground',
          dirty ? 'border-l-primary' : 'border-l-transparent',
        )}
      >
        {saving ? (
          <Loader2 className="mx-auto size-3.5 animate-spin text-primary" aria-label="Mentés folyamatban" />
        ) : isNew ? (
          <Plus className="mx-auto size-3.5 text-muted-foreground/70" aria-hidden="true" />
        ) : (
          ssz
        )}
      </td>

      {/* Dátum */}
      <td className={td}>
        <input
          ref={dateRef}
          type="date"
          value={draft.idopont}
          aria-label="Dátum"
          onChange={(e) => onField('idopont', e.target.value)}
          className={cn(CELL_INPUT, 'w-[8.25rem]')}
        />
      </td>

      {/* Jelleg */}
      <td className={td}>
        <select
          value={draft.jellege}
          aria-label="Jelleg"
          onChange={(e) => onField('jellege', e.target.value)}
          className={cn(CELL_INPUT, 'px-1', !draft.jellege && 'text-muted-foreground/60')}
        >
          <option value="">— jelleg —</option>
          {/* Legacy/egyedi típus megőrzése — különben a select üresre ugrana. */}
          {draft.jellege && !types.includes(draft.jellege) && (
            <option value={draft.jellege}>{draft.jellege}</option>
          )}
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </td>

      {category === 'szolgalat' && (
        <>
          {/* Napszak (de/du/este — a legacy `du`-val szinkronban) */}
          <td className={td}>
            <select
              value={draft.napszak}
              aria-label="Napszak"
              onChange={(e) => onField('napszak', e.target.value as Napszak)}
              className={cn(CELL_INPUT, 'px-1')}
            >
              {NAPSZAK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </td>
          <td className={td}>
            <IgehelyField
              compact
              value={draft.bibliaolvasas}
              onChange={(v) => onField('bibliaolvasas', v)}
              className={CELL_INPUT}
              placeholder="Zsolt 23"
            />
          </td>
          <td className={td}>
            <IgehelyField
              compact
              value={draft.alapige}
              onChange={(v) => onField('alapige', v)}
              className={CELL_INPUT}
              placeholder="Jn 3,16"
            />
          </td>
          <td className={td}>
            <EnekekField
              compact
              value={draft.enekek}
              onChange={(v) => onField('enekek', v)}
              className={CELL_INPUT}
              placeholder="42, 165"
            />
          </td>
        </>
      )}

      {category !== 'szolgalat' && (
        <td className={td}>
          <input
            type="text"
            value={draft.cim}
            aria-label={category === 'latogatas' ? 'Cím / család' : 'Cím'}
            placeholder={category === 'latogatas' ? 'Cím / család' : 'Cím / téma'}
            onChange={(e) => onField('cim', e.target.value)}
            className={CELL_INPUT}
          />
        </td>
      )}

      {/* Jelenlét F / N / Gy — szolgálat + katekézis */}
      {category !== 'latogatas' && (
        <>
          <td className={td}>
            <NumInput value={draft.jelenlet_ferfi} onChange={(v) => onField('jelenlet_ferfi', v)} label="Jelenlét — férfi" />
          </td>
          <td className={td}>
            <NumInput value={draft.jelenlet_no} onChange={(v) => onField('jelenlet_no', v)} label="Jelenlét — nő" />
          </td>
          <td className={td}>
            <NumInput value={draft.jelenlet_gyermek} onChange={(v) => onField('jelenlet_gyermek', v)} label="Jelenlét — gyermek" />
          </td>
        </>
      )}

      {/* Úrvacsora T / B — csak szolgálat */}
      {category === 'szolgalat' && (
        <>
          <td className={td}>
            <NumInput value={draft.uv_templomban} onChange={(v) => onField('uv_templomban', v)} label="Úrvacsorázók a templomban" />
          </td>
          <td className={td}>
            <NumInput value={draft.uv_betegnel} onChange={(v) => onField('uv_betegnel', v)} label="Úrvacsorázók betegnél" />
          </td>
        </>
      )}

      {/* Szolgálattevő / Tartotta / Lelkész-látogató */}
      <td className={td}>
        <input
          type="text"
          value={draft.szolgalt}
          aria-label={category === 'szolgalat' ? 'Szolgálattevő' : category === 'katekezis' ? 'Tartotta' : 'Lelkész / látogató'}
          placeholder="Név"
          onChange={(e) => onField('szolgalt', e.target.value)}
          className={CELL_INPUT}
        />
      </td>

      {/* Megjegyzés — csak látogatás */}
      {category === 'latogatas' && (
        <td className={td}>
          <input
            type="text"
            value={draft.megjegyzes}
            aria-label="Megjegyzés"
            placeholder="Megjegyzés"
            onChange={(e) => onField('megjegyzes', e.target.value)}
            className={CELL_INPUT}
          />
        </td>
      )}

      {/* Persely — szolgálat + katekézis */}
      {category !== 'latogatas' && (
        <td className={td}>
          <NumInput decimal value={draft.persely} onChange={(v) => onField('persely', v)} label="Persely (RON)" className="w-20" />
        </td>
      )}

      {/* Műveletek */}
      <td className="w-16 px-1 py-0.5 text-center align-middle">
        {!isNew && (
          <span className="inline-flex items-center gap-0.5">
            {onEditForm && (
              <button
                type="button"
                onClick={onEditForm}
                aria-label="Szerkesztés űrlapon (minden mező)"
                title="Szerkesztés űrlapon (minden mező)"
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
                  'hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                aria-label="Bejegyzés törlése"
                title="Törlés"
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
                  'hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:pointer-events-none disabled:opacity-50',
                )}
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </button>
            )}
          </span>
        )}
      </td>
    </tr>
  )
})

// ---------------------------------------------------------------------------
// Fő komponens
// ---------------------------------------------------------------------------

export function WorklogTableEditor({ yearEntries, year, month, category, onChanged, onEditEntry }: WorklogTableEditorProps) {
  // Csak a megérintett sorokhoz tárolunk draftot; a megjelenített érték
  // draft ?? getBaseline(entry) (cache-elt entryToDraft). Sikeres mentés után
  // a draft törlődik, a friss adat a szülő újratöltéséből (onChanged) jön.
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [newDraft, setNewDraft] = useState<RowDraft>(() => emptyDraft(year, month))
  const [savingIds, setSavingIds] = useState<Set<number | 'new'>>(() => new Set())
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Async handlerek (blur-időzítő) mindig a legfrissebb state-et lássák.
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const newDraftRef = useRef(newDraft)
  newDraftRef.current = newDraft
  // Dupla mentés elleni őr (Enter + blur egyszerre).
  const inFlight = useRef<Set<number | 'new'>>(new Set())
  const newDateRef = useRef<HTMLInputElement | null>(null)

  const entriesById = useMemo(() => new Map(yearEntries.map((e) => [e.id, e])), [yearEntries])

  // Baseline-cache (PERF): az entryToDraft entry-objektumonként EGYSZER fut le
  // (lazy, első használatkor), és referencia-stabil draftot ad — a memo-zott
  // EditorRow draft-propja így nem változik, amíg a sort nem érintették.
  // Újratöltéskor (onChanged) új entry-objektumok jönnek, a WeakMap magától
  // „frissül” (a régiek a GC-re maradnak).
  const baselineCache = useRef(new WeakMap<WorklogEntry, RowDraft>())
  function getBaseline(entry: WorklogEntry): RowDraft {
    let baseline = baselineCache.current.get(entry)
    if (!baseline) {
      baseline = entryToDraft(entry)
      baselineCache.current.set(entry, baseline)
    }
    return baseline
  }

  // Év/hónap/kategória-váltáskor az új-sor draft friss defaultot kap.
  useEffect(() => {
    setNewDraft(emptyDraft(year, month))
  }, [year, month, category])

  // month != null → csak az adott hónap sorai; a Ssz. akkor is az ÉVEN
  // belüli folyamatos index (a yearEntries dátum szerint növekvő).
  const visible = useMemo(() => {
    const rows = yearEntries.map((entry, i) => ({ entry, ssz: i + 1 }))
    if (month == null) return rows
    return rows.filter(({ entry }) => Number((entry.idopont || '').slice(5, 7)) === month)
  }, [yearEntries, month])

  function setSaving(id: number | 'new', on: boolean) {
    if (on) inFlight.current.add(id)
    else inFlight.current.delete(id)
    setSavingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function setRowField(id: number, field: keyof RowDraft, value: string) {
    const entry = entriesById.get(id)
    if (!entry) return
    setDrafts((prev) => ({
      ...prev,
      [id]: withField(prev[id] ?? getBaseline(entry), field, value),
    }))
  }

  async function saveExistingRow(id: number) {
    if (inFlight.current.has(id)) return
    const entry = entriesById.get(id)
    const draft = draftsRef.current[id]
    if (!entry || !draft) return
    if (!isDirty(draft, getBaseline(entry))) return
    if (!draft.idopont || !draft.jellege) {
      toast.error('A dátum és a jelleg kitöltése kötelező — a sor még nincs mentve.')
      return
    }
    setSaving(id, true)
    try {
      const result = await saveWorklog(toInput(draft, category, entry))
      if (result.error) {
        // Konkurencia (vagy validációs) hiba: a beírt értékek megmaradnak a
        // draftban, a friss adatot a szülő újratölti — újrapróbálható.
        toast.error(result.error)
        onChanged()
      } else {
        setDrafts((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        toast.success('Sor mentve.')
        onChanged()
      }
    } finally {
      setSaving(id, false)
    }
  }

  async function saveNewRow(viaEnter = false) {
    if (inFlight.current.has('new')) return
    const draft = newDraftRef.current
    // Amíg a dátum + jelleg nincs kitöltve, a sor-elhagyás csendben marad.
    if (!draft.idopont || !draft.jellege) {
      if (viaEnter) toast.error('Az új sor mentéséhez a dátum és a jelleg kitöltése szükséges.')
      return
    }
    setSaving('new', true)
    try {
      const result = await saveWorklog(toInput(draft, category))
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Új bejegyzés rögzítve.')
      setNewDraft(emptyDraft(year, month))
      onChanged()
      // Enterrel rögzítő „gyorsírók”: a fókusz visszaáll az új sor dátumára.
      if (viaEnter) requestAnimationFrame(() => newDateRef.current?.focus())
    } finally {
      setSaving('new', false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Biztosan törli a bejegyzést?')) return
    setDeletingId(id)
    try {
      const result = await deleteWorklog(id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      toast.success('Bejegyzés törölve.')
      onChanged()
    } finally {
      setDeletingId(null)
    }
  }

  function openEditForm(id: number) {
    const entry = entriesById.get(id)
    if (entry) onEditEntry?.(entry)
  }

  // ---- Stabil sor-callbackek (PERF) ---------------------------------------
  // A memo-zott EditorRow referencia-stabil callbackeket kap; a mindig friss
  // handlereket ref-en át hívjuk (stale closure ellen — ugyanaz a minta, mint
  // a sorbeli leaveRef). A useCallback-ek deps nélkül SOHA nem cserélődnek.
  const actionsRef = useRef({ setRowField, saveExistingRow, saveNewRow, handleDelete, openEditForm })
  actionsRef.current = { setRowField, saveExistingRow, saveNewRow, handleDelete, openEditForm }

  const handleRowField = useCallback((rowKey: RowKey, field: keyof RowDraft, value: string) => {
    if (rowKey === 'new') setNewDraft((prev) => withField(prev, field, value))
    else actionsRef.current.setRowField(rowKey, field, value)
  }, [])

  const handleRowCommit = useCallback((rowKey: RowKey) => {
    if (rowKey === 'new') void actionsRef.current.saveNewRow(true)
    else void actionsRef.current.saveExistingRow(rowKey)
  }, [])

  const handleRowLeave = useCallback((rowKey: RowKey) => {
    if (rowKey === 'new') void actionsRef.current.saveNewRow(false)
    else void actionsRef.current.saveExistingRow(rowKey)
  }, [])

  const handleRowDelete = useCallback((id: number) => {
    void actionsRef.current.handleDelete(id)
  }, [])

  const handleRowEditForm = useCallback((id: number) => {
    actionsRef.current.openEditForm(id)
  }, [])

  const colCount = category === 'szolgalat' ? 15 : category === 'katekezis' ? 10 : 7
  const newRowDirty = isDirty(newDraft, emptyDraft(year, month))

  return (
    <div className="space-y-2">
      {/* Mobil-jelzés: telefonon a dialógusos rögzítés a kényelmesebb út. */}
      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground md:hidden">
        <Smartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Telefonon az „+ Új bejegyzés” gombbal nyíló ablak kényelmesebb — ez a táblázat vízszintesen görgethető.
      </p>

      {/* A rács overflow-konténere: az OLDAL sosem görget vízszintesen, csak
          ez a doboz; a max-magasság miatt a fejléc sticky-je is működik. */}
      <div className="max-h-[70dvh] w-full overflow-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            {category === 'szolgalat' ? (
              <tr>
                <Th className="w-10 text-center" title="Éven belüli folyamatos sorszám">Ssz.</Th>
                <Th className="min-w-[8.75rem]">Dátum</Th>
                <Th className="min-w-[9.5rem]">Jelleg</Th>
                <Th className="min-w-[6.5rem]">Napszak</Th>
                <Th className="min-w-[8.5rem]" title="Bibliaolvasás (igehely)">Bibliaolvasás</Th>
                <Th className="min-w-[8.5rem]" title="Az igehirdetés alapigéje">Alapige</Th>
                <Th className="min-w-[9rem]">Énekek</Th>
                <Th className="w-12 min-w-[3rem] text-center" title="Jelenlét — férfi">F</Th>
                <Th className="w-12 min-w-[3rem] text-center" title="Jelenlét — nő">N</Th>
                <Th className="w-12 min-w-[3rem] text-center" title="Jelenlét — gyermek">Gy</Th>
                <Th className="w-14 min-w-[3.5rem] text-center" title="Úrvacsorázók a templomban">Úrv. T</Th>
                <Th className="w-14 min-w-[3.5rem] text-center" title="Úrvacsorázók betegnél">Úrv. B</Th>
                <Th className="min-w-[8rem]">Szolgálattevő</Th>
                <Th className="w-20 min-w-[5rem] text-right" title="Perselypénz (RON)">Persely</Th>
                <Th className="w-16"><span className="sr-only">Műveletek</span></Th>
              </tr>
            ) : category === 'katekezis' ? (
              <tr>
                <Th className="w-10 text-center" title="Éven belüli folyamatos sorszám">Ssz.</Th>
                <Th className="min-w-[8.75rem]">Dátum</Th>
                <Th className="min-w-[9.5rem]">Jelleg</Th>
                <Th className="min-w-[10rem]">Cím</Th>
                <Th className="w-12 min-w-[3rem] text-center" title="Jelenlét — férfi">F</Th>
                <Th className="w-12 min-w-[3rem] text-center" title="Jelenlét — nő">N</Th>
                <Th className="w-12 min-w-[3rem] text-center" title="Jelenlét — gyermek">Gy</Th>
                <Th className="min-w-[8rem]">Tartotta</Th>
                <Th className="w-20 min-w-[5rem] text-right" title="Perselypénz (RON)">Persely</Th>
                <Th className="w-16"><span className="sr-only">Műveletek</span></Th>
              </tr>
            ) : (
              <tr>
                <Th className="w-10 text-center" title="Éven belüli folyamatos sorszám">Ssz.</Th>
                <Th className="min-w-[8.75rem]">Dátum</Th>
                <Th className="min-w-[9.5rem]">Jelleg</Th>
                <Th className="min-w-[10rem]">Cím / család</Th>
                <Th className="min-w-[8rem]">Lelkész / látogató</Th>
                <Th className="min-w-[12rem]">Megjegyzés</Th>
                <Th className="w-16"><span className="sr-only">Műveletek</span></Th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-border">
            {visible.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {month != null
                    ? 'Ebben a hónapban még nincs bejegyzés.'
                    : 'Ebben az évben még nincs bejegyzés.'}{' '}
                  Kezdje az alábbi új sorral — a dátum és a jelleg kitöltése után magától mentődik.
                </td>
              </tr>
            )}

            {visible.map(({ entry, ssz }) => {
              // Lazy draft (PERF): a baseline cache-ből jön (stabil referencia),
              // draft csak a megérintett sorokhoz él, és az isDirty is csak
              // azokra fut le — a többi sor propjai változatlanok → memo-skip.
              const rowDraft = drafts[entry.id]
              const baseline = getBaseline(entry)
              return (
                <EditorRow
                  key={entry.id}
                  rowKey={entry.id}
                  category={category}
                  draft={rowDraft ?? baseline}
                  ssz={ssz}
                  dirty={rowDraft !== undefined && isDirty(rowDraft, baseline)}
                  saving={savingIds.has(entry.id)}
                  deleting={deletingId === entry.id}
                  onField={handleRowField}
                  onCommit={handleRowCommit}
                  onRowLeave={handleRowLeave}
                  onDelete={handleRowDelete}
                  onEditForm={onEditEntry ? handleRowEditForm : undefined}
                />
              )
            })}

            {/* Mindig-üres új beviteli sor a táblázat alján. */}
            <EditorRow
              isNew
              rowKey="new"
              category={category}
              draft={newDraft}
              dirty={newRowDirty}
              saving={savingIds.has('new')}
              onField={handleRowField}
              onCommit={handleRowCommit}
              onRowLeave={handleRowLeave}
              dateRef={newDateRef}
            />
          </tbody>
        </table>
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        A sorok automatikusan mentődnek, amikor a fókusz elhagyja a sort, vagy Entert nyom.
        A piszkos (még nem mentett) sort bal oldali színes szegély jelzi.
      </p>
    </div>
  )
}
