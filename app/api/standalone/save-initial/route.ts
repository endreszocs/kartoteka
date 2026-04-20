import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { isStandaloneMode } from '@/lib/standalone/runtime-detect'

/**
 * POST /api/standalone/save-initial
 *
 * Menti a wizard adatait a Supabase-re (profil + gyülekezet + pénzügy beállítások).
 * A kliens-oldali SQLite tükrözés a pull phase-ben történik meg.
 *
 * Payload: { userId, congregationId, congregation, pastor, finance }
 */
export async function POST(request: Request) {
  if (!isStandaloneMode()) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  try {
    const payload = await request.json()
    const { userId, congregationId, congregation, pastor, finance } = payload

    if (!userId || !congregationId) {
      return NextResponse.json(
        { error: 'Hiányzó felhasználó vagy gyülekezet azonosító' },
        { status: 400 },
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    // Gyülekezet frissítés (csak ha admin user — szabályozottan)
    const { error: congError } = await supabase
      .from('congregations')
      .update({
        name: congregation.nev,
        nev_hu: congregation.nev_hu || congregation.nev,
        nev_ro: congregation.nev_ro || null,
        adoszam: congregation.adoszam || null,
        bejegyzesiszam: congregation.bejegyzesiszam || null,
        cim: congregation.cim,
        email: congregation.email || null,
        telefon: congregation.telefon || null,
        web: congregation.web || null,
        iban: congregation.iban || null,
        bank: congregation.bank || null,
      })
      .eq('id', congregationId)

    if (congError) {
      console.error('[save-initial congregation]', congError)
      // Nem blokkoló — a profil mentés még futhat
    }

    // Pastor profile upsert
    const { error: pastorError } = await supabase
      .from('pastor_profiles')
      .upsert({
        user_id: userId,
        address: null,
        emergency_phone: pastor.phone || null,
        service_started_at: pastor.serviceStartedAt || null,
        previous_service_places: pastor.previousPlaces
          ? [pastor.previousPlaces]
          : [],
      })

    if (pastorError) {
      console.error('[save-initial pastor]', pastorError)
    }

    // Profil (név) frissítés
    if (pastor.fullName) {
      await supabase
        .from('profiles')
        .update({
          full_name: pastor.fullName,
          phone: pastor.phone || null,
          birth_date: pastor.birthDate || null,
        })
        .eq('id', userId)
    }

    // Pénzügyi alapbeállítások (bealitas táblába a jelenlegi évre)
    const currentYear = new Date().getFullYear()
    const { error: bealitasError } = await supabase
      .from('bealitas')
      .upsert({
        id: String(currentYear),
        congregation_id: congregationId,
        eves_jarulek: finance.eves_jarulek,
        jarulek_kedvezmenyes: finance.jarulek_kedvezmenyes,
        jarulek_hatarid: finance.jarulek_hatarid,
        nyito_keszpenz: finance.nyito_keszpenz || 0,
        nyito_bank: finance.nyito_bank || 0,
        aktiv: true,
        isszemelyibefizetes: false,
        isszulokkulon: false,
        felmentes70felul: false,
        felmentesideneskudtek: false,
        kedvezmenyxevenfelul: false,
        utcaid: 1,
      })

    if (bealitasError) {
      console.error('[save-initial bealitas]', bealitasError)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[/api/standalone/save-initial]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ismeretlen hiba' },
      { status: 500 },
    )
  }
}
