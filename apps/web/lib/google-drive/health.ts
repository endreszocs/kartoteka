import 'server-only'

/**
 * A MENTÉS-RENDSZER ŐRSZEME (2026-08-11).
 *
 * ─── MIÉRT NINCS KÜLÖN ŐRSZEM-CRON ─────────────────────────────────────────
 * A figyelmeztető sáv MAGA az őrszem: szerver-oldalon, OLDALBETÖLTÉSKOR
 * számolódik a `max(finished_at)`-ból. Nem attól függ, hogy a mentő kód
 * lefutott-e. Ha a cron törlődik, ha a deploy elromlik, ha a route 500-at ad —
 * a sáv AKKOR IS megjelenik, mert a HIÁNYBÓL számol.
 * A riasztás nem lakhat abban, amit figyel.
 *
 * ─── A ZÖLD BIZONYÍTÁSA ────────────────────────────────────────────────────
 * ⚠️ `status = 'ok'` ÖNMAGÁBAN NEM ELÉG. Csak az a mentés számít, amelyiket
 * a rendszer VISSZA IS OLVASTA a Drive-ról és a hash egyezett
 * (`drive_verified_at IS NOT NULL`). Egy „ok" sor igazolás nélkül PIROS.
 * Ez a modul soha nem állít elő zöldet, amit nem tud bizonyítani.
 *
 * ─── BEVALLOTT KORLÁT ──────────────────────────────────────────────────────
 * Ha senki nem lép be az alkalmazásba, a sávot senki nem látja. Ezért fut a
 * cron-szkript hibás kilépési kóddal, és ezért megy e-mail is.
 */

import { selectAllPaged } from '@kartoteka/supabase-client'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  ISMERETLEN_SZULETES,
  napEletkora,
  napEltol,
  huNap,
  savDontes,
  szuletesbol,
  type MentesSzuletes,
} from '@/lib/backup/mentes-kora'
import { bukarestiNapKulcs, huIdopontBukarest } from '@/lib/utils/idopont-bukarest'

import { isMissingTableError } from './settings'
import {
  ELAVULT_ORA,
  KRITIKUS_ORA,
  type BackupHealth,
  type DailyCoverage,
  type PulseDay,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Dátum-segédek — Europe/Bucharest HELYI nap (a cron 02:00-kor fut ott)
// ─────────────────────────────────────────────────────────────────────────────

export function bukarestiNap(date: Date = new Date()): string {
  // 'en-CA' → YYYY-MM-DD. A napváltás a mentés naptári kulcsa, ezért a
  // szerver UTC-je NEM használható: 23:00 UTC-kor Bukarestben már holnap van.
  return bukarestiNapKulcs(date)
}

// ⚠️ A `napEltol` és a `huNap` 2026-08-11 óta a `lib/backup/mentes-kora.ts`-ben
//    lakik, mert a SÁV-DÖNTÉS is használja, azt pedig tiszta, önállóan
//    fordítható (és így tesztelhető) modulban kellett tartani. A régi
//    hívási helyek kedvéért innen is elérhetők — DE MÁSOLAT NINCS BELŐLÜK.
export { napEltol, huNap }

/**
 * ⚠️ 2026-08-11 JAVÍTÁS — EZ A FÜGGVÉNY A SZERVER ZÓNÁJÁT HASZNÁLTA.
 *
 * A fájl `server-only`, tehát ez a formázás MINDIG a Railway-konténerben fut,
 * ahol nincs `TZ` beállítva → UTC. A tulajdonos ezért a kártya fejlécében
 * „15:32"-t látott, közvetlenül alatta viszont (a böngészőben formázott sorban)
 * „18:32"-t — ugyanarról az eseményről. A helyes érték a 18:32.
 *
 * Mostantól a formázás a KÖZÖS, Europe/Bucharest-re szögezett modulból jön, amit
 * a kliens-komponensek is ugyanígy használnak — így a két szám nem tud
 * széthúzni. ⛔ Kézi óra-eltolás TILOS: a különbség télen 2 óra, nem 3.
 */
export function huIdopont(iso: string | null): string {
  return huIdopontBukarest(iso, 'long')
}

// ─────────────────────────────────────────────────────────────────────────────
// A hatókör: melyik gyülekezetekre VÁRUNK mentést
// ─────────────────────────────────────────────────────────────────────────────

export interface ScopeInput {
  /** `null` = korlátlan (master / rendszergazda). Üres tömb = SEMMI. */
  congregationIds: string[] | null
}

interface CongregationRow {
  id: string
  name: string | null
  nev_hu: string | null
}

/** Az aktív gyülekezetek a hatókörben. Hiba esetén DOB — nem ad üres listát. */
export async function loadScopedCongregations(
  supabase: SupabaseClient,
  scope: ScopeInput,
): Promise<CongregationRow[]> {
  if (scope.congregationIds !== null && scope.congregationIds.length === 0) return []

  let query = supabase.from('congregations').select('id, name, nev_hu').eq('status', 'active')
  if (scope.congregationIds !== null) {
    query = query.in('id', scope.congregationIds)
  }
  const { data, error } = await query.order('id', { ascending: true })
  if (error) {
    // Néma nulla helyett hangos hiba: „0 gyülekezet, minden rendben" a
    // legrosszabb lehetséges válasz egy mentés-felügyelettől.
    throw new Error(`A gyülekezetek listája nem tölthető be: ${error.message}`)
  }
  return (data ?? []) as CongregationRow[]
}

export function congregationNev(c: CongregationRow): string {
  return (c.nev_hu || c.name || c.id).trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Napló-lekérdezés
// ─────────────────────────────────────────────────────────────────────────────

interface LogSlice {
  id: number
  scope: 'gyulekezet' | 'globalis'
  congregation_id: string | null
  status: 'fut' | 'ok' | 'hiba'
  drive_verified_at: string | null
  run_date: string
  kind: string
}

/**
 * A 14 napos napló-szelet.
 *
 * ⚠️ LAPOZOTT OLVASÁS (2026-08-11 javítás). A szelet mérete
 * 14 nap × (gyülekezetek + 1) sor: 72 gyülekezet fölött ÁTLÉPI a PostgREST
 * 1000 soros plafonját, ami NÉMÁN csonkol. A csonkolt szeletből a lefedettség
 * „hiányzik"-ot mutatna olyan gyülekezetekre, amelyeknek megvan a mentése —
 * vagy fordítva. Egy felügyeleti kijelző, ami tévedhet, rosszabb a semminél.
 */
/**
 * ⚠️ 2026-08-16 — MIÉRT DARABOLUNK: a `.in()` szűrő a KÉRÉS URL-JÉBE kerül.
 *
 * TÜNET VOLT: a mentés-sáv azt írta, hogy „A mentési napló nem olvasható — nem
 * tudjuk igazolni, hogy készült-e mentés", MIKÖZBEN ugyanazon az oldalon alatta
 * ott állt, hogy mind a 784 mentés elkészült ÉS ellenőrizve lett. A sáv és a lap
 * ELLENTMONDOTT egymásnak.
 *
 * AZ OK: a sáv a BEKAPCSOLT PROFIL hatókörével metsz (display-scope-core —
 * „metszet(jogosultság, profil), soha unió"). Kerületi profilban ez ~500
 * gyülekezet-azonosító, amit a PostgREST egyetlen `in.(uuid,uuid,…)`
 * query-paraméterbe fűz: ~19 KB URL. A Supabase előtti proxy ezt 414-gyel
 * eldobja — a lekérdezés tehát nem 0 sort ad, hanem HIBÁZIK. A lap alatta
 * azért volt zöld, mert ott a hatókör szűretlen (`null`), így nincs `in()`.
 *
 * Ez ugyanaz a hibaosztály, mint a „GRANT nélküli policy": az őrszem nem tagad,
 * hanem elszáll — és a hibából a felület „nem tudjuk igazolni"-t csinál. Egy
 * riasztás, ami téved, rosszabb a semminél: elszoktat attól, hogy komolyan vedd.
 *
 * A darabszám óvatos: 80 × 37 karakter ≈ 3 KB, bőven a 8 KB-os proxy-korlát
 * alatt, a többi szűrővel és a fejlécekkel együtt is.
 */
const IN_SZURO_DARAB = 80

function darabokra<T>(lista: T[], meret: number): T[][] {
  const ki: T[][] = []
  for (let i = 0; i < lista.length; i += meret) ki.push(lista.slice(i, i + meret))
  return ki
}

/**
 * A 14 napos napló-szelet.
 *
 * ⚠️ LAPOZOTT OLVASÁS (2026-08-11 javítás). A szelet mérete
 * 14 nap × (gyülekezetek + 1) sor: 72 gyülekezet fölött ÁTLÉPI a PostgREST
 * 1000 soros plafonját, ami NÉMÁN csonkol. A csonkolt szeletből a lefedettség
 * „hiányzik"-ot mutatna olyan gyülekezetekre, amelyeknek megvan a mentése —
 * vagy fordítva. Egy felügyeleti kijelző, ami tévedhet, rosszabb a semminél.
 *
 * ⚠️ 2026-08-16: a hatókör-szűrő DARABOKBAN megy (lásd IN_SZURO_DARAB).
 */
async function loadLogSlice(
  supabase: SupabaseClient,
  scope: ScopeInput,
  tolNap: string,
  igNap: string,
): Promise<{ rows: LogSlice[]; needsSql: boolean; error?: string }> {
  const alap = () =>
    supabase
      .from('backup_log')
      .select('id, scope, congregation_id, status, drive_verified_at, run_date, kind')
      .gte('run_date', tolNap)
      .lte('run_date', igNap)
      .eq('kind', 'napi')

  // Szűretlen (rendszergazdai) ág — nincs `in()`, nincs URL-korlát.
  if (scope.congregationIds === null) {
    const paged = await selectAllPaged<LogSlice>(alap(), { maxRows: 200_000 })
    if (paged.error) {
      if (isMissingTableError(paged.error as { message?: string; code?: string })) {
        return { rows: [], needsSql: true }
      }
      return { rows: [], needsSql: false, error: paged.error.message }
    }
    return { rows: paged.data, needsSql: false }
  }

  if (scope.congregationIds.length === 0) return { rows: [], needsSql: false }

  // A kerületi admin a `globalis` hatókört NEM látja — csak a saját
  // gyülekezeteit. Az `in` szűrő a NULL congregation_id-t kizárja.
  const osszes: LogSlice[] = []
  for (const csoport of darabokra(scope.congregationIds, IN_SZURO_DARAB)) {
    const paged = await selectAllPaged<LogSlice>(
      alap().in('congregation_id', csoport),
      { maxRows: 200_000 },
    )
    if (paged.error) {
      if (isMissingTableError(paged.error as { message?: string; code?: string })) {
        return { rows: [], needsSql: true }
      }
      return { rows: [], needsSql: false, error: paged.error.message }
    }
    osszes.push(...paged.data)
  }
  return { rows: osszes, needsSql: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// Egészség
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A legutóbbi IGAZOLT mentés. A lekérdezés SZÁNDÉKOSAN szűr a
 * `drive_verified_at IS NOT NULL`-ra — igazolás nélkül nincs zöld.
 */
export async function computeBackupHealth(
  supabase: SupabaseClient,
  scope: ScopeInput,
  driveHiba: string | null,
): Promise<{ health: BackupHealth; needsSql: boolean; error?: string }> {
  const alap = () =>
    supabase
      .from('backup_log')
      .select('finished_at')
      .eq('status', 'ok')
      .not('drive_verified_at', 'is', null)
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(1)

  if (scope.congregationIds !== null && scope.congregationIds.length === 0) {
    return {
      health: {
        allapot: 'nincs_mentes',
        utolsoIgazoltAt: null,
        oraSzam: null,
        driveHiba,
        mondat: 'Ehhez a hatókörhöz nem tartozik gyülekezet, ezért mentési adat sem.',
      },
      needsSql: false,
    }
  }

  // ⚠️ 2026-08-16: a hatókör-szűrő DARABOKBAN megy — lásd az IN_SZURO_DARAB
  //    docblockját. Kerületi profilban ~500 azonosító egyetlen URL-be nem fér
  //    bele, és a lekérdezés nem 0 sort ad, hanem 414-gyel HIBÁZIK. Innen jött
  //    a „nem tudjuk igazolni, hogy készült-e mentés" üzenet olyankor is,
  //    amikor a mentés hibátlanul lefutott.
  //    Csak a LEGKÉSŐBBI időbélyeg kell, ezért darabonként `limit 1`, és a
  //    végén a maximumot vesszük — a részeredmények sorrendje közömbös.
  let data: Array<{ finished_at: string | null }> | null = null
  let error: { message: string; code?: string } | null = null

  if (scope.congregationIds === null) {
    const res = await alap()
    data = res.data as Array<{ finished_at: string | null }> | null
    error = res.error
  } else {
    let legkesobbi: string | null = null
    for (const csoport of darabokra(scope.congregationIds, IN_SZURO_DARAB)) {
      const res = await alap().in('congregation_id', csoport)
      if (res.error) {
        error = res.error
        break
      }
      const ertek = (res.data as Array<{ finished_at: string | null }> | null)?.[0]?.finished_at
      // ISO-8601 UTC időbélyegek: a szöveges összehasonlítás sorrendhelyes.
      if (ertek && (!legkesobbi || ertek > legkesobbi)) legkesobbi = ertek
    }
    if (!error) data = legkesobbi ? [{ finished_at: legkesobbi }] : []
  }
  if (error) {
    if (isMissingTableError(error)) {
      return {
        health: {
          allapot: 'sql_hianyzik',
          utolsoIgazoltAt: null,
          oraSzam: null,
          driveHiba,
          mondat:
            'A biztonsági mentés adatbázis-része még nincs telepítve — a rendszer JELENLEG NEM KÉSZÍT mentést.',
        },
        needsSql: true,
      }
    }
    // ⚠️ 2026-08-16: A HIBA OKÁT IS KIÍRJUK. Korábban csak az általános mondat
    //    ment ki, az `error.message` pedig a hívási láncban elveszett
    //    (a computeBannerHealth nem adja tovább az `error` mezőt). Ettől a sáv
    //    „a napló nem olvasható"-t állított, miközben ugyanazon az oldalon
    //    alatta ott volt a zöld, igazolt mentés — és semmi nem árulta el, MIÉRT.
    //    Ez a fájl a lefedettség-hibánál MÁR kiírja az okot (lásd savAllapot);
    //    itt ugyanaz az elv: a „nem tudom" legyen MAGYARÁZOTT, ne rejtélyes.
    return {
      health: {
        allapot: 'nincs_mentes',
        utolsoIgazoltAt: null,
        oraSzam: null,
        driveHiba,
        mondat:
          'A mentési napló nem olvasható — nem tudjuk igazolni, hogy készült-e mentés. ' +
          `A hiba: ${error.message}`,
      },
      needsSql: false,
      error: error.message,
    }
  }

  const utolso = (data ?? [])[0]?.finished_at as string | undefined
  if (!utolso) {
    return {
      health: {
        allapot: 'nincs_mentes',
        utolsoIgazoltAt: null,
        oraSzam: null,
        driveHiba,
        mondat: 'MÉG EGYETLEN ELLENŐRZÖTT BIZTONSÁGI MENTÉS SEM KÉSZÜLT.',
      },
      needsSql: false,
    }
  }

  const oraSzam = (Date.now() - new Date(utolso).getTime()) / 3_600_000
  const allapot: BackupHealth['allapot'] =
    oraSzam > KRITIKUS_ORA ? 'kritikus' : oraSzam > ELAVULT_ORA ? 'elavult' : 'friss'

  const napok = Math.floor(oraSzam / 24)
  const mondat =
    allapot === 'friss'
      ? `Az utolsó ellenőrzött mentés: ${huIdopont(utolso)}.`
      : allapot === 'elavult'
        ? `${napok >= 1 ? `${napok} napja` : `${Math.round(oraSzam)} órája`} nem készült ellenőrzött biztonsági mentés.`
        : `TÖBB MINT ${napok} NAPJA nem készült ellenőrzött biztonsági mentés.`

  return {
    health: { allapot, utolsoIgazoltAt: utolso, oraSzam, driveHiba, mondat },
    needsSql: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A RENDSZER SZÜLETÉSNAPJA — a napló és a beállítások legkorábbi nyoma
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MIKOR LÉTEZETT ELŐSZÖR A MENTÉS-RENDSZER.
 *
 * ⚠️ SZÁNDÉKOSAN HATÓKÖR NÉLKÜL kérdezzük le a napló legkorábbi sorát: a
 * kérdés a RENDSZERRŐL szól, nem egy gyülekezetről. A hatókörre szűkített
 * minimum KÉSŐBBI dátumot adna, vagyis HOSSZABB bejáratást és KEVESEBB riadót —
 * ez a rossz irány. A globális minimum a legkorábbi, tehát a legszigorúbb.
 *
 * A döntési szabályt (miért a legkorábbi nyom nyer, mikor jár le a bejáratás)
 * a `lib/backup/mentes-kora.ts` fejléce írja le.
 */
export async function loadMentesSzuletes(supabase: SupabaseClient): Promise<MentesSzuletes> {
  let elsoNaploNap: string | null = null
  let driveOsszekotveNap: string | null = null
  let jelszoBeallitvaNap: string | null = null
  // ⚠️ 2026-08-11 JAVÍTÁS — A BEJÁRATÁSI ABLAK NEM NYÍLHAT KI ÚJRA.
  //
  // Itt korábban `if (!error)` állt egy ÜRES `catch {}`-csel: a napló-lekérdezés
  // hibája NÉMÁN „nincs nyom"-má vált, és a születés a KÉT FELÜLÍRHATÓ
  // időbélyegre (`drive_connected_at`, `passphrase_set_at`) esett vissza.
  // Konkrét út: a Drive-token lejár, a tulajdonos hónapokkal később
  // újracsatlakoztat (a `drive_connected_at` FELÜLÍRÓDIK), és ugyanabban a
  // percben a `backup_log` min-lekérdezés hibázik → a rendszer „ma telepítettük"
  // állapotba kerül, a sáv pedig azt mondja a tegnapi napra, hogy „nincs mit
  // számonkérni" — pont akkor, amikor a mentés esetleg tényleg áll.
  // MOSTANTÓL: a napló-hiba NYOM-BIZONYTALANSÁG (`naploOlvashato: false`), abból
  // pedig teljes szigor lesz, nem elnézés.
  let naploOlvashato = true

  try {
    const { data, error } = await supabase
      .from('backup_log')
      .select('run_date')
      .order('run_date', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) {
      // A tábla hiánya NEM olvasási hiba: olyankor a rendszer nincs telepítve,
      // és a `needsSql` ág mondja ki — a bejáratást ez nem befolyásolhatja.
      if (!isMissingTableError(error)) {
        naploOlvashato = false
        console.error('[mentes-kora] a napló legkorábbi sora nem olvasható:', error.message)
      }
    } else {
      const nap = (data as { run_date?: string } | null)?.run_date
      if (typeof nap === 'string' && nap.length >= 10) elsoNaploNap = nap.slice(0, 10)
    }
  } catch (e: unknown) {
    naploOlvashato = false
    console.error(
      '[mentes-kora] a napló legkorábbi sorának lekérdezése kivételt dobott:',
      e instanceof Error ? e.message : e,
    )
  }

  try {
    const { data, error } = await supabase
      .from('backup_settings')
      .select('drive_connected_at, passphrase_set_at')
      .eq('id', 1)
      .maybeSingle()
    if (!error && data) {
      const sor = data as { drive_connected_at?: string | null; passphrase_set_at?: string | null }
      if (sor.drive_connected_at) driveOsszekotveNap = bukarestiNap(new Date(sor.drive_connected_at))
      if (sor.passphrase_set_at) jelszoBeallitvaNap = bukarestiNap(new Date(sor.passphrase_set_at))
    }
  } catch {
    // lásd fent
  }

  return szuletesbol({ elsoNaploNap, driveOsszekotveNap, jelszoBeallitvaNap, naploOlvashato })
}

// ─────────────────────────────────────────────────────────────────────────────
// „Tegnap valódi volt-e a mentés?"
// ─────────────────────────────────────────────────────────────────────────────

function ureCoverage(nap: string, varhato: number, letezett = true): DailyCoverage {
  return {
    nap,
    varhato,
    igazolt: 0,
    hibas: 0,
    befejezetlen: 0,
    hianyzik: varhato,
    problemasNevek: [],
    problemasOsszesen: varhato,
    letezett,
  }
}

/**
 * A nap lefedettsége hatókörönként. Az EGYSÉG a GYÜLEKEZET: nincs egyetlen
 * óriási országos fájl, tehát a válasz sem lehet „az országos mentés talán jó".
 * Vagy „42 IGAZOLT és 18 HIÁNYZIK, névvel" — vagy semmi.
 *
 * ⚠️ 2026-08-11: a `szuletes` paraméter NEM opcionális kényelmi extra. Enélkül
 * a függvény a TELEPÍTÉS ELŐTTI napokra is 784 hiányzót jelentene — pontosan ez
 * festett 13 piros oszlopot a pulzus-csíkra egy olyan rendszer „múltjáról",
 * ami akkor még nem létezett.
 */
export function osszesitNap(
  nap: string,
  congregations: CongregationRow[],
  rows: LogSlice[],
  globalisIsVarhato: boolean,
  szuletes: MentesSzuletes = ISMERETLEN_SZULETES,
): DailyCoverage {
  // A rendszer SZÜLETÉSE ELŐTTI nap: nincs elvárás, tehát nincs hiány sem.
  if (napEletkora(nap, szuletes) === 'elotte') {
    return { ...ureCoverage(nap, 0, false), hianyzik: 0, problemasOsszesen: 0 }
  }

  const napiSorok = rows.filter((r) => r.run_date === nap)
  const byCong = new Map<string, LogSlice>()
  let globalis: LogSlice | null = null
  for (const r of napiSorok) {
    if (r.scope === 'globalis') {
      globalis = r
    } else if (r.congregation_id) {
      const meglevo = byCong.get(r.congregation_id)
      // Ha több sor van (nem szabadna), a JOBBIK nem nyer: az igazolt győz,
      // de a hiányzót soha nem tekintjük meglévőnek.
      if (!meglevo || (meglevo.drive_verified_at === null && r.drive_verified_at !== null)) {
        byCong.set(r.congregation_id, r)
      }
    }
  }

  const coverage = ureCoverage(nap, congregations.length + (globalisIsVarhato ? 1 : 0))
  coverage.hianyzik = 0

  const problemas: string[] = []
  for (const c of congregations) {
    const sor = byCong.get(c.id)
    if (!sor) {
      coverage.hianyzik += 1
      problemas.push(congregationNev(c))
      continue
    }
    if (sor.status === 'ok' && sor.drive_verified_at) {
      coverage.igazolt += 1
    } else if (sor.status === 'hiba') {
      coverage.hibas += 1
      problemas.push(congregationNev(c))
    } else {
      // 'fut' vagy 'ok' igazolás NÉLKÜL → NEM számít késznek.
      coverage.befejezetlen += 1
      problemas.push(congregationNev(c))
    }
  }

  if (globalisIsVarhato) {
    if (!globalis) {
      coverage.hianyzik += 1
      problemas.push('Rendszerszintű (globális) mentés')
    } else if (globalis.status === 'ok' && globalis.drive_verified_at) {
      coverage.igazolt += 1
    } else if (globalis.status === 'hiba') {
      coverage.hibas += 1
      problemas.push('Rendszerszintű (globális) mentés')
    } else {
      coverage.befejezetlen += 1
      problemas.push('Rendszerszintű (globális) mentés')
    }
  }

  // ⚠️ A TELJES szám a `problemasOsszesen`-be megy, a NÉVLISTA pedig 20-nál
  //    csonkolódik. A kettőt korábban ugyanaz a tömb-hossz képviselte, ezért a
  //    felület „(20)"-at írt ki 784 hiányzóra.
  coverage.problemasOsszesen = problemas.length
  coverage.problemasNevek = problemas.slice(0, 20)
  return coverage
}

export interface CoverageReport {
  needsSql: boolean
  error?: string
  tegnap: DailyCoverage
  ma: DailyCoverage
  pulzus: PulseDay[]
  /** Mikor született a rendszer — a felület ezt is kiírja. */
  szuletes: MentesSzuletes
}

/** 14 napos pulzus + a tegnapi/mai lefedettség — EGY lekérdezésből. */
export async function computeCoverage(
  supabase: SupabaseClient,
  scope: ScopeInput,
  globalisIsVarhato: boolean,
): Promise<CoverageReport> {
  const ma = bukarestiNap()
  const tegnap = napEltol(ma, -1)
  const tol = napEltol(ma, -13)

  // A rendszer kora ELŐBB kell, mint bármelyik nap kiértékelése.
  const szuletes = await loadMentesSzuletes(supabase)

  let congregations: CongregationRow[] = []
  try {
    congregations = await loadScopedCongregations(supabase, scope)
  } catch (error: unknown) {
    return {
      needsSql: false,
      error: error instanceof Error ? error.message : 'Ismeretlen hiba.',
      tegnap: ureCoverage(tegnap, 0),
      ma: ureCoverage(ma, 0),
      pulzus: [],
      szuletes,
    }
  }

  const varhato = congregations.length + (globalisIsVarhato ? 1 : 0)
  const slice = await loadLogSlice(supabase, scope, tol, ma)
  if (slice.needsSql) {
    return {
      needsSql: true,
      tegnap: ureCoverage(tegnap, varhato),
      ma: ureCoverage(ma, varhato),
      pulzus: [],
      szuletes,
    }
  }

  const pulzus: PulseDay[] = []
  for (let i = 13; i >= 0; i -= 1) {
    const nap = napEltol(ma, -i)
    const cov = osszesitNap(nap, congregations, slice.rows, globalisIsVarhato, szuletes)
    pulzus.push({
      nap,
      igazolt: cov.igazolt,
      hibas: cov.hibas + cov.befejezetlen,
      varhato: cov.varhato,
      letezett: cov.letezett,
    })
  }

  return {
    needsSql: false,
    error: slice.error,
    tegnap: osszesitNap(tegnap, congregations, slice.rows, globalisIsVarhato, szuletes),
    ma: osszesitNap(ma, congregations, slice.rows, globalisIsVarhato, szuletes),
    pulzus,
    szuletes,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A FIGYELMEZTETŐ SÁV — a LEFEDETTSÉGBŐL, nem egyetlen időbélyegből
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A sáv állapota.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 2026-08-11 (2. javítás) — A SÁV NEM KÉR SZÁMON NEM LÉTEZŐ MÚLTAT
 * ════════════════════════════════════════════════════════════════════════════
 * A mentés 2026-08-11-én futott végig ELŐSZÖR (784/784, 22:16), a lap tetején
 * mégis piros vész állt: „TEGNAP (2026. 08. 10.) 784 hatókörnek NEM készült…".
 * Tegnap a rendszer még nem létezett.
 *
 * A döntés MOSTANTÓL EGYETLEN, TISZTA FÜGGVÉNYBEN lakik:
 * `lib/backup/mentes-kora.ts` → `savDontes()`. Ugyanabból a `MentesSzuletes`
 * adatból dolgozik a MOTOR is (`worker.ts` „tegnapi ellenőrzés"), tehát a felső
 * sáv és a futás-riport NEM tud széthúzni — korábban két külön lekérdezésből
 * két külön mondatot mondtak ugyanarról.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 2026-08-11 JAVÍTÁS — MIÉRT NEM ELÉG A `max(finished_at)`
 * ════════════════════════════════════════════════════════════════════════════
 * A sáv korábban a `computeBackupHealth()`-re épült, ami EGYETLEN, szűretlen
 * `max(finished_at)`-ot néz: se `kind`, se gyülekezetenkénti bontás. Ebből
 * következett, hogy EGYETLEN igazolt mentés — akár egy „Mentés most" kattintás,
 * akár egy visszaállítás előtti futás EGY gyülekezetre — 48 órán át ZÖLDEN
 * tartotta a sávot, miközben a napi cron halott volt és 40 másik gyülekezetnek
 * nem készült semmije. Az őrszem pont akkor hallgatott, amikor beszélnie kellett.
 *
 * Mostantól a sáv a TEGNAPI LEFEDETTSÉGBŐL számol (`computeCoverage`, ami
 * `kind='napi'`-ra szűr és gyülekezetenként bont), és MEGNEVEZI a hiányzókat.
 * A `computeBackupHealth` időbélyege megmarad — az mondja meg, MIKOR volt
 * utoljára bármi igazolt.
 */
export async function computeBannerHealth(
  supabase: SupabaseClient,
  scope: ScopeInput,
  globalisIsVarhato: boolean,
  driveHiba: string | null,
): Promise<{ health: BackupHealth; needsSql: boolean; lefedettseg?: CoverageReport }> {
  const alap = await computeBackupHealth(supabase, scope, driveHiba)
  if (alap.needsSql) return { health: alap.health, needsSql: true }

  const lefedettseg = await computeCoverage(supabase, scope, globalisIsVarhato)
  if (lefedettseg.needsSql) return { health: alap.health, needsSql: true }

  // ⚠️ 2026-08-12: A LEFEDETTSÉGET MOSTANTÓL KI IS ADJUK.
  //    A `computeCoverage` eddig is lefutott minden admin-oldalbetöltéskor
  //    (60 mp-es gyorsítótárral), és a TEGNAPI/MAI lefedettséget, a 14 napos
  //    pulzust és a rendszer születésnapját is kiszámolta — aztán a függvény
  //    ELDOBTA mindet, és csak egyetlen `health` objektum jött ki. Az admin
  //    Áttekintés ezekből most NULLA extra adatbázis-körút árán mutat számokat.
  //    Az `error` mezőt SZÁNDÉKOSAN meghagyjuk a riportban: a felület abból
  //    tudja, hogy „nem ellenőrizhető" — nem nullát ír ki.
  return { needsSql: false, health: savAllapot(alap.health, lefedettseg), lefedettseg }
}

/**
 * A LEFEDETTSÉG + AZ IDŐBÉLYEG → EGYETLEN ÁLLAPOT.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 2026-08-11 (3. javítás) — A SÁV NÉMÁN VISSZAESETT A RÉGI, ELÉGTELEN
 *    ELLENŐRZÉSRE
 * ════════════════════════════════════════════════════════════════════════════
 * A `loadScopedCongregations` SZÁNDÉKOSAN dob, ha a gyülekezet-lista nem
 * olvasható („néma nulla helyett hangos hiba") — a `computeCoverage` viszont
 * elkapja, és `varhato: 0`-t ad vissza egy `error` mezővel. Ezt az `error`-t
 * korábban SENKI nem nézte meg: a `savDontes` 3. lépése (`tegnap.varhato === 0`)
 * az `alap`-ot adta vissza, vagyis pontosan azt a puszta `max(finished_at)`
 * logikát, amiről a fenti fejléc kimondja, hogy ELÉGTELEN. Amíg a lekérdezés
 * hibázott és volt bárhol 48 óránál frissebb igazolt sor, a lefedettség-alapú
 * őrszem TELJESEN NÉMA volt — jelzés nélkül.
 *
 * MOSTANTÓL a hiba LÁTHATÓ állapot: nem „minden rendben", hanem „most nem
 * ellenőrizhető". A „nem tudom" soha nem lehet zöld.
 *
 * ⚠️ Az `alap` erősebb kimondásait (nincs telepítve / SOHA nem volt igazolt
 *    mentés) ez sem írja felül — azok pontosabbak ennél.
 */
export function savAllapot(alap: BackupHealth, lefedettseg: CoverageReport): BackupHealth {
  if (lefedettseg.error) {
    if (alap.allapot === 'sql_hianyzik' || alap.allapot === 'nincs_mentes') return alap
    return {
      ...alap,
      allapot: 'elavult',
      mondat:
        'A mentés LEFEDETTSÉGE MOST NEM ELLENŐRIZHETŐ, ezért nem tudjuk igazolni, hogy tegnap ' +
        `minden gyülekezetnek készült-e mentése. A hiba: ${lefedettseg.error} ` +
        `(Amit tudunk: ${alap.mondat})`,
    }
  }
  return savDontes({
    alap,
    tegnap: lefedettseg.tegnap,
    ma: lefedettseg.ma,
    szuletes: lefedettseg.szuletes,
  })
}

// A figyelmeztető sáv adatát a
// `app/(dashboard)/admin/biztonsagi-mentes/actions.ts` → `getBackupBannerStateAction()`
// állítja elő, a fenti `computeBannerHealth()`-re építve. SZÁNDÉKOSAN nincs
// külön, „olcsóbb" változat: két egészség-számítás előbb-utóbb szétsodródna, és a
// sáv mást mondana, mint a felület — ez pontosan az a néma eltérés, amit ez a
// rendszer nem engedhet meg magának.
