'use client'

// ── Éves programterv — Claude Design „eves-terv.html" pixelhű átültetése (2026-06-08) ──
// Alkalmazáson belüli, reszponzív ablak (modál + iframe). A lap a design
// `.ep-*` elrendezése: fejléc-sáv (logó + vezérige), 12 hónap 6×2 rácsban,
// kiemelt alkalmak, jelmagyarázat, KARTOTÉKA-lábléc. Valós adatokkal.
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Printer, Download, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { PROG_TIPUS_COLOR } from '@/lib/constants/dashboard'
import type { Program, ProgramTipus } from '@/lib/constants/dashboard'
import { expandProgramOccurrences } from '@/lib/utils/program-recurrence'
import { getUnnepnapokForYear } from '@/lib/utils/reformed-holidays'
import { getProgramsForYear } from '@/app/(dashboard)/programs/actions'

interface AnnualPlanPrintProps {
  allPrograms: Program[]
  year: number
  congregationName: string
  congregationLogo?: string | null
  /** 2026-08-10: ikonos (felirat nélküli) indítógomb a kompakt akciósávhoz. */
  compact?: boolean
}

// ── Az év vezérigéi (a gyülekezet a sajátját is beírhatja — szerkeszthető) ──
const VEZERIGE: Record<number, { text: string; ref: string }> = {
  2024: { text: 'Minden dolgotok szeretetben menjen végbe!', ref: '1Korinthus 16,14' },
  2025: { text: 'Maradjatok meg az én szeretetemben.', ref: 'János 15,9' },
  2026: { text: 'Az Úr az én világosságom és üdvösségem: kitől féljek?', ref: 'Zsoltárok 27,1' },
  2027: { text: 'Hálát adok az én Istenemnek mindenkor ti felőletek.', ref: '1Korinthus 1,4' },
  2028: { text: 'Az Úr megőrzi a te ki- és bemeneteledet, mostantól fogva mindörökké.', ref: 'Zsoltárok 121,8' },
  2029: { text: 'Legyetek erősek az Úrban és az ő hatalmas erejében.', ref: 'Efézus 6,10' },
  2030: { text: 'Az Úr közel! Semmi felől ne aggódjatok.', ref: 'Filippi 4,5–6' },
}
const VEZERIGE_DEFAULT = { text: 'Mindennek rendelt ideje van, és ideje van az ég alatt minden akaratnak.', ref: 'Prédikátor 3,1' }

const HU_MO = ['Január', 'Február', 'Március', 'Április', 'Május', 'Június', 'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December']
const HU_MO_SHORT = ['jan', 'feb', 'márc', 'ápr', 'máj', 'jún', 'júl', 'aug', 'szept', 'okt', 'nov', 'dec']
const CAL_DOW = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V']

// Programtípus → lucide-stílusú SVG belső path-ek (a design icons.jsx-éből)
const ICON_PATH_BY_TIPUS: Record<ProgramTipus, string> = {
  istentisztelet: '<path d="M12 2v6"/><path d="M9 5h6"/><path d="M5 22V12l7-4 7 4v10"/><path d="M5 22h14"/><path d="M9 22v-4a3 3 0 0 1 6 0v4"/>',
  bibliaora: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  imaora: '<path d="M11 14h2a2 2 0 0 0 2-2 2 2 0 0 0-2-2H9.5L7 12.5"/><path d="m20 9-5.5 5.5a2.83 2.83 0 0 1-4 0L8 12.5"/><path d="M4 14 2 16v4a1 1 0 0 0 1 1h3"/><path d="M16.5 5.5a2.12 2.12 0 0 0-3 0l-.5.5-.5-.5a2.12 2.12 0 1 0-3 3l3.5 3.5 3.5-3.5a2.12 2.12 0 0 0 0-3z"/>',
  ifjusagi: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  gyerekprogram: '<path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5S14.5 8 13 8"/>',
  konferencia: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>',
  hangverseny: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  kozossegi: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a2 2 0 0 0-2.8 0l-1.5 1.5a1 1 0 1 1-3-3l2.6-2.6a4 4 0 0 1 5 0l3.2 2.7"/><path d="m21 3-3 3"/><path d="M3 3l5.4 5.4"/><path d="m9 11-3.7 3.7a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0L12 16"/>',
  presbiteri: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 11h.01"/><path d="M13 11h3"/><path d="M9 15h.01"/><path d="M13 15h3"/>',
  latogatas: '<path d="M3 10.2 12 3l9 7.2"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9 21v-6h6v6"/>',
  unnep: '<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="M22 2 11 13"/><path d="M11 13c1.5 1.5 1.5 4 0 6"/><path d="M15 6c1.5 1.5 3.5 1.5 5 0"/><path d="M19 13c-1.5-1.5-1.5-3.5 0-5"/>',
  tabor: '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
  evangelizacio: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  diakoniai: '<path d="M19 14c1.49-1.46 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08 2.17 2.17 0 0 0 3.08 0l.92-.92a2 2 0 0 1 2.78 0l2.6 2.6"/><path d="m18 15-2-2"/><path d="m15 18-2-2"/>',
  noszovetseg: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/><path d="M12 14.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/><path d="M9.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M14.5 12a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0z"/>',
  egyeb: '<path d="M12 17v5"/><path d="M9 10.8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5.8c0 .7.3 1.3.8 1.7L18 14H6l1.2-1.5c.5-.4.8-1 .8-1.7z"/>',
}

type Rank = 'major' | 'mid' | 'minor'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function addDays(date: Date, n: number): Date { const d = new Date(date); d.setDate(d.getDate() + n); return d }
function ymdE(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// 2026-08-26 (5. kör): a KORÁBBI saját húsvét-számítás és ünneplista TÖRÖLVE —
// az egyetlen kanonikus forrás a lib/utils/reformed-holidays getUnnepnapokForYear
// (a nyomtatott éves terv és az ICS-feed eddig MÁS ünnepeket mutatott).
// A rang (kiemelés) itt csak megjelenítési döntés.
const UNNEP_RANK: Record<string, Rank> = {
  'Húsvét': 'major', 'Húsvéthétfő': 'major', 'Pünkösd': 'major',
  'Pünkösdhétfő': 'major', 'Karácsony': 'major', 'Karácsony 2. napja': 'major',
  'Nagypéntek': 'mid', 'Virágvasárnap': 'mid',
  'Áldozócsütörtök (Mennybemenetel)': 'mid', 'Reformáció napja': 'mid',
  'Szenteste': 'mid',
}

function reformedHolidays(year: number): Record<string, { name: string; rank: Rank }> {
  const map: Record<string, { name: string; rank: Rank }> = {}
  for (const u of getUnnepnapokForYear(year)) {
    map[u.date] = { name: u.name, rank: UNNEP_RANK[u.name] || 'minor' }
  }
  return map
}

function fmtRange(p: Program): string {
  const d1 = new Date(p.datum + 'T00:00:00')
  if (p.datum_vege && p.datum_vege !== p.datum) {
    const d2 = new Date(p.datum_vege + 'T00:00:00')
    if (d1.getMonth() === d2.getMonth()) return `${HU_MO_SHORT[d1.getMonth()]} ${d1.getDate()}–${d2.getDate()}.`
    return `${HU_MO_SHORT[d1.getMonth()]} ${d1.getDate()}. – ${HU_MO_SHORT[d2.getMonth()]} ${d2.getDate()}.`
  }
  return `${HU_MO_SHORT[d1.getMonth()]} ${d1.getDate()}.`
}

function buildMiniMonth(
  year: number, month: number,
  eventsByDate: Record<string, Program[]>,
  holidayMap: Record<string, { name: string; rank: Rank }>,
  todayStr: string,
): string {
  const dim = new Date(year, month + 1, 0).getDate()
  let startDow = new Date(year, month, 1).getDay() - 1
  if (startDow < 0) startDow = 6
  let cells = ''
  for (let i = 0; i < startDow; i++) cells += '<div class="ep-mc ep-empty"></div>'
  for (let d = 1; d <= dim; d++) {
    const ds = ymdE(new Date(year, month, d))
    const isSun = new Date(year, month, d).getDay() === 0
    const evts = eventsByDate[ds] || []
    const hol = holidayMap[ds]
    const isToday = ds === todayStr
    const dotColors: string[] = []
    for (const e of evts) {
      const c = PROG_TIPUS_COLOR[e.tipus] || '#94a3b8'
      if (!dotColors.includes(c) && dotColors.length < 3) dotColors.push(c)
    }
    let cls = 'ep-mc'
    if (isSun) cls += ' ep-sun'
    if (hol) cls += ' ep-hol ep-hol-' + hol.rank
    if (isToday) cls += ' ep-today'
    const title = hol ? hol.name : (evts.length ? evts.map((e) => e.cim).join(', ') : '')
    let inner = `<span class="ep-dn">${d}</span>`
    if (hol) inner += '<span class="ep-cross">✝</span>'
    else if (dotColors.length > 0) {
      inner += '<span class="ep-dots">' + dotColors.map((c) => `<span class="ep-dot" style="background:${c}"></span>`).join('') + '</span>'
    }
    cells += `<div class="${cls}" title="${esc(title)}">${inner}</div>`
  }
  const heads = CAL_DOW.map((dn, i) => `<div class="ep-dow${i === 6 ? ' ep-dow-sun' : ''}">${dn}</div>`).join('')
  return `<div class="ep-month"><div class="ep-month-name">${HU_MO[month]}</div><div class="ep-cal">${heads}${cells}</div></div>`
}

export function AnnualPlanPrint({ allPrograms, year, congregationName: rawCongName, congregationLogo, compact }: AnnualPlanPrintProps) {
  const [open, setOpen] = useState(false)
  const [vYear, setVYear] = useState(year)
  const [vPrograms, setVPrograms] = useState<Program[]>(allPrograms)
  const [loadingYear, setLoadingYear] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Megnyitáskor a widget aktuális évéről indulunk
  useEffect(() => {
    if (open) { setVYear(year); setVPrograms(allPrograms) }
  }, [open, year, allPrograms])

  // ESC + görgetés-zár
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  async function changeYear(delta: number) {
    const ny = vYear + delta
    setVYear(ny)
    setLoadingYear(true)
    try {
      const data = await getProgramsForYear(ny)
      setVPrograms(data)
    } catch {
      setVPrograms([])
    } finally {
      setLoadingYear(false)
    }
  }

  function buildHtml(yr: number, progs: Program[]): string {
    const congregationName = rawCongName || 'Gyülekezet'
    const verse = VEZERIGE[yr] || VEZERIGE_DEFAULT
    const today = new Date()
    const todayStr = ymdE(today)
    const printDate = `${today.getFullYear()}. ${HU_MO[today.getMonth()].toLowerCase()} ${today.getDate()}.`

    // Naptári pontok: ismétlődés feloldva, többnapos kezeléssel — 2026-08-02
    // (PR-20 review): a horizont a NYOMTATOTT év — az előző évben indult
    // sorozat is megjelenik a rácsokban.
    const occurrences = expandProgramOccurrences(progs, yr)
    const eventsByDate: Record<string, Program[]> = {}
    occurrences.forEach((e) => {
      const sd = new Date(e.datum + 'T00:00:00')
      const ed = e.datum_vege ? new Date(e.datum_vege + 'T00:00:00') : sd
      for (let d = new Date(sd); d <= ed; d = addDays(d, 1)) {
        const k = ymdE(d)
        if (!eventsByDate[k]) eventsByDate[k] = []
        if (!eventsByDate[k].some((x) => x.id === e.id)) eventsByDate[k].push(e)
      }
    })
    const holidayMap = reformedHolidays(yr)

    // Kiemelt alkalmak — sorozatonként EGYSZER, az adott évi ELSŐ alkalommal
    // (2026-08-02, PR-20 review: az előző évi ismétlődő sor nyers dátuma
    // különben tavalyi dátummal szivárgott volna a listába)
    const firstInYear = new Map<string, Program>()
    for (const o of occurrences) {
      if (o.datum.slice(0, 4) === String(yr) && !firstInYear.has(o.id)) firstInYear.set(o.id, o)
    }
    const highlights = [...firstInYear.values()]
      .filter((p) => (p.prioritas === 'kiemelt' || p.prioritas === 'fontos') && p.tipus !== 'istentisztelet')
      .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0))

    const calendarsHtml = Array.from({ length: 12 }, (_, m) => buildMiniMonth(yr, m, eventsByDate, holidayMap, todayStr)).join('')

    const highlightsHtml = highlights.length === 0
      ? '<div class="ep-hl-item" style="border:0;color:var(--muted-foreground)">Ebben az évben még nincs kiemelt alkalom rögzítve.</div>'
      : highlights.map((p) => {
          const color = PROG_TIPUS_COLOR[p.tipus] || '#64748b'
          const path = ICON_PATH_BY_TIPUS[p.tipus] || ICON_PATH_BY_TIPUS.egyeb
          const star = p.prioritas === 'kiemelt' ? '<span class="ep-hl-star">★</span>' : ''
          return `<div class="ep-hl-item">
            <span class="ep-hl-ico" style="color:${color};background:color-mix(in oklab, ${color} 14%, #fff)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>
            <span class="ep-hl-date">${esc(fmtRange(p))}</span>
            <span class="ep-hl-title">${esc(p.cim)}${star}</span>
          </div>`
        }).join('')

    const logoHtml = congregationLogo
      ? `<img class="ep-logo" src="${esc(congregationLogo)}" alt="Gyülekezet logója" crossorigin="anonymous"/>`
      : `<div class="ep-logo" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f0fdfa,#ccfbf1);color:var(--primary);font-size:34px;line-height:1;">✝</div>`

    const pdfFilename = `${congregationName} - Eves programterv ${yr}.pdf`

    return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(congregationName)} — Éves programterv ${yr}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap"/>
<style>
  :root {
    --background: #eef4ef; --paper: #fffdf8; --foreground: #294853;
    --primary: #217c72; --primary-deep: #1a5f57; --accent: #f3c061; --accent-deep: #c79233;
    --gold-ink: #8a6420; --muted: #edf6f1; --muted-foreground: #66848c; --border: #dbece4; --sun: #c0584a;
    --font-serif: "Cormorant Garamond", "Palatino Linotype", Georgia, serif;
    --font-sans: "Segoe UI", system-ui, -apple-system, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font-sans); color: var(--foreground); background: var(--background); -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 16px 12px 28px; }
  .screen-scaler { transform-origin: top center; display: block; }

  .ep-paper { width: 297mm; min-height: 210mm; margin: 0 auto; position: relative; background: var(--paper); padding: 8mm 12mm 6mm; box-shadow: 0 20px 60px -22px rgba(26, 95, 87, 0.4); border-radius: 3px; display: flex; flex-direction: column; }
  .ep-topborder { position: absolute; top: 0; left: 0; right: 0; height: 7px; background: linear-gradient(90deg, var(--primary) 0%, var(--accent) 50%, var(--primary) 100%); }

  .ep-band { display: flex; align-items: stretch; gap: 16px; padding-top: 2mm; }
  .ep-head { flex: 0 0 37%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .ep-logo { width: 74px; height: 74px; display: block; margin-bottom: 10px; border-radius: 50%; object-fit: cover; box-shadow: 0 0 0 1px var(--border), 0 0 0 5px var(--paper), 0 0 0 6px color-mix(in oklab, var(--accent) 60%, transparent), 0 8px 18px -10px rgba(26,95,87,0.5); }
  .ep-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--primary); }
  .ep-church { font-family: var(--font-serif); font-weight: 600; font-size: 28px; line-height: 1.05; color: var(--foreground); margin-top: 5px; letter-spacing: 0.01em; }
  .ep-ornament { display: flex; align-items: center; justify-content: center; gap: 11px; margin: 11px 0 9px; color: var(--accent-deep); }
  .ep-orn-line { height: 1px; width: 72px; background: linear-gradient(90deg, transparent, var(--accent-deep)); }
  .ep-orn-line:last-child { background: linear-gradient(90deg, var(--accent-deep), transparent); }
  .ep-orn-diamond { width: 8px; height: 8px; background: var(--accent); transform: rotate(45deg); box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 35%, transparent); }
  .ep-year { font-family: var(--font-serif); font-size: 18px; color: var(--muted-foreground); }
  .ep-year strong { color: var(--primary); font-weight: 700; font-size: 22px; }

  .ep-verse { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 10px 22px; border-radius: 12px; background: linear-gradient(180deg, color-mix(in oklab, var(--accent) 14%, var(--paper)), var(--paper)); border: 1px solid color-mix(in oklab, var(--accent) 50%, transparent); box-shadow: inset 0 1px 0 rgba(255,255,255,0.6); position: relative; }
  .ep-verse-label { font-size: 9.5px; font-weight: 700; letter-spacing: 0.26em; text-transform: uppercase; color: var(--accent-deep); margin-bottom: 7px; }
  .ep-verse-text { display: block; font-family: var(--font-serif); font-style: italic; font-weight: 500; font-size: 21px; line-height: 1.35; color: var(--foreground); outline: none; margin: 0 0 7px; }
  .ep-verse-ref { display: block; font-family: var(--font-serif); font-size: 14px; font-weight: 600; color: var(--primary); outline: none; }
  [contenteditable]:hover { background: color-mix(in oklab, var(--accent) 8%, transparent); border-radius: 4px; }
  [contenteditable]:focus { box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 30%, transparent); border-radius: 4px; }

  .ep-calendars { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px 10px; margin: 6px 0 2px; }
  .ep-month { display: flex; flex-direction: column; }
  .ep-month-name { font-family: var(--font-serif); font-weight: 600; font-size: 13px; color: var(--primary); text-align: center; padding-bottom: 3px; margin-bottom: 3px; border-bottom: 1.5px solid color-mix(in oklab, var(--primary) 30%, transparent); }
  .ep-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
  .ep-dow { font-size: 7.5px; font-weight: 700; color: var(--muted-foreground); text-align: center; padding-bottom: 2px; text-transform: uppercase; }
  .ep-dow-sun { color: var(--sun); }
  .ep-mc { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5px; border-radius: 4px; min-height: 14px; padding: 1px 0; }
  .ep-empty { background: transparent; }
  .ep-dn { font-size: 9px; font-weight: 500; line-height: 1; color: var(--foreground); }
  .ep-sun .ep-dn { color: var(--sun); font-weight: 600; }
  .ep-dots { display: flex; gap: 1.5px; }
  .ep-dot { width: 3px; height: 3px; border-radius: 50%; }
  .ep-cross { font-size: 7px; color: var(--accent-deep); line-height: 1; }
  .ep-hol { background: color-mix(in oklab, var(--accent) 22%, var(--paper)); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 55%, transparent); }
  .ep-hol .ep-dn { color: var(--gold-ink); font-weight: 700; }
  .ep-hol-major { background: color-mix(in oklab, var(--accent) 40%, var(--paper)); box-shadow: inset 0 0 0 1.3px var(--accent-deep); }
  .ep-hol-major .ep-cross { color: var(--sun); font-weight: 700; }
  .ep-today { box-shadow: inset 0 0 0 1.5px var(--primary); background: color-mix(in oklab, var(--primary) 12%, var(--paper)); }
  .ep-today .ep-dn { color: var(--primary-deep); font-weight: 800; }

  .ep-highlights { margin-top: 6px; }
  .ep-h2 { display: flex; align-items: center; justify-content: center; gap: 14px; font-family: var(--font-serif); font-weight: 600; font-size: 16px; color: var(--primary); letter-spacing: 0.02em; margin-bottom: 8px; }
  .ep-h2-rule { height: 1px; flex: 0 0 60px; background: color-mix(in oklab, var(--accent-deep) 60%, transparent); }
  .ep-hl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px 26px; }
  .ep-hl-item { display: flex; align-items: center; gap: 9px; padding: 2px 0; border-bottom: 1px dotted color-mix(in oklab, var(--border) 80%, var(--muted-foreground)); }
  .ep-hl-ico { width: 25px; height: 25px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .ep-hl-date { font-size: 11px; font-weight: 700; color: var(--primary); min-width: 62px; font-variant-numeric: tabular-nums; }
  .ep-hl-title { font-size: 12.5px; color: var(--foreground); font-weight: 500; }
  .ep-hl-star { color: var(--accent-deep); margin-left: 5px; font-size: 11px; }

  .ep-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px; margin-top: 6px; padding: 7px 14px; border-radius: 9px; background: var(--muted); border: 1px solid var(--border); }
  .ep-leg-item { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--muted-foreground); }
  .ep-leg-dot { width: 8px; height: 8px; border-radius: 50%; }
  .ep-leg-cross { color: var(--accent-deep); font-weight: 700; font-size: 12px; }
  .ep-leg-sun { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; font-size: 9px; font-weight: 700; color: var(--sun); }
  .ep-leg-star { color: var(--accent-deep); }

  .ep-foot { margin-top: auto; padding-top: 7px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1.5px solid color-mix(in oklab, var(--primary) 28%, transparent); font-size: 9px; color: var(--muted-foreground); }
  .ep-foot-mid { font-family: var(--font-serif); font-style: italic; font-size: 11px; color: var(--primary); font-weight: 600; }
  .ep-foot-brand { text-align: right; }
  .ep-foot-brand strong { color: var(--primary); letter-spacing: 0.05em; }

  @page { size: A4 landscape; margin: 0; }
  @media print {
    body { background: #fff; padding: 0; }
    .screen-scaler { transform: none !important; height: auto !important; }
    .ep-paper { width: 100%; min-height: 100vh; margin: 0; box-shadow: none; border-radius: 0; padding: 9mm 11mm 7mm; }
  }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
</head>
<body>
  <div class="screen-scaler">
    <div class="ep-paper" id="print-content">
      <div class="ep-topborder"></div>
      <div class="ep-band">
        <header class="ep-head">
          ${logoHtml}
          <div class="ep-head-text">
            <div class="ep-eyebrow">Gyülekezeti programterv</div>
            <h1 class="ep-church">${esc(congregationName)}</h1>
            <div class="ep-ornament"><span class="ep-orn-line"></span><span class="ep-orn-diamond"></span><span class="ep-orn-line"></span></div>
            <div class="ep-year">Az Úr <strong>${yr}.</strong> esztendeje</div>
          </div>
        </header>
        <section class="ep-verse">
          <div class="ep-verse-label">Az év vezérigéje</div>
          <blockquote class="ep-verse-text" contenteditable spellcheck="false">&bdquo;${esc(verse.text)}&rdquo;</blockquote>
          <div class="ep-verse-ref" contenteditable spellcheck="false">${esc(verse.ref)}</div>
        </section>
      </div>

      <section class="ep-calendars">${calendarsHtml}</section>

      <section class="ep-highlights">
        <h2 class="ep-h2"><span class="ep-h2-rule"></span>Az év kiemelt alkalmai<span class="ep-h2-rule"></span></h2>
        <div class="ep-hl-grid">${highlightsHtml}</div>
      </section>

      <section class="ep-legend">
        <span class="ep-leg-item"><span class="ep-leg-dot" style="background:var(--primary)"></span> Gyülekezeti alkalom</span>
        <span class="ep-leg-item"><span class="ep-leg-cross">✝</span> Egyházi ünnep</span>
        <span class="ep-leg-item"><span class="ep-leg-sun">7</span> Vasárnap — istentisztelet</span>
        <span class="ep-leg-item"><span class="ep-leg-star">★</span> Kiemelt alkalom</span>
      </section>

      <footer class="ep-foot">
        <span>Készült: ${esc(printDate)}</span>
        <span class="ep-foot-mid">✝ ${esc(congregationName)} · ${yr}. évi programterv</span>
        <span class="ep-foot-side ep-foot-brand">Készült a <strong>KARTOTÉKA</strong> egyházi nyilvántartó rendszerrel</span>
      </footer>
    </div>
  </div>

  <script>
    (function(){
      function fit(){
        try {
          if (window.matchMedia && window.matchMedia('print').matches) return;
          var page = document.getElementById('print-content');
          var scaler = document.querySelector('.screen-scaler');
          if (!page || !scaler) return;
          scaler.style.transform = 'none'; scaler.style.height = 'auto';
          var avail = document.documentElement.clientWidth - 16;
          var natural = page.offsetWidth;
          if (!natural) return;
          var scale = Math.min(1, avail / natural);
          scaler.style.transform = 'scale(' + scale + ')';
          scaler.style.height = Math.ceil(page.offsetHeight * scale) + 'px';
        } catch (e) {}
      }
      window.ktFitPreview = fit;
      window.addEventListener('resize', fit);
      window.addEventListener('load', fit);
      window.addEventListener('beforeprint', function(){ var s=document.querySelector('.screen-scaler'); if(s){ s.style.transform='none'; s.style.height='auto'; } });
      window.addEventListener('afterprint', fit);
      setTimeout(fit, 50); setTimeout(fit, 350);
    })();
    function savePDF(){
      var el = document.getElementById('print-content');
      var sc = document.querySelector('.screen-scaler');
      if (sc) { sc.style.transform = 'none'; sc.style.height = 'auto'; }
      html2pdf().set({
        margin: 0,
        filename: '${pdfFilename.replace(/'/g, "\\'")}',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
      }).from(el).save().then(function(){ if (window.ktFitPreview) window.ktFitPreview(); });
    }
    window.savePDF = savePDF;
  <\/script>
</body></html>`
  }

  function doPrint() { iframeRef.current?.contentWindow?.print() }
  function doPdf() {
    const w = iframeRef.current?.contentWindow as (Window & { savePDF?: () => void }) | null | undefined
    if (w?.savePDF) w.savePDF()
    else w?.print()
  }

  const html = open ? buildHtml(vYear, vPrograms) : ''

  return (
    <>
      {/* 2026-08-10: `compact` = ikonos indítógomb az irányítópult-csempe
          egysoros akciósávjához (a felirat a tooltipbe költözik). */}
      {compact ? (
        <button
          type="button"
          className="kt-iconbtn"
          onClick={() => setOpen(true)}
          title="Éves programterv"
          aria-label="Éves programterv"
        >
          <Printer size={16} />
        </button>
      ) : (
        <button type="button" className="kt-btn kt-btn-outline" onClick={() => setOpen(true)}>
          <Printer size={16} /> Éves terv
        </button>
      )}

      {open && typeof document !== 'undefined' && createPortal(
        <div className="kt-modal-overlay kt-eves-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="kt-eves-modal" role="dialog" aria-modal="true" aria-label={`Éves programterv ${vYear}`}>
            <div className="kt-eves-head">
              <div className="kt-modal-title">
                <span className="kt-modal-ico"><Printer size={18} /></span>
                <div>
                  <h3>Éves programterv</h3>
                  <div className="kt-modal-sub">{rawCongName || 'Gyülekezet'}</div>
                </div>
              </div>
              <div className="kt-eves-actions">
                <div className="kt-eves-yearnav">
                  <button type="button" onClick={() => changeYear(-1)} disabled={loadingYear} aria-label="Előző év"><ChevronLeft size={16} /></button>
                  <span>{vYear}</span>
                  <button type="button" onClick={() => changeYear(1)} disabled={loadingYear} aria-label="Következő év"><ChevronRight size={16} /></button>
                </div>
                <button type="button" className="kt-btn kt-btn-outline" onClick={doPrint}><Printer size={16} /> Nyomtatás</button>
                <button type="button" className="kt-btn kt-btn-outline" onClick={doPdf}><Download size={16} /> PDF mentés</button>
                <button type="button" className="kt-modal-close" onClick={() => setOpen(false)} aria-label="Bezárás"><X size={18} /></button>
              </div>
            </div>
            <div className="kt-eves-body">
              <iframe ref={iframeRef} className="kt-eves-frame" title="Éves programterv előnézet" srcDoc={html} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
