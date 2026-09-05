import { NextResponse, type NextRequest } from 'next/server'

import { corsFejlecek } from '@/lib/desktop-kapcsolas/cors'
import { lekerKapcsolasAllapot } from '@/lib/desktop-kapcsolas/szerver'
import { kapcsolasiKodErvenyes } from '@kartoteka/supabase-client'

/**
 * ASZTALI ESZKÖZ-KAPCSOLÁS — 3. lépés: az asztali app lekérdezi az állapotot
 * a TITKOS kóddal (2026-09-05).
 *
 * POST /api/desktop-kapcsolas/allapot   { kod: string }
 *   → 200 { allapot: 'varakozik' | 'jovahagyva' | 'felhasznalva' | 'lejart' | 'elutasitva' | 'ismeretlen', tokenHash?, uzenet? }
 * OPTIONS — CORS-előkérés a Tauri webview-nak (204 + Allow-Origin).
 *
 * A `tokenHash` PONTOSAN EGYSZER jön vissza (a szerver atomikusan
 * „felhasználva"-ra állítja a sort). Az app ezzel `verifyOtp({ type: 'magiclink' })`-ot hív.
 * NYILVÁNOS útvonal — a kód maga a bizonyíték (256 bit; csak az app ismeri).
 *
 * ⚠️ CORS: keresztorigós hívás a Tauri webview-ból — minden válasz (a 400 is)
 * hordja a CORS-fejléceket. Részletek: lib/desktop-kapcsolas/cors.ts.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' } as const

/** Előkérés: üres 204, a CORS-fejlécekkel (allowlist szerint). */
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsFejlecek(request) })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const fejlecek = { ...NO_STORE, ...corsFejlecek(request) }

  let body: { kod?: unknown }
  try {
    body = (await request.json()) as { kod?: unknown }
  } catch {
    return NextResponse.json({ allapot: 'ismeretlen', uzenet: 'Hibás kérés (nem JSON).' }, { status: 400, headers: fejlecek })
  }
  if (!kapcsolasiKodErvenyes(body.kod)) {
    return NextResponse.json({ allapot: 'ismeretlen', uzenet: 'Hibás kapcsolási kód.' }, { status: 400, headers: fejlecek })
  }

  const valasz = await lekerKapcsolasAllapot(body.kod)
  return NextResponse.json(valasz, { status: 200, headers: fejlecek })
}
