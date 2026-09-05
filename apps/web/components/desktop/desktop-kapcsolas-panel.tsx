'use client'

/**
 * Asztali eszköz-kapcsolás — JÓVÁHAGYÓ PANEL (2026-09-05).
 *
 * Mit lát a lelkész: az eszköz nevét, a 6 jegyű ELLENŐRZŐ KÓDOT (nagyban),
 * a hátralévő időt, és két gombot. A kód összehasonlítása a phishing elleni
 * védelem: idegen kéréssel érkező hivatkozásnál a saját gépén MÁS szám áll.
 *
 * Mobil-első (a lelkész gyakran a telefonján jelentkezik be Google-lel),
 * minden érintőfelület ≥ 44 px, csak téma-tokenek (sötét mód).
 */

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, MonitorSmartphone, ShieldAlert, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import {
  elutasitDesktopKapcsolas,
  getKapcsolasKeres,
  jovahagyDesktopKapcsolas,
  type KapcsolasKeresNezet,
} from '@/app/(dashboard)/desktop-kapcsolas/actions'
import { Button } from '@/components/ui/button'
import { ellenorzoKodFormazott } from '@kartoteka/supabase-client'

type Allapot =
  | { fazis: 'betolt' }
  | { fazis: 'nincs'; uzenet: string }
  | { fazis: 'keres'; keres: KapcsolasKeresNezet }
  | { fazis: 'jovahagyva' }
  | { fazis: 'elutasitva' }

export function DesktopKapcsolasPanel({ id, hiba }: { id: string | null; hiba: string | null }) {
  const [allapot, setAllapot] = useState<Allapot>(() =>
    id ? { fazis: 'betolt' } : { fazis: 'nincs', uzenet: hiba === 'azonosito'
      ? 'A hivatkozásban nem volt érvényes kérés-azonosító. Az asztali alkalmazásban kattints újra az „Összekapcsolás" gombra.'
      : 'Nincs függőben lévő asztali kérés. Az asztali alkalmazásban indítsd el az összekapcsolást — az megnyitja ezt az oldalt.' },
  )
  const [masodikFaktor, setMasodikFaktor] = useState(false)
  const [dolgozik, startTransition] = useTransition()
  // Az „óra" — a hátralévő idő NEM külön állapot, hanem ebből SZÁRMAZTATJUK
  // renderben (lásd lent). MIÉRT: a CI lintje (react-hooks/set-state-in-effect)
  // tiltja a szinkron setState-et az effekt törzsében; az óra csak az
  // intervallum visszahívásában lép, az első értékét a kérés betöltésekor kapja.
  const [most, setMost] = useState(() => Date.now())

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void getKapcsolasKeres(id).then((res) => {
      if (cancelled) return
      if (res.error || !res.keres) {
        setAllapot({ fazis: 'nincs', uzenet: res.error || 'A kérés nem található.' })
        return
      }
      setMost(Date.now())
      setAllapot({ fazis: 'keres', keres: res.keres })
    })
    return () => {
      cancelled = true
    }
  }, [id])

  // Hátralévő idő — a kérés 10 perc alatt lejár; a lelkész lássa, mennyi van.
  // Az effekt CSAK az intervallumot indítja (nincs szinkron setState benne).
  useEffect(() => {
    if (allapot.fazis !== 'keres') return
    const t = window.setInterval(() => setMost(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [allapot.fazis])

  function jovahagy() {
    if (allapot.fazis !== 'keres') return
    const keresId = allapot.keres.id
    startTransition(async () => {
      const res = await jovahagyDesktopKapcsolas(keresId)
      if (!res.ok) {
        if (res.masodikFaktor) setMasodikFaktor(true)
        toast.error(res.error || 'A jóváhagyás nem sikerült.')
        return
      }
      setAllapot({ fazis: 'jovahagyva' })
    })
  }

  function elutasit() {
    if (allapot.fazis !== 'keres') return
    const keresId = allapot.keres.id
    startTransition(async () => {
      const res = await elutasitDesktopKapcsolas(keresId)
      if (!res.ok) {
        toast.error(res.error || 'Az elutasítás nem sikerült.')
        return
      }
      setAllapot({ fazis: 'elutasitva' })
    })
  }

  if (allapot.fazis === 'betolt') {
    return (
      <div className="card-raised flex items-center gap-3 p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> A kérés betöltése…
      </div>
    )
  }

  if (allapot.fazis === 'nincs') {
    return (
      <div className="card-raised space-y-3 p-5">
        <p className="text-sm leading-relaxed text-foreground">{allapot.uzenet}</p>
        <p className="text-xs text-muted-foreground">
          Az asztali alkalmazás letölthető és az összekapcsolás elindítható az Első indítás képernyőről.
          Kérdés esetén a rendszergazda segít.
        </p>
      </div>
    )
  }

  if (allapot.fazis === 'jovahagyva') {
    return (
      <div className="card-raised space-y-3 p-5">
        <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-6 shrink-0" />
          <p className="text-base font-semibold">Jóváhagyva — az asztali alkalmazás most lép be.</p>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Menj vissza az asztali gépedhez: pár másodpercen belül folytatja a beállítást
          (kétlépcsős belépés, ha van; PIN-kód; első szinkronizálás). Ezt a lapot bezárhatod.
        </p>
        <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">
          Vissza a kezdőlapra
        </Link>
      </div>
    )
  }

  if (allapot.fazis === 'elutasitva') {
    return (
      <div className="card-raised space-y-2 p-5">
        <div className="flex items-center gap-3 text-foreground">
          <XCircle className="size-6 shrink-0 text-muted-foreground" />
          <p className="text-base font-semibold">A kérést elutasítottad.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Az asztali alkalmazás nem lép be. Ha nem te indítottad a kérést, jelezd a rendszergazdának.
        </p>
      </div>
    )
  }

  const { keres } = allapot
  // Származtatás renderben — a `most` másodpercenként lép, ez vele együtt frissül.
  const hatraMp = Math.max(0, Math.floor((new Date(keres.lejar).getTime() - most) / 1000))
  const nemFolytathato = keres.allapot !== 'varakozik' || keres.lejartE || hatraMp === 0

  return (
    <div className="space-y-4">
      <div className="card-raised space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MonitorSmartphone className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Kérő eszköz</p>
            <p className="break-words text-base font-semibold text-foreground">{keres.eszkozNev || 'Kartotéka asztali alkalmazás'}</p>
            {!nemFolytathato && (
              <p className="text-xs text-muted-foreground">
                A kérés még {Math.floor(hatraMp / 60)} perc {String(hatraMp % 60).padStart(2, '0')} másodpercig érvényes.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ellenőrző kód</p>
          <p className="mt-2 font-heading text-4xl tracking-[0.2em] text-foreground sm:text-5xl" aria-label={`Ellenőrző kód: ${keres.ellenorzoKod.split('').join(' ')}`}>
            {ellenorzoKodFormazott(keres.ellenorzoKod)}
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Ugyanezt a számot látod az asztali gépen? Csak akkor hagyd jóvá. Ha más szám áll ott,
            vagy nem te indítottad, <strong className="text-foreground">utasítsd el</strong>.
          </p>
        </div>

        {nemFolytathato && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {keres.allapot === 'jovahagyva' || keres.allapot === 'felhasznalva'
                ? 'Ezt a kérést már jóváhagytad — az asztali alkalmazás belépett vagy éppen belép.'
                : keres.allapot === 'elutasitva'
                  ? 'Ezt a kérést korábban elutasítottad.'
                  : 'A kérés lejárt (10 perc). Az asztali alkalmazásban indíts újat.'}
            </span>
          </div>
        )}

        {masodikFaktor && (
          <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground">
            A fiókodon kétlépcsős belépés van. Előbb írd be a hitelesítő alkalmazás kódját:{' '}
            <Link href="/login/ellenorzes" className="font-medium text-primary underline underline-offset-4">
              kétlépcsős ellenőrzés
            </Link>
            , utána gyere vissza erre az oldalra.
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11" disabled={dolgozik || nemFolytathato} onClick={elutasit}>
            <XCircle className="mr-2 size-4" /> Elutasítom
          </Button>
          <Button type="button" className="min-h-11" disabled={dolgozik || nemFolytathato} onClick={jovahagy}>
            {dolgozik ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}
            Egyezik — összekapcsolom
          </Button>
        </div>
      </div>

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        A jóváhagyás után az asztali gép a TE fiókoddal dolgozik (a saját gyülekezeted adataival). Az
        összekapcsolt gépeket a Profil → Biztonság oldalon látod, és onnan ki is jelentkeztetheted őket.
      </p>
    </div>
  )
}
