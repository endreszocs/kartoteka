'use client'

/**
 * Leltár — SÚGÓ fül (2026-08-27, teljes megújítás).
 *
 * ⛔ MI VOLT A BAJ (Endre kérése: „Frissítsd a súgót a leltárnál! — legyenek
 * lépésről lépésre bemutatók a használatról és a működésről! Legyen szép
 * vizuális elemekkel!"):
 *   1. A súgó EGY IKONT SEM tartalmazott, és NULLA `dark:` osztályt — sötét
 *      témán fehér kártyák világos szövegen: olvashatatlan.
 *   2. Nem tudott a modul két legutóbbi köréről: a hivatalos Leltar 3_43
 *      munkafüzetről, az import-varázslóról és az exportról (0 találat).
 *   3. A „Mi záródik le?" fejezet a 2026-08-27-i szigorítás ELŐTTI szabályt
 *      írta le („a tételek szabadon módosíthatók véglegesítés után is").
 *   4. Hiányzott az alapeszköz-értékhatár (OUG 8/2026), a kivezetés és a Kuka
 *      különbsége (30 napos végleges törlés) és az Anyagraktár fül.
 *
 * A tartalom mostantól a VALÓDI felületet írja le, lépésekre bontva, ikonokkal
 * és ábrával — és minden szín token-alapú, tehát sötét témán is helyes.
 */

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Lightbulb,
  ListChecks,
  Lock,
  Package,
  Printer,
  Scale,
  Search,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { INVENTORY_PRINT_TYPES } from '@/lib/inventory/reporting'

interface GuideSection {
  id: string
  title: string
  icon: LucideIcon
  intro: string
  /** Lépésről lépésre — ez a fejezet gerince. */
  steps: Array<{ cim: string; leiras: string }>
  tudnivalo: string[]
  tipp?: string[]
  figyelem?: string
  cimkek: string[]
}

const SECTIONS: GuideSection[] = [
  {
    id: 'alapok',
    title: 'Mi a leltár, és mire való?',
    icon: Boxes,
    intro:
      'A leltár a gyülekezet vagyoni nyilvántartása. Ide kerül minden tárgy, könyv, kegyszer, telek és eszköz, amiről a gyülekezetnek hivatalosan számot kell adnia — ebből készül az éves vagyonleltári jelentés, amit az egyházmegyének küldünk.',
    steps: [
      { cim: 'Nézd meg, benne van-e már', leiras: 'A kereső a megnevezésre, a leltári számra, a helyszínre és a felelős nevére is szűr. Duplikátum helyett mindig a meglévő tételt szerkeszd.' },
      { cim: 'Vedd fel vagy javítsd', leiras: 'Új tárgynál az „Új tétel" gomb, meglévőnél a sor „Szerkesztés" gombja. A rendszer a leltári számot magától adja.' },
      { cim: 'Add meg a helyszínt és a felelőst', leiras: 'Ez a két adat teszi lehetővé a helyszíni leltárívet — enélkül a felleltározás papíron sem működik.' },
      { cim: 'Az év végén nyomtass és véglegesíts', leiras: 'A Nyomtatási központban készül a hivatalos ív, a Véglegesítés pedig lezárja az évet az egyházmegye felé.' },
    ],
    tudnivalo: [
      'A leltár nem egyszerű lista, hanem hivatalos nyilvántartás — aláírt ívek készülnek belőle.',
      'A tárgyak év közben változnak: beszerzés, kivezetés, áthelyezés, felelős-csere.',
      'A modulnak négy füle van: Leltári nyilvántartás, Anyagraktár, Súgó, és rendszergazdai módban az Importáló.',
    ],
    tipp: [
      'A pontosság fontosabb a gyorsaságnál — egy elgépelt megnevezést évekig keresni fogsz.',
      'A beszerzési bizonylat számát mindig írd be: ez teszi visszakereshetővé a tételt.',
    ],
    cimkek: ['Nyilvántartás', 'Éves jelentés'],
  },
  {
    id: 'rogzites',
    title: 'Új tétel rögzítése lépésről lépésre',
    icon: ListChecks,
    intro:
      'Egy tárgy felvételekor a rendszer automatikusan leltári számot ad (a kategória előtagjával), és a megadott adatok alapján számolja a könyv szerinti és a leltári értéket.',
    steps: [
      { cim: '1. „Új tétel" gomb', leiras: 'A Leltári nyilvántartás fül jobb felső sarkában.' },
      { cim: '2. Megnevezés', leiras: 'Úgy írd, ahogy évek múlva is felismered. Könyvnél a szerző külön mezőbe kerül.' },
      { cim: '3. Kategória', leiras: 'Ez dönti el, melyik hivatalos nyomtatvány melyik sorába kerül a tétel, és milyen leltári szám-előtagot kap.' },
      { cim: '4. Érték és dátum', leiras: 'A beszerzési érték EGYSÉGÁR. Ha 5 azonos széket vettél, az egy szék árát írd be, és a mennyiséghez 5-öt.' },
      { cim: '5. Helyszín és felelős', leiras: 'A helyszíni leltárív ezek szerint csoportosít.' },
      { cim: '6. Mentés és ellenőrzés', leiras: 'Mentés után nézd meg a listában, hogy a tétel a megfelelő kategóriába került-e.' },
    ],
    tudnivalo: [
      'Kötelező: megnevezés, kategória és beszerzési érték.',
      'A leltári szám formátuma: kategória-előtag + sorszám (pl. AE-001, CS-014, K-102).',
      'A mennyiség és a mértékegység akkor számít, ha egy tételben több darab van.',
    ],
    figyelem:
      'A beszerzési érték EGYSÉGÁR, nem a teljes összeg. A könyv szerinti érték ebből és a mennyiségből számolódik — ha a teljes összeget írod be, minden nyomtatvány többszörös értéket mutat.',
    cimkek: ['Rögzítés', 'Leltári szám'],
  },
  {
    id: 'kategoriak',
    title: 'A hét kategória és az értékhatár',
    icon: Scale,
    intro:
      'A hivatalos leltárprogram hét tárgycsoporttal dolgozik. A csoport nem ízlés kérdése: ez dönti el, melyik nyomtatványba és melyik sorba kerül a tétel, és hogy alapeszközként kell-e amortizálni.',
    steps: [
      { cim: 'Alapeszközök (AE)', leiras: 'Tartós, nagy értékű eszközök — ezeket amortizáljuk. Román megfelelő: Mijloace fixe.' },
      { cim: 'Csekély értékű leltári tárgyak (CS)', leiras: 'Az értékhatár alatti tárgyak. Obiecte de inventar.' },
      { cim: 'Telkek, földek, erdők (T)', leiras: 'Ingatlanok. Terenuri și amplasamenturi.' },
      { cim: 'Könyvek (K)', leiras: 'Külön szerző- és címmezővel. Cărți.' },
      { cim: 'Kegyszerek (KG)', leiras: 'Istentiszteleti tárgyak. Obiecte de cult.' },
      { cim: 'Kárpótlási jegyek, részvények (KR)', leiras: 'Értékpapírok. Acțiuni și titluri de proprietate.' },
      { cim: 'Bizományi (B)', leiras: 'Nem a gyülekezet tulajdona, csak nála van. Custodie.' },
    ],
    tudnivalo: [
      'Az alapeszköz-értékhatár időben változott: 2013. június 30-ig 1800 lej, 2013. július 1-től 2500 lej (HG 276/2013), 2026. február 25-től 5000 lej (OUG 8/2026).',
      'A rendszer a beszerzés DÁTUMA szerinti küszöbbel dolgozik — egy 2015-ös eszköznél a 2500 lejes határ számít, nem a mai.',
      'A küszöb alatti alapeszköznél a rendszer figyelmeztet, de nem tilt: a besorolás a te döntésed marad.',
    ],
    cimkek: ['Kategóriák', 'Értékhatár'],
  },
  {
    id: 'ertek',
    title: 'Érték, amortizáció, le- és felértékelés',
    icon: Scale,
    intro:
      'Három érték szerepel a nyomtatványokon, és nem ugyanazt jelentik. Ha ezeket összekevered, az egyházmegyének küldött jelentés hibás lesz.',
    steps: [
      { cim: 'Egységár', leiras: 'Egy darab beszerzési ára, ahogy a bizonylaton szerepel.' },
      { cim: 'Könyv szerinti érték', leiras: 'Egységár × mennyiség, plusz az esetleges le- vagy felértékelés. Ez megy a hivatalos regiszterekbe.' },
      { cim: 'Leltári (aktuális) érték', leiras: 'A könyv szerinti értékből az eltelt évek amortizációját levonva — csak alapeszköznél értelmezett, ahol van használati idő.' },
    ],
    tudnivalo: [
      'Az amortizáció a használati idő (év) alapján lineárisan számolódik a beszerzés dátumától.',
      'A le- vagy felértékelés a könyv szerinti értéket módosítja, és a tétel megjegyzésében nyomon követhető.',
      'A vagyonleltári jelentés négy oszlopa (előző évi egyenleg + bejövetel − törlés = év végi egyenleg) mostantól pontosan kiadja egymást.',
    ],
    cimkek: ['Érték', 'Amortizáció'],
  },
  {
    id: 'import',
    title: 'Import: a hivatalos munkafüzet és az egyszerű lista',
    icon: Upload,
    intro:
      'Rendszergazdai vagy delegált módban megjelenik az „Importáló" fül. Egyetlen ejtőzóna van: a rendszer felismeri, hogy a hivatalos Leltar 3_43 munkafüzetet kapta-e, vagy egy egyszerű Excel/CSV listát — és a megfelelő úton viszi tovább.',
    steps: [
      { cim: '1. Fájl', leiras: 'Húzd be a fájlt. A hivatalos Leltar 3_43.xlsx minden kitöltendő lapját ismerjük; egyszerű listánál egy sor = egy tétel.' },
      { cim: '2. Ellenőrzés', leiras: 'Minden sor megjelenik — csonkolás nélkül. Szűrhetsz állapotra (Javítandó / Figyelmeztetés / Rendben), lapra, és kereshetsz is.' },
      { cim: '3. Javítás', leiras: 'A hibás sorok itt helyben javíthatók: hiányzó megnevezés, rossz mennyiség, dátum, érték. Ha a leltári szám ütközik, eldöntheted: új szám, a meglévő frissítése, vagy kihagyás — soronként vagy egyetlen tömeges gombbal.' },
      { cim: '4. Importálás', leiras: 'Előre látod, hány tétel kerül be, hány frissül és hány marad ki. Az import után a lista magától frissül.' },
    ],
    tudnivalo: [
      'A munkafüzet Súgójának szabályai szerint dolgozunk: hiányzó hónap/nap → január 1., hiányzó mennyiség → 1 db.',
      'A negatív sorok részleges kivezetést jelentenek; alapeszköznél le- vagy felértékelést.',
      'Az „Export (Leltar 3_43)" gomb a hivatalos munkafüzetet tölti le kitöltve — a sablon képletei és legördülői érintetlenül maradnak.',
    ],
    figyelem:
      'Ha a tárgyévi vagyonleltári jelentés már véglegesítve van, a MEGLÉVŐ tételek felülírása zárolt. Ilyenkor kérj feloldást az egyházmegyétől; új tétel bevitele nincs zárolva.',
    cimkek: ['Import', 'Leltar 3_43'],
  },
  {
    id: 'kivezetes',
    title: 'Kivezetés és Kuka — nem ugyanaz',
    icon: Trash2,
    intro:
      'Két különböző dolog, és a különbség hivatalos következménnyel jár. A törlés gomb ezért két utat kínál.',
    steps: [
      { cim: 'Kivezetés (hivatalos)', leiras: 'A tárgy elhasználódott, elveszett, eladtuk. Dátumot, igazoló iratot és indoklást adsz meg. A tétel a nyilvántartásban MARAD, kivezetettként — és rákerül a „Leltárból törölt tárgyak" nyomtatványra.' },
      { cim: 'Kukába (adatok nélkül)', leiras: 'Elgépeltél valamit, duplán vetted fel. A tétel a Kukába kerül, ahonnan visszaállítható — de 30 nap után véglegesen törlődik.' },
    ],
    tudnivalo: [
      'A kivezetett tétel leltári száma felszabadul, és újra kiadható.',
      'A hivatalos munkafüzet szerint a kivezetett sor SOSEM törlődik a lapról — ezért marad nálunk is a nyilvántartásban.',
      'Ha bizonytalan vagy: a Kuka visszafordítható 30 napig, a kivezetés hivatalos aktus.',
    ],
    figyelem:
      'Ne használd a Kukát kivezetésre. A kivezetett tárgynak szerepelnie kell az éves törlési listán — a Kukába dobott tétel onnan hiányozni fog.',
    cimkek: ['Kivezetés', 'Kuka'],
  },
  {
    id: 'nyomtatas',
    title: 'Nyomtatási központ',
    icon: Printer,
    intro:
      'Öt hivatalos nyomtatvány készül a leltárból. Az előnézetben lapozhatsz az oldalak között, és kiválaszthatod a dokumentum nyelvét is.',
    steps: [
      { cim: '1. Válaszd ki a nyomtatványt', leiras: 'A bal oldali kártyák közül. Az előnézet azonnal frissül.' },
      { cim: '2. Állítsd be az évet és a nyelvet', leiras: 'A nyelvválasztóval magyar vagy román elsődleges nyelvű ívet kapsz — a másik nyelv felirata mellette marad, így a lap mindkét nyelven azonosítható.' },
      { cim: '3. Nézd át az előnézetet', leiras: 'A lapozóval oldalanként ellenőrizheted. Az oldalszám a lap alján is szerepel.' },
      { cim: '4. PDF vagy nyomtatás', leiras: 'A „PDF-be mentés" fájlt készít, a „Direkt nyomtatás" a böngésző nyomtatási ablakát nyitja meg.' },
    ],
    tudnivalo: [
      'A lista szűrői (kategória, helyszín, időszak) hatnak a nyomtatványra is — a fejlécben mindig kiírjuk, mi volt beállítva.',
      'A pénztár és követelés sorok a Pénzügy modulból jönnek; ha nem tölthetők be, a rendszer figyelmeztet (nem ír néma nullát).',
      'A táblázat fejléce minden oldalon megismétlődik.',
    ],
    cimkek: ['Nyomtatás', 'Hivatalos ív'],
  },
  {
    id: 'anyagraktar',
    title: 'Anyagraktár',
    icon: Package,
    intro:
      'Külön fül a fogyóanyagoknak és a kerületi nyugtatömböknek. Ami elfogy (gyertya, tisztítószer, nyomtatvány), az nem leltári tárgy — de nyilván kell tartani.',
    steps: [
      { cim: 'Általános anyagok', leiras: 'Bevételezés és kiadás mennyiséggel; a raktárkönyv anyagonként nyomtatható.' },
      { cim: 'Kerületi nyugtatömbök', leiras: 'A sorszámozott tömbök átvétele és felhasználása külön követhető.' },
    ],
    tudnivalo: [
      'Az anyagraktár értéke beleszámít a leltár összesítőjébe.',
      'A raktárkönyv anyagonként külön lapra nyomtatódik.',
    ],
    cimkek: ['Anyagraktár'],
  },
  {
    id: 'veglegesites',
    title: 'Véglegesítés és egyházmegyei feloldás',
    icon: Lock,
    intro:
      'Az év végén a vagyonleltári JELENTÉST véglegesíted, és beküldöd az egyházmegyének. A véglegesítés zöld pecsétet tesz az évre.',
    steps: [
      { cim: '1. Ellenőrizd a listát', leiras: 'A javítás a véglegesítés előtt sokkal egyszerűbb.' },
      { cim: '2. Véglegesítés', leiras: 'A „Jelentés véglegesítése" gomb lezárja az évet, dátummal és névvel.' },
      { cim: '3. Beküldés', leiras: 'A beküldés a kanonikus darabszámot és értéket viszi az egyházmegyének.' },
      { cim: '4. Ha javítani kell', leiras: 'Kérj feloldást indoklással. Az egyházmegye jóváhagyása után az év újra nyitott.' },
    ],
    tudnivalo: [
      'Új tételt véglegesítés után is felvehetsz — a véglegesítés a jelentést zárja le, nem a rögzítést.',
      'A MEGLÉVŐ tételek IMPORTBÓL való felülírása viszont zárolt, amíg az egyházmegye fel nem oldja.',
      'A feloldás kérése a Leltári nyilvántartás fülön, a jelentés-blokkban indul.',
    ],
    figyelem:
      'Ha az import felülírást is végezne egy lezárt évben, a rendszer megállítja, és megmondja, hogy egyházmegyei feloldás kell hozzá.',
    cimkek: ['Véglegesítés', 'Egyházmegye'],
  },
  {
    id: 'hibak',
    title: 'Gyakori hibák és mit tegyél',
    icon: AlertTriangle,
    intro: 'A leggyakoribb bejelentések és a megoldásuk.',
    steps: [
      { cim: '„Importáltam, de nem látok semmit"', leiras: 'A lista mostantól magától frissül az import után. Ha mégis üresnek tűnik, ellenőrizd a kategória- és időszak-szűrőt a lista tetején.' },
      { cim: '„A leltári szám már létezik"', leiras: 'Az import Javítás lépésében dönthetsz: új szám, a meglévő frissítése, vagy kihagyás.' },
      { cim: '„Nulla lej értéket látok"', leiras: 'Vagy hiányzik a beszerzési érték, vagy alapeszköznél az amortizáció leírta. A könyv szerinti érték oszlop mutatja az eredeti értéket.' },
      { cim: '„A nyomtatvány üres sorokat tartalmaz"', leiras: 'Szűrő lehet bekapcsolva — a nyomtatvány fejléce mindig kiírja, milyen szűréssel készült.' },
    ],
    tudnivalo: [
      'A hiányzó megnevezés, érték, mennyiség, helyszín és felelős a leggyakoribb hibaforrás.',
      'Az importáló minden kimaradt sort tételesen felsorol — érdemes végigolvasni.',
    ],
    cimkek: ['Hibaelhárítás'],
  },
]

export function InventoryGuideTab() {
  const [aktivId, setAktivId] = useState(SECTIONS[0].id)
  const aktiv = useMemo(() => SECTIONS.find(s => s.id === aktivId) || SECTIONS[0], [aktivId])
  const Icon = aktiv.icon

  return (
    <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
      {/* ── Fejezet-választó ─────────────────────────────────────── */}
      <nav aria-label="Súgó fejezetek" className="space-y-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Leltár súgó
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Lépésről lépésre, a valódi felület szerint.
          </p>
        </div>
        <ul className="space-y-1.5">
          {SECTIONS.map((section, index) => {
            const SIcon = section.icon
            const active = section.id === aktivId
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => setAktivId(section.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                    active
                      ? 'border-primary/50 bg-primary/10 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <SIcon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 text-sm font-medium">{section.title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* ── Fejezet tartalma ─────────────────────────────────────── */}
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-heading text-xl text-foreground sm:text-2xl">{aktiv.title}</h3>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{aktiv.intro}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {aktiv.cimkek.map(c => (
                <Badge key={c} variant="secondary" className="rounded-full">
                  {c}
                </Badge>
              ))}
            </div>
          </div>

          {/* Lépés-sor */}
          <ol className="mt-5 space-y-2">
            {aktiv.steps.map((step, index) => (
              <li
                key={step.cim}
                className="flex gap-3 rounded-xl border border-border bg-background/60 p-3"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{step.cim}</p>
                  <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{step.leiras}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <InfoKartya cim="Amit tudni érdemes" icon={Info} tone="info" items={aktiv.tudnivalo} />
          {aktiv.tipp && aktiv.tipp.length > 0 && (
            <InfoKartya cim="Jó gyakorlat" icon={Lightbulb} tone="tipp" items={aktiv.tipp} />
          )}
        </div>

        {aktiv.figyelem && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p className="leading-6">{aktiv.figyelem}</p>
          </div>
        )}

        {aktiv.id === 'alapok' && <MunkamenetAbra />}

        {aktiv.id === 'nyomtatas' && (
          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              A hivatalos nyomtatványok
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {INVENTORY_PRINT_TYPES.map(type => (
                <div key={type.id} className="rounded-xl border border-border bg-background/60 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <FileSpreadsheet className="size-4 shrink-0 text-primary" />
                    {type.title}
                  </p>
                  <p className="mt-1 text-xs font-medium text-primary">{type.subtitle}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{type.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function InfoKartya({
  cim,
  icon: Icon,
  tone,
  items,
}: {
  cim: string
  icon: LucideIcon
  tone: 'info' | 'tipp'
  items: string[]
}) {
  const stilus =
    tone === 'info'
      ? 'border-sky-200 bg-sky-50/70 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100'
      : 'border-emerald-200 bg-emerald-50/70 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'

  return (
    <section className={`rounded-2xl border p-4 ${stilus}`}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 shrink-0" />
        {cim}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map(item => (
          <li key={item} className="flex items-start gap-2 text-sm leading-6">
            <CheckCircle2 className="mt-1 size-3.5 shrink-0 opacity-70" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * A leltár éves munkamenete — egyszerű, token-színes ábra.
 *
 * Szándékosan INLINE SVG: nincs külső kép-függőség, sötét témán is helyes
 * (a színek `currentColor`-ból és token-osztályokból jönnek), és nyomtatásra
 * sincs szükség rá.
 */
function MunkamenetAbra() {
  const lepesek = [
    { cim: 'Rögzítés', icon: ListChecks },
    { cim: 'Keresés, ellenőrzés', icon: Search },
    { cim: 'Kivezetés', icon: Trash2 },
    { cim: 'Nyomtatás', icon: Printer },
    { cim: 'Véglegesítés', icon: Lock },
  ]
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        A leltár éves munkamenete
      </p>
      <ol className="mt-4 flex flex-wrap items-stretch gap-2">
        {lepesek.map((l, i) => {
          const LIcon = l.icon
          return (
            <li key={l.cim} className="flex items-center gap-2">
              <div className="flex min-w-[8.5rem] flex-col items-center gap-1.5 rounded-xl border border-border bg-background/60 px-3 py-3 text-center">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <LIcon className="size-4" />
                </span>
                <span className="text-xs font-semibold text-foreground">{l.cim}</span>
              </div>
              {i < lepesek.length - 1 && (
                <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden className="shrink-0 text-muted-foreground">
                  <path d="M0 6h13M11 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Év közben az első három lépés ismétlődik; az utolsó kettő az év végi zárás.
      </p>
    </section>
  )
}
