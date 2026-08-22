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
 * 2026-07-25 (F8d) — két bővítés:
 *  - „Fotózás telefonnal (QR)": rövid életű feltöltő-munkamenet + QR-kód, a
 *    telefon a publikus /m/feltoltes/{token} oldalon tölt fel (2,5 mp-es
 *    polling figyeli a beérkezést, a munkamenet bármikor lezárható),
 *  - digitális iktató-pecsét: a feltöltött kép a bucketbe kerülés ELŐTT
 *    tömörödik (2500 px, JPEG q0,8) és fehér footer-sávban megkapja az
 *    iktatószámot/dátumot/iratcsomót/gyülekezetet; PDF-nél a pdf-lib margó-
 *    pecsétje fut le.
 *
 *    ⚠️ TÁROLÁSI DÖNTÉS (a tervdoc „eredeti + pecsételt külön" elvéhez képest
 *    tudatos egyszerűsítés): CSAK A PECSÉTELT változat kerül fel. A meglévő
 *    F6-kontraktus egy csatolmány-sorhoz EGY storage-utat ismer, és a törlés
 *    is csak azt takarítja — a második (eredeti) objektum garantáltan árván
 *    maradna a privát bucketben minden törléskor. A hitelesség hordozója
 *    egyébként is a PAPÍR eredeti (ld. a súgó figyelmeztetését), a pecsét
 *    pedig tartalmat sosem takar (footer-sáv), így információ nem vész el.
 *    Ha a pecsételés hibázik, az EREDETI megy fel, és a felhasználó
 *    figyelmeztetést kap.
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
  QrCode,
  Smartphone,
  Stamp,
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
import {
  closeQrSession,
  createQrSession,
  getIktatoPecsetAdat,
  pollQrUploads,
} from '@/app/(dashboard)/iktato/qr-actions'
import {
  compressDocumentImage,
  PecsetHiba,
  stampImageFooterStrip,
  stampPdf,
  type PecsetAdat,
} from '@/lib/iktato/pecset'

/** A createQrSession válaszának munkamenet-része (a 'use server' fájl nem exportálhat típust). */
type QrMunkamenet = NonNullable<Awaited<ReturnType<typeof createQrSession>>['session']>

export interface CsatolmanyPanelProps {
  /** Az iktató-tétel azonosítója (uuid). */
  iktatoId: string
  /** Az irat megjelenítendő iktatószáma a fejléchez, pl. "2026/14". */
  iktatoszam?: string
  /** Értesítés a szülőnek, ha a csatolmány-lista változott (darabszám-frissítéshez). */
  onChanged?: () => void
  /**
   * 2026-08-15 (egyházmegyei szint, S4): 'diocese' = megyei iktató. A
   * „Fotózás telefonnal (QR)" gomb ilyenkor rejtve — a QR-munkamenet
   * (upload_sessions) gyülekezeti adatlánc, megyei változata későbbi kör.
   * A többi feltöltési út (befotózás, fájl, metaadat) megyei módban is él.
   *
   * 2026-08-17 (kerületi S5, K2): 'district' = kerületi iktató — ugyanaz a
   * rejtés, ugyanaz az ok (a szerver-oldal is így fogalmaz:
   * `app/(dashboard)/iktato/qr-actions.ts` fejléce — „A QR-munkamenet maga
   * gyülekezeti maradt — a megyei és a kerületi felület a QR-gombot nem is
   * mutatja").
   *
   * ⚠️ EZ A HÁROM ÉRTÉK KÉZI MÁSOLAT, ÉS EGYEZNIE KELL a kanonikus
   *    `ModuleScope` típussal (apps/web/lib/auth/module-scope.ts:71).
   *    MIÉRT NEM IMPORTÁLJUK: ez a fájl `'use client'`, a `module-scope.ts`
   *    viszont `import 'server-only'`-os modul — kliens-komponens nem nyúlhat
   *    server-only modulhoz (Next.js 16 doksi:
   *    01-app/02-guides/data-security.md), és a repóban ma egyetlen
   *    kliens-komponens sem teszi. A fordítói kapu eggyel feljebb, a
   *    `filing-main.tsx` `IktatoScope` propján keresztül a szerver-oldali
   *    `moduleScope.scope`-nál van.
   */
  scope?: 'congregation' | 'diocese' | 'district'
}

export function CsatolmanyPanel({ iktatoId, iktatoszam, onChanged, scope = 'congregation' }: CsatolmanyPanelProps) {
  const supabase = useMemo(() => createClient(), [])

  // ── Lista ────────────────────────────────────────────────────
  const [items, setItems] = useState<IktatoCsatolmany[]>([])
  const [loading, setLoading] = useState(true)
  // A lista-betöltés hibája INLINE jelenik meg, NEM toastként: a panel a
  // szerkesztő-dialógusba is be van ágyazva, és mountkor tölt — ha pl. az
  // F6-migráció még nem futott le, egy régi, hibátlan funkció (irat
  // szerkesztése) megnyitása dobna hangos hiba-toastot minden alkalommal.
  // A felhasználói akciók (feltöltés/törlés) hibái továbbra is toastok.
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { csatolmanyok, error } = await listCsatolmanyok(iktatoId)
    setLoadError(error)
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
  // Nem végzetes figyelmeztetések (pl. a pecsételés bukott, de a fájl felment)
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([])
  // Digitális iktató-pecsét — alapból BE; kikapcsolható, ha nyers (érintetlen)
  // másolat kell.
  const [pecsetelEngedve, setPecsetelEngedve] = useState(true)

  // ── Pecsét-adatok (iktatószám + gyülekezet + iratcsomó) ──────
  // Lustán, az első pecsételéskor töltjük be, és a panel élettartamára
  // megjegyezzük — így a lista megnyitása nem terhelődik plusz körrel.
  const pecsetAdatRef = useRef<{
    iktatoszam: string
    gyulekezet: string
    iratcsomo: string | null
  } | null>(null)

  const pecsetAdatBetolt = useCallback(async (): Promise<PecsetAdat | null> => {
    if (!pecsetAdatRef.current) {
      const { adat } = await getIktatoPecsetAdat(iktatoId)
      if (adat) {
        pecsetAdatRef.current = adat
      } else if (iktatoszam) {
        // Tartalék: legalább az iktatószám kerüljön a pecsétbe.
        pecsetAdatRef.current = { iktatoszam, gyulekezet: 'Kartotéka iktató', iratcsomo: null }
      } else {
        return null
      }
    }
    const adat = pecsetAdatRef.current
    return {
      iktatoszam: adat.iktatoszam,
      datum: new Intl.DateTimeFormat('hu-HU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date()),
      iratcsomo: adat.iratcsomo,
      gyulekezet: adat.gyulekezet,
    }
  }, [iktatoId, iktatoszam])

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    // Reset, hogy ugyanaz a fájl újra kiválasztható legyen
    e.target.value = ''
    if (files.length === 0) return

    setUploadErrors([])
    setUploadWarnings([])
    setUploading({ done: 0, total: files.length })
    const errors: string[] = []
    const warnings: string[] = []
    let done = 0

    for (const file of files) {
      // Kliens-oldali gyors-validáció — a szerver + a bucket is ellenőrzi.
      // (A méret-ellenőrzés a tömörítés UTÁN fut: egy 12 MB-os telefonos fotó
      //  a tömörítés után bőven a limit alá kerül.)
      if (!isAllowedCsatolmanyMime(file.type)) {
        errors.push(
          `${file.name}: nem támogatott fájltípus (${file.type || 'ismeretlen'}) — JPEG, PNG, WebP kép vagy PDF tölthető fel.`,
        )
        continue
      }
      if (file.size === 0) {
        errors.push(`${file.name}: a fájl üres (0 bájt).`)
        continue
      }

      // 0) Tömörítés + digitális iktató-pecsét — a bucketbe a PECSÉTELT megy
      //    (ld. a fájl fejlécének tárolási döntését).
      let feltoltendo = file
      let pecsetelve = false
      if (pecsetelEngedve) {
        const pecset = await pecsetAdatBetolt()
        if (!pecset) {
          warnings.push(
            `${file.name}: a pecsét adatai nem tölthetők be — a fájl pecsét nélkül megy fel.`,
          )
        } else if (file.type === 'application/pdf') {
          try {
            feltoltendo = await stampPdf(file, pecset)
            pecsetelve = true
          } catch (err) {
            warnings.push(
              `${file.name}: ${err instanceof PecsetHiba ? err.message : 'a PDF pecsételése nem sikerült'} — az eredeti megy fel.`,
            )
          }
        } else {
          try {
            feltoltendo = await compressDocumentImage(file)
          } catch (err) {
            warnings.push(
              `${file.name}: ${err instanceof PecsetHiba ? err.message : 'a tömörítés nem sikerült'} — az eredeti mérettel folytatjuk.`,
            )
          }
          try {
            feltoltendo = await stampImageFooterStrip(feltoltendo, pecset)
            pecsetelve = true
          } catch (err) {
            warnings.push(
              `${file.name}: ${err instanceof PecsetHiba ? err.message : 'a pecsételés nem sikerült'} — a kép pecsét nélkül megy fel.`,
            )
          }
        }
      }

      if (feltoltendo.size > CSATOLMANY_MAX_BYTES) {
        errors.push(`${file.name}: túl nagy (${formatBytes(feltoltendo.size)}) — a limit 10 MB.`)
        continue
      }

      // 1) Út-előkészítés a szerveren (validál + kontraktus-út)
      const prep = await prepareCsatolmanyUpload({
        iktatoId,
        fileName: feltoltendo.name,
        mimeType: feltoltendo.type,
        meretBytes: feltoltendo.size,
      })
      if (prep.error || !prep.path) {
        errors.push(`${file.name}: ${prep.error || 'a feltöltési út előkészítése sikertelen.'}`)
        continue
      }

      // 2) Feltöltés a privát bucketbe (kliens-oldalról, RLS-policy engedi)
      const { error: upErr } = await supabase.storage
        .from(CSATOLMANY_BUCKET)
        .upload(prep.path, feltoltendo, { contentType: feltoltendo.type, upsert: false })
      if (upErr) {
        errors.push(`${file.name}: a feltöltés sikertelen — ${upErr.message}`)
        continue
      }

      // 3) Metaadat-sor rögzítése
      const reg = await registerCsatolmany({
        iktatoId,
        storagePath: prep.path,
        fileName: feltoltendo.name,
        mimeType: feltoltendo.type,
        meretBytes: feltoltendo.size,
        megjegyzes: pecsetelve ? 'Digitális iktató-pecséttel ellátva' : null,
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
    setUploadWarnings(warnings)
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

  // ── Telefonos feltöltés QR-kóddal (F8d) ─────────────────────
  const [qrOpen, setQrOpen] = useState(false)
  const [qrStarting, setQrStarting] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const [qrSession, setQrSession] = useState<QrMunkamenet | null>(null)
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [qrErkezett, setQrErkezett] = useState(0)
  const [qrHatra, setQrHatra] = useState<number | null>(null)
  const [qrLezarva, setQrLezarva] = useState(false)
  const [qrZarasFolyik, setQrZarasFolyik] = useState(false)

  // A polling „óta" jelzője MINDIG szerver-oldali created_at — a böngésző
  // órája eltérhet az adatbázisétól, abból néma adatvesztés lenne.
  const qrOtaRef = useRef<string | null>(null)
  // Az élő munkamenet azonosítója — a panel bezárásakor visszavonjuk.
  const qrAktivRef = useRef<string | null>(null)
  // A szülő értesítője refben: a szülő minden rendereléskor új függvényt ad,
  // az effekt-függőségben ez másodpercenként újraindítaná a pollingot.
  const onChangedRef = useRef(onChanged)
  useEffect(() => {
    onChangedRef.current = onChanged
  })

  // Biztonsági visszavonás: ha a panelt (dialógust) bezárják, a QR-munkamenet
  // ne éljen tovább a 10 perces lejáratáig.
  useEffect(() => {
    return () => {
      const id = qrAktivRef.current
      qrAktivRef.current = null
      if (id) void closeQrSession(id)
    }
  }, [])

  async function handleQrStart() {
    setQrOpen(true)
    setQrStarting(true)
    setQrError(null)
    setQrSvg(null)
    const { session, error } = await createQrSession(iktatoId)
    setQrStarting(false)
    if (error || !session) {
      setQrError(error || 'A telefonos feltöltés indítása sikertelen.')
      return
    }
    // Innentől számít „újnak" a beérkező csatolmány (szerver-idő alapon).
    qrOtaRef.current = legfrissebbIdo(items)
    qrAktivRef.current = session.sessionId
    setQrSession(session)
    setQrErkezett(session.uploadedCount)
    setQrLezarva(false)
    try {
      const { renderSVG } = await import('uqr')
      setQrSvg(
        renderSVG(session.url, {
          ecc: 'M',
          border: 2,
          pixelSize: 8,
          whiteColor: '#ffffff',
          blackColor: '#111827',
        }),
      )
    } catch {
      setQrError('A QR-kód megjelenítése nem sikerült ebben a böngészőben — próbáld újra.')
    }
  }

  async function handleQrClose() {
    const id = qrSession?.sessionId || qrAktivRef.current
    setQrZarasFolyik(true)
    if (id) {
      const { error } = await closeQrSession(id)
      if (error) toast.error(error)
      else toast.success('A telefonos feltöltés lezárva — a QR-kód érvénytelen.')
    }
    qrAktivRef.current = null
    setQrZarasFolyik(false)
    setQrLezarva(true)
    setQrSession(null)
    setQrSvg(null)
    setQrOpen(false)
    void load()
    onChangedRef.current?.()
  }

  // Visszaszámláló a QR érvényességére
  useEffect(() => {
    if (!qrSession?.expiresAt) {
      setQrHatra(null)
      return
    }
    const lejar = Date.parse(qrSession.expiresAt)
    if (!Number.isFinite(lejar)) return
    const frissit = () => setQrHatra(Math.max(0, Math.round((lejar - Date.now()) / 1000)))
    frissit()
    const id = window.setInterval(frissit, 1000)
    return () => window.clearInterval(id)
  }, [qrSession?.expiresAt])

  // Beérkezés-figyelés: 2,5 mp-es polling, amíg a munkamenet él
  useEffect(() => {
    if (!qrOpen || !qrSession || qrLezarva) return
    let leallt = false
    let idozito: number | undefined

    const kor = async () => {
      // Lejárt munkamenetre nincs több feltöltés — a polling leáll.
      const lejar = Date.parse(qrSession.expiresAt)
      if (Number.isFinite(lejar) && lejar <= Date.now()) {
        if (!leallt) setQrLezarva(true)
        return
      }
      const { ujCsatolmanyok, session } = await pollQrUploads(
        iktatoId,
        qrOtaRef.current,
        qrSession.sessionId,
      )
      if (leallt) return
      if (session) {
        setQrErkezett(session.uploadedCount)
        if (session.status !== 'active') setQrLezarva(true)
      }
      if (ujCsatolmanyok.length > 0) {
        qrOtaRef.current = legfrissebbIdo(ujCsatolmanyok) || qrOtaRef.current
        void load()
        onChangedRef.current?.()
      }
      if (!leallt) idozito = window.setTimeout(() => void kor(), 2500)
    }

    idozito = window.setTimeout(() => void kor(), 2500)
    return () => {
      leallt = true
      if (idozito) window.clearTimeout(idozito)
    }
  }, [qrOpen, qrSession, qrLezarva, iktatoId, load])

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
  const qrLejart = qrHatra !== null && qrHatra <= 0

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
        {/* Rejtett inputok: a capture='environment' a hátsó kamerát nyitja mobilon.
            A kamera-input accept-je SZÁNDÉKOSAN a szűk whitelist (nem image/*):
            iOS-en ez váltja ki az automatikus HEIC→JPEG átkódolást; PDF és
            multiple NÉLKÜL, mert azokkal iOS/Android sima fájlválasztót nyitna
            kamera helyett (a PDF+multiple a másik, tallózó inputon marad). */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
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
        {/* 2026-08-17 (kerületi S5): a kapu `=== 'congregation'` lett. Amit
            elrejt, az GYÜLEKEZETI sajátosság: a QR-munkamenet (upload_sessions
            + qr_register_upload RPC) a MUNKAMENET-SORBÓL veszi a gyülekezetet,
            és nincs megyei/kerületi ága. A régi `!== 'diocese'` alakkal a
            kerületi ügyintéző MEGKAPTA volna a gombot, és a createQrSession
            nyers hibával — vagy rosszabb: idegen gyülekezetbe fűzött
            csatolmánnyal — végződött volna. */}
        {scope === 'congregation' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading || qrStarting}
            onClick={() => (qrOpen ? void handleQrClose() : void handleQrStart())}
          >
            <QrCode data-icon="inline-start" aria-hidden />
            Fotózás telefonnal (QR)
          </Button>
        )}
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

      {/* Digitális iktató-pecsét kapcsoló (F8d) */}
      <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0"
          checked={pecsetelEngedve}
          onChange={(e) => setPecsetelEngedve(e.target.checked)}
          disabled={isUploading}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Stamp className="size-3.5 text-primary" aria-hidden />
            Digitális iktató-pecsét a feltöltött oldalakra
          </span>
          <span className="block text-[11px] leading-snug text-muted-foreground">
            {
              'A kép alá fehér sávban kerül az iktatószám, a dátum, az iratcsomó és a gyülekezet neve (tartalmat sosem takar); PDF-nél a lap alsó margójára. A képek egyben tömörödnek is (2500 px), így gyorsabban töltődnek.'
            }
          </span>
        </span>
      </label>

      {/* ── Telefonos feltöltés QR-kóddal (F8d) ── */}
      {qrOpen ? (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Smartphone className="size-4 text-primary" aria-hidden />
                Fotózás telefonnal
              </p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Olvasd be a kódot a telefon kamerájával — a megnyíló oldalon bejelentkezés nélkül
                fotózhatod be az irat oldalait. A kép a telefonon tömörödik és pecsétet kap.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="QR-munkamenet lezárása"
              disabled={qrZarasFolyik}
              onClick={() => void handleQrClose()}
            >
              <X aria-hidden />
            </Button>
          </div>

          {qrStarting ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Munkamenet indítása…
            </div>
          ) : qrError ? (
            <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-xs text-destructive">{qrError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleQrStart()}>
                Újrapróbálás
              </Button>
            </div>
          ) : qrSession ? (
            <div className="flex flex-col items-center gap-2">
              {qrSvg ? (
                /* A QR-SVG a saját, épp legenerált kódunk (uqr) — nem külső tartalom. */
                <div
                  className="w-52 max-w-full rounded-xl bg-white p-2 shadow-sm [&>svg]:h-auto [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
              )}

              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
                <span className={qrLejart ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                  {qrLejart
                    ? 'A munkamenet lejárt — kérj új kódot.'
                    : `Érvényes még: ${idoSzoveg(qrHatra)}`}
                </span>
                <span className="font-medium text-foreground">
                  Beérkezett képek: {qrErkezett} / {qrSession.maxFiles}
                </span>
              </div>

              {qrLezarva && !qrLejart ? (
                <p className="text-xs text-muted-foreground">A munkamenet lezárult.</p>
              ) : null}

              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {qrLejart || qrLezarva ? (
                  <Button type="button" size="sm" onClick={() => void handleQrStart()}>
                    <QrCode data-icon="inline-start" aria-hidden />
                    Új QR-kód
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={qrZarasFolyik}
                  onClick={() => void handleQrClose()}
                >
                  {qrZarasFolyik ? (
                    <>
                      <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
                      Lezárás…
                    </>
                  ) : (
                    'Munkamenet lezárása'
                  )}
                </Button>
              </div>

              <p className="text-center text-[11px] leading-snug text-muted-foreground">
                A kód {'10'} percig érvényes, és csak ehhez az egy irathoz enged feltöltést. Ha
                végeztél, zárd le a munkamenetet — a QR azonnal érvénytelenné válik.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Feltöltés-folyamat */}
      {isUploading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Feltöltés folyamatban… {uploading.done} / {uploading.total} fájl kész
        </div>
      ) : null}

      {/* Nem végzetes figyelmeztetések (pecsét/tömörítés bukott, a fájl felment) */}
      {uploadWarnings.length > 0 ? (
        <div className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Figyelmeztetések
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Figyelmeztetések bezárása"
              onClick={() => setUploadWarnings([])}
            >
              <X aria-hidden />
            </Button>
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-700 dark:text-amber-400">
            {uploadWarnings.map((uzenet, i) => (
              <li key={i}>{uzenet}</li>
            ))}
          </ul>
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
      ) : loadError ? (
        /* Visszafogott, kontextusban maradó hibadoboz a lista helyén — a
           dialógus többi része (és az irat mentése) zavartalanul működik. */
        <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3">
          <p className="text-xs font-semibold text-destructive">
            A csatolmány-lista nem tölthető be
          </p>
          <p className="text-xs text-destructive">{loadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Újrapróbálás
          </Button>
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

// ─────────────────────────────────────────────────────────────────
// Modul-szintű segédek (F8d)
// ─────────────────────────────────────────────────────────────────

/**
 * A legfrissebb created_at a listából (ISO string) — a QR-polling „óta"
 * jelzője. Szándékosan SZERVER-oldali időbélyeg: a böngésző órája eltérhet
 * az adatbázisétól, abból némán elveszett beérkezés lenne.
 */
function legfrissebbIdo(rows: { created_at: string | null }[]): string | null {
  let legfrissebb: string | null = null
  let legfrissebbMs = Number.NEGATIVE_INFINITY
  for (const row of rows) {
    const ms = Date.parse(row.created_at || '')
    if (Number.isFinite(ms) && ms > legfrissebbMs) {
      legfrissebbMs = ms
      legfrissebb = row.created_at
    }
  }
  return legfrissebb
}

/** mm:ss alakú hátralévő idő a QR-visszaszámlálóhoz. */
function idoSzoveg(mp: number | null): string {
  if (mp === null) return '—'
  const perc = Math.floor(mp / 60)
  const masodperc = mp % 60
  return `${perc}:${String(masodperc).padStart(2, '0')}`
}
