'use client'

/**
 * Pecsét + aláírás kép feltöltő szekció — KÖZÖS komponens (2026-08-15, S4).
 *
 * MIÉRT KÖZÖS: a 24. pont gyülekezeti pecsét/aláírás-feltöltője
 * (congregation-setup-wizard SectionIratKepek) és az egyházmegyei párja
 * (diocese-setup-wizard) BITRE ugyanaz az élmény — a „második felület a régi
 * implementációt őrzi" hibaosztály ellen a UI+folyamat EGY helyen él, a hívó
 * csak a szerver-akciókat és a feliratokat köti be (prop-alapú adatforrás,
 * nem másolat).
 *
 * Szabályok (mindkét scope-ban azonosak):
 *  · CSAK PNG/WEBP (átlátszó háttér — a kép a nyomtatvány szövegére kerül),
 *  · max 1 MB (a kép data: URI-ként ágyazódik minden nyomtatványba),
 *  · a feltöltés AZONNAL ment (nem függ a varázsló nagy „Mentés" gombjától),
 *  · migráció előtti adatbázisnál a betöltés hangos magyar hibát ad
 *    (fail-closed), és a feltöltők nem jelennek meg.
 */

import { useEffect, useState } from 'react'
import { Loader2, Stamp, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'

export type IratKepFajta = 'pecset' | 'alairas'

export interface IratKepekSectionProps {
  /** A két kép-fajta felirata (pl. „Hivatalos pecsét" / „Esperesi aláírás"). */
  feliratok: Record<IratKepFajta, string>
  /** A szekció magyarázó szövege (a feltöltési szabályokkal). */
  leiras: string
  /** A képek betöltése (scope-hoz kötött szerver-akció). */
  load: () => Promise<{ pecsetUrl: string | null; alairasUrl: string | null; error: string | null }>
  /** Feltöltés — a szerveren AZONNAL menti az URL-t a törzsadat-sorra. */
  upload: (fajta: IratKepFajta, fd: FormData) => Promise<{ url?: string; error?: string }>
  /** A kép levétele (az URL törlése a törzsadat-sorról). */
  remove: (fajta: IratKepFajta) => Promise<{ error?: string }>
}

export function IratKepekSection({ feliratok, leiras, load, upload, remove }: IratKepekSectionProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [kepek, setKepek] = useState<Record<IratKepFajta, string | null>>({
    pecset: null,
    alairas: null,
  })
  const [busy, setBusy] = useState<IratKepFajta | null>(null)

  useEffect(() => {
    let cancelled = false
    void load().then((res) => {
      if (cancelled) return
      setKepek({ pecset: res.pecsetUrl, alairas: res.alairasUrl })
      setLoadError(res.error)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // A `load` referenciája hívónként stabil kell legyen (inline arrow a
    // wizardban rendben: a szekció egyszer mountol) — újratöltést nem igénylünk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleUpload(fajta: IratKepFajta, ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    // Az input értékét ürítjük, hogy UGYANAZ a fájl újra kiválasztható legyen
    // (pl. sikertelen feltöltés után) — a change-esemény különben nem sülne el.
    ev.target.value = ''
    if (!file) return
    setBusy(fajta)
    const fd = new FormData()
    fd.append('file', file)
    const res = await upload(fajta, fd)
    setBusy(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    if (res.url) {
      const url = res.url
      setKepek((prev) => ({ ...prev, [fajta]: url }))
      toast.success(`${feliratok[fajta]} feltöltve — a nyomtatott iratokra ezentúl rákerül.`)
    }
  }

  async function handleRemove(fajta: IratKepFajta) {
    setBusy(fajta)
    const res = await remove(fajta)
    setBusy(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setKepek((prev) => ({ ...prev, [fajta]: null }))
    toast.success(`${feliratok[fajta]} eltávolítva — a nyomtatványok üres vonallal készülnek.`)
  }

  return (
    <div className="card-raised p-4 bg-amber-50/30 border-amber-200">
      <p className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
        <Stamp className="size-4 text-amber-700" />
        Pecsét és aláírás az iratokra
      </p>
      <p className="text-xs text-slate-500 mb-3">{leiras}</p>
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="size-4 animate-spin" /> Betöltés…
        </p>
      ) : loadError ? (
        <p className="text-xs text-rose-600">{loadError}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(['pecset', 'alairas'] as const).map((fajta) => {
            const url = kepek[fajta]
            const uploading = busy === fajta
            return (
              <div key={fajta} className="rounded-xl border border-slate-200 bg-white/70 p-3">
                <p className="mb-2 text-xs font-medium text-slate-700">{feliratok[fajta]}</p>
                {url ? (
                  <div className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={feliratok[fajta]}
                      className="size-20 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-xs font-medium text-emerald-700">✅ Feltöltve</p>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-indigo-700 hover:text-indigo-900">
                        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                        Másik feltöltése
                        <input
                          type="file"
                          accept="image/png,image/webp"
                          className="hidden"
                          onChange={(ev) => void handleUpload(fajta, ev)}
                          disabled={busy !== null}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleRemove(fajta)}
                        disabled={busy !== null}
                        className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" />
                        Eltávolítás
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-amber-300 bg-white/50 p-4 transition hover:bg-amber-50/40">
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin text-amber-700" />
                    ) : (
                      <Upload className="size-4 text-amber-700" />
                    )}
                    <span className="text-xs font-medium text-amber-800">
                      {uploading ? 'Feltöltés…' : 'Kép feltöltése'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/webp"
                      className="hidden"
                      onChange={(ev) => void handleUpload(fajta, ev)}
                      disabled={busy !== null}
                    />
                  </label>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
