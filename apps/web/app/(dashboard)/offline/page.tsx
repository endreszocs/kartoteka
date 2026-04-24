import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, BookOpen, Wrench } from 'lucide-react'

import { BrowserOfflineCard } from '@/components/offline/browser-offline-card'
import { DesktopDownloadCard } from '@/components/offline/desktop-download-card'
import { ModuleHero } from '@/components/shared/module-hero'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * `/offline` — az offline-elsőség kezdőlapja.
 *
 * Layout (mobile-first → grid 2-oszlopos lg+ képernyőn):
 *   - Hero (ModuleHero) — teljes szélességű
 *   - DesktopDownloadCard — teljes szélességű hangsúlyos CTA (lg-ben is 1 oszlop)
 *   - 2-oszlopos blokk (lg-ben):
 *       · bal: BrowserOfflineCard — PWA fallback
 *       · jobb: segédanyagok + (admin-only) diagnosztika link
 *
 * A korábbi lineáris elrendezés (minden egymás alatt) felváltva dobozos
 * grid-el, hogy a lelkész egyszerre lássa a lényeget.
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

      {/* Elsődleges: desktop letöltés — hangsúlyos, teljes szélességű */}
      <DesktopDownloadCard />

      {/* Alsó rács: PWA fallback + segédanyagok/diag egymás mellett */}
      <div className="grid gap-5 lg:grid-cols-2">
        <BrowserOfflineCard />

        <div className="flex flex-col gap-4">
          <HelpResourcesCard />
          {isAdmin && <DiagnosticsLinkCard />}
        </div>
      </div>
    </div>
  )
}

function HelpResourcesCard() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <BookOpen className="size-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">Segédanyagok</h3>
          <p className="text-xs text-muted-foreground">
            Gyors beállítás, tippek, gyakran feltett kérdések
          </p>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm text-slate-700">
        <li className="flex gap-2">
          <span className="mt-1 size-1 shrink-0 rounded-full bg-emerald-600" />
          <span>
            A <strong>bejelentkezés ugyanaz</strong> mindkettőn — e-mail + jelszó, és
            ha offline leszel, egy PIN-kóddal folytathatod az asztalin.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1 size-1 shrink-0 rounded-full bg-emerald-600" />
          <span>
            Az <strong>első szinkron</strong> a telepítés után 1-2 percet is igénybe
            vehet, de csak egyszer — utána már minden helyben van.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1 size-1 shrink-0 rounded-full bg-emerald-600" />
          <span>
            Ha elakadsz, a KARTOTEKA rendszer <strong>automatikusan szinkronizál</strong>{' '}
            a háttérben — nem kell manuálisan tenned semmit.
          </span>
        </li>
      </ul>
    </div>
  )
}

function DiagnosticsLinkCard() {
  return (
    <Link
      href="/offline/diagnostika"
      className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-violet-200 hover:bg-violet-50/50"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 group-hover:bg-violet-100 group-hover:text-violet-700">
          <Wrench className="size-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-900">Fejlesztői diagnosztika</p>
          <p className="text-xs text-muted-foreground">
            Cache, pending queue, Excel export — csak admin-nézet
          </p>
        </div>
      </div>
      <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-violet-700" />
    </Link>
  )
}
