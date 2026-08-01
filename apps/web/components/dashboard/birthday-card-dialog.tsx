'use client'

/**
 * Születésnapi ÜDVÖZLŐKÁRTYA (2026-08-01, PR-19).
 *
 * A születésnapos listáról nyitható: egy tagnak (egyéni kártya) vagy a teljes
 * szűrt listának (havi/listás kártya) készít elegáns, a kert-téma arculatára
 * szabott kártyát, amely:
 *   - PNG-ként letölthető (közösségi médiához, 2× felbontásban),
 *   - mobilon natívan megosztható (Web Share API, fájlként),
 *   - nyomtatható (a kép A4-re középre igazítva, printToBrowser úton).
 *
 * Render-technika: a kártya VALÓDI DOM-ként renderelődik a dialógusban —
 * a látható előnézet CSS-scale-lel kicsinyített, a képkészítés viszont egy
 * rejtett, teljes méretű (1080px széles) példányról történik html2canvas-szal
 * (így az app betűi — Fraunces — és színei pixelre pontosan a képre kerülnek).
 * A címert data-URL-lé alakítjuk (CORS-mentes canvas-render, voter-print minta).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Gift, Printer, Share2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { printToBrowser } from '@/lib/utils/print-engine-v2'

export interface BirthdayCardPerson {
  id: string
  /** Már formázott megjelenítendő név (előtaggal) */
  name: string
  /** 0-alapú hónap */
  month: number
  day: number
  /** Az idén betöltött/betöltendő életkor */
  age: number
}

interface BirthdayCardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A lista-dialógus AKTUÁLIS szűrt találatai (nap szerint rendezve) */
  people: BirthdayCardPerson[]
  /** Ha adott, egyéni módban ez a tag van előre kiválasztva */
  initialPersonId: string | null
  congregationName: string
  congregationLogo?: string | null
}

const MONTH_NAMES = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
]

const DEFAULT_BLESSING = '„Áldjon meg téged az Úr, és őrizzen meg téged!" (4Móz 6,24)'

/** A listás kártyán még olvasható maximális névsor-hossz */
const LIST_CARD_MAX = 24

type CardMode = 'single' | 'list'

export function BirthdayCardDialog({
  open,
  onOpenChange,
  people,
  initialPersonId,
  congregationName,
  congregationLogo,
}: BirthdayCardDialogProps) {
  const [mode, setMode] = useState<CardMode>('single')
  const [personId, setPersonId] = useState<string | null>(null)
  const [showAge, setShowAge] = useState(true)
  const [message, setMessage] = useState('')
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'png' | 'share' | 'print'>(null)
  const captureRef = useRef<HTMLDivElement>(null)

  // Nyitáskor: mód + kiválasztott tag + üzenet reset; címer → data-URL
  useEffect(() => {
    if (!open) return
    setMode(initialPersonId ? 'single' : 'list')
    setPersonId(initialPersonId ?? people[0]?.id ?? null)
    setShowAge(true)
    setMessage('')
    let cancelled = false
    if (congregationLogo) {
      fetch(congregationLogo)
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
        .then((blob) => new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('read'))
          reader.readAsDataURL(blob)
        }))
        .then((dataUrl) => { if (!cancelled) setLogoDataUrl(dataUrl) })
        .catch(() => { if (!cancelled) setLogoDataUrl(null) })
    } else {
      setLogoDataUrl(null)
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPersonId])

  const person = useMemo(
    () => people.find((p) => p.id === personId) ?? people[0] ?? null,
    [people, personId],
  )

  // A listás kártya hónap-címe: ha minden találat egy hónapba esik, a hónap
  // neve; különben általános cím.
  const listTitle = useMemo(() => {
    const months = [...new Set(people.map((p) => p.month))]
    if (months.length === 1) return `${MONTH_NAMES[months[0]]}i születésnaposaink`
    return 'Születésnaposaink'
  }, [people])

  const listPeople = people.slice(0, LIST_CARD_MAX)
  const listOverflow = people.length - listPeople.length

  const fileBase = mode === 'single' && person
    ? `szuletesnapi-kartya-${person.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}`
    : 'szuletesnaposaink-kartya'

  async function renderToBlob(): Promise<Blob | null> {
    const node = captureRef.current
    if (!node) return null
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      backgroundColor: null,
      logging: false,
    })
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  }

  async function handleDownload() {
    setBusy('png')
    try {
      const blob = await renderToBlob()
      if (!blob) throw new Error('render')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileBase}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      toast.success('A kártya képként letöltve — megosztható közösségi médiában.')
    } catch {
      toast.error('A kép elkészítése nem sikerült. Próbáld újra.')
    } finally {
      setBusy(null)
    }
  }

  async function handleShare() {
    setBusy('share')
    try {
      const blob = await renderToBlob()
      if (!blob) throw new Error('render')
      const file = new File([blob], `${fileBase}.png`, { type: 'image/png' })
      const shareData: ShareData = {
        files: [file],
        title: mode === 'single' && person ? `Isten éltesse, ${person.name}!` : listTitle,
      }
      if (typeof navigator.canShare === 'function' && navigator.canShare(shareData)) {
        await navigator.share(shareData)
      } else {
        // Fallback: letöltés + útmutató
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${fileBase}.png`
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 10000)
        toast.info('Ezen az eszközön nincs közvetlen megosztás — a képet letöltöttük, innen töltheted fel a közösségi oldalra.')
      }
    } catch (e) {
      // A user által megszakított share nem hiba
      if (!(e instanceof Error && e.name === 'AbortError')) {
        toast.error('A megosztás nem sikerült. Próbáld a „Kép letöltése" gombot.')
      }
    } finally {
      setBusy(null)
    }
  }

  async function handlePrint() {
    setBusy('print')
    try {
      const blob = await renderToBlob()
      if (!blob) throw new Error('render')
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('read'))
        reader.readAsDataURL(blob)
      })
      // A4-re középre igazított kép — a nyomat pixelre azonos a letöltött képpel
      const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8">
        <title>Születésnapi üdvözlőkártya</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { width: 210mm; min-height: 297mm; display: flex; align-items: center; justify-content: center; background: #fff; }
          img { width: 170mm; height: auto; }
        </style></head>
        <body><img src="${dataUrl}" alt="Üdvözlőkártya"/></body></html>`
      await printToBrowser(html)
    } catch {
      toast.error('A nyomtatás nem sikerült. Próbáld újra.')
    } finally {
      setBusy(null)
    }
  }

  // ── A kártya DOM-ja (közös az előnézethez és a képkészítéshez) ──────────
  // FIGYELEM (html2canvas-korlátok, PR-14 tanulságok mintájára): NINCS CSS
  // outline, NINCS column-count, NINCS radial-gradient — mind kimaradna a
  // képből. Helyettük: beágyazott keret-div, flex-oszlopok, linear-gradient.
  function CardArt() {
    const isSingle = mode === 'single' && person
    const dateLabel = isSingle && person
      ? `${MONTH_NAMES[person.month]} ${person.day}.`
      : new Date().getFullYear().toString()
    const colCount = listPeople.length > 12 ? 2 : 1
    const perCol = Math.ceil(listPeople.length / colCount)
    const columns = [listPeople.slice(0, perCol), listPeople.slice(perCol)].filter((c) => c.length > 0)
    return (
      <div
        style={{
          width: 1080,
          minHeight: mode === 'single' ? 1080 : 1350,
          background: 'linear-gradient(180deg, #2f5d55 0%, #264e4a 42%, #1a3833 100%)',
          color: '#f3f1ec',
          fontFamily: 'var(--font-sans, Georgia, serif)',
          display: 'flex',
          flexDirection: 'column',
          padding: 40,
        }}
      >
        {/* dupla arany keret (külső vékony + belső vastag) */}
        <div
          style={{
            flex: 1,
            border: '1px solid rgba(243,192,97,0.4)',
            borderRadius: 24,
            padding: 8,
            display: 'flex',
          }}
        >
        <div
          style={{
            flex: 1,
            border: '3px solid rgba(243,192,97,0.85)',
            borderRadius: 18,
            padding: mode === 'single' ? '64px 72px' : '52px 64px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          {/* címer + gyülekezet */}
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUrl} alt="" style={{ width: 128, height: 128, objectFit: 'contain', marginBottom: 18 }} />
          ) : (
            <div style={{ fontSize: 84, lineHeight: 1, marginBottom: 18 }}>⛪</div>
          )}
          <div style={{ fontSize: 30, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#d9d4c7', fontWeight: 600 }}>
            {congregationName}
          </div>

          <div style={{ width: 220, height: 2, background: 'linear-gradient(90deg, transparent, #f3c061, transparent)', margin: '30px 0' }} />

          {mode === 'single' && person ? (
            <>
              <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 88, lineHeight: 1.1, color: '#f6e7bd', fontWeight: 600 }}>
                Isten éltesse!
              </div>
              <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 58, lineHeight: 1.25, marginTop: 40, fontWeight: 600 }}>
                {person.name}
              </div>
              <div style={{ fontSize: 32, marginTop: 22, color: '#c9d6b8' }}>
                {dateLabel}
                {showAge ? ` · ${person.age}. születésnap` : ''}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 62, lineHeight: 1.15, color: '#f6e7bd', fontWeight: 600 }}>
                {listTitle}
              </div>
              <div style={{ fontSize: 26, marginTop: 10, color: '#c9d6b8' }}>{dateLabel}</div>
              <div style={{ marginTop: 34, width: '100%', display: 'flex', gap: 48, textAlign: 'left' }}>
                {columns.map((col, ci) => (
                  <div key={ci} style={{ flex: 1, fontSize: colCount === 2 ? 27 : 32, lineHeight: 1.75 }}>
                    {col.map((p) => (
                      <div key={p.id} style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                        <span style={{ color: '#f3c061', fontWeight: 700, minWidth: 64 }}>
                          {String(p.month + 1).padStart(2, '0')}.{String(p.day).padStart(2, '0')}.
                        </span>
                        <span>
                          {p.name}
                          {showAge ? <span style={{ color: '#9fb28f', fontSize: '0.78em' }}> ({p.age})</span> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {listOverflow > 0 && (
                <div style={{ marginTop: 14, fontSize: 24, color: '#c9d6b8' }}>
                  … és további {listOverflow} ünnepelt
                </div>
              )}
            </>
          )}

          <div style={{ flex: 1 }} />

          {message.trim() && (
            <div style={{ fontSize: 30, lineHeight: 1.5, color: '#f3f1ec', maxWidth: 780, marginBottom: 26 }}>
              {message.trim()}
            </div>
          )}
          <div style={{ fontStyle: 'italic', fontSize: 27, lineHeight: 1.5, color: '#d9d4c7', maxWidth: 820 }}>
            {DEFAULT_BLESSING}
          </div>
        </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-[1.5rem] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
              <Gift className="size-4" />
            </span>
            Születésnapi üdvözlőkártya
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* ── Beállítások ── */}
          <div className="space-y-3">
            <div className="space-y-2 rounded-2xl border border-border/60 bg-background/50 p-3">
              <Label className="font-semibold text-foreground">Kártya típusa</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={`min-h-11 rounded-xl border px-2 text-sm font-medium transition ${
                    mode === 'single' ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  Egy ünnepelt
                </button>
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  className={`min-h-11 rounded-xl border px-2 text-sm font-medium transition ${
                    mode === 'list' ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  Lista ({people.length} fő)
                </button>
              </div>

              {mode === 'single' && (
                <div className="space-y-1 pt-1">
                  <Label htmlFor="bc-person" className="text-xs text-muted-foreground">Ünnepelt</Label>
                  <select
                    id="bc-person"
                    value={person?.id ?? ''}
                    onChange={(e) => setPersonId(e.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-sm"
                  >
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {String(p.month + 1).padStart(2, '0')}.{String(p.day).padStart(2, '0')}. — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={showAge} onChange={(e) => setShowAge(e.target.checked)} className="size-4" />
                Életkor megjelenítése
              </label>

              <div className="space-y-1">
                <Label htmlFor="bc-message" className="text-xs text-muted-foreground">Saját üzenet (opcionális)</Label>
                <textarea
                  id="bc-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={220}
                  rows={3}
                  placeholder="Pl. Szeretettel köszöntünk a gyülekezet közösségében!"
                  className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm shadow-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button className="min-h-11 rounded-xl" onClick={() => void handleDownload()} disabled={!!busy || people.length === 0}>
                <Download className="size-4" />
                {busy === 'png' ? 'Készítés…' : 'Kép letöltése (PNG)'}
              </Button>
              <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => void handleShare()} disabled={!!busy || people.length === 0}>
                <Share2 className="size-4" />
                {busy === 'share' ? 'Megosztás…' : 'Megosztás'}
              </Button>
              <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => void handlePrint()} disabled={!!busy || people.length === 0}>
                <Printer className="size-4" />
                {busy === 'print' ? 'Előkészítés…' : 'Nyomtatás'}
              </Button>
            </div>

            <p className="rounded-xl border border-border/60 bg-muted/40 p-2.5 text-[11px] leading-4 text-muted-foreground">
              Közösségi médiában való megosztás előtt győződj meg róla, hogy az
              ünnepelt hozzájárult neve (és életkora) nyilvános közléséhez.
            </p>
          </div>

          {/* ── Előnézet (kicsinyített) ── */}
          <div className="overflow-hidden rounded-[22px] border border-border bg-muted/40 p-3">
            <div className="mx-auto w-full max-w-[440px]">
              <div style={{ width: '100%', aspectRatio: mode === 'single' ? '1 / 1' : '1080 / 1350', position: 'relative', overflow: 'hidden', borderRadius: 12 }}>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 1080,
                    transformOrigin: 'top left',
                    // 440px-es kereten belülre skálázzuk (a szélesség vezérel)
                    transform: 'scale(var(--bc-scale, 0.4))',
                  }}
                  ref={(el) => {
                    if (!el) return
                    const parent = el.parentElement
                    if (!parent) return
                    const scale = parent.clientWidth / 1080
                    el.style.setProperty('--bc-scale', String(scale))
                  }}
                >
                  <CardArt />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Rejtett, TELJES méretű példány — ebből készül a PNG */}
        <div style={{ position: 'fixed', left: -12000, top: 0, pointerEvents: 'none' }} aria-hidden="true">
          <div ref={captureRef}>
            <CardArt />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
