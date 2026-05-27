'use client'

import { useState } from 'react'
import {
  AlertCircle,
  BookOpen,
  Calculator,
  ChevronRight,
  ClipboardCheck,
  Coins,
  FileText,
  Info,
  Landmark,
  Receipt,
  Sparkles,
} from 'lucide-react'

/**
 * Pénzügy súgó — Apple Settings-stílusú két-paneles UI a lelkipásztorok számára.
 * Forrás: az Erdélyi Református Egyházkerület hivatalos pénzügyi dokumentumai
 * (Pénzügyi vizsgálat, Útmutató az EREK számadásához, Változások 2026) +
 * a Kartotéka kódbázisának pénzügyi modulja.
 */

interface HelpCategory {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  short: string
}

const CATEGORIES: HelpCategory[] = [
  { id: 'general', label: 'Általános', Icon: Info, short: 'Mit szolgál a Pénzügy modul' },
  { id: 'cashbook', label: 'Kasszakönyv', Icon: BookOpen, short: 'Bizonylatok, nyomtatás, rendezés' },
  { id: 'incomes', label: 'Bevételi kódok', Icon: Coins, short: 'Teljes EREK bevételi kódlista (101–105)' },
  { id: 'expenses', label: 'Kiadási kódok', Icon: Receipt, short: 'Teljes EREK kiadási kódlista (201–205)' },
  { id: 'transit-credit', label: 'Átmeneti tételek és hitelek', Icon: Calculator, short: '106 / 107 és 206 / 207 csoportok' },
  { id: 'balance', label: 'Egyenlegek, tartozások', Icon: ClipboardCheck, short: 'Záróegyenleg, kintlevőségek' },
  { id: 'audit', label: 'Pénzügyi vizsgálat', Icon: FileText, short: 'Bemutatandó iratok ellenőrzéskor' },
  { id: 'changes-2026', label: 'Változások 2026', Icon: Sparkles, short: 'Új könyvelési segédlet, lelkészi jelentés' },
  { id: 'cash-rules', label: 'Készpénz-szabályok', Icon: Landmark, short: 'Kasszaplafon és értékhatárok' },
]

export function PenzugyHelp() {
  const [active, setActive] = useState<string>(CATEGORIES[0].id)
  const activeCategory = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0]

  return (
    <div className="card-raised overflow-hidden p-0">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] min-h-[600px]">
        {/* Bal sidebar */}
        <aside className="border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r">
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Súgó
            </p>
            <h2 className="mt-1 font-heading text-xl text-slate-800">Pénzügy</h2>
            <p className="mt-1 text-xs text-slate-500">
              Az EREK hivatalos pénzügyi szabályai
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

        {/* Jobb panel */}
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
            {active === 'cashbook' && <CashbookContent />}
            {active === 'incomes' && <IncomesContent />}
            {active === 'expenses' && <ExpensesContent />}
            {active === 'transit-credit' && <TransitCreditContent />}
            {active === 'balance' && <BalanceContent />}
            {active === 'audit' && <AuditContent />}
            {active === 'changes-2026' && <Changes2026Content />}
            {active === 'cash-rules' && <CashRulesContent />}
          </div>
        </main>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Helperek
// ─────────────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="font-heading text-base font-semibold text-slate-800 mt-5 first:mt-0">
      {children}
    </h4>
  )
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h5 className="font-semibold text-slate-700 mt-4 first:mt-0">{children}</h5>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">
      {children}
    </code>
  )
}

function CalloutWarning({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="flex items-start gap-2">
        <AlertCircle className="size-4 shrink-0 mt-0.5" />
        <div>{children}</div>
      </div>
    </div>
  )
}

interface CodeRow {
  code: string
  name: string
  desc: string
}

function CodeTable({ rows }: { rows: CodeRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Kód</th>
            <th className="px-3 py-2 font-semibold">Megnevezés</th>
            <th className="px-3 py-2 font-semibold">Magyarázat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.code} className="align-top">
              <td className="whitespace-nowrap px-3 py-2.5">
                <Code>{row.code}</Code>
              </td>
              <td className="px-3 py-2.5 font-medium text-slate-800">{row.name}</td>
              <td className="px-3 py-2.5 text-slate-600">{row.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Tartalmak
// ─────────────────────────────────────────────────────────────────────────

function GeneralContent() {
  return (
    <>
      <p>
        A <strong>Pénzügy modul</strong> az egyházközség teljes pénzügyi életét fedi le:
        bevételek és kiadások rögzítése, kasszakönyv vezetése, számadás összeállítása,
        bérleti szerződések, járulék-követés, OBLIO-integráció, monetár-ellenőrzés és
        nyugta-nyomtatás (chitanță).
      </p>

      <SectionTitle>A modul fő részei</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Áttekintés</strong> — az aktuális év pénzügyi képe egy pillantásra.</li>
        <li><strong>Kassza</strong> — készpénzes bevételek és kiadások havi bontásban.</li>
        <li><strong>Bank</strong> — bankszámlamozgások és kivonatok kezelése.</li>
        <li><strong>Tranzakciók</strong> — minden bevétel és kiadás kereshető listája.</li>
        <li><strong>Költségvetés</strong> — éves költségvetés tervezés és aktualizálás.</li>
        <li><strong>Számadás</strong> — az EREK hivatalos éves számadási űrlap automatikus generálása.</li>
        <li><strong>Tartozások</strong> — az egyházfenntartói járulék-tartozások és bérleti tartozások követése.</li>
        <li><strong>Bérleti szerződések</strong> — bérlemények és bérleti díjak nyilvántartása.</li>
        <li><strong>Monetár</strong> — kasszaellenőrzés címletenkénti bontásban.</li>
        <li><strong>OBLIO ellenőrzés</strong> — az online számlák szinkronizációjának figyelése.</li>
      </ul>

      <SectionTitle>Az EREK pénzügyi rendszerének elve</SectionTitle>
      <p>
        Minden bevétel és kiadás <strong>kódolt</strong> az EREK hivatalos kódrendszere
        szerint. A bevételi és kiadási csoportok egymással párba állnak:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Egyházi tevékenység bevételek <Code>101.xx</Code> ↔ Működési költségek <Code>201.xx</Code></li>
        <li>Missziós és diakóniai bevételek <Code>102.xx</Code> ↔ Missziós-diakóniai kiadások <Code>202.xx</Code></li>
        <li>Más bevételek <Code>103.xx</Code> ↔ Más egyházi tevékenység kiadásai <Code>203.xx</Code></li>
        <li>Gazdasági bevételek <Code>104.xx</Code> ↔ Gazdasági tevékenység kiadásai <Code>204.xx</Code></li>
        <li>Szubvenciók <Code>105.xx</Code> ↔ Beruházások <Code>205.xx</Code> (eltérő a pár!)</li>
        <li>Átmeneti bevételek <Code>106.xx</Code> ↔ Átmeneti kiadások <Code>206.xx</Code> (kötelezően azonos összeg)</li>
        <li>Kapott hitelek <Code>107.xx</Code> ↔ Törlesztések <Code>207.xx</Code></li>
      </ul>

      <p className="mt-3 text-slate-600">
        A bevételeket és kiadásokat nem feltétlenül csoportonként kell egyensúlyba hozni
        — a missziós-diakóniai csoportban általában többet költünk, mint amennyit beveszünk;
        a gazdasági tevékenység viszont többet hoz, mint amennyit kiadunk.
      </p>
    </>
  )
}

function CashbookContent() {
  return (
    <>
      <p>
        A <strong>kasszakönyv</strong> (Registru de casă) a készpénz-mozgások hivatalos
        nyilvántartása. Minden hónap végén lezárásra kerül, és nyomtatott példányban kell
        őrizni a pénzügyi ellenőrzéshez.
      </p>

      <SectionTitle>Mit kell kinyomtatni? (Változások 2026)</SectionTitle>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          <strong>Naponkénti kasszakönyvi lap:</strong> NEM kell kinyomtatni — csak a
          havonkéntit a kimutatások munkafüzetből.
        </li>
        <li>
          <strong>Kiadási kísérőív:</strong> kell nyomtatni minden készpénzes ÉS banki
          kifizetés mellé is.
        </li>
        <li>
          <strong>Havi kasszakönyv:</strong> hónap végén egy példányban kinyomtatni, ezzel
          zárjuk le a hónapot.
        </li>
        <li>
          <strong>Banki kivonat (extras):</strong> a havi banki kivonatot kell kinyomtatni a
          záráshoz. A napi extras-t NEM kell.
        </li>
        <li>
          <strong>Banknapló:</strong> a kimutatások munkafüzetből csak év végén kell nyomtatni,
          éves változatban (a lenyílóból a <Code>Jan_Dec</Code> opciót választva).
        </li>
        <li>
          <strong>Csoportnapló:</strong> szintén csak az év lezárása után.
        </li>
        <li>
          <strong>Főkönyv (Registru Jurnal):</strong> KÖTELEZŐ kinyomtatni, lehetőleg
          kétoldalasan. Lefűzni, 5 évenként vagy 200 lap után kemény laptáblába beköttetni.
        </li>
      </ul>

      <SectionTitle>Az iratok rendezése</SectionTitle>
      <p>
        Az iratok rendezésénél vegyük figyelembe a <strong>2024. január 1-től érvényes
        egyházközségi ügykörjegyzéket</strong>, az útmutató megtalálható a nyomtatványok
        mappában, valamint a{' '}
        <span className="font-mono text-xs">reformatus.ro/dokumentumok/torvenyek</span> címen,
        a kántorvizsga anyagánál.
      </p>

      <SectionTitle>Csoportnaplók</SectionTitle>
      <p>
        Csoportnaplót év végén kell kinyomtatni. Ezek a bevételi és kiadási csoportok
        szerinti analitikus jegyzékek, amelyek a számadás összesítését alapozzák meg.
      </p>

      <SectionTitle>Nyugtatömbök (Chitanță)</SectionTitle>
      <p>
        Az Erdélyi Református Egyházkerületben <strong>csak az EREK
        iratterjesztőjéből vásárolt sorszámozott nyugta használható</strong>. Más nyugták
        használatához az Igazgatótanács jóváhagyása szükséges.
      </p>
      <p>
        A nyugtatömbökhöz <strong>anyagraktárkönyvi nyilvántartás</strong> tartozik. Ha
        az egyházközség használ <em>számlatömböt</em> (Factura) is, ahhoz külön
        anyagraktárkönyvi nyilvántartás kell.
      </p>
    </>
  )
}

function IncomesContent() {
  return (
    <>
      <p>
        Az alábbiakban az <strong>Erdélyi Református Egyházkerület hivatalos bevételi
        kódlistája</strong> található, az Útmutató szerint. Minden bevétel pontosan abban
        a kategóriában kell rögzítve legyen, ahova tartozik.
      </p>

      <SectionTitle>101 — Egyházfenntartói járulék és egyházi szolgálatok</SectionTitle>
      <CodeTable
        rows={[
          { code: '101.01', name: 'Egyházfenntartói járulék', desc: 'Az egyháztagok által, az egyházfenntartásra befizetett összegek kerülnek ide.' },
          { code: '101.02', name: 'Bevételek a különböző egyházi szolgálatokért', desc: 'Harangozási díjak, az alkalmi (házasságkötés, temetés, keresztelés stb.) és más szolgálatokra megállapított díjak.' },
          { code: '101.03', name: 'Perselypénz', desc: 'Az istentiszteleteken vagy más alkalmakon perselybe tett összegek. A persely felbontása után jegyzőkönyv készül, és annak alapján nyugtát írunk a perselyben talált összegről.' },
          { code: '101.04', name: 'Adományok hívektől, egyházi intézményektől', desc: 'Magánszemélyektől és egyházi intézményektől kapott adományok. Névre szóló nyugtát kell írni minden adományozónak, akkor is, ha nem szeretné, hogy kiolvassák. Nem írhatunk névtelen adakozó nyugtát. NEM ide kerülnek az Úrasztali adományok, a missziós és diakónia célú adományok (Gyerek/ifjúsági, Nőszövetségi, Presbiterszövetségi, Legátumok), sem a felsőbb egyházi intézményektől kapott támogatások, sem a szponzortámogatás és az adók 3,5%-a.' },
          { code: '101.05', name: 'Úrasztali adományok', desc: 'Ha az úrasztalára nemcsak kenyeret és bort, hanem pénzt is adakoznak — ezek az összegek kerülnek ide.' },
          { code: '101.06', name: 'Sírhelyek eladásából, bérleti díjából, gondozásából', desc: 'Minden temetővel kapcsolatos, a temető-szabályzatban megállapított díj (sírnyitás, sírmegváltás, sírgondozás, sírfenntartás, ravatalozó kápolna használata, stb.).' },
          { code: '101.07', name: 'Központi járulékok', desc: 'Egyházmegyei bevétel — az egyházközségek NEM könyvelhetnek ehhez a tételhez.' },
          { code: '101.08', name: 'Egyházközségek fizetésalapja', desc: 'Egyházmegyei bevétel — az egyházközségek NEM könyvelhetnek ehhez a tételhez.' },
        ]}
      />

      <SectionTitle>102 — Missziós és diakóniai célú bevételek</SectionTitle>
      <CodeTable
        rows={[
          { code: '102.01', name: 'Gyerek és ifjúsági tevékenységek bevételei', desc: 'A gyerek- és ifjúsági munkára kapott hozzájárulás, támogatás, adomány.' },
          { code: '102.02', name: 'Nőszövetségi tevékenységek bevételei', desc: 'A nőszövetségi tagdíjak, szövetségi munkára kapott hozzájárulások, támogatások, adományok.' },
          { code: '102.03', name: 'Presbiterszövetségi tevékenységek bevételei', desc: 'A presbiterszövetségi tagdíjak, hozzájárulások, támogatások, adományok.' },
          { code: '102.04', name: 'Diakóniai célú adományok', desc: 'A diakóniai munkára kapott hozzájárulás, támogatás, adomány.' },
          { code: '102.05', name: 'Missziós célú adományok', desc: 'A missziós munkára kapott hozzájárulás, támogatás, adomány.' },
          { code: '102.06', name: 'Legátumok — adományok teológiai hallgatóknak', desc: 'A teológiai hallgató részére gyűjtött adományok, a legátum.' },
        ]}
      />

      <SectionTitle>103 — Más bevételek</SectionTitle>
      <CodeTable
        rows={[
          { code: '103.01', name: 'Segélyszervezetektől, alapítványoktól, helyi szervezetektől', desc: 'Csak azok az adományok kerülhetnek ide, AMIKRE NEM ADTUNK LE PÁLYÁZATOT. (Pl. helyi közbirtokosság, külföldi testvérgyülekezet alapítványa.)' },
          { code: '103.02', name: 'Pályázatokból', desc: 'Minden EU-s, állami, megyei, helyi önkormányzati vagy nem állami intézménytől elnyert pályázat összege, amire pályázati kérést adtunk be, és elszámolással tartozunk a pályáztató felé.' },
          { code: '103.03', name: 'Más bevételek', desc: 'A számadásban 31 bevételi tétel van. Ha a bevételt egyikbe sem sorolhatjuk, akkor ide kerül.' },
          { code: '103.04', name: 'Banki kamatok, árfolyam nyereségek, kötvények jövedelme, osztalékok', desc: 'Egyszerű banki kamatok, árfolyam nyereségek (valuta átváltáskor), kötvények és részvények jövedelme, ha az egyházközség rendelkezik ilyennel.' },
          { code: '103.05', name: 'Hozzájárulás konferenciák és szeretetvendégségek szervezéséhez', desc: 'A gyerek, ifjúsági, nőszövetségi, presbiterszövetségi rendezvényeken KÍVÜL szervezett konferenciákhoz, szeretetvendégségekhez, más rendezvényekhez befizetett hozzájárulás.' },
          { code: '103.06', name: 'Iratterjesztés — bevétel', desc: 'Az egyházközség által terjesztett sajtó, naptár, Biblia, Énekeskönyv, más könyvek és kiadványok ára.' },
          { code: '103.07', name: 'Javak és részvények értékesítéséből', desc: 'Az egyházközség tulajdonában lévő javak eladásából származó bevételek (pl. lecserélt cserép eladása). NEM ide kerülnek az erdőgazdálkodásból és a mezőgazdasági tevékenységből származó bevételek.' },
          { code: '103.08', name: 'Számlavisszatérítések', desc: 'Az egyházközség által kifizetett közköltségi vagy más számlák visszatérítése. Közköltség esetében a bérlők vagy a szolgálati lakásban lakó alkalmazottak számlavisszatérítése is ide kerül.' },
          { code: '103.09', name: 'Szponzortámogatások, adók 3,5%-a', desc: 'Szponzortámogatási szerződés alapján kapott összegek, valamint a magánszemélyek által felajánlott, az adóhatóság által átutalt jövedelmi adó százaléka.' },
        ]}
      />

      <SectionTitle>104 — Gazdasági tevékenységből származó bevételek</SectionTitle>
      <CalloutWarning>
        Gazdasági tevékenységek esetében <strong>csak jogi személyektől</strong> vehetünk
        el pénzt nyugtával és számlával. Magánszemélyek banki átutalással fizethetnek;
        készpénzes fizetés esetében szükséges kasszagépet beszerezni.
      </CalloutWarning>
      <CodeTable
        rows={[
          { code: '104.01', name: 'Mezőgazdasági jövedelem', desc: 'Ha az egyházközség nem adja bérbe a mezőgazdasági területét, hanem megműveli, a bevételt (eladott termények ára) ide könyveljük. Ha bérbe van adva, a bevétel a "Területek bérjövedelme" tételhez kerül. Mezőgazdasági jövedelem esetében mezőgazdasági kiadás is kell legyen.' },
          { code: '104.02', name: 'Erdőgazdálkodási jövedelem', desc: 'Minden erdőgazdálkodási tevékenységből származó bevétel (kitermelhető fa eladása, vadásztársaság által fizetett összeg stb.).' },
          { code: '104.03', name: 'Más gazdasági bevételek', desc: 'Ha az egyházközség valamilyen gazdasági tevékenységet folytat: pl. pékséget, varrodát működtet, hivatalos vendéglátási tevékenységet folytat.' },
          { code: '104.04', name: 'Épületek bérjövedelme', desc: 'Bérleti szerződéssel kiadott épület bérjövedelme. Ennek a bérjövedelemnek a 10%-át BE KELL FIZETNI az Egyházkerületnek (az egyházmegyén keresztül). A bérjövedelmek után nem kell fizetni profit adót az ANAF-nak, ha egyházi célra használjuk fel, csak a bérbeadott épület utáni helyi adót.' },
          { code: '104.05', name: 'Területek bérjövedelme', desc: 'Bérleti szerződéssel kiadott mezőgazdasági és nem mezőgazdasági területek bérjövedelme. A 10%-ot NEM KELL befizetni az Egyházkerületnek. Profit adót nem kell fizetni az ANAF-nak, ha egyházi célra használjuk fel; csak a területek utáni helyi adót.' },
        ]}
      />

      <SectionTitle>105 — Szubvenciók (támogatások)</SectionTitle>
      <CodeTable
        rows={[
          { code: '105.01', name: 'Más egyházi intézményektől kapott támogatás', desc: 'Egyházi intézménytől kapott támogatás: kisgyülekezeti támogatások, missziós egyházközségek támogatása, közalapi segély.' },
          { code: '105.02', name: 'Állami intézménytől kapott támogatás', desc: 'Pl. APIA. Olyan állami támogatás, amit NEM pályázati rendszerben kaptunk, és nem tartozunk pályázati elszámolással.' },
          { code: '105.03', name: 'Kongrua és járulékai', desc: 'Egyházmegyei bevétel — az egyházközségek NEM könyvelhetnek ehhez a tételhez (kivéve azon egyházközségeket, ahol helyi szinten számolnak és fizetnek ki fizetéseket).' },
        ]}
      />

      <SectionTitle>Kezdő egyenlegek</SectionTitle>
      <p>
        Az év elején a <strong>kezdő egyenleg</strong> kötelezően meg kell egyezzen az
        előző év záróegyenlegével — banira. Ha nem talál, a felsőbb egyházi hatóság a
        számadást visszaküldi.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Készpénz egyenleg (Casa):</strong> az előző évi december 31-i egyenleg.</li>
        <li><strong>Banki egyenleg (Banca):</strong> minden bankszámla előző év záró egyenlege.</li>
      </ul>
      <CalloutWarning>
        <strong>2023 novembere óta érvényben van az 50 000 lejes kasszaplafon.</strong> Ha
        a készpénzegyenleg átlépi ezt az összeget, 2 munkanapon belül le kell tenni a
        készpénzt a bankba.
      </CalloutWarning>
    </>
  )
}

function ExpensesContent() {
  return (
    <>
      <p>
        Az alábbiakban az <strong>EREK hivatalos kiadási kódlistája</strong> található.
        Minden kiadás pontosan abban a kategóriában kell rögzítve legyen, ahova tartozik.
      </p>

      <SectionTitle>201 — Működési költségek</SectionTitle>
      <CodeTable
        rows={[
          { code: '201.01', name: 'Fizetés alap', desc: 'Az esperesi hivatalok készítik el a fizetési jegyzékeket (statokat), fizetik ki az adókat. Az egyházközségek egy összegben fizetik be az esperesi hivatalnak az alkalmazottak utáni helyi alapot.' },
          { code: '201.02', name: 'Közköltségek', desc: 'Fűtés, világítás, víz, csatornázás, szemét — minden közköltség: gáz-, villanyszámla, tűzifa ára (ha fával fűtenek).' },
          { code: '201.03', name: 'Házbérek', desc: 'Ha az egyházközség bérleti szerződéssel bérel szolgálati lakást vagy más helyiséget.' },
          { code: '201.04', name: 'Épületadó, földadó, biztosítás', desc: 'Az épületeink és területeink adókötelesek a helyi adóhivatalnak, ha bérbe vannak adva. Az épületek biztosítása is ide. CSAK az épületek és területek adója és biztosítása — a gépkocsiké a 201.05-höz!' },
          { code: '201.05', name: 'Szállítóeszközök üzemeltetési költségei', desc: 'Az egyházközség saját, ingyenes használati szerződés (contract de comodat) vagy bérleti szerződés alapján használt járművei: szervizköltség, fogyóanyagok, útadó, biztosítás. Ha nincs saját jármű, csak a fenti szerződések alapján lehet kifizetni üzemeltetési költséget.' },
          { code: '201.06', name: 'Napidíj, utazási költségek', desc: 'Utazásra használt üzemanyag, vagy tömegközlekedés (vonatjegy, buszjegy).' },
          { code: '201.07', name: 'Posta, telefon, internet', desc: 'Távközlési számlák (telefon, internet), posta és futárszolgálat költsége.' },
          { code: '201.08', name: 'Irodaszerek, nyomtatványok', desc: 'Formanyomtatványok, anyakönyvi és iktatólapok, papír, toner, irodai fogyóanyagok.' },
          { code: '201.09', name: 'Fogyóanyagok, más anyagok', desc: 'Tisztítószerek, gépek üzemeltetéséhez szükséges anyagok (fűnyíróba, láncfűrészbe benzin, olaj, fűnyíró damil, porszívózsák), villanyégők — minden anyag, ami a használat során elfogy.' },
          { code: '201.10', name: 'Szolgáltatások költségei', desc: 'Kéményseprés, tűzoltósági kiadások (palack ellenőrzése, villámhárító kimérése), munkaügyi kiadások (felkészítő, munkaorvos), szerződéses takarítás, fűnyírás, cserjék/fák metszése. NEM ide kerülnek: javítási vagy építkezési tervezési munkálatok, építkezések számlái (még ha "Prestari servicii" is van a számlán), catering konferenciára, erdészeti bélyegzés/őrzés számlái.' },
          { code: '201.11', name: 'Protokoll', desc: 'Egyházközségi protokollra: kávé, ásványvíz, virágok, koszorúk. A szeretetvendégségek, konferenciák, nőszövetségi/presbiterszövetségi rendezvények kiadásai NEM ide tartoznak.' },
          { code: '201.12', name: 'Kis értékű leltári tárgyak beszerzése', desc: 'Minden 2500 lejnél kisebb értékű tárgy. Ezt a kormányhatározat állapítja meg (2013. július 1. óta érvényes a 2500 lej értékhatár). A 2500 lej feletti eszközök alapeszköznek számítanak és a beruházásokhoz (205.01) kerülnek. Az épületekbe beépített eszközök (ajtó, ablak, villanykapcsoló) NEM számítanak leltári tárgynak.' },
          { code: '201.13', name: 'Karbantartási kiadások', desc: 'Minden olyan javítás, ami NEM építési engedély-köteles. Az engedélyköteles javítások az "Általános javítások" (205.02) tételhez. Szintén oda kerülnek azok a javítások, ahol a támogató kéri, hogy a javítás értékével növeljük meg az épület értékét.' },
          { code: '201.14', name: 'Más javadalmak', desc: 'Szerzői jogdíjak és más, magánszemélyekkel kötött szerződés alapján kiadott fizetés és annak adója. Javasolt ezeket az egyházmegye ügyvitelén keresztül intézni. Étkezési jegyek csak akkor, ha az egyházközség saját maga számol fizetési jegyzéket.' },
          { code: '201.15', name: 'Nettó fizetések', desc: 'Esperesi hivatalok részére fenntartva, egyházközség csak akkor könyvelhet ide, ha helyben számolnak fizetési jegyzéket.' },
          { code: '201.16', name: 'Javadalmak utáni adó', desc: 'Esperesi hivatalok részére fenntartva, egyházközség csak akkor könyvelhet ide, ha helyben számolnak fizetési jegyzéket.' },
          { code: '201.17', name: 'Társadalombiztosítás', desc: 'Esperesi hivatalok részére fenntartva, egyházközség csak akkor könyvelhet ide, ha helyben számolnak fizetési jegyzéket.' },
          { code: '201.18', name: 'Egészségügyi biztosítás (C.A.S.S.)', desc: 'Esperesi hivatalok részére fenntartva, egyházközség csak akkor könyvelhet ide, ha helyben számolnak fizetési jegyzéket.' },
          { code: '201.19', name: 'Munkabiztosítási hozzájárulás — 2,25%', desc: 'Esperesi hivatalok részére fenntartva, egyházközség csak akkor könyvelhet ide, ha helyben számolnak fizetési jegyzéket.' },
        ]}
      />

      <SectionTitle>202 — Missziós és diakóniai célú kiadások</SectionTitle>
      <CodeTable
        rows={[
          { code: '202.01', name: 'Gyerek és ifjúsági tevékenységek kiadásai', desc: 'Minden fogyóanyag a gyerek- és ifjúsági tevékenységre (vallásórákon írószerek, papír, füzet, élelmiszerek). Gyerek- és ifjúsági táborok költségei, táborokra kifizetett támogatások. Rendezvényekre való utaztatás. IDE könyveljük a gyerekek karácsonyi csomagjára költött összeget is.' },
          { code: '202.02', name: 'Nőszövetségi tevékenységek kiadásai', desc: 'A nőszövetségi foglalkozások fogyóanyaga, rendezvények költségei, utazások, valamint minden kiadás, ami a nőszövetséggel kapcsolatos. Egyházmegyei/egyházkerületi tagdíjak is ide.' },
          { code: '202.03', name: 'Presbiterszövetségi tevékenységek kiadásai', desc: 'A presbiterszövetségi foglalkozások fogyóanyaga, rendezvények költségei, utazásai, egyházmegyei/egyházkerületi tagdíjak.' },
          { code: '202.04', name: 'Egyházközségek vagy más egyházi intézmények támogatása', desc: 'Pl. ha egy másik gyülekezet templomépítését szeretnénk támogatni, vagy ha egy nagy gyülekezet adománnyal támogat egy kisebbet. Egyházi intézményeink támogatására kiadott összeg is.' },
          { code: '202.05', name: 'Kiadások diakóniai célokra', desc: 'A gyülekezeti diakónia kiadásai. IDE könyveljük az idősek karácsonyi csomagjának vagy más alkalommal készített élelmiszer-csomagok költségeit is.' },
          { code: '202.06', name: 'Missziós célú kiadások', desc: 'A gyülekezeti misszióra költött összeg.' },
          { code: '202.07', name: 'Teológiai hallgatók tanulmányi segélye — legátumok', desc: 'A legátusnak kifizetett tanulmányi támogatás, legátum.' },
          { code: '202.08', name: 'Egyháztagok segélyezése', desc: 'Segélyt adhatunk, ha valaki: (a) mélyszegénységben él, (b) betegsége miatt kezelésre szorul, (c) természeti csapás (árvíz, tűzkárosult) áldozata. Szükséges: 1. kérés, 2. a kérést megindokló dokumentáció, 3. presbiteri határozat. Nagyobb összegű segély esetén javasolt közjegyzői okirat készítése.' },
        ]}
      />

      <SectionTitle>203 — Más egyházi tevékenységek kiadásai</SectionTitle>
      <CodeTable
        rows={[
          { code: '203.01', name: 'Szociális-kulturális tevékenységek támogatása', desc: 'Ha szociális vagy kulturális tevékenységet támogatunk.' },
          { code: '203.02', name: 'Más kiadások', desc: 'A számadásban 38 kiadási tétel van. Ha a kiadás egyikbe sem sorolható, akkor ide.' },
          { code: '203.03', name: 'Kezelési költségek, árfolyam-veszteségek', desc: 'Bankszámla-fenntartási költségek, banki kezelési költségek, valutában történő műveletek árfolyam-veszteségei, kötvény/részvény eladási veszteségek.' },
          { code: '203.04', name: 'Konferenciák és szeretetvendégségek költségei', desc: 'Gyerek-/ifjúsági, nőszövetségi és presbiterszövetségi rendezvényeken KÍVÜL szervezett konferenciák vagy rendezvények költségei. IDE könyveljük a szeretetvendégségek költségeit is, NEM a protokoll tételhez.' },
          { code: '203.05', name: 'Iratterjesztés — kiadás', desc: 'Az egyházközségi iratterjesztés részére megvásárolt kiadványok ára (Biblia, Énekeskönyv, Üzenet, Református Család, Naptár, Kalendárium, Bibliaolvasó kalauz).' },
          { code: '203.06', name: 'Központi járulékok', desc: 'A felsőbb egyházi intézmény, az egyházmegye részére befizetett központi járulék.' },
          { code: '203.07', name: 'Bérjövedelmek 10%-a központi járulékba', desc: 'Az épületek bérjövedelme után befizetett 10%. CSAK az épületek bérjövedelme után kell fizetni a 10%-ot, a területek után NEM.' },
        ]}
      />

      <SectionTitle>204 — Gazdasági tevékenységek költségei</SectionTitle>
      <CodeTable
        rows={[
          { code: '204.01', name: 'Mezőgazdasági kiadások', desc: 'Ha az egyházközség nem adja bérbe a mezőgazdasági területét, hanem megműveli, a mezőgazdasággal kapcsolatos kiadásokat ide. Ha van mezőgazdasági kiadás, bevételnek is kell lennie.' },
          { code: '204.02', name: 'Erdőgazdálkodási kiadások', desc: 'Minden erdőgazdálkodási kiadás (erdőőrzés, kitermelhető fa bélyegzése, kitermelése, üzemterveztetés) — akkor is, ha a számlán "Szolgáltatás" szerepel.' },
          { code: '204.03', name: 'Más gazdasági kiadások', desc: 'Ha az egyházközség valamilyen gazdasági tevékenységet folytat (pékség, varroda, vendéglátás). Csak ezek költségei kerülhetnek ide.' },
          { code: '204.04', name: 'Bérbeadott épületek javítása és karbantartása', desc: 'Bérleti szerződéssel kiadott épületek javítási költségei.' },
        ]}
      />

      <SectionTitle>205 — Beruházások</SectionTitle>
      <CodeTable
        rows={[
          { code: '205.01', name: 'Új beruházások', desc: 'Alapeszköznek számít minden épület. Ha épületet vásárolunk vagy építünk, ide. Területvásárlás is beruházás. Beruházásnak számít minden 2500 lejnél drágább eszköz megvásárlása (kormányhatározat, 2013. július 1-től). Ha egy eszközt alkatrészenként számláznak ki és az alkatrészek egyike sem éri el a 2500 lejt, akkor azok külön leltári tárgyaknak számítanak (201.12). Az 1 évnél tovább használt bútor — függetlenül az értéktől — lehet alapeszköz. Több darabból álló készlet is.' },
          { code: '205.02', name: 'Általános javítások', desc: 'Minden engedélyköteles felújítás. Ha a támogató (pl. BGA) kéri, hogy az épület értékét növeljük a javítás költségével, akkor az ilyen javításokat is ide. Az általános javítás értékével — a befejezés és átadás után — meg kell növelni a leltárban az épület értékét.' },
        ]}
      />
    </>
  )
}

function TransitCreditContent() {
  return (
    <>
      <SectionTitle>Átmeneti tételek (106 / 206)</SectionTitle>
      <CalloutWarning>
        <strong>Átmeneti tételnél a bevétel és a kiadás összege azonos kell legyen.</strong> Ha
        nem azonos, akkor a különbségnek szerepelnie kell az előző évi tartozásoknál (ha
        többet fizettünk ki), vagy az év végi tartozáshoz fel kell vezetni (ha kevesebbet
        fizettünk ki).
      </CalloutWarning>

      <SubTitle>Bevételi oldal (106.xx)</SubTitle>
      <CodeTable
        rows={[
          { code: '106.01', name: 'Bevételek más egyházi intézmények részére', desc: 'Más egyházközségnek vagy egyházi intézménynek bevételezett összegek. Pl. ha külföldről eurót utalnak és továbbadjuk a címzettnek; vagy ha valaki egy gyűjtésre szán pénzt, akkor nyugtával elvesszük és átutaljuk a címzettnek.' },
          { code: '106.02', name: 'Biztosítások — bevétel', desc: 'Egyházmegyei bevétel, az egyházközségek NEM könyvelhetnek ide.' },
          { code: '106.03', name: 'Missziói segélyek', desc: 'Egyházmegyei bevétel, az egyházközségek NEM könyvelhetnek ide.' },
          { code: '106.04', name: 'Bérjövedelmek 10%-a', desc: 'Egyházmegyei bevétel, az egyházközségek NEM könyvelhetnek ide.' },
          { code: '106.05', name: 'Bevételek egyházközségek részére', desc: 'Egyházmegyei bevétel, az egyházközségek NEM könyvelhetnek ide.' },
          { code: '106.06', name: 'Bevételek a felsőbb egyházi intézmények részére', desc: 'Egyházmegyei bevétel, az egyházközségek NEM könyvelhetnek ide.' },
        ]}
      />

      <SubTitle>Kiadási oldal (206.xx)</SubTitle>
      <CodeTable
        rows={[
          { code: '206.01', name: 'Kiadás más egyházi intézmény részére', desc: 'Csak akkor könyvelhetünk ide, ha volt 106.01-en bevételünk. Csak annyit fizethetünk ki, amennyi bevétel volt. Ha nem fizetjük ki a bevett összeget a beérkezés évében, az év végén a ki nem fizetett összeget fel kell tüntetni a tartozásoknál.' },
          { code: '206.02', name: 'Biztosítások — kiadás', desc: 'Egyházmegyei kiadás, az egyházközségek NEM könyvelhetnek ide.' },
          { code: '206.03', name: 'Kifizetett missziói segélyek', desc: 'Egyházmegyei kiadás, az egyházközségek NEM könyvelhetnek ide.' },
          { code: '206.04', name: 'Kifizetett bérjövedelmek 10%-a', desc: 'Egyházmegyei kiadás, az egyházközségek NEM könyvelhetnek ide.' },
          { code: '206.05', name: 'Kiadások egyházközségek részére', desc: 'Egyházmegyei kiadás, az egyházközségek NEM könyvelhetnek ide.' },
          { code: '206.06', name: 'Kiadások a felsőbb egyházi intézmények részére', desc: 'Egyházmegyei kiadás, az egyházközségek NEM könyvelhetnek ide.' },
        ]}
      />

      <SectionTitle>Hitelek (107 / 207)</SectionTitle>
      <CalloutWarning>
        <strong>A hiteleknél a bevétel és a kiadás összege az adott évben azonos kell
        legyen.</strong> Ha nem azonos, a különbségnek szerepelnie kell az előző évi
        tartozásoknál (ha többet fizettünk ki) vagy az év végi tartozáshoz fel kell vezetni
        (ha kevesebbet fizettünk vissza).
      </CalloutWarning>
      <CodeTable
        rows={[
          { code: '107.01', name: 'Kapott hitelek', desc: 'Ha az egyházközséget szükséges meghitelezni. FIGYELEM: 2023. novembere óta CSAK BANKI UTALÁSSAL lehet a hitelt be- és visszafizetni! A törvény tiltja a kassza direkt hitelezését. Mindig ellenőrizzük, hogy van-e elegendő készpénz a kasszában — ne kerüljön mínuszba.' },
          { code: '107.02', name: 'Visszakapott hitelek', desc: 'Ha az egyházközség hitelt adott ki, itt vesszük vissza az összeget. Vagy ha elszámolásra előleget ad ki, elszámoláskor itt vesszük vissza és a kiadásokat a megfelelő helyre könyveljük.' },
          { code: '207.01', name: 'Törlesztett hitelek', desc: 'Ha az egyházközséget meg kellett hitelezni, itt fizetjük vissza. FIGYELEM: csak banki utalással. Az év végéig vissza nem fizetett összeget fel kell tüntetni a tartozásoknál.' },
          { code: '207.02', name: 'Kiadott hitelek', desc: 'AZ EGYHÁZKÖZSÉG NEM ADHAT HITELT MAGÁNSZEMÉLYEKNEK. Hitelt adhatunk MÁS EGYHÁZKÖZSÉGNEK, de csak presbiteri határozattal. Elszámolásra előlegként kifizetett összeget ide könyvelünk. Az előlegként kiadható összeg: 5000 lej/személy/nap.' },
        ]}
      />
    </>
  )
}

function BalanceContent() {
  return (
    <>
      <SectionTitle>Bevétel-többlet vagy kiadási többlet</SectionTitle>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          <strong>Excedent (Bevételi többlet):</strong> ha a saját bevétel nagyobb, mint a
          kiadás. A számadás automatikusan számolja.
        </li>
        <li>
          <strong>Deficit (Kiadási többlet):</strong> ha a kiadás nagyobb, mint a bevétel.
          A számadás automatikusan számolja.
        </li>
      </ul>

      <SectionTitle>Pénztári és banki egyenleg az év végén</SectionTitle>
      <p>
        Az év végi készpénz + banki összeg. Ez a sor mindig <strong>pozitív szám</strong>{' '}
        kell legyen, mert nem fizethetünk ki több pénzt, mint amennyi rendelkezésre áll.
      </p>

      <SectionTitle>Tartozások</SectionTitle>
      <CalloutWarning>
        <strong>Az év végi számadás fontos része a tartozások és kintlevőségek követése,
        felleltározása.</strong> Ha ezeket bevezettük, akkor látszik az egyházközség valós
        anyagi helyzete. A számadást jóváhagyó presbiteri határozatban is fel kell tüntetni
        ezeket. A jegyzőkönyvbe nem vett tartozásokat NEM lehet kifizetni a következő évben.
        Ha nincs tartozás, akkor jegyzőkönyvezni kell azt is, hogy nincs tartozás.
      </CalloutWarning>
      <SubTitle>Tartozás-fajták</SubTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Központi járulék</strong> — a ki nem fizetett központi járulék.</li>
        <li><strong>Bérjövedelmek 10%-a központi járulékba</strong> — a ki nem fizetett rész.</li>
        <li><strong>Fizetés alap</strong> — a ki nem fizetett fizetésalap.</li>
        <li><strong>Közköltségek</strong> — a ki nem fizetett közköltség-számlák.</li>
        <li><strong>Kapott hitelek</strong> — vissza nem fizetett hitel összege. Csak akkor lehet a következő évben visszafizetni, ha itt szerepel.</li>
        <li>
          <strong>Más tartozások</strong> — minden más (erdőőrzés, építési, javítási munkálatok
          ki nem fizetett számlái). Külön lapon fel kell sorolni az ilyen tartozásokat, és a
          jóváhagyó presbiteri határozatban is fel kell tüntetni.
        </li>
      </ul>

      <SectionTitle>Kintlevőségek</SectionTitle>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          <strong>Bérjövedelmek</strong> — a be nem érkezett bérjövedelmek összege.
        </li>
        <li>
          <strong>Kiadott hitelek</strong> — a vissza nem kapott hitelek összege (a 207.02 és
          a 107.02 közti különbség).
        </li>
        <li>
          <strong>Más kintlevőségek</strong> — minden, amire már számlát állítottunk ki, vagy
          támogatói/pályázati szerződést írtunk alá (pl. fa eladása, elszámolt utófinanszírozott
          pályázat). NEM számít kintlevőségnek a kintlevő egyházfenntartói járulék (nem
          tervezhető és nem behajtható), sem a csak megígért adományok, perselypénz.
        </li>
      </ul>

      <SectionTitle>Záróegyenleg (Sold)</SectionTitle>
      <p>
        Az egyházközség <strong>valós anyagi helyzetét mutató sor</strong>. A pénztári
        egyenleghez hozzáadja a kintlevőségeket és kivonja a tartozásokat. Ha ez negatív
        szám, az egyházközség adóssággal zárja az évet.
      </p>
    </>
  )
}

function AuditContent() {
  return (
    <>
      <p>
        Az egyházi pénzügyi vizsgálat alkalmával a következő iratokat kell bemutatni a{' '}
        <strong>számvevőnek</strong> vagy az <strong>egyházkerületi könyvvizsgálónak</strong>.
        A lista hivatalos forrása az EREK ellenőrzési útmutató (Ungvári Éva).
      </p>

      <SectionTitle>Pénzügyvitel</SectionTitle>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Az előző pénzügyi ellenőrzés jegyzőkönyve; a meghagyások teljesítéséről szóló jelentés.</li>
        <li>
          <strong>Költségvetés</strong> — a hozzá tartozó presbiteri határozattal (presbiteri jegyzőkönyv),
          az esperesi hivatal iktatószámával, az esperes és a számvevő aláírásával.
        </li>
        <li>
          <strong>Költségvetés-kiegészítés</strong>, ha szükség volt rá az év folyamán — a hozzá tartozó
          presbiteri határozattal, esperesi iktatószámmal, aláírásokkal.
        </li>
        <li>
          <strong>Számadás</strong> — a hozzá tartozó presbiteri határozattal, esperesi iktatószámmal, az
          esperes és a számvevő aláírásával. A közgyűlési jegyzőkönyvben is rögzíteni kell az elfogadott
          számadás adatait. <strong>Egy elfogadott és leadott számadást utólag csak az Esperesi vagy
          Püspöki vizitáció ellenőrzése alkalmával lehet kiigazítani.</strong>
        </li>
        <li>A gazdasági bizottság félévenkénti pénzügyi ellenőrzésének jegyzőkönyvei.</li>
        <li>
          <strong>Kasszakönyv</strong> havonként nyomtatva, a kiadási kísérőíveket, esetenként a bevételi
          iratokat lefűzve. Segélyezések esetében a presbiteri határozatokat is be kell mutatni.
        </li>
        <li>
          <strong>Nyugtatömbök (Chitanță)</strong> — az EREK-ben csak az EREK iratterjesztőjéből vásárolt
          sorszámozott nyugta használható. Más nyugták használatához az Igazgatótanács jóváhagyása kell.
        </li>
        <li>Nyugtatömbök anyagraktárkönyve.</li>
        <li><strong>Számlatömbök (Factura)</strong> — ha az egyházközség használ számlatömböt.</li>
        <li>Számlatömbök anyagraktárkönyve.</li>
        <li><strong>Banki iratgyűjtő(k)</strong> — bankszámlánként külön iratgyűjtőbe rendezve.</li>
        <li>
          <strong>Banknapló(k)</strong> (Registru de bancă) — bankszámlánként külön-külön vezetve.
          Banknaplót januártól decemberig egy évben egyszer nyomtatunk, és lefűzzük a számlakivonatokkal
          a banki iratgyűjtőbe.
        </li>
        <li><strong>Naplóregiszter</strong> (Registru jurnal) — kinyomtatva és lefűzve.</li>
        <li>Csoportnaplók kinyomtatva.</li>
        <li>
          <strong>Benzinköltség elszámolása</strong> esetén, ha a gépkocsi nem az egyházközség tulajdona,
          szükséges az <em>ingyen használati szerződés</em> (contract de comodat) a gépkocsira, vagy a
          <em> kiszállási lap</em> (ordin de deplasare).
        </li>
        <li>
          <strong>Számadások összesítője</strong> — ahol van szorvány vagy leányegyházközség; ha a
          nőszövetség és presbiteri szövetség külön vezeti a könyvelést.
        </li>
        <li>Pályázatok elszámolása.</li>
        <li>Hitelek követése.</li>
        <li>Egyházi egyesületek, alapítványok éves beszámolója.</li>
      </ul>

      <SectionTitle>Leltár</SectionTitle>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>A hagyományos <strong>leltárkönyv</strong>.</li>
        <li>Az évenkénti leltározások alkalmával készített <strong>leltárív</strong> (Lista de inventariere).</li>
        <li>
          Az évenkénti leltározások alkalmával készített <strong>jegyzőkönyv</strong>, amiben fel
          vannak tüntetve a leírásra javasolt leltári tárgyak — a hozzá tartozó presbiteri határozattal.
        </li>
        <li>Évenkénti vagyon-leltárjelentés.</li>
        <li>Leltárregiszter (Registru de inventar).</li>
        <li>Az alapeszközök nyilvántartási lapja (Fisa mijlocului fix).</li>
        <li><strong>Telekkönyvi kivonatok</strong> — megnézni, szerepelnek-e az épületek a telekkönyvben.</li>
        <li>
          Az épületekről, telkekről, erdőről a helyi adóhivatalhoz letett nyilatkozatok másolata,
          bejelölve melyik épület <em>kultikus</em>, melyik <em>lakó</em> vagy melyikben folyik
          gazdasági tevékenység, melyik vegyes használatú (Rezident/Nerezident/Mixt). A területeknél:
          melyik van bérbe adva, melyik temető, kultikus épület telke, udvara vagy gazdasági
          tevékenységre használjuk.
        </li>
        <li>
          A műemlék épületekre, a 10/2001, 94/2000, 83/1999 törvények által visszaszolgáltatott
          épületekre lehet kérni adókedvezményt a helyi polgármesteri hivataloktól, ha közhasznú
          felhasználásúak. A parókia, templom, imaházak és melléképületei kultikus épületek
          (COD FISCAL Lg 227/08.sept. 2015 art. 456.d).
        </li>
        <li>
          <strong>A bérbe adott ingatlanok bérleti szerződése</strong>, beiktatva az Esperesi
          Hivatalban. Épületek bérjövedelme után a 10% befizetését igazoló okmányok.
        </li>
        <li>Az épületekről, telkekről a helyi adóhivatalhoz letett nyilatkozatok másolata.</li>
        <li>A bérbe adott ingatlanok bérleti szerződése.</li>
        <li>
          <strong>Év végi követelésekre</strong> (be nem érkezett épület-, föld-, terem-bérek) az
          ügyfelektől visszakapott, aláírt elismerési bizonylatok (Extras de cont confirmat).
        </li>
        <li>Pecsétnyomók nyilvántartása.</li>
        <li>Levéltározás.</li>
      </ul>

      <SectionTitle>Egyházi alkalmazottakra vonatkozó iratok</SectionTitle>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Díjlevelek, munkaszerződések, fizetésekre vonatkozó presbiteri határozatok.</li>
        <li>Lakásszerződések és az ezekhez kapcsolódó presbiteri határozatok.</li>
        <li>
          Más javakra (telefon, villanyköltség, gépkocsi, kert, stb.) vonatkozó szerződések és az
          ezekhez kapcsolódó presbiteri határozatok.
        </li>
        <li>Munkaköri leírások.</li>
        <li>Jelenléti naplók.</li>
        <li>
          <strong>Szabadságok betervezése</strong> — ki nem vett szabadságot a következő év március
          31-ig lehet kérni.
        </li>
        <li>Fizetésjegyzékek másolata.</li>
        <li>Személyi iratgyűjtő.</li>
      </ul>

      <SectionTitle>Segélyszállítmányok nyilvántartása</SectionTitle>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Adománylevél iktatva.</li>
        <li>Presbiteri határozat a kiosztásáról.</li>
        <li>Raktárbavételi jegyzék (Nota de intrare-recepție).</li>
        <li>Fogyasztási jegyzék (Bon consum).</li>
        <li>
          Adománylevél a kiosztott segélyekről, amely tartalmazza a személyazonossági adatokat és a
          kiosztott mennyiségeket.
        </li>
        <li>Anyagraktárkönyvi nyilvántartás vagy leltári szám, ha az egyházközségnek marad.</li>
      </ul>
    </>
  )
}

function Changes2026Content() {
  return (
    <>
      <SectionTitle>Új könyvelési segédlet</SectionTitle>
      <p>
        2026-tól csak <strong>két változatban</strong> készül a könyvelés segédlet:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>„A" — nagy gyülekezetek</strong> részére</li>
        <li><strong>„B" — kis gyülekezetek</strong> részére</li>
      </ul>
      <p className="mt-3">
        Megszűnik a könyvelés <strong>„C" és „D" változata</strong>, ezek nem lesznek
        elérhetőek. Az „A" és „B" változat tartalmaz mindent, ami korábban csak a „C" és
        „D" tartalmazott.
      </p>
      <CalloutWarning>
        A költségvetési tételek <strong>az egyházmegye neve beírása után</strong> lesznek
        elérhetőek a lenyílókban. Javasolt először a Költségvetés munkalapon az egyházmegye
        nevét kitölteni — különben nem fogjuk tudni használni a segédletet.
      </CalloutWarning>
      <p>Készült egy útmutató a számadáshoz, részletezve a költségvetési tételeket — a mappában megtalálható (és ezen a Súgó oldalon teljes egészében elérhető).</p>

      <SectionTitle>Új lelkészi jelentés</SectionTitle>
      <p>
        Az Igazgatótanács a 2025. október 8-án tartott ülésén{' '}
        <strong>65/2025. szám alatt elfogadta az új lelkészi jelentést</strong>. Az új űrlap
        két változatban érhető el:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Egyszerű űrlapként</strong></li>
        <li><strong>Egybeépítve a digitális munkanaplóval</strong></li>
      </ul>
      <p className="mt-3">
        Mindkét változat megtalálható a nyomtatványok mappában.{' '}
        <strong>Az új lelkészi jelentés 2026-tól kötelező.</strong>
      </p>

      <SectionTitle>Mit kell kinyomtatni?</SectionTitle>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          A <strong>naponkénti kasszakönyvi lapot NEM kell kinyomtatni</strong>, csak a
          havonkéntit a kimutatások munkafüzetből.
        </li>
        <li>
          Ki kell nyomtatni a <strong>kiadási kísérőívet</strong> a készpénzes ÉS a banki
          kifizetések mellé is.
        </li>
        <li>
          Hónap végén ki kell nyomtatni egy példányban a <strong>havi kasszakönyvet</strong>,
          és azzal zárjuk le a hónapot.
        </li>
        <li>
          A banki iratgyűjtőbe a <strong>havi banki kivonatot (extras)</strong> kell
          kinyomtatni a záráshoz. A napi extras-t NEM kell kinyomtatni.
        </li>
        <li>
          A <strong>banknaplót</strong> a kimutatások munkafüzetből CSAK év végén kell
          nyomtatni, éves változatban, a lenyílóból a <Code>Jan_Dec</Code> opciót választva.
        </li>
        <li>
          Szintén csak az év lezárása után kell kinyomtatni a <strong>csoportnaplót</strong>.
        </li>
        <li>
          <strong>Kötelező kinyomtatni a Főkönyvet</strong> (Registru Jurnal), lehetőleg
          kétoldalasan, a lap elejére-hátára. A kinyomtatott oldalakat lefűzzük; 5 évenként,
          vagy 200 lap terjedelmet követően kemény laptáblába beköttetjük.
        </li>
      </ul>

      <SectionTitle>Egyházközségi ügykörjegyzék</SectionTitle>
      <p>
        Az iratok rendezésénél vegyük figyelembe a <strong>2024. január 1-től érvényes
        egyházközségi ügykörjegyzéket</strong>. Az útmutató megtalálható a nyomtatványok
        mappában, valamint a{' '}
        <span className="font-mono text-xs">reformatus.ro/dokumentumok/torvenyek</span> címen,
        a kántorvizsga anyagánál.
      </p>

      <SectionTitle>Forrás és elérhetőség</SectionTitle>
      <p className="text-slate-600">
        Készítette: <strong>Beke Tivadar</strong> (Zabola, 2025. november 28).<br />
        Elérhetőség:
        <span className="font-mono text-xs"> beketivadar@gmail.com</span> ·
        <span className="font-mono text-xs"> beke_tivadar@yahoo.com</span> · tel: 0721 00 20 25.
      </p>
    </>
  )
}

function CashRulesContent() {
  return (
    <>
      <p>
        A 2026-ra érvényes <strong>készpénzhasználati szabályok</strong> (2025 végén). Ezek
        a szabályok bármikor módosulhatnak — érdemes követni a változásokat.
      </p>

      <SectionTitle>Általános kasszaszabályok</SectionTitle>
      <CalloutWarning>
        A pénztárban lévő készpénz összege <strong>nem haladhatja meg az 50 000 (ötvenezer)
        lejt</strong>. Amennyiben ezt az összeget meghaladja a kasszában lévő készpénz, a
        többletet be kell helyezni a bankba <strong>3 napon belül</strong>.
      </CalloutWarning>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          <strong>Tilos az egyházközség számára készpénzben kölcsönt adni</strong> — csak
          bankszámlán lehetséges a kölcsönzés és a kölcsön visszafizetése is.
        </li>
        <li>
          <strong>Nem adhatunk ki előlegként elszámolásra (decont) 1 000 lejnél többet</strong>{' '}
          készpénzben vásárlási célra. Ezt a felső értéket{' '}
          <strong>naponta és személyenként</strong> kell értelmezni. (Pl. egy konferencia vagy
          tábor megszervezésére nem adhatunk csak 1 000 lejt előlegként a bevásárlásokra.)
        </li>
      </ul>

      <SectionTitle>Készpénzfizetés értékhatárai — jogi és magánszemélyek között</SectionTitle>
      <SubTitle>Jogi személyek között (egyházközségek, cégek)</SubTitle>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          Az egyházközség naponta <strong>legtöbb 5 000 lejt fogadhat el egy másik jogi
          személytől</strong> (egyházközségtől vagy cégtől) készpénzben.
        </li>
        <li>
          Az <strong>összbevétel nincs korlátozva 5 000 lejre</strong> — más jogi személytől
          elfogadhatunk újabb 5 000 lejt.
        </li>
        <li>
          Egy nap során összesen <strong>legfeljebb 10 000 lej készpénz</strong> használható
          fel kifizetések lebonyolítására különböző cégek számára. Egyetlen cégnek sem
          adhatunk 5 000 lejnél többet készpénzben.
        </li>
        <li>
          <strong>5 000 lejnél nagyobb értékű számlákat</strong> legtöbb 5 000 lejig
          fizethetünk ki készpénzben — az 5 000 lej feletti összeget kötelezően banki
          utalással. <strong>Nem oszthatjuk fel a kifizetést kisebb részekre</strong>, hogy
          így kikerüljük a törvényi előírásokat.
        </li>
      </ul>

      <SubTitle>Magánszemélyekkel szemben</SubTitle>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          Egy magánszemélytől az egyházközség naponta <strong>legtöbb 10 000 lej</strong>{' '}
          készpénzt fogadhat el ÉS legtöbb 10 000 lejt fizethet ki.
        </li>
        <li>
          Ez alól <strong>kivételt képez az alkalmazott havi fizetése</strong>.
        </li>
      </ul>

      <SectionTitle>Hitelek — 2023. novembere óta</SectionTitle>
      <CalloutWarning>
        Csak <strong>banki utalással</strong> lehet hitelt be- és visszafizetni. A törvény
        tiltja a kassza direkt hitelezését. Az előlegként kiadható összeg{' '}
        <strong>5000 lej/személy/nap</strong>. Hitelt MÁS EGYHÁZKÖZSÉGNEK adhatunk, de csak
        presbiteri határozattal — magánszemélynek SOSEM.
      </CalloutWarning>

      <SectionTitle>Megjegyzés</SectionTitle>
      <p className="text-slate-600">
        Ezeket a szabályokat bármikor módosíthatják. A jelen Súgó-tartalom 2025 végi állapotot
        tükröz — érdemes követni a hivatalos változtatásokat az EREK csatornáin keresztül.
      </p>
    </>
  )
}
