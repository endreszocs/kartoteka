'use client'

/**
 * Welcome wizard közös UI-helper komponensek (2026-05-05).
 *
 * Cél: minden lépésen ugyanazok a vizuális minták — kártya-szakaszok,
 * címkézett mezők, listás-elemek (multi-row hozzáadás), figyelmeztető
 * bannerek. Azelőtt minden step különbözőképpen volt felépítve, ezért a
 * felhasználó többször nem találta meg, melyik mezőbe mit ír.
 *
 * Kategóriák:
 *   - WizardSectionCard — egy kártya-szakasz (ikon + cím + leírás + body)
 *   - WizardField — egy bemeneti mező (Label + Input/textarea + leírás +
 *     opcionális hibaüzenet)
 *   - WizardBanner — info / figyelmeztetés / siker / hiba banner
 *   - WizardListItem — egy lista-elem (multi-row UI-hoz, "+ Új ...")
 *   - WizardAddButton — szabványos "+ Új ..." gomb listás szakaszhoz
 */

import type { ComponentProps, ComponentType, ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input as BaseInput } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ──────────────────────────────────────────────────────────────────────
// Input — a wizardban kiemeltebb beviteli mező (2026-06-04)
//
// A standard fehér input fehér kártyán egybeolvadt a háttérrel. Itt egy
// határozottabb stílust adunk: világosszürke háttér + erősebb keret, fókuszban
// fehér háttér + emerald gyűrű — így jól látszik, hova kell írni. Egy helyen
// definiálva → az összes wizard-lépés azonnal öröklődik.
// ──────────────────────────────────────────────────────────────────────

export function Input({ className, ...props }: ComponentProps<typeof BaseInput>) {
  return (
    <BaseInput
      className={cn(
        'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400 shadow-inner',
        'focus-visible:border-emerald-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-100',
        className,
      )}
      {...props}
    />
  )
}

// ──────────────────────────────────────────────────────────────────────
// WizardSectionCard
// ──────────────────────────────────────────────────────────────────────

export interface WizardSectionCardProps {
  icon: ComponentType<{ className?: string }>
  iconColor?: string // Tailwind class — pl. "text-emerald-600"
  iconBg?: string // Tailwind class — pl. "bg-emerald-50"
  title: string
  description?: string
  children: ReactNode
  /** Opcionális top-banner a szakaszon belül (pl. "ezt a saját adatként ne add meg") */
  banner?: ReactNode
}

export function WizardSectionCard({
  icon: Icon,
  iconColor = 'text-slate-600',
  iconBg = 'bg-slate-100',
  title,
  description,
  children,
  banner,
}: WizardSectionCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start gap-3 border-b border-slate-100 p-4 md:p-5">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
        >
          <Icon className={`size-5 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base text-slate-800 md:text-lg">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-xs text-slate-500 md:text-sm">{description}</p>
          )}
        </div>
      </header>
      <div className="space-y-4 p-4 md:p-5">
        {banner}
        {children}
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────
// WizardField — egységes mező Label + Input + leírás + hiba
// ──────────────────────────────────────────────────────────────────────

export interface WizardFieldProps {
  id: string
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
}

export function WizardField({
  id,
  label,
  required,
  hint,
  error,
  children,
}: WizardFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1 text-sm font-medium">
        <span>{label}</span>
        {required && <span className="text-rose-600">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// WizardBanner
// ──────────────────────────────────────────────────────────────────────

export type WizardBannerTone = 'info' | 'warning' | 'success' | 'pastoral'

export interface WizardBannerProps {
  tone?: WizardBannerTone
  icon?: ComponentType<{ className?: string }>
  children: ReactNode
}

export function WizardBanner({
  tone = 'info',
  icon: Icon,
  children,
}: WizardBannerProps) {
  const tones: Record<WizardBannerTone, string> = {
    info: 'border-sky-200 bg-sky-50/70 text-sky-900',
    warning: 'border-amber-200 bg-amber-50/70 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
    pastoral: 'border-violet-200 bg-violet-50/70 text-violet-900',
  }
  return (
    <div className={`rounded-xl border p-3 text-sm leading-relaxed ${tones[tone]}`}>
      <div className="flex items-start gap-2">
        {Icon && <Icon className="mt-0.5 size-4 shrink-0" />}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// WizardListItem — egy multi-row UI-elem (törlés gombbal)
// ──────────────────────────────────────────────────────────────────────

export interface WizardListItemProps {
  title: string
  subtitle?: string
  onRemove?: () => void
  removeLabel?: string
  children?: ReactNode
}

export function WizardListItem({
  title,
  subtitle,
  onRemove,
  removeLabel = 'Törlés',
  children,
}: WizardListItemProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-8 gap-1.5 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 className="size-3.5" />
            <span className="hidden sm:inline">{removeLabel}</span>
          </Button>
        )}
      </div>
      {children && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// WizardAddButton
// ──────────────────────────────────────────────────────────────────────

export interface WizardAddButtonProps {
  onClick: () => void
  label: string
  disabled?: boolean
}

export function WizardAddButton({ onClick, label, disabled }: WizardAddButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-sm font-medium text-slate-600 transition-colors hover:border-violet-400 hover:bg-violet-50/50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus className="size-4" />
      <span>{label}</span>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────
// WizardInputGrid — grid layout mezőkhöz (mobile-first)
// ──────────────────────────────────────────────────────────────────────

export function WizardInputGrid({
  cols = 2,
  children,
}: {
  cols?: 1 | 2 | 3
  children: ReactNode
}) {
  const colClass =
    cols === 3 ? 'md:grid-cols-3' : cols === 2 ? 'md:grid-cols-2' : ''
  return <div className={`grid gap-4 ${colClass}`}>{children}</div>
}

// Re-export, hogy a step-fájlok egy helyről importálhassanak.
// (Az `Input` fentebb, saját, kiemeltebb wrapper-ként van exportálva.)
export { Label, Button }
