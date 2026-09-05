'use client'

// ── Egységes lucide ikonrendszer a programtípusokhoz (Claude Design, 2026-06-07) ──
// A felismerhetőséget a szín + felirat is erősíti (színvak-barát). Az „egyéb"
// típus egyedi-emoji funkciója megmarad.

import { createElement } from 'react'
import {
  Church, BookOpen, HandHeart, Target, Baby, Mic, Music, Handshake,
  ClipboardList, House, PartyPopper, Tent, Megaphone, HeartHandshake,
  Flower, Pin, Droplets, Heart, Cross, Flower2, TreePalm, type LucideIcon,
} from 'lucide-react'
import { progColor, PROG_TIPUS_COLOR, PROG_TIPUS_LABELS } from '@/lib/constants/dashboard'
import type { Program, ProgramTipus } from '@/lib/constants/dashboard'

export const PROG_TIPUS_ICON: Record<ProgramTipus, LucideIcon> = {
  istentisztelet: Church, bibliaora: BookOpen, imaora: HandHeart, ifjusagi: Target,
  gyerekprogram: Baby, konferencia: Mic, hangverseny: Music, kozossegi: Handshake,
  presbiteri: ClipboardList, latogatas: House, unnep: PartyPopper, tabor: Tent,
  evangelizacio: Megaphone, diakoniai: HeartHandshake, noszovetseg: Flower, egyeb: Pin,
  // 2026-09-05: anyakönyvi alkalmak + szabadság
  kereszteles: Droplets, eskuvo: Heart, konfirmacio: Cross, temetes: Flower2, szabadsag: TreePalm,
}

/**
 * 2026-09-05: ISMERETLEN típus-értékre (a DB CHECK a kód előtt bővült, vagy egy
 * sor más forrásból kapott új típust) a felület NEM omolhat össze — a
 * `PROG_TIPUS_ICON[tipus]` eddig `undefined`-ot adott, és a szerkesztő-ablak
 * „Element type is invalid" hibával borult. Ez a három segéd a KÖZÖS fallback
 * (ikon: gombostű, felirat: „Ismeretlen típus", szín: az „egyéb" szürkéje).
 */
export const ISMERETLEN_TIPUS_CIMKE = 'Ismeretlen típus'
export const ISMERETLEN_TIPUS_SZIN = '#94a3b8'

export function tipusIkon(tipus: string | null | undefined): LucideIcon {
  return (PROG_TIPUS_ICON as Record<string, LucideIcon | undefined>)[tipus ?? ''] ?? Pin
}
export function tipusCimke(tipus: string | null | undefined): string {
  return (PROG_TIPUS_LABELS as Record<string, string | undefined>)[tipus ?? ''] ?? ISMERETLEN_TIPUS_CIMKE
}
export function tipusSzin(tipus: string | null | undefined): string {
  return (PROG_TIPUS_COLOR as Record<string, string | undefined>)[tipus ?? ''] ?? ISMERETLEN_TIPUS_SZIN
}

/** Típus-ikon (vagy az „egyéb" egyedi emoji), a típus színével. */
export function TypeGlyph({ p, size = 18 }: { p: Program; size?: number }) {
  if (p.tipus === 'egyeb' && p.egyedi_emoji) {
    return <span style={{ fontSize: size, lineHeight: 1 }}>{p.egyedi_emoji}</span>
  }
  // MIÉRT createElement: a `const Ikon = tipusIkon(…)` + `<Ikon />` alakot a
  // react-hooks/static-components szabály „renderben létrehozott komponensnek"
  // olvassa (CI-lint hiba). A createElement ugyanazt a modul-szintű, stabil
  // lucide-komponenst kapja — új komponens nem születik, az állapot nem esik ki.
  return createElement(tipusIkon(p.tipus), { size, strokeWidth: 2, style: { color: progColor(p) } })
}

/** Domború ikon-csempe a típus színével (icon-raised konvenció). */
export function GlyphTile({ p, size = 'md' }: { p: Program; size?: 'sm' | 'md' | 'lg' }) {
  const color = progColor(p)
  const dims = size === 'lg' ? 46 : size === 'sm' ? 34 : 40
  const glyphSize = size === 'lg' ? 22 : size === 'sm' ? 17 : 19
  return (
    <span
      className="kt-glyph-tile icon-raised"
      style={{
        width: dims,
        height: dims,
        background: `color-mix(in oklab, ${color} 16%, var(--card))`,
        color,
        borderColor: `color-mix(in oklab, ${color} 30%, transparent)`,
      }}
    >
      <TypeGlyph p={p} size={glyphSize} />
    </span>
  )
}

/**
 * 2026-09-05: RÉTEG-csempe (anyakönyvi tény / születésnap / névnap) — ugyanaz
 * a domború ikonlap, mint a programoknál, hogy a napi agenda egy nyelven
 * beszéljen. Az anyakönyvi tény a típus színét kapja (emoji), a születésnap és
 * a névnap téma-tokenből színeződik (CSS-osztály), így sötét módban is jó.
 */
export function RetegGlyphTile({
  reteg, szin, emoji, Icon, size = 'sm',
}: {
  reteg: 'anyakonyv' | 'szuletesnap' | 'nevnap'
  szin?: string | null
  emoji?: string
  Icon?: LucideIcon
  size?: 'sm' | 'md'
}) {
  const dims = size === 'sm' ? 34 : 40
  const glyphSize = size === 'sm' ? 17 : 19
  const style: React.CSSProperties = { width: dims, height: dims }
  if (szin) {
    style.background = `color-mix(in oklab, ${szin} 16%, var(--card))`
    style.color = szin
    style.borderColor = `color-mix(in oklab, ${szin} 30%, transparent)`
  }
  return (
    <span className={`kt-glyph-tile icon-raised kt-reteg-tile kt-reteg-tile--${reteg}`} style={style}>
      {emoji
        ? <span style={{ fontSize: glyphSize, lineHeight: 1 }}>{emoji}</span>
        : Icon ? <Icon size={glyphSize} strokeWidth={2} /> : null}
    </span>
  )
}
