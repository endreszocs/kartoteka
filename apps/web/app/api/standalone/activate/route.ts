import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { isStandaloneMode } from '@/lib/standalone/runtime-detect'
import { getMachineFingerprint } from '@/lib/standalone/machine-fingerprint'
import { DEFAULT_DEV_PRIVATE_KEY, issueLicenseToken } from '@/lib/standalone/license-jwt'
import os from 'os'

/**
 * POST /api/standalone/activate
 *
 * Aktiválás folyamata:
 *  1. Supabase email + jelszó bejelentkezés
 *  2. Profile + congregation lekérdezés
 *  3. Machine fingerprint generálás (Level 2 DEEP)
 *  4. JWT licensz kérése:
 *     - PRODUCTION: a Supabase Edge Function `issue-license` hívása
 *     - DEV: helyi privát kulccsal
 *  5. Visszaadjuk a tokent + user/cong info-t
 *
 * CSAK standalone módban működik. Server módban 404-et ad.
 */
export async function POST(request: Request) {
  if (!isStandaloneMode()) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  try {
    const { email, password } = await request.json()
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email és jelszó kötelező' },
        { status: 400 },
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    // 1) Bejelentkezés
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.user || !authData.session) {
      return NextResponse.json(
        { error: 'Sikertelen bejelentkezés: ' + (authError?.message || 'Ismeretlen hiba') },
        { status: 401 },
      )
    }

    // 2) Profile + congregation
    const { data: profile } = await supabase
      .from('profiles')
      .select('congregation_id, full_name, role, status')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (!profile?.congregation_id) {
      return NextResponse.json(
        { error: 'A fiókhoz nincs gyülekezet rendelve. Fordulj az esperesi hivatalhoz.' },
        { status: 403 },
      )
    }

    if (profile.status !== 'active') {
      return NextResponse.json(
        { error: 'A fiók nem aktív állapotban van. Vedd fel a kapcsolatot az esperesi hivatallal.' },
        { status: 403 },
      )
    }

    // 3) Machine fingerprint — Level 2 DEEP (wmic, node-machine-id)
    // VM-eken vagy korlátozott Windows fiókokon a wmic hibázhat. Részletes
    // hibaüzenetet adunk, hogy a lelkész megtudja, miért nem aktiválódik.
    let fingerprint: string
    try {
      fingerprint = getMachineFingerprint()
    } catch (fpError) {
      const msg = fpError instanceof Error ? fpError.message : String(fpError)
      return NextResponse.json(
        {
          error:
            'Nem sikerült a gép-azonosító generálása. ' +
            'Ez általában a Windows fiók korlátai miatt fordul elő (pl. virtuális gép, ' +
            'admin nélküli fiók). Részletek: ' +
            msg,
        },
        { status: 500 },
      )
    }
    const osInfo = `${os.platform()} ${os.release()} ${os.arch()}`

    // 4) Licensz token kérése
    let token: string
    let licenseId: string | undefined
    let expiresAt: string | undefined
    let source: 'edge-function' | 'local-dev'

    const useEdgeFunction =
      process.env.LICENSE_USE_EDGE_FUNCTION === 'true' ||
      (!process.env.LICENSE_PRIVATE_KEY_PEM && process.env.NODE_ENV === 'production')

    if (useEdgeFunction) {
      // PRODUCTION: Supabase Edge Function hívás
      const edgeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/issue-license`
      const edgeResp = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${authData.session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({
          fingerprint,
          osInfo,
          appVersion: process.env.KARTOTEKA_VERSION || '1.0.0',
        }),
      })

      if (!edgeResp.ok) {
        const errBody = await edgeResp.json().catch(() => ({}))
        return NextResponse.json(
          {
            error:
              'Licensz kérés sikertelen (Edge Function): ' +
              (errBody.error || edgeResp.statusText),
          },
          { status: edgeResp.status },
        )
      }

      const edgeData = await edgeResp.json()
      token = edgeData.token
      licenseId = edgeData.licenseId
      expiresAt = edgeData.expiresAt
      source = 'edge-function'
    } else {
      // DEV: helyi RSA privát kulccsal aláírunk
      const privateKey = process.env.LICENSE_PRIVATE_KEY_PEM || DEFAULT_DEV_PRIVATE_KEY
      token = await issueLicenseToken({
        userId: authData.user.id,
        congregationId: profile.congregation_id,
        fingerprint,
        privateKeyPem: privateKey,
        role: profile.role ?? undefined,
        validityDays: 35,
      })
      expiresAt = new Date(Date.now() + 35 * 86400 * 1000).toISOString()
      source = 'local-dev'
    }

    return NextResponse.json({
      userId: authData.user.id,
      congregationId: profile.congregation_id,
      fullName: profile.full_name,
      role: profile.role,
      fingerprint: fingerprint.slice(0, 16) + '…',
      licenseId,
      expiresAt,
      source,
      token,
    })
  } catch (e) {
    console.error('[/api/standalone/activate]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ismeretlen hiba' },
      { status: 500 },
    )
  }
}
