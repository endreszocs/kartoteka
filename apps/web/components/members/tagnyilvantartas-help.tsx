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
  Network,
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
    short: 'A 3-rétegű hibrid modell — személy, háztartás, kapcsolat',
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
  // 2026-08-25: gyülekezeti egységek — leány/szórvány tag-besorolás.
  {
    id: 'egysegek',
    label: 'Gyülekezeti egységek',
    Icon: Network,
    short: 'Leány- és szórvány-besorolás',
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
            {active === 'egysegek' && <EgysegekContent />}
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

      {/* 2026-08-25 (GDPR): a személyi szám megjelenítési szabálya.
          2026-09-05: a szakasz SZÉTVÁLT. A régi szöveg egyszerre állította,
          hogy a mező „romániai CNP" és hogy „egyházi belső azonosító" — a
          lelkész pedig abban a hitben adta tovább az Excel-exportot, hogy
          abban személyi szám van. */}
      <SectionTitle>Egyházi azonosító és személyi szám — KÉT különböző dolog</SectionTitle>
      <p>
        A <strong>egyházi azonosító</strong> a rendszer saját, belső kódja
        (<code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">EC-2026-…</code> vagy
        egy <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">999…</code> kezdetű
        szám). Minden tag kap egyet, mert erre épülnek a szülő-gyermek kapcsolatok. Ez
        <strong> nem személyes adat</strong>, és nem a személyi igazolványban szereplő szám.
        Az Excel-exportban is ez az oszlop szerepel, „Egyházi azonosító" fejléccel.
      </p>
      <p>
        A <strong>hivatalos személyi szám (CNP)</strong> ettől külön, a személyi kartonon
        rögzíthető — és szigorúbb védelmet kap:
      </p>
      <ul className="ml-4 list-disc space-y-1">
        <li>
          <strong>Nem kötelező.</strong> Ha nincs rá szükség, hagyd üresen.
        </li>
        <li>
          <strong>Nem tölt le a listával.</strong> Az érték csak akkor jön le a szerverről, ha
          valaki a szem-ikonnal ténylegesen elkéri — addig a böngésző sem látja.
        </li>
        <li>
          <strong>Minden megjelenítés naplózódik</strong> (ki, mikor, kinek a számát nézte meg).
          A napló magát a számot SOHA nem tartalmazza.
        </li>
        <li>
          <strong>Csak a tag saját gyülekezete látja</strong> — a felettes szintek és a
          kereszt-gyülekezeti egyeztetés nem.
        </li>
        <li>
          <strong>Nem kerül bele</strong> az Excel-tükörbe és a kapcsolat nélküli másolatba.
        </li>
        <li>
          A 13 jegyű romániai CNP <strong>ellenőrző számjegyét megvizsgáljuk</strong> — az
          elgépelt szám rosszabb, mint a hiányzó. Külföldi azonosító betűt is tartalmazhat.
        </li>
      </ul>
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
      {/* ───── Bevezető ───── */}
      <p>
        A rendszer a <strong>családot 3 különálló rétegen</strong> tartja számon —
        ezzel le tudjuk képezni a modern életszituációkat is: válás, költözés,
        többgenerációs együttélés, egyetemista gyerek, patchwork-család. A 3 réteg:
      </p>
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 my-3">
        <ol className="text-sm space-y-1 text-slate-700 list-decimal pl-5">
          <li><strong>Személy</strong> — az ember maga (név, születés, vallás)</li>
          <li><strong>Háztartás</strong> — kik laknak most egy fedél alatt + cím + szerepek</li>
          <li><strong>Kapcsolat</strong> — vér szerinti és életen át tartó rokoni kötelékek</li>
        </ol>
      </div>

      {/* ───── Fényképek a tagokhoz (2026-06-12, Endre) ───── */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 my-3">
        <h4 className="text-sm font-semibold text-violet-900 mb-1.5">
          📷 Fényképek a tagokhoz — hogyan működik?
        </h4>
        <p className="text-sm text-slate-700">
          Minden személyhez társíthatsz fényképet — a kép megjelenik a családi
          kártyákon, a családi lapon és a családfán is. Akinek nincs képe, annak
          színes <strong>monogram-korong</strong> jelenik meg (mindig ugyanaz a szín).
        </p>
        <div className="mt-2 rounded-lg border border-violet-100 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Két út</p>
          <ol className="text-sm space-y-1.5 text-slate-700 list-decimal pl-5">
            <li>
              <strong>Közösségi link:</strong> a családi lapon a tag képén lévő kis
              kamera-gombbal megadod a Facebook/Instagram profil-linkjét, és a
              rendszer megpróbálja letölteni a nyilvános profilképet. A{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">facebook.com/profile.php?id=…</code>{' '}
              formátumú link működik a legbiztosabban. A link mentésre kerül a
              kapcsolatokhoz akkor is, ha a kép-letöltés nem sikerül.
            </li>
            <li>
              <strong>Kézi feltöltés:</strong> kiválasztasz egy képfájlt a gépedről —
              a rendszer automatikusan átméretezi. Ha a link-letöltés nem megy
              (a platformok gyakran bejelentkezéshez kötik), ez mindig működik:
              nyisd meg a profilt, mentsd le a képet, töltsd fel — 10 másodperc.
            </li>
          </ol>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          A kép a Kartotéka saját, biztonságos tárhelyére kerül (sosem a közösségi
          oldalról hivatkozzuk) — nyilvánosan közzétett profilképről van szó, amit
          te tudatosan társítasz. A kép bármikor cserélhető vagy törölhető ugyanott.
        </p>
      </div>

      {/* ───── Tartalomjegyzék ───── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Ebben a fejezetben
        </h4>
        <ol className="text-sm space-y-1 text-slate-700 list-decimal pl-5">
          <li>Miért 3 réteg?</li>
          <li>Szótár — a 6 fogalom egyszerű magyarázata</li>
          <li>A 3 kartonlap részletesen</li>
          <li>Egy konkrét család az adatbázisban</li>
          <li>12 élet-példa — Hagyományos modell ↔ A rendszerünk</li>
          <li>Lépésről lépésre — leggyakoribb feladatok</li>
          <li>Anyakönyv-kapcsolat (keresztelő / esketés / temetés)</li>
          <li>Gyakori kérdések</li>
          <li>Adatvédelem — ki látja mit?</li>
          <li>Hibakeresés</li>
        </ol>
      </div>

      {/* ───── 1. Miért 3 réteg? ───── */}
      <SectionTitle>1. Miért 3 réteg?</SectionTitle>
      <p>
        A hagyományos egyszerű családmodell egy dobozba tette: <strong>férj + feleség +
        gyerekek egy cím alatt</strong>. Ez jól működik, amíg minden tradicionális.
      </p>
      <p>
        De a 21. századi gyülekezeti életben az alábbi helyzetekkel szinte
        biztosan találkozunk:
      </p>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        <li>Elvált szülő — a gyerek hol az anyánál, hol az apánál él.</li>
        <li>Újraházasodott pár — mostohagyerekek, féltestvérek.</li>
        <li>Egyetemista gyerek — kollégiumban lakik, de a szüleinél is családtag.</li>
        <li>Özvegy édesanya — a fia családjához költözött.</li>
        <li>Élettárs (nem házas) együttélés — gyerekkel vagy anélkül.</li>
        <li>Külföldön dolgozó házastárs — jogilag itt él, de fizikailag nem.</li>
        <li>Felnőtt gyerek elköltözött, de a szülők még „családtagnak" tekintik.</li>
      </ul>
      <p>
        A hagyományos egydobozos modellben ezek mind kényelmetlen
        kompromisszumokat igényelnének. Ezért használunk 3-rétegű hibrid modellt —
        így a fenti helyzetek <strong>mind természetesen rögzíthetők</strong>.
      </p>

      {/* ───── 2. Szótár ───── */}
      <SectionTitle>2. Szótár — a 6 fogalom egyszerű magyarázata</SectionTitle>
      <p>
        Az új modellben 6 fogalom van. Érdemes egyszer alaposan átolvasni,
        utána már nem lesz kérdéses:
      </p>

      <div className="rounded-xl border border-slate-200 overflow-hidden mt-2">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
              <th className="px-3 py-2 text-left font-semibold text-slate-700 w-1/4">Fogalom</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Mit jelent</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            <tr className="border-b border-slate-100">
              <td className="px-3 py-2 align-top font-semibold">Személy</td>
              <td className="px-3 py-2 align-top">
                Egy konkrét ember (név, születés, vallás, telefonszám). Sose változik —
                csak az adatok frissülnek. Akkor is létezik, ha közben elhunyt,
                elköltözött, vagy elvált.
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="px-3 py-2 align-top font-semibold">Háztartás</td>
              <td className="px-3 py-2 align-top">
                Egy <em>jelenlegi</em> lakóközösség: kik laknak egy fedél alatt
                + a címük + minden tag szerepe. <strong>Költözéskor új háztartás
                jön létre</strong>, a régi „lezárul" — a történet megmarad.
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="px-3 py-2 align-top font-semibold">Kapcsolat</td>
              <td className="px-3 py-2 align-top">
                Két ember közötti rokoni viszony (szülő-gyerek, házastárs,
                testvér, nagyszülő-unoka). <strong>Életen át tart</strong> —
                válásnál a házastársi kapcsolat „lezárul", de a szülő-gyerek
                sose szűnik meg.
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="px-3 py-2 align-top font-semibold">Szerep</td>
              <td className="px-3 py-2 align-top">
                Egy ember <em>mit csinál a háztartásban</em>: családfő, házastárs,
                gyermek, mostohaszülő, gondviselő, nagyszülő, unoka, lakótárs.
                Ugyanaz az ember más háztartásban más szerepet kaphat.
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="px-3 py-2 align-top font-semibold">Cím</td>
              <td className="px-3 py-2 align-top">
                Külön „kartonon" tárolva (utca, házszám, emelet, ajtó). A háztartás
                kapja meg, NEM közvetlenül a személy. Így a régi cím a
                családlátogatási naplóban örökre olvasható marad.
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2 align-top font-semibold">Érvényesség</td>
              <td className="px-3 py-2 align-top">
                Minden objektumon (háztartás, kapcsolat, tag, cím) van „érvényes-től"
                + „érvényes-ig" dátum. Az „érvényes-ig" üres, ha még jelenleg
                érvényes. <strong>Sose törlünk — csak lezárunk.</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ───── 3. A 3 kartonlap ───── */}
      <SectionTitle>3. A 3 kartonlap részletesen</SectionTitle>
      <p>
        Képzeljük el úgy, mintha minden emberről <strong>három különböző karton</strong>
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
            <li>egy cím (utca, házszám, emelet, ajtó)</li>
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
            <li>Kovács Anna <strong>nagyszülője</strong> Kovács István</li>
          </ul>
          <p className="mt-2 text-violet-900/85 text-sm leading-relaxed">
            <strong>Ez nem változik költözéssel.</strong> Ha Pista elválik Máriától,
            ők továbbra is a közös gyerekek vér szerinti szülei. Csak a házassági
            kapcsolat státusza változik „aktív" → „lezárt"-ra.{' '}
            <em>„A kapcsolat az Istenadta vagy törvényadta kötelék."</em>
          </p>
        </div>
      </div>

      {/* ───── 4. Vizuális diagram ───── */}
      <SectionTitle>4. Egy konkrét család az adatbázisban</SectionTitle>
      <p>
        Lássuk a Kovács család példáján, hogyan néz ki az adatbázisban. Tegyük fel,
        hogy <strong>Kovács Pista</strong> és <strong>Tóth Mária</strong> 1995-ben
        összeházasodtak, született egy lányuk (<strong>Kovács Anna</strong>, 2000)
        és egy fiuk (<strong>Kovács Béla</strong>, 2003). Most a Templom utca 3-ban
        élnek.
      </p>

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 mt-2 font-mono text-[11px] leading-relaxed overflow-x-auto">
        <pre className="whitespace-pre text-slate-700">
{`SZEMÉLYEK (4 db karton):
┌─────────────────────────────────────────────────────┐
│ #1  Kovács Pista    1970-05-12   református        │
│ #2  Tóth Mária      1972-08-03   református        │
│ #3  Kovács Anna     2000-03-15   református        │
│ #4  Kovács Béla     2003-11-22   református        │
└─────────────────────────────────────────────────────┘

CÍM (1 db):
┌─────────────────────────────────────────────────────┐
│ #C1  Templom u. 3   (érvényes 2010-óta, ig: NULL)  │
└─────────────────────────────────────────────────────┘

HÁZTARTÁS (1 db, mostani):
┌─────────────────────────────────────────────────────┐
│ #H1  „Kovács család — Templom u. 3"                │
│      cím: #C1     érvényes 2010-óta                │
│      Tagok:                                         │
│        #1 Pista  — családfő          (elsődleges)  │
│        #2 Mária  — házastárs                       │
│        #3 Anna   — gyermek                         │
│        #4 Béla   — gyermek                         │
└─────────────────────────────────────────────────────┘

KAPCSOLATOK (5 db, életen át):
┌─────────────────────────────────────────────────────┐
│  #1 Pista  ──── házastárs  ──── #2 Mária  (1995-)  │
│  #1 Pista  ──── szülő-gyerek ── #3 Anna   (vér)    │
│  #2 Mária  ──── szülő-gyerek ── #3 Anna   (vér)    │
│  #1 Pista  ──── szülő-gyerek ── #4 Béla   (vér)    │
│  #2 Mária  ──── szülő-gyerek ── #4 Béla   (vér)    │
└─────────────────────────────────────────────────────┘`}
        </pre>
      </div>

      <p className="mt-3">
        Most képzeljük el, hogy <strong>Anna egyetemre megy Kolozsvárra</strong> 2018-ban.
        Mi történik az adatbázisban?
      </p>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 mt-2 font-mono text-[11px] leading-relaxed overflow-x-auto">
        <pre className="whitespace-pre text-emerald-900">
{`+ ÚJ CÍM:
┌─────────────────────────────────────────────────────┐
│ #C2  Kolozsvár, Kollégium u. 7  (érvényes 2018-)   │
└─────────────────────────────────────────────────────┘

+ ÚJ HÁZTARTÁS:
┌─────────────────────────────────────────────────────┐
│ #H2  „Kolozsvári kollégium"                         │
│      cím: #C2     érvényes 2018-óta                │
│      Tagok:                                         │
│        #3 Anna   — lakótárs   (elsődleges 2018-)   │
└─────────────────────────────────────────────────────┘

# Mi NEM változott:
#  - Anna #3 továbbra is a szülei háztartásának (#H1) tagja
#    (másodlagos szerep: gyermek). Nem törlődött semmi.
#  - A szülő-gyerek kapcsolatok érintetlenek.
#  - A keresztelési anyakönyv továbbra is Anna vér szerinti
#    szüleit (Pista + Mária) mutatja.`}
        </pre>
      </div>

      <p className="mt-3 text-sm text-slate-600">
        <strong>Anna most két háztartásnak is tagja egyszerre.</strong>{' '}
        Ha karácsonykor hazajön, a szülei háztartásában látható mint „gyermek".
        Ha vizsgaidőszakban Kolozsváron van, a kollégiumi háztartásban
        „lakótárs". Mindkét háztartáshoz a lelkész készíthet családlátogatási
        naplót.
      </p>

      {/* ───── 5. Élet-példák ───── */}
      <SectionTitle>5. 12 élet-példa — Hagyományos modell ↔ A rendszerünk</SectionTitle>
      <p>
        Konkrét helyzetek, amikkel egy lelkész találkozhat. Mindegyiknél bemutatjuk,
        hogyan kezeli a hagyományos egydobozos modell (sokszor
        kényszer-kompromisszummal), és hogyan a mi 3-rétegű rendszerünk.
      </p>

      <div className="space-y-3 mt-2">
        <ExamplePanel
          tone="emerald"
          title="1. Új gyerek megkeresztelése"
          situation="Beder Attila és Beder Henrietta gyermeke megszületett."
          old="Hozzáadod a babát a Beder családhoz."
          new={'1) Felveszed a babát mint új személyt. 2) Rögzíted a két vér szerinti szülő-gyermek kapcsolatot. 3) A szülők háztartásába felveszed a babát is. Az anyakönyvi emléklap AUTOMATIKUSAN a vér szerinti szülőket írja — akkor is, ha az anya újraházasodott.'}
        />
        <ExamplePanel
          tone="emerald"
          title="2. Családlátogatás többgenerációs háztartásban"
          situation="A Templom utca 3-ban él Nagy néni, a fia, a menye, és 2 unoka."
          old={'Egy „Nagy család" rekord — de csak 1 férj + 1 feleség + 4 név fér el, vagy duplikáljuk 2 családra.'}
          new={'Egy háztartás 5 taggal: Nagy néni (nagyszülő), a fia (családfő), a menye (házastárs), 2 unoka (gyermek). A vér szerinti rokoni szálakat külön látod (Nagy néni a fiának vér szerinti anyja, a menye szülei egy másik gyülekezetben).'}
        />
        <ExamplePanel
          tone="amber"
          title="3. Költözés"
          situation="A Kovács család átköltözik a Templom utcáról az Iskola utcára."
          old="A család címét felülírod — a régi cím elveszik."
          new={'A régi háztartás lezárul (érvényes-ig = ma). Új háztartás jön létre az új címmel, ugyanazokkal a tagokkal. A korábbi családlátogatások visszakereshetők, hogy 2024-ben még a Templom utcában tartottad őket.'}
        />
        <ExamplePanel
          tone="amber"
          title="4. Egyetemista gyerek"
          situation="Szabó Ákos Kolozsváron egyetemista, a kollégiumban lakik."
          old={'Vagy a szüleinél van (téves cím), vagy egy „egyfős család” lesz a kollégiumban (furcsa).'}
          new={'Ákos kartonja a sajátja. Tagja a szülei háztartásának (szerepe: gyermek, másodlagos) ÉS a kollégium háztartásának (lakó, elsődleges). A vér szerinti szülei örökre az ő szülei. A családlátogatáskor MINDKÉT háztartásban látod őt.'}
        />
        <ExamplePanel
          tone="red"
          title="5. Elvált család / patchwork"
          situation="Pista elvált Máriától; mindkettő újraházasodott. A közös gyerek hétközben Máriánál, hétvégén Pistánál."
          old="Az egész helyzet NEM FÉR a férj+feleség modellbe."
          new={'Pista új háztartása: ő + új felesége + a régi gyereke (hétvégi tag) + új gyerek. Mária háztartása: ő + új férje + a régi gyerek (hétközi tag). A kapcsolati réteg azt mondja: a gyerek vér szerinti szülei Pista és Mária — ez SOSE változik. Az anyakönyvi adatok ezt használják.'}
        />
        <ExamplePanel
          tone="emerald"
          title="6. Egyedülálló özvegy nő"
          situation="Tóth néni 78 éves, férje 5 éve elhunyt, egyedül él."
          old={'„Egyfős család" — kényelmetlen elnevezés, de muszáj rögzíteni.'}
          new={'Háztartás 1 taggal: Tóth néni (családfő, elsődleges). A férjével kötött házastársi kapcsolat „érvényes-ig" dátumot kap (a férj halálának dátuma). A férj személyi kartonja megmarad mint „elhunyt" — az anyakönyvi keresés továbbra is megtalálja.'}
        />
        <ExamplePanel
          tone="amber"
          title="7. Élettárs (nem házas) együttélés"
          situation="Kiss Janos és Nagy Erzsébet együtt élnek és van 1 közös gyerekük, de nem házasok."
          old={'A „férj + feleség” jelöléssel rögzíted őket — de jogilag nem helyes.'}
          new={'Háztartás 3 taggal: Kiss János (családfő), Nagy Erzsébet (élettárs), gyermek. A két szülő közötti kapcsolat „élettárs" (NEM házastárs). A gyermek mindkét szülő vér szerinti kapcsolatát kapja. Az anyakönyv pontosan tükrözi a státuszt.'}
        />
        <ExamplePanel
          tone="amber"
          title="8. Külföldön dolgozó házastárs"
          situation="Szabó Pál Németországban dolgozik, a felesége és 2 gyermeke itthon."
          old="Pál címe vagy a németországi (a magyar nyilvántartásban furcsa), vagy itthoni (téves)."
          new={'Pál személyi kartonján a hazai elérhetőség (telefon, email). A háztartásnál 2 cím is lehet: elsődleges (Templom u. 3) + másodlagos (németországi munkahelyi). A családlátogatási napló az itthoni háztartásban tartja a tagokat.'}
        />
        <ExamplePanel
          tone="emerald"
          title="9. Adoptáció / nevelőszülő"
          situation="Horváthék hivatalosan örökbe fogadtak egy 3 éves gyermeket."
          old="A gyermek a család gyermekeként rögzül — a vér szerinti szülők elvesznek."
          new={'A gyermek a Horváth háztartás tagja lesz (szerep: gyermek). A vér szerinti szülőkkel külön kapcsolat (típus: szülő-gyerek, „vér szerinti = igen"). Horváthékkal egy másik kapcsolat (típus: örökbe fogadó, „vér szerinti = nem"). Az anyakönyvi adatok mindkettőt látják.'}
        />
        <ExamplePanel
          tone="amber"
          title="10. Idős, betegségben szenvedő"
          situation="Kovács bácsi 84 éves, demens, a fia idősotthonba helyezte át 2023-ban."
          old={'A család címét átírod az otthon címére — vagy „eltűnik” a nyilvántartásból.'}
          new={'Régi háztartás (otthon a Templom utcában) lezárul 2023-as „érvényes-ig" dátummal. Új háztartás (idősotthon) érvényes-tól 2023, tagok: Kovács bácsi (egyedüli, elsődleges). A kapcsolati kartonon a fia továbbra is gondviselő (új kapcsolat-típus). A családlátogatás az új helyen folytatódik.'}
        />
        <ExamplePanel
          tone="emerald"
          title="11. Felnőtt, elköltözött gyerek"
          situation="Varga Levente 28 éves, saját lakásban él Sepsiszentgyörgyön, de a szülei még családtagnak tekintik."
          old="Levente vagy a szülei címén (téves), vagy törlődik a családból (érzelmileg rossz)."
          new={'Levente saját háztartása: 1 tagú, sepsiszentgyörgyi cím. A szülei háztartásának NEM tagja, DE a kapcsolati kartonon szülő-gyerek kapcsolatban marad. A szülei meglátogatáskor a lelkész látja: „Levente — felnőtt gyermek, saját háztartásban, Sepsiszentgyörgyön."'}
        />
        <ExamplePanel
          tone="red"
          title="12. Vegyes vallású házaspár"
          situation="Tóth László református, felesége Antonella római katolikus. 2 gyermek református keresztséget kapott."
          old={'„Vegyes házaspár” jelölés egy mezőben, de a struktúrán nincs jelölés.'}
          new={'Mindkét felet rögzítjük: László vallása „református", Antonella vallása „római katolikus". A háztartás megmarad egyben. A 2 gyerek a református anyakönyvben szerepel — a kapcsolat-réteg pontosan jelöli, ki melyik szülő vér szerinti gyermeke.'}
        />
      </div>

      {/* ───── 6. How-to ───── */}
      <SectionTitle>6. Lépésről lépésre — leggyakoribb feladatok</SectionTitle>
      <p>
        Az alábbiakban a leggyakoribb műveletek lépéssorrendje. A Tagnyilvántartás
        felületén minden lépést gombokkal támogatunk.
      </p>

      <div className="space-y-3">
        <HowtoPanel
          title="Új gyermek rögzítése (megkereszteléskor)"
          steps={[
            'Tagnyilvántartás → „Új tag" gomb',
            'Töltsd ki a baba alapadatait (név, születés, vallás)',
            'A „Szülők" szekcióban válaszd ki a vér szerinti apát és anyát (kereső)',
            'A „Háztartás" szekcióban: „Hozzáadás meglévő háztartáshoz" → válaszd a szülőkét. Ha a szülők még nem laknak együtt, hozz létre új háztartást.',
            'A „Szerep" mező: gyermek',
            'Mentés → automatikusan létrejön: 1 új személy, 2 új kapcsolat, 1 új háztartás-tagság',
          ]}
        />
        <HowtoPanel
          title="Költözés rögzítése"
          steps={[
            'Tagnyilvántartás → Család-detail (kattintásra megnyílik)',
            'A háztartás-kártya jobb felső sarkában: „Költözés rögzítése" gomb',
            'Add meg az új címet (utca, házszám, emelet, ajtó)',
            'Add meg a költözés dátumát (alapértelmezett: ma)',
            'A költöző tagokat ellenőrizd (alapból mind átkerül, de pl. egy hátrahagyott tagot lehet kijelölni)',
            'Mentés → a régi háztartás „érvényes-ig" dátumot kap, új háztartás születik az új címmel + tagokkal',
          ]}
        />
        <HowtoPanel
          title="Új háztartás-tag (beköltözés)"
          steps={[
            'Háztartás-detail → „Új tag hozzáadása" gomb',
            'Keresd meg a személyt a tagnyilvántartásban. Ha még nincs, először hozd létre.',
            'Válassz szerepet (családfő / házastárs / gyermek / mostohaszülő / lakótárs / stb.)',
            'Beköltözés dátuma',
            'Ha rokoni szál van a többi taggal, rögzítsd a kapcsolatot is (külön gomb a háztartás-detail-en)',
            'Mentés',
          ]}
        />
        <HowtoPanel
          title="Válás kezelése a nyilvántartásban"
          steps={[
            'NEM törlünk semmit! A személyi kartonok érintetlen maradnak.',
            'A „Kapcsolatok" panelen keresd meg a házastársi kapcsolatot a két fél között',
            '„Lezárás" gombra kattintva add meg a válás dátumát (érvényes-ig)',
            'Ha az egyik fél új háztartásba költözik: hozz létre új háztartást neki (mint a 2. how-to)',
            'Ha gyerekek vannak közös felügyelettel: vedd fel őket MINDKÉT háztartásba (más szerepekkel pl. „hétvégi tag", „elsődleges")',
            'A szülő-gyerek kapcsolatok érintetlenek maradnak — a vér szerinti szálak sose szűnnek meg.',
          ]}
        />
        <HowtoPanel
          title="Tag elhalálozása"
          steps={[
            'Anyakönyv → Temetés → új bejegyzés',
            'A temetés mentésekor a tagstátusz automatikusan „elhunyt"-ra vált',
            'A személyi karton MEGMARAD (történeti integritás miatt) — a gyermekei anyakönyvi rekordjaiban továbbra is olvasható',
            'A háztartásban a tag „érvényes-ig" dátumot kap (halál napja)',
            'A házastársi kapcsolat „lezárul" (érvényes-ig = halál napja) — özveggyé válik a másik fél',
          ]}
        />
      </div>

      {/* ───── 7. Anyakönyv-kapcsolat ───── */}
      <SectionTitle>7. Anyakönyv-kapcsolat (keresztelő / esketés / temetés)</SectionTitle>
      <p>
        Az anyakönyvi modulok a kapcsolati rétegből olvassák a vér szerinti
        adatokat — ezzel <strong>jogilag pontos</strong> emléklapokat tudunk
        készíteni:
      </p>
      <ul className="list-disc pl-5 space-y-2 text-sm">
        <li>
          <strong>Keresztelési anyakönyv</strong>: a gyermek <em>vér szerinti</em>
          szülei kerülnek az emléklapra (a „szülő-gyerek" kapcsolatból, ahol
          „vér szerinti = igen"). Akkor is, ha az anya újraházasodott időközben.
        </li>
        <li>
          <strong>Esketési anyakönyv</strong>: amikor egy új házastársi kapcsolat
          jön létre, a rendszer automatikusan rögzíti a kapcsolati rétegben is
          („típus: házastárs"). Ha bárki később elválik, a kapcsolat „érvényes-ig"
          dátumot kap, de az anyakönyvi bejegyzés érintetlen marad.
        </li>
        <li>
          <strong>Temetési anyakönyv</strong>: a háztartásban az érintett tag
          „érvényes-ig" dátumot kap, a házastársi kapcsolat lezárul (özveggyé
          válik a másik fél). A személyi karton megmarad — a leszármazottak
          anyakönyvi rekordjai továbbra is hivatkoznak rá.
        </li>
      </ul>

      {/* ───── 8. GYIK ───── */}
      <SectionTitle>8. Gyakori kérdések</SectionTitle>

      <FaqPanel
        q="Mi történik a meglévő adataimmal?"
        a={'Az adatbázis-átállás automatikus volt: minden korábbi család átkerült új háztartásként, a tagok+címek megmaradtak, a férj+feleség jelölésből automatikusan generálódtak a házastársi kapcsolatok. Egyetlen rekord sem veszett el. A régi családlátogatási napló is érintetlen.'}
      />
      <FaqPanel
        q="Ha valamit elrontok, helyrehozhatom?"
        a={'Igen — sose törlünk, csak „lezárunk”. Ha tévesen rögzítettél egy beköltözést, csak nyisd meg újra a tagság rekordját és töröld az érvényes-tól dátumot. Minden művelet visszafordítható.'}
      />
      <FaqPanel
        q="Át kell tanulnom mindent újra?"
        a={'Nem. A felület úgy van felépítve, hogy a leggyakoribb feladatok (új tag rögzítése, családlátogatás, keresztelő) szinte azonosan működnek mint eddig. A 3-rétegű modell a háttérben dolgozik — akkor látsz belőle, amikor speciális esettel találkozol (válás, költözés, többgenerációs).'}
      />
      <FaqPanel
        q="Mit lát a presbiter / gondnok a felületen?"
        a={'A presbiterek a jelenlegi háztartásokat látják (címmel, tagokkal). A kapcsolati réteget csak a lelkész és az adminisztrátor — ez tartalmazza a vér szerinti rokoni szálakat, válási adatokat, amik bizalmasabbak.'}
      />
      <FaqPanel
        q="Más gyülekezet hozzáférhet ezekhez az adatokhoz?"
        a={'Nem. Minden adat a gyülekezetedhez van kötve (congregation_id). Más gyülekezet lelkésze csak akkor láthat, ha hivatalos átköltözés/áthelyezés történt — és akkor is csak a saját gyülekezetébe átvitt rekordot.'}
      />
      <FaqPanel
        q={'Mi a különbség a „háztartás” és a „család” között?'}
        a={'A „család” egy érzelmi-rokoni fogalom (vér szerinti és lelki közösség). A „háztartás” egy adminisztratív fogalom (kik laknak most egy fedél alatt). A két fogalom sokszor egybeesik (egy klasszikus négytagú család = egy háztartás), de néha eltér (egyetemista gyerek esetén pl. a család változatlan, de a háztartás más). A rendszerünk MINDKÉT fogalmat tárolja — a háztartást közvetlenül, a családot a kapcsolatok rétegéből.'}
      />
      <FaqPanel
        q={'Hogyan kezelem a „nem-házas, de együtt élő” párokat?'}
        a={'A háztartásba mindkét felet felveszed (családfő + élettárs szerepekkel). A kapcsolati rétegbe „élettárs” típust rögzítesz — NEM „házastárs”-ot. Ezzel az anyakönyvi nyilvántartás jogilag pontos marad.'}
      />

      {/* ───── 9. GDPR ───── */}
      <SectionTitle>9. Adatvédelem — ki látja mit?</SectionTitle>
      <p>
        A személyes adatok kezelése a magyar GDPR + a református adatkezelési minta
        szerint:
      </p>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        <li>
          <strong>Lelkész + adminisztrátor</strong>: minden adat — személyi karton,
          háztartások, kapcsolatok, történeti rétegek.
        </li>
        <li>
          <strong>Presbiter / gondnok</strong>: a jelenlegi háztartás-tagsága +
          cím + szerep. A rokoni kapcsolatokat NEM, a válási adatokat NEM.
        </li>
        <li>
          <strong>Esperes / kerületi admin</strong>: ugyanaz mint a lelkész,
          de csak a gyülekezeteihez rendelt adatokat.
        </li>
        <li>
          <strong>Tagok</strong>: a saját adatait, valamint amit a gyülekezetbe
          megosztanak (ez később egy „tag-profil" funkcióban lesz elérhető).
        </li>
      </ul>
      <p className="mt-2">
        Az érzékeny adatok (válás, idősotthon, eltartott betegség) <strong>külön
        láthatósági szinten</strong> tárolódnak — a lelkészen kívül csak az
        adminisztrátor látja.
      </p>

      {/* ───── 10. Hibakeresés ───── */}
      <SectionTitle>10. Hibakeresés — mit csináljak, ha furcsát látok?</SectionTitle>
      <ul className="list-disc pl-5 space-y-2 text-sm">
        <li>
          <strong>„Egy tagot két helyen látok"</strong> — Ez NEM duplikáció, hanem
          jogos: az illető több háztartásnak is tagja egyszerre (pl. egyetemista).
          A személyi kartonja viszont csak egy van.
        </li>
        <li>
          <strong>„A férj/feleség mezőket nem találom"</strong> — Új modellben
          ezek nem külön mezők; a háztartás-tagok között találod „családfő" +
          „házastárs" szerepekkel.
        </li>
        <li>
          <strong>„A régi cím nem látszik"</strong> — A költözés után a régi
          háztartás „lezárult" (érvényes-ig dátumot kapott). A háztartás-listán
          válts „Archív háztartások" nézetre — ott megtalálod.
        </li>
        <li>
          <strong>„Az anyakönyvi emléklapon nem a megfelelő szülők szerepelnek"</strong>
          {' '}— Ellenőrizd a kapcsolati rétegben a „szülő-gyerek" kapcsolatot.
          Vagy hiányzik a „vér szerinti = igen" jelölés, vagy másra van állítva.
        </li>
        <li>
          <strong>„Egy elhunyt tag még családtagként látszik"</strong> — A
          személyi karton MEGMARAD elhalálozás után is. Csak a háztartásból
          „lezárul" a tagsága. Ez akarat — a leszármazottak anyakönyvi
          rekordjai továbbra is rá hivatkoznak.
        </li>
      </ul>
    </>
  )
}

// Lépésről lépésre útmutató panel
function HowtoPanel({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
      <h5 className="font-semibold text-cyan-900 flex items-center gap-2">
        <ChevronRight className="size-4" />
        {title}
      </h5>
      <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm text-slate-700">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  )
}

// GYIK panel
function FaqPanel({ q, a }: { q: string; a: string }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-3 mt-2">
      <summary className="cursor-pointer font-semibold text-slate-800 text-sm">
        {q}
      </summary>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">{a}</p>
    </details>
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
        <li><strong>Presbitereket</strong> — egy körzethez <strong>több presbiter</strong> is rendelhető.</li>
      </ul>

      <SectionTitle>Automatikus körzetesítés</SectionTitle>
      <p>
        Az <strong>„Automatikus körzetesítés&rdquo;</strong> gombbal egy varázsló osztja el
        a családokat a kívánt számú körzetbe. Két szempont választható:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Utcánként</strong> — a település és utca szerint csoportosít; a hosszú
          utcák automatikusan részekre bomlanak, hogy a körzetek kiegyensúlyozottak legyenek.</li>
        <li><strong>Korosztály szerint</strong> — a család legidősebb felnőttje szerinti sávokba.</li>
      </ul>
      <p>
        A kiegyensúlyozás <strong>lélekszám</strong> (vagy családszám) szerint történik, és a
        családok sosem szakadnak szét. A javasolt kiosztás <strong>előnézetben</strong> jelenik meg:
        a körzet-nevek átírhatók, körzetenként presbiterek oszthatók ki, és semmi nem íródik az
        adatbázisba, amíg nem kattintasz az „Alkalmazás&rdquo;-ra. Amelyik család automatikusan nem
        osztható (nincs utca vagy születési dátum), az okkal listázva marad, és kézzel rendelhető hozzá.
      </p>

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

// 2026-08-25: gyülekezeti egységek — a tag-besorolás súgója. Az új szakasz már
// téma-tokenekkel készül (a munkanaplo-help mintája), nem slate-színekkel.
function EgysegCim({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="font-heading text-base font-semibold text-foreground mt-5 first:mt-0">
      {children}
    </h4>
  )
}

function EgysegekContent() {
  return (
    <>
      <p>
        Ha az egyházközségedhez <strong>leányegyházközség vagy szórvány</strong>{' '}
        tartozik, a Gyülekezet-beállító varázsló „Egységek" paneljén veheted fel
        őket. A tagoknál ezután megadhatod, melyik tag melyik egységhez
        (közösséghez) tartozik — minden adat egy közös kartotékban marad, az
        egység csak címke.
      </p>

      <EgysegCim>Hogyan sorolod be a tagokat?</EgysegCim>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>Egyénileg</strong> — a személyi kartonon van egy
          egység-mező: itt választod ki, hogy a tag az anyaközponthoz vagy
          valamelyik egységhez tartozik.
        </li>
        <li>
          <strong>Tömegesen, település szerint</strong> — a Tagnyilvántartás
          besorolás-segédjével egy lépésben átsorolható „minden X településen
          lakó tag → Y egység". A lakcímekből a rendszer javaslatot is ad.
        </li>
      </ul>

      <EgysegCim>Mire jó a besorolás?</EgysegCim>
      <p>
        Az éves lelkészi jelentés <strong>„Gyülekezetenkénti bontás"</strong>{' '}
        táblája ebből számolja egységenként a lélekszámot, a választókat és az
        anyakönyvi mozgásokat (keresztelt, temetett, esketett, konfirmált) —
        oszloponként az anyaegyházközség, az egységek és az Összesen. A
        hiányzó vagy pontatlan cellák a jelentésben kézzel felülírhatók.
      </p>

      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="font-semibold text-foreground">Fontos elv</p>
        <p className="mt-1">
          A besorolatlan tag mindig az <strong>anyaközponthoz</strong> számít —
          semmi nem romlik el, ha nem sorolsz be senkit, csak a bontás lesz
          kevésbé részletes. Az összesítések és a hivatalos jelentés ettől
          függetlenül helyesek maradnak.
        </p>
      </div>

      <EgysegCim>Nem ugyanaz, mint a körzet</EgysegCim>
      <p>
        A <strong>körzet</strong> a gyülekezet belső, pasztorációs felosztása
        (utcák, falurészek — lásd a „Körzetek" fejezetet). Az{' '}
        <strong>egység</strong> ezzel szemben egy kapcsolt közösség
        (leányegyházközség vagy szórvány), amelynek a lelkészi jelentésben
        saját oszlopa van. Egy tagnak lehet körzete ÉS egysége is — a kettő
        nem zavarja egymást.
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
        <li>Betöltötte a <strong>18. életévét</strong> (születésnap-pontosan számolva).</li>
        <li><strong>Aktív tag</strong> — nem elhunyt, nem elköltözött, nem kitért.</li>
        <li>Az <strong>aktuális vagy az előző évben fizetett egyházfenntartó járulékot</strong>{' '}
          (kód: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">101.01</code>) —{' '}
          <strong>a felmentett fizetettnek számít</strong> (családi közös befizetés is beszámít
          mindkét házastársnak).</li>
        <li><strong>Konfirmált</strong> — DE ez a feltétel a fülön lévő „Konfirmáció
          megkövetelése&rdquo; kapcsolóval <strong>kikapcsolható</strong>, ha a konfirmálási
          anyakönyv még nincs bevezetve a rendszerbe. Kikapcsolt állapotban aki fizet és
          aktív 18+ tag, az jogosultnak számít.</li>
      </ul>
      <p>
        A „Jogosultság frissítése&rdquo; gomb számolja újra a jelöléseket a szabály szerint
        (a kézi lakat-felülbírálások megmaradnak). A nyomtatási központ lapozott,
        A4-pontos hivatalos névjegyzéket készít <strong>oldalszámokkal</strong>, és
        alapból csak a jogosultakat tartalmazza.
      </p>

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
        A <strong>Tisztségek</strong> fül a gyülekezet választott és megbízott
        szolgálattevőit tartja nyilván, három részben: <strong>Presbitérium</strong>,
        <strong> Bizottságok</strong> (gazdasági, leltározó, diakóniai) és
        <strong> Egyéb tisztségek</strong> (kántor, diakónus, nőszövetségi elnök,
        IKE-elnök, önkéntesek, egyházmegyei küldött). A tisztség mindig egy meglévő
        egyháztaghoz kapcsolódik — nem külön személy-bejegyzés.
      </p>

      <SectionTitle>Presbitérium</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Fokozat</strong> — teljes értékű, pót- vagy tiszteletbeli presbiter.
          A pót- és tiszteletbeli presbiter tanácskozási joggal vesz részt, a
          jegyzőkönyvi határozatképességbe nem számít.</li>
        <li><strong>Funkció</strong> — főgondnok és/vagy gondnok, akit az új presbitérium
          a saját tagjai közül választ. Csak teljes értékű presbiter lehet; egyszerre
          csak egy aktív főgondnok jelölhető.</li>
        <li><strong>Mandátum</strong> — a kezdet megadásakor a rendszer a gyülekezeti
          ciklus (alapból 3 év, Erdély) szerint javasolja a lejáratot. A kártya színes
          jelzést mutat: zöld = érvényes, sárga = fél éven belül lejár, piros = lejárt,
          szürke = nincs megadva.</li>
        <li><strong>Felelős körzet</strong> (opcionális) — melyik körzet pasztorációjáért
          felel az adott presbiter.</li>
      </ul>

      <SectionTitle>Választás után — „Új ciklus" varázsló</SectionTitle>
      <p>
        A presbiterválasztás után az <strong>Új ciklus</strong> gombbal egy lépésben
        lezárható minden lejáró mandátum és felvehető az új névsor (fokozattal és
        gondnok-jelöléssel). A régi bejegyzések a történetben megmaradnak — a
        <strong> Lezárás</strong> a mandátum végét rögzíti, a törlés csak téves
        rögzítéshez való.
      </p>

      <SectionTitle>Megjelenés a gyülekezet weboldalán</SectionTitle>
      <p>
        Bármely tisztség megjelölhető úgy, hogy a gyülekezet nyilvános weboldalán
        megjelenjen. A név CSAK akkor kerül ki, ha a személyi kartonon (GDPR-blokk) a
        <strong> „Név a weboldalon"</strong> hozzájárulás is be van pipálva — az egyházi
        tisztség vallási meggyőződésre utaló különleges adat, ezért a hozzájárulás
        nélküli megjelenítést a rendszer technikailag is kizárja. A weboldal-szekciót a
        Weboldal-kezelő → Beállítások → „Tisztségviselőink" kapcsolóval lehet
        bekapcsolni.
      </p>

      <SectionTitle>Mire jó még?</SectionTitle>
      <p>
        Az éves jelentés VII. szakasza és a lelkészi jelentés III.9 rovata az AKTÍV
        presbiterekből számol automatikusan; a jegyzőkönyv jelenléti íve is innen
        töltődik elő, a fokozat szerinti szereppel.
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
          <p className="mt-1">Érvénytelen formátum: rossz email vagy telefonszám.
            <strong> Fontos:</strong> az <strong>egyházi azonosító</strong> mezőre (az{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">EC-2026-…</code>{' '}
            formátum teljesen érvényes) NINCS formátum-ellenőrzés — a hivatalos személyi
            szám az a KÜLÖN mező a személyi kartonon, azt viszont ellenőrizzük. Ha régebbi
            „A CNP nem 13 számjegy&rdquo; hibákat látsz, nyomd meg a „Hibák
            újraellenőrzése&rdquo; gombot: az elavult hibák automatikusan lezáródnak.</p>
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
