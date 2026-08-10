/**
 * Év-zár (számadás-véglegesítés) őr — 2026-08-11 (5. kör, P1 adat-integritás).
 *
 * ELŐZMÉNY / HIBA: a web `apps/web/app/(dashboard)/penzugy/actions.ts` már
 * 2026-07-10 óta minden befizetés/kiadás INSERT előtt lefuttatja az
 * `assertYearsNotFinalizedForCreate`-et („a véglegesítés + beküldés UTÁN is
 * lehetett új tételt rögzíteni, és a beküldött snapshot csendben elévült").
 * A desktop viszont a core `saveIncomeUseCase` / `saveExpenseUseCase` /
 * `saveInternalTransferUseCase` use-case-eket hívja KÖZVETLENÜL, és azokban
 * SEMMILYEN év-zár nem volt — a `bealitas` szó elő sem fordult bennük. Vagyis a
 * lelkész a webről véglegesítette és beküldte a 2026-os számadást, majd a Tauri
 * asztali kliensről még rögzített egy Chitanțăt: a sor bekerült a `befizetes`
 * táblába, az egyházmegyének elküldött snapshot pedig némán elavult. (Ugyanennek
 * a sornak a STORNÓZÁSA blokkolva volt — csak a LÉTREHOZÁSA nem.)
 *
 * Ez a modul a `bealitas.accounting_finalized` olvasásának egyetlen közös
 * helye a core-ban. A `bealitas.id` VARCHAR — az év stringként (pl. "2026") —,
 * a sor kulcsa (id, congregation_id).
 *
 * ── FAIL-CLOSED DÖNTÉS ────────────────────────────────────────────────────
 * Ha a `bealitas` olvasása HIBÁRA fut (RLS, hálózat, séma-drift), NEM engedjük
 * át a mentést, hanem hangos, újrapróbálható magyar hibaüzenetet adunk. A néma
 * átengedés pont azt a hibaosztályt hozná vissza, amit ez a javítás megszüntet
 * (beküldött, aláírt számadás ⇄ adatbázis széthúzása). A `bealitas` olvashatósága
 * amúgy is alapkövetelmény: a Költségvetés, a Számadás és a desktop
 * `pullFinanceSettings` is ebből a táblából dolgozik.
 *
 * ── OFFLINE ──────────────────────────────────────────────────────────────
 * Offline (desktop) ágon nincs Supabase-kapcsolat, ezért a use-case-ek az
 * opcionális `isYearFinalizedLocal(congregationId, year)` backend-hookot hívják,
 * ami a lokális `bealitas_local` tükörből (apps/desktop/src/lib/
 * finance-settings-sync.ts) tud válaszolni. Szabály:
 *   - a hook true-t ad  → a mentést MEGTAGADJUK (lokálisan tudjuk, hogy zárt év),
 *   - a hook false-t ad  → mehet,
 *   - a hook nincs implementálva vagy dob → átengedjük, mert máskülönben az
 *     offline rögzítés teljesen használhatatlanná válna olyan gyülekezeteknél,
 *     ahol a tükör még nem szinkronizálódott. Ezt TUDATOSAN vállaljuk; a
 *     maradék kockázatot a szerver-oldali RLS/zár nem fedi le, ezért a
 *     desktop-backendnek érdemes a hookot implementálnia.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** A zárt évre próbált ÚJ tétel egységes, lelkész-barát hibaüzenete. */
export function yearFinalizedCreateError(year: number): string {
  return (
    `A ${year}. évi számadás már véglegesítve (és beküldve) van, ezért ebbe az évbe ` +
    'új tétel nem rögzíthető. Kérj feloldást (javítási engedélyt) az egyházmegyétől, ' +
    'és csak a jóváhagyás után rögzítsd.'
  )
}

/** Az ellenőrzés eredménye: `null` = mehet, string = elutasító hibaüzenet. */
export type YearLockError = string | null

/**
 * Egy év számadása véglegesítve van-e. Fail-closed: olvasási hiba esetén
 * `unknown: true` jön vissza, amit a hívó elutasításként kezel.
 */
export async function readYearFinalized(
  supabase: SupabaseClient,
  congregationId: string,
  year: number,
): Promise<{ finalized: boolean; unknown?: boolean; errorMessage?: string }> {
  const { data, error } = await supabase
    .from('bealitas')
    .select('accounting_finalized')
    .eq('congregation_id', congregationId)
    .eq('id', String(year))
    .maybeSingle()

  if (error) {
    return { finalized: false, unknown: true, errorMessage: error.message }
  }
  // Nincs sor az évre → még nincs beállítás, tehát nincs is véglegesítés.
  if (!data) return { finalized: false }
  return {
    finalized: Boolean((data as { accounting_finalized?: boolean | null }).accounting_finalized),
  }
}

/**
 * ONLINE őr új tétel (befizetés / kiadás / belső mozgás) rögzítése előtt.
 *
 * @param dates a tétel(ek) dátuma(i) — `YYYY-MM-DD` vagy ISO timestamp.
 * @returns `null`, ha rögzíthető; egyébként a magyar hibaüzenet.
 */
export async function assertYearsNotFinalizedForCreate(
  supabase: SupabaseClient,
  congregationId: string,
  dates: Array<string | null | undefined>,
): Promise<YearLockError> {
  const years = new Set<number>()
  for (const d of dates) {
    // A `slice(0,4)` a 'YYYY-MM-DD' és a 'YYYY-MM-DDTHH:MM:SS' alakot is fedi.
    const y = Number(String(d || '').slice(0, 4))
    if (Number.isFinite(y) && y >= 2000) years.add(y)
  }
  if (years.size === 0) return null

  for (const year of years) {
    const res = await readYearFinalized(supabase, congregationId, year)
    if (res.unknown) {
      return (
        `Nem sikerült ellenőrizni, hogy a ${year}. évi számadás véglegesítve van-e ` +
        `(${res.errorMessage || 'ismeretlen hiba'}), ezért a rögzítést biztonságból ` +
        'megszakítottuk. Ellenőrizd az internetkapcsolatot, és próbáld újra.'
      )
    }
    if (res.finalized) return yearFinalizedCreateError(year)
  }
  return null
}

/**
 * OFFLINE őr — a lokális (tükrözött) zár-állapot alapján. Lásd a fájl elején a
 * fail-open indoklást arra az esetre, ha a hook nincs implementálva.
 */
export async function assertYearNotFinalizedOffline(
  isYearFinalizedLocal:
    | ((congregationId: string, year: number) => Promise<boolean>)
    | undefined,
  congregationId: string,
  year: number,
): Promise<YearLockError> {
  if (!isYearFinalizedLocal) return null
  try {
    const finalized = await isYearFinalizedLocal(congregationId, year)
    if (finalized) {
      return (
        `A ${year}. évi számadás a legutóbbi szinkronizáció szerint már véglegesítve ` +
        'van, ezért offline sem rögzíthető ebbe az évbe új tétel. Kérj feloldást ' +
        '(javítási engedélyt) az egyházmegyétől.'
      )
    }
  } catch {
    // A lokális tükör nem olvasható — nem tudjuk eldönteni, átengedjük (lásd docblock).
    return null
  }
  return null
}
