import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface AdminPageHeaderProps {
  /** Az aloldal címe — pl. "Hozzáférés-kérelmek" */
  title: string
  /** Egy mondatos leírás a fejléc alatt */
  description: string
  /** Lucide ikon — pl. Inbox, Church, Users */
  icon: LucideIcon
  /** Eyebrow-felirat (összesen 2-3 szó, uppercase) — pl. "ADMIN MODUL" */
  eyebrow?: string
  /**
   * Hangulat: 'danger' a visszafordíthatatlan műveleteket kínáló oldalakhoz
   * (veszélyes zóna) — destructive-árnyalatú ikonlap és háttér-blob.
   */
  tone?: 'default' | 'danger'
  /** Akciógombok a fejléc jobb oldalán (mobilon a leírás alatt) */
  actions?: ReactNode
  /** Kis statisztika-kártyák a fejléc alján */
  stats?: Array<{ label: string; value: string | number }>
  /**
   * @deprecated 2026-07-11 admin-redesign: a fejléc téma-tokenekből színez
   * (var(--primary)/var(--accent)), az oldalankénti gradient megszűnt.
   * A prop csak azért maradt, hogy a régi hívások ne törjenek.
   */
  gradient?: string
}

/**
 * Közös header az admin aloldalakhoz (Sprint U.4 v0.9.33, 2026-05-02;
 * token-alapú újradizájn: 2026-07-11).
 *
 * A korábbi oldalankénti szivárvány-gradientek helyett a mindenkori téma
 * tokenjeiből (--primary/--accent/--accent2) színez — így mindhárom témát
 * (kert/parokia/zsoltaros) és a dark módot is automatikusan követi, és az
 * admin vizuálisan az app többi moduljával egy családba tartozik.
 */
export function AdminPageHeader({
  title,
  description,
  icon: Icon,
  eyebrow = 'Admin modul',
  tone = 'default',
  actions,
  stats,
}: AdminPageHeaderProps) {
  const danger = tone === 'danger'

  return (
    <div className="card-raised relative overflow-hidden p-5 sm:p-6">
      {/* Háttér-blur dekoráció — téma-tokenekből (PageHero-minta) */}
      <div
        aria-hidden
        className="absolute -right-12 -top-12 size-44 rounded-full blur-3xl"
        style={{
          background: danger
            ? 'color-mix(in oklab, var(--destructive) 22%, transparent)'
            : 'color-mix(in oklab, var(--accent2) 30%, transparent)',
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-10 -left-10 size-32 rounded-full blur-3xl"
        style={{
          background: danger
            ? 'color-mix(in oklab, var(--destructive) 14%, transparent)'
            : 'color-mix(in oklab, var(--primary) 25%, transparent)',
        }}
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3 sm:gap-4">
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-[var(--primary-foreground)] shadow-md sm:size-14"
            style={{
              background: danger
                ? 'linear-gradient(135deg, var(--destructive), color-mix(in oklab, var(--destructive) 65%, black))'
                : 'linear-gradient(135deg, var(--primary), var(--accent))',
            }}
          >
            <Icon className="size-6 sm:size-7" />
          </div>
          <div className="min-w-0">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                color: danger
                  ? 'color-mix(in oklab, var(--destructive) 75%, var(--muted-foreground))'
                  : 'color-mix(in oklab, var(--primary) 65%, var(--muted-foreground))',
              }}
            >
              {eyebrow}
            </p>
            <h1 className="mt-1 font-heading text-2xl text-foreground sm:text-3xl">
              {title}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:flex-col sm:items-end sm:self-end">
          <Link
            href="/admin"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            Vissza az áttekintőhöz
          </Link>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      </div>

      {stats && stats.length > 0 && (
        <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl bg-muted/60 px-3 py-2 ring-1 ring-border"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-0.5 font-heading text-base font-semibold text-foreground tabular-nums">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
