import { NextResponse } from 'next/server'

import { validateCurrentLicense } from '@/lib/standalone/license-check'
import { isStandaloneMode } from '@/lib/standalone/runtime-detect'

/**
 * GET /api/standalone/license-status
 *
 * A license-banner 5 percenként pollingol ide, hogy megtudja az aktuális
 * állapotot. Ha server mode-ban fut (nem standalone), 200-zal tér vissza
 * "not_applicable" státusszal.
 */
export async function GET() {
  if (!isStandaloneMode()) {
    return NextResponse.json({
      applicable: false,
      status: 'normal',
      daysSinceLastSync: 0,
      daysRemaining: 365,
      lastSyncISO: null,
    })
  }

  try {
    const result = await validateCurrentLicense()
    return NextResponse.json({
      applicable: true,
      valid: result.valid,
      status: result.status,
      daysSinceLastSync: result.daysSinceLastSync ?? 0,
      daysRemaining: result.daysRemaining ?? 0,
      lastSyncISO: result.claims?.iat
        ? new Date(result.claims.iat * 1000).toISOString()
        : null,
      fingerprintMatch: result.fingerprintMatch ?? true,
    })
  } catch (e) {
    console.error('[/api/standalone/license-status]', e)
    return NextResponse.json(
      {
        applicable: true,
        status: 'invalid',
        reason: e instanceof Error ? e.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
