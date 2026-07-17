import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { PostEditor } from '@/components/admin/public-site/post-editor'
import { canAccessPublicSiteAdmin } from '@/lib/public-site/admin-access'

export default async function NewPostPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!canAccessPublicSiteAdmin(access, 'write')) redirect('/publikus-oldal')
  if (!access.effectiveCongregationId) redirect('/publikus-oldal')

  return (
    <div className="max-w-4xl mx-auto py-8">
      <header className="mb-6">
        <h1 className="font-heading text-3xl text-slate-800">Új bejegyzés</h1>
        <p className="text-sm text-slate-500 mt-1">
          Írd meg a bejegyzést Markdown formátumban. Az előnézetben láthatod, hogyan fog megjelenni.
        </p>
      </header>

      <PostEditor
        initial={{
          slug: '',
          title: '',
          excerpt: '',
          cover_image_url: '',
          body_markdown: '',
          status: 'draft',
        }}
      />
    </div>
  )
}
