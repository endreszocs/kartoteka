'use server'

/**
 * Leltar 3_43 — a hivatalos egyházmegyei leltár-munkafüzet DEDIKÁLT importja
 * és az export-környezet (2026-08-26).
 *
 * MIÉRT NEM A GENERIKUS BATCH-ÚT: a munkafüzet fejlécei a 3–4. sorban vannak,
 * a G oszlop „Helyszín - Felelős" összevont, a Könyvek lapon E=Szerző/F=Cím,
 * az ismétlődő kulcsú (negatív) sorok részleges kivezetést, alapeszköznél
 * le-/felértékelést jelentenek — ezt a szabályrendszert a
 * lib/inventory/leltar343-shared tiszta rétege hordozza, itt csak a kapuőrzés,
 * a DB-egyeztetés és az írás él.
 *
 * KAPUŐRZÉS: ugyanaz a fail-closed hármas, mint a generikus batch-importon
 * (delegált PIN-munkamenet VAGY aktív god-mode VAGY rendszergazda+hatókör) —
 * a 2026-08-11-i #16-os biztonsági javítás mintája.
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'
import { assertDelegatedImportAllowed } from '@/app/(dashboard)/delegated-import/guard'
import { resolveImportTargetCongregationId } from '@/lib/import/import-target'
import { selectAllPaged } from '@kartoteka/supabase-client'
import {
  nextLeltariSzam,
  serializeInventoryCategory,
  INVENTORY_CATEGORY_PREFIXES,
} from '@kartoteka/ui-app'
import {
  isLeltar343Workbook,
  feldolgozLeltar343Lap,
  type Leltar343Rekord,
} from '@/lib/inventory/leltar343-shared'
import {
  parseLeltar343Workbook,
  leltar343LapNevek,
  type Leltar343Parsed,
} from '@/lib/inventory/leltar343-parse'
import type {
  Leltar343Preview,
  Leltar343ImportResult,
  Leltar343ExportContext,
} from '@/lib/inventory/leltar343-import-types'
import { documentSeasonYear } from '@/lib/constants/documents'
import { getInventoryPrintFinanceSummary } from './actions'

// ---------------------------------------------------------------------------
// Közös: kapu + fájl + parse
// ---------------------------------------------------------------------------

type ElokeszitesHiba = { error: string }
interface Elokeszites {
  congregationId: string
  userId: string
  fileName: string
  parsed: Leltar343Parsed
}

async function elokeszit(formData: FormData): Promise<Elokeszites | ElokeszitesHiba> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const target = await resolveImportTargetCongregationId(null, access)
  if (target.error) return { error: target.error }
  if (!target.congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const guard = await assertDelegatedImportAllowed('inventory', target.congregationId, access)
  if (!guard.ok) return { error: guard.error }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'Nincs fájl kiválasztva.' }
  if (file.size > 10 * 1024 * 1024) return { error: 'A fájl mérete meghaladja a 10 MB-os limitet.' }
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext !== 'xlsx' && ext !== 'xls') {
    return { error: 'A Leltar 3_43 importáló Excel-munkafüzetet (.xlsx/.xls) vár.' }
  }

  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    return { error: 'A fájl beolvasása sikertelen.' }
  }

  try {
    const lapNevek = leltar343LapNevek(buffer)
    if (!isLeltar343Workbook(lapNevek)) {
      return {
        error:
          'Ez a fájl nem a hivatalos Leltar 3_43 munkafüzet (a jellemző lapok — Cimlap, ' +
          'Csekely_erteku_targyak, Alapeszkozok… — nem találhatók). Egyszerű leltár-listát a ' +
          'lentebbi „Rendszergazdai importáló" táblázatos útján tölthetsz fel.',
      }
    }
    return {
      congregationId: target.congregationId,
      userId: access.user.id,
      fileName: file.name,
      parsed: parseLeltar343Workbook(buffer),
    }
  } catch (e) {
    return { error: `A munkafüzet feldolgozása sikertelen: ${e instanceof Error ? e.message : 'ismeretlen hiba'}` }
  }
}

/** A már kiadott leltári számok fail-closed, lapozott lekérdezése. */
async function kiadottSzamok(
  supabase: Awaited<ReturnType<typeof createClient>>,
  congregationId: string,
): Promise<Set<string> | ElokeszitesHiba> {
  const { data, error } = await selectAllPaged<{ leltari_szam: string | null }>(
    supabase.from('leltar_tetelek').select('leltari_szam').eq('congregation_id', congregationId),
  )
  if (error) {
    return { error: `A meglévő leltári számok lekérdezése nem sikerült (${error.message}) — az import nem indult el (különben duplikált szám születhetne).` }
  }
  return new Set(data.map(r => String(r.leltari_szam || '').trim()).filter(Boolean))
}

// ---------------------------------------------------------------------------
// 1. Előnézet
// ---------------------------------------------------------------------------

export async function previewLeltar343(formData: FormData): Promise<Leltar343Preview> {
  const elo = await elokeszit(formData)
  if ('error' in elo) return { error: elo.error }
  const { parsed } = elo

  const supabase = await createClient()
  const meglevok = await kiadottSzamok(supabase, elo.congregationId)
  if (!(meglevok instanceof Set)) return { error: meglevok.error }
  const meglevoSet = meglevok

  const lapok: NonNullable<Leltar343Preview['lapok']> = []
  let osszesTetel = 0
  let dbDuplikatumok = 0

  for (const { lap, sorok } of parsed.lapok) {
    const eredmeny = feldolgozLeltar343Lap({ lap, sorok, helyszinKatalogus: parsed.helyszinKatalogus })
    osszesTetel += eredmeny.rekordok.length
    dbDuplikatumok += eredmeny.rekordok.filter(
      r => r.leltari_szam && meglevoSet.has(r.leltari_szam),
    ).length
    lapok.push({
      sheet: lap.sheet,
      cimke: lap.cimke,
      tetelek: eredmeny.rekordok.length,
      kivezetett: eredmeny.rekordok.filter(r => r.is_deleted).length,
      ertekModositott: eredmeny.rekordok.filter(r => r.ertek_modositas !== 0).length,
      hibak: eredmeny.hibak.map(h => ({ sor: h.sor, uzenet: h.uzenet })).slice(0, 20),
      figyelmeztetesek: eredmeny.figyelmeztetesek.map(h => ({ sor: h.sor, uzenet: h.uzenet })).slice(0, 20),
    })
  }

  return {
    success: true,
    fileName: elo.fileName,
    egyhazmegye: parsed.cimlap.egyhazmegye,
    intezmeny: parsed.cimlap.intezmeny,
    vezeto: parsed.cimlap.vezeto,
    helyszinek: parsed.cimlap.parok.length,
    lapok,
    osszesTetel,
    dbDuplikatumok,
    hianyzoLapok: parsed.hianyzoLapok,
  }
}

// ---------------------------------------------------------------------------
// 2. Import végrehajtás
// ---------------------------------------------------------------------------

/** Az új (2026-08-26-os SQL-lel érkező) oszlopok — migráció előtt kihagyhatók. */
const UJ_OSZLOP_RE = /ertek_modositas|alapeszkoz_csoport/

function dbPayload(
  r: Leltar343Rekord,
  congregationId: string,
  userId: string,
  leltariSzam: string,
): Record<string, unknown> {
  return {
    congregation_id: congregationId,
    userid: userId,
    kategoria: serializeInventoryCategory(r.kategoria),
    megnevezes: r.megnevezes,
    szerzo: r.szerzo,
    megjegyzes: r.megjegyzes,
    leltari_szam: leltariSzam,
    helyszin: r.helyszin,
    felelos_neve: r.felelos_neve,
    beszerzes_datuma: r.beszerzes_datuma,
    beszerzesi_ertek: r.beszerzesi_ertek,
    mennyiseg: r.mennyiseg,
    mertekegyseg: r.mertekegyseg,
    beszerzes_bizonylat: r.beszerzes_bizonylat,
    torles_datuma: r.torles_datuma,
    torles_bizonylat: r.torles_bizonylat,
    is_deleted: r.is_deleted,
    hasznalati_ido_ev: r.hasznalati_ido_ev,
    alapeszkoz_csoport: r.alapeszkoz_csoport,
    ertek_modositas: r.ertek_modositas,
    ertek_modositas_megjegyzes: r.ertek_modositas_megjegyzes,
  }
}

function ujOszlopNelkul(payload: Record<string, unknown>): Record<string, unknown> {
  const masolat = { ...payload }
  delete masolat['alapeszkoz_csoport']
  delete masolat['ertek_modositas']
  delete masolat['ertek_modositas_megjegyzes']
  return masolat
}

export async function executeLeltar343Import(formData: FormData): Promise<Leltar343ImportResult> {
  const elo = await elokeszit(formData)
  if ('error' in elo) return { error: elo.error }
  const { parsed, congregationId, userId } = elo

  const supabase = await createClient()
  const meglevok = await kiadottSzamok(supabase, congregationId)
  if (!(meglevok instanceof Set)) return { error: meglevok.error }

  const hibak: Array<{ lap: string; sor: number; uzenet: string }> = []
  const figyelmeztetesek: string[] = []
  const payloadok: Array<{ lap: string; sor: number; payload: Record<string, unknown> }> = []
  let kihagyott = 0

  for (const { lap, sorok } of parsed.lapok) {
    const eredmeny = feldolgozLeltar343Lap({ lap, sorok, helyszinKatalogus: parsed.helyszinKatalogus })
    for (const h of eredmeny.hibak) {
      kihagyott += 1
      if (hibak.length < 50) hibak.push({ lap: h.lap, sor: h.sor, uzenet: h.uzenet })
    }
    for (const f of eredmeny.figyelmeztetesek) {
      if (figyelmeztetesek.length < 50) figyelmeztetesek.push(`[${f.lap} ${f.sor}. sor] ${f.uzenet}`)
    }
    for (const r of eredmeny.rekordok) {
      let leltariSzam = r.leltari_szam || ''
      if (leltariSzam && meglevok.has(leltariSzam)) {
        kihagyott += 1
        if (hibak.length < 50) {
          hibak.push({ lap: r.lap, sor: r.sor, uzenet: `A(z) „${leltariSzam}" leltári szám már létezik a rendszerben — a sor kimaradt (nem írunk felül).` })
        }
        continue
      }
      if (!leltariSzam) {
        const prefix = INVENTORY_CATEGORY_PREFIXES[r.kategoria]
        leltariSzam = nextLeltariSzam(
          [...meglevok].filter(sz => sz.startsWith(`${prefix}-`)),
          r.kategoria,
        )
        if (figyelmeztetesek.length < 50) {
          figyelmeztetesek.push(`[${r.lap} ${r.sor}. sor] Hiányzó leltári szám — a rendszer a(z) ${leltariSzam} számot adta ki.`)
        }
      }
      meglevok.add(leltariSzam)
      payloadok.push({ lap: r.lap, sor: r.sor, payload: dbPayload(r, congregationId, userId, leltariSzam) })
    }
  }

  // — Beszúrás 100-asával; új-oszlop hibánál (migráció előtt) lecsupaszított
  //   payloaddal próbálunk újra, EGY hangos figyelmeztetéssel. —
  let beszurt = 0
  let ujOszlopMod = false
  const BATCH = 100
  for (let i = 0; i < payloadok.length; i += BATCH) {
    const szelet = payloadok.slice(i, i + BATCH)
    const batchPayload = szelet.map(p => (ujOszlopMod ? ujOszlopNelkul(p.payload) : p.payload))
    const { error } = await supabase.from('leltar_tetelek').insert(batchPayload)
    if (!error) {
      beszurt += szelet.length
      continue
    }
    if (!ujOszlopMod && UJ_OSZLOP_RE.test(error.message || '')) {
      ujOszlopMod = true
      figyelmeztetesek.push(
        'A leltár-bővítő SQL (2026-08-26-leltar-343.sql) még nincs lefuttatva — az import az ' +
        'alapeszköz-főcsoport és a le-/felértékelés mezők NÉLKÜL ment végbe. Futtasd le az SQL-t, ' +
        'majd szükség esetén importáld újra a fájlt egy üres leltárba a teljes adathűségért.',
      )
      i -= BATCH // ugyanez a szelet újra, csupaszított payloaddal
      continue
    }
    // Soronkénti újrapróbálás — a hibás sor kimarad, a többi bemegy.
    for (const p of szelet) {
      const egyPayload = ujOszlopMod ? ujOszlopNelkul(p.payload) : p.payload
      const { error: sorHiba } = await supabase.from('leltar_tetelek').insert([egyPayload])
      if (sorHiba) {
        kihagyott += 1
        if (hibak.length < 50) hibak.push({ lap: p.lap, sor: p.sor, uzenet: sorHiba.message })
      } else {
        beszurt += 1
      }
    }
  }

  revalidatePath('/leltar')

  try {
    const { logImportRun } = await import('@/lib/import/import-log')
    await logImportRun({
      supabase,
      congregationId,
      userId,
      module: 'inventory',
      fileName: elo.fileName,
      totalInserted: beszurt,
      totalSkipped: kihagyott,
      perSheetLog: parsed.lapok.map(({ lap }) => ({
        sheet: lap.sheet,
        profile: 'leltar343',
        inserted: 0,
        skipped: 0,
      })),
      lookupStats: {
        personResolved: 0,
        personUnresolved: 0,
        categoryResolved: 0,
        categoryUnresolved: 0,
        warnings: figyelmeztetesek.slice(0, 50),
      },
      errors: hibak.map(h => ({ sheet: h.lap, row: h.sor, message: h.uzenet })),
    })
  } catch (e) {
    console.warn('[executeLeltar343Import] Import log rögzítése sikertelen:', e)
  }

  return {
    success: true,
    beszurt,
    kihagyott,
    hibak: hibak.length > 0 ? hibak : undefined,
    figyelmeztetesek: figyelmeztetesek.length > 0 ? figyelmeztetesek : undefined,
  }
}

// ---------------------------------------------------------------------------
// 3. Export-környezet (Cimlap-fejadatok + Pénztár kezdő egyenlegek)
// ---------------------------------------------------------------------------

export async function getLeltar343ExportContext(): Promise<Leltar343ExportContext> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!access.effectiveCongregationId) {
    // Felsőbb (megyei/kerületi) szinten a munkafüzet-export fej-adatok nélkül
    // is működik — a Cimlap üresen marad, a tételek mennek.
    return { ev: documentSeasonYear() }
  }

  const supabase = await createClient()
  const ev = documentSeasonYear()

  const [gyulekezet, bealitas] = await Promise.all([
    supabase
      .from('congregations')
      .select('name, dioceses(name)')
      .eq('id', access.effectiveCongregationId)
      .maybeSingle(),
    supabase
      .from('bealitas')
      .select('lelkesz, intezmenyneve')
      .eq('congregation_id', access.effectiveCongregationId)
      .eq('id', String(ev))
      .maybeSingle(),
  ])

  const diocese = gyulekezet.data?.dioceses as { name?: string | null } | { name?: string | null }[] | null
  const egyhazmegye = Array.isArray(diocese) ? diocese[0]?.name || null : diocese?.name || null

  // Pénzügyi kezdő egyenlegek — hiba esetén üresen maradnak (inkább üres,
  // mint téves pénzügyi adat a hivatalos íven).
  let penztarKezdo: number | null = null
  let kinnlevosegKezdo: number | null = null
  try {
    const osszegzes = await getInventoryPrintFinanceSummary({ year: ev })
    if (osszegzes) {
      penztarKezdo = osszegzes.openingCash
      kinnlevosegKezdo = osszegzes.openingReceivables
    }
  } catch {
    // néma — az export enélkül is teljes értékű
  }

  return {
    egyhazmegye,
    intezmeny: bealitas.data?.intezmenyneve || gyulekezet.data?.name || null,
    vezeto: bealitas.data?.lelkesz || null,
    ev,
    penztarKezdo,
    kinnlevosegKezdo,
  }
}
