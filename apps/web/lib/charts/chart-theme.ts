/**
 * Közös Recharts diagram-téma — 9. pont: sötét mód (2026-08-15).
 *
 * MIÉRT: a képernyős diagramok korábban hardkódolt VILÁGOS színekkel rajzoltak
 * (pl. #d9ebe7 rács, #94a3b8 tengelyfelirat, fehér hátterű tooltip), ami sötét
 * témában olvashatatlan volt. Itt minden szerkezeti szín a téma CSS-változóira
 * épül (packages/ui/src/themes.css + kartoteka.css fallback), így a diagram
 * automatikusan követi mind a 3 témát (kert / parokia / zsoltaros) és azok
 * világos/sötét variánsait — külön JS-oldali témafigyelés nélkül.
 *
 * A CSS-változó ( `var(--…)` ) SVG-attribútumban is feloldódik a modern
 * böngészőkben — ugyanez a minta, amit a shadcn/ui chart-rendszere is használ.
 *
 * HASZNÁLAT (képernyős diagram):
 *   <CartesianGrid {...CHART_GRID} vertical={false} />
 *   <XAxis tick={CHART_TICK} … />
 *   <Tooltip {...CHART_TOOLTIP} cursor={CHART_CURSOR_BAR} formatter={…} />
 *   <Bar fill={CHART_SEMANTIC.bevetel} … />
 *   <Cell fill={chartSeriesColor(i)} />
 *
 * ⚠️ FIGYELEM — nyomtatás/vetítés: az éves beszámoló diái
 * (components/presentation/slides.tsx) SZÁNDÉKOSAN mindig világos felületre
 * rajzolnak (kivetítő + A4 nyomtatási portál — lásd ott a `.kt-slide-surface`
 * kommentet, 2026-08-10 P1 javítás). Azokon a diagramokon a CSS-változós
 * színek sötét témában ROSSZ értékre oldódnának (sötét-téma token kerülne a
 * kényszerítetten fehér kártyára), ezért ott maradnak a fix világos színek —
 * az NEM elmaradt munka, hanem tudatos döntés.
 */

import type { CSSProperties } from 'react'

/**
 * Szerkezeti színek — mind téma-token, tehát világosban és sötétben is a
 * felülethez illő értékre oldódik.
 */
export const CHART_COLORS = {
  /** Tengelyfeliratok (tick-szöveg): halk, de olvasható mindkét módban. */
  axis: 'var(--muted-foreground)',
  /** Rácsvonalak: ugyanaz a hajszálvonal-szín, mint az app kártya-keretei. */
  grid: 'var(--border)',
  /** Tooltip háttér: a popover-token — sötét módban sötét felület. */
  tooltipBg: 'var(--popover)',
  /** Tooltip szöveg: a popover párja — sötét módban világos szöveg. */
  tooltipText: 'var(--popover-foreground)',
  tooltipBorder: 'var(--border)',
} as const

/**
 * Adatsor-paletta — az éles kiemelő színhez (OLÍVAZÖLD, #6b8e4e) hangolt,
 * földszínű középtónusok. Középtónus = fehér ÉS sötét kártyán is látszik.
 * Az első elem a téma accent-tokenje, így témánként adaptív (kert világos:
 * #6b8e4e, kert sötét: #9bbf6e). A sorrend úgy van összerakva, hogy a
 * szomszédos színek jól elkülönüljenek (fánk-diagramon egymás mellé kerülnek).
 */
export const CHART_SERIES = [
  'var(--accent)', // 1. olívazöld — az éles kiemelő szín
  '#5b8bad', //      2. acélkék
  '#c9973b', //      3. arany-okker
  '#966b9e', //      4. szilva
  '#c26a4a', //      5. terrakotta
  '#3f9d8f', //      6. türkizzöld
  '#b25f74', //      7. mályva
  '#8a948f', //      8. kő-szürke
] as const

/** Adatsor-szín index alapján — körbefordul, ha több a sor, mint a szín. */
export function chartSeriesColor(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length]
}

/**
 * Jelentés-hordozó (szemantikus) színek: a bevétel/kiadás páros mindenhol
 * ugyanaz. Középtónusok, ezért sötét háttéren is olvashatók — NEM kell
 * témánként cserélni őket (és a mellettük ülő HTML-legendák — pl. a dashboard
 * emerald/red pöttyei — is ezekhez igazodnak).
 */
export const CHART_SEMANTIC = {
  bevetel: '#10b981',
  kiadas: '#ef4444',
} as const

/** Tengely-tick: kis méret + téma-követő szín. `tick={CHART_TICK}` */
export const CHART_TICK = { fontSize: 11, fill: CHART_COLORS.axis } as const

/** Rács: `<CartesianGrid {...CHART_GRID} />` */
export const CHART_GRID = { strokeDasharray: '3 3', stroke: CHART_COLORS.grid } as const

const tooltipContentStyle: CSSProperties = {
  background: CHART_COLORS.tooltipBg,
  color: CHART_COLORS.tooltipText,
  border: `1px solid ${CHART_COLORS.tooltipBorder}`,
  borderRadius: 12,
  // Fallback-kal, mert a --shadow-card-hover csak a téma-blokkokban létezik,
  // a kartoteka.css :root fallbackjában nem — e nélkül eltűnne az árnyék.
  boxShadow: 'var(--shadow-card-hover, 0 12px 32px rgba(0, 0, 0, 0.18))',
  fontSize: 12,
}

/**
 * Tooltip-csomag: `<Tooltip {...CHART_TOOLTIP} formatter={…} />`.
 * Az egyes adatsor-sorok színét szándékosan NEM írjuk felül (itemStyle):
 * a Recharts alapból a sor saját színével írja — ez az információ hasznos,
 * és a középtónusú paletta a sötét tooltip-háttéren is olvasható.
 */
export const CHART_TOOLTIP = {
  contentStyle: tooltipContentStyle,
  labelStyle: { color: CHART_COLORS.tooltipText, fontWeight: 600 } as CSSProperties,
  wrapperStyle: { outline: 'none' } as CSSProperties,
} as const

/**
 * Hover-sáv oszlopdiagramokhoz: `<Tooltip cursor={CHART_CURSOR_BAR} …>`.
 * A Recharts alapértelmezett #ccc sávja sötét módban világító csík volt —
 * a foreground-token 6%-a mindkét módban finom kiemelés.
 * (Vonaldiagramnál NE használd: ott a cursor függőleges vonal, nem kitöltés.)
 */
export const CHART_CURSOR_BAR = { fill: 'var(--foreground)', fillOpacity: 0.06 } as const
