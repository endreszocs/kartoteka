'use server'

/**
 * EGYHÁZKERÜLETI FOGADÓ FELÜLET — szerver akciók (2026-08-16, kerületi S3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT LÉTEZIK EZ A FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * A `diocese_felterjesztes` tábla ÍRÓ vége 2026-08-15 óta él: az egyházmegye a
 * véglegesítés-gombbal felküldi a számadását, költségvetését, a
 * költségvetés-módosításait és a számvevői összesítőjét
 * (lib/finance/diocese-felterjesztes.ts → `rogzitDioceseFelterjesztes`).
 * OLVASÓ vége viszont NEM VOLT: a megye felküldött, a kerület pedig nem látta.
 * A tábla kerületi RLS-policy-ja (`diocese_felterjesztes_kerulet_select` /
 * `_update`) élt, de NULLA alkalmazás-oldali fogyasztója volt neki — vagyis a
 * lánc a fogadó oldalon elhalt. Ez a modul az a hiányzó fogyasztó.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * K4 DÖNTÉS (Endre, 2026-08-15) — EZ A MODUL ADATFORRÁSÁNAK A HATÁRA
 * ────────────────────────────────────────────────────────────────────────────
 * „A kerület nem írhatja és nem is olvashatja a kerület gyülekezeteinek és
 *  egyházmegyéinek az adatait, csak a hivatalosan beküldött adatokat illetve
 *  azoknak az összesítőjét!"
 *
 * Ezért ez a fájl KIZÁRÓLAG két forrásból dolgozik:
 *   (1) a `diocese_felterjesztes` sorokból, és a bennük FAGYASZTOTT
 *       `snapshot_data`-ból — ez a hivatalosan beküldött irat maga;
 *   (2) a `dioceses` TÖRZSADATÁBÓL (id, name) — csak azért, hogy a felület ki
 *       tudja írni, MELYIK egyházmegye küldte. Ez nem „a megye adata", hanem a
 *       feladó neve a borítékon.
 * A megye KÖNYVEIBE (diocese_befizetes / diocese_kiadas / diocese_koltsegvetes
 * / annual_reports) ez a modul SOHA nem néz bele — azoknak a policy-knak a
 * kerületi ága 2026-08-16-án meg is szűnt.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A PILLANATKÉP KÜLÖN LEKÉRDEZÉSBEN — MIÉRT
 * ────────────────────────────────────────────────────────────────────────────
 * A `snapshot_data` a teljes megyei számadás/költségvetés fagyasztott jsonb-je,
 * iratonként több tíz–száz kilobyte. Ha a LISTA is áthozná, akkor ~10 megye ×
 * 4 irattípus × évek szorzat MB-okban utazna a szerverről a böngészőbe minden
 * egyes oldalmegnyitáskor — egyetlen, ritkán kinyitott részletkártya kedvéért,
 * ÉVRŐL ÉVRE növekedve. Pontosan ezt a hibát javítottuk már egyszer a
 * gyülekezeti dokumentumközpontban (2026-08-11, P2-#19). Itt NEM követjük el
 * újra: a listában nincs `snapshot_data`, azt a `getFelterjesztesPillanatkep`
 * kéri le, darabonként.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HATÓKÖR — FAIL-CLOSED, KÉT SZINTEN
 * ────────────────────────────────────────────────────────────────────────────
 * A hatókört KIZÁRÓLAG a lib/auth/level-scope.ts szerep-SZŰRT feloldói adják
 * (`resolveDistrictReadScopeIds` / `resolveDistrictWriteScopeIds`), amelyek az
 * adatbázis `current_user_district_olvaso_ids()` / `current_user_district_ids()`
 * függvényeinek a tükörképei. Üres hatókör → ÜRES eredmény, SOHA nem szűretlen
 * lekérdezés. A szűretlen ág kizárólag a feliratozott rendszergazdai/master ág.
 *
 * A KÉT SZINT: az egyházkerületi SZÁMVEVŐ (ellenőr) OLVAS — megnézheti és
 * kinyomtathatja a felterjesztéseket és a pillanatképeiket —, de NEM ÍR: nem
 * vesz át, nem küld vissza, nem bírál el. Ezt a felület a `canWrite` /
 * `readOnlyReason` mezőkből ELŐRE tudja (letiltott gomb + magyarázat), nem egy
 * néma 0-soros UPDATE után.
 *
 * ⚠️ ISMERT SÉMA-DIVERGENCIA (az S3 SQL teendője, NEM ezé a fájlé):
 *    a `diocese_felterjesztes_kerulet_select` policy ma a
 *    `current_user_district_ids()`-t hívja, ami CSAK az `egyhazkeruleti_admin`-t
 *    engedi. A kerületi SZÁMVEVŐ tehát az app-oldali kapun átjut, az RLS-en
 *    viszont 0 sort kap — pontosan az a néma üres képernyő, amit a megyei
 *    számvevőnél már egyszer megszenvedtünk. Ezért a lista ÜRES eredménynél
 *    beszédes `scopeNotice`-t ad az ellenőrnek, hogy tudja: nem „nincs
 *    felterjesztés", hanem a jogosultsága még nincs élesítve.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ÉRTESÍTÉS — a MEGLÉVŐ csengő-infrastruktúrán (`ertesitesek` tábla)
 * ────────────────────────────────────────────────────────────────────────────
 * A projektben nincs külön „notification service": minden szint ugyanazt csinálja
 * — sorokat szúr az `ertesitesek` táblába (lásd dashboard-egyhazmegye/
 * document-actions.ts és actions.ts). Ezt használjuk, nem találunk ki újat.
 *
 * ⚠️ AMIT AZ S3 SQL-NEK PÓTOLNIA KELL: az `ertesitesek_szint_insert` policy
 *    (2026-08-11-globalis-hozzaferes-szukites.sql, 3h szakasz) feltétele
 *    `congregation_id IS NOT NULL AND current_user_can_access_congregation(...)`.
 *    A kerület → megye értesítésnek NINCS gyülekezete (a címzett egy megyei
 *    tisztségviselő), ezért a sor `congregation_id`-ja NULL — a beszúrást tehát
 *    ma csak a globális (rendszergazda) ág engedi át. Kerületi adminként az
 *    insert `{error}`-t ad. Ezt NEM nyeljük el csendben: `console.error`-ral
 *    HANGOSAN naplózzuk, megnevezve a hiányzó policy-t — a „migration-fájl nem
 *    bizonyíték" tanulság szerint a néma elnyelés a legdrágább hibaosztály.
 *    Maga a művelet (átvétel / visszaküldés / elbírálás) ettől már megtörtént,
 *    ezért az akció NEM hibázik el az értesítés miatt.
 */

import { revalidatePath } from 'next/cache'
import { selectAllPaged } from '@kartoteka/supabase-client'
import {
  getEffectiveAccessContext,
  type EffectiveAccessContext,
} from '@/lib/auth/effective-access'
import {
  canReadDistrictScope,
  canWriteDistrictScope,
  describeDistrictWriteBlock,
  resolveDistrictReadScopeIds,
  resolveDistrictWriteScopeIds,
} from '@/lib/auth/level-scope'
import {
  FELTERJESZTES_LABELS,
  type DioceseFelterjesztesSor,
  type DioceseFelterjesztesTipus,
} from '@/lib/finance/diocese-felterjesztes'
import { isMissingColumnError } from '@/lib/utils/schema-errors'
// A visszaküldés indoklásának küszöbe és MAGYAR hibaszövege — KÜLÖN fájlban,
// mert ez a modul `'use server'`, abból nem-async érték nem exportálható. Így a
// kliens ugyanazt a szabályt és ugyanazt a mondatot használja, mint a szerver.
import { ellenorizdAVisszakuldesIndokot } from './felterjesztes-shared'

// ---------------------------------------------------------------------------
// Típusok — a KÖZÖS modulból átvéve (lib/finance/diocese-felterjesztes.ts),
// nem lemásolva: ha a megyei oldal bővül, ez a fájl fordítási hibával jelez,
// nem némán széthúzva.
// ---------------------------------------------------------------------------

type Supa = EffectiveAccessContext['supabase']

/** A felterjesztés állapota — a megyei (küldő) oldallal BETŰRE azonos unió. */
export type FelterjesztesAllapot = DioceseFelterjesztesSor['status']

/** A feloldás-kérelem elbírálásának két kimenete. */
export type FeloldasDontes = 'jovahagy' | 'elutasit'

/** Egy megyei felterjesztés a kerületi fogadó listában (pillanatkép NÉLKÜL). */
export interface KeruletiFelterjesztesSor {
  id: string
  districtId: string
  dioceseId: string
  /** A feladó egyházmegye neve (törzsadat — K4 szerint olvasható). */
  dioceseName: string
  docType: DioceseFelterjesztesTipus
  /** Lelkész-barát felirat a KÖZÖS FELTERJESZTES_LABELS-ből. */
  docLabel: string
  year: number
  /** Költségvetés-módosításnál 1–3, egyébként 0. */
  modificationNumber: number
  status: FelterjesztesAllapot
  submittedAt: string | null
  receivedAt: string | null
  returnedReason: string | null
  iktatoszam: string | null
  /** Kér-e a megye szerkesztési feloldást erre az iratra. */
  unlockRequested: boolean
  unlockReason: string | null
  /**
   * Írhat-e a hívó EZEN A SORON: átvétel / visszaküldés / elbírálás.
   *
   * ⚠️ A GOMBOK TILTÁSÁHOZ EZT a mezőt kell nézni, NEM a lista-szintű
   *    `canWrite`-ot.
   *
   * TÜNET, AMI MIATT BEKERÜLT (2026-08-16): a lista-szintű `canWrite`
   * hatókör-FÜGGETLEN (`canWriteDistrictScope(access)`), a szerver akciók
   * ellenőrzése viszont hatókör-FÜGGŐ. Aki EGYSZERRE `egyhazkeruleti_admin` az
   * A kerületben és `egyhazkeruleti_szamvevo` a B-ben, annak a B kerület sorain
   * is AKTÍV volt az „Átvettem" / „Visszaküldés" gomb, és csak KATTINTÁS UTÁN
   * kapott hibát — pedig a fájl fejléce épp azt ígéri, hogy a felület ELŐRE
   * tudja, mit nem tehet. Ezért soronként, a sor `district_id`-ja alapján
   * számoljuk.
   *
   * KÖTELEZŐ mező (szándékosan nem opcionális): így a kliens nem felejtheti el.
   */
  canWriteRow: boolean
}

/** A fogadó felület teljes adatcsomagja — a gombok tiltásához is elég. */
export interface KeruletiFelterjesztesLista {
  rows: KeruletiFelterjesztesSor[]
  /** A hatókör TELJES archívumának évei (év-chipekhez), csökkenő sorrendben. */
  years: number[]
  /** Feliratozott magyarázat (rendszergazdai nézet, üres hatókör, séma-drift). */
  scopeNotice: string | null
  /**
   * Írhat-e a hívó VALAHOL a hatókörében (átvétel / visszaküldés / elbírálás)?
   *
   * ⚠️ Ez a mező HATÓKÖR-FÜGGETLEN, ezért KIZÁRÓLAG a FEJLÉC-szintű üzenethez
   *    való („csak megtekintheted" sáv, ellenőri felirat). A GOMBOK TILTÁSÁHOZ
   *    a SOR-szintű `KeruletiFelterjesztesSor.canWriteRow` mezőt kell nézni:
   *    aki az egyik kerületben adminisztrátor, a másikban viszont csak
   *    számvevő, arra ez `true`, a másik kerület sorain mégsem írhat.
   */
  canWrite: boolean
  /** Miért nem írhat — a letiltott gomb tooltipjébe ÉS a szerver-hibába. */
  readOnlyReason: string | null
  error?: string
}

/** A pillanatkép-néző fejléce — hogy ne kelljen második körben lekérdezni. */
export interface FelterjesztesPillanatkepFej {
  id: string
  dioceseName: string
  docType: DioceseFelterjesztesTipus
  docLabel: string
  year: number
  modificationNumber: number
  status: FelterjesztesAllapot
  submittedAt: string | null
  receivedAt: string | null
  iktatoszam: string | null
}

export interface FelterjesztesMuveletEredmeny {
  success?: true
  error?: string
}

// ---------------------------------------------------------------------------
// Belső segédek
// ---------------------------------------------------------------------------

/** Az .in() lista darabolása — a PostgREST URL-hossz plafonja miatt. */
const IN_CHUNK = 120

/**
 * A LISTA oszlopai. ⚠️ `snapshot_data` SZÁNDÉKOSAN NINCS BENNE — lásd a fájl
 * fejlécének „A pillanatkép külön lekérdezésben" szakaszát.
 */
const LISTA_ALAP_OSZLOPOK =
  'id, diocese_id, district_id, doc_type, year, modification_number, status, ' +
  'submitted_at, received_at, returned_reason, iktatoszam'

/** A feloldás-kérés oszlopai — ÚJABBAK, ezért séma-drift esetén lehámozhatók. */
const LISTA_FELOLDAS_OSZLOPOK = 'unlock_requested, unlock_reason'

/** Az írási akciók által olvasott oszlopok (a notes-napló hozzáfűzéséhez kell). */
const AKCIO_OSZLOPOK =
  'id, diocese_id, district_id, doc_type, year, modification_number, status, ' +
  'submitted_at, received_at, notes'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Notes-napló: időbélyeges sor HOZZÁFŰZÉSE (soha nem felülírás).
 *
 * A `notes` oszlop az irat VÁLTOZÁS-TÖRTÉNETE: felküldés, feloldás-kérés,
 * kerületi átvétel, visszaküldés indoklása, elbírálás. A megyei oldal ugyanezt
 * a formátumot használja (`naploSor`, lib/finance/diocese-felterjesztes.ts),
 * ezért a két vég naplója egyetlen, folytonos idővonalat ad ki.
 */
function naploSor(elozo: string | null | undefined, szoveg: string): string {
  const belyeg = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const uj = `[${belyeg}] ${szoveg}`
  const alap = (elozo || '').trim()
  return alap ? `${alap}\n${uj}` : uj
}

/** Egy sor lelkész-barát megnevezése hibaüzenetekhez: „2025. évi számadás". */
function iratMegnevezes(
  docType: DioceseFelterjesztesTipus,
  year: number,
  modificationNumber: number,
): string {
  const alap = FELTERJESZTES_LABELS[docType] ?? String(docType)
  const mod = modificationNumber > 0 ? ` (${modificationNumber}. módosítás)` : ''
  return `${year}. évi ${alap.toLowerCase()}${mod}`
}

/**
 * A hívó kerületi OLVASÁSI hatóköre — FAIL-CLOSED.
 *
 * `districtIds: null` = feliratozott rendszergazdai/master ág (szűretlen).
 * Bármely más esetben konkrét, szerep-szűrt lista; üres hatókörnél `error`.
 */
function feloldOlvasoHatokor(
  access: EffectiveAccessContext,
): { districtIds: string[] | null; scopeNotice: string | null } | { error: string } {
  const ids = resolveDistrictReadScopeIds(access)
  if (ids.length > 0) return { districtIds: ids, scopeNotice: null }
  if (access.master || access.admin) {
    return {
      districtIds: null,
      scopeNotice: 'Rendszergazdai nézet: minden egyházkerület felterjesztései látszanak.',
    }
  }
  return {
    error:
      'Nincs feloldható egyházkerület-hatóköre — az adatok védelme érdekében nem jelenítünk meg listát. ' +
      'Ha úgy gondolod, hogy neked járna, kérd a rendszergazdától.',
  }
}

/**
 * Az egyházmegyék NEVE (törzsadat) a megadott azonosítókra — K4 szerint ennyit
 * olvasunk a megyékről: a feladó nevét a borítékon. Hibánál nem állunk meg
 * (a lista fontosabb, mint a felirat), csak hangosan naplózunk.
 */
async function olvasMegyeNevek(supabase: Supa, dioceseIds: string[]): Promise<Map<string, string>> {
  const nevek = new Map<string, string>()
  for (const ids of chunk([...new Set(dioceseIds)], IN_CHUNK)) {
    if (ids.length === 0) continue
    const { data, error } = await supabase.from('dioceses').select('id, name').in('id', ids)
    if (error) {
      console.error('[kerulet/felterjesztes] az egyházmegyék nevének olvasása hibára futott:', error.message)
      continue
    }
    for (const r of data || []) {
      nevek.set(String(r.id), String((r as { name?: string | null }).name || '') || 'Ismeretlen egyházmegye')
    }
  }
  return nevek
}

/**
 * Nyers sor → felületi sor.
 *
 * @param irhatE a SOR kerületére vonatkozó írási jog feloldója (lásd a
 *   `canWriteRow` mező kommentjét: a hatókör-független lista-szintű jog
 *   hamisan aktív gombokat adott a másik kerület sorain).
 */
function nyersbolSor(
  r: Record<string, unknown>,
  megyeNevek: Map<string, string>,
  irhatE: (districtId: string) => boolean,
): KeruletiFelterjesztesSor {
  const docType = r.doc_type as DioceseFelterjesztesTipus
  const dioceseId = String(r.diocese_id)
  const districtId = String(r.district_id)
  return {
    id: String(r.id),
    districtId,
    dioceseId,
    dioceseName: megyeNevek.get(dioceseId) || 'Ismeretlen egyházmegye',
    docType,
    docLabel: FELTERJESZTES_LABELS[docType] ?? String(r.doc_type),
    year: Number(r.year),
    modificationNumber: Number(r.modification_number) || 0,
    status: ((r.status as FelterjesztesAllapot) ?? 'draft'),
    submittedAt: (r.submitted_at as string | null) ?? null,
    receivedAt: (r.received_at as string | null) ?? null,
    returnedReason: (r.returned_reason as string | null) ?? null,
    iktatoszam: (r.iktatoszam as string | null) ?? null,
    unlockRequested: r.unlock_requested === true,
    unlockReason: (r.unlock_reason as string | null) ?? null,
    canWriteRow: irhatE(districtId),
  }
}

/**
 * Egy felterjesztés betöltése + HATÓKÖR-ELLENŐRZÉS.
 *
 * MIÉRT KÜLÖN LÉPÉS AZ RLS MELLETT: a `diocese_felterjesztes` sor `id`-ja a
 * KLIENSTŐL jön. Ha csak az RLS védene, egy elgépelt/kitalált id-re a
 * viselkedés attól függne, hogy éppen milyen policy-k élnek — és a projekt már
 * kétszer megtapasztalta, hogy a repó és az éles adatbázis némán széthúz. Ezért
 * az app is ellenőrzi: a sor `district_id`-jának a hívó SZEREP-SZŰRT
 * hatókörében kell lennie. Ne lehessen MÁS kerület felterjesztését átvenni.
 *
 * `mode: 'read'` — a kerületi számvevő is beleesik (megtekintés, nyomtatás);
 * `mode: 'write'` — csak az egyházkerületi adminisztrátor (átvétel, elbírálás).
 */
async function betoltFelterjesztes(
  access: EffectiveAccessContext,
  id: string,
  mode: 'read' | 'write',
  oszlopok: string,
): Promise<{ sor: Record<string, unknown> } | { error: string }> {
  const { data, error } = await access.supabase
    .from('diocese_felterjesztes')
    .select(oszlopok)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error.message)) {
      return {
        error:
          'A felterjesztések nyilvántartó táblája vagy oszlopa még hiányzik az adatbázisból. ' +
          'Futtasd le a 2026-08-15-egyhazmegyei-uj-tablak.sql, a ' +
          '2026-08-15-egyhazmegyei-felterjesztes-modositas.sql és a ' +
          '2026-08-15-egyhazmegyei-osszesito-feloldas.sql fájlt, majd próbáld újra.',
      }
    }
    return {
      error:
        'A felterjesztés most nem olvasható, ezért a művelet biztonsági okból elmaradt. ' +
        `Próbáld újra néhány perc múlva (részlet: ${error.message}).`,
    }
  }
  const sor = data as Record<string, unknown> | null
  if (!sor) return { error: 'A felterjesztés nem található, vagy nincs hozzáférésed.' }

  // Rendszergazda / master: feliratozott, szint-független ág.
  if (access.admin || access.master) return { sor }

  const districtId = (sor.district_id as string | null) || null
  const hatokor =
    mode === 'read' ? resolveDistrictReadScopeIds(access) : resolveDistrictWriteScopeIds(access)

  if (hatokor.length === 0) {
    return {
      error:
        mode === 'read'
          ? 'Nincs feloldható egyházkerület-hatóköre — a művelet nem engedélyezett.'
          : describeDistrictWriteBlock(access, districtId) ??
            'Nincs feloldható egyházkerület-hatóköre — a művelet nem engedélyezett.',
    }
  }
  if (!districtId || !hatokor.includes(districtId)) {
    return { error: 'Ez a felterjesztés nem a te egyházkerületedhez tartozik.' }
  }
  return { sor }
}

/**
 * ÉRTESÍTÉS A MEGYÉNEK — a MEGLÉVŐ csengő-infrastruktúrán (`ertesitesek`).
 *
 * CÍMZETTEK: a megye tisztségviselői KÉT lábon, unióban:
 *   · a skalár `profiles` (role + diocese_id), és
 *   · a `profile_roles` (scope='diocese', scope_id, approved+active).
 * Azért mindkettő, mert a két réteg bizonyítottan széthúz (egy „profile_roles-
 * only" esperes skalárja `lelkesz` is lehet) — egyik irányban se nyeljünk el
 * értesítést. A `Set` garantálja, hogy senki ne kapja meg kétszer.
 *
 * A megyei SZÁMVEVŐ is címzett: a számvevői összesítő az ő irata, a
 * visszaküldés indoklása pedig neki szól — hiába nem ő küldi fel.
 *
 * ⚠️ NEM CSENDES a hiba: lásd a fájl fejlécének értesítés-szakaszát (a NULL
 *    `congregation_id`-s sort az `ertesitesek_szint_insert` policy ma nem
 *    engedi át kerületi adminnak). A művelet maga már megtörtént, ezért az
 *    akció NEM hibázik el — de a szerver-napló hangosan megmondja, mi hiányzik.
 */
async function ertesitsdAMegyet(
  supabase: Supa,
  args: {
    dioceseId: string
    cim: string
    uzenet: string
    tipus: 'info' | 'success' | 'warning'
  },
): Promise<void> {
  try {
    const cimzettek = new Set<string>()
    const megyeiSzerepek = ['esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo']

    const { data: skalaris } = await supabase
      .from('profiles')
      .select('id')
      .eq('status', 'active')
      .eq('diocese_id', args.dioceseId)
      .in('role', megyeiSzerepek)
    for (const r of skalaris || []) if (r.id) cimzettek.add(String(r.id))

    const { data: szerepkorosek } = await supabase
      .from('profile_roles')
      .select('profile_id')
      .eq('scope', 'diocese')
      .eq('scope_id', args.dioceseId)
      .in('role', megyeiSzerepek)
      .eq('active', true)
      .eq('approval_status', 'approved')
    for (const r of szerepkorosek || []) if (r.profile_id) cimzettek.add(String(r.profile_id))

    if (cimzettek.size === 0) {
      console.error(
        '[kerulet/felterjesztes] az értesítés kimaradt: a(z)',
        args.dioceseId,
        'egyházmegyéhez nincs aktív esperes / egyházmegyei admin / számvevő címzett.',
      )
      return
    }

    const sorok = [...cimzettek].map((userId) => ({
      user_id: userId,
      // Nincs gyülekezet: a címzett megyei tisztségviselő, az irat megyei irat.
      congregation_id: null,
      cim: args.cim,
      uzenet: args.uzenet,
      tipus: args.tipus,
      hivatkozas: '/dashboard-egyhazmegye',
    }))
    const { error } = await supabase.from('ertesitesek').insert(sorok)
    if (error) {
      // HANGOS napló — a supabase-js NEM dob, tehát try/catch nem fogná meg.
      console.error(
        '[kerulet/felterjesztes] az értesítés beszúrása elbukott. Valószínű ok: az ' +
          '`ertesitesek_szint_insert` policy `congregation_id IS NOT NULL`-t vár, a ' +
          'kerület → megye értesítésnek viszont nincs gyülekezete. Az S3 SQL-nek külön ' +
          'kerületi INSERT-policy-t kell adnia. Részlet:',
        error.message,
      )
    }
  } catch (e) {
    console.error('[kerulet/felterjesztes] váratlan hiba az értesítés küldésekor:', e)
  }
}

function frissitsdAFeluleteket(): void {
  revalidatePath('/dashboard-kerulet')
  revalidatePath('/dashboard-egyhazmegye')
}

// ---------------------------------------------------------------------------
// 1. A kerület(ek) felterjesztései — a fogadó lista
// ---------------------------------------------------------------------------

/**
 * A kerület(ek) ÖSSZES megyei felterjesztése, mind a négy irat-típusra.
 *
 * @param ev opcionális év-szűrő. Elhagyva MINDEN év jön (a `years` mező pedig
 *   mindig a TELJES archívumot tükrözi, hogy az év-chipek ne csonkuljanak).
 *
 * FAIL-CLOSED: üres hatókör → üres lista + beszédes `scopeNotice`/`error`,
 * SOHA nem szűretlen lekérdezés.
 *
 * ⚠️ A `snapshot_data` NEM utazik ebben a listában (lásd a fájl fejlécét) —
 *    azt a `getFelterjesztesPillanatkep` adja, iratonként.
 */
export async function getKeruletiFelterjesztesek(
  ev?: number | null,
): Promise<KeruletiFelterjesztesLista> {
  const ures: KeruletiFelterjesztesLista = {
    rows: [],
    years: [],
    scopeNotice: null,
    canWrite: false,
    readOnlyReason: null,
  }

  const access = await getEffectiveAccessContext()
  if (!access.user) return { ...ures, error: 'Nincs bejelentkezve.' }

  // OLVASÓ kapu — a kerületi számvevő (ellenőr) is átmegy rajta.
  if (!canReadDistrictScope(access)) {
    return { ...ures, error: 'Nincs jogosultságod az egyházkerületi felterjesztésekhez.' }
  }

  const canWrite = canWriteDistrictScope(access)
  const readOnlyReason = canWrite ? null : describeDistrictWriteBlock(access)

  const hatokor = feloldOlvasoHatokor(access)
  if ('error' in hatokor) return { ...ures, canWrite, readOnlyReason, error: hatokor.error }

  const { supabase } = access
  const { districtIds } = hatokor
  let scopeNotice = hatokor.scopeNotice

  /**
   * A tényleges lekérdezés. Séma-drift esetén (a feloldás-oszlopok még
   * hiányoznak) FAIL-SOFT újrapróbálás nélkülük — mert egy ÚJ funkció
   * (feloldás-elbírálás) nem ronthat el egy MŰKÖDŐT (a fogadó lista).
   */
  const lekerdez = async (
    oszlopok: string,
  ): Promise<{ rows: Array<Record<string, unknown>>; error?: string }> => {
    const osszes: Array<Record<string, unknown>> = []
    const csoportok = districtIds ? chunk(districtIds, IN_CHUNK) : [null]
    for (const ids of csoportok) {
      if (ids && ids.length === 0) continue
      let q = supabase
        .from('diocese_felterjesztes')
        .select(oszlopok)
        .order('year', { ascending: false })
      if (ids) q = q.in('district_id', ids)
      if (ev != null) q = q.eq('year', ev)
      // A közös lapozó `id` ASC döntetlen-bontót fűz hozzá, és CSAK üres lapnál
      // áll meg — a `year` erősen nem egyedi, rövid lapra kilépve sorok vesznének.
      const { data, error } = await selectAllPaged<Record<string, unknown>>(q)
      if (error) return { rows: osszes, error: error.message }
      osszes.push(...data)
    }
    return { rows: osszes }
  }

  let eredmeny = await lekerdez(`${LISTA_ALAP_OSZLOPOK}, ${LISTA_FELOLDAS_OSZLOPOK}`)
  if (eredmeny.error && isMissingColumnError(eredmeny.error)) {
    const alap = await lekerdez(LISTA_ALAP_OSZLOPOK)
    if (alap.error) {
      return {
        ...ures,
        canWrite,
        readOnlyReason,
        error: isMissingColumnError(alap.error)
          ? 'A felterjesztések nyilvántartó táblája még hiányzik az adatbázisból. ' +
            'Futtasd le a 2026-08-15-egyhazmegyei-uj-tablak.sql fájlt.'
          : `A felterjesztések nem tölthetők be (részlet: ${alap.error}).`,
      }
    }
    eredmeny = alap
    scopeNotice =
      [scopeNotice, 'A feloldás-kérések oszlopai még hiányoznak az adatbázisból ' +
        '(2026-08-15-egyhazmegyei-osszesito-feloldas.sql) — a kérelmek elbírálása addig nem elérhető.']
        .filter(Boolean)
        .join(' ')
  } else if (eredmeny.error) {
    // FAIL-CLOSED: a hibát NEM adjuk vissza „nincs felterjesztés" képként — az
    // arra bírná a kerületet, hogy azt higgye, a megyék nem küldtek fel semmit.
    return {
      ...ures,
      canWrite,
      readOnlyReason,
      error: `A felterjesztések nem tölthetők be (részlet: ${eredmeny.error}).`,
    }
  }

  const megyeNevek = await olvasMegyeNevek(
    supabase,
    eredmeny.rows.map((r) => String(r.diocese_id)),
  )
  // SOR-SZINTŰ írási jog, kerületenként EGYSZER kiszámolva (a hatókör-feloldás
  // nem ingyenes, a lista viszont több száz soros is lehet). Lásd a
  // `canWriteRow` mező kommentjét: a lista-szintű `canWrite` hatókör-független,
  // ezért a gombokat NEM szabad rá bízni.
  const irhatCache = new Map<string, boolean>()
  const irhatE = (districtId: string): boolean => {
    const kesz = irhatCache.get(districtId)
    if (kesz !== undefined) return kesz
    const ertek = canWriteDistrictScope(access, districtId)
    irhatCache.set(districtId, ertek)
    return ertek
  }

  const rows = eredmeny.rows
    .map((r) => nyersbolSor(r, megyeNevek, irhatE))
    // Rendezés: legfrissebb év elöl, azon belül megye, majd irat-típus — a
    // darabolt .in() lekérdezések laponként rendezettek, az összefűzött nem.
    .sort(
      (a, b) =>
        b.year - a.year ||
        a.dioceseName.localeCompare(b.dioceseName, 'hu') ||
        a.docType.localeCompare(b.docType) ||
        a.modificationNumber - b.modificationNumber,
    )

  // Év-chipek: a TELJES archívum évei, olcsó lekérdezésből (csak a `year`
  // oszlop) — hogy az év-szűrő akkor is teljes legyen, ha `ev` meg van adva.
  const years = await olvasEvek(supabase, districtIds)

  // Beszédes üzenet az ellenőrnek, ha üres a lista (lásd a fejléc
  // „ISMERT SÉMA-DIVERGENCIA" szakaszát): a néma üres képernyő a legrosszabb.
  if (rows.length === 0 && !canWrite && resolveDistrictReadScopeIds(access).length > 0) {
    scopeNotice =
      [scopeNotice, 'Ha ellenőrként üresnek látod a listát, az nem feltétlenül azt jelenti, hogy ' +
        'nincs felterjesztés: az adatbázis olvasási szabálya jelenleg csak az egyházkerületi ' +
        'adminisztrátort engedi a felterjesztésekhez. Jelezd a rendszergazdának.']
        .filter(Boolean)
        .join(' ')
  }

  return { rows, years, scopeNotice, canWrite, readOnlyReason }
}

/**
 * Az évlista a hatókör TELJES archívumából — csak a `year` oszlopot olvassuk,
 * ezért olcsó. Hibánál üres tömb + hangos szerver-napló (az év-chipek hiánya
 * nem indokolja a lista megtagadását).
 */
async function olvasEvek(supabase: Supa, districtIds: string[] | null): Promise<number[]> {
  const evek = new Set<number>()
  const csoportok = districtIds ? chunk(districtIds, IN_CHUNK) : [null]
  for (const ids of csoportok) {
    if (ids && ids.length === 0) continue
    let q = supabase.from('diocese_felterjesztes').select('id, year')
    if (ids) q = q.in('district_id', ids)
    const { data, error } = await selectAllPaged<{ year: number | null }>(q)
    if (error) {
      console.error('[kerulet/felterjesztes] az év-lista olvasása hibára futott:', error.message)
      continue
    }
    for (const r of data) {
      if (typeof r.year === 'number' && Number.isFinite(r.year)) evek.add(r.year)
    }
  }
  return [...evek].sort((a, b) => b - a)
}

// ---------------------------------------------------------------------------
// 2. Egyetlen felterjesztés FAGYASZTOTT pillanatképe
// ---------------------------------------------------------------------------

/**
 * Egy felterjesztés `snapshot_data`-ja — megtekintésre és nyomtatásra.
 *
 * Ez az a fagyasztott állapot, amit a megye a véglegesítéskor felküldött: a
 * kerület ebből (és csak ebből) dolgozik. Az ellenőr (kerületi számvevő) is
 * megnézheti — épp ez a munkaeszköze —, ezért OLVASÓ hatókör-kapu áll itt.
 */
export async function getFelterjesztesPillanatkep(id: string): Promise<{
  snapshot: Record<string, unknown> | null
  fej?: FelterjesztesPillanatkepFej
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { snapshot: null, error: 'Nincs bejelentkezve.' }
  if (!canReadDistrictScope(access)) {
    return { snapshot: null, error: 'Nincs jogosultságod az egyházkerületi felterjesztésekhez.' }
  }

  const betolt = await betoltFelterjesztes(
    access,
    id,
    'read',
    'id, diocese_id, district_id, doc_type, year, modification_number, status, ' +
      'submitted_at, received_at, iktatoszam, snapshot_data',
  )
  if ('error' in betolt) return { snapshot: null, error: betolt.error }
  const sor = betolt.sor

  const megyeNevek = await olvasMegyeNevek(access.supabase, [String(sor.diocese_id)])
  const docType = sor.doc_type as DioceseFelterjesztesTipus

  return {
    snapshot: (sor.snapshot_data as Record<string, unknown> | null) ?? null,
    fej: {
      id: String(sor.id),
      dioceseName: megyeNevek.get(String(sor.diocese_id)) || 'Ismeretlen egyházmegye',
      docType,
      docLabel: FELTERJESZTES_LABELS[docType] ?? String(sor.doc_type),
      year: Number(sor.year),
      modificationNumber: Number(sor.modification_number) || 0,
      status: ((sor.status as FelterjesztesAllapot) ?? 'draft'),
      submittedAt: (sor.submitted_at as string | null) ?? null,
      receivedAt: (sor.received_at as string | null) ?? null,
      iktatoszam: (sor.iktatoszam as string | null) ?? null,
    },
  }
}

// ---------------------------------------------------------------------------
// 3. „Átvettem" — az átvétel nyugtázása
// ---------------------------------------------------------------------------

/**
 * A kerület visszaigazolja a felterjesztés ÁTVÉTELÉT: `status='received'`,
 * `received_at=most`, `received_by=hívó`.
 *
 * CSAK `submitted` állapotból léphet `received`-be. A többi állapot beszédes
 * hibát kap, mert mind mást jelent:
 *   · `draft`    — a megye még nem küldte fel (vagy visszavonta): nincs mit átvenni;
 *   · `received` — már átvettük (a kétszeri nyugtázás hamis idővonalat írna);
 *   · `returned` — visszaküldtük javításra: előbb a megyének kell újra felküldenie.
 *
 * A 0-soros UPDATE HANGOS hiba: a néma no-op („minden rendben", közben semmi
 * nem történt) a projekt visszatérő, legdrágább hibaosztálya.
 */
export async function atvetelNyugtazas(id: string): Promise<FelterjesztesMuveletEredmeny> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  // ÍRÓ kapu — a kerületi számvevő ELŐRE, beszédes magyarázattal áll meg itt.
  if (!canWriteDistrictScope(access)) {
    return { error: describeDistrictWriteBlock(access) ?? 'Nincs jogosultságod az átvételhez.' }
  }

  const betolt = await betoltFelterjesztes(access, id, 'write', AKCIO_OSZLOPOK)
  if ('error' in betolt) return { error: betolt.error }
  const sor = betolt.sor

  // Kerület-specifikus írási jog (aki az egyik kerületben admin, a másikban
  // csak ellenőr — a hatókör-független kapu rá `true`-t adott volna).
  const districtId = String(sor.district_id)
  if (!canWriteDistrictScope(access, districtId)) {
    return {
      error:
        describeDistrictWriteBlock(access, districtId) ??
        'Ebben az egyházkerületben nincs írási jogosultságod.',
    }
  }

  const megnevezes = iratMegnevezes(
    sor.doc_type as DioceseFelterjesztesTipus,
    Number(sor.year),
    Number(sor.modification_number) || 0,
  )
  const allapot = (sor.status as FelterjesztesAllapot) ?? 'draft'
  if (allapot === 'received') {
    return { error: `A(z) ${megnevezes} átvételét már visszaigazoltátok — nincs mit tenni.` }
  }
  if (allapot === 'draft') {
    return {
      error:
        `A(z) ${megnevezes} nincs felküldve (az egyházmegye még nem véglegesítette, vagy ` +
        'visszavonta a felküldést), ezért az átvétele nem igazolható vissza.',
    }
  }
  if (allapot === 'returned') {
    return {
      error:
        `A(z) ${megnevezes} javításra vissza lett küldve az egyházmegyének. Az átvételt akkor ` +
        'lehet visszaigazolni, ha a megye a javítás után újra felküldte.',
    }
  }

  const most = new Date().toISOString()
  const { data: frissitett, error } = await access.supabase
    .from('diocese_felterjesztes')
    .update({
      status: 'received',
      received_at: most,
      received_by: access.user.id,
      notes: naploSor(sor.notes as string | null, 'Az egyházkerület átvette a felterjesztést.'),
    })
    .eq('id', id)
    // Optimista zárolás: ha közben megváltozott az állapot (pl. a megye
    // visszavonta a felküldést), NE írjuk felül — inkább hangos hiba.
    .eq('status', 'submitted')
    .select('id')

  if (error) return { error: `Az átvétel visszaigazolása nem sikerült (részlet: ${error.message}).` }
  if (!frissitett || frissitett.length === 0) {
    return {
      error:
        'Az átvétel visszaigazolása nem történt meg — vagy nincs hozzá írási jogosultságod, vagy ' +
        'az irat állapota időközben megváltozott. Frissítsd az oldalt, és nézd meg újra.',
    }
  }

  await ertesitsdAMegyet(access.supabase, {
    dioceseId: String(sor.diocese_id),
    cim: `Átvéve az egyházkerületben: ${megnevezes}`,
    uzenet:
      `Az egyházkerület átvette a(z) ${megnevezes} felterjesztést. ` +
      'Az irat ettől kezdve a kerület kezében van; ha javítani kell rajta, feloldást kell kérned.',
    tipus: 'success',
  })

  frissitsdAFeluleteket()
  return { success: true }
}

// ---------------------------------------------------------------------------
// 4. Visszaküldés javításra — KÖTELEZŐ indoklással
// ---------------------------------------------------------------------------

/**
 * A kerület VISSZAKÜLDI a felterjesztést javításra: `status='returned'`,
 * `returned_reason=indok`, és időbélyeges bejegyzés a notes-naplóba.
 *
 * AZ INDOKLÁS KÖTELEZŐ (Endre K5 döntése). Indoklás nélkül a visszaküldés a
 * megyének értelmezhetetlen: nem tudja, mit javítson, tehát vagy változatlanul
 * küldi vissza, vagy telefonálni kezd — mindkettő elveszett idő. Ezért az üres
 * vagy túl rövid indok BESZÉDES magyar hibát kap, nem néma elutasítást.
 *
 * A `received_at` SZÁNDÉKOSAN MEGMARAD: ha a kerület egyszer átvette az iratot,
 * az megtörtént tény — a visszaküldés nem törli a történelmet, hozzáír. A
 * megye a `returned_reason`-ből és a naplóból együtt látja a teljes utat.
 */
export async function visszakuldes(
  id: string,
  indok: string,
): Promise<FelterjesztesMuveletEredmeny> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  if (!canWriteDistrictScope(access)) {
    return { error: describeDistrictWriteBlock(access) ?? 'Nincs jogosultságod a visszaküldéshez.' }
  }

  // Az üres ÉS a túl rövid indok ellenőrzése a KÖZÖS `felterjesztes-shared.ts`-ből
  // jön. TÜNET, ami miatt átköltözött: a küszöb korábban csak ITT élt, a felület
  // pedig csak az üres mezőt fogta meg — így a „nem jó" beírása után a hibát a
  // felhasználó csak a gomb megnyomása UTÁN kapta meg. A szerver-ellenőrzés
  // marad (a kliens megkerülhető), csak már ugyanabból a forrásból.
  const indokHiba = ellenorizdAVisszakuldesIndokot(indok)
  if (indokHiba) return { error: indokHiba }
  const tisztaIndok = (indok || '').trim()

  const betolt = await betoltFelterjesztes(access, id, 'write', AKCIO_OSZLOPOK)
  if ('error' in betolt) return { error: betolt.error }
  const sor = betolt.sor

  const districtId = String(sor.district_id)
  if (!canWriteDistrictScope(access, districtId)) {
    return {
      error:
        describeDistrictWriteBlock(access, districtId) ??
        'Ebben az egyházkerületben nincs írási jogosultságod.',
    }
  }

  const megnevezes = iratMegnevezes(
    sor.doc_type as DioceseFelterjesztesTipus,
    Number(sor.year),
    Number(sor.modification_number) || 0,
  )
  const allapot = (sor.status as FelterjesztesAllapot) ?? 'draft'
  if (allapot === 'draft') {
    return {
      error: `A(z) ${megnevezes} nincs felküldve, ezért nincs mit visszaküldeni az egyházmegyének.`,
    }
  }
  if (allapot === 'returned') {
    return {
      error:
        `A(z) ${megnevezes} már vissza lett küldve javításra. Ha az indoklást pontosítani ` +
        'szeretnéd, vedd fel a kapcsolatot az esperessel.',
    }
  }

  const { data: frissitett, error } = await access.supabase
    .from('diocese_felterjesztes')
    .update({
      status: 'returned',
      returned_reason: tisztaIndok,
      notes: naploSor(
        sor.notes as string | null,
        `Az egyházkerület javításra visszaküldte a felterjesztést — ${tisztaIndok}`,
      ),
    })
    .eq('id', id)
    // Optimista zárolás: csak abból a két állapotból léphetünk vissza.
    .in('status', ['submitted', 'received'])
    .select('id')

  if (error) return { error: `A visszaküldés nem sikerült (részlet: ${error.message}).` }
  if (!frissitett || frissitett.length === 0) {
    return {
      error:
        'A visszaküldés nem történt meg — vagy nincs hozzá írási jogosultságod, vagy az irat ' +
        'állapota időközben megváltozott. Frissítsd az oldalt, és nézd meg újra.',
    }
  }

  await ertesitsdAMegyet(access.supabase, {
    dioceseId: String(sor.diocese_id),
    cim: `Visszaküldve javításra: ${megnevezes}`,
    uzenet:
      `Az egyházkerület javításra visszaküldte a(z) ${megnevezes} felterjesztést. ` +
      `Indoklás: ${tisztaIndok} A javítás után az irat újra felküldhető.`,
    tipus: 'warning',
  })

  frissitsdAFeluleteket()
  return { success: true }
}

// ---------------------------------------------------------------------------
// 5. Feloldás-kérelem elbírálása
// ---------------------------------------------------------------------------

/**
 * A megye szerkesztési FELOLDÁS-KÉRELMÉNEK elbírálása.
 *
 * A kérelem másik vége: `keresOsszesitoFeloldas`
 * (lib/finance/diocese-felterjesztes.ts). Ott KÉT ág van: ha a kerület még nem
 * vette át (`submitted`), a megye maga visszavonhatja a felküldést; ha viszont
 * MÁR ÁTVETTÜK (`received`), a kérés csak RÖGZÜL (`unlock_requested`), és a
 * kerület bírálja el. Ez a függvény az az elbíráló — PONTOSAN azokat a mezőket
 * zárja le, amelyeket a kérő oldal nyitott: `unlock_requested`,
 * `unlock_reason`, `status`, `submitted_at`, `notes`.
 *
 * Az `unlock_requested_at` / `unlock_requested_by` SZÁNDÉKOSAN érintetlen: azok
 * a KÉRÉS tényét rögzítik (ki és mikor kérte), és a kérő oldal minden új
 * kérésnél felülírja őket. Az elbírálás nem törli a történelmet — a döntés a
 * naplóba (`notes`) kerül, időbélyeggel.
 *
 * JÓVÁHAGYÁS: `unlock_requested=false`, `unlock_reason=null`, a státusz vissza
 *   `draft`-ra — ettől a megye újra szerkeszthet és újra felküldhet (a felküldő
 *   upsert ugyanezt a sort frissíti majd). A `submitted_at` / `received_at`
 *   nullázódik, mert a kinyitott irat MÁR NEM az a felküldött, átvett példány;
 *   a régi időpontok a naplóban maradnak meg, nem vesznek el.
 *
 * ELUTASÍTÁS: `unlock_requested=false`, `unlock_reason=null`, a STÁTUSZ MARAD
 *   (a felküldött/átvett irat érvényben van), az indok pedig a naplóba kerül.
 *   Az `unlock_reason` azért törlődik, mert a kérelem lezárult — ha ott
 *   maradna, a megyei felület továbbra is „függő kérelmet" mutatna.
 */
export async function feloldasElbiralas(
  id: string,
  dontes: FeloldasDontes,
  indok?: string | null,
): Promise<FelterjesztesMuveletEredmeny> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  if (!canWriteDistrictScope(access)) {
    return {
      error: describeDistrictWriteBlock(access) ?? 'Nincs jogosultságod a kérelmek elbírálásához.',
    }
  }
  if (dontes !== 'jovahagy' && dontes !== 'elutasit') {
    return { error: 'Érvénytelen döntés — csak jóváhagyás vagy elutasítás lehetséges.' }
  }

  const betolt = await betoltFelterjesztes(
    access,
    id,
    'write',
    `${AKCIO_OSZLOPOK}, unlock_requested, unlock_reason`,
  )
  if ('error' in betolt) return { error: betolt.error }
  const sor = betolt.sor

  const districtId = String(sor.district_id)
  if (!canWriteDistrictScope(access, districtId)) {
    return {
      error:
        describeDistrictWriteBlock(access, districtId) ??
        'Ebben az egyházkerületben nincs írási jogosultságod.',
    }
  }

  const megnevezes = iratMegnevezes(
    sor.doc_type as DioceseFelterjesztesTipus,
    Number(sor.year),
    Number(sor.modification_number) || 0,
  )
  if (sor.unlock_requested !== true) {
    return {
      error:
        `A(z) ${megnevezes} iratra nincs függő feloldás-kérelem. Lehet, hogy egy másik ` +
        'adminisztrátor időközben elbírálta — frissítsd az oldalt.',
    }
  }

  const tisztaIndok = (indok || '').trim()
  const kertIndok = (sor.unlock_reason as string | null) || null

  const frissitesek: Record<string, unknown> =
    dontes === 'jovahagy'
      ? {
          unlock_requested: false,
          unlock_reason: null,
          status: 'draft',
          // ⚠️ 2026-08-16: a `submitted_at`-ot SZÁNDÉKOSAN NEM nullázzuk.
          //
          // KÉT OKBÓL:
          //  (1) OKIRAT-INTEGRITÁS. A felküldés MEGTÖRTÉNT tény — a pecsétjét a
          //      feloldás nem törli. A megye újrafelküldése úgyis felülírja
          //      (rogzitDioceseFelterjesztes upsert). Ráadásul a korábbi alak
          //      FÉLIG törölte volna: a `submitted_at` eltűnt, a `submitted_by`
          //      bennmaradt — ez önmagában is inkoherens állapot.
          //  (2) AZ OSZLOP-ŐRSZEM MEGÁLLÍTOTTA VOLNA. Az S3 SQL BEFORE UPDATE
          //      triggere (diocese_felterjesztes_kerulet_oszlopvedelem) a
          //      kerületi úton CSAK a status/received_*/returned_reason/notes/
          //      unlock_*/updated_at oszlopokat engedi. A `submitted_at`
          //      nincs köztük, tehát a jóváhagyás 42501-gyel elszállt volna —
          //      vagyis a K5 szerint KÖTELEZŐ harmadik funkció nem működne.
          //      A megoldás szándékosan az app-oldal szűkítése, nem az őrszem
          //      tágítása: a felküldés pecsétjéhez a kerületnek nincs dolga.
          received_at: null,
          received_by: null,
          notes: naploSor(
            sor.notes as string | null,
            'Az egyházkerület JÓVÁHAGYTA a feloldás-kérelmet — az irat újra szerkeszthető és ' +
              `újra felküldhető (eredeti felküldés: ${(sor.submitted_at as string | null) || 'ismeretlen időpont'}` +
              `${sor.received_at ? `, átvétel: ${String(sor.received_at)}` : ''})` +
              `${kertIndok ? `. A megye indoklása: ${kertIndok}` : ''}` +
              `${tisztaIndok ? `. A kerület megjegyzése: ${tisztaIndok}` : ''}`,
          ),
        }
      : {
          unlock_requested: false,
          unlock_reason: null,
          notes: naploSor(
            sor.notes as string | null,
            'Az egyházkerület ELUTASÍTOTTA a feloldás-kérelmet — az irat a jelenlegi ' +
              'állapotában érvényben marad' +
              `${kertIndok ? `. A megye indoklása: ${kertIndok}` : ''}` +
              `${tisztaIndok ? `. Az elutasítás indoka: ${tisztaIndok}` : ''}`,
          ),
        }

  const { data: frissitett, error } = await access.supabase
    .from('diocese_felterjesztes')
    .update(frissitesek)
    .eq('id', id)
    // Optimista zárolás: csak függő kérelmet lehet elbírálni (kettős kattintás
    // és párhuzamos adminisztrátor ellen egyaránt).
    .eq('unlock_requested', true)
    .select('id')

  if (error) {
    if (isMissingColumnError(error.message)) {
      return {
        error:
          'A feloldás-kérelmek elbírálásához szükséges adatbázis-oszlopok még hiányoznak. ' +
          'Futtasd le a 2026-08-15-egyhazmegyei-osszesito-feloldas.sql fájlt, majd próbáld újra.',
      }
    }
    return { error: `A kérelem elbírálása nem sikerült (részlet: ${error.message}).` }
  }
  if (!frissitett || frissitett.length === 0) {
    return {
      error:
        'A kérelem elbírálása nem történt meg — vagy nincs hozzá írási jogosultságod, vagy egy ' +
        'másik adminisztrátor időközben elbírálta. Frissítsd az oldalt, és nézd meg újra.',
    }
  }

  await ertesitsdAMegyet(access.supabase, {
    dioceseId: String(sor.diocese_id),
    cim:
      dontes === 'jovahagy'
        ? `Feloldás jóváhagyva: ${megnevezes}`
        : `Feloldás elutasítva: ${megnevezes}`,
    uzenet:
      dontes === 'jovahagy'
        ? `Az egyházkerület jóváhagyta a(z) ${megnevezes} feloldás-kérelmét. Az iratot újra ` +
          'szerkesztheted, majd véglegesítés után újra felküldheted.' +
          (tisztaIndok ? ` Megjegyzés: ${tisztaIndok}` : '')
        : `Az egyházkerület elutasította a(z) ${megnevezes} feloldás-kérelmét. Az irat a ` +
          'jelenlegi állapotában érvényben marad.' +
          (tisztaIndok ? ` Indoklás: ${tisztaIndok}` : ''),
    tipus: dontes === 'jovahagy' ? 'success' : 'warning',
  })

  frissitsdAFeluleteket()
  return { success: true }
}
