'use server'

/**
 * Iktató F8b — életút-adatgyűjtő a háromnyelvű életút-/családi igazoláshoz (B1).
 *
 * getEletutAdat(personId): a személy TELJES egyházi életútja kötegelt
 * lekérdezésekkel (szemely + keresztseg + konfirmalas + hazassag [mindkét
 * oldali!] + temetes + GYERMEKEK három úton + sírhely-lánc), PLUSZ
 * hiány-detektor: minden, az igazoláshoz kötelező, de üres mezőre
 * EletutHiany-bejegyzés PONTOS útmutatóval, hogy a rendszerben hová kell
 * bevezetni (nyomtatható TODO-lista a kiállítás előtti ellenőrző-lépéshez).
 * Terv-input: docs/project-tracking/KARTOTEKA-eletutigazolas-kutatas-2026-07-25.md
 *
 * ⚠️ NÉMA-ÜRES-LISTA HIBAOSZTÁLY: minden DB-hiba az `error` mezőben jön
 * vissza, SOHA nem nyelődik el üres eredménnyé (MEMORY:
 * szemely_nincs_elkoltozott_oszlop). Csak verifikált oszlopok / működő
 * lekérdezés-minták:
 *  - szemely sz_helyid + adrlocality!sz_helyid(name): registry-list-actions.ts:258,264
 *  - szemely.cnp: validation-actions.ts:51 + anyakonyv/actions.ts:428,698
 *  - keresztseg (datum, lelkeszneve, keresztszulok, egyhazi_szam, helyid-join):
 *    szemely-actions.ts:140 + anyakonyv/actions.ts:52
 *  - konfirmalas (datum, keresztelesideje, egyhazi_szam): szemely-actions.ts:144
 *  - hazassag kétoldali .or(id_ferfi.eq/id_no.eq): tagnyilvantartas/actions.ts:372
 *  - temetes + adrlocality!thelyid(name): anyakonyv/actions.ts:65,222
 *  - szemely_kapcsolat (szulo_gyermek): anyakonyv/actions.ts:372–379 (fordított irány)
 *  - csalad/gyerek: anyakonyv getParentsForChild + family-actions.ts:71–76,725
 *  - sirhelytemeto/sirhely/sirhelyelhunyt lánc: sirhelyek/actions.ts getPlots
 *
 * ⚠️ GYERMEK-KERESÉS: a szemely.id_apja / id_anyja NEM szemely.id-t, hanem
 * CNP-SZÖVEGET tárol (lib/constants/members.ts:112, anyakonyv/actions.ts:267,
 * 707 — „id_apja: d.id_apja_cnp")! Ezért a gyermekeket a getParentsForChild
 * bevált mintájának MEGFORDÍTÁSÁVAL, HÁROM úton gyűjtjük:
 *   1) ÚJ MODELL: szemely_kapcsolat (id_szemely_1 = szülő, tipus='szulo_gyermek',
 *      ver_szerinti=true, ervenyes_ig IS NULL),
 *   2) RÉGI MODELL: csalad (id_ferfi/id_no = személy) → gyerek → id_szemely,
 *   3) CNP-fallback: szemely-sorok, ahol id_apja/id_anyja = a személy CNP-je.
 * Egy `id_apja = personId` szűrés CNP-szöveg ellen NÉMÁN ÜRES listát adna —
 * pontosan a hibaosztály, amit ez a fájl kerül.
 */

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import type {
  EletutAdat,
  EletutGyermek,
  EletutHazassag,
  EletutHiany,
} from '@/lib/iktato/eletut-types'

/**
 * A személy teljes egyházi életútja + a kiállítás előtti hiány-TODO-lista.
 * Hiba esetén `error` — SOHA nem néma üres adat.
 */
export async function getEletutAdat(personId: number): Promise<{
  adat: EletutAdat | null
  hianyok: EletutHiany[]
  error: string | null
}> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { adat: null, hianyok: [], error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  if (!Number.isInteger(personId) || personId <= 0) {
    return { adat: null, hianyok: [], error: `Érvénytelen személy-azonosító: ${String(personId)}` }
  }

  // ── Sortípusok (PostgREST-beágyazás: objektum VAGY 1 elemű tömb) ──
  type NameRel = { name: string | null } | { name: string | null }[] | null
  type SzemelyRow = {
    id: number; csaladnev: string | null; k_nev: string | null; szcs_nev: string | null
    ferjk_nev: string | null; sz_datum: string | null; apjaneve: string | null
    anyjaneve: string | null; vallas: string | null; ferfi: boolean | null
    meghalt: boolean | null; cnp: string | null; szHely: NameRel
  }
  type KeresztRow = {
    id_szemely: number; datum: string | null; lelkeszneve: string | null
    keresztszulok: string | null; egyhazi_szam: string | null; hely: NameRel
  }
  type KonfirmRow = {
    id_szemely: number; datum: string | null; keresztelesideje: string | null
    egyhazi_szam: string | null
  }
  type HazassagRow = {
    id: number; id_ferfi: number | null; id_no: number | null; datum: string | null
    lelkeszneve: string | null; tanuk: string | null; egyhazi_szam: string | null
  }
  type TemetesRow = {
    id: number; id_szemely: number; hdatum: string | null; tdatum: string | null
    lelkeszneve: string | null; egyhazi_szam: string | null; thely: NameRel
  }

  // ── 1. köteg: a személy + saját anyakönyvi események + gyermek-linkek ──
  const [szemelyRes, keresztRes, konfirmRes, hazassagRes, temetesRes, kapcsolatRes, csaladRes] =
    await Promise.all([
      supabase
        .from('szemely')
        .select('id, csaladnev, k_nev, szcs_nev, ferjk_nev, sz_datum, apjaneve, anyjaneve, vallas, ferfi, meghalt, cnp, szHely:adrlocality!sz_helyid(name)')
        .eq('congregation_id', congId)
        .eq('id', personId)
        .maybeSingle(),
      supabase
        .from('keresztseg')
        .select('id_szemely, datum, lelkeszneve, keresztszulok, egyhazi_szam, hely:adrlocality!helyid(name)')
        .eq('congregation_id', congId)
        .eq('id_szemely', personId),
      supabase
        .from('konfirmalas')
        .select('id_szemely, datum, keresztelesideje, egyhazi_szam')
        .eq('congregation_id', congId)
        .eq('id_szemely', personId),
      supabase
        .from('hazassag')
        .select('id, id_ferfi, id_no, datum, lelkeszneve, tanuk, egyhazi_szam')
        .eq('congregation_id', congId)
        .or(`id_ferfi.eq.${personId},id_no.eq.${personId}`),
      supabase
        .from('temetes')
        .select('id, id_szemely, hdatum, tdatum, lelkeszneve, egyhazi_szam, thely:adrlocality!thelyid(name)')
        .eq('congregation_id', congId)
        .eq('id_szemely', personId),
      // Gyermekek 1) út — új modell: vér szerinti szülő→gyerek kapcsolatok.
      supabase
        .from('szemely_kapcsolat')
        .select('id_szemely_2')
        .eq('id_szemely_1', personId)
        .eq('tipus', 'szulo_gyermek')
        .eq('ver_szerinti', true)
        .is('ervenyes_ig', null)
        .eq('congregation_id', congId),
      // Gyermekek 2) út — régi modell: a személy családja(i). A csalad táblát
      // NEM szűrjük congregation_id-ra (nincs rá verifikált oszlop-használat
      // az appban — family-actions.ts:635 is szűrés nélkül kérdezi); az RLS +
      // a személy-szűrés véd.
      supabase
        .from('csalad')
        .select('id')
        .or(`id_ferfi.eq.${personId},id_no.eq.${personId}`),
    ])

  const koteg1Hibak = [
    szemelyRes.error ? `szemely: ${szemelyRes.error.message}` : null,
    keresztRes.error ? `keresztseg: ${keresztRes.error.message}` : null,
    konfirmRes.error ? `konfirmalas: ${konfirmRes.error.message}` : null,
    hazassagRes.error ? `hazassag: ${hazassagRes.error.message}` : null,
    temetesRes.error ? `temetes: ${temetesRes.error.message}` : null,
    kapcsolatRes.error ? `szemely_kapcsolat: ${kapcsolatRes.error.message}` : null,
    csaladRes.error ? `csalad: ${csaladRes.error.message}` : null,
  ].filter(Boolean)
  if (koteg1Hibak.length > 0) {
    return { adat: null, hianyok: [], error: `Az életút-adatok lekérése sikertelen — ${koteg1Hibak.join('; ')}` }
  }

  const sz = szemelyRes.data as unknown as SzemelyRow | null
  if (!sz) {
    return {
      adat: null,
      hianyok: [],
      error: `Nem található a személy a gyülekezetben (id=${personId}) — lehet, hogy időközben törölték.`,
    }
  }

  const keresztRow = ((keresztRes.data || []) as unknown as KeresztRow[])[0] || null
  const konfirmRow = ((konfirmRes.data || []) as KonfirmRow[])[0] || null
  const temetesRow = ((temetesRes.data || []) as unknown as TemetesRow[])[0] || null
  const hazassagok = ((hazassagRes.data || []) as HazassagRow[])
    .slice()
    .sort((a, b) => (a.datum || '').localeCompare(b.datum || ''))

  // ── 2. köteg: gyermek-ID-k feloldása (régi modell + CNP-fallback) ──
  const csaladIds = ((csaladRes.data || []) as Array<{ id: number }>).map((c) => c.id)
  const cnp = clean(sz.cnp)
  // Az .or() filterbe csak biztonságos (vessző/pont/zárójel nélküli) CNP mehet.
  const cnpBiztonsagos = /^[0-9A-Za-z-]+$/.test(cnp) ? cnp : ''

  const [gyerekRes, cnpGyerekRes] = await Promise.all([
    csaladIds.length > 0
      ? supabase.from('gyerek').select('id_szemely').in('id_csalad', csaladIds)
      : Promise.resolve({ data: [] as Array<{ id_szemely: number }>, error: null }),
    // Gyermekek 3) út — CNP-fallback: a régi adatformátumban a gyermek
    // szemely-sora a SZÜLŐ CNP-jét tárolja az id_apja/id_anyja mezőben.
    cnpBiztonsagos
      ? supabase
          .from('szemely')
          .select('id')
          .eq('congregation_id', congId)
          .or(`id_apja.eq.${cnpBiztonsagos},id_anyja.eq.${cnpBiztonsagos}`)
      : Promise.resolve({ data: [] as Array<{ id: number }>, error: null }),
  ])
  const koteg2Hibak = [
    gyerekRes.error ? `gyerek: ${gyerekRes.error.message}` : null,
    cnpGyerekRes.error ? `szemely (CNP-fallback): ${cnpGyerekRes.error.message}` : null,
  ].filter(Boolean)
  if (koteg2Hibak.length > 0) {
    return { adat: null, hianyok: [], error: `A gyermekek lekérése sikertelen — ${koteg2Hibak.join('; ')}` }
  }

  const gyermekIdSet = new Set<number>()
  for (const r of (kapcsolatRes.data || []) as Array<{ id_szemely_2: number | null }>) {
    if (r.id_szemely_2 != null) gyermekIdSet.add(r.id_szemely_2)
  }
  for (const r of (gyerekRes.data || []) as Array<{ id_szemely: number | null }>) {
    if (r.id_szemely != null) gyermekIdSet.add(r.id_szemely)
  }
  for (const r of (cnpGyerekRes.data || []) as Array<{ id: number }>) gyermekIdSet.add(r.id)
  gyermekIdSet.delete(personId) // adathiba-védelem: a személy nem gyermeke önmagának
  const gyermekIds = Array.from(gyermekIdSet)

  // A házastársak ID-i (a hazassag másik fele).
  const hazastarsIdSet = new Set<number>()
  for (const h of hazassagok) {
    const masikFel = h.id_ferfi === personId ? h.id_no : h.id_ferfi
    if (masikFel != null && masikFel !== personId) hazastarsIdSet.add(masikFel)
  }

  // ── 3. köteg: gyermek + házastárs szemely-sorok, gyermek-keresztelések,
  //             sírhely-hozzárendelés ──
  // A rokon szemely-sorokat congregation-szűrés NÉLKÜL kérjük (a bevált
  // házastárs-minta: szemely-actions.ts:210–213) — a linkek már gyülekezeti
  // körből jöttek, az RLS pedig amúgy is szűkít.
  const rokonIds = Array.from(new Set([...gyermekIds, ...hazastarsIdSet]))
  const [rokonRes, gyKeresztRes, gyKonfirmRes, sirElhunytRes] = await Promise.all([
    rokonIds.length > 0
      ? supabase.from('szemely').select('id, csaladnev, k_nev, sz_datum').in('id', rokonIds)
      : Promise.resolve({ data: [] as Array<{ id: number; csaladnev: string | null; k_nev: string | null; sz_datum: string | null }>, error: null }),
    gyermekIds.length > 0
      ? supabase
          .from('keresztseg')
          .select('id_szemely, datum, egyhazi_szam')
          .eq('congregation_id', congId)
          .in('id_szemely', gyermekIds)
      : Promise.resolve({ data: [] as Array<{ id_szemely: number; datum: string | null; egyhazi_szam: string | null }>, error: null }),
    // A gyermek keresztelési dátumának fallbackje a konfirmációs bejegyzés
    // keresztelesideje mezője (a régi anyakönyvek oda jegyezték fel) —
    // ugyanaz a minta, mint szemely-actions.ts getPersonCertificateData.
    gyermekIds.length > 0
      ? supabase
          .from('konfirmalas')
          .select('id_szemely, keresztelesideje')
          .eq('congregation_id', congId)
          .in('id_szemely', gyermekIds)
      : Promise.resolve({ data: [] as Array<{ id_szemely: number; keresztelesideje: string | null }>, error: null }),
    // Sírhely-lánc 1. lépcső: az elhunyt-hozzárendelés a temetési bejegyzéshez
    // (sirhelyelhunyt.temetesid — sirhelyek/actions.ts getPlots mintája).
    temetesRow
      ? supabase.from('sirhelyelhunyt').select('sirhelyid').eq('temetesid', temetesRow.id).eq('deleted', false)
      : Promise.resolve({ data: [] as Array<{ sirhelyid: number }>, error: null }),
  ])
  const koteg3Hibak = [
    rokonRes.error ? `szemely (rokonok): ${rokonRes.error.message}` : null,
    gyKeresztRes.error ? `keresztseg (gyermekek): ${gyKeresztRes.error.message}` : null,
    gyKonfirmRes.error ? `konfirmalas (gyermekek): ${gyKonfirmRes.error.message}` : null,
    sirElhunytRes.error ? `sirhelyelhunyt: ${sirElhunytRes.error.message}` : null,
  ].filter(Boolean)
  if (koteg3Hibak.length > 0) {
    return { adat: null, hianyok: [], error: `A családi/sírhely-adatok lekérése sikertelen — ${koteg3Hibak.join('; ')}` }
  }

  type RokonRow = { id: number; csaladnev: string | null; k_nev: string | null; sz_datum: string | null }
  const rokonById = new Map<number, RokonRow>()
  for (const r of (rokonRes.data || []) as RokonRow[]) rokonById.set(r.id, r)

  const gyKeresztByPerson = new Map<number, { datum: string | null; egyhazi_szam: string | null }>()
  for (const k of (gyKeresztRes.data || []) as Array<{ id_szemely: number; datum: string | null; egyhazi_szam: string | null }>) {
    if (!gyKeresztByPerson.has(k.id_szemely)) gyKeresztByPerson.set(k.id_szemely, k)
  }
  const gyKonfirmByPerson = new Map<number, string | null>()
  for (const f of (gyKonfirmRes.data || []) as Array<{ id_szemely: number; keresztelesideje: string | null }>) {
    if (!gyKonfirmByPerson.has(f.id_szemely)) gyKonfirmByPerson.set(f.id_szemely, f.keresztelesideje)
  }

  // ── 4. köteg: sírhely-lánc 2–3. lépcső (sirhely → sirhelytemeto) ──
  // A sirhely/sirhelyelhunyt tábláknak NINCS congregation_id oszlopuk — a
  // gyülekezeti kör a temető-FK-n keresztül záródik (sirhelyek/actions.ts).
  let sirhelySzoveg: string | null = null
  const sirhelyIds = Array.from(
    new Set(((sirElhunytRes.data || []) as Array<{ sirhelyid: number | null }>)
      .map((r) => r.sirhelyid)
      .filter((n): n is number => n != null)),
  )
  if (sirhelyIds.length > 0) {
    const { data: sirhelyRows, error: sirhelyErr } = await supabase
      .from('sirhely')
      .select('id, temetoid, parcella, sor, szam')
      .in('id', sirhelyIds)
      .eq('deleted', false)
    if (sirhelyErr) {
      return { adat: null, hianyok: [], error: `A sírhely lekérése sikertelen — sirhely: ${sirhelyErr.message}` }
    }
    type SirhelyRow = { id: number; temetoid: number | null; parcella: string | null; sor: number | null; szam: string | null }
    const sirhelyek = (sirhelyRows || []) as SirhelyRow[]
    const temetoIds = Array.from(new Set(sirhelyek.map((s) => s.temetoid).filter((n): n is number => n != null)))
    const temetoNevById = new Map<number, string>()
    if (temetoIds.length > 0) {
      const { data: temetoRows, error: temetoErr } = await supabase
        .from('sirhelytemeto')
        .select('id, nev')
        .in('id', temetoIds)
        .eq('congregation_id', congId)
        .eq('deleted', false)
      if (temetoErr) {
        return { adat: null, hianyok: [], error: `A temető lekérése sikertelen — sirhelytemeto: ${temetoErr.message}` }
      }
      for (const t of (temetoRows || []) as Array<{ id: number; nev: string | null }>) {
        temetoNevById.set(t.id, clean(t.nev))
      }
    }
    // Az első olyan sírhely, amelynek temetője a saját gyülekezetünké.
    for (const s of sirhelyek) {
      const temetoNev = s.temetoid != null ? temetoNevById.get(s.temetoid) : undefined
      if (temetoNev === undefined) continue
      const darabok = [
        temetoNev || null,
        clean(s.parcella) ? `${clean(s.parcella)} parcella` : null,
        s.sor != null ? `${s.sor}. sor` : null,
        clean(s.szam) ? `${clean(s.szam)}. sírhely` : null,
      ].filter(Boolean)
      if (darabok.length > 0) {
        sirhelySzoveg = darabok.join(', ')
        break
      }
    }
  }

  // ── Összeállítás ──
  const one = (v: NameRel): string | null => {
    const row = Array.isArray(v) ? v[0] || null : v
    return clean(row?.name ?? null) || null
  }

  const elhunyt = sz.meghalt === true || temetesRow != null

  // Keresztelés: a keresztseg-sor az elsődleges; sor híján a konfirmalas
  // keresztelesideje mezője adja a dátumot (bejegyzés-hiányként jelezve).
  const keresztelesFallbackDatum = !keresztRow ? konfirmRow?.keresztelesideje || null : null
  const kereszteles = keresztRow
    ? {
        datum: keresztRow.datum || null,
        hely: one(keresztRow.hely),
        lelkesz: clean(keresztRow.lelkeszneve) || null,
        keresztszulok: clean(keresztRow.keresztszulok) || null,
        anyakonyviSzam: clean(keresztRow.egyhazi_szam) || null,
      }
    : keresztelesFallbackDatum
      ? { datum: keresztelesFallbackDatum, hely: null, lelkesz: null, keresztszulok: null, anyakonyviSzam: null }
      : null

  const hazassagokAdat: EletutHazassag[] = hazassagok.map((h) => {
    const masikFel = h.id_ferfi === personId ? h.id_no : h.id_ferfi
    const rokon = masikFel != null ? rokonById.get(masikFel) : undefined
    return {
      datum: h.datum || null,
      hazastarsNev: rokon ? joinName(rokon.csaladnev, rokon.k_nev) || null : null,
      tanuk: clean(h.tanuk) || null,
      anyakonyviSzam: clean(h.egyhazi_szam) || null,
    }
  })

  // Gyermekek — belső listán az id-t is visszük a hiány-TODO azonosítóihoz.
  const gyermekekBelso = gyermekIds
    .map((id) => {
      const r = rokonById.get(id)
      const k = gyKeresztByPerson.get(id)
      return {
        id,
        nev: r ? joinName(r.csaladnev, r.k_nev) : '',
        szuletesiDatum: r?.sz_datum || null,
        keresztelesDatum: k?.datum || gyKonfirmByPerson.get(id) || null,
        anyakonyviSzam: clean(k?.egyhazi_szam ?? null) || null,
      }
    })
    .sort(
      (a, b) =>
        (a.szuletesiDatum || '9999').localeCompare(b.szuletesiDatum || '9999') ||
        a.nev.localeCompare(b.nev, 'hu'),
    )

  const adat: EletutAdat = {
    szemely: {
      teljesNev: joinName(sz.csaladnev, sz.k_nev),
      szuletesiNev: clean(sz.szcs_nev) || null,
      szuletesiDatum: sz.sz_datum || null,
      szuletesiHely: one(sz.szHely),
      apjaNeve: clean(sz.apjaneve) || null,
      anyjaNeve: clean(sz.anyjaneve) || null,
      vallas: clean(sz.vallas) || null,
      elhunyt,
    },
    kereszteles,
    konfirmacio: konfirmRow
      ? { datum: konfirmRow.datum || null, anyakonyviSzam: clean(konfirmRow.egyhazi_szam) || null }
      : null,
    hazassagok: hazassagokAdat,
    gyermekek: gyermekekBelso.map<EletutGyermek>(({ nev, szuletesiDatum, keresztelesDatum, anyakonyviSzam }) => ({
      nev, szuletesiDatum, keresztelesDatum, anyakonyviSzam,
    })),
    elhalalozas: temetesRow
      ? {
          halalDatum: temetesRow.hdatum || null,
          temetesDatum: temetesRow.tdatum || null,
          lelkesz: clean(temetesRow.lelkeszneve) || null,
          temetoHely: one(temetesRow.thely),
          anyakonyviSzam: clean(temetesRow.egyhazi_szam) || null,
        }
      : null,
    sirhely: sirhelySzoveg,
  }

  // ── Hiány-detektor: az igazoláshoz KÖTELEZŐ, de üres mezők TODO-listája ──
  // (Kötelező elemek a kutatási jelentés „Kötelező vs. opcionális" szakasza
  // szerint; a keresztszülők/tanúk „Óvatosan" besorolásúak → nem hiányok.)
  const hianyok: EletutHiany[] = []
  const hiany = (mezoId: string, cimke: string, hovaVezesse: string) =>
    hianyok.push({ mezoId, cimke, hovaVezesse })
  const tagSzerkesztes = 'Tagnyilvántartás → a személy megnyitása → Szerkesztés'

  // A) Személy-törzsadatok
  if (!adat.szemely.teljesNev)
    hiany('szemely.nev', 'A személy teljes neve', `${tagSzerkesztes} → „Családnév" és „Keresztnév" mezők`)
  if (!adat.szemely.szuletesiDatum)
    hiany('szemely.sz_datum', 'Születési dátum', `${tagSzerkesztes} → „Születési dátum" mező`)
  if (!adat.szemely.szuletesiHely)
    hiany('szemely.sz_hely', 'Születési hely', `${tagSzerkesztes} → „Születési hely" mező`)
  if (!adat.szemely.apjaNeve)
    hiany('szemely.apjaneve', 'Apja neve', `${tagSzerkesztes} → „Apja neve" mező`)
  if (!adat.szemely.anyjaNeve)
    hiany('szemely.anyjaneve', 'Anyja neve', `${tagSzerkesztes} → „Anyja neve" mező`)

  // B) Keresztelés
  if (!keresztRow) {
    hiany(
      'kereszteles.bejegyzes',
      'Keresztelési anyakönyvi bejegyzés',
      'Anyakönyv → Kereszteltek fül → „Keresztelés rögzítése" gomb' +
        (keresztelesFallbackDatum
          ? ' (a dátum a konfirmációs bejegyzésből pótolható, de a teljes keresztelési bejegyzés hiányzik)'
          : ''),
    )
  } else {
    if (!adat.kereszteles?.datum)
      hiany('kereszteles.datum', 'Keresztelés dátuma', 'Anyakönyv → Kereszteltek fül → a személy sora → „Dátum" mező')
    if (!adat.kereszteles?.hely)
      hiany('kereszteles.hely', 'Keresztelés helye', 'Anyakönyv → Kereszteltek fül → a személy sora → helység mező')
    if (!adat.kereszteles?.lelkesz)
      hiany('kereszteles.lelkesz', 'Keresztelő lelkész neve', 'Anyakönyv → Kereszteltek fül → a személy sora → „Lelkész neve" mező')
    if (!adat.kereszteles?.anyakonyviSzam)
      hiany('kereszteles.egyhazi_szam', 'Keresztelés anyakönyvi száma (kötet/folyószám)', 'Anyakönyv → Kereszteltek fül → a személy sora → „Egyházi szám" mező')
  }

  // B) Konfirmáció (feltételes: ha a személy nem konfirmált, a tétel kihagyható)
  if (!konfirmRow) {
    hiany(
      'konfirmacio.bejegyzes',
      'Konfirmációi anyakönyvi bejegyzés',
      'Anyakönyv → Konfirmáltak fül → „Konfirmandusok rögzítése" gomb (ha a személy konfirmált — egyébként a tétel az igazolásból kimarad)',
    )
  } else {
    if (!adat.konfirmacio?.datum)
      hiany('konfirmacio.datum', 'Konfirmáció dátuma', 'Anyakönyv → Konfirmáltak fül → a személy sora → „Dátum" mező')
    if (!adat.konfirmacio?.anyakonyviSzam)
      hiany('konfirmacio.egyhazi_szam', 'Konfirmáció anyakönyvi száma', 'Anyakönyv → Konfirmáltak fül → a személy sora → „Egyházi szám" mező')
  }

  // B) Házasságok (a házasság HIÁNYA nem hiba — nőtlen/hajadon állapot)
  adat.hazassagok.forEach((h, i) => {
    const sorszam = adat.hazassagok.length > 1 ? `${i + 1}. házasság` : 'Házasság'
    if (!h.datum)
      hiany(`hazassag.${i}.datum`, `${sorszam} — dátum`, 'Anyakönyv → Házasultak fül → a pár sora → „Dátum" mező')
    if (!h.hazastarsNev)
      hiany(
        `hazassag.${i}.hazastars`,
        `${sorszam} — a házastárs neve`,
        'Anyakönyv → Házasultak fül → a bejegyzés megnyitása → a házastárs (férj/feleség) hozzárendelése a tagnyilvántartásból',
      )
    if (!h.anyakonyviSzam)
      hiany(`hazassag.${i}.egyhazi_szam`, `${sorszam} — anyakönyvi szám`, 'Anyakönyv → Házasultak fül → a pár sora → „Egyházi szám" mező')
  })

  // C) Gyermekek keresztelési adatokkal (gyermek hiánya nem hiba)
  for (const gy of gyermekekBelso) {
    const nev = gy.nev || `ismeretlen nevű gyermek (id=${gy.id})`
    if (!gy.szuletesiDatum)
      hiany(`gyermek.${gy.id}.sz_datum`, `Gyermek (${nev}) — születési dátum`, 'Tagnyilvántartás → a gyermek megnyitása → Szerkesztés → „Születési dátum" mező')
    if (!gy.keresztelesDatum)
      hiany(`gyermek.${gy.id}.kereszteles_datum`, `Gyermek (${nev}) — keresztelés dátuma`, 'Anyakönyv → Kereszteltek fül → „Keresztelés rögzítése" gomb (a gyermek keresztelésének bejegyzése)')
    if (!gy.anyakonyviSzam)
      hiany(`gyermek.${gy.id}.egyhazi_szam`, `Gyermek (${nev}) — keresztelés anyakönyvi száma`, 'Anyakönyv → Kereszteltek fül → a gyermek sora → „Egyházi szám" mező')
  }

  // D) Elhalálozás + nyughely (csak elhunytnál)
  if (elhunyt) {
    if (!temetesRow) {
      hiany(
        'elhalalozas.bejegyzes',
        'Temetési anyakönyvi bejegyzés',
        'Anyakönyv → Eltemetettek fül → „Haláleset rögzítése" gomb (a tag elhunytként szerepel a tagnyilvántartásban, de nincs temetési bejegyzés)',
      )
    } else {
      if (!adat.elhalalozas?.halalDatum)
        hiany('elhalalozas.hdatum', 'Halálozás dátuma', 'Anyakönyv → Eltemetettek fül → a személy sora → halálozás dátuma mező')
      if (!adat.elhalalozas?.temetesDatum)
        hiany('elhalalozas.tdatum', 'Temetés dátuma', 'Anyakönyv → Eltemetettek fül → a személy sora → temetés dátuma mező')
      if (!adat.elhalalozas?.lelkesz)
        hiany('elhalalozas.lelkesz', 'Szolgálatot végző lelkész', 'Anyakönyv → Eltemetettek fül → a személy sora → „Lelkész neve" mező')
      if (!adat.elhalalozas?.temetoHely)
        hiany('elhalalozas.temeto', 'Temetés helye (helység)', 'Anyakönyv → Eltemetettek fül → a személy sora → a temetés helysége mező')
      if (!adat.elhalalozas?.anyakonyviSzam)
        hiany('elhalalozas.egyhazi_szam', 'Temetés anyakönyvi száma', 'Anyakönyv → Eltemetettek fül → a személy sora → „Egyházi szám" mező')
    }
    if (!adat.sirhely)
      hiany(
        'sirhely',
        'Sírhely (temető, parcella, sor, szám)',
        'Sírhelyek → temető és sírhely felvétele, majd az elhunyt hozzárendelése a temetési bejegyzéshez — vagy az igazolás kiállításakor kézzel adható meg (az igazoláshoz nincs kötelező strukturált sírhely-mező).',
      )
  }

  return { adat, hianyok, error: null }
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
