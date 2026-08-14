'use client'

/**
 * Számla ↔ kiadás kapcsoló dialógus (7. pont C szelet).
 *
 * A „Kifizetés rögzítése" folyamat ZÁRÓ lépése: a frissen (vagy korábban)
 * mentett kiadást hozzákapcsolja a szállítói számlához a
 * szallitoi_szamla_kiadas kapcsolótáblán át (B szelet: linkSzamlaKiadas, a
 * fillérre pontos fedezet-őrrel), és ha a számla teljes összege lefedett,
 * a számlát kifizetettnek jelöli.
 *
 * A jelölt-lista a legutóbbi élő kiadásokat mutatja; a legvalószínűbb
 * találatot (összeg- és/vagy név-egyezés) előre kiválasztjuk — de a döntés
 * MINDIG a felhasználóé (nincs néma auto-kapcsolás).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Link2, Loader2, Unlink } from 'lucide-react'
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
  formatOsszeg,
  type KiadasJelolt,
  type KifizetetlenTetel,
} from '@/lib/dokumentumtar/kifizetetlen-types'
import type { SzamlaKiadasKapcsolat } from '@/lib/dokumentumtar/szamla-types'
import { listKiadasJeloltek } from '@/app/(dashboard)/dokumentumtar/kifizetetlen-actions'
import {
  linkSzamlaKiadas,
  listSzamlaKiadasKapcsolatok,
  setSzamlaKifizetve,
  unlinkSzamlaKiadas,
} from '@/app/(dashboard)/dokumentumtar/szamla-actions'

interface SzamlaKapcsolasDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A kapcsolandó HELYI számla (forras='helyi', szamlaId kötelező). */
  szamla: KifizetetlenTetel | null
  /** Bármely sikeres módosítás (kapcsolás/bontás/kifizetve) után hívódik. */
  onChanged: () => void
}

function datumSzoveg(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('hu-HU')
}

export function SzamlaKapcsolasDialog({
  open,
  onOpenChange,
  szamla,
  onChanged,
}: SzamlaKapcsolasDialogProps) {
  const szamlaId = szamla?.szamlaId || null

  const [loading, setLoading] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [kapcsolatok, setKapcsolatok] = useState<SzamlaKiadasKapcsolat[]>([])
  const [jeloltek, setJeloltek] = useState<KiadasJelolt[]>([])
  const [kivalasztott, setKivalasztott] = useState<number | null>(null)
  const [osszegResz, setOsszegResz] = useState('')
  const [busy, setBusy] = useState(false)

  // A már kapcsolt részek összege fillérben — a maradék ebből számolódik.
  const kapcsoltFiller = useMemo(
    () => kapcsolatok.reduce((s, k) => s + Math.round(Number(k.osszeg_resz) * 100), 0),
    [kapcsolatok],
  )
  const szamlaOsszeg = szamla ? Number(szamla.osszeg) || 0 : 0
  const maradek = Math.max(0, (Math.round(szamlaOsszeg * 100) - kapcsoltFiller) / 100)
  const teljesenLefedett = szamla !== null && Math.round(szamlaOsszeg * 100) > 0 && maradek === 0

  const load = useCallback(async () => {
    if (!szamlaId) return
    setLoading(true)
    setHiba(null)
    const [kapcs, jel] = await Promise.all([
      listSzamlaKiadasKapcsolatok(szamlaId),
      listKiadasJeloltek({ szamlaId }),
    ])
    // FAIL-CLOSED: a hibát hangosan mutatjuk, nem nyeljük el.
    setHiba(kapcs.error || jel.error)
    setKapcsolatok(kapcs.rows)
    setJeloltek(jel.jeloltek)
    setLoading(false)
  }, [szamlaId])

  // Megnyitáskor betöltés + a legvalószínűbb jelölt előre-kiválasztása.
  useEffect(() => {
    if (!open || !szamlaId) return
    setKivalasztott(null)
    setOsszegResz('')
    void load()
  }, [open, szamlaId, load])

  // A jelöltek pontozása: összeg-egyezés a maradékkal (2 pont) + név-egyezés
  // a szállítóval (1 pont). A legjobbat ELŐRE kiválasztjuk (ha van pontja).
  const pontozott = useMemo(() => {
    const partner = (szamla?.partnerNev || '').toLowerCase().trim()
    return jeloltek
      .map((j) => {
        let pont = 0
        if (maradek > 0 && Math.abs(j.osszeg - maradek) < 0.005) pont += 2
        if (partner && (j.atvevo || '').toLowerCase().includes(partner)) pont += 1
        return { jelolt: j, pont }
      })
      .sort((a, b) => b.pont - a.pont)
  }, [jeloltek, maradek, szamla])

  useEffect(() => {
    if (loading || kivalasztott !== null || pontozott.length === 0) return
    const best = pontozott[0]
    if (best.pont > 0) {
      setKivalasztott(best.jelolt.id)
      setOsszegResz(String(Math.min(best.jelolt.osszeg, maradek || best.jelolt.osszeg)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pontozott])

  function valaszt(j: KiadasJelolt) {
    setKivalasztott(j.id)
    // Alapértelmezett rész: a kiadás összege, de legfeljebb a számla maradéka.
    setOsszegResz(String(maradek > 0 ? Math.min(j.osszeg, maradek) : j.osszeg))
  }

  async function handleKapcsolas() {
    if (!szamlaId || kivalasztott === null) return
    const resz = Number(osszegResz.replace(',', '.'))
    if (!Number.isFinite(resz) || resz <= 0) {
      toast.error('Adj meg 0-nál nagyobb kapcsolt összeget.')
      return
    }
    setBusy(true)
    const { error } = await linkSzamlaKiadas({ szamlaId, kiadasId: kivalasztott, osszegResz: resz })
    if (error) {
      setBusy(false)
      toast.error(error)
      return
    }

    // Ha a számla teljes összege lefedett lett, kifizetettnek jelöljük —
    // hangosan (toast), és a hibát sem nyeljük el.
    const ujKapcsoltFiller = kapcsoltFiller + Math.round(resz * 100)
    if (Math.round(szamlaOsszeg * 100) > 0 && ujKapcsoltFiller >= Math.round(szamlaOsszeg * 100)) {
      const kif = await setSzamlaKifizetve(szamlaId, true)
      if (kif.error) {
        toast.warning(
          `A kiadás kapcsolása sikerült, de a kifizetve-jelölés nem: ${kif.error}`,
        )
      } else {
        toast.success('A számla teljes összege kiadáshoz kapcsolva — kifizetettként megjelölve.')
      }
      setBusy(false)
      onChanged()
      onOpenChange(false)
      return
    }

    toast.success('A kiadás a számlához kapcsolva.')
    setBusy(false)
    setKivalasztott(null)
    setOsszegResz('')
    onChanged()
    void load()
  }

  async function handleBontas(kapcsolatId: string) {
    setBusy(true)
    const { error } = await unlinkSzamlaKiadas(kapcsolatId)
    setBusy(false)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('A kapcsolat bontva.')
    onChanged()
    void load()
  }

  async function handleKifizetveKapcsolasNelkul() {
    if (!szamlaId) return
    setBusy(true)
    const { error } = await setSzamlaKifizetve(szamlaId, true)
    setBusy(false)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('A számla kifizetettként megjelölve.')
    onChanged()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Link2 className="size-5 text-cyan-600" aria-hidden />
            Számla összekapcsolása a kiadással
          </DialogTitle>
          <DialogDescription>
            {szamla ? (
              <>
                <strong>{szamla.partnerNev || 'Ismeretlen szállító'}</strong>
                {szamla.szamlaSzam ? <> · {szamla.szamlaSzam}</> : null} ·{' '}
                <strong>{formatOsszeg(szamlaOsszeg, szamla.penznem)}</strong>
                {maradek > 0 && kapcsoltFiller > 0 ? (
                  <> — még kapcsolható: {formatOsszeg(maradek, szamla.penznem)}</>
                ) : null}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Kiadások betöltése…
            </div>
          ) : hiba ? (
            <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3" role="alert">
              <p className="text-xs font-semibold text-destructive">A kapcsoláshoz szükséges adatok nem tölthetők be</p>
              <p className="text-xs text-destructive">{hiba}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                Újrapróbálás
              </Button>
            </div>
          ) : (
            <>
              {/* Meglévő kapcsolatok — bonthatók */}
              {kapcsolatok.length > 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    Már kapcsolt kiadások
                  </p>
                  <ul className="divide-y divide-emerald-100">
                    {kapcsolatok.map((k) => (
                      <li key={k.id} className="flex items-center gap-2 py-1.5">
                        <div className="min-w-0 flex-1 text-xs text-emerald-900">
                          <span className="font-medium">
                            {k.kiadas?.atvevo || `Kiadás #${k.kiadas_id}`}
                          </span>{' '}
                          · {datumSzoveg(k.kiadas?.datum || null)} ·{' '}
                          <span className="font-semibold">
                            {formatOsszeg(Number(k.osszeg_resz) || 0, szamla?.penznem || 'RON')}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:bg-destructive/10"
                          aria-label="Kapcsolat bontása"
                          title="Kapcsolat bontása"
                          disabled={busy}
                          onClick={() => void handleBontas(k.id)}
                        >
                          <Unlink aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {teljesenLefedett ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  A számla teljes összege kiadáshoz van kapcsolva.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-700">
                    Melyik kiadás fedezi a számlát?
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      (a legutóbbi rögzített kiadások)
                    </span>
                  </p>
                  {jeloltek.length === 0 ? (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      Nincs kapcsolható kiadás — előbb rögzítsd a kifizetést a „Kifizetés
                      rögzítése" gombbal, és utána kapcsold ide.
                    </p>
                  ) : (
                    <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                      {pontozott.map(({ jelolt, pont }) => {
                        const active = kivalasztott === jelolt.id
                        return (
                          <li key={jelolt.id}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => valaszt(jelolt)}
                              aria-pressed={active}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left transition min-h-11 ${
                                active ? 'bg-cyan-50 ring-1 ring-inset ring-cyan-500' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-800">
                                  {jelolt.atvevo || `Kiadás #${jelolt.id}`}
                                  {pont > 0 ? (
                                    <span className="ml-1.5 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700">
                                      valószínű egyezés
                                    </span>
                                  ) : null}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {datumSzoveg(jelolt.datum)}
                                  {jelolt.iratszam ? ` · ${jelolt.iratszam}` : ''}
                                  {jelolt.nyugta ? ` · ${jelolt.nyugta}` : ''}
                                </p>
                              </div>
                              <span className="shrink-0 text-sm font-semibold text-slate-700">
                                {formatOsszeg(jelolt.osszeg, szamla?.penznem || 'RON')}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {kivalasztott !== null ? (
                    <label className="block text-xs font-medium text-slate-600">
                      Ebből a számlához tartozó rész ({szamla?.penznem || 'RON'})
                      <Input
                        value={osszegResz}
                        inputMode="decimal"
                        onChange={(e) => setOsszegResz(e.target.value)}
                        className="mt-1 min-h-10 rounded-xl"
                      />
                    </label>
                  ) : null}
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={busy || teljesenLefedett || !szamlaId}
            onClick={() => void handleKifizetveKapcsolasNelkul()}
            title="A számla kifizetettnek jelölése kiadás-kapcsolás nélkül"
          >
            Kifizetve — kapcsolás nélkül
          </Button>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Bezárás
            </Button>
            {!teljesenLefedett ? (
              <Button
                type="button"
                className="flex-1 gap-2 bg-cyan-700 text-white hover:bg-cyan-800 sm:flex-none"
                disabled={busy || kivalasztott === null}
                onClick={() => void handleKapcsolas()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Link2 className="size-4" aria-hidden />
                )}
                Kapcsolás
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
