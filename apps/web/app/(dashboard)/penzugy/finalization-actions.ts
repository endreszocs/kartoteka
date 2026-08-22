'use server'

/**
 * Számadás véglegesítő wizard szerver akciói.
 *
 * A wizard több lépésen keresztül vezeti a lelkészt:
 *   1. Áttekintés (terv vs tény)
 *   2. Automatikus ellenőrzések
 *   3. Presbiteri jegyzőkönyv csatolás (auto VAGY manuális)
 *   4. Megerősítés → véglegesítés + beküldés
 *
 * Ez az action a 2. lépéshez (ellenőrzések) és a 3. lépéshez (jkv lista) ad
 * támogatást.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2026-08-17 (KERÜLETI S5) — A HARMADIK SZINT ÉS A VÉGLEGESÍTÉS MINT JOGI AKTUS
 * ─────────────────────────────────────────────────────────────────────────────
 * A wizard két szerver-támogatója eddig `if (scope === 'diocese') { … }` +
 * utána GYÜLEKEZETI kód alakban élt. Ez a kerületnél NÉMÁN a gyülekezeti ágra
 * esett volna, és ott a legrosszabb módon: a gyülekezeti ág nem a pénzügyi
 * hatókörből, hanem az `access.effectiveCongregationId`-ból dolgozik. Egy
 * kerületi adminisztrátor tipikusan EGYÚTTAL egy gyülekezet lelkésze is, tehát
 * nem hibát kapott volna, hanem A SAJÁT GYÜLEKEZETE ellenőrzési listáját és
 * presbiteri jegyzőkönyveit — a KERÜLET számadásának véglegesítő wizardjában.
 * A lelkész a saját gyülekezete adatai alapján nyomott volna „véglegesítés"-t
 * egy egyházkerületi hivatalos számadásra. Ezért mindkét kapu mostantól a
 * GYÜLEKEZETI sajátosságot nevezi meg (`=== 'congregation'` / `!== 'congregation'`).
 *
 * A felső szintek ellenőrzés-listája KÖZÖS (`runFelsoSzintFinalizationChecks`):
 * a kerület a megyei MVP tükörképét kapja, ahogy K2 rendelkezik. A megyei ág
 * eredménye BYTE-RA változatlan (ugyanaz a két check, ugyanazok a kulcsok,
 * szövegek és `fixUrl`-ek).
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
// ⚠️ SZÁNDÉKOSAN a MAGBÓL (`finance-scope-core`), nem a gazda-modulból: a
// `getFinanceScopeContext`-et ez a fájl továbbra is DINAMIKUSAN tölti be (lásd
// lentebb), így a modul-gráf változatlan marad. A mag import-mentes, tiszta
// tábla-térkép — a statikus behúzása semmilyen server-only láncot nem hoz.
import { tablesFor, type FinanceScope } from '@/lib/auth/finance-scope-core'

// ─────────────────────────────────────────────────────────────
// 1) Ellenőrzések
// ─────────────────────────────────────────────────────────────

export type CheckStatus = 'ok' | 'warning' | 'error'

export interface CheckItem {
  key: string
  label: string
  description: string
  status: CheckStatus
  /** Részletesebb adatok a UI-hoz (pl. hány banki tranzakció hiányzik). */
  detail?: string
  /** Ha error: blokkolja a továbblépést. Ha warning: figyelmeztet de engedi tovább. */
  blocking: boolean
  /**
   * Cél URL, ha a lelkész elkezdené javítani (pl. "/penzugy#cashbook").
   *
   * 2026-08-11 (P1 #2): KÖTELEZŐEN `#hash` alakú, NEM `?tab=`. A /penzugy oldal
   * fül-váltása kizárólag az URL hash-ből dolgozik (finance-tabs.tsx
   * `applyHashToTab`, Sprint Q F1.6 óta); a régi `?tab=` paramétert SENKI nem
   * olvassa, így mind a 8 „Javítás" gomb néma zsákutca volt: a wizard bezárult,
   * az oldal viszont a Dashboard fülön maradt.
   * Érvényes értékek (finance-tabs.tsx `validTabs` + a speciális eset):
   * dashboard, cashbook, bank, transactions, budget, accounting, debt, rental,
   * sugo, admin_import, valamint `monetary` (lebegő widget). Az Oblio-cél
   * 2026-08-15 (Endre) óta MÁSIK OLDAL: `/dokumentumtar#oblio` („Számlák
   * egyeztetése" hub) — más útvonal lévén a wizard sima router.push-sal viszi.
   */
  fixUrl?: string
  fixLabel?: string
}

export interface FinalizationChecksResult {
  year: number
  items: CheckItem[]
  /** Ha van blocking error → nem mehet tovább a wizard. */
  hasBlocker: boolean
  /** Van legalább 1 warning? */
  hasWarning: boolean
}

/**
 * Lefuttatja az összes ellenőrzést az adott évre.
 */
export async function runFinalizationChecks(year: number): Promise<{
  data?: FinalizationChecksResult
  error?: string
}> {
  // 2026-04-18 SCOPE-AWARE: felső szinten egyszerűsített MVP check-lista.
  //
  // ⛔ 2026-08-17 (kerületi S5): a kapu `=== 'diocese'`-ről `!== 'congregation'`-re
  // változott. A MIÉRT a fájl fejlécében áll: a régi alakkal a KERÜLETI
  // véglegesítő wizard a lelkész SAJÁT GYÜLEKEZETE ellenőrzéseit mutatta volna
  // (az alábbi gyülekezeti ág az `effectiveCongregationId`-ból dolgozik, nem a
  // pénzügyi hatókörből) — hibaüzenet nélkül, egy jogi aktus előtt.
  // A megyei viselkedés változatlan: ugyanaz a két check ugyanazokkal a
  // kulcsokkal és szövegekkel.
  const { getFinanceScopeContext } = await import('@/lib/auth/finance-scope')
  const fsCtx = await getFinanceScopeContext()
  if ('error' in fsCtx) return { error: fsCtx.error }

  if (fsCtx.scope !== 'congregation') {
    return runFelsoSzintFinalizationChecks(fsCtx.supabase, fsCtx.scope, fsCtx.scopeId, year)
  }

  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const congregationId = access.effectiveCongregationId
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  // Párhuzamosan kérünk le minden szükséges adatot
  const [
    banksRes,
    nyitoRes,
    fxRevalRes,
    befRes,
    kiaRes,
    oblioXmlsRes,
    oblioMatchesRes,
    jarulekCellsRes,
  ] = await Promise.all([
    // Minden aktív bankszámla
    access.supabase
      .from('bankszamlak')
      .select('id, bank_neve, valuta, aktiv')
      .eq('congregation_id', congregationId)
      .eq('aktiv', true),
    // Éves nyitó egyenlegek erre az évre
    access.supabase
      .from('bankszamla_nyito_egyenleg')
      .select('bankszamla_id, eve, nyito_egyenleg_ron')
      .eq('congregation_id', congregationId)
      .eq('eve', year),
    // FX revaluation rekordok erre az évre (december 31-i)
    access.supabase
      .from('valuta_atert')
      .select('bankszamla_id, ev, arfolyam_datum')
      .eq('congregation_id', congregationId)
      .eq('ev', year)
      .eq('deleted', false),
    // Bevételek
    access.supabase
      .from('befizetes')
      .select('id, id_befizetescel, id_szemely, id_csalad, belso_mozgas_xkey, forrasa, irattipus, stornozott')
      .eq('congregation_id', congregationId)
      .eq('deleted', false)
      .gte('datum', yearStart)
      .lte('datum', yearEnd),
    // Kiadások
    access.supabase
      .from('kiadas')
      .select('id, id_kiadascel, stornozott')
      .eq('congregation_id', congregationId)
      .eq('deleted', false)
      .gte('datum', yearStart)
      .lte('datum', yearEnd),
    // Oblio beérkezett számlák (xml match rekordok)
    access.supabase
      .from('oblio_kiadas_match')
      .select('id, kiadas_id, invoice_date')
      .eq('congregation_id', congregationId)
      .gte('invoice_date', yearStart)
      .lte('invoice_date', yearEnd),
    // Oblio match-ek összesen (átfedés ellenőrzéshez)
    access.supabase
      .from('oblio_kiadas_match')
      .select('id, kiadas_id')
      .eq('congregation_id', congregationId),
    // P1-8: járulék-befizetescel (101.01 = Egyházfenntartói járulék) per-congregation
    // — a befMissingPersonJarulek check-hez kell felismerni, melyik befizetes
    // tartozik a járulék-kategóriához.
    access.supabase
      .from('befizetescel')
      .select('id')
      .eq('congregation_id', congregationId)
      .eq('id_szamadasicel', '101.01')
      .eq('aktiv', true),
  ])

  const banks = (banksRes.data || []) as Array<{ id: number; bank_neve: string; valuta: string | null }>
  const nyitok = (nyitoRes.data || []) as Array<{ bankszamla_id: number; eve: number }>
  const fxRevals = (fxRevalRes.data || []) as Array<{ bankszamla_id: number }>
  const befizetesek = (befRes.data || []) as Array<{
    id: number
    id_befizetescel: number | null
    id_szemely: number | null
    id_csalad: number | null
    belso_mozgas_xkey: string | null
    forrasa: string | null
    irattipus: string | null
    stornozott?: boolean
  }>
  const kiadasok = (kiaRes.data || []) as Array<{
    id: number
    id_kiadascel: number | null
    stornozott?: boolean
  }>
  const oblioXmls = (oblioXmlsRes.data || []) as Array<{ kiadas_id: number | null }>
  // P1-8: a 101.01-es befizetescel ID-k a gyülekezetben. Általában 1 rekord,
  // de elvileg lehet több aktív variáns is — Set-tel kezeljük.
  const jarulekBefizetescelIds = new Set<number>(
    ((jarulekCellsRes.data || []) as Array<{ id: number }>).map((r) => r.id),
  )

  const items: CheckItem[] = []

  // ── 1. Minden banki nyitó egyenleg rögzítve van az évre ──
  const banksWithoutNyito = banks.filter((b) => !nyitok.some((n) => n.bankszamla_id === b.id))
  items.push({
    key: 'bank_nyito',
    label: 'Banki nyitó egyenleg',
    description: 'Minden aktív bankszámlához rögzítve van-e a januári nyitó egyenleg?',
    status: banksWithoutNyito.length === 0 ? 'ok' : 'warning',
    detail:
      banksWithoutNyito.length === 0
        ? `Mind a ${banks.length} aktív bankszámlához van ${year} januári nyitó egyenleg.`
        : `${banksWithoutNyito.length} bankszámlán hiányzik: ${banksWithoutNyito.map((b) => b.bank_neve).join(', ')}`,
    blocking: false,
    fixUrl: '/penzugy#bank',
    fixLabel: banksWithoutNyito.length > 0 ? 'Bank fülön rögzíts nyitót' : undefined,
  })

  // ── 2. Valutás számlák december 31-i FX revaluation-je ──
  const devBanks = banks.filter((b) => b.valuta && b.valuta !== 'RON')
  const banksWithoutFx = devBanks.filter(
    (b) => !fxRevals.some((f) => f.bankszamla_id === b.id),
  )
  items.push({
    key: 'fx_revaluation',
    label: 'Valutás FX átértékelés',
    description: 'Minden valutás (EUR/HUF/...) bankszámlán megtörtént-e a december 31-i FX revaluation?',
    status: devBanks.length === 0 ? 'ok' : banksWithoutFx.length === 0 ? 'ok' : 'error',
    detail:
      devBanks.length === 0
        ? 'Nincs valutás bankszámla — FX revaluation nem releváns.'
        : banksWithoutFx.length === 0
          ? `Mind a ${devBanks.length} valutás számlán meg van az ${year}. év végi FX revaluation.`
          : `${banksWithoutFx.length} valutás bankszámlán hiányzik: ${banksWithoutFx.map((b) => `${b.bank_neve} (${b.valuta})`).join(', ')}. FONTOS: az árfolyam-nyereség/veszteség december 31-i dátummal kerül könyvelésre.`,
    blocking: banksWithoutFx.length > 0,
    fixUrl: '/penzugy#bank',
    fixLabel: banksWithoutFx.length > 0 ? 'FX átértékelés elvégzése' : undefined,
  })

  // ── 3. Hiányzó bevétel kategóriák ──
  const befMissingCategory = befizetesek.filter(
    (b) => !b.id_befizetescel && !b.belso_mozgas_xkey && !b.stornozott,
  )
  items.push({
    key: 'befizetes_category',
    label: 'Bevétel kategóriák',
    description: 'Minden bevételhez hozzá van-e rendelve költségvetési cél (jogcím)?',
    status: befMissingCategory.length === 0 ? 'ok' : 'error',
    detail:
      befMissingCategory.length === 0
        ? `Mind a ${befizetesek.length} bevételhez van kategória.`
        : `${befMissingCategory.length} bevételből hiányzik a kategória. Javítsd őket a Tranzakciók vagy Kassza/Bank fülön.`,
    blocking: befMissingCategory.length > 0,
    fixUrl: '/penzugy#transactions',
    fixLabel: befMissingCategory.length > 0 ? 'Javítás a Tranzakciók fülön' : undefined,
  })

  // ── 4. Hiányzó kiadás kategóriák ──
  const kiaMissingCategory = kiadasok.filter((k) => !k.id_kiadascel && !k.stornozott)
  items.push({
    key: 'kiadas_category',
    label: 'Kiadás kategóriák',
    description: 'Minden kiadáshoz hozzá van-e rendelve költségvetési cél?',
    status: kiaMissingCategory.length === 0 ? 'ok' : 'error',
    detail:
      kiaMissingCategory.length === 0
        ? `Mind a ${kiadasok.length} kiadáshoz van kategória.`
        : `${kiaMissingCategory.length} kiadásból hiányzik a kategória.`,
    blocking: kiaMissingCategory.length > 0,
    fixUrl: '/penzugy#transactions',
    fixLabel: kiaMissingCategory.length > 0 ? 'Javítás a Tranzakciók fülön' : undefined,
  })

  // ── 5. Bevétel hiányzó partner (JÁRULÉK-nál) ──
  // Csak figyelmeztetés (nem blokkoló) — de fontos: a járulékbefizetőket
  // a választók névjegyzékéhez használjuk, így pontosság kell.
  const befMissingPersonJarulek = befizetesek.filter((b) => {
    // P1-8: a 101.01 (Egyházfenntartói járulék) felismerése a befizetescel ID-n keresztül.
    // A jarulekBefizetescelIds halmaz a gyülekezet aktív 101.01-es befizetescel ID-jeit
    // tartalmazza (általában 1, de Set-tel többet is kezelünk).
    const isJarulekCategory =
      b.id_befizetescel !== null && jarulekBefizetescelIds.has(b.id_befizetescel)
    if (!isJarulekCategory) return false
    return !b.id_szemely && !b.id_csalad && !b.belso_mozgas_xkey
  })
  items.push({
    key: 'befizetes_person',
    label: 'Járulékbefizetők azonosítása',
    description: 'A 101.01 (Egyházfenntartói járulék) befizetéseknél van-e személy vagy család hozzárendelve?',
    status: befMissingPersonJarulek.length === 0 ? 'ok' : 'warning',
    detail:
      befMissingPersonJarulek.length === 0
        ? 'Minden járulék-befizető azonosítva van.'
        : `${befMissingPersonJarulek.length} járulék-bevételnél hiányzik a személy. Ez befolyásolhatja a választók névjegyzékét.`,
    blocking: false,
    fixUrl: '/penzugy#cashbook',
    fixLabel: befMissingPersonJarulek.length > 0 ? 'Pótlás a Kasszán' : undefined,
  })

  // ── 6. Oblio bevezetett számlák ──
  const oblioUnentered = oblioXmls.filter((x) => !x.kiadas_id)
  items.push({
    key: 'oblio_unentered',
    label: 'Oblio számlák bevezetése',
    description: 'Minden befogadott e-Factura számla bevezetve van-e a könyvelésbe?',
    status: oblioUnentered.length === 0 ? 'ok' : 'warning',
    detail:
      oblioXmls.length === 0
        ? 'Nincs befogadott Oblio számla erre az évre.'
        : oblioUnentered.length === 0
          ? `Mind a ${oblioXmls.length} Oblio számla bevezetve.`
          : `${oblioUnentered.length} / ${oblioXmls.length} Oblio számla még nincs kiadásként rögzítve.`,
    blocking: false,
    // Endre 2026-08-15: az Oblio-felület a „Számlák egyeztetése" hubra
    // költözött (/dokumentumtar, Oblio egyeztetés fül) — a javítás-gomb oda visz.
    fixUrl: '/dokumentumtar#oblio',
    fixLabel: oblioUnentered.length > 0 ? 'Számlák egyeztetése oldalon' : undefined,
  })

  const hasBlocker = items.some((i) => i.blocking && i.status === 'error')
  const hasWarning = items.some((i) => i.status === 'warning')

  return {
    data: {
      year,
      items,
      hasBlocker,
      hasWarning,
    },
  }
}

// ─────────────────────────────────────────────────────────────
// 2) Jegyzőkönyvek listázása a wizardhoz
// ─────────────────────────────────────────────────────────────

export interface JegyzokonyvForFinalization {
  id: string
  ev: number
  ules_sorszam: number
  datum: string
  hely: string | null
  allapot: string
  napirendi_pontok: Array<{
    id: string
    sorszam: number
    cim: string
  }>
  hatarozatok: Array<{
    id: string
    sorszam: number
    ev: number
    napirendi_pont_id: string | null
    szoveg: string
  }>
}

/**
 * Az adott évre és az előző év 4. negyedévére szóló presbiteri
 * jegyzőkönyvek listája — a wizard dropdown-jához.
 *
 * (Gyakran a számadást a tárgyévet KÖVETŐ év első negyedévében tárgyalják,
 * de ezt a lelkész dönti el, így nem szűrünk szigorúan.)
 */
export async function listJegyzokonyvekForFinalization(
  year: number,
): Promise<{ data?: JegyzokonyvForFinalization[]; error?: string }> {
  // 2026-04-18 SCOPE-AWARE: felső szinten a Kartotéka-jkv integráció még nem
  // épült ki a `presbiteri_jegyzokonyvek` scope-bővítésével → üres array, amire
  // a wizard automatikusan manuális jkv módra vált.
  //
  // ⛔ 2026-08-17 (kerületi S5): a kapu `=== 'diocese'`-ről `!== 'congregation'`-re
  // változott. A régi alakkal a kerületi véglegesítő wizard a lelkész SAJÁT
  // GYÜLEKEZETE presbiteri jegyzőkönyveit kínálta volna fel az EGYHÁZKERÜLET
  // számadásához csatolandó jegyzőkönyvként — vagyis a kerület hivatalos irata
  // egy gyülekezeti presbiteri határozatra hivatkozott volna. A `presbiteri_`
  // jegyzőkönyv fogalmilag is gyülekezeti testület irata; a kerületi testület
  // (közgyűlés) jegyzőkönyve KÜLÖN kör (S6/S7), addig manuális csatolás megy.
  // A megyei viselkedés változatlan (üres lista → manuális mód).
  const { getFinanceScopeContext } = await import('@/lib/auth/finance-scope')
  const fsCtx = await getFinanceScopeContext()
  if ('error' in fsCtx) return { error: fsCtx.error }
  if (fsCtx.scope !== 'congregation') {
    return { data: [] }
  }

  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  // A tárgyévre és az utána következő évre (ha a számadást márc-áprilisban tárgyalják)
  const { data: jkvs, error } = await access.supabase
    .from('presbiteri_jegyzokonyvek')
    .select('id, ev, ules_sorszam, datum, hely, allapot')
    .eq('congregation_id', access.effectiveCongregationId)
    .in('ev', [year, year + 1])
    .order('ev', { ascending: false })
    .order('datum', { ascending: false })

  if (error) return { error: error.message }
  if (!jkvs || jkvs.length === 0) return { data: [] }

  const jkvIds = jkvs.map((j) => j.id as string)

  // Napirendi pontok + határozatok lekérdezése egyszerre
  const [napRes, hatRes] = await Promise.all([
    access.supabase
      .from('jegyzokonyv_napirendi_pontok')
      .select('id, jegyzokonyv_id, sorszam, cim')
      .in('jegyzokonyv_id', jkvIds)
      .order('sorszam', { ascending: true }),
    access.supabase
      .from('jegyzokonyv_hatarozatok')
      .select('id, jegyzokonyv_id, napirendi_pont_id, sorszam, ev, szoveg')
      .in('jegyzokonyv_id', jkvIds)
      .order('sorszam', { ascending: true }),
  ])

  const napByJkv = new Map<string, Array<{ id: string; sorszam: number; cim: string }>>()
  for (const n of napRes.data || []) {
    const jid = n.jegyzokonyv_id as string
    if (!napByJkv.has(jid)) napByJkv.set(jid, [])
    napByJkv.get(jid)!.push({
      id: n.id as string,
      sorszam: n.sorszam as number,
      cim: n.cim as string,
    })
  }

  const hatByJkv = new Map<string, JegyzokonyvForFinalization['hatarozatok']>()
  for (const h of hatRes.data || []) {
    const jid = h.jegyzokonyv_id as string
    if (!hatByJkv.has(jid)) hatByJkv.set(jid, [])
    hatByJkv.get(jid)!.push({
      id: h.id as string,
      sorszam: h.sorszam as number,
      ev: h.ev as number,
      napirendi_pont_id: (h.napirendi_pont_id as string | null) ?? null,
      szoveg: h.szoveg as string,
    })
  }

  const result: JegyzokonyvForFinalization[] = jkvs.map((j) => ({
    id: j.id as string,
    ev: j.ev as number,
    ules_sorszam: j.ules_sorszam as number,
    datum: j.datum as string,
    hely: (j.hely as string | null) ?? null,
    allapot: j.allapot as string,
    napirendi_pontok: napByJkv.get(j.id as string) || [],
    hatarozatok: hatByJkv.get(j.id as string) || [],
  }))

  return { data: result }
}

// ─────────────────────────────────────────────────────────────────────────
// FELSŐ SZINTEK (egyházmegye + 2026-08-17 óta egyházkerület) — egyszerűsített
// MVP check-lista
// ─────────────────────────────────────────────────────────────────────────
/**
 * ⚠️ MIÉRT KÖZÖS FÜGGVÉNY, ÉS NEM EGY MÁSOLAT A KERÜLETNEK: a projekt visszatérő
 * hibaosztálya, hogy „a második felület a régi implementációt őrzi". Ha a
 * kerület saját másolatot kapna, a két szint ellenőrzés-listája idővel némán
 * széthúzna — és a véglegesítés JOGI AKTUS: két szint nem zárhat két különböző
 * szigorúsággal anélkül, hogy ezt valaki eldöntötte volna.
 *
 * ⚠️ A TÁBLA- ÉS OSZLOPNEVEK A `tablesFor` TÉRKÉPBŐL jönnek, nem kézzel írt
 * literálból: így ha egyszer egy negyedik szint jön, itt nincs mit módosítani,
 * és nem eshet vissza némán a gyülekezeti táblákra (a térkép exhaustive).
 *
 * ⚠️ A paraméter típusa `Exclude<FinanceScope, 'congregation'>`: a gyülekezeti
 * hatókörrel EZT A FÜGGVÉNYT MEGHÍVNI FORDÍTÁSI HIBA. A gyülekezetnek saját,
 * jóval bővebb (bank-nyitó, FX, Oblio, járulék) ellenőrzés-listája van.
 */
async function runFelsoSzintFinalizationChecks(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  scope: Exclude<FinanceScope, 'congregation'>,
  scopeId: string,
  year: number,
): Promise<{ data: FinalizationChecksResult; error?: undefined }> {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const T = tablesFor(scope)

  // A `select` oszloplistája SZÁNDÉKOSAN literál marad: mindkét felső szint
  // kategória-oszlopa `id_szamadasicel` (lásd `tablesFor` — a térkép ezt
  // állítja mindkét ágon), a postgrest-js viszont a sor típusát a select-sztring
  // LITERÁLJÁBÓL vezeti le, futásidőben összefűzött sztringtől elveszti.
  const [befRes, kiaRes] = await Promise.all([
    supabase
      .from(T.befizetes)
      .select('id, id_szamadasicel, stornozott')
      .eq(T.scopeCol, scopeId)
      .eq('deleted', false)
      .gte('datum', yearStart)
      .lte('datum', yearEnd),
    supabase
      .from(T.kiadas)
      .select('id, id_szamadasicel, stornozott')
      .eq(T.scopeCol, scopeId)
      .eq('deleted', false)
      .gte('datum', yearStart)
      .lte('datum', yearEnd),
  ])

  const befizetesek = (befRes.data || []) as Array<{ id: number; id_szamadasicel: string | null; stornozott?: boolean }>
  const kiadasok = (kiaRes.data || []) as Array<{ id: number; id_szamadasicel: string | null; stornozott?: boolean }>

  const items: CheckItem[] = []

  // Bevétel kategória ellenőrzés
  const befMissing = befizetesek.filter((b) => !b.id_szamadasicel && !b.stornozott)
  items.push({
    key: 'befizetes_category',
    label: 'Bevétel kategóriák',
    description: 'Minden bevételhez van-e kategória?',
    status: befMissing.length === 0 ? 'ok' : 'error',
    detail:
      befMissing.length === 0
        ? `Mind a ${befizetesek.length} bevételhez van kategória.`
        : `${befMissing.length} bevételből hiányzik a kategória.`,
    blocking: befMissing.length > 0,
    fixUrl: '/penzugy#transactions',
    fixLabel: befMissing.length > 0 ? 'Javítás a Tranzakciók fülön' : undefined,
  })

  // Kiadás kategória ellenőrzés
  const kiaMissing = kiadasok.filter((k) => !k.id_szamadasicel && !k.stornozott)
  items.push({
    key: 'kiadas_category',
    label: 'Kiadás kategóriák',
    description: 'Minden kiadáshoz van-e kategória?',
    status: kiaMissing.length === 0 ? 'ok' : 'error',
    detail:
      kiaMissing.length === 0
        ? `Mind a ${kiadasok.length} kiadáshoz van kategória.`
        : `${kiaMissing.length} kiadásból hiányzik a kategória.`,
    blocking: kiaMissing.length > 0,
    fixUrl: '/penzugy#transactions',
    fixLabel: kiaMissing.length > 0 ? 'Javítás a Tranzakciók fülön' : undefined,
  })

  // Informatív: bank nyitó egyenleg / FX revaluation / Oblio — felső szinten
  // MVP-ben nem érhető el, így skippeljük. Phase 5 bővítés.
  //
  // ⚠️ A KULCS ÉS A SZÖVEG SZINT-FÜGGŐ. A megyei ág (`diocese_info` +
  // „Egyházmegyei sajátosság") BETŰRE a korábbi. A kerület saját kulcsot kap:
  // a `key` a wizard React-listájának azonosítója és a jövőbeli mentett
  // ellenőrzés-naplóé is — ha a kerületi sor `diocese_info` néven futna, egy
  // kerületi számadás naplójában az állna, hogy „egyházmegyei sajátosság".
  items.push(
    scope === 'diocese'
      ? {
          key: 'diocese_info',
          label: 'Egyházmegyei sajátosság',
          description: 'Egyházmegyei szinten a bank nyitó, FX átértékelés és Oblio-integráció jelenleg MVP-n kívül.',
          status: 'ok',
          detail: 'A következő körökben bővül.',
          blocking: false,
        }
      : {
          key: 'district_info',
          label: 'Egyházkerületi sajátosság',
          description: 'Egyházkerületi szinten a bank nyitó, FX átértékelés és Oblio-integráció jelenleg MVP-n kívül.',
          status: 'ok',
          detail: 'A következő körökben bővül.',
          blocking: false,
        },
  )

  const hasBlocker = items.some((i) => i.blocking && i.status === 'error')
  const hasWarning = items.some((i) => i.status === 'warning')

  return {
    data: { year, items, hasBlocker, hasWarning },
  }
}
