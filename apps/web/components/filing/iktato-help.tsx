'use client'

import { useState } from 'react'
import {
  Archive,
  BookOpen,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderArchive,
  FolderTree,
  Hash,
  HardDrive,
  Info,
  Stamp,
} from 'lucide-react'

/**
 * Iktató súgó — Apple Settings-stílusú két-paneles UI.
 *
 * Forrás: az Erdélyi Református Egyházkerület hivatalos „14. Egyházi
 * adminisztráció" útmutatója (Igazgatótanács 66/2023. számú határozata
 * 2024. január 1-től érvényes ügykörjegyzékkel) — a teljes 21 oldalas
 * dokumentum strukturált tartalma.
 */

interface HelpCategory {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  short: string
}

const CATEGORIES: HelpCategory[] = [
  { id: 'general', label: 'Általános', Icon: Info, short: 'Az adminisztráció alapelvei' },
  { id: 'archives', label: 'Irattárak kezelése', Icon: Archive, short: 'Őrzés, tárolás, négy iratcsoport' },
  { id: 'basics', label: 'Iktatási alapok', Icon: Hash, short: 'Iktatószám, hivatali út' },
  { id: 'register', label: 'Iktatókönyv (9 rovat)', Icon: BookOpen, short: 'A könyv vezetése részletesen' },
  { id: 'stamp', label: 'Iktatópecsét és példák', Icon: Stamp, short: 'Beérkező és kimenő minta' },
  { id: 'bound', label: 'Kötetes anyag (A.)', Icon: ClipboardList, short: '12 fő egység az ügykörjegyzékben' },
  { id: 'loose', label: 'Szálas iratok (B.)', Icon: FolderTree, short: '18 fő egység és alegységei' },
  { id: 'retention', label: 'Megőrzés (F.Á. vs É.Á.)', Icon: FolderArchive, short: 'Folyamatos és éves lezárás' },
  { id: 'electronic', label: 'Elektronikus anyagok (C.)', Icon: HardDrive, short: 'Digitális dokumentumok' },
  // 2026-07-17 (F6): az app saját iktató-funkcióinak rövid útmutatója
  { id: 'digital', label: 'Kartotéka-funkciók', Icon: FileText, short: 'Kiállítás, iratcsomók, befotózás' },
]

export function IktatoHelp() {
  const [active, setActive] = useState<string>(CATEGORIES[0].id)
  const activeCategory = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0]

  return (
    <div className="card-raised overflow-hidden p-0">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] min-h-[600px]">
        <aside className="border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r">
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Súgó</p>
            <h2 className="mt-1 font-heading text-xl text-slate-800">Iktató</h2>
            <p className="mt-1 text-xs text-slate-500">
              Az EREK hivatalos egyházi adminisztrációs útmutatója (2024-)
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
            {active === 'archives' && <ArchivesContent />}
            {active === 'basics' && <BasicsContent />}
            {active === 'register' && <RegisterContent />}
            {active === 'stamp' && <StampContent />}
            {active === 'bound' && <BoundContent />}
            {active === 'loose' && <LooseContent />}
            {active === 'retention' && <RetentionContent />}
            {active === 'electronic' && <ElectronicContent />}
            {active === 'digital' && <DigitalContent />}
          </div>
        </main>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Helperek
// ─────────────────────────────────────────────────────────────────────────

function S({ children }: { children: React.ReactNode }) {
  return <h4 className="font-heading text-base font-semibold text-slate-800 mt-5 first:mt-0">{children}</h4>
}
function Sub({ children }: { children: React.ReactNode }) {
  return <h5 className="font-semibold text-slate-700 mt-4 first:mt-0">{children}</h5>
}
function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">{children}</code>
}

function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'red' | 'cyan' | 'violet' | 'teal' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    violet: 'bg-violet-50 text-violet-700',
    teal: 'bg-teal-50 text-teal-700',
  }
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

function Callout({ children, tone = 'amber' }: { children: React.ReactNode; tone?: 'amber' | 'red' | 'teal' }) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    teal: 'border-teal-200 bg-teal-50 text-teal-900',
  }
  return <div className={`rounded-lg border ${tones[tone]} p-3 text-sm`}>{children}</div>
}

interface Row {
  uj: string
  regi: string
  nev: string
  retention?: 'F.Á.' | 'É.Á.' | ''
}

function RegistryTable({ rows, showRetention = false }: { rows: Row[]; showRetention?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold w-16">Új szám</th>
            <th className="px-3 py-2 font-semibold w-16">Régi</th>
            <th className="px-3 py-2 font-semibold">Ügykör megnevezése</th>
            {showRetention && <th className="px-3 py-2 font-semibold w-16">Típus</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={`${row.uj}-${i}`} className="align-top">
              <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">{row.uj}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.regi || '—'}</td>
              <td className="px-3 py-2 text-slate-700">{row.nev}</td>
              {showRetention && (
                <td className="px-3 py-2">
                  {row.retention && <Pill tone={row.retention === 'É.Á.' ? 'cyan' : 'emerald'}>{row.retention}</Pill>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Általános
// ─────────────────────────────────────────────────────────────────────────

function GeneralContent() {
  return (
    <>
      <p>
        Az <strong>Iktató</strong> modul az Erdélyi Református Egyházkerület hivatalos
        egyházközségi adminisztrációs rendszerét digitalizálja. Az alap a{' '}
        <strong>2006. évi 1. jogszabály 18. §. d.) pontja</strong>: a lelkipásztor{' '}
        <em>„gondoskodik a jegyzőkönyvek, aranykönyv, Historia Domus, szolgálati napló,
        egyházi anyakönyvek, családkönyvek, egyéb nyilvántartások előírások szerinti
        vezetéséről... Köteles a lelkészi iroda teendőit a szabályzatok értelmében
        ellátni. Teljesíti az egyházi ügyvitel reá háruló feladatait.”</em>
      </p>

      <S>Ki vehet részt az adminisztrációban?</S>
      <p>
        Az adminisztrációs munkába bevonhatók az egyházközség más alkalmazottai (kántor,
        tisztviselő stb.) és önkéntesek is. Fontos, hogy a nyilvántartások és feljegyzések
        adatai <strong>a valóságnak megfelelőek, hitelesek</strong> legyenek.
      </p>

      <S>A pontos adminisztráció haszna</S>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          A <strong>hitelesen vezetett lelkészi munkanapló</strong> adatai rávilágítanak
          a gyülekezet lelki életére és a lelkipásztor szolgálatainak minőségét tükrözik.
        </li>
        <li>
          A <strong>pontosan iktatott iratokat</strong> néhány év elteltével rövid idő alatt
          megtaláljuk az irattárban — nem rabolják el a szolgálatra szánt időnket.
        </li>
        <li>
          A napi rendszerességgel, becsületesen végzett <strong>könyvelés</strong> lehetőséget
          ad a felmerülhető kényes anyagi ügyek tisztázásához.
        </li>
        <li>
          A <strong>presbitériumi határozatok</strong> részletes és időben történő leírása
          könnyíti az egyházközség igazgatását, elejét veszi a félreértéseknek.
        </li>
      </ul>

      <S>A jogi keret</S>
      <p>
        Az egyházközség adminisztrációs munkájának meghatározója a <strong>Kánon</strong>,
        az állami törvények, rendeletek, illetve az egyházi felsőbb hatósági utasítások.
        A tennivalók háromféle jellegűek: <strong>állandó</strong>, <strong>ideiglenes</strong>,{' '}
        <strong>alkalmi</strong>.
      </p>

      <S>A hivatali út kötelező betartása</S>
      <Callout tone="amber">
        Az ügyintézés rendjén szigorúan <strong>kötelező a hivatali út betartása</strong>.
        Ez azt jelenti, hogy az egyházközségek csak az Egyházmegye közvetítésével
        levelezhetnek az Egyházkerülettel és fordítva. Ez azért fontos, mert az
        Egyházmegyének (esperesnek) tudomása kell legyen az egyházközségekben történt
        intézkedésekről, kérésekről.
      </Callout>

      <S>Szervezeti hierarchia és ügykörök</S>
      <p>
        A Református Egyház szervezeti felépítésének (egyházközség → egyházmegye →
        egyházkerület) megfelelően történik az adminisztrációs munka. Az iratokat,
        leveleket, igazolásokat <strong>ügykörjegyzékek szerint</strong> csoportosítjuk
        — más az egyházközségeknek, más az egyházmegyéknek és szintén más az
        egyházkerületnek az ügykörjegyzéke.
      </p>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Irattárak kezelése
// ─────────────────────────────────────────────────────────────────────────

function ArchivesContent() {
  return (
    <>
      <p>
        Az egyházközség <strong>irattára</strong> az egyházközség szellemi és anyagi
        vagyonának szerves része. Kezelése hivatalbeli kötelességünk, egyszersmind
        lelkiismereti ügy is.
      </p>

      <S>Őrzés és tárolás</S>
      <p>
        Az egyházközség iratanyagát a <strong>lelkészi irodában</strong> vagy a{' '}
        <strong>gyülekezeti teremben</strong>, <strong>zárható szekrényben</strong> őrizzük.
      </p>
      <Callout tone="red">
        <strong>Egyházközségi irattárat és levéltárat NEM tárolunk</strong> alagsori
        termekben, pincehelyiségekben, padláson, kazánházban, melléképületekben,
        garázsban, templomban, toronyaljban vagy szabad ég alatt. A gondatlan iratkezelés
        hivatali mulasztásnak minősül és maga után vonhatja a felelős fegyelmi úton
        történő megintését.
      </Callout>

      <S>Iratok megsemmisítése</S>
      <p>
        <strong>Tilos iratokat megsemmisíteni</strong> vagy gondatlanság miatt veszni
        hagyni. Még a tárgytalanná vált családkönyvi lapokat is megőrizzük („meghaltak”
        és „eltávozottak” csoportban). A klenódiumok, textíliák, történeti értékű iratok
        és könyvek selejtezése egyenesen <strong>tilos</strong>.
      </p>

      <S>Az iratanyag 4 fő csoportja</S>
      <p>Az egyházközség iratanyaga iratkezelési szabályzat szerint négy fő csoportra osztható:</p>
      <ol className="list-decimal pl-5 space-y-2">
        <li>
          <strong>1964 előtti iratanyag</strong> — a korabeli levéltári rendezés szerint:
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li><Pill>A</Pill> anyakönyvi ügyiratok</li>
            <li><Pill>B</Pill> számadási iratok</li>
            <li><Pill>C</Pill> vagyoni iratok</li>
            <li><Pill>D</Pill> közigazgatási iratok</li>
            <li><Pill>E</Pill> iskola-ügyek</li>
          </ul>
          A 2010-es években a kerületi levéltár alkalmazottai rendezték, dobozolták.
          A lelkész feladata az ennek megfelelő őrzés.
        </li>
        <li>
          <strong>1965–2023 közötti iratanyag</strong> — az 1964-ben elfogadott
          (Igazgatótanács 5816/1964.) iratkezelés szerint csoportosítva, évenként
          dossziékba fűzve és kötegelve.
        </li>
        <li>
          <strong>2024-től kezdődő iratanyag</strong> — az új, jelenleg érvényes
          ügykörjegyzék szerint (Igazgatótanács 66/2023. számú határozata alapján).
          Részletes útmutató lásd „Kötetes anyag” és „Szálas iratok” kategóriák.
        </li>
        <li>
          <strong>Kötetes anyag</strong> — külön egységként kezeljük, mert a kötetek
          legtöbbje a fenti évköröket túlhaladja. A jelenleg használt köteteket a 2024-es
          ügykörjegyzék szerint, a korábbi köteteket kronologikusan vagy tematikusan
          csoportosítva. Lehetőleg <strong>„lábra állítva”</strong> tároljuk.
        </li>
      </ol>

      <S>Történeti háttér</S>
      <p>
        Az iratkezelési rend <strong>1965-től 2023-ig</strong> volt érvényben (5816/1964.
        sz. iratkezelési rendszabály). 2024-től alapjaiban nem, de bizonyos részeit
        tekintve módosult az egyházközségi iratkezelés, alkalmazkodva a 21. századi
        viszonyokhoz.
      </p>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Iktatási alapok
// ─────────────────────────────────────────────────────────────────────────

function BasicsContent() {
  return (
    <>
      <S>Az iktatószám formátuma</S>
      <p>
        Minden iratot az intézkedés előtt iktatunk. Az iktatószám formátuma{' '}
        <C>ÉV/SORSZÁM</C>, pl. <C>2026/1</C>, <C>2026/2</C>. Az új évben{' '}
        <strong>1. sorszámmal</strong> kezdjük újra.
      </p>

      <S>Évvégi lezárás</S>
      <p>
        Az iktatókönyvet minden év <strong>december 31-én lezárjuk</strong>:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Az oldalon üresen maradt sorokat (az utolsó sor kivételével) áthúzzuk.</li>
        <li>Az utolsó sorba beírjuk: <em>„Lezárva 202_. december 31-én.”</em></li>
        <li>Aláírja a <strong>lelkipásztor és a (fő)gondnok</strong>.</li>
        <li>A következő év iktatását új oldalon kezdjük 1. sorszámmal.</li>
      </ul>

      <S>Kimenő iratok</S>
      <p>
        Minden kimenő iratot — amit a lelkipásztor és a (fő)gondnok aláírtak és
        lepecsételtek — két példányban kell elkészíteni:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Az eredeti megy a címzettnek.</li>
        <li>A <strong>másodpéldány</strong>: aláírva (pecsét nélkül) az irattárba helyezzük.</li>
      </ul>

      <S>A levelezés nyelve</S>
      <Callout tone="teal">
        A <strong>Kánon</strong> értelmében az <strong>egyházon belüli levelezést
        anyanyelvünkön</strong> (magyarul) folytatjuk. A polgári hatóságokkal és világi
        intézményekkel az <strong>állam hivatalos nyelvén</strong> (románul) levelezünk.
      </Callout>

      <S>Elektronikus iratok</S>
      <p>
        Az <strong>elektronikus úton érkező, hivatalos ügyintézést igénylő leveleket</strong>{' '}
        is kinyomtatjuk és iktatjuk. Az e-mailek és online formanyomtatványok ugyanolyan
        kezelést igényelnek, mint a papír alapú iratok.
      </p>

      <S>Hivatkozás más iktatószámra</S>
      <p>
        Ha egy ügyhöz tartozik bejövő ÉS kimenő irat is, célszerű kereszthivatkozást
        rögzíteni. A PDF útmutató szerint <strong>a válaszirat ugyanazt az iktatószámot
        kapja</strong>, mint a megkeresés, és együtt kerülnek irattárba. Ha a megkeresés
        az egyházközségből indul, akkor a kimenő irat új sorszámot kap, és az iktatókönyv
        9. rovatában rögzítjük: „lásd …” (a válaszlevél iktatószámával).
      </p>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Iktatókönyv 9 rovat
// ─────────────────────────────────────────────────────────────────────────

function RegisterContent() {
  return (
    <>
      <p>
        Az <strong>Iktatókönyv</strong> (VII. kötetes anyag, ügykör 5. a régi rendszerben)
        a teljes egyházi iratforgalom hivatalos nyilvántartása. Minden iratot,
        okmányt, amit kapunk vagy kiadunk, <strong>még az intézkedés előtt</strong>{' '}
        iktatunk.
      </p>

      <S>Forma és beszerzés</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Forma:</strong> nagyformátumú, előre bekötött regiszter</li>
        <li><strong>Beszerezhető:</strong> az egyházkerületi iratterjesztésnél</li>
        <li>
          <strong>Elektronikus változat:</strong> a Beke Tivadar lelkipásztor által
          fejlesztett könyvelési segédlet részeként (vagy ez a Kartotéka rendszer).
          Az évente kinyomtatott, lezárt lapokat dossziéba fűzzük, legalább 5 évenként
          kemény táblába beköttetjük.
        </li>
      </ul>

      <S>Az iktatókönyv 9 rovata</S>
      <p>Minden iratbejegyzés 9 rovatot tartalmaz, pontos sorrenddel:</p>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold w-8">#</th>
              <th className="px-3 py-2 font-semibold">Rovat</th>
              <th className="px-3 py-2 font-semibold">Tartalom</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr><td className="px-3 py-2 font-mono">1</td><td className="px-3 py-2 font-medium">Iktatószám</td><td className="px-3 py-2 text-slate-600">Évente új számozás (1-től). Pl. <C>2026/1</C>.</td></tr>
            <tr><td className="px-3 py-2 font-mono">2</td><td className="px-3 py-2 font-medium">Beérkezett irat hivatalos száma + kelte</td><td className="px-3 py-2 text-slate-600">A küldő intézmény saját iktatószáma. Pl. „Esperesi 479/2023., 2023. ápr. 28.”</td></tr>
            <tr><td className="px-3 py-2 font-mono">3</td><td className="px-3 py-2 font-medium">Beérkezés ideje</td><td className="px-3 py-2 text-slate-600">A felső sorba — amikor a mi hivatalunkba érkezett.</td></tr>
            <tr><td className="px-3 py-2 font-mono">4</td><td className="px-3 py-2 font-medium">Mellékletek száma</td><td className="px-3 py-2 text-slate-600">Ha melléklet nincs, üresen hagyjuk.</td></tr>
            <tr><td className="px-3 py-2 font-mono">5</td><td className="px-3 py-2 font-medium">Küldő neve</td><td className="px-3 py-2 text-slate-600">Pl. „Dési Református Egyházmegye Esperesi Hivatala”.</td></tr>
            <tr>
              <td className="px-3 py-2 font-mono">6</td>
              <td className="px-3 py-2 font-medium">Az ügy rövid tartalma + válasz</td>
              <td className="px-3 py-2 text-slate-600">
                Felső sor: a beérkezett ügy rövid tartalma.<br />
                Alsó sor: a válasz rövid tartalma — csak az elintézés után írjuk be.
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-mono">7</td>
              <td className="px-3 py-2 font-medium">Ellátás (postázás dátuma)</td>
              <td className="px-3 py-2 text-slate-600">
                Hónap és nap — amikor a választ ténylegesen postáztuk. Csak akkor töltjük ki,
                ha a választás megtörtént. Ha a következő évben történik, az évet is beírjuk.
              </td>
            </tr>
            <tr><td className="px-3 py-2 font-mono">8</td><td className="px-3 py-2 font-medium">Irattári szám</td><td className="px-3 py-2 text-slate-600">Az ügykörjegyzék-pont száma (pl. „1.”, „6/1.”, „13/2.”). Lásd Kötetes / Szálas iratok kategóriák.</td></tr>
            <tr><td className="px-3 py-2 font-mono">9</td><td className="px-3 py-2 font-medium">Hivatkozás más iktatószámra</td><td className="px-3 py-2 text-slate-600">Különösen kimenő iratoknál. Pl. „lásd 36/2023” — a válaszlevél kapja a megkeresés iktatószámát.</td></tr>
          </tbody>
        </table>
      </div>

      <S>Egyházközségből kiinduló ügyek</S>
      <p>
        Olyan ügyeknél, amelyekben a megkeresés vagy felterjesztés az egyházközség
        részéről történik (kimenő irat), a <strong>felső sort üresen hagyjuk</strong>,
        és csak az alsó sort töltjük ki.
      </p>

      <S>Iktatás időzítése — fontos</S>
      <Callout tone="amber">
        <strong>Minden iratot az intézkedés ELŐTT iktatunk.</strong> A 6. rovat alsó
        sora és a 7. rovat addig <em>üresen áll</em>, amíg az ügy elintézése (a válasz
        postázása) ténylegesen megtörténik.
      </Callout>

      <S>Kötelező aláírások</S>
      <p>
        A kimenő iratokat aláírja a <strong>lelkipásztor és a (fő)gondnok</strong>, majd
        lepecsételjük. A másodpéldányt aláírva (pecsét nélkül) tesszük az irattárba.
      </p>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Iktatópecsét és példák
// ─────────────────────────────────────────────────────────────────────────

function StampContent() {
  return (
    <>
      <p>
        Minden beérkező iratra <strong>iktatópecsét</strong> kerül a jobb felső sarokba.
        A pecsét tartalmazza az iktatás kulcsadatait.
      </p>

      <S>Beérkező irat — minta</S>
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-slate-700">A Dési Református Egyházmegye Esperesi Hivatala</p>
            <p>Szám: 479/2023.</p>
            <p>Tárgy: Lelkészi fizetések módosítása</p>
          </div>
          <div className="rounded border border-slate-300 bg-white p-3 text-xs font-mono">
            <p className="font-bold">Iktatva</p>
            <p>Kelt: 2023. május 3.</p>
            <p>Ikt. sz: 36/2023</p>
            <p>I.gy: 1. Sorsz. 12</p>
            <p>Elintézve: _________</p>
          </div>
        </div>
      </div>

      <S>Kimenő irat — minta</S>
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start">
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-slate-700">Mezőveresegyházi Református Egyházközség Lelkipásztori Hivatala</p>
            <p>Cím: …</p>
            <p>Szám: 21/2023.</p>
            <p>Tárgy: Presbiteri meghívó</p>
          </div>
          <div className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-mono">
            <p>Másolat</p>
            <p className="mt-1">I.gy: 1/29.</p>
          </div>
        </div>
      </div>

      <S>Az iktatópecsét elemei</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Iktatva</strong> felirat</li>
        <li><strong>Kelt:</strong> a beérkezés időpontja</li>
        <li><strong>Ikt. sz.:</strong> a saját iktatószám (pl. 36/2023)</li>
        <li><strong>I.gy.:</strong> iratgyűjtő száma (ügykörjegyzék szerint)</li>
        <li><strong>Sorsz.:</strong> sorszám a megfelelő iratgyűjtőben</li>
        <li><strong>Elintézve:</strong> később pótolandó dátum</li>
      </ul>

      <S>Tipp — keresés megkönnyítése</S>
      <p>
        A pontosan kitöltött iktatópecsét lehetővé teszi, hogy években múltán is azonnal
        megtaláljuk a fizikai iratot: az iktatószámból visszanézzük az iktatókönyvben az
        irattári számot, majd onnan a megfelelő dossziét és sorszámot. A jól iktatott
        irat keresése legfeljebb 2-3 perc.
      </p>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 6. Kötetes anyag
// ─────────────────────────────────────────────────────────────────────────

function BoundContent() {
  return (
    <>
      <p>
        A 2024. január 1-től érvényes ügykörjegyzék <strong>A. Kötetes anyag</strong>{' '}
        szakasza — Igazgatótanács 66/2023. számú határozata.
      </p>

      <S>Áttekintő táblázat</S>
      <RegistryTable
        rows={[
          { uj: 'I.', regi: '1.', nev: 'Presbiteri gyűlések jegyzőkönyvei' },
          { uj: 'II.', regi: '2.', nev: 'Közgyűlési jegyzőkönyvek' },
          { uj: 'III.', regi: '3.', nev: 'Anyakönyvek' },
          { uj: 'III/1.', regi: '', nev: 'Keresztelési anyakönyv' },
          { uj: 'III/2.', regi: '', nev: 'Konfirmálási anyakönyv' },
          { uj: 'III/3.', regi: '', nev: 'Esketési anyakönyv' },
          { uj: 'III/4.', regi: '', nev: 'Temetési anyakönyv' },
          { uj: 'III/5.', regi: '', nev: 'Át- és kitértek anyakönyve' },
          { uj: 'IV.', regi: '3.', nev: 'Családkönyv és az elektronikus nyilvántartás nyomtatott és bekötött lapjai' },
          { uj: 'V.', regi: '—', nev: 'Be- és kiköltözöttek nyilvántartása' },
          { uj: 'VI.', regi: '4.', nev: 'Lelkipásztori munkanapló' },
          { uj: 'VII.', regi: '5.', nev: 'Iktatókönyv' },
          { uj: 'VIII.', regi: '6.', nev: 'Aranykönyv' },
          { uj: 'IX.', regi: '21.', nev: 'Historia Domus' },
          { uj: 'X.', regi: '12.', nev: 'Leltárak (Registrul numerelor de inventar)' },
          { uj: 'XI.', regi: '14.', nev: 'Főkönyv (Registru jurnal)' },
          { uj: 'XII.', regi: '—', nev: 'Belmissziós szövetségek jegyző- vagy emlékkönyvei' },
          { uj: 'XII/1.', regi: '', nev: 'Nőszövetség' },
          { uj: 'XII/2.', regi: '', nev: 'IKE (Ifjúsági Keresztyén Egyesület)' },
          { uj: 'XII/3.', regi: '', nev: 'Dalárdák, dalkörök, zenekarok' },
        ]}
      />

      <S>I. Presbiteri gyűlések jegyzőkönyvei</S>
      <p>
        Vezethető <strong>kézírással</strong> (nagyobb formátumú, keményfedelű, legalább
        100 lapos füzet) vagy <strong>elektronikusan</strong>. Legalább 4 ülés évente.
        Az elektronikus jegyzőkönyveket folyamatosan sorszámozzuk, kinyomtatjuk,
        hitelesítőnként minden oldalt aláírjuk. Az irattartóban lefűzve tárolt lapokat
        legalább <strong>5 évenként kemény táblába beköttetni</strong>. A lelkipásztor a
        gyülekezet átadása előtt köteles beköttetni minden meglévő jegyzőkönyvet.
      </p>
      <p>
        A tárgysorozati pontok számozása évenként folytatólagos (pl. <C>9-2023</C>,{' '}
        <C>10-2023</C>, …). Minden gyűlés előtt legalább 3 nappal{' '}
        <strong>presbiteri meghívót</strong> küldünk, ismertetve a tárgyalandó ügyeket.
        A meghívót iktatjuk és aláíratjuk a presbiterekkel. Az aláírt meghívó az{' '}
        <strong>1. számú iratgyűjtőbe</strong> kerül (Levelezés).
      </p>
      <Sub>Formai követelmények</Sub>
      <ul className="list-disc pl-5 space-y-1">
        <li>Sűrű sorokban írjuk (ne lehessen sorok közé beírni)</li>
        <li>A „K. m. f.” + aláírások nem kerülhetnek önmagukban új oldalra</li>
        <li>Sortávolság: szimpla. Bal margó: 2-2,5 cm. Jobb margó: 1-1,5 cm. Alsó-felső margó: 2,5-3 cm</li>
        <li>Sorkizárt rendezés, szükség esetén elválasztás</li>
      </ul>

      <S>II. Közgyűlési jegyzőkönyvek</S>
      <p>
        Lásd az I. pontot. Különbségek:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Évente legalább <strong>egy közgyűlést</strong> tartunk (vagy szükség szerint).</li>
        <li>A közgyűlést <strong>előzőleg két vasárnap a szószékről kihirdetjük</strong>.</li>
        <li>A jegyzőkönyvet a <strong>gyűlés végén ismertetni és hitelesíteni</strong> kell.</li>
        <li>Elektronikus jegyzőkönyveknél: legfeljebb <strong>10 év</strong> elteltével kemény táblába kötés.</li>
      </ul>

      <S>III. Anyakönyvek</S>
      <Callout tone="red">
        Az anyakönyveket KIZÁRÓLAG kézírással, az anyakönyv rendeltetése szerinti
        nyomtatványból köttetett regiszterekbe vezetjük.{' '}
        <strong>Elektronikus formában vezetett anyakönyv használata NEM megengedett!</strong>
      </Callout>
      <Sub>III/1. Keresztelési anyakönyv</Sub>
      <ul className="list-disc pl-5 space-y-1">
        <li>Nem-egyházközségi keresztelést sorszám nélkül vezetjük, és jelentjük a szülők lelkipásztori hivatalának.</li>
        <li>Az adatokat az eseményt követő <strong>5. napon belül</strong> be kell vezetni.</li>
        <li>Az „állami anyakönyvi szám” rovatba a <em>Certificat de naştere</em> alján található számot írjuk.</li>
        <li>A születési bizonyítvány előzetes bemutatása nélkül NEM keresztelünk.</li>
        <li>Beceneveket (Bözsi, Pityu, Baba) nem írunk be.</li>
        <li>A gyermek <strong>törvénytelen</strong>, ha szülei polgárilag nincsenek összeházasodva.</li>
        <li>A konfirmáció időpontját utólagosan vezetjük be.</li>
        <li>A családkönyvi számot is bevezetjük (a Megjegyzések oszlopba, ha nincs külön rovat).</li>
      </ul>
      <Sub>III/2. Konfirmáltak anyakönyve</Sub>
      <p>
        A keresztelési év feltétlenül beírandó (csak az konfirmálhat, akit megkereszteltek).
        Ha máshol keresztelték, keresztelési igazolást kérünk. <strong>Bármelyik
        felekezetben (evangélikus, római katolikus, ortodox, görögkatolikus stb.)
        elvégzett keresztséget elfogadjuk.</strong>
      </p>
      <Sub>III/3. Esketési anyakönyv</Sub>
      <p>
        Az állami anyakönyvi szám a <em>Certificat de căsătorie</em> aljáról:{' '}
        <em>„Căsătoria a fost trecută în registrul stării civile la nr. …”</em>
      </p>
      <Callout tone="amber">
        A polgári házasságkötést igazoló irat felmutatása nélkül <strong>NEM
        végezzük el az esketést</strong>.
      </Callout>
      <Sub>III/4. Temetési anyakönyv</Sub>
      <ul className="list-disc pl-5 space-y-1">
        <li>Az egyházközség birtokában lévő temetőbe temetésnél elkérjük a polgármesteri „<em>Adeverință</em>„-t — ennek számát (deces nr.) írjuk be az állami anyakönyvi szám rovatába.</li>
        <li>Az Adeverința-t iktatjuk és a <strong>2-es iratgyűjtőbe</strong> tesszük (anyakönyvi levelezés).</li>
        <li>A halotti anyakönyvi kivonatot (Certificat de deces) — eredetiben vagy másolatban — NEM tároljuk.</li>
        <li>A halott születési időpontját a személyazonossági igazolványból vagy a CNP-ből írjuk ki.</li>
      </ul>
      <Sub>III/5. Át- és kitértek anyakönyve</Sub>
      <p>
        Áttértek: más felekezetből hozzánk tértek. Kitértek: tőlünk más felekezetbe tértek.
        Mindkettőről <strong>Nyilatkozat veendő</strong>, amit iktatunk és a 2-es
        iratgyűjtőbe helyezzük. Aláírja az át-/kitérő és <strong>két tanú</strong>.{' '}
        <strong>Kiskorúak NEM adhatnak nyilatkozatot</strong> át- vagy kitérésükről.
      </p>

      <S>IV. Családkönyv</S>
      <p>
        Minden kinyitott oldalra (két oldal) csak egyetlen családot vezetünk be. A
        konfirmációt, házasságkötést, halálozást is bevezetjük. Ha a gyermek házasságot
        köt, új oldalt nyitunk és a megjegyzési rovatba beírjuk az új oldal számát.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Halál</strong>: a Neve rovatot <em>kétszer átlósan</em> áthúzzuk.</li>
        <li><strong>Kiköltözés / kitérés</strong>: <em>egyszer átlósan</em> áthúzzuk.</li>
        <li>Minden vízszintes rovatba <strong>csak egy nevet</strong> írunk.</li>
        <li>ABC-rendben rendezett <strong>betűsoros névmutatót</strong> (Index) is vezessünk.</li>
      </ul>
      <Callout tone="amber">
        <strong>A Családkönyv vezetése kötelező. A kartoték vagy számítógépes
        nyilvántartás ezt NEM helyettesíti!</strong> Az elektronikus adatokat legtöbb
        ötévente ki kell nyomtatni és be kell köttetni.
      </Callout>

      <S>V. Be- és kiköltözöttek nyilvántartása</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Beköltözés esetén az új tagnak <strong>6 héten belül</strong> be kell jelentkeznie.</li>
        <li>Az előző lelkipásztor <strong>kiköltözési iratot</strong> állít ki és küld az új egyházközségnek.</li>
        <li>Az új egyházközségtől <strong>visszajelzést kérünk</strong> a nyilvántartásba vételről.</li>
        <li>Csak a visszajelzés megérkezése után írhatjuk le a kiköltözötteket a nyilvántartásunkból.</li>
        <li>Az adatokat <strong>5 napon belül</strong> be kell vezetni.</li>
      </ul>

      <S>VI. Lelkipásztori munkanapló</S>
      <p>
        Három részből áll: <strong>1) Istentisztelet, 2) Katekézis, 3) Családlátogatás</strong>.
        A szolgálatot az elvégzés után azonnal bevezetjük (mielőtt feledésbe merülnének az
        adatok). Az alkalmakon való részvételt <strong>reálisan</strong> kell bevezetni.
        Az adatokat évenként (esetleg havonta) összesítjük az évi lelkészi jelentéshez.
      </p>

      <S>VIII. Aranykönyv</S>
      <p>
        Nagyformátumú, díszes kiadású, keménytáblás regiszter. Beírunk minden{' '}
        <strong>pénzbeli vagy természetbeni adományt</strong> (terítők, önkéntes munka — annak
        pénzbeli értékét is). <strong>NEM</strong> vezetjük be a rendes egyházfenntartói
        járulékot és a központi segélyeket. Minden évben bevezetjük azok nevét, akik az
        úrasztal megterítéséhez kenyérrel, borral vagy pénzzel hozzájárultak.
      </p>

      <S>IX. Historia Domus</S>
      <p>
        Keménykötésű 100-200 lapos füzet. Évente bejegyezzük az egyházközség életének
        fontosabb eseményeit.
      </p>

      <S>X. Leltárak</S>
      <p>
        Három csoport: <strong>Ingatlanok, Ingóságok, Kis értékű leltári tárgyak</strong>.
        Minden tárgynak külön leltári száma van. A leltárkönyv lapjait megszámozzuk,
        átfűzzük, a hátsó borítólapon hitelesítjük. Egyetlen lapot sem szabad eltávolítani.
      </p>
      <Callout tone="red">
        <strong>Presbiteri határozat nélkül semmit sem szabad leírni a leltárból.</strong>
        Klenódiumok, textíliák, történeti értékű iratok és könyvek selejtezése
        TILOS! A selejtezési jegyzőkönyv egy példányát a 6/1. iratgyűjtőbe tesszük.
      </Callout>

      <S>XI. Főkönyv (Registru jurnal)</S>
      <p>
        Elektronikusan vezetjük, év végén kétoldalasan (faţă-verso) kinyomtatjuk. Az
        oldalakat lefűzzük, <strong>5 évenként vagy 200 lap után kemény laptáblába kötjük</strong>.
      </p>

      <S>XII. Belmissziós szövetségek jegyzőkönyvei</S>
      <p>
        XII/1. Nőszövetség, XII/2. IKE, XII/3. Dalárdák, dalkörök, zenekarok — az
        I. ponttal megegyező szabályok szerint vezetjük.
      </p>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 7. Szálas iratok
// ─────────────────────────────────────────────────────────────────────────

function LooseContent() {
  return (
    <>
      <p>
        A <strong>B. Szálas iratok</strong> — 18 fő irattartó (plus alegységek). Minden
        irattartóhoz tartozik egy megőrzési típus:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><Pill tone="emerald">F.Á.</Pill> — folyamatosan állandó (a dossziét akkor zárjuk le, amikor megtelik)</li>
        <li><Pill tone="cyan">É.Á.</Pill> — évente állandó (minden év végén lezárjuk, az iratmennyiségtől függetlenül)</li>
      </ul>

      <S>Áttekintő táblázat</S>
      <RegistryTable
        showRetention
        rows={[
          { uj: '1.', regi: '7., 8.', nev: 'Levelezés (egyházkerületi, egyházmegyei, egyházközségi, világi hatóságokkal, magánszemélyekkel)', retention: 'É.Á.' },
          { uj: '2.', regi: '3/6.', nev: 'Anya- és családkönyvi levelezés és adatvédelmi nyilatkozatok', retention: 'F.Á.' },
          { uj: '3.', regi: '8.', nev: 'Jelentések', retention: 'F.Á.' },
          { uj: '4.', regi: '9.', nev: 'Választói névjegyzékek', retention: 'F.Á.' },
          { uj: '5.', regi: '10.', nev: 'Egyházi alkalmazottak személyi iratgyűjtői', retention: 'F.Á.' },
          { uj: '6.', regi: '12.', nev: 'Leltári ügyek', retention: '' },
          { uj: '6/1.', regi: '', nev: 'Vagyonleltári jelentések, leltárívek, selejtezési jegyzőkönyvek', retention: 'É.Á.' },
          { uj: '6/2.', regi: '', nev: 'Birtokívek, telekkönyvi kivonatok, adóazonosító, gépkocsik törzskönyve', retention: 'F.Á.' },
          { uj: '6/3.', regi: '', nev: 'Alapeszközök nyilvántartó lapjai', retention: 'F.Á.' },
          { uj: '6/4.', regi: '', nev: 'Ingatlanadók, felértékelések, kockázatfelmérések, biztosítások', retention: 'F.Á.' },
          { uj: '6/5.', regi: '', nev: 'Részvények és banki kötvények', retention: 'F.Á.' },
          { uj: '6/6.', regi: '11.', nev: 'Pecsétnyomók nyilvántartása', retention: 'F.Á.' },
          { uj: '6/7.', regi: '19.', nev: 'Anyagraktári ügyek', retention: 'F.Á.' },
          { uj: '7.', regi: '11., 13.', nev: 'Műemlékek, műkincsek, történeti értékű tárgyak', retention: 'F.Á.' },
          { uj: '8.', regi: '17.', nev: 'Költségvetések, költségvetés-módosítások, számadások', retention: 'F.Á.' },
          { uj: '9.', regi: '15.', nev: 'Pénzügyi igazoló iratok', retention: 'É.Á.' },
          { uj: '9/1.', regi: '', nev: 'Pénztári igazoló iratok (készpénz)', retention: '' },
          { uj: '9/2.', regi: '', nev: 'Banki igazoló iratok (átutalás, számla, kivonat, banknapló)', retention: '' },
          { uj: '10.', regi: '16.', nev: 'Csoportnapló', retention: 'É.Á.' },
          { uj: '11.', regi: '18.', nev: 'Fizetési jegyzékek', retention: 'F.Á.' },
          { uj: '12.', regi: '', nev: 'Munkavédelem, tűzvédelem', retention: 'F.Á.' },
          { uj: '13.', regi: '', nev: 'Szerződések', retention: 'F.Á.' },
          { uj: '13/1.', regi: '', nev: 'Bérleti szerződések', retention: '' },
          { uj: '13/2.', regi: '', nev: 'Közüzemi szerződések (energia, telekom, víz)', retention: '' },
          { uj: '13/3.', regi: '', nev: 'Szolgáltatási és támogatási szerződések', retention: '' },
          { uj: '14.', regi: '', nev: 'Pályázatok', retention: 'F.Á.' },
          { uj: '15.', regi: '20.', nev: 'Ellenőrzési jegyzőkönyvek (belső, gazdasági, felsőbb hatósági)', retention: 'F.Á.' },
          { uj: '16.', regi: '', nev: 'Egyházközségi egyesületek és alapítványok (statútum, bírósági kivonat)', retention: 'F.Á.' },
          { uj: '17.', regi: '', nev: 'Temetőügyek', retention: 'F.Á.' },
          { uj: '18.', regi: '', nev: 'Gyülekezeti kiadványok, aprónyomtatványok, rendezvények dokumentumai', retention: 'F.Á.' },
        ]}
      />

      <Callout tone="amber">
        <strong>Rögzítők használata:</strong> a szálas iratok ellátásakor kerüljük a fém,
        illetve műanyag rögzítők (gémkapocs, irodai kapocs, gombostű stb.) használatát.
        Ehelyett inkább <strong>A3-as lapot</strong> használjunk ezek összefogására.
      </Callout>

      <S>1. Levelezés — É.Á.</S>
      <p>
        A4-es vagy A5-ös iratokkal. Ide kerül minden egyházi és világi intézménytől,
        magánszemélytől kapott vagy nekik írt irat (és a válaszok is). Itt őrizzük a{' '}
        <strong>presbiteri meghívókat</strong> is. Dossziéba helyezzük már a beérkezéskor.
        Év végén iktatószámok szerint sorba rakjuk, iratjegyzéket készítünk, átfűzzük,
        hitelesítjük. A lezárt irattartóból dokumentumot kivenni NEM szabad — szükség
        esetén hivatalos másolatot készíthetünk.
      </p>

      <S>2. Anya- és családkönyvi levelezés — F.Á.</S>
      <p>
        Halotti igazolások (Adeverinta), át- és kitértek nyilatkozatai, keresztelési
        igazolások, konfirmációi igazolások, ki- és beköltözöttek jelentése.
        Iratjegyzéket folyamatosan vezetjük, a számozást évenként újrakezdjük. Öt évenként
        lezárjuk a dossziét.
      </p>

      <S>3. Jelentések — F.Á.</S>
      <p>
        Évi lelkészi, belmissziói, ifjúsági, lélekszám- és egyéb felsőbb hatóságnak küldött
        jelentések <strong>aláírt másodpéldánya</strong>. Tíz évenként lezárjuk.
      </p>

      <S>4. Választói névjegyzékek — F.Á.</S>
      <p>
        Lásd a Kánon 2006. évi 1. jogszabály 37. paragrafusát. Az Esperesi Hivataltól
        visszaérkezett hitelesített példányt betesszük a dossziéba. Folytatólagosan
        vezetjük, amíg betelik. Itt őrizzük a fellebbezéseket is.
      </p>

      <S>5. Egyházi alkalmazottak személyi iratgyűjtője — F.Á.</S>
      <p>Tartalmazza:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Lelkipásztor <strong>törzskönyvi lapja</strong> (3 példányban: 1 az egyházközségnél, 2 az Esperesi Hivatalban)</li>
        <li>Lelkészképesítő diplomák és felszentelési oklevél másolata</li>
        <li>Egyéni munkaszerződés, munkaköri leírás</li>
        <li>Megválasztást kimondó közgyűlési határozat jegyzőkönyvi másolata</li>
        <li>Megválasztás megerősítése</li>
        <li>Besorolási határozat (Igazgatótanács)</li>
        <li>Presbiteri jegyzőkönyv-kivonat a besorolás összegéről</li>
        <li>Az alkalmazottak <strong>GDPR nyilatkozatai</strong></li>
        <li>Orvosi iratok</li>
      </ul>

      <S>6. Leltári ügyek — F.Á.</S>
      <p>
        Az általános leltári hivatalos iratok. <strong>6/1. — É.Á.</strong>: vagyonleltári
        jelentések, leltárívek, selejtezési jegyzőkönyvek (évente lezárjuk).{' '}
        <strong>6/2. — F.Á.</strong>: telekkönyvi kivonatok, cod fiscal, gépkocsik
        törzskönyve — ezek eredeti okmányok, <em>páncélszekrényben</em> tartandók.{' '}
        <strong>6/3.</strong> Alapeszközök nyilvántartó lapjai (a leltár programból
        nyomtatható). <strong>6/4.</strong> Ingatlanadók, biztosítások.{' '}
        <strong>6/5.</strong> Részvények és banki kötvények. <strong>6/6.</strong>{' '}
        Pecsétnyomók nyilvántartása (lenyomattal együtt). <strong>6/7.</strong>{' '}
        Anyagraktári ügyek (nyugtatömbök, építkezési anyagok, nyomtatványok).
      </p>

      <S>7. Műemlékek, műkincsek — F.Á.</S>
      <p>
        Klenódiumok, textíliák, 1900 előtti levéltári iratok, 1850 előtti könyvek és
        kéziratok, templomi bútorzat, zászlók, címerek, festmények, szobrok, fényképek.
      </p>

      <S>8. Költségvetések, számadások — F.Á.</S>
      <p>
        Az év utolsó előtti hónapjában a presbitérium elkészíti a következő év
        költségvetését. Az év letelte után azonnal a <strong>zárszámadást</strong>.
        Mindkettőt <strong>2-2 példányban</strong> felterjesztjük az Egyházmegyéhez,
        a számvevő ellenőrzi, egy példányt visszaküldenek a láttamozás után.
      </p>

      <S>9. Pénzügyi igazoló iratok — É.Á.</S>
      <p>
        Külön dossziéba: <strong>9/1.</strong> Pénztári (készpénz): kifizetési bizonylatok,
        számlák, pénztárnapló („kasszakönyv”), kifizetést kísérő iratok.{' '}
        <strong>9/2.</strong> Banki: átutalási szelvény, számla, számlakivonat, banknapló,
        megrendelőlap. Minden kiadási nyugta mellé csatolni kell a{' '}
        <strong>kiadási utalványt</strong> (lelkipásztor + (fő)gondnok aláírja).
      </p>
      <Callout tone="amber">
        Ezeket az iratokat <strong>15 évig</strong> meg kell őrizni, ez után lehet
        selejtezni. A pályázati elszámolások eredeti iratai a 14-es iratgyűjtőben
        maradnak, ide a lelkész által hitelesített másolatok kerülnek.
      </Callout>

      <S>10. Csoportnapló — É.Á.</S>
      <p>
        Az elektronikus könyvelésből bevételi és kiadási tételek szerint nyomtatható.
      </p>

      <S>11. Fizetési jegyzékek — F.Á.</S>
      <p>Az ellátott fizetési jegyzékek (státok).</p>

      <S>12. Munkavédelem, tűzvédelem — F.Á.</S>
      <p>
        Munkavédelmi iratok, alkalmazottak munka- és tűzvédelmi felkészítését igazoló
        füzetek.
      </p>

      <S>13. Szerződések — F.Á.</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>13/1.</strong> Bérleti szerződések</li>
        <li><strong>13/2.</strong> Közüzemi szerződések (energia, telekom, víz, csatorna)</li>
        <li><strong>13/3.</strong> Szolgáltatási és támogatási szerződések</li>
      </ul>

      <S>14. Pályázatok — F.Á.</S>
      <p>
        Pályázatonként <strong>külön iratgyűjtő</strong> (14/1, 14/2, ...). Minden
        kapcsolódó irat: pályázati felhívás, beadott pályázat, mellékletek,
        szerződések, módosítások, elszámolások <em>eredeti iratai</em> (nyugták, számlák is).
      </p>

      <S>15. Ellenőrzési jegyzőkönyvek — F.Á.</S>
      <p>
        Belső bizottságok, gazdasági bizottság, egyházi felsőbb hatósági és világi
        hatósági ellenőrzések jegyzőkönyvei iktatószám szerinti sorrendben.
      </p>

      <S>16. Egyházközségi egyesületek és alapítványok — F.Á.</S>
      <p>Statútum, hivatalos adatok, bírósági kivonatok.</p>

      <S>17. Temetőügyek — F.Á.</S>
      <p>Temetői szabályzatok, nyilvántartások, a temetővel kapcsolatos iratok.</p>

      <S>18. Gyülekezeti kiadványok — F.Á.</S>
      <p>
        Gyülekezeti újság/hírlevél, rendezvény-meghívók, plakátok, műsorlapok, gyászjelentők,
        emléklapok, ismeretterjesztő füzetek.
      </p>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 8. Megőrzés
// ─────────────────────────────────────────────────────────────────────────

function RetentionContent() {
  return (
    <>
      <S>A két megőrzési típus</S>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="mb-2">
            <Pill tone="emerald">F.Á. — Folyamatosan állandó</Pill>
          </div>
          <p className="text-sm">
            A dossziét akkor zárjuk le, amikor <strong>megtelik</strong>. Folyamatosan
            gyűjtünk bele iratokat a beérkezés / kibocsátás sorrendjében.
          </p>
          <p className="mt-2 text-xs text-slate-600">
            Pl. személyi iratgyűjtő, leltári ügyek, szerződések, pályázatok.
          </p>
        </div>
        <div className="rounded-lg border border-cyan-200 bg-cyan-50/40 p-4">
          <div className="mb-2">
            <Pill tone="cyan">É.Á. — Évente állandó</Pill>
          </div>
          <p className="text-sm">
            Minden év végén lezárjuk a dossziét, <strong>iratmennyiségtől függetlenül</strong>.
            Új évben új dossziét nyitunk.
          </p>
          <p className="mt-2 text-xs text-slate-600">
            Pl. Levelezés (1.), Vagyonleltári jelentések (6/1.), Pénzügyi igazoló iratok
            (9.), Csoportnapló (10.).
          </p>
        </div>
      </div>

      <S>Lezárási eljárás (mindkét típushoz)</S>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Az iratokat <strong>iktatószámok szerint sorba rakjuk</strong>.</li>
        <li><strong>Iratjegyzéket (tartalomjegyzéket)</strong> készítünk és a dosszié elejére tesszük.</li>
        <li>Átfűzzük (papírzsineggel vagy A3-as lappal — nem fém kapoccsal).</li>
        <li><strong>Hitelesítjük</strong> (aláírás, dátum).</li>
      </ol>
      <Callout tone="red">
        A lezárt irattartóból <strong>dokumentumot kivenni NEM szabad</strong>.
        Szükség esetén hivatalos másolatot készíthetünk.
      </Callout>

      <S>Beköttetési kötelezettség</S>
      <p>
        Az elektronikusan vezetett, kinyomtatott és lefűzött <strong>kötetes anyagokat</strong>{' '}
        (presbiteri jegyzőkönyv, lelkészi munkanapló, iktatókönyv, főkönyv) legalább{' '}
        <strong>5 évenként</strong> (vagy 200 lap után) kemény laptáblába kell köttetni.
        A közgyűlési jegyzőkönyveknél a határidő <strong>10 év</strong>.
      </p>
      <Callout tone="amber">
        A lelkipásztor a gyülekezet <strong>átadása előtt</strong> köteles beköttetni
        (a meglévő, még be nem kötött lapokat mennyiségtől függetlenül) a szolgálati ideje
        alatt született összes jegyzőkönyvet, munkanaplót és iktatókönyvet.
      </Callout>

      <S>Selejtezhetőség</S>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Pénzügyi igazoló iratok (9.)</strong>: 15 év után selejtezhetők.</li>
        <li><strong>Klenódiumok, textíliák, történeti értékű iratok</strong>: SOHA nem selejtezhetők.</li>
        <li><strong>Pecsétnyomók (6/6.)</strong>: a megrongálódott bélyegzőt kivesszük a használatból, de NEM semmisítjük meg — a levéltárban megőrizzük.</li>
        <li><strong>Halotti anyakönyvi kivonat (Certificat de deces)</strong>: sem eredetiben, sem másolatban nem tároljuk.</li>
      </ul>

      <S>Jelenleg érvényes szabályok</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Az új ügykörjegyzék <strong>2024. január 1.</strong> óta érvényben.</li>
        <li>Az 1965-2023 közötti iratokra a régi szabályozás érvényes.</li>
        <li>Az 1964 előtti iratokat a kerületi levéltár rendezte a 2010-es években.</li>
      </ul>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 9. Elektronikus anyagok
// ─────────────────────────────────────────────────────────────────────────

function ElectronicContent() {
  return (
    <>
      <p>
        Az ügykörjegyzék <strong>C. Elektronikus anyagok</strong> szakasza tartalmazza
        a digitális dokumentumokat.
      </p>

      <S>Mit tartalmaz?</S>
      <ul className="list-disc pl-5 space-y-1">
        <li>Az elektronikus formában elkészített jegyzőkönyvek</li>
        <li>A könyveléshez, leltárhoz, szolgálati munkanaplóhoz, gyülekezeti nyilvántartáshoz tartozó adatok</li>
        <li>Az egyházközség életét dokumentáló <strong>videó és audió anyagok</strong></li>
      </ul>

      <S>Archiválási irányelv</S>
      <Callout tone="amber">
        <strong>Mentsük a lehető legidőtállóbb hordozóra, több helyre, és időszakonként
        ellenőrizzük.</strong> Az adatvesztés ellen 3-2-1 mentési stratégia javasolt: 3
        példány, 2 különböző médián, 1 külső helyszínen.
      </Callout>

      <S>Kötelező nyomtatás és beköttetés</S>
      <p>
        Az alábbi elektronikus anyagok <strong>nyomtatva és beköttetve</strong> is őrzendők:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Presbiteri jegyzőkönyvek</strong> — 5 évenként vagy mennyiség alapján</li>
        <li><strong>Közgyűlési jegyzőkönyvek</strong> — 10 évenként</li>
        <li><strong>Családkönyv elektronikus nyilvántartás</strong> — legfeljebb 5 évente kinyomtatandó és beköttetendő</li>
        <li><strong>Lelkipásztori munkanapló</strong> — 5 évenként</li>
        <li><strong>Iktatókönyv</strong> — évente lezárva, 5 évenként beköttetve</li>
        <li><strong>Főkönyv (Registru jurnal)</strong> — évente kinyomtatva, 5 évenként vagy 200 lap után beköttetve</li>
      </ul>

      <S>Kapcsolódó eszközök</S>
      <p>
        A <strong>Kartotéka rendszer</strong> mellett az EREK hivatalos elektronikus
        segédletei is használhatók:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>Könyvelési segédlet</strong> (Beke Tivadar lp.) — Excel alapú nyilvántartó
          a könyveléshez, lelkészi munkanaplóhoz, iktatókönyvhöz, anyagraktárkönyvhöz.
        </li>
        <li>
          <strong>Leltár program</strong> — vagyonleltár elektronikus változatban.
        </li>
        <li>Letölthető: <C>reformatus.ro/dokumentumok/adminisztracio</C></li>
      </ul>

      <S>Egyházközségi ügykörjegyzék — záró megjegyzés</S>
      <p>
        Az iratok rendezésénél vegyük figyelembe a 2024. január 1-től érvényes egyházközségi
        ügykörjegyzéket. Az útmutató forrása: az Erdélyi Református Egyházkerület
        Igazgatótanácsának <strong>66/2023. számú határozata</strong>. A 14. Egyházi
        Adminisztrációs útmutató a teljes, hivatalos szabályozást tartalmazza.
      </p>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 10. Kartotéka-funkciók (2026-07-17, F6) — az app saját iktató-eszközei
// ─────────────────────────────────────────────────────────────────────────

function DigitalContent() {
  return (
    <>
      <p>
        Az Iktató modul a hagyományos iktatókönyv-vezetésen túl három digitális
        eszközt is ad: <strong>igazolás/levél-kiállítást automatikus iktatással</strong>,{' '}
        <strong>iratcsomó-kezelést leltár-nyomtatással</strong> és az iratok{' '}
        <strong>befotózását / csatolmányait</strong>.
      </p>

      <S>Igazolás / levél kiállítása — automatikus iktatással</S>
      <p>
        {'Az „Iktatott iratok" fül '}<Pill tone="teal">Igazolás / levél kiállítása</Pill>{' '}
        gombja hivatalos iratot készít sablonból vagy szabad levélként:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          A <strong>személy-kereső</strong> a tagnyilvántartásból dolgozik — a kiválasztott
          személy(ek) anyakönyvi adatai (keresztelés, konfirmálás, házasság) automatikusan
          töltik a sablon-mezőket.
        </li>
        <li>
          A <strong>hivatalos levélfej</strong> magyarul vagy románul készül a gyülekezet
          beállított adataiból (név, cím, CIF, elérhetőségek, címer).
        </li>
        <li>
          A <strong>{'„Kiállítás és iktatás"'}</strong> gomb kimenő iratként, a MAI kelttel,
          az aktuális évi iktatókönyvbe iktatja a dokumentumot — a sorszámot a rendszer
          adja, és a kiosztott iktatószám a nyomtatott iraton is megjelenik.
        </li>
        <li>
          Iktatás <em>nélküli</em> nyomtatás is lehetséges, de a szabályzat szerint minden
          kimenő iratot iktatni kell — az app erre figyelmeztet.
        </li>
      </ul>
      <Callout tone="teal">
        Ne feledd: a kinyomtatott iratot a lelkipásztor és a (fő)gondnok írja alá, az
        aláírt <strong>másodpéldány</strong> pedig az irattárba kerül.
      </Callout>

      <S>Iratcsomók és leltár</S>
      <p>
        Az <Pill tone="violet">Iratcsomók</Pill> fülön évenként hozhatók létre csomók —
        egy csomó egy <strong>fizikai dossziénak</strong> felel meg {'(pl. „Esperesi levelezés").'}
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Az iratok a sor <strong>{'„Csomóba"'}</strong> gombjával vagy az Iratcsomók fülön
          rendezhetők csomóba; a besorolás az iratlistában címkeként látszik.
        </li>
        <li>
          A megtelt dosszié csomója <strong>lezárható</strong> — lezárt csomóba nem kerülhet
          új irat, amíg fel nem oldod. Törölni csak üres csomót lehet.
        </li>
        <li>
          A <strong>{'„Leltár nyomtatása"'}</strong> A4-es iratjegyzéket készít a csomó tartalmáról
          (egyben vagy ügykör szerint csoportosítva) — ez felel meg a lezárási eljárásban
          előírt, dosszié elejére teendő <em>iratjegyzéknek</em>.
        </li>
      </ul>

      <S>Befotózás, csatolmányok, papíralapú jelzés</S>
      <p>
        Minden iktatott irathoz csatolható digitális másolat a sor{' '}
        <strong>gemkapocs</strong> ikonjával (a szám a csatolmányok darabszáma) vagy a
        szerkesztő-ablak alján:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>Befotózás</strong>: telefonon a hátsó kamera nyílik — az irat oldalai
          egyenként fotózhatók be.
        </li>
        <li>
          <strong>Fájl feltöltése</strong>: JPEG, PNG, WebP kép vagy PDF, fájlonként
          legfeljebb 10 MB. A fájlok privát tárhelyre kerülnek, megnyitásuk időben
          korlátozott, védett linkkel történik.
        </li>
        <li>
          <strong>{'„Csak metaadat"'}</strong>: ha az irat csak papíron létezik, fájl nélkül is
          rögzíthető a léte (megnevezéssel, megjegyzéssel) — így a nyilvántartás teljes marad.
        </li>
      </ul>
      <Callout tone="amber">
        A digitális másolat <strong>NEM helyettesíti</strong> az eredeti papír irat
        előírás szerinti irattári megőrzését — a befotózás a gyors visszakeresést és a
        biztonsági másolatot szolgálja.
      </Callout>
    </>
  )
}
