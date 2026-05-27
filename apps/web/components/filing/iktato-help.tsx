'use client'

import { useState } from 'react'
import {
  ChevronRight,
  FileText,
  FolderTree,
  Hash,
  Info,
  Inbox,
  LayoutTemplate,
  ListChecks,
} from 'lucide-react'

interface HelpCategory {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  short: string
}

const CATEGORIES: HelpCategory[] = [
  { id: 'general', label: 'Általános', Icon: Info, short: 'Mit szolgál az Iktató' },
  { id: 'numbering', label: 'Iktatószám', Icon: Hash, short: 'Évenkénti sorszámozás' },
  { id: 'direction', label: 'Bejövő / Kimenő', Icon: Inbox, short: 'Irat-irányok megkülönböztetése' },
  { id: 'folders', label: 'Ügyköri besorolás', Icon: FolderTree, short: '3 fő ügyköri kategória (F.Á. / É.Á. / A.K.)' },
  { id: 'fields', label: 'Iratmező-szabályok', Icon: ListChecks, short: 'Kötelező és opcionális mezők' },
  { id: 'status', label: 'Elintézés állapot', Icon: FileText, short: 'Nyitott / Kész követés' },
  { id: 'templates', label: 'Sablonok', Icon: LayoutTemplate, short: 'Gyakori dokumentum-sablonok' },
]

export function IktatoHelp() {
  const [active, setActive] = useState<string>(CATEGORIES[0].id)
  const activeCategory = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0]

  return (
    <div className="card-raised overflow-hidden p-0">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-[500px]">
        <aside className="border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r">
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Súgó</p>
            <h2 className="mt-1 font-heading text-xl text-slate-800">Iktató</h2>
            <p className="mt-1 text-xs text-slate-500">Iratkezelés és iktatás</p>
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
            {active === 'numbering' && <NumberingContent />}
            {active === 'direction' && <DirectionContent />}
            {active === 'folders' && <FoldersContent />}
            {active === 'fields' && <FieldsContent />}
            {active === 'status' && <StatusContent />}
            {active === 'templates' && <TemplatesContent />}
          </div>
        </main>
      </div>
    </div>
  )
}

function S({ children }: { children: React.ReactNode }) {
  return <h4 className="font-heading text-base font-semibold text-slate-800 mt-5 first:mt-0">{children}</h4>
}
function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">{children}</code>
}

function GeneralContent() {
  return (
    <>
      <p>
        Az <strong>Iktató</strong> a gyülekezet hivatalos iratforgalmát rögzíti — minden
        bejövő és kimenő irat egyedi <strong>iktatószámot</strong> kap, amellyel
        nyomonkövethető és visszakereshető.
      </p>
      <S>Mire jó?</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Bejövő levelek, kérvények, határozatok bejegyzése.</li>
        <li>Kimenő hivatalos iratok regisztrálása.</li>
        <li>Évenkénti folyamatos sorszámozás (2026/1, 2026/2, …).</li>
        <li>Ügykörjegyzék szerinti besorolás (F.Á. / É.Á. / A.K.).</li>
        <li>Elintézés állapotának követése (Nyitott / Kész).</li>
      </ul>
    </>
  )
}

function NumberingContent() {
  return (
    <>
      <p>
        Minden irat automatikus <strong>iktatószámot</strong> kap a formában{' '}
        <C>ÉV/SORSZÁM</C> (pl. <C>2026/1</C>, <C>2026/2</C>, <C>2026/3</C>).
      </p>
      <S>Hogyan generálódik?</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Évenként <strong>1-től újraindul</strong> a sorszámozás.</li>
        <li>A rendszer automatikusan adja a következő szabad számot, NEM kell kézzel beírni.</li>
        <li>Az iktatószám az irat-kartonon és minden nyomtatványon megjelenik.</li>
        <li>A számozás <strong>folyamatos</strong> — nem lehet közben kihagyni vagy átsorszámozni.</li>
      </ul>
      <S>Tipp</S>
      <p>
        Ha egy bejegyzést megnyitsz és észreveszed, hogy az iktatószám hibás vagy
        átfedés van, NE töröld — szólj az adminnak, mert utólagos kiigazítás csak
        ellenőrzés (Esperesi vagy Püspöki vizitáció) keretében lehetséges.
      </p>
    </>
  )
}

function DirectionContent() {
  return (
    <>
      <p>
        Minden irat <strong>iránya</strong> kötelezően kétféle lehet:
      </p>
      <ul className="list-disc pl-5 space-y-2">
        <li>
          <strong>Bejövő (Inbound)</strong> — kívülről érkező irat: pl. esperesi hivatal
          rendelete, hatósági levél, magánszemélyek kérvényei, banki értesítések.
        </li>
        <li>
          <strong>Kimenő (Outbound)</strong> — a gyülekezet által kibocsátott irat: pl.
          hivatalos válaszlevél, határozat-másolat, bizonylat, igazolás.
        </li>
      </ul>
      <S>Miért fontos a megkülönböztetés?</S>
      <p>
        A bejövő iratok az ügyintézési folyamat <em>kezdetét</em> jelölik, a kimenő iratok
        annak <em>lezárását</em>. A statisztika és a havi/éves jelentések ezt a bontást
        használják.
      </p>
    </>
  )
}

function FoldersContent() {
  return (
    <>
      <p>
        Minden iratot besorolunk a 3 hivatalos <strong>ügykörjegyzék-kategóriába</strong>{' '}
        (2024. január 1-től érvényes az új ügykörjegyzék).
      </p>
      <S>F.Á. — Egyéb iratok</S>
      <p>
        Általános levelezés, beadványok, hivatalos közlemények, közköltség-számlák,
        szerződések, jegyzőkönyvek mellékletei.
      </p>
      <S>É.Á. — Éves adminisztráció</S>
      <p>
        Pénzügyi vonatkozású iratok: költségvetés, számadás, bérleti szerződések,
        pénzügyi vizsgálati jegyzőkönyvek, kongrua-iratok.
      </p>
      <S>A.K. — Anyakönyvi</S>
      <p>
        Az anyakönyvi nyilvántartással kapcsolatos hivatalos iratok: keresztelési-,
        konfirmálási-, esketési-, temetési bejegyzések állami szolgáltatás felé,
        áttérési és kitérési igazolások, anyakönyvi kivonatok.
      </p>
      <S>Hol találom az ügykörjegyzéket?</S>
      <p>
        A reformatus.ro/dokumentumok/torvenyek oldalon a kántorvizsga anyagánál,
        valamint a nyomtatványok mappában.
      </p>
    </>
  )
}

function FieldsContent() {
  return (
    <>
      <S>Kötelező mezők</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Irány</strong> — bejövő vagy kimenő</li>
        <li><strong>Ügykör</strong> — F.Á. / É.Á. / A.K.</li>
        <li><strong>Kelt</strong> — az irat keltezésének dátuma</li>
        <li><strong>Tárgy</strong> — rövid leírás (pl. „Esperesi körlevél: költségvetési határidő")</li>
      </ul>
      <S>Opcionális mezők</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Feladó / Címzett</strong> — bejövő esetén a feladó, kimenő esetén a címzett</li>
        <li><strong>Tárgykivonat</strong> — bővebb tartalmi összefoglaló</li>
        <li><strong>Elintézés dátuma</strong> — amikor a választ / intézkedést meghoztuk</li>
        <li><strong>Irattári jel</strong> — fizikai irattár szerinti hivatkozás</li>
        <li><strong>Megjegyzés</strong> — szabad belső kommentár</li>
      </ul>
      <S>Tipp</S>
      <p>
        A tárgyat lehetőleg <strong>tömören, egyértelműen</strong> fogalmazd meg —
        később keresésnél ezen találod meg az iratot.
      </p>
    </>
  )
}

function StatusContent() {
  return (
    <>
      <p>
        Az iratok két állapotban lehetnek a feldolgozás szempontjából:
      </p>
      <ul className="list-disc pl-5 space-y-2">
        <li>
          <strong>Nyitott</strong> — az „Elintézés dátuma" mező üres. Az irat még
          intézkedésre vár (válasz, határozat, fizikai cselekvés).
        </li>
        <li>
          <strong>Kész</strong> — az „Elintézés dátuma" be van állítva. Az ügy le van zárva.
        </li>
      </ul>
      <S>Mikor állítsam „Kész"-re?</S>
      <p>
        Amikor a bejövő iratra megírtad a választ (és azt is iktattad kimenőként), VAGY
        a hatósági intézkedést végrehajtottad. A kimenő iratokat általában már a
        bejegyzéskor „Kész"-nek lehet jelölni (ha másnap kerül postázásra, akkor a
        postázás napjára kerül az elintézés).
      </p>
      <S>Statisztika</S>
      <p>
        Az áttekintő stat-kártyán megjelenik az összes irat, bejövő, kimenő és a
        <strong> nyitott (függő) iratok</strong> száma — utóbbi a soron lévő feladatokat mutatja.
      </p>
    </>
  )
}

function TemplatesContent() {
  return (
    <>
      <p>
        A „Sablonok" gombra kattintva előre kitöltött iratmintákat találsz a leggyakoribb
        hivatalos iratokhoz, hogy gyorsabban kelthessünk új iratokat.
      </p>
      <S>Példák</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Bizonyítvány keresztelésről</li>
        <li>Igazolás konfirmációról</li>
        <li>Lakcímváltozás-bejelentés</li>
        <li>Beáll/kilépés-igazolás</li>
        <li>Bérleti szerződés-tervezet</li>
      </ul>
      <S>Hogyan használjam?</S>
      <p>
        Egy sablon kiválasztása megnyitja az új-irat dialógust az alapadatokkal előre
        kitöltve. Csak a konkrét adatokat (név, dátum, hivatkozás) kell pótolni, az
        iktatószám automatikusan generálódik.
      </p>
    </>
  )
}
