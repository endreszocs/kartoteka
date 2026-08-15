'use server'

/**
 * EGYHÁZMEGYEI ÖSSZESÍTŐ — szerver akciók (2026-08-15, terv 3.5 + 3.6).
 *
 * MIT AD: a megye gyülekezetei által VÉGLEGESÍTETT és beküldött iratok
 * megyei összesítését (Kánon 90.§ — a számvevő „kellő időben összesíti"), és
 * az összesítő KÜLÖN véglegesítés + felküldés útját az egyházkerületnek
 * (Endre 3. döntése: „két külön véglegesítési út" — a megye SAJÁT iratai a
 * Pénzügy fülön, az összesítő itt).
 *
 * ELVEK:
 *  · FAIL-CLOSED hatókör: KIZÁRÓLAG a szerep-szűrt `readScopeIds` /
 *    `writeScopeIds` (level-scope.ts) — NULL/üres hatókör → magyar hibaüzenet
 *    és ÜRES összesítő, SOHA nem szűretlen lekérdezés. (A skalár-hatókör
 *    hibaosztály: „NULL diocese-id → szűretlen lista" — itt kizárva.)
 *  · EGY SZÁMÍTÁS: a képernyő és a FELKÜLDÖTT pillanatkép ugyanazt a tiszta
 *    magot hívja (lib/diocese/osszesito-core.ts). A felküldés SOHA nem a
 *    böngészőtől kapott számokat rögzíti, hanem újraszámol a szerveren.
 *  · Ami nincs beküldve, az LÁTHATÓAN hiányzik (a mag `allapot` mezői), nem
 *    némán nulla.
 *  · A számvevő OLVAS, de nem ír (Endre jogosultság-mátrixa): a felküldés és
 *    a feloldás-kérés `canWriteDioceseScope` kapun megy át, beszédes magyar
 *    üzenettel — nem néma, 0 sort érintő mentéssel.
 */

import { revalidatePath } from 'next/cache'
import { selectAllPaged } from '@kartoteka/supabase-client'

import { getEffectiveAccessContext, type EffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canReadDioceseScope,
  canWriteDioceseScope,
  describeDioceseWriteBlock,
  getDioceseScopeContext,
} from '@/lib/auth/level-scope'
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'
import {
  keresOsszesitoFeloldas,
  olvasOsszesitoAllapot,
  rogzitDioceseFelterjesztes,
  type OsszesitoFelkuldesAllapot,
} from '@/lib/finance/diocese-felterjesztes'
import {
  szamitMegyeiOsszesito,
  type KodKatalogusTetel,
  type MegyeiOsszesito,
  type OsszesitoBekuldes,
  type OsszesitoGyulekezet,
} from '@/lib/diocese/osszesito-core'
import { JELENTES_MEZOK, ADATLAP_MEZO_IDS, parseHuSzam } from '@/lib/lelkeszi-jelentes/types'
import type { OsszesitoOldalAdat } from './osszesito-shared'

type Supa = EffectiveAccessContext['supabase']

/** Az .in() lista darabolása — a PostgREST URL-hossz plafonja miatt. */
const IN_CHUNK = 120

/** Az összesítőbe bevont irat-típusok (mind a 6 — Endre kiegészítésével). */
const OSSZESITO_TIPUSOK = [
  'szamadas',
  'koltsegvetes',
  'koltsegvetes_modositas',
  'vagyonleltar',
  'valasztok_nevjegyzeke',
  'lelkeszi_jelentes',
]

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Gyülekezet megjelenítési neve — hivatalos név elsőbbséggel. */
function congNev(row: { name?: string | null; nev_hu?: string | null }): string {
  return row.name || row.nev_hu || 'Ismeretlen gyülekezet'
}

/**
 * A lelkészi jelentés pillanatképéből a hivatalos Adatlap mutatóinak
 * FELOLDOTT számértékei.
 *
 * MIÉRT ITT ÉS ÍGY: a feloldás szabálya (felülírás > auto > kézi) és a magyar
 * szám-alak értelmezése a KANONIKUS helperekben él
 * (`lib/lelkeszi-jelentes/types.ts`) — ha itt újraírnánk, a jelentés és a
 * megyei összesítő ugyanarra a mezőre más számot mondana.
 */
function feloldJelentesMezok(snapshot: Record<string, unknown> | null): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  if (!snapshot || typeof snapshot !== 'object') return out
  const csoport = (kulcs: string): Record<string, unknown> => {
    const v = (snapshot as Record<string, unknown>)[kulcs]
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  }
  const felul = csoport('felulirasok')
  const auto = csoport('auto')
  const kezi = csoport('kezi')
  for (const mezoId of ADATLAP_MEZO_IDS) {
    // A `mezoErtek` prioritási sorrendje, kézzel követve a snapshot alakján
    // (a helper egy teljes LelkesziJelentesData objektumot vár, ami itt nincs).
    const f = felul[mezoId]
    const a = auto[mezoId]
    const k = kezi[mezoId]
    const nyers = f !== undefined && f !== null && f !== '' ? f : a !== undefined && a !== null ? a : k
    out[mezoId] = parseHuSzam(nyers as number | string | null | undefined)
  }
  return out
}

/** A megyei összesítőbe kerülő lelkészi-jelentés mutatók katalógusa. */
function jelentesMezoKatalogus() {
  const terkep = new Map(JELENTES_MEZOK.map((m) => [m.id, m]))
  return ADATLAP_MEZO_IDS.map((id) => {
    const mezo = terkep.get(id)
    return { id, label: mezo?.label || id, egyseg: mezo?.egyseg ?? null }
  })
}

/** A hatókör gyülekezetei — lapozva, fail-closed (üres hatókör → üres lista). */
async function olvasGyulekezetek(
  supabase: Supa,
  dioceseIds: string[],
): Promise<{ gyulekezetek: OsszesitoGyulekezet[]; error?: string }> {
  if (dioceseIds.length === 0) return { gyulekezetek: [] }
  const q = supabase
    .from('congregations')
    .select('id, name, nev_hu')
    .in('diocese_id', dioceseIds)
    .order('name')
  const { data, error } = await selectAllPaged<Record<string, unknown>>(q)
  if (error) {
    return {
      gyulekezetek: [],
      error:
        'A gyülekezetek listája most nem tölthető be, ezért az összesítőt nem számoltuk ki — ' +
        'egy hiányos lista rossz végösszeget adna. Próbáld újra néhány perc múlva.',
    }
  }
  return {
    gyulekezetek: data.map((r) => ({
      id: String(r.id),
      nev: congNev(r as { name?: string | null; nev_hu?: string | null }),
    })),
  }
}

/**
 * Az adott év beküldései a hatókör gyülekezeteitől — PILLANATKÉPPEL együtt.
 *
 * MIÉRT UTAZIK ITT A `snapshot_data` (a listás lekérdezésekkel ellentétben):
 * az összesítés MAGA a pillanatképek összeadása. Ezért csak EGY évre és csak
 * az összesítendő típusokra kérjük le, darabolt `.in()`-nel és lapozva.
 */
async function olvasBekuldesek(
  supabase: Supa,
  congIds: string[],
  ev: number,
): Promise<{ bekuldesek: OsszesitoBekuldes[]; error?: string }> {
  const bekuldesek: OsszesitoBekuldes[] = []
  for (const ids of chunk(congIds, IN_CHUNK)) {
    if (ids.length === 0) continue
    const q = supabase
      .from('document_submissions')
      .select('id, congregation_id, document_type, modification_number, status, submitted_at, snapshot_data')
      .in('congregation_id', ids)
      .eq('year', ev)
      .in('document_type', OSSZESITO_TIPUSOK)
    const { data, error } = await selectAllPaged<Record<string, unknown>>(q)
    if (error) {
      return {
        bekuldesek: [],
        error:
          'A beküldött iratok most nem olvashatók, ezért az összesítőt nem számoltuk ki — ' +
          'egy hiányos lista rossz végösszeget adna. Próbáld újra néhány perc múlva.',
      }
    }
    for (const r of data) {
      const tipus = String(r.document_type)
      const snapshot = (r.snapshot_data as Record<string, unknown> | null) ?? null
      bekuldesek.push({
        congregationId: String(r.congregation_id),
        documentType: tipus,
        modificationNumber: r.modification_number == null ? null : Number(r.modification_number),
        status: String(r.status ?? ''),
        submittedAt: (r.submitted_at as string | null) ?? null,
        snapshot,
        lelkesziMezok: tipus === 'lelkeszi_jelentes' ? feloldJelentesMezok(snapshot) : null,
      })
    }
  }
  return { bekuldesek }
}

/**
 * A számadási célok katalógusa (kód → név, bevétel/kiadás, sorrend).
 * FAIL-SOFT: ha nem olvasható, a sorok a kódjukkal jelennek meg — az
 * összesítő számai attól még helyesek (a besorolatlan kód a bevétel-oldalon,
 * láthatóan, nem eltüntetve).
 */
async function olvasKodKatalogus(supabase: Supa): Promise<KodKatalogusTetel[]> {
  // LAPOZVA: a számadási cél katalógus több száz soros, és a PostgREST 1000
  // soros plafonja némán csonkolna — a hiányzó kódok neve és bevétel/kiadás
  // besorolása veszne el (a besorolatlan kód a bevétel-oldalra kerülne).
  const { data, error } = await selectAllPaged<Record<string, unknown>>(
    supabase.from('szamadasicel').select('id, nev, type, sorszam'),
  )
  if (error) {
    console.error('[osszesito] a számadási cél katalógus nem olvasható:', error.message)
    return []
  }
  return (data as Array<Record<string, unknown>>).map((r) => ({
    kod: String(r.id),
    nev: (r.nev as string | null) ?? null,
    tipus: r.type === 'B' ? 'B' : r.type === 'K' ? 'K' : null,
    sorszam: r.sorszam == null ? null : Number(r.sorszam),
  }))
}

/** Mely években van egyáltalán beküldés a hatókörben (év-választóhoz). */
async function olvasEvek(supabase: Supa, congIds: string[]): Promise<number[]> {
  const evek = new Set<number>()
  for (const ids of chunk(congIds, IN_CHUNK)) {
    if (ids.length === 0) continue
    const q = supabase.from('document_submissions').select('id, year').in('congregation_id', ids)
    const { data, error } = await selectAllPaged<{ year: number | null }>(q)
    if (error) {
      console.error('[osszesito] év-lista lekérdezés hiba:', error.message)
      continue
    }
    for (const r of data) {
      if (typeof r.year === 'number' && Number.isFinite(r.year)) evek.add(r.year)
    }
  }
  const most = new Date().getFullYear()
  evek.add(most)
  evek.add(most - 1)
  return [...evek].sort((a, b) => b - a)
}

/**
 * Belső, KÖZÖS előkészítő: hatókör + adatok + számítás egy helyen.
 *
 * A felküldés (`veglegesitEsFelkuldOsszesito`) UGYANEZT hívja — így a
 * felküldött hivatalos pillanatkép bit-azonos azzal, amit az esperes a
 * képernyőn lát. Két külön számítás előbb-utóbb széthúzna.
 */
async function keszitOsszesito(
  ev: number,
): Promise<
  | {
      ok: true
      supabase: Supa
      dioceseId: string
      userId: string
      canWrite: boolean
      readOnlyReason: string | null
      dioceseNev: string | null
      osszesito: MegyeiOsszesito
      evek: number[]
      /** A felküldés állapota — EGY olvasásból (a számítás is ebből tudja a felküldés idejét). */
      felkuldes: { allapot?: OsszesitoFelkuldesAllapot; error?: string }
    }
  | { ok: false; error: string }
> {
  const ctx = await getDioceseScopeContext()
  if (!ctx.user) return { ok: false, error: 'Nincs bejelentkezve.' }
  if (!canReadDioceseScope(ctx.access)) {
    return { ok: false, error: 'Nincs jogosultsága az egyházmegyei összesítőhöz.' }
  }
  // FAIL-CLOSED: az összesítő EGY megye képe. A rendszergazdai „minden megye"
  // ág itt SZÁNDÉKOSAN nincs: egy országos összeg félrevezető hivatalos irat
  // lenne (nincs olyan szint, ami ezt felterjesztené).
  const dioceseId = ctx.readScopeIds[0] ?? null
  if (!dioceseId) {
    return {
      ok: false,
      error:
        'Nincs feloldható egyházmegye-hatóköre, ezért az összesítőt nem tudjuk kiszámolni. ' +
        'Kérje a rendszergazdát, hogy rendelje a szerepköréhez a megfelelő egyházmegyét.',
    }
  }

  const { gyulekezetek, error: gyErr } = await olvasGyulekezetek(ctx.supabase, [dioceseId])
  if (gyErr) return { ok: false, error: gyErr }

  const congIds = gyulekezetek.map((gy) => gy.id)
  const [{ bekuldesek, error: bekErr }, kodKatalogus, evek, dioceseRow, felkuldes] = await Promise.all([
    olvasBekuldesek(ctx.supabase, congIds, ev),
    olvasKodKatalogus(ctx.supabase),
    olvasEvek(ctx.supabase, congIds),
    ctx.supabase.from('dioceses').select('name').eq('id', dioceseId).maybeSingle(),
    olvasOsszesitoAllapot(ctx.supabase, dioceseId, ev),
  ])
  if (bekErr) return { ok: false, error: bekErr }

  const osszesito = szamitMegyeiOsszesito({
    ev,
    gyulekezetek,
    bekuldesek,
    kodKatalogus,
    mezoKatalogus: jelentesMezoKatalogus(),
    felkuldveEkkor: felkuldes.allapot?.submittedAt ?? null,
  })

  return {
    ok: true,
    supabase: ctx.supabase,
    dioceseId,
    userId: ctx.user.id,
    canWrite: ctx.canWrite,
    readOnlyReason: ctx.readOnlyReason,
    dioceseNev: formatEgyhazmegyeNev((dioceseRow.data as { name?: string | null } | null)?.name ?? null),
    osszesito,
    evek,
    felkuldes,
  }
}

/**
 * Az adott évi megyei összesítő + a felküldés állapota — a felület
 * adatcsomagja. FAIL-CLOSED: hibánál `{ error }` és NINCS részleges összeg.
 */
export async function getMegyeiOsszesito(ev: number): Promise<OsszesitoOldalAdat> {
  const keszult = await keszitOsszesito(ev)
  if (!keszult.ok) return { error: keszult.error }

  // EGY olvasás: a felküldés-állapotot a számítás előkészítője már lekérte
  // (a „felküldés óta érkezett-e újabb irat" őrhöz kell) — másodszor nem
  // kérdezzük meg, különben két, ELTÉRŐ pillanatból származó állapot
  // kerülhetne egy képernyőre.
  const allapot = keszult.felkuldes
  if (allapot.error) {
    // A SZÁMOK megvannak, csak a felküldés-állapot nem — ezt kimondjuk, de az
    // összesítőt megmutatjuk (a felküldés-gomb helyén a hiba magyarázatával).
    return {
      osszesito: keszult.osszesito,
      evek: keszult.evek,
      canWrite: keszult.canWrite,
      readOnlyReason: keszult.readOnlyReason,
      dioceseNev: keszult.dioceseNev,
      felkuldesHiba: allapot.error,
    }
  }

  return {
    osszesito: keszult.osszesito,
    evek: keszult.evek,
    canWrite: keszult.canWrite,
    readOnlyReason: keszult.readOnlyReason,
    dioceseNev: keszult.dioceseNev,
    felkuldes: allapot.allapot as OsszesitoFelkuldesAllapot,
  }
}

/**
 * Az összesítő VÉGLEGESÍTÉSE és FELKÜLDÉSE az egyházkerületnek — a KÖZÖS
 * véglegesítés-gomb akciója (Endre 4. döntése: egy megjelenés, egy viselkedés).
 *
 * A felküldött pillanatkép a SZERVEREN, frissen számolt összesítő — a
 * böngészőből érkező számot SOHA nem rögzítjük hivatalos iratként.
 */
export async function veglegesitEsFelkuldOsszesito(
  ev: number,
): Promise<{ success?: true; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // A számvevő ELLENŐRIZ, de nem terjeszt fel (Kánon 90.§ + Endre mátrixa).
  if (!canWriteDioceseScope(access)) {
    return { error: describeDioceseWriteBlock(access) ?? 'Nincs jogosultsága a felküldéshez.' }
  }

  const keszult = await keszitOsszesito(ev)
  if (!keszult.ok) return { error: keszult.error }

  const o = keszult.osszesito
  // ŐR: üres összesítőt nem terjesztünk fel. Az „elküldtem, de semmi nem volt
  // benne" a legrosszabb kimenet: a kerület kap egy hivatalos, üres csomagot.
  const vanAdat =
    o.szamadas.allapot.bekuldott.length > 0 ||
    o.koltsegvetes.allapot.bekuldott.length > 0 ||
    o.vagyonleltar.allapot.bekuldott.length > 0 ||
    o.valasztok.allapot.bekuldott.length > 0 ||
    o.lelkesziJelentes.allapot.bekuldott.length > 0
  if (!vanAdat) {
    return {
      error:
        `A(z) ${ev}. évre egyetlen gyülekezet sem küldött be véglegesített iratot, ezért nincs mit ` +
        'összesíteni. Amint megérkeznek a beküldések, az összesítő felküldhető lesz.',
    }
  }

  const res = await rogzitDioceseFelterjesztes(keszult.supabase, {
    dioceseId: keszult.dioceseId,
    userId: keszult.userId,
    docType: 'szamvevoi_osszesito',
    year: ev,
    snapshot: {
      // A fagyasztott hivatalos csomag: a teljes összesítő + az „alakVerzio",
      // hogy egy későbbi olvasó tudja, milyen szerkezetre számíthat.
      alakVerzio: 1,
      keszult: new Date().toISOString(),
      egyhazmegye: keszult.dioceseNev,
      osszesito: {
        ...o,
        // A „felküldés óta érkezett újabb irat" számláló a KÉPERNYŐ figyelmeztetése
        // (az ELŐZŐ felküldéshez mérve). A most fagyasztott csomagban 0 a helyes
        // érték: ebben a pillanatban a csomag teljes — különben egy rég orvosolt
        // riasztás ragadna bele a hivatalos iratba.
        felkuldesUtaniBekuldesek: 0,
      } as unknown as Record<string, unknown>,
    },
  })
  if (res.error) return { error: res.error }

  revalidatePath('/dashboard-egyhazmegye')
  revalidatePath('/dashboard-egyhazmegye/osszesito')
  return { success: true }
}

/**
 * Feloldás kérése a felküldött összesítőre — a KÖZÖS véglegesítés-gomb
 * „Feloldás kérése" útja (kötelező, ≥10 karakteres indoklással).
 *
 * A két ág (visszavonás / kerületi elbírálás) a közös adatrétegben él
 * (lib/finance/diocese-felterjesztes.ts) — lásd az ottani MIÉRT-et.
 */
export async function kerjOsszesitoFeloldas(
  ev: number,
  indoklas: string,
): Promise<{ visszavonva?: true; rogzitve?: true; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canWriteDioceseScope(access)) {
    return { error: describeDioceseWriteBlock(access) ?? 'Nincs jogosultsága a feloldás kéréséhez.' }
  }
  const trimmelt = (indoklas || '').trim()
  if (trimmelt.length < 10) {
    return { error: 'A feloldás kéréséhez legalább 10 karakteres indoklás szükséges.' }
  }

  const ctx = await getDioceseScopeContext()
  const dioceseId = ctx.writeScopeIds[0] ?? null
  if (!dioceseId) {
    return {
      error:
        'Nincs feloldható egyházmegye-hatóköre, ezért a feloldás-kérést nem indítottuk el. ' +
        'Kérje a rendszergazdát, hogy rendelje a szerepköréhez a megfelelő egyházmegyét.',
    }
  }

  const res = await keresOsszesitoFeloldas(ctx.supabase, {
    dioceseId,
    userId: access.user.id,
    year: ev,
    indoklas: trimmelt,
  })
  if (res.error) return { error: res.error }
  revalidatePath('/dashboard-egyhazmegye/osszesito')
  return res
}
