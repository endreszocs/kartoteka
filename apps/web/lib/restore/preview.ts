import 'server-only'

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SZÁRAZ FUTÁS (DRY RUN) — 2026-08-11.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ez a modul megmondja, MI TÖRTÉNNE, MIELŐTT BÁRMI TÖRTÉNNE. Az élő adathoz
 * nem nyúl: a mentés sorait egy átmeneti (staging) táblába tölti, és ott veti
 * össze az élő tartalommal.
 *
 * A száraz futás NEM KIHAGYHATÓ, és ezt nem a felület tartatja be, hanem a
 * rendszer szerkezete: a végrehajtás CSAK olyan terv-tokennel indul el, amit
 * kizárólag ez a modul adhat ki, és amit az adatbázis EGYSZER enged felhasználni.
 *
 * MIÉRT NEM ELÉG A DARABSZÁM:
 *   „37 sor törlődik" semmit nem jelent. „Nagy István temetése kikerül az
 *   anyakönyvből" mindent. Ezért a törlődő sorokról MINTACÍMKÉK is jönnek —
 *   de fehérlistás mezőkből (`backup_restore_row_label`), tehát CNP, szig-szám,
 *   TAJ, fénykép, e-mail, telefon és lelkigondozói megjegyzés SOHA nem kerül ki.
 *
 * SÉMA-SODRÓDÁS: szándékosan NEM a manifest `sema_ujjlenyomat`-ját hasonlítjuk
 *   össze egy másik ujjlenyomattal. Az csak annyit mondana, hogy „változott
 *   valami". A `backup_restore_diff()` ehelyett TÁBLÁNKÉNT megnevezi, mely
 *   oszlopok szűntek meg (az értékük nem jönne vissza) és melyek újak (üresek
 *   lennének). Ez ugyanaz az információ, csak cselekvésre alkalmas alakban.
 */

import { randomUUID } from 'node:crypto'

import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { verifyTableHashes } from '@/lib/backup/payload'

import { checkBackupPassphrase, readBackupArchive } from './backup-port'
import { issuePlanToken } from './plan-token'
import { finishRestoreLog, logRestoreEvent, startRestoreLog, type RestoreActor } from './audit'
import type { RestoreBlocker, RestorePreview, RestoreTableDiff } from './types'

/** Egy staging-darab mérete. 500 sor: a PostgREST törzs-limit alatt stabil. */
const STAGE_DARAB = 500

export interface BuildPreviewArgs {
  backupLogId: number
  passphrase: string
  actor: RestoreActor
}

type PreviewOk = { ok: true; preview: RestorePreview }
type PreviewHiba = { ok: false; error: string }

interface BackupLogRow {
  id: number
  scope: string
  congregation_id: string | null
  congregation_nev: string | null
  kind: string
  run_date: string
  status: string
  finished_at: string | null
  storage_nev: string | null
  drive_file_id: string | null
  media_drive_file_id: string | null
  drive_verified_at: string | null
  sha256: string | null
  env: string | null
  total_rows: number | null
}

interface PolicyRow {
  tabla: string
  hatokor: string
  reteg: number | null
  visszaallithato: boolean
}

/** A környezet-címke, amit ez a telepítés magáénak vall. Alap: `prod`. */
function envCimke(): string {
  return (process.env.BACKUP_ENV_LABEL?.trim() || 'prod').toLowerCase()
}

export async function buildRestorePreview(args: BuildPreviewArgs): Promise<PreviewOk | PreviewHiba> {
  const supabase = getSupabaseAdminClient()
  const figyelmeztetesek: string[] = []

  // ─── 1) A MENTÉS-SOR + ELŐFELTÉTELEI ─────────────────────────────────────
  const { data: logData, error: logError } = await supabase
    .from('backup_log')
    .select(
      'id, scope, congregation_id, congregation_nev, kind, run_date, status, finished_at, storage_nev, drive_file_id, media_drive_file_id, drive_verified_at, sha256, env, total_rows',
    )
    .eq('id', args.backupLogId)
    .maybeSingle()

  if (logError) {
    return { ok: false, error: `A mentés adatai nem olvashatók: ${logError.message}` }
  }
  const backup = logData as BackupLogRow | null
  if (!backup) {
    return { ok: false, error: 'A megadott mentés nem található.' }
  }
  if (backup.scope !== 'gyulekezet' || !backup.congregation_id) {
    return {
      ok: false,
      error:
        'Ez egy rendszer-szintű (globális) mentés. Gombbal CSAK gyülekezeti mentés állítható vissza — az országos helyreállítás runbook szerint történik.',
    }
  }
  if (backup.status !== 'ok' || !backup.drive_verified_at) {
    return {
      ok: false,
      error:
        'Ez a mentés nem IGAZOLT (nem lett feltöltve és visszaolvasva). Nem igazolt mentésből nem állítunk vissza.',
    }
  }
  if (!backup.drive_file_id) {
    return { ok: false, error: 'Ehhez a mentéshez nem tartozik tárolt fájl.' }
  }

  // A KÖRNYEZET-CÍMKE: egy tesztkörnyezetből származó fájl nem kerülhet élesbe.
  const sajatEnv = envCimke()
  if ((backup.env || 'prod').toLowerCase() !== sajatEnv) {
    return {
      ok: false,
      error: `Ez a mentés "${backup.env}" környezetből származik, ez a rendszer viszont "${sajatEnv}". Más környezet mentését nem engedjük visszaállítani.`,
    }
  }

  const congregationId = backup.congregation_id

  // A begépelendő névnek BETŰRE azzal kell egyeznie, amit az SQL-oldal vár:
  // COALESCE(NULLIF(nev_hu,''), name). Ezért innen olvassuk, nem a naplóból.
  const { data: congData, error: congError } = await supabase
    .from('congregations')
    .select('id, nev_hu, name')
    .eq('id', congregationId)
    .maybeSingle()
  if (congError || !congData) {
    return { ok: false, error: 'A mentéshez tartozó gyülekezet nem található.' }
  }
  const cong = congData as { nev_hu: string | null; name: string | null }
  const congregationNev = (cong.nev_hu && cong.nev_hu.length > 0 ? cong.nev_hu : cong.name) || ''
  if (!congregationNev) {
    return { ok: false, error: 'A gyülekezetnek nincs neve — a megerősítés nem végezhető el.' }
  }

  // ─── 2) A MENTÉSI JELSZÓ (sebességfékkel) ────────────────────────────────
  // A hibás próbálkozást a mentés-oldal MÁR naplózza — itt nem duplikáljuk.
  const jelszo = await checkBackupPassphrase({
    passphrase: args.passphrase,
    actorProfileId: args.actor.profileId,
    actorEmail: args.actor.email,
  })
  if (!jelszo.ok) {
    return { ok: false, error: jelszo.error || 'A mentési jelszó nem megfelelő.' }
  }

  // ─── 3) LETÖLTÉS + VISSZAFEJTÉS + A FÉNYKÉPEK VISSZAFŰZÉSE ───────────────
  let archive
  try {
    archive = await readBackupArchive({
      driveFileId: backup.drive_file_id,
      mediaFileId: backup.media_drive_file_id,
      passphrase: args.passphrase,
      storageNev: backup.storage_nev,
    })
  } catch (error: unknown) {
    const uzenet = error instanceof Error ? error.message : 'A mentés nem olvasható.'
    await logRestoreEvent({
      tipus: 'preview',
      actor: args.actor,
      congregationId,
      congregationNev,
      backupLogId: backup.id,
      backupRunDate: backup.run_date,
      outcome: 'failed',
      errorMessage: uzenet,
    })
    return { ok: false, error: uzenet }
  }

  const payload = archive.payload
  figyelmeztetesek.push(...archive.figyelmeztetesek)
  if (archive.jelszoNemNyitotta) {
    figyelmeztetesek.push(
      'Ezt a fájlt nem a mentési jelszó nyitotta ki, hanem a szerver saját kulcsa — vagy felügyelet nélküli napi futás volt, vagy a jelszó beállítása/cseréje előtt készült. A visszaállítás mehet, de ezt a mentést a KARTOTÉKA nélkül, csak a mai jelszóval nem tudod megnyitni.',
    )
  }

  // 3/a — A FÁJL BELSEJE mondja meg, melyik gyülekezetről szól. Ha ez a
  //       naplóval nem egyezik, valami nagyon félrement: MEGÁLLUNK.
  if (payload.manifest.congregation_id && payload.manifest.congregation_id !== congregationId) {
    return {
      ok: false,
      error:
        'A mentés-fájl belseje MÁS gyülekezetre hivatkozik, mint a napló. A visszaállítás nem indulhat el.',
    }
  }
  if (String(payload.manifest.env || 'prod').toLowerCase() !== sajatEnv) {
    return {
      ok: false,
      error: `A mentés-fájl "${payload.manifest.env}" környezet címkéjét viseli, ez a rendszer viszont "${sajatEnv}".`,
    }
  }

  // 3/b — TELJESSÉG. Ezek a bizonyítékok szimmetrikusak az íróval, ezért az
  //       eltérés egyértelműen romlás — BLOKKOL, nem figyelmeztet.
  if (payload.footer.sorok !== payload.totalRows) {
    return {
      ok: false,
      error: `A mentés hiányos: ${payload.footer.sorok.toLocaleString('hu-HU')} sort hirdet, de ${payload.totalRows.toLocaleString('hu-HU')} olvasható belőle.`,
    }
  }
  if (payload.footer.sha256_nyers !== payload.sha256Nyers) {
    return {
      ok: false,
      error:
        'A mentés tartalmi ellenőrzőösszege nem egyezik a fájlban tárolt értékkel. A fájl sérült — nem állítunk vissza belőle.',
    }
  }
  const hashEllenorzes = verifyTableHashes(payload.manifest, payload.tableHashes)
  if (!hashEllenorzes.ok) {
    return {
      ok: false,
      error: `A mentés tartalma nem egyezik a tartalomjegyzékével: ${hashEllenorzes.elteresek.join('; ')}`,
    }
  }

  const rows = payload.rows
  if (!rows) {
    return { ok: false, error: 'A mentés sorai nem olvashatók ki.' }
  }
  if (archive.visszafuzottKepek > 0) {
    figyelmeztetesek.push(
      `${archive.visszafuzottKepek.toLocaleString('hu-HU')} személyi fénykép a külön fényképfájlból kerül vissza.`,
    )
  }

  // ─── 4) BESOROLÁS: MIT SZABAD VISSZATÖLTENI ──────────────────────────────
  const { data: policyData, error: policyError } = await supabase
    .from('backup_table_policy')
    .select('tabla, hatokor, reteg, visszaallithato')
  if (policyError) {
    return { ok: false, error: `A tábla-besorolás nem olvasható: ${policyError.message}` }
  }
  const policy = new Map<string, PolicyRow>()
  for (const p of (policyData ?? []) as PolicyRow[]) policy.set(p.tabla, p)

  const blokkolo: RestoreBlocker[] = []
  const stagelendo: string[] = []
  const nemIrjukFelul: string[] = []

  // A manifest a TELJES tábla-lista — a 0 soros táblákkal EGYÜTT.
  // ⚠️ Az üres táblát is vissza kell tölteni (üres tömbbel), különben a
  //    visszaállítás nem nyúlna hozzá, és a ma benne lévő sorok CSENDBEN
  //    túlélnék — miközben a rendszergazda azt hiszi, visszatért a mentéshez.
  const mentesTablak = Array.from(
    new Set([...Object.keys(payload.manifest.tablak ?? {}), ...Object.keys(rows)]),
  ).sort((a, b) => a.localeCompare(b, 'hu'))

  for (const tabla of mentesTablak) {
    const p = policy.get(tabla)
    if (!p) {
      // FAIL CLOSED: ismeretlen tábla a mentésben. Nem találgatunk.
      blokkolo.push({
        tabla,
        ok: 'Ez a tábla nincs besorolva (backup_table_policy) — a visszaállítás megtagadná.',
      })
      continue
    }
    if (p.hatokor !== 'gyulekezet') {
      nemIrjukFelul.push(
        `${tabla} — rendszer-szintű adat, a gyülekezeti visszaállítás nem nyúl hozzá.`,
      )
      continue
    }
    if (!p.visszaallithato) {
      nemIrjukFelul.push(`${tabla} — napló jellegű tábla: mentve van, de nem írjuk felül.`)
      continue
    }
    if (p.reteg === null || p.reteg === undefined) {
      blokkolo.push({
        tabla,
        ok: 'Nincs visszatöltési rétege: a mentésben BENNE VAN, de a helyes sorrendet nem tudjuk. Ezt SQL-ben kell besorolni.',
      })
      continue
    }
    stagelendo.push(tabla)
  }

  if (stagelendo.length === 0) {
    return {
      ok: false,
      error:
        'Ebből a mentésből egyetlen táblát sem lehet visszatölteni. Ellenőrizd a backup_table_policy besorolásokat.',
    }
  }

  // ─── 5) BETÖLTÉS A STAGING-BE ────────────────────────────────────────────
  const sessionId = randomUUID()

  // A takarítás egyben a 24 óránál régebbi, gazdátlan munkamenetek seprése is.
  const { error: cleanupError } = await supabase.rpc('backup_restore_cleanup', {
    p_session: sessionId,
  })
  if (cleanupError) {
    figyelmeztetesek.push(`A régi átmeneti adatok takarítása nem sikerült: ${cleanupError.message}`)
  }

  try {
    for (const tabla of stagelendo) {
      const sorok = rows[tabla] ?? []
      if (sorok.length === 0) {
        const { error } = await supabase.rpc('backup_restore_stage', {
          p_session: sessionId,
          p_tabla: tabla,
          p_sorszam: 0,
          p_sorok: [],
        })
        if (error) throw new Error(`${tabla}: ${error.message}`)
        continue
      }
      for (let i = 0, darab = 0; i < sorok.length; i += STAGE_DARAB, darab += 1) {
        const { error } = await supabase.rpc('backup_restore_stage', {
          p_session: sessionId,
          p_tabla: tabla,
          p_sorszam: darab,
          p_sorok: sorok.slice(i, i + STAGE_DARAB),
        })
        if (error) throw new Error(`${tabla}: ${error.message}`)
      }
    }
  } catch (error: unknown) {
    await supabase.rpc('backup_restore_cleanup', { p_session: sessionId })
    const uzenet = error instanceof Error ? error.message : 'Az átmeneti betöltés nem sikerült.'
    await logRestoreEvent({
      tipus: 'preview',
      actor: args.actor,
      congregationId,
      congregationNev,
      backupLogId: backup.id,
      backupRunDate: backup.run_date,
      sessionId,
      outcome: 'failed',
      errorMessage: uzenet,
    })
    return { ok: false, error: `A mentés előkészítése nem sikerült — ${uzenet}` }
  }

  // ─── 6) A KÜLÖNBSÉG KISZÁMÍTÁSA ──────────────────────────────────────────
  const { data: diffData, error: diffError } = await supabase.rpc('backup_restore_diff', {
    p_session: sessionId,
    p_congregation_id: congregationId,
  })
  if (diffError) {
    await supabase.rpc('backup_restore_cleanup', { p_session: sessionId })
    return { ok: false, error: `A száraz futás nem sikerült: ${diffError.message}` }
  }

  const diff = (diffData ?? {}) as {
    tablak?: Record<string, Record<string, unknown>>
    blokkolo?: RestoreBlocker[]
    erintetlen?: string[]
    osszesen?: { beszuras?: number; modositas?: number; torles?: number }
  }

  const tablak: RestoreTableDiff[] = Object.entries(diff.tablak ?? {})
    .map(([tabla, v]) => ({
      tabla,
      mentesben: Number(v.mentesben ?? 0),
      elo: Number(v.elo ?? 0),
      beszuras: Number(v.beszuras ?? 0),
      modositas: Number(v.modositas ?? 0),
      torles: Number(v.torles ?? 0),
      valtozatlan: Number(v.valtozatlan ?? 0),
      mintaTorles: Array.isArray(v.minta_torles) ? (v.minta_torles as string[]) : [],
      mintaModositas: Array.isArray(v.minta_modositas) ? (v.minta_modositas as string[]) : [],
      nincsPk: v.nincs_pk === true,
      elveszoOszlopok: Array.isArray(v.elveszo_oszlopok) ? (v.elveszo_oszlopok as string[]) : [],
      ujOszlopok: Array.isArray(v.uj_oszlopok) ? (v.uj_oszlopok as string[]) : [],
      hiba: typeof v.hiba === 'string' ? v.hiba : undefined,
    }))
    // A legfájdalmasabb elöl: ami eltűnne, aztán ami felülíródna.
    .sort(
      (a, b) =>
        b.torles - a.torles || b.modositas - a.modositas || a.tabla.localeCompare(b.tabla, 'hu'),
    )

  for (const t of tablak) {
    if (t.elveszoOszlopok.length > 0) {
      figyelmeztetesek.push(
        `A(z) "${t.tabla}" táblában a mentés óta megszűnt ${t.elveszoOszlopok.length} oszlop (${t.elveszoOszlopok.join(', ')}) — az ezekben tárolt értékek NEM jönnek vissza.`,
      )
    }
    if (t.ujOszlopok.length > 0) {
      figyelmeztetesek.push(
        `A(z) "${t.tabla}" táblához a mentés óta ${t.ujOszlopok.length} új oszlop került (${t.ujOszlopok.join(', ')}) — a visszaállított sorokban ezek üresek lesznek.`,
      )
    }
  }

  const sqlBlokkolo = Array.isArray(diff.blokkolo) ? diff.blokkolo : []
  const osszesBlokkolo = [...blokkolo, ...sqlBlokkolo]

  // ─── 6/b) A BLOKKOLÓ ITT VÉGZETES, NEM CSAK A FELÜLETEN ──────────────────
  //
  // ⚠️ 2026-08-11 JAVÍTÁS. Korábban a blokkolókat KIZÁRÓLAG a kliens-komponens
  //    (`restore-panel.tsx`) nézte meg: a szerver kiadta a terv-tokent, a
  //    blokkolt táblákat viszont nem töltötte be a stagingbe, ezért az SQL
  //    védőkapuja SEM láthatta őket. Aki a tokent közvetlenül visszaküldte
  //    (devtools, visszajátszás), RÉSZLEGES visszaállítást kapott: a blokkolt
  //    tábla élő sorai érintetlenül túléltek, minden más lecserélődött —
  //    vegyes korú adatbázis, a rendszergazda tudta nélkül. Ez ugyanaz a
  //    „csak a felületen létező kapu", amit a delegált import PIN-jénél már
  //    egyszer megszenvedtünk.
  if (osszesBlokkolo.length > 0) {
    await supabase.rpc('backup_restore_cleanup', { p_session: sessionId })
    const nevek = osszesBlokkolo.slice(0, 10).map((b) => `${b.tabla} (${b.ok})`)
    await logRestoreEvent({
      tipus: 'preview',
      actor: args.actor,
      congregationId,
      congregationNev,
      backupLogId: backup.id,
      backupRunDate: backup.run_date,
      sessionId,
      outcome: 'failed',
      errorMessage: `Blokkoló táblák: ${osszesBlokkolo.map((b) => b.tabla).join(', ')}`,
    })
    return {
      ok: false,
      error:
        'A visszaállítás NEM indítható: van olyan tábla, amit a rendszer nem tud helyesen ' +
        'visszatölteni, és egy RÉSZLEGES visszaállítás rosszabb, mint a semmilyen. ' +
        `Érintett táblák: ${nevek.join('; ')}` +
        (osszesBlokkolo.length > 10 ? ` (+${osszesBlokkolo.length - 10} további)` : '') +
        '. Ezeket SQL-ben kell besorolni (backup_table_policy), utána futtasd újra az előnézetet.',
    }
  }

  const osszesen = {
    beszuras: Number(diff.osszesen?.beszuras ?? 0),
    modositas: Number(diff.osszesen?.modositas ?? 0),
    torles: Number(diff.osszesen?.torles ?? 0),
  }

  // ─── 7) AZ ÉLŐ ÁLLAPOT UJJLENYOMATA ──────────────────────────────────────
  const { data: fpData, error: fpError } = await supabase.rpc('backup_restore_live_fingerprint', {
    p_congregation_id: congregationId,
  })
  if (fpError) {
    await supabase.rpc('backup_restore_cleanup', { p_session: sessionId })
    return { ok: false, error: `Az élő állapot ellenőrzése nem sikerült: ${fpError.message}` }
  }
  const liveFingerprint = String(fpData ?? '')

  // ─── 8) NAPLÓ (a száraz futás maga is naplózandó) ────────────────────────
  const dryLog = await startRestoreLog({
    tipus: 'preview',
    actor: args.actor,
    congregationId,
    congregationNev,
    backupLogId: backup.id,
    backupRunDate: backup.run_date,
    backupSha256: backup.sha256,
    sessionId,
    liveFingerprint,
    // CSAK SZÁMOK kerülnek a naplóba — a nevekkel teli előnézet a képernyőn marad.
    diffSummary: {
      osszesen,
      tablak: Object.fromEntries(
        tablak.map((t) => [
          t.tabla,
          { beszuras: t.beszuras, modositas: t.modositas, torles: t.torles },
        ]),
      ),
    },
    outcome: 'ok',
  })
  if (!dryLog.ok) {
    await supabase.rpc('backup_restore_cleanup', { p_session: sessionId })
    return { ok: false, error: `Naplózatlan előnézet nincs: ${dryLog.error}` }
  }
  await finishRestoreLog({ id: dryLog.id, outcome: 'ok', figyelmeztetesek })

  // ─── 9) TERV-TOKEN ───────────────────────────────────────────────────────
  const { token, lejar } = await issuePlanToken({
    blid: backup.id,
    cid: congregationId,
    sid: sessionId,
    fp: liveFingerprint,
    act: args.actor.profileId || '',
    dry: dryLog.id,
    // A VÁRT tábla-halmaz. A végrehajtás ehhez méri az átmeneti tár tényleges
    // tartalmát, és az SQL is ezt kapja meg — ha bármelyik tábla kiesne, a
    // tranzakció megtagadja a futást ahelyett, hogy félig végezné el.
    stg: [...stagelendo].sort(),
    jti: randomUUID(),
  })

  // ─── 10) AMIT A VISSZAÁLLÍTÁS NEM TUD (mindig látszik) ───────────────────
  const amitNemTud: string[] = [
    'A feltöltött FÁJLOK (iktatói szkennek, dokumentumok) nem jönnek vissza — azokat a rendszer tárolója őrzi külön.',
    'A belépési jelszavak nem változnak: azokat a rendszer soha nem is látja.',
    'Az adatbázis SZERKEZETE (jogosultsági szabályok, függvények) nem áll vissza.',
    'A nyugta- és iktatószámok NEM mennek vissza: a számlálók csak előre léphetnek, hogy ne adjunk ki kétszer ugyanazt a számot.',
  ]
  const kimaradt = payload.manifest.kimaradt
  if (kimaradt?.storage_bucketek?.length) {
    amitNemTud.push(`A mentésből kimaradtak a tárolók: ${kimaradt.storage_bucketek.join(', ')}.`)
  }
  if (kimaradt?.tablak?.length) {
    amitNemTud.push(`Szándékosan kimaradt táblák: ${kimaradt.tablak.join(', ')}.`)
  }
  for (const sor of nemIrjukFelul) amitNemTud.push(sor)

  const preview: RestorePreview = {
    backupLogId: backup.id,
    congregationId,
    congregationNev,
    runDate: backup.run_date,
    keszult: backup.finished_at,
    dryRunLogId: dryLog.id,
    tablak,
    osszesen,
    blokkolo: osszesBlokkolo,
    erintetlen: Array.isArray(diff.erintetlen) ? diff.erintetlen : [],
    figyelmeztetesek,
    amitNemTud,
    planToken: token,
    planTokenLejar: lejar,
  }

  return { ok: true, preview }
}
