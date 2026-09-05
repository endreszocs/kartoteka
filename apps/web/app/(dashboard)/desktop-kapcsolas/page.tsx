import { cookies } from 'next/headers'
import { MonitorSmartphone } from 'lucide-react'

import { PageHero } from '@kartoteka/ui-app'
import { DesktopKapcsolasPanel } from '@/components/desktop/desktop-kapcsolas-panel'
import { DESKTOP_KAPCSOLAS_SUTI } from '@/lib/desktop-kapcsolas/szerver'
import { KAPCSOLAS_ID_MINTA } from '@kartoteka/supabase-client'

/**
 * /desktop-kapcsolas — az ASZTALI ALKALMAZÁS JÓVÁHAGYÓ OLDALA (2026-09-05).
 *
 * Ide az asztali app által megnyitott /api/desktop-kapcsolas/nyit?id=… vezet
 * (a kérés-azonosító sütibe kerül), vagy a kezdőlap emlékeztető-sávja.
 * A (dashboard) csoport MINDEN kapuja érvényes rá: bejelentkezés, aktív
 * profil, kétlépcsős belépés, munkamenet-lejárat — ezért nem a nyilvános
 * (auth) csoportban él. Kijelentkezett látogató a /login-ra kerül, a süti
 * megmarad, és belépés után a sáv visszahozza ide.
 *
 * ⚠️ `use client` NINCS ezen az oldalon (PageHero + függvény-prop = éles 500
 *    hibaosztály); az interaktív rész saját kliens-komponens.
 */

export const dynamic = 'force-dynamic'

export default async function DesktopKapcsolasPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; hiba?: string }>
}) {
  const params = await searchParams
  const sutik = await cookies()
  const sutiId = sutik.get(DESKTOP_KAPCSOLAS_SUTI)?.value ?? null
  const jelolt = (params.id ?? sutiId ?? '').toLowerCase()
  const id = KAPCSOLAS_ID_MINTA.test(jelolt) ? jelolt : null

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Asztali alkalmazás"
        title="Gép összekapcsolása a fiókoddal"
        description="Az asztali Kartotéka jelszó nélkül, ezen a webes bejelentkezésen keresztül kapcsolódik a fiókodhoz. Hasonlítsd össze az ellenőrző kódot a gépen látható számmal, és csak akkor hagyd jóvá, ha egyezik."
        Icon={MonitorSmartphone}
      />
      <DesktopKapcsolasPanel id={id} hiba={params.hiba ?? null} />
    </div>
  )
}
