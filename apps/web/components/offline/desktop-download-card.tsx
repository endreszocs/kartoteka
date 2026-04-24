'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, Download, ExternalLink, Monitor } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const GITHUB_REPO = 'endreszocs/kartoteka'
const GITHUB_API_LATEST = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`

type ReleaseAsset = {
  name: string
  size: number
  url: string
}

type ReleaseInfo = {
  version: string
  publishedAt: string | null
  notesUrl: string
  asset: ReleaseAsset
}

type Availability =
  | { state: 'checking' }
  | { state: 'available'; release: ReleaseInfo }
  | { state: 'unavailable' }
  | { state: 'error'; message: string }

/**
 * Desktop letöltés-kártya a `/offline` oldalon.
 *
 * Forrás: **GitHub Releases** (`https://github.com/endreszocs/kartoteka/releases`).
 * A kártya a GitHub API-ból kérdezi le a legutóbbi (non-prerelease) kiadást,
 * kiválaszt egy Windows installer asset-et (`.exe` vagy `.msi`), és közvetlen
 * linket ad a `browser_download_url`-re.
 *
 * Miért GitHub Releases (nem `public/downloads/`):
 *   - A Railway build nem duzzasztja 15-30 MB-os binárisokkal
 *   - Natív verzió-kezelés (git-tag ⇒ release)
 *   - GitHub CDN gyors
 *   - Release-notes link a lelkésznek: "mi változott?"
 *   - Multi-platform: ha később macOS / Linux build is kell, csak új asset
 *
 * Graceful degradation: ha nincs release, vagy a user offline, a kártya
 * pasztorálisan jelzi az állapotot (nem tör össze).
 */
export function DesktopDownloadCard() {
  const [avail, setAvail] = useState<Availability>({ state: 'checking' })

  useEffect(() => {
    let mounted = true

    void (async () => {
      try {
        const resp = await fetch(GITHUB_API_LATEST, {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-store',
        })
        if (!mounted) return

        if (resp.status === 404) {
          // Még egy release sem létezik — pasztorálisan "készülőben" állapot.
          setAvail({ state: 'unavailable' })
          return
        }

        if (!resp.ok) {
          setAvail({
            state: 'error',
            message: `GitHub API hiba (${resp.status})`,
          })
          return
        }

        const body = (await resp.json()) as {
          tag_name?: string
          name?: string
          published_at?: string | null
          html_url?: string
          assets?: Array<{
            name?: string
            size?: number
            browser_download_url?: string
            content_type?: string
          }>
        }

        const asset = pickWindowsAsset(body.assets ?? [])
        if (!asset) {
          setAvail({ state: 'unavailable' })
          return
        }

        setAvail({
          state: 'available',
          release: {
            version: (body.tag_name ?? body.name ?? '').replace(/^v/, ''),
            publishedAt: body.published_at ?? null,
            notesUrl: body.html_url ?? `${GITHUB_RELEASES_URL}/latest`,
            asset,
          },
        })
      } catch (err) {
        if (mounted) {
          setAvail({
            state: 'error',
            message: err instanceof Error ? err.message : 'Ismeretlen hiba',
          })
        }
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
              A legjobb módja annak, hogy <strong>offline is dolgozhass</strong> a
              tagjaiddal, munkanaplóddal és pénzügyi adataiddal. A böngészőtől
              független, adataid titkosítva a saját gépeden.
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
              <p className="text-xs text-muted-foreground">
                Legfrissebb kiadás keresése…
              </p>
            </>
          )}

          {avail.state === 'available' && (
            <>
              <a
                href={avail.release.asset.url}
                download={avail.release.asset.name}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-violet-700 px-5 text-sm font-medium text-white shadow transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <Download className="mr-2 size-5" />
                Letöltés Windows-ra
              </a>
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
                {avail.release.version && (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-emerald-600" />
                    <span className="font-semibold">v{avail.release.version}</span>
                  </span>
                )}
                <span>{formatMb(avail.release.asset.size)}</span>
                <span>Windows 10/11</span>
                {avail.release.publishedAt && (
                  <span>· Kiadva: {formatHuDate(avail.release.publishedAt)}</span>
                )}
              </div>
              <a
                href={avail.release.notesUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-xs text-violet-700 underline-offset-2 hover:underline"
              >
                Mi újság ebben a verzióban?
                <ExternalLink className="size-3" />
              </a>
            </>
          )}

          {avail.state === 'unavailable' && (
            <>
              <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Clock className="size-5" />
              </div>
              <div className="max-w-md">
                <p className="text-sm font-semibold text-amber-900">
                  A telepítő készülőben
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Még nincs kiadva Windows-telepítő a GitHubon. Kérdezd Endrét
                  (endreszocs@gmail.com), vagy próbáld meg később újra.
                </p>
                <a
                  href={GITHUB_RELEASES_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-amber-900 underline-offset-2 hover:underline"
                >
                  Kiadási lista megnyitása GitHubon
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </>
          )}

          {avail.state === 'error' && (
            <>
              <div className="flex size-10 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <Clock className="size-5" />
              </div>
              <div className="max-w-md">
                <p className="text-sm font-semibold text-rose-900">
                  Nem sikerült a GitHub-lekérdezés
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {avail.message}. Ellenőrizd, hogy van-e internetkapcsolatod, és
                  próbáld újra.
                </p>
                <a
                  href={GITHUB_RELEASES_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-rose-900 underline-offset-2 hover:underline"
                >
                  Kiadási lista közvetlen megnyitása
                  <ExternalLink className="size-3" />
                </a>
              </div>
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
            title="Automatikus frissítés"
            text="Az első telepítés után a desktop alkalmazás magát frissíti a háttérben — új verziónál egy kattintás az újraindítás."
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

/**
 * Windows-installer asset kiválasztása a release assets listájából.
 *
 * Prioritás: `.exe` > `.msi`. A `sig`/`sha256`/stb. metaadatokat kihagyjuk.
 * A NSIS-bundler default-olható `*_x64-setup.exe` mintát vagy `*.msi`-t ad.
 */
function pickWindowsAsset(
  assets: Array<{
    name?: string
    size?: number
    browser_download_url?: string
    content_type?: string
  }>,
): ReleaseAsset | null {
  const candidates = assets
    .filter((a) => !!a.name && !!a.browser_download_url)
    .filter((a) => /\.(exe|msi)$/i.test(a.name!))
    .filter((a) => !/\.(sig|sha256|txt|json)$/i.test(a.name!))
    // Prioritás: .exe előbb, ha van mindkettő
    .sort((a, b) => {
      const aExe = /\.exe$/i.test(a.name!) ? 0 : 1
      const bExe = /\.exe$/i.test(b.name!) ? 0 : 1
      return aExe - bExe
    })

  const pick = candidates[0]
  if (!pick) return null
  return {
    name: pick.name!,
    size: pick.size ?? 0,
    url: pick.browser_download_url!,
  }
}

function formatMb(bytes: number): string {
  if (!bytes || bytes <= 0) return '—'
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`
  return `${mb.toFixed(1)} MB`
}

function formatHuDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`
  } catch {
    return iso
  }
}
