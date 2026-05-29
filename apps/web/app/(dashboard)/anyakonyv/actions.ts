'use server'

import { revalidatePath } from 'next/cache'
import { baptismSchema, marriageSchema, burialSchema, movementSchema, confirmationBatchSchema, confirmationSingleSchema } from '@/lib/validations/registry'
import type { BaptismInput, MarriageInput, BurialInput, MovementInput, ConfirmationBatchInput, ConfirmationSingleInput } from '@/lib/validations/registry'
import type { RegistryEntry } from '@/lib/constants/registry'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

async function getCongregation() {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId }
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

  // ── 1) gyerek → csalad → id_ferfi + id_no
  const { data: gyerekRows, error: gyerekErr } = await supabase.from('gyerek')
    .select('id_csalad, csalad:csalad!id_csalad(id, id_ferfi, id_no, isaktiv)')
    .eq('id_szemely', personId).limit(1)

  if (gyerekErr) {
    console.error(`[getParentsForChild] gyerek lekérdezés hiba (id=${personId}):`, gyerekErr.message)
  }

  // Defensive: a Supabase a "to-one" embedded join-t néha array-ként,
  // néha object-ként adja vissza, a kapcsolati metaadatoktól függően.
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

  let ferfiId: number | null = csalad?.id_ferfi || null
  let noId: number | null = csalad?.id_no || null

  // ── 2) Fallback: szemely.id_apja / szemely.id_anyja CNP-k
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
    fromCsalad: !!csalad,
    apa, anya, anyaLeanyneve,
    apjaneveText, anyjaneveText,
    diagnostic,
  }
}

// ── Személy keresés ──────────────────────────────────────────

/**
 * 2026-05-30: Ellenőrzi, hogy két személy között létezik-e egyházi
 * házassági bejegyzés (a `hazassag` táblában). A keresztelői emléklapon
 * az anya nevét így formázzuk: ha igen, akkor „Kádár Zoltánné Tódor Enikő",
 * ha nem, akkor csak a leánykori név („Tódor Enikő").
 */
export async function getMarriageBetween(ferfiId: number, noId: number): Promise<boolean> {
  const { supabase, congId } = await getCongregation()
  if (!congId) return false
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

  let isInsert = false
  if (d.id) {
    const { error, data: updData, count } = await supabase
      .from('keresztseg')
      .update(record, { count: 'exact' })
      .eq('id', d.id)
      .eq('congregation_id', congId)
      .select('id')
    console.log('[saveBaptism] UPDATE eredmény:', { id: d.id, count, updData, error: error?.message })
    if (error) return { error: `Hiba: ${error.message}` }
    if (!count || count === 0) {
      console.error('[saveBaptism] ⚠️ UPDATE 0 sort érintett! id=', d.id, 'congId=', congId)
      return { error: `A bejegyzés nem található (id=${d.id}). Vagy törölve lett, vagy más gyülekezeté.` }
    }
  } else {
    isInsert = true
    const { error } = await supabase.from('keresztseg').insert([record]).select('id')
    if (error) return { error: `Hiba: ${error.message}` }
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

  if (d.id_apja_cnp || d.id_anyja_cnp) {
    await checkAndCreateFamily(supabase, d.id_szemely, d.id_apja_cnp || null, d.id_anyja_cnp || null)
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

  // Munkanapló — csak új kereszteléskor, hogy ne duplikáljunk.
  // A munkanaplo insert hibája NEM blokkolja a fő műveletet (keresztelő már mentve),
  // de a néma fail helyett warn-ra dobjuk a Railway/Vercel logba (DIAGNOSTICS P1-1).
  if (isInsert && d.munkanaploba) {
    try {
      await supabase.from('munkanaplo').insert([{
        idopont: d.datum, jellege: 'Keresztelő', cim: `Keresztelés: ${d.alapige || ''}`.trim(),
        congregation_id: congId,
      }])
    } catch (error) {
      console.warn(
        '[saveBaptism] munkanaplo insert sikertelen — keresztelő rögzítve, de a munkanaplo-log kimaradt:',
        error instanceof Error ? error.message : error,
      )
    }
  }

  revalidatePath('/anyakonyv')
  return { success: true }
}

// ── Család automatikus létrehozás ────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkAndCreateFamily(supabase: any, childId: number, fatherCnp: string | null, motherCnp: string | null) {
  let ferfiId: number | null = null
  let noId: number | null = null

  if (fatherCnp) {
    const { data } = await supabase.from('szemely').select('id, c_utcaid, c_szam').eq('cnp', fatherCnp).limit(1)
    if (data?.[0]) ferfiId = data[0].id
  }
  if (motherCnp) {
    const { data } = await supabase.from('szemely').select('id, c_utcaid, c_szam').eq('cnp', motherCnp).limit(1)
    if (data?.[0]) noId = data[0].id
  }

  if (!ferfiId && !noId) return

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

  // Gyerek regisztráció
  if (famId) {
    const { data: check } = await supabase.from('gyerek').select('id').eq('id_szemely', childId).eq('id_csalad', famId).limit(1)
    if (!check?.length) await supabase.from('gyerek').insert([{ id_csalad: famId, id_szemely: childId }])
  }
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
    megjegyzes: d.megjegyzes || null,
    congregation_id: congId,
  }
  if (d.id) { const { error } = await supabase.from('hazassag').update(record).eq('id', d.id).eq('congregation_id', congId); if (error) return { error: `Hiba: ${error.message}` } }
  else { const { error } = await supabase.from('hazassag').insert([record]); if (error) return { error: `Hiba: ${error.message}` } }
  revalidatePath('/anyakonyv')
  return { success: true }
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
  if (d.id) { const { error } = await supabase.from('temetes').update(record).eq('id', d.id).eq('congregation_id', congId); if (error) return { error: `Hiba: ${error.message}` } }
  else {
    const { error } = await supabase.from('temetes').insert([record])
    if (error) return { error: `Hiba: ${error.message}` }
    if (d.munkanaploba) {
      try {
        await supabase.from('munkanaplo').insert([{
          idopont: d.tdatum, jellege: 'Temetés', cim: 'Temetési szertartás', congregation_id: congId,
        }])
      } catch (error) {
        console.warn(
          '[saveBurial] munkanaplo insert sikertelen — temetés rögzítve, de a munkanaplo-log kimaradt:',
          error instanceof Error ? error.message : error,
        )
      }
    }
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

  revalidatePath('/anyakonyv')
  revalidatePath('/tagnyilvantartas')
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
  const { error } = await supabase.from('konfirmalas').insert(records)
  if (error) return { error: `Hiba: ${error.message}` }
  if (d.munkanaploba) {
    try {
      await supabase.from('munkanaplo').insert([{
        idopont: d.datum,
        jellege: 'Konfirmáció',
        cim: `Konfirmáció (${d.candidates.length} fő)`,
        congregation_id: congId,
      }])
    } catch (error) {
      console.warn(
        '[saveConfirmation] munkanaplo insert sikertelen — konfirmáció rögzítve, de a munkanaplo-log kimaradt:',
        error instanceof Error ? error.message : error,
      )
    }
  }
  revalidatePath('/anyakonyv')
  return { success: true, count: d.candidates.length }
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

export async function deleteRegistryEntry(tab: string, id: number) {
  const { supabase, congId } = await getCongregation()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const { error } = await supabase.from(tab).delete().eq('id', id).eq('congregation_id', congId)
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/anyakonyv')
  return { success: true }
}
