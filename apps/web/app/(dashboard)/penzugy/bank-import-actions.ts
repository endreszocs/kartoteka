'use server'

/**
 * Banki Excel import server action-ök.
 *
 * A wizard a kliens-oldalon parse-olja az Excel-t (BCR, stb.),
 * majd minden tételhez a felhasználó dönti el:
 *   - Bevétel (befizetés → bankszámla)
 *   - Kiadás (bankszámláról)
 *   - Belső mozgás (kassza ↔ bank)
 *   - Kihagyás (nem releváns, pl. banki díj különleges rögzítéssel)
 *
 * Ez az action egy batch-et kap és egyesével rögzíti a DB-be.
 */

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export type BankImportItemAction = 'income' | 'expense' | 'internal-transfer' | 'skip'

export type BankImportItem = {
  /** Sor index a parse-ból (debug). */
  rowIndex: number
  date: string // YYYY-MM-DD
  description: string
  reference?: string
  /** Előjeles összeg (negatív = kiadás, pozitív = bevétel). */
  amount: number
  counterparty?: string
  /** Mit csinálunk vele. */
  action: BankImportItemAction
  /** Target bankszámla ID — minden action-höz szükséges kivéve skip. */
  bankszamlaId: number
  /** Kategória (bevétel / kiadás esetén kötelező). */
  categoryId?: number
  /** Belső mozgás esetén — a MÁSIK oldal (kasszára / másik bankra). */
  transferTo?: 'kassza' | number
  /** Személy ID (opcionális, bevétel esetén). */
  personId?: number
  megjegyzes?: string
  /** Iratszám (számla szám, nyugta szám stb.). Ha megadva, ezt használjuk a `reference`/`description` alapú auto-generálás helyett. */
  iratszam?: string
}

export type BankImportResult = {
  totalItems: number
  imported: number
  skipped: number
  /** Duplikációk miatt átugrott tételek (már benne volt a rendszerben). */
  duplicates: number
  errors: Array<{ rowIndex: number; error: string }>
}

/**
 * Visszaadja, hogy egy adott bankszámlán található-e már (datum, osszeg) párra
 * illeszkedő tranzakció. Duplikáció-védelemhez.
 *
 * A heurisztika: ha ugyanazon a napon, ugyanazon a bankszámlán, ugyanazon az
 * összeggel (±1 cent) van rekord, az nagy valószínűséggel ugyanaz a tétel.
 */
async function hasExistingBankTransaction(
  supabase: Awaited<ReturnType<typeof getEffectiveAccessContext>>['supabase'],
  congregationId: string,
  params: { date: string; amount: number; bankszamlaId: number; side: 'income' | 'expense' },
): Promise<boolean> {
  const absAmount = Math.abs(params.amount)
  const table = params.side === 'income' ? 'befizetes' : 'kiadas'
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('congregation_id', congregationId)
    .eq('bankszamla_id', params.bankszamlaId)
    .eq('datum', params.date)
    .gte('osszeg', absAmount - 0.01)
    .lte('osszeg', absAmount + 0.01)
    .eq('deleted', false)
    .limit(1)
  return !!(data && data.length > 0)
}

/** ISO dátum (YYYY-MM-DD) ± N nap, időzóna-biztosan (UTC). */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Két ISO-dátum napban mért távolsága (abszolút). */
function dateProximityDays(a: string, b: string): number {
  const ta = new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime()
  const tb = new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime()
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity
  return Math.abs((ta - tb) / 86_400_000)
}

type BankSupabase = Awaited<ReturnType<typeof getEffectiveAccessContext>>['supabase']

/**
 * Egy `belso_mozgas_xkey` PÁROSÍTOTT-e már a bank-oldalon? (Van-e olyan befizetés/kiadás
 * ugyanazzal az xkey-vel, aminek `bankszamla_id` ki van töltve.) Ha igen, a mozgás teljes.
 */
async function isXkeyPairedOnBankSide(
  supabase: BankSupabase,
  congregationId: string,
  xkey: string,
): Promise<boolean> {
  for (const table of ['befizetes', 'kiadas'] as const) {
    const { data } = await supabase
      .from(table)
      .select('id')
      .eq('congregation_id', congregationId)
      .eq('belso_mozgas_xkey', xkey)
      .not('bankszamla_id', 'is', null)
      .eq('deleted', false)
      .limit(1)
    if (data && data.length > 0) return true
  }
  return false
}

/**
 * AKTÍV PÁROSÍTÁS: keres egy MEGLÉVŐ, párosítatlan KASSZA-oldali belső mozgást, amihez a most
 * importált banki tétel a pár. (A Kassza-import a 400.01/300.01 sorokat kassza-oldalon, banki
 * párja nélkül hozta létre — ezeket kötjük most össze a banki kivonat tételeivel.)
 *
 * Kritériumok: kassza-oldal (`bankszamla_id IS NULL`), van `belso_mozgas_xkey`, az adott
 * irány (befizetés/kiadás), azonos összeg (±0.01), a dátum ±3 napon belül, NEM törölt, és az
 * xkey-je még NINCS bank-oldalon párosítva.
 *
 * @returns A megtalált kassza-oldali sor id-je + xkey-je (ezt használjuk a banki sorhoz), vagy null.
 */
async function findUnpairedCashCounterpart(
  supabase: BankSupabase,
  congregationId: string,
  params: { side: 'income' | 'expense'; amount: number; date: string },
): Promise<{ id: number; xkey: string } | null> {
  const table = params.side === 'income' ? 'befizetes' : 'kiadas'
  const { data: candidates } = await supabase
    .from(table)
    .select('id, belso_mozgas_xkey, datum')
    .eq('congregation_id', congregationId)
    .is('bankszamla_id', null)
    .not('belso_mozgas_xkey', 'is', null)
    .gte('osszeg', params.amount - 0.01)
    .lte('osszeg', params.amount + 0.01)
    .eq('deleted', false)
    .gte('datum', addDaysIso(params.date, -3))
    .lte('datum', addDaysIso(params.date, 3))

  if (!candidates || candidates.length === 0) return null

  // Dátum-közelség szerint (legközelebbi elöl)
  const sorted = [...candidates].sort(
    (a, b) =>
      dateProximityDays(String(a.datum), params.date) -
      dateProximityDays(String(b.datum), params.date),
  )

  for (const c of sorted) {
    const xkey = c.belso_mozgas_xkey as string | null
    if (!xkey) continue
    const paired = await isXkeyPairedOnBankSide(supabase, congregationId, xkey)
    if (!paired) return { id: c.id as number, xkey }
  }
  return null
}

/**
 * Kiadás-sor beszúrása a legacy séma kétlépcsős (reference → canonical) fallback-jával.
 */
async function insertKiadasWithFallback(
  supabase: BankSupabase,
  canonical: Record<string, unknown>,
  userId: string,
): Promise<{ error: { message: string } | null }> {
  const reference: Record<string, unknown> = {
    ...canonical,
    nyugta: canonical.iratszam,
    xkey: randomUUID().replace(/-/g, '').slice(0, 20),
    atvevo: canonical.kedvezmenyzett ?? null,
    atvevoid: null,
    userid: userId,
  }
  let ins = await supabase.from('kiadas').insert([reference])
  if (ins.error) ins = await supabase.from('kiadas').insert([canonical])
  return { error: ins.error }
}

/**
 * A legutolsó banki tranzakció dátuma egy adott bankszámlán.
 * A wizard ezt használja default szűrőként: csak az ennél későbbi
 * tranzakciókat ajánlja fel alapértelmezetten.
 */
export async function getLatestBankTransactionDate(bankszamlaId: number): Promise<{
  date?: string | null
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const [inc, exp] = await Promise.all([
    access.supabase
      .from('befizetes')
      .select('datum')
      .eq('congregation_id', access.effectiveCongregationId)
      .eq('bankszamla_id', bankszamlaId)
      .eq('deleted', false)
      .order('datum', { ascending: false })
      .limit(1)
      .maybeSingle(),
    access.supabase
      .from('kiadas')
      .select('datum')
      .eq('congregation_id', access.effectiveCongregationId)
      .eq('bankszamla_id', bankszamlaId)
      .eq('deleted', false)
      .order('datum', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const incDate = (inc.data?.datum as string | null) ?? null
  const expDate = (exp.data?.datum as string | null) ?? null
  if (!incDate && !expDate) return { date: null }
  if (!incDate) return { date: expDate }
  if (!expDate) return { date: incDate }
  return { date: incDate > expDate ? incDate : expDate }
}

export async function importBcrTransactions(
  items: BankImportItem[],
): Promise<BankImportResult & { error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { totalItems: 0, imported: 0, skipped: 0, duplicates: 0, errors: [], error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId)
    return { totalItems: 0, imported: 0, skipped: 0, duplicates: 0, errors: [], error: 'Nincs aktív gyülekezet.' }

  const result: BankImportResult = {
    totalItems: items.length,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    errors: [],
  }

  const userId = access.user.id
  const congregationId = access.effectiveCongregationId

  // ── VALUTA + ÁRFOLYAM előkészítés ──
  // A tranzakciók RON ekvivalensét a bankszámla valutája + az év eleji
  // nyitó egyenleg árfolyam alapján számoljuk. Ha a bankszámla RON, az
  // arfolyam=1 és az osszeg_ron=osszeg.
  //
  // A `bankszamlak` táblából egyszer lekérdezzük minden érintett számlát.
  const uniqueBankIds = Array.from(new Set(items.map((i) => i.bankszamlaId)))
  const { data: banksData } = await access.supabase
    .from('bankszamlak')
    .select('id, valuta')
    .in('id', uniqueBankIds)
    .eq('congregation_id', congregationId)
  const bankValutaMap = new Map<number, string>()
  for (const b of banksData || []) {
    bankValutaMap.set(b.id as number, (b.valuta as string) || 'RON')
  }

  // Éves árfolyamok: (bankszamla_id + eve) → arfolyam
  const arfolyamKulcs = (bid: number, ev: number) => `${bid}:${ev}`
  const arfolyamMap = new Map<string, number>()
  const years = Array.from(
    new Set(items.map((i) => new Date(i.date).getFullYear())),
  )
  for (const bid of uniqueBankIds) {
    const val = bankValutaMap.get(bid) || 'RON'
    if (val === 'RON') {
      for (const y of years) arfolyamMap.set(arfolyamKulcs(bid, y), 1)
      continue
    }
    // Valutás: lekérdezzük a nyitó egyenleg árfolyamokat
    const { data: nyitoData } = await access.supabase
      .from('bankszamla_nyito_egyenleg')
      .select('eve, arfolyam')
      .eq('bankszamla_id', bid)
      .eq('congregation_id', congregationId)
      .in('eve', years)
    for (const n of nyitoData || []) {
      const arf = n.arfolyam != null ? Number(n.arfolyam) : 0
      if (arf > 0) arfolyamMap.set(arfolyamKulcs(bid, n.eve as number), arf)
    }
  }

  function computeOsszegRon(item: BankImportItem): { osszegRon: number; arfolyam: number } {
    const year = new Date(item.date).getFullYear()
    const arf = arfolyamMap.get(arfolyamKulcs(item.bankszamlaId, year))
    const valuta = bankValutaMap.get(item.bankszamlaId) || 'RON'
    if (valuta === 'RON' || !arf || arf <= 0) {
      return { osszegRon: Math.abs(item.amount), arfolyam: 1 }
    }
    return {
      osszegRon: Number((Math.abs(item.amount) * arf).toFixed(2)),
      arfolyam: arf,
    }
  }

  for (const item of items) {
    if (item.action === 'skip') {
      result.skipped++
      continue
    }

    // ── DUPLIKÁCIÓ VÉDELEM ──
    // A (dátum, bankszámla, összeg) hármas ha már létezik, ne duplikáljunk.
    // A belső mozgás speciális — mindkét oldalt együttesen ellenőrizzük
    // (ha az egyik oldal megvan, feltehetően a párja is)
    if (item.action === 'income') {
      const dup = await hasExistingBankTransaction(access.supabase, congregationId, {
        date: item.date,
        amount: item.amount,
        bankszamlaId: item.bankszamlaId,
        side: 'income',
      })
      if (dup) {
        result.duplicates++
        continue
      }
    } else if (item.action === 'expense') {
      const dup = await hasExistingBankTransaction(access.supabase, congregationId, {
        date: item.date,
        amount: item.amount,
        bankszamlaId: item.bankszamlaId,
        side: 'expense',
      })
      if (dup) {
        result.duplicates++
        continue
      }
    } else if (item.action === 'internal-transfer') {
      // Belső mozgás: nézzük meg, van-e már ilyen a bank oldalon (az amount
      // előjele alapján income vagy expense)
      const bankSide = item.amount < 0 ? 'expense' : 'income'
      const dup = await hasExistingBankTransaction(access.supabase, congregationId, {
        date: item.date,
        amount: item.amount,
        bankszamlaId: item.bankszamlaId,
        side: bankSide,
      })
      if (dup) {
        result.duplicates++
        continue
      }
    }

    // Közös dokument-szám: a felhasználó által megadott iratszám > bank referencia > leírás alapú generálás
    // FONTOS: a legacy DB-n `befizetes.nyugta` és `befizetes.iratszam` varchar(20),
    // ezért MAX 20 karakterre csonkolunk. A BCR referencia (pl. "SGW1000026269926")
    // általában 16–20 karakter, de a leírás-alapú fallback hosszabb lehet.
    const rawDocNumber =
      item.iratszam?.trim() ||
      item.reference?.trim() ||
      item.description.slice(0, 30).replace(/\s+/g, '-').toLowerCase()
    const docNumber = rawDocNumber.slice(0, 20)

    try {
      if (item.action === 'income') {
        // BEVÉTEL a bankba
        if (!item.categoryId) {
          result.errors.push({ rowIndex: item.rowIndex, error: 'Hiányzó kategória (bevétel)' })
          continue
        }
        const { osszegRon: incOsszegRon, arfolyam: incArfolyam } = computeOsszegRon(item)
        // A `befizetes` táblán az `xkey` és `nyugta` oszlopok NOT NULL
        // (legacy DB séma) — mindenhol meg kell adnunk, különben a beszúrás
        // constraint-hibával bukik ("null value in column xkey").
        const payload = {
          osszeg: Math.abs(item.amount),
          osszeg_ron: incOsszegRon,
          arfolyam: incArfolyam,
          datum: item.date,
          id_befizetescel: item.categoryId,
          id_szemely: item.personId ?? null,
          id_csalad: null,
          forrasa: item.counterparty || item.description.slice(0, 100),
          iratszam: docNumber,
          nyugta: docNumber,
          irattipus: 'banki',
          bankszamla_id: item.bankszamlaId,
          megjegyzes: item.megjegyzes || item.description,
          deleted: false,
          congregation_id: congregationId,
          fizetettev: Number(item.date.slice(0, 4)),
          is_potlas: false,
          xkey: randomUUID().replace(/-/g, '').slice(0, 20),
        }
        const { error } = await access.supabase.from('befizetes').insert([payload])
        if (error) {
          result.errors.push({ rowIndex: item.rowIndex, error: error.message })
        } else {
          result.imported++
        }
      } else if (item.action === 'expense') {
        // KIADÁS a bankból
        if (!item.categoryId) {
          result.errors.push({ rowIndex: item.rowIndex, error: 'Hiányzó kategória (kiadás)' })
          continue
        }
        const { osszegRon: expOsszegRon, arfolyam: expArfolyam } = computeOsszegRon(item)
        const canonical: Record<string, unknown> = {
          osszeg: Math.abs(item.amount),
          osszeg_ron: expOsszegRon,
          arfolyam: expArfolyam,
          datum: item.date,
          id_kiadascel: item.categoryId,
          kedvezmenyzett: item.counterparty || item.description.slice(0, 100),
          iratszam: docNumber,
          irattipus: 'banki',
          bankszamla_id: item.bankszamlaId,
          megjegyzes: item.megjegyzes || item.description,
          deleted: false,
          congregation_id: congregationId,
        }
        const reference: Record<string, unknown> = {
          ...canonical,
          nyugta: docNumber,
          xkey: randomUUID().replace(/-/g, '').slice(0, 20),
          atvevo: item.counterparty || item.description.slice(0, 100),
          atvevoid: null,
          userid: userId,
        }
        let ins = await access.supabase.from('kiadas').insert([reference]).select('id')
        if (ins.error) {
          ins = await access.supabase.from('kiadas').insert([canonical]).select('id')
        }
        if (ins.error) {
          result.errors.push({ rowIndex: item.rowIndex, error: ins.error.message })
        } else {
          result.imported++
        }
      } else if (item.action === 'internal-transfer') {
        // BELSŐ MOZGÁS: kassza ↔ bank, vagy bank ↔ bank — AKTÍV PÁROSÍTÁSSAL.
        const isKasszaTarget = item.transferTo === 'kassza'
        // Az amount előjele határozza meg az irányt:
        //   amount < 0 (terhelés): a bankból KIMENT → bank-oldal KIADÁS
        //   amount > 0 (jóváírás): a bankba BEMENT → bank-oldal BEVÉTEL
        const isBankToKassza = item.amount < 0
        const absAmount = Math.abs(item.amount)
        const bmTipus = isKasszaTarget ? (isBankToKassza ? 'bank_kassza' : 'kassza_bank') : 'bank_bank'

        // A bank-oldal iránya az item.bankszamlaId számlán, és a counterpart (másik oldal) iránya.
        const bankSide: 'income' | 'expense' = isBankToKassza ? 'expense' : 'income'
        const counterpartSide: 'income' | 'expense' = bankSide === 'income' ? 'expense' : 'income'
        // Counterpart számla: kassza-célnál NULL (kassza), bank-banknál a transferTo számla.
        const counterpartBankId: number | null =
          isKasszaTarget ? null : (typeof item.transferTo === 'number' ? item.transferTo : null)

        // ── AKTÍV PÁROSÍTÁS ──
        // Kassza-célnál megnézzük: van-e MÁR egy párosítatlan kassza-oldali mozgás (a Kassza-import
        // hozta létre a 400.01/300.01 sort). Ha igen, annak az xkey-jét ÚJRAHASZNÁLJUK a banki sorhoz,
        // és NEM hozunk létre második kassza-oldalt → a pár teljes lesz, a piros jelzés eltűnik.
        let xkey: string = randomUUID()
        let counterpartAlreadyExists = false
        if (isKasszaTarget) {
          const existing = await findUnpairedCashCounterpart(access.supabase, congregationId, {
            side: counterpartSide,
            amount: absAmount,
            date: item.date,
          })
          if (existing) {
            xkey = existing.xkey
            counterpartAlreadyExists = true
            const cpTable = counterpartSide === 'income' ? 'befizetes' : 'kiadas'
            await access.supabase
              .from(cpTable)
              .update({ megjegyzes: `✓ Banki párja egyeztetve (${item.date})` })
              .eq('id', existing.id)
              .eq('congregation_id', congregationId)
          }
        }

        // ── 1. Bank-oldali sor (az item.bankszamlaId számlán) ──
        if (bankSide === 'income') {
          const befPayload = {
            osszeg: absAmount, datum: item.date,
            id_befizetescel: item.categoryId ?? null,
            id_szemely: null, id_csalad: null,
            forrasa: 'Belső mozgás — bankba',
            iratszam: docNumber, nyugta: docNumber,
            irattipus: 'banki', bankszamla_id: item.bankszamlaId,
            belso_mozgas_xkey: xkey,
            megjegyzes: item.megjegyzes || item.description,
            deleted: false, congregation_id: congregationId,
            fizetettev: Number(item.date.slice(0, 4)), is_potlas: false,
            xkey: randomUUID().replace(/-/g, '').slice(0, 20),
          }
          const { error } = await access.supabase.from('befizetes').insert([befPayload])
          if (error) {
            result.errors.push({ rowIndex: item.rowIndex, error: `Bank oldal: ${error.message}` })
            continue
          }
        } else {
          const canonical: Record<string, unknown> = {
            osszeg: absAmount, datum: item.date,
            id_kiadascel: item.categoryId ?? null,
            kedvezmenyzett: 'Belső mozgás — kasszába',
            iratszam: docNumber, irattipus: 'banki',
            bankszamla_id: item.bankszamlaId, belso_mozgas_xkey: xkey,
            megjegyzes: item.megjegyzes || item.description,
            deleted: false, congregation_id: congregationId,
          }
          const { error } = await insertKiadasWithFallback(access.supabase, canonical, userId)
          if (error) {
            result.errors.push({ rowIndex: item.rowIndex, error: `Bank oldal: ${error.message}` })
            continue
          }
        }

        // ── 2. Counterpart-oldal — CSAK ha még nem létezik (aktív párosításnál kihagyjuk) ──
        if (!counterpartAlreadyExists) {
          const cpIrattipus = counterpartBankId === null ? 'készpénz' : 'banki'
          if (counterpartSide === 'income') {
            const befPayload = {
              osszeg: absAmount, datum: item.date,
              id_befizetescel: item.categoryId ?? null,
              id_szemely: null, id_csalad: null,
              forrasa: isKasszaTarget ? 'Belső mozgás — bankból' : 'Belső mozgás — másik számláról',
              iratszam: docNumber, nyugta: docNumber,
              irattipus: cpIrattipus, bankszamla_id: counterpartBankId,
              belso_mozgas_xkey: xkey,
              megjegyzes: item.megjegyzes || item.description,
              deleted: false, congregation_id: congregationId,
              fizetettev: Number(item.date.slice(0, 4)), is_potlas: false,
              xkey: randomUUID().replace(/-/g, '').slice(0, 20),
            }
            const { error } = await access.supabase.from('befizetes').insert([befPayload])
            if (error) {
              result.errors.push({ rowIndex: item.rowIndex, error: `Másik oldal: ${error.message}` })
              continue
            }
          } else {
            const canonical: Record<string, unknown> = {
              osszeg: absAmount, datum: item.date,
              id_kiadascel: item.categoryId ?? null,
              kedvezmenyzett: isKasszaTarget ? 'Belső mozgás — bankba' : 'Belső mozgás — másik számlára',
              iratszam: docNumber, irattipus: cpIrattipus,
              bankszamla_id: counterpartBankId, belso_mozgas_xkey: xkey,
              megjegyzes: item.megjegyzes || item.description,
              deleted: false, congregation_id: congregationId,
            }
            const { error } = await insertKiadasWithFallback(access.supabase, canonical, userId)
            if (error) {
              result.errors.push({ rowIndex: item.rowIndex, error: `Másik oldal: ${error.message}` })
              continue
            }
          }
        }

        // ── BM audit rekord (belsomozgas tábla) ──
        await access.supabase.from('belsomozgas').insert({
          congregation_id: congregationId,
          datum: item.date,
          tipus: bmTipus,
          osszeg: absAmount,
          forras: isBankToKassza
            ? String(item.bankszamlaId)
            : (isKasszaTarget ? 'kassza' : String(counterpartBankId ?? '')),
          cel: isBankToKassza
            ? (isKasszaTarget ? 'kassza' : String(counterpartBankId ?? ''))
            : String(item.bankszamlaId),
          megjegyzes: counterpartAlreadyExists
            ? `Párosítva a kassza-import tételével — ${item.megjegyzes || item.description}`
            : (item.megjegyzes || item.description),
          created_by: userId,
          deleted: false,
        })

        result.imported++
      }
    } catch (e) {
      result.errors.push({
        rowIndex: item.rowIndex,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  revalidatePath('/penzugy')
  return result
}
