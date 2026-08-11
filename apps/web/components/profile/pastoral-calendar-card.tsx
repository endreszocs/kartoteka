'use client'

/**
 * Lelkészi (privát) naptár — Profil oldali kártya (2026-08-11).
 *
 * A gyülekezeti (nyilvános) naptár-hivatkozás a Programok dobozból érhető el;
 * EZ a másik, SZEMÉLYES feed: a gyülekezet évfordulói (születésnap, névnap,
 * házassági és konfirmációi évforduló) egész napos eseményként, a lelkész
 * saját naptárában.
 *
 * Mobil-first: minden gomb legalább 44px magas, a hivatkozás-mező és a gombok
 * telefonon egymás alá kerülnek, sm-től egy sorba.
 */

import { useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CalendarHeart,
  Check,
  Copy,
  Link2Off,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  generatePastoralCalendarToken,
  getPastoralCalendarState,
  revokePastoralCalendarToken,
} from '@/app/(dashboard)/profile/lelkeszi-naptar-actions'
import type { PastoralCalendarState } from '@/app/(dashboard)/profile/lelkeszi-naptar-shared'

interface Toggle {
  key: 'szul' | 'nevnap' | 'hazassag' | 'konfirmacio'
  label: string
}

const TOGGLES: Toggle[] = [
  { key: 'szul', label: 'Születésnapok' },
  { key: 'nevnap', label: 'Névnapok' },
  { key: 'hazassag', label: 'Házassági évfordulók' },
  { key: 'konfirmacio', label: 'Konfirmációi évfordulók' },
]

function formatHu(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('hu-HU', { dateStyle: 'medium', timeStyle: 'short' })
}

export function PastoralCalendarCard() {
  const [state, setState] = useState<PastoralCalendarState | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [enabled, setEnabled] = useState<Record<Toggle['key'], boolean>>({
    szul: true,
    nevnap: true,
    hazassag: true,
    konfirmacio: true,
  })
  const [allConfirmations, setAllConfirmations] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getPastoralCalendarState()
      .then((s) => {
        if (!cancelled) setState(s)
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            token: null,
            createdAt: null,
            lastUsedAt: null,
            needsMigration: false,
            error: 'A lelkészi naptár állapotát nem sikerült betölteni.',
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://kartoteka.app'
  const params: string[] = []
  for (const t of TOGGLES) {
    if (!enabled[t.key]) params.push(`${t.key}=0`)
  }
  if (enabled.konfirmacio && allConfirmations) params.push('konfirmacio=mind')
  const feedUrl = state?.token
    ? `${origin}/api/calendar/lelkeszi/${state.token}${params.length > 0 ? `?${params.join('&')}` : ''}`
    : null

  async function handleCopy() {
    if (!feedUrl) return
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      toast.success('A lelkészi naptár hivatkozása a vágólapon.')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('A másolás nem sikerült — jelöld ki és másold kézzel.')
    }
  }

  function handleGenerate() {
    startTransition(async () => {
      const res = await generatePastoralCalendarToken()
      if (!res.ok || !res.state) {
        toast.error(res.error || 'A hivatkozás létrehozása nem sikerült.')
        if (res.error) setState((prev) => ({ ...(prev ?? { token: null, createdAt: null, lastUsedAt: null, needsMigration: false }), error: res.error }))
        return
      }
      setState(res.state)
      setCopied(false)
      toast.success('Új lelkészi naptár-hivatkozás készült. A korábbi mostantól érvénytelen.')
    })
  }

  function handleRevoke() {
    startTransition(async () => {
      const res = await revokePastoralCalendarToken()
      if (!res.ok) {
        toast.error(res.error || 'A visszavonás nem sikerült.')
        return
      }
      setState(res.state ?? { token: null, createdAt: null, lastUsedAt: null, needsMigration: false })
      setCopied(false)
      toast.success('A hivatkozás visszavonva — azonnal érvénytelen.')
    })
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          >
            <CalendarHeart className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Lelkészi naptár (személyes)</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              A gyülekezet évfordulói a saját naptáradban: születésnap, névnap, házassági és
              konfirmációi évforduló — egész napos emlékeztetőként. Ez a hivatkozás{' '}
              <strong>csak a tiéd</strong>, ne oszd meg senkivel.
            </p>
          </div>
        </div>

        {loading && (
          <p className="mt-4 text-sm text-muted-foreground">Betöltés…</p>
        )}

        {!loading && state?.error && (
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{state.error}</span>
          </div>
        )}

        {!loading && !state?.needsMigration && (
          <>
            {feedUrl ? (
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="lelkeszi-naptar-url"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Naptár-hivatkozás (bizalmas)
                  </Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="lelkeszi-naptar-url"
                      readOnly
                      value={feedUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label="A lelkészi naptár titkos hivatkozása"
                      className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-muted/40 px-3 font-mono text-xs text-foreground"
                    />
                    <Button
                      type="button"
                      className="min-h-11 shrink-0 rounded-xl"
                      onClick={() => void handleCopy()}
                      aria-label="A lelkészi naptár hivatkozásának másolása a vágólapra"
                    >
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {copied ? 'Másolva' : 'Másolás'}
                    </Button>
                  </div>
                </div>

                <fieldset className="rounded-xl border border-border/70 p-3">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Mi kerüljön bele
                  </legend>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {TOGGLES.map((t) => (
                      <label
                        key={t.key}
                        className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={enabled[t.key]}
                          onChange={(e) =>
                            setEnabled((prev) => ({ ...prev, [t.key]: e.target.checked }))
                          }
                          aria-label={`${t.label} megjelenítése a lelkészi naptárban`}
                          className="size-4 accent-[var(--primary)]"
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                  {enabled.konfirmacio && (
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={allConfirmations}
                        onChange={(e) => setAllConfirmations(e.target.checked)}
                        aria-label="Minden konfirmációi évforduló, ne csak a kerek évfordulók"
                        className="size-4 accent-[var(--primary)]"
                      />
                      Minden konfirmációi évforduló (alapból csak a kerek: 5., 10., 25.…)
                    </label>
                  )}
                </fieldset>

                <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-[13px] leading-6 text-muted-foreground">
                  <p className="font-semibold text-foreground">Így veszed fel a naptáradba:</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                    <li>Google Naptár → „Egyéb naptárak" melletti <strong>+</strong> → <strong>„URL alapján"</strong>.</li>
                    <li>Illeszd be a fenti hivatkozást, majd <strong>„Naptár hozzáadása"</strong>.</li>
                  </ol>
                  <p className="mt-1.5">
                    Készült: {formatHu(state?.createdAt ?? null)} · Utoljára lekérve:{' '}
                    {state?.lastUsedAt ? formatHu(state.lastUsedAt) : 'még nem'}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={handleGenerate}
                    className="min-h-11 rounded-xl"
                    aria-label="Új lelkészi naptár-hivatkozás készítése, a régi érvénytelenítésével"
                  >
                    <RefreshCw className="size-4" />
                    Új hivatkozás
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={handleRevoke}
                    className="min-h-11 rounded-xl text-destructive hover:text-destructive"
                    aria-label="A lelkészi naptár hivatkozásának visszavonása"
                  >
                    <Link2Off className="size-4" />
                    Visszavonás
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={handleGenerate}
                  className="min-h-11 w-full rounded-xl sm:w-auto"
                  aria-label="Lelkészi naptár-hivatkozás létrehozása"
                >
                  <CalendarHeart className="size-4" />
                  Hivatkozás létrehozása
                </Button>
              </div>
            )}

            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                A naptárba csak a NÉV és az évforduló sorszáma kerül ki. Cím, telefonszám,
                születési dátum, járulék-adat és gyászévforduló <strong>soha</strong>. Ha a
                telefonod elveszne, a „Visszavonás" gombbal a hivatkozás azonnal érvénytelen.
              </span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
