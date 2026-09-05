'use client'

/**
 * BESZÉLGETÉS-LISTA — A BAL OSZLOP (2026-09-05, D4).
 *
 * Feladónként EGY sor: avatar (típusszín), név, az utolsó üzenet kivonata
 * (markdown-jelek nélkül), relatív idő, olvasatlan-pirula. Rendezés a
 * legutóbbi üzenet szerint (a `csoportositBeszelgetesek` már így adja).
 * Fent: kereső + a három szűrő (Mind / Olvasatlan / Archívum).
 *
 * `role="listbox"` / `aria-selected`: a képernyőolvasó tudja, melyik szál
 * van nyitva. Minden sor legalább 56 px (44 px érintő-minimum fölött).
 */

import { CheckCheck, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { SZAL_SZUROK, sorKivonata, type Beszelgetes, type SzalSzuro } from '@/lib/notifications/beszelgetesek'
import { cn } from '@/lib/utils'

import { relativHuIdo } from './ertesites-vizualis'
import { FeladoAvatar } from './felado-avatar'

export function BeszelgetesLista({
  beszelgetesek,
  aktivKulcs,
  szuro,
  kereses,
  osszOlvasatlan,
  fut,
  onValaszt,
  onSzuro,
  onKereses,
  onMindOlvasott,
  className,
}: {
  beszelgetesek: Beszelgetes[]
  aktivKulcs: string | null
  szuro: SzalSzuro
  kereses: string
  osszOlvasatlan: number
  fut: boolean
  onValaszt: (kulcs: string) => void
  onSzuro: (szuro: SzalSzuro) => void
  onKereses: (q: string) => void
  onMindOlvasott: () => void
  className?: string
}) {
  return (
    <section className={cn('card-raised flex min-h-0 flex-col overflow-hidden', className)} aria-label="Beszélgetések">
      {/* ── Kereső + szűrők ── */}
      <div className="shrink-0 space-y-2 border-b border-border/70 px-3 pb-2.5 pt-3">
        <label className="relative block">
          <span className="sr-only">Keresés a feladók és üzenetek között</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={kereses}
            onChange={(e) => onKereses(e.currentTarget.value)}
            placeholder="Keresés…"
            className="h-11 rounded-xl bg-background pl-9"
            autoComplete="off"
          />
        </label>

        <div role="tablist" aria-label="Üzenet-szűrők" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {SZAL_SZUROK.map((sz) => {
            const aktiv = szuro === sz.id
            return (
              <button
                key={sz.id}
                type="button"
                role="tab"
                aria-selected={aktiv}
                title={sz.leiras}
                onClick={() => onSzuro(sz.id)}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  aktiv
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-secondary/60',
                )}
              >
                {sz.cimke}
                {sz.id === 'olvasatlan' && osszOlvasatlan > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                    {osszOlvasatlan}
                  </span>
                ) : null}
              </button>
            )
          })}
          {osszOlvasatlan > 0 && szuro !== 'archivalt' ? (
            <button
              type="button"
              disabled={fut}
              onClick={onMindOlvasott}
              title="Minden üzenet olvasottnak jelölése"
              aria-label="Minden üzenet olvasottnak jelölése"
              className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60 dark:text-foreground"
            >
              <CheckCheck className="size-4" aria-hidden />
              Mind
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Lista ── */}
      {beszelgetesek.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {kereses.trim() ? 'Nincs találat erre a keresésre.' : szuro === 'archivalt' ? 'Az archívum üres.' : 'Nincs üzenet ebben a nézetben.'}
        </p>
      ) : (
        <ul role="listbox" aria-label="Feladók" className="flex-1 overflow-y-auto overscroll-contain p-1.5">
          {beszelgetesek.map((b) => {
            const aktiv = b.kulcs === aktivKulcs
            return (
              <li key={b.kulcs} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={aktiv}
                  onClick={() => onValaszt(b.kulcs)}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    aktiv
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-transparent hover:border-border hover:bg-secondary/60',
                  )}
                >
                  <FeladoAvatar felado={b.felado} meret="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm leading-snug text-foreground',
                          b.olvasatlan > 0 ? 'font-bold' : 'font-semibold',
                        )}
                      >
                        {b.felado.nev}
                      </span>
                      <time
                        dateTime={b.utolso.createdAt}
                        className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                      >
                        {relativHuIdo(b.utolso.createdAt)}
                      </time>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-xs leading-snug',
                          b.olvasatlan > 0 ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {b.utolso.cim}
                        {sorKivonata(b.utolso) ? ` — ${sorKivonata(b.utolso)}` : ''}
                      </span>
                      {b.olvasatlan > 0 ? (
                        <span
                          aria-label={`${b.olvasatlan} olvasatlan`}
                          className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 text-primary-foreground"
                        >
                          {b.olvasatlan > 99 ? '99+' : b.olvasatlan}
                        </span>
                      ) : b.valaszraVar > 0 ? (
                        <span className="shrink-0 rounded-full bg-amber-500/14 px-1.5 text-[10px] font-semibold leading-5 text-amber-700 dark:text-amber-300">
                          válaszra vár
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
