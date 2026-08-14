'use server'

/**
 * Kifizetetlen számlák (7. pont C szelet) — server actions.
 *
 * KÉT FORRÁS, EGYESÍTVE (docs/ROMAN-SZABVANYOK-KUTATAS-2026-08-14.md 3.2):
 *  (a) Oblio API `/docs/invoice/list` a `collected=0` paraméterrel — HITELES,
 *      élő fizetési állapot (nem heurisztika). Csak ha van beállított, aktív
 *      Oblio-kapcsolat (oblio_fiokok).
 *  (b) a szallitoi_szamla tábla kifizetve=false sorai — a feltöltött
 *      ZIP/XML-ekből készült szállítói számlák.
 *
 * FAIL-CLOSED elv: a két forrás hibája KÜLÖN-KÜLÖN, hangosan utazik vissza
 * (helyiHiba / oblioHiba) — ha az Oblio nem elérhető, a helyi lista attól még
 * megjelenik, de a UI hangosan jelzi, hogy az online rész hiányzik. Néma
 * „üres lista" nincs.
 *
 * Rate-limit védelem: az Oblio-rész eredménye 60 mp-ig memóriában cache-elt
 * (az oblio-lookup-actions.ts mintája). A helyi rész MINDIG friss DB-olvasás —
 * így a kifizetve-jelölés / kapcsolás azonnal látszik, cache-invalidálás nélkül.
 */

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { decryptSecret } from '@/lib/supabase/secret-vault'
import { listInvoices } from '@/lib/finance/oblio/oblio-client'
import { OblioError } from '@/lib/finance/oblio/oblio-errors'
import type { OblioInvoiceListItem } from '@/lib/finance/oblio/oblio-types'
import {
  BELSO_MOZGAS_ROGZITO_KODS,
  isGyulekezetiKonyvelhetoKod,
} from '@/lib/constants/finance'
import type {
  KiadasJelolt,
  KifizetesRogzitoAdatok,
  KifizetetlenEredmeny,
  KifizetetlenTetel,
} from '@/lib/dokumentumtar/kifizetetlen-types'

// A helyi lista felső korlátja — a kifizetetlen állomány jellemzően kicsi;
// ha ennél több van, a legkorábbi határidejűek jönnek (a rendezés miatt).
const HELYI_LIMIT = 200
// Az Oblio-lista lapmérete — egy kérés, lapozás nélkül (rate limit kímélése).
const OBLIO_LAPMERET = 100

// ─────────────────────────────────────────────────────────────────
// Oblio-rész memóriacache (60 s) — a rate limit védelme
// ─────────────────────────────────────────────────────────────────

type OblioResz = {
  tetelek: KifizetetlenTetel[]
  aktiv: boolean
  hiba: string | null
  tobbLehet: boolean
}
type OblioCacheEntry = { value: OblioResz; expiresAt: number }
const oblioCache = new Map<string, OblioCacheEntry>()
const OBLIO_CACHE_TTL_MS = 60_000

// ─────────────────────────────────────────────────────────────────
// 1) Kifizetetlen számlák — a két forrás egyesítve
// ─────────────────────────────────────────────────────────────────

/**
 * A kifizetetlen számlák egyesített listája. `oblioFrissites = true` esetén az
 * Oblio-cache-t megkerüljük (a Frissítés gomb) — egyébként 60 mp-en belül a
 * cache-elt Oblio-választ használjuk.
 */
export async function getKifizetetlenSzamlak(
  input: { oblioFrissites?: boolean } = {},
): Promise<KifizetetlenEredmeny> {
  const { supabase, congId } = await getCongId()
  if (!congId) {
    return {
      tetelek: [],
      helyiHiba: NINCS_GYULEKEZET,
      oblioAktiv: false,
      oblioHiba: null,
      oblioTobbLehet: false,
    }
  }

  // ── (b) HELYI: szallitoi_szamla kifizetve=false — mindig friss ──
  let helyiTetelek: KifizetetlenTetel[] = []
  let helyiHiba: string | null = null
  {
    const { data, error } = await supabase
      .from('szallitoi_szamla')
      .select(
        'id, tipus, szallito_nev, szamla_szam, kiallitas_datum, fizetesi_hatarido, osszeg, penznem, xml_dokumentum_id, pdf_dokumentum_id, megjegyzes',
      )
      .eq('congregation_id', congId)
      .eq('kifizetve', false)
      .order('fizetesi_hatarido', { ascending: true, nullsFirst: false })
      .order('kiallitas_datum', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .limit(HELYI_LIMIT)

    if (error) {
      helyiHiba = friendlyDbError('A feltöltött számlák betöltése sikertelen', error)
    } else {
      helyiTetelek = ((data || []) as Array<{
        id: string
        tipus: 'szamla' | 'jovairo'
        szallito_nev: string | null
        szamla_szam: string | null
        kiallitas_datum: string | null
        fizetesi_hatarido: string | null
        osszeg: number
        penznem: string
        xml_dokumentum_id: string | null
        pdf_dokumentum_id: string | null
        megjegyzes: string | null
      }>).map((s) => ({
        forras: 'helyi',
        irany: 'fizetendo',
        szamlaId: s.id,
        tipus: s.tipus,
        partnerNev: s.szallito_nev,
        szamlaSzam: s.szamla_szam,
        kiallitasDatum: s.kiallitas_datum,
        fizetesiHatarido: s.fizetesi_hatarido,
        osszeg: Number(s.osszeg) || 0,
        penznem: s.penznem || 'RON',
        pdfDokumentumId: s.pdf_dokumentum_id,
        xmlDokumentumId: s.xml_dokumentum_id,
        pdfUrl: null,
        megjegyzes: s.megjegyzes,
      }))
    }
  }

  // ── (a) OBLIO: collected=0 — 60 mp cache-elt ──
  const cacheKey = congId
  let oblio: OblioResz | null = null
  if (!input.oblioFrissites) {
    const hit = oblioCache.get(cacheKey)
    if (hit && hit.expiresAt > Date.now()) oblio = hit.value
  }
  if (!oblio) {
    oblio = await oblioKifizetetlenek(supabase, congId)
    oblioCache.set(cacheKey, { value: oblio, expiresAt: Date.now() + OBLIO_CACHE_TTL_MS })
  }

  // ── Egyesítés + rendezés: határidő szerint (legsürgősebb elöl),
  //    határidő nélküliek a végén; másodlagosan kiállítás-dátum.
  const tetelek = [...helyiTetelek, ...oblio.tetelek].sort((a, b) => {
    const ah = a.fizetesiHatarido || '9999-12-31'
    const bh = b.fizetesiHatarido || '9999-12-31'
    if (ah !== bh) return ah < bh ? -1 : 1
    const ak = a.kiallitasDatum || '9999-12-31'
    const bk = b.kiallitasDatum || '9999-12-31'
    if (ak !== bk) return ak < bk ? -1 : 1
    return 0
  })

  return {
    tetelek,
    helyiHiba,
    oblioAktiv: oblio.aktiv,
    oblioHiba: oblio.hiba,
    oblioTobbLehet: oblio.tobbLehet,
  }
}

// ─────────────────────────────────────────────────────────────────
// 2) A „Kifizetés rögzítése" dialógus törzsadatai
// ─────────────────────────────────────────────────────────────────

/**
 * A CombinedEntryDialog-hoz szükséges jogcím-listák + bankszámlák — a
 * finance-tabs.tsx kategória-építésével bit-azonos szabályok szerint
 * (közös helperek: isGyulekezetiKonyvelhetoKod + BELSO_MOZGAS_ROGZITO_KODS;
 * a teljes initFinance-t NEM húzzuk be, mert az az egész évi könyvelést
 * betöltené egyetlen dialógus kedvéért).
 */
export async function getKifizetesRogzitoAdatok(): Promise<KifizetesRogzitoAdatok> {
  const { supabase, congId } = await getCongId()
  if (!congId) {
    return { incomeCategories: [], expenseCategories: [], bankAccounts: [], error: NINCS_GYULEKEZET }
  }

  const [celRes, bevRes, kiaRes, bankRes] = await Promise.all([
    supabase.from('szamadasicel').select('id, nev, szint'),
    supabase.from('befizetescel').select('id, id_szamadasicel'),
    supabase.from('kiadascel').select('id, id_szamadasicel'),
    supabase
      .from('bankszamlak')
      .select('id, bank_neve')
      .eq('congregation_id', congId)
      .eq('aktiv', true),
  ])

  // FAIL-CLOSED: bármelyik törzs-lekérés hibája hangos — fél-kész
  // kategória-listával a rögzítő félrevezető lenne.
  const firstError = celRes.error || bevRes.error || kiaRes.error || bankRes.error
  if (firstError) {
    return {
      incomeCategories: [],
      expenseCategories: [],
      bankAccounts: [],
      error: `A rögzítő törzsadatainak betöltése sikertelen: ${firstError.message}`,
    }
  }

  // szamadasicel.id maga a kód-string (pl. '201.12') — a finance-tabs is így
  // olvassa (celById kulcsa az id, a szűrés a kódon fut).
  const celById = new Map(
    ((celRes.data || []) as Array<{ id: string; nev: string | null; szint?: string | null }>).map(
      (c) => [c.id, c],
    ),
  )

  const buildKategoriak = (
    junction: Array<{ id: number; id_szamadasicel: string | null }>,
  ): { id: number; kod: string; nev: string }[] =>
    junction
      .filter((r) => !!r.id_szamadasicel)
      .map((r) => {
        const kod = r.id_szamadasicel as string
        const cel = celById.get(kod)
        return {
          id: r.id,
          kod,
          nev: (cel?.nev || '').trim() || kod,
          szint: cel?.szint as 'gyulekezet' | 'egyhazmegye' | 'kerulet' | null | undefined,
        }
      })
      .filter((c) => isGyulekezetiKonyvelhetoKod(c.kod, c.szint) || BELSO_MOZGAS_ROGZITO_KODS.has(c.kod))
      .map(({ id, kod, nev }) => ({ id, kod, nev }))
      .sort((a, b) => a.kod.localeCompare(b.kod))

  const incomeCategories = buildKategoriak(
    (bevRes.data || []) as Array<{ id: number; id_szamadasicel: string | null }>,
  )
  const expenseCategories = buildKategoriak(
    (kiaRes.data || []) as Array<{ id: number; id_szamadasicel: string | null }>,
  )

  // Hangos jelzés a néma-üres helyett: kiadás-jogcím nélkül a rögzítő
  // menthetetlen sort adna.
  if (expenseCategories.length === 0) {
    return {
      incomeCategories,
      expenseCategories,
      bankAccounts: [],
      error:
        'Nincsenek kiadás-jogcímek ehhez a gyülekezethez — nyisd meg egyszer a Pénzügy oldalt (az inicializálja a jogcím-listákat), majd próbáld újra.',
    }
  }

  return {
    incomeCategories,
    expenseCategories,
    bankAccounts: ((bankRes.data || []) as Array<{ id: number; bank_neve: string }>),
    error: null,
  }
}

// ─────────────────────────────────────────────────────────────────
// 3) Kiadás-jelöltek a számla↔kiadás kapcsoláshoz
// ─────────────────────────────────────────────────────────────────

/**
 * Élő (nem törölt, nem sztornózott) kiadás-sorok a kapcsoló dialógushoz —
 * a legutóbbiak elöl, a MÁR EHHEZ A SZÁMLÁHOZ kapcsoltak kiszűrve.
 * A tényleges kapcsolást a (B szelet) linkSzamlaKiadas action végzi, a
 * fedezet-őreivel együtt — ez az action csak olvasás.
 */
export async function listKiadasJeloltek(input: {
  szamlaId: string
}): Promise<{ jeloltek: KiadasJelolt[]; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { jeloltek: [], error: NINCS_GYULEKEZET }

  // A számlához már kapcsolt kiadások — ezeket nem ajánljuk újra.
  const { data: kapcsolatok, error: kapcsErr } = await supabase
    .from('szallitoi_szamla_kiadas')
    .select('kiadas_id')
    .eq('szamla_id', input.szamlaId)
    .eq('congregation_id', congId)
  if (kapcsErr) {
    return { jeloltek: [], error: friendlyDbError('A meglévő kapcsolatok lekérése sikertelen', kapcsErr) }
  }
  const kizartIds = ((kapcsolatok || []) as { kiadas_id: number }[]).map((k) => k.kiadas_id)

  let query = supabase
    .from('kiadas')
    .select('id, datum, osszeg, atvevo, nyugta, iratszam')
    .eq('congregation_id', congId)
    .eq('deleted', false)
    .eq('stornozott', false)
    .order('datum', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(25)
  if (kizartIds.length > 0) {
    query = query.not('id', 'in', `(${kizartIds.join(',')})`)
  }

  const { data, error } = await query
  if (error) {
    return { jeloltek: [], error: friendlyDbError('A kiadások betöltése sikertelen', error) }
  }
  const jeloltek = ((data || []) as Array<{
    id: number
    datum: string | null
    osszeg: number
    atvevo: string | null
    nyugta: string | null
    iratszam: string | null
  }>).map((k) => ({ ...k, osszeg: Number(k.osszeg) || 0 }))
  return { jeloltek, error: null }
}

// ─────────────────────────────────────────────────────────────────
// Belső segédek ('use server' fájl csak async function-t exportálhat,
// ezért ezek NEM exportáltak)
// ─────────────────────────────────────────────────────────────────

const NINCS_GYULEKEZET = 'Nincs bejelentkezett felhasználó vagy gyülekezet.'

async function getCongId() {
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId, userId }
}

type SupabaseKliens = Awaited<ReturnType<typeof getEffectiveCongregationContext>>['supabase']

/**
 * Az Oblio collected=0 lista lekérése és egységes tetel-alakra hozása.
 * SOHA nem dob — a hibát a `hiba` mezőben adja vissza (a UI hangosan mutatja).
 */
async function oblioKifizetetlenek(
  supabase: SupabaseKliens,
  congId: string,
): Promise<OblioResz> {
  // Van-e beállított, aktív Oblio-kapcsolat?
  const { data: cfg, error: cfgErr } = await supabase
    .from('oblio_fiokok')
    .select('id, email, api_secret_encrypted, cif, aktiv')
    .eq('congregation_id', congId)
    .eq('aktiv', true)
    .maybeSingle()

  if (cfgErr) {
    // A konfig-olvasás hibája NEM „nincs Oblio" — hangosan jelezzük.
    return {
      tetelek: [],
      aktiv: true,
      hiba: `Az Oblio-kapcsolat beállításának olvasása sikertelen: ${cfgErr.message}`,
      tobbLehet: false,
    }
  }
  if (!cfg) return { tetelek: [], aktiv: false, hiba: null, tobbLehet: false }

  let apiSecret: string
  try {
    apiSecret = await decryptSecret(supabase, cfg.api_secret_encrypted)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      tetelek: [],
      aktiv: true,
      hiba: `Az Oblio-kulcs visszafejtése sikertelen: ${msg}`,
      tobbLehet: false,
    }
  }

  let items: OblioInvoiceListItem[] = []
  try {
    const resp = await listInvoices(cfg.email, apiSecret, {
      cif: cfg.cif,
      // A kutatás (3.2) szerinti hivatalos paraméter: 0 = kifizetetlen.
      collected: 0,
      limitPerPage: OBLIO_LAPMERET,
    })
    items = resp.data ?? []
  } catch (err) {
    const msg = err instanceof OblioError ? err.message : err instanceof Error ? err.message : String(err)
    return {
      tetelek: [],
      aktiv: true,
      hiba: `Az Oblio nem elérhető: ${msg}`,
      tobbLehet: false,
    }
  }

  const tetelek: KifizetetlenTetel[] = items
    // A sztornózott számla nem tartozás — kiszűrjük.
    .filter((it) => !it.canceled)
    .map((it) => ({
      forras: 'oblio' as const,
      irany: 'kintlevoseg' as const,
      szamlaId: null,
      tipus: null,
      partnerNev: it.client?.name || null,
      szamlaSzam: [it.seriesName, it.number].filter(Boolean).join(' ') || null,
      kiallitasDatum: it.issueDate || null,
      fizetesiHatarido: it.dueDate || null,
      osszeg: Number(it.total) || 0,
      penznem: it.currency || 'RON',
      pdfDokumentumId: null,
      xmlDokumentumId: null,
      pdfUrl: it.link || null,
      megjegyzes: null,
    }))

  return { tetelek, aktiv: true, hiba: null, tobbLehet: items.length >= OBLIO_LAPMERET }
}

/**
 * DB-hiba magyarul, hangosan. 42P01/42703/PGRST205 = a tábla/oszlop hiányzik
 * → a szállítói-számla-migráció még nem futott le (cselekvésre felszólító üzenet).
 */
function friendlyDbError(prefix: string, error: { code?: string; message: string }): string {
  const migrationMissing =
    error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205'
  if (migrationMissing) {
    return `${prefix}: a szállítói számlákhoz szükséges adatbázis-migráció még nincs lefuttatva (migration-docs/sql/2026-08-15-szallitoi-szamlak.sql). Részlet: ${error.message}`
  }
  return `${prefix}: ${error.message}`
}
