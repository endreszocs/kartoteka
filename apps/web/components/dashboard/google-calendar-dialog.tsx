'use client'

/**
 * Google Naptár összekötés — 2026-08-02 (PR-20).
 *
 * A gyülekezeti programok dobozából nyílik: megmutatja a gyülekezet titkos
 * naptár-hivatkozását (ICS-feed), amit a felhasználó a Google Naptárban
 * „URL alapján” egyszer felvesz — onnantól minden rögzített program és a
 * református ünnepek automatikusan megjelennek és frissülnek (Apple/Outlook
 * naptárral is működik). Nincs szükség Google-fiók összekötésre.
 */

import { useEffect, useState } from 'react'
import { CalendarPlus, Check, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { getCalendarFeedToken, getCalendarFeedReszletes, setCalendarFeedReszletes } from '@/app/(dashboard)/programs/actions'

interface GoogleCalendarDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GoogleCalendarDialog({ open, onOpenChange }: GoogleCalendarDialogProps) {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [includeHolidays, setIncludeHolidays] = useState(true)
  const [copied, setCopied] = useState(false)
  // 2026-08-26 (5. kör): a feed alapból MEGJEGYZÉS NÉLKÜL megy ki — a lelkészi
  // jegyzet lelkigondozói adatot hordozhat, a hivatkozás pedig Google/Apple
  // szerverére szinkronizálódik. A teljes tartalom tudatos opt-in.
  const [reszletes, setReszletes] = useState(false)
  const [reszletesElerheto, setReszletesElerheto] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // 2026-08-02 (review): MINDEN nyitáskor frissen kérjük — profil/gyülekezet-
    // váltás után a cache-elt token a MÁSIK gyülekezet titkos feedje lenne.
    // (A régi URL-t a betöltés alatt a !loading render-kapu rejti el; a
    // queueMicrotask a bevett minta a szinkron-setState lint-szabályra.)
    queueMicrotask(() => {
      if (cancelled) return
      setCopied(false)
      setLoading(true)
      getCalendarFeedToken()
        .then((res) => {
          if (cancelled) return
          setToken(res.token)
          setError(res.error ?? null)
        })
        .catch(() => { if (!cancelled) setError('A naptár-hivatkozás betöltése nem sikerült.') })
        .finally(() => { if (!cancelled) setLoading(false) })
      getCalendarFeedReszletes().then((res) => {
        if (cancelled) return
        setReszletes(res.reszletes)
        setReszletesElerheto(res.elerheto)
      })
    })
    return () => { cancelled = true }
  }, [open])

  const feedUrl = token && !loading
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://kartoteka.app'}/api/calendar/${token}${includeHolidays ? '' : '?unnepek=0'}`
    : null

  async function handleCopy() {
    if (!feedUrl) return
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      toast.success('Naptár-hivatkozás a vágólapon.')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('A másolás nem sikerült — jelöld ki és másold kézzel.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-[1.5rem] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white">
              <CalendarPlus className="size-4" />
            </span>
            Összekötés a Google Naptárral
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Az alábbi hivatkozást <strong>egyszer</strong> kell felvenned a Google
            Naptárban — onnantól minden itt rögzített program (és a református
            ünnepek) automatikusan megjelenik és frissül a naptáradban, szép
            részletekkel (időpont, helyszín, típus).
          </p>

          {loading && <p className="text-sm text-muted-foreground">Hivatkozás betöltése…</p>}

          {error && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
              {error}
            </div>
          )}

          {feedUrl && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="gcal-url" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Naptár-hivatkozás (tartsd bizalmasan)
                </Label>
                <div className="flex gap-2">
                  <input
                    id="gcal-url"
                    readOnly
                    value={feedUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-muted/40 px-3 font-mono text-xs"
                  />
                  <Button type="button" className="min-h-11 shrink-0 rounded-xl" onClick={() => void handleCopy()}>
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? 'Másolva' : 'Másolás'}
                  </Button>
                </div>
              </div>

              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeHolidays}
                  onChange={(e) => setIncludeHolidays(e.target.checked)}
                  className="size-4"
                />
                Református ünnepek is (húsvét, pünkösd, reformáció napja…)
              </label>

              {reszletesElerheto && (
                <label className="flex min-h-10 cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reszletes}
                    onChange={(e) => {
                      const next = e.target.checked
                      setReszletes(next)
                      void setCalendarFeedReszletes(next).then((res) => {
                        if (res?.error) {
                          toast.error(res.error)
                          setReszletes(!next)
                        }
                      })
                    }}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    A leírás és a megjegyzés is kerüljön a naptárba
                    <span className="block text-xs text-muted-foreground">
                      Alapból KIKAPCSOLVA: a hivatkozás a Google/Apple szerverére szinkronizál, a
                      lelkészi megjegyzés pedig érzékeny adatot is hordozhat (pl. temetésnél).
                    </span>
                  </span>
                </label>
              )}

              <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-sm leading-6 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
                <p className="font-semibold">Így veszed fel a Google Naptárban:</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[13px] leading-5">
                  <li>Nyisd meg a <strong>Google Naptárt</strong> számítógépen (calendar.google.com).</li>
                  <li>Bal oldalt az <strong>„Egyéb naptárak”</strong> melletti <strong>+</strong> jelre kattints.</li>
                  <li>Válaszd az <strong>„URL alapján”</strong> lehetőséget.</li>
                  <li>Illeszd be a fenti hivatkozást, majd <strong>„Naptár hozzáadása”</strong>.</li>
                </ol>
                <p className="mt-1.5 text-[12px] leading-5 text-sky-900/80 dark:text-sky-200/80">
                  A Google pár óránként automatikusan frissíti. A hivatkozás az Apple
                  Naptárban és az Outlookban is működik („naptár-előfizetés” néven).
                </p>
              </div>

              <a
                href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted/60"
              >
                <ExternalLink className="size-4" />
                Google Naptár „URL alapján” oldal megnyitása
              </a>
            </>
          )}

          <div className="flex justify-end border-t border-border/60 pt-3">
            <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => onOpenChange(false)}>
              Bezárás
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
