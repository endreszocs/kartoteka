'use server'

/**
 * Iktató F6 — személy/anyakönyv-adat API az igazolás-kiállításhoz (KONTRAKTUS B).
 *
 *  - searchPersonsForCertificate: ékezet-toleráns név-kereső a saját gyülekezet
 *    szemely-tábláján (max 12 találat, elhunytak (†) jelöléssel).
 *  - getPersonCertificateData: a kiválasztott személyek (max ~4) anyakönyvi
 *    adatai kötegelt lekérdezésekkel (szemely + keresztseg + konfirmalas + hazassag).
 *  - getCongregationHeader: a gyülekezet hivatalos fejléc-adatai a
 *    letterheads.buildLetterheadHtml-hez.
 *
 * ⚠️ NÉMA-ÜRES-LISTA HIBAOSZTÁLY: minden DB-hiba az `error` mezőben jön vissza,
 * SOHA nem nyelődik el üres eredménnyé (lásd MEMORY: szemely_nincs_elkoltozott_oszlop).
 * Csak verifikált oszlopokra select-elünk (2026-07-11 éles diagnosztika +
 * meglévő app-lekérdezések: tagnyilvantartas/actions.ts, validation-actions.ts).
 */

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { personSearchScore, tokenize } from '@/lib/import/person-search-match'
import type {
  CertificatePersonHit,
  CongregationHeaderData,
  PersonCertData,
} from '@/lib/iktato/certificate-types'
import { roUtcaElotag } from '@/lib/iktato/letterheads'

// ─────────────────────────────────────────────────────────────────
// 1) Személy-kereső
// ─────────────────────────────────────────────────────────────────

/**
 * Név-keresés a saját gyülekezet tagjai közt az igazolás-kiállításhoz.
 *
 * A bevált registry-manual-search mintát követi: a gyülekezet látható tagjait
 * betöltjük, majd JS-ben szűrünk a `person-search-match` ékezet- és
 * pozíció-független illesztőjével — így a lánykori (szcs_nev) és férjezett
 * (ferjk_nev) név is találat, ékezet nélkül is. Max 12 találat.
 * Az elhunytakat NEM szűrjük ki (pl. régi keresztelési igazolás), csak jelöljük.
 */
export async function searchPersonsForCertificate(
  query: string,
): Promise<{ results: CertificatePersonHit[]; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { results: [], error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }

  const trimmed = (query || '').trim()
  if (trimmed.length < 2) return { results: [], error: null }
  const tokens = tokenize(trimmed)
  if (tokens.length === 0) return { results: [], error: null }

  type PersonRow = {
    id: number
    csaladnev: string | null
    k_nev: string | null
    szcs_nev: string | null
    ferjk_nev: string | null
    sz_datum: string | null
    anyjaneve: string | null
    meghalt: boolean | null
  }

  // A PostgREST alapértelmezetten legfeljebb 1000 sort ad vissza kérésenként —
  // egy nagy gyülekezet tagsága ezt túllépheti, és a limit feletti tagok némán
  // kereshetetlenné válnának. Ezért determinisztikus .order('id') mellett
  // 1000-es range-oldalakban lapozunk, amíg rövid oldal nem érkezik (a bevált
  // F4-minta: munkanaplo/actions.ts getWorklogs). Bármely oldal hibája
  // error-ként megy vissza — SOHA nem néma üres lista.
  const PAGE_SIZE = 1000
  const persons: PersonRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, szcs_nev, ferjk_nev, sz_datum, anyjaneve, meghalt')
      .eq('congregation_id', congId)
      .eq('isvisible', true)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) return { results: [], error: `Keresési hiba: ${error.message}` }
    const page = (data || []) as PersonRow[]
    persons.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  // JS-szűrés: MINDEN token szerepeljen a teljes néven (családi + kereszt +
  // lánykori + férjezett) — a pontozás a szó-eleji egyezést jutalmazza.
  const scored: Array<{ p: PersonRow; score: number }> = []
  for (const p of persons) {
    const score = personSearchScore(
      { nameParts: [p.csaladnev, p.k_nev, p.szcs_nev, p.ferjk_nev], addressParts: [] },
      tokens,
    )
    if (score === null) continue
    scored.push({ p, score })
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.p.csaladnev || '').localeCompare(b.p.csaladnev || '', 'hu') ||
      (a.p.k_nev || '').localeCompare(b.p.k_nev || '', 'hu'),
  )

  const results: CertificatePersonHit[] = scored.slice(0, 12).map(({ p }) => ({
    id: p.id,
    nev: `${joinName(p.csaladnev, p.k_nev)}${p.meghalt ? ' (†)' : ''}`,
    szuletesiDatum: p.sz_datum,
    anyjaNeve: p.anyjaneve,
  }))
  return { results, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 2) Anyakönyvi adatok a kiválasztott személyekhez
// ─────────────────────────────────────────────────────────────────

/**
 * A kiválasztott személyek (max ~4, pl. házaspár) igazolás-adatai.
 *
 * Kötegelt lekérdezések (`in()`), a bevett embedded-join mintával
 * (`adrlocality!helyid(name)` — lásd tagnyilvantartas/actions.ts:926).
 * A visszaadott tömb a `personIds` sorrendjét követi.
 */
export async function getPersonCertificateData(
  personIds: number[],
): Promise<{ persons: PersonCertData[]; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { persons: [], error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }

  const ids = Array.from(new Set((personIds || []).filter((n) => Number.isInteger(n))))
  if (ids.length === 0) return { persons: [], error: null }

  const idList = ids.join(',')
  const [szemelyRes, keresztRes, konfirmRes, hazassagRes] = await Promise.all([
    supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, sz_datum, apjaneve, anyjaneve, vallas, ferfi')
      .eq('congregation_id', congId)
      .in('id', ids),
    supabase
      .from('keresztseg')
      .select('id_szemely, datum, keresztszulok, hely:adrlocality!helyid(name)')
      .eq('congregation_id', congId)
      .in('id_szemely', ids),
    supabase
      .from('konfirmalas')
      .select('id_szemely, datum, keresztelesideje')
      .eq('congregation_id', congId)
      .in('id_szemely', ids),
    supabase
      .from('hazassag')
      .select('id, id_ferfi, id_no, datum')
      .eq('congregation_id', congId)
      .or(`id_ferfi.in.(${idList}),id_no.in.(${idList})`),
  ])

  // SOHA néma üres: bármelyik ág hibája az error mezőben jön vissza.
  const dbErrors = [
    szemelyRes.error ? `szemely: ${szemelyRes.error.message}` : null,
    keresztRes.error ? `keresztseg: ${keresztRes.error.message}` : null,
    konfirmRes.error ? `konfirmalas: ${konfirmRes.error.message}` : null,
    hazassagRes.error ? `hazassag: ${hazassagRes.error.message}` : null,
  ].filter(Boolean)
  if (dbErrors.length > 0) {
    return { persons: [], error: `Anyakönyvi adatok lekérése sikertelen — ${dbErrors.join('; ')}` }
  }

  type NameRel = { name: string | null } | { name: string | null }[] | null
  const one = (v: NameRel): string | null => {
    const row = Array.isArray(v) ? v[0] || null : v
    return row?.name || null
  }
  type SzemelyRow = {
    id: number; csaladnev: string | null; k_nev: string | null; sz_datum: string | null
    apjaneve: string | null; anyjaneve: string | null; vallas: string | null; ferfi: boolean | null
  }
  type KeresztRow = { id_szemely: number; datum: string | null; keresztszulok: string | null; hely: NameRel }
  type KonfirmRow = { id_szemely: number; datum: string | null; keresztelesideje: string | null }
  type HazassagRow = { id: number; id_ferfi: number | null; id_no: number | null; datum: string | null }

  const szemelyek = (szemelyRes.data || []) as SzemelyRow[]
  const keresztByPerson = new Map<number, KeresztRow>()
  for (const k of (keresztRes.data || []) as unknown as KeresztRow[]) {
    if (!keresztByPerson.has(k.id_szemely)) keresztByPerson.set(k.id_szemely, k)
  }
  const konfirmByPerson = new Map<number, KonfirmRow>()
  for (const f of (konfirmRes.data || []) as KonfirmRow[]) {
    if (!konfirmByPerson.has(f.id_szemely)) konfirmByPerson.set(f.id_szemely, f)
  }

  // Házasság: személyenként a LEGUTÓBBI (datum szerint) egyházi házasság.
  const marriageByPerson = new Map<number, HazassagRow>()
  const marriages = ((hazassagRes.data || []) as HazassagRow[])
    .slice()
    .sort((a, b) => (a.datum || '').localeCompare(b.datum || ''))
  for (const h of marriages) {
    // növekvő dátum-sorrendben felülírva → a végén a legutóbbi marad
    if (h.id_ferfi != null && ids.includes(h.id_ferfi)) marriageByPerson.set(h.id_ferfi, h)
    if (h.id_no != null && ids.includes(h.id_no)) marriageByPerson.set(h.id_no, h)
  }

  // A házastársak nevei — a kiválasztott halmazon kívüli feleket kötegelten kérjük le.
  const spouseIds = new Set<number>()
  for (const [personId, h] of marriageByPerson) {
    const otherId = h.id_ferfi === personId ? h.id_no : h.id_ferfi
    if (otherId != null) spouseIds.add(otherId)
  }
  const spouseNameById = new Map<number, string>()
  for (const s of szemelyek) spouseNameById.set(s.id, joinName(s.csaladnev, s.k_nev))
  const missingSpouseIds = Array.from(spouseIds).filter((id) => !spouseNameById.has(id))
  if (missingSpouseIds.length > 0) {
    const { data: spouseRows, error: spouseErr } = await supabase
      .from('szemely')
      .select('id, csaladnev, k_nev')
      .in('id', missingSpouseIds)
    if (spouseErr) {
      return { persons: [], error: `A házastárs adatainak lekérése sikertelen: ${spouseErr.message}` }
    }
    for (const s of (spouseRows || []) as Array<{ id: number; csaladnev: string | null; k_nev: string | null }>) {
      spouseNameById.set(s.id, joinName(s.csaladnev, s.k_nev))
    }
  }

  const szemelyById = new Map(szemelyek.map((s) => [s.id, s]))
  const missing = ids.filter((id) => !szemelyById.has(id))
  if (missing.length > 0) {
    return {
      persons: [],
      error: `Nem található a gyülekezetben a következő személy(ek): ${missing.join(', ')} — lehet, hogy időközben törölték.`,
    }
  }

  const persons: PersonCertData[] = ids.map((id) => {
    const s = szemelyById.get(id) as SzemelyRow
    const k = keresztByPerson.get(id) || null
    const f = konfirmByPerson.get(id) || null
    const h = marriageByPerson.get(id) || null
    const spouseId = h ? (h.id_ferfi === id ? h.id_no : h.id_ferfi) : null
    return {
      id,
      teljesNev: joinName(s.csaladnev, s.k_nev),
      szuletesiDatum: s.sz_datum,
      apjaNeve: s.apjaneve,
      anyjaNeve: s.anyjaneve,
      vallas: s.vallas,
      // keresztseg.datum az elsődleges; ennek híján a konfirmalas
      // keresztelesideje mezője (a régi anyakönyvek oda jegyezték fel).
      keresztelesDatum: k?.datum || f?.keresztelesideje || null,
      keresztszulok: k?.keresztszulok || null,
      keresztelesHelye: k ? one(k.hely) : null,
      konfirmalasDatum: f?.datum || null,
      hazassagDatum: h?.datum || null,
      hazastarsNev: spouseId != null ? spouseNameById.get(spouseId) || null : null,
      nem: s.ferfi === true ? 'ferfi' : s.ferfi === false ? 'no' : null,
    }
  })

  return { persons, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 3) Gyülekezeti fejléc-adatok
// ─────────────────────────────────────────────────────────────────

/**
 * A gyülekezet hivatalos fejléc-adatai a többnyelvű fejléchez
 * (letterheads.buildLetterheadHtml). A cím a strukturált mezőkből áll össze:
 * "{iranyitoszam} {varos}, {cim} {hazszam}" — a hiányzó darabok kimaradnak
 * (a getCongregationForSetup select-mintája szerint, congregation/actions.ts).
 *
 * 2026-07 (F8a): a háromnyelvű fejléchez a nev_hu/nev_ro/nev_en is lejön.
 * CSAK verifikált congregations-oszlopok (2026-07-25, Database_schema.sql +
 * élő app-selectek: welcome/actions.ts:293, congregation/actions.ts:1536).
 * A magyar ÉS román cím-változat az adrlocality/adrstreet name_hu/name_ro
 * oszlopaiból áll elő (adrlocality_id/adrstreet_id join — az address-form.tsx
 * bevált mintája); ha a strukturált hivatkozás hiányzik, a szabad szöveges
 * varos/cim mezők adják az EGY közös cím-sort (cimRo=null).
 */
export async function getCongregationHeader(): Promise<{
  header: CongregationHeaderData | null
  error: string | null
}> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { header: null, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }

  const { data, error } = await supabase
    .from('congregations')
    .select('name, nev_hu, nev_ro, nev_en, adoszam, cim, varos, iranyitoszam, hazszam, email, telefon, web, cimer_url, helyseg:adrlocality!adrlocality_id(name_hu, name_ro), utca:adrstreet!adrstreet_id(name_hu, name_ro)')
    .eq('id', congId)
    .maybeSingle()
  if (error) return { header: null, error: `Gyülekezeti adatok lekérése sikertelen: ${error.message}` }
  if (!data) return { header: null, error: 'A gyülekezet nem található.' }

  type NevPar = { name_hu: string | null; name_ro: string | null } | null
  const row = data as {
    name: string | null; nev_hu: string | null; nev_ro: string | null; nev_en: string | null
    adoszam: string | null
    cim: string | null; varos: string | null; iranyitoszam: string | null; hazszam: string | null
    email: string | null; telefon: string | null; web: string | null; cimer_url: string | null
    helyseg: NevPar | NevPar[]; utca: NevPar | NevPar[]
  }
  // A PostgREST a beágyazást objektumként vagy 1 elemű tömbként is adhatja.
  const one = (v: NevPar | NevPar[]): NevPar => (Array.isArray(v) ? v[0] ?? null : v)
  const helyseg = one(row.helyseg)
  const utca = one(row.utca)

  // Cím összerakása: "527045 Barátos, Fő út 45." — a helység-rész és az
  // utca-rész külön, vesszővel elválasztva; üres darabok kihagyva.
  // A magyar/román változat az adrlocality/adrstreet name_hu/name_ro mezőiből
  // jön (address-form minta); fallback a szabad szöveges varos/cim mezőkre.
  const buildCim = (helysegNev: string | null, utcaNev: string | null): string | null => {
    const localityPart = [row.iranyitoszam, helysegNev].map(clean).filter(Boolean).join(' ')
    const streetPart = [utcaNev, row.hazszam].map(clean).filter(Boolean).join(' ')
    return [localityPart, streetPart].filter(Boolean).join(', ') || null
  }
  const cimHu = buildCim(
    clean(helyseg?.name_hu ?? null) || clean(row.varos),
    clean(utca?.name_hu ?? null) || clean(row.cim),
  )
  // Román cím csak akkor, ha van legalább egy VALÓDI román elem és eltér a
  // magyar sortól — különben a fejléc egyetlen közös cím-sort ír.
  // 2026-07 (F8c): a VALÓDI román utcanév elé „str. " előtag kerül, ha még
  // nincs típus-megjelölése (roUtcaElotag) — a magyar sor érintetlen.
  const utcaRoNev = clean(utca?.name_ro ?? null)
  const cimRoJelolt = buildCim(
    clean(helyseg?.name_ro ?? null) || clean(row.varos),
    utcaRoNev ? roUtcaElotag(utcaRoNev) : clean(row.cim),
  )
  const vanRomanElem = Boolean(clean(helyseg?.name_ro ?? null) || utcaRoNev)
  const cimRo = vanRomanElem && cimRoJelolt && cimRoJelolt !== cimHu ? cimRoJelolt : null

  return {
    header: {
      hivatalosNev: clean(row.name) || clean(row.nev_hu) || '',
      nevHu: clean(row.nev_hu) || null,
      nevRo: clean(row.nev_ro) || null,
      nevEn: clean(row.nev_en) || null,
      cimHu,
      cimRo,
      // F8c: a keltezés-sor nyelvhelyes helység-neve (dokumentum-csaladok
      // keltezesSor) — magyar fallback a szabad szöveges varos mezőre.
      helysegHu: clean(helyseg?.name_hu ?? null) || clean(row.varos) || null,
      helysegRo: clean(helyseg?.name_ro ?? null) || null,
      telefon: clean(row.telefon) || null,
      email: clean(row.email) || null,
      cif: clean(row.adoszam) || null,
      web: clean(row.web) || null,
      cimerUrl: clean(row.cimer_url) || null,
    },
    error: null,
  }
}

// ─────────────────────────────────────────────────────────────────
// Belső segédek (nem exportáltak — 'use server' fájl csak async
// function-t exportálhat, lásd MEMORY: nextjs16_use_server_only_async)
// ─────────────────────────────────────────────────────────────────

async function getCongId() {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId }
}

function joinName(csaladnev: string | null, kNev: string | null): string {
  return [csaladnev, kNev].map(clean).filter(Boolean).join(' ')
}

function clean(s: string | null | undefined): string {
  return (s || '').trim()
}
