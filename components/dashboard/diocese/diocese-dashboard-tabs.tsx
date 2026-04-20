'use client'

/**
 * Egyházmegyei dashboard — fő füles navigáció.
 *
 * ALAPELV (2026-04-17):
 *   Az egyházmegye CSAK a kötelezően leadott évi dokumentumokat (költségvetés,
 *   számadás, vagyonleltár, választók névjegyzéke) láthatja. NEM kérdezhet
 *   közvetlenül a `befizetes`, `kiadas`, `szemely`, anyakönyvi táblákból.
 *
 * 7 fül:
 *  🏠 Áttekintés · ⛪ Gyülekezetek · 📂 Dokumentumok · 🔔 Kérelmek
 *  💰 Pénzügy (jövőbeli — profilváltás után) · 🌱 Misszió (jövőbeli) · 👥 Szerepkörök
 */

import { useMemo, useState } from 'react'
import {
  Building2,
  CalendarClock,
  ClipboardCheck,
  Coins,
  FileCheck,
  HandHeart,
  Inbox,
  Layers,
  Search,
  Sprout,
  UserCog,
  Vote,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ColorTabs } from '@/components/ui/color-tabs'

import { DocumentWorkflowPanel } from '@/components/dashboard/document-workflow-panel'
import { DioceseAnnualReportsPanel } from '@/components/annual-report/diocese-annual-reports-panel'
import { ProfileCongregationsTab } from '@/components/admin/profile-congregations-tab'

import { CongregationDetailModal, type CongregationDetail } from './congregation-detail-modal'
import { RequestsSection } from './requests-section'
import { FinalizedDocumentsList } from './finalized-documents-list'
import { OurDioceseSection } from './our-diocese-section'
import { DioceseChitantaTombokSection } from './diocese-chitanta-tombok-section'
// 2026-04-18 REFAKTOR: a DioceseFinanceSection eltávolítva — az esperes a
// profilváltás után a sidebar „Pénzügy" menüponton éri el a /penzugy-t,
// ahol a scope-aware FinanceTabs dinamikusan megjeleníti az egyházmegyei
// adatokat (diocese_* táblákra ír).

import type { DocumentSubmission, DocumentType } from '@/lib/constants/documents'
import { DOCUMENT_TYPE_LABELS, DOCUMENT_DEADLINES } from '@/lib/constants/documents'
import type { AssignmentRow } from '@/app/(dashboard)/admin/profile-congregations-actions'
import type { ComponentProps } from 'react'

type AnnualReportPanelRow = ComponentProps<typeof DioceseAnnualReportsPanel>['reports'][number]

interface DioceseDashboardTabsProps {
  /** Az aktuális egyházmegye ID-ja (a profile-ból). Szükséges az "Egyházmegyénk"
   *  fül adatainak lekérdezéséhez. Ha nincs (pl. rendszergazda globális nézet),
   *  akkor a fület elrejtjük. */
  dioceseId: string | null
  congregationCount: number
  congregationOverview: CongregationDetail[]
  docSubmissions: DocumentSubmission[]
  annualReports: AnnualReportPanelRow[]
  pendingAssignments: AssignmentRow[]
  currentYear: number
  annualReportYear: number
  canManageRoles: boolean
  canOverride: boolean
}

type TabKey = 'overview' | 'our-diocese' | 'congregations' | 'documents' | 'requests' | 'chitanta' | 'mission' | 'roles'

export function DioceseDashboardTabs({
  dioceseId,
  congregationCount,
  congregationOverview,
  docSubmissions,
  annualReports,
  pendingAssignments,
  currentYear,
  annualReportYear,
  canManageRoles,
  canOverride,
}: DioceseDashboardTabsProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [search, setSearch] = useState('')
  const [selectedCong, setSelectedCong] = useState<CongregationDetail | null>(null)

  const totalUnlockRequests = congregationOverview.reduce((s, c) => s + c.unlockRequests.length, 0)
  const allUnlockRequests = useMemo(
    () => congregationOverview.flatMap((c) => c.unlockRequests),
    [congregationOverview],
  )
  const finalizedDocs = docSubmissions.filter((d) => d.status === 'finalized').length
  const pendingDocs = docSubmissions.length - finalizedDocs

  const filteredCongregations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return congregationOverview
    return congregationOverview.filter((c) =>
      c.congregationName.toLowerCase().includes(q),
    )
  }, [congregationOverview, search])

  const tabs = useMemo(() => {
    const list: Array<{ value: TabKey; label: string; color: string; count?: number }> = [
      { value: 'overview', label: '🏠 Áttekintés', color: 'blue' },
    ]
    // Saját egyházmegye fül csak akkor, ha van dioceseId (pl. esperes),
    // rendszergazdáknak globális nézetnél nincs
    if (dioceseId) {
      list.push({ value: 'our-diocese', label: '🏛️ Egyházmegyénk', color: 'violet' })
    }
    list.push(
      { value: 'congregations', label: '⛪ Gyülekezetek', color: 'violet', count: congregationOverview.length },
      { value: 'documents', label: '📂 Dokumentumok', color: 'amber', count: docSubmissions.length },
      { value: 'requests', label: '🔔 Kérelmek', color: 'red', count: totalUnlockRequests + pendingAssignments.length },
      // 2026-04-18 REFAKTOR: a saját egyházmegyei pénzügyet a profilváltás utáni
      // /penzugy oldalon éri el az esperes. A 'finance' fül eltávolítva.
    )
    if (dioceseId) {
      list.push({ value: 'chitanta', label: '🧾 Nyugtatömbök', color: 'amber' })
    }
    list.push(
      { value: 'mission', label: '🌱 Misszió', color: 'teal' },
    )
    if (canManageRoles) {
      list.push({ value: 'roles', label: '👥 Szerepkörök', color: 'indigo' })
    }
    return list
  }, [dioceseId, congregationOverview.length, docSubmissions.length, totalUnlockRequests, pendingAssignments.length, canManageRoles])

  // Beérkezések időrendben (max 5)
  const recentSubmissions = useMemo(() => {
    return [...docSubmissions]
      .sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''))
      .slice(0, 5)
  }, [docSubmissions])

  return (
    <div className="space-y-5">
      <ColorTabs
        tabs={tabs}
        active={tab}
        onChange={(v) => setTab(v as TabKey)}
      />

      {/* === ÁTTEKINTÉS === */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {/* KPI sor — alapelv-konform számok (nincs tagnyilvántartási vagy pénzügyi részlet) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={<Building2 className="size-5 text-violet-600" />}
              label="Gyülekezet"
              value={congregationCount.toLocaleString('hu-HU')}
              tone="violet"
              hint="felügyelt"
            />
            <KpiCard
              icon={<FileCheck className="size-5 text-sky-600" />}
              label="Beküldött dok."
              value={docSubmissions.length.toLocaleString('hu-HU')}
              tone="sky"
              hint={`${finalizedDocs} véglegesítve, ${pendingDocs} folyamatban`}
            />
            <KpiCard
              icon={<HandHeart className="size-5 text-rose-600" />}
              label="Aktív kérelem"
              value={(totalUnlockRequests + pendingAssignments.length).toLocaleString('hu-HU')}
              tone="rose"
              hint={totalUnlockRequests > 0 ? 'bírálatra vár' : 'nincs új'}
            />
            <KpiCard
              icon={<CalendarClock className="size-5 text-amber-600" />}
              label="Aktuális év"
              value={String(currentYear)}
              tone="amber"
              hint="januári + májusi határidők"
            />
          </div>

          {/* Dokumentum határidő figyelmeztetők */}
          <DeadlineCard year={currentYear} submissions={docSubmissions} congregationCount={congregationCount} />

          {/* Bírálatra váró banner */}
          {totalUnlockRequests > 0 && (
            <button
              type="button"
              onClick={() => setTab('requests')}
              className="w-full text-left rounded-2xl border border-rose-200 bg-rose-50/40 p-5 transition hover:bg-rose-50/70"
            >
              <div className="flex items-center gap-3">
                <HandHeart className="size-5 text-rose-600" />
                <div className="flex-1">
                  <p className="font-heading text-base text-slate-800">
                    {totalUnlockRequests} bírálatra váró javítási kérelem
                  </p>
                  <p className="text-sm text-slate-600 mt-0.5">
                    Kattintson, hogy megtekintse és bírálja el.
                  </p>
                </div>
                <span className="text-rose-600 text-sm font-medium">Megnyitás →</span>
              </div>
            </button>
          )}

          {/* Véglegesített dokumentumok — ugyanolyan kiemelt megjelenés, mint a kerületi dashboardon */}
          <FinalizedDocumentsList
            docs={docSubmissions}
            year={currentYear}
            emptyHint="A gyülekezetek véglegesítése után itt listázva jelennek meg."
          />

          {/* Legutóbb beérkezett */}
          <RecentSubmissionsCard items={recentSubmissions} onOpenDocuments={() => setTab('documents')} />

          {/* Autonómia tájékoztató — a gyülekezet autonómia elve */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/40 p-5">
            <div className="flex items-start gap-3">
              <HandHeart className="size-5 text-slate-500 mt-0.5" />
              <div className="text-sm text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-700 mb-1">A gyülekezeti autonómia védett</p>
                <p>
                  Az egyházmegye CSAK a kötelezően leadott évi dokumentumokat (költségvetés,
                  számadás, vagyonleltár, választók névjegyzéke) láthatja. A gyülekezet pénzügyi
                  és tagnyilvántartási részleteihez a lelkészi felületen, megfelelő engedéllyel
                  lehet hozzáférni — a gyülekezet adatvédelmét a lelkész és a presbitérium felügyeli.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === EGYHÁZMEGYÉNK (saját adatlap) === */}
      {tab === 'our-diocese' && dioceseId && (
        <OurDioceseSection dioceseId={dioceseId} />
      )}

      {/* === NYUGTATÖMBÖK === */}
      {tab === 'chitanta' && dioceseId && (
        <DioceseChitantaTombokSection />
      )}

      {/* === GYÜLEKEZETEK === */}
      {tab === 'congregations' && (
        <div className="space-y-4">
          <div className="card-raised p-4">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-slate-400" />
              <Input
                placeholder="Keresés gyülekezet név alapján..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 border-0 bg-transparent text-sm focus-visible:ring-0 px-0"
              />
              <span className="text-xs text-slate-400">
                {filteredCongregations.length} / {congregationOverview.length}
              </span>
            </div>
          </div>

          {filteredCongregations.length === 0 ? (
            <div className="card-raised p-10 text-center">
              <Building2 className="mx-auto size-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                {search ? 'Nincs találat a keresésre.' : 'Nincs felügyelt gyülekezet.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCongregations.map((cong) => (
                <CongregationCard
                  key={cong.congregationId}
                  cong={cong}
                  onClick={() => setSelectedCong(cong)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* === DOKUMENTUMOK === */}
      {tab === 'documents' && (
        <div className="space-y-5">
          <DocumentWorkflowPanel submissions={docSubmissions} year={currentYear} />
          <DioceseAnnualReportsPanel reports={annualReports} year={annualReportYear} />
        </div>
      )}

      {/* === KÉRELMEK === */}
      {tab === 'requests' && (
        <RequestsSection
          unlockRequests={allUnlockRequests}
          pendingAssignments={pendingAssignments}
        />
      )}

      {/* === MISSZIÓ === — JÖVŐBELI: az éves jelentésekből */}
      {tab === 'mission' && (
        <FuturePlaceholder
          icon={<Sprout className="size-5 text-teal-700" />}
          title="Misszió és élet"
          description="Az egyházmegyei misszió-statisztika a beküldött éves jelentésekből (lásd a Dokumentumok fülön) lesz aggregálva. Az alapelv szerint az egyházmegye nem kérdez közvetlenül a gyülekezetek anyakönyvi adataiból — csak a kötelezően leadott jelentésekből."
          accent="teal"
          bullet={[
            'Kazuáliás összesítés a beküldött éves jelentésből',
            'Tagmozgási mérlegek (be- és elköltözöttek)',
            'Missziói műhely aktivitása az egyházmegyében',
          ]}
        />
      )}

      {/* === SZEREPKÖRÖK === (csak rendszergazdai vagy egyházkerületi admin szerepben) */}
      {tab === 'roles' && canManageRoles && (
        <div className="space-y-4">
          <SectionIntro
            icon={<UserCog className="size-5 text-indigo-700" />}
            title="Szerepkörök kiosztása"
            subtitle="A szerepkörök kiosztása az egyházkerületi admin és a rendszergazdai admin hatáskörébe tartozik. A gyülekezeti könyvelő hozzárendelést a lelkész jóváhagyja a saját profilján."
          />
          <ProfileCongregationsTab />
        </div>
      )}

      {/* Drill-down modal */}
      <CongregationDetailModal
        open={!!selectedCong}
        onOpenChange={(o) => { if (!o) setSelectedCong(null) }}
        congregation={selectedCong}
        canOverride={canOverride}
      />
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
  tone: 'violet' | 'sky' | 'rose' | 'amber'
}) {
  const toneClasses: Record<string, string> = {
    violet: 'border-violet-200 bg-violet-50/60',
    sky: 'border-sky-200 bg-sky-50/60',
    rose: 'border-rose-200 bg-rose-50/60',
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

function DeadlineCard({
  year,
  submissions,
  congregationCount,
}: {
  year: number
  submissions: DocumentSubmission[]
  congregationCount: number
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
        <h3 className="font-heading text-base text-slate-800">{year}. évi határidők és beküldések</h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {types.map((t) => {
          const count = counts.get(t) || 0
          const pct = congregationCount > 0 ? Math.round((count / congregationCount) * 100) : 0
          return (
            <div key={t} className="rounded-xl border border-slate-100 bg-slate-50/30 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{DOCUMENT_TYPE_LABELS[t]}</p>
                <p className="text-xs text-slate-500">Határidő: {DOCUMENT_DEADLINES[t]}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-slate-700">{count} / {congregationCount}</p>
                <p className="text-xs text-slate-500">{pct}% beküldve</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RecentSubmissionsCard({
  items,
  onOpenDocuments,
}: {
  items: DocumentSubmission[]
  onOpenDocuments: () => void
}) {
  return (
    <div className="card-raised p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Inbox className="size-4 text-sky-700" />
          <h3 className="font-heading text-base text-slate-800">Legutóbbi beérkezések</h3>
        </div>
        <button
          type="button"
          onClick={onOpenDocuments}
          className="text-xs font-medium text-sky-700 hover:text-sky-800"
        >
          Összes dokumentum →
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500 italic">Még nincs beküldött dokumentum az aktuális évre.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((s) => (
            <li key={s.id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{s.congregation_name}</p>
                <p className="text-xs text-slate-500">
                  {DOCUMENT_TYPE_LABELS[s.document_type as DocumentType] || s.document_type}
                  {' · '}
                  {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('hu-HU') : ''}
                </p>
              </div>
              <span className="text-xs text-slate-400 shrink-0">{s.year}.</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FuturePlaceholder({
  icon,
  title,
  description,
  accent,
  bullet,
}: {
  icon: React.ReactNode
  title: string
  description: string
  accent: 'emerald' | 'teal'
  bullet?: string[]
}) {
  const accentClasses: Record<string, string> = {
    emerald: 'border-emerald-200 bg-emerald-50/40',
    teal: 'border-teal-200 bg-teal-50/40',
  }
  return (
    <div className={`rounded-2xl border ${accentClasses[accent]} p-6`}>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-white p-2 shadow-sm">{icon}</div>
        <div className="flex-1">
          <h2 className="font-heading text-xl text-slate-800">{title}</h2>
          <p className="mt-2 text-sm text-slate-700 leading-relaxed">{description}</p>
          {bullet && bullet.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
              {bullet.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200">
            🔧 Hamarosan elérhető
          </p>
        </div>
      </div>
    </div>
  )
}

function CongregationCard({
  cong,
  onClick,
}: {
  cong: CongregationDetail
  onClick: () => void
}) {
  const hasRequests = cong.unlockRequests.length > 0
  const hasPendingDocs = cong.pendingDocuments > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group text-left rounded-2xl border bg-white p-4 transition hover:shadow-md hover:-translate-y-0.5 ${
        hasRequests
          ? 'border-rose-200 hover:border-rose-300'
          : 'border-slate-200 hover:border-violet-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-xl p-2 ${hasRequests ? 'bg-rose-50' : 'bg-violet-50'}`}>
          <Building2 className={`size-4 ${hasRequests ? 'text-rose-600' : 'text-violet-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate group-hover:text-violet-700 transition-colors">
            {cong.congregationName}
          </p>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1" title="Beküldött dokumentumok">
              <Layers className="size-3" />
              {cong.documentCount}
            </span>
            <span className="flex items-center gap-1" title="Választók száma (ha leadták a névjegyzéket)">
              <Vote className="size-3" />
              {cong.voterCount === null ? '—' : cong.voterCount}
            </span>
            {hasPendingDocs && (
              <span className="text-amber-600 font-medium">
                {cong.pendingDocuments} függő
              </span>
            )}
          </div>
        </div>
      </div>

      {hasRequests && (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
          <ClipboardCheck className="size-3.5" />
          {cong.unlockRequests.length} bírálatra váró kérelem
        </div>
      )}
    </button>
  )
}

function SectionIntro({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white/60 p-4">
      <div className="rounded-xl bg-slate-50 p-2">{icon}</div>
      <div>
        <h2 className="font-heading text-lg text-slate-800">{title}</h2>
        <p className="text-sm text-slate-600 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}
