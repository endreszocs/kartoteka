'use client'

/**
 * Megosztott „deck" logika az Éves beszámoló prezentációhoz — a Studio
 * (vezérlő), a kivetítő-fogadóoldal és a prezenter ablak is ezt használja,
 * hogy pontosan ugyanazt a dia-sorrendet és tartalmat lássák.
 */

import type { PresentationData } from '@/app/(dashboard)/eves-jelentes/prezentacio/actions'
import {
  ALL_CONCLUSION_CATEGORIES, ALL_CONCLUSION_HORIZONS, buildCategoryConclusions,
  conclusionCategoriesOfPillar,
  type ConclusionCategory, type ConclusionHorizon,
} from '@/lib/annual-report/conclusions'
import {
  SLIDES, CustomSlideView, slidePillar, PILLAR_LABELS, CONCLUSION_SLIDE_KEYS,
  type SlideDefinition, type PillarId,
} from './slides'

export const OVERRIDES_STORAGE_KEY = 'kartoteka-presentation-overrides-v1'
export const OPTIONS_STORAGE_KEY = 'kartoteka-presentation-options-v2'
/** Év- és gyülekezet-független beállítás-preferenciák (új év nyitásakor öröklődnek). */
const PREFS_STORAGE_KEY = 'kartoteka-presentation-prefs-v1'

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
  /** 2026-08-10: mely kategóriákhoz kér a lelkész következtetést (kipipálható). */
  conclusionCategories: ConclusionCategory[]
  /** Rövid táv / hosszú táv — külön kapcsolható. */
  conclusionHorizons: ConclusionHorizon[]
  configuredAt: string | null
  hidden: string[]
  customSlides: CustomSlide[]
}

export const DEFAULT_OPTIONS: PresentationOptions = {
  includeConclusions: true,
  includeForecast: true,
  // Alapértelmezés: MINDEN kategória be van pipálva.
  conclusionCategories: [...ALL_CONCLUSION_CATEGORIES],
  conclusionHorizons: [...ALL_CONCLUSION_HORIZONS],
  configuredAt: null,
  hidden: [],
  customSlides: [],
}

// ──────────────────────────────────────────────────────────────
// Perzisztencia — 2026-08-10 óta ÉV + GYÜLEKEZET szerint névterezve
// ──────────────────────────────────────────────────────────────

/**
 * MIÉRT: a két localStorage-kulcs korábban globális konstans volt, ezért a
 * 2025-re megírt lelkészi kommentárok és pillér-célok VÁLTOZATLANUL megjelentek
 * a 2024-es számok fölött, esperesi nézetben pedig az A gyülekezet szövegei a
 * B gyülekezet adatain. Mostantól minden mentés a (gyülekezet, év) párhoz tartozik.
 */
export interface StorageScope {
  congregationId: string
  year: number
}

function scopedKey(base: string, scope: StorageScope): string {
  return `${base}:${scope.congregationId}:${scope.year}`
}

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* kvóta / privát mód */ }
}

/** A régi, globális kulcs egyszeri átvétele az ÉPP MEGNYITOTT év/gyülekezet alá. */
function adoptLegacy<T>(legacyKey: string, targetKey: string): T | null {
  if (typeof window === 'undefined') return null
  const legacy = readJson<T>(legacyKey)
  if (legacy === null) return null
  writeJson(targetKey, legacy)
  try { localStorage.removeItem(legacyKey) } catch { /* ignore */ }
  return legacy
}

/** Az év-független preferenciák (mit tegyünk a prezentációba). */
type PresentationPrefs = Pick<
  PresentationOptions,
  'includeConclusions' | 'includeForecast' | 'conclusionCategories' | 'conclusionHorizons' | 'configuredAt'
>

export function loadOptions(scope: StorageScope): PresentationOptions {
  if (typeof window === 'undefined') return DEFAULT_OPTIONS
  const key = scopedKey(OPTIONS_STORAGE_KEY, scope)
  const stored = readJson<Partial<PresentationOptions>>(key) ?? adoptLegacy<Partial<PresentationOptions>>(OPTIONS_STORAGE_KEY, key)
  const prefs = readJson<Partial<PresentationPrefs>>(PREFS_STORAGE_KEY) ?? {}
  // Sekély merge: a régi mentésekből hiányzó ÚJ kulcsok az alapértelmezést kapják.
  const merged: PresentationOptions = { ...DEFAULT_OPTIONS, ...prefs, ...(stored ?? {}) }
  return {
    ...merged,
    conclusionCategories: sanitizeCategories(merged.conclusionCategories),
    conclusionHorizons: sanitizeHorizons(merged.conclusionHorizons),
    hidden: Array.isArray(merged.hidden) ? merged.hidden : [],
    customSlides: Array.isArray(merged.customSlides) ? merged.customSlides : [],
  }
}

function sanitizeCategories(list: unknown): ConclusionCategory[] {
  if (!Array.isArray(list)) return [...ALL_CONCLUSION_CATEGORIES]
  const valid = list.filter((c): c is ConclusionCategory => ALL_CONCLUSION_CATEGORIES.includes(c as ConclusionCategory))
  return valid
}

function sanitizeHorizons(list: unknown): ConclusionHorizon[] {
  if (!Array.isArray(list)) return [...ALL_CONCLUSION_HORIZONS]
  return list.filter((h): h is ConclusionHorizon => h === 'short' || h === 'long')
}

export function saveOptions(options: PresentationOptions, scope: StorageScope) {
  writeJson(scopedKey(OPTIONS_STORAGE_KEY, scope), options)
  // A preferenciák külön is elmentődnek, hogy egy másik év megnyitásakor ne
  // kelljen újra beállítani (és ne ugorjon fel újra a bevezető ablak).
  const prefs: PresentationPrefs = {
    includeConclusions: options.includeConclusions,
    includeForecast: options.includeForecast,
    conclusionCategories: options.conclusionCategories,
    conclusionHorizons: options.conclusionHorizons,
    configuredAt: options.configuredAt,
  }
  writeJson(PREFS_STORAGE_KEY, prefs)
}

export function loadOverrides(scope: StorageScope): TextOverrides {
  if (typeof window === 'undefined') return {}
  const key = scopedKey(OVERRIDES_STORAGE_KEY, scope)
  return readJson<TextOverrides>(key) ?? adoptLegacy<TextOverrides>(OVERRIDES_STORAGE_KEY, key) ?? {}
}

export function saveOverrides(overrides: TextOverrides, scope: StorageScope) {
  writeJson(scopedKey(OVERRIDES_STORAGE_KEY, scope), overrides)
}

// ──────────────────────────────────────────────────────────────
// Deck felépítése
// ──────────────────────────────────────────────────────────────

export type DeckItem =
  | { kind: 'builtin'; key: string; def: SlideDefinition; pillar: PillarId }
  | { kind: 'custom'; key: string; slide: CustomSlide; pillar: PillarId }

export function sectionOf(key: string, pillar: PillarId): { id: string; label: string } {
  if (key === 'title') return { id: 'nyito', label: 'Nyitó' }
  if (key === 'overview') return { id: 'osszegzes', label: 'Összegzés' }
  if (key.startsWith('conclusions') || key === 'forecast') return { id: 'kieg', label: 'Kiegészítők' }
  if (key === 'closing') return { id: 'zaro', label: 'Lezárás' }
  return { id: `p${pillar}`, label: PILLAR_LABELS[pillar] }
}

/** Van-e legalább egy megjeleníthető következtetés az adott pillérhez? */
export function hasConclusionsForPillar(
  data: PresentationData,
  options: PresentationOptions,
  pillar: 1 | 2 | 3,
): boolean {
  const wanted = conclusionCategoriesOfPillar(pillar).filter((c) => options.conclusionCategories.includes(c))
  if (wanted.length === 0 || options.conclusionHorizons.length === 0) return false
  return buildCategoryConclusions(data, { categories: wanted, horizons: options.conclusionHorizons })
    .some((c) => c.available)
}

/**
 * `data` nélkül is működik (a hívó nem mindig ismeri az adatot), de ha átadja,
 * kimaradnak azok a következtetés-diák, amelyekhez egyáltalán nincs adat —
 * így üres „Következtetések" dia nem kerül a vetítésbe.
 */
export function buildDeck(options: PresentationOptions, data?: PresentationData): DeckItem[] {
  const builtins: DeckItem[] = SLIDES
    .filter((s) => {
      const conclusionPillar = CONCLUSION_SLIDE_KEYS[s.key]
      if (conclusionPillar) {
        if (!options.includeConclusions) return false
        if (!data) return true
        return hasConclusionsForPillar(data, options, conclusionPillar)
      }
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
  item, data, overrides, options, projection = false,
}: {
  item: DeckItem
  data: PresentationData
  overrides: TextOverrides
  /** A következtetés-diák innen tudják, mely kategóriák vannak kipipálva. */
  options?: PresentationOptions
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
  const opts = options ?? DEFAULT_OPTIONS
  return (
    <SlideContent
      data={data}
      title={title}
      subtitle={subtitle}
      commentary={commentary}
      projection={projection}
      conclusionCategories={opts.conclusionCategories}
      conclusionHorizons={opts.conclusionHorizons}
    />
  )
}
