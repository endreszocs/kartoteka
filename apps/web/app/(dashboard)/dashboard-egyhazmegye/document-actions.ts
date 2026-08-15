'use server'

/**
 * Hivatalos dokumentum-workflow szerver akciók (2026-08-09 ÚJRAÍRÁS).
 *
 * A 2026-08-09-i scope-audit szerint a régi verzió a teljes hibaosztályt
 * hordozta: skalár profiles.diocese_id-alapú „ha van id, szűrünk" minta
 * (NULL → szűretlen), néma 0 soros UPDATE-ek sikerként jelentve, kizárólag
 * naptári évre szűrt lekérdezések (a year-1 kulcsú vagyonleltár és a januári
 * számadás láthatatlan volt), véglegesített/továbbított dokumentum
 * felülírhatósága, és országos szórású értesítés NULL diocese_id esetén.
 *
 * ELVEK (2026-08-09):
 *   - Hatókör KIZÁRÓLAG a lib/auth/level-scope.ts feloldóival (aktív szerep →
 *     profile_roles → skalár fallback), FAIL-CLOSED: nincs scope → üres lista /
 *     hiba, SOHA nem szűretlen lekérdezés. A szűretlen ág csak a
 *     rendszergazdáé/masteré, feliratozva.
 *   - A hovatartozást a gyülekezet VALÓDI megyéjén át oldjuk fel
 *     (congregations.diocese_id), nem a sor nullable diocese_id oszlopán —
 *     összhangban a 2026-08-09-megye-kerulet-rls-fix.sql kerületi policy-jével.
 *   - Nincs congregations(name) embed (a FK léte nem igazolt, diagnosztika
 *     #11) — a gyülekezet-neveket a hatókör gyülekezet-listájából párosítjuk.
 *   - Minden UPDATE .select('id')-del ellenőrzött: 0 érintett sor = hangos
 *     magyar hiba, nem hamis siker (diagnosztika #6).
 *   - PostgREST 1000 soros plafon: lapozott olvasás (range) + darabolt .in().
 *   - Kerületi láthatóság a RLS-sel azonos szabállyal:
 *     forwarded_to_kerulet=true VAGY status='finalized'; kerületi UPDATE csak
 *     továbbított soron (2026-08-09-megye-kerulet-rls-fix.sql 1a/1b).
 *
 * A típusok a lib/constants/documents.ts-ben és a ./document-shared.ts-ben
 * vannak ('use server' fájl csak async függvényt exportálhat).
 */

import { revalidatePath } from 'next/cache'
import { selectAllPaged } from '@kartoteka/supabase-client'
import { getEffectiveAccessContext, type EffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canReadDioceseScope,
  canWriteDioceseScope,
  describeDioceseWriteBlock,
  getDioceseScopeContext,
  getDistrictScopeContext,
  resolveDioceseReadScopeIds,
  resolveDistrictScopeIds,
} from '@/lib/auth/level-scope'
import type { DocumentType, DocumentStatus, DocumentSubmission } from '@/lib/constants/documents'
import { DOCUMENT_TYPE_LABELS, documentSeasonYear } from '@/lib/constants/documents'
import type {
  DocumentActionResult,
  DocumentCenterCongregation,
  DocumentCenterData,
} from './document-shared'

// ---------------------------------------------------------------------------
// Belső (nem exportált) segédek
// ---------------------------------------------------------------------------

type Supa = EffectiveAccessContext['supabase']

const PAGE_SIZE = 1000
/** Az .in() lista darabolása — a PostgREST URL-hossz plafonja miatt. */
const IN_CHUNK = 120

/**
 * A LISTA/mátrix oszlopai.
 *
 * 2026-08-11 (5. kör, P2-#19): a `snapshot_data` KIKERÜLT innen. Az a
 * fagyasztott jsonb pillanatkép beküldésenként 1–3 KB (a számadásnál a teljes
 * bevétel/kiadás térkép számadási kódonként); ~500 gyülekezet × 6 dokumentum
 * mellett ez évi ~6 MB, amit a szerver kiolvasott, az RSC-csomagba
 * sorosított, és a böngésző minden egyes /dashboard-kerulet és
 * /dashboard-egyhazmegye megnyitáskor újra beparsolt — egyetlen, ritkán
 * kinyitott részletkártya kedvéért, ÉVRŐL ÉVRE növekedve. A pillanatképet
 * most a snapshot-néző kéri le, darabonként (getSubmissionSnapshot).
 */
const SUBMISSION_COLUMNS =
  'id, congregation_id, diocese_id, year, document_type, modification_number, status, ' +
  'submitted_at, received_at, reviewed_at, finalized_at, forwarded_to_kerulet, forwarded_at, ' +
  'notes'

/** Visszaküldött dokumentum javítási felülete dokumentum-típusonként. */
const RETURN_LINKS: Record<DocumentType, string> = {
  szamadas: '/penzugy',
  koltsegvetes: '/penzugy',
  koltsegvetes_modositas: '/penzugy',
  vagyonleltar: '/leltar',
  valasztok_nevjegyzeke: '/tagnyilvantartas',
  lelkeszi_jelentes: '/munkanaplo',
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Notes-napló: időbélyeges sor hozzáfűzése. A notes oszlop VÁLTOZÁS-TÖRTÉNET
 * (visszaküldés indoklása, újra-beküldés, kerületi átvétel) — sosem írjuk
 * felül, csak hozzáfűzünk, így a hivatalos irat teljes útja visszaolvasható.
 */
function appendNoteLine(prev: string | null | undefined, line: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const entry = `[${stamp}] ${line}`
  const base = (prev || '').trim()
  return base ? `${base}\n${entry}` : entry
}

/** Gyülekezet megjelenítési neve — hivatalos név elsőbbséggel. */
function congDisplayName(row: { name?: string | null; nev_hu?: string | null }): string {
  return row.name || row.nev_hu || 'Ismeretlen gyülekezet'
}

/**
 * A hatókör gyülekezet-listája lapozva. dioceseIds=null → ORSZÁGOS lista —
 * ezt KIZÁRÓLAG a feliratozott rendszergazdai ág hívhatja!
 */
async function fetchCongregations(
  supabase: Supa,
  dioceseIds: string[] | null,
): Promise<Array<{ id: string; name: string; diocese_id: string | null }>> {
  // 2026-08-11 (5. kör, P3 #15): KÖZÖS `selectAllPaged`. A régi ciklus a
  // `data.length < PAGE_SIZE` stop-feltételt használta, és `name` szerint
  // rendezett — ami NEM egyedi, tehát a laphatáron amúgy is csúszhatott. A
  // helper `id` ASC döntetlen-bontót fűz hozzá, és csak ÜRES lapnál áll meg.
  let q = supabase
    .from('congregations')
    .select('id, name, nev_hu, diocese_id')
    .order('name')
  if (dioceseIds) q = q.in('diocese_id', dioceseIds)
  const { data, error } = await selectAllPaged<Record<string, unknown>>(q)
  if (error) {
    // A hívó tömböt vár; a rövid lista némán kevesebb beküldést mutatna, ezért
    // legalább a szerver-naplóban hangosan jelezzük.
    console.error('[document-actions] gyülekezet-lista lekérdezése hiba:', error.message)
  }
  return data.map((r) => ({
    id: String(r.id),
    name: congDisplayName(r as { name?: string | null; nev_hu?: string | null }),
    diocese_id: (r.diocese_id as string | null) ?? null,
  }))
}

/**
 * Beküldések lekérdezése gyülekezet-lista alapján (darabolt .in() + lapozás).
 * congIds=null → szűretlen (CSAK a feliratozott rendszergazdai ágon).
 */
async function fetchSubmissions(
  supabase: Supa,
  congIds: string[] | null,
  opts: { year?: number | null; years?: number[] | null; districtVisibleOnly?: boolean },
): Promise<Array<Record<string, unknown>>> {
  // 2026-08-11 (5. kör, P3 #15): KÖZÖS `selectAllPaged` a belső ciklus helyett.
  // A `submitted_at` NEM egyedi (egy szezonban több gyülekezet is beküldhet
  // ugyanabban a másodpercben), ezért a helper `id` ASC döntetlen-bontója KELL
  // — enélkül a laphatáron beküldés csúszhatott ki a listából. A rövid lapra
  // kilépő stop-feltétel ugyanitt a beküldések felét tüntette volna el.
  const rows: Array<Record<string, unknown>> = []
  const idChunks = congIds ? chunk(congIds, IN_CHUNK) : [null]
  for (const ids of idChunks) {
    if (ids && ids.length === 0) continue
    let q = supabase
      .from('document_submissions')
      .select(SUBMISSION_COLUMNS)
      .order('submitted_at', { ascending: false })
    if (ids) q = q.in('congregation_id', ids)
    if (opts.year != null) q = q.eq('year', opts.year)
    // 2026-08-11 (P2-#19): év-ABLAK — alapból csak a releváns évek utaznak.
    else if (opts.years && opts.years.length > 0) q = q.in('year', opts.years)
    // A kerületi láthatósági szabály — BYTE-ra a RLS 1a) policy-vel azonos.
    if (opts.districtVisibleOnly) q = q.or('forwarded_to_kerulet.eq.true,status.eq.finalized')
    const { data, error } = await selectAllPaged<Record<string, unknown>>(q)
    if (error) {
      console.error('[document-actions] beküldések lekérdezése hiba:', error.message)
    }
    rows.push(...data)
  }
  return rows
}

/**
 * 2026-08-11 (5. kör, P2-#19): az ÉVLISTA és a teljes darabszám külön, OLCSÓ
 * lekérdezésből jön (csak a `year` oszlop, sor/4 bájt). Így az év-választó
 * chipek és az „archívum" felirat továbbra is a TELJES archívumot tükrözik,
 * miközben a részletes sorok csak a betöltött év-ablakra korlátozódnak.
 */
async function fetchSubmissionYearStats(
  supabase: Supa,
  congIds: string[] | null,
  opts: { districtVisibleOnly?: boolean },
): Promise<{ years: number[]; totalCount: number }> {
  // 2026-08-11 (5. kör, P3 #15): KÖZÖS `selectAllPaged`. A `year` szerinti
  // rendezés önmagában ERŐSEN nem egyedi (évente több száz azonos érték), a
  // `data.length < PAGE_SIZE` stop pedig leszállított szerver-plafonnál az első
  // lap után kilépett — az „archívum" darabszám és az év-választó chipek így
  // hihető, de hiányos képet adtak volna. Az `id` döntetlen-bontót a helper adja.
  const years = new Set<number>()
  let totalCount = 0
  const idChunks = congIds ? chunk(congIds, IN_CHUNK) : [null]
  for (const ids of idChunks) {
    if (ids && ids.length === 0) continue
    let q = supabase
      .from('document_submissions')
      .select('id, year')
      .order('year', { ascending: false })
    if (ids) q = q.in('congregation_id', ids)
    if (opts.districtVisibleOnly) q = q.or('forwarded_to_kerulet.eq.true,status.eq.finalized')
    const { data, error } = await selectAllPaged<{ year: number | null }>(q)
    if (error) {
      console.error('[document-actions] év-statisztika lekérdezése hiba:', error.message)
    }
    for (const r of data) {
      totalCount += 1
      if (typeof r.year === 'number' && Number.isFinite(r.year)) years.add(r.year)
    }
  }
  return { years: [...years].sort((a, b) => b - a), totalCount }
}

/**
 * Az alapból betöltött év-ablak: a beszámolási szezon éve, az azt megelőző év,
 * és a naptári év. Január–márciusban a szezon-év az ELŐZŐ év, ezért a naptári
 * évet is beletesszük — így a frissen beküldött (year-kulcsolású) iratok
 * egyike sem tűnhet el a nézetből.
 */
function defaultLoadedYears(): number[] {
  const season = documentSeasonYear()
  return [...new Set([new Date().getFullYear(), season, season - 1])].sort((a, b) => b - a)
}

/**
 * Globális rendezés beküldési idő szerint (csökkenő) — a darabolt .in()
 * lekérdezések laponként rendezettek, de az összefűzött eredmény nem.
 */
function sortBySubmittedDesc(subs: DocumentSubmission[]): DocumentSubmission[] {
  return subs.sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''))
}

/** Nyers sor → DocumentSubmission, gyülekezet-/megyenév hozzárendeléssel. */
function toSubmission(
  row: Record<string, unknown>,
  congNames: Map<string, string>,
  dioceseNameByCong?: Map<string, string | null>,
): DocumentSubmission {
  const congId = String(row.congregation_id)
  return {
    ...(row as unknown as DocumentSubmission),
    congregation_id: congId,
    congregation_name: congNames.get(congId) || 'Ismeretlen',
    diocese_name: dioceseNameByCong?.get(congId) ?? null,
  }
}

/**
 * Egyházmegyei tulajdon-ellenőrzés egy beküldéshez (app-oldali assert a RLS
 * mellé): a dokumentum gyülekezetének VALÓDI megyéje benne van-e a hívó
 * feloldott megye-hatókörében. Admin/master átmegy. null = rendben.
 */
async function assertDioceseOwnership(
  access: EffectiveAccessContext,
  congregationId: string,
): Promise<string | null> {
  if (access.admin || access.master) return null
  // 2026-08-15 (S1, 0.3): SZEREP-SZŰRT olvasói hatókör a tág feloldó helyett —
  // a tág változat a kerületi admin elavult `profiles.diocese_id` skalárját
  // szerep nélkül is elfogadta, így idegen megye iratára is átment az assert.
  // Az írási akciókat e függvény ELŐTT már a canWriteDioceseScope kapuzza,
  // ezért itt az olvasói (írók + számvevő) lista a helyes közös nevező.
  const scopeIds = resolveDioceseReadScopeIds(access)
  if (scopeIds.length === 0) {
    return 'Nincs feloldható egyházmegye-hatóköre — a művelet nem engedélyezett.'
  }
  const { data: cong } = await access.supabase
    .from('congregations')
    .select('diocese_id')
    .eq('id', congregationId)
    .maybeSingle()
  const dioceseId = (cong?.diocese_id as string | null) || null
  if (!dioceseId || !scopeIds.includes(dioceseId)) {
    return 'A dokumentum nem az Ön egyházmegyéjének gyülekezetéhez tartozik.'
  }
  return null
}

/** Kerületi tulajdon-ellenőrzés: gyülekezet → megye → kerület ∈ hatókör. */
async function assertDistrictOwnership(
  access: EffectiveAccessContext,
  congregationId: string,
): Promise<string | null> {
  if (access.admin || access.master) return null
  const districtIds = resolveDistrictScopeIds(access)
  if (districtIds.length === 0) {
    return 'Nincs feloldható egyházkerület-hatóköre — a művelet nem engedélyezett.'
  }
  const { data: cong } = await access.supabase
    .from('congregations')
    .select('diocese_id')
    .eq('id', congregationId)
    .maybeSingle()
  const dioceseId = (cong?.diocese_id as string | null) || null
  if (!dioceseId) return 'A dokumentum gyülekezetének nincs egyházmegye-besorolása.'
  const { data: dio } = await access.supabase
    .from('dioceses')
    .select('district_id')
    .eq('id', dioceseId)
    .maybeSingle()
  const districtId = (dio?.district_id as string | null) || null
  if (!districtId || !districtIds.includes(districtId)) {
    return 'A dokumentum nem az Ön egyházkerületéhez tartozik.'
  }
  return null
}

function revalidateDashboards() {
  revalidatePath('/dashboard-egyhazmegye')
  revalidatePath('/dashboard-kerulet')
}

// ---------------------------------------------------------------------------
// Gyülekezeti szintű: dokumentum beküldése
// ---------------------------------------------------------------------------

/**
 * Dokumentum beküldése az egyházmegyének (upsert a (cong, year, type, mod)
 * kulcson).
 *
 * FELÜLÍRÁS-VÉDELEM (2026-08-09, diagnosztika #4): véglegesített
 * (status='finalized') VAGY kerületnek továbbított sor NEM írható felül a
 * gyülekezetről — a hivatalos archívum megőrzése érdekében a lelkésznek az
 * egyházmegyétől kell visszaküldést kérnie. A 'returned' (visszaküldött)
 * státuszú sor ÚJRA BEKÜLDHETŐ: a státusz visszaáll 'submitted'-re, a
 * workflow-mezők nullázódnak, a visszaküldési indoklás pedig MEGMARAD a
 * notes-naplóban (időbélyeges sorként), és egy „újra beküldve" bejegyzés
 * kerül mellé — így az irat teljes útja visszaolvasható.
 */
export async function submitDocument(
  documentType: DocumentType,
  year: number,
  snapshotData: Record<string, unknown>,
  modificationNumber?: number | null,
): Promise<DocumentActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { supabase } = access
  const congregationId = access.effectiveCongregationId

  // 2026-07-10 (#4/8): a sor diocese_id-je a GYÜLEKEZET tényleges megyéjéből
  // jön (congregations.diocese_id). Az ÉRTESÍTÉS címzettjeit is KIZÁRÓLAG a
  // gyülekezet megyéje határozza meg (2026-08-09, diagnosztika #9).
  //
  // 2026-08-15 FIX (S1 biztonsági szelet, 0.4): a korábbi
  // `congDioceseId || profile?.diocese_id` fallback FAIL-CLOSED lett. Megye
  // nélküli gyülekezet + elavult beküldői skalár esetén a beküldött sor MÁS
  // megye diocese_id-jét kapta volna, és a régi (a sor nullable diocese_id
  // oszlopán pivotáló) RLS-nézetében annál a megyénél jelent volna meg. Ha a
  // gyülekezetnek nincs megyéje, a beküldés hangosan megáll — nem néma
  // skalár-fallback.
  const { data: congRow, error: congRowError } = await supabase
    .from('congregations')
    .select('diocese_id, name, nev_hu')
    .eq('id', congregationId)
    .maybeSingle()
  if (congRowError) {
    return {
      error:
        'A gyülekezet egyházmegye-besorolása most nem ellenőrizhető, ezért a beküldés biztonsági okból elmaradt. Próbálja újra néhány másodperc múlva.',
    }
  }
  const congDioceseId = (congRow?.diocese_id as string | null) || null
  if (!congDioceseId) {
    return {
      error:
        'A gyülekezethez nincs egyházmegye rendelve — kérd a rendszergazdát, hogy állítsa be; enélkül a beküldés rossz egyházmegyénél kötne ki.',
    }
  }
  const rowDioceseId = congDioceseId

  // Felülírás-védelem: a meglévő sor státusza dönt.
  let existingQ = supabase
    .from('document_submissions')
    .select('id, status, forwarded_to_kerulet, notes')
    .eq('congregation_id', congregationId)
    .eq('year', year)
    .eq('document_type', documentType)
  existingQ = modificationNumber
    ? existingQ.eq('modification_number', modificationNumber)
    : existingQ.is('modification_number', null)
  const { data: existing, error: existingError } = await existingQ.maybeSingle()

  // 2026-08-09 (review-fix): a védő-olvasás hibáját NEM nyeljük el — különben
  // átmeneti hiba esetén a felülírás-védelem némán kimaradna, és a beküldés
  // felülírná a már véglegesített/továbbított hivatalos archívum-sort.
  if (existingError) {
    return {
      error:
        'A korábbi beküldés állapota most nem ellenőrizhető, ezért a beküldés biztonsági okból elmaradt. Próbálja újra néhány másodperc múlva.',
    }
  }

  if (existing && (existing.forwarded_to_kerulet === true || existing.status === 'finalized')) {
    return {
      error:
        `A(z) ${year}. évi ${DOCUMENT_TYPE_LABELS[documentType].toLowerCase()} már ` +
        `${existing.forwarded_to_kerulet ? 'továbbítva lett az egyházkerületnek' : 'véglegesítve lett az egyházmegyénél'}, ` +
        'ezért nem küldhető be újra. Ha javítani szeretné, kérje az egyházmegyétől a dokumentum visszaküldését.',
    }
  }

  // Notes-napló: visszaküldött dokumentum újra-beküldésekor az indoklás
  // megmarad, és bejegyezzük az újra-beküldés tényét.
  let notes: string | null = (existing?.notes as string | null) ?? null
  if (existing && existing.status === 'returned') {
    notes = appendNoteLine(notes, 'A gyülekezet javítás után újra beküldte a dokumentumot.')
  }

  const { error } = await supabase.from('document_submissions').upsert(
    {
      congregation_id: congregationId,
      diocese_id: rowDioceseId,
      year,
      document_type: documentType,
      modification_number: modificationNumber || null,
      status: 'submitted' as DocumentStatus,
      submitted_at: new Date().toISOString(),
      snapshot_data: snapshotData,
      notes,
      // Újra-beküldésnél a workflow-idővonal tiszta lappal indul.
      received_at: null,
      received_by: null,
      reviewed_at: null,
      reviewed_by: null,
      finalized_at: null,
      finalized_by: null,
      forwarded_to_kerulet: false,
      forwarded_at: null,
    },
    { onConflict: 'congregation_id,year,document_type,modification_number' },
  )

  if (error) return { error: `Hiba: ${error.message}` }

  // Értesítés az egyházmegyei címzetteknek — CSAK ha a gyülekezet megyéje
  // feloldható (különben nincs címzett; országos szórás SOHA). A címzettek a
  // skalár (profiles) ÉS a profile_roles szerinti megyei vezetők uniója —
  // a skalár⇄profile_roles divergencia egyik irányban se nyeljen el értesítést.
  // Hiba esetén csendes — a beküldés már sikeres, ne blokkoljuk a flow-t.
  if (congDioceseId) {
    try {
      const congName = congDisplayName(congRow || {})
      const recipientIds = new Set<string>()

      const { data: scalarRecipients } = await supabase
        .from('profiles')
        .select('id')
        .eq('status', 'active')
        .in('role', ['esperes', 'egyhazmegyei_admin'])
        .eq('diocese_id', congDioceseId)
      for (const r of scalarRecipients || []) recipientIds.add(String(r.id))

      const { data: roleRecipients } = await supabase
        .from('profile_roles')
        .select('profile_id')
        .eq('scope', 'diocese')
        .eq('scope_id', congDioceseId)
        .in('role', ['esperes', 'egyhazmegyei_admin'])
        .eq('active', true)
        .eq('approval_status', 'approved')
      for (const r of roleRecipients || []) recipientIds.add(String(r.profile_id))

      if (recipientIds.size > 0) {
        const docLabel = DOCUMENT_TYPE_LABELS[documentType]
        const modSuffix = modificationNumber ? ` (${modificationNumber}. módosítás)` : ''
        const cim = `Új beküldés: ${docLabel}${modSuffix} — ${congName}`
        const uzenet =
          `${congName} beküldte a(z) ${year}. évi ${docLabel.toLowerCase()}${modSuffix} ` +
          `dokumentumot az egyházmegyének. Részletek: Egyházmegyei áttekintő.`

        const rows = [...recipientIds].map((userId) => ({
          user_id: userId,
          congregation_id: congregationId,
          cim,
          uzenet,
          tipus: 'info',
          hivatkozas: '/dashboard-egyhazmegye',
        }))
        await supabase.from('ertesitesek').insert(rows)
      }
    } catch {
      // Nem kritikus — a beküldés megtörtént.
    }
  }

  revalidatePath('/penzugy')
  revalidateDashboards()
  return { success: true }
}

// ---------------------------------------------------------------------------
// Egyházmegyei szintű: dokumentumok lekérdezése
// ---------------------------------------------------------------------------

/**
 * A hatókör-egyházmegye beküldései. year nélkül (vagy null) MINDEN év —
 * ez az alapértelmezett használat (év-kulcsolási hiba, diagnosztika #5:
 * a vagyonleltár year-1 kulcsú, a januári számadás az előző évhez tartozik).
 * FAIL-CLOSED: feloldhatatlan hatókör → üres lista (SOHA nem szűretlen);
 * a szűretlen ág csak a rendszergazdáé/masteré.
 */
export async function getDioceseSubmissions(
  year?: number | null,
): Promise<DocumentSubmission[]> {
  const ctx = await getDioceseScopeContext()
  if (!ctx.user) return []
  // 2026-08-11 (számvevő-kör): OLVASÁSI kapu — a számvevő is beleesik.
  if (!canReadDioceseScope(ctx.access)) return []

  // 2026-08-15 (S1, 0.3): listaszűrés a SZEREP-SZŰRT olvasói hatókörrel — a
  // tág ctx.scopeId a kerületi admin elavult skalárján át MÁS megye beküldéseit
  // is megmutatta volna. Üres hatókör → fail-closed üres lista.
  let congs: Array<{ id: string; name: string; diocese_id: string | null }>
  if (ctx.readScopeIds.length > 0) {
    congs = await fetchCongregations(ctx.supabase, ctx.readScopeIds)
  } else if (ctx.isMaster || ctx.isAdmin) {
    // Feliratozott rendszergazdai összesített ág (a hívó felület jelzi).
    congs = await fetchCongregations(ctx.supabase, null)
  } else {
    return [] // fail-closed
  }

  const congNames = new Map(congs.map((c) => [c.id, c.name]))
  const rows = await fetchSubmissions(
    ctx.supabase,
    ctx.readScopeIds.length > 0 ? congs.map((c) => c.id) : null,
    { year: year ?? null },
  )
  return sortBySubmittedDesc(rows.map((r) => toSubmission(r, congNames)))
}

// ---------------------------------------------------------------------------
// Egyházmegyei szintű: státusz frissítés (+ visszaküldés)
// ---------------------------------------------------------------------------

/**
 * Státusz-léptetés: received / reviewed / finalized / returned.
 *
 * 'returned' (2026-08-09, ÚJ): visszaküldés a gyülekezetnek javításra —
 * KÖTELEZŐ indoklással, ami a notes-naplóba kerül (időbélyeggel), és a
 * beküldő gyülekezet lelkésze(i) értesítést kapnak. Már továbbított
 * dokumentum nem küldhető vissza.
 *
 * App-oldali tulajdon-ellenőrzés + 0 soros UPDATE-detektálás (diagnosztika
 * #6): a néma no-op többé nem jelent hamis sikert.
 */
export async function updateSubmissionStatus(
  submissionId: string,
  newStatus: DocumentStatus,
  note?: string | null,
): Promise<DocumentActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // 2026-08-11 (számvevő-kör): az átvétel / ellenőrzés-jelölés / véglegesítés /
  // visszaküldés ÍRÁS a hivatalos archívumon. A számvevő az iratot és a
  // pillanatképét MEGNÉZHETI, de a státuszát nem lépteti.
  if (!canWriteDioceseScope(access)) {
    return { error: describeDioceseWriteBlock(access) ?? 'Nincs jogosultsága.' }
  }
  if (!['received', 'reviewed', 'finalized', 'returned'].includes(newStatus)) {
    return { error: 'Érvénytelen célstátusz.' }
  }

  const { supabase } = access
  const { data: sub } = await supabase
    .from('document_submissions')
    .select('id, congregation_id, year, document_type, status, forwarded_to_kerulet, notes')
    .eq('id', submissionId)
    .maybeSingle()
  if (!sub) return { error: 'A dokumentum nem található, vagy nincs hozzáférése.' }

  const ownershipError = await assertDioceseOwnership(access, String(sub.congregation_id))
  if (ownershipError) return { error: ownershipError }

  // 2026-08-09 (review-fix): a továbbított irat státusza zárolt — DE a
  // VISSZAKÜLDÉS kivétel, különben javítási zsákutca keletkezne (a hibás,
  // már továbbított dokumentumot senki nem tudná korrigáltatni). A
  // visszaküldés egyben visszavonja a továbbítást is (lásd lentebb).
  if (sub.forwarded_to_kerulet === true && newStatus !== 'returned') {
    return { error: 'A dokumentum már továbbítva lett az egyházkerületnek — a státusza nem módosítható. Ha javítás kell, küldje vissza a gyülekezetnek.' }
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'received') {
    updates.received_at = now
    updates.received_by = access.user.id
  } else if (newStatus === 'reviewed') {
    updates.reviewed_at = now
    updates.reviewed_by = access.user.id
  } else if (newStatus === 'finalized') {
    updates.finalized_at = now
    updates.finalized_by = access.user.id
  } else if (newStatus === 'returned') {
    const trimmedNote = (note || '').trim()
    if (!trimmedNote) {
      return { error: 'A visszaküldéshez kötelező indoklást írni a gyülekezetnek.' }
    }
    updates.notes = appendNoteLine(
      sub.notes as string | null,
      sub.forwarded_to_kerulet === true
        ? `Visszaküldve javításra az egyházmegyétől (a kerületi továbbítás visszavonva) — ${trimmedNote}`
        : `Visszaküldve javításra az egyházmegyétől — ${trimmedNote}`,
    )
    // A korábbi véglegesítés érvényét veszti (a visszaküldött irat nem végleges).
    updates.finalized_at = null
    updates.finalized_by = null
    // 2026-08-09 (review-fix): a visszaküldés a továbbítást is visszavonja —
    // így a gyülekezet javíthat, és a javított irat újra végigmehet a soron.
    // (A kerület nézetéből ilyenkor eltűnik, amíg újra be nem küldik.)
    if (sub.forwarded_to_kerulet === true) {
      updates.forwarded_to_kerulet = false
      updates.forwarded_at = null
    }
  }

  const { data: updated, error } = await supabase
    .from('document_submissions')
    .update(updates)
    .eq('id', submissionId)
    .select('id')

  if (error) return { error: `Hiba: ${error.message}` }
  if (!updated || updated.length === 0) {
    // RLS által elnyelt no-op — hangos hiba a néma "siker" helyett.
    return { error: 'A módosítás nem történt meg (nincs írási jogosultsága ehhez a dokumentumhoz).' }
  }

  // Visszaküldésnél best-effort értesítés a beküldő gyülekezet lelkészeinek.
  if (newStatus === 'returned') {
    try {
      const docType = sub.document_type as DocumentType
      const docLabel = DOCUMENT_TYPE_LABELS[docType] || String(sub.document_type)
      const { data: pastors } = await supabase
        .from('profiles')
        .select('id')
        .eq('status', 'active')
        .eq('role', 'lelkesz')
        .eq('congregation_id', sub.congregation_id)
      if (pastors && pastors.length > 0) {
        const rows = pastors.map((p) => ({
          user_id: p.id,
          congregation_id: sub.congregation_id,
          cim: `Visszaküldött dokumentum: ${docLabel} (${sub.year}.)`,
          uzenet:
            `Az egyházmegye javításra visszaküldte a(z) ${sub.year}. évi ` +
            `${docLabel.toLowerCase()} dokumentumot. Indoklás: ${(note || '').trim()} ` +
            `A javítás után a dokumentum újra beküldhető.`,
          tipus: 'warning',
          hivatkozas: RETURN_LINKS[docType] || '/dashboard',
        }))
        await supabase.from('ertesitesek').insert(rows)
      }
    } catch {
      // Nem kritikus — a visszaküldés megtörtént.
    }
  }

  revalidateDashboards()
  return { success: true }
}

// ---------------------------------------------------------------------------
// Egyházmegyei szintű: továbbítás a kerületnek
// ---------------------------------------------------------------------------

export async function forwardToKerulet(
  submissionId: string,
): Promise<DocumentActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // 2026-08-11 (számvevő-kör): a kerületnek továbbítás ÍRÁS — nem az ellenőr dolga.
  if (!canWriteDioceseScope(access)) {
    return { error: describeDioceseWriteBlock(access) ?? 'Nincs jogosultsága.' }
  }

  const { supabase } = access
  const { data: sub } = await supabase
    .from('document_submissions')
    .select('id, congregation_id, status, forwarded_to_kerulet')
    .eq('id', submissionId)
    .maybeSingle()
  if (!sub) return { error: 'A dokumentum nem található, vagy nincs hozzáférése.' }

  const ownershipError = await assertDioceseOwnership(access, String(sub.congregation_id))
  if (ownershipError) return { error: ownershipError }

  if (sub.forwarded_to_kerulet === true) {
    return { error: 'A dokumentum már továbbítva lett az egyházkerületnek.' }
  }
  if (sub.status !== 'finalized') {
    return { error: 'Csak véglegesített dokumentum továbbítható az egyházkerületnek.' }
  }

  const { data: updated, error } = await supabase
    .from('document_submissions')
    .update({
      forwarded_to_kerulet: true,
      forwarded_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('status', 'finalized')
    .select('id')

  if (error) return { error: `Hiba: ${error.message}` }
  if (!updated || updated.length === 0) {
    return { error: 'A továbbítás nem történt meg (nincs írási jogosultsága ehhez a dokumentumhoz).' }
  }

  revalidateDashboards()
  return { success: true }
}

// ---------------------------------------------------------------------------
// Kerületi szintű: dokumentumok lekérdezése
// ---------------------------------------------------------------------------

/**
 * A kerülethez tartozó dokumentumok. Láthatóság a 2026-08-09-es RLS-sel
 * azonosan: forwarded_to_kerulet=true VAGY status='finalized' (a munkaközi
 * submitted/received/reviewed a megye belső ügye). year nélkül MINDEN év.
 *
 * Hatókör app-oldalon is: a beküldés gyülekezete → megye → kerület útvonalon
 * (a sor nullable diocese_id oszlopa helyett), a hívó districtIds-ébe szűrve.
 * FAIL-CLOSED; a szűretlen ág csak a rendszergazdáé/masteré.
 */
export async function getKeruletSubmissions(
  year?: number | null,
): Promise<DocumentSubmission[]> {
  const ctx = await getDistrictScopeContext()
  if (!ctx.user) return []
  // Szerep-kapu (2026-08-09, diagnosztika #10): korábban bármely bejelentkezett
  // felhasználó hívhatta. egyhazkeruletiAdmin magában foglalja az admin/mastert.
  if (!ctx.access.egyhazkeruletiAdmin && !ctx.isAdmin && !ctx.isMaster) return []

  let congs: Array<{ id: string; name: string; diocese_id: string | null }>
  let dioceseNames = new Map<string, string>()

  if (ctx.districtIds.length > 0) {
    const { data: dioceses } = await ctx.supabase
      .from('dioceses')
      .select('id, name')
      .in('district_id', ctx.districtIds)
    const dioIds = (dioceses || []).map((d) => String(d.id))
    dioceseNames = new Map((dioceses || []).map((d) => [String(d.id), String(d.name || '')]))
    if (dioIds.length === 0) return []
    congs = await fetchCongregations(ctx.supabase, dioIds)
  } else if (ctx.isMaster || ctx.isAdmin) {
    const { data: dioceses } = await ctx.supabase.from('dioceses').select('id, name')
    dioceseNames = new Map((dioceses || []).map((d) => [String(d.id), String(d.name || '')]))
    congs = await fetchCongregations(ctx.supabase, null)
  } else {
    return [] // fail-closed
  }

  const congNames = new Map(congs.map((c) => [c.id, c.name]))
  const dioceseNameByCong = new Map(
    congs.map((c) => [c.id, c.diocese_id ? dioceseNames.get(c.diocese_id) ?? null : null]),
  )
  const rows = await fetchSubmissions(
    ctx.supabase,
    ctx.districtIds.length > 0 ? congs.map((c) => c.id) : null,
    { year: year ?? null, districtVisibleOnly: true },
  )
  return sortBySubmittedDesc(rows.map((r) => toSubmission(r, congNames, dioceseNameByCong)))
}

// ---------------------------------------------------------------------------
// Kerületi szintű: átvétel visszaigazolása (notes-napló)
// ---------------------------------------------------------------------------

/**
 * „Átvéve a kerületben" — a kerület a hozzá TOVÁBBÍTOTT dokumentumon
 * visszaigazolja az átvételt (opcionális megjegyzéssel), a notes-naplóba
 * időbélyeges bejegyzésként. A RLS (2026-08-09 1b) is csak továbbított soron
 * enged kerületi UPDATE-et — az app-oldali assert + 0 soros detektálás a
 * néma no-opot hangos hibává teszi.
 */
export async function acknowledgeKeruletReceipt(
  submissionId: string,
  note?: string | null,
): Promise<DocumentActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.egyhazkeruletiAdmin && !access.admin && !access.master) {
    return { error: 'Nincs jogosultsága.' }
  }

  const { supabase } = access
  const { data: sub } = await supabase
    .from('document_submissions')
    .select('id, congregation_id, forwarded_to_kerulet, notes')
    .eq('id', submissionId)
    .maybeSingle()
  if (!sub) return { error: 'A dokumentum nem található, vagy nincs hozzáférése.' }

  if (sub.forwarded_to_kerulet !== true) {
    return { error: 'Csak a kerületnek már továbbított dokumentum átvételét lehet visszaigazolni.' }
  }

  const ownershipError = await assertDistrictOwnership(access, String(sub.congregation_id))
  if (ownershipError) return { error: ownershipError }

  const trimmedNote = (note || '').trim()
  const notes = appendNoteLine(
    sub.notes as string | null,
    `Az egyházkerület visszaigazolta az átvételt${trimmedNote ? ` — ${trimmedNote}` : '.'}`,
  )

  const { data: updated, error } = await supabase
    .from('document_submissions')
    .update({ notes })
    .eq('id', submissionId)
    .eq('forwarded_to_kerulet', true)
    .select('id')

  if (error) return { error: `Hiba: ${error.message}` }
  if (!updated || updated.length === 0) {
    return { error: 'A visszaigazolás nem történt meg (nincs írási jogosultsága ehhez a dokumentumhoz).' }
  }

  revalidateDashboards()
  return { success: true }
}

// ---------------------------------------------------------------------------
// Dokumentumközpont: teljességi mátrix + teljes adatcsomag
// ---------------------------------------------------------------------------

/**
 * A hatókör feloldva EGY helyen (2026-08-11, 5. kör, P2-#19), hogy a
 * teljességi mátrix, az év-utántöltés és a pillanatkép-lekérés BIZTOSAN
 * ugyanazt a fail-closed szabályt alkalmazza. `congIds = null` → szűretlen,
 * ami KIZÁRÓLAG a feliratozott rendszergazdai/master ágon fordulhat elő.
 */
interface ResolvedDocScope {
  supabase: Supa
  congs: Array<{ id: string; name: string; diocese_id: string | null }>
  congIds: string[] | null
  congNames: Map<string, string>
  dioceseNames: Map<string, string>
  dioceseNameByCong: Map<string, string | null>
  scopeNotice: string | null
  districtVisibleOnly: boolean
}

async function resolveDocumentScope(
  scope: 'diocese' | 'district',
): Promise<{ ok: true; value: ResolvedDocScope } | { ok: false; error: string }> {
  if (scope === 'diocese') {
    const ctx = await getDioceseScopeContext()
    if (!ctx.user) return { ok: false, error: 'Nincs bejelentkezve.' }
    // 2026-08-11 (számvevő-kör): ez egy OLVASÓ feloldó (a dokumentumközpont
    // adatcsomagját állítja elő) — az egyházmegyei számvevő is átmegy rajta.
    // Az írási akciók (updateSubmissionStatus, forwardToKerulet) KÜLÖN
    // ellenőriznek `canWriteDioceseScope`-pal.
    if (!canReadDioceseScope(ctx.access)) {
      return { ok: false, error: 'Nincs jogosultsága az egyházmegyei dokumentumokhoz.' }
    }

    // 2026-08-15 (S1, 0.3): listaszűrés a SZEREP-SZŰRT olvasói hatókörrel
    // (ctx.readScopeIds) a tág ctx.scopeId helyett — a tág feloldó a kerületi
    // admin elavult `profiles.diocese_id` skalárját szerep nélkül is bevette,
    // így MÁS megye beküldés-mátrixa látszott. Üres hatókör → fail-closed.
    let congs: Array<{ id: string; name: string; diocese_id: string | null }>
    let scopeNotice: string | null = null
    if (ctx.readScopeIds.length > 0) {
      congs = await fetchCongregations(ctx.supabase, ctx.readScopeIds)
    } else if (ctx.isMaster || ctx.isAdmin) {
      congs = await fetchCongregations(ctx.supabase, null)
      scopeNotice = 'Rendszergazdai nézet: minden egyházmegye gyülekezetei látszanak.'
    } else {
      return {
        ok: false,
        error:
          'Nincs feloldható egyházmegye-hatóköre — az adatok védelme érdekében nem jelenítünk meg listát.',
      }
    }

    return {
      ok: true,
      value: {
        supabase: ctx.supabase,
        congs,
        congIds: ctx.readScopeIds.length > 0 ? congs.map((c) => c.id) : null,
        congNames: new Map(congs.map((c) => [c.id, c.name])),
        dioceseNames: new Map(),
        dioceseNameByCong: new Map(),
        scopeNotice,
        districtVisibleOnly: false,
      },
    }
  }

  // scope === 'district'
  const ctx = await getDistrictScopeContext()
  if (!ctx.user) return { ok: false, error: 'Nincs bejelentkezve.' }
  if (!ctx.access.egyhazkeruletiAdmin && !ctx.isAdmin && !ctx.isMaster) {
    return { ok: false, error: 'Nincs jogosultsága az egyházkerületi dokumentumokhoz.' }
  }

  let dioceseNames = new Map<string, string>()
  let congs: Array<{ id: string; name: string; diocese_id: string | null }>
  let scopeNotice: string | null = null

  if (ctx.districtIds.length > 0) {
    const { data: dioceses } = await ctx.supabase
      .from('dioceses')
      .select('id, name')
      .in('district_id', ctx.districtIds)
    const dioIds = (dioceses || []).map((d) => String(d.id))
    dioceseNames = new Map((dioceses || []).map((d) => [String(d.id), String(d.name || '')]))
    congs = dioIds.length > 0 ? await fetchCongregations(ctx.supabase, dioIds) : []
  } else if (ctx.isMaster || ctx.isAdmin) {
    const { data: dioceses } = await ctx.supabase.from('dioceses').select('id, name')
    dioceseNames = new Map((dioceses || []).map((d) => [String(d.id), String(d.name || '')]))
    congs = await fetchCongregations(ctx.supabase, null)
    scopeNotice = 'Rendszergazdai nézet: minden egyházkerület dokumentumai látszanak.'
  } else {
    return {
      ok: false,
      error:
        'Nincs feloldható egyházkerület-hatóköre — az adatok védelme érdekében nem jelenítünk meg listát.',
    }
  }

  return {
    ok: true,
    value: {
      supabase: ctx.supabase,
      congs,
      congIds: ctx.districtIds.length > 0 ? congs.map((c) => c.id) : null,
      congNames: new Map(congs.map((c) => [c.id, c.name])),
      dioceseNames,
      dioceseNameByCong: new Map(
        congs.map((c) => [c.id, c.diocese_id ? dioceseNames.get(c.diocese_id) ?? null : null]),
      ),
      scopeNotice,
      districtVisibleOnly: true,
    },
  }
}

/**
 * A dokumentumközpont adatcsomagja: a hatókör TELJES gyülekezet-listája
 * (nem a beküldésekből! — így a „ki nem adta be" megválaszolható,
 * diagnosztika #7) + a BETÖLTÖTT évek beküldései + a teljes évlista.
 *
 * 2026-08-11 (5. kör, P2-#19) — ÉV-ABLAK: korábban `year: null`-lal MINDEN
 * év MINDEN beküldése (a teljes jsonb pillanatképekkel együtt) bekerült a
 * kliens-csomagba, és ez évente ~6 MB-tal nőtt, örökre. Alapból most csak a
 * beszámolási szezon éve + az előző év + a naptári év töltődik; a
 * régebbi éveket az év-választó kéri le (getSubmissionsForYear). Az
 * év-chipek és az archívum-darabszám továbbra is a TELJES archívumot
 * tükrözik (olcsó, csak a `year` oszlopot olvasó lekérdezésből).
 *
 * scope='diocese': a feloldott egyházmegye gyülekezetei, minden státusz.
 * scope='district': a kerület megyéinek gyülekezetei, kerületi láthatósággal
 * (forwarded VAGY finalized — a RLS-sel azonos szabály).
 * FAIL-CLOSED: feloldhatatlan hatókör → error + üres tömbök; a szűretlen ág
 * csak a rendszergazdáé/masteré (scopeNotice felirattal).
 */
export async function getSubmissionMatrix(
  scope: 'diocese' | 'district',
  /** `years: null` → explicit „minden év" (a felhasználó kérte). */
  opts?: { years?: number[] | null },
): Promise<DocumentCenterData> {
  const empty: DocumentCenterData = {
    congregations: [],
    submissions: [],
    years: [],
    loadedYears: [],
    totalCount: 0,
    scopeNotice: null,
  }

  const resolved = await resolveDocumentScope(scope)
  if (!resolved.ok) return { ...empty, error: resolved.error }
  const {
    supabase,
    congs,
    congIds,
    congNames,
    dioceseNames,
    dioceseNameByCong,
    scopeNotice,
    districtVisibleOnly,
  } = resolved.value

  const loadedYears =
    opts?.years === null ? null : opts?.years?.length ? [...opts.years] : defaultLoadedYears()

  const [rows, stats] = await Promise.all([
    fetchSubmissions(supabase, congIds, { years: loadedYears, districtVisibleOnly }),
    fetchSubmissionYearStats(supabase, congIds, { districtVisibleOnly }),
  ])

  const submissions = sortBySubmittedDesc(
    rows.map((r) => toSubmission(r, congNames, dioceseNameByCong)),
  )
  return {
    congregations: congs.map(
      (c): DocumentCenterCongregation => ({
        id: c.id,
        name: c.name,
        dioceseId: c.diocese_id,
        dioceseName: c.diocese_id ? dioceseNames.get(c.diocese_id) ?? null : null,
      }),
    ),
    submissions,
    years: mergeYears(stats.years, loadedYears ?? []),
    loadedYears: loadedYears ?? stats.years,
    totalCount: stats.totalCount,
    scopeNotice,
  }
}

/**
 * Egyetlen év (vagy `year=null` esetén MINDEN év) beküldései — a
 * dokumentumközpont év-választója hívja, amikor az esperes/kerületi admin
 * olyan évet választ, ami nem volt az alap év-ablakban (2026-08-11, P2-#19).
 * Ugyanaz a fail-closed hatókör-feloldás, mint a mátrixnál.
 */
export async function getSubmissionsForYear(
  scope: 'diocese' | 'district',
  year: number | null,
): Promise<{ submissions: DocumentSubmission[]; error?: string }> {
  const resolved = await resolveDocumentScope(scope)
  if (!resolved.ok) return { submissions: [], error: resolved.error }
  const { supabase, congIds, congNames, dioceseNameByCong, districtVisibleOnly } = resolved.value

  const rows = await fetchSubmissions(supabase, congIds, {
    year: year ?? null,
    districtVisibleOnly,
  })
  return {
    submissions: sortBySubmittedDesc(rows.map((r) => toSubmission(r, congNames, dioceseNameByCong))),
  }
}

/**
 * Egyetlen beküldés fagyasztott pillanatképe — IGÉNY SZERINT (2026-08-11,
 * P2-#19). A jogosultság-ellenőrzés fail-closed és szint-függő: a megye a
 * saját gyülekezeteit, a kerület a saját megyéinek gyülekezeteit láthatja
 * — és a kerület CSAK a hozzá továbbított vagy véglegesített iratot.
 */
export async function getSubmissionSnapshot(
  submissionId: string,
  scope: 'diocese' | 'district',
): Promise<{ snapshot: Record<string, unknown> | null; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { snapshot: null, error: 'Nincs bejelentkezve.' }
  if (scope === 'diocese') {
    // 2026-08-11 (számvevő-kör): a fagyasztott pillanatkép MEGTEKINTÉSE — épp
    // ez a számvevő munkaeszköze („a beküldött snapshot-okon", ROLE_TEMPLATES).
    if (!canReadDioceseScope(access)) {
      return { snapshot: null, error: 'Nincs jogosultsága.' }
    }
  } else if (!access.egyhazkeruletiAdmin && !access.admin && !access.master) {
    return { snapshot: null, error: 'Nincs jogosultsága.' }
  }

  const { data: sub, error } = await access.supabase
    .from('document_submissions')
    .select('id, congregation_id, status, forwarded_to_kerulet, snapshot_data')
    .eq('id', submissionId)
    .maybeSingle()
  if (error) {
    return {
      snapshot: null,
      error:
        'A beküldött adatok most nem tölthetők be. Próbálja újra néhány másodperc múlva.',
    }
  }
  if (!sub) {
    return { snapshot: null, error: 'A dokumentum nem található, vagy nincs hozzáférése.' }
  }

  const ownershipError =
    scope === 'diocese'
      ? await assertDioceseOwnership(access, String(sub.congregation_id))
      : await assertDistrictOwnership(access, String(sub.congregation_id))
  if (ownershipError) return { snapshot: null, error: ownershipError }

  if (scope === 'district' && sub.forwarded_to_kerulet !== true && sub.status !== 'finalized') {
    return { snapshot: null, error: 'Ez a dokumentum még nem érkezett meg az egyházkerülethez.' }
  }

  return { snapshot: (sub.snapshot_data as Record<string, unknown> | null) ?? null }
}

/**
 * Évlista: a TELJES archívum évei + a betöltött évek + az aktuális és
 * előző év, csökkenő sorrendben. Így az év-chipek akkor is teljesek, ha az
 * adott év sorai még nincsenek betöltve.
 */
function mergeYears(archiveYears: number[], loadedYears: number[]): number[] {
  const current = new Date().getFullYear()
  const years = new Set<number>([current, current - 1, ...archiveYears, ...loadedYears])
  return [...years].sort((a, b) => b - a)
}
