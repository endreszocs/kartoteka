'use client'

/**
 * Konkordancia dialógus (2026-08-09) — NATÍV bibliai kereső, API-kulcs nélkül.
 *
 * A repóban lévő teljes Károli-szövegre épül (public/bibles/karoli.json,
 * 1908-as revízió — közkincs; ugyanazt a fájlt használja, mint az
 * igehely-előnézet). A 4,2 MB-os korpusz IGÉNY SZERINT töltődik
 * (module-cache), az első kereséskor ékezet-független index épül (~31k vers).
 *
 * Két mód:
 *   - Szó-keresés: szó/szórészlet a teljes Bibliában (szövetségre/könyvre szűkíthető);
 *   - Igehely: pontos hivatkozás kigyűjtése (@kartoteka/biblia parser).
 * Az `onInsertRef` callbackkel a találat textusként beemelhető a tervbe.
 */

import { useEffect, useMemo, useState } from 'react'
import { BookOpenText, Quote, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { KONYVEK, getBook, parseReference, formatReference } from '@kartoteka/biblia'

// ---------------------------------------------------------------------------
// Károli-korpusz + kereső-index — module-szintű cache (4,2 MB, igény szerint)
// ---------------------------------------------------------------------------

/** karoli.json alakja: könyvkód → fejezetek → versek szövege. */
type KaroliData = Record<string, string[][]>

interface IndexedVerse {
  code: string
  chapter: number
  verse: number
  text: string
  textNorm: string
}

let karoliPromise: Promise<KaroliData> | null = null
let verseIndex: IndexedVerse[] | null = null

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function loadKaroli(): Promise<KaroliData> {
  if (!karoliPromise) {
    karoliPromise = fetch('/bibles/karoli.json').then((res) => {
      if (!res.ok) throw new Error(`karoli.json betöltési hiba: HTTP ${res.status}`)
      return res.json() as Promise<KaroliData>
    })
    // Hiba esetén a következő megnyitás újrapróbálhassa
    void karoliPromise.catch(() => {
      karoliPromise = null
    })
  }
  return karoliPromise
}

/** A kereső-index a KÖNYVEK kanonikus sorrendjében épül (Ó→Új). */
function buildIndex(karoli: KaroliData): IndexedVerse[] {
  if (verseIndex) return verseIndex
  const idx: IndexedVerse[] = []
  for (const book of KONYVEK) {
    const chapters = karoli[book.code]
    if (!chapters) continue
    for (let ch = 0; ch < chapters.length; ch++) {
      const verses = chapters[ch] ?? []
      for (let v = 0; v < verses.length; v++) {
        const text = verses[v] ?? ''
        if (!text) continue
        idx.push({ code: book.code, chapter: ch + 1, verse: v + 1, text, textNorm: normalize(text) })
      }
    }
  }
  verseIndex = idx
  return idx
}

/** Az Újszövetség első könyvének indexe a kanonikus sorrendben (Máté). */
const NT_START = KONYVEK.findIndex((k) => k.code === 'MAT')
const BOOK_ORDER = new Map(KONYVEK.map((k, i) => [k.code, i]))

function refLabel(code: string, chapter: number, verse: number): string {
  const abbrev = getBook(code)?.abbrev ?? code
  return `${abbrev} ${chapter},${verse}`
}

interface Hit {
  ref: string
  text: string
}

const TESTAMENTS = [
  { value: '', label: 'Teljes Biblia' },
  { value: 'ot', label: 'Ószövetség' },
  { value: 'nt', label: 'Újszövetség' },
] as const

const MAX_HITS = 100

interface KonkordanciaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ha megadva: „Textusnak" gomb a találatokon — az igehelyet adja vissza. */
  onInsertRef?: (ref: string) => void
}

export function KonkordanciaDialog({ open, onOpenChange, onInsertRef }: KonkordanciaDialogProps) {
  const [mode, setMode] = useState<'kereses' | 'igehely'>('kereses')
  const [query, setQuery] = useState('')
  const [testament, setTestament] = useState<string>('')
  const [bookCode, setBookCode] = useState<string>('')
  const [corpusReady, setCorpusReady] = useState(verseIndex !== null)
  const [corpusError, setCorpusError] = useState(false)
  const [hits, setHits] = useState<Hit[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [searched, setSearched] = useState(false)

  // A korpusz a dialógus megnyitásakor töltődik (module-cache — csak egyszer).
  useEffect(() => {
    if (!open || corpusReady) return
    let cancelled = false
    setCorpusError(false)
    loadKaroli()
      .then((data) => {
        buildIndex(data)
        if (!cancelled) setCorpusReady(true)
      })
      .catch(() => {
        if (!cancelled) setCorpusError(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, corpusReady])

  const bookOptions = useMemo(() => {
    if (testament === 'ot') return KONYVEK.slice(0, NT_START)
    if (testament === 'nt') return KONYVEK.slice(NT_START)
    return KONYVEK
  }, [testament])

  function runSearch() {
    const q = query.trim()
    if (q.length < 2) {
      toast.error(mode === 'kereses' ? 'Írj be legalább 2 karaktert.' : 'Add meg az igehelyet (pl. Jn 3,16).')
      return
    }
    if (!verseIndex) return
    setSearched(true)

    if (mode === 'kereses') {
      const qNorm = normalize(q)
      const found: Hit[] = []
      let total = 0
      for (const row of verseIndex) {
        const order = BOOK_ORDER.get(row.code) ?? 0
        if (testament === 'ot' && order >= NT_START) continue
        if (testament === 'nt' && order < NT_START) continue
        if (bookCode && row.code !== bookCode) continue
        if (!row.textNorm.includes(qNorm)) continue
        total += 1
        if (found.length < MAX_HITS) {
          found.push({ ref: refLabel(row.code, row.chapter, row.verse), text: row.text })
        }
      }
      setHits(found)
      setTotalCount(total)
      return
    }

    // Igehely-mód: hivatkozás → versek kigyűjtése a korpuszból.
    const parsed = parseReference(q)
    if (!parsed.ok) {
      toast.error('Nem sikerült értelmezni az igehelyet — próbáld pl. így: Jn 3,16 vagy 1Kor 13,4-7.')
      setHits([])
      setTotalCount(null)
      return
    }
    const byRef = new Map<string, IndexedVerse>()
    for (const row of verseIndex) byRef.set(`${row.code}_${row.chapter}_${row.verse}`, row)
    const collected: Hit[] = []
    for (const seg of parsed.segments) {
      // Egyetlen vers (pl. Jn 3,16): nincs vég-jelölés → csak a kezdővers.
      const singleVerse = seg.startVerse !== null && seg.endVerse === null && seg.endChapter === null
      const sc = seg.startChapter ?? 1
      const ec = singleVerse ? sc : seg.endChapter ?? (seg.startChapter === null ? 999 : sc)
      for (let ch = sc; ch <= ec && collected.length < 40; ch++) {
        const fromV = ch === sc && seg.startVerse !== null ? seg.startVerse : 1
        let sawAny = false
        for (let v = fromV; collected.length < 40; v++) {
          if (ch === ec && seg.endVerse !== null && v > seg.endVerse) break
          const row = byRef.get(`${seg.book}_${ch}_${v}`)
          if (!row) break
          sawAny = true
          collected.push({ ref: refLabel(row.code, row.chapter, row.verse), text: row.text })
          if (singleVerse) break
        }
        if (singleVerse) break
        // A könyv végén túl (nem létező fejezet) nincs értelme tovább lépni.
        if (!sawAny && fromV === 1) break
      }
    }
    if (collected.length === 0) {
      toast.error('Nem található ilyen igehely a Károli-szövegben.')
    }
    setHits(collected)
    setTotalCount(null)
  }

  const canonicalRefOf = (fallback: string): string => {
    // A „Textusnak" gombhoz igehely-módban a beírt hivatkozás kanonikus alakját adjuk.
    if (mode === 'igehely') {
      const parsed = parseReference(query.trim())
      if (parsed.ok) return formatReference(parsed.segments)
    }
    return fallback
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpenText className="size-5 text-primary" /> Konkordancia — bibliai kereső
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-border bg-muted/50 p-0.5">
            {(['kereses', 'igehely'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setHits([]); setTotalCount(null); setSearched(false) }}
                aria-pressed={mode === m}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium transition',
                  mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'kereses' ? <Search className="size-3.5" /> : <Quote className="size-3.5" />}
                {m === 'kereses' ? 'Szó-keresés' : 'Igehely'}
              </button>
            ))}
          </div>
          {mode === 'kereses' ? (
            <>
              <select
                value={testament}
                onChange={(e) => { setTestament(e.target.value); setBookCode('') }}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                aria-label="Szövetség"
              >
                {TESTAMENTS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <select
                value={bookCode}
                onChange={(e) => setBookCode(e.target.value)}
                className="max-w-[180px] rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                aria-label="Könyv"
              >
                <option value="">Minden könyv</option>
                {bookOptions.map((b) => (
                  <option key={b.code} value={b.code}>{b.abbrev} — {b.canonical}</option>
                ))}
              </select>
            </>
          ) : null}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); runSearch() }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'kereses' ? 'Keresendő szó (pl. kegyelem, pásztor…)' : 'Igehely (pl. Jn 3,16 vagy 1Kor 13,4-7)'}
            autoFocus
          />
          <Button type="submit" disabled={!corpusReady} className="shrink-0 rounded-xl">
            <Search className="mr-1.5 size-4" /> Keresés
          </Button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
          {corpusError ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              A bibliai szöveg betöltése nem sikerült — ellenőrizd a kapcsolatot, és nyisd meg újra.
            </p>
          ) : !corpusReady ? (
            <p className="p-6 text-center text-sm text-muted-foreground">A Károli-szöveg betöltése… (első alkalommal pár másodperc)</p>
          ) : hits.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {searched ? 'Nincs találat.' : 'A találatok itt jelennek meg — a kereső a gépeden fut, internetkapcsolat nélkül is.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {hits.map((h, i) => (
                <li key={`${h.ref}-${i}`} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-primary">{h.ref}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-foreground">{h.text}</p>
                  </div>
                  {onInsertRef ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 rounded-lg px-2 text-xs"
                      onClick={() => onInsertRef(canonicalRefOf(h.ref))}
                      title="Beállítás textusként a tervben"
                    >
                      <Quote className="mr-1 size-3.5" /> Textusnak
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        {totalCount != null && totalCount > hits.length ? (
          <p className="text-[11px] text-muted-foreground">
            Összesen {totalCount} találat — az első {hits.length} látszik; szűkítsd a keresést (szövetség/könyv).
          </p>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Forrás: Károli Gáspár fordítása (1908-as revízió — közkincs), beépítve. A kereső
          ékezet-független, és teljesen helyben fut.
        </p>
      </DialogContent>
    </Dialog>
  )
}
