'use server'

import { randomUUID } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { selectAllPaged } from '@kartoteka/supabase-client'
import { z } from 'zod'
import { programSchema, batchRowSchema, type ProgramInput } from '@/lib/validations/dashboard'
import type { Program } from '@/lib/constants/dashboard'
import { isAnyakonyviProgramTipus, isMaganProgramTipus } from '@/lib/constants/dashboard'
import { ISMETLODO_SOROZAT_ANYAKONYV_HIBA, PROGRAM_TIPUS_ANYAKONYV_TABLA } from '@/lib/calendar/naptar-retegek-types'
import { programEvMetszetSzuro } from '@/lib/calendar/program-ev-metszet'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { logAuditEvent } from '@/lib/audit/log'
import { isMissingDeletedColumn } from '@/lib/worklog/registry-sync'

/**
 * A gyülekezet weboldalának ESEMÉNY-KAPUJA (2026-08-27).
 *
 * ⛔ MI VOLT A HIBA (Endre jelezte): „a rögzített program nem jelent meg a
 * weboldalon". A programon BE volt kapcsolva a „Megjelenhet a gyülekezet
 * weboldalán", csakhogy KÉT kapcsoló kell: a weboldalon külön be kell
 * kapcsolni a „Közelgő események" szekciót is (Publikus oldal → Beállítások),
 * és az ALAPBÓL KI VAN KAPCSOLVA.
 *
 * A program-ablak kapcsolója viszont azt ígérte, hogy az alkalom „megjelenhet
 * a weboldalon" — miközben egy másik, láthatatlan kapcsoló megvétózta. A
 * felhasználó mentett, és nem történt semmi: néma hiba, ami szoftverhibának
 * látszik.
 *
 * Ezért a program-ablak MEGKÉRDEZI ezt az állapotot, és ha a szekció ki van
 * kapcsolva, ott helyben meg is mondja — nem a weboldalon kell rájönni.
 *
 * Hibánál `null`-t ad: ilyenkor a felület NEM állít semmit (nem ijesztget
 * hamis figyelmeztetéssel, és nem is nyugtat meg tévesen).
 */
export async function getWeboldalEsemenyKapu(): Promise<{
  vanPublikaltOldal: boolean
  esemenyekBekapcsolva: boolean
} | null> {
  try {
    const { supabase, congregationId } = await getEffectiveCongregationContext()
    if (!congregationId) return null

    const { data, error } = await supabase
      .from('public_sites')
      .select('is_published, show_events')
      .eq('congregation_id', congregationId)
      .maybeSingle()

    // A `show_events` oszlop a 2026-08-26-i migrációval jött — ha egy
    // adatbázisban még nincs meg, ne találgassunk.
    if (error || !data) return null

    return {
      vanPublikaltOldal: data.is_published === true,
      esemenyekBekapcsolva: data.show_events === true,
    }
  } catch {
    return null
  }
}

export async function getProgramsForYear(year: number): Promise<Program[]> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return []
  // 2026-08-26 (5. kör): LAPOZVA — a korábbi limit nélküli lekérdezést a
  // PostgREST 1000 soros néma plafonja csonkolhatta (ismert hibaosztály:
  // sűrűn programozó gyülekezetnél a naptár fele hang nélkül eltűnt volna).
  // 2026-09-05 (cal-print-11, P3-utómunka): az ÉV METSZETE, nem a kezdő nap éve.
  // Az előző év végén kezdődő, nem ismétlődő, többnapos program (dec. 30. –
  // jan. 2.) eddig januárban SEHOL nem volt (csempe, éves programterv). A
  // szabály egy helyen él (lib/calendar/program-ev-metszet.ts): kezdő nap ≤ év
  // vége ÉS (záró nap VAGY kezdő nap) ≥ év eleje — NULL záró napnál a kezdő dönt.
  const evSzuro = programEvMetszetSzuro(year)
  const [evesRes, recurringRes] = await Promise.all([
    selectAllPaged<Program>(
      supabase
        .from('gyulekezeti_programok')
        .select('*')
        .eq('congregation_id', congregationId)
        .lte('datum', evSzuro.datumLegfeljebb)
        .or(evSzuro.vagySzuro)
        .order('datum')
        .order('ido_kezdes'),
    ),
    // 2026-08-02 (PR-20): a KORÁBBI években indult ISMÉTLŐDŐ sorozatok is
    // kellenek — a heti bibliaóra eddig az új évre lapozva egyszerűen eltűnt
    // (a kibontás horizontja + a betöltés év-szűrése együtt vágta el).
    // Legfeljebb 5 évre visszamenőleg (a kibontás-plafon így is bőven fedi;
    // az ismetlodes_vege bevezetésével a régebbi sorozatok amúgy is lezárulnak).
    selectAllPaged<Program>(
      supabase
        .from('gyulekezeti_programok')
        .select('*')
        .eq('congregation_id', congregationId)
        .not('ismetlodes_tipus', 'is', null)
        .gte('datum', `${year - 5}-01-01`)
        .lt('datum', `${year}-01-01`)
        .order('datum'),
    ),
  ])
  // 2026-06-07: a hibát nem nyeljük el csendben — feldobjuk, hogy a kliens
  // egyértelmű üzenetet adhasson és a „Betöltés…" ne ragadjon be.
  if (evesRes.error) throw new Error(evesRes.error.message)
  if (recurringRes.error) throw new Error(recurringRes.error.message)
  // Egy sor MINDKÉT lekérdezésből jöhet: az előző évben indult, az évbe átnyúló
  // ISMÉTLŐDŐ sorozatot a metszet-szűrő ÉS a sorozat-lekérdezés is hozza. Id
  // szerint egyszer tartjuk meg — különben a kibontás megduplázná az alkalmait.
  const egyszer = new Map<string, Program>()
  for (const p of [...recurringRes.data, ...evesRes.data]) egyszer.set(p.id, p)
  return [...egyszer.values()]
}

/**
 * A gyülekezet naptár-feed tokenje (Google Naptár összekötéshez) —
 * 2026-08-02 (PR-20). A token a congregations.calendar_feed_token oszlopban
 * él (2026-08-02-pr20-naptar-feed.sql hozza létre).
 */
export async function getCalendarFeedToken(): Promise<{ token: string | null; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { token: null, error: 'Nincs aktív gyülekezet kiválasztva.' }
  const { data, error } = await supabase
    .from('congregations')
    .select('calendar_feed_token')
    .eq('id', congregationId)
    .maybeSingle()
  if (error) {
    // Tipikusan: az oszlop még nem létezik → hangos, cselekvésre mutató hiba
    return { token: null, error: 'A naptár-hivatkozás nem érhető el. (Lefutott már a 2026-08-02-es naptár-feed adatbázis-migráció?)' }
  }
  const token = (data as { calendar_feed_token?: string | null } | null)?.calendar_feed_token ?? null
  if (!token) {
    return { token: null, error: 'A gyülekezetnek még nincs naptár-hivatkozása — futtasd le a 2026-08-02-es naptár-feed migrációt.' }
  }
  return { token }
}

/**
 * ÚJ NAPTÁR-HIVATKOZÁS KÉRÉSE — a régi azonnal érvénytelenné válik.
 * (2026-09-04, a védelmi felülvizsgálat P0·9 találata.)
 *
 * ⛔ MI HIÁNYZOTT: a `congregations.calendar_feed_token` maga a feed
 *    HITELESÍTŐJE — aki ismeri, letölti a gyülekezet teljes programlistáját.
 *    A repóban viszont EGYETLEN kódút sem volt, ami újragenerálná vagy
 *    visszavonná. Egy kiszivárgott hivatkozás tehát ÖRÖKRE érvényes maradt:
 *    nem lehetett rá reagálni, csak tudomásul venni.
 *
 *    A privát, lelkészi naptárnak (`lelkeszi_naptar_token`) MÁR VOLT
 *    újragenerálása és visszavonása — a gyülekezetinek nem. Ez a hiányzó pár.
 *
 * ⚠️ MIÉRT SÜRGŐSEBB, MINT ELSŐRE LÁTSZIK: a 2026-09-04-i mérés szerint
 *    mind a 783 gyülekezetnek van tokenje, és a `congregations` tábla
 *    SELECT-policy-je `USING (true)` — vagyis MINDEN bejelentkezett fiók
 *    kiolvassa MINDEN gyülekezet tokenjét. Amíg az a policy nem szűkül
 *    (külön kör, mert 149 olvasási helyet érint), a forgatás az egyetlen
 *    kézben tartható válasz.
 *
 * A token szerveroldali CSPRNG-ből jön (`randomUUID`), és semmiből nem
 * származtatjuk — sem a gyülekezet azonosítójából, sem a régi tokenből.
 * (Ugyanaz az elv, mint a `generatePastoralCalendarToken`-nél.)
 */
export async function forgatCalendarFeedToken(): Promise<{
  ok: boolean
  token?: string
  error?: string
}> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { ok: false, error: 'Nincs aktív gyülekezet kiválasztva.' }

  const ujToken = randomUUID()

  const { data, error } = await supabase
    .from('congregations')
    .update({ calendar_feed_token: ujToken })
    .eq('id', congregationId)
    .select('calendar_feed_token')
    .maybeSingle()

  if (error) {
    console.error('[programs/naptar-token] a forgatás nem sikerült:', error.message)
    return { ok: false, error: 'Az új hivatkozás létrehozása nem sikerült — próbáld újra.' }
  }

  // ⚠️ NÉMA SIKER KIZÁRÁSA: a PostgREST a 0 sort érintő írásra is HIBÁTLAN
  // választ ad — például akkor, amikor az RLS tagadta meg a módosítást. Ha
  // ezt nem néznénk, a felület „kész"-t mondana, miközben a régi hivatkozás
  // tovább él. Ugyanez a csapda a lelkészi naptár-tokennél is ki van zárva.
  if (!data) {
    return {
      ok: false,
      error:
        'Az új hivatkozás létrehozása nem sikerült (nincs jogosultság ehhez a gyülekezethez). ' +
        'Jelezd a rendszergazdának.',
    }
  }

  // A naplóba SOHA nem kerül maga a token — csak az, hogy forgatás történt.
  // (A `targetId` uuid, tehát nem esik bele az egész-azonosítós audit-hibába.)
  await logAuditEvent(
    {
      action: 'program.naptar_token_forgatas',
      targetTable: 'congregations',
      targetId: congregationId,
    },
    supabase,
  )

  return { ok: true, token: (data as { calendar_feed_token: string }).calendar_feed_token }
}

/**
 * 2026-08-26 (5. kör): a naptár-feed részletessége. Alapból a feed a
 * megjegyzés/leírás NÉLKÜL megy ki (a lelkészi jegyzet lelkigondozói adatot
 * hordozhat, a token pedig külső naptár-szolgáltatóra szinkronizálódik) —
 * a teljes tartalom tudatos, gyülekezetenkénti opt-in.
 */
export async function getCalendarFeedReszletes(): Promise<{ reszletes: boolean; elerheto: boolean }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { reszletes: false, elerheto: false }
  const { data, error } = await supabase
    .from('congregations')
    .select('calendar_feed_reszletes')
    .eq('id', congregationId)
    .maybeSingle()
  if (error) return { reszletes: false, elerheto: false }
  return {
    reszletes: (data as { calendar_feed_reszletes?: boolean | null } | null)?.calendar_feed_reszletes === true,
    elerheto: true,
  }
}

export async function setCalendarFeedReszletes(reszletes: boolean) {
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }
  const { error } = await supabase
    .from('congregations')
    .update({ calendar_feed_reszletes: reszletes })
    .eq('id', congregationId)
  if (error) {
    if (/calendar_feed_reszletes/.test(error.message || '')) {
      return { error: 'A beállításhoz előbb le kell futtatni a 2026-08-26-presbiterium-tisztsegek.sql migrációt.' }
    }
    return { error: `Hiba: ${error.message}` }
  }
  await logAuditEvent({ action: 'program.feed_reszletesseg', targetTable: 'congregations', targetId: congregationId, metadata: { reszletes } }, supabase)
  return { success: true }
}

/**
 * Egy program-bemenetből a `gyulekezeti_programok` táblába írható mező-objektum.
 * A `saveProgram` és a `saveBatchPrograms` is ezt használja (korábban a két
 * helyen duplikálva volt — 2026-06-07).
 */
function buildProgramRecord(d: ProgramInput): Record<string, unknown> {
  return {
    cim: d.cim,
    datum: d.datum,
    datum_vege: d.datum_vege || null,
    ido_kezdes: d.ido_kezdes || null,
    ido_befejezes: d.ido_befejezes || null,
    helyszin: d.helyszin || null,
    tipus: d.tipus,
    prioritas: d.prioritas,
    ismetlodes_tipus: d.ismetlodes_tipus || null,
    // 2026-08-26 (5. kör): a sorozat záró napja + weboldal-publikálás.
    ismetlodes_vege: d.ismetlodes_tipus ? d.ismetlodes_vege || null : null,
    // 2026-09-05: MAGÁN típus (szabadság, anyakönyvi alkalom) SOHA nem publikus —
    // a DB-trigger is kikényszeríti, a nyilvános RPC-k is kizárják; itt a
    // felület kapuja. A három kapu EGYÜTT fail-closed.
    publikus: d.publikus === true && !isMaganProgramTipus(d.tipus),
    'ismétlődő': !!d.ismetlodes_tipus,
    egyedi_tipus_nev: d.tipus === 'egyeb' ? (d.egyedi_tipus_nev || null) : null,
    egyedi_emoji: d.tipus === 'egyeb' ? (d.egyedi_emoji || null) : null,
    // 2026-08-27: a nyilvános ismertető. Az oszlop régóta létezik, de a webes
    // felület eddig SOHA nem írta — ezért maradt volna üres a weboldal naptára.
    leiras: d.leiras?.trim() || null,
    megjegyzes: d.megjegyzes || null,
  }
}

/** Migráció előtti kecses visszaesés: az új program-oszlopok kihagyása. */
function ujProgramOszlopHiba(message?: string | null): boolean {
  return /ismetlodes_vege|publikus/.test(message || '')
}

function ujProgramOszlopNelkul(record: Record<string, unknown>): Record<string, unknown> {
  const masolat = { ...record }
  delete masolat['ismetlodes_vege']
  delete masolat['publikus']
  return masolat
}

export async function saveProgram(data: ProgramInput) {
  const { supabase, user, congregationId, fullName } = await getEffectiveCongregationContext()
  const parsed = programSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  const d = parsed.data
  const record: Record<string, unknown> = {
    ...buildProgramRecord(d),
    updated_at: new Date().toISOString(),
  }

  if (d.id) {
    // UPDATE
    let { error } = await supabase.from('gyulekezeti_programok').update(record).eq('id', d.id).eq('congregation_id', congregationId)
    if (error && ujProgramOszlopHiba(error.message)) {
      const retry = await supabase.from('gyulekezeti_programok').update(ujProgramOszlopNelkul(record)).eq('id', d.id).eq('congregation_id', congregationId)
      error = retry.error
    }
    if (error) return { error: `Hiba: ${error.message}` }
  } else {
    // INSERT — profil adatok hozzáfűzése
    record.letrehozta_id = user.id
    record.letrehozta_nev = fullName || ''
    record.congregation_id = congregationId

    let { error } = await supabase.from('gyulekezeti_programok').insert(record)
    if (error && ujProgramOszlopHiba(error.message)) {
      const retry = await supabase.from('gyulekezeti_programok').insert(ujProgramOszlopNelkul(record))
      error = retry.error
    }
    if (error) return { error: `Hiba: ${error.message}` }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteProgram(id: string) {
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  const { error } = await supabase.from('gyulekezeti_programok').delete().eq('id', id).eq('congregation_id', congregationId)
  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function toggleProgramDone(id: string, done: boolean) {
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  // 2026-08-26 (5. kör): ISMÉTLŐDŐ sorozatnál a pipa az ÖSSZES alkalmat
  // jelölné teljesítettnek (a kibontott alkalmak a sorozat DB-sorát öröklik) —
  // ez adathelyességi hiba volt. Az alkalmankénti teljesítés (sorozat-kivétel
  // tárolás) külön körben épül; addig hangosan tiltjuk.
  if (done) {
    const { data: sor } = await supabase
      .from('gyulekezeti_programok')
      .select('ismetlodes_tipus')
      .eq('id', id)
      .eq('congregation_id', congregationId)
      .maybeSingle()
    if ((sor as { ismetlodes_tipus?: string | null } | null)?.ismetlodes_tipus) {
      return {
        error:
          'Ismétlődő sorozatnál a „teljesítve" jelölés az ÖSSZES alkalomra vonatkozna, ezért itt nem használható. ' +
          'Az alkalmankénti teljesítés-jelölés egy következő fejlesztési körben érkezik.',
      }
    }
  }

  const { error } = await supabase.from('gyulekezeti_programok').update({
    teljesitett: done,
    teljesites_datum: done ? new Date().toISOString() : null,
  }).eq('id', id).eq('congregation_id', congregationId)

  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/dashboard')
  return { success: true }
}

// ── Imahét → munkanapló (2026-08-25) ─────────────────────────────────────────

// A munkanapló KANONIKUS Imahét-értéke. PONTOSAN ezt számolja a lelkészi
// jelentés III.5 „Imaheti alkalmak" aggregátora
// (lib/lelkeszi-jelentes/worklog-auto.ts: `jellege === 'Imahét'`) és a
// hivatalos munkanapló 17. oszlopa (lib/worklog/print-columns.ts EGYEB_TYPES),
// valamint szerepel a lib/constants/worklog.ts WORKLOG_TYPES.szolgalat
// listájában is. NE változtasd meg — a jelentés-rubrika elveszítené a sorokat.
const IMAHET_JELLEGE = 'Imahét'

const imahetNaplosorokSchema = z.object({
  napok: z
    .array(
      z.object({
        datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum a napi beosztásban'),
        szolgalo: z.string().max(120, 'A szolgáló lelkész neve legfeljebb 120 karakter lehet'),
      }),
    )
    .min(1, 'Legalább egy nap szükséges a napi beosztáshoz')
    .max(9, 'Legfeljebb 9 nap adható meg a napi beosztásban'),
})

/** Az insert-hiba magyarra fordítása (hiányzó oszlop / egyéb DB-hiba). */
function imahetInsertHiba(error: { message?: string } | null | undefined): string {
  const msg = error?.message || ''
  const lower = msg.toLowerCase()
  const hianyzoOszlop =
    (lower.includes('column') && lower.includes('does not exist')) || lower.includes('schema cache')
  if (hianyzoOszlop && /egyseg_id/.test(lower)) {
    return 'A munkanapló-sorok nem jöttek létre: az adatbázisból még hiányzik a munkanaplo.egyseg_id oszlop. Futtassa le a 2026-08-25-gyulekezeti-egysegek.sql migrációt, majd próbálja újra.'
  }
  if (hianyzoOszlop) {
    return `A munkanapló-sorok nem jöttek létre — hiányzó adatbázis-oszlop: ${msg}`
  }
  return `A munkanapló-sorok létrehozása nem sikerült: ${msg}`
}

/**
 * Az Imahét napi vendéglelkész-beosztásából munkanapló-sorok létrehozása —
 * a program-dialógus hívja a saveProgram SIKERE után. Üres szolgálójú napot
 * kihagyunk; ugyanarra a napra már létező (nem törölt) 'Imahét'-sor esetén a
 * nap kimarad (duplikátum-őr). Válasz: { ok, letrehozva, kihagyva } vagy
 * { error } magyarul.
 */
export async function createImahetNaplosorok(input: {
  napok: Array<{ datum: string; szolgalo: string }>
}): Promise<{ ok: true; letrehozva: number; kihagyva: number } | { error: string }> {
  const parsed = imahetNaplosorokSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  // Üres szolgálójú napok kihagyása — csak a ténylegesen beosztott napokból
  // lesz munkanapló-sor (a lelkész a többit maga rögzíti, ha akarja).
  const napok = parsed.data.napok
    .map((n) => ({ datum: n.datum, szolgalo: n.szolgalo.trim() }))
    .filter((n) => n.szolgalo.length > 0)
  if (napok.length === 0) return { ok: true, letrehozva: 0, kihagyva: 0 }

  // DUPLIKÁTUM-ŐR: ugyanarra a napra már létező (nem törölt) 'Imahét'-sor →
  // a nap kimarad. A `deleted`-szűrő fallback-kel fut (a munkanapló-actions
  // mintája): ha az oszlop még nem létezik, szűrő nélkül kérdezünk.
  const datumok = napok.map((n) => n.datum)
  const minDatum = datumok.reduce((a, b) => (a < b ? a : b))
  const maxDatum = datumok.reduce((a, b) => (a > b ? a : b))
  const runExisting = (withDeletedFilter: boolean) => {
    let q = supabase
      .from('munkanaplo')
      .select('idopont')
      .eq('congregation_id', congregationId)
      .eq('jellege', IMAHET_JELLEGE)
      .gte('idopont', minDatum)
      .lte('idopont', maxDatum)
    if (withDeletedFilter) q = q.eq('deleted', false)
    return q
  }
  let existing = await runExisting(true)
  if (existing.error && isMissingDeletedColumn(existing.error)) existing = await runExisting(false)
  if (existing.error) {
    return { error: `A meglévő munkanapló-sorok ellenőrzése nem sikerült: ${existing.error.message}` }
  }
  const foglaltNapok = new Set(
    ((existing.data || []) as Array<{ idopont: string | null }>).map((r) =>
      String(r.idopont || '').slice(0, 10),
    ),
  )

  const ujak = napok.filter((n) => !foglaltNapok.has(n.datum))
  const kihagyva = napok.length - ujak.length
  if (ujak.length === 0) return { ok: true, letrehozva: 0, kihagyva }

  const most = new Date().toISOString()
  const records = ujak.map((n) => ({
    idopont: n.datum,
    jellege: IMAHET_JELLEGE,
    kategoria: 'szolgalat',
    cim: 'Egyetemes imahét — vendégszolgálat',
    szolgalt: n.szolgalo,
    // A jelenlétet a lelkész tölti ki utólag — a jelenlet_osszesen NOT NULL,
    // ezért 0 (a bontás-mezők üresen maradnak).
    jelenlet_ferfi: null,
    jelenlet_no: null,
    jelenlet_gyermek: null,
    jelenlet_osszesen: 0,
    persely: null,
    du: false,
    megjegyzes: 'Imahét — a határidőnaplóból létrehozva',
    deleted: false,
    created: most,
    congregation_id: congregationId,
  }))

  let ins = await supabase.from('munkanaplo').insert(records).select('id')
  if (ins.error && isMissingDeletedColumn(ins.error)) {
    // A `deleted` oszlop még nem létezik (migráció előtt) → oszlop nélkül újra.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kihagyó destrukturálás
    const deletedNelkul = records.map(({ deleted: _d, ...tobbi }) => tobbi)
    ins = await supabase.from('munkanaplo').insert(deletedNelkul).select('id')
  }
  if (ins.error) return { error: imahetInsertHiba(ins.error) }
  const letrehozva = ins.data?.length ?? 0
  if (letrehozva === 0) {
    return { error: 'A munkanapló-sorok beszúrása nem erősíthető meg — egyetlen sor sem jött létre.' }
  }

  await logAuditEvent(
    {
      action: 'program.imahet_naplosorok',
      targetTable: 'munkanaplo',
      metadata: { letrehozva, kihagyva, datumok: ujak.map((n) => n.datum) },
    },
    supabase,
  )
  revalidatePath('/munkanaplo')
  return { ok: true, letrehozva, kihagyva }
}

export async function saveBatchPrograms(records: ProgramInput[]) {
  // Üres sorok kiszűrése
  const nonEmpty = records.filter(r => r.cim?.trim() || r.datum)

  if (nonEmpty.length === 0) {
    return { error: 'Nincs kitöltött sor a mentéshez!' }
  }

  // Validáció minden sorra
  const errors: string[] = []
  nonEmpty.forEach((r, i) => {
    const parsed = batchRowSchema.safeParse(r)
    if (!parsed.success) {
      errors.push(`${i + 1}. sor: ${parsed.error.issues[0].message}`)
    }
  })

  if (errors.length > 0) {
    return { error: errors.join('\n') }
  }

  const { supabase, user, congregationId, fullName } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  const dbRecords = nonEmpty.map(d => ({
    ...buildProgramRecord(d),
    letrehozta_id: user.id,
    letrehozta_nev: fullName || '',
    congregation_id: congregationId,
  }))

  let { error } = await supabase.from('gyulekezeti_programok').insert(dbRecords)
  if (error && ujProgramOszlopHiba(error.message)) {
    const retry = await supabase.from('gyulekezeti_programok').insert(dbRecords.map(ujProgramOszlopNelkul))
    error = retry.error
  }
  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/dashboard')
  return { success: true, count: dbRecords.length }
}

// ─────────────────────────────────────────────────────────────────────────
// 2026-09-05 — TERVEZETT ANYAKÖNYVI ALKALOM ⇄ MEGTÖRTÉNT ANYAKÖNYVI BEJEGYZÉS
// ─────────────────────────────────────────────────────────────────────────
// A naptárból rögzített keresztelő/esküvő/konfirmáció/temetés PROGRAM (terv).
// Amikor a lelkész anyakönyvezi (a registry-dialógus menti a sort), a program
// egyetlen kapcsolatot kap az anyakönyvi sorhoz, és „teljesített" lesz. A naptár
// ettől kezdve a programot mutatja „anyakönyvezve" jelzéssel, az anyakönyvi
// réteg pedig NEM mutatja külön ugyanazt az eseményt — nincs duplikátum.
//
// Az anyakönyv a TÉNY, a program a TERV: az összekötés sosem másol adatot.

export async function kapcsolProgramAnyakonyvhoz(input: {
  programId: string
  anyakonyvId: number
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { ok: false, error: 'Nincs aktív gyülekezet kiválasztva.' }
  if (!/^[0-9a-f-]{36}$/i.test(input.programId) || !Number.isInteger(input.anyakonyvId) || input.anyakonyvId <= 0) {
    return { ok: false, error: 'Érvénytelen azonosító.' }
  }

  const { data: program, error: readError } = await supabase
    .from('gyulekezeti_programok')
    .select('id, tipus, anyakonyv_id, ismetlodes_tipus')
    .eq('id', input.programId)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (readError) return { ok: false, error: `A program nem olvasható: ${readError.message}` }
  const p = program as { id: string; tipus: string; anyakonyv_id?: number | null; ismetlodes_tipus?: string | null } | null
  if (!p) return { ok: false, error: 'A program nem található ebben a gyülekezetben.' }
  if (!isAnyakonyviProgramTipus(p.tipus)) {
    return { ok: false, error: 'Csak keresztelő/esküvő/konfirmáció/temetés típusú program köthető anyakönyvi bejegyzéshez.' }
  }
  // 2026-09-05 (P3-utómunka): ISMÉTLŐDŐ sorozat — ugyanaz a kapu, mint a
  // toggleProgramDone-ban. A kibontott alkalmak a sorozat EGY adatbázis-sorát
  // öröklik: az összekötés + „teljesített" az ÖSSZES alkalmat jelölné meg, és
  // egy anyakönyvi bejegyzés egy egész sorozathoz kötődne. Hangosan tiltjuk;
  // a felület a dialógus megnyitása ELŐTT is ezt mondja (program-scheduler).
  if (p.ismetlodes_tipus) {
    return { ok: false, error: ISMETLODO_SOROZAT_ANYAKONYV_HIBA }
  }
  if (p.anyakonyv_id && p.anyakonyv_id !== input.anyakonyvId) {
    return { ok: false, error: 'Ez a program már egy MÁSIK anyakönyvi bejegyzéshez van kötve.' }
  }

  const tabla = PROGRAM_TIPUS_ANYAKONYV_TABLA[p.tipus]
  const { data: frissitve, error } = await supabase
    .from('gyulekezeti_programok')
    .update({
      anyakonyv_tabla: tabla,
      anyakonyv_id: input.anyakonyvId,
      teljesitett: true,
      teljesites_datum: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.programId)
    .eq('congregation_id', congregationId)
    .select('id')
    .maybeSingle()

  if (error) {
    // 23505 = az anyakönyvi sorhoz MÁR tartozik program (részleges egyedi index).
    if (error.code === '23505') {
      return { ok: false, error: 'Ehhez az anyakönyvi bejegyzéshez már tartozik egy másik program.' }
    }
    if (/anyakonyv_tabla|anyakonyv_id/.test(error.message)) {
      return { ok: false, error: 'Az anyakönyvi összekötés még nincs bekapcsolva az adatbázisban — futtasd le a 2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql fájlt.' }
    }
    return { ok: false, error: `Az összekötés nem sikerült: ${error.message}` }
  }
  // NÉMA SIKER KIZÁRÁSA: 0 sort érintő UPDATE (RLS) is hibátlan választ ad.
  if (!frissitve) return { ok: false, error: 'Az összekötés nem sikerült (nincs jogosultság a programhoz).' }

  await logAuditEvent(
    {
      action: 'program.anyakonyv_osszekotes',
      targetTable: 'gyulekezeti_programok',
      targetId: input.programId,
      metadata: { anyakonyv_tabla: tabla, anyakonyv_id: input.anyakonyvId },
    },
    supabase,
  )
  revalidatePath('/dashboard')
  return { ok: true }
}

/** Az összekötés bontása (pl. a bejegyzést tévedésből kötötték ide). A program marad. */
export async function bontProgramAnyakonyv(programId: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { ok: false, error: 'Nincs aktív gyülekezet kiválasztva.' }
  const { data, error } = await supabase
    .from('gyulekezeti_programok')
    .update({ anyakonyv_tabla: null, anyakonyv_id: null, updated_at: new Date().toISOString() })
    .eq('id', programId)
    .eq('congregation_id', congregationId)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: `A bontás nem sikerült: ${error.message}` }
  if (!data) return { ok: false, error: 'A bontás nem sikerült (nincs jogosultság a programhoz).' }
  await logAuditEvent(
    { action: 'program.anyakonyv_bontas', targetTable: 'gyulekezeti_programok', targetId: programId },
    supabase,
  )
  revalidatePath('/dashboard')
  return { ok: true }
}
