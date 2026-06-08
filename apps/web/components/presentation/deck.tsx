'use client'

/**
 * Megosztott „deck" logika az Éves beszámoló prezentációhoz — a Studio
 * (vezérlő), a kivetítő-fogadóoldal és a prezenter ablak is ezt használja,
 * hogy pontosan ugyanazt a dia-sorrendet és tartalmat lássák.
 */

import type { PresentationData } from '@/app/(dashboard)/eves-jelentes/prezentacio/actions'
import {
  SLIDES, CustomSlideView, slidePillar, PILLAR_LABELS,
  type SlideDefinition, type PillarId,
} from './slides'

export const OVERRIDES_STORAGE_KEY = 'kartoteka-presentation-overrides-v1'
export const OPTIONS_STORAGE_KEY = 'kartoteka-presentation-options-v2'

export interface TextOverrides {
  [slideKey: string]: { title?: string; subtitle?: string; commentary?: string }
}

export interface CustomSlide {
  key: string
  pillar: PillarId
  title: string
  subtitle?: string
  body: string
}

export interface PresentationOptions {
  includeConclusions: boolean
  includeForecast: boolean
  configuredAt: string | null
  hidden: string[]
  customSlides: CustomSlide[]
}

export const DEFAULT_OPTIONS: PresentationOptions = {
  includeConclusions: true,
  includeForecast: true,
  configuredAt: null,
  hidden: [],
  customSlides: [],
}

export function loadOptions(): PresentationOptions {
  if (typeof window === 'undefined') return DEFAULT_OPTIONS
  try {
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY)
    return raw ? { ...DEFAULT_OPTIONS, ...JSON.parse(raw) } : DEFAULT_OPTIONS
  } catch {
    return DEFAULT_OPTIONS
  }
}
export function saveOptions(options: PresentationOptions) {
  if (typeof window === 'undefined') return
  localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options))
}
export function loadOverrides(): TextOverrides {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as TextOverrides) : {}
  } catch {
    return {}
  }
}
export function saveOverrides(overrides: TextOverrides) {
  if (typeof window === 'undefined') return
  localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides))
}

export type DeckItem =
  | { kind: 'builtin'; key: string; def: SlideDefinition; pillar: PillarId }
  | { kind: 'custom'; key: string; slide: CustomSlide; pillar: PillarId }

export function sectionOf(key: string, pillar: PillarId): { id: string; label: string } {
  if (key === 'title' || key === 'overview') return { id: 'nyito', label: 'Nyitó' }
  if (key === 'conclusions' || key === 'forecast') return { id: 'kieg', label: 'Kiegészítők' }
  if (key === 'closing') return { id: 'zaro', label: 'Lezárás' }
  return { id: `p${pillar}`, label: PILLAR_LABELS[pillar] }
}

export function buildDeck(options: PresentationOptions): DeckItem[] {
  const builtins: DeckItem[] = SLIDES
    .filter((s) => {
      if (s.key === 'conclusions') return options.includeConclusions
      if (s.key === 'forecast') return options.includeForecast
      return true
    })
    .filter((s) => !options.hidden.includes(s.key))
    .map((s) => ({ kind: 'builtin' as const, key: s.key, def: s, pillar: slidePillar(s.key) }))

  const customs = (options.customSlides || [])
    .filter((c) => !options.hidden.includes(c.key))
    .map((c) => ({ kind: 'custom' as const, key: c.key, slide: c, pillar: c.pillar }))

  const lastIdxOfPillar: Record<number, number> = {}
  builtins.forEach((b, i) => { lastIdxOfPillar[b.pillar] = i })
  const deck: DeckItem[] = []
  const placed = new Set<number>()
  builtins.forEach((b, i) => {
    deck.push(b)
    if (lastIdxOfPillar[b.pillar] === i) {
      customs.filter((c) => c.pillar === b.pillar).forEach((c) => deck.push(c))
      placed.add(b.pillar)
    }
  })
  customs.filter((c) => !placed.has(c.pillar)).forEach((c) => deck.push(c))
  return deck
}

export function DeckRenderer({
  item, data, overrides, projection = false,
}: {
  item: DeckItem
  data: PresentationData
  overrides: TextOverrides
  projection?: boolean
}) {
  if (item.kind === 'custom') {
    return <CustomSlideView title={item.slide.title} subtitle={item.slide.subtitle} body={item.slide.body} projection={projection} />
  }
  const slide = item.def
  const o = overrides[slide.key]
  const title = o?.title || slide.resolveTitle?.(data) || slide.defaultTitle
  const subtitle = o?.subtitle || slide.resolveSubtitle?.(data) || slide.defaultSubtitle
  const commentary = o?.commentary
  const SlideContent = slide.component
  return <SlideContent data={data} title={title} subtitle={subtitle} commentary={commentary} projection={projection} />
}
