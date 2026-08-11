/**
 * IRÁNYÍTÓPULT — a gyülekezet TÉNYLEGES pénzkészlete (2026-08-11, 6. kör).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MI VOLT A HIBA (a lelkész bejelentése: „−25 665,24 RON, de az nem helyes")
 *
 * Az alsó statisztika-sáv „Egyenleg" csempéje ezt számolta:
 *
 *     Σ befizetés.osszeg − Σ kiadas.osszeg   a 24 HÓNAPOS GRAFIKON-ablakból
 *
 * vagyis egy 24 havi NETTÓ FORGALMAT, „Egyenleg" felirattal. Négy külön hiba
 * ült egymáson:
 *
 *   1. NEM volt benne a NYITÓ egyenleg (kassza + bank) — messze a legnagyobb
 *      tétel. Enélkül a csempe akkor is mély mínuszt mutat, ha a gyülekezet
 *      pénztárában és bankszámláin bőven van pénz.
 *   2. A `kiadas` lekérdezés nem szűrt a `stornozott`-ra (a `befizetes` igen),
 *      így egy ÉRVÉNYTELENÍTETT kiadás is csökkentette a számot — minden más
 *      hivatalos kimutatásból viszont ki van zárva.
 *   3. A nyers `osszeg` összegződött a RON-ekvivalens (`osszeg_ron`) helyett:
 *      egy 1000 EUR-s banki tétel 1000 lejnek látszott.
 *   4. Az ablak kezdete a GRAFIKONHOZ igazodott (kb. 24 hónap), ezért a szám
 *      jelentése hónapról hónapra csúszott — ugyanaz a csempe februárban mást
 *      mért, mint márciusban.
 *
 * A 3. pont mellett a belső mozgás (kassza→bank letét) is bent volt. Az
 * ÖSSZEGBEN az kiejtette magát (+50 000 bevétel és −50 000 kiadás), tehát a
 * csempét önmagában nem torzította — a KPI-kártyák külön „Bevétel"/„Kiadás"
 * számát viszont igen. Lásd a `page.tsx` FOLYAM-nézetét.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIÉRT NINCS EBBEN A FÁJLBAN EGYETLEN PÉNZÜGYI ÖSSZEADÁS SEM
 *
 * Ez ADAPTER, nem ötödik egyenleg-implementáció. A repó legmakacsabb
 * hibaosztálya, hogy ugyanaz a pénzügyi szabály több helyen él, és a helyek
 * idővel széthúznak. Ezért:
 *
 *   · a SZÁMOT a kanonikus `computePeriodBalances`
 *     (packages/core/src/finance/reszszamadas/period-balances.ts) adja —
 *     ugyanaz a tiszta függvény, amit a részszámadás-nyomtatvány használ, és
 *     amit a `scripts/selftest-reszszamadas.mjs` bizonyítottan az éves
 *     Számadással egyező eredményre hoz;
 *   · a NYITÓT a kanonikus `resolveNyitoEgyenlegekUseCase`
 *     (packages/core/src/finance/bank-import/resolve-nyito.ts) oldja fel —
 *     ugyanaz, amiből a Pénzügy modul `carryoverCash` / `carryoverBank`
 *     értéke származik.
 *
 * Itt csak bekötés, hibafordítás és a csempe-állapot előállítása történik.
 *
 * MIÉRT NEM a `calculateBalances` (packages/ui-app/src/finance/helpers.ts)
 *   Az a képernyő-oldali kanonikus helper, és az EGYENLEG-ága szemantikailag
 *   azonos ezzel. Két dolog miatt nem az lett a választás:
 *     · teljes `BefitetesRow`/`KiadasRow` sorokat vár — az irányítópultnak
 *       ~30 oszlopot kellene lehúznia a 6 helyett, a legtöbbet látogatott
 *       útvonalon;
 *     · a belső-mozgás CÉL-ID halmazokat (`internalCelIds`) kizárólag a
 *       `totalIncome`/`totalExpense` mezőkhöz kéri, amiket a csempe nem
 *       használ — cserébe két további tábla (`befizetescel`, `kiadascel`)
 *       lekérdezését igényelné.
 *   A `computePeriodBalances` ezzel szemben pontosan a szükséges 4 mezőt
 *   kéri, és számlánként (kassza / bankszámlánként) bontva adja vissza.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A DEFINÍCIÓ, AMIT A CSEMPE FELIRATA IS KIMOND
 *
 *   PÉNZKÉSZLET MA  =  az idei év NYITÓ egyenlege (kassza + minden bankszámla)
 *                      + a január 1. és a MAI NAP KÖZÖTT (mindkét vég
 *                        beleértve) könyvelt, nem stornózott, nem törölt
 *                        tételek nettó hatása, RON-ekvivalensben.
 *
 * Nem az év végi záró: a lelkész azt kérdezte, MENNYI PÉNZ VAN MOST. Egy
 * jövőre dátumozott tétel még nem mozgatott pénzt, ezért a mai összegbe nem
 * tartozik. Ha mégis van ilyen tétel, a csempe KIÍRJA — különben a Pénzügy
 * modul (ami az egész évet mutatja) és az irányítópult eltérése megint néma
 * rejtély lenne.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FAIL-CLOSED
 *
 * Ha a nyitó nem oldható fel, a csempe NEM mutat hihetőnek látszó számot.
 * Egy néma, hibás szám pontosan ez a bejelentett hiba volt. Két eset:
 *   · a nyitó-lekérdezés hibázott               → „Nem számolható";
 *   · nincs SEHOL rögzített kassza-nyitó sor    → „Nyitó egyenleg hiányzik".
 * A második azért kemény szabály, mert a `resolveNyitoForYear` ilyenkor
 * DOKUMENTÁLTAN 0-ról indul („a rendszer-indulás előtti állapot ismeretlen").
 * A 0-bázis + idei forgalom pontosan a régi, hibás számot adná vissza, csak
 * rövidebb ablakon. Kassza minden gyülekezetnek van, tehát a hiánya nem
 * életszerű állapot, hanem beállítási hiány — azt kell megmutatni.
 * (Bankszámlánként a hiányzó nyitó ELFOGADHATÓ: év közben nyitott számlánál a
 * 0 a helyes érték — ezt a `period-balances.ts` külön kimondja.)
 */

// 2026-08-11 (6. kör, perf): MÉLY import, NEM a `@kartoteka/core` barrel.
// A barrel a `./finance/bank-import` indexén át statikusan behúzza a `bcr.ts`-t,
// az pedig az `xlsx` csomagot (`import * as XLSX from 'xlsx'`). Az irányítópult
// a legtöbbet látogatott útvonal, és ebben a körben pont a felesleges terhet
// vágtuk le róla — egy bank-export parser semmit nem keres a modul-gráfjában.
// A két hivatkozott forrásfájlnak NULLA futásidejű importja van (a
// `period-balances.ts`-nek kimondottan, a `resolve-nyito.ts` csak `import
// type`-ot használ), tehát ez a bekötés semmit nem húz magával.
// (Minta: `apps/web/lib/utils/member-helpers.ts` → `@kartoteka/ui-app/src/...`.)
import {
  computePeriodBalances,
  type PeriodRow,
} from '@kartoteka/core/src/finance/reszszamadas/period-balances'
import type { ResolveNyitoResult } from '@kartoteka/core/src/finance/bank-import/resolve-nyito'

/** A csempéhez szükséges MINIMÁLIS sor-alak (a `PeriodRow` szerkezeti része). */
export type BalanceLedgerRow = PeriodRow

export interface CongregationBalanceOk {
  ok: true
  /** Kassza + MINDEN bankszámla, RON, az `asOf` napjának végén. */
  total: number
  /** Csak a kassza (készpénz). */
  cash: number
  /** Az összes bankszámla együtt. */
  bank: number
  /** A nap, amire a szám vonatkozik ('ÉÉÉÉ-HH-NN'). */
  asOf: string
  /** A költségvetési év, amelynek nyitójából a levezetés indult. */
  year: number
  /**
   * Ugyanez az év UTOLSÓ napjára — ennyit mutat a Pénzügy modul kassza+bank
   * egyenlege ugyanerre az évre. Jövőbeli dátumú tétel nélkül egyenlő a
   * `total`-lal.
   */
  yearEndTotal: number
  /** Hány MA UTÁNI dátumú, idei tétel van könyvelve (0 = a két szám azonos). */
  futureDatedCount: number
}

export interface CongregationBalanceErr {
  ok: false
  /** Rövid felirat a csempe szám-helyén (max ~2 szó). */
  short: string
  /** Teljes, cselekvésre mutató magyar magyarázat. */
  detail: string
}

export type CongregationBalance = CongregationBalanceOk | CongregationBalanceErr

export interface DeriveCongregationBalanceInput {
  /** A `resolveNyitoEgyenlegekUseCase` nyers eredménye. */
  nyito: ResolveNyitoResult
  /** Befizetés-sorok. TARTALMAZHAT az évet megelőző sorokat is — kiesnek. */
  income: BalanceLedgerRow[]
  /** Kiadás-sorok, ugyanezzel a szabállyal. */
  expense: BalanceLedgerRow[]
  /** A költségvetési év (= az `asOf` éve). */
  year: number
  /** A mai nap 'ÉÉÉÉ-HH-NN' alakban. */
  asOf: string
}

/**
 * A csempe állapotának levezetése — TISZTA FÜGGVÉNY (nincs I/O).
 *
 * A tisztaság szándékos: így a szám offline, DB nélkül is összevethető a
 * Pénzügy modul `calculateBalances`-alapú egyenlegével.
 *
 * A bemeneti sorlisták nyugodtan tartalmazhatnak az évet MEGELŐZŐ tételeket
 * (az irányítópult 24 hónapnyi sort tölt a grafikonhoz): a
 * `computePeriodBalances` ablakai — `[év-01-01, periodFrom)` és
 * `[periodFrom, periodTo]` — `periodFrom = év-01-01` esetén az év előtti
 * sorokat EGYIKBE SEM engedik be. Ezért NEM kell külön előszűrni, és nincs
 * második bejárás sem.
 */
export function deriveCongregationBalance(
  input: DeriveCongregationBalanceInput,
): CongregationBalance {
  const { nyito, income, expense, year, asOf } = input

  // ── Fail-closed #1: a nyitó feloldása hibázott ─────────────────────────
  if (!nyito.success) {
    return {
      ok: false,
      short: 'Nem számolható',
      detail:
        'A nyitó egyenlegek lekérdezése nem sikerült, ezért a pénzkészlet nem vezethető le. ' +
        'Töltsd újra az oldalt; ha újra hibázik, jelezd a rendszergazdának' +
        (nyito.error ? ` (részlet: ${nyito.error}).` : '.'),
    }
  }

  // ── Fail-closed #2: nincs rögzített kassza-nyitó ───────────────────────
  if (nyito.cash.baseYear == null) {
    return {
      ok: false,
      short: 'Nyitó hiányzik',
      detail:
        'Nincs rögzített kassza-nyitó egyenleg, ezért a rendszer nem tudja, mennyi pénzzel indult ' +
        'az év — a mai pénzkészlet nem számolható ki. Nyisd meg a Pénzügy → Kassza fület, és add meg ' +
        'az „Induló (nyitó) egyenlegek" ablakban a kassza és a bankszámlák induló összegét. Ezt ' +
        'elég EGYSZER, a legelső évre megadni: a következő évek nyitóját a rendszer az előző évi ' +
        'záróból hozza.',
    }
  }

  // A nyitó SZÁMLÁNKÉNT megy át. SOHA nem az aggregált `bankTotal` egyetlen
  // számlára — az egy MÁSIK számla nyitóját írná oda.
  const yearOpeningBankById: Record<number, number> = {}
  for (const [id, resolved] of Object.entries(nyito.bank)) {
    yearOpeningBankById[Number(id)] = resolved.value
  }

  const shared = {
    income,
    expense,
    year,
    periodFrom: `${year}-01-01`,
    yearOpeningCash: nyito.cash.value,
    yearOpeningBankById,
  }

  // MA — ez a csempe száma.
  const asOfBalances = computePeriodBalances({ ...shared, periodTo: asOf })
  if ('error' in asOfBalances) {
    return {
      ok: false,
      short: 'Nem számolható',
      detail: `A pénzkészlet levezetése elakadt: ${asOfBalances.error}`,
    }
  }

  // ÉV VÉGE — ugyanezekből a sorokból, MÁSODIK lekérdezés nélkül. Csak azért
  // kell, hogy a csempe jelezni tudja, ha a Pénzügy modul (ami a teljes évet
  // mutatja) szükségszerűen más összeget ír ki.
  const yearEndBalances = computePeriodBalances({ ...shared, periodTo: `${year}-12-31` })
  const yearEndTotal =
    'error' in yearEndBalances ? asOfBalances.total.closing : yearEndBalances.total.closing
  const futureDatedCount =
    'error' in yearEndBalances
      ? 0
      : Math.max(0, yearEndBalances.movementCount - asOfBalances.movementCount)

  return {
    ok: true,
    total: asOfBalances.total.closing,
    cash: asOfBalances.cash.closing,
    bank: asOfBalances.bank.closing,
    asOf,
    year,
    yearEndTotal,
    futureDatedCount,
  }
}

/** RON-formázás a csempére: „25 665,24" (magyar tagolás, mindig 2 tizedes). */
export function formatRon(value: number): string {
  return value.toLocaleString('hu-HU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** „2026. 08. 11." — a csempe magyarázó szövegeihez. */
export function formatHuDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}. ${m}. ${d}.`
}
