import 'server-only'

/**
 * GOOGLE DRIVE REST-KLIENS (2026-08-11) — nyers `fetch`, nulla új függőség.
 *
 * MIT TUD ÉS MIT NEM
 * ──────────────────
 * A `drive.file` hatókör miatt az alkalmazás CSAK a SAJÁT MAGA által létrehozott
 * fájlokat és mappákat látja. Ennek három gyakorlati következménye van, és
 * mind a hármat a felület is kimondja:
 *   1) a célmappát AZ ALKALMAZÁS hozza létre — kézzel készített mappát nem lát,
 *   2) ha a tulajdonos kézzel elmozgatja vagy törli a fájlokat, azok számunkra
 *      egyszerűen ELTŰNNEK → ezért van a napló ⇄ Drive egyeztetés,
 *   3) a Google a FÁJLNEVET és a MÉRETET látja, a tartalmat nem — ezért a
 *      fájlnév átlátszatlan (`kb-<uuid>.kbk`), és a tartalom titkosított.
 *
 * ⚠️ TÖRLÉS: MINDIG `files.delete` (VÉGLEGES). ⛔ SOHA `files.update(trashed=true)`:
 *    a Drive Kukája 30 napig őriz, és a 14 napos megőrzési ígéret némán
 *    44 nappá válna — pont az a fajta csendes hazugság, amit ez a rendszer
 *    nem engedhet meg magának.
 */

import {
  DRIVE_MAPPA_NEV,
  loadGoogleOAuthConfig,
  refreshAccessToken,
} from './oauth'
import { loadDriveRefreshToken, saveDriveFolderId, setDriveTokenStatus } from './settings'
import type { DriveFile } from './types'

const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files'
const ABOUT_ENDPOINT = 'https://www.googleapis.com/drive/v3/about'

const HALOZAT_TIMEOUT_MS = 120_000
const LETOLTES_TIMEOUT_MS = 300_000

/**
 * Rövid életű access-token gyorsítótár a process memóriájában.
 * NEM megy adatbázisba, NEM megy naplóba. Egy percnyi biztonsági ráhagyással
 * jár le, hogy egy hosszabb feltöltés ne fusson bele a lejáratba.
 */
let tokenCache: { token: string; lejar: number } | null = null

export class DriveError extends Error {
  readonly httpStatus: number | null
  constructor(message: string, httpStatus: number | null = null) {
    super(message)
    this.name = 'DriveError'
    this.httpStatus = httpStatus
  }
}

/**
 * A Google hibaválaszának BIZTONSÁGOS összefoglalása: csak a szabványos
 * `error.message`, rövidítve. A nyers törzs kérés-paramétereket visszhangozhat.
 */
async function driveError(response: Response, fallback: string): Promise<DriveError> {
  let reszlet = ''
  try {
    const parsed = (await response.json()) as { error?: { message?: string; status?: string } }
    if (typeof parsed.error?.message === 'string') reszlet = parsed.error.message.slice(0, 200)
  } catch {
    reszlet = ''
  }
  return new DriveError(
    reszlet ? `${fallback}: ${reszlet}` : `${fallback} (HTTP ${response.status})`,
    response.status,
  )
}

/**
 * Érvényes access token. Fail-closed: ha nincs kapcsolat vagy a frissítés
 * elhasal, DOB — nem ad vissza `null`-t, amit a hívó „nincs teendő"-nek nézne.
 */
export async function getDriveAccessToken(force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.lejar > Date.now()) return tokenCache.token

  const config = loadGoogleOAuthConfig()
  const stored = await loadDriveRefreshToken()
  if (stored.needsSql) {
    throw new DriveError('A mentés-rendszer SQL-migrációja még nem futott le.')
  }
  if (stored.error) throw new DriveError(stored.error)
  if (!stored.token) {
    throw new DriveError(
      'A Google Drive nincs összekötve. Admin → Biztonsági mentés → „Google Drive összekötése".',
    )
  }

  try {
    const { accessToken, expiresIn } = await refreshAccessToken(config, stored.token)
    tokenCache = { token: accessToken, lejar: Date.now() + Math.max(expiresIn - 60, 60) * 1000 }
    await setDriveTokenStatus('ok')
    return accessToken
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Ismeretlen Google-hiba.'
    tokenCache = null
    await setDriveTokenStatus('hiba', message)
    throw new DriveError(message)
  }
}

/** A gyorsítótár ürítése (szétkapcsoláskor kötelező). */
export function clearDriveTokenCache(): void {
  tokenCache = null
}

function toDriveFile(raw: Record<string, unknown>): DriveFile {
  const sizeRaw = raw.size
  const size = typeof sizeRaw === 'string' ? Number(sizeRaw) : typeof sizeRaw === 'number' ? sizeRaw : null
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    size: Number.isFinite(size) ? (size as number) : null,
    createdTime: typeof raw.createdTime === 'string' ? raw.createdTime : null,
    modifiedTime: typeof raw.modifiedTime === 'string' ? raw.modifiedTime : null,
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fiók-információ
// ─────────────────────────────────────────────────────────────────────────────

/** A mentéseket fogadó Google-fiók e-mail címe + a szabad tárhely. */
export async function getDriveAbout(
  accessToken: string,
): Promise<{ email: string | null; osszesBajt: number | null; hasznaltBajt: number | null }> {
  const response = await fetch(`${ABOUT_ENDPOINT}?fields=user(emailAddress),storageQuota(limit,usage)`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(HALOZAT_TIMEOUT_MS),
  })
  if (!response.ok) throw await driveError(response, 'A Google-fiók adatai nem kérdezhetők le')
  const json = (await response.json()) as {
    user?: { emailAddress?: string }
    storageQuota?: { limit?: string; usage?: string }
  }
  const num = (v: string | undefined): number | null => {
    if (typeof v !== 'string') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return {
    email: json.user?.emailAddress ?? null,
    osszesBajt: num(json.storageQuota?.limit),
    hasznaltBajt: num(json.storageQuota?.usage),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Létrehozza a célmappát, és visszaadja az azonosítóját.
 *
 * ⚠️ SZÁNDÉKOSAN NEM keres meglévő mappát név szerint: a `drive.file` hatókör
 * csak a saját fájljainkat látja, tehát a „keresés" csak a korábbi
 * összekötésünk mappáját találná meg — ha `existingFolderId`-t kapunk, azt
 * ellenőrizzük, egyébként újat hozunk létre.
 */
export async function ensureBackupFolder(
  accessToken: string,
  existingFolderId?: string | null,
): Promise<string> {
  if (existingFolderId) {
    const ok = await folderExists(accessToken, existingFolderId)
    if (ok) return existingFolderId
  }

  const response = await fetch(`${FILES_ENDPOINT}?fields=id,name`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: DRIVE_MAPPA_NEV,
      mimeType: 'application/vnd.google-apps.folder',
    }),
    signal: AbortSignal.timeout(HALOZAT_TIMEOUT_MS),
  })
  if (!response.ok) throw await driveError(response, 'A mentési mappa nem hozható létre a Drive-on')
  const json = (await response.json()) as { id?: string }
  if (!json.id) throw new DriveError('A Drive nem adott vissza mappa-azonosítót.')

  // ⚠️ VISSZAÍRÁS. Enélkül minden futás ÚJ mappát csinálna (a régi azonosító
  // maradna a beállításokban), és az egyeztetés minden korábbi fájlt
  // „hiányzó"-nak látna. Ez a fajta csendes sodródás a legdrágább hiba itt.
  await saveDriveFolderId(json.id)
  return json.id
}

async function folderExists(accessToken: string, folderId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${FILES_ENDPOINT}/${encodeURIComponent(folderId)}?fields=id,trashed,mimeType`,
      {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(HALOZAT_TIMEOUT_MS),
      },
    )
    if (!response.ok) return false
    const json = (await response.json()) as { trashed?: boolean; mimeType?: string }
    return json.trashed !== true && json.mimeType === 'application/vnd.google-apps.folder'
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Feltöltés / letöltés / listázás / törlés
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Multipart feltöltés. A `content` MÁR TITKOSÍTOTT bájtsorozat —
 * ⛔ nyers személyes adat SOHA nem kerülhet a Google-höz.
 */
export async function uploadFile(
  accessToken: string,
  args: { folderId: string; name: string; content: Uint8Array; mimeType?: string },
): Promise<DriveFile> {
  const hatar = `kbk-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  const mime = args.mimeType ?? 'application/octet-stream'
  const metadata = JSON.stringify({ name: args.name, parents: [args.folderId] })

  const elo = Buffer.from(
    `--${hatar}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${hatar}\r\ncontent-type: ${mime}\r\n\r\n`,
    'utf8',
  )
  const utó = Buffer.from(`\r\n--${hatar}--\r\n`, 'utf8')
  const body = Buffer.concat([elo, Buffer.from(args.content), utó])

  const response = await fetch(
    `${UPLOAD_ENDPOINT}?uploadType=multipart&fields=id,name,size,createdTime,modifiedTime,mimeType`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': `multipart/related; boundary=${hatar}`,
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(LETOLTES_TIMEOUT_MS),
    },
  )
  if (!response.ok) throw await driveError(response, 'A fájl feltöltése a Drive-ra nem sikerült')
  return toDriveFile((await response.json()) as Record<string, unknown>)
}

/** Visszaolvasás — ez az IGAZOLÁS lépése. Nyers bájtokat ad. */
export async function downloadFile(accessToken: string, fileId: string): Promise<Uint8Array> {
  const response = await fetch(`${FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(LETOLTES_TIMEOUT_MS),
  })
  if (!response.ok) throw await driveError(response, 'A mentés nem tölthető le a Drive-ról')
  return new Uint8Array(await response.arrayBuffer())
}

/** Egy fájl metaadata. `null`, ha nincs (kézzel törölték/elmozgatták). */
export async function getFileMeta(accessToken: string, fileId: string): Promise<DriveFile | null> {
  const response = await fetch(
    `${FILES_ENDPOINT}/${encodeURIComponent(fileId)}?fields=id,name,size,createdTime,modifiedTime,mimeType,trashed`,
    {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(HALOZAT_TIMEOUT_MS),
    },
  )
  if (response.status === 404) return null
  if (!response.ok) throw await driveError(response, 'A Drive-fájl adatai nem kérdezhetők le')
  const json = (await response.json()) as Record<string, unknown>
  if (json.trashed === true) return null
  return toDriveFile(json)
}

/**
 * A mappa TELJES tartalma, lapozva.
 *
 * ⚠️ A `nextPageToken` ciklus KÖTELEZŐ: a Drive 1000 fájl fölött lapoz, és a
 * ciklus elhagyása pontosan az a néma csonkolás, amit ez a projekt a PostgREST
 * 1000 soros plafonjával már megszenvedett. Itt az ára rosszabb lenne: a
 * nyesés a „nem látott" fájlokat elárvultnak hinné.
 */
export async function listFolderFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = []
  let pageToken: string | undefined
  let kor = 0

  do {
    kor += 1
    if (kor > 200) {
      throw new DriveError('A Drive-mappa listázása nem ért véget (túl sok lap) — megálltam.')
    }
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id,name,size,createdTime,modifiedTime,mimeType)',
      pageSize: '1000',
      orderBy: 'createdTime desc',
      spaces: 'drive',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const response = await fetch(`${FILES_ENDPOINT}?${params.toString()}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(HALOZAT_TIMEOUT_MS),
    })
    if (!response.ok) throw await driveError(response, 'A Drive-mappa tartalma nem listázható')

    const json = (await response.json()) as {
      files?: Array<Record<string, unknown>>
      nextPageToken?: string
    }
    for (const f of json.files ?? []) out.push(toDriveFile(f))
    pageToken = json.nextPageToken
  } while (pageToken)

  return out
}

/**
 * VÉGLEGES törlés. ⛔ Nem a Kukába teszi — az a 14 napos ígéretet 44 nappá
 * tenné. A 404-et sikernek vesszük: ha már nincs ott, a cél teljesült.
 */
export async function deleteFilePermanently(accessToken: string, fileId: string): Promise<void> {
  const response = await fetch(`${FILES_ENDPOINT}/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(HALOZAT_TIMEOUT_MS),
  })
  if (response.status === 404 || response.status === 204 || response.ok) return
  throw await driveError(response, 'A Drive-fájl törlése nem sikerült')
}

// ─────────────────────────────────────────────────────────────────────────────
// Kapcsolat-teszt
// ─────────────────────────────────────────────────────────────────────────────

export interface DriveTestResult {
  success: boolean
  error?: string
  fiokEmail?: string | null
  mappaId?: string | null
  szabadBajt?: number | null
  /** A teszt lépései emberi nyelven — a felület ezt listázza ki. */
  lepesek: Array<{ lepes: string; ok: boolean }>
}

/**
 * Fel-, vissza-, majd letörli egy apró próbafájlt.
 *
 * MIÉRT NEM ELÉG A TOKEN-FRISSÍTÉS: érvényes token mellett is elbukhat a
 * feltöltés (megtelt tárhely, törölt mappa, visszavont mappa-hozzáférés).
 * „Egy mentés, amit sosem próbáltak ki, nem mentés, hanem remény."
 */
export async function testDriveConnection(): Promise<DriveTestResult> {
  const lepesek: DriveTestResult['lepesek'] = []
  const jelol = (lepes: string, ok: boolean) => lepesek.push({ lepes, ok })

  let accessToken: string
  try {
    accessToken = await getDriveAccessToken(true)
    jelol('Hozzáférés megújítása a Google-nél', true)
  } catch (error: unknown) {
    jelol('Hozzáférés megújítása a Google-nél', false)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'A Google-kapcsolat nem újítható meg.',
      lepesek,
    }
  }

  let about: Awaited<ReturnType<typeof getDriveAbout>>
  try {
    about = await getDriveAbout(accessToken)
    jelol('Fiók-adatok lekérdezése', true)
  } catch (error: unknown) {
    jelol('Fiók-adatok lekérdezése', false)
    return { success: false, error: error instanceof Error ? error.message : 'Ismeretlen hiba.', lepesek }
  }

  const stored = await loadDriveRefreshToken()
  let folderId: string
  try {
    folderId = await ensureBackupFolder(accessToken, stored.folderId)
    jelol('Mentési mappa ellenőrzése', true)
  } catch (error: unknown) {
    jelol('Mentési mappa ellenőrzése', false)
    return { success: false, error: error instanceof Error ? error.message : 'Ismeretlen hiba.', lepesek }
  }

  const probaTartalom = Buffer.from(
    `KARTOTEKA kapcsolat-teszt ${new Date().toISOString()}\n` +
      'Ez a fajl automatikusan torlodik. Nem tartalmaz szemelyes adatot.\n',
    'utf8',
  )
  let proba: DriveFile | null = null
  try {
    proba = await uploadFile(accessToken, {
      folderId,
      name: `kartoteka-teszt-${Date.now()}.txt`,
      content: new Uint8Array(probaTartalom),
      mimeType: 'text/plain',
    })
    jelol('Próbafájl feltöltése', true)
  } catch (error: unknown) {
    jelol('Próbafájl feltöltése', false)
    return { success: false, error: error instanceof Error ? error.message : 'Ismeretlen hiba.', lepesek }
  }

  try {
    const vissza = await downloadFile(accessToken, proba.id)
    const egyezik = Buffer.from(vissza).equals(probaTartalom)
    jelol('Próbafájl visszaolvasása és összevetése', egyezik)
    if (!egyezik) {
      await deleteFilePermanently(accessToken, proba.id).catch(() => undefined)
      return {
        success: false,
        error: 'A visszaolvasott próbafájl NEM egyezett a feltöltöttel. A Drive-kapcsolat nem megbízható.',
        lepesek,
      }
    }
  } catch (error: unknown) {
    jelol('Próbafájl visszaolvasása és összevetése', false)
    await deleteFilePermanently(accessToken, proba.id).catch(() => undefined)
    return { success: false, error: error instanceof Error ? error.message : 'Ismeretlen hiba.', lepesek }
  }

  try {
    await deleteFilePermanently(accessToken, proba.id)
    jelol('Próbafájl végleges törlése', true)
  } catch {
    jelol('Próbafájl végleges törlése', false)
    // A takarítás hibája nem teszi a kapcsolatot használhatatlanná — de jelezzük.
    return {
      success: true,
      fiokEmail: about.email,
      mappaId: folderId,
      szabadBajt:
        about.osszesBajt !== null && about.hasznaltBajt !== null
          ? about.osszesBajt - about.hasznaltBajt
          : null,
      error: 'A kapcsolat működik, de a próbafájlt nem sikerült törölni — nézd meg a mentési mappát.',
      lepesek,
    }
  }

  return {
    success: true,
    fiokEmail: about.email,
    mappaId: folderId,
    szabadBajt:
      about.osszesBajt !== null && about.hasznaltBajt !== null
        ? about.osszesBajt - about.hasznaltBajt
        : null,
    lepesek,
  }
}
