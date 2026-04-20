import { notFound, redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { PostEditor } from '@/components/admin/public-site/post-editor'

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  const congregationId = access.effectiveCongregationId
  if (!congregationId) redirect('/publikus-oldal')

  const { data: post } = await access.supabase
    .from('public_posts')
    .select('id, slug, title, excerpt, cover_image_url, body_markdown, status')
    .eq('id', id)
    .eq('congregation_id', congregationId)
    .maybeSingle()

  if (!post) notFound()

  return (
    <div className="max-w-4xl mx-auto py-8">
      <header className="mb-6">
        <h1 className="font-heading text-3xl text-slate-800">Bejegyzés szerkesztése</h1>
        <p className="text-sm text-slate-500 mt-1">{post.title}</p>
      </header>

      <PostEditor
        initial={{
          id: post.id,
          slug: post.slug,
          title: post.title,
          excerpt: post.excerpt || '',
          cover_image_url: post.cover_image_url || '',
          body_markdown: post.body_markdown || '',
          status: post.status as 'draft' | 'published' | 'archived',
        }}
      />
    </div>
  )
}
