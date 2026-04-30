'use server'

import { revalidatePath } from 'next/cache'
import { baptismSchema, marriageSchema, burialSchema, movementSchema, confirmationBatchSchema } from '@/lib/validations/registry'
import type { BaptismInput, MarriageInput, BurialInput, MovementInput, ConfirmationBatchInput } from '@/lib/validations/registry'
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
      query = supabase.from('keresztseg').select('*, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum), adrlocality!helyid(name)')
      break
    case 'konfirmalas':
      query = supabase.from('konfirmalas').select('*, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum)')
      break
    case 'hazassag':
      query = supabase.from('hazassag').select('*, ferfi:szemely!id_ferfi(id, csaladnev, k_nev), no:szemely!id_no(id, csaladnev, k_nev)')
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

// ── Személy keresés ──────────────────────────────────────────

export async function searchMemberForRegistry(query: string, genderFilter?: boolean | null) {
  if (query.trim().length < 2) return []
  const { supabase, congId } = await getCongregation()
  if (!congId) return []
  const parts = query.trim().split(/\s+/)
  let q = supabase.from('szemely')
    .select('id, csaladnev, k_nev, ferfi, sz_datum, cnp, c_szam, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
    .eq('congregation_id', congId).eq('isvisible', true).eq('meghalt', false)

  if (genderFilter !== null && genderFilter !== undefined) q = q.eq('ferfi', genderFilter)
  if (parts.length === 1) q = q.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`)
  else q = q.ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`)

  const { data } = await q.limit(8)
  return data || []
}

// ── Keresztelés mentés ───────────────────────────────────────

export async function saveBaptism(data: BaptismInput) {
  const parsed = baptismSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, congId } = await getCongregation()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const d = parsed.data

  // Sablon JSON (anya leánykori, szülők vallása) → megjegyzes végéhez
  let megjegyzes = d.megjegyzes || ''
  const sablon: Record<string, string> = {}
  if (d.anya_leanyneve) sablon.anya_leanyneve = d.anya_leanyneve
  if (d.apa_vallas) sablon.apa_vallas = d.apa_vallas
  if (d.anya_vallas) sablon.anya_vallas = d.anya_vallas
  if (Object.keys(sablon).length > 0) megjegyzes = `${megjegyzes}|sablon:${JSON.stringify(sablon)}`

  const record: Record<string, unknown> = {
    id_szemely: d.id_szemely,
    datum: d.datum,
    okirat: d.okirat,
    helyid: d.helyid || null,
    lelkeszneve: d.lelkeszneve || null,
    keresztszulok: d.keresztszulok || null,
    alapige: d.alapige || null,
    megjegyzes: megjegyzes || null,
    munkanaploba: d.munkanaploba,
    congregation_id: congId,
  }

  if (d.id) {
    const { error } = await supabase.from('keresztseg').update(record).eq('id', d.id).eq('congregation_id', congId)
    if (error) return { error: `Hiba: ${error.message}` }
  } else {
    const { data: inserted, error } = await supabase.from('keresztseg').insert([record]).select('id')
    if (error) return { error: `Hiba: ${error.message}` }

    // Szülő összekötés a szemely táblában
    const szemelyUpdate: Record<string, unknown> = {}
    if (d.apjaneve) szemelyUpdate.apjaneve = d.apjaneve
    if (d.anyjaneve) szemelyUpdate.anyjaneve = d.anyjaneve
    if (d.id_apja_cnp) szemelyUpdate.id_apja = d.id_apja_cnp
    if (d.id_anyja_cnp) szemelyUpdate.id_anyja = d.id_anyja_cnp
    if (Object.keys(szemelyUpdate).length > 0) {
      await supabase.from('szemely').update(szemelyUpdate).eq('id', d.id_szemely)
    }

    // Automatikus család létrehozás
    if (d.id_apja_cnp || d.id_anyja_cnp) {
      await checkAndCreateFamily(supabase, d.id_szemely, d.id_apja_cnp || null, d.id_anyja_cnp || null)
    }

    // Munkanapló
    if (d.munkanaploba && inserted?.[0]) {
      try {
        await supabase.from('munkanaplo').insert([{
          idopont: d.datum, jellege: 'Keresztelő', cim: `Keresztelés: ${d.alapige || ''}`.trim(),
          congregation_id: congId,
        }])
      } catch { /* munkanaplo tábla nem létezik → skip */ }
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
  const record = { id_ferfi: d.id_ferfi, id_no: d.id_no, datum: d.datum, hlevel: d.hlevel, lelkeszneve: d.lelkeszneve || null, tanuk: d.tanuk || null, helyid: d.helyid || null, munkanaploba: d.munkanaploba ?? false, megjegyzes: d.megjegyzes || null, congregation_id: congId }
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
  const record = { id_szemely: d.id_szemely, hdatum: d.hdatum, tdatum: d.tdatum, hoka: d.hoka || null, hhelyid: d.hhelyid || null, thelyid: d.thelyid || null, lelkeszneve: d.lelkeszneve || null, munkanaploba: d.munkanaploba, megjegyzes: d.megjegyzes || null, congregation_id: congId }
  if (d.id) { const { error } = await supabase.from('temetes').update(record).eq('id', d.id).eq('congregation_id', congId); if (error) return { error: `Hiba: ${error.message}` } }
  else {
    const { error } = await supabase.from('temetes').insert([record])
    if (error) return { error: `Hiba: ${error.message}` }
    if (d.munkanaploba) { try { await supabase.from('munkanaplo').insert([{ idopont: d.tdatum, jellege: 'Temetés', cim: 'Temetési szertartás', congregation_id: congId }]) } catch {} }
  }
  revalidatePath('/anyakonyv')
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
  const record: Record<string, unknown> = { id_szemely: d.id_szemely, [dateField]: d.datum, megjegyzes: d.megjegyzes || null, congregation_id: congId }
  if (d.tipus === 'bekoltozott') { record.honnanid = d.helyid || null; record.igazolas = d.igazolas || null }
  if (d.tipus === 'elkoltozott') { record.hovaid = d.helyid || null; record.kulfoldre = d.kulfoldre || false }
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

  const records = newCandidates.map(id => ({ id_szemely: id, datum: d.datum, lelkeszneve: d.lelkeszneve || null, megjegyzes: d.megjegyzes || null, congregation_id: congId }))
  const { error } = await supabase.from('konfirmalas').insert(records)
  if (error) return { error: `Hiba: ${error.message}` }
  if (d.munkanaploba) { try { await supabase.from('munkanaplo').insert([{ idopont: d.datum, jellege: 'Konfirmáció', cim: `Konfirmáció (${d.candidates.length} fő)`, congregation_id: congId }]) } catch {} }
  revalidatePath('/anyakonyv')
  return { success: true, count: d.candidates.length }
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
