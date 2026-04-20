'use client'

import { greeting, formatHuDateFull } from '@/lib/utils/date'
import { MapPin, Flower2 } from 'lucide-react'

interface HeroBannerProps {
  fullName: string
  congregationName: string
  todayNamedays: string[]
}

export function HeroBanner({ fullName, congregationName, todayNamedays }: HeroBannerProps) {
  const lastName = fullName ? fullName.split(' ').slice(-1)[0] : ''
  const greetingText = lastName ? greeting().replace('!', `, ${lastName}!`) : greeting()
  const dateText = formatHuDateFull(new Date())

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 md:p-8 text-white"
      style={{ boxShadow: '0 4px 20px rgba(59,130,246,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}
    >
      {/* Dekoratív körök */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-white/[0.04] rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/[0.04] rounded-full translate-y-1/2 -translate-x-1/3" />
      <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-white/[0.03] rounded-full" />

      <div className="relative z-10">
        <p className="text-blue-200/80 text-sm font-medium tracking-wide">{dateText || '\u00A0'}</p>
        <h1 className="text-2xl md:text-3xl font-bold mt-1.5 drop-shadow-sm">{greetingText || '\u00A0'}</h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4">
          {congregationName && (
            <span className="inline-flex items-center gap-2 text-sm text-blue-100 bg-white/[0.08] rounded-full px-3.5 py-1.5"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 2px rgba(0,0,0,0.1)' }}>
              <MapPin className="w-3.5 h-3.5" />
              {congregationName}
            </span>
          )}
          {todayNamedays.length > 0 && (
            <span className="inline-flex items-center gap-2 text-sm text-blue-100 bg-white/[0.08] rounded-full px-3.5 py-1.5"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 2px rgba(0,0,0,0.1)' }}>
              <Flower2 className="w-3.5 h-3.5 text-pink-300" />
              Névnap: <strong className="text-white">{todayNamedays.join(', ')}</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
