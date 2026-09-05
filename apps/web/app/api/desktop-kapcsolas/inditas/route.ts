import { NextResponse, type NextRequest } from 'next/server'

import { corsFejlecek } from '@/lib/desktop-kapcsolas/cors'
import { inditKapcsolast, tisztaEszkozNev } from '@/lib/desktop-kapcsolas/szerver'
import { getClientIp } from '@/lib/utils/ip-hash'
import { kapcsolasiKodErvenyes } from '@kartoteka/supabase-client'

/**
 * ASZTALI ESZKÖZ-KAPCSOLÁS — 1. lépés: az asztali app kérést indít (2026-09-05).
 *
 * POST /api/desktop-kapcsolas/inditas   { kod: string, eszkozNev?: string }
 *   → 200 { ok: true, id, ellenorzoKod, lejar }
 *   → 400 hibás kérés · 429 spam-fék · 503 szerver-hiba
 * OPTIONS — CORS-előkérés a Tauri webview-nak (204 + Allow-Origin).
 *
 * NYILVÁNOS (nincs bejelentkezett felhasználó — az asztali gépen még nincs
 * munkamenet, ÉPP AZT szeretnénk létrehozni). A védelem:
 *  · a kód 256 bites, az app generálja; csak a hash-e kerül tárolásra;
 *  · óránkénti plafon: GLOBÁLIS (mindig) + a kérő vödre (IP-hash / névtelen);
 *  · a kérés 10 perc alatt lejár; jóváhagyni CSAK bejelentkezve lehet.
 *
 * ⚠️ CORS: az asztali app a Tauri webview origójáról (http://tauri.localhost,
 * tauri://localhost) hív — keresztorigós kérés előkéréssel. Allow-Origin
 * nélkül a fetch TypeError-ral bukna, és az app hamisan „nincs internet"-et
 * mondana. MINDEN válasz (a 4xx/5xx is) hordja a CORS-fejléceket, különben a
 * hibaüzenet sem jutna el a lelkészig. Részletek: lib/desktop-kapcsolas/cors.ts.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' } as const

/** Előkérés: üres 204, a CORS-fejlécekkel (allowlist szerint). */
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsFejlecek(request) })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // EGY fejléc-készlet minden válaszra — a CORS a hibás válaszról sem maradhat le.
  const fejlecek = { ...NO_STORE, ...corsFejlecek(request) }

  let body: { kod?: unknown; eszkozNev?: unknown }
  try {
    body = (await request.json()) as { kod?: unknown; eszkozNev?: unknown }
  } catch {
    return NextResponse.json({ ok: false, error: 'Hibás kérés (nem JSON).' }, { status: 400, headers: fejlecek })
  }

  if (!kapcsolasiKodErvenyes(body.kod)) {
    return NextResponse.json({ ok: false, error: 'Hibás kapcsolási kód.' }, { status: 400, headers: fejlecek })
  }

  const eredmeny = await inditKapcsolast({
    kod: body.kod,
    eszkozNev: tisztaEszkozNev(body.eszkozNev),
    ip: getClientIp(request.headers),
  })

  if (!eredmeny.ok) {
    return NextResponse.json({ ok: false, error: eredmeny.error }, { status: eredmeny.status, headers: fejlecek })
  }

  return NextResponse.json(
    { ok: true, id: eredmeny.id, ellenorzoKod: eredmeny.ellenorzoKod, lejar: eredmeny.lejar },
    { status: 200, headers: fejlecek },
  )
}
