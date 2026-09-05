'use server'

/**
 * ÉRTESÍTÉSEK (harang-üzenetek) — SZERVER-AKCIÓK (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT
 * ════════════════════════════════════════════════════════════════════════════
 * Az `ertesitesek` táblát az egész alkalmazásban EGYETLEN felület olvasta:
 * a fejléc-csengő lenyíló panelje. Aki elolvasott egy üzenetet és eltelt
 * 24 óra (`READ_RETENTION_HOURS`), annak az üzenet VÉGLEG elérhetetlenné vált —
 * a sor ott maradt az adatbázisban, de nem volt felület, ami megmutatta volna.
 * A `/notifications` oldal MÁS táblát mutat (átjelentkezési kérelmek), és
 * gyülekezeti hatókör nélküli profilban (rendszergazda, esperes) még azt sem:
 * csak egy hibadobozt.
 *
 * A tulajdonos kérése szó szerint ez volt: „nem jelenik meg az értesítések
 * oldal, ahol részletesebben és szépen átnézhetem az üzeneteket".
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-09-05 — KITŐL, MIKOR, MIT (a beszélgetés-nézet adatrétege)
 * ════════════════════════════════════════════════════════════════════════════
 * Minden sor kap egy `felado`-t (az új felado_* oszlopokból, vagy régi sornál
 * a `feladoBontas()` levezetéséből — jelölve, hogy levezetett), egy `kivonat`-ot
 * a listákhoz, és CSAK markdown-formátumú sornál egy szerveren renderelt,
 * megtisztított `uzenetHtml`-t. A csengő a `listFrissErtesitesekAction()`-ból
 * él (5 friss sor + VALÓDI olvasatlan-szám + függő átjelentkezési kérelmek).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-09-05 (P3) — A „VÁLASZRA VÁR" A KÉRELEM TÉNYLEGES ÁLLAPOTÁBÓL
 * ════════════════════════════════════════════════════════════════════════════
 * A 2026-09-05 előtti hozzáférés-kérelem sorok (`admin_request_id` kitöltve)
 * „Válaszra vár" pillje és Jóváhagyás/Elutasítás gombpárja SOSEM oldódott fel:
 * a „megoldva" jelölés csak az új döntési úton történik (notifications/
 * actions.ts → kerelemErtesitesMegoldva). Olvasáskor ezért a hivatkozott
 * `admin_access_requests` sor állapotát is lekérjük (`kerelemAllapotok`), és a
 * `megoldva` mezőt EGY szabállyal vezetjük le (uzenetek-shared →
 * `megoldasLevezetes`: oszlop VAGY cím-előtag VAGY a kérelem eldőlt). A
 * felület csak ezt az egy mezőt nézi. A mellék-lekérés hibája HANGOS: a
 * válasz NEM VÉGZETES `warning` mezőjében utazik (a listában és a csengőben
 * egyaránt, a számláló-hibától függetlenül), néma függő nincs.
 *
 * 2026-09-05 (P3-utómunka, bírálói P2): a KÉRELMEZŐ döntés-sora (success/
 * danger + kérelem-hivatkozás) MAGA A DÖNTÉS — a szabály negyedik ága
 * (`kerelemDontesSorE`) ezért a tartalék-ágon (üres térkép) is megoldottnak
 * veszi: a kérelmező a saját elutasításán nem kaphat „Válaszra vár" pillt és
 * Jóváhagyás/Elutasítás gombot. A tárolt jel ezzel egyezik: a döntés-sor már
 * beszúráskor `megoldva` (notifications/actions.ts), mint a visszatöltés után.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ MINDEN `'use server'` EXPORT ÉLŐ POST-VÉGPONT
 * ════════════════════════════════════════════════════════════════════════════
 * A védelem NEM a felület, hanem az RLS + a saját `user_id` szűrő:
 *   · a lekérdezés a BEJELENTKEZETT felhasználó kliensével fut (nem
 *     service_role!), tehát az `ertesitesek` RLS-e érvényesül;
 *   · minden írás `.eq('user_id', userId)`-vel megy, tehát idegen sort akkor
 *     sem lehetne módosítani, ha az RLS valaha megengedőbb lenne.
 * ⛔ SERVICE_ROLE KLIENS ITT SOHA.
 */

import { createClient } from '@/lib/supabase/server'

import { renderUzenetHtml } from './ertesites-render'
import { feladoBontas } from './felado'
import { countPendingTransferNotifications } from './transfer-notifications-actions'
import type { FrissErtesitesek, KerelemAllapot, NyersKerelemSor, UzenetLista, UzenetMuveletEredmeny, UzenetSor } from './uzenetek-shared'
import { kerelemAllapotTerkep, kerelemAzonosito, kerelemFigyelmeztetes, markdownSzoveg, megoldasLevezetes, szovegKivonat } from './uzenetek-shared'

/** Egyszerre ennyi üzenetet töltünk be. A felület kiírja, ha több van. */
const ALAP_LIMIT = 200

/** A csengő-panel ennyi friss sort mutat (olvasatlanok elöl). */
const CSENGO_LIMIT = 5

interface NyersSor {
  id: string
  tipus: string | null
  cim: string | null
  uzenet: string | null
  olvasva: boolean | null
  archived: boolean | null
  created_at: string
  read_at: string | null
  hivatkozas: string | null
  admin_request_id: string | null
  congregation_id: string | null
  // ⚠️ Csak akkor létezik, ha a 2026-08-11-ertesites-megoldva.sql lefutott.
  megoldva?: boolean | null
  megoldva_at?: string | null
  megoldas_uzenet?: string | null
  // ⚠️ Csak akkor léteznek, ha a 2026-09-05-ertesitesek-felado.sql lefutott.
  felado_tipus?: string | null
  felado_nev?: string | null
  felado_id?: string | null
  felado_levezetett?: boolean | null
  uzenet_format?: string | null
  broadcast_id?: string | null
}

/**
 * A felhasználó ÖSSZES harang-üzenete — az archiváltakkal és a 24 óránál
 * régebben olvasottakkal együtt.
 *
 * ⚠️ `select('*')`, NEM oszlop-lista. A `megoldva` / `megoldva_at` /
 *    `megoldas_uzenet` (és 2026-09-05-től a `felado_*`) oszlopok csak a
 *    migráció lefutása után léteznek; egy nevesített lista addig 42703-mal
 *    elhasalna, és az EGÉSZ oldal üres lenne. A csillag mindkét világban
 *    működik, a hiányzó mezők `undefined`-ok.
 */
export async function listErtesitesekAction(): Promise<UzenetLista> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data, error } = await supabase
    .from('ertesitesek')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(ALAP_LIMIT + 1)

  if (error) return { error: `Az üzenetek nem tölthetők be: ${error.message}` }

  const nyers = ((data ?? []) as unknown as NyersSor[]).slice(0, ALAP_LIMIT)
  const [nevek, kerelmek] = await Promise.all([gyulekezetNevek(supabase, nyers), kerelemAllapotok(supabase, nyers)])

  const eredmeny: UzenetLista = {
    rows: nyers.map((r) => alakit(r, nevek, kerelmek.allapotok)),
    tobbVan: (data ?? []).length > ALAP_LIMIT,
  }
  // NEM NÉMA: a kérelem-állapotok lekérésének hibája (vagy a nem látható
  // kérelem) a válaszban utazik — a felület kiírja, a sorok a saját
  // jelölésükre esnek vissza (fail-closed: függő marad, nem lesz „megoldva").
  const figyelmeztetes = kerelemAllapotFigyelmeztetes(nyers, kerelmek)
  if (figyelmeztetes) eredmeny.warning = figyelmeztetes
  return eredmeny
}

/**
 * A CSENGŐ-PANEL adata (2026-09-05, D3) — a régi kliens-oldali két lekérdezés
 * és a 30-as plafon helyett.
 *
 *  · `sorok`: a legfrissebb CSENGO_LIMIT nem-archivált sor, OLVASATLANOK ELÖL
 *    (24 órás ablak nélkül — a részletek a beszélgetés-nézetben);
 *  · `olvasatlan`: VALÓDI szám (`count: 'exact', head: true`), nem a lista
 *    hossza — 57 olvasatlannál a jelvény 57-et mond, nem 30-at;
 *  · `fuggoKerelmek`: a függő átjelentkezési kérelmek száma (gyülekezeti
 *    hatókörben; máshol 0).
 *
 * Hibánál a `error` mező beszél — a felület KIÍRJA, nem „0 üzenet"-et mutat.
 */
export async function listFrissErtesitesekAction(): Promise<FrissErtesitesek> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { sorok: [], olvasatlan: 0, fuggoKerelmek: 0, error: 'Nincs bejelentkezett felhasználó.' }

  const [lista, szamlalo, kerelmek] = await Promise.all([
    supabase
      .from('ertesitesek')
      .select('*')
      .eq('user_id', user.id)
      .or('archived.is.null,archived.eq.false')
      // Olvasatlanok elöl (a NULL `olvasva` is olvasatlan), azon belül a legfrissebb.
      .order('olvasva', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false })
      .limit(CSENGO_LIMIT),
    supabase
      .from('ertesitesek')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .or('archived.is.null,archived.eq.false')
      .or('olvasva.is.null,olvasva.eq.false'),
    countPendingTransferNotifications(),
  ])

  if (lista.error) {
    return {
      sorok: [],
      olvasatlan: 0,
      fuggoKerelmek: kerelmek.count,
      error: `A friss üzenetek nem tölthetők be: ${lista.error.message}`,
    }
  }

  const nyers = (lista.data ?? []) as unknown as NyersSor[]
  const [nevek, hozzaferesKerelmek] = await Promise.all([gyulekezetNevek(supabase, nyers), kerelemAllapotok(supabase, nyers)])
  const eredmeny: FrissErtesitesek = {
    sorok: nyers.map((r) => alakit(r, nevek, hozzaferesKerelmek.allapotok)),
    olvasatlan: szamlalo.error ? 0 : (szamlalo.count ?? 0),
    fuggoKerelmek: kerelmek.count,
  }
  // A számlálók hibája NEM néma: a lista megvan, de a jelvény nem hazudhat 0-t.
  if (szamlalo.error) {
    eredmeny.error = `Az olvasatlan üzenetek száma nem kérdezhető le: ${szamlalo.error.message}`
  } else if (kerelmek.error) {
    eredmeny.error = `A függő átjelentkezési kérelmek száma nem kérdezhető le: ${kerelmek.error}`
  }
  // Ugyanígy a hozzáférés-kérelmek állapotának hibája: a „Válaszra vár" ilyenkor
  // a sor saját jelöléséből jön — ezt a csengő is kiírja, nem hallgatja el.
  // 2026-09-05 (P3-utómunka): a `warning` mezőben, a listával azonos módon (nem
  // végzetes → borostyán), és a számláló-hibától FÜGGETLENÜL — egyik sem nyeli el a másikat.
  const kerelemFigyelmeztetesSzoveg = kerelemAllapotFigyelmeztetes(nyers, hozzaferesKerelmek)
  if (kerelemFigyelmeztetesSzoveg) eredmeny.warning = kerelemFigyelmeztetesSzoveg
  return eredmeny
}

/**
 * MARKDOWN-E A SOR? — a renderelés kapuja (fail-closed).
 *
 *  · `uzenet_format = 'markdown'` → igen (csak a rendszergazdai hírlevél írja);
 *  · `uzenet_format = 'text'`     → NEM, akkor sem, ha a törzsben `**` van
 *    (felhasználói szöveg: elutasítás indoklása, átjelentkezési megjegyzés);
 *  · nincs ilyen oszlop (a 2026-09-05-ös SQL még nem futott) → csak a régi
 *    hírlevél-sorok: `release` típus vagy „Kartotéka — …" cím. Ugyanezt a két
 *    ismertetőjegyet írja az SQL visszatöltése is 'markdown'-ra.
 */
function uzenetMarkdownE(r: NyersSor, cim: string): boolean {
  if (r.uzenet_format === 'markdown') return true
  if (r.uzenet_format === 'text') return false
  return (r.tipus ?? '') === 'release' || /^kartotéka\s+[—–-]/i.test(cim)
}

function alakit(r: NyersSor, nevek: Map<string, string>, kerelmek: ReadonlyMap<string, KerelemAllapot>): UzenetSor {
  const cim = (r.cim ?? '').trim()
  const uzenet = r.uzenet ?? ''
  const congregationNev = r.congregation_id ? (nevek.get(r.congregation_id) ?? null) : null

  // HOZZÁFÉRÉS-KÉRELEM: az azonosító EGY szabályból (oszlop, vagy a régi sorok
  // `admin_access:<uuid>` hivatkozása — csak szabályos UUID), a „megoldva" pedig
  // EGY szabályból — oszlop VAGY cím-előtag VAGY a sor maga a döntés (a
  // kérelmező success/danger értesítése) VAGY a hivatkozott kérelem már eldőlt.
  // A felület minden helye (valaszraVarE, pill, gombpár, zöld sáv) ebből az egy mezőből dönt.
  const adminRequestId = kerelemAzonosito(r.admin_request_id, r.hivatkozas)
  const megoldas = megoldasLevezetes({
    megoldvaOszlop: r.megoldva,
    cim,
    tipus: r.tipus,
    adminRequestId,
    kerelem: adminRequestId ? kerelmek.get(adminRequestId) : undefined,
  })

  // FELADÓ: oszlop-először, régi sornál levezetés. A `felado_levezetett` jelet a
  // trigger/visszatöltés is állíthatja — az ilyen sor a felületen „valószínű
  // feladó", akkor is, ha az oszlop ki van töltve.
  const feladoAlap = feladoBontas({
    tipus: r.tipus,
    hivatkozas: r.hivatkozas,
    cim,
    // 2026-09-05 (brief 3. pont): a regisztráló neve a TÖRZS elején van, és a
    // megyei felület sorainál a gyülekezet MEGLÉTE dönt (kerület vs. gyülekezet).
    uzenet,
    congregationId: r.congregation_id ?? null,
    felado_tipus: r.felado_tipus,
    felado_nev: r.felado_nev,
    felado_id: r.felado_id,
    congregationNev,
  })
  const felado = { ...feladoAlap, levezetett: feladoAlap.levezetett || r.felado_levezetett === true }

  const markdown = uzenetMarkdownE(r, cim)
  // ⚠️ FAIL-CLOSED KAPU: a renderelő KIZÁRÓLAG markdown-sornál fut.
  const uzenetHtml = markdown ? renderUzenetHtml(uzenet) : null
  const kivonat = markdown ? markdownSzoveg(uzenet) : szovegKivonat(uzenet)

  return {
    id: r.id,
    tipus: r.tipus ?? 'info',
    cim: cim || 'Értesítés',
    uzenet,
    olvasva: r.olvasva === true,
    archived: r.archived === true,
    createdAt: r.created_at,
    readAt: r.read_at ?? null,
    hivatkozas: r.hivatkozas ?? null,
    adminRequestId,
    congregationNev,
    // ⚠️ NÉGY FORRÁS, EGY SZABÁLY (`megoldasLevezetes`): az oszlop, ha van; a
    //    cím-előtag (a feloldás fail-closed ága azt írja be, ha a migráció még
    //    nem futott le); a sor maga a döntés; és a kérelem tényleges állapota.
    //    A sor saját időbélyege/mondata az első, a kérelemből levezetett a tartalék.
    megoldva: megoldas.megoldva,
    megoldvaAt: r.megoldva_at ?? megoldas.megoldvaAt,
    megoldasUzenet: r.megoldas_uzenet ?? megoldas.megoldasUzenet,
    dontesSor: megoldas.dontesSor,
    felado,
    uzenetHtml,
    kivonat,
    uzenetFormat: markdown ? 'markdown' : 'text',
    broadcastId: r.broadcast_id ?? null,
  }
}

/**
 * A gyülekezet-nevek feloldása. FAIL-SOFT: ha az RLS nem enged (pl. idegen
 * gyülekezet azonosítója egy régi üzenetben), a név egyszerűen `null` marad —
 * az üzenet ettől még megjelenik. Egy hiányzó név nem érhet annyit, hogy
 * elvegye a teljes listát.
 */
async function gyulekezetNevek(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sorok: NyersSor[],
): Promise<Map<string, string>> {
  const idk = [...new Set(sorok.map((s) => s.congregation_id).filter((v): v is string => !!v))]
  if (idk.length === 0) return new Map()
  try {
    const { data } = await supabase.from('congregations').select('id, name, nev_hu').in('id', idk)
    const map = new Map<string, string>()
    for (const c of (data ?? []) as Array<{ id: string; name: string | null; nev_hu: string | null }>) {
      map.set(c.id, (c.nev_hu || c.name || '').trim())
    }
    return map
  } catch {
    return new Map()
  }
}

/** Egyszerre ennyi kérelem-azonosító egy `.in()` szűrőben (~100 fölött a proxy 414-et adhat). */
const KERELEM_DARAB = 80

interface KerelemAllapotok {
  allapotok: Map<string, KerelemAllapot>
  /** A lekérés hibája magyarul. Hibánál a térkép ÜRES — minden sor egységesen a saját jelölésére esik vissza. */
  hiba: string | null
}

/**
 * A sorok által hivatkozott hozzáférés-kérelmek TÉNYLEGES állapota (2026-09-05, P3).
 *
 * MIÉRT: a 2026-09-05 előtti döntések a lelkész kérelem-értesítését nem jelölték
 * „megoldva"-nak (a jelölés csak az új döntési úton történik — notifications/
 * actions.ts, kerelemErtesitesMegoldva), így a „Válaszra vár" pill és a gombpár
 * sosem oldódott fel. Olvasáskor a kérelem SAJÁT sorából tudjuk meg az igazságot —
 * ez az egy igazságforrás; a sor jelölése csak gyorsítótár.
 *
 * A BEJELENTKEZETT felhasználó kliensével fut: az `aar_olvasas` policy a
 * kérelmezőt, a megszólított lelkészt és a globális jogút engedi — pontosan
 * azokat, akik értesítést kaptak róla. Amit az RLS elrejt, az a térképből
 * HIÁNYZIK (nem hiba!) — a `kerelemFigyelmeztetes` a hiányt is nevén nevezi,
 * a sor pedig függő marad (fail-closed: valódi függő kérelmet sosem rejtünk el).
 *
 * ⚠️ HIBÁNÁL ÜRES TÉRKÉP + `hiba`: a hívó warning-ot ad, néma függő nincs.
 */
async function kerelemAllapotok(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sorok: NyersSor[],
): Promise<KerelemAllapotok> {
  const idk = [
    ...new Set(sorok.map((s) => kerelemAzonosito(s.admin_request_id, s.hivatkozas)).filter((v): v is string => !!v)),
  ]
  const allapotok = new Map<string, KerelemAllapot>()
  if (idk.length === 0) return { allapotok, hiba: null }

  for (let i = 0; i < idk.length; i += KERELEM_DARAB) {
    const { data, error } = await supabase
      .from('admin_access_requests')
      .select('id, status, approved_at, denied_at, expires_at')
      .in('id', idk.slice(i, i + KERELEM_DARAB))
    if (error) return { allapotok: new Map(), hiba: error.message }
    // A térkép-építő tiszta függvény az uzenetek-shared-ben (a selftest futtatja).
    kerelemAllapotTerkep((data ?? []) as NyersKerelemSor[], allapotok)
  }
  return { allapotok, hiba: null }
}

/** A nem végzetes figyelmeztetés szövege a nyers sorokból (a szabály: uzenetek-shared → kerelemFigyelmeztetes). */
function kerelemAllapotFigyelmeztetes(nyers: NyersSor[], kerelmek: KerelemAllapotok): string | null {
  return kerelemFigyelmeztetes({
    hiba: kerelmek.hiba,
    allapotok: kerelmek.allapotok,
    sorok: nyers.map((r) => {
      const kerelemId = kerelemAzonosito(r.admin_request_id, r.hivatkozas)
      return {
        kerelemId,
        // A sor SAJÁT jelölése (kérelem nélkül) — ugyanaz az egy szabály, kérelem-ág
        // nélkül. A kérelmező döntés-sora (success/danger) itt is „megoldott": a
        // lekérés hibája őt nem érinti, a figyelmeztetés nem számolja.
        sajatMegoldva: megoldasLevezetes({ megoldvaOszlop: r.megoldva, cim: (r.cim ?? '').trim(), tipus: r.tipus, adminRequestId: kerelemId, kerelem: null }).megoldva,
        archived: r.archived === true,
      }
    }),
  })
}

/** Olvasottnak jelöl. A `read_at`-ot adatbázis-trigger tölti ki. */
export async function jelolOlvasottnakAction(id: string): Promise<UzenetMuveletEredmeny> {
  return sajatSorFrissites(id, { olvasva: true })
}

/** Vissza olvasatlanra — ha a lelkész vissza akar térni rá. */
export async function jelolOlvasatlannakAction(id: string): Promise<UzenetMuveletEredmeny> {
  return sajatSorFrissites(id, { olvasva: false, read_at: null })
}

export async function archivalErtesitestAction(id: string): Promise<UzenetMuveletEredmeny> {
  return sajatSorFrissites(id, { archived: true, archived_at: new Date().toISOString() })
}

/**
 * VISSZAHOZÁS AZ ARCHÍVUMBÓL.
 *
 * ⚠️ MIÉRT KELL. Az archiválás eddig EGYIRÁNYÚ volt: a harangból eltűnt, és
 * nem létezett felület, ami visszahozta volna. Egy téves kattintás így véglegesen
 * elrejtett egy üzenetet — miközben a sor ott volt az adatbázisban.
 */
export async function visszaallitErtesitestAction(id: string): Promise<UzenetMuveletEredmeny> {
  return sajatSorFrissites(id, { archived: false, archived_at: null })
}

export async function jelolMindOlvasottnakAction(): Promise<UzenetMuveletEredmeny> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nincs bejelentkezett felhasználó.' }

  const { error } = await supabase
    .from('ertesitesek')
    .update({ olvasva: true })
    .eq('user_id', user.id)
    .eq('olvasva', false)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * ⚠️ MINDEN ÍRÁS A SAJÁT SORRA. Az `.eq('user_id', user.id)` az RLS MELLETT áll,
 * nem helyette: ha az `ertesitesek` policy valaha megengedőbbé válna (pl. egy
 * globális hozzáférésű szerep miatt), ez a szűrő akkor is megvédi az idegen
 * sorokat egy elgépelt azonosítótól.
 */
async function sajatSorFrissites(
  id: string,
  mezok: Record<string, unknown>,
): Promise<UzenetMuveletEredmeny> {
  if (!id) return { success: false, error: 'Hiányzó azonosító.' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nincs bejelentkezett felhasználó.' }

  const { error } = await supabase
    .from('ertesitesek')
    .update(mezok)
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
