'use client'

/**
 * Igazolás / hivatalos levél kiállító és iktató (2026-07, F6 redesign — K4).
 *
 * Lépéses felépítés (balra vezérlők, jobbra élő A4-előnézet; lg alatt fül-váltó):
 *  (a) sablon-választó — a meglévő iktató-sablonok + „Szabad levél" üres törzzsel,
 *  (b) személy-kereső — több személy (pl. házaspár) kiválasztható chip-listával,
 *      az anyakönyvi adatok (szemely-actions) automatikusan töltik a placeholdereket;
 *      a személyi kartonról nyitva az `initialPersonIds` prop előre betölti a tagot,
 *  (c) fejléc-választó — többnyelvű hivatalos levélfej (letterheads.buildLetterheadHtml),
 *  (d) placeholder-űrlap + szerkeszthető törzs-szöveg.
 *
 * „Kiállítás és iktatás": a saveFilingEntry-t hívja (atomikus next_iktato_sequence
 * RPC-vel — NEM duplikáljuk az iktatási logikát), majd a ténylegesen kiosztott
 * iratszám kerül a dokumentum {{iratszam}} helyére, és az IKTATOTT példány
 * nyomtatható/PDF-ezhető. Iktatás NÉLKÜLI nyomtatás is lehetséges (figyelmeztetéssel).
 *
 * TÖBB SZEMÉLY — dokumentált konvenció:
 *  - a szám nélküli placeholderek ({{nev}}, {{szul_datum}}, …) mindig az
 *    1. kiválasztott személy adatai,
 *  - a 2. személy adatai a `_2` végű placeholderekbe kerülnek ({{nev_2}}, …),
 *  - {{nevek}} = az összes kiválasztott név „és"-sel összefűzve,
 *  - {{ferj_nev}} / {{feleseg_nev}} a kiválasztottak közül nem szerint töltődik,
 *  - {{eskuvo_datuma}} = az első ismert egyházi házasság-dátum a kiválasztottak közül.
 *
 * Záró blokk / iratszám-sor heurisztika: ha a törzs NEM tartalmaz
 * {{lelkipasztor}} placeholdert, a dokumentum végére automatikus záró blokk
 * kerül (helység + dátum + aláírás); ha nem tartalmaz {{iratszam}}-ot, az
 * elejére „Szám: {{iratszam}}" sor kerül — így a seed-sablonok (amelyekben
 * mindkettő benne van) nem duplázódnak, a Szabad levél viszont teljes.
 *
 * Tárgy-sor (2026-07, F8a): a „Szám: …" sor ALÁ a keret strukturálisan
 * beírja a „Tárgy: {tárgy}" sort az iktatókönyvi tárgy-mező értékével.
 * Duplikátum-őr: ha a törzs ELEJE már tartalmaz saját „Tárgy:" szöveget
 * (régi, DB-ben maradt seed-sablonok / egyedi sablonok), a keret kihagyja.
 *
 * WYSIWYG: az előnézet, a PDF és a nyomtatás UGYANAZT a HTML-t kapja
 * (fit-to-width A4 iframe, a worklog-print-dialog mintája szerint).
 *
 * 2026-07-25 (F8b — B4) két speciális mód:
 *  - ÉLETÚT-MÓD: a sablon-választó kiemelt „⭐ Életút- és családi igazolás"
 *    opciója — EGY személy, getEletutAdat betöltés, hiány-figyelmeztető panel
 *    nyomtatható TODO-listával (a kiállítás hiányok mellett is engedett,
 *    kitöltő-vonalakkal), kézi mezők (kérelmező/cél/sírhely/főgondnok), az
 *    előnézet a buildEletutIgazolasHtml háromnyelvű nyomtatványát mutatja,
 *    az iktatás a meglévő saveFilingEntry-úton történik.
 *  - ÁTADÁS-MÓD: az „Egyháztag átadása másik egyházközségnek" seed-sablon
 *    (név-alapú felismerés) cél-gyülekezet keresőt kap (searchCongregations,
 *    debounced) — a kiválasztott név a {{cel_gyulekezet}} placeholderbe kerül,
 *    sikeres iktatás után pedig a registerAtadas rögzíti az átadás tényét
 *    (tag-státusz „elköltözött" + átjelentkezési értesítés a cél-gyülekezetnek).
 *
 * 2026-07-25 (F8c — nyelvfüggetlen dokumentum-családok) éles teszt-észrevételek
 * nyomán a kiállító elsődleges útja a DOKUMENTUM-CSALÁD lett
 * (lib/iktato/dokumentum-csaladok.ts):
 *  - a NYELV a DOKUMENTUM tulajdonsága: EGYETLEN „Dokumentum nyelve" (hu/ro/en)
 *    választó vezérli a fejlécet (buildLetterheadHtml), a Szám/Tárgy címkéket
 *    (NYELV_CIMKEK), a keltezést (keltezesSor + a helység nyelvhelyes neve:
 *    helysegHu/helysegRo) ÉS a család-törzset (buildBody) — nincs többé külön
 *    „román sablon", ami magyar kerettel keveredhetne;
 *  - a sablon-választó CSOPORTOSÍTOTT: ⭐ Életút → Igazolások (családok) →
 *    Levelek (családok + Szabad levél) → Saját sablonok (a DB-ből, a 11 seed-név
 *    kiszűrve — azok szerepét a családok vették át; a Sablonok fül változatlan);
 *  - a család maxSzemely-e vezérli a kereső-limitet, a törzs personönkénti
 *    bekezdésekkel épül; az iktatókönyvi tárgy automatikusan
 *    „{család neve} — {nevek}" (szerkeszthető marad);
 *  - ANYAKÖNYVI GYORS-BEVEZETÉS: ha a kiválasztott személynél hiányzik a
 *    keresztelés/konfirmálás/házasság dátuma, mini-űrlap hívja a meglévő
 *    anyakönyvi CREATE actionöket (saveBaptism/saveConfirmationBatch/
 *    saveMarriage), majd a személy-adatok újratöltődnek — az anyakönyv is
 *    gazdagodik (a registry-dialógusok személy-előtöltése csak edit-módú
 *    editEntry-n át megy, ezért nem újrahasznosíthatók create-ra);
 *  - életút-módban új „Igazolás nyelve" választó (hu/ro/en/háromnyelvű) →
 *    buildEletutIgazolasHtml nyelvMod.
 *
 * 2026-07-25 (F8f — KIPIPÁLHATÓ ESEMÉNYEK) a user éles észrevétele nyomán:
 *  - „Kimaradt a konfirmálás. De ezek legyenek kipipálható konfirmációk, hogy
 *    ezek közül melyik kerüljön bele a szövegbe!" → a család-út Adatok-szekciója
 *    „Az igazolás tartalma" pipa-csoporttal indul (Keresztelés / Konfirmáció /
 *    Házasságkötés — amit a család `esemenyOpciok`-ban kínál). A kiválasztás a
 *    buildBody `esemenyek` opciójába megy, így az élő előnézet azonnal követi.
 *  - A pipák ALAPÁLLAPOTA a család `alap` értéke, de a KIEGÉSZÍTŐ eseményekről
 *    (amiről a dokumentum nem szól) a pipa automatikusan lekerül, ha a
 *    kiválasztott személyeknél nincs rá adat (vanEsemenyAdat). A család MAG-
 *    eseménye (keresztelési igazoláson a keresztelés — CSALAD_ANYAKONYV_KINDS)
 *    adat híján is bepipálva marad, különben a dokumentum kiürülne. A jelölő
 *    mindkét irányban átállítható: adat nélkül bepipálva kitöltő-vonal kerül a
 *    szövegbe, ami a papíron kézzel pótolható (ezt jelzés is írja az űrlapon,
 *    a hiányzó dátum pedig a gyors-bevezetéssel az anyakönyvbe is bevezethető).
 *    A kézzel átállított pipa a személy-váltást is túléli (lásd esemenyAllapot).
 *  - „Keresztelés esetén a keresztszülőség egyértelmű" → a keresztelési igazolás
 *    `cel` mezőjének `alapertek`-je („keresztszülőség") előtöltésre kerül
 *    (a család-váltás kézi-mező inicializálása már ma is tiszteletben tartja).
 *
 * 2026-07-25 (F8e — A4-tipográfia + előnézet-gyökérfix) a kutatási tervdoc
 * (docs/project-tracking/KARTOTEKA-a4-tipografia-elonezet-kutatas-2026-07-25.md)
 * alapján:
 *  - A DOKUMENTUM HTML-je a KANONIKUS A4-burokból épül
 *    (lib/iktato/dokumentum-stilus.ts → dokumentumBurok): `.page` flex-oszlop
 *    (fejléc / törzs / aláírás), DIN 5008 margók (20/20/18/25 mm), 12 pt serif,
 *    1.45 sorköz, balra zárt + `hyphens: auto` a `lang` attribútummal — a
 *    korábbi ad-hoc 50px-es paddingek és a keret-sorok saját stílusai helyett.
 *    Az aláírás-blokk a `margin-top:auto` miatt MINDIG a szövegtükör alján ül.
 *  - ELŐNÉZET-SKÁLÁZÁS (3. bejelentés — gyökérfix): a tervdoc 4. fejezetének
 *    3-rétegű mintája — scroll-host (itt MÉRÜNK) → fit-wrapper (layout-méret =
 *    A4 × scale, ez van centrálva) → iframe (fix A4-szélesség, `transform:
 *    scale()`, `transform-origin: 0 0`). A transform a layout UTÁN hat, ezért a
 *    wrapper méretét KÉZZEL szorozzuk a skálával — enélkül lógott túl/vágódott
 *    le a lap. Mérés: callback-ref + ResizeObserver rAF-halasztással,
 *    0-mérés-őrrel (rejtett panel) és 0.0005-ös küszöbbel (RO-loop ellen).
 *    A lap MINDIG teljes szélességében látszik, vízszintes görgetés nincs.
 *  - NYELV: a választó NÉMETTEL bővült (hu/ro/en/de). A dokumentumon a
 *    „Tárgy" a dokumentum nyelvén, a család nyelvhelyes nevével (nevNyelv)
 *    jelenik meg; az iktatókönyvi tárgy-mező MARAD magyar (magyar iktatókönyv).
 *  - KELTEZÉS HELYSÉGE: szerkeszthető mező (előtöltve a nyelvhelyes névvel) —
 *    a hiányzó strukturált helység-hivatkozás miatti „Brateș a magyar iraton"
 *    hiba biztos megoldása; ugyanez megy az életút-nyomtatványba is.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CalendarPlus,
  Download,
  ListChecks,
  Loader2,
  Printer,
  Search,
  Stamp,
  UserRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { saveFilingEntry } from '@/app/(dashboard)/iktato/actions'
import {
  generateNextIratszam,
  getAutoPlaceholderContext,
  listFilingTemplates,
  seedDefaultFilingTemplates,
} from '@/app/(dashboard)/iktato/template-actions'
import {
  getCongregationHeader,
  getPersonCertificateData,
  searchPersonsForCertificate,
} from '@/app/(dashboard)/iktato/szemely-actions'
import { getEletutAdat } from '@/app/(dashboard)/iktato/eletut-actions'
import { registerAtadas, searchCongregations } from '@/app/(dashboard)/iktato/atadas-actions'
import {
  saveBaptism,
  saveConfirmationBatch,
  saveMarriage,
} from '@/app/(dashboard)/anyakonyv/actions'
import {
  MemberSearchSelect,
  type MemberSearchResult,
} from '@/components/registry/member-search-select'
import {
  PLACEHOLDER_DOCS,
  SEED_TEMPLATES,
  buildAutoValues,
  escapeHtml,
  extractPlaceholders,
  formatHungarianDate,
  renderTemplate,
  type FilingTemplate,
  type TemplateType,
} from '@/lib/filing/templates'
import { buildLetterheadHtml } from '@/lib/iktato/letterheads'
import {
  DOKUMENTUM_CSALADOK,
  NYELV_CIMKEK,
  getDokumentumCsalad,
  keltezesSor,
  vanEsemenyAdat,
  type DokumentumCsalad,
  type DokumentumNyelv,
  type EsemenyKulcs,
} from '@/lib/iktato/dokumentum-csaladok'
import { A4_H_PX, A4_W_PX, dokumentumBurok } from '@/lib/iktato/dokumentum-stilus'
import {
  buildEletutIgazolasHtml,
  buildEletutTodoHtml,
  type EletutNyelvMod,
} from '@/lib/iktato/eletut-igazolas'
import type { EletutAdat, EletutHiany, EletutIgazolasData } from '@/lib/iktato/eletut-types'
import type { CongregationSearchHit } from '@/lib/iktato/atadas-types'
import type {
  CertificatePersonHit,
  CongregationHeaderData,
  LetterheadLang,
  PersonCertData,
} from '@/lib/iktato/certificate-types'
import {
  formatUgykorLabel,
  getRetentionForUgykor,
} from '@/lib/constants/filing-ugykorjegyzek'
import { sanitizeFilingHtml } from '@/lib/public-site/sanitize'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

// ─────────────────────────────────────────────────────────────────
// Konstansok, segédek
// ─────────────────────────────────────────────────────────────────

/** A „Szabad levél" virtuális sablon-azonosítója a select-ben. */
const FREE_LETTER_ID = '__szabad_level__'

/** Az életút-/családi igazolás (F8b) speciális mód virtuális azonosítója. */
const ELETUT_ID = '__eletut_igazolas__'

/** A dokumentum-családok virtuális select-értékének előtagja (F8c). */
const CSALAD_PREFIX = '__csalad__:'

/**
 * A beépített seed-sablonok nevei — a kiállító „Saját sablonok" csoportjából
 * KISZŰRVE (F8c): a szerepüket a nyelvfüggetlen dokumentum-családok vették át,
 * így nem dupláznák a választót. A Sablonok fül (szerkesztés/pótlás) változatlan.
 */
const SEED_NEV_SET = new Set(SEED_TEMPLATES.map((t) => t.nev))

/** Az aláírás-blokk szerep-felirata a dokumentum nyelvén (F8c, család-út). */
const ALAIRO_SZEREP: Record<DokumentumNyelv, string> = {
  hu: 'lelkipásztor',
  ro: 'preot paroh',
  en: 'minister',
  de: 'Pfarrer',
}

/**
 * A „Dokumentum nyelve" választó opciói (F8e — NÉMETTEL bővítve).
 *
 * Szándékosan NEM a letterheads LETTERHEAD_LANGS listája: az a levélfej-építő
 * (LetterheadLang = hu/ro/en) saját készlete, a dokumentum nyelve viszont a
 * német változatot is ismeri (DokumentumNyelv).
 */
const DOC_LANG_OPTIONS: Array<{ value: DokumentumNyelv; label: string }> = [
  { value: 'hu', label: 'Magyar' },
  { value: 'ro', label: 'Română' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
]

/**
 * A hivatalos levélfej HTML-je a dokumentum nyelvén.
 *
 * 2026-07-25 (F8e): a letterheads.ts natív német ágat kapott (Reformierte
 * Kirchengemeinde / Pfarramt), ezért a korábbi „angol fejléc + felirat-csere"
 * áthidalás megszűnt — a négy nyelv (hu/ro/en/de) egy az egyben átmegy.
 */
function fejlecHtmlNyelven(nyelv: DokumentumNyelv, header: CongregationHeaderData): string {
  return buildLetterheadHtml(nyelv as LetterheadLang, header)
}

/**
 * Az aláírás-blokk (keltezés + aláírás-vonal) HTML-je a dokumentum-stílus
 * OSZTÁLY-SZERZŐDÉSE szerint (.alairas-sor / -kelt / -blokk / -vonal / -nev /
 * -szerep). A burok `.page__sign` sávjába kerül, amely `margin-top:auto`-val a
 * szövegtükör ALJÁRA húzza — így nem marad „lógó" üres rész a lap alján
 * (kutatás 1. pont). App-generált markup, minden dinamikus érték escape-elve.
 */
function alairasBlokkHtml(keltSor: string, alairo: string, szerep: string): string {
  const nev = (alairo || '').trim()
  return `<div class="alairas-sor">
  <div class="alairas-kelt">${escapeHtml(keltSor)}</div>
  <div class="alairas-blokk">
    <div class="alairas-vonal"></div>
    <div class="alairas-nev">${nev ? escapeHtml(nev) : '&nbsp;'}</div>
    <div class="alairas-szerep">${escapeHtml(szerep)}</div>
  </div>
</div>`
}

/** Az egyháztag-átadás flow-t bekapcsoló seed-sablon neve (név-alapú felismerés). */
const ATADAS_SABLON_NEV = 'Egyháztag átadása másik egyházközségnek'

/** Az életút-igazolás alapértelmezett kiállítási célja (cél-záradék). */
const ELETUT_CEL_ALAPERTEK = 'hatósági felhasználás'

/**
 * Üres fejléc-fallback az életút-nyomtatványhoz: fejléc-betöltési hibánál a
 * nyomtatvány kitöltő-vonalas rovatokkal így is elkészül (a hibát a felület
 * külön jelzi) — a buildEletutIgazolasHtml kötelező header-paramétere miatt.
 */
const URES_FEJLEC: CongregationHeaderData = {
  hivatalosNev: '',
  nevHu: null,
  nevRo: null,
  nevEn: null,
  cimHu: null,
  cimRo: null,
  telefon: null,
  email: null,
  cif: null,
  web: null,
  cimerUrl: null,
  helysegHu: null,
  helysegRo: null,
}

/** Legfeljebb ennyi személy választható ki (pl. házaspár + 2 gyermek). */
const MAX_PERSONS = 4

/**
 * Fit-to-page előnézet: a lap-wrapper 1px-es keretének (bal+jobb) levonása a
 * mért szélességből — így a keretes lap SEM lóghat túl a görgető-dobozon.
 * (Az A4-méretek a kanonikus dokumentum-stílusból jönnek: A4_W_PX/A4_H_PX.)
 */
const LAP_KERET_PX = 2

/** Az előnézet minimális skálája (kutatás 4. pont: Math.max(minScale, …)). */
const MIN_SCALE = 0.2

/**
 * Sablon-típus → jellemző EREK 2024-es ügykör-kód. Az igazolások a 2. pontba
 * (Anya- és családkönyvi levelezés — „keresztelési és konfirmációi igazolások"),
 * a levelek/meghívók az 1. pontba (Levelezés) tartoznak. A többi típusnál nem
 * találgatunk — ott az iktatás ügykör nélkül történik, utólag besorolható.
 */
const TIPUS_UGYKOR: Partial<Record<TemplateType, string>> = {
  igazolas: '2.',
  level: '1.',
  meghivo: '1.',
}

/** Az anyakönyvből automatikusan kezelt placeholder-kulcsok (törléshez/hinthez). */
const PERSON_MANAGED_KEYS = new Set<string>([
  'nev', 'szul_datum', 'apja_neve', 'anyja_neve', 'vallas',
  'kereszteles_datuma', 'keresztszulok', 'kereszteles_helye',
  'konfirmalas_datuma', 'hazastars_nev',
  'nev_2', 'szul_datum_2', 'apja_neve_2', 'anyja_neve_2', 'vallas_2',
  'kereszteles_datuma_2', 'keresztszulok_2', 'kereszteles_helye_2',
  'konfirmalas_datuma_2', 'hazastars_nev_2',
  'nevek', 'ferj_nev', 'feleseg_nev', 'eskuvo_datuma',
])

/** A mai nap LOKÁLIS dátuma ISO formában (a toISOString UTC-csúszása nélkül). */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** ISO dátum (YYYY-MM-DD…) → magyar forma („1990. május 12."); hibásnál az eredeti. */
function fmtDateHu(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return iso
  return formatHungarianDate(d)
}

/** Nevek magyaros összefűzése: „A", „A és B", „A, B és C". */
function joinNamesHu(names: string[]): string {
  const list = names.map((n) => (n || '').trim()).filter(Boolean)
  if (list.length <= 1) return list[0] || ''
  return `${list.slice(0, -1).join(', ')} és ${list[list.length - 1]}`
}

/**
 * A kiválasztott személyek → placeholder-értékek (lásd a fejléc-kommentben
 * dokumentált konvenciót: szám nélkül = 1. személy, `_2` = 2. személy).
 */
function buildPersonValues(persons: PersonCertData[]): Record<string, string> {
  const v: Record<string, string> = {}
  const set = (key: string, val: string | null | undefined) => {
    const s = (val || '').trim()
    if (s) v[key] = s
  }
  persons.slice(0, 2).forEach((p, i) => {
    const s = i === 0 ? '' : '_2'
    set(`nev${s}`, p.teljesNev)
    set(`szul_datum${s}`, fmtDateHu(p.szuletesiDatum))
    set(`apja_neve${s}`, p.apjaNeve)
    set(`anyja_neve${s}`, p.anyjaNeve)
    set(`vallas${s}`, p.vallas)
    set(`kereszteles_datuma${s}`, fmtDateHu(p.keresztelesDatum))
    set(`keresztszulok${s}`, p.keresztszulok)
    set(`kereszteles_helye${s}`, p.keresztelesHelye)
    set(`konfirmalas_datuma${s}`, fmtDateHu(p.konfirmalasDatum))
    set(`hazastars_nev${s}`, p.hazastarsNev)
  })
  set('nevek', joinNamesHu(persons.map((p) => p.teljesNev)))
  set('ferj_nev', persons.find((p) => p.nem === 'ferfi')?.teljesNev)
  set('feleseg_nev', persons.find((p) => p.nem === 'no')?.teljesNev)
  set('eskuvo_datuma', fmtDateHu(persons.map((p) => p.hazassagDatum).find(Boolean) || null))
  return v
}

/** Placeholder-címke a katalógusból (PLACEHOLDER_DOCS), különben maga a kulcs. */
function placeholderLabel(key: string): string {
  return PLACEHOLDER_DOCS.find((p) => p.key === key)?.label || key
}

/**
 * Életút-mód, még kiválasztott személy nélkül: A4-es tájékoztató lap az
 * előnézet-iframe-be (a fit-to-page méretezés így is helyesen működik).
 * F8e: a kanonikus A4-burokból épül — nincs külön, kézzel írt stíluslap.
 */
function eletutUresElonezetHtml(): string {
  return dokumentumBurok({
    lang: 'hu',
    cim: 'Életút- és családi igazolás',
    torzsHtml:
      '<p style="text-align:center;color:#64748b;margin-top:40mm;">Válassz ki egy egyháztagot a keresővel — a hivatalos életút-igazolás élő előnézete itt jelenik meg.</p>',
  })
}

/**
 * Duplikátum-őr a keret Tárgy-sorához: ha a törzs ELEJÉN már van saját
 * „Tárgy:" szöveg (egyedi/régi sablonok), a keret NEM tesz rá másodikat.
 * A vizsgált ablak 400 karakter (nem ~200): a régi, DB-ben maradt
 * seed-sablonokban a belső Tárgy-címsor a nyitó div-ek inline stílusai
 * MIATT kb. a 240–250. karakternél kezdődik.
 */
function bodyHasOwnTargy(body: string): boolean {
  // Mindhárom fejléc-nyelv címkéjét felismerjük (régi/egyedi sablonok védelme).
  return /(Tárgy|Obiect|Subject)\s*:/i.test(body.slice(0, 400))
}

// A keret „Szám:" és „Tárgy:" címkéi a DOKUMENTUM nyelvét követik (F8c):
// a kanonikus címke-készlet a dokumentum-családok moduljából jön
// (NYELV_CIMKEK — „Szám/Tárgy", „Nr./Obiect", „No./Subject").

/** A sablon-út (saját sablonok / szabad levél) törzs-előkészítésének eredménye. */
interface TorzsSablon {
  /** A MÉG placeholderes törzs-HTML (a renderTemplate tölti ki). */
  torzs: string
  /** Kell-e a keretnek külön „Szám: …" sort adnia (a törzsben nincs iratszám)? */
  szamSorKell: boolean
  /** Kell-e a keretnek külön „Tárgy: …" sort adnia (a törzsbe nem került be)? */
  targySorKell: boolean
  /** Kell-e a keretnek aláírás-blokkot adnia (a törzsben nincs {{lelkipasztor}})? */
  alairasKell: boolean
}

/**
 * A sablon-törzs előkészítése a kanonikus A4-burokhoz (F8e).
 *
 * A korábbi verzió MAGA rakta össze a teljes iratot (ad-hoc 50px-es paddingek,
 * saját Times-stílusok, kézi záró blokk) — ezt most a dokumentumBurok végzi
 * (`.page` flex-oszlop + tipográfia), ez a függvény csak a TÖRZSET adja, és
 * megmondja, mely keret-elemek hiányoznak belőle:
 *  - Szabad levélnél a plain-text törzs pre-wrap wrapperbe kerül,
 *  - ha a törzs hozza a saját „Szám: {{iratszam}}" sorát, a keret nem duplázza,
 *  - a Tárgy-sor lehetőleg a törzs saját „Szám: …" sora ALÁ fűződik (F8a),
 *    különben a keret adja; a bodyHasOwnTargy-őr védi a duplázástól a saját
 *    Tárgy-sorral bíró (régi/egyedi) sablonokat,
 *  - ha a törzsben nincs {{lelkipasztor}}, az aláírás-blokk a keretből jön.
 * ⚠️ A törzs átmegy a sanitizeFilingHtml-en → csak a whitelistelt
 * style-property-k használhatók benne (padding, margin-top, font-*, …).
 */
function buildTorzsSablon(
  body: string,
  opts: { szabad: boolean; targy: string; lang: DokumentumNyelv },
): TorzsSablon {
  const hasIratszam = /\{\{\s*iratszam\s*\}\}/.test(body)
  const hasClosing = /\{\{\s*lelkipasztor\s*\}\}/.test(body)
  const cimkek = NYELV_CIMKEK[opts.lang]

  const targyText = (opts.targy || '').trim()
  const wantsTargy = Boolean(targyText) && !bodyHasOwnTargy(body)
  let targySorKell = wantsTargy

  let torzs = body
  if (hasIratszam && wantsTargy) {
    // A sablon-törzs saját „Szám: {{iratszam}}" / „Nr.: {{iratszam}}" sora ALÁ
    // fűzzük a Tárgy-sort (a seed-sablonok egy-elemű div-sora). Ha a minta nem
    // illeszkedik (egyedi markup), a Tárgy-sort a keret adja hozzá.
    const iratszamLine = /<div[^>]*>[^<]*\{\{\s*iratszam\s*\}\}[^<]*<\/div>/
    if (iratszamLine.test(torzs)) {
      const targyInBodyLine = `<div style="margin-top:4px;">${cimkek.targy}: ${escapeHtml(targyText)}</div>`
      // Csere-FÜGGVÉNNYEL, nem csere-stringgel: a tárgy-szöveg `$`-jeleit a
      // String.replace különben speciális mintaként ($&, $1, …) értelmezné.
      torzs = torzs.replace(iratszamLine, (m) => `${m}\n  ${targyInBodyLine}`)
      targySorKell = false
    }
  }

  if (opts.szabad) {
    // A szabad levél gépelt szövege sortartó — a tipográfiát (betű, sorköz,
    // margók) a burok `.page` / `.doc-torzs` szabálya adja.
    torzs = `<div class="doc-torzs" style="white-space:pre-wrap;">${torzs}</div>`
  }

  return { torzs, szamSorKell: !hasIratszam, targySorKell, alairasKell: !hasClosing }
}

// ─────────────────────────────────────────────────────────────────
// Anyakönyvi gyors-bevezetés (F8c — user 3. pont)
// ─────────────────────────────────────────────────────────────────

/** A gyors-bevezetéssel pótolható anyakönyvi események. */
type AnyakonyvKind = 'kereszteles' | 'konfirmalas' | 'hazassag'

const ANYAKONYV_KIND_CIMKE: Record<AnyakonyvKind, string> = {
  kereszteles: 'keresztelési dátum',
  konfirmalas: 'konfirmálási dátum',
  hazassag: 'egyházi házasság',
}

const ANYAKONYV_KIND_DATUM_CIMKE: Record<AnyakonyvKind, string> = {
  kereszteles: 'A keresztelés dátuma',
  konfirmalas: 'A konfirmálás dátuma',
  hazassag: 'A házasságkötés dátuma',
}

/** Melyik dokumentum-családhoz melyik anyakönyvi dátum kell (F8c). */
const CSALAD_ANYAKONYV_KINDS: Record<string, AnyakonyvKind[]> = {
  keresztelesi_igazolas: ['kereszteles'],
  konfirmacioi_igazolas: ['konfirmalas'],
  esketesi_igazolas: ['hazassag'],
  egyhaztag_atadas: ['kereszteles', 'konfirmalas'],
}

/**
 * F8f: a szöveg-építő esemény-kulcsa → a gyors-bevezetés anyakönyvi eseménye.
 * (A két készlet szándékosan külön él: az egyik a DOKUMENTUM szövegéé, a másik
 * az ANYAKÖNYVI rögzítésé — a nevük csak a konfirmációnál tér el.)
 */
const ESEMENY_ANYAKONYV_KIND: Record<EsemenyKulcs, AnyakonyvKind> = {
  kereszteles: 'kereszteles',
  konfirmacio: 'konfirmalas',
  hazassag: 'hazassag',
}

/** Ugyanez visszafelé (a család MAG-eseményeinek felismeréséhez — F8f). */
const ANYAKONYV_KIND_ESEMENY: Record<AnyakonyvKind, EsemenyKulcs> = {
  kereszteles: 'kereszteles',
  konfirmalas: 'konfirmacio',
  hazassag: 'hazassag',
}

/**
 * A család MAG-eseményei: amiről a dokumentum SZÓL (a gyors-bevezetés fix
 * készletéből származtatva). Ezek pipája adat híján SEM kerül ki automatikusan
 * — egy keresztelési igazolás keresztelés-mondat nélkül értelmetlen volna;
 * hiányzó dátumnál kitöltő-vonal kerül a szövegbe (és jelzés az űrlapra).
 */
function csaladMagEsemenyek(csaladId: string): Set<EsemenyKulcs> {
  return new Set((CSALAD_ANYAKONYV_KINDS[csaladId] || []).map((k) => ANYAKONYV_KIND_ESEMENY[k]))
}

function hianyzikAnyakonyviDatum(p: PersonCertData, kind: AnyakonyvKind): boolean {
  if (kind === 'kereszteles') return !p.keresztelesDatum
  if (kind === 'konfirmalas') return !p.konfirmalasDatum
  return !p.hazassagDatum
}

/**
 * Egy hiányzó anyakönyvi adat sora „Bevezetés az anyakönyvbe" mini-űrlappal.
 *
 * DOKUMENTÁLT DÖNTÉS (F8c): az anyakönyvi modul rögzítő dialógusai
 * (BaptismDialog / ConfirmationDialog / MarriageDialog) személy-előtöltést
 * csak az `editEntry` propon át ismernek, az viszont SZERKESZTŐ (update)
 * módba kapcsolja őket — előtöltött személlyel ÚJ bejegyzés nem nyitható a
 * módosításuk nélkül, ezért nem újrahasznosíthatók create-ra. Helyette ez a
 * minimál mini-űrlap közvetlenül a meglévő anyakönyvi CREATE actionöket hívja
 * (saveBaptism / saveConfirmationBatch / saveMarriage — az egyházi anyakönyvi
 * számot a szerver automatikusan sorszámozza), a mentés után pedig a kiállító
 * újratölti a személy adatait (getPersonCertificateData) — a bevezetett adat
 * a dokumentum helyére kerül ÉS az anyakönyv is gazdagodik.
 */
function QuickRegistryEntry({
  person,
  kind,
  onSaved,
}: {
  person: PersonCertData
  kind: AnyakonyvKind
  onSaved: () => Promise<void> | void
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [datum, setDatum] = useState('')
  const [spouse, setSpouse] = useState<MemberSearchResult | null>(null)
  const [saving, setSaving] = useState(false)
  const datumId = `iktato-anyakonyv-${person.id}-${kind}`

  async function handleSave() {
    if (!datum) {
      toast.error('A dátum megadása kötelező.')
      return
    }
    setSaving(true)
    try {
      if (kind === 'kereszteles') {
        const res = await saveBaptism({ id_szemely: person.id, datum, munkanaploba: false })
        if (res?.error) {
          toast.error(res.error)
          return
        }
      } else if (kind === 'konfirmalas') {
        const res = await saveConfirmationBatch({
          datum,
          candidates: [person.id],
          munkanaploba: false,
        })
        if (res?.error) {
          toast.error(res.error)
          return
        }
      } else {
        if (!spouse) {
          toast.error('A házasság bevezetéséhez válaszd ki a házastársat is.')
          return
        }
        // Vőlegény/menyasszony a nem-mezők szerint (a hazassag tábla
        // id_ferfi/id_no oszlopaihoz); ha egyik nem sem ismert, nem találgatunk.
        let idFerfi: number | null = null
        let idNo: number | null = null
        if (person.nem === 'ferfi') {
          idFerfi = person.id
          idNo = spouse.id
        } else if (person.nem === 'no') {
          idNo = person.id
          idFerfi = spouse.id
        } else if (spouse.ferfi === true) {
          idFerfi = spouse.id
          idNo = person.id
        } else if (spouse.ferfi === false) {
          idNo = spouse.id
          idFerfi = person.id
        }
        if (idFerfi == null || idNo == null) {
          toast.error(
            'Nem állapítható meg, ki a vőlegény és ki a menyasszony (hiányzó nem-adat) — rögzítsd a házasságot az Anyakönyv modulban.',
          )
          return
        }
        const res = await saveMarriage({ id_ferfi: idFerfi, id_no: idNo, datum })
        if (res?.error) {
          toast.error(res.error)
          return
        }
      }
      toast.success('Bevezetve az anyakönyvbe — az adat a dokumentumba került, és az anyakönyv is gazdagodott.')
      setFormOpen(false)
      setDatum('')
      setSpouse(null)
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-2.5 text-xs dark:border-amber-500/40 dark:bg-amber-500/10">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="flex min-w-0 items-start gap-1.5 font-medium text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            <b>{person.teljesNev}</b>: hiányzó {ANYAKONYV_KIND_CIMKE[kind]}
          </span>
        </p>
        {!formOpen ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-lg text-xs"
            onClick={() => setFormOpen(true)}
          >
            <CalendarPlus className="mr-1 size-3.5" aria-hidden />
            Bevezetés az anyakönyvbe
          </Button>
        ) : null}
      </div>
      {formOpen ? (
        <div className="mt-2 space-y-2">
          <div className="space-y-1">
            <label htmlFor={datumId} className="text-[11px] font-medium text-foreground">
              {ANYAKONYV_KIND_DATUM_CIMKE[kind]}
            </label>
            <Input
              id={datumId}
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="h-8 bg-background text-xs"
            />
          </div>
          {kind === 'hazassag' ? (
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-foreground">
                Házastárs (a tagnyilvántartásból)
              </span>
              <MemberSearchSelect
                value={spouse}
                onChange={setSpouse}
                genderFilter={person.nem === 'ferfi' ? false : person.nem === 'no' ? true : undefined}
                compact
                placeholder="Házastárs keresése…"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 rounded-lg text-xs"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden /> : null}
              Bevezetés
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-lg text-xs"
              onClick={() => setFormOpen(false)}
              disabled={saving}
            >
              Mégse
            </Button>
          </div>
          <p className="text-[10px] leading-snug text-amber-900/80 dark:text-amber-100/80">
            A bevezetés valódi anyakönyvi bejegyzést hoz létre (az egyházi anyakönyvi számot a
            rendszer sorszámozza); a további részletek (lelkész, keresztszülők, tanúk…) az
            Anyakönyv modulban pótolhatók.
          </p>
        </div>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Komponens
// ─────────────────────────────────────────────────────────────────

export interface CertificateIssueDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Az iktató-nézetben kiválasztott év — csak tájékoztatáshoz (az iktatás mindig a MAI kelttel történik). */
  year: number
  /** Sikeres iktatás után hívódik (a szülő frissítheti a listát). */
  onIssued: () => void
  /** 2026-07-24 (W2): megnyitáskor automatikusan betöltendő személy-id-k
   *  (pl. a személyi karton „Igazolás kiállítása" gombja a tag id-jét adja át).
   *  Hibánál toast — a kereső ilyenkor is üresen használható marad. */
  initialPersonIds?: number[]
}

export function CertificateIssueDialog({ open, onOpenChange, year, onIssued, initialPersonIds }: CertificateIssueDialogProps) {
  // (a) sablonok
  const [templates, setTemplates] = useState<FilingTemplate[]>([])
  const [templateId, setTemplateId] = useState<string>(FREE_LETTER_ID)
  const [body, setBody] = useState('')
  // 2026-07-25 (éles teszt): az üres listánál futó automatikus seed nem
  // sikerült → diszkrét hint a választó alatt (nem hangos hiba).
  const [templateSeedFailed, setTemplateSeedFailed] = useState(false)

  // (b) személyek
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<CertificatePersonHit[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [persons, setPersons] = useState<PersonCertData[]>([])
  const [loadingPersons, setLoadingPersons] = useState(false)

  // (c) A DOKUMENTUM NYELVE (F8c) — EGYETLEN választó vezérli a fejlécet,
  // a Szám/Tárgy címkéket, a keltezést és a család-törzsek szövegét.
  const [docLang, setDocLang] = useState<DokumentumNyelv>('hu')
  // A hivatalos levélfej elhagyható (a régi „Fejléc nélkül" opció utódja).
  const [noLetterhead, setNoLetterhead] = useState(false)
  const [headerNyers, setHeaderNyers] = useState<CongregationHeaderData | null>(null)
  /**
   * A címer BEÁGYAZOTT (data: URI) változata — 2026-07-25, user-észrevétel:
   * „ha rákattintok a konfirmációra, eltűnik a fejlécből a logó".
   *
   * Ok: minden szerkesztés (pipa, mező) új `srcDoc`-ot ad az előnézet-iframe-nek,
   * ami TELJES dokumentum-újratöltés — a távoli címer-kép ilyenkor újra
   * hálózatról töltődne, és a gyors egymásutánban megszakított kérések miatt
   * el-eltűnik. Ugyanez a gond a PDF-mentésnél is (a html2canvas a
   * más-originű képet CORS miatt kihagyhatja).
   *
   * Megoldás: a képet EGYSZER letöltjük és data: URI-ként ágyazzuk a
   * dokumentumba — így minden újratöltésnél azonnal ott van, és a PDF-be is
   * belekerül. Hiba esetén marad az eredeti URL (a fejléc szövege sosem függ
   * ettől).
   */
  const [cimerDataUrl, setCimerDataUrl] = useState<string | null>(null)
  const nyersCimerUrl = headerNyers?.cimerUrl || ''
  useEffect(() => {
    setCimerDataUrl(null)
    if (!nyersCimerUrl) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(nyersCimerUrl)
        if (!res.ok) return
        const blob = await res.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
        if (!cancelled && dataUrl.startsWith('data:')) setCimerDataUrl(dataUrl)
      } catch {
        // Néma: a fejléc az eredeti URL-lel is helyes marad.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [nyersCimerUrl])
  /** A dokumentumba menő fejléc-adat (beágyazott címerrel, ha sikerült). */
  const header = useMemo<CongregationHeaderData | null>(() => {
    if (!headerNyers) return null
    return cimerDataUrl ? { ...headerNyers, cimerUrl: cimerDataUrl } : headerNyers
  }, [headerNyers, cimerDataUrl])
  const [headerError, setHeaderError] = useState<string | null>(null)
  // F8e (user 4.): a keltezés helysége SZERKESZTHETŐ — amíg a felhasználó nem
  // írja át, a nyelvhelyes automatikus nevet követi (lásd keltHelysegAuto).
  const [keltHelyseg, setKeltHelyseg] = useState('')
  const [keltHelysegTouched, setKeltHelysegTouched] = useState(false)

  // (d) értékek
  const [autoValues, setAutoValues] = useState<Record<string, string>>({})
  const [manualValues, setManualValues] = useState<Record<string, string>>({})
  // A dokumentum-családok kézi mezőinek értékei (F8c, kulcs → érték).
  const [keziValues, setKeziValues] = useState<Record<string, string>>({})
  // F8f: a KÉZZEL átállított esemény-pipák (csak amit a felhasználó megérintett).
  // A nem szereplő kulcsok automatikus értéket kapnak — lásd esemenyAllapot.
  const [esemenyValasztas, setEsemenyValasztas] = useState<
    Partial<Record<EsemenyKulcs, boolean>>
  >({})
  const [previewIratszam, setPreviewIratszam] = useState('')
  const [loadingCtx, setLoadingCtx] = useState(false)

  // iktatás
  const [subject, setSubject] = useState('')
  const [subjectTouched, setSubjectTouched] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [issued, setIssued] = useState(false)
  const [issuedIratszam, setIssuedIratszam] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  // ── Életút-mód (F8b — B4): adat + hiányok + kézi mezők ───────────
  const [eletutAdat, setEletutAdat] = useState<EletutAdat | null>(null)
  const [eletutHianyok, setEletutHianyok] = useState<EletutHiany[]>([])
  const [eletutError, setEletutError] = useState<string | null>(null)
  const [eletutLoading, setEletutLoading] = useState(false)
  const [eletutKerelmezo, setEletutKerelmezo] = useState('')
  const [eletutCel, setEletutCel] = useState(ELETUT_CEL_ALAPERTEK)
  const [eletutSirhely, setEletutSirhely] = useState('')
  const [eletutFogondnok, setEletutFogondnok] = useState('')
  // F8c: az életút-nyomtatvány nyelv-módja — default a háromnyelvű változat.
  const [eletutNyelvMod, setEletutNyelvMod] = useState<EletutNyelvMod>('harom')

  // ── Átadás-mód (F8b — B4): cél-egyházközség kereső ───────────────
  const [congQuery, setCongQuery] = useState('')
  const [congSearching, setCongSearching] = useState(false)
  const [congHits, setCongHits] = useState<CongregationSearchHit[]>([])
  const [congError, setCongError] = useState<string | null>(null)
  const [celCongregation, setCelCongregation] = useState<CongregationSearchHit | null>(null)

  // mobil fül-váltó + fókusz a lépés/fül-váltásnál (a11y)
  const [mobileView, setMobileView] = useState<'form' | 'preview'>('form')
  const formPanelRef = useRef<HTMLDivElement>(null)
  const previewPanelRef = useRef<HTMLDivElement>(null)

  const szabad = templateId === FREE_LETTER_ID
  const eletutMode = templateId === ELETUT_ID
  // F8c: a kiválasztott dokumentum-család (az új elsődleges út).
  const selectedCsalad = useMemo<DokumentumCsalad | null>(
    () =>
      templateId.startsWith(CSALAD_PREFIX)
        ? getDokumentumCsalad(templateId.slice(CSALAD_PREFIX.length))
        : null,
    [templateId],
  )
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId],
  )
  // F8c: a „Saját sablonok" csoport — a 11 seed-név kiszűrve (a családok
  // váltják ki őket); a saját sablonok a régi egynyelvű úton működnek tovább.
  const sajatSablonok = useMemo(
    () => templates.filter((t) => !SEED_NEV_SET.has((t.nev || '').trim())),
    [templates],
  )
  // Átadás-mód: az „egyhaztag_atadas" CSALÁD, illetve (visszafelé
  // kompatibilitásként) a seed-sablon NÉV-alapú felismerése (a régi, DB-ben
  // maradt példányok id-je gyülekezetenként más — a név viszont stabil).
  const atadasMode =
    selectedCsalad?.id === 'egyhaztag_atadas' ||
    (!szabad &&
      !eletutMode &&
      !selectedCsalad &&
      (selectedTemplate?.nev || '').trim() === ATADAS_SABLON_NEV)
  const docTitle = eletutMode
    ? 'Életút- és családi igazolás'
    : selectedCsalad?.nev || selectedTemplate?.nev || 'Szabad levél'
  const nevek = useMemo(() => joinNamesHu(persons.map((p) => p.teljesNev)), [persons])
  // F8c: nevek vesszős felsorolása — a család-út iktatókönyvi tárgyához.
  const nevekVesszo = useMemo(
    () =>
      persons
        .map((p) => (p.teljesNev || '').trim())
        .filter(Boolean)
        .join(', '),
    [persons],
  )
  // F8c: a család maxSzemely-e vezérli a kereső-limitet (0 = nem személyhez
  // kötött dokumentum — a személy-szekció ilyenkor el is tűnik).
  const maxSzemelyLimit = eletutMode ? 1 : selectedCsalad ? selectedCsalad.maxSzemely : MAX_PERSONS
  // Az életút-igazolás a 2. ügykörbe tartozik (anya- és családkönyvi igazolások);
  // a családok a saját (látható) ügykör-besorolásukat hozzák.
  const ugykorKod: string | null = eletutMode
    ? '2.'
    : selectedCsalad
      ? selectedCsalad.ugykorKod
      : szabad
        ? '1.'
        : (selectedTemplate ? TIPUS_UGYKOR[selectedTemplate.tipus] ?? null : null)

  // 2026-07-24 (W2): a kezdeti személy-id-k STABIL kulcsa — a tömb-identitás
  // renderenként változhat (a szülő pl. inline `[member.id]`-t ad át), a
  // join-olt string nem, így a megnyitási reset-effekt NEM fut újra (és nem
  // resetel) minden szülő-rendernél, csak nyitáskor / tényleges id-váltásnál.
  const initialIdsKey = (initialPersonIds || [])
    .filter((n) => Number.isInteger(n))
    .join(',')

  // ── Megnyitáskor: állapot-reset + kontextus-betöltés ─────────────
  useEffect(() => {
    if (!open) return
    let cancelled = false

    // Teljes reset (a beágyazott állapot ne ragadjon át az előző kiállításból).
    setTemplateId(FREE_LETTER_ID)
    setBody('')
    setSearchQuery('')
    setHits([])
    setSearchError(null)
    setPersons([])
    setDocLang('hu')
    setNoLetterhead(false)
    setKeltHelyseg('')
    setKeltHelysegTouched(false)
    setManualValues({})
    setKeziValues({})
    setEsemenyValasztas({}) // F8f: az esemény-pipák a család alapértékeire állnak
    setSubject('')
    setSubjectTouched(false)
    setIssuing(false)
    setIssued(false)
    setIssuedIratszam(null)
    setMobileView('form')
    setContentH(A4_H_PX) // az előző kiállítás előnézet-magassága ne ragadjon át
    setLoadingPersons(false) // zárás közben félbemaradt betöltés jelzője ne ragadjon be
    setTemplateSeedFailed(false) // az előző megnyitás seed-hintje ne ragadjon át
    // F8b: az életút- és átadás-mód állapota se ragadjon át az előző kiállításból.
    setEletutAdat(null)
    setEletutHianyok([])
    setEletutError(null)
    setEletutLoading(false)
    setEletutKerelmezo('')
    setEletutCel(ELETUT_CEL_ALAPERTEK)
    setEletutSirhely('')
    setEletutFogondnok('')
    setEletutNyelvMod('harom')
    setCongQuery('')
    setCongHits([])
    setCongError(null)
    setCongSearching(false)
    setCelCongregation(null)

    // 2026-07-24 (W2): személyi kartonról nyitva a kezdeti személy(ek)
    // betöltése a teljes reset UTÁN — hibánál toast, és a persons üres marad
    // (a kereső ettől még használható). A cancelled-őr a zárás/újranyitás
    // közben beérkező elavult választ dobja el.
    if (initialIdsKey) {
      const ids = initialIdsKey.split(',').map(Number)
      setLoadingPersons(true)
      void getPersonCertificateData(ids).then((res) => {
        if (cancelled) return
        setLoadingPersons(false)
        if (res.error) {
          toast.error(res.error)
          return
        }
        setPersons(res.persons)
      })
    }

    setLoadingCtx(true)
    void (async () => {
      const issueYear = new Date().getFullYear()
      const [tplRes, headerRes, ctxRes, iratszamRes] = await Promise.all([
        listFilingTemplates(),
        getCongregationHeader(),
        getAutoPlaceholderContext(),
        generateNextIratszam(issueYear),
      ])
      if (cancelled) return

      if (tplRes.error) toast.error(tplRes.error)
      let tplList = tplRes.data || []
      let seedFailed = false

      // 2026-07-25 (éles teszt: üres sablon-lista): ha a gyülekezetben még
      // EGYETLEN sablon sincs (és a lekérés nem hibázott), a 11 alapsablont
      // automatikusan betöltjük, majd újratöltjük a listát — a kiállító ne
      // induljon üres választóval. Ha a seed nem sikerül (pl. jogosultság
      // híján), NEM hibázunk hangosan: diszkrét hint jelzi a választó alatt,
      // hogy a Sablonok fülön pótolható. Cancel-őr minden await után.
      if (!tplRes.error && tplList.length === 0) {
        const seedRes = await seedDefaultFilingTemplates()
        if (cancelled) return
        if (seedRes.error) {
          seedFailed = true
        } else {
          const reloadRes = await listFilingTemplates()
          if (cancelled) return
          if (!reloadRes.error && (reloadRes.data || []).length > 0) {
            tplList = reloadRes.data || []
            toast.success('A 11 alapsablon betöltésre került a Sablonok fülre.')
          } else {
            seedFailed = true
          }
        }
      }
      setTemplates(tplList)
      setTemplateSeedFailed(seedFailed)

      setHeaderNyers(headerRes.header)
      setHeaderError(headerRes.error)

      // Az előnézeti szám (nem-atomikus MAX+1 becslés) szándékosan NEM kerül
      // az autoValues közé — a dokumentumban csak az iktatáskor kiosztott
      // valódi szám jelenhet meg (lásd iratszamValue), a preview csak hint.
      setPreviewIratszam(iratszamRes.iratszam || '')
      setAutoValues(
        buildAutoValues({
          gyulekezet: ctxRes.data?.gyulekezet,
          lelkipasztor: ctxRes.data?.lelkipasztor,
          helyseg: ctxRes.data?.helyseg,
        }),
      )
      setLoadingCtx(false)
    })()

    return () => {
      cancelled = true
    }
  }, [open, initialIdsKey])

  // ── (b) debounced személy-keresés ────────────────────────────────
  const searchSeq = useRef(0)
  useEffect(() => {
    if (!open) {
      // Zárás után beérkező (úton lévő) válasz se írhasson vissza találatot.
      searchSeq.current++
      return
    }
    const q = searchQuery.trim()
    if (q.length < 2) {
      // A rövid/üres lekérdezés az úton lévő válaszokat is érvényteleníti —
      // különben egy megkésett válasz üres keresőmező mellett is visszahozná
      // az elavult (szellem-)találati listát.
      searchSeq.current++
      setHits([])
      setSearching(false)
      setSearchError(null)
      return
    }
    const mySeq = ++searchSeq.current
    setSearching(true)
    const t = window.setTimeout(() => {
      void searchPersonsForCertificate(q).then((res) => {
        if (mySeq !== searchSeq.current) return // elavult válasz
        setHits(res.results)
        setSearchError(res.error)
        setSearching(false)
      })
    }, 300)
    return () => window.clearTimeout(t)
  }, [open, searchQuery])

  // ── Életút-mód: a kiválasztott EGY személy teljes életútjának betöltése ──
  // A mezoId-séma és a hiány-lista a B1-kontraktusból (eletut-actions) jön;
  // a cancelled-őr a mód-/személy-váltás közben beérkező elavult választ dobja el.
  const eletutPersonId = eletutMode ? (persons[0]?.id ?? null) : null
  useEffect(() => {
    if (!open || eletutPersonId == null) {
      setEletutAdat(null)
      setEletutHianyok([])
      setEletutError(null)
      setEletutLoading(false)
      return
    }
    let cancelled = false
    setEletutLoading(true)
    setEletutError(null)
    void getEletutAdat(eletutPersonId).then((res) => {
      if (cancelled) return
      setEletutLoading(false)
      setEletutAdat(res.adat)
      setEletutHianyok(res.hianyok)
      setEletutError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [open, eletutPersonId])

  // ── Átadás-mód: debounced cél-egyházközség keresés (searchCongregations) ──
  // A személy-kereső sequence-mintáját követi (elavult/szellem-válasz védelem).
  const congSeq = useRef(0)
  useEffect(() => {
    if (!open || !atadasMode) {
      congSeq.current++
      return
    }
    const q = congQuery.trim()
    if (q.length < 2) {
      congSeq.current++
      setCongHits([])
      setCongSearching(false)
      setCongError(null)
      return
    }
    const mySeq = ++congSeq.current
    setCongSearching(true)
    const t = window.setTimeout(() => {
      void searchCongregations(q).then((res) => {
        if (mySeq !== congSeq.current) return // elavult válasz
        setCongHits(res.results)
        setCongError(res.error)
        setCongSearching(false)
      })
    }, 300)
    return () => window.clearTimeout(t)
  }, [open, atadasMode, congQuery])

  function selectCelCongregation(hit: CongregationSearchHit) {
    setCelCongregation(hit)
    // A kiválasztott név a {{cel_gyulekezet}} placeholderbe (régi sablon-út),
    // ÉS a család kézi mezőjébe kerül (F8c) — a mező-űrlapon kézzel tovább
    // finomítható, pl. hivatalos hosszú név.
    setManualValues((prev) => ({ ...prev, cel_gyulekezet: hit.nev }))
    setKeziValues((prev) => ({ ...prev, cel_gyulekezet: hit.nev }))
    setCongQuery('')
    setCongHits([])
  }

  function clearCelCongregation() {
    setCelCongregation(null)
    setManualValues((prev) => {
      const next = { ...prev }
      delete next.cel_gyulekezet
      return next
    })
    setKeziValues((prev) => {
      const next = { ...prev }
      delete next.cel_gyulekezet
      return next
    })
  }

  async function addPerson(hit: CertificatePersonHit) {
    if (persons.some((p) => p.id === hit.id)) return
    // Életút-módban EGY személy választható: az új kiválasztás LECSERÉLI az
    // előzőt (az életút-adatokat a személy-váltásra figyelő effekt tölti újra).
    if (eletutMode) {
      setLoadingPersons(true)
      const res = await getPersonCertificateData([hit.id])
      setLoadingPersons(false)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setPersons(res.persons)
      setSearchQuery('')
      setHits([])
      return
    }
    // F8c: a limit a kiválasztott dokumentum-család maxSzemely-e (családon
    // kívül a régi MAX_PERSONS plafon él).
    if (maxSzemelyLimit <= 0 || persons.length >= maxSzemelyLimit) {
      toast.info(`Ehhez a dokumentumhoz legfeljebb ${Math.max(1, maxSzemelyLimit)} személy választható ki.`)
      return
    }
    setLoadingPersons(true)
    const nextIds = [...persons.map((p) => p.id), hit.id]
    const res = await getPersonCertificateData(nextIds)
    setLoadingPersons(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setPersons(res.persons)
    // A személy-kezelt kulcsok kézi felülírásait töröljük, hogy az új
    // kiválasztás adatai érvényesüljenek (a nem-személy mezők megmaradnak).
    setManualValues((prev) => {
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(prev)) if (!PERSON_MANAGED_KEYS.has(k)) next[k] = v
      return next
    })
    setSearchQuery('')
    setHits([])
  }

  function removePerson(id: number) {
    setPersons((prev) => prev.filter((p) => p.id !== id))
  }

  // F8c: az anyakönyvi gyors-bevezetés utáni újratöltés — a bevezetett adat
  // a helyére kerül (a személy-kezelt kézi felülírások törlésével, ahogy az
  // addPerson is teszi).
  const reloadPersons = useCallback(async () => {
    const ids = persons.map((p) => p.id).filter((n) => Number.isInteger(n) && n > 0)
    if (ids.length === 0) return
    const res = await getPersonCertificateData(ids)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setPersons(res.persons)
    setManualValues((prev) => {
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(prev)) if (!PERSON_MANAGED_KEYS.has(k)) next[k] = v
      return next
    })
  }, [persons])

  // ── Sablon-váltás: törzs + kézi mezők + iktatási tárgy frissítése ──
  function handleTemplateChange(nextId: string) {
    setTemplateId(nextId)
    const tpl = templates.find((t) => t.id === nextId) || null
    const csalad = nextId.startsWith(CSALAD_PREFIX)
      ? getDokumentumCsalad(nextId.slice(CSALAD_PREFIX.length))
      : null
    setBody(nextId === FREE_LETTER_ID || nextId === ELETUT_ID || csalad ? '' : tpl?.tartalom || '')
    // F8f: dokumentum-váltásnál az esemény-pipák MINDIG az új család
    // alapértékeire állnak vissza (az előző dokumentum kézi állításai nem
    // ragadhatnak át — pl. az esketési igazolásnál bekapcsolt keresztelés).
    setEsemenyValasztas({})
    // F8c: család-váltásnál a kézi mezők alapértékekkel indulnak, a
    // személy-lista a család maxSzemely-limitjére vágva (0 = nem személyhez
    // kötött → üres lista, a személy-szekció el is tűnik).
    if (csalad) {
      const kezdo: Record<string, string> = {}
      for (const m of csalad.keziMezok) if (m.alapertek) kezdo[m.key] = m.alapertek
      // Átadás-családnál a már kiválasztott cél-gyülekezet neve megmarad.
      if (csalad.id === 'egyhaztag_atadas' && celCongregation) {
        kezdo.cel_gyulekezet = celCongregation.nev
      }
      setKeziValues(kezdo)
      setPersons((prev) => prev.slice(0, csalad.maxSzemely))
    } else {
      setKeziValues({})
    }
    // Életút-módban EGY személy választható — a többes kiválasztásból az
    // 1. személy marad (az adat-betöltést a személy-figyelő effekt indítja).
    if (nextId === ELETUT_ID) setPersons((prev) => prev.slice(0, 1))
    // A már iktatott állapot új dokumentumnál nem érvényes.
    setIssued(false)
    setIssuedIratszam(null)
  }

  // Az iktatókönyvi tárgy automatikus követése, amíg a user nem írta át.
  // F8c: család-útnál „{család neve} — {nevek vesszővel}".
  const autoSubject = useMemo(() => {
    const nevResz = selectedCsalad ? nevekVesszo : nevek
    return `${docTitle}${nevResz ? ` — ${nevResz}` : ''}`
  }, [docTitle, selectedCsalad, nevekVesszo, nevek])
  useEffect(() => {
    if (!subjectTouched) setSubject(autoSubject)
  }, [autoSubject, subjectTouched])

  // F8e (user 2.): a DOKUMENTUMRA kerülő Tárgy a dokumentum NYELVÉN — a
  // dokumentum-család nyelvhelyes nevével (nevNyelv) + a személynevekkel
  // (pl. RO: „Obiect: Adeverință de botez — Nagy Timea"). Az iktatókönyvi
  // tárgy-mező ettől FÜGGETLENÜL magyar marad (magyar iktatókönyv).
  // Család-úton kívül (saját sablon / szabad levél) nincs mit fordítani:
  // ott az iktatókönyvi tárgy szövege kerül a dokumentumra is.
  const dokumentumTargy = useMemo(() => {
    if (!selectedCsalad) return subject.trim()
    const csaladNev = (selectedCsalad.nevNyelv[docLang] || selectedCsalad.nev).trim()
    return `${csaladNev}${nevekVesszo ? ` — ${nevekVesszo}` : ''}`
  }, [selectedCsalad, docLang, nevekVesszo, subject])

  // F8e (user 4.): a keltezés helységének AUTOMATIKUS (nyelvhelyes) neve.
  // Magyar iraton a magyar név az elsődleges — a korábbi hiba gyökere az volt,
  // hogy strukturált helység-hivatkozás híján a szabad szöveges (román nevű)
  // varos mező jött. A mező alább kézzel is átírható.
  const keltHelysegAuto = useMemo(() => {
    const hu = (header?.helysegHu || '').trim()
    const ro = (header?.helysegRo || '').trim()
    const szabadSzoveg = (autoValues.helyseg || '').trim()
    if (docLang === 'hu') return hu || szabadSzoveg || ro
    return ro || hu || szabadSzoveg
  }, [header, autoValues.helyseg, docLang])
  useEffect(() => {
    if (!keltHelysegTouched) setKeltHelyseg(keltHelysegAuto)
  }, [keltHelysegAuto, keltHelysegTouched])
  // NYELVVÁLTÁSKOR a helység MINDIG a nyelvhelyes névre áll vissza (user-kérés,
  // 2026-07-25: „a keltezés helysége a nyelv függvényében változzon"). A kézi
  // felülírás így csak az adott nyelven belül marad érvényben — nyelvet váltva
  // újra a katalógus-nevet ajánljuk (utána természetesen ismét átírható).
  useEffect(() => {
    setKeltHelysegTouched(false)
  }, [docLang])
  /** A ténylegesen használt keltezés-helység (üres mezőnél az automatikus név). */
  const keltHelysegErtek = keltHelyseg.trim() || keltHelysegAuto

  // ── Értékek + dokumentum összeállítása ───────────────────────────
  const personValues = useMemo(() => buildPersonValues(persons), [persons])
  // Iktatás ELŐTT a dokumentumba NEM kerülhet a nem-atomikus előnézeti szám
  // (a következő valódi iktatás ugyanazt a számot MÁSIK iratnak osztaná ki) —
  // helyette kitöltetlen vonal. A previewIratszam csak tájékoztató hint.
  const iratszamValue = issuedIratszam ?? manualValues.iratszam ?? '__________'
  const mergedValues = useMemo<Record<string, string>>(
    () => ({
      ...autoValues,
      ...personValues,
      ...manualValues,
      iratszam: iratszamValue,
      // F8e: a {{helyseg}} placeholder is a SZERKESZTHETŐ keltezés-helységet
      // kapja (a saját sablonok záró blokkja is ezt írja ki).
      helyseg: keltHelysegErtek,
    }),
    [autoValues, personValues, manualValues, iratszamValue, keltHelysegErtek],
  )

  // F8e: a sablon-út törzse + a hiányzó keret-elemek jelzése (a teljes iratot
  // a kanonikus dokumentumBurok rakja össze — lásd composeStandardHtml).
  const torzsSablon = useMemo(
    () => buildTorzsSablon(body, { szabad, targy: subject, lang: docLang }),
    [body, szabad, subject, docLang],
  )
  const placeholders = useMemo(() => {
    // A {{helyseg}} mezőt a dedikált „Keltezés helysége" mező vezérli (F8e) —
    // a placeholder-listából kivesszük, hogy ne legyen két, egymásnak
    // ellentmondó beviteli helye ugyanannak az értéknek.
    const list = extractPlaceholders(torzsSablon.torzs).filter((k) => k !== 'helyseg')
    const out = [...list]
    const set = new Set(list)
    // A keretből jövő elemek mezői is szerkeszthetők maradjanak (korábban a
    // keret a sablon RÉSZE volt, így a placeholder-kigyűjtés hozta őket).
    if (torzsSablon.szamSorKell && !set.has('iratszam')) out.push('iratszam')
    if (torzsSablon.alairasKell && !set.has('lelkipasztor')) out.push('lelkipasztor')
    return out
  }, [torzsSablon])
  const autoKeys = useMemo(() => {
    const set = new Set<string>()
    for (const p of PLACEHOLDER_DOCS) if (p.auto) set.add(p.key)
    return set
  }, [])

  // A sablon-alapú (nem-életút) dokumentum összeállítása ADOTT értékekkel —
  // a fullHtml memo ÉS az átadás-regisztráció (végleges, iratszámos példány)
  // is ezt hívja, így a kettő garantáltan ugyanazt a HTML-t kapja.
  const composeStandardHtml = useCallback(
    (values: Record<string, string>) => {
      // A sablon-törzs admin/lelkész által szerkesztett → sanitize (P1-3b minta);
      // az app-generált fejléc és a renderTemplate-escape-elt értékek megbízhatók.
      // Előnézet, PDF és nyomtatás UGYANEZT a HTML-t kapja (WYSIWYG).
      const sanitized = sanitizeFilingHtml(torzsSablon.torzs)
      const rendered = renderTemplate(sanitized, values)
      const cimkek = NYELV_CIMKEK[docLang]
      const targyText = (dokumentumTargy || '').trim()
      const keltSor = keltezesSor(docLang, keltHelysegErtek, todayIso())
      return dokumentumBurok({
        lang: docLang,
        cim: docTitle,
        fejlecHtml: !noLetterhead && header ? fejlecHtmlNyelven(docLang, header) : '',
        // A Szám/Tárgy sorok KÉSZ HTML-ként mennek a burokba → itt escape-elünk.
        szamSor: torzsSablon.szamSorKell
          ? `${cimkek.szam}: ${escapeHtml(values.iratszam ?? '')}`
          : '',
        targySor:
          torzsSablon.targySorKell && targyText
            ? `${cimkek.targy}: ${escapeHtml(targyText)}`
            : '',
        torzsHtml: rendered,
        alairasHtml: torzsSablon.alairasKell
          ? alairasBlokkHtml(keltSor, values.lelkipasztor ?? '', ALAIRO_SZEREP[docLang])
          : '',
      })
    },
    [torzsSablon, noLetterhead, docLang, header, docTitle, dokumentumTargy, keltHelysegErtek],
  )

  // ── F8f: kipipálható események („Az igazolás tartalma") ──────────
  // A család mondja meg, MELY események kapcsolhatók (esemenyOpciok) és mi az
  // alapállapotuk; ha nincs ilyen lista, a család nem esemény-vezérelt → nem
  // rajzolunk pipa-blokkot, és a buildBody is az alapértelmezett szöveget adja.
  const esemenyOpciok = selectedCsalad?.esemenyOpciok ?? null
  /**
   * A pipák TÉNYLEGES állapota három lépcsőben:
   *  1. amit a felhasználó KÉZZEL állított (esemenyValasztas) — az mindig nyer,
   *     és a személy-váltást is túléli;
   *  2. a család MAG-eseménye (csaladMagEsemenyek): marad az `alap` érték, adat
   *     nélkül is — a keresztelési igazolásból nem tűnhet el a keresztelés;
   *  3. a többi (kiegészítő) esemény: csak akkor indul bepipálva, ha a
   *     kiválasztott személyek valamelyikénél VAN rá adat (vanEsemenyAdat) —
   *     így egy adat nélküli konfirmáció nem kerül magától a szövegbe, kézzel
   *     viszont bekapcsolható (ilyenkor kitöltő-vonal kerül a helyére).
   * Amíg nincs kiválasztott személy, a család alapértéke látszik — különben az
   * űrlap üres pipákkal indulna, ami félrevezető.
   */
  const esemenyAllapot = useMemo<Partial<Record<EsemenyKulcs, boolean>>>(() => {
    if (!esemenyOpciok || !selectedCsalad) return {}
    const nincsSzemely = persons.length === 0
    const mag = csaladMagEsemenyek(selectedCsalad.id)
    const out: Partial<Record<EsemenyKulcs, boolean>> = {}
    for (const o of esemenyOpciok) {
      const kezi = esemenyValasztas[o.key]
      if (kezi !== undefined) {
        out[o.key] = kezi
        continue
      }
      const vanAdat = nincsSzemely || mag.has(o.key) || vanEsemenyAdat(persons, o.key)
      out[o.key] = o.alap && vanAdat
    }
    return out
  }, [esemenyOpciok, selectedCsalad, esemenyValasztas, persons])

  // ── F8c: a dokumentum-család teljes HTML-je — a NYELV vezérel mindent ──
  // (fejléc, Szám/Tárgy címkék, keltezés nyelvhelyes helység-névvel, törzs).
  const composeCsaladHtml = useCallback(
    (csalad: DokumentumCsalad, iratszamText: string): string => {
      const cimkek = NYELV_CIMKEK[docLang]
      // A gyülekezet neve a dokumentum nyelvén (nev_hu/nev_ro/nev_en →
      // hivatalos név → auto-placeholder fallback). Németnél az angol nevet
      // adjuk át: a német szöveg-építő (deAmt/deGemeindeNev) úgyis a
      // helységnév-magot bontja ki belőle („Reformierte Kirchengemeinde
      // Barátos"), tehát bármelyik név-alakból helyes német nevet képez.
      const gyulekezetNev =
        ((docLang === 'ro'
          ? header?.nevRo
          : docLang === 'en' || docLang === 'de'
            ? header?.nevEn
            : header?.nevHu) || ''
        ).trim() ||
        (header?.hivatalosNev || '').trim() ||
        (autoValues.gyulekezet || '').trim()
      // A keltezés helysége a SZERKESZTHETŐ mezőből (F8e — user 4.), amely
      // alapból a nyelvhelyes nevet ajánlja (helysegHu/helysegRo).
      const keltSor = keltezesSor(docLang, keltHelysegErtek, todayIso())
      const lelkesz = (autoValues.lelkipasztor || '').trim()
      const targyText = (dokumentumTargy || '').trim()
      const torzs = csalad.buildBody({
        persons,
        nyelv: docLang,
        kezi: keziValues,
        gyulekezetNev,
        // F8f: a kipipált események — a hiányzó kulcs a család alapértéke lenne,
        // ezért az esemenyAllapot MINDEN kínált kulcsot expliciten megad.
        esemenyek: esemenyAllapot,
      })
      // A törzs app-generált és minden dinamikus érték escape-elt, de a
      // védelmi mélység kedvéért ugyanazon a sanitizeren megy át, mint a
      // sablon-út (a családok a whitelistelt style-készleten belül építenek).
      return dokumentumBurok({
        lang: docLang,
        cim: csalad.nev,
        fejlecHtml: !noLetterhead && header ? fejlecHtmlNyelven(docLang, header) : '',
        // A Szám/Tárgy sorok KÉSZ HTML-ként mennek a burokba → itt escape-elünk.
        szamSor: `${cimkek.szam}: ${escapeHtml(iratszamText)}`,
        targySor: targyText ? `${cimkek.targy}: ${escapeHtml(targyText)}` : '',
        torzsHtml: sanitizeFilingHtml(torzs),
        alairasHtml: alairasBlokkHtml(keltSor, lelkesz, ALAIRO_SZEREP[docLang]),
      })
    },
    [
      docLang,
      header,
      autoValues,
      noLetterhead,
      dokumentumTargy,
      keltHelysegErtek,
      persons,
      keziValues,
      esemenyAllapot,
    ],
  )

  // Az életút-igazolás B2-adatcsomagja: a betöltött adat + a kézi mezők.
  // A kézi sírhely-szöveg CSAK akkor kerül a nyomtatványra, ha a Sírhelyek
  // modul láncából nem jött strukturált érték (az adat-forrás az elsődleges).
  const eletutIgazolasData = useMemo<EletutIgazolasData | null>(() => {
    if (!eletutAdat) return null
    const sirhelyKezi = eletutSirhely.trim()
    const adat =
      !eletutAdat.sirhely && sirhelyKezi ? { ...eletutAdat, sirhely: sirhelyKezi } : eletutAdat
    return { adat, hianyok: eletutHianyok, kerelmezo: eletutKerelmezo, cel: eletutCel }
  }, [eletutAdat, eletutHianyok, eletutKerelmezo, eletutCel, eletutSirhely])

  const fullHtml = useMemo(() => {
    if (eletutMode) {
      if (!eletutIgazolasData) return eletutUresElonezetHtml()
      // A nyomtatvány a saját fejlécét építi (F8c: a nyelv-mód szerint —
      // 'harom' módban magyar levélfej + 3-nyelvű egyház-lánc); a
      // dokumentum-nyelv választó itt nem érvényes.
      return buildEletutIgazolasHtml({
        data: eletutIgazolasData,
        header: header ?? URES_FEJLEC,
        iratszam: issuedIratszam, // null → kitöltő-vonal a nyomtatványon
        // F8e (user 3./4.): a szerkeszthető, nyelvhelyes településnév — ez
        // jelenik meg a nyomtatvány keltezésében ÉS aláírás-blokkjában is.
        helyseg: keltHelysegErtek,
        datum: autoValues.datum || formatHungarianDate(),
        lelkipasztor: autoValues.lelkipasztor || '',
        fogondnok: eletutFogondnok.trim() || null,
        nyelvMod: eletutNyelvMod,
      })
    }
    // F8c: a dokumentum-család a teljes iratot maga építi a kért nyelven.
    if (selectedCsalad) return composeCsaladHtml(selectedCsalad, iratszamValue)
    return composeStandardHtml(mergedValues)
  }, [
    eletutMode,
    eletutIgazolasData,
    header,
    issuedIratszam,
    autoValues,
    keltHelysegErtek,
    eletutFogondnok,
    eletutNyelvMod,
    selectedCsalad,
    composeCsaladHtml,
    iratszamValue,
    composeStandardHtml,
    mergedValues,
  ])

  // ── F8c: hiányzó anyakönyvi adatok listája a gyors-bevezetéshez ──
  // Család-útnál a család releváns eseményei; régi sablon-útnál a sablon
  // placeholderei jelölik ki, mely dátumok kellenének. Életút-módban a
  // meglévő TODO-lista fedi a hiányokat.
  const quickEntries = useMemo(() => {
    if (eletutMode) return []
    let kinds: AnyakonyvKind[]
    if (selectedCsalad) {
      // F8f: a család FIX készlete + a BEPIPÁLT események uniója — így a
      // korábbi gyors-bevezetések megmaradnak, és az újonnan bekapcsolt
      // esemény (pl. konfirmáció a keresztelési igazoláson) is pótolható
      // közvetlenül az anyakönyvbe.
      const set = new Set<AnyakonyvKind>(CSALAD_ANYAKONYV_KINDS[selectedCsalad.id] || [])
      for (const [key, be] of Object.entries(esemenyAllapot)) {
        if (be) set.add(ESEMENY_ANYAKONYV_KIND[key as EsemenyKulcs])
      }
      kinds = [...set]
    } else {
      const set = new Set(placeholders)
      kinds = []
      if (set.has('kereszteles_datuma') || set.has('kereszteles_datuma_2')) kinds.push('kereszteles')
      if (set.has('konfirmalas_datuma') || set.has('konfirmalas_datuma_2')) kinds.push('konfirmalas')
      if (set.has('eskuvo_datuma')) kinds.push('hazassag')
    }
    if (kinds.length === 0) return []
    const out: Array<{ person: PersonCertData; kind: AnyakonyvKind }> = []
    for (const p of persons) {
      for (const k of kinds) {
        if (hianyzikAnyakonyviDatum(p, k)) out.push({ person: p, kind: k })
      }
    }
    return out
  }, [eletutMode, selectedCsalad, placeholders, persons, esemenyAllapot])
  // Gépelés közbeni render-vihar ellen IDŐ-alapú debounce: az iframe
  // srcDoc-cseréje teljes dokumentum-újraparszolást + layoutot indít, és a
  // useDeferredValue ezt leütésenként átengedte (nem debounce) — lassú
  // mobilon a billentyűzet-visszajelzés is akadozott. A nyomtatás/PDF a
  // friss fullHtml-t kapja, így az soha nem lehet elavult.
  const [iframeHtml, setIframeHtml] = useState(fullHtml)
  useEffect(() => {
    const t = window.setTimeout(() => setIframeHtml(fullHtml), 300)
    return () => window.clearTimeout(t)
  }, [fullHtml])

  // ── Fit-to-page A4 előnézet (F8e — GYÖKÉRFIX) ────────────────────
  // A kutatási tervdoc 4. fejezetének 3-rétegű mintája:
  //   scroll-host (ITT mérünk) → fit-wrapper (layout-méret = A4 × scale,
  //   ez van centrálva) → iframe (fix A4-szélesség + transform: scale()).
  // A transform a layout UTÁN hat, ezért a wrapper méretét KÉZZEL szorozzuk a
  // skálával — enélkül a skálázott lap változatlan méretű dobozt foglalt, és
  // túllógott/levágódott (ez volt a háromszor bejelentett hiba gyökere).
  // A skálázás CSAK a szélességhez igazít: a teljes lapszélesség mindig
  // látszik (vízszintes görgetés soha), a hosszabb irat függőlegesen görgethető.
  const previewHostRef = useRef<HTMLDivElement | null>(null)
  const previewRoRef = useRef<ResizeObserver | null>(null)
  const previewRafRef = useRef(0)
  const [scale, setScale] = useState(1)

  const applyScale = useCallback(() => {
    const el = previewHostRef.current
    if (!el) return
    const cs = window.getComputedStyle(el)
    const padL = Number.parseFloat(cs.paddingLeft) || 0
    const padR = Number.parseFloat(cs.paddingRight) || 0
    // clientWidth = padding-doboz a görgetősáv NÉLKÜL; a paddingeket és a
    // lap-keretet levonva kapjuk a lapnak jutó tényleges szélességet.
    const w = el.clientWidth - padL - padR - LAP_KERET_PX
    if (w <= 0) return // 0-mérés-őr: rejtett panel (mobil fül) → NE írj semmit
    const next = Math.min(1, Math.max(MIN_SCALE, w / A4_W_PX))
    // Küszöb: a törtpixel-ingadozásból származó ResizeObserver-hurok ellen.
    setScale((prev) => (Math.abs(prev - next) > 0.0005 ? next : prev))
  }, [])

  /**
   * CALLBACK REF a mérő-hosthoz (2026-07-25, a NEGYEDIK bejelentés javítása).
   *
   * A korábbi `useLayoutEffect([open])` csak a dialógus megnyitásának
   * pillanatában futott — ha az előnézet-panel akkor MÉG NEM volt a DOM-ban
   * (betöltés alatt, vagy mobilon a másik fülön), a `previewHostRef.current`
   * null volt, a ResizeObserver sosem kapcsolt be, és a skála 1-en ragadt →
   * a 794 px-es lap túllógott a ~500 px-es panelen, a szöveg jobb oldalt
   * levágódott. A callback ref a csomópont TÉNYLEGES csatolásakor fut, tehát
   * feltételes renderelésnél és fül-váltásnál is mindig beindítja a mérést.
   */
  const setPreviewHost = useCallback(
    (node: HTMLDivElement | null) => {
      previewRoRef.current?.disconnect()
      previewRoRef.current = null
      previewHostRef.current = node
      if (!node) return
      applyScale()
      if (typeof ResizeObserver === 'undefined') return
      // rAF-halasztás: a RO-callbackben azonnal írt layout „ResizeObserver
      // loop" hibát adna; így a következő frame-ben, egyszer futunk le.
      const ro = new ResizeObserver(() => {
        window.cancelAnimationFrame(previewRafRef.current)
        previewRafRef.current = window.requestAnimationFrame(applyScale)
      })
      ro.observe(node)
      previewRoRef.current = ro
    },
    [applyScale],
  )

  // Unmount-takarítás (a callback ref a node cseréjét már kezeli).
  useEffect(
    () => () => {
      previewRoRef.current?.disconnect()
      window.cancelAnimationFrame(previewRafRef.current)
    },
    [],
  )

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [contentH, setContentH] = useState(A4_H_PX)
  /**
   * Az iframe TARTALMI magasságának mérése (a lap-wrapper ehhez igazodik).
   * A documentElement.scrollHeight sosem kisebb az iframe aktuális
   * magasságánál („racsni": rövidebb dokumentumra üres lap maradt volna),
   * ezért a mérés előtt 0-ra állítjuk a magasságot — a tervdoc iframe-mintája.
   */
  const measurePreview = useCallback(() => {
    const el = iframeRef.current
    const doc = el?.contentDocument
    if (!el || !doc) return
    const elozoHeight = el.style.height
    el.style.height = '0px'
    const body = doc.body
    const de = doc.documentElement
    const lap = (body?.firstElementChild as HTMLElement | null) ?? null
    const merve = Math.max(
      body?.scrollHeight ?? 0,
      de?.scrollHeight ?? 0,
      body ? body.getBoundingClientRect().height : 0,
      lap ? lap.getBoundingClientRect().height : 0,
    )
    if (merve <= 0) {
      // Rejtett/üres dokumentum (pl. mobil fül-váltás) — az előző magasság marad.
      el.style.height = elozoHeight
      return
    }
    const next = Math.max(Math.ceil(merve), A4_H_PX)
    // A React csak state-VÁLTOZÁSNÁL írná vissza a magasságot; ha a mért érték
    // azonos a mostanival, kézzel kell visszaállítani (különben 0-n ragadna).
    el.style.height = `${next}px`
    setContentH(next)
  }, [])

  /**
   * Mérés a betöltés UTÁN: `doc.fonts.ready` (a webfont újratördeli a lapot)
   * + egy rAF, hogy a layout biztosan lezáruljon.
   */
  const scheduleMeasure = useCallback(() => {
    const run = () => window.requestAnimationFrame(() => measurePreview())
    const fonts = iframeRef.current?.contentDocument?.fonts
    if (fonts?.ready) void fonts.ready.then(run).catch(() => run())
    else run()
  }, [measurePreview])

  // Mobil fül-váltás után (a panel újra látható lesz) újramérünk — a rejtett
  // állapotban a 0-mérés-őr miatt sem a skála, sem a magasság nem frissült.
  useEffect(() => {
    if (!open || mobileView !== 'preview') return
    scheduleMeasure()
  }, [open, mobileView, scheduleMeasure])

  // ── Átadás rögzítése iktatás után (F8b — B3 registerAtadas) ──────
  // Csak sikeres iktatás + visszaolvasott iratszám után hívjuk: a tag státusza
  // „elköltözött" lesz, a cél-gyülekezet átjelentkezési kérelmet + best-effort
  // részletes üzenetet kap (a warnings nem-blokkoló jelzések).
  async function runRegisterAtadas(iratszam: string) {
    const szemely = persons[0]
    const cel = celCongregation
    if (!szemely || !cel) return // a handleIssue-őr miatt nem fordulhat elő
    // A végleges (iratszámos) dokumentum szövege megy az értesítés törzsébe —
    // F8c: család-útnál ugyanaz a composeCsaladHtml, mint az előnézeté.
    const finalHtml = selectedCsalad
      ? composeCsaladHtml(selectedCsalad, iratszam)
      : composeStandardHtml({
          ...autoValues,
          ...personValues,
          ...manualValues,
          iratszam,
        })
    const res = await registerAtadas({
      szemelyId: szemely.id,
      celCongregationId: cel.id,
      iktatoszam: iratszam,
      dokumentumHtml: finalHtml,
    })
    if (res.success) {
      toast.success(
        `Átadás rögzítve: ${szemely.teljesNev} státusza „elköltözött” lett, a(z) ${cel.nev} átjelentkezési értesítést kapott (${iratszam}).`,
      )
    } else {
      toast.error(
        res.error ||
          'Az átadás rögzítése sikertelen — az igazolás iktatva maradt, az átadást a Tagnyilvántartásban rögzítsd kézzel.',
      )
    }
    for (const w of res.warnings) toast.warning(w)
  }

  // ── Az életút-igazolás hiány-TODO-listájának nyomtatása ──────────
  async function handleTodoPrint() {
    if (eletutHianyok.length === 0) return
    setPrinting(true)
    try {
      await printToBrowser(buildEletutTodoHtml(eletutHianyok, persons[0]?.teljesNev || ''))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A TODO-lista nyomtatása nem indítható.')
    } finally {
      setPrinting(false)
    }
  }

  // ── Kiállítás és iktatás ─────────────────────────────────────────
  async function handleIssue() {
    if (issuing || issued) return // dupla-kattintás védelem
    const trimmedSubject = subject.trim()
    if (!trimmedSubject) {
      toast.error('Az iktatókönyvi tárgy kötelező.')
      return
    }
    if (eletutMode && (!persons[0] || !eletutIgazolasData)) {
      toast.error('Az életút-igazoláshoz válassz ki egy egyháztagot, és várd meg az adatok betöltését.')
      return
    }
    if (atadasMode && (!persons[0] || !celCongregation)) {
      toast.error('Az átadási sablonhoz válaszd ki az átadott egyháztagot ÉS a cél-egyházközséget.')
      return
    }
    setIssuing(true)
    try {
      const kelt = todayIso()
      const res = await saveFilingEntry({
        direction: 'outgoing',
        kelt,
        subject: trimmedSubject,
        // F8c: a hivatalos levél (nem személyhez kötött család) partnere a
        // kézi „Címzett" mező; egyébként a kiválasztott személyek nevei.
        sender_or_recipient:
          selectedCsalad?.id === 'hivatalos_level'
            ? (keziValues.cimzett || '').trim() || null
            : nevek || null,
        targykivonat: null,
        elintezes_ideje: kelt,
        elintezes_modja: 'Kiállítva',
        ugykor_kod: ugykorKod,
        retention_type: ugykorKod ? getRetentionForUgykor(ugykorKod) : null,
        has_duplicate: false,
      })
      if (res?.error) {
        toast.error(res.error)
        return
      }
      setIssued(true)
      // Az iratszám a saveFilingEntry által visszaadott, atomikusan kiosztott
      // sorszámból képződik. (A korábbi (tárgy + kelt) alapú getFilingEntries-
      // visszakeresés versenyhelyzetben MÁSIK irat számát találhatta meg, a
      // néma-üres hibaelnyelése mellett pedig az elavult előnézeti szám maradt.)
      if (res && 'sequenceNumber' in res && typeof res.sequenceNumber === 'number') {
        const iratszam = `${res.year}/${res.sequenceNumber}`
        setIssuedIratszam(iratszam)
        toast.success(`Iktatva: ${iratszam} — a szám bekerült a dokumentumba.`)
        // Átadás-mód: az iktatószám birtokában rögzítjük az átadás tényét is.
        if (atadasMode) await runRegisterAtadas(iratszam)
      } else {
        toast.warning(
          'Az irat iktatva lett, de a kiosztott iratszámot nem sikerült visszaolvasni — ellenőrizd az iktatókönyvben, és írd be kézzel.',
        )
        if (atadasMode) {
          toast.warning(
            'Az átadás rögzítése iktatószám nélkül nem lehetséges — a cél-gyülekezet értesítése elmaradt; rögzítsd az átadást a Tagnyilvántartásban.',
          )
        }
      }
      onIssued()
    } finally {
      setIssuing(false)
    }
  }

  // ── Nyomtatás / PDF ──────────────────────────────────────────────
  function safeFilename(): string {
    const base = `${docTitle}${nevek ? ` - ${nevek}` : ''}`
    return `${base.replaceAll(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ_ -]/g, '_')}.pdf`
  }

  async function handlePdf() {
    setPrinting(true)
    try {
      await printToPdf(fullHtml, safeFilename(), { orientation: 'portrait' })
      toast.success('PDF letöltve.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A PDF exportálás sikertelen.')
    } finally {
      setPrinting(false)
    }
  }

  async function handlePrint() {
    setPrinting(true)
    try {
      await printToBrowser(fullHtml)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A nyomtatás nem indítható.')
    } finally {
      setPrinting(false)
    }
  }

  // ── Mobil fül-váltás fókusz-kezeléssel (a11y) ────────────────────
  function switchMobileView(next: 'form' | 'preview') {
    setMobileView(next)
    // A panel headingjére visszük a fókuszt, hogy a felolvasó is kövesse.
    window.setTimeout(() => {
      const el = next === 'form' ? formPanelRef.current : previewPanelRef.current
      el?.focus()
    }, 0)
  }

  const issueYearNow = new Date().getFullYear()

  // ── F8c: szekció-számozás módonként (életútban nincs nyelv-szekció;
  // 0-személyes családnál — pl. hivatalos levél — nincs személy-szekció).
  const szemelySzekcio = eletutMode || !selectedCsalad || selectedCsalad.maxSzemely > 0
  let szekcioSzam = 1
  const numSablon = szekcioSzam++
  const numSzemelyek = szemelySzekcio ? szekcioSzam++ : 0
  const numNyelv = !eletutMode ? szekcioSzam++ : 0
  const numAdatok = szekcioSzam++
  const numIktatas = szekcioSzam

  /**
   * F8e (user 4.) — „Keltezés helysége" mező. Mindhárom Adatok-szekcióban
   * (család / saját sablon / életút) ugyanez az egy mező jelenik meg (a
   * szekciók kizárják egymást, így az azonosító nem duplázódik). Az érték a
   * keltezés-sorba ÉS az életút-nyomtatványba is bekerül.
   */
  const keltezesHelysegMezo = (
    <div className="space-y-1">
      <label htmlFor="cert-kelt-helyseg" className="text-sm font-medium text-foreground">
        Keltezés helysége
      </label>
      <Input
        id="cert-kelt-helyseg"
        value={keltHelyseg}
        onChange={(e) => {
          setKeltHelyseg(e.target.value)
          setKeltHelysegTouched(true)
        }}
        placeholder={keltHelysegAuto || 'pl. Barátos'}
      />
      <p className="text-[11px] leading-snug text-muted-foreground">
        Ez a településnév kerül a keltezés-sorba (és az igazolás aláírás-blokkjába).
        Nyelvváltáskor a rendszer a nyelvhelyes nevet ajánlja — kézzel bármikor átírható
        (pl. ha a magyar név helyett a román jelenne meg).
      </p>
    </div>
  )

  /**
   * F8f (user 2.) — „Az igazolás tartalma": kipipálható anyakönyvi ESEMÉNYEK.
   * Csak a család kínálta opciók (esemenyOpciok) jelennek meg; a pipa azonnal
   * átírja az élő előnézetet (esemenyAllapot → buildBody `esemenyek`).
   * Adat nélküli eseménynél halvány jelzés figyelmeztet, hogy kitöltő-vonal
   * kerül a szövegbe — a jelölő ettől még bekapcsolható (kézzel pótolható a
   * papíron), a hiányzó dátum pedig a lenti gyors-bevezetéssel az ANYAKÖNYVBE
   * is bevezethető.
   */
  const esemenyBlokk =
    esemenyOpciok && esemenyOpciok.length > 0 ? (
      <fieldset className="rounded-xl border border-border bg-muted/40 p-3">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-foreground">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden />
          Az igazolás tartalma
        </legend>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          Jelöld be, mely anyakönyvi események kerüljenek bele a szövegbe. Az adat nélküli
          kiegészítő eseményekről a rendszer leveszi a pipát — kézzel bármikor visszatehető.
        </p>
        <div className="mt-1.5 space-y-0.5">
          {esemenyOpciok.map((o) => {
            const kind = ESEMENY_ANYAKONYV_KIND[o.key]
            const hianyzok = persons.filter((p) => hianyzikAnyakonyviDatum(p, kind))
            const bepipalva = esemenyAllapot[o.key] === true
            const mezoId = `cert-esemeny-${o.key}`
            return (
              <div key={o.key}>
                <label
                  htmlFor={mezoId}
                  className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm text-foreground"
                >
                  <input
                    id={mezoId}
                    type="checkbox"
                    checked={bepipalva}
                    onChange={(e) =>
                      setEsemenyValasztas((prev) => ({ ...prev, [o.key]: e.target.checked }))
                    }
                    className="size-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0">{o.label}</span>
                </label>
                {hianyzok.length > 0 ? (
                  <p className="pl-[26px] text-[11px] leading-snug text-muted-foreground">
                    {hianyzok.length === persons.length
                      ? 'nincs adat'
                      : `nincs adat: ${hianyzok.map((p) => p.teljesNev).join(', ')}`}{' '}
                    {bepipalva
                      ? '— kitöltő-vonal kerül a szövegbe'
                      : '— bepipálva kitöltő-vonal kerülne a szövegbe'}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </fieldset>
    ) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* F8c: overflow-x-hidden a dialóguson — az `overflow-y-auto` mellett az
          overflow-x különben `auto`-ra számítódik, és bármely túlszéles belső
          elem VÍZSZINTES scrollbart adna az egész ablaknak. */}
      <DialogContent className="max-h-[96vh] overflow-y-auto overflow-x-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Stamp className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-heading text-lg text-foreground">
                Igazolás / levél kiállítása
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Magyar, román, angol vagy német nyelvű hivatalos irat anyakönyvi adatokkal
                előtöltve — kiállítás után automatikus iktatással.
              </DialogDescription>
            </div>
          </div>

          {/* lg alatt nézet-váltó: űrlap ⇄ előnézet. Szándékosan aria-pressed-es
              toggle-gombpár (az iratcsomó-leltár mód-váltó mintája), NEM ARIA
              tab-minta — a role='tab' teljes APG-szerződést kívánna
              (aria-controls + tabpanel + nyílbillentyű-navigáció), a csonka
              változat a felolvasónak többet ártott, mint használt. */}
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 lg:hidden" role="group" aria-label="Szerkesztés vagy előnézet">
            {([
              ['form', 'Szerkesztés'],
              ['preview', 'Előnézet'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mobileView === key}
                onClick={() => switchMobileView(key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  mobileView === key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ── BAL: vezérlők (a)–(d) + iktatás ─────────────────── */}
          <div
            ref={formPanelRef}
            tabIndex={-1}
            aria-label="Kiállítás beállításai"
            className={cn(
              'min-w-0 space-y-5 border-border p-4 outline-none sm:p-5 lg:block lg:border-r',
              mobileView === 'form' ? 'block' : 'hidden',
            )}
          >
            {loadingCtx ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Adatok betöltése…
              </div>
            ) : (
              <>
                {/* (a) Dokumentum — F8c: csoportosított választó (kiemelt életút →
                    igazolás-családok → levél-családok + szabad levél → saját sablonok) */}
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {numSablon}. Dokumentum
                  </h3>
                  <select
                    value={templateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    aria-label="Dokumentum kiválasztása"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {/* F8b: kiemelt speciális mód mindenek ELŐTT. */}
                    <option value={ELETUT_ID}>⭐ Életút- és családi igazolás (hivatalos)</option>
                    <optgroup label="Igazolások">
                      {DOKUMENTUM_CSALADOK.filter((cs) => cs.tipus === 'igazolas').map((cs) => (
                        <option key={cs.id} value={CSALAD_PREFIX + cs.id}>
                          {cs.nev}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Levelek">
                      {DOKUMENTUM_CSALADOK.filter((cs) => cs.tipus === 'level').map((cs) => (
                        <option key={cs.id} value={CSALAD_PREFIX + cs.id}>
                          {cs.nev}
                        </option>
                      ))}
                      <option value={FREE_LETTER_ID}>Szabad levél (üres törzs)</option>
                    </optgroup>
                    {sajatSablonok.length > 0 ? (
                      <optgroup label="Saját sablonok">
                        {sajatSablonok.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nev}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                  {selectedCsalad ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Iktatáskor: ügykör <b>{selectedCsalad.ugykorKod}</b>{' '}
                      {selectedCsalad.ugykorNev} · Irattár: az ügykör szerint (
                      {getRetentionForUgykor(selectedCsalad.ugykorKod)})
                    </p>
                  ) : null}
                  {eletutMode ? (
                    <p className="rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-[11px] leading-snug text-foreground">
                      Hivatalos igazolás egy egyháztag teljes egyházi életútjáról és családjáról,
                      anyakönyvi hivatkozásokkal — akár hatósági/bírósági felhasználásra. A
                      szerkezete kötött; a hiányzó rovatok kitöltő-vonallal nyomtatódnak. Az
                      „Igazolás nyelve” lentebb választható (alapesetben háromnyelvű).
                    </p>
                  ) : null}
                  {templateSeedFailed ? (
                    <p className="text-xs text-muted-foreground">
                      Az alapsablonok automatikus betöltése nem sikerült — a Sablonok fülön
                      pótolhatók (a beépített dokumentumok enélkül is működnek).
                    </p>
                  ) : null}
                </section>

                {/* (b) Személyek — F8c: 0-személyes családnál (hivatalos levél)
                    a teljes szekció elmarad; a limit a család maxSzemely-e. */}
                {szemelySzekcio ? (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {eletutMode
                      ? `${numSzemelyek}. Egyháztag (egy személy)`
                      : maxSzemelyLimit === 1
                        ? `${numSzemelyek}. Személy (anyakönyvből)`
                        : `${numSzemelyek}. Személyek (anyakönyvből, legfeljebb ${maxSzemelyLimit})`}
                  </h3>
                  {eletutMode ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Az életút-igazolás EGY személyről szól — új kiválasztás lecseréli az előzőt.
                    </p>
                  ) : null}

                  {persons.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Kiválasztott személyek">
                      {persons.map((p, i) => (
                        <li
                          key={p.id}
                          className="flex items-center gap-1.5 rounded-full border border-border bg-muted py-1 pl-2.5 pr-1 text-xs text-foreground"
                        >
                          <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
                          <span>
                            {p.teljesNev}
                            <span className="ml-1 text-muted-foreground">({i + 1}. személy)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => removePerson(p.id)}
                            aria-label={`${p.teljesNev} eltávolítása`}
                            className="rounded-full p-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Név keresése (min. 2 betű)…"
                      aria-label="Személy keresése az anyakönyvben"
                      className="pl-9"
                    />
                  </div>

                  {searching ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden /> Keresés…
                    </p>
                  ) : searchError ? (
                    <p className="text-xs text-destructive">{searchError}</p>
                  ) : hits.length > 0 ? (
                    <ul className="max-h-48 overflow-y-auto rounded-xl border border-border bg-card divide-y divide-border">
                      {hits.map((hit) => {
                        const already = persons.some((p) => p.id === hit.id)
                        return (
                          <li key={hit.id}>
                            <button
                              type="button"
                              disabled={already || loadingPersons}
                              onClick={() => void addPerson(hit)}
                              className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted disabled:opacity-50"
                            >
                              <span className="min-w-0 truncate font-medium">{hit.nev}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {[fmtDateHu(hit.szuletesiDatum), hit.anyjaNeve ? `a.n.: ${hit.anyjaNeve}` : '']
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : searchQuery.trim().length >= 2 ? (
                    <p className="text-xs text-muted-foreground">Nincs találat.</p>
                  ) : null}

                  {/* F8c: anyakönyvi gyors-bevezetés a hiányzó dátumokhoz — a
                      mentés után a személy-adatok újratöltődnek, a bevezetett
                      érték a dokumentum helyére kerül. */}
                  {quickEntries.length > 0 ? (
                    <div className="space-y-1.5">
                      {quickEntries.map(({ person, kind }) => (
                        <QuickRegistryEntry
                          key={`${person.id}-${kind}`}
                          person={person}
                          kind={kind}
                          onSaved={reloadPersons}
                        />
                      ))}
                    </div>
                  ) : null}

                  {selectedCsalad && persons.length > 1 ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      A dokumentum minden kiválasztott személyre külön bekezdést kap, a
                      kiválasztás sorrendjében.
                    </p>
                  ) : null}
                  {!selectedCsalad && !eletutMode && persons.length > 1 ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Több személynél a szám nélküli mezők az <b>1. személy</b> adatai, a 2. személyé
                      a <code>_2</code> végű placeholderek ({'{{nev_2}}'}…); a {'{{nevek}}'} az összes
                      név összefűzve.
                    </p>
                  ) : null}
                </section>
                ) : null}

                {/* (b/2) Átadás-mód: cél-egyházközség kereső (F8b — B4) */}
                {atadasMode ? (
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {numSzemelyek || numSablon}/b. Cél-egyházközség (átadás)
                    </h3>

                    {celCongregation ? (
                      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted px-2.5 py-1.5 text-sm text-foreground">
                        <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          {celCongregation.nev}
                          {celCongregation.megye ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({celCongregation.megye})
                            </span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          onClick={clearCelCongregation}
                          aria-label="Cél-egyházközség törlése"
                          className="rounded-full p-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <Building2
                            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                          />
                          <Input
                            value={congQuery}
                            onChange={(e) => setCongQuery(e.target.value)}
                            placeholder="Gyülekezet neve (min. 2 betű)…"
                            aria-label="Cél-egyházközség keresése"
                            className="pl-9"
                          />
                        </div>
                        {congSearching ? (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Keresés…
                          </p>
                        ) : congError ? (
                          <p className="text-xs text-destructive">{congError}</p>
                        ) : congHits.length > 0 ? (
                          <ul className="max-h-48 overflow-y-auto rounded-xl border border-border bg-card divide-y divide-border">
                            {congHits.map((hit) => (
                              <li key={hit.id}>
                                <button
                                  type="button"
                                  onClick={() => selectCelCongregation(hit)}
                                  className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted"
                                >
                                  <span className="min-w-0 truncate font-medium">{hit.nev}</span>
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {hit.megye || '—'}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : congQuery.trim().length >= 2 ? (
                          <p className="text-xs text-muted-foreground">Nincs találat.</p>
                        ) : null}
                      </>
                    )}

                    <p className="text-[11px] leading-snug text-muted-foreground">
                      A kiválasztott név a „Cél-egyházközség” mezőbe kerül (ott kézzel tovább
                      pontosítható). Az iktatás után a rendszer rögzíti az átadás tényét: a tag
                      státusza „elköltözött” lesz, a cél-egyházközség lelkésze pedig
                      átjelentkezési értesítést kap az iktatószámmal.
                    </p>
                  </section>
                ) : null}

                {!eletutMode ? (
                  <>
                {/* (c) A dokumentum nyelve — F8c: a korábbi „Hivatalos fejléc"
                    választó HELYETT. Egyetlen választó vezérli a fejlécet, a
                    Szám/Tárgy címkéket, a keltezést és a család-törzs nyelvét. */}
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {numNyelv}. Dokumentum nyelve
                  </h3>
                  <select
                    value={docLang}
                    onChange={(e) => setDocLang(e.target.value as DokumentumNyelv)}
                    aria-label="A dokumentum nyelve"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {DOC_LANG_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {selectedCsalad
                      ? 'A nyelv az EGÉSZ iratot vezérli: a levélfejet, a Szám/Tárgy címkéket (a Tárgy szövegét is), a keltezést és a törzs-szöveget.'
                      : 'A nyelv a levélfejet, a Szám/Tárgy címkéket és a keretet vezérli — a saját sablon törzse a megírt nyelven marad.'}
                  </p>
                  {docLang === 'de' ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Német nyelvnél a levélfej az angol változatból készül (a gyülekezetnek
                      nincs német neve), német hivatal-felirattal.
                    </p>
                  ) : null}
                  <label className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={noLetterhead}
                      onChange={(e) => setNoLetterhead(e.target.checked)}
                      className="size-3.5"
                    />
                    Hivatalos levélfej nélkül (pl. előnyomott levélpapírra)
                  </label>
                  {headerError ? (
                    <p className="flex items-start gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {headerError} — a dokumentum levélfej nélkül készül.
                    </p>
                  ) : null}
                </section>

                {selectedCsalad ? (
                  /* (d) F8c: a dokumentum-család kézi mezői — a törzs-szöveget a
                     rendszer állítja össze a kért nyelven, itt csak a családhoz
                     tartozó kiegészítő adatok tölthetők. */
                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {numAdatok}. Adatok
                    </h3>
                    {/* F8f: elöl a kipipálható események — ezek döntik el, mi
                        kerül a törzs-szövegbe (a többi mező csak kiegészít). */}
                    {esemenyBlokk}
                    {keltezesHelysegMezo}
                    {selectedCsalad.keziMezok.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">
                        Ehhez a dokumentumhoz nincs további kézi mező — minden adat az
                        anyakönyvből töltődik.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {selectedCsalad.keziMezok.map((m) => {
                          const isDatum = m.key.endsWith('_datuma')
                          const isTobbsoros = m.key === 'torzs'
                          const mezoId = `csalad-mezo-${m.key}`
                          return (
                            <div key={m.key} className="space-y-1">
                              <label
                                htmlFor={mezoId}
                                className="text-sm font-medium text-foreground"
                              >
                                {m.label}
                              </label>
                              {isTobbsoros ? (
                                <textarea
                                  id={mezoId}
                                  value={keziValues[m.key] ?? ''}
                                  onChange={(e) =>
                                    setKeziValues((prev) => ({ ...prev, [m.key]: e.target.value }))
                                  }
                                  rows={8}
                                  placeholder="Írd ide a levél szövegét… (üres sor = új bekezdés)"
                                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                              ) : (
                                <input
                                  id={mezoId}
                                  type={isDatum ? 'date' : 'text'}
                                  value={keziValues[m.key] ?? ''}
                                  onChange={(e) =>
                                    setKeziValues((prev) => ({ ...prev, [m.key]: e.target.value }))
                                  }
                                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      A törzs-szöveget a rendszer állítja össze a kiválasztott nyelven, a
                      személyek anyakönyvi adataival — a hiányzó értékek kitöltő-vonallal
                      nyomtatódnak, és a papíron kézzel pótolhatók.
                    </p>
                  </section>
                ) : (
                /* (d) Placeholder-űrlap (saját sablonok + szabad levél — régi út) */
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {numAdatok}. Mezők
                  </h3>
                  {keltezesHelysegMezo}
                  {placeholders.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">
                      A dokumentumban nincsenek további kitöltendő mezők.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {placeholders.map((key) => {
                        const isIratszam = key === 'iratszam'
                        const fromPerson = key in personValues && !(key in manualValues)
                        const isAuto = autoKeys.has(key)
                        const value = isIratszam ? iratszamValue : (mergedValues[key] ?? '')
                        const hint = isIratszam
                          ? issuedIratszam
                            ? 'Iktatott, végleges iratszám'
                            : previewIratszam
                              ? `Várható szám iktatáskor: ${previewIratszam} — a dokumentumba csak a tényleges iktatáskor kerül szám`
                              : 'A szám a tényleges iktatáskor kerül a dokumentumba'
                          : fromPerson
                            ? 'Anyakönyvből előtöltve — szerkeszthető'
                            : isAuto
                              ? 'Automatikusan előtöltve — szerkeszthető'
                              : undefined
                        return (
                          <div key={key} className="space-y-1">
                            <label
                              htmlFor={`cert-ph-${key}`}
                              className="text-sm font-medium text-foreground"
                            >
                              {placeholderLabel(key)}
                            </label>
                            <input
                              id={`cert-ph-${key}`}
                              type="text"
                              value={value}
                              readOnly={isIratszam && Boolean(issuedIratszam)}
                              onChange={(e) =>
                                setManualValues((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              placeholder={`(${key})`}
                              className={cn(
                                'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
                                isIratszam && issuedIratszam && 'bg-muted text-muted-foreground',
                              )}
                            />
                            {hint ? (
                              <p className="text-[11px] text-muted-foreground">{hint}</p>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Törzs-szöveg */}
                  <div className="space-y-1">
                    <label htmlFor="cert-body" className="text-sm font-medium text-foreground">
                      {szabad ? 'Törzs-szöveg' : 'Törzs-szöveg (HTML, placeholderekkel)'}
                    </label>
                    <textarea
                      id="cert-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={szabad ? 8 : 10}
                      placeholder={
                        szabad
                          ? 'Írd ide a levél szövegét… (a {{nev}}, {{datum}} típusú placeholderek itt is működnek)'
                          : ''
                      }
                      className={cn(
                        'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
                        !szabad && 'font-mono text-xs',
                      )}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {szabad
                        ? 'A „Szám: …” sor és a záró blokk (keltezés + aláírás) automatikusan a dokumentumra kerül.'
                        : 'A sablon szerkesztése csak erre a kiállításra érvényes — a mentett sablont nem módosítja.'}
                    </p>
                  </div>
                </section>
                )}
                  </>
                ) : (
                  /* ── Életút-mód: hiány-panel + kézi mezők (a (c)/(d) helyett) ── */
                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {numAdatok}. Az igazolás adatai
                    </h3>

                    {/* F8c: az igazolás nyelve — default a háromnyelvű nyomtatvány. */}
                    <div className="space-y-1">
                      <label
                        htmlFor="eletut-nyelv"
                        className="text-sm font-medium text-foreground"
                      >
                        Igazolás nyelve
                      </label>
                      <select
                        id="eletut-nyelv"
                        value={eletutNyelvMod}
                        onChange={(e) => setEletutNyelvMod(e.target.value as EletutNyelvMod)}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="harom">Háromnyelvű (magyar–román–angol)</option>
                        <option value="hu">Magyar</option>
                        <option value="ro">Română</option>
                        <option value="en">English</option>
                      </select>
                    </div>

                    {keltezesHelysegMezo}

                    {!persons[0] ? (
                      <p className="text-xs text-muted-foreground">
                        Válassz ki egy egyháztagot a fenti keresővel — az életút-adatok
                        (keresztelés, konfirmáció, házasság, gyermekek, elhalálozás, sírhely)
                        automatikusan betöltődnek az anyakönyvi nyilvántartásból.
                      </p>
                    ) : eletutLoading ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Életút-adatok
                        betöltése…
                      </p>
                    ) : eletutError ? (
                      <p className="flex items-start gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {eletutError}
                      </p>
                    ) : eletutAdat ? (
                      <>
                        {eletutHianyok.length > 0 ? (
                          <div className="space-y-2 rounded-xl border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
                            <p className="flex items-start gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                              {eletutHianyok.length} hiányzó adat — az igazolás így is kiállítható
                              (a hiányzó rovatok kitöltő-vonallal nyomtatódnak), de érdemes előbb
                              pótolni:
                            </p>
                            <ul className="max-h-44 space-y-1 overflow-y-auto pl-1 text-[11px] leading-snug text-amber-900/90 dark:text-amber-100/90">
                              {eletutHianyok.map((h) => (
                                <li key={h.mezoId}>
                                  <b>{h.cimke}</b> —{' '}
                                  <span className="opacity-80">{h.hovaVezesse}</span>
                                </li>
                              ))}
                            </ul>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => void handleTodoPrint()}
                              disabled={printing}
                            >
                              <ListChecks className="mr-1.5 size-4" aria-hidden />
                              TODO-lista nyomtatása
                            </Button>
                          </div>
                        ) : (
                          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                            Minden kötelező adat megvan az anyakönyvi nyilvántartásban.
                          </p>
                        )}

                        <div className="space-y-2.5">
                          <div className="space-y-1">
                            <label
                              htmlFor="eletut-kerelmezo"
                              className="text-sm font-medium text-foreground"
                            >
                              Kérelmező neve
                            </label>
                            <Input
                              id="eletut-kerelmezo"
                              value={eletutKerelmezo}
                              onChange={(e) => setEletutKerelmezo(e.target.value)}
                              placeholder="Üresen: „nevezett / jogosult hozzátartozója”"
                            />
                          </div>
                          <div className="space-y-1">
                            <label
                              htmlFor="eletut-cel"
                              className="text-sm font-medium text-foreground"
                            >
                              A kiállítás célja
                            </label>
                            <Input
                              id="eletut-cel"
                              value={eletutCel}
                              onChange={(e) => setEletutCel(e.target.value)}
                              placeholder={ELETUT_CEL_ALAPERTEK}
                            />
                          </div>
                          {eletutAdat.szemely.elhunyt && !eletutAdat.sirhely ? (
                            <div className="space-y-1">
                              <label
                                htmlFor="eletut-sirhely"
                                className="text-sm font-medium text-foreground"
                              >
                                Sírhely (kézzel)
                              </label>
                              <Input
                                id="eletut-sirhely"
                                value={eletutSirhely}
                                onChange={(e) => setEletutSirhely(e.target.value)}
                                placeholder="pl. Református temető, A parcella, 3. sor, 12. sírhely"
                              />
                              <p className="text-[11px] text-muted-foreground">
                                A Sírhelyek modulban nincs hozzárendelés — az itt megadott szöveg
                                kerül a nyomtatvány nyughely-rovatába.
                              </p>
                            </div>
                          ) : null}
                          <div className="space-y-1">
                            <label
                              htmlFor="eletut-fogondnok"
                              className="text-sm font-medium text-foreground"
                            >
                              Főgondnok neve (opcionális)
                            </label>
                            <Input
                              id="eletut-fogondnok"
                              value={eletutFogondnok}
                              onChange={(e) => setEletutFogondnok(e.target.value)}
                              placeholder="Üresen a vonal kézi aláírásra marad"
                            />
                          </div>
                        </div>
                      </>
                    ) : null}

                    {headerError ? (
                      <p className="flex items-start gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {headerError} — a nyomtatvány fejléc-adatai kitöltő-vonallal készülnek.
                      </p>
                    ) : null}
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {eletutNyelvMod === 'harom'
                        ? 'Az igazolás a hivatalos, háromnyelvű nyomtatványként készül (magyar levélfej + HU/RO/EN mezőfeliratok).'
                        : 'Az igazolás egynyelvű nyomtatványként készül — a levélfej és minden felirat a kiválasztott nyelven.'}{' '}
                      A dokumentum-nyelv és mező-beállítások itt nem érvényesek.
                    </p>
                  </section>
                )}

                {/* Iktatás */}
                <section className="space-y-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {numIktatas}. Kiállítás és iktatás
                  </h3>

                  <div className="space-y-1">
                    <label htmlFor="cert-subject" className="text-sm font-medium text-foreground">
                      Tárgy az iktatókönyvbe
                    </label>
                    <Input
                      id="cert-subject"
                      value={subject}
                      onChange={(e) => {
                        setSubject(e.target.value)
                        setSubjectTouched(true)
                      }}
                      disabled={issued}
                    />
                    {/* F8e (user 2.): a magyar iktatókönyv miatt ez a mező MAGYAR
                        marad; a dokumentumra a Tárgy a választott nyelven kerül. */}
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Az iktatókönyvbe <b>magyarul</b> kerül (a magyar nyelvű iktatókönyv miatt).
                      {selectedCsalad && docLang !== 'hu' ? (
                        <>
                          {' '}
                          A dokumentumon a Tárgy a választott nyelven jelenik meg:{' '}
                          <i>{dokumentumTargy}</i>.
                        </>
                      ) : null}
                    </p>
                  </div>

                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Kimenő iratként, a mai kelttel ({fmtDateHu(todayIso())}) kerül iktatásra
                    {ugykorKod ? <> — ügykör: {formatUgykorLabel(ugykorKod)}</> : null}.
                    {year !== issueYearNow ? (
                      <> Az iktatás mindig az aktuális ({issueYearNow}) évi iktatókönyvbe történik.</>
                    ) : null}
                  </p>

                  {issued ? (
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-start gap-2 rounded-xl border border-border bg-primary/10 p-3 text-sm text-foreground"
                    >
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span>
                        {issuedIratszam ? (
                          <>
                            Iktatva: <b>{issuedIratszam}</b> — az iratszám bekerült a dokumentumba.
                            Most nyomtasd ki vagy mentsd PDF-be az iktatott példányt.
                          </>
                        ) : (
                          <>
                            Az irat iktatva lett, de a kiosztott számot nem sikerült visszaolvasni —
                            ellenőrizd az iktatókönyvben, és írd be kézzel az „Iratszám” mezőbe.
                          </>
                        )}
                      </span>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    {!issued ? (
                      <Button
                        onClick={() => void handleIssue()}
                        disabled={issuing || loadingCtx}
                        className="w-full rounded-xl"
                      >
                        {issuing ? (
                          <>
                            <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
                            Iktatás folyamatban…
                          </>
                        ) : (
                          <>
                            <Stamp className="mr-1.5 size-4" aria-hidden />
                            Kiállítás és iktatás
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => void handlePrint()}
                          disabled={printing}
                        >
                          <Printer className="mr-1.5 size-4" aria-hidden />
                          Nyomtatás
                        </Button>
                        <Button
                          className="rounded-xl"
                          onClick={() => void handlePdf()}
                          disabled={printing}
                        >
                          <Download className="mr-1.5 size-4" aria-hidden />
                          PDF letöltése
                        </Button>
                      </div>
                    )}
                  </div>

                  {!issued ? (
                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
                        Az alábbi gombokkal iktatás NÉLKÜL nyomtathatsz — az irat így nem kerül az
                        iktatókönyvbe, és nem kap hivatalos iratszámot.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => void handlePrint()}
                          disabled={printing || loadingCtx || (eletutMode && !eletutIgazolasData)}
                        >
                          <Printer className="mr-1.5 size-4" aria-hidden />
                          Nyomtatás iktatás nélkül
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => void handlePdf()}
                          disabled={printing || loadingCtx || (eletutMode && !eletutIgazolasData)}
                        >
                          <Download className="mr-1.5 size-4" aria-hidden />
                          PDF iktatás nélkül
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </section>
              </>
            )}
          </div>

          {/* ── JOBB: élő A4 előnézet (fit-to-page) ─────────────── */}
          <div
            ref={previewPanelRef}
            tabIndex={-1}
            aria-label="Élő A4 előnézet"
            className={cn(
              'min-w-0 overflow-x-hidden p-4 outline-none sm:p-5 lg:block',
              mobileView === 'preview' ? 'block' : 'hidden',
            )}
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Élő előnézet (A4 álló)
            </p>
            {/* (1) SCROLL-HOST — ITT mérünk (F8e, kutatás 4. fejezet).
                Rugalmas magasság (max-h): a lap MINDIG teljes szélességében
                látszik, a hosszabb irat függőlegesen görgethető. A fix
                `overflow-y: scroll` + `scrollbar-gutter: stable` a
                scrollbar-oszcilláció (mérés ↔ görgetősáv oda-vissza) ellen —
                a mért szélesség így állandó. Vízszintes görgetés SOHA. */}
            <div
              ref={setPreviewHost}
              className="max-h-[68vh] min-h-[280px] overflow-y-scroll overflow-x-hidden rounded-2xl border border-border bg-muted p-3 lg:max-h-[78vh]"
              style={{ scrollbarGutter: 'stable' }}
            >
              {/* (2) FIT-WRAPPER — a transform NEM változtat layout-méretet,
                  ezért a wrapper méretét kézzel szorozzuk a skálával; a
                  centrálás is ITT történik (mx-auto). A max-w-full biztosíték
                  az első, még mérés előtti frame-re. */}
              <div
                className="mx-auto max-w-full overflow-hidden rounded-md border border-border bg-white shadow-sm"
                style={{ width: A4_W_PX * scale, height: contentH * scale }}
              >
                {/* (3) LAP — fix A4-szélesség, origin 0 0 (alapból center!). */}
                <iframe
                  ref={iframeRef}
                  onLoad={scheduleMeasure}
                  title="Dokumentum előnézet"
                  srcDoc={iframeHtml}
                  style={{
                    width: A4_W_PX,
                    height: contentH,
                    border: '0',
                    transform: `scale(${scale})`,
                    transformOrigin: '0 0',
                    background: '#fff',
                    display: 'block', // inline-baseline hézag ellen
                  }}
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Az előnézet a valódi A4-lapot mutatja kicsinyítve — a nyomtatás és a PDF
              ugyanezt a dokumentumot kapja, teljes méretben.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
