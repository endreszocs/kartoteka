import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { loadForumPage } from '../community-actions'
import { ForumThreadList } from '@/components/muhely/forum/forum-thread-list'
import { MessageCircle } from 'lucide-react'

export default async function ForumPage() {
  const { user } = await getEffectiveAccessContext()
  if (!user) redirect('/login')

  const data = await loadForumPage()
  if ('error' in data) redirect('/login')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl text-slate-800">Fórum</h1>
          <p className="text-sm text-slate-500">Ötletek, kérdések, beszélgetések — közösségben a szolgálatért</p>
        </div>
      </div>

      <ForumThreadList ideas={data.ideas} categories={data.categories} />
    </div>
  )
}
