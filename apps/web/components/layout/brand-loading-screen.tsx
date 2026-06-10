'use client'

import Image from 'next/image'

interface BrandLoadingScreenProps {
  title?: string
  subtitle?: string
  message?: string
  compact?: boolean
}

export function BrandLoadingScreen({
  title = 'Kartotéka',
  // 2026-06-10: semleges felirat — a rendszer nem csak az erdélyi kerületé
  subtitle = 'Református gyülekezeti nyilvántartás',
  message = 'A szolgálati tér előkészítése folyamatban van...',
  compact = false,
}: BrandLoadingScreenProps) {
  return (
    <div className="card-raised relative isolate overflow-hidden p-6">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(243,192,97,0.22),transparent_15rem),radial-gradient(circle_at_top_right,rgba(54,162,152,0.16),transparent_17rem)]" />
      <div className="absolute left-[-2rem] top-[-2rem] -z-10 h-28 w-28 rounded-full bg-amber-200/30 blur-3xl" />
      <div className="absolute bottom-[-2rem] right-[-2rem] -z-10 h-28 w-28 rounded-full bg-teal-200/30 blur-3xl" />

      <div className={`flex ${compact ? 'items-center gap-4' : 'min-h-[46vh] flex-col items-center justify-center gap-5 text-center'}`}>
        <div className="relative">
          <div className="absolute inset-[-10px] animate-pulse rounded-[1.8rem] bg-gradient-to-br from-amber-300/25 via-white/10 to-teal-300/20 blur-md" />
          <div className="relative flex size-20 items-center justify-center rounded-[1.7rem] border border-white/75 bg-white/92 shadow-[0_24px_40px_-24px_rgba(16,70,63,0.4)]">
            <Image src="/kartoteka-logo.png" alt="Kartotéka" width={compact ? 40 : 54} height={compact ? 40 : 54} className="object-contain" />
          </div>
        </div>

        <div className={compact ? 'min-w-0' : 'max-w-xl'}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/68">
            {subtitle}
          </p>
          <h2 className="mt-2 font-heading text-3xl text-slate-800 md:text-4xl">
            {title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-500 md:text-base">
            {message}
          </p>

          <div className="mt-5 flex items-center justify-center gap-2">
            <span className="size-2 rounded-full bg-teal-500/75 animate-bounce [animation-delay:-0.2s]" />
            <span className="size-2 rounded-full bg-amber-400/80 animate-bounce [animation-delay:-0.1s]" />
            <span className="size-2 rounded-full bg-cyan-500/75 animate-bounce" />
          </div>
        </div>
      </div>
    </div>
  )
}
