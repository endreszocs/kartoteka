'use client'

/**
 * SZINKRON-JELZŐ A FEJLÉCBEN (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIT VÁLT KI, ÉS MIÉRT
 * ════════════════════════════════════════════════════════════════════════════
 * A jelző korábban egy `fixed top-2 right-2 z-50` lebegő pirula volt, a
 * `(dashboard)` layout gyökerében, a fejlécen KÍVÜL renderelve. A fejléc
 * `sticky top-0 z-30 h-16`, a jobb oldali ikonsora (súgó, harang, avatár)
 * függőlegesen középen: a pirula PONTOSAN rájuk került. Mivel nem volt rajta
 * `pointer-events-none`, nem csak eltakarta őket — a kattintást is elnyelte.
 * Szinkron közben (ami időkorlát híján akár örökké tarthatott) a lelkész nem
 * érte el a súgót, az értesítéseket, a profilmenüt és a kijelentkezést.
 *
 * A megoldás SZERKEZETI, nem z-index-verseny: a jelző bekerült a fejléc jobb
 * oldali klaszterébe, a súgó-ikon ELÉ, ugyanolyan `size-10` gombként. A
 * normál flex-folyamban tördelődik, tehát fizikailag lehetetlen, hogy takarjon.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EGYESÍTÉS
 * ════════════════════════════════════════════════════════════════════════════
 * A képernyőn látott „két Szinkronizálás elem" ugyanannak a pirulának a két
 * része volt (felirat + gomb). A valódi szétszórtság mélyebb volt: öt felület
 * vezetett saját `useState(syncing)`-et. Mostantól mind a `useSyncStatus()`
 * hookból olvas — egy forrás, egy igazság.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * HOZZÁFÉRHETŐSÉG
 * ════════════════════════════════════════════════════════════════════════════
 * · 44px érintőfelület (`size-10` gomb + `p-1` a kattintható területen),
 * · állapotfüggő magyar `aria-label`, `aria-expanded`, `aria-haspopup`,
 * · Escape zár és VISSZAADJA a fókuszt a gombra,
 * · a panel `role="dialog"` + `aria-modal={false}`, fókusz a megnyitáskor,
 * · az élő régió KÜLÖN, vizuálisan rejtett elem — nem a teljes konténer, mert
 *   az minden számláló-változásnál újraolvastatná a képernyőolvasóval a benne
 *   lévő gombokat is,
 * · CSAK téma-tokenek: sötét módban is helyes, nincs hardkódolt paletta.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  CloudUpload,
  RefreshCw,
  WifiOff,
} from 'lucide-react'

import { useSyncStatus, type SyncAllapotKulcs } from '@/lib/offline/hooks/use-sync-status'

import { SyncStatusPanel } from './sync-status-panel'

/** A panel legnagyobb szélessége (rem) és a képernyő-perem (px). */
const PANEL_MAX_REM = 26
const PANEL_PEREM_PX = 8
/** Tartalék, ha a gyökér betűméret valamiért nem olvasható ki. */
const ALAP_REM_PX = 16

/** Állapotonkénti ikon + magyar aria-felirat. Sorrend: a legsúlyosabb nyer. */
const ALLAPOT_JEL: Record<
  SyncAllapotKulcs,
  { Ikon: React.ComponentType<{ className?: string }>; hangsuly: 'baj' | 'varakozik' | 'nyugodt' }
> = {
  visszaallitas: { Ikon: AlertTriangle, hangsuly: 'baj' },
  konfliktus: { Ikon: AlertTriangle, hangsuly: 'baj' },
  fentragadt: { Ikon: AlertTriangle, hangsuly: 'baj' },
  hiba: { Ikon: AlertTriangle, hangsuly: 'baj' },
  offline: { Ikon: WifiOff, hangsuly: 'varakozik' },
  folyamatban: { Ikon: RefreshCw, hangsuly: 'nyugodt' },
  varakozo: { Ikon: CloudUpload, hangsuly: 'varakozik' },
  // Ezen a profilon NEM készül helyi másolat — semleges jel, NEM zöld pipa.
  nincs_szinkron: { Ikon: CloudOff, hangsuly: 'varakozik' },
  rendben: { Ikon: CheckCircle2, hangsuly: 'nyugodt' },
}

export function SyncStatusButton() {
  const allapot = useSyncStatus()
  const [nyitva, setNyitva] = useState(false)
  const gombRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const [poz, setPoz] = useState<{ top: number; right: number; szelesseg: number } | null>(null)

  /**
   * A PANEL HELYE MÉRÉSSEL, NEM TIPPELVE.
   *
   * ⚠️ HÁROM CSAPDA VAN ITT, MINDHÁROM VALÓS:
   *  1. A fejlécen `backdrop-blur-2xl` van. A `backdrop-filter` (a `filter`-hez
   *     és a `transform`-hoz hasonlóan) TARTALMAZÓ BLOKKOT hoz létre a `fixed`
   *     pozíciójú leszármazottaknak — vagyis egy „képernyőhöz rögzített" panel
   *     valójában a fejléchez rögzülne. Ezért a panel PORTÁLLAL a `body`-ba
   *     kerül.
   *  2. A fejléc NEM mindig a képernyő tetején van: fölötte megjelenhet a
   *     rendszergazdai mód sávja vagy az átvételi sáv. Ezért nem írhatunk be
   *     rögzített `top` értéket — a gomb VALÓDI helyéből számolunk.
   *  3. ⚠️ 2026-08-11 — A BAL SZÉLT IS VÉDENI KELL. A `right` a GOMB jobb
   *     széléhez igazít, a gomb viszont NEM a képernyő szélén van: mögötte ott a
   *     harang és az avatár (~116-156 px). Egy `Math.max(8, …)` csak a JOBB
   *     szélt óvja. Telefonon (320/375/430 px) a panel majdnem teljes szélességű,
   *     tehát a bal éle a képernyőn KÍVÜLRE, negatív koordinátára csúszott: a
   *     címek, az ikonok és a „Szinkronizálás most" gomb eleje levágódott és
   *     elérhetetlen lett. A lelkész fő eszköze a telefon — ez az (1) kérés fő
   *     szállítmánya, tehát a `right`-nek FELSŐ korlátja is van.
   *
   * A szélességet SZÁNDÉKOSAN itt számoljuk (nem CSS `min()`-nel): a korlátozás
   * csak akkor helyes, ha a mérés és a megjelenítés UGYANABBÓL a számból dolgozik.
   * Két külön forrás (CSS `min()` + JS `Math.min()`) előbb-utóbb széthúzna — a
   * `rem` alapját a felhasználó böngésző-beállítása is eltolhatja.
   *
   * A panel csak akkor renderel, ha már van mérés — így nincs egy képkockányi
   * ugrás rossz helyen.
   */
  useEffect(() => {
    if (!nyitva) return
    let megszakitva = false
    function merj() {
      const r = gombRef.current?.getBoundingClientRect()
      if (!r || megszakitva) return
      const vw = window.innerWidth
      const rem =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || ALAP_REM_PX
      // Mobilon szinte teljes szélesség, asztali gépen 26rem.
      const szelesseg = Math.round(
        Math.min(PANEL_MAX_REM * rem, vw - 2 * PANEL_PEREM_PX),
      )
      // A gombhoz igazított `right`… (alsó korlát: ne lógjon ki jobbra)
      const gombhoz = Math.max(PANEL_PEREM_PX, Math.round(vw - r.right))
      // …de legfeljebb annyi, hogy a BAL él is a képernyőn maradjon.
      const legnagyobb = Math.max(PANEL_PEREM_PX, vw - szelesseg - PANEL_PEREM_PX)
      setPoz({
        top: Math.round(r.bottom + PANEL_PEREM_PX),
        right: Math.min(gombhoz, legnagyobb),
        szelesseg,
      })
    }
    // A setState nem futhat szinkron az effect törzsében (React 19).
    queueMicrotask(merj)
    window.addEventListener('resize', merj)
    // `capture`: a görgetés bármelyik szülő-konténerben történhet.
    window.addEventListener('scroll', merj, true)
    return () => {
      megszakitva = true
      window.removeEventListener('resize', merj)
      window.removeEventListener('scroll', merj, true)
    }
  }, [nyitva])

  /** Nyitás/zárás. A mérést MINDIG eldobjuk, hogy a panel sose villanjon fel
   *  egy korábbi, elavult helyen. */
  function valt() {
    setPoz(null)
    setNyitva((v) => !v)
  }

  // Escape + kattintás a panelen kívülre → zárás, a fókusz VISSZA a gombra.
  useEffect(() => {
    if (!nyitva) return

    function billentyu(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setNyitva(false)
        gombRef.current?.focus()
      }
    }
    function kattintas(e: MouseEvent) {
      const cel = e.target as Node
      if (panelRef.current?.contains(cel)) return
      if (gombRef.current?.contains(cel)) return
      setNyitva(false)
    }

    document.addEventListener('keydown', billentyu)
    // `capture` nélkül, késleltetve: különben a megnyitó kattintás azonnal zárna.
    const id = window.setTimeout(() => document.addEventListener('mousedown', kattintas), 0)
    return () => {
      document.removeEventListener('keydown', billentyu)
      window.clearTimeout(id)
      document.removeEventListener('mousedown', kattintas)
    }
  }, [nyitva])

  // Megnyitáskor a panelre visszük a fókuszt (billentyűzetes használat).
  // A `poz` is függőség: a panel CSAK a mérés után kerül a DOM-ba, előtte a
  // `panelRef` még üres lenne.
  useEffect(() => {
    if (nyitva && poz) panelRef.current?.focus()
  }, [nyitva, poz])

  // SSR-biztonság: amíg nincs kliens-oldali mount, semleges gombot mutatunk.
  // (NEM `null`-t: a fejléc ikonsora ne ugráljon hidratáláskor.)
  const { Ikon, hangsuly } = ALLAPOT_JEL[allapot.mounted ? allapot.kulcs : 'rendben']
  const felirat = allapot.mounted ? ariaFelirat(allapot.kulcs, allapot.bontas.osszesVarakozo) : 'Szinkron állapota'

  return (
    <div className="relative">
      <button
        ref={gombRef}
        type="button"
        onClick={valt}
        // A fejléc súgó-gombjával AZONOS formanyelv (`size-10`, `rounded-[10px]`).
        className="relative inline-flex size-10 items-center justify-center rounded-[10px] bg-muted text-foreground transition hover:bg-muted/70"
        aria-label={felirat}
        title={felirat}
        aria-haspopup="dialog"
        aria-expanded={nyitva}
        aria-controls={nyitva ? panelId : undefined}
      >
        {/* A színt a burkoló `span` adja: a lucide-ikonok típusa itt csak
            `className`-t enged, a téma-tokent viszont inline stílusból kell
            vennünk (hardkódolt paletta TILOS — sötét módban is működnie kell). */}
        <span
          className="inline-flex items-center justify-center"
          style={{ color: hangsulySzin(hangsuly) }}
          aria-hidden
        >
          <Ikon
            className={`size-[17px] ${allapot.mounted && allapot.kulcs === 'folyamatban' ? 'animate-spin' : ''}`}
          />
        </span>
        {/* Számláló-pötty: csak ha tényleg van várakozó vagy ütköző munka. */}
        {allapot.mounted && (allapot.bontas.osszesVarakozo > 0 || allapot.bontas.conflict > 0) ? (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-[10px] font-semibold leading-4 tabular-nums"
            style={{
              background: 'var(--destructive)',
              color: 'var(--primary-foreground)',
            }}
            aria-hidden
          >
            {allapot.bontas.osszesVarakozo + allapot.bontas.conflict}
          </span>
        ) : null}
      </button>

      {/* ÉLŐ RÉGIÓ — külön, vizuálisan rejtett elem. Szándékosan NEM a gombon
          vagy a panelen: ott minden számláló-változás újraolvastatná a benne
          lévő interaktív elemeket is. */}
      <span className="sr-only" role="status" aria-live="polite">
        {allapot.mounted ? felirat : ''}
      </span>

      {/* PORTÁL a `body`-ba — lásd a mérés fenti magyarázatát (a fejléc
          `backdrop-filter`-e tartalmazó blokkot hozna létre). */}
      {nyitva && poz && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-modal={false}
              aria-label="Szinkronizálás — részletek"
              tabIndex={-1}
              style={{
                position: 'fixed',
                top: poz.top,
                right: poz.right,
                // A szélesség ugyanabból a mérésből jön, ami a `right`-et
                // korlátozta — lásd a `merj()` fenti magyarázatát.
                width: poz.szelesseg,
                maxHeight: `calc(100dvh - ${poz.top + PANEL_PEREM_PX}px)`,
              }}
              className={[
                'z-[60] flex flex-col overflow-hidden rounded-2xl border border-border',
                'bg-popover text-popover-foreground outline-none',
                'shadow-[0_28px_70px_-32px_rgba(28,42,38,0.55)]',
              ].join(' ')}
            >
              <SyncStatusPanel allapot={allapot} />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

/**
 * ⚠️ MIÉRT NEM `--accent` A „VÁRAKOZIK" SZÍNE. Az `--accent` világos témában
 * halvány arany (#f3c061): a `bg-muted` gombon ~1,7:1 — bukás. Az
 * `--accent-foreground` viszont MINDKÉT témában majdnem fekete, tehát SÖTÉT
 * módban bukna. Ezért a semleges `--foreground`-ot használjuk, ami mindkét
 * témában biztosan AA fölött van; az állapotot nem a szín hordozza, hanem az
 * IKON és a számláló (a WCAG szerint a szín amúgy sem lehet egyedüli jelzés).
 */
function hangsulySzin(hangsuly: 'baj' | 'varakozik' | 'nyugodt'): string {
  if (hangsuly === 'baj') return 'var(--destructive)'
  if (hangsuly === 'varakozik') return 'var(--foreground)'
  return 'var(--primary)'
}

function ariaFelirat(kulcs: SyncAllapotKulcs, varakozo: number): string {
  switch (kulcs) {
    case 'offline':
      return 'Nincs internet — a változások helyben mentődnek. Részletek megnyitása'
    case 'visszaallitas':
      return 'A rendszergazda visszaállított egy korábbi mentést — részletek megnyitása'
    case 'konfliktus':
      return 'Ütközés a szinkronban — részletek megnyitása'
    case 'hiba':
      return 'Szinkron hiba — részletek megnyitása'
    case 'fentragadt':
      return 'Van módosítás, ami nem ment fel — részletek megnyitása'
    case 'folyamatban':
      return 'Szinkronizálás folyamatban — részletek megnyitása'
    case 'varakozo':
      return `${varakozo} változás feltöltésre vár — részletek megnyitása`
    case 'nincs_szinkron':
      return 'Ezen a profilon nem készül helyi másolat — részletek megnyitása'
    case 'rendben':
      return 'Minden szinkronban van — részletek megnyitása'
  }
}
