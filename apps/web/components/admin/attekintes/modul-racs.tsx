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
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 2026-08-12 — TÖMÖRÍTÉS: A LEÍRÁS BEKÖLTÖZÖTT AZ `aria-label`-BE
 * ════════════════════════════════════════════════════════════════════════════
 * Ez a rács TISZTA NAVIGÁCIÓ: ugyanezek a linkek ott vannak a bal oldalsávban
 * is. Mégis ez volt a lap MÁSODIK LEGMAGASABB eleme (12 kártya × 3 sor szöveg
 * = négy sornyi rács, ~440 px) — vagyis a legkevésbé fontos tartalom foglalta a
 * legtöbb helyet.
 *
 * A leírások nem vesztek el: a `title` és az `aria-label` viszi tovább őket,
 * tehát az egérrel odaérő és a képernyőolvasót használó felhasználó ugyanazt
 * kapja. A látható szöveg az ikon + a név + az élő pirula — ennyi kell ahhoz,
 * hogy valaki eljusson a modulhoz, amit már ismer.
 *
 * ⚠️ 2026-08-12 — KÉT UTÓLAGOS KORREKCIÓ A TÖMÖRÍTÉSHEZ:
 *   (1) A NÉVEN NINCS `truncate`. 1024–1279 px között a `lg:grid-cols-3` miatt
 *       a kártya ~220 px volt, amiből ~126 px jutott a névnek: a „Felhasználók
 *       és szerepkörök" LÁTHATÓAN levágódott, a pótlásként kínált `title` pedig
 *       érintőképernyőn elérhetetlen. A harmadik hasáb most `xl`-től indul, és
 *       a név két sorba törhet.
 *   (2) A LEÍRÁS 2xl-TŐL (1536 px) ÚJRA LÁTHATÓ, egy sorban. Ott van rá hely —
 *       épp azon a nagy képernyőn, ahol a tulajdonos „minél több információt"
 *       kért. Kisebb ablakban marad a `title`/`aria-label`.
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
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id="modulok-cim"
          className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          Admin modulok
        </h2>
        <p className="text-xs text-muted-foreground">Bármelyik részhez közvetlenül átléphetsz</p>
      </div>
      {/* ⚠️ A HARMADIK HASÁB CSAK `xl`-TŐL (1280), `lg`-től (1024) SOHA.
          1024 px-es ablakban a bal oldalsáv (288 px) miatt a tartalom 680 px —
          SZŰKEBB, mint 768-on (720 px). Három hasábbal a kártya ~220 px lenne,
          amiből az ikon (32) + hézagok (20) + chevron (16) + `px-3` (24) után
          ~126 px marad a névnek: a „Felhasználók és szerepkörök" (~190 px)
          töredékké válna. */}
      <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {lathato.map((m) => {
          const Icon = m.icon
          const danger = m.tone === 'danger'
          const pirula = pirulaTerkep.get(m.href)
          return (
            <Link
              key={m.href}
              href={m.href}
              title={m.description}
              // A leírás a kisegítő névben van — a látható szöveg tömör marad,
              // de a képernyőolvasó ugyanazt hallja, mint korábban.
              className="card-raised kt-fokusz group flex min-h-11 items-center gap-2.5 px-3 py-2.5"
              aria-label={`${m.label}${pirula ? ` — ${pirula.felirat}` : ''}. ${m.description}`}
            >
              <span
                className="icon-raised flex size-8 shrink-0 items-center justify-center text-[var(--primary-foreground)]"
                style={{
                  background: danger
                    ? 'linear-gradient(135deg, var(--destructive), color-mix(in oklab, var(--destructive) 65%, black))'
                    : 'linear-gradient(135deg, var(--primary), var(--accent))',
                }}
                aria-hidden
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                {/* ⚠️ NINCS `truncate`. A modul NEVE a navigáció maga — egy
                    levágott név („Felhasználók és szere…") töredék, és a
                    pótlásként kínált `title` érintőképernyőn ELÉRHETETLEN.
                    Inkább két sorba törik: a `min-h-11` érintőfelület ettől
                    nem sérül, az izommemória pedig megmarad. */}
                <span className="block font-heading text-[14px] font-semibold leading-tight text-foreground">
                  {m.label}
                </span>
                {/* A leírás LÁTHATÓ változata a legnagyobb képernyőn, ahol
                    amúgy is van hely (2xl = 1536 px-től, 4 hasáb). Kisebb
                    ablakban a `title`/`aria-label` viszi tovább — ott a
                    függőleges hely fontosabb. */}
                <span className="mt-0.5 hidden truncate text-[11px] leading-snug text-muted-foreground 2xl:block">
                  {m.description}
                </span>
                {pirula && (
                  <span className="mt-0.5 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-border">
                    {pirula.felirat}
                  </span>
                )}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground/50 transition group-hover:text-muted-foreground"
                aria-hidden
              />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
