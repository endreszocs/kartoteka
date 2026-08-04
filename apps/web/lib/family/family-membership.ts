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
 *
 * 2026-08-04 (PR-42) — AZ ELHUNYT NEM KERÜL VISSZA A HÁZTARTÁSBA. A temetés
 * lezárja a haztartas_tag sort, de a `csalad.id_ferfi`/`id_no` mezőt nem
 * takarítja (nem is teheti: a tagnyilvantartas_csalad_mentes RPC COALESCE-szal
 * őrzi a régi értéket, tehát NULL-t nem lehet vele írni). Ezért a következő
 * szinkron — bármelyik család-mentés, keresztelő vagy tag-mentés — a
 * célállapotot a `csalad`-ból építve ÚJRA felvette az elhunytat élő
 * háztartás-tagként. Mostantól a célállapotból kimaradnak az elhunytak, sőt a
 * náluk nyitva maradt tagság is lezárul. A VÉR SZERINTI szülő-gyermek élek
 * ÉRINTETLENEK — az elhunyt szülőnek látszania kell a családfán.
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

  // 1/b. ELHUNYTAK (2026-08-04, PR-42) — lásd a fájl fejlécét. Az elhunyt
  // személy a `csalad` kartonján továbbra is ott marad (a történeti adat nem
  // vész el), de ÉLŐ háztartás-tagként nem szerepelhet.
  //
  // FAIL-CLOSED a mai működés felé: ha a lekérdezés hibára fut (vagy egy sor
  // RLS-rejtett), NEM szűrünk — inkább maradjon a korábbi viselkedés, mint
  // hogy egy olvasási hiba miatt élő tagok tűnjenek el a háztartásból. A hibát
  // viszont naplózzuk.
  const eloJeloltek = [
    ...(csaladRow.id_ferfi ? [csaladRow.id_ferfi as number] : []),
    ...(csaladRow.id_no ? [csaladRow.id_no as number] : []),
    ...gyerekIds,
  ]
  const elhunytak = new Set<number>()
  if (eloJeloltek.length > 0) {
    const { data: eletRows, error: eletErr } = await supabase
      .from('szemely')
      .select('id, meghalt, member_status')
      .in('id', [...new Set(eloJeloltek)])
    if (eletErr) {
      console.warn('[syncHouseholdFromCsalad] az elhunyt-állapot nem olvasható, ezért nem szűrünk (a régi viselkedés marad):',
        eletErr.message)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (eletRows || []) as any[]) {
        if (p.meghalt === true || p.member_status === 'elhunyt') elhunytak.add(p.id as number)
      }
    }
  }
  const elhunyt = (id: number | null | undefined) => id != null && elhunytak.has(id)

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

  // Célállapot: 1 csaladfo (id_ferfi), 1 hazastars (id_no), n gyermek —
  // ELHUNYT nélkül (PR-42). Aki elhunyt, annak a nyitva maradt tagsága a 3a.
  // lépésben le is zárul (a temetés utáni „visszakerülés" így megszűnik).
  const desiredTags = new Map<number, string>()
  if (csaladRow.id_ferfi && !elhunyt(csaladRow.id_ferfi)) desiredTags.set(csaladRow.id_ferfi as number, 'csaladfo')
  if (csaladRow.id_no && !elhunyt(csaladRow.id_no)) desiredTags.set(csaladRow.id_no as number, 'hazastars')
  for (const gyerekId of gyerekIds) {
    if (!elhunyt(gyerekId)) desiredTags.set(gyerekId, 'gyermek')
  }
  // Ha a családfő elhunyt, a háztartás elsődleges tagja az özvegy legyen
  const eloCsaladfo = !!csaladRow.id_ferfi && !elhunyt(csaladRow.id_ferfi)

  const today = new Date().toISOString().slice(0, 10)
  const removedSet = new Set(removedPersonIds)

  // 3a. Lezárjuk a már nem szereplő tagokat
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const tag of (existingTags || []) as any[]) {
    const desiredSzerep = desiredTags.get(tag.id_szemely as number)
    if (!desiredSzerep) {
      // Unoka-tagot csak explicit eltávolításnál zárunk le — a gyerek-sor
      // nélküli (adatjavításból származó) unoka-tagságot a sync nem birtokolja.
      // Kivétel (PR-42): az ELHUNYT tagsága szerep-től függetlenül lezárul.
      if (tag.szerep === 'unoka'
        && !removedSet.has(tag.id_szemely as number)
        && !elhunyt(tag.id_szemely as number)) continue
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
    is_primary: szerep === 'csaladfo' || (szerep === 'hazastars' && !eloCsaladfo),
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
    // 2026-08-04 (PR-42): elhunyt félhez NEM nyitunk ÚJ, aktív párkapcsolati
    // élt — a haláleset lezárja a házastársi/élettársi kapcsolatot, ezért egy
    // frissen beszúrt aktív él fantom párt mutatna a családfán. A VÉR SZERINTI
    // szülő-gyermek él ellenben az elhunytnál is rögzül (lentebb): a családfán
    // az elhunyt szülőnek látszania kell.
    if (csaladRow.id_ferfi && csaladRow.id_no && csaladRow.id_ferfi !== csaladRow.id_no
      && !elhunyt(csaladRow.id_ferfi) && !elhunyt(csaladRow.id_no)) {
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
        .or(`id_szemely_1.in.(${ids.join(',')}),id_szemely_2.in.(${ids.join(',')})`),
        'szemely_kapcsolat-olvasas')
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
        // A pár-él iránytól függetlenül számít, ÉS a két párkapcsolat-típus
        // (házastárs / élettárs — PR-27) egymást kizárja: ha a lelkész
        // élettársira állította, a szinkron NE írjon mellé házastársi élt.
        if (p.tipus !== 'hazastars') return direct
        return [
          ...direct,
          ...(edgeByKey.get(`${p.id2}|${p.id1}|hazastars`) ?? []),
          ...(edgeByKey.get(`${p.id1}|${p.id2}|elettars`) ?? []),
          ...(edgeByKey.get(`${p.id2}|${p.id1}|elettars`) ?? []),
        ]
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
        // CSAK a család-szerkesztéses eltávolítás zárása nyitható újra — a
        // 'haztartas-sync' megjegyzésű, de LEZÁRT él tipikusan HALÁLESETTEL
        // záródott (a lezárás csak az ervenyes_ig-et állítja), azt feltámasztani
        // tilos (review D1).
        const reopenable = rows.find((r) => r.ervenyes_ig !== null && r.megjegyzes === 'csalad-szerkesztes-eltavolitas')
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

    // 5. EGYEZTETŐ (PR-21): az érintett személyek MÁSHOL lévő, tagság-eredetű,
    // már nem igazolt élei is záruljanak — így a javítás akkor is átvezetődik,
    // ha a másik család oldaláról (vagy régi backfill-élből) maradt szemét.
    const affected = [
      ...(csaladRow.id_ferfi ? [csaladRow.id_ferfi as number] : []),
      ...(csaladRow.id_no ? [csaladRow.id_no as number] : []),
      ...gyerekIds,
    ]
    await reconcileKinshipForPersons(supabase, congregationId, affected)
  } catch (e) {
    console.warn('[syncHouseholdFromCsalad] rokonsági élek frissítése sikertelen (nem blokkoló):',
      e instanceof Error ? e.message : e)
  }
}

/**
 * A TAGSÁG-EREDETŰ (csalad/gyerek-ből származtatott) rokonsági élek
 * megjegyzés-jelölői — ezeket a család-szerkesztés zárhatja/rendezheti.
 * 2026-08-02 (PR-21): a 'fazis1-backfill' is ide tartozik — a júniusi
 * egyszeri átvezetés élei ugyanúgy a csalad-állapotból származnak, kihagyásuk
 * miatt a családkártya-javítás nem zárta a régi (rossz) házastárs-élt.
 * A NULL megjegyzésű él (házassági anyakönyv / keresztelés / CNP-szülő) a
 * felhasználó által állított VÉR SZERINTI igazság — azt SOSEM zárjuk innen.
 */
const KINSHIP_SYNC_MARKERS = ['haztartas-sync', 'sync_households_from_csalad', 'fazis1-backfill', 'csalad-szerkesztes-eltavolitas']

/** A tagság-eredetű, még AKTÍV élek jelölői (a lezárás-jelölő nélkül).
 *  Exportált: a családfa kereszthiba-üzenetei az él eredete szerint adnak
 *  eltérő javítási tanácsot. */
export const MEMBERSHIP_DERIVED_MARKERS = ['haztartas-sync', 'sync_households_from_csalad', 'fazis1-backfill']

/**
 * TARTÓS él-jelölő (2026-08-03, PR-22): a személyi karton apja-/anyja-neve
 * mezője igazolja a szülő-gyerek élt. NEM tagság-eredetű — a családkartonról
 * való kivétel (felnőtt gyermek kiköltözése) és az egyeztető NEM zárja le;
 * a vér szerinti kapcsolat a háztartás-tagságtól függetlenül megmarad.
 */
export const PARENT_NAME_MATCH_MARKER = 'szulonev-egyezes'

/** Név-kulcs a szülőnév-egyeztetéshez: NFC-normalizálás, kisbetű, román
 *  cedilla→vessző-ékezet (ş→ș, ţ→ț), LÁNCOLT nemzedék-előtagok (ifj./id./
 *  idősb/özv./dr., ponttal vagy szóközzel) levágva, minden nem betű/szám
 *  (szóköz, kötőjel, pont) kidobva — így az „ifj. Szőcs Gábor" ⇄ „Szőcs
 *  Gábor" és a kötőjel-variánsok egyeznek, az „Ida …" kezdetű valódi név nem
 *  sérül (az előtag után kötelező a pont vagy szóköz). */
function parentNameKey(raw: string | null | undefined): string {
  const lowered = (raw ?? '').normalize('NFC').toLowerCase().replace(/ş/g, 'ș').replace(/ţ/g, 'ț').trim()
  const noPrefix = lowered.replace(/^(?:(?:ifjabb|ifj|idősb|idős|idos|id|özv|ozv|dr)(?:\.\s*|\s+))+/, '')
  return noPrefix.replace(/[^a-z0-9áéíóöőúüűâîășț]+/g, '')
}

/**
 * SZÜLŐNÉV-KORROBORÁCIÓ (2026-08-03, PR-22): a lezárásra jelölt élek közül a
 * szulo_gyermek típusúakat kettéválasztja — ha a GYERMEK személyi kartonján az
 * apja-/anyja-neve mező (nem-helyes oldalon) név szerint igazolja a szülőt, az
 * él NEM zárandó, hanem tartós 'szulonev-egyezes' jelölést kap. Így a felnőtt,
 * saját családot alapító gyermek szülő-kapcsolata nem vész el a családkarton
 * frissítésekor.
 *
 * Review-erősítések (2026-08-03):
 *  - KÉT-ÉDESAPA-ŐR: ha a gyermeknek MÁSIK aktív, azonos nemű szülő-éle van
 *    (pl. azonos nevű nagyapa-él a valódi apa-él mellett), NEM tartjuk meg —
 *    zárás (újranyitható), a backfill-SQL őrének tükre.
 *  - KOR-ÉSSZERŰSÉG: ha mindkét születési dátum megvan, a szülő 15–70 évvel
 *    idősebb kell legyen; hiányzó dátumnál nem zárunk emiatt.
 *  - ANYA-ÁG: a leánykori név (szcs_nev) IS elfogadott kulcs, és mindkét
 *    névsorrend (családnév+keresztnév / fordítva) egyezhet.
 *  - RLS-rejtett személy-sor: az egyeztetőből hívva NEM zárunk (fail-closed,
 *    szimmetria a láthatósági őrökkel); explicit család-szerkesztéses
 *    eltávolításnál (closeOnUnreadable) marad a PR-21-es zárás.
 * Hibánál DOB (a hívó kezeli).
 */
async function partitionParentEdgeClosures(
  supabase: Db,
  rows: Array<{ id: number | string; id_szemely_1: number; id_szemely_2: number; tipus: string }>,
  opts?: { closeOnUnreadable?: boolean },
): Promise<{ retagIds: Array<number | string>; closeIds: Array<number | string> }> {
  const retagIds: Array<number | string> = []
  const closeIds: Array<number | string> = []
  const pcRows = rows.filter((r) => r.tipus === 'szulo_gyermek')
  for (const r of rows) if (r.tipus !== 'szulo_gyermek') closeIds.push(r.id)
  if (pcRows.length === 0) return { retagIds, closeIds }

  // A gyermekek ÖSSZES aktív szülő-éle a két-édesapa-őrhöz
  const childIds = [...new Set(pcRows.map((r) => r.id_szemely_2))]
  const { data: coParentData, error: coErr } = await supabase
    .from('szemely_kapcsolat')
    .select('id_szemely_1, id_szemely_2')
    .eq('tipus', 'szulo_gyermek')
    .in('id_szemely_2', childIds)
    .is('ervenyes_ig', null)
  if (coErr) throw new Error(`szemely_kapcsolat-tars-szulo-olvasas: ${coErr.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coParentEdges = (coParentData || []) as any[]

  const personIds = [...new Set([
    ...pcRows.flatMap((r) => [r.id_szemely_1, r.id_szemely_2]),
    ...coParentEdges.map((e) => e.id_szemely_1 as number),
  ])]
  const { data, error } = await supabase
    .from('szemely')
    .select('id, csaladnev, k_nev, szcs_nev, ferfi, sz_datum, apjaneve, anyjaneve')
    .in('id', personIds)
  if (error) throw new Error(`szemely-olvasas (szulonev-korroboracio): ${error.message}`)
  interface PersonRow { id: number; csaladnev: string | null; k_nev: string | null; szcs_nev: string | null; ferfi: boolean | null; sz_datum: string | null; apjaneve: string | null; anyjaneve: string | null }
  const byId = new Map<number, PersonRow>(((data || []) as PersonRow[]).map((p) => [p.id, p]))

  for (const r of pcRows) {
    const parent = byId.get(r.id_szemely_1)
    const child = byId.get(r.id_szemely_2)
    if (!parent || !child) {
      if (opts?.closeOnUnreadable) closeIds.push(r.id)
      continue
    }

    const keys = new Set<string>([
      parentNameKey(`${parent.csaladnev ?? ''} ${parent.k_nev ?? ''}`),
      parentNameKey(`${parent.k_nev ?? ''} ${parent.csaladnev ?? ''}`),
    ])
    if (parent.ferfi === false && (parent.szcs_nev ?? '').trim()) {
      keys.add(parentNameKey(`${parent.szcs_nev} ${parent.k_nev ?? ''}`))
      keys.add(parentNameKey(`${parent.k_nev ?? ''} ${parent.szcs_nev}`))
    }
    keys.delete('')
    const asserted = parent.ferfi === true ? child.apjaneve : parent.ferfi === false ? child.anyjaneve : null
    const aKey = asserted ? parentNameKey(asserted) : ''
    let corroborated = !!aKey && keys.has(aKey)

    if (corroborated && parent.sz_datum && child.sz_datum) {
      const diff = Number(child.sz_datum.slice(0, 4)) - Number(parent.sz_datum.slice(0, 4))
      if (!(diff >= 15 && diff <= 70)) corroborated = false
    }

    if (corroborated) {
      const otherSameSexParent = coParentEdges.some((e) =>
        e.id_szemely_2 === r.id_szemely_2
        && e.id_szemely_1 !== r.id_szemely_1
        && byId.get(e.id_szemely_1 as number)?.ferfi === parent.ferfi)
      if (otherSameSexParent) corroborated = false
    }

    ;(corroborated ? retagIds : closeIds).push(r.id)
  }
  return { retagIds, closeIds }
}

/**
 * ROKONSÁGI EGYEZTETŐ (2026-08-02, PR-21) — „minden érintett helyen".
 *
 * A megadott személyek ÖSSZES aktív, TAGSÁG-EREDETŰ (haztartas-sync /
 * sync_households_from_csalad / fazis1-backfill) házastárs- és szülő-gyerek
 * élét összeveti a JELENLEGI csalad/gyerek állapottal, és a már nem igazolt
 * éleket lezárja — akkor is, ha az él egy MÁSIK család korábbi állapotából
 * származik. Ez szünteti meg az aszimmetriát: akárMELYIK oldalról történik a
 * javítás (A-család szerkesztése, B-hez hozzáadás, anyakönyv), az érintett
 * személyek elavult élei rendeződnek.
 *
 * A NULL megjegyzésű él (anyakönyv/keresztelés/CNP) SOSEM záródik itt — az a
 * felhasználó által állított vér szerinti igazság.
 *
 * Visszatérés: a lezárt élek száma. OLVASÁSI/ÍRÁSI HIBÁNÁL DOB — a hívó
 * best-effort try/catch-ben futtatja.
 */
export async function reconcileKinshipForPersons(
  supabase: Db,
  congregationId: string,
  personIds: number[],
): Promise<number> {
  const ids = [...new Set(personIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (ids.length === 0) return 0

  interface EdgeRow { id: string; id_szemely_1: number; id_szemely_2: number; tipus: string; megjegyzes: string | null }
  // 2026-08-02 (review-fix): tenant-szűrt olvasás — globális szerepkörrel se
  // olvassunk/zárjunk MÁS gyülekezet éleit.
  const [res1, res2] = await Promise.all([
    supabase
      .from('szemely_kapcsolat')
      .select('id, id_szemely_1, id_szemely_2, tipus, megjegyzes')
      .eq('congregation_id', congregationId)
      .in('id_szemely_1', ids)
      .in('tipus', ['hazastars', 'elettars', 'szulo_gyermek'])
      .is('ervenyes_ig', null),
    supabase
      .from('szemely_kapcsolat')
      .select('id, id_szemely_1, id_szemely_2, tipus, megjegyzes')
      .eq('congregation_id', congregationId)
      .in('id_szemely_2', ids)
      .in('tipus', ['hazastars', 'elettars', 'szulo_gyermek'])
      .is('ervenyes_ig', null),
  ])
  if (res1.error) throw new Error(`szemely_kapcsolat-olvasas: ${res1.error.message}`)
  if (res2.error) throw new Error(`szemely_kapcsolat-olvasas: ${res2.error.message}`)
  const edgeById = new Map<string, EdgeRow>()
  for (const r of ([...(res1.data || []), ...(res2.data || [])] as EdgeRow[])) {
    // 2026-08-03 (PR-22 review-fix): a 'szulonev-egyezes' él is jelölt — a
    // partition ÚJRA-ellenőrzi a név-korroborációt: ha a kartonon a név még
    // igazolja, no-op retag; ha a user időközben javította a névmezőt (vagy
    // másik azonos nemű szülő-él jelent meg), az él záródik. Így a jelölés
    // nem "örök", hanem minden egyeztetésnél újraértékelődik.
    if (MEMBERSHIP_DERIVED_MARKERS.includes(r.megjegyzes ?? '')
      || (r.tipus === 'szulo_gyermek' && r.megjegyzes === PARENT_NAME_MATCH_MARKER)) edgeById.set(r.id, r)
  }
  const edges = [...edgeById.values()]
  if (edges.length === 0) return 0

  // Igazolt-e az él a JELENLEGI (aktív) csalad/gyerek állapotból?
  const allPersonIds = [...new Set(edges.flatMap((e) => [e.id_szemely_1, e.id_szemely_2]))]
  const childIds = [...new Set(edges.filter((e) => e.tipus === 'szulo_gyermek').map((e) => e.id_szemely_2))]

  const [famRes, gyRes, visRes] = await Promise.all([
    supabase
      .from('csalad')
      .select('id, id_ferfi, id_no')
      .eq('isaktiv', true)
      .or(`id_ferfi.in.(${allPersonIds.join(',')}),id_no.in.(${allPersonIds.join(',')})`),
    childIds.length > 0
      ? supabase
          .from('gyerek')
          .select('id_szemely, csalad:csalad!id_csalad(id, id_ferfi, id_no, isaktiv)')
          .in('id_szemely', childIds)
      : Promise.resolve({ data: [], error: null }),
    // 2026-08-02 (review-fix): láthatósági őr — az igazoló csalad/gyerek sor
    // RLS-rejtett lehet (pl. a szülő átjelentkezett). Csak akkor merünk zárni,
    // ha az érintett fél a SAJÁT gyülekezet olvasható tagja (fail-closed).
    supabase
      .from('szemely')
      .select('id')
      .eq('congregation_id', congregationId)
      .in('id', allPersonIds),
  ])
  if (famRes.error) throw new Error(`csalad-olvasas: ${famRes.error.message}`)
  if (gyRes.error) throw new Error(`gyerek-olvasas: ${gyRes.error.message}`)
  if (visRes.error) throw new Error(`szemely-olvasas: ${visRes.error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readableIds = new Set(((visRes.data || []) as any[]).map((r) => r.id as number))
  // Gyerek-sor RLS-rejtett csalad-embeddel → a gyermek élei "ismeretlenek"
  const unknownChildIds = new Set<number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const g of (gyRes.data || []) as any[]) {
    const cs = Array.isArray(g.csalad) ? g.csalad[0] : g.csalad
    if (!cs) unknownChildIds.add(g.id_szemely as number)
  }

  // Irány-független házaspár-kulcsok az aktív családokból
  const coupleKeys = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const f of (famRes.data || []) as any[]) {
    if (f.id_ferfi != null && f.id_no != null) {
      const [a, b] = [f.id_ferfi as number, f.id_no as number].sort((x, y) => x - y)
      coupleKeys.add(`${a}|${b}`)
    }
  }
  // Szülő→gyerek kulcsok az aktív családok gyerek-soraiból
  const parentChildKeys = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const g of (gyRes.data || []) as any[]) {
    const cs = Array.isArray(g.csalad) ? g.csalad[0] : g.csalad
    if (!cs?.isaktiv) continue
    if (cs.id_ferfi != null) parentChildKeys.add(`${cs.id_ferfi}|${g.id_szemely}`)
    if (cs.id_no != null) parentChildKeys.add(`${cs.id_no}|${g.id_szemely}`)
  }

  const closureCandidates = edges.filter((e) => {
    if (e.tipus === 'hazastars' || e.tipus === 'elettars') {
      // Láthatósági őr: legalább az egyik fél legyen olvasható saját tag
      if (!readableIds.has(e.id_szemely_1) && !readableIds.has(e.id_szemely_2)) return false
      const [a, b] = [e.id_szemely_1, e.id_szemely_2].sort((x, y) => x - y)
      return !coupleKeys.has(`${a}|${b}`)
    }
    // szulo_gyermek: a SZÜLŐ legyen olvasható saját tag, és a gyermek
    // igazolása ne legyen RLS-rejtett
    if (!readableIds.has(e.id_szemely_1)) return false
    if (unknownChildIds.has(e.id_szemely_2)) return false
    return !parentChildKeys.has(`${e.id_szemely_1}|${e.id_szemely_2}`)
  })

  // 2026-08-03 (PR-22): szülőnév-korroboráció — ha a gyermek kartonja név
  // szerint igazolja a szülőt, az él tartós jelölést kap zárás helyett
  // (a felnőtt gyermek kiköltözése nem törli a vér szerinti kapcsolatot).
  const { retagIds, closeIds } = await partitionParentEdgeClosures(supabase, closureCandidates)

  if (retagIds.length > 0) {
    const { error } = await supabase
      .from('szemely_kapcsolat')
      .update({ megjegyzes: PARENT_NAME_MATCH_MARKER })
      .eq('congregation_id', congregationId)
      .in('id', retagIds)
    if (error) throw new Error(`szemely_kapcsolat-egyezteto-atjeloles: ${error.message}`)
  }
  if (closeIds.length > 0) {
    const { error } = await supabase
      .from('szemely_kapcsolat')
      .update({ ervenyes_ig: new Date().toISOString().slice(0, 10), megjegyzes: 'csalad-szerkesztes-eltavolitas' })
      .eq('congregation_id', congregationId)
      .in('id', closeIds)
    if (error) throw new Error(`szemely_kapcsolat-egyezteto-lezaras: ${error.message}`)
  }
  return closeIds.length
}

/**
 * Egy KONKRÉT pár aktív házastárs-élének lezárása — bármilyen eredetű
 * (a NULL megjegyzésű, anyakönyvi él is), mindkét irányban. A házassági
 * anyakönyvi bejegyzés SZERKESZTÉSE/TÖRLÉSE hívja: ott maga a forrás-rekord
 * változik, tehát a belőle származó él zárása jogos (2026-08-02, PR-21).
 *
 * Review-fix (P1): a TAGSÁG-EREDETŰ élt az újranyitható
 * 'csalad-szerkesztes-eltavolitas' jelöléssel zárjuk — ha a pár családja
 * továbbra is aktív, a következő sync jogosan visszanyitja. A NULL/anyakönyvi
 * eredetű él zárása végleges (a forrás-rekord szűnt meg/változott).
 */
export async function closeMarriageEdgeBetween(supabase: Db, a: number, b: number) {
  if (!a || !b || a === b) return
  const { data, error } = await supabase
    .from('szemely_kapcsolat')
    .select('id, megjegyzes')
    .eq('tipus', 'hazastars')
    .is('ervenyes_ig', null)
    .or(`and(id_szemely_1.eq.${a},id_szemely_2.eq.${b}),and(id_szemely_1.eq.${b},id_szemely_2.eq.${a})`)
  if (error) throw new Error(`hazastars-el-olvasas: ${error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data || []) as any[]
  if (rows.length === 0) return
  const today = new Date().toISOString().slice(0, 10)
  const syncIds = rows.filter((r) => MEMBERSHIP_DERIVED_MARKERS.includes((r.megjegyzes as string | null) ?? '')).map((r) => r.id)
  const otherIds = rows.filter((r) => !MEMBERSHIP_DERIVED_MARKERS.includes((r.megjegyzes as string | null) ?? '')).map((r) => r.id)
  if (syncIds.length > 0) {
    const { error: e1 } = await supabase
      .from('szemely_kapcsolat')
      .update({ ervenyes_ig: today, megjegyzes: 'csalad-szerkesztes-eltavolitas' })
      .in('id', syncIds)
    if (e1) throw new Error(`hazastars-el-lezaras: ${e1.message}`)
  }
  if (otherIds.length > 0) {
    const { error: e2 } = await supabase
      .from('szemely_kapcsolat')
      .update({ ervenyes_ig: today })
      .in('id', otherIds)
    if (e2) throw new Error(`hazastars-el-lezaras: ${e2.message}`)
  }
}

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
  congregationId: string,
  pairs: Array<{ id1: number; id2: number; tipus: 'szulo_gyermek' | 'hazastars' }>,
) {
  if (pairs.length === 0) return
  const ids = [...new Set(pairs.flatMap((p) => [p.id1, p.id2]))]
  // 2026-08-03 (PR-22 review-fix): tenant-szűrt olvasás/írás — a reconcile-lal
  // azonos defense-in-depth (globális szerepkörrel se nyúljunk idegen élhez).
  const { data, error } = await supabase
    .from('szemely_kapcsolat')
    .select('id, id_szemely_1, id_szemely_2, tipus, megjegyzes')
    .eq('congregation_id', congregationId)
    .in('id_szemely_1', ids)
    .is('ervenyes_ig', null)
  if (error) throw new Error(`szemely_kapcsolat-olvasas: ${error.message}`)
  const wanted = new Set(pairs.flatMap((p) =>
    p.tipus === 'hazastars'
      // 2026-08-04 (PR-27): az élettársi él ugyanúgy pár-él — enélkül a
      // partner-csere után örökre aktív maradna (fantom pár a családfán)
      ? ['hazastars', 'elettars'].flatMap((t) => [`${p.id1}|${p.id2}|${t}`, `${p.id2}|${p.id1}|${t}`])
      : [`${p.id1}|${p.id2}|${p.tipus}`],
  ))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toCloseRows = ((data || []) as any[])
    .filter((r) => wanted.has(`${r.id_szemely_1}|${r.id_szemely_2}|${r.tipus}`)
      && (KINSHIP_SYNC_MARKERS.includes((r.megjegyzes as string | null) ?? '')
        || (r.tipus === 'szulo_gyermek' && r.megjegyzes === PARENT_NAME_MATCH_MARKER)))

  // 2026-08-03 (PR-22): szülőnév-korroboráció — a kartonon igazolt szülő-él
  // a családból való kivételkor sem záródik, tartós jelölést kap. Explicit
  // eltávolításnál az RLS-rejtett személy-sor zárást jelent (PR-21 viselkedés).
  const { retagIds, closeIds } = await partitionParentEdgeClosures(supabase, toCloseRows, { closeOnUnreadable: true })

  if (retagIds.length > 0) {
    const { error: retagError } = await supabase
      .from('szemely_kapcsolat')
      .update({ megjegyzes: PARENT_NAME_MATCH_MARKER })
      .eq('congregation_id', congregationId)
      .in('id', retagIds)
    if (retagError) throw new Error(`szemely_kapcsolat-atjeloles: ${retagError.message}`)
  }
  if (closeIds.length > 0) {
    const { error: closeError } = await supabase
      .from('szemely_kapcsolat')
      .update({ ervenyes_ig: new Date().toISOString().slice(0, 10), megjegyzes: 'csalad-szerkesztes-eltavolitas' })
      .eq('congregation_id', congregationId)
      .in('id', closeIds)
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
