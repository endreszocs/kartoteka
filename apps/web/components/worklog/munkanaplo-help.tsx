'use client'

import { useState } from 'react'
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Heart,
  Info,
  ListChecks,
  Printer,
  Table2,
  Users,
} from 'lucide-react'

interface HelpCategory {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  short: string
}

const CATEGORIES: HelpCategory[] = [
  { id: 'general', label: 'Általános', Icon: Info, short: 'Mit szolgál a Munkanapló' },
  { id: 'table', label: 'Táblázatos rögzítés', Icon: Table2, short: 'Gyors bevitel, okos mezők' },
  { id: 'service', label: 'Szolgálat', Icon: BookOpen, short: 'Szolgálati alkalmak rögzítése' },
  { id: 'catechesis', label: 'Katekézis', Icon: ListChecks, short: 'Hittan, bibliaóra, ifjúság' },
  { id: 'visits', label: 'Látogatás', Icon: Heart, short: 'Családlátogatás, kórház, idősek' },
  { id: 'fields', label: 'Bejegyzés-mezők', Icon: ClipboardCheck, short: 'Kötelező és opcionális adatok' },
  { id: 'report', label: 'Lelkészi jelentés', Icon: Users, short: 'Havi és éves összesítés' },
  { id: 'print', label: 'Export és nyomtatás', Icon: Printer, short: 'CSV export, hivatalos jelentés' },
]

export function MunkanaploHelp() {
  const [active, setActive] = useState<string>(CATEGORIES[0].id)
  const activeCategory = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0]

  return (
    <div className="card-raised overflow-hidden p-0">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-[500px]">
        <aside className="border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r">
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Súgó</p>
            <h2 className="mt-1 font-heading text-xl text-slate-800">Munkanapló</h2>
            <p className="mt-1 text-xs text-slate-500">Lelkészi szolgálat dokumentálása</p>
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
            {active === 'table' && <TableContent />}
            {active === 'service' && <ServiceContent />}
            {active === 'catechesis' && <CatechesisContent />}
            {active === 'visits' && <VisitsContent />}
            {active === 'fields' && <FieldsContent />}
            {active === 'report' && <ReportContent />}
            {active === 'print' && <PrintContent />}
          </div>
        </main>
      </div>
    </div>
  )
}

function S({ children }: { children: React.ReactNode }) {
  return <h4 className="font-heading text-base font-semibold text-slate-800 mt-5 first:mt-0">{children}</h4>
}

function GeneralContent() {
  return (
    <>
      <p>
        A <strong>Munkanapló</strong> a lelkipásztori szolgálat napi rögzítésére szolgál.
        Itt naplózod az igehirdetéseket, a katekézis óráit és a látogatásokat.
        Az új lelkészi jelentés (2026-tól kötelező) ezekből az adatokból automatikusan
        elkészül.
      </p>
      <S>A modul fő részei</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Szolgálat</strong> — istentiszteletek, bibliaórák, áhítatok</li>
        <li><strong>Katekézis</strong> — hittan, konfirmációi előkészítő, ifjúsági órák</li>
        <li><strong>Látogatás</strong> — családlátogatás, kórház, idősek otthona, börtön</li>
        <li><strong>Lelkészi jelentés</strong> — havi és éves összesítés exportálással</li>
      </ul>
      <p>
        A fülek felett az <strong>év-összkép</strong> mutatja a kiválasztott év
        alkalmait, átlagjelenlétét, persely-összegét és az úrvacsorázók számát,
        havi bontású mini-diagrammal.
      </p>
      <S>Miért fontos?</S>
      <p>
        A lelkészi jelentés a felsőbb egyházi hatóságok felé kötelező — az esperesi hivatal
        és a püspöki vizitáció ezt ellenőrzi. Ha napról-napra rögzíted a szolgálatot,
        az év végi jelentés <strong>automatikusan</strong> elkészül.
      </p>
    </>
  )
}

// 2026-07-11 (F2): új szakasz — a táblázatos rögzítő és az okos mezők súgója.
function TableContent() {
  return (
    <>
      <p>
        Számítógépen (szélesebb képernyőn) a kategória-fülek alatt egy <strong>táblázatos
        rögzítő</strong> jelenik meg, ami a hivatalos nyomtatott munkanapló
        oszloprendjét követi. A sorok <strong>közvetlenül a táblázatban</strong> szerkeszthetők,
        külön ablak nélkül.
      </p>
      <S>Gyors bevitel — Tab és Enter</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>A cellák közt a <strong>Tab</strong> billentyűvel lehet lépkedni.</li>
        <li>Az <strong>Enter</strong> azonnal menti a sort; új sornál a fókusz visszaugrik a dátumra, így folyamatosan lehet diktálni.</li>
        <li>A sor akkor is mentődik, amikor a fókusz elhagyja (másik sorra kattintás).</li>
        <li>A még nem mentett (piszkos) sort bal oldali színes szegély jelzi; mentés közben kis pörgő ikon látszik.</li>
        <li>A táblázat alján <strong>mindig áll egy üres új sor</strong> — a dátum és a jelleg kitöltése után magától mentődik.</li>
      </ul>
      <S>Ének-kereső</S>
      <p>
        Az <strong>Énekek</strong> mezőben szám vagy szövegrészlet alapján javaslatok
        jelennek meg az énekeskönyvből — a kiválasztott ének száma bekerül a mezőbe,
        vesszővel folytatható a következő. A felismert énekek címe a mező alatt
        (táblázatban tooltipben) látható.
      </p>
      <S>Igevers-előnézet</S>
      <p>
        Az <strong>Alapige</strong> és a <strong>Bibliaolvasás</strong> mező gépelés közben
        ellenőrzi a hivatkozást, és kanonikus alakra igazítja (pl. „jn 3 16” → „Jn 3,16”).
        Érvényes hivatkozásnál a könyv-ikonra kattintva megnyílik a
        <strong> Károli-szöveg előnézete</strong>.
      </p>
      <S>Napszak és úrvacsorázók</S>
      <p>
        Szolgálati alkalomnál rögzíthető a <strong>napszak</strong> (délelőtt / délután / este),
        valamint az <strong>úrvacsorázók</strong> száma templomban és betegeknél — ezek az
        év-összképben és a jelentésekben is megjelennek.
      </p>
      <S>Telefonon</S>
      <p>
        Kis képernyőn a kártyás lista és az „Új bejegyzés” gombbal nyíló
        <strong> rögzítő ablak</strong> az elsődleges út — ugyanabba az adatbázisba ment,
        mint a táblázat.
      </p>
    </>
  )
}

function ServiceContent() {
  return (
    <>
      <p>
        A <strong>Szolgálat</strong> fülön a szolgálati alkalmakat rögzíted. 12 típus érhető el:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Istentisztelet (vasárnap-délelőtti, délutáni)</li>
        <li>Igehirdetés</li>
        <li>Úrvacsora</li>
        <li>Bibliaóra (felnőtt alkalom — az ifjúsági/IKE bibliaóra a Katekézis fülön)</li>
        <li>Imaóra</li>
        <li>Esti áhítat</li>
        <li>Alkalmi istentisztelet</li>
        <li>Keresztelő, Esketés, Temetés, Konfirmáció (az anyakönyvi rögzítésből automatikusan is ide kerülnek)</li>
        <li>Egyéb szolgálat</li>
      </ul>
      <S>Mit érdemes minden alkalomhoz rögzíteni?</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Időpont</strong> — az alkalom dátuma</li>
        <li><strong>Napszak</strong> — délelőtt / délután / este</li>
        <li><strong>Cím</strong> — pl. „A jó pásztor példázata”</li>
        <li><strong>Alapige</strong> — pl. „Lk 15,1-7”</li>
        <li><strong>Bibliaolvasás</strong> — az alkalmon felolvasott szakasz</li>
        <li><strong>Énekek</strong> — pl. „274, 484, 489” (énekszámok)</li>
        <li><strong>Jelenlét</strong> — férfi, nő, gyermek bontásban</li>
        <li><strong>Úrvacsorázók</strong> — templomban és betegeknél (úrvacsorás alkalomnál)</li>
        <li><strong>Persely</strong> — RON-ban</li>
      </ul>
      <S>Tipp</S>
      <p>
        Ha rendszeres istentiszteletet (vasárnap-délelőtt) rögzítesz, érdemes a
        cím-mezőt is kitölteni rövid utalással — hónapok múlva is felismerd, mi volt
        az alkalom tárgya.
      </p>
    </>
  )
}

function CatechesisContent() {
  return (
    <>
      <p>
        A <strong>Katekézis</strong> fülön a hitoktatás óráit rögzíted. 8 típus érhető el:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Ifjúsági bibliaóra (IKE)</li>
        <li>Hittan (iskolai)</li>
        <li>Vallásóra</li>
        <li>Kátéóra</li>
        <li>Konfirmáció előkészítő</li>
        <li>Ifjúsági óra</li>
        <li>Gyermek foglalkozás</li>
        <li>Egyéb katekézis</li>
      </ul>
      <S>Megjegyzések</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          A hittanoktatás az iskolai órarendet követi — érdemes hetente egyszer
          rögzíteni a megtartott órákat.
        </li>
        <li>
          A konfirmáció előkészítő órákat egyenként rögzítsd — a végén az anyakönyvi
          konfirmáció bejegyzéshez hasznos visszanézni a részvételt.
        </li>
        <li>
          A jelenlét gyermek-bontásban különösen fontos: az éves jelentésben szerepel
          a gyermek-katekézis statisztika.
        </li>
      </ul>
    </>
  )
}

function VisitsContent() {
  return (
    <>
      <p>
        A <strong>Látogatás</strong> fülön a pásztori látogatásokat rögzíted. 6 típus:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Családlátogatás (otthoni)</li>
        <li>Beteglátogatás</li>
        <li>Kórházlátogatás</li>
        <li>Idősek otthona</li>
        <li>Börtönlátogatás</li>
        <li>Egyéb látogatás</li>
      </ul>

      <S>Mit rögzítsek?</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Időpont</strong> — a látogatás dátuma</li>
        <li><strong>Cím</strong> — a látogatott személy vagy család neve</li>
        <li><strong>Megjegyzés</strong> — rövid pásztori jegyzet (érzékeny ügyek, követendő)</li>
      </ul>
      <p>
        A megjegyzés a gyülekezeti nyilvántartás része — ne tartalmazzon olyan
        adatot, ami GDPR szempontból érzékeny lenne.
      </p>

      <S>Statisztika</S>
      <p>
        Az éves jelentésben látható, hogy hány <em>családlátogatást</em> végeztél az
        év során — ez fontos pásztori mutató.
      </p>
    </>
  )
}

function FieldsContent() {
  return (
    <>
      <S>Kötelező mezők (minden bejegyzéshez)</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Dátum</strong> — az alkalom napja</li>
        <li><strong>Típus</strong> — a 3 kategória egyik altípusa</li>
      </ul>

      <S>Opcionális mezők</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Cím — az alkalom rövid leírása (erősen ajánlott)</li>
        <li>Napszak — délelőtt / délután / este (szolgálati alkalomnál)</li>
        <li>Alapige, bibliaolvasás (igehirdetésnél javallott)</li>
        <li>Énekek</li>
        <li>Szolgálatvezető — ha NEM a fő-lelkész vezette (pl. legátus)</li>
        <li>Jelenlét — férfi, nő, gyermek bontás</li>
        <li>Úrvacsorázók — templomban / betegeknél (szolgálatnál, üresen hagyható)</li>
        <li>Persely — RON</li>
        <li>Megjegyzés — pásztori jegyzet</li>
      </ul>

      <S>Gyors-bejegyzés</S>
      <p>
        Vasárnaponta egy alkalom rögzítése 1-2 perc. Ha minden vasárnap (vagy hetente)
        rögzíted, az év végi jelentés automatikusan elkészül — nem kell külön
        összeszámolni semmit.
      </p>
    </>
  )
}

function ReportContent() {
  return (
    <>
      <p>
        A <strong>Lelkészi jelentés</strong> fül összegzi az adott hónap / év szolgálati
        adatait. Ez a fül adja az Igazgatótanács <strong>65/2025. számú határozatával</strong>{' '}
        elfogadott új lelkészi jelentési űrlapot, ami 2026-tól kötelező.
      </p>

      <S>Mi található a jelentésben?</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Összes bejegyzés</strong> — az időszakra eső összes szolgálati alkalom</li>
        <li><strong>Igehirdetés / Katekézis / Látogatás</strong> kategóriánkénti bontás</li>
        <li><strong>Jelenlét</strong> — összes résztvevő (férfi + nő + gyermek együtt)</li>
        <li><strong>Persely</strong> — összes perselyi bevétel RON-ban</li>
      </ul>

      <S>Időszak kiválasztása</S>
      <p>
        Alapesetben az aktuális hónap látható. A felül lévő év- és hónapválasztóval
        bármely elmúlt időszakot meg lehet nézni; a hónapválasztó „Egész év” opciójával
        a teljes éves összesítés is egyben megjelenik.
      </p>

      {/* 2026-07-16 (F4): új szakasz — az év-statisztika blokkok súgója. */}
      <S>Év-statisztika</S>
      <p>
        A jelentés-fül alján részletes <strong>év-statisztika</strong> található, ami
        mindig a kiválasztott <em>teljes évből</em> számol — a hónap-szűréstől
        függetlenül, a munkanapló-bejegyzések mezőiből automatikusan:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>Látogatottság</strong> — a szolgálati alkalmak típusonként
          (darabszám, átlagjelenlét, férfi/nő/gyermek és napszak-bontás), a
          leggyakoribb típusok havi trendjével.
        </li>
        <li>
          <strong>Énekek</strong> — az Énekek mezőkből: a leggyakrabban énekelt
          énekek címmel és az utolsó éneklés dátumával, tematikus szakasz-bontás,
          valamint javaslatok régen nem énekelt énekekre.
        </li>
        <li>
          <strong>Igeversek és Biblia-lefedettség</strong> — a leggyakoribb alapigék,
          és hogy a Károli-biblia 31&nbsp;126 verséből hányat érintett az év
          (Alapige + Bibliaolvasás együtt), könyvenkénti hőtérképpel.
        </li>
      </ul>
      <p>
        A statisztikához nem kell semmit külön beállítani — minél pontosabban vannak
        kitöltve az alapige-, bibliaolvasás- és ének-mezők, annál pontosabb a kép.
      </p>

      {/* 2026-07-17 (F5): új szakasz — a hivatalos éves lelkészi jelentés súgója. */}
      <S>Hivatalos lelkészi jelentés (I–X. fejezet)</S>
      <p>
        A jelentés-fül <strong>„Hivatalos lelkészi jelentés”</strong> gombja nyitja meg
        az éves hivatalos jelentés szerkesztőjét, élő A4-előnézettel. A jelentés tíz
        fejezetből áll (I. Lélekszám … X. Missziói terv), és kétféle mezőt tartalmaz:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>Automatikus mezők</strong> — az app élő adataiból számolódnak:
          a lélekszám-mozgás (keresztelés, temetés, betérés/kitérés, költözés) az
          anyakönyvekből és a tagnyilvántartásból, az istentiszteleti alkalmak és az
          átlagjelenlét a munkanaplóból, az anyagi helyzet a pénzügyi modulból. Az
          automatikus érték kézzel <em>felülírható</em>, a felülírás pedig bármikor
          visszaállítható az eredeti számolt értékre.
        </li>
        <li>
          <strong>Kézi mezők</strong> — amit az app nem tud számolni (pl. belmisszió,
          szeretetszolgálat, ingatlanok, események, missziói terv), azt szövegként
          vagy számként kell kitölteni.
        </li>
      </ul>
      <S>Véglegesítés és beküldés</S>
      <p>
        A <strong>véglegesítő varázsló</strong> áttekinti a kulcsszámokat, jelzi a még
        kitöltetlen mezőket, majd rögzíti a határozati adatokat (presbitériumi és
        közgyűlési szám + dátum, iktatószámok, aláírók). A véglegesített jelentés
        zárolt — módosításhoz feloldás kérhető az egyházmegyétől. A lezárt jelentés
        egy gombbal <strong>beküldhető az egyházmegyének</strong>, valamint PDF-ként
        menthető és nyomtatható.
      </p>
    </>
  )
}

function PrintContent() {
  return (
    <>
      <S>CSV export</S>
      <p>
        A „CSV-export” gombbal letölthető egy <strong>CSV fájl</strong>, ami az aktuálisan
        szűrt időszak és kategória minden bejegyzését tartalmazza. Oszlopok: dátum, típus,
        napszak, cím, alapige, bibliaolvasás, énekek, szolgálatvezető, jelenlét,
        úrvacsorázók (templomban / betegnél), persely, megjegyzés.
      </p>

      <S>Nyomtatási központ</S>
      <p>
        A „Nyomtatási központ” gombbal év/hónap választás és élő előnézet mellett
        4 nyomtatvány készíthető — PDF-ként menthető vagy közvetlenül nyomtatható:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Szolgálati összesítő</strong> — istentiszteletek, igehirdetések jelenléttel és perselypénzzel</li>
        <li><strong>Katekétikai összesítő</strong> — a katekézis alkalmak létszámmal</li>
        <li><strong>Diakóniai összesítő</strong> — a lelkipásztori látogatások listája</li>
        <li><strong>Éves lelkészi jelentés</strong> — a hivatalos leadandó jelentés aláírási résszel</li>
      </ul>

      <S>Beküldés</S>
      <p>
        Az új lelkészi jelentés (2026-tól kötelező) az esperesi hivatalon keresztül
        kerül beküldésre az Igazgatótanácsnak. Aláírás kerül rá az esperestől és a
        számvevőtől. A nyomtatott példányt az Iktatóban (kimenő iratként) is regisztrálni
        kell.
      </p>
    </>
  )
}
