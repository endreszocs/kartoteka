#!/usr/bin/env node
/**
 * BIZTONSÁGI MENTÉS önellenőrzés — build/tesztkeret nélkül futtatható
 * (a selftest-reszszamadas.mjs mintájára).
 *
 * A node_modules-beli `typescript`-tel CommonJS-re transpile-olja NÉGY forrást
 * egy temp könyvtárba, és assertekkel ellenőrzi:
 *
 *   apps/web/lib/backup/container.ts   (KBK1 konténer — titkosítás, keretek)
 *   apps/web/lib/backup/keys.ts        (kulcs-betöltés, burkolás, verifier)
 *   apps/web/lib/backup/payload.ts     (manifest, NDJSON, bizonyíték)
 *   apps/web/lib/backup/inventory.ts   (besorolás, függőségi sorrend)
 *
 * Mindegyik NULLA futásidejű projekt-importtal készül (csak `node:` beépítettek
 * és `import type`), ezért önállóan fordíthatók, bundler nélkül.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A LEGFONTOSABB ÁLLÍTÁSOK
 * ════════════════════════════════════════════════════════════════════════════
 *   E1  A TELJES csővezeték körbe megy: sorok → manifest → gzip → titkosítás →
 *       „feltöltés" → „letöltés" → visszafejtés → kicsomagolás → sorszám- és
 *       tartalom-egyeztetés. EZ bizonyítja, hogy a mentés VISSZAÁLLÍTHATÓ.
 *   E2  Ha a lekérdezés NÉMÁN csonkol (a PostgREST 1000 soros plafonja), a
 *       hármas egyeztetés ELKAPJA. Ez a projekt visszatérő hibaosztálya.
 *   A3  Egy CSONKA fájl visszafejtése HIBÁRA fut — nem ad „majdnem jó" adatot.
 *   B7  A kulcs-betöltésnek NINCS fallbackja: sem GOD_MODE_PIN, sem
 *       VAULT_ENCRYPTION_KEY nem ugorhat be helyette.
 *
 * Futtatás:  node scripts/selftest-backup.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const BACKUP_DIR = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'backup')

const SOURCES = {
  container: path.join(BACKUP_DIR, 'container.ts'),
  keys: path.join(BACKUP_DIR, 'keys.ts'),
  payload: path.join(BACKUP_DIR, 'payload.ts'),
  inventory: path.join(BACKUP_DIR, 'inventory.ts'),
  // 2026-08-11: kötegelés/folytatás + a beszédes hibaüzenet tiszta magja.
  batch: path.join(BACKUP_DIR, 'batch.ts'),
  steps: path.join(BACKUP_DIR, 'steps.ts'),
  // 2026-08-11: a KÖZÖS, Europe/Bucharest-re szögezett idő-formázó. Azért van
  // itt, mert a mentés-felület KÉT oldalról (szerver + böngésző) használja, és
  // pontosan a két külön másolat okozta, hogy ugyanarról az eseményről két
  // különböző idő jelent meg egymás alatt.
  idopont: path.join(REPO_ROOT, 'apps', 'web', 'lib', 'utils', 'idopont-bukarest.ts'),
  // 2026-08-11: a figyelmeztető sáv DÖNTÉSE. Azért van külön, tiszta fájlban,
  // mert ez az a logika, ami 2026-08-11-én egy 784/784-es napon piros vészt
  // írt ki egy olyan tegnapra, amikor a mentés-rendszer még nem is létezett.
  // Ha egy szabály tesztelhetetlen, előbb-utóbb hazudni fog.
  kora: path.join(REPO_ROOT, 'apps', 'web', 'lib', 'backup', 'mentes-kora.ts'),
}

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

/** Egy dobásra váró hívás: `true`, ha DOBOTT (és a szöveg tartalmazza a mintát). */
const dob = (fn, minta) => {
  try {
    fn()
    return false
  } catch (e) {
    const msg = String(e?.message || e)
    return minta ? msg.toLowerCase().includes(minta.toLowerCase()) : true
  }
}

for (const [nev, f] of Object.entries(SOURCES)) {
  if (!fs.existsSync(f)) {
    fail(`hiányzik a forrás (${nev}): ${f}`)
    process.exit(1)
  }
}

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-backup-selftest-'))

/**
 * TS → CJS, majd betöltés.
 *
 * Fail-closed: ha valaha PROJEKT-import kerülne a fájlba, a `require()`
 * ismeretlen modulra futna — inkább ITT bukjon el, érthető üzenettel. A
 * `node:` beépítettek megengedettek (a kripto ezek nélkül nem is működne).
 */
function loadTs(srcFile, outName) {
  const code = fs.readFileSync(srcFile, 'utf8')
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
    },
    fileName: outName + '.ts',
  })
  const idegen = [...out.outputText.matchAll(/require\(["']([^"']+)["']\)/g)]
    .map((m) => m[1])
    .filter((m) => !m.startsWith('node:') && !m.startsWith('.'))
  if (idegen.length > 0) {
    throw new Error(
      `${outName}: FUTÁSIDEJŰ PROJEKT-IMPORT került a fájlba (${idegen.join(', ')}) — ` +
        'az önellenőrzés csak beépített modulokat használó forrást tud önállóan fordítani. ' +
        'Ha új függőség kell, a tiszta magot külön fájlba kell emelni.',
    )
  }
  const dest = path.join(tmp, outName + '.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return require_(dest)
}

let container, keys, payload, inventory, batch, steps, idopont, kora
try {
  container = loadTs(SOURCES.container, 'container')
  keys = loadTs(SOURCES.keys, 'keys')
  payload = loadTs(SOURCES.payload, 'payload')
  inventory = loadTs(SOURCES.inventory, 'inventory')
  batch = loadTs(SOURCES.batch, 'batch')
  steps = loadTs(SOURCES.steps, 'steps')
  idopont = loadTs(SOURCES.idopont, 'idopont')
  kora = loadTs(SOURCES.kora, 'kora')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const {
  buildHeader,
  parseHeader,
  encryptToChunks,
  decryptChunks,
  packContainer,
  unpackContainer,
  KBK_MAGIC,
} = container

const {
  loadBackupKey,
  resetBackupKeyCache,
  loadEnvLabel,
  generateDek,
  wrapDekWithServerKey,
  unwrapDekWithServerKey,
  wrapDekWithPassphrase,
  unwrapDekWithPassphrase,
  generateRecoveryKeypair,
  wrapDekWithRecoveryKey,
  unwrapDekWithRecoveryKey,
  wrapRecoveryPrivateKey,
  unwrapRecoveryPrivateKey,
  recoveryKeyFingerprint,
  computePassphraseVerifier,
  verifierEquals,
  sealDriveRefreshToken,
  openDriveRefreshToken,
} = keys

const {
  buildPayload,
  parsePayload,
  verifyRowCounts,
  verifyTableHashes,
  splitMediaColumn,
  buildMediaPayload,
  gzipPayload,
  gunzipPayload,
  bucharestRunDate,
} = payload

const {
  classifyInventory,
  assertInventoryClassified,
  computeSchemaFingerprint,
  orderTablesForDump,
  excludedTableNames,
} = inventory

// ── Segédek ─────────────────────────────────────────────────────────────────

const MASTER = Buffer.alloc(32, 7)
const FAST_SCRYPT = { N: 1024, r: 8, p: 1 } // csak TESZTHEZ — éles: 2^17
const UUID_A = '11111111-2222-3333-4444-555555555555'
const UUID_B = '99999999-8888-7777-6666-555555555555'

function testHeader(overrides = {}) {
  const dekSzerver = wrapDekWithServerKey(Buffer.alloc(32, 1), UUID_A, MASTER)
  return buildHeader({
    id: UUID_A,
    kulcsId: 'k-teszt',
    dekSzerver,
    dekJelszo: null,
    env: 'test',
    chunkPlainBytes: 1024,
    noncePrefix: Buffer.from([1, 2, 3, 4]),
    keszult: '2026-08-11T02:00:00.000Z',
    ...overrides,
  })
}

const KIMARADT = {
  storage_bucketek: ['iktato-csatolmanyok'],
  auth_users: true,
  sema: ['RLS-policy-k'],
  tablak: ['system_settings'],
}

function mintaSzemely(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    congregation_id: 'c-1',
    csaladnev: `Kovács${i}`,
    k_nev: 'János',
    cnp: `19000010000${String(i).padStart(2, '0')}`,
    kep: i % 3 === 0 ? `data:image/jpeg;base64,${'A'.repeat(64)}` : null,
  }))
}

// ═════════════════════════════════════════════════════════════════════════════
// A. KONTÉNER — titkosítás, keretek, rongálás-felismerés
// ═════════════════════════════════════════════════════════════════════════════

{
  const dek = Buffer.alloc(32, 42)
  const adat = Buffer.from('Barátos gyülekezet — próba tartalom. ÁÉÍÓŐÚŰ', 'utf8')
  const header = testHeader()

  // A1 — oda-vissza
  {
    const packed = packContainer(adat, dek, header)
    const vissza = unpackContainer(packed.bytes, dek)
    if (vissza.plaintext.equals(adat) && vissza.header.id === UUID_A) {
      ok('A1 konténer oda-vissza: a visszafejtett tartalom BÁJTRA azonos')
    } else {
      fail('A1: a visszafejtett tartalom eltér az eredetitől')
    }
    if (packed.bytes.subarray(0, 4).toString('latin1') === KBK_MAGIC) {
      ok('A1b a fájl a KBK1 magic-kel kezdődik')
    } else {
      fail('A1b: hiányzik a KBK1 magic')
    }
    if (/^[0-9a-f]{64}$/.test(packed.sha256)) {
      ok('A1c a csomag SHA-256-ot ad vissza (ez megy a backup_log-ba)')
    } else {
      fail('A1c: hiányzó vagy hibás SHA-256')
    }
  }

  // A2 — TÖBB keret
  {
    const nagy = Buffer.alloc(4096, 0x41) // 4 keret 1024-es kereteknél
    const frames = encryptToChunks(nagy, dek, header)
    if (frames.length === 4) ok('A2 a 4096 bájt PONTOSAN 4 keretre bomlik (1024-es keret)')
    else fail(`A2: ${frames.length} keret keletkezett 4 helyett`)

    const packed = packContainer(nagy, dek, header)
    if (unpackContainer(packed.bytes, dek).plaintext.equals(nagy)) {
      ok('A2b a többkeretes fájl hiánytalanul összeáll')
    } else {
      fail('A2b: a többkeretes fájl visszafejtése hibás tartalmat adott')
    }
  }

  // A3 — CSONKOLÁS (az utolsó keret levágása)
  {
    const nagy = Buffer.alloc(4096, 0x42)
    const packed = packContainer(nagy, dek, header)
    const keretMeret = 4 + 1024 + 16
    const csonka = packed.bytes.subarray(0, packed.bytes.length - keretMeret)
    if (dob(() => unpackContainer(csonka, dek), 'csonka') ||
        dob(() => unpackContainer(csonka, dek), 'hitelesítése')) {
      ok('A3 ⭐ a LEVÁGOTT fájl visszafejtése HIBÁRA fut (nem ad „majdnem jó" adatot)')
    } else {
      fail('A3: a csonka fájl VISSZAFEJTHETŐ volt — ez néma adatvesztés')
    }
  }

  // A4 — csonkolás keret KÖZEPÉN
  {
    const packed = packContainer(Buffer.alloc(2048, 0x43), dek, header)
    const csonka = packed.bytes.subarray(0, packed.bytes.length - 7)
    if (dob(() => unpackContainer(csonka, dek))) {
      ok('A4 a keret közepén levágott fájl HIBÁRA fut')
    } else {
      fail('A4: a keret közepén levágott fájl visszafejthető volt')
    }
  }

  // A5 — egyetlen bit átfordítása
  {
    const packed = packContainer(Buffer.alloc(2048, 0x44), dek, header)
    const rongalt = Buffer.from(packed.bytes)
    const { bodyOffset } = parseHeader(rongalt)
    rongalt[bodyOffset + 10] ^= 0x01
    if (dob(() => unpackContainer(rongalt, dek), 'hitelesítése')) {
      ok('A5 egyetlen átfordított bit is HIBÁT ad (GCM auth tag)')
    } else {
      fail('A5: a megrongált fájl visszafejthető volt')
    }
  }

  // A6 — keretek ÁTRENDEZÉSE (azonos méretűek, tehát bájtra cserélhetők)
  {
    const packed = packContainer(Buffer.alloc(4096, 0x45), dek, header)
    const { bodyOffset } = parseHeader(packed.bytes)
    const keretMeret = 4 + 1024 + 16
    const kevert = Buffer.from(packed.bytes)
    const k0 = packed.bytes.subarray(bodyOffset, bodyOffset + keretMeret)
    const k1 = packed.bytes.subarray(bodyOffset + keretMeret, bodyOffset + 2 * keretMeret)
    k1.copy(kevert, bodyOffset)
    k0.copy(kevert, bodyOffset + keretMeret)
    if (dob(() => unpackContainer(kevert, dek), 'hitelesítése')) {
      ok('A6 a keretek ÁTRENDEZÉSE HIBÁT ad (a keret-index az AAD-ben van)')
    } else {
      fail('A6: az átrendezett keretek visszafejthetők voltak')
    }
  }

  // A7 — rossz DEK
  {
    const packed = packContainer(Buffer.from('titok'), dek, header)
    if (dob(() => unpackContainer(packed.bytes, Buffer.alloc(32, 99)), 'hitelesítése')) {
      ok('A7 rossz kulccsal a fájl nem nyílik')
    } else {
      fail('A7: a fájl ROSSZ kulccsal is megnyílt')
    }
  }

  // A8 — más fájl azonosítója (AAD) → a keret nem hordozható át
  {
    const packed = packContainer(Buffer.from('titok'), dek, header)
    const masikHeader = testHeader({ id: UUID_B })
    const { bodyOffset } = parseHeader(packed.bytes)
    if (dob(() => decryptChunks(packed.bytes.subarray(bodyOffset), dek, masikHeader), 'hitelesítése')) {
      ok('A8 a keret NEM emelhető át másik fájlba (a fájl-uuid az AAD-ben van)')
    } else {
      fail('A8: a keret átemelhető volt egy másik fájl fejlécével')
    }
  }

  // A9 — idegen fájl
  {
    if (dob(() => unpackContainer(Buffer.from('PKvalami zip'), dek), 'nem kartotéka')) {
      ok('A9 idegen fájlra HANGOS hiba (nem próbáljuk visszafejteni)')
    } else {
      fail('A9: idegen fájlra nem a magic-hiba jött')
    }
  }

  // A10 — ÜRES tartalom is legalább EGY keretet kap
  {
    const frames = encryptToChunks(Buffer.alloc(0), dek, header)
    const packed = packContainer(Buffer.alloc(0), dek, header)
    const vissza = unpackContainer(packed.bytes, dek)
    if (frames.length === 1 && vissza.plaintext.length === 0) {
      ok('A10 üres tartalom is EGY keretet kap (a nulla bájtos test nem „érvényes")')
    } else {
      fail(`A10: ${frames.length} keret üres tartalomra`)
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// B. KULCSOK
// ═════════════════════════════════════════════════════════════════════════════

{
  const dek = generateDek()
  if (dek.length === 32) ok('B0 a DEK 32 bájt (AES-256)')
  else fail(`B0: a DEK ${dek.length} bájt`)

  // B1/B2/B3 — szerver-burkolat
  {
    const w = wrapDekWithServerKey(dek, UUID_A, MASTER)
    if (unwrapDekWithServerKey(w, UUID_A, MASTER).equals(dek)) {
      ok('B1 szerver-burkolat oda-vissza')
    } else {
      fail('B1: a szerver-burkolat nem adta vissza a DEK-et')
    }
    if (dob(() => unwrapDekWithServerKey(w, UUID_A, Buffer.alloc(32, 8)))) {
      ok('B2 MÁS mesterkulccsal nem oldható fel')
    } else {
      fail('B2: más mesterkulccsal is feloldható volt')
    }
    if (dob(() => unwrapDekWithServerKey(w, UUID_B, MASTER))) {
      ok('B3 MÁS fájl-azonosítóval nem oldható fel (AAD-kötés)')
    } else {
      fail('B3: a burkolat átvihető volt másik fájlra')
    }
  }

  // B4/B5 — jelszó-burkolat
  {
    const jelszo = 'harang-szeker-kolomp-arnyek'
    const w = wrapDekWithPassphrase(dek, jelszo, UUID_A, FAST_SCRYPT)
    if (w.kdf === 'scrypt' && w.N === FAST_SCRYPT.N) {
      ok('B4a a KDF-paraméterek a FÁJLBAN vannak (későbbi emelés nem töri a régi mentést)')
    } else {
      fail('B4a: a KDF-paraméterek nem kerültek a burkolatba')
    }
    if (unwrapDekWithPassphrase(w, jelszo, UUID_A).equals(dek)) {
      ok('B4b jelszó-burkolat oda-vissza (a Kartotéka NÉLKÜLI megnyitás alapja)')
    } else {
      fail('B4b: a jelszó-burkolat nem adta vissza a DEK-et')
    }
    if (dob(() => unwrapDekWithPassphrase(w, 'harang-szeker-kolomp-arnyeK', UUID_A), 'hibás mentési jelszó')) {
      ok('B5 EGY karakter eltérés a jelszóban → nem nyílik')
    } else {
      fail('B5: rossz jelszóval is megnyílt')
    }
  }

  // B6 — verifier
  {
    const salt = Buffer.alloc(16, 3)
    const v1 = computePassphraseVerifier('jelszo-egy-ketto', salt, MASTER, FAST_SCRYPT)
    const v2 = computePassphraseVerifier('jelszo-egy-ketto', salt, MASTER, FAST_SCRYPT)
    const v3 = computePassphraseVerifier('jelszo-egy-harom', salt, MASTER, FAST_SCRYPT)
    const v4 = computePassphraseVerifier('jelszo-egy-ketto', salt, Buffer.alloc(32, 9), FAST_SCRYPT)
    if (verifierEquals(v1, v2) && !verifierEquals(v1, v3)) {
      ok('B6a a verifier ugyanarra a jelszóra azonos, másra eltérő')
    } else {
      fail('B6a: a verifier nem determinisztikus, vagy nem különböztet meg')
    }
    if (!verifierEquals(v1, v4)) {
      ok('B6b ⭐ a verifier SZERVER-KULCSOS: egy puszta DB-szivárgás nem törhető offline')
    } else {
      fail('B6b: a verifier független a szerver-kulcstól — offline törhető lenne')
    }
  }

  // B7 — ⭐ FAIL CLOSED: NINCS fallback
  {
    const mentett = {
      key: process.env.BACKUP_ENCRYPTION_KEY,
      keyId: process.env.BACKUP_KEY_ID,
      god: process.env.GOD_MODE_PIN,
      vault: process.env.VAULT_ENCRYPTION_KEY,
      env: process.env.BACKUP_ENV_LABEL,
    }
    try {
      // (a) hiányzó kulcs — DE ott a két csábító fallback
      delete process.env.BACKUP_ENCRYPTION_KEY
      process.env.GOD_MODE_PIN = '123456'
      process.env.VAULT_ENCRYPTION_KEY = 'valami-regi-titok'
      resetBackupKeyCache()
      if (dob(() => loadBackupKey(), 'BACKUP_ENCRYPTION_KEY')) {
        ok('B7a ⭐ kulcs nélkül HANGOS hiba — sem GOD_MODE_PIN, sem VAULT_ENCRYPTION_KEY nem ugrik be')
      } else {
        fail('B7a: a kulcs-betöltés fallbackre esett — EZ AZ ANTI-MINTA, amit tiltunk')
      }

      // (b) túl rövid kulcs
      process.env.BACKUP_ENCRYPTION_KEY = 'abcdef'
      resetBackupKeyCache()
      if (dob(() => loadBackupKey(), 'érvénytelen')) {
        ok('B7b rövid kulcsra HANGOS hiba')
      } else {
        fail('B7b: rövid kulcsot elfogadott')
      }

      // (c) a hibaüzenet NEM szivárogtat a kulcsról (még a hosszát sem)
      process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(40)
      resetBackupKeyCache()
      let uzenet = ''
      try {
        loadBackupKey()
      } catch (e) {
        uzenet = String(e.message)
      }
      if (!uzenet.includes('40') && !uzenet.includes('aaaa')) {
        ok('B7c a hibaüzenet SEM a kulcsot, SEM a hosszát nem írja ki')
      } else {
        fail(`B7c: a hibaüzenet szivárogtat — „${uzenet}"`)
      }

      // (d) 64 hexa karakter ÉS 32 bájtnyi base64 egyaránt jó
      process.env.BACKUP_ENCRYPTION_KEY = 'ab'.repeat(32)
      process.env.BACKUP_KEY_ID = 'k2026a'
      resetBackupKeyCache()
      const hexKey = loadBackupKey()
      process.env.BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64')
      resetBackupKeyCache()
      const b64Key = loadBackupKey()
      if (hexKey.key.length === 32 && b64Key.key.length === 32 && hexKey.keyId === 'k2026a') {
        ok('B7d hexa ÉS base64 kulcsot is elfogad, a kulcs-azonosító a fejlécbe kerül')
      } else {
        fail('B7d: a kulcs-formátumok kezelése hibás')
      }

      // (e) környezet-címke
      process.env.BACKUP_ENV_LABEL = 'test'
      if (loadEnvLabel() === 'test') ok('B7e a környezet-címke beolvasható (prod ⇄ test elválasztás)')
      else fail('B7e: a környezet-címke nem olvasható')
      process.env.BACKUP_ENV_LABEL = 'szemet'
      if (dob(() => loadEnvLabel(), 'érvénytelen')) {
        ok('B7f ismeretlen környezet-címkére HANGOS hiba')
      } else {
        fail('B7f: ismeretlen környezet-címkét elfogadott')
      }
    } finally {
      for (const [k, v] of [
        ['BACKUP_ENCRYPTION_KEY', mentett.key],
        ['BACKUP_KEY_ID', mentett.keyId],
        ['GOD_MODE_PIN', mentett.god],
        ['VAULT_ENCRYPTION_KEY', mentett.vault],
        ['BACKUP_ENV_LABEL', mentett.env],
      ]) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
      resetBackupKeyCache()
    }
  }

  // B8 — Drive refresh token
  {
    const token = '1//0gAbCdEf-teszt-refresh-token'
    const sealed = sealDriveRefreshToken(token, MASTER)
    if (!sealed.toString('utf8').includes('refresh-token')) {
      ok('B8a a tárolt Drive-token TITKOSÍTVA van (nem olvasható nyersen)')
    } else {
      fail('B8a: a Drive-token nyersen olvasható a tárolt blobban')
    }
    if (openDriveRefreshToken(sealed, MASTER) === token) {
      ok('B8b a Drive-token oda-vissza')
    } else {
      fail('B8b: a Drive-token nem állítható vissza')
    }
    if (dob(() => openDriveRefreshToken(sealed, Buffer.alloc(32, 1)), 'drive')) {
      ok('B8c más kulccsal a Drive-token nem oldható fel')
    } else {
      fail('B8c: a Drive-token más kulccsal is feloldható volt')
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// C. HASZNOS TEHER — manifest, bizonyíték, média
// ═════════════════════════════════════════════════════════════════════════════

const alapPayloadInput = (tablak) => ({
  hatokor: 'gyulekezet',
  congregationId: 'c-1',
  congregationNev: 'Barátos',
  kind: 'napi',
  runDate: '2026-08-11',
  env: 'test',
  semaUjjlenyomat: 'ujjlenyomat-1',
  kimaradt: KIMARADT,
  mediaFajl: null,
  keszult: '2026-08-11T02:00:00.000Z',
  tablak,
})

{
  const szemelyek = mintaSzemely(5)
  const built = buildPayload(
    alapPayloadInput([
      { tabla: 'szemely', sorok: szemelyek },
      { tabla: 'befizetes', sorok: [{ id: 1, osszeg: 200 }, { id: 2, osszeg: 350 }] },
      { tabla: 'iktato', sorok: [] },
    ]),
  )

  // C1 — oda-vissza
  {
    const p = parsePayload(built.ndjson, { collectRows: true })
    const szamokOk =
      p.rowCounts.szemely === 5 && p.rowCounts.befizetes === 2 && p.rowCounts.iktato === 0
    const hashOk = p.tableHashes.szemely === built.manifest.tablak.szemely.sha256
    const footerOk = p.sha256Nyers === built.footer.sha256_nyers && p.totalRows === 7
    const sorokOk = p.rows.szemely.length === 5 && p.rows.szemely[0].csaladnev === 'Kovács0'
    if (szamokOk && hashOk && footerOk && sorokOk) {
      ok('C1 a hasznos teher oda-vissza: sorszámok, táblánkénti hash és záró sor egyaránt egyezik')
    } else {
      fail(
        `C1: szamok=${szamokOk} hash=${hashOk} footer=${footerOk} sorok=${sorokOk}`,
      )
    }
  }

  // C1b — az ÜRES tábla is számon van tartva
  {
    const p = parsePayload(built.ndjson)
    if (built.manifest.tablak.iktato.sorok === 0 && p.rowCounts.iktato === 0) {
      ok('C1b az ÜRES tábla is bekerül a manifestbe (nem tűnik el „nem is volt"-ként)')
    } else {
      fail('C1b: az üres tábla nem jelenik meg a bizonyítékban')
    }
  }

  // C2 — ⭐ NÉMA CSONKOLÁS felismerése
  {
    const v = verifyRowCounts(
      { szemely: 1247, befizetes: 2 }, // az adatbázis szerint
      { szemely: 1000, befizetes: 2 }, // amit a PostgREST némán adott
      { szemely: 1000, befizetes: 2 }, // amit visszaolvastunk
    )
    if (!v.ok && v.elteresek.some((s) => s.includes('szemely') && s.includes('1247'))) {
      ok('C2 ⭐ a NÉMA 1000 soros csonkolást a hármas egyeztetés ELKAPJA, névvel és számmal')
    } else {
      fail('C2: a csonkolás átcsúszott az egyeztetésen')
    }
    const jo = verifyRowCounts({ a: 3 }, { a: 3 }, { a: 3 })
    if (jo.ok && jo.elteresek.length === 0) ok('C2b egyező számokra nincs hamis riasztás')
    else fail('C2b: hamis riasztás egyező számokra')
  }

  // C2c — a HIÁNYZÓ tábla is eltérés (nem „0 == nincs")
  {
    const v = verifyRowCounts({ szemely: 10, csalad: 4 }, { szemely: 10 }, { szemely: 10 })
    if (!v.ok && v.elteresek.some((s) => s.startsWith('csalad'))) {
      ok('C2c a teljesen KIMARADT tábla is eltérésként jelenik meg')
    } else {
      fail('C2c: a kimaradt tábla nem okozott eltérést')
    }
  }

  // C3 — tartalom-változás felismerése
  {
    const modositott = buildPayload(
      alapPayloadInput([
        { tabla: 'szemely', sorok: szemelyek.map((s, i) => (i === 0 ? { ...s, k_nev: 'Péter' } : s)) },
        { tabla: 'befizetes', sorok: [{ id: 1, osszeg: 200 }, { id: 2, osszeg: 350 }] },
        { tabla: 'iktato', sorok: [] },
      ]),
    )
    const p = parsePayload(modositott.ndjson)
    const v = verifyTableHashes(built.manifest, p.tableHashes)
    if (!v.ok && v.elteresek.some((s) => s.includes('szemely'))) {
      ok('C3 UGYANANNYI sor, MÁS tartalom → a táblánkénti hash elkapja')
    } else {
      fail('C3: az azonos sorszámú, eltérő tartalmú fájl átment az ellenőrzésen')
    }
  }

  // C4 — a záró sor nélküli (csonka) hasznos teher
  {
    const szoveg = built.ndjson.toString('utf8')
    const sorok = szoveg.split('\n').filter((s) => s !== '')
    const csonka = Buffer.from(sorok.slice(0, -1).join('\n') + '\n', 'utf8')
    if (dob(() => parsePayload(csonka), 'csonka')) {
      ok('C4 ⭐ a záró sor nélküli hasznos teher HIBÁRA fut (a fájl csonka)')
    } else {
      fail('C4: a záró sor nélküli fájl elfogadásra került')
    }
  }

  // C5 — manifest nélküli fájl
  {
    if (dob(() => parsePayload(Buffer.from('{"t":"szemely","r":{}}\n{"vege":true}\n')), 'manifest')) {
      ok('C5 manifest nélküli fájl HIBÁRA fut')
    } else {
      fail('C5: manifest nélküli fájlt elfogadott')
    }
  }
}

// C6 — média-leválasztás
{
  const sorok = mintaSzemely(9) // minden 3.-nak van képe → 3 db
  const split = splitMediaColumn(sorok, 'id', 'kep')
  const kepesekSzama = split.media.length
  const kulcsMegvan = Object.prototype.hasOwnProperty.call(split.sorok[0], 'kep')
  const nullaraAllt = split.sorok[0].kep === null
  const foFajlbanNincsKep = !JSON.stringify(split.sorok).includes('data:image')
  if (kepesekSzama === 3 && kulcsMegvan && nullaraAllt && foFajlbanNincsKep) {
    ok('C6a a fényképek leválnak, de a `kep` KULCS megmarad null-lal (a hiány nem rejtőzik el)')
  } else {
    fail(
      `C6a: kepek=${kepesekSzama} kulcs=${kulcsMegvan} null=${nullaraAllt} tiszta=${foFajlbanNincsKep}`,
    )
  }

  const m1 = buildMediaPayload(split.media)
  const m2 = buildMediaPayload(splitMediaColumn(mintaSzemely(9), 'id', 'kep').media)
  if (m1.sha256 === m2.sha256 && m1.darab === 3) {
    ok('C6b VÁLTOZATLAN fényképekre azonos SHA-256 → a holnapi mentés nem tölti fel újra')
  } else {
    fail('C6b: azonos fényképekre eltérő ellenőrző-összeg')
  }

  const valtozott = split.media.map((m, i) => (i === 0 ? { ...m, kep: m.kep + 'X' } : m))
  if (buildMediaPayload(valtozott).sha256 !== m1.sha256) {
    ok('C6c EGYETLEN megváltozott fénykép is új média-fájlt eredményez')
  } else {
    fail('C6c: a megváltozott fénykép nem változtatta meg az ellenőrző-összeget')
  }
}

// C7 — gzip
{
  const eredeti = Buffer.from(JSON.stringify(mintaSzemely(200)), 'utf8')
  const tomoritett = gzipPayload(eredeti)
  if (gunzipPayload(tomoritett).equals(eredeti) && tomoritett.length < eredeti.length) {
    ok('C7 gzip oda-vissza, és tényleg kisebb lett')
  } else {
    fail('C7: a gzip nem reverzibilis vagy nem tömörít')
  }
}

// C8 — a napi kulcs Europe/Bucharest szerint
{
  // ⚠️ 2026-08-11: a korábbi komment „a cron 23:00 UTC-kor indul → MÁSNAP 02:00"
  //    volt, ami a repóban a HARMADIK, egymásnak ellentmondó cron-állítás volt.
  //    Az ütemezés `17 2 * * *` UTC szerint (= nyáron 05:17, télen 04:17
  //    Bukarestben). A teszt lényege ettől független: a NAPKULCS a bukaresti
  //    naptárból jön, nem az UTC-ből — ezért használunk 23:30Z-t, ami már a
  //    KÖVETKEZŐ bukaresti nap.
  const nyar = bucharestRunDate(new Date('2026-08-11T23:30:00Z')) // UTC+3
  const tel = bucharestRunDate(new Date('2026-01-15T23:30:00Z')) // UTC+2
  const nappal = bucharestRunDate(new Date('2026-08-11T09:00:00Z'))
  if (nyar === '2026-08-12' && tel === '2026-01-16' && nappal === '2026-08-11') {
    ok('C8 ⭐ a futás napja HELYI idő szerint dől el (nyáron és télen is), nem UTC szerint')
  } else {
    fail(`C8: nyar=${nyar} (várt 2026-08-12), tel=${tel} (várt 2026-01-16), nappal=${nappal}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// C9 — ⭐⭐ AZ IDŐPONT-KIÍRÁS FÜGGETLEN A FUTTATÓ GÉP ZÓNÁJÁTÓL (2026-08-11)
// ═════════════════════════════════════════════════════════════════════════════
// A MÉRT HIBA: a mentés-kártya ugyanarról az eseményről két különböző időt írt
// ki — a fejlécben 15:32 (a SZERVEREN, UTC-ben formázva), alatta 18:32 (a
// BÖNGÉSZŐBEN, Bukarest szerint). Mindkét helyen ugyanaz a mulasztás: hiányzott
// a `timeZone` opció. Ez a teszt pontosan azt fogja meg: UGYANAZ a pillanat,
// UGYANAZ a formázó, KÉT KÜLÖNBÖZŐ gép-zónában — az eredménynek egyeznie kell.
{
  const { huIdopontBukarest, bukarestiNapKulcs } = idopont
  const pillanat = '2026-08-11T15:32:00Z'

  // A Node a zónát az `Intl` hívás pillanatában olvassa a `process.env.TZ`-ből,
  // ezért elég átállítani és visszaállítani.
  const eredetiTz = process.env.TZ
  const merj = (tz, fn) => {
    process.env.TZ = tz
    try {
      return fn()
    } finally {
      if (eredetiTz === undefined) delete process.env.TZ
      else process.env.TZ = eredetiTz
    }
  }

  // ⚠️ A formázó gyorsítótárazza az `Intl.DateTimeFormat` példányt, ezért a
  //    modult zónánként FRISSEN töltjük be — különben az első hívás zónája
  //    ragadna be, és a teszt akkor is átmenne, ha a hiba visszatérne.
  const utcSzoveg = merj('UTC', () => loadTs(SOURCES.idopont, 'idopont_utc').huIdopontBukarest(pillanat))
  const buSzoveg = merj('Europe/Bucharest', () =>
    loadTs(SOURCES.idopont, 'idopont_bu').huIdopontBukarest(pillanat),
  )

  if (utcSzoveg === buSzoveg && /18:32/.test(buSzoveg)) {
    ok('C9 ⭐⭐ ugyanaz az időpont UTC-s és bukaresti gépen IS azonos szöveg (és 18:32, nem 15:32)')
  } else {
    fail(`C9: utc="${utcSzoveg}" bukarest="${buSzoveg}" — a kiírás a futtató gép zónájától függ`)
  }

  // C9b — a NAPKULCS is zóna-független, és a téli/nyári különbséget is bírja.
  // ⚠️ EZ NEM KIJELZÉS: ez a `backup_log` napi egyedi indexének a kulcsa, a
  //    „ma/tegnap" lefedettségé ÉS a riasztás-deduplikálásé. Ha UTC-ben számolna,
  //    a nap 03:00-kor (télen 02:00-kor) váltana — PONT az éjszakai mentési
  //    ablak közepén, vagyis a hajnali riasztás az előző nap kulcsához tartozna
  //    és NÉMÁN kimaradna.
  const napUtc = merj('UTC', () =>
    loadTs(SOURCES.idopont, 'idopont_utc2').bukarestiNapKulcs(new Date('2026-08-11T21:30:00Z')),
  )
  const napTel = bukarestiNapKulcs(new Date('2026-01-15T22:30:00Z'))
  if (napUtc === '2026-08-12' && napTel === '2026-01-16' && huIdopontBukarest(null) === '—') {
    ok('C9b ⭐ a napkulcs bukaresti nap szerint vált (nyáron 21:00Z-kor, télen 22:00Z-kor)')
  } else {
    fail(`C9b: napUtc=${napUtc} (várt 2026-08-12), napTel=${napTel} (várt 2026-01-16)`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// D. LELTÁR — besorolás és FÜGGŐSÉGI SORREND
// ═════════════════════════════════════════════════════════════════════════════

const leltarSor = (tabla, hatokor, reteg, oszlopok = ['id']) => ({
  tabla,
  van_congregation_id: hatokor === 'gyulekezet',
  hatokor,
  reteg,
  visszaallithato: true,
  join_predikatum: null,
  identity_always: [],
  pk_oszlopok: ['id'],
  oszlopok,
})

const MINTA_LELTAR = [
  leltarSor('bealitas', 'gyulekezet', 2),
  leltarSor('szemely', 'gyulekezet', 3, ['id', 'cnp', 'kep']),
  leltarSor('csalad', 'gyulekezet', 4),
  leltarSor('befizetes', 'gyulekezet', 5),
  leltarSor('sirhely', 'gyulekezet', 6),
  leltarSor('sirhelyberles', 'gyulekezet', 6),
  leltarSor('munkanaplo', 'gyulekezet', 7),
  leltarSor('adrstreet', 'globalis', 0),
  leltarSor('congregations', 'globalis', 1),
  leltarSor('system_settings', 'kizart_titok', null),
  leltarSor('monetar', 'kizart_egyeb', null),
]

{
  // D1 — ⭐ BESOROLATLAN élő tábla → HANGOS hiba, NÉVVEL
  {
    const ujTabla = leltarSor('uj_tabla_2027', null, null)
    let uzenet = ''
    try {
      assertInventoryClassified([...MINTA_LELTAR, ujTabla])
    } catch (e) {
      uzenet = String(e.message)
    }
    if (uzenet.includes('uj_tabla_2027') && uzenet.toLowerCase().includes('besorolatlan')) {
      ok('D1 ⭐ a BESOROLATLAN élő tábla megállítja a mentést, és a hibaüzenet MEGNEVEZI')
    } else {
      fail(`D1: a besorolatlan tábla nem állította meg a mentést — „${uzenet}"`)
    }
  }

  // D2 — a réteg hiánya NEM állítja meg a MENTÉST (csak a visszaállítást)
  {
    const retegNelkul = leltarSor('uj_tabla_reteg_nelkul', 'gyulekezet', null)
    let hibas = false
    let c = null
    try {
      c = assertInventoryClassified([...MINTA_LELTAR, retegNelkul])
    } catch {
      hibas = true
    }
    if (!hibas && c.retegNelkul.includes('uj_tabla_reteg_nelkul')) {
      ok('D2 a RÉTEG hiánya nem állítja meg a mentést, de felkerül a figyelmeztetésre')
    } else {
      fail('D2: a réteg nélküli tábla leállította a mentést (a gyógyszer rosszabb a betegségnél)')
    }
  }

  // D3 — szétválogatás
  {
    const c = classifyInventory(MINTA_LELTAR)
    if (c.gyulekezet.length === 7 && c.globalis.length === 2 && c.kizart.length === 2) {
      ok('D3 a hatókörök szétválogatása helyes (7 gyülekezeti / 2 globális / 2 kizárt)')
    } else {
      fail(`D3: ${c.gyulekezet.length}/${c.globalis.length}/${c.kizart.length}`)
    }
    const kizart = excludedTableNames(MINTA_LELTAR)
    if (kizart.includes('system_settings') && kizart.includes('monetar')) {
      ok('D3b a KIZÁRT táblák nevei bekerülnek a manifestbe (a kihagyás dokumentált, nem néma)')
    } else {
      fail('D3b: a kizárt táblák nem jelennek meg')
    }
  }

  // D4 — ⭐ FÜGGŐSÉGI SORREND
  {
    const sorrend = orderTablesForDump(MINTA_LELTAR, 'gyulekezet').map((r) => r.tabla)
    const idx = (t) => sorrend.indexOf(t)
    const retegSorrend =
      idx('bealitas') < idx('szemely') &&
      idx('szemely') < idx('csalad') &&
      idx('csalad') < idx('befizetes')
    // A TEMETŐ a PÉNZÜGY UTÁN jön: sirhelyberles.befizetesid → befizetes(id)
    const temetoPenzugyUtan = idx('befizetes') < idx('sirhely') && idx('befizetes') < idx('sirhelyberles')
    // Azonos rétegen belül a NÉV dönt → két futás ugyanazt a sorrendet adja.
    const holtversenyDeterminisztikus = idx('sirhely') < idx('sirhelyberles')
    if (retegSorrend && temetoPenzugyUtan && holtversenyDeterminisztikus) {
      ok('D4 ⭐ a függőségi sorrend helyes: R2→R3→R4→R5, és a TEMETŐ a PÉNZÜGY UTÁN jön')
    } else {
      fail(
        `D4: reteg=${retegSorrend} temeto=${temetoPenzugyUtan} determ=${holtversenyDeterminisztikus} — ${sorrend.join(', ')}`,
      )
    }

    const kevert = orderTablesForDump([...MINTA_LELTAR].reverse(), 'gyulekezet').map((r) => r.tabla)
    if (kevert.join('|') === sorrend.join('|')) {
      ok('D4b a sorrend FÜGGETLEN a bemenet sorrendjétől (két futás összevethető)')
    } else {
      fail('D4b: a bemenet sorrendje befolyásolta a kimenetet')
    }

    const globalis = orderTablesForDump(MINTA_LELTAR, 'globalis').map((r) => r.tabla)
    if (globalis.join('|') === 'adrstreet|congregations' && !globalis.includes('szemely')) {
      ok('D4c a globális hatókörbe NEM szivárog be gyülekezeti tábla')
    } else {
      fail(`D4c: a globális lista hibás — ${globalis.join(', ')}`)
    }

    const retegNelkul = leltarSor('kesobb_besoroljuk', 'gyulekezet', null)
    const vegen = orderTablesForDump([retegNelkul, ...MINTA_LELTAR], 'gyulekezet')
    if (vegen[vegen.length - 1].tabla === 'kesobb_besoroljuk') {
      ok('D4d a réteg nélküli tábla a lista VÉGÉRE kerül (mentjük, csak a helyét nem tudjuk)')
    } else {
      fail('D4d: a réteg nélküli tábla nem a végére került')
    }
  }

  // D5 — séma-ujjlenyomat
  {
    const a = computeSchemaFingerprint(MINTA_LELTAR)
    const b = computeSchemaFingerprint([...MINTA_LELTAR].reverse())
    const c = computeSchemaFingerprint(
      MINTA_LELTAR.map((r) =>
        r.tabla === 'szemely' ? { ...r, oszlopok: ['cnp', 'kep', 'id'] } : r,
      ),
    )
    const d = computeSchemaFingerprint(
      MINTA_LELTAR.map((r) =>
        r.tabla === 'szemely' ? { ...r, oszlopok: [...r.oszlopok, 'uj_oszlop'] } : r,
      ),
    )
    if (a === b && a === c && a !== d) {
      ok('D5 a séma-ujjlenyomat stabil az átrendezésre, de ÚJ OSZLOPRA megváltozik')
    } else {
      fail(`D5: sorrend=${a === b} oszlopsorrend=${a === c} ujoszlop=${a !== d}`)
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// E. ⭐ A TELJES CSŐVEZETÉK — EZ BIZONYÍTJA, HOGY A MENTÉS VISSZAÁLLÍTHATÓ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Végigmegy a teljes úton, ahogy az `export.ts` teszi:
 *   sorok → manifest+NDJSON → gzip → AES-256-GCM konténer → „feltöltés" →
 *   „letöltés" → visszafejtés → kicsomagolás → sorszám/tartalom-egyeztetés.
 *
 * A „tároló" itt egy Map — a valódi Drive/Storage ugyanezt az egy szerződést
 * teljesíti (`uploadFile` → `downloadFile` bájtra azonos tartalommal).
 */
function teljesCsovezetek({ varhatoFelulir = null, tarolotRongal = false } = {}) {
  const szemelyek = mintaSzemely(40)
  const befizetesek = Array.from({ length: 25 }, (_, i) => ({
    id: i + 1,
    congregation_id: 'c-1',
    osszeg: 100 + i,
    nyugta: 1000 + i,
  }))

  const split = splitMediaColumn(szemelyek, 'id', 'kep')
  const media = buildMediaPayload(split.media)

  const varhato = varhatoFelulir || { szemely: split.sorok.length, befizetes: befizetesek.length }

  const built = buildPayload({
    hatokor: 'gyulekezet',
    congregationId: 'c-1',
    congregationNev: 'Barátos',
    kind: 'napi',
    runDate: '2026-08-11',
    env: 'test',
    semaUjjlenyomat: computeSchemaFingerprint(MINTA_LELTAR),
    kimaradt: { ...KIMARADT, tablak: excludedTableNames(MINTA_LELTAR) },
    mediaFajl: { drive_file_id: 'km-teszt', sha256: media.sha256, darab: media.darab },
    tablak: [
      { tabla: 'szemely', sorok: split.sorok },
      { tabla: 'befizetes', sorok: befizetesek },
    ],
    keszult: '2026-08-11T02:00:00.000Z',
  })

  const dek = generateDek()
  const fejlec = buildHeader({
    id: UUID_A,
    kulcsId: 'k-teszt',
    dekSzerver: wrapDekWithServerKey(dek, UUID_A, MASTER),
    dekJelszo: wrapDekWithPassphrase(dek, 'harang-szeker-kolomp-arnyek', UUID_A, FAST_SCRYPT),
    env: 'test',
    keszult: '2026-08-11T02:00:00.000Z',
  })
  const packed = packContainer(gzipPayload(built.ndjson), dek, fejlec)

  // „Feltöltés" és „letöltés"
  const tarolo = new Map()
  tarolo.set('kb-teszt.kbk', Buffer.from(packed.bytes))
  if (tarolotRongal) {
    const b = tarolo.get('kb-teszt.kbk')
    b[b.length - 3] ^= 0xff
  }
  const letoltott = tarolo.get('kb-teszt.kbk')

  // A visszaállítás útja: a JELSZÓVAL nyitjuk (nem a szerver-kulccsal)
  const dekJelszobol = unwrapDekWithPassphrase(
    fejlec.dek_jelszo,
    'harang-szeker-kolomp-arnyek',
    UUID_A,
  )
  const { plaintext } = unpackContainer(letoltott, dekJelszobol)
  const vissza = parsePayload(gunzipPayload(plaintext), { collectRows: true })

  return {
    packed,
    letoltott,
    built,
    vissza,
    media,
    varhato,
    szamok: verifyRowCounts(varhato, built.rowCounts, vissza.rowCounts),
    hashek: verifyTableHashes(built.manifest, vissza.tableHashes),
  }
}

{
  // E1 — a boldog út
  try {
    const r = teljesCsovezetek()
    const bajtraAzonos = r.letoltott.equals(r.packed.bytes)
    const sorokMegvannak =
      r.vissza.rows.szemely.length === 40 && r.vissza.rows.befizetes.length === 25
    const tartalomEl = r.vissza.rows.befizetes[3].nyugta === 1003
    const manifestEl =
      r.vissza.manifest.congregation_nev === 'Barátos' &&
      r.vissza.manifest.media_fajl.sha256 === r.media.sha256
    const kimondja = r.vissza.manifest.kimaradt.tablak.includes('system_settings')

    if (
      bajtraAzonos &&
      r.szamok.ok &&
      r.hashek.ok &&
      sorokMegvannak &&
      tartalomEl &&
      manifestEl &&
      kimondja
    ) {
      ok('E1 ⭐⭐ TELJES CSŐVEZETÉK: a mentés a MENTÉSI JELSZÓVAL visszaolvasható, minden sor és minden mező a helyén')
    } else {
      fail(
        `E1: bajt=${bajtraAzonos} szamok=${r.szamok.ok} hash=${r.hashek.ok} ` +
          `sorok=${sorokMegvannak} tartalom=${tartalomEl} manifest=${manifestEl} kimaradt=${kimondja}`,
      )
    }

    // A fényképek NEM a fő fájlban vannak, de a hivatkozás igen.
    const foFajlbanNincsKep = !JSON.stringify(r.vissza.rows.szemely).includes('data:image')
    if (foFajlbanNincsKep && r.vissza.manifest.media_fajl.darab === 14) {
      ok('E1b a fényképek KÜLÖN fájlban vannak, de a manifest tudja, hány darab és melyik fájlban')
    } else {
      fail(`E1b: kep-mentes=${foFajlbanNincsKep} darab=${r.vissza.manifest.media_fajl.darab}`)
    }
  } catch (e) {
    fail(`E1: a teljes csővezeték kivétellel elszállt — ${e?.message || e}`)
  }

  // E2 — ⭐ NÉMA CSONKOLÁS a lekérdezésben (az adatbázis 1247-et mond, a fájlba 40 került)
  try {
    const r = teljesCsovezetek({ varhatoFelulir: { szemely: 1247, befizetes: 25 } })
    if (!r.szamok.ok && r.szamok.elteresek.some((s) => s.includes('szemely'))) {
      ok('E2 ⭐⭐ ha a lekérdezés NÉMÁN csonkolna, az IGAZOLÁS elbuktatja a mentést (nem lesz „ok" sor)')
    } else {
      fail('E2: a néma csonkolás átcsúszott a teljes csővezetéken')
    }
  } catch (e) {
    fail(`E2: kivétel — ${e?.message || e}`)
  }

  // E3 — a tárolóban megsérült fájl
  {
    let elkapta = false
    try {
      teljesCsovezetek({ tarolotRongal: true })
    } catch {
      elkapta = true
    }
    if (elkapta) {
      ok('E3 ⭐ a TÁROLÓBAN megsérült fájl visszaolvasása HIBÁRA fut (ezért töröljük és jelentjük)')
    } else {
      fail('E3: a megsérült fájl visszaolvasása sikeresnek látszott')
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F — HELYREÁLLÍTÓ KULCS-LETÉT (2026-08-11)
//
// ⚠️ EZ A CSOPORT AZT BIZONYÍTJA, AMI E NÉLKÜL CSAK ÍGÉRET VOLT:
//    a FELÜGYELET NÉLKÜLI napi mentés is megnyitható PUSZTÁN a mentési
//    jelszóval — szerver-kulcs NÉLKÜL, adatbázis NÉLKÜL, Kartotéka NÉLKÜL.
//    Korábban a napi fájlok KIZÁRÓLAG a BACKUP_ENCRYPTION_KEY-jel nyíltak;
//    a kulcs elvesztése az egész archívumot olvashatatlanná tette volna.
// ═════════════════════════════════════════════════════════════════════════════
{
  const JELSZO = 'harom-alma-negy-korte-2026'

  // F1 — a kulcspár előáll, és a titkos fele a jelszóval oda-vissza burkolható.
  let par, burkolt
  try {
    par = generateRecoveryKeypair()
    burkolt = wrapRecoveryPrivateKey(par, JELSZO, FAST_SCRYPT)
    const vissza = unwrapRecoveryPrivateKey(burkolt, JELSZO)
    if (
      par.publicRaw.length === 32 &&
      par.privateRaw.length === 32 &&
      vissza.privateRaw.equals(par.privateRaw) &&
      vissza.publicRaw.equals(par.publicRaw)
    ) {
      ok('F1 a helyreállító kulcspár előáll, és a titkos fele a jelszóval oda-vissza burkolható')
    } else {
      fail('F1: a helyreállító titkos kulcs nem jött vissza azonosan')
    }
  } catch (e) {
    fail(`F1: kivétel — ${e?.message || e}`)
  }

  // F2 — ROSSZ jelszóval a titkos kulcs NEM oldható fel.
  if (par && burkolt) {
    if (dob(() => unwrapRecoveryPrivateKey(burkolt, JELSZO + 'x'), 'Hibás mentési jelszó')) {
      ok('F2 rossz jelszóval a helyreállító kulcs NEM oldható fel')
    } else {
      fail('F2: rossz jelszó is feloldotta a helyreállító kulcsot')
    }
  }

  // F3 — a DEK pecsételése a NYILVÁNOS kulcshoz, feloldás a titkossal.
  if (par) {
    try {
      const dek = generateDek()
      const pecset = wrapDekWithRecoveryKey(dek, UUID_A, par.publicRaw)
      const vissza = unwrapDekWithRecoveryKey(pecset, UUID_A, par.privateRaw, par.publicRaw)
      const cimzettOk = pecset.cimzett === recoveryKeyFingerprint(par.publicRaw)
      if (vissza.equals(dek) && pecset.alg === 'x25519' && cimzettOk) {
        ok('F3 ⭐ a DEK a NYILVÁNOS kulccsal pecsételhető (a cron titok nélkül), a titkossal nyitható')
      } else {
        fail(`F3: dek-egyezes=${vissza.equals(dek)} cimzett=${cimzettOk}`)
      }
    } catch (e) {
      fail(`F3: kivétel — ${e?.message || e}`)
    }
  }

  // F4 — MÁSIK kulcspárral NEM nyílik (az AAD a fájl UUID-jához is köt).
  if (par) {
    try {
      const masik = generateRecoveryKeypair()
      const dek = generateDek()
      const pecset = wrapDekWithRecoveryKey(dek, UUID_A, par.publicRaw)
      const idegen = dob(
        () => unwrapDekWithRecoveryKey(pecset, UUID_A, masik.privateRaw, masik.publicRaw),
        'helyreállító kulccsal',
      )
      const masFajl = dob(
        () => unwrapDekWithRecoveryKey(pecset, UUID_B, par.privateRaw, par.publicRaw),
        'helyreállító kulccsal',
      )
      if (idegen && masFajl) {
        ok('F4 idegen kulcspárral ÉS másik fájl-azonosítóval sem nyílik (AAD-kötés)')
      } else {
        fail(`F4: idegen=${idegen} masFajl=${masFajl}`)
      }
    } catch (e) {
      fail(`F4: kivétel — ${e?.message || e}`)
    }
  }

  // F5 — ⭐⭐ A LÉNYEG: egy „napi" (jelszó NÉLKÜL készült) fájl megnyitása
  //      KIZÁRÓLAG a jelszóval, SZERVER-KULCS NÉLKÜL.
  if (par && burkolt) {
    try {
      const dek = generateDek()
      const fejlec = buildHeader({
        id: UUID_B,
        kulcsId: 'k-teszt',
        // A cron a szerver-kulccsal is burkol — de MOST ÚGY TESZÜNK, MINTHA
        // az a kulcs elveszett volna: az alábbi visszafejtés nem használja.
        dekSzerver: wrapDekWithServerKey(dek, UUID_B, MASTER),
        // A napi futás NEM ismeri a jelszót → ez `null`. Pontosan ez volt a baj.
        dekJelszo: null,
        dekHelyreallito: wrapDekWithRecoveryKey(dek, UUID_B, par.publicRaw),
        helyreallitoKulcs: burkolt,
        tarolo: 'google-drive',
        env: 'test',
        chunkPlainBytes: 1024,
        noncePrefix: Buffer.from([9, 9, 9, 9]),
        keszult: '2026-08-11T02:00:00.000Z',
      })
      const tartalom = Buffer.from('{"manifest":{"formatum":1}}\n{"vege":true}\n', 'utf8')
      const csomag = packContainer(tartalom, dek, fejlec)

      // ── A VISSZAFEJTÉS: CSAK a jelszóból, a szerver-kulcs érintése nélkül.
      const { header: fejlec2, bodyOffset } = parseHeader(csomag.bytes)
      const parVissza = unwrapRecoveryPrivateKey(fejlec2.helyreallito_kulcs, JELSZO)
      const dekVissza = unwrapDekWithRecoveryKey(
        fejlec2.dek_helyreallito,
        fejlec2.id,
        parVissza.privateRaw,
        parVissza.publicRaw,
      )
      const nyers = decryptChunks(csomag.bytes.subarray(bodyOffset), dekVissza, fejlec2)

      if (nyers.equals(tartalom) && fejlec2.dek_jelszo === null && fejlec2.tarolo === 'google-drive') {
        ok(
          'F5 ⭐⭐ a FELÜGYELET NÉLKÜLI napi mentés PUSZTÁN a mentési jelszóval megnyitható — ' +
            'szerver-kulcs, adatbázis és Kartotéka nélkül',
        )
      } else {
        fail(`F5: tartalom-egyezes=${nyers.equals(tartalom)} dek_jelszo=${fejlec2.dek_jelszo}`)
      }
    } catch (e) {
      fail(`F5: kivétel — ${e?.message || e}`)
    }
  }

  // F6 — VISSZAFELÉ KOMPATIBILITÁS: a régi (mezők nélküli) fejléc TOVÁBBRA IS
  //      értelmezhető. Egy verzió-emelés itt a régi fájlokat tette volna
  //      megnyithatatlanná — pont azt a kárt, amit elhárítani akarunk.
  try {
    const regi = testHeader()
    delete regi.dek_helyreallito
    delete regi.helyreallito_kulcs
    delete regi.tarolo
    const csomag = packContainer(Buffer.from('x'), Buffer.alloc(32, 1), regi)
    const { header: vissza } = parseHeader(csomag.bytes)
    if (vissza.v === 1 && vissza.dek_szerver) {
      ok('F6 a 2026-08-11 ELŐTTI fejléc (új mezők nélkül) TOVÁBBRA IS értelmezhető')
    } else {
      fail('F6: a régi fejléc nem parse-olható')
    }
  } catch (e) {
    fail(`F6: kivétel — ${e?.message || e}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// G — A LELTÁR ÚJ KAPUJA: gyülekezeti tábla ÉRVÉNYES SZŰRŐ NÉLKÜL
//
// ⚠️ EZ EGY VALÓDI, ÉLES HIBÁBÓL SZÜLETETT (2026-08-11). Három tábla
//    (`member_accounts`, `member_newsletter_preferences`, `audit_log`)
//    gyülekezeti hatókörrel, saját szűrő nélkül volt besorolva, holott NINCS
//    bennük `congregation_id` oszlop. A `backup_scope_where()` ilyenkor a
//    `t.congregation_id = $1` alapértelmezést adja, a számlálás 42703-mal
//    elhasal — vagyis EGYETLEN GYÜLEKEZETI MENTÉS SEM KÉSZÜLT VOLNA EL.
// ═════════════════════════════════════════════════════════════════════════════
{
  const sor = (tabla, extra = {}) => ({
    tabla,
    van_congregation_id: true,
    hatokor: 'gyulekezet',
    reteg: 3,
    visszaallithato: true,
    join_predikatum: null,
    identity_always: [],
    pk_oszlopok: ['id'],
    oszlopok: ['id'],
    ...extra,
  })

  // G1 — a hiba MEGÁLLÍTJA a mentést, és MEGNEVEZI a táblát.
  const rossz = [sor('szemely'), sor('member_accounts', { van_congregation_id: false })]
  const dobott = dob(() => assertInventoryClassified(rossz), 'member_accounts')
  if (dobott) {
    ok('G1 ⭐ gyülekezeti tábla congregation_id ÉS saját szűrő NÉLKÜL → a mentés meg sem indul, névvel')
  } else {
    fail('G1: a hibás besorolás átcsúszott — minden gyülekezet mentése a számlálásnál bukna')
  }

  // G2 — SAJÁT SZŰRŐVEL viszont rendben van (a `csalad` pontosan ilyen).
  const jo = [
    sor('szemely'),
    sor('csalad', {
      van_congregation_id: false,
      join_predikatum: 'EXISTS (SELECT 1 FROM public.szemely s WHERE s.congregation_id = $1)',
    }),
  ]
  try {
    const c = assertInventoryClassified(jo)
    if (c.szuroNelkul.length === 0 && c.gyulekezet.length === 2) {
      ok('G2 saját join_predikatum esetén a congregation_id hiánya NEM hiba (pl. csalad, gyerek)')
    } else {
      fail(`G2: szuroNelkul=${c.szuroNelkul.join(',')}`)
    }
  } catch (e) {
    fail(`G2: kivétel — ${e?.message || e}`)
  }

  // G3 — az ÜRES SZÖVEG ugyanolyan használhatatlan szűrő, mint a null.
  const uresSzuro = [sor('valami', { van_congregation_id: false, join_predikatum: '   ' })]
  if (dob(() => assertInventoryClassified(uresSzuro), 'valami')) {
    ok('G3 az ÜRES join_predikatum ugyanúgy hiány, mint a NULL (nem csúszik át)')
  } else {
    fail('G3: az üres szűrő átcsúszott')
  }

  // G4 — a GLOBÁLIS hatókört ez a kapu nem érinti (ott nincs gyülekezet-szűrő).
  const globalis = [sor('member_accounts', { hatokor: 'globalis', van_congregation_id: false })]
  try {
    const c = assertInventoryClassified(globalis)
    if (c.szuroNelkul.length === 0 && c.globalis.length === 1) {
      ok('G4 a globális hatókörű táblát a szűrő-kapu nem érinti (ott nincs gyülekezet-feltétel)')
    } else {
      fail(`G4: szuroNelkul=${c.szuroNelkul.join(',')} globalis=${c.globalis.length}`)
    }
  } catch (e) {
    fail(`G4: kivétel — ${e?.message || e}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// H — KÖTEGELÉS ÉS FOLYTATÁS (batch.ts)
// ═══════════════════════════════════════════════════════════════════════════
// A 2026-08-11-i hiba második fele: a „Mentés most" mind a 784 hatókört EGY
// HTTP-kérésben próbálta lementeni. Ezek az állítások azt védik, hogy a
// szeletelés SOHA ne veszítsen el kész munkát, és SOHA ne ragadjon be.
{
  const {
    scopeKulcs,
    tervezFutas,
    ferBeleUjabbHatokor,
    kellMegSzelet,
    korlatokBeolvasasa,
    berletHatarIso,
    BERLET_MS,
    MAX_IDOKERET_MS,
    MIN_IDOKERET_MS,
    ALAP_IDOKERET_MS,
  } = batch

  const h = (id) => ({ scope: id === null ? 'globalis' : 'gyulekezet', congregationId: id })
  const kulcs = (x) => scopeKulcs(x.scope, x.congregationId)
  const lista = [h('a'), h('b'), h('c'), h('d'), h(null)]

  // H1 — a globális hatókör kulcsa NEM keveredhet össze egy üres azonosítóval.
  if (
    scopeKulcs('globalis', null) === 'globalis:GLOBALIS' &&
    scopeKulcs('gyulekezet', '') !== scopeKulcs('globalis', null) &&
    scopeKulcs('gyulekezet', null) !== scopeKulcs('globalis', null)
  ) {
    ok('H1 a globális hatókör kulcsa egyedi (nem keveredik üres azonosítóval)')
  } else {
    fail(`H1: ${scopeKulcs('globalis', null)} / ${scopeKulcs('gyulekezet', '')}`)
  }

  // H2 — A LEGFONTOSABB ÁLLÍTÁS: a KIHAGYÁS NEM fogyasztja a darab-korlátot.
  // Enélkül egy folytatás a keretét a MÁR KÉSZ hatókörök átlépésére költené, és
  // SOHA nem jutna előre — a mentés örökre félkész maradna, némán.
  {
    const kesz = new Set([kulcs(h('a')), kulcs(h('b')), kulcs(h('c'))])
    const t = tervezFutas({ hatokorok: lista, kulcs, keszKulcsok: kesz, maxHatokor: 2 })
    if (t.kihagyando.length === 3 && t.futtatando.length === 2 && t.halasztott.length === 0) {
      ok('H2 a kihagyás NEM fogyasztja a darab-korlátot (a folytatás tud haladni)')
    } else {
      fail(
        `H2: kihagyando=${t.kihagyando.length} futtatando=${t.futtatando.length} halasztott=${t.halasztott.length}`,
      )
    }
  }

  // H3 — a darab-korlát fölötti maradék HALASZTOTT, nem elveszett és nem hibás.
  {
    const t = tervezFutas({ hatokorok: lista, kulcs, keszKulcsok: [], maxHatokor: 2 })
    const osszesen = t.kihagyando.length + t.futtatando.length + t.halasztott.length
    if (t.futtatando.length === 2 && t.halasztott.length === 3 && osszesen === lista.length) {
      ok('H3 a darab-korlát fölötti maradék HALASZTOTT — egyetlen hatókör sem vész el')
    } else {
      fail(`H3: futtatando=${t.futtatando.length} halasztott=${t.halasztott.length} össz=${osszesen}`)
    }
  }

  // H4 — `maxHatokor: 0` = nincs darab-korlát (a napi cron alapértelmezése).
  {
    const t = tervezFutas({ hatokorok: lista, kulcs, keszKulcsok: [], maxHatokor: 0 })
    if (t.futtatando.length === lista.length && t.halasztott.length === 0) {
      ok('H4 a 0 darab-korlát = korlátlan (nem pedig „egyet sem")')
    } else {
      fail(`H4: futtatando=${t.futtatando.length}`)
    }
  }

  // H5 — a SORREND megmarad: egy folytatás determinisztikusan halad előre.
  {
    const t = tervezFutas({
      hatokorok: lista,
      kulcs,
      keszKulcsok: [kulcs(h('b'))],
      maxHatokor: 0,
    })
    const sorrend = t.futtatando.map((x) => x.congregationId).join(',')
    if (sorrend === 'a,c,d,') {
      ok('H5 a hatókörök sorrendje megmarad (a folytatás nem ugrál össze-vissza)')
    } else {
      fail(`H5: sorrend=${sorrend}`)
    }
  }

  // H6 — HALADÁS-GARANCIA: egy szűkös keret is megpróbál LEGALÁBB egy hatókört.
  // Enélkül egy rosszul beállított időkeret örökös tétlenséget okozna, ami
  // kívülről pontosan úgy néz ki, mint egy működő rendszer.
  if (
    ferBeleUjabbHatokor({
      elteltMs: 999_999,
      maxFutasiIdoMs: 1000,
      atlagosHatokorMs: 50_000,
      feldolgozott: 0,
    })
  ) {
    ok('H6 haladás-garancia: a legszűkösebb keret is megpróbál EGY hatókört')
  } else {
    fail('H6: a szűkös keret egyetlen hatökört sem indított el')
  }

  // H7 — a keret lejárta után NEM indul újabb hatókör.
  if (
    !ferBeleUjabbHatokor({
      elteltMs: 5000,
      maxFutasiIdoMs: 4000,
      atlagosHatokorMs: 10,
      feldolgozott: 3,
    })
  ) {
    ok('H7 a lejárt időkeret után nem indul újabb hatókör')
  } else {
    fail('H7: lejárt keret mellett is indult volna újabb hatókör')
  }

  // H8 — ELŐRELÁTÁS: nem indítunk olyan hatökört, ami VÁRHATÓAN átlógna. Az
  // átlógás nem rendezett megállás, hanem elvágódás — „fut" állapotban ragadt
  // napló-sort hagyna maga után.
  const belefer = ferBeleUjabbHatokor({
    elteltMs: 8000,
    maxFutasiIdoMs: 10_000,
    atlagosHatokorMs: 1000,
    feldolgozott: 8,
  })
  const nemFer = ferBeleUjabbHatokor({
    elteltMs: 8000,
    maxFutasiIdoMs: 10_000,
    atlagosHatokorMs: 5000,
    feldolgozott: 8,
  })
  if (belefer && !nemFer) {
    ok('H8 az átlagos hatókör-idő alapján ELŐRE eldöntjük, belefér-e még egy')
  } else {
    fail(`H8: belefer=${belefer} nemFer=${nemFer}`)
  }

  // H9 — VÉGTELEN CIKLUS ELLEN: ha egy szelet SEMMIT nem vitt el, nem kérünk
  // újabbat. A végtelen ciklus rosszabb, mint a bevallott féleredmény.
  const alap = { osszes: 100, sikeres: 0, sikertelen: 0, kihagyva: 0, feldolgozva: 0, hatralevo: 40 }
  if (
    !kellMegSzelet({ ...alap, futottVegig: false }) &&
    kellMegSzelet({ ...alap, feldolgozva: 5, sikeres: 5, futottVegig: false }) &&
    !kellMegSzelet({ ...alap, feldolgozva: 5, sikeres: 5, hatralevo: 0, futottVegig: true })
  ) {
    ok('H9 a nem haladó szelet NEM kér újabbat (nincs végtelen ciklus)')
  } else {
    fail('H9: a szelet-folytatás feltétele hibás')
  }

  // H9b — ⭐⭐ A BUKOTT HATÓKÖR NEM ÁLLÍTJA MEG A FUTÁST (2026-08-11).
  // Ez a 2026-08-11-i blokkoló pontos szerződése. A végpont korábban 500-at
  // adott, ha BÁRMELYIK hatökör elbukott a szeletben; erre a cron `break`-elt és
  // a felületi ciklus `return`-ölt — vagyis EGYETLEN tartósan bukó gyülekezet
  // (túl nagy fájl, elrontott szűrő) miatt a maradék ~700 hatókör mentése minden
  // éjjel ELMARADT. A folytatás feltétele KIZÁRÓLAG a haladás lehet, SOHA nem a
  // hibátlanság.
  if (
    kellMegSzelet({
      ...alap,
      feldolgozva: 12,
      sikeres: 11,
      sikertelen: 1,
      hatralevo: 700,
      futottVegig: false,
    })
  ) {
    ok('H9b ⭐⭐ a bukott hatókör NEM állítja meg a futást (a maradék ~700 mentése elindul)')
  } else {
    fail('H9b: egy bukott hatókör megállította a folytatást — 700 gyülekezet maradna mentés nélkül')
  }

  // H9c — ⭐⭐ A `kihagyva` NEM HALADÁS (2026-08-11 javítás).
  // A feltétel korábban `feldolgozva + kihagyva > 0` volt. Egy FOLYTATÁSNÁL a
  // `kihagyva` mindig nagy (a mai már igazolt hatókörök), tehát ez akkor is
  // „haladást" mutatott, ha valójában EGYETLEN hatókörhöz sem tudtunk
  // hozzányúlni — például mert mindet egy párhuzamosan futó mentés tartotta a
  // kezében. Az eredmény tucatnyi fölösleges, teljes körű szelet lett volna,
  // mindegyik 784 hatókör végiglapozásával, ÉPP a mentés alól véve el az
  // adatbázist.
  const csakKihagyas = {
    osszes: 784,
    sikeres: 0,
    sikertelen: 0,
    kihagyva: 700,
    feldolgozva: 0,
    foglalt: 84,
    hatralevo: 84,
    futottVegig: false,
  }
  if (
    !kellMegSzelet(csakKihagyas) &&
    kellMegSzelet({ ...csakKihagyas, feldolgozva: 1, sikeres: 1 })
  ) {
    ok('H9c ⭐⭐ a puszta kihagyás NEM számít haladásnak (nincs fölösleges körözés a foglalt hatókörökön)')
  } else {
    fail('H9c: a kihagyás haladásnak számít — a futás a végtelenségig pörögne a foglalt hatókörökön')
  }

  // H9d — a „MINDEN KÉSZ" eset NEM elakadás. Ugyanúgy 0 feldolgozottal zárul,
  // mint az elakadás, de a `hatralevo <= 0` ág elkapja, MIELŐTT a haladás-
  // feltételhez érnénk. Ha ez felcserélődne, a kész mentés „elakadt"-nak
  // látszana — és a tulajdonos hibát keresne ott, ahol nincs.
  if (
    !kellMegSzelet({
      osszes: 784,
      sikeres: 0,
      sikertelen: 0,
      kihagyva: 784,
      feldolgozva: 0,
      foglalt: 0,
      hatralevo: 0,
      futottVegig: true,
    })
  ) {
    ok('H9d a „minden hatókör már kész" szelet nem kér újabbat, és nem is elakadás')
  } else {
    fail('H9d: a kész futás újabb szeletet kért')
  }

  // H9f — ⭐⭐⭐ A CSUPA-BUKÁS SZELET NEM KÉR ÚJABBAT (2026-08-11, blokkoló).
  // A haladást a SIKER méri, nem a PRÓBÁLKOZÁS. A `feldolgozva` a bukott
  // hatökört is számolja (a számláló a `try` ELŐTT nő), a FOLYTATÁSI PONT viszont
  // kizárólag az igazolt (`ok` + `drive_verified_at`) napló-sorokból épül. Ha
  // tehát egy szeletben MINDEN megpróbált hatókör elbukik — lejárt Drive-token,
  // tele Drive, halott adatbázis; vagyis pont az a rendszerszintű baj, amitől
  // minden mentés bukik —, akkor a következő szelet UGYANAZT a listát UGYANONNAN
  // kezdené. A régi `feldolgozva > 0` feltétel mellett ez 60 szeleten (10 órán)
  // át ismétlődött volna: ~12 000 fölösleges hatókör-export (hatókörönként ~90
  // tábla dump + titkosítás + bukott feltöltés) ÉLESBEN, a webkiszolgáló
  // folyamatában, 0 / 784 haladás-sáv mellett — miközben a tulajdonos a saját
  // utasításunk szerint már bezárta a fület, tehát a „Leállítás" gombot senki
  // nem nyomja meg.
  if (
    !kellMegSzelet({
      osszes: 784,
      feldolgozva: 200,
      sikeres: 0,
      sikertelen: 200,
      kihagyva: 0,
      foglalt: 0,
      hatralevo: 584,
      futottVegig: false,
    })
  ) {
    ok('H9f ⭐⭐⭐ a csupa-bukás szelet NEM kér újabbat (nincs 10 órás körözés ugyanazon a listán)')
  } else {
    fail(
      'H9f: a csupa-bukás szelet újabbat kért — a futás órákig ismételné ugyanazt a bukó listát',
    )
  }

  // H9e — ⭐⭐ A BÉRLET-HATÁR PostgREST-BARÁT (2026-08-11).
  // Ez az érték egy `or=(status.neq.fut,started_at.is.null,started_at.lt.<ITT>)`
  // szűrőbe kerül, ahol a PostgREST az `oszlop.operátor.érték` hármast a
  // PONTOKON hasítja, a feltételeket pedig VESSZŐVEL választja el. Ha az érték
  // bármelyiket tartalmazná, a szűrő elemzése elromlana — és egy elromlott
  // szűrő itt NÉMÁN TÁGÍTANA: a feltételes frissítés minden sorra illeszkedne,
  // a bérlet nem védene semmit, és két párhuzamos futás UGYANAZT a gyülekezetet
  // mentené le kétszer. A második fájl ÁRVA lenne a Drive-on (a napló csak az
  // utolsó azonosítót őrzi), amit a nyesés soha nem talál meg.
  {
    const most = Date.parse('2026-08-11T15:32:07.412Z')
    const hatar = berletHatarIso(most)
    const vissza = Date.parse(hatar)
    const tiszta = !hatar.includes('.') && !hatar.includes(',') && !hatar.includes('(')
    // A vágás miatt legfeljebb egy másodperccel „régebbi" lehet a névleges
    // határnál — ez a BIZTONSÁGOS irány (inkább későbbi lejárat, mint korábbi).
    const eltolas = most - BERLET_MS - vissza
    if (tiszta && eltolas >= 0 && eltolas < 1000) {
      ok('H9e ⭐⭐ a bérlet-határ pont-/vesszőmentes (a PostgREST-szűrő nem tud némán tágítani)')
    } else {
      fail(`H9e: hatar="${hatar}" tiszta=${tiszta} eltolas=${eltolas}ms`)
    }
  }

  // H10 — a korlátok VÁGVA jönnek be: egy elgépelt env-változó nem tudja
  // átvinni a futást a 15 perces HTTP-korláton, és nem is állítja meg.
  const k1 = korlatokBeolvasasa({ nyersIdo: 99_999_999, nyersDarab: -5 })
  const k2 = korlatokBeolvasasa({ nyersIdo: 'ez nem szám', nyersDarab: undefined })
  const k3 = korlatokBeolvasasa({ nyersIdo: 5, nyersDarab: '3' })
  if (
    k1.maxFutasiIdoMs === MAX_IDOKERET_MS &&
    k1.maxHatokor === 0 &&
    k2.maxFutasiIdoMs === ALAP_IDOKERET_MS &&
    k3.maxFutasiIdoMs === MIN_IDOKERET_MS &&
    k3.maxHatokor === 3
  ) {
    ok('H10 a korlátok vágva jönnek be (elgépelt env sem borítja a mentést)')
  } else {
    fail(`H10: ${JSON.stringify({ k1, k2, k3 })}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// I — A BESZÉDES HIBAÜZENET (steps.ts)
// ═══════════════════════════════════════════════════════════════════════════
// A 2026-08-11-i hiba első fele: a tulajdonos ennyit látott: „A biztonsági
// mentés futása sikertelen." Ezek az állítások azt védik, hogy a lépés-lista és
// a teendő SOHA ne csússzon el a valóságtól.
{
  const { ujFutasLepesek, jelolLepes, exportLepesek, elsoBukottLepes, mentesTeendo, vagd } = steps

  // I1 — a HÁROM lépés-állapot különbözik. A `null` („idáig el sem jutottunk")
  // és a `true` („kész") összemosása azt sugallná, hogy a feltöltés rendben
  // volt, miközben el sem indult.
  {
    const l = exportLepesek('feltoltes')
    const bukott = elsoBukottLepes(l)
    const elotte = l.slice(0, l.findIndex((x) => x.id === 'feltoltes'))
    const utana = l.slice(l.findIndex((x) => x.id === 'feltoltes') + 1)
    if (
      bukott?.id === 'feltoltes' &&
      elotte.every((x) => x.ok === true) &&
      utana.every((x) => x.ok === null) &&
      utana.length > 0
    ) {
      ok('I1 a bukott lépés ELŐTTIEK pipát, UTÁNIAK „idáig el sem jutottunk"-ot kapnak')
    } else {
      fail(`I1: ${JSON.stringify(l.map((x) => [x.id, x.ok]))}`)
    }
  }

  // I2 — ismeretlen bukási helynél NEM TALÁLGATUNK. Minden lépés `null` marad;
  // egy kitalált diagnózis rosszabb, mint a bevallott bizonytalanság.
  {
    const l = exportLepesek(null)
    if (l.every((x) => x.ok === null) && elsoBukottLepes(l) === null) {
      ok('I2 ismeretlen bukási helynél egyetlen lépés sem kap keresztet (nincs találgatás)')
    } else {
      fail('I2: ismeretlen stage esetén is jelöltünk lépést')
    }
  }

  // I3 — sikeres hatókörnél MINDEN lépés pipa.
  {
    const l = exportLepesek(null, true)
    if (l.length === 6 && l.every((x) => x.ok === true)) {
      ok('I3 a sikeres hatókör mind a hat lépése pipát kap')
    } else {
      fail(`I3: ${l.length} lépés, ${l.filter((x) => x.ok === true).length} pipa`)
    }
  }

  // I4 — a futás-lépések kezdetben MIND jelöletlenek, és a `jelol` csak a
  // megnevezett lépést írja át (elgépelt azonosító NEM hoz létre új lépést).
  {
    const l = ujFutasLepesek()
    const hossz = l.length
    jelolLepes(l, 'leltar', true, '157 tábla')
    jelolLepes(l, 'nincs-ilyen-lepes', false)
    const leltar = l.find((x) => x.id === 'leltar')
    if (
      l.length === hossz &&
      leltar.ok === true &&
      leltar.reszlet === '157 tábla' &&
      l.filter((x) => x.ok !== null).length === 1
    ) {
      ok('I4 a jelölés csak a megnevezett lépést írja (ismeretlen azonosító nem hoz létre lépést)')
    } else {
      fail(`I4: ${JSON.stringify(l.map((x) => [x.id, x.ok]))}`)
    }
  }

  // I4b — ⭐⭐ AZ ÖT LÉPÉS-ÁLLAPOT, ÉS AMI KÖZÜLÜK HIBA (2026-08-11).
  // A háromértékű szerződés alatt az `ok: false` KÉT ártatlan dolgot is jelölt:
  //   (a) „még nem végeztünk vele" — 784 hatókörnél MINDEN köztes szelet ilyen,
  //   (b) „hiányzik, de nem végzetes" (nincs mentési jelszó, bukott takarítás).
  // Emiatt a lelkész egy HIBÁTLAN, haladó futás közben piros keresztet látott,
  // és a képernyőolvasó azt mondta: „ITT HIBÁZOTT" — nulla hiba mellett.
  // Mostantól `false` KIZÁRÓLAG valódi bukást jelenthet.
  {
    const l = ujFutasLepesek()
    jelolLepes(l, 'helyreallito', 'figyelmeztetes', 'nincs mentési jelszó')
    jelolLepes(l, 'mentes', 'folyamatban', '120 igazolt, 0 hibás, 664 hátravan')
    jelolLepes(l, 'takaritas', 'figyelmeztetes', 'a takarítás nem sikerült')

    const allapotokMegmaradtak =
      l.find((x) => x.id === 'helyreallito').ok === 'figyelmeztetes' &&
      l.find((x) => x.id === 'mentes').ok === 'folyamatban' &&
      l.find((x) => x.id === 'takaritas').ok === 'figyelmeztetes'

    if (allapotokMegmaradtak && elsoBukottLepes(l) === null) {
      ok('I4b ⭐⭐ a „folyamatban" és a „figyelmeztetés" NEM bukás — nincs piros kereszt hiba nélkül')
    } else {
      fail(
        `I4b: allapotok=${allapotokMegmaradtak} elsoBukott=${elsoBukottLepes(l)?.id ?? 'null'} — ` +
          'a normál működés hibának látszik',
      )
    }

    // …de a VALÓDI bukás továbbra is megtalálható, és ő az ELSŐ ilyen.
    jelolLepes(l, 'mentes', false, '3 hibás')
    if (elsoBukottLepes(l)?.id === 'mentes') {
      ok('I4c a valódi bukás (`false`) TOVÁBBRA IS megtalálható, és ő kapja a kiemelést')
    } else {
      fail(`I4c: elsoBukott=${elsoBukottLepes(l)?.id ?? 'null'}`)
    }
  }

  // I5 — AZ ÉLES HIBA: a besorolatlan tábla üzenetéből a HELYES SQL-fájl jön.
  // Ez a 2026-08-11-i bukás pontos szövege.
  {
    const eles =
      'BESOROLATLAN ÉLŐ TÁBLA (17 db): _merge_run_log, event, logger, mm_bookmark. ' +
      'A mentés NEM indul el, amíg ezek nincsenek felvéve a backup_table_policy táblába'
    const t = mentesTeendo(eles)
    if (t.id === 'besorolatlan_tabla' && t.sql?.includes('mentes-tabla-besorolas')) {
      ok('I5 a besorolatlan tábla üzenetéből a helyes pótló SQL-fájl jön (éles szöveggel)')
    } else {
      fail(`I5: id=${t.id} sql=${t.sql}`)
    }
  }

  // I6 — a SORREND számít: a „besorolatlan" szűkebb minta ELŐBB fogjon, mint a
  // „leltár" — különben rossz (másik) SQL-fájlt neveznénk meg.
  {
    const kevert = 'A tábla-leltár szerint BESOROLATLAN ÉLŐ TÁBLA (3 db): a, b, c'
    if (mentesTeendo(kevert).id === 'besorolatlan_tabla') {
      ok('I6 a szűkebb minta nyer: a „besorolatlan" nem esik át a „leltár" ágra')
    } else {
      fail(`I6: ${mentesTeendo(kevert).id}`)
    }
  }

  // I7 — a többi ismert hibafajta is a maga teendőjét kapja, az ismeretlen
  // pedig BEVALLJA, hogy nem tudja — nem talál ki diagnózist.
  {
    const esetek = [
      ['GYÜLEKEZETI TÁBLA ÉRVÉNYES SZŰRŐ NÉLKÜL (1 db): congregation_transfers', 'rossz_szuro'],
      ['A tábla-leltár nem tölthető be (backup_live_tables): nincs ilyen függvény', 'nincs_sql'],
      ['A mentés-rendszer SQL-migrációja még nem futott le.', 'nincs_sql'],
      ['A napló-sor létrehozása sikertelen: duplicate key', 'naplo'],
      ['A mentés titkosítási kulcsa nincs beállítva.', 'kulcs'],
      ['Valami teljesen váratlan történt a 42. sorban', 'ismeretlen'],
    ]
    const rossz = esetek.filter(([szoveg, vart]) => mentesTeendo(szoveg).id !== vart)
    if (rossz.length === 0) {
      ok('I7 minden ismert hibafajta a saját teendőjét kapja, az ismeretlen bevallja magát')
    } else {
      fail(`I7: ${rossz.map(([s, v]) => `${v}≠${mentesTeendo(s).id}`).join(', ')}`)
    }
  }

  // I8 — MINDEN teendő MONDAT, nem kód: van benne „Teendő" vagy tényleges
  // utasítás, és elég hosszú ahhoz, hogy cselekedni lehessen belőle.
  {
    const mind = [
      'BESOROLATLAN ÉLŐ TÁBLA (1 db): x',
      'GYÜLEKEZETI TÁBLA ÉRVÉNYES SZŰRŐ NÉLKÜL (1 db): x',
      'backup_live_tables hiányzik',
      'A Google Drive token lejárt',
      'ismeretlen',
    ]
    const rovid = mind.filter((s) => mentesTeendo(s).szoveg.length < 60)
    if (rovid.length === 0) {
      ok('I8 minden teendő teljes magyar mondat, amiből cselekedni lehet')
    } else {
      fail(`I8: túl rövid teendő — ${rovid.join(' | ')}`)
    }
  }

  // I9 — a vágás nem tesz olvashatatlanná: rövid szöveget érintetlenül hagy,
  // hosszút vág. Egy 50 kB-os driver-üzenet nem nyelheti el a felületet.
  {
    const hosszu = 'x'.repeat(5000)
    const v = vagd(hosszu, 100)
    if (vagd('rövid szöveg') === 'rövid szöveg' && v.length === 101 && v.endsWith('…')) {
      ok('I9 a hibaszöveg vágása jelöli a csonkolást, és a rövidet érintetlenül hagyja')
    } else {
      fail(`I9: hossz=${v.length}`)
    }
  }

  // I10 — ⛔ TITOK-SZŰRŐ: egyetlen teendő-mondat sem említhet tokent, kulcsot,
  // jelszót — sem értékkel, sem előtaggal. (A BACKUP_ENCRYPTION_KEY *neve*
  // szándékosan szerepel: azt a Railway-en kell beállítani, az nem titok.)
  {
    const tiltott = /(refresh[_ ]token|access[_ ]token|client[_ ]secret|Bearer |eyJ)/i
    const mind = [
      'BESOROLATLAN ÉLŐ TÁBLA (1 db): x',
      'A Google Drive token lejárt',
      'A napló-sor létrehozása sikertelen',
      'ismeretlen hiba',
    ].map((s) => mentesTeendo(s).szoveg)
    const szennyezett = mind.filter((s) => tiltott.test(s))
    if (szennyezett.length === 0) {
      ok('I10 egyetlen teendő-mondat sem tartalmaz titkot (token, kulcs-érték, Bearer)')
    } else {
      fail(`I10: ${szennyezett.join(' | ')}`)
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// J) A FIGYELMEZTETŐ SÁV DÖNTÉSE — „mikor szólaljon meg, és mikor ne"
//    (2026-08-11)
//
// A tulajdonos bejelentése: a mentés ELŐSZÖR futott végig (784/784, 22:16), a
// lap tetején mégis piros vész állt arról, hogy TEGNAP 784 hatókörnek nem
// készült mentése. Tegnap a rendszer még nem létezett.
//
// A veszély a javításban van, nem a hibában: egy „ne szólj az első napon"
// kivétel könnyen válik örökös elnémítássá. Ezért itt MIND A KETTŐT
// ellenőrizzük — hogy hallgat-e, amikor kell, ÉS hogy megszólal-e, amikor kell.
// ════════════════════════════════════════════════════════════════════════════
{
  const { szuletesbol, napEletkora, savDontes, napEltol, huNap } = kora

  const nap = (n) => ({
    nap: n,
    varhato: 784,
    igazolt: 0,
    hibas: 0,
    befejezetlen: 0,
    hianyzik: 784,
    problemasNevek: ['Bibarcfalvi Református Egyházközség'],
    problemasOsszesen: 784,
    letezett: true,
  })
  const teljesNap = (n) => ({ ...nap(n), igazolt: 784, hianyzik: 0, problemasNevek: [], problemasOsszesen: 0 })
  const nemLetezoNap = (n) => ({
    ...nap(n),
    varhato: 0,
    hianyzik: 0,
    problemasNevek: [],
    problemasOsszesen: 0,
    letezett: false,
  })
  const alapFriss = {
    allapot: 'friss',
    utolsoIgazoltAt: '2026-08-11T19:16:00.000Z',
    oraSzam: 1,
    driveHiba: null,
    mondat: 'Az utolsó ellenőrzött mentés: 2026. augusztus 11. 22:16.',
  }

  // J1 — A LEGKORÁBBI NYOM NYER. Az újra-összekötés NEM tolhatja előre a
  //      telepítés napját (különben egy karbantartó mozdulat elnémítaná az őrszemet).
  {
    const sz = szuletesbol({
      elsoNaploNap: '2026-08-11',
      driveOsszekotveNap: '2026-11-30', // fél évvel későbbi ÚJRA-összekötés
      jelszoBeallitvaNap: '2026-08-11',
    })
    if (sz.telepitesNap === '2026-08-11' && sz.forras === 'naplo') {
      ok('J1 a telepítés napja a LEGKORÁBBI nyomból jön (az újra-összekötés nem tolja előre)')
    } else {
      fail(`J1: ${JSON.stringify(sz)}`)
    }
  }

  // J2 — HA EGYETLEN NYOM SINCS: fail-loud, teljes szigor.
  {
    const sz = szuletesbol({ elsoNaploNap: null, driveOsszekotveNap: null, jelszoBeallitvaNap: null })
    if (sz.telepitesNap === null && napEletkora('2026-08-10', sz) === 'eles') {
      ok('J2 nyom nélkül a válasz „eles" — a „nem tudom" SOHA nem indok a hallgatásra')
    } else {
      fail(`J2: ${JSON.stringify(sz)} / ${napEletkora('2026-08-10', sz)}`)
    }
  }

  // J3 — A HÁROM ÉLETKOR pontosan a telepítés napjához igazodik.
  {
    const sz = szuletesbol({
      elsoNaploNap: '2026-08-11',
      driveOsszekotveNap: null,
      jelszoBeallitvaNap: null,
    })
    const vart = [
      ['2026-08-10', 'elotte'],
      ['2026-08-11', 'bejaratas'],
      ['2026-08-12', 'eles'],
      ['2026-09-01', 'eles'],
    ]
    const rossz = vart.filter(([n, v]) => napEletkora(n, sz) !== v)
    if (rossz.length === 0) {
      ok('J3 a bejáratás CSAK a telepítés napja — másnaptól teljes szigor')
    } else {
      fail(`J3: ${rossz.map(([n, v]) => `${n} → ${napEletkora(n, sz)} (várt: ${v})`).join(', ')}`)
    }
  }

  // J4 — A TULAJDONOS ESETE. 2026-08-12, tegnap (08-11) = a telepítés napja,
  //      MA teljes → a sáv NEM vész, és nem is beszél nem létező múltról.
  {
    const sz = szuletesbol({
      elsoNaploNap: '2026-08-11',
      driveOsszekotveNap: '2026-08-11',
      jelszoBeallitvaNap: '2026-08-11',
    })
    const h = savDontes({
      alap: alapFriss,
      tegnap: teljesNap('2026-08-11'),
      ma: teljesNap('2026-08-12'),
      szuletes: sz,
    })
    if (h.allapot === 'friss' && !/NEM készült/.test(h.mondat)) {
      ok('J4 teljes tegnap + teljes ma → a sáv néma (nincs piros vész a jó napon)')
    } else {
      fail(`J4: ${h.allapot} / ${h.mondat}`)
    }
  }

  // J5 — A BEJELENTETT HIBA. 2026-08-11-én maga a nap: tegnap (08-10) NEM
  //      LÉTEZETT, ma 784/784 → tájékoztató mondat, NEM „784 hatókörnek nem készült".
  {
    const sz = szuletesbol({
      elsoNaploNap: '2026-08-11',
      driveOsszekotveNap: '2026-08-11',
      jelszoBeallitvaNap: '2026-08-11',
    })
    const h = savDontes({
      alap: alapFriss,
      tegnap: nemLetezoNap('2026-08-10'),
      ma: teljesNap('2026-08-11'),
      szuletes: sz,
    })
    const jo =
      h.allapot === 'friss' &&
      !/NEM készült ellenőrzött mentése/.test(h.mondat) &&
      /még nem működött|indult el/.test(h.mondat)
    if (jo) ok('J5 a születés ELŐTTI napot nem kéri számon — a mondat tájékoztat, nem riaszt')
    else fail(`J5: ${h.allapot} / ${h.mondat}`)
  }

  // J6 — ⚠️ A LEGFONTOSABB: A KIVÉTEL LEJÁR. Ugyanaz a telepítési dátum, de
  //      három nappal később és üres tegnappal → a vésznek MEG KELL SZÓLALNIA.
  {
    const sz = szuletesbol({
      elsoNaploNap: '2026-08-11',
      driveOsszekotveNap: '2026-08-11',
      jelszoBeallitvaNap: '2026-08-11',
    })
    const h = savDontes({
      alap: alapFriss,
      tegnap: nap('2026-08-14'),
      ma: nap('2026-08-15'),
      szuletes: sz,
    })
    if (h.allapot === 'kritikus' && /NEM készült ellenőrzött mentése/.test(h.mondat)) {
      ok('J6 a bejáratási kivétel LEJÁR — napokkal később a vész megszólal')
    } else {
      fail(`J6: ${h.allapot} / ${h.mondat}`)
    }
  }

  // J7 — A SÁV KIMONDJA A MAI ÁLLÁST IS. Egy őrszem, ami elhallgatja a jó hírt,
  //      ugyanúgy félrevezet, mint amelyik elhallgatja a rosszat.
  {
    const sz = szuletesbol({ elsoNaploNap: '2026-01-01', driveOsszekotveNap: null, jelszoBeallitvaNap: null })
    const h = savDontes({
      alap: alapFriss,
      tegnap: nap('2026-08-14'),
      ma: teljesNap('2026-08-15'),
      szuletes: sz,
    })
    if (/Ma mind a\(z\) 784/.test(h.mondat)) {
      ok('J7 a sáv a TEGNAPI baj mellett a MAI állást is kimondja')
    } else {
      fail(`J7: ${h.mondat}`)
    }
  }

  // J8 — A „(20)" ELLENTMONDÁS VÉGE. A toldalék a TELJES darabszámból számol,
  //      nem a 20-ra csonkolt névlistából.
  {
    const sz = szuletesbol({ elsoNaploNap: '2026-01-01', driveOsszekotveNap: null, jelszoBeallitvaNap: null })
    const tegnap = { ...nap('2026-08-14'), problemasNevek: Array.from({ length: 20 }, (_, i) => `Gy${i}`) }
    const h = savDontes({ alap: alapFriss, tegnap, ma: nap('2026-08-15'), szuletes: sz })
    if (/és még 779/.test(h.mondat)) {
      ok('J8 a névlista-toldalék a TELJES számból számol (nincs „5 név és még 15" 784 mellett)')
    } else {
      fail(`J8: ${h.mondat}`)
    }
  }

  // J9 — AZ ERŐSEBB IGAZSÁGOT NEM ÍRJUK FELÜL: ha SOHA nem volt igazolt mentés,
  //      a „MÉG EGYETLEN … SEM KÉSZÜLT" mondat marad, bejáratás ide vagy oda.
  {
    const sz = szuletesbol({ elsoNaploNap: null, driveOsszekotveNap: '2026-08-11', jelszoBeallitvaNap: null })
    const alap = {
      allapot: 'nincs_mentes',
      utolsoIgazoltAt: null,
      oraSzam: null,
      driveHiba: null,
      mondat: 'MÉG EGYETLEN ELLENŐRZÖTT BIZTONSÁGI MENTÉS SEM KÉSZÜLT.',
    }
    const h = savDontes({
      alap,
      tegnap: nemLetezoNap('2026-08-10'),
      ma: nap('2026-08-11'),
      szuletes: sz,
    })
    if (h.allapot === 'nincs_mentes' && h.mondat === alap.mondat) {
      ok('J9 a „még soha nem volt mentés" állítást a bejáratás NEM némítja el')
    } else {
      fail(`J9: ${h.allapot} / ${h.mondat}`)
    }
  }

  // J10 — naptári segédek (a bejáratás lejárata ezen áll vagy bukik).
  {
    const bajok = []
    if (napEltol('2026-02-28', 1) !== '2026-03-01') bajok.push('napEltol nem-szökőév')
    if (napEltol('2026-01-01', -1) !== '2025-12-31') bajok.push('napEltol évforduló')
    if (napEltol('2026-10-25', 1) !== '2026-10-26') bajok.push('napEltol óraátállítás napja')
    if (huNap('2026-08-11') !== '2026. 08. 11.') bajok.push('huNap')
    if (bajok.length === 0) ok('J10 naptári segédek (hónap-, év- és óraátállítás-határon is)')
    else fail(`J10: ${bajok.join(', ')}`)
  }

  // J11 — ⚠️ KÉT FELÜLET, EGY DÁTUM. A sáv és az áttekintő KÁRTYA ugyanarról a
  //      szabályról KÉT dátumot mondott: a sáv „2026. 08. 13.-tól ez már hibának
  //      számít", a kártya „2026. 08. 12.-tól viszont minden hiányzó előző nap
  //      hibának számít". A kártya az `elsoSzamonkertNap`-ot (a SZÁMONKÉRT napot)
  //      összemosta a SZÁMONKÉRÉS napjával. A `elsoSzigoruSavNap` mező ezt
  //      szerkezetileg zárja ki — de csak akkor, ha MINDKÉT felület azt olvassa.
  {
    const bajok = []
    const sz = szuletesbol({
      elsoNaploNap: '2026-08-11',
      driveOsszekotveNap: null,
      jelszoBeallitvaNap: null,
    })
    if (sz.elsoSzamonkertNap !== '2026-08-12') bajok.push(`elsoSzamonkertNap=${sz.elsoSzamonkertNap}`)
    if (sz.elsoSzigoruSavNap !== '2026-08-13') bajok.push(`elsoSzigoruSavNap=${sz.elsoSzigoruSavNap}`)
    if (sz.elsoSzigoruSavNap !== napEltol(sz.elsoSzamonkertNap, 1)) {
      bajok.push('a két mező nem egy naptári nappal tér el')
    }
    // A SÁV mondata (bejáratási ág, 08-12-én nézve: tegnap = 08-11 = telepítés napja).
    const h = savDontes({
      alap: alapFriss,
      tegnap: nap('2026-08-11'),
      ma: nap('2026-08-12'),
      szuletes: sz,
    })
    if (!h.mondat.includes(`${huNap(sz.elsoSzigoruSavNap)}-tól ez már hibának számít`)) {
      bajok.push(`sáv-mondat: ${h.mondat}`)
    }
    // A KÁRTYA — forrásszöveg-őrszem. A komponens TSX, ezt a keret nem fordítja
    // le; ezért azt ellenőrizzük, hogy a mondat a KÖZÖS mezőből épül, és hogy a
    // régi, egy nappal korábbi számítás nem tért vissza.
    const kartya = fs.readFileSync(
      path.join(REPO_ROOT, 'apps', 'web', 'components', 'admin', 'backup', 'backup-overview-card.tsx'),
      'utf8',
    )
    if (!kartya.includes('huNap(szuletes.elsoSzigoruSavNap)')) {
      bajok.push('a kártya NEM az elsoSzigoruSavNap mezőt írja ki')
    }
    if (kartya.includes('${huNap(szuletes.elsoSzamonkertNap)}-tól viszont')) {
      bajok.push('a kártya visszakapta a saját, egy nappal korábbi számítását')
    }
    if (bajok.length === 0) {
      ok('J11 a sáv és az áttekintő kártya UGYANAZT a szigorodási dátumot mondja')
    } else {
      fail(`J11: ${bajok.join(' · ')}`)
    }
  }

  // J12 — ⚠️ A BEJÁRATÁSI ABLAK NEM NYÍLHAT KI ÚJRA. Ha a napló-lekérdezés
  //      HIBÁZOTT (nem: üres volt), a születés SOHA nem eshet vissza a
  //      felülírható `drive_connected_at` / `passphrase_set_at` nyomokra —
  //      különben egy fél évvel későbbi Drive-újracsatlakozás + egy tranziens
  //      napló-hiba együtt „ma telepítettük" állapotba vinné a rendszert, és a
  //      sáv elhallgatná a tegnapi hiányt.
  {
    const sz = szuletesbol({
      elsoNaploNap: null,
      driveOsszekotveNap: '2026-09-15', // ÚJRA-összekötés, felülírt időbélyeg
      jelszoBeallitvaNap: '2026-09-15',
      naploOlvashato: false,
    })
    const kor = napEletkora('2026-09-14', sz)
    if (sz.telepitesNap === null && sz.naploOlvashato === false && kor === 'eles') {
      ok('J12 olvashatatlan napló → teljes szigor (a felülírható nyomok NEM vehetik át)')
    } else {
      fail(`J12: ${JSON.stringify(sz)} / ${kor}`)
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nBiztonsági mentés önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nBiztonsági mentés önellenőrzés: minden zöld')
