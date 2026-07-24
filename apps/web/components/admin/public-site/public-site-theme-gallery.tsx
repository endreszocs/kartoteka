import Image from 'next/image'
import Link from 'next/link'
import { Check, Clock3, Palette } from 'lucide-react'

import {
  PUBLIC_VISUAL_THEMES,
  type PublicVisualThemeDefinition,
} from '@/lib/public-site/visual-theme-registry'
import { cn } from '@/lib/utils'

interface PublicSiteThemeRow {
  id: string
  preset_key: string
  display_name: string
}

interface PublicSiteThemeGalleryProps {
  themes: PublicSiteThemeRow[]
  selectedThemeId: string | null
  canWrite: boolean
}

interface ThemePreviewProps {
  visual: PublicVisualThemeDefinition
  theme: PublicSiteThemeRow | undefined
  isSelected: boolean
}

function ThemePreview({ visual, theme, isSelected }: ThemePreviewProps) {
  return (
    <span
      className={cn(
        'group block h-full overflow-hidden rounded-2xl border-2 bg-white text-left shadow-sm transition',
        'motion-reduce:transition-none',
        isSelected
          ? 'border-emerald-500 ring-4 ring-emerald-500/10'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md',
      )}
    >
      <span className="relative block aspect-[16/10] overflow-hidden bg-slate-100">
        <Image
          src={visual.assets.hero}
          alt=""
          fill
          sizes="(min-width: 1280px) 25rem, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.025] motion-reduce:transform-none motion-reduce:transition-none"
          style={{ objectPosition: visual.hero.backgroundPosition }}
        />
        <span
          className="absolute inset-0"
          style={{ background: visual.hero.overlay }}
          aria-hidden="true"
        />
        <span className="absolute inset-x-4 bottom-4 text-white">
          <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/75">
            {visual.adminPreview.eyebrow}
          </span>
          <span className="mt-1 block font-heading text-xl leading-tight drop-shadow-sm">
            {theme?.display_name ?? visual.displayName}
          </span>
        </span>
        <span
          className={cn(
            'absolute right-3 top-3 inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-lg backdrop-blur-sm',
            isSelected
              ? 'bg-emerald-700 text-white'
              : theme
                ? 'border border-white/40 bg-slate-950/50 text-white'
                : 'border border-amber-200/70 bg-amber-50/95 text-amber-800',
          )}
        >
          {isSelected ? (
            <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
          ) : theme ? (
            <Palette className="size-3.5" aria-hidden="true" />
          ) : (
            <Clock3 className="size-3.5" aria-hidden="true" />
          )}
          {isSelected ? 'Aktív téma' : theme ? 'Választható' : 'Előkészítve'}
        </span>
      </span>

      <span className="block p-4">
        <span className="block text-sm font-semibold text-slate-900">
          {theme?.display_name ?? visual.displayName}
        </span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {visual.adminPreview.summary}
        </span>
      </span>
    </span>
  )
}

/** A jóváhagyott, generált képes témák szerveroldali galériája. */
export function PublicSiteThemeGallery({
  themes,
  selectedThemeId,
  canWrite,
}: PublicSiteThemeGalleryProps) {
  const themesByPreset = new Map(themes.map((theme) => [theme.preset_key, theme]))

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Object.values(PUBLIC_VISUAL_THEMES).map((visual) => {
        const theme = themesByPreset.get(visual.key)
        const isSelected = Boolean(theme && selectedThemeId === theme.id)
        const preview = <ThemePreview visual={visual} theme={theme} isSelected={isSelected} />

        return canWrite && theme ? (
          <Link
            key={visual.key}
            href="/publikus-oldal/beallitasok"
            aria-label={`${theme.display_name} téma beállítása`}
            className="rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2"
          >
            {preview}
          </Link>
        ) : (
          <div key={visual.key}>{preview}</div>
        )
      })}
    </div>
  )
}
