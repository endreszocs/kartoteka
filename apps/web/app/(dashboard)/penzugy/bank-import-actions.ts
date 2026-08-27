'use server'

/**
 * Banki Excel import server action-ök — VÉKONY WRAPPER a @kartoteka/core fölé
 * (2026-06-12, Endre #4 bank-import).
 *
 * A teljes import-logika (duplikáció-védelem, valuta+árfolyam, bevétel /
 * kiadás / belső-mozgás ágak, aktív párosítás) átköltözött a
 * `packages/core/src/finance/bank-import/import-transactions.ts` use-case-be,
 * hogy a desktop (Tauri) PONTOSAN ugyanazt futtassa. Itt csak:
 *   - auth + gyülekezet-feloldás (getEffectiveAccessContext),
 *   - revalidatePath('/penzugy') a sikeres import után.
 *
 * A visszatérési alakok VÁLTOZATLANOK (a hívó wizard nem érzékel változást);
 * az `importedRows` mező additív bővítés (a desktop Excel-írásához).
 */

import { revalidatePath } from 'next/cache'

import {
  getLatestBankTransactionDateUseCase,
  importBankTransactionsUseCase,
  type BankImportItem,
  type BankImportResult,
} from '@kartoteka/core'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { fetchBnrRates } from '@/lib/finance/bnr-exchange-rate'

// Típus re-exportok — a meglévő import-helyek (pl. bcr-import-wizard-dialog)
// változatlanul működnek. (`export type` fordításkor törlődik, így a
// 'use server' szabályt — csak async function export — nem sérti.)
export type {
  BankImportItem,
  BankImportItemAction,
  BankImportResult,
  BankImportedRow,
} from '@kartoteka/core'

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

  return getLatestBankTransactionDateUseCase(
    { congregationId: access.effectiveCongregationId, bankszamlaId },
    { supabase: access.supabase, runtime: 'web', userId: access.user.id },
  )
}

/**
 * 2026-07-10 (ÚJ #10): deviza (nem-RON) számlákra menő tételekhez NAPI
 * árfolyam-map összegyűjtése (dátum → 1 deviza = X RON). A core use-case
 * platform-független, ezért az árfolyam-lekérés (fetchBnrRates) ITT, a web
 * rétegben történik. Csak EUR/HUF devizára van napi forrás (BNR/ECB) —
 * más devizánál, illetve lekérési hiba esetén a dátum KIMARAD a map-ből,
 * és a core a meglévő éves nyitó-árfolyamra esik vissza (+ figyelmeztetés).
 */
async function collectDailyRates(
  supabase: Parameters<typeof importBankTransactionsUseCase>[1]['supabase'],
  congregationId: string,
  items: BankImportItem[],
): Promise<{ dailyRates?: Record<string, number>; warnings: string[] }> {
  const warnings: string[] = []
  const activeItems = items.filter((i) => i.action !== 'skip')
  const uniqueBankIds = Array.from(new Set(activeItems.map((i) => i.bankszamlaId)))
  if (uniqueBankIds.length === 0) return { warnings }

  const { data: banksData } = await supabase
    .from('bankszamlak')
    .select('id, valuta')
    .in('id', uniqueBankIds)
    .eq('congregation_id', congregationId)
  const valutaMap = new Map<number, string>()
  for (const b of banksData || []) {
    valutaMap.set(b.id as number, ((b.valuta as string) || 'RON').toUpperCase())
  }

  const nonRonIds = uniqueBankIds.filter((id) => (valutaMap.get(id) || 'RON') !== 'RON')
  if (nonRonIds.length === 0) return { warnings }

  // A dailyRates kulcsa CSAK a dátum → egy import-menetben csak EGYFÉLE
  // deviza kezelhető napi árfolyammal. Több különböző deviza esetén
  // (gyakorlatban nem fordul elő: a wizard számlánként importál) marad
  // az éves fallback + figyelmeztetés.
  const currencies = Array.from(new Set(nonRonIds.map((id) => valutaMap.get(id) as string)))
  if (currencies.length > 1) {
    warnings.push(
      `Több különböző devizájú számla (${currencies.join(', ')}) egy importban — a napi árfolyam nem alkalmazható, az éves nyitó-árfolyam marad.`,
    )
    return { warnings }
  }
  const currency = currencies[0]
  if (currency !== 'EUR' && currency !== 'HUF') {
    warnings.push(
      `A(z) ${currency} devizához nincs napi árfolyam-forrás (csak EUR/HUF, BNR/ECB) — az éves nyitó-árfolyam marad.`,
    )
    return { warnings }
  }

  const nonRonIdSet = new Set(nonRonIds)
  const dates = Array.from(
    new Set(activeItems.filter((i) => nonRonIdSet.has(i.bankszamlaId)).map((i) => i.date)),
  ).sort()

  // Kis batch-ekben (max 3 párhuzamos) — ne terheljük burst-tel a BNR-t /
  // Frankfurtert; a fetchBnrRates cache-el (next revalidate), így az
  // ismétlődő évek/napok olcsók.
  const dailyRates: Record<string, number> = {}
  const BATCH_SIZE = 3
  for (let i = 0; i < dates.length; i += BATCH_SIZE) {
    const chunk = dates.slice(i, i + BATCH_SIZE)
    const chunkResults = await Promise.all(
      chunk.map(async (d) => ({ date: d, rates: await fetchBnrRates(d) })),
    )
    for (const { date, rates } of chunkResults) {
      const rate = currency === 'EUR' ? rates.eur : rates.huf
      if (rate != null && rate > 0) {
        dailyRates[date] = rate
      } else {
        // Kimarad a map-ből → a core éves árfolyam fallback-je él
        warnings.push(
          `${date}: nem érhető el napi ${currency} árfolyam${rates.error ? ` (${rates.error})` : ''} — éves nyitó-árfolyam fallback.`,
        )
      }
    }
  }

  return {
    dailyRates: Object.keys(dailyRates).length > 0 ? dailyRates : undefined,
    warnings,
  }
}

export async function importBcrTransactions(
  items: BankImportItem[],
  /**
   * 2026-08-27: a naplózáshoz. A banki import eddig EGYÁLTALÁN NEM írt az
   * `import_logs` táblába — élesben igazolva: egy 93 hibás sort produkáló
   * import után SEMMILYEN nyoma nem maradt a rendszerben, csak a felhasználó
   * képernyőképén. Opcionális, hogy a meglévő hívók változatlanul működjenek.
   */
  meta?: { fileName?: string },
): Promise<BankImportResult & { error?: string; warnings?: string[] }> {
  const access = await getEffectiveAccessContext()
  if (!access.user)
    return { totalItems: 0, imported: 0, skipped: 0, duplicates: 0, errors: [], importedRows: [], error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId)
    return { totalItems: 0, imported: 0, skipped: 0, duplicates: 0, errors: [], importedRows: [], error: 'Nincs aktív gyülekezet.' }

  // 2026-07-10 (S3-#3): véglegesített évbe a bank-import sem rögzíthet új tételt.
  // Az ÖSSZES nem-skip tétel évét ellenőrizzük a bealitas.accounting_finalized
  // ellen — VEGYES évek esetén a hibaüzenet pontosan megnevezi, melyik év zárt.
  const activeYears = Array.from(
    new Set(
      items
        .filter((i) => i.action !== 'skip')
        .map((i) => Number(String(i.date || '').slice(0, 4)))
        .filter((y) => Number.isFinite(y) && y >= 2000),
    ),
  )
  if (activeYears.length > 0) {
    const { data: lockRows, error: lockErr } = await access.supabase
      .from('bealitas')
      .select('id, accounting_finalized')
      .eq('congregation_id', access.effectiveCongregationId)
      .in('id', activeYears.map(String))
    // 2026-08-11 (5. kör, K5-#32 hibaosztály-lezárás): FAIL-CLOSED. Korábban az
    // `error` el lett dobva, és a `(lockRows || [])` üres tömb miatt a
    // `closedYears` üres lett — vagyis a zár-lekérdezés BÁRMILYEN hibája (RLS,
    // hálózat, séma-drift) NÉMÁN átengedte a teljes banki kivonat importját egy
    // már véglegesített ÉS az egyházmegyének beküldött évbe. Ha a zárat nem
    // tudjuk ellenőrizni, NEM importálunk.
    if (lockErr) {
      return {
        totalItems: items.length,
        imported: 0,
        skipped: 0,
        duplicates: 0,
        errors: [],
        importedRows: [],
        error:
          `Nem sikerült ellenőrizni, hogy az importban szereplő év(ek) számadása véglegesítve ` +
          `van-e (${lockErr.message}), ezért az importot biztonságból megszakítottuk — egy már ` +
          'lezárt évet nem nyithatunk ki véletlenül. Ellenőrizd az internetkapcsolatot, és ' +
          'próbáld újra; ha újra hibázik, jelezd a rendszergazdának.',
      }
    }
    const closedYears = ((lockRows || []) as Array<{ id: string; accounting_finalized: boolean | null }>)
      .filter((r) => r.accounting_finalized)
      .map((r) => Number(r.id))
      .sort((a, b) => a - b)
    if (closedYears.length > 0) {
      return {
        totalItems: items.length,
        imported: 0,
        skipped: 0,
        duplicates: 0,
        errors: [],
        importedRows: [],
        error: `A ${closedYears.join(', ')}. évi számadás már véglegesítve van — az importban ilyen évre eső tétel van, ezért az import blokkolva. Először kérj javítási engedélyt az egyházmegyétől (feloldás), utána próbáld újra.`,
      }
    }
  }

  // 2026-07-10 (ÚJ #10): napi árfolyamok deviza-számlákhoz (RON-only
  // importnál üres map + üres warnings → viselkedés változatlan).
  const { dailyRates, warnings } = await collectDailyRates(
    access.supabase,
    access.effectiveCongregationId,
    items,
  )

  const result = await importBankTransactionsUseCase(
    { congregationId: access.effectiveCongregationId, items, dailyRates },
    { supabase: access.supabase, runtime: 'web', userId: access.user.id },
  )

  revalidatePath('/penzugy')

  // ── NAPLÓZÁS (2026-08-27) ────────────────────────────────────────────────
  // A banki import eddig nyomtalan volt: a 2026-08-27-i, 93 hibás sort adó
  // futásnak SEMMILYEN bejegyzése nem maradt az `import_logs`-ban. Egy import,
  // ami tömegesen bukik, de nem hagy nyomot, utólag nem vizsgálható ki —
  // se azt nem tudjuk, mi ment be, se azt, min bukott el.
  const naplozasHibak: string[] = []
  try {
    const { logImportRun } = await import('@/lib/import/import-log')
    await logImportRun({
      supabase: access.supabase,
      congregationId: access.effectiveCongregationId,
      userId: access.user.id,
      module: 'finance',
      fileName: meta?.fileName || 'banki kivonat',
      totalInserted: result.imported,
      // A `duplicates` NEM hiba: a duplikáció-védelem szándékosan hagyta ki.
      // Egy kalap alá venni a `skipped`-del elmosná, mi miért maradt ki.
      totalSkipped: result.skipped + result.duplicates,
      perSheetLog: [
        { sheet: 'bank', profile: 'bcr', inserted: result.imported, skipped: result.skipped },
      ],
      lookupStats: {
        personResolved: 0,
        personUnresolved: 0,
        categoryResolved: 0,
        categoryUnresolved: 0,
        warnings: [
          `Duplikátumként kihagyva: ${result.duplicates} tétel.`,
          `Felhasználó által kihagyva: ${result.skipped} tétel.`,
          ...warnings.slice(0, 20),
        ],
      },
      errors: result.errors.slice(0, 200).map((e) => ({
        sheet: 'bank',
        row: e.rowIndex,
        message: e.error,
      })),
    })
  } catch (e) {
    // Nem némítjuk el, de az importot SEM buktatjuk el miatta: a tételek már
    // bent vannak. (Az `import_logs_insert` policy WITH CHECK-je a hívó saját
    // gyülekezetéhez köti a sort, ezért admin-hatókörű importnál elbukhat.)
    console.warn('[importBcrTransactions] Import log rögzítése sikertelen:', e)
    naplozasHibak.push(
      'Az import NAPLÓZÁSA nem sikerült (az import maga lefutott). Ha másik gyülekezetbe ' +
      'importáltál rendszergazdaként, ez az import_logs jogosultsági szabályának ismert korlátja.',
    )
  }

  const osszesFigyelmeztetes = [...warnings, ...naplozasHibak]
  return osszesFigyelmeztetes.length > 0
    ? { ...result, warnings: osszesFigyelmeztetes }
    : result
}
