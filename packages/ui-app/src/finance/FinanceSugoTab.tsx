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
 * - Véglegesítés-link `finalizeHref` prop-on (web: `/penzugy#accounting`,
 *   desktop: `/penzugy/szamadas` vagy hasonló)
 *
 * 2026-07-10 (S3-sugo): új „Mi változott (2026. július)?" szekció (a lista elején,
 * ez a nyitó téma), + a júliusi „pénzügy nagytakarítás" változásai bedolgozva a
 * meglévő témákba is (Tétel rögzítése, Tranzakciók, Bank, Kassza, Költségvetés,
 * Számadás, Tartozások, Monetár, Oblio, Szűrés/export).
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

export type ColorKey =
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

export type Step = {
  text: string
  hint?: string
}

export type Topic = {
  key: string
  label: string
  icon: typeof BookOpen
  color: ColorKey
  /** Egy mondatos leírás — a kategória-listán látszik. */
  shortDescription: string
  /** Részletes intro — a tartalmi rész tetején. */
  intro: string
  /** „Mikor kell ez neked?" — egysoros élethelyzet (B2 súgó-felújítás, 2026-06-11). */
  whenNeeded?: string
  /** „Mire jó?" — a fő funkció leírása. */
  whatItDoes: string
  /** Folyamatábra: nyíllal kötött lépés-dobozok (B2). */
  flow?: Array<{ label: string; sub?: string }>
  /** Lépések — hogy működik a felhasználó számára. */
  howItWorks?: Step[]
  /** Tippek és figyelmeztetések. */
  tips?: Array<{ kind: 'tip' | 'warning'; text: string }>
  /** Gyakori hibák — piros kártyák, amik a tipikus tévedésektől óvnak (B2). */
  commonMistakes?: string[]
  /** Példák valós helyzetekre. */
  examples?: Array<{ situation: string; solution: string }>
}

export type Section = {
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
  // ============= 0. MI VÁLTOZOTT (2026. JÚLIUS)? =============
  // 2026-07-10 (S3-sugo): a júliusi „pénzügy nagytakarítás" (CHANGELOG 2026-07-10)
  // minden változása lelkészi nyelven. Szándékosan az ELSŐ szekció — amíg a hír
  // friss, a súgó megnyitásakor ez a téma fogadja a felhasználót.
  {
    key: 'mi-valtozott-2026-07',
    label: 'Mi változott?',
    description: 'A legutóbbi fejlesztések — röviden, érthetően',
    icon: Sparkles,
    topics: [
      // 2026-08-29 (súgó-átdolgozás): az augusztusi pénzügyi nagytakarítás
      // összefoglalója — a legfrissebb hír áll elöl.
      {
        key: 'valtozas-2026-08-nagytakaritas',
        label: '2026. augusztus: pénzügyi nagytakarítás',
        icon: Sparkles,
        color: 'teal',
        shortDescription: 'Átvilágítás utáni javítás-sorozat — pontosabb számok, hangos hibák, új funkciók',
        intro:
          'Augusztusban a teljes pénzügyi modult átvilágítottuk, és több körben minden talált hibát kijavítottunk. A legtöbb változást észre sem veszed — csak azt, hogy a számok mindenhol stimmelnek, és a rendszer szól, ha valami nem sikerült.',
        whenNeeded:
          'Nem kell tenned semmit — olvasd el, hogy tudd, mi lett jobb, és mi az a néhány új dolog, amit érdemes használnod.',
        whatItDoes:
          'Pontosabb egyenlegek és nyomtatványok, hangos hibajelzések a néma elakadások helyett, közös motor a webes és az asztali változatban, és új kényelmi funkciók.',
        howItWorks: [
          {
            text: 'Számlák egyeztetése új felülettel: az ANAF-ból letöltött ZIP-et egy oldalról kigördülő panelen töltöd fel, és minden számlán azonnal látszik, párosítva van-e a könyveléssel. A tárolt számla szép, nyomtatható formában nyílik meg.',
          },
          {
            text: 'A rendszer MEGJEGYZI a banki befizetőket: ha egy banki bevételhez egyszer kiválasztod, ki a befizető (tag vagy cég), a következő importnál már magától felajánlja. Az új „Adományozók és szponzorok" fülön az év minden adakozója és cégtámogatója egy helyen látszik.',
          },
          {
            text: 'A bank→bank átutalás mostantól rendesen KÖNYVELŐDIK is (kiadás a küldő, bevétel a fogadó számlán) — eddig csak a nyilvántartásba került, és a számlánkénti egyenleg nem látta.',
          },
          {
            text: 'Vége a fantom-hátraléknak: a járulék- és bérletidíj-számítás fillérre kerekít — egy rendezett tag többé nem látszik „0,00 lej tartozással" hátralékosnak.',
          },
          {
            text: 'A hibák nem némák többé: ha egy lista nem tölthető be, a rendszer hibát mutat (nem hamis üres listát); ha egy mentés részben nem sikerült, pontosan megmondja, mi maradt ki és mit tegyél.',
          },
          {
            text: 'Zárt év védelme mindenhol: véglegesített évbe se rögzíteni, se stornózni, se a Kukából visszaállítani nem lehet — feloldást az egyházmegyétől kérhetsz.',
          },
          {
            text: 'A kiadás átvevője mostantól kötelező, és a rendszer mentéskor a foglalt iratszámra is figyelmeztet — így a hivatalos kísérőív mindig kitölthető, és nem születik két azonos számú bizonylat.',
          },
          {
            text: 'A törölt pénzügyi tételek 5 ÉVIG maradnak a Kukában (a többi modul 30 napja helyett), és minden módosításról-törlésről belső napló készül — a bizonylat-megőrzés szabályai szerint.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Ha valamelyik új funkcióról többet szeretnél tudni, a súgó megfelelő témájánál részletes leírást találsz — pl. a „Hivatalos szabályok 2026" szekcióban a készpénz-korlátokról.',
          },
        ],
      },
      {
        key: 'valtozas-pontos-szamok',
        label: 'Pontosabb egyenlegek és számadás',
        icon: Scale,
        color: 'cyan',
        shortDescription: 'Belső mozgás, nyitó egyenlegek, deviza — a számok mindenhol stimmelnek',
        intro:
          'A júliusi frissítés legfontosabb része: a kassza, a bank és a számadás számai mostantól mindenhol ugyanazt — és a valóságot — mutatják, pontosan úgy, ahogy a hivatalos egyházkerületi nyomtatványon szerepelnek.',
        whenNeeded:
          'Nem kell tenned semmit — ezek maguktól működnek. Olvasd el, hogy tudd, mi miért néz ki mostantól másképp.',
        whatItDoes:
          'A belső mozgások (készpénz a bankba és vissza) helyes kezelése, automatikus nyitó egyenlegek, helyesen számolt záró egyenleg, és napi árfolyamos deviza-átszámítás.',
        howItWorks: [
          {
            text: 'A „Belső mozgás" sorok eltűntek a Számadásból és a Költségvetésből — a pénz kasszából bankba tétele (vagy onnan felvétele) nem bevétel és nem kiadás, ezért a hivatalos nyomtatványon sosem szerepelt tételként. Mostantól a képernyő is pontosan azt mutatja, amit a nyomtatvány.',
          },
          {
            text: 'A belső mozgás rögzítése azonnal átvezet a kasszán ÉS a bankon (kettős könyvelés) — az egyenlegek mindig helyesek, és a tétel a helyzetnek megfelelő nevet kapja: „Készpénzletétel a(z) … számlára", illetve „Készpénzfelvétel a(z) … számláról".',
            hint: 'Korábban a felületről rögzített banki letétel „elveszett" — a kassza és a bank egyenlege nem változott. Ez javítva.',
          },
          {
            text: 'A nyitó egyenlegek automatikusan megjelennek a Költségvetés és a Számadás fül tetején — a táblázat első 1–3. sora (Múlt évi pénztármaradvány / Készpénz / Bank) magától kitöltődik az előző évi záróból, nem kell kézzel beírni.',
          },
          {
            text: 'Az előző évi tényszámok halványan (szürkén) látszanak tételenként a költségvetés tervezésénél és a számadásban — üres mezőnél előre beírt javaslatként, amit gépeléskor egyszerűen felülírsz.',
          },
          {
            text: 'A Számadás nyomtatványán megjelent a hivatalos nyitó 3 sor, és a záró egyenleg mostantól helyesen számolódik: nyitó + évi bevételek − évi kiadások. (Korábban tévesen a nyitó összeg szerepelt „év végi" egyenlegként.)',
          },
          {
            // 2026-07-25 (G3-sugo)
            text: 'Évi pénzügyi kép a Számadás fül tetején: az évi bevétel és kiadás mellett nagyban látszik a pénztári (Casa), a banki (Banca) és az együttes egyenleg — a Kassza és a Bank füllel azonos számítással.',
          },
          {
            text: 'Az Excel-exportban a „Várakozik banki egyeztetésre" felirat a VALÓS állapotot mutatja — amint a banki pár beérkezett és párosodott, a felirat eltűnik. A párosítás-figyelő is pontosabb: csak valódi kassza↔bank párokat fogad el.',
          },
          {
            text: 'Devizás bankszámla (pl. EUR) importja mostantól minden tranzakciót az ADOTT NAPI hivatalos BNR árfolyammal számít át lejre — eddig egyetlen éves árfolyam ment mindenre. Ha egy napra nem érhető el árfolyam, a rendszer jelzi.',
          },
          {
            text: 'Az asztali (offline) verzió bevétel/kiadás összesítői is pontosabbak — a belső mozgások ott sem számítanak bele a totálokba.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Mindez automatikus — semmit nem kell átállítanod. Ha mégis eltérést látsz egy egyenlegnél, először a párosítatlan belső mozgásokat érdemes megnézni.',
          },
        ],
      },
      {
        key: 'valtozas-atlathatobb-felulet',
        label: 'Átláthatóbb felület',
        icon: Eye,
        color: 'blue',
        shortDescription: 'Év-választó, új oszlopok, jobb nyomtatás — hol mit találsz mostantól',
        intro:
          'Több apró, de a mindennapi munkát könnyítő változás történt a felületen — itt találod, mi hova került.',
        whenNeeded:
          'Ha valamit „nem találsz a régi helyén", vagy új oszlopot, feliratot látsz — itt a magyarázat.',
        whatItDoes:
          'Új helyre került az év-választó, átláthatóbb lett a Tranzakciók és a Kassza fül, szebbek a nyomtatványok, és több apró bosszúság megszűnt.',
        howItWorks: [
          {
            text: 'Év-választó új helyen: a Pénzügy oldalon bal oldalt, közvetlenül a cím alatt találod a „Költségvetési év" vezérlőt — a ◄ ► nyilakkal léptethetsz, a nagy évszám mindig mutatja, melyik évet nézed. Minden fül (Kassza, Bank, Számadás…) ehhez az évhez igazodik.',
            hint: 'Korábban ez egy kis címkének nézett ki, és könnyen elveszett — most nem téveszthető össze semmivel.',
          },
          {
            text: 'Tranzakciók fül: külön Bevétel és Kiadás oszlop (mint a Kassza fülön), és minden sornál látszik, hogy készpénzes vagy banki a tétel — banki tételnél a bankszámla nevével.',
          },
          {
            text: 'Kassza fül: a gyülekezet saját iratszáma került előre (a kerületi szám kisebb betűvel alatta), és az Excel-export mindig időrendben készül (év elejétől év végéig), akárhogy is rendezted a képernyőn a listát.',
          },
          {
            text: 'Kiadási kísérőív: az előnézet a teljes lapot mutatja görgetés nélkül — pontosan úgy, ahogy nyomtatásban kinéz. A felirata mostantól „Registrul-Jurnal", mert a bizonylaton banki tételek is szerepelnek, így a korábbi „Kasszakönyv" felirat félrevezető volt.',
          },
          {
            text: 'Nyomtatási központ: a nyomtatványok a hivatalos román megnevezésekkel készülnek, és a regiszterek egyszerűsödtek — könnyebb megtalálni, melyiket kell leadni.',
          },
          {
            text: 'Tartozások fül: év szerinti áttekintés — az év-választóval visszalapozva évente látod, ki mennyivel maradt el.',
          },
          {
            text: 'Monetár fül: a belső mozgások (pl. valutaváltás) mostantól törölhetők, ha tévedésből kerültek be — eddig ezt nem engedte a rendszer.',
          },
          {
            text: 'Oblio ellenőrzés: a „Mappa beállítása" gomb most már tényleg megnyitja a mappa-választót, és a rendszer megjegyzi a kiválasztott KARTOTEKA mappát (Chrome vagy Edge böngésző szükséges).',
          },
          {
            // 2026-07-25 (G2-sugo): fejléc mega menü + profilváltó
            text: 'Fejléc-menü (a jobb felső avatár): széles, kategorizált menü nyílik — „Fiók" és „Gyülekezet" csoportokkal. A bal felső gyülekezet-csempére kattintva ugyanez a menü nyílik. Több szerepkör esetén a profilváltó csoportosítva (gyülekezet / egyházmegye / egyházkerület / rendszer) jelenik meg, öt szerep felett keresővel — és a váltás is gyorsabb lett.',
          },
        ],
      },
      {
        key: 'valtozas-nyugtak-bekuldes',
        label: 'Nyugták, rögzítés és beküldés',
        icon: Receipt,
        color: 'emerald',
        shortDescription: 'Nyugtafigyelő évhatáron át, rugalmasabb pótlás, biztonságosabb beküldés',
        intro:
          'A nyugták követése és az egyházmegyei beküldés is megbízhatóbb lett — és a tétel-rögzítés néhány kényelmi funkcióval bővült.',
        whenNeeded:
          'Év elején elmaradt nyugtákat kell pótolnod, vagy készülsz a számadás beküldésére.',
        whatItDoes:
          'A Nyugtafigyelő átlép az évhatáron, az elmaradt nyugták a Decont-tal pótolhatók, a beküldés pedig „zár először" sorrendben történik.',
        howItWorks: [
          {
            text: 'Nyugtafigyelő évhatáron át: mivel a nyugták sorszáma évek között folytatódik, az ellenőrzés a következő év első nyugtájáig néz — így az év végén „elveszett" sorszámok is előkerülnek, hamis riasztás nélkül, és az elmaradt nyugtákat a figyelő áthozza az új évbe.',
          },
          {
            text: 'Elmaradt nyugták pótlása: a hiányzó nyugtákat a bevételi elszámolással (Decont de încasări) pótolhatod — nyugtánként külön jogcím választható (nem kell mindennek adománynak lennie), befizetőként család is megadható, a kereső gyorsabb és pontosabb, a tag-hozzárendelés pedig továbbra sem kötelező.',
          },
          {
            text: 'Tétel rögzítése: a „+ Tétel rögzítése" ablakban bevételt ÉS kiadást egyszerre rögzíthetsz (két fül, egy közös mentés), egy nyugtára több befizetőt is felvihetsz (család kiválasztásával vagy vesszős felsorolással), egyházfenntartásnál pedig a rendszer felajánlja az ajánlott összeget — a befizető kedvezményeit (kor, jövedelem, felmentés) is figyelembe véve.',
          },
          {
            text: 'Beküldés az egyházmegyének: a rendszer előbb véglegesíti (lezárja) az évet, és csak utána küldi be — így nem fordulhat elő, hogy a beküldött és a helyben látott számok eltérnek. A dokumentum mindig a gyülekezeted saját egyházmegyéjéhez kerül.',
          },
          {
            text: 'Mit jelent a véglegesítés? A lezárt évbe új tétel nem rögzíthető, és a meglévők nem módosíthatók, nem stornózhatók — a számadás „be van fagyasztva". Újranyitni csak engedéllyel (újranyitási kérelemmel) lehet.',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'Véglegesítés előtt fusd át a Számadás fület: függő sztornók és párosítatlan belső mozgások ne maradjanak — lezárás után már nem tudod javítani őket.',
          },
        ],
      },
      {
        // 2026-07-24 (F5-sugo): a július végi pénzügy-finomhangolás (v0.9.86–0.9.105)
        key: 'valtozas-jarulek-nyitok',
        label: 'Járulék, kedvezmények, induló egyenlegek',
        icon: Coins,
        color: 'amber',
        shortDescription:
          'Pontos tartozás-számítás, családi befizetés-felosztás, nyugta-előnézet, induló egyenlegek',
        intro:
          'A július végi frissítés-sorozat középpontjában a járulék-tartozások PONTOS számítása áll — emellett megújult a nyugta- és kísérőív-nyomtatás, és megadhatók a rendszerindításkori induló egyenlegek.',
        whenNeeded:
          'A Tartozások fülön más számokat látsz, mint korábban — itt a magyarázat, miért az újak a pontosak. Illetve ha most kezded a rendszert használni, és meg kell adnod a kassza/bank induló egyenlegét.',
        whatItDoes:
          'Javított tartozás-számítás (a befizetések tényleg beszámítódnak, a családi befizetés tagonként osztódik), rugalmasabb kedvezmények, nyugta-előnézet vízjellel és címerrel, kísérőív forrás-választóval, és induló egyenlegek felvitele.',
        howItWorks: [
          {
            text: 'Tartozás-számítás javítva: a befizetések mostantól biztosan beszámítódnak a Tartozások fülön (korábban egy rejtett technikai hiba miatt előfordulhatott, hogy MINDEN befizetés figyelmen kívül maradt, és mindenki tartozónak látszott), a sztornózott tétel nem számít fizetettnek, és a Beállításokban megadott évi díjat minden képernyő ugyanúgy használja.',
          },
          {
            text: 'Családi befizetés felosztása: a család nevére rögzített befizetés mostantól a család tagjai közt osztódik szét — ki-ki a saját évi összegéig. A saját névre szóló befizetés (a többlettel együtt) mindig a befizetőnél marad. A részletes szabályokat a „Tartozások" témában találod.',
          },
          {
            text: 'Egységes számítási mód: a „Tartozás-számítási mód" választó megszűnt — a rendszer mindig az adott tartozás-év beállításai szerint számol („akkori" mód). Így egy régi év tartozása nem változik meg attól, hogy idén más a díj.',
          },
          {
            text: 'Kedvezmények: a kor-kedvezmény a kezelőben is megadható fix összegként (nem csak százalékként) — pl. „70 év felett fizetendő 60 RON". A rendszer emellett kiszűri a hibás beállításokat: 0 lejes időszaki szabály és érvénytelen hónap-nap (pl. „13-01") nem menthető.',
          },
          {
            text: 'Nyugta-nyomtatás: nyomtatás előtt előnézet nyílik; a „MÁSOLAT" vízjel alapból rajta van, de a kis X-szel levehető; a fejlécben az egyházkerület címere szerepel, és a nyugtán mindig látszik, melyik ÉVRE szól a befizetés.',
          },
          {
            text: 'Kiadási kísérőív: a jogcímek NÉVVEL szerepelnek (magyarul és románul, nem kóddal); az aláírók az utolsó lap aljára kerültek; és forrás-választóval készíthető — az összes tétel, csak a kassza, vagy egy-egy bankszámla — mindegyik forrásnak saját, év elejétől futó oldalszámozásával.',
          },
          {
            text: 'Induló (nyitó) egyenlegek: ha a KARTOTEKA egy már működő könyvelést vesz át, a kezdő költségvetési év induló egyenlegei megadhatók — a Kassza fülön a „Nyitó egyenlegek" gombbal, a Bank fülön a bankszámla-kártyáról, vagy a gyülekezeti beállítás-varázsló Pénzügy lapján. Ezt csak egyszer, a rendszer indulásakor kell megtenni; a következő évek nyitói már maguktól számolódnak.',
          },
          {
            // 2026-07-25 (G1-sugo)
            text: 'Kedvezmények egyszerűbben: a „Sorrend" mező megszűnt — a rendszer mindig automatikusan a tagnak legkedvezőbb szabályt alkalmazza. A kedvezményes időszakok egy év-idővonalon látszanak (melyik szakaszban mennyi a fizetendő, hol él a teljes éves díj), és a lépcsőzetes korai-fizetési kedvezmény egyetlen menetben, több sorban rögzíthető.',
          },
          {
            // 2026-07-25 (G5-sugo)
            text: 'Nyitó egyenleg csak EGYSZER: az induló egyenleget elég a rendszer indulásakor megadni — utána minden év nyitója automatikusan az előző év zárójából jön (a bankszámla-kártyán „automatikusan az előző évi záróból" felirattal), számlánként külön. Ha utólag rögzítesz egy régebbi évbe, a következő évek nyitója magától követi. A kézzel megadott nyitót a rendszer soha nem írja felül, és a levezetett értéket nem is menti el — így a lezárt évek adatai érintetlenek maradnak.',
          },
          {
            // 2026-07-25 (G4-sugo)
            text: 'Nyugtatömb-készlet a valóság szerint: a Leltár → Anyagraktár és a Kassza fül tömb-paneljén a készlet mostantól a berögzített kerületi nyugtaszámokból számolódik — nem marad többé tévesen „100/100". A stornózott és az anulált (0 lejes) nyugta is elhasznált lapnak számít.',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'Ha a Tartozások fülön váratlan számot látsz, először a Beállítások → Éves díjak és a kedvezmény-szabályok (kor, felmentés) beállítását ellenőrizd — a lista csak akkor pontos, ha ezek a valóságot tükrözik.',
          },
          {
            kind: 'tip',
            text: 'Az induló egyenlegek megadása után a Registru Banca és a Számadás nyomtatványok is a helyes nyitóval számolnak — évváltásnál a rendszer a megfelelő évi nyitót használja.',
          },
        ],
      },
    ],
  },

  // ============= 1. ALAPOK =============
  {
    key: 'alapok',
    label: 'Alapok',
    description: 'Az első lépések — mi a pénzügy modul szerkezete',
    icon: BookOpen,
    topics: [
      // 2026-08-29 (Endre kérése): lépésről lépésre, könyveléshez nem értőknek
      // is — MIELŐTT a felület részleteibe mennénk, a MŰKÖDÉS maga.
      {
        key: 'hogyan-mukodik',
        label: 'Hogyan működik a könyvelés? (kezdőknek)',
        icon: Lightbulb,
        color: 'emerald',
        shortDescription: 'A pénz útja a gyülekezetben — egyszerűen, könyvelési előismeret nélkül',
        intro:
          'Ha még sosem könyveltél, kezdd itt. A gyülekezeti könyvelés valójában egyetlen egyszerű kérdésre válaszol minden nap: honnan jött pénz, hová ment pénz, és mennyi van most? A KARTOTEKA ezt a három kérdést tartja rendben helyetted.',
        whenNeeded: 'Amikor először ülsz le a Pénzügy modul elé — vagy amikor el akarod magyarázni valakinek, mi történik itt.',
        whatItDoes:
          'Elmagyarázza a négy alapfogalmat (kassza, bank, bevétel, kiadás), és azt, hogy mi történik a háttérben, amikor megnyomod a Mentés gombot.',
        flow: [
          { label: 'Pénz érkezik vagy megy', sub: 'persely, járulék, számla, átutalás' },
          { label: 'Rögzíted a tételt', sub: '+ Tétel rögzítése / bank-import' },
          { label: 'A rendszer könyvel', sub: 'iratszám, egyenleg, nyomtatvány' },
          { label: 'Te ellenőrzöl és nyomtatsz', sub: 'havi kasszakönyv, év végi számadás' },
        ],
        howItWorks: [
          {
            text: 'A gyülekezet pénze KÉT helyen lehet: a KASSZÁBAN (a fizikai készpénz — persely, nyugtás befizetések) és a BANKBAN (a számlákon lévő pénz). A kettőt a rendszer mindig külön tartja számon, mert a hivatalos nyomtatványok is külön kérik.',
          },
          {
            text: 'Minden pénzmozgás vagy BEVÉTEL (pénz jön be: járulék, persely, adomány, bérleti díj), vagy KIADÁS (pénz megy ki: fizetés, villanyszámla, javítás), vagy BELSŐ MOZGÁS (a pénz csak helyet vált: a kasszából a bankba teszed vagy fordítva — ez se nem bevétel, se nem kiadás).',
            hint: 'A belső mozgástól az összes pénz nem változik — ezért a Számadásban sosem szerepel tételként.',
          },
          {
            text: 'Minden tételnek van KÖNYVELÉSI CÉLJA (egy hivatalos kód, pl. 101.01 = egyházfenntartói járulék, 201.03 = villany-víz-gáz). Ez mondja meg, a Számadás melyik sorába számít bele. A rögzítőben csak kiválasztod a listából — a kódot a rendszer kezeli.',
          },
          {
            text: 'Amikor a Mentés gombra kattintasz, a rendszer több dolgot tesz egyszerre: iratszámot ad a tételnek (vagy ellenőrzi, hogy a beírt szám szabad-e), frissíti a kassza vagy a bank egyenlegét, hozzáadja a tételt a Számadás megfelelő sorához — az asztali változat pedig a hivatalos Excel-főkönyvbe is beírja.',
          },
          {
            text: 'A papír a végén készül: a hónap végén kinyomtatod a havi kasszakönyvet, év végén a Számadást és a többi hivatalos ívet — mindezt a Nyomtatási központból, a rendszer által számolt számokkal. Kézzel semmit nem kell összeadnod.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Aranyszabály: MINDEN pénzmozgást rögzíts, amikor megtörténik — a naprakész könyvelés tíz perc naponta; az elmaradt könyvelés pótlása egy hétvége.',
          },
          {
            kind: 'tip',
            text: 'Ha nem tudod, melyik könyvelési célra tartozik egy tétel, nézd meg a „Hivatalos szabályok 2026" szekció „Gyakori könyvelési tévedések" témáját — a leggyakoribb eseteket ott találod.',
          },
          {
            kind: 'warning',
            text: 'Sosem kell semmit kézzel kiszámolnod vagy átmásolnod — ha valahol mégis eltérést látsz két szám között, az hibajelzés: nézd meg a Súgó megfelelő témáját, vagy jelezd a rendszergazdának.',
          },
        ],
        examples: [
          {
            situation: 'Vasárnap 350 lej gyűlt a perselybe.',
            solution:
              'A persely felbontásáról jegyzőkönyv készül (két aláíróval), majd: + Tétel rögzítése → zöld (bevétel) fül → cél: persely, összeg: 350, bizonylat: Chitanță. A pénz a kasszába kerül — a rendszer a kassza-egyenleget növeli.',
          },
          {
            situation: 'A kasszában már 4 000 lej van, ebből 3 000-et beteszel a bankba.',
            solution:
              'Ez BELSŐ MOZGÁS: + Tétel rögzítése → a kategória-listából a „Készpénzletétel a bankba" sort választod, kijelölöd a bankszámlát. A kassza csökken, a bank nő — a Számadás összegei nem változnak.',
          },
        ],
      },
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
        shortDescription: 'Mi mire való a Pénzügy fülek közül — és mi költözött máshová',
        intro:
          'Ez a térkép segít, hogy melyik fület mikor használd. Két korábbi fül (Monetár, Oblio) már nem fül: a Monetár lebegő ablakként, az Oblio-ellenőrzés a Számlák egyeztetése felől nyílik.',
        whatItDoes:
          'A balról jobbra haladó sorrend a leggyakoribbtól a legritkábbig — kezdve az áttekintéssel, végül a súgóval.',
        howItWorks: [
          { text: '🔵 Áttekintés — napi pillantás, KPI-k, legutóbbi mozgások' },
          { text: '🟢 Kassza — készpénzes mozgások, nyugta-kiállítás' },
          { text: '🟣 Bank — banki mozgások, kivonat-import, FX átértékelés' },
          { text: '🌸 Tranzakciók — minden bevétel és kiadás egy listában, hónaponként' },
          { text: '🟡 Költségvetés — éves terv és módosítások (max 3 / év)' },
          { text: '🔵 Számadás — terv ↔ tényleges összevetés, év végi zárás' },
          { text: '🟠 Tartozások — kik nincsenek naprakész a járulékkal' },
          { text: '🟡 Bérleti szerződések — földek, épületek bérbeadása + e-Factura' },
          {
            text: '💜 Adományozók és szponzorok — az év adakozói és cégtámogatói egy helyen (2026. augusztus óta)',
          },
          { text: '🟢 Súgó — ez itt' },
          {
            text: '⚪ Monetár — a készpénz címletenkénti megszámolása. Nem fül: a Kassza fül lebegő „Monetár" gombja nyitja, kis ablakban.',
          },
          {
            text: '🔵 Számlák egyeztetése — az ANAF-ból letöltött e-Factura számlák feltöltése és párosítása a könyveléssel. A Pénzügy fejlécéből oldalsó panelként gördül ki (a teljes oldal a Dokumentumtárból is elérhető).',
          },
        ],
      },
      {
        key: 'hero-gombok',
        label: 'A fejléc gombjai',
        icon: Sparkles,
        color: 'amber',
        shortDescription: 'A fő műveletek, amik minden fülön elérhetők',
        intro:
          'A Pénzügy modul fejlécében (a fülek felett) találod a leggyakoribb műveleteket. A bevétel és a kiadás rögzítése EGYETLEN közös gombra került — egy mentéssel több tételt is felvihetsz.',
        whatItDoes:
          'Tétel-rögzítés (bevétel ÉS kiadás), decont, dispoziție, nyomtatási központ, számlák egyeztetése.',
        howItWorks: [
          {
            text: '🟢 + Tétel rögzítése — EGY ablak a bevételekhez és a kiadásokhoz. Felül váltasz a zöld (bevétel) és a piros (kiadás) fül között, és egy mentéssel akár több sort is rögzítesz — a rendszer dátum szerint rendezi őket.',
            hint: 'A régi külön „+ Bevétel" / „+ Kiadás" gombok ebbe az egy ablakba olvadtak össze.',
          },
          {
            text: '🟣 Decont — előleg-elszámolás: a kiküldött személy számláit egy hivatalos „Decont de cheltuieli" íven számolod el.',
          },
          {
            text: '🟡 Dispoziție — „Dispoziție de plată/încasare către casierie": hivatalos pénztári ki- és befizetési rendelvény készítése.',
          },
          {
            text: '🔵 Nyomtatási központ — minden hivatalos nyomtatvány egy helyen: kasszakönyv, banknapló, Főkönyv (Registru Jurnal), csoportnapló, kísérőív.',
          },
          {
            text: '🔵 Számlák egyeztetése — az e-Factura számlák feltöltő-párosító panelje gördül ki oldalról.',
          },
        ],
      },
    ],
  },

  // ============= 1/B. HIVATALOS SZABÁLYOK 2026 (EREK) =============
  // 2026-08-29 (Endre kérése): a Konyveles_2026_a hivatalos csomag (Változások
  // 2026 · Útmutató az EREK számadásához · Pénzügyi vizsgálat · Súgó ·
  // Egyházi adminisztráció az EREK-ben) FONTOS TUDNIVALÓI — lelkészi nyelven,
  // lépésről lépésre. A megosztott súgóban él, így a desktop is megkapja.
  {
    key: 'hivatalos-szabalyok-2026',
    label: 'Hivatalos szabályok 2026',
    description: 'Amit az egyházkerületi csomag előír — készpénz, zárás, aláírások',
    icon: Scale,
    topics: [
      {
        key: 'keszpenz-szabalyok',
        label: 'Készpénz-szabályok (törvényi korlátok)',
        icon: Wallet,
        color: 'rose',
        shortDescription: 'Az összegek, amiket TILOS átlépni — bírságolható törvényi korlátok',
        intro:
          'Ezek nem egyházi belső szabályok, hanem román törvényi előírások (Legea 70/2015) — megszegésük bírságolható. A rögzítő figyelmeztet rájuk, de a döntés és a felelősség a pénzkezelőé. A „Változások 2026" hivatalos segédlet (Beke Tivadar, 2025. november) állapota szerint.',
        whenNeeded: 'Minden készpénzes ki- és befizetés előtt — különösen nagyobb összegeknél.',
        whatItDoes:
          'A hat legfontosabb készpénz-korlát, érthetően — és hogy mit tegyél, ha egy kifizetés túllépné őket.',
        howItWorks: [
          {
            text: 'KASSZA-PLAFON: a pénztárban legfeljebb 50 000 lej készpénz lehet. Ami e fölött van, azt be kell tenni a bankba — a biztonság kedvéért 2 munkanapon belül.',
            hint: 'A két hivatalos forrás itt eltér (az Útmutató 2 munkanapot, a Változások 2026 3 napot ír) — a szigorúbbat követve nem hibázhatsz.',
          },
          {
            text: 'ELŐLEG (decont): vásárlási célra készpénzben legfeljebb 1 000 lej/nap/személy adható ki — konferencia- vagy táborszervezésnél is.',
            hint: 'A korábbi 5 000 lejes érték elavult — az újabb hivatalos segédlet (Változások 2026) az 1 000 lejt írja.',
          },
          {
            text: 'CÉGNEK KIFIZETÉS: készpénzben egy cégnek legfeljebb 5 000 lej/nap, az összes cégnek együtt legfeljebb 10 000 lej/nap. Az 5 000 lej feletti számla különbözetét KÖTELEZŐ banki átutalással fizetni.',
          },
          {
            text: 'CÉGTŐL BEVÉTEL: egy jogi személytől (cégtől, másik egyházközségtől) naponta legfeljebb 5 000 lej készpénz fogadható el.',
          },
          {
            text: 'MAGÁNSZEMÉLY: naponta legfeljebb 10 000 lej fogadható el tőle, és legfeljebb 10 000 lej fizethető ki neki. Kivétel: az alkalmazott havi fizetése.',
          },
          {
            text: 'KÖLCSÖN KÉSZPÉNZBEN: TILOS. Kölcsönt adni és visszafizetni kizárólag bankszámlán keresztül lehet (2023 novembere óta). Magánszemélynek egyházközségi hitel egyáltalán nem adható.',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'FELDARABOLNI TILOS: egy nagy kifizetést nem szabad több kisebb részre bontani a korlátok kikerülésére — az ellenőr a szándékos kijátszást súlyosabban ítéli meg, mint magát a túllépést.',
          },
          {
            kind: 'warning',
            text: 'A kassza nem mehet mínuszba — nagyobb kifizetés előtt nézd meg az egyenleget. Ha nincs elég készpénz, előbb vegyél fel a bankból (belső mozgás).',
          },
          {
            kind: 'tip',
            text: 'A „+ Tétel rögzítése" ablak magától figyelmeztet, ha egy köteg átlépné ezeket a korlátokat — a jelzés nem tiltás, mert a partner jogi státuszát (cég vagy magánszemély) te ismered.',
          },
        ],
        examples: [
          {
            situation: 'A tetőjavításról 8 000 lejes számla érkezik, a mester készpénzt kérne.',
            solution:
              'Készpénzben legfeljebb 5 000 lejt adhatsz — a fennmaradó 3 000 lejt KÖTELEZŐ átutalni. Két 4 000-es „részletre" bontani tilos (feldarabolás).',
          },
          {
            situation: 'Karácsony után 62 000 lej gyűlt össze a kasszában.',
            solution:
              'A plafon 50 000 lej — a többletet (legalább 12 000 lejt) tedd be a bankba 2 munkanapon belül. Rögzítés: belső mozgás („Készpénzletétel a bankba").',
          },
        ],
      },
      {
        key: 'honap-zarasa',
        label: 'A hónap zárása lépésről lépésre',
        icon: Printer,
        color: 'blue',
        shortDescription: 'Mit kell kinyomtatni és lefűzni minden hónap végén',
        intro:
          'A 2026-os hivatalos rend szerint a hónapot a kinyomtatott HAVI kasszakönyv zárja le. Napi lapokat nem kell nyomtatni — de a kassza vezetése naponta kötelező, a bankot pedig kizárólag a kivonat alapján könyveljük.',
        whenNeeded: 'Minden hónap utolsó napjaiban, amikor a hónap összes tétele már rögzítve van.',
        whatItDoes: 'A havi papírmunka pontos listája — mit, honnan nyomtatsz, és hová fűzöd le.',
        flow: [
          { label: 'Minden tétel rögzítve', sub: 'kassza naponta, bank a kivonatból' },
          { label: 'Havi kasszakönyv', sub: '1 példány, ezzel zárul a hónap' },
          { label: 'Főkönyv (Registru Jurnal)', sub: 'havonta, lehetőleg kétoldalasan' },
          { label: 'Lefűzés', sub: 'kassza és bank KÜLÖN iratgyűjtőbe' },
        ],
        howItWorks: [
          {
            text: 'Ellenőrizd, hogy a hónap MINDEN tétele rögzítve van — a kassza tételei naponta kerülnek be, a banki tételek a kivonat (extras) alapján, legegyszerűbben a kivonat-importtal.',
          },
          {
            text: 'Nyomtasd ki a HAVI kasszakönyvet egy példányban (Nyomtatási központ → Registru Casa, hónap kiválasztva) — a hivatalos rend szerint „ezzel zárjuk le a hónapot". Napi lapokat nem kell nyomtatni.',
          },
          {
            text: 'Nyomtasd ki a Főkönyvet (Registru Jurnal) a hónapról — lehetőleg kétoldalasan. Ez az EGYETLEN kötelezően bekötendő nyomtatvány: 5 évente vagy 200 lap után keményfedeles kötésbe kerül, és SOHA nem selejtezhető.',
            hint: 'A lapszámozás éven belül folytatólagos — a rendszer magától számozza, laponkénti átvitel-sorokkal.',
          },
          {
            text: 'MINDEN kiadás mellé kiadási kísérőív kell — a készpénzes ÉS a banki kifizetésekhez is. A kassza és a bank iratait KÜLÖN-KÜLÖN iratgyűjtőbe fűzd le.',
          },
          {
            text: 'A banki iratgyűjtőbe a HAVI kivonatot (extras) tedd — a napi kivonatokat nem kell nyomtatni.',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'A kinyomtatott és lefűzött hónap lezárt hónap — utólag ne szerkeszd a tételeit. Ha mégis javítani kell, stornózz (indoklással), és a javítást a következő nyomtatáskor vezesd át a papíron is.',
          },
          {
            kind: 'tip',
            text: 'A kiadási kísérőív fejléce a napi kiadások évi futó sorszám-tartományát mutatja (pl. „12–14. sz. kiadások") — ez köti össze a kasszakönyvet, a Főkönyvet és a lefűzött bizonylatot.',
          },
        ],
      },
      {
        key: 'ev-zarasa',
        label: 'Az év zárása lépésről lépésre',
        icon: ScrollText,
        color: 'cyan',
        shortDescription: 'A december–januári teendők sorrendje a beadható Számadásig',
        intro:
          'Az év végi zárás a legfontosabb könyvelési feladat: ekkor készül a Számadás, amit az egyházmegye ellenőriz és összesít. A lépések sorrendje számít — az Útmutató az EREK számadásához alapján.',
        whenNeeded: 'December közepétől a Számadás beadásáig.',
        whatItDoes: 'A hét kötelező év végi lépés, sorrendben — és a két kapu, amin a Számadást visszadobhatják.',
        flow: [
          { label: 'Minden tétel rögzítve', sub: 'dec. 31-ig' },
          { label: 'Valuta-átértékelés', sub: 'ha van devizás számla' },
          { label: 'Tartozások + kintlévőségek', sub: 'jegyzőkönyvvel!' },
          { label: 'Éves nyomtatványok', sub: 'banknapló, csoportnapló' },
          { label: 'Presbiteri határozat', sub: 'a Számadásról' },
          { label: 'Véglegesítés + beadás', sub: 'az egyházmegyének' },
        ],
        howItWorks: [
          {
            text: '1. Rögzíts minden december 31-ig történt tételt — az utolsó banki kezelési költséget is (a bank az év utolsó napján is vonhat díjat; a záró egyenlegnek az év végi kivonattal kell egyeznie).',
          },
          {
            text: '2. Ha van devizás (EUR, HUF) számlád: futtasd le a valuta-átértékelést a december 31-i BNR-árfolyammal (Bank fül → FX átértékelés). A nyereség a 103.04-re, a veszteség a 203.03-ra könyvelődik — a rendszer ezt magától intézi.',
          },
          {
            text: '3. Leltározd fel a TARTOZÁSOKAT (amivel a gyülekezet tartozik: központi járulék, bérjövedelem 10%-a, ki nem fizetett számlák) és a KINTLÉVŐSÉGEKET (amivel NEKED tartoznak: kiszámlázott, behajtható követelések). Ezek a Számadás 116–133. soraiba kerülnek.',
            hint: 'Kintlévőségnek NEM számít a be nem folyt egyházfenntartói járulék, a megígért adomány és a perselypénz — csak a kiszámlázott vagy szerződéses követelés.',
          },
          {
            text: '4. A presbiteri határozatba VEDD BELE a tartozásokat — a jegyzőkönyvbe nem vett tartozást a következő évben NEM lehet kifizetni. Ha nincs tartozás, azt is jegyzőkönyvezni kell, hogy nincs.',
          },
          {
            text: '5. Nyomtasd ki az éves nyomtatványokat: a banknaplót éves (Jan–Dec) változatban és a csoportnaplót — mindkettő CSAK év végén készül, havonta nem kell.',
          },
          {
            text: '6. Ellenőrizd a két kaput, amin a Számadást visszadobhatják: (a) a NYITÓ egyenlegnek fillérre egyeznie kell az ELŐZŐ ÉV LEADOTT Számadásának záró egyenlegével — az egyházmegye ezt mindig ellenőrzi; (b) a záró egyenlegnek egyeznie kell a kassza + bank tényleges egyenlegével. A rendszer mindkettőt magától számolja és jelzi az eltérést.',
          },
          {
            text: '7. Véglegesítsd a Számadást (Számadás fül → véglegesítés), nyomtasd ki a borítóval (presbiteri határozat száma + iktatószám), és add be az egyházmegyének. A véglegesített évbe a rendszer többé nem enged rögzíteni.',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'Egy elfogadott és leadott Számadást utólag CSAK esperesi vagy püspöki vizitáció ellenőrzése alkalmával lehet kiigazítani — ezért zárás előtt mindent ellenőrizz.',
          },
          {
            kind: 'tip',
            text: 'A Monetárral (címletszámolóval) év végén számold meg fizikailag is a kasszát — a címletjegyzék a hivatalos év végi dokumentumok része.',
          },
          {
            kind: 'tip',
            text: 'A súgó jobb oldalán élő év végi CHECKLISTA van — kipipálhatod, mi van kész; a rendszer megjegyzi.',
          },
        ],
      },
      {
        key: 'alairasok-vizsgalat',
        label: 'Aláírások, határozatok, vizsgálat',
        icon: ClipboardList,
        color: 'violet',
        shortDescription: 'Mihez kell presbiteri határozat, és mit kér a pénzügyi vizsgálat',
        intro:
          'A könyvelés számai mellett a JÓVÁHAGYÁSOK rendje is vizsgálati tétel: a pénzügyi ellenőrzés első kérdése mindig az, megvan-e a papírja annak, ami történt. A „Pénzügyi vizsgálat" hivatalos iratlistája (Ungvári Éva) alapján.',
        whenNeeded: 'Költségvetés és Számadás beadása előtt, segélyek kifizetésekor, és a pénzügyi vizsgálatra készülve.',
        whatItDoes: 'A kötelező aláírások és határozatok listája — hogy a vizsgálaton ne érjen meglepetés.',
        howItWorks: [
          {
            text: 'KÖLTSÉGVETÉS és SZÁMADÁS: presbiteri határozattal (a jegyzőkönyv számával), egyházközségi iktatószámmal, majd az esperesi hivatal iktatószámával és az esperes + számvevő aláírásával érvényes. A borító mezőit a rendszer kitölti — a határozat számát a véglegesítéskor kell megadnod.',
          },
          {
            text: 'SEGÉLY: minden segélykifizetés mellé presbiteri határozat kell. Egyháztagnak segély csak mélyszegénység, betegség vagy természeti csapás címén adható — kérvénnyel és igazoló dokumentumokkal.',
          },
          {
            text: 'GAZDASÁGI BIZOTTSÁG: félévenként pénzügyi ellenőrzést tart, jegyzőkönyvvel. A vizsgálat legelső tétele az ELŐZŐ ellenőrzés jegyzőkönyve és a meghagyások teljesítéséről szóló jelentés.',
          },
          {
            text: 'KIADÁSI KÍSÉRŐÍV: a lelkipásztor és a (fő)gondnok írja alá; a Dispoziție de plată hivatalos nyomtatványán három vízum-blokk kötelező.',
          },
          {
            text: 'NYUGTA: kizárólag az EREK iratterjesztőjéből vásárolt, sorszámozott nyugtatömb (Chitanță) használható — a nyugtatömbökről külön nyilvántartást kell vezetni (a rendszer Nyugtatömb-nyilvántartása pontosan ezt szolgálja). Adományról NÉVRE SZÓLÓ nyugta kötelező; névtelen adakozónak nyugta nem állítható ki.',
          },
          {
            text: 'BÉRLETI SZERZŐDÉS: az Esperesi Hivatalban be kell iktatni, és az ÉPÜLET-bérjövedelem 10%-ának befizetését okmányokkal igazolni (terület-bérjövedelem után nem kell 10%).',
          },
          {
            text: 'PERSELYPÉNZ: felbontásakor jegyzőkönyv készül, és annak alapján kerül nyugtára — nem közvetlenül a kasszába.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'A pénzügyi vizsgálat 41 bemutatandó iratot sorol fel négy blokkban (pénzügyvitel, leltár, alkalmazottak, segélyszállítmányok) — a teljes lista a webes súgó „EREK szabályok" nézetében, a Pénzügyi vizsgálat kategóriában olvasható.',
          },
          {
            kind: 'warning',
            text: 'Segélyszállítmánynál hat dolog kötelező: iktatott adománylevél, presbiteri határozat a kiosztásról, raktárbavételi jegyzék (NIR), fogyasztási jegyzék (bon de consum), névre szóló kiosztási lista, és a maradék leltári nyilvántartása.',
          },
        ],
      },
      {
        key: 'gyakori-tevedes',
        label: 'Gyakori könyvelési tévedések',
        icon: AlertCircle,
        color: 'orange',
        shortDescription: 'Melyik tételre NE könyveld — a hivatalos útmutató piros figyelmeztetései',
        intro:
          'Az Útmutató az EREK számadásához visszatérően ugyanazokra a tévedésekre figyelmeztet: jó összeg, rossz sor. A rossz tételre könyvelt összeg a Számadásban hibás sorokat ad, és az egyházmegyei összesítésben is tovább gyűrűzik.',
        whenNeeded: 'Amikor bizonytalan vagy, melyik könyvelési célt válaszd egy tételhez.',
        whatItDoes: 'A leggyakoribb besorolási hibák — és a helyes cél mindegyikhez.',
        howItWorks: [
          {
            text: 'SZPONZORPÉNZ és a 3,5%-os adófelajánlás NEM adomány: a 103.09-re megy, nem a 101.04-re. Az adomány (101.04) a hívek önkéntes, névre szóló nyugtázott adakozása.',
          },
          {
            text: 'ÉPÍTKEZÉSI, JAVÍTÁSI számla akkor sem „Szolgáltatás" (201.10), ha a számlán „Prestări servicii" áll — javításra vagy beruházásra (205.01/205.02) könyveld, a tartalom szerint.',
          },
          {
            text: 'A 2 500 LEJES HATÁR dönt eszközvásárlásnál: 2 500 lej fölött beruházás/alapeszköz (205.01), alatta kis értékű leltári tárgy (201.12) — mindkettő leltárba kerül (a rögzítő fel is ajánlja).',
          },
          {
            text: 'SZERETETVENDÉGSÉG a 203.04-re megy, NEM protokollra (201.11). Rendezvényi catering a rendezvény tételéhez tartozik.',
          },
          {
            text: 'GÉPKOCSI adója-biztosítása a 201.05-re megy, nem az épületadóra (201.04). Ha az autó nem a gyülekezeté, üzemeltetési költség CSAK használati (comodat) vagy bérleti szerződés alapján számolható el.',
          },
          {
            text: 'ERDŐ- és MEZŐGAZDASÁGI bevétel a 104-es gazdasági bevételekhez tartozik, nem a „javak értékesítése" (103.07) sorhoz — és ahol gazdasági bevétel van, ott gazdasági kiadásnak is lennie kellene.',
          },
          {
            text: 'CSILLAGOS (*) tételek: a román nevükben csillagot viselő sorok az EGYHÁZMEGYÉNEK fenntartottak (pl. 105.03 kongrua, 201.15 nettó fizetések) — egyházközség oda nem könyvelhet, kivéve ahol helyben számfejtenek.',
          },
          {
            text: 'ELŐLEG (decont): kiadáskor a 207.02-re (kiadott hitelek), elszámoláskor a 107.02-n vissza, a tényleges költségek pedig a saját tételeikre — az el nem számolt különbözet év végén a kintlévőségek közé kerül. A rendszer Decont-funkciója ezt a láncot magától így könyveli.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Bizonytalanságnál a webes súgó „EREK szabályok" nézete a teljes 101–207-es kódtáblázatot magyarázza tételenként — vagy kérdezd meg az egyházmegye számvevőjét: egy jó kérdés olcsóbb, mint egy visszadobott Számadás.',
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
        key: 'tetel-rogzitese',
        label: 'Tétel rögzítése',
        icon: ClipboardList,
        color: 'teal',
        shortDescription: 'A fő beviteli ablak — bevételek és kiadások egyszerre, tömegesen',
        intro:
          'A Pénzügy fejléc „+ Tétel rögzítése" gombja nyitja meg — ez a központi beviteli ablak. Két füle van (Bevétel / Kiadás), és egyszerre AKÁR TÖBB tételt is rögzíthetsz egy listában. A Mentés mindkét fül sorait dátum szerint rendezi és a helyére teszi.',
        whenNeeded:
          'Vasárnap több befizetést kaptál, vagy egyszerre több kiadást kell rögzítened — itt gyorsan, egymás után beviheted mind.',
        flow: [
          { label: '+ Tétel rögzítése', sub: 'a Pénzügy fejlécében' },
          { label: 'Bevétel / Kiadás fül', sub: 'a kettő egyszerre is megy' },
          { label: 'Sorok kitöltése', sub: '„Új sor" gombbal annyi, ahány kell' },
          { label: 'Mentés', sub: 'dátum szerint rendez, a helyére tesz' },
        ],
        whatItDoes:
          'Csak KÉSZPÉNZES tételek (a bankiakat banki kivonatból importáljuk). Tömeges bevitel, automatikus vázlatmentés, befizető-keresés, automatikus nyugtaszám, családi nyugta, és beépített ellenőrzések (duplikátum, dátum).',
        howItWorks: [
          {
            text: 'Oszlopok sorrendje (a Kassza/Bank/Tranzakciók nézettel egyező): Dátum · Irattípus · (Chitanță esetén) Kerületi sz. + Gyül. sz. · Befizető/Kedvezményezett · Jogcím · Melyik évre · Összeg · Megjegyzés.',
          },
          {
            text: 'Befizető keresése: a „Befizető / forrás" mezőbe gépelve a rendszer azonnal keres a tagnyilvántartásban — ékezetes névre is (pl. „Kovács", „Tóth Ödön"). A találat a név mellett a születési évet, helységet, utcát is mutatja, hogy egyértelmű legyen, kit választasz. A kiválasztott tag a befizetéshez kötődik (így a Tartozások fülön is számolódik).',
            hint: 'Ha valaki nincs a nyilvántartásban, szabad szövegként is beírhatod a nevet.',
          },
          {
            text: 'Automatikus nyugtaszám: ha az Irattípusnál a „Chitanță"-t választod, megjelenik a Kerületi sz. (a kerülettől kapott, előre nyomtatott szám) és a Gyül. sz. (a gyülekezet saját sorszáma) mező, és a rendszer mindkettőt kitölti a következő szabad számmal — az utolsó nyugtához képest +1, hézag nélkül (a vezető nullák megőrzésével, pl. 0115301 → 0115302).',
            hint: 'A legelső nyugtánál a kerületi számot a tömbről egyszer kézzel beírod; onnantól minden következőnél automatikus. A számok kézzel felülírhatók.',
          },
          {
            text: 'Melyik évre: a befizetésnél megadhatod, melyik évre szól — pl. visszamenőleg az elmaradt egyházfenntartói járulékot a megfelelő korábbi évhez. Alapból az aktuális év.',
          },
          {
            text: 'Új sor: az „Új sor" gomb hozzáad egy sort, ami az előző sor dátumát örökli — tömeges, egynapos bevitelnél nem kell minden sorba újra beírni a dátumot.',
          },
          {
            text: 'Automatikus vázlatmentés: amit beírsz, gépelés közben azonnal mentődik a böngészőben. Ha áramszünet van, véletlenül bezárod, vagy bármi miatt félbe kell hagynod, az ablak újranyitásakor a sorok visszaállnak. A lábléc mutatja, mikor mentett utoljára.',
          },
          {
            text: 'Mentés: a „Mentés" gomb egyszerre rögzíti a bevétel- és kiadás-sorokat (és a belső mozgásokat), dátum szerint rendezve a helyükre.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Egy nyugtára több személy (családi nyugta): töltsd ki a sort, majd a Befizető mezőnél a „Család keresése" gombbal válaszd ki a családot, és csak a neveket pipáld ki — minden tag külön sorba kerül, közös nyugtaszámon (/1, /2…), a sor adataival; utána már csak az összegeket írod be tagonként.',
          },
          {
            kind: 'tip',
            text: 'Több személy gyorsan, vesszővel: a Befizető mezőbe írj több nevet vesszővel elválasztva (pl. „Nagy Péter, Szabó Anna"), és nyomd a megjelenő „✂ Felbontás N külön sorra" gombot — egy nyugtán, külön sorokban.',
          },
          {
            kind: 'tip',
            text: 'Kiadásnál a kedvezményezett nevét gépelve a rendszer felajánlja a korábban már rögzített partnereket — egy kattintással kitölthető.',
          },
          {
            kind: 'warning',
            text: 'Beviteli őrök: ha a kerületi iratszám már létezik (vagy kétszer szerepel a listában), piros jelzést kapsz még mentés előtt. Ha a tétel dátuma jövőbeli, vagy korábbi mint a legutóbb rögzített, a rendszer figyelmeztet — így nem marad ki és nem csúszik el a könyvelés.',
          },
          {
            // 2026-07-10 (S3-sugo): kettős könyvelés + irányfüggő megnevezés
            kind: 'warning',
            text: 'Belső mozgás (készpénz a bankba / bankból ki): ha ilyen jogcímet választasz, megjelenik a bankszámla-választó, és a tétel belső mozgásként könyvelődik — nem bevételként vagy kiadásként. A rögzítés kettős könyveléssel történik: a kassza ÉS a bank egyenlege egyszerre változik, a tétel pedig az iránynak megfelelő nevet kapja („Készpénzletétel a(z) … számlára" / „Készpénzfelvétel a(z) … számláról").',
          },
          {
            // 2026-07-10 (S3-sugo): egyházfenntartás ajánlott összeg
            kind: 'tip',
            text: 'Egyházfenntartásnál a rendszer felajánlja az ajánlott összeget — a Beállításokban megadott éves díjból és a befizető kedvezményeiből (kor, jövedelem, felmentés) számolva. Természetesen felülírhatod.',
          },
        ],
        commonMistakes: [
          'A Kerületi sz. és Gyül. sz. mező CSAK Chitanță (nyugta) esetén jelenik meg — más irattípusnál „—" látszik, ez normális.',
          'Az ELSŐ chitanánál a kerületi szám nem töltődik ki magától (nincs előzmény) — a tömbről egyszer beírod, onnantól automatikus.',
          'Banki (átutalásos) tételt ne itt rögzíts — az a banki kivonat-importtal érkezik a Bank lapra.',
        ],
        examples: [
          {
            situation: 'Egy család (apa, anya, két gyermek) egyben fizet egyházfenntartást, egy nyugtára.',
            solution:
              'Bevétel-sor (Chitanță → kitöltődnek a nyugtaszámok) → „Család keresése" → válaszd a családot → pipáld a neveket → minden taghoz külön sor jön közös nyugtaszámon; töltsd ki az összegeket.',
          },
          {
            situation: 'Két szomszéd együtt hoz be perselypénzt, de nem egy regisztrált család.',
            solution:
              'A Befizető mezőbe: „Nagy Péter, Szabó Anna" → „✂ Felbontás 2 külön sorra" → töltsd ki az összegeket.',
          },
          {
            situation: 'Valaki most fizeti a tavalyi elmaradt egyházfenntartói járulékát.',
            solution: 'Bevétel-sor → „Melyik évre": az előző év → a befizetés a helyes évhez kerül.',
          },
        ],
      },
      {
        key: 'kassza',
        label: 'Kassza',
        icon: Wallet,
        color: 'emerald',
        shortDescription: 'A készpénzes mozgások és nyugta-kiállítás',
        intro:
          'Itt vezeted a készpénzes pénztárt — mind a bevételeket, mind a kiadásokat. A Kassza a Bank független párja: a kettő nem keveredik.',
        whenNeeded:
          'Vasárnap megszámoltad a perselypénzt, vagy valaki készpénzben fizetett egyházfenntartást — itt rögzíted.',
        flow: [
          { label: '+ Tétel rögzítése', sub: 'a Pénzügy fejlécében' },
          { label: 'Kategória + összeg', sub: 'befizető kereshető a tagok közt' },
          { label: 'Mentés', sub: 'iratszámot a rendszer ad' },
          { label: 'Nyugta', sub: 'ha a befizető kéri' },
          { label: 'Excel', sub: 'asztali appban magától' },
        ],
        commonMistakes: [
          'Banki átutalást NE a Kasszába rögzíts — az a bankkivonat-importtal érkezik a bank-lapra.',
          'A perselypénz bankba vitele nem bevétel és nem kiadás — az Belső mozgás (kassza → bank).',
          'Offline módban ne írj kézzel iratszámot — a szám-tárcából kapja a következő szabadot.',
        ],
        whatItDoes:
          'Hónaponkénti listázás dátum szerint, nyitó- és záró-egyenleg, hiányos adatok jelzése, **nyugta (chitanță) kiállítás** közvetlenül a sorból.',
        howItWorks: [
          {
            text: 'Az új sor felvitele a Pénzügy fejléc „+ Tétel rögzítése" gombjával történik (zöld fül = bevétel, piros fül = kiadás). Ha nem választasz bankszámlát a sorhoz, a tétel a KASSZÁBA kerül — ez a készpénz szabálya.',
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
          {
            // 2026-07-10 (S3-sugo): iratszám-sorrend + időrendi export
            kind: 'tip',
            text: 'A listában a gyülekezet saját iratszáma áll elöl (a kerületi szám kisebb betűvel alatta), és az Excel-export mindig időrendben készül (év elejétől év végéig) — akárhogy is rendezted a képernyőn a táblázatot.',
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
            text: 'A banki tételek nagy része a KIVONAT-IMPORTTAL érkezik (Bank fül → import) — ez a pontos és ajánlott út. Kézi rögzítésnél („+ Tétel rögzítése") válaszd az „Ordin de plată" bizonylattípust, és jelöld ki, melyik bankszámlát érinti.',
          },
          {
            text: 'A táblázat minden bankszámlához külön egyenleget mutat, plus egy összesítő egyenleget.',
          },
          {
            text: 'Devizás átértékelés (FX): ha EUR számlád is van, év végén a BNR árfolyamon át kell értékelni — ezt a KARTOTEKA automatikusan javasolja.',
          },
          {
            // 2026-07-10 (S3-sugo): napi árfolyamos import
            text: 'Devizás számla importja: a banki kivonat beolvasásakor minden tranzakció az ADOTT NAPI hivatalos BNR árfolyammal számítódik át lejre — nem egyetlen éves árfolyammal. Ha egy napra nem érhető el árfolyam, a rendszer jelzi.',
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
            // 2026-07-10 (S3-sugo): külön Bevétel/Kiadás oszlop + készpénz/banki jelzés
            text: 'Külön Bevétel és Kiadás oszlop van (mint a Kassza fülön), és minden sornál látszik, hogy készpénzes vagy banki a tétel — banki tételnél a bankszámla nevével. Így egy pillantásra kiderül, honnan mozgott a pénz.',
          },
          {
            text: 'A 🧾 oszlopban minden befizetésnél: ha bérleti díj és van szerződés-pár → „+ Számla" (e-Factura) gomb. Egyébként az Oblio státusz látszik (zöld pipa = elfogadva, sárga óra = függőben).',
          },
          {
            text: 'A kiadások „🧾" oszlopában: zöld pipa ha a beszállító feltöltötte SPV-be a számlát, sárga ⚠ ha nincs SPV-ben.',
          },
          {
            // 2026-07-10 (S3-sugo): teljes lapos előnézet + Registrul-Jurnal felirat
            text: 'A „Kísérőív" gomb minden napra rendezetten kinyomtatható (sorszámozva). Az előnézet a teljes lapot mutatja görgetés nélkül, a felirata pedig „Registrul-Jurnal" — a bizonylaton banki tételek is szerepelnek, ezért nem „Kasszakönyv".',
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
        whenNeeded:
          'Készpénzes befizetésről hivatalos nyugtát (chitanță) kell adnod a befizetőnek.',
        flow: [
          { label: 'Tömb felvétele', sub: 'seria + sorszám-tartomány' },
          { label: 'Befizetés rögzítése' },
          { label: 'Nyugta automatikusan', sub: 'a következő sorszámmal' },
          { label: 'Nyomtatás', sub: 'azonnal vagy később újra' },
        ],
        commonMistakes: [
          'Előbb legyen AKTÍV nyugtatömb — anélkül a rendszer nem tud sorszámot adni.',
          'Elrontott nyugtát ne hagyj „lyukasan" — sztornózd, hogy a tömb hiánytalanul elszámolható legyen.',
        ],
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
          {
            // 2026-07-25 (G4-sugo): valós készlet a berögzített nyugtaszámokból
            text: 'Valós készlet: a tömbök elhasználtsága a TÉNYLEGESEN berögzített kerületi nyugtaszámokból számolódik — akkor is pontos, ha a nyugtaszámot a tétel-rögzítőben kézzel írtad be. A vezető nullák nem számítanak (a 0115032 és a 115032 ugyanaz a nyugta), a családi nyugta al-sorai (/1, /2…) egy lapnak számítanak, és a stornózott vagy anulált (0 lejes) nyugta is elhasznált lap — a rontott papír nem kerül vissza a tömbbe.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'A nyugtatömbök az Anyagraktár fülön is megjelennek (Leltár → Anyagraktár) — ott látod az összes tömböt raktárkészlet szempontból.',
          },
          {
            // 2026-07-10 (S3-sugo): Nyugtafigyelő évhatáron át + Decont-pótlás
            kind: 'tip',
            text: 'A Nyugtafigyelő átlép az évhatáron: mivel a sorszámok évek között folytatódnak, az ellenőrzés a következő év első nyugtájáig néz — az elmaradt nyugtákat áthozza az új évbe is, és a bevételi elszámolással (Decont de încasări) pótolhatod őket.',
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
        whenNeeded:
          'Elütöttél egy összeget, rossz kategóriát választottál, vagy duplán került be egy tétel.',
        flow: [
          { label: 'Tétel megnyitása', sub: 'Kassza vagy Tranzakciók fül' },
          { label: 'Sztornó + indoklás', sub: 'legalább 5 karakter' },
          { label: 'Áthúzva megmarad', sub: 'semmi nem vész el' },
          { label: 'Excel', sub: 'ellentételező sor kerül be' },
        ],
        commonMistakes: [
          'Sztornó helyett SOSE törölj vagy írj át kézzel az Excelben — a rendszer ellentételező sort ír, így a végösszeg pontos ÉS minden visszakövethető.',
          'Az indoklást ne spórold el — a számvevői ellenőrzésnél ez az első, amit néznek.',
        ],
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
      {
        key: 'szuro-export',
        label: 'Szűrés és Excel-export',
        icon: FileSpreadsheet,
        color: 'emerald',
        shortDescription: 'Oszloponkénti szűrés + a (szűrt) adatok letöltése Excelbe',
        intro:
          'A Kassza, Bank és Tranzakciók fülön a táblázat felett egy szűrő-sáv található: minden oszlophoz tartozik egy beviteli mező, és a (szűrt) sorok egyetlen kattintással letölthetők Excelbe — a hivatalos Adatok_2025 oszloprendben, így vissza is importálható.',
        whenNeeded:
          'Egy adott partnert, jogcímet vagy bizonylatot keresel a sok tétel között; vagy egy szűrt lista adatait szeretnéd kimenteni Excelbe.',
        whatItDoes:
          'A szűrő-sáv mezői: Dátum, Irattípus, Iratszám, Partner, Jogcím és Megjegyzés. Gépelj bármelyikbe — a lista azonnal szűkül (ékezet-független, „tartalmazza" keresés). Az „Export (Excel)" gomb a SZŰRT sorokat tölti le .xlsx-ként.',
        howItWorks: [
          {
            text: 'Írj a megfelelő oszlop szűrő-mezőjébe — több mező egyszerre is használható (ÉS-kapcsolat).',
          },
          {
            text: 'A találatszám a sáv alján látszik (pl. „12 / 480 tétel (szűrve)").',
            hint: 'A nyitó/záró egyenleg-kártyák a teljes havi adatból számolnak — a szöveges szűrő csak a listát és az exportot szűkíti, az egyenleget nem.',
          },
          { text: 'A „Szűrők törlése" gomb egy kattintással visszaállítja a teljes listát.' },
          {
            text: 'Az „Export (Excel)" gomb letölt egy fájlt (pl. Kassza_2025.xlsx) a hivatalos oszloprenddel: Dátum | Iratszám | Irattíp. | Név | Bev. Összeg | Bevétel költségvetési név | Kiad. Összeg | Kiadás költségvetési név | Megjegyzés.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Az export a hivatalos Adatok_2025.xlsx elrendezését követi — ugyanúgy vissza is olvasható/importálható.',
          },
          {
            kind: 'tip',
            text: 'Ha nincs szűrő beállítva, a teljes (a hónap-választóval kiválasztott) lista exportálódik.',
          },
          {
            // 2026-07-10 (S3-sugo): párosítás-státusz az exportban
            kind: 'tip',
            text: 'Belső mozgásnál az exportban a „Várakozik banki egyeztetésre" felirat a valós állapotot mutatja — amint a banki pár beérkezett és párosodott, a felirat eltűnik.',
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
        whenNeeded:
          'Valaki a saját pénzéből vásárolt a gyülekezetnek, és számlákkal számol el utólag.',
        flow: [
          { label: 'Számlák összegyűjtése' },
          { label: 'Decont kiállítása', sub: 'tételek felvitele' },
          { label: 'Kiadások automatikusan', sub: 'minden tételből kiadás lesz' },
          { label: 'Aláírás + kifizetés', sub: 'hivatalos nyomtatvány' },
        ],
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
        whenNeeded:
          'Az új évre tervezed a gyülekezet bevételeit és kiadásait a presbitérium elé.',
        flow: [
          { label: 'Tervszámok', sub: 'kategóriánként' },
          { label: 'Presbiteri elfogadás' },
          { label: 'Évközi követés', sub: 'terv vs. tény magától' },
          { label: 'Módosítás', sub: 'ha az élet közbeszól' },
        ],
        whatItDoes:
          'Számadási cél kódonként megadható a tervezett bevétel és kiadás. A rendszer számolja az össz- és kategória-szintű egyenlegeket.',
        howItWorks: [
          {
            // 2026-07-10 (S3-sugo): év-választó új helye
            text: 'Az év kiválasztása: a Pénzügy oldalon bal oldalt, közvetlenül a cím alatt találod a „Költségvetési év" vezérlőt — a ◄ ► nyilakkal léptethetsz, a nagy évszám mutatja, melyik évet nézed.',
          },
          {
            // 2026-07-10 (S3-sugo): automatikus nyitó egyenlegek
            text: 'A táblázat első 1–3. sora (Múlt évi pénztármaradvány / Készpénz / Bank) automatikusan kitöltődik az előző évi záróból — nem kell kézzel beírni.',
          },
          {
            // 2026-07-10 (S3-sugo): előző évi tény szürkén
            text: 'Az előző évi tényszámok halványan (szürkén) látszanak tételenként — üres mezőnél előre beírt javaslatként, amit gépeléskor felülírhatsz. Így a tervezésnél mindig látod, mennyi volt tavaly.',
          },
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
        whenNeeded:
          'Év végén — vagy az esperesi/számvevői ellenőrzés előtt — a hivatalos éves kimutatás kell.',
        flow: [
          { label: 'Évközi rögzítések', sub: 'ebből épül minden' },
          { label: 'Számadás fül', sub: 'magától összesít kódonként' },
          { label: 'Ellenőrzés', sub: 'sztornók, belső mozgás párok' },
          { label: 'Véglegesítés', sub: 'az év zárolódik' },
        ],
        commonMistakes: [
          'Véglegesítés után az év zárolt — előtte ellenőrizd a függő sztornókat és a párosítatlan belső mozgásokat.',
        ],
        whatItDoes:
          'A bevételek és kiadások célonként összesítve, a tervhez viszonyítva. Év végén véglegesíthető.',
        howItWorks: [
          {
            text: 'Bármikor megnézheted az aktuális állást — nem kell várni az év végéig.',
          },
          {
            // 2026-07-25 (G3-sugo): évi összegző hero
            text: 'Évi pénzügyi kép a fül tetején: egy pillantással látod az évi bevételt és kiadást, a pénztári (Casa) és a banki (Banca) egyenleget, és nagy számmal a rendelkezésre álló pénzt összesen — pontosan ugyanazokkal a számokkal, amiket a Kassza és a Bank fül mutat.',
          },
          {
            // 2026-07-10 (S3-sugo): hivatalos nyitó 3 sor + helyes záró egyenleg
            text: 'A fül (és a nyomtatvány) tetején automatikusan ott a hivatalos nyitó 3 sor: Múlt évi pénztármaradvány / Casa (készpénz) / Banca (bank) — az előző évi záróból. A záró egyenleg a helyes képlettel készül: nyitó + évi bevételek − évi kiadások.',
          },
          {
            // 2026-07-10 (S3-sugo): belső mozgás nem tétel
            text: 'A belső mozgások (készpénz a bankba és vissza) nem jelennek meg tételként — ahogy a hivatalos nyomtatványon sem. Az előző évi tényszámok szürkén, oszlopként látszanak összehasonlításul.',
          },
          {
            // 2026-07-10 (S3-sugo): beküldés zár-először sorrendben
            text: 'Beküldés az egyházmegyének: a rendszer ELŐBB véglegesíti (lezárja) az évet, és csak UTÁNA küldi be — így a beküldött és a helyben látott számok mindig ugyanazok. A dokumentum a gyülekezeted saját egyházmegyéjéhez kerül.',
          },
          {
            text: 'A véglegesítés után a számadás zárolódik: a meglévő tételek nem módosíthatók, és új tétel sem rögzíthető a lezárt évbe — utána már csak a presbitérium engedélyével módosítható (újranyitási kérelem).',
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
        whenNeeded:
          'Tudni szeretnéd, ki nem fizette még be az idei egyházfenntartói járulékot.',
        commonMistakes: [
          'A kedvezmények (kor, jövedelem, felmentés) beállítása nélkül a lista többet mutat tartozásnak, mint a valóság.',
        ],
        whatItDoes:
          'A KARTOTEKA évente kiszámolja, ki mennyivel tartozik, és a befizetésekből automatikusan levonja.',
        howItWorks: [
          {
            text: 'Az éves járulék összege a Beállítások → Éves díjak menüben állítható be.',
          },
          {
            text: 'A „pótlás" jelzéssel beérkező befizetések egy korábbi évre számolódnak (nem a folyó évi befizetésbe).',
          },
          {
            // 2026-07-10 (S3-sugo): év szerinti áttekintés
            text: 'Év szerinti áttekintés: az év-választóval (bal oldalt, a cím alatt) visszalapozhatsz a korábbi évekre — évente látod, ki mennyivel maradt el. A visszamenőleges befizetésnél a Tétel rögzítése „Melyik évre" mezőjével a megfelelő évhez könyvelhetsz.',
          },
          {
            // 2026-07-24 (F5-sugo): Q7 családi felosztás — a három eset
            text: 'SAJÁT NÉVRE szóló befizetés: mindig a befizetőnél marad — a többlettel együtt. Ha valaki a saját nevén az évi járuléknál többet fizet, a többlet az Ő kartotékján látszik; a rendszer soha nem veszi el, és nem osztja szét a család többi tagjára.',
          },
          {
            text: 'A CSALÁD nevére szóló befizetés: a család tagjai közt osztódik szét — az idősebb tagtól kezdve, mindenkinél legfeljebb az adott évi elvárt összegig (a kor- és foglalkozás-kedvezményt is beleszámítva). Így egyetlen 220 lejes családi befizetéstől nem látszik a család MINDEN tagja „rendezettnek" — csak az, akinek a része tényleg befolyt.',
            hint: 'Aki már a saját nevén befizette az évi járulékát, annak a helyét egy későbbi családi befizetés nem tölti újra — a családi összeg oda kerül, ahol tényleg hiány van.',
          },
          {
            text: 'A régi rendszerből ÁTHOZOTT (importált) befizetéseknél, ahol a tétel egyszerre kapcsolódik személyhez ÉS családhoz, a megnevezett tag évi járuléka feletti rész a család többi tagjának hiányát fedezi — így az Excel-ből áthozott történeti adat nem vész el.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Ha egy család egyben fizeti mindenki járulékát, a Tétel rögzítése ablak „Család keresése" gombjával tagonként külön sorba rögzítheted — így minden összeg pontosan a megfelelő személyhez kerül, és a felosztásra sincs szükség.',
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
          {
            // 2026-07-10 (S3-sugo): belső mozgás törölhető
            text: 'A felületről rögzített belső mozgások (pl. valutaváltás) mostantól törölhetők, ha tévedésből kerültek be.',
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
        whenNeeded:
          'Megjött a havi bankkivonat, és a banki tételeket be kell vezetni a nyilvántartásba.',
        flow: [
          { label: 'Kivonat letöltése', sub: 'a bank internetbankjából' },
          { label: 'Import', sub: 'Pénzügy → Bank import' },
          { label: 'Párosítás ellenőrzése', sub: 'meglévő tételekkel veti össze' },
          { label: 'Hiányzók rögzítése', sub: 'egy gombbal, default kategóriával' },
        ],
        commonMistakes: [
          'A banki tételeket ne vidd fel kézzel a Kasszába — az import gyorsabb, és nem lehet elütni.',
          'Import után nézd át a most-rögzített sorokat — a default kategória nem mindig a legtalálóbb.',
        ],
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
            // 2026-07-10 (S3-sugo): működő mappa-beállítás gomb
            text: 'A „Mappa beállítása" gomb azonnal megnyitja a mappa-választót, és a rendszer megjegyzi a kiválasztott KARTOTEKA mappát — legközelebb már nem kell újra kijelölnöd (Chrome vagy Edge böngésző szükséges).',
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
   * Web: `/penzugy#accounting`. Desktop: pl. `/penzugy/szamadas`.
   * Ha nincs megadva, a banner csak szöveges (link nélkül).
   */
  finalizeHref?: string

  /**
   * Platform-specifikus EXTRA szekciók — a közös tartalom UTÁN kerülnek a bal
   * navigáció végére. A desktop az „Asztali (offline) verzió" szekciót injektálja
   * (offline mód, szinkron, iratszám-tárca, az asztali írási út). A web nem ad át
   * semmit, így a súgója változatlan marad.
   */
  extraSections?: Section[]
}

// ─────────────────────────────────────────────────────────────
// Fő komponens
// ─────────────────────────────────────────────────────────────

export function FinanceSugoTab({
  onPrintTopicToBrowser,
  onPrintTopicToPdf,
  onToast,
  finalizeHref,
  extraSections,
}: FinanceSugoTabProps = {}) {
  // A közös szekciók + a platform-specifikus extra szekciók (desktop: offline).
  const ALL_SECTIONS =
    extraSections && extraSections.length ? [...SECTIONS, ...extraSections] : SECTIONS

  const [activeTopicKey, setActiveTopicKey] = useState<string>(ALL_SECTIONS[0].topics[0].key)
  const [printing, setPrinting] = useState<'preview' | 'pdf' | null>(null)

  const allTopics = ALL_SECTIONS.flatMap((s) => s.topics.map((t) => ({ ...t, sectionKey: s.key })))
  const activeTopic = allTopics.find((t) => t.key === activeTopicKey) || allTopics[0]
  const palette = PALETTE[activeTopic.color]
  const activeSectionLabel = ALL_SECTIONS.find((s) => s.key === activeTopic.sectionKey)?.label

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

      {/* MAIN GRID — 2026-06-11 (Endre #3): xl-től HÁROMOSZTATÚ — bal témalista,
          középen tartalom, jobbra az ÉLŐ év-végi checklist (sticky). Kisebb
          képernyőn a checklist a lap aljára csúszik (teljes szélesség). */}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        {/* ───── BAL: KATEGÓRIÁK ÉS TÉMÁK ───── */}
        <div className="space-y-3 self-start">
          {ALL_SECTIONS.map((section) => (
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
                {activeTopic.whenNeeded && (
                  <p className={`mt-2 inline-flex items-start gap-2 rounded-xl ${palette.bgLight} ${palette.border} border px-3 py-2 text-sm ${palette.text}`}>
                    <Sparkles className="mt-0.5 size-4 shrink-0" />
                    <span>
                      <span className="font-semibold">Mikor kell ez neked? </span>
                      {activeTopic.whenNeeded}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Folyamatábra — nyíllal kötött lépés-dobozok (B2, 2026-06-11) */}
          {activeTopic.flow && activeTopic.flow.length > 0 && (
            <div className={`card-raised border ${palette.border} p-4`}>
              <p className={`mb-3 text-xs font-bold uppercase tracking-wide ${palette.text}`}>
                A folyamat egy pillantásra
              </p>
              <div className="flex flex-wrap items-stretch gap-y-3">
                {activeTopic.flow.map((node, i) => (
                  <div key={i} className="flex items-center">
                    <div
                      className={`flex min-w-[110px] max-w-[180px] flex-col justify-center rounded-xl bg-gradient-to-br ${palette.gradient} px-3 py-2 text-white shadow-sm`}
                    >
                      <span className="text-[13px] font-semibold leading-tight">{node.label}</span>
                      {node.sub && (
                        <span className="mt-0.5 text-[11px] leading-tight text-white/85">{node.sub}</span>
                      )}
                    </div>
                    {i < activeTopic.flow!.length - 1 && (
                      <span className={`mx-1.5 text-lg font-bold ${palette.text}`}>→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Gyakori hibák — piros kártyák (B2, 2026-06-11) */}
          {activeTopic.commonMistakes && activeTopic.commonMistakes.length > 0 && (
            <div className="card-raised border border-rose-200 bg-rose-50/50 p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-rose-700">
                Gyakori hibák — ezekre figyelj!
              </p>
              <ul className="space-y-2">
                {activeTopic.commonMistakes.map((m, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700">
                      ✕
                    </span>
                    <p className="text-sm leading-6 text-slate-700">{m}</p>
                  </li>
                ))}
              </ul>
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
              {allTopics.length} téma · {ALL_SECTIONS.length} kategória
            </span>
          </div>
        </div>

        {/* ───── JOBB: ÉLŐ ÉV-VÉGI CHECKLIST ─────
            xl-en saját sticky oszlop; lg-n (2 oszlop) teljes szélességű sor a
            tartalom alatt; mobilon a lap alja. EGY példány — a pipák állapota
            (localStorage) így sosem duplázódik. */}
        <div className="lg:col-span-2 xl:col-span-1 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto xl:pr-0.5">
          <FinanceSugoChecklist finalizeHref={finalizeHref} />
        </div>
      </div>
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
