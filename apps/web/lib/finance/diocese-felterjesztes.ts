/**
 * Egyházmegyei FELTERJESZTÉS (megye → egyházkerület) — KÖZÖS adatréteg.
 *
 * MIÉRT (egyházmegyei terv, 3.6 + Endre 3. döntése): az egyházmegyénél
 * UGYANAZ a véglegesítés-gomb minta él, mint a gyülekezeteknél, csak a
 * beküldés célja EGGYEL FELJEBB van: az egyházkerület. A 3. szint (kerületi
 * belépés, fogadó felület) KÜLÖN körben épül — de a véglegesítés és a
 * „pecsét" (mikor, ki, milyen tartalommal terjesztette fel) MÁR MOST rögzül,
 * hogy amikor a kerületi oldal elkészül, ne kelljen visszamenőleg papírokból
 * pótolni.
 *
 * MI VOLT A HIBA ENÉLKÜL: a megyei Költségvetés fülön a „Véglegesítés és
 * beküldés" gomb a GYÜLEKEZETI beküldőt hívta (`submitDocument` →
 * `document_submissions`), ami megyei profilban „Nincs aktív gyülekezet."
 * hibával állt meg. A megye tehát lezárta az évet, a felküldésről pedig egy
 * érthetetlen, zsargonos üzenetet kapott — és sehol nem maradt nyoma annak,
 * hogy az irat elkészült.
 *
 * FAIL-CLOSED: ha a megyéhez nincs egyházkerület rendelve, a felterjesztés
 * HANGOSAN megáll (nem írunk „valamelyik" kerülethez tartozó sort). Ha a
 * tábla/oszlop még hiányzik (a migráció nem futott le), magyar üzenet mondja
 * meg, melyik SQL-fájlt kell lefuttatni — nem nyers PostgREST-hiba.
 *
 * Adatbázis: `diocese_felterjesztes` (2026-08-15-egyhazmegyei-uj-tablak.sql
 * 1/C szakasz) + a költségvetés-módosítás bővítés
 * (2026-08-15-egyhazmegyei-felterjesztes-modositas.sql).
 */

import type { createClient } from '@/lib/supabase/server'
import { isMissingColumnError } from '@/lib/utils/schema-errors'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** A megye által felterjeszthető iratok (a tábla doc_type CHECK-jével azonos). */
export type DioceseFelterjesztesTipus =
  | 'megyei_szamadas'
  | 'megyei_koltsegvetes'
  | 'megyei_koltsegvetes_modositas'
  | 'szamvevoi_osszesito'

/** Lelkész-barát megnevezések — a felület minden feliratához innen. */
export const FELTERJESZTES_LABELS: Record<DioceseFelterjesztesTipus, string> = {
  megyei_szamadas: 'Egyházmegyei számadás',
  megyei_koltsegvetes: 'Egyházmegyei költségvetés',
  megyei_koltsegvetes_modositas: 'Egyházmegyei költségvetés-módosítás',
  szamvevoi_osszesito: 'Számvevői összesítő',
}

export interface DioceseFelterjesztesSor {
  docType: DioceseFelterjesztesTipus
  /** Költségvetés-módosításnál 1–3, egyébként 0 (a tábla is 0-t tárol). */
  modificationNumber: number
  year: number
  status: 'draft' | 'submitted' | 'received' | 'returned'
  submittedAt: string | null
  iktatoszam: string | null
  returnedReason: string | null
}

/**
 * A hiányzó tábla/oszlop egységes, cselekvésre váltható magyar üzenete.
 * (A „migration-fájl nem bizonyíték" tanulság: a repóban meglévő SQL nem
 * jelenti, hogy az éles adatbázisban le is futott.)
 */
function migracioHianyzikUzenet(muvelet: string): string {
  return (
    `${muvelet} nem sikerült: a felküldés nyilvántartásához szükséges adatbázis-tábla ` +
    'vagy oszlop még hiányzik. Futtasd le a 2026-08-15-egyhazmegyei-uj-tablak.sql és a ' +
    '2026-08-15-egyhazmegyei-felterjesztes-modositas.sql fájlt, majd próbáld újra. ' +
    'A véglegesítés maga megtörtént — a felküldést utána a Pénzügy → Számadás fülön, ' +
    'a „Felküldés az egyházkerületnek" kártyán lehet pótolni.'
  )
}

/**
 * A megye egyházkerületének feloldása — fail-closed.
 * @returns `{ districtId }` vagy `{ error }` magyar üzenettel.
 */
async function resolveDistrictId(
  supabase: SupabaseServerClient,
  dioceseId: string,
): Promise<{ districtId: string } | { error: string }> {
  const { data, error } = await supabase
    .from('dioceses')
    .select('district_id')
    .eq('id', dioceseId)
    .maybeSingle()
  if (error) {
    return {
      error:
        'Az egyházmegye egyházkerületi besorolása most nem ellenőrizhető, ezért a felküldést ' +
        'biztonsági okból nem rögzítettük. Próbáld újra néhány perc múlva.',
    }
  }
  const districtId = (data as { district_id?: string | null } | null)?.district_id || null
  if (!districtId) {
    return {
      error:
        'Az egyházmegyéhez nincs egyházkerület rendelve, ezért a felküldés rossz helyre kötne ki. ' +
        'Az „Egyházmegye beállításai" ablakban add meg az egyházkerületet (vagy kérd a ' +
        'rendszergazdát), majd próbáld újra.',
    }
  }
  return { districtId }
}

export interface RogzitFelterjesztesParams {
  dioceseId: string
  userId: string
  docType: DioceseFelterjesztesTipus
  year: number
  /** 1–3 a költségvetés-módosításnál; minden más iratnál null/0. */
  modificationNumber?: number | null
  /** A felküldéskor FAGYASZTOTT pillanatkép (ugyanaz, amit a megye lezárt). */
  snapshot: Record<string, unknown>
  /** A megyei iktatószám szöveges pillanatképe, ha már van iktató-bejegyzés. */
  iktatoszam?: string | null
}

/**
 * Felterjesztés rögzítése (idempotens upsert): egy megye egy évben
 * irat-típusonként (és módosítás-számonként) EGY felterjesztést vezet — az
 * ismételt véglegesítés/újrapróbálkozás ugyanazt a sort frissíti, nem gyárt
 * duplikátumot.
 */
export async function rogzitDioceseFelterjesztes(
  supabase: SupabaseServerClient,
  params: RogzitFelterjesztesParams,
): Promise<{ success?: true; error?: string }> {
  const dist = await resolveDistrictId(supabase, params.dioceseId)
  if ('error' in dist) return { error: dist.error }

  const most = new Date().toISOString()
  const { error } = await supabase.from('diocese_felterjesztes').upsert(
    {
      diocese_id: params.dioceseId,
      district_id: dist.districtId,
      doc_type: params.docType,
      year: params.year,
      modification_number: params.modificationNumber ?? 0,
      status: 'submitted',
      snapshot_data: params.snapshot,
      iktatoszam: params.iktatoszam ?? null,
      submitted_at: most,
      submitted_by: params.userId,
      // A visszaküldés indoklása az ÚJ felküldéskor törlődik — különben egy
      // rég orvosolt kifogás ragadna a friss iraton.
      returned_reason: null,
    },
    { onConflict: 'diocese_id,doc_type,year,modification_number' },
  )

  if (error) {
    if (isMissingColumnError(error.message)) {
      return { error: migracioHianyzikUzenet('A felküldés rögzítése') }
    }
    return {
      error:
        'A felküldés rögzítése nem sikerült. Próbáld újra néhány perc múlva; ha újra hibázik, ' +
        `jelezd a rendszergazdának (részlet: ${error.message}).`,
    }
  }
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// SZÁMVEVŐI ÖSSZESÍTŐ — állapot + feloldás (2026-08-15, terv 3.5–3.6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Az összesítő felküldés-állapota — a KÖZÖS véglegesítés-gomb bemenete.
 *
 * MIÉRT KÜLÖN OLVASÓ a `olvasDioceseFelterjesztesek` mellett: az összesítő
 * felületének a feloldás-kérés állapotára is szüksége van, azok az oszlopok
 * viszont ÚJAK (2026-08-15-egyhazmegyei-osszesito-feloldas.sql). Ha ezt a
 * kiegészítő oszlop-listát a KÖZÖS olvasóba tettük volna, a Pénzügy már élő
 * „Felküldés az egyházkerületnek" kártyája HIBÁRA futna minden olyan
 * adatbázisban, ahol az új SQL még nem futott le — vagyis egy új funkció
 * elrontana egy működőt. Ezért itt külön, és séma-drift esetén FAIL-SOFT: az
 * összesítő látszik, csak a feloldás útja mondja meg, melyik SQL hiányzik.
 */
export interface OsszesitoFelkuldesAllapot {
  /** Van-e egyáltalán felterjesztés-sor erre az évre. */
  letezik: boolean
  status: DioceseFelterjesztesSor['status']
  submittedAt: string | null
  receivedAt: string | null
  unlockRequested: boolean
  unlockReason: string | null
  /** Ha az egyházkerület visszaküldte: MIÉRT (a megye ebből tud javítani). */
  returnedReason: string | null
  /** true = a feloldás-oszlopok még hiányoznak (a migráció nem futott le). */
  feloldasOszlopokHianyoznak: boolean
}

const OSSZESITO_ALAP_OSZLOPOK = 'status, submitted_at, received_at, returned_reason, notes'
const OSSZESITO_FELOLDAS_OSZLOPOK = 'unlock_requested, unlock_reason'

/**
 * Az adott évi számvevői összesítő felküldés-állapota. FAIL-CLOSED: hibánál
 * `{ error }` — soha nem ad „nincs felküldve" képet egy elnyelt hibából (az
 * arra bírná az esperest, hogy másodszor is felküldje, ami már fent van).
 */
export async function olvasOsszesitoAllapot(
  supabase: SupabaseServerClient,
  dioceseId: string,
  year: number,
): Promise<{ allapot?: OsszesitoFelkuldesAllapot; error?: string }> {
  const alap = (sor: Record<string, unknown> | null, hianyzoOszlopok: boolean): OsszesitoFelkuldesAllapot => ({
    letezik: !!sor,
    status: ((sor?.status as DioceseFelterjesztesSor['status']) ?? 'draft'),
    submittedAt: (sor?.submitted_at as string | null) ?? null,
    receivedAt: (sor?.received_at as string | null) ?? null,
    unlockRequested: sor?.unlock_requested === true,
    unlockReason: (sor?.unlock_reason as string | null) ?? null,
    returnedReason: (sor?.returned_reason as string | null) ?? null,
    feloldasOszlopokHianyoznak: hianyzoOszlopok,
  })

  const teljes = await supabase
    .from('diocese_felterjesztes')
    .select(`${OSSZESITO_ALAP_OSZLOPOK}, ${OSSZESITO_FELOLDAS_OSZLOPOK}`)
    .eq('diocese_id', dioceseId)
    .eq('doc_type', 'szamvevoi_osszesito')
    .eq('year', year)
    .maybeSingle()
  if (!teljes.error) {
    return { allapot: alap(teljes.data as Record<string, unknown> | null, false) }
  }

  // Séma-drift: a feloldás-oszlopok még nincsenek meg → az összesítő attól
  // még használható, csak a feloldás útja nem. Újrapróbálás az alap-oszlopokkal.
  if (isMissingColumnError(teljes.error.message)) {
    const alapLekerdezes = await supabase
      .from('diocese_felterjesztes')
      .select(OSSZESITO_ALAP_OSZLOPOK)
      .eq('diocese_id', dioceseId)
      .eq('doc_type', 'szamvevoi_osszesito')
      .eq('year', year)
      .maybeSingle()
    if (alapLekerdezes.error) {
      if (isMissingColumnError(alapLekerdezes.error.message)) {
        return {
          error:
            'Az összesítő felküldés-állapota nem olvasható: a nyilvántartó tábla még hiányzik az ' +
            'adatbázisból. Futtasd le a 2026-08-15-egyhazmegyei-uj-tablak.sql fájlt.',
        }
      }
      return {
        error: `Az összesítő felküldés-állapotát nem sikerült betölteni (részlet: ${alapLekerdezes.error.message}).`,
      }
    }
    return { allapot: alap(alapLekerdezes.data as Record<string, unknown> | null, true) }
  }

  return {
    error: `Az összesítő felküldés-állapotát nem sikerült betölteni (részlet: ${teljes.error.message}).`,
  }
}

/** Időbélyeges sor hozzáfűzése a felterjesztés naplójához (soha nem felülírás). */
function naploSor(elozo: string | null | undefined, szoveg: string): string {
  const belyeg = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const uj = `[${belyeg}] ${szoveg}`
  const alap = (elozo || '').trim()
  return alap ? `${alap}\n${uj}` : uj
}

/**
 * Feloldás-kérés a felküldött összesítőre — a KÖZÖS véglegesítés-gomb
 * „Feloldás kérése" útja.
 *
 * KÉT ÁG, MERT A VALÓSÁG IS KÉT ÁGÚ:
 *  (a) Az egyházkerület MÉG NEM VETTE ÁT (status='submitted') → a felküldést
 *      VISSZAVONJUK (status='draft'), és a napló megőrzi, mikor és miért. Ez
 *      a való életbeli „még nem vették ki a postaládából" eset; ha itt csak
 *      kérelmet rögzítenénk, az esperes zsákutcába kerülne, mert a kerületi
 *      fogadó felület MÉG NEM ÉPÜLT MEG (a 3. szint külön köre).
 *  (b) Az egyházkerület MÁR ÁTVETTE (status='received') → a kérés RÖGZÜL
 *      (unlock_requested), és a kerület bírálja el. Itt a visszavonás
 *      hazugság lenne: a felküldött irat már a felettes szint kezében van.
 */
export async function keresOsszesitoFeloldas(
  supabase: SupabaseServerClient,
  params: { dioceseId: string; userId: string; year: number; indoklas: string },
): Promise<{ visszavonva?: true; rogzitve?: true; error?: string }> {
  const { data, error } = await supabase
    .from('diocese_felterjesztes')
    .select('id, status, submitted_at, notes')
    .eq('diocese_id', params.dioceseId)
    .eq('doc_type', 'szamvevoi_osszesito')
    .eq('year', params.year)
    .maybeSingle()
  if (error) {
    return {
      error:
        'A felküldött összesítő állapota most nem olvasható, ezért a feloldást biztonsági okból ' +
        'nem indítottuk el. Próbáld újra néhány perc múlva.',
    }
  }
  const sor = data as { id: string; status: string; submitted_at: string | null; notes: string | null } | null
  if (!sor || sor.status === 'draft') {
    return {
      error: `A(z) ${params.year}. évi összesítő nincs felküldve — nincs mit feloldani.`,
    }
  }

  const indoklas = params.indoklas.trim()

  // (a) A kerület még nem vette át → visszavonjuk a felküldést.
  if (sor.status === 'submitted') {
    const { data: frissitett, error: updErr } = await supabase
      .from('diocese_felterjesztes')
      .update({
        status: 'draft',
        submitted_at: null,
        notes: naploSor(
          sor.notes,
          `A felküldés visszavonva javításra (eredeti felküldés: ${sor.submitted_at || 'ismeretlen időpont'}) — ${indoklas}`,
        ),
      })
      .eq('id', sor.id)
      .eq('status', 'submitted')
      .select('id')
    if (updErr) {
      return {
        error: `A felküldés visszavonása nem sikerült (részlet: ${updErr.message}).`,
      }
    }
    if (!frissitett || frissitett.length === 0) {
      // 0 soros UPDATE = néma no-op (RLS vagy közben megváltozott státusz).
      return {
        error:
          'A visszavonás nem történt meg — vagy nincs hozzá jogosultságod, vagy az egyházkerület ' +
          'időközben átvette az összesítőt. Frissítsd az oldalt, és nézd meg az állapotot.',
      }
    }
    return { visszavonva: true }
  }

  // (b) A kerület átvette (vagy visszaküldte) → a kérés rögzül.
  const { data: frissitett, error: updErr } = await supabase
    .from('diocese_felterjesztes')
    .update({
      unlock_requested: true,
      unlock_reason: indoklas,
      unlock_requested_at: new Date().toISOString(),
      unlock_requested_by: params.userId,
      notes: naploSor(sor.notes, `Feloldás kérése az egyházkerülettől — ${indoklas}`),
    })
    .eq('id', sor.id)
    .select('id')
  if (updErr) {
    if (isMissingColumnError(updErr.message)) {
      return {
        error:
          'A feloldás-kérés rögzítéséhez szükséges adatbázis-oszlopok még hiányoznak. Futtasd le a ' +
          '2026-08-15-egyhazmegyei-osszesito-feloldas.sql fájlt, majd próbáld újra.',
      }
    }
    return { error: `A feloldás-kérés rögzítése nem sikerült (részlet: ${updErr.message}).` }
  }
  if (!frissitett || frissitett.length === 0) {
    return {
      error: 'A feloldás-kérés nem rögzült (nincs hozzá írási jogosultságod ezen az egyházmegyén).',
    }
  }
  return { rogzitve: true }
}

/**
 * A megye adott évi felterjesztéseinek állapota — a Pénzügy „Felküldés az
 * egyházkerületnek" kártyájához.
 *
 * FAIL-CLOSED: hibánál `{ error }`, soha nem ad „üres = nincs felküldve"
 * választ egy elnyelt hibából (az a lelkészt arra bírná, hogy másodszor is
 * felküldje azt, ami már fent van).
 */
export async function olvasDioceseFelterjesztesek(
  supabase: SupabaseServerClient,
  dioceseId: string,
  year: number,
): Promise<{ rows?: DioceseFelterjesztesSor[]; error?: string }> {
  const { data, error } = await supabase
    .from('diocese_felterjesztes')
    .select('doc_type, modification_number, year, status, submitted_at, iktatoszam, returned_reason')
    .eq('diocese_id', dioceseId)
    .eq('year', year)
  if (error) {
    if (isMissingColumnError(error.message)) {
      return {
        error:
          'A felküldések állapota most nem olvasható: a nyilvántartó tábla vagy oszlop még ' +
          'hiányzik az adatbázisban. Futtasd le a 2026-08-15-egyhazmegyei-uj-tablak.sql és a ' +
          '2026-08-15-egyhazmegyei-felterjesztes-modositas.sql fájlt.',
      }
    }
    return {
      error: `A felküldések állapotát nem sikerült betölteni (részlet: ${error.message}).`,
    }
  }
  return {
    rows: ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      docType: r.doc_type as DioceseFelterjesztesTipus,
      modificationNumber: Number(r.modification_number) || 0,
      year: Number(r.year),
      status: (r.status as DioceseFelterjesztesSor['status']) ?? 'draft',
      submittedAt: (r.submitted_at as string | null) ?? null,
      iktatoszam: (r.iktatoszam as string | null) ?? null,
      returnedReason: (r.returned_reason as string | null) ?? null,
    })),
  }
}
