import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { MagazineManager } from '@/components/admin/public-site/magazine-manager'
import { BookOpen } from 'lucide-react'

export default async function MagazineAdminPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  const congregationId = access.effectiveCongregationId
  if (!congregationId) redirect('/publikus-oldal')

  // Egyetlen magazin / gyülekezet (az első)
  const { data: magazine } = await access.supabase
    .from('public_magazines')
    .select('id, title, description, cover_image_url')
    .eq('congregation_id', congregationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Lapszámok listája (ha van magazin)
  let issues: Array<{
    id: string
    issue_number: string
    title: string | null
    cover_image_url: string | null
    pdf_url: string
    published_at: string | null
    notes: string | null
    is_published: boolean
  }> = []

  if (magazine) {
    const { data } = await access.supabase
      .from('public_magazine_issues')
      .select('id, issue_number, title, cover_image_url, pdf_url, published_at, notes, is_published')
      .eq('magazine_id', magazine.id)
      .order('published_at', { ascending: false })
    issues = data || []
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <header className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
          <BookOpen className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="font-heading text-3xl text-slate-800">Gyülekezeti újság</h1>
          <p className="text-sm text-slate-500">Lapszámok kezelése — cover kép, PDF letöltés, publikálás</p>
        </div>
      </header>

      <MagazineManager magazine={magazine} issues={issues} />
    </div>
  )
}
