import 'server-only'

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VISSZAÁLLÍTÁS VÉGREHAJTÁSA — a rendszer legveszélyesebb kódja. 2026-08-11.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A SORREND ITT NEM ÍZLÉS KÉRDÉSE. Ebben a sorrendben:
 *
 *   1. terv-token           — bizonyíték, hogy VOLT száraz futás (kihagyhatatlan)
 *   2. cselekvő egyezése    — a tokent más nem használhatja fel
 *   3. mentési jelszó       — sebességfékkel, naplózott bukással
 *   4. begépelt név + dátum — betűre, ékezetre; a dátum azért, hogy ELOLVASSA,
 *                             melyik pillanatot választotta
 *   5. az átmeneti adat még megvan
 *   6. az ÉLŐ állapot nem változott az előnézet óta
 *   7. NAPLÓSOR NYITÁSA     — a művelet ELŐTT; az adatbázis itt kényszeríti ki,
 *                             hogy egy terv-token EGYSZER használható
 *   8. KÖTELEZŐ ELŐ-MENTÉS  — igazolva; ha bukik, EGYETLEN SOR SEM VÁLTOZIK
 *   9. a felülírás          — EGY tranzakcióban, az SQL-oldalon
 *  10. értesítés            — akkor is, ha a cselekvő maga a címzett
 *
 * VISSZAGÖRGETÉS (dokumentált út):
 *   · A 9. lépés EGY tranzakció. Ha bármi elhasal benne (FK, időtúllépés,
 *     memória), a Postgres MINDENT visszagörget — nincs félig visszaállított
 *     gyülekezet, nincs mit „folytatni".
 *   · Ha a tranzakció ÁTMENT, de az eredmény mégsem az, amit akartunk: a 8.
 *     lépésben készült, IGAZOLT `pre_restore` mentés visszaállítása az UNDO.
 *     Ez a mentés 90 napig megmarad, és a felület ki is írja az azonosítóját.
 *   · Egy bukott kísérlet ELHASZNÁLJA a terv-tokent. Ez szándékos: az élő
 *     állapot közben változhatott, tehát a látott „ami elveszne" lista már nem
 *     biztos, hogy igaz — új száraz futás kell.
 */

import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'

import { checkBackupPassphrase, runPreRestoreBackup } from './backup-port'
import { sendRestoreAlert } from './alerts'
import {
  attachPreRestoreBackup,
  finishRestoreLog,
  startRestoreLog,
  type RestoreActor,
} from './audit'
import { planTokenHash, verifyPlanToken } from './plan-token'
import { INDOKLAS_MIN_HOSSZ, type RestoreExecuteInput, type RestoreExecuteResult } from './types'

export interface ExecuteRestoreArgs extends RestoreExecuteInput {
  actor: RestoreActor
}

function hiba(error: string): RestoreExecuteResult {
  return { success: false, error }
}

/**
 * A szerver-oldali hibaüzenetek barátságosítása. A `MEGTAGADVA:` előtagú
 * üzenetek az SQL védőkapuiból jönnek — azokat szó szerint továbbadjuk, mert
 * pontosan megmondják, mi hiányzik.
 */
function forditsdRpcHibat(msg: string): string {
  const megtagadva = msg.indexOf('MEGTAGADVA:')
  if (megtagadva >= 0) {
    return `Megtagadva: ${msg.slice(megtagadva + 'MEGTAGADVA:'.length).trim()}`
  }
  if (msg.includes('nem egyezik a gyülekezet nevével')) {
    return 'A begépelt név nem egyezik a gyülekezet hivatalos nevével.'
  }
  if (msg.includes('statement timeout') || msg.includes('canceling statement')) {
    return 'A visszaállítás túllépte az időkeretet, ezért a rendszer MINDENT visszagörgetett — egyetlen sor sem változott. Ekkora adatmennyiséghez runbook kell.'
  }
  return `A visszaállítás nem futott le: ${msg}`
}

export async function executeRestore(args: ExecuteRestoreArgs): Promise<RestoreExecuteResult> {
  const supabase = getSupabaseAdminClient()
  const figyelmeztetesek: string[] = []

  // ─── 0) Indoklás ─────────────────────────────────────────────────────────
  const indoklas = (args.indoklas || '').trim()
  if (indoklas.length < INDOKLAS_MIN_HOSSZ) {
    return hiba(
      `Az indoklás kötelező, legalább ${INDOKLAS_MIN_HOSSZ} karakter. Ez a naplóba kerül — egy év múlva ebből fogod tudni, miért történt.`,
    )
  }

  // ─── 1) TERV-TOKEN: volt-e száraz futás? ─────────────────────────────────
  let claims
  try {
    claims = await verifyPlanToken(args.planToken)
  } catch (error: unknown) {
    return hiba(error instanceof Error ? error.message : 'A terv-token érvénytelen.')
  }

  // ─── 2) A tokent CSAK az használhatja fel, aki kérte ─────────────────────
  if (!args.actor.profileId || claims.act !== args.actor.profileId) {
    return hiba(
      'Ez az előnézet másik felhasználóhoz tartozik. A visszaállítást annak kell befejeznie, aki a száraz futást elindította.',
    )
  }

  // ─── 3) A MENTÉSI JELSZÓ ─────────────────────────────────────────────────
  // A hibás próbálkozást a mentés-oldal MÁR naplózza (`passphrase_fail`), és a
  // sebességféket is ő számolja — itt nem duplikáljuk, mert a kettős naplózás
  // az 5 próbából 3-at csinálna.
  const jelszo = await checkBackupPassphrase({
    passphrase: args.passphrase,
    actorProfileId: args.actor.profileId,
    actorEmail: args.actor.email,
  })
  if (!jelszo.ok) {
    return hiba(jelszo.error || 'A mentési jelszó nem megfelelő.')
  }

  // ─── 4) A mentés és a gyülekezet újraolvasása (a tokennek nem hiszünk vakon) ─
  const { data: logData, error: logError } = await supabase
    .from('backup_log')
    .select('id, scope, congregation_id, run_date, status, drive_verified_at, sha256, env')
    .eq('id', claims.blid)
    .maybeSingle()
  if (logError || !logData) {
    return hiba('A visszaállítandó mentés időközben eltűnt a naplóból.')
  }
  const backup = logData as {
    id: number
    scope: string
    congregation_id: string | null
    run_date: string
    status: string
    drive_verified_at: string | null
    sha256: string | null
  }
  if (
    backup.scope !== 'gyulekezet' ||
    backup.congregation_id !== claims.cid ||
    backup.status !== 'ok' ||
    !backup.drive_verified_at
  ) {
    return hiba('A mentés már nem felel meg a visszaállítás feltételeinek.')
  }

  const { data: congData } = await supabase
    .from('congregations')
    .select('nev_hu, name')
    .eq('id', claims.cid)
    .maybeSingle()
  const cong = congData as { nev_hu: string | null; name: string | null } | null
  const congregationNev = (cong?.nev_hu && cong.nev_hu.length > 0 ? cong.nev_hu : cong?.name) || ''
  if (!congregationNev) {
    return hiba('A gyülekezet nem található.')
  }

  // 4/a — a BEGÉPELT NÉV (betűre, ékezetre). Az SQL is újra ellenőrzi.
  if ((args.confirmName || '').trim() !== congregationNev) {
    return hiba('A begépelt gyülekezet-név nem egyezik pontosan (betűre, ékezetre).')
  }
  // 4/b — a BEGÉPELT DÁTUM. Nem szertartás: ettől olvassa el, MELYIK
  //       pillanatot választotta.
  if ((args.confirmDate || '').trim() !== backup.run_date) {
    return hiba(
      `A begépelt dátum nem egyezik a választott mentés dátumával (${backup.run_date}).`,
    )
  }

  // ─── 5) Megvan-e még az előkészített adat — ÉS TELJES-E? ─────────────────
  //
  // ⚠️ A DARABSZÁM ÖNMAGÁBAN NEM ELÉG. Ha az előnézet óta akár EGY tábla
  //    kiesett az átmeneti tárból, a `backup_restore_apply` arról a tábláról
  //    nem tudna — az élő sorai ÉRINTETLENÜL TÚLÉLNÉK a visszaállítást,
  //    miközben minden más lecserélődik. Vegyes korú adatbázis, némán. Ezért a
  //    tokenben hozott listát BETŰRE egyeztetjük a tényleges tartalommal.
  const { data: stagedRows, error: stagedError } = await supabase
    .from('backup_restore_staging')
    .select('tabla')
    .eq('session_id', claims.sid)
  if (stagedError) {
    return hiba(`Az előkészített adat nem ellenőrizhető: ${stagedError.message}`)
  }
  const stagedTablak = new Set<string>(
    ((stagedRows ?? []) as Array<{ tabla: string }>).map((r) => r.tabla),
  )
  if (stagedTablak.size === 0) {
    return hiba(
      'Az előnézet előkészített adata már nem érhető el (lejárt vagy kitakarítva). Futtasd le újra a száraz futást.',
    )
  }
  const hianyzo = claims.stg.filter((t) => !stagedTablak.has(t))
  const tobblet = [...stagedTablak].filter((t) => !claims.stg.includes(t))
  if (hianyzo.length > 0 || tobblet.length > 0) {
    return hiba(
      'Az előkészített adat NEM egyezik azzal, amit az előnézetben láttál' +
        (hianyzo.length > 0 ? ` — hiányzik: ${hianyzo.slice(0, 8).join(', ')}` : '') +
        (tobblet.length > 0 ? ` — többlet: ${tobblet.slice(0, 8).join(', ')}` : '') +
        '. Egy részleges visszaállítás vegyes korú adatbázist hagyna maga után, ezért ' +
        'megállunk. Futtasd le újra a száraz futást.',
    )
  }

  // ─── 5/b) A BESOROLÁS ÚJRAELLENŐRZÉSE — SZERVEROLDALON ───────────────────
  //
  // Az előnézet óta változhatott a `backup_table_policy` (pl. valaki kivett egy
  // réteget). A felület blokkoló-listája CSAK a böngészőben él; ez itt az a
  // kapu, amit egy visszaküldött terv-tokennel sem lehet megkerülni.
  const { data: policyRows, error: policyError } = await supabase
    .from('backup_table_policy')
    .select('tabla, hatokor, reteg, visszaallithato')
    .in('tabla', claims.stg)
  if (policyError) {
    return hiba(`A tábla-besorolás nem ellenőrizhető: ${policyError.message}`)
  }
  const policyMap = new Map<string, { hatokor: string; reteg: number | null; visszaallithato: boolean }>()
  for (const p of (policyRows ?? []) as Array<{
    tabla: string
    hatokor: string
    reteg: number | null
    visszaallithato: boolean
  }>) {
    policyMap.set(p.tabla, { hatokor: p.hatokor, reteg: p.reteg, visszaallithato: p.visszaallithato })
  }
  const blokkolok: string[] = []
  for (const tabla of claims.stg) {
    const p = policyMap.get(tabla)
    if (!p) blokkolok.push(`${tabla}: nincs besorolva`)
    else if (p.hatokor !== 'gyulekezet') blokkolok.push(`${tabla}: nem gyülekezeti hatókörű`)
    else if (p.reteg === null || p.reteg === undefined) blokkolok.push(`${tabla}: nincs rétege`)
    else if (!p.visszaallithato) blokkolok.push(`${tabla}: szándékosan nem visszaállítható`)
  }
  if (blokkolok.length > 0) {
    return hiba(
      'A visszaállítás megtagadva: az előnézet óta megváltozott a tábla-besorolás. ' +
        `Érintett: ${blokkolok.slice(0, 8).join('; ')}` +
        (blokkolok.length > 8 ? ` (+${blokkolok.length - 8} további)` : '') +
        '. Futtasd le újra a száraz futást.',
    )
  }

  // ─── 6) VÁLTOZOTT-E AZ ÉLŐ ÁLLAPOT AZ ELŐNÉZET ÓTA? ──────────────────────
  const { data: fpData, error: fpError } = await supabase.rpc(
    'backup_restore_live_fingerprint',
    { p_congregation_id: claims.cid },
  )
  if (fpError) {
    return hiba(`Az élő állapot ellenőrzése nem sikerült: ${fpError.message}`)
  }
  if (String(fpData ?? '') !== claims.fp) {
    return hiba(
      'Közben valaki dolgozott a rendszerben, ezért az előnézetben látott lista már nem igaz. Nézd meg újra, mi változna — a visszaállítás csak friss előnézettel indulhat.',
    )
  }

  // ─── 7) NAPLÓSOR — A MŰVELET ELŐTT ───────────────────────────────────────
  // Az adatbázis UNIQUE indexe itt kényszeríti ki, hogy egy száraz futás
  // pontosan EGY visszaállítást hitelesítsen (dupla kattintás, két böngészőfül,
  // visszajátszás — mind ugyanezen a ponton hasal el).
  const log = await startRestoreLog({
    tipus: 'restore',
    actor: args.actor,
    congregationId: claims.cid,
    congregationNev,
    backupLogId: backup.id,
    backupRunDate: backup.run_date,
    backupSha256: backup.sha256,
    planTokenHash: planTokenHash(args.planToken),
    dryRunLogId: claims.dry,
    sessionId: claims.sid,
    liveFingerprint: claims.fp,
    indoklas,
    outcome: 'indult',
  })
  if (!log.ok) {
    // Naplózatlan visszaállítás NINCS. Ha nem tudunk naplózni, megállunk.
    return hiba(log.error)
  }

  // ─── 8) KÖTELEZŐ, IGAZOLT ELŐ-MENTÉS — EDDIG EGYETLEN SOR SEM VÁLTOZOTT ──
  // A mentési jelszót átadjuk: így ez a fájl a KARTOTÉKA nélkül is nyitható.
  // Ha valaha az egész rendszer elveszne, EBBŐL lehet visszajutni ide.
  const elomentes = await runPreRestoreBackup(claims.cid, args.passphrase)
  figyelmeztetesek.push(...elomentes.figyelmeztetesek)
  /**
   * Közös bukás-ág: naplózás + értesítés, EGY helyen. Az értesítés hibáit
   * (pl. le nem ment e-mail) visszaírja a naplóba — a riasztás maga se
   * veszhessen el némán.
   */
  const bukas = async (uzenet: string, preId: number | null): Promise<void> => {
    const riasztas = await sendRestoreAlert({
      kind: 'sikertelen',
      congregationId: claims.cid,
      congregationNev,
      backupRunDate: backup.run_date,
      actorEmail: args.actor.email,
      restoreLogId: log.id,
      hibaUzenet: uzenet,
    })
    await finishRestoreLog({
      id: log.id,
      outcome: 'failed',
      errorMessage: uzenet,
      preRestoreBackupId: preId,
      figyelmeztetesek: [...figyelmeztetesek, ...riasztas],
    })
  }

  if (!elomentes.ok || !elomentes.igazolt || !elomentes.backupLogId) {
    const uzenet =
      elomentes.error ||
      'A visszaállítás előtti mentés nem készült el (vagy nem lett igazolva).'
    await bukas(uzenet, elomentes.backupLogId ?? null)
    return hiba(
      `${uzenet} A visszaállítás EL SEM INDULT — az adataidhoz nem nyúlt hozzá a rendszer. Előbb a mentésnek kell működnie.`,
    )
  }
  await attachPreRestoreBackup(log.id, elomentes.backupLogId, figyelmeztetesek)

  // ─── 8/b) AZ ÉLŐ ÁLLAPOT ÚJRAELLENŐRZÉSE — A MENTÉS UTÁN ─────────────────
  // Az elő-mentés másodpercekbe-percekbe telhet. Ha közben bárki írt a
  // rendszerbe, az az adat NEM szerepelt a száraz futásban, tehát a
  // rendszergazda olyat törölne, amit sosem látott. Ezt a rést itt zárjuk be.
  //
  // Nem baj, ha emiatt megáll: az elő-mentés MÁR ELKÉSZÜLT, tehát a friss
  // munka is meg van mentve — csak új előnézet kell hozzá.
  const { data: fp2Data, error: fp2Error } = await supabase.rpc(
    'backup_restore_live_fingerprint',
    { p_congregation_id: claims.cid },
  )
  if (fp2Error || String(fp2Data ?? '') !== claims.fp) {
    const uzenet = fp2Error
      ? `Az élő állapot újraellenőrzése nem sikerült: ${fp2Error.message}`
      : 'A visszaállítás előtti mentés készítése közben valaki írt a rendszerbe, ezért az előnézetben látott lista már nem igaz.'
    await bukas(uzenet, elomentes.backupLogId)
    return {
      success: false,
      error: `${uzenet} Az adatokhoz NEM nyúltunk hozzá, és az elő-mentés elkészült — futtasd le újra a száraz futást.`,
      restoreLogId: log.id,
      preRestoreBackupLogId: elomentes.backupLogId,
      preRestoreKeszult: elomentes.keszult,
    }
  }

  // ─── 9) A FELÜLÍRÁS — EGY TRANZAKCIÓ ─────────────────────────────────────
  const { data: applyData, error: applyError } = await supabase.rpc('backup_restore_apply', {
    p_session: claims.sid,
    p_congregation_id: claims.cid,
    // ⚠️ A FELHASZNÁLÓ ÁLTAL BEGÉPELT nevet adjuk át, NEM a kikeresettet.
    //    Ha a kanonikus nevet küldenénk, az SQL-oldali név-ellenőrzés önmagát
    //    hasonlítaná össze — a második kapu csak a felületen létezne. Így az
    //    adatbázis is a felhasználó tényleges gépelését veti össze a sajátjával.
    p_confirm_name: args.confirmName.trim(),
    p_pre_restore_log_id: elomentes.backupLogId,
    p_restore_log_id: log.id,
    // A VÁRT tábla-halmaz — az adatbázis is összeveti a ténylegesen betöltöttel.
    // Ez a HARMADIK, egymástól független ellenőrzés ugyanarra a kérdésre:
    // „tényleg minden tábla visszatöltésre kerül, amit az előnézet ígért?"
    p_vart_tablak: claims.stg,
  })

  if (applyError) {
    const uzenet = forditsdRpcHibat(applyError.message)
    await bukas(uzenet, elomentes.backupLogId)
    return {
      success: false,
      // ⚠️ Nem ígérjük meg, hogy „semmi nem változott". A művelet EGY
      //    tranzakció, tehát félkész állapot nem maradhat — de ha a válasz a
      //    hazaúton veszett el, a visszaállítás akár le is futhatott. A napló
      //    tudja a valóságot (az SQL ott zárja le a sort), ezért odaküldünk.
      error: `${uzenet} A művelet egyetlen tranzakcióban fut, ezért félkész állapot nem maradhat — de mielőtt újrapróbálod, nézd meg a visszaállítás-naplóban, mi lett a művelet sorsa.`,
      restoreLogId: log.id,
      preRestoreBackupLogId: elomentes.backupLogId,
      preRestoreKeszult: elomentes.keszult,
    }
  }

  // ─── 10) EREDMÉNY + ÉRTESÍTÉS ────────────────────────────────────────────
  const eredmeny = (applyData ?? {}) as {
    congregation_nev?: string
    restore_epoch?: number
    tablak?: Record<string, { elotte?: number; utana?: number }>
  }

  const tablak = Object.entries(eredmeny.tablak ?? {})
    .map(([tabla, v]) => ({
      tabla,
      elotte: Number(v?.elotte ?? 0),
      utana: Number(v?.utana ?? 0),
    }))
    .sort((a, b) => a.tabla.localeCompare(b.tabla, 'hu'))

  const riasztas = await sendRestoreAlert({
    kind: 'sikeres',
    congregationId: claims.cid,
    congregationNev,
    backupRunDate: backup.run_date,
    actorEmail: args.actor.email,
    restoreLogId: log.id,
  })
  const osszesFigyelmeztetes = [...figyelmeztetesek, ...riasztas]

  // A sikeres sort az SQL már lezárta (ugyanabban a tranzakcióban, mint az
  // adatváltozás). Itt CSAK a figyelmeztetéseket és az elő-mentést fűzzük hozzá.
  if (osszesFigyelmeztetes.length > 0) {
    await attachPreRestoreBackup(log.id, elomentes.backupLogId, osszesFigyelmeztetes)
  }

  return {
    success: true,
    restoreLogId: log.id,
    preRestoreBackupLogId: elomentes.backupLogId,
    preRestoreKeszult: elomentes.keszult,
    congregationNev: eredmeny.congregation_nev || congregationNev,
    restoreEpoch: Number(eredmeny.restore_epoch ?? 0),
    tablak,
    figyelmeztetesek: osszesFigyelmeztetes,
  }
}
