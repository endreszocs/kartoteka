import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Wrench } from 'lucide-react'

import { BrowserOfflineCard } from '@/components/offline/browser-offline-card'
import { DesktopDownloadCard } from '@/components/offline/desktop-download-card'
import { ModuleHero } from '@/components/shared/module-hero'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * `/offline` — az offline-elsőség kezdőlapja.
 *
 * Három szekció:
 *   1. Hero + desktop letöltés kártya (DesktopDownloadCard)
 *   2. Böngésző-offline magyarázó kártya (BrowserOfflineCard)
 *   3. Admin/master/egyházkerületi admin → link a /offline/diagnostika
 *      oldalra (a régi 6-fázisos webes Dexie-diagnosztika)
 *
 * A korábbi 6-fázisos tartalom átkerült a /offline/diagnostika route-ra,
 * ez az oldal a lelkész **napi** igényeit szolgálja: desktop letöltés +
 * egyszerű böngésző-offline magyarázat.
 */
export default async function OfflinePage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')

  const isAdmin = !!access.admin || !!access.master || !!access.egyhazkeruletiAdmin

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Offline mentés"
        title="Dolgozz interneten kívül is"
        description="A Kartotéka két módon érhető el offline: az asztali alkalmazás saját, titkosított adatbázissal, vagy a böngészős verzió, amely automatikusan szinkronizál amint újra van kapcsolat."
        pills={[
          { label: 'Desktop app', tone: 'violet' },
          { label: 'PWA böngésző', tone: 'sky' },
          { label: 'Automatikus szinkron', tone: 'emerald' },
        ]}
      />

      {/* 1) Elsődleges: desktop letöltés */}
      <DesktopDownloadCard />

      {/* 2) Fallback: böngésző-offline */}
      <BrowserOfflineCard />

      {/* 3) Admin-only diagnosztika link */}
      {isAdmin && (
        <Link
          href="/offline/diagnostika"
          className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-violet-200 hover:bg-violet-50/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 group-hover:bg-violet-100 group-hover:text-violet-700">
              <Wrench className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">
                Fejlesztői diagnosztika
              </p>
              <p className="text-xs text-muted-foreground">
                Cache, pending queue, Excel export, teljes backup — csak admin-nézet
              </p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-violet-700" />
        </Link>
      )}
    </div>
  )
}
