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

import { selectAllPaged } from '@kartoteka/supabase-client'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
// 2026-08-15 (egyházmegyei szint, S4): a fejléc-adat MEGYEI módban a dioceses
// törzsadatból épül (az esperesi hivatal levelezik, nem egy gyülekezet) — a
// személy-keresés/anyakönyvi rész változatlanul gyülekezeti (a szemely tábla
// gyülekezeti), diocese-módban azok üresen térnek vissza.
// 2026-08-17 (kerületi S5): ugyanez a KERÜLETRE a districts törzsadatból (a
// püspöki hivatal levelezik) — a személy-keresés ott is üresen tér vissza.
import { getModuleScopeContext, type ModuleScope } from '@/lib/auth/module-scope'
import { personSearchScore, tokenize } from '@/lib/import/person-search-match'
import type {
  CertificatePersonHit,
  CongregationHeaderData,
  PersonCertData,
} from '@/lib/iktato/certificate-types'
import { gyulekezetNevMag, roUtcaElotag } from '@/lib/iktato/letterheads'

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
  // MÁSODIK VÉDVONAL — a két hatókör-rétegnek egyet kell mondania (lásd lent).
  const eltres = await hatokorEltres(congId, 'személy-kereső')
  if (eltres) return { results: [], error: eltres }

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
  // kereshetetlenné válnának. Bármely oldal hibája error-ként megy vissza —
  // SOHA nem néma üres lista.
  //
  // 2026-08-11 (5. kör, P3 #15): KÖZÖS `selectAllPaged`. A régi kézi ciklus a
  // `page.length < PAGE_SIZE` stop-feltételt használta, ami leszállított
  // szerver-plafonnál (Max Rows < 1000) az első lap után kilép — az irathoz
  // csatolható személyek fele „nem létezőként" tűnt volna el a keresőből.
  const { data: persons, error } = await selectAllPaged<PersonRow>(
    supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, szcs_nev, ferjk_nev, sz_datum, anyjaneve, meghalt')
      .eq('congregation_id', congId)
      .eq('isvisible', true),
  )
  if (error) return { results: [], error: `Keresési hiba: ${error.message}` }

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
  // MÁSODIK VÉDVONAL — a két hatókör-rétegnek egyet kell mondania (lásd lent).
  const eltres = await hatokorEltres(congId, 'anyakönyvi adatok')
  if (eltres) return { persons: [], error: eltres }

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
 *
 * 2026-07-25 (F8e): NÉV-ALAPÚ helység-feloldás, ha nincs adrlocality_id — lásd
 * a getCongregationHeader belsejében a részletes megjegyzést (a magyar
 * keltezésben élesben a román „Brateș" jelent meg „Barátos" helyett).
 */
export async function getCongregationHeader(): Promise<{
  header: CongregationHeaderData | null
  error: string | null
}> {
  const { supabase, congId } = await getCongId()
  if (!congId) {
    // ── 2026-08-15 (S4): MEGYEI fejléc a dioceses törzsadatból ──
    // Az esperesi hivatal iratain a megye hivatalos neve, címe, CIF-je és a
    // (később feltöltött) pecsét/aláírás képe megy — ugyanabba a
    // CongregationHeaderData alakba csomagolva, hogy a letterheads/nyomtatvány
    // réteg VÁLTOZATLANUL működjön (közös fogyasztó, nem másolat).
    //
    // ── 2026-08-17 (kerületi S5): a KERÜLET ugyanezt kapja a districts-ből ──
    // A `districts` oszlopkészletét az S2 a `dioceses` mintájára BETŰRE
    // ugyanígy vette fel (2026-08-16-egyhazkeruleti-S2-identitas.sql), ezért a
    // két ág egyetlen, tábla-paraméteres implementáció — nem másolat, ami
    // később széthúzhatna. A kapu `!== 'congregation'`, mert amit ez az ág
    // megkerül (adrlocality/adrstreet join, kétnyelvű cím, gyulekezetNevMag),
    // az a GYÜLEKEZETI szint sajátossága. A régi `=== 'diocese'` alakkal a
    // kerületi felhasználó a „Nincs bejelentkezett felhasználó vagy gyülekezet."
    // hibát kapta volna — vagyis egyetlen igazolást sem tudott volna kiállítani.
    const moduleScope = await getModuleScopeContext()
    if (!('error' in moduleScope) && moduleScope.scope !== 'congregation') {
      const torzs = felsoSzintTorzsadat(moduleScope.scope)
      const { data: sor, error: sorErr } = await moduleScope.supabase
        .from(torzs.tabla)
        .select('name, cif, adoszam, cim_telepules, cim_iranyitoszam, cim_utca, email, telefon, weboldal, cimer_url')
        .eq('id', moduleScope.scopeId)
        .maybeSingle()
      if (sorErr) return { header: null, error: `${torzs.szintNev} adatok lekérése sikertelen: ${sorErr.message}` }
      if (!sor) return { header: null, error: `${torzs.hianyzikUzenet}` }
      const d = sor as {
        name: string | null; cif: string | null; adoszam: string | null
        cim_telepules: string | null; cim_iranyitoszam: string | null; cim_utca: string | null
        email: string | null; telefon: string | null; weboldal: string | null; cimer_url: string | null
      }

      // Pecsét + aláírás — KÜLÖN, elnyelt hibájú lekérdezés (a gyülekezeti ág
      // mintája): amíg a pecset_url/alairas_url migráció nem futott le élesben,
      // a fejléc kép nélkül, hangtalanul működik tovább.
      let pecsetUrlFelso: string | null = null
      let alairasUrlFelso: string | null = null
      {
        const { data: kepRow, error: kepError } = await moduleScope.supabase
          .from(torzs.tabla)
          .select('pecset_url, alairas_url')
          .eq('id', moduleScope.scopeId)
          .maybeSingle()
        if (!kepError && kepRow) {
          const k = kepRow as { pecset_url: string | null; alairas_url: string | null }
          pecsetUrlFelso = clean(k.pecset_url) || null
          alairasUrlFelso = clean(k.alairas_url) || null
        }
      }

      const localityPart = [d.cim_iranyitoszam, d.cim_telepules].map(clean).filter(Boolean).join(' ')
      const cimHu = [localityPart, clean(d.cim_utca)].filter(Boolean).join(', ') || null
      const hivatalosNev = moduleScope.scopeName || clean(d.name)
      return {
        header: {
          hivatalosNev,
          nevHu: hivatalosNev || null,
          // ⚠️ A kétnyelvű (nev_ro/nev_en) fejléc-ág a S6 szelet feladata — a
          // megyei alak is null-t ad, és a kettőt EGYSZERRE kell bekapcsolni,
          // hogy a nyomtatvány két szinten se húzzon szét.
          nevRo: null,
          nevEn: null,
          cimHu,
          cimRo: null,
          helysegHu: clean(d.cim_telepules) || null,
          helysegRo: null,
          telefon: clean(d.telefon) || null,
          email: clean(d.email) || null,
          cif: clean(d.cif) || clean(d.adoszam) || null,
          web: clean(d.weboldal) || null,
          cimerUrl: clean(d.cimer_url) || null,
          pecsetUrl: pecsetUrlFelso,
          alairasUrl: alairasUrlFelso,
        },
        error: null,
      }
    }
    return { header: null, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  }

  // ── MÁSODIK VÉDVONAL a GYÜLEKEZETI fejléc-ágon ────────────────────────────
  // Idáig csak akkor jutunk, ha `congId` NEM null — vagyis a fenti felső szintű
  // (megyei / kerületi) ág BYTE-RA változatlan. Itt viszont kötelező egyeztetni:
  // a levélfej HIVATALOS IRAT tetejére kerül, és ha a két hatókör-réteg széthúz,
  // idegen egyházközség fejléce alá kerülnének a saját anyakönyvi adatok.
  const fejlecEltres = await fejlecHatokorEltres(congId)
  if (fejlecEltres) return { header: null, error: fejlecEltres }

  const { data, error } = await supabase
    .from('congregations')
    .select('name, nev_hu, nev_ro, nev_en, adoszam, cim, varos, iranyitoszam, hazszam, email, telefon, web, cimer_url, helyseg:adrlocality!adrlocality_id(name_hu, name_ro), utca:adrstreet!adrstreet_id(name_hu, name_ro)')
    .eq('id', congId)
    .maybeSingle()
  if (error) return { header: null, error: `Gyülekezeti adatok lekérése sikertelen: ${error.message}` }
  if (!data) return { header: null, error: 'A gyülekezet nem található.' }

  // ── Pecsét + aláírás kép (24. pont) — KÜLÖN, elnyelt hibájú lekérdezés ──
  // A pecset_url/alairas_url oszlopokat a 2026-08-15-iktato-pecset-alairas.sql
  // adja hozzá. SZÁNDÉKOSAN nem a fő selectben kérjük: amíg a migráció nem
  // futott le élesben (MEMORY: a migration-fájl NEM bizonyíték), a fő select
  // „column does not exist" hibával az EGÉSZ fejlécet (és vele a kiállítót)
  // vinné el. A képek opcionális díszítés → hiányzó oszlopnál némán null,
  // minden nyomtatvány a mai formájában marad.
  let pecsetUrlNyers: string | null = null
  let alairasUrlNyers: string | null = null
  {
    const { data: kepRow, error: kepError } = await supabase
      .from('congregations')
      .select('pecset_url, alairas_url')
      .eq('id', congId)
      .maybeSingle()
    if (!kepError && kepRow) {
      const k = kepRow as { pecset_url: string | null; alairas_url: string | null }
      pecsetUrlNyers = clean(k.pecset_url) || null
      alairasUrlNyers = clean(k.alairas_url) || null
    }
  }

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

  // ── Helység-nevek (magyar + román) ────────────────────────────────
  // Elsődleges forrás a strukturált hivatkozás (adrlocality_id join).
  let helysegNevHu = clean(helyseg?.name_hu ?? null)
  let helysegNevRo = clean(helyseg?.name_ro ?? null)

  // 2026-07-25 (F8e, user-észrevétel): ha a gyülekezetnél NINCS strukturált
  // helység-hivatkozás, eddig a szabad szöveges `varos` mező volt az EGYETLEN
  // forrás — az viszont sok gyülekezetnél a ROMÁN nevet tartalmazza, így a
  // MAGYAR keltezés-sorra is a román alak került („Brateș" a „Barátos" helyett).
  // Ilyenkor NÉV-ALAPÚ feloldással megkeressük a helységet az adrlocality
  // katalógusban (name_hu VAGY name_ro egyezés), és onnan vesszük a magyar és a
  // román nevet is. Determinizmus: .order('id') + limit 1 (azonos nevű
  // helységeknél is stabil, és a név-pár úgyis ugyanaz).
  // ⚠️ Ez csak MENTŐÖV: a VÉGLEGES megoldás, hogy a gyülekezet beállításaiban
  // (Gyülekezet → cím) ki legyen választva a strukturált helység — akkor ez az
  // ág fel sem merül, és az irányítószám/utca is a katalógusból jön.
  if (!helysegNevHu && !helysegNevRo) {
    const varosNev = clean(row.varos)
    // PostgREST or()-szűrő: az értéket idézőjelbe tesszük (szóköz/pont/vessző
    // miatt), és kiszedjük belőle a szűrő-szintaxist törő karaktereket.
    // A `%` WILDCARD-ként marad benne (lásd lent): a román vessző-alatti ș/ț
    // (U+0219/U+021B) és a cedillás ş/ţ (U+015F/U+0163) keveredése miatt az
    // EXAKT ilike gyakran nem talál — ezért az ékezetes betűket `_`-ra
    // cseréljük (egy karakter, bármi lehet).
    const q = varosNev.replace(/["\\%*(),]/g, '').trim()
    const qLaza = q.replace(/[^\x20-\x7E]/g, '_')
    if (q) {
      const { data: locRows, error: locError } = await supabase
        .from('adrlocality')
        .select('id, name_hu, name_ro')
        .or(`name_hu.ilike."${qLaza}",name_ro.ilike."${qLaza}"`)
        .order('id', { ascending: true })
        .limit(1)
      // Hiba esetén NEM hibázunk hangosan: a fejléc a régi (varos-alapú)
      // tartalékkal is helyes marad, csak nyelvhelyesség nélkül.
      if (!locError && locRows && locRows.length > 0) {
        const loc = locRows[0] as { name_hu: string | null; name_ro: string | null }
        helysegNevHu = clean(loc.name_hu)
        helysegNevRo = clean(loc.name_ro)
      }
    }
  }

  // 2026-07-25 (2. user-észrevétel ugyanerre): ha a katalógus-keresés sem
  // talált (nincs adrlocality-sor, vagy a diakritikák annyira eltérnek), a
  // gyülekezet NEVÉBŐL bontjuk ki a helységnevet — ez mindig rendelkezésre
  // áll és mindig a helyes nyelvű alakot adja:
  //   „Barátosi Református Egyházközség" → „Barátos"
  //   „Parohia Reformată Brateș"          → „Brateș"
  // (A gyulekezetNevMag a magyar „-i" képzőt is levágja; a német levélfej
  // ugyanezt a helper-t használja.)
  if (!helysegNevHu) helysegNevHu = clean(gyulekezetNevMag(row.nev_hu || row.name || ''))
  if (!helysegNevRo) helysegNevRo = clean(gyulekezetNevMag(row.nev_ro || ''))

  // Cím összerakása: "527045 Barátos, Fő út 45." — a helység-rész és az
  // utca-rész külön, vesszővel elválasztva; üres darabok kihagyva.
  // A magyar/román változat az adrlocality/adrstreet name_hu/name_ro mezőiből
  // jön (address-form minta); fallback a szabad szöveges varos/cim mezőkre.
  const buildCim = (helysegNev: string | null, utcaNev: string | null): string | null => {
    const localityPart = [row.iranyitoszam, helysegNev].map(clean).filter(Boolean).join(' ')
    const streetPart = [utcaNev, row.hazszam].map(clean).filter(Boolean).join(' ')
    return [localityPart, streetPart].filter(Boolean).join(', ') || null
  }
  // A cím helység-része is a (szükség esetén név-alapon feloldott) katalógus-
  // névből jön — így a fejléc magyar sora is „Barátos", nem „Brateș".
  const cimHu = buildCim(
    helysegNevHu || clean(row.varos),
    clean(utca?.name_hu ?? null) || clean(row.cim),
  )
  // Román cím csak akkor, ha van legalább egy VALÓDI román elem és eltér a
  // magyar sortól — különben a fejléc egyetlen közös cím-sort ír.
  // 2026-07 (F8c): a VALÓDI román utcanév elé „str. " előtag kerül, ha még
  // nincs típus-megjelölése (roUtcaElotag) — a magyar sor érintetlen.
  const utcaRoNev = clean(utca?.name_ro ?? null)
  const cimRoJelolt = buildCim(
    helysegNevRo || clean(row.varos),
    utcaRoNev ? roUtcaElotag(utcaRoNev) : clean(row.cim),
  )
  const vanRomanElem = Boolean(helysegNevRo || utcaRoNev)
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
      // F8e: a nevek szükség esetén NÉV-ALAPON feloldva az adrlocality-ból.
      helysegHu: helysegNevHu || clean(row.varos) || null,
      helysegRo: helysegNevRo || null,
      telefon: clean(row.telefon) || null,
      email: clean(row.email) || null,
      cif: clean(row.adoszam) || null,
      web: clean(row.web) || null,
      cimerUrl: clean(row.cimer_url) || null,
      pecsetUrl: pecsetUrlNyers,
      alairasUrl: alairasUrlNyers,
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

/**
 * ── MÁSODIK VÉDVONAL: A KÉT HATÓKÖR-RÉTEGNEK EGYET KELL MONDANIA ──────────
 * (a `leltar/actions.ts` `finalizeLeltar()` 2026-08-17-es mintája szerint)
 *
 * MELYIK KÉT FELOLDÓ HÚZHAT SZÉT. Ebben a fájlban MIND A KETTŐ ott van egymás
 * mellett: a személy-kereső és az anyakönyvi adatok a
 * `getEffectiveCongregationContext()`-ből (`getCongId()` fent), a fejléc felső
 * szintű ága viszont a `getModuleScopeContext()`-ből dolgozik — és ugyanabból
 * merít az Iktató modul összes többi akciója (`iktato/actions.ts`,
 * `template-actions.ts`, `csatolmany-actions.ts`, `qr-actions.ts`).
 *
 * MI LENNE A TÜNET. Az igazolás-kiállító EGY képernyő, de KÉT rétegből épül: a
 * FEJLÉC a module-scope-ból, a SZEMÉLY-ADAT innen. Széthúzásnál a nyomtatvány
 * egyik fele az egyik, másik fele a másik hatókörből származna — idegen
 * egyházközség levélfeje alatt a mi tagunk keresztelési adataival. Ez
 * VISSZAMENŐLEG JAVÍTHATATLAN: a kiállított és iktatott igazolás papíron is
 * kimegy. A kereső ráadásul NÉMÁN üres listát adna (idegen hatókörben 0 tag), és
 * a lelkész a saját tagnyilvántartását hinné üresnek.
 *
 * A GYÖKÉROK MA MÁR ZÁRVA: a 2026-08-17-es override-elsőbbségi kapu
 * (`lib/auth/finance-scope.ts` és `lib/auth/module-scope.ts` 0) blokkja) a
 * kerületi admin „Belépés a gyülekezetbe" esetét javítja, ezért a két réteg ma
 * BIZONYÍTOTTAN egyet mond. Ez itt a második védvonal egy JÖVŐBELI
 * divergenciára — egyik kapu sem ír adatot.
 *
 * ⚠️ A GYÜLEKEZETI (ÉS A MEGYEI) ÚT VISELKEDÉSE VÁLTOZATLAN — bizonyítás:
 *   · ha `congId` (= `effectiveCongregationId`) nem null, a
 *     `getModuleScopeContext()` 3) gyülekezeti fallbackje UGYANEZT az értéket
 *     adja, a 0) override-kapu pedig az `override.congregationId`-t, ami az
 *     `effective-access.ts:404-411` szerint UGYANAZ az érték;
 *   · a megyei / kerületi profilban álló felhasználónál `effectiveCongregationId`
 *     null (`effective-access.ts:412-414`), tehát a kereső/anyakönyv-akciókban a
 *     `!congId` ágon kapja a MAI, betűre változatlan üzenetet, a fejlécben pedig
 *     a MAI felső szintű (dioceses/districts) ágra fut — idáig el sem jut.
 *   ⇒ mindegyik kapu no-op a mai éles adaton; csak széthúzáskor szólal meg.
 */
async function hatokorEltres(congId: string, mit: string): Promise<string | null> {
  const modulCtx = await getModuleScopeContext()
  if ('error' in modulCtx) {
    return (
      'A hatókör (gyülekezet / egyházmegye / egyházkerület) most nem oldható fel, ezért biztonsági ' +
      `okból megszakítottuk a műveletet (${mit}). Frissítsd az oldalt, és próbáld újra; ha újra ` +
      'hibázik, jelezd a rendszergazdának.'
    )
  }
  if (modulCtx.scope !== 'congregation') {
    // ⚠️ SZÁNDÉKOSAN NEM KITERJESZTÉS: a tagnyilvántartás és az anyakönyv
    // TISZTÁN GYÜLEKEZETI fogalom (a `szemely` / `keresztseg` / `konfirmalas` /
    // `hazassag` táblák `congregation_id`-vel élnek, scope-oszlopuk nincs). A
    // megyei/kerületi kiterjesztés KÜLÖN döntés; addig a helyes védvonal a
    // SZINTET MEGNEVEZŐ elutasítás, nem a néma gyülekezeti visszaesés.
    // A szint-nevet a fenti, már meglévő EXHAUSTIVE leképezésből vesszük — nem
    // írunk mellé egy második, széthúzható switch-et.
    const szint = felsoSzintTorzsadat(modulCtx.scope).szintNev.toLowerCase()
    return (
      `A gyülekezeti tagnyilvántartás és anyakönyv ${szint} módban nincs értelmezve (az ` +
      'anyakönyveket az egyházközség vezeti), ezért nem futtattuk le a műveletet ' +
      `(${mit}). Válts gyülekezeti profilra — vagy ha „Belépés a gyülekezetbe" nézetben vagy, lépj ` +
      'ki belőle —, és ott állítsd ki az igazolást.'
    )
  }
  if (modulCtx.scopeId !== congId) {
    return (
      'A rendszer két különböző gyülekezetet lát ehhez a művelethez, ezért biztonsági okból ' +
      `megszakítottuk a műveletet (${mit}) — hivatalos igazolás nem készülhet bizonytalan ` +
      'hatókörből. Lépj ki a „Belépés a gyülekezetbe" nézetből vagy válts profilt, majd próbáld ' +
      'újra; ha újra hibázik, jelezd a rendszergazdának.'
    )
  }
  return null
}

/**
 * A fejléc-ág SAJÁT védvonala.
 *
 * ⚠️ MIÉRT KÜLÖN FÜGGVÉNY, ÉS MIÉRT MÁS A SZÖVEG: a levélfej — a keresővel és az
 * anyakönyvvel ELLENTÉTBEN — felső szinten IS értelmezett (a fenti ág a
 * dioceses/districts törzsadatból építi). Itt tehát nem az a baj, hogy „nincs
 * ilyen szint", hanem hogy A KÉT RÉTEG MÁST MOND: a hívó a gyülekezeti ágra
 * jutott (`congId` nem null), miközben a modul másik hatókörben dolgozik. Ilyenkor
 * NEM tippelünk (sem gyülekezeti, sem felső szintű fejlécet nem adunk), mert
 * mindkét választás rossz fejlécet nyomtathat egy HIVATALOS IRATRA — inkább
 * hangosan megállunk.
 */
async function fejlecHatokorEltres(congId: string): Promise<string | null> {
  const modulCtx = await getModuleScopeContext()
  if ('error' in modulCtx) {
    return (
      'A hatókör (gyülekezet / egyházmegye / egyházkerület) most nem oldható fel, ezért biztonsági ' +
      'okból NEM állítottuk össze a levélfejet (hivatalos irat fejléce nem épülhet bizonytalan ' +
      'hatókörből). Frissítsd az oldalt, és próbáld újra; ha újra hibázik, jelezd a ' +
      'rendszergazdának.'
    )
  }
  if (modulCtx.scope !== 'congregation') {
    const szint = felsoSzintTorzsadat(modulCtx.scope).szintNev.toLowerCase()
    return (
      `A rendszer két különböző hatókört lát: a levélfej a gyülekezeté lenne, miközben az Iktató ` +
      `${szint} módban dolgozik. Biztonsági okból NEM állítottuk össze a levélfejet — így nem ` +
      'kerülhet idegen fejléc hivatalos iratra. Lépj ki a „Belépés a gyülekezetbe" nézetből vagy ' +
      'válts profilt, majd próbáld újra; ha újra hibázik, jelezd a rendszergazdának.'
    )
  }
  if (modulCtx.scopeId !== congId) {
    return (
      'A rendszer két különböző gyülekezetet lát, ezért biztonsági okból NEM állítottuk össze a ' +
      'levélfejet (hivatalos irat fejléce nem épülhet bizonytalan hatókörből). Lépj ki a „Belépés a ' +
      'gyülekezetbe" nézetből vagy válts profilt, majd próbáld újra; ha újra hibázik, jelezd a ' +
      'rendszergazdának.'
    )
  }
  return null
}

/**
 * A FELSŐ SZINTŰ (megyei/kerületi) fejléc törzsadat-táblája és a hozzá tartozó
 * MAGYAR feliratok.
 *
 * ⚠️ A `szintNev` és a `hianyzikUzenet` a megyei ágban BETŰRE a 2026-08-15 óta
 * élő szöveg — a megyei felhasználó ugyanazt a hibaüzenetet látja, mint eddig.
 * A kerületi változat „az egyházkerülettől" beszél: egy megyei szövegű üzenet a
 * kerületi ügyintézőt ROSSZ hivatalhoz küldené.
 *
 * A `default: never` ág egy jövőbeli negyedik szintnél FORDÍTÁSI HIBÁT ad —
 * néma rossz-tábla-olvasás (idegen szint fejléce a hivatalos iraton) helyett.
 */
function felsoSzintTorzsadat(scope: ModuleScope): {
  tabla: 'dioceses' | 'districts'
  szintNev: string
  hianyzikUzenet: string
} {
  switch (scope) {
    case 'diocese':
      return {
        tabla: 'dioceses',
        szintNev: 'Egyházmegyei',
        hianyzikUzenet: 'Az egyházmegye nem található.',
      }
    case 'district':
      return {
        tabla: 'districts',
        szintNev: 'Egyházkerületi',
        hianyzikUzenet: 'Az egyházkerület nem található.',
      }
    case 'congregation':
      // Ide a hívó `!== 'congregation'` kapuja miatt nem jutunk el; ha valaki
      // egyszer mégis idehívja, HANGOS hibát kapjon.
      throw new Error('A gyülekezeti fejléc nem a felső szintű törzsadatból épül.')
    default: {
      const _nemKezelt: never = scope
      throw new Error(`Ismeretlen modul-hatókör: ${String(_nemKezelt)}`)
    }
  }
}

function joinName(csaladnev: string | null, kNev: string | null): string {
  return [csaladnev, kNev].map(clean).filter(Boolean).join(' ')
}

function clean(s: string | null | undefined): string {
  return (s || '').trim()
}
