import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface AdminPageHeaderProps {
  /** Az aloldal címe — pl. "Hozzáférés-kérelmek" */
  title: string
  /** Egy mondatos leírás a fejléc alatt */
  description: string
  /** Lucide ikon — pl. Inbox, Church, Users */
  icon: LucideIcon
  /** Tailwind gradient class — pl. "from-amber-500 to-orange-600" */
  gradient: string
  /** Eyebrow-felirat (összesen 2-3 szó, uppercase) — pl. "ADMIN MODUL" */
  eyebrow?: string
}

/**
 * Közös header az admin aloldalakhoz (Sprint U.4 v0.9.33, 2026-05-02).
 * Minden aloldal saját ikont, címet és színgradienst kap, így önálló
 * oldalként, nem fülként hat.
 */
export function AdminPageHeader({
  title,
  description,
  icon: Icon,
  gradient,
  eyebrow = 'Admin modul',
}: AdminPageHeaderProps) {
  return (
    <div className="card-raised relative overflow-hidden p-5 sm:p-6">
      {/* Háttér-blur dekoráció */}
      <div className={`absolute -right-12 -top-12 size-44 rounded-full bg-gradient-to-br ${gradient} opacity-15 blur-3xl`} />
      <div className="absolute -bottom-10 -left-10 size-32 rounded-full bg-gradient-to-br from-slate-300/20 to-slate-500/20 blur-3xl" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <div className={`flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-md`}>
            <Icon className="size-7" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {eyebrow}
            </p>
            <h1 className="mt-1 font-heading text-2xl text-slate-800 sm:text-3xl">
              {title}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
              {description}
            </p>
          </div>
        </div>

        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 self-start rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 sm:self-end"
        >
          <ChevronLeft className="size-3.5" />
          Vissza az áttekintőhöz
        </Link>
      </div>
    </div>
  )
}
