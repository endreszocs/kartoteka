'use client'

/**
 * KERÜLETI FOGADÓ FELÜLET — ide érkeznek az egyházmegyék hivatalos iratai
 * (egyházkerületi S3, 2026-08-16).
 *
 * MI VOLT A HIBA ENÉLKÜL
 * ----------------------
 * A megye MA is fel tudja küldeni a négy hivatalos iratát (számvevői
 * összesítő, megyei számadás, megyei költségvetés és annak módosításai) — a
 * `diocese_felterjesztes` táblába be is kerül, a „pecsét" (ki, mikor, milyen
 * fagyasztott tartalommal) rögzül. A KERÜLETNEK viszont NULLA fogyasztója volt
 * ennek a táblának: az irat felment, és ott némán állt. Az esperes nem tudta
 * meg, átvették-e; a kerület nem tudta megnézni, mi érkezett; a már élő
 * „visszaküldés" és „feloldás-kérés" mezőknek nem volt elbírálója.
 *
 * ENDRE K4 DÖNTÉSE (2026-08-15) — AMIBŐL EZ A FELÜLET DOLGOZIK
 * ------------------------------------------------------------
 * „A kerület nem írhatja és nem is olvassa a kerület gyülekezeteinek és
 * egyházmegyéinek az adatait, csak a hivatalosan beküldött adatokat illetve
 * azoknak az összesítőjét!"
 * ⇒ Ez a felület KIZÁRÓLAG a `diocese_felterjesztes` sorokból és a bennük lévő
 *   FAGYASZTOTT `snapshot_data`-ból dolgozik (mindkettőt a
 *   `felterjesztes-actions.ts` adja). A megyék KÖNYVEIT nem kérdezi — a
 *   policy-k kerületi ága 2026-08-16-án meg is szűnt. A megyék NEVE (dioceses
 *   törzsadat) marad olvasható: az a feladó neve a borítékon.
 *
 * AMI NINCS FELKÜLDVE, AZ LÁTHATÓAN HIÁNYZIK
 * -------------------------------------------
 * A lista NEM a felterjesztés-sorokból épül, hanem a kerület TELJES
 * megye-listájából (`megyek` prop, a hívó oldal adja a `dioceses` törzsadatból),
 * és minden megyénél kiírja mind a négy irat állapotát — a hiányzót is. Egy
 * „kerek" lista, amiben csak a beérkezett iratok szerepelnek, elrejtené, hogy
 * fél kerület nem küldött semmit; a dokumentumközpont teljességi mátrixa
 * ugyanezt az elvet követi (diagnosztika #7).
 *
 * ELLENŐRI (SZÁMVEVŐI) NÉZET: LETILTVA, NEM ELREJTVE
 * ---------------------------------------------------
 * A kerületi számvevő OLVAS, de nem ír (lásd lib/auth/level-scope.ts). Az ő
 * nézetében minden műveleti gomb LÁTSZIK, de le van tiltva, és mellette ott a
 * magyarázat (`describeDistrictWriteBlock` szövege, a szervertől érkező
 * `readOnlyReason`). Az elrejtés azt üzenné, hogy „ez a funkció nem létezik" —
 * a letiltás azt, hogy „létezik, de más kezében van". Ez utóbbi az igazság.
 *
 * Design: a megyei archívum / dokumentumközpont nyelve (card-raised,
 * rounded-2xl, token-alapú színek), mobil-first — nincs vízszintes görgetés,
 * a sorok telefonon egymás alá törnek.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  CheckCheck,
  ChevronDown,
  FileClock,
  FileText,
  Inbox,
  Info,
  KeyRound,
  Landmark,
  Loader2,
  Lock,
  Printer,
  RefreshCw,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import {
  atvetelNyugtazas,
  feloldasElbiralas,
  getFelterjesztesPillanatkep,
  getKeruletiFelterjesztesek,
  visszakuldes,
} from '@/app/(dashboard)/dashboard-kerulet/felterjesztes-actions'
// A visszaküldés indoklásának küszöbe és HIBASZÖVEGE a közös fájlból — a
// szerver-akció ugyanebből dolgozik. TÜNET, AMI ELLEN VÉD: a 10 karakteres
// küszöb korábban CSAK a szerveren élt, így a felület átengedte az üres/rövid
// indokot, és a felhasználó csak a gombnyomás UTÁN kapott hibát. A két oldal
// mostantól nem tud széthúzni — ezt a duplázást ne „egyszerűsítsd" vissza helyi
// konstansra.
import {
  INDOK_MIN_HOSSZ,
  ellenorizdAVisszakuldesIndokot,
} from '@/app/(dashboard)/dashboard-kerulet/felterjesztes-shared'
import {
  FELTERJESZTES_LABELS,
  type DioceseFelterjesztesSor,
  type DioceseFelterjesztesTipus,
} from '@/lib/finance/diocese-felterjesztes'
// A státusz-jelvények SZÍNKÉSZLETE a közös dokumentumközpontból jön — így a
// lelkész ugyanarra az állapotra ugyanazt a színt látja a megyei és a kerületi
// felületen. (A FELIRATOK viszont itt saját maguk: a felterjesztésnek NINCS
// „ellenőrizve"/„véglegesítve" állapota, viszont VAN „draft" — a
// dokumentumközpont ötös állapotkészlete ide nem illeszthető rá.)
import { STATUS_UI } from '@/components/dashboard/document-center'
import { formatCurrency } from '@/lib/constants/finance'
// A „…Református Egyházmegye" toldat KÖZÖS, duplázás-védett formázója — hogy a
// megye neve a kártyafejlécben, a párbeszédablakban és a nyomtatványon
// ugyanúgy nézzen ki (a `dioceses.name` seedenként hol tartalmazza a toldatot,
// hol nem).
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'
import { printToBrowser } from '@/lib/utils/print-engine-v2'

// ─────────────────────────────────────────────────────────────────────────────
// ADATSZERZŐDÉS a szerver-akciókkal (dashboard-kerulet/felterjesztes-actions.ts)
// ─────────────────────────────────────────────────────────────────────────────
//
// MIÉRT SAJÁT (TÜKÖR) TÍPUSOK, ÉS NEM `import type` AZ AKCIÓ-FÁJLBÓL:
// a Next.js 16 szabálya szerint egy `'use server'` fájl CSAK async függvényt
// exportálhat — a típusai előbb-utóbb átköltöznek egy `*-shared.ts`-be (ez a
// repó bevett mintája, lásd `osszesito-shared.ts` / `document-shared.ts`). Ha
// az akció-fájlból importálnánk őket, ez a felület a költöztetés napján
// fordítási hibával állna meg. A mezőnevek viszont BETŰRE azonosak az akció
// által visszaadottakkal: ha ott bármelyik megváltozik, itt AZONNAL fordítási
// hiba lesz belőle — nem néma, üres lista.

/** Egy megyei felterjesztés a kerületi fogadó listában (pillanatkép NÉLKÜL). */
export interface KeruletiFelterjesztesSor {
  id: string
  dioceseId: string
  /** A feladó egyházmegye neve — törzsadat, K4 szerint olvasható. */
  dioceseName: string
  docType: DioceseFelterjesztesTipus
  year: number
  /** Költségvetés-módosításnál 1–3, egyébként 0. */
  modificationNumber: number
  status: DioceseFelterjesztesSor['status']
  submittedAt: string | null
  receivedAt: string | null
  returnedReason: string | null
  iktatoszam: string | null
  unlockRequested: boolean
  unlockReason: string | null
}

/** A `getKeruletiFelterjesztesek(ev)` adatcsomagja. */
export interface KeruletiFelterjesztesekAdat {
  rows: KeruletiFelterjesztesSor[]
  /** A TELJES archívum évei (év-chipekhez), csökkenő sorrendben. */
  years: number[]
  /** Feliratozott magyarázat (rendszergazdai nézet, üres hatókör, séma-drift). */
  scopeNotice: string | null
  /** Írhat-e a néző: átvétel / visszaküldés / elbírálás. */
  canWrite: boolean
  /** Miért nem írhat — `describeDistrictWriteBlock()` beszédes magyar szövege. */
  readOnlyReason: string | null
  /** Fail-closed hibaüzenet — SOHA nem üres lista helyette. */
  error?: string
}

interface Props {
  /** A szerveren már betöltött első év — így nincs üres első képernyő. */
  kezdoAdat: KeruletiFelterjesztesekAdat
  kezdoEv: number
  /**
   * A kerület ÖSSZES egyházmegyéje (a hívó oldal olvassa a `dioceses`
   * törzsadatból, a saját hatókörére szűrve). Ebből épül a lista, hogy a
   * HIÁNY is látszódjon — lásd a fájl fejlécét.
   */
  megyek: Array<{ id: string; nev: string }>
  /**
   * Ha a hívó oldal NEM tudta beolvasni a `dioceses` törzsadatot, ide a beszédes
   * magyar magyarázat kerül (a `megyek` ilyenkor csonka vagy üres).
   *
   * TÜNET, AMI ELLEN VÉD: a page.tsx korábban elnyelte a lekérdezés hibáját
   * (`const { data } = await …`), így `megyek = []` lett, és ez a felület azt
   * állította, hogy „ehhez az egyházkerülethez nincs egyházmegye rendelve, ezért
   * felterjesztés sem érkezhet". Elnyelt hiba esetén ez TÉNYSZERŰEN HAMIS mondat
   * egy hivatalos felületen. Üres lista + hiba ⇒ MÁS szöveg: nem a besorolás
   * hiányzik, hanem az adat nem olvasható.
   */
  megyekHiba?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Feliratok, színek, formázás
// ─────────────────────────────────────────────────────────────────────────────

/** A négy irat MEGJELENÍTÉSI sorrendje (a hivatali út sorrendje). */
const TIPUS_SORREND: DioceseFelterjesztesTipus[] = [
  'szamvevoi_osszesito',
  'megyei_szamadas',
  'megyei_koltsegvetes',
  'megyei_koltsegvetes_modositas',
]

/**
 * Az évente KÖTELEZŐEN várt iratok. A költségvetés-módosítás szándékosan
 * kimarad: nem minden évben van módosítás, ezért a hiányát nem szabad riasztó
 * „Nincs felküldve" jelvénnyel megbélyegezni — az hamis hiányt mutatna, és
 * elértéktelenítené az IGAZI hiányjelzést.
 */
const KOTELEZO_TIPUSOK: DioceseFelterjesztesTipus[] = [
  'szamvevoi_osszesito',
  'megyei_szamadas',
  'megyei_koltsegvetes',
]

type FelterjesztesAllapot = DioceseFelterjesztesSor['status']

/**
 * Állapot-jelvények. A `className`/ikon a KÖZÖS `STATUS_UI`-ból (egy
 * színforrás), a feliratok viszont a kerületi valósághoz igazítva: a megye
 * FELKÜLDI (nem „beküldi") az iratot a kerülethez.
 */
const ALLAPOT_UI: Record<
  FelterjesztesAllapot,
  { label: string; className: string; icon: typeof Inbox }
> = {
  draft: {
    label: 'Még nem küldte fel',
    className: 'bg-muted text-muted-foreground ring-border',
    icon: FileClock,
  },
  submitted: {
    label: 'Felküldve — átvételre vár',
    className: STATUS_UI.submitted.className,
    icon: STATUS_UI.submitted.icon,
  },
  received: {
    label: 'Átvéve',
    className: STATUS_UI.received.className,
    icon: STATUS_UI.received.icon,
  },
  returned: {
    label: 'Visszaküldve javításra',
    className: STATUS_UI.returned.className,
    icon: STATUS_UI.returned.icon,
  },
}

function datum(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** A küldő egyházmegye megjelenítendő neve (üres törzsadatra is beszédes). */
function megyeNev(nev: string | null | undefined): string {
  return formatEgyhazmegyeNev(nev) || 'Ismeretlen egyházmegye'
}

/** Irat-felirat a KÖZÖS FELTERJESZTES_LABELS-ből + a módosítás sorszáma. */
function iratCimke(tipus: DioceseFelterjesztesTipus, modositasSzam: number): string {
  const alap = FELTERJESZTES_LABELS[tipus] || String(tipus)
  return modositasSzam > 0 ? `${alap} (${modositasSzam}.)` : alap
}

function AllapotJelveny({ allapot }: { allapot: FelterjesztesAllapot }) {
  const ui = ALLAPOT_UI[allapot] || ALLAPOT_UI.draft
  const Ikon = ui.icon
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ui.className}`}
    >
      <Ikon className="size-3" />
      {ui.label}
    </span>
  )
}

/** A hiány LÁTHATÓ jelvénye — nem üres cella, nem elhagyott sor. */
function HianyJelveny({ enyhe }: { enyhe?: boolean }) {
  if (enyhe) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
        Nem érkezett módosítás
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30">
      <TriangleAlert className="size-3" />
      Nincs felküldve
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fő komponens
// ─────────────────────────────────────────────────────────────────────────────

export function FelterjesztesFogado({
  kezdoAdat,
  kezdoEv,
  megyek: megyeLista,
  megyekHiba,
}: Props) {
  const [ev, setEv] = useState(kezdoEv)
  const [adat, setAdat] = useState<KeruletiFelterjesztesekAdat>(kezdoAdat)
  const [toltes, setToltes] = useState(false)
  const [muvelet, startMuvelet] = useTransition()
  const [folyamatbanId, setFolyamatbanId] = useState<string | null>(null)
  const [nyitottMegye, setNyitottMegye] = useState<string | null>(null)

  // Dialógusok célpontjai
  const [nezoSor, setNezoSor] = useState<KeruletiFelterjesztesSor | null>(null)
  const [visszakuldesCel, setVisszakuldesCel] = useState<KeruletiFelterjesztesSor | null>(null)
  const [visszakuldesIndok, setVisszakuldesIndok] = useState('')
  const [feloldasCel, setFeloldasCel] = useState<{
    sor: KeruletiFelterjesztesSor
    dontes: 'jovahagy' | 'elutasit'
  } | null>(null)
  const [feloldasIndok, setFeloldasIndok] = useState('')

  const betolt = useCallback(async (celEv: number) => {
    setToltes(true)
    try {
      const friss = await getKeruletiFelterjesztesek(celEv)
      setAdat(friss)
    } catch {
      // HANGOS hiba: a néma „üres lista" azt sugallná, hogy egyetlen megye sem
      // küldött fel semmit — ez a felület legveszélyesebb hazugsága lenne.
      toast.error('A felterjesztések most nem tölthetők be — próbáld újra néhány perc múlva.')
    } finally {
      setToltes(false)
    }
  }, [])

  // Év-váltáskor újratöltés. Az effect TÖRZSÉBEN nincs szinkron setState — a
  // betöltés microtaskban indul (a repó bevett mintája, lásd
  // diocese-osszesito-view.tsx; a react-hooks/set-state-in-effect nálunk ERROR).
  useEffect(() => {
    if (ev === kezdoEv) return
    let elavult = false
    queueMicrotask(() => {
      if (!elavult) void betolt(ev)
    })
    return () => {
      elavult = true
    }
  }, [ev, kezdoEv, betolt])

  const canWrite = adat.canWrite === true
  const tiltasSzoveg =
    adat.readOnlyReason || 'Ehhez a művelethez egyházkerületi adminisztrátori jogosultság kell.'

  const sorok = useMemo(() => adat.rows || [], [adat.rows])

  const evek = useMemo(() => {
    const halmaz = new Set<number>(adat.years || [])
    halmaz.add(ev)
    return [...halmaz].sort((a, b) => b - a)
  }, [adat.years, ev])

  /** Megye-azonosító → a megye ebben az évben felküldött iratai. */
  const sorokMegyenkent = useMemo(() => {
    const map = new Map<string, KeruletiFelterjesztesSor[]>()
    for (const s of sorok) {
      const lista = map.get(s.dioceseId)
      if (lista) lista.push(s)
      else map.set(s.dioceseId, [s])
    }
    return map
  }, [sorok])

  /**
   * A megjelenítendő megyék — a kerület TELJES listája, ábécé szerint.
   * Ha egy sor olyan megyéhez tartozik, ami (adathiba vagy időközbeni
   * átsorolás miatt) nincs a törzslistában, azt is felvesszük: egy beérkezett
   * hivatalos irat SOHA ne tűnhessen el némán egy hiányzó törzsadat miatt.
   */
  const megyek = useMemo(() => {
    const lista = (megyeLista || []).map((m) => ({
      id: m.id,
      nev: m.nev || 'Ismeretlen egyházmegye',
    }))
    const ismert = new Set(lista.map((m) => m.id))
    for (const s of sorok) {
      if (!ismert.has(s.dioceseId)) {
        ismert.add(s.dioceseId)
        lista.push({ id: s.dioceseId, nev: megyeNev(s.dioceseName) })
      }
    }
    return lista.sort((a, b) => a.nev.localeCompare(b.nev, 'hu'))
  }, [megyeLista, sorok])

  /** Feloldás-kérelmek — kiemelt blokk, mert ezek VÁRNAK a kerület döntésére. */
  const feloldasKerelmek = useMemo(() => sorok.filter((s) => s.unlockRequested), [sorok])

  const atvetelreVar = useMemo(
    () => sorok.filter((s) => s.status === 'submitted').length,
    [sorok],
  )

  /** Egy megye adott évi tételei a négy irat-típus sorrendjében (hiánnyal együtt). */
  function megyeTetelei(megyeId: string): Array<{
    kulcs: string
    tipus: DioceseFelterjesztesTipus
    sor: KeruletiFelterjesztesSor | null
  }> {
    const megyeSorok = sorokMegyenkent.get(megyeId) || []
    const tetelek: Array<{
      kulcs: string
      tipus: DioceseFelterjesztesTipus
      sor: KeruletiFelterjesztesSor | null
    }> = []
    for (const tipus of TIPUS_SORREND) {
      const talalatok = megyeSorok
        .filter((s) => s.docType === tipus)
        .sort((a, b) => a.modificationNumber - b.modificationNumber)
      if (talalatok.length === 0) {
        tetelek.push({ kulcs: `${megyeId}::${tipus}`, tipus, sor: null })
        continue
      }
      for (const s of talalatok) tetelek.push({ kulcs: s.id, tipus, sor: s })
    }
    return tetelek
  }

  // ── Műveletek ──────────────────────────────────────────────────────────────

  function futtat(
    id: string,
    fn: () => Promise<{ error?: string } | void>,
    sikerUzenet: string,
    utana?: () => void,
  ) {
    setFolyamatbanId(id)
    startMuvelet(async () => {
      try {
        const res = await fn()
        if (res && res.error) {
          toast.error(res.error)
          return
        }
        toast.success(sikerUzenet)
        utana?.()
        await betolt(ev)
      } catch {
        toast.error('A művelet nem hajtható végre — próbáld újra néhány perc múlva.')
      } finally {
        setFolyamatbanId(null)
      }
    })
  }

  function atvesz(sor: KeruletiFelterjesztesSor) {
    futtat(
      sor.id,
      () => atvetelNyugtazas(sor.id),
      `Átvéve: ${iratCimke(sor.docType, sor.modificationNumber)} — ${megyeNev(sor.dioceseName)}, ${sor.year}. év.`,
    )
  }

  function visszakuldesMentes() {
    if (!visszakuldesCel) return
    const indok = visszakuldesIndok.trim()
    // KÖTELEZŐ, és legalább INDOK_MIN_HOSSZ karakter: enélkül a megye nem tudná,
    // mit javítson — a puszta „visszaküldve" állapot csak találgatásra
    // kényszerítené az esperest. UGYANAZ az ellenőrzés és UGYANAZ a mondat, amit
    // a szerver ad (közös `felterjesztes-shared.ts`), hogy a felület ne engedjen
    // át olyat, amit a szerver utána mégis visszadob.
    const indokHiba = ellenorizdAVisszakuldesIndokot(indok)
    if (indokHiba) {
      toast.error(indokHiba)
      return
    }
    futtat(
      visszakuldesCel.id,
      () => visszakuldes(visszakuldesCel.id, indok),
      'Az iratot visszaküldtük az egyházmegyének javításra.',
      () => {
        setVisszakuldesCel(null)
        setVisszakuldesIndok('')
      },
    )
  }

  function feloldasMentes() {
    if (!feloldasCel) return
    const indok = feloldasIndok.trim()
    if (feloldasCel.dontes === 'elutasit' && !indok) {
      toast.error('Az elutasításhoz kötelező megadni az indoklást.')
      return
    }
    futtat(
      feloldasCel.sor.id,
      () => feloldasElbiralas(feloldasCel.sor.id, feloldasCel.dontes, indok || undefined),
      feloldasCel.dontes === 'jovahagy'
        ? 'A feloldást jóváhagytuk — az egyházmegye javíthat és újra felküldheti az iratot.'
        : 'A feloldás-kérelmet elutasítottuk; az indoklást az egyházmegye is látja.',
      () => {
        setFeloldasCel(null)
        setFeloldasIndok('')
      },
    )
  }

  // ── Fail-closed hiba: nincs hatókör vagy nem olvasható az adat ─────────────
  if (adat.error) {
    return (
      <div className="card-raised rounded-2xl border-amber-300/60 p-5 dark:border-amber-400/30">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <h2 className="font-heading text-base text-foreground">
              A felterjesztések most nem jeleníthetők meg
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{adat.error}</p>
          </div>
        </div>
      </div>
    )
  }

  const dolgozik = muvelet || toltes

  // A visszaküldés-ablak élő ellenőrzése: `null`, ha az indoklás megfelel,
  // egyébként a szerverrel SZÓ SZERINT azonos magyar mondat. Ezzel tiltjuk a
  // gombot és ezt írjuk ki a mező alá — a felhasználó ne a mentés után tudja meg,
  // hogy két szó kevés.
  const visszakuldesIndokHiba = ellenorizdAVisszakuldesIndokot(visszakuldesIndok)

  return (
    <div className="space-y-4">
      {/* ── Fejléc: év-választó + frissítés + ellenőri magyarázat ──────────── */}
      <div className="card-raised rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Inbox className="size-4 text-teal-600" />
          <p className="text-base font-semibold text-foreground">
            {ev}. évi egyházmegyei felterjesztések
          </p>
          {toltes && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Badge variant="outline" className="rounded-full border-border text-muted-foreground">
            {megyek.length} egyházmegye
          </Badge>
          {atvetelreVar > 0 && (
            <Badge className="rounded-full bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-400/30">
              {atvetelreVar} irat átvételre vár
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto rounded-xl max-sm:min-h-10"
            onClick={() => void betolt(ev)}
            disabled={toltes}
          >
            <RefreshCw className="mr-1 size-3.5" />
            Frissítés
          </Button>
        </div>

        {/* Év-választó chipek — a ténylegesen létező évekből. */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {evek.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEv(e)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition max-sm:min-h-9 ${
                e === ev
                  ? 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-400/40 dark:bg-teal-400/15 dark:text-teal-300'
                  : 'border-border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {e}.
            </button>
          ))}
        </div>

        {/* A szerver feliratozott magyarázata (rendszergazdai nézet, séma-drift,
            a kerületi számvevő még nem élesített RLS-jogosultsága). Ha ezt
            elhallgatnánk, az ellenőr egy ÜRES listát látna, és azt hinné, hogy
            egyetlen megye sem terjesztett fel semmit. */}
        {adat.scopeNotice && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-sm leading-relaxed text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>{adat.scopeNotice}</span>
          </p>
        )}

        {/* A megye-törzsadat OLVASHATATLAN — nem néma üresség, hanem kimondott
            hiba. Enélkül a felhasználó a hiányzó megyéket hiánytalannak hinné. */}
        {megyekHiba && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>{megyekHiba}</span>
          </p>
        )}

        {/* Ellenőri (számvevői) nézet — a letiltott gombok mellé MAGYARÁZAT. */}
        {!canWrite && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-sm leading-relaxed text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <span>{tiltasSzoveg}</span>
          </p>
        )}

        {/* K4 döntés kimondva: mit lát és mit NEM lát a kerület. */}
        <p className="mt-3 rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          A kerület kizárólag a hivatalosan felküldött iratokat és azok fagyasztott pillanatképét
          látja — az egyházmegyék és a gyülekezetek könyveibe nem néz bele. A pillanatkép azt az
          állapotot őrzi, amit az egyházmegye a felküldéskor véglegesített: a későbbi megyei
          javítások automatikusan NEM kerülnek bele.
        </p>
      </div>

      {/* ── FELOLDÁS-KÉRELMEK (kiemelt blokk) ─────────────────────────────── */}
      {feloldasKerelmek.length > 0 && (
        <div className="card-raised overflow-hidden rounded-2xl border-violet-300/60 dark:border-violet-400/30">
          <div className="flex flex-wrap items-center gap-2 border-b border-violet-200/70 bg-violet-50/60 px-4 py-3 dark:border-violet-400/25 dark:bg-violet-400/10">
            <KeyRound className="size-4 text-violet-600 dark:text-violet-300" />
            <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">
              Feloldás-kérelmek — a kerület döntésére várnak
            </p>
            <Badge className="rounded-full bg-violet-100 text-violet-800 dark:bg-violet-400/20 dark:text-violet-200">
              {feloldasKerelmek.length}
            </Badge>
          </div>
          <ul className="divide-y divide-border">
            {feloldasKerelmek.map((s) => (
              <li key={`unlock-${s.id}`} className="px-4 py-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {megyeNev(s.dioceseName)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {iratCimke(s.docType, s.modificationNumber)} · {s.year}. év · felküldve:{' '}
                      {datum(s.submittedAt)}
                    </p>
                    {s.unlockReason && (
                      <p className="mt-2 rounded-xl border border-violet-200/70 bg-violet-50/50 p-2.5 text-sm leading-relaxed text-violet-900 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-200">
                        Az egyházmegye indoklása: „{s.unlockReason}”
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg max-sm:min-h-10"
                      onClick={() => setNezoSor(s)}
                    >
                      <FileText className="mr-1 size-3.5" />
                      Pillanatkép
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 max-sm:min-h-10"
                      onClick={() => {
                        setFeloldasIndok('')
                        setFeloldasCel({ sor: s, dontes: 'jovahagy' })
                      }}
                      disabled={!canWrite || dolgozik}
                      title={canWrite ? undefined : tiltasSzoveg}
                    >
                      <ThumbsUp className="mr-1 size-3.5" />
                      Jóváhagyom
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 max-sm:min-h-10 dark:border-rose-400/30 dark:text-rose-300 dark:hover:bg-rose-400/10"
                      onClick={() => {
                        setFeloldasIndok('')
                        setFeloldasCel({ sor: s, dontes: 'elutasit' })
                      }}
                      disabled={!canWrite || dolgozik}
                      title={canWrite ? undefined : tiltasSzoveg}
                    >
                      <ThumbsDown className="mr-1 size-3.5" />
                      Elutasítom
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── MEGYÉNKÉNTI LISTA (a hiányzókkal együtt) ───────────────────────── */}
      {megyek.length === 0 ? (
        <div className="card-raised rounded-2xl p-8 text-center">
          {megyekHiba ? (
            // ÜRES LISTA + HIBA: itt SOHA nem szabad kimondani, hogy „nincs
            // egyházmegye rendelve" — az az adathiba esetén hamis tényállítás
            // lenne egy hivatalos felületen (lásd a `megyekHiba` prop leírását).
            <>
              <ShieldAlert className="mx-auto size-8 text-amber-500" />
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Az egyházmegyék listája most nem olvasható be, ezért nem tudjuk megmutatni, melyik
                egyházmegye mit terjesztett fel. Ez NEM jelenti azt, hogy nincs egyházmegye
                rendelve az egyházkerülethez. Frissítsd az oldalt, és ha a hiba megmarad, jelezd a
                rendszergazdának.
              </p>
            </>
          ) : (
            <>
              <Landmark className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Ehhez az egyházkerülethez nincs egyházmegye rendelve, ezért felterjesztés sem
                érkezhet. Ha ez tévedés, jelezd a rendszergazdának — az egyházmegyék besorolását az
                adminisztrációs felületen lehet javítani.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {megyek.map((m) => {
            const tetelek = megyeTetelei(m.id)
            const erkezett = tetelek.filter((t) => t.sor && t.sor.status !== 'draft').length
            const hianyzik = KOTELEZO_TIPUSOK.filter(
              (tipus) => !tetelek.some((t) => t.tipus === tipus && t.sor && t.sor.status !== 'draft'),
            ).length
            const nyitva = nyitottMegye === m.id
            return (
              <div key={m.id} className="card-raised overflow-hidden rounded-2xl">
                <button
                  type="button"
                  onClick={() => setNyitottMegye(nyitva ? null : m.id)}
                  className="flex w-full items-center gap-3 p-4 text-left max-sm:min-h-12"
                >
                  <div className="rounded-xl bg-teal-50 p-2 dark:bg-teal-400/10">
                    <Landmark className="size-4 text-teal-600 dark:text-teal-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{m.nev}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {erkezett} irat érkezett
                      {hianyzik > 0
                        ? ` · ${hianyzik} kötelező irat még hiányzik`
                        : ' · minden kötelező irat megérkezett'}
                    </p>
                  </div>
                  {hianyzik > 0 ? (
                    <span className="hidden shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/25 sm:inline-flex dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30">
                      <TriangleAlert className="size-3" />
                      Hiányos
                    </span>
                  ) : (
                    <span className="hidden shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 sm:inline-flex dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30">
                      <CheckCheck className="size-3" />
                      Teljes
                    </span>
                  )}
                  <ChevronDown
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${nyitva ? 'rotate-180' : ''}`}
                  />
                </button>

                {nyitva && (
                  <ul className="divide-y divide-border border-t border-border">
                    {tetelek.map((t) => {
                      const s = t.sor
                      const megjott = !!s && s.status !== 'draft'
                      return (
                        <li key={t.kulcs} className="px-4 py-3.5">
                          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">
                                {iratCimke(t.tipus, s?.modificationNumber ?? 0)}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {megjott && s
                                  ? [
                                      `Felküldve: ${datum(s.submittedAt)}`,
                                      s.receivedAt ? `átvéve: ${datum(s.receivedAt)}` : null,
                                      s.iktatoszam ? `iktatószám: ${s.iktatoszam}` : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')
                                  : s
                                    ? 'Az egyházmegye visszavonta a felküldést — javítás után újra felküldi.'
                                    : 'Erre az évre nem érkezett felküldés ettől az egyházmegyétől.'}
                              </p>
                              {s?.status === 'returned' && s.returnedReason && (
                                <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50/60 p-2.5 text-xs leading-relaxed text-rose-900 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200">
                                  Visszaküldve javításra — indoklás: {s.returnedReason}
                                </p>
                              )}
                              {s?.unlockRequested && (
                                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-inset ring-violet-400/30 dark:bg-violet-400/10 dark:text-violet-200">
                                  <KeyRound className="size-3" />
                                  Feloldást kért — döntésre vár
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              {megjott && s ? (
                                <AllapotJelveny allapot={s.status} />
                              ) : (
                                // TÜNET, AMI ELLEN EZ VÉD: itt korábban
                                // `enyhe={… && !s}` állt. Ha a megye felküldött egy
                                // költségvetés-módosítást, majd VISSZAVONTA (a sor
                                // létezik, `status='draft'`), akkor `s` igaz volt, az
                                // `enyhe` hamisra fordult — és a riasztó, borostyán
                                // „Nincs felküldve" jelvény jelent meg egy olyan
                                // iratra, ami sosem kötelező. Pontosan az, amit a
                                // KOTELEZO_TIPUSOK kommentje tilt: hamis hiány, ami
                                // elértékteleníti az IGAZI hiányjelzést. A módosítás
                                // hiánya SOHA nem riasztó — a `!s` feltétel ezért NE
                                // kerüljön vissza.
                                <HianyJelveny enyhe={t.tipus === 'megyei_koltsegvetes_modositas'} />
                              )}

                              {megjott && s && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-lg max-sm:min-h-10"
                                    onClick={() => setNezoSor(s)}
                                  >
                                    <FileText className="mr-1 size-3.5" />
                                    Pillanatkép
                                  </Button>

                                  {s.status === 'submitted' && (
                                    <Button
                                      size="sm"
                                      className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 max-sm:min-h-10"
                                      onClick={() => atvesz(s)}
                                      disabled={!canWrite || dolgozik}
                                      title={canWrite ? undefined : tiltasSzoveg}
                                    >
                                      {folyamatbanId === s.id ? (
                                        <Loader2 className="mr-1 size-3.5 animate-spin" />
                                      ) : (
                                        <CheckCheck className="mr-1 size-3.5" />
                                      )}
                                      Átvettem
                                    </Button>
                                  )}

                                  {s.status !== 'returned' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 max-sm:min-h-10 dark:border-rose-400/30 dark:text-rose-300 dark:hover:bg-rose-400/10"
                                      onClick={() => {
                                        setVisszakuldesIndok('')
                                        setVisszakuldesCel(s)
                                      }}
                                      disabled={!canWrite || dolgozik}
                                      title={canWrite ? undefined : tiltasSzoveg}
                                    >
                                      <Undo2 className="mr-1 size-3.5" />
                                      Visszaküldés javításra
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Pillanatkép-néző ──────────────────────────────────────────────── */}
      <PillanatkepDialogus sor={nezoSor} onClose={() => setNezoSor(null)} />

      {/* ── Visszaküldés (KÖTELEZŐ indoklás) ──────────────────────────────── */}
      <Dialog
        open={!!visszakuldesCel}
        onOpenChange={(o) => {
          if (!o) setVisszakuldesCel(null)
        }}
      >
        <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="size-4 text-rose-600" />
              Visszaküldés javításra
            </DialogTitle>
            <DialogDescription>
              {visszakuldesCel
                ? `${megyeNev(visszakuldesCel.dioceseName)} — ${iratCimke(visszakuldesCel.docType, visszakuldesCel.modificationNumber)}, ${visszakuldesCel.year}. év`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground" htmlFor="visszakuldes-indok">
              Mit kell javítani? (kötelező, legalább {INDOK_MIN_HOSSZ} karakter)
            </label>
            <Textarea
              id="visszakuldes-indok"
              value={visszakuldesIndok}
              onChange={(e) => setVisszakuldesIndok(e.target.value)}
              rows={4}
              placeholder="Pl. „A számvevői összesítő bevétel-főösszege nem egyezik a mellékelt jegyzőkönyvvel — kérjük javítva újra felküldeni."
              aria-invalid={visszakuldesIndokHiba ? true : undefined}
              aria-describedby="visszakuldes-indok-sugo"
            />
            {/* A hiba MÁR GÉPELÉS KÖZBEN látszik — a szerver mondatával szó szerint. */}
            {visszakuldesIndokHiba && (
              <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                {visszakuldesIndokHiba}
              </p>
            )}
            <p id="visszakuldes-indok-sugo" className="text-xs leading-relaxed text-muted-foreground">
              Az indoklást az egyházmegye is látja, és bekerül az irat naplójába. Enélkül az esperes
              csak találgatna, mit vár tőle a kerület — ezért kötelező.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-lg" onClick={() => setVisszakuldesCel(null)}>
              Mégse
            </Button>
            <Button
              className="rounded-lg bg-rose-600 text-white hover:bg-rose-700"
              onClick={visszakuldesMentes}
              disabled={!canWrite || dolgozik || !!visszakuldesIndokHiba}
              title={
                !canWrite ? tiltasSzoveg : (visszakuldesIndokHiba ?? undefined)
              }
            >
              <Undo2 className="mr-1 size-3.5" />
              Visszaküldés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Feloldás-kérelem elbírálása ───────────────────────────────────── */}
      <Dialog
        open={!!feloldasCel}
        onOpenChange={(o) => {
          if (!o) setFeloldasCel(null)
        }}
      >
        <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-violet-600" />
              {feloldasCel?.dontes === 'jovahagy'
                ? 'Feloldás jóváhagyása'
                : 'Feloldás-kérelem elutasítása'}
            </DialogTitle>
            <DialogDescription>
              {feloldasCel
                ? `${megyeNev(feloldasCel.sor.dioceseName)} — ${iratCimke(feloldasCel.sor.docType, feloldasCel.sor.modificationNumber)}, ${feloldasCel.sor.year}. év`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {feloldasCel?.sor.unlockReason && (
              <p className="rounded-xl border border-violet-200/70 bg-violet-50/50 p-2.5 text-sm leading-relaxed text-violet-900 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-200">
                Az egyházmegye indoklása: „{feloldasCel.sor.unlockReason}”
              </p>
            )}
            <label className="text-xs font-semibold text-foreground" htmlFor="feloldas-indok">
              {feloldasCel?.dontes === 'jovahagy'
                ? 'Megjegyzés az egyházmegyének (nem kötelező)'
                : 'Az elutasítás indoklása (kötelező)'}
            </label>
            <Textarea
              id="feloldas-indok"
              value={feloldasIndok}
              onChange={(e) => setFeloldasIndok(e.target.value)}
              rows={3}
              placeholder={
                feloldasCel?.dontes === 'jovahagy'
                  ? 'Pl. „Rendben, a javítás után legkésőbb 15-éig küldjétek fel újra."'
                  : 'Pl. „A hivatalos határidő lejárt, a javítást a jövő évi beszámolóban kell átvezetni."'
              }
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {feloldasCel?.dontes === 'jovahagy'
                ? 'A jóváhagyással az egyházmegye újra szerkesztheti és felküldheti az iratot. A mostani felküldés adatai az irat naplójában maradnak meg.'
                : 'Az elutasítás indoklását az egyházmegye is látja — ebből tudja meg, miért marad zárva az irat.'}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-lg" onClick={() => setFeloldasCel(null)}>
              Mégse
            </Button>
            <Button
              className={`rounded-lg text-white ${
                feloldasCel?.dontes === 'jovahagy'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
              onClick={feloldasMentes}
              disabled={!canWrite || dolgozik}
              title={canWrite ? undefined : tiltasSzoveg}
            >
              {feloldasCel?.dontes === 'jovahagy' ? (
                <ThumbsUp className="mr-1 size-3.5" />
              ) : (
                <ThumbsDown className="mr-1 size-3.5" />
              )}
              {feloldasCel?.dontes === 'jovahagy' ? 'Jóváhagyom' : 'Elutasítom'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pillanatkép-néző (a FAGYASZTOTT irat) + nyomtatás
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A `snapshot_data` KÉRÉSRE töltődik (a lista nem hozza magával): egy megyei
 * számadás-pillanatkép több száz kilobájt is lehet, és a kerületnek egyszerre
 * akár tucatnyi megye × négy irat sora van a képernyőn. A gyülekezeti
 * dokumentumközpont ugyanezt a mintát követi (2026-08-11, P2-#19).
 */
function PillanatkepDialogus({
  sor,
  onClose,
}: {
  sor: KeruletiFelterjesztesSor | null
  onClose: () => void
}) {
  const [kepek, setKepek] = useState<Record<string, Record<string, unknown>>>({})
  const [hibak, setHibak] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!sor) return
    if (kepek[sor.id] !== undefined || hibak[sor.id] !== undefined) return
    const id = sor.id
    let elavult = false
    getFelterjesztesPillanatkep(id)
      .then((res) => {
        if (elavult) return
        if (res.error) setHibak((elozo) => ({ ...elozo, [id]: res.error as string }))
        else setKepek((elozo) => ({ ...elozo, [id]: res.snapshot ?? {} }))
      })
      .catch(() => {
        if (elavult) return
        setHibak((elozo) => ({
          ...elozo,
          [id]: 'A felküldött irat tartalma most nem tölthető be — próbáld újra.',
        }))
      })
    return () => {
      elavult = true
    }
  }, [sor, kepek, hibak])

  const snapshot = sor ? (kepek[sor.id] ?? null) : null
  const hiba = sor ? (hibak[sor.id] ?? null) : null
  const tolt = !!sor && snapshot === null && hiba === null

  async function nyomtat() {
    if (!sor || snapshot === null) return
    try {
      await printToBrowser(buildFelterjesztesPrintHtml(sor, snapshot))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A nyomtatás nem indítható el.')
    }
  }

  return (
    <Dialog
      open={!!sor}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
        {sor && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="size-4 text-violet-600" />
                {iratCimke(sor.docType, sor.modificationNumber)} — {sor.year}. év
              </DialogTitle>
              <DialogDescription>
                {megyeNev(sor.dioceseName)}
                {sor.iktatoszam ? ` · iktatószám: ${sor.iktatoszam}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Idővonal — a hivatali út állomásai. */}
              <div className="rounded-xl bg-muted/40 p-3.5">
                <Idovonal sor={sor} />
              </div>

              {sor.status === 'returned' && sor.returnedReason && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 dark:border-rose-400/30 dark:bg-rose-400/10">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                    Visszaküldés indoklása
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                    {sor.returnedReason}
                  </p>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Felküldött adatok (fagyasztott pillanatkép)
                </p>
                {tolt ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    A felküldött adatok betöltése…
                  </p>
                ) : hiba ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{hiba}</span>
                  </div>
                ) : (
                  <PillanatkepTartalom snap={snapshot ?? {}} />
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" className="rounded-lg" onClick={onClose}>
                Bezárás
              </Button>
              <Button
                className="rounded-lg"
                onClick={() => void nyomtat()}
                disabled={tolt || snapshot === null}
                title={
                  snapshot === null
                    ? 'A nyomtatáshoz előbb be kell töltődnie a felküldött adatoknak.'
                    : undefined
                }
              >
                <Printer className="mr-1 size-3.5" />
                Nyomtatás
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Idovonal({ sor }: { sor: KeruletiFelterjesztesSor }) {
  const lepesek: Array<{ cimke: string; mikor: string | null; kesz: boolean }> = [
    { cimke: 'Felküldve az egyházmegyétől', mikor: sor.submittedAt, kesz: !!sor.submittedAt },
    { cimke: 'Átvéve a kerületben', mikor: sor.receivedAt, kesz: !!sor.receivedAt },
  ]
  return (
    <div className="space-y-1.5">
      {lepesek.map((l) => (
        <div key={l.cimke} className="flex items-center gap-2 text-sm">
          <span
            className={`size-2 shrink-0 rounded-full ${l.kesz ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
          />
          <span className={l.kesz ? 'font-medium text-foreground' : 'text-muted-foreground'}>
            {l.cimke}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">{datum(l.mikor)}</span>
        </div>
      ))}
      {sor.status === 'returned' && (
        <div className="flex items-center gap-2 text-sm">
          <span className="size-2 shrink-0 rounded-full bg-rose-500" />
          <span className="font-medium text-rose-700 dark:text-rose-300">Visszaküldve javításra</span>
        </div>
      )}
    </div>
  )
}

/** Szám-térkép? (pl. `income`, `expense`: kód → összeg) */
function szamTerkep(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const belepesek = Object.entries(v as Record<string, unknown>)
  if (belepesek.length === 0) return null
  if (!belepesek.every(([, ertek]) => typeof ertek === 'number' && Number.isFinite(ertek))) return null
  return Object.fromEntries(belepesek as Array<[string, number]>)
}

/**
 * A fagyasztott pillanatkép megjelenítése — SZÁNDÉKOSAN általános.
 *
 * MIÉRT NEM típusonkénti, kézzel formázott nézet: a megyei felküldő oldal a
 * saját pillanatképét bármikor bővítheti (új mező, új összesítő sor). Egy
 * szigorúan típusra szabott néző ilyenkor NÉMÁN elhagyná az új mezőt — a
 * kerület pedig kevesebbet látna, mint amit a megye felküldött. Ezért: minden
 * egyszerű mező kiírva, minden „kód → összeg" térkép táblázatban, a maradék
 * pedig nyers JSON-ként — semmi nem tűnhet el.
 */
function PillanatkepTartalom({ snap }: { snap: Record<string, unknown> }) {
  const belepesek = Object.entries(snap)
  const primitivek = belepesek.filter(
    ([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v),
  )
  const tablak = belepesek
    .map(([kulcs, v]) => ({ kulcs, terkep: szamTerkep(v) }))
    .filter((x): x is { kulcs: string; terkep: Record<string, number> } => x.terkep !== null)
  const tablaKulcsok = new Set(tablak.map((t) => t.kulcs))
  const maradek = belepesek.filter(
    ([kulcs, v]) =>
      !tablaKulcsok.has(kulcs) && v != null && !['string', 'number', 'boolean'].includes(typeof v),
  )

  if (belepesek.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        A felküldött pillanatkép üres. Ez akkor fordulhat elő, ha az egyházmegye a felküldéskor még
        nem rögzített adatot — ilyenkor érdemes az iratot javításra visszaküldeni.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {primitivek.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {primitivek.map(([k, v]) => (
                <tr key={k}>
                  <td className="p-2 text-xs text-muted-foreground">{k}</td>
                  <td className="p-2 text-right tabular-nums text-foreground">
                    {v == null ? '—' : typeof v === 'number' ? formatCurrency(v) : String(v)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tablak.map((t) => (
        <div key={t.kulcs}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t.kulcs}
          </p>
          {/* SAJÁT vízszintes görgető — az oldal törzse mobilon sem görgethet oldalra. */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[18rem] text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground">Kód</th>
                  <th className="p-2 text-right text-xs font-medium text-muted-foreground">
                    Összeg (RON)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.entries(t.terkep)
                  .sort((a, b) => a[0].localeCompare(b[0], 'hu'))
                  .map(([kod, osszeg]) => (
                    <tr key={kod}>
                      <td className="p-2 font-mono text-xs text-muted-foreground">{kod}</td>
                      <td className="p-2 text-right tabular-nums text-foreground">
                        {formatCurrency(osszeg)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {maradek.length > 0 && (
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            További felküldött részletek ({maradek.length})
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-2 text-xs text-foreground">
            {JSON.stringify(Object.fromEntries(maradek), null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Nyomtatvány (A4 .sheet, printToBrowser) — a dokumentumközpont sémájára
// ─────────────────────────────────────────────────────────────────────────────

function escHtml(v: string): string {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function buildFelterjesztesPrintHtml(
  sor: KeruletiFelterjesztesSor,
  snap: Record<string, unknown>,
): string {
  const cimke = iratCimke(sor.docType, sor.modificationNumber)
  const megye = megyeNev(sor.dioceseName)
  const metaSorok: Array<[string, string]> = [
    ['Egyházmegye', megye],
    ['Irat', cimke],
    ['Év', `${sor.year}.`],
    ['Állapot', (ALLAPOT_UI[sor.status] || ALLAPOT_UI.draft).label],
    ['Iktatószám', sor.iktatoszam || '—'],
    ['Felküldve', datum(sor.submittedAt)],
    ['Átvéve a kerületben', datum(sor.receivedAt)],
  ]

  const belepesek = Object.entries(snap)
  const primitivek = belepesek.filter(
    ([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v),
  )
  const tablak = belepesek
    .map(([kulcs, v]) => ({ kulcs, terkep: szamTerkep(v) }))
    .filter((x): x is { kulcs: string; terkep: Record<string, number> } => x.terkep !== null)

  const primitivBlokk =
    primitivek.length > 0
      ? `<h2>Felküldött adatok</h2>
      <table><tbody>
        ${primitivek
          .map(
            ([k, v]) =>
              `<tr><td>${escHtml(k)}</td><td class="num">${escHtml(
                v == null ? '—' : typeof v === 'number' ? formatCurrency(v) : String(v),
              )}</td></tr>`,
          )
          .join('')}
      </tbody></table>`
      : ''

  const tablaBlokk = tablak
    .map(
      (t) => `<h2>${escHtml(t.kulcs)}</h2>
      <table>
        <thead><tr><th>Kód</th><th class="num">Összeg (RON)</th></tr></thead>
        <tbody>
          ${Object.entries(t.terkep)
            .sort((a, b) => a[0].localeCompare(b[0], 'hu'))
            .map(
              ([kod, osszeg]) =>
                `<tr><td>${escHtml(kod)}</td><td class="num">${escHtml(formatCurrency(osszeg))}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>`,
    )
    .join('')

  const visszakuldesBlokk = sor.returnedReason
    ? `<h2>Visszaküldés indoklása</h2><pre class="notes">${escHtml(sor.returnedReason)}</pre>`
    : ''

  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8" />
<title>${escHtml(cimke)} — ${escHtml(megye)} (${sor.year})</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1c2430; margin: 0; background: #e2e8f0; padding: 18px 0; }
  .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 16mm 18mm; page-break-after: always; }
  .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
  @media print { body { background: #fff; padding: 0; } .sheet { margin: 0; box-shadow: none; min-height: 296mm; } }
  .head { border-bottom: 3px double #4c5a7a; padding-bottom: 8px; }
  .head .eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: .2em; color: #64748b; }
  .head h1 { margin: 3px 0 0; font-size: 20px; color: #1e2a4a; }
  .head .sub { margin-top: 2px; font-size: 12px; font-style: italic; color: #64748b; }
  .meta { margin-top: 12px; width: 100%; border-collapse: collapse; }
  .meta td { padding: 3px 0; font-size: 12px; border-bottom: 1px dotted #cbd5e1; }
  .meta td:first-child { width: 46mm; color: #64748b; font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; }
  h2 { margin: 16px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .16em; color: #4c5a7a; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 3px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #64748b; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .notes { white-space: pre-wrap; font-family: inherit; font-size: 11.5px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
  .foot { margin-top: 14mm; display: flex; justify-content: space-between; font-size: 9.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }
</style>
</head>
<body data-sheet-count="1">
  <div class="sheet">
    <div class="head">
      <p class="eyebrow">Kartotéka — egyházmegyei felterjesztés</p>
      <h1>${escHtml(cimke)} — ${sor.year}. év</h1>
      <p class="sub">${escHtml(megye)}</p>
    </div>
    <table class="meta">
      <tbody>
        ${metaSorok.map(([k, v]) => `<tr><td>${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`).join('')}
      </tbody>
    </table>
    ${primitivBlokk}
    ${tablaBlokk}
    ${visszakuldesBlokk}
    <div class="foot">
      <span>Nyomtatva: ${escHtml(new Date().toLocaleDateString('hu-HU'))}</span>
      <span>Kartotéka — egyházkerületi fogadó felület</span>
    </div>
  </div>
</body>
</html>`
}
