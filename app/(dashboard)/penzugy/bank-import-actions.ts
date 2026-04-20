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
          xkey: randomUUID(),
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
          xkey: randomUUID(),
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
        // BELSŐ MOZGÁS: kassza ↔ bank, vagy bank ↔ bank
        const xkey = randomUUID()
        const isKasszaTarget = item.transferTo === 'kassza'
        // Az amount előjele határozza meg az irányt:
        //   amount < 0 (terhelés): a bankból KIMENT → kassza bejövetel
        //   amount > 0 (jóváírás): a bankba BEMENT → kassza kimenetel
        const isBankToKassza = item.amount < 0
        const absAmount = Math.abs(item.amount)

        // BM típus string — a belsomozgas.tipus oszlopba
        const bmTipus = isKasszaTarget
          ? isBankToKassza
            ? 'bank_kassza'
            : 'kassza_bank'
          : 'bank_bank'

        // 1. Bank oldali sor (kiadas VAGY befizetes)
        if (isBankToKassza) {
          // Bankból kivétel → kiadas sor
          const canonical: Record<string, unknown> = {
            osszeg: absAmount,
            datum: item.date,
            id_kiadascel: item.categoryId ?? null,
            kedvezmenyzett: 'Belső mozgás — kasszába',
            iratszam: docNumber,
            irattipus: 'banki',
            bankszamla_id: item.bankszamlaId,
            belso_mozgas_xkey: xkey,
            megjegyzes: item.megjegyzes || item.description,
            deleted: false,
            congregation_id: congregationId,
          }
          const reference: Record<string, unknown> = {
            ...canonical,
            nyugta: docNumber,
            xkey: randomUUID(),
            atvevo: 'Belső mozgás — kasszába',
            atvevoid: null,
            userid: userId,
          }
          let ins = await access.supabase.from('kiadas').insert([reference])
          if (ins.error) ins = await access.supabase.from('kiadas').insert([canonical])
          if (ins.error) {
            result.errors.push({ rowIndex: item.rowIndex, error: `Bank oldal: ${ins.error.message}` })
            continue
          }

          // 2. Kassza oldal (befizetes sor)
          // NOT NULL: xkey, nyugta (legacy séma)
          const befPayload = {
            osszeg: absAmount,
            datum: item.date,
            id_befizetescel: item.categoryId ?? null,
            id_szemely: null,
            id_csalad: null,
            forrasa: 'Belső mozgás — bankból',
            iratszam: docNumber,
            nyugta: docNumber,
            irattipus: 'készpénz',
            bankszamla_id: null,
            belso_mozgas_xkey: xkey,
            megjegyzes: item.megjegyzes || item.description,
            deleted: false,
            congregation_id: congregationId,
            fizetettev: Number(item.date.slice(0, 4)),
            is_potlas: false,
            xkey: randomUUID(),
          }
          const { error: befErr } = await access.supabase.from('befizetes').insert([befPayload])
          if (befErr) {
            result.errors.push({ rowIndex: item.rowIndex, error: `Kassza oldal: ${befErr.message}` })
            continue
          }
        } else {
          // Kasszából bankba letétel → befizetes sor a bankban + kiadas sor a kasszából
          // NOT NULL: xkey, nyugta (legacy séma)
          const befPayload = {
            osszeg: absAmount,
            datum: item.date,
            id_befizetescel: item.categoryId ?? null,
            id_szemely: null,
            id_csalad: null,
            forrasa: 'Belső mozgás — kasszából',
            iratszam: docNumber,
            nyugta: docNumber,
            irattipus: 'banki',
            bankszamla_id: item.bankszamlaId,
            belso_mozgas_xkey: xkey,
            megjegyzes: item.megjegyzes || item.description,
            deleted: false,
            congregation_id: congregationId,
            fizetettev: Number(item.date.slice(0, 4)),
            is_potlas: false,
            xkey: randomUUID(),
          }
          const { error: befErr } = await access.supabase.from('befizetes').insert([befPayload])
          if (befErr) {
            result.errors.push({ rowIndex: item.rowIndex, error: `Bank oldal: ${befErr.message}` })
            continue
          }

          // Kassza oldal (kiadas)
          const canonical: Record<string, unknown> = {
            osszeg: absAmount,
            datum: item.date,
            id_kiadascel: item.categoryId ?? null,
            kedvezmenyzett: 'Belső mozgás — bankba',
            iratszam: docNumber,
            irattipus: 'készpénz',
            bankszamla_id: null,
            belso_mozgas_xkey: xkey,
            megjegyzes: item.megjegyzes || item.description,
            deleted: false,
            congregation_id: congregationId,
          }
          const reference: Record<string, unknown> = {
            ...canonical,
            nyugta: docNumber,
            xkey: randomUUID(),
            atvevo: 'Belső mozgás — bankba',
            atvevoid: null,
            userid: userId,
          }
          let ins = await access.supabase.from('kiadas').insert([reference])
          if (ins.error) ins = await access.supabase.from('kiadas').insert([canonical])
          if (ins.error) {
            result.errors.push({ rowIndex: item.rowIndex, error: `Kassza oldal: ${ins.error.message}` })
            continue
          }
        }

        // BM audit rekord (belsomozgas tábla)
        await access.supabase.from('belsomozgas').insert({
          congregation_id: congregationId,
          datum: item.date,
          tipus: bmTipus,
          osszeg: absAmount,
          forras: isBankToKassza ? String(item.bankszamlaId) : 'kassza',
          cel: isBankToKassza ? 'kassza' : String(item.bankszamlaId),
          megjegyzes: item.megjegyzes || item.description,
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
