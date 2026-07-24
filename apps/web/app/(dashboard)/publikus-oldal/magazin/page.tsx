import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { MagazineManager } from '@/components/admin/public-site/magazine-manager'
import { BookOpen } from 'lucide-react'
import { canAccessPublicSiteAdmin } from '@/lib/public-site/admin-access'
import { PublicSiteAdminNav } from '@/components/admin/public-site/public-site-admin-nav'

const ADMIN_MAGAZINE_PAGE_SIZE = 25
const MAX_ADMIN_MAGAZINE_PAGE = 10_000

function parsePage(value: string | string[] | undefined): number {
  const rawValue = Array.isArray(value) ? value[0] : value
  if (!rawValue || !/^\d+$/.test(rawValue)) return 1

  const parsedValue = Number(rawValue)
  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) return 1
  return Math.min(parsedValue, MAX_ADMIN_MAGAZINE_PAGE)
}

export default async function MagazineAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ oldal?: string | string[] }>
}) {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!canAccessPublicSiteAdmin(access, 'write')) redirect('/publikus-oldal')
  const congregationId = access.effectiveCongregationId
  if (!congregationId) redirect('/publikus-oldal')
  const query = await searchParams
  const page = parsePage(query.oldal)

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
  let hasNextIssuePage = false

  if (magazine) {
    const from = (page - 1) * ADMIN_MAGAZINE_PAGE_SIZE
    const { data } = await access.supabase
      .from('public_magazine_issues')
      .select('id, issue_number, title, cover_image_url, pdf_url, published_at, notes, is_published')
      .eq('magazine_id', magazine.id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(from, from + ADMIN_MAGAZINE_PAGE_SIZE)
    const issueRows = data || []
    hasNextIssuePage = issueRows.length > ADMIN_MAGAZINE_PAGE_SIZE
    issues = issueRows.slice(0, ADMIN_MAGAZINE_PAGE_SIZE)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-4 sm:py-8">
      <header className="card-raised flex items-center gap-3 p-5 sm:p-6">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
          <BookOpen className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="font-heading text-3xl text-slate-800">Gyülekezeti újság</h1>
          <p className="text-sm text-slate-500">Lapszámok kezelése — cover kép, PDF letöltés, publikálás</p>
        </div>
      </header>

      <PublicSiteAdminNav active="magazine" canWrite />

      <MagazineManager
        magazine={magazine}
        issues={issues}
        pagination={{
          page,
          pageSize: ADMIN_MAGAZINE_PAGE_SIZE,
          hasNext: hasNextIssuePage,
        }}
      />
    </div>
  )
}
