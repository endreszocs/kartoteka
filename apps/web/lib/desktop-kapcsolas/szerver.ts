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

import { logAuditEvent } from '@/lib/audit/log'
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

type AdminKliens = ReturnType<typeof getSupabaseAdminClient>

/**
 * A `lejart` állapot üzenetei az asztali appnak. Az app a `lejart` választ
 * a `uzenet` mezővel EGYBEN mutatja (apps/desktop/src/lib/desktop-kapcsolas.ts),
 * ezért a szöveg maga mondja meg a lelkésznek, MI történt és MIT tegyen.
 *
 * MIÉRT NINCS KÜLÖN „felülírva" ÁLLAPOT: a tábla CHECK-je öt állapotot ismer
 * (varakozik, jovahagyva, felhasznalva, lejart, elutasitva), és ez a kör
 * sémaváltozás NÉLKÜL zárja a hibát. A felülírt jóváhagyás ezért `lejart`;
 * az ok a sor többi mezőjéből derül ki (lásd `lejartOka`).
 */
const LEJART_UZENET = {
  /** A lelkész nem hagyta jóvá 10 percen belül. */
  varakozasKozben: 'A kérés lejárt (10 perc). Indítsd újra az összekapcsolást.',
  /** Jóvá volt hagyva, de az asztali app a lejárat előtt nem kérte le a belépőt. */
  atvetelElott: 'A kérés lejárt, mielőtt az asztali alkalmazás átvette volna a belépőt. Indítsd újra az összekapcsolást.',
  /**
   * Egy ÚJABB jóváhagyás lezárta — ennek a gépnek a belépője nem adható ki.
   * ⚠️ A szöveg SZÁNDÉKOSAN nem állítja, hogy „egy másik gépet kapcsoltál
   * össze" (2026-09-05, a bíráló P3 találata): a lezárás a `generateLink`
   * ELŐTT fut, és ha a generateLink utána bukik, semmi nem kapcsolódott —
   * csak a lezárás történt meg. Az „egy újabb jóváhagyás lezárta" MINDKÉT
   * esetben igaz. Őrszem: W5b (a konkrét szövegre) + W5bn mutáns.
   */
  felulirva:
    'Ezt a jóváhagyást a fiókodon egy újabb jóváhagyás lezárta (a belépőt a fiók mindig csak a legutóbbi jóváhagyásnak adja). Indítsd újra az összekapcsolást ezen a gépen.',
  /** Már `lejart`, de nem dönthető el pontosan, melyik ok — mindkettőt megnevezzük. */
  altalanos: 'A kérés lejárt (10 perc), vagy egy újabb jóváhagyás felülírta. Indítsd újra az összekapcsolást.',
} as const

/**
 * Egy már `lejart` sor okának levezetése sémaváltozás nélkül: ha a sor jóvá
 * volt hagyva ÉS a lejárata még a jövőben van, akkor CSAK felülírás vihette
 * `lejart`-ra (időből nem járhatott le). Minden más esetben az általános
 * üzenet megy — inkább két okot nevezünk meg, mint egy hamisat.
 */
function lejartOka(sor: Pick<DesktopKapcsolasSor, 'lejar' | 'jovahagyva_at'>): string {
  const lejartE = new Date(sor.lejar).getTime() < Date.now()
  if (sor.jovahagyva_at && !lejartE) return LEJART_UZENET.felulirva
  return LEJART_UZENET.altalanos
}

/**
 * Egy sort `lejart`-ra zár, a tokent NULL-ozva — csak akkor, ha még az elvárt
 * állapotban van (a párhuzamos igénylés/jóváhagyás nem íródik felül).
 * A hiba a naplóig ér, de a hívó válaszát nem változtatja: a sor lejárt volta
 * a `lejar` mezőből amúgy is egyértelmű.
 */
async function lejartraAllit(admin: AdminKliens, id: string, elvartAllapot: 'varakozik' | 'jovahagyva'): Promise<void> {
  const { error } = await admin
    .from('desktop_kapcsolas')
    .update({ allapot: 'lejart', token_hash: null })
    .eq('id', id)
    .eq('allapot', elvartAllapot)
  if (error) console.error('[desktop-kapcsolas] a lejárt sor lezárása nem sikerült:', error.message)
}

/** A felülírt (korábbi) jóváhagyás nem titkos adatai — az audit-bejegyzéshez. */
interface FelulirtSor {
  id: string
  eszkoz_nev: string | null
  jovahagyva_at: string | null
  lejar: string
}

/** Élt-e még a felülírt jóváhagyás — az audit ne mondja „felülírva"-nak azt, ami már lejárt. */
function marLejartE(sor: Pick<FelulirtSor, 'lejar'>): boolean {
  return new Date(sor.lejar).getTime() < Date.now()
}

/**
 * A `generateLink` (vagy a fiók-eltérés kapu) a lezárás UTÁN bukott: a már
 * lezárt, még ÉLŐ korábbi jóváhagyások nem állíthatók vissza (token_hash
 * NULL), és utódjuk sem született. Nem néma: a napló őrzi, hány sor és melyik
 * zárult utód nélkül — titok nélkül (csak kérés-azonosító). A másik gép
 * üzenete ettől még igaz (`LEJART_UZENET.felulirva`). Őrszem: W4g + W4gn.
 */
function utodNelkulZarult(eloSorok: FelulirtSor[], ok: string): void {
  if (eloSorok.length === 0) return
  console.error(
    `[desktop-kapcsolas] ${eloSorok.length} korábbi jóváhagyás utód nélkül zárult le (${ok}):`,
    eloSorok.map((s) => s.id).join(', '),
  )
}

/**
 * ⛔ MIÉRT (2026-09-05, a bíráló P3 találata): a GoTrue
 * `generateLink({ type: 'magiclink' })` a fiók EGYETLEN recovery-tokenjét
 * cseréli. Ha ugyanaz a lelkész két gépről két kérést hagy jóvá gyorsan
 * egymás után, az ELSŐ gép sorában álló token_hash a második `generateLink`
 * pillanatában HALOTT lesz: az első gép a lekéréskor használhatatlan tokent
 * kapna, és a `verifyOtp`-je értelmezhetetlen hibával bukna.
 *
 * Ezért a jóváhagyás ELŐTT az ugyanazon felhasználó korábbi, még le nem kért
 * (`jovahagyva`) sorait `lejart`-ra állítjuk, token nélkül: az a gép a
 * következő lekérdezéskor ÉRTHETŐ üzenetet kap (`LEJART_UZENET.felulirva`),
 * nem egy halott tokent. Sémaváltozás nélkül — a `lejart` a CHECK-ben már
 * benne van. A MOST jóváhagyandó sort kihagyjuk (az még `varakozik`, de az
 * `neq` explicit is kimondja).
 *
 * Ami NEM zárható itt — KÉT versenyablak; mindkettőt az asztali app
 * verifyOtp-bukásra adott „indítsd újra" üzenete fogja fel (`belepoElhalt` →
 * BELEPO_ELHALT_UZENET, apps/desktop/src/lib/desktop-kapcsolas.ts), tehát nem
 * néma, de ott a szöveg az általános, nem a szerver pontos oka:
 *  1. A másik gép PONT ebben a pillanatban igényli a tokent (`felhasznalva`),
 *     de a `verifyOtp`-je csak a mi `generateLink`-ünk UTÁN fut → a token ott
 *     hal el. Másodperc alatti ablak.
 *  2. Ugyanaz a felhasználó KÉT kérést EGYSZERRE hagy jóvá (két böngészőlap,
 *     két gép): A és B lezáró lépése akkor fut, amikor MINDKÉT sor még
 *     `varakozik` (0 sort zár), majd A `generateLink`-je UTÁN B-é elpusztítja
 *     A tokenjét — A sora mégis `jovahagyva` lesz a már halott token_hash-sel.
 *     Az A gép a lekéréskor halott tokent kap. Sémaváltozás nélkül NEM
 *     zárható (a `jovahagyva_at` sorrendje nem a generateLink sorrendje, ezért
 *     utólagos söprés a MÉG ÉLŐ tokent is lezárhatná) — a lezárás + a saját
 *     sor `jovahagyva`-ra írása EGY RPC-ben, felhasználónként sorosítva
 *     (`pg_advisory_xact_lock(hashtext(user_id))`) zárná: későbbi SQL-kör.
 *
 * MIÉRT A generateLink ELŐTT (és nem után) — 2026-09-05, a bíráló P3
 * találata: ha a lezárás a generateLink UTÁN futna, a kettő közti ablakban a
 * másik gép a MÁR HALOTT tokent kapná, és ha a lezárás bukna, a másik gép sora
 * örökre halott tokennel állna `jovahagyva`-n. A mostani sorrend ára kisebb:
 * ha a generateLink (vagy a fiók-eltérés kapu) a lezárás UTÁN bukik, a másik
 * gép sora már zárva van, miközben a GoTrue-token még él — ott az újraindítás
 * fölösleges, de NEM hazug: a `LEJART_UZENET.felulirva` mindkét esetben igaz
 * („egy újabb jóváhagyás lezárta"), és a naplóba kerül, hogy N sor utód
 * nélkül zárult (`utodNelkulZarult`). A lezárt sor nem állítható vissza: a
 * token_hash már NULL.
 *
 * FAIL-CLOSED: ha a felülírás nem sikerül, a jóváhagyás NEM megy tovább —
 * különben épp a halott-token helyzetet gyártanánk le.
 */
async function felulirKorabbiJovahagyasokat(
  admin: AdminKliens,
  userId: string,
  kiveveId: string,
): Promise<{ ok: true; sorok: FelulirtSor[] } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from('desktop_kapcsolas')
    .update({ allapot: 'lejart', token_hash: null })
    .eq('user_id', userId)
    .eq('allapot', 'jovahagyva')
    .neq('id', kiveveId)
    .select('id, eszkoz_nev, jovahagyva_at, lejar')
  if (error) return { ok: false, error: error.message }
  return { ok: true, sorok: ((data ?? []) as FelulirtSor[]).filter((s) => typeof s?.id === 'string') }
}

/**
 * A jóváhagyó nézet jelzése: van-e a felhasználónak MÁSIK, jóváhagyott, de az
 * asztali app által még le nem kért (és még élő) kérése. Ha igen, a mostani
 * jóváhagyás azt felülírja — a lelkész lássa, hogy a másik gép várakozása
 * megszakad. Az `ismeretlen` ág nem néma: a hiba a naplóba kerül, és a hívó
 * eldöntheti, hogyan mutatja (nem állítjuk hamisan, hogy „nincs").
 */
export type MasikFuggoJovahagyas =
  | { allapot: 'nincs' }
  | { allapot: 'van'; id: string; eszkoz_nev: string | null; jovahagyva_at: string | null; lejar: string }
  | { allapot: 'ismeretlen'; hiba: string }

async function keresMasikFuggoJovahagyast(admin: AdminKliens, userId: string, kiveveId: string): Promise<MasikFuggoJovahagyas> {
  const { data, error } = await admin
    .from('desktop_kapcsolas')
    .select('id, eszkoz_nev, jovahagyva_at, lejar')
    .eq('user_id', userId)
    .eq('allapot', 'jovahagyva')
    .neq('id', kiveveId)
    .gt('lejar', new Date().toISOString())
    .order('jovahagyva_at', { ascending: false })
    .limit(1)
  if (error) {
    console.error('[desktop-kapcsolas] a másik függő jóváhagyás lekérdezése nem sikerült:', error.message)
    return { allapot: 'ismeretlen', hiba: error.message }
  }
  const sor = ((data ?? []) as Array<Pick<DesktopKapcsolasSor, 'id' | 'eszkoz_nev' | 'jovahagyva_at' | 'lejar'>>)[0]
  if (!sor) return { allapot: 'nincs' }
  return { allapot: 'van', id: sor.id, eszkoz_nev: sor.eszkoz_nev ?? null, jovahagyva_at: sor.jovahagyva_at ?? null, lejar: sor.lejar }
}

/**
 * Az asztali app állapot-lekérdezése a TITKOS kóddal. Jóváhagyott kérésnél a
 * belépő-tokent PONTOSAN EGYSZER adja ki: a sor atomikusan „felhasználva"
 * lesz, a token törlődik. Két párhuzamos lekérdezésből csak az egyik nyer.
 *
 * LEJÁRAT (2026-09-05, a bíráló P3 találata): a lejárat NEM CSAK a
 * `varakozik` sorra érvényes. Egy `jovahagyva` sor, amelynek a `lejar`-ja
 * elmúlt, TOKENT NEM AD — `lejart`-ra zárjuk, a tokent NULL-ozzuk. A már
 * `lejart` sorra (időből lejárt VAGY egy újabb jóváhagyás felülírta) az app
 * olyan üzenetet kap, amiből érti: indítsd újra.
 */
export async function lekerKapcsolasAllapot(kod: string): Promise<DesktopKapcsolasAllapotValasz> {
  const admin = getSupabaseAdminClient()
  const kodHash = await kapcsolasiKodHash(kod)

  const { data, error } = await admin
    .from('desktop_kapcsolas')
    .select('id, allapot, token_hash, lejar, jovahagyva_at')
    .eq('kod_hash', kodHash)
    .maybeSingle()

  if (error) {
    console.error('[desktop-kapcsolas] állapot-lekérdezés hiba:', error.message)
    return { allapot: 'ismeretlen', uzenet: 'A szerver most nem válaszol — az app újra próbálja.' }
  }
  if (!data) return { allapot: 'ismeretlen', uzenet: 'Ismeretlen vagy már törölt kérés.' }

  const sor = data as Pick<DesktopKapcsolasSor, 'id' | 'allapot' | 'token_hash' | 'lejar' | 'jovahagyva_at'>
  const lejartE = new Date(sor.lejar).getTime() < Date.now()

  if (sor.allapot === 'varakozik' && lejartE) {
    await lejartraAllit(admin, sor.id, 'varakozik')
    return { allapot: 'lejart', uzenet: LEJART_UZENET.varakozasKozben }
  }

  // ⛔ A lejárt JÓVÁHAGYOTT sor sem ad tokent: zárás + NULL token. Az
  // `.eq('allapot', 'jovahagyva')` miatt egy párhuzamos, épp nyerő igénylést
  // nem írunk felül — annak a válasza a sajátja marad.
  if (sor.allapot === 'jovahagyva' && lejartE) {
    await lejartraAllit(admin, sor.id, 'jovahagyva')
    return { allapot: 'lejart', uzenet: LEJART_UZENET.atvetelElott }
  }

  if (sor.allapot === 'lejart') {
    return { allapot: 'lejart', uzenet: lejartOka(sor) }
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

/** A jóváhagyó oldal olvasata: a sor NEM titkos része + a másik függő jóváhagyás jelzése. */
export interface KapcsolasKeresOlvasat extends Omit<DesktopKapcsolasSor, 'kod_hash' | 'token_hash'> {
  /**
   * Ugyanennek a felhasználónak egy MÁSIK, jóváhagyott, de az asztali app által
   * még le nem kért kérése — a mostani jóváhagyás ezt felülírná. CSAK akkor van
   * kitöltve, ha a hívó megadta a `userId`-t; `null` = nem vizsgáltuk (ne
   * tévesszük össze az `{ allapot: 'nincs' }`-csel).
   */
  masikFuggoJovahagyas: MasikFuggoJovahagyas | null
}

/**
 * A jóváhagyó oldal számára: a sor NEM titkos része az azonosító alapján.
 * A `userId` megadásával a válasz azt is hordozza, van-e a felhasználónak másik
 * függő jóváhagyása (a lelkész lássa, hogy a másik gép várakozása megszakad).
 */
export async function olvasKapcsolasKeres(id: string, userId?: string): Promise<KapcsolasKeresOlvasat | null> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('desktop_kapcsolas')
    .select('id, ellenorzo_kod, eszkoz_nev, allapot, user_id, created_at, lejar, jovahagyva_at, felhasznalva_at')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    // Nem néma: a hívó „nem található"-t mond, a napló viszont a valódi okot őrzi.
    console.error('[desktop-kapcsolas] a kérés olvasása nem sikerült:', error.message)
    return null
  }
  if (!data) return null
  const sor = data as Omit<DesktopKapcsolasSor, 'kod_hash' | 'token_hash'>
  return {
    ...sor,
    masikFuggoJovahagyas: userId ? await keresMasikFuggoJovahagyast(admin, userId, sor.id) : null,
  }
}

/**
 * JÓVÁHAGYÁS a bejelentkezett felhasználó nevében: egyszer használatos
 * belépő-token (GoTrue magic-link token_hash) kerül a sorba. A hívó előtte
 * ellenőrizte, hogy a fiók aktív.
 *
 * SORREND (szándékos): (1) a kérés még várakozik és él; (2) a felhasználó
 * KORÁBBI, le nem kért jóváhagyásai `lejart`-ra (lásd
 * `felulirKorabbiJovahagyasokat` — a `generateLink` ELŐTT, hogy a másik gép
 * ne halott tokent, hanem üzenetet kapjon); (3) audit CSAK a még ÉLŐ felülírt
 * sorokról (a már lejárt sor lezárása takarítás, mint a
 * `lekerKapcsolasAllapot`-ban — arról audit nem készül, különben a betekintés-
 * napló „felülírás"-t mondana rá); (4) `generateLink` — ha ITT bukik, a már
 * lezárt sorok utód nélkül maradnak, ezt a napló őrzi (`utodNelkulZarult`);
 * (5) a sor `jovahagyva`. A `felulirva` a MÉG ÉLŐ felülírt sorok száma — a
 * felület ebből mondhatja ki, hogy a másik gép várakozása megszakadt.
 */
export async function jovahagyKapcsolast(input: {
  id: string
  userId: string
  email: string
}): Promise<{ ok: true; felulirva: number } | { ok: false; error: string }> {
  const admin = getSupabaseAdminClient()

  const sor = await olvasKapcsolasKeres(input.id)
  if (!sor) return { ok: false, error: 'A kérés nem található — az asztali alkalmazásban indíts újat.' }
  if (sor.allapot !== 'varakozik') {
    return { ok: false, error: 'Ez a kérés már nem vár jóváhagyásra (lejárt, elutasított vagy már jóváhagyott).' }
  }
  if (new Date(sor.lejar).getTime() < Date.now()) {
    await lejartraAllit(admin, input.id, 'varakozik')
    return { ok: false, error: 'A kérés lejárt (10 perc). Az asztali alkalmazásban indíts újat.' }
  }

  // (2) A korábbi, még le nem kért jóváhagyások lezárása — a generateLink ELŐTT.
  const felulirt = await felulirKorabbiJovahagyasokat(admin, input.userId, input.id)
  if (!felulirt.ok) {
    console.error('[desktop-kapcsolas] a korábbi jóváhagyás lezárása nem sikerült:', felulirt.error)
    return {
      ok: false,
      error:
        'A korábbi jóváhagyás lezárása nem sikerült — próbáld újra. (Amíg ez nem sikerül, a jóváhagyás nem megy tovább, hogy a másik gép ne kapjon használhatatlan belépőt.)',
    }
  }
  // A lezárt sorok közül CSAK az számít felülírásnak, aminek a várakozása MOST
  // szakadt meg (a lejárata még a jövőben volt). A már lejárt sor lezárása
  // takarítás — ugyanaz, amit a `lekerKapcsolasAllapot` audit nélkül tesz.
  // EGYSZER számoljuk, hogy az audit, a `felulirva` és a bukás-napló ugyanazt
  // a halmazt lássa (a Date.now() két hívás közt átbillenhetne).
  const eloSorok = felulirt.sorok.filter((s) => !marLejartE(s))
  // (3) Audit a MÉG ÉLŐ felülírt sorokról — TITOK NÉLKÜL: kérés-azonosító,
  // eszköznév, a régi jóváhagyás ideje, és hogy melyik kérés zárta le. A már
  // lejárt sorról NINCS bejegyzés (2026-09-05, a bíráló P3 találata): a
  // betekintés-napló a kulcsból mond „felülírás"-t, a metaadatot nem nézi, és
  // a takarítás nem felülírás. A naplózás a jóváhagyó munkamenetén fut (a
  // log_audit_event auth.uid()-t követel), ezért a cselekvő a lelkész. A
  // bukása nem néma, de a jóváhagyást nem állítja meg: a felülírás már
  // megtörtént, a visszalépés nem hozná vissza a tokent.
  for (const regi of eloSorok) {
    const naplozva = await logAuditEvent({
      action: 'desktop.kapcsolas_felulirva',
      targetTable: 'desktop_kapcsolas',
      targetId: regi.id,
      metadata: {
        eszkoz_nev: regi.eszkoz_nev ?? null,
        jovahagyva_at: regi.jovahagyva_at ?? null,
        felulirta: input.id,
      },
    })
    if (!naplozva) console.error('[desktop-kapcsolas] a felülírás audit-bejegyzése nem jött létre:', regi.id)
  }
  const felulirva = eloSorok.length

  // (4) Egyszer használatos belépő a JÓVÁHAGYÓ fiókjára. Nem küld levelet.
  // Ha ITT bukik, a (2)-ben lezárt sorok utód nélkül maradnak — a napló őrzi.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: input.email,
  })
  if (linkError || !link?.properties?.hashed_token) {
    console.error('[desktop-kapcsolas] a belépő-token előállítása nem sikerült:', linkError?.code ?? 'nincs token')
    utodNelkulZarult(eloSorok, 'a belépő-token előállítása bukott')
    return { ok: false, error: 'A belépő előállítása nem sikerült — próbáld újra, vagy jelezd a rendszergazdának.' }
  }
  if (link.user?.id && link.user.id !== input.userId) {
    // Védelmi biztosíték: a token CSAK a jóváhagyó fiókjához tartozhat.
    console.error('[desktop-kapcsolas] a belépő-token más fiókhoz tartozik — megszakítva')
    utodNelkulZarult(eloSorok, 'fiók-eltérés')
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
  return { ok: true, felulirva }
}

export async function elutasitKapcsolast(id: string): Promise<void> {
  const admin = getSupabaseAdminClient()
  await admin
    .from('desktop_kapcsolas')
    .update({ allapot: 'elutasitva', token_hash: null })
    .eq('id', id)
    .in('allapot', ['varakozik', 'jovahagyva'])
}
