'use server'

/**
 * Adatvédelmi fedezet — ÉRINTETTI KÉRELMEK naplója + ÁSZF-elfogadások.
 * (2026-08-23, „Adatvédelmi fedezet, 2. rész")
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT
 * ════════════════════════════════════════════════════════════════════════════
 * Az Adatvédelmi tájékoztató EGY HÓNAPOS határidőt ígér az érintetti
 * kérelmekre (hozzáférés, helyesbítés, törlés, korlátozás, tiltakozás,
 * adathordozhatóság, hozzájárulás visszavonása), a GDPR 5(2) cikke pedig
 * ELSZÁMOLTATHATÓSÁGOT követel: bizonyítani kell tudni, hogy teljesítettük.
 * Eddig sem felület, sem napló, sem határidő-követés nem volt.
 *
 * Az ÁSZF 13. pontja szerint „a további használat elfogadásnak minősül" —
 * ezt is bizonyítani kell tudni: KI, MIKOR, MELYIK verziót.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ A KÓD ELŐBB MEGY ÉLESBE, MINT AZ SQL
 * ════════════════════════════════════════════════════════════════════════════
 * Amíg a `migration-docs/sql/2026-08-23-adatvedelmi-kerelmek.sql` nem futott
 * le, MINDEN lekérdezés `42P01` (undefined_table) / `PGRST205` hibát ad. Ezt
 * KEZELJÜK: az akadály `'tabla_hianyzik'`, az üzenet magyar, hibaoldal nincs.
 * A többi hiba viszont HANGOS marad — a néma üres lista a projekt visszatérő,
 * már megfizetett hibaosztálya.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ HATÓKÖR (fail-closed)
 * ════════════════════════════════════════════════════════════════════════════
 *  · rendszergazda (master / system admin): mindent lát, rendszerszintű
 *    (gyülekezet nélküli) kérelmet is rögzíthet.
 *  · lelkész: kizárólag a SAJÁT gyülekezete kérelmeit.
 *  · KERÜLETI szintű felhasználó: SEMMIT. Ez nem hiányosság, hanem a 2026-08-16
 *    K4 döntés következménye („a kerület nem olvashatja a kerület gyülekezetei
 *    adatait, csak a hivatalosan beküldött iratokat"). A felület ezt KIÍRJA,
 *    nem néma üres listát mutat.
 *
 * Az RLS ugyanezt őrzi az adatbázisban is — a szerver-oldali kapu csak
 * gyorsabb és beszédesebb visszajelzést ad.
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { canReadDistrictScope, canWriteDistrictScope } from '@/lib/auth/level-scope'
import {
  ellenorizdAllapotValtast,
  ellenorizdUjKerelmet,
  ertelmezdLekerdezesHibat,
  ervenyesAllapot,
  ervenyesAszfVerzio,
  ervenyesKerelemTipus,
  hataridoSzamitas,
  kellTeljesitesDatum,
  rendezdKerelmeket,
  type AdatvedelmiKerelemSor,
  type AllapotValtasBemenet,
  type AszfElfogadasSor,
  type AszfListaEredmeny,
  type KerelemAllapot,
  type KerelemListaEredmeny,
  type KerelemTipus,
  type MuveletEredmeny,
  type UjKerelemBemenet,
} from './adatvedelem-shared'

const KERELEM_TABLA = 'adatvedelmi_kerelmek'
const ASZF_TABLA = 'aszf_elfogadasok'

const OLDAL_UT = '/admin/adatvedelem'

const KERULET_UZENET =
  'Az érintetti kérelmek naplója a rendszergazda és az érintett egyházközség lelkipásztora számára látható. ' +
  'Az egyházkerületi szint az egyházközségek személyes adatait nem tekintheti meg — a kerület a hivatalosan ' +
  'beküldött iratokat és összesítőket látja (2026-08-16, K4 döntés). Ha egy kérelem a kerületi hivatalhoz ' +
  'érkezett, azt a rendszergazda rögzíti rendszerszintű kérelemként.'

const NINCS_JOG_UZENET =
  'Ehhez a naplóhoz nincs jogosultságod. Az érintetti kérelmeket a rendszergazda és az érintett ' +
  'egyházközség lelkipásztora kezeli.'

// ────────────────────────────────────────────────────────────────────────────
// Belső segédek
// ────────────────────────────────────────────────────────────────────────────

interface Kapu {
  supabase: Awaited<ReturnType<typeof getEffectiveAccessContext>>['supabase']
  userId: string
  rendszergazda: boolean
  sajatCongregationId: string | null
}

/**
 * A közös belépő-kapu. FAIL-CLOSED: bejelentkezés nélkül, illetve gyülekezet
 * és rendszergazdai jog nélkül `null`-t ad, és a hívó magyar üzenetet ír.
 */
async function nyitdAKaput(): Promise<
  { kapu: Kapu; hiba?: undefined } | { kapu?: undefined; hiba: KerelemListaEredmeny }
> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.userId) {
    return { hiba: { akadaly: 'nincs_jogosultsag', uzenet: 'Nincs bejelentkezve.' } }
  }

  const rendszergazda = access.master || access.admin
  const keruletiSzint =
    !rendszergazda && (canWriteDistrictScope(access) || canReadDistrictScope(access))

  if (!rendszergazda && keruletiSzint) {
    return { hiba: { akadaly: 'kerulet_nem_lathatja', uzenet: KERULET_UZENET } }
  }

  const sajat = access.effectiveCongregationId ?? access.profileCongregationId ?? null
  if (!rendszergazda && !sajat) {
    return { hiba: { akadaly: 'nincs_jogosultsag', uzenet: NINCS_JOG_UZENET } }
  }

  return {
    kapu: {
      supabase: access.supabase,
      userId: access.userId,
      rendszergazda,
      sajatCongregationId: sajat,
    },
  }
}

/** Nyers DB-sor → felületi sor. Ismeretlen érték esetén biztonságos default. */
function sortOlvas(
  nyers: Record<string, unknown>,
  gyulekezetNevek: Map<string, string>,
  intezoNevek: Map<string, string>,
): AdatvedelmiKerelemSor {
  const congregationId = (nyers.congregation_id as string | null) ?? null
  const intezteProfileId = (nyers.intezte_profile_id as string | null) ?? null
  const tipus = nyers.kerelem_tipusa
  const allapot = nyers.allapot
  const beerkezes = String(nyers.beerkezes_datuma ?? '')
  return {
    id: String(nyers.id ?? ''),
    congregationId,
    congregationNev: congregationId ? (gyulekezetNevek.get(congregationId) ?? null) : null,
    erintettNeve: String(nyers.erintett_neve ?? ''),
    erintettEmail: (nyers.erintett_email as string | null) ?? null,
    kerelemTipusa: (ervenyesKerelemTipus(tipus) ? tipus : 'egyeb') as KerelemTipus,
    beerkezesDatuma: beerkezes,
    // A tárolt határidőt használjuk, de ha valamiért hiányzik, a KÖZÖS MAG
    // számolja ki — így a lista sosem marad határidő nélkül.
    hatarido: String(nyers.hatarido ?? hataridoSzamitas(beerkezes) ?? ''),
    allapot: (ervenyesAllapot(allapot) ? allapot : 'uj') as KerelemAllapot,
    teljesitesDatuma: (nyers.teljesites_datuma as string | null) ?? null,
    intezteProfileId,
    intezteNev: intezteProfileId ? (intezoNevek.get(intezteProfileId) ?? null) : null,
    megjegyzes: (nyers.megjegyzes as string | null) ?? null,
    letrehozva: (nyers.letrehozva as string | null) ?? null,
  }
}

/** Üres/whitespace szöveg → null (a DB-ben ne üres sztring álljon). */
function tisztit(ertek: string | null | undefined): string | null {
  if (typeof ertek !== 'string') return null
  const t = ertek.trim()
  return t.length > 0 ? t : null
}

// ────────────────────────────────────────────────────────────────────────────
// 1. LISTA
// ────────────────────────────────────────────────────────────────────────────

export async function listAdatvedelmiKerelmek(): Promise<KerelemListaEredmeny> {
  const kapuEredmeny = await nyitdAKaput()
  if (kapuEredmeny.hiba) return kapuEredmeny.hiba
  const kapu = kapuEredmeny.kapu

  let lekerdezes = kapu.supabase
    .from(KERELEM_TABLA)
    .select(
      'id, congregation_id, erintett_neve, erintett_email, kerelem_tipusa, beerkezes_datuma, ' +
        'hatarido, allapot, teljesites_datuma, intezte_profile_id, megjegyzes, letrehozva',
    )
    .order('hatarido', { ascending: true })
    .order('id', { ascending: true })
    .limit(500)

  if (!kapu.rendszergazda) {
    // Lelkész: KIZÁRÓLAG a saját gyülekezete. A `sajatCongregationId` itt
    // bizonyítottan nem null (a kapu ellenőrizte) — skalár hatókör + `if (id)`
    // szűrő NÉLKÜL, mert az a néma teljes szivárgás hibaosztálya.
    lekerdezes = lekerdezes.eq('congregation_id', kapu.sajatCongregationId as string)
  }

  const { data, error } = await lekerdezes
  const hiba = ertelmezdLekerdezesHibat(error)
  if (hiba.fajta === 'tabla_hianyzik') {
    return { akadaly: 'tabla_hianyzik', uzenet: hiba.uzenet ?? undefined }
  }
  if (hiba.fajta === 'egyeb') {
    return {
      akadaly: 'adatbazis_hiba',
      uzenet: 'Az érintetti kérelmeket nem sikerült betölteni: ' + (hiba.uzenet ?? ''),
    }
  }

  const nyersSorok = (data ?? []) as unknown as Array<Record<string, unknown>>

  // Név-feloldás: gyülekezet + ügyintéző. Hibánál NEM bukunk el — a név
  // kiegészítő információ, a lista enélkül is használható.
  const congIds = new Set<string>()
  const profileIds = new Set<string>()
  for (const s of nyersSorok) {
    const c = s.congregation_id as string | null
    if (c) congIds.add(c)
    const p = s.intezte_profile_id as string | null
    if (p) profileIds.add(p)
  }

  const gyulekezetNevek = await olvasdGyulekezetNeveket(kapu, congIds)
  const intezoNevek = await olvasdProfilNeveket(kapu, profileIds)

  const sorok = rendezdKerelmeket(
    nyersSorok.map((s) => sortOlvas(s, gyulekezetNevek, intezoNevek)),
  )

  // Az űrlap gyülekezet-választója: a rendszergazda az egész listát kapja, a
  // lelkész csak a sajátját (nála a mező eleve rögzített).
  const valaszthato = await olvasdValaszthatoGyulekezeteket(kapu)

  return {
    sorok,
    osszesGyulekezet: valaszthato,
    akadaly: 'nincs_akadaly',
    rendszergazda: kapu.rendszergazda,
    sajatCongregationId: kapu.sajatCongregationId,
  }
}

/** ⚠️ 80-asával darabolva: sok azonosítós `.in()` az URL-korlátba (414) fut. */
async function olvasdGyulekezetNeveket(
  kapu: Kapu,
  idHalmaz: Set<string>,
): Promise<Map<string, string>> {
  const nevek = new Map<string, string>()
  const idk = [...idHalmaz]
  for (let i = 0; i < idk.length; i += 80) {
    const darab = idk.slice(i, i + 80)
    const { data, error } = await kapu.supabase
      .from('congregations')
      .select('id, nev_hu, name')
      .in('id', darab)
    if (error) continue
    for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      const id = String(r.id ?? '')
      const nev = (r.nev_hu as string | null) || (r.name as string | null) || ''
      if (id) nevek.set(id, nev)
    }
  }
  return nevek
}

async function olvasdProfilNeveket(
  kapu: Kapu,
  idHalmaz: Set<string>,
): Promise<Map<string, string>> {
  const nevek = new Map<string, string>()
  const idk = [...idHalmaz]
  for (let i = 0; i < idk.length; i += 80) {
    const darab = idk.slice(i, i + 80)
    const { data, error } = await kapu.supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', darab)
    if (error) continue
    for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      const id = String(r.id ?? '')
      const nev = (r.full_name as string | null) || (r.email as string | null) || ''
      if (id) nevek.set(id, nev)
    }
  }
  return nevek
}

async function olvasdValaszthatoGyulekezeteket(
  kapu: Kapu,
): Promise<Array<{ id: string; nev: string }>> {
  if (!kapu.rendszergazda) {
    if (!kapu.sajatCongregationId) return []
    const nevek = await olvasdGyulekezetNeveket(kapu, new Set([kapu.sajatCongregationId]))
    return [
      {
        id: kapu.sajatCongregationId,
        nev: nevek.get(kapu.sajatCongregationId) || 'A saját gyülekezetem',
      },
    ]
  }
  const { data, error } = await kapu.supabase
    .from('congregations')
    .select('id, nev_hu, name')
    .order('nev_hu', { ascending: true })
    .limit(2000)
  if (error) return []
  return ((data ?? []) as unknown as Array<Record<string, unknown>>)
    .map((r) => ({
      id: String(r.id ?? ''),
      nev: ((r.nev_hu as string | null) || (r.name as string | null) || '').trim(),
    }))
    .filter((r) => r.id.length > 0)
}

// ────────────────────────────────────────────────────────────────────────────
// 2. ÚJ KÉRELEM
// ────────────────────────────────────────────────────────────────────────────

export async function rogzitsAdatvedelmiKerelmet(
  bemenet: UjKerelemBemenet,
): Promise<MuveletEredmeny> {
  const kapuEredmeny = await nyitdAKaput()
  if (kapuEredmeny.hiba) {
    return { hiba: kapuEredmeny.hiba.uzenet, akadaly: kapuEredmeny.hiba.akadaly }
  }
  const kapu = kapuEredmeny.kapu

  const validalasHiba = ellenorizdUjKerelmet(bemenet)
  if (validalasHiba) return { hiba: validalasHiba }

  // A gyülekezet-hozzárendelés a SZERVEREN dől el, nem a böngészőben:
  // a lelkész mindig a saját gyülekezetéhez rögzít, akármit küld föl.
  const congregationId = kapu.rendszergazda
    ? (tisztit(bemenet.congregationId) ?? null)
    : kapu.sajatCongregationId

  const hatarido = hataridoSzamitas(bemenet.beerkezesDatuma)
  if (!hatarido) return { hiba: 'A beérkezés dátumából nem sikerült határidőt számolni.' }

  const { error } = await kapu.supabase.from(KERELEM_TABLA).insert({
    congregation_id: congregationId,
    erintett_neve: bemenet.erintettNeve.trim(),
    erintett_email: tisztit(bemenet.erintettEmail),
    kerelem_tipusa: bemenet.kerelemTipusa,
    beerkezes_datuma: bemenet.beerkezesDatuma,
    hatarido,
    allapot: 'uj',
    intezte_profile_id: kapu.userId,
    megjegyzes: tisztit(bemenet.megjegyzes),
  })

  const hiba = ertelmezdLekerdezesHibat(error)
  if (hiba.fajta === 'tabla_hianyzik') {
    return { hiba: hiba.uzenet ?? undefined, akadaly: 'tabla_hianyzik' }
  }
  if (hiba.fajta === 'egyeb') {
    return { hiba: 'A kérelmet nem sikerült rögzíteni: ' + (hiba.uzenet ?? '') }
  }

  revalidatePath(OLDAL_UT)
  return { siker: true }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. ÁLLAPOT-VÁLTÁS / TELJESÍTÉS RÖGZÍTÉSE
// ────────────────────────────────────────────────────────────────────────────

export async function valtsdAdatvedelmiKerelemAllapotat(
  bemenet: AllapotValtasBemenet,
): Promise<MuveletEredmeny> {
  const kapuEredmeny = await nyitdAKaput()
  if (kapuEredmeny.hiba) {
    return { hiba: kapuEredmeny.hiba.uzenet, akadaly: kapuEredmeny.hiba.akadaly }
  }
  const kapu = kapuEredmeny.kapu

  const validalasHiba = ellenorizdAllapotValtast(bemenet)
  if (validalasHiba) return { hiba: validalasHiba }

  const allapot = bemenet.allapot as KerelemAllapot
  const lezar = kellTeljesitesDatum(allapot)

  const modositas: Record<string, unknown> = {
    allapot,
    // ⚠️ KÉTOSZLOPOS KONZISZTENCIA (a Kuka-minta): nyitott állapothoz TILOS
    // teljesítés-dátum, lezárthoz KÖTELEZŐ. A DB CHECK ugyanezt őrzi — ha itt
    // elrontanánk, kriptikus 23514-et kapna a lelkész.
    teljesites_datuma: lezar ? bemenet.teljesitesDatuma : null,
    intezte_profile_id: kapu.userId,
    modositva: new Date().toISOString(),
    // A megjegyzés MINDIG felülíródik (üresre is): az űrlap a meglévő szöveggel
    // indul, ezért ha valaki kitörli, azt szándéknak kell venni. A „csak ha nem
    // üres" változat NÉMA NEM-MŰVELET lenne — a lelkész látná a mentés-üzenetet,
    // de a szöveg maradna.
    megjegyzes: tisztit(bemenet.megjegyzes),
  }

  let lekerdezes = kapu.supabase.from(KERELEM_TABLA).update(modositas).eq('id', bemenet.id)
  if (!kapu.rendszergazda) {
    lekerdezes = lekerdezes.eq('congregation_id', kapu.sajatCongregationId as string)
  }

  const { error } = await lekerdezes
  const hiba = ertelmezdLekerdezesHibat(error)
  if (hiba.fajta === 'tabla_hianyzik') {
    return { hiba: hiba.uzenet ?? undefined, akadaly: 'tabla_hianyzik' }
  }
  if (hiba.fajta === 'egyeb') {
    return { hiba: 'Az állapotot nem sikerült menteni: ' + (hiba.uzenet ?? '') }
  }

  revalidatePath(OLDAL_UT)
  return { siker: true }
}

// ────────────────────────────────────────────────────────────────────────────
// 4. TÖRLÉS — csak elírás javítására, rendszergazdának és a saját lelkésznek
// ────────────────────────────────────────────────────────────────────────────

export async function torolAdatvedelmiKerelmet(id: string): Promise<MuveletEredmeny> {
  const kapuEredmeny = await nyitdAKaput()
  if (kapuEredmeny.hiba) {
    return { hiba: kapuEredmeny.hiba.uzenet, akadaly: kapuEredmeny.hiba.akadaly }
  }
  const kapu = kapuEredmeny.kapu
  if (!id || id.trim().length === 0) return { hiba: 'Hiányzik a kérelem azonosítója.' }

  let lekerdezes = kapu.supabase.from(KERELEM_TABLA).delete().eq('id', id)
  if (!kapu.rendszergazda) {
    lekerdezes = lekerdezes.eq('congregation_id', kapu.sajatCongregationId as string)
  }

  const { error } = await lekerdezes
  const hiba = ertelmezdLekerdezesHibat(error)
  if (hiba.fajta === 'tabla_hianyzik') {
    return { hiba: hiba.uzenet ?? undefined, akadaly: 'tabla_hianyzik' }
  }
  if (hiba.fajta === 'egyeb') {
    return { hiba: 'A kérelmet nem sikerült törölni: ' + (hiba.uzenet ?? '') }
  }

  revalidatePath(OLDAL_UT)
  return { siker: true }
}

// ────────────────────────────────────────────────────────────────────────────
// 5. ÁSZF-ELFOGADÁSOK — rögzítés (bárki, a SAJÁT sorát) + lista (admin)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Az ÁSZF-elfogadás rögzítése. Az ÁSZF 13. pontja szerint „a további használat
 * elfogadásnak minősül" — a bizonyíték tehát: ki, mikor, MELYIK verziót látta.
 *
 * ⚠️ SZÁNDÉKOSAN NEM TÁROLUNK IP-CÍMET ÉS BÖNGÉSZŐ-AZONOSÍTÓT. Az Adatvédelmi
 * tájékoztató nem sorolja fel ezeket az adatkörök között; ha itt mégis
 * tárolnánk, a jogi szöveget is módosítani kellene — vagyis a bizonyíték maga
 * lenne adatvédelmi hiba. Elég: profil + verzió + időpont.
 *
 * ⚠️ NÉMÁN TŰR: ha a tábla még nincs meg, `siker: false` jön vissza HIBA
 * NÉLKÜL — ezt a hívó (a háttérben futó rögzítő) nem mutatja a felhasználónak.
 * A verzió-sztringet a jogi dialógus `LEGAL_VERSION`-je adja (kliens oldalról),
 * itt csak az ALAKJÁT ellenőrizzük, hogy ne legyen belőle második igazság.
 */
export async function rogzitsAszfElfogadast(verzio: string): Promise<MuveletEredmeny> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.userId) return { hiba: 'Nincs bejelentkezve.' }
  if (!ervenyesAszfVerzio(verzio)) return { hiba: 'Érvénytelen ÁSZF-verzió.' }

  const { error } = await access.supabase.from(ASZF_TABLA).insert({
    profile_id: access.userId,
    verzio: verzio.trim(),
  })

  if (!error) return { siker: true }

  // 23505 = már van sora ehhez a verzióhoz. Ez NEM hiba: a rögzítés
  // idempotens, a legelső elfogadás időpontja a mérvadó.
  if (error.code === '23505') return { siker: true }

  const hiba = ertelmezdLekerdezesHibat(error)
  if (hiba.fajta === 'tabla_hianyzik') {
    return { siker: false, akadaly: 'tabla_hianyzik' }
  }
  return { siker: false, hiba: hiba.uzenet ?? undefined }
}

/** Az admin felület ÁSZF-naplója. Rendszergazda mindent lát, más a saját sorát. */
export async function listAszfElfogadasok(): Promise<AszfListaEredmeny> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.userId) {
    return { akadaly: 'nincs_jogosultsag', uzenet: 'Nincs bejelentkezve.' }
  }
  const rendszergazda = access.master || access.admin

  let lekerdezes = access.supabase
    .from(ASZF_TABLA)
    .select('id, profile_id, verzio, elfogadva_at')
    .order('elfogadva_at', { ascending: false })
    .limit(500)

  if (!rendszergazda) lekerdezes = lekerdezes.eq('profile_id', access.userId)

  const { data, error } = await lekerdezes
  const hiba = ertelmezdLekerdezesHibat(error)
  if (hiba.fajta === 'tabla_hianyzik') {
    return { akadaly: 'tabla_hianyzik', uzenet: hiba.uzenet ?? undefined }
  }
  if (hiba.fajta === 'egyeb') {
    return {
      akadaly: 'adatbazis_hiba',
      uzenet: 'Az ÁSZF-elfogadásokat nem sikerült betölteni: ' + (hiba.uzenet ?? ''),
    }
  }

  const nyers = (data ?? []) as unknown as Array<Record<string, unknown>>
  const profilIdk = new Set<string>()
  for (const r of nyers) {
    const p = r.profile_id as string | null
    if (p) profilIdk.add(p)
  }

  const nevek = new Map<string, { nev: string | null; email: string | null }>()
  const idk = [...profilIdk]
  for (let i = 0; i < idk.length; i += 80) {
    const darab = idk.slice(i, i + 80)
    const { data: profilok, error: profilHiba } = await access.supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', darab)
    if (profilHiba) continue
    for (const r of (profilok ?? []) as unknown as Array<Record<string, unknown>>) {
      nevek.set(String(r.id ?? ''), {
        nev: (r.full_name as string | null) ?? null,
        email: (r.email as string | null) ?? null,
      })
    }
  }

  const verziok = new Set<string>()
  const sorok: AszfElfogadasSor[] = nyers.map((r) => {
    const profileId = String(r.profile_id ?? '')
    const kiegeszites = nevek.get(profileId)
    const verzio = String(r.verzio ?? '')
    if (verzio) verziok.add(verzio)
    return {
      id: String(r.id ?? ''),
      profileId,
      nev: kiegeszites?.nev ?? null,
      email: kiegeszites?.email ?? null,
      verzio,
      elfogadvaAt: String(r.elfogadva_at ?? ''),
    }
  })

  return { sorok, akadaly: 'nincs_akadaly', verziok: [...verziok].sort() }
}
