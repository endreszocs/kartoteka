/**
 * Admin modul-rács ÉLŐ számokkal (2026-08-12).
 *
 * SZERVER-KOMPONENS — az ikonokat maga importálja.
 *
 * ⚠️ A 12 kártya és a sorrendjük VÁLTOZATLAN a korábbi felülethez képest: ez a
 * navigáció, itt az izommemória a legfontosabb. Ami ÚJ: ahol a fenti csempék
 * úgyis lekérték, ott a kártya kap egy kis, jobb felső sarki pirulát a saját
 * élő számával. Eddig EGYETLEN kártyán sem volt szám — a lelkésznek be kellett
 * lépnie mindegyikbe, hogy megtudja, van-e ott dolga.
 *
 * ⚠️ Ahol nincs olcsón elérhető szám, ott NINCS pirula. Nullát nem írunk ki:
 * a „0" azt állítaná, hogy megnéztük és nincs semmi.
 */

import Link from 'next/link'
import {
  Bell,
  ChevronRight,
  Church,
  Database,
  Download,
  Flame,
  History,
  Link2,
  LifeBuoy,
  PiggyBank,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from 'lucide-react'

import type { ModulPirula } from '@/app/(dashboard)/admin/overview-shared'

interface Modul {
  href: string
  icon: LucideIcon
  label: string
  description: string
  tone?: 'danger'
}

const MODULOK: ReadonlyArray<Modul> = [
  {
    href: '/admin/gyulekezetek',
    icon: Church,
    label: 'Gyülekezetek',
    description: 'A rendszerhez kapcsolt gyülekezetek listája és státusza.',
  },
  {
    href: '/admin/felhasznalok',
    icon: UserCog,
    label: 'Felhasználók és szerepkörök',
    description: 'Felhasználók, várakozó kérelmek, szerepkörök kiosztása egy helyen.',
  },
  {
    href: '/admin/egyeztetesek',
    icon: Link2,
    label: 'Tag-egyeztetések',
    description: 'Kereszt-gyülekezeti duplikátum-párok: átvizsgálás és lelkész-értesítés.',
  },
  {
    href: '/admin/eszkozok',
    icon: Database,
    label: 'Eszközök és napló',
    description: 'Asztali eszközök, licensz-kulcsok és aktivitási napló.',
  },
  {
    href: '/admin/frissitesek',
    icon: Bell,
    label: 'Frissítések',
    description: 'Rendszerüzenetek, hírlevél, changelog közzététel.',
  },
  {
    href: '/admin/tamogatas',
    icon: LifeBuoy,
    label: 'Támogatás',
    description: 'Beérkezett támogatási jegyek, nyitott esetek.',
  },
  {
    href: '/admin/import',
    icon: Download,
    label: 'Import',
    description: 'Tagnyilvántartás importálása Excel-fájlból, varázslóval.',
  },
  {
    href: '/admin/penzugy',
    icon: PiggyBank,
    label: 'Rendszer pénzügyei',
    description: 'A platform pénzügyi forgalma, számlázás, határidők.',
  },
  {
    href: '/admin/rendszer',
    icon: ShieldAlert,
    label: 'Rendszer',
    description: 'Biztonsági beállítások, audit, rendszer-paraméterek.',
  },
  {
    href: '/admin/naplo',
    icon: History,
    label: 'Tevékenység-napló',
    description: 'Rekord-szintű módosítás-történet (audit).',
  },
  {
    href: '/admin/biztonsagi-mentes',
    icon: ShieldCheck,
    label: 'Biztonsági mentés',
    description: 'Napi titkosított mentés a Drive-ra — és a bizonyíték, hogy elkészült.',
  },
  {
    href: '/admin/veszelyes-zona',
    icon: Flame,
    label: 'Veszélyes zóna',
    description: 'Adattisztítás, törlés — csak rendkívüli esetben.',
    tone: 'danger',
  },
]

/** A kerületi admin elől rejtett, rendszer-szintű kártyák (mint a bal menüben). */
const CSAK_RENDSZER = new Set(['/admin/rendszer', '/admin/veszelyes-zona'])

export function ModulRacs({
  pirulak,
  rendszerAdmin,
}: {
  pirulak: ModulPirula[]
  rendszerAdmin: boolean
}) {
  const pirulaTerkep = new Map(pirulak.map((p) => [p.href, p]))
  const lathato = rendszerAdmin ? MODULOK : MODULOK.filter((m) => !CSAK_RENDSZER.has(m.href))

  return (
    <section aria-labelledby="modulok-cim">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="modulok-cim" className="font-heading text-lg text-foreground">
          Admin modulok
        </h2>
        <p className="text-sm text-muted-foreground">Bármelyik részhez közvetlenül átléphetsz</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lathato.map((m) => {
          const Icon = m.icon
          const danger = m.tone === 'danger'
          const pirula = pirulaTerkep.get(m.href)
          return (
            <Link
              key={m.href}
              href={m.href}
              className="card-raised group flex min-h-[4.5rem] items-start gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label={pirula ? `${m.label} — ${pirula.felirat}` : m.label}
            >
              <span
                className="icon-raised flex size-10 shrink-0 items-center justify-center text-[var(--primary-foreground)]"
                style={{
                  background: danger
                    ? 'linear-gradient(135deg, var(--destructive), color-mix(in oklab, var(--destructive) 65%, black))'
                    : 'linear-gradient(135deg, var(--primary), var(--accent))',
                }}
                aria-hidden
              >
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-heading text-[15px] font-semibold text-foreground">
                    {m.label}
                  </p>
                  {pirula && (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground ring-1 ring-inset ring-border">
                      {pirula.felirat}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
                  {m.description}
                </p>
              </div>
              <ChevronRight
                className="mt-1 size-4 shrink-0 text-muted-foreground/60 transition group-hover:text-muted-foreground"
                aria-hidden
              />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
