'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { BookOpen, ChevronRight, Flower2, MapPin } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatHuDateFull, greeting } from '@/lib/utils/date'

interface HeroBannerScriptureProps {
  fullName: string
  congregationName: string
  todayNamedays: string[]
}

interface VerseData {
  verse: string
  reference: string
  date: string
}

function buildVerseThoughts(data: VerseData | null) {
  if (!data) {
    return [
      'Csendesedjünk el egy pillanatra, és hagyjuk, hogy a mai ige lassan megérkezzen a szívünkbe.',
      'Egyetlen mondat is elég lehet ahhoz, hogy a mai szolgálatnak új ritmust és békességet adjon.',
      'Imádság: Uram, tedd a mai igét világossá előttem, hogy örömmel és hűséggel járjak benne.',
    ]
  }

  return [
    `Ez az ige ma arra hív, hogy ne csak elolvassuk, hanem vigyük magunkkal a következő döntéseinkbe is: ${data.reference}.`,
    'A gyülekezeti szolgálatban, a látogatásokban és az otthoni csendben is kapaszkodó lehet ez a rövid mondat.',
    'Imádság: Uram, formáld a mai napomat úgy, hogy ez az ige bennem is testet öltsön.',
  ]
}

export function HeroBannerScripture({
  fullName,
  congregationName,
  todayNamedays,
}: HeroBannerScriptureProps) {
  const [dailyVerse, setDailyVerse] = useState<VerseData | null>(null)
  const [verseExpanded, setVerseExpanded] = useState(false)

  const lastName = fullName ? fullName.split(' ').slice(-1)[0] : ''
  const greetingText = lastName ? greeting().replace('!', `, ${lastName}!`) : greeting()
  const dateText = formatHuDateFull(new Date())
  const verseThoughts = useMemo(() => buildVerseThoughts(dailyVerse), [dailyVerse])

  useEffect(() => {
    let active = true

    fetch('/api/daily-verse')
      .then((response) => response.json())
      .then((payload: VerseData) => {
        if (active) {
          setDailyVerse(payload)
        }
      })
      .catch(() => {
        if (active) {
          setDailyVerse({
            verse: 'Bízzál az Úrban teljes szíveddel, és ne a magad eszére támaszkodj!',
            reference: 'Példabeszédek 3:5',
            date: new Date().toISOString().split('T')[0],
          })
        }
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <div
      className="relative overflow-hidden rounded-[2rem] border border-white/18 p-6 text-white shadow-[0_36px_90px_-48px_rgba(11,44,54,0.78)] md:p-8"
      style={{ background: 'linear-gradient(135deg, var(--sidebar) 0%, var(--primary) 60%, var(--sidebar) 100%)' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,214,153,0.24),transparent_18rem),radial-gradient(circle_at_88%_18%,rgba(182,235,225,0.18),transparent_16rem)]" />
      <div className="absolute right-[-2rem] top-[-3rem] h-48 w-48 rounded-full bg-white/[0.06] blur-3xl" />
      <div className="absolute bottom-[-2rem] left-[-2rem] h-40 w-40 rounded-full bg-amber-200/14 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
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

        <button
          type="button"
          onClick={() => setVerseExpanded((prev) => !prev)}
          aria-expanded={verseExpanded}
          className={cn(
            'group w-full rounded-[1.6rem] border border-white/12 bg-white/[0.08] px-4 py-3 text-left backdrop-blur-xl transition-all duration-300 hover:bg-white/[0.11] lg:max-w-[20rem]',
            verseExpanded && 'lg:max-w-[33rem]'
          )}
        >
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-[1.2rem] bg-white/88 shadow-[0_18px_34px_-24px_rgba(0,0,0,0.45)]">
              <Image src="/EREK.png" alt="EREK" width={38} height={38} className="object-contain" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-teal-50/65">Erdélyi Református Egyházkerület</p>
                  <p className="mt-1 font-heading text-xl text-white">Kartotéka</p>
                </div>

                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-white/70 transition group-hover:bg-white/16 group-hover:text-white">
                  <ChevronRight className={cn('size-4 transition-transform duration-300', verseExpanded && 'rotate-90')} />
                </div>
              </div>

              <div className="mt-3 rounded-[1.2rem] border border-white/10 bg-black/10 px-3.5 py-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-amber-100/80">
                  <BookOpen className="size-3.5" />
                  Mai ige
                </div>

                {!dailyVerse ? (
                  <div className="mt-3 space-y-2 animate-pulse">
                    <div className="h-3 w-4/5 rounded-full bg-white/16" />
                    <div className="h-3 w-full rounded-full bg-white/16" />
                    <div className="h-3 w-2/3 rounded-full bg-white/16" />
                  </div>
                ) : (
                  <>
                    <p className="mt-3 text-sm leading-relaxed text-white/92">
                      {dailyVerse.verse}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-amber-100/88">
                      {dailyVerse.reference}
                    </p>
                  </>
                )}

                <div
                  className={cn(
                    'grid transition-all duration-300 ease-out',
                    verseExpanded ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-2 border-t border-white/10 pt-4">
                      {verseThoughts.map((thought) => (
                        <p key={thought} className="text-sm leading-relaxed text-teal-50/82">
                          {thought}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
