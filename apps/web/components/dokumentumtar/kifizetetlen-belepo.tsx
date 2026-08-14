'use client'

/**
 * „Kifizetetlen számlák" belépő-sáv a Dokumentumtár oldalon (7. pont C szelet).
 *
 * Jól látható belépés a kifizetetlen-ablakba, élő szám-jelvénnyel: hány
 * kifizetetlen tétel van, és ebből hány LEJÁRT határidejű (pirossal). A
 * számokat ugyanaz a getKifizetetlenSzamlak action adja, mint magát az
 * ablakot — így a jelvény és a lista SOSEM mond mást (az Oblio-rész 60 mp-es
 * cache-én osztoznak). Ha valamelyik forrás hibázik, a jelvény ezt is jelzi
 * (nem mutat némán kevesebbet).
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronRight, Loader2, ReceiptText } from 'lucide-react'

import {
  lejartE,
  maiIsoDatum,
  type KifizetetlenEredmeny,
} from '@/lib/dokumentumtar/kifizetetlen-types'
import { getKifizetetlenSzamlak } from '@/app/(dashboard)/dokumentumtar/kifizetetlen-actions'

export function KifizetetlenBelepo() {
  const router = useRouter()
  const [eredmeny, setEredmeny] = useState<KifizetetlenEredmeny | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void getKifizetetlenSzamlak()
      .then((res) => {
        if (cancelled) return
        setEredmeny(res)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        // Váratlan hiba — a belépő attól még működik, a jelvény helyén jelzés.
        setEredmeny(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const ma = maiIsoDatum()
  const osszes = eredmeny?.tetelek.length ?? 0
  const lejart = eredmeny?.tetelek.filter((t) => lejartE(t.fizetesiHatarido, ma)).length ?? 0
  const forrasHiba = !!(eredmeny?.helyiHiba || eredmeny?.oblioHiba)

  return (
    <button
      type="button"
      onClick={() => router.push('/dokumentumtar/kifizetetlen')}
      className={`card-raised flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition sm:p-4 ${
        lejart > 0
          ? 'border-rose-300 ring-1 ring-rose-200 hover:border-rose-400'
          : 'border-transparent hover:border-slate-200'
      }`}
      aria-label="Kifizetetlen számlák megnyitása"
    >
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          lejart > 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
        }`}
      >
        <ReceiptText className="size-5" strokeWidth={1.8} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">Kifizetetlen számlák</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
          A még rendezetlen szállítói számlák és — Oblio-kapcsolattal — a be nem folyt kiállított
          számlák, lejárat szerint.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {loading ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            betöltés…
          </span>
        ) : eredmeny === null ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            <AlertTriangle className="size-3" aria-hidden />
            nem elérhető
          </span>
        ) : (
          <>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              {osszes} kifizetetlen
            </span>
            {lejart > 0 ? (
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                {lejart} lejárt
              </span>
            ) : null}
            {forrasHiba ? (
              <span
                className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-1 text-amber-700"
                title="Az egyik forrás most nem elérhető — a szám lehet, hogy nem teljes. Részletek az ablakban."
              >
                <AlertTriangle className="size-3" aria-hidden />
              </span>
            ) : null}
          </>
        )}
        <ChevronRight className="size-4 text-slate-400" aria-hidden />
      </div>
    </button>
  )
}
