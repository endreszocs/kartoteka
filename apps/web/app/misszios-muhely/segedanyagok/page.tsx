import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { loadMaterialsPage } from '../community-actions'
import { MaterialGrid } from '@/components/muhely/materials/material-grid'
import { BookOpen } from 'lucide-react'

export default async function SegedanyagokPage() {
  const { user, admin } = await getEffectiveAccessContext()
  if (!user) redirect('/login')

  const data = await loadMaterialsPage()
  if ('error' in data) redirect('/login')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl text-slate-800">Segédanyag-tár</h1>
          <p className="text-sm text-slate-500">Hasznos anyagok a szolgálathoz — oszd meg te is, amivel segíthetsz</p>
        </div>
      </div>

      <MaterialGrid
        materials={data.materials}
        categories={data.categories}
        currentUserId={user.id}
        isAdmin={admin}
      />
    </div>
  )
}
