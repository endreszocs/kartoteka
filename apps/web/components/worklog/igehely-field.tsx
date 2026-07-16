'use client'

/**
 * IgehelyField — okos igehely-mező a munkanaplóhoz.
 *
 * Működés:
 *   - Gépelés közben azonnali parse (@kartoteka/biblia parseReference — kicsi,
 *     statikus import): érvényes hivatkozásnál kis pipa + a kanonikus alak
 *     (formatReference) halvány segédszövegben; érvénytelen/ismeretlen könyvnél
 *     diszkrét (muted) jelzés — gépelés közben nincs "piros ordítás".
 *   - Blur-kor az érvényes érték a kanonikus alakra normalizálódik (onChange az
 *     új értékkel), és csak utána hívódik az onBlur.
 *   - Igevers-előnézet: érvényes hivatkozásnál kis könyv-ikon; kattintásra (compact
 *     módban hoverre is) popover a Károli-szöveggel (max ~6 vers, utána '…').
 *     A 4,2 MB-os /bibles/karoli.json module-szintű cache-elt fetch-csel, először
 *     az előnézet megnyitásakor töltődik (töltés-jelzéssel).
 *   - Az ikon-kattintás nem vált ki idő előtti blur-mentést (mousedown-preventDefault),
 *     Escape zárja a popovert (és ilyenkor nem buborékozik tovább).
 *
 * compact=true: cella-mód (keret nélküli, kompakt padding, focus-ring);
 * compact=false/undefined: normál Input-kinézet (dialógusban is használható).
 */

import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Check, CircleAlert, LoaderCircle } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatReference, parseReference, validateReference } from '@kartoteka/biblia'
import type { IgehelySzegmens } from '@kartoteka/biblia'

// ---------------------------------------------------------------------------
// Károli-szöveg betöltése — module-szintű cache, csak igény szerint (4,2 MB!)
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
    // Hiba esetén a következő megnyitás újrapróbálhassa
    void karoliPromise.catch(() => {
      karoliPromise = null
    })
  }
  return karoliPromise
}

interface PreviewVers {
  /** Fejezet,vers címke, pl. '3,16'. */
  label: string
  text: string
}

/** Az előnézet verseinek kigyűjtése a szegmensekből (max maxVerses, utána '…'). */
function collectPreviewVerses(
  segments: IgehelySzegmens[],
  karoli: KaroliData,
  maxVerses = 6,
): { verses: PreviewVers[]; truncated: boolean } {
  const verses: PreviewVers[] = []
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
        if (verses.length >= maxVerses) {
          truncated = true
          break outer
        }
        verses.push({ label: `${ch},${v}`, text: chVerses[v - 1] ?? '' })
      }
    }
  }

  return { verses, truncated }
}

type PreviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; verses: PreviewVers[]; truncated: boolean }

/** Cella-mód: a közös Input keret nélküli, kompakt változata (tw-merge felülírásokkal). */
const COMPACT_INPUT_CLASSES =
  'h-8 rounded-md border-0 bg-transparent px-2 py-1 shadow-none dark:bg-transparent ' +
  'focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/40 dark:focus-visible:bg-background'

export interface IgehelyFieldProps {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  className?: string
  placeholder?: string
  /** true: cella-mód (keret nélküli, kompakt); false/undefined: normál Input-kinézet. */
  compact?: boolean
  id?: string
}

export function IgehelyField({
  value,
  onChange,
  onBlur,
  onKeyDown,
  className,
  placeholder,
  compact,
  id,
}: IgehelyFieldProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Azonnali parse + létezés-ellenőrzés gépelés közben (olcsó, szinkron)
  const parsed = useMemo(() => (value.trim() !== '' ? parseReference(value) : null), [value])
  const validation = useMemo(() => (parsed?.ok ? validateReference(parsed.segments) : null), [parsed])
  const isValid = !!(parsed?.ok && validation?.valid)
  const canonical = parsed?.ok ? formatReference(parsed.segments) : null
  const problem = parsed
    ? !parsed.ok
      ? parsed.error.message
      : validation && !validation.valid
        ? validation.problemak[0]
        : null
    : null

  // Előnézet betöltése megnyitáskor (module-cache-elt fetch + kigyűjtés)
  useEffect(() => {
    if (!previewOpen || !parsed?.ok) return
    const segments = parsed.segments
    let cancelled = false
    setPreview({ status: 'loading' })
    loadKaroli()
      .then((data) => {
        if (!cancelled) setPreview({ status: 'ready', ...collectPreviewVerses(segments, data) })
      })
      .catch(() => {
        if (!cancelled) setPreview({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [previewOpen, parsed])

  // Kattintás a mezőn/popoveren kívül → előnézet zárása
  useEffect(() => {
    if (!previewOpen) return
    function onDocMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPreviewOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [previewOpen])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    setPreviewOpen(false)
  }

  function handleBlur() {
    setPreviewOpen(false)
    // Érvényes hivatkozás → kanonikus alakra normalizálás, UTÁNA a blur-callback
    if (isValid && canonical !== null && canonical !== value) {
      onChange(canonical)
    }
    onBlur?.()
  }

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (previewOpen && e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setPreviewOpen(false)
      return
    }
    // A saját kezelés UTÁN a kapott handler
    onKeyDown?.(e)
  }

  // Compact módban az állapot a mező title-tooltipjében (nincs hely segédsorra)
  const tooltip = compact ? (isValid ? (canonical ?? undefined) : (problem ?? undefined)) : undefined

  const showInvalid = !compact ? false : value.trim() !== '' && !isValid

  return (
    <div
      ref={containerRef}
      className="relative"
      // Compact (hover-nyitású) módban a mezőt/popovert elhagyva zárunk
      onMouseLeave={compact ? () => setPreviewOpen(false) : undefined}
    >
      <Input
        id={id}
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Pl. Jn 3,16'}
        title={tooltip}
        autoComplete="off"
        spellCheck={false}
        className={cn(compact && COMPACT_INPUT_CLASSES, (isValid || showInvalid) && 'pr-8', className)}
      />

      {/* Igevers-előnézet gomb — csak érvényes hivatkozásnál */}
      {isValid && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Igevers előnézet (Károli)"
          title="Igevers előnézet (Károli)"
          // preventDefault: a kattintás NE vegye el a fókuszt az inputról → nincs korai blur-mentés
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setPreviewOpen((o) => !o)}
          onMouseEnter={compact ? () => setPreviewOpen(true) : undefined}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <BookOpen className="size-4" />
        </button>
      )}

      {/* Diszkrét hibajelzés compact módban (a részletek a title-tooltipben) */}
      {showInvalid && (
        <CircleAlert
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
        />
      )}

      {/* Segédsor normál módban: pipa + kanonikus alak, vagy diszkrét hibaszöveg */}
      {!compact && value.trim() !== '' && (
        <div className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
          {isValid ? (
            <>
              <Check aria-hidden className="mt-0.5 size-3 shrink-0 text-primary" />
              <span className="min-w-0 truncate">{canonical}</span>
            </>
          ) : (
            <span className="italic opacity-80">{problem}</span>
          )}
        </div>
      )}

      {/* Károli-előnézet popover */}
      {previewOpen && isValid && (
        <div
          // preventDefault: görgetés/kattintás a popoverben ne blur-ölje az inputot
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-full left-0 z-50 mt-1 w-[min(90vw,26rem)] rounded-lg border border-border bg-popover text-popover-foreground shadow-md"
        >
          <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            {canonical} · Károli
          </div>
          <div className="max-h-64 overflow-y-auto px-3 py-2 text-sm leading-relaxed">
            {preview?.status === 'loading' && (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
                Betöltés…
              </span>
            )}
            {preview?.status === 'error' && (
              <span className="text-muted-foreground">A bibliaszöveg nem tölthető be.</span>
            )}
            {preview?.status === 'ready' &&
              (preview.verses.length === 0 ? (
                <span className="text-muted-foreground">Nincs megjeleníthető vers.</span>
              ) : (
                <>
                  {preview.verses.map((v, i) => (
                    <p key={`${v.label}-${i}`} className="mb-1.5 last:mb-0">
                      <span className="mr-1 align-super text-[10px] font-medium text-muted-foreground">{v.label}</span>
                      {v.text}
                    </p>
                  ))}
                  {preview.truncated && <p className="mt-1 text-muted-foreground">…</p>}
                </>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
