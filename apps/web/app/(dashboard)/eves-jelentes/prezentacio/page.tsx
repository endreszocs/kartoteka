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
  const year = params.year ? parseInt(params.year, 10) : currentYear

  const result = await getPresentationData(year)
  if (!result.data) {
    return (
      <div className="mx-auto max-w-2xl rounded-[1.2rem] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        {result.error || 'Nem sikerült betölteni az adatokat.'}
      </div>
    )
  }

  return <PresentationStudio initialData={result.data} />
}
