'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  Crown,
  HandCoins,
  Info,
  MapPin,
  UserCheck,
  Users,
  Vote,
} from 'lucide-react'

/**
 * Súgó az élet-szerű tagnyilvántartási kérdésekhez. Apple Settings-stílusú
 * két-paneles UI: bal oldali kategória-lista + jobb oldali részletes tartalom.
 * Az információkat a tényleges rendszer-logikából (validation-engine,
 * voter-actions, jarulek-calculation, member-helpers) gyűjtöttük 2026-05-25-én.
 */

interface HelpCategory {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  short: string
}

const CATEGORIES: HelpCategory[] = [
  {
    id: 'general',
    label: 'Általános',
    Icon: Info,
    short: 'Mit szolgál a Tagnyilvántartás',
  },
  {
    id: 'membership',
    label: 'Egyháztagság',
    Icon: UserCheck,
    short: 'Ki számít aktív tagnak',
  },
  {
    id: 'families',
    label: 'Családok',
    Icon: Users,
    short: 'Családfő, házaspár, gyerekek',
  },
  {
    id: 'fees',
    label: 'Járulékfizetők',
    Icon: HandCoins,
    short: 'Egyházfenntartó járulék',
  },
  {
    id: 'districts',
    label: 'Körzetek',
    Icon: MapPin,
    short: 'Egyházi körzetek a gyülekezeten belül',
  },
  {
    id: 'voters',
    label: 'Választók',
    Icon: Vote,
    short: 'Közgyűlési szavazójog',
  },
  {
    id: 'presbyters',
    label: 'Presbiterek',
    Icon: Crown,
    short: 'Tisztségviselők szerepei',
  },
  {
    id: 'errors',
    label: 'Validációs hibák',
    Icon: AlertTriangle,
    short: 'Mit ellenőriz automatikusan a rendszer',
  },
]

export function TagnyilvantartasHelp() {
  const [active, setActive] = useState<string>(CATEGORIES[0].id)
  const activeCategory = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0]

  return (
    <div className="card-raised overflow-hidden p-0">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-[600px]">
        {/* Bal sidebar — kategória-lista */}
        <aside className="border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r">
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Súgó
            </p>
            <h2 className="mt-1 font-heading text-xl text-slate-800">
              Tagnyilvántartás
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Tudnivalók a lelkipásztoroknak
            </p>
          </div>

          <nav className="px-2 pb-3">
            {CATEGORIES.map((cat) => {
              const isActive = cat.id === active
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActive(cat.id)}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                      isActive
                        ? 'bg-teal-50 text-teal-700'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                    }`}
                  >
                    <cat.Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm font-medium ${
                        isActive ? 'text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      {cat.label}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {cat.short}
                    </span>
                  </span>
                  <ChevronRight
                    className={`size-3.5 shrink-0 transition-opacity ${
                      isActive ? 'opacity-100 text-slate-400' : 'opacity-0 group-hover:opacity-60'
                    }`}
                  />
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Jobb panel — kategória részletes tartalma */}
        <main className="px-6 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <activeCategory.Icon className="size-5" />
            </span>
            <div>
              <h3 className="font-heading text-2xl text-slate-800">
                {activeCategory.label}
              </h3>
              <p className="mt-0.5 text-sm text-slate-500">{activeCategory.short}</p>
            </div>
          </div>

          <div className="prose-content space-y-5 text-sm leading-relaxed text-slate-700">
            {active === 'general' && <GeneralContent />}
            {active === 'membership' && <MembershipContent />}
            {active === 'families' && <FamiliesContent />}
            {active === 'fees' && <FeesContent />}
            {active === 'districts' && <DistrictsContent />}
            {active === 'voters' && <VotersContent />}
            {active === 'presbyters' && <PresbytersContent />}
            {active === 'errors' && <ErrorsContent />}
          </div>
        </main>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Kategória-tartalmak
// ─────────────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="font-heading text-base font-semibold text-slate-800 mt-5 first:mt-0">
      {children}
    </h4>
  )
}

function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'red' | 'cyan' | 'violet' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    violet: 'bg-violet-50 text-violet-700',
  }
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

function GeneralContent() {
  return (
    <>
      <p>
        A <strong>Tagnyilvántartás</strong> a gyülekezethez tartozó személyek, családok,
        körzetek és választók adatait kezeli egy helyen. Cél, hogy a lelkipásztori
        munkához (látogatás, sákramentumok, választások, éves jelentés) mindig
        pontos, naprakész adat álljon rendelkezésre.
      </p>

      <SectionTitle>A modul főbb részei</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Áttekintés</strong> — összesítő nézet a gyülekezet aktuális összetételéről.</li>
        <li><strong>Személyek</strong> — egyéni karton, születési adat, lakcím, szülők, megjegyzés.</li>
        <li><strong>Családok</strong> — házaspárok, családtagok, gyerekek, háztartás-szerkezet.</li>
        <li><strong>Presbiterek</strong> — tisztségviselők és felelős körzetük.</li>
        <li><strong>Körzetek</strong> — a gyülekezet belső adminisztratív felosztása.</li>
        <li><strong>Választók</strong> — közgyűlési szavazójoggal rendelkezők listája.</li>
        <li><strong>Hibák</strong> — automatikus minőségbiztosítás (hiányzó/ellentmondó adatok).</li>
      </ul>

      <SectionTitle>Mire jó még?</SectionTitle>
      <p>
        Az itt rögzített adatok a többi modulban is automatikusan elérhetők:
        <strong> Pénzügy</strong> (járulékfizetők), <strong>Anyakönyv</strong> (keresztelő,
        konfirmáció, esketés, temetés), <strong>Éves jelentés</strong> (statisztikák),
        valamint <strong>Választások</strong> esetén az aktív választói névjegyzék.
      </p>
    </>
  )
}

function MembershipContent() {
  return (
    <>
      <p>
        A rendszer egy személyt akkor tekint <strong>aktív egyháztagnak</strong>, ha
        az alábbi feltételek mindegyike teljesül:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>nem <em>elhunyt</em>,</li>
        <li>nem <em>elköltözött</em>,</li>
        <li>nem <em>kitért</em> vagy <em>kilépett</em>,</li>
        <li>és ÉS (<strong>református vallású</strong>, VAGY <strong>bármikor fizetett egyházfenntartó járulékot</strong>).</li>
      </ul>

      <SectionTitle>Lehetséges státuszok</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <Pill tone="emerald">Aktív</Pill>
        <Pill tone="slate">Elhunyt</Pill>
        <Pill tone="slate">Elköltözött</Pill>
        <Pill tone="amber">Kitért / Kilépett</Pill>
        <Pill tone="slate">Más vallású</Pill>
      </div>

      <SectionTitle>Mit jelent a „más vallású"?</SectionTitle>
      <p>
        Ha a személy nem református vallású és <em>soha</em> nem fizetett egyházfenntartó
        járulékot, akkor a rendszer őt nem tekinti aktív tagnak. Ettől még a nyilvántartásban
        szerepel (pl. egy reformárus férj nem-református felesége), csak a választói és
        statisztikai listákból kimarad.
      </p>

      <SectionTitle>Praktikus tippek</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li>Ha valaki elköltözött, ne töröld — állítsd „elköltözött" státuszra. Megőrződnek az adatok, ha visszatér.</li>
        <li>Az „elhunyt" státusz automatikusan állítódik, ha az Anyakönyv modulban temetés-bejegyzés készül.</li>
      </ul>
    </>
  )
}

function FamiliesContent() {
  return (
    <>
      <p>
        A <strong>család</strong> az alapvető lelkigondozói egység. A rendszer 3 fő
        családtípust ismer fel automatikusan a beírt adatok alapján:
      </p>

      <SectionTitle>Háztartás-típusok</SectionTitle>
      <ul className="list-disc pl-5 space-y-2">
        <li>
          <Pill tone="violet">Házaspár alapú család</Pill>
          {' '}— férj és feleség is meg van adva, esetleg gyermekek is.
        </li>
        <li>
          <Pill tone="cyan">Egytagú vagy részben rögzített háztartás</Pill>
          {' '}— csak egy felnőtt szerepel (özvegy, egyedülálló, elvált), vagy a házastárs
          még nincs rögzítve.
        </li>
        <li>
          <Pill tone="amber">Szabad családi karton</Pill>
          {' '}— rugalmas, nem-standard összetétel (pl. egyedülálló édesanya gyermekkel,
          vagy testvérek együtt).
        </li>
      </ul>

      <SectionTitle>Mit szabad megadni?</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Férj</strong> (férfi) — opcionális, családfői szerep szokásos.</li>
        <li><strong>Feleség</strong> (nő) — opcionális.</li>
        <li><strong>Gyermekek</strong> — különálló jegyzék a családhoz kötve.</li>
        <li><strong>Körzet</strong> — opcionális, melyik egyházi körzethez tartozik.</li>
      </ul>
      <p>
        A férj és a feleség közül legalább az egyiket meg kell adni — gyermek-csak család
        nem jön létre (a gyerekek automatikusan a szüleik családjához csatolódnak).
      </p>

      <SectionTitle>Speciális esetek</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Özvegy</strong>: a férj vagy feleség az „elhunyt" státuszt kapja, a háztartás megmarad.</li>
        <li><strong>Vegyes vallású házaspár</strong>: mindkét felet rögzítjük; a nem-református fél „más vallású" státuszú lesz, de a család egyben marad.</li>
      </ul>
    </>
  )
}

function FeesContent() {
  return (
    <>
      <p>
        <strong>Egyházfenntartó járulékfizető</strong> az, aki az aktuális vagy az
        előző évben fizetett egyházfenntartó járulékot (kódja a pénzügyi rendszerben:{' '}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">101.01</code>).
      </p>

      <SectionTitle>Személy vagy család?</SectionTitle>
      <p>
        A járulékot lehet rögzíteni:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Személyhez kötve</strong> — egy konkrét tag fizette.</li>
        <li><strong>Családhoz kötve</strong> — a család egészére érvényes (ilyenkor minden
          felnőtt családtag „fizető"-nek számít).</li>
      </ul>

      <SectionTitle>Felmentés</SectionTitle>
      <p>
        Aki <strong>felmentést</strong> kap (pl. szociális ok, krónikus betegség), az nem
        számít „hátralékos"-nak, hanem külön kategóriába kerül:
      </p>
      <div className="flex flex-wrap gap-2">
        <Pill tone="emerald">Rendezve — fizet</Pill>
        <Pill tone="cyan">Felmentett</Pill>
        <Pill tone="red">Hátralékos — nem fizet</Pill>
      </div>
      <p>
        A felmentésnek megadható kezdő és záró éve. A rendszer csak az érvényes
        időszakban tekinti felmentettnek a személyt vagy családot.
      </p>

      <SectionTitle>Miért fontos?</SectionTitle>
      <p>
        A járulékfizető státusz a <strong>választói névjegyzéknek</strong> (közgyűlés)
        kulcselemmel: a rendszer csak azokat veszi fel választónak, akik az aktuális
        vagy előző évben fizettek (lásd <em>Választók</em> fül).
      </p>
    </>
  )
}

function DistrictsContent() {
  return (
    <>
      <p>
        A <strong>körzet</strong> a gyülekezet belső adminisztratív felosztása — egy
        utca, egy falurész, egy szövetkezet vagy hasonló természetes csoport.
      </p>

      <SectionTitle>Mit lehet körzethez rendelni?</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Családokat</strong> — közös lakcímű, vagy közös pasztorációs területű családok.</li>
        <li><strong>Presbitereket</strong> — egy presbiter felelős lehet egy adott körzet pasztorációjáért.</li>
      </ul>

      <SectionTitle>Mire jó?</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Pasztorális látogatás</strong> tervezése (egy presbiter — egy körzet).</li>
        <li><strong>Eseménymeghívás</strong> területenkénti bontásban.</li>
        <li><strong>Statisztikai bontás</strong> az éves jelentésben.</li>
      </ul>

      <SectionTitle>Láthatóság</SectionTitle>
      <p>
        Egy gyülekezet csak a saját körzeteit látja — másik gyülekezet körzetei
        elrejtődnek a kiválasztó listákból. A körzeteket csak <em>aktív</em> állapotban
        ajánlja fel a rendszer; az inaktívak megmaradnak az archívumban (történeti
        családi adatokhoz).
      </p>
    </>
  )
}

function VotersContent() {
  return (
    <>
      <p>
        A <strong>választó</strong> a közgyűlésen szavazati joggal rendelkező egyháztag.
        A rendszer az alábbi feltételeket ellenőrzi automatikusan:
      </p>

      <SectionTitle>A választói jogosultság feltételei</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li>Betöltötte a <strong>18. életévét</strong> a választás évében.</li>
        <li><strong>Nem elhunyt</strong> (és lehetőleg nem elköltözött sem).</li>
        <li>Az <strong>aktuális vagy az előző évben fizetett egyházfenntartó járulékot</strong>{' '}
          (kód: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">101.01</code>).</li>
      </ul>

      <SectionTitle>Mit lát a Választók fülön?</SectionTitle>
      <p>
        A rendszer összegyűjti a jogosultakat, és minden név mellett megmutatja:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Az <strong>előző évi</strong> járulékösszeget,</li>
        <li>az <strong>aktuális évi</strong> járulékösszeget,</li>
        <li>a családi és körzeti hovatartozást.</li>
      </ul>
      <p>
        Választás előtti felülvizsgálatkor érdemes a Hibák fület is végignézni —
        a hiányzó születési dátum vagy kétséges státusz akadályozhatja a névjegyzék
        véglegesítését.
      </p>
    </>
  )
}

function PresbytersContent() {
  return (
    <>
      <p>
        A <strong>presbiter</strong> egy meglévő személyhez kötött tisztség — nem külön
        személy-bejegyzés. Az egyháztag „Presbiterek" fülön történő rögzítése a tisztséget
        kapcsolja hozzá.
      </p>

      <SectionTitle>Mit lehet rögzíteni?</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Személy</strong> — egy aktív egyháztag a Személyek listából.</li>
        <li><strong>Tisztség</strong> — szabad szöveg (pl. „Presbiter", „Pótpresbiter",
          „Gondnok", „Pénztáros"). A leggyakoribb a „Presbiter".</li>
        <li><strong>Felelős körzet</strong> (opcionális) — melyik körzet pasztorációjáért
          felel az adott presbiter.</li>
      </ul>

      <SectionTitle>Mire jó?</SectionTitle>
      <p>
        Az éves jelentés a presbiterek listáját automatikusan generálja innen.
        A pasztorális felelősség (egy presbiter — egy körzet) az alap-szervezési minta;
        ha a felelős körzet meg van adva, a körzet listája a presbiter nevét is mutatja.
      </p>

      <SectionTitle>Választás után</SectionTitle>
      <p>
        Új presbiterek megválasztásakor: bejegyezni az új tisztségviselőket itt, a
        régieknél pedig módosítani a tisztség leírását (pl. „Volt presbiter, 2020–2024")
        vagy kitörölni a tisztség-bejegyzést. Az egyháztagi karton megmarad.
      </p>
    </>
  )
}

function ErrorsContent() {
  return (
    <>
      <p>
        A rendszer minden adat-mentésnél automatikusan ellenőriz, hogy a karton
        tartalma <strong>teljes és ellentmondás-mentes</strong> legyen. A Hibák fülön
        összegyűjtve láthatók a felfedezett problémák.
      </p>

      <SectionTitle>A négy hibatípus</SectionTitle>
      <div className="space-y-3">
        <div>
          <Pill tone="red">Hiányzó adat</Pill>
          <p className="mt-1">Kötelező mező üres (vezetéknév, keresztnév, születési dátum, anyja neve, lakcím).</p>
        </div>
        <div>
          <Pill tone="amber">Formátum-hiba</Pill>
          <p className="mt-1">Érvénytelen formátum: rossz email, telefonszám vagy CNP (személyi szám).</p>
        </div>
        <div>
          <Pill tone="red">Logikai ellentmondás</Pill>
          <p className="mt-1">Pl. születési dátum a jövőben, vagy 130 évnél idősebb személy.</p>
        </div>
        <div>
          <Pill tone="amber">Duplikáció</Pill>
          <p className="mt-1">Ugyanaz a CNP, e-mail, vagy név+születési dátum párosítás több emberhez kötve.</p>
        </div>
      </div>

      <SectionTitle>Súlyossági szintek</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <Pill tone="red">Kritikus</Pill> {' '}— alapadat hiányzik vagy értelmetlen, javítás szükséges.
        </li>
        <li>
          <Pill tone="amber">Közepes</Pill> {' '}— a pasztorális munkát akadályozhatja
          (pl. nem elérhető a tag, ha hiányzik a lakcím).
        </li>
        <li>
          <Pill tone="slate">Figyelmeztetés</Pill> {' '}— adattisztasági jelzés, nem kritikus.
        </li>
      </ul>

      <SectionTitle>Hibák kezelése</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Megoldás</strong>: javítsd a kartont, a hiba automatikusan eltűnik.</li>
        <li><strong>Figyelmen kívül hagyás</strong>: ha tudatos a hiányzó/szokatlan adat
          (pl. nincs anyja neve, mert az adatfelvételkor nem volt elérhető), megjelölhető
          „mellőzve" státusszal.</li>
      </ul>
    </>
  )
}
