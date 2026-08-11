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

let container, keys, payload, inventory
try {
  container = loadTs(SOURCES.container, 'container')
  keys = loadTs(SOURCES.keys, 'keys')
  payload = loadTs(SOURCES.payload, 'payload')
  inventory = loadTs(SOURCES.inventory, 'inventory')
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
  // A cron 23:00 UTC-kor indul → helyi idő szerint MÁSNAP 02:00.
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

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nBiztonsági mentés önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nBiztonsági mentés önellenőrzés: minden zöld')
