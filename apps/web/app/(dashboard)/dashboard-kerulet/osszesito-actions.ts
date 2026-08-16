'use server'

/**
 * EGYHÁZKERÜLETI ÖSSZESÍTŐ — szerver akció (2026-08-17, kerületi S4 szelet).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MI EZ, ÉS MIBEN MÁS, MINT A MEGYEI PÁRJA
 * ════════════════════════════════════════════════════════════════════════════
 * A megyei összesítő (dashboard-egyhazmegye/osszesito-actions.ts) a GYÜLEKEZETI
 * beküldésekből dolgozik: `document_submissions.snapshot_data`. A kerületi
 * összesítő NEM: ő a MEGYEI FELTERJESZTÉSEKBŐL összesít —
 * `diocese_felterjesztes.snapshot_data`, `doc_type` szerint (megyei_szamadas,
 * megyei_koltsegvetes, megyei_koltsegvetes_modositas, szamvevoi_osszesito).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ENDRE K4 DÖNTÉSE (élesben 2026-08-16) — EZ A MODUL ADATFORRÁSÁNAK A HATÁRA
 * ────────────────────────────────────────────────────────────────────────────
 * „A kerület nem írhatja és nem is olvashatja a kerület gyülekezeteinek és
 *  egyházmegyéinek az adatait, csak a hivatalosan beküldött adatokat illetve
 *  azoknak az ÖSSZESÍTŐJÉT!"
 *
 * Ezért ez a fájl PONTOSAN három forrásból dolgozik, és csak ebből a háromból:
 *   (1) `diocese_felterjesztes` sorok + a bennük FAGYASZTOTT `snapshot_data` —
 *       ez maga a hivatalosan felküldött irat;
 *   (2) `dioceses` TÖRZSADAT (id, name) — a feladó neve a borítékon, és ami
 *       ennél is fontosabb: ebből derül ki, MELYIK egyházmegye nem terjesztett
 *       fel semmit (lásd lentebb az 1. szabályt);
 *   (3) `szamadasicel` katalógus (kód → név, bevétel/kiadás) — ez országos
 *       törzsadat, nem valakinek az adata; a sorok feliratához kell.
 *
 * ⚠️ A megyék KÖNYVEIBE (diocese_befizetes / diocese_kiadas /
 *    diocese_koltsegvetes / diocese_annual_reports) ez a modul SOHA nem néz
 *    bele. Nem csak azért, mert tilos: azoknak a policy-knak a kerületi ága
 *    2026-08-16-án meg is szűnt, tehát 0 sort adnának — a számok NÉMÁN nullára
 *    jönnének, és a kerület egy „kerek" nullát terjesztene tovább.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️ PGRST201-CSAPDA (bizonyított, 2026-08-16-ban keletkezett)
 * ────────────────────────────────────────────────────────────────────────────
 * Az S3 SQL kompozit FK-t tett a `diocese_felterjesztes`-re, ezért MOST MÁR KÉT
 * idegen kulcs mutat a `dioceses`-re (`diocese_felterjesztes_diocese_id_fkey`
 * ÉS `_dio_district_fkey`). A PostgREST nem tud választani: MINDEN
 * `select('…, dioceses(name)')` beágyazás PGRST201-gyel („more than one
 * relationship was found") leáll — ez 300-as HIBA, nem üres adat.
 * ⇒ Itt SOHA nincs `dioceses` beágyazás a felterjesztés-lekérdezésben: a
 *   megyeneveket KÜLÖN kérdezzük le (`olvasMegyek`), és kódban párosítjuk —
 *   ahogy az S3 fogadó akció is teszi.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A NÉGY SZABÁLY, AMIT AZ ÖSSZESÍTÉS KÖVET (a mag őrzi, ez a fájl kiszolgálja)
 * ────────────────────────────────────────────────────────────────────────────
 *  (1) AMI NINCS FELTERJESZTVE, AZ LÁTHATÓAN HIÁNYZIK. Ezért a magnak a hatókör
 *      TELJES megye-listáját adjuk át (`megyek`), nem a felterjesztésekből
 *      származtatott listát — különben egy „kerek" végösszeg mögött fél kerület
 *      hiánya rejtőzne. EZÉRT fail-closed a megye-lista olvasása: ha az nem
 *      olvasható, NEM számolunk részleges összesítőt.
 *  (2) A VISSZAKÜLDÖTT ('returned') IRAT NEM SZÁMÍT BELE — azt épp a kerület
 *      küldte vissza javításra; ha beleszámolna, a saját maga által kifogásolt
 *      számot összesítené. (A mag szűri, mi minden sort átadunk neki, hogy a
 *      visszaküldötteket NÉVVEL is ki tudja írni.)
 *  (3) A PILLANATKÉPNEK TÖBB ALAKJA LEHET (régi/új kulcsok) — a mag mindet
 *      olvassa; ez a fájl ezért NEM alakítja át a `snapshot_data`-t, nyersen
 *      adja tovább.
 *  (4) A KÖLTSÉGVETÉSNÉL A LEGUTOLSÓ MÓDOSÍTÁS AZ ÉRVÉNYES — ezért kérjük le a
 *      `megyei_koltsegvetes_modositas` sorokat is, a `modification_number`-rel
 *      és a `submitted_at`-tal együtt.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * MIÉRT UTAZIK ITT A `snapshot_data` (a fogadó LISTÁVAL ellentétben)
 * ────────────────────────────────────────────────────────────────────────────
 * A felterjesztés-fogadó lista SZÁNDÉKOSAN nem hozza a pillanatképet
 * (felterjesztes-actions.ts fejléce: MB-ok utaznának feleslegesen). Itt viszont
 * az összesítés MAGA a pillanatképek összeadása, tehát muszáj. Ezért szűkítjük,
 * amennyire lehet: EGY évre, CSAK a négy összesítendő típusra, darabolt
 * `.in()`-nel és lapozva — és a pillanatkép NEM hagyja el a szervert: a
 * böngészőnek már csak a kiszámolt összesítő megy át.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HATÓKÖR — FAIL-CLOSED
 * ────────────────────────────────────────────────────────────────────────────
 * A belépő-kapu `canReadDistrictScope` (az egyházkerületi SZÁMVEVŐ is bejut,
 * ellenőri nézetben), a szűrés pedig KIZÁRÓLAG a szerep-szűrt
 * `resolveDistrictReadScopeIds` (az RLS `current_user_district_olvaso_ids()`
 * tükre). Üres hatókör → ÜRES eredmény beszédes magyarázattal, SOHA nem
 * szűretlen lekérdezés.
 *
 * ⚠️ TÖBB feloldott kerületnél az elsőt vesszük — de NEM NÉMÁN: ilyenkor
 *    `scopeNotice` megy a felületre. A felterjesztés-archívum ugyanannak a
 *    felhasználónak MIND a kerületét mutatja; magyarázat nélkül a két lap
 *    terjedelme némán széthúzna (2026-08-17-i ellenőrzés találata).
 *
 * ⚠️ NINCS „minden egyházkerület" rendszergazdai ág — a megyei párral azonos
 *    okból: az összesítő EGY egyházkerület hivatalos irata. Egy országos összeg
 *    félrevezető nyomtatvány lenne, hiszen nincs olyan szint, amelyik ezt
 *    felterjesztené (Endre K3 döntése: NINCS 4. szint).
 *
 * ⚠️ A VÉGLEGESÍTÉS / FELKÜLDÉS NEM RÉSZE ENNEK A SZELETNEK. K3 szerint nincs
 *    hová felküldeni; a zárolás (véglegesítés) későbbi szelet. Ezért ez a modul
 *    KIZÁRÓLAG OLVAS — egyetlen írás sincs benne.
 */

import { selectAllPaged } from '@kartoteka/supabase-client'

import { getEffectiveAccessContext, type EffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canReadDistrictScope,
  canWriteDistrictScope,
  describeDistrictWriteBlock,
  resolveDistrictReadScopeIds,
} from '@/lib/auth/level-scope'
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'
import { isMissingColumnError } from '@/lib/utils/schema-errors'
// A SZÁMÍTÁS tiszta, import-mentes magja — a megyei `osszesito-core.ts` kerületi
// párja. Ez a fájl KIZÁRÓLAG a bemenetet állítja össze és meghívja: két külön
// helyen élő számítás előbb-utóbb széthúzna (bizonyított hibaosztály).
import { szamitKeruletiOsszesito } from '@/lib/district/osszesito-core'
// A kerület törzsadata (püspök, adminisztrátor, számvevő) az ALÁÍRÁS-rovathoz.
// A MEGLÉVŐ akciót hívjuk — a jogosultság-kapu így egyetlen helyen él.
import { getDistrict } from './district-actions'

type Supa = EffectiveAccessContext['supabase']

// ---------------------------------------------------------------------------
// A MAG SZERZŐDÉSE — típusokat a FÜGGVÉNYBŐL vezetjük le, nem névvel importálva
//
// MIÉRT: így egyetlen névre (`szamitKeruletiOsszesito`) csatlakozunk. Ha a mag
// mezőnevei mást mondanak, a fordító PONTOSAN a hibás mezőre mutat, nem egy
// hiányzó típus-importra — és a javítás egy helyen (itt) elvégezhető.
// ---------------------------------------------------------------------------
type KeruletiOsszesitoBemenet = Parameters<typeof szamitKeruletiOsszesito>[0]
type KeruletiOsszesito = ReturnType<typeof szamitKeruletiOsszesito>
type BemenetMegye = KeruletiOsszesitoBemenet['megyek'][number]
type BemenetFelterjesztes = KeruletiOsszesitoBemenet['felterjesztesek'][number]
type BemenetKodTetel = KeruletiOsszesitoBemenet['kodKatalogus'][number]

/**
 * A nyomtatvány ALÁÍRÁS-rovatának nevei a `districts` törzsadatból.
 *
 * MIÉRT KÜLÖN CSOMAG (és nem a teljes `DistrictRecord`): a nyomtatványnak
 * ennyi kell. A törzsadat többi mezője (bank, belső megjegyzés, adószám) nem
 * tartozik az összesítőre — a `getDistrict` oszlop-szűkítésének a szellemét
 * követjük: ami nem indokolt, az ne is utazzon a böngészőbe.
 */
interface KeruletiAlairok {
  puspokNev: string | null
  /** A püspök TISZTSÉG-szövege (pl. „püspök") — a rovat alá kerül. */
  puspokCim: string | null
  adminisztratorNev: string | null
  /** Nem minden kerületnél van kiosztott számvevő — ezért lehet null. */
  szamvevoNev: string | null
}

/**
 * A kerületi összesítő oldal EGYETLEN adatcsomagja.
 *
 * FAIL-CLOSED: hibánál `{ error }` és NINCS részleges összeg — egy fél
 * adatból számolt „kerek" végösszeg rosszabb, mint a nyílt hiba.
 */
interface KeruletiOsszesitoOldalAdat {
  osszesito?: KeruletiOsszesito
  /** Mely években van egyáltalán felterjesztés (év-választóhoz), csökkenő sorrend. */
  evek?: number[]
  /** Írhat-e a néző. Itt CSAK feliratra való: ez a szelet nem ír semmit. */
  canWrite?: boolean
  /** Miért nem írhat — beszédes magyar magyarázat (ellenőri nézet). */
  readOnlyReason?: string | null
  /** Az egyházkerület hivatalos (magyar) neve a nyomtatvány fejlécéhez. */
  districtNev?: string | null
  /** A hivatalos ROMÁN név — a kétnyelvű fejléchez. */
  districtNevRo?: string | null
  /** Az aláírás-rovat nevei (püspök, adminisztrátor, számvevő). */
  alairok?: KeruletiAlairok
  /**
   * A kerületi TÖRZSADAT betöltésének hibája. A SZÁMOK ilyenkor is látszanak —
   * csak az aláírás-rovat marad üres, és ezt kimondjuk. (Fordítva viszont NEM:
   * hiányos adatból nem számolunk összesítőt.)
   */
  torzsadatHiba?: string
  /**
   * A SZÁMADÁSI CÉL KATALÓGUS betöltésének hibája.
   *
   * ⚠️ TÜNET, AMI EZT A MEZŐT SZÜLTE (2026-08-17-i ellenőrzés): a katalógus
   * olvasása fail-soft (a hiba csak `console.error`-ba ment), és a kód azt
   * ígérte, hogy „a számok attól még helyesek". Ez a SZÁMADÁSRA igaz — a
   * KÖLTSÉGVETÉSRE viszont NEM: ott a bevétel/kiadás besorolás KIZÁRÓLAG a
   * katalógusból származik (a pillanatkép nem tárolja), tehát üres katalógusnál
   * MINDEN terv-sor a bevétel-oldalra kerül: `osszKiadas = 0`, az egyenleg pedig
   * a teljes terv. A felhasználó erről semmit nem tudott meg, és így egy
   * ALÁÍRHATÓ, KINYOMTATHATÓ hivatalos ív született nyilvánvalóan hamis
   * megosztással. Ezért utazik a hiba a felületre — és ezért írja ki a lap a
   * PAPÍRRA IS. Ne „egyszerűsítsd" vissza néma `console.error`-rá.
   */
  katalogusHiba?: string
  /**
   * HATÓKÖR-FELIRAT: ha a nézőnek TÖBB egyházkerület-hatóköre van, az összesítő
   * csak az elsőként feloldottról szól.
   *
   * ⚠️ TÜNET: ugyanezen a szeleten a felterjesztés-ARCHÍVUM MIND a kerületet
   * mutatja, az összesítő viszont `resolveDistrictReadScopeIds(access)[0]`-ra
   * szűkít. Ugyanaz a felhasználó tehát két lapon MÁS terjedelmet látott,
   * magyarázat nélkül. A szűkítés maga rendben van (az összesítő EGY kerület
   * hivatalos irata) — csak nem lehet NÉMA. Minta: a megyei/kerületi
   * lista-akciók `scopeNotice` mezője.
   */
  scopeNotice?: string | null
  /** Fail-closed hibaüzenet (nincs hatókör / a lekérdezés nem olvasható). */
  error?: string
}

/** Az .in() lista darabolása — a PostgREST URL-hossz plafonja miatt. */
const IN_CHUNK = 120

/**
 * Az összesítőbe bevont felterjesztés-típusok — mind a NÉGY.
 *
 * ⚠️ A `szamvevoi_osszesito` SZÁNDÉKOSAN benne van, pedig az maga is egy
 * összesítő: éppen ez a kerület egyetlen törvényes útja ahhoz, hogy a
 * GYÜLEKEZETI szint számait lássa. K4 szerint a kerület a gyülekezetek adatait
 * nem olvashatja — az egyházmegye által felterjesztett, fagyasztott összesítőt
 * viszont igen, mert az hivatalosan beküldött irat.
 */
const OSSZESITO_TIPUSOK = [
  'megyei_szamadas',
  'megyei_koltsegvetes',
  'megyei_koltsegvetes_modositas',
  'szamvevoi_osszesito',
]

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * A kerület egyházmegyéinek TELJES listája (törzsadat) — az 1. szabály hordozója.
 *
 * FAIL-CLOSED, és itt ez nem formalitás: ha a lista hiányos, a hiányzó megye
 * nem „hiányzóként", hanem SEHOGY nem jelenne meg, és a végösszeg teljesnek
 * látszana. Ezért hibánál nem számolunk összesítőt.
 */
async function olvasMegyek(
  supabase: Supa,
  districtId: string,
): Promise<{ megyek: BemenetMegye[]; error?: string }> {
  const q = supabase.from('dioceses').select('id, name').eq('district_id', districtId).order('name')
  const { data, error } = await selectAllPaged<Record<string, unknown>>(q)
  if (error) {
    return {
      megyek: [],
      error:
        'Az egyházmegyék listája most nem tölthető be, ezért az összesítőt nem számoltuk ki — ' +
        'hiányos listából rossz végösszeg születne, és elrejtené, melyik egyházmegye nem ' +
        'terjesztett fel semmit. Próbáld újra néhány perc múlva.',
    }
  }
  return {
    megyek: data.map((r) => ({
      id: String(r.id),
      // A duplázás-védő formázó: a `dioceses.name` a seedben már tartalmazhatja
      // a „Református Egyházmegye" toldatot — sablonból hozzáfűzve
      // „…Egyházmegye Református Egyházmegye" lenne a hivatalos iraton.
      nev: formatEgyhazmegyeNev((r as { name?: string | null }).name) || 'Ismeretlen egyházmegye',
    })),
  }
}

/**
 * Az adott ÉV felterjesztései a kerület megyéitől — PILLANATKÉPPEL együtt.
 *
 * ⚠️ NINCS `dioceses` beágyazás (PGRST201 — lásd a fájl fejlécét).
 *
 * KÉT szűrő egyszerre, szándékosan:
 *   · `district_id` — ez az, amire az RLS is épül;
 *   · `diocese_id IN (…)` — a TELJESSÉGI kép konzisztenciája miatt. Ha egy
 *     egyházmegyét időközben átsoroltak másik kerületbe, a régi sora megőrizte
 *     az akkori `district_id`-t; enélkül olyan megye összege is beleszámolna,
 *     amelyik a mostani megye-listában (és így a „ki hiányzik" felsorolásban)
 *     nem szerepel — vagyis az összeg és a névsor széthúzna.
 */
async function olvasFelterjesztesek(
  supabase: Supa,
  districtId: string,
  dioceseIds: string[],
  ev: number,
): Promise<{ felterjesztesek: BemenetFelterjesztes[]; error?: string }> {
  const felterjesztesek: BemenetFelterjesztes[] = []
  for (const ids of chunk(dioceseIds, IN_CHUNK)) {
    if (ids.length === 0) continue
    const q = supabase
      .from('diocese_felterjesztes')
      .select('id, diocese_id, doc_type, modification_number, status, submitted_at, snapshot_data')
      .eq('district_id', districtId)
      .in('diocese_id', ids)
      .eq('year', ev)
      .in('doc_type', OSSZESITO_TIPUSOK)
    const { data, error } = await selectAllPaged<Record<string, unknown>>(q)
    if (error) {
      if (isMissingColumnError(error.message)) {
        return {
          felterjesztesek: [],
          error:
            'A felterjesztések nyilvántartó táblája vagy oszlopa még hiányzik az adatbázisból, ' +
            'ezért az összesítőt nem számoltuk ki. Futtasd le a ' +
            '2026-08-15-egyhazmegyei-uj-tablak.sql és a ' +
            '2026-08-15-egyhazmegyei-felterjesztes-modositas.sql fájlt, majd próbáld újra.',
        }
      }
      return {
        felterjesztesek: [],
        error:
          'A felterjesztett iratok most nem olvashatók, ezért az összesítőt nem számoltuk ki — ' +
          'egy hiányos lista rossz végösszeget adna. Próbáld újra néhány perc múlva ' +
          `(részlet: ${error.message}).`,
      }
    }
    for (const r of data) {
      felterjesztesek.push({
        dioceseId: String(r.diocese_id),
        docType: String(r.doc_type),
        // VÉDŐHÁLÓ: az évre az adatbázisban is szűrünk, de átadjuk a magnak is —
        // ő újra ellenőrzi. Egy több évet hozó (átalakított vagy hibás) bemenet
        // SOHA ne keverhessen két év adatát egyetlen hivatalos összesítőbe.
        year: ev,
        modificationNumber: r.modification_number == null ? null : Number(r.modification_number),
        status: String(r.status ?? ''),
        submittedAt: (r.submitted_at as string | null) ?? null,
        // NYERSEN adjuk tovább: a pillanatképnek több ismert alakja van
        // (3. szabály), és mindet a mag olvassa — itt nem alakítunk rajta.
        snapshot: (r.snapshot_data as Record<string, unknown> | null) ?? null,
      })
    }
  }
  return { felterjesztesek }
}

/**
 * A számadási célok katalógusa (kód → név, bevétel/kiadás, sorrend).
 *
 * FAIL-SOFT, DE NEM NÉMA — és pontosan ez a különbség, amit egy korábbi
 * változat elmulasztott.
 *
 * ⚠️ A JAVÍTOTT TÜNET (2026-08-17): a régi komment azt ígérte, hogy katalógus
 * nélkül „az összesítő SZÁMAI attól még helyesek". A SZÁMADÁSNÁL igaz: ott a
 * bevétel/kiadás bontás a PILLANATKÉPBŐL jön, a katalógus csak a sor NEVÉT és a
 * sorrendet adja. A KÖLTSÉGVETÉSNÉL viszont HAMIS: ott a besorolás KIZÁRÓLAG a
 * katalógus `type` oszlopából származik (lásd `osszesito-core.ts`,
 * `kat?.tipus === 'K' ? kiadás : bevétel`), tehát ÜRES katalógusnál minden
 * terv-sor a bevétel-oldalra esik — összes kiadás 0, egyenleg = a teljes terv.
 * Az akkori kód ezt csak `console.error`-ba írta, így a felhasználó egy
 * nyilvánvalóan hamis megosztású, mégis aláírható hivatalos ívet kapott.
 * ⇒ A hibát MOST VISSZAADJUK a hívónak (`hiba`), az pedig kiírja a képernyőre
 *   ÉS a papírra. A `console.error` marad, de már nem az egyetlen jelzés.
 *
 * LAPOZVA: a katalógus több száz soros, és a PostgREST 1000 soros plafonja
 * némán csonkolna — pont a ritka kódok neve veszne el.
 */
async function olvasKodKatalogus(
  supabase: Supa,
): Promise<{ katalogus: BemenetKodTetel[]; hiba?: string }> {
  const { data, error } = await selectAllPaged<Record<string, unknown>>(
    supabase.from('szamadasicel').select('id, nev, type, sorszam'),
  )
  if (error) {
    console.error('[kerulet/osszesito] a számadási cél katalógus nem olvasható:', error.message)
    return {
      katalogus: [],
      hiba:
        'A számadási célok katalógusa (kód → megnevezés, bevétel/kiadás) most nem olvasható. ' +
        'Emiatt a KÖLTSÉGVETÉS bevétel/kiadás bontása NEM MEGBÍZHATÓ: a terv-sorok besorolása ' +
        'kizárólag ebből a katalógusból származik, ezért katalógus nélkül minden terv-sor a ' +
        'bevétel-oldalra kerül — az „Összes kiadás" 0-nak, az egyenleg pedig a teljes tervnek ' +
        'látszik. A számadás összegei és a sorok kódjai helyesek, csak a megnevezésük hiányzik. ' +
        '⚠️ Ezt a lapot ilyen állapotban NE írd alá és ne terjeszd tovább: tölts újra néhány perc ' +
        'múlva, és ha a jelzés marad, szólj a rendszergazdának ' +
        `(részlet: ${error.message}).`,
    }
  }
  return {
    katalogus: data.map((r) => ({
      kod: String(r.id),
      nev: (r.nev as string | null) ?? null,
      tipus: r.type === 'B' ? 'B' : r.type === 'K' ? 'K' : null,
      sorszam: r.sorszam == null ? null : Number(r.sorszam),
    })),
  }
}

/**
 * Mely években van egyáltalán felterjesztés a kerületben (év-választóhoz).
 *
 * Csak a `year` oszlopot olvassuk, ezért olcsó. Hibánál üres lista + HANGOS
 * szerver-napló: az év-chipek hiánya nem indokolja az összesítő megtagadását.
 * Az aktuális és az előző évet mindig hozzávesszük, hogy a választó ne legyen
 * üres egy még beküldés nélküli évben.
 */
async function olvasEvek(supabase: Supa, districtId: string): Promise<number[]> {
  const evek = new Set<number>()
  const q = supabase.from('diocese_felterjesztes').select('id, year').eq('district_id', districtId)
  const { data, error } = await selectAllPaged<{ year: number | null }>(q)
  if (error) {
    console.error('[kerulet/osszesito] az év-lista olvasása hibára futott:', error.message)
  } else {
    for (const r of data) {
      if (typeof r.year === 'number' && Number.isFinite(r.year)) evek.add(r.year)
    }
  }
  const most = new Date().getFullYear()
  evek.add(most)
  evek.add(most - 1)
  return [...evek].sort((a, b) => b - a)
}

/**
 * Az adott évi EGYHÁZKERÜLETI ÖSSZESÍTŐ — a felület egyetlen adatcsomagja.
 *
 * @param ev a beszámolási év. Az oldal a beszámolási SZEZON évét adja
 *   alapértelmezésnek (`documentSeasonYear`), mert január–márciusban még az
 *   ELŐZŐ év iratai érkeznek — naptári évre szegezve ilyenkor üres képet
 *   mutatnánk, amiből a kerület arra következtetne, hogy senki nem küldött fel
 *   semmit.
 */
export async function getKeruletiOsszesito(ev: number): Promise<KeruletiOsszesitoOldalAdat> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  // OLVASÓ kapu — az egyházkerületi SZÁMVEVŐ (ellenőr) is átmegy rajta.
  if (!canReadDistrictScope(access)) {
    return { error: 'Nincs jogosultságod az egyházkerületi összesítőhöz.' }
  }

  // FAIL-CLOSED hatókör: KIZÁRÓLAG a szerep-szűrt olvasási feloldó. A tág
  // (megjelenítési) feloldó és a `profiles.district_id` skalár itt SZÁNDÉKOSAN
  // nem szerepel: egy elavult skalár más kerület hivatalos iratait összegezné.
  const keruletIds = resolveDistrictReadScopeIds(access)
  const districtId = keruletIds[0] ?? null
  if (!districtId) {
    return {
      error:
        'Nincs feloldható egyházkerület-hatóköröd, ezért az összesítőt nem tudjuk kiszámolni. ' +
        'Az összesítő EGY egyházkerület hivatalos irata — országos, kerületeken átnyúló összeg ' +
        'szándékosan nem készül, mert olyan hivatalos irat nem létezik. Kérd a rendszergazdát, ' +
        'hogy rendelje a szerepkörödhöz a megfelelő egyházkerületet.',
    }
  }

  // Csak FELIRATRA: ez a szelet nem ír semmit (a véglegesítés későbbi szelet),
  // de az ellenőr ELŐRE lássa, milyen nézetben van.
  const canWrite = canWriteDistrictScope(access, districtId)
  const readOnlyReason = canWrite ? null : describeDistrictWriteBlock(access, districtId)

  /**
   * TÖBB KERÜLETI HATÓKÖR — a szűkítés SOHA ne legyen néma.
   *
   * A szűkítés maga SZÁNDÉKOS (az összesítő EGY egyházkerület hivatalos irata,
   * országos összeg nem létező nyomtatvány lenne), de a felterjesztés-archívum
   * ugyanennek a felhasználónak MIND a kerületét mutatja. Magyarázat nélkül a
   * két lap terjedelme némán széthúzna — ezt mondjuk ki. A kerület NEVÉT csak a
   * törzsadat betöltése után ismerjük, ezért kapja paraméterben.
   */
  const scopeNoticeSzoveg = (keruletNev: string | null): string | null => {
    if (keruletIds.length <= 1) return null
    return (
      `Több egyházkerület-hatóköröd van (${keruletIds.length}); ez az összesítő közülük ` +
      `kizárólag a(z) ${keruletNev || 'elsőként feloldott egyházkerület'} adatait tartalmazza. ` +
      'Az összesítő EGY egyházkerület hivatalos irata, ezért kerületeken átnyúló összeget ' +
      'szándékosan nem készítünk — a felterjesztések archívuma ezzel szemben mind a ' +
      'hatóköröd kerületét mutatja, ezért tér el a két lap terjedelme.'
    )
  }

  // 1. lépés: a TELJES megye-lista. Ha ez nincs meg, nincs mihez mérni a
  //    beérkezett iratokat — tehát nincs összesítő sem (1. szabály).
  const { megyek, error: megyeHiba } = await olvasMegyek(access.supabase, districtId)
  if (megyeHiba) {
    return { canWrite, readOnlyReason, scopeNotice: scopeNoticeSzoveg(null), error: megyeHiba }
  }

  const megyeIds = megyek.map((m) => m.id)
  const [felt, kat, evek, torzs] = await Promise.all([
    olvasFelterjesztesek(access.supabase, districtId, megyeIds, ev),
    olvasKodKatalogus(access.supabase),
    olvasEvek(access.supabase, districtId),
    getDistrict(districtId),
  ])
  if (felt.error) {
    return {
      canWrite,
      readOnlyReason,
      evek,
      scopeNotice: scopeNoticeSzoveg(torzs.data?.name || null),
      error: felt.error,
    }
  }

  const osszesito = szamitKeruletiOsszesito({
    ev,
    megyek,
    felterjesztesek: felt.felterjesztesek,
    kodKatalogus: kat.katalogus,
  })

  const torzsadat = torzs.data ?? null
  return {
    osszesito,
    evek,
    canWrite,
    readOnlyReason,
    scopeNotice: scopeNoticeSzoveg(torzsadat?.name || null),
    // A katalógus hiánya NEM állítja meg az összesítőt, de a KÖLTSÉGVETÉS
    // bontását megbízhatatlanná teszi — a lap ezt a képernyőn ÉS a papíron
    // kiírja (lásd a mező docblockját).
    katalogusHiba: kat.hiba,
    districtNev: torzsadat?.name || null,
    districtNevRo: torzsadat?.nev_ro || null,
    alairok: {
      puspokNev: torzsadat?.puspok_nev || null,
      puspokCim: torzsadat?.puspok_cim || null,
      adminisztratorNev: torzsadat?.adminisztrator_nev || null,
      szamvevoNev: torzsadat?.szamvevo_nev || null,
    },
    // A törzsadat hiánya NEM állítja meg az összesítőt (a számok megvannak),
    // de nem is hallgatjuk el: aláírás-rovat nélkül a nyomtatvány hiányos.
    torzsadatHiba: torzsadat
      ? undefined
      : 'Az egyházkerület törzsadata (hivatalos név, püspök, adminisztrátor, számvevő) most nem ' +
        'olvasható, ezért a nyomtatvány fejléce és aláírás-rovata üresen marad. Az összesítő ' +
        'számai ettől függetlenül helyesek. Ha ez tartósan így marad, töltsd ki az ' +
        '„Egyházkerületünk" adatlapot, vagy jelezd a rendszergazdának' +
        (torzs.error ? ` (részlet: ${torzs.error})` : '') +
        '.',
  }
}
