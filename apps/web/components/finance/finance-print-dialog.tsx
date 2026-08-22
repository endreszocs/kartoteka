'use client'

/**
 * Webes FinancePrintDialog wrapper.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.5): a vizuális réteg + state-management
 * átkerült a `@kartoteka/ui-app/finance` shared package-be
 * (`FinancePrintDialogBody`). A wrapper a Dialog shell-t (shadcn-radix),
 * a print-engine-t (`print-engine-v2.ts`), a server actiont
 * (`getChitantaTombokReport`), a sonner toast-ot és a HTML builder-t
 * (`buildFinancePrintDocument`) köti be a callback prop-okra.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  FinancePrintDialogBody,
  type FinancePrintFilters,
  type FinancePrintType,
  type FinancePrintTypeMeta,
  type SavedDocOption,
  type PrintReport,
  type DecontDocData,
  type DispozitieDocData,
  buildDecontHtml,
  buildDispozitieHtml,
  // 2026-08-15 (átvilágítás 15.): a borító iktató-/határozat-mezőinek KÖZÖS
  // leképezése — hogy a webes és a desktopos dialógus ne húzhasson szét.
  hivatalosHatarozatMezok,
} from '@kartoteka/ui-app'
import {
  buildFinancePrintDocument,
  FINANCE_PRINT_TYPES,
  type FinanceReportData,
} from '@/lib/finance/reporting'
import {
  buildBudgetPrintDocument,
  BUDGET_PRINT_TYPES,
  type BudgetPrintData,
  type BudgetPrintType,
} from '@/lib/finance/budget-reporting'
import { loadBudgetRowsCompat, type BudgetCompatRow } from '@/lib/finance/budget-compat'
// 2026-08-15 (egyházmegyei terv, 2.1): hatókör-tudatos évi beállítás-betöltő
// (a Költségvetés nyomtatási központ UGYANEZT hívja — közös helper).
// 2026-08-17 (kerületi S5): innen jön a hatókör KANONIKUS típusa és a nyomtatvány-ág
// nélküli szintek fail-closed kapuja is.
import {
  KIALLITO_NEVE_HIANYZIK_CIM,
  KIALLITO_NEVE_HIANYZIK_UZENET,
  NINCS_NYOMTATVANY_AG_CIM,
  NINCS_NYOMTATVANY_AG_UZENET,
  loadEvBeallitas,
  nyomtatvanyScope,
  type PrintScope,
} from '@/lib/finance/print-scope'
// 2026-08-11 (6. kör): a részszámadás IDŐSZAKI nyitó/záró levezetése — tiszta
// függvény, önellenőrzéssel (`npm run selftest:reszszamadas`).
import { computePeriodBalances, type PeriodRow } from '@kartoteka/core'
import { createClient } from '@/lib/supabase/client'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { getChitantaTombokReport } from '@/app/(dashboard)/penzugy/chitanta-tombok-actions'
import { getYearFinanceRecords } from '@/app/(dashboard)/penzugy/actions'
import { listDecontReprint } from '@/app/(dashboard)/penzugy/decont-actions'
import { listDispozitieReprint } from '@/app/(dashboard)/penzugy/dispozitie-actions'
import { toast } from 'sonner'
import type { BefitetesRow, KiadasRow, BankAccount, SzamadasiCel, BealitasRow } from '@/lib/constants/finance'

interface FinancePrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  income: BefitetesRow[]
  expense: KiadasRow[]
  bankAccounts: BankAccount[]
  cellek: SzamadasiCel[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  congregationName: string
  /** Hivatalos román gyülekezetnév (pl. „Parohia Reformată Brateș") a nyomtatványokhoz. */
  congregationNameRo?: string
  carryoverCash: number
  carryoverBank: number
  /** 2026-07-17 (F4): az idei rögzített bank-nyitók számlánként (Registru Banca). */
  bankNyitoMap?: Record<number, number>
  currentYear: number
  settings: BealitasRow
  /**
   * 2026-08-15 (egyházmegyei terv, 2.1): a nyomtatványok HATÓKÖRE. Megyei
   * hatókörben az évi beállítás a `diocese_bealitas`-ból, a terv-sorok a
   * `diocese_koltsegvetes`-ből jönnek, és a borító a megyei feliratokat kapja.
   *
   * 2026-08-17 (kerületi S5): a típus a KANONIKUS `PrintScope` (= `FinanceScope`),
   * tehát az EGYHÁZKERÜLETET is befogadja — kézi unió-másolat helyett.
   *
   * 2026-08-22 (kerületi S6): a kerületi érték RÉSZBEN nyomtat. A hivatalos
   * Költségvetés / Költségvetés-módosítás / Számadás kerületi ága kész és nyitva
   * van; a többi ív (Registru de casă/banca/jurnal, Csoportnapló,
   * nyugtatömb-kimutatás, Decont/Dispoziție újranyomtatás, Részszámadás) és a
   * NEM az oldal évére kért ívek fail-closed módon zárva maradnak — a pontos
   * miért (fájl:sor bizonyítékokkal) a `KERULETI_IVEK` konstansnál lentebb.
   */
  scope?: PrintScope
  /** Az egyházkerület neve a megyei borító felső blokkjához. */
  districtName?: string | null
}

/** 2026-07-10 (S5-#3): a Body opak yearRecords-ának webes alakja. */
type YearRecordsPayload = {
  income: BefitetesRow[]
  expense: KiadasRow[]
  carryoverCash: number
  carryoverBank: number
  bankNyitoMap?: Record<number, number>
  /** 2026-08-11 (6. kör): sikerült-e a nyitók feloldása (fail-closed kapu). */
  nyitoOk?: boolean
  nyitoBizonytalan?: boolean
  /**
   * 2026-08-15 (átvilágítás 13.): a KIVÁLASZTOTT év `bealitas` sora.
   * `null` = az évhez nincs beállítás-sor (sosem nyitották meg) — ez ISMERT
   * állapot, nem hiba: a nyomtatvány ilyenkor „nincs véglegesítve"-ként megy.
   */
  settings?: BealitasRow | null
  /**
   * `false` = a beállítás-sor lekérése HIBÁRA futott, tehát nem tudjuk, hogy az
   * adott év véglegesítve van-e és mik a tartozásai → fail-closed: a hivatalos
   * költségvetés/számadás nyomtatvány LETILTVA. Néma, rossz évből származó
   * záró blokk helyett inkább semmit.
   */
  settingsOk?: boolean
  /**
   * 2026-08-22 (kerületi S6): MIÉRT bukott a beállítás-sor (`settingsOk === false`).
   * A `loadEvBeallitas` eddig is megkülönböztette a hálózati hibát a hiányzó
   * nyomtatvány-ágtól, de az ok itt elveszett, és a felhasználó mindkettőre azt
   * a tanácsot kapta, hogy „ellenőrizd az internetkapcsolatot" — a másodiknál ez
   * félrevezető, mert soha nem sikerülne.
   */
  settingsHibaOk?: 'lekerdezes_hiba' | 'nincs_nyomtatvany_ag'
}

/** Bizonylat-típusok, amelyeknek NEM kellenek a bevétel/kiadás sorok
 *  (saját lazy-loaderük van vagy snapshot-ból nyomtatnak). */
const TYPES_WITHOUT_RECORDS = new Set<FinancePrintType>([
  'decont_reprint',
  'dispozitie_reprint',
  'nyugtatomb_kimutatas',
])

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-08-22 (KERÜLETI S6) — AMIT AZ EGYHÁZKERÜLET EBBŐL AZ ABLAKBÓL KIADHAT
 * ════════════════════════════════════════════════════════════════════════════
 * A kerületi SZÁMADÁS/KÖLTSÉGVETÉS ág elkészült (borító, nyilatkozat,
 * aláírás-blokk: budget-reporting.ts; terv-sorok: `district_koltsegvetes`; évi
 * beállítás: `district_bealitas`), ezért ezek a típusok NYITVA vannak.
 *
 * A LISTÁRÓL HIÁNYZÓ TÍPUSOK KERÜLETI HATÓKÖRBEN FAIL-CLOSED MARADNAK, mert a
 * láncuk egy IDEGEN fájlban szakad — és félig kész ív nem mehet ki:
 *
 *  · Registru de casă / banca / jurnal + Csoportnapló — az aláírás-sáv
 *    HARDKÓDOLTAN gyülekezeti tisztségeket nevez meg:
 *    packages/ui-app/src/finance/reporting.ts:401-403, :483-485, :662-664,
 *    :1118-1120 („Conducătorul unității — Lelkész/Gondnok", „Întocmit",
 *    „Verificat"). A `FinanceReportData`-nak nincs `printScope` mezője, tehát a
 *    szint nem is tud eljutni odáig. A püspöki hivatal kasszanaplóján a
 *    „Lelkész/Gondnok" aláírás-vonal valótlanság — és alá lehetne írni.
 *  · Nyugtatömb-kimutatás — ugyanez az aláírás-sáv (reporting.ts:845-853:
 *    Lelkipásztor / Gondnok / Pénztáros), RÁADÁSUL az adatforrás gyülekezeti:
 *    a `getChitantaTombokReport` (penzugy/chitanta-tombok-actions.ts:376-385)
 *    az `effectiveCongregationId`-ből dolgozik, nem a hatókörből.
 *  · Decont / Dispoziție újranyomtatás — a nyugtatömb-világ gyülekezeti iratai;
 *    a listázók maguk zárnak ki minden nem-gyülekezeti hatókört
 *    (decont-actions.ts:172, dispozitie-actions.ts:95/136/202 —
 *    `ctx.scope !== 'congregation'` → üres lista).
 *  · Részszámadás — az időszaki nyitó SZÁMLÁNKÉNTI feloldását a
 *    `getYearFinanceRecords` (penzugy/actions.ts:623) adná, az viszont
 *    gyülekezeti tábla-only (lásd a `KERULETI_MAS_EV_*` indoklását lentebb).
 *
 * ⚠️ NE „nyisd meg" őket a lista bővítésével, amíg a fenti négy pont nem
 *    javult. A kerületi Költségvetés/Számadás ettől függetlenül teljes értékű.
 */
const KERULETI_IVEK: ReadonlySet<FinancePrintType> = new Set<FinancePrintType>([
  'koltsegvetes',
  'koltsegvetes_modositas',
  'szamadas',
])

const KERULETI_TILTOTT_IV_CIM = 'Ez a nyomtatvány egyházkerületi szinten nem adható ki'

const KERULETI_TILTOTT_IV_UZENET =
  'Ez az ív a gyülekezeti könyvvezetéshez készült: az aláírás-sávja a lelkészt és a gondnokot ' +
  'nevezi meg, egyes adatai pedig a gyülekezeti nyugtatömb-nyilvántartásból jönnek. Egyházkerületi ' +
  'kiállítóval ezért csak látszatra volna helyes: a papír olyan tisztségeknek hagyna aláírás-vonalat, ' +
  'amelyek ezen a szinten nem léteznek. A kerület hivatalos Költségvetése és Számadása ' +
  'változatlanul kinyomtatható — az adatok rendben rögzülnek, ez a nyomtatvány készül még.'

const KERULETI_MAS_EV_CIM = 'Ehhez az évhez válts oldal-évet'

/**
 * MIÉRT (2026-08-22, kerületi S6 lánc-ellenőrzés): a nem az oldal évére kért
 * nyomtatványokhoz a közös Body a `getYearFinanceRecords` server actiontől kéri
 * a tételeket (penzugy/actions.ts:623) — az viszont NEM hatókör-tudatos: az
 * `access.effectiveCongregationId`-vel a GYÜLEKEZETI `befizetes`/`kiadas`
 * táblákat olvassa (:640 és az alatta lévő selectek). Kerületi hatókörben ez
 * kétféleképp végződik, és egyik sem elfogadható hivatalos íven:
 *   · profilváltós kerületi felhasználónál `effectiveCongregationId === null` →
 *     „Nincs aktív gyülekezet." → néma 0-ák (a meglévő `settingsOk` kapu ezt
 *     megfogja, de a régi szövege hálózati hibát emleget, ami félrevezető);
 *   · „örökölt" (profile_roles sor NÉLKÜLI) kerületi adminnál viszont
 *     `effectiveCongregationId` a SAJÁT gyülekezetéé (effective-access.ts:418-420,
 *     mert `activeProfileRole === null`) → a kerületi borító alá EGY GYÜLEKEZET
 *     tételei kerülnének. Ez a legrosszabb eset: hihető, aláírható, HAMIS ív.
 * A javítás IDEGEN fájlban volna (scope-aware `getYearFinanceRecords`), ezért
 * itt fail-closed kapu áll — és a felhasználó megkapja a MŰKÖDŐ utat: a
 * Pénzügy oldal fenti év-választója (`?year=`) az egész oldalt a `district_*`
 * táblákból tölti újra, onnan a nyomtatvány már helyes.
 */
const KERULETI_MAS_EV_UZENET =
  'Ebben az ablakban egyházkerületi szinten csak az oldal évének nyomtatványa készíthető el. ' +
  'A korábbi évek tételeit a rendszer egyelőre csak gyülekezeti szinten tudja visszatölteni, ' +
  'ezért más évet nem adunk ki innen — hibás számokkal készülne. Ami helyette MŰKÖDIK: fent, a ' +
  'Pénzügy oldal év-választójában válaszd ki a kívánt évet, és nyisd meg újra ezt az ablakot. ' +
  'Akkor a teljes oldal (és vele a nyomtatvány) az egyházkerület adott évi könyveiből dolgozik.'

function emptyPreview(message: string): PrintReport {
  return {
    html: `<!doctype html><html lang="hu"><head><meta charset="utf-8"><style>body{font-family:system-ui,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0;color:#94a3b8;font-size:14px;text-align:center;padding:24px}</style></head><body>${message}</body></html>`,
    title: 'Előnézet',
    filename: 'dokumentum.pdf',
    orientation: 'portrait',
  }
}

/** 2026-08-11 (6. kör): hangos, NYOMTATÁST TILTÓ előnézet (`blocked: true`). */
function blockedPreview(title: string, message: string): PrintReport {
  return {
    html: `<!doctype html><html lang="hu"><head><meta charset="utf-8"><style>
      body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:32px;color:#111;background:#fff}
      .box{max-width:620px;margin:8vh auto;border:2px solid #111;border-radius:10px;padding:24px}
      h1{font-size:17px;margin:0 0 10px}p{font-size:14px;line-height:1.65;margin:0 0 10px}
    </style></head><body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>`,
    title,
    filename: 'dokumentum.pdf',
    orientation: 'portrait',
    blocked: true,
  }
}

export function FinancePrintDialog({
  open,
  onOpenChange,
  income,
  expense,
  bankAccounts,
  cellek,
  bevCelMap,
  kiaCelMap,
  congregationName,
  congregationNameRo,
  carryoverCash,
  carryoverBank,
  bankNyitoMap,
  currentYear,
  settings,
  scope = 'congregation',
  districtName,
}: FinancePrintDialogProps) {
  // ⛔ A NYOMTATVÁNY-réteg által ISMERT hatókör. `null` = erre a szintre még
  // nincs ív → MINDEN nyomtatvány magyarázó, TILTÓ előnézetet ad. 2026-08-22
  // (kerületi S6): a három mai szint mind ismert, tehát ez az ág ma nem fut —
  // de MARAD: ez a negyedik szint fail-closed válasza. Enélkül egy új szint
  // adata gyülekezeti fejléccel menne papírra, aláírhatóan.
  const keszScope = nyomtatvanyScope(scope)

  // 2026-08-22 (kerületi S6): a kerületi ág CSAK a hivatalos költségvetés/
  // számadás ívekre nyílt meg — a többi típus és a más évek kapuja lentebb, a
  // `buildReport` elején (a MIÉRT a `KERULETI_IVEK` / `KERULETI_MAS_EV_UZENET`
  // konstansoknál, fájl:sor bizonyítékokkal).
  const keruleti = keszScope === 'district'

  // ⛔ A KIÁLLÍTÓ NEVE NÉLKÜL NINCS ÍV. A fejléc entitás-sora a
  // `congregationName`-ből épül (felső szinten a megye/kerület neve), amit a
  // szerver `initFinanceFelsoSzint`-je úgy old fel, hogy a lekérés HIBÁJÁT nem
  // nézi (`data?.name || ''`, penzugy/actions.ts) — hálózati hibánál némán üres
  // marad, és egy NÉVTELEN, mégis aláírható hivatalos ív menne ki.
  // ⚠️ Csak a most megnyíló kerületi ágra: a gyülekezeti és a megyei ív élesben
  //    fut, és byte-ra változatlan marad (a megyei néma üres-név út jelentve).
  //
  // ⚠️ A KAPU SZÁNDÉKOSAN ASZIMMETRIKUS: csak a MAGYAR nevet nézi, a románt
  //    (`congregationNameRo` → `districts.nev_ro`) NEM. Ez nem feledékenység:
  //     · a fejléc-építő (`hivatalosEntitasNev`, budget-reporting.ts:710-713)
  //       üres román névnél a magyart írja ki EGYEDÜL, sablon-kiegészítés nélkül
  //       — vagyis a papír HIÁNYOS lesz (a többi elem: cím, nyilatkozat,
  //       aláírás-sáv, lábléc kétnyelvű marad), de nem HAZUDIK: nem tesz a
  //       kiállító helyére kitalált vagy másik szintről vett román nevet;
  //     · magyar név nélkül viszont a fejléc entitás-sora TELJESEN üres — az
  //       aláírható, mégis névtelen ív a valódi kockázat, ezért csak ez tilt;
  //     · a román név opcionális mező (S2, kerületi identitás-varázsló), a
  //       magyar kötelező — egy tiltó kapu az opcionális mezőn a kerületet
  //       kizárná a saját hivatalos ívéből.
  //    A két ÉLŐ szint (gyülekezet, megye) ma pontosan így viselkedik, és a
  //    döntés az övék is. ⛔ NE „szimmetrizáld" ezt a következő körben: az
  //    hármas viselkedés-változás volna élő, aláírt iratokon.
  const nevHianyzik = keruleti && congregationName.trim().length === 0

  // 2026-08-11 (6. kör): a RÉSZSZÁMADÁS mostantól ITT érhető el. Eddig a
  // `.filter((t) => t.id !== 'reszszamadas')` kizárta abból az EGYETLEN
  // felületből, ahol a lelkész nyomtatványt keres — miközben a rendszer saját
  // negyedéves teendőlistája a nyomtatását írja elő.
  const budgetTypes: FinancePrintTypeMeta[] = BUDGET_PRINT_TYPES.map((t) => ({
    id: t.id as FinancePrintType,
    title: t.title,
    subtitle: t.subtitle,
    description: t.description,
  }))
  const printableTypes: FinancePrintTypeMeta[] = [
    ...FINANCE_PRINT_TYPES.filter((t) => t.id !== 'kiadasi_kiseroiv'),
    ...budgetTypes,
  ]

  // Csoportnapló jogcím-választó opciói: a számadási célok (belső mozgások nélkül),
  // kód szerint numerikusan rendezve.
  // 2026-07-10 (S3 #1e): a 3xx/4xx mellett a 100-as fejezet (legacy belső mozgás /
  // pénztármaradvány: 100, 100.01, 100.5x) is kimarad — a buildCsoportNaplo ezeket
  // belsőként kihagyja, így felkínálásuk MINDIG üres nyomtatványt adott volna.
  // ── 2026-08-15 (átvilágítás 13.): ÉV-SCOPE-OLT beállítás-lekérés ─────────
  //
  // MI VOLT A ROSSZ: a `settings` prop MINDIG az OLDAL évének `bealitas` sora,
  // az év-választó viszont 8 évet kínál. A tételek és a költségvetés-sorok
  // évhelyesen töltődtek újra, de a hivatalos záró blokk (`szamadas_tartozasok`)
  // és a véglegesítés-zászló az oldal évéből jött.
  // MI VOLT A KÖVETKEZMÉNYE: a 2026-on álló oldalról nyomtatott 2025-ös Számadás
  // 116–127. Datorii sorába a 2026-os tartozás került, és mivel a 134. sor
  // Záróegyenleg = 113 − 116 + 128, a 2025-ös ív VÉGSŐ egyenlege is ennyivel
  // tért el — aláírható, beküldhető papíron. A `bealitas` sor évenként külön
  // létezik (id = év), tehát a kiválasztott évre kell lekérni.
  // 2026-08-15 (egyházmegyei terv, 2.1): a betöltés HATÓKÖR-TUDATOS közös
  // helperrel megy (lib/finance/print-scope.ts) — megyei nézetben a
  // `diocese_bealitas` sorát hozza. Eddig itt a gyülekezeti tábla állt, és
  // megyei hatókörben (ahol az azonosító az egyházmegyéé) NÉMÁN üres maradt:
  // a megyei ív „nincs véglegesítve" felirattal ment ki a lezárt évekre is.
  // 2026-08-22 (kerületi S6): a `settings.congregation_id` felső szinten a SZINT
  // azonosítója (a közös `normalizeDioceseBealitas` ezt tölti a megye/kerület
  // UUID-jával), tehát a kerületi ág a `district_bealitas` helyes sorát kéri.
  // A hiba OKA is átmegy — a hívó ebből választ üzenetet.
  const loadYearSettings = async (
    year: number,
  ): Promise<{
    row: BealitasRow | null
    ok: boolean
    hibaOk?: 'lekerdezes_hiba' | 'nincs_nyomtatvany_ag'
  }> => {
    const supabase = createClient()
    return await loadEvBeallitas(supabase, scope, settings.congregation_id, year)
  }

  const categoryOptions = cellek
    .filter(
      (c) =>
        c.kod &&
        !/^[34]/.test(c.kod) &&
        c.kod !== '100' &&
        !c.kod.startsWith('100.') &&
        (c.type === 'B' || c.type === 'K'),
    )
    .map((c) => ({ kod: c.kod, nev: c.nev || c.kod, type: c.type as 'B' | 'K' }))
    .sort((a, b) => a.kod.localeCompare(b.kod, undefined, { numeric: true }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-full flex-col overflow-hidden p-0 sm:max-w-7xl">
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 pr-14">
          <DialogTitle>Pénzügyi nyomtatási központ</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <FinancePrintDialogBody
          open={open}
          printableTypes={printableTypes}
          bankAccounts={bankAccounts.map((b) => ({
            id: b.id,
            bank_neve: b.bank_neve,
            iban: b.iban,
          }))}
          categories={categoryOptions}
          currentYear={currentYear}
          buildReport={(filters: FinancePrintFilters): PrintReport => {
            // ⛔ Nyomtatvány-ág nélküli (jövőbeli) szint. A kapu a FÜGGVÉNY
            // ELEJÉN áll, tehát a bizonylat-újranyomtatásra (Decont,
            // Dispoziție) is érvényes. A `blocked: true` a nyomtató gombokat is
            // letiltja.
            if (keszScope === null) {
              return blockedPreview(NINCS_NYOMTATVANY_AG_CIM, NINCS_NYOMTATVANY_AG_UZENET)
            }

            // ⛔ 2026-08-22 (kerületi S6) — A KERÜLETI ÁG RÉSZLEGES NYITÁSA.
            // A sorrend nem cserélhető fel: előbb a TÍPUS (a részszámadásnak a
            // más-év üzenete félrevezető volna: nála az oldal-év váltása sem
            // segít), aztán a NÉV, végül az ÉV.
            if (keruleti && !KERULETI_IVEK.has(filters.printType)) {
              return blockedPreview(KERULETI_TILTOTT_IV_CIM, KERULETI_TILTOTT_IV_UZENET)
            }
            if (nevHianyzik) {
              return blockedPreview(KIALLITO_NEVE_HIANYZIK_CIM, KIALLITO_NEVE_HIANYZIK_UZENET)
            }
            // A `filters.yearRecords !== undefined` a közös Body SAJÁT jelzése
            // arról, hogy ehhez a nyomtatványhoz szerverről visszatöltött év-sorok
            // kellenek (`needsYearRecords`). SZÁNDÉKOSAN ezt nézzük, és nem
            // számoljuk újra az év-feltételt: egy második, széthúzó másolat a
            // projekt visszatérő hibaosztálya.
            //
            // ⛔ NE SZŰKÍTSD a kaput a `szamadas`-ra azzal, hogy „a Költségvetésnek
            //    úgysincs tény-oszlopa". Igaz, hogy a tény-oszlop csak a Számadásé,
            //    DE a Költségvetés/Költségvetés-módosítás ÍV 1–3. SORA (Disponibil
            //    din anul precedent / Casa / Banca) ugyanebből a payloadból jön:
            //    `carryoverCashUse`/`carryoverBankUse` → `printData.carryoverCash/
            //    carryoverBank` → collectBudgetRows(…, { openingRows: true })
            //    (budget-reporting.ts:478 és :497, a nyitóblokk :1131-1140).
            //    Kerületi hatókörben az `onLoadYearRecords` fail-closed csonkot ad
            //    vissza (0 / 0, lentebb a MIÉRT-tel), tehát a szűkítés egy olyan
            //    hivatalos ívet engedne ki, amelynek a nyitó egyenleg-sorai NÉMÁN
            //    nullák — pontosan az a hihető, aláírható, hamis papír, ami ellen
            //    az egész kapu készült. A `settingsOk === false` ág ma másodikként
            //    úgyis megfogná, de FÉLREVEZETŐ („ellenőrizd az internetkapcsolatot")
            //    szöveggel, a MŰKÖDŐ tanács (válts oldal-évet) helyett.
            //    A valódi feloldás IDEGEN fájlban van: hatókör-tudatos
            //    `getYearFinanceRecords` (penzugy/actions.ts:623) — amíg az nincs
            //    meg, ez a kapu marad, és tudatosan SZIGORÚBB, mint a Költségvetés
            //    nyomtatási központé (az a régi évre is kiadja az ívet, de az
            //    OLDAL évének nyitóival — ez a két ablak ma is meglévő, minden
            //    szintre igaz eltérése, jelentve, itt nem javítva).
            if (keruleti && filters.yearRecords !== undefined) {
              return blockedPreview(KERULETI_MAS_EV_CIM, KERULETI_MAS_EV_UZENET)
            }

            // 2026-07-10 (S5-#3): a bevétel/kiadás sorok a KIVÁLASZTOTT évhez.
            // Az oldal évén a props-beli (memóriában lévő) sorokat használjuk;
            // más évnél a Body által betöltött yearRecords-ot — amíg az töltődik,
            // "Betöltés…" előnézetet adunk (mint a budgetRows-nál).
            // 2026-08-11 (6. kör): a Body `undefined`-et ad, ha a props-beli
            // (oldal-évi) sorok elegendők, és `null`-t, amíg tölt. A
            // részszámadás a FOLYÓ évben IS a szerverről kéri a sorokat — csak
            // ott van SZÁMLÁNKÉNTI feloldott nyitó és `nyitoOk`.
            const wantsYearRecords = filters.yearRecords !== undefined
            if (
              wantsYearRecords &&
              filters.yearRecords == null &&
              !TYPES_WITHOUT_RECORDS.has(filters.printType)
            ) {
              return emptyPreview(`A(z) ${filters.selectedYear}. évi tételek betöltése…`)
            }
            const yr = wantsYearRecords ? (filters.yearRecords as YearRecordsPayload | null) : null
            const incomeUse = yr ? yr.income : income
            const expenseUse = yr ? yr.expense : expense
            const carryoverCashUse = yr ? yr.carryoverCash : carryoverCash
            const carryoverBankUse = yr ? yr.carryoverBank : carryoverBank
            const bankNyitoMapUse = yr ? yr.bankNyitoMap : bankNyitoMap
            // 2026-08-15 (átvilágítás 13.): a beállítás-sor is a KIVÁLASZTOTT évé.
            // Ha `yr` van, az oldal évétől eltérő (vagy részszámadás-) évet nézünk,
            // ilyenkor a props-beli `settings` MÁS év sora lenne.
            // KIVÉTEL: ha az újratöltött év MAGA az oldal éve (részszámadás), a
            // props-beli sor a mérvadó — azt a szerver oldotta fel, egyházmegyei
            // nézetben például a `diocese_bealitas` táblából, ahol a lenti
            // `bealitas`-lekérés természetesen nem talál semmit.
            const settingsUse: BealitasRow | null = yr
              ? (yr.settings ?? (filters.selectedYear === currentYear ? settings : null))
              : settings
            const settingsOk = yr ? yr.settingsOk !== false : true

            // Korábbi bizonylatok újranyomtatása (a snapshot adatból)
            if (filters.printType === 'decont_reprint') {
              const doc = filters.selectedDoc
              if (!doc) return emptyPreview('Válassz egy korábbi elszámolást a bal oldalon.')
              const data = doc.data as Omit<DecontDocData, 'congregationName'>
              return {
                html: buildDecontHtml({ congregationName, ...data }),
                title: `Decont #${data.sorszam}`,
                filename: `Decont_${data.sorszam}_${data.date}.pdf`,
                orientation: 'portrait',
              }
            }
            if (filters.printType === 'dispozitie_reprint') {
              const doc = filters.selectedDoc
              if (!doc) return emptyPreview('Válassz egy korábbi rendelvényt a bal oldalon.')
              const data = doc.data as Omit<DispozitieDocData, 'congregationName'>
              return {
                html: buildDispozitieHtml({ congregationName, congregationNameRo, ...data }),
                title: `Dispoziție #${data.sorszam}`,
                filename: `Dispozitie_${data.tipus}_${data.sorszam}_${data.date}.pdf`,
                orientation: 'portrait',
              }
            }

            // Költségvetés / költségvetés-módosítás / számadás / részszámadás
            if (
              filters.printType === 'koltsegvetes' ||
              filters.printType === 'koltsegvetes_modositas' ||
              filters.printType === 'szamadas' ||
              filters.printType === 'reszszamadas'
            ) {
              if (!filters.budgetRows) return emptyPreview('Költségvetési adatok betöltése…')
              const isReszszamadas = filters.printType === 'reszszamadas'
              const isSzamadas = filters.printType === 'szamadas'

              // 2026-08-15 (átvilágítás 13.): FAIL-CLOSED kapu. Ha a kiválasztott
              // év beállítás-sorát nem sikerült lekérni, nem tudjuk, véglegesítve
              // van-e, mi a presbitériumi határozata és mik a tartozásai. A
              // hivatalos ívet ilyenkor NEM adjuk ki: a hiányzó adat helyére az
              // OLDAL évének adata kerülne — pontosan az a hamis papír, ami ellen
              // ez a javítás készült. (A részszámadás nem hivatalos zárszámadás,
              // és a záró blokkot sem használja — annak saját kapui vannak.)
              if (!isReszszamadas && !settingsOk) {
                // 2026-08-22 (kerületi S6): a MIÉRT szerint MÁS a szöveg. A
                // `'nincs_nyomtatvany_ag'` nem múlik el magától (nincs ilyen
                // szintű ív), ezért ott az „próbáld újra" tanács félrevezető —
                // eddig mindkét ok ugyanezt a hálózati szöveget kapta.
                if (yr?.settingsHibaOk === 'nincs_nyomtatvany_ag') {
                  return blockedPreview(NINCS_NYOMTATVANY_AG_CIM, NINCS_NYOMTATVANY_AG_UZENET)
                }
                return blockedPreview(
                  'Ez a nyomtatvány most nem készíthető el',
                  `A(z) ${filters.selectedYear}. évi pénzügyi beállítások (véglegesítés, presbitériumi határozat, tartozások) nem tölthetők be, ezért a nyomtatvány hibás adatokkal készülne. Ellenőrizd az internetkapcsolatot, és próbáld újra. Ha újra ezt írja, jelezd a rendszergazdának.`,
                )
              }

              // 2026-08-11 (6. kör): a részszámadás tény-oszlopa CSAK az
              // időszaki tételeket összegzi. A nyitó/záró NEM ebből jön —
              // azt a `computePeriodBalances` vezeti le a pénzmozgásból.
              const periodFrom = filters.periodFrom
              const periodTo = filters.periodTo
              const inPeriod = (datum: string | null | undefined): boolean => {
                if (!isReszszamadas) return true
                if (!datum || !periodFrom || !periodTo) return false
                const d = datum.slice(0, 10)
                return d >= periodFrom && d <= periodTo
              }

              const actualIncome: Record<string, number> = {}
              const actualExpense: Record<string, number> = {}
              // 2026-07-10 (S3 audit KRITIKUS #1): stornózott tétel a hivatalos
              // költségvetés/számadás nyomtatvány tényadatába sem számít.
              // 2026-08-11 (K5-#6): a tény-oszlop a NYERS deviza-összeget (`osszeg`)
              // adta össze, miközben a Registru Casa/Banca/Jurnal a RON-ekvivalenst
              // (`osszeg_ron`) használja (reporting.ts `ronOf`, helpers.ts
              // calculateBalances). Devizás banki tételnél (pl. 1000 EUR = 4970 lej)
              // a Számadás 1000 lejt, a Registru 4970 lejt írt — két hivatalos,
              // ALÁÍRT papír ugyanarra az évre, egymásnak ellentmondó összeggel.
              // A könyvelés RON-ban folyik, ezért mindenhol `osszeg_ron ?? osszeg`.
              for (const r of incomeUse) {
                if (r.deleted || r.stornozott) continue
                if (!inPeriod(r.datum)) continue
                const code = r.id_befizetescel ? bevCelMap[r.id_befizetescel] : undefined
                if (code) actualIncome[code] = (actualIncome[code] || 0) + (Number(r.osszeg_ron ?? r.osszeg) || 0)
              }
              for (const r of expenseUse) {
                if (r.deleted || r.stornozott) continue
                if (!inPeriod(r.datum)) continue
                const code = r.id_kiadascel ? kiaCelMap[r.id_kiadascel] : undefined
                if (code) actualExpense[code] = (actualExpense[code] || 0) + (Number(r.osszeg_ron ?? r.osszeg) || 0)
              }

              const printData: BudgetPrintData = {
                cellek,
                budgetRows: filters.budgetRows as Record<string, BudgetCompatRow>,
                actualIncome,
                actualExpense,
                congregationName,
                congregationNameRo,
                // 2026-08-15 (terv 2.1/3): a borító feliratai a KIÁLLÍTÓ
                // szintjét követik (megyei íven kerületi blokk + közgyűlés).
                printScope: keszScope,
                districtName,
                year: filters.selectedYear,
                carryoverCash: carryoverCashUse,
                carryoverBank: carryoverBankUse,
                finalized: isSzamadas
                  ? !!settingsUse?.accounting_finalized
                  : !!settingsUse?.budget_finalized,
                // 2026-08-15 (átvilágítás 15.): a presbitériumi határozat és az
                // egyházközségi iktatószám. Eddig CSAK a `finalized` zászló ment
                // át, ezért a véglegesített ív borítóján a határozat-sor üresen
                // maradt — és mivel az „ez még nincs véglegesítve" magyarázat is
                // eltűnt, a lelkész észre sem vette, hogy hiányos papírt ad be.
                ...hivatalosHatarozatMezok(settingsUse, isSzamadas ? 'szamadas' : 'koltsegvetes'),
              }

              // ── 2026-08-14 (K2): a hivatalos 113–134. záró blokk adatai ──
              if (isSzamadas && !isReszszamadas) {
                // Tartozások/Kintlévőségek a bealitas.szamadas_tartozasok-ból
                // (a Könyvelés fül rögzítője írja). Kulcs: hivatalos Nr. rând.
                const toNumMap = (m?: Record<string, number>): Record<number, number> => {
                  const ki: Record<number, number> = {}
                  for (const [nr, v] of Object.entries(m || {})) {
                    const n = Number(nr)
                    if (Number.isFinite(n)) ki[n] = Number(v) || 0
                  }
                  return ki
                }
                // 2026-08-15 (átvilágítás 13.): a KIVÁLASZTOTT év sorából.
                const stored = settingsUse?.szamadas_tartozasok
                printData.tartozasok = toNumMap(stored?.tartozasok ?? undefined)
                printData.kintlevosegek = toNumMap(stored?.kintlevosegek ?? undefined)

                // Év végi Casa/Banca (114–115. sor): ugyanazzal a levezetéssel,
                // mint a részszámadás, csak a teljes évre. Ha a levezetés
                // hibázik, a mezők üresen maradnak → a papíron „—" áll (őszinte
                // fallback), az ÉVES Számadást nem blokkoljuk miatta.
                const evesBalances = computePeriodBalances({
                  income: incomeUse as unknown as PeriodRow[],
                  expense: expenseUse as unknown as PeriodRow[],
                  year: filters.selectedYear,
                  periodFrom: `${filters.selectedYear}-01-01`,
                  periodTo: `${filters.selectedYear}-12-31`,
                  yearOpeningCash: carryoverCashUse,
                  yearOpeningBankById: bankNyitoMapUse || {},
                  actualIncomeByCode: actualIncome,
                  actualExpenseByCode: actualExpense,
                })
                if (!('error' in evesBalances)) {
                  printData.zaroCasa = evesBalances.cash.closing
                  printData.zaroBanca = evesBalances.bank.closing
                }
              }

              // ── RÉSZSZÁMADÁS: időszaki nyitó/záró levezetés + fail-closed ──
              if (isReszszamadas) {
                // A nyitók feloldása HANGOSAN bukik: a részszámadás MINDEN
                // száma a nyitóra épül, néma 0-bázisból hamis papír lenne.
                if (yr && yr.nyitoOk === false) {
                  return blockedPreview(
                    'A részszámadás most nem nyomtatható',
                    'A nyitó egyenlegek feloldása nem sikerült, így az időszak nyitó és záró egyenlege nem vezethető le. Nyisd meg a Pénzügy → Bank / Kassza fület, ellenőrizd a nyitó egyenlegeket, majd próbáld újra.',
                  )
                }
                if (!periodFrom || !periodTo) {
                  return blockedPreview(
                    'A részszámadás most nem nyomtatható',
                    'Add meg az időszak kezdő és záró dátumát a bal oldalon.',
                  )
                }
                const balances = computePeriodBalances({
                  income: incomeUse as unknown as PeriodRow[],
                  expense: expenseUse as unknown as PeriodRow[],
                  year: filters.selectedYear,
                  periodFrom,
                  periodTo,
                  yearOpeningCash: carryoverCashUse,
                  // SZÁMLÁNKÉNTI nyitó. SOHA nem az aggregát `carryoverBank`
                  // egyetlen számlára — az egy MÁSIK számla nyitóját írná oda.
                  yearOpeningBankById: bankNyitoMapUse || {},
                  actualIncomeByCode: actualIncome,
                  actualExpenseByCode: actualExpense,
                })
                if ('error' in balances) {
                  return blockedPreview('A részszámadás most nem nyomtatható', balances.error)
                }
                // Devizás számla az időszakban → RON-ekvivalens lábjegyzet.
                const fxIds = new Set<number>()
                for (const r of [...incomeUse, ...expenseUse]) {
                  if (r.deleted || r.stornozott) continue
                  if (!inPeriod(r.datum)) continue
                  if (r.bankszamla_id != null && r.osszeg_ron != null && Number(r.osszeg_ron) !== Number(r.osszeg)) {
                    fxIds.add(r.bankszamla_id)
                  }
                }
                printData.periodFrom = periodFrom
                printData.periodTo = periodTo
                printData.periodBalances = balances
                printData.partial = true
                printData.nyitoBizonytalan = yr?.nyitoBizonytalan === true
                printData.keszult = new Date().toISOString().slice(0, 10)
                printData.devizaSzamlak = [...fxIds].map(
                  (id) => bankAccounts.find((b) => b.id === id)?.bank_neve || `#${id}`,
                )
              }

              return buildBudgetPrintDocument(filters.printType as BudgetPrintType, printData)
            }

            const reportData: FinanceReportData = {
              income: incomeUse,
              expense: expenseUse,
              bankAccounts,
              cellek,
              bevCelMap,
              kiaCelMap,
              congregationName,
              congregationNameRo,
              carryoverCash: carryoverCashUse,
              carryoverBank: carryoverBankUse,
              bankNyitoMap: bankNyitoMapUse,
              nyugtatombok:
                filters.printType === 'nyugtatomb_kimutatas'
                  ? filters.nyugtatombok
                  : undefined,
            }
            return buildFinancePrintDocument(filters.printType, reportData, {
              year: filters.selectedYear,
              month: filters.selectedMonth,
              bankAccountId: filters.selectedBankId,
              categoryKod: filters.selectedCategoryKod,
            })
          }}
          onLoadYearRecords={async (year): Promise<unknown> => {
            // ⛔ 2026-08-22 (kerületi S6): kerületi hatókörben EL SEM INDÍTJUK a
            // lekérést. A `getYearFinanceRecords` (penzugy/actions.ts:623) az
            // `effectiveCongregationId`-vel a GYÜLEKEZETI táblákat olvassa, és
            // egy „örökölt" (profile_roles sor nélküli) kerületi adminnál ez a
            // saját gyülekezete tételeit hozná vissza — a `buildReport` úgyis
            // tiltó előnézetet ad rá, de a HATÓKÖRÖN KÍVÜLI OLVASÁS akkor sem
            // történhet meg. Fail-closed payload, hangos toast nélkül: a
            // magyarázatot az előnézet adja (`KERULETI_MAS_EV_UZENET`).
            if (keruleti) {
              return {
                income: [],
                expense: [],
                carryoverCash: 0,
                carryoverBank: 0,
                nyitoOk: false,
                settings: null,
                settingsOk: false,
              } satisfies YearRecordsPayload
            }
            // 2026-07-10 (S5-#3): a kiválasztott év sorai + nyitói a szerverről.
            // 2026-08-15 (átvilágítás 13.): a tételek MELLÉ az adott év
            // `bealitas` sora is — abból jön a véglegesítés-zászló, a
            // presbitériumi határozat és a hivatalos záró blokk (tartozások).
            const [res, evSettings] = await Promise.all([
              getYearFinanceRecords(year),
              loadYearSettings(year),
            ])
            if (res.error || !res.income || !res.expense) {
              toast.error(`A(z) ${year}. évi tételek betöltése sikertelen${res.error ? `: ${res.error}` : '.'}`)
              // 2026-08-11 (6. kör): `nyitoOk: false` → a részszámadás LETILTVA.
              // Üres tétel-listából némán „0 lej mindenütt" papír készülne.
              // 2026-08-15: ugyanezért `settingsOk: false` — ha az év tételei nem
              // jöttek meg, a hivatalos költségvetés/számadás ív sem adható ki.
              return {
                income: [],
                expense: [],
                carryoverCash: 0,
                carryoverBank: 0,
                nyitoOk: false,
                settings: null,
                settingsOk: false,
                // A tétel-lekérés bukott el (nem a beállítás-sor betöltője), ez
                // hálózat/jogosultság jellegű — az újrapróbálás értelmes tanács.
                settingsHibaOk: 'lekerdezes_hiba',
              } satisfies YearRecordsPayload
            }
            return {
              income: res.income,
              expense: res.expense,
              carryoverCash: res.carryoverCash ?? 0,
              carryoverBank: res.carryoverBank ?? 0,
              bankNyitoMap: res.bankNyitoMap,
              nyitoOk: res.nyitoOk,
              nyitoBizonytalan: res.nyitoBizonytalan,
              settings: evSettings.row,
              settingsOk: evSettings.ok,
              settingsHibaOk: evSettings.hibaOk,
            } satisfies YearRecordsPayload
          }}
          onLoadNyugtatombok={async (year) => {
            // ⛔ 2026-08-22 (kerületi S6): kerületi hatókörben EL SEM INDÍTJUK.
            // A `getChitantaTombokReport` (chitanta-tombok-actions.ts:376-385)
            // nem a hatókörből, hanem az `effectiveCongregationId`-ből dolgozik:
            // egy „örökölt" kerületi adminnál EGY GYÜLEKEZET nyugtatömbjeit
            // hozná vissza, és a bal oldali lista ki is írná őket a kerület
            // nevével a fejlécben. A nyomtatványt a `buildReport` amúgy is
            // tiltja — de a hatókörön kívüli OLVASÁS sem történhet meg.
            // (A Decont/Dispoziție listázó nem kap ilyen kaput: azok maguk
            // zárnak ki minden nem-gyülekezeti hatókört, üres listával.)
            if (keruleti) return { data: undefined, error: null }
            const res = await getChitantaTombokReport(year)
            return {
              data: 'data' in res ? res.data : undefined,
              error: 'error' in res ? (res.error ?? null) : null,
            }
          }}
          onLoadSavedDocs={async (year): Promise<SavedDocOption[]> => {
            const [deconts, dispozitiok] = await Promise.all([
              listDecontReprint(year).catch(() => []),
              listDispozitieReprint(year).catch(() => []),
            ])
            return [
              ...deconts.map((d) => ({ id: d.id, label: d.label, kind: 'decont' as const, data: d.data })),
              ...dispozitiok.map((d) => ({ id: d.id, label: d.label, kind: 'dispozitie' as const, data: d.data })),
            ]
          }}
          onLoadBudgetRows={async (year): Promise<Record<string, unknown>> => {
            // Nyomtatvány-ág nélküli (jövőbeli) szinten nincs mit betölteni: a
            // `loadBudgetRowsCompat` a ma ismert három szint tábláit ismeri,
            // egy negyedik szintnél a gyülekezeti táblában keresné az
            // azonosítót (0 sor). A `buildReport` amúgy is tiltó előnézetet ad —
            // ez csak a fölösleges lekérés megspórolása, azonos eredménnyel.
            // 2026-08-22 (kerületi S6): a KERÜLET viszont IDE már beér — a
            // `keszScope === 'district'` a `district_koltsegvetes` táblára megy
            // (budget-compat.ts `felsoSzintTerv()`), tehát a kerületi
            // Költségvetés/Számadás terv-oszlopa valódi adatot kap.
            if (keszScope === null) return {}
            try {
              const supabase = createClient()
              // Hatókör-tudatos: megyei nézetben a `diocese_koltsegvetes`
              // tábla — enélkül a megyei ív minden terv-sora nulla lett volna.
              const rows = await loadBudgetRowsCompat(supabase, year, settings.congregation_id, keszScope)
              const map: Record<string, unknown> = {}
              rows.forEach((r) => {
                map[r.szamadasicelid] = {
                  szamadasicelid: r.szamadasicelid,
                  tervezett: r.tervezett,
                  modositott: r.modositott,
                  mod2: r.mod2,
                  mod3: r.mod3,
                }
              })
              return map
            } catch {
              return {}
            }
          }}
          loadingLogoSrc="/kartoteka-icon.png"
          onPrintToBrowser={(html) => printToBrowser(html)}
          onPrintToPdf={(html, filename, options) =>
            printToPdf(html, filename, {
              orientation: options?.orientation,
              margin: options?.margin,
              format: options?.format,
            })
          }
          onToast={(msg, kind) => {
            if (kind === 'error') toast.error(msg)
            else if (kind === 'success') toast.success(msg)
            else if (kind === 'warning') toast.warning(msg)
            else toast(msg)
          }}
          onClose={() => onOpenChange(false)}
        />
        </div>
      </DialogContent>
    </Dialog>
  )
}
