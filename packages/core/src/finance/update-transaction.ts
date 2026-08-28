/**
 * updateTransactionUseCase + isLastTransactionOfTypeUseCase — C-hullám C1c (2026-06-10).
 *
 * A web `updateTransactionBasic` / `isLastTransactionOfType`
 * (apps/web/app/(dashboard)/penzugy/edit-storno-actions.ts) PONTOS tükre a
 * gyülekezeti (congregation) scope-ra — hogy az asztali Kassza-fül szerkesztője
 * azonosan viselkedjen a webbel.
 *
 * Szerkeszthető mezők (a Kassza-fül gyors szerkesztője): dátum, összeg, jogcím
 * (kategória), iratszám, megjegyzés. (Partner — személy/család — itt NEM; ahhoz
 * a webbel egyezően stornózni + újrarögzíteni kell.)
 *
 * Védelmek (mint a web):
 *   - DÁTUM csak az éven belüli UTOLSÓ (azonos típusú) tételnél módosítható
 *     (kronológia + iratszám-sorrend védelme) → `isLastTransactionOfTypeUseCase`.
 *   - Véglegesített (számadás lezárva) évre a módosítás blokkolva.
 *   - Belső mozgás (kassza↔bank) sor NEM szerkeszthető — a hívó (CashbookTab)
 *     a szerkesztés gombot eleve elrejti a `isBm` soroknál.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { refreshCarryoverBestEffort } from './bank-import/nyito-egyenleg'
import { readYearFinalized } from './year-lock'

export type UpdateTransactionType = 'befizetes' | 'kiadas'

export interface UpdateTransactionInput {
  congregationId: string
  type: UpdateTransactionType
  id: number
  /** Csak akkor küldd, ha módosítható (az év utolsó tétele) — egyébként marad. */
  datum?: string
  osszeg?: number
  /**
   * P0-6 (audit 2026-08-28): devizás sor RON-ekvivalense és árfolyama.
   * Ha a hívó nem küldi, az összeg módosításakor a use-case a sor TÁROLT
   * árfolyamából számolja újra az osszeg_ron-t — enélkül az egyenleg a
   * régi átváltott értéken maradt.
   */
  osszeg_ron?: number | null
  arfolyam?: number | null
  megjegyzes?: string | null
  /** Jogcím: befizetes → id_befizetescel, kiadas → id_kiadascel. */
  id_cel?: number | null
  iratszam?: string | null
  /** Csak befizetésnél értelmezett (partner-mezők — a Kassza szerkesztő nem küldi). */
  id_szemely?: number | null
  id_csalad?: number | null
  forrasa?: string | null
}

export interface UpdateTransactionCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  userId: string
}

export type UpdateTransactionResult =
  | { success: true }
  | {
      success: false
      error: string
      /** Az év számadása véglegesítve — blokkolva. */
      yearFinalized?: boolean
      /** Nem adtál meg módosítandó mezőt. */
      noChange?: boolean
    }

// 2026-08-11 (5. kör, P0 zárás-integritás): itt egy SAJÁT `isYearFinalized`
// helper állt, ugyanazzal a fail-OPEN hibával, mint a testvér-fájlokban:
//   const { data } = await supabase.from('bealitas')…;  if (!data) return false
// Az `error` EL LETT DOBVA, a `false` viszont azt jelenti, hogy „az év NINCS
// véglegesítve" — vagyis a lekérdezés BÁRMILYEN hibája (RLS-szigorítás,
// oszlop-átnevezés, kettőzött `bealitas` sor → maybeSingle-hiba, hálózati hiba)
// NÉMÁN ENGEDÉLYEZTE a már véglegesített ÉS az egyházmegyének beküldött év
// tételeinek átírását. Zárás-integritási kapunál a fail-OPEN a lehető
// legrosszabb alapértelmezés: a beküldött, aláírt számadás és az adatbázis
// csendben széthúz, és ezt senki nem veszi észre.
//
// Javítás: a közös, FAIL-CLOSED `readYearFinalized` (./year-lock) használata.
// Az „nincs `bealitas` sor erre az évre" NEM hiba (`maybeSingle` ilyenkor
// `data: null, error: null`) — az évet még nem konfigurálták, tehát tényleg
// nincs véglegesítve → `finalized: false`. Csak a VALÓDI lekérdezési hiba jön
// vissza `unknown: true`-val, és azt elutasításként kezeljük.

// ─────────────────────────────────────────────────────────────────────────
// isLastTransactionOfTypeUseCase — a dátum-szerkeszthetőség eldöntéséhez
// ─────────────────────────────────────────────────────────────────────────

export interface IsLastTransactionInput {
  congregationId: string
  type: UpdateTransactionType
  id: number
}

export interface IsLastTransactionCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type IsLastTransactionResult = { isLast: boolean; error?: string }

/**
 * Megmondja, hogy a tétel az ADOTT TÍPUSÚ utolsó-e az évében + gyülekezetben.
 * A dátum-szerkesztést csak az utolsó tételre engedjük — köztes dátum
 * elrontaná a kronológiát és a nyugtaszámozást.
 */
export async function isLastTransactionOfTypeUseCase(
  input: IsLastTransactionInput,
  ctx: IsLastTransactionCtx,
): Promise<IsLastTransactionResult> {
  if (input.type !== 'befizetes' && input.type !== 'kiadas') {
    return { isLast: false, error: 'Érvénytelen tétel-típus.' }
  }
  const table = input.type === 'befizetes' ? 'befizetes' : 'kiadas'

  try {
    const { data: current, error: currentErr } = await ctx.supabase
      .from(table)
      .select('datum')
      .eq('id', input.id)
      .eq('congregation_id', input.congregationId)
      .maybeSingle()

    // 2026-08-11 (5. kör, K5-#32 testvér-vizsgálat): a hiba korábban elveszett
    // (`const { data: current } = …`); a `!datum` ág `isLast: false`-t adott, ami
    // a szigorúbb irány, de némán. Most kimondjuk.
    if (currentErr) {
      return { isLast: false, error: `A tétel dátumát nem sikerült lekérdezni: ${currentErr.message}` }
    }

    const datum = (current as { datum?: string } | null)?.datum
    if (!datum) return { isLast: false }

    const year = new Date(datum).getFullYear()
    const yearStart = `${year}-01-01`
    // P0-2 (audit 2026-08-28): KIZÁRÓ felső határ — a kiadas.datum TIMESTAMP,
    // az inkluzív '12-31' ott éjfélt jelentene. DATE-oszlopon ekvivalens.
    const yearEnd = `${year + 1}-01-01`

    const { data: later, error: laterErr } = await ctx.supabase
      .from(table)
      .select('id')
      .eq('congregation_id', input.congregationId)
      .eq('deleted', false)
      .gt('datum', datum)
      .lt('datum', yearEnd)
      .gte('datum', yearStart)
      .limit(1)

    // 2026-08-11 (5. kör): FAIL-OPEN VOLT — az `error` eldobva, és egy hibás
    // lekérdezésre (`later === null`) a `!later || later.length === 0` kifejezés
    // `isLast: true`-t adott, vagyis a UI pont akkor engedte volna a DÁTUM
    // átírását, amikor nem tudtuk ellenőrizni, van-e későbbi tétel az évben.
    // Köztes dátum átírása pont a védett dolgot rontja el: a kronológiát és a
    // nyugtaszám-sorrendet. Fail-closed: ha nem tudjuk, nem engedjük.
    if (laterErr) {
      return {
        isLast: false,
        error:
          `Nem sikerült ellenőrizni, hogy ez a tétel az év utolsó tétele-e ` +
          `(${laterErr.message}), ezért a dátum most biztonságból nem módosítható. ` +
          'Próbáld újra néhány perc múlva; a többi mező szerkesztése ettől független.',
      }
    }

    return { isLast: !later || later.length === 0 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { isLast: false, error: `Ellenőrzési hiba: ${msg}` }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// updateTransactionUseCase — a tényleges módosítás
// ─────────────────────────────────────────────────────────────────────────

export async function updateTransactionUseCase(
  input: UpdateTransactionInput,
  ctx: UpdateTransactionCtx,
): Promise<UpdateTransactionResult> {
  // Alap-validálás
  if (!input.congregationId || typeof input.congregationId !== 'string') {
    return { success: false, error: 'Hiányzó gyülekezet-azonosító.' }
  }
  if (input.type !== 'befizetes' && input.type !== 'kiadas') {
    return { success: false, error: 'Érvénytelen tétel-típus.' }
  }
  if (!Number.isInteger(input.id) || input.id <= 0) {
    return { success: false, error: 'Érvénytelen tétel-azonosító.' }
  }
  if (input.osszeg !== undefined && (!Number.isFinite(input.osszeg) || input.osszeg <= 0)) {
    return { success: false, error: 'Az összeg pozitív szám legyen.' }
  }

  const table = input.type === 'befizetes' ? 'befizetes' : 'kiadas'
  const nowIso = new Date().toISOString()

  // 2026-08-11 (5. kör, P0 adat-integritás): HIBA VOLT — ez az ellenőrzés csak
  // az `if (input.datum)` ágon belül futott, a Kassza-fül szerkesztője viszont
  // SZÁNDÉKOSAN nem küld dátumot, ha a tétel nem az év utolsó tétele. Vagyis
  // véglegesített évben az összeg / jogcím / iratszám némán átírható volt.
  // (Ugyanaz a hiba, mint a web `updateTransactionBasic`-ben — ott is javítva.)
  // Javítás: a tétel JELENLEGI dátumát mindig kiolvassuk, és MINDEN update-nél
  // ellenőrzünk; ha új dátum is jön, a régi ÉS az új évre is.
  const { data: currentRow, error: currentErr } = await ctx.supabase
    .from(table)
    .select('datum, bankszamla_id, arfolyam, belso_mozgas_xkey')
    .eq('id', input.id)
    .eq('congregation_id', input.congregationId)
    .maybeSingle()

  if (currentErr) {
    return { success: false, error: `A tétel ellenőrzése nem sikerült: ${currentErr.message}` }
  }
  if (!currentRow) {
    return { success: false, error: 'A tétel nem található.' }
  }

  // P0-7 (audit 2026-08-28, a web 2026-08-27-i kapujának paritása): a belső
  // mozgás KÉT sor közös kulccsal — egyetlen láb átírása szétcsúsztatná a
  // párt, és mindkét láb hamis „párosítatlan" riasztást kapna. A felületen a
  // ceruza rejtve van, de ez a use-case a desktopról közvetlenül hívható volt.
  const bmXkeyEdit = (currentRow as { belso_mozgas_xkey?: string | null }).belso_mozgas_xkey
  if (bmXkeyEdit) {
    return {
      success: false,
      error:
        'Ez a tétel egy kassza ↔ bank átvezetés része, ezért külön nem szerkeszthető — ' +
        'a párja némán elcsúszna tőle. Töröld az átvezetést (a rendszer mindkét oldalát ' +
        'törli), és rögzítsd újra a helyes adatokkal.',
    }
  }

  const yearsToCheck = new Set<number>()
  const currentDatum = (currentRow as { datum?: string | null }).datum
  if (currentDatum) {
    const y = new Date(currentDatum).getFullYear()
    if (Number.isFinite(y)) yearsToCheck.add(y)
  }
  if (input.datum) {
    const y = new Date(input.datum).getFullYear()
    if (Number.isFinite(y)) yearsToCheck.add(y)
  }

  for (const year of yearsToCheck) {
    const lock = await readYearFinalized(ctx.supabase, input.congregationId, year)
    // 2026-08-11: fail-CLOSED — ha a zár-állapot NEM olvasható, nem módosítunk.
    if (lock.unknown) {
      return {
        success: false,
        error:
          `A ${year}. évi számadás zárás-állapotát most nem sikerült ellenőrizni ` +
          `(${lock.errorMessage || 'ismeretlen hiba'}), ezért a módosítást biztonságból ` +
          'megszakítottuk — egy már lezárt évet nem nyithatunk ki véletlenül. Ellenőrizd ' +
          'az internetkapcsolatot, és próbáld újra; ha újra hibázik, jelezd a rendszergazdának.',
      }
    }
    if (lock.finalized) {
      return {
        success: false,
        error: `A ${year}. évi számadás már véglegesítve (és beküldve) van, ezért ez a tétel nem módosítható. Kérj feloldást (javítási engedélyt) az egyházmegyétől.`,
        yearFinalized: true,
      }
    }
  }

  // Csak a megadott mezőket írjuk
  const updateData: Record<string, unknown> = {}
  if (input.datum !== undefined) updateData.datum = input.datum
  if (input.osszeg !== undefined) updateData.osszeg = input.osszeg
  // P0-6 (audit 2026-08-28): devizás (árfolyamos) soron az összeg módosítása a
  // RON-ekvivalenst is frissíti — enélkül az egyenleg és a totál (amely az
  // osszeg_ron-t olvassa) a RÉGI átváltott értéken maradt. Az explicit hívói
  // érték elsőbbséget élvez (a web S11-es útjának paritása).
  if (input.osszeg_ron !== undefined) updateData.osszeg_ron = input.osszeg_ron
  if (input.arfolyam !== undefined) updateData.arfolyam = input.arfolyam
  if (
    input.osszeg !== undefined &&
    input.osszeg_ron === undefined &&
    input.arfolyam === undefined
  ) {
    const aktArfolyam = Number((currentRow as { arfolyam?: number | null }).arfolyam)
    if (Number.isFinite(aktArfolyam) && aktArfolyam > 0) {
      updateData.osszeg_ron = Math.round(input.osszeg * aktArfolyam * 100) / 100
    }
  }
  if (input.megjegyzes !== undefined) updateData.megjegyzes = input.megjegyzes?.trim() || null
  if (input.iratszam !== undefined) updateData.iratszam = input.iratszam?.trim() || null
  if (input.id_cel !== undefined) {
    if (input.type === 'befizetes') updateData.id_befizetescel = input.id_cel
    else updateData.id_kiadascel = input.id_cel
  }
  // Partner-mezők csak befizetésnél (a Kassza szerkesztő nem küldi, de a use-case támogatja)
  if (input.type === 'befizetes') {
    if (input.id_szemely !== undefined) updateData.id_szemely = input.id_szemely
    if (input.id_csalad !== undefined) updateData.id_csalad = input.id_csalad
    if (input.forrasa !== undefined) updateData.forrasa = input.forrasa?.trim() || null
  }
  updateData.updated_at = nowIso

  // Ha csak az updated_at van → nincs valódi módosítás
  if (Object.keys(updateData).length === 1) {
    return { success: false, error: 'Nem adtál meg módosítandó mezőt.', noChange: true }
  }

  try {
    const { error } = await ctx.supabase
      .from(table)
      .update(updateData)
      .eq('id', input.id)
      .eq('congregation_id', input.congregationId)

    if (error) {
      return { success: false, error: `Mentés sikertelen: ${error.message}` }
    }

    // P0-3 (audit 2026-08-28): carryover-frissítés (best-effort) — a régi ÉS
    // az új dátum évére (átdatálásnál mindkét év nyitója érintett lehet).
    const rowBankszamlaId =
      (currentRow as { bankszamla_id?: number | null }).bankszamla_id ?? null
    await refreshCarryoverBestEffort(
      {
        congregationId: input.congregationId,
        tetelek: [
          { bankszamla_id: rowBankszamlaId, datum: currentDatum },
          { bankszamla_id: rowBankszamlaId, datum: input.datum ?? currentDatum },
        ],
      },
      ctx,
    )

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Mentési hiba: ${msg}` }
  }
}
