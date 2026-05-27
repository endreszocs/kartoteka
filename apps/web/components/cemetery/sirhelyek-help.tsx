'use client'

import { useState } from 'react'
import {
  ChevronRight,
  Cross,
  FileText,
  Info,
  ListChecks,
  MapPin,
  RefreshCw,
  Users,
} from 'lucide-react'

interface HelpCategory {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  short: string
}

const CATEGORIES: HelpCategory[] = [
  { id: 'general', label: 'Általános', Icon: Info, short: 'Mit szolgál a Sírhelyek modul' },
  { id: 'identifier', label: 'Sírhely-azonosítás', Icon: MapPin, short: 'Parcella, sor, szám rendszer' },
  { id: 'status', label: 'Sírhely-állapotok', Icon: ListChecks, short: '5 lehetséges állapot' },
  { id: 'rental', label: 'Bérlés és megváltás', Icon: RefreshCw, short: '25 éves bérleti idő, megújítás' },
  { id: 'deceased', label: 'Elhunytak nyilvántartása', Icon: Cross, short: 'Egy sírhelyhez több elhunyt' },
  { id: 'cemeteries', label: 'Temetők (több temető)', Icon: Users, short: 'Több temető kezelése' },
  { id: 'workflow', label: 'Gyakorlati munkamenet', Icon: FileText, short: 'Új bérlet rögzítése lépésről lépésre' },
]

export function SirhelyekHelp() {
  const [active, setActive] = useState<string>(CATEGORIES[0].id)
  const activeCategory = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0]

  return (
    <div className="card-raised overflow-hidden p-0">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-[500px]">
        <aside className="border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r">
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Súgó</p>
            <h2 className="mt-1 font-heading text-xl text-slate-800">Sírhelyek</h2>
            <p className="mt-1 text-xs text-slate-500">Temetők és bérletek kezelése</p>
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
                    isActive ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${isActive ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                    <cat.Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>{cat.label}</span>
                    <span className="block truncate text-[11px] text-slate-500">{cat.short}</span>
                  </span>
                  <ChevronRight className={`size-3.5 shrink-0 ${isActive ? 'text-slate-400' : 'opacity-0'}`} />
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="px-5 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <activeCategory.Icon className="size-5" />
            </span>
            <div>
              <h3 className="font-heading text-2xl text-slate-800">{activeCategory.label}</h3>
              <p className="mt-0.5 text-sm text-slate-500">{activeCategory.short}</p>
            </div>
          </div>

          <div className="space-y-5 text-sm leading-relaxed text-slate-700">
            {active === 'general' && <GeneralContent />}
            {active === 'identifier' && <IdentifierContent />}
            {active === 'status' && <StatusContent />}
            {active === 'rental' && <RentalContent />}
            {active === 'deceased' && <DeceasedContent />}
            {active === 'cemeteries' && <CemeteriesContent />}
            {active === 'workflow' && <WorkflowContent />}
          </div>
        </main>
      </div>
    </div>
  )
}

function S({ children }: { children: React.ReactNode }) {
  return <h4 className="font-heading text-base font-semibold text-slate-800 mt-5 first:mt-0">{children}</h4>
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
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

function GeneralContent() {
  return (
    <>
      <p>
        A <strong>Sírhelyek</strong> modul a gyülekezeti tulajdonban lévő temetők és azok
        sírhelyeinek nyilvántartására szolgál. Minden sírhelyhez tartozhat egy aktív
        bérlet, és több elhunyt is.
      </p>
      <S>Mire jó?</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Sírhelyek katasztere — minden parcella, sor, szám szerint visszakereshető.</li>
        <li>Bérleti idő követése — 25 éves alapidő, megújítható.</li>
        <li>Elhunytak nyilvántartása sírhelyenként.</li>
        <li>Pénzügyi vonatkozás: a sírhely-bérleti díjak a <em>101.06</em> kódon kerülnek
          bevételezésre a Pénzügy modulban.</li>
        <li>Lejáró bérletek figyelmeztetése — kapcsolatfelvétel az érintett családokkal.</li>
      </ul>
    </>
  )
}

function IdentifierContent() {
  return (
    <>
      <p>
        Minden sírhelyet 3 információ azonosít egyértelműen:
      </p>
      <S>Az azonosítás 3 eleme</S>
      <ul className="list-disc pl-5 space-y-1.5">
        <li><strong>Parcella</strong> — a temető nagyobb területi egysége (pl. „A", „B", „Régi rész")</li>
        <li><strong>Sor</strong> — a parcellán belüli sor száma</li>
        <li><strong>Szám</strong> — a soron belüli sírhely sorszáma</li>
      </ul>
      <p>
        A rendszerben ez <strong>„A/1/1"</strong> vagy <strong>„B/5/12"</strong> formátumban
        jelenik meg.
      </p>

      <S>További opcionális adatok</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Hely</strong> — szabad szöveg a pontos elhelyezkedéshez</li>
        <li><strong>Méret</strong> — egyes, kettes, családi (m²)</li>
        <li><strong>Típus</strong> — földbe temetés vagy urna-fülke</li>
      </ul>

      <S>Tipp — egységes parcella-nevezés</S>
      <p>
        A parcella nevezésében legyen <em>következetesség</em> (pl. mindig „A", „B" stb.,
        ne keverve „Régi-1" és „A" jelölésekkel). A keresés és statisztika ezen alapul.
      </p>
    </>
  )
}

function StatusContent() {
  return (
    <>
      <p>
        Minden sírhely <strong>5 lehetséges állapot</strong> egyikében lehet:
      </p>
      <ul className="list-disc pl-5 space-y-2.5">
        <li>
          <Pill tone="emerald">Szabad</Pill>
          {' '}— értékesíthető, nincs aktív bérlet vagy elhunyt.
        </li>
        <li>
          <Pill tone="cyan">Foglalt</Pill>
          {' '}— aktív bérlet és/vagy van elhunyt. A bérleti idő érvényben van.
        </li>
        <li>
          <Pill tone="amber">Lejárt</Pill>
          {' '}— a bérleti idő letelt, a család nem újította meg. Figyelmeztetni
          érdemes a kapcsolattartót megújításra.
        </li>
        <li>
          <Pill tone="red">Zárt</Pill>
          {' '}— hivatalosan lezárt sírhely (pl. nem újrahasznosítható, történelmi
          jelentőségű, vagy bontási tilalom alatt).
        </li>
        <li>
          <Pill tone="violet">Fenntartott</Pill>
          {' '}— ígéret vagy elővásárlási jog alapján fenntartva, de még nincs aktív
          bérlet. Pl. egy család előre kéri egy sírhely fenntartását, befizetés még
          nem történt.
        </li>
      </ul>

      <S>Állapot-változás</S>
      <p>
        Az állapot a felhasználói műveletek alapján automatikusan változik (új bérlet
        rögzítésével „foglalt"-ra; bérleti idő lejártakor „lejárt"-ra). Manuális
        módosítás is lehetséges a sírhely-kartonon.
      </p>
    </>
  )
}

function RentalContent() {
  return (
    <>
      <p>
        A sírhelyek <strong>bérlet</strong> vagy <strong>megváltás</strong> útján
        kerülnek családokhoz.
      </p>

      <S>Bérleti idő — alapértelmezett 25 év</S>
      <p>
        Az új bérlet alapértelmezett lejárati dátuma <strong>a mai naptól számított 25 év</strong>.
        Ezt a presbitérium szabályzata módosíthatja, de hagyományosan 25 év.
      </p>

      <S>A bérlet adatai</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Bérlő</strong> — a bérleti jogot szerző család tagja (általában az élő hozzátartozó)</li>
        <li><strong>Megváltás dátuma</strong> — a bérleti szerződés keltezése</li>
        <li><strong>Lejárat dátuma</strong> — alapértelmezett: + 25 év</li>
        <li><strong>Összeg (RON)</strong> — a megváltási / bérleti díj</li>
        <li><strong>Típus</strong> — bérlet (időleges) vagy megváltás (örökös, ha a szabályzat ezt megengedi)</li>
      </ul>

      <S>Megújítás (lejáratakor)</S>
      <p>
        Ha a bérleti idő lejár és a család meg akarja újítani, akkor új bérleti
        bejegyzést rögzítünk a meglévő sírhelyhez — a régi bérlet lezárul, az új
        25 évre indul. A pénzügyi bevételezés (101.06) kapcsolódik hozzá.
      </p>

      <S>Lejáró bérletek követése</S>
      <p>
        A rendszer kiemeli azokat a sírhelyeket, amelyek bérleti ideje a következő
        1-2 éven belül lejár — ezekkel <em>időben</em> érdemes kapcsolatba lépni a
        családokkal, hogy megújíthassák.
      </p>
    </>
  )
}

function DeceasedContent() {
  return (
    <>
      <p>
        Minden sírhelyhez <strong>több elhunyt</strong> is tartozhat — nem ritka, hogy egy
        családi sírhelyben két-három személy nyugszik.
      </p>

      <S>Az elhunyt adatai</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Név</strong> — a hivatalos név (kötelező)</li>
        <li><strong>Születési dátum</strong> — opcionális, de ajánlott</li>
        <li><strong>Halál dátuma</strong> — opcionális</li>
        <li><strong>Temetés dátuma</strong> — opcionális</li>
      </ul>

      <S>Kapcsolat az Anyakönyv modullal</S>
      <p>
        Az <strong>Anyakönyv → Temetés</strong> bejegyzéseit célszerű a sírhely-bejegyzéssel
        is összekapcsolni. Új temetés rögzítésekor érdemes a sírhely-kartonra is felvenni
        az elhunyt nevét és dátumait.
      </p>

      <S>Tipp — keresési segítség</S>
      <p>
        Ha egy család rákérdez „hol nyugszik az elhunyt hozzátartozó", az elhunyt nevére
        rákeresve a rendszer megmutatja a sírhelyét (parcella/sor/szám).
      </p>
    </>
  )
}

function CemeteriesContent() {
  return (
    <>
      <p>
        Egy gyülekezet több <strong>temetőt</strong> is kezelhet — pl. régi és új temető,
        vagy szórvány temető, ha van.
      </p>

      <S>A temető adatai</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Név</strong> — pl. „Új temető", „Régi-temető", „Szórvány temető"</li>
        <li><strong>Cím</strong> — fizikai hely</li>
        <li><strong>Megjegyzés</strong> — szabad szöveg (pl. történeti adat)</li>
        <li><strong>Aktív</strong> — ha az adott temetőben már nem temetünk, inaktívra állítható</li>
      </ul>

      <S>Statisztika temetőnként</S>
      <p>
        A statisztika-kártyák minden temetőre külön összesítést mutatnak (összes sírhely,
        szabad, foglalt, lejárt). A „Lejárt" sírhelyek listája a megújítási
        kapcsolatfelvételhez hasznos.
      </p>

      <S>Vizuális nézet</S>
      <p>
        A sírhelyek <strong>táblázatos</strong> vagy <strong>kártyás</strong> nézetben is
        megjeleníthetők — a kártyás nézet áttekinthetőbb, ha sok sírhely van egy temetőben.
      </p>
    </>
  )
}

function WorkflowContent() {
  return (
    <>
      <S>Új bérlet rögzítése — lépésről lépésre</S>
      <ol className="list-decimal pl-5 space-y-2">
        <li>
          <strong>Keresd ki a sírhelyet</strong> a parcella/sor/szám alapján a táblázatban,
          VAGY ha új sírhely, először hozd létre.
        </li>
        <li>
          <strong>Kattints a sírhelyre</strong> a részletek megnyitásához.
        </li>
        <li>
          <strong>Új bérlet</strong> gombra kattintva töltsd ki: bérlő neve, dátum, összeg,
          típus (bérlet vagy megváltás).
        </li>
        <li>
          A rendszer <strong>automatikusan beállítja</strong> a lejárati dátumot
          (megváltás + 25 év), de manuálisan módosítható.
        </li>
        <li>
          <strong>Pénzügyi bevétel</strong>: külön a Pénzügy modulban rögzítendő a befizetést
          a <em>101.06 — Sírhelyek eladásából, bérleti díjából</em> kódra.
        </li>
        <li>
          A sírhely állapota automatikusan <strong>„foglalt"</strong>-ra változik.
        </li>
      </ol>

      <S>Új elhunyt rögzítése</S>
      <ol className="list-decimal pl-5 space-y-2">
        <li>Nyisd meg a sírhely-kartont.</li>
        <li>Az „Új elhunyt" gombra kattintva töltsd ki a nevet és dátumokat.</li>
        <li>Mentés után az elhunyt megjelenik a sírhely listájában.</li>
        <li>
          Külön a Anyakönyv → Temetés modulba is rögzítendő az adat, ha az állami
          anyakönyvi bejegyzés is megtörtént.
        </li>
      </ol>

      <S>Megújítás</S>
      <p>
        Amikor egy lejárt bérletet a család megújít, egyszerűen rögzíts egy új bérletet a
        meglévő sírhelyhez — a rendszer követi az időszakokat. Az új lejárati dátum az új
        megváltás-dátum + 25 év.
      </p>
    </>
  )
}
