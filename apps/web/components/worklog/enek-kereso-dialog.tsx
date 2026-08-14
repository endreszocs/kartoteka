'use client'

/**
 * Énekkereső dialógus (2026-08-09) — teljes szövegű keresés az Erdélyi
 * Református Énekeskönyvben (@kartoteka/enekeskonyv, 513 ének / 2697 versszak).
 *
 * A korpusz (~608 KB) IGÉNY SZERINT töltődik (modul-szintű cache, az
 * enekek-field.tsx bevált mintája). A találatoknál az egyező versszak is
 * látszik kiemelten; az `onInsert` callbackkel az ének egy kattintással a
 * tervbe emelhető.
 */

import { useEffect, useMemo, useState } from 'react'
import { Music, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type EnekeskonyvModule = typeof import('@kartoteka/enekeskonyv')

let cachedModule: EnekeskonyvModule | null = null
let cachedPromise: Promise<EnekeskonyvModule> | null = null

function loadEnekeskonyv(): Promise<EnekeskonyvModule> {
  if (cachedModule) return Promise.resolve(cachedModule)
  if (!cachedPromise) {
    cachedPromise = import('@kartoteka/enekeskonyv').then(
      (m) => {
        cachedModule = m
        return m
      },
      (err) => {
        // Átmeneti hálózati hiba NE ragadjon be örökre — a következő megnyitás újra próbál.
        cachedPromise = null
        throw err
      },
    )
  }
  return cachedPromise
}

interface EnekTalalat {
  azonosito: string
  szam: number
  cim: string | null
  elsoSor: string
  szakasz: string
  /** Az egyező versszak (ha szöveg-találat) — a sorszámával. */
  versszakIndex: number | null
  versszak: string | null
}

interface EnekKeresoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ha megadva: „Tervbe" gomb a találatokon — az ének-azonosítót adja vissza. */
  onInsert?: (azonosito: string) => void
}

export function EnekKeresoDialog({ open, onOpenChange, onInsert }: EnekKeresoDialogProps) {
  const [libReady, setLibReady] = useState(cachedModule !== null)
  const [query, setQuery] = useState('')
  const [openedEnek, setOpenedEnek] = useState<string | null>(null)

  useEffect(() => {
    if (!open || libReady) return
    let cancelled = false
    loadEnekeskonyv()
      .then(() => {
        if (!cancelled) setLibReady(true)
      })
      .catch(() => {
        /* a loadEnekeskonyv törli a cache-t — a következő megnyitás újra próbál */
      })
    return () => {
      cancelled = true
    }
  }, [open, libReady])

  const results = useMemo((): EnekTalalat[] => {
    if (!libReady || !cachedModule) return []
    const q = query.trim()
    if (q.length < 2) return []
    const lib = cachedModule
    const qNorm = lib.normalizeSearchText(q)
    return lib.searchEnek(q, 30).map((enek) => {
      // Az egyező versszak megkeresése (szöveg-találat kiemeléséhez).
      let versszakIndex: number | null = null
      let versszak: string | null = null
      if (qNorm) {
        for (let i = 0; i < enek.versszakok.length; i++) {
          if (lib.normalizeSearchText(enek.versszakok[i]).includes(qNorm)) {
            versszakIndex = i
            versszak = enek.versszakok[i]
            break
          }
        }
      }
      return {
        azonosito: enek.azonosito,
        szam: enek.szam,
        cim: enek.cim ?? null,
        elsoSor: enek.elsoSor,
        szakasz: enek.szakasz,
        versszakIndex,
        versszak,
      }
    })
  }, [libReady, query])

  const openedEnekData = useMemo(() => {
    if (!openedEnek || !cachedModule) return null
    return cachedModule.getEnek(openedEnek)
  }, [openedEnek, libReady]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setOpenedEnek(null) }}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="size-5 text-primary" /> Énekkereső — teljes szövegű keresés
          </DialogTitle>
        </DialogHeader>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Énekszám, cím, kezdősor vagy BÁRMELY szövegrészlet… (pl. „erős vár”)"
          autoFocus
        />

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
          {!libReady ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Az énekeskönyv betöltése…</p>
          ) : query.trim().length < 2 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Írj be legalább 2 karaktert — a kereső az énekek TELJES szövegében keres
              (ékezetek nélkül is), nem csak a címekben.
            </p>
          ) : results.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nincs találat.</p>
          ) : openedEnekData ? (
            <div className="p-4">
              <button
                type="button"
                className="mb-2 text-xs font-medium text-primary hover:underline"
                onClick={() => setOpenedEnek(null)}
              >
                ← Vissza a találatokhoz
              </button>
              <h3 className="font-heading text-lg text-foreground">
                {openedEnekData.azonosito}. {openedEnekData.cim || openedEnekData.elsoSor}
              </h3>
              <p className="text-xs text-muted-foreground">{openedEnekData.szakasz}</p>
              <div className="mt-3 space-y-3">
                {openedEnekData.versszakok.map((v, i) => (
                  <p key={i} className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                    <span className="mr-2 font-semibold text-muted-foreground">{i + 1}.</span>
                    {v}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((t) => (
                <li key={t.azonosito} className="flex items-start gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setOpenedEnek(t.azonosito)}
                    className="min-w-0 flex-1 text-left"
                    title="Az ének teljes szövegének megnyitása"
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {t.azonosito}. {t.cim || t.elsoSor}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{t.szakasz}</p>
                    {t.versszak ? (
                      <p className="mt-1 line-clamp-2 whitespace-pre-line rounded bg-primary/5 px-2 py-1 text-xs leading-snug text-foreground">
                        <span className="font-semibold text-primary">{(t.versszakIndex ?? 0) + 1}. vers: </span>
                        {t.versszak}
                      </p>
                    ) : null}
                  </button>
                  {onInsert ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 rounded-lg px-2 text-xs"
                      onClick={() => onInsert(t.azonosito)}
                      title="Hozzáadás a terv énekeihez"
                    >
                      <Plus className="mr-1 size-3.5" /> Tervbe
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Forrás: Erdélyi Református Énekeskönyv (Kolozsvár, 1999/2013 — Erdélyi Református
          Egyházkerület). A kereső ékezet-független, és a versszakok teljes szövegében keres.
        </p>
      </DialogContent>
    </Dialog>
  )
}
