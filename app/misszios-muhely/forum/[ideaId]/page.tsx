import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'
import { ForumThreadView } from '@/components/muhely/forum/forum-thread-view'
import { ArrowLeft } from 'lucide-react'

export default async function ForumThreadPage({
  params,
}: {
  params: Promise<{ ideaId: string }>
}) {
  const { ideaId } = await params
  const { user, admin, master } = await getEffectiveAccessContext()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: idea, error } = await supabase
    .from('mm_otletek')
    .select('*, mm_otlet_kategoriak(kategoria_id, mm_kategoriak(nev, ikon, szin))')
    .eq('id', ideaId)
    .eq('aktiv', true)
    .single()

  if (error || !idea) notFound()

  // Check user's votes
  const { data: votes } = await supabase
    .from('mm_szavazatok')
    .select('tipus')
    .eq('otlet_id', ideaId)
    .eq('user_id', user.id)

  const mySupport = (votes || []).some((v: { tipus: string }) => v.tipus === 'tamogatas')
  const myJoin = (votes || []).some((v: { tipus: string }) => v.tipus === 'csatlakozas')

  const enrichedIdea = {
    ...(idea as Record<string, unknown>),
    mySupport,
    myJoin,
  } as Parameters<typeof ForumThreadView>[0]['idea']

  // D1 — projekt-réteg jogosultságok
  const ideaRow = idea as { otletgazda_id?: string | null }
  const isOwner = ideaRow.otletgazda_id === user.id
  const isMember = myJoin
  const isAdmin = admin || master

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/misszios-muhely/forum"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-violet-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Vissza a Fórumhoz
      </Link>

      <ForumThreadView
        idea={enrichedIdea}
        currentUserId={user.id}
        isOwner={isOwner}
        isMember={isMember}
        isAdmin={isAdmin}
      />
    </div>
  )
}
