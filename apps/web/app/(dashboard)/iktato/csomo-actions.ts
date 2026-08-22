'use server'

/**
 * Iktató F6 — iratcsomó server actions (K5, KONTRAKTUS C).
 *
 * Az iratcsomó az iktatott iratok évenkénti fizikai/logikai dossziéba
 * rendezése. Egy irat legfeljebb egy csomóban lehet (iktato.csomo_id),
 * a csomó törlésekor az iratok megmaradnak (FK ON DELETE SET NULL).
 *
 * FONTOS SZABÁLYOK (a K1 DB-kontraktus szerint):
 *  - a `lezarva` flag KIZÁRÓLAG app-oldali védelem — az assignEntryToCsomo
 *    itt kényszeríti ki MINDKÉT irányban (betétel ÉS kivétel/átrakás),
 *    az RLS nem tiltja,
 *  - csak ÜRES és NEM lezárt csomó törölhető (előzetes ellenőrzéssel),
 *  - lezárt iktató-ÉV guard szándékosan NINCS: a csomóba rendezés szervezési
 *    réteg, nem módosítja az iktatókönyv hivatalos rovatait.
 *
 * ⚠️ NÉMA-ÜRES-LISTA HIBAOSZTÁLY: minden DB-hiba az `error` mezőben jön
 * vissza, SOHA nem nyelődik el üres eredménnyé. A hiányzó tábla (migráció
 * még nem futott le) külön, cselekvésre felszólító üzenetet kap.
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
// 2026-08-17 (kerületi S5, elvarratlan szál): a MÁSODIK VÉDVONAL feloldója — a
// részletes MIÉRT a fájl végén, a `hatokorEltres()` docblockjában él.
import { getModuleScopeContext, type ModuleScope } from '@/lib/auth/module-scope'
import type {
  FilingEntryWithCsomo,
  Iratcsomo,
  IratcsomoWithCount,
} from '@/lib/iktato/csomo-types'

// ─────────────────────────────────────────────────────────────────
// 1) Csomók listája (év-szűrt, irat-darabszámmal)
// ─────────────────────────────────────────────────────────────────

/**
 * A saját gyülekezet adott évi iratcsomói, mindegyikhez a benne lévő
 * (nem törölt) iratok darabszámával — a darabszám EGYETLEN kötegelt
 * lekérdezésből jön (nem csomónkénti count).
 */
export async function listIratcsomok(
  ev: number,
): Promise<{ csomok: IratcsomoWithCount[]; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { csomok: [], error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  const eltres = await hatokorEltres(congId, 'iratcsomó-lista')
  if (eltres) return { csomok: [], error: eltres }
  if (!Number.isInteger(ev)) return { csomok: [], error: 'Érvénytelen év.' }

  const { data, error } = await supabase
    .from('iratcsomo')
    .select('*')
    .eq('congregation_id', congId)
    .eq('ev', ev)
    .order('nev', { ascending: true })
  if (error) {
    return { csomok: [], error: friendlyDbError('Az iratcsomók betöltése sikertelen', error) }
  }

  const csomok = (data || []) as Iratcsomo[]
  if (csomok.length === 0) return { csomok: [], error: null }

  // Kötegelt darabszám: az összes csomó iratai egy lekérdezésben
  const ids = csomok.map((c) => c.id)
  const { data: countRows, error: countErr } = await supabase
    .from('iktato')
    .select('csomo_id')
    .in('csomo_id', ids)
    .eq('congregation_id', congId)
    .eq('deleted', false)
  if (countErr) {
    return {
      csomok: [],
      error: friendlyDbError('A csomók irat-darabszámának betöltése sikertelen', countErr),
    }
  }

  const countByCsomo = new Map<string, number>()
  for (const row of (countRows || []) as Array<{ csomo_id: string | null }>) {
    if (row.csomo_id) countByCsomo.set(row.csomo_id, (countByCsomo.get(row.csomo_id) ?? 0) + 1)
  }

  return {
    csomok: csomok.map((c) => ({ ...c, iratSzam: countByCsomo.get(c.id) ?? 0 })),
    error: null,
  }
}

// ─────────────────────────────────────────────────────────────────
// 2) Csomó létrehozása / átnevezése
// ─────────────────────────────────────────────────────────────────

/**
 * Új csomó létrehozása (id nélkül) vagy meglévő átnevezése/leírás-módosítása
 * (id-vel). Az `ev` csak LÉTREHOZÁSKOR számít — meglévő csomó nem mozgatható
 * másik évre (az év-egyezés garanciáját az assignEntryToCsomo építi rá).
 */
export async function saveIratcsomo(input: {
  id?: string
  ev: number
  nev: string
  leiras?: string | null
}): Promise<{ csomo: Iratcsomo | null; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { csomo: null, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  const eltres = await hatokorEltres(congId, 'iratcsomó mentése')
  if (eltres) return { csomo: null, error: eltres }

  const nev = (input.nev || '').trim()
  if (!nev) return { csomo: null, error: 'A csomó neve nem lehet üres.' }
  if (nev.length > 120) return { csomo: null, error: 'A csomó neve legfeljebb 120 karakter lehet.' }
  const leiras = (input.leiras || '').trim() || null

  if (input.id) {
    // Átnevezés / leírás — az ev-hez szándékosan nem nyúlunk
    const { data, error } = await supabase
      .from('iratcsomo')
      .update({ nev, leiras })
      .eq('id', input.id)
      .eq('congregation_id', congId)
      .select('*')
      .maybeSingle()
    if (error) return { csomo: null, error: friendlyDbError('A csomó mentése sikertelen', error) }
    if (!data) {
      return { csomo: null, error: 'A csomó nem található — lehet, hogy időközben törölték.' }
    }
    revalidatePath('/iktato')
    return { csomo: data as Iratcsomo, error: null }
  }

  if (!Number.isInteger(input.ev) || input.ev < 1900 || input.ev > 2200) {
    return { csomo: null, error: 'Érvénytelen év.' }
  }
  const { data, error } = await supabase
    .from('iratcsomo')
    .insert([{ congregation_id: congId, ev: input.ev, nev, leiras }])
    .select('*')
    .single()
  if (error) return { csomo: null, error: friendlyDbError('A csomó létrehozása sikertelen', error) }
  revalidatePath('/iktato')
  return { csomo: data as Iratcsomo, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 3) Csomó lezárása / feloldása
// ─────────────────────────────────────────────────────────────────

/**
 * A csomó lezárása (lezarva=true) vagy feloldása (false). Lezárt csomóba
 * az assignEntryToCsomo nem enged új iratot rendezni.
 */
export async function setIratcsomoLezarva(
  id: string,
  lezarva: boolean,
): Promise<{ csomo: Iratcsomo | null; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { csomo: null, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  const eltres = await hatokorEltres(congId, 'iratcsomó lezárása / feloldása')
  if (eltres) return { csomo: null, error: eltres }

  const { data, error } = await supabase
    .from('iratcsomo')
    .update({ lezarva })
    .eq('id', id)
    .eq('congregation_id', congId)
    .select('*')
    .maybeSingle()
  if (error) {
    return {
      csomo: null,
      error: friendlyDbError(
        lezarva ? 'A csomó lezárása sikertelen' : 'A csomó feloldása sikertelen',
        error,
      ),
    }
  }
  if (!data) return { csomo: null, error: 'A csomó nem található — lehet, hogy időközben törölték.' }
  revalidatePath('/iktato')
  return { csomo: data as Iratcsomo, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 4) Csomó törlése — CSAK üres csomó
// ─────────────────────────────────────────────────────────────────

/**
 * Csomó törlése. Csak üres ÉS nem lezárt csomó törölhető — ha van benne
 * (nem törölt) irat, vagy a csomó lezárt, hibával térünk vissza.
 * (Az FK ON DELETE SET NULL amúgy sem veszítene adatot, de a szándékos
 * kiürítés a biztonságos munkamenet; a lezárt csomó pedig a kinyomtatott
 * leltárral együtt „érinthetetlen" — feloldás nélkül nem törölhető.)
 */
export async function deleteIratcsomo(
  id: string,
): Promise<{ success: boolean; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { success: false, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  const eltres = await hatokorEltres(congId, 'iratcsomó törlése')
  if (eltres) return { success: false, error: eltres }

  // Lezárt csomó nem törölhető — előbb fel kell oldani (a lezárás értelme,
  // hogy a dosszié + leltár állapota ne változhasson némán).
  const { data: csomoRow, error: csomoErr } = await supabase
    .from('iratcsomo')
    .select('id, nev, lezarva')
    .eq('id', id)
    .eq('congregation_id', congId)
    .maybeSingle()
  if (csomoErr) {
    return { success: false, error: friendlyDbError('A csomó ellenőrzése sikertelen', csomoErr) }
  }
  if (!csomoRow) {
    return { success: false, error: 'A csomó nem található — lehet, hogy már törölték.' }
  }
  if ((csomoRow as { lezarva: boolean }).lezarva) {
    return {
      success: false,
      error: `A(z) „${(csomoRow as { nev: string }).nev}" csomó le van zárva — törléséhez előbb old fel.`,
    }
  }

  // head:true mellett a data mindig null — a darabszám a count mezőben jön
  // (ismert csapda, lásd iktato/actions.ts closeFilingYear kommentje).
  const { count, error: countErr } = await supabase
    .from('iktato')
    .select('id', { count: 'exact', head: true })
    .eq('csomo_id', id)
    .eq('congregation_id', congId)
    .eq('deleted', false)
  if (countErr) {
    return {
      success: false,
      error: friendlyDbError('A csomó tartalmának ellenőrzése sikertelen', countErr),
    }
  }
  if ((count ?? 0) > 0) {
    return {
      success: false,
      error: `A csomó nem üres (${count} irat van benne) — előbb vedd ki belőle az iratokat, utána törölhető.`,
    }
  }

  // .select('id')-vel a törölt sorokat is visszakérjük — így a néma no-op
  // (nem létező id / RLS-tiltás) is kiderül, nem csendben "sikerül".
  const { data, error } = await supabase
    .from('iratcsomo')
    .delete()
    .eq('id', id)
    .eq('congregation_id', congId)
    .select('id')
  if (error) return { success: false, error: friendlyDbError('A csomó törlése sikertelen', error) }
  if (!data || data.length === 0) {
    return { success: false, error: 'A csomó nem található — lehet, hogy már törölték.' }
  }
  revalidatePath('/iktato')
  return { success: true, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 5) Irat csomóba rendezése / kivétele
// ─────────────────────────────────────────────────────────────────

/**
 * Egy iktatott irat csomóhoz rendelése (csomoId) vagy kivétele (null).
 *
 * Kikényszerített szabályok:
 *  - lezárt csomóba NEM rendezhető irat (a lezarva flag app-oldali védelme),
 *  - lezárt csomóBÓL kivenni / másik csomóba átrakni sem lehet — a lezárt
 *    dosszié + kinyomtatott leltár konzisztenciája csak így marad meg,
 *  - csak azonos évű irat kerülhet a csomóba (iktato.year === iratcsomo.ev).
 */
export async function assignEntryToCsomo(
  iktatoId: string,
  csomoId: string | null,
): Promise<{ success: boolean; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { success: false, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  const eltres = await hatokorEltres(congId, 'irat csomóba rendezése')
  if (eltres) return { success: false, error: eltres }

  // Az irat lekérdezése MINDIG lefut — a kivétel (csomoId=null) ágon is,
  // mert a FORRÁS-csomó lezártsága csak az irat aktuális csomo_id-jából
  // állapítható meg.
  const entryRes = await supabase
    .from('iktato')
    .select('id, year, csomo_id')
    .eq('id', iktatoId)
    .eq('congregation_id', congId)
    .eq('deleted', false)
    .maybeSingle()
  if (entryRes.error) {
    return { success: false, error: friendlyDbError('Az irat ellenőrzése sikertelen', entryRes.error) }
  }
  if (!entryRes.data) {
    return { success: false, error: 'Az irat nem található — lehet, hogy időközben törölték.' }
  }
  const entry = entryRes.data as { id: string; year: number; csomo_id: string | null }

  // FORRÁS-csomó guard: lezárt csomóból se kivétel, se átrakás — az RLS ezt
  // nem tiltja, ez az egyetlen védőréteg.
  if (entry.csomo_id && entry.csomo_id !== csomoId) {
    const { data: forras, error: forrasErr } = await supabase
      .from('iratcsomo')
      .select('id, nev, lezarva')
      .eq('id', entry.csomo_id)
      .eq('congregation_id', congId)
      .maybeSingle()
    if (forrasErr) {
      return {
        success: false,
        error: friendlyDbError('Az irat jelenlegi csomójának ellenőrzése sikertelen', forrasErr),
      }
    }
    // Ha a forrás-csomó időközben eltűnt (törölték), nincs mit védeni —
    // a hozzárendelés-frissítés mehet tovább.
    if (forras && (forras as { lezarva: boolean }).lezarva) {
      return {
        success: false,
        error: `A(z) „${(forras as { nev: string }).nev}" csomó le van zárva — az irat kivételéhez/átrakásához előbb old fel a csomót.`,
      }
    }
  }

  if (csomoId) {
    const { data: csomoData, error: csomoErr } = await supabase
      .from('iratcsomo')
      .select('id, ev, nev, lezarva')
      .eq('id', csomoId)
      .eq('congregation_id', congId)
      .maybeSingle()
    if (csomoErr) {
      return { success: false, error: friendlyDbError('A csomó ellenőrzése sikertelen', csomoErr) }
    }
    if (!csomoData) {
      return { success: false, error: 'A kiválasztott iratcsomó nem található — lehet, hogy időközben törölték.' }
    }
    const csomo = csomoData as { id: string; ev: number; nev: string; lezarva: boolean }
    if (csomo.lezarva) {
      return {
        success: false,
        error: `A(z) „${csomo.nev}" csomó le van zárva — új irat nem rendezhető bele. Előbb old fel a csomót.`,
      }
    }
    if (entry.year !== csomo.ev) {
      return {
        success: false,
        error: `Az irat ${entry.year}. évi, a csomó viszont ${csomo.ev}. évi — csak azonos évű csomóba rendezhető.`,
      }
    }
  }

  const { data, error } = await supabase
    .from('iktato')
    .update({ csomo_id: csomoId })
    .eq('id', iktatoId)
    .eq('congregation_id', congId)
    .select('id')
  if (error) {
    return { success: false, error: friendlyDbError('A csomóba rendezés mentése sikertelen', error) }
  }
  if (!data || data.length === 0) {
    return { success: false, error: 'Az irat nem található vagy nincs jogosultság a módosításához.' }
  }
  revalidatePath('/iktato')
  return { success: true, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 6) Egy csomó iratai
// ─────────────────────────────────────────────────────────────────

/**
 * A csomóban lévő (nem törölt) iratok iktatószám szerint növekvő sorrendben —
 * a csomó-nézethez és a leltár-nyomtatványhoz.
 */
export async function getCsomoEntries(
  csomoId: string,
): Promise<{ entries: FilingEntryWithCsomo[]; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { entries: [], error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  const eltres = await hatokorEltres(congId, 'a csomó iratai')
  if (eltres) return { entries: [], error: eltres }

  const { data, error } = await supabase
    .from('iktato')
    .select('*')
    .eq('csomo_id', csomoId)
    .eq('congregation_id', congId)
    .eq('deleted', false)
    .order('sequence_number', { ascending: true })
  if (error) {
    return { entries: [], error: friendlyDbError('A csomó iratainak betöltése sikertelen', error) }
  }
  return { entries: (data || []) as unknown as FilingEntryWithCsomo[], error: null }
}

// ─────────────────────────────────────────────────────────────────
// Belső segédek ('use server' fájl csak async function-t exportálhat)
// ─────────────────────────────────────────────────────────────────

async function getCongId() {
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId, userId }
}

/**
 * ── MÁSODIK VÉDVONAL: A KÉT HATÓKÖR-RÉTEGNEK EGYET KELL MONDANIA ──────────
 * (a `leltar/actions.ts` `finalizeLeltar()` 2026-08-17-es mintája szerint)
 *
 * MELYIK KÉT FELOLDÓ HÚZHAT SZÉT. Ez a fájl a `getEffectiveCongregationContext()`-ből
 * veszi a hatókört (`getCongId()` fent), az Iktató modul TÖBBI akciója viszont a
 * `getModuleScopeContext()`-ből (`iktato/actions.ts`, `template-actions.ts`,
 * `csatolmany-actions.ts`, `qr-actions.ts`). KÉT FELOLDÓ, KÉT VÁLASZ — ugyanazon
 * a képernyőn.
 *
 * MI LENNE A TÜNET. Az iktatókönyv listája (module-scope) az EGYIK hatókör
 * iratait mutatná, a csomó-kezelés viszont a MÁSIK hatókör `iratcsomo` sorain
 * dolgozna: a csomó-legördülő üresen maradna vagy IDEGEN dossziékat kínálna, a
 * „Csomóba rendezés" 0 sort érintene („az irat nem található vagy nincs
 * jogosultság"), az átnevezés / lezárás / törlés pedig egy MÁSIK gyülekezet
 * dossziéját érintené. A lista-ág ráadásul NÉMA: hiba nélkül adna vissza üres
 * vagy idegen csomó-listát, és a lelkész az irattári rendjét hinné elveszettnek.
 *
 * A GYÖKÉROK MA MÁR ZÁRVA: a 2026-08-17-es override-elsőbbségi kapu
 * (`lib/auth/finance-scope.ts` és `lib/auth/module-scope.ts` 0) blokkja) a
 * kerületi admin „Belépés a gyülekezetbe" esetét javítja, ezért a két réteg ma
 * BIZONYÍTOTTAN egyet mond. Ez itt a második védvonal egy JÖVŐBELI
 * divergenciára — egyik kapu sem ír adatot.
 *
 * ⚠️ A GYÜLEKEZETI (ÉS A MEGYEI) ÚT VISELKEDÉSE VÁLTOZATLAN — bizonyítás:
 *   · ha `congId` (= `effectiveCongregationId`) nem null, a
 *     `getModuleScopeContext()` 3) gyülekezeti fallbackje UGYANEZT az értéket
 *     adja, a 0) override-kapu pedig az `override.congregationId`-t, ami az
 *     `effective-access.ts:404-411` szerint UGYANAZ az érték;
 *   · a megyei / kerületi profilban álló felhasználónál `effectiveCongregationId`
 *     null (`effective-access.ts:412-414`), tehát ő a hívó `!congId` ágán kapja
 *     a MAI, betűre változatlan üzenetet — idáig el sem jut.
 *   ⇒ mind a három kapu no-op a mai éles adaton; csak széthúzáskor szólal meg.
 */
async function hatokorEltres(congId: string, mit: string): Promise<string | null> {
  const modulCtx = await getModuleScopeContext()
  if ('error' in modulCtx) {
    return (
      'A hatókör (gyülekezet / egyházmegye / egyházkerület) most nem oldható fel, ezért biztonsági ' +
      `okból megszakítottuk a műveletet (${mit}). Frissítsd az oldalt, és próbáld újra; ha újra ` +
      'hibázik, jelezd a rendszergazdának.'
    )
  }
  if (modulCtx.scope !== 'congregation') {
    return felsoSzintNemErtelmezett(modulCtx.scope) ?? ALTALANOS_NEM_ERTELMEZETT
  }
  if (modulCtx.scopeId !== congId) {
    return (
      'A rendszer két különböző gyülekezetet lát ehhez a művelethez, ezért biztonsági okból ' +
      `megszakítottuk a műveletet (${mit}) — az irattári rend nem kerülhet bizonytalan hatókörbe. ` +
      'Lépj ki a „Belépés a gyülekezetbe" nézetből vagy válts profilt, majd próbáld újra; ha újra ' +
      'hibázik, jelezd a rendszergazdának.'
    )
  }
  return null
}

const ALTALANOS_NEM_ERTELMEZETT =
  'Az iratcsomó az egyházközség iktatókönyvének dossziéja — a jelenlegi hatókörben nem kezelhető. ' +
  'Válts gyülekezeti profilra, és ott rendezd a csomókat.'

/**
 * A FELSŐ SZINTŰ (megyei / kerületi) hatókör beszédes elutasítása.
 *
 * ⚠️ SZÁNDÉKOSAN NEM KITERJESZTÉS: az iratcsomó TISZTÁN GYÜLEKEZETI fogalom (az
 * `iratcsomo` táblának `congregation_id` oszlopa van, scope-oszlopa nincs — a
 * megyei/kerületi iratcsomó-kezelés KÜLÖN döntés és külön SQL). A helyes
 * védvonal ezért a megnevezett szintű elutasítás, nem a néma gyülekezeti
 * visszaesés.
 *
 * `null` = ezen a szinten nincs mit tiltani. A `default: never` ág egy jövőbeli
 * NEGYEDIK szintnél FORDÍTÁSI HIBÁT ad — nem néma átesést.
 */
function felsoSzintNemErtelmezett(scope: ModuleScope): string | null {
  switch (scope) {
    case 'congregation':
      return null
    case 'diocese':
      return (
        'Az iratcsomó az egyházközség iktatókönyvének dossziéja — EGYHÁZMEGYEI módban nincs ' +
        'értelmezve (az egyházmegye saját iratcsomó-kezelése külön fejlesztési kör). Válts ' +
        'gyülekezeti profilra — vagy ha „Belépés a gyülekezetbe" nézetben vagy, lépj ki belőle —, ' +
        'és ott rendezd a csomókat.'
      )
    case 'district':
      return (
        'Az iratcsomó az egyházközség iktatókönyvének dossziéja — EGYHÁZKERÜLETI módban nincs ' +
        'értelmezve (az egyházkerület saját iratcsomó-kezelése külön fejlesztési kör). Válts ' +
        'gyülekezeti profilra — vagy ha „Belépés a gyülekezetbe" nézetben vagy, lépj ki belőle —, ' +
        'és ott rendezd a csomókat.'
      )
    default: {
      const _nemKezelt: never = scope
      throw new Error(`Ismeretlen modul-hatókör: ${String(_nemKezelt)}`)
    }
  }
}

/**
 * DB-hiba magyarul, hangosan. A hiányzó tábla/oszlop (a migráció még nem
 * futott le) külön, cselekvésre felszólító üzenetet kap — 42P01 = undefined
 * table, 42703 = undefined column, PGRST205 = a PostgREST schema cache nem
 * ismeri a táblát.
 */
function friendlyDbError(
  prefix: string,
  error: { code?: string; message: string },
): string {
  const migrationMissing =
    error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205'
  if (migrationMissing) {
    return `${prefix}: az iratcsomó-funkcióhoz szükséges adatbázis-migráció még nincs lefuttatva (migration-docs/sql/2026-07-17-f6-iktato-csomok-csatolmanyok.sql). Részlet: ${error.message}`
  }
  return `${prefix}: ${error.message}`
}
