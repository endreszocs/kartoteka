'use client'

import { Button } from '@/components/ui/button'
import { HU_MONTHS, progEmoji, PROG_TIPUS_EMOJI, PROG_TIPUS_LABELS, PROG_TIPUS_COLOR } from '@/lib/constants/dashboard'
import { formatHuDate } from '@/lib/utils/date'
import { getReformedHolidaysForYear } from '@/lib/utils/reformed-holidays'
import type { Program } from '@/lib/constants/dashboard'

interface AnnualPlanPrintProps {
  allPrograms: Program[]
  year: number
  congregationName: string
  congregationLogo?: string | null
}

/**
 * Éves programterv nyomtatása — 12 mini-naptár rácsban (2026-04-21o redesign).
 *
 * Az előző verzió egy hibás függőleges ismétlődő táblázatot rajzolt; most
 * klasszikus év-áttekintő formátum: 12 hónap, mindegyik egy saját 7×6-os
 * napi rácsba rendezve, 4×3-as elrendezésben a lapon.
 *
 * A3 landscape — kifüggeszthető fal-naptár-stílus.
 */
export function AnnualPlanPrint({
  allPrograms,
  year,
  congregationName: rawCongName,
  congregationLogo,
}: AnnualPlanPrintProps) {
  function handlePrint() {
    const congregationName = rawCongName || 'Gyülekezet'
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)

    // ═══════════════════════════════════════════════════════════════
    // 1. Események dátum szerint csoportosítva
    // ═══════════════════════════════════════════════════════════════
    const eventsByDate: Record<string, Program[]> = {}
    allPrograms.forEach((e) => {
      const sd = new Date(e.datum + 'T00:00:00')
      const ed = e.datum_vege ? new Date(e.datum_vege + 'T00:00:00') : sd
      for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10)
        if (!eventsByDate[key]) eventsByDate[key] = []
        if (!eventsByDate[key].find((x) => x.id === e.id)) eventsByDate[key].push(e)
      }
    })

    // ═══════════════════════════════════════════════════════════════
    // 2. Református ünnepek az adott évre (2026-04-21u — 3 szintű rang)
    // ═══════════════════════════════════════════════════════════════
    const holidays = getReformedHolidaysForYear(year)

    /** Ünnep-rang: nagy (Húsvét, Pünkösd, Karácsony) / közép (passió+reformáció) / kis (Újév) */
    function holidayRank(name: string): 'major' | 'mid' | 'minor' {
      const majorNames = ['Húsvét', 'Pünkösd', 'Karácsony']
      const midNames = ['Virágvasárnap', 'Nagypéntek', 'Áldozócsütörtök (Mennybemenetel)', 'Szenteste', 'Reformáció napja']
      if (majorNames.some((n) => name.includes(n))) return 'major'
      if (midNames.includes(name)) return 'mid'
      return 'minor'
    }

    /** Az összes ünnep-nap (duration-t figyelve) + rang kiterjesztve YYYY-MM-DD → info */
    interface HolidayCellInfo {
      name: string
      rank: 'major' | 'mid' | 'minor'
    }
    const holidayByDate = new Map<string, HolidayCellInfo>()
    holidays.forEach((h) => {
      const rank = holidayRank(h.name)
      const startDate = new Date(h.date + 'T00:00:00')
      const duration = h.durationDays ?? 1
      for (let d = 0; d < duration; d++) {
        const dt = new Date(startDate)
        dt.setDate(startDate.getDate() + d)
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
        holidayByDate.set(key, { name: h.name, rank })
      }
    })

    // ═══════════════════════════════════════════════════════════════
    // 3. Használt program-típusok (jelmagyarázat-hoz)
    // ═══════════════════════════════════════════════════════════════
    const usedTypes = new Set(allPrograms.map((e) => e.tipus))

    // ═══════════════════════════════════════════════════════════════
    // 4. HTML escape helper + egy hónap-naptár generálása
    // ═══════════════════════════════════════════════════════════════
    function esc(s: string) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    /**
     * Egy hónap 6×7-es napi mátrixát építjük fel.
     * A hét hétfővel kezdődik (európai / magyar konvenció).
     */
    function buildMonthCells(yr: number, m: number): Array<{
      day: number | null
      dateStr: string | null
      isSunday: boolean
      isSaturday: boolean
      isToday: boolean
      eventShort: string | null
      eventFull: string | null
      holiday: string | null
      holidayRank: 'major' | 'mid' | 'minor' | null
    }> {
      const firstDay = new Date(yr, m, 1)
      const daysInMonth = new Date(yr, m + 1, 0).getDate()
      // Hétfővel kezdődő hét: hétfő = 0, kedd = 1, ..., vasárnap = 6
      const firstDow = (firstDay.getDay() + 6) % 7
      const cells: ReturnType<typeof buildMonthCells> = []
      // Üres cellák a hónap eleje előtt
      for (let i = 0; i < firstDow; i++) {
        cells.push({
          day: null, dateStr: null, isSunday: false, isSaturday: false,
          isToday: false, eventShort: null, eventFull: null, holiday: null, holidayRank: null,
        })
      }
      // A hónap napjai
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(yr, m, d)
        const dow = (date.getDay() + 6) % 7 // hétfő = 0
        const ds = `${yr}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const evts = eventsByDate[ds] || []
        const holiday = holidayByDate.get(ds)
        const eventShort = evts.length > 0
          ? progEmoji(evts[0]) + (evts.length > 1 ? `+${evts.length - 1}` : '')
          : null
        const eventFull = evts.length > 0
          ? evts.map((e) => `${progEmoji(e)} ${e.cim}`).join(' · ')
          : null
        cells.push({
          day: d,
          dateStr: ds,
          isSunday: dow === 6,
          isSaturday: dow === 5,
          isToday: ds === todayStr,
          eventShort,
          eventFull,
          holiday: holiday?.name || null,
          holidayRank: holiday?.rank || null,
        })
      }
      // Feltöltjük 42 cellára (6 hét × 7 nap)
      while (cells.length < 42) {
        cells.push({
          day: null, dateStr: null, isSunday: false, isSaturday: false,
          isToday: false, eventShort: null, eventFull: null, holiday: null, holidayRank: null,
        })
      }
      return cells
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. HTML-generálás — 12 mini-naptár CSS Grid-alapon
    //    (2026-04-21s — HTML table helyett CSS Grid: egyenlő cella-méret,
    //     egységes rács-vonalak gap + háttérszín trükkel)
    // ═══════════════════════════════════════════════════════════════
    const DOW_NAMES = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V']

    const monthBlocks = Array.from({ length: 12 }, (_, m) => {
      const cells = buildMonthCells(year, m)

      // Fejléc (napok rövidítése) — 7 div
      const headersHtml = DOW_NAMES
        .map((d, i) => {
          const cls = i === 6 ? 'dow-hdr sun' : i === 5 ? 'dow-hdr sat' : 'dow-hdr'
          return `<div class="${cls}">${d}</div>`
        })
        .join('')

      // Nap-cellák (42 db) — grid sorokba rendezve, ünnep-rang szerinti kiemeléssel
      const cellsHtml = cells
        .map((c) => {
          if (c.day === null) return '<div class="mc empty"></div>'
          const classes = ['mc']
          if (c.isSunday) classes.push('sun')
          else if (c.isSaturday) classes.push('sat')
          if (c.holidayRank) classes.push(`holiday-${c.holidayRank}`)
          if (c.eventShort) classes.push('has-event')
          if (c.isToday) classes.push('today')
          const tooltipParts: string[] = []
          if (c.holiday) tooltipParts.push(`✝ ${c.holiday}`)
          if (c.eventFull) tooltipParts.push(c.eventFull)
          const title = tooltipParts.length > 0 ? ` title="${esc(tooltipParts.join(' — '))}"` : ''
          // Marker prioritás: program-marker > ünnep-marker
          let marker = ''
          if (c.eventShort) {
            marker = `<span class="marker">${c.eventShort}</span>`
          } else if (c.holidayRank === 'major') {
            marker = '<span class="marker holiday-marker-major">✝</span>'
          } else if (c.holidayRank === 'mid') {
            marker = '<span class="marker holiday-marker-mid">✝</span>'
          } else if (c.holidayRank === 'minor') {
            marker = '<span class="marker holiday-marker-minor">✝</span>'
          }
          return `<div class="${classes.join(' ')}"${title}><span class="dn">${c.day}</span>${marker}</div>`
        })
        .join('')

      return `
        <div class="month-block">
          <div class="month-title">${HU_MONTHS[m]}</div>
          <div class="mini-cal">${headersHtml}${cellsHtml}</div>
        </div>
      `
    }).join('')

    // ═══════════════════════════════════════════════════════════════
    // 6. Oldalsáv tartalma — ünnepek + programok, dátum szerint rendezve
    // ═══════════════════════════════════════════════════════════════

    /** Magyar rövid dátumformázó: "10 jan", "14-16 jún" (tartomány esetén) */
    function formatDateRange(startDate: Date, endDate?: Date): string {
      const sd = startDate.getDate()
      const sm = HU_MONTHS[startDate.getMonth()].slice(0, 3).toLowerCase()
      if (!endDate) return `${String(sd).padStart(2, '0')} ${sm}`
      const ed = endDate.getDate()
      const em = HU_MONTHS[endDate.getMonth()].slice(0, 3).toLowerCase()
      // Ugyanaz a hónap → "14-16 jún"
      if (sm === em) return `${String(sd).padStart(2, '0')}-${String(ed).padStart(2, '0')} ${sm}`
      // Különböző hónap → "28 márc - 02 ápr"
      return `${String(sd).padStart(2, '0')} ${sm} - ${String(ed).padStart(2, '0')} ${em}`
    }

    /** Két szekcióra bontott sidebar: felül ÜNNEPEK (aranyszínű), alatta PROGRAMOK */
    interface ProgramItem {
      startDate: Date
      endDate?: Date
      label: string
      color: string
    }
    interface HolidayItem {
      startDate: Date
      endDate?: Date
      name: string
      rank: 'major' | 'mid' | 'minor'
    }

    const programItems: ProgramItem[] = allPrograms
      .map((e): ProgramItem => {
        const sd = new Date(e.datum + 'T00:00:00')
        const ed = e.datum_vege ? new Date(e.datum_vege + 'T00:00:00') : undefined
        return {
          startDate: sd,
          endDate: ed && ed.getTime() !== sd.getTime() ? ed : undefined,
          label: `${progEmoji(e)} ${e.cim}`,
          color: PROG_TIPUS_COLOR[e.tipus] || '#64748b',
        }
      })
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

    const holidayItems: HolidayItem[] = holidays
      .map((h): HolidayItem => {
        const sd = new Date(h.date + 'T00:00:00')
        const duration = h.durationDays ?? 1
        const ed = duration > 1 ? new Date(sd.getTime() + (duration - 1) * 86400000) : undefined
        return {
          startDate: sd,
          endDate: ed,
          name: h.name,
          rank: holidayRank(h.name),
        }
      })
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

    const holidayListHtml = holidayItems.length === 0
      ? '<p class="event-list-empty">Nincsenek az évre eső ünnepek.</p>'
      : holidayItems
          .map((item) => {
            const dateStr = formatDateRange(item.startDate, item.endDate)
            return `<div class="holiday-item holiday-item-${item.rank}">
          <span class="hl-mark">✝</span>
          <div class="hl-body">
            <span class="hl-date">${dateStr}</span>
            <span class="hl-name">${esc(item.name)}</span>
          </div>
        </div>`
          })
          .join('')

    const programListHtml = programItems.length === 0
      ? '<p class="event-list-empty">Még nincs rögzített gyülekezeti program.</p>'
      : programItems
          .map((item) => {
            const dateStr = formatDateRange(item.startDate, item.endDate)
            return `<div class="event-item" style="border-left-color: ${item.color}">
          <span class="event-date">${dateStr}</span>
          <span class="event-title">${esc(item.label)}</span>
        </div>`
          })
          .join('')

    const pdfFilename = `${congregationName} - Eves programterv ${year}.pdf`

    // ═══════════════════════════════════════════════════════════════
    // 7. A teljes HTML
    // ═══════════════════════════════════════════════════════════════
    const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8">
      <title>${esc(congregationName)} — Éves programterv ${year}</title>
      <style>
        /* A4 landscape keskeny margóval — minden pixel a tartalomé */
        @page { size: A4 landscape; margin: 5mm; }
        @media print { .toolbar { display: none !important; } }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Georgia', 'Cambria', 'Times New Roman', serif;
          color: #1e2c3a;
          background: linear-gradient(135deg, #f8fafc 0%, #f0fdfa 100%);
        }

        /* ─── Toolbar (csak képernyőn) ─── */
        .toolbar {
          position: sticky; top: 0; z-index: 100;
          background: linear-gradient(135deg, #0f766e 0%, #0d9488 100%);
          padding: 10px 24px;
          display: flex; align-items: center; justify-content: space-between;
          box-shadow: 0 4px 16px rgba(13, 148, 136, 0.2);
          font-family: 'Segoe UI', system-ui, sans-serif;
        }
        .toolbar .title { color: #fff; font-size: 15px; font-weight: 700; }
        .toolbar .sub { color: rgba(255,255,255,0.75); font-size: 11px; margin-left: 10px; }
        .tb-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 20px;
          border-radius: 10px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
        .tb-btn-print { background: #fff; color: #0f766e; }
        .tb-btn-pdf { background: #f59e0b; color: #fff; }
        .tb-btn-close { background: rgba(255,255,255,0.15); color: #fff; }

        /* ─── Oldal-keret — tölti a teljes magasságot ─── */
        html, body { height: 100%; }
        .page-wrap {
          background: #fff;
          max-width: 100%;
          min-height: calc(100vh - 16px);
          margin: 8px auto;
          padding: 8px 12px 8px;
          border-radius: 10px;
          box-shadow: 0 6px 24px rgba(15, 118, 110, 0.1);
          border: 1px solid #ccfbf1;
          display: flex;
          flex-direction: column;
        }
        @media print {
          body { background: #fff; }
          .page-wrap {
            margin: 0;
            padding: 2mm 0;
            border-radius: 0;
            box-shadow: none;
            max-width: 100%;
            border: none;
            min-height: 100vh;
            height: 100vh;
          }
        }

        /* ─── Fejléc (redesign 2026-04-21u — ornamentális, évszakos) ─── */
        .hdr {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 14px;
          align-items: center;
          padding: 4px 4px 8px;
          border-bottom: 3px solid #0f766e;
          margin-bottom: 8px;
          position: relative;
        }
        /* Decorative felső sáv — arany + teal közötti ékkő */
        .hdr::after {
          content: '';
          position: absolute;
          bottom: -3px;
          left: 50%;
          transform: translateX(-50%);
          width: 40px;
          height: 3px;
          background: linear-gradient(90deg, #f59e0b, #d97706);
          border-radius: 2px;
        }
        .hdr-logo {
          width: 64px; height: 64px;
          border-radius: 10px; overflow: hidden;
          background: linear-gradient(135deg, #f0fdfa, #ccfbf1);
          display: flex; align-items: center; justify-content: center;
          border: 2px solid #0f766e;
          box-shadow: 0 2px 8px rgba(15, 118, 110, 0.18);
        }
        .hdr-logo img { width: 100%; height: 100%; object-fit: contain; padding: 3px; }
        .hdr-logo-fallback { font-size: 36px; color: #0f766e; }

        .hdr-text { text-align: center; padding: 0 8px; }
        .hdr-church {
          font-size: 18px; font-weight: 800; color: #0f766e;
          text-transform: uppercase; letter-spacing: 0.1em;
          font-family: 'Georgia', serif;
        }
        .hdr-title {
          font-size: 10px; color: #475569; font-weight: 600;
          margin-top: 2px; letter-spacing: 0.18em; text-transform: uppercase;
        }
        .hdr-motto {
          margin-top: 4px; font-style: italic;
          color: #475569; font-size: 9px;
          max-width: 440px; margin-left: auto; margin-right: auto;
          line-height: 1.35;
        }
        .hdr-counters {
          display: flex; justify-content: center; gap: 8px; margin-top: 5px;
        }
        .hdr-counter {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 7px; border-radius: 10px;
          font-size: 8.5px; font-weight: 700;
          font-family: 'Segoe UI', system-ui, sans-serif;
          letter-spacing: 0.03em;
        }
        .hdr-counter.c-programs { background: #ccfbf1; color: #115e59; border: 1px solid #5eead4; }
        .hdr-counter.c-holidays { background: #fef3c7; color: #92400e; border: 1px solid #fbbf24; }
        .hdr-counter-num { font-weight: 900; font-size: 9.5px; }

        .hdr-year-badge {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          width: 88px; height: 76px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%);
          border-radius: 11px;
          color: #fff;
          box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25);
          border: 1.5px solid #fcd34d;
          position: relative;
          overflow: hidden;
        }
        .hdr-year-badge::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 20px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), transparent);
        }
        .hdr-year-badge .year-label { font-size: 8.5px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.95; z-index: 1; }
        .hdr-year-badge .year-num { font-size: 32px; font-weight: 900; line-height: 1; z-index: 1; font-family: 'Georgia', serif; text-shadow: 0 2px 4px rgba(0,0,0,0.15); }

        /* ─── Fő grid: 4×3 mini-naptár + esemény-lista oldalsávon ─── */
        /* A4 landscape keskeny margóval: ~287mm × 200mm tartalomhely */
        /* flex: 1 → kitölti a page-wrap fennmaradó részét, nincs üres tér */
        .main-grid {
          display: grid;
          grid-template-columns: 1fr 165px;
          gap: 8px;
          flex: 1;
          min-height: 0;
        }
        .calendars {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          grid-template-rows: repeat(3, 1fr);
          gap: 5px;
          min-height: 0;
        }
        /* ─── Egy hónap-blokk (kompakt, flex-colum a mini-cal nyúláshoz) ─── */
        .month-block {
          background: #fff;
          border: 1.3px solid #0f766e;
          border-radius: 7px;
          padding: 4px 5px 5px;
          box-shadow: 0 1px 4px rgba(15, 118, 110, 0.08);
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .month-title {
          text-align: center;
          font-size: 11px;
          font-weight: 800;
          color: #0f766e;
          font-family: 'Georgia', serif;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 1px 0 3px;
          margin-bottom: 3px;
          border-bottom: 1.3px solid #0f766e;
          flex-shrink: 0;
        }

        /* ─── Mini-naptár CSS Grid alapon (2026-04-21s) ───
           7 oszlop × 7 sor (1 fejléc + 6 hét).
           A "gap: 1px" + "background: #cbd5e1" trükk: a grid közti
           résekben a háttérszín látszódik — egységes rács-vonalak.
           A cellák "minmax(0, 1fr)" → mindegyik egyenlő méretű. */
        .mini-cal {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          grid-template-rows: auto repeat(6, minmax(0, 1fr));
          gap: 1px;
          background: #cbd5e1;
          padding: 1px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-size: 9px;
          flex: 1;
          min-height: 0;
          width: 100%;
        }

        .dow-hdr {
          font-size: 7.5px;
          font-weight: 700;
          color: #0f766e;
          text-align: center;
          padding: 2px 0;
          background: #f0fdfa;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dow-hdr.sun { color: #dc2626; background: #fef2f2; }
        .dow-hdr.sat { color: #b45309; background: #fffbeb; }

        .mc {
          padding: 1px 2px;
          position: relative;
          background: #fff;
          color: #334155;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-content: flex-start;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        .mc.empty { background: #f8fafc; }
        .mc.sun { background: #fff1f2; }
        .mc.sun .dn { color: #dc2626; font-weight: 600; }
        .mc.sat { background: #fffbeb; }
        .mc.sat .dn { color: #b45309; font-weight: 600; }

        /* ─── Ünnep-rang szerinti kiemelés (2026-04-21u) ───
           Major: Húsvét, Pünkösd, Karácsony — vörös/arany, vastag keret
           Mid:   Virágvasárnap, Nagypéntek, Áldozócsütörtök, Szenteste, Reformáció — arany
           Minor: Újév — halvány arany */
        .mc.holiday-major:not(.has-event) {
          background: linear-gradient(135deg, #fecaca 0%, #fef3c7 100%);
          box-shadow: inset 0 0 0 2px #dc2626;
        }
        .mc.holiday-major:not(.has-event) .dn { color: #991b1b; font-weight: 900; font-size: 10px; }
        .mc.holiday-mid:not(.has-event) {
          background: linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%);
          box-shadow: inset 0 0 0 1.5px #d97706;
        }
        .mc.holiday-mid:not(.has-event) .dn { color: #92400e; font-weight: 800; }
        .mc.holiday-minor:not(.has-event) {
          background: #fffbeb;
          box-shadow: inset 0 0 0 1px #f59e0b;
        }
        .mc.holiday-minor:not(.has-event) .dn { color: #b45309; font-weight: 700; }

        .mc.has-event { background: #ecfdf5; box-shadow: inset 0 0 0 1.3px #10b981; }
        .mc.has-event .dn { color: #047857; font-weight: 700; }
        /* Ha egyszerre ünnep is + program is → mindkettő tükröződjön */
        .mc.has-event.holiday-major { background: linear-gradient(135deg, #ecfdf5 0%, #fef3c7 50%, #fecaca 100%) !important; box-shadow: inset 0 0 0 1.8px #dc2626; }
        .mc.has-event.holiday-mid { background: linear-gradient(135deg, #ecfdf5 0%, #fef3c7 100%) !important; box-shadow: inset 0 0 0 1.5px #d97706; }
        .mc.today { background: #d1fae5 !important; box-shadow: inset 0 0 0 1.8px #059669; z-index: 2; }
        .mc.today .dn { color: #064e3b; font-weight: 800; }

        .mc .dn {
          display: block;
          font-size: 9px;
          font-weight: 500;
          line-height: 1;
          text-align: right;
          padding-right: 2px;
        }
        .mc .marker {
          display: block;
          font-size: 7px;
          line-height: 1.1;
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          text-align: left;
          padding-left: 2px;
        }
        .mc .marker.holiday-marker-major { color: #dc2626; font-weight: 900; text-align: center; font-size: 9px; }
        .mc .marker.holiday-marker-mid { color: #d97706; font-weight: 800; text-align: center; font-size: 8.5px; }
        .mc .marker.holiday-marker-minor { color: #b45309; font-weight: 700; text-align: center; font-size: 8px; }

        /* ─── Sidebar: két szekció (ÜNNEPEK felül, PROGRAMOK alul) ─── */
        .event-sidebar {
          display: flex;
          flex-direction: column;
          gap: 6px;
          overflow: hidden;
          min-height: 0;
          font-family: 'Segoe UI', system-ui, sans-serif;
        }

        /* ── Ünnepek szekció — aranyló, dombornyomott érzés ── */
        .holiday-section {
          background: linear-gradient(135deg, #fef3c7 0%, #fef9e7 50%, #fff 100%);
          border: 1.5px solid #f59e0b;
          border-radius: 7px;
          padding: 6px 7px 8px;
          box-shadow: 0 2px 6px rgba(245, 158, 11, 0.15);
          flex-shrink: 0;
        }
        .holiday-section h3 {
          font-size: 9.5px;
          font-weight: 800;
          color: #92400e;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          padding-bottom: 3px;
          border-bottom: 1.5px solid #f59e0b;
          margin-bottom: 4px;
          font-family: 'Georgia', serif;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .holiday-section h3::before { content: '✝'; font-size: 12px; color: #dc2626; }

        .holiday-item {
          display: flex;
          align-items: flex-start;
          gap: 5px;
          padding: 3px 4px;
          font-size: 7.8px;
          line-height: 1.25;
          margin-bottom: 2px;
          border-radius: 4px;
        }
        .holiday-item.holiday-item-major {
          background: linear-gradient(90deg, rgba(254, 202, 202, 0.8) 0%, rgba(254, 243, 199, 0.4) 100%);
          border-left: 3px solid #dc2626;
          padding-left: 6px;
        }
        .holiday-item.holiday-item-major .hl-name { color: #991b1b; font-weight: 800; font-size: 8.2px; }
        .holiday-item.holiday-item-mid {
          background: rgba(254, 243, 199, 0.6);
          border-left: 2.5px solid #d97706;
          padding-left: 5px;
        }
        .holiday-item.holiday-item-mid .hl-name { color: #92400e; font-weight: 700; }
        .holiday-item.holiday-item-minor {
          background: rgba(255, 251, 235, 0.8);
          border-left: 2px solid #f59e0b;
          padding-left: 4px;
        }
        .holiday-item.holiday-item-minor .hl-name { color: #b45309; font-weight: 600; }

        .hl-mark { color: #dc2626; font-weight: 900; flex-shrink: 0; font-size: 9px; line-height: 1; padding-top: 1px; }
        .holiday-item.holiday-item-mid .hl-mark { color: #d97706; }
        .holiday-item.holiday-item-minor .hl-mark { color: #f59e0b; }
        .hl-body { flex: 1; display: flex; flex-direction: column; min-width: 0; gap: 0.5px; }
        .hl-date { font-family: 'Consolas', monospace; font-size: 6.8px; color: #78350f; font-weight: 600; letter-spacing: 0.03em; }
        .hl-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ── Programok szekció — teal-es, folytatja a fő témát ── */
        .programs-section {
          background: linear-gradient(135deg, #f0fdfa, #fff);
          border: 1px solid #ccfbf1;
          border-radius: 7px;
          padding: 6px 7px 8px;
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .programs-section h3 {
          font-size: 9.5px;
          font-weight: 700;
          color: #0f766e;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          padding-bottom: 3px;
          border-bottom: 1.3px solid #0f766e;
          margin-bottom: 4px;
          font-family: 'Georgia', serif;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .programs-section h3::before { content: '📅'; font-size: 10px; }
        .programs-list {
          overflow: hidden;
          min-height: 0;
        }
        .event-item {
          padding: 2px 5px 2px 6px;
          font-size: 7.5px;
          line-height: 1.25;
          border-left: 2.2px solid #64748b;
          margin-bottom: 2px;
          background: rgba(255, 255, 255, 0.7);
          border-radius: 0 3px 3px 0;
          display: flex;
          gap: 4px;
          align-items: baseline;
        }
        .event-date { font-family: 'Consolas', monospace; color: #0f766e; font-weight: 600; font-size: 7px; flex-shrink: 0; min-width: 48px; }
        .event-title { color: #334155; overflow: hidden; text-overflow: ellipsis; }
        .event-list-empty { font-size: 9px; color: #94a3b8; font-style: italic; text-align: center; padding: 10px 0; }

        /* ─── Jelmagyarázat (kompakt) ─── */
        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 2px 10px;
          justify-content: center;
          margin-top: 5px;
          padding: 4px 10px;
          background: linear-gradient(135deg, #f0fdfa, #ffffff);
          border-radius: 6px;
          border: 1px solid #ccfbf1;
          font-family: 'Segoe UI', system-ui, sans-serif;
        }
        .legend-item { display: inline-flex; align-items: center; gap: 3px; font-size: 7.5px; color: #475569; }
        .legend-title { font-weight: 700; color: #0f766e; font-size: 8px; text-transform: uppercase; letter-spacing: 0.07em; }
        .legend-swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; }
        .legend-sep { width: 1px; height: 12px; background: #cbd5e1; margin: 0 4px; }
        /* Ünnep-rang swatch-ek — visszhangozzák a mini-naptár cellák színét */
        .legend-swatch.legend-sw-major { background: linear-gradient(135deg, #fecaca, #fef3c7); border: 2px solid #dc2626; }
        .legend-swatch.legend-sw-mid { background: linear-gradient(135deg, #fef3c7, #fffbeb); border: 1.5px solid #d97706; }
        .legend-swatch.legend-sw-minor { background: #fffbeb; border: 1px solid #f59e0b; }

        /* ─── Lábléc ─── */
        .footer {
          text-align: center;
          margin-top: 4px;
          font-size: 7.5px;
          color: #64748b;
          border-top: 1.3px solid #0f766e;
          padding-top: 4px;
          display: flex;
          justify-content: space-between;
          font-family: 'Segoe UI', system-ui, sans-serif;
        }
        .footer .mid { font-weight: 600; color: #0f766e; font-style: italic; }
      </style>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
      <script>
        function savePDF() {
          var el = document.getElementById('print-content');
          var tb = document.querySelector('.toolbar');
          if (tb) tb.style.display = 'none';
          html2pdf().set({
            margin: 3,
            filename: '${pdfFilename.replace(/'/g, "\\'")}',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
          }).from(el).save().then(function() {
            if (tb) tb.style.display = '';
          });
        }
      <\/script>
      </head><body>
        <div class="toolbar">
          <div>
            <span class="title">Éves Programterv — ${year}</span>
            <span class="sub">${esc(congregationName)} · ${allPrograms.length} program · ${holidays.length} ünnep</span>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="tb-btn tb-btn-print" onclick="window.print()">🖨 Nyomtatás</button>
            <button class="tb-btn tb-btn-pdf" onclick="savePDF()">⬇ PDF mentés</button>
            <button class="tb-btn tb-btn-close" onclick="window.close()">Bezárás</button>
          </div>
        </div>

        <div class="page-wrap" id="print-content">
          <div class="hdr">
            <div class="hdr-logo">
              ${congregationLogo
                ? `<img src="${esc(congregationLogo)}" alt="Címer" crossorigin="anonymous"/>`
                : `<span class="hdr-logo-fallback">✝</span>`
              }
            </div>
            <div class="hdr-text">
              <div class="hdr-church">${esc(congregationName)}</div>
              <div class="hdr-title">Éves programterv · gyülekezeti kalendárium</div>
              <div class="hdr-motto">&bdquo;Mindenkinek rendelt ideje van, és ideje van az ég alatt minden akaratnak." &mdash; Préd. 3:1</div>
              <div class="hdr-counters">
                <span class="hdr-counter c-programs">📅 <span class="hdr-counter-num">${allPrograms.length}</span> gyülekezeti program</span>
                <span class="hdr-counter c-holidays">✝ <span class="hdr-counter-num">${holidays.length}</span> református ünnep</span>
              </div>
            </div>
            <div class="hdr-year-badge">
              <span class="year-label">Év</span>
              <span class="year-num">${year}</span>
            </div>
          </div>

          <div class="main-grid">
            <div class="calendars">${monthBlocks}</div>
            <aside class="event-sidebar">
              <div class="holiday-section">
                <h3>Református ünnepek</h3>
                <div>${holidayListHtml}</div>
              </div>
              <div class="programs-section">
                <h3>Gyülekezeti programok</h3>
                <div class="programs-list">${programListHtml}</div>
              </div>
            </aside>
          </div>

          <div class="legend">
            <span class="legend-item legend-title">Jelmagyarázat:</span>
            ${Array.from(usedTypes)
              .map(
                (t) =>
                  `<span class="legend-item"><span class="legend-swatch" style="background:${PROG_TIPUS_COLOR[t]}"></span>${PROG_TIPUS_EMOJI[t]} ${PROG_TIPUS_LABELS[t]}</span>`,
              )
              .join('')}
            <span class="legend-sep"></span>
            <span class="legend-item"><span class="legend-swatch legend-sw-major"></span>✝ Nagy ünnep (Húsvét, Pünkösd, Karácsony)</span>
            <span class="legend-item"><span class="legend-swatch legend-sw-mid"></span>✝ Közép ünnep (passió, reformáció)</span>
            <span class="legend-item"><span class="legend-swatch legend-sw-minor"></span>✝ Kis ünnep (Újév)</span>
            <span class="legend-sep"></span>
            <span class="legend-item"><span class="legend-swatch" style="background:#ecfdf5;border:1.5px solid #10b981;"></span>Program-nap</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#d1fae5;border:2px solid #059669;"></span>Ma</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#fff1f2;"></span>Vasárnap</span>
          </div>

          <div class="footer">
            <span>Készült: ${formatHuDate(today)}</span>
            <span class="mid">✝ ${esc(congregationName)} — ${year}. évi programterv</span>
            <span>Kartotéka rendszer</span>
          </div>
        </div>
      </body></html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handlePrint}>
      Éves terv nyomtatás
    </Button>
  )
}
