// Supabase Edge Function: issue-license
//
// Generál egy aláírt JWT-t a KARTOTEKA standalone klienseknek.
// A privát kulcs a Supabase env-ben tárolt (LICENSE_PRIVATE_KEY_PEM),
// a kliens csak ezt a funkciót hívhatja, közvetlenül a privát kulcsot
// soha nem látja.
//
// Auth: Supabase user JWT (a kliens authenticált lesz)
// Input: { fingerprint: string, osInfo?: string, appVersion?: string }
// Output: { token: string, licenseId: string, expiresAt: string }
//
// DEPLOYMENT:
//   1. Generálj egy RSA 2048 kulcspárt:
//      openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048
//      openssl rsa -in private.pem -pubout -out public.pem
//   2. A privát kulcsot Supabase Secret-be töltsd:
//      supabase secrets set LICENSE_PRIVATE_KEY_PEM="$(cat private.pem)"
//   3. A publikus kulcsot a KARTOTEKA build env-be:
//      LICENSE_PUBLIC_KEY_PEM="$(cat public.pem)"
//   4. Deploy:
//      supabase functions deploy issue-license

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SignJWT, importPKCS8 } from 'npm:jose@5'

// DIAGNOSTICS P3-6: CORS narrow-elés — wildcard '*' helyett explicit
// origin whitelist. A JWT-validáció önmagában is véd, de a CORS pluszként
// elzárja a böngésző-szintű cross-origin hozzáférést a publikus oldalakról.
const ALLOWED_ORIGINS = new Set<string>([
  'https://kartotekaweb-production.up.railway.app',
  'tauri://localhost',
  // Dev: helyi Next.js + Tauri Vite
  'http://localhost:3000',
  'http://localhost:5173',
])

function corsHeadersForRequest(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : 'https://kartotekaweb-production.up.railway.app'
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

interface LicensePayload {
  sub: string
  cong_id: string
  fp: string
  iat: number
  exp: number
  lv: number
  role?: string
}

// @ts-ignore — Deno globalThis
Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersForRequest(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  try {
    // Auth header (a Supabase user JWT)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' } },
      )
    }

    // Body parsing
    const body = await req.json()
    const fingerprint = body.fingerprint as string | undefined
    const osInfo = (body.osInfo as string | undefined) ?? null
    const appVersion = (body.appVersion as string | undefined) ?? '1.0.0'

    if (!fingerprint || fingerprint.length < 32) {
      return new Response(
        JSON.stringify({ error: 'Invalid fingerprint' }),
        { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } },
      )
    }

    // Supabase admin kliens (service role)
    // @ts-ignore — Deno env
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    // @ts-ignore — Deno env
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // User JWT validálás
    const userClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid user token: ' + (userError?.message || 'unknown') }),
        { status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' } },
      )
    }

    // RPC hívás: issue_license — visszaadja a licensz adatait
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null
    const userAgent = req.headers.get('user-agent') || null

    const { data: licenseData, error: rpcError } = await userClient.rpc('issue_license', {
      p_fingerprint: fingerprint,
      p_os_info: osInfo,
      p_app_version: appVersion,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    })

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: 'License issue failed: ' + rpcError.message }),
        { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
      )
    }

    const license = Array.isArray(licenseData) ? licenseData[0] : licenseData
    if (!license) {
      return new Response(
        JSON.stringify({ error: 'No license returned from RPC' }),
        { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
      )
    }

    // Profile (role meghatározás)
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()

    // JWT aláírás
    // @ts-ignore — Deno env
    const privateKeyPem = Deno.env.get('LICENSE_PRIVATE_KEY_PEM')
    if (!privateKeyPem) {
      return new Response(
        JSON.stringify({ error: 'LICENSE_PRIVATE_KEY_PEM env var not set on server' }),
        { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
      )
    }

    const privateKey = await importPKCS8(privateKeyPem, 'PS256')

    const now = Math.floor(Date.now() / 1000)
    const exp = Math.floor(new Date(license.expires_at).getTime() / 1000)

    const claims: LicensePayload = {
      sub: license.user_id,
      cong_id: license.congregation_id,
      fp: fingerprint,
      iat: now,
      exp,
      lv: 1,
      role: profile?.role ?? undefined,
    }

    const token = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'PS256', typ: 'JWT' })
      .sign(privateKey)

    return new Response(
      JSON.stringify({
        token,
        licenseId: license.license_id,
        userId: license.user_id,
        congregationId: license.congregation_id,
        expiresAt: license.expires_at,
        issuedAt: license.issued_at,
      }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  } catch (e) {
    console.error('[issue-license]', e)
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }
})
