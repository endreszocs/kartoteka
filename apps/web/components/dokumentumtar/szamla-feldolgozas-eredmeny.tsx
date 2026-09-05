'use client'

/**
 * Számla-feldolgozás eredmény-panel (7. pont C szelet) — KÖZÖS komponens.
 *
 * A feldolgozSzamlaZipDokumentum action SzamlaFeldolgozasEredmeny összegzését
 * mutatja meg tételesen: új számlák, duplikátumok (fájl-pótlással), kihagyott
 * bejegyzések és HANGOS hibák. Két helyről használt (közös helper, nem
 * másolat): a feltöltő dialógus (ZIP feltöltése után azonnal) és a
 * dokumentumtár-lista „Számla-feldolgozás" sor-művelete.
 */

import { AlertTriangle, CheckCircle2, CopyCheck, Info } from 'lucide-react'

import type { SzamlaFeldolgozasEredmeny } from '@/lib/dokumentumtar/szamla-types'
import { formatOsszeg } from '@/lib/dokumentumtar/kifizetetlen-types'

interface SzamlaFeldolgozasEredmenyPanelProps {
  eredmeny: SzamlaFeldolgozasEredmeny
}

export function SzamlaFeldolgozasEredmenyPanel({ eredmeny }: SzamlaFeldolgozasEredmenyPanelProps) {
  const { ujSzamlak, duplikatumok, kihagyott, hibak } = eredmeny
  const semmi =
    ujSzamlak.length === 0 && duplikatumok.length === 0 && kihagyott.length === 0 && hibak.length === 0

  return (
    <div className="space-y-3">
      {/* Összegző sor — egy pillantásra látszik az eredmény */}
      <div className="flex flex-wrap gap-1.5 text-xs font-medium">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
          {ujSzamlak.length} új számla
        </span>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
          {duplikatumok.length} duplikátum
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
          {kihagyott.length} kihagyott
        </span>
        <span
          className={`rounded-full px-2.5 py-1 ${
            hibak.length > 0 ? 'bg-destructive/10 text-destructive' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {hibak.length} hiba
        </span>
      </div>

      {semmi ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          A feldolgozás nem talált számla-tartalmat a fájlban.
        </p>
      ) : null}

      {ujSzamlak.length > 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Új számla-adatalapok
          </p>
          <ul className="space-y-0.5 text-xs text-emerald-900">
            {ujSzamlak.map((u, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="font-medium">{u.szallitoNev || 'Ismeretlen szállító'}</span>
                <span>· {u.szamlaSzam || u.fajlnev}</span>
                <span className="font-semibold">· {formatOsszeg(u.osszeg, u.penznem)}</span>
                {!u.pdfCsatolva ? <span className="text-emerald-700/70">(PDF nélkül)</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {duplikatumok.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <CopyCheck className="size-3.5" aria-hidden />
            Már korábban rögzített számlák (nem duplikáltuk)
          </p>
          <ul className="space-y-0.5 text-xs text-amber-900">
            {duplikatumok.map((d, i) => (
              <li key={i}>
                {d.szamlaSzam || d.fajlnev}
                {d.fajlPotolva ? ' — a hiányzó fájl-hivatkozást most pótoltuk' : ''}
                {d.regiKulcs ? ' — korábbi azonosítóval már rögzítve (nem duplikáltuk)' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {kihagyott.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Info className="size-3.5" aria-hidden />
            Kihagyott bejegyzések
          </p>
          <ul className="space-y-0.5 text-xs text-slate-600">
            {kihagyott.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {hibak.length > 0 ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2" role="alert">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <AlertTriangle className="size-3.5" aria-hidden />
            Hibák — ezek a tételek NEM kerültek be
          </p>
          <ul className="space-y-0.5 text-xs text-destructive">
            {hibak.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
