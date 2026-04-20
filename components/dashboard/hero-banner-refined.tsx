'use client'

import Image from 'next/image'
import { MapPin, Flower2 } from 'lucide-react'

import { formatHuDateFull, greeting } from '@/lib/utils/date'

interface HeroBannerRefinedProps {
  fullName: string
  congregationName: string
  todayNamedays: string[]
}

export function HeroBannerRefined({
  fullName,
  congregationName,
  todayNamedays,
}: HeroBannerRefinedProps) {
  const lastName = fullName ? fullName.split(' ').slice(-1)[0] : ''
  const greetingText = lastName ? greeting().replace('!', `, ${lastName}!`) : greeting()
  const dateText = formatHuDateFull(new Date())

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/18 bg-[linear-gradient(135deg,#14514b_0%,#1b6a63_48%,#264f69_100%)] p-6 text-white shadow-[0_36px_90px_-48px_rgba(11,44,54,0.78)] md:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,214,153,0.24),transparent_18rem),radial-gradient(circle_at_88%_18%,rgba(182,235,225,0.18),transparent_16rem)]" />
      <div className="absolute right-[-2rem] top-[-3rem] h-48 w-48 rounded-full bg-white/[0.06] blur-3xl" />
      <div className="absolute bottom-[-2rem] left-[-2rem] h-40 w-40 rounded-full bg-amber-200/14 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium tracking-wide text-teal-50/82">{dateText || '\u00A0'}</p>
          <h1 className="font-heading text-3xl font-semibold drop-shadow-sm md:text-4xl">{greetingText || '\u00A0'}</h1>
          <p className="mt-2 max-w-2xl text-sm text-teal-50/72 md:text-base">
            Egy nyugodt, meleg hangulatú áttekintés a gyülekezeti élet fontos történéseiről és ritmusáról.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            {congregationName && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.1] px-3.5 py-1.5 text-sm text-teal-50">
                <MapPin className="h-3.5 w-3.5" />
                {congregationName}
              </span>
            )}
            {todayNamedays.length > 0 && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.1] px-3.5 py-1.5 text-sm text-teal-50">
                <Flower2 className="h-3.5 w-3.5 text-pink-300" />
                Névnap: <strong className="text-white">{todayNamedays.join(', ')}</strong>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-[1.6rem] border border-white/12 bg-white/[0.08] px-4 py-3 backdrop-blur-xl">
          <div className="flex size-14 items-center justify-center rounded-[1.2rem] bg-white/88 shadow-[0_18px_34px_-24px_rgba(0,0,0,0.45)]">
            <Image src="/EREK.png" alt="EREK" width={38} height={38} className="object-contain" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-teal-50/65">Erdélyi Református Egyházkerület</p>
            <p className="mt-1 font-heading text-xl text-white">Kartotéka</p>
          </div>
        </div>
      </div>
    </div>
  )
}
