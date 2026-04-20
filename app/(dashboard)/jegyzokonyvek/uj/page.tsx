import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { MinutesImportWizard } from '@/components/minutes/minutes-import-wizard'

export default async function UjJegyzokonyvPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!access.effectiveCongregationId) redirect('/dashboard')

  return (
    <div className="py-6 px-2 sm:px-4">
      <MinutesImportWizard />
    </div>
  )
}
