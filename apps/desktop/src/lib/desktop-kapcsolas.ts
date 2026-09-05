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

/** Egyetlen állapot-lekérdezés a titkos kóddal. */
export async function lekerAllapot(keres: KapcsolasKeres): Promise<DesktopKapcsolasAllapotValasz> {
  const origin = getWebOrigin()
  const res = await fetch(`${origin}/api/desktop-kapcsolas/allapot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kod: keres.kod }),
  })
  const body = (await res.json()) as DesktopKapcsolasAllapotValasz
  if (!res.ok) return { allapot: 'ismeretlen', uzenet: body.uzenet || `HTTP ${res.status}` }
  return body
}

export type VarakozasEredmeny =
  | { ok: true }
  | { ok: false; ok_tipus: 'lejart' | 'elutasitva' | 'megszakitva' | 'hiba'; uzenet: string }

/**
 * 3. lépés — várakozás a jóváhagyásra, majd munkamenet-nyitás.
 * Az `onTick` a hátralévő másodperceket adja a felületnek.
 */
export async function varjJovahagyasra(
  keres: KapcsolasKeres,
  opts: { signal?: AbortSignal; onTick?: (hatraMp: number) => void } = {},
): Promise<VarakozasEredmeny> {
  const lejarMs = new Date(keres.lejar).getTime()
  let halozatiHibak = 0
  while (true) {
    if (opts.signal?.aborted) return { ok: false, ok_tipus: 'megszakitva', uzenet: 'Megszakítva.' }
    const hatra = Math.max(0, Math.floor((lejarMs - Date.now()) / 1000))
    opts.onTick?.(hatra)
    if (hatra <= 0) return { ok: false, ok_tipus: 'lejart', uzenet: 'A kérés lejárt (10 perc). Indíts újat.' }

    let allapot: DesktopKapcsolasAllapotValasz
    try {
      allapot = await lekerAllapot(keres)
      halozatiHibak = 0
    } catch (err: unknown) {
      halozatiHibak += 1
      // Átmeneti hálózati zavar: néhány próbát elnézünk, aztán szólunk.
      if (halozatiHibak >= 10) {
        return { ok: false, ok_tipus: 'hiba', uzenet: `Nem érhető el a kartoteka.app: ${errorMessage(err)}` }
      }
      await alszik(KAPCSOLAS_LEKERDEZES_MS * 2, opts.signal)
      continue
    }

    if (allapot.allapot === 'jovahagyva' && allapot.tokenHash) {
      const supabase = getDesktopSupabase()
      const { error } = await supabase.auth.verifyOtp({ token_hash: allapot.tokenHash, type: 'magiclink' })
      if (error) {
        return { ok: false, ok_tipus: 'hiba', uzenet: `A belépő elfogadása nem sikerült: ${error.message}` }
      }
      return { ok: true }
    }
    if (allapot.allapot === 'lejart') return { ok: false, ok_tipus: 'lejart', uzenet: allapot.uzenet || 'A kérés lejárt.' }
    if (allapot.allapot === 'elutasitva') return { ok: false, ok_tipus: 'elutasitva', uzenet: 'A kérést a weben elutasítottad.' }
    if (allapot.allapot === 'felhasznalva') {
      // A tokent már valaki elvitte — ez a gép nem kapta meg. Fail-closed.
      return { ok: false, ok_tipus: 'hiba', uzenet: 'A belépőt egy másik kérés már felhasználta. Indíts újat.' }
    }
    if (allapot.allapot === 'ismeretlen' && allapot.uzenet && !/nem válaszol/.test(allapot.uzenet)) {
      return { ok: false, ok_tipus: 'hiba', uzenet: allapot.uzenet }
    }
    await alszik(KAPCSOLAS_LEKERDEZES_MS, opts.signal)
  }
}

function alszik(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = window.setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(id)
      resolve()
    }, { once: true })
  })
}
