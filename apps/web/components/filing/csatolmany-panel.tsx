'use client'

/**
 * Iktató F6 — Csatolmány-panel (K5). Egy iktatott irat befotózott/feltöltött
 * oldalai — dialog-tartalomként használható (a K6 integrátor köti be).
 *
 * Funkciók:
 *  - csatolmány-lista (fájlnév, oldal-sorszám, méret, megjegyzés),
 *  - megnyitás signed URL-lel új fülön (600 s érvényesség),
 *  - törlés megerősítéssel (tábla-sor + storage-objektum),
 *  - feltöltés KLIENS-oldalról a privát 'iktato-csatolmanyok' bucketbe:
 *      · „Befotózás" — mobil kamera (capture='environment'),
 *      · „Fájl feltöltése" — kép (JPEG/PNG/WebP) vagy PDF, több fájl egyszerre,
 *    az utat a prepareCsatolmanyUpload server action adja, a metaadat-sort a
 *    registerCsatolmany írja; ha a metaadat-írás bukik, a feltöltött fájlt
 *    best-effort visszatöröljük (ne maradjon gazdátlan objektum),
 *  - VAGY „csak metaadat" mód: papíralapú irat jelzése fájl nélkül.
 *
 * Minden hiba magyarul és hangosan (toast + inline hibalista).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ExternalLink,
  FileImage,
  FileText,
  FileUp,
  Loader2,
  NotebookPen,
  Paperclip,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import {
  CSATOLMANY_BUCKET,
  CSATOLMANY_MAX_BYTES,
  formatBytes,
  isAllowedCsatolmanyMime,
  type IktatoCsatolmany,
} from '@/lib/iktato/csomo-types'
import {
  deleteCsatolmany,
  getCsatolmanyUrl,
  listCsatolmanyok,
  prepareCsatolmanyUpload,
  registerCsatolmany,
} from '@/app/(dashboard)/iktato/csatolmany-actions'

export interface CsatolmanyPanelProps {
  /** Az iktató-tétel azonosítója (uuid). */
  iktatoId: string
  /** Az irat megjelenítendő iktatószáma a fejléchez, pl. "2026/14". */
  iktatoszam?: string
  /** Értesítés a szülőnek, ha a csatolmány-lista változott (darabszám-frissítéshez). */
  onChanged?: () => void
}

export function CsatolmanyPanel({ iktatoId, iktatoszam, onChanged }: CsatolmanyPanelProps) {
  const supabase = useMemo(() => createClient(), [])

  // ── Lista ────────────────────────────────────────────────────
  const [items, setItems] = useState<IktatoCsatolmany[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { csatolmanyok, error } = await listCsatolmanyok(iktatoId)
    if (error) toast.error(error)
    setItems(csatolmanyok)
    setLoading(false)
  }, [iktatoId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  // ── Feltöltés (kliens-oldali storage-upload) ─────────────────
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    // Reset, hogy ugyanaz a fájl újra kiválasztható legyen
    e.target.value = ''
    if (files.length === 0) return

    setUploadErrors([])
    setUploading({ done: 0, total: files.length })
    const errors: string[] = []
    let done = 0

    for (const file of files) {
      // Kliens-oldali gyors-validáció — a szerver + a bucket is ellenőrzi
      if (!isAllowedCsatolmanyMime(file.type)) {
        errors.push(
          `${file.name}: nem támogatott fájltípus (${file.type || 'ismeretlen'}) — JPEG, PNG, WebP kép vagy PDF tölthető fel.`,
        )
        continue
      }
      if (file.size > CSATOLMANY_MAX_BYTES) {
        errors.push(`${file.name}: túl nagy (${formatBytes(file.size)}) — a limit 10 MB.`)
        continue
      }
      if (file.size === 0) {
        errors.push(`${file.name}: a fájl üres (0 bájt).`)
        continue
      }

      // 1) Út-előkészítés a szerveren (validál + kontraktus-út)
      const prep = await prepareCsatolmanyUpload({
        iktatoId,
        fileName: file.name,
        mimeType: file.type,
        meretBytes: file.size,
      })
      if (prep.error || !prep.path) {
        errors.push(`${file.name}: ${prep.error || 'a feltöltési út előkészítése sikertelen.'}`)
        continue
      }

      // 2) Feltöltés a privát bucketbe (kliens-oldalról, RLS-policy engedi)
      const { error: upErr } = await supabase.storage
        .from(CSATOLMANY_BUCKET)
        .upload(prep.path, file, { contentType: file.type, upsert: false })
      if (upErr) {
        errors.push(`${file.name}: a feltöltés sikertelen — ${upErr.message}`)
        continue
      }

      // 3) Metaadat-sor rögzítése
      const reg = await registerCsatolmany({
        iktatoId,
        storagePath: prep.path,
        fileName: file.name,
        mimeType: file.type,
        meretBytes: file.size,
      })
      if (reg.error || !reg.csatolmany) {
        // Best-effort takarítás: a feltöltött fájl ne maradjon gazdátlanul
        const { error: cleanupErr } = await supabase.storage
          .from(CSATOLMANY_BUCKET)
          .remove([prep.path])
        errors.push(
          `${file.name}: a csatolmány rögzítése sikertelen — ${reg.error || 'ismeretlen hiba'}${
            cleanupErr ? ` (a feltöltött fájl visszatörlése is sikertelen: ${cleanupErr.message})` : ''
          }`,
        )
        continue
      }

      done += 1
      setUploading({ done, total: files.length })
    }

    setUploading(null)
    if (errors.length > 0) {
      setUploadErrors(errors)
      toast.error(
        errors.length === files.length
          ? 'Egyik fájl feltöltése sem sikerült — részletek a listában.'
          : `${errors.length} fájl feltöltése sikertelen — részletek a listában.`,
      )
    }
    if (done > 0) {
      toast.success(done === 1 ? 'A csatolmány feltöltve.' : `${done} csatolmány feltöltve.`)
      void load()
      onChanged?.()
    }
  }

  // ── „Csak metaadat" mód (papíralapú irat, fájl nélkül) ───────
  const [metaOpen, setMetaOpen] = useState(false)
  const [metaNev, setMetaNev] = useState('')
  const [metaMegj, setMetaMegj] = useState('')
  const [metaSaving, setMetaSaving] = useState(false)

  async function handleMetaSave() {
    if (!metaNev.trim()) {
      toast.error('A csatolmány megnevezése nem lehet üres.')
      return
    }
    setMetaSaving(true)
    const { csatolmany, error } = await registerCsatolmany({
      iktatoId,
      storagePath: null,
      fileName: metaNev,
      megjegyzes: metaMegj || null,
    })
    setMetaSaving(false)
    if (error || !csatolmany) {
      toast.error(error || 'A rögzítés sikertelen.')
      return
    }
    toast.success('Papíralapú csatolmány rögzítve (fájl nélkül).')
    setMetaOpen(false)
    setMetaNev('')
    setMetaMegj('')
    void load()
    onChanged?.()
  }

  // ── Megnyitás (signed URL, popup-blokkoló-barát) ─────────────
  const [openingId, setOpeningId] = useState<string | null>(null)
  function handleOpen(item: IktatoCsatolmany) {
    // Az ablakot SZINKRON nyitjuk (még a felhasználói kattintás kontextusában),
    // különben a popup-blokkoló elnyelheti az async válasz utáni window.open-t.
    const win = window.open('', '_blank')
    setOpeningId(item.id)
    void getCsatolmanyUrl(item.id).then(({ url, error }) => {
      setOpeningId(null)
      if (error || !url) {
        try {
          win?.close()
        } catch {
          /* ignore */
        }
        toast.error(error || 'A letöltési link készítése sikertelen.')
        return
      }
      if (win) win.location.href = url
      else window.open(url, '_blank', 'noopener')
    })
  }

  // ── Törlés ───────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null)
  async function handleDelete(item: IktatoCsatolmany) {
    const kind = item.storage_path ? 'a fájl a tárhelyről is törlődik' : 'csak a bejegyzés törlődik'
    if (!window.confirm(`Biztosan törlöd a(z) „${item.file_name}" csatolmányt? (${kind})`)) return
    setDeletingId(item.id)
    const { error } = await deleteCsatolmany(item.id)
    setDeletingId(null)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('A csatolmány törölve.')
    void load()
    onChanged?.()
  }

  const isUploading = uploading !== null

  return (
    <div className="space-y-3">
      {/* Fejléc */}
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Paperclip className="size-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-foreground">
            Csatolmányok{iktatoszam ? ` — ${iktatoszam}` : ''}
          </h3>
          <p className="text-xs text-muted-foreground">
            Befotózott vagy feltöltött oldalak, illetve papíralapú irat jelzése
          </p>
        </div>
      </div>

      {/* Feltöltő gombok — mobil kamera + fájlböngésző + csak-metaadat */}
      <div className="flex flex-wrap gap-1.5">
        {/* Rejtett inputok: a capture='environment' a hátsó kamerát nyitja mobilon */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          onChange={(e) => void handleFilesSelected(e)}
          className="hidden"
          aria-hidden
          tabIndex={-1}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          onChange={(e) => void handleFilesSelected(e)}
          className="hidden"
          aria-hidden
          tabIndex={-1}
        />
        <Button
          type="button"
          size="sm"
          disabled={isUploading}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera data-icon="inline-start" aria-hidden />
          Befotózás
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp data-icon="inline-start" aria-hidden />
          Fájl feltöltése
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isUploading}
          onClick={() => setMetaOpen((v) => !v)}
        >
          <NotebookPen data-icon="inline-start" aria-hidden />
          Csak metaadat
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {'JPEG, PNG, WebP kép vagy PDF — fájlonként legfeljebb 10 MB. A „Csak metaadat" a papíralapú (nem digitalizált) irat jelzésére való.'}
      </p>

      {/* Feltöltés-folyamat */}
      {isUploading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Feltöltés folyamatban… {uploading.done} / {uploading.total} fájl kész
        </div>
      ) : null}

      {/* Feltöltési hibák — hangosan, soronként */}
      {uploadErrors.length > 0 ? (
        <div className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-destructive">Sikertelen feltöltések</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Hibalista bezárása"
              onClick={() => setUploadErrors([])}
            >
              <X aria-hidden />
            </Button>
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-destructive">
            {uploadErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* „Csak metaadat" űrlap */}
      {metaOpen ? (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="csat-meta-nev">
              Megnevezés <span className="text-destructive">*</span>
            </Label>
            <Input
              id="csat-meta-nev"
              value={metaNev}
              onChange={(e) => setMetaNev(e.target.value)}
              placeholder="pl. Eredeti kérvény — az irattári dossziéban"
              maxLength={200}
              disabled={metaSaving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csat-meta-megj">Megjegyzés (opcionális)</Label>
            <Input
              id="csat-meta-megj"
              value={metaMegj}
              onChange={(e) => setMetaMegj(e.target.value)}
              placeholder="pl. 2 oldal, mellékletekkel"
              disabled={metaSaving}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMetaOpen(false)} disabled={metaSaving}>
              Mégse
            </Button>
            {/* type=button + onClick — nincs véletlen Enter-mentés (v0.9.70) */}
            <Button type="button" size="sm" onClick={() => void handleMetaSave()} disabled={metaSaving}>
              {metaSaving ? (
                <>
                  <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
                  Rögzítés…
                </>
              ) : (
                'Rögzítés fájl nélkül'
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Csatolmány-lista */}
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Csatolmányok betöltése…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-3 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Ehhez az irathoz még nincs csatolmány — fotózd be a kamerával, tölts fel
            fájlt, vagy jelezd metaadattal a papíralapú irat létét.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {items.map((item) => {
            const isImage = (item.mime_type || '').startsWith('image/')
            const isPdf = item.mime_type === 'application/pdf'
            const Icon = item.storage_path ? (isImage ? FileImage : isPdf ? FileText : Paperclip) : NotebookPen
            return (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">
                      {item.file_name}
                    </span>
                    <Badge variant="outline">{item.oldal_sorszam}. oldal</Badge>
                    {!item.storage_path ? <Badge variant="secondary">papíralapú</Badge> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.storage_path ? `${formatBytes(item.meret_bytes)} · ` : ''}
                    {item.created_at?.split('T')[0] || ''}
                    {item.megjegyzes ? ` · ${item.megjegyzes}` : ''}
                  </p>
                </div>
                {item.storage_path ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
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
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-destructive hover:bg-destructive/10"
                  aria-label={`${item.file_name} törlése`}
                  title="Törlés"
                  disabled={deletingId === item.id}
                  onClick={() => void handleDelete(item)}
                >
                  {deletingId === item.id ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Trash2 aria-hidden />
                  )}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
