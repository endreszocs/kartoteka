import { NextResponse } from 'next/server'

import { isStandaloneMode } from '@/lib/standalone/runtime-detect'
import { validateCurrentLicense } from '@/lib/standalone/license-check'
import { performMonthlySync } from '@/lib/standalone/monthly-sync'

/**
 * Modul-szintű flag a párhuzamos sync megakadályozásához. A sync SQLite-ot ír,
 * és 1-3 percig tart — egyszerre KETTŐ futása SQLite-WAL ütközést és
 * _mutation_queue korrupciót okozna. A standalone Node process egyetlen
 * instance-ban fut, így a modul-szintű változó megbízható lock.
 */
let syncInProgress = false

/**
 * POST /api/standalone/monthly-sync
 *
 * Elindítja a havi szinkron-folyamatot. A válaszban egy teljes eredmény-
 * objektumot küldünk (pulled/pushed/conflicts/failed/newLicenseToken).
 *
 * Payload:
 *   { authToken?: string }  — a user Supabase access tokenje (opcionális)
 *
 * FONTOS: ez az endpoint hosszú ideig fut (akár 3-5 perc),
 * ezért a kliens timeout-ot hosszabbra kell állítani.
 */
export async function POST(request: Request) {
  if (!isStandaloneMode()) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  // Párhuzamos sync tiltás — ha már fut egy sync, 409-ot adunk
  if (syncInProgress) {
    return NextResponse.json(
      {
        error:
          'Egy szinkronizáció már fut. Várj, amíg befejeződik (1-3 perc), ' +
          'mielőtt újat indítanál.',
      },
      { status: 409 },
    )
  }

  syncInProgress = true
  try {
    const body = await request.json().catch(() => ({}))
    const authToken = (body.authToken as string | undefined) ?? undefined

    // Licensz ellenőrzés — a claim-ekből vesszük a congregationId-t.
    // FONTOS: a LicenseValidationResult.claims akkor is undefined lehet, ha
    // status='warning' vagy 'degraded' (valid:true), mert invalid JWT-nél
    // előbb térünk vissza claims nélkül. Ha a cong_id hiányzik, az is hibás
    // állapot — explicit ellenőrizzük.
    const license = await validateCurrentLicense()
    const congregationId = license.claims?.cong_id
    if (!license.claims || !congregationId) {
      return NextResponse.json(
        {
          error:
            'Nincs érvényes licensz vagy hiányzó gyülekezet-azonosító — ' +
            'futtasd az első indítási varázslót',
        },
        { status: 401 },
      )
    }
    // Expired / blocked state esetén is megtagadjuk — különben a sync a felhőn
    // elakadna, és félrevezető "success" válaszokat generálna
    if (license.status === 'blocked' || license.status === 'invalid') {
      return NextResponse.json(
        {
          error:
            'A licensz állapota miatt a sync nem indítható: ' + license.status,
        },
        { status: 403 },
      )
    }

    const result = await performMonthlySync({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      congregationId,
      authToken,
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error('[/api/standalone/monthly-sync]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ismeretlen hiba' },
      { status: 500 },
    )
  } finally {
    // KRITIKUS: a lock MINDIG felszabaduljon, különben a sync soha többé nem
    // indulhatna (a szervert kellene újraindítani). A finally garantálja ezt.
    syncInProgress = false
  }
}
