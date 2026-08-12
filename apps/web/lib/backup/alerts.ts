import 'server-only'

/**
 * A MENTÉS-MOTOR RIASZTÓJA — 2026-08-11.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT LÉTEZIK EZ A FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * A tulajdonos 3. döntése MIND A HÁROM csatornát megkövetelte egy bukott
 * mentésnél:
 *   1) azonnali e-mail (Brevo),
 *   2) harang-értesítés (`ertesitesek` sor),
 *   3) figyelmeztető sáv az admin felületen.
 *
 * A sáv régóta megvolt (`lib/google-drive/health.ts` + `backup-stale-banner.tsx`),
 * a másik kettőt viszont egy soha meg nem hívott `setBackupAlerter(...)` mögé
 * tervezték. A hívás elmaradt: a motor minden bukásnál csak annyit írt a
 * NAPLÓ-SORBA, hogy „NINCS BEKÖTVE riasztó" — annak a sornak a mezőjébe,
 * amelyik éppen bukott, egy olyan felületen, ahová senki nem nézett.
 *
 * Ez a fájl az a hiányzó kapocs, és MOSTANTÓL A MOTOR ALAPÉRTELMEZÉSE
 * (`worker.ts → aktivRiaszto()`), nem egy elfelejthető bekötés.
 *
 * ⛔ AMI SOHA NEM MEGY BELE: mentett adat, sorérték, gyülekezeti névsor,
 *    letöltési link, kulcs, jelszó, token. Csak a TÉNY és a hely, ahol
 *    megnézhető.
 */

import { selectAllPaged } from '@kartoteka/supabase-client'

import { feloldErtesitesek, sendDriveFailureAlert } from '@/lib/google-drive/alerts'
import { MENTES_ALLAPOT_HORGONY, MENTES_FELULET_UT } from '@/lib/google-drive/types'
import { huIdopontBukarest } from '@/lib/utils/idopont-bukarest'

import type { BackupAlerter, BackupFailureAlert, BackupScope } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// A HIVATKOZÁS — EGY HELYEN ELŐÁLLÍTVA (2026-08-11)
// ─────────────────────────────────────────────────────────────────────────────

const FELULET_UT = MENTES_FELULET_UT

/**
 * A mentés-hiba értesítés `hivatkozas` mezője. EGYSZERRE három dolog:
 *   1) DEDUP-KULCS (naponta egy értesítés hatókörönként),
 *   2) ÉRVÉNYES ÚTVONAL (a harang csak `/`-sel kezdődő linket tesz kattinthatóvá),
 *   3) a FELOLDÁS kulcsa (sikeres újrafutáskor ezen a kulcson keressük vissza).
 *
 * ⚠️ EZÉRT KELL EGY HELYEN ELŐÁLLÍTANI. Ha a riasztó és a feloldó külön
 *    építené a stringet, egyetlen elgépelés örökre „megoldhatatlanná" tenné az
 *    üzeneteket — némán, mert egy nem talált sor nem hibaüzenet, csak nulla.
 *
 * ⚠️ A `#mentes-allapot` horgony 2026-08-11-én került bele: a cél-oldalon van egy
 *    azonos azonosítójú szakasz, tehát a „Megnyitás" gomb ODA visz, nem csak az
 *    oldal tetejére. A régi, horgony NÉLKÜLI kulcsot a feloldás is figyeli
 *    (`mentesHibaHivatkozasok`), különben a tegnapi üzenetek örökre nyitva
 *    maradnának.
 */
export function mentesHibaHivatkozas(input: {
  runDate: string
  scope: BackupScope
  congregationId?: string | null
}): string {
  return `${mentesHibaAlapKulcs(input)}#${MENTES_ALLAPOT_HORGONY}`
}

function mentesHibaAlapKulcs(input: {
  runDate: string
  scope: BackupScope
  congregationId?: string | null
}): string {
  return (
    `${FELULET_UT}?mentes-hiba=${input.runDate}-${input.scope}-` +
    `${input.congregationId ?? 'globalis'}`
  )
}

/** Az ÖSSZES alak, amit valaha kiadtunk erre a hatókörre (a horgony nélküli is). */
export function mentesHibaHivatkozasok(input: {
  runDate: string
  scope: BackupScope
  congregationId?: string | null
}): string[] {
  const alap = mentesHibaAlapKulcs(input)
  return [`${alap}#${MENTES_ALLAPOT_HORGONY}`, alap]
}

// ─────────────────────────────────────────────────────────────────────────────
// A TÖMEGES BUKÁS ÖSSZESÍTŐJE — 2026-08-11
//
// ════════════════════════════════════════════════════════════════════════════
// ⚠️ A RIASZTÓ SZÉTLŐTTE A SAJÁT CSATORNÁJÁT
// ════════════════════════════════════════════════════════════════════════════
// A dedup-kulcs HATÓKÖRÖNKÉNT egyedi (`mentesHibaHivatkozas`), tehát csak
// UGYANANNAK a gyülekezetnek az ismételt riasztását fogta meg — a TÖMEGES
// bukást nem. Egy Drive-token lejárat vagy tároló-kiesés esetén mind a 784
// hatókör ugyanannál a lépésnél bukik, a motor 784-szer hívja a riasztót, és
// 784 KÜLÖN e-mail indul el (a `sendEmail`-ben nincs se sorbaállítás, se
// sebesség-korlát), plusz 784 × (aktív admin/master + lelkész) sor az
// `ertesitesek` táblába.
//
// A robbanási sugár NEM csak a mentés:
//   · a Brevo-fiók (noreply@kartoteka.app) ugyanaz, ami a jelszó-visszaállítást
//     és a meghívókat viszi — egy éjszakai 784-es csúcs az EGÉSZ alkalmazás
//     tranzakciós leveleit throttlingba viheti;
//   · a harang lekérdezésének alap-limitje 200 sor, tehát a master postaládája
//     100%-ban mentés-hibává válik, és minden más (hozzáférés-kérelem,
//     átjelentkezés) kiesik a listából.
//
// A HELYES KORLÁT A FUTÁSRA VONATKOZIK, NEM A HATÓKÖRRE: az első néhány bukás
// NEVESÍTVE megy ki (azokból lehet tanulni), a többi helyett EGYETLEN összesítő.
// A napló-sorba MINDEN bukás bekerül — a „minden bukásról tudni kell" elv nem
// sérül, csak nem a postafiókon keresztül teljesül.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hány bukott hatókörről megy ki NEVESÍTETT riasztás egy futásban.
 *
 * ⚠️ A motor szeletekben fut (784 hatókör ~7 szelet), és ez a korlát
 *    SZELETENKÉNT él, mert a szeletek külön folyamatok. A felső korlát tehát
 *    `szeletek × 3` nevesített + 1 összesítő levél naponta (a szelet-2..n
 *    összesítője a napi dedup-kulcson kihagyásra kerül) — 784 helyett ~20.
 */
export const RIASZTAS_NEVESITETT_MAX = 3

/** Az összesítő dedup-/feloldó kulcsa: NAPONTA EGY, hatókör nélkül. */
export function mentesOsszesitoHivatkozas(runDate: string): string {
  return `${mentesOsszesitoAlapKulcs(runDate)}#${MENTES_ALLAPOT_HORGONY}`
}

function mentesOsszesitoAlapKulcs(runDate: string): string {
  return `${FELULET_UT}?mentes-osszesito=${runDate}`
}

export function mentesOsszesitoHivatkozasok(runDate: string): string[] {
  const alap = mentesOsszesitoAlapKulcs(runDate)
  return [`${alap}#${MENTES_ALLAPOT_HORGONY}`, alap]
}

/** `/admin/biztonsagi-mentes?mentes-osszesito=2026-08-12#…` → `2026-08-12` */
export function bontMentesOsszesitoKulcs(kulcs: string): string | null {
  const i = kulcs.indexOf('?mentes-osszesito=')
  if (i < 0) return null
  const nyers = kulcs.slice(i + '?mentes-osszesito='.length).split('#')[0]
  return /^\d{4}-\d{2}-\d{2}$/.test(nyers) ? nyers : null
}

/**
 * EGYETLEN riasztás a futás TÖMEGES bukásáról. SOHA NEM DOB.
 *
 * ⛔ Adatot, névsort, linket NEM tartalmaz — csak a darabszámot, az első néhány
 *    gyülekezet nevét és azt, hol nézhető meg.
 */
export async function sendMentesOsszesitoRiasztas(input: {
  runDate: string
  bukottDarab: number
  /** A legfeljebb 3 NEVESÍTETT bukás, amiről külön riasztás is ment. */
  elsoNevek: string[]
  /** A leggyakoribb hibaüzenet (rövidítve) — ebből derül ki a KÖZÖS ok. */
  gyakoriHiba?: string | null
}): Promise<{ ok: boolean; csatornak: string[]; hiba?: string }> {
  const nevek = input.elsoNevek.slice(0, 3).filter(Boolean)
  const reszlet =
    `A(z) ${input.runDate} napi futásban ${input.bukottDarab} hatókör mentése SIKERTELEN. ` +
    (nevek.length > 0 ? `Az első három: ${nevek.join(', ')}. ` : '') +
    (input.gyakoriHiba ? `A leggyakoribb ok: ${input.gyakoriHiba.slice(0, 300)}. ` : '') +
    'Ennyi hibáról a rendszer SZÁNDÉKOSAN nem küld külön-külön értesítést: ' +
    'a postafiók maga válna a hiba részévé. Mindegyik bukás BENNE VAN a naplóban.'

  try {
    const eredmeny = await sendDriveFailureAlert({
      kind: 'futas_bukas',
      cim: `${input.bukottDarab} hatókör mentése nem sikerült (${input.runDate})`,
      reszlet,
      teendo:
        'nyisd meg az Admin → Biztonsági mentés oldalt. Ennyi egyszerre bukott hatóköre általában ' +
        'KÖZÖS oka van (lejárt Google-kapcsolat, tele tároló, hálózat) — előbb azt nézd meg, ' +
        'utána indítsd újra a „Mentés most" gombbal',
      dedupKulcs: mentesOsszesitoHivatkozas(input.runDate),
    })
    const csatornak: string[] = []
    if (eredmeny.emailKuldve) csatornak.push('e-mail')
    if (eredmeny.harangSorok > 0) csatornak.push(`harang (${eredmeny.harangSorok} címzett)`)
    if (eredmeny.kihagyva) csatornak.push('kihagyva (ma már ment összesítő)')
    const bajok: string[] = []
    if (eredmeny.emailHiba) bajok.push(`e-mail: ${eredmeny.emailHiba}`)
    if (eredmeny.harangHiba) bajok.push(`harang: ${eredmeny.harangHiba}`)
    return {
      ok: eredmeny.kihagyva || (eredmeny.emailKuldve && !eredmeny.harangHiba),
      csatornak,
      hiba: bajok.length > 0 ? bajok.join('; ') : undefined,
    }
  } catch (e: unknown) {
    return {
      ok: false,
      csatornak: [],
      hiba: e instanceof Error ? e.message : 'ismeretlen hiba az összesítő riasztás közben',
    }
  }
}

/** Az összesítő feloldása, ha a nap végül rendbe jött. SOHA NEM DOB. */
export async function feloldMentesOsszesito(runDate: string): Promise<{ feloldva: number }> {
  const eredmeny = await feloldErtesitesek({
    hivatkozasok: mentesOsszesitoHivatkozasok(runDate),
    megoldasUzenet:
      `AZÓTA RENDBEN. A(z) ${runDate} napi futás VÉGÜL minden hatókörrel végzett: mindegyik ` +
      'mentés elkészült, és a rendszer vissza is olvasta a tárolóból. Nincs több teendőd.',
  })
  return { feloldva: eredmeny.feloldva }
}

/** Emberi mondat abból, MELYIK lépésnél hasalt el a futás. */
const LEPES_SZOVEG: Record<string, string> = {
  leltar: 'a tábla-leltár ellenőrzésénél',
  szamlalas: 'a sorok megszámolásánál',
  dump: 'az adatok kiolvasásánál',
  titkositas: 'a titkosításnál',
  feltoltes: 'a feltöltésnél',
  igazolas: 'a visszaolvasásnál (igazolás)',
  nyeses: 'a régi mentések takarításánál',
}

/**
 * A motor `BackupAlerter` portjának megvalósítása.
 *
 * SOHA NEM DOB: egy elhasalt riasztás nem boríthatja a mentési futást (a
 * következő gyülekezetnek akkor is el kell készülnie). A kimenetelt viszont
 * VISSZAADJA, és a motor beírja a `backup_log.figyelmeztetesek`-be — így maga
 * a riasztás sem veszhet el némán.
 */
export const sendBackupFailureAlert: BackupAlerter = async (alert: BackupFailureAlert) => {
  const hol = alert.stage ? (LEPES_SZOVEG[alert.stage] ?? `a(z) „${alert.stage}" lépésnél`) : null
  const kiről =
    alert.scope === 'globalis'
      ? 'a rendszerszintű (globális) mentés'
      : `a(z) „${alert.congregationNev ?? 'ismeretlen gyülekezet'}" gyülekezet mentése`

  const reszlet =
    `A(z) ${alert.runDate} napi futásban ${kiről} SIKERTELEN` +
    (hol ? ` — ${hol}` : '') +
    `. Ok: ${alert.uzenet.slice(0, 400)}` +
    (alert.backupLogId ? ` (napló-azonosító: ${alert.backupLogId})` : '')

  try {
    const eredmeny = await sendDriveFailureAlert({
      // ⚠️ 2026-08-11 JAVÍTÁS — A CÍM ÉS A TÖRZS UGYANARRÓL SZÓL.
      //    Itt korábban `kind: 'elavult'` állt, mert nem LÉTEZETT olyan
      //    riasztás-fajta, hogy „egy hatókör MAI futása elbukott". Emiatt a
      //    tulajdonos harangjában ez a cím állt egy egyszeri, egy-gyülekezetes
      //    bukás fölött: „Régen készült ellenőrzött biztonsági mentés" — miközben
      //    aznap 784 mentés készült el. A cím és a törzs SOHA nem szólhat két
      //    különböző eseményről.
      kind: 'futas_bukas',
      cim:
        alert.scope === 'globalis'
          ? `Nem sikerült a mai rendszerszintű mentés (${alert.runDate})`
          : `Nem sikerült a mai mentés — ${alert.congregationNev ?? 'ismeretlen gyülekezet'}`,
      reszlet,
      congregationId: alert.congregationId,
      congregationNev: alert.congregationNev,
      teendo:
        'nyisd meg az Admin → Biztonsági mentés oldalt, és nyomd meg a „Mentés most" gombot — ' +
        'a folytatás a ma már kész hatóköröket kihagyja, és csak ezt a hatókört próbálja újra',
      // Dedup HATÓKÖRÖNKÉNT ÉS NAPONKÉNT: 60 gyülekezetnél egy elszállt futás
      // különben 60 levelet küldene, és a postafiók maga válna a hiba részévé.
      dedupKulcs: mentesHibaHivatkozas({
        runDate: alert.runDate,
        scope: alert.scope,
        congregationId: alert.congregationId,
      }),
    })

    const csatornak: string[] = []
    if (eredmeny.emailKuldve) csatornak.push('e-mail')
    if (eredmeny.harangSorok > 0) csatornak.push(`harang (${eredmeny.harangSorok} címzett)`)
    if (eredmeny.kihagyva) csatornak.push('kihagyva (ma már ment ilyen értesítés)')

    const bajok: string[] = []
    if (eredmeny.emailHiba) bajok.push(`e-mail: ${eredmeny.emailHiba}`)
    if (eredmeny.harangHiba) bajok.push(`harang: ${eredmeny.harangHiba}`)

    return {
      // A „kihagyva" SIKER: ma már elment ugyanez az értesítés.
      ok: eredmeny.kihagyva || (eredmeny.emailKuldve && !eredmeny.harangHiba),
      csatornak,
      hiba: bajok.length > 0 ? bajok.join('; ') : undefined,
    }
  } catch (e: unknown) {
    return {
      ok: false,
      csatornak: [],
      hiba: e instanceof Error ? e.message : 'ismeretlen hiba a riasztás közben',
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// „AZÓTA RENDBEN" — A RIASZTÁS VISSZAVONÁSA (2026-08-11)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Megoldottnak jelöli EGY hatókör mentés-hiba üzenetét, ha az azóta elkészült.
 * A motor sikeres ága hívja, hatókörönként. SOHA NEM DOB.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 2026-08-11 JAVÍTÁS — CSAK A NAPI MENTÉS OLDHAT FEL NAPI HIBÁT
 * ════════════════════════════════════════════════════════════════════════════
 * A feloldás kulcsa `(run_date, scope, congregation_id)` volt, `kind` NÉLKÜL.
 * A lefedettség viszont KIZÁRÓLAG `kind='napi'` sorokat néz
 * (`health.ts → loadLogSlice`). Így egy `pre_restore` (visszaállítás előtti)
 * igazolt sor feloldotta a NAPI bukás értesítését ezzel a szöveggel: „AZÓTA
 * RENDBEN … Ezzel a hibával nincs több teendőd." — miközben a napi sor `hiba`
 * maradt, és másnap reggel a sáv kiírta: „TEGNAP … 1 hatókörnek NEM készült
 * ellenőrzött mentése". Két számítás, két igazság ugyanarról a hatókörről.
 *
 * A `runSingleCongregationBackup` a `runBackupWorker`-en keresztül `pre_restore`
 * fajtával is fut, tehát ez NEM elméleti út.
 */
export async function feloldMentesRiasztas(input: {
  runDate: string
  scope: BackupScope
  congregationId?: string | null
  congregationNev?: string | null
  /** A most befejezett futás fajtája. CSAK a `'napi'` old fel napi hibát. */
  kind: string
}): Promise<{ feloldva: number }> {
  if (input.kind !== 'napi') return { feloldva: 0 }

  const kiről =
    input.scope === 'globalis'
      ? 'A rendszerszintű (globális) mentés'
      : `A(z) „${input.congregationNev ?? 'érintett'}" gyülekezet mentése`
  const eredmeny = await feloldErtesitesek({
    hivatkozasok: mentesHibaHivatkozasok(input),
    megoldasUzenet:
      `AZÓTA RENDBEN. ${kiről} ${huIdopontBukarest(new Date().toISOString(), 'short')}-kor ` +
      'elkészült, és a rendszer vissza is olvasta a tárolóból (ellenőrzött mentés). ' +
      'Ezzel a hibával nincs több teendőd.',
  })
  return { feloldva: eredmeny.feloldva }
}

/**
 * VISSZAMENŐLEGES SEPRÉS: minden nyitott mentés-hiba üzenetet megold, amelyhez
 * a naplóban AZÓTA született igazolt mentés.
 *
 * ⚠️ MIÉRT KELL A HATÓKÖRÖNKÉNTI FELOLDÁS MELLETT. A tulajdonos 2026-08-11-i
 * üzenete akkor keletkezett, amikor a feloldás még nem létezett — azt tehát
 * SEMMILYEN jövőbeli sikeres futás nem érintené (a `run_date` már másnapi
 * lenne). Ez a seprés az ilyen, „beragadt" üzeneteket takarítja fel, és
 * ugyanabból az egyetlen igazság-forrásból dolgozik, mint a felület: van-e
 * `status='ok'` ÉS `drive_verified_at` sor arra a napra és hatókörre.
 *
 * A mentés-felület betöltésekor fut, rendszergazdai jogosultsággal. SOHA NEM DOB.
 */
export async function feloldMegoldottMentesRiasztasok(): Promise<{ feloldva: number }> {
  try {
    const { getSupabaseAdminClient } = await import('@/lib/supabase/admin-client')
    const supabase = getSupabaseAdminClient()

    // ── 1) A MÉG NYITOTT mentés-hiba üzenetek DISTINCT hivatkozásai ─────────
    //
    // ⚠️ A `cim ILIKE 'Megoldva%'` kizárás SZÁNDÉKOSAN nem a `megoldva`
    //    oszlopra szűr: az csak a migráció lefutása után létezik. A cím-előtag
    //    mindkét világban ott van (lásd `feloldErtesitesek` tartalék ága), tehát
    //    a seprés a migráció ELŐTT sem kezdi újra minden oldalbetöltésnél
    //    ugyanazokat a sorokat.
    // ⚠️ A minta `?mentes-%`, nem `?mentes-hiba=%`: 2026-08-11 óta a TÖMEGES
    //    bukás ÖSSZESÍTŐJE is ide tartozik (`?mentes-osszesito=`), és annak is
    //    fel kell oldódnia, ha a nap végül rendbe jött.
    const { data, error } = await supabase
      .from('ertesitesek')
      .select('hivatkozas')
      .like('hivatkozas', `${FELULET_UT}?mentes-%`)
      .not('cim', 'ilike', 'Megoldva%')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error || !data) return { feloldva: 0 }

    const bontasok = new Map<string, { runDate: string; scope: BackupScope; congregationId: string | null }>()
    /** Az összesítő-kulcsok: `hivatkozas` → `runDate`. */
    const osszesitok = new Map<string, string>()
    for (const sor of data as Array<{ hivatkozas: string | null }>) {
      if (!sor.hivatkozas) continue
      if (bontasok.has(sor.hivatkozas) || osszesitok.has(sor.hivatkozas)) continue
      const b = bontMentesHibaKulcs(sor.hivatkozas)
      if (b) {
        bontasok.set(sor.hivatkozas, b)
        continue
      }
      const nap = bontMentesOsszesitoKulcs(sor.hivatkozas)
      if (nap) osszesitok.set(sor.hivatkozas, nap)
    }
    if (bontasok.size === 0 && osszesitok.size === 0) return { feloldva: 0 }

    // ── 2) EGYETLEN napló-lekérdezés MINDEN érintett napra ──────────────────
    //
    // ⚠️ MIÉRT NEM HATÓKÖRÖNKÉNT. Ez a seprés MINDEN mentés-felület-betöltéskor
    //    lefut. Kulcsonként egy lekérdezés akár több száz kört jelentene
    //    oldalanként — méghozzá olyan hatókörökre, amelyek SOHA nem oldódnak
    //    meg (egy tartósan bukott gyülekezet minden alkalommal újra). Egy
    //    „segítő" takarítás nem terhelheti meg azt a rendszert, amit gyógyít.
    //
    // ⚠️ 2026-08-11 JAVÍTÁS — `kind='napi'`. A lekérdezés korábban MINDEN
    //    fajtát számított késznek, a lefedettség viszont csak a `napi` sorokat
    //    nézi. Emiatt egy visszaállítás előtti (`pre_restore`) mentés
    //    „megoldottá" tett egy napi bukást, amit a sáv másnap reggel változatlanul
    //    számonkért. Két igazság ugyanarról a napról — pontosan az a hibaosztály,
    //    ami ellen ez az egész kör szól.
    const napok = [
      ...new Set([...[...bontasok.values()].map((b) => b.runDate), ...osszesitok.values()]),
    ]
    // ⚠️ LAPOZOTT OLVASÁS, NEM `.limit(5000)`. A szelet mérete napok ×
    //    (gyülekezetek + 1): 784 hatókörnél EGYETLEN nap is átlépi a PostgREST
    //    1000 soros plafonját, ami NÉMÁN csonkol. Csonkolt szeletből az
    //    ÖSSZESÍTŐ feloldása HAMISAN mondaná ki, hogy „a nap rendbe jött".
    const naplo = await selectAllPaged<{
      run_date: string
      scope: string
      congregation_id: string | null
      status: string
      drive_verified_at: string | null
    }>(
      supabase
        .from('backup_log')
        .select('run_date, scope, congregation_id, status, drive_verified_at')
        .in('run_date', napok)
        .eq('kind', 'napi'),
      { maxRows: 200_000 },
    )
    if (naplo.error) return { feloldva: 0 }

    const kesz = new Set<string>()
    const nyitott = new Set<string>()
    for (const s of naplo.data) {
      const kulcs = `${s.run_date}|${s.scope}|${s.congregation_id ?? 'globalis'}`
      if (s.status === 'ok' && s.drive_verified_at) kesz.add(kulcs)
      else nyitott.add(kulcs)
    }

    const feloldando = [...bontasok.entries()]
      .filter(([, b]) => kesz.has(`${b.runDate}|${b.scope}|${b.congregationId ?? 'globalis'}`))
      .map(([kulcs]) => kulcs)

    // ── 3) AZ ÖSSZESÍTŐ. Csak akkor oldjuk fel, ha arra a napra EGYETLEN
    //      hatókör sem maradt bukottan a naplóban. (A napló nem tud a SOHA el
    //      nem indult hatökörökről — azokat a napi futás sikeres lezárása oldja
    //      fel, lásd `feloldMentesOsszesito` a motorban.)
    const bukottNapok = new Set<string>()
    for (const kulcs of nyitott) {
      if (kesz.has(kulcs)) continue
      bukottNapok.add(kulcs.split('|')[0])
    }
    for (const [kulcs, nap] of osszesitok) {
      if (!bukottNapok.has(nap)) feloldando.push(kulcs)
    }

    if (feloldando.length === 0) return { feloldva: 0 }

    const eredmeny = await feloldErtesitesek({
      hivatkozasok: feloldando,
      megoldasUzenet:
        'AZÓTA RENDBEN. Erre a hatókörre és napra VAN ellenőrzött mentés: a rendszer feltöltötte, ' +
        'majd vissza is olvasta a tárolóból, és az ellenőrző összeg egyezett. Nincs több teendőd.',
    })
    return { feloldva: eredmeny.feloldva }
  } catch {
    return { feloldva: 0 }
  }
}

/**
 * `/admin/biztonsagi-mentes?mentes-hiba=2026-08-11-gyulekezet-<uuid>#mentes-allapot`
 * → `{ runDate, scope, congregationId }`.
 *
 * ⚠️ A dátum is kötőjeles, ezért NEM `split('-')`: a `runDate` FIX 10 karakter,
 *    utána a scope, a maradék az azonosító (ami maga is kötőjeles UUID).
 */
export function bontMentesHibaKulcs(
  kulcs: string,
): { runDate: string; scope: BackupScope; congregationId: string | null } | null {
  const i = kulcs.indexOf('?mentes-hiba=')
  if (i < 0) return null
  const nyers = kulcs.slice(i + '?mentes-hiba='.length).split('#')[0]
  if (nyers.length < 12) return null
  const runDate = nyers.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) return null

  const maradek = nyers.slice(11)
  if (maradek.startsWith('globalis')) {
    return { runDate, scope: 'globalis', congregationId: null }
  }
  if (maradek.startsWith('gyulekezet-')) {
    const id = maradek.slice('gyulekezet-'.length)
    return { runDate, scope: 'gyulekezet', congregationId: id === 'globalis' ? null : id }
  }
  return null
}
