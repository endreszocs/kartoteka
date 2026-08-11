import 'server-only'

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VISSZAÁLLÍTÁS EGYETLEN KAPCSOLÓDÁSI PONTJA A MENTÉS-OLDALHOZ. 2026-08-11.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MIÉRT VAN EZ A FÁJL:
 *   A mentés-oldalt (`lib/backup/**`, `lib/google-drive/**`) másik fejlesztési
 *   szál építi. Ha a visszaállítás tucatnyi helyről nyúlna át oda, minden apró
 *   aláírás-változás tucatnyi fájlt törne el — és ez a rendszer LEGVESZÉLYESEBB
 *   kódja, itt a legkevésbé engedhető meg a széthullás.
 *
 *   Ezért a teljes átnyúlás EBBEN AZ EGY FÁJLBAN van, NÉGY függvényre szűkítve.
 *   A visszaállítás többi része csak az itt definiált típusokat ismeri.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A FÉNYKÉPEK — EZ A FÁJL LEGFONTOSABB RÉSZE
 * ════════════════════════════════════════════════════════════════════════════
 * A mentés a `szemely.kep` base64 fényképeket KÜLÖN fájlba teszi (különben a
 * napi mentés 60-180 MB-tal hízna). A fő fájlban a `kep` kulcs `null`-ra áll.
 *
 * Ha a visszaállítás ezt észrevétlenül hagyná, MINDEN ARCKÉP TÖRLŐDNE — a
 * `jsonb_populate_recordset` a `null`-t hűségesen visszaírná. Ez pontosan az a
 * néma adatvesztés, ami ellen az egész rendszer épül.
 *
 * Ezért a `readBackupArchive()` a média-fájlt IS letölti, és a fényképeket
 * VISSZAFŰZI a `szemely` sorokba. Ha a média-fájl hiányzik vagy hiányos,
 * FAIL-CLOSED hibát ad — inkább nem indul el a visszaállítás, mint hogy
 * csendben eltüntesse a gyülekezet összes fényképét.
 *
 * ⛔ Ez a fájl nem tárol, nem naplóz és nem ad vissza kulcsot, jelszót vagy
 *    tokent — sem a hosszukat, sem az előtagjukat.
 */

import { headers } from 'next/headers'

import { openStoredBackup } from '@/lib/backup/export'
import { parsePayload, type ParsedPayload } from '@/lib/backup/payload'
import { runSingleCongregationBackup } from '@/lib/backup/worker'
import { verifyBackupPassphrase } from '@/lib/google-drive/backup-passphrase'
import { hashClientIp } from '@/lib/utils/ip-hash'

/** A `szemely.kep` az EGYETLEN média-oszlop (lásd `export.ts` 3) lépés). */
const MEDIA_TABLA = 'szemely'
const MEDIA_OSZLOP = 'kep'

/** A visszaállítás-előtti mentés eredménye — a mi szótárunkban. */
export interface PreRestoreBackupResult {
  ok: boolean
  /** A `backup_log` sor azonosítója. */
  backupLogId?: number
  /** Mikor készült (ISO) — ezt írjuk ki az „undo" kártyára. */
  keszult?: string
  /** Igazolt-e: feltöltve ÉS visszaolvasva ÉS a sorszámok egyeztek. */
  igazolt: boolean
  figyelmeztetesek: string[]
  error?: string
}

/** A visszafejtett és TELJESSÉ TETT mentés (a fényképekkel együtt). */
export interface DecryptedArchive {
  payload: ParsedPayload
  /** true, ha a fájlt nem a mentési jelszó, hanem a szerver-kulcs nyitotta. */
  jelszoNemNyitotta: boolean
  /** Hány fényképet fűztünk vissza a `szemely` sorokba. */
  visszafuzottKepek: number
  figyelmeztetesek: string[]
}

function hibaSzoveg(error: unknown, alap: string): string {
  // ⚠️ SOHA nem a nyers hibaobjektumot: az a lekérdezést és így SORÉRTÉKEKET
  // is kiírhatna. Csak a message.
  return error instanceof Error && error.message ? error.message : alap
}

/** Az IP-t SOHA nem tároljuk, csak sózott hash-ét. */
async function ipHash(): Promise<string | null> {
  try {
    return hashClientIp(await headers())
  } catch {
    return null
  }
}

/**
 * KÖTELEZŐ ELŐ-MENTÉS a visszaállítás előtt.
 *
 * Ez a rendszer biztonsági hálója: ha a visszaállítás rossz pillanatot hoz
 * vissza, ebből lehet visszatérni a MOSTANI állapotra. Ezért csak akkor
 * számít sikeresnek, ha IGAZOLT — a fájl fel is került a tárolóba, vissza is
 * olvastuk, és a sorszámok egyeztek.
 *
 * A mentési jelszót átadjuk, hogy ez a fájl a KARTOTÉKA nélkül is nyitható
 * legyen. Ha valaha az egész rendszer elveszne, ez az a fájl, amiből a
 * tulajdonos vissza tud jutni ehhez a pillanathoz.
 */
export async function runPreRestoreBackup(
  congregationId: string,
  passphrase: string,
): Promise<PreRestoreBackupResult> {
  try {
    const res = await runSingleCongregationBackup({
      congregationId,
      kind: 'pre_restore',
      passphrase,
    })

    // FAIL CLOSED: csak akkor igazolt, ha EXPLICIT annak mondja magát.
    if (!res.igazolt || res.backupLogId === null) {
      return {
        ok: false,
        igazolt: false,
        backupLogId: res.backupLogId ?? undefined,
        figyelmeztetesek: res.figyelmeztetesek,
        error:
          res.error ||
          'A visszaállítás előtti mentés nem lett igazolva (feltöltés + visszaolvasás + sorszám-egyeztetés).',
      }
    }

    return {
      ok: true,
      igazolt: true,
      backupLogId: res.backupLogId,
      keszult: res.finishedAt ?? undefined,
      figyelmeztetesek: res.figyelmeztetesek,
    }
  } catch (error: unknown) {
    return {
      ok: false,
      igazolt: false,
      figyelmeztetesek: [],
      error: hibaSzoveg(error, 'A visszaállítás előtti mentés nem sikerült.'),
    }
  }
}

/**
 * A MENTÉSI JELSZÓ ellenőrzése — sebességfékkel.
 *
 * A jelszó a LETÖLTÉST és a VISSZAÁLLÍTÁST őrzi; a rendszer csak ellenőrző
 * hasht tárol belőle, a nyers jelszót SOHA. Ez NEM a bejelentkezési jelszó.
 *
 * ⚠️ A hibás próbálkozás naplózását a mentés-oldal MÁR ELVÉGZI
 *    (`backup_restore_log`, `tipus='passphrase_fail'`). A visszaállítás ezért
 *    NEM naplózza újra — a kétszeres naplózás a sebességféket is elrontaná
 *    (5 próbából 3 lenne).
 */
export async function checkBackupPassphrase(args: {
  passphrase: string
  actorProfileId: string | null
  actorEmail: string | null
}): Promise<{ ok: boolean; error?: string }> {
  if (!args.passphrase || args.passphrase.trim().length === 0) {
    return { ok: false, error: 'A mentési jelszó nem lehet üres.' }
  }
  try {
    const res = await verifyBackupPassphrase({
      jelszo: args.passphrase,
      actorProfileId: args.actorProfileId,
      actorEmail: args.actorEmail,
      actorIpHash: await ipHash(),
    })
    if (!res.ok) {
      return { ok: false, error: res.error || 'A mentési jelszó nem megfelelő.' }
    }
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, error: hibaSzoveg(error, 'A mentési jelszó ellenőrzése nem sikerült.') }
  }
}

/**
 * A tárolt mentés letöltése, visszafejtése, értelmezése — ÉS A FÉNYKÉPEK
 * VISSZAFŰZÉSE.
 *
 * A `parsePayload` fail-closed: hiányzó manifest, hiányzó záró sor, ismeretlen
 * sor-alak, ismeretlen formátum-verzió — mind HIBA. Egy „majdnem teljes"
 * mentés a legveszélyesebb dolog, amit visszatölthetnénk, mert megbízhatónak
 * látszik.
 */
export async function readBackupArchive(args: {
  driveFileId: string
  mediaFileId: string | null
  passphrase: string
  /**
   * MELYIK tárolóban van a fájl (`backup_log.storage_nev`). Enélkül a rendszer
   * az ÉPPEN AKTUÁLIS tárolóban keresné — és egy későbbi Drive-bekötés után a
   * régi, Supabase Storage-ban lévő mentések „eltűnnének".
   */
  storageNev?: string | null
}): Promise<DecryptedArchive> {
  const figyelmeztetesek: string[] = []

  const opened = await openStoredBackup({
    fileId: args.driveFileId,
    passphrase: args.passphrase,
    storageNev: args.storageNev ?? null,
  })
  const payload = parsePayload(opened.ndjson, { collectRows: true })

  const visszafuzottKepek = await mergeMedia({
    payload,
    mediaFileId: args.mediaFileId ?? payload.manifest.media_fajl?.drive_file_id ?? null,
    passphrase: args.passphrase,
    storageNev: args.storageNev ?? null,
    figyelmeztetesek,
  })

  return {
    payload,
    jelszoNemNyitotta: opened.jelszoNemNyitotta,
    visszafuzottKepek,
    figyelmeztetesek,
  }
}

/**
 * A fényképek visszafűzése a `szemely` sorokba.
 *
 * FAIL-CLOSED minden ágon. Ha a mentés szerint VOLTAK fényképek, de nem tudjuk
 * őket előszedni, a visszaállítás NEM indulhat el — különben csendben
 * kitörölné a gyülekezet összes arcképét.
 */
async function mergeMedia(args: {
  payload: ParsedPayload
  mediaFileId: string | null
  passphrase: string
  storageNev?: string | null
  figyelmeztetesek: string[]
}): Promise<number> {
  const vartDarab = args.payload.manifest.media_fajl?.darab ?? 0
  const sorok = args.payload.rows?.[MEDIA_TABLA]
  if (vartDarab === 0) {
    // Nem volt egyetlen fénykép sem — nincs mit visszafűzni.
    return 0
  }
  if (!args.mediaFileId) {
    throw new Error(
      `A mentés ${vartDarab} fényképet említ, de nem tartozik hozzá fényképfájl. A visszaállítás így MINDEN arcképet törölne — ezért nem indítjuk el.`,
    )
  }
  if (!sorok) {
    throw new Error(
      'A mentésben van fényképfájl, de nincs benne „szemely" tábla. A fájl nem konzisztens — a visszaállítás nem indulhat el.',
    )
  }

  let ndjson: Buffer
  try {
    const opened = await openStoredBackup({
      fileId: args.mediaFileId,
      passphrase: args.passphrase,
      storageNev: args.storageNev ?? null,
    })
    ndjson = opened.ndjson
  } catch (error: unknown) {
    throw new Error(
      `A mentéshez tartozó fényképfájl nem olvasható (${hibaSzoveg(error, 'ismeretlen hiba')}). A visszaállítás így minden arcképet törölne — ezért nem indítjuk el.`,
    )
  }

  const kepek = new Map<string, string>()
  const sorokSzovege = ndjson.toString('utf8').split('\n')
  for (let i = 0; i < sorokSzovege.length; i += 1) {
    const sor = sorokSzovege[i]
    if (!sor || sor.length === 0) continue
    let bejegyzes: { id?: unknown; kep?: unknown }
    try {
      bejegyzes = JSON.parse(sor) as { id?: unknown; kep?: unknown }
    } catch {
      throw new Error(`A fényképfájl ${i + 1}. sora sérült — a visszaállítás nem indulhat el.`)
    }
    if (bejegyzes.id === undefined || typeof bejegyzes.kep !== 'string') {
      throw new Error(`A fényképfájl ${i + 1}. sora ismeretlen alakú.`)
    }
    kepek.set(String(bejegyzes.id), bejegyzes.kep)
  }

  if (kepek.size !== vartDarab) {
    throw new Error(
      `A fényképfájl hiányos: ${vartDarab} képet hirdet, ${kepek.size} olvasható belőle. A visszaállítás nem indulhat el.`,
    )
  }

  let visszafuzott = 0
  for (const sor of sorok) {
    const id = sor.id
    if (id === undefined || id === null) continue
    const kep = kepek.get(String(id))
    if (kep !== undefined) {
      sor[MEDIA_OSZLOP] = kep
      visszafuzott += 1
    }
  }

  if (visszafuzott !== kepek.size) {
    // Van fénykép olyan személyhez, aki nincs a mentésben — ez nem állítja meg
    // a folyamatot (a képhez tartozó sor úgysem jön vissza), de kimondjuk.
    args.figyelmeztetesek.push(
      `A fényképfájlban ${kepek.size - visszafuzott} olyan kép van, amihez nem tartozik személy a mentésben. Ezek a képek nem kerülnek vissza.`,
    )
  }

  return visszafuzott
}
