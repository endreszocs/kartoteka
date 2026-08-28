/**
 * Egy adott (deviza) bankszámla aktuális egyenlegének kiszámítása
 * a `belsomozgas` valutacsere tranzakciók alapján.
 *
 * LOGIKA:
 * - A `bankszamlak.nyito_egyenleg` mezője adja a kezdő egyenleget
 *   (a számla létrehozásakor vagy egy év elején beállított érték, a számla
 *   saját devizájában — pl. EUR vagy HUF).
 * - A `belsomozgas` tábla `valutacsere` típusú rekordjai mozgatják:
 *     • Ha a `cel` mező = bankszámla ID → a `cel_osszeg` mező (deviza) hozzáadódik
 *     • Ha a `forras` mező = bankszámla ID → az `osszeg` (RON, vagy ennek deviza
 *       fele a bankszámla devizájában) levonódik. Megjegyzés: a Vanilla JS
 *       valutacseréknél a "forras" általában RON számla, "cel" pedig EUR számla,
 *       szóval az EUR számláról ritkán "vonódik" (csak ha visszacseréljük RON-ra).
 *
 * KORLÁTOK:
 * - A `befizetes` és `kiadas` táblákban nincs `valuta` mező → ezeket ez a
 *   függvény NEM veszi figyelembe (azok RON-alapúak). Ha a felhasználó EUR-ban
 *   rögzít közvetlen befizetést a UI-ban, az itt nem fog megjelenni.
 * - Az átértékelési modal lehetővé teszi a felhasználónak, hogy felülbírálja a
 *   kalkulált értéket (pl. a saját banki kivonatára támaszkodva).
 *
 * Hivatkozott Vanilla JS forrás: penzugy_init.js carryover logika +
 * penzugy_belsomozgas.js valutacsere mentés.
 */

import type { BankAccount, InternalTransferRow } from '@/lib/constants/finance'

export interface BankBalanceResult {
  /** A számla aktuális egyenlege a saját devizájában (EUR, HUF, vagy RON). */
  balance: number
  /** A számla devizája (a bankszámla `valuta` mezője). */
  valuta: string
  /** A nyitó egyenleg, ahonnan számoltunk. */
  nyitoEgyenleg: number
  /** Hány tranzakció módosította az egyenleget. */
  modositoTranzakciokSzama: number
}

/**
 * Egy bankszámla deviza-egyenlegének kiszámítása.
 *
 * Csak a `valutacsere` típusú belső mozgásokat veszi figyelembe (azok
 * tartalmaznak deviza-konverziót). A többi típus (`kassza_bank`, `bank_kassza`,
 * `bank_bank`) ugyanabban a devizában mozog, nem érinti az átértékelést.
 *
 * @param bank      A bankszámla rekordja
 * @param transfers Az összes belső mozgás rekord (a teljes lista, az aktívak)
 * @param uptoDate  Opcionális dátum-felső határ (ISO YYYY-MM-DD).
 *                  Ha megadva, csak ezelőtti tranzakciókat veszi figyelembe.
 *                  Hasznos pl. egy adott év végi egyenleg számolásához.
 */
export function calculateBankCurrencyBalance(
  bank: BankAccount,
  transfers: InternalTransferRow[],
  uptoDate?: string,
  /** P3-6 (audit 2026-08-28): a hívó a KANONIKUS évenkénti nyitóval hívhat —
   *  `nyitoOverride` a nyitó a saját devizában, `fromDate` a nyitó évének
   *  jan. 1-je (az az előtti valutacserék már a nyitóban benne vannak). A
   *  legacy `bankszamlak.nyito_egyenleg` skalár csak fallback. */
  opts?: { nyitoOverride?: number; fromDate?: string },
): BankBalanceResult {
  const nyitoEgyenleg = opts?.nyitoOverride ?? (Number(bank.nyito_egyenleg) || 0)
  let balance = nyitoEgyenleg
  let modositoCount = 0
  const bankIdStr = String(bank.id)

  for (const t of transfers) {
    if (t.deleted) continue
    if (t.tipus !== 'valutacsere') continue
    if (uptoDate && t.datum > uptoDate) continue
    if (opts?.fromDate && t.datum < opts.fromDate) continue

    // valutacsere: forras = egyik számla, cel = másik számla
    // A `cel_osszeg` a cél deviza, az `osszeg` a forrás deviza.
    if (t.cel === bankIdStr && t.cel_osszeg != null) {
      balance += Number(t.cel_osszeg)
      modositoCount++
    } else if (t.forras === bankIdStr) {
      balance -= Number(t.osszeg)
      modositoCount++
    }
  }

  return {
    balance,
    valuta: bank.valuta || 'RON',
    nyitoEgyenleg,
    modositoTranzakciokSzama: modositoCount,
  }
}

/**
 * Az átértékelés különbözetéből származó "típus" (nyereség/veszteség/nulla).
 *
 * - kulonbozet > 0  → 'nyereseg' (a deviza erősebb lett, RON értéke nőtt)
 * - kulonbozet < 0  → 'veszteseg' (RON értéke csökkent)
 * - kulonbozet = 0  → 'nulla' (nincs változás, üres rekord — ritka)
 */
export type FxRevaluationTipus = 'nyereseg' | 'veszteseg' | 'nulla'

export function getFxTipus(kulonbozet: number): FxRevaluationTipus {
  if (kulonbozet > 0) return 'nyereseg'
  if (kulonbozet < 0) return 'veszteseg'
  return 'nulla'
}

/**
 * Egy átértékelés kalkulálása a 3 bemenettel.
 *
 * Minden mező egységes a saját devizában (devizaegyenleg, árfolyam),
 * a kimenet RON-ban van.
 */
export interface FxCalcInput {
  devizaEgyenleg: number
  regiRonErtek: number
  ujArfolyam: number
}

export interface FxCalcResult {
  ujRonErtek: number
  kulonbozet: number
  tipus: FxRevaluationTipus
  /** A számolt régi árfolyam (regi_ron / deviza_egyenleg). 0 ha deviza_egyenleg = 0. */
  regiArfolyam: number
}

export function calculateFxRevaluation(input: FxCalcInput): FxCalcResult {
  const ujRonErtek = round2(input.devizaEgyenleg * input.ujArfolyam)
  const kulonbozet = round2(ujRonErtek - input.regiRonErtek)
  const regiArfolyam = input.devizaEgyenleg > 0
    ? round4(input.regiRonErtek / input.devizaEgyenleg)
    : 0

  return {
    ujRonErtek,
    kulonbozet,
    tipus: getFxTipus(kulonbozet),
    regiArfolyam,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
