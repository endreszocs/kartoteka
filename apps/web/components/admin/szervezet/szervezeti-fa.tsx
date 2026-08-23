'use client'

/**
 * SZERVEZETI ÁTTEKINTŐ — a fa vezérlője (2026-08-22, 7. pont).
 *
 * Egyházkerület → egyházmegye → egyházközség EGY képernyőn. Eddig SEMMILYEN
 * felület nem mutatta a három szintet együtt: az admin Gyülekezetek oldala két
 * szintig jut, az /admin Áttekintés egyházmegye-bontása pedig kerület-vak.
 *
 * A minta SZÁNDÉKOSAN a bevált `congregations-tab.tsx`-é (keresés, rendezés,
 * „Mind nyit / Mind zár", hiba-állapot + „Újrapróbálom"), és a `_shared` admin
 * készletet (`AdminSkeleton`, `AdminEmptyState`, `StatusBadge`) használja.
 * Újat nem találunk ki: az izommemória itt többet ér, mint az eredetiség.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ HÁROM ÁLLAPOT, AMI NEM KEVERHETŐ ÖSSZE
 * ════════════════════════════════════════════════════════════════════════════
 *   · ÜRES FA, mert nincs mit mutatni      → AdminEmptyState
 *   · ÜRES FA, mert NINCS HATÓKÖRÖD        → külön, magyarázó kártya
 *     (⛔ ilyenkor a szerver SZÁNDÉKOSAN nem ad országos listát — fail-closed)
 *   · ÜRES FA, mert a lekérdezés ELBUKOTT  → piros doboz + „Újrapróbálom"
 *
 * És külön, negyedikként: a fa MEGVAN, de a TAGSZÁM nem — ilyenkor a szám
 * helyén „nem tudjuk" áll, és a lap tetején kimondjuk, miért. Nulla SOHA.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownAZ,
  Building2,
  Church,
  Landmark,
  Network,
  RefreshCw,
  Search,
  ShieldAlert,
  TriangleAlert,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'
import { getSzervezetiFa } from '@/app/(dashboard)/admin/szervezet-actions'
import {
  faOsszeg,
  faSzures,
  tagszamFelirat,
  type FaRendezes,
  type SzervezetiFa as SzervezetiFaAdat,
} from '@/app/(dashboard)/admin/szervezet-shared'

import { KeruletKartya } from './fa-csomopont'

export function SzervezetiFa() {
  const [adat, setAdat] = useState<SzervezetiFaAdat | null>(null)
  const [toltes, setToltes] = useState(true)
  const [hiba, setHiba] = useState<string | null>(null)
  const [kereses, setKereses] = useState('')
  const [rendezes, setRendezes] = useState<FaRendezes>('nev')
  const [nyitottKeruletek, setNyitottKeruletek] = useState<Set<string>>(new Set())
  const [nyitottMegyek, setNyitottMegyek] = useState<Set<string>>(new Set())

  // ⚠️ KÖTELEZŐ `.catch()`: enélkül egy elutasított promise-nál a betöltő-felirat
  //    ÖRÖKRE bent ragadna, üzenet nélkül (a projekt visszatérő hibaosztálya).
  const betolt = useCallback(() => {
    setToltes(true)
    setHiba(null)
    getSzervezetiFa()
      .then((res) => {
        if (res.error) {
          setHiba(res.error)
          return
        }
        if (res.data) {
          setAdat(res.data)
          // Alapból a KERÜLETEK nyílnak ki, az egyházmegyék nem: 783 gyülekezet
          // egyszerre kirajzolva telefonon másodpercekig tartó dermedés lenne.
          setNyitottKeruletek(new Set(res.data.keruletek.map((k) => k.id)))
          setNyitottMegyek(new Set())
        }
      })
      .catch((e) => setHiba(e instanceof Error ? e.message : 'Ismeretlen hiba.'))
      .finally(() => setToltes(false))
  }, [])

  useEffect(() => {
    const raf = requestAnimationFrame(() => betolt())
    return () => cancelAnimationFrame(raf)
  }, [betolt])

  const keruletek = useMemo(() => adat?.keruletek ?? [], [adat])
  const szurt = useMemo(() => faSzures(keruletek, kereses), [keruletek, kereses])
  const keres = kereses.trim().length > 0

  // A stat-chipek MINDIG a teljes hatókört mutatják (nem a szűrt listát) — a
  // szűrt találat-szám külön sorban jelenik meg.
  const osszeg = useMemo(() => faOsszeg(keruletek), [keruletek])
  const szurtOsszeg = useMemo(() => faOsszeg(szurt), [szurt])

  // Keresés közben MINDEN találati ág nyitva van — különben a keresés egy
  // becsukott kerületet adna vissza, és a felhasználó azt hinné, nincs találat.
  const lathatoKeruletek = useMemo(() => {
    if (!keres) return nyitottKeruletek
    return new Set(szurt.map((k) => k.id))
  }, [keres, nyitottKeruletek, szurt])
  const lathatoMegyek = useMemo(() => {
    if (!keres) return nyitottMegyek
    const s = new Set<string>()
    for (const k of szurt) for (const m of k.egyhazmegyek) s.add(`${k.id}|${m.id}`)
    return s
  }, [keres, nyitottMegyek, szurt])

  function keruletValt(id: string) {
    setNyitottKeruletek((elozo) => {
      const kov = new Set(elozo)
      if (kov.has(id)) kov.delete(id)
      else kov.add(id)
      return kov
    })
  }

  function megyeValt(kulcs: string) {
    setNyitottMegyek((elozo) => {
      const kov = new Set(elozo)
      if (kov.has(kulcs)) kov.delete(kulcs)
      else kov.add(kulcs)
      return kov
    })
  }

  function mindNyit() {
    // A TELJES fát nyitja (nem csak a szűrt találatokat), így a keresés törlése
    // után is nyitva marad minden ág.
    setNyitottKeruletek(new Set(keruletek.map((k) => k.id)))
    const megyek = new Set<string>()
    for (const k of keruletek) for (const m of k.egyhazmegyek) megyek.add(`${k.id}|${m.id}`)
    setNyitottMegyek(megyek)
  }

  function mindZar() {
    setNyitottKeruletek(new Set())
    setNyitottMegyek(new Set())
  }

  // ── Hiba-állapot: NEM tűnik el csendben, és nem keverhető az üres listával ──
  if (hiba) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center dark:border-rose-900 dark:bg-rose-950/30">
        <p className="font-semibold text-rose-800 dark:text-rose-200">
          A szervezeti fa betöltése nem sikerült
        </p>
        <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{hiba}</p>
        <Button onClick={betolt} variant="outline" className="mt-3 gap-2">
          <RefreshCw className="size-4" />
          Újrapróbálom
        </Button>
      </div>
    )
  }

  if (toltes) return <AdminSkeleton rows={6} className="py-4" />

  // ── FAIL-CLOSED: nincs hatókör → magyarázat, NEM országos lista ────────────
  if (adat?.hatokorUres) {
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-5 dark:border-amber-800 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
          <div>
            <p className="font-heading text-base text-amber-900 dark:text-amber-100">
              Nincs megjeleníthető egyházkerület
            </p>
            <p className="mt-1 text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">
              {adat.hatokorUzenet}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Bevezető */}
      <div className="rounded-2xl border border-border bg-muted/40 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Network className="mt-0.5 size-5 shrink-0 text-[var(--primary)]" aria-hidden />
          <div>
            <h2 className="font-heading text-lg text-foreground">A szervezet három szintje</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Egyházkerület → egyházmegye → egyházközség, egy képernyőn. A keresés mindhárom
              szint nevére, a püspök és az esperes nevére is ráilleszt. Ami sehová nem tartozik,
              az a lap alján, saját „árva" ágban jelenik meg — hogy ne némán maradjon ki az
              összesítőkből.
              {!adat?.rendszergazda && (
                <>
                  {' '}
                  A saját egyházkerületed fáját látod; a gyülekezetek belső beállításai (K4)
                  nem tartoznak a kerületi hatáskörbe, ezért itt nem jelennek meg.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ⚠️ A TAGSZÁM NEM ELÉRHETŐ — a szám helyén „nem tudjuk" áll, nem nulla. */}
      {adat && !adat.tagszamElerheto && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border-2 border-[var(--destructive)] px-3 py-2.5 text-sm leading-relaxed text-foreground"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-[var(--destructive)]"
            aria-hidden
          />
          <span>
            A taglétszám-összesítő most nem elérhető, ezért a tagszámot NEM mutatjuk. Ami itt
            nulla lenne, az nem azt jelentené, hogy nincs tag — csak azt, hogy{' '}
            <b>{tagszamFelirat(null)}</b>.
            {adat.tagszamUzenet ? <> ({adat.tagszamUzenet})</> : null}
          </span>
        </p>
      )}

      {/* Stat-chipek — mindig a teljes hatókör számai */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <StatCsempe label="Egyházkerület" ertek={String(osszeg.keruletek)} icon={Landmark} />
        <StatCsempe label="Egyházmegye" ertek={String(osszeg.egyhazmegyek)} icon={Building2} />
        <StatCsempe label="Gyülekezet" ertek={String(osszeg.gyulekezetek)} icon={Church} />
        <StatCsempe label="Élő tag" ertek={tagszamFelirat(osszeg.tagszam)} icon={Users} />
      </div>

      {/* Művelet-sor */}
      <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-3 sm:p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Keresés kerület, egyházmegye vagy gyülekezet nevére…"
              value={kereses}
              onChange={(e) => setKereses(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <RendezGomb
              aktiv={rendezes === 'nev'}
              onClick={() => setRendezes('nev')}
              icon={ArrowDownAZ}
              label="Név"
            />
            <RendezGomb
              aktiv={rendezes === 'tagszam'}
              onClick={() => setRendezes('tagszam')}
              icon={Users}
              label="Tagszám ↓"
            />
            <RendezGomb
              aktiv={rendezes === 'gyulekezet'}
              onClick={() => setRendezes('gyulekezet')}
              icon={Church}
              label="Gyülekezet ↓"
            />
            <div className="ml-auto flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={mindNyit} className="text-xs">
                Mind nyit
              </Button>
              <Button size="sm" variant="outline" onClick={mindZar} className="text-xs">
                Mind zár
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {keres ? (
            <>
              Találat: {szurtOsszeg.egyhazmegyek} egyházmegye · {szurtOsszeg.gyulekezetek}{' '}
              gyülekezet — a fenti összesítő a teljes hatókört mutatja. Keresés közben minden
              találati ág nyitva van.
            </>
          ) : (
            <>
              {osszeg.gyulekezetek} gyülekezet · {osszeg.felhasznalok} felhasználó ·{' '}
              {tagszamFelirat(osszeg.tagszam)} tag
            </>
          )}
        </p>
      </div>

      {/* A fa */}
      <div className="space-y-3">
        {szurt.length === 0 ? (
          keres ? (
            <AdminEmptyState
              icon={Search}
              title="Nincs találat a keresésre"
              hint="Próbálj rövidebb vagy másképp írt kerület-, egyházmegye- vagy gyülekezetnevet."
              action={
                <Button variant="outline" onClick={() => setKereses('')}>
                  Keresés törlése
                </Button>
              }
            />
          ) : (
            <AdminEmptyState
              icon={Landmark}
              title="Még nincs egyházkerület a rendszerben"
              hint="Az egyházkerületek, egyházmegyék és gyülekezetek a rendszer-inicializálás (seed) során kerülnek be."
            />
          )
        ) : (
          szurt.map((k) => (
            <KeruletKartya
              key={k.id || 'arva-kerulet'}
              kerulet={k}
              rendezes={rendezes}
              nyitva={lathatoKeruletek.has(k.id)}
              nyitottMegyek={lathatoMegyek}
              onToggle={() => keruletValt(k.id)}
              onToggleMegye={megyeValt}
            />
          ))
        )}
      </div>

      {adat && (
        <p className="text-right text-[11px] text-muted-foreground">
          A mérés ideje: {new Date(adat.mertAt).toLocaleString('hu-HU')}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Stat-csempe — token-alapú, 375 px-en is olvasható
// ─────────────────────────────────────────────────────────────────────────

function StatCsempe({
  label,
  ertek,
  icon: Icon,
}: {
  label: string
  ertek: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-2.5 sm:p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--primary)]">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="font-heading text-xl tabular-nums text-foreground">{ertek}</p>
        </div>
      </div>
    </div>
  )
}

function RendezGomb({
  aktiv,
  onClick,
  icon: Icon,
  label,
}: {
  aktiv: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={aktiv ? 'default' : 'outline'}
      aria-pressed={aktiv}
      onClick={onClick}
      className="gap-1.5 text-xs"
    >
      <Icon className="size-3.5" />
      {label}
    </Button>
  )
}
