'use client'

/**
 * A HIVATALOS SZEMÉLYI SZÁM (CNP) mezője a személyi kartonon — 2026-09-05.
 *
 * ELŐZMÉNY — Endre észrevétele: a kartonon „Személyi szám (CNP)" címke alatt
 * a rendszer által GENERÁLT azonosító állt. A hivatalos szám mostantól külön,
 * szűkebb hozzáférésű helyen él, és külön mezőt kap.
 *
 * ⚠️ AZ ÉRTÉK NEM JÖN LE A KARTONNAL. Betöltéskor CSAK azt kérdezzük meg, VAN-E
 * rögzítve szám (`vanSzemelyiSzam`) — magát az értéket a szem-ikon kéri le
 * (`getSzemelyiSzam`), és az a lekérés naplózódik. Így a maszkolás nem puszta
 * látvány: az érték tényleg nincs a lapon, amíg valaki el nem kéri.
 *
 * ⚠️ A HIBÁT KIMONDJUK. Ha a mező nem használható (nem futott a migráció, más
 * gyülekezet tagja, lekérési hiba), a felület MEGMONDJA, miért — néma üres
 * mező nincs.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff, Loader2, Pencil, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getSzemelyiSzam,
  saveSzemelyiSzam,
  vanSzemelyiSzam,
} from '@/app/(dashboard)/tagnyilvantartas/szemelyi-szam-actions'
import {
  SZEMELYI_SZAM_MASZK,
  SZEMELYI_SZAM_MAX,
  ellenorizSzemelyiSzam,
  type SzemelyiSzamAllapot,
} from '@/lib/members/szemelyi-szam'

export function SzemelyiSzamMezo({ szemelyId, szerkesztheto = true }: { szemelyId: number; szerkesztheto?: boolean }) {
  const [allapot, setAllapot] = useState<SzemelyiSzamAllapot | null>(null)
  const [ertek, setErtek] = useState<string | null>(null)
  const [tolt, setTolt] = useState(false)
  const [szerkeszt, setSzerkeszt] = useState(false)
  const [piszkozat, setPiszkozat] = useState('')
  const [ment, setMent] = useState(false)
  const kerelemRef = useRef(0)

  const allapotFrissit = useCallback(async () => {
    const token = ++kerelemRef.current
    try {
      const a = await vanSzemelyiSzam(szemelyId)
      if (kerelemRef.current !== token) return
      setAllapot(a)
    } catch {
      if (kerelemRef.current !== token) return
      setAllapot({ van: false, ertek: null, orszag: null, modositva: null, hiba: 'A mező most nem tölthető be.' })
    }
  }, [szemelyId])

  useEffect(() => {
    setErtek(null)
    setSzerkeszt(false)
    setPiszkozat('')
    void allapotFrissit()
  }, [allapotFrissit])

  async function felfed() {
    if (ertek != null) {
      setErtek(null)
      return
    }
    setTolt(true)
    try {
      const a = await getSzemelyiSzam(szemelyId)
      if (a.hiba) {
        toast.error(a.hiba)
        return
      }
      setErtek(a.ertek ?? '')
    } catch {
      toast.error('A személyi szám most nem tölthető be.')
    } finally {
      setTolt(false)
    }
  }

  async function szerkesztesIndul() {
    // A szerkesztés MINDIG üres mezővel indul: a meglévő értéket nem töltjük
    // be automatikusan, mert az felfedés volna napló nélkül.
    setPiszkozat('')
    setSzerkeszt(true)
  }

  async function mentes() {
    const e = ellenorizSzemelyiSzam(piszkozat)
    if (!e.rendben) {
      toast.error(e.hiba ?? 'Érvénytelen érték.')
      return
    }
    setMent(true)
    try {
      const res = await saveSzemelyiSzam(szemelyId, piszkozat)
      if (!res.siker) {
        toast.error(res.hiba ?? 'A mentés nem sikerült.')
        return
      }
      toast.success(
        res.torolve
          ? 'A hivatalos személyi szám törölve.'
          : res.romanCnp
            ? 'A romániai CNP elmentve (az ellenőrző számjegye stimmel).'
            : 'A hivatalos személyi szám elmentve.',
      )
      setSzerkeszt(false)
      setPiszkozat('')
      setErtek(null)
      await allapotFrissit()
    } catch {
      toast.error('A mentés nem sikerült. Próbáld újra.')
    } finally {
      setMent(false)
    }
  }

  if (allapot?.hiba) {
    return (
      <span className="inline-flex items-start gap-1.5 text-xs leading-[1.35] text-amber-700 dark:text-amber-400">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {allapot.hiba}
      </span>
    )
  }

  if (szerkeszt) {
    return (
      <span className="block space-y-1.5">
        <Input
          type="password"
          autoComplete="off"
          inputMode="numeric"
          maxLength={SZEMELYI_SZAM_MAX}
          value={piszkozat}
          onChange={(e) => setPiszkozat(e.target.value)}
          placeholder={allapot?.van ? 'Új szám — üresen hagyva törlődik' : '13 jegyű CNP vagy külföldi azonosító'}
          className="h-10 rounded-lg font-mono"
          aria-label="Hivatalos személyi szám"
        />
        <span className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" className="h-9 rounded-lg" disabled={ment} onClick={() => void mentes()}>
            {ment ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
            Mentés
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-lg"
            disabled={ment}
            onClick={() => { setSzerkeszt(false); setPiszkozat('') }}
          >
            <X className="size-4" aria-hidden />
            Mégse
          </Button>
        </span>
        <span className="block text-xs leading-[1.35] text-muted-foreground">
          A romániai CNP 13 számjegy — az ellenőrző számjegyét a rendszer megvizsgálja. Külföldi azonosító
          betűt is tartalmazhat. {allapot?.van ? 'Üres mező mentése TÖRLI a rögzített számot.' : ''}
        </span>
      </span>
    )
  }

  if (!allapot?.van) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground/70">— nincs rögzítve</span>
        {szerkesztheto && (
          <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => void szerkesztesIndul()}>
            <Pencil className="size-3.5" aria-hidden />
            Rögzítés
          </Button>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="break-all font-mono tabular-nums">
        {ertek != null ? (
          ertek || '—'
        ) : (
          <>
            <span aria-hidden>{SZEMELYI_SZAM_MASZK}</span>
            <span className="sr-only">a hivatalos személyi szám elrejtve</span>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); void felfed() }}
        disabled={tolt}
        aria-label={ertek != null ? 'Személyi szám elrejtése' : 'Személyi szám megjelenítése'}
        aria-pressed={ertek != null}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:bg-slate-800"
      >
        {tolt ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : ertek != null ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
      {szerkesztheto && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); void szerkesztesIndul() }}
          aria-label="Személyi szám módosítása (a törléshez hagyd üresen a mezőt)"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-slate-800"
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  )
}
