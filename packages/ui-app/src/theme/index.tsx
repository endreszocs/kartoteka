'use client'

/**
 * Téma-stílus választó réteg (Sprint R · Vizuális megújulás · v0.8.1).
 *
 * Két komponens + egy hook + egy provider:
 *   - <ThemeStyleProvider>   — perzisztálja a választást localStorage-ben,
 *                              beállítja a `<html data-theme="...">` attr-t,
 *                              cross-tab szinkronizál (storage event).
 *   - useThemeStyle()        — `{ theme, setTheme }` accessor.
 *   - <ThemePicker>          — 3 vizuális preview-kártya body-only.
 *   - <ThemeStylePickerWired> — összekötött ThemePicker (a context-ből olvas).
 *
 * A `kartoteka-theme-style-v1` localStorage kulcs azonos a web és a desktop
 * között — egyetlen igazság forrása. A `data-theme` attr a `<html>` elemen
 * vezérli a `packages/ui/src/themes.css` 3 CSS-vars blokkját.
 *
 * Pasztorális UX (`feedback_lelkesz_informalas.md`): a változás azonnal
 * látszik, a perzisztencia néma (nincs csípős toast).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_THEME,
  themes,
  type ThemeName,
  type ThemeTokens,
} from '@kartoteka/design-tokens'

// ──────────────────────────────────────────────────────────────────────
// Konstansok
// ──────────────────────────────────────────────────────────────────────

const LS_KEY = 'kartoteka-theme-style-v1'

const VALID_THEMES: ReadonlyArray<ThemeName> = ['parokia', 'kert', 'zsoltaros']

function isValidTheme(value: unknown): value is ThemeName {
  return typeof value === 'string' && VALID_THEMES.includes(value as ThemeName)
}

function loadTheme(): ThemeName {
  if (typeof window === 'undefined') return DEFAULT_THEME
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    return isValidTheme(raw) ? raw : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function applyTheme(theme: ThemeName): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

// ──────────────────────────────────────────────────────────────────────
// Context
// ──────────────────────────────────────────────────────────────────────

export interface ThemeStyleContextValue {
  /** Az aktuálisan aktív téma neve. */
  theme: ThemeName
  /** Átállítja a témát; perzisztál és cross-tab szinkronizál. */
  setTheme: (next: ThemeName) => void
  /** A téma-választás SSR-hidratálás után készre vált. */
  ready: boolean
}

const ThemeStyleContext = createContext<ThemeStyleContextValue | null>(null)

export function useThemeStyle(): ThemeStyleContextValue {
  const ctx = useContext(ThemeStyleContext)
  if (!ctx) {
    throw new Error(
      'useThemeStyle: a komponensnek <ThemeStyleProvider>-en belül kell lennie.',
    )
  }
  return ctx
}

// ──────────────────────────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────────────────────────

export interface ThemeStyleProviderProps {
  children: ReactNode
  /** Default téma (server-render fallback). Nem használja a localStorage-ből betöltöttet felül. */
  defaultTheme?: ThemeName
}

export function ThemeStyleProvider({
  children,
  defaultTheme = DEFAULT_THEME,
}: ThemeStyleProviderProps) {
  const [theme, setThemeState] = useState<ThemeName>(defaultTheme)
  const [ready, setReady] = useState(false)

  // Mount: betöltjük a localStorage-ből, és frissítjük a DOM-attr-t.
  useEffect(() => {
    const stored = loadTheme()
    setThemeState(stored)
    applyTheme(stored)
    setReady(true)
  }, [])

  // Cross-tab szinkron: ha másik tabon frissül a téma, itt is váltson.
  useEffect(() => {
    if (typeof window === 'undefined') return
    function onStorage(event: StorageEvent) {
      if (event.key !== LS_KEY) return
      const next = isValidTheme(event.newValue) ? event.newValue : DEFAULT_THEME
      setThemeState(next)
      applyTheme(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next)
    applyTheme(next)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LS_KEY, next)
      } catch {
        // a localStorage tele lehet — a memóriabeli állapot akkor is helyes
      }
    }
  }, [])

  const value = useMemo<ThemeStyleContextValue>(
    () => ({ theme, setTheme, ready }),
    [theme, setTheme, ready],
  )

  return <ThemeStyleContext.Provider value={value}>{children}</ThemeStyleContext.Provider>
}

// ──────────────────────────────────────────────────────────────────────
// ThemePicker — 3 preview-kártya (body-only, pure UI)
// ──────────────────────────────────────────────────────────────────────

export interface ThemePickerProps {
  value: ThemeName
  onChange: (next: ThemeName) => void
  /** Pasztorális leírás minden kártya alá. */
  descriptions?: Partial<Record<ThemeName, string>>
}

const DEFAULT_DESCRIPTIONS: Record<ThemeName, string> = {
  parokia: 'Meleg, lelkipásztori — Cormorant Garamond serif címek, mély kékeszöld sidebar.',
  kert: 'Modern, tiszta — Fraunces és Geist, hűvös zöld paletta. Alapértelmezett.',
  zsoltaros: 'Klasszikus, méltóságteljes — Roboto Slab címek, mély barna keret narancsos akcenttel.',
}

export function ThemePicker({ value, onChange, descriptions }: ThemePickerProps) {
  const merged = { ...DEFAULT_DESCRIPTIONS, ...descriptions }
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {VALID_THEMES.map((name) => {
        const tokens = themes[name]
        const selected = value === name
        return (
          <button
            key={name}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(name)}
            className={`flex cursor-pointer flex-col items-stretch gap-2 rounded-[1rem] border-2 p-3 text-left transition ${
              selected
                ? 'border-slate-700 bg-slate-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <ThemePreview tokens={tokens} />
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="text-sm font-semibold text-slate-800"
                style={{ fontFamily: tokens.fontDisplay }}
              >
                {tokens.name}
              </span>
              {selected && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
                  Aktív
                </span>
              )}
            </div>
            <span className="text-[11px] leading-snug text-slate-500">{merged[name]}</span>
          </button>
        )
      })}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// ThemePreview — mini swatch-és előnézet egy kártyához
// ──────────────────────────────────────────────────────────────────────

function ThemePreview({ tokens }: { tokens: ThemeTokens }) {
  return (
    <div
      className="overflow-hidden rounded-[0.7rem] border border-slate-200"
      style={{ background: tokens.bg }}
    >
      <div className="flex h-16">
        {/* Mini sidebar */}
        <div
          className="flex w-1/4 flex-col items-center justify-center gap-1"
          style={{ background: tokens.sidebarBg, color: tokens.sidebarText }}
        >
          <span
            className="block size-2 rounded-full"
            style={{ background: tokens.navActiveAccent }}
          />
          <span className="block h-0.5 w-4 rounded-full" style={{ background: tokens.sidebarMuted }} />
          <span className="block h-0.5 w-3 rounded-full" style={{ background: tokens.sidebarMuted }} />
        </div>
        {/* Mini content area */}
        <div className="flex flex-1 flex-col justify-between px-2 py-1.5">
          <span
            className="font-semibold leading-tight"
            style={{
              fontFamily: tokens.fontDisplay,
              color: tokens.text,
              fontSize: 11,
            }}
          >
            Áldás
          </span>
          <div className="flex items-center gap-1">
            <span
              className="block size-2.5 rounded-sm"
              style={{ background: tokens.accent }}
              aria-label="primary"
            />
            <span
              className="block size-2.5 rounded-sm"
              style={{ background: tokens.accent2 }}
              aria-label="accent"
            />
            <span
              className="block size-2.5 rounded-sm"
              style={{ background: tokens.cardBg, border: `1px solid ${tokens.divider}` }}
              aria-label="card"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Composite: önállóan használható ThemePicker (a context-ből olvas)
// ──────────────────────────────────────────────────────────────────────

export function ThemeStylePicker(props: Omit<ThemePickerProps, 'value' | 'onChange'>) {
  const { theme, setTheme } = useThemeStyle()
  return <ThemePicker {...props} value={theme} onChange={setTheme} />
}
