'use client'

/**
 * UpcomingPrograms — „Gyülekezeti programok" widget (KÖZÖS, web-azonos kinézet).
 *
 * 2026-06-12 (Endre #5 — dashboard-paritás): a korábbi (Sprint J-s, emoji-tile-os)
 * egyszerű lista helyett a webes program-widget (Claude Design, 2026-06-07)
 * agenda-kártyáinak PONTOS tükre — ugyanazokkal a `kt-*` osztályokkal
 * (packages/ui/src/kartoteka.css), lucide típus-ikonokkal, típus-színekkel,
 * ismétlődés- és prioritás-chipekkel.
 *
 * Read-only változat: a desktop dashboardon a következő `daysAhead` nap
 * alkalmai nap szerint csoportosítva jelennek meg (web „Lista" nézet mintájára);
 * a szerkesztés/teljesítés/törlés a webes irányítópulton érhető el — erről a
 * kártya alján jelzés látható.
 *
 * Az ismétlődő programokat (heti/kétheti/havi) az
 * `expandUpcomingProgramOccurrences` helper bontja tényleges alkalmakra —
 * ugyanazzal a logikával, mint a webes `lib/utils/program-recurrence.ts`.
 */

import {
  Baby, BookOpen, CalendarDays, Check, Church, ClipboardList, Clock, Flag, Flower,
  Globe, HandHeart, Handshake, HeartHandshake, House, MapPin, Megaphone, Mic, Music,
  PartyPopper, Pin, Repeat, Smile, Star, Target, Tent,
  type LucideIcon,
} from 'lucide-react'

// ── A webes lib/constants/dashboard tükre (web-azonos feliratok/színek) ──

const HU_MONTHS_SHORT = [
  'Jan', 'Feb', 'Már', 'Ápr', 'Máj', 'Jún',
  'Júl', 'Aug', 'Sze', 'Okt', 'Nov', 'Dec',
] as const

const HU_DAYS_SHORT = ['vas', 'hét', 'kedd', 'szer', 'csüt', 'pén', 'szom'] as const

const PROG_TIPUS_LABELS: Record<string, string> = {
  istentisztelet: 'Istentisztelet', bibliaora: 'Bibliaóra', imaora: 'Imaóra',
  ifjusagi: 'Ifjúsági', gyerekprogram: 'Gyerekprogram', konferencia: 'Konferencia',
  hangverseny: 'Hangverseny', kozossegi: 'Közösségi', presbiteri: 'Presbiteri',
  latogatas: 'Látogatás', unnep: 'Ünnep', tabor: 'Tábor',
  evangelizacio: 'Evangélizáció', diakoniai: 'Diakónia', noszovetseg: 'Nőszövetség',
  egyeb: 'Egyéb',
}

const PROG_TIPUS_COLOR: Record<string, string> = {
  istentisztelet: '#3b82f6', bibliaora: '#f59e0b', imaora: '#8b5cf6', ifjusagi: '#ec4899',
  gyerekprogram: '#14b8a6', konferencia: '#ef4444', hangverseny: '#6366f1', kozossegi: '#10b981',
  presbiteri: '#6b7280', latogatas: '#f97316', unnep: '#eab308', tabor: '#22c55e',
  evangelizacio: '#d946ef', diakoniai: '#f43f5e', noszovetseg: '#ec4899', egyeb: '#94a3b8',
}

// A webes program-icons.tsx PROG_TIPUS_ICON tükre (egységes lucide ikonrendszer)
const PROG_TIPUS_ICON: Record<string, LucideIcon> = {
  istentisztelet: Church, bibliaora: BookOpen, imaora: HandHeart, ifjusagi: Target,
  gyerekprogram: Baby, konferencia: Mic, hangverseny: Music, kozossegi: Handshake,
  presbiteri: ClipboardList, latogatas: House, unnep: PartyPopper, tabor: Tent,
  evangelizacio: Megaphone, diakoniai: HeartHandshake, noszovetseg: Flower, egyeb: Pin,
}

const ISMETLODES_LABELS: Record<string, string> = {
  heti: 'Heti', ketheti: 'Kétheti', havi: 'Havi',
}

// ── Típusok ──────────────────────────────────────────────────────────────

export interface UpcomingProgramEntry {
  id: string
  cim: string
  /** YYYY-MM-DD */
  datum: string
  /** Többnapos program vége (YYYY-MM-DD), opcionális. */
  datum_vege?: string | null
  /** HH:MM, opcionális. */
  ido_kezdes?: string | null
  ido_befejezes?: string | null
  helyszin?: string | null
  tipus: string
  prioritas?: string | null
  ismetlodes_tipus?: string | null
  egyedi_tipus_nev?: string | null
  egyedi_emoji?: string | null
  /** Teljesítve — a webes agenda áthúzva, halványítva mutatja. */
  teljesitett?: boolean
}

export interface UpcomingProgramsProps {
  /**
   * A megjelenítendő alkalmak — ismétlődés-kibontás UTÁN
   * (lásd `expandUpcomingProgramOccurrences`).
   */
  entries: UpcomingProgramEntry[]
  /** Hány napra előre néz a widget (a fejléc-összegzéshez). Alap: 14. */
  daysAhead?: number
  /** Read-only jelzés a kártya alján (desktop). Alap: true. */
  showReadOnlyNote?: boolean
}

// ── Dátum-segédek (a webes lib/utils/program-day.ts tükre) ───────────────

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseYMD(s: string): Date {
  return new Date(s + 'T00:00:00')
}

/** Idő-tartomány felirat: „10:00–11:15" vagy „10:00". */
function fmtTime(p: UpcomingProgramEntry): string | null {
  if (!p.ido_kezdes) return null
  const s = p.ido_kezdes.slice(0, 5)
  if (p.ido_befejezes) return `${s}–${p.ido_befejezes.slice(0, 5)}`
  return s
}

/** Dátum-tartomány felirat: „Jún 14–16." / „Jún 28. – Júl 2." */
function fmtDateRange(p: UpcomingProgramEntry): string {
  const d1 = parseYMD(p.datum)
  if (p.datum_vege && p.datum_vege !== p.datum) {
    const d2 = parseYMD(p.datum_vege)
    if (d1.getMonth() === d2.getMonth()) {
      return `${HU_MONTHS_SHORT[d1.getMonth()]} ${d1.getDate()}–${d2.getDate()}.`
    }
    return `${HU_MONTHS_SHORT[d1.getMonth()]} ${d1.getDate()}. – ${HU_MONTHS_SHORT[d2.getMonth()]} ${d2.getDate()}.`
  }
  return `${HU_MONTHS_SHORT[d1.getMonth()]} ${d1.getDate()}. (${HU_DAYS_SHORT[d1.getDay()]})`
}

function progLabel(p: UpcomingProgramEntry): string {
  if (p.tipus === 'egyeb' && p.egyedi_tipus_nev) return p.egyedi_tipus_nev
  return PROG_TIPUS_LABELS[p.tipus] ?? 'Egyéb'
}

function progColor(p: UpcomingProgramEntry): string {
  return PROG_TIPUS_COLOR[p.tipus] ?? '#94a3b8'
}

// ── Ismétlődés-kibontás (a webes lib/utils/program-recurrence.ts tükre) ──

const STEP_DAYS: Record<string, number> = { heti: 7, ketheti: 14 }
/** Védőkorlát elszabadult ciklus ellen (heti × 1 év ≈ 53). */
const MAX_OCCURRENCES = 120

/** 'YYYY-MM-DD' → n nappal eltolva (UTC-matek, TZ-független). */
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' → n hónappal eltolva, a hónap végét tisztelve (jan 31 → feb 28/29). */
function addMonths(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()
  dt.setUTCDate(Math.min(d, lastDay))
  return dt.toISOString().slice(0, 10)
}

/** Két 'YYYY-MM-DD' közti naptári napok különbsége (vege - kezdes). */
function dayDiff(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000)
}

/**
 * Az ismétlődő programok (heti/kétheti/havi) kibontása tényleges alkalmakra,
 * majd szűkítés a [ma, ma+daysAhead] ablakra. A visszaadott alkalmak megtartják
 * a valódi adatbázis-`id`-t — React-kulcsként ezért `id`+`datum` kombináció kell.
 *
 * A webes `expandProgramOccurrences` logikájának tükre, kiegészítve az
 * ablak-szűréssel (a webes widget hónap-nézete helyett itt N-napos agenda fut).
 */
export function expandUpcomingProgramOccurrences(
  programs: UpcomingProgramEntry[],
  daysAhead = 14,
): UpcomingProgramEntry[] {
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate())
  const windowEnd = addDays(todayStr, daysAhead)

  const result: UpcomingProgramEntry[] = []

  for (const p of programs) {
    const rec = p.ismetlodes_tipus
    const isRecurring = rec === 'heti' || rec === 'ketheti' || rec === 'havi'

    if (!isRecurring || !p.datum) {
      result.push(p)
      continue
    }

    const spanDays = p.datum_vege ? Math.max(0, dayDiff(p.datum, p.datum_vege)) : 0
    // Horizont: az ablak vége (évhatáron átívelő 14 napos ablakot is fedi)
    const horizon = windowEnd > `${p.datum.slice(0, 4)}-12-31`
      ? windowEnd
      : `${p.datum.slice(0, 4)}-12-31`

    let cur = p.datum
    let count = 0
    while (cur <= horizon && count < MAX_OCCURRENCES) {
      result.push({
        ...p,
        datum: cur,
        datum_vege: spanDays > 0 ? addDays(cur, spanDays) : null,
      })
      cur = rec === 'havi' ? addMonths(cur, 1) : addDays(cur, STEP_DAYS[rec])
      count++
    }
  }

  // Ablak-szűrés: az alkalom érinti-e a [ma, ma+daysAhead] tartományt
  return result
    .filter((p) => {
      const start = p.datum
      const end = p.datum_vege && p.datum_vege > p.datum ? p.datum_vege : p.datum
      return start <= windowEnd && end >= todayStr
    })
    .sort((a, b) => {
      if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1
      const ta = a.ido_kezdes || '99:99'
      const tb = b.ido_kezdes || '99:99'
      if (ta !== tb) return ta.localeCompare(tb)
      return a.cim.localeCompare(b.cim, 'hu')
    })
}

// ── Részkomponensek (a webes program-icons.tsx + program-agenda-card.tsx tükre) ──

/** Típus-ikon (vagy az „egyéb" egyedi emoji), a típus színével. */
function TypeGlyph({ p, size = 18 }: { p: UpcomingProgramEntry; size?: number }) {
  if (p.tipus === 'egyeb' && p.egyedi_emoji) {
    return <span style={{ fontSize: size, lineHeight: 1 }}>{p.egyedi_emoji}</span>
  }
  const LucideGlyph = PROG_TIPUS_ICON[p.tipus] || Pin
  return <LucideGlyph size={size} strokeWidth={2} style={{ color: progColor(p) }} />
}

/** Domború ikon-csempe a típus színével (icon-raised konvenció). */
function GlyphTile({ p }: { p: UpcomingProgramEntry }) {
  const color = progColor(p)
  return (
    <span
      className="kt-glyph-tile icon-raised"
      style={{
        width: 40,
        height: 40,
        background: `color-mix(in oklab, ${color} 16%, var(--card))`,
        color,
        borderColor: `color-mix(in oklab, ${color} 30%, transparent)`,
      }}
    >
      <TypeGlyph p={p} size={19} />
    </span>
  )
}

function PriorityMark({ prioritas }: { prioritas?: string | null }) {
  if (prioritas === 'kiemelt') {
    return (
      <span className="kt-prio kt-prio-kiemelt" title="Kiemelt prioritás">
        <Star size={12} strokeWidth={2} /> Kiemelt
      </span>
    )
  }
  if (prioritas === 'fontos') {
    return (
      <span className="kt-prio kt-prio-fontos" title="Fontos">
        <Flag size={12} strokeWidth={2} /> Fontos
      </span>
    )
  }
  return null
}

/** Read-only agenda-kártya — a webes AgendaCard kinézete, műveletgombok nélkül. */
function AgendaCardReadOnly({ p, isToday }: { p: UpcomingProgramEntry; isToday?: boolean }) {
  const color = progColor(p)
  const time = fmtTime(p)
  const multi = !!(p.datum_vege && p.datum_vege !== p.datum)
  const recur = p.ismetlodes_tipus && p.ismetlodes_tipus in ISMETLODES_LABELS
    ? ISMETLODES_LABELS[p.ismetlodes_tipus]
    : null

  return (
    <div
      className={`kt-agenda-card${p.teljesitett ? ' is-done' : ''}${isToday ? ' is-today' : ''}${p.prioritas === 'kiemelt' ? ' is-kiemelt' : ''}`}
      style={{ ['--type-color' as string]: color, cursor: 'default' }}
    >
      <span className="kt-agenda-bar" style={{ background: color }} />
      <GlyphTile p={p} />
      <div className="kt-agenda-body">
        <div className="kt-agenda-titlerow">
          <span className="kt-agenda-title">{p.cim}</span>
        </div>
        <div className="kt-agenda-meta">
          {time && (
            <span className="kt-meta-item">
              <Clock size={12} /> {time}
            </span>
          )}
          {multi && (
            <span className="kt-meta-item kt-meta-multi">
              <CalendarDays size={12} /> {fmtDateRange(p)}
            </span>
          )}
          {p.helyszin && (
            <span className="kt-meta-item">
              <MapPin size={12} /> {p.helyszin}
            </span>
          )}
        </div>
        <div className="kt-agenda-tags">
          <span
            className="kt-type-chip"
            style={{ color, background: `color-mix(in oklab, ${color} 12%, transparent)` }}
          >
            {progLabel(p)}
          </span>
          {recur && (
            <span className="kt-recur-chip" title="Ismétlődő alkalom">
              <Repeat size={11} /> {recur}
            </span>
          )}
          <PriorityMark prioritas={p.prioritas} />
          {p.teljesitett && (
            <span className="kt-recur-chip" title="Teljesítve">
              <Check size={11} /> Kész
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Fő widget ────────────────────────────────────────────────────────────

export function UpcomingPrograms({ entries, daysAhead = 14, showReadOnlyNote = true }: UpcomingProgramsProps) {
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate())
  const doneCount = entries.filter((e) => e.teljesitett).length

  // Nap szerinti csoportosítás (web „Lista" nézet mintája): többnapos alkalom
  // minden érintett napnál megjelenik az ablakon belül.
  const groups: { dateStr: string; date: Date; events: UpcomingProgramEntry[] }[] = []
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
    const cell = ymd(d.getFullYear(), d.getMonth(), d.getDate())
    const events = entries.filter((p) => {
      const start = p.datum
      const end = p.datum_vege && p.datum_vege > p.datum ? p.datum_vege : p.datum
      return cell >= start && cell <= end
    })
    if (events.length) groups.push({ dateStr: cell, date: d, events })
  }

  // 2026-08-22: `kt-widget--flow` — a desktop widget is a tartalommal EGYÜTT
  // nő (nincs 760px-es plafon és nincs BELSŐ görgetés), ahogy a weben.
  // A hosszú listánál így az ablak görget, nem a csempe belseje.
  return (
    <div className="card-raised kt-widget kt-widget--flow">
      <div className="kt-glow" />

      {/* Fejléc — web-azonos */}
      <header className="kt-head">
        <div className="kt-head-title">
          <span className="kt-head-ico"><CalendarDays size={18} /></span>
          <h3>Gyülekezeti programok</h3>
        </div>
      </header>

      {/* Összegzés-sáv (a webes kt-subbar tükre, ablak-szöveggel) */}
      <div className="kt-subbar">
        <span className="kt-month-summary">
          {entries.length === 0
            ? 'Nincs program'
            : <>Következő {daysAhead} nap · <strong>{entries.length}</strong> alkalom{doneCount > 0 && <> · <strong>{doneCount}</strong> kész</>}</>}
        </span>
      </div>

      <div className="kt-scroll">
        {groups.length === 0 ? (
          <div className="kt-empty kt-empty-day">
            <span className="kt-empty-ico sm"><Smile size={22} /></span>
            <p className="kt-empty-sub">
              Nincs program a következő {daysAhead} napban. Új programokat a webes
              irányítópulton rögzíthetsz.
            </p>
          </div>
        ) : (
          <section className="kt-listview">
            {groups.map((g) => {
              const gToday = g.dateStr === todayStr
              return (
                <div key={g.dateStr} className={`kt-listgroup${gToday ? ' is-today' : ''}`}>
                  <div className="kt-listgroup-head">
                    <span className="kt-listgroup-num">{g.date.getDate()}</span>
                    <span className="kt-listgroup-dow">{HU_MONTHS_SHORT[g.date.getMonth()]}</span>
                    {gToday && <span className="kt-listgroup-today">Ma</span>}
                    <span className="kt-listgroup-line" />
                  </div>
                  <div className="kt-agenda-list">
                    {g.events.map((p) => (
                      <AgendaCardReadOnly key={`${p.id}-${p.datum}-${g.dateStr}`} p={p} isToday={gToday} />
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        )}
      </div>

      {/* Read-only jelzés — a szerkesztés a weben él */}
      {showReadOnlyNote && (
        <footer className="kt-actions">
          <span className="kt-month-summary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Globe size={13} />
            A programok rögzítése és szerkesztése a webes irányítópulton érhető el.
          </span>
        </footer>
      )}
    </div>
  )
}
