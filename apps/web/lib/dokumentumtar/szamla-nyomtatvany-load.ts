/**
 * Szállítói számla nyomtatvány — KÖZÖS BETÖLTŐ (2026-09-04).
 *
 * Egyetlen forrás a `szamla/[id]` lapnak ÉS az előnézet-dialógus
 * szerver-actionjának: ugyanazt a HTML-t adja, hogy a kettő ne húzhasson szét
 * (a repó visszatérő hibaosztálya: „a második felület a régi implementációt őrzi").
 *
 * FAIL-LOUD SZABÁLYOK:
 *  - Az alapsor `select('*')`-gal jön (oszlop-drift-tűrő); a DB-hiba és a „nincs
 *    ilyen sor" KÜLÖN ág — egy átmeneti 503 NEM jelenhet meg „eltűnt a számla"-ként.
 *  - Az XML letöltése/parse-olása KÜLÖN, elnyelt hibájú lépés: bukása csak
 *    SZEGÉNYÍTI a lapot (nincs tétel), de a lap KIMONDJA, miért. A hiteles XML
 *    hivatkozás nélkül törölhető (FK ON DELETE SET NULL), tehát a „nincs XML"
 *    ág legális, nem kivétel.
 *  - Minden gazdagítás (párok, bankok, XML) külön lekérdezés: egy rossz embed
 *    legfeljebb egy blokkot visz el, nem az egész lapot (a 404-csapda ellen).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { GYDOK_BUCKET } from './dokumentum-types'
import type { SzallitoiSzamla } from './szamla-types'
import { parseUblSzamlaReszletek, type UblSzamlaReszletek } from '@/lib/oblio/ubl-parser'
import {
  buildSzallitoiSzamlaHtml,
  type SzamlaNyomtatvanyPar,
  type SzamlaNyomtatvanyVevo,
  type SzamlaNyomtatvanyResult,
} from './szamla-nyomtatvany'

export type SzamlaNyomtatvanyBetoltes =
  | { ok: true; eredmeny: SzamlaNyomtatvanyResult; szamla: SzallitoiSzamla; xmlHiba: string | null }
  | { ok: false; notFound: boolean; error: string }

export async function loadSzamlaNyomtatvany(args: {
  supabase: SupabaseClient
  congId: string
  szamlaId: string
  vevo: SzamlaNyomtatvanyVevo
  nyomtatta: string | null
}): Promise<SzamlaNyomtatvanyBetoltes> {
  const { supabase, congId, szamlaId, vevo, nyomtatta } = args

  // ── 1) Az alapsor — DB-hiba ≠ nincs sor ──────────────────────────────
  const { data, error } = await supabase
    .from('szallitoi_szamla')
    .select('*')
    .eq('id', szamlaId)
    .eq('congregation_id', congId)
    .maybeSingle()
  if (error) {
    return { ok: false, notFound: false, error: `A számla lekérése sikertelen: ${error.message}` }
  }
  if (!data) return { ok: false, notFound: true, error: 'Nincs ilyen számla ebben a gyülekezetben.' }
  const szamla = data as SzallitoiSzamla

  // ── 2) Könyvelési párok + bank-nevek (külön, egyik bukása sem viszi el a lapot) ──
  const parok: SzamlaNyomtatvanyPar[] = []
  {
    const [{ data: kapcsolatok, error: kErr }, { data: bankok }] = await Promise.all([
      supabase
        .from('szallitoi_szamla_kiadas')
        .select('osszeg_resz, kiadas:kiadas_id (id, datum, osszeg, iratszam, bankszamla_id, deleted, stornozott)')
        .eq('szamla_id', szamlaId)
        .eq('congregation_id', congId),
      supabase.from('bankszamlak').select('id, bank_neve').eq('congregation_id', congId),
    ])
    if (kErr) console.error('[szamla-nyomtatvany] párok lekérése hibázott:', kErr.message)
    const bankNev = new Map(((bankok || []) as Array<{ id: number; bank_neve: string }>).map((b) => [b.id, b.bank_neve]))
    for (const k of ((kapcsolatok || []) as unknown as Array<{
      osszeg_resz: number
      kiadas: { datum: string | null; iratszam: string | null; bankszamla_id: number | null; deleted?: boolean | null; stornozott?: boolean | null } | null
    }>)) {
      if (!k.kiadas) continue
      parok.push({
        datum: k.kiadas.datum,
        iratszam: k.kiadas.iratszam,
        osszegResz: Number(k.osszeg_resz) || 0,
        ervenytelen: !!k.kiadas.deleted || !!k.kiadas.stornozott,
        hely: k.kiadas.bankszamla_id != null ? bankNev.get(k.kiadas.bankszamla_id) ?? `#${k.kiadas.bankszamla_id}` : 'Kassza',
      })
    }
  }

  // ── 3) Az eredeti e-Factura XML → részletes kinyerés (fail-loud, nem fail-silent) ──
  let reszletek: UblSzamlaReszletek | null = null
  let xmlHiba: string | null = null
  if (!szamla.xml_dokumentum_id) {
    xmlHiba = 'Ehhez a számlához nincs kapcsolt e-Factura XML (a fájl törölve lett, vagy még nem pótolódott).'
  } else {
    const { data: dok, error: dokErr } = await supabase
      .from('gyulekezeti_dokumentum')
      .select('storage_path, file_name, deleted')
      .eq('id', szamla.xml_dokumentum_id)
      .eq('congregation_id', congId)
      .maybeSingle()
    if (dokErr) xmlHiba = `Az XML dokumentum-bejegyzése nem olvasható: ${dokErr.message}`
    else if (!dok) xmlHiba = 'Az XML dokumentum-bejegyzése nem található.'
    else if ((dok as { deleted?: boolean }).deleted) xmlHiba = 'Az XML a Kukában van — a tételek nem nyomtathatók, amíg vissza nem állítod.'
    else {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(GYDOK_BUCKET)
        .download((dok as { storage_path: string }).storage_path)
      if (dlErr || !blob) xmlHiba = `Az XML letöltése a tárhelyről sikertelen: ${dlErr?.message || 'üres válasz'}`
      else {
        const text = new TextDecoder('utf-8').decode(new Uint8Array(await blob.arrayBuffer()))
        const r = parseUblSzamlaReszletek(text, szamla.anaf_uuid)
        if (r.parseError) xmlHiba = `Az XML nem dolgozható fel: ${r.parseError}`
        else reszletek = r
      }
    }
  }
  if (xmlHiba) console.warn(`[szamla-nyomtatvany] ${szamlaId}: ${xmlHiba}`)

  const eredmeny = buildSzallitoiSzamlaHtml({
    szamla,
    reszletek,
    xmlHiba,
    vevo,
    parok,
    nyomtatasIdeje: new Date().toISOString(),
    nyomtatta,
  })
  return { ok: true, eredmeny, szamla, xmlHiba }
}
