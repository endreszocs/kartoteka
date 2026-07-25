import type { Metadata } from 'next'

import { MobilFeltolto } from './mobil-feltolto'

/**
 * Iktató F8d — publikus, bejelentkezés nélküli mobil feltöltő oldal.
 *
 * Az útvonal a `proxy.ts` middleware publikus listáján van
 * (lib/supabase/middleware.ts → PUBLIC_AUTH_ROUTES), különben a rendszer
 * /login-ra irányítaná a telefont — ez ismert csapda-hely (a /reset-password
 * pontosan emiatt került fel annak idején).
 *
 * A tokent kizárólag a kliens-komponens használja (RPC-hívások paramétere);
 * szerver-oldalon nem oldjuk fel, nem naplózzuk, és nem tesszük metaadatba.
 */

export const metadata: Metadata = {
  title: 'Irat feltöltése — Kartotéka',
  description: 'Iktatott irat oldalainak feltöltése telefonról, QR-kódos munkamenettel.',
  // A rövid életű feltöltő-lapot semmilyen kereső ne indexelje.
  robots: { index: false, follow: false, nocache: true },
}

export default async function MobilFeltoltesPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <MobilFeltolto token={token} />
}
