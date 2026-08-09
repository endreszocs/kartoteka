'use client'

/**
 * Konkordancia dialógus (2026-08-09) — bibliai szó-keresés és igehely-lekérés
 * a szentiras.eu API-n keresztül (server action proxy, SZENTIRAS_API_KEY).
 *
 * Két mód:
 *   - Keresés: szó/szórészlet az egész Bibliában (fordításra + szövetségre szűkíthető);
 *   - Igehely: pontos hivatkozás lekérése (pl. Jn 3,16-21).
 * Az `onInsertRef` callbackkel a talált igehely egy kattintással textusként
 * beemelhető a tervbe. A szentiras.eu forrás-megjelölése kötelező — kiírjuk.
 */

import { useState } from 'react'
import { BookOpenText, Quote, Search } from 'lucide-react'
import { toast } from 'sonner'

import {
  getScripturePassage,
  searchScripture,
} from '@/app/(dashboard)/munkanaplo/konkordancia-actions'
import type { KonkordanciaHit } from '@/lib/worklog/igeterv-types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const TRANSLATIONS = [
  { value: 'RUF', label: 'RÚF 2014 (protestáns új fordítás)' },
  { value: 'KG', label: 'Károli Gáspár (revideált)' },
  { value: '', label: 'Minden fordítás' },
] as const

const BOOKS = [
  { value: '', label: 'Teljes Biblia' },
  { value: 'old_testament', label: 'Ószövetség' },
  { value: 'new_testament', label: 'Újszövetség' },
] as const

interface KonkordanciaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ha megadva: „Textusnak" gomb a találatokon — az igehelyet adja vissza. */
  onInsertRef?: (ref: string) => void
}

export function KonkordanciaDialog({ open, onOpenChange, onInsertRef }: KonkordanciaDialogProps) {
  const [mode, setMode] = useState<'kereses' | 'igehely'>('kereses')
  const [query, setQuery] = useState('')
  const [translation, setTranslation] = useState<string>('RUF')
  const [book, setBook] = useState<string>('')
  const [hits, setHits] = useState<KonkordanciaHit[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [needsKey, setNeedsKey] = useState(false)
  const [searched, setSearched] = useState(false)

  async function runSearch() {
    const q = query.trim()
    if (q.length < 2) {
      toast.error(mode === 'kereses' ? 'Írj be legalább 2 karaktert.' : 'Add meg az igehelyet (pl. Jn 3,16).')
      return
    }
    setLoading(true)
    setSearched(true)
    if (mode === 'kereses') {
      const res = await searchScripture(q, {
        translation: translation || null,
        book: book || null,
        limit: 50,
      })
      setLoading(false)
      if (res.needsKey) { setNeedsKey(true); return }
      if (res.error) { toast.error(res.error); return }
      setHits(res.hits || [])
      setTotalCount(res.totalCount ?? null)
    } else {
      const res = await getScripturePassage(q, translation || null)
      setLoading(false)
      if (res.needsKey) { setNeedsKey(true); return }
      if (res.error) { toast.error(res.error); setHits([]); return }
      setHits((res.verses || []).map((v) => ({ ref: v.ref, text: v.text, translation: translation || null })))
      setTotalCount(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpenText className="size-5 text-primary" /> Konkordancia — bibliai kereső
          </DialogTitle>
        </DialogHeader>

        {needsKey ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">A konkordanciához szentiras.eu API-kulcs szükséges.</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed">
              <li>Regisztrálj / jelentkezz be a <span className="font-medium">szentiras.eu</span> oldalon, és az „API kulcsaim" oldalon hozz létre egy ingyenes kulcsot.</li>
              <li>Add hozzá a kulcsot a szerver környezeti változóihoz: <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/50">SZENTIRAS_API_KEY=…</code></li>
              <li>Új deploy után a kereső magától életre kel.</li>
            </ol>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-border bg-muted/50 p-0.5">
                {(['kereses', 'igehely'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMode(m); setHits([]); setSearched(false) }}
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
              <select
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                aria-label="Fordítás"
              >
                {TRANSLATIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {mode === 'kereses' ? (
                <select
                  value={book}
                  onChange={(e) => setBook(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  aria-label="Szövetség"
                >
                  {BOOKS.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              ) : null}
            </div>

            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); void runSearch() }}
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === 'kereses' ? 'Keresendő szó (pl. kegyelem, pásztor…)' : 'Igehely (pl. Jn 3,16 vagy 1Kor 13,4-7)'}
                autoFocus
              />
              <Button type="submit" disabled={loading} className="shrink-0 rounded-xl">
                <Search className="mr-1.5 size-4" /> {loading ? 'Keresés…' : 'Keresés'}
              </Button>
            </form>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
              {loading ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Keresés a Szentírásban…</p>
              ) : hits.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {searched ? 'Nincs találat.' : 'A találatok itt jelennek meg.'}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {hits.map((h, i) => (
                    <li key={`${h.ref}-${i}`} className="flex items-start gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-primary">
                          {h.ref}
                          {h.translation ? <span className="ml-1.5 font-normal text-muted-foreground">({h.translation})</span> : null}
                        </p>
                        <p className="mt-0.5 text-sm leading-relaxed text-foreground">{h.text}</p>
                      </div>
                      {onInsertRef ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 rounded-lg px-2 text-xs"
                          onClick={() => onInsertRef(h.ref)}
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
                Összesen {totalCount} találat — az első {hits.length} látszik; szűkítsd a keresést.
              </p>
            ) : null}
          </>
        )}

        <p className="text-[11px] text-muted-foreground">
          Forrás: <a href="https://szentiras.eu" target="_blank" rel="noreferrer" className="underline">szentiras.eu</a> —
          a szövegekre a magyar szerzői jogi törvény szabályai vonatkoznak.
        </p>
      </DialogContent>
    </Dialog>
  )
}
