'use client'

import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Camera,
  AlertCircle,
  Baby,
  BookOpen,
  Church,
  CreditCard,
  Crown,
  Cross,
  DoorOpen,
  Heart,
  HeartCrack,
  Home,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  TreePine,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { getFamilyDetails, getFamilyVisits, getEnrichedMemberById } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { getFamilyTreeData } from '@/lib/family-tree/get-family-tree'
import type { FamilyTreeData } from '@/lib/family-tree/types'
import { FamilyTreeView } from '@/components/family-tree/family-tree-view'
import { MemberDetailsDialogV2 } from '@/components/modals/member-details-dialog-v2'
import { AvatarEditorDialog } from '@/components/modals/avatar-editor-dialog'
import { MemberAvatar } from '@kartoteka/ui-app'
import { FamilyFormDialog } from '@/components/modals/family-form-dialog'
import { FamilyDivorceDialog } from '@/components/modals/family-divorce-dialog'
import { FamilyVisitFormDialog } from '@/components/modals/family-visit-form-dialog'
import { getTransactionDocumentNumber } from '@/lib/constants/finance'
import { ageFromDate } from '@/lib/utils/date'
import type { EnrichedMember } from '@/lib/constants/members'
// 2026-08-11: a családi karton RÁDRÓTOZVA a közös kartonkészletre. A készlet a
// családi karton vizuális nyelvéből lett kiemelve (lásd a kit fejlécét), de
// eddig CSAK a személyi karton importált belőle — a családi karton a saját,
// privát másolatait hordozta ugyanazokból a fogalmakból. Amíg ez így volt, a
// „egy termék" ígéret puszta fegyelem kérdése maradt: egy szekciócím-javítás az
// egyik oszlopban nem követte a másikat. Innentől strukturális.
import {
  BTN,
  CardFooter,
  CardHeaderChrome,
  CardScroller,
  Dash,
  DashedBlock,
  EmptyCard,
  EmptyStrip,
  EmptyTab,
  ErrorBlock,
  FloatingCloseButton,
  MemberPanel as RegistryMemberPanel,
  PersonRow,
  Pill,
  QuoteBlock,
  RegistryChip,
  STORNO_CHIP,
  Section,
  SubBlock,
  TBL,
  TXT,
  TabBar,
  TabButton,
  TabPanel,
  formatRon,
  formatShortDate,
  type RegistryKind,
} from '@/components/modals/registry-card-kit'

interface FamilyDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  familyId: number | null
  /** 2026-07-24 (PR-11): 'sheet' (default) = önálló, jobbról beúszó karton;
   *  'panel' = a RegistryCardsHost egyik oszlopa (nincs saját Sheet-keret). */
  variant?: 'sheet' | 'panel'
  /** 2026-07-24 (PR-11): ha megadva, a tag-kattintás a szülőre delegálódik
   *  (egymás melletti kettős nézet) a beágyazott személyi karton helyett. */
  onOpenMember?: (memberId: number) => void
}

type FamilyData = Awaited<ReturnType<typeof getFamilyDetails>>

/**
 * 2026-06-02 v3 — Családi karton dialog teljes újraalkotás.
 *
 * Egyetlen scrollolható oldal (nem tabok), tiszta papír-szerű design,
 * színes szekciókkal:
 *   - Fejléc:        gradient, családnév, cím, körzet, status-pill, hiányzók
 *   - Tagok:         családfő + házastárs + gyerekek listája
 *   - Anyakönyv:     esketés, keresztelők, konfirmációk, temetések
 *   - Befizetések:   tétel-lista + összegző sáv
 */
type TabKey = 'general' | 'registry' | 'tree' | 'visits' | 'payments'

type FamilyVisit = {
  id: string
  datum: string
  lelkesz: string
  alapige: string | null
  megjegyzes: string | null
}

export function FamilyDetailsDialogRefined({
  open,
  onOpenChange,
  familyId,
  variant = 'sheet',
  onOpenMember,
}: FamilyDetailsDialogProps) {
  const [data, setData] = useState<FamilyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('general')

  // 2026-06-02: Családfa és Családlátogatás lazy-load — csak az adott tab
  //    aktiválásakor töltjük le. A `*Loaded` flag biztosítja hogy nem
  //    fetchelünk újra ha már sikerült (az eredmény cache-elve marad
  //    amíg a dialog nyitva van).
  const [treeData, setTreeData] = useState<FamilyTreeData | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [visits, setVisits] = useState<FamilyVisit[] | null>(null)
  const [visitsLoading, setVisitsLoading] = useState(false)

  // 2026-06-02: Drill-down a személy-kartonra
  // A felhasználó kattintással megnyitja a kiválasztott szemely teljes
  // kartonját — a MemberDetailsDialogV2 ráül a family dialog tetejére.
  // X-en (vagy ESC-en) bezárul a member dialog és visszakerül a fókusz
  // a családi kartonra (a family dialog open marad).
  const [memberDialogMember, setMemberDialogMember] = useState<EnrichedMember | null>(null)
  const [memberDialogLoading, setMemberDialogLoading] = useState(false)
  // 2026-06-11: fénykép/közösségi-link szerkesztő + a lap újratöltése mentés után
  const [avatarEditPerson, setAvatarEditPerson] = useState<{ id: number; name: string; kepUrl?: string | null; socialUrl?: string | null } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // 2026-07-24 (PR-4 F5.9): hiba-állapot — eddig egy szerver/hálózati hiba
  // ÖRÖK „betöltés" spinnert hagyott (nem volt .catch a then-láncokon).
  const [loadError, setLoadError] = useState(false)

  // 2026-06-02: család szerkesztés + új családlátogatás
  const [editFamilyOpen, setEditFamilyOpen] = useState(false)
  const [visitFormOpen, setVisitFormOpen] = useState(false)
  // 2026-08-04 (PR-44): válás / kapcsolat felbontása
  const [divorceOpen, setDivorceOpen] = useState(false)

  async function openMemberCard(memberId: number) {
    if (!familyId) return
    // 2026-07-24 (PR-11): host-módban a szülő nyitja a személyi kartont a bal
    // oldali oszlopban (kettős nézet) — a beágyazott fallback csak önálló módban él.
    if (onOpenMember) {
      onOpenMember(memberId)
      return
    }
    setMemberDialogLoading(true)
    const enriched = await getEnrichedMemberById(memberId, familyId)
    setMemberDialogMember(enriched as EnrichedMember | null)
    setMemberDialogLoading(false)
  }

  // Visits frissítése mentés után
  // 2026-07-24 (PR-4 F5.11): a redundáns dynamic import törölve — a
  // getFamilyVisits fent statikusan importált.
  async function refreshVisits() {
    if (!familyId) return
    const v = await getFamilyVisits(familyId)
    setVisits(v as FamilyVisit[])
  }

  useEffect(() => {
    if (!open || !familyId) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setData(null)
      setTreeData(null)
      setVisits(null)
      setLoading(true)
      setLoadError(false)
      setActiveTab('general')
      getFamilyDetails(familyId)
        .then((value) => {
          if (cancelled) return
          setData(value)
          setLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          setLoadError(true)
          setLoading(false)
        })
    })
    return () => { cancelled = true }
  }, [open, familyId, reloadKey])

  // Lazy load: családfa
  useEffect(() => {
    if (activeTab !== 'tree' || !familyId || treeData !== null) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setTreeLoading(true)
      getFamilyTreeData(familyId)
        .then((d) => {
          if (cancelled) return
          setTreeData(d)
          setTreeLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          setTreeLoading(false)
          toast.error('A családfa betöltése nem sikerült — próbáld újra a fül megnyitásával.')
        })
    })
    return () => { cancelled = true }
  }, [activeTab, familyId, treeData])

  // Lazy load: családlátogatás
  useEffect(() => {
    if (activeTab !== 'visits' || !familyId || visits !== null) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setVisitsLoading(true)
      getFamilyVisits(familyId)
        .then((v) => {
          if (cancelled) return
          setVisits(v as FamilyVisit[])
          setVisitsLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          setVisitsLoading(false)
          toast.error('A látogatások betöltése nem sikerült — próbáld újra a fül megnyitásával.')
        })
    })
    return () => { cancelled = true }
  }, [activeTab, familyId, visits])

  const family = data?.family
  const children = data?.children || []
  // 2026-08-04 (PR-35): a saját háztartásban élő FELNŐTT gyermekek — a kartonon
  // eddig NÉMÁN hiányoztak, pedig a rokoni kapcsolat rögzítve van
  const felnottGyermekek = data?.felnottGyermekek || []
  const payments = data?.payments || []
  const keresztelesek = data?.keresztelesek || []
  const konfirmaciok = data?.konfirmaciok || []
  const hazassag = data?.hazassag
  const temetesek = data?.temetesek || []

  // Családnév — a férj/feleség családnevéből
  const familyName = family?.ferfi?.csaladnev || family?.no?.csaladnev || null
  // 2026-08-04 (PR-43): a STORNÓZOTT tételek eddig beleszámítottak az összegbe,
  // és semmi nem jelölte őket — a lelkész a valóságosnál nagyobb összeget látott.
  // (A személyi kartonon ez már helyesen működött.)
  const totalPayments = payments.reduce(
    (sum, item) => sum + (item.stornozott ? 0 : Number(item.osszeg || 0)),
    0,
  )
  const stornozottDb = payments.filter((p) => p.stornozott).length

  const isLiving = family
    ? (family.ferfi && !family.ferfi.meghalt) || (family.no && !family.no.meghalt)
    : false

  // Hiányzó adatok listája
  const missing: string[] = []
  if (family) {
    if (!family.ferfi && !family.no) missing.push('családfő/házastárs')
    if (!family.utca?.name) missing.push('utca')
    if (!family.c_szam) missing.push('házszám')
    if (!family.csoport?.nev) missing.push('körzet')
  }

  // 2026-07-24 (PR-11): a karton törzse variant-független — 'sheet' módban a
  // saját jobbról beúszó Sheet-be, 'panel' módban a RegistryCardsHost oszlopába
  // kerül (a személyi kartonnal egymás mellett; a család mindig JOBBRA).
  const isPanel = variant === 'panel'

  // ── FÜLEK ─────────────────────────────────────────────────────────────
  // 2026-08-11: a fülsáv a közös `TabBar`/`TabButton`/`TabPanel` hármasra
  // került. A készlet fül-gombja a családi karton PIXELEIT hozza (a stringek
  // innen származnak), de a személyi karton ARIA-ját is: `role="tab"` +
  // `aria-selected` + `aria-controls` + vándorló tabindex. A családi kartonon
  // eddig `aria-current="page"` állt egy `role` nélküli `nav`-ban — a
  // képernyőolvasó tehát nem is látott fülcsoportot, csak öt linkszerű gombot.
  // ⚠️ A vándorló tabindex KÖVETELI a nyílbillentyűs léptetést: e nélkül a
  //    Tab-bal érkező felhasználó csak az AKTÍV fülre jut, és nem tudna
  //    váltani (a nem aktív fülek `tabIndex={-1}`-esek).
  const tabs: Array<{ value: TabKey; label: string; icon: ReactNode; count?: number | null }> = [
    { value: 'general', label: 'Általános', icon: <Users className="size-4" /> },
    {
      value: 'registry',
      label: 'Anyakönyv',
      icon: <BookOpen className="size-4" />,
      count: (hazassag?.datum ? 1 : 0) + keresztelesek.length + konfirmaciok.length + temetesek.length,
    },
    { value: 'tree', label: 'Családfa', icon: <TreePine className="size-4" /> },
    { value: 'visits', label: 'Családlátogatás', icon: <DoorOpen className="size-4" />, count: visits?.length },
    { value: 'payments', label: 'Befizetések', icon: <CreditCard className="size-4" />, count: payments.length },
  ]

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: TabKey) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()

    const currentIndex = tabs.findIndex((item) => item.value === currentTab)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % tabs.length
          : (currentIndex - 1 + tabs.length) % tabs.length
    const nextTab = tabs[nextIndex]?.value
    if (!nextTab) return

    setActiveTab(nextTab)
    requestAnimationFrame(() => document.getElementById(`family-tab-${nextTab}`)?.focus())
  }

  const cardBody = (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
          {/* 2026-07-24 (PR-11 review): a betöltés/hiba/üres állapotoknak is legyen
              hozzáférhető dialógus-neve sheet-módban (a cím a family-ágban él). */}
          {!isPanel && !family && <SheetTitle className="sr-only">Családi karton</SheetTitle>}
          {/* A bezárás gomb mindig látható; a többi művelet az egységes alsó sávban van.
              ⛔ Az aria-label betűre kötött: a `registry-cards-host` string-egyezéssel
                 keresi a fókusz-visszaállításhoz. */}
          <FloatingCloseButton onClick={() => onOpenChange(false)} ariaLabel="Családi karton bezárása" />

          {/* AZ EGY GÖRGETŐ — a fejléc elgörög, a fülsáv és a lábléc ragad. */}
          <CardScroller>
            {loading ? (
              <div className="px-8 py-16 text-center">
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
                  <Users className="size-8 animate-pulse motion-reduce:animate-none" />
                </div>
                {/* 2026-08-11: a betöltés-alak SZÁNDÉKOSAN marad a családi karton
                    sajátja (embléma-doboz + pulzus), nem a készlet `SkeletonGrid`-je:
                    a személyi karton a FEJLÉCÉT azonnal rendereli és csak a törzset
                    villantja, a családi karton fejléce viszont a betöltött adatból
                    épül (családnév, cím, körzet), tehát nincs mit korán mutatni.
                    Csak a tipográfia jön a készletből. */}
                <p className={TXT.headline}>
                  Családi karton betöltése…
                </p>
              </div>
            ) : loadError ? (
              /* 2026-07-24 (PR-4 F5.9): hiba-állapot + Újrapróbálom (a member-details minta).
                 2026-08-11: a saját másolat helyett a készlet `ErrorBlock`-ja. A régi
                 „Újrapróbálom" a ház `Button variant="outline"`-ja volt (h-9, text-sm),
                 a személyi kartoné a `BTN.outline` (h-11, text-xs font-semibold) —
                 ugyanaz a gomb, ugyanabban a helyzetben, két különböző alakban. */
              <ErrorBlock
                icon={<Users className="size-10" />}
                title="A családi karton nem tölthető be"
                description="Hálózati vagy szerverhiba történt."
                onRetry={() => setReloadKey((k) => k + 1)}
              />
            ) : !family ? (
              <EmptyCard icon={<Users className="size-10" />}>Nem található család.</EmptyCard>
            ) : (
              <>
                {/* ───── FEJLÉC ───── */}
                <header className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-card to-amber-50/45 px-5 pb-5 pt-16 sm:px-8 sm:pb-7 sm:pt-7 dark:to-card">
                  {/* dekoratív háttér-blur — a három réteg a készletből (bájtra a régi). */}
                  <CardHeaderChrome />

                  <div className="relative flex items-start gap-4">
                    {/* Avatar/embléma — kezdőbetű(k) */}
                    <div
                      aria-hidden
                      className="hidden size-[72px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-teal-600 to-amber-500 text-primary-foreground shadow-lg ring-4 ring-card sm:flex"
                    >
                      <span className="font-heading text-2xl font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                        {familyInitials(familyName) || '?'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <Sparkles className="size-3.5 text-amber-600 dark:text-amber-400" />
                        {/* 2026-08-11 (döntés): a szemöldök geometriája ÉS színe
                            is a készletből jön — `text-primary`, nem a korábbi
                            `text-primary/75`. A két karton egymás mellett nyílik,
                            és ez volt az utolsó néma színeltérés köztük.
                            MIÉRT a teljes erősség a helyes irány: ez a felirat
                            11px-es, NAGYBETŰS, ritkított — a legnehezebben
                            olvasható szövegfajta a kartonon. A célközönség 55+
                            éves lelkész, gyakran telefonon, változó fényben.
                            Halványítani pont azt, amit amúgy is a legnehezebb
                            elolvasni, rossz irány; a 25% átlátszóság semmilyen
                            információt nem hordozott. */}
                        <p className={`${TXT.eyebrow} text-primary`}>
                          Családi karton · #{family.id}
                        </p>
                      </div>

                      {isPanel ? (
                        <h2 className={TXT.cardTitle}>
                          {familyName ? (
                            <>
                              {familyName}{' '}
                              <span className={`font-normal ${TXT.muted}`}>család</span>
                            </>
                          ) : (
                            <span className={`italic ${TXT.muted}`}>— névtelen család —</span>
                          )}
                        </h2>
                      ) : (
                        <SheetTitle className={TXT.cardTitle}>
                          {familyName ? (
                            <>
                              {familyName}{' '}
                              <span className={`font-normal ${TXT.muted}`}>család</span>
                            </>
                          ) : (
                            <span className={`italic ${TXT.muted}`}>— névtelen család —</span>
                          )}
                        </SheetTitle>
                      )}
                      {!isPanel && (
                        <SheetDescription className="sr-only">
                          A család tagjai, anyakönyvi bejegyzései, látogatásai és befizetései.
                        </SheetDescription>
                      )}
                    </div>
                  </div>

                  {/* Cím + körzet sor */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Pill
                      icon={<MapPin className="size-3" />}
                      tone={family.utca?.name ? 'slate' : 'amber'}
                    >
                      {family.utca?.name ? (
                        <>{family.utca.name}{family.c_szam ? ` ${family.c_szam}` : ''}</>
                      ) : (
                        <em>cím hiányzik</em>
                      )}
                    </Pill>
                    {family.csoport?.nev ? (
                      <Pill icon={<Home className="size-3" />} tone="primary">
                        {family.csoport.nev}
                      </Pill>
                    ) : (
                      <Pill icon={<Home className="size-3" />} tone="amber">
                        <em>körzet nincs</em>
                      </Pill>
                    )}
                    <Pill
                      icon={isLiving ? <Heart className="size-3 fill-current" /> : <Cross className="size-3" />}
                      tone={isLiving ? 'emerald' : 'slate'}
                    >
                      {isLiving ? 'Élő család' : 'Elhunyt család'}
                    </Pill>
                  </div>

                  {/* Hiányzó adatok figyelmeztetés */}
                  {missing.length > 0 && (
                    <div className="mt-4 inline-flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-800 shadow-sm dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                      <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                      <span>
                        <strong>Hiányzó adatok:</strong> {missing.join(', ')}
                      </span>
                    </div>
                  )}
                </header>

                {/* ───── TAB-BAR ───── */}
                {/* 2026-07-24 (PR-11 review): mobilon jobb oldalt hely marad a lebegő
                    X-nek — különben a végigscrollozott utolsó fül ('Befizetések')
                    pont a bezárás-gomb alá kerülne, és a koppintás bezárná a kartont.
                    (A `pr-16` a készlet `TabBar`-jában van, ugyanezzel az indokkal.)
                    2026-08-11: az `activeKey` kapcsolja be a görgetés-jelzést —
                    élhalványítás azon az oldalon, ahol tényleg van még fül, és az
                    aktív fül képbe görgetése váltáskor. A készlet fejléce ezt eddig
                    „dokumentált eltérésként" tartotta számon, mert csak a személyi
                    kartonon élt; a rádrótozással megszűnik. */}
                <TabBar ariaLabel="Családi karton nézetei" activeKey={activeTab}>
                  {tabs.map((item) => (
                    <TabButton
                      key={item.value}
                      id={`family-tab-${item.value}`}
                      controls={`family-panel-${item.value}`}
                      active={activeTab === item.value}
                      onClick={() => setActiveTab(item.value)}
                      onKeyDown={(event) => handleTabKeyDown(event, item.value)}
                      icon={item.icon}
                      label={item.label}
                      count={item.count}
                    />
                  ))}
                </TabBar>

                {/* ───── TAB-CONTENT ───── */}
                <TabPanel id={`family-panel-${activeTab}`} labelledBy={`family-tab-${activeTab}`}>
                  {/* ÁLTALÁNOS — Tagok */}
                  {activeTab === 'general' && (
                  <Section
                    title="Családtagok"
                    icon={<Users className="size-4" />}
                    accent="primary"
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      {family.ferfi ? (
                        <MemberPanel
                          role="head"
                          member={family.ferfi}
                          onClick={() => openMemberCard(family.ferfi!.id)}
                          onEditAvatar={() => setAvatarEditPerson({ id: family.ferfi!.id, name: `${family.ferfi!.csaladnev} ${family.ferfi!.k_nev}`.trim(), kepUrl: family.ferfi!.kep, socialUrl: family.ferfi!.social_profil_url })}
                        />
                      ) : family.no ? (
                        <MemberPanel
                          role="head"
                          member={family.no}
                          onClick={() => openMemberCard(family.no!.id)}
                          onEditAvatar={() => setAvatarEditPerson({ id: family.no!.id, name: `${family.no!.csaladnev} ${family.no!.k_nev}`.trim(), kepUrl: family.no!.kep, socialUrl: family.no!.social_profil_url })}
                        />
                      ) : null}

                      {family.ferfi && family.no && (
                        <MemberPanel
                          role="spouse"
                          member={family.no}
                          onClick={() => openMemberCard(family.no!.id)}
                          onEditAvatar={() => setAvatarEditPerson({ id: family.no!.id, name: `${family.no!.csaladnev} ${family.no!.k_nev}`.trim(), kepUrl: family.no!.kep, socialUrl: family.no!.social_profil_url })}
                        />
                      )}
                    </div>

                    {/* Gyermekek — a készlet `SubBlock`-ja (a saját másolat bájtra
                        ugyanezt adta: `mt-4 rounded-2xl border border-border bg-card
                        p-4 shadow-sm` + amber chip + `text-sm font-semibold`). */}
                    {children.length > 0 && (
                      <SubBlock icon={<Baby className="size-4" />} tone="amber" title={`Gyermekek (${children.length})`}>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {children.map((c) => {
                            // 2026-08-01 (PR-18 D7): pontos kor (születésnap előtt nem +1),
                            // mint a felnőtteknél (ageFromDate)
                            const age = ageFromDate(c.sz_datum)
                            return (
                              // ⚑ 2026-08-11: a KOR a `trailing` rekeszbe került. Eddig
                              // zárójeles betoldás volt a név MÖGÖTT („Kiss Anna (12 éves)"),
                              // a személyi karton ugyanezen sora viszont jobbra igazított,
                              // halvány rekeszben írja („Kiss Anna … Gyermek · 12 éves") —
                              // ugyanaz a sor, két tördeléssel, egymás melletti oszlopokban.
                              // A `PersonRow` a készlet EGYETLEN személy-sora; a doboz-
                              // osztályok (`min-h-11`, hover, elhunyt-áthúzás) bájtra a régiek.
                              <PersonRow
                                key={c.id}
                                avatar={
                                  <MemberAvatar
                                    name={`${c.csaladnev} ${c.k_nev}`.trim()}
                                    kepUrl={(c as MemberShape).kep}
                                    meghalt={c.meghalt}
                                    size={22}
                                  />
                                }
                                name={`${c.csaladnev} ${c.k_nev}`}
                                deceased={c.meghalt}
                                trailing={age != null ? `${age} éves` : undefined}
                                onClick={() => openMemberCard(c.id)}
                              />
                            )
                          })}
                        </div>
                      </SubBlock>
                    )}

                    {!family.ferfi && !family.no && (
                      <EmptyStrip>Nincs felnőtt tag rögzítve ehhez a családhoz.</EmptyStrip>
                    )}
                    {/* Külön háztartásban élő felnőtt gyermekek (PR-35).
                        2026-08-11: a készlet `DashedBlock`-ja — a szaggatott keret, a
                        `bg-muted/30`, a chip-geometria és a lábjegyzet-bekezdés
                        (`mt-2 text-xs leading-5`) bájtra egyezett. EGY eltérés volt: a
                        chip itt `bg-slate-200 … dark:bg-slate-800 dark:text-slate-300`,
                        a készletben `bg-slate-100 text-slate-700` `dark:` NÉLKÜL. A
                        készleté a helyes: a `kartoteka.css` legacy `.dark` rétege a
                        `text-slate-700`-et `!important`-tal `var(--foreground)`-ra írja,
                        tehát a `dark:text-slate-300` itt eddig is NÉMA no-op volt —
                        a `dark:bg-slate-800` viszont élt, és sötétben ez volt az
                        egyetlen slate-chip a két kartonon, amelyik nem `var(--muted)`. */}
                    {felnottGyermekek.length > 0 && (
                      <DashedBlock
                        icon={<Users className="size-4" />}
                        title={`Felnőtt gyermekek (${felnottGyermekek.length})`}
                        titleNote="— saját háztartásban élnek"
                        footnote={
                          <>
                            Ők a rokoni kapcsolat szerint ennek a családnak a gyermekei, de saját háztartásuk van —
                            ezért a járulék és a lélekszám a saját kartonjukon számít. A családfán itt is megjelennek.
                          </>
                        }
                      >
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {felnottGyermekek.map((fg) => {
                            const kor = ageFromDate(fg.sz_datum)
                            const nev = `${fg.csaladnev ?? ''} ${fg.k_nev ?? ''}`.trim() || `#${fg.id}`
                            return (
                              // ⚠️ Ez a KÉTSOROS sor (név + rokoni viszony) nem a
                              // `PersonRow`, hanem a személyi karton „Korábbi házastárs"
                              // sorának alakja — és annak osztály-stringjével BÁJTRA
                              // egyezik (`member-details-dialog-v2.tsx:1179`). A készletbe
                              // szándékosan nem emelem: két hely, két hívó, azonos string —
                              // ha harmadik jön, akkor lesz belőle primitív.
                              <button
                                key={`fg-${fg.id}`}
                                type="button"
                                onClick={() => openMemberCard(fg.id)}
                                className="flex min-h-11 flex-col items-start gap-0.5 rounded-xl border border-transparent px-2 py-1.5 text-left text-sm hover:border-primary/10 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <span className="font-medium text-foreground">
                                  {nev}
                                  {kor != null && <span className={`ml-1 text-xs font-normal ${TXT.muted}`}>{kor} éves</span>}
                                </span>
                                <span className={`text-xs ${TXT.muted}`}>
                                  {fg.ferfi === false ? 'Lánya' : fg.ferfi === true ? 'Fia' : 'Gyermeke'}
                                  {fg.sajatCsalad ? ` · saját családja: ${fg.sajatCsalad.name}` : ' · külön háztartásban'}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </DashedBlock>
                    )}

                  </Section>
                  )}

                  {/* ANYAKÖNYV — külön tab */}
                  {activeTab === 'registry' && !(hazassag?.datum || keresztelesek.length > 0 || konfirmaciok.length > 0 || temetesek.length > 0) && (
                    /* A fül GYÖKERÉBEN, `Section`-ön KÍVÜL álló üresség — a készlet
                       `EmptyTab`-je, bájtra a régi osztály-stringgel. */
                    <EmptyTab icon={<BookOpen className="size-10" />} title="Nincs anyakönyvi bejegyzés ehhez a családhoz." />
                  )}
                  {activeTab === 'registry' && (hazassag?.datum || keresztelesek.length > 0 || konfirmaciok.length > 0 || temetesek.length > 0) && (
                    <Section
                      title="Anyakönyvi bejegyzések"
                      icon={<BookOpen className="size-4" />}
                      accent="amber"
                    >
                      {/* 2026-06-02: táblázatos forma — átláthatóbb mint a kártya-lista */}
                      <RegistryTable
                        rows={buildRegistryRows({
                          hazassag,
                          keresztelesek,
                          konfirmaciok,
                          temetesek,
                          members: [family.ferfi, family.no, ...children],
                        })}
                      />
                    </Section>
                  )}

                  {/* ───── CSALÁDFA ───── */}
                  {activeTab === 'tree' && (
                    <Section
                      title="Családfa"
                      icon={<TreePine className="size-4" />}
                      accent="emerald"
                    >
                      {treeLoading ? (
                        <div className={`flex items-center justify-center py-12 text-sm ${TXT.muted}`}>
                          <TreePine className="mr-2 size-5 animate-pulse text-emerald-500 motion-reduce:animate-none" />
                          Családfa betöltése…
                        </div>
                      ) : treeData ? (
                        <FamilyTreeView data={treeData} onMemberClick={openMemberCard} />
                      ) : null}
                    </Section>
                  )}

                  {/* ───── CSALÁDLÁTOGATÁS ───── */}
                  {activeTab === 'visits' && (
                    <Section
                      title={
                        visits && visits.length > 0
                          ? `Családlátogatások (${visits.length})`
                          : 'Családlátogatás'
                      }
                      icon={<DoorOpen className="size-4" />}
                      accent="primary"
                      action={
                        <button
                          type="button"
                          onClick={() => setVisitFormOpen(true)}
                          className={BTN.sectionAction}
                        >
                          <Plus className="size-3.5" />
                          Új látogatás
                        </button>
                      }
                    >
                      {visitsLoading ? (
                        <div className={`flex items-center justify-center py-12 text-sm ${TXT.muted}`}>
                          <DoorOpen className="mr-2 size-5 animate-pulse text-primary motion-reduce:animate-none" />
                          Látogatások betöltése…
                        </div>
                      ) : !visits || visits.length === 0 ? (
                        /* ⚑ 2026-08-11 (DRIFT — a karton ÖNMAGÁVAL is ellentmondott):
                           ez a sáv `Section`-ön BELÜL áll, mégis a fül-szintű,
                           `bg-card`-os, ikonos üres-KÁRTYA alakját viselte
                           (`rounded-2xl border-dashed bg-card p-8` + `size-10 opacity-35`
                           ikon) — miközben ugyanezen a kartonon az üres befizetés-lista
                           (szintén `Section`-ön belül) a keskeny `EmptyStrip`-sávot
                           használja, és a személyi karton MINDEN szekción belüli
                           üressége is az. A `Section` maga `bg-card`, tehát a kártya
                           kontraszt nélkül ült egy azonos színű kártyán.
                           Egységesítve `EmptyStrip`-re. ⚠️ ÁRA: az ajtó-ikon eltűnik —
                           az `EmptyStrip`-nek nincs ikon-rekesze, és nem is kap, mert
                           attól a fül-szintű alak másolatává válna. */
                        <EmptyStrip hint="Az „Új látogatás” gombbal rögzíthet egy új családlátogatást — amely a Munkanaplóban is megjelenik.">
                          Nincs rögzített családlátogatás.
                        </EmptyStrip>
                      ) : (
                        <VisitsList visits={visits} />
                      )}
                    </Section>
                  )}

                  {/* BEFIZETÉSEK — külön tab */}
                  {activeTab === 'payments' && (
                  <Section
                    /* 2026-08-11 (O2): a pénz-írásmód a közös `formatRon` —
                       eddig `.toFixed(0)` volt, tehát „2640 RON" ezerelválasztó
                       nélkül, míg a személyi karton ugyanezt „2 640 RON"-nak írta. */
                    title={`Befizetések (${payments.length} tétel · ${formatRon(totalPayments)}${stornozottDb > 0 ? ` · ebből ${stornozottDb} stornózott` : ''})`}
                    icon={<CreditCard className="size-4" />}
                    accent="emerald"
                  >
                    {payments.length === 0 ? (
                      <EmptyStrip>Nincs rögzített befizetés ehhez a családhoz.</EmptyStrip>
                    ) : (
                      <div className={TBL.wrapper}>
                        {/* 2026-08-11 (döntés): a beágyazott görgető ELTÁVOLÍTVA.
                            Eddig `max-h-72 overflow-auto` zárta a listát, ragadós
                            fejléccel — ez volt az utolsó pont, ahol a két karton
                            SZERKEZETE (nem csak a festése) eltért.
                            MIÉRT így döntöttünk: érintőképernyőn a dobozon belüli
                            görgető csapda — a felhasználó a kartont akarja görgetni,
                            de az ujja a táblázatba esik, és a karton nem mozdul. Ez
                            a rendszer kimondott mobil-első elvével megy szembe, és
                            pont az idősebb felhasználót zavarja leginkább.
                            A táblázat mostantól a karton EGYETLEN görgetőjében nő,
                            ahogy a személyi kartonon is — egy görgetőfelület,
                            kiszámítható viselkedés. A `thead` így lehet a közös
                            `TBL.thead`; a ragadós fejléc elhagyása szándékos, mert
                            a kartonnak már van ragadós fülsávja, és két egymásra
                            tapadó ragadós sáv törött látványt ad. */}
                        <div>
                          <table className={TBL.table}>
                            <thead className={TBL.thead}>
                              <tr>
                                <th className={TBL.th}>Dátum</th>
                                {/* 2026-07-24 (PR-11, 7. észrevétel): látszódjon, MELYIK tag fizetett */}
                                <th className={TBL.th}>Befizető</th>
                                <th className={TBL.th}>Cél</th>
                                {/* 2026-08-04 (PR-43): MELYIK ÉVRE szól a befizetés. Az adat
                                    eddig is megérkezett (befizetes.fizetettev), csak nem
                                    látszott — a NYOMTATOTT családi karton viszont már mutatta,
                                    ezért a képernyő és a nyomtatvány eltért egymástól. */}
                                <th className={`${TBL.th} whitespace-nowrap`} title="Melyik évre szól a befizetés">Évre</th>
                                <th className={`${TBL.th} text-right`}>Összeg</th>
                                <th className={`hidden ${TBL.th} sm:table-cell`}>Bizonylat</th>
                              </tr>
                            </thead>
                            <tbody className={TBL.tbody}>
                              {payments.map((p) => {
                                const payerName = p.szemely
                                  ? `${p.szemely.csaladnev ?? ''} ${p.szemely.k_nev ?? ''}`.trim()
                                  : ''
                                // ⚑ 2026-08-11 — STORNÓ-JELÖLÉS a készlet alakjára.
                                // Eddig a TELJES sor `text-muted-foreground line-through
                                // opacity-70` volt; a készlet kommentje ezt névvel nevezi
                                // meg mint AA-bukást (2,62:1 — a lelkész nem tudja
                                // elolvasni, hogy mit stornóztak), és kimondja, hogy a
                                // `STORNO_CHIP` + `TXT.faint` áthúzott összeg (5,60:1) a
                                // helyes forma. A sor-szintű `title` marad.
                                return (
                                <tr
                                  key={p.id}
                                  className={TBL.tr}
                                  title={p.stornozott ? 'Stornózott tétel — nem számít bele az összegbe' : undefined}
                                >
                                  <td className={TBL.td}>
                                    {formatShortDate(p.datum)}
                                  </td>
                                  <td className="max-w-[10rem] truncate px-3 py-2 font-medium text-foreground" title={payerName || undefined}>
                                    {payerName || <span className={`italic ${TXT.muted}`}>családi</span>}
                                  </td>
                                  <td className="px-3 py-2 text-foreground">
                                    {p.befizetescel?.nev || <Dash />}
                                    {p.stornozott && (
                                      <span className={STORNO_CHIP} title="Stornózott tétel — nem számít bele az összegbe">
                                        STORNÓ
                                      </span>
                                    )}
                                  </td>
                                  <td className={`${TBL.td} whitespace-nowrap tabular-nums`}>
                                    {p.fizetettev ? `${p.fizetettev}. év` : <Dash />}
                                  </td>
                                  <td className={p.stornozott ? `${TBL.tdAmount} ${TXT.faint} line-through` : TBL.tdAmount}>
                                    {formatRon(Number(p.osszeg || 0))}
                                  </td>
                                  <td className={`hidden px-3 py-2 font-mono text-xs sm:table-cell ${TXT.muted}`}>
                                    {getTransactionDocumentNumber(p) || <Dash />}
                                  </td>
                                </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </Section>
                  )}
                </TabPanel>

                {/* 2026-07-24 (PR-11 review): teljes magasságú Sheet-ben a footer az
                    iPhone home-sávjába lógna — safe-area alsó padding (a személyi
                    karton mintája). */}
                <CardFooter
                  summary={
                    <>
                      {children.length + Number(Boolean(family.ferfi)) + Number(Boolean(family.no))} családtag · {payments.length} befizetés
                    </>
                  }
                >
                    {/* 2026-08-04 (PR-44): VÁLÁS — csak élő párnál, aktív kartonon.
                        Haláleset esetén az Anyakönyv → Temetés / Tag kivezetése
                        a helyes út (az magától lezárja a kapcsolatot). */}
                    {family.ferfi && family.no && !family.ferfi.meghalt && !family.no.meghalt && family.isaktiv !== false && (
                      <button
                        type="button"
                        onClick={() => setDivorceOpen(true)}
                        className={BTN.caution}
                      >
                        <HeartCrack className="size-3.5" />
                        Válás / kapcsolat felbontása
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditFamilyOpen(true)}
                      className={BTN.outline}
                    >
                      <Pencil className="size-3.5" />
                      Család szerkesztése
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className={BTN.filled}
                    >
                      Bezárás
                    </button>
                </CardFooter>
              </>
            )}
          </CardScroller>
        </div>
  )

  const subDialogs = (
    <>
      {/* 2026-06-02: Drill-down dialog — egy person-kartonra kattintáskor. */}
      {/* 2026-06-11: fénykép + közösségi link szerkesztő */}
      <AvatarEditorDialog
        open={!!avatarEditPerson}
        onOpenChange={(o) => { if (!o) setAvatarEditPerson(null) }}
        person={avatarEditPerson}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

      {/* 2026-07-24 (PR-11): beágyazott fallback — csak akkor él, ha a szülő
          nem delegálja a tag-kattintást (onOpenMember nélküli, önálló használat). */}
      {!onOpenMember && (
        <MemberDetailsDialogV2
          open={!!memberDialogMember || memberDialogLoading}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setMemberDialogMember(null)
              setMemberDialogLoading(false)
            }
          }}
          member={memberDialogMember}
          familyId={familyId}
        />
      )}

      {/* 2026-06-02: Családi karton szerkesztése (cím, körzet, tagok) */}
      <FamilyFormDialog
        open={editFamilyOpen}
        onOpenChange={(open) => {
          setEditFamilyOpen(open)
          if (!open && familyId) {
            // Reload az adatokat — a felhasználó esetleg módosította.
            // 2026-08-01 (PR-18 D5): catch nélkül az átmeneti hiba unhandled
            // rejection volt, és a null-eredmény némán „Nem található család"-ra
            // váltotta a kartont — hibánál inkább a meglévő adat marad.
            getFamilyDetails(familyId)
              .then((next) => { if (next) setData(next) })
              .catch(() => {
                toast.error('A családi karton frissítése nem sikerült — a korábbi adatok láthatók.')
              })
          }
        }}
        editFamily={
          family
            ? {
                id: family.id,
                c_utcaid: family.c_utcaid ?? null,
                c_szam: family.c_szam ?? null,
                isaktiv: family.isaktiv ?? true,
                id_csoport: family.id_csoport ?? null,
                ferfi: family.ferfi
                  ? {
                      id: family.ferfi.id,
                      csaladnev: family.ferfi.csaladnev ?? '',
                      k_nev: family.ferfi.k_nev ?? '',
                      ferfi: true,
                      sz_datum: family.ferfi.sz_datum ?? null,
                      allapot: family.ferfi.allapot ?? null,
                      meghalt: !!family.ferfi.meghalt,
                      namepattern: family.ferfi.namepattern ?? null,
                      vallas: family.ferfi.vallas ?? null,
                    }
                  : null,
                no: family.no
                  ? {
                      id: family.no.id,
                      csaladnev: family.no.csaladnev ?? '',
                      k_nev: family.no.k_nev ?? '',
                      ferfi: false,
                      sz_datum: family.no.sz_datum ?? null,
                      allapot: family.no.allapot ?? null,
                      meghalt: !!family.no.meghalt,
                      namepattern: family.no.namepattern ?? null,
                      vallas: family.no.vallas ?? null,
                    }
                  : null,
                utca: family.utca?.name ? { name: family.utca.name } : null,
                gyerekek: children.map((child) => ({
                  id: child.id,
                  csaladnev: child.csaladnev,
                  k_nev: child.k_nev,
                  sz_datum: child.sz_datum,
                  meghalt: child.meghalt,
                  kep: child.kep ?? null,
                })),
              }
            : null
        }
      />

      {/* 2026-08-04 (PR-44): Válás / kapcsolat felbontása.
          A gyermekek vér szerinti szülő-kapcsolata NEM szűnik meg — ezért nem a
          család-szerkesztőn keresztül megy. */}
      <FamilyDivorceDialog
        open={divorceOpen}
        onOpenChange={setDivorceOpen}
        family={
          family?.ferfi && family?.no
            ? {
                id: family.id,
                ferfi: { id: family.ferfi.id, name: `${family.ferfi.csaladnev ?? ''} ${family.ferfi.k_nev ?? ''}`.trim() || `#${family.ferfi.id}` },
                no: { id: family.no.id, name: `${family.no.csaladnev ?? ''} ${family.no.k_nev ?? ''}`.trim() || `#${family.no.id}` },
                childrenCount: children.length,
              }
            : null
        }
        onDone={() => {
          if (!familyId) return
          // A PR-18 D5 minta: hibánál inkább a meglévő adat marad, mint hogy a
          // null-eredmény „Nem található család"-ra váltsa a kartont.
          getFamilyDetails(familyId)
            .then((next) => { if (next) setData(next) })
            .catch(() => {
              toast.error('A családi karton frissítése nem sikerült — nyisd meg újra a kartont.')
            })
        }}
      />

      {/* 2026-06-02: Új családlátogatás rögzítése — közös form a munkanaplóval */}
      <FamilyVisitFormDialog
        open={visitFormOpen}
        onOpenChange={setVisitFormOpen}
        familyId={familyId}
        familyLabel={familyName}
        onSaved={refreshVisits}
      />
    </>
  )

  if (isPanel) {
    return (
      <>
        {cardBody}
        {subDialogs}
      </>
    )
  }

  // 2026-07-24 (PR-11): önálló mód — a családi karton is jobbról úszik be
  // (a személyi kartonnal egyező Sheet-séma), a korábbi középre pattanó
  // Dialog helyett.
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="h-dvh gap-0 overflow-hidden border-primary/15 bg-card p-0 shadow-[-32px_0_90px_-48px_rgba(8,58,54,0.55)] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-[side=right]:w-full data-[side=right]:max-w-none data-[side=right]:data-ending-style:translate-x-full data-[side=right]:data-starting-style:translate-x-full data-[side=right]:sm:w-[min(94vw,70rem)] data-[side=right]:sm:max-w-[70rem] motion-reduce:transition-none"
      >
        {cardBody}
      </SheetContent>
      {subDialogs}
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Alkomponensek

// 2026-08-11: a privát `TabButton` TÖRÖLVE — a készleté BETŰRE ugyanezeket az
// osztály-stringeket rendereli (alap, aktív, inaktív, badge, amber alávonás).
// Két különbség volt, egyik sem pixel: (1) a készlet `disabled:cursor-wait
// disabled:opacity-60` párost is visel — a családi karton egyetlen fület sem
// tilt, tehát a variáns néma; (2) a fenti ARIA-csere.

// 2026-08-11: a privát `Pill` és `Section` TÖRÖLVE — mindkettő a
// `registry-card-kit`-ből jön. A `Pill` osztály-stringjei betűre azonosak
// voltak. A `Section` KÉT ponton tért el, és mindkettő a családi karton
// kárára: a készlet szekció-fejléce `flex-wrap` + `min-w-[12rem] flex-1` +
// `min-w-0 break-words` + `shrink-0`, a családié nem volt az. Pont ezen a
// kartonon van a leghosszabb, összeg-tartalmú szekciócím
// („Befizetések (12 tétel · 2 640 RON · ebből 1 stornózott)"), tehát 320px-en
// pont itt szorult ki az akció-pirula a kártyából. Ahol a cím elfér, 0 pixel
// változás.

interface MemberShape {
  id: number
  csaladnev: string
  k_nev: string
  ferfi: boolean
  sz_datum: string | null
  meghalt: boolean
  vallas?: string | null
  foglalkozas?: string | null
  telefon?: string | null
  namepattern?: string | null
  allapot?: string | null
  kep?: string | null
  social_profil_url?: string | null
}

/**
 * 2026-08-11: a családi karton `MemberPanel`-je mostantól CSAK adat→prezentáció
 * leképezés — a pixelek a készlet `MemberPanel`-jéből jönnek (amelyet eredetileg
 * EBBŐL a komponensből emeltek ki). A hívási felület (`role` + `member`)
 * változatlan, mert a családi karton nyers `MemberShape`-et tart a kezében,
 * a készlet pedig szándékosan nem ismer üzleti típust.
 *
 * Az avatar-csoport (arckép + „Fénykép társítása" kamera-gomb) EGYETLEN `avatar`
 * node-ként megy be: a készlet ugyanabba a `<div className="relative shrink-0">`
 * burokba teszi, tehát a DOM és a geometria bájtra a régi.
 *
 * ⚑ KÉT ELTÉRÉS derült ki az összevetésnél, mindkettő a készlet javára dőlt el:
 *   1. SZEREP-PIRULA: itt `text-[10px]`, a készletben `text-[11px]` volt. Ugyanaz
 *      a „Családfő"/„Házastárs" pirula a személyi karton család-szekciójában
 *      11px-es, itt 10px-es — egymás melletti két oszlopban ugyanaz a jelvény
 *      két méretben. A készleté marad (a másik irány a személyi kartont törné,
 *      és 10px amúgy is a legkisebb olvasható méret alatt van).
 *   2. TELEFONSZÁM: itt link-SZÍNŰ, de halott `<p>` volt — a lelkész pont innen
 *      hívná fel a tagot. A készlet valódi `tel:` linket ad, 44px-es érintési
 *      magassággal; a szín és az ikon azonos. (A készlet kommentje ezt a
 *      döntést már 2026-08-11-én rögzítette.)
 */
function MemberPanel({
  role,
  member,
  onClick,
  onEditAvatar,
}: {
  role: 'head' | 'spouse'
  member: MemberShape
  onClick?: () => void
  /** 2026-06-11: fénykép/közösségi link szerkesztő megnyitása. */
  onEditAvatar?: () => void
}) {
  const isHead = role === 'head'
  const Icon = isHead ? Crown : Heart
  const age = ageFromDate(member.sz_datum)
  // A meta-próza pont-elválasztós alakja változatlan: „42 éves · református · tanár".
  const meta = [
    age != null ? `${age} éves` : 'kor ismeretlen',
    member.vallas || null,
    member.foglalkozas || null,
    member.allapot || null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <RegistryMemberPanel
      avatar={
        <>
          <MemberAvatar
            name={`${member.csaladnev} ${member.k_nev}`.trim()}
            kepUrl={member.kep}
            meghalt={member.meghalt}
            size={48}
            ring={isHead}
          />
          {onEditAvatar && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEditAvatar()
              }}
              className="pointer-events-auto absolute -bottom-3 -right-3 z-20 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition hover:scale-105 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              title="Fénykép társítása"
              aria-label="Fénykép társítása"
            >
              <span className="inline-flex size-6 items-center justify-center rounded-full border border-border bg-card shadow-sm">
                <Camera className="size-3" />
              </span>
            </button>
          )}
        </>
      }
      roleIcon={<Icon className="size-2.5" />}
      roleLabel={isHead ? 'Családfő' : 'Házastárs'}
      roleTone={isHead ? 'amber' : 'primary'}
      name={`${member.csaladnev} ${member.k_nev}`}
      deceased={member.meghalt}
      meta={meta}
      phone={member.telefon}
      onOpen={onClick}
      openAriaLabel={`${member.csaladnev} ${member.k_nev} személyi kartonjának megnyitása`}
    />
  )
}

// 2026-06-02: anyakönyvi sor-építő — minden esetet egységesen kezel
/**
 * 2026-08-11: a sor-TÍPUS a készlet `RegistryKind` szókincsére állt át
 * (`esketes`→`hazassag`, `kereszteles`→`keresztseg`, `konfirmacio`→`konfirmalas`).
 * A családi karton négy esetet ismer a hatból — a beköltözés és az áttérés
 * SZEMÉLY-szintű esemény, családi megfelelője nincs.
 */
type FamilyRegistryKind = Extract<RegistryKind, 'hazassag' | 'keresztseg' | 'konfirmalas' | 'temetes'>

interface RegistryRow {
  key: string
  type: FamilyRegistryKind
  date: string | null | undefined
  person: string | null
  location: string | null | undefined
  pastor: string | null | undefined
}

/**
 * 2026-08-11: a chip TÓNUSA és FELIRATA a készletből jön (`REGISTRY_TONES`,
 * `REGISTRY_LABELS`) — mindkettő a családi karton értékeivel készült, tehát
 * bájtra ugyanaz. Itt már csak az IKON marad, mert azt a `RegistryChip`
 * propként várja (a személyi karton más ikonokat használhat ugyanarra a
 * kategóriára, a szín és a felirat viszont közös).
 */
const REGISTRY_ICONS: Record<FamilyRegistryKind, ReactNode> = {
  hazassag: <Heart className="size-3.5 text-rose-500" />,
  keresztseg: <Church className="size-3.5 text-blue-500" />,
  konfirmalas: <Sparkles className="size-3.5 text-emerald-500" />,
  temetes: <Cross className="size-3.5 text-slate-500" />,
}

interface MemberLike {
  id: number
  csaladnev: string
  k_nev: string
}

function buildRegistryRows(args: {
  hazassag: { datum?: string; adrlocality?: { name: string } | null; lelkeszneve?: string } | null | undefined
  keresztelesek: Array<{ id_szemely: number; datum: string; adrlocality?: { name: string } | null; lelkeszneve?: string }>
  konfirmaciok: Array<{ id_szemely: number; datum: string; adrlocality?: { name: string } | null; lelkeszneve?: string }>
  temetesek: Array<{ id_szemely: number; hdatum: string }>
  members: Array<MemberLike | null | undefined>
}): RegistryRow[] {
  const memberMap = new Map<number, string>()
  for (const m of args.members) {
    if (m) memberMap.set(m.id, `${m.csaladnev || ''} ${m.k_nev || ''}`.trim())
  }
  const rows: RegistryRow[] = []
  if (args.hazassag?.datum) {
    rows.push({
      key: 'esketes',
      type: 'hazassag',
      date: args.hazassag.datum,
      person: null, // mindkét fél, a tagok-tabon látszik
      location: args.hazassag.adrlocality?.name ?? null,
      pastor: args.hazassag.lelkeszneve ?? null,
    })
  }
  args.keresztelesek.forEach((k, i) => rows.push({
    key: `b-${i}`,
    type: 'keresztseg',
    date: k.datum,
    person: memberMap.get(k.id_szemely) ?? null,
    location: k.adrlocality?.name ?? null,
    pastor: k.lelkeszneve ?? null,
  }))
  args.konfirmaciok.forEach((kon, i) => rows.push({
    key: `c-${i}`,
    type: 'konfirmalas',
    date: kon.datum,
    person: memberMap.get(kon.id_szemely) ?? null,
    location: kon.adrlocality?.name ?? null,
    pastor: kon.lelkeszneve ?? null,
  }))
  args.temetesek.forEach((t, i) => rows.push({
    key: `t-${i}`,
    type: 'temetes',
    date: t.hdatum,
    person: memberMap.get(t.id_szemely) ?? null,
    location: null,
    pastor: null,
  }))
  // Dátum szerint csökkenően rendezve (legújabb felül)
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return rows
}

/**
 * 2026-08-11: a táblázat-KERET a készlet `TBL` recept-készletéből. A `thead`,
 * a `th`, a `tbody`, a `tr`, a dátum-cella, a mobil-lista és a mobil-tétel
 * osztály-stringje BÁJTRA egyezett — a `TBL` ezekből készült.
 * EGY eltérés volt: a burkoló itt `shadow-sm` NÉLKÜL állt, míg a `TBL.wrapper`
 * (és ugyanezen a kartonon a befizetés-táblázat burkolója) árnyékkal. Két
 * táblázat egy kartonon, két különböző emeléssel — a `TBL.wrapper` marad.
 */
function RegistryTable({ rows }: { rows: RegistryRow[] }) {
  return (
    <div className={TBL.wrapper}>
      {/* Desktop táblázat */}
      <div className={TBL.desktop}>
        <table className={TBL.table}>
          <thead className={TBL.thead}>
            <tr>
              <th className={`${TBL.th} w-32`}>Esemény</th>
              <th className={`${TBL.th} w-28`}>Dátum</th>
              <th className={TBL.th}>Érintett személy</th>
              <th className={TBL.th}>Helyszín</th>
              <th className={TBL.th}>Lelkész</th>
            </tr>
          </thead>
          <tbody className={TBL.tbody}>
            {rows.map((row) => (
              <tr key={row.key} className={TBL.tr}>
                <td className="px-3 py-2">
                  <RegistryChip kind={row.type} icon={REGISTRY_ICONS[row.type]} />
                </td>
                <td className={TBL.tdStrong}>
                  {formatShortDate(row.date)}
                </td>
                {/* ⚠️ Itt SZÁNDÉKOSAN nem a készlet `Dash`-e áll: az esketés-sornak
                    nincs EGY érintettje (mindkét fél az), tehát ez „nem értelmezhető",
                    nem „nincs rögzítve" — a `Dash` képernyőolvasónak kimondott
                    „nincs rögzítve" szövege itt tévedés lenne. */}
                <td className="px-3 py-2 text-foreground">
                  {row.person ?? <span className={`italic ${TXT.muted}`}>—</span>}
                </td>
                <td className={TBL.td}>
                  {row.location ?? <Dash />}
                </td>
                <td className={TBL.td}>
                  {row.pastor ?? <Dash />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil: kompakt kártya-lista */}
      <div className={TBL.mobileList}>
        {rows.map((row) => (
          <div key={row.key} className={TBL.mobileItem}>
            <div className="flex items-center justify-between gap-2">
              <RegistryChip kind={row.type} icon={REGISTRY_ICONS[row.type]} />
              <span className="text-xs font-medium text-foreground">
                {formatShortDate(row.date)}
              </span>
            </div>
            {row.person && (
              <div className="text-sm text-foreground">{row.person}</div>
            )}
            {(row.location || row.pastor) && (
              <div className={`text-[11px] ${TXT.muted}`}>
                {row.location}
                {row.location && row.pastor && ' · '}
                {row.pastor && `Lelkész: ${row.pastor}`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// 2026-06-02: kezdőbetű-extraktor a fejléc-avatarhoz.
// Pl. "Bartók" → "B"; "Albu Beder" → "AB"; null → null.
function familyInitials(name: string | null): string | null {
  if (!name) return null
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (words.length === 0) return null
  return words.map((w) => w[0].toUpperCase()).join('')
}

// 2026-08-11: a privát `formatShortDate` TÖRÖLVE — a készlet függvénye
// karakterre ugyanezt adja („2026. aug. 10."), és a két karton dátum-írásmódja
// így nem tud külön elmozdulni.

// 2026-06-02: Családlátogatás-lista — kompakt időrendi nézet, papír-érzet
function VisitsList({ visits }: { visits: FamilyVisit[] }) {
  return (
    <ol className="relative ml-3 space-y-3 border-l-2 border-primary/20 pl-5">
      {visits.map((v) => (
        <li key={v.id} className="relative">
          {/* időpont-pötty */}
          <span
            aria-hidden
            className="absolute -left-[27px] top-2.5 flex size-4 items-center justify-center rounded-full border-2 border-primary/30 bg-card"
          >
            <span className="size-1.5 rounded-full bg-amber-400" />
          </span>
          {/* A kártya doboza a készlet `TBL.mobileCard` receptje (bájtra a régi
              `rounded-xl border border-border bg-card p-3 shadow-sm`), a
              hover-emelés marad a látogatás-kártya sajátja. */}
          <div className={`${TBL.mobileCard} transition-shadow hover:shadow-md motion-reduce:transition-none`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">
                {formatShortDate(v.datum)}
              </span>
              {v.lelkesz && (
                <span className={`text-xs ${TXT.muted}`}>
                  <span className="text-muted-foreground/70">Lelkész: </span>
                  {v.lelkesz}
                </span>
              )}
            </div>
            {/* Az ALAPIGE a készlet `QuoteBlock`-ja — ez a karton
                legjellegzetesebb eleme, és a személyi kartonon ugyanez az alak
                hordozza a lelkipásztori megjegyzést. Az idézőjelek most
                `aria-hidden`-ök (a képernyőolvasó eddig „bal alsó dupla
                idézőjel"-t mondott be az ige előtt). */}
            {v.alapige && <QuoteBlock spaced>{v.alapige}</QuoteBlock>}
            {v.megjegyzes && (
              <p className={`mt-1.5 whitespace-pre-line text-[13px] leading-relaxed ${TXT.muted}`}>
                {v.megjegyzes}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

