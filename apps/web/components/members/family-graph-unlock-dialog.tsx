'use client'

import { ArrowRight, Network, Sparkles, Users, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FAMILY_GRAPH_UNLOCK_THRESHOLD,
} from '@/lib/members/family-graph-types'

interface FamilyGraphUnlockDialogProps {
  congregationId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onExplore: () => void
}

export function FamilyGraphUnlockDialog({
  open,
  onOpenChange,
  onExplore,
}: FamilyGraphUnlockDialogProps) {
  function handleExplore() {
    onOpenChange(false)
    onExplore()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-1.25rem)] !w-[min(620px,calc(100vw-1.25rem))] !max-w-[min(620px,calc(100vw-1.25rem))] overflow-y-auto overscroll-contain rounded-[1.75rem] border-0 bg-[#071b1c] p-0 text-white shadow-[0_40px_100px_-24px_rgba(2,16,17,0.82)] ring-1 ring-amber-200/20 sm:max-h-[calc(100dvh-3rem)] sm:!w-[min(620px,calc(100vw-3rem))] sm:!max-w-[min(620px,calc(100vw-3rem))]"
      >
        <div className="relative isolate overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 -z-20 opacity-90"
            style={{
              backgroundImage:
                'radial-gradient(circle at 18% 13%, rgba(64,184,166,.2), transparent 28%), radial-gradient(circle at 86% 5%, rgba(244,190,72,.16), transparent 25%), linear-gradient(145deg, #0b2929 0%, #071b1c 58%, #061516 100%)',
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-35"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(225,248,241,.55) 1px, transparent 0)',
              backgroundSize: '25px 25px',
              maskImage: 'linear-gradient(to bottom, black, transparent 88%)',
            }}
          />

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-20 inline-flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/65 backdrop-blur transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 motion-reduce:transition-none"
            aria-label="Bezárás"
          >
            <X className="size-4" />
          </button>

          <div className="px-5 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200">
              <Sparkles className="size-3.5" />
              Új felfedezés
            </div>

            <div className="mt-5 grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_210px]">
              <div>
                <DialogTitle className="font-heading text-[2rem] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[2.55rem]">
                  Kirajzolódott a gyülekezet családi világa
                </DialogTitle>
                <DialogDescription className="mt-4 text-[14px] leading-6 text-teal-50/70 sm:text-[15px]">
                  Már {FAMILY_GRAPH_UNLOCK_THRESHOLD} család kapcsolódik egymáshoz. Mostantól egyetlen
                  élő, vizuális térképen fedezheted fel a személyeket, családokat és rokoni
                  kapcsolatokat.
                </DialogDescription>
              </div>

              <DiscoveryConstellation />
            </div>

            <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3.5">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-300/10 text-teal-200">
                  <Network className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">Kapcsolatok egyben</p>
                  <p className="mt-0.5 text-xs leading-5 text-teal-50/55">Közelíts, mozgasd és fedezd fel a hálózatot.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3.5">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-200/10 text-amber-200">
                  <Users className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">Fókuszált felfedezés</p>
                  <p className="mt-0.5 text-xs leading-5 text-teal-50/55">Egy család közvetlen környezete külön is vizsgálható.</p>
                </div>
              </div>
            </div>

            <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="min-h-11 rounded-xl px-4 text-sm font-medium text-teal-50/55 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 motion-reduce:transition-none"
              >
                Később fedezem fel
              </button>
              <Button
                type="button"
                size="lg"
                onClick={handleExplore}
                className="min-h-12 rounded-2xl bg-gradient-to-r from-amber-300 to-amber-200 px-5 font-semibold text-[#153331] shadow-[0_16px_34px_-14px_rgba(244,190,72,0.75)] hover:from-amber-200 hover:to-amber-100"
              >
                Megnézem a családi hálót
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DiscoveryConstellation() {
  return (
    <div
      aria-hidden
      className="relative mx-auto aspect-square w-[190px] overflow-hidden rounded-[2rem] border border-white/10 bg-black/10 shadow-[inset_0_0_50px_rgba(36,143,132,.14)] sm:w-[210px]"
    >
      <svg viewBox="0 0 210 210" className="absolute inset-0 size-full">
        <g fill="none" stroke="rgba(153,221,210,.24)" strokeWidth="1.25">
          <path d="M105 104 L42 53 M105 104 L169 48 M105 104 L175 145 M105 104 L47 162" />
          <path d="M42 53 L24 103 M42 53 L80 24 M169 48 L189 88 M175 145 L150 184 M47 162 L20 138" />
        </g>
        <g fill="#82d6c8">
          <circle cx="42" cy="53" r="7" opacity=".9" />
          <circle cx="169" cy="48" r="6" opacity=".8" />
          <circle cx="175" cy="145" r="7" opacity=".75" />
          <circle cx="47" cy="162" r="6" opacity=".72" />
          <circle cx="24" cy="103" r="3.5" opacity=".6" />
          <circle cx="80" cy="24" r="3.5" opacity=".55" />
          <circle cx="189" cy="88" r="3.5" opacity=".6" />
          <circle cx="150" cy="184" r="3.5" opacity=".55" />
          <circle cx="20" cy="138" r="3.5" opacity=".55" />
        </g>
        <circle cx="105" cy="104" r="18" fill="rgba(244,190,72,.16)" stroke="rgba(251,211,128,.8)" strokeWidth="1.5" />
        <circle cx="105" cy="104" r="5" fill="#f6cf78" />
      </svg>
      <span className="absolute left-[41%] top-[42%] size-9 rounded-full border border-amber-200/20 motion-safe:animate-ping" />
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#0a2525]/85 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-teal-100/65 backdrop-blur">
        Kapcsolati univerzum
      </span>
    </div>
  )
}
