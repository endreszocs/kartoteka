import { redirect } from 'next/navigation'
import {
  Building2,
  CalendarClock,
  FileCheck,
  HandHeart,
  Layers,
} from 'lucide-react'

import { ScopeHero } from '@/components/dashboard/scope-dashboard-sections'
import { FinalizedDocumentsList } from '@/components/dashboard/diocese/finalized-documents-list'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getKeruletSubmissions } from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_DEADLINES,
  type DocumentSubmission,
  type DocumentType,
} from '@/lib/constants/documents'

/**
 * Egyházkerületi dashboard.
 *
 * ALAPELV (2026-04-17):
 *   Az egyházkerület CSAK a véglegesített és továbbított dokumentumokat
 *   (`document_submissions.forwarded_to_kerulet=true` és `status='finalized'`)
 *   láthatja. NEM kérdezhet közvetlenül a `befizetes`, `kiadas`, `szemely`,
 *   `keresztseg`, `hazassag`, `temetes`, `konfirmalas` táblákból.
 *
 *   Ezért NEM hívjuk a `getScopeDashboardData`, `getScopeFinancialData`,
 *   `getScopeVitalStats` függvényeket — azok megsértenék az alapelvet.
 */
export default async function KeruletDashboardPage() {
  const access = await getEffectiveAccessContext()
  const { supabase, user, admin, master } = access

  if (!user) redirect('/login')
  if (!admin && !master) redirect('/dashboard')

  const currentYear = new Date().getFullYear()

  // Egyházmegyék lekérdezése (csak metaadatok)
  const { data: dioceses } = await supabase
    .from('dioceses')
    .select('id, name, district_id')
    .order('name')

  const districtId = dioceses?.[0]?.district_id || null
  let districtName: string | null = null
  if (districtId) {
    const { data: dr } = await supabase
      .from('districts')
      .select('name')
      .eq('id', districtId)
      .maybeSingle()
    districtName = dr?.name || null
  }

  // Gyülekezetek darabszáma egyházmegyénként
  const { data: congRows } = await supabase
    .from('congregations')
    .select('id, name, nev_hu, diocese_id')

  const congByDiocese = new Map<string, number>()
  for (const c of congRows || []) {
    if (c.diocese_id) {
      congByDiocese.set(c.diocese_id, (congByDiocese.get(c.diocese_id) || 0) + 1)
    }
  }
  const totalCongregations = congRows?.length ?? 0

  // Véglegesített dokumentumok (engedélyezett adatforrás)
  const keruletDocs = await getKeruletSubmissions(currentYear)

  return (
    <div className="space-y-5">
      <ScopeHero
        eyebrow="Egyházkerületi irányítópult"
        title={districtName || 'Erdélyi Református Egyházkerület'}
        description="A kerület kizárólag a véglegesített és továbbított hivatalos dokumentumokat látja. Az egyházmegyék és gyülekezetek belső adataihoz a kerület — a gyülekezeti és egyházmegyei autonómia jegyében — nem fér hozzá."
        chips={[
          `${(dioceses?.length ?? 0).toLocaleString('hu-HU')} egyházmegye`,
          `${totalCongregations.toLocaleString('hu-HU')} gyülekezet`,
          keruletDocs.length > 0
            ? `${keruletDocs.length} véglegesített dokumentum (${currentYear}.)`
            : 'nincs még véglegesített dokumentum',
        ].filter(Boolean) as string[]}
      />

      {/* KPI sor — alapelv-konform */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Layers className="size-5 text-violet-600" />}
          label="Egyházmegye"
          value={(dioceses?.length ?? 0).toLocaleString('hu-HU')}
          tone="violet"
        />
        <KpiCard
          icon={<Building2 className="size-5 text-sky-600" />}
          label="Gyülekezet"
          value={totalCongregations.toLocaleString('hu-HU')}
          tone="sky"
        />
        <KpiCard
          icon={<FileCheck className="size-5 text-emerald-600" />}
          label="Véglegesített dok."
          value={keruletDocs.length.toLocaleString('hu-HU')}
          tone="emerald"
          hint={`${currentYear}. évre`}
        />
        <KpiCard
          icon={<CalendarClock className="size-5 text-amber-600" />}
          label="Aktuális év"
          value={String(currentYear)}
          tone="amber"
          hint="januári + májusi határidők"
        />
      </div>

      {/* Egyházmegyei bontás — csak alapadatok */}
      <DioceseBreakdown dioceses={dioceses || []} congByDiocese={congByDiocese} />

      {/* Dokumentum határidők összesítő */}
      <DeadlineCard year={currentYear} submissions={keruletDocs} totalCongregations={totalCongregations} />

      {/* Véglegesített dokumentumok listája */}
      <FinalizedDocumentsList
        docs={keruletDocs}
        year={currentYear}
        emptyHint="Az egyházmegyék a bírálat után továbbítják a kerületnek."
      />

      {/* Autonómia tájékoztató */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50/40 p-5">
        <div className="flex items-start gap-3">
          <HandHeart className="size-5 text-slate-500 mt-0.5" />
          <div className="text-sm text-slate-600 leading-relaxed">
            <p className="font-semibold text-slate-700 mb-1">A gyülekezeti és egyházmegyei autonómia védett</p>
            <p>
              A kerület CSAK a véglegesített és továbbított dokumentumokat láthatja.
              A gyülekezetek pénzügyi és személyes adataihoz a lelkészi felületen, az egyházmegyei
              belső adatokhoz az egyházmegyei vezetésnél lehet hozzáférni — minden esetben
              a megfelelő autonómia tiszteletben tartásával.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Belső komponensek
// ---------------------------------------------------------------------------

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone: 'violet' | 'sky' | 'emerald' | 'amber'
}) {
  const toneClasses: Record<string, string> = {
    violet: 'border-violet-200 bg-violet-50/60',
    sky: 'border-sky-200 bg-sky-50/60',
    emerald: 'border-emerald-200 bg-emerald-50/60',
    amber: 'border-amber-200 bg-amber-50/60',
  }
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-800 leading-tight">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

function DioceseBreakdown({
  dioceses,
  congByDiocese,
}: {
  dioceses: { id: string; name: string }[]
  congByDiocese: Map<string, number>
}) {
  return (
    <div className="card-raised overflow-hidden">
      <div className="bg-slate-50 px-5 py-4 border-b border-slate-200/60">
        <h3 className="font-heading text-lg text-slate-800">Egyházmegyei bontás</h3>
        <p className="mt-0.5 text-xs text-slate-500">Felügyelt egyházmegyék és gyülekezeteik darabszáma.</p>
      </div>
      {dioceses.length === 0 ? (
        <p className="p-6 text-sm text-slate-500 text-center italic">Nincs felügyelt egyházmegye.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {dioceses.map((d) => (
            <li key={d.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-800">{d.name}</p>
              <p className="text-sm text-slate-600">
                {(congByDiocese.get(d.id) ?? 0).toLocaleString('hu-HU')} gyülekezet
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DeadlineCard({
  year,
  submissions,
  totalCongregations,
}: {
  year: number
  submissions: DocumentSubmission[]
  totalCongregations: number
}) {
  const types: DocumentType[] = ['koltsegvetes', 'szamadas', 'vagyonleltar', 'valasztok_nevjegyzeke']
  const counts = new Map<DocumentType, number>()
  for (const s of submissions) {
    if (types.includes(s.document_type as DocumentType)) {
      counts.set(s.document_type as DocumentType, (counts.get(s.document_type as DocumentType) || 0) + 1)
    }
  }

  return (
    <div className="card-raised p-5">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="size-4 text-amber-700" />
        <h3 className="font-heading text-base text-slate-800">{year}. évi határidők és véglegesítések</h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {types.map((t) => {
          const count = counts.get(t) || 0
          const pct = totalCongregations > 0 ? Math.round((count / totalCongregations) * 100) : 0
          return (
            <div key={t} className="rounded-xl border border-slate-100 bg-slate-50/30 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{DOCUMENT_TYPE_LABELS[t]}</p>
                <p className="text-xs text-slate-500">Határidő: {DOCUMENT_DEADLINES[t]}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-slate-700">{count} / {totalCongregations}</p>
                <p className="text-xs text-slate-500">{pct}% véglegesítve</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

