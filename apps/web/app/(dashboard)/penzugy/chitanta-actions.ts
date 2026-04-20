'use server'

/**
 * Chitanță (papír nyugta) server action-ök.
 *
 * A nyugta a felhasználó hivatalos nyugtatömbjéhez illeszkedő,
 * lokálisan generált, NEM Oblio-ra felmenő dokumentum.
 *
 * Adatmodell: `oblio_szamlak.tipus = 'chitanta_papir'`. Az `oblio_fiok_id`
 * NULL ilyenkor (nincs Oblio API-hívás).
 *
 * A számozás a `next_chitanta_number()` PL/pgSQL fügvény-rpc-vel
 * (concurrency-safe inkremental).
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

// ─────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────

export type ChitantaIssueInput = {
  /** Sorozat (pl. „EREKC24"). Ha üres, a config alapértelmezést használjuk. */
  sorozat?: string
  /** Ha megadod, ezt a számot használjuk; egyébként az RPC adja. */
  szam?: number
  /** Nyugta dátuma (YYYY-MM-DD). */
  szamlaDatum: string
  /** Átvevő (befizető) neve — kötelező. */
  klienesseg_nev: string
  /** Cím (opcionális — pl. "Brates"). */
  klienesseg_cim?: string
  /** CIF — cégnél, magánszemélynél üres. */
  klienesseg_cui?: string
  /** Bruttó összeg (RON). */
  osszeg_brut: number
  /** „reprezentând (címén)" — pl. "Egyházfenntartó járulék 2024-2026". */
  reprezentand?: string
  /** Kapcsolódó befizetés ID (ha van). */
  befizetes_id?: number
  /** Belső megjegyzés. */
  megjegyzes?: string
}

export type ChitantaRow = {
  id: string
  sorozat: string
  szam: number
  szamla_datum: string
  klienesseg_nev: string
  klienesseg_cui: string | null
  klienesseg_cim: string | null
  osszeg_brut: number
  reprezentand: string | null
  befizetes_id: number | null
  stornozott: boolean
  stornozott_indok: string | null
  megjegyzes: string | null
  issued_by: string | null
  created_at: string
}

// ─────────────────────────────────────────────────────────────
// Beállítás: a chitanță sorozat alapértelmezés
// ─────────────────────────────────────────────────────────────

export type ChitantaConfig = {
  sorozat: string | null
  kovetkezoSzam: number | null
}

export async function getChitantaConfig(): Promise<ChitantaConfig | { error: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data, error } = await access.supabase
    .from('oblio_fiokok')
    .select('chitanta_sorozat_default, chitanta_kovetkezo_szam')
    .eq('congregation_id', access.effectiveCongregationId)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { sorozat: null, kovetkezoSzam: null }

  return {
    sorozat: data.chitanta_sorozat_default ?? null,
    kovetkezoSzam: data.chitanta_kovetkezo_szam ?? 1,
  }
}

export async function saveChitantaConfig(input: {
  sorozat: string
  kovetkezoSzam: number
}): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const sorozat = (input.sorozat || '').trim()
  if (!sorozat) return { error: 'Adj meg sorozatnevet.' }
  if (!Number.isInteger(input.kovetkezoSzam) || input.kovetkezoSzam < 1) {
    return { error: 'A következő szám 1-nél nagyobb egész szám legyen.' }
  }

  // Felhasználói jogosultság: a lelkész vagy admin változtathatja
  const canEdit = access.role === 'lelkesz' || access.admin || access.egyhazkeruletiAdmin
  if (!canEdit) return { error: 'Nincs jogod a chitanță-tömb beállítását módosítani.' }

  // Upsert: ha még nincs oblio_fiokok rekord, létrehozunk egy minimálisat
  const { data: existing } = await access.supabase
    .from('oblio_fiokok')
    .select('id')
    .eq('congregation_id', access.effectiveCongregationId)
    .maybeSingle()

  if (existing) {
    const { error } = await access.supabase
      .from('oblio_fiokok')
      .update({
        chitanta_sorozat_default: sorozat,
        chitanta_kovetkezo_szam: input.kovetkezoSzam,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) return { error: error.message }
  } else {
    // Még nincs Oblio config, de a chitanță attól még működik. Nem hozunk
    // létre sort itt — a chitanță-config a lokális (oblio_fiokok-ban
    // tárolt) adatok közé tartozik, ezt majd az Oblio mentésnél kapjuk meg.
    // Helyette: jelezzük a felhasználónak, hogy előbb állítsa be az Oblio
    // kapcsolatot. (Ha akarjuk, később külön táblát csinálunk csak chitanță
    // beállításra.)
    return {
      error:
        'Előbb állítsd be az Oblio kapcsolatot (ott tároljuk a chitanță-tömb adatait is). Vagy hagyd üresen — a kiállításnál megadhatod kézzel.',
    }
  }

  revalidatePath('/penzugy')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// Automata kiállítás egy meglévő befizetéshez (gyors nyomtatáshoz)
// ─────────────────────────────────────────────────────────────

/**
 * Automatikus nyugta-kiállítás egy készpénzes befizetés alapján.
 * A kassza fülön a sor végi halvány nyomtató ikon kattintásakor hívódik:
 * a dialog helyett azonnal létrehozza a chitantát és visszaadja az ID-t
 * a közvetlen nyomtatáshoz.
 */
export async function autoIssueChitantaForBefizetes(
  befizetesId: number,
): Promise<{
  chitantaId?: string
  sorozat?: string
  nyomdaiSzam?: number
  gyulekezetiSzam?: number
  maradek?: number
  error?: string
  errorCode?: 'NO_ACTIVE_BLOCK' | string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  // 1. Befizetés adatainak lekérdezése
  const { data: befizetes, error: bErr } = await access.supabase
    .from('befizetes')
    .select('id, datum, osszeg, forrasa, fizetettev, id_szemely, id_csalad, id_befizetescel')
    .eq('id', befizetesId)
    .eq('congregation_id', access.effectiveCongregationId)
    .maybeSingle()

  if (bErr || !befizetes) return { error: 'A befizetés nem található.' }

  // 2. Befizető név + cím feloldás — szemely, csalad, vagy szabad szöveges forrás
  // FIGYELEM: a `szemely` táblában a cím FK-kon keresztül olvasható:
  //   c_helysegid → adrlocality.name (helység/város)
  //   c_utcaid    → adrstreet.name   (utca)
  //   c_szam      → házszám (plain text)
  let befizetoNev: string | null = null
  let befizetoCim: string | null = null
  if (befizetes.id_szemely) {
    const { data: sz } = await access.supabase
      .from('szemely')
      .select('csaladnev, k_nev, c_szam, adrlocality:c_helysegid(name), adrstreet:c_utcaid(name)')
      .eq('id', befizetes.id_szemely)
      .maybeSingle()
    if (sz) {
      befizetoNev = `${sz.csaladnev || ''} ${sz.k_nev || ''}`.trim()
      const loc = sz.adrlocality as { name?: string | null } | null
      const str = sz.adrstreet as { name?: string | null } | null
      const varos = loc?.name ?? null
      const utca = str?.name ?? null
      const hazszam = sz.c_szam ?? null
      const cimParts = [varos, utca, hazszam].filter(Boolean)
      if (cimParts.length > 0) befizetoCim = cimParts.join(', ')
    }
  }
  if (!befizetoNev && befizetes.id_csalad) {
    // Család esetén a családfő címét vesszük (ha van kapcsolt személy)
    const { data: cs } = await access.supabase
      .from('csalad')
      .select('csaladnev')
      .eq('id', befizetes.id_csalad)
      .maybeSingle()
    if (cs?.csaladnev) befizetoNev = String(cs.csaladnev) + ' család'
    // Család cím: az első kapcsolt személy (pl. családfő) címét vesszük
    const { data: csalaTag } = await access.supabase
      .from('szemely')
      .select('c_szam, adrlocality:c_helysegid(name), adrstreet:c_utcaid(name)')
      .eq('id_csalad', befizetes.id_csalad)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (csalaTag) {
      const loc = csalaTag.adrlocality as { name?: string | null } | null
      const str = csalaTag.adrstreet as { name?: string | null } | null
      const cimParts = [loc?.name, str?.name, csalaTag.c_szam].filter(Boolean)
      if (cimParts.length > 0) befizetoCim = cimParts.join(', ')
    }
  }
  if (!befizetoNev && typeof befizetes.forrasa === 'string') {
    befizetoNev = befizetes.forrasa.trim()
  }
  if (!befizetoNev) befizetoNev = 'Gyülekezeti tag'

  // 3. Számadási cél neve — a reprezentand mezőhöz (magyar + román)
  let reprezentand: string | undefined
  let reprezentandRo: string | undefined
  if (befizetes.id_befizetescel) {
    const { data: bc } = await access.supabase
      .from('befizetescel')
      .select('nev, nevro')
      .eq('id', befizetes.id_befizetescel)
      .maybeSingle()
    if (bc?.nev) reprezentand = String(bc.nev)
    if (bc?.nevro) reprezentandRo = String(bc.nevro)
  }

  // 4. Nyomdai + gyülekezeti szám lefoglalása az aktív tömbből (atomi RPC)
  const szamlaDatum = (befizetes.datum as string)?.split('T')[0] || new Date().toISOString().slice(0, 10)

  const { data: szamokRaw, error: rpcErr } = await access.supabase
    .rpc('next_chitanta_full', {
      p_congregation_id: access.effectiveCongregationId,
      p_szamla_datum: szamlaDatum,
    })

  if (rpcErr) {
    // Supabase hibát ad, ha az RPC RAISE EXCEPTION 'no_active_block'
    if (rpcErr.message?.includes('no_active_block')) {
      return {
        error: 'Még nincs aktív nyugtatömb. Kérlek rögzíts egy új tömböt a Nyugtatömbök panelen.',
        errorCode: 'NO_ACTIVE_BLOCK',
      }
    }
    return { error: `Szám-lefoglalási hiba: ${rpcErr.message}` }
  }

  const szamok = Array.isArray(szamokRaw) ? szamokRaw[0] : szamokRaw
  if (!szamok) {
    return { error: 'Nem sikerült lefoglalni a következő nyugtaszámot.', errorCode: 'NO_ACTIVE_BLOCK' }
  }

  const tombId: string = szamok.tomb_id
  const nyomdaiSzam: number = szamok.nyomdai_szam
  const gyulekezetiSzam: number = szamok.gyulekezeti_szam
  const sorozat: string = szamok.sorozat
  const maradek: number = szamok.maradek

  // 5. Insert az oblio_szamlak-ba
  const osszeg = Number(befizetes.osszeg) || 0
  const { data: inserted, error: insErr } = await access.supabase
    .from('oblio_szamlak')
    .insert({
      congregation_id: access.effectiveCongregationId,
      tipus: 'chitanta_papir',
      sorozat,
      szam: nyomdaiSzam, // backward-compat: a régi `szam` mező is a nyomdai számot tárolja
      nyomdai_szam: nyomdaiSzam,
      gyulekezeti_szam: gyulekezetiSzam,
      tomb_id: tombId,
      szamla_datum: szamlaDatum,
      klienesseg_nev: befizetoNev,
      klienesseg_cim: befizetoCim,
      osszeg_net: osszeg,
      osszeg_brut: osszeg,
      osszeg_tva: 0,
      reprezentand: reprezentand || null,
      reprezentand_ro: reprezentandRo || null,
      befizetes_id: befizetesId,
      issued_by: access.user.id,
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    return { error: `Hiba a nyugta mentésekor: ${insErr?.message || 'ismeretlen'}` }
  }

  return {
    chitantaId: inserted.id,
    sorozat,
    nyomdaiSzam,
    gyulekezetiSzam,
    maradek,
  }
}

// ─────────────────────────────────────────────────────────────
// Kiállítás
// ─────────────────────────────────────────────────────────────

export async function issueChitanta(input: ChitantaIssueInput): Promise<{
  success?: boolean
  chitantaId?: string
  sorozat?: string
  szam?: number
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const klienesseg_nev = (input.klienesseg_nev || '').trim()
  if (!klienesseg_nev) return { error: 'Az átvevő (befizető) neve kötelező.' }
  if (!input.osszeg_brut || input.osszeg_brut <= 0) {
    return { error: 'Az összeg pozitív szám legyen.' }
  }
  if (!input.szamlaDatum) return { error: 'Adj meg dátumot.' }

  // 1. Sorozat eldöntése
  const cfg = await getChitantaConfig()
  if ('error' in cfg) return { error: cfg.error }
  const sorozat = (input.sorozat || cfg.sorozat || 'CHIT').trim()

  // 2. Szám lefoglalása — RPC ha nincs felülírva
  let szam = input.szam
  if (!szam) {
    const { data, error } = await access.supabase
      .rpc('next_chitanta_number', {
        p_congregation_id: access.effectiveCongregationId,
        p_sorozat: sorozat,
      })
    if (error) return { error: `Szám-lefoglalási hiba: ${error.message}` }
    szam = Number(data)
  }

  // 3. Insert
  const { data: inserted, error: insErr } = await access.supabase
    .from('oblio_szamlak')
    .insert({
      congregation_id: access.effectiveCongregationId,
      oblio_fiok_id: null, // chitanță NEM Oblio-n megy
      tipus: 'chitanta_papir',
      sorozat,
      szam,
      szamla_datum: input.szamlaDatum,
      klienesseg_nev,
      klienesseg_cui: input.klienesseg_cui?.trim() || null,
      klienesseg_cim: input.klienesseg_cim?.trim() || null,
      osszeg_net: input.osszeg_brut, // chitanță-nál nincs külön TVA
      osszeg_tva: 0,
      osszeg_brut: input.osszeg_brut,
      e_factura_status: 'not_applicable',
      reprezentand: input.reprezentand?.trim() || null,
      befizetes_id: input.befizetes_id ?? null,
      megjegyzes: input.megjegyzes?.trim() || null,
      issued_by: access.user.id,
      collected_at: new Date(input.szamlaDatum).toISOString(), // a chitanță maga a kifizetés
    })
    .select('id, sorozat, szam')
    .maybeSingle()

  if (insErr) {
    // Ha a felhasználó kétszer próbálta kiállítani ugyanazt a számot
    if (insErr.code === '23505') {
      return { error: `A ${sorozat} sorozat ${szam} száma már létezik. Ellenőrizd a tömböt vagy adj meg másik számot.` }
    }
    return { error: `Mentés sikertelen: ${insErr.message}` }
  }

  revalidatePath('/penzugy')
  return {
    success: true,
    chitantaId: inserted?.id,
    sorozat: inserted?.sorozat,
    szam: inserted?.szam,
  }
}

// ─────────────────────────────────────────────────────────────
// Lekérdezés (újranyomtatáshoz)
// ─────────────────────────────────────────────────────────────

export async function getChitantaForPrint(chitantaId: string): Promise<{
  data?: ChitantaPrintData
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data: row, error } = await access.supabase
    .from('oblio_szamlak')
    .select(`
      id, sorozat, szam, nyomdai_szam, gyulekezeti_szam, szamla_datum,
      klienesseg_nev, klienesseg_cui, klienesseg_cim, klienesseg_nr_orc_an,
      osszeg_brut, reprezentand, reprezentand_ro, megjegyzes, stornozott,
      stornozott_at, stornozott_indok, befizetes_id
    `)
    .eq('id', chitantaId)
    .eq('congregation_id', access.effectiveCongregationId)
    .eq('tipus', 'chitanta_papir')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!row) return { error: 'Nyugta nem található.' }

  // ──────────────────────────────────────────────────────────
  // Fallback-ek régi nyugtákhoz (amelyek még a reprezentand_ro
  // / klienesseg_cim bevezetése előtt készültek): ha hiányzik az
  // érték a nyugtán, de tudjuk a kapcsolódó befizetést, akkor
  // visszanyúlunk a jelenlegi adatokhoz.
  // ──────────────────────────────────────────────────────────
  let reprezentandRoResolved: string | null = (row.reprezentand_ro as string | null) ?? null
  let klienessegCimResolved: string | null = row.klienesseg_cim ?? null

  if ((!reprezentandRoResolved || !klienessegCimResolved) && row.befizetes_id) {
    const { data: bef } = await access.supabase
      .from('befizetes')
      .select('id_szemely, id_csalad, id_befizetescel')
      .eq('id', row.befizetes_id)
      .maybeSingle()

    // Román reprezentand pótlása a befizetescel.nevro-ból
    if (!reprezentandRoResolved && bef?.id_befizetescel) {
      const { data: bc } = await access.supabase
        .from('befizetescel')
        .select('nevro')
        .eq('id', bef.id_befizetescel)
        .maybeSingle()
      if (bc?.nevro) reprezentandRoResolved = String(bc.nevro)
    }

    // Lakhely pótlása a szemely/csalad táblából
    if (!klienessegCimResolved) {
      if (bef?.id_szemely) {
        const { data: sz } = await access.supabase
          .from('szemely')
          .select('c_szam, adrlocality:c_helysegid(name), adrstreet:c_utcaid(name)')
          .eq('id', bef.id_szemely)
          .maybeSingle()
        if (sz) {
          const loc = sz.adrlocality as { name?: string | null } | null
          const str = sz.adrstreet as { name?: string | null } | null
          const cimParts = [loc?.name, str?.name, sz.c_szam].filter(Boolean)
          if (cimParts.length > 0) klienessegCimResolved = cimParts.join(', ')
        }
      } else if (bef?.id_csalad) {
        const { data: csalaTag } = await access.supabase
          .from('szemely')
          .select('c_szam, adrlocality:c_helysegid(name), adrstreet:c_utcaid(name)')
          .eq('id_csalad', bef.id_csalad)
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (csalaTag) {
          const loc = csalaTag.adrlocality as { name?: string | null } | null
          const str = csalaTag.adrstreet as { name?: string | null } | null
          const cimParts = [loc?.name, str?.name, csalaTag.c_szam].filter(Boolean)
          if (cimParts.length > 0) klienessegCimResolved = cimParts.join(', ')
        }
      }
    }
  }

  // A gyülekezet adatai a fejléc miatt
  // FIGYELEM: a DB-ben a CIF (adószám) oszlop neve `adoszam`, nem `cif`
  const { data: cong } = await access.supabase
    .from('congregations')
    .select('name, nev_hu, nev_ro, adoszam, cim, varos, megye, telefon, diocese_id')
    .eq('id', access.effectiveCongregationId)
    .maybeSingle()

  // Egyházmegye + kerület
  let egyhazmegyeNev: string | null = null
  let egyhazmegyeNevRo: string | null = null
  let egyhazkeruletNev: string | null = null
  let egyhazkeruletNevRo: string | null = null
  if (cong?.diocese_id) {
    const { data: diocese } = await access.supabase
      .from('dioceses')
      .select('name, nev_hu, nev_ro, district_id')
      .eq('id', cong.diocese_id)
      .maybeSingle()
    if (diocese) {
      egyhazmegyeNev = (diocese as Record<string, string | null>).nev_hu ?? diocese.name ?? null
      egyhazmegyeNevRo = (diocese as Record<string, string | null>).nev_ro ?? null
      const districtId = (diocese as Record<string, string | null>).district_id
      if (districtId) {
        const { data: district } = await access.supabase
          .from('districts')
          .select('name, nev_hu, nev_ro')
          .eq('id', districtId)
          .maybeSingle()
        if (district) {
          egyhazkeruletNev = (district as Record<string, string | null>).nev_hu ?? district.name ?? null
          egyhazkeruletNevRo = (district as Record<string, string | null>).nev_ro ?? null
        }
      }
    }
  }

  return {
    data: {
      id: row.id,
      sorozat: row.sorozat,
      szam: row.szam,
      nyomdaiSzam: (row.nyomdai_szam as number | null) ?? row.szam,
      gyulekezetiSzam: (row.gyulekezeti_szam as number | null) ?? null,
      szamlaDatum: row.szamla_datum,
      klienessegNev: row.klienesseg_nev,
      klienessegCui: row.klienesseg_cui,
      klienessegCim: klienessegCimResolved,
      klienessegNrOrcAn: (row.klienesseg_nr_orc_an as string | null) ?? null,
      osszegBrut: row.osszeg_brut,
      reprezentand: row.reprezentand,
      reprezentandRo: reprezentandRoResolved,
      megjegyzes: row.megjegyzes,
      stornozott: row.stornozott,
      stornozottAt: row.stornozott_at,
      stornozottIndok: row.stornozott_indok,
      gyulekezet: {
        nevHu: cong?.nev_hu ?? cong?.name ?? '',
        nevRo: cong?.nev_ro ?? null,
        cif: cong?.adoszam ?? null,
        cim: cong?.cim ?? null,
        varos: (cong as Record<string, string | null> | null)?.varos ?? null,
        megye: (cong as Record<string, string | null> | null)?.megye ?? null,
        telefon: cong?.telefon ?? null,
      },
      egyhazmegyeNevHu: egyhazmegyeNev,
      egyhazmegyeNevRo: egyhazmegyeNevRo,
      egyhazkeruletNevHu: egyhazkeruletNev,
      egyhazkeruletNevRo: egyhazkeruletNevRo,
    },
  }
}

export type ChitantaPrintData = {
  id: string
  sorozat: string
  /** A `szam` mező backward-kompatibilis — az újabb nyugtáknál ez megegyezik a `nyomdaiSzam`-mal. */
  szam: number
  /** Kerületi nyomdai sorszám — a tömbből lefoglalva (pl. 115356). Seria mellett jelenik meg. */
  nyomdaiSzam: number | null
  /** Gyülekezeti saját sorszám — év elején 1-től újraindul (pl. 356). A nagy Nr. mezőben. */
  gyulekezetiSzam: number | null
  szamlaDatum: string
  klienessegNev: string
  klienessegCui: string | null
  klienessegCim: string | null
  klienessegNrOrcAn: string | null
  osszegBrut: number
  reprezentand: string | null
  /** A "reprezentând (címén)" mező román fordítása — a `befizetescel.nevro`-ból jön. */
  reprezentandRo: string | null
  megjegyzes: string | null
  stornozott: boolean
  stornozottAt: string | null
  stornozottIndok: string | null
  gyulekezet: {
    nevHu: string
    nevRo: string | null
    cif: string | null
    /** Utca + szám (pl. "str. Parohiei, nr. 214"). */
    cim: string | null
    /** Falu / város (pl. "Brateș"). */
    varos: string | null
    /** Megye (pl. "Jud. Covasna"). */
    megye: string | null
    telefon: string | null
  }
  egyhazmegyeNevHu: string | null
  egyhazmegyeNevRo: string | null
  egyhazkeruletNevHu: string | null
  egyhazkeruletNevRo: string | null
}

// ─────────────────────────────────────────────────────────────
// Lista
// ─────────────────────────────────────────────────────────────

export async function listChitantas(filter?: {
  yearFrom?: number
  yearTo?: number
  sorozat?: string
}): Promise<{ data?: ChitantaRow[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  let q = access.supabase
    .from('oblio_szamlak')
    .select(`
      id, sorozat, szam, szamla_datum, klienesseg_nev, klienesseg_cui, klienesseg_cim,
      osszeg_brut, reprezentand, befizetes_id, stornozott, stornozott_indok,
      megjegyzes, issued_by, created_at
    `)
    .eq('congregation_id', access.effectiveCongregationId)
    .eq('tipus', 'chitanta_papir')
    .order('szamla_datum', { ascending: false })

  if (filter?.sorozat) q = q.eq('sorozat', filter.sorozat)
  if (filter?.yearFrom) q = q.gte('szamla_datum', `${filter.yearFrom}-01-01`)
  if (filter?.yearTo) q = q.lte('szamla_datum', `${filter.yearTo}-12-31`)

  const { data, error } = await q
  if (error) return { error: error.message }
  return { data: (data ?? []) as ChitantaRow[] }
}

// ─────────────────────────────────────────────────────────────
// Batch lookup — a Készpénz fülön mutatja, hogy mely befizetésekhez van
// már kiállított chitanță (és melyikhez kell még)
// ─────────────────────────────────────────────────────────────

/**
 * Visszaadja minden megadott befizetés-ID-hoz a kapcsolódó (nem sztornózott)
 * chitanță rekordot. A Készpénz fülön ezzel jelezzük, hogy egy sornak van-e
 * már nyugtája.
 */
export async function getChitantakForBefizetesek(
  befizetesIds: number[],
): Promise<{ data?: Record<number, { id: string; sorozat: string; szam: number }>; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }
  if (befizetesIds.length === 0) return { data: {} }

  const { data, error } = await access.supabase
    .from('oblio_szamlak')
    .select('id, sorozat, szam, befizetes_id')
    .eq('congregation_id', access.effectiveCongregationId)
    .eq('tipus', 'chitanta_papir')
    .eq('stornozott', false)
    .in('befizetes_id', befizetesIds)

  if (error) return { error: error.message }

  const map: Record<number, { id: string; sorozat: string; szam: number }> = {}
  for (const row of data || []) {
    if (row.befizetes_id !== null) {
      map[row.befizetes_id] = {
        id: row.id as string,
        sorozat: row.sorozat as string,
        szam: row.szam as number,
      }
    }
  }
  return { data: map }
}

// ─────────────────────────────────────────────────────────────
// Sztornó
// ─────────────────────────────────────────────────────────────

export async function stornoChitanta(args: {
  chitantaId: string
  indok: string
}): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const indok = (args.indok || '').trim()
  if (indok.length < 5) {
    return { error: 'A sztornó indoklás legalább 5 karakter legyen.' }
  }

  const { error } = await access.supabase
    .from('oblio_szamlak')
    .update({
      stornozott: true,
      stornozott_at: new Date().toISOString(),
      stornozott_indok: indok,
    })
    .eq('id', args.chitantaId)
    .eq('congregation_id', access.effectiveCongregationId)
    .eq('tipus', 'chitanta_papir')

  if (error) return { error: error.message }
  revalidatePath('/penzugy')
  return { success: true }
}
