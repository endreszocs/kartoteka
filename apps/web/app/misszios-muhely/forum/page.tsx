import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { loadForumPage } from '../community-actions'
import { ForumThreadList } from '@/components/muhely/forum/forum-thread-list'
import { MuhelyPageIntro } from '@/components/muhely/shared/muhely-page-intro'
import { Lightbulb, Sprout } from 'lucide-react'

export default async function ForumPage() {
  const { user } = await getEffectiveAccessContext()
  if (!user) redirect('/login')

  const data = await loadForumPage()
  if ('error' in data) redirect('/login')

  return (
    <div className="mx-auto w-full max-w-[1380px] space-y-7 pb-8 sm:space-y-9">
      <MuhelyPageIntro
        eyebrow="Ötletasztal"
        title="Tedd le az asztalra, ami benned formálódik."
        description="Itt egy félmondatból közös terv, egy kérdésből pedig új út születhet. Hozd az ötletedet, hallgasd meg a többieket, és találjatok egymásra a szolgálatban."
        imageSrc="/misszios-muhely/24-craft.png"
      >
        <div className="flex flex-wrap gap-2.5 text-xs text-[#5f655d]">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#ded1be] bg-white/70 px-3 py-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-[#d3a45e]" />
            {data.ideas.length} ötlet az asztalon
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#ded1be] bg-white/70 px-3 py-1.5">
            <Sprout className="h-3.5 w-3.5 text-[#647a52]" />
            {data.ideas.filter((idea) => idea.statusz === 'kozos_munka').length} közös munka
          </span>
        </div>
      </MuhelyPageIntro>

      <ForumThreadList ideas={data.ideas} categories={data.categories} />
    </div>
  )
}
