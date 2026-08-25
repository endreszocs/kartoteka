'use client'

import { useEffect, useMemo, useState } from 'react'
import { BookMarked, BookOpen, ChevronDown, Flower2, MapPin, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatHuDateFull } from '@/lib/utils/date'
import { extractFirstName, getPersonalizedGreeting } from '@/lib/utils/reformed-holidays'
import { lookupNameMeaning } from '@/lib/data/name-meanings'
import { maiNapiIge } from '@/lib/dashboard/napi-ige'
import { olvasotervNapSorszam } from '@/lib/dashboard/napi-ige-types'
import { OLVASOTERV } from '@/lib/dashboard/biblia-olvasoterv'
import { formatReference, parseReference } from '@kartoteka/biblia'
import type { IgehelySzegmens } from '@kartoteka/biblia'

interface HeroBannerScriptureV2Props {
  fullName: string
  congregationName: string
  todayNamedays: string[]
}

// ---------------------------------------------------------------------------
// Károli-szöveg betöltése — ugyanaz a module-cache-elt fetch-minta, mint az
// igehely-field.tsx / konkordancia-dialog.tsx betöltője (a /bibles/karoli.json
// public asset; a böngésző HTTP-cache + SW-cache miatt a payload közös).
// ---------------------------------------------------------------------------

/** karoli.json alakja: könyvkód → fejezetek → versek szövege. */
type KaroliData = Record<string, string[][]>

let karoliPromise: Promise<KaroliData> | null = null

function loadKaroli(): Promise<KaroliData> {
  if (!karoliPromise) {
    karoliPromise = fetch('/bibles/karoli.json').then((res) => {
      if (!res.ok) throw new Error(`karoli.json betöltési hiba: HTTP ${res.status}`)
      return res.json() as Promise<KaroliData>
    })
    // Hiba esetén a következő próbálkozás újratölthesse
    void karoliPromise.catch(() => {
      karoliPromise = null
    })
  }
  return karoliPromise
}

/** A hivatkozott versek szövege egyben (max maxVerses vers, utána '…'). */
function collectVerseText(segments: IgehelySzegmens[], karoli: KaroliData, maxVerses = 4): string | null {
  const parts: string[] = []
  let truncated = false

  outer: for (const seg of segments) {
    const chapters = karoli[seg.book]
    if (!chapters) continue
    const sc = Math.max(1, Math.min(seg.startChapter ?? 1, chapters.length))
    const ec = Math.max(sc, Math.min(seg.endChapter ?? (seg.startChapter === null ? chapters.length : sc), chapters.length))
    for (let ch = sc; ch <= ec; ch++) {
      const chVerses = chapters[ch - 1] ?? []
      const from = ch === sc && seg.startVerse !== null ? Math.max(1, Math.min(seg.startVerse, chVerses.length)) : 1
      const to = ch === ec && seg.endVerse !== null ? Math.max(from, Math.min(seg.endVerse, chVerses.length)) : chVerses.length
      for (let v = from; v <= to; v++) {
        if (parts.length >= maxVerses) {
          truncated = true
          break outer
        }
        const t = chVerses[v - 1]
        if (t) parts.push(t)
      }
    }
  }

  if (parts.length === 0) return null
  return parts.join(' ') + (truncated ? ' …' : '')
}

// ---------------------------------------------------------------------------
// Nézet-állapotok
// ---------------------------------------------------------------------------

interface MaiIgeNezet {
  /** Kanonikus igehely ('Zsolt 46,2'). */
  hivatkozas: string
  /** A Károli-szöveg — null, ha a betöltés elhasalt (fail-closed: az üzenet így is megjelenik). */
  szoveg: string | null
  /** A napi bátorító üzenet — null tartalék-módban (nincs bejegyzés a naptárban). */
  uzenet: string | null
}

/** Tartalék, ha a naptárban nincs bejegyzés vagy bármi elhasal (a korábbi viselkedés). */
const TARTALEK_IGE: MaiIgeNezet = {
  hivatkozas: 'Péld 3,5',
  szoveg: 'Bízzál az Úrban teljes szíveddel, és ne a magad eszére támaszkodj!',
  uzenet: null,
}

type OlvasotervNezet =
  | { tipus: 'nap'; sorszam: number; olvasmanyok: string[]; szazalek: number }
  | { tipus: 'szokonap' }

function buildGondolatok(nezet: MaiIgeNezet | null) {
  if (!nezet || nezet.uzenet === null) {
    return [
      'Csendesedjünk el egy pillanatra, és hagyjuk, hogy a mai ige lassan megérkezzen a szívünkbe.',
      'Egyetlen mondat is elég lehet ahhoz, hogy a mai szolgálatnak új ritmust és békességet adjon.',
      'Imádság: Uram, tedd a mai igét világossá előttem, hogy örömmel és hűséggel járjak benne.',
    ]
  }
  return [
    `A gyülekezeti szolgálatban, a látogatásokban és az otthoni csendben is kapaszkodó lehet: ${nezet.hivatkozas}.`,
    'Imádság: Uram, formáld a mai napomat úgy, hogy ez az ige bennem is testet öltsön.',
  ]
}

export function HeroBannerScriptureV2({
  fullName,
  congregationName,
  todayNamedays,
}: HeroBannerScriptureV2Props) {
  const [verseExpanded, setVerseExpanded] = useState(false)
  // A Károli-versszöveg az egyetlen aszinkron adat — minden más szinkron,
  // statikus naptárból számolódik (useMemo, nem effect+setState: a React
  // Compiler lint a szinkron effect-setState-et kaszkád-render miatt tiltja).
  const [karoliSzoveg, setKaroliSzoveg] = useState<string | null>(null)

  const firstName = extractFirstName(fullName)
  const greetingResult = useMemo(() => getPersonalizedGreeting(firstName), [firstName])
  const greetingText = greetingResult.text
  const dateText = formatHuDateFull(new Date())

  // Névnap chip: a mai névnap-nevekhez jelentést is hozzárendelünk
  const namedaysWithMeaning = useMemo(() => {
    return todayNamedays.map((name) => ({
      name,
      meaning: lookupNameMeaning(name),
    }))
  }, [todayNamedays])

  // A mai naphoz kötött, szinkron adatok EGYSZER, felcsatoláskor számolódnak
  // (useState-inicializáló — a korábbi effect-alapú viselkedéssel azonos,
  // de sem effect-setState, sem megőrzendő kézi memoizáció nincs benne).
  // Fail-closed: hiányzó terv-nap → a blokk el sem jelenik meg; hiányzó vagy
  // hibás napi-ige bejegyzés → tartalék ige.
  const [napiAdatok] = useState<{
    terv: OlvasotervNezet | null
    igeAlap: { nezet: MaiIgeNezet; segments: IgehelySzegmens[] | null }
  }>(() => {
    const ma = new Date()

    const sorszam = olvasotervNapSorszam(ma)
    let terv: OlvasotervNezet | null
    if (sorszam === null) {
      terv = { tipus: 'szokonap' }
    } else {
      const nap = OLVASOTERV[sorszam - 1]
      terv =
        nap && nap.nap === sorszam && nap.olvasmanyok.length > 0
          ? { tipus: 'nap', sorszam, olvasmanyok: nap.olvasmanyok, szazalek: Math.round((sorszam / 365) * 100) }
          : null
    }

    const napi = maiNapiIge(ma)
    let igeAlap: { nezet: MaiIgeNezet; segments: IgehelySzegmens[] | null } = {
      nezet: TARTALEK_IGE,
      segments: null,
    }
    if (napi) {
      const parsed = parseReference(napi.ige)
      if (parsed.ok) {
        igeAlap = {
          nezet: { hivatkozas: formatReference(parsed.segments), szoveg: null, uzenet: napi.uzenet },
          segments: parsed.segments,
        }
      }
    }

    return { terv, igeAlap }
  })
  const terv = napiAdatok.terv
  const igeAlap = napiAdatok.igeAlap

  // A versszöveg aszinkron érkezik a helyi Károli-betöltőből; hibánál az
  // igehely + üzenet így is olvasható marad.
  useEffect(() => {
    if (!igeAlap.segments) return
    let active = true
    const segments = igeAlap.segments
    loadKaroli()
      .then((karoli) => {
        if (active) setKaroliSzoveg(collectVerseText(segments, karoli))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [igeAlap])

  const maiIge = useMemo<MaiIgeNezet>(
    () => (igeAlap.segments ? { ...igeAlap.nezet, szoveg: karoliSzoveg } : igeAlap.nezet),
    [igeAlap, karoliSzoveg],
  )
  const gondolatok = useMemo(() => buildGondolatok(maiIge), [maiIge])

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
          <p className="text-sm font-medium tracking-wide text-teal-50/82">{dateText || ' '}</p>
          <h1 className="font-heading text-3xl font-semibold drop-shadow-sm md:text-4xl">{greetingText || ' '}</h1>
          <p className="mt-2 max-w-2xl text-sm text-teal-50/72 md:text-base">
            Egy nyugodt, meleg hangulatú áttekintés a gyülekezeti élet fontos történéseiről és ritmusáról.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            {greetingResult.isHoliday && greetingResult.holidayName && (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-gradient-to-r from-amber-400/25 to-orange-400/20 px-3.5 py-1.5 text-sm font-medium text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                <Sparkles className="h-3.5 w-3.5 text-amber-200" />
                {greetingResult.holidayName}
              </span>
            )}
            {congregationName && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.1] px-3.5 py-1.5 text-sm text-teal-50">
                <MapPin className="h-3.5 w-3.5" />
                {congregationName}
              </span>
            )}
            {todayNamedays.length > 0 && (
              <span
                className="inline-flex items-center gap-2 rounded-full bg-white/[0.1] px-3.5 py-1.5 text-sm text-teal-50"
                title={namedaysWithMeaning
                  .filter((n) => n.meaning)
                  .map((n) => `${n.name}: ${n.meaning!.meaning} (${n.meaning!.origin})`)
                  .join('\n')}
              >
                <Flower2 className="h-3.5 w-3.5 text-pink-300" />
                Névnap: <strong className="text-white">{todayNamedays.join(', ')}</strong>
                {namedaysWithMeaning.some((n) => n.meaning) && (
                  <span className="ml-1 rounded-full bg-white/[0.15] px-1.5 py-0.5 text-[10px]">
                    ℹ️
                  </span>
                )}
              </span>
            )}
            {/* Ha van jelentés, külön sorban kiírjuk — szebb, mint a tooltip */}
            {namedaysWithMeaning.filter((n) => n.meaning).length > 0 && (
              <div className="w-full">
                <div className="mt-2 space-y-1 text-xs text-teal-50/80">
                  {namedaysWithMeaning
                    .filter((n) => n.meaning)
                    .map((n) => (
                      <div key={n.name} className="flex items-start gap-1.5">
                        <span className="mt-0.5 inline-block size-1 rounded-full bg-pink-300" />
                        <span>
                          <strong className="text-teal-50">{n.name}</strong>
                          <span className="text-teal-100/60"> ({n.meaning!.origin})</span> —{' '}
                          <em className="text-teal-50/90">{n.meaning!.meaning}</em>
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
            'group w-full rounded-[1.6rem] border border-white/12 bg-white/[0.08] px-4 py-3 text-left backdrop-blur-xl transition-all duration-300 hover:bg-white/[0.11] lg:max-w-[24rem]',
            verseExpanded && 'lg:max-w-[34rem]'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-amber-100/80">
                <BookOpen className="size-3.5" />
                Mai ige
              </div>

              {!maiIge ? (
                <div className="mt-3 animate-pulse space-y-2">
                  <div className="h-3 w-4/5 rounded-full bg-white/16" />
                  <div className="h-3 w-full rounded-full bg-white/16" />
                  <div className="h-3 w-2/3 rounded-full bg-white/16" />
                </div>
              ) : (
                <>
                  {maiIge.szoveg && (
                    <p className="mt-3 font-heading text-sm italic leading-relaxed text-white/92">
                      „{maiIge.szoveg}”
                    </p>
                  )}
                  <p className="mt-2 text-xs font-semibold text-amber-100/88">{maiIge.hivatkozas}</p>

                  {/* A NAPI ÜZENET — kiemelve, mindig látható */}
                  {maiIge.uzenet && (
                    <div className="mt-3 rounded-[1rem] border border-amber-200/25 bg-amber-300/[0.12] px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-amber-100/85">
                        <Sparkles className="size-3" />
                        Mai üzenet
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-amber-50/95">{maiIge.uzenet}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-white/70 transition group-hover:bg-white/16 group-hover:text-white">
              <ChevronDown className={cn('size-4 transition-transform duration-300', verseExpanded && 'rotate-180')} />
            </div>
          </div>

          {/* Bibliaolvasó terv — a kártyán belül, mindig látható */}
          {terv && (
            <div className="mt-3 rounded-[1rem] border border-white/10 bg-white/[0.05] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-teal-50/80">
                  <BookMarked className="size-3" />
                  Bibliaolvasó terv
                </div>
                {terv.tipus === 'nap' && (
                  <span className="text-[10px] font-semibold tabular-nums text-teal-50/70">
                    {terv.sorszam}/365. nap
                  </span>
                )}
              </div>

              {terv.tipus === 'szokonap' ? (
                <p className="mt-2 text-[13px] italic leading-relaxed text-teal-50/85">
                  Ráérő nap — ma utolérheted magad, vagy csendben elidőzhetsz a hét igéi felett.
                </p>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-teal-50/75">A mai adag:</span>
                    {terv.olvasmanyok.map((o) => (
                      <span
                        key={o}
                        className="inline-flex items-center rounded-full bg-white/[0.12] px-2.5 py-0.5 text-xs font-medium text-white/90"
                      >
                        {o}
                      </span>
                    ))}
                  </div>
                  {/* Finom folyamatjelző: az év hány %-ánál tart az olvasó */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.12]">
                      <div
                        className="h-full rounded-full bg-amber-300/80 transition-[width] duration-500"
                        style={{ width: `${terv.szazalek}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-teal-50/65">{terv.szazalek}%</span>
                  </div>
                </>
              )}
            </div>
          )}

          <div
            className={cn(
              'grid transition-all duration-300 ease-out',
              verseExpanded ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            )}
          >
            <div className="overflow-hidden">
              <div className="space-y-2 rounded-[1.2rem] border border-white/10 bg-black/10 px-3.5 py-3">
                {gondolatok.map((thought) => (
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
