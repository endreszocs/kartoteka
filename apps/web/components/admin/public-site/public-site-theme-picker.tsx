'use client'

import Image from 'next/image'
import { Check, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveThemeColors } from '@/lib/public-site/theme-presets'
import { getPublicVisualTheme } from '@/lib/public-site/visual-theme-registry'

export interface PublicSiteThemeOption {
  id: string
  preset_key: string
  display_name: string
  description: string | null
  colors: {
    primary: string
    accent: string
    surface: string
    ink: string
    muted: string
    soft: string
  }
  typography: { heading_font: string; body_font: string }
  hero_style: string
}

interface PublicSiteThemePickerProps {
  themes: PublicSiteThemeOption[]
  value: string | null | undefined
  onValueChange: (themeId: string) => void
}

function LegacyThemePreview({ theme }: { theme: PublicSiteThemeOption }) {
  const colors = resolveThemeColors(theme)

  return (
    <span
      className="absolute inset-0 block p-4"
      style={{
        background: `linear-gradient(145deg, ${colors.surface}, ${colors.soft})`,
        color: colors.ink,
      }}
      aria-hidden="true"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className="h-5 w-5 rounded-md shadow-sm"
            style={{ backgroundColor: colors.primary }}
          />
          <span className="h-1.5 w-14 rounded-full bg-current opacity-35" />
        </span>
        <span className="flex gap-1">
          <span className="h-1 w-5 rounded-full bg-current opacity-20" />
          <span className="h-1 w-5 rounded-full bg-current opacity-20" />
          <span className="h-1 w-5 rounded-full bg-current opacity-20" />
        </span>
      </span>
      <span className="mt-5 block max-w-[75%]">
        <span
          className="mb-2 block h-2 w-16 rounded-full"
          style={{ backgroundColor: colors.accentStrong }}
        />
        <span className="block h-3 w-full rounded-full bg-current opacity-65" />
        <span className="mt-2 block h-3 w-3/4 rounded-full bg-current opacity-45" />
      </span>
      <span className="absolute inset-x-4 bottom-4 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((item) => (
          <span
            key={item}
            className="h-8 rounded-lg border bg-white/55"
            style={{ borderColor: `${colors.primary}24` }}
          />
        ))}
      </span>
    </span>
  )
}

export function PublicSiteThemePicker({
  themes,
  value,
  onValueChange,
}: PublicSiteThemePickerProps) {
  if (themes.length === 0) {
    return (
      <div
        role="status"
        className="flex min-h-28 items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600"
      >
        <ImageIcon className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
        Jelenleg nincs aktív, választható weboldaltéma.
      </div>
    )
  }

  return (
    <fieldset aria-describedby="public-theme-picker-help">
      <legend className="sr-only">Weboldaltéma kiválasztása</legend>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <p id="public-theme-picker-help" className="text-sm leading-6 text-slate-600">
          Válassz egy sablont. A saját színekkel és borítóképpel később is személyre
          szabhatod.
        </p>
        <span className="shrink-0 text-xs font-medium text-slate-500">
          {themes.length} választható téma
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {themes.map((theme) => {
          const visualTheme = getPublicVisualTheme(theme.preset_key)
          const colors = resolveThemeColors(theme)
          const isSelected = value === theme.id
          const inputId = `public-theme-${theme.id}`
          const descriptionId = `${inputId}-description`

          return (
            <div key={theme.id} className="relative">
              <input
                id={inputId}
                type="radio"
                name="public-site-theme"
                value={theme.id}
                checked={isSelected}
                onChange={(event) => {
                  if (event.target.checked) onValueChange(theme.id)
                }}
                aria-describedby={descriptionId}
                className="peer sr-only"
                required
              />
              <label
                htmlFor={inputId}
                className={cn(
                  'group block min-h-11 cursor-pointer overflow-hidden rounded-2xl border-2 bg-white text-left shadow-sm transition duration-200',
                  'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
                  'motion-reduce:transform-none motion-reduce:transition-none',
                  'peer-focus-visible:outline-none peer-focus-visible:ring-4 peer-focus-visible:ring-emerald-500/25 peer-focus-visible:ring-offset-2',
                  isSelected
                    ? 'border-emerald-600 ring-2 ring-emerald-600/15'
                    : 'border-slate-200',
                )}
              >
                <span className="relative block aspect-[16/9] overflow-hidden bg-slate-100">
                  {visualTheme ? (
                    <>
                      <Image
                        src={visualTheme.assets.hero}
                        alt=""
                        fill
                        sizes="(min-width: 640px) 22rem, calc(100vw - 3rem)"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transform-none motion-reduce:transition-none"
                        style={{ objectPosition: visualTheme.hero.backgroundPosition }}
                      />
                      <span
                        className="absolute inset-0"
                        style={{ background: visualTheme.hero.overlay }}
                        aria-hidden="true"
                      />
                      <span className="absolute inset-x-4 bottom-4 text-white">
                        <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-white/75">
                          {visualTheme.adminPreview.eyebrow}
                        </span>
                        <span className="mt-1 block font-heading text-xl leading-none drop-shadow-sm">
                          {theme.display_name}
                        </span>
                      </span>
                    </>
                  ) : (
                    <LegacyThemePreview theme={theme} />
                  )}

                  {visualTheme && (
                    <span className="absolute left-3 top-3 rounded-full border border-white/35 bg-slate-950/45 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                      Képes téma
                    </span>
                  )}

                  {isSelected && (
                    <span className="absolute right-3 top-3 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white shadow-lg">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                      Kiválasztva
                    </span>
                  )}
                </span>

                <span className="block p-4">
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-semibold leading-5 text-slate-900">
                      {theme.display_name}
                    </span>
                    <span className="flex shrink-0 gap-1" aria-hidden="true">
                      <span
                        className="h-4 w-4 rounded-full border border-black/10"
                        style={{ backgroundColor: colors.primary }}
                      />
                      <span
                        className="h-4 w-4 rounded-full border border-black/10"
                        style={{ backgroundColor: colors.accentStrong }}
                      />
                    </span>
                  </span>
                  <span
                    id={descriptionId}
                    className="mt-1.5 block text-xs leading-5 text-slate-500"
                  >
                    {visualTheme?.adminPreview.summary ||
                      theme.description ||
                      'Személyre szabható gyülekezeti weboldaltéma.'}
                  </span>
                </span>
              </label>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
