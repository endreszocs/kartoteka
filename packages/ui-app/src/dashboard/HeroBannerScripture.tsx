'use client'

import { useState } from 'react'
import { BookOpen, ChevronDown, Flower2, MapPin, Sparkles } from 'lucide-react'

import { cn } from '@kartoteka/ui'

export interface NamedayWithMeaning {
  name: string
  meaning?: string
  origin?: string
}

export interface DailyVerseData {
  verse: string
  reference: string
}

export interface HeroBannerScriptureProps {
  /** Az előre kiszámított, szövegezett köszöntés (pl. „Jó reggelt, Endre!" vagy „Boldog Új Évet, Endre!"). */
  greetingText: string
  /** Ha ünnep van ma, ennek a neve (pl. „Karácsony"). Csip jelenik meg vele a hero-on. */
  holidayName?: string | null
  /** Az előre formattált dátum-szöveg (pl. „2026. április 25. — szombat"). */
  dateText: string
  /** A gyülekezet neve a chip-hez. Ha null, a chip nem látszik. */
  congregationName: string | null
  /** A mai névnapok, opcionálisan etimológiai jelentéssel/eredettel. */
  todayNamedays?: NamedayWithMeaning[]
  /** Az aznapi ige — a wrapper fetch-eli, és átadja. Ha null, skeleton-loader látszik. */
  dailyVerse: DailyVerseData | null
  /** Az alcím; alapértelmezett barátságos szöveg. */
  introText?: string
}

const DEFAULT_INTRO =
  'Egy nyugodt, meleg hangulatú áttekintés a gyülekezeti élet fontos történéseiről és ritmusáról.'

const DEFAULT_VERSE_THOUGHTS_NULL = [
  'Csendesedjünk el egy pillanatra, és hagyjuk, hogy a mai ige lassan megérkezzen a szívünkbe.',
  'Egyetlen mondat is elég lehet ahhoz, hogy a mai szolgálatnak új ritmust és békességet adjon.',
  'Imádság: Uram, tedd a mai igét világossá előttem, hogy örömmel és hűséggel járjak benne.',
]

function buildVerseThoughts(verse: DailyVerseData | null): string[] {
  if (!verse) return DEFAULT_VERSE_THOUGHTS_NULL
  return [
    `Ez az ige ma arra hív, hogy ne csak elolvassuk, hanem vigyük magunkkal a következő döntéseinkbe is: ${verse.reference}.`,
    'A gyülekezeti szolgálatban, a látogatásokban és az otthoni csendben is kapaszkodó lehet ez a rövid mondat.',
    'Imádság: Uram, formáld a mai napomat úgy, hogy ez az ige bennem is testet öltsön.',
  ]
}

export function HeroBannerScripture({
  greetingText,
  holidayName,
  dateText,
  congregationName,
  todayNamedays = [],
  dailyVerse,
  introText = DEFAULT_INTRO,
}: HeroBannerScriptureProps) {
  const [verseExpanded, setVerseExpanded] = useState(false)
  const verseThoughts = buildVerseThoughts(dailyVerse)
  const hasNamedays = todayNamedays.length > 0
  const namedaysWithMeaning = todayNamedays.filter((n) => n.meaning)

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/18 bg-[linear-gradient(135deg,#14514b_0%,#1b6a63_48%,#264f69_100%)] p-6 text-white shadow-[0_36px_90px_-48px_rgba(11,44,54,0.78)] md:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,214,153,0.24),transparent_18rem),radial-gradient(circle_at_88%_18%,rgba(182,235,225,0.18),transparent_16rem)]" />
      <div className="absolute right-[-2rem] top-[-3rem] h-48 w-48 rounded-full bg-white/[0.06] blur-3xl" />
      <div className="absolute bottom-[-2rem] left-[-2rem] h-40 w-40 rounded-full bg-amber-200/14 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium tracking-wide text-teal-50/82">{dateText || '\u00A0'}</p>
          <h1 className="font-heading text-3xl font-semibold drop-shadow-sm md:text-4xl">
            {greetingText || '\u00A0'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-teal-50/72 md:text-base">{introText}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            {holidayName && (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-gradient-to-r from-amber-400/25 to-orange-400/20 px-3.5 py-1.5 text-sm font-medium text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                <Sparkles className="h-3.5 w-3.5 text-amber-200" />
                {holidayName}
              </span>
            )}
            {congregationName && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.1] px-3.5 py-1.5 text-sm text-teal-50">
                <MapPin className="h-3.5 w-3.5" />
                {congregationName}
              </span>
            )}
            {hasNamedays && (
              <span
                className="inline-flex items-center gap-2 rounded-full bg-white/[0.1] px-3.5 py-1.5 text-sm text-teal-50"
                title={namedaysWithMeaning
                  .map((n) => `${n.name}: ${n.meaning} (${n.origin})`)
                  .join('\n')}
              >
                <Flower2 className="h-3.5 w-3.5 text-pink-300" />
                Névnap:{' '}
                <strong className="text-white">{todayNamedays.map((n) => n.name).join(', ')}</strong>
                {namedaysWithMeaning.length > 0 && (
                  <span className="ml-1 rounded-full bg-white/[0.15] px-1.5 py-0.5 text-[10px]">
                    ℹ️
                  </span>
                )}
              </span>
            )}
            {namedaysWithMeaning.length > 0 && (
              <div className="w-full">
                <div className="mt-2 space-y-1 text-xs text-teal-50/80">
                  {namedaysWithMeaning.map((n) => (
                    <div key={n.name} className="flex items-start gap-1.5">
                      <span className="mt-0.5 inline-block size-1 rounded-full bg-pink-300" />
                      <span>
                        <strong className="text-teal-50">{n.name}</strong>
                        {n.origin && <span className="text-teal-100/60"> ({n.origin})</span>} —{' '}
                        <em className="text-teal-50/90">{n.meaning}</em>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setVerseExpanded((prev) => !prev)}
          aria-expanded={verseExpanded}
          className={cn(
            'group w-full rounded-[1.6rem] border border-white/12 bg-white/[0.08] px-4 py-3 text-left backdrop-blur-xl transition-all duration-300 hover:bg-white/[0.11] lg:max-w-[22rem]',
            verseExpanded && 'lg:max-w-[34rem]',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-amber-100/80">
                <BookOpen className="size-3.5" />
                Mai ige
              </div>

              {!dailyVerse ? (
                <div className="mt-3 animate-pulse space-y-2">
                  <div className="h-3 w-4/5 rounded-full bg-white/16" />
                  <div className="h-3 w-full rounded-full bg-white/16" />
                  <div className="h-3 w-2/3 rounded-full bg-white/16" />
                </div>
              ) : (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-white/92">{dailyVerse.verse}</p>
                  <p className="mt-2 text-xs font-semibold text-amber-100/88">{dailyVerse.reference}</p>
                </>
              )}
            </div>

            <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-white/70 transition group-hover:bg-white/16 group-hover:text-white">
              <ChevronDown
                className={cn('size-4 transition-transform duration-300', verseExpanded && 'rotate-180')}
              />
            </div>
          </div>

          <div
            className={cn(
              'grid transition-all duration-300 ease-out',
              verseExpanded ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
          >
            <div className="overflow-hidden">
              <div className="space-y-2 rounded-[1.2rem] border border-white/10 bg-black/10 px-3.5 py-3">
                {verseThoughts.map((thought) => (
                  <p key={thought} className="text-sm leading-relaxed text-teal-50/82">
                    {thought}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
