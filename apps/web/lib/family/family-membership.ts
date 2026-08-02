/**
 * Család-tagsági közös helperek (2026-08-01, PR-18).
 *
 * KIEMELVE a family-actions.ts-ből ('use server' fájlból nem importálhatók a
 * nem-exportált helperek más action-fájlokba, az exportált függvények viszont
 * hívható endpointtá válnának) — így a tagnyilvántartás, az anyakönyv és a
 * tag-mentés ugyanazt a háztartás-szinkront és dupla-tagsági őrt használja.
 *
 * Hibrid modell: csalad (id_ferfi/id_no) + gyerek (junction) a RÉGI, cim +
 * haztartas + haztartas_tag (ervenyes_ig soft-close) az ÚJ réteg. A csalad és
 * a gyerek táblán NINCS congregation_id — a gyülekezet-hatókört a haztartas
 * (legacy_csalad_id) adja, ezért minden őr az allowed-halmazzal metsz.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface FamilyMembershipInfo {
  familyId: number
  role: 'felnott' | 'gyermek'
  familyName: string
}

export interface AssignConflict {
  personId: number
  personName: string
  familyId: number
  familyName: string
  role: 'felnott' | 'gyermek'
}

export interface MembershipConflicts {
  /** Felnőttként MÁSIK saját-gyülekezeti aktív családban — kemény tiltás */
  blocked: AssignConflict[]
  /** Gyermekként MÁSIK saját-gyülekezeti családban — megerősítéssel áthelyezhető */
  movable: AssignConflict[]
  /**
   * MÁSIK GYÜLEKEZET családnyilvántartásában maradt tagság (pl. egyháztag-
   * átadás után) — nem blokkolunk és NEM nyúlunk hozzá, csak figyelmeztetünk.
   */
  foreign: AssignConflict[]
  /** A saját gyülekezet család-id-i (haztartas.legacy_csalad_id) */
  allowed: Set<number>
}

/** A supabase-js nem dob — a {error}-t explicit ellenőrizni kell. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function must(res: { data: any; error: { message: string } | null }, step: string): any {
  if (res.error) throw new Error(`${step}: ${res.error.message}`)
  return res.data
}

/**
 * A `csalad.id`-k halmaza, amelyhez az adott gyülekezetnek hozzáférése van
 * (haztartas.legacy_csalad_id alapján — a csalad táblán nincs congregation_id).
 *
 * throwOnError: ŐR-bemenetként hívva kötelező — az elnyelt olvasási hiba üres
 * halmazt adna, amitől a dupla-tagsági őr fail-open módon MINDENT idegennek
 * nézne (tiltás megkerülve, régi tagság lezáratlanul).
 */
export async function getAllowedFamilyIds(
  supabase: Db,
  congregationId: string,
  opts?: { throwOnError?: boolean },
): Promise<Set<number>> {
  const { data, error } = await supabase
    .from('haztartas')
    .select('legacy_csalad_id')
    .eq('congregation_id', congregationId)
    .not('legacy_csalad_id', 'is', null)
  if (error && opts?.throwOnError) throw new Error(`haztartas-olvasas: ${error.message}`)

  return new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((data || []) as any[])
      .map((row) => row.legacy_csalad_id as number)
      .filter((id): id is number => id != null),
  )
}

/**
 * A régi `csalad` rekord aktuális állapotát szinkronizálja az új `haztartas` +
 * `cim` + `haztartas_tag` táblákba (2026-06-01, hibrid Fázis 2).
 *
 * 2026-08-01 (PR-18) javítások:
 *  - D3: minden ÍRÁS ÉS OLVASÁS hibája throw (a supabase-js nem dob magától) —
 *    egy elbukó gyerek-olvasás korábban ÜRES céllistát adott, és a diff némán
 *    lezárta a háztartás ÖSSZES gyermek-tagságát.
 *  - D2: meglévő háztartásnál a cím a `cim` sorba is átíródik — de a fazis1-
 *    backfill MEGOSZTOTT cim-sorai (két azonos című család ugyanarra a cim-re
 *    mutat) miatt közös sort sosem írunk át: ilyenkor saját cim-sort kap a
 *    háztartás.
 *  - D1: az 'unoka' szerep is a diff része, DE unoka-tagot csak akkor zárunk
 *    le, ha az explicit el lett távolítva (removedPersonIds) — a csak-adatjavításból
 *    származó unoka-tagságot (nincs gyerek-sora) a sync nem birtokolja.
 */
export async function syncHouseholdFromCsalad(
  supabase: Db,
  csaladId: number,
  congregationId: string,
  removedPersonIds: number[] = [],
) {
  // 1. Olvas: csalad + gyerek
  const csaladRow = must(await supabase
    .from('csalad')
    .select('id_ferfi, id_no, c_utcaid, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto, id_csoport, isaktiv')
    .eq('id', csaladId)
    .maybeSingle(), 'csalad-olvasas')
  if (!csaladRow) return

  const gyerekRows = must(await supabase
    .from('gyerek')
    .select('id_szemely')
    .eq('id_csalad', csaladId), 'gyerek-olvasas')
  // Dedup — a gyerek táblán nincs UNIQUE, a dupla sor ne duplázza az éleket
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gyerekIds = [...new Set(((gyerekRows || []) as any[]).map((g) => g.id_szemely as number))]

  // 2. Olvas vagy hoz létre: haztartas
  const existingHaztartas = must(await supabase
    .from('haztartas')
    .select('id, id_cim')
    .eq('legacy_csalad_id', csaladId)
    .is('ervenyes_ig', null)
    .limit(1)
    .maybeSingle(), 'haztartas-olvasas')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let haztartasId: string | null = (existingHaztartas as any)?.id ?? null

  const cimFields = {
    id_utca: csaladRow.c_utcaid,
    szam: csaladRow.c_szam,
    tombhaz: csaladRow.c_tombhaz,
    lepcsohaz: csaladRow.c_lepcsohaz,
    emelet: csaladRow.c_emelet,
    ajto: csaladRow.c_ajto,
  }

  if (!haztartasId) {
    // Új cim
    const cimRow = must(await supabase
      .from('cim')
      .insert([{
        congregation_id: congregationId,
        ...cimFields,
        tipus: 'otthon',
        megjegyzes: 'saveFamily-sync',
      }])
      .select('id')
      .single(), 'cim-insert')

    // Új haztartas (legacy_csalad_id-vel)
    const haztartasRow = must(await supabase
      .from('haztartas')
      .insert([{
        congregation_id: congregationId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        id_cim: (cimRow as any)?.id ?? null,
        id_csoport: csaladRow.id_csoport,
        isaktiv: csaladRow.isaktiv,
        legacy_csalad_id: csaladId,
        ervenyes_tol: new Date().toISOString().slice(0, 10),
      }])
      .select('id')
      .single(), 'haztartas-insert')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    haztartasId = (haztartasRow as any)?.id ?? null
  } else {
    must(await supabase
      .from('haztartas')
      .update({ isaktiv: csaladRow.isaktiv, id_csoport: csaladRow.id_csoport })
      .eq('id', haztartasId), 'haztartas-update')
    // 2026-08-01 (PR-18 D2): a címszerkesztés a `cim` táblába is átíródik —
    // a Családok lista a cim-et preferálja a csalad felett, ezért enélkül a
    // RÉGI címet mutatta. MEGOSZTOTT cim-sort (fazis1-backfill: két azonos
    // című család ugyanarra a cim-re mutathat) viszont nem írunk át — olyankor
    // saját cim-sort kap ez a háztartás.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cimId = (existingHaztartas as any)?.id_cim as string | null
    if (cimId) {
      // ARCHIVÁLT háztartás cim-hivatkozása is számít megosztásnak — különben
      // az in-place update a lezárt háztartás történeti címét is átírná.
      const sharers = must(await supabase
        .from('haztartas')
        .select('id')
        .eq('id_cim', cimId)
        .neq('id', haztartasId)
        .limit(1), 'cim-megosztas-olvasas')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (((sharers || []) as any[]).length > 0) {
        const newCim = must(await supabase
          .from('cim')
          .insert([{
            congregation_id: congregationId,
            ...cimFields,
            tipus: 'otthon',
            megjegyzes: 'saveFamily-sync-split',
          }])
          .select('id')
          .single(), 'cim-split-insert')
        must(await supabase
          .from('haztartas')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ id_cim: (newCim as any)?.id ?? null })
          .eq('id', haztartasId), 'haztartas-cim-atkotes')
      } else {
        must(await supabase
          .from('cim')
          .update(cimFields)
          .eq('id', cimId), 'cim-update')
      }
    }
  }

  if (!haztartasId) return

  // 3. Tagok szinkronizálása (diff a célállapottal)
  const existingTags = must(await supabase
    .from('haztartas_tag')
    .select('id, id_szemely, szerep')
    .eq('id_haztartas', haztartasId)
    .is('ervenyes_ig', null)
    .in('szerep', ['csaladfo', 'hazastars', 'gyermek', 'unoka']), 'haztartas_tag-olvasas')

  // Célállapot: 1 csaladfo (id_ferfi), 1 hazastars (id_no), n gyermek
  const desiredTags = new Map<number, string>()
  if (csaladRow.id_ferfi) desiredTags.set(csaladRow.id_ferfi as number, 'csaladfo')
  if (csaladRow.id_no) desiredTags.set(csaladRow.id_no as number, 'hazastars')
  for (const gyerekId of gyerekIds) desiredTags.set(gyerekId, 'gyermek')

  const today = new Date().toISOString().slice(0, 10)
  const removedSet = new Set(removedPersonIds)

  // 3a. Lezárjuk a már nem szereplő tagokat
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const tag of (existingTags || []) as any[]) {
    const desiredSzerep = desiredTags.get(tag.id_szemely as number)
    if (!desiredSzerep) {
      // Unoka-tagot csak explicit eltávolításnál zárunk le — a gyerek-sor
      // nélküli (adatjavításból származó) unoka-tagságot a sync nem birtokolja.
      if (tag.szerep === 'unoka' && !removedSet.has(tag.id_szemely as number)) continue
      must(await supabase
        .from('haztartas_tag')
        .update({ ervenyes_ig: today })
        .eq('id', tag.id), 'haztartas_tag-lezaras')
    } else {
      // Már aktív tag a megfelelő szerepben → kihúzzuk a desired-ből
      // (Ha más szerep van — pl. unoka a gyerek-listában —, NEM frissítjük:
      // a meglévő szerep marad, dupla sor nem keletkezik.)
      desiredTags.delete(tag.id_szemely as number)
    }
  }

  // 3b. Új tagokat beszúrjuk
  const newTags = Array.from(desiredTags.entries()).map(([id_szemely, szerep]) => ({
    id_haztartas: haztartasId,
    id_szemely,
    szerep,
    is_primary: szerep === 'csaladfo' || (szerep === 'hazastars' && !csaladRow.id_ferfi),
    ervenyes_tol: today,
    congregation_id: congregationId,
  }))
  if (newTags.length > 0) {
    must(await supabase.from('haztartas_tag').insert(newTags), 'haztartas_tag-insert')
  }

  // 4. Rokonsági kapcsolatok (szemely_kapcsolat) — 2026-08-02 (PR-20).
  // A CSALÁDFA KIZÁRÓLAG ebből a táblából épül; eddig csak a CNP-s tagmentés,
  // a keresztelés és az importok írták, a Családok fülről / hozzárendelésből
  // mentett tagság NEM → a fa a nagyszülőknél megállt. A DB-oldali
  // sync_households_from_csalad RPC (2026-07-18) ugyanezt írja — ez a TS-
  // párja, hogy MINDEN felületi mentés után azonnal meglegyenek az élek.
  //
  // Szabályok (PR-20 review után):
  //  - LEZÁRT élt nem támasztunk fel (haláleset/kézi javítás tudatos döntés),
  //    KIVÉVE a sync/eltávolítás által zárt élt — azt újranyitjuk, ha a tagság
  //    újra fennáll (a gyermeket visszatették a családba).
  //  - Best-effort: a rokonsági élek hibája nem minősíti át a már sikeres
  //    háztartás-szinkront (párhuzamos mentések ütközését is elnyeli).
  try {
    const kinshipPairs: Array<{ id1: number; id2: number; tipus: string; ver: boolean }> = []
    if (csaladRow.id_ferfi && csaladRow.id_no && csaladRow.id_ferfi !== csaladRow.id_no) {
      kinshipPairs.push({ id1: csaladRow.id_ferfi as number, id2: csaladRow.id_no as number, tipus: 'hazastars', ver: false })
    }
    for (const gyerekId of gyerekIds) {
      if (csaladRow.id_ferfi && csaladRow.id_ferfi !== gyerekId) {
        kinshipPairs.push({ id1: csaladRow.id_ferfi as number, id2: gyerekId, tipus: 'szulo_gyermek', ver: true })
      }
      if (csaladRow.id_no && csaladRow.id_no !== gyerekId) {
        kinshipPairs.push({ id1: csaladRow.id_no as number, id2: gyerekId, tipus: 'szulo_gyermek', ver: true })
      }
    }
    if (kinshipPairs.length > 0) {
      const ids = [...new Set(kinshipPairs.flatMap((p) => [p.id1, p.id2]))]
      // MINDEN (aktív ÉS lezárt) él kell a döntéshez
      const existing = must(await supabase
        .from('szemely_kapcsolat')
        .select('id, id_szemely_1, id_szemely_2, tipus, ervenyes_ig, megjegyzes')
        .in('id_szemely_1', ids), 'szemely_kapcsolat-olvasas')
      interface EdgeRow { id: number; id_szemely_1: number; id_szemely_2: number; tipus: string; ervenyes_ig: string | null; megjegyzes: string | null }
      const edgeByKey = new Map<string, EdgeRow[]>()
      for (const r of (existing || []) as EdgeRow[]) {
        const k = `${r.id_szemely_1}|${r.id_szemely_2}|${r.tipus}`
        const list = edgeByKey.get(k) ?? []
        list.push(r)
        edgeByKey.set(k, list)
      }
      const lookupRows = (p: { id1: number; id2: number; tipus: string }): EdgeRow[] => {
        const direct = edgeByKey.get(`${p.id1}|${p.id2}|${p.tipus}`) ?? []
        // a házastársi él iránytól függetlenül számít
        const reverse = p.tipus === 'hazastars' ? edgeByKey.get(`${p.id2}|${p.id1}|hazastars`) ?? [] : []
        return [...direct, ...reverse]
      }

      const toInsert: Record<string, unknown>[] = []
      const toReopen: number[] = []
      const seenBatch = new Set<string>()
      for (const p of kinshipPairs) {
        const key = `${p.id1}|${p.id2}|${p.tipus}`
        const revKey = p.tipus === 'hazastars' ? `${p.id2}|${p.id1}|${p.tipus}` : null
        // batch-en belüli dupla (pl. dupla gyerek-sor) csak egyszer
        if (seenBatch.has(key) || (revKey && seenBatch.has(revKey))) continue
        seenBatch.add(key)
        const rows = lookupRows(p)
        if (rows.some((r) => r.ervenyes_ig === null)) continue // van aktív él
        const reopenable = rows.find((r) => r.ervenyes_ig !== null && KINSHIP_SYNC_MARKERS.includes(r.megjegyzes ?? ''))
        if (reopenable) {
          toReopen.push(reopenable.id)
          continue
        }
        if (rows.length > 0) continue // más okból lezárt él — nem támasztjuk fel
        toInsert.push({
          id_szemely_1: p.id1,
          id_szemely_2: p.id2,
          tipus: p.tipus,
          ver_szerinti: p.ver,
          congregation_id: congregationId,
          megjegyzes: 'haztartas-sync',
        })
      }
      if (toReopen.length > 0) {
        must(await supabase
          .from('szemely_kapcsolat')
          .update({ ervenyes_ig: null, megjegyzes: 'haztartas-sync' })
          .in('id', toReopen), 'szemely_kapcsolat-ujranyitas')
      }
      if (toInsert.length > 0) {
        must(await supabase.from('szemely_kapcsolat').insert(toInsert), 'szemely_kapcsolat-insert')
      }
    }
  } catch (e) {
    console.warn('[syncHouseholdFromCsalad] rokonsági élek frissítése sikertelen (nem blokkoló):',
      e instanceof Error ? e.message : e)
  }
}

/** A sync/család-szerkesztés által írt/zárt rokonsági élek megjegyzés-jelölői */
const KINSHIP_SYNC_MARKERS = ['haztartas-sync', 'sync_households_from_csalad', 'csalad-szerkesztes-eltavolitas']

/**
 * A CSALÁD-SZERKESZTÉSSEL eltávolított tagok SYNC-EREDETŰ rokonsági éleinek
 * lezárása (2026-08-02, PR-20 — „a családfa kövesse a szerkesztést").
 * CSAK a haztartas-sync eredetű éleket zárja — a kereszteléskor / szülő-
 * választással rögzített vér szerinti kapcsolat érintetlen marad. Az
 * Áthelyezés útvonal szándékosan NEM hívja (ott a rokonság megmarad).
 * A lezárt él megjegyzése 'csalad-szerkesztes-eltavolitas' lesz — így ha a
 * tagot később visszateszik a családba, a sync újranyitja.
 */
export async function closeSyncKinshipEdges(
  supabase: Db,
  pairs: Array<{ id1: number; id2: number; tipus: 'szulo_gyermek' | 'hazastars' }>,
) {
  if (pairs.length === 0) return
  const ids = [...new Set(pairs.flatMap((p) => [p.id1, p.id2]))]
  const { data, error } = await supabase
    .from('szemely_kapcsolat')
    .select('id, id_szemely_1, id_szemely_2, tipus, megjegyzes')
    .in('id_szemely_1', ids)
    .is('ervenyes_ig', null)
  if (error) throw new Error(`szemely_kapcsolat-olvasas: ${error.message}`)
  const wanted = new Set(pairs.flatMap((p) =>
    p.tipus === 'hazastars'
      ? [`${p.id1}|${p.id2}|hazastars`, `${p.id2}|${p.id1}|hazastars`]
      : [`${p.id1}|${p.id2}|${p.tipus}`],
  ))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toClose = ((data || []) as any[])
    .filter((r) => wanted.has(`${r.id_szemely_1}|${r.id_szemely_2}|${r.tipus}`)
      && KINSHIP_SYNC_MARKERS.includes((r.megjegyzes as string | null) ?? ''))
    .map((r) => r.id as number)
  if (toClose.length > 0) {
    const { error: closeError } = await supabase
      .from('szemely_kapcsolat')
      .update({ ervenyes_ig: new Date().toISOString().slice(0, 10), megjegyzes: 'csalad-szerkesztes-eltavolitas' })
      .in('id', toClose)
    if (closeError) throw new Error(`szemely_kapcsolat-lezaras: ${closeError.message}`)
  }
}

export async function loadFamilyDisplayNames(supabase: Db, familyIds: number[]): Promise<Map<number, string>> {
  const names = new Map<number, string>()
  if (familyIds.length === 0) return names
  const { data } = await supabase
    .from('csalad')
    .select('id, ferfi:szemely!id_ferfi(csaladnev), no:szemely!id_no(csaladnev)')
    .in('id', familyIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data || []) as any[]) {
    const pick = (v: { csaladnev?: string | null } | Array<{ csaladnev?: string | null }> | null) =>
      (Array.isArray(v) ? v[0]?.csaladnev : v?.csaladnev)?.trim() || null
    const surnames = [...new Set([pick(row.ferfi), pick(row.no)].filter(Boolean))] as string[]
    names.set(row.id as number, surnames.length > 0 ? `${surnames.join('–')} család` : `Család #${row.id}`)
  }
  return names
}

/**
 * Több személy AKTÍV családtagságai egy menetben (mindkét szerep). A kulcs a
 * személy-id; az érték az összes aktív családja (jó esetben 0 vagy 1 elem).
 * NEM gyülekezet-szűrt — a hívó a MembershipConflicts.allowed halmazzal metsz.
 *
 * throwOnError: őr-bemenetként az elnyelt hiba üres tagság-térképet adna
 * (= nincs ütközés), amivel a dupla-tagsági őr némán kikapcsolna.
 */
export async function loadFamilyMemberships(
  supabase: Db,
  personIds: number[],
  opts?: { throwOnError?: boolean },
): Promise<Map<number, FamilyMembershipInfo[]>> {
  const result = new Map<number, FamilyMembershipInfo[]>()
  if (personIds.length === 0) return result

  const [adultRes, childRes] = await Promise.all([
    supabase
      .from('csalad')
      .select('id, id_ferfi, id_no')
      .eq('isaktiv', true)
      .or(`id_ferfi.in.(${personIds.join(',')}),id_no.in.(${personIds.join(',')})`),
    supabase
      .from('gyerek')
      .select('id_csalad, id_szemely, csalad:csalad!id_csalad(id, isaktiv)')
      .in('id_szemely', personIds),
  ])
  if (opts?.throwOnError) {
    if (adultRes.error) throw new Error(`csalad-olvasas: ${adultRes.error.message}`)
    if (childRes.error) throw new Error(`gyerek-olvasas: ${childRes.error.message}`)
  }

  const entries: Array<{ personId: number; familyId: number; role: 'felnott' | 'gyermek' }> = []
  const personIdSet = new Set(personIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const fam of (adultRes.data || []) as any[]) {
    if (fam.id_ferfi != null && personIdSet.has(fam.id_ferfi)) entries.push({ personId: fam.id_ferfi, familyId: fam.id, role: 'felnott' })
    if (fam.id_no != null && personIdSet.has(fam.id_no)) entries.push({ personId: fam.id_no, familyId: fam.id, role: 'felnott' })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (childRes.data || []) as any[]) {
    const csalad = Array.isArray(row.csalad) ? row.csalad[0] : row.csalad
    if (!csalad?.isaktiv) continue
    entries.push({ personId: row.id_szemely as number, familyId: csalad.id as number, role: 'gyermek' })
  }

  const familyNames = await loadFamilyDisplayNames(supabase, [...new Set(entries.map((e) => e.familyId))])
  for (const e of entries) {
    const list = result.get(e.personId) ?? []
    // Ugyanaz a (család, szerep) páros csak egyszer (a gyerek táblában lehet dupla sor)
    if (!list.some((m) => m.familyId === e.familyId && m.role === e.role)) {
      list.push({ familyId: e.familyId, role: e.role, familyName: familyNames.get(e.familyId) ?? `Család #${e.familyId}` })
    }
    result.set(e.personId, list)
  }
  return result
}

/**
 * Dupla-tagsági ellenőrzés egy kiválasztott tag-halmazra, gyülekezet-hatókörrel:
 *  - blocked: felnőttként MÁSIK saját aktív családban (kemény tiltás),
 *  - movable: gyermekként MÁSIK saját családban (megerősítéssel áthelyezhető),
 *  - foreign: másik GYÜLEKEZET családjában maradt tagság (csak figyelmeztetés,
 *    sosem blokkolunk és sosem mutáljuk — pl. egyháztag-átadás maradványa).
 *
 * „Saját" család = van saját-gyülekezeti haztartas-sora (allowed), VAGY
 * valamelyik felnőtt tagja a saját gyülekezet tagja — utóbbi fogja meg a
 * korábban automatikusan (haztartas nélkül) létrejött saját családokat is.
 *
 * OLVASÁSI HIBÁNÁL DOB (fail-closed) — a hívó felelőssége barátságos hibává
 * alakítani; elnyelt hibával az őr némán kikapcsolna (üres allowed → minden
 * „idegen" → tiltás megkerülve, régi tagság lezáratlanul).
 */
export async function findMembershipConflicts(
  supabase: Db,
  congregationId: string,
  personIds: number[],
  targetFamilyId: number | null,
): Promise<MembershipConflicts> {
  const blocked: AssignConflict[] = []
  const movable: AssignConflict[] = []
  const foreign: AssignConflict[] = []
  const allowed = await getAllowedFamilyIds(supabase, congregationId, { throwOnError: true })
  if (personIds.length === 0) return { blocked, movable, foreign, allowed }

  const memberships = await loadFamilyMemberships(supabase, personIds, { throwOnError: true })

  const { data: personsRaw, error: personsError } = await supabase
    .from('szemely')
    .select('id, csaladnev, k_nev')
    .in('id', personIds)
  if (personsError) throw new Error(`szemely-olvasas: ${personsError.message}`)
  const nameById = new Map<number, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((personsRaw || []) as any[]).map((p) => [p.id, `${p.csaladnev ?? ''} ${p.k_nev ?? ''}`.trim() || `#${p.id}`]),
  )

  // Saját-ság kiegészítés: az allowed-ból kimaradó érintett családok közül az
  // is sajátnak számít, amelynek valamelyik felnőttje a saját gyülekezet tagja
  // (haztartas-sor nélküli, régebben auto-létrejött családok).
  const candidateIds = [...new Set(
    [...memberships.values()].flat()
      .map((m) => m.familyId)
      .filter((id) => id !== targetFamilyId && !allowed.has(id)),
  )]
  if (candidateIds.length > 0) {
    const { data: famRows, error: famError } = await supabase
      .from('csalad')
      .select('id, ferfi:szemely!id_ferfi(congregation_id), no:szemely!id_no(congregation_id)')
      .in('id', candidateIds)
    if (famError) throw new Error(`csalad-tulajdon-olvasas: ${famError.message}`)
    const congOf = (v: { congregation_id?: string | null } | Array<{ congregation_id?: string | null }> | null) =>
      Array.isArray(v) ? v[0]?.congregation_id ?? null : v?.congregation_id ?? null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (famRows || []) as any[]) {
      if (congOf(row.ferfi) === congregationId || congOf(row.no) === congregationId) {
        allowed.add(row.id as number)
      }
    }
  }

  for (const personId of personIds) {
    for (const m of memberships.get(personId) ?? []) {
      if (targetFamilyId != null && m.familyId === targetFamilyId) continue
      const conflict: AssignConflict = {
        personId,
        personName: nameById.get(personId) ?? `#${personId}`,
        familyId: m.familyId,
        familyName: m.familyName,
        role: m.role,
      }
      if (!allowed.has(m.familyId)) foreign.push(conflict)
      else if (m.role === 'felnott') blocked.push(conflict)
      else movable.push(conflict)
    }
  }
  return { blocked, movable, foreign, allowed }
}

/**
 * Gyermek-tagságok áthelyezése: törli a személy gyerek-sorait a megadott
 * MÁSIK családokból, és az érintett családok háztartását újraszinkronizálja
 * (így a régi haztartas_tag is lezárul). CSAK a saját gyülekezet (allowed)
 * családjaihoz nyúl — idegen gyülekezet családját sosem mutáljuk.
 */
export async function moveChildMemberships(
  supabase: Db,
  congregationId: string,
  moves: AssignConflict[],
  allowed: Set<number>,
) {
  const byFamily = new Map<number, number[]>()
  for (const m of moves) {
    if (!allowed.has(m.familyId)) continue // idegen gyülekezet — nem nyúlunk hozzá
    const list = byFamily.get(m.familyId) ?? []
    list.push(m.personId)
    byFamily.set(m.familyId, list)
  }
  for (const [familyId, personIds] of byFamily) {
    const { error } = await supabase
      .from('gyerek')
      .delete()
      .eq('id_csalad', familyId)
      .in('id_szemely', personIds)
    if (error) throw new Error(`A(z) #${familyId} család gyermek-sorának törlése nem sikerült: ${error.message}`)
    await syncHouseholdFromCsalad(supabase, familyId, congregationId, personIds)
  }
}

/**
 * Idegen-gyülekezeti (foreign) tagsághoz tartozó, felhasználónak szóló
 * figyelmeztető mondat — közös szöveg a hívóknak.
 */
export function foreignMembershipWarning(foreign: AssignConflict[]): string | undefined {
  if (foreign.length === 0) return undefined
  const names = [...new Set(foreign.map((f) => f.personName))].join(', ')
  return `Megjegyzés: ${names} egy másik gyülekezet családnyilvántartásában is szerepel még (pl. átjelentkezés maradványa) — ezt rendszergazdai rendezés tudja lezárni.`
}
