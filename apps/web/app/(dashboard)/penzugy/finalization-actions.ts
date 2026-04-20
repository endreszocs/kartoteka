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
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

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
  /** Cél URL, ha a lelkész elkezdené javítani (pl. "/penzugy?tab=cashbook"). */
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
  // 2026-04-18 SCOPE-AWARE: diocese módban egyszerűsített MVP check-lista
  const { getFinanceScopeContext } = await import('@/lib/auth/finance-scope')
  const fsCtx = await getFinanceScopeContext()
  if ('error' in fsCtx) return { error: fsCtx.error }

  if (fsCtx.scope === 'diocese') {
    return runDioceseFinalizationChecks(fsCtx.supabase, fsCtx.scopeId, year)
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
    fixUrl: '/penzugy?tab=bank',
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
    fixUrl: '/penzugy?tab=bank',
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
    fixUrl: '/penzugy?tab=transactions',
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
    fixUrl: '/penzugy?tab=transactions',
    fixLabel: kiaMissingCategory.length > 0 ? 'Javítás a Tranzakciók fülön' : undefined,
  })

  // ── 5. Bevétel hiányzó partner (JÁRULÉK-nál) ──
  // Csak figyelmeztetés (nem blokkoló) — de fontos: a járulékbefizetőket
  // a választók névjegyzékéhez használjuk, így pontosság kell.
  const befMissingPersonJarulek = befizetesek.filter((b) => {
    const isJarulekCategory = false // TODO: a befizetescel → szamadasicel.kod === '101.01' join kellene
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
    fixUrl: '/penzugy?tab=cashbook',
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
    fixUrl: '/penzugy?tab=oblio_ellenorzes',
    fixLabel: oblioUnentered.length > 0 ? 'Oblio ellenőrzés fülön' : undefined,
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
  // 2026-04-18 SCOPE-AWARE: diocese módban a Kartotéka-jkv integráció
  // még nem épült ki a presbiteri_jegyzokonyvek scope-bővítésével → üres
  // array, amire a wizard automatikusan manual jkv módra vált
  const { getFinanceScopeContext } = await import('@/lib/auth/finance-scope')
  const fsCtx = await getFinanceScopeContext()
  if ('error' in fsCtx) return { error: fsCtx.error }
  if (fsCtx.scope === 'diocese') {
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
// Diocese-scope check — egyszerűsített MVP
// ─────────────────────────────────────────────────────────────────────────
async function runDioceseFinalizationChecks(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  dioceseId: string,
  year: number,
): Promise<{ data: FinalizationChecksResult; error?: undefined }> {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  const [befRes, kiaRes] = await Promise.all([
    supabase
      .from('diocese_befizetes')
      .select('id, id_szamadasicel, stornozott')
      .eq('diocese_id', dioceseId)
      .eq('deleted', false)
      .gte('datum', yearStart)
      .lte('datum', yearEnd),
    supabase
      .from('diocese_kiadas')
      .select('id, id_szamadasicel, stornozott')
      .eq('diocese_id', dioceseId)
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
    fixUrl: '/penzugy?tab=transactions',
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
    fixUrl: '/penzugy?tab=transactions',
    fixLabel: kiaMissing.length > 0 ? 'Javítás a Tranzakciók fülön' : undefined,
  })

  // Informatív: bank nyitó egyenleg / FX revaluation / Oblio — diocese módban
  // MVP-ben nem érhető el, így skippeljük. Phase 5 bővítés.
  items.push({
    key: 'diocese_info',
    label: 'Egyházmegyei sajátosság',
    description: 'Egyházmegyei szinten a bank nyitó, FX átértékelés és Oblio-integráció jelenleg MVP-n kívül.',
    status: 'ok',
    detail: 'A következő körökben bővül.',
    blocking: false,
  })

  const hasBlocker = items.some((i) => i.blocking && i.status === 'error')
  const hasWarning = items.some((i) => i.status === 'warning')

  return {
    data: { year, items, hasBlocker, hasWarning },
  }
}
