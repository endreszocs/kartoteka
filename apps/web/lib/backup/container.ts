/**
 * KBK1 konténer — a titkosított mentés-fájl formátuma (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A FÁJL SZERKEZETE
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   "KBK1"                     4 bájt  magic
 *   <fejléc-hossz: u32 BE>     4 bájt
 *   <fejléc: UTF-8 JSON>       TITKOSÍTATLAN (a visszafejtéshez KELL)
 *   <keret><keret>…            AES-256-GCM darabok
 *
 *   keret = [u32 BE ct_hossz][ciphertext][16 bájt GCM tag]
 *
 * A fejléc SZÁNDÉKOSAN olvasható: enélkül a `kartoteka-mentes-megnyitas.mjs`
 * nem tudná, milyen KDF-fel kell a jelszóból kulcsot csinálni. Cserébe a
 * fejléc NEM tartalmaz semmilyen azonosítót (gyülekezetnév, sorszám, e-mail).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT ÍGY — a három védelem, ami nem díszítés
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1) NONCE = 4 bájt véletlen fájl-előtag ‖ 8 bájt BE keret-számláló.
 *    Egy DEK alatt (és a DEK FÁJLONKÉNT ÚJ) így garantáltan egyedi. A véletlen
 *    12 bájtos nonce ütközési esélye kicsi, de AES-GCM-nél a nonce-újrahasznosítás
 *    nem „gyengít", hanem MEGSEMMISÍTI a titkosítást — determinisztikus
 *    számlálóval ez kizárt.
 *
 * 2) AAD = `KBK1|<fájl-uuid>|<keret-index>|<0 vagy 1 = utolsó>`.
 *    Ez háromféle csendes rongálást tesz HANGOSSÁ:
 *      · keret átrendezése        → rossz index → auth-hiba,
 *      · keret átemelése MÁS fájlból → rossz uuid → auth-hiba,
 *      · a fájl CSONKOLÁSA        → az új utolsó keret 0-s AAD-vel készült,
 *                                    de 1-esre próbáljuk visszafejteni → auth-hiba.
 *    A harmadik a legfontosabb: egy félbeszakadt feltöltés így NEM tud
 *    „majdnem jó" mentésnek látszani.
 *
 * 3) MINDIG van legalább egy keret, üres hasznos tehernél is. Enélkül egy
 *    nulla bájtos test „érvényes, csak üres" fájlnak látszana.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * Ez a fájl NULLA projekt-importot használ (csak `node:crypto`), ezért a
 * `scripts/selftest-backup.mjs` önmagában le tudja fordítani és tesztelni.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

import type {
  KbkHeader,
  WrappedDekPassphrase,
  WrappedDekRecovery,
  WrappedDekServer,
  WrappedRecoveryPrivateKey,
  BackupEnvLabel,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Konstansok
// ─────────────────────────────────────────────────────────────────────────────

/** A fájl első négy bájtja. Ha nem ez, meg sem próbáljuk visszafejteni. */
export const KBK_MAGIC = 'KBK1'

/** Egy keretbe titkosított (gzip UTÁNI) bájtok száma. */
export const DEFAULT_CHUNK_PLAIN_BYTES = 4 * 1024 * 1024

/** AES-GCM: 16 bájt auth tag keretenként. */
export const GCM_TAG_BYTES = 16

/** A nonce véletlen, fájlonkénti előtagja. */
export const NONCE_PREFIX_BYTES = 4

/** AES-GCM nonce teljes hossza (előtag + 8 bájt keret-számláló). */
export const NONCE_BYTES = 12

/**
 * Épeszűségi plafon a fejlécre. Egy megrongált/idegen fájl 4 milliárdos
 * hossz-mezője enélkül azonnali OOM-ot okozna — inkább hangos hiba.
 */
export const MAX_HEADER_BYTES = 64 * 1024

// ─────────────────────────────────────────────────────────────────────────────
// Fejléc
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildHeaderInput {
  /** A fájl UUID-ja. Ez megy az AAD-be — hívó adja, hogy naplózható legyen. */
  id: string
  kulcsId: string
  dekSzerver: WrappedDekServer
  /** `null`, ha még nincs beállítva mentési jelszó. */
  dekJelszo: WrappedDekPassphrase | null
  /**
   * A DEK a helyreállító nyilvános kulcshoz pecsételve — ETTŐL nyitható a
   * FELÜGYELET NÉLKÜLI napi mentés is pusztán a mentési jelszóval.
   */
  dekHelyreallito?: WrappedDekRecovery | null
  /** A helyreállító titkos kulcs, jelszóval burkolva (a `backup_settings`-ből). */
  helyreallitoKulcs?: WrappedRecoveryPrivateKey | null
  /** Melyik tárolóba került a fájl (`google-drive` / `supabase-storage`). */
  tarolo?: string | null
  env: BackupEnvLabel
  chunkPlainBytes?: number
  /** Csak teszthez: rögzített nonce-előtag. Élesben MINDIG véletlen. */
  noncePrefix?: Buffer
  /** Csak teszthez: rögzített időbélyeg. */
  keszult?: string
}

/**
 * Összeállítja a fejlécet. A nonce-előtagot ITT sorsoljuk, hogy a hívó ne
 * felejthesse el — a kereteket már ez a fejléc vezérli.
 */
export function buildHeader(input: BuildHeaderInput): KbkHeader {
  const prefix = input.noncePrefix ?? randomBytes(NONCE_PREFIX_BYTES)
  if (prefix.length !== NONCE_PREFIX_BYTES) {
    throw new Error(`A nonce-előtagnak pontosan ${NONCE_PREFIX_BYTES} bájtnak kell lennie.`)
  }
  const chunk = input.chunkPlainBytes ?? DEFAULT_CHUNK_PLAIN_BYTES
  if (!Number.isInteger(chunk) || chunk < 1024 || chunk > 64 * 1024 * 1024) {
    throw new Error(`Érvénytelen keretméret: ${chunk}`)
  }
  return {
    v: 1,
    id: input.id,
    kulcs_id: input.kulcsId,
    cipher: 'AES-256-GCM',
    nonce_prefix: prefix.toString('base64'),
    chunk_plain_bytes: chunk,
    dek_szerver: input.dekSzerver,
    dek_jelszo: input.dekJelszo,
    // ÚJ, OPCIONÁLIS MEZŐK (2026-08-11). A `v` szándékosan MARAD 1: a régi
    // olvasók ezeket egyszerűen figyelmen kívül hagyják, az új fájlok pedig a
    // régi kulcs-utakon (szerver-kulcs, jelszó) továbbra is nyithatók. Egy
    // verzió-emelés itt a RÉGI fájlokat tenné megnyithatatlanná — pont azt a
    // kárt okozná, amit ez a mező elhárítani hivatott.
    dek_helyreallito: input.dekHelyreallito ?? null,
    helyreallito_kulcs: input.helyreallitoKulcs ?? null,
    tarolo: input.tarolo ?? null,
    env: input.env,
    keszult: input.keszult ?? new Date().toISOString(),
  }
}

/**
 * Kiolvassa a fejlécet a fájl elejéről.
 *
 * Fail-closed: ismeretlen magic, hiányzó mező vagy más `v` esetén DOB. Egy
 * „majdnem értelmes" fejléccel folytatni annyi lenne, mint tippelni, hogy a
 * mentés visszaállítható-e.
 */
export function parseHeader(bytes: Buffer): { header: KbkHeader; bodyOffset: number } {
  if (bytes.length < 8) {
    throw new Error('CSONKA FÁJL: ennyi bájtban még a fejléc-hossz sem fér el.')
  }
  const magic = bytes.subarray(0, 4).toString('latin1')
  if (magic !== KBK_MAGIC) {
    throw new Error(
      `Ez nem KARTOTÉKA mentés-fájl (a magic „${magic}", várt „${KBK_MAGIC}").`,
    )
  }
  const headerLen = bytes.readUInt32BE(4)
  if (headerLen === 0 || headerLen > MAX_HEADER_BYTES) {
    throw new Error(`Érvénytelen fejléc-hossz: ${headerLen} bájt.`)
  }
  if (bytes.length < 8 + headerLen) {
    throw new Error('CSONKA FÁJL: a fejléc nem fér el a fájlban.')
  }

  let header: KbkHeader
  try {
    header = JSON.parse(bytes.subarray(8, 8 + headerLen).toString('utf8')) as KbkHeader
  } catch {
    throw new Error('A fejléc nem érvényes JSON — a fájl sérült.')
  }

  if (header.v !== 1) {
    throw new Error(`Ismeretlen konténer-verzió: ${String(header.v)}.`)
  }
  if (header.cipher !== 'AES-256-GCM') {
    throw new Error(`Ismeretlen rejtjelező: ${String(header.cipher)}.`)
  }
  if (!header.id || !header.nonce_prefix || !header.dek_szerver) {
    throw new Error('Hiányos fejléc (id / nonce_prefix / dek_szerver).')
  }
  if (
    !Number.isInteger(header.chunk_plain_bytes) ||
    header.chunk_plain_bytes < 1024 ||
    header.chunk_plain_bytes > 64 * 1024 * 1024
  ) {
    throw new Error(`Érvénytelen keretméret a fejlécben: ${String(header.chunk_plain_bytes)}.`)
  }

  return { header, bodyOffset: 8 + headerLen }
}

// ─────────────────────────────────────────────────────────────────────────────
// Keretek
// ─────────────────────────────────────────────────────────────────────────────

/** `KBK1|<uuid>|<index>|<0/1>` — lásd a fájl fejlécében a 2. pontot. */
function frameAad(fileId: string, index: number, isLast: boolean): Buffer {
  return Buffer.from(`${KBK_MAGIC}|${fileId}|${index}|${isLast ? 1 : 0}`, 'utf8')
}

/** nonce = 4 bájt fájl-előtag ‖ 8 bájt BE keret-index. */
function frameNonce(prefix: Buffer, index: number): Buffer {
  const nonce = Buffer.alloc(NONCE_BYTES)
  prefix.copy(nonce, 0, 0, NONCE_PREFIX_BYTES)
  nonce.writeBigUInt64BE(BigInt(index), NONCE_PREFIX_BYTES)
  return nonce
}

function assertDek(dek: Buffer): void {
  if (!Buffer.isBuffer(dek) || dek.length !== 32) {
    throw new Error('A DEK-nek pontosan 32 bájtnak kell lennie (AES-256).')
  }
}

/**
 * A hasznos tehert AES-256-GCM keretekre bontja.
 *
 * @returns a keretek tömbje, sorrendben. A hívó fűzi őket a fejléc mögé.
 */
export function encryptToChunks(plaintext: Buffer, dek: Buffer, header: KbkHeader): Buffer[] {
  assertDek(dek)
  const prefix = Buffer.from(header.nonce_prefix, 'base64')
  if (prefix.length !== NONCE_PREFIX_BYTES) {
    throw new Error('A fejléc nonce-előtagja hibás hosszúságú.')
  }

  const chunkSize = header.chunk_plain_bytes
  // MINDIG legalább egy keret — üres tartalomnál is. Enélkül egy nulla bájtos
  // test „érvényes, csak üres" fájlnak látszana, és a csonkolás-őr elveszne.
  const chunkCount = Math.max(1, Math.ceil(plaintext.length / chunkSize))

  const frames: Buffer[] = []
  for (let i = 0; i < chunkCount; i++) {
    const slice = plaintext.subarray(i * chunkSize, Math.min((i + 1) * chunkSize, plaintext.length))
    const isLast = i === chunkCount - 1
    const cipher = createCipheriv('aes-256-gcm', dek, frameNonce(prefix, i))
    cipher.setAAD(frameAad(header.id, i, isLast))
    const ct = Buffer.concat([cipher.update(slice), cipher.final()])
    const tag = cipher.getAuthTag()

    const len = Buffer.alloc(4)
    len.writeUInt32BE(ct.length, 0)
    frames.push(Buffer.concat([len, ct, tag]))
  }
  return frames
}

/**
 * A keretekből visszaállítja a hasznos tehert.
 *
 * ⚠️ Az „utolsó keret" jelzőt NEM a fájl mondja meg, hanem a POZÍCIÓ: az a
 *    keret az utolsó, ami után nincs több bájt. Ezért egy levágott fájl utolsó
 *    kerete `isLast = true` AAD-vel próbálna visszafejtődni, miközben 0-val
 *    készült → GCM auth-hiba. A csonkolás így NEM maradhat észrevétlen.
 */
export function decryptChunks(body: Buffer, dek: Buffer, header: KbkHeader): Buffer {
  assertDek(dek)
  const prefix = Buffer.from(header.nonce_prefix, 'base64')
  if (prefix.length !== NONCE_PREFIX_BYTES) {
    throw new Error('A fejléc nonce-előtagja hibás hosszúságú.')
  }
  if (body.length === 0) {
    throw new Error('CSONKA FÁJL: a konténer egyetlen keretet sem tartalmaz.')
  }

  const parts: Buffer[] = []
  let offset = 0
  let index = 0

  while (offset < body.length) {
    if (offset + 4 > body.length) {
      throw new Error(`CSONKA FÁJL: a(z) ${index}. keret hossz-mezője hiányos.`)
    }
    const ctLen = body.readUInt32BE(offset)
    const frameEnd = offset + 4 + ctLen + GCM_TAG_BYTES
    if (ctLen > header.chunk_plain_bytes || frameEnd > body.length) {
      throw new Error(
        `CSONKA FÁJL: a(z) ${index}. keret nem fér el a fájlban ` +
          `(igényelt ${ctLen} bájt, maradék ${body.length - offset - 4}).`,
      )
    }
    const ct = body.subarray(offset + 4, offset + 4 + ctLen)
    const tag = body.subarray(offset + 4 + ctLen, frameEnd)
    const isLast = frameEnd === body.length

    const decipher = createDecipheriv('aes-256-gcm', dek, frameNonce(prefix, index))
    decipher.setAAD(frameAad(header.id, index, isLast))
    decipher.setAuthTag(tag)
    let plain: Buffer
    try {
      plain = Buffer.concat([decipher.update(ct), decipher.final()])
    } catch {
      throw new Error(
        `A(z) ${index}. keret hitelesítése SIKERTELEN. A fájl sérült, ` +
          'levágott, átrendezett, vagy nem ehhez a kulcshoz tartozik.',
      )
    }
    parts.push(plain)

    offset = frameEnd
    index++
  }

  return Buffer.concat(parts)
}

// ─────────────────────────────────────────────────────────────────────────────
// Teljes konténer
// ─────────────────────────────────────────────────────────────────────────────

export interface PackedContainer {
  bytes: Buffer
  header: KbkHeader
  /** A TELJES rejtjelezett folyam SHA-256-ja (hex) — ez megy a backup_log-ba. */
  sha256: string
}

/** Fejléc + keretek egyetlen pufferbe, a fájl SHA-256-jával együtt. */
export function packContainer(plaintext: Buffer, dek: Buffer, header: KbkHeader): PackedContainer {
  const headerJson = Buffer.from(JSON.stringify(header), 'utf8')
  if (headerJson.length > MAX_HEADER_BYTES) {
    throw new Error(`A fejléc túl nagy (${headerJson.length} bájt).`)
  }
  const magic = Buffer.from(KBK_MAGIC, 'latin1')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(headerJson.length, 0)

  const bytes = Buffer.concat([
    magic,
    len,
    headerJson,
    ...encryptToChunks(plaintext, dek, header),
  ])
  return { bytes, header, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/** A `packContainer` ellentéte: fejléc kiolvasása + a keretek visszafejtése. */
export function unpackContainer(
  bytes: Buffer,
  dek: Buffer,
): { header: KbkHeader; plaintext: Buffer } {
  const { header, bodyOffset } = parseHeader(bytes)
  return { header, plaintext: decryptChunks(bytes.subarray(bodyOffset), dek, header) }
}

/** Kényelmi segéd: bájtok SHA-256-ja hexben. Egy helyen, hogy ne térjen szét. */
export function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}
