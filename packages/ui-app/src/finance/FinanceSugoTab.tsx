'use client'

/**
 * FinanceSugoTab — Pénzügy Súgó (Sprint Q F1, v0.7.3, 2026-04-25).
 *
 * Lelkészbarát, kategorizált magyarázat a Pénzügy modul minden funkciójáról.
 *
 * Felépítés:
 *   - Bal oldalon kategória-fastruktúra (Alapok / Napi munka / Speciális / Év végi)
 *   - Jobbra a kiválasztott téma részletes leírása lépésekkel és példákkal
 *   - Lent élő checklist (FinanceSugoChecklist gyermek komponens)
 *   - Cél: a lelkész könnyen megértse, mit hol talál, és hogyan használja
 *
 * ─── Platform-függetlenség (web + Tauri desktop + jövőbeli iOS) ───
 *
 * - Csak pure UI (react, lucide-react, ./types, ./helpers, ./FinanceSugoChecklist)
 * - SEMMILYEN platform-API import (sonner, next/*, @supabase/*, @tauri-apps/* nincs)
 * - Print engine callback-en át (`onPrintTopicToBrowser` / `onPrintTopicToPdf`):
 *     a wrapper (web: html2pdf.js, desktop: WebView2 native print, iOS: jövőben
 *     UIPrintInteractionController) végzi a tényleges renderelést
 * - Toast callback-en (`onToast`)
 * - Véglegesítés-link `finalizeHref` prop-on (web: `/penzugy?tab=accounting`,
 *   desktop: `/penzugy/szamadas` vagy hasonló)
 */

import { useState, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  BookMarked,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardList,
  Coins,
  CreditCard,
  Eye,
  FileSpreadsheet,
  Files,
  HelpCircle,
  Inbox,
  Landmark,
  Lightbulb,
  PiggyBank,
  Receipt,
  Repeat,
  Scale,
  ScrollText,
  Sparkles,
  Printer,
  Wallet,
} from 'lucide-react'

import { FinanceSugoChecklist } from './FinanceSugoChecklist'

// ─────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────

type ColorKey =
  | 'blue'
  | 'emerald'
  | 'violet'
  | 'pink'
  | 'amber'
  | 'cyan'
  | 'orange'
  | 'slate'
  | 'rose'
  | 'teal'

type Step = {
  text: string
  hint?: string
}

type Topic = {
  key: string
  label: string
  icon: typeof BookOpen
  color: ColorKey
  /** Egy mondatos leírás — a kategória-listán látszik. */
  shortDescription: string
  /** Részletes intro — a tartalmi rész tetején. */
  intro: string
  /** „Mire jó?" — a fő funkció leírása. */
  whatItDoes: string
  /** Lépések — hogy működik a felhasználó számára. */
  howItWorks?: Step[]
  /** Tippek és figyelmeztetések. */
  tips?: Array<{ kind: 'tip' | 'warning'; text: string }>
  /** Példák valós helyzetekre. */
  examples?: Array<{ situation: string; solution: string }>
}

type Section = {
  key: string
  label: string
  description: string
  icon: typeof BookOpen
  topics: Topic[]
}

/**
 * A topic adatszerkezete, amit a print callback-eknek átadunk.
 * Csak string-mezők — platform-független, JSON-szerializálható.
 */
export interface FinanceSugoTopicPdfData {
  label: string
  intro: string
  whatItDoes: string
  howItWorks?: Step[]
  tips?: Array<{ kind: 'tip' | 'warning'; text: string }>
  examples?: Array<{ situation: string; solution: string }>
  sectionLabel?: string
}

export type FinanceSugoToastKind = 'success' | 'error' | 'info' | 'warning'

// ─────────────────────────────────────────────────────────────
// Tartalom — a Súgó teljes szövege
// ─────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  // ============= 1. ALAPOK =============
  {
    key: 'alapok',
    label: 'Alapok',
    description: 'Az első lépések — mi a pénzügy modul szerkezete',
    icon: BookOpen,
    topics: [
      {
        key: 'attekintes',
        label: 'Áttekintés',
        icon: Eye,
        color: 'blue',
        shortDescription: 'A modul főoldala — napi pillantásra minden adat',
        intro:
          'Ez az első, amit reggel látsz, amikor megnyitod a Pénzügy modult. Egy helyen megjeleníti a legfontosabb pénzügyi adatokat és a legutóbbi mozgásokat.',
        whatItDoes:
          'Négy KPI-kártya: kassza egyenleg, bank egyenleg, idei összes bevétel, idei összes kiadás. Plus egy „éves egyenleg" banner és a legutóbbi 10 mozgás listája.',
        howItWorks: [
          {
            text: 'A felső 4 színes kártya a fő számokat mutatja — kék = kassza, lila = bank, zöld = bevétel, piros = kiadás.',
          },
          {
            text: 'Az „Éves egyenleg" banner zöld, ha az év pluszban van; piros, ha mínuszban.',
            hint: 'Mínusz egyenleg azt jelzi, hogy idén több kiadás volt, mint bevétel. Ez nem azonnal probléma, ha az előző évek tartalékai fedezik.',
          },
          {
            text: 'A „Legutóbbi mozgások" lista 10 darab tételt mutat dátum szerint visszafelé, mind a befizetésekből, mind a kiadásokból.',
          },
          {
            text: 'A fejléc-chip („Oblio: kapcsolva" / „Nincs beállítva") jelzi a romániai e-Factura kapcsolat állapotát.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Ez az egyetlen oldal, amit naponta meg kell nyitnod — a többi (Számadás, Költségvetés) inkább havi vagy éves rutin.',
          },
        ],
      },
      {
        key: 'fulek-szerkezete',
        label: 'A fülek szerkezete',
        icon: Files,
        color: 'slate',
        shortDescription: 'Mi mire való a 11 Pénzügy fül közül',
        intro:
          'A Pénzügy modulban 11 fül van. Ez a térkép segít, hogy melyiket mikor használd.',
        whatItDoes:
          'A balról jobbra haladó sorrend a leggyakoribbtól a legritkábbig — kezdve az áttekintéssel, végül a súgóval.',
        howItWorks: [
          { text: '🔵 Áttekintés — napi pillantás, KPI-k, legutóbbi mozgások' },
          { text: '🟢 Kassza — készpénzes mozgások, nyugta-kiállítás' },
          { text: '🟣 Bank — banki mozgások, FX átértékelés' },
          { text: '🌸 Tranzakciók — minden bevétel és kiadás egy listában, hónaponként' },
          { text: '🟡 Költségvetés — éves terv és módosítások (max 3 / év)' },
          { text: '🔵 Számadás — terv ↔ tényleges összevetés, év végi zárás' },
          { text: '🟠 Tartozások — kik nincsenek naprakész a járulékkal' },
          { text: '🟡 Bérleti szerződések — földek, épületek bérbeadása + e-Factura' },
          { text: '⚪ Monetár — készpénz fizikai ellenőrzése címletenként' },
          { text: '🔵 Oblio ellenőrzés — befogadott e-Factura számlák párosítása' },
          { text: '🟢 Súgó — ez itt' },
        ],
      },
      {
        key: 'hero-gombok',
        label: 'A fejléc gombjai',
        icon: Sparkles,
        color: 'amber',
        shortDescription: 'A 4+1 fő művelet, ami minden fülön elérhető',
        intro:
          'A Pénzügy modul fejlécében (a fülek felett) öt gomb van — ezek a leggyakoribb műveletek.',
        whatItDoes: 'Bevétel, kiadás, decont (elszámolás), pénztári és költségvetés-nyomtatás.',
        howItWorks: [
          {
            text: '🟢 + Bevétel — új befizetés rögzítése (személyhez vagy családhoz). Itt választod ki a célt (egyházfenntartó, persely, stb.).',
          },
          {
            text: '🔴 + Kiadás — új kiadás rögzítése (kedvezményezett, dátum, költségvetési cél).',
          },
          {
            text: '🟣 Decont — átvevő által elköltött előleg részletes elszámolása. Sablon a hivatalos „Decont de cheltuieli"-hez.',
          },
          {
            text: '🔵 Pénztár nyomtatás — pénztári napló (cassă) hivatalos formátumban.',
          },
          {
            text: '🟢 Költségvetés nyomtatás — éves terv hivatalos formátumban.',
          },
        ],
      },
    ],
  },

  // ============= 2. NAPI MUNKA =============
  {
    key: 'napi-munka',
    label: 'Napi munka',
    description: 'A leggyakoribb műveletek — bevétel, kiadás, készpénz',
    icon: Wallet,
    topics: [
      {
        key: 'kassza',
        label: 'Kassza',
        icon: Wallet,
        color: 'emerald',
        shortDescription: 'A készpénzes mozgások és nyugta-kiállítás',
        intro:
          'Itt vezeted a készpénzes pénztárt — mind a bevételeket, mind a kiadásokat. A Kassza a Bank független párja: a kettő nem keveredik.',
        whatItDoes:
          'Hónaponkénti listázás dátum szerint, nyitó- és záró-egyenleg, hiányos adatok jelzése, **nyugta (chitanță) kiállítás** közvetlenül a sorból.',
        howItWorks: [
          {
            text: 'Az új sor felvitele a Pénzügy fejléc „+ Bevétel" / „+ Kiadás" gombbal történik. Az „irattípus" mező legyen „készpénz" — ekkor a sor ide kerül.',
          },
          {
            text: 'A táblázatban minden befizetés sornál van egy 🧾 gomb. Ha még nincs nyugta → kiállíthatsz egyet (Receipt ikon). Ha már van → újranyomtathatod (Printer ikon).',
            hint: 'A nyugta NEM kerül fel az Oblio rendszerbe — csak helyileg tárolódik, és a hivatalos sablon szerint nyomtatható.',
          },
          {
            text: 'A piros figyelmeztető háromszög („⚠") jelzi, ha egy sornál nincs személy hozzárendelve, vagy nincs költségvetési cél. Ezeket pótolnod kell.',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'Ha egy bevétel sornál „⚠ Gyülekezeti tag" szerepel, az azt jelenti, hogy nincs konkrét személyhez kapcsolva. Ez a Tartozások fülön nem fog számolódni — szerkeszd a sort, és válassz nevet.',
          },
        ],
        examples: [
          {
            situation: 'Egy hívő a vasárnapi istentisztelet után 100 lejt tesz a perselybe.',
            solution:
              '+ Bevétel → forrás: „persely (vasárnap dátum)", cél: persely (101.04), irattípus: készpénz, személy: NEM kell.',
          },
          {
            situation: 'A lelkész 50 lejjel benzint vesz a gyülekezeti autóhoz.',
            solution:
              '+ Kiadás → kedvezményezett: „benzinkút (név)", cél: 209.x (üzemanyag), irattípus: készpénz, iratszám: a számláról.',
          },
        ],
      },
      {
        key: 'bank',
        label: 'Bank',
        icon: Landmark,
        color: 'violet',
        shortDescription: 'Banki mozgások, több számla, deviza',
        intro:
          'A bankszámlák kezelése — több párhuzamos számla (RON + EUR, vagy különböző bankok), egyenlegek és devizás átértékelés.',
        whatItDoes:
          'Banki bevételek és kiadások (nem készpénzes), nyitó- és záró-egyenleg, FX átértékelés év végén.',
        howItWorks: [
          {
            text: 'Új sor: Pénzügy fejléc „+ Bevétel" / „+ Kiadás" → irattípus: „banki" / „átutalás" → bankszámla választás.',
          },
          {
            text: 'A táblázat minden bankszámlához külön egyenleget mutat, plus egy összesítő egyenleget.',
          },
          {
            text: 'Devizás átértékelés (FX): ha EUR számlád is van, év végén a BNR árfolyamon át kell értékelni — ezt a KARTOTEKA automatikusan javasolja.',
          },
          {
            text: 'A piros „⚠" jelzés ugyanúgy működik mint a Kassza fülön — hiányos adatra figyelmeztet.',
          },
        ],
      },
      {
        key: 'tranzakciok',
        label: 'Tranzakciók',
        icon: ArrowLeftRight,
        color: 'pink',
        shortDescription: 'Minden bevétel és kiadás együtt — kereséshez',
        intro:
          'A Tranzakciók fül egy egységes listában mutatja minden bevételt és kiadást — független attól, hogy készpénz vagy banki, hogy ki rögzítette, mikor.',
        whatItDoes:
          'Hónaponkénti csoportosítás, kiadási kísérőív nyomtatás, Oblio e-Factura státusz oszlop.',
        howItWorks: [
          {
            text: 'A lista hónapok szerint van bontva. Minden hónap fölött látod a havi össz-bevételt (zöld) és össz-kiadást (piros).',
          },
          {
            text: 'A 🧾 oszlopban minden befizetésnél: ha bérleti díj és van szerződés-pár → „+ Számla" (e-Factura) gomb. Egyébként az Oblio státusz látszik (zöld pipa = elfogadva, sárga óra = függőben).',
          },
          {
            text: 'A kiadások „🧾" oszlopában: zöld pipa ha a beszállító feltöltötte SPV-be a számlát, sárga ⚠ ha nincs SPV-ben.',
          },
          {
            text: 'A „Kísérőív" gomb minden napra rendezetten kinyomtatható (sorszámozva).',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'A nyugta-kiállítás (chitanță) NEM ezen a fülön van — átkerült a Készpénz fülre, mert csak készpénzes átvételhez illik.',
          },
        ],
      },
      // ─── ÚJ (2026-04-18): Nyugtatömb rendszer ───
      {
        key: 'nyugtatomb',
        label: 'Nyugtatömb rendszer',
        icon: Receipt,
        color: 'emerald',
        shortDescription: 'A kerülettől vett nyugtatömbök teljes életciklusa',
        intro:
          'Minden gyülekezet a kerülettől kap előre számozott nyugtatömböket. A rendszer automatikusan követi, mikor melyik számot használtad, és év végén kimutatást ad róla.',
        whatItDoes:
          'A Kassza fülön az „Aktív nyugtatömb" panelen látod a maradékot. Új tömb átvételkor a „+ Új tömb" gombra kattintva egyszerre több tömb is rögzíthető (közös vásárlási dátummal).',
        howItWorks: [
          { text: 'Átveszed a kerülettől a tömbö(ke)t — jegyezd fel a seria-t és a nyomdai szám-tartományt.' },
          {
            text: 'A Kassza fülön → Nyugtatömb panel → „+ Új tömb" → repeater űrlap. Egyszerre akár 5-10 tömböt is rögzíthetsz.',
            hint: 'A 2. tömb kezdőszáma automatikusan az 1. vége + 1 — és folytatódik.',
          },
          {
            text: 'A vásárlás összesített árát egyszer add meg — a rendszer egyenletesen osztja el a tömbök között.',
          },
          {
            text: 'Mindig CSAK EGY aktív tömb van — ha kifogy, automatikusan a következőre lép.',
          },
          {
            text: 'Ha nyugtát akarsz kiállítani, de nincs aktív tömb, a rendszer felugrik egy wizard-ot, ami segít a tömb rögzítésében, majd folytatja a nyugta-kiállítást.',
          },
          {
            text: 'Éves kimutatás: Nyomtatási központ → „Nyugtatömb kimutatás" — a hivatalos formátumban.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'A nyugtatömbök az Anyagraktár fülön is megjelennek (Leltár → Anyagraktár) — ott látod az összes tömböt raktárkészlet szempontból.',
          },
        ],
      },
      // ─── ÚJ (2026-04-18): Tétel szerkesztés + stornó ───
      {
        key: 'szerkesztes-storno',
        label: 'Tétel szerkesztés és stornó',
        icon: Repeat,
        color: 'amber',
        shortDescription: 'Egy kattintásos módosítás vagy stornó a Kassza / Bank fülön',
        intro:
          'Ha valahol hibát találtál, nem kell törölni a tételt — szerkesztheted vagy stornózhatod. A stornózott sor látható marad auditra, de kimarad a számításokból.',
        whatItDoes:
          'Minden sor mellett ceruza (szerkesztés) és ⊘ (stornó) ikon. Szerkesztéskor: dátum, összeg, jogcím, iratszám, megjegyzés módosítható. Stornónál: kötelező indoklás.',
        howItWorks: [
          { text: 'Kassza vagy Bank fülön keresd meg a sort — a jobb szélén a kis ceruza ikon.' },
          {
            text: 'Szerkesztésben a DÁTUM csak akkor módosítható, ha az éven belüli utolsó tétel — egyéb esetben stornózz és rögzíts újra a helyes dátummal.',
            hint: 'Ez a kronológiai integritás védelme.',
          },
          {
            text: 'A kategória választó most KERESHETŐ — gépelj a névre, a belső számkódok (101.01 stb.) rejtve vannak.',
          },
          {
            text: 'Stornó: ⊘ ikon → kötelező indoklás (min. 5 karakter). A sor piros háttérrel marad, áthúzva. A stornó bármikor visszavonható (míg az év véglegesítve nincs).',
          },
          {
            text: 'Belső mozgás (kassza ↔ bank) stornózása MINDKÉT OLDALT egyszerre érinti.',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'Véglegesített év esetén (számadás lezárva) stornó / szerkesztés nem lehetséges — előbb kérj javítási engedélyt az egyházmegyétől.',
          },
        ],
      },
    ],
  },

  // ============= 3. SZERZŐDÉSEK ÉS BÉRLET =============
  {
    key: 'szerzodes',
    label: 'Szerződések',
    description: 'Bérleti szerződések, számlázás, decont',
    icon: BookMarked,
    topics: [
      {
        key: 'berleti',
        label: 'Bérleti szerződések',
        icon: Building2,
        color: 'amber',
        shortDescription: 'Földek, épületek bérbeadása',
        intro:
          'A gyülekezet vagyonának (földek, épületek) bérbeadása — a szerződések rögzítése, és a havi/éves számlázás.',
        whatItDoes:
          'Új szerződés rögzítése, bérleti díj, fizetési ciklus, jogi típus (locațiune / arendare / comodat / concesiune), Oblio e-Factura kiállítása.',
        howItWorks: [
          {
            text: 'A „+ Új szerződés" gombbal viszel fel újat. Töltsd ki: bérlő (személy vagy cég), tárgy (mit bérel), leírás, típus (terület / épület), jogi típus, összeg, fizetési ciklus.',
          },
          {
            text: 'A jogi típus FONTOS: locațiune (szabványos bérlet) → e-Factura kötelező; comodat (ingyenes haszonkölcsön) → nem kell számla.',
          },
          {
            text: 'A szerződés sorából egy kattintással kiállítható az e-Factura — az Oblio automatikusan elviszi az ANAF SPV-be.',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'A szerződés típusa határozza meg a számadási cél kódot: terület → 104.05, épület → 104.04. Ezt a KARTOTEKA automatikusan beállítja.',
          },
        ],
      },
      {
        key: 'decont',
        label: 'Decont (elszámolás)',
        icon: ClipboardList,
        color: 'violet',
        shortDescription: 'Egy átvevő által elköltött előleg részletes elszámolása',
        intro:
          'Ha egy átvevő (pl. iskolaigazgató, egyházmegyei küldött) előleget kapott, és azzal el kell számolnia, ezzel a sablonnal tudja megtenni.',
        whatItDoes:
          'Hivatalos „Decont de cheltuieli" sablon — bizonylatok listája, egyenleg számítás, nyomtatás vagy PDF mentés.',
        howItWorks: [
          {
            text: 'A Pénzügy fejléc lila „Decont" gombjával nyitható meg.',
          },
          {
            text: 'Töltsd ki: átvevő neve, jóváhagyó, előleg összege, elszámolás célja, ki-bocsátási szám és dátum.',
          },
          {
            text: 'Adj hozzá sorokat (+ gomb) minden bizonylatra: irat-szám, irat típus (factura / bon / chitanță), dátum, kibocsátó, magyarázat, összeg.',
          },
          {
            text: 'A KARTOTEKA számolja a végösszeget és a különbséget az előlegtől. Print központon át nyomtatható vagy PDF-be menthető.',
          },
        ],
      },
    ],
  },

  // ============= 4. ÉV VÉGI ÉS HOSSZÚ TÁVÚ =============
  {
    key: 'ev-vegi',
    label: 'Év végi és hosszú távú',
    description: 'Költségvetés, számadás, tartozások',
    icon: Scale,
    topics: [
      {
        key: 'koltsegvetes',
        label: 'Költségvetés',
        icon: ScrollText,
        color: 'amber',
        shortDescription: 'Az éves terv — bevétel és kiadás',
        intro:
          'Évente egyszer kell elkészíteni az éves költségvetést — a presbiteri jegyzőkönyv mellékleteként megy.',
        whatItDoes:
          'Számadási cél kódonként megadható a tervezett bevétel és kiadás. A rendszer számolja az össz- és kategória-szintű egyenlegeket.',
        howItWorks: [
          {
            text: 'Évente max 3 módosítás vihető be (a presbitériumnak kell jóváhagynia).',
          },
          {
            text: 'Nyomtatás: Pénzügy fejléc → „Költségvetés nyomtatás".',
          },
        ],
      },
      {
        key: 'szamadas',
        label: 'Számadás',
        icon: ClipboardList,
        color: 'cyan',
        shortDescription: 'Az év végi pénzügyi zárás',
        intro:
          'A költségvetés (terv) és a tényleges teljesítés összehasonlítása — sortörést mutat, kategóriánként.',
        whatItDoes:
          'A bevételek és kiadások célonként összesítve, a tervhez viszonyítva. Év végén véglegesíthető.',
        howItWorks: [
          {
            text: 'Bármikor megnézheted az aktuális állást — nem kell várni az év végéig.',
          },
          {
            text: 'A véglegesítés után a számadás zárolódik — utána már csak a presbitérium engedélyével módosítható (újranyitási kérelem).',
          },
        ],
      },
      {
        key: 'tartozasok',
        label: 'Tartozások',
        icon: Coins,
        color: 'orange',
        shortDescription: 'Egyházfenntartói járulék és bérleti tartozások',
        intro:
          'Két típusú tartozás: egyrészt az egyházfenntartói járulék (személyenként, évente), másrészt a bérleti díj (szerződésenként, havonta).',
        whatItDoes:
          'A KARTOTEKA évente kiszámolja, ki mennyivel tartozik, és a befizetésekből automatikusan levonja.',
        howItWorks: [
          {
            text: 'Az éves járulék összege a Beállítások → Éves díjak menüben állítható be.',
          },
          {
            text: 'A „pótlás" jelzéssel beérkező befizetések egy korábbi évre számolódnak (nem a folyó évi befizetésbe).',
          },
        ],
      },
    ],
  },

  // ============= 5. SPECIÁLIS =============
  {
    key: 'specialis',
    label: 'Speciális',
    description: 'Monetár, Oblio ellenőrzés',
    icon: Sparkles,
    topics: [
      {
        key: 'monetar',
        label: 'Monetár',
        icon: CreditCard,
        color: 'slate',
        shortDescription: 'Készpénz fizikai ellenőrzése címletenként',
        intro:
          'Időnként a kasszában lévő készpénzt fizikailag meg kell számolni — ez a Monetár fül feladata.',
        whatItDoes:
          'Címletenként megadod, hány darab van (200, 100, 50, ... 1 RON, 50 báni, ...). A KARTOTEKA összegzi, és összeveti a könyv szerinti egyenleggel.',
        howItWorks: [
          {
            text: 'A számolás nem napi rutin — havonta vagy negyedévente érdemes.',
          },
          {
            text: 'Eltérés esetén: a tényleges és a könyv szerinti különbség szerepel — vissza kell ellenőrizni a befizetéseket / kiadásokat.',
          },
        ],
      },
      // ─── ÚJ (2026-04-18): Banki Excel import ───
      {
        key: 'bank-import',
        label: 'Banki Excel import (BCR)',
        icon: FileSpreadsheet,
        color: 'violet',
        shortDescription: 'Hónap végén a BCR-ből letöltött Excel automatikus feldolgozása',
        intro:
          'A BCR online bankból lehet letölteni egy Excel tranzakció-kivonatot (havi, negyedéves vagy éves). A KARTOTEKA automatikusan feldolgozza, és végigvezet a kategorizáláson.',
        whatItDoes:
          '4 lépéses wizard: fájl feltöltés + bankszámla választás → kategorizálás (income/expense/belső mozgás/kihagyás) → megerősítés → kész. A rendszer felismeri a már importált tranzakciókat, és kihagyja őket (duplikáció-védelem).',
        howItWorks: [
          {
            text: 'BCR online banking → Cont curent → Extras → Excel letöltés (pl. 2026 jan-dec időszakra).',
          },
          {
            text: 'Kartotéka → Pénzügy → Bank fül → „Excel import" gomb → fájl kiválasztás + célbankszámla.',
          },
          {
            text: 'A wizard mutatja, hogy a legutóbb importált tranzakció mikori volt — ennél régebbi sorok alapértelmezetten elrejtve.',
            hint: 'Így nem kell minden alkalommal végigmenned a már bevezetett tételeken.',
          },
          {
            text: 'Minden sornál eldöntöd: bevétel (zöld), kiadás (piros), belső mozgás (lila), vagy kihagyás. Belső mozgás esetén a Kasszába könyvelő ellenpárja is létrejön automatikusan.',
          },
          {
            text: 'A „Megerősítés" lépés után a sorok beíródnak. Az eredményben látod: X importálva, Y duplikátum kihagyva, Z hiba.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'A BCR Excel NEM tartalmazza a nyitó egyenleget — azt manuálisan kell megadni a bankszámla létrehozásakor vagy az év első importjakor.',
          },
        ],
      },
      // ─── ÚJ (2026-04-18): Anyagraktár ───
      {
        key: 'anyagraktar',
        label: 'Anyagraktár (a Leltár fülről)',
        icon: Inbox,
        color: 'emerald',
        shortDescription: 'Gyorsan fogyó készletek: nyugtatömb, papír, tisztítószer',
        intro:
          'A Leltár modul Anyagraktár fülén vezetjük a gyorsan fogyó készleteket (papír, tisztítószer, nyomtatópatron, nyugtatömb stb.) — a hivatalos Anyagraktárkönyv mintáját követve.',
        whatItDoes:
          'Minden anyagnak saját "oldala" van (mint az Excel-ben) — folyamatos mennyiség- és érték-egyenleggel. Bevétel = beszerzés vagy átvétel, Kiadás = felhasználás.',
        howItWorks: [
          {
            text: 'Leltár oldal → Anyagraktár fül → „+ Új anyag" — a hivatalos fejléc-adatok (név, mértékegység, egységár, kategória).',
          },
          {
            text: 'Minden anyag sorára kattintva megnyílik az „Anyagkönyv" dialog — ott a mozgások időrendben, folyamatos egyenleggel.',
          },
          {
            text: 'Bevétel: „+ Bevétel" gomb — dátum, mennyiség, érték (default: mennyiség × egységár), iratszám, magyarázat („kitől vettük be").',
          },
          {
            text: 'Kiadás: „+ Kiadás" — ugyanígy, „kinek adtuk ki" magyarázattal. A rendszer védi a negatív készletet.',
          },
          {
            text: 'Nyomtatható Anyagraktárkönyv: minden anyag külön oldalon, A4 fekvő, a hivatalos Word-minta szerint, Készítette / Ellenőrizte aláírási blokkokkal.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Az Anyagraktár záró értéke automatikusan része a Vagyonleltári jelentésnek (a leltár hero-jában összesítő sávban látszik).',
          },
        ],
      },
      {
        key: 'oblio',
        label: 'Oblio ellenőrzés',
        icon: Inbox,
        color: 'cyan',
        shortDescription: 'Beérkezett e-Factura számlák párosítása',
        intro:
          'A beszállítóktól érkező e-Factura számlák (Romániai SPV) helyi kezelése — letöltés, párosítás a kiadásokkal.',
        whatItDoes:
          'A felhasználó letölti az Oblio Wallet-ből a befogadott számlák ZIP-jét, beteszi a KARTOTEKA helyi mappájába, és a rendszer automatikusan párosítja a kiadásokkal.',
        howItWorks: [
          {
            text: 'Letöltés: Oblio Wallet (https://www.oblio.eu/report/wallet) → Setări → Import/Export → ZIP letöltés.',
          },
          {
            text: 'A ZIP-et bele a KARTOTEKA mappájába: `<root>/KARTOTEKA/<gyülekezet>/oblio-ellenorzes/befogadott/`',
          },
          {
            text: '„Frissítés a mappából" gomb → KARTOTEKA kibontja, párosítja az XML-eket a kiadásokkal CUI/név/összeg/dátum alapján.',
          },
          {
            text: 'A „Tartalom-elemzés indítása" gomb a PDF tartalmából is olvas (PDF.js) — ha a fájlnév-minta nem ad egyezést.',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'Az ANAF SPV csak 60 napra visszamenőleg engedi letölteni a számlákat — a csengőn kapsz 50/55/60 napos figyelmeztetést.',
          },
          {
            kind: 'tip',
            text: 'Ha egy XML-hez nincs még kiadás KARTOTEKA-ban, a wizard végigvezet a bevezetésen — kronológiai sorrendben.',
          },
        ],
      },
    ],
  },
]

// ─────────────────────────────────────────────────────────────
// Színpaletta
// ─────────────────────────────────────────────────────────────

const PALETTE: Record<
  ColorKey,
  { ring: string; bg: string; text: string; gradient: string; border: string; bgLight: string }
> = {
  blue: {
    ring: 'ring-blue-200',
    bg: 'bg-blue-50',
    bgLight: 'bg-blue-50/30',
    text: 'text-blue-700',
    gradient: 'from-blue-500 to-indigo-600',
    border: 'border-blue-200',
  },
  emerald: {
    ring: 'ring-emerald-200',
    bg: 'bg-emerald-50',
    bgLight: 'bg-emerald-50/30',
    text: 'text-emerald-700',
    gradient: 'from-emerald-500 to-green-600',
    border: 'border-emerald-200',
  },
  violet: {
    ring: 'ring-violet-200',
    bg: 'bg-violet-50',
    bgLight: 'bg-violet-50/30',
    text: 'text-violet-700',
    gradient: 'from-violet-500 to-purple-600',
    border: 'border-violet-200',
  },
  pink: {
    ring: 'ring-pink-200',
    bg: 'bg-pink-50',
    bgLight: 'bg-pink-50/30',
    text: 'text-pink-700',
    gradient: 'from-pink-500 to-rose-600',
    border: 'border-pink-200',
  },
  amber: {
    ring: 'ring-amber-200',
    bg: 'bg-amber-50',
    bgLight: 'bg-amber-50/30',
    text: 'text-amber-700',
    gradient: 'from-amber-500 to-orange-600',
    border: 'border-amber-200',
  },
  cyan: {
    ring: 'ring-cyan-200',
    bg: 'bg-cyan-50',
    bgLight: 'bg-cyan-50/30',
    text: 'text-cyan-700',
    gradient: 'from-cyan-500 to-teal-600',
    border: 'border-cyan-200',
  },
  orange: {
    ring: 'ring-orange-200',
    bg: 'bg-orange-50',
    bgLight: 'bg-orange-50/30',
    text: 'text-orange-700',
    gradient: 'from-orange-500 to-red-600',
    border: 'border-orange-200',
  },
  slate: {
    ring: 'ring-slate-200',
    bg: 'bg-slate-50',
    bgLight: 'bg-slate-50/30',
    text: 'text-slate-700',
    gradient: 'from-slate-500 to-slate-700',
    border: 'border-slate-200',
  },
  rose: {
    ring: 'ring-rose-200',
    bg: 'bg-rose-50',
    bgLight: 'bg-rose-50/30',
    text: 'text-rose-700',
    gradient: 'from-rose-500 to-pink-600',
    border: 'border-rose-200',
  },
  teal: {
    ring: 'ring-teal-200',
    bg: 'bg-teal-50',
    bgLight: 'bg-teal-50/30',
    text: 'text-teal-700',
    gradient: 'from-teal-500 to-cyan-600',
    border: 'border-teal-200',
  },
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface FinanceSugoTabProps {
  /**
   * Print callback: a kiválasztott topic adatait átadja a wrapper-nek,
   * aki a HTML-t építi és a böngészőnyomtatót hívja.
   * Web: html2pdf.js iframe + window.print().
   * Desktop: WebView2 native print.
   * iOS (jövőben): UIPrintInteractionController.
   */
  onPrintTopicToBrowser?: (topicData: FinanceSugoTopicPdfData) => Promise<void>

  /**
   * Print callback: a kiválasztott topic adatait átadja a wrapper-nek,
   * aki a HTML-t építi és a PDF-fájlba menti.
   * Web: html2pdf.js .save().
   * Desktop: Tauri print plugin → file dialog.
   * iOS (jövőben): UIDocumentInteractionController.
   */
  onPrintTopicToPdf?: (
    topicData: FinanceSugoTopicPdfData,
    filename: string,
  ) => Promise<void>

  /** UI-feedback (sonner / Tauri toast / iOS native banner). */
  onToast?: (message: string, kind: FinanceSugoToastKind) => void

  /**
   * Belső véglegesítés-link a checklist banner-en („Véglegesítés indítása").
   * Web: `/penzugy?tab=accounting`. Desktop: pl. `/penzugy/szamadas`.
   * Ha nincs megadva, a banner csak szöveges (link nélkül).
   */
  finalizeHref?: string
}

// ─────────────────────────────────────────────────────────────
// Fő komponens
// ─────────────────────────────────────────────────────────────

export function FinanceSugoTab({
  onPrintTopicToBrowser,
  onPrintTopicToPdf,
  onToast,
  finalizeHref,
}: FinanceSugoTabProps = {}) {
  const [activeTopicKey, setActiveTopicKey] = useState<string>(SECTIONS[0].topics[0].key)
  const [printing, setPrinting] = useState<'preview' | 'pdf' | null>(null)

  const allTopics = SECTIONS.flatMap((s) => s.topics.map((t) => ({ ...t, sectionKey: s.key })))
  const activeTopic = allTopics.find((t) => t.key === activeTopicKey) || allTopics[0]
  const palette = PALETTE[activeTopic.color]
  const activeSectionLabel = SECTIONS.find((s) => s.key === activeTopic.sectionKey)?.label

  async function handlePrintTopic(mode: 'preview' | 'pdf') {
    setPrinting(mode)
    try {
      const topicData: FinanceSugoTopicPdfData = {
        label: activeTopic.label,
        intro: activeTopic.intro,
        whatItDoes: activeTopic.whatItDoes,
        howItWorks: activeTopic.howItWorks,
        tips: activeTopic.tips,
        examples: activeTopic.examples,
        sectionLabel: activeSectionLabel,
      }
      if (mode === 'pdf') {
        if (!onPrintTopicToPdf) {
          onToast?.('A PDF letöltés nem érhető el ezen a felületen.', 'warning')
          return
        }
        const filename = `Sugo_${activeTopic.label.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
        await onPrintTopicToPdf(topicData, filename)
        onToast?.('PDF letöltve.', 'success')
      } else {
        if (!onPrintTopicToBrowser) {
          onToast?.('A nyomtatás nem érhető el ezen a felületen.', 'warning')
          return
        }
        await onPrintTopicToBrowser(topicData)
      }
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'A nyomtatás nem sikerült.', 'error')
    } finally {
      setPrinting(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* HERO */}
      <div className="card-raised p-5 sm:p-6 bg-gradient-to-br from-teal-50/40 to-cyan-50/30 border border-teal-100">
        <div className="flex items-start gap-4">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md">
            <HelpCircle className="size-7" />
          </span>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">
              Pénzügy modul
            </p>
            <h2 className="font-heading text-2xl sm:text-3xl text-slate-800">
              Súgó és magyarázat
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600 max-w-3xl">
              Itt megtalálod minden funkció lelkészbarát magyarázatát — kategorizálva,
              lépésről-lépésre, tippekkel és példákkal. Bal oldalon böngéssz a témák között,
              jobbra olvasd a részleteket.
            </p>
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ───── BAL: KATEGÓRIÁK ÉS TÉMÁK ───── */}
        <div className="space-y-3 self-start">
          {SECTIONS.map((section) => (
            <div key={section.key} className="card-raised p-3">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="inline-flex size-6 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                  <section.icon className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    {section.label}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">{section.description}</p>
                </div>
              </div>
              <div className="space-y-0.5">
                {section.topics.map((topic) => {
                  const Icon = topic.icon
                  const cp = PALETTE[topic.color]
                  const isActive = topic.key === activeTopicKey
                  return (
                    <button
                      key={topic.key}
                      type="button"
                      onClick={() => setActiveTopicKey(topic.key)}
                      className={`w-full flex items-start gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-all ${
                        isActive
                          ? `${cp.bg} ${cp.text} font-semibold ring-1 ${cp.ring}`
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg ${
                          isActive
                            ? `bg-gradient-to-br ${cp.gradient} text-white shadow-sm`
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block leading-tight">{topic.label}</span>
                        <span className="block text-[10px] font-normal text-slate-400 mt-0.5 truncate">
                          {topic.shortDescription}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ───── JOBB: AKTUÁLIS TÉMA ───── */}
        <div className="space-y-4">
          {/* Cím-kártya — nyomtatási ikonokkal */}
          <div className={`card-raised border ${palette.border} ${palette.bgLight} p-5 sm:p-6`}>
            <div className="flex items-start gap-3">
              <span
                className={`inline-flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br ${palette.gradient} text-white shadow-md shrink-0`}
              >
                <activeTopic.icon className="size-6" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-heading text-2xl text-slate-800">{activeTopic.label}</h3>
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handlePrintTopic('preview')}
                      disabled={printing !== null}
                      title="Nyomtatás (böngészőben)"
                      className={`inline-flex items-center justify-center rounded-lg border ${palette.border} bg-white p-2 ${palette.text} hover:${palette.bg} transition-colors disabled:opacity-50`}
                    >
                      <Printer className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrintTopic('pdf')}
                      disabled={printing !== null}
                      title="PDF letöltés"
                      className={`inline-flex items-center justify-center rounded-lg bg-gradient-to-br ${palette.gradient} text-white px-3 py-2 text-xs font-medium shadow-sm hover:shadow-md transition-all disabled:opacity-50`}
                    >
                      {printing === 'pdf' ? '...' : 'PDF'}
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mt-1 leading-6">{activeTopic.intro}</p>
              </div>
            </div>
          </div>

          {/* Mire jó kártya */}
          <CardSection palette={palette} title="Mire jó?" icon={<Lightbulb className="size-4" />}>
            <p className="text-sm leading-7 text-slate-700">{activeTopic.whatItDoes}</p>
          </CardSection>

          {/* Hogyan működik kártya */}
          {activeTopic.howItWorks && activeTopic.howItWorks.length > 0 && (
            <CardSection
              palette={palette}
              title="Hogyan működik"
              icon={<Repeat className="size-4" />}
            >
              <ol className="space-y-3">
                {activeTopic.howItWorks.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${palette.gradient} text-white text-xs font-bold mt-0.5`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm leading-6 text-slate-700">{step.text}</p>
                      {step.hint && (
                        <p
                          className={`mt-1 text-xs leading-5 ${palette.text} flex items-start gap-1`}
                        >
                          <Sparkles className="size-3 shrink-0 mt-0.5" />
                          <span>{step.hint}</span>
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </CardSection>
          )}

          {/* Tippek és figyelmeztetések */}
          {activeTopic.tips && activeTopic.tips.length > 0 && (
            <div className="space-y-2">
              {activeTopic.tips.map((tip, i) => (
                <div
                  key={i}
                  className={`card-raised border p-4 flex items-start gap-3 ${
                    tip.kind === 'warning'
                      ? 'border-amber-200 bg-amber-50/50'
                      : `${palette.border} ${palette.bgLight}`
                  }`}
                >
                  <span
                    className={`inline-flex size-8 shrink-0 items-center justify-center rounded-xl ${
                      tip.kind === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : `${palette.bg} ${palette.text}`
                    }`}
                  >
                    {tip.kind === 'warning' ? (
                      <AlertCircle className="size-4" />
                    ) : (
                      <Lightbulb className="size-4" />
                    )}
                  </span>
                  <div className="flex-1">
                    <p
                      className={`text-xs uppercase tracking-wide font-bold mb-1 ${
                        tip.kind === 'warning' ? 'text-amber-700' : palette.text
                      }`}
                    >
                      {tip.kind === 'warning' ? 'Figyelmeztetés' : 'Tipp'}
                    </p>
                    <p className="text-sm leading-6 text-slate-700">{tip.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Példák */}
          {activeTopic.examples && activeTopic.examples.length > 0 && (
            <CardSection
              palette={palette}
              title="Példák"
              icon={<FileSpreadsheet className="size-4" />}
            >
              <div className="space-y-3">
                {activeTopic.examples.map((ex, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs uppercase tracking-wide font-bold text-slate-500 mb-1">
                      Helyzet
                    </p>
                    <p className="text-sm text-slate-700 italic">&bdquo;{ex.situation}&rdquo;</p>
                    <div className="my-2 h-px bg-slate-100" />
                    <p
                      className={`text-xs uppercase tracking-wide font-bold mb-1 ${palette.text}`}
                    >
                      Megoldás
                    </p>
                    <p className="text-sm text-slate-700">{ex.solution}</p>
                  </div>
                ))}
              </div>
            </CardSection>
          )}

          {/* Lásd még — más témák ugyanezen szekcióból */}
          <div className="card-raised border border-slate-200 bg-slate-50/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
              <ArrowRight className="size-3.5" />
              Lásd még
            </p>
            <div className="flex flex-wrap gap-2">
              {allTopics
                .filter((t) => t.key !== activeTopicKey)
                .slice(0, 5)
                .map((t) => {
                  const cp = PALETTE[t.color]
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveTopicKey(t.key)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${cp.bg} ${cp.text} hover:opacity-80 transition-opacity`}
                    >
                      <t.icon className="size-3" />
                      {t.label}
                    </button>
                  )
                })}
            </div>
          </div>

          {/* Lábléc */}
          <div className="text-center text-xs text-slate-400 pt-2 pb-4">
            <Receipt className="inline size-3 mr-1" />
            KARTOTEKA · Egyházi pénzügyi nyilvántartó rendszer
            <span className="mx-2">·</span>
            <span>
              {allTopics.length} téma · {SECTIONS.length} kategória
            </span>
          </div>
        </div>
      </div>

      {/* ÉLŐ CHECKLIST — a súgó legvégén, teljes szélességben */}
      <FinanceSugoChecklist finalizeHref={finalizeHref} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Segéd-komponensek
// ─────────────────────────────────────────────────────────────

function CardSection({
  palette,
  title,
  icon,
  children,
}: {
  palette: (typeof PALETTE)['blue']
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div className="card-raised p-4 sm:p-5">
      <h4 className="font-heading text-base text-slate-800 mb-3 flex items-center gap-2">
        <span
          className={`inline-flex size-7 items-center justify-center rounded-lg ${palette.bg} ${palette.text}`}
        >
          {icon}
        </span>
        {title}
      </h4>
      {children}
    </div>
  )
}

// Eltávolítás-prevenció a használatlan import-okra:
void [PiggyBank, CheckCircle2]
