'use client'

/**
 * Profil → Biztonság → „Asztali alkalmazás" kártya (2026-09-05).
 *
 * Mit tud:
 *  · felsorolja a fiókhoz kapcsolt asztali gépeket (név, mikor);
 *  · „Kijelentkeztetés minden más eszközről" — a webes munkamenet marad, a
 *    többi (asztali gépek, telefon, másik böngésző) kilép; az asztali app a
 *    helyi PIN-nel tovább dolgozik, de a felhőbe újra össze kell kapcsolni;
 *  · elmagyarázza az ELFELEJTETT PIN útját: a PIN a gépen él, a rendszer nem
 *    tudja; az asztali appban „Elfelejtettem a kódot" → ott újra összekapcsolás
 *    (itt, bejelentkezve jóváhagyod) → új PIN.
 *
 * Csak téma-tokenek (sötét mód), 44 px-es érintőfelületek.
 */

import { useEffect, useState, useTransition } from 'react'
import { Loader2, LogOut, MonitorSmartphone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  elfelejtDesktopEszkozt,
  kijelentkeztetMasEszkozoket,
  listDesktopEszkozok,
  type DesktopEszkoz,
} from '@/app/(dashboard)/profile/biztonsag/actions'
import { Button } from '@/components/ui/button'
import { huIdopontBukarest } from '@/lib/utils/idopont-bukarest'

export function DesktopEszkozokCard() {
  const [eszkozok, setEszkozok] = useState<DesktopEszkoz[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [dolgozik, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    void listDesktopEszkozok().then((res) => {
      if (cancelled) return
      if (res.error) setHiba(res.error)
      setEszkozok(res.eszkozok ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  function kijelentkeztet() {
    if (!window.confirm('Minden MÁS eszközön (asztali gépek, telefon, másik böngésző) megszűnik a bejelentkezés. Ez a böngésző bejelentkezve marad. Folytatod?')) return
    startTransition(async () => {
      const res = await kijelentkeztetMasEszkozoket()
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('A többi eszköz kijelentkezett. Az asztali gépeket újra össze kell kapcsolni.')
    })
  }

  function elfelejt(id: string) {
    startTransition(async () => {
      const res = await elfelejtDesktopEszkozt(id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setEszkozok((prev) => (prev ?? []).filter((e) => e.id !== id))
    })
  }

  return (
    <section className="card-raised space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MonitorSmartphone className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Asztali alkalmazás</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Az asztali Kartotéka jelszó nélkül, ezen a webes fiókon keresztül kapcsolódik (Google-belépéssel is).
            Az összekapcsolást az asztali app indítja, és itt, bejelentkezve hagyod jóvá.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm leading-relaxed text-foreground">
        <p className="font-semibold">Elfelejtett PIN-kód?</p>
        <p className="text-muted-foreground">
          A PIN csak a gépeden él, a rendszer nem tárolja. Az asztali appban kattints az „Elfelejtettem a kódot" gombra:
          az app újra összekapcsolást kér, amit itt jóváhagysz, utána új PIN-t adhatsz meg. Semmilyen adat nem vész el.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Összekapcsolt gépek</p>
        {eszkozok === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Betöltés…</p>
        ) : hiba ? (
          <p className="text-sm text-muted-foreground">{hiba}</p>
        ) : eszkozok.length === 0 ? (
          <p className="text-sm text-muted-foreground">Még nincs összekapcsolt asztali gép.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {eszkozok.map((e) => (
              <li key={e.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{e.eszkozNev || 'Kartotéka asztali alkalmazás'}</p>
                  <p className="text-xs text-muted-foreground">
                    Összekapcsolva: {e.felhasznalvaAt ? huIdopontBukarest(e.felhasznalvaAt, 'long') : '—'}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="min-h-10" disabled={dolgozik} onClick={() => elfelejt(e.id)} aria-label="Eszköz elfelejtése">
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Az „elfelejtés" csak a listából veszi ki a gépet; a bejelentkezését az alábbi gomb szünteti meg.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Gyanús hozzáférés? Zárd ki az összes többi eszközt.</p>
        <Button type="button" variant="outline" className="min-h-11" disabled={dolgozik} onClick={kijelentkeztet}>
          {dolgozik ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LogOut className="mr-2 size-4" />}
          Kijelentkeztetés minden más eszközről
        </Button>
      </div>
    </section>
  )
}
