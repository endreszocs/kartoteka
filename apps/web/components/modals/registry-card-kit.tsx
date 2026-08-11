'use client'

/**
 * KARTOTÉK-KARTON KÉSZLET (2026-08-11)
 * ─────────────────────────────────────────────────────────────────────────
 * A SZEMÉLYI (`member-details-dialog-v2.tsx`) és a CSALÁDI
 * (`family-details-dialog-refined.tsx`) karton KÖZÖS vizuális nyelve.
 *
 * MIÉRT LÉTEZIK: a két karton a `registry-cards-host.tsx`-ben EGYMÁS MELLETT,
 * két oszlopban jelenik meg. A lelkész mindkettőt egyszerre látja, ezért a
 * kettő közti bármilyen NYELVI eltérés (más fejléc-ritmus, más chip-geometria,
 * más üres állapot) nem változatosságnak, hanem hanyagságnak olvasódik.
 * A fegyelemre nem lehet építeni: ha a két karton külön-külön hordozza a saját
 * osztály-stringjeit, a KÖVETKEZŐ javításnál újra szétcsúsznak. Ezért minden
 * megosztott fogalom PONTOSAN EGY helyen — itt — van leírva.
 *
 * ⚠️ A stringek a családi kartonból származnak, BETŰRE. Ha itt módosítasz,
 * MINDKÉT karton változik — ez a lényeg, nem mellékhatás.
 *
 * ÁLLAPOT (2026-08-11, a rádrótozás után): MINDKÉT karton innen importál. A
 * családi karton privát `Pill`/`Section`/`TabButton`/`MemberPanel`/
 * `formatShortDate` másolatai törölve; a fülsáv, a görgető, a fejléc-króm, a
 * lábléc, a táblázat-keretek, az üres állapotok és az esemény-chip is innen jön.
 *
 * ⚑ SZÍN-ELTÉRÉSEK: NINCSENEK. A review három olyan pontot talált, ahol a
 *   személyi karton komponens-szinten tért el a családitól (`dark:text-accent`,
 *   `text-foreground/75`, `REGISTRY_TONES` `dark:` hármasa) — mindhárom
 *   AA-indoka valós volt, de mindhárom a MÁSIK oszlopot hagyta rosszul.
 *   Mindhárom a MEGOSZTOTT rétegbe került át (`packages/ui/src/themes.css` és
 *   `packages/ui/src/kartoteka.css`), így a két karton azonos osztályokkal,
 *   azonos színnel és AA-megfelelően renderel. Részletek a TXT.muted, a
 *   BTN.filled, a Pill és a REGISTRY_TONES kommentjében.
 *
 * ⚠️ A `TabBar` görgetés-jelzése (élhalványítás + aktív fül képbe görgetése)
 *   korábban „dokumentált eltérés" volt, mert csak a személyi kartonon élt.
 *   A rádrótozással MEGSZŰNT: a családi fülsáv is ez a komponens.
 *
 * ✅ 2026-08-11 — A rádrótozás által felszínre hozott KÉT ELTÉRÉS LEZÁRVA
 *   (tulajdonosi döntés: „a döntéseket a kérdéses részeknél rád bízom"):
 *   1. A családi befizetés-táblázat `max-h-72` beágyazott görgetője
 *      ELTÁVOLÍTVA — mindkét karton táblázata az EGY görgetőben nő.
 *      Indok: érintőképernyőn a dobozon belüli görgető csapda (a felhasználó
 *      a kartont húzná, de az ujja a táblázatba esik), ami szembemegy a
 *      projekt mobil-első elvével. A `thead` így a közös `TBL.thead`.
 *   2. A fejléc-szemöldök színe egységesen `text-primary` (volt: családi
 *      `text-primary/75`). Indok: 11px, NAGYBETŰS, ritkított — a karton
 *      legnehezebben olvasható szövege; halványítani rossz irány egy 55+
 *      éves, gyakran telefonon dolgozó felhasználónál.
 *
 * ⚠️ AMI SZÁNDÉKOSAN ELTÉR (és nem hiba):
 *   · Betöltés: a személyi karton a fejlécét azonnal rendereli és a törzset
 *     `SkeletonGrid`-eli; a családi fejléc a betöltött adatból ÉPÜL (név, cím,
 *     körzet), tehát nincs mit korán mutatni — ott az embléma-pulzus marad.
 *
 * ⛔ SEMMI ÜZLETI LOGIKA. Csak prezentáció.
 * ⛔ SEMMI HARDKÓDOLT HEX. Csak téma-token (`--primary`, `--accent`, …) vagy
 *    a `kartoteka.css` dark-rétegével ellenőrzött Tailwind-paletta-osztály.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Globe, MapPinCheck, MapPinOff, MapPinSearch, Phone, X } from 'lucide-react'

// Típus-import (futásidőben nulla): a térkép-állapot EGYETLEN forrása a
// `lib/members/directions.ts`. A készlet csak MEGJELENÍTI, nem dönt róla.
import type { AddressMapStatus } from '@/lib/members/directions'

// ═════════════════════════════════════════════════════════════════════════
// 1. TIPOGRÁFIA ÉS GOMB-ALAKOK
// ═════════════════════════════════════════════════════════════════════════

export const TXT = {
  /**
   * MINDEN másodlagos szöveg: label, hint, táblázat-fejléc, inaktív fül,
   * meta-próza, lábjegyzet.
   *
   * ⚑ 2026-08-11 (O1 LEZÁRVA — a review döntése): `text-muted-foreground`.
   *   Az AA-panasz valós volt (a régi `--muted-foreground` a Kerített kertben
   *   4,48:1 kártyán és 3,97:1 oldalháttéren), de a `text-foreground/75`-re
   *   váltás KOMPONENS-szinten oldotta volna meg — és mivel a családi karton
   *   `text-muted-foreground`-ot ír, a két oszlop MINDEN másodlagos szövege
   *   (köztük a két, pixelre azonos helyen álló lebegő X gomb) két különböző
   *   szürkében jelent volna meg. Pontosan ez az, ami ellen a tulajdonosi
   *   korrekció szólt.
   *   A javítás ezért a TOKEN-rétegben történt (`packages/ui/src/themes.css`):
   *   `--muted-foreground` mind a hat téma-blokkban AA-ra emelve —
   *   kert 5,53/5,26 · parókia 5,15/5,26 · zsoltáros 5,26/5,53 (világos/sötét,
   *   kártya-felületen), oldalháttéren mindenhol ≥ 4,84. Így MINDKÉT karton
   *   megfelel, azonos szürkével, nulla komponens-eltéréssel.
   */
  muted: 'text-muted-foreground',
  /** KIZÁRÓLAG a hiányzó érték „—" jele és a stornózott összeg. 5,60:1 ✅ */
  faint: 'text-foreground/70',
  /** Fejléc-szemöldök. A kartonon PONTOSAN EZ az egyetlen 0.24em tracking. */
  eyebrow: 'text-[11px] font-semibold uppercase tracking-[0.24em]',
  sectionTitle: 'font-heading text-base font-semibold text-foreground',
  cardTitle: 'font-heading text-3xl font-semibold leading-tight text-foreground sm:text-4xl',
  headline: 'font-heading text-lg text-foreground',
  tableHead: 'text-xs font-semibold uppercase tracking-wider',
} as const

// A `disabled:` pár MINDEN gombalakon rajta van: a kartonon több gomb is
// tiltott, amíg nincs mit menteni (megjegyzés, hozzájárulás) vagy amíg egy
// chunk töltődik (igazolás) — vizuális jelzés nélkül a lelkész csak annyit
// látna, hogy „nem történik semmi".
const BTN_DISABLED = 'disabled:pointer-events-none disabled:opacity-50'

export const BTN = {
  /** Semleges művelet (lábléc, szekció-lábléc). A családi lábléc alakja. */
  outline:
    `inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary/20 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${BTN_DISABLED}`,
  /** Figyelmeztető, adatmódosító művelet (a családi „Válás" gomb alakja). */
  caution:
    `inline-flex h-11 items-center gap-2 rounded-xl border border-amber-300 bg-card px-3 text-xs font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/50 motion-reduce:transition-none ${BTN_DISABLED}`,
  /**
   * A kartononként EGYETLEN kitöltött gomb (mindig utolsó a láblécben).
   * ⚑ 2026-08-11 (O3 LEZÁRVA): sötét módban a `bg-primary` + fehér
   *   `--primary-foreground` mind a HÁROM témában AA-bukás volt
   *   (kert 3,75 · parókia 3,77 · zsoltáros 3,55) — és ezek a „Mentés",
   *   „Bezárás", „Hozzájárulások mentése" gombok, tehát minden mentési út.
   *   A javítás a `themes.css` három `.dark` blokkjában van (világosabb
   *   `--primary` + sötét tinta `--primary-foreground`): most 6,87 / 6,91 /
   *   7,25 ✅, a világos módban 9,25 / 11,29 / 8,51 ✅ (változatlan).
   *   Komponens-szinten SEMMI nem változott — a családi karton is javul.
   */
  filled:
    `inline-flex h-11 items-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${BTN_DISABLED}`,
  /** Szekció-fejléc jobb oldali pirula-akciója (a családi „Új látogatás"). */
  sectionAction:
    `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${BTN_DISABLED}`,
} as const

// ═════════════════════════════════════════════════════════════════════════
// 2. FORMÁZÓK — a két kartonnak BETŰRE ugyanúgy kell írnia a számot és a dátumot
// ═════════════════════════════════════════════════════════════════════════

/**
 * 2026-08-11 (O2): egységes pénz-írásmód MINDKÉT kartonon.
 * A személyi karton eddig `240.00 RON`-t írt, a családi `240 RON`-t — a két
 * oszlop egymás mellett pontosan ettől olvasódott két külön terméknek.
 * Gyülekezeti járulékban nincs bani, a 0 tizedes a helyes.
 */
export function formatRon(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return `${new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 }).format(safe)} RON`
}

/**
 * SŰRŰ dátum (táblázat-cella, mobil kártyalista) — a családi karton alakja.
 * Pl. `2026. aug. 10.` Egy `w-28` (112px) oszlopba ez fér el, a hosszú alak nem.
 */
export function formatShortDate(value?: string | null): string {
  if (!value) return 'Ismeretlen'
  const normalized = value.includes('T') ? value : `${value}T00:00:00`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }).format(parsed)
}

/**
 * PRÓZA-dátum (Field-sor, korábbi házastárs) — pl. `2026. augusztus 10.`
 * Hiánynál `null`, hogy a hívó a közös „—" hiány-jelölést tudja renderelni
 * (a régi, beágyazott „Nincs rögzítve" stringek helyett).
 */
export function formatLongDate(value?: string | null): string | null {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value}T00:00:00`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' }).format(parsed)
}

// ═════════════════════════════════════════════════════════════════════════
// 3. SHELL — bezárás, görgető, fejléc-króm, fülsáv, lábléc
// ═════════════════════════════════════════════════════════════════════════

/**
 * LEBEGŐ bezáró gomb — MINDKÉT variánsban (sheet és panel) és MINDKÉT
 * kartonon ugyanott, ugyanakkora. 44px, safe-area-tudatos.
 *
 * ⛔ Az `ariaLabel`-t a `registry-cards-host.tsx` STRING-EGYEZÉSSEL keresi
 *    (fókusz-visszaállítás részleges záráskor) — betűre kell egyeznie a
 *    „Személyi karton bezárása" / „Családi karton bezárása" szöveggel.
 */
export function FloatingCloseButton({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  return (
    <div className="absolute right-3 z-30 flex items-center gap-2 [top:max(0.75rem,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-md backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        aria-label={ariaLabel}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

/**
 * AZ EGY GÖRGETŐ. Fejléc + fülsáv + törzs + lábléc mind BENNE van: a fejléc
 * elgörög, a fülsáv és a lábléc `sticky`-vel a helyén marad.
 * ⛔ Beágyazott görgetési régió SEHOL nincs — két oszlop, ami másképp görög,
 *    hibának olvasódik, és telefonon a scroller-a-scrollerben csapda.
 */
export function CardScroller({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
}

/** A fejléc három dekorrétege — a családi karton értékeivel, `aria-hidden`. */
export function CardHeaderChrome() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-12 size-44 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-12 -left-8 size-36 rounded-full bg-amber-200/35 blur-3xl dark:bg-amber-700/10" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-teal-500 to-amber-400" />
    </>
  )
}

/**
 * FÜLSÁV. `pr-16` MINDEN töréspontnál: e nélkül a végiggörgetett utolsó fül a
 * lebegő X alá kerülne, és egy koppintás BEZÁRNÁ a kartont.
 *
 * ⚑ 2026-08-11 (P2 #27 — MOBIL FELFEDEZHETŐSÉG): 320px-en a látható sáv
 *   320 − 8 (`pl-2`) − 64 (`pr-16`) = 248px, az öt fül együtt ~700px — vagyis
 *   kb. 1,8 fül látszik, és SEMMI nem jelezte, hogy van több. A billentyűs
 *   használó jól járt (a `.focus()` odagörget), az érintős nem.
 *   Két jelzés került be, a `nav` osztály-stringjének elmozdítása nélkül:
 *     1. ÉLHALVÁNYÍTÁS (`mask-image`) azon az oldalon, ahol tényleg van még
 *        tartalom — nem díszítés, hanem állapot; ha nincs túlcsordulás, nincs
 *        maszk sem, és a sáv bájtra a régi.
 *     2. Az AKTÍV fül automatikusan a képbe görög (`activeKey` változásakor),
 *        így egy fülváltás után a felhasználó látja, hol tart.
 *   ⚠️ A `mask-image` a görgető DOBOZÁHOZ tapad, nem a tartalomhoz — ezért a
 *      `pr-16` üres sávján akkor sem takar fület, amikor a sáv a végére ért.
 *
 * ✅ 2026-08-11 (a rádrótozás után): a családi fülsáv is EZ a komponens, tehát
 *    a korábban itt dokumentált eltérés megszűnt. A családi kartonon ez érdemi
 *    nyereség: ott ÖT fül van, köztük a hosszú „Családlátogatás" felirat.
 */
export function TabBar({
  ariaLabel,
  activeKey,
  children,
}: {
  ariaLabel: string
  /** Az aktív fül azonosítója — változásakor a fül a képbe görög. */
  activeKey?: string
  children: ReactNode
}) {
  const navRef = useRef<HTMLElement | null>(null)
  const [edge, setEdge] = useState<{ start: boolean; end: boolean }>({ start: false, end: false })

  const measure = useCallback(() => {
    const el = navRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const next = { start: el.scrollLeft > 4, end: el.scrollLeft < max - 4 }
    setEdge((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
  }, [])

  useEffect(() => {
    const el = navRef.current
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [measure])

  // ⚠️ MINDEN render után újramérünk. A fülök SZÁMA menet közben változhat (a
  //    „Hátralék" fül csak a részletek betöltése után jelenik meg), ilyenkor a
  //    `scrollWidth` nő, de a `nav` SAJÁT doboza nem — a ResizeObserver tehát
  //    nem sülne el, és a jelzés némán elavulna. A `measure` csak akkor hív
  //    `setEdge`-et, ha tényleg változott, tehát nincs render-hurok.
  useEffect(measure)

  useEffect(() => {
    const el = navRef.current
    if (!el || !activeKey) return
    const active = el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    if (active) {
      const reduceMotion =
        typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      // `block: 'nearest'` — a fülsáv `sticky`, függőlegesen SEMMIT nem
      // szabad mozdítani, különben a karton fejléce ugrana.
      active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
    }
    measure()
  }, [activeKey, measure])

  const mask =
    edge.start && edge.end
      ? 'linear-gradient(to right, transparent 0, #000 1.75rem, #000 calc(100% - 1.75rem), transparent 100%)'
      : edge.start
        ? 'linear-gradient(to right, transparent 0, #000 1.75rem)'
        : edge.end
          ? 'linear-gradient(to right, #000 calc(100% - 1.75rem), transparent 100%)'
          : undefined

  return (
    <nav
      ref={navRef}
      role="tablist"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-y border-border/60 bg-muted/30 pl-2 pr-16 backdrop-blur-md sm:pl-6 sm:pr-16"
    >
      {children}
    </nav>
  )
}

export type TabTone = 'default' | 'rose'

const TAB_BASE =
  'relative my-1.5 inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-semibold transition-all disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none sm:px-4 '

const TAB_BADGE_BASE = 'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold '

/**
 * FÜL-GOMB — a családi karton pixelei + a személyi karton teljes ARIA-ja
 * (role=tab, aria-selected, aria-controls, roving tabindex, nyílbillentyűk).
 * A `rose` tónus a VESZÉLY (hátralék) füle: a badge IDLE állapotban is rose,
 * mert a fülsáv az egyetlen króm, ami sosem görög el.
 */
export function TabButton({
  active,
  tone = 'default',
  onClick,
  onKeyDown,
  disabled,
  id,
  controls,
  icon,
  label,
  count,
}: {
  active: boolean
  tone?: TabTone
  onClick: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
  disabled?: boolean
  id: string
  controls: string
  icon: ReactNode
  label: string
  count?: number | null
}) {
  const isRose = tone === 'rose'
  const stateClasses = active
    ? isRose
      ? 'bg-background text-rose-700 shadow-sm ring-1 ring-border/60 dark:text-rose-300'
      : 'bg-background text-primary shadow-sm ring-1 ring-border/60'
    : `${TXT.muted} hover:bg-background/55 hover:text-foreground`
  const badgeClasses = isRose
    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
    : active
      ? 'bg-primary/10 text-primary'
      : `bg-muted ${TXT.muted}`

  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      tabIndex={active ? 0 : -1}
      disabled={disabled}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={TAB_BASE + stateClasses}
    >
      {icon}
      <span>{label}</span>
      {count != null && count > 0 && <span className={TAB_BADGE_BASE + badgeClasses}>{count}</span>}
      {active && (
        <span
          aria-hidden
          className={`absolute inset-x-4 -bottom-1.5 h-0.5 rounded-full ${isRose ? 'bg-rose-400' : 'bg-amber-400'}`}
        />
      )}
    </button>
  )
}

/**
 * FÜL-TÖRZS. `space-y-5` az EGYETLEN függőleges ritmus — a `Section` soha nem
 * visz saját margót. A `min-h-[360px]` megakadályozza, hogy a ragadós lábléc
 * ritka füleken felugorjon.
 */
export function TabPanel({
  id,
  labelledBy,
  busy,
  children,
}: {
  id: string
  labelledBy: string
  busy?: boolean
  children: ReactNode
}) {
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      aria-busy={busy}
      className="min-h-[360px] space-y-5 bg-background/70 px-4 py-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-reduce:animate-none sm:px-6 sm:py-6 [@media(max-height:600px)]:py-3"
    >
      {children}
    </div>
  )
}

/** RAGADÓS LÁBLÉC — a görgetőn BELÜL, safe-area alsó paddinggel. */
export function CardFooter({ summary, children }: { summary?: ReactNode; children: ReactNode }) {
  return (
    <footer className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-border/70 bg-card/95 px-4 pt-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-14px_30px_-26px_rgba(15,67,61,0.7)] backdrop-blur-md sm:px-6 [@media(max-height:600px)]:pt-1.5 [@media(max-height:600px)]:[padding-bottom:max(0.25rem,env(safe-area-inset-bottom))]">
      {summary ? <p className={`hidden text-xs sm:block ${TXT.muted}`}>{summary}</p> : null}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2 overflow-x-auto">{children}</div>
    </footer>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// 4. TARTALOM-PRIMITÍVEK
// ═════════════════════════════════════════════════════════════════════════

export type PillTone = 'slate' | 'primary' | 'amber' | 'emerald' | 'rose'

/**
 * ÁLLAPOT-PIRULA. A `rose` tónus a családi kartonban DEFINIÁLVA volt, de soha
 * nem használva — most kap jelentést: TARTOZÁS / felbontott kötelék.
 *
 * MÉRT arányok (Kerített kert, kártya-felület) — világos / sötét:
 *   slate    14,91 / 10,79 ✅   primary  8,12 / 5,35 ✅
 *   amber     4,76 /  8,16 ✅   emerald  5,09 / 8,10 ✅   rose 5,51 / 6,88 ✅
 * (A `primary` sötét értéke a 2026-08-11-i `--primary` token-emelésből jön —
 *  lásd `packages/ui/src/themes.css`. Korábban 3,61:1 volt, AA-bukás.)
 *
 * ⚠️ A `dark:text-*-300` hármas KÖTELEZŐ az emerald/rose/amber tónuson: a
 *    `kartoteka.css` legacy dark-rétege csak egy részüket írja át, a maradék
 *    e nélkül olvashatatlan sötét szöveg lenne sötét kártyán.
 * ⚠️ A `slate` tónus SZÁNDÉKOSAN token-alapú (`bg-card text-foreground`) —
 *    a csupasz slate-paletta dark-felülírását `!important` védi.
 */
export function Pill({
  icon,
  tone,
  title,
  ariaLabel,
  children,
}: {
  icon?: ReactNode
  tone: PillTone
  /** Egérrel megjelenő teljes mondat. */
  title?: string
  /**
   * Képernyőolvasónak KIMONDOTT teljes mondat. Ha megadod, a pirula
   * `role="img"`-gé válik, és a felolvasó EZT mondja a rövid címke helyett —
   * ezért az `ariaLabel` legyen önmagában érthető, ne csak a címke ismétlése.
   */
  ariaLabel?: string
  children: ReactNode
}) {
  const TONES: Record<PillTone, string> = {
    slate: 'border-border bg-card text-foreground',
    primary: 'border-primary/15 bg-primary/8 text-primary',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300',
    rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${TONES[tone]}`}
      title={title}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      {icon}
      {children}
    </span>
  )
}

/**
 * TÉRKÉP-ÁLLAPOT PIRULA (2026-08-11 — a tulajdonos kérése: „legyen egy kis
 * ikon, ami mutatja, hogy ezt a címet a Maps tudja kezelni").
 *
 * ⛔ NEM CSAK SZÍN. A színvak felhasználó a zöld/borostyán/rózsaszín/szürke
 *    négyesből SEMMIT nem lát, ezért mind a négy állapot KÜLÖN IKONALAKOT
 *    kap (pipa a gombostűben · nagyító · áthúzott gombostű · földgömb) ÉS
 *    külön feliratot is. A `title` (egér) és az `aria-label`
 *    (képernyőolvasó) ugyanazt a teljes magyar mondatot mondja.
 *
 * ⚑ 2026-08-11 — A NEGYEDIK ÁLLAPOT (`nem-ellenorizheto`) SEMLEGES, és ez a
 *   lényege. Ide esik minden külföldi (Budapest, Debrecen, Gödöllő, Győr,
 *   Hollandia) és minden ismeretlen országú cím. Ezekre PIROSAT mutatni a
 *   funkció legsúlyosabb bukási módja lenne: a lelkész tucatnyi hamis hibát
 *   kapna egy eddig megbízható jelzésrendszertől, és onnantól az egészet
 *   figyelmen kívül hagyná — az rosszabb, mint ha semmit nem jeleznénk.
 *   A földgömb SZÁNDÉKOSAN nem gombostű-variáns: a másik három egy pillantásra
 *   egy családba tartozik („a térkép hogy áll ezzel a ponttal"), ez pedig
 *   más kérdésre válaszol („nem is a mi hatáskörünk").
 *
 * A `status`/`label`/`detail` a `lib/members/directions.ts`
 * `assessAddressMap`-jéből jön — SEMMI üzleti döntés nincs itt, csak az
 * állapot → ikon/tónus leképezés. Így ugyanaz az egyetlen forrás dönt a
 * kartonon és a tagnyilvántartás Hibák fülén.
 */
export function AddressMapPill({
  status,
  label,
  detail,
}: {
  status: AddressMapStatus
  label: string
  detail: string
}) {
  if (status === 'nincs-cim') return null
  // ⚠️ `size-3.5` és nem a pirulák szokásos `size-3`-a: a többi pirulán az ikon
  //    DÍSZ (a szöveg mondja el a jelentést), itt viszont az IKONALAK maga a
  //    megkülönböztetés. 12px-en a pipa, a nagyító és az áthúzás egy 55+ éves
  //    szemnek, telefonon, változó fényben összemosódik — 14px-en már nem.
  const PRESENTATION: Record<
    Exclude<AddressMapStatus, 'nincs-cim'>,
    { tone: PillTone; icon: ReactNode }
  > = {
    megtalalhato: { tone: 'emerald', icon: <MapPinCheck className="size-3.5 shrink-0" aria-hidden /> },
    bizonytalan: { tone: 'amber', icon: <MapPinSearch className="size-3.5 shrink-0" aria-hidden /> },
    'nem-talalhato': { tone: 'rose', icon: <MapPinOff className="size-3.5 shrink-0" aria-hidden /> },
    // `slate` = token-alapú (`bg-card` + `text-foreground`), 14,91 / 10,79 ✅
    'nem-ellenorizheto': { tone: 'slate', icon: <Globe className="size-3.5 shrink-0" aria-hidden /> },
  }
  const { tone, icon } = PRESENTATION[status]
  return (
    <div className="space-y-1.5">
      <Pill tone={tone} icon={icon} title={detail} ariaLabel={detail}>
        {label}
      </Pill>
      {/* ⚠️ 2026-08-11 — A MAGYARÁZAT LÁTHATÓAN IS KI VAN RAJZOLVA.
          Korábban a `detail` (a cselekvésre küldő 1–3 mondat) KIZÁRÓLAG a
          `title`-ben és az `aria-label`-ben élt. A `title` érintőképernyőn
          soha nem jelenik meg (nincs hover), a pirula pedig nem fókuszálható,
          tehát billentyűzettel sem volt előhívható. Telefonon — ahol a lelkész
          a kartont a leggyakrabban nézi — ennyi látszott: „Nem ellenőrizhető",
          magyarázat és teendő nélkül. Egy 55+ éves, nem-informatikus olvasónak
          ez semmit nem mond. A ház szabálya kifejezett: mobil-első.
          A `title`/`aria-label` MEGMARAD kiegészítésként (egérre és
          képernyőolvasóra), de már nem ez az EGYETLEN hordozója a jelentésnek. */}
      <p className="text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  )
}

export type SectionAccent = 'primary' | 'amber' | 'emerald' | 'rose' | 'slate'

/**
 * SZEKCIÓ — a karton egyetlen tartalom-tartója. Az `accent` a FÜL kategória-
 * színe (Összefoglaló=primary · Anyakönyv=amber · Befizetések=emerald ·
 * Adatvédelem=slate · Hátralék=rose).
 *
 * ⚠️ NEVESÍTETT KIVÉTEL: a „Lelkipásztori megjegyzés" szekció MINDEN fülön
 *    amber — az amber „a lelkész keze", és a megjegyzés vizuálisan ugyanaz az
 *    objektum, bárhol jelenik meg.
 *
 * ⚠️ A `slate` chiphez TILOS `dark:` variánst írni: a `kartoteka.css`
 *    dark-rétege a `bg-slate-100`-at `var(--muted)`-re, a `text-slate-700`-et
 *    `var(--foreground)`-ra írja át `!important`-tal (10,10:1 ✅) — a `dark:`
 *    osztály nem tudna nyerni, csak színház lenne.
 *
 * `min-w-0` a cím-csoporton (2026-08-11): 320px-en a hosszú, összeg-tartalmú
 * szekciócím (pl. „Befizetések (12 tétel · 2 640 RON)") e nélkül kitolná az
 * akció-pirulát a kártyából. Ahol a cím elfér, nulla pixelt változtat.
 */
export function Section({
  title,
  icon,
  accent,
  action,
  footer,
  children,
}: {
  title: ReactNode
  icon: ReactNode
  accent: SectionAccent
  action?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  const ACCENT: Record<SectionAccent, { icon: string; text: string }> = {
    primary: { icon: 'bg-primary/10 text-primary', text: 'text-primary' },
    amber: { icon: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300', text: 'text-amber-700 dark:text-amber-300' },
    emerald: { icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300', text: 'text-emerald-700 dark:text-emerald-300' },
    rose: { icon: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300', text: 'text-rose-700 dark:text-rose-300' },
    slate: { icon: 'bg-slate-100 text-slate-700', text: 'text-slate-700' },
  }
  const tone = ACCENT[accent]

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
      {/* 2026-08-11: `flex-wrap` + `min-w-[12rem] flex-1` a cím-csoporton.
          320px-en a szekció belső szélessége 256px — egy hosszú, összeg-tartalmú
          cím MELLETT egy ~187px-es akció-pirula különben 21px-re szorítaná a
          címet. Így a pirula inkább új sorba kerül. Ahol elfér (≈ minden
          nagyobb szélesség és a családi karton minden szekciója), 0 pixel
          változás: a `justify-between` úgyis jobbra tolta az akciót. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className={`flex min-w-[12rem] flex-1 items-center gap-2.5 ${tone.text}`}>
          <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>{icon}</span>
          <h3 className={`${TXT.sectionTitle} min-w-0 break-words`}>{title}</h3>
        </div>
        {action}
      </div>
      {children}
      {footer ? <div className="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-3">{footer}</div> : null}
    </section>
  )
}

export type SubBlockTone = 'amber' | 'slate' | 'primary'

/**
 * AL-BLOKK a szekción belül (a családi „Gyermekek" blokk formalizálva).
 * ⛔ PONTOSAN KÉT SZINT VAN: Section → SubBlock. Harmadik nincs.
 */
export function SubBlock({
  icon,
  tone = 'slate',
  title,
  children,
}: {
  icon: ReactNode
  tone?: SubBlockTone
  title: string
  children: ReactNode
}) {
  const CHIP: Record<SubBlockTone, string> = {
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    // ⚠️ slate: NINCS `dark:` — lásd a Section kommentjét.
    slate: 'bg-slate-100 text-slate-700',
    primary: 'bg-primary/10 text-primary',
  }
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg ${CHIP[tone]}`}>{icon}</span>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      {children}
    </div>
  )
}

/**
 * SZAGGATOTT BLOKK — „kapcsolódik, kontextusként mutatjuk, de NEM számít bele".
 * A családi karton „Felnőtt gyermekek" blokkja pontosan erre az esetre
 * született; a személyi kartonon a KORÁBBI HÁZASTÁRS ugyanez az eset.
 *
 * ⚑ 2026-08-11 (a családi karton rádrótozásakor): `titleNote` — a cím MELLETT
 *   álló, halvány magyarázó félmondat. A családi karton „Felnőtt gyermekek"
 *   blokkja ezt már a kiemelés előtt is viselte („— saját háztartásban élnek"),
 *   csak a készletbe nem került át; nélküle a rádrótozás NÉMÁN elnyelte volna
 *   azt a mondatot, ami megmagyarázza, MIÉRT külön blokk ez. A `footnote` nem
 *   pótolja: az a blokk ALJÁN, teljes mondatban áll. Elhagyva 0 pixel változás.
 */
export function DashedBlock({
  icon,
  title,
  titleNote,
  footnote,
  children,
}: {
  icon: ReactNode
  title: string
  /** Halvány félmondat a cím mellett — pl. „— saját háztartásban élnek". */
  titleNote?: ReactNode
  footnote?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/30 p-4">
      <div className="mb-2 flex items-center gap-2">
        {/* ⚠️ slate chip — `dark:` TILOS (lásd a Section kommentjét). */}
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">{icon}</span>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {titleNote ? <span className={`text-xs ${TXT.muted}`}>{titleNote}</span> : null}
      </div>
      {children}
      {footnote ? <p className={`mt-2 text-xs leading-5 ${TXT.muted}`}>{footnote}</p> : null}
    </div>
  )
}

export type RolePillTone = 'amber' | 'primary' | 'slate'

/**
 * SZEMÉLY-PANEL — a családi karton `MemberPanel`-jének prezentációs változata.
 * A TELJES kártya a kattintható célpont (44px-nél nagyságrenddel nagyobb),
 * nem egy apró chevron.
 */
export function MemberPanel({
  avatar,
  roleIcon,
  roleLabel,
  roleTone,
  name,
  deceased,
  meta,
  phone,
  onOpen,
  openAriaLabel,
  highlighted,
}: {
  avatar: ReactNode
  roleIcon: ReactNode
  roleLabel: string
  roleTone: RolePillTone
  name: string
  deceased?: boolean
  meta: string
  phone?: string | null
  onOpen?: () => void
  openAriaLabel?: string
  /** „Ő maga" — a saját panel nem kattintható, hanem kiemelt. */
  highlighted?: boolean
}) {
  const ROLE: Record<RolePillTone, string> = {
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
    primary: 'border-primary/15 bg-primary/8 text-primary',
    slate: 'border-border bg-card text-foreground',
  }
  const interactive = Boolean(onOpen) && !highlighted
  // A hover-emelés CSAK akkor jár, ha a kártya tényleg megnyit valamit —
  // különben hazug affordancia lenne (a kartonon van olyan roster, amelyhez
  // nincs megnyitási útvonal).
  const panelClass = [
    'group relative overflow-hidden rounded-2xl border border-border/70 p-4 text-left shadow-sm transition-all motion-reduce:transition-none',
    highlighted ? 'bg-primary/5 ring-1 ring-primary/15' : 'bg-card',
    interactive ? 'hover:border-primary/20 hover:shadow-md motion-safe:hover:-translate-y-0.5' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={panelClass}>
      {interactive && (
        <button
          type="button"
          onClick={onOpen}
          className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          title="Személyi karton megnyitása"
          aria-label={openAriaLabel}
        />
      )}
      <div className="pointer-events-none relative z-10 flex items-start gap-3">
        <div className="relative shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE[roleTone]}`}>
            {roleIcon}
            {roleLabel}
          </span>
          <h4 className={`mt-1 text-base font-semibold leading-snug ${deceased ? `${TXT.muted} line-through` : 'text-foreground'}`}>
            {deceased && '† '}
            {name}
          </h4>
          <p className={`mt-1 text-xs leading-relaxed ${TXT.muted}`}>{meta}</p>
          {phone && (
            // A családi karton itt NEM linkel (linknek stílusozott, de halott
            // szöveg) — a személyi kartoné VALÓDI `tel:` link, és az a helyes:
            // a lelkész pontosan innen hívja fel a tagot. Azonos szín, azonos
            // ikon, csak működik is. 44px-es érintési magasság.
            <a
              href={`tel:${phone}`}
              className="pointer-events-auto mt-1.5 inline-flex min-h-11 items-center gap-1 rounded-lg text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${name} telefonszáma: ${phone}`}
            >
              <Phone className="size-3" aria-hidden />
              {phone}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

/** SZEMÉLY-SOR — a családi gyermek-lista sora. Kattintható vagy statikus. */
export function PersonRow({
  avatar,
  name,
  deceased,
  trailing,
  onClick,
  ariaLabel,
}: {
  avatar: ReactNode
  name: string
  deceased?: boolean
  trailing?: ReactNode
  onClick?: () => void
  ariaLabel?: string
}) {
  // Hover-visszajelzés csak valódi célpontnál (lásd a MemberPanel kommentjét).
  const className = [
    'flex min-h-11 items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 text-left text-sm',
    onClick
      ? 'motion-safe:transition motion-safe:hover:-translate-y-px hover:border-primary/10 hover:bg-primary/5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none'
      : '',
    deceased ? `${TXT.muted} line-through` : 'text-foreground',
  ]
    .filter(Boolean)
    .join(' ')
  const content = (
    <>
      {avatar}
      <span className="min-w-0 truncate">
        {deceased && '† '}
        {name}
      </span>
      {trailing ? <span className={`ml-auto shrink-0 text-xs ${TXT.muted}`}>{trailing}</span> : null}
    </>
  )
  if (!onClick) return <div className={className}>{content}</div>
  return (
    <button type="button" onClick={onClick} className={className} aria-label={ariaLabel} title="Személyi karton megnyitása">
      {content}
    </button>
  )
}

// ── Anyakönyvi esemény-chip ──────────────────────────────────────────────

export type RegistryKind = 'keresztseg' | 'konfirmalas' | 'hazassag' | 'bekoltozott' | 'attert' | 'temetes'

/**
 * Az anyakönyvi esemény-chip TÓNUSAI.
 * BÁJTRA egyeznek a családi karton `REGISTRY_TYPE_META` értékeivel — világos
 * ÉS sötét módban egyaránt, mert egyik oldalon sincs `dark:` variáns.
 *
 * ⚑ 2026-08-11 (a review 5. pontja): korábban itt `dark:` hármas állt
 *   (`dark:bg-blue-950/40 dark:text-blue-300 …`), a családi kartonon viszont
 *   nem — így sötétben UGYANAZ a chip a két oszlopban teljesen másképp
 *   nézett ki (bal: sötét tónusos pirula, jobb: világító, majdnem fehér).
 *   A `dark:` hármas TÖRÖLVE, a hiányzó sötét-mód pedig a `kartoteka.css`
 *   legacy `.dark` rétegében pótolva (`bg-blue-50`, `bg-teal-50`,
 *   `text-blue-700`, `text-emerald-700`, `text-teal-700`) — így MINDKÉT
 *   karton egyszerre javul, nulla komponens-eltéréssel.
 *   MÉRT (sötét, chip-háttéren): Keresztelő 7,31 · Konfirmáció 8,06 ·
 *   Esketés 6,99 · Beköltözött 8,33 · Áttért 8,19 ✅
 *   MÉRT (világos, változatlan): 6,16 · 5,21 · 5,72 · 5,25 · 4,84 · 9,45 ✅
 * ⚠️ `temetes`: csupasz slate — a legacy réteg `!important`-tal helyesre írja.
 */
export const REGISTRY_TONES: Record<RegistryKind, string> = {
  keresztseg: 'bg-blue-50 text-blue-700 border-blue-200',
  konfirmalas: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  hazassag: 'bg-rose-50 text-rose-700 border-rose-200',
  bekoltozott: 'bg-teal-50 text-teal-700 border-teal-200',
  attert: 'bg-amber-50 text-amber-700 border-amber-200',
  temetes: 'bg-slate-100 text-slate-700 border-slate-300',
}

/**
 * Az esemény-feliratok a CSALÁDI karton szóhasználatával (O4).
 * A személyi karton eddig „Keresztelés"/„Esküvő"-t írt — ugyanaz a színes chip
 * két különböző szóval a két oszlopban látható következetlenség volt.
 */
export const REGISTRY_LABELS: Record<RegistryKind, string> = {
  keresztseg: 'Keresztelő',
  konfirmalas: 'Konfirmáció',
  hazassag: 'Esketés',
  bekoltozott: 'Beköltözött',
  attert: 'Áttért',
  temetes: 'Temetés',
}

/**
 * STORNÓ-jelölés — a kartonon EGY írásmód: rose chip + áthúzott, halványított
 * összeg. ⛔ `opacity-60/70` NEM használható rá (2,62:1); a `text-foreground/70`
 * áthúzással ugyanazt mondja 5,60:1-nél.
 * (2026-08-11: a családi befizetés-táblázat is erre állt át — ott korábban a
 * TELJES sor `opacity-70`-es volt, tehát a stornó ténye pont azt tette
 * olvashatatlanná, amit el kellett volna olvasni.)
 */
export const STORNO_CHIP =
  'ml-2 inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'

export function RegistryChip({ kind, icon, children }: { kind: RegistryKind; icon: ReactNode; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${REGISTRY_TONES[kind]}`}>
      {icon}
      {children ?? REGISTRY_LABELS[kind]}
    </span>
  )
}

// ── Label + érték párok ──────────────────────────────────────────────────

/**
 * HIÁNYZÓ ÉRTÉK — a kartonon EGYETLEN írásmód. A régi ~14 beágyazott
 * „Nincs rögzítve" string helyett: „—" + képernyőolvasónak kimondott szöveg.
 * A hiány TÉNYE a fejléc „Hiányzó adatok" dobozában van, egy helyen.
 */
export function Dash() {
  return (
    <span className={TXT.faint} title="Nincs rögzítve">
      —<span className="sr-only"> nincs rögzítve</span>
    </span>
  )
}

/**
 * A családi kartonnak nincs label+érték primitívje (csak táblázata), a
 * személyinek ~15 párja van. A geometria a családi `<th>`/`<td>` típuspárjából
 * jön: 12px label / 14px érték, `divide-y divide-border/70` elválasztó.
 * 320px-en EGYOSZLOPOS (label az érték felett) — hosszú cím sosem csonkul.
 */
export function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border/70">{children}</div>
}

export function Field({
  icon,
  label,
  value,
  mono,
}: {
  icon?: ReactNode
  label: string
  value: ReactNode
  /** Személyi szám / bizonylat — `font-mono tabular-nums`. */
  mono?: boolean
}) {
  return (
    <div className="grid gap-1 py-2.5 text-sm sm:grid-cols-[minmax(9rem,0.6fr)_minmax(0,1fr)] sm:gap-5">
      <span className={`flex items-center gap-2 ${TXT.muted}`}>
        {icon && (
          <span className="text-primary" aria-hidden>
            {icon}
          </span>
        )}
        {label}
      </span>
      <span className={`break-words font-medium text-foreground sm:text-right ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value}
      </span>
    </div>
  )
}

/**
 * LINK-SOR (telefon / e-mail / lakcím). A csempe a Section-chip receptje egy
 * szinttel lejjebb; a hover a ház univerzális `hover:bg-primary/5`-e.
 */
export function LinkRow({
  icon,
  label,
  value,
  href,
  external,
}: {
  icon: ReactNode
  label: string
  value: string | null
  href: string | null
  external?: boolean
}) {
  const className =
    'grid min-h-12 grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 rounded-xl py-2.5 transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:grid-cols-[2rem_minmax(0,1fr)_auto]'
  const content = (
    <>
      <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 break-words text-sm font-medium text-foreground">{value ?? <Dash />}</span>
      <span className={`col-start-2 text-xs sm:col-start-3 sm:row-start-1 ${TXT.muted}`}>{label}</span>
    </>
  )
  if (!href || !value) return <div className={className}>{content}</div>
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={className}
    >
      {content}
    </a>
  )
}

/**
 * GYORSMŰVELET-CSEMPE a fejlécben. A hiányzó változat SZAGGATOTT szegélyt kap
 * (a családi karton saját hiány-jelölése) a korábbi `opacity-55` (~2,5:1)
 * halványítás helyett — a rács 3 oszlopos marad, hogy ne ugráljon a layout.
 * 320px-en: (288 − 16) / 3 = 90,7px csempénként, bőven 44px fölött.
 */
export function LinkTile({
  icon,
  label,
  href,
  external,
}: {
  icon: ReactNode
  label: string
  href: string | null
  external?: boolean
}) {
  if (!href) {
    return (
      <span
        className={`inline-flex min-h-11 min-w-0 cursor-not-allowed items-center justify-center gap-1.5 rounded-full border border-dashed border-border bg-muted/40 px-3 text-xs font-medium ${TXT.muted}`}
        aria-disabled="true"
        title="Nincs rögzítve"
      >
        {icon}
        <span className="truncate">{label}</span>
        <span className="sr-only"> — nincs rögzítve</span>
      </span>
    )
  }
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-full border border-primary/15 bg-primary/8 px-3 text-xs font-medium text-primary shadow-sm transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      {icon}
      <span className="truncate">{label}</span>
    </a>
  )
}

/**
 * IDÉZET-BLOKK — a családi karton legjellegzetesebb, azonnal felismerhető
 * eleme (ott az alapige, itt a lelkipásztori megjegyzés).
 *
 * ⚑ 2026-08-11 (a családi karton rádrótozásakor): `spaced` — felső levegő.
 *   A személyi kartonon a blokk a szekció ELSŐ eleme, tehát margó nélkül ül;
 *   a családi látogatás-kártyán viszont egy dátum-sor UTÁN jön, és ott eddig
 *   `mt-1.5`-tel állt. Ez a doboz-KÖRNYEZET különbsége, nem az idézeté —
 *   ezért prop, nem külön alak. Elhagyva 0 pixel változás.
 */
export function QuoteBlock({ children, spaced }: { children: ReactNode; spaced?: boolean }) {
  return (
    <p
      className={`whitespace-pre-line rounded-lg bg-primary/5 px-2.5 py-2 text-sm italic text-primary${spaced ? ' mt-1.5' : ''}`}
    >
      <span className="text-amber-500" aria-hidden>
        „
      </span>
      {children}
      <span className="text-amber-500" aria-hidden>
        ”
      </span>
    </p>
  )
}

/**
 * TÁBLÁZAT-RECEPT. Nem komponens, hanem osztály-készlet: a három táblázat
 * (anyakönyv / befizetés / hátralék) tartalma túl különböző egy közös
 * komponenshez, de a KERETÜKNEK bájtra egyeznie kell — egymással és a családi
 * kartonéval is.
 * ⛔ A duál render töréspontja MINDENHOL `sm` (640px), nem `lg`: `lg`-nél a
 *    duál nézetben egy oszlop csak ~28rem, ott a táblázat nem férne el.
 */
export const TBL = {
  wrapper: 'overflow-hidden rounded-xl border border-border bg-card shadow-sm',
  desktop: 'hidden overflow-x-auto sm:block',
  table: 'w-full text-sm',
  thead: `bg-muted/70 text-left ${TXT.tableHead} ${TXT.muted}`,
  th: 'px-3 py-2',
  tbody: 'divide-y divide-border/70',
  tr: 'transition-colors hover:bg-primary/5 motion-reduce:transition-none',
  tdStrong: 'whitespace-nowrap px-3 py-2 font-medium text-foreground',
  td: `px-3 py-2 ${TXT.muted}`,
  tdAmount: 'px-3 py-2 text-right font-semibold tabular-nums text-foreground',
  mobileList: 'divide-y divide-border/70 sm:hidden',
  mobileItem: 'space-y-1 p-3',
  mobileCard: 'rounded-xl border border-border bg-card p-3 shadow-sm',
} as const

/** Szerkesztő-konténer (anyakönyvi sor, megjegyzés) — tónusos „papír a papíron". */
export function InlineEditor({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div id={id} tabIndex={-1} className="rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm outline-none sm:p-5">
      {children}
    </div>
  )
}

/** A ház űrlap-mezője (`kartoteka.css` `.modal-input`), 44px magasra emelve. */
export const FIELD_INPUT =
  'modal-input mt-1 h-11 focus-visible:outline-none'
export const FIELD_TEXTAREA = 'modal-input mt-1 resize-y focus-visible:outline-none'
export const FIELD_LABEL = `block text-xs ${TXT.muted}`

// ═════════════════════════════════════════════════════════════════════════
// 5. ÁLLAPOT-PRIMITÍVEK — a hiány HÁROM kanonikus formája
// ═════════════════════════════════════════════════════════════════════════
// A `border-dashed` + `opacity-35` az üresség két jele. Tömör keretes,
// árnyékos kártya SOHA nem üresség — az TARTALOMNAK néz ki.

/** (A) Az EGÉSZ karton üres. */
export function EmptyCard({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className={`px-8 py-16 text-center ${TXT.muted}`}>
      <span className="mb-3 flex justify-center opacity-35" aria-hidden>
        {icon}
      </span>
      <p>{children}</p>
    </div>
  )
}

/**
 * (B) Egy FÜL üres — a fül GYÖKERÉBEN, `Section`-ön KÍVÜL.
 * Megnevezi az entitást, és megmondja, hogyan lesz belőle adat.
 *
 * ⛔ 2026-08-11 (a review 3. pontja): `Section`-ön BELÜL TILOS. A `Section`
 *    maga is `bg-card`, tehát ott ez egy azonos színű kártyát rajzolna egy
 *    kártyára (nulla kontraszt), ráadásul a családi karton ugyanerre az
 *    esetre a keskeny `EmptyStrip`-sávot használja — a két oszlop ugyanannál
 *    az üres fülnél két különböző alakot mutatott. Szekción belül: EmptyStrip.
 */
export function EmptyTab({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className={`rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm ${TXT.muted}`}>
      <span className="mb-3 flex justify-center opacity-35" aria-hidden>
        {icon}
      </span>
      {title}
      {hint ? <p className="mt-2 text-xs">{hint}</p> : null}
    </div>
  )
}

/**
 * (C) Egy SÁV üres egy szekción BELÜL — a családi karton üres-alakja
 * (`family-details-dialog-refined.tsx:518, 659`), bájtra.
 * A `hint` (2026-08-11) az EGYETLEN bővítés: az „hogyan lesz ebből adat"
 * mondat eddig csak az `EmptyTab`-en volt meg, és emiatt nyúlt a személyi
 * karton szekción belül is a fül-szintű alakhoz. Hint nélkül a renderelt
 * markup bájtra a régi.
 */
export function EmptyStrip({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className={`rounded-xl border border-dashed border-border bg-muted/40 px-4 py-4 text-sm italic ${TXT.muted}`}>
      {children}
      {hint ? <p className="mt-1.5 text-xs not-italic">{hint}</p> : null}
    </div>
  )
}

/** Betöltés — a FEJLÉC azonnal renderel, csak a törzs villan. */
export function SkeletonGrid({ label }: { label: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted/70 ring-1 ring-border/50 motion-reduce:animate-none" />
      ))}
    </div>
  )
}

/**
 * Hiba a fül TÖRZSÉN belül — így a fejléc tényei (név, kor, telefon) láthatók
 * maradnak. A rózsaszín keretes riasztó-kártya törölve: a hiba nem tartalom.
 */
export function ErrorBlock({
  icon,
  title,
  description,
  onRetry,
}: {
  icon: ReactNode
  title: string
  description: string
  onRetry: () => void
}) {
  return (
    <div className="px-8 py-16 text-center">
      <span className="mb-3 flex justify-center text-destructive/60" aria-hidden>
        {icon}
      </span>
      <p className={TXT.headline}>{title}</p>
      <p className={`mt-1 text-sm ${TXT.muted}`}>{description}</p>
      <button type="button" className={`${BTN.outline} mt-4`} onClick={onRetry}>
        Újrapróbálom
      </button>
    </div>
  )
}
