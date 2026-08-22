'use server'

/**
 * EGYHÁZKERÜLETI NYUGTATÖMBÖK — szerver akciók
 * (`chitanta_tombok`, scope = 'egyhazkerulet'; 2026-08-17, kerületi S6).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT LÉTEZIK EZ A FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * Az S5c SQL (2026-08-17-egyhazkeruleti-S5c-storage-bank.sql) az ADATBÁZIS
 * oldalát már megnyitotta a kerületi nyugtatömbnek:
 *   · `chitanta_tombok.district_id` oszlop + FK a `districts(id)`-re,
 *   · a scope-CHECK ismeri az `egyhazkerulet` értéket,
 *   · a `chitanta_tombok_scope_fk_check` kerületi ága: scope='egyhazkerulet'
 *     esetén `district_id IS NOT NULL AND congregation_id IS NULL AND
 *     diocese_id IS NULL`,
 *   · 2 részleges index + 4 kerületi RLS-láb (select/insert/update/delete).
 * Az oszlop kommentje szó szerint kimondja: „⚠️ A KERÜLETI nyugtatömb-FELÜLET
 * még nem épült meg". Ez a fájl az a hiányzó app-oldal.
 *
 * A megyei párja (dashboard-egyhazmegye/chitanta-tombok-actions.ts) BYTE-RA
 * VÁLTOZATLAN marad — ez ÚJ fájl, nem a megyei kiterjesztése. A gyülekezeti út
 * (penzugy/chitanta-tombok-actions.ts) szintén érintetlen.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HATÓKÖR — FAIL-CLOSED, KÉT SZINTEN
 * ────────────────────────────────────────────────────────────────────────────
 * A hatókört KIZÁRÓLAG a lib/auth/level-scope.ts szerep-SZŰRT feloldói adják
 * (`resolveDistrictReadScopeIds` / `resolveDistrictWriteScopeIds`), amelyek az
 * adatbázis `current_user_district_olvaso_ids()` / `current_user_district_ids()`
 * függvényeinek a tükörképei. Üres hatókör → BESZÉDES MAGYAR HIBA, SOHA nem
 * szűretlen lekérdezés („skalár hatókör + if (id) filter = néma teljes
 * szivárgás" hibaosztály).
 *
 * A KÉT SZINT: az egyházkerületi SZÁMVEVŐ (ellenőr) OLVAS — megnézheti a
 * tömböket, mert a nyugtatömb-tartomány a pénzügyi ellenőrzés része —, de NEM
 * ÍR: nem nyit, nem zár le, nem töröl. Ezt a felület a lista `canWrite` /
 * `readOnlyReason` mezőiből ELŐRE tudja (letiltott gomb + magyarázat), nem egy
 * néma 403 vagy 0-soros UPDATE után.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * MIÉRT SZIGORÚBB EZ A MEGYEI PÁRJÁNÁL — HÁROM PONTON
 * ────────────────────────────────────────────────────────────────────────────
 * A megyei fájl 2026-04-18 óta él, és a viselkedéséhez SZÁNDÉKOSAN nem nyúlunk.
 * Az ÚJ kerületi ágon viszont nincs mit visszamenőleg elrontani, ezért három
 * ismert hibaosztályt itt eleve lezárunk:
 *
 *   (1) A SOR AZONOSÍTÓJA A KLIENSTŐL JÖN. A lezárás/törlés nem a hívó által
 *       küldött hatókörre hisz, hanem BETÖLTI a sort, és a SOR SAJÁT
 *       `district_id`-jára ellenőrzi az írási jogot (a `betoltFelterjesztes`
 *       mintája, felterjesztes-actions.ts). Ne lehessen más kerület tömbjét
 *       lezárni egy kitalált azonosítóval.
 *
 *   (2) SCOPE-KAPU MINDEN ÍRÁSNÁL. Minden lekérdezés és minden írás
 *       `.eq('scope', 'egyhazkerulet')`-tel megy, és a betöltött sor scope-ját
 *       is ellenőrizzük. Enélkül egy gyülekezeti vagy megyei tömb azonosítója
 *       ezen az ajtón át módosítható lenne — pontosan az, amit a „gyülekezeti
 *       és megyei út byte-ra változatlan" követelmény tilt.
 *
 *   (3) NINCS „HAMIS SIKER". Az UPDATE/DELETE `.select('id')`-vel tér vissza,
 *       és ha NULLA sort érintett, HIBÁT adunk. Az RLS ezeknél nem hibázik,
 *       hanem 0 sort érint — a megyei ág ilyenkor „Lezárva."-t mondana, pedig
 *       semmi nem történt.
 *
 * Negyedikként az átfedés-vizsgálat hibáját sem nyeljük el: ha a vizsgálat nem
 * futtatható, NEM szúrunk be. Egy át nem szűrt átfedés két hivatalos nyugtát
 * jelentene UGYANAZZAL a nyomdai számmal — visszafordíthatatlan kár.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️ AMI SZÁNDÉKOSAN NINCS BENNE
 * ────────────────────────────────────────────────────────────────────────────
 * A `felhasznalt_darabszam` mezőt ez a modul SOHA nem írja (a nyitáskor 0).
 * A gyülekezeti szinten ezt kizárólag a `next_chitanta_full` RPC (hivatalos
 * auto-kiállítás) növeli, és mellette a `@kartoteka/core`
 * `getChitantaTombUsageUseCase` SZÁMÍTOTT elhasználtságot ad a berögzített
 * nyugtaszámokból. Egyik sem terjed ki a felsőbb szintekre: a megyei ág sem
 * számol, és a `penzugy/actions.ts` is kimondja, hogy a „nyugta-kronológia
 * egyik felső szinten sem létezik". Ezért a felület NEM állít oda kitalált
 * „következő számot" — a KPI mellett ki van írva, hogy a számláló kézi
 * nyilvántartás, és kiállítás előtt a fizikai tömböt kell megnézni. Egy rossz
 * „következő szám" duplán kiadott, ALÁÍRT nyugtát okozna: rosszabb, mint egy
 * hiányzó adat.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  getEffectiveAccessContext,
  type EffectiveAccessContext,
} from '@/lib/auth/effective-access'
import {
  canWriteDistrictScope,
  describeDistrictWriteBlock,
  resolveDistrictReadScopeIds,
  resolveDistrictWriteScopeIds,
} from '@/lib/auth/level-scope'
import { isMissingColumnError } from '@/lib/utils/schema-errors'

// ---------------------------------------------------------------------------
// Típusok
// ---------------------------------------------------------------------------

/** Egy kerületi nyugtatömb sora. A megyei `DioceseChitantaTomb` tükre. */
export interface KeruletiChitantaTomb {
  id: string
  district_id: string
  scope: 'egyhazkerulet'
  block_nr: string | null
  seria: string
  szam_kezdet: number
  szam_veg: number
  darabszam_ossz: number
  felhasznalt_darabszam: number
  vasarlas_datuma: string
  vasarlas_ara: number | null
  elso_hasznalat_datum: string | null
  utolso_hasznalat_datum: string | null
  aktiv: boolean
  megjegyzes: string | null
  created_at: string
}

/** Az aktív tömb élő státusza (maradék darabszám). */
export interface KeruletiChitantaTombStatusz {
  id: string
  seria: string
  szam_kezdet: number
  szam_veg: number
  felhasznalt: number
  maradek: number
  /**
   * A NYILVÁNTARTÁS szerinti következő szám — `null`, ha a tömb elfogyott.
   *
   * ⚠️ NEM tény, hanem a kézi számlálóból (`felhasznalt_darabszam`) képzett
   *    érték: a kerületi szinten NINCS automatikus nyugta-kiállítás, ami
   *    növelné (lásd a fájl fejlécének „AMI SZÁNDÉKOSAN NINCS BENNE" pontját).
   *    A felület KÖTELES ezt kiírni a szám mellé.
   */
  kovetkezo_szam: number | null
}

/** A lista adatcsomagja — a gombok ELŐZETES tiltásához is elég. */
export interface KeruletiChitantaTombLista {
  data: KeruletiChitantaTomb[]
  /** A feloldott egyházkerület azonosítója (a további műveletekhez). */
  districtId: string | null
  /**
   * Írhat-e a hívó EZEN az egyházkerületen (nyitás / lezárás / törlés)?
   * A felület ebből tiltja le a gombokat — ELŐRE, nem egy néma hiba után.
   */
  canWrite: boolean
  /** Miért nem írhat — a letiltott gomb tooltipjébe ÉS a szerver-hibába. */
  readOnlyReason: string | null
  error?: string
}

// ---------------------------------------------------------------------------
// Belső segédek
// ---------------------------------------------------------------------------

type Supa = EffectiveAccessContext['supabase']

/**
 * A hatókör-feloldás eredménye. `districtId` MINDIG konkrét — nincs „minden
 * kerület" ág: egy nyugtatömb fizikailag EGY egyházkerület tulajdona, a
 * szűretlen nézetnek itt semmi értelme nem lenne (és a `district_id NOT NULL`
 * miatt beszúrni sem lehetne).
 */
interface KeruletiTombKontextus {
  supabase: Supa
  userId: string
  districtId: string
  canWrite: boolean
  readOnlyReason: string | null
}

/**
 * A séma-drift (le nem futott migráció) BESZÉDES magyar mondata.
 *
 * TÜNET, AMI ELLEN VÉD: ha az S5c SQL valamiért mégsem futott le az éles
 * adatbázison, a PostgREST „Could not find the 'district_id' column" hibát ad.
 * Ez a lelkésznek semmit nem mond, viszont belső részletet szivárogtat — és a
 * „migration-fájl nem bizonyíték" tanulság szerint pontosan ezt a széthúzást
 * kell HANGOSAN kimondani.
 */
function semaDriftUzenet(): string {
  return (
    'Az egyházkerületi nyugtatömb-nyilvántartás oszlopai még hiányoznak az adatbázisból. ' +
    'Futtasd le a 2026-08-17-egyhazkeruleti-S5c-storage-bank.sql fájlt, majd próbáld újra.'
  )
}

/** Nyers adatbázis-hiba → lelkész-barát mondat (a részlet zárójelben marad). */
function olvasasiHiba(muvelet: string, uzenet: string): string {
  if (isMissingColumnError(uzenet)) return semaDriftUzenet()
  return `${muvelet} most nem sikerült. Próbáld újra néhány perc múlva (részlet: ${uzenet}).`
}

/**
 * Jogosultság + hatókör feloldása — FAIL-CLOSED.
 *
 * @param districtIdFromInput a hívó által megadott egyházkerület. Ha nincs, az
 *   ÍRÓI hatókör első eleme, majd az OLVASÓI hatóköré. (A megyei párja a
 *   szerep-SZŰRETLEN `resolveDioceseScopeIds`-ből választ alapértelmezést; itt
 *   szándékosan a szerep-SZŰRT listákból, hogy az app és az RLS ugyanarra a
 *   kerületre gondoljon — az S1 tanulsága: a szerep-szűretlen feloldó feloldott
 *   egy kerületet, az RLS meg 0 sort adott rá, hibaüzenet nélkül.)
 * @param mode `'read'` = listázás, státusz (a kerületi SZÁMVEVŐ is átmegy);
 *   `'write'` = nyitás / lezárás / törlés (csak egyházkerületi adminisztrátor).
 */
async function requireDistrictAccess(
  districtIdFromInput?: string | null,
  mode: 'read' | 'write' = 'write',
): Promise<KeruletiTombKontextus | { error: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  const readIds = resolveDistrictReadScopeIds(access)
  const writeIds = resolveDistrictWriteScopeIds(access)
  const isSystemAdmin = !!access.admin || !!access.master

  const targetId = districtIdFromInput || writeIds[0] || readIds[0] || null
  if (!targetId) {
    // A rendszergazdának MÁS a helyzete, mint a hatókör nélküli kerületi
    // felhasználónak: neki van joga, csak nincs megadva, MELYIK kerületről van
    // szó. Két külön mondat, mert két külön teendő tartozik hozzájuk.
    return {
      error: isSystemAdmin
        ? 'Rendszergazdaként add meg, MELYIK egyházkerület nyugtatömbjeiről van szó — ' +
          'a nyugtatömb mindig egyetlen egyházkerület tulajdona, ezért „minden kerület” nézet nincs. ' +
          'Válts a fejlécben arra a profilra, amelyikhez egyházkerület tartozik.'
        : 'Nincs feloldható egyházkerület-hatóköre — az adatok védelme érdekében nem jelenítünk meg ' +
          'nyugtatömböket. Kérd a rendszergazdától, hogy rendelje a szerepköréhez a megfelelő ' +
          'egyházkerületet, vagy — ha több profilod van — válts profilt a fejlécben.',
    }
  }

  // OLVASÁS: az ellenőri (számvevői) hatókör is elég. A rendszergazda/master
  // szint-független ága explicit, nem egy NULL-hatókör néma mellékhatása.
  const olvashat = isSystemAdmin || readIds.includes(targetId)
  if (!olvashat) {
    return {
      error:
        'Ehhez az egyházkerülethez nincs hozzáférésed. Ha úgy gondolod, hogy neked járna, ' +
        'kérd a rendszergazdától.',
    }
  }

  // ÍRÁS: a ház kanonikus predikátuma, KERÜLETRE SZŰRVE. A hatókör-független
  // változat annak adna írási jogot a B kerület tömbjeire, aki az A-ban
  // adminisztrátor, a B-ben viszont csak számvevő.
  const canWrite = canWriteDistrictScope(access, targetId)
  const readOnlyReason = canWrite ? null : describeDistrictWriteBlock(access, targetId)

  if (mode === 'write' && !canWrite) {
    return {
      error:
        readOnlyReason ||
        'Ehhez a művelethez egyházkerületi adminisztrátori jogosultság kell.',
    }
  }

  return {
    supabase: access.supabase,
    userId: access.user.id,
    districtId: targetId,
    canWrite,
    readOnlyReason,
  }
}

/**
 * Egy KERÜLETI tömb betöltése + hatókör-ellenőrzés a SOR saját kerületére.
 *
 * MIÉRT NEM ELÉG AZ RLS: a sor `id`-ja a klienstől jön. Ha csak az RLS védene,
 * egy elgépelt/kitalált azonosítóra a viselkedés attól függne, hogy éppen
 * milyen policy-k élnek — a repó és az éles adatbázis pedig már kétszer némán
 * széthúzott. A `scope` ellenőrzése ugyanilyen fontos: enélkül ezen az ajtón
 * egy GYÜLEKEZETI vagy MEGYEI tömb is módosítható lenne.
 */
async function betoltKeruletiTomb(
  supabase: Supa,
  id: string,
  oszlopok: string,
): Promise<{ sor: Record<string, unknown> } | { error: string }> {
  const { data, error } = await supabase
    .from('chitanta_tombok')
    .select(oszlopok)
    .eq('id', id)
    .eq('scope', 'egyhazkerulet')
    .maybeSingle()

  if (error) return { error: olvasasiHiba('A nyugtatömb beolvasása', error.message) }

  const sor = data as Record<string, unknown> | null
  if (!sor) {
    return {
      error:
        'Ez az egyházkerületi nyugtatömb nem található, vagy nincs hozzáférésed. ' +
        'Frissítsd az oldalt — lehet, hogy időközben törölték.',
    }
  }
  if (sor.scope !== 'egyhazkerulet' || !sor.district_id) {
    // Elvileg ide nem juthatunk (a lekérdezés szűr rá) — de ha az adatbázis
    // mégis mást adna vissza, MEGÁLLUNK. Nem „javítunk" magunktól hivatalos
    // nyilvántartáson.
    return {
      error:
        'Ez a nyugtatömb nem egyházkerületi hatókörű, ezért innen nem módosítható. ' +
        'Jelezd a rendszergazdának.',
    }
  }
  return { sor }
}

// ---------------------------------------------------------------------------
// 1) Listázás
// ---------------------------------------------------------------------------

/**
 * Az egyházkerület nyugtatömbjei, a gombok tiltásához szükséges jogosultsággal
 * együtt. A megyei `listDioceseChitantaTombok` párja — kiegészítve a
 * `canWrite` / `readOnlyReason` mezőkkel, mert az S3 óta ez a kerületi ág
 * bevett alakja (a felület ELŐRE tudja, mit nem tehet).
 */
export async function listKeruletiChitantaTombok(
  districtId?: string,
): Promise<KeruletiChitantaTombLista> {
  const ures = { data: [], districtId: null, canWrite: false, readOnlyReason: null }

  const ctx = await requireDistrictAccess(districtId, 'read')
  if ('error' in ctx) return { ...ures, error: ctx.error }

  const { data, error } = await ctx.supabase
    .from('chitanta_tombok')
    .select('*')
    .eq('scope', 'egyhazkerulet')
    .eq('district_id', ctx.districtId)
    .order('szam_kezdet', { ascending: true })

  if (error) {
    return {
      data: [],
      districtId: ctx.districtId,
      canWrite: ctx.canWrite,
      readOnlyReason: ctx.readOnlyReason,
      error: olvasasiHiba('A nyugtatömbök betöltése', error.message),
    }
  }

  return {
    data: (data || []) as KeruletiChitantaTomb[],
    districtId: ctx.districtId,
    canWrite: ctx.canWrite,
    readOnlyReason: ctx.readOnlyReason,
  }
}

// ---------------------------------------------------------------------------
// 2) Az aktív tömb státusza (maradék darabszám)
// ---------------------------------------------------------------------------

export async function getAktivKeruletiChitantaTombStatus(districtId?: string): Promise<{
  active?: KeruletiChitantaTombStatusz | null
  error?: string
}> {
  const ctx = await requireDistrictAccess(districtId, 'read')
  if ('error' in ctx) return { error: ctx.error }

  const { data, error } = await ctx.supabase
    .from('chitanta_tombok')
    .select('id, seria, szam_kezdet, szam_veg, darabszam_ossz, felhasznalt_darabszam')
    .eq('scope', 'egyhazkerulet')
    .eq('district_id', ctx.districtId)
    .eq('aktiv', true)
    .order('szam_kezdet', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return { error: olvasasiHiba('Az aktív nyugtatömb lekérdezése', error.message) }
  if (!data) return { active: null }

  const row = data as {
    id: string
    seria: string
    szam_kezdet: number
    szam_veg: number
    darabszam_ossz: number
    felhasznalt_darabszam: number
  }
  const felhasznalt = row.felhasznalt_darabszam || 0
  const maradek = (row.darabszam_ossz || 0) - felhasznalt

  return {
    active: {
      id: row.id,
      seria: row.seria,
      szam_kezdet: row.szam_kezdet,
      szam_veg: row.szam_veg,
      felhasznalt,
      maradek,
      kovetkezo_szam: maradek > 0 ? row.szam_kezdet + felhasznalt : null,
    },
  }
}

// ---------------------------------------------------------------------------
// 3) Új nyugtatömb rögzítése
// ---------------------------------------------------------------------------

const createSchema = z.object({
  /** Opcionális belső tömb-sorszám (a nyomda nem mindig ad ilyet). */
  block_nr: z.string().optional().or(z.literal('')),
  seria: z.string().min(1, 'A széria kötelező — a tömbre nyomtatott betűjel.'),
  szam_kezdet: z.number().int().positive(),
  szam_veg: z.number().int().positive(),
  darabszam_ossz: z.number().int().positive(),
  vasarlas_datuma: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ÉÉÉÉ-HH-NN formátum.'),
  vasarlas_ara: z.number().min(0).optional().nullable(),
  megjegyzes: z.string().optional().or(z.literal('')),
  /** Melyik egyházkerülethez — a felület mindig kitölti a saját hatóköréből. */
  districtId: z.string().uuid().optional(),
})

export type CreateKeruletiChitantaTombInput = z.infer<typeof createSchema>

export async function createKeruletiChitantaTomb(
  input: CreateKeruletiChitantaTombInput,
): Promise<{ id?: string; error?: string; fieldErrors?: Record<string, string> }> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Érvénytelen adat.', fieldErrors }
  }

  if (parsed.data.szam_veg < parsed.data.szam_kezdet) {
    return { error: 'A végszám nem lehet kisebb a kezdőszámnál.' }
  }
  const computedDarab = parsed.data.szam_veg - parsed.data.szam_kezdet + 1
  if (computedDarab !== parsed.data.darabszam_ossz) {
    return {
      error:
        `A darabszám (${parsed.data.darabszam_ossz}) nem egyezik a kezdő- és végszám közötti ` +
        `darabokkal (${computedDarab}).`,
    }
  }

  const ctx = await requireDistrictAccess(parsed.data.districtId, 'write')
  if ('error' in ctx) return { error: ctx.error }

  // ── Átfedés-vizsgálat ugyanazon a szérián belül ──────────────────────────
  // ⚠️ A HIBÁT NEM NYELJÜK EL (a megyei ág `const { data: overlap } = …`
  //    alakja elnyeli): ha a vizsgálat nem futtatható, NEM szúrunk be. Egy
  //    átcsúszott átfedés két hivatalos, ALÁÍRHATÓ nyugtát jelentene ugyanazzal
  //    a nyomdai számmal — ezt utólag nem lehet visszavonni. Inkább maradjon el
  //    a felvétel, magyarázattal.
  const { data: overlap, error: overlapError } = await ctx.supabase
    .from('chitanta_tombok')
    .select('id, seria, szam_kezdet, szam_veg')
    .eq('scope', 'egyhazkerulet')
    .eq('district_id', ctx.districtId)
    .eq('seria', parsed.data.seria)
    .gte('szam_veg', parsed.data.szam_kezdet)
    .lte('szam_kezdet', parsed.data.szam_veg)

  if (overlapError) {
    if (isMissingColumnError(overlapError.message)) return { error: semaDriftUzenet() }
    return {
      error:
        'A meglévő tömbök átfedés-vizsgálata nem futtatható, ezért a felvétel biztonsági okból ' +
        'elmaradt — enélkül két nyugta kaphatna azonos sorszámot. Próbáld újra néhány perc múlva ' +
        `(részlet: ${overlapError.message}).`,
    }
  }
  if (overlap && overlap.length > 0) {
    const utkozo = overlap[0] as { seria: string; szam_kezdet: number; szam_veg: number }
    return {
      error:
        `Átfedés van a(z) „${parsed.data.seria}” szériánál egy korábbi tömbbel ` +
        `(${utkozo.szam_kezdet}–${utkozo.szam_veg}). Ellenőrizd a kezdő- és végszámot.`,
    }
  }

  // ⚠️ A CHECK (`chitanta_tombok_scope_fk_check`) kerületi ága EGYSZERRE követeli
  //    meg, hogy a `district_id` ki legyen töltve, ÉS hogy a `congregation_id`
  //    és a `diocese_id` NULL legyen. Ezért mindkettőt EXPLICIT NULL-ra írjuk:
  //    így egy későbbi séma-alapértelmezés sem csúsztathat be értéket.
  const payload = {
    scope: 'egyhazkerulet',
    district_id: ctx.districtId,
    congregation_id: null,
    diocese_id: null,
    block_nr: parsed.data.block_nr || null,
    seria: parsed.data.seria,
    szam_kezdet: parsed.data.szam_kezdet,
    szam_veg: parsed.data.szam_veg,
    darabszam_ossz: parsed.data.darabszam_ossz,
    felhasznalt_darabszam: 0,
    vasarlas_datuma: parsed.data.vasarlas_datuma,
    vasarlas_ara: parsed.data.vasarlas_ara ?? null,
    aktiv: true,
    megjegyzes: parsed.data.megjegyzes || null,
  }

  const { data, error } = await ctx.supabase
    .from('chitanta_tombok')
    .insert([payload])
    .select('id')
    .single()

  if (error) {
    if (isMissingColumnError(error.message)) return { error: semaDriftUzenet() }
    // Az RLS INSERT-nél HIBÁT ad (nem 0 sort) — ezt lefordítjuk magyarra, hogy
    // a felhasználó tudja: nem elgépelt adat, hanem jogosultság a gond.
    if (error.message.toLowerCase().includes('row-level security')) {
      return {
        error:
          'Az adatbázis jogosultsági kapuja nem engedte a felvételt ezen az egyházkerületen. ' +
          'Ez akkor fordul elő, ha a szerepköröd időközben megváltozott — jelentkezz ki és be, ' +
          'és ha megmarad, jelezd a rendszergazdának.',
      }
    }
    return { error: `A nyugtatömb felvétele nem sikerült (részlet: ${error.message}).` }
  }

  revalidatePath('/dashboard-kerulet/nyugtatombok')
  return { id: (data as { id: string }).id }
}

// ---------------------------------------------------------------------------
// 4) Tömb lezárása (kézi befejezés)
// ---------------------------------------------------------------------------

/**
 * A tömb lezárása. Az `utolso_hasznalat_datum` a LEZÁRÁS napja lesz — ez a
 * megyei ág viselkedése, és a nyilvántartásban ez a „mikor tettük félre" dátum.
 */
export async function closeKeruletiChitantaTomb(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  const betoltott = await betoltKeruletiTomb(
    access.supabase,
    id,
    'id, district_id, scope, seria, aktiv',
  )
  if ('error' in betoltott) return { error: betoltott.error }

  // A jogot a SOR SAJÁT kerületére kérjük — nem a hívó által küldött értékre.
  const ctx = await requireDistrictAccess(String(betoltott.sor.district_id), 'write')
  if ('error' in ctx) return { error: ctx.error }

  if (betoltott.sor.aktiv === false) {
    return { error: 'Ez a nyugtatömb már le van zárva.' }
  }

  const { data, error } = await ctx.supabase
    .from('chitanta_tombok')
    .update({ aktiv: false, utolso_hasznalat_datum: new Date().toISOString().slice(0, 10) })
    .eq('id', id)
    .eq('scope', 'egyhazkerulet')
    .eq('district_id', ctx.districtId)
    .select('id')

  if (error) return { error: olvasasiHiba('A nyugtatömb lezárása', error.message) }
  // ⚠️ NINCS HAMIS SIKER: az RLS UPDATE-nél nem hibázik, hanem 0 sort érint.
  if (!data || data.length === 0) {
    return {
      error:
        'A lezárás NEM történt meg: az adatbázis egyetlen sort sem módosított. ' +
        'Ez akkor fordul elő, ha időközben megváltozott a jogosultságod, vagy a tömb már nem ' +
        'létezik. Frissítsd az oldalt, és ha megmarad, jelezd a rendszergazdának.',
    }
  }

  revalidatePath('/dashboard-kerulet/nyugtatombok')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 5) Tömb törlése (csak ha még nincs használatban)
// ---------------------------------------------------------------------------

export async function deleteKeruletiChitantaTomb(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  const betoltott = await betoltKeruletiTomb(
    access.supabase,
    id,
    'id, district_id, scope, seria, felhasznalt_darabszam',
  )
  if ('error' in betoltott) return { error: betoltott.error }

  const ctx = await requireDistrictAccess(String(betoltott.sor.district_id), 'write')
  if ('error' in ctx) return { error: ctx.error }

  // ⚠️ A ZÁRÓJEL SZÁMÍT: `a ?? 0 > 0` a `??` alacsonyabb precedenciája miatt
  //    `a ?? (0 > 0)`-t jelentene. Használt tömböt SOHA nem törlünk — a kiadott
  //    nyugták nyoma nem tűnhet el a nyilvántartásból.
  const felhasznalt = Number(betoltott.sor.felhasznalt_darabszam ?? 0)
  if (felhasznalt > 0) {
    return {
      error:
        `Ebből a tömbből már ${felhasznalt} nyugtát kiállítottak, ezért nem törölhető. ` +
        'Ha nem használod tovább, ZÁRD LE — így a nyilvántartásban megmarad a nyoma.',
    }
  }

  const { data, error } = await ctx.supabase
    .from('chitanta_tombok')
    .delete()
    .eq('id', id)
    .eq('scope', 'egyhazkerulet')
    .eq('district_id', ctx.districtId)
    .select('id')

  if (error) return { error: olvasasiHiba('A nyugtatömb törlése', error.message) }
  // ⚠️ NINCS HAMIS SIKER — a DELETE-nél az RLS szintén 0 sort érint, nem hibázik.
  if (!data || data.length === 0) {
    return {
      error:
        'A törlés NEM történt meg: az adatbázis egyetlen sort sem érintett. Frissítsd az oldalt, ' +
        'és ha megmarad, jelezd a rendszergazdának.',
    }
  }

  revalidatePath('/dashboard-kerulet/nyugtatombok')
  return { ok: true }
}
