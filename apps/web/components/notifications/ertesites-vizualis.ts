/**
 * ÉRTESÍTÉS-TÍPUSOK VIZUÁLIS IDENTITÁSA — KÖZÖS KÉSZLET (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KERÜLT KI KÜLÖN FÁJLBA
 * ════════════════════════════════════════════════════════════════════════════
 * Eddig a fejléc-csengő (`layout/notification-bell-refined.tsx`) BELSEJÉBEN élt.
 * 2026-08-11-től ugyanezt a készletet használja az új értesítések-oldal is —
 * és ha két másolat lenne belőle, a két felület ugyanarra az üzenetre két
 * különböző színt és címkét adna. Pontosan ez a projekt visszatérő
 * hibaosztálya, csak épp látványban.
 *
 * ⚠️ DIREKTÍVA-MENTES: se `use client`, se `server-only`. Csak adat és típus
 *    (plusz lucide ikon-komponensek), tehát bármelyik kliens-komponens
 *    importálhatja. ⛔ Szerver-komponensből NE add át `Icon={…}` propként
 *    kliens-komponensnek: pontosan ez okozott éles 500-at 2026-08-11-én a
 *    `/notifications` oldalon (lásd `packages/ui-app/src/layout/PageHero.tsx`).
 *
 * A színek `-500/xx` alfás változatok, mert a `-50` osztályokat a
 * `kartoteka.css` sötét blokkja `!important`-tal felülírja. A szövegszínek
 * `-700` (light) / `-300` (dark) párban futnak, mindkét irányban AA-kontraszttal.
 */

import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  LifeBuoy,
  ShieldAlert,
  Sparkles,
  UserRoundPlus,
} from 'lucide-react'

import { huRelativIdo } from '@/lib/utils/idopont-bukarest'

export interface TypeVisual {
  icon: LucideIcon
  /** Rövid, lelkész-barát magyar címke. */
  label: string
  /** Ikon-chip: halvány felület + azonos színcsaládú ikon és gyűrű. */
  chip: string
  /** Bal oldali hangsúly-csík az olvasatlan kártyán. */
  bar: string
  /** Apró típuscímke a kártya lábában. */
  pill: string
}

export const TYPE_VISUALS: Record<string, TypeVisual> = {
  info: {
    icon: Info,
    label: 'Tájékoztatás',
    chip: 'bg-sky-500/12 text-sky-700 ring-sky-500/20 dark:text-sky-300 dark:ring-sky-400/25',
    bar: 'bg-sky-500',
    pill: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  success: {
    icon: CheckCircle2,
    label: 'Sikeres',
    chip: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-400/25',
    bar: 'bg-emerald-500',
    pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Figyelem',
    chip: 'bg-amber-500/14 text-amber-700 ring-amber-500/25 dark:text-amber-300 dark:ring-amber-400/25',
    bar: 'bg-amber-500',
    pill: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  },
  danger: {
    icon: ShieldAlert,
    label: 'Fontos',
    chip: 'bg-rose-500/12 text-rose-700 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-400/25',
    bar: 'bg-rose-500',
    pill: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  support_reply: {
    icon: LifeBuoy,
    label: 'Támogatás',
    chip: 'bg-violet-500/12 text-violet-700 ring-violet-500/20 dark:text-violet-300 dark:ring-violet-400/25',
    bar: 'bg-violet-500',
    pill: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  registration: {
    icon: UserRoundPlus,
    label: 'Regisztráció',
    chip: 'bg-indigo-500/12 text-indigo-700 ring-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-400/25',
    bar: 'bg-indigo-500',
    pill: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  },
  release: {
    icon: Sparkles,
    label: 'Újdonság',
    chip: 'bg-teal-500/12 text-teal-700 ring-teal-500/20 dark:text-teal-300 dark:ring-teal-400/25',
    bar: 'bg-teal-500',
    pill: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
  },
}

export function getTypeVisual(tipus?: string | null): TypeVisual {
  return (tipus && TYPE_VISUALS[tipus]) || TYPE_VISUALS.info
}

/**
 * Az értesítéshez tartozó megnyitható hivatkozás. Az `admin_access:<id>` alakú
 * érték NEM link (az a jóváhagyás-kérelem azonosítója), a többi belső útvonal
 * vagy külső http(s) cím lehet.
 */
export function notificationLink(
  hivatkozas?: string | null,
): { href: string; external: boolean } | null {
  const raw = hivatkozas?.trim()
  if (!raw || raw.startsWith('admin_access:')) return null
  if (raw.startsWith('/')) return { href: raw, external: false }
  if (/^https?:\/\//i.test(raw)) return { href: raw, external: true }
  return null
}

/**
 * MAGYAR RELATÍV IDŐ. „az imént" → „12 perce" → „3 órája" → „tegnap" → …
 *
 * ⚠️ EZ CSAK A MÁSODLAGOS KIJELZÉS. A PONTOS időpont mindig a közös,
 * Europe/Bucharest-re szögezett formázóból jön (`lib/utils/idopont-bukarest.ts`) —
 * a relatív idő sosem áll magában.
 */
export function relativHuIdo(iso?: string | null): string {
  // 2026-08-12: a TÖRZS átkerült a `lib/utils/idopont-bukarest.ts`-be, a pontos
  // időpont-formázó MELLÉ. Addig három egyforma másolat élt belőle (itt, az
  // admin idővonalon és a szinkron-panelen), és az admin Áttekintésen már meg is
  // született volna a negyedik — az írta ki a „10.650685 órája" szöveget.
  return huRelativIdo(iso)
}
