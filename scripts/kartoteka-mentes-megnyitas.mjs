#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * KARTOTÉKA — MENTÉS MEGNYITÁSA (önálló, 2026-08-11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MIÉRT LÉTEZIK EZ A FÁJL
 * ───────────────────────
 * Egy biztonsági mentés akkor ér valamit, ha AKKOR IS megnyitható, amikor MÁR
 * SEMMI MÁS NINCS MEG: se a Kartotéka, se a szerver, se a Railway környezeti
 * változói, se az internet. Ez a szkript pontosan ezt tudja.
 *
 * KELL HOZZÁ:  Node.js (18+) és a MENTÉSI JELSZÓ. Semmi más.
 *              Nincs npm install, nincs függőség, nincs hálózat.
 *
 * HASZNÁLAT
 * ─────────
 *   node kartoteka-mentes-megnyitas.mjs <fajl.kbk>              # tartalomjegyzék
 *   node kartoteka-mentes-megnyitas.mjs <fajl.kbk> --kiir mappa # kiírás JSON-ba
 *   node kartoteka-mentes-megnyitas.mjs <fajl.kbk> --tabla szemely
 *
 * A jelszót a szkript BEKÉRI (nem parancssori paraméter — az bekerülne a
 * shell-előzménybe). Ha a jelszó nem nyitja a fájlt, megpróbálja a szerver-
 * kulcsot a BACKUP_ENCRYPTION_KEY környezeti változóból — de CSAK ha az be van
 * állítva, és ezt KI IS MONDJA.
 *
 * ⚠️ EZT A FÁJLT TEDD A MENTÉSEK MELLÉ (Google Drive mappa, pendrive, kinyomtatva
 *    a széfbe a jelszóval együtt). Egy visszafejtő, ami csak a szerveren van,
 *    pont akkor hiányzik, amikor a szerver nincs meg.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A FORMÁTUM (KBK1) — röviden, hogy 10 év múlva is újraírható legyen
 * ════════════════════════════════════════════════════════════════════════════
 *   "KBK1"                  4 bájt
 *   fejléc-hossz            4 bájt, big-endian u32
 *   fejléc                  UTF-8 JSON, TITKOSÍTATLAN
 *   keretek                 [u32 BE ct_hossz][ciphertext][16 bájt GCM tag] …
 *
 *   nonce  = fejléc.nonce_prefix (4 bájt) ‖ keret-index (8 bájt BE)
 *   AAD    = "KBK1|<fájl-uuid>|<keret-index>|<0 vagy 1 = ez az utolsó>"
 *   tartalom = gzip(NDJSON)
 *
 * A DEK (adatkulcs) HÁROM módon lehet a fejlécben:
 *   dek_jelszo         — közvetlenül a mentési jelszóval burkolva (kézi mentés),
 *   dek_helyreallito   — a helyreállító nyilvános kulcshoz pecsételve, ÉS
 *   helyreallito_kulcs — a helyreállító TITKOS kulcs, a jelszóval burkolva
 *                        (ez a NAPI, felügyelet nélküli mentések útja),
 *   dek_szerver        — a szerver BACKUP_ENCRYPTION_KEY-ével burkolva.
 */

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import zlib from 'node:zlib'
import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  scryptSync,
} from 'node:crypto'

const KBK_MAGIC = 'KBK1'
const GCM_TAG_BYTES = 16
const NONCE_PREFIX_BYTES = 4
const NONCE_BYTES = 12
const HKDF_INFO_DEK = 'kartoteka-backup-dek-v1'
const HKDF_INFO_RECOVERY = 'kartoteka-backup-recovery-v1'
const SCRYPT_MAX_N = 1048576

const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex')
const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex')

// ─────────────────────────────────────────────────────────────────────────────
// Kriptó-segédek — BETŰRE azonosak a lib/backup/keys.ts-ben lévőkkel
// ─────────────────────────────────────────────────────────────────────────────

function gcmOpen(key, iv, tag, ct, aad) {
  const d = createDecipheriv('aes-256-gcm', key, iv)
  d.setAAD(Buffer.from(aad, 'utf8'))
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()])
}

function hkdf32(master, salt, info) {
  return Buffer.from(hkdfSync('sha256', master, salt, Buffer.from(info, 'utf8'), 32))
}

function scryptKek(passphrase, salt, params) {
  if (!Number.isInteger(params.N) || params.N < 2 || params.N > SCRYPT_MAX_N) {
    throw new Error(`Érvénytelen scrypt N: ${params.N}`)
  }
  const maxmem = Math.max(64 * 1024 * 1024, 128 * params.N * params.r * 2)
  return scryptSync(Buffer.from(String(passphrase).normalize('NFC'), 'utf8'), salt, 32, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem,
  })
}

const b64 = (s) => Buffer.from(String(s), 'base64')

function unwrapDekWithPassphrase(w, passphrase, fileId) {
  const kek = scryptKek(passphrase, b64(w.salt), { N: w.N, r: w.r, p: w.p })
  return gcmOpen(kek, b64(w.iv), b64(w.tag), b64(w.ct), `pw|${fileId}`)
}

function unwrapRecoveryPrivateKey(w, passphrase) {
  const kek = scryptKek(passphrase, b64(w.salt), { N: w.N, r: w.r, p: w.p })
  const priv = gcmOpen(kek, b64(w.iv), b64(w.tag), b64(w.ct), `reckey|${w.pub}`)
  return { privateRaw: priv, publicRaw: b64(w.pub) }
}

function unwrapDekWithRecoveryKey(w, fileId, privateRaw, publicRaw) {
  const ephRaw = b64(w.epk)
  const shared = diffieHellman({
    privateKey: createPrivateKey({
      key: Buffer.concat([X25519_PKCS8_PREFIX, privateRaw]),
      format: 'der',
      type: 'pkcs8',
    }),
    publicKey: createPublicKey({
      key: Buffer.concat([X25519_SPKI_PREFIX, ephRaw]),
      format: 'der',
      type: 'spki',
    }),
  })
  const kek = hkdf32(Buffer.from(shared), Buffer.concat([ephRaw, publicRaw]), HKDF_INFO_RECOVERY)
  return gcmOpen(kek, b64(w.iv), b64(w.tag), b64(w.ct), `rec|${fileId}`)
}

function unwrapDekWithServerKey(w, fileId, master) {
  const kek = hkdf32(master, b64(w.salt), HKDF_INFO_DEK)
  return gcmOpen(kek, b64(w.iv), b64(w.tag), b64(w.ct), `srv|${fileId}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Konténer
// ─────────────────────────────────────────────────────────────────────────────

function parseHeader(bytes) {
  if (bytes.length < 8) throw new Error('CSONKA FÁJL: a fejléc-hossz sem fér el.')
  const magic = bytes.subarray(0, 4).toString('latin1')
  if (magic !== KBK_MAGIC) {
    throw new Error(`Ez nem KARTOTÉKA mentés-fájl (magic: „${magic}", várt: „${KBK_MAGIC}").`)
  }
  const len = bytes.readUInt32BE(4)
  if (len === 0 || len > 64 * 1024) throw new Error(`Érvénytelen fejléc-hossz: ${len}`)
  if (bytes.length < 8 + len) throw new Error('CSONKA FÁJL: a fejléc nem fér el.')
  const header = JSON.parse(bytes.subarray(8, 8 + len).toString('utf8'))
  if (header.v !== 1) throw new Error(`Ismeretlen konténer-verzió: ${header.v}`)
  return { header, bodyOffset: 8 + len }
}

function decryptChunks(body, dek, header) {
  const prefix = b64(header.nonce_prefix)
  if (prefix.length !== NONCE_PREFIX_BYTES) throw new Error('Hibás nonce-előtag a fejlécben.')
  if (body.length === 0) throw new Error('CSONKA FÁJL: nincs egyetlen keret sem.')

  const parts = []
  let offset = 0
  let index = 0
  while (offset < body.length) {
    if (offset + 4 > body.length) throw new Error(`CSONKA FÁJL: a(z) ${index}. keret fejléce hiányos.`)
    const ctLen = body.readUInt32BE(offset)
    const frameEnd = offset + 4 + ctLen + GCM_TAG_BYTES
    if (ctLen > header.chunk_plain_bytes || frameEnd > body.length) {
      throw new Error(`CSONKA FÁJL: a(z) ${index}. keret nem fér el.`)
    }
    const ct = body.subarray(offset + 4, offset + 4 + ctLen)
    const tag = body.subarray(offset + 4 + ctLen, frameEnd)
    const isLast = frameEnd === body.length

    const nonce = Buffer.alloc(NONCE_BYTES)
    prefix.copy(nonce, 0, 0, NONCE_PREFIX_BYTES)
    nonce.writeBigUInt64BE(BigInt(index), NONCE_PREFIX_BYTES)

    let plain
    try {
      plain = gcmOpen(dek, nonce, tag, ct, `${KBK_MAGIC}|${header.id}|${index}|${isLast ? 1 : 0}`)
    } catch {
      throw new Error(
        `A(z) ${index}. keret hitelesítése SIKERTELEN. A fájl sérült, levágott, ` +
          'átrendezett, vagy nem ehhez a kulcshoz tartozik.',
      )
    }
    parts.push(plain)
    offset = frameEnd
    index += 1
  }
  return Buffer.concat(parts)
}

// ─────────────────────────────────────────────────────────────────────────────
// A DEK megszerzése — HÁROM ÚT, ebben a sorrendben
// ─────────────────────────────────────────────────────────────────────────────

function szerezDek(header, passphrase) {
  // 1) A jelszó KÖZVETLEN burkolata (kézi / visszaállítás előtti mentések).
  if (passphrase && header.dek_jelszo) {
    try {
      return { dek: unwrapDekWithPassphrase(header.dek_jelszo, passphrase, header.id), mod: 'mentési jelszó' }
    } catch {
      /* megyünk tovább */
    }
  }
  // 2) HELYREÁLLÍTÓ KULCS-LETÉT — a NAPI, felügyelet nélküli mentések útja.
  //    A burkolt titkos kulcs MAGÁBAN A FÁJLBAN van: se szerver, se adatbázis.
  if (passphrase && header.dek_helyreallito && header.helyreallito_kulcs) {
    try {
      const par = unwrapRecoveryPrivateKey(header.helyreallito_kulcs, passphrase)
      return {
        dek: unwrapDekWithRecoveryKey(header.dek_helyreallito, header.id, par.privateRaw, par.publicRaw),
        mod: 'mentési jelszó (helyreállító kulcs)',
      }
    } catch {
      /* megyünk tovább */
    }
  }
  // 3) SZERVER-KULCS. Csak ha a környezeti változó be van állítva.
  const raw = (process.env.BACKUP_ENCRYPTION_KEY || '').trim()
  if (raw) {
    const master = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
    if (master.length === 32) {
      try {
        return { dek: unwrapDekWithServerKey(header.dek_szerver, header.id, master), mod: 'szerver-kulcs' }
      } catch {
        /* megyünk tovább */
      }
    }
  }

  const utak = []
  if (header.dek_jelszo) utak.push('közvetlen jelszavas burkolat')
  if (header.dek_helyreallito && header.helyreallito_kulcs) utak.push('helyreállító kulcs (jelszóval)')
  utak.push('szerver-kulcs (BACKUP_ENCRYPTION_KEY)')
  throw new Error(
    'A fájl NEM nyitható meg a megadott jelszóval.\n' +
      `Ebben a fájlban a következő utak vannak: ${utak.join(', ')}.\n` +
      (header.dek_jelszo || header.dek_helyreallito
        ? 'Ellenőrizd a MENTÉSI jelszót (ez NEM a bejelentkezési jelszó). Ha a jelszót a fájl készítése ÓTA cserélted, a RÉGI jelszó kell hozzá.'
        : 'Ez a fájl a helyreállító kulcs bevezetése ELŐTT készült: kizárólag a szerver BACKUP_ENCRYPTION_KEY-ével nyitható. Állítsd be a környezeti változót, és futtasd újra.'),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fő program
// ─────────────────────────────────────────────────────────────────────────────

function jelszotKer(kerdes) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    // A beírt jelszó ne látszódjon a terminálon.
    const onData = (ch) => {
      const s = String(ch)
      if (s === '\n' || s === '\r' || s === '') {
        process.stdin.removeListener('data', onData)
      } else {
        process.stdout.write('[2K[200D' + kerdes + '*'.repeat(rl.line.length))
      }
    }
    process.stdin.on('data', onData)
    rl.question(kerdes, (valasz) => {
      rl.close()
      process.stdout.write('\n')
      resolve(valasz)
    })
  })
}

async function main() {
  const args = process.argv.slice(2)
  const fajl = args.find((a) => !a.startsWith('--'))
  if (!fajl) {
    console.log(
      'Használat:\n' +
        '  node kartoteka-mentes-megnyitas.mjs <fajl.kbk>\n' +
        '  node kartoteka-mentes-megnyitas.mjs <fajl.kbk> --kiir <mappa>\n' +
        '  node kartoteka-mentes-megnyitas.mjs <fajl.kbk> --tabla <tablanev>\n',
    )
    process.exit(1)
  }
  if (!fs.existsSync(fajl)) {
    console.error(`Nincs ilyen fájl: ${fajl}`)
    process.exit(1)
  }

  const kiirIdx = args.indexOf('--kiir')
  const kiirMappa = kiirIdx >= 0 ? args[kiirIdx + 1] : null
  const tablaIdx = args.indexOf('--tabla')
  const csakTabla = tablaIdx >= 0 ? args[tablaIdx + 1] : null

  const bytes = fs.readFileSync(fajl)
  const { header, bodyOffset } = parseHeader(bytes)

  console.log(`Fájl:        ${path.basename(fajl)}`)
  console.log(`Készült:     ${header.keszult}`)
  console.log(`Környezet:   ${header.env}`)
  console.log(`Tároló:      ${header.tarolo || '(nincs rögzítve)'}`)
  console.log(`Kulcs-utak:  ${[
    header.dek_jelszo ? 'jelszó' : null,
    header.dek_helyreallito && header.helyreallito_kulcs ? 'helyreállító kulcs' : null,
    'szerver-kulcs',
  ]
    .filter(Boolean)
    .join(', ')}`)
  console.log('')

  const passphrase = await jelszotKer('Mentési jelszó: ')

  const { dek, mod } = szerezDek(header, passphrase)
  console.log(`Megnyitva ezzel: ${mod}.`)

  const gzipped = decryptChunks(bytes.subarray(bodyOffset), dek, header)
  const ndjson = zlib.gunzipSync(gzipped)

  // A hasznos teher NDJSON: 1. sor = manifest, utolsó = záró sor, közte adatsorok.
  const sorok = ndjson.toString('utf8').split('\n').filter((s) => s.length > 0)
  if (sorok.length < 2) throw new Error('A hasznos teher hiányos (nincs manifest vagy záró sor).')

  // Az ELSŐ sor alakja: `{ "manifest": { … } }` (lásd lib/backup/payload.ts).
  const elsoSor = JSON.parse(sorok[0])
  const manifest = elsoSor.manifest ?? elsoSor
  const zaro = JSON.parse(sorok[sorok.length - 1])
  if (zaro.vege !== true) {
    throw new Error('HIÁNYZIK A ZÁRÓ SOR: a fájl csonka, nem szabad belőle visszaállítani.')
  }

  console.log('')
  console.log(`Gyülekezet:  ${manifest.congregation_nev || manifest.hatokor}`)
  console.log(`Mentés napja: ${manifest.run_date} (${manifest.kind})`)
  console.log(`Összes sor:  ${zaro.sorok}`)
  console.log('')
  console.log('Táblák:')
  const tablaNevek = Object.keys(manifest.tablak || {}).sort()
  for (const t of tablaNevek) {
    console.log(`  ${t.padEnd(38)} ${String(manifest.tablak[t].sorok).padStart(8)} sor`)
  }

  if (manifest.media_fajl) {
    console.log('')
    console.log(
      `⚠️ A FÉNYKÉPEK KÜLÖN FÁJLBAN vannak (${manifest.media_fajl.darab} db), ` +
        'azonosító: ' + (manifest.media_fajl.drive_file_id || '(ismeretlen)') + '.',
    )
  }
  if (manifest.kimaradt?.storage_bucketek?.length) {
    console.log(`⚠️ NINCS a mentésben: ${manifest.kimaradt.storage_bucketek.join(', ')} (feltöltött fájlok).`)
  }

  if (!kiirMappa && !csakTabla) {
    console.log('')
    console.log('Kiírás JSON-ba:  --kiir <mappa>      |  Egy tábla:  --tabla <nev>')
    return
  }

  // Sorok táblánként.
  const perTabla = new Map()
  for (let i = 1; i < sorok.length - 1; i += 1) {
    const rec = JSON.parse(sorok[i])
    // A hasznos teher sorai `{ t: <tabla>, r: <sor> }` alakúak.
    const nev = rec.t ?? rec.tabla
    const ertek = rec.r ?? rec.sor
    if (!nev) continue
    if (csakTabla && nev !== csakTabla) continue
    const lista = perTabla.get(nev)
    if (lista) lista.push(ertek)
    else perTabla.set(nev, [ertek])
  }

  if (csakTabla && !kiirMappa) {
    console.log('')
    console.log(JSON.stringify(perTabla.get(csakTabla) ?? [], null, 2))
    return
  }

  fs.mkdirSync(kiirMappa, { recursive: true })
  for (const [nev, lista] of perTabla) {
    const cel = path.join(kiirMappa, `${nev}.json`)
    fs.writeFileSync(cel, JSON.stringify(lista, null, 2), 'utf8')
    console.log(`  → ${cel} (${lista.length} sor)`)
  }
  fs.writeFileSync(path.join(kiirMappa, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  console.log('')
  console.log('⚠️ A kiírt JSON-ok NYERS SZEMÉLYES ADATOT tartalmaznak (név, CNP, cím).')
  console.log('   Titkosítatlanul vannak a lemezen — ha végeztél, TÖRÖLD ŐKET.')
}

main().catch((e) => {
  console.error('')
  console.error(String(e?.message || e))
  process.exit(1)
})
