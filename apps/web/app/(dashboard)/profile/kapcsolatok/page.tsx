import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { lelkesziSzerepbenE } from '@/lib/profile-roles/aktiv-szerep'
import { listMyCongregationAssignments } from './actions'
import { PastorAssignmentsClient } from '@/components/profile/pastor-assignments-client'

export const metadata = {
  title: 'Hozzáférési kérések · Kartotéka',
  description: 'Gyülekezeti hozzáférési kérések kezelése.',
}

export default async function KapcsolatokPage() {
  const access = await getEffectiveAccessContext()

  if (!access.user || !access.profile) redirect('/login')

  // 2026-09-05 (P3-utómunka): az oldal eddig a legacy `profiles.role` skalárból
  // döntött (`access.role !== 'lelkesz'`), a profil-dialógus linkje és az akciók
  // viszont az AKTÍV szerepből — a könyvelői profilra váltott lelkész beért az
  // oldalra, ahol minden akció elutasította. EGY feloldó mind a négy helyen.
  if (!lelkesziSzerepbenE(access)) {
    redirect('/dashboard')
  }

  const result = await listMyCongregationAssignments()
  const assignments = result.data ?? []

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero — a lelkész az egész gyülekezet gazdája, ez itt a fókusz */}
      <div className="card-raised relative mb-6 overflow-hidden p-6 sm:p-8">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-teal-200/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-amber-200/30 blur-3xl" />

        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">
            Gyülekezeti hozzáférések
          </p>
          <h1 className="mt-2 font-heading text-3xl text-slate-800 sm:text-4xl">
            Hozzáférési kérések
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            A gyülekezet adataihoz kizárólag a Te engedélyeddel férhet hozzá könyvelő
            vagy egyházmegyei számvevő. Itt láthatod a beérkezett kéréseket és dönthetsz
            róluk. Bármikor visszavonhatod a korábban adott engedélyt.
          </p>
          {result.error && (
            <p className="mt-2 text-xs font-medium text-red-600">
              {result.error}
            </p>
          )}
        </div>
      </div>

      {/* A tényleges lista + interaktív jóváhagyás — kliens komponens */}
      <PastorAssignmentsClient initialAssignments={assignments} />
    </div>
  )
}
