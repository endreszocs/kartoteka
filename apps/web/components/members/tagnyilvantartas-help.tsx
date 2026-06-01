'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  Crown,
  HandCoins,
  HomeIcon,
  Info,
  MapPin,
  Sparkles,
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
    id: 'family-modell',
    label: 'Új család-modell',
    Icon: HomeIcon,
    short: 'A 3-rétegű hibrid modell — válás, költözés, többgenerációs',
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
            {active === 'family-modell' && <FamilyModellContent />}
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

// ─────────────────────────────────────────────────────────────────────────
// ÚJ CSALÁD-MODELL — részletes magyarázat lelkipásztoroknak (2026-06-01)
// ─────────────────────────────────────────────────────────────────────────

function FamilyModellContent() {
  return (
    <>
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <p className="flex items-start gap-2 text-amber-900">
          <Sparkles className="size-4 mt-0.5 shrink-0" />
          <span>
            <strong>Új funkció — fokozatosan vezetjük be.</strong> A meglévő
            adataid <strong>nem törlődnek</strong>: minden család, gyerek,
            cím megmarad. Az új modell ezeket kiegészíti, hogy a modern élet-
            szituációkat (válás, költözés, többgenerációs együttélés) is
            tudja kezelni.
          </span>
        </p>
      </div>

      <SectionTitle>Mit jelent a „család" a rendszerben?</SectionTitle>
      <p>
        A jelenlegi rendszerben a <em>család</em> egy doboz: <strong>férj + feleség +
        gyerekek egy cím alatt</strong>. Ez az 1950-es évek modellje — jól működik,
        amíg minden tradicionális.
      </p>
      <p>
        De a valóságban sokszor másképp van: elvált szülők gyermeke váltakozva
        él két helyen; özvegy édesanya a fia családjához költözött; az egyetemista
        gyerek a kollégiumban lakik, de a szüleinél is családtag. Az új modell
        ezeket is le tudja képezni.
      </p>

      <SectionTitle>A 3 különálló kartonlap</SectionTitle>
      <p>
        Képzeld el úgy, mintha minden emberről <strong>három különböző karton</strong>
        lenne — mindegyik más célt szolgál:
      </p>

      <div className="space-y-4 mt-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <h4 className="flex items-center gap-2 font-semibold text-blue-900">
            <UserCheck className="size-4" />
            1. „Ki ő?" — Személyi karton
          </h4>
          <p className="mt-2 text-blue-900/85 text-sm leading-relaxed">
            Minden emberről egy karton: név, születés, vallás, telefon, email,
            kép. <strong>Sose változik</strong>, csak az adatok frissülnek. Ha
            Kovács Pista elválik, a kartonja ugyanaz marad — csak a kapcsolatai
            módosulnak. <em>„A személy az ember maga — Isten gyermeke, akit
            megkereszteltünk."</em>
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <h4 className="flex items-center gap-2 font-semibold text-emerald-900">
            <HomeIcon className="size-4" />
            2. „Hol lakik most?" — Háztartási karton
          </h4>
          <p className="mt-2 text-emerald-900/85 text-sm leading-relaxed">
            Külön karton arról, hogy <strong>most kivel él egy fedél alatt</strong>.
            Egy háztartáshoz tartozik:
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm space-y-1 text-emerald-900/85">
            <li>egy cím (utca, házszám)</li>
            <li>a benne lakó személyek (1, 2, 5, 8 — bármennyi)</li>
            <li>mindenkinek van szerepe (családfő, házastárs, gyermek,
                mostohaszülő, lakótárs)</li>
          </ul>
          <p className="mt-2 text-emerald-900/85 text-sm leading-relaxed">
            <strong>Ez változhat!</strong> Költözéskor a régi háztartás
            „lezárul", új háztartás jön létre. Az egyetemista gyerek lehet
            egyszerre tagja a szülei háztartásának ÉS a kollégiuménak is.{' '}
            <em>„A háztartás a mostani közös élet — ami változik."</em>
          </p>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
          <h4 className="flex items-center gap-2 font-semibold text-violet-900">
            <Users className="size-4" />
            3. „Ki a rokona?" — Kapcsolati karton
          </h4>
          <p className="mt-2 text-violet-900/85 text-sm leading-relaxed">
            Külön karton a vér szerinti és életen át tartó rokoni kötelékekről:
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm space-y-1 text-violet-900/85">
            <li>Kovács Pista <strong>gyermeke</strong> Kovács Anna</li>
            <li>Kovács Pista <strong>volt házastársa</strong> Tóth Mária</li>
            <li>Kovács Anna <strong>testvére</strong> Kovács Béla</li>
          </ul>
          <p className="mt-2 text-violet-900/85 text-sm leading-relaxed">
            <strong>Ez nem változik költözéssel.</strong> Ha Pista elválik Máriától,
            ők továbbra is a közös gyerekek vér szerinti szülei. Csak a házassági
            kapcsolat státusza változik „aktív" → „lezárt"-ra.{' '}
            <em>„A kapcsolat az Istenadta vagy törvényadta kötelék."</em>
          </p>
        </div>
      </div>

      <SectionTitle>Élet-példák — mit jelent a napi munkában?</SectionTitle>

      <div className="space-y-3 mt-2">
        <ExamplePanel
          tone="emerald"
          title="Új gyerek megkeresztelése"
          situation="Beder Attila és Beder Henrietta gyermeke megszületett."
          old="Hozzáadod a babát a Beder családhoz."
          new={'1) Felveszed a babát mint új személyt. 2) Rögzíted a két vér szerinti szülő-gyermek kapcsolatot. 3) A szülők háztartásába felveszed a babát is. Az anyakönyvi emléklap AUTOMATIKUSAN a vér szerinti szülőket írja — akkor is, ha az anya újraházasodott.'}
        />
        <ExamplePanel
          tone="emerald"
          title="Családlátogatás"
          situation="A Templom utca 3-ban él Nagy néni, a fia, a menye, és 2 unoka."
          old={'Egy „Nagy család” rekord — de csak 1 férj + 1 feleség + 4 név fér el.'}
          new={'Egy háztartás 5 taggal: Nagy néni (nagyszülő), a fia (családfő), a menye (házastárs), 2 unoka (gyermek). A vér szerinti rokoni szálakat külön látod (Nagy néni a fiának vér szerinti anyja, a menye szülei egy másik gyülekezetben).'}
        />
        <ExamplePanel
          tone="amber"
          title="Költözés"
          situation="A Kovács család átköltözik a Templom utcáról az Iskola utcára."
          old="A család címét felülírod — a régi cím elveszik."
          new={'A régi háztartás lezárul (érvényes-ig = ma). Új háztartás jön létre az új címmel, ugyanazokkal a tagokkal. A korábbi családlátogatások visszakereshetők, hogy 2024-ben még a Templom utcában tartottad őket.'}
        />
        <ExamplePanel
          tone="amber"
          title="Egyetemista gyerek"
          situation="Szabó Ákos Kolozsváron egyetemista, a kollégiumban lakik."
          old={'Vagy a szüleinél van (téves cím), vagy egy „egyfős család” lesz a kollégiumban (furcsa).'}
          new={'Ákos kartonja a sajátja. Tagja a szülei háztartásának (szerepe: gyermek, másodlagos) ÉS a kollégium háztartásának (lakó, elsődleges). A vér szerinti szülei örökre az ő szülei. A családlátogatáskor MINDKÉT háztartásban látod őt.'}
        />
        <ExamplePanel
          tone="red"
          title="Elvált család / patchwork"
          situation="Pista elvált Máriától; mindkettő újraházasodott. A közös gyerek hétközben Máriánál, hétvégén Pistánál."
          old="Az egész helyzet NEM FÉR a férj+feleség modellbe."
          new={'Pista új háztartása: ő + új felesége + a régi gyereke (hétvégi tag) + új gyerek. Mária háztartása: ő + új férje + a régi gyerek (hétközi tag). A kapcsolati réteg azt mondja: a gyerek vér szerinti szülei Pista és Mária — ez SOSE változik. Az anyakönyvi adatok ezt használják.'}
        />
      </div>

      <SectionTitle>Mit kell Önnek csinálnia?</SectionTitle>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
        <p className="font-semibold text-emerald-900">Semmit azonnal.</p>
        <ul className="mt-2 list-disc pl-5 text-sm space-y-1 text-emerald-900/85">
          <li>A meglévő családi adatok automatikusan átkerülnek az új modellbe
              (egy éjszakai folyamat).</li>
          <li>Minden meglévő család → új háztartás (a tagok, a cím megmarad).</li>
          <li>A férj+feleség jelölésből automatikusan generálódnak a házastársi
              kapcsolatok.</li>
          <li>A gyerekek megkapják a „szülő-gyerek" kapcsolatot mindkét szülővel.</li>
          <li>A családlátogatási napló érintetlen marad.</li>
        </ul>
        <p className="mt-3 text-sm text-emerald-900/85">
          Új eseteknél (új keresztelő, beköltöző tag, válás) <strong>több
          opciója lesz</strong> a sajátos helyzetek rögzítésére.
        </p>
      </div>

      <SectionTitle>Mi a hátránya?</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Több kattintás új ember felvételénél</strong> — nem csak
            „új család", hanem külön a kapcsolatokat is rögzíteni kell. (A
            felület úgy lesz felépítve, hogy egy űrlapon belül megy minden.)</li>
        <li><strong>Tanulási görbe</strong> — pár hétig megszokás, hogy a
            „családlátogatás" most háztartás-látogatást is jelent.</li>
      </ul>

      <SectionTitle>Mi az előnye?</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Valós élet leképezése</strong>: ha holnap a presbiterünk
            bejelenti hogy elvált, van hova rögzíteni a valódi szituációt.</li>
        <li><strong>Anyakönyvek pontosak</strong>: a vér szerinti szülők soha
            nem keverednek a mostohaszülőkkel.</li>
        <li><strong>Történet megmarad</strong>: költözés, válás, újraházasodás
            után is visszakereshető „ki kivel élt 2018-ban".</li>
        <li><strong>Jogilag is helyes</strong>: a GDPR + a református
            adatkezelési minta is személy-központú nyilvántartást ír elő.</li>
      </ul>

      <SectionTitle>Bevezetési ütemterv</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="py-2 pr-3 font-semibold text-slate-700">Fázis</th>
              <th className="py-2 pr-3 font-semibold text-slate-700">Mi történik</th>
              <th className="py-2 font-semibold text-slate-700">Önre nézve</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-3 align-top">
                <Pill tone="emerald">Fázis 0 — kész</Pill>
              </td>
              <td className="py-2 pr-3 align-top">
                Új táblák létrejöttek az adatbázisban. A régi rendszer érintetlen.
              </td>
              <td className="py-2 align-top text-slate-500">Nincs változás.</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-3 align-top">
                <Pill tone="amber">Fázis 1 — 2-3 nap</Pill>
              </td>
              <td className="py-2 pr-3 align-top">
                Meglévő családok automatikus átemelése. Minden mentés mindkét
                rendszerbe kerül („kettős könyvelés").
              </td>
              <td className="py-2 align-top text-slate-500">Nincs változás.</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 pr-3 align-top">
                <Pill tone="amber">Fázis 2 — 4-5 nap</Pill>
              </td>
              <td className="py-2 pr-3 align-top">
                Új felhasználói felület: háztartás-dialog, kapcsolat-szerkesztő,
                költözés-rögzítő.
              </td>
              <td className="py-2 align-top text-slate-700">
                Új lehetőségek a felületen — előzetes tájékoztatás után.
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-3 align-top">
                <Pill tone="slate">Fázis 3 — 1-2 nap</Pill>
              </td>
              <td className="py-2 pr-3 align-top">
                Régi családi rekordok csak olvashatóvá válnak (történeti
                archívumként).
              </td>
              <td className="py-2 align-top text-slate-700">
                Új rögzítések csak az új modellben.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p>
          <strong>Kérdés?</strong> A részletes technikai terv elérhető:{' '}
          <code className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-700 border border-slate-200">
            docs/project-tracking/KARTOTEKA-csalad-hibrid-modell-terv-2026-06-01.md
          </code>
        </p>
      </div>
    </>
  )
}

// Színes panel-doboz az élet-példákhoz
function ExamplePanel({
  tone,
  title,
  situation,
  old,
  new: newDesc,
}: {
  tone: 'emerald' | 'amber' | 'red'
  title: string
  situation: string
  old: string
  new: string
}) {
  const toneClasses = {
    emerald: 'border-emerald-200 bg-emerald-50/40',
    amber: 'border-amber-200 bg-amber-50/40',
    red: 'border-red-200 bg-red-50/40',
  }
  const titleColor = {
    emerald: 'text-emerald-900',
    amber: 'text-amber-900',
    red: 'text-red-900',
  }
  return (
    <div className={`rounded-xl border p-4 ${toneClasses[tone]}`}>
      <h4 className={`font-semibold ${titleColor[tone]}`}>{title}</h4>
      <p className="mt-1 text-sm text-slate-700 italic">{situation}</p>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Most
          </span>
          <p className="mt-0.5 text-slate-700">{old}</p>
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Új modellben
          </span>
          <p className="mt-0.5 text-slate-700">{newDesc}</p>
        </div>
      </div>
    </div>
  )
}
