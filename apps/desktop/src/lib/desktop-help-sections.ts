/**
 * Desktop-specifikus Pénzügy-súgó szekció (2026-06-10, C-hullám).
 *
 * A megosztott `FinanceSugoTab` `extraSections` prop-ján keresztül kerül a súgó
 * VÉGÉRE, külön „Asztali (offline) verzió" kategóriaként — így a lelkész a
 * webbel közös magyarázat MELLETT pontosan megérti, mi vonatkozik kimondottan
 * az ASZTALI (letölthető, offline képes) verzióra: offline mód, szinkronizáció,
 * iratszám-tárca, az asztali írási út (tétel rögzítése, sztornó, visszavonás),
 * az ütközés-feloldás, és hogy mi működik internet nélkül.
 *
 * Csak adat (Section[]) — a tényleges renderelést a megosztott FinanceSugoTab végzi.
 */

import {
  AlertTriangle,
  Ban,
  Download,
  Eye,
  ListPlus,
  Monitor,
  RefreshCw,
  Wallet,
  WifiOff,
} from 'lucide-react'

import type { Section } from '@kartoteka/ui-app'

export const DESKTOP_HELP_SECTIONS: Section[] = [
  {
    key: 'asztali-verzio',
    label: 'Asztali (offline) verzió',
    description: 'Ami kimondottan a letölthető appra vonatkozik',
    icon: Monitor,
    topics: [
      {
        key: 'offline-mod',
        label: 'Offline mód — így működik',
        icon: WifiOff,
        color: 'teal',
        shortDescription: 'Internet nélkül is használható, helyi titkosított másolattal',
        intro:
          'Az asztali Kartotéka a felhőből letöltött adatok HELYI, titkosított másolatával dolgozik — így internet nélkül is megnyithatod és használhatod. A felhő a hiteles forrás; a helyi másolat mindig onnan frissül.',
        whatItDoes:
          'A gép egy titkosított helyi adatbázisban (SQLCipher) tárolja a gyülekezet adatait. Amit offline rögzítesz, az sorba áll, és a hálózatra csatlakozáskor automatikusan felmegy a felhőbe.',
        howItWorks: [
          {
            text: 'Bejelentkezés után (online) az app automatikusan letölti a gyülekezet adatait a gépre.',
          },
          {
            text: 'Ezután internet nélkül is megnyithatod az appot — a legutóbb letöltött adatokat látod.',
          },
          {
            text: 'Amit offline rögzítesz, az „szinkronizálásra vár", és hálózatra csatlakozáskor magától felmegy.',
            hint: 'A felső státuszsáv jelzi, hogy online vagy offline vagy-e éppen.',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'Az ELSŐ használat előtt legyen egyszer hálózat, hogy letöltődjenek az adatok. Ha egy lista üres, az általában azt jelenti, hogy az a rész még nem szinkronizálódott — csatlakozz egyszer az internetre.',
          },
        ],
      },
      {
        key: 'szinkronizacio',
        label: 'Szinkronizáció (letöltés és feltöltés)',
        icon: RefreshCw,
        color: 'blue',
        shortDescription: 'Felhőből LE (friss adat) és gépről FEL (a rögzítéseid)',
        intro:
          'A szinkronizáció két irányú: a felhőből LE (hogy mindig friss adatot láss) és a gépről FEL (hogy az offline rögzített tételeid felmenjenek a felhőbe).',
        whatItDoes:
          'Letöltés (pull): automatikus, rendszeres. Feltöltés (push): a „kimenő sorban" (outbox) várakozó offline tételeket küldi fel a felhőbe.',
        howItWorks: [
          {
            text: 'A letöltés magától fut a háttérben (a fő adatok gyakrabban, a teljes készlet ritkábban), és hálózatra csatlakozáskor is.',
          },
          {
            text: 'A feltöltés a sorba állított offline tételeket küldi: hálózatra csatlakozáskor automatikusan, vagy kézzel a „Sync most" gombbal.',
          },
          {
            text: 'A frissült adatok azonnal megjelennek a felületen — nem kell újraindítani az appot.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Ha valami nem frissül, használd a „Sync most" gombot (a szinkronizálásra váró tételek blokkjában), vagy nézd meg a Beállítások → Adat & biztonság részt.',
          },
        ],
      },
      {
        key: 'iratszam-tarca',
        label: 'Iratszám-tárca (offline sorszámok)',
        icon: Wallet,
        color: 'amber',
        shortDescription: 'Előre lefoglalt sorszám-készlet az offline rögzítéshez',
        intro:
          'Offline a gép NEM tud sorszámot kérni a szervertől — ezért egy előre lefoglalt sorszám-készletet (tárcát) használ. Ebből kapnak iratszámot az offline rögzített készpénzes tételek, ütközés nélkül.',
        whatItDoes:
          'Egy adag, előre lefoglalt iratszám a gépen. Online módban töltöd fel; offline ebből „fogy" minden készpénzes bevétel/kiadás.',
        howItWorks: [
          {
            text: 'Online módban, a Befizetés vagy Kiadás oldalon az „Iratszám-tárca" panelen a +10 gombbal tölts fel sorszámokat.',
          },
          {
            text: 'Offline a készpénzes tétel rögzítésekor a tárcából kap sorszámot — a mezőt nem kell kézzel kitöltened.',
          },
          {
            text: 'Amikor a tétel felmegy a felhőbe, a sorszám véglegesül.',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'Ha a tárca KIFOGY offline, nem tudsz több készpénzes tételt rögzíteni, amíg nem vagy újra online és nem töltöd fel. Hosszabb offline időszak (pl. tábor, kiszállás) előtt tölts fel BŐVEN — inkább több, mint kevesebb.',
          },
        ],
      },
      {
        key: 'tetel-rogzites-asztali',
        label: 'Tétel rögzítése az asztali appban',
        icon: ListPlus,
        color: 'emerald',
        shortDescription: 'A „+ Tétel rögzítése" — online és offline viselkedés',
        intro:
          'A Pénzügy oldal tetején a „+ Tétel rögzítése" gomb — pontosan úgy néz ki és működik, mint a webfelületen. Egy ablakban, Bevétel/Kiadás füleken egyszerre több készpénzes tételt vihetsz fel; a Mentés dátum szerint rendez.',
        whatItDoes:
          'Készpénzes bevételek és kiadások gyors, tömeges rögzítése — online azonnal a felhőbe, offline az iratszám-tárcából + sorba állítva.',
        howItWorks: [
          {
            text: 'Online: a tételek AZONNAL a felhőbe kerülnek, ugyanúgy, mint a webfelületen.',
          },
          {
            text: 'Offline: a készpénzes tételek a tárcából kapnak sorszámot, és „szinkronizálásra várnak"; csatlakozáskor automatikusan felmennek.',
          },
          {
            text: 'A kiadáshoz KÖTELEZŐ az átvevő megadása (a teljesebb, ellenőrizhető nyilvántartásért).',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'Banki átutalás internet nélkül NEM rögzíthető — offline csak készpénz. Online minden megy.',
          },
          {
            kind: 'tip',
            text: 'A belső mozgást (kassza ↔ bank) a Pénzügy → Belső mozgás oldalon rögzítsd, ahol a banki forrás és cél pontosan megadható.',
          },
        ],
      },
      {
        key: 'storno-asztali',
        label: 'Sztornó és sztornó-visszavonás (Kassza fül)',
        icon: Ban,
        color: 'rose',
        shortDescription: 'Téves tétel érvénytelenítése — és a sztornó visszavonása',
        intro:
          'A Kassza fülön egy téves tétel sztornózható (érvényteleníthető), és a sztornó vissza is vonható — pontosan úgy, mint a webfelületen.',
        whatItDoes:
          'A sztornózott tétel NEM törlődik: áthúzva, indoklással marad a nyilvántartásban, és kimarad a számításokból. A visszavonás ismét beszámítja.',
        howItWorks: [
          {
            text: 'A Kassza fülön a sor mellett a ⊘ (sztornó) ikon → kötelező indoklás (legalább 5 karakter).',
          },
          {
            text: 'A kapcsolt nyugták és a belső mozgás párja automatikusan vele sztornózódik.',
          },
          {
            text: 'Sztornózott soron a ↺ (visszavonás) ikon a sztornót visszavonja, és a tétel ismét bekerül a számításokba.',
          },
        ],
        tips: [
          {
            kind: 'warning',
            text: 'A sztornó és a visszavonás ONLINE művelet (közvetlenül a felhőbe ír) — internet nélkül nem megy.',
          },
          {
            kind: 'warning',
            text: 'Lezárt (véglegesített) évnél a sztornó és a visszavonás védve van — előbb javítási engedély kell az egyházmegyétől.',
          },
        ],
      },
      {
        key: 'utkozesek',
        label: 'Ütközések feloldása',
        icon: AlertTriangle,
        color: 'orange',
        shortDescription: 'Ha két eszköz ugyanazt a sorszámot használja',
        intro:
          'Ha két eszköz (pl. két gép, vagy gép és webfelület) ugyanazt a sorszámot használja, a feltöltéskor ütközés keletkezhet. A tétel ilyenkor nem vész el — te döntöd el, hogyan oldódjon fel.',
        whatItDoes:
          'A rendszer észleli az ütközést, és a tételt „ütközés" jelzéssel mutatja a szinkronizálásra váró tételek között.',
        howItWorks: [
          {
            text: 'Az offline rögzített, feltöltésre váró tételek a Befizetés/Kiadás oldalon a „Szinkronizálásra vár" blokkban látszanak.',
          },
          {
            text: 'Ütközés esetén a tételre kattintva feloldó ablak nyílik: új sorszám kérése, a tétel elvetése, vagy újrapróbálás.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Ütközés ritkán fordul elő, ha egy gyülekezetben egyszerre csak egy helyen rögzítenek pénzügyet.',
          },
        ],
      },
      {
        key: 'offline-vs-online',
        label: 'Mi megy offline, mi csak online',
        icon: Eye,
        color: 'slate',
        shortDescription: 'Gyors összefoglaló, mit használhatsz internet nélkül',
        intro:
          'Az asztali app a legtöbb dolgot internet nélkül is tudja, de néhány művelet a felhővel való azonnali egyeztetést igényel.',
        whatItDoes:
          'A napi készpénzes munka offline is zökkenőmentes; a ritkább, banki/külső műveletekhez hálózat kell.',
        howItWorks: [
          {
            text: '✅ OFFLINE megy: minden szinkronizált adat MEGTEKINTÉSE (tagok, pénzügy, anyakönyv, leltár…) és a KÉSZPÉNZES bevétel/kiadás rögzítése (az iratszám-tárcából).',
          },
          {
            text: '🌐 CSAK ONLINE: banki tételek rögzítése, sztornó és sztornó-visszavonás, belső mozgás, nyugta-kiállítás, banki Excel-import, Oblio e-Factura.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Tervezd úgy: a napi készpénzt offline is rögzítheted, a havi/ritkább műveleteket (bank, Oblio, számadás-zárás) pedig akkor, amikor van hálózat.',
          },
        ],
      },
      {
        key: 'frissites',
        label: 'Az asztali app frissítése',
        icon: Download,
        color: 'violet',
        shortDescription: 'Az asztali app KÜLÖN frissül a webfelülettől',
        intro:
          'Az asztali Kartotéka KÜLÖN frissül — a webfelület frissülése NEM frissíti automatikusan a telepített appot. Az új verziók a beépített frissítőn keresztül érkeznek.',
        whatItDoes:
          'Az app ellenőrzi, van-e újabb verzió, és letölti azt — így a legújabb funkciók (pl. a most bevezetett pénzügyi rögzítés) is elérhetővé válnak.',
        howItWorks: [
          {
            text: 'Induláskor, illetve a Beállítások → Frissítés résznél az app ellenőrzi az elérhető újabb verziót.',
          },
          {
            text: 'Új verzió esetén letölti, és a következő indításkor élesíti.',
          },
        ],
        tips: [
          {
            kind: 'tip',
            text: 'Érdemes időnként frissíteni, hogy a legújabb pénzügyi és egyéb funkciók a kezedben legyenek.',
          },
        ],
      },
    ],
  },
]
