/**
 * Készpénzhasználati törvényi korlátok — KÖZÖS szabály-mag (web + desktop).
 *
 * Forrás: az EREK hivatalos „Változások 2026" dokumentuma (Beke Tivadar,
 * 2025-11-28, Zabola) — a 2025 végén érvényes romániai készpénz-szabályok:
 *
 *  · A pénztárban lévő készpénz nem haladhatja meg az 50 000 lejt; a többletet
 *    3 napon belül bankba kell tenni.
 *  · Elszámolási előlegként (decont) naponta és személyenként legfeljebb
 *    1 000 lej adható készpénzben vásárlási célra.
 *  · Más jogi személytől naponta legfeljebb 5 000 lej fogadható el készpénzben
 *    (több különböző jogi személytől külön-külön 5 000 – 5 000 lej lehet).
 *  · Egy napon összesen legfeljebb 10 000 lej fizethető ki készpénzben cégek
 *    felé, és egyetlen cégnek sem adható 5 000 lejnél több.
 *  · 5 000 lejnél nagyobb számla legfeljebb 5 000 lejig fizethető készpénzben,
 *    a fennmaradó rész KÖTELEZŐEN banki átutalással megy. A kifizetés kisebb
 *    részekre darabolása a korlát megkerülésére TILOS.
 *  · Magánszemélytől naponta legfeljebb 10 000 lej fogadható el, és
 *    magánszemélynek legfeljebb 10 000 lej fizethető ki készpénzben —
 *    kivéve az alkalmazott havi fizetését.
 *
 * MIÉRT FIGYELMEZTETÉS ÉS NEM BLOKKOLÁS (Endre döntése, 2026-08-14):
 *  a rendszer nem ismeri a partner jogi státuszát (nincs CUI/partner-típus
 *  mező), ezért a cég/magánszemély határok nem dönthetők el gépi bizonyossággal.
 *  A figyelmeztetés kimondja a szabályt és a mért számot — a döntés és a
 *  felelősség a lelkészé/könyvelőé marad. Blokkolni tévesen azonosított
 *  partnernél jogos rögzítést akadályozna.
 *
 * A szabályok VÁLTOZHATNAK (a dokumentum maga is jelzi) — ezért minden küszöb
 * nevesített, exportált konstans, egyetlen helyen.
 */

// ── Küszöbök (lej) ─────────────────────────────────────────────────────────

/** A pénztárban tartható készpénz felső határa. */
export const KASSZAPLAFON_LEJ = 50_000
/** Elszámolási előleg (decont) napi, személyenkénti felső határa. */
export const DECONT_ELOLEG_NAPI_SZEMELYENKENT_LEJ = 1_000
/** Egy jogi személynek / jogi személytől napi készpénz-határ. */
export const CEG_NAPI_KESZPENZ_LEJ = 5_000
/** Egy napon cégek felé összesen kifizethető készpénz. */
export const NAPI_OSSZES_CEGKIFIZETES_LEJ = 10_000
/** Magánszemélytől / magánszemélynek napi készpénz-határ. */
export const MAGANSZEMELY_NAPI_KESZPENZ_LEJ = 10_000

// ── Típusok ────────────────────────────────────────────────────────────────

export interface KeszpenzTetel {
  /** ISO dátum (YYYY-MM-DD). Hibás/üres dátumú tétel a napi aggregálásból kimarad. */
  datum: string
  /** Az összeg lejben (RON). Nem-szám / nem-pozitív érték kimarad. */
  osszeg: number
  irany: 'bevetel' | 'kiadas'
  /** A partner neve (átvevő / befizető). Üres partner a partnerenkénti szabályokból kimarad. */
  partner: string
  /** true = készpénzes tétel (nincs bankszámla). A banki tételekre a korlátok nem vonatkoznak. */
  keszpenz: boolean
}

export type KeszpenzFigyelmeztetesKod =
  | 'kasszaplafon'
  | 'tetel_5000_felett'
  | 'feldarabolas_gyanu'
  | 'napi_osszes_kifizetes_10000'
  | 'partner_napi_bevetel_5000'
  | 'partner_napi_bevetel_10000'
  | 'decont_eloleg_1000'

export interface KeszpenzFigyelmeztetes {
  kod: KeszpenzFigyelmeztetesKod
  /** Lelkész-barát, teljes mondatos magyarázat — a felület változtatás nélkül kiírhatja. */
  uzenet: string
  /** Az érintett nap (YYYY-MM-DD), ha a szabály napi. */
  datum?: string
  /** Az érintett partner, ha a szabály partnerenkénti. */
  partner?: string
  /** A mért összeg lejben. */
  osszeg: number
}

// ── Segédek ────────────────────────────────────────────────────────────────

const fmt = (n: number): string =>
  new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 }).format(n)

/** Partner-név normalizálás az összevonáshoz: kisbetű, összevont szóközök. */
function partnerKulcs(nev: string): string {
  return nev.trim().toLowerCase().replace(/\s+/g, ' ')
}

const ervenyes = (t: KeszpenzTetel): boolean =>
  t.keszpenz &&
  Number.isFinite(t.osszeg) &&
  t.osszeg > 0 &&
  /^\d{4}-\d{2}-\d{2}$/.test(t.datum)

// ── Szabályok ──────────────────────────────────────────────────────────────

/**
 * Kassza-plafon: 50 000 lej felett figyelmeztetés.
 * A hivatalos Excel (Adatok_2026 „Kassza" I2) ugyanezt élőben jelzi —
 * aki onnan áll át, ezt a védelmet nem veszítheti el.
 */
export function kasszaplafonUzenet(zaroEgyenleg: number): KeszpenzFigyelmeztetes | null {
  if (!Number.isFinite(zaroEgyenleg) || zaroEgyenleg <= KASSZAPLAFON_LEJ) return null
  return {
    kod: 'kasszaplafon',
    osszeg: zaroEgyenleg,
    uzenet:
      `A kasszában ${fmt(zaroEgyenleg)} lej van — a törvényes plafon ${fmt(KASSZAPLAFON_LEJ)} lej. ` +
      `A többletet (${fmt(zaroEgyenleg - KASSZAPLAFON_LEJ)} lej) 3 napon belül be kell tenni a bankszámlára.`,
  }
}

/**
 * Elszámolási előleg (decont): 1 000 lej/nap/személy felett figyelmeztetés.
 */
export function decontElolegUzenet(osszeg: number): KeszpenzFigyelmeztetes | null {
  if (!Number.isFinite(osszeg) || osszeg <= DECONT_ELOLEG_NAPI_SZEMELYENKENT_LEJ) return null
  return {
    kod: 'decont_eloleg_1000',
    osszeg,
    uzenet:
      `${fmt(osszeg)} lej elszámolási előleg — készpénzben naponta és személyenként legfeljebb ` +
      `${fmt(DECONT_ELOLEG_NAPI_SZEMELYENKENT_LEJ)} lej adható vásárlási célra. Ez a felső érték ` +
      `rendezvényre (konferencia, tábor) is naponta és személyenként értendő.`,
  }
}

/**
 * A tétel-lista (egy beviteli köteg, vagy egy nap már rögzített tételei
 * a köteggel együtt) készpénz-szabály szerinti átvilágítása.
 *
 * A visszaadott lista SORRENDJE determinisztikus: szabály szerint, azon belül
 * nap + partner szerint — a felület stabilan tudja kiírni.
 */
export function keszpenzKorlatFigyelmeztetesek(
  tetelek: KeszpenzTetel[],
): KeszpenzFigyelmeztetes[] {
  const ki: KeszpenzFigyelmeztetes[] = []
  const ervenyesek = tetelek.filter(ervenyes)

  // (e) Egyetlen készpénzes kifizetés 5 000 lej felett.
  for (const t of ervenyesek) {
    if (t.irany === 'kiadas' && t.osszeg > CEG_NAPI_KESZPENZ_LEJ) {
      ki.push({
        kod: 'tetel_5000_felett',
        datum: t.datum,
        partner: t.partner || undefined,
        osszeg: t.osszeg,
        uzenet:
          `${fmt(t.osszeg)} lej készpénzes kifizetés egy tételben` +
          (t.partner ? ` (${t.partner})` : '') +
          ` — 5 000 lejnél nagyobb számla legfeljebb ${fmt(CEG_NAPI_KESZPENZ_LEJ)} lejig fizethető ` +
          `készpénzben, a fennmaradó részt kötelezően banki átutalással kell rendezni.`,
      })
    }
  }

  // (c)+(f) Partnerenkénti napi összesítés — kiadás: feldarabolás-gyanú.
  const kiadasPartnerNap = new Map<string, { datum: string; partner: string; osszeg: number; db: number }>()
  for (const t of ervenyesek) {
    if (t.irany !== 'kiadas' || !t.partner.trim()) continue
    const k = `${t.datum}|${partnerKulcs(t.partner)}`
    const cur = kiadasPartnerNap.get(k) || { datum: t.datum, partner: t.partner.trim(), osszeg: 0, db: 0 }
    cur.osszeg += t.osszeg
    cur.db += 1
    kiadasPartnerNap.set(k, cur)
  }
  for (const v of [...kiadasPartnerNap.values()].sort((a, b) => (a.datum + a.partner).localeCompare(b.datum + b.partner))) {
    // Több tételre darabolva lépi át az 5 000-et → a darabolás-tilalom gyanúja.
    // (Egyetlen nagy tételt a fenti tetel_5000_felett már jelez — nem duplázunk.)
    if (v.db >= 2 && v.osszeg > CEG_NAPI_KESZPENZ_LEJ) {
      ki.push({
        kod: 'feldarabolas_gyanu',
        datum: v.datum,
        partner: v.partner,
        osszeg: v.osszeg,
        uzenet:
          `${v.partner} felé ${v.datum} napon ${v.db} készpénzes kifizetés, összesen ${fmt(v.osszeg)} lej — ` +
          `egy partnernek naponta legfeljebb ${fmt(CEG_NAPI_KESZPENZ_LEJ)} lej fizethető készpénzben, ` +
          `és a kifizetés részekre darabolása a korlát megkerülésére tilos.`,
      })
    }
  }

  // (d) Napi ÖSSZES készpénzes kifizetés 10 000 lej felett.
  const kiadasNap = new Map<string, number>()
  for (const t of ervenyesek) {
    if (t.irany !== 'kiadas') continue
    kiadasNap.set(t.datum, (kiadasNap.get(t.datum) || 0) + t.osszeg)
  }
  for (const [datum, osszeg] of [...kiadasNap.entries()].sort()) {
    if (osszeg > NAPI_OSSZES_CEGKIFIZETES_LEJ) {
      ki.push({
        kod: 'napi_osszes_kifizetes_10000',
        datum,
        osszeg,
        uzenet:
          `${datum} napon összesen ${fmt(osszeg)} lej készpénzes kifizetés — cégek felé egy napon ` +
          `összesen legfeljebb ${fmt(NAPI_OSSZES_CEGKIFIZETES_LEJ)} lej fizethető készpénzben. ` +
          `Ha a kifizetések (részben) magánszemélyek felé mentek, a rájuk vonatkozó napi ` +
          `${fmt(MAGANSZEMELY_NAPI_KESZPENZ_LEJ)} lejes határ az irányadó (az alkalmazotti fizetés kivétel).`,
      })
    }
  }

  // (b)+(g) Partnerenkénti napi BEVÉTEL: 5 000 felett (jogi személy határa),
  // 10 000 felett (már a magánszemély-határ is átlépve).
  const bevetelPartnerNap = new Map<string, { datum: string; partner: string; osszeg: number }>()
  for (const t of ervenyesek) {
    if (t.irany !== 'bevetel' || !t.partner.trim()) continue
    const k = `${t.datum}|${partnerKulcs(t.partner)}`
    const cur = bevetelPartnerNap.get(k) || { datum: t.datum, partner: t.partner.trim(), osszeg: 0 }
    cur.osszeg += t.osszeg
    bevetelPartnerNap.set(k, cur)
  }
  for (const v of [...bevetelPartnerNap.values()].sort((a, b) => (a.datum + a.partner).localeCompare(b.datum + b.partner))) {
    if (v.osszeg > MAGANSZEMELY_NAPI_KESZPENZ_LEJ) {
      ki.push({
        kod: 'partner_napi_bevetel_10000',
        datum: v.datum,
        partner: v.partner,
        osszeg: v.osszeg,
        uzenet:
          `${v.partner} befizetőtől ${v.datum} napon összesen ${fmt(v.osszeg)} lej készpénz — ` +
          `magánszemélytől naponta legfeljebb ${fmt(MAGANSZEMELY_NAPI_KESZPENZ_LEJ)} lej, jogi személytől ` +
          `legfeljebb ${fmt(CEG_NAPI_KESZPENZ_LEJ)} lej fogadható el készpénzben.`,
      })
    } else if (v.osszeg > CEG_NAPI_KESZPENZ_LEJ) {
      ki.push({
        kod: 'partner_napi_bevetel_5000',
        datum: v.datum,
        partner: v.partner,
        osszeg: v.osszeg,
        uzenet:
          `${v.partner} befizetőtől ${v.datum} napon összesen ${fmt(v.osszeg)} lej készpénz — ` +
          `ha a befizető jogi személy (cég vagy egyházközség), tőle naponta legfeljebb ` +
          `${fmt(CEG_NAPI_KESZPENZ_LEJ)} lej fogadható el készpénzben. Magánszemélynél a határ ` +
          `${fmt(MAGANSZEMELY_NAPI_KESZPENZ_LEJ)} lej.`,
      })
    }
  }

  // Determinista kimeneti sorrend: kód szerinti csoportok a fenti felvételi
  // sorrendben maradnak; a csoportokon belül már rendezve gyűjtöttünk.
  return ki
}
