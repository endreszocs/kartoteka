'use server'

import { revalidatePath } from 'next/cache'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { logAuditEvent } from '@/lib/audit/log'
import type { MemberRow } from '@/lib/constants/members'
import {
  isPlaceholderLocality,
  shouldReportUnresolvableLocality,
  streetGeoPoint,
  type DirectionsCountry,
  type DirectionsCounty,
  type DirectionsLocality,
  type OrszagtorzsAllapot,
} from '@/lib/members/directions'
import {
  validateAll,
  validateMember,
  type TerkepTelepulesHiba,
  type ValidationContext,
  type ValidationError,
  type ValidationErrorType,
  type ValidationSeverity,
} from '@/lib/members/validation-engine'

// ── Típusok (a webes UI-nak) ────────────────────────────────────────────────

export interface MveRow {
  id: number
  member_id: number
  field_name: string
  error_type: ValidationErrorType
  error_message: string
  severity: ValidationSeverity
  status: 'open' | 'resolved' | 'ignored'
  duplicate_of_member_id: number | null
  detected_at: string
  resolved_at: string | null
  resolved_by: string | null
  ignored_at: string | null
  ignored_by: string | null
  ignored_reason: string | null
  // Bővített: a hivatkozott tag rövid neve
  member_name?: string
  duplicate_member_name?: string | null
  /**
   * A tag TELEPÜLÉSÉNEK neve a címtörzsből (közvetlenül vagy az utcán át).
   *
   * ⚑ 2026-08-11 — MIÉRT KELL: a „hiányzik a település" tétel TELEPÜLÉSENKÉNT
   *   EGY sor, de élesben 70 tagot érint, és a javítás TAGONKÉNTI. E nélkül a
   *   lelkésznek nem volt SEMMILYEN módja megnézni, kik ezek a tagok: 70-szer
   *   kellett volna végigjárnia a karton → mentés → teljes újraellenőrzés kört,
   *   hogy megtudja, ki a következő. Ezzel a névvel a Hibák fül át tud ugrani a
   *   Személyek fülre, település-szűrővel — egy koppintás, teljes névsor.
   */
  member_locality_name?: string | null
}

export interface MveStats {
  total_open: number
  critical: number
  medium: number
  warning: number
  duplicates: number
  resolved_today: number
  last_run_at: string | null
}

// ── Tag-lekérdezés a validációhoz ───────────────────────────────────────────

const MEMBER_SELECT =
  'id, cnp, csaladnev, k_nev, szcs_nev, namepattern, ferfi, sz_datum, sz_helyid, foglalkozas, vallas, telefon, email, meghalt, member_status, isvisible, type, befizetoev, allapot, id_apja, id_anyja, apjaneve, anyjaneve, megjegyzes, c_helysegid, c_utcaid, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto, congregation_id, adrstreet:adrstreet!c_utcaid(name), adrlocality:adrlocality!c_helysegid(name)'

/**
 * A gyülekezet LÁTHATÓ tagjai, LAPOZVA (2026-08-11).
 *
 * ⚠️ MIÉRT LAPOZUNK: a Supabase REST „Max rows" beállítása alapértelmezésben
 *    1000. Egy sima `.select()` egy 1400 tagos gyülekezetnél NÉMÁN 1000 sort ad
 *    vissza — a maradék 400 tag hibái „megszűntnek" látszanának, és a lenti
 *    RESOLVED-söprés le is zárná őket. Az `id` szerinti rendezés nem
 *    esztétika: (a) a lapozás feltétele, (b) ettől stabil a térkép-tétel
 *    „gazda" tagja is.
 *
 * ⚠️ HIBA ESETÉN `null`, NEM üres tömb. A hívónak látnia kell a különbséget
 *    „nincs tag" és „nem tudjuk" között: üres listával a söprés MINDEN nyitott
 *    hibát javítottnak jelentene, és a lelkész egy átmeneti hálózati hibából
 *    azt olvasná ki, hogy a nyilvántartása rendbe jött.
 */
const SZEMELY_PAGE = 1000
async function fetchVisibleSzemely<T>(
  // A Supabase kliens típusa a helper-szinten nem kifejezhető.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  congregationId: string,
  columns: string,
): Promise<T[] | null> {
  const out: T[] = []
  for (let from = 0; ; from += SZEMELY_PAGE) {
    const { data, error } = await supabase
      .from('szemely')
      .select(columns)
      .eq('congregation_id', congregationId)
      .eq('isvisible', true)
      .order('id', { ascending: true })
      .range(from, from + SZEMELY_PAGE - 1)
    if (error) {
      console.warn('[validation] a tag-lekérdezés hibázott:', error.message)
      return null
    }
    const rows = (data || []) as T[]
    out.push(...rows)
    if (rows.length < SZEMELY_PAGE) return out
  }
}

async function fetchMembers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  congregationId: string,
): Promise<MemberRow[] | null> {
  const rows = await fetchVisibleSzemely<MemberRow>(supabase, congregationId, MEMBER_SELECT)
  if (!rows) return null
  return rows.map((m) => ({
    ...m,
    elkoltozott: false, // a szemely tábla NEM tárol elkoltozott-ot, MemberRow viszont igen
  }))
}

// ── A TÉRKÉP-KONTEXTUS (2026-08-11) ─────────────────────────────────────────
//
// A „megtalálja-e a térkép ezt a címet?" kérdés JOIN-t igényel, a validációs
// motor viszont tiszta marad — ezért ITT számoljuk ki, és kontextusként adjuk
// át. A DÖNTÉST maga a `lib/members/directions.ts` hozza
// (`shouldReportUnresolvableLocality`); ez a függvény csak adatot hoz.
//
// ⚠️ FAIL-CLOSED, KÉT OKBÓL:
//   1. A `geo_*` oszlopok a 2026-08-11-cim-geokodolas.sql-lel születnek. Ha az
//      még nem futott le, a SELECT 42703-mal elhal — és mi ilyenkor ÜRES
//      kontextust adunk vissza, tehát EGYETLEN hibát sem jelzünk. Ez nem
//      kényelmi döntés: a jelzés szövege azt kéri, hogy a lelkész „egyeztesse
//      a címet", amit az `app_set_address_geo` RPC ment — az pedig UGYANABBAN
//      a migrációban születik. Egy olyan hiba, amit nem lehet elvégezni, csak
//      zaj lenne.
//   2. Ha a geo-oszlopok LÉTEZNEK, de a lekérdezés más okból hibázik, szintén
//      hallgatunk. A geo-oszlopok NÉLKÜLI újrapróbálkozás itt TILOS: akkor nem
//      látnánk a már egyeztetett pontokat, és pont a rendbe tett címekre
//      jeleznénk hibát.
const LOCALITY_MAP_SELECT =
  'id, name, name_hu, name_ro, default_postalcode, siruta_code, needs_review, geo_lat, geo_lng, geo_verified_at, ' +
  'adrcounty:countyid(id, name, name_hu, name_ro, siruta_code, auto_code, adrcountry:countryid(id, name, sname, name_hu, name_ro))'

// Az utca EGYEZTETETT PONTJA is kell: aki olyan utcában lakik, aminek már van
// megerősített koordinátája, annak az útvonala a HÁZIG visz — akkor is, ha a
// településnek nincs hivatalos neve. Ő tehát NEM érintett, és nem is szabad,
// hogy ő legyen a tétel „gazdája".
const STREET_MAP_SELECT = 'id, localityid, geo_lat, geo_lng'

type CountyMapRow = Omit<DirectionsCounty, 'country'> & {
  adrcountry?: DirectionsCountry | DirectionsCountry[] | null
}
type LocalityMapRow = Omit<DirectionsLocality, 'county'> & {
  id: number
  adrcounty?: CountyMapRow | CountyMapRow[] | null
}
type StreetMapRow = {
  id: number
  localityid: number | null
  geo_lat?: number | string | null
  geo_lng?: number | string | null
}
/** Csak a cím-döntéshez szükséges tag-oszlopok (a „gazda" tag kiválasztásához). */
type AddressRosterRow = {
  id: number
  c_helysegid: number | null
  c_utcaid: number | null
  meghalt: boolean | null
}

/**
 * A térkép-kontextus EREDMÉNYE — a `megbizhato` jelző nélkül a fail-closed
 * csend némán ADATVESZTÉSSÉ válna (lásd `runValidation` RESOLVED-ág).
 */
type MapContextResult = {
  context: ValidationContext
  /**
   * `false` = NEM TUDJUK, mi a helyzet a címekkel (lekérdezési hiba, hiányzó
   * migráció). Ilyenkor a hívó NEM söpörheti javítottra a meglévő térkép-
   * tételeket: az „nem találtunk hibát" és a „nem tudtuk megnézni" két
   * különböző állítás, és a lelkész felé csak az egyik igaz.
   */
  megbizhato: boolean
}

/**
 * A CÍM-KONTEXTUSBÓL SZÁRMAZÓ tételek felismerése egy tárolt hibasoron.
 *
 * ⚠️ 2026-08-11 — KETTŐ VAN, és MINDKETTŐ a `buildMapValidationContext`-ből
 *    születik, tehát a fail-closed csend MINDKETTŐT némán „javítottá" tenné a
 *    RESOLVED-söprésben:
 *      · `lakcim|format` — „a térkép nem találja ezt a települést",
 *      · `lakcim|logic`  — „hiányzik a település (»?« helykitöltő)".
 *    A `lakcim|missing` („Hiányzik a lakcím") NEM tartozik ide: az a tag
 *    sorának tiszta függvénye, kontextus nélkül is eldől.
 */
function isCimKontextusTetel(row: { field_name: string; error_type: string }): boolean {
  return row.field_name === 'lakcim' && (row.error_type === 'format' || row.error_type === 'logic')
}

/** A PostgREST a beágyazott kapcsolatot tömbként is visszaadhatja. */
function firstRel<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * `.in('id', …)` KÖTEGELVE. A PostgREST GET-tel kérdez, az id-lista a
 * QUERY STRINGBE kerül — egy nagyvárosi gyülekezet több száz utcájánál a URL
 * a proxyk 8 kB-os korlátjába futna, és a lekérdezés némán elhalna.
 * Hiba esetén `null` (nem üres tömb): a hívónak látnia kell a különbséget
 * „nincs találat" és „nem tudjuk" között — az utóbbinál hallgatunk.
 */
const ID_CHUNK = 150
async function selectByIds<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  columns: string,
  ids: number[],
): Promise<T[] | null> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in('id', ids.slice(i, i + ID_CHUNK))
    if (error) {
      console.warn(`[validation/terkep] ${table} lekérdezés hibája:`, error.message)
      return null
    }
    out.push(...((data || []) as T[]))
  }
  return out
}

/**
 * ⚠️ A KONTEXTUS MINDIG A GYÜLEKEZET TELJES NÉVSORÁBÓL ÉPÜL, nem az éppen
 *    vizsgált tag(ok)ból. A térkép-tétel TELEPÜLÉSENKÉNT EGY, és a legkisebb
 *    id-jű ÉRINTETT tag sorára kerül — ezt egyetlen tagból nem lehet eldönteni.
 *    Ha a `recheckMember` a saját egyelemű listájából számolna, minden
 *    újraértékelt tag „gazdának" hinné magát, és a Hibák fül a tagonkénti
 *    zajhoz esne vissza.
 */
async function buildMapValidationContext(
  // A Supabase kliens típusa a helper-szinten nem kifejezhető.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  congregationId: string,
): Promise<MapContextResult> {
  const NEM_TUDJUK: MapContextResult = { context: {}, megbizhato: false }

  const roster = await fetchVisibleSzemely<AddressRosterRow>(
    supabase, congregationId, 'id, c_helysegid, c_utcaid, meghalt',
  )
  if (!roster) {
    console.warn('[validation/terkep] a névsor-lekérdezés hibázott, a térkép-jelzés kimarad.')
    return NEM_TUDJUK
  }

  // ── AZ ORSZÁGTÖRZS ÁLLAPOTA (2026-08-11, ÁTMENETI) ───────────────────────
  // Élesben ma EGYETLEN ország van (Románia), tehát az ország-mező semmit nem
  // bizonyít: Budapest, Debrecen, Gödöllő, Győr és „Hollandia" is „romániai".
  // A kapu ilyenkor SZÁNDÉKOSAN néma marad — lásd `directions.ts` →
  // `isOrszagtorzsErtelmes`. Amint a
  // 2026-08-11-orszagok-es-kulfoldi-telepulesek.sql lefut, ez a szám 2 fölé
  // megy, és a jelzés magától megszólal — kódmódosítás nélkül.
  // A tábla parányi (ma 1, a migráció után 3 sor), a `select('id')` olcsó.
  const { data: countryRows, error: countryError } = await supabase.from('adrcountry').select('id')
  if (countryError) {
    // FAIL-CLOSED: ha nem tudjuk, hány ország van, nem jelzünk — de azt is
    // kimondjuk, hogy NEM TUDJUK, különben a söprés lezárná a meglévő tételeket.
    console.warn('[validation/terkep] az országtörzs lekérdezése hibázott, a jelzés kimarad:', countryError.message)
    return NEM_TUDJUK
  }
  const orszagtorzs: OrszagtorzsAllapot = { ismertOrszagok: (countryRows || []).length }

  const localityIds = new Set<number>()
  const streetIds = new Set<number>()
  for (const m of roster) {
    if (typeof m.c_helysegid === 'number') localityIds.add(m.c_helysegid)
    if (typeof m.c_utcaid === 'number') streetIds.add(m.c_utcaid)
  }

  // Az utca → település feloldás (a `c_helysegid` gyakran NULL) + az egyeztetett
  // utca-pontok halmaza.
  const utcaTelepulesId = new Map<number, number>()
  const egyeztetettUtcak = new Set<number>()
  if (streetIds.size > 0) {
    const rows = await selectByIds<StreetMapRow>(
      supabase, 'adrstreet', STREET_MAP_SELECT, [...streetIds],
    )
    if (!rows) {
      console.warn('[validation/terkep] az utca-lekérdezés hibázott, a jelzés kimarad.')
      return NEM_TUDJUK
    }
    for (const row of rows) {
      if (typeof row.localityid === 'number') {
        utcaTelepulesId.set(row.id, row.localityid)
        localityIds.add(row.localityid)
      }
      if (streetGeoPoint(row)) egyeztetettUtcak.add(row.id)
    }
  }

  if (localityIds.size === 0) return { context: { utcaTelepulesId }, megbizhato: true }

  const localities = await selectByIds<LocalityMapRow>(
    supabase, 'adrlocality', LOCALITY_MAP_SELECT, [...localityIds],
  )
  if (!localities) {
    console.warn(
      '[validation/terkep] a település-lekérdezés hibázott, a térkép-jelzés kimarad (lefutott már a 2026-08-11-cim-geokodolas.sql?).',
    )
    return NEM_TUDJUK
  }

  // KÉT, EGYMÁST KIZÁRÓ csoport — a szűrés MINDKETTŐRE a `directions.ts`-ből
  // jön, hogy egyetlen tag se kaphasson két tételt ugyanarra a címre:
  //   · `feloldhatatlanNev`  — valódi, romániai település hiányzó hivatalos névvel,
  //   · `helykitoltoNev`     — „?" sor: nincs is település (`isPlaceholderLocality`).
  const feloldhatatlanNev = new Map<number, string>()
  const helykitoltoNev = new Map<number, string>()
  for (const raw of localities) {
    const countyRow = firstRel(raw.adrcounty)
    const locality: DirectionsLocality = {
      ...raw,
      county: countyRow ? { ...countyRow, country: firstRel(countyRow.adrcountry) } : null,
    }
    // A lelkész a MAGYAR nevet ismeri fel — az üzenetben az álljon.
    const nev = (raw.name || raw.name_hu || raw.name_ro || `#${raw.id}`).toString().trim()
    if (isPlaceholderLocality(locality)) {
      // A helykitöltő „neve" maga a bizonyíték („?") — idézőjelben ez megy az
      // üzenetbe, hogy a lelkész felismerje a szerkesztőben.
      helykitoltoNev.set(raw.id, nev || '?')
      continue
    }
    if (!shouldReportUnresolvableLocality(locality, orszagtorzs)) continue
    feloldhatatlanNev.set(raw.id, nev || `#${raw.id}`)
  }

  // ── TELEPÜLÉSENKÉNT: ki a „gazda" tag, és hány tagot érint ────────────────
  // A tag-oldali feloldás PONTOSAN ugyanaz, mint a motoré
  // (`resolveMemberLocalityId`): elsődlegesen a `c_helysegid`, tartalékként az
  // utcán keresztül. A két helynek egyeznie KELL, különben a „gazda" olyan
  // tagra mutatna, akinél a motor meg sem nézi a települést.
  const feloldhatatlanTelepulesek = new Map<number, TerkepTelepulesHiba>()
  const helykitoltoTelepulesek = new Map<number, TerkepTelepulesHiba>()
  const gyujt = (
    cel: Map<number, TerkepTelepulesHiba>,
    localityId: number,
    nev: string,
    tagId: number,
  ) => {
    const eddigi = cel.get(localityId)
    if (!eddigi) {
      cel.set(localityId, { nev, gazdaTagId: tagId, erintettTagok: 1 })
    } else {
      eddigi.erintettTagok += 1
      if (tagId < eddigi.gazdaTagId) eddigi.gazdaTagId = tagId
    }
  }

  for (const m of roster) {
    if (m.meghalt) continue // elhunytra a motor sem validál — nem lehet gazda
    const localityId =
      typeof m.c_helysegid === 'number'
        ? m.c_helysegid
        : typeof m.c_utcaid === 'number'
          ? utcaTelepulesId.get(m.c_utcaid) ?? null
          : null
    if (localityId === null) continue

    // ⚠️ A HELYKITÖLTŐ ELŐBB: itt az utca egyeztetett pontja NEM mentesít. Ott a
    //    kérdés az volt, „elvisz-e a térkép a házig" — igen, egy pont elvisz. Itt
    //    a kérdés az, „TUDJUK-E, HOL LAKIK" — és arra egy koordináta nem felel.
    //    A hiányzó település az anyakönyvbe, a jelentésbe és a levélcímzésbe is
    //    beleszól, nem csak a navigációba.
    const helykitolto = helykitoltoNev.get(localityId)
    if (helykitolto !== undefined) {
      gyujt(helykitoltoTelepulesek, localityId, helykitolto, m.id)
      continue
    }

    const nev = feloldhatatlanNev.get(localityId)
    if (nev === undefined) continue
    // Akinek az UTCÁJÁN már van egyeztetett pont, annak a térkép a HÁZIG visz a
    // település hiánya ellenére is — ő nem érintett, és nem is jelezzük neki.
    if (typeof m.c_utcaid === 'number' && egyeztetettUtcak.has(m.c_utcaid)) continue

    gyujt(feloldhatatlanTelepulesek, localityId, nev, m.id)
  }

  return {
    context: { feloldhatatlanTelepulesek, helykitoltoTelepulesek, utcaTelepulesId },
    megbizhato: true,
  }
}

// ── runValidation: teljes újrafutás + DB szinkron ──────────────────────────

export async function runValidation(): Promise<{
  ok: boolean
  total_errors: number
  inserted: number
  updated: number
  resolved: number
  reopened: number
  error?: string
}> {
  const ures = { total_errors: 0, inserted: 0, updated: 0, resolved: 0, reopened: 0 }
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) {
    return { ok: false, ...ures, error: 'Nincs aktív gyülekezet.' }
  }

  const members = await fetchMembers(supabase, congregationId)
  // ⚠️ NEM üres listával megyünk tovább: a lenti RESOLVED-söprés minden nyitott
  //    hibát javítottnak jelentene, és a lelkész egy átmeneti hibából azt
  //    olvasná ki, hogy a nyilvántartása rendbe jött.
  if (!members) {
    return { ok: false, ...ures, error: 'A tagok lekérdezése nem sikerült. Ellenőrizd a kapcsolatot, és próbáld újra.' }
  }

  const { context: mapContext, megbizhato: terkepMegbizhato } = await buildMapValidationContext(
    supabase, congregationId,
  )
  const newErrors = validateAll(members, mapContext)

  // Meglévő nyitott hibák a gyülekezetben
  const { data: existing } = await supabase
    .from('member_validation_errors')
    .select('id, member_id, field_name, error_type, status, duplicate_of_member_id')
    .eq('congregation_id', congregationId)
    .neq('status', 'ignored')

  type ExistingRow = {
    id: number
    member_id: number
    field_name: string
    error_type: string
    status: 'open' | 'resolved'
    duplicate_of_member_id: number | null
  }
  const existingRows = (existing || []) as ExistingRow[]

  // Kulcs egyezésvizsgálathoz
  const keyFor = (e: { member_id: number; field_name: string; error_type: string; duplicate_of_member_id?: number | null }) =>
    `${e.member_id}|${e.field_name}|${e.error_type}|${e.duplicate_of_member_id ?? ''}`

  const existingByKey = new Map<string, ExistingRow>()
  for (const e of existingRows) {
    existingByKey.set(keyFor({ ...e, duplicate_of_member_id: e.duplicate_of_member_id ?? null }), e)
  }

  const newByKey = new Map<string, ValidationError>()
  for (const e of newErrors) {
    newByKey.set(keyFor({ ...e, duplicate_of_member_id: e.duplicate_of_member_id ?? null }), e)
  }

  // 1. INSERT: amelyik új és nincs meg
  //    + REOPEN: amelyik VAN, de `resolved` — a hiba visszatért.
  //
  // ⚠️ 2026-08-11 — A REOPEN NÉLKÜL A JELZÉS EGYSZER SZÓL, AZTÁN SOHA TÖBBÉ.
  //    Az `existing` lekérdezés `neq('status','ignored')`, tehát a `resolved`
  //    sor is benne van az `existingByKey`-ben — a régi kód emiatt sem
  //    beszúrni, sem újranyitni nem tudta. Egyetlen téves lezárás (vagy egy
  //    tényleg javított, majd visszarontott adat) örökre elnémította a tételt.
  const toInsert: Array<Record<string, unknown>> = []
  const toReopenIds: number[] = []
  for (const [key, err] of newByKey) {
    const existing = existingByKey.get(key)
    if (!existing) {
      toInsert.push({
        member_id: err.member_id,
        congregation_id: congregationId,
        field_name: err.field_name,
        error_type: err.error_type,
        error_message: err.error_message,
        severity: err.severity,
        duplicate_of_member_id: err.duplicate_of_member_id ?? null,
        status: 'open',
      })
    } else if (existing.status === 'resolved') {
      toReopenIds.push(existing.id)
    }
  }
  let inserted = 0
  if (toInsert.length > 0) {
    const { error } = await supabase.from('member_validation_errors').insert(toInsert)
    if (error) {
      return { ok: false, ...ures, total_errors: newErrors.length, error: `INSERT hiba: ${error.message}` }
    }
    inserted = toInsert.length
  }
  let reopened = 0
  if (toReopenIds.length > 0) {
    const { error } = await supabase
      .from('member_validation_errors')
      .update({ status: 'open', resolved_at: null, resolved_by: null })
      .in('id', toReopenIds)
    if (error) {
      return { ok: false, ...ures, total_errors: newErrors.length, inserted, error: `Újranyitás hiba: ${error.message}` }
    }
    reopened = toReopenIds.length
  }

  // 2. RESOLVED: amelyik nem újratalálható, és NEM ignored, NEM resolved → resolved
  //
  // ⚠️ 2026-08-11 — A TÉRKÉP-TÉTELEK KIMARADNAK, HA A KONTEXTUS NEM MEGBÍZHATÓ.
  //    A `buildMapValidationContext` fail-closed: lekérdezési hibánál üres
  //    kontextust ad, hogy ne jelezzen hamisan. Söprés közben viszont pont ez
  //    fordul visszájára: üres kontextus = „egyetlen térkép-hibát sem
  //    találtunk" = MINDET lezárjuk. A lelkész ilyenkor „ma javítva: N"-t lát,
  //    és azt hiszi, a címek rendben vannak. Ez az EGYETLEN kontextus-függő
  //    szabály — minden más a tag sorának tiszta függvénye, ami adat-változás
  //    nélkül nem tud eltűnni —, ezért az őrszem is csak ide kell.
  const toResolveIds: number[] = []
  for (const [key, row] of existingByKey) {
    if (newByKey.has(key)) continue
    if (row.status !== 'open') continue
    if (!terkepMegbizhato && isCimKontextusTetel(row)) continue
    toResolveIds.push(row.id)
  }
  let resolved = 0
  if (toResolveIds.length > 0) {
    const { error } = await supabase
      .from('member_validation_errors')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .in('id', toResolveIds)
    if (error) {
      return { ok: false, ...ures, total_errors: newErrors.length, inserted, reopened, error: `RESOLVED update hiba: ${error.message}` }
    }
    resolved = toResolveIds.length
  }

  // 3. UPDATED: meglévő (nyitott vagy épp újranyitott) hiba — error_message
  //    frissítés (esetleg új duplikációs cél, vagy változott érintett-szám).
  const toUpdateRows: Array<{ id: number; error_message: string }> = []
  for (const [key, err] of newByKey) {
    const existing = existingByKey.get(key)
    if (existing) {
      // Ha az error_message változott, frissítjük
      // (nem olvassuk be a régit, csak felülírjuk — egyszerűbb és olcsóbb)
      toUpdateRows.push({ id: existing.id, error_message: err.error_message })
    }
  }
  let updated = 0
  if (toUpdateRows.length > 0) {
    // Kötegelt UPDATE — egy körben. Supabase nem támogat batch update-et,
    // de a Promise.all párhuzamosít.
    const results = await Promise.all(
      toUpdateRows.map((r) =>
        supabase
          .from('member_validation_errors')
          .update({ error_message: r.error_message })
          .eq('id', r.id),
      ),
    )
    updated = results.filter((r) => !r.error).length
  }

  revalidatePath('/tagnyilvantartas')
  await logAuditEvent({ action: 'validation.run', targetTable: 'member_validation_errors', metadata: { total_errors: newErrors.length, inserted, updated, resolved, reopened, terkep_megbizhato: terkepMegbizhato } })
  return { ok: true, total_errors: newErrors.length, inserted, updated, resolved, reopened }
}

// ── recheckMember: egyetlen tag újraértékelése ─────────────────────────────

export async function recheckMember(memberId: number): Promise<{ ok: boolean; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { ok: false, error: 'Nincs aktív gyülekezet.' }

  // Tag lekérése
  const { data: m } = await supabase
    .from('szemely')
    .select(MEMBER_SELECT)
    .eq('id', memberId)
    .eq('congregation_id', congregationId)
    .maybeSingle()

  if (!m) return { ok: false, error: 'A tag nem található vagy nincs hozzáférés.' }

  const memberRow = { ...(m as unknown as MemberRow), elkoltozott: false }
  // ⚠️ A kontextust ITT IS fel kell építeni. E nélkül az egy-tagos újraértékelés
  //    NEM találná meg a térkép-hibát, és a lenti RESOLVED-ág NÉMÁN lezárná egy
  //    olyan nyitott hibát, ami valójában fennáll.
  //    A kontextus a TELJES névsorból épül (nem ebből az egy tagból) — a
  //    térkép-tétel „gazdája" településenként EGY tag, amit egyetlen sorból nem
  //    lehet eldönteni. Lásd `buildMapValidationContext`.
  const { context: mapContext, megbizhato: terkepMegbizhato } = await buildMapValidationContext(
    supabase, congregationId,
  )
  const newErrors = memberRow.meghalt ? [] : validateMember(memberRow, mapContext)

  // Nyitott hibái a tagnak
  const { data: existing } = await supabase
    .from('member_validation_errors')
    .select('id, field_name, error_type, status, duplicate_of_member_id')
    .eq('member_id', memberId)
    .neq('status', 'ignored')

  type ExistingRow = {
    id: number
    field_name: string
    error_type: string
    status: 'open' | 'resolved'
    duplicate_of_member_id: number | null
  }
  const existingRows = (existing || []) as ExistingRow[]
  const keyFor = (e: { field_name: string; error_type: string; duplicate_of_member_id?: number | null }) =>
    `${e.field_name}|${e.error_type}|${e.duplicate_of_member_id ?? ''}`

  const existingByKey = new Map(existingRows.map((r) => [keyFor({ ...r, duplicate_of_member_id: r.duplicate_of_member_id ?? null }), r]))
  const newByKey = new Map(newErrors.map((e) => [keyFor({ ...e, duplicate_of_member_id: e.duplicate_of_member_id ?? null }), e]))

  // INSERT
  const toInsert = [...newByKey.entries()]
    .filter(([k]) => !existingByKey.has(k))
    .map(([, err]) => ({
      member_id: err.member_id,
      congregation_id: congregationId,
      field_name: err.field_name,
      error_type: err.error_type,
      error_message: err.error_message,
      severity: err.severity,
      duplicate_of_member_id: err.duplicate_of_member_id ?? null,
      status: 'open',
    }))
  if (toInsert.length > 0) {
    await supabase.from('member_validation_errors').insert(toInsert)
  }

  // REOPEN — a hiba visszatért egy korábban lezárt soron (lásd `runValidation`).
  const toReopenIds: number[] = []
  for (const k of newByKey.keys()) {
    const row = existingByKey.get(k)
    if (row && row.status === 'resolved') toReopenIds.push(row.id)
  }
  if (toReopenIds.length > 0) {
    await supabase
      .from('member_validation_errors')
      .update({ status: 'open', resolved_at: null, resolved_by: null })
      .in('id', toReopenIds)
  }

  // RESOLVED — a térkép-tételek KIMARADNAK, ha a kontextus nem megbízható
  // (ugyanaz az őrszem, mint a `runValidation`-ben: „nem találtunk hibát" és
  // „nem tudtuk megnézni" két különböző állítás).
  const toResolveIds = [...existingByKey.entries()]
    .filter(([k, r]) => !newByKey.has(k) && r.status === 'open')
    .filter(([, r]) => terkepMegbizhato || !isCimKontextusTetel(r))
    .map(([, r]) => r.id)
  if (toResolveIds.length > 0) {
    await supabase
      .from('member_validation_errors')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .in('id', toResolveIds)
  }

  revalidatePath('/tagnyilvantartas')
  return { ok: true }
}

// ── getValidationErrors: szűrt lekérdezés ───────────────────────────────────

export interface MveFilters {
  status?: 'open' | 'resolved' | 'ignored' | 'all'
  severity?: ValidationSeverity | 'all'
  errorType?: ValidationErrorType | 'all'
  search?: string
  limit?: number
  offset?: number
}

export async function getValidationErrors(filters: MveFilters = {}): Promise<{
  rows: MveRow[]
  total: number
}> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { rows: [], total: 0 }

  let q = supabase
    .from('member_validation_errors')
    .select(
      // A tag települése is jön: közvetlenül (`c_helysegid`) és az utcán át
      // (`c_utcaid → localityid`) — az import-örökség soroknál a `c_helysegid`
      // gyakran NULL, tehát mindkét ág kell. Ugyanez a beágyazási minta fut a
      // `registry-list-actions` névsor-lekérdezésében is.
      'id, member_id, field_name, error_type, error_message, severity, status, duplicate_of_member_id, detected_at, resolved_at, resolved_by, ignored_at, ignored_by, ignored_reason, '
      + 'member:szemely!member_id(csaladnev, k_nev, adrlocality!c_helysegid(name), adrstreet!c_utcaid(adrlocality!localityid(name))), '
      + 'duplicate:szemely!duplicate_of_member_id(csaladnev, k_nev)',
      { count: 'exact' },
    )
    .eq('congregation_id', congregationId)
    .order('severity', { ascending: false })
    .order('detected_at', { ascending: false })

  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
  else if (!filters.status) q = q.eq('status', 'open') // default: csak nyitottak

  if (filters.severity && filters.severity !== 'all') q = q.eq('severity', filters.severity)
  if (filters.errorType && filters.errorType !== 'all') q = q.eq('error_type', filters.errorType)

  if (filters.search && filters.search.trim().length >= 2) {
    // Csak az error_message + field_name-en keresünk (a tag-név join miatt
    // bonyolultabb lenne)
    q = q.or(`error_message.ilike.%${filters.search.trim()}%,field_name.ilike.%${filters.search.trim()}%`)
  }

  if (typeof filters.limit === 'number') q = q.limit(filters.limit)
  if (typeof filters.offset === 'number' && filters.offset > 0) {
    q = q.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
  }

  const { data, count } = await q

  type RawRow = {
    id: number
    member_id: number
    field_name: string
    error_type: ValidationErrorType
    error_message: string
    severity: ValidationSeverity
    status: 'open' | 'resolved' | 'ignored'
    duplicate_of_member_id: number | null
    detected_at: string
    resolved_at: string | null
    resolved_by: string | null
    ignored_at: string | null
    ignored_by: string | null
    ignored_reason: string | null
    member: {
      csaladnev: string | null
      k_nev: string | null
      adrlocality?: { name: string | null } | Array<{ name: string | null }> | null
      adrstreet?:
        | { adrlocality?: { name: string | null } | Array<{ name: string | null }> | null }
        | Array<{ adrlocality?: { name: string | null } | Array<{ name: string | null }> | null }>
        | null
    } | null
    duplicate: { csaladnev: string | null; k_nev: string | null } | null
  }
  const rows: MveRow[] = ((data || []) as unknown as RawRow[]).map((r) => {
    const kozvetlen = firstRel(r.member?.adrlocality)
    const utcan = firstRel(firstRel(r.member?.adrstreet)?.adrlocality)
    const telepules = (kozvetlen?.name ?? utcan?.name ?? '').trim()
    return {
      ...r,
      member_name: r.member ? `${r.member.csaladnev || ''} ${r.member.k_nev || ''}`.trim() : `#${r.member_id}`,
      duplicate_member_name: r.duplicate
        ? `${r.duplicate.csaladnev || ''} ${r.duplicate.k_nev || ''}`.trim()
        : null,
      member_locality_name: telepules || null,
    }
  })

  return { rows, total: count || rows.length }
}

// ── getValidationStats: KPI kártyákhoz ──────────────────────────────────────

export async function getValidationStats(): Promise<MveStats> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  const empty: MveStats = { total_open: 0, critical: 0, medium: 0, warning: 0, duplicates: 0, resolved_today: 0, last_run_at: null }
  if (!congregationId) return empty

  // Egyetlen lekérdezés — minden hiba fő mezővel
  const { data } = await supabase
    .from('member_validation_errors')
    .select('id, severity, status, error_type, resolved_at, detected_at')
    .eq('congregation_id', congregationId)

  const rows = (data || []) as Array<{
    id: number
    severity: ValidationSeverity
    status: 'open' | 'resolved' | 'ignored'
    error_type: ValidationErrorType
    resolved_at: string | null
    detected_at: string
  }>

  const todayIso = new Date().toISOString().slice(0, 10)
  let lastRunAt: string | null = null
  for (const r of rows) {
    if (r.status === 'open') {
      empty.total_open++
      if (r.severity === 'critical') empty.critical++
      else if (r.severity === 'medium') empty.medium++
      else if (r.severity === 'warning') empty.warning++
      if (r.error_type === 'duplicate') empty.duplicates++
    }
    if (r.status === 'resolved' && r.resolved_at?.slice(0, 10) === todayIso) {
      empty.resolved_today++
    }
    if (!lastRunAt || r.detected_at > lastRunAt) lastRunAt = r.detected_at
  }
  empty.last_run_at = lastRunAt
  return empty
}

// ── resolveError: manuálisan resolved-re állít ─────────────────────────────

export async function resolveError(errorId: number): Promise<{ ok: boolean; error?: string }> {
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  if (!congregationId || !userId) return { ok: false, error: 'Nincs bejelentkezett felhasználó.' }

  const { error } = await supabase
    .from('member_validation_errors')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq('id', errorId)
    .eq('congregation_id', congregationId)
  if (error) return { ok: false, error: error.message }

  await logAuditEvent({ action: 'validation.resolve', targetTable: 'member_validation_errors', targetId: String(errorId) }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { ok: true }
}

// ── ignoreError: figyelmen kívül hagyás indoklással ─────────────────────────

export async function ignoreError(errorId: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  if (!congregationId || !userId) return { ok: false, error: 'Nincs bejelentkezett felhasználó.' }
  if (!reason.trim()) return { ok: false, error: 'Az indoklás kötelező.' }

  const { error } = await supabase
    .from('member_validation_errors')
    .update({
      status: 'ignored',
      ignored_at: new Date().toISOString(),
      ignored_by: userId,
      ignored_reason: reason.trim(),
    })
    .eq('id', errorId)
    .eq('congregation_id', congregationId)
  if (error) return { ok: false, error: error.message }

  await logAuditEvent({ action: 'validation.ignore', targetTable: 'member_validation_errors', targetId: String(errorId), metadata: { reason: reason.trim() } }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { ok: true }
}

// ── reopenError: vissza open-re (admin) ─────────────────────────────────────

export async function reopenError(errorId: number): Promise<{ ok: boolean; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { ok: false, error: 'Nincs aktív gyülekezet.' }

  const { error } = await supabase
    .from('member_validation_errors')
    .update({
      status: 'open',
      resolved_at: null,
      resolved_by: null,
      ignored_at: null,
      ignored_by: null,
      ignored_reason: null,
    })
    .eq('id', errorId)
    .eq('congregation_id', congregationId)
  if (error) return { ok: false, error: error.message }

  await logAuditEvent({ action: 'validation.reopen', targetTable: 'member_validation_errors', targetId: String(errorId) }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { ok: true }
}
