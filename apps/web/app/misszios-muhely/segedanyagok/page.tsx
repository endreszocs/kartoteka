import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { loadMaterialsPage } from '../community-actions'
import { MaterialGrid } from '@/components/muhely/materials/material-grid'
import { MuhelyPageIntro } from '@/components/muhely/shared/muhely-page-intro'
import { BookOpen, LibraryBig } from 'lucide-react'

export default async function SegedanyagokPage() {
  const { user, profile } = await getEffectiveAccessContext()
  if (!user) redirect('/login')
  const isWorkshopAdmin =
    profile?.status === 'active' &&
    ['admin', 'esperes', 'egyhazmegyei_admin'].includes(profile.role)

  const data = await loadMaterialsPage()
  if ('error' in data) redirect('/login')

  return (
    <div className="mx-auto w-full max-w-[1380px] space-y-7 pb-8 sm:space-y-9">
      <MuhelyPageIntro
        eyebrow="Műhelypolc"
        title="Kézbe vehető segítség a szolgálathoz."
        description="Prédikációvázlatok, liturgiai ötletek és kipróbált gyülekezeti anyagok egy napfényes közös polcon. Nézz körül nyugodtan — vagy tedd mellé azt, ami nálatok már gyümölcsöt termett."
        imageSrc="/misszios-muhely/workshop-shelf-illustration-v2.png"
      >
        <div className="flex flex-wrap gap-2.5 text-xs text-[#5f655d]">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#ded1be] bg-white/70 px-3 py-1.5">
            <BookOpen className="h-3.5 w-3.5 text-[#647a52]" />
            {data.materials.length} megosztott anyag
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#ded1be] bg-white/70 px-3 py-1.5">
            <LibraryBig className="h-3.5 w-3.5 text-[#c87552]" />
            {data.categories.length} témakör
          </span>
        </div>
      </MuhelyPageIntro>

      <MaterialGrid
        materials={data.materials}
        categories={data.categories}
        currentUserId={user.id}
        isAdmin={isWorkshopAdmin}
      />
    </div>
  )
}
