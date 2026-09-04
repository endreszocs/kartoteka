'use client'

/**
 * SZEMÉLYI KARTON v3 — teljes újraépítés (2026-08-11).
 * ─────────────────────────────────────────────────────────────────────────
 * A tulajdonosi kérés két mondata:
 *   1. „A személyi kartont újra kell dizájnolni, legyen színes, kategorizált
 *       és szépen áttekinthető minden!"
 *   2. „legyen a családi kartonhoz hasonló, mert az ott van mellette"
 *
 * A MÁSODIK a kormányzó megkötés, és KORREKCIÓKÉNT érkezett. A referencia-
 * design a CSALÁDI karton (`family-details-dialog-refined.tsx`): a két karton
 * a `registry-cards-host.tsx`-ben egymás mellett, két oszlopban látszik.
 * Ezért minden megosztott fogalom a `registry-card-kit.tsx`-ből jön — nem
 * „hasonló" osztályokkal, hanem UGYANAZOKKAL.
 *
 * A „hasonló" nem „azonos": a személyi kartonnak 5 füle van, a családinak
 * nincs label+érték párja, űrlapja, linkje. Ahol bővíteni kellett, a családi
 * karton nyelvét bővítettük (lásd a kit N1–N10 kommentjeit), nem másodikat
 * találtunk ki.
 *
 * MEGSZÓLÍTÁS: a családi karton látható UI-szövege MAGÁZ („rögzíthet egy új
 * családlátogatást"), a toastjai TEGEZNEK („próbáld újra"). A személyi karton
 * ugyanezt követi — a kartonon magázás, a toastokban a meglévő tegező
 * szövegek betűre változatlanok.
 *
 * KATEGÓRIA-SZÍNEK (egy akcentus fülönként):
 *   Összefoglaló = primary · Anyakönyv = amber · Befizetések = emerald ·
 *   Adatvédelem = slate · Hátralék = rose.
 *   EGYETLEN nevesített kivétel: a „Lelkipásztori megjegyzés" szekció MINDEN
 *   fülön amber — az amber „a lelkész keze".
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  Baby,
  BookOpen,
  CalendarDays,
  Check,
  Church,
  Compass,
  CreditCard,
  Cross,
  Crown,
  DoorOpen,
  GitBranch,
  Heart,
  HeartCrack,
  IdCard,
  Mail,
  MapPin,
  NotebookPen,
  Pencil,
  Phone,
  Printer,
  ShieldCheck,
  Sparkles,
  Star,
  User,
  UserPlus,
  Users,
} from 'lucide-react'
import { MemberAvatar } from '@kartoteka/ui-app'
import { toast } from 'sonner'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { getMemberDetails, updateMemberNote, updateRegistryEventDetails, updateMemberConsents, getMemberNevPublikalasConsent, type NoteEventKind } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { getFormerPartners, getMemberFamilySummary, type FormerPartner } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { getTransactionDocumentNumber } from '@/lib/constants/finance'
import { isOzvegyAllapot, isPrefixLikeNamepattern } from '@/lib/utils/member-helpers'
import { ageFromDate } from '@/lib/utils/date'
import type { EnrichedMember } from '@/lib/constants/members'
import { PersonCardPrintDialog } from '@/components/modals/person-card-print-dialog'
import { CnpRejtett } from '@/components/members/cnp-rejtett'
import { SzemelyiSzamMezo } from '@/components/members/szemelyi-szam-mezo'
import { cnpMaszkolando, cnpMezoCimke } from '@/lib/members/szemelyi-szam'
import { FamilyAssignDialog } from '@/components/modals/family-assign-dialog'
// 2026-08-11: az útvonal-célpont a HIVATALOS román alakból épül, és a lelkész
// egyszer meg is erősítheti a helyet (lásd a két modul fejlécét).
import { AddressVerifyDialog } from '@/components/modals/address-verify-dialog'
import { assessAddressMap, isPlaceholderLocality, type MemberDirectionsAddress } from '@/lib/members/directions'
import {
  AddressMapPill,
  BTN,
  CardFooter,
  CardHeaderChrome,
  CardScroller,
  Dash,
  DashedBlock,
  EmptyStrip,
  EmptyTab,
  ErrorBlock,
  FIELD_INPUT,
  FIELD_LABEL,
  FIELD_TEXTAREA,
  Field,
  FieldGroup,
  FloatingCloseButton,
  InlineEditor,
  LinkRow,
  LinkTile,
  MemberPanel,
  PersonRow,
  Pill,
  QuoteBlock,
  REGISTRY_LABELS,
  RegistryChip,
  STORNO_CHIP,
  Section,
  SkeletonGrid,
  SubBlock,
  TBL,
  TXT,
  TabBar,
  TabButton,
  TabPanel,
  formatLongDate,
  formatRon,
  formatShortDate,
  type PillTone,
  type RegistryKind,
  type RolePillTone,
} from '@/components/modals/registry-card-kit'

// 2026-07-24 (W2): az „Igazolás kiállítása" gomb az F6-os iktató-oldali
// kiállító-motort nyitja (a régi, iktatás nélküli MemberCertificateDialog
// kivezetve — a tagsági igazolást a seed „Tagsági igazolás" sablon adja).
// A dialógus KATTINTÁSKORI lazy-importtal töltődik (a filing-main
// openCertDialog mintája): NEM modul-szintű dynamic().catch(), mert ott egy
// átmeneti chunk-hiba után a hibakomponens örökre beégne; így hibánál toast
// jelez, és a KÖVETKEZŐ kattintás újra próbálja az importot. A type-only
// import build-kor törlődik.
type CertificateIssueDialogComponent =
  typeof import('@/components/filing/certificate-issue-dialog').CertificateIssueDialog

interface MemberDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: EnrichedMember | null
  familyId: number | null
  onEdit?: () => void
  onShowFamilyTree?: (memberId: number) => void
  onOpenFamily?: (familyId: number) => void
  /** 2026-07-24 (PR-4 F5.8): a kartonon mentett megjegyzés/hozzájárulás után hívódik —
   *  a lista így frissülhet, különben újranyitáskor a mentés ELŐTTI adat látszik. */
  onDataChanged?: () => void
  /** 2026-07-24 (PR-11): 'sheet' (default) = önálló, jobbról beúszó karton;
   *  'panel' = a RegistryCardsHost egyik oszlopa (nincs saját Sheet-keret). */
  variant?: 'sheet' | 'panel'
}

type Tab = 'personal' | 'registry' | 'payments' | 'privacy' | 'arrears'
type MemberDetailsData = Awaited<ReturnType<typeof getMemberDetails>>
type FamilySummaryData = Awaited<ReturnType<typeof getMemberFamilySummary>>

interface ConsentSnapshot {
  gdprConsentAt: string | null
  photoConsent: boolean
  mailingConsent: boolean
}

// ═════════════════════════════════════════════════════════════════════════
// Segédfüggvények (a v2-ből változatlan üzleti logikával)
// ═════════════════════════════════════════════════════════════════════════

function getBaseName(member: EnrichedMember) {
  const baseName = [member.csaladnev, member.k_nev].filter(Boolean).join(' ').trim()
  return baseName || '-'
}

function getMemberPrefix(member: Pick<EnrichedMember, 'allapot' | 'namepattern'>) {
  // 2026-08-01 (PR-19): kanonikus szabályok — az „Özv."/"özv" import-formák is
  // számítanak, a namepattern viszont CSAK akkor, ha tényleg előtag-szerű
  // (a legacy teljes-név namepattern nem kerülhet a név elé).
  const prefixes: string[] = []

  if (member.allapot === 'elvált') prefixes.push('elv.')
  if (isOzvegyAllapot(member.allapot)) prefixes.push('özv.')
  if (isPrefixLikeNamepattern(member.namepattern)) {
    const np = member.namepattern!.trim()
    if (!prefixes.some((p) => p.toLowerCase() === np.toLowerCase())) prefixes.push(np)
  }

  return prefixes.length > 0 ? prefixes.join(' ') : null
}

/**
 * 2026-08-11 (⚑ HELYESSÉGI JAVÍTÁS): a lakás-mezők (`c_tombhaz`,
 * `c_lepcsohaz`, `c_emelet`, `c_ajto`) a `MemberRow`-n mindig ott voltak, de a
 * kartonon SOSEM jelentek meg — tömbházas gyülekezetben a karton HIÁNYOS címet
 * mutatott. Nem új adat: meglévő adat, ami eddig némán elveszett.
 * Hiánynál `null`, hogy a közös „—" hiány-jelölés menjen.
 */
function formatAddressLine(member: EnrichedMember): string | null {
  const street = [member.adrstreet?.name, member.c_szam].filter(Boolean).join(' ').trim()
  const flat = [
    member.c_tombhaz ? `${member.c_tombhaz} tömb` : null,
    member.c_lepcsohaz ? `${member.c_lepcsohaz} lh.` : null,
    member.c_emelet ? `${member.c_emelet}. em.` : null,
    member.c_ajto ? `${member.c_ajto}. ajtó` : null,
  ].filter(Boolean)
  const line = [street, ...flat].filter(Boolean).join(', ')
  const locality = member.adrlocality?.name || null
  if (!line && !locality) return null
  if (!line) return locality
  return locality ? `${line} · ${locality}` : line
}

/**
 * ⚑ 2026-08-11 (a tulajdonos hibabejelentése): az „Útvonal" a MAGYAR nevekből
 * épült („Barátos, Főút, 144, România"), amire a Google Térkép szó szerint ezt
 * felelte: „A Google Térkép nem találja a következőt…". A hivatalos román alak
 * (Brateș / Strada Principală + megye + irányítószám) a `lib/members/directions.ts`
 * dolga — a célpont-építés ONNAN jön, itt csak a nyersanyagot állítjuk össze.
 *
 * A célpontból a lakás-töredékek (tömbház/lépcsőház/emelet/ajtó) továbbra is
 * KIMARADNAK: a térkép az ajtóig úgysem navigál, viszont elrontanák a
 * párosítást. A megjelenített cím ettől függetlenül teljes (`formatAddressLine`).
 *
 * Amíg a részletek töltődnek (`details === null`), a régi, magyar nevű alakra
 * esünk vissza — ez nem rosszabb a korábbi állapotnál, és egy pillanatig tart.
 */
function buildFallbackDirectionsAddress(member: EnrichedMember): MemberDirectionsAddress {
  return {
    locality: member.adrlocality?.name ? { name: member.adrlocality.name } : null,
    street: member.adrstreet?.name ? { name: member.adrstreet.name } : null,
    houseNumber: member.c_szam,
  }
}

interface MembershipPresentation {
  label: string
  tone: PillTone
  icon: ReactNode
  /** Életciklus-állapot (elhunyt / elköltözött / kitért / törölt) — ilyenkor a
   *  fizetési pirula ELNYOMÓDIK, mert már elmondta ugyanazt. */
  lifecycle: boolean
}

function getMembershipPresentation(member: EnrichedMember): MembershipPresentation {
  const status = (member.member_status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const religion = (member.vallas || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (member.meghalt || member.paymentStatus === 'elhunyt') {
    return { label: 'Elhunyt', tone: 'slate', icon: <Cross className="size-3" />, lifecycle: true }
  }
  if (member.elkoltozott || status === 'elkoltozott' || member.paymentStatus === 'elkoltozott') {
    return { label: 'Elköltözött', tone: 'slate', icon: <DoorOpen className="size-3" />, lifecycle: true }
  }
  if (status === 'kitert' || member.paymentStatus === 'kitert') {
    return { label: 'Kitért', tone: 'amber', icon: <ArrowLeftRight className="size-3" />, lifecycle: true }
  }
  if (status === 'torolt') {
    return { label: 'Törölt', tone: 'slate', icon: <User className="size-3" />, lifecycle: true }
  }
  if (religion === 'reformatus' || member.hasEverPaid) {
    return { label: 'Aktív tag', tone: 'emerald', icon: <Heart className="size-3 fill-current" />, lifecycle: false }
  }
  if (religion) {
    // 2026-08-11: a korábbi VIOLET tónus törölve — hatodik szín volt, osztott
    // jelentés nélkül. A „más vallású" nem baj és nem figyelmeztetés: semleges
    // gyülekezeti tény → primary.
    return { label: 'Más vallású', tone: 'primary', icon: <Church className="size-3" />, lifecycle: false }
  }
  return { label: 'Nem aktív', tone: 'slate', icon: <User className="size-3" />, lifecycle: false }
}

function getRelationName(
  relation?: { name?: string | null } | Array<{ name?: string | null }> | null
) {
  if (!relation) return null
  if (Array.isArray(relation)) return relation[0]?.name ?? null
  return relation.name ?? null
}

function getFamilyPersonName(person: { csaladnev: string | null; k_nev: string | null }) {
  return [person.csaladnev, person.k_nev].filter(Boolean).join(' ').trim() || 'Név nélküli személy'
}

// ═════════════════════════════════════════════════════════════════════════
// Anyakönyvi sor-építő (a v2-ből — logika VÁLTOZATLAN, csak a tónus/felirat
// került át a közös kitbe)
// ═════════════════════════════════════════════════════════════════════════

interface MemberRegistryRow {
  kind: NoteEventKind
  recordId: number
  label: string
  icon: ReactNode
  date: string | null
  location: string | null
  pastor: string | null
  note: string | null
  hoka: string | null
  hasPastor: boolean
  hasHoka: boolean
  /** A helyszín-mező címkéje (Helyszín vagy Honnan). */
  locationLabel: string
}

// 2026-07-24 (PR-11 review): a megjegyzés '|sablon:{json}' utótagja (emléklap-/
// gyászjelentés-adat, az Anyakönyv modul tárolási mintája) NEM jeleníthető meg
// és NEM szerkeszthető innen — a szerver mentéskor változatlanul visszafűzi.
function visibleNote(note: string | null | undefined): string | null {
  if (!note) return null
  const idx = note.indexOf('|sablon:')
  const base = (idx >= 0 ? note.slice(0, idx) : note).trim()
  return base || null
}

const REGISTRY_ICONS: Record<RegistryKind, ReactNode> = {
  // Az ikonok `-500` lépcsője MARAD: az ikon a mellette álló SZÖVEGCÍMKÉVEL
  // redundáns, tehát dekoratív — és a `-600`-ra váltás a családi karton
  // világos pixeleit is elmozdítaná.
  keresztseg: <Church className="size-3.5 text-blue-500" />,
  konfirmalas: <Sparkles className="size-3.5 text-emerald-500" />,
  hazassag: <Heart className="size-3.5 text-rose-500" />,
  bekoltozott: <DoorOpen className="size-3.5 text-teal-500" />,
  attert: <ArrowLeftRight className="size-3.5 text-amber-500" />,
  temetes: <Cross className="size-3.5 text-slate-500" />,
}

function buildMemberRegistryRows(details: MemberDetailsData | null): MemberRegistryRow[] {
  if (!details) return []
  const rows: MemberRegistryRow[] = []
  const push = (
    kind: RegistryKind,
    recordId: number,
    date: string | null,
    location: string | null,
    pastor: string | null,
    note: string | null,
    extra?: { hoka?: string | null; hasPastor?: boolean; hasHoka?: boolean; locationLabel?: string },
  ) => {
    rows.push({
      kind,
      recordId,
      label: REGISTRY_LABELS[kind],
      icon: REGISTRY_ICONS[kind],
      date,
      location,
      pastor,
      note,
      hoka: extra?.hoka ?? null,
      hasPastor: extra?.hasPastor ?? true,
      hasHoka: extra?.hasHoka ?? false,
      locationLabel: extra?.locationLabel ?? 'Helyszín',
    })
  }

  if (details.kereszteles) {
    push('keresztseg', details.kereszteles.id, details.kereszteles.datum ?? null,
      details.kereszteles.adrlocality?.name ?? null, details.kereszteles.lelkeszneve ?? null,
      visibleNote(details.kereszteles.megjegyzes))
  }
  if (details.konfirmacio) {
    push('konfirmalas', details.konfirmacio.id, details.konfirmacio.datum ?? null,
      details.konfirmacio.adrlocality?.name ?? null, details.konfirmacio.lelkeszneve ?? null,
      visibleNote(details.konfirmacio.megjegyzes))
  }
  if (details.hazassag) {
    push('hazassag', details.hazassag.id, details.hazassag.datum ?? null,
      getRelationName(details.hazassag.adrlocality), details.hazassag.lelkeszneve ?? null,
      visibleNote(details.hazassag.megjegyzes))
  }
  if (details.bekoltozott) {
    push('bekoltozott', details.bekoltozott.id, details.bekoltozott.mikor ?? null,
      details.bekoltozott.adrlocality?.name ?? null, null,
      visibleNote(details.bekoltozott.megjegyzes),
      { hasPastor: false, locationLabel: 'Honnan' })
  }
  if (details.attert) {
    push('attert', details.attert.id, details.attert.mikor ?? null,
      details.attert.adrlocality?.name ?? null, null,
      visibleNote(details.attert.megjegyzes),
      { hasPastor: false, locationLabel: 'Honnan' })
  }
  if (details.temetes) {
    push('temetes', details.temetes.id, details.temetes.tdatum || details.temetes.hdatum || null,
      details.temetes.adrlocality?.name ?? null, details.temetes.lelkeszneve ?? null,
      visibleNote(details.temetes.megjegyzes),
      { hoka: details.temetes.hoka ?? null, hasHoka: true })
  }

  // 2026-08-11: dátum szerint CSÖKKENŐEN, a dátum nélküliek a végén — betűre a
  // családi karton `buildRegistryRows` rendezésével. A korábbi fix típus-sorrend
  // (keresztelő → konfirmáció → esketés → …) így megszűnt: a sorrend maga is
  // információ, az életút időrendje.
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return rows
}

// ═════════════════════════════════════════════════════════════════════════
// A KARTON
// ═════════════════════════════════════════════════════════════════════════

export function MemberDetailsDialogV2({
  open,
  onOpenChange,
  member,
  familyId,
  onEdit,
  onShowFamilyTree,
  onOpenFamily,
  onDataChanged,
  variant = 'sheet',
}: MemberDetailsDialogProps) {
  const [details, setDetails] = useState<MemberDetailsData | null>(null)
  const [familySummary, setFamilySummary] = useState<FamilySummaryData>(null)
  // 2026-08-04 (PR-44): korábbi házastárs(ak) — válás vagy a másik fél elhunyta
  const [formerPartners, setFormerPartners] = useState<FormerPartner[]>([])
  const [consentSnapshot, setConsentSnapshot] = useState<ConsentSnapshot>({
    gdprConsentAt: null,
    photoConsent: false,
    mailingConsent: false,
  })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [tab, setTab] = useState<Tab>('personal')
  // 2026-07-24 (W2): F6-os igazolás/levél-kiállító (iktatással) — lásd a
  // CertificateIssueDialogComponent kommentjét a fájl tetején.
  const [certOpen, setCertOpen] = useState(false)
  const [CertDialog, setCertDialog] = useState<CertificateIssueDialogComponent | null>(null)
  // 2026-07-25 (PR-17): nyomtatható személyi karton (opcionális hátoldalakkal)
  const [cardPrintOpen, setCardPrintOpen] = useState(false)
  const [certChunkLoading, setCertChunkLoading] = useState(false)
  // 2026-08-01 (PR-18): családhoz rendelés a kartonról. A sikeres hozzárendelés
  // után a friss család-id felülírja a (lista-sorból jövő, már elavult)
  // familyId propot, amíg a lista újratölt.
  const [assignOpen, setAssignOpen] = useState(false)
  // 2026-08-11: „egyeztetés és lekérés" — a térkép-pont egyszeri megerősítése.
  const [geoVerifyOpen, setGeoVerifyOpen] = useState(false)
  const [assignedFamilyId, setAssignedFamilyId] = useState<number | null>(null)
  const effectiveFamilyId = assignedFamilyId ?? familyId ?? null
  // 2026-07-24 (PR-11 review): melyik tag adatai vannak betöltve — a
  // reloadToken-es CSENDES frissítés (pl. anyakönyv-mentés után) NEM dobja
  // vissza a felhasználót az Összefoglaló fülre és nem villant skeletont.
  const lastLoadedMemberIdRef = useRef<number | null>(null)

  // 2026-08-11 (D7): a lelkipásztori megjegyzés szerkesztője KÉT fülön él
  // (Összefoglaló + Befizetések). A piszkozat FELEMELVE a szülőbe: így a két
  // példány ugyanazt a szöveget mutatja, és megszűnt a néma felülírás-bug is
  // (eddig két független state volt, a később mentett felülírta a másikat).
  const [noteDraft, setNoteDraft] = useState('')
  const [noteBaseline, setNoteBaseline] = useState('')
  const [noteEditing, setNoteEditing] = useState(false)
  const [noteSaving, setNoteSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      lastLoadedMemberIdRef.current = null
      setAssignedFamilyId(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || !member) return

    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      const isNewIdentity = lastLoadedMemberIdRef.current !== member.id
      lastLoadedMemberIdRef.current = member.id
      if (isNewIdentity) {
        setDetails(null)
        setFamilySummary(null)
        setFormerPartners([])
        setAssignedFamilyId(null)
        setLoading(true)
        setTab('personal')
      }
      setLoadError(false)

      // 2026-08-01 (PR-18): a friss hozzárendelés (assignedFamilyId) felülírja
      // a lista-sorból örökölt familyId-t.
      const loadFamilyId = isNewIdentity ? (familyId ?? null) : effectiveFamilyId
      const familySummaryRequest = loadFamilyId
        ? getMemberFamilySummary(loadFamilyId).catch(() => null)
        : Promise.resolve(null)
      // 2026-08-04 (PR-44): a korábbi házastárs kiegészítő adat — a hibája NE
      // buktassa el a karton betöltését.
      const formerPartnersRequest = getFormerPartners(member.id).catch(() => [] as FormerPartner[])

      Promise.all([getMemberDetails(member.id, loadFamilyId), familySummaryRequest, formerPartnersRequest])
        .then(([data, nextFamilySummary, nextFormerPartners]) => {
          if (cancelled) return
          setDetails(data)
          setFamilySummary(nextFamilySummary)
          setFormerPartners(nextFormerPartners)
          setLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          setLoadError(true)
          setLoading(false)
        })
    })

    return () => {
      cancelled = true
    }
  }, [open, member, familyId, effectiveFamilyId, reloadToken])

  useEffect(() => {
    if (!member) return

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setConsentSnapshot({
        gdprConsentAt: member.gdpr_consent_at,
        photoConsent: Boolean(member.photo_consent),
        mailingConsent: Boolean(member.mailing_consent),
      })
    })

    return () => {
      cancelled = true
    }
  }, [member])

  // A megjegyzés-piszkozat a taghoz kötött — új tagnál (vagy a lista frissülése
  // után) újramagozódik, és a szerkesztő becsukódik.
  // ⚠️ A `memberId` KÖTELEZŐEN benne van a dep-listában: két olyan tag közt
  //    váltva, akiknek a megjegyzése azonos (tipikusan mindkettő üres), a puszta
  //    szöveg-dep nem sülne el, és az egyik tagnál gépelt piszkozat átvándorolna
  //    a másik kartonjára — onnan pedig MENTHETŐ lenne rossz személyre.
  const memberId = member?.id ?? null
  const memberNote = member?.megjegyzes ?? null
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setNoteDraft(memberNote || '')
      setNoteBaseline(memberNote || '')
      setNoteEditing(false)
    })
    return () => {
      cancelled = true
    }
  }, [memberId, memberNote])

  const paymentTotal = useMemo(() => {
    // 2026-07-24 (PR-4 F5.4): a stornózott tétel NEM számít az összegbe (F1-4 elv).
    return (details?.befizetesek || []).reduce(
      (sum, item) => sum + (item.stornozott ? 0 : Number(item.osszeg || 0)),
      0,
    )
  }, [details])

  const registryRows = useMemo(() => buildMemberRegistryRows(details), [details])

  if (!member) return null

  // 2026-07-24 (PR-4 F5.2): a Hátralék fül a TÉNYLEGES hátralék-bontásból dönt,
  // nem a bemenő member.paymentStatus-ból — így (a) a családi kartonról nyitott
  // karton (hard-kódolt 'rendezve') és (b) az idénre rendezett, de RÉGI években
  // tartozó tag többéves tartozása is látható. Amíg a részletek töltődnek, a
  // lista-státusz a fallback.
  const hasArrears = details
    ? (details.arrearsBreakdown || []).length > 0
    : member.paymentStatus === 'hatralekos'

  const prefix = getMemberPrefix(member)
  const baseName = getBaseName(member)
  const age = ageFromDate(member.sz_datum)
  const membership = getMembershipPresentation(member)
  const arrearsTotal = (details?.arrearsBreakdown || []).reduce((sum, row) => sum + row.debt, 0)
  const addressLine = formatAddressLine(member)
  // 2026-08-11: a betöltött cím (hivatalos román nevek + egyeztetett pont) az
  // elsődleges; amíg tölt, a magyar nevű tartalék megy — lásd a fenti kommentet.
  const directionsAddress = details?.cim ?? buildFallbackDirectionsAddress(member)
  // 2026-08-11: EGY hívás adja a célpontot ÉS a térkép-állapotot (a kis ikon
  // három állapota). Külön „feloldható-e" számolás itt TILOS — a
  // `lib/members/directions.ts` az egyetlen forrás.
  // 2026-08-11 (ÁTMENETI): a külföld-kapu az ORSZÁGTÖRZS méretét is megkapja.
  // Amíg egyetlen ország van (Románia), az ország-mező nem bizonyít semmit, és a
  // pirula szándékosan a semleges ágon marad — ugyanúgy, ahogy a Hibák fülön.
  // Töltés közben (`details` még null) ez `undefined` → fail-closed, óvatos ág.
  const mapAssessment = assessAddressMap(directionsAddress, details?.orszagtorzs)
  const directionsTarget = mapAssessment.target
  const directionsUrl = directionsTarget?.url ?? null
  // Az egyeztetés csak akkor menthető, ha a cím a CÍMTÖRZSBŐL választott sorra
  // mutat (van id) — szabad szöveges címnél nincs mire ráírni a pontot.
  const canVerifyAddress = Boolean(details?.cim?.locality?.id || details?.cim?.street?.id)
  // ⚠️ 2026-08-11 — A HELYKITÖLTŐ („?") SOR: ITT NEM AZ EGYEZTETÉS A TEENDŐ.
  //    Élesben 70 élő tag címe mutat egy „?" nevű `adrlocality` sorra. A
  //    „Cím egyeztetése" gomb EGYETLEN koordinátát írna a település sorára —
  //    ezzel 70 különböző valódi lakcím kerülne egyetlen hamis pontra, a Hibák
  //    fül `lakcim|logic` tétele pedig (NÉV-alapú lévén) akkor is nyitva
  //    maradna. Ezért a gomb ilyenkor NEM az ablakot nyitja, hanem kimondja az
  //    igazi teendőt. A pirula ugyanezt mondja (`assessAddressMap` 0. ága) —
  //    egyetlen forrás, két felület.
  const cimHelykitolto = isPlaceholderLocality(details?.cim?.locality)
  const currentIsFamilyAdult = familySummary?.adults.some((person) => person.id === member.id) ?? false
  const payments = details?.befizetesek || []
  const stornozottDb = payments.filter((p) => p.stornozott).length

  // ⚑ 2026-08-11 (a review 11. pontja): a „Hátralék" a MÁSODIK hely, nem az
  // utolsó. Öt fül együtt ~700px, 320px-en a látható sáv 248px — a régi
  // sorrendben a legsúlyosabb kategória volt a legmesszebb a képernyőn kívül,
  // ráadásul pont az, amelyik csak akkor létezik, ha VAN mit nézni rajta.
  // A fül feltételes megjelenése miatt a sorrend eddig sem volt állandó, tehát
  // izommemóriát nem tör el. (A felfedezhetőség másik fele — élhalványítás +
  // az aktív fül képbe görgetése — a közös `TabBar`-ban van.)
  const tabs: Array<{ value: Tab; label: string; icon: ReactNode; count?: number | null; tone?: 'rose' }> = [
    { value: 'personal', label: 'Összefoglaló', icon: <User className="size-4" /> },
    ...(hasArrears
      ? ([{
          value: 'arrears' as Tab,
          label: 'Hátralék',
          icon: <AlertTriangle className="size-4" />,
          count: details?.arrearsBreakdown.length ?? null,
          tone: 'rose' as const,
        }])
      : []),
    { value: 'registry', label: 'Anyakönyv', icon: <BookOpen className="size-4" />, count: registryRows.length },
    { value: 'payments', label: 'Befizetések', icon: <CreditCard className="size-4" />, count: payments.length },
    { value: 'privacy', label: 'Adatvédelem', icon: <ShieldCheck className="size-4" /> },
  ]

  // 2026-08-01 (PR-18): sikeres családhoz rendelés — a karton csendben újratölt
  // az új családdal, és a mögöttes lista is frissül.
  function handleAssigned(newFamilyId: number) {
    setAssignedFamilyId(newFamilyId > 0 ? newFamilyId : null)
    setReloadToken((t) => t + 1)
    onDataChanged?.()
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: Tab) {
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

    setTab(nextTab)
    requestAnimationFrame(() => document.getElementById(`member-tab-${nextTab}`)?.focus())
  }

  // ── 2026-07-24 (W2): Igazolás/levél-kiállító megnyitása ────────────────
  // Az első kattintás tölti be a lazy chunkot; hibánál toast, és a következő
  // kattintás ÚJRA próbálja (nincs beégett hibakomponens). Siker után a
  // komponens state-ben marad — a dialógus maga resetel nyitáskor, és az
  // initialPersonIds alapján előre betölti a tag anyakönyvi adatait.
  async function openCertDialog() {
    if (CertDialog) {
      setCertOpen(true)
      return
    }
    if (certChunkLoading) return
    setCertChunkLoading(true)
    try {
      const mod = await import('@/components/filing/certificate-issue-dialog')
      // Függvény-formájú setState kell: a komponens maga is függvény, a sima
      // setState updater-nek értelmezné és azonnal meghívná.
      setCertDialog(() => mod.CertificateIssueDialog)
      setCertOpen(true)
    } catch (err) {
      console.warn('[tagnyilvantartas] igazolás-kiállító chunk-betöltési hiba:', err)
      toast.error('Az igazolás-kiállító most nem tölthető be — próbáld újra.')
    } finally {
      setCertChunkLoading(false)
    }
  }

  async function handleNoteSave() {
    if (!member) return
    setNoteSaving(true)
    const res = await updateMemberNote(member.id, noteDraft)
    setNoteSaving(false)
    if (res && 'error' in res && res.error) {
      toast.error(res.error)
      return
    }
    setNoteBaseline(noteDraft)
    setNoteEditing(false)
    onDataChanged?.()
    toast.success('Megjegyzés mentve.')
  }

  // ── FEJLÉC-PIRULÁK ────────────────────────────────────────────────────
  // Max 5, csak ÁLLAPOT. A kor és a település a cím alatti meta-prózába megy
  // (családi dot-próza), a hiányzó adatok a figyelmeztető dobozba.
  const paymentPill: { tone: PillTone; icon: ReactNode; label: string } | null = membership.lifecycle
    ? null // P1–P2 már elmondta — így szűnt meg a régi „Elhunyt kétszer, két szürkével"
    : member.paymentStatus === 'felmentett'
      ? { tone: 'primary', icon: <ShieldCheck className="size-3" />, label: 'Felmentett' }
      : hasArrears
        ? {
            tone: 'rose',
            icon: <AlertTriangle className="size-3" />,
            label: details ? `Hátralék · ${formatRon(arrearsTotal)}` : 'Hátralékos',
          }
        : { tone: 'emerald', icon: <Check className="size-3" />, label: 'Rendezve' }

  const sacramentPill = details?.kereszteles && details?.konfirmacio
    ? { tone: 'emerald' as PillTone, icon: <Sparkles className="size-3" />, label: 'Keresztelt · Konfirmált' }
    : details?.kereszteles
      ? { tone: 'primary' as PillTone, icon: <Church className="size-3" />, label: 'Keresztelt' }
      : null

  // ── HIÁNYZÓ ADATOK ────────────────────────────────────────────────────
  // EGY doboz, MINDEN hiánnyal — ez váltja ki a régi ~14 beágyazott
  // „Nincs rögzítve" stringet.
  // ⚠️ A GDPR-hozzájárulás SZÁNDÉKOSAN kimarad: az jogi állapot (az Adatvédelem
  //    fül tulajdona), nem adatrögzítési hiány — benne a doboz a rekordok
  //    többségén permanens lenne, és megszokásból láthatatlanná válna.
  const missing: string[] = []
  if (!member.telefon) missing.push('telefonszám')
  if (!addressLine) missing.push('lakcím')
  if (!member.sz_datum) missing.push('születési dátum')
  if (!member.cnp) missing.push('személyi szám')
  if (!effectiveFamilyId) missing.push('család')
  if (!member.vallas) missing.push('vallás')

  // 2026-07-24 (PR-11): a karton törzse variant-független — 'sheet' módban a
  // saját jobbról beúszó Sheet-be, 'panel' módban a RegistryCardsHost oszlopába kerül.
  const isPanel = variant === 'panel'

  const metaParts = [
    age !== null ? `${age} éves` : null,
    member.adrlocality?.name ?? member.birthLocality?.name ?? null,
    member.szcs_nev ? `sz. ${member.szcs_nev}` : null,
  ].filter(Boolean)

  const cardTitleContent = (
    <>
      {prefix && <span className="mr-2 font-normal text-primary">{prefix}</span>}
      <span className="break-words">{baseName}</span>
    </>
  )

  const header = (
    <header className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-card to-amber-50/45 px-5 pb-5 pt-16 sm:px-8 sm:pb-7 sm:pt-7 dark:to-card [@media(max-height:600px)]:pb-3 [@media(max-height:600px)]:pt-14">
      <CardHeaderChrome />

      <div className="relative flex items-start gap-4">
        {/* A személynek ARCA van — ez tartalom, nem dekoráció: elsődleges
            felismerési jel, és hordozza a szépia + † elhunyt-állapotot.
            Két példány, mert a MemberAvatar inline `style`-lal méretez.
            A `ring-4 ring-card` burok a családi embléma gyűrűjének párja; a
            `ring` prop SZÁNDÉKOSAN nincs megadva (az ibolya glória kiiktatva).

            ⛔ 2026-08-11 (BLOCKER-javítás): a `hidden` / `sm:hidden` NEM
               kerülhet MAGÁRA a `MemberAvatar`-ra. A komponens gyökér-
               osztálylistája már tartalmaz `inline-flex`-et
               (`packages/ui-app/src/members/MemberAvatar.tsx:61`), a Tailwind 4
               pedig a `.hidden`-t a `.inline-flex` ELŐTT regisztrálja — azonos
               specificitásnál a KÉSŐBBI nyer, tehát a `hidden` néma no-op volt,
               és 640px alatt MINDKÉT arc (48 + 72px) egyszerre látszott. 320px-en
               ez ~120px a 288px-es törzsből, a `text-3xl` névnek ~144px maradt.
               A megoldás a családi kartoné: a kapcsoló egy CSUPASZ elemen ül,
               amelynek az alap-display-e a UA-stíluslapból jön, nem utility-ből
               (`family-details-dialog-refined.tsx:302-305`). */}
        <div className="shrink-0 [@media(max-height:600px)]:hidden">
          <span className="inline-flex rounded-full ring-4 ring-card sm:hidden">
            <MemberAvatar
              name={baseName}
              kepUrl={member.photo_url}
              meghalt={member.meghalt}
              size={48}
              className="motion-reduce:hover:scale-100"
            />
          </span>
          <span className="hidden rounded-full ring-4 ring-card sm:inline-flex">
            <MemberAvatar
              name={baseName}
              kepUrl={member.photo_url}
              meghalt={member.meghalt}
              size={72}
              className="motion-reduce:hover:scale-100"
            />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className={`${TXT.eyebrow} text-primary`}>Személyi karton · #{member.id}</p>
          </div>

          {isPanel ? (
            <h2 className={`${TXT.cardTitle} [@media(max-height:600px)]:text-xl`}>{cardTitleContent}</h2>
          ) : (
            <SheetTitle className={`${TXT.cardTitle} [@media(max-height:600px)]:text-xl`}>{cardTitleContent}</SheetTitle>
          )}
          {!isPanel && (
            <SheetDescription className="sr-only">
              {baseName} személyes, családi, anyakönyvi és pénzügyi adatainak áttekintése.
            </SheetDescription>
          )}

          {metaParts.length > 0 && (
            <p className={`mt-1.5 text-xs leading-relaxed sm:text-sm ${TXT.muted}`}>{metaParts.join(' · ')}</p>
          )}
        </div>
      </div>

      {/* ⚑ 2026-08-11 (a review 2. pontja): a PIRULA-SOR és a „Hiányzó adatok"
          doboz a fejléc GYÖKERÉBEN áll, az avatar/cím flex-soron KÍVÜL —
          betűre úgy, ahogy a családi kartonon
          (`family-details-dialog-refined.tsx:351` és `:381`).
          Korábban a szöveg-oszlopon BELÜL voltak, ezért `sm` fölött 88px-szel
          (72px avatar + 16px gap) beljebb kezdődtek, mint a családi oszlopé, és
          korábban tördeltek. Egymás mellett `lg`-nél ez volt a karton
          legláthatóbb geometriai eltérése: a két fejléc a cím alatt nem
          osztozott közös bal élen. A gyorsművelet-rács (lent) eleve itt volt —
          most már mind a három elem ugyanahhoz a padding-élhez igazodik. */}
      <div className="relative mt-3 flex flex-wrap items-center gap-2">
        {/* ⚑ 2026-08-11 (a review 8. pontja): az ÉLET-tengely pirulája CSAK
            akkor jelenik meg, ha a tagsági pirula nem életciklus-állapotot
            mond. `getMembershipPresentation` az „Elhunyt" / „Elköltözött" /
            „Kitért" / „Törölt" ágakon `lifecycle: true`-t ad — ilyenkor a
            korábbi kód KÉT szomszédos, azonos szövegű, azonos ikonú, azonos
            szürke pirulát rajzolt („Elhunyt" + „Elhunyt"). A `lifecycle` a
            fizetési pirulát eddig is elnyomta; most az élet-pirulát is.
            Így — a családi kartonhoz hasonlóan — PONTOSAN EGY életciklus-pirula
            van. (Ha `!lifecycle`, akkor `member.meghalt` bizonyosan hamis, mert
            az az első ág — tehát itt mindig az „Élő" alak a helyes.) */}
        {!membership.lifecycle && (
          <Pill tone="emerald" icon={<Heart className="size-3 fill-current" />}>
            Élő
          </Pill>
        )}
        <Pill tone={membership.tone} icon={membership.icon}>
          {membership.label}
        </Pill>
        {paymentPill && (
          <Pill tone={paymentPill.tone} icon={paymentPill.icon}>
            {paymentPill.label}
          </Pill>
        )}
        {sacramentPill && (
          <Pill tone={sacramentPill.tone} icon={sacramentPill.icon}>
            {sacramentPill.label}
          </Pill>
        )}
        {member.pendingTransfer && (
          <Pill tone="amber" icon={<DoorOpen className="size-3" />}>
            Átadás folyamatban · {member.pendingTransfer.target_congregation_name}
          </Pill>
        )}
      </div>

      {missing.length > 0 && (
        <div className="relative mt-4 inline-flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-800 shadow-sm dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" aria-hidden />
          <span>
            <strong>Hiányzó adatok:</strong> {missing.join(', ')}
          </span>
        </div>
      )}

      {/* GYORSMŰVELETEK — 320px-en is 90px/csempe, jóval a 44px fölött. */}
      <div className="relative mt-4 grid grid-cols-3 gap-2 [@media(max-height:600px)]:mt-2">
        <LinkTile icon={<Phone className="size-4" />} label="Telefon" href={member.telefon ? `tel:${member.telefon}` : null} />
        <LinkTile icon={<Mail className="size-4" />} label="E-mail" href={member.email ? `mailto:${member.email}` : null} />
        <LinkTile icon={<MapPin className="size-4" />} label="Útvonal" href={directionsUrl} external />
      </div>
    </header>
  )

  // ── LELKIPÁSZTORI MEGJEGYZÉS ──────────────────────────────────────────
  // ⚠️ NEVESÍTETT SZÍN-KIVÉTEL: ez a szekció MINDEN fülön amber. Az amber „a
  //    lelkész keze"; a megjegyzés vizuálisan ugyanaz az objektum, bárhol
  //    jelenik meg. Ez az EGYETLEN kivétel az „egy akcentus fülönként" alól.
  // Az olvasó nézet a családi karton alapige-idiómája (idézet-blokk), a
  // szerkesztő ugyanaz az InlineEditor, mint az anyakönyvi soré. A piszkozat
  // és a nyitva-állapot FELEMELVE — a két fül ugyanazt mutatja.
  const notePlaceholder = tab === 'payments'
    ? 'Pl. fizetési megállapodás, részletfizetés, egyeztetés…'
    : 'Pl. látogatási emlékeztető, családi körülmények, imatéma…'

  const noteSection = (
    <Section title="Lelkipásztori megjegyzés" icon={<NotebookPen className="size-4" />} accent="amber">
      {tab === 'payments' && (
        <p className={`-mt-2 mb-3 text-xs ${TXT.muted}`}>Ugyanaz a megjegyzés, mint az Összefoglaló fülön.</p>
      )}
      {noteEditing ? (
        <InlineEditor>
          <label className={FIELD_LABEL}>
            Megjegyzés
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder={notePlaceholder}
              rows={3}
              className={FIELD_TEXTAREA}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className={BTN.outline}
              disabled={noteSaving}
              onClick={() => {
                setNoteDraft(noteBaseline)
                setNoteEditing(false)
              }}
            >
              Mégse
            </button>
            <button
              type="button"
              className={BTN.filled}
              disabled={noteSaving || noteDraft === noteBaseline}
              onClick={() => void handleNoteSave()}
            >
              {noteSaving ? 'Mentés…' : 'Mentés'}
            </button>
          </div>
        </InlineEditor>
      ) : (
        <>
          {noteBaseline ? <QuoteBlock>{noteBaseline}</QuoteBlock> : <EmptyStrip>{notePlaceholder}</EmptyStrip>}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {noteBaseline && <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Mentve ✓</span>}
            <button type="button" className={BTN.outline} onClick={() => setNoteEditing(true)}>
              <Pencil className="size-3.5" aria-hidden />
              {noteBaseline ? 'Megjegyzés szerkesztése' : 'Megjegyzés hozzáadása'}
            </button>
          </div>
        </>
      )}
    </Section>
  )

  // ── T1 — ÖSSZEFOGLALÓ ─────────────────────────────────────────────────
  const familyLabel = familySummary
    ? `Család — ${familySummary.displayName} (${familySummary.memberCount} fő)`
    : 'Család'

  const personalTab = (
    <>
      <Section title="Elérhetőségek" icon={<Phone className="size-4" />} accent="primary">
        <div className="divide-y divide-border/70">
          <LinkRow
            icon={<Phone className="size-4" />}
            label="Mobil"
            value={member.telefon || null}
            href={member.telefon ? `tel:${member.telefon}` : null}
          />
          <LinkRow
            icon={<Mail className="size-4" />}
            label="E-mail"
            value={member.email || null}
            href={member.email ? `mailto:${member.email}` : null}
          />
          <LinkRow icon={<MapPin className="size-4" />} label="Lakcím" value={addressLine} href={directionsUrl} external />
        </div>

        {/* ⚑ 2026-08-11 — TÉRKÉP-EGYEZTETÉS.
            A tulajdonos bejelentése: „nem tökéletes, mert nem találja! Legyen
            valamilyen egyeztetés és lekérés, hogy biztosan jól működjön!"
            Ez a sáv az „egyeztetés" LÁTHATÓ fele: megmutatja, mit kap a térkép,
            és ha az bizonytalan, egy koppintással megnyílik a megerősítő ablak.
            Sosem blokkol: az „Útvonal" gomb közben végig működik. */}
        {addressLine && directionsTarget && (
          <div className="mt-3 space-y-2 rounded-xl border border-border/60 bg-background/40 p-3">
            {/* ⚑ 2026-08-11 — A KIS IKON (a tulajdonos kérése).
                Egy pillantásra megmondja, kezeli-e a térkép ezt a címet:
                pipás gombostű = megtalálja · nagyító = csak a faluig visz ·
                áthúzott gombostű = a települést sem találja (ITT kell javítani).
                ⚠️ CSAK a betöltött, hivatalos címadatból (`details.cim`)
                rajzoljuk. A töltés alatti magyar nevű tartaléknak SOHA nincs
                román neve, tehát a pirula egy pillanatra hamis riasztást
                villantana minden kartonon — a hamis jelzés drágább, mint a
                fél másodperces késés. */}
            {details?.cim && (
              <AddressMapPill
                status={mapAssessment.status}
                label={mapAssessment.label}
                detail={mapAssessment.detail}
              />
            )}
            <p className="break-words text-xs leading-5 text-muted-foreground">
              <span className="font-semibold text-foreground">A térkép ezt keresi:</span>{' '}
              {directionsTarget.kind === 'koordinata'
                ? `egyeztetett pont (${directionsTarget.destination})`
                : directionsTarget.destination}
            </p>

            {/* ⚠️ A helykitöltő („?") soron SOHA nem mondjuk, hogy „egyeztetve van":
                attól, hogy van egy mentett pont, még nem tudjuk, hol lakik a tag —
                és a Hibák fülön a tétel (NÉV-alapú lévén) nyitva is marad. */}
            {directionsTarget.verified && !cimHelykitolto ? (
              <p className="flex items-start gap-1.5 text-xs leading-5 text-emerald-700 dark:text-emerald-300">
                <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  Ez a cím egyeztetve van a térképpel.
                  {directionsTarget.precision === 'telepules' && directionsTarget.kind === 'koordinata'
                    ? ' A pont a településre mutat — a házszámot a helyszínen keresd.'
                    : ''}
                </span>
              </p>
            ) : (
              <p className="flex items-start gap-1.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  {/* ⚠️ A helykitöltő („?") soron az „egyeztesd a térképpel" mondat
                      ROSSZ irányba terel: ott nem a térkép hibázik, hanem hiányzik
                      a település. A pirula ugyanezt mondja — ez a sor nem mondhat
                      mást egy centivel lejjebb. */}
                  {cimHelykitolto
                    ? 'Ehhez a címhez nincs valódi település rögzítve, ezért az egyeztetés nem segít — előbb az Elérhetőségeknél válaszd ki a tényleges települést.'
                    : 'Ez a cím még nincs egyeztetve a térképpel.'}
                  {!cimHelykitolto && directionsTarget.warnings.length > 0
                    ? ` ${directionsTarget.warnings[0]}`
                    : ''}
                </span>
              </p>
            )}

            <button
              type="button"
              className={BTN.outline}
              onClick={() => {
                // A `details` a cím-adatok forrása. Amíg tölt, a gomb NEM hazudik
                // hiányzó címtörzset — csak megkér, hogy várj egy pillanatot.
                if (!details) {
                  toast.info('A cím adatai még töltődnek — egy pillanat, és próbáld újra.')
                  return
                }
                if (!canVerifyAddress) {
                  toast.info(
                    'Ehhez a taghoz nincs a címtörzsből választott település vagy utca, ezért az egyeztetés nem menthető. Nyisd meg a tag szerkesztőjét, és válaszd ki a települést a listából.',
                    { duration: 9000 },
                  )
                  return
                }
                // A helykitöltő („?") soron az egyeztetés ROMBOLNA (lásd a
                // `cimHelykitolto` melletti indoklást) — a valódi teendőt mondjuk.
                if (cimHelykitolto && !details?.cim?.street?.id) {
                  toast.info(
                    'Ehhez a címhez nincs valódi település rögzítve — a címtörzsben csak egy helykitöltő („?") áll. A térképpel ezt nem lehet egyeztetni: nyisd meg a tag szerkesztőjét, és válaszd ki a tényleges települést.',
                    { duration: 12000 },
                  )
                  return
                }
                setGeoVerifyOpen(true)
              }}
              aria-label="A lakcím egyeztetése a térképpel"
            >
              <Compass className="size-3.5" aria-hidden />
              {directionsTarget.verified ? 'Egyeztetés módosítása' : 'Cím egyeztetése'}
            </button>
          </div>
        )}
      </Section>

      <Section
        title={familyLabel}
        icon={<Users className="size-4" />}
        accent="primary"
        action={
          effectiveFamilyId && onOpenFamily ? (
            <button type="button" className={BTN.sectionAction} onClick={() => onOpenFamily(effectiveFamilyId)}>
              <Users className="size-3.5" aria-hidden />
              Családi karton · #{effectiveFamilyId}
            </button>
          ) : !effectiveFamilyId ? (
            <button type="button" className={BTN.sectionAction} onClick={() => setAssignOpen(true)}>
              <UserPlus className="size-3.5" aria-hidden />
              Családhoz rendelés
            </button>
          ) : undefined
        }
        footer={
          effectiveFamilyId || onShowFamilyTree ? (
            <>
              {effectiveFamilyId && (
                <button
                  type="button"
                  className={BTN.outline}
                  title="Áthelyezés másik családba"
                  onClick={() => {
                    // 2026-08-01 (PR-18 review): a családfő/házastárs áthelyezését
                    // a szerver úgyis tiltja (előbb a családi kartonon kell kivenni
                    // a felnőtt tagok közül) — zsákutca helyett odairányítjuk.
                    if (currentIsFamilyAdult) {
                      // 2026-08-04 (PR-44): a válás külön, adatmegőrző út — odairányítunk.
                      toast.info('Családfő/házastárs áthelyezéséhez előbb a jelenlegi család kartonján módosítsd a felnőtt tagokat — a gyermekek áthelyezése innen működik. Váláshoz a családi kartonon a „Válás / kapcsolat felbontása” gombot használd.', { duration: 10000 })
                      if (onOpenFamily && effectiveFamilyId) onOpenFamily(effectiveFamilyId)
                      return
                    }
                    setAssignOpen(true)
                  }}
                >
                  <ArrowLeftRight className="size-3.5" aria-hidden />
                  Áthelyezés
                </button>
              )}
              {onShowFamilyTree && (
                <button type="button" className={BTN.outline} onClick={() => onShowFamilyTree(member.id)}>
                  <GitBranch className="size-3.5" aria-hidden />
                  Családfa
                </button>
              )}
            </>
          ) : undefined
        }
      >
        {/* HÁROM család-állapot — mind a három megmarad. */}
        {familySummary ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {familySummary.adults.map((person) => {
                const isSelf = person.id === member.id
                // 2026-07-24 (PR-4 F5.5): a címkék a TÉNYLEGES haztartas_tag-
                // szerepből jönnek (nem heurisztikából), és egy gyermek kartonján
                // a testvérei „Testvér" címkét kapnak.
                const roleLabel = isSelf
                  ? 'Ő maga'
                  : person.role === 'csaladfo'
                    ? (currentIsFamilyAdult ? 'Házastárs (családfő)' : 'Családfő')
                    : person.role === 'hazastars'
                      ? (currentIsFamilyAdult ? 'Házastárs' : 'Szülő')
                      : 'Szülő / családfő'
                const roleTone: RolePillTone = isSelf ? 'slate' : person.role === 'csaladfo' ? 'amber' : 'primary'
                const roleIcon = isSelf
                  ? <Star className="size-2.5" />
                  : person.role === 'csaladfo'
                    ? <Crown className="size-2.5" />
                    : <Heart className="size-2.5" />
                const personAge = ageFromDate(person.sz_datum)
                const personName = getFamilyPersonName(person)
                return (
                  <MemberPanel
                    key={`adult-${person.id}`}
                    avatar={<MemberAvatar name={personName} size={48} />}
                    roleIcon={roleIcon}
                    roleLabel={roleLabel}
                    roleTone={roleTone}
                    name={personName}
                    meta={personAge != null ? `${personAge} éves` : 'kor ismeretlen'}
                    highlighted={isSelf}
                  />
                )
              })}
            </div>

            {familySummary.children.length > 0 && (
              <SubBlock
                icon={<Baby className="size-4" />}
                tone="amber"
                title={`${currentIsFamilyAdult ? 'Gyermekek' : 'Testvérek'} (${familySummary.childrenCount})`}
              >
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {familySummary.children.map((person) => {
                    const personName = getFamilyPersonName(person)
                    const relation = person.id === member.id
                      ? 'Ő maga'
                      : !currentIsFamilyAdult
                        ? 'Testvér'
                        : person.role === 'unoka'
                          ? 'Unoka'
                          : 'Gyermek'
                    // ⚑ 2026-08-11 (a review 7. pontja): a gyermekek KORA némán
                    // eltűnt az újraépítéskor. A régi `FamilySummaryRow` minden
                    // családtagnak írt születési évet; az új kártyán a felnőttek
                    // megkapták (`meta`), a gyermekek nem — pedig a `sz_datum`
                    // ott van a betöltött adatban (`getMemberFamilySummary`).
                    // A családi karton gyermek-sora ugyanezt írja: „(N éves)"
                    // (`family-details-dialog-refined.tsx:506-508`) — egymás
                    // mellett a bal oszlop mutatta, a jobb nem.
                    const childAge = ageFromDate(person.sz_datum)
                    return (
                      <PersonRow
                        key={`child-${person.id}`}
                        avatar={<MemberAvatar name={personName} size={22} />}
                        name={personName}
                        trailing={childAge != null ? `${relation} · ${childAge} éves` : relation}
                      />
                    )
                  })}
                </div>
                {familySummary.childrenCount > familySummary.children.length && (
                  <p className="mt-2 text-xs font-medium text-primary">
                    + {familySummary.childrenCount - familySummary.children.length} további gyermek vagy unoka
                  </p>
                )}
              </SubBlock>
            )}

            {familySummary.adults.length === 0 && familySummary.childrenCount === 0 && (
              <EmptyStrip>A családhoz még nincs aktív személykapcsolat rögzítve.</EmptyStrip>
            )}
          </>
        ) : effectiveFamilyId ? (
          <EmptyStrip>A család részletes kapcsolatai most nem elérhetők.</EmptyStrip>
        ) : (
          /* 2026-08-01 (PR-18): a „Nincs családhoz rendelve" eddig zsákutca volt —
             a hozzárendelés a szekció akció-pirulájáról indul (nem duplikálva).
             ⚑ 2026-08-11 (a review 3. pontja): `EmptyTab` → `EmptyStrip`. A
             `Section` maga `bg-card`, tehát az `EmptyTab` (szintén `bg-card`)
             kontraszt nélküli kártyát rajzolt kártyára — és ugyanabban a
             „Család" szekcióban három különböző üres-alak futott egyszerre. */
          <EmptyStrip hint="A „Családhoz rendelés” gombbal kapcsolhatja meglévő családhoz, vagy hozhat létre újat.">
            Nincs családhoz rendelve.
          </EmptyStrip>
        )}

        {/* 2026-08-04 (PR-44): KORÁBBI HÁZASTÁRS — a lezárt pár-élekből.
            Csak életesemény (válás / a másik fél elhunyta) jelenik meg. */}
        {formerPartners.length > 0 && (
          <DashedBlock
            icon={<HeartCrack className="size-4" />}
            title={`${formerPartners.length > 1 ? 'Korábbi házastársak' : 'Korábbi házastárs'} (${formerPartners.length})`}
            footnote="Csak életesemény (válás vagy a másik fél elhunyta) jelenik meg — a korábbi kapcsolat a család jelenlegi tagjai közé nem számít bele."
          >
            <div className="grid gap-1.5 sm:grid-cols-2">
              {formerPartners.map((partner) => {
                const detail = partner.ok === 'valas'
                  ? `${partner.tipus === 'elettars' ? 'kapcsolat felbontva' : 'elvált'}${partner.datum ? ` · ${formatLongDate(partner.datum)}` : ''}`
                  : `elhunyt házastárs${partner.datum ? ` · ${formatLongDate(partner.datum)}` : ''}`
                const clickable = Boolean(partner.csaladId && onOpenFamily)
                // Hover-visszajelzés csak valódi célpontnál — különben hazug affordancia.
                const rowClass = `flex min-h-11 flex-col items-start gap-0.5 rounded-xl border border-transparent px-2 py-1.5 text-left text-sm${
                  clickable
                    ? ' hover:border-primary/10 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    : ''
                }`
                const rowContent = (
                  <>
                    <span className="font-medium text-foreground">{partner.name}</span>
                    <span className={`text-xs ${TXT.muted}`}>{detail}</span>
                  </>
                )
                // A TELJES SOR a célpont (nem egy apró chevron) — telefonon ez
                // nagyságrenddel nagyobb koppintási felület.
                return clickable && onOpenFamily ? (
                  <button
                    key={partner.id}
                    type="button"
                    className={rowClass}
                    onClick={() => onOpenFamily(partner.csaladId!)}
                    aria-label={`${partner.name} családi kartonjának megnyitása`}
                  >
                    {rowContent}
                  </button>
                ) : (
                  <div key={partner.id} className={rowClass}>
                    {rowContent}
                  </div>
                )
              })}
            </div>
          </DashedBlock>
        )}

        <SubBlock icon={<Users className="size-4" />} tone="slate" title="Szülők">
          <FieldGroup>
            <Field label="Édesapa" value={member.apjaneve || <Dash />} />
            <Field label="Édesanya" value={member.anyjaneve || <Dash />} />
          </FieldGroup>
        </SubBlock>
      </Section>

      <Section title="Gyülekezeti adatok" icon={<BookOpen className="size-4" />} accent="primary">
        <FieldGroup>
          {/* A tagsági állapot label-je EGY függvényből jön, két render-helyre. */}
          <Field label="Tagsági állapot" value={membership.label} />
          <Field label="Vallás" value={member.vallas || <Dash />} />
          <Field label="Keresztelés" value={formatLongDate(details?.kereszteles?.datum) || <Dash />} />
          <Field label="Konfirmáció" value={formatLongDate(details?.konfirmacio?.datum) || <Dash />} />
        </FieldGroup>

        <SubBlock icon={<User className="size-4" />} tone="slate" title="Személyes adatok">
          <FieldGroup>
            <Field
              icon={<CalendarDays className="size-4" />}
              label="Születési dátum"
              value={formatLongDate(member.sz_datum) || <Dash />}
            />
            <Field icon={<MapPin className="size-4" />} label="Születési hely" value={member.birthLocality?.name || <Dash />} />
            {/* ⚑ 2026-08-11: a leánykori név eddig sehol nem látszott a kartonon,
                pedig anyakönyvi kereséskor és igazolás kiállításakor ez a kulcs. */}
            <Field label="Leánykori név" value={member.szcs_nev || <Dash />} />
            <Field icon={<User className="size-4" />} label="Foglalkozás" value={member.foglalkozas || <Dash />} />
            {/* 2026-08-11 (D10): a CNP a FEJLÉCBŐL ide költözött. Nem látogatási
                tény, viszont személyazonosító adat — nem való egy utcán felmutatott
                telefon fejlécébe.
                2026-08-25 (GDPR): az érték ALAPBÓL MASZKOLT — csak a szem-ikonnal
                fedhető fel, és a megtekintés naplózódik (CnpRejtett).
                2026-09-05 (Endre észrevétele): a mező KETTÉVÁLT. A `szemely.cnp`
                az, ami valójában: EGYHÁZI BELSŐ azonosító (és a szülő-kapcsolatok
                idegen kulcsa) — a nyomtatott karton már ma is így hívja. A
                HIVATALOS személyi szám külön, szűkebb hozzáférésű helyre került. */}
            <Field
              icon={<IdCard className="size-4" />}
              label={cnpMezoCimke(member.cnp)}
              value={
                member.cnp ? (
                  cnpMaszkolando(member.cnp) ? (
                    // Ismeretlen alak → SZEMÉLYES ADATNAK vesszük (fail-safe).
                    // Ilyet a desktop új-tag űrlapja írhatott ide valódi CNP-ként.
                    <CnpRejtett cnp={member.cnp} szemelyId={member.id} />
                  ) : (
                    <span className="break-all">{member.cnp}</span>
                  )
                ) : (
                  <Dash />
                )
              }
              mono
            />
            <Field
              icon={<IdCard className="size-4" />}
              label="Személyi szám (CNP)"
              value={<SzemelyiSzamMezo szemelyId={member.id} />}
              mono
            />
          </FieldGroup>
        </SubBlock>
      </Section>

      {noteSection}
    </>
  )

  // ── T2 — ANYAKÖNYV ────────────────────────────────────────────────────
  const registryTab = registryRows.length === 0 ? (
    <EmptyTab
      icon={<BookOpen className="size-10" />}
      title="Nincs anyakönyvi bejegyzés ehhez a személyhez."
      hint="Az adatok az Anyakönyv modulból származnak — ott rögzíthet újat."
    />
  ) : (
    <Section title={`Anyakönyvi bejegyzések (${registryRows.length})`} icon={<BookOpen className="size-4" />} accent="amber">
      <MemberRegistrySection
        rows={registryRows}
        onChanged={() => {
          setReloadToken((current) => current + 1)
          onDataChanged?.()
        }}
      />
    </Section>
  )

  // ── T3 — BEFIZETÉSEK ──────────────────────────────────────────────────
  // ⛔ A DARABSZÁM tartalmazza a stornó sorokat; az ÖSSZEG és a
  //    „Legutóbbi rendezett év" NEM (F1-4 elv).
  const lastSettledYear = (() => {
    // 2026-07-25 (F6.3, M5): a LEGNAGYOBB jogcím-év (fizetettev), nem a dátum
    // szerint legfrissebb sor éve.
    const years = payments
      .filter((b) => !b.stornozott)
      .map((b) => Number(b.fizetettev))
      .filter((y) => Number.isFinite(y) && y > 0)
    return years.length > 0 ? `${Math.max(...years)}. év` : 'Nincs évhez kötve'
  })()

  const paymentsTab = (
    <>
      <Section
        title={`Befizetések (${payments.length} tétel · ${formatRon(paymentTotal)}${stornozottDb > 0 ? ` · ebből ${stornozottDb} stornózott` : ''})`}
        icon={<CreditCard className="size-4" />}
        accent="emerald"
      >
        {payments.length === 0 ? (
          /* ⚑ 2026-08-11 (a review 3. pontja): `Section`-ön belül `EmptyStrip`.
             A családi karton üres befizetés-listája PONTOSAN ez a keskeny sáv
             (`family-details-dialog-refined.tsx:659`) — ugyanaz a fülnév,
             ugyanaz a helyzet, mostantól ugyanaz az alak is. */
          <EmptyStrip hint="A személyhez kapcsolódó befizetések a Pénzügy modulból jelennek meg itt.">
            Nincs rögzített befizetés.
          </EmptyStrip>
        ) : (
          <>
            <FieldGroup>
              <Field label="Legutóbbi rendezett év" value={lastSettledYear} />
            </FieldGroup>

            <div className={`mt-4 ${TBL.wrapper}`}>
              <div className={TBL.desktop}>
                <table className={TBL.table}>
                  <thead className={TBL.thead}>
                    <tr>
                      <th className={`${TBL.th} w-28 whitespace-nowrap`}>Dátum</th>
                      <th className={TBL.th}>Befizetés típusa</th>
                      {/* 2026-08-04 (PR-43): MELYIK ÉVRE szól a befizetés. */}
                      <th className={`${TBL.th} whitespace-nowrap`} title="Melyik évre szól a befizetés">Évre</th>
                      <th className={`hidden ${TBL.th} sm:table-cell`}>Bizonylat</th>
                      <th className={`${TBL.th} text-right`}>Összeg</th>
                    </tr>
                  </thead>
                  <tbody className={TBL.tbody}>
                    {payments.map((payment) => (
                      <tr key={payment.id} className={TBL.tr}>
                        <td className={TBL.tdStrong}>{formatShortDate(payment.datum)}</td>
                        <td className="max-w-[10rem] truncate px-3 py-2 font-medium text-foreground" title={payment.befizetescel?.nev || 'Általános befizetés'}>
                          {payment.befizetescel?.nev || 'Általános befizetés'}
                          {/* 2026-07-24 (PR-4 F5.4): stornó-jelölés */}
                          {payment.stornozott && (
                            <span className={STORNO_CHIP} title="Stornózott tétel — nem számít bele az összegbe">
                              STORNÓ
                            </span>
                          )}
                        </td>
                        <td className={TBL.td}>{payment.fizetettev ? `${payment.fizetettev}. év` : <Dash />}</td>
                        <td className={`hidden px-3 py-2 font-mono text-xs sm:table-cell ${TXT.muted}`}>
                          {getTransactionDocumentNumber(payment) || <Dash />}
                        </td>
                        {/* Az összeg TÉNY, nem állapot: `text-foreground`. Az emerald a
                            szekció-chipben és a címben él. */}
                        <td className={payment.stornozott ? `${TBL.tdAmount} ${TXT.faint} line-through` : TBL.tdAmount}>
                          {formatRon(Number(payment.osszeg))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobil kártyalista — `sm` alatt. Nincs vízszintes görgetés. */}
              <div className={TBL.mobileList}>
                {payments.map((payment) => (
                  <article key={payment.id} className={TBL.mobileItem}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-xs font-medium text-foreground">{formatShortDate(payment.datum)}</span>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${payment.stornozott ? `${TXT.faint} line-through` : 'text-foreground'}`}>
                        {formatRon(Number(payment.osszeg))}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {payment.befizetescel?.nev || 'Általános befizetés'}
                      {payment.stornozott && (
                        <span className={STORNO_CHIP} title="Stornózott tétel — nem számít bele az összegbe">
                          STORNÓ
                        </span>
                      )}
                    </p>
                    <p className={`text-[11px] ${TXT.muted}`}>
                      {payment.fizetettev ? `${payment.fizetettev}. évre` : 'Nincs évhez kötve'}
                      {getTransactionDocumentNumber(payment) ? ` · ${getTransactionDocumentNumber(payment)}` : ''}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}
      </Section>

      {noteSection}
    </>
  )

  // ── T4 — ADATVÉDELEM ──────────────────────────────────────────────────
  const privacyTab = (
    <>
      <Section title="Adatvédelmi hozzájárulások" icon={<ShieldCheck className="size-4" />} accent="slate">
        <ConsentEditor
          memberId={member.id}
          gdprConsentAt={consentSnapshot.gdprConsentAt}
          photoConsent={consentSnapshot.photoConsent}
          mailingConsent={consentSnapshot.mailingConsent}
          onSaved={(snapshot) => {
            setConsentSnapshot(snapshot)
            onDataChanged?.()
          }}
        />
      </Section>
      <p className={`rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-5 ${TXT.muted}`}>
        A módosítások a személy kartonjához kerülnek. Kizárólag a gyülekezeti jogosultsággal rendelkező felhasználók
        férhetnek hozzájuk.
      </p>
    </>
  )

  // ── T5 — HÁTRALÉK ─────────────────────────────────────────────────────
  const arrearsRows = details?.arrearsBreakdown || []
  const arrearsTab = (
    <Section
      title={`Hátralék (${arrearsRows.length} év · ${formatRon(arrearsTotal)})`}
      icon={<AlertTriangle className="size-4" />}
      accent="rose"
    >
      {arrearsRows.length === 0 ? (
        /* ⚑ 2026-08-11 (a review 3. pontja): `Section`-ön belül `EmptyStrip`. */
        <EmptyStrip hint="Jelenleg nem található olyan év, ahol a járulék és a befizetés különbsége tartozást mutatna.">
          Nincs listázható hátralék.
        </EmptyStrip>
      ) : (
        <>
          <div className={TBL.wrapper}>
            <div className={TBL.desktop}>
              <table className={TBL.table}>
                <thead className={TBL.thead}>
                  <tr>
                    <th className={`${TBL.th} w-20`}>Év</th>
                    <th className={TBL.th}>Elvárt</th>
                    <th className={TBL.th}>Befizetve</th>
                    <th className={`${TBL.th} text-right`}>Tartozás</th>
                  </tr>
                </thead>
                <tbody className={TBL.tbody}>
                  {arrearsRows.map((item) => (
                    <tr key={item.year} className={TBL.tr}>
                      <td className="px-3 py-2 font-semibold text-foreground">{item.year}</td>
                      <td className={`${TBL.td} tabular-nums`}>{formatRon(item.yearlyFee)}</td>
                      <td className={`${TBL.td} tabular-nums`}>{formatRon(item.paid)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                        {formatRon(item.debt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobil: BAL OLDALI jelzősáv, nem teljes rózsaszín keret — az
                riasztás lenne információ nélkül. */}
            <div className={TBL.mobileList}>
              {arrearsRows.map((item) => (
                <article key={item.year} className={`${TBL.mobileItem} border-l-2 border-l-rose-300 dark:border-l-rose-900`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">{item.year}</span>
                    <span className="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                      {formatRon(item.debt)}
                    </span>
                  </div>
                  <p className={`text-[11px] ${TXT.muted}`}>
                    Elvárt: {formatRon(item.yearlyFee)} · Befizetve: {formatRon(item.paid)}
                  </p>
                </article>
              ))}
            </div>
          </div>
          <p className={`mt-2 text-xs leading-5 ${TXT.muted}`}>
            A hátralék a gyülekezeti járulék elvárt összege és a befizetések különbsége, évekre bontva. A stornózott
            tételek nem számítanak befizetésnek.
          </p>
        </>
      )}
    </Section>
  )

  const cardBody = (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      {/* A bezárás LEBEGŐ gomb — mindkét variánsban ugyanott, ugyanakkora, mint
          a családi kartonon. ⛔ Az aria-label betűre kötött: a
          registry-cards-host string-egyezéssel keresi a fókusz-visszaállításhoz. */}
      <FloatingCloseButton onClick={() => onOpenChange(false)} ariaLabel="Személyi karton bezárása" />

      {/* AZ EGY GÖRGETŐ — a fejléc elgörög, a fülsáv és a lábléc ragad. */}
      <CardScroller>
        {header}

        {/* Az `activeKey` a görgetés-jelzést vezérli: fülváltáskor az aktív fül
            a képbe görög (telefonon a sáv nem fér ki). Lásd a TabBar kommentjét. */}
        <TabBar ariaLabel="Személyi karton nézetei" activeKey={tab}>
          {tabs.map((item) => (
            <TabButton
              key={item.value}
              id={`member-tab-${item.value}`}
              controls={`member-panel-${item.value}`}
              active={tab === item.value}
              tone={item.tone}
              disabled={loading}
              onClick={() => setTab(item.value)}
              onKeyDown={(event) => handleTabKeyDown(event, item.value)}
              icon={item.icon}
              label={item.label}
              count={item.count}
            />
          ))}
        </TabBar>

        <TabPanel id={`member-panel-${tab}`} labelledBy={`member-tab-${tab}`} busy={loading}>
          {loading ? (
            <SkeletonGrid label="Személyi karton betöltése" />
          ) : loadError ? (
            <ErrorBlock
              icon={<AlertTriangle className="size-10" />}
              title="A karton részletei nem tölthetők be"
              description="Az alapadatok láthatók, de az anyakönyvi és pénzügyi adatok lekérése most nem sikerült."
              onRetry={() => setReloadToken((current) => current + 1)}
            />
          ) : (
            <>
              {tab === 'personal' && personalTab}
              {tab === 'registry' && registryTab}
              {tab === 'payments' && paymentsTab}
              {tab === 'privacy' && privacyTab}
              {tab === 'arrears' && hasArrears && arrearsTab}
            </>
          )}
        </TabPanel>

        <CardFooter
          summary={
            <>
              {payments.length} befizetés · {registryRows.length} anyakönyvi bejegyzés
              {hasArrears && (
                <>
                  {' · '}
                  <span className="font-semibold text-rose-700 dark:text-rose-300">Hátralék {formatRon(arrearsTotal)}</span>
                </>
              )}
            </>
          }
        >
          {effectiveFamilyId && onOpenFamily ? (
            <button type="button" className={BTN.outline} onClick={() => onOpenFamily(effectiveFamilyId)}>
              <Users className="size-3.5" aria-hidden />
              Családi karton
            </button>
          ) : !effectiveFamilyId ? (
            <button type="button" className={BTN.outline} onClick={() => setAssignOpen(true)}>
              <UserPlus className="size-3.5" aria-hidden />
              Családhoz rendelés
            </button>
          ) : null}
          {/* ⛔ A „Szerkesztés" SOHA nem törölhető, csak áthelyezhető: ez az
              EGYETLEN út a gyülekezetek közti egyeztetéshez
              (member-form-dialog → CrossCongregationMatchDialog). */}
          {onEdit && (
            <button type="button" className={BTN.outline} onClick={onEdit}>
              <Pencil className="size-3.5" aria-hidden />
              Szerkesztés
            </button>
          )}
          <button
            type="button"
            className={BTN.outline}
            title="Személyi karton nyomtatása"
            onClick={() => setCardPrintOpen(true)}
          >
            <Printer className="size-3.5" aria-hidden />
            Karton
          </button>
          <button
            type="button"
            className={BTN.outline}
            title="Hivatalos igazolás/levél kiállítása iktatással"
            aria-label="Igazolás kiállítása"
            disabled={certChunkLoading}
            onClick={() => void openCertDialog()}
          >
            <Printer className="size-3.5" aria-hidden />
            <span className="hidden min-[420px]:inline">Igazolás kiállítása</span>
            <span className="min-[420px]:hidden">Igazolás</span>
          </button>
          <button type="button" className={BTN.filled} onClick={() => onOpenChange(false)}>
            Bezárás
          </button>
        </CardFooter>
      </CardScroller>
    </div>
  )

  // ⛔ A három al-dialógus MINDKÉT ágban renderelődik. Korai `return` panel
  //    módban = néma halál a nyomtatásnak, az igazolásnak és a családhoz
  //    rendelésnek MINDEN host-felhasználónál — és a host az EGYETLEN út a
  //    persons-tab / family-graph-tab felől.
  const subDialogs = (
    <>
      {/* 2026-07-24 (W2): F6-os kiállító-motor — a tag előre kiválasztva,
          sikeres iktatás után nincs frissítendő lista ezen a nézeten. */}
      {CertDialog && (
        <CertDialog
          open={certOpen}
          onOpenChange={setCertOpen}
          year={new Date().getFullYear()}
          onIssued={() => {}}
          initialPersonIds={[member.id]}
        />
      )}
      <PersonCardPrintDialog open={cardPrintOpen} onOpenChange={setCardPrintOpen} member={member} details={details} />
      <FamilyAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        member={member}
        currentFamilyId={effectiveFamilyId}
        onAssigned={handleAssigned}
      />
      {/* 2026-08-11: a térkép-egyeztetés a CÍMTÖRZSRE ment (település/utca),
          nem a személyre — ezért egy egyeztetés az ott lakó MINDEN tagot javítja.
          Siker után csendben újratöltjük a részleteket, hogy a sáv azonnal
          „egyeztetett"-re váltson. */}
      <AddressVerifyDialog
        open={geoVerifyOpen}
        onOpenChange={setGeoVerifyOpen}
        address={details?.cim ?? null}
        memberName={baseName}
        onSaved={() => setReloadToken((token) => token + 1)}
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="h-dvh gap-0 overflow-hidden border-primary/15 bg-card p-0 shadow-[-32px_0_90px_-48px_rgba(8,58,54,0.55)] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-[side=right]:w-full data-[side=right]:max-w-none data-[side=right]:data-ending-style:translate-x-full data-[side=right]:data-starting-style:translate-x-full data-[side=right]:sm:w-[min(92vw,56rem)] data-[side=right]:sm:max-w-[56rem] data-[side=right]:xl:w-[min(48vw,56rem)] data-[side=right]:xl:max-w-[56rem] motion-reduce:transition-none"
      >
        {cardBody}
      </SheetContent>
      {subDialogs}
    </Sheet>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// ANYAKÖNYV-SZEKCIÓ (2026-07-24, PR-11 · 2026-08-11 újrastílozva)
// ═════════════════════════════════════════════════════════════════════════
// A CSALÁDI karton `RegistryTable` dialektusa, `sm`-nél duál renderrel.
// ⛔ Az idővonalas (timeline) alternatíva SZÁNDÉKOSAN elvetve: a két azonos
//    nevű „Anyakönyv" fül ma a legerősebb meglévő paritás-horgony a két karton
//    között — bal oldalon gerinc, jobb oldalon táblázat pontosan az a nyelvi
//    eltérés lenne, ami miatt a tulajdonosi korrekció érkezett.
// A mentés (updateRegistryEventDetails) ugyanazokba a táblákba ír, amiket az
// Anyakönyv modul olvas — a módosítás ott is megjelenik.

function MemberRegistrySection({
  rows,
  onChanged,
}: {
  rows: MemberRegistryRow[]
  onChanged: () => void
}) {
  const [editingKind, setEditingKind] = useState<NoteEventKind | null>(null)
  const editingRow = rows.find((row) => row.kind === editingKind) ?? null

  return (
    <div className="space-y-4">
      <div className={TBL.wrapper}>
        {/* Asztali táblázat */}
        <div className={TBL.desktop}>
          <table className={TBL.table}>
            <thead className={TBL.thead}>
              <tr>
                <th className={`${TBL.th} w-36`}>Esemény</th>
                <th className={`${TBL.th} w-28`}>Dátum</th>
                {/* 2026-07-24 (PR-11 review): semleges fejléc — a Beköltözött/Áttért
                    sorokban ez a HONNAN települése, nem a helyszín. */}
                <th className={TBL.th}>Település</th>
                <th className={TBL.th}>Lelkész</th>
                <th className={TBL.th}>Megjegyzés</th>
                <th className={`${TBL.th} w-14 text-right`}><span className="sr-only">Szerkesztés</span></th>
              </tr>
            </thead>
            <tbody className={TBL.tbody}>
              {rows.map((row) => (
                <tr key={row.kind} className={TBL.tr}>
                  <td className="px-3 py-2">
                    <RegistryChip kind={row.kind} icon={row.icon} />
                  </td>
                  <td className={TBL.tdStrong}>{row.date ? formatShortDate(row.date) : <Dash />}</td>
                  <td className={TBL.td}>{row.location || <Dash />}</td>
                  <td className={TBL.td}>{row.pastor || <Dash />}</td>
                  <td className={`max-w-[16rem] truncate ${TBL.td}`} title={row.note || undefined}>
                    {row.hoka ? `Halál oka: ${row.hoka}${row.note ? ' · ' : ''}` : ''}
                    {row.note || (!row.hoka ? <Dash /> : '')}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className={`inline-flex size-11 items-center justify-center rounded-xl ${TXT.muted} transition-colors hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none`}
                      onClick={() => setEditingKind(editingKind === row.kind ? null : row.kind)}
                      aria-label={`${row.label} szerkesztése`}
                      aria-expanded={editingKind === row.kind}
                      aria-controls="member-registry-editor"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobil: kompakt kártya-lista. A ceruza itt 44px-es LÁTHATATLAN
            találati terület egy látható 24px-es korong körül (a családi karton
            fénykép-gombjának idiómája). */}
        <div className={TBL.mobileList}>
          {rows.map((row) => (
            <div key={row.kind} className={TBL.mobileItem}>
              <div className="flex items-center justify-between gap-2">
                <RegistryChip kind={row.kind} icon={row.icon} />
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-foreground">{row.date ? formatShortDate(row.date) : '—'}</span>
                  <button
                    type="button"
                    className={`inline-flex size-11 items-center justify-center rounded-full ${TXT.muted} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                    onClick={() => setEditingKind(editingKind === row.kind ? null : row.kind)}
                    aria-label={`${row.label} szerkesztése`}
                    aria-expanded={editingKind === row.kind}
                    aria-controls="member-registry-editor"
                  >
                    <span className="inline-flex size-6 items-center justify-center rounded-full border border-border bg-card shadow-sm">
                      <Pencil className="size-3" aria-hidden />
                    </span>
                  </button>
                </div>
              </div>
              {(row.location || row.pastor) && (
                <p className={`text-[11px] ${TXT.muted}`}>
                  {row.location && `${row.locationLabel}: ${row.location}`}
                  {row.location && row.pastor && ' · '}
                  {row.pastor && `Lelkész: ${row.pastor}`}
                </p>
              )}
              {(row.note || row.hoka) && (
                <p className={`text-[11px] ${TXT.muted}`}>
                  {row.hoka && `Halál oka: ${row.hoka}`}
                  {row.hoka && row.note && ' · '}
                  {row.note}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {editingRow && (
        <RegistryEventEditor
          key={editingRow.kind}
          row={editingRow}
          onCancel={() => setEditingKind(null)}
          onSaved={() => {
            setEditingKind(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function RegistryEventEditor({
  row,
  onCancel,
  onSaved,
}: {
  row: MemberRegistryRow
  onCancel: () => void
  onSaved: () => void
}) {
  const [datum, setDatum] = useState(row.date ? row.date.slice(0, 10) : '')
  const [helyNev, setHelyNev] = useState(row.location || '')
  const [lelkesz, setLelkesz] = useState(row.pastor || '')
  const [hoka, setHoka] = useState(row.hoka || '')
  const [note, setNote] = useState(row.note || '')
  const [saving, setSaving] = useState(false)
  // 2026-07-24 (PR-11 review): megnyitáskor a képernyőre görgetünk és a
  // dátum-mezőre fókuszálunk — mobilon a lista alatt nyílik az űrlap, e nélkül
  // a ceruza-koppintás „nem csinál semmit" érzetet kelt.
  const containerRef = useRef<HTMLDivElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    containerRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
    dateInputRef.current?.focus({ preventScroll: true })
  }, [])

  async function handleSave() {
    setSaving(true)
    const res = await updateRegistryEventDetails(row.kind, row.recordId, {
      datum: datum || null,
      // 2026-07-24 (PR-11 review): ha a helyszín-mezőhöz NEM nyúlt a felhasználó,
      // undefined megy — a szerver ilyenkor nem írja az oszlopot (nem tudja
      // átirányítani/kiüríteni a helység-FK-t egy változatlan mentés).
      helyNev: helyNev === (row.location || '') ? undefined : helyNev || null,
      lelkeszneve: row.hasPastor ? lelkesz || null : null,
      megjegyzes: note || null,
      hoka: row.hasHoka ? hoka || null : undefined,
    })
    setSaving(false)
    if (res && 'error' in res && res.error) {
      toast.error(res.error)
      return
    }
    toast.success(`${row.label} adatai mentve — az Anyakönyv modulban is frissült.`)
    onSaved()
  }

  return (
    <div ref={containerRef}>
      <InlineEditor id="member-registry-editor">
        <div className="mb-3 flex items-center justify-between gap-2">
          <RegistryChip kind={row.kind} icon={row.icon}>
            {row.label} szerkesztése
          </RegistryChip>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            Dátum
            <input ref={dateInputRef} type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className={FIELD_INPUT} />
          </label>
          <label className={FIELD_LABEL}>
            {row.locationLabel} (település)
            <input type="text" value={helyNev} onChange={(e) => setHelyNev(e.target.value)} placeholder="Pl. Barátos" className={FIELD_INPUT} />
          </label>
          {row.hasPastor && (
            <label className={FIELD_LABEL}>
              Lelkész neve
              <input type="text" value={lelkesz} onChange={(e) => setLelkesz(e.target.value)} className={FIELD_INPUT} />
            </label>
          )}
          {row.hasHoka && (
            <label className={FIELD_LABEL}>
              Halál oka
              <input type="text" value={hoka} onChange={(e) => setHoka(e.target.value)} className={FIELD_INPUT} />
            </label>
          )}
          <label className={`${FIELD_LABEL} sm:col-span-2`}>
            Megjegyzés
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={FIELD_TEXTAREA} />
          </label>
        </div>
        <p className={`mt-3 text-xs leading-5 ${TXT.muted}`}>
          {row.kind === 'hazassag'
            ? 'Az esketés a közös házassági anyakönyvi bejegyzést módosítja — mindkét házastárs kartonján és az Anyakönyv oldalon is ez jelenik meg.'
            : 'A mentés az anyakönyvi nyilvántartásba ír — a módosítás az Anyakönyv oldalon is megjelenik.'}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button type="button" className={BTN.outline} onClick={onCancel} disabled={saving}>
            Mégse
          </button>
          <button type="button" className={BTN.filled} onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Mentés…' : 'Mentés'}
          </button>
        </div>
      </InlineEditor>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// GDPR-HOZZÁJÁRULÁSOK (2026-06-10, Fázis 5 · 2026-08-11 újrastílozva)
// ═════════════════════════════════════════════════════════════════════════
// A korábbi három státusz-csempe TÖRÖLVE: pontosan azt mondták, amit az
// alattuk lévő checkboxok. Most maga a sor hordozza a MENTETT állapotot is
// (jobb szélen pirula) és a PISZKOZATOT (a checkbox) — duplikáció nélkül.
// Az `updateMemberConsents` szemantikája VÁLTOZATLAN: a `gdpr_consent_at`-ot a
// szerver állítja az első hozzájáruláskor, és `null`-ra visszavonáskor.

function ConsentEditor({
  memberId,
  gdprConsentAt,
  photoConsent,
  mailingConsent,
  onSaved,
}: {
  memberId: number
  gdprConsentAt: string | null
  photoConsent: boolean
  mailingConsent: boolean
  onSaved: (snapshot: ConsentSnapshot) => void
}) {
  const [gdpr, setGdpr] = useState(!!gdprConsentAt)
  const [photo, setPhoto] = useState(!!photoConsent)
  const [mailing, setMailing] = useState(!!mailingConsent)
  // 2026-08-26 (5. kör): név-publikálás a gyülekezet weboldalán — friss, külön
  // lekérdezéssel (nem a központi listából), migráció-toleránsan.
  const [nevPub, setNevPub] = useState(false)
  const [nevPubBaseline, setNevPubBaseline] = useState(false)
  const [nevPubBetoltve, setNevPubBetoltve] = useState(false)
  const [consentDate, setConsentDate] = useState<string | null>(gdprConsentAt)
  const [baseline, setBaseline] = useState({
    gdpr: Boolean(gdprConsentAt),
    photo: Boolean(photoConsent),
    mailing: Boolean(mailingConsent),
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getMemberNevPublikalasConsent(memberId).then(v => {
      if (cancelled || v === null) return
      setNevPub(v)
      setNevPubBaseline(v)
      setNevPubBetoltve(true)
    })
    return () => { cancelled = true }
  }, [memberId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const nextBaseline = {
        gdpr: Boolean(gdprConsentAt),
        photo: Boolean(photoConsent),
        mailing: Boolean(mailingConsent),
      }
      setGdpr(nextBaseline.gdpr)
      setPhoto(nextBaseline.photo)
      setMailing(nextBaseline.mailing)
      setConsentDate(gdprConsentAt)
      setBaseline(nextBaseline)
    })
    return () => { cancelled = true }
  }, [gdprConsentAt, photoConsent, mailingConsent])

  const dirty = gdpr !== baseline.gdpr || photo !== baseline.photo || mailing !== baseline.mailing
    || (nevPubBetoltve && nevPub !== nevPubBaseline)

  async function handleSave() {
    setSaving(true)
    const res = await updateMemberConsents(memberId, {
      gdpr_consent: gdpr,
      photo_consent: photo,
      mailing_consent: mailing,
      ...(nevPubBetoltve ? { nev_publikalas_consent: nevPub } : {}),
    })
    setSaving(false)
    if (res?.error) { toast.error(res.error); return }
    const nextConsentDate = gdpr ? consentDate || new Date().toISOString() : null
    const nextBaseline = { gdpr, photo, mailing }
    setConsentDate(nextConsentDate)
    setBaseline(nextBaseline)
    onSaved({
      gdprConsentAt: nextConsentDate,
      photoConsent: photo,
      mailingConsent: mailing,
    })
    toast.success('Hozzájárulások mentve.')
  }

  const toggles: Array<{
    checked: boolean
    saved: boolean
    set: (value: boolean) => void
    label: string
    hint: string
    savedLabel: string
    missingLabel: string
  }> = [
    { checked: gdpr, saved: baseline.gdpr, set: setGdpr, label: 'Adatkezelés', hint: 'Általános adatkezelési hozzájárulás', savedLabel: 'Hozzájárult', missingLabel: 'Nincs hozzájárulás' },
    { checked: photo, saved: baseline.photo, set: setPhoto, label: 'Fotó / megjelenés', hint: 'Kép, felvétel közzététele', savedLabel: 'Engedélyezve', missingLabel: 'Nincs engedélyezve' },
    { checked: mailing, saved: baseline.mailing, set: setMailing, label: 'Levelezés', hint: 'Hírlevél, körlevél küldése', savedLabel: 'Engedélyezve', missingLabel: 'Nincs engedélyezve' },
    // 2026-08-26 (5. kör): a tisztségviselő neve CSAK ezzel a hozzájárulással
    // kerülhet a gyülekezet nyilvános weboldalára (GDPR 9. cikk).
    ...(nevPubBetoltve
      ? [{ checked: nevPub, saved: nevPubBaseline, set: setNevPub, label: 'Név a weboldalon', hint: 'Név és tisztség közzététele a gyülekezet nyilvános weboldalán', savedLabel: 'Engedélyezve', missingLabel: 'Nincs engedélyezve' }]
      : []),
  ]

  return (
    <div>
      <div className="divide-y divide-border/70">
        {toggles.map((item) => (
          <label
            key={item.label}
            className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-primary/5 motion-reduce:transition-none"
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(event) => item.set(event.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{item.label}</span>
              <span className={`block text-xs ${TXT.muted}`}>{item.hint}</span>
              {item.checked !== item.saved && (
                <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">mentetlen módosítás</span>
              )}
            </span>
            {/* A pirula a MENTETT állapotot mutatja, a checkbox a piszkozatot —
                így a szín ott van, ahol az állapot van. */}
            <Pill tone={item.saved ? 'emerald' : 'slate'}>{item.saved ? item.savedLabel : item.missingLabel}</Pill>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs ${TXT.muted}`}>
          {consentDate ? `Adatkezelési hozzájárulás kelte: ${new Date(consentDate).toLocaleDateString('hu-HU')}` : 'Nincs rögzített adatkezelési hozzájárulás.'}
        </span>
        <button type="button" className={BTN.filled} disabled={saving || !dirty} onClick={() => void handleSave()}>
          {saving ? 'Mentés…' : 'Hozzájárulások mentése'}
        </button>
      </div>
    </div>
  )
}
