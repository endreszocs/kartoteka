import 'server-only'

/**
 * Asztali eszköz-kapcsolás — SZERVER-OLDALI közös réteg (2026-09-05).
 *
 * Itt él minden, ami a `desktop_kapcsolas` táblát ÍRJA. A táblát a kliens
 * közvetlenül nem írhatja (RLS: authenticated csak a saját, felhasznált
 * sorait olvassa/törli), ezért minden írás az admin-kliensen (service_role)
 * megy, és ITT — nem szétszórva az API-útvonalakban — van a szabály.
 *
 * ⚠️ SOHA nem naplózzuk a nyers kódot és a token_hash-t.
 */

import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { hashIp } from '@/lib/utils/ip-hash'
import {
  KAPCSOLAS_LEJARAT_MS,
  kapcsolasiKodHash,
  ellenorzoKod,
  ESZKOZ_NEV_MAX,
  type DesktopKapcsolasAllapotValasz,
} from '@kartoteka/supabase-client'

/** A süti neve, amiben a böngésző a kérés-azonosítót viszi át a bejelentkezésen. */
export const DESKTOP_KAPCSOLAS_SUTI = 'kt-desktop-kapcsolas'
/** A süti élettartama — a kérés úgyis 10 perc alatt lejár. */
export const DESKTOP_KAPCSOLAS_SUTI_MP = 15 * 60

/**
 * SPAM-FÉK — MINDIG KÉT KAPU, EGYMÁS UTÁN (2026-09-05, a bíráló P2 találata):
 *
 *  1. GLOBÁLIS óránkénti plafon — FELTÉTEL NÉLKÜL, IP-vel is. MIÉRT: az IP az
 *     `x-forwarded-for` ELSŐ tagja (lib/utils/ip-hash.ts), amit a kliens maga
 *     is beírhat (a Railway-edge felülírása nem bizonyított). Forgó hamis
 *     IP-kkel a per-IP fék SOHA nem ütne — ha a globális csak a NULL-IP ág
 *     tartaléka volna, a tábla korlátlanul tölthető lenne.
 *  2. A KÉRŐ VÖDRE: IP-hash-enként 30/óra; IP NÉLKÜL (nincs cf-connecting-ip /
 *     x-forwarded-for / x-real-ip) az azonosítatlan kérők EGY közös, szigorúbb
 *     vödörbe esnek. A régi rate-limit RPC „NULL ip_hash → feltétel nélkül
 *     átenged" mintáját (a felülvizsgálat P3 találata) SZÁNDÉKOSAN nem
 *     másoljuk: az azonosítatlan kérő korlátot kap, nem szabad utat.
 *
 * Őrszem: scripts/selftest-desktop-kapcsolas.mjs W3–W3d (+ W3n mutáns).
 */
const INDITAS_ORANKENTI_PLAFON = 30
const INDITAS_NEVTELEN_ORANKENTI_PLAFON = 60
const INDITAS_GLOBALIS_ORANKENTI_PLAFON = 200

type KeroSzuro = { ipHash: string } | { nevtelen: true } | null

/** Az utolsó óra kéréseinek száma — globálisan (null), egy IP-re, vagy a névtelen vödörre. */
async function utolsoOraKeresek(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  egyOrajaIso: string,
  szuro: KeroSzuro,
): Promise<{ count: number } | { error: string }> {
  let q = admin
    .from('desktop_kapcsolas')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', egyOrajaIso)
  if (szuro && 'ipHash' in szuro) q = q.eq('ip_hash', szuro.ipHash)
  else if (szuro && 'nevtelen' in szuro) q = q.is('ip_hash', null)
  const { count, error } = await q
  if (error) return { error: error.message }
  return { count: count ?? 0 }
}

export interface DesktopKapcsolasSor {
  id: string
  kod_hash: string
  ellenorzo_kod: string
  eszkoz_nev: string | null
  allapot: 'varakozik' | 'jovahagyva' | 'felhasznalva' | 'lejart' | 'elutasitva'
  user_id: string | null
  token_hash: string | null
  created_at: string
  lejar: string
  jovahagyva_at: string | null
  felhasznalva_at: string | null
}

export function tisztaEszkozNev(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // Vezérlőkarakterek ki (ESCAPE-szekvenciával írva — a literális vezérlőkarakter
  // a regexben a projekt ismert hibaosztálya), hossz-plafon.
  const t = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.slice(0, ESZKOZ_NEV_MAX)
}

/** Best-effort takarítás: a napnál régebbi, lejárt kérések és az ottfelejtett tokenek. */
async function takarit(): Promise<void> {
  try {
    const admin = getSupabaseAdminClient()
    await admin.rpc('desktop_kapcsolas_takaritas')
  } catch {
    /* best-effort — a takarítás hibája nem állítja meg a kérést */
  }
}

/**
 * Új kérés az asztali apptól. A nyers kódból CSAK a hash és az ellenőrző kód
 * kerül tárolásra. Visszaadja a nem-titkos kérés-azonosítót.
 */
export async function inditKapcsolast(input: {
  kod: string
  eszkozNev: string | null
  ip: string | null
}): Promise<
  | { ok: true; id: string; ellenorzoKod: string; lejar: string }
  | { ok: false; status: 429 | 503; error: string }
> {
  const admin = getSupabaseAdminClient()
  const ipHash = hashIp(input.ip)

  void takarit()

  {
    const egyOrajaIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const [globalis, kero] = await Promise.all([
      utolsoOraKeresek(admin, egyOrajaIso, null),
      utolsoOraKeresek(admin, egyOrajaIso, ipHash ? { ipHash } : { nevtelen: true }),
    ])
    if ('error' in globalis || 'error' in kero) {
      const uzenet = 'error' in globalis ? globalis.error : 'error' in kero ? kero.error : 'ismeretlen'
      console.error('[desktop-kapcsolas] a spam-fék lekérdezése nem sikerült:', uzenet)
      return { ok: false, status: 503, error: 'A kapcsolás most nem indítható — próbáld újra pár perc múlva.' }
    }
    // 1. kapu — GLOBÁLIS, feltétel nélkül (a hamisítható IP ellen).
    if (globalis.count >= INDITAS_GLOBALIS_ORANKENTI_PLAFON) {
      return { ok: false, status: 429, error: 'Túl sok kapcsolási kérés érkezett a rendszerbe. Próbáld újra egy óra múlva.' }
    }
    // 2. kapu — a kérő vödre: IP-nként 30, azonosítatlanul 60.
    const keroPlafon = ipHash ? INDITAS_ORANKENTI_PLAFON : INDITAS_NEVTELEN_ORANKENTI_PLAFON
    if (kero.count >= keroPlafon) {
      return { ok: false, status: 429, error: 'Túl sok kapcsolási kérés erről a hálózatról. Próbáld újra egy óra múlva.' }
    }
  }

  const [kodHash, ellenorzo] = await Promise.all([kapcsolasiKodHash(input.kod), ellenorzoKod(input.kod)])
  const lejar = new Date(Date.now() + KAPCSOLAS_LEJARAT_MS).toISOString()

  const { data, error } = await admin
    .from('desktop_kapcsolas')
    .insert({
      kod_hash: kodHash,
      ellenorzo_kod: ellenorzo,
      eszkoz_nev: input.eszkozNev,
      allapot: 'varakozik',
      ip_hash: ipHash,
      lejar,
    })
    .select('id')
    .maybeSingle()

  if (error || !data) {
    // 23505 = ugyanaz a kód kétszer — gyakorlatilag lehetetlen (256 bit), de
    // ha mégis, az app egyszerűen új kódot generál.
    console.error('[desktop-kapcsolas] a kérés rögzítése nem sikerült:', error?.code ?? 'nincs sor')
    return { ok: false, status: 503, error: 'A kapcsolás most nem indítható — próbáld újra.' }
  }

  return { ok: true, id: (data as { id: string }).id, ellenorzoKod: ellenorzo, lejar }
}

/**
 * Az asztali app állapot-lekérdezése a TITKOS kóddal. Jóváhagyott kérésnél a
 * belépő-tokent PONTOSAN EGYSZER adja ki: a sor atomikusan „felhasználva"
 * lesz, a token törlődik. Két párhuzamos lekérdezésből csak az egyik nyer.
 */
export async function lekerKapcsolasAllapot(kod: string): Promise<DesktopKapcsolasAllapotValasz> {
  const admin = getSupabaseAdminClient()
  const kodHash = await kapcsolasiKodHash(kod)

  const { data, error } = await admin
    .from('desktop_kapcsolas')
    .select('id, allapot, token_hash, lejar')
    .eq('kod_hash', kodHash)
    .maybeSingle()

  if (error) {
    console.error('[desktop-kapcsolas] állapot-lekérdezés hiba:', error.message)
    return { allapot: 'ismeretlen', uzenet: 'A szerver most nem válaszol — az app újra próbálja.' }
  }
  if (!data) return { allapot: 'ismeretlen', uzenet: 'Ismeretlen vagy már törölt kérés.' }

  const sor = data as Pick<DesktopKapcsolasSor, 'id' | 'allapot' | 'token_hash' | 'lejar'>

  if (sor.allapot === 'varakozik' && new Date(sor.lejar).getTime() < Date.now()) {
    await admin.from('desktop_kapcsolas').update({ allapot: 'lejart' }).eq('id', sor.id).eq('allapot', 'varakozik')
    return { allapot: 'lejart', uzenet: 'A kérés lejárt (10 perc). Indíts újat.' }
  }

  if (sor.allapot !== 'jovahagyva') {
    return { allapot: sor.allapot }
  }

  // ATOMIKUS igénylés: csak az a hívó kapja a tokent, akinek az UPDATE-je
  // még 'jovahagyva' állapotú sort talált.
  const { data: igenyelt, error: igenyError } = await admin
    .from('desktop_kapcsolas')
    .update({ allapot: 'felhasznalva', token_hash: null, felhasznalva_at: new Date().toISOString() })
    .eq('id', sor.id)
    .eq('allapot', 'jovahagyva')
    .select('id')
    .maybeSingle()

  if (igenyError) {
    console.error('[desktop-kapcsolas] a token igénylése nem sikerült:', igenyError.message)
    return { allapot: 'ismeretlen', uzenet: 'A szerver most nem válaszol — az app újra próbálja.' }
  }
  if (!igenyelt || !sor.token_hash) {
    // Valaki (a párhuzamos lekérdezés) már elvitte — ez a hívó nem kap tokent.
    return { allapot: 'felhasznalva', uzenet: 'A belépő-token már fel lett használva.' }
  }

  return { allapot: 'jovahagyva', tokenHash: sor.token_hash }
}

/** A jóváhagyó oldal számára: a sor NEM titkos része az azonosító alapján. */
export async function olvasKapcsolasKeres(id: string): Promise<Omit<DesktopKapcsolasSor, 'kod_hash' | 'token_hash'> | null> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('desktop_kapcsolas')
    .select('id, ellenorzo_kod, eszkoz_nev, allapot, user_id, created_at, lejar, jovahagyva_at, felhasznalva_at')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return data as Omit<DesktopKapcsolasSor, 'kod_hash' | 'token_hash'>
}

/**
 * JÓVÁHAGYÁS a bejelentkezett felhasználó nevében: egyszer használatos
 * belépő-token (GoTrue magic-link token_hash) kerül a sorba. A hívó előtte
 * ellenőrizte, hogy a fiók aktív.
 */
export async function jovahagyKapcsolast(input: {
  id: string
  userId: string
  email: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = getSupabaseAdminClient()

  const sor = await olvasKapcsolasKeres(input.id)
  if (!sor) return { ok: false, error: 'A kérés nem található — az asztali alkalmazásban indíts újat.' }
  if (sor.allapot !== 'varakozik') {
    return { ok: false, error: 'Ez a kérés már nem vár jóváhagyásra (lejárt, elutasított vagy már jóváhagyott).' }
  }
  if (new Date(sor.lejar).getTime() < Date.now()) {
    await admin.from('desktop_kapcsolas').update({ allapot: 'lejart' }).eq('id', input.id).eq('allapot', 'varakozik')
    return { ok: false, error: 'A kérés lejárt (10 perc). Az asztali alkalmazásban indíts újat.' }
  }

  // Egyszer használatos belépő a JÓVÁHAGYÓ fiókjára. Nem küld levelet.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: input.email,
  })
  if (linkError || !link?.properties?.hashed_token) {
    console.error('[desktop-kapcsolas] a belépő-token előállítása nem sikerült:', linkError?.code ?? 'nincs token')
    return { ok: false, error: 'A belépő előállítása nem sikerült — próbáld újra, vagy jelezd a rendszergazdának.' }
  }
  if (link.user?.id && link.user.id !== input.userId) {
    // Védelmi biztosíték: a token CSAK a jóváhagyó fiókjához tartozhat.
    console.error('[desktop-kapcsolas] a belépő-token más fiókhoz tartozik — megszakítva')
    return { ok: false, error: 'A belépő előállítása nem sikerült (fiók-eltérés).' }
  }

  const { data: frissitve, error: updError } = await admin
    .from('desktop_kapcsolas')
    .update({
      allapot: 'jovahagyva',
      user_id: input.userId,
      token_hash: link.properties.hashed_token,
      jovahagyva_at: new Date().toISOString(),
    })
    .eq('id', input.id)
    .eq('allapot', 'varakozik')
    .select('id')
    .maybeSingle()

  if (updError || !frissitve) {
    console.error('[desktop-kapcsolas] a jóváhagyás rögzítése nem sikerült:', updError?.message ?? 'nincs sor')
    return { ok: false, error: 'A jóváhagyás rögzítése nem sikerült — próbáld újra.' }
  }
  return { ok: true }
}

export async function elutasitKapcsolast(id: string): Promise<void> {
  const admin = getSupabaseAdminClient()
  await admin
    .from('desktop_kapcsolas')
    .update({ allapot: 'elutasitva', token_hash: null })
    .eq('id', id)
    .in('allapot', ['varakozik', 'jovahagyva'])
}
