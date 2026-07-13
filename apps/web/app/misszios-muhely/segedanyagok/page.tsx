import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { loadMaterialsPage } from '../community-actions'
import { MaterialGrid } from '@/components/muhely/materials/material-grid'
import { MaterialShelfHero } from '@/components/muhely/materials/material-shelf-hero'
import styles from '@/components/muhely/materials/materials-studio.module.css'

export default async function SegedanyagokPage() {
  const { user, profile } = await getEffectiveAccessContext()
  if (!user) redirect('/login')
  const isWorkshopAdmin =
    profile?.status === 'active' &&
    ['admin', 'esperes', 'egyhazmegyei_admin'].includes(profile.role)

  const data = await loadMaterialsPage()
  if ('error' in data) redirect('/login')

  return (
    <div className={styles.page}>
      <MaterialShelfHero
        materialCount={data.materials.length}
        categoryCount={data.categories.length}
      />

      <MaterialGrid
        materials={data.materials}
        categories={data.categories}
        currentUserId={user.id}
        isAdmin={isWorkshopAdmin}
      />
    </div>
  )
}
