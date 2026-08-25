'use client'

/**
 * KÖTÉS-DIALÓGUS — egy gyülekezet HIVATALOS szervezeti formája
 * (anya–leány–missziói–társ) és az anya-kötés kezelése (2026-08-25, terv 3.1).
 *
 * · A típus-választó a kanonikus SZERVEZETI_TIPUS_CIMKEK + _LEIRAS párokból
 *   épül (lib/gyulekezet/egysegek-shared.ts) — a magyarázat ott van a döntésnél,
 *   és egy új forma (mint a 'tars') a katalógusból magától megjelenik.
 * · Leánynál anya-választó: a SAJÁT egyházmegye 'anya'/'misszioi'/'tars'
 *   gyülekezetei, a fa MÁR BETÖLTÖTT adatából szűrve (nincs külön lekérdezés),
 *   névre szűrhető.
 * · ⚠️ A SZERVER-HIBA SZÓ SZERINT jelenik meg: a DB őr-trigger
 *   (congregations_szervezet_guard) magyar RAISE-üzenetei maguk a szabályok
 *   („Leányegyházközségnek kötelező anyaegyházközséget megadni…") — nem
 *   csomagoljuk át őket.
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Network, Search, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  SZERVEZETI_TIPUS_CIMKEK,
  SZERVEZETI_TIPUS_LEIRAS,
  type SzervezetiTipus,
} from '@/lib/gyulekezet/egysegek-shared'
import { setCongregationSzervezet } from '@/app/(dashboard)/admin/szervezet-kotes-actions'
import type { FaGyulekezet } from '@/app/(dashboard)/admin/szervezet-shared'

// Katalógus-alapú (nem kézzel felsorolt) lista: a SZERVEZETI_TIPUS_CIMKEK
// kulcsai a teljes értékkészlet — így a 'tars' (és minden későbbi forma)
// automatikusan megjelenik a választóban.
const TIPUSOK = Object.keys(SZERVEZETI_TIPUS_CIMKEK) as SzervezetiTipus[]

export interface AnyaJelolt {
  id: string
  nev: string
}

export function KotesDialog({
  gyulekezet,
  anyaJeloltek,
  onOpenChange,
  onSaved,
}: {
  /** `null` = a dialógus zárva. */
  gyulekezet: FaGyulekezet | null
  /**
   * A saját egyházmegye 'anya'/'misszioi'/'tars' gyülekezetei (a fa betöltött
   * adatából) — a hívó szűri, itt csak a saját magára mutató sort dobjuk el.
   */
  anyaJeloltek: AnyaJelolt[]
  onOpenChange: (open: boolean) => void
  /** Sikeres mentés után hívódik (a hívó zár + újratölt). */
  onSaved: () => void
}) {
  const [tipus, setTipus] = useState<SzervezetiTipus>('anya')
  const [anyaId, setAnyaId] = useState('')
  const [anyaKereses, setAnyaKereses] = useState('')
  const [mentes, setMentes] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  // Megnyitáskor a gyülekezet AKTUÁLIS állapota az alapérték. (A rAF a
  // synchronous-setState-in-effect lint elkerülésére — AdminConfirmDialog minta.)
  useEffect(() => {
    if (!gyulekezet) return
    const raf = requestAnimationFrame(() => {
      setTipus(gyulekezet.szervezetiTipus ?? 'anya')
      setAnyaId(gyulekezet.anyaId ?? '')
      setAnyaKereses('')
      setHiba(null)
    })
    return () => cancelAnimationFrame(raf)
  }, [gyulekezet])

  const valaszthatoJeloltek = useMemo(
    () => anyaJeloltek.filter((j) => j.id !== gyulekezet?.id),
    [anyaJeloltek, gyulekezet],
  )

  const lathatoJeloltek = useMemo(() => {
    const q = anyaKereses.trim().toLowerCase()
    const szurt = q
      ? valaszthatoJeloltek.filter((j) => j.nev.toLowerCase().includes(q))
      : valaszthatoJeloltek
    // A KIVÁLASZTOTT anya akkor is látszik, ha a szűrés épp kiszűrné — különben
    // a select némán „elveszítené" az értékét.
    const kivalasztott = valaszthatoJeloltek.find((j) => j.id === anyaId)
    if (kivalasztott && !szurt.some((j) => j.id === anyaId)) {
      return [kivalasztott, ...szurt]
    }
    return szurt
  }, [valaszthatoJeloltek, anyaKereses, anyaId])

  async function ment() {
    if (!gyulekezet || mentes) return
    if (tipus === 'leany' && !anyaId) {
      setHiba('Leányegyházközségnek kötelező anyaegyházközséget választani.')
      return
    }
    setMentes(true)
    setHiba(null)
    try {
      const res = await setCongregationSzervezet({
        congregationId: gyulekezet.id,
        szervezetiTipus: tipus,
        anyaCongregationId: tipus === 'leany' ? anyaId : null,
      })
      if (res.error) {
        // ⚠️ Szó szerint — a DB-trigger magyar szabály-szövege is így jön.
        setHiba(res.error)
        return
      }
      toast.success(res.success || 'A szervezeti forma elmentve.')
      onSaved()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : 'A mentés nem sikerült (ismeretlen hiba).')
    } finally {
      setMentes(false)
    }
  }

  return (
    <Dialog
      open={gyulekezet !== null}
      onOpenChange={(nyitva) => {
        if (!mentes) onOpenChange(nyitva)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 text-lg text-foreground">
            <Network className="size-5 shrink-0 text-[var(--primary)]" aria-hidden />
            <span className="min-w-0 truncate">Szervezeti forma — {gyulekezet?.nev}</span>
          </DialogTitle>
          <DialogDescription render={<div />} className="leading-relaxed">
            A gyülekezet hivatalos szervezeti formája (egyházmegyei javaslat + kerületi
            jóváhagyás szerint). A módosítás az admin naplóba kerül.
          </DialogDescription>
        </DialogHeader>

        {/* Típus-választó — kártya-rádiók, magyarázattal */}
        <div role="radiogroup" aria-label="Szervezeti típus" className="space-y-2">
          {TIPUSOK.map((t) => {
            const aktiv = tipus === t
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={aktiv}
                disabled={mentes}
                onClick={() => {
                  setTipus(t)
                  setHiba(null)
                }}
                className={`w-full rounded-xl border-2 p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  aktiv
                    ? 'border-[var(--primary)] bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <span className="block text-sm font-semibold text-foreground">
                  {SZERVEZETI_TIPUS_CIMKEK[t]}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {SZERVEZETI_TIPUS_LEIRAS[t]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Anya-választó — csak leánynál */}
        {tipus === 'leany' && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
            <label
              htmlFor="kotes-anya-select"
              className="block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Anyaegyházközség (a saját egyházmegye anya-, missziói és társegyházközségei)
            </label>
            {valaszthatoJeloltek.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Ebben az egyházmegyében jelenleg nincs választható anya-, missziói vagy
                társegyházközség — előbb a leendő anya típusát kell beállítani.
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={anyaKereses}
                    onChange={(e) => setAnyaKereses(e.target.value)}
                    placeholder="Szűrés névre…"
                    className="pl-9"
                    disabled={mentes}
                  />
                </div>
                <select
                  id="kotes-anya-select"
                  value={anyaId}
                  onChange={(e) => {
                    setAnyaId(e.target.value)
                    setHiba(null)
                  }}
                  disabled={mentes}
                  className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {!anyaId && (
                    <option value="" disabled>
                      — válassz anyaegyházközséget —
                    </option>
                  )}
                  {/* ⚠️ Védőháló: ha a beállított anya NINCS a látható jelöltek
                      között (pl. időközben másik egyházmegyébe került, és a
                      hívó listája nem fedi le), explicit opciót kap — a
                      kontrollált select SOHA ne mutasson üres állapotot. */}
                  {anyaId && !lathatoJeloltek.some((j) => j.id === anyaId) && (
                    <option value={anyaId}>
                      Jelenlegi anyaegyházközség (nem látható a hatókörödben)
                    </option>
                  )}
                  {lathatoJeloltek.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nev}
                    </option>
                  ))}
                </select>
                {lathatoJeloltek.length === 0 && (
                  <p className="text-xs italic text-muted-foreground">
                    Nincs találat a szűrésre — rövidebb névrészletet próbálj.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ⚠️ Szerver-hiba SZÓ SZERINT (a DB-trigger magyar szabály-szövege is) */}
        {hiba && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-sm leading-relaxed text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{hiba}</span>
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mentes}
            className="w-full sm:w-auto"
          >
            Mégse
          </Button>
          <Button
            onClick={ment}
            disabled={mentes || (tipus === 'leany' && !anyaId)}
            className="w-full gap-2 sm:w-auto"
          >
            {mentes && <Loader2 className="size-4 animate-spin" />}
            Mentés
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
