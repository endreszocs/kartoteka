import { redirect } from 'next/navigation'

import { PresentationStudio } from '@/components/presentation/presentation-studio'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getPresentationData } from './actions'

interface PageProps {
  searchParams?: Promise<{ year?: string }>
}

export default async function PresentationPage({ searchParams }: PageProps) {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!access.effectiveCongregationId) redirect('/dashboard')

  const params = (await searchParams) || {}
  const currentYear = new Date().getFullYear()
  // 2026-08-10 (P1 JAVÍTÁS): a `?year=abc` eddig NaN-t adott, abból
  // 'NaN-01-01' dátum-literálok lettek, a PostgREST 400-zal elszállt és az
  // egész oldal 500-as hibára futott. A testvér-oldal (/eves-jelentes) már
  // őrizte ezt — most itt is: érvénytelen vagy tartományon kívüli év esetén
  // az aktuális évre esünk vissza.
  const parsedYear = params.year ? Number.parseInt(params.year, 10) : currentYear
  const year = Number.isFinite(parsedYear) && parsedYear >= 1900 && parsedYear <= 2999
    ? parsedYear
    : currentYear

  const result = await getPresentationData(year)
  if (!result.data) {
    return (
      <div className="mx-auto max-w-2xl rounded-[1.2rem] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        {result.error || 'Nem sikerült betölteni az adatokat.'}
      </div>
    )
  }

  // 2026-08-10: a `key` az év + gyülekezet párra — így az Év mező átállításakor
  // a Studio ÚJRA MOUNTOL: friss adatot kap, és az adott évhez tartozó mentett
  // szövegeket/beállításokat tölti be (a kliens-állapot nem ragad be a régi évnél).
  return (
    <PresentationStudio
      key={`${result.data.congregation.id}:${result.data.year}`}
      initialData={result.data}
    />
  )
}
