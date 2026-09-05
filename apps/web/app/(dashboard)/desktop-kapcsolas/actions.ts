'use server'

import { cookies } from 'next/headers'

import { logAuditEvent } from '@/lib/audit/log'
import { isMasterAdmin } from '@/lib/auth/roles'
import {
  DESKTOP_KAPCSOLAS_SUTI,
  elutasitKapcsolast,
  jovahagyKapcsolast,
  olvasKapcsolasKeres,
  type KapcsolasKeresOlvasat,
} from '@/lib/desktop-kapcsolas/szerver'
import { kellEMasodikFaktor } from '@/lib/supabase/middleware'
import { createClient } from '@/lib/supabase/server'
import { KAPCSOLAS_ID_MINTA } from '@kartoteka/supabase-client'

/**
 * Asztali eszköz-kapcsolás — a JÓVÁHAGYÓ oldal szerver-akciói (2026-09-05).
 *
 * KAPUK (mind a szerveren, mind fail-closed):
 *  1. bejelentkezett felhasználó, e-mail címmel;
 *  2. AKTÍV profil (a jóváhagyásra váró / letiltott fiók nem kapcsolhat gépet
 *     — a rendszergazda mentesül, mint a dashboard-layoutban);
 *  3. kétlépcsős belépés: ha a fiókon van ellenőrzött faktor, CSAK aal2-es
 *     munkamenet hagyhat jóvá — különben egy ellopott jelszóval a 2FA
 *     megkerülhető lenne egy asztali gép hozzácsatolásával.
 */

/**
 * 2026-09-05 (P3-utómunka, ellenőrzés): a jóváhagyó LÁSSA, ha egy MÁSIK gép
 * jóváhagyását az asztali app még nem vette át — a mostani jóváhagyás azt
 * felülírja (a GoTrue fiókonként EGY recovery-tokent tart), ott újra kell
 * indítani az összekapcsolást. `'ismeretlen'` = a vizsgálat hibázott (nem
 * állítjuk hamisan, hogy nincs); `null` = nincs ilyen függő jóváhagyás.
 */
export type MasikGepVarakozik = { eszkozNev: string | null; jovahagyvaAt: string | null } | 'ismeretlen' | null

export interface KapcsolasKeresNezet {
  id: string
  eszkozNev: string | null
  ellenorzoKod: string
  allapot: 'varakozik' | 'jovahagyva' | 'felhasznalva' | 'lejart' | 'elutasitva'
  lejar: string
  lejartE: boolean
  masikGepVarakozik: MasikGepVarakozik
}

/** A szerver-réteg jelzése → a felület alakja (modul-privát: a 'use server' fájl csak async függvényt exportálhat). */
function masikGepVarakozikNezet(jelzes: KapcsolasKeresOlvasat['masikFuggoJovahagyas']): MasikGepVarakozik {
  if (!jelzes || jelzes.allapot === 'nincs') return null
  if (jelzes.allapot === 'ismeretlen') return 'ismeretlen'
  return { eszkozNev: jelzes.eszkoz_nev, jovahagyvaAt: jelzes.jovahagyva_at }
}

async function aktivFelhasznalo(): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; error: string; masodikFaktor?: boolean }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nincs bejelentkezett felhasználó.' }
  if (!user.email) return { ok: false, error: 'A fiókodhoz nem tartozik e-mail cím — így az asztali belépő nem állítható elő.' }

  // 2FA-kapu — a SZERVER faktor-listája dönt (a süti nem hiteles forrás).
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (kellEMasodikFaktor(user, aal?.currentLevel)) {
    return {
      ok: false,
      masodikFaktor: true,
      error: 'Előbb fejezd be a kétlépcsős belépést (a hitelesítő alkalmazás kódjával), utána jöhet az asztali gép jóváhagyása.',
    }
  }

  if (!isMasterAdmin(user.email)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .maybeSingle()
    if ((profile as { status?: string } | null)?.status !== 'active') {
      return { ok: false, error: 'A fiókod még nem aktív — az asztali alkalmazás a jóváhagyás után kapcsolható.' }
    }
  }
  return { ok: true, userId: user.id, email: user.email }
}

/** A kérés nem titkos adatai a jóváhagyó oldalnak. */
export async function getKapcsolasKeres(id: string): Promise<{ keres?: KapcsolasKeresNezet; error?: string }> {
  if (!KAPCSOLAS_ID_MINTA.test(id)) return { error: 'Érvénytelen kérés-azonosító.' }
  const f = await aktivFelhasznalo()
  if (!f.ok) return { error: f.error }
  // A userId-vel a szerver azt is megmondja, van-e a felhasználónak MÁSIK, még át
  // nem vett jóváhagyása — a lelkész a jóváhagyás ELŐTT lássa, hogy azt felülírná.
  const sor = await olvasKapcsolasKeres(id.toLowerCase(), f.userId)
  if (!sor) return { error: 'A kérés nem található — az asztali alkalmazásban indíts újat.' }
  return {
    keres: {
      id: sor.id,
      eszkozNev: sor.eszkoz_nev,
      ellenorzoKod: sor.ellenorzo_kod,
      allapot: sor.allapot,
      lejar: sor.lejar,
      lejartE: new Date(sor.lejar).getTime() < Date.now(),
      masikGepVarakozik: masikGepVarakozikNezet(sor.masikFuggoJovahagyas),
    },
  }
}

async function torolSutit(): Promise<void> {
  try {
    const c = await cookies()
    c.delete(DESKTOP_KAPCSOLAS_SUTI)
  } catch {
    /* a süti törlése best-effort — 15 perc múlva magától lejár */
  }
}

/**
 * Jóváhagyás. A `felulirva` a MÉG ÉLŐ korábbi jóváhagyások száma, amelyeket ez
 * a jóváhagyás lezárt (a másik gépen újra kell indítani az összekapcsolást) —
 * a felület ezt kiírja, nem hallgatja el.
 */
export async function jovahagyDesktopKapcsolas(
  id: string,
): Promise<{ ok: boolean; error?: string; masodikFaktor?: boolean; felulirva?: number }> {
  if (!KAPCSOLAS_ID_MINTA.test(id)) return { ok: false, error: 'Érvénytelen kérés-azonosító.' }
  const f = await aktivFelhasznalo()
  if (!f.ok) return { ok: false, error: f.error, masodikFaktor: f.masodikFaktor }

  const sor = await olvasKapcsolasKeres(id.toLowerCase())
  const eredmeny = await jovahagyKapcsolast({ id: id.toLowerCase(), userId: f.userId, email: f.email })
  if (!eredmeny.ok) return { ok: false, error: eredmeny.error }

  await torolSutit()
  // A naplóba a kérés-azonosító és az eszköz neve kerül — kód/token SOHA.
  await logAuditEvent({
    action: 'desktop.kapcsolas_jovahagyva',
    targetTable: 'desktop_kapcsolas',
    targetId: id.toLowerCase(),
    metadata: { eszkoz_nev: sor?.eszkoz_nev ?? null },
  })
  return { ok: true, felulirva: eredmeny.felulirva }
}

export async function elutasitDesktopKapcsolas(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!KAPCSOLAS_ID_MINTA.test(id)) return { ok: false, error: 'Érvénytelen kérés-azonosító.' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nincs bejelentkezett felhasználó.' }
  await elutasitKapcsolast(id.toLowerCase())
  await torolSutit()
  await logAuditEvent({
    action: 'desktop.kapcsolas_elutasitva',
    targetTable: 'desktop_kapcsolas',
    targetId: id.toLowerCase(),
  })
  return { ok: true }
}
