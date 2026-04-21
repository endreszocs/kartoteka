import { redirect, notFound } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getMinutesById } from '../actions'
import { MinutesEditor } from '@/components/minutes/minutes-editor'

export default async function JegyzokonyvSzerkesztoPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!access.effectiveCongregationId) redirect('/dashboard')

  const { id } = await params
  const data = await getMinutesById(id)
  if (!data) notFound()

  // A napirendi pontokhoz rendeljük a határozatokat
  const napirendi_pontok = (data.napirendi_pontok || []).map((np: Record<string, unknown>) => ({
    ...np,
    hatarozatok: (data.hatarozatok || []).filter(
      (h: Record<string, unknown>) => h.napirendi_pont_id === np.id
    ),
  }))

  return (
    <div className="max-w-screen-xl mx-auto py-6 px-2 sm:px-4">
      <MinutesEditor
        congregationName={access.congregationName || 'Református Egyházközség'}
        initialData={{
          id: data.id,
          tipus: data.tipus || 'presbiteri',
          datum: data.datum,
          hely: data.hely || '',
          kezdes: data.kezdes || '',
          zaras: data.zaras || '',
          elnok_neve: data.elnok_neve || '',
          jegyzo_neve: data.jegyzo_neve || '',
          hitelesito1: data.hitelesito1 || '',
          hitelesito2: data.hitelesito2 || '',
          igevers: data.igevers || '',
          felolvasas: data.felolvasas || '',
          megjegyzes: data.megjegyzes || '',
          allapot: data.allapot || 'draft',
          resztvevok: data.resztvevok || [],
          napirendi_pontok,
          hatarozatok: data.hatarozatok || [],
        }}
      />
    </div>
  )
}
