'use client'

/**
 * Egyházmegyei dashboard — fő füles navigáció.
 *
 * ALAPELV (2026-04-17):
 *   Az egyházmegye CSAK a kötelezően leadott évi dokumentumokat (költségvetés,
 *   számadás, vagyonleltár, választók névjegyzéke) láthatja. NEM kérdezhet
 *   közvetlenül a `befizetes`, `kiadas`, `szemely`, anyakönyvi táblákból.
 *
 * Fülek:
 *  🏠 Áttekintés · 🏛️ Egyházmegyénk · ⛪ Gyülekezetek · 📂 Dokumentumok ·
 *  🔔 Kérelmek · 🧾 Nyugtatömbök · 👥 Szerepkörök és hozzárendelések
 *
 * 2026-08-22 (4. pont): az utolsó fül felirata eddig „Szerepkörök" volt, de
 * KIZÁRÓLAG a könyvelői/számvevői hozzárendeléseket mutatta. Mostantól a valódi,
 * egyházmegyére szűrt szerepkör-lista is ott van — és a felirat ezt mondja.
 *
 * 2026-08-15 (egyházmegyei terv, 4.4): a 🌱 Misszió-placeholder ELTŰNT a
 * fülsorból — üres ígéretet nem mutatunk; a fül a statisztikai csomag (S10
 * szelet) szállításával tér vissza, valódi tartalommal.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  Archive,
  ArrowRight,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileCheck,
  HandHeart,
  Inbox,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCog,
  Vote,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ColorTabs } from '@/components/ui/color-tabs'

// 2026-08-09: a DocumentWorkflowPanel + FinalizedDocumentsList helyett a közös
// dokumentumközpont (teljességi mátrix + snapshot-néző + visszaküldés-flow).
import { DocumentCenter } from '@/components/dashboard/document-center'
import { DioceseAnnualReportsPanel } from '@/components/annual-report/diocese-annual-reports-panel'
import { ProfileCongregationsTab } from '@/components/admin/profile-congregations-tab'
// 2026-08-22 (4. pont): a fül eddig CSAK a könyvelői hozzárendeléseket mutatta
// „Szerepkörök" felirattal. A VALÓDI, egyházmegyére szűrt szerepkör-lista innen jön.
import {
  listProfileRolesForDiocese,
  type DioceseProfileRoleRow,
} from '@/app/(dashboard)/admin/profile-roles-actions'
import { APPROVAL_STATUS_LABELS, ROLE_LABELS, SCOPE_LABELS } from '@/lib/profile-roles/types'

import { CongregationDetailModal, type CongregationDetail } from './congregation-detail-modal'
// 2026-08-25: Szervezeti térkép — az anya→leány kapcsolatok + egységek +
// lelkészek vizuális képe. A panel next/dynamic-kal töltődik (a finance-tabs
// perf-mintája): a fül kódja CSAK a fülre kattintáskor kerül a kliensre.
const DioceseSzervezetPanel = dynamic(
  () => import('./diocese-szervezet-panel').then((m) => m.DioceseSzervezetPanel),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded-2xl bg-muted/40" />,
  },
)
import type { SzervezetTerkepEredmeny } from '@/lib/gyulekezet/egysegek-shared'
import { RequestsSection } from './requests-section'
import { OurDioceseSection } from './our-diocese-section'
import { DioceseChitantaTombokSection } from './diocese-chitanta-tombok-section'
// 2026-04-18 REFAKTOR: a DioceseFinanceSection eltávolítva — az esperes a
// profilváltás után a sidebar „Pénzügy" menüponton éri el a /penzugy-t,
// ahol a scope-aware FinanceTabs dinamikusan megjeleníti az egyházmegyei
// adatokat (diocese_* táblákra ír).

import type { DocumentSubmission, DocumentType } from '@/lib/constants/documents'
import { DOCUMENT_TYPE_LABELS, DOCUMENT_DEADLINES, documentSeasonYear } from '@/lib/constants/documents'
import type { DocumentCenterData } from '@/app/(dashboard)/dashboard-egyhazmegye/document-shared'
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
  /** 2026-08-09: a dokumentumközpont teljes adatcsomagja (minden év beküldései
   *  + a hatókör TELJES gyülekezet-listája a teljességi mátrixhoz). */
  documentCenter: DocumentCenterData
  annualReports: AnnualReportPanelRow[]
  pendingAssignments: AssignmentRow[]
  currentYear: number
  annualReportYear: number
  canManageRoles: boolean
  canOverride: boolean
  /** 2026-08-25: a szervezeti térkép adata (a page.tsx Promise.all kötegéből).
   *  A hiba/hiányzó-migráció/nincs-hatókör állapotok a csomagban utaznak —
   *  a panel SOHA nem kezeli üres listaként őket. */
  szervezetTerkep: SzervezetTerkepEredmeny
}

type TabKey = 'overview' | 'our-diocese' | 'congregations' | 'szervezet' | 'documents' | 'requests' | 'chitanta' | 'roles'

export function DioceseDashboardTabs({
  dioceseId,
  congregationCount,
  congregationOverview,
  documentCenter,
  annualReports,
  pendingAssignments,
  currentYear,
  annualReportYear,
  canManageRoles,
  canOverride,
  szervezetTerkep,
}: DioceseDashboardTabsProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [search, setSearch] = useState('')
  const [selectedCong, setSelectedCong] = useState<CongregationDetail | null>(null)

  const totalUnlockRequests = congregationOverview.reduce((s, c) => s + c.unlockRequests.length, 0)
  const allUnlockRequests = useMemo(
    () => congregationOverview.flatMap((c) => c.unlockRequests),
    [congregationOverview],
  )
  // 2026-08-09: a documentCenter MINDEN év beküldését hozza (év-kulcsolási
  // hiba javítása) — az áttekintő KPI-k és a határidő-kártya a beszámolási
  // SZEZON évére szűrnek (jan–márc: előző év), különben évről évre felfújt
  // vagy nulla számok jelennének meg.
  const docSubmissions = documentCenter.submissions
  const seasonYear = documentSeasonYear()
  const seasonSubs = useMemo(
    () => docSubmissions.filter((d) => d.year === seasonYear),
    [docSubmissions, seasonYear],
  )
  const finalizedDocs = seasonSubs.filter((d) => d.status === 'finalized').length
  const pendingDocs = seasonSubs.length - finalizedDocs

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
      // 2026-08-25: az anya→leány szervezeti kép (gyulekezeti_hierarchia RPC).
      // Feltétel nélkül látszik: hiányzó migrációnál / hatókör nélkül a fül a
      // MAGYARÁZÓ állapotot mutatja, nem tűnik el némán.
      { value: 'szervezet', label: '🗺️ Szervezeti térkép', color: 'teal' },
      // 2026-08-09: a fül-számláló a szezon-év beküldéseit mutatja (nem a
      // teljes, évről évre növekvő archívumot).
      { value: 'documents', label: '📂 Dokumentumok', color: 'amber', count: seasonSubs.length },
      { value: 'requests', label: '🔔 Kérelmek', color: 'red', count: totalUnlockRequests + pendingAssignments.length },
      // 2026-04-18 REFAKTOR: a saját egyházmegyei pénzügyet a profilváltás utáni
      // /penzugy oldalon éri el az esperes. A 'finance' fül eltávolítva.
    )
    if (dioceseId) {
      list.push({ value: 'chitanta', label: '🧾 Nyugtatömbök', color: 'amber' })
    }
    // 2026-08-15 (4.4): a 🌱 Misszió-placeholder fül ELTÁVOLÍTVA — üres
    // ígéretet nem mutatunk; az S10 (statisztikai csomag) hozza vissza.
    if (canManageRoles) {
      // 2026-08-22 (4/A): a felirat eddig „Szerepkörök" volt, a tartalom viszont
      // KIZÁRÓLAG a könyvelői/számvevői hozzárendelések listája — a fül azt
      // ígérte, amit nem adott. A felirat mostantól MINDKÉT tartalmat nevén
      // nevezi (valódi szerepkör-lista + hozzárendelések).
      list.push({ value: 'roles', label: '👥 Szerepkörök és hozzárendelések', color: 'indigo' })
    }
    return list
  }, [dioceseId, congregationOverview.length, seasonSubs.length, totalUnlockRequests, pendingAssignments.length, canManageRoles])

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
              value={seasonSubs.length.toLocaleString('hu-HU')}
              tone="sky"
              hint={`${seasonYear}. év: ${finalizedDocs} véglegesítve, ${pendingDocs} folyamatban`}
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

          {/* Dokumentum határidő figyelmeztetők — a szezon-évre szűrve
              (2026-08-09: a vagyonleltár year-1 kulcsú, a januári számadás az
              előző évhez tartozik — a naptári évre szűrés nullát mutatott). */}
          <DeadlineCard year={seasonYear} submissions={seasonSubs} congregationCount={congregationCount} />

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

          {/* 2026-08-09: a FinalizedDocumentsList helyét a Dokumentumok fül
              dokumentumközpontja vette át (teljességi mátrix + archívum). */}

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

      {/* === SZERVEZETI TÉRKÉP === */}
      {tab === 'szervezet' && (
        <DioceseSzervezetPanel
          data={szervezetTerkep}
          congregationOverview={congregationOverview}
        />
      )}

      {/* === DOKUMENTUMOK === */}
      {tab === 'documents' && (
        <div className="space-y-5">
          {/* 2026-08-15 (S5): a fül a FOLYÓ szezon munkafelülete (átvétel,
              ellenőrzés, továbbítás) — a több évre visszamenő ARCHÍVUM önálló
              útvonalon él. Innen egy kattintás oda, hogy ne kelljen keresni. */}
          <Link
            href="/dashboard-egyhazmegye/iratok"
            className="card-raised flex items-center gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
              <Archive className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm text-foreground sm:text-base">
                Beküldött iratok archívuma — évekre visszamenőleg
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Gyülekezetenkénti dosszié és éves mátrix mind a hat irat-típusra.
              </p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>

          {/* 2026-08-09: közös dokumentumközpont — teljességi mátrix (minden
              gyülekezet), év/típus-szűrés, snapshot-néző + nyomtatás,
              visszaküldés-flow. Az éves jelentések külön panelje marad. */}
          <DocumentCenter level="diocese" data={documentCenter} />
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

      {/* 2026-08-15 (4.4): a Misszió-placeholder render-blokkja eltávolítva —
          a fül az S10 statisztikai csomaggal tér vissza, valódi tartalommal. */}

      {/* === SZEREPKÖRÖK ÉS HOZZÁRENDELÉSEK ===
          (csak rendszergazdai vagy egyházkerületi admin szerepben)

          2026-08-22 (4. pont): a fül KÉT, egymástól jól elválasztott dolgot mutat:
           (1) az egyházmegye VALÓDI szerepkör-listáját (profile_roles, csak olvasás),
           (2) a könyvelői/számvevői HOZZÁRENDELÉSEKET (profile_congregations).
          Korábban csak a (2) volt itt — „Szerepkörök" felirattal. */}
      {tab === 'roles' && canManageRoles && (
        <div className="space-y-6">
          <div className="space-y-4">
            <SectionIntro
              icon={<ShieldCheck className="size-5 text-indigo-700" />}
              title="Az egyházmegye szerepkörei"
              subtitle="Ki milyen szerepkörrel dolgozik ebben az egyházmegyében és a gyülekezeteiben. Elöl az aktív szerepkörök, mögöttük a függő és a visszavont sorok. Csak megtekintés — a kiosztás a rendszergazdai felületen történik."
            />
            <DioceseRolesPanel dioceseId={dioceseId} />
          </div>

          <div className="space-y-4">
            <SectionIntro
              icon={<UserCog className="size-5 text-indigo-700" />}
              title="Könyvelői és számvevői hozzárendelések"
              subtitle="A hozzárendelés kezdeményezése az egyházkerületi admin és a rendszergazdai admin hatásköre. A gyülekezeti könyvelő hozzárendelést a lelkész hagyja jóvá a saját profilján."
            />
            {/* 2026-08-22 (4/D): a lista eddig PARAMÉTER NÉLKÜL töltődött, ezért egy
                megyei képernyőn a kerületi admin a TELJES kerülete hozzárendeléseit
                látta. Mostantól a képernyőn látott egyházmegyére szűkít. */}
            <ProfileCongregationsTab dioceseId={dioceseId} />
          </div>
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
  // 2026-07-17 (F5): + lelkeszi_jelentes — az éves hivatalos lelkészi jelentés
  // is a közös dokumentum-workflow-ban érkezik.
  const types: DocumentType[] = ['koltsegvetes', 'szamadas', 'vagyonleltar', 'valasztok_nevjegyzeke', 'lelkeszi_jelentes']
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

// 2026-08-15 (4.4): a FuturePlaceholder komponens a Misszió-füllel együtt
// eltávolítva — egyetlen fogyasztója volt.

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

/**
 * Az egyházmegye VALÓDI szerepkör-listája (2026-08-22, 4. pont).
 *
 * Miért van: a „Szerepkörök" fül eddig a `profile_congregations` (könyvelői
 * hozzárendelések) táblát mutatta — szerepkört nem. Ez a panel adja a hiányzó
 * felét: a `profile_roles` sorokat, a KÉPERNYŐN LÁTOTT egyházmegyére szűrve.
 *
 * A hiba SOHA nem néma: a betöltési hiba látható dobozban jelenik meg
 * „Újrapróbálom" gombbal — nem üres listaként. (A projekt visszatérő
 * hibaosztálya: a néma üres lista „nincs adat"-ot hazudik a „nem tudjuk"
 * helyett.)
 *
 * Színek: kizárólag téma-tokenek (`border-border`, `bg-card`, `text-foreground`,
 * `text-muted-foreground`) — sötét módban is helyes, nincs hardcode-olt fehér.
 */
function DioceseRolesPanel({ dioceseId }: { dioceseId: string | null }) {
  const [rows, setRows] = useState<DioceseProfileRoleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!dioceseId) {
      setRows([])
      setLoading(false)
      setError(null)
      return Promise.resolve()
    }
    setLoading(true)
    setError(null)
    return listProfileRolesForDiocese(dioceseId)
      .then((res) => {
        if (res.error) {
          setError(res.error)
          return
        }
        setRows(res.data ?? [])
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Ismeretlen hiba a szerepkörök betöltése közben.'),
      )
      .finally(() => setLoading(false))
  }, [dioceseId])

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      void load()
    })
    return () => cancelAnimationFrame(raf)
  }, [load])

  if (!dioceseId) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Rendszergazdai összesített nézetben nincs kiválasztott egyházmegye, ezért a
        szerepkör-lista nem szűkíthető. Válts egyházmegyei profilra, vagy használd a
        rendszergazdai Szerepkörök felületet.
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900 dark:bg-rose-950/30">
        <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
          A szerepkörök betöltése nem sikerült
        </p>
        <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-800 transition hover:bg-rose-100 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/40"
        >
          <RefreshCw className="size-4" />
          Újrapróbálom
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-muted/40" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Ehhez az egyházmegyéhez és a gyülekezeteihez még nincs rögzített szerepkör.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const nev = r.profile_full_name || r.profile_email || 'Névtelen felhasználó'
          const szerep = r.role === 'custom' ? r.custom_label || ROLE_LABELS.custom : ROLE_LABELS[r.role]
          const aktiv = r.active && r.approval_status === 'approved'
          return (
            <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{nev}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {szerep}
                  {' · '}
                  {SCOPE_LABELS[r.scope]}
                  {r.scope_name ? `: ${r.scope_name}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-[11px] font-medium ' +
                    (aktiv
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : 'bg-muted text-muted-foreground')
                  }
                >
                  {APPROVAL_STATUS_LABELS[r.approval_status]}
                </span>
                {!r.active && r.approval_status === 'approved' && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Inaktív
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
