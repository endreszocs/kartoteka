'use server'

import { revalidatePath } from 'next/cache'
import { baptismSchema, marriageSchema, burialSchema, movementSchema, confirmationBatchSchema, confirmationSingleSchema } from '@/lib/validations/registry'
import type { BaptismInput, MarriageInput, BurialInput, MovementInput, ConfirmationBatchInput, ConfirmationSingleInput } from '@/lib/validations/registry'
import type { RegistryEntry } from '@/lib/constants/registry'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { softDeleteRegistryWorklog, syncRegistryWorklogLink } from '@/lib/worklog/registry-sync'
import { syncHouseholdFromCsalad } from '@/lib/family/family-membership'

async function getCongregation() {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId }
}

// ── Munkanapló-szinkron segéd (2026-06-12, Endre #3-4 munkanapló) ─────
//
// A keresztelés/esketés/temetés/konfirmálás mentésekor a "Rögzítés a
// munkanaplóba" pipa hatására a munkanaplo táblába is bejegyzés kerül.
// A részletes (idempotens) logika a lib/worklog/registry-sync.ts-ben él;
// itt csak a nevek feloldása történik a beszédes címhez.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSzemelyNames(supabase: any, ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return out
  const { data } = await supabase
    .from('szemely')
    .select('id, csaladnev, k_nev')
    .in('id', unique)
  for (const row of (data || []) as { id: number; csaladnev: string | null; k_nev: string | null }[]) {
    out.set(row.id, `${row.csaladnev || ''} ${row.k_nev || ''}`.trim() || `#${row.id}`)
  }
  return out
}

// ── Adatbetöltés (fülváltáskor) ──────────────────────────────

export async function getRegistryData(tab: string): Promise<RegistryEntry[]> {
  const { supabase, congId } = await getCongregation()
  if (!congId) return []

  const dateCol = tab === 'temetes' ? 'hdatum' : (tab === 'bekoltozott' || tab === 'elkoltozott' || tab === 'attert' || tab === 'kitert') ? 'mikor' : 'datum'

  let query
  switch (tab) {
    case 'keresztseg':
      // 2026-05-30: a szemely embedded most már tartalmazza a szülő-mezőket is
      // (apjaneve, anyjaneve, id_apja, id_anyja, vallas, szcs_nev) — különben
      // a Részletek dialog és a BaptismDialog szerkesztés mód üresen mutatja
      // ezeket még akkor is, ha a DB-ben mentve vannak.
      query = supabase.from('keresztseg').select('*, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum, apjaneve, anyjaneve, id_apja, id_anyja, vallas, szcs_nev), adrlocality!helyid(name)')
      break
    case 'konfirmalas':
      query = supabase.from('konfirmalas').select('*, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum)')
      break
    case 'hazassag':
      // 2026-05-30: a vőlegény/menyasszony embedded most már tartalmazza a
      // sz_datum, cnp, vallas, szcs_nev mezőket is — az esketési emléklap
      // élő preview-jához (husbandBirthDate, wifeBirthDate) és a szerkesztés
      // módban a helyes adatok visszatöltéséhez.
      query = supabase.from('hazassag').select('*, ferfi:szemely!id_ferfi(id, csaladnev, k_nev, sz_datum, cnp, vallas, szcs_nev), no:szemely!id_no(id, csaladnev, k_nev, sz_datum, cnp, vallas, szcs_nev)')
      break
    case 'temetes':
      query = supabase.from('temetes').select('*, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum), adrlocality!thelyid(name)')
      break
    case 'bekoltozott':
      // honnan helység (bekoltozott tábla: honnanid mező)
      query = supabase.from('bekoltozott').select('*, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum), adrlocality!honnanid(name)')
      break
    case 'attert':
      // honnan helység (attert tábla: honnanid mező)
      query = supabase.from('attert').select('*, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum), adrlocality!honnanid(name)')
      break
    case 'elkoltozott':
      // 2026-04-30 fix: az elkoltozott táblának HOVAID mezője van (NEM honnanid).
      // Plus: hova_congregation_id (célgyülekezet) + member_transfer_notifications
      // (státusz: pending / accepted / rejected) — a táblázat minden infóval.
      query = supabase.from('elkoltozott').select('*, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum, member_status), adrlocality!hovaid(name), hova_congregation:congregations!hova_congregation_id(name, nev_hu), transfer_notification:member_transfer_notifications!elkoltozott_id(id, status, responded_at)')
      break
    case 'kitert':
      // a kitert táblának is HOVAID mezője van
      query = supabase.from('kitert').select('*, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum), adrlocality!hovaid(name)')
      break
    default:
      query = supabase.from(tab).select('*, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum)')
      break
  }

  const { data } = await query.eq('congregation_id', congId).order(dateCol, { ascending: false })
  return (data || []) as unknown as RegistryEntry[]
}

// ── Okiratszám generálás ─────────────────────────────────────

export async function getNextOkiratNumber(tab: string, year: number): Promise<string> {
  const { supabase, congId } = await getCongregation()
  if (!congId) return `${year}01001`

  // A `hazassag` tábla `hlevel` mezőt tartalmaz az okiratszám helyett,
  // a többi (keresztseg, temetes) `okirat` mezőt használ.
  // A dátum-mező is változó: a temetes-ben `tdatum`, máshol `datum`.
  const okiratField = tab === 'hazassag' ? 'hlevel' : 'okirat'
  const dateField = tab === 'temetes' ? 'tdatum' : 'datum'

  const { data } = await supabase.from(tab).select(okiratField)
    .eq('congregation_id', congId)
    .gte(dateField, `${year}-01-01`).lte(dateField, `${year}-12-31`)

  let maxNum = 0
  ;(data || []).forEach((r: Record<string, string | null>) => {
    const value = r[okiratField]
    const m = String(value || '').match(/(\d+)$/)
    if (m) { const n = parseInt(m[1]); if (n > maxNum) maxNum = n }
  })

  if (maxNum === 0) return `${year}01001`
  return String(maxNum + 1)
}

// ── Egyházi anyakönyvi szám generálás (YYYYTTNNNN) ───────────
//
// Endre kérése (2026-04-30): a manuális rögzítő dialógokban az
// egyházi anyakönyvi szám automatikusan ki legyen töltve.
//
// A tényleges sorszám-számítás a `generate_egyhazi_anyakonyvi_szam`
// PostgreSQL függvényben él (lásd 2026-04-29b-egyhazi-szam-szetvalasztas.sql),
// így a webes és a desktop kliens ugyanazt a számot adja, és a sorrend
// nem ütközhet párhuzamos rögzítésnél sem.
//
// `profileKey` értékek:
//   'baptism' | 'confirmation' | 'marriage' | 'burial'
//   'movement_bekoltozott' | 'movement_elkoltozott'
//   'movement_attert' | 'movement_kitert'

export type EgyhaziProfileKey =
  | 'baptism'
  | 'confirmation'
  | 'marriage'
  | 'burial'
  | 'movement_bekoltozott'
  | 'movement_elkoltozott'
  | 'movement_attert'
  | 'movement_kitert'

export async function getNextEgyhaziSzam(profileKey: EgyhaziProfileKey, year?: number): Promise<string> {
  const { supabase, congId } = await getCongregation()
  const v_year = year ?? new Date().getFullYear()
  if (!congId) return `${v_year}000001`

  const { data, error } = await supabase.rpc('generate_egyhazi_anyakonyvi_szam', {
    p_target_congregation_id: congId,
    p_profile_key: profileKey,
    p_year: v_year,
  })
  if (error || !data) {
    console.warn('[getNextEgyhaziSzam] RPC hiba:', error?.message)
    return ''
  }
  return String(data)
}

// ── Jubileumi évfordulók (2026-06-10) ────────────────────────
// Az Áttekintő tabon: kik kereszteltek / konfirmáltak / esküdtek pontosan
// N évvel ezelőtt (10/20/25/50/75) — köszöntésekhez, jubileumi alkalmakhoz.
export async function getRegistryJubilees(yearsAgo: number) {
  const { supabase, congId } = await getCongregation()
  if (!congId) return null

  const safeYears = Math.max(1, Math.min(150, Math.floor(yearsAgo) || 0))
  const targetYear = new Date().getFullYear() - safeYears
  const from = `${targetYear}-01-01`
  const to = `${targetYear}-12-31T23:59:59`

  const [keresztRes, konfirmRes, hazassagRes] = await Promise.all([
    supabase.from('keresztseg')
      .select('id, datum, szemely:szemely!id_szemely(csaladnev, k_nev, meghalt)')
      .eq('congregation_id', congId).gte('datum', from).lte('datum', to).order('datum'),
    supabase.from('konfirmalas')
      .select('id, datum, szemely:szemely!id_szemely(csaladnev, k_nev, meghalt)')
      .eq('congregation_id', congId).gte('datum', from).lte('datum', to).order('datum'),
    supabase.from('hazassag')
      .select('id, datum, ferj:szemely!id_ferfi(csaladnev, k_nev), feleseg:szemely!id_no(csaladnev, k_nev)')
      .eq('congregation_id', congId).gte('datum', from).lte('datum', to).order('datum'),
  ])

  type PersonLite = { csaladnev: string | null; k_nev: string | null; meghalt?: boolean | null }
  const one = (v: unknown): PersonLite | null => (Array.isArray(v) ? (v[0] as PersonLite) || null : (v as PersonLite | null))
  const name = (p: PersonLite | null) => (p ? `${p.csaladnev || ''} ${p.k_nev || ''}`.trim() || 'Ismeretlen' : 'Ismeretlen')

  return {
    targetYear,
    yearsAgo: safeYears,
    keresztelesek: ((keresztRes.data || []) as { id: number; datum: string | null; szemely: unknown }[]).map((r) => {
      const p = one(r.szemely)
      return { id: r.id, datum: r.datum, nev: name(p), meghalt: !!p?.meghalt }
    }),
    konfirmaciok: ((konfirmRes.data || []) as { id: number; datum: string | null; szemely: unknown }[]).map((r) => {
      const p = one(r.szemely)
      return { id: r.id, datum: r.datum, nev: name(p), meghalt: !!p?.meghalt }
    }),
    hazassagok: ((hazassagRes.data || []) as { id: number; datum: string | null; ferj: unknown; feleseg: unknown }[]).map((r) => ({
      id: r.id,
      datum: r.datum,
      ferj: name(one(r.ferj)),
      feleseg: name(one(r.feleseg)),
    })),
  }
}

// ── Áttekintő statisztikák ───────────────────────────────────

export async function getRegistryStats() {
  const { supabase, congId } = await getCongregation()
  if (!congId) return null

  const curYear = new Date().getFullYear()
  const [keresztRes, konfirmRes, hazassagRes, temetesRes, bekoltozottRes, elkoltozottRes, attertRes, kitertRes] = await Promise.all([
    supabase.from('keresztseg').select('id, datum', { count: 'exact' }).eq('congregation_id', congId),
    supabase.from('konfirmalas').select('id, datum', { count: 'exact' }).eq('congregation_id', congId),
    supabase.from('hazassag').select('id, datum', { count: 'exact' }).eq('congregation_id', congId),
    supabase.from('temetes').select('id, tdatum', { count: 'exact' }).eq('congregation_id', congId),
    supabase.from('bekoltozott').select('id, mikor', { count: 'exact' }).eq('congregation_id', congId),
    supabase.from('elkoltozott').select('id, mikor', { count: 'exact' }).eq('congregation_id', congId),
    supabase.from('attert').select('id, mikor', { count: 'exact' }).eq('congregation_id', congId),
    supabase.from('kitert').select('id, mikor', { count: 'exact' }).eq('congregation_id', congId),
  ])

  function countThisYear(data: { datum?: string; tdatum?: string; mikor?: string }[] | null) {
    return (data || []).filter(r => {
      const rec = r as Record<string, string>
      const d = rec.datum || rec.tdatum || rec.mikor || ''
      return d.startsWith(String(curYear))
    }).length
  }

  return {
    totals: {
      kereszteles: keresztRes.count || 0,
      konfirmacio: konfirmRes.count || 0,
      hazassag: hazassagRes.count || 0,
      temetes: temetesRes.count || 0,
      bekoltozott: bekoltozottRes.count || 0,
      elkoltozott: elkoltozottRes.count || 0,
      attert: attertRes.count || 0,
      kitert: kitertRes.count || 0,
    },
    thisYear: {
      kereszteles: countThisYear(keresztRes.data as { datum?: string }[]),
      konfirmacio: countThisYear(konfirmRes.data as { datum?: string }[]),
      hazassag: countThisYear(hazassagRes.data as { datum?: string }[]),
      temetes: countThisYear(temetesRes.data as { tdatum?: string }[]),
      bekoltozott: countThisYear(bekoltozottRes.data as { mikor?: string }[]),
      elkoltozott: countThisYear(elkoltozottRes.data as { mikor?: string }[]),
    },
    currentYear: curYear,
  }
}

// ── Szülők lekérdezése egy gyerekhez ─────────────────────────
//
// Endre kérése (2026-04-30): "A kereszteléseknél, ellenőrizd, ha már van
// családhoz rendelve a személy, akkor a szülők nevei is jelenjenek meg."
//
// Több helyről kérhetjük a szülőket:
//   1) gyerek tábla → csalad tábla → id_ferfi + id_no → szemely
//   2) szemely.id_apja / szemely.id_anyja CNP-k (régebbi adatformátum)
//   3) szemely.apjaneve / szemely.anyjaneve text-ek (legrégebbi — csak
//      szövegként, mert nincs feloldható ID)
//
// A return: legjobb ami megvan — ha az 1) vagy 2) ágról van teljes
// MemberSearchResult, azt adjuk; ha csak text (3) van, azt is jelezzük.
//
// 2026-04-30 bug-fix: a `csalad:csalad!id_csalad(...)` JOIN néha array-ként
// jön vissza Supabase-től — defensive handling. Plus: server-side console.log
// diagnoszika a Vercel/Railway logokba (`[getParentsForChild] ...`).

export interface ParentInfo {
  fromCsalad: boolean
  apa: {
    id: number | null
    csaladnev: string | null
    k_nev: string | null
    cnp: string | null
    sz_datum: string | null
    adrlocality: { name: string | null } | null
    adrstreet: { name: string | null } | null
    c_szam: string | null
    /** 2026-05-29: vallás auto-fill-hez. */
    vallas?: string | null
  } | null
  anya: {
    id: number | null
    csaladnev: string | null
    k_nev: string | null
    cnp: string | null
    sz_datum: string | null
    adrlocality: { name: string | null } | null
    adrstreet: { name: string | null } | null
    c_szam: string | null
    /** 2026-05-29: vallás auto-fill-hez. */
    vallas?: string | null
  } | null
  /** Az anya leánykori neve (szemely.szcs_nev) — ha az anya megtalálható. */
  anyaLeanyneve: string | null
  /** TEXT-csak szülő-nevek (szemely.apjaneve / anyjaneve) — akkor is
   *  visszaadjuk, ha az ID-feloldás sikerült, hogy a UI tudja melyik
   *  szöveggel-szemben dönt majd a felhasználó. NULL ha nincs adat. */
  apjaneveText: string | null
  anyjaneveText: string | null
  /** Diagnosztika: melyik ágon talált adatot. Console-ra is kiíródik. */
  diagnostic: {
    hasGyerekRow: boolean
    csaladId: number | null
    csaladFerfiId: number | null
    csaladNoId: number | null
    szemelyApjaCnp: string | null
    szemelyAnyjaCnp: string | null
    szemelyApjaCnpResolved: boolean
    szemelyAnyjaCnpResolved: boolean
  }
}

export async function getParentsForChild(personId: number): Promise<ParentInfo> {
  const diagnostic: ParentInfo['diagnostic'] = {
    hasGyerekRow: false,
    csaladId: null,
    csaladFerfiId: null,
    csaladNoId: null,
    szemelyApjaCnp: null,
    szemelyAnyjaCnp: null,
    szemelyApjaCnpResolved: false,
    szemelyAnyjaCnpResolved: false,
  }
  const empty: ParentInfo = {
    fromCsalad: false, apa: null, anya: null, anyaLeanyneve: null,
    apjaneveText: null, anyjaneveText: null, diagnostic,
  }
  const { supabase, congId } = await getCongregation()
  if (!congId) {
    console.warn('[getParentsForChild] Nincs congregation_id — visszaadom üresen.')
    return empty
  }

  // ── A gyermek alapadatait egy lekérdezésben (apjaneve/anyjaneve text fallback-hez)
  const { data: childRow, error: childErr } = await supabase.from('szemely')
    .select('id, apjaneve, anyjaneve, id_apja, id_anyja')
    .eq('id', personId).eq('congregation_id', congId).limit(1)

  if (childErr) {
    console.error(`[getParentsForChild] szemely lekérdezés hiba (id=${personId}):`, childErr.message)
    return empty
  }
  const child = childRow?.[0]
  if (!child) {
    console.warn(`[getParentsForChild] Nem találom a tagot (id=${personId}, congId=${congId}).`)
    return empty
  }

  const apjaneveText = (child.apjaneve as string | null) || null
  const anyjaneveText = (child.anyjaneve as string | null) || null
  diagnostic.szemelyApjaCnp = (child.id_apja as string | null) || null
  diagnostic.szemelyAnyjaCnp = (child.id_anyja as string | null) || null

  let ferfiId: number | null = null
  let noId: number | null = null

  // ── 1) ÚJ MODELL: szemely_kapcsolat (vér szerinti szülő-gyerek)
  // A backfill után minden migrált család gyerekének itt él a 2 vér szerinti
  // szülő-kapcsolata. A férj/nő megkülönböztetést a szemely.ferfi mezőből.
  // (2026-06-01 — hibrid család-modell Fázis 2)
  const { data: kapcsolatRows, error: kapcsolatErr } = await supabase
    .from('szemely_kapcsolat')
    .select('id_szemely_1, szulo:szemely!id_szemely_1(id, ferfi)')
    .eq('id_szemely_2', personId)
    .eq('tipus', 'szulo_gyermek')
    .eq('ver_szerinti', true)
    .is('ervenyes_ig', null)
    .eq('congregation_id', congId)

  if (kapcsolatErr) {
    console.error(`[getParentsForChild] szemely_kapcsolat lekérdezés hiba (id=${personId}):`, kapcsolatErr.message)
  }

  for (const row of kapcsolatRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const szuloRaw = (row as any).szulo
    const szulo = (Array.isArray(szuloRaw) ? szuloRaw[0] : szuloRaw) as
      | { id: number; ferfi: boolean | null }
      | null
      | undefined
    if (!szulo) continue
    if (szulo.ferfi === true && !ferfiId) ferfiId = szulo.id
    else if (szulo.ferfi === false && !noId) noId = szulo.id
  }

  // ── 2) RÉGI MODELL fallback: gyerek → csalad → id_ferfi + id_no
  // (csak akkor fut, ha az új modell nem talált legalább 1 szülőt — pl. új
  // gyerek-rekord még nem került be a szemely_kapcsolat-ba, vagy a backfill
  // előtti adatok valamiért nem migrálódtak át.)
  if (!ferfiId || !noId) {
    const { data: gyerekRows, error: gyerekErr } = await supabase.from('gyerek')
      .select('id_csalad, csalad:csalad!id_csalad(id, id_ferfi, id_no, isaktiv)')
      .eq('id_szemely', personId).limit(1)

    if (gyerekErr) {
      console.error(`[getParentsForChild] gyerek lekérdezés hiba (id=${personId}):`, gyerekErr.message)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gyerekRaw = (gyerekRows?.[0] as any)?.csalad
    const csalad = (Array.isArray(gyerekRaw) ? gyerekRaw[0] : gyerekRaw) as
      | { id: number; id_ferfi: number | null; id_no: number | null; isaktiv: boolean | null }
      | null
      | undefined

    diagnostic.hasGyerekRow = !!gyerekRows?.[0]
    diagnostic.csaladId = csalad?.id ?? null
    diagnostic.csaladFerfiId = csalad?.id_ferfi ?? null
    diagnostic.csaladNoId = csalad?.id_no ?? null

    if (!ferfiId) ferfiId = csalad?.id_ferfi || null
    if (!noId) noId = csalad?.id_no || null
  }

  // ── 3) Fallback: szemely.id_apja / szemely.id_anyja CNP-k
  if (!ferfiId && diagnostic.szemelyApjaCnp) {
    const { data: a } = await supabase.from('szemely').select('id').eq('cnp', diagnostic.szemelyApjaCnp).eq('congregation_id', congId).limit(1)
    if (a?.[0]) {
      ferfiId = a[0].id
      diagnostic.szemelyApjaCnpResolved = true
    }
  }
  if (!noId && diagnostic.szemelyAnyjaCnp) {
    const { data: m } = await supabase.from('szemely').select('id').eq('cnp', diagnostic.szemelyAnyjaCnp).eq('congregation_id', congId).limit(1)
    if (m?.[0]) {
      noId = m[0].id
      diagnostic.szemelyAnyjaCnpResolved = true
    }
  }

  // ── 4) NÉV-ALAPÚ fallback: a szemely.apjaneve / anyjaneve text-mezőből
  // pontos egyezést keresünk a szemely-en belül (megfelelő nemmel + ugyanaz
  // a gyülekezet). Csak akkor töltjük ki, ha PONTOSAN 1 találat van — több
  // találat esetén kockázatos lenne automatikusan választani, a UI sárga
  // banner-je mutatja a szöveget és a user kézzel keres.
  // (2026-06-01 — hibrid család-modell Fázis 2)
  if (!ferfiId && apjaneveText) {
    const parts = apjaneveText.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      // Tipikus magyar név: "Vezetéknév Keresztnév" (lehet többszavas)
      const csaladnev = parts[0]
      const k_nev = parts.slice(1).join(' ')
      const { data: matches } = await supabase.from('szemely')
        .select('id')
        .ilike('csaladnev', csaladnev)
        .ilike('k_nev', k_nev)
        .eq('ferfi', true)
        .eq('congregation_id', congId)
        .eq('meghalt', false)
      if (matches && matches.length === 1) {
        ferfiId = matches[0].id as number
      }
    }
  }
  if (!noId && anyjaneveText) {
    const parts = anyjaneveText.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      const csaladnev = parts[0]
      const k_nev = parts.slice(1).join(' ')
      const { data: matches } = await supabase.from('szemely')
        .select('id')
        .ilike('csaladnev', csaladnev)
        .ilike('k_nev', k_nev)
        .eq('ferfi', false)
        .eq('congregation_id', congId)
        .eq('meghalt', false)
      if (matches && matches.length === 1) {
        noId = matches[0].id as number
      }
    }
  }

  // Apa + anya teljes adatainak lekérdezése (ha van ID)
  let apa: ParentInfo['apa'] = null
  let anya: ParentInfo['anya'] = null
  let anyaLeanyneve: string | null = null

  if (ferfiId) {
    const { data: a, error: apaErr } = await supabase.from('szemely')
      // 2026-05-29: vallas-t is hozzáadva az auto-fill-hez
      .select('id, csaladnev, k_nev, cnp, sz_datum, c_szam, vallas, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
      .eq('id', ferfiId).limit(1)
    if (apaErr) console.error('[getParentsForChild] apa szemely lekérdezés hiba:', apaErr.message)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (a?.[0]) apa = a[0] as any
  }
  if (noId) {
    const { data: m, error: anyaErr } = await supabase.from('szemely')
      // 2026-05-29: vallas-t is hozzáadva (szcs_nev már ott van)
      .select('id, csaladnev, k_nev, szcs_nev, cnp, sz_datum, c_szam, vallas, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
      .eq('id', noId).limit(1)
    if (anyaErr) console.error('[getParentsForChild] anya szemely lekérdezés hiba:', anyaErr.message)
    if (m?.[0]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      anya = m[0] as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      anyaLeanyneve = (m[0] as any).szcs_nev || null
    }
  }

  // Diagnosztika a szerver logokba — Vercel / Railway látható (dev-only)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[getParentsForChild] id=${personId}:`, JSON.stringify({
      diagnostic, hasApa: !!apa, hasAnya: !!anya, apjaneveText, anyjaneveText,
    }))
  }

  return {
    // 2026-06-01: az új modell (szemely_kapcsolat) is "családi adatnak" számít —
    // a UI üzenete ("Szülők automatikusan kitöltve a családi adatokból") ugyanaz.
    fromCsalad: !!(ferfiId || noId),
    apa, anya, anyaLeanyneve,
    apjaneveText, anyjaneveText,
    diagnostic,
  }
}

// ── Személy keresés ──────────────────────────────────────────

/**
 * 2026-05-30: A tag rekordjához tartozó születési helység (szemely.sz_helyid →
 * adrlocality.name). Az esketési dialog ezt használja, hogy a felhasználónak
 * megsúgja: melyik helységet kell ragozni az „aki … született" mezőbe.
 * Visszatérés: a helység neve (string) vagy null, ha nincs rögzítve / nincs
 * jogosultság.
 */
export async function getMemberBirthPlace(memberId: number): Promise<string | null> {
  const { supabase, congId } = await getCongregation()
  if (!congId) return null
  const { data, error } = await supabase
    .from('szemely')
    .select('sz_hely:adrlocality!sz_helyid(name)')
    .eq('id', memberId)
    .eq('congregation_id', congId)
    .maybeSingle()
  if (error) {
    console.warn('[getMemberBirthPlace] lekérdezés hiba:', error.message)
    return null
  }
  // A Supabase nested join egy objektum-ot vagy null-t ad vissza — vagy bizonyos
  // esetekben tömböt, attól függően, hogy 1:1 vagy 1:N FK-t azonosított. Mindkét
  // formátum kezelve:
  const szHely = data?.sz_hely as { name?: string | null } | { name?: string | null }[] | null | undefined
  if (!szHely) return null
  if (Array.isArray(szHely)) return szHely[0]?.name || null
  return szHely.name || null
}

/**
 * 2026-05-30: Ellenőrzi, hogy két személy között létezik-e egyházi
 * házassági bejegyzés. A keresztelői emléklapon az anya nevét így formázzuk:
 * ha igen, akkor „Kádár Zoltánné Tódor Enikő", ha nem, akkor csak a
 * leánykori név („Tódor Enikő").
 *
 * 2026-06-01 (hibrid család-modell Fázis 2): elsőként az új `szemely_kapcsolat`
 * táblát kérdezzük (tipus='hazastars', aktív rekord) — szimmetrikusan, mert
 * a kapcsolatban szemely_1 és szemely_2 sorrendje konvenció szerint
 * (id_ferfi, id_no), de védelmi háló a fordítottra is. Fallback a régi
 * `hazassag` táblára, ha nincs új-modell kapcsolat (pl. még nem szinkronizált
 * legacy import).
 */
export async function getMarriageBetween(ferfiId: number, noId: number): Promise<boolean> {
  const { supabase, congId } = await getCongregation()
  if (!congId) return false

  // 1) ÚJ modell — szemely_kapcsolat hazastars (aktív, mindkét irányban)
  const { data: kapcsolat } = await supabase
    .from('szemely_kapcsolat')
    .select('id')
    .or(`and(id_szemely_1.eq.${ferfiId},id_szemely_2.eq.${noId}),and(id_szemely_1.eq.${noId},id_szemely_2.eq.${ferfiId})`)
    .eq('tipus', 'hazastars')
    .is('ervenyes_ig', null)
    .eq('congregation_id', congId)
    .limit(1)
  if (kapcsolat && kapcsolat.length > 0) return true

  // 2) RÉGI modell fallback — hazassag tábla
  const { data, error } = await supabase.from('hazassag')
    .select('id')
    .eq('id_ferfi', ferfiId)
    .eq('id_no', noId)
    .eq('congregation_id', congId)
    .limit(1)
  if (error) {
    console.warn('[getMarriageBetween] lekérdezés hiba:', error.message)
    return false
  }
  return (data?.length ?? 0) > 0
}

export async function searchMemberForRegistry(query: string, genderFilter?: boolean | null) {
  if (query.trim().length < 2) return []
  const { supabase, congId } = await getCongregation()
  if (!congId) return []
  const parts = query.trim().split(/\s+/)
  let q = supabase.from('szemely')
    // 2026-05-29: vallas + szcs_nev (leánykori név) is — a baptism-dialog
    // apa/anya kiválasztáskor ezekből automatikusan kitölti a megfelelő mezőket.
    .select('id, csaladnev, k_nev, ferfi, sz_datum, cnp, c_szam, vallas, szcs_nev, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
    .eq('congregation_id', congId).eq('isvisible', true).eq('meghalt', false)

  if (genderFilter !== null && genderFilter !== undefined) q = q.eq('ferfi', genderFilter)
  if (parts.length === 1) q = q.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`)
  else q = q.ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`)

  const { data } = await q.limit(8)
  return data || []
}

// ── Keresztelés mentés ───────────────────────────────────────

export async function saveBaptism(data: BaptismInput) {
  // 2026-05-30: diagnosztikai napló a "nem mentette" hiba debug-jához
  console.log('[saveBaptism] input data:', JSON.stringify(data))
  const parsed = baptismSchema.safeParse(data)
  if (!parsed.success) {
    console.error('[saveBaptism] schema validáció hiba:', parsed.error.issues)
    return { error: parsed.error.issues[0].message }
  }

  const { supabase, congId } = await getCongregation()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const d = parsed.data
  console.log('[saveBaptism] parsed.id:', d.id, '→', d.id ? 'UPDATE' : 'INSERT')

  // Sablon JSON (anya leánykori, szülők vallása) → megjegyzes végéhez
  let megjegyzes = d.megjegyzes || ''
  const sablon: Record<string, string> = {}
  if (d.anya_leanyneve) sablon.anya_leanyneve = d.anya_leanyneve
  if (d.apa_vallas) sablon.apa_vallas = d.apa_vallas
  if (d.anya_vallas) sablon.anya_vallas = d.anya_vallas
  if (Object.keys(sablon).length > 0) megjegyzes = `${megjegyzes}|sablon:${JSON.stringify(sablon)}`

  // Egyházi anyakönyvi szám: ha a kliens nem küldi el, automatikusan
  // generálódik a `generate_egyhazi_anyakonyvi_szam` RPC-vel (lásd
  // 2026-04-29b-egyhazi-szam-szetvalasztas.sql). Az `okirat` mező az
  // ÁLLAMI anyakönyvi szám (Endre szabálya), és lehet üres.
  let egyhaziSzam = d.egyhazi_szam || null
  if (!d.id && !egyhaziSzam) {
    const year = parseInt(d.datum.slice(0, 4)) || new Date().getFullYear()
    const { data: rpcData } = await supabase.rpc('generate_egyhazi_anyakonyvi_szam', {
      p_target_congregation_id: congId,
      p_profile_key: 'baptism',
      p_year: year,
    })
    egyhaziSzam = rpcData ? String(rpcData) : null
  }

  const record: Record<string, unknown> = {
    id_szemely: d.id_szemely,
    datum: d.datum,
    okirat: d.okirat || null,
    egyhazi_szam: egyhaziSzam,
    helyid: d.helyid || null,
    lelkeszneve: d.lelkeszneve || null,
    keresztszulok: d.keresztszulok || null,
    alapige: d.alapige || null,
    megjegyzes: megjegyzes || null,
    munkanaploba: d.munkanaploba,
    congregation_id: congId,
  }

  // 2026-06-12 (Endre #3-4): a sor id-ját ÉS a meglévő munkanaplo_id linket is
  // megfogjuk — a mentés végi munkanapló-szinkronhoz.
  let baptismRowId: number | null = null
  let currentWorklogId: number | null = null
  if (d.id) {
    const { error, data: updData, count } = await supabase
      .from('keresztseg')
      .update(record, { count: 'exact' })
      .eq('id', d.id)
      .eq('congregation_id', congId)
      .select('id, munkanaplo_id')
    console.log('[saveBaptism] UPDATE eredmény:', { id: d.id, count, updData, error: error?.message })
    if (error) return { error: `Hiba: ${error.message}` }
    if (!count || count === 0) {
      console.error('[saveBaptism] ⚠️ UPDATE 0 sort érintett! id=', d.id, 'congId=', congId)
      return { error: `A bejegyzés nem található (id=${d.id}). Vagy törölve lett, vagy más gyülekezeté.` }
    }
    baptismRowId = d.id
    currentWorklogId = (updData?.[0]?.munkanaplo_id as number | null) ?? null
  } else {
    const { error, data: insData } = await supabase.from('keresztseg').insert([record]).select('id')
    if (error) return { error: `Hiba: ${error.message}` }
    baptismRowId = (insData?.[0]?.id as number | undefined) ?? null
  }

  // Szülő-csatolás a szemely táblában — MIND insert MIND update esetén.
  // (Endre 2026-04-30: ha az anyakönyvező csak a SZERKESZTÉS során rendel
  // szülőket, akkor is jönnie kell létre a csalad+gyerek rekordnak, hogy
  // a következő baptism-megnyitáskor a zöld badge megjelenjen.)
  const szemelyUpdate: Record<string, unknown> = {}
  if (d.apjaneve) szemelyUpdate.apjaneve = d.apjaneve
  if (d.anyjaneve) szemelyUpdate.anyjaneve = d.anyjaneve
  if (d.id_apja_cnp) szemelyUpdate.id_apja = d.id_apja_cnp
  if (d.id_anyja_cnp) szemelyUpdate.id_anyja = d.id_anyja_cnp
  if (Object.keys(szemelyUpdate).length > 0) {
    await supabase.from('szemely').update(szemelyUpdate).eq('id', d.id_szemely).eq('congregation_id', congId)
  }

  let familyWarning: string | null = null
  if (d.id_apja_cnp || d.id_anyja_cnp) {
    familyWarning = await checkAndCreateFamily(supabase, d.id_szemely, d.id_apja_cnp || null, d.id_anyja_cnp || null)
  }

  // 2026-05-29: ha a felhasználó megadta az anya leánykori nevét
  // (anya_leanyneve), és az anya CNP-je is ismert, az anya szemely.szcs_nev
  // mezőjébe is bementjük — DE csak akkor, ha ott eddig üres volt (ne írjuk
  // felül a meglévő adatot). Ezzel a jövőbeli keresztelésekkor az auto-load
  // is ki tudja venni.
  if (d.anya_leanyneve && d.id_anyja_cnp) {
    const { data: existing } = await supabase.from('szemely')
      .select('id, szcs_nev')
      .eq('cnp', d.id_anyja_cnp)
      .eq('congregation_id', congId)
      .limit(1)
    if (existing?.[0] && !existing[0].szcs_nev) {
      const updateErr = await supabase.from('szemely')
        .update({ szcs_nev: d.anya_leanyneve })
        .eq('id', existing[0].id)
      if (updateErr.error) {
        console.warn('[saveBaptism] anya szcs_nev frissítés hiba:', updateErr.error.message)
      }
    }
  }
  // Ugyanígy a vallás-mezőket is automatikusan visszamentjük az apa/anya
  // rekordba, ha eddig üres volt.
  if (d.apa_vallas && d.id_apja_cnp) {
    const { data: existing } = await supabase.from('szemely')
      .select('id, vallas').eq('cnp', d.id_apja_cnp).eq('congregation_id', congId).limit(1)
    if (existing?.[0] && !existing[0].vallas) {
      await supabase.from('szemely').update({ vallas: d.apa_vallas }).eq('id', existing[0].id)
    }
  }
  if (d.anya_vallas && d.id_anyja_cnp) {
    const { data: existing } = await supabase.from('szemely')
      .select('id, vallas').eq('cnp', d.id_anyja_cnp).eq('congregation_id', congId).limit(1)
    if (existing?.[0] && !existing[0].vallas) {
      await supabase.from('szemely').update({ vallas: d.anya_vallas }).eq('id', existing[0].id)
    }
  }

  // Munkanapló-szinkron (2026-06-12, Endre #3-4): idempotens — a keresztseg
  // sor `munkanaplo_id` linkje + a munkanaplo.id_jellege forrás-marker véd a
  // duplikáció ellen; szerkesztéskor a meglévő bejegyzés frissül; kicsekkolt
  // pipánál a bejegyzés soft-delete-et kap. Hibája nem blokkolja a mentést.
  //
  // KORÁBBI BUG: az itteni insert a jelenlet_osszesen NOT NULL oszlop miatt
  // NÉMÁN elbukott (nincs DB-default), így a pipa hatástalan volt.
  if (baptismRowId) {
    const names = await getSzemelyNames(supabase, [d.id_szemely])
    await syncRegistryWorklogLink(supabase, congId, {
      sourceTable: 'keresztseg',
      sourceId: baptismRowId,
      currentWorklogId,
      munkanaploba: !!d.munkanaploba,
      payload: {
        idopont: d.datum,
        jellege: 'Keresztelő',
        cim: `Keresztelés: ${names.get(d.id_szemely) || ''}`.trim(),
        alapige: d.alapige || null,
        szolgalt: d.lelkeszneve || null,
      },
    })
  }

  revalidatePath('/anyakonyv')
  revalidatePath('/munkanaplo')
  return { success: true, warning: familyWarning ?? undefined }
}

// ── Család automatikus létrehozás ────────────────────────────

// 2026-08-01 (PR-18): visszatérési érték — figyelmeztető szöveg, ha a gyermek
// már egy MÁSIK aktív család tagja (ilyenkor nem hozunk létre dupla tagságot).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkAndCreateFamily(supabase: any, childId: number, fatherCnp: string | null, motherCnp: string | null): Promise<string | null> {
  let ferfiId: number | null = null
  let noId: number | null = null

  // 2026-08-01 (PR-18): a congregation_id-t ELŐRE vesszük, és a CNP-lookup a
  // gyermek gyülekezetére szűr — enélkül más gyülekezet azonos CNP-jű személye
  // is bekerülhetett a családba.
  const { data: childRowEarly } = await supabase
    .from('szemely')
    .select('congregation_id')
    .eq('id', childId)
    .single()
  const congId = childRowEarly?.congregation_id as string | undefined
  if (!congId) return null // védelmi háló — congregation_id nélkül nem írhatunk

  if (fatherCnp) {
    const { data } = await supabase.from('szemely').select('id, c_utcaid, c_szam').eq('cnp', fatherCnp).eq('congregation_id', congId).limit(1)
    if (data?.[0]) ferfiId = data[0].id
  }
  if (motherCnp) {
    const { data } = await supabase.from('szemely').select('id, c_utcaid, c_szam').eq('cnp', motherCnp).eq('congregation_id', congId).limit(1)
    if (data?.[0]) noId = data[0].id
  }

  if (!ferfiId && !noId) return null

  // Meglévő család keresés
  let famQuery = supabase.from('csalad').select('id').eq('isaktiv', true)
  if (ferfiId) famQuery = famQuery.eq('id_ferfi', ferfiId)
  if (noId) famQuery = famQuery.eq('id_no', noId)
  const { data: existing } = await famQuery.limit(1)

  let famId: number | null = null
  if (existing?.[0]) {
    famId = existing[0].id
  } else {
    // Új család létrehozás (szülő lakcímével)
    const parentId = ferfiId || noId
    const { data: parentData } = await supabase.from('szemely').select('c_utcaid, c_szam').eq('id', parentId).single()
    if (parentData?.c_utcaid) {
      const { data: newFam } = await supabase.from('csalad').insert([{
        id_ferfi: ferfiId, id_no: noId, c_utcaid: parentData.c_utcaid, c_szam: parentData.c_szam || '1', isaktiv: true,
      }]).select('id')
      if (newFam?.[0]) famId = newFam[0].id
    }
  }

  // 2026-08-01 (PR-18): dupla-tagsági őr — ha a gyermek már MÁSIK aktív család
  // tagja (gyermekként VAGY felnőttként), NEM szúrunk be második gyerek-sort
  // némán, hanem figyelmeztetünk.
  let alreadyElsewhere = false
  let warning: string | null = null
  if (famId) {
    const [{ data: otherRows }, { data: adultRows }] = await Promise.all([
      supabase
        .from('gyerek')
        .select('id_csalad, csalad:csalad!id_csalad(id, isaktiv)')
        .eq('id_szemely', childId)
        .neq('id_csalad', famId),
      supabase
        .from('csalad')
        .select('id')
        .eq('isaktiv', true)
        .neq('id', famId)
        .or(`id_ferfi.eq.${childId},id_no.eq.${childId}`)
        .limit(1),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    alreadyElsewhere = ((otherRows || []) as any[]).some((r) => {
      const cs = Array.isArray(r.csalad) ? r.csalad[0] : r.csalad
      return !!cs?.isaktiv
    }) || ((adultRows || []) as { id: number }[]).length > 0
    if (alreadyElsewhere) {
      warning = 'A megkeresztelt személy már egy másik család tagjaként szerepel, ezért a szülők alapján NEM rendeltük hozzá automatikusan egy második családhoz. Áthelyezni a személyi karton „Családhoz rendelés" gombjával lehet.'
    }
  }

  // Gyerek regisztráció — RÉGI modell (csalad + gyerek)
  if (famId && !alreadyElsewhere) {
    const { data: check } = await supabase.from('gyerek').select('id').eq('id_szemely', childId).eq('id_csalad', famId).limit(1)
    if (!check?.length) await supabase.from('gyerek').insert([{ id_csalad: famId, id_szemely: childId }])
  }

  // 2026-06-01 (hibrid család-modell Fázis 2): ÚJ modell írás-oldal
  // A vér szerinti szülő-gyerek kapcsolatokat és a háztartás-tagságot is
  // rögzítjük az új táblákba, hogy az új keresztelők után a getParentsForChild
  // azonnal az új modellből olvashasson (ne kelljen a régi-fallback ágra menni).
  // A vér szerinti kapcsolat a családtagságtól FÜGGETLENÜL rögzül.

  // ── A) szülő-gyerek kapcsolatok rögzítése ────────────────────────────
  // Idempotens: előbb check, csak ha nincs aktív rekord → insert.
  async function ensureSzemelyKapcsolat(szuloId: number) {
    const { data: existing } = await supabase
      .from('szemely_kapcsolat')
      .select('id')
      .eq('id_szemely_1', szuloId)
      .eq('id_szemely_2', childId)
      .eq('tipus', 'szulo_gyermek')
      .is('ervenyes_ig', null)
      .limit(1)
    if (existing?.length) return
    await supabase.from('szemely_kapcsolat').insert([{
      id_szemely_1: szuloId,
      id_szemely_2: childId,
      tipus: 'szulo_gyermek',
      ver_szerinti: true,
      congregation_id: congId,
    }])
  }
  if (ferfiId) await ensureSzemelyKapcsolat(ferfiId)
  if (noId) await ensureSzemelyKapcsolat(noId)

  // ── B) Háztartás-szinkron az új modellben ─────────────────────────────
  // 2026-08-01 (PR-18 review): a korábbi kézi haztartas_tag-insert csak akkor
  // futott, ha a háztartás MÁR létezett — a keresztelésnél auto-létrejött
  // családnak így sosem lett haztartas-sora, ezért a „Családhoz rendelés"
  // kereső és a Családok lista sem látta. A közös sync a hiányzó cim+haztartas
  // sorokat is pótolja.
  if (famId && !alreadyElsewhere) {
    try {
      await syncHouseholdFromCsalad(supabase, famId, congId)
    } catch (e) {
      console.warn('[checkAndCreateFamily] háztartás-szinkron sikertelen (nem blokkoló):',
        e instanceof Error ? e.message : e)
    }
  }

  return warning
}

// 2026-06-10 (Fázis 3, átvilágítás P1-7a): házasságkötéskor a CSALÁDI rekordról
// is gondoskodunk — keresztelésnél ez eddig is megvolt (checkAndCreateFamily),
// házasságnál hiányzott, így az új házaspár nem jelent meg a Családok fülön.
// Idempotens: meglévő közös aktív család esetén nem ír; fél-családot (özvegy/
// egyedülálló családfő) kiegészít; különben új családot hoz létre a férj
// (vagy feleség) lakcímével.
//
// 2026-08-01 (PR-18 review): dupla-tagsági őr MINDEN ágon — a fél-család
// kiegészítése is csak akkor fut, ha a másik fél nem tagja már egy másik
// aktív családnak (felnőttként VAGY gyermekként). Ütközésnél figyelmeztető
// szöveget adunk vissza (a házassági anyakönyv ettől még elmentődik), és a
// rendezés a személyi karton „Családhoz rendelés / Áthelyezés" folyamatával
// végezhető el. Sikeres írás után a háztartás-modell is szinkronizálódik.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureFamilyForCouple(supabase: any, ferfiId: number, noId: number, congId: string): Promise<string | null> {
  // 1) már létező közös aktív család?
  const { data: existingBoth } = await supabase.from('csalad').select('id')
    .eq('isaktiv', true).eq('id_ferfi', ferfiId).eq('id_no', noId).limit(1)
  if (existingBoth?.length) return null

  // Tagsági ellenőrzés: felnőttként másik aktív családban (kizárható családdal),
  // vagy gyermekként bárhol aktív családban
  async function memberElsewhere(personId: number, excludeFamilyId?: number): Promise<boolean> {
    const adultQuery = supabase.from('csalad').select('id')
      .eq('isaktiv', true)
      .or(`id_ferfi.eq.${personId},id_no.eq.${personId}`)
      .limit(2)
    const [{ data: adultRows }, { data: childRows }] = await Promise.all([
      adultQuery,
      supabase.from('gyerek')
        .select('id_csalad, csalad:csalad!id_csalad(id, isaktiv)')
        .eq('id_szemely', personId),
    ])
    const adultElsewhere = ((adultRows || []) as { id: number }[])
      .some((r) => r.id !== excludeFamilyId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const childAnywhere = ((childRows || []) as any[]).some((r) => {
      const cs = Array.isArray(r.csalad) ? r.csalad[0] : r.csalad
      return !!cs?.isaktiv
    })
    return adultElsewhere || childAnywhere
  }

  const CONFLICT_WARNING =
    'A házassági anyakönyv elmentődött, de a családi karton NEM jött létre automatikusan, mert az egyik fél még egy másik család tagjaként szerepel (pl. a szülei családjában vagy egy korábbi, le nem zárt családban). Rendezd a személyi karton „Családhoz rendelés / Áthelyezés" gombjával, vagy a Családok fülön.'

  const syncAfter = async (familyId: number) => {
    try {
      await syncHouseholdFromCsalad(supabase, familyId, congId)
    } catch (e) {
      console.warn('[ensureFamilyForCouple] háztartás-szinkron sikertelen (nem blokkoló):',
        e instanceof Error ? e.message : e)
    }
  }

  // 2) fél-család kiegészítése — csak ha a MÁSIK fél nincs máshol
  const { data: husbandSolo } = await supabase.from('csalad').select('id')
    .eq('isaktiv', true).eq('id_ferfi', ferfiId).is('id_no', null).limit(1)
  if (husbandSolo?.[0]) {
    if (await memberElsewhere(noId)) return CONFLICT_WARNING
    await supabase.from('csalad').update({ id_no: noId }).eq('id', husbandSolo[0].id)
    await syncAfter(husbandSolo[0].id as number)
    return null
  }
  const { data: wifeSolo } = await supabase.from('csalad').select('id')
    .eq('isaktiv', true).eq('id_no', noId).is('id_ferfi', null).limit(1)
  if (wifeSolo?.[0]) {
    if (await memberElsewhere(ferfiId, wifeSolo[0].id as number)) return CONFLICT_WARNING
    await supabase.from('csalad').update({ id_ferfi: ferfiId }).eq('id', wifeSolo[0].id)
    await syncAfter(wifeSolo[0].id as number)
    return null
  }

  // 3) új család — csak ha egyik fél sem tagja már másik aktív családnak
  if (await memberElsewhere(ferfiId) || await memberElsewhere(noId)) {
    return CONFLICT_WARNING
  }

  // Új család a férj (vagy a feleség) lakcímével — cím nélkül nem hozunk
  // létre rekordot (a csalad.c_utcaid NOT NULL)
  const { data: addr } = await supabase.from('szemely').select('id, c_utcaid, c_szam')
    .in('id', [ferfiId, noId]).not('c_utcaid', 'is', null).limit(1)
  if (!addr?.[0]?.c_utcaid) return null
  const { data: newFam } = await supabase.from('csalad').insert([{
    id_ferfi: ferfiId, id_no: noId,
    c_utcaid: addr[0].c_utcaid, c_szam: addr[0].c_szam || '1', isaktiv: true,
  }]).select('id')
  if (newFam?.[0]?.id) await syncAfter(newFam[0].id as number)
  return null
}

// ── Házasság mentés ──────────────────────────────────────────

export async function saveMarriage(data: MarriageInput) {
  const parsed = marriageSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, congId } = await getCongregation()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const d = parsed.data

  let egyhaziSzam = d.egyhazi_szam || null
  if (!d.id && !egyhaziSzam) {
    const year = parseInt(d.datum.slice(0, 4)) || new Date().getFullYear()
    const { data: rpcData } = await supabase.rpc('generate_egyhazi_anyakonyvi_szam', {
      p_target_congregation_id: congId,
      p_profile_key: 'marriage',
      p_year: year,
    })
    egyhaziSzam = rpcData ? String(rpcData) : null
  }

  // 2026-05-30: az emléklap-specifikus adatok (szül. helyek + igevers/igehely)
  // a megjegyzes-be sablon JSON-ként mentődnek — ugyanaz a pattern, mint a
  // baptism vigil/verse-nél. Format: "<user megjegyzes>|sablon:{...}"
  const sablonObj = {
    husband_birth_place: d.husband_birth_place || '',
    wife_birth_place: d.wife_birth_place || '',
    verse_text: d.verse_text || '',
    verse_reference: d.verse_reference || '',
  }
  const sablonNonEmpty = Object.values(sablonObj).some(v => v.length > 0)
  const baseMegj = d.megjegyzes || ''
  const finalMegj = sablonNonEmpty
    ? (baseMegj ? baseMegj + '|sablon:' : '|sablon:') + JSON.stringify(sablonObj)
    : (baseMegj || null)

  const record = {
    id_ferfi: d.id_ferfi,
    id_no: d.id_no,
    datum: d.datum,
    hlevel: d.hlevel || null,
    egyhazi_szam: egyhaziSzam,
    lelkeszneve: d.lelkeszneve || null,
    tanuk: d.tanuk || null,
    helyid: d.helyid || null,
    vegyes: d.vegyes ?? false,
    munkanaploba: d.munkanaploba ?? false,
    megjegyzes: finalMegj,
    congregation_id: congId,
  }
  // 2026-06-12 (Endre #3-4): sor-id + meglévő munkanapló-link megfogása a
  // mentés végi munkanapló-szinkronhoz.
  let marriageRowId: number | null = null
  let currentWorklogId: number | null = null
  if (d.id) {
    const { error, data: updData } = await supabase.from('hazassag').update(record)
      .eq('id', d.id).eq('congregation_id', congId).select('id, munkanaplo_id')
    if (error) return { error: `Hiba: ${error.message}` }
    marriageRowId = d.id
    currentWorklogId = (updData?.[0]?.munkanaplo_id as number | null) ?? null
  } else {
    const { error, data: insData } = await supabase.from('hazassag').insert([record]).select('id')
    if (error) return { error: `Hiba: ${error.message}` }
    marriageRowId = (insData?.[0]?.id as number | undefined) ?? null
  }

  // 2026-06-01 (hibrid család-modell Fázis 2): ÚJ modell — házastársi kapcsolat
  // rögzítése a szemely_kapcsolat táblában. Konvenció: id_szemely_1 = férfi
  // (id_ferfi), id_szemely_2 = nő (id_no). A szimmetrikus duplikáció ellen
  // (ferfi↔no fordított sorrendben) explicit OR-check van a meglévő rekordra.
  const { data: existingMarriageLink } = await supabase
    .from('szemely_kapcsolat')
    .select('id')
    .or(`and(id_szemely_1.eq.${d.id_ferfi},id_szemely_2.eq.${d.id_no}),and(id_szemely_1.eq.${d.id_no},id_szemely_2.eq.${d.id_ferfi})`)
    .eq('tipus', 'hazastars')
    .is('ervenyes_ig', null)
    .limit(1)
  if (!existingMarriageLink?.length) {
    await supabase.from('szemely_kapcsolat').insert([{
      id_szemely_1: d.id_ferfi,
      id_szemely_2: d.id_no,
      tipus: 'hazastars',
      ver_szerinti: false,
      ervenyes_tol: d.datum, // az esküvő dátuma
      congregation_id: congId,
    }])
  }

  // 2026-06-10 (Fázis 3, P1-7a): családi rekord biztosítása az új házaspárnak
  // 2026-08-01 (PR-18): a dupla-tagsági figyelmeztetés visszajut a felületre
  let familyWarning: string | null = null
  try {
    familyWarning = await ensureFamilyForCouple(supabase, d.id_ferfi, d.id_no, congId)
  } catch (e) {
    console.warn('[saveMarriage] család-biztosítás sikertelen (nem blokkoló):',
      e instanceof Error ? e.message : e)
  }

  // Munkanapló-szinkron (2026-06-12, Endre #3-4): az esketés EDDIG egyáltalán
  // nem került be a munkanaplóba (hiányzó integráció) — most a kereszteléssel
  // azonos, idempotens úton szinkronizál. Hibája nem blokkolja a mentést.
  if (marriageRowId) {
    const names = await getSzemelyNames(supabase, [d.id_ferfi, d.id_no])
    await syncRegistryWorklogLink(supabase, congId, {
      sourceTable: 'hazassag',
      sourceId: marriageRowId,
      currentWorklogId,
      munkanaploba: !!d.munkanaploba,
      payload: {
        idopont: d.datum,
        jellege: 'Esketés',
        cim: `Esketés: ${names.get(d.id_ferfi) || '?'} és ${names.get(d.id_no) || '?'}`,
        szolgalt: d.lelkeszneve || null,
      },
    })
  }

  revalidatePath('/anyakonyv')
  revalidatePath('/tagnyilvantartas')
  revalidatePath('/munkanaplo')
  return { success: true, warning: familyWarning ?? undefined }
}

// ── Temetés mentés ───────────────────────────────────────────

export async function saveBurial(data: BurialInput) {
  const parsed = burialSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, congId } = await getCongregation()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const d = parsed.data

  let egyhaziSzam = d.egyhazi_szam || null
  if (!d.id && !egyhaziSzam) {
    const year = parseInt(d.tdatum.slice(0, 4)) || new Date().getFullYear()
    const { data: rpcData } = await supabase.rpc('generate_egyhazi_anyakonyvi_szam', {
      p_target_congregation_id: congId,
      p_profile_key: 'burial',
      p_year: year,
    })
    egyhaziSzam = rpcData ? String(rpcData) : null
  }

  // 2026-05-30: gyászjelentés-specifikus mezők → sablon JSON a megjegyzés
  // mezőben (a temetes táblának nincs sajat oszlopa nekik). Baptism mintára.
  let megjegyzes = d.megjegyzes || ''
  const sablon: Record<string, string> = {}
  if (d.funeral_time) sablon.funeral_time = d.funeral_time
  if (d.funeral_place) sablon.funeral_place = d.funeral_place
  if (d.vigil_date) sablon.vigil_date = d.vigil_date
  if (d.vigil_time) sablon.vigil_time = d.vigil_time
  if (d.vigil_place) sablon.vigil_place = d.vigil_place
  if (d.verse_text) sablon.verse_text = d.verse_text
  if (d.verse_reference) sablon.verse_reference = d.verse_reference
  if (d.relative_relation) sablon.relative_relation = d.relative_relation
  // mourners: üres string is mentődik (a "skip" eset különbözik az alapértelmezettől)
  if (d.mourners !== undefined && d.mourners !== null) sablon.mourners = d.mourners
  if (Object.keys(sablon).length > 0) megjegyzes = `${megjegyzes}|sablon:${JSON.stringify(sablon)}`

  const record = {
    id_szemely: d.id_szemely,
    hdatum: d.hdatum,
    tdatum: d.tdatum,
    hoka: d.hoka || null,
    okirat: d.okirat || null,
    egyhazi_szam: egyhaziSzam,
    hhelyid: d.hhelyid || null,
    thelyid: d.thelyid || null,
    lelkeszneve: d.lelkeszneve || null,
    munkanaploba: d.munkanaploba,
    megjegyzes: megjegyzes || null,
    congregation_id: congId,
  }
  // 2026-06-12 (Endre #3-4): sor-id + munkanapló-link megfogása a szinkronhoz.
  // KORÁBBI BUG: a régi munkanaplo-insert a jelenlet_osszesen NOT NULL oszlop
  // miatt némán elbukott, és csak új rögzítésre futott (szerkesztésre nem).
  let burialRowId: number | null = null
  let currentWorklogId: number | null = null
  if (d.id) {
    const { error, data: updData } = await supabase.from('temetes').update(record)
      .eq('id', d.id).eq('congregation_id', congId).select('id, munkanaplo_id')
    if (error) return { error: `Hiba: ${error.message}` }
    burialRowId = d.id
    currentWorklogId = (updData?.[0]?.munkanaplo_id as number | null) ?? null
  } else {
    const { error, data: insData } = await supabase.from('temetes').insert([record]).select('id')
    if (error) return { error: `Hiba: ${error.message}` }
    burialRowId = (insData?.[0]?.id as number | undefined) ?? null
  }

  // Munkanapló-szinkron (idempotens; hibája nem blokkol)
  if (burialRowId) {
    const names = await getSzemelyNames(supabase, [d.id_szemely])
    await syncRegistryWorklogLink(supabase, congId, {
      sourceTable: 'temetes',
      sourceId: burialRowId,
      currentWorklogId,
      munkanaploba: !!d.munkanaploba,
      payload: {
        idopont: d.tdatum,
        jellege: 'Temetés',
        cim: `Temetés: ${names.get(d.id_szemely) || ''}`.trim(),
        szolgalt: d.lelkeszneve || null,
      },
    })
  }

  // 2026-05-02 (v0.9.33) — Felhasználó panasza: "a temetések rögzítve vannak az
  // adatbázisban, de nem jelennek meg az oldalon az eltemetetteknél" — azaz a
  // tag továbbra is élőként szerepel a tagnyilvántartásban.
  //
  // Ok: a saveBurial korábban CSAK a `temetes` táblába írt, a `szemely.meghalt`
  // és `member_status` mezőket nem állította át. (A `tagnyilvantartas/removeMember`
  // action `reason='meghalt'` ágában mindkettőt csinálja — itt is meg kell.)
  //
  // Az `id_szemely`-re a meghalt+member_status frissítése (idempotens — szerkesztéskor
  // sem ártalmas, ha már true):
  try {
    await supabase
      .from('szemely')
      .update({ meghalt: true, member_status: 'elhunyt' })
      .eq('id', d.id_szemely)
      .eq('congregation_id', congId)
  } catch {
    // Ha a szemely-re nincs jogosultság vagy más hiba — a temetés-rögzítést NEM
    // blokkoljuk emiatt. A user explicit hibát látna a tag-frissítésről, de a
    // temetés már rögzítve van a temetes táblában.
  }

  // 2026-06-01 (hibrid család-modell Fázis 2): az új modell lezárása.
  // Halálozáskor:
  //   - a háztartás-tagság érvényes_ig dátumot kap (a tag már nem él itt)
  //   - a házastársi kapcsolat lezárul (özveggyé válik a másik fél)
  //   - a szülő-gyerek vér szerinti kapcsolatok ÉRINTETLENEK (a vér szerinti
  //     kötelék nem szűnik meg halállal — a leszármazottak anyakönyvi
  //     rekordjai továbbra is hivatkoznak rá)
  try {
    await supabase
      .from('haztartas_tag')
      .update({ ervenyes_ig: d.hdatum })
      .eq('id_szemely', d.id_szemely)
      .is('ervenyes_ig', null)
      .eq('congregation_id', congId)

    await supabase
      .from('szemely_kapcsolat')
      .update({ ervenyes_ig: d.hdatum })
      .eq('tipus', 'hazastars')
      .or(`id_szemely_1.eq.${d.id_szemely},id_szemely_2.eq.${d.id_szemely}`)
      .is('ervenyes_ig', null)
      .eq('congregation_id', congId)
  } catch (e) {
    console.warn('[saveBurial] hibrid-modell lezárás sikertelen (nem blokkoló):',
      e instanceof Error ? e.message : e)
  }

  revalidatePath('/anyakonyv')
  revalidatePath('/tagnyilvantartas')
  revalidatePath('/munkanaplo')
  return { success: true }
}

// ── Tagmozgás mentés (4 típus) ──────────────────────────────

export async function saveMovement(data: MovementInput) {
  const parsed = movementSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, congId } = await getCongregation()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const d = parsed.data
  const table = d.tipus
  const dateField = 'mikor'

  const profileKey = `movement_${d.tipus}` as EgyhaziProfileKey
  let egyhaziSzam = d.egyhazi_szam || null
  if (!d.id && !egyhaziSzam && d.datum) {
    const year = parseInt(d.datum.slice(0, 4)) || new Date().getFullYear()
    const { data: rpcData } = await supabase.rpc('generate_egyhazi_anyakonyvi_szam', {
      p_target_congregation_id: congId,
      p_profile_key: profileKey,
      p_year: year,
    })
    egyhaziSzam = rpcData ? String(rpcData) : null
  }

  const record: Record<string, unknown> = {
    id_szemely: d.id_szemely,
    [dateField]: d.datum,
    egyhazi_szam: egyhaziSzam,
    megjegyzes: d.megjegyzes || null,
    congregation_id: congId,
  }
  if (d.tipus === 'bekoltozott') { record.honnanid = d.helyid || null; record.igazolas = d.igazolas || null }
  if (d.tipus === 'elkoltozott') { record.hovaid = d.helyid || null; record.kulfoldre = d.kulfoldre || false; record.hova_congregation_id = d.hova_congregation_id || null }
  if (d.tipus === 'attert' || d.tipus === 'kitert') { record.felekezet = d.felekezet || null; if (d.tipus === 'attert') record.honnanid = d.helyid || null; else record.hovaid = d.helyid || null }
  if (d.id) { const { error } = await supabase.from(table).update(record).eq('id', d.id).eq('congregation_id', congId); if (error) return { error: `Hiba: ${error.message}` } }
  else { const { error } = await supabase.from(table).insert([record]); if (error) return { error: `Hiba: ${error.message}` } }
  revalidatePath('/anyakonyv')
  return { success: true }
}

// ── Konfirmáció batch mentés ─────────────────────────────────

export async function saveConfirmationBatch(data: ConfirmationBatchInput) {
  const parsed = confirmationBatchSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, congId } = await getCongregation()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const d = parsed.data

  // B4 javítás: szerver-oldali duplikáció védelem
  const { data: alreadyConfirmed } = await supabase.from('konfirmalas').select('id_szemely').eq('congregation_id', congId).in('id_szemely', d.candidates)
  const confirmedIds = new Set((alreadyConfirmed || []).map((r: { id_szemely: number }) => r.id_szemely))
  const newCandidates = d.candidates.filter(id => !confirmedIds.has(id))
  if (newCandidates.length === 0) return { error: 'Minden kiválasztott személy már konfirmálva van.' }

  // Egyházi anyakönyvi szám: minden új konfirmandus saját sorszámot kap
  // (gyülekezetenként + évenként újraszámolt). Az első RPC-hívás adja a
  // kezdősorszámot, utána a többit lokálisan inkrementáljuk, hogy ne
  // ütközhessenek párhuzamos hívásnál (a táblába még nincs beszúrva).
  const year = parseInt(d.datum.slice(0, 4)) || new Date().getFullYear()
  let firstSzam: string | null = null
  const { data: rpcStart } = await supabase.rpc('generate_egyhazi_anyakonyvi_szam', {
    p_target_congregation_id: congId,
    p_profile_key: 'confirmation',
    p_year: year,
  })
  firstSzam = rpcStart ? String(rpcStart) : null

  // Várt formátum: YYYY02NNNN — a sorszám az utolsó 4 karakter.
  const szamPrefix = firstSzam ? firstSzam.slice(0, 6) : `${year}02`
  const startSeq = firstSzam ? parseInt(firstSzam.slice(6)) || 1 : 1

  const records = newCandidates.map((id, i) => ({
    id_szemely: id,
    datum: d.datum,
    lelkeszneve: d.lelkeszneve || null,
    egyhazi_szam: `${szamPrefix}${String(startSeq + i).padStart(4, '0')}`,
    megjegyzes: d.megjegyzes || null,
    congregation_id: congId,
  }))
  const { error, data: insData } = await supabase.from('konfirmalas').insert(records).select('id')
  if (error) return { error: `Hiba: ${error.message}` }

  // Munkanapló-szinkron (2026-06-12, Endre #3-4): a teljes batch EGYETLEN
  // szolgálati alkalom — egy munkanapló-bejegyzés készül, és MINDEN beszúrt
  // konfirmalas sor `munkanaplo_id`-ja erre mutat. A markerhez az első sor
  // id-ját használjuk (két külön batch ugyanazon a napon így sem ütközik).
  // KORÁBBI BUG-OK: a jelenlet_osszesen NOT NULL miatt az insert némán
  // elbukott + a cim a már-konfirmáltakat is beleszámolta (candidates vs.
  // newCandidates).
  const insertedIds = ((insData || []) as { id: number }[]).map(r => r.id)
  if (d.munkanaploba && insertedIds.length > 0) {
    const names = await getSzemelyNames(supabase, newCandidates)
    const nameList = newCandidates.map(id => names.get(id) || `#${id}`).join(', ')
    const worklogId = await syncRegistryWorklogLink(supabase, congId, {
      sourceTable: 'konfirmalas',
      sourceId: insertedIds[0],
      currentWorklogId: null,
      munkanaploba: true,
      payload: {
        idopont: d.datum,
        jellege: 'Konfirmáció',
        cim: `Konfirmáció (${newCandidates.length} fő)`,
        szolgalt: d.lelkeszneve || null,
        megjegyzes: `Konfirmandusok: ${nameList}`,
      },
    })
    // A többi konfirmalas sor linkjének beállítása (az elsőét a sync írta)
    if (worklogId && insertedIds.length > 1) {
      const { error: linkErr } = await supabase.from('konfirmalas')
        .update({ munkanaplo_id: worklogId })
        .in('id', insertedIds.slice(1))
        .eq('congregation_id', congId)
      if (linkErr) console.warn('[saveConfirmationBatch] munkanaplo_id linkelés sikertelen:', linkErr.message)
    }
  }
  revalidatePath('/anyakonyv')
  revalidatePath('/munkanaplo')
  return { success: true, count: newCandidates.length }
}

// ── Konfirmáció EGYETLEN bejegyzés szerkesztés (✏️ gomb) ─────

export async function saveConfirmationSingle(data: ConfirmationSingleInput) {
  const parsed = confirmationSingleSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, congId } = await getCongregation()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const d = parsed.data

  const record = {
    id_szemely: d.id_szemely,
    datum: d.datum,
    egyhazi_szam: d.egyhazi_szam || null,
    lelkeszneve: d.lelkeszneve || null,
    megjegyzes: d.megjegyzes || null,
  }
  const { error } = await supabase.from('konfirmalas').update(record).eq('id', d.id).eq('congregation_id', congId)
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/anyakonyv')
  return { success: true }
}

// ── Bejegyzés törlés ─────────────────────────────────────────

// 2026-06-12 (Endre #3-4): storno/törléskor a kapcsolt munkanapló-bejegyzést
// is eltávolítjuk (soft-delete). DÖNTÉS: ha az anyakönyvi esemény törlődik, a
// belőle generált "elvégzett szolgálat" sor sem maradhat a naplóban — de a
// soft-delete miatt a DB-ben visszaállítható. Konfirmációnál a bejegyzés
// KÖZÖS (egy batch = egy alkalom), ezért csak akkor töröljük, ha már nincs
// más konfirmalas sor, ami rá hivatkozik.
const REGISTRY_TABLES_WITH_WORKLOG = ['keresztseg', 'hazassag', 'temetes', 'konfirmalas'] as const

export async function deleteRegistryEntry(tab: string, id: number) {
  const { supabase, congId } = await getCongregation()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }

  // A kapcsolt munkanapló-link kiolvasása MÉG a törlés előtt
  let linkedWorklogId: number | null = null
  const hasWorklogLink = (REGISTRY_TABLES_WITH_WORKLOG as readonly string[]).includes(tab)
  if (hasWorklogLink) {
    const { data } = await supabase.from(tab).select('munkanaplo_id')
      .eq('id', id).eq('congregation_id', congId).maybeSingle()
    linkedWorklogId = (data?.munkanaplo_id as number | null) ?? null
  }

  const { error } = await supabase.from(tab).delete().eq('id', id).eq('congregation_id', congId)
  if (error) return { error: `Hiba: ${error.message}` }

  if (linkedWorklogId) {
    let removable = true
    if (tab === 'konfirmalas') {
      const { data: remaining } = await supabase.from('konfirmalas').select('id')
        .eq('munkanaplo_id', linkedWorklogId).eq('congregation_id', congId).limit(1)
      removable = !remaining || remaining.length === 0
    }
    if (removable) {
      await softDeleteRegistryWorklog(supabase, congId, linkedWorklogId)
    }
  }

  revalidatePath('/anyakonyv')
  revalidatePath('/munkanaplo')
  return { success: true }
}
