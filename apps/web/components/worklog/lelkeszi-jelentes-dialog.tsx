'use client'

/**
 * Éves hivatalos lelkészi jelentés — szerkesztő-dialógus + véglegesítő wizard (F5/J4).
 *
 * Szerkezet:
 *  - Nyitáskor getLelkesziJelentes(ev): auto-mezők élő adatból + mentett kézi
 *    értékek/felülírások/határozat. Véglegesített jelentésnél a befagyasztott
 *    snapshot jön — minden mező csak olvasható.
 *  - lg-től két oszlop: balra fejezetenként összecsukható szerkesztő (I–X),
 *    jobbra élő A4-előnézet (iframe srcDoc, fit-to-width scale — a
 *    worklog-print-dialog mintája); lg alatt fül-váltó (Szerkesztés / Előnézet).
 *  - Auto-mezők: readonly kijelzés + „Felülírás" (ceruza → input, a felülírt
 *    érték jelölve + visszaállítható). Kézi mezők: input / textarea.
 *  - Mentés: explicit gomb (kezi + felulirasok + hatarozat — teljes csere).
 *  - Véglegesítő wizard a dialóguson belül (a számadás-wizard lépés-mintája):
 *    áttekintés → ellenőrzések (nem blokkoló) → határozat-adatok → megerősítés
 *    → véglegesítés → opcionális beküldés az egyházmegyének → kész.
 *  - PDF-mentés + nyomtatás: print-engine-v2, A4 álló, pdfMargin [0,0]
 *    (WYSIWYG — a lap-margót a dokumentum saját paddingje adja).
 *
 * MOBILE-FIRST + token-stílus (border-border / bg-card / text-foreground …),
 * sötét témában is helyes; az oldal sosem görget vízszintesen.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  Loader2,
  Pencil,
  PenLine,
  Printer,
  RotateCcw,
  ScrollText,
  Send,
  ShieldAlert,
  Sparkles,
  Table2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  FEJEZET_CIMEK,
  JELENTES_MEZOK,
  MUNKANAPLO_JAVASLAT_MEZOK,
  deriveAutoMezok,
  mezoErtek,
  parseHuSzam,
  type HatarozatAdatok,
  type JelentesFejezet,
  type JelentesJavaslatok,
  type JelentesMezo,
  type LelkesziJelentesData,
  type ProgramJavaslat,
} from '@/lib/lelkeszi-jelentes/types'
import { buildLelkesziJelentesHtml } from '@/lib/lelkeszi-jelentes/print'
// 2026-08-25 (gyülekezeti egységek): a „Gyülekezetenkénti bontás" panel —
// cellakulcsok (egyseg:<id>:<mezoId>), a kiszámolt bontás típusa és a fekvő
// nyomtatott melléklet építője.
import {
  ANYA_OSZLOP_ID,
  ANYAKOZPONT_CIMKE,
  BONTAS_MEZO_IDS,
  BONTAS_NEM_OSSZEGZO_MEZOK,
  EGYSEG_TIPUS_CIMKEK,
  egysegMezoKulcs,
  parseEgysegMezoKulcs,
} from '@/lib/gyulekezet/egysegek-shared'
import type { JelentesBontas } from '@/lib/lelkeszi-jelentes/worklog-auto'
import { buildBontasMellekletHtml } from '@/lib/lelkeszi-jelentes/bontas-print'

/**
 * 2026-08-25 (társegyházközség): a bontás + a „központ" oszlop felirata
 * (társnál „Közös (egész egyházközség)"). A kozpontCimke a régi — a társ-forma
 * előtt véglegesített — snapshotból hiányozhat: ilyenkor ANYAKOZPONT_CIMKE.
 */
type BontasAdat = JelentesBontas & { kozpontCimke?: string }
// 2026-08-15 (Endre 4. szakasz): EGYSÉGES véglegesítés-gomb a fejléc-sáv jobb
// szélén — ugyanaz a komponens, mint a többi öt irat-típusnál. A meglévő
// wizard-flow változatlan (skipConfirm: a wizard maga vezet végig és erősít meg).
import { FinalizeButton } from '@kartoteka/ui-app'
import {
  finalizeLelkesziJelentes,
  getLelkesziJelentes,
  requestJelentesUnlock,
  saveLelkesziJelentes,
  submitLelkesziJelentes,
} from '@/app/(dashboard)/munkanaplo/lelkeszi-jelentes-actions'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
// 2026-08-11 (6. kör): különleges gyülekezeti alkalmak + munkanapló-javaslatok.
// A jelentés-modul szerkezete VÁLTOZATLAN — a nyilvántartás csak JAVASLATOT ad
// a III.4 / II.10 mező mellé, a munkanapló a III.17 mellé, és mondatokat
// kínálunk a IX.1-hez. Egyetlen rubrika sem lesz auto: mindkét forrás UGYANAZT
// a javaslat-sort használja (renderJavaslatSor), nincs két párhuzamos megoldás.
import {
  KulonlegesAlkalomLista,
  useKulonlegesAlkalmak,
} from '@/components/worklog/kulonleges-alkalom-lista'
import {
  JAVASLAT_MEZOK,
  huRovidDatum,
  javaslatMezohoz,
  javaslatTetelekMezohoz,
  mondatAlkalomhoz,
  nemIstentiszteletiJellegu,
} from '@/lib/worklog/kulonleges-alkalom-shared'

// ─────────────────────────────────────────────────────────────────────────
// Statikus segédstruktúrák
// ─────────────────────────────────────────────────────────────────────────

const FEJEZETEK: JelentesFejezet[] = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

const MEZO_BY_ID = new Map<string, JelentesMezo>(JELENTES_MEZOK.map((m) => [m.id, m]))

const FEJEZET_MEZOK = (() => {
  const map = new Map<JelentesFejezet, JelentesMezo[]>()
  for (const f of FEJEZETEK) map.set(f, [])
  for (const mezo of JELENTES_MEZOK) map.get(mezo.fejezet)!.push(mezo)
  return map
})()

/** A címlap/határozat űrlap mezői (wizard 3. lépés). */
const HATAROZAT_MEZOK: Array<{
  key: keyof HatarozatAdatok
  label: string
  type?: 'date'
  placeholder?: string
}> = [
  { key: 'presbiteriSzam', label: 'Presbitériumi határozat száma', placeholder: 'pl. 12/2026' },
  { key: 'presbiteriDatum', label: 'Presbitériumi tárgyalás dátuma', type: 'date' },
  { key: 'kozgyulesiSzam', label: 'Közgyűlési határozat száma', placeholder: 'pl. 3/2026' },
  { key: 'kozgyulesiDatum', label: 'Közgyűlési tárgyalás dátuma', type: 'date' },
  { key: 'egyhazkozsegiIktatoszam', label: 'Egyházközségi iktatószám', placeholder: 'pl. 45/2026' },
  { key: 'egyhazmegyeiIktatoszam', label: 'Egyházmegyei iktatószám' },
  { key: 'lelkipasztor', label: 'Lelkipásztor neve' },
  { key: 'fogondnok', label: 'Főgondnok / gondnok neve' },
]

// A4 álló lap-szélesség képpontban (96 dpi, kis ráhagyással) — a fit-to-width
// előnézet skálázásához (a worklog-print-dialog mintája).
const A4_PORTRAIT_W = 812
const PREVIEW_MIN_H = 1100
const PREVIEW_DEBOUNCE_MS = 400
// A4 álló lap-magasság képpontban (297 mm @ 96 dpi ≈ 1123 px) + kis tolerancia —
// ha egy .sheet ennél magasabb, a tartalom túlcsordul az egy oldalon.
const SHEET_OVERFLOW_PX = 1130

type NezetMod = 'szerkeszto' | 'wizard'
type WizardLepes = 'attekintes' | 'ellenorzes' | 'hatarozat' | 'megerosites' | 'kesz'
// 2026-08-25: + 'bontas' — a „Gyülekezetenkénti bontás" mobil-füle (csak
// akkor jelenik meg, ha a szervernek van bontás-adata).
type MobilNezet = 'szerkesztes' | 'elonezet' | 'bontas'

/** A wizard-lépések felolvasható címei (fókusz-fejléc + aria-live bejelentés). */
const WIZARD_LEPES_CIM: Record<WizardLepes, string> = {
  attekintes: '1. lépés — Áttekintés',
  ellenorzes: '2. lépés — Ellenőrzések',
  hatarozat: '3. lépés — Határozat',
  megerosites: '4. lépés — Megerősítés',
  kesz: '5. lépés — Kész',
}

type Ertekek = Record<string, number | string | null>

/**
 * 2026-08-11 (6. kör) — egy javaslat-sor ADATA, forrástól függetlenül.
 * A leírót a `javaslatLeiro` állítja elő (különleges alkalmak VAGY munkanapló),
 * a megjelenítés pedig KÖZÖS (`renderJavaslatSor`) — így a két forrás nem tud
 * két különböző kinézetű, külön karbantartandó javaslat-sort szülni.
 */
interface JavaslatLeiro {
  javasolt: number
  /** A javaslat mondata, a kiemelt számmal együtt. */
  mondat: React.ReactNode
  /** A beszámított alkalmak — a lelkész ELLENŐRIZHESSE, mit ír alá. */
  tetelek: Array<{ kulcs: string; datum: string; cim: string; extra: string | null }>
  /** Figyelmeztetés a tételes lista alatt (nem blokkoló). */
  figyelmeztetes?: React.ReactNode
}

// ─────────────────────────────────────────────────────────────────────────
// Érték-formázás + mentés-normalizálás
// ─────────────────────────────────────────────────────────────────────────

function fmtSzam(n: number): string {
  return n.toLocaleString('hu-HU', { maximumFractionDigits: 2 })
}

/**
 * 2026-08-25 (határidőnapló-javaslatok): magyar dátumtartomány a javaslat-
 * kártyákra ÉS a IV.5/IV.6-ba komponált szövegbe. Azonos hónap: '2026. 09.
 * 01–05.'; azonos év: '2026. 09. 28. – 10. 02.'; különben teljes tartomány.
 * Nem ISO bemenetre a nyers szöveg megy vissza (sosem dobunk).
 */
function huDatumTartomany(datum: string, datumVege: string | null): string {
  const m1 = datum.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m1) return datum
  const [, e1, h1, n1] = m1
  const alap = `${e1}. ${h1}. ${n1}.`
  if (!datumVege || datumVege === datum) return alap
  const m2 = datumVege.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m2) return alap
  const [, e2, h2, n2] = m2
  if (e1 === e2 && h1 === h2) return `${e1}. ${h1}. ${n1}–${n2}.`
  if (e1 === e2) return `${e1}. ${h1}. ${n1}. – ${h2}. ${n2}.`
  return `${e1}. ${h1}. ${n1}. – ${e2}. ${h2}. ${n2}.`
}

/** A javaslat-kártyák típus-feliratai. */
const PROGRAM_JAVASLAT_CIMKEK: Record<ProgramJavaslat['tipus'], string> = {
  vbh: 'Vakációs Bibliahét',
  fit7: 'Ifjúsági hét (FIT7)',
  imahet: 'Egyetemes imahét',
}

type Fit7Szint = '' | 'gyulekezeti' | 'egyhazmegyei' | 'mindketto'

/** A FIT7 szervezés-szint felirata a IV.6-ba komponált szövegben. */
const FIT7_SZINT_SZOVEG: Record<Exclude<Fit7Szint, ''>, string> = {
  gyulekezeti: 'gyülekezeti szervezés',
  egyhazmegyei: 'egyházmegyei szervezés',
  mindketto: 'gyülekezeti és egyházmegyei szervezés',
}

/**
 * FIT7 szervezés-szint előtöltése a program megjegyzéséből: ha abban
 * 'Szervezés: …' szerepel (a sablon így írja), a szintválasztó előáll belőle.
 * Nem felismerhető szövegre '' (a lelkész választ) — sosem tippelünk.
 */
function szintElotoltes(megjegyzes: string | null): Fit7Szint {
  const m = (megjegyzes || '').match(/szervez[eé]s\s*:\s*([^\n.;]+)/i)
  if (!m) return ''
  const v = m[1].toLowerCase()
  const gyulekezeti = v.includes('gyülekezet') || v.includes('gyulekezet')
  const megyei = v.includes('megy')
  if (v.includes('mind') || (gyulekezeti && megyei)) return 'mindketto'
  if (megyei) return 'egyhazmegyei'
  if (gyulekezeti) return 'gyulekezeti'
  return ''
}

/** A javaslat-kártyák natív select-je (token-stílus, a repó Input-magasságával). */
const JAVASLAT_SELECT_CLASS =
  'mt-1 block h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Egy mező megjelenítendő szövege a UI-ban (üres string = nincs érték). */
function displayErtek(mezo: JelentesMezo, v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') return `${fmtSzam(v)}${mezo.egyseg ? ` ${mezo.egyseg}` : ''}`
  return mezo.tipus === 'szam' && mezo.egyseg ? `${v} ${mezo.egyseg}` : String(v)
}

/**
 * 2026-08-25: bontás-kulcsnál (`egyseg:<id>:<mezoId>`) a mezoId katalógus-
 * definíciója dönt a szám-parse-ról — a bontás minden mutatója szám-típusú,
 * így a cellák számként (nem szövegként) mentődnek.
 */
function mezoDefinicio(id: string): JelentesMezo | undefined {
  const direkt = MEZO_BY_ID.get(id)
  if (direkt) return direkt
  const p = parseEgysegMezoKulcs(id)
  return p ? MEZO_BY_ID.get(p.mezoId) : undefined
}

/**
 * Szerkesztés közben nyers stringeket tárolunk — mentéskor normalizálunk:
 * üres érték kimarad, a szám-mezők parse-olt számmá válnak (hu vessző is jó),
 * a nem értelmezhető szöveg szövegként marad (a szerver-akció úgyis szűri).
 */
function normalizeForSave(rec: Ertekek): Ertekek {
  const out: Ertekek = {}
  for (const [id, v] of Object.entries(rec)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'number') {
      out[id] = v
      continue
    }
    const s = String(v).trim()
    if (s === '') continue
    const mezo = mezoDefinicio(id)
    if (mezo?.tipus === 'szam') {
      // hu-számformátum ('12.345,67' és NBSP-s '12 345' is szám) — a nem
      // értelmezhető szöveg szövegként marad (a wizard külön figyelmeztet rá).
      const n = parseHuSzam(s)
      out[id] = n !== null ? n : s
    } else {
      out[id] = s
    }
  }
  return out
}


// ─────────────────────────────────────────────────────────────────────────
// A dialógus
// ─────────────────────────────────────────────────────────────────────────

export function LelkesziJelentesDialog({
  open,
  onOpenChange,
  year,
  congregationName,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  year: number
  congregationName?: string
}) {
  const [isPending, startTransition] = useTransition()

  // Betöltés
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [data, setData] = useState<LelkesziJelentesData | null>(null)
  const [unlockRequested, setUnlockRequested] = useState(false)
  // 2026-08-11 (6. kör): munkanapló-alapú javaslatok a KÉZI rubrikákhoz (III.17).
  // Véglegesített jelentésnél a szerver üresen hagyja — a snapshot a hiteles adat.
  const [javaslatok, setJavaslatok] = useState<JelentesJavaslatok>({})
  // 2026-08-25 (gyülekezeti egységek): a „Gyülekezetenkénti bontás" adata —
  // csak akkor van, ha a gyülekezetnek aktív egysége van (különben a panel
  // meg sem jelenik). Véglegesített jelentésnél a snapshotból jön.
  const [bontas, setBontas] = useState<BontasAdat | null>(null)
  const [bontasNyitva, setBontasNyitva] = useState(true)
  // 2026-08-25 (határidőnapló-javaslatok): a gyulekezeti_programok felismert
  // VBH/FIT7/Imahét programjai — csak szerkesztés módban jön a szerverről
  // (véglegesítettnél a snapshot a hiteles, javaslat ott nincs).
  const [programJavaslatok, setProgramJavaslatok] = useState<ProgramJavaslat[]>([])
  // A munkanapló Imahét-sorainak száma (az aggregátor III.5 értéke) — null,
  // ha a szerver nem tudta megállapítani (worklog-hiba): ilyenkor nem
  // állítunk 0-t (fail-closed).
  const [imahetNaploSorok, setImahetNaploSorok] = useState<number | null>(null)
  const [programPanelNyitva, setProgramPanelNyitva] = useState(true)

  // Szerkesztő-állapot (nyers értékek — mentéskor normalizálunk)
  const [kezi, setKezi] = useState<Ertekek>({})
  const [felulirasok, setFelulirasok] = useState<Ertekek>({})
  const [hatarozat, setHatarozat] = useState<Partial<HatarozatAdatok>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  // Megnyitott (de még üres) felülírás-inputok
  const [overrideOpen, setOverrideOpen] = useState<Set<string>>(new Set())
  const [openChapters, setOpenChapters] = useState<Set<JelentesFejezet>>(new Set(['I']))
  // 2026-08-11 (6. kör): a „Különleges alkalmak" panel nyitottsága a szerkesztőben.
  // `null` = a lelkész még nem döntött → az alapállapot dönt (lásd lentebb).
  const [kulonlegesNyitva, setKulonlegesNyitva] = useState<boolean | null>(null)

  // Nézetek
  const [mode, setMode] = useState<NezetMod>('szerkeszto')
  const [wizardStep, setWizardStep] = useState<WizardLepes>('attekintes')
  const [mobileView, setMobileView] = useState<MobilNezet>('szerkesztes')

  // Debounced előnézet-adat (a tényleges HTML a previewHtml memo-ban készül)
  const [previewData, setPreviewData] = useState<LelkesziJelentesData | null>(null)

  // Beküldés + nyomtatás. 2026-08-15 (Endre 4. szakasz): a feloldás-kérés
  // állapotát (dialógus + küldés) a közös FinalizeButton kezeli.
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)
  // 2026-08-25: a „Gyülekezetenkénti kimutatás" fekvő mellékletének mentése.
  const [printingBontas, setPrintingBontas] = useState(false)

  const readOnly = data?.statusz === 'veglegesitve'

  // 2026-08-11 (6. kör): a különleges alkalmak EGYSZER töltődnek be a dialógus
  // nyitásakor, és ugyanaz az adat táplálja a wizard 2. lépését ÉS a szerkesztő
  // javaslat-sorait — így a két helyen látott szám soha nem tud széthúzni.
  const kulonleges = useKulonlegesAlkalmak(year, open)
  // Ha van megerősítésre váró alkalom, a panel ALAPBÓL nyitva van (az a teendő);
  // különben csukva, hogy ne tolja le a fejezeteket. A lelkész döntése felülírja.
  const kulonlegesAlapNyitva = kulonleges.osszesites.fuggoben > 0
  const kulonlegesPanelNyitva = kulonlegesNyitva ?? kulonlegesAlapNyitva

  // ── Betöltés nyitáskor (queueMicrotask: nincs szinkron setState az effectben) ──
  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setLoadError(null)
      setData(null)
      setKezi({})
      setFelulirasok({})
      setHatarozat({})
      setJavaslatok({})
      setBontas(null)
      setBontasNyitva(true)
      setProgramJavaslatok([])
      setImahetNaploSorok(null)
      setProgramPanelNyitva(true)
      setDirty(false)
      setOverrideOpen(new Set())
      setOpenChapters(new Set(['I']))
      setKulonlegesNyitva(null)
      setMode('szerkeszto')
      setWizardStep('attekintes')
      setMobileView('szerkesztes')
      setSubmitted(false)
      // Az előnézetet is nullázzuk — újranyitáskor ne az előző (akár másik évi)
      // jelentés villanjon fel, és az első render azonnali legyen (debounce nélkül).
      setPreviewData(null)
      setSheetOverflow(false)
      void getLelkesziJelentes(year)
        .then((res) => {
          if (cancelled) return
          if (res.error || !res.data) {
            setLoadError(res.error || 'A jelentés betöltése nem sikerült.')
            setLoading(false)
            return
          }
          setData(res.data)
          setKezi({ ...res.data.kezi })
          setFelulirasok({ ...res.data.felulirasok })
          setHatarozat({ ...res.data.hatarozat })
          setJavaslatok(res.javaslatok || {})
          setBontas(res.bontas ?? null)
          setProgramJavaslatok(res.programJavaslatok || [])
          setImahetNaploSorok(typeof res.imahetNaploSorok === 'number' ? res.imahetNaploSorok : null)
          setUnlockRequested(res.unlockRequested === true)
          // Beküldve-állapot a szerverről (korábban fixen false maradt)
          setSubmitted(Boolean(res.data.submission))
          setLoading(false)
        })
        .catch(() => {
          // Hálózati/váratlan hiba — enélkül a dialógus örökre a betöltőn ragadna.
          if (cancelled) return
          setLoadError('Hálózati hiba — a jelentés betöltése nem sikerült. Ellenőrizze a kapcsolatot, majd próbálja újra.')
          setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [open, year])

  /**
   * Csendes újratöltés (véglegesítés/feloldás után) — a nézetet nem resetteli.
   * failMessage: kontextus-függő hibaüzenet (pl. véglegesítés után), különben
   * általános üzenet — sikertelen újratöltés soha nem marad néma.
   */
  async function reload(failMessage?: string) {
    try {
      const res = await getLelkesziJelentes(year)
      if (res.error || !res.data) {
        // A hibátlan-de-üres válasz korábban némán elveszett — most mindig jelzünk.
        toast.error(failMessage || res.error || 'A jelentés újratöltése nem sikerült.')
        return
      }
      setData(res.data)
      setKezi({ ...res.data.kezi })
      setFelulirasok({ ...res.data.felulirasok })
      setHatarozat({ ...res.data.hatarozat })
      setJavaslatok(res.javaslatok || {})
      setBontas(res.bontas ?? null)
      setProgramJavaslatok(res.programJavaslatok || [])
      setImahetNaploSorok(typeof res.imahetNaploSorok === 'number' ? res.imahetNaploSorok : null)
      setUnlockRequested(res.unlockRequested === true)
      setSubmitted(Boolean(res.data.submission))
      setDirty(false)
    } catch {
      toast.error(failMessage || 'Hálózati hiba — a jelentés újratöltése nem sikerült.')
    }
  }

  // ── Élő adat (a szerkesztő-állapottal) + debounced előnézet ──
  const currentData: LelkesziJelentesData | null = useMemo(() => {
    if (!data) return null
    // A származtatott mezők (I.8, I.9, VII.8) élőben újraszámolva a kézi
    // értékekből/felülírásokból — így az előnézet, a PDF/nyomtatás és a wizard
    // mindig konzisztens értékeket mutat.
    return { ...data, auto: deriveAutoMezok(data.auto, kezi, felulirasok), kezi, felulirasok, hatarozat }
  }, [data, kezi, felulirasok, hatarozat])

  useEffect(() => {
    if (!currentData) return
    // Első betöltéskor azonnal, gépelésre ~400 ms-os debounce-szal frissül.
    const first = previewData === null
    const t = window.setTimeout(() => setPreviewData(currentData), first ? 0 : PREVIEW_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentData])

  const previewHtml = useMemo(
    () => (previewData ? buildLelkesziJelentesHtml(previewData) : ''),
    [previewData],
  )

  // 2026-08-25: ha a bontás megszűnik (pl. újratöltés után már nincs), a mobil
  // „Bontás" fülről visszalépünk a szerkesztésre — ne maradjon üres nézet.
  useEffect(() => {
    if (!bontas && mobileView === 'bontas') setMobileView('szerkesztes')
  }, [bontas, mobileView])

  // ── Fit-to-width előnézet (a worklog-print-dialog mintája) ──
  const previewRef = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(0)
  useEffect(() => {
    if (!open) return
    const el = previewRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((obsEntries) => {
      const w = obsEntries[0]?.contentRect.width ?? 0
      if (w > 0) setBoxW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, loading, loadError, mode, mobileView])

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [contentH, setContentH] = useState(PREVIEW_MIN_H)
  // Túlcsordulás-jelzés: van-e A4-lapnál magasabb .sheet az előnézetben
  const [sheetOverflow, setSheetOverflow] = useState(false)
  const measurePreview = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const h = Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0)
    if (h > 0) setContentH(h)
    // Ha egy fejezet-lap (.sheet) magasabb az A4-nél, nyomtatásban az
    // oldalszámozás eltolódhat — diszkrét figyelmeztetést mutatunk fölötte.
    let overflow = false
    doc.querySelectorAll<HTMLElement>('.sheet').forEach((sheet) => {
      if (sheet.offsetHeight > SHEET_OVERFLOW_PX) overflow = true
    })
    setSheetOverflow(overflow)
  }

  // Mobil fülváltáskor újramérés: rejtett (display:none) állapotban az iframe
  // scrollHeight-je 0, ezért a láthatóvá válás után egy frame-mel mérünk újra.
  useEffect(() => {
    if (mobileView !== 'elonezet') return
    const raf = requestAnimationFrame(measurePreview)
    return () => cancelAnimationFrame(raf)
     
  }, [mobileView, previewHtml])

  const targetW = boxW > 0 ? Math.max(0, boxW - 20) : A4_PORTRAIT_W
  const scale = Math.min(1, targetW / A4_PORTRAIT_W)
  const scaledW = Math.round(A4_PORTRAIT_W * scale)
  const scaledH = Math.round(contentH * scale)

  // ── A11y: fókusz-vezetés a wizard és a szerkesztő között ──
  const wizardHeadingRef = useRef<HTMLHeadingElement>(null)
  const editorHeadingRef = useRef<HTMLHeadingElement>(null)
  const prevModeRef = useRef<NezetMod>('szerkeszto')
  useEffect(() => {
    if (mode === 'wizard') {
      // Wizardba lépéskor / lépés-váltáskor a lépés fejlécére fókuszálunk
      wizardHeadingRef.current?.focus()
    } else if (prevModeRef.current === 'wizard') {
      // Csak a wizardból visszalépve — nyitáskor nem rabolunk fókuszt
      editorHeadingRef.current?.focus()
    }
    prevModeRef.current = mode
  }, [mode, wizardStep])

  // ── Szerkesztő-műveletek ──

  function setKeziErtek(id: string, raw: string) {
    setDirty(true)
    setKezi((prev) => {
      const next = { ...prev }
      if (raw === '') delete next[id]
      else next[id] = raw
      return next
    })
  }

  function setFelulirasErtek(id: string, raw: string) {
    setDirty(true)
    setFelulirasok((prev) => {
      const next = { ...prev }
      if (raw === '') delete next[id]
      else next[id] = raw
      return next
    })
  }

  function startOverride(id: string) {
    setOverrideOpen((prev) => new Set(prev).add(id))
  }

  function resetOverride(id: string) {
    setDirty(true)
    setFelulirasok((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setOverrideOpen((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function toggleChapter(f: JelentesFejezet) {
    setOpenChapters((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })
  }

  /** Mentés — teljes csere (kezi + felulirasok + hatarozat). */
  async function handleSave(silent = false): Promise<boolean> {
    setSaving(true)
    const res = await saveLelkesziJelentes(year, {
      kezi: normalizeForSave(kezi),
      felulirasok: normalizeForSave(felulirasok),
      hatarozat,
    })
    setSaving(false)
    if (res.error) {
      toast.error(res.error)
      return false
    }
    setDirty(false)
    if (!silent) toast.success('A lelkészi jelentés mentve.')
    return true
  }

  /** Véglegesítés (wizard 4. lépés): előbb mentünk, a snapshot a mentett sorból készül. */
  function handleFinalize() {
    startTransition(async () => {
      const saved = await handleSave(true)
      if (!saved) return
      const res = await finalizeLelkesziJelentes(year)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`A(z) ${year}. évi lelkészi jelentés véglegesítve.`, { duration: 5000 })
      setWizardStep('kesz')
      // Optimista állapot: a szerveren már megtörtént a véglegesítés — ha az
      // újratöltés elakadna, a UI akkor is a csak-olvasható nézetet mutassa.
      setData((prev) => (prev ? { ...prev, statusz: 'veglegesitve' } : prev))
      await reload(
        'A jelentés véglegesítve lett, de az újratöltés nem sikerült — zárja be és nyissa újra az ablakot.',
      )
    })
  }

  async function handleSubmitToDiocese() {
    // Ismételt beküldés előtt kis megerősítés — a duplikált beküldés zavaró lehet.
    if (submitted && !confirm('A jelentés már be lett küldve az egyházmegyének. Biztosan beküldi újra?')) {
      return
    }
    setSubmitting(true)
    const res = await submitLelkesziJelentes(year)
    setSubmitting(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setSubmitted(true)
    toast.success('A jelentés beküldve az egyházmegyének.')
  }

  // 2026-08-15 (Endre 4. szakasz): az indoklás az EGYSÉGES FinalizeButton
  // indoklás-dialógusán érkezik (kötelező, ≥10 karakter — eddig üresen is
  // elment, és az esperes nem tudta elbírálni). A visszatérési értékből dönti
  // el a komponens, hogy a dialógus bezárható-e.
  async function handleUnlockRequest(reason: string) {
    const res = await requestJelentesUnlock(year, reason)
    if (res.error) {
      toast.error(res.error)
      return { error: res.error }
    }
    setUnlockRequested(true)
    toast.success('A feloldási kérelem elküldve az egyházmegyének.')
    return { success: true }
  }

  async function handlePdf() {
    if (!currentData) return
    setPrinting(true)
    try {
      await printToPdf(buildLelkesziJelentesHtml(currentData), `Lelkeszi_jelentes_${year}.pdf`, {
        orientation: 'portrait',
        // WYSIWYG: a lap-margót a dokumentum saját paddingje adja.
        margin: [0, 0],
        format: 'a4',
      })
      toast.success('A lelkészi jelentés PDF elkészült.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A PDF mentése nem sikerült.')
    } finally {
      setPrinting(false)
    }
  }

  /** 2026-08-25: „Gyülekezetenkénti kimutatás" — fekvő A4 melléklet PDF-be. */
  async function handleBontasPdf() {
    if (!currentData || !bontas) return
    setPrintingBontas(true)
    try {
      await printToPdf(
        buildBontasMellekletHtml(currentData, bontas, year),
        `Gyulekezetenkenti_kimutatas_${year}.pdf`,
        { orientation: 'landscape', margin: [0, 0], format: 'a4' },
      )
      toast.success('A gyülekezetenkénti kimutatás PDF elkészült.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A PDF mentése nem sikerült.')
    } finally {
      setPrintingBontas(false)
    }
  }

  async function handleDirectPrint() {
    if (!currentData) return
    setSendingToPrinter(true)
    try {
      await printToBrowser(buildLelkesziJelentesHtml(currentData))
      toast.success('A böngésző nyomtatási előnézete megnyílt.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A nyomtatás indítása nem sikerült.')
    } finally {
      setSendingToPrinter(false)
    }
  }

  /** Bezárás-őr: nem mentett módosításnál rákérdezünk. */
  function handleOpenChange(next: boolean) {
    if (!next && dirty && !readOnly) {
      if (!confirm('Nem mentett módosítások vannak — biztosan bezárja a jelentést?')) return
    }
    onOpenChange(next)
  }

  // ── Wizard-ellenőrzések (nem blokkolók) ──

  const hianyzoKeziMezok = useMemo(() => {
    if (!currentData) return []
    return JELENTES_MEZOK.filter((m) => !m.auto).filter((m) => {
      const v = mezoErtek(currentData, m.id)
      return v === null || v === undefined || String(v).trim() === ''
    })
  }, [currentData])

  const hianyzoAutoMezok = useMemo(() => {
    if (!currentData) return []
    return JELENTES_MEZOK.filter((m) => m.auto).filter((m) => mezoErtek(currentData, m.id) === null)
  }, [currentData])

  const zarszamadasHianyzik = useMemo(
    () => (currentData ? mezoErtek(currentData, 'VII.6') === null : false),
    [currentData],
  )

  /** Szám-mezők, ahol a beírt érték nem értelmezhető számként (nem blokkoló). */
  const nemSzamMezok = useMemo(() => {
    if (!currentData) return []
    return JELENTES_MEZOK.filter((m) => m.tipus === 'szam').filter((m) => {
      const v = mezoErtek(currentData, m.id)
      return typeof v === 'string' && v.trim() !== '' && parseHuSzam(v) === null
    })
  }, [currentData])

  /** Kulcsszám az áttekintéshez / megerősítéshez. */
  function statErtek(id: string): string {
    const mezo = MEZO_BY_ID.get(id)
    if (!mezo || !currentData) return '—'
    const s = displayErtek(mezo, mezoErtek(currentData, id))
    return s === '' ? '—' : s
  }

  function kitoltottseg(f: JelentesFejezet): { filled: number; total: number } {
    const mezok = FEJEZET_MEZOK.get(f) || []
    let filled = 0
    if (currentData) {
      for (const m of mezok) {
        const v = mezoErtek(currentData, m.id)
        if (v !== null && v !== undefined && String(v).trim() !== '') filled += 1
      }
    }
    return { filled, total: mezok.length }
  }

  // ── Mező-sorok (szerkesztő) ──

  function renderAutoMezo(mezo: JelentesMezo) {
    const autoV = data?.auto[mezo.id] ?? null
    const felulV = felulirasok[mezo.id]
    const vanFeluliras = felulV !== undefined && felulV !== null && felulV !== ''
    const overrideAktiv = vanFeluliras || overrideOpen.has(mezo.id)
    const autoText = displayErtek(mezo, autoV)

    return (
      <div key={mezo.id}>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs leading-4 text-muted-foreground">
            <span className="tabular-nums font-semibold text-foreground">{mezo.id}</span> — {mezo.label}
          </Label>
          {vanFeluliras && (
            <Badge className="shrink-0 bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
              felülírva
            </Badge>
          )}
        </div>
        {!overrideAktiv ? (
          <div className="mt-1 flex items-center gap-1.5">
            <div
              className={cn(
                'min-h-9 flex-1 rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2 text-sm tabular-nums',
                autoText === '' ? 'italic text-muted-foreground' : 'text-foreground',
              )}
            >
              {autoText === '' ? 'nincs adat' : autoText}
            </div>
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${mezo.id} felülírása`}
                title="Felülírás kézi értékkel"
                onClick={() => startOverride(mezo.id)}
              >
                <Pencil className="size-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-1">
            <div className="flex items-center gap-1.5">
              {mezo.tipus === 'szam' ? (
                <Input
                  value={felulV === undefined || felulV === null ? '' : String(felulV)}
                  onChange={(e) => setFelulirasErtek(mezo.id, e.target.value)}
                  inputMode="decimal"
                  placeholder={autoText === '' ? 'kézi érték' : autoText}
                  disabled={readOnly}
                  className="h-9 flex-1 border-amber-400/60 tabular-nums"
                />
              ) : (
                <Input
                  value={felulV === undefined || felulV === null ? '' : String(felulV)}
                  onChange={(e) => setFelulirasErtek(mezo.id, e.target.value)}
                  placeholder="kézi érték"
                  disabled={readOnly}
                  className="h-9 flex-1 border-amber-400/60"
                />
              )}
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${mezo.id} felülírás visszaállítása`}
                  title="Vissza az automatikus értékre"
                  onClick={() => resetOverride(mezo.id)}
                >
                  <RotateCcw className="size-4" />
                </Button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Automatikus érték: {autoText === '' ? 'nincs adat' : autoText}
            </p>
          </div>
        )}
      </div>
    )
  }

  // ── Gyülekezetenkénti bontás (2026-08-25, gyülekezeti egységek) ──

  /**
   * Egy bontás-cella setter-e. A cella értéke a katalógus szerint AUTO
   * mutatónál FELÜLÍRÁSKÉNT tárolódik (a saveLelkesziJelentes kulcs-szűrőjének
   * autoMezok-lába engedi át), kézi mutatónál a kezi rekordba menne.
   * ⛔ Ma a bontás mind a 14 mutatója auto-mező — a kezi-ág jövőbiztosítás:
   * enélkül egy kézi katalógus-mutató cellája a mentés kulcs-szűrőjén NÉMÁN
   * elveszne (pont az a hibaosztály, amit a szűrő véd).
   */
  function setBontasCella(oszlopId: string, mezoId: string, raw: string) {
    const kulcs = egysegMezoKulcs(oszlopId, mezoId)
    if (MEZO_BY_ID.get(mezoId)?.auto) setFelulirasErtek(kulcs, raw)
    else setKeziErtek(kulcs, raw)
  }

  /**
   * Egy bontás-cella feloldott nyers értéke — a fő jelentés prioritásával:
   * felulirasok[kulcs] > bontas.auto[oszlop][mezoId] > kezi[kulcs].
   */
  function bontasCellaNyers(oszlopId: string, mezoId: string): number | string | null {
    if (!bontas) return null
    const kulcs = egysegMezoKulcs(oszlopId, mezoId)
    const felul = felulirasok[kulcs]
    if (felul !== undefined && felul !== null && felul !== '') return felul
    const autoV = bontas.auto[oszlopId]?.[mezoId]
    if (autoV !== undefined && autoV !== null) return autoV
    const k = kezi[kulcs]
    return k === undefined || k === null || k === '' ? null : k
  }

  /** Egy bontás-cella megjelenítése (a renderAutoMezo KOMPAKT változata). */
  function renderBontasCella(oszlopId: string, mezoId: string) {
    if (!bontas) return null
    const kulcs = egysegMezoKulcs(oszlopId, mezoId)
    const autoV = bontas.auto[oszlopId]?.[mezoId] ?? null
    const felulV = felulirasok[kulcs]
    const vanFeluliras = felulV !== undefined && felulV !== null && felulV !== ''
    const nyers = bontasCellaNyers(oszlopId, mezoId)

    // Véglegesített/beküldött jelentés: minden cella csak olvasható.
    if (readOnly) {
      return (
        <span className={cn('tabular-nums', nyers === null && 'italic text-muted-foreground')}>
          {nyers === null ? '—' : typeof nyers === 'number' ? fmtSzam(nyers) : String(nyers)}
        </span>
      )
    }

    // Nem levezethető cella (nincs auto érték): közvetlen beviteli mező.
    // A tárolt érték felülírásban VAGY (régebbi mentésből) kézi kulcson ülhet.
    if (autoV === null) {
      const value = vanFeluliras
        ? String(felulV)
        : kezi[kulcs] === undefined || kezi[kulcs] === null
          ? ''
          : String(kezi[kulcs])
      return (
        <Input
          value={value}
          onChange={(e) => setBontasCella(oszlopId, mezoId, e.target.value)}
          inputMode="decimal"
          aria-label={`${mezoId} — kézi érték (${oszlopId === ANYA_OSZLOP_ID ? (bontas.kozpontCimke ?? ANYAKOZPONT_CIMKE) : 'egység'})`}
          placeholder="—"
          className="h-8 w-20 border-dashed text-right tabular-nums"
        />
      )
    }

    // Auto-alapú cella: readonly érték + ceruza-felülírás.
    const overrideAktiv = vanFeluliras || overrideOpen.has(kulcs)
    if (!overrideAktiv) {
      return (
        <span className="inline-flex items-center gap-0.5">
          <span className="tabular-nums text-foreground">{fmtSzam(autoV)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={`${mezoId} felülírása ebben az oszlopban`}
            title="Felülírás kézi értékkel"
            onClick={() => startOverride(kulcs)}
          >
            <Pencil className="size-3" />
          </Button>
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-0.5">
        <Input
          value={felulV === undefined || felulV === null ? '' : String(felulV)}
          onChange={(e) => setBontasCella(oszlopId, mezoId, e.target.value)}
          inputMode="decimal"
          placeholder={fmtSzam(autoV)}
          aria-label={`${mezoId} felülírt érték`}
          className="h-8 w-20 border-amber-400/60 text-right tabular-nums"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={`${mezoId} felülírás visszaállítása`}
          title="Vissza az automatikus értékre"
          onClick={() => resetOverride(kulcs)}
        >
          <RotateCcw className="size-3" />
        </Button>
      </span>
    )
  }

  /**
   * A bontás-panel tartalma (hibasáv + tábla + lábjegyzetek) — a bal oszlop
   * akkordeonjában ÉS a mobil „Bontás" fülön UGYANEZ renderelődik.
   * Mobile-first: a tábla vízszintesen görgethető, a mutató-oszlop ragadós.
   */
  function renderBontasTartalom() {
    if (!bontas || !currentData) return null
    // 2026-08-25 (társegyházközség): a „központ" oszlop felirata a szerverről
    // jön (társnál „Közös (egész egyházközség)"); régi snapshotnál fallback.
    const kozpont = bontas.kozpontCimke ?? ANYAKOZPONT_CIMKE
    const oszlopok: Array<{ id: string; nev: string; tipusCimke: string | null }> = [
      { id: ANYA_OSZLOP_ID, nev: kozpont, tipusCimke: null },
      ...bontas.egysegek.map((e) => ({
        id: e.id,
        nev: e.nev,
        tipusCimke: EGYSEG_TIPUS_CIMKEK[e.tipus] || null,
      })),
    ]
    return (
      <div className="space-y-2.5">
        {bontas.hibak.length > 0 && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2">
            <ul className="space-y-1 text-xs leading-5 text-foreground">
              {bontas.hibak.map((h, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="min-w-0">{h}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-max border-collapse text-xs">
            <thead>
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-muted px-2.5 py-2 text-left font-semibold text-foreground"
                >
                  Mutató
                </th>
                {oszlopok.map((o) => (
                  <th key={o.id} scope="col" className="bg-muted px-2.5 py-2 text-right font-semibold text-foreground">
                    <span className="block max-w-[9rem] truncate" title={o.nev}>
                      {o.nev}
                    </span>
                    {o.tipusCimke && (
                      <span className="block text-[10px] font-normal text-muted-foreground">{o.tipusCimke}</span>
                    )}
                  </th>
                ))}
                <th scope="col" className="bg-muted px-2.5 py-2 text-right font-semibold text-foreground">
                  Σ Összesen
                </th>
              </tr>
            </thead>
            <tbody>
              {BONTAS_MEZO_IDS.map((mezoId) => {
                const mezo = MEZO_BY_ID.get(mezoId)
                const foNyers = mezoErtek(currentData, mezoId)
                const foSzam = parseHuSzam(foNyers)
                // Σ-egyeztetés: a cellák összege (a null cellák kihagyásával).
                // Az átlag-jellegű mutatóknál (BONTAS_NEM_OSSZEGZO_MEZOK — pl.
                // II.1b) nincs összegzés, ott a Σ a fő jelentés értéke marad.
                let osszeg: number | null = null
                if (!BONTAS_NEM_OSSZEGZO_MEZOK.has(mezoId)) {
                  let s = 0
                  let vanCella = false
                  for (const o of oszlopok) {
                    const n = parseHuSzam(bontasCellaNyers(o.id, mezoId))
                    if (n !== null) {
                      s += n
                      vanCella = true
                    }
                  }
                  osszeg = vanCella ? Math.round(s * 100) / 100 : null
                }
                const elter = osszeg !== null && foSzam !== null && Math.abs(osszeg - foSzam) > 0.005
                return (
                  <tr key={mezoId} className="border-b border-border last:border-b-0">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 min-w-[10rem] max-w-[13rem] bg-card px-2.5 py-1.5 text-left align-middle text-xs font-normal"
                    >
                      <span className="tabular-nums font-semibold text-foreground">{mezoId}</span>{' '}
                      <span className="text-muted-foreground">{mezo?.label || ''}</span>
                      {mezo?.egyseg ? (
                        <span className="text-muted-foreground/70"> ({mezo.egyseg})</span>
                      ) : null}
                      {elter && (
                        <span
                          className="ml-1 inline-flex align-middle"
                          title={`A cellák összege (${fmtSzam(osszeg!)}) eltér a fő jelentés értékétől (${fmtSzam(foSzam!)}).${
                            mezoId === 'VII.3'
                              ? ' A VII.3-nál ez várható: a bontás a munkanapló persely-rovatából, a fő jelentés a befizetésekből számol.'
                              : ''
                          }`}
                        >
                          <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
                        </span>
                      )}
                    </th>
                    {oszlopok.map((o) => (
                      <td key={o.id} className="px-2.5 py-1.5 text-right align-middle">
                        {renderBontasCella(o.id, mezoId)}
                      </td>
                    ))}
                    <td className="px-2.5 py-1.5 text-right align-middle font-semibold tabular-nums text-foreground">
                      {foNyers === null || foNyers === ''
                        ? '—'
                        : typeof foNyers === 'number'
                          ? fmtSzam(foNyers)
                          : String(foNyers)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-1 text-[11px] leading-4 text-muted-foreground">
          <p>
            Üres cella (—) = nincs levezethető adat az egységre — kézzel tölthető, soha nem néma 0. A Σ
            oszlop a fő jelentés hivatalos (feloldott) értéke.
          </p>
          <p>
            <strong className="text-foreground">VII.1</strong> — a járulék-bontás a befizető személy
            egysége szerinti <em>javaslat</em> (család-szintű vagy egység nélküli befizetés:{' '}
            {kozpont} oszlop).
          </p>
          <p>
            <strong className="text-foreground">VII.3</strong> — a persely-bontás a munkanapló
            alkalom-soraiból számol; a fő jelentés VII.3-a a könyvelt befizetésekből — a kettő ismert módon
            eltérhet, ezért ott a Σ-egyeztetés jelzése várható.
          </p>
        </div>
      </div>
    )
  }

  /**
   * 2026-08-11 (6. kör) — a javaslat-sor ADATA egy KÉZI mezőhöz, forrástól
   * függetlenül. KÉT forrás létezik, és MINDKETTŐ ugyanezt a leírót adja:
   *
   *   (1) a különleges alkalmak nyilvántartása  → III.4 / II.10
   *   (2) a MUNKANAPLÓ                          → III.17 (nőszövetségi)
   *
   * A rubrika mindkét esetben KÉZI MARAD: a rendszer megmutatja, mit tud, és
   * egy koppintással beírja. Ha a lelkész a bevezetés évében csak a felét vitte
   * fel, a hivatalos szám akkor is az marad, amit ő tud — automatikus rubrikánál
   * a rendszer LEFELÉ hamisítana egy aláírt, beküldött nyomtatványon.
   */
  function javaslatLeiro(mezo: JelentesMezo, opts?: { cimkevel?: boolean }): JavaslatLeiro | null {
    // VÉDŐHÁLÓ: auto-mező mellé SOHA nem teszünk javaslatot — ott a felülírás
    // az út, és a kettő egymás ellen dolgozna (felulirasok > auto > kezi).
    if (mezo.auto) return null

    // ── (1) Különleges alkalmak nyilvántartása — III.4 / II.10 ──
    if (JAVASLAT_MEZOK.has(mezo.id)) {
      if (kulonleges.needsSql) return null
      const o = kulonleges.osszesites
      const javasolt = javaslatMezohoz(o, mezo.id)
      if (javasolt === null) return null
      // Nincs mit mondani: nulla megtartott alkalom, és semmi függőben/elmaradt.
      if (javasolt === 0 && o.fuggoben === 0 && o.elmaradt === 0) return null

      const beszamitott = javaslatTetelekMezohoz(kulonleges.tetelek, mezo.id)
      const nemIstentiszteleti = beszamitott.filter(nemIstentiszteletiJellegu)

      return {
        javasolt,
        mondat: (
          <>
            A nyilvántartás szerint{' '}
            <strong className="tabular-nums text-foreground">{javasolt}</strong> megtartott alkalom
            {o.fuggoben > 0 ? ` · ${o.fuggoben} megerősítésre vár` : ''}
            {o.elmaradt > 0 ? ` · ${o.elmaradt} elmaradt` : ''}
            {o.fuggoben > 0 && !opts?.cimkevel && (
              <>
                {' — '}a függőben lévőket a{' '}
                <strong className="text-foreground">Véglegesítés…</strong> gomb 2. lépésében
                erősítheted meg.
              </>
            )}
          </>
        ),
        tetelek: beszamitott.map((t) => ({
          kulcs: t.id || `${t.programId || ''}|${t.tervezettDatum}`,
          datum: huRovidDatum(t.tenylegesDatum || t.tervezettDatum),
          cim: t.cim,
          extra: t.resztvevok != null ? `${t.resztvevok} fő` : null,
        })),
        // A II. fejezet címe „Istentisztelet" — egy tábor vagy kirándulás nem
        // istentiszteleti alkalom. NEM döntünk a lelkész helyett, de kimondjuk,
        // mielőtt aláírja.
        figyelmeztetes:
          mezo.id === 'II.10' && nemIstentiszteleti.length > 0 ? (
            <>
              Ebből <strong className="tabular-nums">{nemIstentiszteleti.length}</strong> nem
              istentiszteleti jellegű (tábor, kirándulás, diakóniai alkalom). A II. fejezet az
              istentiszteleteké — fontold meg, hogy ezeket inkább a IX.1 szövegébe írod.
            </>
          ) : undefined,
      }
    }

    // ── (2) Munkanapló-alapú javaslat — III.17 (nőszövetségi alkalmak) ──
    //
    // A napló 15. oszlopa („Nőszövetségi összejövetel") eddig SEHOL nem
    // jelent meg a jelentésben. Most javaslatként megjelenik — de a rubrika
    // szövege „Nőszövetségi BIBLIAÓRA alkalmai", a naplóé „ÖSSZEJÖVETEL":
    // az egyenlőségjelet a lelkész teszi ki, ezért ezt kimondjuk a mondatban.
    if (MUNKANAPLO_JAVASLAT_MEZOK.has(mezo.id)) {
      const j = javaslatok[mezo.id]
      // Hiányzó kulcs = nincs ilyen alkalom, VAGY a munkanapló-lekérdezés
      // hibázott (a szerver ilyenkor SZÁNDÉKOSAN nem javasol 0-t).
      if (!j || j.ertek === 0) return null
      return {
        javasolt: j.ertek,
        mondat: (
          <>
            A munkanapló szerint{' '}
            <strong className="tabular-nums text-foreground">{j.ertek}</strong> nőszövetségi
            összejövetel — a rubrika a nőszövetségi <em>bibliaórákat</em> kéri, ezért nézd át,
            mielőtt beírod.
          </>
        ),
        tetelek: j.tetelek.map((t, i) => ({
          kulcs: `${t.datum}|${i}`,
          datum: huRovidDatum(t.datum),
          cim: t.cim,
          extra: t.jelenlet != null ? `${t.jelenlet} fő` : null,
        })),
      }
    }

    return null
  }

  /** A javaslat-sor megjelenítése — KÖZÖS mindkét forráshoz. */
  function renderJavaslatSor(mezo: JelentesMezo, opts?: { cimkevel?: boolean }) {
    const leiro = javaslatLeiro(mezo, opts)
    if (!leiro) return null

    const jelenlegi = parseHuSzam(kezi[mezo.id] ?? null)
    const elter = jelenlegi !== leiro.javasolt

    return (
      <div className="mt-1.5 rounded-lg border border-dashed border-border bg-muted/40 px-2.5 py-1.5 text-[11px] leading-5 text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1">
            {opts?.cimkevel && (
              <strong className="tabular-nums text-foreground">
                {mezo.id} — {mezo.label}:{' '}
              </strong>
            )}
            {leiro.mondat}
          </span>
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 shrink-0"
              disabled={!elter}
              title={elter ? 'A javasolt érték beírása a mezőbe' : 'A mezőben már ez az érték áll'}
              onClick={() => setKeziErtek(mezo.id, String(leiro.javasolt))}
            >
              Beírom
            </Button>
          )}
        </div>

        {leiro.tetelek.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer list-none py-1 underline-offset-2 hover:underline">
              Mi számít bele? ({leiro.tetelek.length} alkalom)
            </summary>
            <ul className="mt-1 space-y-0.5 border-t border-border pt-1">
              {leiro.tetelek.map((t) => (
                <li key={t.kulcs} className="flex flex-wrap gap-x-1.5">
                  <span className="tabular-nums">{t.datum}</span>
                  <span className="text-foreground">{t.cim}</span>
                  {t.extra && <span className="tabular-nums">· {t.extra}</span>}
                </li>
              ))}
            </ul>
            {leiro.figyelmeztetes && (
              <p className="mt-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-foreground">
                {leiro.figyelmeztetes}
              </p>
            )}
          </details>
        )}
      </div>
    )
  }

  /**
   * 2026-08-11 (6. kör) — a IX.1 („A gyülekezet életének fontosabb eseményei")
   * mezőhöz mondatokat kínálunk a megerősített alkalmakból. HOZZÁFŰZ, soha nem
   * ír felül; a már beillesztett mondatokat kihagyja (nincs duplikálás).
   */
  function renderIX1Beszuras(mezo: JelentesMezo) {
    if (mezo.id !== 'IX.1' || readOnly || kulonleges.needsSql) return null
    const jelenlegi = String(kezi['IX.1'] ?? '')
    const mondatok = kulonleges.tetelek
      .filter((t) => t.allapot === 'megtartva' && !t.masEvbe)
      .map(mondatAlkalomhoz)
      .filter((s) => !jelenlegi.includes(s))
    if (mondatok.length === 0) return null

    return (
      <div className="mt-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => {
            const alap = jelenlegi.replace(/\s+$/, '')
            setKeziErtek('IX.1', alap ? `${alap}\n${mondatok.join('\n')}` : mondatok.join('\n'))
            toast.success(`${mondatok.length} mondat hozzáfűzve — szerkeszd nyugodtan.`)
          }}
        >
          <Sparkles className="size-3.5" />
          Beillesztem a különleges alkalmak mondatait ({mondatok.length})
        </Button>
      </div>
    )
  }

  function renderKeziMezo(mezo: JelentesMezo) {
    const v = kezi[mezo.id]
    const value = v === undefined || v === null ? '' : String(v)
    const nagyTextarea = mezo.fejezet === 'IX' || mezo.fejezet === 'X'

    return (
      <div key={mezo.id}>
        <Label className="text-xs leading-4 text-muted-foreground">
          <span className="tabular-nums font-semibold text-foreground">{mezo.id}</span> — {mezo.label}
          {mezo.egyseg ? <span className="text-muted-foreground/70"> ({mezo.egyseg})</span> : null}
        </Label>
        {mezo.tipus === 'hosszu_szoveg' ? (
          <Textarea
            value={value}
            onChange={(e) => setKeziErtek(mezo.id, e.target.value)}
            rows={nagyTextarea ? 8 : 4}
            disabled={readOnly}
            className="mt-1"
            placeholder="Szabad szöveg…"
          />
        ) : (
          <Input
            value={value}
            onChange={(e) => setKeziErtek(mezo.id, e.target.value)}
            inputMode={mezo.tipus === 'szam' ? 'decimal' : undefined}
            disabled={readOnly}
            className={cn('mt-1 h-9', mezo.tipus === 'szam' && 'tabular-nums')}
          />
        )}
        {renderJavaslatSor(mezo)}
        {renderIX1Beszuras(mezo)}
      </div>
    )
  }

  // ── Wizard lépés-navigáció ──

  function wizardNext() {
    if (wizardStep === 'attekintes') setWizardStep('ellenorzes')
    else if (wizardStep === 'ellenorzes') setWizardStep('hatarozat')
    else if (wizardStep === 'hatarozat') setWizardStep('megerosites')
  }

  function wizardBack() {
    if (wizardStep === 'attekintes') setMode('szerkeszto')
    else if (wizardStep === 'ellenorzes') setWizardStep('attekintes')
    else if (wizardStep === 'hatarozat') setWizardStep('ellenorzes')
    else if (wizardStep === 'megerosites') setWizardStep('hatarozat')
  }

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-6xl
          !h-[94dvh] !max-h-[94dvh]
          flex flex-col gap-0 overflow-hidden rounded-2xl p-0
        "
      >
        {/* ── Fejléc ─────────────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 border-b border-border bg-card/70 px-4 py-3 sm:px-6">
          {/* 2026-08-15 (Endre 4. szakasz): a fejléc-sáv jobb szélén az EGYSÉGES
              véglegesítés-gomb (a bezáró X miatt pr-8). A „Véglegesítve" jelvényt
              is a közös komponens zöld pecsétje adja — nincs második másolat. */}
          <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
            <DialogTitle className="flex min-w-0 items-center gap-3 font-heading text-lg text-foreground sm:text-xl">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ScrollText className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  Lelkészi jelentés — {year}
                  {!readOnly && (
                    <Badge className="bg-muted text-muted-foreground hover:bg-muted">Szerkesztés alatt</Badge>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                  {congregationName || data?.congregationName || 'Egyházközség'} — hivatalos éves jelentés (I–X. fejezet)
                </span>
              </span>
            </DialogTitle>
            {!loading && !loadError && mode === 'szerkeszto' && (
              <FinalizeButton
                documentLabel="lelkészi jelentés"
                year={year}
                finalized={readOnly}
                finalizedAt={data?.veglegesitveAt ?? null}
                unlockRequested={unlockRequested}
                skipConfirm
                onFinalize={() => {
                  setWizardStep('attekintes')
                  setMode('wizard')
                }}
                onRequestUnlock={handleUnlockRequest}
                unlockPlaceholder="Pl. A III. fejezet létszám-adatai hiányosak, javítani szeretném."
              />
            )}
          </div>

          {/* Wizard-progressz */}
          {mode === 'wizard' && (
            <div className="mt-2 flex items-center gap-2 overflow-x-auto text-xs">
              <StepDot active={wizardStep === 'attekintes'} done={wizardStep !== 'attekintes'}>
                1. Áttekintés
              </StepDot>
              <div className="h-px min-w-[8px] flex-1 bg-border" />
              <StepDot
                active={wizardStep === 'ellenorzes'}
                done={wizardStep === 'hatarozat' || wizardStep === 'megerosites' || wizardStep === 'kesz'}
              >
                2. Ellenőrzések
              </StepDot>
              <div className="h-px min-w-[8px] flex-1 bg-border" />
              <StepDot
                active={wizardStep === 'hatarozat'}
                done={wizardStep === 'megerosites' || wizardStep === 'kesz'}
              >
                3. Határozat
              </StepDot>
              <div className="h-px min-w-[8px] flex-1 bg-border" />
              <StepDot active={wizardStep === 'megerosites'} done={wizardStep === 'kesz'}>
                4. Megerősítés
              </StepDot>
              <div className="h-px min-w-[8px] flex-1 bg-border" />
              <StepDot active={wizardStep === 'kesz'} done={false}>
                5. Kész
              </StepDot>
            </div>
          )}
        </DialogHeader>

        {/* A11y: a wizard-lépés bejelentése felolvasónak (vizuálisan rejtett,
            állandóan a DOM-ban — a live-régió csak így jelez megbízhatóan) */}
        <span aria-live="polite" className="sr-only">
          {mode === 'wizard' ? WIZARD_LEPES_CIM[wizardStep] : ''}
        </span>

        {/* ── Törzs ──────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Loader2 className="mx-auto size-7 animate-spin" />
              <p className="mt-3 text-sm">A jelentés és az élő adatok betöltése…</p>
            </div>
          </div>
        ) : loadError ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center">
              <AlertCircle className="mx-auto size-8 text-destructive" />
              <p className="mt-3 text-sm font-semibold text-foreground">A jelentés nem tölthető be</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{loadError}</p>
              <Button variant="outline" className="mt-4" onClick={() => onOpenChange(false)}>
                Bezárás
              </Button>
            </div>
          </div>
        ) : mode === 'wizard' ? (
          /* ── VÉGLEGESÍTŐ WIZARD ─────────────────────────────────────── */
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {/* A11y: fókusz-cél lépésváltáskor (vizuálisan rejtett fejléc) */}
            <h2 ref={wizardHeadingRef} tabIndex={-1} className="sr-only outline-none">
              {WIZARD_LEPES_CIM[wizardStep]}
            </h2>
            {wizardStep === 'attekintes' && (
              <div className="mx-auto max-w-2xl space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div>
                      <h3 className="font-heading text-lg text-foreground">A jelentés véglegesítése</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        A wizard négy lépésben vezet végig: kulcsszámok áttekintése, kitöltöttség-ellenőrzés,
                        határozati adatok, majd a végső megerősítés. Véglegesítés után a jelentés befagy —
                        módosítani csak egyházmegyei feloldással lehet.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KulcsSzam label="Lélekszám (dec. 31.)" value={statErtek('I.10')} />
                  <KulcsSzam label="Keresztelt" value={statErtek('I.2c')} />
                  <KulcsSzam label="Temetett" value={statErtek('I.3c')} />
                  <KulcsSzam label="Esketés" value={statErtek('I.16')} />
                  <KulcsSzam label="Konfirmált" value={statErtek('V.7c')} />
                  <KulcsSzam label="Úrvacsoraosztás" value={statErtek('II.12')} />
                  <KulcsSzam label="Járulék az évben" value={statErtek('VII.1')} />
                  <KulcsSzam label="Persely az évben" value={statErtek('VII.3')} />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  A számok az élő adatokból és a kézi kitöltésből származnak — ha valami nem stimmel, lépjen
                  vissza a szerkesztőbe, és javítsa vagy írja felül az adott mezőt.
                </p>
              </div>
            )}

            {wizardStep === 'ellenorzes' && (
              <div className="mx-auto max-w-2xl space-y-3">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Az alábbi ellenőrzések <strong className="text-foreground">nem blokkolók</strong> — a
                      véglegesítés hiányos rubrikákkal is elvégezhető, de a hivatalos nyomtatványon üresen
                      („—”) jelennek meg.
                    </p>
                  </div>
                </div>

                {/* 2026-08-11 (6. kör): különleges alkalmak megerősítése.
                    HANGOS, de NEM BLOKKOLÓ — a wizardNext() érintetlen, mert a
                    III.4 / II.10 kézi mező, tehát egy függő tétel nem tud
                    hivatalos számot rontani. */}
                {kulonleges.osszesites.fuggoben > 0 && (
                  <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
                    <p className="text-sm font-semibold text-foreground">
                      {kulonleges.osszesites.fuggoben} különleges alkalom megerősítésre vár
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Ezek egyelőre nem szerepelnek a jelentés javaslataiban. Egy koppintás
                      alkalmanként — alább el is intézheted.
                    </p>
                  </div>
                )}

                <KulonlegesAlkalomLista ev={year} adat={kulonleges} zarolva={readOnly} kompakt />

                {/* 2026-08-11 (6. kör, reviewer-major): a megerősített számok ITT
                    is beírhatók. Korábban a [Beírom] gomb CSAK a szerkesztő
                    összecsukott fejezet-akkordeonjában létezett, tehát a lelkész
                    a wizard 2. lépéséből visszalépve, a II. fejezetben ~40 mezőn
                    átgörgetve jutott el a II.10-ig — telefonon ~60 koppintás.
                    Ugyanaz a `renderJavaslatSor`, tehát a két helyen mutatott
                    szám nem tud széthúzni. */}
                {(() => {
                  // 2026-08-11 (6. kör): a III.17 (nőszövetségi) a MUNKANAPLÓBÓL
                  // jön, nem a különleges alkalmak nyilvántartásából — ezért itt
                  // NINCS `kulonleges.needsSql` kapu. A forrásonkénti feltételt a
                  // `javaslatLeiro` intézi, soronként.
                  const sorok = (['III.4', 'II.10', 'III.17'] as const)
                    .map((id) => {
                      const mezo = MEZO_BY_ID.get(id)
                      const node = mezo ? renderJavaslatSor(mezo, { cimkevel: true }) : null
                      return node ? <div key={id}>{node}</div> : null
                    })
                    .filter(Boolean)
                  const ix1mezo = MEZO_BY_ID.get('IX.1')
                  const ix1 = ix1mezo ? renderIX1Beszuras(ix1mezo) : null
                  // Ha nincs mit felajánlani, NE tegyünk ide üres kártyát.
                  if (sorok.length === 0 && !ix1) return null
                  return (
                    <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
                      <p className="text-sm font-semibold text-foreground">
                        Javasolt számok beírása a jelentésbe
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        A III.4, a II.10 és a III.17 rubrika{' '}
                        <strong className="text-foreground">kézi</strong> — a nyilvántartás és a
                        munkanapló csak javasol. Innen egy koppintással beírhatod, nem kell
                        visszamenned a szerkesztőbe.
                      </p>
                      {sorok}
                      {ix1}
                    </div>
                  )
                })()}

                {zarszamadasHianyzik && (
                  <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
                    <p className="text-sm font-semibold text-foreground">Hiányzó zárszámadás-adatok (VII. fejezet)</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Erre az évre nincs véglegesített számadás, ezért a VII.6–VII.8 (évi bevétel/kiadás/egyenleg)
                      üres. Véglegesítse előbb a számadást a Pénzügy modulban, vagy írja felül a mezőket kézzel.
                    </p>
                  </div>
                )}

                <EllenorzesLista
                  cim={`Kitöltetlen kézi mezők (${hianyzoKeziMezok.length} db)`}
                  ures="Minden kézi mező ki van töltve."
                  mezok={hianyzoKeziMezok}
                />
                <EllenorzesLista
                  cim={`Automatikus mezők adat nélkül (${hianyzoAutoMezok.length} db)`}
                  ures="Minden automatikus mező kapott értéket."
                  mezok={hianyzoAutoMezok}
                  megjegyzes="Ezekhez nincs élő adat (pl. üres munkanapló-kategória vagy hiányzó előző évi jelentés) — felülírással pótolhatók."
                />

                {nemSzamMezok.length > 0 && (
                  <EllenorzesLista
                    cim={`Nem értelmezhető számérték (${nemSzamMezok.length} db)`}
                    ures=""
                    mezok={nemSzamMezok}
                    megjegyzes="Ezekben a szám-rubrikákban a beírt szöveg nem értelmezhető számként — a nyomtatványon szó szerint jelenik meg, és az összesítésekbe nem számít bele."
                  />
                )}

                {hianyzoKeziMezok.length === 0 &&
                  hianyzoAutoMezok.length === 0 &&
                  nemSzamMezok.length === 0 &&
                  !zarszamadasHianyzik && (
                  <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-center">
                    <CheckCircle2 className="mx-auto size-7 text-emerald-600 dark:text-emerald-400" />
                    <p className="mt-1 text-sm font-semibold text-foreground">Minden rubrika kitöltött — mehet a véglegesítés!</p>
                  </div>
                )}
              </div>
            )}

            {wizardStep === 'hatarozat' && (
              <div className="mx-auto max-w-2xl space-y-4">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-semibold text-foreground">Határozati és címlap-adatok</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    A jelentést a presbitérium és az egyházközségi közgyűlés tárgyalja — a határozatszámok, az
                    iktatószámok és az aláírók a jelentés címlapjára kerülnek.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {HATAROZAT_MEZOK.map((mezo) => (
                    <div key={mezo.key}>
                      <Label className="text-xs text-muted-foreground">{mezo.label}</Label>
                      <Input
                        type={mezo.type || 'text'}
                        value={hatarozat[mezo.key] || ''}
                        onChange={(e) => {
                          setDirty(true)
                          setHatarozat((prev) => ({ ...prev, [mezo.key]: e.target.value }))
                        }}
                        placeholder={mezo.placeholder}
                        className="mt-1 h-9"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {wizardStep === 'megerosites' && (
              <div className="mx-auto max-w-2xl space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="flex items-center gap-2 font-heading text-lg text-foreground">
                    <Send className="size-5 text-primary" />
                    Utolsó megerősítés
                  </h3>
                  <div className="mt-3 space-y-2 rounded-xl border border-border bg-background p-4 text-sm">
                    <SorPar label="Év" value={String(year)} />
                    <SorPar label="Egyházközség" value={congregationName || data?.congregationName || '—'} />
                    <SorPar label="Presbitériumi határozat" value={hatarozat.presbiteriSzam || '—'} />
                    <SorPar label="Presbitériumi tárgyalás" value={hatarozat.presbiteriDatum || '—'} />
                    <SorPar label="Közgyűlési határozat" value={hatarozat.kozgyulesiSzam || '—'} />
                    <SorPar label="Lelkipásztor" value={hatarozat.lelkipasztor || '—'} />
                    <SorPar label="Főgondnok / gondnok" value={hatarozat.fogondnok || '—'} />
                  </div>
                </div>
                <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
                  <div className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="mb-1 font-semibold text-foreground">Mi történik a megerősítés után?</p>
                      <ul className="list-disc space-y-0.5 pl-5">
                        <li>
                          A jelentés adatai <strong className="text-foreground">befagynak</strong> (snapshot) — a nyomtatott és
                          beküldött változat bit-azonos lesz a tárolttal.
                        </li>
                        <li>A mezők a továbbiakban nem szerkeszthetők — feloldást az egyházmegyétől lehet kérni.</li>
                        <li>A véglegesítés után a jelentés opcionálisan beküldhető az egyházmegyének.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 'kesz' && (
              <div className="mx-auto max-w-xl py-10 text-center">
                <div className="mx-auto inline-flex size-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-10" />
                </div>
                <h3 className="mt-4 font-heading text-2xl text-foreground">A jelentés véglegesítve!</h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  A(z) {year}. évi lelkészi jelentés lezárult. Beküldheti az egyházmegyének, illetve a
                  szerkesztőbe visszalépve PDF-be mentheti vagy kinyomtathatja.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  {submitted ? (
                    <Badge className="bg-emerald-500/15 px-3 py-1.5 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                      <CheckCircle2 className="mr-1 size-3.5" />
                      Beküldve az egyházmegyének
                    </Badge>
                  ) : (
                    <Button onClick={() => void handleSubmitToDiocese()} disabled={submitting}>
                      {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      Beküldés az egyházmegyének
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setMode('szerkeszto')}>
                    Vissza a jelentéshez
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── SZERKESZTŐ + ELŐNÉZET ──────────────────────────────────── */
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 sm:px-6">
            {/* Véglegesítve — magyarázó sáv. 2026-08-15 (Endre 4. szakasz): a
                feloldás-kérés gombja/dialógusa a fejléc közös FinalizeButton-jába
                költözött; itt csak a magyarázat marad (miért zároltak a mezők). */}
            {readOnly && (
              <div className="mb-3 shrink-0 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className="min-w-0 flex-1 text-sm text-foreground">
                    <strong>Véglegesítve</strong>
                    {data?.veglegesitveAt ? ` (${data.veglegesitveAt.slice(0, 10)})` : ''} — a mezők nem
                    szerkeszthetők. Feloldás a fejléc „Feloldás kérése" gombjával kérhető az
                    egyházmegyétől.
                  </p>
                </div>
              </div>
            )}

            {/* Mobil fül-váltó (lg-től mindkét panel látszik) */}
            <div className="mb-3 flex shrink-0 gap-1 rounded-xl border border-border bg-muted p-1 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileView('szerkesztes')}
                aria-pressed={mobileView === 'szerkesztes'}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  mobileView === 'szerkesztes'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <PenLine className="size-4" />
                Szerkesztés
              </button>
              <button
                type="button"
                onClick={() => setMobileView('elonezet')}
                aria-pressed={mobileView === 'elonezet'}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  mobileView === 'elonezet'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Eye className="size-4" />
                Előnézet
              </button>
              {/* 2026-08-25: harmadik fül — csak akkor, ha van bontás-adat. */}
              {bontas && (
                <button
                  type="button"
                  onClick={() => setMobileView('bontas')}
                  aria-pressed={mobileView === 'bontas'}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    mobileView === 'bontas'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Table2 className="size-4" />
                  Bontás
                </button>
              )}
            </div>

            <div className="grid min-h-0 flex-1 gap-4 pb-3 lg:grid-cols-2">
              {/* Bal: fejezetenkénti szerkesztő */}
              <div
                className={cn(
                  'min-h-0 space-y-2.5 overflow-y-auto pb-2 pr-0.5 lg:block',
                  mobileView !== 'szerkesztes' && 'hidden',
                )}
              >
                {/* A11y: fókusz-cél a wizardból való visszalépéskor */}
                <h2 ref={editorHeadingRef} tabIndex={-1} className="sr-only outline-none">
                  A jelentés szerkesztése — fejezetek
                </h2>

                {/* 2026-08-11 (6. kör, reviewer-blocker) — KÜLÖNLEGES ALKALMAK
                    a SZERKESZTŐBEN is.
                    Korábban a lista KIZÁRÓLAG a véglegesítő wizard 2. lépésében
                    létezett, a wizardba pedig az EGYETLEN belépő a „Véglegesítés…"
                    gomb volt — ami véglegesített jelentésnél eltűnik. Így a
                    teljes funkció elérhetetlenné vált, amint a lelkész aláírta a
                    jelentést; a lista `zarolva` ága („…utólag is rögzítheted, hogy
                    a nyilvántartás teljes legyen") HALOTT KÓD volt, mert pontosan
                    akkor lett igaz, amikor a komponens sosem renderelődött.
                    Itt a nézet readOnly állapotban is látszik. */}
                {!kulonleges.needsSql && (
                  <section className="rounded-2xl border border-border bg-card">
                    <button
                      type="button"
                      onClick={() => setKulonlegesNyitva((v) => !(v ?? kulonlegesAlapNyitva))}
                      aria-expanded={kulonlegesPanelNyitva}
                      className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 flex-1 font-heading text-sm text-foreground sm:text-base">
                        Különleges alkalmak
                      </span>
                      {kulonleges.osszesites.fuggoben > 0 && (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] tabular-nums text-amber-700 dark:text-amber-300">
                          {kulonleges.osszesites.fuggoben} vár
                        </span>
                      )}
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                        {kulonleges.osszesites.szeretetvendegseg + kulonleges.osszesites.egyeb}{' '}
                        megtartva
                      </span>
                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-muted-foreground transition-transform',
                          kulonlegesPanelNyitva && 'rotate-180',
                        )}
                      />
                    </button>
                    {kulonlegesPanelNyitva && (
                      <div className="border-t border-border px-4 py-3.5">
                        <KulonlegesAlkalomLista
                          ev={year}
                          adat={kulonleges}
                          zarolva={readOnly}
                          kompakt
                        />
                      </div>
                    )}
                  </section>
                )}

                {/* 2026-08-25 (gyülekezeti egységek): „Gyülekezetenkénti bontás"
                    akkordeon a fejezet-akkordeonok FELETT — csak akkor, ha a
                    szerver bontás-adatot adott (van aktív egység). Mobilon a
                    fülváltó külön „Bontás" füle mutatja ugyanezt a tartalmat. */}
                {bontas && (
                  <section className="rounded-2xl border border-border bg-card">
                    <button
                      type="button"
                      onClick={() => setBontasNyitva((v) => !v)}
                      aria-expanded={bontasNyitva}
                      className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 flex-1 font-heading text-sm text-foreground sm:text-base">
                        Gyülekezetenkénti bontás
                      </span>
                      {bontas.hibak.length > 0 && (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] tabular-nums text-amber-700 dark:text-amber-300">
                          {bontas.hibak.length} jelzés
                        </span>
                      )}
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                        {bontas.egysegek.length + 1} oszlop
                      </span>
                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-muted-foreground transition-transform',
                          bontasNyitva && 'rotate-180',
                        )}
                      />
                    </button>
                    {bontasNyitva && (
                      <div className="border-t border-border px-3 py-3.5 sm:px-4">
                        {renderBontasTartalom()}
                      </div>
                    )}
                  </section>
                )}

                {/* 2026-08-25 (határidőnapló-javaslatok): a gyulekezeti_programok
                    felismert nagy programjai (VBH / FIT7 / Imahét) — a fejezet-
                    akkordeonok FELETT, a bontás-panel után. CSAK szerkeszthető
                    jelentésnél: véglegesítettnél a szerver nem is küld adatot,
                    és a snapshotba javaslat sosem kerülhet. A beírás a közös
                    setKeziErtek-en megy — a mentés a szokásos Mentés gomb. */}
                {!readOnly && programJavaslatok.length > 0 && (
                  <section className="rounded-2xl border border-border bg-card">
                    <button
                      type="button"
                      onClick={() => setProgramPanelNyitva((v) => !v)}
                      aria-expanded={programPanelNyitva}
                      className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CalendarDays className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 font-heading text-sm text-foreground sm:text-base">
                        Határidőnapló-javaslatok
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                        {programJavaslatok.length} program
                      </span>
                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-muted-foreground transition-transform',
                          programPanelNyitva && 'rotate-180',
                        )}
                      />
                    </button>
                    {programPanelNyitva && (
                      <div className="space-y-2.5 border-t border-border px-4 py-3.5">
                        <p className="text-[11px] leading-4 text-muted-foreground">
                          A határidőnapló felismert nagy programjai. A dátumot és a fő adatokat a
                          rendszer hozza — a hiányzókat (résztvevők száma stb.) itt kérdezzük meg, és
                          a beírás soha nem történik rákérdezés nélkül.
                        </p>
                        {programJavaslatok.map((j, idx) => (
                          <ProgramJavaslatKartya
                            key={`${j.tipus}|${j.datum}|${idx}`}
                            javaslat={j}
                            imahetNaploSorok={imahetNaploSorok}
                            aktualisErtek={String(
                              kezi[j.tipus === 'vbh' ? 'IV.5' : 'IV.6'] ?? '',
                            )}
                            onBeiras={(mezoId, szoveg) => {
                              setKeziErtek(mezoId, szoveg)
                              // A IV. fejezet kinyílik, hogy a beírt érték
                              // azonnal látszódjon és szerkeszthető legyen.
                              setOpenChapters((prev) => new Set(prev).add('IV'))
                              toast.success(
                                `Beírva a ${mezoId} mezőbe — a szöveg szabadon szerkeszthető, a mentés a Mentés gombbal történik.`,
                              )
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {FEJEZETEK.map((fejezet) => {
                  const nyitva = openChapters.has(fejezet)
                  const mezok = FEJEZET_MEZOK.get(fejezet) || []
                  const { filled, total } = kitoltottseg(fejezet)
                  return (
                    <section key={fejezet} className="rounded-2xl border border-border bg-card">
                      <button
                        type="button"
                        onClick={() => toggleChapter(fejezet)}
                        aria-expanded={nyitva}
                        className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0 flex-1 font-heading text-sm text-foreground sm:text-base">
                          {fejezet}. {FEJEZET_CIMEK[fejezet]}
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                          {filled}/{total}
                        </span>
                        <ChevronDown
                          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', nyitva && 'rotate-180')}
                        />
                      </button>
                      {nyitva && (
                        <div className="space-y-3 border-t border-border px-4 py-3.5">
                          {mezok.map((mezo) => (mezo.auto ? renderAutoMezo(mezo) : renderKeziMezo(mezo)))}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>

              {/* Jobb: élő A4-előnézet (fit-to-width) */}
              <div
                ref={previewRef}
                className={cn(
                  'min-h-0 overflow-y-auto rounded-2xl border border-border bg-muted/50 p-2.5 lg:block',
                  mobileView !== 'elonezet' && 'hidden',
                )}
              >
                {previewHtml ? (
                  <>
                    {sheetOverflow && (
                      <div
                        className="mx-auto mb-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200"
                        style={{ maxWidth: scaledW }}
                      >
                        Az egyik fejezet szövege hosszabb egy oldalnál — nyomtatásban az oldalszámozás
                        eltolódhat; érdemes rövidíteni.
                      </div>
                    )}
                    <div
                      className="mx-auto overflow-hidden rounded-lg border border-border bg-white shadow-sm"
                      style={{ width: scaledW, height: scaledH }}
                    >
                      <iframe
                        ref={iframeRef}
                        onLoad={measurePreview}
                        title={`Lelkészi jelentés előnézet — ${year}`}
                        srcDoc={previewHtml}
                        style={{
                          width: A4_PORTRAIT_W,
                          height: contentH,
                          border: '0',
                          transform: `scale(${scale})`,
                          transformOrigin: 'top left',
                          background: '#fff',
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">Előnézet készítése…</div>
                )}
              </div>

              {/* 2026-08-25: a bontás mobil-nézete (lg-től a bal oszlop
                  akkordeonja mutatja ugyanezt) */}
              {bontas && (
                <div
                  className={cn(
                    'min-h-0 overflow-y-auto pb-2 lg:hidden',
                    mobileView !== 'bontas' && 'hidden',
                  )}
                >
                  <div className="rounded-2xl border border-border bg-card p-3">
                    <h3 className="mb-2 font-heading text-sm text-foreground">
                      Gyülekezetenkénti bontás
                    </h3>
                    {renderBontasTartalom()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Lábléc ─────────────────────────────────────────────────── */}
        {!loading && !loadError && mode === 'szerkeszto' && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-4 py-3 sm:px-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePdf()}
              disabled={printing || !currentData}
            >
              {printing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              PDF-be mentés
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDirectPrint()}
              disabled={sendingToPrinter || !currentData}
            >
              {sendingToPrinter ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
              Nyomtatás
            </Button>
            {/* 2026-08-25: fekvő A4 melléklet — csak ha van bontás-adat. */}
            {bontas && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleBontasPdf()}
                disabled={printingBontas || !currentData}
              >
                {printingBontas ? <Loader2 className="size-4 animate-spin" /> : <Table2 className="size-4" />}
                Bontás nyomtatása (fekvő)
              </Button>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {dirty && !readOnly && (
                <span className="text-xs text-muted-foreground">Nem mentett módosítások</span>
              )}
              <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
                Bezárás
              </Button>
              {readOnly ? (
                <>
                  {submitted && (
                    <Badge
                      className="bg-emerald-500/15 px-3 py-1.5 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
                      title={data?.submission?.status ? `Beküldés státusza: ${data.submission.status}` : undefined}
                    >
                      <CheckCircle2 className="mr-1 size-3.5" />
                      Beküldve
                      {data?.submission?.submittedAt ? ` (${data.submission.submittedAt.slice(0, 10)})` : ''}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant={submitted ? 'outline' : 'default'}
                    onClick={() => void handleSubmitToDiocese()}
                    disabled={submitting}
                  >
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {submitted ? 'Ismételt beküldés' : 'Beküldés az egyházmegyének'}
                  </Button>
                </>
              ) : (
                /* 2026-08-15 (Endre 4. szakasz): a Véglegesítés-gomb a fejléc-sáv
                   jobb szélére költözött (egységes hely mind a 6 irat-típusnál) —
                   a láblécben a Mentés maradt. */
                <Button variant="outline" size="sm" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Mentés
                </Button>
              )}
            </div>
          </div>
        )}

        {!loading && !loadError && mode === 'wizard' && wizardStep !== 'kesz' && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-3 sm:px-6">
            <Button type="button" variant="ghost" onClick={wizardBack} disabled={isPending}>
              <ArrowLeft className="size-4" />
              {wizardStep === 'attekintes' ? 'Vissza a szerkesztőbe' : 'Vissza'}
            </Button>
            {wizardStep !== 'megerosites' ? (
              <Button type="button" onClick={wizardNext} disabled={isPending}>
                Tovább
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleFinalize} disabled={isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Véglegesítés
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Segéd-komponensek
// ─────────────────────────────────────────────────────────────────────────

function StepDot({ active, done, children }: { active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px]',
        active
          ? 'bg-primary font-semibold text-primary-foreground'
          : done
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground',
      )}
    >
      {done && !active && <CheckCircle2 className="size-2.5" />}
      {children}
    </span>
  )
}

function KulcsSzam({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-semibold tabular-nums text-foreground" title={value}>
        {value}
      </p>
    </div>
  )
}

function SorPar({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}:</span>
      <strong className="min-w-0 truncate text-right text-foreground" title={value}>
        {value}
      </strong>
    </div>
  )
}

/** Nem blokkoló ellenőrzés-lista (kitöltetlen mezők) — görgethető, kompakt. */
function EllenorzesLista({
  cim,
  ures,
  mezok,
  megjegyzes,
}: {
  cim: string
  ures: string
  mezok: JelentesMezo[]
  megjegyzes?: string
}) {
  if (mezok.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-3">
        <p className="flex items-center gap-2 text-sm text-foreground">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          {ures}
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
      <p className="text-sm font-semibold text-foreground">{cim}</p>
      {megjegyzes && <p className="mt-1 text-xs leading-5 text-muted-foreground">{megjegyzes}</p>}
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1 text-xs text-muted-foreground">
        {mezok.map((m) => (
          <li key={m.id} className="flex items-baseline gap-2">
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{m.id}</span>
            <span className="min-w-0">{m.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 2026-08-25 (határidőnapló-javaslatok) — egy felismert program kártyája.
 *
 *  · vbh  → IV.5: a napló hozza a dátumot/helyszínt, a kártya RÁKÉRDEZ a
 *    résztvevőkre + a programra (KOEN / más), és egy gombbal beírja a
 *    komponált szöveget (pl. '2026. 09. 01–05., Kultúrotthon — KOEN program,
 *    24 résztvevő').
 *  · fit7 → IV.6: ugyanígy, rákérdezés a résztvevőkre + a szervezés
 *    szintjére (a program 'Szervezés: …' megjegyzéséből előtöltve).
 *  · imahet → NEM ír mezőt: tájékoztat, hogy a III.5–III.6 a munkanapló
 *    Imahét-soraiból auto — és jelzi, hány ilyen sor van (0-nál borostyán
 *    figyelmeztetés).
 *
 * FELÜLÍRÁS-VÉDELEM: ha a célmező már ki van töltve, a gomb kétállapotú —
 * az első katt csak megerősítést kér ('Biztosan felülírja?'), beírás csak a
 * másodikra történik. A javaslat SOHA nem ír felül kérdezés nélkül.
 */
function ProgramJavaslatKartya({
  javaslat,
  imahetNaploSorok,
  aktualisErtek,
  onBeiras,
}: {
  javaslat: ProgramJavaslat
  /** A munkanapló Imahét-sorainak száma; null = nem megállapítható (worklog-hiba). */
  imahetNaploSorok: number | null
  /** A célmező (IV.5/IV.6) jelenlegi kézi értéke — a felülírás-megerősítéshez. */
  aktualisErtek: string
  onBeiras: (mezoId: 'IV.5' | 'IV.6', szoveg: string) => void
}) {
  const j = javaslat
  const [resztvevok, setResztvevok] = useState('')
  const [vbhProgram, setVbhProgram] = useState<'' | 'koen' | 'mas'>('')
  const [szint, setSzint] = useState<Fit7Szint>(() =>
    j.tipus === 'fit7' ? szintElotoltes(j.megjegyzes) : '',
  )
  // Kétállapotú felülírás-gomb: az első katt csak megerősítést kér.
  const [megerositesVar, setMegerositesVar] = useState(false)

  const tartomany = huDatumTartomany(j.datum, j.datumVege)

  // ── Imahét: csak tájékoztató, mezőt nem ír ──
  if (j.tipus === 'imahet') {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
        <p className="text-xs font-semibold text-foreground">{PROGRAM_JAVASLAT_CIMKEK.imahet}</p>
        <p className="mt-1">
          Imahét a határidőnaplóban:{' '}
          <strong className="text-foreground">{tartomany}</strong>
          {j.helyszin ? `, ${j.helyszin}` : ''}. A jelentés III.5–III.6 sorait a munkanapló
          Imahét-sorai adják —{' '}
          {imahetNaploSorok === null ? (
            <>a munkanapló Imahét-sorainak száma most nem volt megállapítható (a munkanapló lekérdezése hibázott).</>
          ) : (
            <>
              jelenleg{' '}
              <strong className="tabular-nums text-foreground">{imahetNaploSorok}</strong>{' '}
              Imahét-sor van az évben.
            </>
          )}
        </p>
        {imahetNaploSorok === 0 && (
          <p className="mt-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-foreground">
            Nincs Imahét-sor a munkanaplóban — a határidőnapló Imahét-programjából létrehozhatók
            (Új program → Imahét sablon).
          </p>
        )}
      </div>
    )
  }

  // ── VBH / FIT7: rákérdezés + beírás a célmezőbe ──
  const mezoId: 'IV.5' | 'IV.6' = j.tipus === 'vbh' ? 'IV.5' : 'IV.6'
  const fejlec = `${PROGRAM_JAVASLAT_CIMKEK[j.tipus]} — ${tartomany}${j.helyszin ? `, ${j.helyszin}` : ''}`

  // A komponált szöveg: dátumtartomány + helyszín, majd ' — ' után a
  // rákérdezett részletek (üresen hagyott részlet egyszerűen kimarad).
  let szoveg = tartomany
  if (j.helyszin) szoveg += `, ${j.helyszin}`
  const toldalek: string[] = []
  if (j.tipus === 'vbh' && vbhProgram) {
    toldalek.push(vbhProgram === 'koen' ? 'KOEN program' : 'más program')
  }
  if (j.tipus === 'fit7' && szint) toldalek.push(FIT7_SZINT_SZOVEG[szint])
  if (resztvevok.trim()) toldalek.push(`${resztvevok.trim()} résztvevő`)
  if (toldalek.length > 0) szoveg += ` — ${toldalek.join(', ')}`

  const foglalt = aktualisErtek.trim() !== ''
  const azonos = foglalt && aktualisErtek.trim() === szoveg

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2.5">
      <p className="text-xs font-semibold text-foreground">{fejlec}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
        A határidőnapló programja: {j.cim}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-[11px] text-muted-foreground">Résztvevők (fő)</Label>
          <Input
            value={resztvevok}
            onChange={(e) => {
              setResztvevok(e.target.value)
              setMegerositesVar(false)
            }}
            inputMode="numeric"
            placeholder="pl. 24"
            aria-label={`${PROGRAM_JAVASLAT_CIMKEK[j.tipus]} — résztvevők (fő)`}
            className="mt-1 h-9 w-24 tabular-nums"
          />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">
            {j.tipus === 'vbh' ? 'Program' : 'Szervezés szintje'}
          </Label>
          {j.tipus === 'vbh' ? (
            <select
              value={vbhProgram}
              onChange={(e) => {
                setVbhProgram(e.target.value as '' | 'koen' | 'mas')
                setMegerositesVar(false)
              }}
              aria-label="Vakációs Bibliahét — program"
              className={JAVASLAT_SELECT_CLASS}
            >
              <option value="">—</option>
              <option value="koen">KOEN program</option>
              <option value="mas">más program</option>
            </select>
          ) : (
            <select
              value={szint}
              onChange={(e) => {
                setSzint(e.target.value as Fit7Szint)
                setMegerositesVar(false)
              }}
              aria-label="Ifjúsági hét — szervezés szintje"
              className={JAVASLAT_SELECT_CLASS}
            >
              <option value="">—</option>
              <option value="gyulekezeti">gyülekezeti</option>
              <option value="egyhazmegyei">egyházmegyei</option>
              <option value="mindketto">mindkettő</option>
            </select>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={azonos}
          title={azonos ? 'A mezőben már ez az érték áll' : undefined}
          className={cn(
            'min-h-11',
            megerositesVar &&
              'border-amber-400/60 text-amber-700 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-300',
          )}
          onClick={() => {
            // Kitöltött célmezőnél az első katt csak megerősítést kér —
            // beírás (felülírás) kizárólag a második kattra.
            if (foglalt && !megerositesVar) {
              setMegerositesVar(true)
              return
            }
            onBeiras(mezoId, szoveg)
            setMegerositesVar(false)
          }}
        >
          {megerositesVar
            ? 'Biztosan felülírja?'
            : foglalt
              ? `Felülírás… (${mezoId})`
              : `Beírás a jelentésbe (${mezoId})`}
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
        Beírandó szöveg: <span className="text-foreground">{szoveg}</span>
      </p>
      {foglalt && !azonos && (
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          A {mezoId} jelenlegi értéke: <span className="italic">„{aktualisErtek.trim()}”</span> — a
          beírás ezt cserélné le.
        </p>
      )}
    </div>
  )
}
