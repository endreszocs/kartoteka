import { redirect } from 'next/navigation'

import { ModuleHero } from '@/components/shared/module-hero'
import { AnnualReportForm } from '@/components/annual-report/annual-report-form'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getAnnualReport, listAnnualReports } from './actions'

interface PageProps {
  searchParams?: Promise<{ year?: string }>
}

export default async function EvesJelentesPage({ searchParams }: PageProps) {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!access.effectiveCongregationId) redirect('/dashboard')

  const params = (await searchParams) || {}
  const currentYear = new Date().getFullYear()
  // Az aktív év: ha a URL paraméterben adott, használjuk azt; egyébként
  // januárban-februárban valószínű előző év, márciustól tárgyév
  const defaultYear =
    new Date().getMonth() < 3 ? currentYear - 1 : currentYear
  const yearFromUrl = params.year ? parseInt(params.year, 10) : null
  const activeYear = yearFromUrl && Number.isFinite(yearFromUrl) ? yearFromUrl : defaultYear

  // Lekérdezzük a meglévő jelentést erre az évre + a teljes historikus listát
  const [reportRes, listRes] = await Promise.all([
    getAnnualReport(activeYear),
    listAnnualReports(),
  ])

  const existing = reportRes.data || null
  const history = listRes.data || []

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Éves jelentés"
        title={`${activeYear}. évi lelkészi jelentés`}
        description="A január végéig leadandó hivatalos éves jelentés egy felületen — a rendszer az adatokat automatikusan összegyűjti a meglévő modulokból, te csak ellenőrzöd és kiegészíted."
        pills={[
          { label: `${activeYear}. év`, tone: 'violet' },
          existing
            ? {
                label:
                  existing.status === 'draft'
                    ? 'Piszkozat'
                    : existing.status === 'submitted'
                    ? 'Beküldve'
                    : existing.status === 'received'
                    ? 'Átvéve'
                    : existing.status === 'reviewed'
                    ? 'Ellenőrizve'
                    : 'Véglegesítve',
                tone:
                  existing.status === 'finalized'
                    ? 'emerald'
                    : existing.status === 'submitted'
                    ? 'violet'
                    : 'neutral',
              }
            : { label: 'Új jelentés', tone: 'emerald' },
        ]}
      />

      {/* Historikus lista */}
      {history.length > 1 && (
        <div className="card-raised p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Korábbi jelentések
          </p>
          <div className="flex flex-wrap gap-2">
            {history.map(report => (
              <a
                key={report.id}
                href={`/eves-jelentes?year=${report.year}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  report.year === activeYear
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {report.year} ·{' '}
                {report.status === 'draft'
                  ? '📝'
                  : report.status === 'submitted'
                  ? '📤'
                  : report.status === 'received'
                  ? '📥'
                  : report.status === 'reviewed'
                  ? '👁'
                  : '✓'}
              </a>
            ))}
          </div>
        </div>
      )}

      <AnnualReportForm existingReport={existing} year={activeYear} />
    </div>
  )
}
