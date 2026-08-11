import 'server-only'

/**
 * TERV-TOKEN — a „száraz futás nem hagyható ki" szabály hordozója. 2026-08-11.
 *
 * A visszaállítás végrehajtása CSAK olyan tokennel indul el, amit a száraz
 * futás (előnézet) adott ki. A token magában hordozza, MIT látott a
 * rendszergazda: melyik mentést, melyik gyülekezethez, és milyen ÉLŐ állapot
 * mellett. Ha bármelyik azóta megváltozott, a végrehajtás megtagadja.
 *
 * HÁROM, EGYMÁST KIEGÉSZÍTŐ ZÁR:
 *   1) aláírás + 10 perces lejárat  — itt, ebben a fájlban,
 *   2) EGYSZER HASZNÁLHATÓSÁG       — az adatbázisban:
 *      `uniq_backup_restore_plan_token` UNIQUE index a `plan_token_hash`-en,
 *   3) ÉLŐ UJJLENYOMAT              — `backup_restore_live_fingerprint()`.
 *
 * A kettes pont azért van az adatbázisban, mert csak ott lehet versenyhelyzet-
 * mentes: két párhuzamos kattintásból pontosan egy megy át, a másik a UNIQUE
 * sértésen hasal el — kód-szintű zárral ez nem volna garantálható.
 *
 * ⛔ A TOKEN SOHA nem kerül naplóba, e-mailbe vagy URL-be — csak a HASH-e a
 *    `backup_restore_log`-ba.
 */

import { createHash, hkdfSync } from 'node:crypto'
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose'

/** A terv-token élettartama. Rövid: a látott állapot gyorsan avul. */
export const PLAN_TOKEN_ELETTARTAM_MP = 600

const JWT_KIBOCSATO = 'kartoteka-restore'
const JWT_CELKOZONSEG = 'kartoteka-restore-apply'

export interface PlanTokenClaims {
  /** `backup_log.id` — melyik mentésből. */
  blid: number
  /** gyülekezet-azonosító. */
  cid: string
  /** a staging-munkamenet azonosítója. */
  sid: string
  /** az ÉLŐ állapot ujjlenyomata az előnézet pillanatában. */
  fp: string
  /** a cselekvő profil-azonosítója — más nem használhatja fel. */
  act: string
  /** a `backup_restore_log` preview-sorának azonosítója. */
  dry: number | null
  /**
   * A MENTÉSBŐL BETÖLTÖTT táblák neve, ábécében.
   *
   * ⚠️ MIÉRT VAN A TOKENBEN (2026-08-11): a végrehajtás korábban elfogadta
   *    volna a hiányos átmeneti tárat is. Ha az előnézet és a végrehajtás
   *    között akár egy tábla kiesett a stagingből (takarítás, kézi beavatkozás,
   *    visszajátszott token), a `backup_restore_apply` arról a tábláról NEM
   *    tudott volna — az élő sorai érintetlenül TÚLÉLTÉK volna a visszaállítást,
   *    miközben minden más lecserélődik. Vegyes korú adatbázis, néma módon.
   *    A token ezért hordozza a listát, a végrehajtás pedig BETŰRE egyezteti.
   */
  stg: string[]
  /** egyedi token-azonosító. */
  jti: string
}

/**
 * A token ALÁÍRÓ kulcsa: a mentés-kulcsból HKDF-fel származtatva, saját
 * `info` címkével.
 *
 * MIÉRT SAJÁT CÍMKE: így ugyanaz a gyökértitok szolgál ki több célt anélkül,
 * hogy a kulcsok bárhol keresztbe használhatók lennének — egy terv-token
 * aláírásából a mentések tartalmi kulcsa nem vezethető vissza.
 *
 * MIÉRT OLVASSA ITT KÖZVETLENÜL AZ ENV-ET: a `lib/backup/keys.ts` a mentés
 * TARTALMI kulcsát adja vissza a saját szerződése szerint; ide csak a nyers
 * gyökér kell. A fail-closed szabály (nincs fallback, minimum 32 bájt)
 * SZÓ SZERINT UGYANAZ — és szándékosan NEM veszi át a
 * `lib/supabase/secret-vault.ts` anti-mintáját, ami egy 6 jegyű PIN-t is
 * elfogadna titkosítási kulcsnak.
 */
function loadSigningKey(): Uint8Array {
  const nyers = process.env.BACKUP_ENCRYPTION_KEY?.trim() || ''
  if (!nyers) {
    throw new Error(
      'A BACKUP_ENCRYPTION_KEY környezeti változó nincs beállítva. Enélkül a visszaállítás nem indítható — nincs tartalék megoldás, és ez szándékos.',
    )
  }
  const gyoker = /^[0-9a-fA-F]{64}$/.test(nyers)
    ? Buffer.from(nyers, 'hex')
    : Buffer.from(nyers, 'utf8')
  if (gyoker.byteLength < 32) {
    throw new Error(
      'A BACKUP_ENCRYPTION_KEY túl rövid (minimum 32 bájt). A visszaállítás hangos hibával megáll.',
    )
  }
  const derived = hkdfSync(
    'sha256',
    gyoker,
    Buffer.alloc(0),
    Buffer.from('kartoteka-restore-plan-token-v1', 'utf8'),
    32,
  )
  return new Uint8Array(derived)
}

/** A tokenhez tartozó, naplózható hash. A token maga SOHA nem kerül tárolásra. */
export function planTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function issuePlanToken(claims: PlanTokenClaims): Promise<{
  token: string
  hash: string
  lejar: string
}> {
  const key = loadSigningKey()
  const most = Math.floor(Date.now() / 1000)
  const exp = most + PLAN_TOKEN_ELETTARTAM_MP

  const token = await new SignJWT({
    blid: claims.blid,
    cid: claims.cid,
    sid: claims.sid,
    fp: claims.fp,
    act: claims.act,
    dry: claims.dry,
    stg: claims.stg,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(JWT_KIBOCSATO)
    .setAudience(JWT_CELKOZONSEG)
    .setIssuedAt(most)
    .setExpirationTime(exp)
    .setJti(claims.jti)
    .sign(key)

  return {
    token,
    hash: planTokenHash(token),
    lejar: new Date(exp * 1000).toISOString(),
  }
}

/**
 * A token ellenőrzése. Dob, ha bármi nem stimmel — MAGYARUL, a rendszergazda
 * számára is értelmes okkal.
 */
export async function verifyPlanToken(token: string): Promise<PlanTokenClaims> {
  if (!token || token.trim().length === 0) {
    throw new Error(
      'Hiányzik a terv-token. A visszaállítás CSAK a száraz futás (előnézet) után indítható — futtasd le az előnézetet.',
    )
  }
  const key = loadSigningKey()
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: JWT_KIBOCSATO,
      audience: JWT_CELKOZONSEG,
    })
    const blid = Number(payload.blid)
    const cid = String(payload.cid ?? '')
    const sid = String(payload.sid ?? '')
    const fp = String(payload.fp ?? '')
    const act = String(payload.act ?? '')
    const jti = String(payload.jti ?? '')
    const stg = Array.isArray(payload.stg) ? (payload.stg as unknown[]).map((t) => String(t)) : []
    if (!Number.isFinite(blid) || !cid || !sid || !fp || !act || !jti) {
      throw new Error('A terv-token hiányos.')
    }
    // FAIL CLOSED: tábla-lista nélküli token egy RÉGEBBI változatból való. Azzal
    // a végrehajtás nem tudná ellenőrizni, hogy a betöltött halmaz teljes-e —
    // ezért inkább új előnézetet kérünk.
    if (stg.length === 0) {
      throw new Error(
        'A terv-token nem tartalmazza a visszatöltendő táblák listáját (régi formátum). ' +
          'Futtasd le újra a száraz futást — enélkül nem tudjuk igazolni, hogy minden tábla visszatöltésre kerül.',
      )
    }
    return {
      blid,
      cid,
      sid,
      fp,
      act,
      dry: payload.dry == null ? null : Number(payload.dry),
      stg,
      jti,
    }
  } catch (error: unknown) {
    if (error instanceof joseErrors.JWTExpired) {
      throw new Error(
        'Az előnézet lejárt (10 percnél régebbi). Futtasd le újra a száraz futást — közben változhatott az adat, és a látott lista már nem lenne igaz.',
      )
    }
    throw new Error(
      'A terv-token érvénytelen. A visszaállítás CSAK a száraz futás után, ugyanabban a munkamenetben indítható.',
    )
  }
}
