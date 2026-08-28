'use client'

/**
 * Dokumentumtár — fő felület (7. pont A szelet).
 *
 * Endre explicit kérése: „legyen szép átlátható és egyértelmű felülete" +
 * telefonon is tökéletes (mobile-first követelmény). A design a meglévő
 * nyelvet követi (ModuleHero, card-raised, emerald/teal, rounded-2xl —
 * az inventory-main-v3 mintája).
 *
 * Felépítés:
 *  - hero (cím + kiemelt Feltöltés gomb + gyülekezet-chip),
 *  - kategória-kártyák (4 mappa, élő darabszámmal, kattintva szűr),
 *  - eszközsor: keresés + dátum szerinti rendezés + Kuka-nézet,
 *  - drag-and-drop feltöltő sáv + lapozott fájl-lista,
 *  - törlés a Kuka mintájára KÉTLÉPCSŐS: előbb Kukába (visszaállítható),
 *    onnan végleges törlés külön, hangos megerősítéssel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArchiveRestore,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Building2,
  ClipboardList,
  Download,
  ExternalLink,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileSignature,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  FolderUp,
  Loader2,
  Receipt,
  ScanSearch,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyFirstRecord } from '@/components/ui/empty-first-record'
import { Input } from '@/components/ui/input'
import { ModuleHero } from '@/components/shared/module-hero'
import { AdminConfirmDialog } from '@/components/admin/admin-confirm-dialog'
import { DokumentumtarUploadDialog } from '@/components/dokumentumtar/dokumentumtar-upload-dialog'
import { KifizetetlenBelepo } from '@/components/dokumentumtar/kifizetetlen-belepo'
import { SzamlaFeldolgozasEredmenyPanel } from '@/components/dokumentumtar/szamla-feldolgozas-eredmeny'
import type { SzamlaFeldolgozasEredmeny } from '@/lib/dokumentumtar/szamla-types'
import { feldolgozSzamlaZipDokumentum } from '@/app/(dashboard)/dokumentumtar/szamla-actions'
import {
  GYDOK_ACCEPT_ATTR,
  GYDOK_ALLOWED_TYPES_LEIRAS,
  GYDOK_KATEGORIAK,
  formatBytes,
  gydokKategoriaLabel,
  isGydokKategoria,
  type GydokKategoria,
  type GyulekezetiDokumentum,
} from '@/lib/dokumentumtar/dokumentum-types'
import {
  getDokumentumKategoriaSzamok,
  getDokumentumUrl,
  listDokumentumok,
  purgeDokumentum,
  restoreDokumentum,
  softDeleteDokumentum,
} from '@/app/(dashboard)/dokumentumtar/actions'

const OLDAL_MERET = 20

/** Nézet: minden élő dokumentum / egy kategória / a Kuka. */
type Nezet = 'osszes' | 'kuka' | GydokKategoria

// Kategória-kártya színei + ikonjai — a dashboard paletta tónusaival.
const KATEGORIA_STILUS: Record<
  GydokKategoria,
  { icon: typeof Receipt; badge: string; activeRing: string }
> = {
  'szallitoi-szamlak': {
    icon: Receipt,
    badge: 'bg-cyan-50 text-cyan-700',
    activeRing: 'border-cyan-500 ring-1 ring-cyan-500',
  },
  bizonylatok: {
    icon: ClipboardList,
    badge: 'bg-amber-50 text-amber-700',
    activeRing: 'border-amber-500 ring-1 ring-amber-500',
  },
  szerzodesek: {
    icon: FileSignature,
    badge: 'bg-violet-50 text-violet-700',
    activeRing: 'border-violet-500 ring-1 ring-violet-500',
  },
  egyeb: {
    icon: FolderOpen,
    badge: 'bg-teal-50 text-teal-700',
    activeRing: 'border-teal-500 ring-1 ring-teal-500',
  },
}

/** Fájltípus-ikon + tónus a MIME alapján (a lista soraihoz). */
function fajlIkon(mime: string | null): { Icon: typeof File; cls: string } {
  const m = mime || ''
  if (m === 'application/pdf') return { Icon: FileText, cls: 'bg-red-50 text-red-600' }
  if (m.startsWith('image/')) return { Icon: FileImage, cls: 'bg-sky-50 text-sky-600' }
  if (m === 'application/xml' || m === 'text/xml')
    return { Icon: FileCode2, cls: 'bg-emerald-50 text-emerald-700' }
  if (m === 'application/zip' || m === 'application/x-zip-compressed')
    return { Icon: FileArchive, cls: 'bg-amber-50 text-amber-700' }
  if (
    m === 'application/vnd.ms-excel' ||
    m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    m === 'application/vnd.oasis.opendocument.spreadsheet' ||
    m === 'text/csv'
  )
    return { Icon: FileSpreadsheet, cls: 'bg-green-50 text-green-700' }
  if (
    m === 'application/msword' ||
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    m === 'application/vnd.oasis.opendocument.text' ||
    m === 'text/plain'
  )
    return { Icon: FileText, cls: 'bg-blue-50 text-blue-700' }
  return { Icon: File, cls: 'bg-slate-100 text-slate-600' }
}

function datumSzoveg(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('hu-HU')
}

interface DokumentumtarMainProps {
  congregationName: string
  /**
   * Endre 2026-08-15: a „Számlák egyeztetése" hubba ágyazva a Kifizetetlen
   * számlák belépő NE külön oldalra navigáljon, hanem a hub fülét váltsa
   * (a felhasználó ne „essen ki" a hubból). Ha nincs megadva, marad a
   * /dokumentumtar/kifizetetlen oldalra navigálás (önálló használat).
   */
  onOpenKifizetetlen?: () => void
}

export function DokumentumtarMain({ congregationName, onOpenKifizetetlen }: DokumentumtarMainProps) {
  // ── Nézet + szűrők ───────────────────────────────────────────
  const [nezet, setNezet] = useState<Nezet>('osszes')
  const [keresesInput, setKeresesInput] = useState('')
  const [kereses, setKereses] = useState('')
  const [irany, setIrany] = useState<'asc' | 'desc'>('desc')
  const [oldal, setOldal] = useState(1)

  // Keresés-debounce (300 ms) — ne fusson lekérdezés minden billentyűre.
  useEffect(() => {
    const t = window.setTimeout(() => setKereses(keresesInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [keresesInput])

  // Nézet/keresés/rendezés váltásakor vissza az 1. oldalra.
  // (setTimeout 0: a szinkron setState az effect törzsében kaszkád-render
  // lint-hibát ad — a repó bevett mintája, vö. auth-gate.tsx.)
  useEffect(() => {
    const t = window.setTimeout(() => setOldal(1), 0)
    return () => window.clearTimeout(t)
  }, [nezet, kereses, irany])

  // ── Lista + összesítés betöltése ─────────────────────────────
  const [rows, setRows] = useState<GyulekezetiDokumentum[]>([])
  const [osszesen, setOsszesen] = useState(0)
  const [szamok, setSzamok] = useState<Record<string, number>>({})
  const [kukaSzam, setKukaSzam] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listaHiba, setListaHiba] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    // 2026-08-28 (Endre hibajelzése, élesben elsült): ha az akció-hívás maga
    // DOB (hálózat-kiesés, deploy-váltás közbeni "Failed to fetch"), a
    // setLoading(false) sosem futott le — a lista ÖRÖKRE a „Dokumentumok
    // betöltése…" feliraton ragadt, hiba-jelzés nélkül. A kivétel most a
    // meglévő hangos hiba-panelre (+ Újrapróbálás) fut.
    try {
      const [lista, osszesites] = await Promise.all([
        listDokumentumok({
          kategoria: isGydokKategoria(nezet) ? nezet : null,
          kuka: nezet === 'kuka',
          kereses: kereses || null,
          oldal,
          oldalMeret: OLDAL_MERET,
          irany,
        }),
        getDokumentumKategoriaSzamok(),
      ])
      // FAIL-CLOSED: a hibát hangosan mutatjuk a lista helyén, nem nyeljük el.
      setListaHiba(lista.error || osszesites.error)
      setRows(lista.rows)
      setOsszesen(lista.osszesen)
      setSzamok(osszesites.szamok)
      setKukaSzam(osszesites.kukaSzam)
    } catch (e) {
      setListaHiba(
        `A dokumentumtár betöltése váratlan hibával állt le (${
          e instanceof Error ? e.message : 'ismeretlen hiba'
        }) — ellenőrizd az internetkapcsolatot, és nyomd meg az Újrapróbálást.`,
      )
    } finally {
      setLoading(false)
    }
  }, [nezet, kereses, oldal, irany])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(t)
  }, [load])

  const osszesElo = useMemo(
    () => GYDOK_KATEGORIAK.reduce((sum, k) => sum + (szamok[k.key] || 0), 0),
    [szamok],
  )

  // ── Feltöltés (fájlválasztó + drag-and-drop) ─────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)

  function openUploadWith(files: File[]) {
    if (files.length === 0) return
    setPendingFiles(files)
    setUploadOpen(true)
  }

  function handleFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // ugyanaz a fájl újra kiválasztható legyen
    openUploadWith(files)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    if (nezet === 'kuka') return // a Kukába nem lehet feltölteni
    openUploadWith(Array.from(e.dataTransfer.files || []))
  }

  // ── Megnyitás / letöltés (signed URL) ────────────────────────
  const [openingId, setOpeningId] = useState<string | null>(null)
  function handleOpen(item: GyulekezetiDokumentum) {
    // Az ablakot SZINKRON nyitjuk (még a kattintás kontextusában), különben a
    // popup-blokkoló elnyelheti az async válasz utáni window.open-t.
    const win = window.open('', '_blank')
    setOpeningId(item.id)
    void getDokumentumUrl(item.id, false).then(({ url, error }) => {
      setOpeningId(null)
      if (error || !url) {
        try {
          win?.close()
        } catch {
          /* ignore */
        }
        toast.error(error || 'A megnyitási link készítése sikertelen.')
        return
      }
      if (win) win.location.href = url
      else window.open(url, '_blank', 'noopener')
    })
  }

  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  async function handleDownload(item: GyulekezetiDokumentum) {
    setDownloadingId(item.id)
    const { url, error } = await getDokumentumUrl(item.id, true)
    setDownloadingId(null)
    if (error || !url) {
      toast.error(error || 'A letöltési link készítése sikertelen.')
      return
    }
    // A signed URL Content-Disposition: attachment fejlécet kap (eredeti
    // fájlnévvel) — a láthatatlan link-kattintás letöltést indít, nem navigál.
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // ── Törlés (Kukába) / visszaállítás / végleges törlés ────────
  const [kukaConfirm, setKukaConfirm] = useState<GyulekezetiDokumentum | null>(null)
  const [purgeConfirm, setPurgeConfirm] = useState<GyulekezetiDokumentum | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // ── 7C: számla-(újra)feldolgozás a listából — a „Szállítói számlák"
  //    mappa ZIP/XML fájljaira. Az újrafeldolgozás ön-gyógyító: a korábbi,
  //    félbeszakadt futás hiányzó fájl-hivatkozásait pótolja (B szelet).
  const [feldolgozoId, setFeldolgozoId] = useState<string | null>(null)
  const [feldolgozasEredmeny, setFeldolgozasEredmeny] = useState<{
    fileName: string
    eredmeny: SzamlaFeldolgozasEredmeny
  } | null>(null)

  function szamlaFeldolgozhato(item: GyulekezetiDokumentum): boolean {
    if (item.deleted || item.kategoria !== 'szallitoi-szamlak') return false
    const n = item.file_name.toLowerCase()
    return n.endsWith('.zip') || n.endsWith('.xml')
  }

  async function handleSzamlaFeldolgozas(item: GyulekezetiDokumentum) {
    setFeldolgozoId(item.id)
    const { eredmeny, error } = await feldolgozSzamlaZipDokumentum(item.id)
    setFeldolgozoId(null)
    if (error || !eredmeny) {
      // FAIL-CLOSED: az action-hiba hangos toast — nincs néma no-op.
      toast.error(error || 'A számla-feldolgozás ismeretlen hibával leállt.')
      return
    }
    setFeldolgozasEredmeny({ fileName: item.file_name, eredmeny })
    void load()
  }

  async function handleKukaba() {
    if (!kukaConfirm) return
    setBusyId(kukaConfirm.id)
    const { error } = await softDeleteDokumentum(kukaConfirm.id)
    setBusyId(null)
    setKukaConfirm(null)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('A dokumentum a Kukába került — a Kuka nézetből visszaállítható.')
    void load()
  }

  async function handleRestore(item: GyulekezetiDokumentum) {
    setBusyId(item.id)
    const { error } = await restoreDokumentum(item.id)
    setBusyId(null)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('A dokumentum visszaállítva.')
    void load()
  }

  async function handlePurge() {
    if (!purgeConfirm) return
    setBusyId(purgeConfirm.id)
    const { error } = await purgeDokumentum(purgeConfirm.id)
    setBusyId(null)
    setPurgeConfirm(null)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('A dokumentum véglegesen törölve.')
    void load()
  }

  // ── Lapozás ──────────────────────────────────────────────────
  const utolsoOldal = Math.max(1, Math.ceil(osszesen / OLDAL_MERET))
  const tolIndex = osszesen === 0 ? 0 : (oldal - 1) * OLDAL_MERET + 1
  const igIndex = Math.min(oldal * OLDAL_MERET, osszesen)

  const kukaNezet = nezet === 'kuka'
  const aktivKategoria: GydokKategoria | null = isGydokKategoria(nezet) ? nezet : null

  return (
    <div className="space-y-4">
      {/* Rejtett fájlválasztó — a hero-gomb, a dropzone-gomb és az üres-állapot
          CTA-ja is ezt nyitja. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={GYDOK_ACCEPT_ATTR}
        multiple
        onChange={handleFilesPicked}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      <ModuleHero
        eyebrow="Dokumentumtár"
        title="Gyülekezeti fájl-terület"
        description="Szállítói számlák, bizonylatok, szerződések és egyéb iratok biztonságos tárolása — gyülekezethez kötve, rendezett mappákban. A befogadott számlákat a törvény szerint 5–10 évig meg kell őrizni: ez a tár erre való."
        pills={[
          { label: congregationName, icon: <Building2 className="size-3.5 text-teal-600" /> },
          {
            label: 'Megőrzési archívum (5–10 év)',
            icon: <ShieldCheck className="size-3.5" />,
            tone: 'amber',
          },
        ]}
        actions={
          <Button
            className="min-h-11 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 text-base font-semibold text-white shadow-lg ring-1 ring-emerald-500/30 transition hover:from-teal-700 hover:to-emerald-700 hover:shadow-xl"
            onClick={() => fileInputRef.current?.click()}
          >
            <FolderUp className="mr-1.5 size-5" aria-hidden />
            Feltöltés
          </Button>
        }
      />

      {/* ── 7C: jól látható belépés a Kifizetetlen számlák ablakba,
             élő szám-jelvénnyel (hány kifizetetlen + hány lejárt) ── */}
      <KifizetetlenBelepo onOpen={onOpenKifizetetlen} />

      {/* ── Kategória-kártyák (élő darabszámmal, kattintva szűr) ── */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {GYDOK_KATEGORIAK.map((kat) => {
          const stilus = KATEGORIA_STILUS[kat.key]
          const Icon = stilus.icon
          const active = nezet === kat.key
          const darab = szamok[kat.key] || 0
          return (
            <button
              key={kat.key}
              type="button"
              onClick={() => setNezet(active ? 'osszes' : kat.key)}
              aria-pressed={active}
              className={`card-raised min-h-11 rounded-2xl border p-3 text-left transition sm:p-4 ${
                active ? stilus.activeRing : 'border-transparent hover:border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10 ${stilus.badge}`}>
                  <Icon className="size-4.5 sm:size-5" strokeWidth={1.8} aria-hidden />
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {darab} db
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-800">{kat.label}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500 max-sm:hidden">
                {kat.description}
              </p>
            </button>
          )
        })}
      </div>

      {/* ── Eszközsor: keresés + rendezés + Összes/Kuka ── */}
      <div className="card-raised flex flex-wrap items-center gap-2 p-3 sm:p-4">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            value={keresesInput}
            onChange={(e) => setKeresesInput(e.target.value)}
            placeholder="Keresés fájlnév szerint…"
            className="min-h-10 rounded-xl pl-9"
            aria-label="Keresés fájlnév szerint"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-10 rounded-xl border-slate-200 font-medium text-slate-600 hover:bg-slate-50"
          onClick={() => setIrany((v) => (v === 'desc' ? 'asc' : 'desc'))}
          title="Rendezés a feltöltés dátuma szerint"
        >
          {irany === 'desc' ? (
            <ArrowDownWideNarrow className="mr-1 size-4" aria-hidden />
          ) : (
            <ArrowUpNarrowWide className="mr-1 size-4" aria-hidden />
          )}
          {irany === 'desc' ? 'Legújabb elöl' : 'Legrégebbi elöl'}
        </Button>
        {aktivKategoria || kukaNezet ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-10 rounded-xl border-slate-200 font-medium text-slate-600 hover:bg-slate-50"
            onClick={() => setNezet('osszes')}
          >
            <FolderOpen className="mr-1 size-4" aria-hidden />
            Összes ({osszesElo} db)
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className={`min-h-10 rounded-xl font-medium ${
            kukaNezet
              ? 'border-rose-500 bg-rose-50 text-rose-700 ring-1 ring-rose-500 hover:bg-rose-100'
              : 'border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-50'
          }`}
          aria-pressed={kukaNezet}
          onClick={() => setNezet(kukaNezet ? 'osszes' : 'kuka')}
        >
          <Trash2 className="mr-1 size-4" aria-hidden />
          Kuka ({kukaSzam})
        </Button>
      </div>

      {/* ── Kuka-magyarázó sáv ── */}
      {kukaNezet ? (
        <div className="card-raised border-rose-200 bg-rose-50/60 p-4">
          <p className="text-sm text-rose-800">
            <strong>Kuka</strong> — az ide került dokumentumok fájljai még megvannak, bármikor
            visszaállíthatók. A <strong>végleges törlés</strong> a fájlt is eltávolítja a tárhelyről,
            és <strong>nem vonható vissza</strong>.
          </p>
        </div>
      ) : null}

      {/* ── Fájl-lista + drag-and-drop feltöltő sáv ── */}
      <div
        className={`card-raised p-4 transition sm:p-5 ${
          dragActive ? 'ring-2 ring-emerald-500 ring-offset-2' : ''
        }`}
        onDragOver={(e) => {
          if (kukaNezet) return
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        {/* Dropzone-fejléc — a Kukában nincs feltöltés */}
        {!kukaNezet ? (
          <div className="mb-4 flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-5 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <FolderUp className="size-5" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Húzd ide a fájlokat, vagy válaszd ki őket
                </p>
                <p className="text-[11px] leading-snug text-slate-500">
                  {GYDOK_ALLOWED_TYPES_LEIRAS} — fájlonként legfeljebb 25 MB.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-10 rounded-xl border-emerald-200 bg-white font-medium text-emerald-700 hover:bg-emerald-50"
              onClick={() => fileInputRef.current?.click()}
            >
              <FolderUp className="mr-1 size-4" aria-hidden />
              Fájlok kiválasztása
            </Button>
          </div>
        ) : null}

        {/* Lista-fejléc */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-base text-slate-800">
            {kukaNezet
              ? 'A Kuka tartalma'
              : aktivKategoria
                ? gydokKategoriaLabel(aktivKategoria)
                : 'Minden dokumentum'}
          </h3>
          <span className="text-xs text-slate-500">
            {osszesen === 0 ? 'Nincs találat' : `${tolIndex}–${igIndex} / ${osszesen} dokumentum`}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Dokumentumok betöltése…
          </div>
        ) : listaHiba ? (
          /* FAIL-CLOSED: a hiba hangosan, a lista helyén — újrapróbálással. */
          <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3">
            <p className="text-xs font-semibold text-destructive">A dokumentumtár nem tölthető be</p>
            <p className="text-xs text-destructive">{listaHiba}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              Újrapróbálás
            </Button>
          </div>
        ) : rows.length === 0 && nezet === 'osszes' && !kereses ? (
          <EmptyFirstRecord
            accent="emerald"
            icon={FolderOpen}
            title="Még nincs feltöltött dokumentum"
            description="Kezdd el a gyülekezet irattárának építését — töltsd fel az első számlát, bizonylatot vagy szerződést. A fájlok a gyülekezethez kötve, biztonságos tárhelyen őrződnek."
            ctaLabel="Töltsd fel az első dokumentumot"
            onCta={() => fileInputRef.current?.click()}
          />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-center">
            <p className="text-sm text-slate-500">
              {kukaNezet
                ? 'A Kuka üres.'
                : kereses
                  ? `Nincs a keresésnek („${kereses}") megfelelő dokumentum ebben a nézetben.`
                  : 'Ebben a mappában még nincs dokumentum — húzd ide a fájlokat, vagy használd a Feltöltés gombot.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {rows.map((item) => {
              const { Icon, cls } = fajlIkon(item.mime_type)
              const busy = busyId === item.id
              return (
                <li key={item.id} className="flex items-center gap-2 px-3 py-2.5 sm:gap-3">
                  <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10 ${cls}`}>
                    <Icon className="size-4.5 sm:size-5" strokeWidth={1.8} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                        {item.file_name}
                      </span>
                      {/* Kategória-jelvény — csak ha nem kategória-szűrt a nézet */}
                      {!aktivKategoria ? (
                        <Badge variant="outline" className="shrink-0">
                          {gydokKategoriaLabel(item.kategoria)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {formatBytes(item.meret_bytes)} · {datumSzoveg(item.created_at)}
                      {kukaNezet && item.deleted_at
                        ? ` · Kukába: ${datumSzoveg(item.deleted_at)}`
                        : ''}
                      {item.megjegyzes ? ` · ${item.megjegyzes}` : ''}
                    </p>
                  </div>

                  {/* Műveletek — 40px-es érintőfelület telefonon is */}
                  <div className="flex shrink-0 items-center gap-0.5">
                    {szamlaFeldolgozhato(item) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-cyan-700 hover:bg-cyan-50"
                        aria-label={`${item.file_name} számla-feldolgozása`}
                        title="Számla-feldolgozás (ZIP/XML → számla-adatalap; újrafuttatása biztonságos)"
                        disabled={feldolgozoId === item.id}
                        onClick={() => void handleSzamlaFeldolgozas(item)}
                      >
                        {feldolgozoId === item.id ? (
                          <Loader2 className="animate-spin" aria-hidden />
                        ) : (
                          <ScanSearch aria-hidden />
                        )}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${item.file_name} megnyitása új fülön`}
                      title="Megnyitás új fülön"
                      disabled={openingId === item.id}
                      onClick={() => handleOpen(item)}
                    >
                      {openingId === item.id ? (
                        <Loader2 className="animate-spin" aria-hidden />
                      ) : (
                        <ExternalLink aria-hidden />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${item.file_name} letöltése`}
                      title="Letöltés"
                      disabled={downloadingId === item.id}
                      onClick={() => void handleDownload(item)}
                    >
                      {downloadingId === item.id ? (
                        <Loader2 className="animate-spin" aria-hidden />
                      ) : (
                        <Download aria-hidden />
                      )}
                    </Button>
                    {kukaNezet ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-emerald-700 hover:bg-emerald-50"
                          aria-label={`${item.file_name} visszaállítása`}
                          title="Visszaállítás"
                          disabled={busy}
                          onClick={() => void handleRestore(item)}
                        >
                          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ArchiveRestore aria-hidden />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:bg-destructive/10"
                          aria-label={`${item.file_name} végleges törlése`}
                          title="Végleges törlés (nem vonható vissza)"
                          disabled={busy}
                          onClick={() => setPurgeConfirm(item)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10"
                        aria-label={`${item.file_name} törlése a Kukába`}
                        title="Törlés a Kukába (visszaállítható)"
                        disabled={busy}
                        onClick={() => setKukaConfirm(item)}
                      >
                        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {/* Lapozás */}
        {!loading && !listaHiba && osszesen > OLDAL_MERET ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 rounded-xl"
              disabled={oldal <= 1}
              onClick={() => setOldal((o) => Math.max(1, o - 1))}
            >
              Előző
            </Button>
            <span className="text-xs text-slate-500">
              {oldal}. oldal / {utolsoOldal}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 rounded-xl"
              disabled={oldal >= utolsoOldal}
              onClick={() => setOldal((o) => Math.min(utolsoOldal, o + 1))}
            >
              Következő
            </Button>
          </div>
        ) : null}
      </div>

      {/* ── Feltöltő dialógus ── */}
      <DokumentumtarUploadDialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open)
          if (!open) setPendingFiles([])
        }}
        files={pendingFiles}
        defaultKategoria={aktivKategoria}
        onUploaded={() => void load()}
      />

      {/* ── Törlés a Kukába — megerősítés ── */}
      <AdminConfirmDialog
        open={kukaConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setKukaConfirm(null)
        }}
        title="Dokumentum törlése a Kukába"
        description={
          kukaConfirm ? (
            <>
              A(z) <strong>{kukaConfirm.file_name}</strong> a Kukába kerül. A fájl megmarad, és a
              Kuka nézetből bármikor visszaállítható — véglegesen csak onnan törölhető.
            </>
          ) : null
        }
        confirmLabel="Kukába helyezés"
        loading={busyId === kukaConfirm?.id}
        onConfirm={() => void handleKukaba()}
      />

      {/* ── 7C: számla-feldolgozás eredménye (lista-műveletből) ── */}
      <Dialog
        open={feldolgozasEredmeny !== null}
        onOpenChange={(open) => {
          if (!open) setFeldolgozasEredmeny(null)
        }}
      >
        <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 pr-8">
              <ScanSearch className="size-5 text-cyan-600" aria-hidden />
              Számla-feldolgozás eredménye
            </DialogTitle>
            <DialogDescription>{feldolgozasEredmeny?.fileName}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {feldolgozasEredmeny ? (
              <SzamlaFeldolgozasEredmenyPanel eredmeny={feldolgozasEredmeny.eredmeny} />
            ) : null}
          </div>
          <DialogFooter className="shrink-0">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setFeldolgozasEredmeny(null)}
            >
              Bezárás
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Végleges törlés — hangos, veszély-tónusú megerősítés ── */}
      <AdminConfirmDialog
        open={purgeConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setPurgeConfirm(null)
        }}
        title="Végleges törlés"
        tone="danger"
        description={
          purgeConfirm ? (
            <>
              A(z) <strong>{purgeConfirm.file_name}</strong> fájl <strong>véglegesen törlődik</strong> a
              tárhelyről is. Ez a művelet <strong>nem vonható vissza</strong> — a fájl nem lesz
              visszaállítható. Gondolj a megőrzési kötelezettségre is (a számlákat 5–10 évig meg
              kell őrizni).
            </>
          ) : null
        }
        confirmLabel="Végleges törlés"
        loading={busyId === purgeConfirm?.id}
        onConfirm={() => void handlePurge()}
      />
    </div>
  )
}
