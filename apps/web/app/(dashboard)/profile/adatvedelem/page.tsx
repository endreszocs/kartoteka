import { redirect } from 'next/navigation'
import { ArrowLeftCircle, ShieldCheck } from 'lucide-react'

import { AdatexportPanel } from '@/components/profile/adatvedelem/adatexport-panel'
import { BetekintesPanel } from '@/components/profile/adatvedelem/betekintes-panel'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * Profil → Adataim és adatvédelem (2026-08-23).
 *
 * Két ígéretet vált be, amit a jogi dokumentumok tesznek:
 *   · Adatvédelmi tájékoztató 18. szakasz — betekintés-kimutatás;
 *   · Adatvédelmi tájékoztató 9. szakasz + ÁSZF 12. pont — géppel olvasható
 *     adatexport (adathordozhatóság, megszűnéskori adatkiadás).
 *
 * A hatókör-ellenőrzés a szerver-akciókban fut (fail-closed) — ez az oldal
 * csak a bejelentkezést követeli meg, hogy a „nincs gyülekezeted" eset is
 * SZÉP MAGYAR MAGYARÁZATOT kapjon a paneleken belül, ne hibaoldalt.
 */
export const metadata = {
  title: 'Adataim és adatvédelem · Kartotéka',
  description: 'Betekintés-kimutatás és teljes gyülekezeti adatexport.',
}

export default async function AdatvedelemPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">
            Profilom
          </p>
          <h1 className="mt-1 flex items-center gap-2 font-heading text-2xl text-slate-800">
            <ShieldCheck className="size-5 text-teal-700" />
            Adataim és adatvédelem
          </h1>
        </div>
        <a
          href="/profile"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeftCircle className="size-3.5" />
          Profilom
        </a>
      </div>

      <p className="text-sm leading-6 text-slate-600">
        Itt megnézheted, ki és mikor nyúlt a gyülekezet adataihoz, és egy gombbal letöltheted a
        gyülekezet teljes adatállományát géppel olvasható formában. Mindkettő kizárólag a saját
        hatókörödben működik: más gyülekezet adatát a rendszer nem adja ki.
      </p>

      <BetekintesPanel />
      <AdatexportPanel />
    </div>
  )
}
