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
  { id: 'service', label: 'Igehirdetés', Icon: BookOpen, short: 'Szolgálati alkalmak rögzítése' },
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
        <li><strong>Igehirdetés</strong> — istentiszteletek, bibliaórák, áhítatok</li>
        <li><strong>Katekézis</strong> — hittan, konfirmációi előkészítő, ifjúsági órák</li>
        <li><strong>Családlátogatás</strong> — családlátogatás, kórház, idősek otthona, börtön</li>
        <li><strong>Lelkészi jelentés</strong> — havi és éves összesítés exportálással</li>
      </ul>
      <S>Miért fontos?</S>
      <p>
        A lelkészi jelentés a felsőbb egyházi hatóságok felé kötelező — az esperesi hivatal
        és a püspöki vizitáció ezt ellenőrzi. Ha napról-napra rögzíted a szolgálatot,
        az év végi jelentés <strong>automatikusan</strong> elkészül.
      </p>
    </>
  )
}

function ServiceContent() {
  return (
    <>
      <p>
        Az <strong>Igehirdetés</strong> fülön a szolgálati alkalmakat rögzíted. 8 típus érhető el:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Istentisztelet (vasárnap-délelőtti, délutáni)</li>
        <li>Igehirdetés</li>
        <li>Úrvacsora</li>
        <li>Bibliaóra</li>
        <li>Imaóra</li>
        <li>Esti áhítat</li>
        <li>Alkalmi istentisztelet (esketés, temetés, keresztelés)</li>
        <li>Egyéb szolgálat</li>
      </ul>
      <S>Mit érdemes minden alkalomhoz rögzíteni?</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Időpont</strong> — dátum és óra</li>
        <li><strong>Cím</strong> — pl. „A jó pásztor példázata"</li>
        <li><strong>Alapige</strong> — pl. „Lk 15,1-7"</li>
        <li><strong>Bibliaolvasás</strong> — az alkalmon felolvasott szakasz</li>
        <li><strong>Énekek</strong> — pl. „274, 484, 489" (énekszámok)</li>
        <li><strong>Jelenlét</strong> — férfi, nő, gyermek bontásban</li>
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
        A <strong>Katekézis</strong> fülön a hitoktatás óráit rögzíted. 6 típus érhető el:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Bibliaóra</li>
        <li>Hittan (iskolai)</li>
        <li>Konfirmáció előkészítő</li>
        <li>Ifjúsági óra</li>
        <li>Gyermek foglalkozás</li>
        <li>Egyéb katekázis</li>
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
        A <strong>Családlátogatás</strong> fülön a pásztori látogatásokat rögzíted. 5 típus:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Családlátogatás (otthoni)</li>
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
        A megjegyzés bizalmas — csak a saját felhasználói munkamenetéből érhető el.
        Ne tartalmazzon olyan adatot, ami GDPR szempontból érzékeny lenne.
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
        <li><strong>Időpont</strong> — dátum (és óra ajánlott)</li>
        <li><strong>Típus</strong> — a 3 kategória egyik altípusa</li>
        <li><strong>Cím</strong> — az alkalom rövid leírása</li>
      </ul>

      <S>Opcionális mezők</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Alapige, bibliaolvasás (igehirdetésnél javallott)</li>
        <li>Énekek</li>
        <li>Szolgálatvezető — ha NEM a fő-lelkész vezette (pl. legátus)</li>
        <li>Jelenlét — férfi, nő, gyermek bontás</li>
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
        <li><strong>Jelenlét</strong> — összes résztvevő férfi/nő/gyermek bontásban</li>
        <li><strong>Persely</strong> — összes perselyi bevétel RON-ban</li>
      </ul>

      <S>Időszak kiválasztása</S>
      <p>
        Alapesetben az aktuális hónap látható. A felül lévő hónapválasztóval bármely
        elmúlt hónapot lehet megnézni. Az éves jelentéshez a 12 hónapot kell áttekinteni
        — vagy az export funkciót használni.
      </p>
    </>
  )
}

function PrintContent() {
  return (
    <>
      <S>CSV export</S>
      <p>
        Az „Export" gombbal letölthető egy <strong>CSV fájl</strong>, ami az aktuálisan
        szűrt időszak minden bejegyzését tartalmazza. Oszlopok: dátum, típus, cím,
        alapige, bibliaolvasás, énekek, szolgálatvezető, jelenlét, persely, megjegyzés.
      </p>

      <S>Nyomtatási központ</S>
      <p>
        A „Nyomtatási központ" gomb a hivatalos lelkészi jelentés űrlapját generálja
        PDF formátumban. Két változat érhető el:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Egyszerű űrlap</strong> — a hivatalos sorrendben</li>
        <li><strong>Munkanapló-egybeépített</strong> — minden naplóbejegyzés is megjelenik a jelentés mellett</li>
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
