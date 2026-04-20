import { NextResponse } from 'next/server'

import { isStandaloneMode } from '@/lib/standalone/runtime-detect'
import { writeLicenseFile } from '@/lib/standalone/license-check'

/**
 * POST /api/standalone/write-license
 *
 * Kiírja a license.dat fájlt a data/ mappába.
 *
 * Fázis 7b: egyszerű token string.
 * Fázis 7c: validált JWT + fingerprint ellenőrzés.
 */
export async function POST(request: Request) {
  if (!isStandaloneMode()) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  try {
    const { token } = await request.json()
    if (!token) {
      return NextResponse.json(
        { error: 'Hiányzó licensz token' },
        { status: 400 },
      )
    }

    writeLicenseFile(token)

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[/api/standalone/write-license]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ismeretlen hiba' },
      { status: 500 },
    )
  }
}
