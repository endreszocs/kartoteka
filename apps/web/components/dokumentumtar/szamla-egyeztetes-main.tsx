'use client'

/**
 * Számlák egyeztetése — FŐNÉZET (Endre 2026-08-28-i UX-köre).
 *
 * Endre kérése szó szerint: „a webes felület esetén a feltöltés oldal
 * jelenjen meg először és a feltöltött számlákon már látszódjon hogy
 * melyiknek van meg a társa a könyvelésből és hogy hol (bank vagy kassza) —
 * nem kell külön párosítatlan számlák fül mert ott látszik […] Legyen sokkal
 * szembetűnőbb hol kell feltölteni, nagyon zsúfolt az oldal legyen
 * lényegretörőbb a dizájn!"
 *
 * Ezért:
 *  - FELÜL egy nagy, szembetűnő feltöltő-sáv (ZIP/XML/PDF — az ANAF SPV
 *    tömeges ZIP-je is), amely a meglévő feldolgozóra épül;
 *  - alatta a feltöltött számlák EGYETLEN listája, soronként a könyvelési
 *    párosítás jelzőjével: „Könyvelve — Kassza" / „Könyvelve — <bank>" /
 *    „Nincs a könyvelésben" + Kapcsolás;
 *  - a kifizetve-állapot ugyanitt billenthető (a külön „Kifizetetlen
 *    számlák" fül megszűnt — a lejárt határidő pirossal látszik);
 *  - a „Megnyitás" a szépen formázott, nyomtatható számla-nézetet nyitja
 *    új fülön (nem a nyers XML-t).
 *
 * A mappa-alapú Oblio-egyeztetés az ASZTALI programban él (Endre döntése) —
 * itt csak egy csendes hivatkozás mutat rá.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FolderOpen,
  Link2,
  Loader2,
  Monitor,
  Printer,
  Search,
  UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  listSzallitoiSzamlak,
  listSzamlaParositasok,
  setSzamlaKifizetve,
} from '@/app/(dashboard)/dokumentumtar/szamla-actions'
import { getDokumentumUrl } from '@/app/(dashboard)/dokumentumtar/actions'
import type {
  SzallitoiSzamla,
  SzamlaParositasBejegyzes,
} from '@/lib/dokumentumtar/szamla-types'
import type { KifizetetlenTetel } from '@/lib/dokumentumtar/kifizetetlen-types'
import { DokumentumtarUploadDialog } from '@/components/dokumentumtar/dokumentumtar-upload-dialog'
import { SzamlaKapcsolasDialog } from '@/components/dokumentumtar/szamla-kapcsolas-dialog'

const OLDAL_MERET = 30

type Szuro = 'mind' | 'konyveletlen' | 'kifizetetlen'

function datumSzoveg(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('hu-HU')
}

function osszegSzoveg(osszeg: number, penznem: string): string {
  return `${osszeg.toLocaleString('hu-HU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${penznem}`
}

interface SzamlaEgyeztetesMainProps {
  congregationName: string
}

export function SzamlaEgyeztetesMain({ congregationName }: SzamlaEgyeztetesMainProps) {
  const [rows, setRows] = useState<SzallitoiSzamla[]>([])
  const [osszesen, setOsszesen] = useState(0)
  const [oldal, setOldal] = useState(1)
  const [kereses, setKereses] = useState('')
  const [szuro, setSzuro] = useState<Szuro>('mind')
  const [parositasok, setParositasok] = useState<Record<string, SzamlaParositasBejegyzes[]>>({})
  const [loading, setLoading] = useState(true)
  const [listaHiba, setListaHiba] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    // 2026-08-28 hibaosztály-tanulság: a kivétel is a hangos hiba-panelre
    // fut, sosem örök „Betöltés…" (try/catch/finally).
    try {
      const lista = await listSzallitoiSzamlak({
        oldal,
        oldalMeret: OLDAL_MERET,
        kereses: kereses || null,
        kifizetve: szuro === 'kifizetetlen' ? false : undefined,
      })
      if (lista.error) {
        setListaHiba(lista.error)
        return
      }
      const par = await listSzamlaParositasok(lista.rows.map((r) => r.id))
      // A párosítás-hiba NEM rejti el a listát — de hangosan látszik.
      setListaHiba(par.error)
      setRows(lista.rows)
      setOsszesen(lista.osszesen)
      setParositasok(par.data)
    } catch (e) {
      setListaHiba(
        `A számlák betöltése váratlan hibával állt le (${
          e instanceof Error ? e.message : 'ismeretlen hiba'
        }) — ellenőrizd az internetkapcsolatot, és nyomd meg az Újrapróbálást.`,
      )
    } finally {
      setLoading(false)
    }
  }, [oldal, kereses, szuro])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(t)
  }, [load])

  // ── Feltöltés (dropzone + fájlválasztó) — a meglévő feldolgozóra épül ──
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)

  function openUploadWith(files: File[]) {
    if (files.length === 0) return
    setPendingFiles(files)
    setUploadOpen(true)
  }

  // ── Kapcsolás-dialógus (a meglévő SzamlaKapcsolasDialog) ──
  const [kapcsolasSzamla, setKapcsolasSzamla] = useState<KifizetetlenTetel | null>(null)

  function kapcsolasTetel(r: SzallitoiSzamla): KifizetetlenTetel {
    return {
      forras: 'helyi',
      irany: 'fizetendo',
      szamlaId: r.id,
      tipus: r.tipus,
      partnerNev: r.szallito_nev,
      szamlaSzam: r.szamla_szam,
      kiallitasDatum: r.kiallitas_datum,
      fizetesiHatarido: r.fizetesi_hatarido,
      osszeg: r.osszeg,
      penznem: r.penznem,
      pdfDokumentumId: r.pdf_dokumentum_id,
      xmlDokumentumId: r.xml_dokumentum_id,
      pdfUrl: null,
      megjegyzes: r.megjegyzes,
    }
  }

  // ── Kifizetve-váltó ──
  const [busyId, setBusyId] = useState<string | null>(null)
  async function toggleKifizetve(r: SzallitoiSzamla) {
    setBusyId(r.id)
    try {
      const res = await setSzamlaKifizetve(r.id, !r.kifizetve)
      if (!res.success) {
        toast.error(res.error || 'A kifizetve-állapot mentése sikertelen.')
        return
      }
      void load()
    } finally {
      setBusyId(null)
    }
  }

  // ── PDF-megnyitás (signed URL, popup-barát szinkron ablaknyitással) ──
  const [openingId, setOpeningId] = useState<string | null>(null)
  function openPdf(r: SzallitoiSzamla) {
    if (!r.pdf_dokumentum_id) return
    const win = window.open('', '_blank')
    setOpeningId(r.id)
    void getDokumentumUrl(r.pdf_dokumentum_id, false).then(({ url, error }) => {
      setOpeningId(null)
      if (error || !url) {
        try {
          win?.close()
        } catch {
          /* ignore */
        }
        toast.error(error || 'A PDF megnyitása sikertelen.')
        return
      }
      if (win) win.location.href = url
      else window.open(url, '_blank', 'noopener')
    })
  }

  const ma = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const megjelenitett = useMemo(() => {
    if (szuro !== 'konyveletlen') return rows
    // 2026-09-03 (átvilágítás P1): a HALOTT kapcsolat (sztornózott/törölt
    // kiadás) nem számít könyvelésnek — a számla maradjon a „Nincs a
    // könyvelésben" szűrőben, különben némán kiesne a látókörből.
    return rows.filter((r) => !(parositasok[r.id] ?? []).some((p) => !p.ervenytelen))
  }, [rows, szuro, parositasok])

  const utolsoOldal = Math.max(1, Math.ceil(osszesen / OLDAL_MERET))

  return (
    <div className="space-y-4">
      {/* ── 1. FELTÖLTÉS — nagy, szembetűnő sáv (Endre: „legyen sokkal
          szembetűnőbb hol kell feltölteni") ── */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          openUploadWith(Array.from(e.dataTransfer.files || []))
        }}
        className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
          dragActive
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-emerald-300 bg-emerald-50/50 hover:border-emerald-400 hover:bg-emerald-50'
        }`}
      >
        <UploadCloud className="size-9 text-emerald-600" aria-hidden />
        <span className="text-base font-semibold text-emerald-900">
          Számlák feltöltése — húzd ide, vagy kattints
        </span>
        <span className="max-w-xl text-sm text-emerald-800/80">
          Az ANAF SPV-ből letöltött tömeges ZIP, e-Factura XML vagy számla-PDF. A rendszer a
          számla-adatlapokat magától elkészíti, és a lentebb lévő listában azonnal látszik,
          melyik számlának van meg a párja a könyvelésben.
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".zip,.xml,.pdf"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          e.target.value = ''
          openUploadWith(files)
        }}
      />

      {/* ── 2. Kereső + szűrők — egyetlen tömör sor ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={kereses}
            onChange={(e) => {
              setKereses(e.target.value)
              setOldal(1)
            }}
            placeholder="Keresés szállító vagy számlaszám szerint…"
            className="pl-9"
          />
        </div>
        <div className="flex overflow-hidden rounded-xl border border-slate-200">
          {(
            [
              ['mind', 'Mind'],
              ['konyveletlen', 'Nincs a könyvelésben'],
              ['kifizetetlen', 'Kifizetetlen'],
            ] as const
          ).map(([ertek, cimke]) => (
            <button
              key={ertek}
              type="button"
              onClick={() => {
                setSzuro(ertek)
                setOldal(1)
              }}
              className={`px-3 py-1.5 text-sm transition ${
                szuro === ertek
                  ? 'bg-emerald-600 font-medium text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cimke}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-500">{osszesen} számla</span>
      </div>

      {/* ── 3. A lista ── */}
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Számlák betöltése…
        </div>
      ) : listaHiba ? (
        <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3">
          <p className="text-xs font-semibold text-destructive">A számlák nem tölthetők be</p>
          <p className="text-xs text-destructive">{listaHiba}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Újrapróbálás
          </Button>
        </div>
      ) : megjelenitett.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
          <FolderOpen className="size-8 text-slate-400" aria-hidden />
          <p className="text-sm font-medium text-slate-600">
            {szuro === 'mind' && !kereses
              ? 'Még nincs feltöltött számla — kezdd a fenti feltöltéssel.'
              : 'Nincs a szűrésnek megfelelő számla.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {megjelenitett.map((r) => {
            const osszesPar = parositasok[r.id] ?? []
            // Élő vs. HALOTT kapcsolat (a kapcsolt kiadást sztornózták/törölték).
            const parok = osszesPar.filter((p) => !p.ervenytelen)
            const halottParok = osszesPar.filter((p) => p.ervenytelen)
            const lejart = !r.kifizetve && !!r.fizetesi_hatarido && r.fizetesi_hatarido < ma
            const helyek = [...new Set(parok.map((p) => p.bankNev ?? 'Kassza'))]
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="min-w-52 flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    {r.szallito_nev || 'Ismeretlen szállító'}
                    {r.tipus === 'jovairo' && (
                      <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                        jóváíró
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.szamla_szam || '—'} · {datumSzoveg(r.kiallitas_datum)}
                    {r.fizetesi_hatarido && (
                      <>
                        {' · határidő: '}
                        <span className={lejart ? 'font-semibold text-red-600' : undefined}>
                          {datumSzoveg(r.fizetesi_hatarido)}
                          {lejart ? ' (lejárt!)' : ''}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="text-sm font-semibold tabular-nums text-slate-800">
                  {osszegSzoveg(r.osszeg, r.penznem)}
                </div>

                {/* 2026-09-03 (átvilágítás P1): HALOTT KAPCSOLAT jelzése.
                    A kapcsolt kiadást sztornózták vagy törölték — a számla
                    eddig csendben „Könyvelve" és „Kifizetve" maradt, sőt a
                    nyomtatott adatlapra is rákerült. Most pirosan szól, és a
                    kattintás egyenesen a kapcsolás-ablakba visz, ahol bontható. */}
                {halottParok.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setKapcsolasSzamla(kapcsolasTetel(r))}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-100"
                    title="A hozzákapcsolt kiadást sztornózták vagy törölték. Bontsd a kapcsolatot, és ha a számla valójában nincs kifizetve, vedd le a „Kifizetve” jelölést is."
                  >
                    <AlertCircle className="size-3.5" aria-hidden />
                    {halottParok.length === 1
                      ? 'A kapcsolt kiadás sztornózva — bontsd'
                      : `${halottParok.length} kapcsolt kiadás sztornózva — bontsd`}
                    <Link2 className="size-3.5" aria-hidden />
                  </button>
                )}

                {/* Párosítás-jelző: hol van a könyvelésben? */}
                {parok.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    Könyvelve — {helyek.join(', ')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setKapcsolasSzamla(kapcsolasTetel(r))}
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
                    title="Kapcsold a számlát a könyvelés egy kiadás-tételéhez"
                  >
                    <AlertCircle className="size-3.5" aria-hidden />
                    Nincs a könyvelésben
                    <Link2 className="size-3.5" aria-hidden />
                  </button>
                )}

                {/* Kifizetve-váltó */}
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={r.kifizetve}
                    disabled={busyId === r.id}
                    onChange={() => void toggleKifizetve(r)}
                    className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Kifizetve
                </label>

                {/* Műveletek */}
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/dokumentumtar/szamla/${r.id}`, '_blank', 'noopener')}
                    title="Szépen formázott, nyomtatható számla-nézet új fülön"
                  >
                    <Printer className="mr-1.5 size-3.5" aria-hidden />
                    Megnyitás
                  </Button>
                  {r.pdf_dokumentum_id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={openingId === r.id}
                      onClick={() => openPdf(r)}
                      title="Az eredeti számla-PDF megnyitása"
                    >
                      <FileText className="mr-1.5 size-3.5" aria-hidden />
                      PDF
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Lapozó */}
      {!loading && !listaHiba && osszesen > OLDAL_MERET && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={oldal <= 1}
            onClick={() => setOldal((o) => Math.max(1, o - 1))}
          >
            Előző
          </Button>
          <span className="text-slate-500">
            {oldal} / {utolsoOldal}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={oldal >= utolsoOldal}
            onClick={() => setOldal((o) => Math.min(utolsoOldal, o + 1))}
          >
            Következő
          </Button>
        </div>
      )}

      {/* A mappa-alapú Oblio-egyeztetés desktopra való (Endre döntése). */}
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Monitor className="size-3.5" aria-hidden />
        A mappa-alapú Oblio-egyeztetés az asztali Kartotéka programban érhető el — a webes
        felület a feltöltött számlákkal dolgozik.
      </p>

      {/* Dialógusok */}
      <DokumentumtarUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        files={pendingFiles}
        defaultKategoria="szallitoi-szamlak"
        onUploaded={() => void load()}
      />
      <SzamlaKapcsolasDialog
        open={kapcsolasSzamla !== null}
        onOpenChange={(next) => {
          if (!next) setKapcsolasSzamla(null)
        }}
        szamla={kapcsolasSzamla}
        onChanged={() => void load()}
      />
      {/* A gyülekezet neve a fejlécből jön — itt csak a hozzáférés jelzésére. */}
      <span className="sr-only">{congregationName}</span>
    </div>
  )
}
