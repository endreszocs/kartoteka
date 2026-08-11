import 'server-only'

/**
 * A MENTÉS CSŐVEZETÉKE — olvasás → titkosítás → feltöltés → IGAZOLÁS (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A LÉPÉSSOR
 * ════════════════════════════════════════════════════════════════════════════
 *   1. VÁRHATÓ SORSZÁM   táblánként (`backup_count_table` RPC)
 *   2. DUMP              lapozva, determinisztikus sorrendben (`backup_dump_table`)
 *   3. MÉDIA             a `szemely.kep` külön fájlba (és ha nem változott, nem is töltjük fel)
 *   4. HASZNOS TEHER     manifest + sorok + záró sor, táblánkénti SHA-256-tal
 *   5. GZIP → TITKOSÍTÁS AES-256-GCM, fájlonként új DEK
 *   6. FELTÖLTÉS
 *   7. IGAZOLÁS          ⟵ EZ A LÉNYEG: visszaolvasás, sha256, és
 *                          `várható == kiírt == visszaolvasott` TÁBLÁNKÉNT
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT A 7. LÉPÉS A LÉNYEG
 * ════════════════════════════════════════════════════════════════════════════
 * A PostgREST 1000 sor fölött NÉMÁN csonkol. A lapozás ezt csökkenti, de a
 * lapozás is elromolhat — ahogy ebben a projektben már 15 kézzel írt ciklusnál
 * elromlott. Az UTÓLAGOS ÖSSZESZÁMOLÁS viszont akkor is fog, ha minden más
 * elromlott: ha a fájlban kevesebb sor van, mint amennyit az adatbázis mond,
 * a mentés HIBÁRA fut, a Drive-fájl TÖRLŐDIK, és nem marad utána egy „ok"
 * státuszú sor, ami hazudik.
 *
 * ⚠️ Egy mentés, amit sosem olvastak vissza, nem mentés, hanem remény.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ ISMERT KORLÁT — MENTÉSI JELSZÓ ÉS A NAPI FUTÁS
 * ════════════════════════════════════════════════════════════════════════════
 * A rendszer a mentési jelszóból CSAK ellenőrző hasht tárol (`backup_settings`),
 * a nyers jelszót SOHA. Ezért a FELÜGYELET NÉLKÜLI napi futás nem tudja a DEK-et
 * a jelszóval is beburkolni — ilyenkor a fejléc `dek_jelszo` mezője `null`, és
 * a fájl KIZÁRÓLAG a szerver `BACKUP_ENCRYPTION_KEY`-ével nyitható meg.
 * A jelszavas burkolat ott keletkezik, ahol a felhasználó BEGÉPELTE a jelszót
 * (kézi mentés, visszaállítás előtti mentés) — ezt az `opts.passphrase` hordozza.
 *
 * A motor ezt NEM nyeli el: minden ilyen futás figyelmeztetést ad vissza, ami a
 * `backup_log.figyelmeztetesek`-be kerül és a felületen is látszik. A végleges
 * megoldás egy jelszóval védett HELYREÁLLÍTÓ KULCSPÁR lenne (a nyilvános fele a
 * szerveren, a titkos fele jelszóval burkolva) — az a fejlécbe új mezőként fér
 * be, a régi fájlok olvashatóságának megtörése nélkül.
 */

import { randomUUID } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  buildHeader,
  decryptChunks,
  packContainer,
  parseHeader,
  unpackContainer,
} from './container'
import { orderTablesForDump, excludedTableNames } from './inventory'
import {
  generateDek,
  loadBackupKey,
  loadEnvLabel,
  unwrapDekWithPassphrase,
  unwrapDekWithRecoveryKey,
  unwrapDekWithServerKey,
  unwrapRecoveryPrivateKey,
  wrapDekWithPassphrase,
  wrapDekWithRecoveryKey,
  wrapDekWithServerKey,
} from './keys'
import { resolveBackupStorageByName } from './storage'
import {
  buildMediaPayload,
  buildPayload,
  gunzipPayload,
  gzipPayload,
  parsePayload,
  splitMediaColumn,
  verifyRowCounts,
  verifyTableHashes,
} from './payload'
import type {
  BackupKind,
  BackupLiveTableRow,
  BackupScope,
  BackupScopeResult,
  BackupStorage,
  BackupOmissions,
  KbkHeader,
  WrappedRecoveryPrivateKey,
} from './types'

/**
 * A HELYREÁLLÍTÓ KULCS-LETÉT anyaga, ahogy a worker átadja.
 *
 * A motor csak PECSÉTEL a nyilvános kulccsal, és VÁLTOZATLANUL bemásolja a
 * burkolt titkos kulcsot a fejlécbe. A mentési jelszót SOHA nem ismeri meg —
 * mégis olyan fájl keletkezik, amit a jelszó önmagában kinyit.
 */
export interface RecoveryEscrow {
  publicRaw: Buffer
  wrappedPrivate: WrappedRecoveryPrivateKey
}

// ─────────────────────────────────────────────────────────────────────────────
// Konstansok
// ─────────────────────────────────────────────────────────────────────────────

/** A `backup_dump_table` lapmérete. A PostgREST 1000-es plafonja alatt. */
export const DUMP_PAGE_SIZE = 500

/** Efölött a mentés HANGOS hibával leáll — nem próbál fél-implementált darabolást. */
export const DEFAULT_MAX_FILE_MB = 50

/**
 * Amit a mentés NEM tartalmaz. A manifestbe kerül, hogy a fájl önmagát magyarázza.
 *
 * ⚠️ A Storage-vödrök (iktatói szkennek, arcképek) v1-ben SZÁNDÉKOSAN kimaradnak —
 *    de HANGOSAN: a felület, a manifest és a README egyaránt kimondja.
 */
export const KIMARADT_STORAGE_BUCKETEK = [
  'iktato-csatolmanyok',
  'avatars',
  'cimerek',
  'public-site-media',
]

export const KIMARADT_SEMA = ['RLS-policy-k', 'RPC-k', 'triggerek', 'indexek', 'nezetek']

// ─────────────────────────────────────────────────────────────────────────────
// Olvasás az adatbázisból
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A fájlméret-plafon bájtban.
 *
 * A sorrend SZÁMÍT: a hívó explicit értéke nyer, utána az env, végül az alap.
 * A `0` és a szemét env-érték nem eshet át némán az alapértékre — ha valaki
 * `BACKUP_MAX_FILE_MB=abc`-t ír, arról nem a mentés bukásából kell értesülnie.
 */
function resolveMaxFileBytes(explicitMb?: number): number {
  if (typeof explicitMb === 'number' && Number.isFinite(explicitMb) && explicitMb > 0) {
    return explicitMb * 1024 * 1024
  }
  const raw = process.env.BACKUP_MAX_FILE_MB?.trim()
  if (raw) {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`BACKUP_MAX_FILE_MB érvénytelen: „${raw}". Pozitív szám kell (MB-ban).`)
    }
    return parsed * 1024 * 1024
  }
  return DEFAULT_MAX_FILE_MB * 1024 * 1024
}

/** Biztonságos hibaszöveg: üzenet + kód, SEMMI sorérték, SEMMI nyers objektum. */
function safeDbError(prefix: string, error: { message: string; code?: string } | null): Error {
  return new Error(`${prefix}: ${error?.message || 'ismeretlen hiba'}${error?.code ? ` [${error.code}]` : ''}`)
}

/** A tábla VÁRHATÓ sorszáma — a hármas egyeztetés első lába. */
export async function countTable(
  admin: SupabaseClient,
  congregationId: string | null,
  tabla: string,
): Promise<number> {
  const { data, error } = await admin.rpc('backup_count_table', {
    p_congregation_id: congregationId,
    p_tabla: tabla,
  })
  if (error) throw safeDbError(`A(z) ${tabla} tábla sorainak megszámolása sikertelen`, error)
  const n = Number(data)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`A(z) ${tabla} tábla sorszáma értelmezhetetlen.`)
  }
  return n
}

/**
 * Egy tábla TELJES tartalma, KULCS-ALAPÚ (keyset) lapozással.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ MIÉRT NEM `OFFSET` (2026-08-11 javítás)
 * ════════════════════════════════════════════════════════════════════════════
 * Minden lap KÜLÖN RPC-hívás, tehát KÜLÖN pillanatkép. `OFFSET`-tel elég, ha
 * két lap között törlődik egy sor, ami az aktuális eltolás ELŐTT rendeződik:
 * onnantól minden későbbi sor eggyel „lecsúszik", és PONTOSAN EGY SOR SOHA nem
 * kerül a mentésbe. A hármas egyeztetés ezt NEM fogja meg, ha ugyanabban az
 * ablakban egy beszúrás is történik (pl. duplikált személy javítása: egyet
 * törlünk, egyet felviszünk) — a darabszámok egyeznek, egy sor mégis eltűnt.
 *
 * A kulcs-alapú lapozás erre immunis: nem POZÍCIÓRA hivatkozunk, hanem az
 * UTOLSÓ LÁTOTT ELSŐDLEGES KULCSRA (`WHERE (pk…) > (utolsó…)`). Ha közben
 * törölnek egy korábbi sort, a maradék sorrendje és a folytatási pont
 * változatlan marad.
 *
 * A helper (`selectAllPaged`) itt azért nem használható, mert RPC-t hívunk
 * (`SETOF jsonb`), nincs oszlop, amire a PostgREST rendezhetne. A HÁROM szabálya
 * viszont betűre érvényes, és be is van tartva:
 *   1. determinisztikus rendezés — az RPC `ORDER BY <elsődleges kulcs>`,
 *   2. CSAK AZ ÜRES LAP a biztos stop (a rövid lap nem a halmaz vége),
 *   3. a folytatási pont a TÉNYLEGESEN kapott utolsó sorból jön.
 * És mindenek fölött: a végeredményt a 7. lépés ÚJRASZÁMOLJA.
 */
export async function dumpTable(
  admin: SupabaseClient,
  congregationId: string | null,
  tabla: string,
  varhato: number,
): Promise<Array<Record<string, unknown>>> {
  const sorok: Array<Record<string, unknown>> = []
  // Biztonsági szelep a végtelen ciklus ellen: a várható sorszámból számolt
  // lapszám + bőséges tartalék. Ha ezt túllépjük, valami elromlott — HANGOSAN.
  const maxLapok = Math.ceil(Math.max(varhato, 1) / DUMP_PAGE_SIZE) + 200

  // Az utolsó látott elsődleges-kulcs érték(ek), a szerver által visszaadott
  // alakban. `null` = az elejéről indulunk.
  let utolsoKulcs: unknown = null

  for (let lap = 0; ; lap++) {
    if (lap > maxLapok) {
      throw new Error(
        `A(z) ${tabla} tábla lapozása nem ér véget (${lap} lap, ${sorok.length} sor, ` +
          `várható ${varhato}). Megálltunk, mielőtt a memória fogyna el.`,
      )
    }
    const { data, error } = await admin.rpc('backup_dump_table', {
      p_congregation_id: congregationId,
      p_tabla: tabla,
      p_limit: DUMP_PAGE_SIZE,
      p_after: utolsoKulcs,
    })
    if (error) throw safeDbError(`A(z) ${tabla} tábla olvasása sikertelen`, error)

    const page = (data ?? []) as Array<{ kulcs?: unknown; sor?: Record<string, unknown> }>
    if (page.length === 0) break

    for (const bejegyzes of page) {
      if (!bejegyzes || typeof bejegyzes !== 'object' || !bejegyzes.sor) {
        throw new Error(
          `A(z) ${tabla} tábla lapozása ismeretlen alakú sort adott vissza. ` +
            'A backup_dump_table RPC régebbi változata fut — futtasd le újra a ' +
            'migration-docs/sql/2026-08-11-biztonsagi-mentes.sql fájlt.',
        )
      }
      sorok.push(bejegyzes.sor)
    }

    const utolso = page[page.length - 1]
    if (utolso.kulcs === undefined || utolso.kulcs === null) {
      throw new Error(
        `A(z) ${tabla} tábla lapozásához nem kaptunk folytatási kulcsot. ` +
          'Kulcs nélkül a következő lap ismételne vagy kihagyna sorokat — megállunk.',
      )
    }
    utolsoKulcs = utolso.kulcs
  }

  return sorok
}

// ─────────────────────────────────────────────────────────────────────────────
// A csővezeték
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportScopeOptions {
  admin: SupabaseClient
  scope: BackupScope
  /** `null` a `globalis` hatókörnél. */
  congregationId: string | null
  congregationNev: string | null
  kind: BackupKind
  /** Europe/Bucharest helyi dátum (YYYY-MM-DD). */
  runDate: string
  /** A már ELLENŐRZÖTT (besorolt) leltár — a hívó `assertInventoryClassified`-del kapta. */
  inventory: BackupLiveTableRow[]
  semaUjjlenyomat: string
  storage: BackupStorage
  /**
   * CSAK interaktív futásnál. Ha meg van adva, a fájl a mentési jelszóval IS
   * megnyitható lesz (a Kartotéka nélkül). Napi futásnál `undefined` — lásd a
   * fájl fejlécében az ISMERT KORLÁT szakaszt.
   */
  passphrase?: string | null
  /**
   * A helyreállító kulcs-letét. Ha megvan, a fájl a MENTÉSI JELSZÓVAL is
   * megnyitható lesz — akkor is, ha felügyelet nélküli cron készítette.
   */
  recovery?: RecoveryEscrow | null
  /** Az előző napi média-fájl, hogy változatlan tartalomnál újrahivatkozhassunk. */
  elozoMedia?: { sha256: string; fileId: string; bytes: number } | null
  maxFileMb?: number
  /**
   * A frissen feltöltött MÉDIA-fájl visszaolvasása is. Alap: true. Kikapcsolva
   * gyorsabb és kevesebb memóriát eszik, de a média-fájl igazolatlan marad —
   * ezt a hívó a figyelmeztetések közt kapja vissza.
   */
  verifyMedia?: boolean
}

/**
 * Egyetlen hatókör (egy gyülekezet VAGY a globális réteg) mentése.
 *
 * ⚠️ Ez a függvény SEMMIT nem ír a `backup_log`-ba. A napló EGYETLEN írója a
 *    `worker.ts` — a claim, a lezárás és a hiba-lezárás is ott van egy helyen.
 *    Két íróval a hibaágon mindig marad egy lezáratlan „fut" sor.
 */
export async function exportScope(opts: ExportScopeOptions): Promise<BackupScopeResult> {
  const startedAt = Date.now()
  const figyelmeztetesek: string[] = []

  const eredmeny: BackupScopeResult = {
    scope: opts.scope,
    congregationId: opts.congregationId,
    congregationNev: opts.congregationNev,
    kind: opts.kind,
    runDate: opts.runDate,
    ok: false,
    kihagyva: false,
    backupLogId: null,
    stage: null,
    hiba: null,
    rowCounts: {},
    totalRows: 0,
    ciphertextBytes: 0,
    sha256: null,
    fileId: null,
    fileName: null,
    mediaFileId: null,
    mediaSha256: null,
    mediaBytes: 0,
    figyelmeztetesek,
    durationMs: 0,
  }

  // ── 0) Kulcs — FAIL CLOSED. Nincs kulcs → nincs mentés, nincs fél-megoldás.
  const { keyId, key: masterKey } = loadBackupKey()
  const env = loadEnvLabel()
  const maxBytes = resolveMaxFileBytes(opts.maxFileMb)

  const tablak = orderTablesForDump(opts.inventory, opts.scope)
  if (tablak.length === 0) {
    throw new Error(
      `A(z) „${opts.scope}" hatókörhöz EGYETLEN tábla sincs besorolva. ` +
        'Ez nem üres mentés, hanem konfigurációs hiba — nem készítünk üres fájlt.',
    )
  }

  // ── 1) VÁRHATÓ sorszámok ────────────────────────────────────────────────
  eredmeny.stage = 'szamlalas'
  const varhato: Record<string, number> = {}
  for (const t of tablak) {
    varhato[t.tabla] = await countTable(opts.admin, opts.congregationId, t.tabla)
  }

  // ── 2) DUMP + 3) MÉDIA leválasztás ──────────────────────────────────────
  eredmeny.stage = 'dump'
  const tablaAdatok: Array<{ tabla: string; sorok: Array<Record<string, unknown>> }> = []
  let mediaEntries: ReturnType<typeof splitMediaColumn>['media'] = []

  for (const t of tablak) {
    let sorok = await dumpTable(opts.admin, opts.congregationId, t.tabla, varhato[t.tabla])

    // A base64 fényképek KÜLÖN fájlba — enélkül a napi mentés 60-180 MB-tal hízna.
    if (t.tabla === 'szemely' && (t.oszlopok ?? []).includes('kep')) {
      const split = splitMediaColumn(sorok, 'id', 'kep')
      sorok = split.sorok
      mediaEntries = split.media
    }

    tablaAdatok.push({ tabla: t.tabla, sorok })
  }

  // ── 3/b) MÉDIA-FÁJL: feltöltés VAGY újrahivatkozás ──────────────────────
  eredmeny.stage = 'feltoltes'
  const media = buildMediaPayload(mediaEntries)
  let mediaFileId: string | null = null
  let mediaSha256: string | null = null
  let mediaBytes = 0

  // ⚠️ A HIVATKOZÁS-ÁTÖRÖKÍTÉS CSAK AKKOR SZABAD, HA A FÁJL TÉNYLEG OTT VAN.
  //    Enélkül egy hónapokkal ezelőtt feltöltött (és azóta kézzel törölt vagy
  //    tévesen lenyesett) média-fájl azonosítója öröklődne minden új mentésbe:
  //    mindegyik „igazolt" lenne, a hiány pedig csak egy visszaállításnál
  //    derülne ki — akkor, amikor már baj van. Az igazolási blokk (7. lépés)
  //    CSAK a fő fájlt olvassa vissza, ezt a rést tehát itt kell bezárni.
  if (media.darab > 0) {
    let orokolheto = false
    if (opts.elozoMedia && opts.elozoMedia.sha256 === media.sha256) {
      try {
        const meta = await opts.storage.statFile(opts.elozoMedia.fileId)
        if (!meta) {
          figyelmeztetesek.push(
            'Az előző fényképfájl MÁR NINCS a tárolóban — újra feltöltöttük. ' +
              'A korábbi mentések, amelyek erre a fájlra hivatkoztak, fényképek nélkül állíthatók vissza.',
          )
        } else if (opts.elozoMedia.bytes > 0 && meta.bytes > 0 && meta.bytes !== opts.elozoMedia.bytes) {
          figyelmeztetesek.push(
            `Az előző fényképfájl mérete eltér a naplózottól (${meta.bytes} ≠ ${opts.elozoMedia.bytes} bájt) — ` +
              'nem hivatkozunk rá, hanem újra feltöltöttük.',
          )
        } else {
          orokolheto = true
        }
      } catch (e: unknown) {
        // A létezés-ellenőrzés hibája NEM jogosít az öröklésre: fail-closed,
        // inkább feltöltjük újra (helyet foglal), mint hogy hazudjunk.
        figyelmeztetesek.push(
          'Az előző fényképfájl létezését nem tudtuk ellenőrizni ' +
            `(${e instanceof Error ? e.message : 'ismeretlen hiba'}) — biztonságból újra feltöltöttük.`,
        )
      }
    }

    if (orokolheto && opts.elozoMedia) {
      // Tartalom-azonosság ÉS bizonyított létezés → NEM töltünk fel újra. Ez az
      // egyetlen inkrementális elem a rendszerben, és pont ez menti meg a
      // Drive 15 GB-ját.
      mediaFileId = opts.elozoMedia.fileId
      mediaSha256 = opts.elozoMedia.sha256
      mediaBytes = opts.elozoMedia.bytes
    } else {
      const mediaUuid = randomUUID()
      const mediaDek = generateDek()
      const mediaHeader = buildHeader({
        id: mediaUuid,
        kulcsId: keyId,
        dekSzerver: wrapDekWithServerKey(mediaDek, mediaUuid, masterKey),
        dekJelszo: opts.passphrase
          ? wrapDekWithPassphrase(mediaDek, opts.passphrase, mediaUuid)
          : null,
        dekHelyreallito: opts.recovery
          ? wrapDekWithRecoveryKey(mediaDek, mediaUuid, opts.recovery.publicRaw)
          : null,
        helyreallitoKulcs: opts.recovery?.wrappedPrivate ?? null,
        tarolo: opts.storage.nev,
        env,
      })
      const mediaPacked = packContainer(gzipPayload(media.ndjson), mediaDek, mediaHeader)
      const mediaFileName = `km-${mediaUuid}.kbk`

      if (mediaPacked.bytes.length > maxBytes) {
        throw new Error(
          `A média-fájl ${(mediaPacked.bytes.length / 1048576).toFixed(1)} MB, a korlát ` +
            `${(maxBytes / 1048576).toFixed(0)} MB. Emeld a BACKUP_MAX_FILE_MB értékét, ` +
            'vagy csökkentsd a tárolt fényképek méretét.',
        )
      }

      const uploaded = await opts.storage.uploadFile({
        fileName: mediaFileName,
        bytes: mediaPacked.bytes,
        mimeType: 'application/octet-stream',
      })
      mediaFileId = uploaded.fileId
      mediaSha256 = media.sha256
      mediaBytes = mediaPacked.bytes.length

      if (opts.verifyMedia === false) {
        figyelmeztetesek.push(
          'A média-fájl (fényképek) visszaolvasása KI VAN KAPCSOLVA — a fájl nem igazolt.',
        )
      } else {
        const vissza = await opts.storage.downloadFile(uploaded.fileId)
        const { plaintext } = unpackContainer(vissza, unwrapDekWithServerKey(mediaHeader.dek_szerver, mediaUuid, masterKey))
        const visszaMedia = gunzipPayload(plaintext)
        const visszaSorok = visszaMedia.toString('utf8').split('\n').filter((l) => l !== '').length
        if (visszaSorok !== media.darab) {
          await opts.storage.deleteFilePermanently(uploaded.fileId)
          throw new Error(
            `A média-fájl IGAZOLÁSA megbukott: ${media.darab} fényképet írtunk, ` +
              `${visszaSorok} olvasható vissza. A hibás fájlt töröltük.`,
          )
        }
      }
    }
  }

  // ── 4) HASZNOS TEHER ────────────────────────────────────────────────────
  eredmeny.stage = 'titkositas'
  const kimaradt: BackupOmissions = {
    storage_bucketek: KIMARADT_STORAGE_BUCKETEK,
    auth_users: true,
    sema: KIMARADT_SEMA,
    tablak: excludedTableNames(opts.inventory),
  }

  const payload = buildPayload({
    hatokor: opts.scope,
    congregationId: opts.congregationId,
    congregationNev: opts.congregationNev,
    kind: opts.kind,
    runDate: opts.runDate,
    env,
    semaUjjlenyomat: opts.semaUjjlenyomat,
    kimaradt,
    mediaFajl:
      media.darab > 0
        ? { drive_file_id: mediaFileId, sha256: mediaSha256, darab: media.darab }
        : null,
    tablak: tablaAdatok,
  })

  eredmeny.rowCounts = payload.rowCounts
  eredmeny.totalRows = payload.totalRows

  // ── 5) GZIP + TITKOSÍTÁS ────────────────────────────────────────────────
  const fileUuid = randomUUID()
  const dek = generateDek()
  const header = buildHeader({
    id: fileUuid,
    kulcsId: keyId,
    dekSzerver: wrapDekWithServerKey(dek, fileUuid, masterKey),
    dekJelszo: opts.passphrase ? wrapDekWithPassphrase(dek, opts.passphrase, fileUuid) : null,
    // A KULCS-LETÉT: ettől lesz a felügyelet nélküli napi mentés is a MENTÉSI
    // JELSZÓVAL nyitható, a Kartotéka és a szerver-kulcs nélkül.
    dekHelyreallito: opts.recovery
      ? wrapDekWithRecoveryKey(dek, fileUuid, opts.recovery.publicRaw)
      : null,
    helyreallitoKulcs: opts.recovery?.wrappedPrivate ?? null,
    tarolo: opts.storage.nev,
    env,
  })
  if (!header.dek_jelszo && !header.dek_helyreallito) {
    figyelmeztetesek.push(
      'Ez a fájl CSAK a szerver kulcsával (BACKUP_ENCRYPTION_KEY) nyitható meg. ' +
        'Állíts be MENTÉSI JELSZÓT (Admin → Biztonsági mentés) — attól kezdve minden új ' +
        'mentés a jelszóval is nyithatóvá válik, a szerver nélkül is.',
    )
  }

  const packed = packContainer(gzipPayload(payload.ndjson), dek, header)
  const fileName = `kb-${fileUuid}.kbk`

  if (packed.bytes.length > maxBytes) {
    throw new Error(
      `A mentés-fájl ${(packed.bytes.length / 1048576).toFixed(1)} MB, a korlát ` +
        `${(maxBytes / 1048576).toFixed(0)} MB. Emeld a BACKUP_MAX_FILE_MB értékét.`,
    )
  }

  // ── 6) FELTÖLTÉS ────────────────────────────────────────────────────────
  eredmeny.stage = 'feltoltes'
  await opts.storage.ensureFolder()
  const uploaded = await opts.storage.uploadFile({
    fileName,
    bytes: packed.bytes,
    mimeType: 'application/octet-stream',
  })
  eredmeny.fileId = uploaded.fileId
  eredmeny.fileName = fileName
  eredmeny.ciphertextBytes = packed.bytes.length
  eredmeny.sha256 = packed.sha256

  // ── 7) IGAZOLÁS — a mentés ETTŐL lesz mentés ────────────────────────────
  eredmeny.stage = 'igazolas'
  const verificationError = async (uzenet: string): Promise<never> => {
    // Egy IGAZOLATLAN fájl rosszabb, mint a hiányzó: megbízhatónak látszik.
    try {
      await opts.storage.deleteFilePermanently(uploaded.fileId)
    } catch {
      figyelmeztetesek.push(
        'A megbukott mentés-fájl törlése SEM sikerült — ellenőrizd kézzel a tárolóban.',
      )
    }
    throw new Error(uzenet)
  }

  const letoltott = await opts.storage.downloadFile(uploaded.fileId)
  if (letoltott.length !== packed.bytes.length) {
    await verificationError(
      `A visszaolvasott fájl mérete eltér: ${packed.bytes.length} bájtot töltöttünk fel, ` +
        `${letoltott.length} olvasható vissza. A hibás fájlt töröltük.`,
    )
  }
  if (!letoltott.equals(packed.bytes)) {
    await verificationError(
      'A visszaolvasott fájl NEM azonos a feltöltöttel (SHA-256 eltérés). A hibás fájlt töröltük.',
    )
  }

  let visszaolvasott: ReturnType<typeof parsePayload>
  try {
    const { plaintext } = unpackContainer(
      letoltott,
      unwrapDekWithServerKey(header.dek_szerver, fileUuid, masterKey),
    )
    visszaolvasott = parsePayload(gunzipPayload(plaintext))
  } catch (e: unknown) {
    await verificationError(
      `A visszaolvasott fájl nem fejthető vissza: ${e instanceof Error ? e.message : 'ismeretlen'}. ` +
        'A hibás fájlt töröltük.',
    )
    throw e // elérhetetlen — csak a típusellenőrzőnek
  }

  // A HÁRMAS EGYEZTETÉS.
  const szamok = verifyRowCounts(varhato, payload.rowCounts, visszaolvasott.rowCounts)
  if (!szamok.ok) {
    await verificationError(
      `SORSZÁM-ELTÉRÉS a mentésben — ${szamok.elteresek.slice(0, 10).join('; ')}` +
        (szamok.elteresek.length > 10 ? ` (+${szamok.elteresek.length - 10} további)` : '') +
        '. A hibás fájlt töröltük.',
    )
  }

  const hashek = verifyTableHashes(payload.manifest, visszaolvasott.tableHashes)
  if (!hashek.ok) {
    await verificationError(
      `TARTALOM-ELTÉRÉS a mentésben — ${hashek.elteresek.slice(0, 10).join('; ')}. ` +
        'A hibás fájlt töröltük.',
    )
  }

  if (visszaolvasott.sha256Nyers !== payload.footer.sha256_nyers) {
    await verificationError(
      'A visszaolvasott hasznos teher ellenőrző-összege eltér a záró sorban rögzítettől. ' +
        'A hibás fájlt töröltük.',
    )
  }
  if (visszaolvasott.totalRows !== payload.totalRows) {
    await verificationError(
      `A visszaolvasott összes sor (${visszaolvasott.totalRows}) eltér a kiírttól ` +
        `(${payload.totalRows}). A hibás fájlt töröltük.`,
    )
  }

  eredmeny.mediaFileId = mediaFileId
  eredmeny.mediaSha256 = mediaSha256
  eredmeny.mediaBytes = mediaBytes
  eredmeny.stage = null
  eredmeny.ok = true
  eredmeny.durationMs = Date.now() - startedAt
  return eredmeny
}

// ─────────────────────────────────────────────────────────────────────────────
// OLVASÁS — a visszaállítás és a letöltés ezt hívja
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenedBackup {
  header: KbkHeader
  /** A visszafejtett, MÉG GZIP-ELT hasznos teher (nyers konténer-tartalom). */
  gzipped: Buffer
  /** Ugyanaz kicsomagolva — ezt eszi a `parsePayload()`. */
  ndjson: Buffer
  /**
   * `true`, ha a fájlt NEM a mentési jelszó nyitotta, hanem a szerver-kulcs.
   * Két oka lehet, és MINDKETTŐT ki kell mondania a felületnek:
   *   · a fájl a jelszó beállítása / cseréje ELŐTT készült,
   *   · vagy felügyelet nélküli napi futás volt (nincs `dek_jelszo` a fejlécben).
   * Némán soha nem esünk vissza gyengébb kapura.
   */
  jelszoNemNyitotta: boolean
}

/**
 * Egy TÁROLÓBELI mentés-fájl letöltése és visszafejtése.
 *
 * ⚠️ A PÁRHUZAMOSAN DOLGOZÓ VISSZAÁLLÍTÓ ÜGYNÖKNEK: a `lib/restore/backup-port.ts`
 *    `readBackupArchive()` függvénye EZT hívja — a `container.ts` és a `keys.ts`
 *    alacsonyabb szintű függvényeit nem kell közvetlenül összefűzni. A visszaadott
 *    `ndjson` közvetlenül átadható a `payload.ts` `parsePayload(ndjson, {collectRows:true})`
 *    hívásának.
 */
export async function openStoredBackup(args: {
  fileId: string
  passphrase?: string | null
  storage?: BackupStorage
  /**
   * MELYIK tárolóban van a fájl (`backup_log.storage_nev`). A `fileId` jelentése
   * tárolónként MÁS — enélkül egy Drive-fájlt a Supabase Storage-ban keresnénk,
   * és a „nincs ilyen fájl" válaszból nem derülne ki, hogy rossz helyen néztük.
   */
  storageNev?: string | null
  /** Ha a hívónak már megvannak a bájtok, nem töltjük le újra. */
  bytes?: Buffer
}): Promise<OpenedBackup> {
  const bytes =
    args.bytes ??
    (await (args.storage ?? (await resolveBackupStorageByName(args.storageNev))).downloadFile(
      args.fileId,
    ))
  const { header, bodyOffset } = parseHeader(bytes)
  const body = bytes.subarray(bodyOffset)

  let dek: Buffer | null = null
  let jelszoNemNyitotta = true

  // 1) ELŐSZÖR a jelszó KÖZVETLEN burkolata (interaktív mentéseknél van ilyen).
  if (args.passphrase && header.dek_jelszo) {
    try {
      dek = unwrapDekWithPassphrase(header.dek_jelszo, args.passphrase, header.id)
      jelszoNemNyitotta = false
    } catch {
      dek = null
    }
  }

  // 2) HELYREÁLLÍTÓ KULCS-LETÉT — a napi, felügyelet nélküli mentések útja.
  //    A burkolt titkos kulcs MAGÁBAN A FÁJLBAN van, tehát ehhez sem szerver,
  //    sem adatbázis nem kell: jelszó → titkos kulcs → ECDH → DEK.
  if (!dek && args.passphrase && header.dek_helyreallito && header.helyreallito_kulcs) {
    try {
      const par = unwrapRecoveryPrivateKey(header.helyreallito_kulcs, args.passphrase)
      dek = unwrapDekWithRecoveryKey(header.dek_helyreallito, header.id, par.privateRaw, par.publicRaw)
      jelszoNemNyitotta = false
    } catch {
      dek = null
    }
  }

  // 3) Végső soron a szerver-kulcs. Ez SOHA nem néma visszaesés: a hívó a
  //    `jelszoNemNyitotta` mezőből tudja, hogy gyengébb kapun jutottunk be, és
  //    a felület ezt ki is mondja.
  if (!dek) {
    dek = unwrapDekWithServerKey(header.dek_szerver, header.id, loadBackupKey().key)
  }

  const gzipped = decryptChunks(body, dek, header)
  return { header, gzipped, ndjson: gunzipPayload(gzipped), jelszoNemNyitotta }
}
