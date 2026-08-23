'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Download, FileJson, Info, Loader2, Package } from 'lucide-react'
import { toast } from 'sonner'

import {
  exportNaplozas,
  exportSzeletBetoltes,
  exportTervBetoltes,
} from '@/app/(dashboard)/profile/adatvedelem-actions'
import type { ExportTervLepes } from '@/app/(dashboard)/profile/adatvedelem-shared'
import {
  CSOMAG_TAJEKOZTATO,
  csomagotOsszeallit,
  exportFajlNev,
  zipTartalom,
  type ExportTablaEredmeny,
  type GyulekezetiExportCsomag,
} from '@/lib/export/gyulekezeti-export'

/**
 * TELJES GYÜLEKEZETI ADATEXPORT — kliens-panel (2026-08-23).
 *
 * MIÉRT SZELETENKÉNT: egy nagy gyülekezetnél ez sok tízezer sor. Egyetlen
 * kérésben ez időtúllépés lenne, és a felhasználó egy néma pörgő ikont nézne.
 * Ezért a panel nyilvántartásonként kér egy szeletet, és MUTATJA, hol tart.
 *
 * A letöltés KLIENS-OLDALI blob — a szerver nem ír fájlt sehová.
 */

type Fazis =
  | { nev: 'betolt' }
  | { nev: 'tiltva'; uzenet: string }
  | { nev: 'keszen' }
  | { nev: 'dolgozik'; kesz: number; osszes: number; eppen: string }
  | { nev: 'kesz'; csomag: GyulekezetiExportCsomag }

interface Terv {
  gyulekezetId: string
  gyulekezetNev: string | null
  keszitetteNev: string | null
  keszitetteEmail: string | null
  lepesek: ExportTervLepes[]
}

function letolt(blob: Blob, nev: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nev
  document.body.appendChild(a)
  a.click()
  a.remove()
  // A böngésző még olvassa a blobot a letöltés indulásakor — késleltetve engedjük el.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function AdatexportPanel() {
  const [fazis, setFazis] = useState<Fazis>({ nev: 'betolt' })
  const [terv, setTerv] = useState<Terv | null>(null)

  useEffect(() => {
    let megszakitva = false
    exportTervBetoltes()
      .then((valasz) => {
        if (megszakitva) return
        if (!valasz.ok) {
          setFazis({ nev: 'tiltva', uzenet: valasz.uzenet })
          return
        }
        setTerv({
          gyulekezetId: valasz.gyulekezetId,
          gyulekezetNev: valasz.gyulekezetNev,
          keszitetteNev: valasz.keszitetteNev,
          keszitetteEmail: valasz.keszitetteEmail,
          lepesek: valasz.lepesek,
        })
        setFazis({ nev: 'keszen' })
      })
      .catch(() => {
        if (!megszakitva) {
          setFazis({
            nev: 'tiltva',
            uzenet: 'Az adatexport most nem érhető el. Frissítsd az oldalt, és próbáld újra.',
          })
        }
      })
    return () => {
      megszakitva = true
    }
  }, [])

  const osszeallit = useCallback(async () => {
    if (!terv) return
    const eredmenyek: ExportTablaEredmeny[] = []
    const osszes = terv.lepesek.length

    for (let i = 0; i < osszes; i++) {
      const lepes = terv.lepesek[i]!
      setFazis({ nev: 'dolgozik', kesz: i, osszes, eppen: lepes.cim })
      try {
        const valasz = await exportSzeletBetoltes(lepes.tabla)
        if (!valasz.ok) {
          // A hatókör időközben elveszett (kijelentkezés, munkatér-váltás) —
          // fail-closed: megállunk, és NEM adunk ki féllábon álló csomagot.
          setFazis({ nev: 'tiltva', uzenet: valasz.uzenet })
          return
        }
        eredmenyek.push(valasz.eredmeny)
      } catch {
        eredmenyek.push({
          tabla: lepes.tabla,
          cim: lepes.cim,
          allapot: 'hiba',
          sorok: [],
          uzenet: `A(z) „${lepes.cim}" nyilvántartás lekérése megszakadt.`,
        })
      }
    }

    const csomag = csomagotOsszeallit({
      gyulekezetId: terv.gyulekezetId,
      gyulekezetNev: terv.gyulekezetNev,
      keszitetteNev: terv.keszitetteNev,
      keszitetteEmail: terv.keszitetteEmail,
      keszult: new Date().toISOString(),
      eredmenyek,
    })
    setFazis({ nev: 'kesz', csomag })

    // A csomag elkészülte maga is adatkezelési esemény — naplózzuk, hogy a
    // betekintés-kimutatásban is látszódjon. A hibáját elnyeljük: a napló nem
    // buktathatja el a felhasználó adatkiadását.
    exportNaplozas(csomag.osszegzes.tablakSzama, csomag.osszegzes.sorokSzama).catch(() => {})
  }, [terv])

  const jsonLetoltes = useCallback((csomag: GyulekezetiExportCsomag) => {
    const blob = new Blob([JSON.stringify(csomag, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    letolt(blob, exportFajlNev(csomag, 'json'))
  }, [])

  const zipLetoltes = useCallback(async (csomag: GyulekezetiExportCsomag) => {
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      for (const bejegyzes of zipTartalom(csomag)) zip.file(bejegyzes.nev, bejegyzes.tartalom)
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      letolt(blob, exportFajlNev(csomag, 'zip'))
    } catch {
      toast.error('A ZIP nem készült el. Töltsd le egyetlen JSON-fájlként.')
    }
  }, [])

  return (
    <section className="card-raised p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
          <Package className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-xl text-slate-800">Teljes gyülekezeti adatexport</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Egy csomagban, géppel olvasható formában (JSON) letöltheted a gyülekezet minden
            nyilvántartását: személyek, családok, anyakönyvek, pénzügyi tételek, leltár, iktató,
            alkalmak. Ez az adathordozhatóság joga — és megszűnés esetén az adatkiadás módja.
          </p>
        </div>
      </div>

      {/* ── Hatókör megtagadva: MAGYARÁZAT, nem hibaoldal ────────────────── */}
      {fazis.nev === 'tiltva' && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <p className="text-sm leading-6 text-amber-900">{fazis.uzenet}</p>
        </div>
      )}

      {fazis.nev === 'betolt' && (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Az export előkészítése…
        </p>
      )}

      {fazis.nev === 'keszen' && terv && (
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            Gyülekezet:{' '}
            <span className="font-medium text-slate-800">
              {terv.gyulekezetNev || 'a saját gyülekezeted'}
            </span>{' '}
            · {terv.lepesek.length} nyilvántartás
          </p>
          <button
            type="button"
            onClick={() => void osszeallit()}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700 sm:w-auto"
          >
            <Download className="size-4" />
            Adatcsomag összeállítása
          </button>
        </div>
      )}

      {fazis.nev === 'dolgozik' && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <Loader2 className="size-4 animate-spin text-teal-600" />
            {fazis.kesz + 1} / {fazis.osszes} — {fazis.eppen}
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-teal-600 transition-all"
              style={{ width: `${Math.round((fazis.kesz / Math.max(fazis.osszes, 1)) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Nagy gyülekezetnél ez néhány percig is eltarthat. Hagyd nyitva az oldalt.
          </p>
        </div>
      )}

      {fazis.nev === 'kesz' && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-sm font-semibold text-emerald-900">A csomag elkészült.</p>
            <p className="mt-1 text-sm leading-6 text-emerald-900">
              {fazis.csomag.osszegzes.tablakSzama} nyilvántartás ·{' '}
              {fazis.csomag.osszegzes.sorokSzama.toLocaleString('hu-HU')} sor.
            </p>
            {fazis.csomag.osszegzes.hianyzoTablak.length > 0 && (
              <p className="mt-2 text-xs leading-5 text-emerald-900/80">
                Nem került a csomagba (a modul még nincs bekapcsolva):{' '}
                {fazis.csomag.osszegzes.hianyzoTablak.join(', ')}.
              </p>
            )}
            {fazis.csomag.osszegzes.hibasTablak.length > 0 && (
              <p className="mt-2 text-xs leading-5 text-amber-900">
                Hibával zárult: {fazis.csomag.osszegzes.hibasTablak.join(', ')} — a részletes
                magyarázat a csomagban, az adott nyilvántartás „uzenet" mezőjében olvasható.
              </p>
            )}
            {fazis.csomag.osszegzes.csonkoltTablak.length > 0 && (
              <p className="mt-2 text-xs leading-5 text-amber-900">
                Sor-korlát miatt csonka: {fazis.csomag.osszegzes.csonkoltTablak.join(', ')}.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void zipLetoltes(fazis.csomag)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
            >
              <Package className="size-4" />
              Letöltés ZIP-ben
            </button>
            <button
              type="button"
              onClick={() => jsonLetoltes(fazis.csomag)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileJson className="size-4" />
              Letöltés egy JSON-fájlban
            </button>
          </div>
        </div>
      )}

      {/* ── Ami NINCS a csomagban — kimondva ─────────────────────────────── */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Info className="size-3.5" />
          Jó tudni
        </p>
        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600">
          {CSOMAG_TAJEKOZTATO.map((sor) => (
            <li key={sor} className="flex gap-2">
              <span aria-hidden="true">·</span>
              <span>{sor}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
