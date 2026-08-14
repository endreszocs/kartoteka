'use client'

/**
 * Dokumentumtár — feltöltő dialógus (7. pont A szelet).
 *
 * A kiválasztott/bedobott fájlok listája + KÖTELEZŐ kategória-választás,
 * majd kliens-oldali feltöltés a privát 'gyulekezeti-dokumentumok' bucketbe
 * (az utat a prepareDokumentumUpload server action adja, a metaadat-sort a
 * registerDokumentum írja; ha a metaadat-írás bukik, a feltöltött fájlt
 * best-effort visszatöröljük, hogy ne maradjon gazdátlan objektum).
 *
 * A kategória-választás azért a dialógusban él (és nem egy néma default),
 * mert Endre kérése az EGYÉRTELMŰ felület — a fájl sorsa (melyik mappa)
 * minden feltöltésnél explicit döntés.
 *
 * 7. pont C szelet (2026-08-15): a „Szállítói számlák" mappába feltöltött
 * ZIP/XML fájlokat a feltöltés után AZONNAL feldolgozzuk
 * (feldolgozSzamlaZipDokumentum) — az eredmény (új számlák, duplikátumok,
 * kihagyottak, hibák) tételesen itt, a dialógusban jelenik meg, és innen
 * egy gombbal nyílik a Kifizetetlen számlák ablak.
 *
 * Minden hiba magyarul és hangosan (toast + inline hibalista).
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FolderUp, Loader2, ReceiptText, ScanSearch, X } from 'lucide-react'
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
import { createClient } from '@/lib/supabase/client'
import {
  GYDOK_ALLOWED_TYPES_LEIRAS,
  GYDOK_BUCKET,
  GYDOK_KATEGORIAK,
  GYDOK_MAX_BYTES,
  formatBytes,
  isAllowedGydokMime,
  type GydokKategoria,
} from '@/lib/dokumentumtar/dokumentum-types'
import type { SzamlaFeldolgozasEredmeny } from '@/lib/dokumentumtar/szamla-types'
import { SzamlaFeldolgozasEredmenyPanel } from '@/components/dokumentumtar/szamla-feldolgozas-eredmeny'
import {
  prepareDokumentumUpload,
  registerDokumentum,
} from '@/app/(dashboard)/dokumentumtar/actions'
import { feldolgozSzamlaZipDokumentum } from '@/app/(dashboard)/dokumentumtar/szamla-actions'

interface DokumentumtarUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A feltöltésre kiválasztott/bedobott fájlok. */
  files: File[]
  /** Előre kiválasztott kategória (ha a felhasználó egy kategória-nézetből indított). */
  defaultKategoria: GydokKategoria | null
  /** Legalább egy sikeres feltöltés után hívódik (lista-frissítéshez). */
  onUploaded: () => void
}

export function DokumentumtarUploadDialog({
  open,
  onOpenChange,
  files,
  defaultKategoria,
  onUploaded,
}: DokumentumtarUploadDialogProps) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [kategoria, setKategoria] = useState<GydokKategoria | null>(defaultKategoria)
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  // 7C: számla-feldolgozás állapota ('szallitoi-szamlak' + ZIP/XML feltöltés után).
  const [feldolgozasFut, setFeldolgozasFut] = useState(false)
  const [feldolgozasEredmeny, setFeldolgozasEredmeny] = useState<SzamlaFeldolgozasEredmeny | null>(null)

  // Megnyitáskor visszaáll az alapállapot (az előző kör hibái ne ragadjanak be).
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      setKategoria(defaultKategoria)
      setErrors([])
      setUploading(null)
      setFeldolgozasFut(false)
      setFeldolgozasEredmeny(null)
    })
    return () => cancelAnimationFrame(raf)
  }, [open, defaultKategoria])

  // Kliens-oldali elő-validáció — a szerver + a bucket is ellenőrzi (defense
  // in depth), de a felhasználó már a Feltöltés gomb ELŐTT lássa a gondot.
  const fileChecks = useMemo(
    () =>
      files.map((file) => {
        let hiba: string | null = null
        if (!isAllowedGydokMime(file.type)) {
          hiba = `nem támogatott típus (${file.type || 'ismeretlen'})`
        } else if (file.size === 0) {
          hiba = 'a fájl üres (0 bájt)'
        } else if (file.size > GYDOK_MAX_BYTES) {
          hiba = `túl nagy (${formatBytes(file.size)}) — a limit 25 MB`
        }
        return { file, hiba }
      }),
    [files],
  )
  const validCount = fileChecks.filter((c) => !c.hiba).length

  const isUploading = uploading !== null || feldolgozasFut

  async function handleUpload() {
    if (!kategoria) {
      toast.error('Válaszd ki, melyik mappába kerüljenek a fájlok.')
      return
    }
    const validFiles = fileChecks.filter((c) => !c.hiba).map((c) => c.file)
    if (validFiles.length === 0) {
      toast.error('Nincs feltölthető fájl — nézd meg a hibajelzéseket a listában.')
      return
    }

    setErrors([])
    setUploading({ done: 0, total: validFiles.length })
    const hibak: string[] = []
    let done = 0
    // 7C: a sikeresen regisztrált dokumentumok — a számla-feldolgozáshoz.
    const feltoltottek: { id: string; fileName: string }[] = []

    for (const file of validFiles) {
      // 1) Út-előkészítés a szerveren (validál + kontraktus-út:
      //    {congregation_id}/{kategoria}/{uuid}-{fájlnév})
      const prep = await prepareDokumentumUpload({
        kategoria,
        fileName: file.name,
        mimeType: file.type,
        meretBytes: file.size,
      })
      if (prep.error || !prep.path) {
        hibak.push(`${file.name}: ${prep.error || 'a feltöltési út előkészítése sikertelen.'}`)
        continue
      }

      // 2) Feltöltés a privát bucketbe (kliens-oldalról, RLS-policy engedi)
      const { error: upErr } = await supabase.storage
        .from(GYDOK_BUCKET)
        .upload(prep.path, file, { contentType: file.type, upsert: false })
      if (upErr) {
        hibak.push(`${file.name}: a feltöltés sikertelen — ${upErr.message}`)
        continue
      }

      // 3) Metaadat-sor rögzítése
      const reg = await registerDokumentum({
        kategoria,
        storagePath: prep.path,
        fileName: file.name,
        mimeType: file.type,
        meretBytes: file.size,
      })
      if (reg.error || !reg.dokumentum) {
        // Best-effort takarítás: a feltöltött fájl ne maradjon gazdátlanul
        const { error: cleanupErr } = await supabase.storage
          .from(GYDOK_BUCKET)
          .remove([prep.path])
        hibak.push(
          `${file.name}: a rögzítés sikertelen — ${reg.error || 'ismeretlen hiba'}${
            cleanupErr ? ` (a feltöltött fájl visszatörlése is sikertelen: ${cleanupErr.message})` : ''
          }`,
        )
        continue
      }

      done += 1
      feltoltottek.push({ id: reg.dokumentum.id, fileName: file.name })
      setUploading({ done, total: validFiles.length })
    }

    setUploading(null)
    if (done > 0) {
      toast.success(done === 1 ? 'A dokumentum feltöltve.' : `${done} dokumentum feltöltve.`)
      onUploaded()
    }
    if (hibak.length > 0) {
      setErrors(hibak)
      toast.error(
        hibak.length === validFiles.length
          ? 'Egyik fájl feltöltése sem sikerült — részletek a listában.'
          : `${hibak.length} fájl feltöltése sikertelen — részletek a listában.`,
      )
      // a dialógus nyitva marad, hogy a hibák olvashatók legyenek — de a
      // sikeresen feltöltött számla-fájlokat ettől még feldolgozzuk (lent).
    }

    // ── 7C: számla-feldolgozás — CSAK a „Szállítói számlák" mappa ZIP/XML-jei ──
    const szamlaFajlok = feltoltottek.filter((f) => {
      const n = f.fileName.toLowerCase()
      return n.endsWith('.zip') || n.endsWith('.xml')
    })
    if (kategoria === 'szallitoi-szamlak' && szamlaFajlok.length > 0) {
      setFeldolgozasFut(true)
      // Egyenként (szekvenciálisan) dolgozunk — a nagy ZIP-ek storage-műveletei
      // ne fussanak egymásra; az eredményeket egyetlen összegzésbe fésüljük.
      const osszesitett: SzamlaFeldolgozasEredmeny = {
        ujSzamlak: [],
        duplikatumok: [],
        kihagyott: [],
        hibak: [],
      }
      for (const fajl of szamlaFajlok) {
        const { eredmeny, error } = await feldolgozSzamlaZipDokumentum(fajl.id)
        if (error || !eredmeny) {
          // FAIL-CLOSED: az action-szintű hiba is a hangos hibalistába kerül.
          osszesitett.hibak.push(`${fajl.fileName}: ${error || 'a feldolgozás ismeretlen hibával leállt.'}`)
          continue
        }
        osszesitett.ujSzamlak.push(...eredmeny.ujSzamlak)
        osszesitett.duplikatumok.push(...eredmeny.duplikatumok)
        osszesitett.kihagyott.push(...eredmeny.kihagyott)
        osszesitett.hibak.push(...eredmeny.hibak)
      }
      setFeldolgozasFut(false)
      setFeldolgozasEredmeny(osszesitett)
      onUploaded() // a lista frissüljön (a ZIP-ből kibontott XML/PDF sorok miatt)
      if (osszesitett.hibak.length > 0) {
        toast.error(`A számla-feldolgozás ${osszesitett.hibak.length} hibát jelzett — részletek a dialógusban.`)
      } else if (osszesitett.ujSzamlak.length > 0) {
        toast.success(
          osszesitett.ujSzamlak.length === 1
            ? '1 új szállítói számla rögzítve.'
            : `${osszesitett.ujSzamlak.length} új szállítói számla rögzítve.`,
        )
      }
      return // a dialógus nyitva marad: az eredmény-panel olvasható
    }

    if (hibak.length > 0) return
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Feltöltés közben nem zárható be némán — a folyamat megszakítása
        // fél-kész állapotot hagyna, amiről a felhasználó nem tudna.
        if (isUploading) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8">
            <FolderUp className="size-5 text-emerald-600" aria-hidden />
            Dokumentumok feltöltése
          </DialogTitle>
          <DialogDescription>
            {files.length === 1
              ? '1 fájl kiválasztva.'
              : `${files.length} fájl kiválasztva.`}{' '}
            Feltölthető: {GYDOK_ALLOWED_TYPES_LEIRAS} — fájlonként legfeljebb 25 MB.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
          {/* Kategória-választó — kötelező, kártya-rács */}
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              Melyik mappába kerüljenek?{' '}
              <span className="text-destructive" aria-hidden>
                *
              </span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GYDOK_KATEGORIAK.map((kat) => {
                const active = kategoria === kat.key
                return (
                  <button
                    key={kat.key}
                    type="button"
                    disabled={isUploading}
                    onClick={() => setKategoria(kat.key)}
                    aria-pressed={active}
                    className={`rounded-xl border px-3 py-2.5 text-left transition min-h-11 ${
                      active
                        ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-800">{kat.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                      {kat.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Fájl-lista elő-validációval */}
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {fileChecks.map(({ file, hiba }, i) => (
              <li key={`${file.name}-${i}`} className="flex items-start gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                  {hiba ? <p className="text-xs font-medium text-destructive">⚠ {hiba}</p> : null}
                </div>
              </li>
            ))}
          </ul>

          {/* Folyamat */}
          {uploading !== null ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Feltöltés folyamatban… {uploading.done} / {uploading.total} fájl kész
            </div>
          ) : null}

          {/* 7C: számla-feldolgozás folyamat + eredmény */}
          {feldolgozasFut ? (
            <div className="flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 py-2 text-sm text-cyan-800">
              <ScanSearch className="size-4 shrink-0" aria-hidden />
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Számlák feldolgozása (kibontás + adatkinyerés)… nagy ZIP-nél ez eltarthat pár
              másodpercig.
            </div>
          ) : null}
          {feldolgozasEredmeny ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <ScanSearch className="size-4 text-cyan-600" aria-hidden />
                Számla-feldolgozás eredménye
              </p>
              <SzamlaFeldolgozasEredmenyPanel eredmeny={feldolgozasEredmeny} />
            </div>
          ) : null}

          {/* Hibalista — hangosan, soronként */}
          {errors.length > 0 ? (
            <div className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-destructive">Sikertelen feltöltések</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Hibalista bezárása"
                  onClick={() => setErrors([])}
                >
                  <X aria-hidden />
                </Button>
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-destructive">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0">
          {feldolgozasEredmeny ? (
            /* 7C: feldolgozás után a „Mégse/Feltöltés" páros helyett lezáró
               gombok — a feltöltés már megtörtént, újraküldeni félrevezető lenne. */
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => onOpenChange(false)}
              >
                Bezárás
              </Button>
              <Button
                type="button"
                className="w-full gap-2 bg-cyan-700 text-white hover:bg-cyan-800 sm:w-auto"
                onClick={() => {
                  onOpenChange(false)
                  router.push('/dokumentumtar/kifizetetlen')
                }}
              >
                <ReceiptText className="size-4" aria-hidden />
                Kifizetetlen számlák megnyitása
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={isUploading}
                onClick={() => onOpenChange(false)}
              >
                Mégse
              </Button>
              <Button
                type="button"
                className="w-full gap-2 bg-emerald-700 text-white hover:bg-emerald-800 sm:w-auto"
                disabled={isUploading || !kategoria || validCount === 0}
                onClick={() => void handleUpload()}
              >
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FolderUp className="size-4" aria-hidden />
                )}
                {validCount === 1 ? 'Feltöltés (1 fájl)' : `Feltöltés (${validCount} fájl)`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
