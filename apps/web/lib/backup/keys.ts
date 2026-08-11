/**
 * Kulcskezelés a biztonsági mentéshez (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * HÁROM KÜLÖN TITOK, SOHA NEM UGYANAZ
 * ════════════════════════════════════════════════════════════════════════════
 *   BACKUP_ENCRYPTION_KEY  — az ADAT titkosítása (ez a fájl kezeli)
 *   BACKUP_WORKER_SECRET   — KI INDÍTHAT mentést (a route kezeli)
 *   Drive refresh token    — a felhő-hozzáférés (a Drive-kliens kezeli, de a
 *                            titkosító kulcsot innen kapja)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ NULLA FALLBACK — ez nem szigor, hanem tanulság
 * ════════════════════════════════════════════════════════════════════════════
 * A `lib/supabase/secret-vault.ts:22` ma `VAULT_ENCRYPTION_KEY || GOD_MODE_PIN`
 * fallbackot enged — vagyis egy HAT JEGYŰ PIN-t fogad el titkosítási kulcsnak.
 * Egy hatjegyű PIN teljes kulcstere 10^6; egy laptop másodpercek alatt végigméri.
 * Ezt az anti-mintát TILOS átvenni. Hiányzó, rossz formátumú vagy 32 bájtnál
 * rövidebb kulcsnál a mentés HANGOS hibával leáll — inkább ne legyen mentés,
 * mint hogy legyen egy visszafejthető.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT scrypt ÉS NEM Argon2id
 * ════════════════════════════════════════════════════════════════════════════
 * Az Argon2id erősebb, de új függőség lenne. A scrypt benne van a `node:crypto`-ban,
 * és a különálló visszafejtő szkript (`kartoteka-mentes-megnyitas.mjs`) is
 * Node-ban fut — nincs böngészős visszafejtő, tehát a WebCrypto Argon2-hiánya
 * nem érv semmire. N = 2^17 mellett ez bőven elég egy 12+ karakteres jelmondathoz,
 * és nulla új támadási felületet hoz be.
 *
 * ⚠️ A KDF-paraméterek a FÁJLBAN vannak, nem itt. Egy későbbi paraméter-emelés
 *    így nem teszi olvashatatlanná a régi mentéseket.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Ez a fájl NULLA projekt-importot használ (csak `node:crypto`) — a
 * `scripts/selftest-backup.mjs` önmagában betölti és teszteli.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

import type {
  WrappedDekPassphrase,
  WrappedDekRecovery,
  WrappedDekServer,
  WrappedRecoveryPrivateKey,
  BackupEnvLabel,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Konstansok
// ─────────────────────────────────────────────────────────────────────────────

/** HKDF „info" címkék. Külön címke = külön kulcs UGYANABBÓL a mesterkulcsból. */
export const HKDF_INFO_DEK = 'kartoteka-backup-dek-v1'
export const HKDF_INFO_DRIVE_TOKEN = 'kartoteka-drive-token-v1'
/** A helyreállító kulcspár ECDH-jából származtatott burkoló kulcs címkéje. */
export const HKDF_INFO_RECOVERY = 'kartoteka-backup-recovery-v1'

export interface ScryptParams {
  N: number
  r: number
  p: number
}

/**
 * ÉLES scrypt-paraméterek. ~128 MiB memória, ~1 másodperc egy mai szerveren.
 * ⚠️ Ezt SOHA nem gyengítjük futásidőben; a selftest EXPLICIT, saját paramétert
 *    ad át, hogy gyorsan fusson — éles kód sosem ad át semmit.
 */
export const SCRYPT_PROD: ScryptParams = { N: 131072, r: 8, p: 1 }

/**
 * Felső korlát VISSZAFEJTÉSKOR. A paraméterek a fájlból jönnek; egy rosszindulatú
 * (vagy sérült) fejléc enélkül 100 GB memóriát kérethetne — szolgáltatás-megtagadás
 * egy „mentés megnyitása" gombbal.
 */
export const SCRYPT_MAX_N = 1048576 // 2^20

/** Ennyi bájt a mentési kulcs. AES-256 → pontosan 32. */
export const BACKUP_KEY_BYTES = 32

// ─────────────────────────────────────────────────────────────────────────────
// A mesterkulcs betöltése — FAIL CLOSED
// ─────────────────────────────────────────────────────────────────────────────

export interface BackupMasterKey {
  /** A fejlécbe kerülő kulcs-azonosító (jövőbeli rotációhoz). */
  keyId: string
  key: Buffer
}

let cachedKey: BackupMasterKey | null = null

/**
 * Beolvassa a `BACKUP_ENCRYPTION_KEY`-t. 64 hexa karakter VAGY 32 bájtnyi base64.
 *
 * @throws ha hiányzik, rossz formátumú, vagy nem pontosan 32 bájt. NINCS fallback.
 */
export function loadBackupKey(): BackupMasterKey {
  if (cachedKey) return cachedKey

  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim() || ''
  if (!raw) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY nincs beállítva. A mentés titkosítás nélkül NEM indul el. ' +
        'Előállítás: openssl rand -hex 32',
    )
  }

  let key: Buffer
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex')
  } else {
    key = Buffer.from(raw, 'base64')
  }

  if (key.length !== BACKUP_KEY_BYTES) {
    // ⚠️ A HOSSZÚSÁGOT SEM ÍRJUK KI a hibaüzenetben — a kulcs-anyagról semmilyen
    //    részlet nem szivároghat naplóba. Csak az elvárt formátum.
    throw new Error(
      'BACKUP_ENCRYPTION_KEY érvénytelen: pontosan 32 bájt kell (64 hexa karakter ' +
        'vagy base64). Előállítás: openssl rand -hex 32',
    )
  }

  const keyId = (process.env.BACKUP_KEY_ID?.trim() || 'k2026a').slice(0, 32)
  cachedKey = { keyId, key }
  return cachedKey
}

/** Csak teszthez / env-váltáshoz: eldobja a bemásolt kulcsot. */
export function resetBackupKeyCache(): void {
  cachedKey = null
}

/**
 * A környezet-címke. A fejlécbe kerül, és a VISSZAÁLLÍTÁS megtagadja az eltérőt —
 * egy tesztkörnyezetből származó fájl így nem kerülhet élesbe.
 */
export function loadEnvLabel(): BackupEnvLabel {
  const raw = (process.env.BACKUP_ENV_LABEL?.trim() || 'prod').toLowerCase()
  if (raw !== 'prod' && raw !== 'test') {
    throw new Error(`BACKUP_ENV_LABEL érvénytelen: „${raw}". Csak „prod" vagy „test" lehet.`)
  }
  return raw
}

// ─────────────────────────────────────────────────────────────────────────────
// DEK — fájlonként ÚJ 32 bájt
// ─────────────────────────────────────────────────────────────────────────────

/** Új adat-titkosító kulcs. FÁJLONKÉNT új — egy DEK sosem véd két fájlt. */
export function generateDek(): Buffer {
  return randomBytes(BACKUP_KEY_BYTES)
}

function hkdf32(masterKey: Buffer, salt: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey, salt, Buffer.from(info, 'utf8'), 32))
}

function gcmSeal(key: Buffer, plaintext: Buffer, aad: string): { iv: Buffer; tag: Buffer; ct: Buffer } {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return { iv, tag: cipher.getAuthTag(), ct }
}

function gcmOpen(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer, aad: string): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()])
}

// ── Szerver-burkolat: ezzel tud a NAPI, FELÜGYELET NÉLKÜLI futás dolgozni ────

/**
 * A DEK burkolása a szerver mesterkulcsával.
 *
 * Ez az az ág, ami miatt a napi mentés jelszó nélkül is működik: a felügyelet
 * nélküli cron nem tud jelszót kérni, és a bejelentkezési jelszó SEM használható
 * (a Supabase csak hasht tárol; ráadásul minden jelszócsere olvashatatlanná
 * tenné az összes korábbi mentést).
 */
export function wrapDekWithServerKey(
  dek: Buffer,
  fileId: string,
  masterKey?: Buffer,
): WrappedDekServer {
  const master = masterKey ?? loadBackupKey().key
  const salt = randomBytes(16)
  const kek = hkdf32(master, salt, HKDF_INFO_DEK)
  const { iv, tag, ct } = gcmSeal(kek, dek, `srv|${fileId}`)
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  }
}

export function unwrapDekWithServerKey(
  wrapped: WrappedDekServer,
  fileId: string,
  masterKey?: Buffer,
): Buffer {
  const master = masterKey ?? loadBackupKey().key
  const kek = hkdf32(master, Buffer.from(wrapped.salt, 'base64'), HKDF_INFO_DEK)
  try {
    return gcmOpen(
      kek,
      Buffer.from(wrapped.iv, 'base64'),
      Buffer.from(wrapped.tag, 'base64'),
      Buffer.from(wrapped.ct, 'base64'),
      `srv|${fileId}`,
    )
  } catch {
    throw new Error(
      'A mentés kulcsa nem oldható fel a szerver-kulccsal. Vagy a ' +
        'BACKUP_ENCRYPTION_KEY változott meg, vagy a fájl sérült. ' +
        'Ilyenkor a mentés MÉG megnyitható a mentési jelszóval.',
    )
  }
}

// ── Jelszó-burkolat: ez őrzi a LETÖLTÉST és a VISSZAÁLLÍTÁST ────────────────

function scryptKek(passphrase: string, salt: Buffer, params: ScryptParams): Buffer {
  if (!Number.isInteger(params.N) || params.N < 2 || params.N > SCRYPT_MAX_N) {
    throw new Error(`Érvénytelen scrypt N: ${String(params.N)}.`)
  }
  if (!Number.isInteger(params.r) || params.r < 1 || params.r > 32) {
    throw new Error(`Érvénytelen scrypt r: ${String(params.r)}.`)
  }
  if (!Number.isInteger(params.p) || params.p < 1 || params.p > 16) {
    throw new Error(`Érvénytelen scrypt p: ${String(params.p)}.`)
  }
  // A memória-plafont a paraméterekből SZÁMOLJUK (128·N·r), kétszeres tartalékkal.
  // Fix érték mellett egy jövőbeli paraméter-emelés némán elhasalna.
  const maxmem = Math.max(64 * 1024 * 1024, 128 * params.N * params.r * 2)
  return scryptSync(Buffer.from(passphrase.normalize('NFC'), 'utf8'), salt, 32, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem,
  })
}

/**
 * A DEK burkolása a MENTÉSI JELSZÓVAL.
 *
 * ⚠️ Ez NEM a bejelentkezési jelszó. Az alkalmazás azt soha nem is látja.
 *    Ez a jelszó teszi lehetővé, hogy a Drive-ra feltöltött fájlt a Kartotéka
 *    NÉLKÜL is meg lehessen nyitni — és ez az, ami a Google-t kizárja.
 */
export function wrapDekWithPassphrase(
  dek: Buffer,
  passphrase: string,
  fileId: string,
  params: ScryptParams = SCRYPT_PROD,
): WrappedDekPassphrase {
  const salt = randomBytes(16)
  const kek = scryptKek(passphrase, salt, params)
  const { iv, tag, ct } = gcmSeal(kek, dek, `pw|${fileId}`)
  return {
    kdf: 'scrypt',
    N: params.N,
    r: params.r,
    p: params.p,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  }
}

export function unwrapDekWithPassphrase(
  wrapped: WrappedDekPassphrase,
  passphrase: string,
  fileId: string,
): Buffer {
  if (wrapped.kdf !== 'scrypt') {
    throw new Error(`Ismeretlen kulcs-származtatás: ${String(wrapped.kdf)}.`)
  }
  const kek = scryptKek(passphrase, Buffer.from(wrapped.salt, 'base64'), {
    N: wrapped.N,
    r: wrapped.r,
    p: wrapped.p,
  })
  try {
    return gcmOpen(
      kek,
      Buffer.from(wrapped.iv, 'base64'),
      Buffer.from(wrapped.tag, 'base64'),
      Buffer.from(wrapped.ct, 'base64'),
      `pw|${fileId}`,
    )
  } catch {
    throw new Error('Hibás mentési jelszó — a fájl nem nyitható meg.')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELYREÁLLÍTÓ KULCSPÁR (X25519) — A KULCS-LETÉT
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ EZ A FÁJL LEGFONTOSABB RÉSZE, MERT EGY VÉGZETES HIÁNYT PÓTOL.
//
// Enélkül a napi (felügyelet nélküli) mentések KIZÁRÓLAG a szerver
// `BACKUP_ENCRYPTION_KEY`-ével nyílnak. Ha az a kulcs elveszik vagy lecserélik,
// a felhőben lévő ÖSSZES mentés véglegesen olvashatatlan — és erről csak egy
// visszaállítási kísérletnél derülne ki fény. A biztonsági mentés ilyenkor
// nem véd semmitől; csak úgy néz ki, mintha védene.
//
// A séma:
//   · a mentési jelszó beállításakor születik EGY X25519 kulcspár,
//   · a NYILVÁNOS fele a `backup_settings`-ben, nyíltan — ehhez pecsételni
//     titok nélkül lehet, tehát a cron is tudja használni,
//   · a TITKOS fele a mentési JELSZÓVAL burkolva (scrypt + AES-256-GCM), és a
//     szerver ezt a blobot SOHA nem nyitja ki — csak MÁSOLJA a fájl fejlécébe.
//
// Így a fájl ÖNMAGÁBAN, a Kartotéka és a szerver-kulcs NÉLKÜL is megnyitható,
// pusztán a mentési jelszóval (`scripts/kartoteka-mentes-megnyitas.mjs`).

/** X25519 SPKI DER előtag (12 bájt) — utána jön a 32 bájtos nyilvános kulcs. */
const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex')
/** X25519 PKCS8 DER előtag (16 bájt) — utána jön a 32 bájtos titkos kulcs. */
const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex')

export const X25519_KEY_BYTES = 32

function assertRaw32(raw: Buffer, mi: string): void {
  if (!Buffer.isBuffer(raw) || raw.length !== X25519_KEY_BYTES) {
    throw new Error(`A(z) ${mi} kulcsnak pontosan ${X25519_KEY_BYTES} bájtnak kell lennie.`)
  }
}

function x25519Public(raw: Buffer) {
  assertRaw32(raw, 'helyreállító nyilvános')
  return createPublicKey({
    key: Buffer.concat([X25519_SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  })
}

function x25519Private(raw: Buffer) {
  assertRaw32(raw, 'helyreállító titkos')
  return createPrivateKey({
    key: Buffer.concat([X25519_PKCS8_PREFIX, raw]),
    format: 'der',
    type: 'pkcs8',
  })
}

export interface RecoveryKeypair {
  /** 32 bájt nyers nyilvános kulcs. */
  publicRaw: Buffer
  /** 32 bájt nyers titkos kulcs. ⛔ NYERSEN SOHA nem tárolódik. */
  privateRaw: Buffer
}

/** Új helyreállító kulcspár. A mentési jelszó beállítása/cseréje hívja. */
export function generateRecoveryKeypair(): RecoveryKeypair {
  const { publicKey, privateKey } = generateKeyPairSync('x25519')
  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer
  return {
    publicRaw: Buffer.from(spki.subarray(spki.length - X25519_KEY_BYTES)),
    privateRaw: Buffer.from(pkcs8.subarray(pkcs8.length - X25519_KEY_BYTES)),
  }
}

/** A nyilvános kulcs rövid ujjlenyomata — CSAK azonosításra, nem titok. */
export function recoveryKeyFingerprint(publicRaw: Buffer): string {
  return createHash('sha256').update(publicRaw).digest('hex').slice(0, 16)
}

/**
 * A DEK pecsételése a helyreállító NYILVÁNOS kulcshoz.
 *
 * Efemer kulcspár + ECDH: a burkoló kulcs SEHOL nem tárolódik, és a szerver
 * a művelet után semmit nem tud, amivel visszafejthetné. A só az EFEMER és a
 * CÍMZETT nyilvános kulcs összefűzése — így két különböző fájl KEK-je akkor
 * sem esik egybe, ha a nyers ECDH-titok véletlenül ismétlődne.
 */
export function wrapDekWithRecoveryKey(
  dek: Buffer,
  fileId: string,
  recipientPublicRaw: Buffer,
): WrappedDekRecovery {
  const recipient = x25519Public(recipientPublicRaw)
  const eph = generateKeyPairSync('x25519')
  const ephSpki = eph.publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  const ephRaw = Buffer.from(ephSpki.subarray(ephSpki.length - X25519_KEY_BYTES))

  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: recipient })
  const kek = hkdf32(Buffer.from(shared), Buffer.concat([ephRaw, recipientPublicRaw]), HKDF_INFO_RECOVERY)
  const { iv, tag, ct } = gcmSeal(kek, dek, `rec|${fileId}`)

  return {
    alg: 'x25519',
    epk: ephRaw.toString('base64'),
    cimzett: recoveryKeyFingerprint(recipientPublicRaw),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  }
}

export function unwrapDekWithRecoveryKey(
  wrapped: WrappedDekRecovery,
  fileId: string,
  privateRaw: Buffer,
  publicRaw: Buffer,
): Buffer {
  if (wrapped.alg !== 'x25519') {
    throw new Error(`Ismeretlen helyreállító algoritmus: ${String(wrapped.alg)}.`)
  }
  const ephRaw = Buffer.from(wrapped.epk, 'base64')
  const shared = diffieHellman({
    privateKey: x25519Private(privateRaw),
    publicKey: x25519Public(ephRaw),
  })
  const kek = hkdf32(Buffer.from(shared), Buffer.concat([ephRaw, publicRaw]), HKDF_INFO_RECOVERY)
  try {
    return gcmOpen(
      kek,
      Buffer.from(wrapped.iv, 'base64'),
      Buffer.from(wrapped.tag, 'base64'),
      Buffer.from(wrapped.ct, 'base64'),
      `rec|${fileId}`,
    )
  } catch {
    throw new Error(
      'A mentés kulcsa nem oldható fel a helyreállító kulccsal — a fájl nem ehhez a ' +
        'kulcspárhoz készült, vagy sérült.',
    )
  }
}

/**
 * A helyreállító TITKOS kulcs burkolása a mentési jelszóval.
 * A visszatérő blob a `backup_settings`-be kerül, és onnan MÁSOLÓDIK MINDEN
 * mentés fejlécébe — a szerver közben soha nem nyitja ki.
 */
export function wrapRecoveryPrivateKey(
  pair: RecoveryKeypair,
  passphrase: string,
  params: ScryptParams = SCRYPT_PROD,
): WrappedRecoveryPrivateKey {
  const salt = randomBytes(16)
  const kek = scryptKek(passphrase, salt, params)
  const { iv, tag, ct } = gcmSeal(kek, pair.privateRaw, `reckey|${pair.publicRaw.toString('base64')}`)
  return {
    kdf: 'scrypt',
    N: params.N,
    r: params.r,
    p: params.p,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
    pub: pair.publicRaw.toString('base64'),
  }
}

export function unwrapRecoveryPrivateKey(
  wrapped: WrappedRecoveryPrivateKey,
  passphrase: string,
): RecoveryKeypair {
  if (wrapped.kdf !== 'scrypt') {
    throw new Error(`Ismeretlen kulcs-származtatás: ${String(wrapped.kdf)}.`)
  }
  const publicRaw = Buffer.from(wrapped.pub, 'base64')
  const kek = scryptKek(passphrase, Buffer.from(wrapped.salt, 'base64'), {
    N: wrapped.N,
    r: wrapped.r,
    p: wrapped.p,
  })
  try {
    const privateRaw = gcmOpen(
      kek,
      Buffer.from(wrapped.iv, 'base64'),
      Buffer.from(wrapped.tag, 'base64'),
      Buffer.from(wrapped.ct, 'base64'),
      `reckey|${wrapped.pub}`,
    )
    return { publicRaw, privateRaw }
  } catch {
    throw new Error('Hibás mentési jelszó — a helyreállító kulcs nem oldható fel.')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Jelszó-ellenőrző (verifier) — SZERVER-KULCSOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A `backup_settings.passphrase_verifier` értéke.
 *
 * MIÉRT HMAC A SCRYPT FÖLÖTT: ha valaki csak az ADATBÁZIST viszi el (SQL-injekció,
 * elveszett dump), a puszta scrypt-hash offline törhető lenne. A HMAC kulcsa a
 * `BACKUP_ENCRYPTION_KEY`, ami az env-ben lakik, nem a DB-ben — így egy önmagában
 * álló adatbázis-szivárgásból a jelszó NEM támadható.
 *
 * ⚠️ A verifier CSAK ellenőrzésre jó, a fájlok feloldására NEM: a DEK-et a
 *    jelszóból származtatott KEK oldja fel, nem ez.
 */
export function computePassphraseVerifier(
  passphrase: string,
  verifierSalt: Buffer,
  masterKey?: Buffer,
  params: ScryptParams = SCRYPT_PROD,
): Buffer {
  const master = masterKey ?? loadBackupKey().key
  const stretched = scryptKek(passphrase, verifierSalt, params)
  return createHmac('sha256', master).update(stretched).digest()
}

/** Időzítés-független összehasonlítás. Eltérő hossz → azonnal false, nem dobás. */
export function verifierEquals(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ─────────────────────────────────────────────────────────────────────────────
// Drive refresh token — a Drive-kliens ezt hívja
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Drive refresh token titkosító kulcsa. KÜLÖN HKDF-címke, tehát még ha
 * valahol kiszivárogna, az ADAT-kulcsot nem adja ki.
 *
 * ⚠️ A só ITT rögzített (üres), mert a token EGYETLEN rekord, és a kulcsot a
 *    visszafejtéshez só nélkül is elő kell tudnunk állítani. A frissesség az
 *    AES-GCM IV-jéből jön, nem a KDF-ből.
 */
export function deriveTokenKey(masterKey?: Buffer): Buffer {
  const master = masterKey ?? loadBackupKey().key
  return hkdf32(master, Buffer.alloc(0), HKDF_INFO_DRIVE_TOKEN)
}

/** A refresh token titkosított alakja EGYETLEN bájtsorban: iv ‖ tag ‖ ct. */
export function sealDriveRefreshToken(token: string, masterKey?: Buffer): Buffer {
  const key = deriveTokenKey(masterKey)
  const { iv, tag, ct } = gcmSeal(key, Buffer.from(token, 'utf8'), 'drive|1')
  return Buffer.concat([iv, tag, ct])
}

export function openDriveRefreshToken(sealed: Buffer, masterKey?: Buffer): string {
  if (sealed.length < 12 + 16) {
    throw new Error('A tárolt Drive-token sérült (túl rövid).')
  }
  const key = deriveTokenKey(masterKey)
  try {
    return gcmOpen(
      key,
      sealed.subarray(0, 12),
      sealed.subarray(12, 28),
      sealed.subarray(28),
      'drive|1',
    ).toString('utf8')
  } catch {
    throw new Error(
      'A Google Drive kapcsolat nem oldható fel. Valószínűleg a ' +
        'BACKUP_ENCRYPTION_KEY változott meg — kösd össze újra a Drive-ot.',
    )
  }
}
