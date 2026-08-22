'use server'

/**
 * Egyházkerületi adatlap („Egyházkerületünk") szerver akciói — a 3. szint.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT LÉTEZIK EZ A FÁJL (2026-08-15/16, kerületi S2 szelet)
 * ════════════════════════════════════════════════════════════════════════════
 * A `districts` táblának az élő adatbázisban PONTOSAN HÁROM oszlopa van
 * (id, name, created_at), miközben a `dioceses`-nek harmincegy. Az egyházkerület
 * ugyanolyan önálló jogi entitás, mint az egyházmegye: saját CIF-je, adószáma,
 * székhelye, bankszámlája, címere, pecsétje és aláírás-képe van, és a hivatalos
 * iratok fejlécére az ő kétnyelvű (magyar + román) neve kerül. Amíg ezek az
 * adatok nincsenek a rendszerben, a kerületi szint minden nyomtatványa hiányos.
 *
 * Ez a modul az egyházmegyei párjának (dashboard-egyhazmegye/diocese-actions.ts)
 * BETŰHŰ TÜKÖRKÉPE. Azért betűhű, mert a projekt visszatérő hibaosztálya éppen
 * az, hogy „a második felület a régi implementációt őrzi": ha a kerületi ág
 * önálló, kicsit másképp működő logikát kapna, a két szint idővel némán
 * széthúzna (és a széthúzás mindig a biztonsági kapunál fáj a legjobban).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A HÁROM ÉRDEMI ELTÉRÉS A MEGYEI PÁRHOZ KÉPEST (Endre döntései)
 * ────────────────────────────────────────────────────────────────────────────
 *  (1) VEZETŐK. A kerületet nem esperes és jegyző vezeti, hanem „püspök,
 *      adminisztrátorok" — ezért az oszlopok `puspok_nev`, `puspok_cim`
 *      (TISZTSÉG-szöveg, ahogy a megyei `esperes_cim` is: pl. „püspök"),
 *      `adminisztrator_nev`, mellettük a `szamvevo_nev`.
 *
 *  (2) A VEZETŐ-JELÖLTEK FORRÁSA. K4 döntés szó szerint: „A kerület nem
 *      írhatja és nem is olvashatja a kerület gyülekezeteinek és
 *      egyházmegyéinek az adatait, csak a hivatalosan beküldött adatokat
 *      illetve azoknak az összesítőjét!" Ezért a jelölt-lista NEM a
 *      gyülekezetek lelkészeiből áll (az a megyei megoldás), hanem
 *      (a) akinek MÁR VAN `district` hatókörű szerepkör-sora erre a kerületre
 *      (egyházkerületi admin / számvevő), és (b) a kerület egyházmegyéinek
 *      ESPERESEIBŐL — ők a kerületi közgyűlés tagjai, tehát a kerület
 *      hivatalos testületének nevesített tagjai, nem „a megye belső adata".
 *
 *  (3) NINCS `district_bealitas` AUTO-UPSERT. A megyei `saveDioceseSetup` a
 *      mentés végén létrehozza az évi beállítás-sort, hogy a pénzügyi oldal
 *      azonnal működjön. A kerület saját könyvelése K2 szerint az S5 szelet —
 *      MOST NEM épül, ezért itt nincs mit előkészíteni. Ha az S5 megjön, ide
 *      kerül a párja (és NEM egy másik fájlba, hogy a két szint együtt maradjon).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FAIL-SOFT ÍRÁS — MIÉRT KELL ITT SOKKAL ERŐSEBBEN, MINT A MEGYEINÉL
 * ────────────────────────────────────────────────────────────────────────────
 * A megyei fájlban egyetlen ismert új oszlop volt (`szamvevo_nev`), ezért ott
 * egyetlen újrapróbálás elég. Itt viszont a `districts` MINDEN törzsadat-oszlopa
 * új: ha a kerületi S2 migráció még nem futott le élesben (MEMORY: „a
 * migration-fájl NEM bizonyíték"), az első mentés HUSZONNYOLC oszlopra hibázna
 * egymás után. Ezért a `updateDistrictFailSoft` KÖRBEN hámozza le a hiányzó
 * oszlopokat, és visszaadja, melyek maradtak ki — így a felhasználó adata nem
 * vész el, és a felület meg tudja mondani, hogy migráció kell.
 *
 * Funkciók:
 *   1. getDistrict / getDistrictSummaryData — olvasás
 *   2. updateDistrict — szerkesztés
 *   3. checkDistrictSetupStatus / saveDistrictSetup / saveDistrictSetupStep
 *   4. uploadDistrictCimer + pecsét/aláírás képek
 *   5. getDistrictVezetoJeloltek — a vezetők LISTÁBÓL választhatók
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getEffectiveAccessContext, type EffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canWriteDistrictScope,
  describeDistrictWriteBlock,
  resolveDistrictReadScopeIds,
  resolveDistrictScopeIds,
  resolveDistrictWriteScopeIds,
} from '@/lib/auth/level-scope'

// ─────────────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────────────

export interface DistrictRecord {
  id: string
  name: string
  /** Hivatalos ROMÁN név — a nyomtatvány-fejléc kétnyelvű alakjához KÖTELEZŐ
   *  (a congregations.nev_ro / dioceses.nev_ro párja). */
  nev_ro: string | null
  /** Angol név — opcionális. */
  nev_en: string | null

  // Jogi / pénzügyi azonosítók
  cif: string | null
  adoszam: string | null
  cnp_letter: string | null

  // Cím
  cim_orszag: string | null
  cim_megye: string | null
  cim_telepules: string | null
  cim_iranyitoszam: string | null
  cim_utca: string | null

  // Elérhetőségek
  email: string | null
  telefon: string | null
  weboldal: string | null

  // Bank — Endre döntése szerint NEM kötelező („a banki kontók beállítása később")
  bank_nev: string | null
  bank_fo_iban: string | null
  bank_fo_iban_valuta: string | null

  // Vezetés (a megyei esperes/jegyző/számvevő hármas kerületi párja)
  /** A püspök NEVE — ez kerül a hivatalos irat aláírás-rovatába. */
  puspok_nev: string | null
  /** A püspök TISZTSÉG-szövege (pl. „püspök") — a megyei `esperes_cim` párja. */
  puspok_cim: string | null
  /** A kerületi adminisztrátor neve (a megyei jegyző párja). */
  adminisztrator_nev: string | null
  /** A kerületi számvevő neve — NEM kötelező (nem minden kerületnél van kiosztva). */
  szamvevo_nev: string | null

  // Vizuális / irat-képek
  cimer_url: string | null
  pecset_url: string | null
  alairas_url: string | null

  megjegyzes: string | null
  updated_at: string | null
  updated_by: string | null

  // Cím FK-k (a gyülekezeti/megyei címtár-párral azonos)
  adrlocality_id: number | null
  adrstreet_id: number | null

  /**
   * TESZT-KERÜLET JELÖLŐ — a felület ezt írja ki „(teszt)"-ként.
   *
   * MIÉRT: élesben három kerület van, közülük az egyik a „Teszt Egyházkerület"
   * (1 egyházmegye, 1 gyülekezet). Endre kérése, hogy ez a felületen LÁTHATÓAN
   * meg legyen jelölve — különben egy kerületi admin úgy tölthetne ki egy teljes
   * beállítás-varázslót, hogy közben egy próba-entitás törzsadatát írja, és ezt
   * semmi nem jelzi neki.
   *
   * ⚠️ EZ AZ EGYETLEN FORRÁS. A mező elsődlegesen a VALÓDI `districts.teszt`
   * oszlopból jön (az S2 migráció hozza létre: `boolean NOT NULL DEFAULT false`,
   * és KIZÁRÓLAG a pontosan „Teszt Egyházkerület" nevű sort állítja true-ra).
   * Amíg a migráció nem futott le élesben, a `keruletTesztE` NÉV-alapú tartalék
   * lép be — lásd ott. A kliens-oldali felületek NE tartsanak saját felismerőt:
   * két helyen élő ugyanaz a logika a projekt bizonyított hibaosztálya (némán
   * széthúznak, és a felhasználó két képernyőn két különböző igazságot lát).
   */
  teszt: boolean
}

/**
 * A `districts` táblára írható oszlopok (az `id` és a `name` NÉLKÜL).
 *
 * MIÉRT KELL EZ A LISTA: mindegyikük az S2 migrációval születik, tehát
 * mindegyikük hiányozhat élesben. A fail-soft író (updateDistrictFailSoft) ebből
 * a listából ismeri fel, hogy egy PGRST204/42703 hiba ISMERT új oszlopra
 * mutat-e — ha igen, kihámozza és újrapróbál; ha nem (pl. tényleg elgépelt
 * oszlopnév), HANGOSAN hibázik, hogy a fejlesztési hiba ne rejtőzzön el.
 */
const DISTRICT_UJ_OSZLOPOK = [
  'nev_ro',
  'nev_en',
  'cif',
  'adoszam',
  'cnp_letter',
  'cim_orszag',
  'cim_megye',
  'cim_telepules',
  'cim_iranyitoszam',
  'cim_utca',
  'email',
  'telefon',
  'weboldal',
  'bank_nev',
  'bank_fo_iban',
  'bank_fo_iban_valuta',
  'puspok_nev',
  'puspok_cim',
  'adminisztrator_nev',
  'szamvevo_nev',
  'cimer_url',
  'pecset_url',
  'alairas_url',
  'megjegyzes',
  'updated_at',
  'updated_by',
  'adrlocality_id',
  'adrstreet_id',
] as const

const DISTRICT_MIGRACIO_HIBA =
  'Az adatbázisból még hiányoznak az egyházkerület törzsadat-oszlopai — futtasd le a ' +
  'migration-docs/sql/2026-08-15-egyhazkeruleti-S2-torzsadat.sql migrációt, majd próbáld újra.'

const districtSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2, 'A név kötelező.'),
  nev_ro: z.string().optional().or(z.literal('')),
  nev_en: z.string().optional().or(z.literal('')),
  cif: z.string().optional().or(z.literal('')),
  adoszam: z.string().optional().or(z.literal('')),
  cnp_letter: z.string().optional().or(z.literal('')),
  cim_orszag: z.string().optional().or(z.literal('')),
  cim_megye: z.string().optional().or(z.literal('')),
  cim_telepules: z.string().optional().or(z.literal('')),
  cim_iranyitoszam: z.string().optional().or(z.literal('')),
  cim_utca: z.string().optional().or(z.literal('')),
  email: z.string().email('Érvénytelen email.').optional().or(z.literal('')),
  telefon: z.string().optional().or(z.literal('')),
  weboldal: z.string().optional().or(z.literal('')),
  bank_nev: z.string().optional().or(z.literal('')),
  bank_fo_iban: z.string().optional().or(z.literal('')),
  bank_fo_iban_valuta: z.string().default('RON'),
  puspok_nev: z.string().optional().or(z.literal('')),
  puspok_cim: z.string().optional().or(z.literal('')),
  adminisztrator_nev: z.string().optional().or(z.literal('')),
  szamvevo_nev: z.string().optional().or(z.literal('')),
  megjegyzes: z.string().optional().or(z.literal('')),
})

export type DistrictInput = z.infer<typeof districtSchema>

// ─────────────────────────────────────────────────────────────────────────
// Sor → rekord leképezés
// ─────────────────────────────────────────────────────────────────────────

/**
 * TARTALÉK felismerő: „Teszt Egyházkerület" a NÉVBŐL.
 *
 * ⚠️ EZ NEM AZ ELSŐDLEGES FORRÁS, és nem is szabad azzá tenni. Az igazságot a
 * `districts.teszt` oszlop hordozza (S2 migráció). Ez a függvény KIZÁRÓLAG addig
 * él, amíg a migráció nem futott le élesben — a projekt bizonyított tanulsága,
 * hogy „a migration-fájl NEM bizonyíték arra, hogy lefutott". Ha ilyenkor nem
 * jelölnénk meg semmit, a teszt-kerületen dolgozó admin JELÖLÉS NÉLKÜL töltene ki
 * egy teljes beállítás-varázslót — pontosan az, amit Endre el akart kerülni.
 *
 * Kisbetű-független, hogy a „teszt", „Teszt" és „TESZT" alak egyaránt találjon.
 * Szándékosan TÁGABB, mint az SQL (ami csak a pontos „Teszt Egyházkerület" nevet
 * jelöli meg): tartalékként a téves jelölés ára egy fölösleges figyelmeztetés, az
 * elmaradt jelölésé viszont éles adat elrontása. A migráció után a `sorbolRekord`
 * úgyis az oszlopot használja, és ez a tágabb ág soha többé nem fut le.
 */
function keruletTesztE(name: string | null | undefined): boolean {
  // Nincs `normalize()` + ékezet-leszedő regex: a „teszt" szóban nincs ékezet,
  // a kombináló diakritikus karaktereket tartalmazó karakterosztály viszont
  // láthatatlan a forrásban és némán sérülhet a szerkesztők/diffek között — itt
  // a legegyszerűbb megoldás egyben a legmegbízhatóbb is.
  return (name || '').toLowerCase().includes('teszt')
}

function szoveg(row: Record<string, unknown>, kulcs: string): string | null {
  const v = row[kulcs]
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

function szam(row: Record<string, unknown>, kulcs: string): number | null {
  const v = row[kulcs]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Adatbázis-sor → DistrictRecord.
 *
 * MIÉRT NEM ELÉG A `data as DistrictRecord` CAST (amit a megyei pár csinál):
 * amíg az S2 migráció nem futott le, a `select('*')` MINDÖSSZE három kulcsot
 * ad vissza (id, name, created_at). A puszta cast ilyenkor `undefined` értékű
 * mezőket hazudna `string | null`-nak, és az első `.trim()` a felületen
 * futásidejű hibával dobna. A leképező ezért minden mezőt explicit `null`-ra
 * normalizál — a hiányzó oszlop így „üres adat", nem összeomlás.
 */
function sorbolRekord(row: Record<string, unknown>): DistrictRecord {
  const name = typeof row.name === 'string' ? row.name : ''
  return {
    id: String(row.id ?? ''),
    name,
    nev_ro: szoveg(row, 'nev_ro'),
    nev_en: szoveg(row, 'nev_en'),
    cif: szoveg(row, 'cif'),
    adoszam: szoveg(row, 'adoszam'),
    cnp_letter: szoveg(row, 'cnp_letter'),
    cim_orszag: szoveg(row, 'cim_orszag'),
    cim_megye: szoveg(row, 'cim_megye'),
    cim_telepules: szoveg(row, 'cim_telepules'),
    cim_iranyitoszam: szoveg(row, 'cim_iranyitoszam'),
    cim_utca: szoveg(row, 'cim_utca'),
    email: szoveg(row, 'email'),
    telefon: szoveg(row, 'telefon'),
    weboldal: szoveg(row, 'weboldal'),
    bank_nev: szoveg(row, 'bank_nev'),
    bank_fo_iban: szoveg(row, 'bank_fo_iban'),
    bank_fo_iban_valuta: szoveg(row, 'bank_fo_iban_valuta'),
    puspok_nev: szoveg(row, 'puspok_nev'),
    puspok_cim: szoveg(row, 'puspok_cim'),
    adminisztrator_nev: szoveg(row, 'adminisztrator_nev'),
    szamvevo_nev: szoveg(row, 'szamvevo_nev'),
    cimer_url: szoveg(row, 'cimer_url'),
    pecset_url: szoveg(row, 'pecset_url'),
    alairas_url: szoveg(row, 'alairas_url'),
    megjegyzes: szoveg(row, 'megjegyzes'),
    updated_at: szoveg(row, 'updated_at'),
    updated_by: szoveg(row, 'updated_by'),
    adrlocality_id: szam(row, 'adrlocality_id'),
    adrstreet_id: szam(row, 'adrstreet_id'),
    // A VALÓDI oszlop az elsődleges forrás; a `typeof === 'boolean'` egyben az
    // „oszlop létezik-e" próba is (a PostgREST csak a létező oszlopokat adja
    // vissza). Ha még nincs meg, a NÉV-alapú tartalék lép be — lásd keruletTesztE.
    teszt: typeof row.teszt === 'boolean' ? row.teszt : keruletTesztE(name),
  }
}

/**
 * Lefutott-e már az S2 migráció? A sor KULCSAIBÓL derül ki: a PostgREST csak a
 * ténylegesen létező oszlopokat adja vissza, tehát ha a `cif` kulcs nincs is
 * jelen az objektumban, az oszlop maga hiányzik.
 *
 * MIÉRT FONTOS EZ KÜLÖN JELZÉS: enélkül a beállítás-állapot minden mezőt
 * „hiányzónak" látna, és a felület ÖRÖKKÉ nyaggatná a felhasználót egy
 * varázslóval, amit el sem tud menteni. Így viszont a felület a MIGRÁCIÓRA tud
 * mutatni — a valódi teendőre.
 */
function migracioLefutott(row: Record<string, unknown> | null): boolean {
  return !!row && 'cif' in row
}

// ─────────────────────────────────────────────────────────────────────────
// Jogosultság — FAIL-CLOSED
// ─────────────────────────────────────────────────────────────────────────

/**
 * A kerületi hatókör-kapu, a megyei `requireDioceseAccess` betűhű párja.
 *
 * @param mode `'write'` (alapértelmezés, fail-closed) = módosító művelet;
 *   `'read'` = puszta lekérdezés. A kerületi SZÁMVEVŐ (`egyhazkeruleti_szamvevo`)
 *   `'read'`-re átmegy, `'write'`-ra beszédes magyar magyarázatot kap — nem néma
 *   0 soros mentést és nem nyers RLS-hibát.
 *
 * ⚠️ MIÉRT NEM AZ `assertDistrictInScope`-ot (admin-scope.ts) HASZNÁLJUK, ahogy
 * a megyei pár teszi az `assertDioceseInScope`-pal: az admin-scope kerületi
 * feloldója SZEREP-SZŰRETLEN (bármely `district` hatókörű sor, akár `custom`
 * vagy `lelkesz`, hatókörnek számít). A megyei ágon ez rendben volt, mert ott a
 * SZŰKEBB szint ellenőrzésére szolgált; itt viszont pont a kerületi szintet
 * nyitná ki szélesebbre, mint amit az adatbázis `current_user_district_ids()`
 * függvénye enged — és visszatérne a néma 0-soros mentés hibaosztálya. Ezért a
 * kapu KIZÁRÓLAG a szerep-szűrt feloldókra épül, amelyek betűre az SQL tükrei.
 */
async function requireDistrictAccess(
  districtId?: string,
  mode: 'read' | 'write' = 'write',
) {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' as const }

  // A CÉL kitalálása, ha a hívó nem adta meg. Sorrend: írási hatókör → olvasási
  // hatókör → a tág (megjelenítési) feloldó. A tág feloldó SZÁNDÉKOSAN az utolsó:
  // egy elavult `profiles.district_id` skalár így nem tudja becsempészni magát
  // első helyre. Ha végül olyan kerület jön ki, amire nincs jogosultság, a lenti
  // kapuk fail-closed módon elutasítanak.
  const targetId =
    districtId ||
    resolveDistrictWriteScopeIds(access)[0] ||
    resolveDistrictReadScopeIds(access)[0] ||
    resolveDistrictScopeIds(access)[0] ||
    null
  if (!targetId) return { error: 'Nincs egyházkerület megadva.' as const }

  // Az ÍRÁSI kapu egyetlen forrása. A `canWriteDistrictScope` lefedi a
  // rendszergazdát/mastert, a skalár kerületi admint (a SAJÁT kerületére) és a
  // szerepkör-soros kerületi admint — pontosan úgy, ahogy az RLS.
  const canManage = canWriteDistrictScope(access, targetId)

  const readIds = resolveDistrictReadScopeIds(access)
  const rendszergazda = !!access.admin || !!access.master

  if (!canManage && mode === 'read' && (readIds.includes(targetId) || rendszergazda)) {
    return { supabase: access.supabase, userId: access.user.id, districtId: targetId }
  }

  if (!canManage) {
    // Ha van OLVASÓ hatóköre, de írni akar: mondjuk meg, MIÉRT nem megy — a
    // felület ugyanezt a szöveget mutatja a letiltott gombnál, hogy a
    // felhasználó ugyanazt olvassa mindkét helyen.
    const reason = describeDistrictWriteBlock(access, targetId)
    if (reason) return { error: reason }
    return { error: 'Nincs jogosultság az egyházkerület szerkesztéséhez.' as const }
  }

  return { supabase: access.supabase, userId: access.user.id, districtId: targetId }
}

// ─────────────────────────────────────────────────────────────────────────
// 1) Olvasás
// ─────────────────────────────────────────────────────────────────────────

/**
 * A „FELFELÉ NÉZŐ" olvasó oszlopai — a NYOMTATVÁNY-FEJLÉC és semmi több.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT EXPLICIT LISTA, ÉS NEM `select('*')` (adverzariális ellenőrzés,
 * 2026-08-16)
 * ════════════════════════════════════════════════════════════════════════════
 * TÜNET: a `getDistrict` harmadik engedélyezési ága helyesen engedi, hogy a
 * kerület alatt szolgáló lelkész/gyülekezeti tag lássa a SAJÁT kerülete adatait
 * — de a lekérdezés utána MINDENKINEK `select('*')`-ot adott. Így BÁRMELY
 * bejelentkezett felhasználó megkapta a `bank_nev`, `bank_fo_iban`,
 * `bank_fo_iban_valuta`, `megjegyzes` (belső feljegyzés), `cnp_letter`,
 * `adoszam` és `updated_by` mezőket is — miközben az ág INDOKA csak a
 * nyomtatvány-fejléc volt, amihez a név / román név / cím / CIF / címer elég.
 *
 * ⚠️ MÉLYSÉGI VÉDELEM (defense in depth): a `districts` RLS-e ma `USING(true)`,
 * tehát az adatbázis NEM állítja meg ezt — az app-réteg az EGYETLEN szűrő. Ha az
 * app tágabb marad, mint a szabályzat szándéka, visszatér a réteg-divergencia
 * hibaosztálya. Ezért: aki a KERÜLETI hatókörből jön, a teljes rekordot kapja;
 * aki „felfelé néz", KIZÁRÓLAG ezeket az oszlopokat.
 *
 * A `teszt` szándékosan BENNE van: nem érzékeny adat, viszont enélkül a
 * gyülekezeti felhasználó fejlécén nem jelenne meg a „(teszt)" jelölés, és a
 * `DistrictRecord.teszt` a két ágon mást jelentene.
 *
 * ⚠️ MIÉRT EGYETLEN SORBA ÍRT SZTRING-LITERÁL, és nem egy szép tömb + `join(', ')`:
 * a postgrest-js a visszakapott sor TÍPUSÁT a select-sztring LITERÁLJÁBÓL vezeti
 * le. Egy futásidőben összerakott (`string` típusú) sztringtől `GenericStringError`-ra
 * esik vissza, és a fordító a `data`-t hibaobjektumnak látja (TS2352). Ez tehát
 * nem formázási ízlés, hanem a típusellenőrzés kényszere — ne „szépítsük" tömbbé.
 */
const DISTRICT_FEJLEC_SELECT =
  'id, name, nev_ro, nev_en, cif, cim_orszag, cim_megye, cim_telepules, cim_iranyitoszam, cim_utca, email, telefon, weboldal, cimer_url, pecset_url, alairas_url, teszt'

/**
 * Az egyházkerület törzsadata.
 *
 * KI OLVASHATJA (a megyei `getDiocese` mintája szerint, fail-closed):
 *   · master / rendszergazda,
 *   · akinek a feloldott KERÜLETI olvasási hatókörében van (kerületi admin
 *     vagy kerületi számvevő),
 *   · aki a kerület ALATT szolgál: a saját egyházmegyéje vagy gyülekezete ebbe
 *     a kerületbe tartozik.
 *
 * ⚠️ A harmadik ág NEM sérti a K4 döntést. K4 a LEFELÉ nézést tiltja („a kerület
 * nem olvashatja a gyülekezetek és egyházmegyék adatait"); ez viszont FELFELÉ
 * nézés: a gyülekezet a saját kerülete hivatalos nevét, címerét és székhelyét
 * kéri le, mert a kétnyelvű nyomtatvány-fejlécre az kerül. Enélkül minden
 * gyülekezeti irat fejléce hiányos maradna.
 *
 * ⚠️ DE A HÁROM ÁG NEM UGYANANNYIT LÁT. A „felfelé nézés" CSAK a fejléc-oszlopokat
 * kapja (DISTRICT_FEJLEC_SELECT) — a bank, a belső megjegyzés és az adóazonosítók
 * nélkül. Lásd ott a részletes indoklást.
 */
export async function getDistrict(districtId?: string): Promise<{
  data?: DistrictRecord
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  const targetId =
    districtId ||
    resolveDistrictReadScopeIds(access)[0] ||
    resolveDistrictScopeIds(access)[0] ||
    null
  if (!targetId) return { error: 'Nincs egyházkerület megadva.' }

  // ⚠️ A HOZZÁFÉRÉS FORRÁSÁT KÜLÖN TARTJUK NYILVÁN, nem csak azt, hogy „szabad-e".
  // A lenti lekérdezés ebből dönti el, MENNYIT ad vissza: a kerületi hatókör a
  // teljes rekordot, a „felfelé nézés" csak a fejléc-oszlopokat. Ha ezt egyetlen
  // `allowed` logikai értékbe olvasztanánk vissza, a szűkítés némán elveszne.
  const keruletiHatokorbol =
    !!access.admin ||
    !!access.master ||
    resolveDistrictReadScopeIds(access).includes(targetId) ||
    canWriteDistrictScope(access, targetId)

  let allowed = keruletiHatokorbol

  // FELFELÉ nézés: a saját egyházmegyém / gyülekezetem ebbe a kerületbe tartozik?
  if (!allowed) {
    const dioceseIds = [
      access.profile?.diocese_id ?? null,
      ...access.profileRoles
        .filter((r) => r.active && r.approval_status === 'approved' && r.scope === 'diocese')
        .map((r) => r.scope_id),
    ].filter((id): id is string => !!id)

    if (dioceseIds.length > 0) {
      const { data: sajatMegye } = await access.supabase
        .from('dioceses')
        .select('id')
        .in('id', [...new Set(dioceseIds)])
        .eq('district_id', targetId)
        .limit(1)
      allowed = !!sajatMegye && sajatMegye.length > 0
    }
  }

  if (!allowed) {
    const congIds = [
      access.profileCongregationId,
      access.effectiveCongregationId,
      ...access.assignedCongregations.map((c) => c.id),
    ].filter((id): id is string => !!id)

    if (congIds.length > 0) {
      // A gyülekezet → egyházmegye → kerület lánc egyetlen lekérdezésben.
      const { data: sajatGyul } = await access.supabase
        .from('congregations')
        .select('id, dioceses:diocese_id(district_id)')
        .in('id', [...new Set(congIds)])
      allowed = ((sajatGyul || []) as Array<{ dioceses?: unknown }>).some((row) => {
        const rel = Array.isArray(row.dioceses) ? row.dioceses[0] : row.dioceses
        return (rel as { district_id?: string | null } | null)?.district_id === targetId
      })
    }
  }

  if (!allowed) {
    return { error: 'Nincs jogosultsága az egyházkerület adatainak megtekintéséhez.' }
  }

  // A kerületi hatókörből jövő olvasó a TELJES rekordot kapja; a „felfelé néző"
  // KIZÁRÓLAG a nyomtatvány-fejléc oszlopait — lásd DISTRICT_FEJLEC_SELECT.
  let sor: Record<string, unknown> | null = null
  let hiba: { message: string; code?: string } | null = null

  if (keruletiHatokorbol) {
    const res = await access.supabase
      .from('districts')
      .select('*')
      .eq('id', targetId)
      .maybeSingle()
    sor = (res.data as Record<string, unknown> | null) ?? null
    hiba = res.error
  } else {
    const res = await access.supabase
      .from('districts')
      .select(DISTRICT_FEJLEC_SELECT)
      .eq('id', targetId)
      .maybeSingle()
    sor = (res.data as Record<string, unknown> | null) ?? null
    hiba = res.error

    // ⚠️ MIÉRT KELL IDE TARTALÉK-ÁG: az explicit oszloplista — a `select('*')`-gal
    // ellentétben — HIBÁRA FUT, ha az S2 migráció még nem futott le élesben (a
    // PostgREST 42703/PGRST204-et ad az ismeretlen oszlopra). Enélkül a szűkítés
    // MINDEN gyülekezeti felhasználó fejlécét eltörné a migráció előtt — vagyis
    // egy biztonsági javításból adatvesztésnek látszó hiba lenne. Migráció előtt
    // úgyis csak az `id` és a `name` létezik, tehát pont annyit kérünk vissza.
    if (hiba && (hiba.code === '42703' || hiba.code === 'PGRST204')) {
      const tartalek = await access.supabase
        .from('districts')
        .select('id, name')
        .eq('id', targetId)
        .maybeSingle()
      sor = (tartalek.data as Record<string, unknown> | null) ?? null
      hiba = tartalek.error
    }
  }

  if (hiba) return { error: hiba.message }
  if (!sor) return { error: 'Egyházkerület nem található.' }

  return { data: sorbolRekord(sor) }
}

/**
 * Az „Egyházkerületünk" fejléc-ablak adatcsomagja: a törzsadat + a kerület
 * egyházmegyéinek DARABSZÁMA (nem az adataik!) + a migráció állapota.
 *
 * MIÉRT KÜLÖN AKCIÓ (a megyei getDioceseSummaryData párja): a read-only ablaknak
 * a puszta törzsadaton kívül kell egy „ekkora a kerület" felirat is. A
 * jogosultság-kaput NEM másoljuk le: a `getDistrict`-en át megy a hívás, így a
 * tagsági ellenőrzés egyetlen helyen él.
 *
 * ⚠️ K4: a `dioceses` táblából KIZÁRÓLAG darabszámot kérünk (`head: true`), a
 * megyék nevét és adatait NEM. A kerület nem lát bele a megyék adataiba.
 */
export async function getDistrictSummaryData(districtId?: string): Promise<{
  data?: DistrictRecord & { dioceseCount: number; migracioLefutott: boolean }
  error?: string
}> {
  const res = await getDistrict(districtId)
  if (res.error || !res.data) return { error: res.error || 'Egyházkerület nem található.' }

  const access = await getEffectiveAccessContext()

  const { count } = await access.supabase
    .from('dioceses')
    .select('id', { count: 'exact', head: true })
    .eq('district_id', res.data.id)

  // A migráció állapotát a rekordból olvassuk ki: ha MINDEN törzsadat-mező üres
  // ÉS az S2 oszlopai nincsenek meg, a felület a migrációra mutat.
  //
  // ⚠️ ITT a `select('*')` SZÁNDÉKOS, és NEM mond ellent a getDistrict oszlop-
  // szűkítésének: ez PUSZTA SZONDA — a sorból KIZÁRÓLAG azt nézzük meg, LÉTEZNEK-E
  // az oszlopok (kulcsok), maga a sor SOHA nem hagyja el a szervert. A kliensnek
  // visszaadott `res.data` a getDistrict már megszűrt rekordja.
  const { data: nyersSor } = await access.supabase
    .from('districts')
    .select('*')
    .eq('id', res.data.id)
    .maybeSingle()

  return {
    data: {
      ...res.data,
      dioceseCount: count ?? 0,
      migracioLefutott: migracioLefutott((nyersSor as Record<string, unknown> | null) ?? null),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 2) Szerkesztés
// ─────────────────────────────────────────────────────────────────────────

export async function updateDistrict(input: DistrictInput): Promise<{
  ok?: true
  error?: string
  fieldErrors?: Record<string, string>
  /** Mely mezők NEM tárolódtak, mert az oszlopuk még nem létezik élesben. */
  hianyzoOszlopok?: string[]
}> {
  const parsed = districtSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join('.')] = issue.message
    }
    return { error: 'Érvénytelen adat.', fieldErrors }
  }

  const ctx = await requireDistrictAccess(parsed.data.id)
  if ('error' in ctx) return { error: ctx.error }

  const payload = {
    name: parsed.data.name,
    nev_ro: parsed.data.nev_ro || null,
    nev_en: parsed.data.nev_en || null,
    cif: parsed.data.cif || null,
    adoszam: parsed.data.adoszam || null,
    cnp_letter: parsed.data.cnp_letter || null,
    cim_orszag: parsed.data.cim_orszag || null,
    cim_megye: parsed.data.cim_megye || null,
    cim_telepules: parsed.data.cim_telepules || null,
    cim_iranyitoszam: parsed.data.cim_iranyitoszam || null,
    cim_utca: parsed.data.cim_utca || null,
    email: parsed.data.email || null,
    telefon: parsed.data.telefon || null,
    weboldal: parsed.data.weboldal || null,
    bank_nev: parsed.data.bank_nev || null,
    bank_fo_iban: parsed.data.bank_fo_iban || null,
    bank_fo_iban_valuta: parsed.data.bank_fo_iban_valuta || 'RON',
    puspok_nev: parsed.data.puspok_nev || null,
    puspok_cim: parsed.data.puspok_cim || null,
    adminisztrator_nev: parsed.data.adminisztrator_nev || null,
    szamvevo_nev: parsed.data.szamvevo_nev || null,
    megjegyzes: parsed.data.megjegyzes || null,
    updated_by: ctx.userId,
  }

  const res = await updateDistrictFailSoft(ctx.supabase, parsed.data.id, payload)
  if (res.error) return { error: res.error }

  revalidatePath('/dashboard-kerulet')
  revalidatePath('/', 'layout')
  return res.hianyzoOszlopok?.length
    ? { ok: true, hianyzoOszlopok: res.hianyzoOszlopok }
    : { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────
// 3) SETUP WIZARD — az egyházkerület alapadatai
// ─────────────────────────────────────────────────────────────────────────

/**
 * Kötelező mezők, amelyek hiánya triggeri a setup wizardot.
 *
 * ⚠️ EZ A LISTA A `setupSchema` TÜKRE — a kettő EGYÜTT mozog, MINDKÉT IRÁNYBAN.
 * Ami a sémában kötelező (`.min(...)`), annak ITT is szerepelnie kell, és
 * fordítva. A réteg-divergencia mindkét irányban némán fáj:
 *   · ha a sémában kötelező, de innen HIÁNYZIK → a banner hallgat („kész van"),
 *     a varázsló viszont letiltja a Tovább gombot, és a felhasználó nem érti,
 *     mit akar tőle a rendszer;
 *   · ha itt kötelező, de a séma nem kéri → a banner ÖRÖKKÉ nyaggat olyan
 *     adatért, amit a varázsló maga sem kér.
 *
 * ⚠️ TÜNET, AMI EBBŐL FAKADT (adverzariális ellenőrzés, 2026-08-16): a `nev_ro`
 * KIMARADT innen, pedig a `setupSchema` és a kliens `isStepValidOn('basics')` is
 * megköveteli. Ha CSAK a román név volt üres, a `checkDistrictSetupStatus`
 * `needsSetup: false`-t adott — a banner néma maradt, a varázsló viszont az 1.
 * lépésen elakadt. Ha valaki „egyszerűsítésként" ki akarná venni: NE. Előbb a
 * `setupSchema`-ból kell kivenni a kötelezőséget, és a klienst is követni.
 *
 * ⚠️ (Endre, 2026-08-15): a BANK és a SZÁMVEVŐ SZÁNDÉKOSAN NINCS BENNE.
 *   · bank_nev / bank_fo_iban — „a banki kontók beállítása később";
 *   · szamvevo_nev — nem minden kerületnél van kiosztott számvevő.
 * Mindkettő a `setupSchema`-ban is opcionális, tehát a két réteg EGYEZIK.
 * Pontosan ez a hibaosztály okozta a megyei varázsló néma elhasalását az utolsó
 * lépésen.
 */
const REQUIRED_SETUP_FIELDS = [
  // A `nev_ro` a `name` mellett áll: a hivatalos irat fejléce KÉTNYELVŰ, tehát a
  // román alak nélkül a kerület törzsadata nincs kész (setupSchema: `.min(2)`).
  'name', 'nev_ro', 'cif', 'cim_orszag', 'cim_megye', 'cim_telepules', 'cim_iranyitoszam',
  'cim_utca', 'email', 'telefon',
  'puspok_nev', 'puspok_cim', 'adminisztrator_nev', 'cimer_url',
] as const

export interface DistrictSetupStatus {
  needsSetup: boolean
  missingFields: string[]
  districtId: string | null
  /**
   * `true`, ha a törzsadat-oszlopok MÉG NEM LÉTEZNEK élesben (S2 migráció
   * hiánya). Ilyenkor a felület NE varázslót ajánljon — az úgysem menne el —,
   * hanem a migrációra mutasson. Ez a mező a megyei párnál nem létezik, mert ott
   * egyetlen új oszlop volt; itt az EGÉSZ törzsadat új.
   */
  hianyzoMigracio: boolean
  /** Meg van-e jelölve tesztként (a néven keresztül) — a banner ezt kiírja. */
  teszt: boolean
}

/**
 * Ellenőrzi, hogy az egyházkerület alapadatai teljesen ki vannak-e töltve.
 *
 * KAPU: olvasói hatókör elég (kerületi admin / számvevő / rendszergazda);
 * jogosultság híján fail-closed „nincs teendő" választ adunk — mezőnév-lista sem
 * szivároghat ki idegen kerületről.
 */
export async function checkDistrictSetupStatus(districtId?: string): Promise<DistrictSetupStatus> {
  const ctx = await requireDistrictAccess(districtId, 'read')
  if ('error' in ctx) {
    return {
      needsSetup: false,
      missingFields: [],
      districtId: null,
      hianyzoMigracio: false,
      teszt: false,
    }
  }

  const targetId = ctx.districtId

  const { data } = await ctx.supabase
    .from('districts')
    .select('*')
    .eq('id', targetId)
    .maybeSingle()

  if (!data) {
    return {
      needsSetup: true,
      missingFields: [...REQUIRED_SETUP_FIELDS],
      districtId: targetId,
      hianyzoMigracio: false,
      teszt: false,
    }
  }

  const row = data as Record<string, unknown>
  const migracioKesz = migracioLefutott(row)

  const missing: string[] = []
  for (const field of REQUIRED_SETUP_FIELDS) {
    const value = row[field]
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      missing.push(field)
    }
  }

  return {
    needsSetup: missing.length > 0,
    missingFields: missing,
    districtId: targetId,
    hianyzoMigracio: !migracioKesz,
    teszt: keruletTesztE(typeof row.name === 'string' ? row.name : null),
  }
}

/**
 * A setup wizard TELJES mentése.
 *
 * ⚠️ A BANKSZÁMLA OPCIONÁLIS (Endre, 2026-08-15). Ha a szerver továbbra is
 * követelné, a varázsló utolsó lépése némán elhasalna — pontosan az a
 * réteg-divergencia, amit a projekt már többször megszenvedett. A kliens-oldali
 * lépés-validációnak ezt kell tükröznie.
 */
const setupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2, 'A név kötelező.'),
  // Romániában a román alak a hivatalos — a kétnyelvű fejléchez KÖTELEZŐ
  // (a megyei `dioceses.nev_ro` döntés kerületi párja).
  nev_ro: z.string().min(2, 'A román név kötelező — ez kerül a hivatalos iratok fejlécére.'),
  nev_en: z.string().optional().or(z.literal('')),
  cif: z.string().min(1, 'A CIF kötelező.'),
  adoszam: z.string().optional().or(z.literal('')),
  cnp_letter: z.string().optional().or(z.literal('')),
  cim_orszag: z.string().min(1, 'Az ország kötelező.'),
  cim_megye: z.string().min(1, 'A megye kötelező.'),
  cim_telepules: z.string().min(1, 'A település kötelező.'),
  cim_iranyitoszam: z.string().min(1, 'Az irányítószám kötelező.'),
  cim_utca: z.string().min(1, 'Az utca kötelező.'),
  email: z.string().email('Érvénytelen email.'),
  telefon: z.string().min(1, 'A telefon kötelező.'),
  weboldal: z.string().optional().or(z.literal('')),
  // Bank — NEM kötelező, lásd a fenti docblockot.
  bank_nev: z.string().optional().or(z.literal('')),
  bank_fo_iban: z.string().optional().or(z.literal('')),
  bank_fo_iban_valuta: z.string().default('RON'),
  puspok_nev: z.string().min(2, 'A püspök neve kötelező.'),
  puspok_cim: z.string().min(2, 'A püspök címe (tisztsége) kötelező.'),
  adminisztrator_nev: z.string().min(2, 'Az adminisztrátor neve kötelező.'),
  szamvevo_nev: z.string().optional().or(z.literal('')),
  cimer_url: z.string().url('Érvénytelen címer URL.'),
  // Cím FK-k — opcionálisak
  adrlocality_id: z.number().int().nullable().optional(),
  adrstreet_id: z.number().int().nullable().optional(),
})

export type DistrictSetupInput = z.infer<typeof setupSchema>

export async function saveDistrictSetup(
  input: DistrictSetupInput,
): Promise<{
  ok?: true
  error?: string
  fieldErrors?: Record<string, string>
  hianyzoOszlopok?: string[]
}> {
  const parsed = setupSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Hiányos vagy érvénytelen adat.', fieldErrors }
  }

  const ctx = await requireDistrictAccess(parsed.data.id)
  if ('error' in ctx) return { error: ctx.error }

  const payload = {
    name: parsed.data.name,
    nev_ro: parsed.data.nev_ro,
    nev_en: parsed.data.nev_en || null,
    cif: parsed.data.cif,
    adoszam: parsed.data.adoszam || null,
    cnp_letter: parsed.data.cnp_letter || null,
    cim_orszag: parsed.data.cim_orszag,
    cim_megye: parsed.data.cim_megye,
    cim_telepules: parsed.data.cim_telepules,
    cim_iranyitoszam: parsed.data.cim_iranyitoszam,
    cim_utca: parsed.data.cim_utca,
    email: parsed.data.email,
    telefon: parsed.data.telefon,
    weboldal: parsed.data.weboldal || null,
    bank_nev: parsed.data.bank_nev || null,
    bank_fo_iban: parsed.data.bank_fo_iban || null,
    bank_fo_iban_valuta: parsed.data.bank_fo_iban_valuta || 'RON',
    puspok_nev: parsed.data.puspok_nev,
    puspok_cim: parsed.data.puspok_cim,
    adminisztrator_nev: parsed.data.adminisztrator_nev,
    szamvevo_nev: parsed.data.szamvevo_nev || null,
    cimer_url: parsed.data.cimer_url,
    adrlocality_id: parsed.data.adrlocality_id ?? null,
    adrstreet_id: parsed.data.adrstreet_id ?? null,
    updated_by: ctx.userId,
  }

  const res = await updateDistrictFailSoft(ctx.supabase, parsed.data.id, payload)
  if (res.error) return { error: res.error }

  // ⚠️ NINCS `district_bealitas` auto-upsert — a kerület saját könyvelése (K2)
  // az S5 szelet, most nem épül. Lásd a fájl fejlécének (3) pontját.

  revalidatePath('/dashboard-kerulet')
  revalidatePath('/', 'layout')
  return res.hianyzoOszlopok?.length
    ? { ok: true, hianyzoOszlopok: res.hianyzoOszlopok }
    : { ok: true }
}

// ────────────────────────────────────────────────────────────────────
// RÉSZLEGES mentés — a varázsló minden lépésnél ezt hívja, ÉS kilépéskor /
// visszalépéskor is.
//
// Endre kérése: „ne kelljen újra kitölteni elölről". A kerületi adminisztrátor
// tehát bármikor abbahagyhatja: ami ki van töltve, megmarad. Csak a TÉNYLEGESEN
// átadott mezőket írjuk (az `undefined` mező érintetlen marad), az üres sztringet
// NULL-ra fordítjuk, a NOT NULL `name`-et pedig KIZÁRÓLAG nem üres értékkel
// frissítjük — különben a részleges mentés kinyírná a kerület nevét.
// A végső `saveDistrictSetup` továbbra is szigorúan validál.
// ────────────────────────────────────────────────────────────────────

const setupPartialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().optional(),
  nev_ro: z.string().optional(),
  nev_en: z.string().nullable().optional(),
  cif: z.string().optional(),
  adoszam: z.string().nullable().optional(),
  cnp_letter: z.string().nullable().optional(),
  cim_orszag: z.string().optional(),
  cim_megye: z.string().optional(),
  cim_telepules: z.string().optional(),
  cim_iranyitoszam: z.string().optional(),
  cim_utca: z.string().optional(),
  email: z.string().optional(),
  telefon: z.string().optional(),
  weboldal: z.string().nullable().optional(),
  bank_nev: z.string().optional(),
  bank_fo_iban: z.string().optional(),
  bank_fo_iban_valuta: z.string().optional(),
  puspok_nev: z.string().optional(),
  puspok_cim: z.string().optional(),
  adminisztrator_nev: z.string().optional(),
  szamvevo_nev: z.string().optional(),
  megjegyzes: z.string().nullable().optional(),
  cimer_url: z.string().optional(),
  adrlocality_id: z.number().int().nullable().optional(),
  adrstreet_id: z.number().int().nullable().optional(),
})

export type DistrictSetupPartialInput = z.infer<typeof setupPartialSchema>

export async function saveDistrictSetupStep(
  input: DistrictSetupPartialInput,
): Promise<{ ok?: true; error?: string; hianyzoOszlopok?: string[] }> {
  const parsed = setupPartialSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Érvénytelen adat a lépéshez.' }
  }

  const ctx = await requireDistrictAccess(parsed.data.id)
  if ('error' in ctx) return { error: ctx.error }

  const d = parsed.data
  const patch: Record<string, unknown> = {
    updated_by: ctx.userId,
  }

  // A `name` NOT NULL — csak nem üres értékkel frissítjük.
  if (d.name !== undefined) {
    const trimmed = d.name.trim()
    if (trimmed.length > 0) patch.name = trimmed
  }

  if (d.nev_ro !== undefined) patch.nev_ro = d.nev_ro.trim() || null
  if (d.nev_en !== undefined) patch.nev_en = d.nev_en?.trim() || null
  if (d.cif !== undefined) patch.cif = d.cif.trim() || null
  if (d.adoszam !== undefined) patch.adoszam = d.adoszam?.trim() || null
  if (d.cnp_letter !== undefined) patch.cnp_letter = d.cnp_letter?.trim() || null
  if (d.cim_orszag !== undefined) patch.cim_orszag = d.cim_orszag.trim() || null
  if (d.cim_megye !== undefined) patch.cim_megye = d.cim_megye.trim() || null
  if (d.cim_telepules !== undefined) patch.cim_telepules = d.cim_telepules.trim() || null
  if (d.cim_iranyitoszam !== undefined) patch.cim_iranyitoszam = d.cim_iranyitoszam.trim() || null
  if (d.cim_utca !== undefined) patch.cim_utca = d.cim_utca.trim() || null
  if (d.email !== undefined) patch.email = d.email.trim() || null
  if (d.telefon !== undefined) patch.telefon = d.telefon.trim() || null
  if (d.weboldal !== undefined) patch.weboldal = d.weboldal?.trim() || null
  if (d.bank_nev !== undefined) patch.bank_nev = d.bank_nev.trim() || null
  if (d.bank_fo_iban !== undefined) patch.bank_fo_iban = d.bank_fo_iban.trim() || null
  if (d.bank_fo_iban_valuta !== undefined) {
    // A valuta NOT NULL / DEFAULT 'RON' lehet — üresre SOHA nem írjuk.
    const v = d.bank_fo_iban_valuta.trim()
    if (v.length > 0) patch.bank_fo_iban_valuta = v
  }
  if (d.puspok_nev !== undefined) patch.puspok_nev = d.puspok_nev.trim() || null
  if (d.puspok_cim !== undefined) patch.puspok_cim = d.puspok_cim.trim() || null
  if (d.adminisztrator_nev !== undefined) {
    patch.adminisztrator_nev = d.adminisztrator_nev.trim() || null
  }
  if (d.szamvevo_nev !== undefined) patch.szamvevo_nev = d.szamvevo_nev.trim() || null
  if (d.megjegyzes !== undefined) patch.megjegyzes = d.megjegyzes?.trim() || null
  if (d.cimer_url !== undefined) patch.cimer_url = d.cimer_url.trim() || null
  if (d.adrlocality_id !== undefined) patch.adrlocality_id = d.adrlocality_id
  if (d.adrstreet_id !== undefined) patch.adrstreet_id = d.adrstreet_id

  // Csak ha van érdemi mező (az updated_by önmagában nem elég).
  const realFields = Object.keys(patch).filter((k) => k !== 'updated_by')
  if (realFields.length === 0) {
    return { ok: true }
  }

  const res = await updateDistrictFailSoft(ctx.supabase, d.id, patch)
  if (res.error) return { error: res.error }

  revalidatePath('/dashboard-kerulet')
  revalidatePath('/', 'layout')
  return res.hianyzoOszlopok?.length
    ? { ok: true, hianyzoOszlopok: res.hianyzoOszlopok }
    : { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────
// FAIL-SOFT ÍRÁS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Egy hiányzó-oszlop hiba oszlopnevének kinyerése.
 *
 * A PostgREST két alakban jelzi:
 *   · PGRST204 — „Could not find the 'cif' column of 'districts' in the schema cache"
 *   · 42703    — „column districts.cif does not exist"
 *
 * ⚠️ CSAPDA, AMIT ITT KEZELÜNK: a puszta `message.includes(oszlop)` szűrés
 * ELTÉVESZTHET, mert a `bank_fo_iban` RÉSZSZTRINGJE a `bank_fo_iban_valuta`-nak.
 * Ha a hiba a valutáról szólna, a naiv illesztés a `bank_fo_iban`-t venné ki a
 * payloadból, a hiba változatlanul visszatérne, és a hámozó körbe-körbe járna.
 * Ezért ELŐSZÖR az idézőjeles/pontos alakot próbáljuk kiolvasni, és csak utána
 * esünk vissza részsztring-illesztésre — akkor is a LEGHOSSZABB találattal.
 */
function hianyzoOszlopNeve(uzenet: string | undefined, kod: string | undefined): string | null {
  if (kod !== 'PGRST204' && kod !== '42703') return null
  const m = (uzenet || '').toLowerCase()
  if (!m) return null

  // (a) pontos alak: 'cif' vagy districts.cif
  const idezojeles = m.match(/'([a-z0-9_]+)'/)
  if (idezojeles && (DISTRICT_UJ_OSZLOPOK as readonly string[]).includes(idezojeles[1])) {
    return idezojeles[1]
  }
  const pontos = m.match(/districts\.([a-z0-9_]+)/)
  if (pontos && (DISTRICT_UJ_OSZLOPOK as readonly string[]).includes(pontos[1])) {
    return pontos[1]
  }

  // (b) tartalék: a LEGHOSSZABB illeszkedő ismert oszlopnév (lásd a csapdát fent)
  let talalat: string | null = null
  for (const o of DISTRICT_UJ_OSZLOPOK) {
    if (m.includes(o) && (!talalat || o.length > talalat.length)) talalat = o
  }
  return talalat
}

/**
 * FAIL-SOFT ÍRÁS a `districts` táblára, ha egy oszlop MÉG NEM LÉTEZIK élesben.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT (2026-08-15/16)
 * ════════════════════════════════════════════════════════════════════════════
 * A `districts` törzsadat-oszlopait a kerületi S2 migráció hozza létre — de a
 * projekt bizonyított hibaosztálya, hogy „a migration-fájl NEM bizonyíték arra,
 * hogy lefutott élesben". Ha a kód olyan oszlopra ír, ami még nincs meg, a
 * PostgREST PGRST204/42703-mal az EGÉSZ mentést eldobja — vagyis a felhasználó a
 * TÖBBI, tökéletesen érvényes mezőjét is elveszítené. Épp a varázslóban
 * szüntettük meg az adatvesztést; nem hozhatjuk vissza a hátsó ajtón.
 *
 * Ezért: ha a hiba ISMERT új oszlopra mutat, kivesszük a payloadból és
 * ÚJRAPRÓBÁLJUK — KÖRBEN, amíg fogynak a hiányzó oszlopok. (A megyei pár egyetlen
 * újrapróbálást tesz, mert ott EGYETLEN új oszlop volt; itt az egész törzsadat
 * új, ezért kell a ciklus.) A kihagyott mezőket `hianyzoOszlopok`-ként
 * visszajelezzük, hogy a felület a migrációra tudjon mutatni.
 *
 * A ciklus KÖTÖTT hosszú (a payload kulcsainak száma), és minden körben legalább
 * egy kulcsot eltávolít — így nem tud végtelenbe fordulni. Ha a hiba nem ismert
 * oszlopra mutat, vagy a felismert oszlop nincs is a payloadban, HANGOSAN
 * hibázunk: egy valódi fejlesztési hiba ne rejtőzhessen el a fail-soft mögött.
 */
async function updateDistrictFailSoft(
  supabase: EffectiveAccessContext['supabase'],
  districtId: string,
  payload: Record<string, unknown>,
): Promise<{ error?: string; hianyzoOszlopok?: string[] }> {
  const aktualis: Record<string, unknown> = { ...payload }
  const hianyzoOszlopok: string[] = []
  const maxKor = Object.keys(payload).length + 1

  for (let kor = 0; kor < maxKor; kor++) {
    // ⚠️ A `.select('id')` NEM dekoráció: az élő `districts` táblán ma EGYETLEN
    // ÍRÁS-POLICY SINCS (csak `districts_read` + `districts_read_anon`, mindkettő
    // SELECT). RLS alatt egy tiltott UPDATE nem hibázik — NULLA SORT ír, és a
    // PostgREST `{ error: null }`-t ad vissza. A felhasználó tehát azt látná,
    // hogy „mentve", miközben semmi nem történt. Ez a projekt egyik bizonyított
    // hibaosztálya (néma 0-soros mentés), ezért a visszaadott sorokat
    // MEGSZÁMOLJUK, és 0-nál HANGOSAN hibázunk, a valódi teendőre mutatva.
    const { data, error } = await supabase
      .from('districts')
      .update(aktualis)
      .eq('id', districtId)
      .select('id')

    if (!error) {
      if (!data || data.length === 0) {
        return {
          error:
            'A mentés nem történt meg: az adatbázis nem engedte az egyházkerület módosítását. ' +
            'Ez akkor fordul elő, ha a `districts` táblán még nincs írás-jogosultsági szabály ' +
            '(RLS policy) a kerületi adminisztrátornak — futtasd le a ' +
            'migration-docs/sql/2026-08-15-egyhazkeruleti-S2-torzsadat.sql migrációt, majd próbáld újra. ' +
            'A beírt adatok NEM vesztek el, a képernyőn maradnak.',
        }
      }
      return hianyzoOszlopok.length ? { hianyzoOszlopok } : {}
    }

    const hianyzo = hianyzoOszlopNeve(error.message, error.code)
    // Ismeretlen hiba, vagy olyan oszlop, amit nem is írunk → HANGOS hiba.
    if (!hianyzo || !(hianyzo in aktualis)) return { error: error.message }

    delete aktualis[hianyzo]
    hianyzoOszlopok.push(hianyzo)

    // Ha már csak a `name` (vagy semmi) maradna, a törzsadat-oszlopok
    // NYILVÁNVALÓAN hiányoznak — a migrációra mutató, beszédes hibát adjuk.
    const maradek = Object.keys(aktualis).filter((k) => k !== 'name')
    if (maradek.length === 0) {
      return { error: DISTRICT_MIGRACIO_HIBA }
    }
  }

  return { error: DISTRICT_MIGRACIO_HIBA }
}

// ─────────────────────────────────────────────────────────────────────────
// 4) CÍMER + IRAT-KÉPEK (pecsét, aláírás)
// ─────────────────────────────────────────────────────────────────────────

/** A kerületi képek tároló-vödre. A megyei pár `dioceses-logos`-a mintájára. */
const DISTRICT_BUCKET = 'districts-logos'

const DISTRICT_BUCKET_HIBA =
  'A `districts-logos` tároló még nem létezik — futtasd le a ' +
  'migration-docs/sql/2026-08-15-egyhazkeruleti-S2-torzsadat.sql migrációt ' +
  '(az hozza létre a vödröt és a hozzáférési szabályait), majd próbáld újra.'

/** Hiányzó Storage-vödör felismerése (MEMORY: a migration-fájl NEM bizonyíték). */
function bucketHianyzik(message: string): boolean {
  return /bucket not found|bucket.*does not exist|not found/i.test(message)
}

/**
 * Címer feltöltése a `districts-logos` Storage vödörbe.
 *
 * A fájlnév séma: {district_id}/cimer-{timestamp}.{ext} — a megyei mintával
 * azonos, hogy a vödör-szintű hozzáférési szabályok ugyanúgy a prefixre
 * épülhessenek. Visszaadja a publikus URL-t, amit a `saveDistrictSetup`
 * payloadjába kell berakni.
 */
export async function uploadDistrictCimer(
  districtId: string,
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const ctx = await requireDistrictAccess(districtId)
  if ('error' in ctx) return { error: ctx.error }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return { error: 'Nincs fájl.' }
  }

  if (file.size > 2_097_152) {
    return { error: 'A fájl mérete nem lehet több, mint 2 MB.' }
  }
  const allowedMime = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedMime.includes(file.type)) {
    return { error: 'Csak JPG, PNG vagy WEBP formátum engedélyezett.' }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const filename = `${ctx.districtId}/cimer-${Date.now()}.${ext}`

  const { error: upErr } = await ctx.supabase.storage
    .from(DISTRICT_BUCKET)
    .upload(filename, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    })

  if (upErr) {
    return { error: bucketHianyzik(upErr.message) ? DISTRICT_BUCKET_HIBA : `Feltöltés hiba: ${upErr.message}` }
  }

  const { data: urlData } = ctx.supabase.storage.from(DISTRICT_BUCKET).getPublicUrl(filename)
  return { url: urlData.publicUrl }
}

// ─────────────────────────────────────────────────────────────────────────
// Püspöki hivatali PECSÉT + ALÁÍRÁS kép — a megyei S4 szelet kerületi párja.
//
// A kép a `districts` törzsadat mellé kerül (districts.pecset_url /
// alairas_url), maga a fájl a `districts-logos` vödör {district_id}/ prefixe alá
// (a címer bevált mintája). Jogszabályi háttér: Legea 489/2006 Art. 15 — a
// pecséten a hivatalos elnevezés kötelező (a képet a püspöki hivatal a saját
// pecsétjéről tölti fel).
// ─────────────────────────────────────────────────────────────────────────

const DISTRICT_IRAT_KEP_OSZLOP = {
  pecset: 'pecset_url',
  alairas: 'alairas_url',
} as const

type DistrictIratKepFajta = keyof typeof DISTRICT_IRAT_KEP_OSZLOP

const DISTRICT_IRAT_KEP_CIMKE: Record<DistrictIratKepFajta, string> = {
  pecset: 'pecsét',
  alairas: 'aláírás',
}

const DISTRICT_IRAT_KEP_MIGRACIO_HIBA =
  'Az adatbázisból hiányzik a districts.pecset_url/alairas_url oszlop — futtasd le a ' +
  'migration-docs/sql/2026-08-15-egyhazkeruleti-S2-torzsadat.sql migrációt, majd próbáld újra.'

/** Hiányzó-oszlop hiba felismerése (MEMORY: a migration-fájl NEM bizonyíték). */
function districtIratKepOszlopHianyzik(message: string): boolean {
  return /column|does not exist|schema cache|could not find/i.test(message)
}

/**
 * Az egyházkerület pecsét- és aláírás-képének betöltése a beállítás-felülethez.
 * Hiányzó oszlopnál HANGOS hiba (a felület a migrációra mutat) — a
 * nyomtatvány-oldali, némán degradáló betöltés külön úton megy.
 */
export async function getDistrictIratKepek(districtId?: string): Promise<{
  pecsetUrl: string | null
  alairasUrl: string | null
  error: string | null
}> {
  const ctx = await requireDistrictAccess(districtId, 'read')
  if ('error' in ctx) {
    return {
      pecsetUrl: null,
      alairasUrl: null,
      error: ctx.error ?? 'Nincs jogosultság az egyházkerülethez.',
    }
  }

  const { data, error } = await ctx.supabase
    .from('districts')
    .select('pecset_url, alairas_url')
    .eq('id', ctx.districtId)
    .maybeSingle()

  if (error) {
    return {
      pecsetUrl: null,
      alairasUrl: null,
      error: districtIratKepOszlopHianyzik(error.message)
        ? DISTRICT_IRAT_KEP_MIGRACIO_HIBA
        : error.message,
    }
  }
  const row = (data || null) as { pecset_url: string | null; alairas_url: string | null } | null
  return {
    pecsetUrl: row?.pecset_url?.trim() || null,
    alairasUrl: row?.alairas_url?.trim() || null,
    error: null,
  }
}

/**
 * Pecsét- vagy aláírás-kép feltöltése + azonnali mentése a `districts` sorra.
 *
 * A gyülekezeti/megyei párral azonos szabályok: CSAK PNG/WEBP (átlátszó háttér —
 * a kép a nyomtatvány szövegére kerül, a JPG fehér téglalapja eltakarná), plafon
 * 1 MB (a kép data: URI-ként ágyazódik minden nyomtatványba).
 */
export async function uploadDistrictIratKep(
  districtId: string,
  fajta: DistrictIratKepFajta,
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const oszlop = DISTRICT_IRAT_KEP_OSZLOP[fajta]
  if (!oszlop) return { error: 'Ismeretlen kép-fajta.' }

  // 'write' mód: a kerületi számvevő (ellenőr) beszédes magyar magyarázatot kap.
  const ctx = await requireDistrictAccess(districtId)
  if ('error' in ctx) return { error: ctx.error }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) return { error: 'Nincs fájl.' }
  if (file.size > 1_048_576) {
    return {
      error: `A ${DISTRICT_IRAT_KEP_CIMKE[fajta]}-kép legfeljebb 1 MB lehet — kicsinyítsd le, és próbáld újra.`,
    }
  }
  const allowedMime = ['image/png', 'image/webp']
  if (!allowedMime.includes(file.type)) {
    return {
      error:
        `A ${DISTRICT_IRAT_KEP_CIMKE[fajta]}-képhez PNG vagy WEBP formátum kell (átlátszó háttérrel) — ` +
        'a JPG fehér téglalapja eltakarná a nyomtatvány szövegét.',
    }
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `${ctx.districtId}/${fajta}-${Date.now()}-${safeName}`

  const { error: upErr } = await ctx.supabase.storage
    .from(DISTRICT_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type })
  if (upErr) {
    return { error: bucketHianyzik(upErr.message) ? DISTRICT_BUCKET_HIBA : `Feltöltés hiba: ${upErr.message}` }
  }

  const { data: urlData } = ctx.supabase.storage.from(DISTRICT_BUCKET).getPublicUrl(path)
  const url = urlData.publicUrl

  // A `.select('id')` a néma 0-soros mentés ellen — lásd updateDistrictFailSoft.
  const { data: irtSorok, error: dbErr } = await ctx.supabase
    .from('districts')
    .update({ [oszlop]: url })
    .eq('id', ctx.districtId)
    .select('id')
  if (dbErr) {
    return {
      error: districtIratKepOszlopHianyzik(dbErr.message)
        ? DISTRICT_IRAT_KEP_MIGRACIO_HIBA
        : `A kép feltöltődött, de a mentése nem sikerült: ${dbErr.message}`,
    }
  }
  if (!irtSorok || irtSorok.length === 0) {
    return {
      error:
        `A ${DISTRICT_IRAT_KEP_CIMKE[fajta]}-kép feltöltődött, de a mentése nem történt meg: az ` +
        'adatbázis nem engedte az egyházkerület módosítását (hiányzó írás-jogosultsági szabály). ' +
        'Futtasd le a migration-docs/sql/2026-08-15-egyhazkeruleti-S2-torzsadat.sql migrációt, majd próbáld újra.',
    }
  }

  revalidatePath('/iktato')
  revalidatePath('/dashboard-kerulet')
  return { url }
}

/** A pecsét- vagy aláírás-kép LEVÉTELE (az URL törlése a `districts` sorról). */
export async function clearDistrictIratKep(
  districtId: string,
  fajta: DistrictIratKepFajta,
): Promise<{ ok?: true; error?: string }> {
  const oszlop = DISTRICT_IRAT_KEP_OSZLOP[fajta]
  if (!oszlop) return { error: 'Ismeretlen kép-fajta.' }
  const ctx = await requireDistrictAccess(districtId)
  if ('error' in ctx) return { error: ctx.error }

  // A `.select('id')` a néma 0-soros mentés ellen — lásd updateDistrictFailSoft.
  const { data: irtSorok, error } = await ctx.supabase
    .from('districts')
    .update({ [oszlop]: null })
    .eq('id', ctx.districtId)
    .select('id')
  if (error) {
    return {
      error: districtIratKepOszlopHianyzik(error.message)
        ? DISTRICT_IRAT_KEP_MIGRACIO_HIBA
        : error.message,
    }
  }
  if (!irtSorok || irtSorok.length === 0) {
    return {
      error:
        `A ${DISTRICT_IRAT_KEP_CIMKE[fajta]}-kép levétele nem történt meg: az adatbázis nem engedte ` +
        'az egyházkerület módosítását (hiányzó írás-jogosultsági szabály). Futtasd le a ' +
        'migration-docs/sql/2026-08-15-egyhazkeruleti-S2-torzsadat.sql migrációt, majd próbáld újra.',
    }
  }
  revalidatePath('/iktato')
  revalidatePath('/dashboard-kerulet')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────
// 5) VEZETŐ-JELÖLTEK (Endre kérése: listából, ne kézzel gépelve)
// ─────────────────────────────────────────────────────────────────────────
//
// MIÉRT: a beállítás-varázslóban a püspök, az adminisztrátor és a számvevő nevét
// kézzel kellene begépelni. A kézzel írt név elszakad a rendszerben
// nyilvántartott személytől — ugyanaz a hibaosztály, mint a
// `congregations.district` szöveges oszlopé: ugyanaz az adat két helyen él, és
// némán széthúzhat (elgépelés, névváltozás, „dr." elé vagy mögé, ékezet-hiány).
// A hivatalos iraton pedig más név szerepelne, mint a rendszerben.
//
// ⚠️ A JELÖLT-LISTA FORRÁSA ITT MÁS, MINT A MEGYEI PÁRNÁL — ez a K4 döntés
// egyenes következménye. A megyei `getDioceseVezetoJeloltek` a megye
// GYÜLEKEZETEINEK LELKÉSZEIT is felkínálja; a kerület viszont „nem olvashatja a
// gyülekezetek és egyházmegyék adatait". Ezért itt KÉT forrásból építkezünk:
//
//   (a) `district` hatókörű, jóváhagyott, aktív `profile_roles` sorok ERRE a
//       kerületre (egyhazkeruleti_admin / egyhazkeruleti_szamvevo) — őket a
//       rendszergazdai felületen már nevesítve kiosztották;
//   (b) a kerület egyházmegyéinek ESPERESEI (`diocese` hatókörű `esperes`
//       sorok) — ők a kerületi közgyűlés tagjai, tehát a KERÜLET hivatalos
//       testületének nevesített tagjai. Ez nem „a megye belső adata": a
//       lekérdezés csak azt tudja meg, KI az esperes, nem azt, mi van a megye
//       könyvelésében vagy nyilvántartásában.
//
// A gyülekezeti lelkészek SZÁNDÉKOSAN KIMARADNAK. Nem azért, mert technikailag
// nehéz lenne, hanem mert K4 tiltja — és mert a kerület vezetőjét úgysem a
// gyülekezeti lelkészek listájából választják.
//
// FAIL-CLOSED: a lekérdezés a kerületi OLVASÓ hatókörhöz kötött; hatókör nélkül
// üres listát ad, SOHA nem szűretlen felhasználó-listát.

export interface VezetoJelolt {
  profileId: string
  nev: string
  email: string | null
  /** Honnan ismerjük — a felületen ez a magyarázat jelenik meg a név mellett. */
  honnan: string
}

export interface VezetoJeloltek {
  /** A kerületi szerepkör-sorral rendelkezők + a kerület egyházmegyéinek esperesei. */
  jeloltek: VezetoJelolt[]
  /**
   * Akinek MÁR VAN nevesített KERÜLETI szerepköre (a rendszergazdai felületről).
   *
   * A kulcsok a kerületi tisztségeket követik (püspök / adminisztrátor /
   * számvevő), a megyei pár esperes / jegyző / számvevő hármasának megfelelő
   * helyeken — a `VezetoJelolt` alak viszont BETŰHŰEN azonos, mert a közös
   * `components/shared/vezeto-valaszto.tsx` ezt várja.
   *
   * ⚠️ A `puspok` mező azért az `egyhazkeruleti_admin` szerepű sorból jön, mert
   * az adatbázisban NINCS külön „püspök" szerepkör (Endre: „püspök,
   * adminisztrátorok"). A kerület hivatalos ügyvivője az egyházkerületi
   * adminisztrátori szerepkör; a felület ezt AJÁNLATKÉNT kínálja fel, a
   * felhasználó felülírhatja. Ha valaha lesz nevesített püspök-szerepkör, csak
   * ezt a két sort kell átírni.
   */
  hozzarendelt: {
    puspok: VezetoJelolt | null
    adminisztrator: VezetoJelolt | null
    szamvevo: VezetoJelolt | null
  }
  /** Igaz, ha a hatókör feloldható volt (különben a felület magyarázatot ír ki). */
  feloldhato: boolean
}

const URES_JELOLTEK: VezetoJeloltek = {
  jeloltek: [],
  hozzarendelt: { puspok: null, adminisztrator: null, szamvevo: null },
  feloldhato: false,
}

export async function getDistrictVezetoJeloltek(districtId?: string): Promise<VezetoJeloltek> {
  // OLVASÓ hatókör: a kerületi számvevő is megnézheti, ki a kerület vezetése.
  const ctx = await requireDistrictAccess(districtId, 'read')
  if ('error' in ctx) return URES_JELOLTEK

  const { supabase } = ctx
  const keruletId = ctx.districtId

  // (1) KERÜLETI szerepkör-sorok erre az egyházkerületre.
  const { data: keruletiSorok } = await supabase
    .from('profile_roles')
    .select('profile_id, role')
    .eq('scope', 'district')
    .eq('scope_id', keruletId)
    .eq('active', true)
    .eq('approval_status', 'approved')

  // (2) A kerület egyházmegyéi — KIZÁRÓLAG az esperes-sorok felderítéséhez.
  //     (K4: a megyék belső adatait nem kérdezzük, csak az id-t és a nevet, hogy
  //     a jelölt mellé ki tudjuk írni, MELYIK megye esperese.)
  const { data: megyek } = await supabase
    .from('dioceses')
    .select('id, name')
    .eq('district_id', keruletId)
  const megyeIds = (megyek ?? []).map((m) => String(m.id))
  const megyeNev = new Map((megyek ?? []).map((m) => [String(m.id), String(m.name || '')]))

  // (3) A megyék ESPERESEI — a kerületi közgyűlés tagjai.
  let esperesSorok: Array<{ profile_id: string; scope_id: string }> = []
  if (megyeIds.length > 0) {
    const { data } = await supabase
      .from('profile_roles')
      .select('profile_id, scope_id')
      .eq('scope', 'diocese')
      .eq('role', 'esperes')
      .eq('active', true)
      .eq('approval_status', 'approved')
      .in('scope_id', megyeIds)
    esperesSorok = (data ?? []) as Array<{ profile_id: string; scope_id: string }>
  }

  // (4) A nevek egyetlen lekérdezéssel.
  const profilIds = [
    ...new Set([
      ...(keruletiSorok ?? []).map((r) => String(r.profile_id)),
      ...esperesSorok.map((r) => String(r.profile_id)),
    ]),
  ]
  if (profilIds.length === 0) {
    return { ...URES_JELOLTEK, feloldhato: true }
  }

  const { data: profilok } = await supabase
    .from('profiles')
    .select('id, full_name, email, status')
    .in('id', profilIds)

  const profil = new Map(
    (profilok ?? [])
      // Csak AKTÍV fiókot kínálunk fel — egy függőben lévő regisztrálót nem
      // szabad hivatalos irat aláírójaként felajánlani.
      .filter((p) => (p as { status?: string }).status === 'active')
      .map((p) => [
        String((p as { id: string }).id),
        {
          nev: String((p as { full_name?: string | null }).full_name || '').trim(),
          email: ((p as { email?: string | null }).email || null) as string | null,
        },
      ]),
  )

  const KERULETI_SZEREP_FELIRAT: Record<string, string> = {
    egyhazkeruleti_admin: 'egyházkerületi adminisztrátor (kiosztott szerepkör)',
    egyhazkeruleti_szamvevo: 'egyházkerületi számvevő (kiosztott szerepkör)',
  }

  const jeloltMap = new Map<string, VezetoJelolt>()
  const felvesz = (id: string, honnan: string) => {
    const p = profil.get(id)
    if (!p || p.nev.length === 0) return
    const meglevo = jeloltMap.get(id)
    if (meglevo) {
      // Ha valaki több jogcímen is jelölt, mindkettőt kiírjuk.
      if (!meglevo.honnan.includes(honnan)) meglevo.honnan += ` · ${honnan}`
      return
    }
    jeloltMap.set(id, { profileId: id, nev: p.nev, email: p.email, honnan })
  }

  for (const r of keruletiSorok ?? []) {
    const szerep = String(r.role)
    felvesz(String(r.profile_id), KERULETI_SZEREP_FELIRAT[szerep] ?? `kerületi szerepkör: ${szerep}`)
  }
  for (const r of esperesSorok) {
    const nev = megyeNev.get(String(r.scope_id)) || 'egyházmegye'
    felvesz(String(r.profile_id), `esperes — ${nev}`)
  }

  const elso = (szerep: string): VezetoJelolt | null => {
    const sor = (keruletiSorok ?? []).find((r) => String(r.role) === szerep)
    if (!sor) return null
    return jeloltMap.get(String(sor.profile_id)) ?? null
  }

  return {
    jeloltek: [...jeloltMap.values()].sort((a, b) => a.nev.localeCompare(b.nev, 'hu')),
    hozzarendelt: {
      // Lásd a `hozzarendelt` mező docblockját: nincs külön püspök-szerepkör,
      // a kerület hivatalos ügyvivője az egyházkerületi adminisztrátor.
      puspok: elso('egyhazkeruleti_admin'),
      adminisztrator: elso('egyhazkeruleti_admin'),
      szamvevo: elso('egyhazkeruleti_szamvevo'),
    },
    feloldhato: true,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// KERÜLETI PÉNZÜGYI BEÁLLÍTÁS-SOR (2026-08-17, S5)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Biztosítja, hogy létezik a `district_bealitas` sor az adott évre.
 *
 * A kerületi Pénzügy oldalon első belépéskor hívódik, a megyei
 * `ensureDioceseBealitasForYear` betűhű tükreként. NINCS user-input: felsőbb
 * szinten nincs éves egyházfenntartói járulék, csak egy üres zászlókkal
 * rendelkező sor kell, hogy az `initFinance` ne adjon vissza `settings: null`-t.
 *
 * MIÉRT KELL EGYÁLTALÁN: a véglegesítés-zászlók (`szamadas_veglegesitve`,
 * `koltsegvetes_veglegesitve`) ezen a soron élnek. Ha a sor hiányzik, a
 * felület nem tudja megkülönböztetni a „még nem véglegesített" és a „nincs is
 * ilyen év" állapotot — az elsőnél dolgozni kell, a másodiknál nincs mit.
 *
 * FAIL-CLOSED: a `requireDistrictAccess` írási kapuján megy át, tehát a
 * kerületi SZÁMVEVŐ (aki olvas, de nem ír) itt beszédes hibát kap, nem néma
 * 403-at az RLS-től.
 */
export async function ensureDistrictBealitasForYear(
  districtId: string,
  year: number,
): Promise<{ ok?: true; error?: string }> {
  const ctx = await requireDistrictAccess(districtId)
  if ('error' in ctx) return { error: ctx.error }

  const { error } = await ctx.supabase
    .from('district_bealitas')
    .upsert(
      {
        district_id: ctx.districtId,
        eve: year,
        koltsegvetes_veglegesitve: false,
        szamadas_veglegesitve: false,
      },
      { onConflict: 'district_id,eve' },
    )

  // A tábla az S5b SQL-lel jön létre. Amíg Endre nem futtatta le, a PostgREST
  // 42P01/PGRST205-öt ad — ilyenkor NE néma üres oldalt adjunk, hanem mondjuk
  // meg, mi hiányzik. (Ugyanaz a hibaosztály, mint a `nev_hu`-é: a migration-
  // fájl megléte NEM bizonyíték arra, hogy élesben is lefutott.)
  if (error) {
    const hianyzoTabla =
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      /district_bealitas/i.test(error.message)
    return {
      error: hianyzoTabla
        ? 'Az egyházkerületi könyvelés adattáblái még nincsenek felvéve. Futtatandó SQL: 2026-08-17-egyhazkeruleti-S5b-penzugy-tablak.sql'
        : error.message,
    }
  }
  return { ok: true }
}
