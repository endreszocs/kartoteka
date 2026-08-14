'use client'

/**
 * Konkordancia dialógus (2026-08-09) — NATÍV bibliai kereső, API-kulcs nélkül.
 *
 * A repóban lévő teljes Károli-szövegre épül (public/bibles/karoli.json,
 * 1908-as revízió — közkincs; ugyanazt a fájlt használja, mint az
 * igehely-előnézet). A 4,2 MB-os korpusz IGÉNY SZERINT töltődik
 * (module-cache), az első megnyitáskor ékezet-független index épül (~31k vers).
 *
 * 2026-08-11 (5. kör, P2-#20): az index-építés DARABOLT és aszinkron
 * (fejezetenként egy normalize(), ~1500 versenként visszaadott vezérlés), a
 * hivatkozás→vers térkép egyszer épül, és versenként EGY szövegpéldányt
 * tartunk. Korábban a dialógus megnyitása másodpercekre lefagyasztotta a
 * telefont, és minden igehely-keresés újrafagyott.
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

/**
 * Egy indexelt vers.
 *
 * 2026-08-11 (5. kör, P2-#20): a sor MÁR NEM tárolja a vers megjelenítendő
 * szövegét, csak a kereséshez használt ékezet-független (normalizált) alakot.
 * Korábban `text` + `textNorm` KÉT teljes példányt jelentett versenként (~31 100
 * vers, ~4 MB szöveg), a korpusz mellett, amit amúgy is memóriában tartunk.
 * A megjelenítendő szöveget most a korpuszból olvassuk ki (`verseText`).
 */
interface IndexedVerse {
  code: string
  chapter: number
  verse: number
  norm: string
}

let karoliPromise: Promise<KaroliData> | null = null
/** A betöltött korpusz — ebből származik a TALÁLATOK megjelenítendő szövege. */
let karoliCache: KaroliData | null = null
let verseIndex: IndexedVerse[] | null = null
/**
 * 2026-08-11 (5. kör, P2-#20): a hivatkozás→vers térkép EGYSZER épül, az
 * indexszel együtt. Korábban MINDEN igehely-keresés újraépítette (31 ezer
 * sablon-string + 31 ezer Map-beszúrás keresésenként), ami a telefonon
 * minden egyes lekérdezésnél újabb fagyást okozott.
 */
let verseByRef: Map<string, IndexedVerse> | null = null
/** Az éppen futó index-építés — a párhuzamos megnyitások ne indítsanak újat. */
let indexPromise: Promise<void> | null = null

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function refKey(code: string, chapter: number, verse: number): string {
  return `${code}_${chapter}_${verse}`
}

/** A vers megjelenítendő (eredeti) szövege a korpuszból. */
function verseText(row: IndexedVerse): string {
  return karoliCache?.[row.code]?.[row.chapter - 1]?.[row.verse - 1] ?? ''
}

function loadKaroli(): Promise<KaroliData> {
  if (!karoliPromise) {
    karoliPromise = fetch('/bibles/karoli.json')
      .then((res) => {
        if (!res.ok) throw new Error(`karoli.json betöltési hiba: HTTP ${res.status}`)
        return res.json() as Promise<KaroliData>
      })
      .then((data) => {
        karoliCache = data
        return data
      })
    // Hiba esetén a következő megnyitás újrapróbálhassa
    void karoliPromise.catch(() => {
      karoliPromise = null
    })
  }
  return karoliPromise
}

/**
 * Versek elválasztója a FEJEZET-szintű normalizáláshoz. Sortörés: a Károli
 * versszövegekben nem fordul elő, és sem az NFD-bontás, sem a kisbetűsítés,
 * sem a kombináló-jel szűrő nem érinti — így a darabolás vers-hű marad.
 */
const VERSE_SEP = '\n'
/** Ennyi vers után visszaadjuk a vezérlést a böngészőnek (festés/érintés). */
const YIELD_EVERY = 1500

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * A kereső-index a KÖNYVEK kanonikus sorrendjében épül (Ó→Új).
 *
 * 2026-08-11 (5. kör, P2-#20) — HÁROM javítás egy helyen:
 *   1. ASZINKRON, darabolt építés: ~1500 versenként visszaadjuk a vezérlést,
 *      így a dialógus betöltés-jelzője TÉNYLEG megjelenik és mozog. Korábban
 *      az egész (~31 100 verses) menet egy blokkban futott a fő szálon —
 *      közepes Androidon több másodpercig fagyott az egész alkalmazás, épp
 *      amikor a lelkész az igehirdetést tervezi.
 *   2. FEJEZETENKÉNT egyetlen normalize(): versenként hívva ~31 100 NFD-menet
 *      indult; fejezetenként (~1189 menet) ugyanaz az eredmény, töredék idő
 *      alatt. Az eredmény vers-hűségét a darabszám-ellenőrzés őrzi.
 *   3. A hivatkozás→vers térkép (`verseByRef`) itt épül, egyszer.
 *
 * A keresés VISELKEDÉSE változatlan: ugyanaz a `normalize()` fut (NFD →
 * kombináló jelek törlése → kisbetű), tehát az ékezet-független találatok
 * pontosan ugyanazok maradnak.
 */
function ensureIndex(karoli: KaroliData, onProgress?: (ratio: number) => void): Promise<void> {
  if (verseIndex && verseByRef) {
    onProgress?.(1)
    return Promise.resolve()
  }
  if (indexPromise) return indexPromise

  indexPromise = (async () => {
    const idx: IndexedVerse[] = []
    const byRef = new Map<string, IndexedVerse>()
    let sinceYield = 0
    for (let b = 0; b < KONYVEK.length; b++) {
      const book = KONYVEK[b]
      const chapters = karoli[book.code]
      if (!chapters) continue
      for (let ch = 0; ch < chapters.length; ch++) {
        const verses = chapters[ch] ?? []
        if (verses.length === 0) continue
        let normVerses = normalize(verses.join(VERSE_SEP)).split(VERSE_SEP)
        if (normVerses.length !== verses.length) {
          // Biztonsági tartalék: ha egy vers maga is sortörést tartalmazna, a
          // fejezet-szintű darabolás elcsúszna — ilyenkor versenként normalizálunk.
          normVerses = verses.map((t) => normalize(t ?? ''))
        }
        for (let v = 0; v < verses.length; v++) {
          if (!verses[v]) continue
          const row: IndexedVerse = {
            code: book.code,
            chapter: ch + 1,
            verse: v + 1,
            norm: normVerses[v] ?? '',
          }
          idx.push(row)
          byRef.set(refKey(row.code, row.chapter, row.verse), row)
        }
        sinceYield += verses.length
        if (sinceYield >= YIELD_EVERY) {
          sinceYield = 0
          await yieldToBrowser()
        }
      }
      onProgress?.((b + 1) / KONYVEK.length)
    }
    verseIndex = idx
    verseByRef = byRef
    onProgress?.(1)
  })()

  // Hiba esetén a következő megnyitás újrapróbálhassa (a hívó a hibát megkapja).
  void indexPromise.catch(() => {
    indexPromise = null
  })
  return indexPromise
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
  const [corpusReady, setCorpusReady] = useState(verseIndex !== null && verseByRef !== null)
  const [corpusError, setCorpusError] = useState(false)
  /** 0–1: az index-építés előrehaladása (2026-08-11, P2-#20). */
  const [corpusProgress, setCorpusProgress] = useState(0)
  const [hits, setHits] = useState<Hit[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [searched, setSearched] = useState(false)

  // A korpusz a dialógus megnyitásakor töltődik (module-cache — csak egyszer).
  // 2026-08-11 (P2-#20): az indexelés darabolt és aszinkron, ezért a lenti
  // folyamatjelző valóban kirajzolódik és mozog — a dialógus nem „fagy le".
  // Az effect CSAK a külső rendszerrel (fetch + indexelés) szinkronizál: a
  // törzsében nincs setState, az állapotot a visszahívások állítják.
  useEffect(() => {
    if (!open || corpusReady || corpusError) return
    let cancelled = false
    loadKaroli()
      .then((data) =>
        ensureIndex(data, (ratio) => {
          if (!cancelled) setCorpusProgress(ratio)
        }),
      )
      .then(() => {
        if (!cancelled) setCorpusReady(true)
      })
      .catch(() => {
        if (!cancelled) setCorpusError(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, corpusReady, corpusError])

  /** Újrapróbálkozás betöltési hiba után (a korábbi automatikus retry helyett). */
  function retryCorpus() {
    setCorpusProgress(0)
    setCorpusError(false)
  }

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
    if (!verseIndex || !verseByRef) return
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
        if (!row.norm.includes(qNorm)) continue
        total += 1
        if (found.length < MAX_HITS) {
          found.push({ ref: refLabel(row.code, row.chapter, row.verse), text: verseText(row) })
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
    // 2026-08-11 (P2-#20): a térkép az indexszel EGYÜTT épült — keresésenként
    // nem építjük újra (korábban 31 ezer beszúrás futott minden lekérdezésnél).
    const byRef = verseByRef
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
          const row = byRef.get(refKey(seg.book, ch, v))
          if (!row) break
          sawAny = true
          collected.push({ ref: refLabel(row.code, row.chapter, row.verse), text: verseText(row) })
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
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-3xl">
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
            <div className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                A bibliai szöveg betöltése nem sikerült — ellenőrizd az internetkapcsolatot, majd
                próbáld újra.
              </p>
              <Button type="button" variant="outline" className="mt-3 rounded-xl" onClick={retryCorpus}>
                Újrapróbálom
              </Button>
            </div>
          ) : !corpusReady ? (
            /* 2026-08-11 (P2-#20): valódi folyamatjelző — az indexelés darabolt,
               ezért ez a sáv tényleg mozog, nem egy lefagyott képernyő. */
            <div className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                A Károli-szöveg előkészítése… {Math.round(corpusProgress * 100)}%
              </p>
              <div
                className="mx-auto mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-muted sm:w-56"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(corpusProgress * 100)}
                aria-label="A bibliai szöveg előkészítése"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.max(4, Math.round(corpusProgress * 100))}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Csak az első megnyitáskor tart pár másodpercig — utána azonnal keres.
              </p>
            </div>
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
