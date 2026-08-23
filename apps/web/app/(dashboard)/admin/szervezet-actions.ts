'use server'

/**
 * SZERVEZETI ÁTTEKINTŐ — adat-akció (2026-08-22, 7. pont).
 *
 * Egyházkerület → egyházmegye → egyházközség EGY képernyőn. A séma három
 * szintje régóta megvan (`districts` ↔ `dioceses.district_id` ↔
 * `congregations.diocese_id`), csak SEMMILYEN felület nem használta együtt: az
 * admin Gyülekezetek oldala két szintig jut, az /admin Áttekintés
 * egyházmegye-bontása pedig kerület-VAK — két kerület 24 egyházmegyéje egyetlen
 * rendezetlen listában olvadt össze.
 *
 * ⚠️ NINCS ÚJ SQL. Ez az akció a `listScopeOptions` (profile-roles-actions.ts)
 *    bevált mintájának KITERJESZTÉSE: néhány párhuzamos SELECT + JS-aggregálás.
 *    Új RPC-t, új táblát, új policy-t NEM igényel.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 1. A FŐ KOCKÁZAT NEM AZ ADAT, HANEM A HATÁSKÖR
 * ════════════════════════════════════════════════════════════════════════════
 * A projekt KÉTSZER megélt hibaosztálya: „skalár hatókör + `if (id) filter` =
 * néma teljes szivárgás". Ha ez a lekérdezés szűrő nélkül kérdez, a kerületi
 * admin a MÁSIK kerület TELJES fáját látná — minden egyházmegyéjével,
 * gyülekezetével és felhasználó-számával.
 *
 * Ezért a sorrend FAIL-CLOSED, és ebben a sorrendben:
 *   (1) `getAdminDistrictScope` — unrestricted? ha nem, vannak-e kerületei?
 *   (2) `districtIds.length === 0` → ÜRES fa + magyarázat. SOHA nem országos.
 *   (3) `getScopedDioceseIds` / `getScopedCongregationIds` — és a gyülekezet-
 *       halmazt UTÓLAG is metsszük a `getScopedCongregationIds` eredményével
 *       (öv és nadrágszíj: ha a `dioceses` sor kerülete valaha elcsúszna, a
 *       metszet akkor is kizárja az idegen sort).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 2. A TAGLÉTSZÁM KÉT KÜLÖN FORRÁSBÓL JÖN (K4, 2026-08-16)
 * ════════════════════════════════════════════════════════════════════════════
 *   · rendszergazda / master → `admin_overview_member_counts()`
 *   · egyházkerületi admin   → `district_member_counts(p_district_id)`
 *
 * Az S1c migráció a kerületi adminról levette a gyülekezeti SOR-szintű
 * adatolvasást, ezért nála az `admin_overview_member_counts()` NULLA SORT adna
 * — a fa minden gyülekezetnél „0 tag"-ot mutatna, hibaüzenet nélkül. Ha
 * BÁRMELYIK forrás hibázik, a `tagszamElerheto` hamis lesz, MINDEN `tagszam`
 * `null` (= „nem tudjuk"), és a felület ezt ki is írja. Lásd `szervezet-shared.ts`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 3. K4: A BEÁLLÍTÁS- ÉS TÖRZSADAT-HIÁNYOK ÁGA A KERÜLETNEK KIMARAD
 * ════════════════════════════════════════════════════════════════════════════
 * A „N kötelező mező hiányzik" jelvény a gyülekezet TÖRZSADATÁBÓL számol
 * (adószám, cím, IBAN…). Ez a rendszergazda dolga; a kerület a K4-döntés
 * szerint csak a hivatalosan beküldött iratokat és azok összesítőjét látja.
 * Ezért kerületi adminnál ezeket az oszlopokat EL SEM KÉRJÜK
 * (`hianyzoMezokElerheto: false`), nem csak elrejtjük a felületen.
 *
 * ⚠️ 4. `.in()` URL-KORLÁT: sok azonosítós szűrő az URL-be kerül, és ~100 fölött
 *    a proxy 414-gyel eldobja — a hiba pedig ÜRES listának látszik. Minden
 *    azonosító-listás szűrő 80-asával darabolva megy (`IN_DARAB`).
 *
 * ⚠️ 5. POSTGREST 1000 SOROS PLAFON: a `profiles` és a `profile_roles` bőven
 *    ezer sor fölött van, és a szerver NÉMÁN vágja le a többit — nincs hiba,
 *    csak kevesebb sor, amiből itt „0 felhasználó" lenne a fa alján. Ezért
 *    minden nagy lista a közös `selectAllPaged` lapozón megy.
 */

import { selectAllPaged } from '@kartoteka/supabase-client'

import { requireAdminAccess } from '@/lib/auth/admin-access'
import {
  getAdminDistrictScope,
  getScopedCongregationIdsResult,
  getScopedDioceseIdsResult,
} from '@/lib/auth/admin-scope'
import {
  hianyzoKotelezoMezok,
  type FaEgyhazmegye,
  type FaGyulekezet,
  type FaKerulet,
  type FaSzerepJelveny,
  type KotelezoMezoForras,
  type SzervezetiFa,
} from './szervezet-shared'

// ---------------------------------------------------------------------------
// Segédek
// ---------------------------------------------------------------------------

/**
 * ⚠️ `.in()` URL-KORLÁT — 80-as darabok.
 *
 * A PostgREST a szűrőt a QUERY STRINGBE teszi. Egy uuid ~36 karakter + kódolt
 * elválasztó, tehát ~100 azonosító fölött a proxy 414-et ad — és a hívó oldalon
 * ez ÜRES listának látszik, nem hibának. Erdélyi kerület ~500 gyülekezete
 * egyetlen `.in()`-be tehát SOHA nem fér bele.
 */
const IN_DARAB = 80

function darabol<T>(elemek: ReadonlyArray<T>, meret: number = IN_DARAB): T[][] {
  if (elemek.length === 0) return []
  const ki: T[][] = []
  for (let i = 0; i < elemek.length; i += meret) ki.push(elemek.slice(i, i + meret))
  return ki
}

interface PgHiba {
  message: string
  code?: string
}

/**
 * Azonosító-listás lekérdezés darabolva ÉS lapozva.
 *
 * KÉT néma csonkolás ellen véd egyszerre:
 *   · `.in()` URL-korlát → 80-as darabok,
 *   · PostgREST 1000 soros plafon → `selectAllPaged` (a darabon BELÜL is).
 *
 * A hibaüzenetet MINDIG továbbadja — a néma üres lista tiltott (2026-08-16
 * hibaosztály: a 414-re az őrszem „nem tudjuk igazolni"-t írt, mert a hiba
 * útközben elveszett).
 */
async function darabolvaLekerd<T>(
  ids: ReadonlyArray<string>,
  // A PostgREST builder típusa itt nem kifejezhető (a `selectAllPaged` is
  // `any`-t vesz át ugyanezért).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lekerdez: (darab: string[]) => any,
): Promise<{ sorok: T[]; hiba: string | null }> {
  const sorok: T[] = []
  for (const darab of darabol(ids)) {
    const res = await selectAllPaged<T>(lekerdez(darab))
    if (res.error) return { sorok: [], hiba: res.error.message }
    for (const s of res.data) sorok.push(s)
  }
  return { sorok, hiba: null }
}

/** Szűretlen (rendszergazdai) lista — ugyanaz a lapozó, `.in()` nélkül. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lapozvaLekerd<T>(query: any): Promise<{ sorok: T[]; hiba: string | null }> {
  const res = await selectAllPaged<T>(query)
  if (res.error) return { sorok: [], hiba: res.error.message }
  return { sorok: res.data, hiba: null }
}

/** A PostgREST „nincs ilyen oszlop" hibakódjai (a migráció még nem futott le). */
function ismeretlenOszlop(hiba: PgHiba | null): boolean {
  return Boolean(hiba && (hiba.code === '42703' || hiba.code === 'PGRST204'))
}

function szoveg(ertek: unknown): string | null {
  return typeof ertek === 'string' && ertek.trim() !== '' ? ertek : null
}

// ---------------------------------------------------------------------------
// A fa
// ---------------------------------------------------------------------------

export async function getSzervezetiFa(): Promise<{ data?: SzervezetiFa; error?: string }> {
  let access: Awaited<ReturnType<typeof requireAdminAccess>>
  try {
    access = await requireAdminAccess()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Nincs jogosultsága.' }
  }

  const supabase = access.supabase
  const scope = getAdminDistrictScope(access)
  const rendszergazda = scope.unrestricted
  const mertAt = new Date().toISOString()

  // ── (1) FAIL-CLOSED KAPU ────────────────────────────────────────────────
  // ⛔ Korlátozott néző beállított egyházkerület NÉLKÜL: ÜRES fa. Innen SOHA
  //    nem eshetünk vissza a szűretlen (országos) lekérdezésre — pontosan ez a
  //    „skalár hatókör + if (id) filter" hibaosztály, ami már kétszer elsült.
  if (!rendszergazda && scope.districtIds.length === 0) {
    return {
      data: {
        keruletek: [],
        tagszamElerheto: false,
        tagszamUzenet: null,
        hianyzoMezokElerheto: false,
        rendszergazda: false,
        hatokorUres: true,
        hatokorUzenet:
          'A fiókodhoz nincs egyházkerület rendelve, ezért a szervezeti fa üres. ' +
          'Ez nem hiba a fában: a rendszer szándékosan nem mutat országos listát ' +
          'annak, akinek nincs beállított hatóköre. Kérd meg a fő rendszergazdát, ' +
          'hogy állítsa be az egyházkerületedet a Felhasználók oldalon.',
        mertAt,
      },
    }
  }

  // ── (2) HATÓKÖR-HALMAZOK ────────────────────────────────────────────────
  //
  // ⚠️ A `…Result` VÁLTOZATOKAT hívjuk, nem a rövid burkolókat: azok a
  //    LEKÉRDEZÉS-HIBÁT is üres tömbbé nyelik, és onnantól a fa egy TÖKÉLETESEN
  //    ÜRES, magabiztos képernyő lenne — ami itt „ebben a kerületben nincs
  //    semmi"-t állítana. A hiba ilyenkor HANGOS: a felület piros dobozt és
  //    „Újrapróbálom" gombot kap. (`null` = korlátlan, üres tömb = nem lát semmit.)
  const [dioceseRes, congRes] = await Promise.all([
    getScopedDioceseIdsResult(access),
    getScopedCongregationIdsResult(access),
  ])
  if (!dioceseRes.feloldhato) {
    return {
      error: `A hatókör (egyházmegyék) feloldása nem sikerült: ${dioceseRes.hiba || 'ismeretlen hiba'}`,
    }
  }
  if (!congRes.feloldhato) {
    return {
      error: `A hatókör (gyülekezetek) feloldása nem sikerült: ${congRes.hiba || 'ismeretlen hiba'}`,
    }
  }
  const scopedDioceseIds = dioceseRes.ids
  const scopedCongIds = congRes.ids

  // ── (3) TÖRZS-LEKÉRDEZÉSEK ──────────────────────────────────────────────

  // Egyházkerületek. Az S2 (2026-08-16) törzsadat-oszlopai nélkül a fejlécen
  // csak a név látszik — ezért a `42703/PGRST204` esetén szűkebb SELECT-tel
  // újrapróbálunk, ahogy a `dashboard-kerulet/district-actions.ts` is teszi.
  // Enélkül egy le nem futott migráció az EGÉSZ oldalt eltörné.
  //
  // ⚠️ EZ AZ EGYETLEN LEKÉRDEZÉS, AMI NEM A LAPOZÓN MEGY — két okból: az ország
  //    összesen KÉT egyházkerületet ismer (a plafon elérhetetlen), és a
  //    migráció-tartalék ághoz a PostgREST HIBAKÓDJA kell, amit a lapozó
  //    visszatérése (`{ message }`) már nem hordoz.
  async function keruletSorok(): Promise<{ sorok: Record<string, unknown>[]; hiba: string | null }> {
    async function fut(select: string) {
      const q = supabase.from('districts').select(select).order('name')
      if (!rendszergazda) q.in('id', scope.districtIds)
      return q
    }
    const teljes = await fut('id, name, nev_ro, cimer_url, puspok_nev')
    if (!teljes.error) {
      return { sorok: (teljes.data as unknown as Record<string, unknown>[]) ?? [], hiba: null }
    }
    if (!ismeretlenOszlop(teljes.error as PgHiba)) {
      return { sorok: [], hiba: (teljes.error as PgHiba).message }
    }
    const szuk = await fut('id, name')
    if (szuk.error) return { sorok: [], hiba: (szuk.error as PgHiba).message }
    return { sorok: (szuk.data as unknown as Record<string, unknown>[]) ?? [], hiba: null }
  }

  // Egyházmegyék — ma 24 sor, de a szűrő így is darabolva és lapozva megy.
  const MEGYE_SELECT = 'id, name, district_id, esperes_nev'
  async function megyeSorok(): Promise<{ sorok: Record<string, unknown>[]; hiba: string | null }> {
    if (scopedDioceseIds === null) {
      return lapozvaLekerd<Record<string, unknown>>(
        supabase.from('dioceses').select(MEGYE_SELECT).order('name'),
      )
    }
    if (scopedDioceseIds.length === 0) return { sorok: [], hiba: null }
    return darabolvaLekerd<Record<string, unknown>>(scopedDioceseIds, (darab) =>
      supabase.from('dioceses').select(MEGYE_SELECT).order('name').in('id', darab),
    )
  }

  // Gyülekezetek. ⚠️ A kötelező-mező oszlopokat CSAK rendszergazdának kérjük el
  // (K4) — nem elrejtjük, hanem el sem hozzuk.
  const GY_ALAP = 'id, nev_hu, name, diocese_id, status, last_activity_at'
  const GY_ADMIN = `${GY_ALAP}, nev_ro, adoszam, cim, email, telefon, iban, bank`
  async function gyulekezetSorok(): Promise<{
    sorok: Record<string, unknown>[]
    hiba: string | null
  }> {
    const select = rendszergazda ? GY_ADMIN : GY_ALAP
    if (scopedDioceseIds === null) {
      return lapozvaLekerd<Record<string, unknown>>(
        supabase.from('congregations').select(select).order('nev_hu'),
      )
    }
    if (scopedDioceseIds.length === 0) return { sorok: [], hiba: null }
    return darabolvaLekerd<Record<string, unknown>>(scopedDioceseIds, (darab) =>
      supabase.from('congregations').select(select).order('nev_hu').in('diocese_id', darab),
    )
  }

  // Felhasználók — csak a DARABSZÁMHOZ és a szerepkör-jelvényekhez kellenek,
  // nevet/e-mailt SZÁNDÉKOSAN nem hozunk (ez áttekintő, nem személyi lista).
  async function profilSorok(): Promise<{ sorok: Record<string, unknown>[]; hiba: string | null }> {
    const alap = () =>
      supabase
        .from('profiles')
        .select('id, congregation_id, status')
        .in('status', ['active', 'pending'])
    if (scopedCongIds === null) return lapozvaLekerd<Record<string, unknown>>(alap())
    if (scopedCongIds.length === 0) return { sorok: [], hiba: null }
    return darabolvaLekerd<Record<string, unknown>>(scopedCongIds, (darab) =>
      alap().in('congregation_id', darab),
    )
  }

  async function szerepSorok(): Promise<{ sorok: Record<string, unknown>[]; hiba: string | null }> {
    const alap = () =>
      supabase
        .from('profile_roles')
        .select('id, profile_id, role, custom_label, scope_id')
        .eq('scope', 'congregation')
        .eq('approval_status', 'approved')
        .eq('active', true)
    if (scopedCongIds === null) return lapozvaLekerd<Record<string, unknown>>(alap())
    if (scopedCongIds.length === 0) return { sorok: [], hiba: null }
    return darabolvaLekerd<Record<string, unknown>>(scopedCongIds, (darab) =>
      alap().in('scope_id', darab),
    )
  }

  /**
   * TAGLÉTSZÁM — a K4 kettős forrása.
   *
   * ⚠️ A visszatérés `null` MAP-et ad, ha NEM SIKERÜLT. A hívó ezt fordítja
   *    `tagszam: null`-ra minden gyülekezetnél. Ha itt üres Map-et adnánk
   *    vissza hiba esetén, a fa NÉMÁN 0 tagot mutatna — pontosan az a hiba,
   *    ami miatt ez a függvény külön él.
   */
  async function tagszamTerkep(): Promise<{ terkep: Map<string, number> | null; uzenet: string | null }> {
    const terkep = new Map<string, number>()
    if (rendszergazda) {
      const { data, error } = await supabase.rpc('admin_overview_member_counts')
      if (error || !Array.isArray(data)) {
        return {
          terkep: null,
          uzenet:
            error?.message ||
            'Az `admin_overview_member_counts` összesítő nem adott sorokat.',
        }
      }
      for (const sor of data as Array<{ congregation_id?: string; member_count?: number | string }>) {
        if (sor.congregation_id) {
          terkep.set(sor.congregation_id, Number(sor.member_count) || 0)
        }
      }
      return { terkep, uzenet: null }
    }

    // Kerületi admin: kerületenként a SECURITY DEFINER összesítő (csak darabszám).
    for (const districtId of scope.districtIds) {
      const { data, error } = await supabase.rpc('district_member_counts', {
        p_district_id: districtId,
      })
      if (error || !Array.isArray(data)) {
        return {
          terkep: null,
          uzenet:
            error?.message ||
            'A `district_member_counts` összesítő nem adott sorokat ehhez az egyházkerülethez.',
        }
      }
      for (const sor of data as Array<{ congregation_id?: string; member_count?: number | string }>) {
        if (sor.congregation_id) {
          terkep.set(sor.congregation_id, Number(sor.member_count) || 0)
        }
      }
    }
    return { terkep, uzenet: null }
  }

  const [keruletRes, megyeRes, gyulekezetRes, profilRes, szerepRes, tagszamRes] = await Promise.all([
    keruletSorok(),
    megyeSorok(),
    gyulekezetSorok(),
    profilSorok(),
    szerepSorok(),
    tagszamTerkep(),
  ])

  if (keruletRes.hiba) return { error: `Egyházkerületek hibája: ${keruletRes.hiba}` }
  if (megyeRes.hiba) return { error: `Egyházmegyék hibája: ${megyeRes.hiba}` }
  if (gyulekezetRes.hiba) return { error: `Gyülekezetek hibája: ${gyulekezetRes.hiba}` }
  if (profilRes.hiba) return { error: `Felhasználók hibája: ${profilRes.hiba}` }
  if (szerepRes.hiba) return { error: `Szerepkörök hibája: ${szerepRes.hiba}` }

  // ── (4) ÖV ÉS NADRÁGSZÍJ: metszet a hatókör gyülekezet-halmazával ────────
  // Ha a `dioceses.district_id` valaha elcsúszna (adathiba, kézi javítás), a
  // `diocese_id`-alapú szűrő önmagában beengedne egy idegen sort. A metszet ezt
  // is kizárja. Rendszergazdánál `null` → nincs metszet, minden marad.
  const engedelyezettCongIds = scopedCongIds === null ? null : new Set(scopedCongIds)

  // ── (5) AGGREGÁLÁS ──────────────────────────────────────────────────────
  const tagszamElerheto = tagszamRes.terkep !== null

  // Felhasználók gyülekezetenként: elsődleges `congregation_id` VAGY gyülekezeti
  // scope-ú, jóváhagyott és aktív `profile_role`. A halmaz dedupol.
  const userIdsByCong = new Map<string, Set<string>>()
  function userFelvesz(congId: string, profileId: string) {
    const meglevo = userIdsByCong.get(congId)
    if (meglevo) meglevo.add(profileId)
    else userIdsByCong.set(congId, new Set([profileId]))
  }
  for (const p of profilRes.sorok) {
    const congId = szoveg(p.congregation_id)
    const id = szoveg(p.id)
    if (congId && id) userFelvesz(congId, id)
  }
  const szerepekByCong = new Map<string, Map<string, FaSzerepJelveny>>()
  for (const r of szerepRes.sorok) {
    const congId = szoveg(r.scope_id)
    const profileId = szoveg(r.profile_id)
    const role = szoveg(r.role)
    if (!congId || !role) continue
    if (profileId) userFelvesz(congId, profileId)
    const kulcs = role === 'custom' ? `custom:${szoveg(r.custom_label) || ''}` : role
    const terkep = szerepekByCong.get(congId) ?? new Map<string, FaSzerepJelveny>()
    const meglevo = terkep.get(kulcs)
    if (meglevo) meglevo.darab += 1
    else terkep.set(kulcs, { role, customLabel: szoveg(r.custom_label), darab: 1 })
    szerepekByCong.set(congId, terkep)
  }

  const gyulekezetekByMegye = new Map<string, FaGyulekezet[]>()
  for (const c of gyulekezetRes.sorok) {
    const id = szoveg(c.id)
    if (!id) continue
    if (engedelyezettCongIds && !engedelyezettCongIds.has(id)) continue

    const megyeKulcs = szoveg(c.diocese_id) ?? ''
    const szerepek = [...(szerepekByCong.get(id)?.values() ?? [])].sort(
      (a, b) => b.darab - a.darab || a.role.localeCompare(b.role, 'hu'),
    )

    const sor: FaGyulekezet = {
      id,
      nev: szoveg(c.nev_hu) || szoveg(c.name) || '—',
      dioceseId: szoveg(c.diocese_id),
      // ⚠️ ITT DŐL EL A „NEM TUDJUK ≠ 0". Ha az összesítő elbukott, `null`.
      //    Ha lefutott, a HIÁNYZÓ sor VALÓDI nulla (üres nyilvántartás), mert
      //    mindkét RPC GROUP BY-jal dolgozik.
      tagszam: tagszamRes.terkep ? (tagszamRes.terkep.get(id) ?? 0) : null,
      felhasznalok: userIdsByCong.get(id)?.size ?? 0,
      szerepek,
      aktiv: szoveg(c.status) !== 'inactive',
      utolsoAktivitas: szoveg(c.last_activity_at),
      // K4: kerületi adminnál az oszlopokat el sem kértük → `null` (= nem néztük).
      hianyzoMezok: rendszergazda
        ? hianyzoKotelezoMezok(c as unknown as KotelezoMezoForras)
        : null,
    }
    const lista = gyulekezetekByMegye.get(megyeKulcs) ?? []
    lista.push(sor)
    gyulekezetekByMegye.set(megyeKulcs, lista)
  }

  const megyekByKerulet = new Map<string, FaEgyhazmegye[]>()
  const ismertMegyeIds = new Set<string>()
  for (const d of megyeRes.sorok) {
    const id = szoveg(d.id)
    if (!id) continue
    ismertMegyeIds.add(id)
    const megye: FaEgyhazmegye = {
      id,
      nev: szoveg(d.name) || '—',
      esperesNev: szoveg(d.esperes_nev),
      districtId: szoveg(d.district_id),
      gyulekezetek: gyulekezetekByMegye.get(id) ?? [],
    }
    const kulcs = megye.districtId ?? ''
    const lista = megyekByKerulet.get(kulcs) ?? []
    lista.push(megye)
    megyekByKerulet.set(kulcs, lista)
  }

  const keruletek: FaKerulet[] = keruletRes.sorok.flatMap((k) => {
    const id = szoveg(k.id)
    if (!id) return []
    return [
      {
        id,
        nev: szoveg(k.name) || '—',
        nevRo: szoveg(k.nev_ro),
        cimerUrl: szoveg(k.cimer_url),
        puspokNev: szoveg(k.puspok_nev),
        egyhazmegyek: megyekByKerulet.get(id) ?? [],
      },
    ]
  })

  // ── (6) ÁRVA ÁGAK — a végén, kimondva ───────────────────────────────────
  //
  // ⚠️ EZEK NÉMÁN KIMARADNÁNAK MINDEN ÖSSZESÍTŐBŐL. Az „Egyházmegye nélkül"
  //    gyülekezet nem jelenik meg a megyei/kerületi felületeken, az irat-
  //    beküldése nem értesíti az esperesi hivatalt; az „Egyházkerület nélkül"
  //    egyházmegye pedig egyetlen kerületi összesítőbe sem számít bele.
  //    A fa VÉGÉN, saját ágként mutatjuk, hogy legyen, ami kiabál.

  // Árva egyházmegyék (nincs kerületük) + olyan megyék, amelyek kerülete nem
  // szerepel a listában (korlátozott nézőnél ez nem fordulhat elő, mert a
  // hatókör-szűrő már kizárta volna).
  const ismertKeruletIds = new Set(keruletek.map((k) => k.id))
  const arvaMegyek: FaEgyhazmegye[] = []
  for (const [kulcs, lista] of megyekByKerulet) {
    if (kulcs === '' || !ismertKeruletIds.has(kulcs)) arvaMegyek.push(...lista)
  }
  if (arvaMegyek.length > 0) {
    keruletek.push({
      id: '',
      nev: 'Egyházkerület nélkül',
      nevRo: null,
      cimerUrl: null,
      puspokNev: null,
      egyhazmegyek: arvaMegyek.sort((a, b) => a.nev.localeCompare(b.nev, 'hu')),
    })
  }

  // Árva gyülekezetek (nincs egyházmegyéjük, vagy olyan megyéhez tartoznak,
  // ami nincs a listában). Korlátozott nézőnél a `diocese_id`-alapú szűrő és a
  // hatókör-metszet miatt ez a halmaz szükségszerűen üres — ami helyes: egy
  // egyházmegye nélküli gyülekezet nem rendelhető egyetlen kerülethez sem.
  const arvaGyulekezetek: FaGyulekezet[] = []
  for (const [kulcs, lista] of gyulekezetekByMegye) {
    if (kulcs === '' || !ismertMegyeIds.has(kulcs)) arvaGyulekezetek.push(...lista)
  }
  if (arvaGyulekezetek.length > 0) {
    const arvaAg: FaEgyhazmegye = {
      id: '',
      nev: 'Egyházmegye nélkül',
      esperesNev: null,
      districtId: null,
      gyulekezetek: arvaGyulekezetek.sort((a, b) => a.nev.localeCompare(b.nev, 'hu')),
    }
    const meglevoArvaKerulet = keruletek.find((k) => k.id === '')
    if (meglevoArvaKerulet) meglevoArvaKerulet.egyhazmegyek.push(arvaAg)
    else {
      keruletek.push({
        id: '',
        nev: 'Egyházkerület nélkül',
        nevRo: null,
        cimerUrl: null,
        puspokNev: null,
        egyhazmegyek: [arvaAg],
      })
    }
  }

  return {
    data: {
      keruletek,
      tagszamElerheto,
      tagszamUzenet: tagszamRes.uzenet,
      hianyzoMezokElerheto: rendszergazda,
      rendszergazda,
      hatokorUres: false,
      hatokorUzenet: null,
      mertAt,
    },
  }
}
