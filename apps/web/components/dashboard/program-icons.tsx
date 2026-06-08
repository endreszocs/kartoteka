'use client'

// ── Egységes lucide ikonrendszer a 16 programtípushoz (Claude Design, 2026-06-07) ──
// A felismerhetőséget a szín + felirat is erősíti (színvak-barát). Az „egyéb"
// típus egyedi-emoji funkciója megmarad.

import {
  Church, BookOpen, HandHeart, Target, Baby, Mic, Music, Handshake,
  ClipboardList, House, PartyPopper, Tent, Megaphone, HeartHandshake,
  Flower, Pin, type LucideIcon,
} from 'lucide-react'
import { progColor } from '@/lib/constants/dashboard'
import type { Program, ProgramTipus } from '@/lib/constants/dashboard'

export const PROG_TIPUS_ICON: Record<ProgramTipus, LucideIcon> = {
  istentisztelet: Church, bibliaora: BookOpen, imaora: HandHeart, ifjusagi: Target,
  gyerekprogram: Baby, konferencia: Mic, hangverseny: Music, kozossegi: Handshake,
  presbiteri: ClipboardList, latogatas: House, unnep: PartyPopper, tabor: Tent,
  evangelizacio: Megaphone, diakoniai: HeartHandshake, noszovetseg: Flower, egyeb: Pin,
}

/** Típus-ikon (vagy az „egyéb" egyedi emoji), a típus színével. */
export function TypeGlyph({ p, size = 18 }: { p: Program; size?: number }) {
  if (p.tipus === 'egyeb' && p.egyedi_emoji) {
    return <span style={{ fontSize: size, lineHeight: 1 }}>{p.egyedi_emoji}</span>
  }
  const LucideGlyph = PROG_TIPUS_ICON[p.tipus] || Pin
  return <LucideGlyph size={size} strokeWidth={2} style={{ color: progColor(p) }} />
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
