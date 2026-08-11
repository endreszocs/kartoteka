/**
 * A mentés HASZNOS TERHE — NDJSON + manifest + bizonyíték (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A FORMÁTUM
 * ════════════════════════════════════════════════════════════════════════════
 *   {"manifest": { … }}                      ← ELSŐ sor
 *   {"t":"szemely","r":{ …TELJES sor… }}
 *   {"t":"szemely","r":{ … }}
 *   …
 *   {"vege":true,"sorok":38412,"sha256_nyers":"<hex>"}   ← UTOLSÓ sor
 *
 * NDJSON, mert soronként olvasható és soronként ellenőrizhető: egy sérült sor
 * NEM teszi értelmezhetetlenné az egész fájlt, és a visszaolvasás nem igényel
 * egy 30 MB-os JSON-tömb memóriába emelését.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT A NYERS SORSZÖVEGET HASHELJÜK (és nem az objektumot)
 * ════════════════════════════════════════════════════════════════════════════
 * A táblánkénti SHA-256 a SOR SZÖVEGÉRE megy, pontosan úgy, ahogy a fájlba
 * került. Ha az objektumot hashelnénk újra-sorosítás után, a JSON kulcs-sorrend
 * bármely eltérése (más driver-verzió, egész-szerű kulcsnév) HAMIS eltérést
 * jelentene — a bizonyíték zajjá válna, és megtanulnánk figyelmen kívül hagyni.
 * Így viszont a „kiírt == visszaolvasott" összevetés BÁJTRA pontos.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * Ez a fájl NULLA projekt-importot használ (csak `node:crypto` + `node:zlib`) —
 * a `scripts/selftest-backup.mjs` önmagában betölti és teszteli.
 */

import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'

import type {
  BackupEnvLabel,
  BackupKind,
  BackupManifest,
  BackupOmissions,
  BackupPayloadFooter,
  BackupScope,
  BackupTableStat,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Dátum — a napi kulcs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A futás napja Europe/Bucharest HELYI idő szerint, `YYYY-MM-DD` alakban.
 *
 * ⚠️ MIÉRT NEM UTC: a cron 23:00 UTC-kor indul, ami helyi idő szerint MÁSNAP
 *    02:00. UTC-dátummal a napi mentés a lelkész naptára szerint mindig az
 *    ELŐZŐ napra könyvelődne, és az „egy nap = egy mentés" egyediségi index
 *    egy nap eltolódással védene. A felület pedig azt írná: tegnap óta nincs
 *    mentés — miközben egy órája készült.
 */
export function bucharestRunDate(now: Date = new Date()): string {
  try {
    // `en-CA` azért, mert ez ad ISO-alakot (YYYY-MM-DD) minden Node-verzióban.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Bucharest',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch (e: unknown) {
    // ICU nélküli Node: inkább UTC-dátum, mint semmi — de HANGOSAN jelezve.
    // ⚠️ 2026-08-11: a „HANGOSAN" korábban CSAK a kommentben szerepelt, a kód
    //    némán tért vissza. Egy néma zóna-visszaesés a napi kulcsot tolná el egy
    //    nappal — pontosan az a hibaosztály, amit ez a projekt már megtapasztalt.
    console.error(
      '[backup] Nincs Europe/Bucharest zóna-adat (ICU nélküli Node?). A napi kulcs UTC-dátumra esik vissza, ' +
        'ami éjfél és 03:00 között ELŐZŐ napra könyvelné a mentést.',
      e instanceof Error ? e.message : e,
    )
    return now.toISOString().slice(0, 10)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorok
// ─────────────────────────────────────────────────────────────────────────────

/** Egy adatsor kanonikus NDJSON-alakja (záró sortörés NÉLKÜL). */
export function rowLine(tabla: string, row: unknown): string {
  return JSON.stringify({ t: tabla, r: row })
}

export interface PayloadTableInput {
  tabla: string
  sorok: Array<Record<string, unknown>>
}

export interface BuildPayloadInput {
  hatokor: BackupScope
  congregationId: string | null
  congregationNev: string | null
  kind: BackupKind
  runDate: string
  env: BackupEnvLabel
  semaUjjlenyomat: string
  kimaradt: BackupOmissions
  mediaFajl: BackupManifest['media_fajl']
  /** A táblák a HÍVÓ által meghatározott (determinisztikus) sorrendben. */
  tablak: PayloadTableInput[]
  /** Csak teszthez: rögzített időbélyeg. */
  keszult?: string
}

export interface BuiltPayload {
  /** A teljes, gzip ELŐTTI hasznos teher. */
  ndjson: Buffer
  manifest: BackupManifest
  footer: BackupPayloadFooter
  rowCounts: Record<string, number>
  totalRows: number
}

/**
 * A magyarázat, amit a mentés MAGÁVAL VISZ. Ha valaki két év múlva megnyitja a
 * fájlt, ebből tudja meg, mi NINCS benne — nem a dokumentációból, ami addigra
 * elveszik.
 */
export const MANIFEST_FIGYELMEZTETES =
  'ADAT-helyreállítás, NEM teljes rendszer-helyreállítás. A feltöltött FÁJLOK ' +
  '(iktatói szkennek, dokumentumok) és a belépési jelszavak NINCSENEK ebben a ' +
  'fájlban; az adatbázis szerkezete (jogosultsági szabályok, függvények) sem.'

/**
 * Összeállítja a hasznos tehert, és VELE EGYÜTT a bizonyítékot.
 *
 * A manifest az ELSŐ sor, ezért a táblánkénti hasheket ELŐBB kiszámoljuk, és
 * csak utána írjuk ki a fájlt. Egy gyülekezet 2-30 MB — ez elfér a memóriában,
 * és cserébe a fájl ÖNMAGÁT bizonyítja: nem kell hozzá külső jegyzőkönyv.
 */
export function buildPayload(input: BuildPayloadInput): BuiltPayload {
  const tablak: Record<string, BackupTableStat> = {}
  const rowCounts: Record<string, number> = {}
  const rowChunks: string[] = []
  const teljesHash = createHash('sha256')
  let totalRows = 0

  for (const t of input.tablak) {
    const tablaHash = createHash('sha256')
    for (const row of t.sorok) {
      const line = `${rowLine(t.tabla, row)}\n`
      rowChunks.push(line)
      tablaHash.update(line, 'utf8')
      teljesHash.update(line, 'utf8')
    }
    tablak[t.tabla] = { sorok: t.sorok.length, sha256: tablaHash.digest('hex') }
    rowCounts[t.tabla] = t.sorok.length
    totalRows += t.sorok.length
  }

  const manifest: BackupManifest = {
    formatum: 1,
    keszult: input.keszult ?? new Date().toISOString(),
    env: input.env,
    hatokor: input.hatokor,
    congregation_id: input.congregationId,
    congregation_nev: input.congregationNev,
    kind: input.kind,
    run_date: input.runDate,
    sema_ujjlenyomat: input.semaUjjlenyomat,
    tablak,
    media_fajl: input.mediaFajl,
    kimaradt: input.kimaradt,
    figyelmeztetes: MANIFEST_FIGYELMEZTETES,
  }

  const footer: BackupPayloadFooter = {
    vege: true,
    sorok: totalRows,
    sha256_nyers: teljesHash.digest('hex'),
  }

  const ndjson = Buffer.from(
    `${JSON.stringify({ manifest })}\n${rowChunks.join('')}${JSON.stringify(footer)}\n`,
    'utf8',
  )

  return { ndjson, manifest, footer, rowCounts, totalRows }
}

// ─────────────────────────────────────────────────────────────────────────────
// Visszaolvasás
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedPayload {
  manifest: BackupManifest
  footer: BackupPayloadFooter
  /** Táblánkénti sorszám, AHOGY A FÁJLBAN VAN (nem ahogy a manifest állítja). */
  rowCounts: Record<string, number>
  /** Táblánkénti SHA-256 a fájlból újraszámolva. */
  tableHashes: Record<string, string>
  totalRows: number
  sha256Nyers: string
  /** Csak akkor van kitöltve, ha `collectRows: true`. A visszaállításnak kell. */
  rows: Record<string, Array<Record<string, unknown>>> | null
}

/**
 * Visszaolvassa a hasznos tehert, ÚJRASZÁMOLVA minden bizonyítékot.
 *
 * Fail-closed minden lépésen: hiányzó manifest, hiányzó záró sor, ismeretlen
 * sor-alak — mind HIBA. Egy „majdnem teljes" mentés a legveszélyesebb dolog,
 * amit ez a rendszer előállíthat, mert megbízhatónak látszik.
 */
export function parsePayload(
  ndjson: Buffer,
  opts: { collectRows?: boolean } = {},
): ParsedPayload {
  const text = ndjson.toString('utf8')
  const lines = text.split('\n')
  // Az utolsó elem a záró sortörés utáni üres string — ez normális.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  if (lines.length < 2) {
    throw new Error('CSONKA HASZNOS TEHER: hiányzik a manifest vagy a záró sor.')
  }

  let manifest: BackupManifest
  try {
    const first = JSON.parse(lines[0]) as { manifest?: BackupManifest }
    if (!first.manifest) throw new Error('nincs manifest kulcs')
    manifest = first.manifest
  } catch (e: unknown) {
    throw new Error(
      `A mentés ELSŐ sora nem manifest: ${e instanceof Error ? e.message : 'ismeretlen'}`,
    )
  }
  if (manifest.formatum !== 1) {
    throw new Error(`Ismeretlen mentés-formátum: ${String(manifest.formatum)}.`)
  }

  let footer: BackupPayloadFooter
  try {
    footer = JSON.parse(lines[lines.length - 1]) as BackupPayloadFooter
  } catch {
    throw new Error('A mentés UTOLSÓ sora nem olvasható — a fájl csonka.')
  }
  if (footer.vege !== true) {
    throw new Error(
      'A mentés UTOLSÓ sora nem a lezáró sor. A fájl CSONKA — ' +
        'a benne lévő adat hiányos, ne használd visszaállításra.',
    )
  }

  const rowCounts: Record<string, number> = {}
  const hashers = new Map<string, ReturnType<typeof createHash>>()
  const rows: Record<string, Array<Record<string, unknown>>> | null = opts.collectRows ? {} : null
  const teljesHash = createHash('sha256')
  let totalRows = 0

  for (let i = 1; i < lines.length - 1; i++) {
    const raw = lines[i]
    if (raw === '') continue
    let parsed: { t?: string; r?: Record<string, unknown> }
    try {
      parsed = JSON.parse(raw) as { t?: string; r?: Record<string, unknown> }
    } catch {
      throw new Error(`A ${i + 1}. sor nem érvényes JSON — a fájl sérült.`)
    }
    if (typeof parsed.t !== 'string' || parsed.r === undefined || parsed.r === null) {
      throw new Error(`A ${i + 1}. sor ismeretlen alakú (hiányzó "t" vagy "r").`)
    }

    const line = `${raw}\n`
    let h = hashers.get(parsed.t)
    if (!h) {
      h = createHash('sha256')
      hashers.set(parsed.t, h)
      rowCounts[parsed.t] = 0
      if (rows) rows[parsed.t] = []
    }
    h.update(line, 'utf8')
    teljesHash.update(line, 'utf8')
    rowCounts[parsed.t] += 1
    totalRows += 1
    if (rows) rows[parsed.t].push(parsed.r)
  }

  // Az ÜRES táblák is bizonyítékot igényelnek: a manifest szerint 0 sor van,
  // és a fájlban tényleg 0 van. Enélkül egy elveszett tábla „nem is volt"-ként
  // tűnne el a visszaolvasásból.
  const tableHashes: Record<string, string> = {}
  for (const [tabla, h] of hashers) tableHashes[tabla] = h.digest('hex')
  for (const tabla of Object.keys(manifest.tablak ?? {})) {
    if (!(tabla in rowCounts)) {
      rowCounts[tabla] = 0
      tableHashes[tabla] = createHash('sha256').digest('hex')
      if (rows && !rows[tabla]) rows[tabla] = []
    }
  }

  return {
    manifest,
    footer,
    rowCounts,
    tableHashes,
    totalRows,
    sha256Nyers: teljesHash.digest('hex'),
    rows,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A HÁRMAS EGYEZTETÉS — ez öli meg a PostgREST néma csonkolását
// ─────────────────────────────────────────────────────────────────────────────

export interface RowCountVerification {
  ok: boolean
  /** Ember-olvasható eltérés-lista. Üres, ha minden stimmel. */
  elteresek: string[]
}

/**
 * `várható == kiírt == visszaolvasott`, táblánként.
 *
 * ⚠️ EZ A LÉNYEG, nem a lapozás. A PostgREST 1000 sor fölött NÉMÁN csonkol:
 *    nincs hibaüzenet, nincs jelzés, csak kevesebb sor. A lapozás csökkenti a
 *    kockázatot, de a BIZONYÍTÉK ez az utólagos összeszámolás — az akkor is
 *    fog, ha a lapozás valaha elromlik.
 *
 * @param varhato        a `backup_count_table()` RPC szerinti sorszám
 * @param kiirt          a manifest szerinti sorszám (amit a fájlba írtunk)
 * @param visszaolvasott a Drive-ról LETÖLTÖTT és visszafejtett fájlból számolt
 */
export function verifyRowCounts(
  varhato: Record<string, number>,
  kiirt: Record<string, number>,
  visszaolvasott: Record<string, number>,
): RowCountVerification {
  const elteresek: string[] = []
  const tablak = new Set<string>([
    ...Object.keys(varhato),
    ...Object.keys(kiirt),
    ...Object.keys(visszaolvasott),
  ])
  for (const tabla of [...tablak].sort()) {
    const v = varhato[tabla] ?? 0
    const k = kiirt[tabla] ?? 0
    const r = visszaolvasott[tabla] ?? 0
    if (v !== k || k !== r) {
      elteresek.push(`${tabla}: várható ${v}, kiírt ${k}, visszaolvasott ${r}`)
    }
  }
  return { ok: elteresek.length === 0, elteresek }
}

/** Táblánkénti tartalom-egyezés a manifest és a visszaolvasott fájl között. */
export function verifyTableHashes(
  manifest: BackupManifest,
  visszaolvasottHashek: Record<string, string>,
): RowCountVerification {
  const elteresek: string[] = []
  for (const [tabla, stat] of Object.entries(manifest.tablak ?? {})) {
    const olvasott = visszaolvasottHashek[tabla]
    if (olvasott !== stat.sha256) {
      elteresek.push(`${tabla}: a visszaolvasott tartalom ellenőrző-összege eltér`)
    }
  }
  return { ok: elteresek.length === 0, elteresek }
}

// ─────────────────────────────────────────────────────────────────────────────
// Média (a `szemely.kep` base64 fénykép)
// ─────────────────────────────────────────────────────────────────────────────

export interface MediaEntry {
  id: unknown
  kep: string
}

export interface MediaSplitResult {
  /** A sorok a média-oszlop NÉLKÜL (a fő fájlba ez megy). */
  sorok: Array<Record<string, unknown>>
  media: MediaEntry[]
}

/**
 * Leválasztja a nagy base64 fényképeket a fő mentésről.
 *
 * MIÉRT: enélkül egy 1200 fős, fényképes gyülekezet 60-180 MB-tal hízna
 * NAPONTA, és a Drive ingyenes 15 GB-ja hetek alatt megtelne. Külön fájlban
 * viszont — mivel a fényképek szinte sosem változnak — a tegnapi média-fájlra
 * lehet HIVATKOZNI, ha a tartalom SHA-256-ja azonos.
 *
 * ⚠️ A média-oszlopot NEM töröljük a sorból csendben: a kulcs `null`-ra áll,
 *    tehát a visszaállítás pontosan tudja, hogy volt ott érték, és hogy azt a
 *    média-fájlból kell pótolni. A hiányzó kulcs ezt elrejtené.
 */
export function splitMediaColumn(
  sorok: Array<Record<string, unknown>>,
  idKey = 'id',
  mediaKey = 'kep',
): MediaSplitResult {
  const media: MediaEntry[] = []
  const tisztitott = sorok.map((row) => {
    const ertek = row[mediaKey]
    if (typeof ertek === 'string' && ertek.length > 0) {
      media.push({ id: row[idKey], kep: ertek })
      return { ...row, [mediaKey]: null }
    }
    return row
  })
  return { sorok: tisztitott, media }
}

export interface BuiltMedia {
  ndjson: Buffer
  /** A NYERS (titkosítás előtti) tartalom SHA-256-ja — ezen alapul az újrahivatkozás. */
  sha256: string
  darab: number
}

/**
 * A média-fájl hasznos terhe.
 *
 * A SHA-256 a NYERS tartalomra megy, nem a titkosítottra: a titkosítás
 * véletlen nonce-szal dolgozik, tehát ugyanaz a fénykép-halmaz minden nap MÁS
 * rejtjelezett bájtokat adna, és soha nem ismernénk fel, hogy nem változott.
 */
export function buildMediaPayload(media: MediaEntry[]): BuiltMedia {
  const hash = createHash('sha256')
  const chunks: string[] = []
  for (const entry of media) {
    const line = `${JSON.stringify(entry)}\n`
    chunks.push(line)
    hash.update(line, 'utf8')
  }
  return {
    ndjson: Buffer.from(chunks.join(''), 'utf8'),
    sha256: hash.digest('hex'),
    darab: media.length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tömörítés
// ─────────────────────────────────────────────────────────────────────────────

/** gzip, 6-os szinttel (a méret/idő arány itt a legjobb NDJSON-ra). */
export function gzipPayload(bytes: Buffer): Buffer {
  return gzipSync(bytes, { level: 6 })
}

export function gunzipPayload(bytes: Buffer): Buffer {
  return gunzipSync(bytes)
}
