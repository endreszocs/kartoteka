/**
 * Költségvetés-kompatibilitási réteg (load/save, oszlopnév-fallbackokkal).
 *
 * 2026-06-11 (desktop paritás #5): az `apps/web/lib/finance/budget-compat.ts`
 * tartalma VÁLTOZTATÁS NÉLKÜL ide költözött, hogy a desktop BudgetTab-wrapper
 * is ugyanezt a logikát használja (a web fájl re-export shim lett). A
 * `koltsegvetes` tábla történeti oszlopnév-változatait (tervezett/osszeg,
 * modositott/osszeg_modositott) próbálkozó SELECT/INSERT/UPDATE kezeli.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A költségvetés-mentés HÁROM hatóköre.
 *
 * ⚠️ EZ A TÍPUS A KANONIKUS `FinanceScope` TÜKRE
 * ──────────────────────────────────────────────
 * A kanonikus forrás: `apps/web/lib/auth/finance-scope-core.ts` →
 * `export type FinanceScope = 'congregation' | 'diocese' | 'district'`.
 * ONNAN NEM IMPORTÁLHATÓ IDE: a `packages/core` a függőségi láncban a
 * `apps/web` ALATT van (a web importál a magból, sosem fordítva), és a
 * desktop (`apps/desktop`) is ugyanezt a magot használja — egy web-irányú
 * import mindkettőt megtörné. Ezért ez a saját unió a kanonikus típus
 * KÉZI TÜKRE.
 *
 * ⇒ HA A KANONIKUS TÍPUS BŐVÜL, EZT IS BŐVÍTSD. A `felsoSzintTerv()`
 *   exhaustive switch-e miatt a bővítés UTÁN itt FORDÍTÁSI HIBA lesz, amíg
 *   az új szint tábla-ága be nem kerül — pontosan ezért van az a kapu.
 */
export type BudgetCompatScope = 'congregation' | 'diocese' | 'district'

/**
 * A FELSŐBB SZINTEK (egyházmegye, egyházkerület) költségvetés-táblája.
 *
 * A gyülekezeti `koltsegvetes` táblától mindkettő ELTÉR: `eve` (int) év-oszlop,
 * `tervezett` + `osszeg_mod_1..3` értékoszlopok, kompozit PK
 * (`<scope>_id, eve, szamadasicelid`). Egymásnak viszont BETŰHŰ TÜKREI
 * (migration-docs/sql/2026-08-17-egyhazkeruleti-S5b-penzugy-tablak.sql:688),
 * ezért egy leírás elég: csak a tábla neve és a szűrő-oszlop tér el.
 */
interface FelsoSzintTerv {
  tabla: 'diocese_koltsegvetes' | 'district_koltsegvetes'
  scopeCol: 'diocese_id' | 'district_id'
}

/**
 * Melyik felsőbb szintű táblára megy a művelet? `null` = gyülekezeti ág.
 *
 * ⛔ EXHAUSTIVE SWITCH — NE ÍRD VISSZA `if`-RE. A függvény 2026-08-17 előtt így
 *    nézett ki mindhárom hívóban:
 *
 *        if (scope === 'diocese') { …megyei tábla… }
 *        …gyülekezeti tábla…        // ← a „minden más" ág
 *
 *    Ez NÉMA ADATVESZTÉS-CSAPDA: amikor a hatókör-unió harmadik értéket kapott
 *    (`'district'`), a fordító EGY SZÓT SEM SZÓLT, és az egyházkerület
 *    költségvetése `congregation_id = <kerület UUID>` sorokként landolt volna a
 *    GYÜLEKEZETI `koltsegvetes` táblában — hibaüzenet nélkül, aláírt hivatalos
 *    terv rossz könyvben. (Emiatt volt a kerületi mentés a
 *    `penzugy/actions.ts`-ben fail-closed letiltva.)
 *
 *    Mostantól a `default` ág `never`-értékadása FORDÍTÁSI HIBÁT ad, ha a
 *    `BudgetCompatScope` negyedik szinttel bővül és ide nem kerül `case`.
 *    Fordítási hiba > néma adatvesztés. A `default` ág NEM fölösleges kód:
 *    az a fordítói kapu maga.
 */
function felsoSzintTerv(scope: BudgetCompatScope): FelsoSzintTerv | null {
  switch (scope) {
    // ── EGYHÁZMEGYE (2026-04-18) ────────────────────────────────────────────
    // ⚠️ Élesben futó ág — a tábla/oszlop nevek BYTE-RA változatlanok.
    case 'diocese':
      return { tabla: 'diocese_koltsegvetes', scopeCol: 'diocese_id' }

    // ── EGYHÁZKERÜLET (2026-08-17, kerületi S5 / K2 döntés) ─────────────────
    // A kerület ugyanúgy vezet saját könyvet, mint a megye; a
    // `district_koltsegvetes` a `diocese_koltsegvetes` betűhű tükre
    // (azonos oszlopnevek, PK: district_id, eve, szamadasicelid).
    case 'district':
      return { tabla: 'district_koltsegvetes', scopeCol: 'district_id' }

    // ── GYÜLEKEZET ──────────────────────────────────────────────────────────
    // NEVESÍTETT ág: korábban ez volt a függvény „minden más" visszatérése,
    // pontosan ezért nem eshet rá többé véletlenül egy új szint.
    case 'congregation':
      return null

    default: {
      const _nemLehet: never = scope
      throw new Error(`Ismeretlen költségvetési hatókör: ${String(_nemLehet)}`)
    }
  }
}

export interface BudgetCompatRow {
  szamadasicelid: string
  tervezett: number
  modositott: number | null
  mod2: number | null
  mod3: number | null
}

function isMissingColumnError(message?: string) {
  const lower = message?.toLowerCase() || ''
  return (
    lower.includes('column') ||
    lower.includes('schema cache') ||
    lower.includes('could not find') ||
    lower.includes('does not exist')
  )
}

type RawRow = {
  szamadasicelid: string
  tervezett?: number | null
  modositott?: number | null
  osszeg?: number | null
  osszeg_modositott?: number | null
  osszeg_mod_2?: number | null
  osszeg_mod_3?: number | null
}

function normalizeBudgetRow(row: RawRow): BudgetCompatRow {
  return {
    szamadasicelid: row.szamadasicelid,
    tervezett: Number(row.tervezett ?? row.osszeg ?? 0),
    modositott: row.modositott ?? row.osszeg_modositott ?? null,
    mod2: row.osszeg_mod_2 ?? null,
    mod3: row.osszeg_mod_3 ?? null,
  }
}

export async function loadBudgetRowsCompat(
  supabase: SupabaseClient,
  year: number,
  scopeId: string,
  scope: BudgetCompatScope = 'congregation',
) {
  // 2026-04-18 SCOPE-AWARE: megyei módban a diocese_koltsegvetes táblára fut.
  // 2026-08-17 (kerületi S5): ugyanez a kerületi district_koltsegvetes-re — a
  // két tábla oszlopkészlete azonos, ezért EGY ág szolgálja ki mindkettőt.
  const felso = felsoSzintTerv(scope)
  if (felso) {
    const { data, error } = await supabase
      .from(felso.tabla)
      .select('szamadasicelid, tervezett, osszeg_mod_1, osszeg_mod_2, osszeg_mod_3')
      .eq('eve', year)
      .eq(felso.scopeCol, scopeId)
    if (error) throw error
    return (data || []).map((r) => ({
      szamadasicelid: r.szamadasicelid as string,
      tervezett: Number(r.tervezett ?? 0),
      modositott: r.osszeg_mod_1 ?? null,
      mod2: r.osszeg_mod_2 ?? null,
      mod3: r.osszeg_mod_3 ?? null,
    }))
  }

  // Congregation path (eredeti logika)
  const congregationId = scopeId
  // Próbáljuk a teljes oszlopkészlettel (canonical + mod oszlopok)
  // 2026-08-30: a VALÓDI oszlopnevekkel kezdünk. A `tervezett`/`modositott` a
  // gyülekezeti `koltsegvetes` táblán SOHA nem létezett (azok a FELSŐ SZINTŰ táblák
  // oszlopai) — a régi sorrend minden betöltésnél egy fölösleges 400-as kört futtatott,
  // ami a böngésző konzoljában riasztónak látszott.
  let result: {
    data: RawRow[] | null
    error: Error | null
  } = await supabase
    .from('koltsegvetes')
    .select('szamadasicelid, osszeg, osszeg_modositott, osszeg_mod_2, osszeg_mod_3')
    .eq('bealitasid', String(year))
    .eq('congregation_id', congregationId)

  if (result.error && isMissingColumnError(result.error.message)) {
    // Fallback: a felső szintű elnevezés (eltérő sémájú környezetekhez)
    result = await supabase
      .from('koltsegvetes')
      .select('szamadasicelid, tervezett, modositott, osszeg_mod_2, osszeg_mod_3')
      .eq('bealitasid', String(year))
      .eq('congregation_id', congregationId)
  }

  if (result.error && isMissingColumnError(result.error.message)) {
    // Minimális fallback
    result = await supabase
      .from('koltsegvetes')
      .select('szamadasicelid, osszeg, osszeg_modositott')
      .eq('bealitasid', String(year))
      .eq('congregation_id', congregationId)
  }

  if (result.error) throw result.error
  return (result.data || []).map(normalizeBudgetRow)
}

/** Egész lejre kerekít — a gyülekezeti terv-oszlopok INTEGER típusúak. */
function egeszre(ertek: number | null | undefined): number {
  const n = Number(ertek)
  return Number.isFinite(n) ? Math.round(n) : 0
}

/**
 * A kihagyott (kinullázott) sorok takarítása a BESZÚRÁS UTÁN — fail-safe: ha ez a
 * lépés elakad, az érdemi adat MÁR bent van, legfeljebb néhány fölösleges sor marad.
 *
 * ⚠️ DARAB-olva törlünk: a `.in()` szűrő ~100 azonosító fölött 414-be fut (a proxy
 * eldobja a hosszú URL-t) — a repó visszatérő hibaosztálya.
 */
const TAKARITAS_DARAB = 80
async function takaritsFolosleges(
  supabase: SupabaseClient,
  tabla: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  szurok: (q: any) => any,
  megtartandok: string[],
): Promise<void> {
  // ⛔ ÜRES MEGTARTANDÓ-LISTA = NEM TAKARÍTUNK. Ha a betöltés elhasalt (503-vihar,
  // hálózat), a képernyő ÜRES sorokkal jön fel — a mentés ilyenkor a takarítással
  // kisöpörné az ÉV TELJES TERVÉT, és a felhasználó „sikeres mentést" látna.
  // A „mindent törlünk" szándékot a hívónak kell kimondania, nem itt találgatjuk.
  if (megtartandok.length === 0) {
    console.error('[saveBudgetRowsCompat] ÜRES terv-lista — a takarítás kihagyva (nem söpörjük ki az évet).')
    return
  }
  const letezo = await szurok(supabase.from(tabla).select('szamadasicelid'))
  // ⚠️ FAIL-LOUD: a takarítás hibáját NEM nyelhetjük el — a régi (DELETE-elöl) kód
  // hangosan megállt. Ha csak logolnánk, a felhasználó „mentve" üzenetet kapna,
  // miközben a kinullázott sor a régi összeggel bent maradt.
  if (letezo.error) throw new Error(`A kivett sorok takarítása nem sikerült (lekérdezés): ${letezo.error.message}`)
  const megtart = new Set(megtartandok)
  const torlendo = ((letezo.data || []) as Array<{ szamadasicelid: string }>)
    .map((r) => r.szamadasicelid)
    .filter((id) => !megtart.has(id))
  for (let i = 0; i < torlendo.length; i += TAKARITAS_DARAB) {
    const darab = torlendo.slice(i, i + TAKARITAS_DARAB)
    const res = await szurok(supabase.from(tabla).delete()).in('szamadasicelid', darab)
    if (res.error) throw new Error(`A kivett sorok takarítása nem sikerült (törlés): ${res.error.message}`)
  }
}

export async function saveBudgetRowsCompat(
  supabase: SupabaseClient,
  year: number,
  scopeId: string,
  rows: BudgetCompatRow[],
  scope: BudgetCompatScope = 'congregation',
) {
  // 2026-04-18 SCOPE-AWARE: megyei módban a diocese_koltsegvetes táblára fut.
  // 2026-08-17 (kerületi S5): + kerületi ág a district_koltsegvetes-re.
  const felso = felsoSzintTerv(scope)
  if (felso) {
    const activeRows = rows.filter((row) => row.tervezett > 0 || (row.modositott && row.modositott > 0) || (row.mod2 && row.mod2 > 0) || (row.mod3 && row.mod3 > 0))
    const payload = activeRows.map((row) => ({
      [felso.scopeCol]: scopeId,
      eve: year,
      szamadasicelid: row.szamadasicelid,
      tervezett: row.tervezett,
      osszeg_mod_1: row.modositott ?? 0,
      osszeg_mod_2: row.mod2 ?? 0,
      osszeg_mod_3: row.mod3 ?? 0,
    }))
    // ⛔ 2026-08-30: ELŐSZÖR ÍRUNK, csak UTÁNA takarítunk. A régi sorrend (DELETE →
    // INSERT) egy elakadt beszúrásnál az ÉV TELJES TERVÉT törölve hagyta, miközben a
    // felhasználó csak egy hibaüzenetet látott.
    if (payload.length > 0) {
      const { error } = await supabase
        .from(felso.tabla)
        .upsert(payload, { onConflict: felso.scopeCol + ',eve,szamadasicelid' })
      if (error) throw error
    }
    await takaritsFolosleges(
      supabase,
      felso.tabla,
      (q) => q.eq('eve', year).eq(felso.scopeCol, scopeId),
      activeRows.map((r) => r.szamadasicelid),
    )
    return
  }

  // Congregation path (eredeti)
  const congregationId = scopeId
  const yearId = String(year)
  const activeRows = rows.filter((row) => row.tervezett > 0 || (row.modositott && row.modositott > 0) || (row.mod2 && row.mod2 > 0) || (row.mod3 && row.mod3 > 0))

  // ⚠️ A `koltsegvetes.osszeg` és `osszeg_modositott` INTEGER oszlop (a mod_2/mod_3
  // numeric). Tizedes írása Postgres-hibát ad — és a RÉGI sorrendben (DELETE → INSERT)
  // ez az egész évi tervet törölve hagyta. A 2026-08-30-i hármas számjegy-csoportosítás
  // óta a beviteli mező tizedest is elfogad, ezért itt KEREKÍTÜNK.
  const payload = activeRows.map((row) => ({
    bealitasid: yearId,
    szamadasicelid: row.szamadasicelid,
    osszeg: egeszre(row.tervezett),
    osszeg_modositott: row.modositott == null ? null : egeszre(row.modositott),
    osszeg_mod_2: row.mod2 ?? 0,
    osszeg_mod_3: row.mod3 ?? 0,
    congregation_id: congregationId,
  }))

  // ⛔ ELŐSZÖR ÍRUNK (upsert az elsődleges kulcsra), csak UTÁNA takarítunk — lásd a
  // felső szintű ág kommentjét. A régi „előbb mindent törlünk" sorrend adatvesztő volt.
  if (payload.length > 0) {
    const { error } = await supabase
      .from('koltsegvetes')
      .upsert(payload, { onConflict: 'bealitasid,szamadasicelid,congregation_id' })
    if (error) throw error
  }
  await takaritsFolosleges(
    supabase,
    'koltsegvetes',
    (q) => q.eq('bealitasid', yearId).eq('congregation_id', congregationId),
    activeRows.map((r) => r.szamadasicelid),
  )
}

/**
 * Egy adott módosítási kör értékeinek mentése.
 * Nem törli az egész sort, hanem UPDATE-el a megfelelő oszlopra.
 *
 * 2026-08-15 (S6) SCOPE-AWARE: megyei módban a diocese_koltsegvetes
 * osszeg_mod_N oszlopára fut, UPSERT-tel — a tábla PK-ja
 * (diocese_id, eve, szamadasicelid), így az alap-terv nélküli sorra írt
 * módosítás-érték sem veszik el némán (a congregation-ág UPDATE-viselkedése
 * változatlan marad).
 *
 * 2026-08-17 (kerületi S5): ugyanez a kerületi ágon, a
 * `district_koltsegvetes` PK-jával (district_id, eve, szamadasicelid) — az
 * `onConflict` a scope-oszlopból épül, ezért a megyei kulcs-sztring
 * (`diocese_id,eve,szamadasicelid`) BETŰRE változatlan marad.
 */
export async function saveBudgetModification(
  supabase: SupabaseClient,
  year: number,
  scopeId: string,
  modNumber: 1 | 2 | 3,
  rows: Array<{ szamadasicelid: string; value: number }>,
  scope: BudgetCompatScope = 'congregation',
) {
  const felso = felsoSzintTerv(scope)
  if (felso) {
    const modColumn = `osszeg_mod_${modNumber}`
    for (const row of rows) {
      const { error } = await supabase.from(felso.tabla).upsert(
        {
          [felso.scopeCol]: scopeId,
          eve: year,
          szamadasicelid: row.szamadasicelid,
          [modColumn]: row.value,
        },
        { onConflict: `${felso.scopeCol},eve,szamadasicelid` },
      )
      if (error) throw error
    }
    return
  }

  const congregationId = scopeId
  const yearId = String(year)
  // ⚠️ A gyülekezeti táblán az 1. módosítás oszlopa `osszeg_modositott` (INTEGER) — a
  // `modositott` NÉV SOHA nem létezett itt (az a felső szintű táblák elnevezése). A régi
  // kód azzal kezdett, ezért minden jogcímnél egy fölösleges 400-as kört futtatott.
  const column = modNumber === 1 ? 'osszeg_modositott' : modNumber === 2 ? 'osszeg_mod_2' : 'osszeg_mod_3'
  // Az 1. módosítás INTEGER oszlop → kerekítünk; a mod_2/mod_3 numeric, ott nem.
  const egeszOszlop = modNumber === 1

  // ⛔ UPSERT, nem UPDATE: a sima UPDATE 0 érintett sorra NEM ad hibát, tehát ha a
  // jogcímhez még nincs terv-sor (pl. az alap-körben kinullázták és a takarítás
  // eltávolította), a beírt módosítás NÉMÁN elveszett volna.
  const payload = rows.map((row) => ({
    bealitasid: yearId,
    szamadasicelid: row.szamadasicelid,
    congregation_id: congregationId,
    [column]: egeszOszlop ? egeszre(row.value) : row.value,
  }))
  if (payload.length === 0) return
  const { error } = await supabase
    .from('koltsegvetes')
    .upsert(payload, { onConflict: 'bealitasid,szamadasicelid,congregation_id' })
  if (error) throw error
}
