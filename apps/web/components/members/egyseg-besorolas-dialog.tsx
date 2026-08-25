'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Building2, ChevronLeft, ChevronRight, Loader2, MapPin } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  applyEgysegBesorolas,
  getEgysegBesorolasInput,
  type EgysegBesorolasInput,
} from '@/app/(dashboard)/tagnyilvantartas/egyseg-bulk-actions'
import { cn } from '@/lib/utils'

/**
 * Tömeges egység-besorolás település szerint (2026-08-25, gyülekezeti egységek).
 *
 * 1. lépés: melyik egységbe (vagy vissza az anyaközpontba)?
 * 2. lépés: mely települések tagjai? (tagszám + minta-nevek látszanak)
 *    + „Csak a még besorolatlan tagokat" kapcsoló (alapból BE)
 *    + előnézet-összeg → Alkalmaz.
 *
 * Az egyéni (tagonkénti) besorolás a személyi kartonon módosítható.
 */
export function EgysegBesorolasDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Sikeres alkalmazás után — a hívó frissítheti a taglistát. */
  onDone?: () => void
}) {
  const [adat, setAdat] = useState<EgysegBesorolasInput | null>(null)
  const [lepes, setLepes] = useState<1 | 2>(1)
  /** 'kozpont' vagy egység-uuid; null = még nincs választás. */
  const [egysegId, setEgysegId] = useState<string | null>(null)
  const [kijelolt, setKijelolt] = useState<Set<number>>(new Set())
  const [csakBesorolatlan, setCsakBesorolatlan] = useState(true)
  const [isPending, startTransition] = useTransition()

  // Betöltés nyitáskor — hibánál az error mező jelenik meg (fail-closed,
  // SOHA nem üres listaként).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    getEgysegBesorolasInput()
      .then((res) => { if (!cancelled) setAdat(res) })
      .catch(() => {
        if (!cancelled) setAdat({ error: 'A besorolási adatok betöltése nem sikerült — próbáld újra.' })
      })
    return () => { cancelled = true }
  }, [open])

  const telepulesek = adat?.telepulesek ?? []
  const egysegek = adat?.egysegek ?? []

  const kivalasztottEgysegNev = useMemo(() => {
    if (egysegId === 'kozpont') return 'Anyaegyházközség (központ)'
    return egysegek.find((egyseg) => egyseg.id === egysegId)?.nev ?? null
  }, [egysegId, egysegek])

  /**
   * Központ célnál a „csak besorolatlan" halmaz definíció szerint üres (a
   * besorolatlan tag már az anyaközponté) — ilyenkor a már besoroltak
   * módosulnak, a kapcsoló nem jelenik meg, és a szerverre felulir: true megy.
   */
  const celKozpont = egysegId === 'kozpont'

  /** Egy település módosuló tagjainak száma — cél-tudatosan. */
  function modosuloSzam(telepules: { tagszam: number; besorolatlan: number }): number {
    if (celKozpont) return telepules.tagszam - telepules.besorolatlan
    return csakBesorolatlan ? telepules.besorolatlan : telepules.tagszam
  }

  const erintettSzam = useMemo(() => {
    let osszeg = 0
    for (const telepules of telepulesek) {
      if (!kijelolt.has(telepules.localityId)) continue
      osszeg += modosuloSzam(telepules)
    }
    return osszeg
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a modosuloSzam csak ezektől függ
  }, [telepulesek, kijelolt, csakBesorolatlan, celKozpont])

  function toggleTelepules(localityId: number) {
    setKijelolt((elozo) => {
      const kovetkezo = new Set(elozo)
      if (kovetkezo.has(localityId)) kovetkezo.delete(localityId)
      else kovetkezo.add(localityId)
      return kovetkezo
    })
  }

  function handleApply() {
    if (!egysegId || kijelolt.size === 0) return
    startTransition(async () => {
      const res = await applyEgysegBesorolas({
        egysegId,
        localityIds: [...kijelolt],
        // Központ célnál mindig felülírás — a „csak besorolatlan" ág ott
        // garantált no-op volna.
        felulir: celKozpont ? true : !csakBesorolatlan,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.modositott === 0
          ? 'Nem volt módosítandó tag a kiválasztott településeken.'
          : `${res.modositott} tag besorolva: ${kivalasztottEgysegNev ?? 'egység'}.`,
      )
      onDone?.()
      onOpenChange(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          // Záráskor tiszta lap — a következő nyitás friss adattal indul.
          setAdat(null)
          setLepes(1)
          setEgysegId(null)
          setKijelolt(new Set())
          setCsakBesorolatlan(true)
        }
        onOpenChange(v)
      }}
    >
      <DialogContent className="flex max-h-[min(90dvh,42rem)] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            Egység-besorolás település szerint
          </DialogTitle>
          <DialogDescription>
            {lepes === 1
              ? '1/2. lépés: válaszd ki, melyik egységbe kerüljenek a tagok.'
              : `2/2. lépés: pipáld ki a településeket — a rajtuk lakó tagok ide kerülnek: ${kivalasztottEgysegNev ?? ''}.`}
          </DialogDescription>
        </DialogHeader>

        {adat === null && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Betöltés…
          </div>
        )}

        {adat?.error && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {adat.error}
          </div>
        )}

        {adat && !adat.error && egysegek.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            Ebben a gyülekezetben még nincs aktív egység (leányegyházközség/szórvány) —
            előbb a „Gyülekezetünk adatai" oldalon kell egységet rögzíteni.
          </p>
        )}

        {adat && !adat.error && egysegek.length > 0 && lepes === 1 && (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {[{ id: 'kozpont', nev: 'Anyaegyházközség (központ)', tipus: '' }, ...egysegek].map((egyseg) => (
              <button
                key={egyseg.id}
                type="button"
                onClick={() => setEgysegId(egyseg.id)}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition',
                  egysegId === egyseg.id
                    ? 'border-primary bg-primary/[0.07] font-semibold text-foreground'
                    : 'border-border bg-background hover:bg-muted/40',
                )}
                aria-pressed={egysegId === egyseg.id}
              >
                <span className="min-w-0 truncate">{egyseg.nev}</span>
                {egyseg.tipus && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {egyseg.tipus === 'leany' ? 'Leányegyházközség' : 'Szórvány'}
                  </span>
                )}
              </button>
            ))}
            {typeof adat.besorolatlanSzam === 'number' && (
              <p className="pt-1 text-xs text-muted-foreground">
                Jelenleg {adat.besorolatlanSzam} aktív tag tartozik az anyaközponthoz (nincs egység-címkéje).
              </p>
            )}
          </div>
        )}

        {adat && !adat.error && egysegek.length > 0 && lepes === 2 && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {celKozpont ? (
              <p className="rounded-xl border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                A központba visszasorolás a kijelölt települések már egységbe sorolt tagjait
                érinti — a besorolatlan tagok eleve az anyaközponthoz tartoznak.
              </p>
            ) : (
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-muted/25 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={csakBesorolatlan}
                  onChange={(event) => setCsakBesorolatlan(event.target.checked)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span>
                  Csak a még besorolatlan tagokat
                  <span className="block text-xs text-muted-foreground">
                    Kikapcsolva a már máshova besorolt tagokat is átírja.
                  </span>
                </span>
              </label>
            )}

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {telepulesek.length === 0 && (
                <p className="py-3 text-sm text-muted-foreground">
                  Nem találtunk feloldható településsel rendelkező aktív tagot.
                </p>
              )}
              {telepulesek.map((telepules) => {
                const jelolt = kijelolt.has(telepules.localityId)
                const modosulo = modosuloSzam(telepules)
                return (
                  <label
                    key={telepules.localityId}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 transition',
                      jelolt ? 'border-primary bg-primary/[0.06]' : 'border-border bg-background hover:bg-muted/40',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={jelolt}
                      onChange={() => toggleTelepules(telepules.localityId)}
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5 text-primary/70" />
                          {telepules.nev}
                        </span>
                        <span className="text-xs font-normal tabular-nums text-muted-foreground">
                          {telepules.tagszam} tag
                          {telepules.besorolatlan !== telepules.tagszam
                            ? ` · ${telepules.besorolatlan} besorolatlan`
                            : ''}
                        </span>
                      </span>
                      {telepules.mintaTagok.length > 0 && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          pl. {telepules.mintaTagok.join(', ')}
                        </span>
                      )}
                    </span>
                    {jelolt && modosulo === 0 && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        nincs módosítandó
                      </span>
                    )}
                  </label>
                )
              })}
            </div>

            {typeof adat.telepulesNelkuliSzam === 'number' && adat.telepulesNelkuliSzam > 0 && (
              <p className="text-xs text-muted-foreground">
                {adat.telepulesNelkuliSzam} aktív tagnak nincs feloldható települése — őket a személyi
                kartonon lehet besorolni.
              </p>
            )}

            <div
              className="rounded-xl border border-primary/15 bg-primary/[0.05] px-3 py-2 text-sm text-foreground"
              aria-live="polite"
            >
              <strong className="tabular-nums">~{erintettSzam}</strong> tag módosul
              {kivalasztottEgysegNev ? <> — cél: <strong>{kivalasztottEgysegNev}</strong></> : null}.
            </div>
          </div>
        )}

        {adat && !adat.error && egysegek.length > 0 && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">
              Az egyéni besorolás a tag személyi kartonján (szerkesztés → „Lakóhely és elérhetőség")
              módosítható.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {lepes === 2 && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-xl"
                  onClick={() => setLepes(1)}
                  disabled={isPending}
                >
                  <ChevronLeft className="mr-1 size-4" /> Vissza
                </Button>
              )}
              {lepes === 1 ? (
                <Button
                  type="button"
                  className="min-h-11 rounded-xl"
                  onClick={() => setLepes(2)}
                  disabled={!egysegId}
                >
                  Tovább <ChevronRight className="ml-1 size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  className="min-h-11 rounded-xl"
                  onClick={handleApply}
                  disabled={isPending || kijelolt.size === 0}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" /> Alkalmazás…
                    </>
                  ) : (
                    'Alkalmaz'
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
