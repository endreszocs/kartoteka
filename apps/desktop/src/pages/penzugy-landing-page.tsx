/**
 * Pénzügy al-modul választó oldal — `/penzugy` route.
 *
 * A-M7.3d2 (2026-04-24) — a chitanta (A-M7.2) és a befizetés (A-M7.3)
 * kör után a `/penzugy` oldal ma már nem a PlaceholderPage-et mutatja,
 * hanem egy **kártyás választót** a pénzügyi almodulokhoz.
 *
 * Ez a web-app `app/(dashboard)/penzugy/page.tsx` landing-oldalának
 * egyszerűsített, desktop-első változata. A jövőben finance-dashboard
 * widget-ekkel bővül (éves összeg, utolsó befizetések stb. — A-M7.4).
 */

import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  BookOpenCheck,
  Download,
  LayoutDashboard,
  MinusCircle,
  ReceiptText,
  Wallet,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kartoteka/ui'

import { DesktopShell } from '../lib/shell/desktop-shell'

interface FinanceModuleCard {
  href: string
  title: string
  description: string
  Icon: typeof Wallet
  iconBg: string
  iconColor: string
  /** Státusz-címke — „Új", „Béta", stb. — opcionális */
  badge?: { label: string; tone: 'emerald' | 'amber' | 'sky' }
}

const MODULES: FinanceModuleCard[] = [
  {
    href: '/penzugy/attekintes',
    title: 'Pénzügyi áttekintés',
    description:
      'A gyülekezet éves képe egy oldalon: bevétel, kiadás, egyenleg, havi bontás és top kategóriák.',
    Icon: LayoutDashboard,
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-700',
  },
  {
    href: '/penzugy/befizetes',
    title: 'Befizetés rögzítése',
    description:
      'Tag- és családi befizetések felvétele, sztornózása, kategóriák szerinti listázás. A napi pénzbeszedés főbejárata.',
    Icon: Banknote,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-700',
  },
  {
    href: '/penzugy/kiadas',
    title: 'Kiadás rögzítése',
    description:
      'Gyülekezeti kiadások (eszköz, segély, utazás, fűtés) rögzítése. Tag vagy külső átvevő (cég, kereskedő) megadása.',
    Icon: MinusCircle,
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-700',
  },
  {
    href: '/penzugy/belsomozgas',
    title: 'Belső mozgás',
    description:
      'Kassza ↔ bank átvezetés, bank ↔ bank átutalás, valutacsere. A tagok befizetéseit nem érinti.',
    Icon: ArrowLeftRight,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-700',
    badge: { label: 'Új', tone: 'emerald' },
  },
  {
    href: '/penzugy/chitanta',
    title: 'Chitanța kiállítása',
    description:
      'Papír-nyugta (chitanța) kiállítása a hivatalos nyugtatömbből. Offline is működik, ha a szám-tárcádban van foglalt sorszám.',
    Icon: ReceiptText,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-700',
  },
  {
    href: '/penzugy/chitanta-tombok',
    title: 'Nyugtatömbök',
    description:
      'Új nyugtatömb rögzítése és a meglévők kezelése (aktív / lezárt). A chitanța-kiállítás alapja.',
    Icon: BookOpenCheck,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-700',
  },
  {
    href: '/penzugy/bank-import',
    title: 'Bank-import',
    description:
      'A bankodból exportált Excel fájl betöltése, tranzakciók előnézete. BCR formátum támogatott; Raiffeisen + BT folyamatban.',
    Icon: Download,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-700',
    badge: { label: 'Béta', tone: 'amber' },
  },
]

function BadgeTone({ tone, label }: { tone: 'emerald' | 'amber' | 'sky'; label: string }) {
  const classes: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    sky: 'bg-sky-100 text-sky-800',
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${classes[tone]}`}
    >
      {label}
    </span>
  )
}

export function PenzugyLandingPage() {
  const navigate = useNavigate()

  return (
    <DesktopShell>
      <div className="space-y-6">
        {/* Fejléc */}
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="size-6 text-primary" />
            <h1 className="font-heading text-2xl font-semibold tracking-tight">Pénzügy</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            A gyülekezet bevételeinek, nyugta-kiállításainak és pénzügyi nyilvántartásának
            főoldala. Válassz egy almodult alul, vagy használd a sidebart a további funkciókhoz.
          </p>
        </div>

        {/* Kártya-rács */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <button
              key={m.href}
              type="button"
              onClick={() => navigate(m.href)}
              className="group text-left"
              aria-label={`Nyisd meg: ${m.title}`}
            >
              <Card className="card-raised h-full cursor-pointer border-0 transition-all duration-200 group-hover:scale-[1.01] group-hover:shadow-lg">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div
                      className={`inline-flex size-12 items-center justify-center rounded-2xl icon-raised ${m.iconBg} ${m.iconColor}`}
                    >
                      <m.Icon className="size-6" />
                    </div>
                    {m.badge && <BadgeTone tone={m.badge.tone} label={m.badge.label} />}
                  </div>
                  <CardTitle className="mt-3 font-heading text-lg">{m.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CardDescription className="text-sm leading-relaxed">
                    {m.description}
                  </CardDescription>
                  <div className="flex items-center gap-1 text-sm font-medium text-primary">
                    Megnyitás
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        {/* Mi jön hamarosan */}
        <Card className="border-dashed border-slate-200 bg-slate-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-700">Hamarosan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm text-slate-600">
            <p>
              <span className="font-medium">Bank-import (Raiffeisen + BT)</span> — a BCR
              mellett a többi bank is, és az automatikus párosítás a tagokhoz
            </p>
            <p>
              <span className="font-medium">Oblio / e-Factura</span> — román elektronikus
              számlázás, automatikus jelentés
            </p>
          </CardContent>
        </Card>
      </div>
    </DesktopShell>
  )
}
