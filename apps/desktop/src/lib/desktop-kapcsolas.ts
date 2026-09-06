/**
 * Asztali eszköz-kapcsolás — az ASZTALI oldal (2026-09-05).
 *
 * A lelkész a webes fiókjával (Google-lel is) kapcsolja össze ezt a gépet,
 * jelszó gépelése nélkül. A folyamat („tévé-belépés"):
 *
 *   1. `inditKapcsolast()` — 256 bites titkos kód születik ITT, a szervernek
 *      csak a kód megy (ő hash-eli), és visszaad egy NEM titkos kérés-
 *      azonosítót + a 6 jegyű ellenőrző kódot.
 *   2. `nyitJovahagyoOldalt()` — a rendszer-böngészőben megnyílik a
 *      kartoteka.app jóváhagyó oldala az azonosítóval. A lelkész ott
 *      bejelentkezik (Google / e-mail), látja az eszköz nevét és az ellenőrző
 *      kódot, és jóváhagy.
 *   3. `varjJovahagyasra()` — 2 mp-enként kérdezünk a TITKOS kóddal; a
 *      jóváhagyás után EGYSZER megkapjuk a belépő-tokent, és a Supabase-
 *      kliens `verifyOtp`-vel munkamenetet nyit. Innentől minden úgy megy,
 *      mint a jelszavas belépés után (2FA-lépcső, PIN-beállítás, szinkron).
 *
 * A kód-aritmetika (kód, hash, ellenőrző) a KÖZÖS `@kartoteka/supabase-client`
 * csomagban él — a web ugyanazt használja, két másolat nincs.
 *
 * ⚠️ A Tauri CSP `connect-src`-jében a webes origónak szerepelnie kell
 * (tauri.conf.json) — különben a webview némán elutasítja a fetch-et.
 *
 * ⚠️ TITOK A NAPLÓBAN — TILOS: a `kod` és a `tokenHash` SOHA nem kerül
 * `console.*`-ba, hibaüzenetbe vagy a felületre (a selftest-desktop-kapcsolas-
 * kliens forrás-őre ezt méri).
 *
 * 2026-09-05 (P3-utómunka) — MI VOLT A HIBA az állapot-útvonalon: egy
 * ÁTMENETI szerverhiba (HTTP 5xx, 429, hálózat-megszakadás, nem-JSON válasz a
 * proxytól) az `allapot` lekérdezésen `{ allapot: 'ismeretlen', uzenet:
 * 'HTTP 503' }`-má vált, amit a várakozó VÉGLEGES hibának vett — a lelkész
 * „Indíts újat" üzenetet kapott, miközben a weben épp jóváhagyta a kérést; a
 * hálózati kivételt pedig a 10. próba után szintén végleg feladta. A JAVÍTÁS:
 * az `osztalyozAllapotHttp` szerint CSAK a 4xx (a 408/425/429 kivételével)
 * végleges; minden átmeneti zavarnál a várakozás FOLYTATÓDIK — rövid,
 * duplázódó visszalépéssel (2 → 4 → 8 → 15 mp plafon), a kérés lejáratáig —
 * és az `onZavar` visszahívás a felületnek mondja, hogy a szerver most nem
 * válaszol, de az app újra próbálja. Az elhalt belépő (`verifyOtp` bukása —
 * pl. egy másik gépen újabb jóváhagyás készült, ami a korábbi, le nem kért
 * sort lejárttá tette) érthető, ÚJRAINDÍTHATÓ „lejárt" eredmény, nem nyers
 * hibaszöveg.
 */

import { openUrl } from '@tauri-apps/plugin-opener'
import {
  KAPCSOLAS_LEKERDEZES_MS,
  ellenorzoKod,
  ellenorzoKodFormazott,
  ujKapcsolasiKod,
  type DesktopKapcsolasAllapotValasz,
  type DesktopKapcsolasInditasValasz,
} from '@kartoteka/supabase-client'

import { errorMessage } from './error'
import { getDesktopSupabase } from './supabase'

/** A webes alkalmazás origója — a kapcsoló API és a jóváhagyó oldal itt él. */
export function getWebOrigin(): string {
  const env = import.meta.env as { VITE_WEB_ORIGIN?: string }
  const raw = (env.VITE_WEB_ORIGIN ?? '').trim()
  if (raw) {
    try {
      return new URL(raw).origin
    } catch {
      /* rossz érték → alapértelmezés */
    }
  }
  return 'https://kartoteka.app'
}

export interface KapcsolasKeres {
  /** A TITKOS kód — csak a memóriában, csak az állapot-lekérdezéshez. */
  kod: string
  /** Nem titkos kérés-azonosító (a böngésző-URL-ben). */
  id: string
  /** 6 jegyű ellenőrző kód, „123 456" alakban. */
  ellenorzo: string
  /** ISO — eddig érvényes. */
  lejar: string
  /** A jóváhagyó oldal címe (a rendszer-böngészőnek). */
  url: string
}

/** Az eszköz emberi neve a jóváhagyó oldalra (a lelkész felismerje a gépét). */
export function alapEszkozNev(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const os = /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Asztali'
  return `Kartotéka asztali alkalmazás (${os})`
}

/** 1. lépés — kérés indítása a szerveren. */
export async function inditKapcsolast(eszkozNev?: string): Promise<KapcsolasKeres> {
  const kod = ujKapcsolasiKod()
  const origin = getWebOrigin()
  let res: Response
  try {
    res = await fetch(`${origin}/api/desktop-kapcsolas/inditas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kod, eszkozNev: (eszkozNev ?? alapEszkozNev()).slice(0, 80) }),
    })
  } catch (err: unknown) {
    throw new Error(`Nem érhető el a kartoteka.app (${errorMessage(err)}). Ellenőrizd az internet-kapcsolatot.`)
  }
  let body: Partial<DesktopKapcsolasInditasValasz> & { error?: string } = {}
  try {
    body = (await res.json()) as typeof body
  } catch {
    /* nem JSON */
  }
  if (!res.ok || !body.ok || !body.id) {
    throw new Error(body.error || `A kapcsolás nem indítható (HTTP ${res.status}).`)
  }
  // Az ellenőrző kódot MAGUNK is kiszámoljuk — a szerver értéke csak megerősítés.
  const sajat = await ellenorzoKod(kod)
  if (body.ellenorzoKod && body.ellenorzoKod !== sajat) {
    throw new Error('A szerver más ellenőrző kódot adott, mint amit a gép számolt — a kapcsolás megszakítva.')
  }
  return {
    kod,
    id: body.id,
    ellenorzo: ellenorzoKodFormazott(sajat),
    lejar: body.lejar ?? new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    url: `${origin}/api/desktop-kapcsolas/nyit?id=${encodeURIComponent(body.id)}`,
  }
}

/** 2. lépés — a jóváhagyó oldal megnyitása a rendszer-böngészőben. */
export async function nyitJovahagyoOldalt(keres: KapcsolasKeres): Promise<void> {
  await openUrl(keres.url)
}

// ─────────────────────────────────────────────────────────────────────────
//  Az állapot-útvonal hiba-osztályozása (tiszta függvények — a selftest futtatja)
// ─────────────────────────────────────────────────────────────────────────

export type AllapotHttpOsztaly = 'ok' | 'atmeneti' | 'vegleges'

/**
 * HTTP-státusz → osztály. ÁTMENETI (a várakozás folytatódik): 0 (a fetch nem
 * kapott választ), 408, 425, 429, minden 5xx. VÉGLEGES: minden más 4xx (400
 * hibás kód, 401/403 tiltás, 404 hiányzó útvonal — ezek nem gyógyulnak
 * maguktól). 2xx → ok. (A klasszikus outbox `osztalyozSzinkronHiba` HTTP-
 * szabályával azonos — egy szabály, két hely.)
 */
export function osztalyozAllapotHttp(status: number): AllapotHttpOsztaly {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) return 'atmeneti'
  if (status >= 400 && status < 500) return 'vegleges'
  // 1xx / 3xx: a fetch ezt nem adja vissza rendes körülmények között — nem
  // ismételgetjük vakon (fail-closed: végleges).
  return 'vegleges'
}

/**
 * A szerver `ismeretlen` állapota kétféle: „A szerver most nem válaszol — az
 * app újra próbálja." (ÁTMENETI: DB-hiba a szerveren) vagy „Ismeretlen vagy
 * már törölt kérés." (VÉGLEGES: a sor nincs meg). Az üzenet szövege dönt.
 *
 * ⚠️ A döntés egy SZÖVEG-literálon kulcsol a hálózati határon át (a szerver:
 * apps/web/lib/desktop-kapcsolas/szerver.ts `lekerKapcsolasAllapot`). Egy
 * ottani átfogalmazás itt némán VÉGLEGESSÉ tenné a szerver átmeneti DB-hibáját
 * („Indítsd újra" egy magától gyógyuló zavarra), ezért a
 * `selftest-desktop-kapcsolas-kliens` K2c őre a SZERVER-fájlból kinyert
 * `ismeretlen` literálokat osztályozza ezzel a függvénnyel (hiba-ág →
 * átmeneti, hiányzó sor → végleges), és a szerver-literál átírásán bukik.
 * Tartósabb megoldás egy gépi mező (`atmeneti?: boolean`) a
 * `DesktopKapcsolasAllapotValasz`-ban — az a közös csomag + a szerver dolga.
 */
export function ismeretlenAllapotAtmeneti(uzenet: string | undefined): boolean {
  return !!uzenet && /nem válaszol/.test(uzenet)
}

/** Átmeneti zavar az állapot-útvonalon — a várakozás folytatódik. */
export class AllapotAtmenetiHiba extends Error {
  constructor(uzenet: string) {
    super(uzenet)
    this.name = 'AllapotAtmenetiHiba'
  }
}

/** Végleges hiba az állapot-útvonalon (4xx) — a várakozás megáll. */
export class AllapotVeglegesHiba extends Error {
  constructor(uzenet: string) {
    super(uzenet)
    this.name = 'AllapotVeglegesHiba'
  }
}

/**
 * Egyetlen állapot-lekérdezés a titkos kóddal.
 *
 * Dob: `AllapotAtmenetiHiba` (hálózat, 5xx, 429, nem-JSON válasz),
 * `AllapotVeglegesHiba` (4xx a 408/425/429 kivételével). 2xx → a válasz.
 */
export async function lekerAllapot(keres: KapcsolasKeres): Promise<DesktopKapcsolasAllapotValasz> {
  const origin = getWebOrigin()
  let res: Response
  try {
    res = await fetch(`${origin}/api/desktop-kapcsolas/allapot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kod: keres.kod }),
    })
  } catch (err: unknown) {
    throw new AllapotAtmenetiHiba(`Nem érhető el a kartoteka.app (${errorMessage(err)}).`)
  }
  const osztaly = osztalyozAllapotHttp(res.status)
  let body: Partial<DesktopKapcsolasAllapotValasz> = {}
  try {
    body = (await res.json()) as Partial<DesktopKapcsolasAllapotValasz>
  } catch {
    // Nem JSON (proxy-hibalap, üres törzs): 2xx-nél is átmeneti — a szerver
    // válasza nem értelmezhető, a következő kör tisztázza.
    if (osztaly === 'vegleges') throw new AllapotVeglegesHiba(`A kartoteka.app elutasította a kérést (HTTP ${res.status}).`)
    throw new AllapotAtmenetiHiba(`A kartoteka.app most nem válaszol értelmezhetően (HTTP ${res.status}).`)
  }
  if (osztaly === 'atmeneti') {
    throw new AllapotAtmenetiHiba(body.uzenet || `A kartoteka.app most nem elérhető (HTTP ${res.status}).`)
  }
  if (osztaly === 'vegleges') {
    throw new AllapotVeglegesHiba(body.uzenet || `A kartoteka.app elutasította a kérést (HTTP ${res.status}).`)
  }
  if (typeof body.allapot !== 'string') {
    throw new AllapotAtmenetiHiba('A kartoteka.app válaszából hiányzik az állapot — az app újra próbálja.')
  }
  return body as DesktopKapcsolasAllapotValasz
}

/**
 * Az elhalt belépő felismerése a `verifyOtp` hibájából: lejárt / érvénytelen /
 * már felhasznált token (Supabase: `otp_expired`, 403 „Token has expired or is
 * invalid", 401/404). Ilyenkor NEM a hiba szövegét mutatjuk, hanem az okot:
 * a jóváhagyás érvényét vesztette — újra kell indítani az összekapcsolást.
 * (Semmilyen token nem kerül az üzenetbe.)
 */
export function belepoElhalt(error: { code?: string; status?: number; message?: string } | null | undefined): boolean {
  if (!error) return false
  const code = (error.code ?? '').toLowerCase()
  if (code === 'otp_expired' || code === 'otp_disabled' || code === 'bad_code_verifier') return true
  if (error.status === 401 || error.status === 403 || error.status === 404) return true
  return /expired|invalid|not found|already (been )?used/i.test(error.message ?? '')
}

export const BELEPO_ELHALT_UZENET =
  'A jóváhagyás érvényét vesztette — például egy másik gépen újabb jóváhagyás készült, vagy a belépő lejárt. Indítsd újra az összekapcsolást: kattints az „Összekapcsolás újraindítása" gombra.'

export type VarakozasEredmeny =
  | { ok: true }
  | {
      ok: false
      ok_tipus: 'lejart' | 'elutasitva' | 'megszakitva' | 'hiba'
      uzenet: string
      /** Igaz, ha egy ÚJ kapcsolás indítása a kiút (a felület gombot mutat rá). */
      ujrainditas?: boolean
    }

/** A várakozó ütemezése (tesztből rövidíthető; a felület az alapokat használja). */
export interface VarakozasOpciok {
  signal?: AbortSignal
  /** A hátralévő másodpercek a felületnek. */
  onTick?: (hatraMp: number) => void
  /**
   * Átmeneti zavar (a szerver nem válaszol, de az app újra próbálja): a
   * szöveg a felületnek; `null` = a zavar elmúlt.
   */
  onZavar?: (uzenet: string | null) => void
  /** Két lekérdezés közti alap-szünet (alap: KAPCSOLAS_LEKERDEZES_MS = 2 mp). */
  lekerdezesMs?: number
  /** Az átmeneti zavar visszalépésének plafonja (alap: 15 mp). */
  visszalepesMaxMs?: number
}

export const VISSZALEPES_MAX_MS = 15_000

/** Az N. egymást követő átmeneti zavar utáni szünet: alap × 2^(n-1), plafonnal. */
export function atmenetiVisszalepesMs(zavarSzam: number, alapMs: number, maxMs: number = VISSZALEPES_MAX_MS): number {
  if (zavarSzam <= 0) return alapMs
  return Math.min(maxMs, alapMs * 2 ** Math.min(zavarSzam - 1, 20))
}

/**
 * 3. lépés — várakozás a jóváhagyásra, majd munkamenet-nyitás.
 *
 * Átmeneti zavarnál (hálózat, 5xx, 429, nem-JSON) a várakozás a kérés
 * LEJÁRATÁIG folytatódik, duplázódó visszalépéssel; végleges (4xx) hibánál
 * és a szerver végleges állapotainál (lejárt, elutasítva, felhasználva,
 * törölt kérés) megáll — érthető üzenettel és az újraindítás jelzésével.
 */
export async function varjJovahagyasra(
  keres: KapcsolasKeres,
  opts: VarakozasOpciok = {},
): Promise<VarakozasEredmeny> {
  const lejarMs = new Date(keres.lejar).getTime()
  const alapMs = opts.lekerdezesMs ?? KAPCSOLAS_LEKERDEZES_MS
  const maxMs = opts.visszalepesMaxMs ?? VISSZALEPES_MAX_MS
  let zavarSzam = 0
  while (true) {
    if (opts.signal?.aborted) return { ok: false, ok_tipus: 'megszakitva', uzenet: 'Megszakítva.' }
    // Ezredmásodperc-pontos lejárat (a régi egész-másodperces `floor` az utolsó
    // másodpercben — a lekérdezés ELŐTT — mondta ki a lejáratot); a felület
    // felfelé kerekített egész másodpercet kap.
    const hatraMs = lejarMs - Date.now()
    opts.onTick?.(Math.max(0, Math.ceil(hatraMs / 1000)))
    if (hatraMs <= 0) {
      return {
        ok: false,
        ok_tipus: 'lejart',
        uzenet:
          zavarSzam > 0
            ? 'A kérés lejárt (10 perc), és közben a kartoteka.app nem válaszolt. Ellenőrizd az internet-kapcsolatot, és indítsd újra az összekapcsolást.'
            : 'A kérés lejárt (10 perc). Indítsd újra az összekapcsolást.',
        ujrainditas: true,
      }
    }

    let allapot: DesktopKapcsolasAllapotValasz
    try {
      allapot = await lekerAllapot(keres)
      if (zavarSzam > 0) opts.onZavar?.(null)
      zavarSzam = 0
    } catch (err: unknown) {
      if (err instanceof AllapotVeglegesHiba) {
        return { ok: false, ok_tipus: 'hiba', uzenet: err.message, ujrainditas: true }
      }
      // Átmeneti zavar: NEM végleges — szólunk a felületnek, és folytatjuk a
      // lejáratig, egyre ritkábban kérdezve.
      zavarSzam += 1
      opts.onZavar?.(`${errorMessage(err)} Újra próbáljuk…`)
      await alszik(atmenetiVisszalepesMs(zavarSzam, alapMs, maxMs), opts.signal)
      continue
    }

    if (allapot.allapot === 'jovahagyva' && allapot.tokenHash) {
      const supabase = getDesktopSupabase()
      const { error } = await supabase.auth.verifyOtp({ token_hash: allapot.tokenHash, type: 'magiclink' })
      if (error) {
        if (belepoElhalt(error)) {
          return { ok: false, ok_tipus: 'lejart', uzenet: BELEPO_ELHALT_UZENET, ujrainditas: true }
        }
        return {
          ok: false,
          ok_tipus: 'hiba',
          uzenet: `A belépő elfogadása nem sikerült: ${error.message}. Indítsd újra az összekapcsolást.`,
          ujrainditas: true,
        }
      }
      return { ok: true }
    }
    if (allapot.allapot === 'lejart') {
      return {
        ok: false,
        ok_tipus: 'lejart',
        uzenet: allapot.uzenet || 'A kérés lejárt. Indítsd újra az összekapcsolást.',
        ujrainditas: true,
      }
    }
    if (allapot.allapot === 'elutasitva') return { ok: false, ok_tipus: 'elutasitva', uzenet: 'A kérést a weben elutasítottad.' }
    if (allapot.allapot === 'felhasznalva') {
      // A tokent már valaki elvitte — ez a gép nem kapta meg. Fail-closed.
      return {
        ok: false,
        ok_tipus: 'hiba',
        uzenet: 'A belépőt egy másik kérés már felhasználta. Indítsd újra az összekapcsolást.',
        ujrainditas: true,
      }
    }
    if (allapot.allapot === 'ismeretlen') {
      if (!ismeretlenAllapotAtmeneti(allapot.uzenet)) {
        return {
          ok: false,
          ok_tipus: 'hiba',
          uzenet: allapot.uzenet || 'A kérés nem található a szerveren. Indítsd újra az összekapcsolást.',
          ujrainditas: true,
        }
      }
      // A szerver adatbázisa nem válaszolt — átmeneti, mint egy 5xx.
      zavarSzam += 1
      opts.onZavar?.(`${allapot.uzenet}`)
      await alszik(atmenetiVisszalepesMs(zavarSzam, alapMs, maxMs), opts.signal)
      continue
    }
    await alszik(alapMs, opts.signal)
  }
}

function alszik(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        resolve()
      },
      { once: true },
    )
  })
}
