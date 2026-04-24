'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, Download, Monitor } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type Availability =
  | { state: 'checking' }
  | { state: 'available'; version: string | null; sizeKb: number | null }
  | { state: 'unavailable' }
  | { state: 'error' }

/**
 * Desktop letöltés-kártya a /offline oldalon.
 *
 * A kártya a public/downloads/kartoteka-setup.exe fájl elérhetőségét
 * HEAD-request-tel ellenőrzi. Ha van: aktív letöltés-gomb + verzió. Ha
 * nincs: "Készülőben" pasztorális üzenet.
 *
 * A verzió-szöveg a public/downloads/kartoteka-setup-version.txt-ből jön
 * (egy soros text); ha hiányzik, nincs verzió-kijelzés.
 */
export function DesktopDownloadCard() {
  const [avail, setAvail] = useState<Availability>({ state: 'checking' })

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const head = await fetch('/downloads/kartoteka-setup.exe', { method: 'HEAD' })
        if (!mounted) return

        if (!head.ok) {
          setAvail({ state: 'unavailable' })
          return
        }

        const sizeHdr = head.headers.get('content-length')
        const sizeKb = sizeHdr ? Math.round(Number(sizeHdr) / 1024) : null

        // Version-text (külön kérés, csendesen hibázik)
        let version: string | null = null
        try {
          const vResp = await fetch('/downloads/kartoteka-setup-version.txt', {
            cache: 'no-cache',
          })
          if (vResp.ok) {
            const text = (await vResp.text()).trim()
            if (text && text.length < 40) version = text
          }
        } catch {
          /* csendes */
        }

        if (mounted) setAvail({ state: 'available', version, sizeKb })
      } catch {
        if (mounted) setAvail({ state: 'error' })
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
            <Monitor className="size-5" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg text-violet-900">
              Kartotéka asztali alkalmazás
            </CardTitle>
            <CardDescription className="text-sm">
              A legjobb módja annak, hogy **offline is dolgozhass** a tagjaiddal,
              munkanaplóddal és pénzügyi adataiddal. A böngészőtől független,
              adataid titkosítva a saját gépeden.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Letöltés gomb + állapot */}
        <div className="flex flex-col items-center gap-3 rounded-lg border border-violet-100 bg-white p-5 text-center">
          {avail.state === 'checking' && (
            <>
              <div className="size-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
              <p className="text-xs text-muted-foreground">Letöltés-link ellenőrzése…</p>
            </>
          )}

          {avail.state === 'available' && (
            <>
              <a
                href="/downloads/kartoteka-setup.exe"
                download
                className="inline-flex h-11 items-center justify-center rounded-xl bg-violet-700 px-5 text-sm font-medium text-white shadow transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <Download className="mr-2 size-5" />
                Letöltés Windows-ra
              </a>
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
                {avail.version && (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-emerald-600" />
                    <span className="font-semibold">v{avail.version}</span>
                  </span>
                )}
                {avail.sizeKb !== null && (
                  <span>{formatMbFromKb(avail.sizeKb)}</span>
                )}
                <span>Windows 10/11</span>
              </div>
            </>
          )}

          {avail.state === 'unavailable' && (
            <>
              <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Clock className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  A telepítő készülőben
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A desktop alkalmazás legutóbbi kiadása még nincs feltöltve ide.
                  Kérdezz Endrétől (endreszocs@gmail.com), vagy próbáld meg
                  később újra.
                </p>
              </div>
            </>
          )}

          {avail.state === 'error' && (
            <>
              <div className="flex size-10 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <Clock className="size-5" />
              </div>
              <p className="text-sm text-rose-900">
                Nem tudtam leellenőrizni a letöltést. Próbáld meg újratölteni az
                oldalt.
              </p>
            </>
          )}
        </div>

        {/* Miért desktop? */}
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <FeatureItem
            title="Offline-elsőség"
            text="Az adatok a saját gépeden élnek, titkosítva. Interneted nélkül is felveszel tagot, munkanaplót, pénzügyi tételt — a szinkron automatikus, amint online leszel."
          />
          <FeatureItem
            title="Gyors és csendes"
            text="Nincs böngésző-tab, nincs késleltetés. A lista 500+ taggal is azonnal szűrhető."
          />
          <FeatureItem
            title="Saját PIN-kóddal"
            text="Bejelentkezés után offline-állapotban is megvéded egy PIN-nel, hogy más ne férjen az adatokhoz ugyanazon a gépen."
          />
          <FeatureItem
            title="Ugyanaz az adatkör"
            text="A webappal teljes szinkronban dolgozik — ugyanazon a Supabase adatbázison."
          />
        </div>
      </CardContent>
    </Card>
  )
}

function FeatureItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex gap-2">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-violet-700" />
      <div>
        <p className="text-[13px] font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

function formatMbFromKb(kb: number): string {
  if (kb < 1024) return `${kb} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}
