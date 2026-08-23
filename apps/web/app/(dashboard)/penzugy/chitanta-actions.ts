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
import {
  getChitantaForPrintUseCase,
  issueChitantaUseCase,
  listChitantasUseCase,
  stornoChitantaUseCase,
} from '@kartoteka/core'
import type { ChitantaPrintData } from '@kartoteka/validations'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import type {
  ChitantaConfig,
  ChitantaIssueInput,
  ChitantaRow,
} from '@/app/(dashboard)/penzugy/chitanta-types'

// A típusok a `chitanta-types.ts`-ben vannak (Next.js 16: 'use server' fájl
// csak async function-t exportálhat).

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
// 2026-08-22 (5. pont / 5b): JOGI SZEMÉLY befizető → CIF + székhely
// ─────────────────────────────────────────────────────────────
//
// A TÜNET: a nyugta-sablonon KÉT külön CIF van — a fejlécé a KIÁLLÍTÓ
// gyülekezeté (helyes), a törzs „CIF" sora a BEFIZETŐÉ (`klienesseg_cui`).
// Ez utóbbit egyetlen élő felület sem töltötte ki, ezért ha a nyugta egy MÁSIK
// egyházközségnek (jogi személynek) szólt, a hivatalos iraton mindig „—" állt.
//
// ⚠️ TÖRTÉNETI HŰSÉG — EZ A LÉNYEG: a partner CIF-je és székhelye a nyugtán
//    PILLANATFELVÉTEL. Ezért ÉRTÉKKÉNT mentjük az `oblio_szamlak` sorba a
//    kiállítás pillanatában, és SOHA nem futásidejű JOIN-nal olvassuk a
//    nyomtatáskor. Ha később a partner adószáma vagy székhelye megváltozik, a
//    MÁR KIADOTT, aláírt nyugta képe nem írható át visszamenőleg.
//
// ⚠️ FAIL-CLOSED PÁROSÍTÁS: a `forrasa` szabad szöveg, a párosítás EXAKT
//    (kisbetűsített, ékezet- és szóköz-normalizált) egyezésre megy, és CSAK
//    akkor ír CIF-et, ha PONTOSAN EGY jelölt van. Egy „majdnem jó" fuzzy
//    találat egy hivatalos iratra HAMIS adószámot írna — az rosszabb, mint az
//    üres mező. Bizonytalanságnál marad a mai viselkedés (a „—").

/** Név-normalizálás a párosításhoz: kisbetű, ékezet nélkül, egy szóközzel. */
function normalizaltNev(nev: string | null | undefined): string {
  return String(nev || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** A jogi személy befizető bejegyzett SZÉKHELYE (nem lakcím!) egy sorban. */
function szekhelyBol(c: { cim?: string | null; varos?: string | null }): string | null {
  const cim = String(c.cim || '').trim()
  const varos = String(c.varos || '').trim()
  if (cim && varos && !cim.toLowerCase().includes(varos.toLowerCase())) return `${cim}, ${varos}`
  return cim || varos || null
}

/**
 * A `befizetes.forrasa` szabad szövegből egyházközség-partner feloldása.
 *
 * HATÓKÖR: a KIÁLLÍTÓ gyülekezet SAJÁT egyházmegyéjének gyülekezetei (a saját
 * magát kizárva). Ez szándékosan szűk: (a) az egyházközségek közti pénzmozgás
 * gyakorlatilag a megyén belül történik, (b) egy országos névkeresés minden
 * gyülekezet adószámát és székhelyét kiadná egy sima nyugtanyomtatásnál.
 *
 * `null`-t ad, ha nincs egyértelmű találat vagy a partnernek nincs adószáma —
 * ilyenkor a hívó a mai (magánszemélyes) viselkedést tartja meg.
 */
async function feloldJogiSzemelyBefizeto(
  supabase: Awaited<ReturnType<typeof getEffectiveAccessContext>>['supabase'],
  kiallitoCongregationId: string,
  forrasa: string,
): Promise<{ nev: string; cui: string; szekhely: string | null } | null> {
  const cel = normalizaltNev(forrasa)
  if (cel.length < 3) return null

  const { data: sajat } = await supabase
    .from('congregations')
    .select('diocese_id')
    .eq('id', kiallitoCongregationId)
    .maybeSingle()
  const dioceseId = (sajat as { diocese_id?: string | null } | null)?.diocese_id
  if (!dioceseId) return null

  const { data } = await supabase
    .from('congregations')
    .select('id, name, nev_hu, adoszam, cim, varos')
    .eq('diocese_id', dioceseId)
  const sorok = (data ?? []) as Array<{
    id: string; name?: string | null; nev_hu?: string | null
    adoszam?: string | null; cim?: string | null; varos?: string | null
  }>
  const jeloltek = sorok.filter(
    (c) =>
      String(c.id) !== kiallitoCongregationId &&
      (normalizaltNev(c.name) === cel || normalizaltNev(c.nev_hu) === cel),
  )
  // Pontosan EGY jelölt — különben inkább üres marad a CIF (lásd a fenti MIÉRT-et).
  if (jeloltek.length !== 1) return null
  const p = jeloltek[0]
  const cui = String(p.adoszam || '').trim()
  if (!cui) return null
  return {
    nev: String(p.name || p.nev_hu || '').trim(),
    cui,
    szekhely: szekhelyBol(p),
  }
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
    // 2026-06-01 (hibrid család-modell Fázis 2): a háztartást a legacy_csalad_id
    // alapján találjuk meg, és a megnevezés-mezőből hozzuk a család-nevet
    // ("Kovács család — Templom u. 3"). A cím szintén a haztartas.cim-ből
    // (utca + szám + tömbház + ajtó) — pontosabb mint a régi szemely-bug.
    const { data: haztartas } = await access.supabase
      .from('haztartas')
      .select(`
        megnevezes,
        cim:cim!id_cim(szam, tombhaz, lepcsohaz, emelet, ajto, utca:adrstreet!id_utca(name))
      `)
      .eq('legacy_csalad_id', befizetes.id_csalad)
      .is('ervenyes_ig', null)
      .limit(1)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = haztartas as any
    if (h?.megnevezes) befizetoNev = String(h.megnevezes)
    if (h?.cim) {
      const cim = Array.isArray(h.cim) ? h.cim[0] : h.cim
      const utcaRaw = cim?.utca
      const utca = Array.isArray(utcaRaw) ? utcaRaw[0] : utcaRaw
      const cimParts = [utca?.name, cim?.szam].filter(Boolean)
      if (cimParts.length > 0) befizetoCim = cimParts.join(' ')
    }
  }
  if (!befizetoNev && typeof befizetes.forrasa === 'string') {
    befizetoNev = befizetes.forrasa.trim()
  }

  // 2026-08-22 (5b): JOGI SZEMÉLY befizető → CIF + BEJEGYZETT SZÉKHELY.
  // CSAK akkor próbálkozunk, ha a befizetés SEM személyhez, SEM családhoz nincs
  // kötve — azaz szabad szöveges „forrasa"-val jött. Magánszemélynél a
  // viselkedés BYTE-AZONOS a mai állapottal (nincs CIF, a lakcím marad).
  let befizetoCui: string | null = null
  if (
    !befizetes.id_szemely &&
    !befizetes.id_csalad &&
    typeof befizetes.forrasa === 'string' &&
    befizetes.forrasa.trim()
  ) {
    const partner = await feloldJogiSzemelyBefizeto(
      access.supabase,
      access.effectiveCongregationId,
      befizetes.forrasa,
    )
    if (partner) {
      befizetoNev = partner.nev || befizetoNev
      befizetoCui = partner.cui
      // A SZÉKHELY felülírja a (magánszemélyre szabott) cím-mezőt — jogi
      // személynél a nyugtára a bejegyzett székhely való, nem lakcím.
      befizetoCim = partner.szekhely
    }
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
  // 2026-07-17 (F2-3, Q4 döntés): a fizetett év MINDIG a reprezentand része —
  // a nyugta e nélkül nem igazolta, melyik évre szólt a befizetés (pl. 2024-es
  // elmaradás 2026-ban rendezve). Bit-azonos a core use-case-szel (desktop-út).
  const fizetettEv = Number(befizetes.fizetettev) || null
  if (fizetettEv) {
    if (reprezentand && !reprezentand.includes(String(fizetettEv))) reprezentand = `${reprezentand} ${fizetettEv}`
    if (reprezentandRo && !reprezentandRo.includes(String(fizetettEv))) reprezentandRo = `${reprezentandRo} ${fizetettEv}`
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
      // ⚠️ PILLANATFELVÉTEL: a partner adószáma ÉRTÉKKÉNT mentődik a nyugta
      // sorába. A nyomtatás SOHA nem olvashatja futásidejű JOIN-nal, különben
      // egy későbbi CIF-változás visszamenőleg átírná a már kiadott nyugtát.
      klienesseg_cui: befizetoCui,
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
  // A-M7.2b óta: a @kartoteka/core `issueChitantaUseCase` kezeli a zod-
  // validálást, a sorszám-RPC-t (`next_chitanta_number`), az INSERT-et az
  // `oblio_szamlak` táblába, és a pasztorális hibaüzeneteket. A web adapter
  // vékony — a default sorozatot a config-ból betölti és átadja.
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const cfg = await getChitantaConfig()
  const defaultSorozat = 'error' in cfg ? null : cfg.sorozat

  const result = await issueChitantaUseCase(
    {
      congregationId: access.effectiveCongregationId,
      sorozat: input.sorozat,
      szam: input.szam,
      szamlaDatum: input.szamlaDatum,
      klienesseg_nev: input.klienesseg_nev,
      klienesseg_cim: input.klienesseg_cim ?? null,
      klienesseg_cui: input.klienesseg_cui ?? null,
      osszeg_brut: input.osszeg_brut,
      reprezentand: input.reprezentand ?? null,
      befizetes_id: input.befizetes_id ?? null,
      megjegyzes: input.megjegyzes ?? null,
    },
    {
      supabase: access.supabase,
      runtime: 'web',
      userId: access.user.id,
      defaultSorozat,
    },
  )

  if (!result.success) return { error: result.error }

  revalidatePath('/penzugy')
  return {
    success: true,
    chitantaId: result.chitantaId,
    sorozat: result.sorozat,
    szam: result.szam,
  }
}

// ─────────────────────────────────────────────────────────────
// Lekérdezés (újranyomtatáshoz)
// ─────────────────────────────────────────────────────────────

export async function getChitantaForPrint(chitantaId: string): Promise<{
  data?: ChitantaPrintData
  error?: string
}> {
  // A-M7.2f óta: a @kartoteka/core use-case intézi az 5-query láncot és a
  // fallback-eket (régi nyugtáknál reprezentand_ro / klienesseg_cim pótlás a
  // befizetés → befizetescel / szemely / csalad táblákon keresztül).
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const result = await getChitantaForPrintUseCase(
    { congregationId: access.effectiveCongregationId, chitantaId },
    { supabase: access.supabase, runtime: 'web' },
  )
  if (!result.success) return { error: result.error }
  return { data: result.data }
}

// A ChitantaPrintData típus a @kartoteka/validations-ben él. Next.js 16 óta
// `'use server'` fájlból nem szabad non-function-t exportálni (még típust se,
// mert a server-actions loader runtime ReferenceError-t dob), ezért a
// fogyasztók közvetlenül a `@kartoteka/validations` modulból importálják.

// ─────────────────────────────────────────────────────────────
// Lista
// ─────────────────────────────────────────────────────────────

export async function listChitantas(filter?: {
  yearFrom?: number
  yearTo?: number
  sorozat?: string
}): Promise<{ data?: ChitantaRow[]; error?: string }> {
  // A-M7.2e óta: a @kartoteka/core use-case intézi a Supabase-lekérdezést +
  // zod-drift-check-et. A web adapter vékony.
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const result = await listChitantasUseCase(
    {
      congregationId: access.effectiveCongregationId,
      yearFrom: filter?.yearFrom,
      yearTo: filter?.yearTo,
      sorozat: filter?.sorozat,
    },
    { supabase: access.supabase, runtime: 'web' },
  )
  if (!result.success) return { error: result.error }
  // A ChitantaListRow és ChitantaRow mezői megegyeznek — típus-kompatibilis cast.
  return { data: result.rows as unknown as ChitantaRow[] }
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
  // A-M7.2e óta: a @kartoteka/core use-case intézi a zod-validálást +
  // RLS-védett UPDATE-et.
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const result = await stornoChitantaUseCase(
    {
      congregationId: access.effectiveCongregationId,
      chitantaId: args.chitantaId,
      indok: args.indok,
    },
    { supabase: access.supabase, runtime: 'web' },
  )

  if (!result.success) return { error: result.error }
  revalidatePath('/penzugy')
  return { success: true }
}
