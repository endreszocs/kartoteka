'use server'

/**
 * Szállítói számla adatalap (7. pont B szelet) — server actions.
 *
 * MUNKAMENET (a dokumentumtár A szelet kontraktusára építve):
 *  1. A felhasználó a ZIP-et (vagy egyetlen e-Factura XML-t) a MEGLÉVŐ
 *     dokumentumtár-feltöltéssel tölti fel (prepareDokumentumUpload +
 *     registerDokumentum, 'szallitoi-szamlak' kategória) — így a Next server
 *     action body-limitje nem korlátoz, ÉS az eredeti ANAF-os ZIP (a
 *     digitális aláírással együtt) megőrződik a tárban.
 *  2. A feldolgozást a feldolgozSzamlaZipDokumentum(dokumentumId) végzi:
 *     letölti a fájlt a bucketből → kibontja (zip-kibonto) → kinyeri az
 *     UBL-mezőket (lib/oblio/ubl-parser) → szallitoi_szamla sorokat ír, és a
 *     kibontott XML/PDF fájlokat KÜLÖN dokumentumként a tárba teszi.
 *  3. DUPLIKÁTUM-VÉDELEM: UNIQUE (congregation_id, anaf_uuid) — ugyanaz a
 *     ZIP kétszer feldolgozva NEM duplikál, hanem jelez. Ha a korábbi sorhoz
 *     hiányzik a fájl-hivatkozás (félbeszakadt korábbi futás), az
 *     újrafeldolgozás PÓTOLJA (ön-gyógyító).
 *  4. Egy számla TÖBB kiadáshoz köthető (szallitoi_szamla_kiadas,
 *     összeg-résszel) — linkSzamlaKiadas / unlinkSzamlaKiadas.
 *
 * ⚠️ Minden hiba magyarul és hangosan — a részeredmény is hangosan jelzett
 * (a hibak tömb sosem nyelődik el).
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import {
  GYDOK_BUCKET,
  sanitizeGydokFileName,
} from '@/lib/dokumentumtar/dokumentum-types'
import type {
  SzallitoiSzamla,
  SzallitoiSzamlaListaInput,
  SzamlaFeldolgozasEredmeny,
  SzamlaKiadasKapcsolat,
  SzamlaParositasBejegyzes,
} from '@/lib/dokumentumtar/szamla-types'
import {
  parseUblSzamla,
  anafUuidFajlnevbol,
  azonositoSzamlaIdentitasbol,
  SEMNATURA_TOKEN_RE,
  type UblSzamlaMeta,
} from '@/lib/oblio/ubl-parser'
import {
  kibontSzamlaZip,
  parositSzamlaFajlok,
  type KibontottSzamlaFajl,
} from '@/lib/oblio/zip-kibonto'

// Lapozás-korlátok — a kliens nem kérhet korlátlan ablakot.
const DEFAULT_OLDAL_MERET = 20
const MAX_OLDAL_MERET = 100

// ─────────────────────────────────────────────────────────────────
// 1) ZIP/XML dokumentum feldolgozása → szallitoi_szamla sorok
// ─────────────────────────────────────────────────────────────────

/**
 * Egy MÁR FELTÖLTÖTT dokumentumtár-fájl (ANAF-os ZIP vagy egyetlen e-Factura
 * XML, 'szallitoi-szamlak' kategória) feldolgozása szállítói számla
 * adatalapokká. Az eredmény tételesen sorolja az új számlákat, a
 * duplikátumokat, a kihagyott bejegyzéseket és a hangos hibákat.
 */
export async function feldolgozSzamlaZipDokumentum(
  dokumentumId: string,
): Promise<{ eredmeny: SzamlaFeldolgozasEredmeny | null; error: string | null }> {
  const { supabase, congId, userId } = await getCongId()
  if (!congId) return { eredmeny: null, error: NINCS_GYULEKEZET }

  // ── A forrás-dokumentum betöltése (csak a saját gyülekezetből) ──
  const { data: dok, error: dokErr } = await supabase
    .from('gyulekezeti_dokumentum')
    .select('id, kategoria, file_name, storage_path, mime_type, deleted')
    .eq('id', dokumentumId)
    .eq('congregation_id', congId)
    .maybeSingle()
  if (dokErr) {
    return { eredmeny: null, error: friendlyDbError('A dokumentum lekérése sikertelen', dokErr) }
  }
  if (!dok) {
    return { eredmeny: null, error: 'A dokumentum nem található — lehet, hogy időközben törölték.' }
  }
  const forras = dok as {
    id: string
    kategoria: string
    file_name: string
    storage_path: string
    mime_type: string | null
    deleted: boolean
  }
  if (forras.deleted) {
    return { eredmeny: null, error: 'A dokumentum a Kukában van — előbb állítsd vissza.' }
  }
  if (forras.kategoria !== 'szallitoi-szamlak') {
    return {
      eredmeny: null,
      error: 'Számla-feldolgozás csak a „Szállítói számlák" kategóriából indítható — töltsd fel a fájlt oda.',
    }
  }

  const kisNev = forras.file_name.toLowerCase()
  const zipE = kisNev.endsWith('.zip')
  const xmlE = kisNev.endsWith('.xml')
  if (!zipE && !xmlE) {
    return {
      eredmeny: null,
      error: `Ez a fájl (${forras.file_name}) nem ZIP és nem XML — számla-feldolgozásra nem alkalmas.`,
    }
  }

  // ── Letöltés a bucketből ──
  const { data: blob, error: letoltesErr } = await supabase.storage
    .from(GYDOK_BUCKET)
    .download(forras.storage_path)
  if (letoltesErr || !blob) {
    return {
      eredmeny: null,
      error: `A fájl letöltése a tárhelyről sikertelen (${forras.file_name}): ${letoltesErr?.message || 'üres válasz'}`,
    }
  }
  const nyersAdat = new Uint8Array(await blob.arrayBuffer())

  const eredmeny: SzamlaFeldolgozasEredmeny = {
    ujSzamlak: [],
    duplikatumok: [],
    kihagyott: [],
    hibak: [],
  }

  // ── Kibontás / előkészítés ──
  // Egyetlen XML esetén NEM töltjük fel újra a fájlt — a meglévő dokumentum
  // lesz a számla xml_dokumentum_id-ja.
  let parok: { xml: KibontottSzamlaFajl; pdf: KibontottSzamlaFajl | null }[]
  let egyetlenXmlDokumentumId: string | null = null

  if (zipE) {
    const zipTartalom = await kibontSzamlaZip(nyersAdat)
    if (zipTartalom.error) return { eredmeny: null, error: zipTartalom.error }
    eredmeny.kihagyott.push(...zipTartalom.kihagyott)

    const parositas = parositSzamlaFajlok(zipTartalom.fajlok)
    parok = parositas.parok
    for (const arva of parositas.arvaPdfek) {
      // Árva PDF-et NEM töltünk fel automatikusan: nincs hozzá anaf_uuid
      // kulcs, így az ismételt feldolgozás némán duplikálná (fail-closed:
      // inkább jelezzük, és a felhasználó kézzel tölti fel, ha kell).
      eredmeny.kihagyott.push(
        `${arva.fajlnev} (PDF, nem található hozzá XML pár — kézzel feltölthető a dokumentumtárba)`,
      )
    }
    if (parok.length === 0) {
      eredmeny.hibak.push('A ZIP-ben nem található e-Factura számla-XML.')
      return { eredmeny, error: null }
    }
  } else {
    parok = [{ xml: { fajlnev: forras.file_name, tipus: 'xml', adat: nyersAdat }, pdf: null }]
    egyetlenXmlDokumentumId = forras.id
  }

  // ── UBL-kinyerés + validálás ──
  type Jelolt = {
    fajlnev: string
    anafUuid: string
    meta: UblSzamlaMeta
    penznem: string
    xml: KibontottSzamlaFajl
    pdf: KibontottSzamlaFajl | null
  }
  const jeloltek: Jelolt[] = []
  const dekoder = new TextDecoder('utf-8')

  for (const par of parok) {
    const meta = parseUblSzamla(dekoder.decode(par.xml.adat), anafUuidFajlnevbol(par.xml.fajlnev))
    if (meta.parseError) {
      eredmeny.hibak.push(`${par.xml.fajlnev}: ${meta.parseError}`)
      continue
    }
    if (meta.tipus === 'ismeretlen') {
      // 2026-08-28 (Endre hibajelzése): az ANAF aláírás-XML NEM hiba — kísérő
      // fájl. A fájlnév-szűrő (zip-kibonto, token-minta) a tipikus neveket a
      // kibontáskor már kiszűri; ez a GYÖKÉR-alapú háló a nem-szabványos
      // nevűeket fogja (Signature gyökér-elem), hogy egy sikeres import ne
      // mutasson piros hibákat.
      if (/signature/i.test(meta.gyokerNev || '') || SEMNATURA_TOKEN_RE.test(par.xml.fajlnev)) {
        eredmeny.kihagyott.push(`${par.xml.fajlnev} (ANAF aláírás-fájl — nem számla)`)
        continue
      }
      eredmeny.hibak.push(
        `${par.xml.fajlnev}: nem e-Factura számla-XML (a gyökér-elem nem Invoice/CreditNote).`,
      )
      continue
    }
    // 2026-09-03 (átvilágítás): ha sem az XML `cbc:UUID`-je, sem a fájlnév
    // 8+ jegyű futama nem ad azonosítót, a SZÁMLA IDENTITÁSÁBÓL képezünk
    // kulcsot (szállító CUI + számlaszám + kelte). Korábban itt a CSUPASZ
    // FÁJLNÉV lépett be — attól két különböző szállító `factura.xml`-je
    // azonos kulcsot kapott, és a második NÉMÁN elveszett.
    if (!meta.anafUuid) {
      meta.anafUuid = azonositoSzamlaIdentitasbol(
        meta.szallitoCui,
        meta.szamlaszam,
        meta.kiallitasDatum,
      )
    }
    if (!meta.anafUuid) {
      eredmeny.hibak.push(
        `${par.xml.fajlnev}: nincs azonosítható ANAF-azonosító, és a szállító adószáma / számlaszám / ` +
          'kelte közül is hiányzik valamelyik — azonosító nélkül nem rögzítjük, mert nem tudnánk ' +
          'megvédeni a kétszeres bevitel ellen.',
      )
      continue
    }
    if (meta.vegosszeg === null) {
      eredmeny.hibak.push(`${par.xml.fajlnev}: az XML-ből hiányzik a végösszeg (PayableAmount).`)
      continue
    }
    const penznem = (meta.penznem || '').trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(penznem)) {
      eredmeny.hibak.push(
        `${par.xml.fajlnev}: hiányzó vagy érvénytelen pénznem (DocumentCurrencyCode: ${meta.penznem || 'nincs'}).`,
      )
      continue
    }
    jeloltek.push({ fajlnev: par.xml.fajlnev, anafUuid: meta.anafUuid, meta, penznem, xml: par.xml, pdf: par.pdf })
  }

  if (jeloltek.length === 0) return { eredmeny, error: null }

  // ── Duplikátum-előszűrés egy körben ──
  const { data: letezok, error: letezoErr } = await supabase
    .from('szallitoi_szamla')
    .select('id, anaf_uuid, szamla_szam, xml_dokumentum_id, pdf_dokumentum_id')
    .eq('congregation_id', congId)
    .in('anaf_uuid', jeloltek.map((j) => j.anafUuid))
  if (letezoErr) {
    return { eredmeny: null, error: friendlyDbError('A duplikátum-ellenőrzés sikertelen', letezoErr) }
  }
  const letezoMap = new Map(
    ((letezok || []) as {
      id: string
      anaf_uuid: string
      szamla_szam: string | null
      xml_dokumentum_id: string | null
      pdf_dokumentum_id: string | null
    }[]).map((s) => [s.anaf_uuid, s]),
  )

  // A futáson BELÜLI ismétlődés is duplikátum (pl. ugyanaz a számla a ZIP
  // gyökerében és egy beágyazott ZIP-ben is).
  const futasonBelul = new Set<string>()

  for (const jelolt of jeloltek) {
    if (futasonBelul.has(jelolt.anafUuid)) {
      eredmeny.duplikatumok.push({
        fajlnev: jelolt.fajlnev,
        anafUuid: jelolt.anafUuid,
        szamlaSzam: jelolt.meta.szamlaszam,
        fajlPotolva: false,
      })
      continue
    }
    futasonBelul.add(jelolt.anafUuid)

    const letezo = letezoMap.get(jelolt.anafUuid)
    if (letezo) {
      // ── Duplikátum → nem duplikálunk, de a hiányzó fájl-hivatkozást pótoljuk ──
      let potolva = false
      if (!letezo.xml_dokumentum_id) {
        const xmlDokId = egyetlenXmlDokumentumId
          ? egyetlenXmlDokumentumId
          : await feltoltEsRegisztral(supabase, congId, userId, jelolt.xml, 'application/xml', eredmeny.hibak)
        if (xmlDokId) {
          const frissitesOk = await szamlaDokumentumFrissites(
            supabase, congId, letezo.id, 'xml_dokumentum_id', xmlDokId, eredmeny.hibak, jelolt.fajlnev,
          )
          potolva = potolva || frissitesOk
        }
      }
      if (!letezo.pdf_dokumentum_id && jelolt.pdf) {
        const pdfDokId = await feltoltEsRegisztral(supabase, congId, userId, jelolt.pdf, 'application/pdf', eredmeny.hibak)
        if (pdfDokId) {
          const frissitesOk = await szamlaDokumentumFrissites(
            supabase, congId, letezo.id, 'pdf_dokumentum_id', pdfDokId, eredmeny.hibak, jelolt.pdf.fajlnev,
          )
          potolva = potolva || frissitesOk
        }
      }
      eredmeny.duplikatumok.push({
        fajlnev: jelolt.fajlnev,
        anafUuid: jelolt.anafUuid,
        szamlaSzam: letezo.szamla_szam ?? jelolt.meta.szamlaszam,
        fajlPotolva: potolva,
      })
      continue
    }

    // ── Új számla-sor — ELŐBB az adatalap (az az érték), UTÁNA a fájlok ──
    const { data: ujSor, error: insertErr } = await supabase
      .from('szallitoi_szamla')
      .insert([
        {
          congregation_id: congId,
          anaf_uuid: jelolt.anafUuid,
          tipus: jelolt.meta.tipus === 'jovairo' ? 'jovairo' : 'szamla',
          szallito_nev: jelolt.meta.szallitoNev,
          szallito_cui: jelolt.meta.szallitoCui,
          szamla_szam: jelolt.meta.szamlaszam,
          kiallitas_datum: jelolt.meta.kiallitasDatum,
          fizetesi_hatarido: jelolt.meta.fizetesiHatarido,
          // A jóváíró is pozitívan tárolt (tipus jelzi) — abszolút érték.
          osszeg: Math.abs(jelolt.meta.vegosszeg as number),
          penznem: jelolt.penznem,
          xml_dokumentum_id: egyetlenXmlDokumentumId,
          created_by_profile_id: userId ?? null,
        },
      ])
      .select('id')
      .single()

    if (insertErr) {
      if (insertErr.code === '23505') {
        // Versenyhelyzet: két párhuzamos feldolgozás — a másik nyert, ez duplikátum.
        eredmeny.duplikatumok.push({
          fajlnev: jelolt.fajlnev,
          anafUuid: jelolt.anafUuid,
          szamlaSzam: jelolt.meta.szamlaszam,
          fajlPotolva: false,
        })
      } else {
        eredmeny.hibak.push(
          `${jelolt.fajlnev}: ${friendlyDbError('a számla-adatalap rögzítése sikertelen', insertErr)}`,
        )
      }
      continue
    }
    const szamlaId = (ujSor as { id: string }).id

    // ZIP-ből jött XML → külön dokumentumként a tárba, majd hivatkozás.
    // Hiba esetén a számla-sor MEGMARAD (az adat rögzült), a hibak tömb
    // hangosan szól, és az ismételt feldolgozás pótolja a fájlt.
    let pdfCsatolva = false
    if (!egyetlenXmlDokumentumId) {
      const xmlDokId = await feltoltEsRegisztral(supabase, congId, userId, jelolt.xml, 'application/xml', eredmeny.hibak)
      if (xmlDokId) {
        await szamlaDokumentumFrissites(
          supabase, congId, szamlaId, 'xml_dokumentum_id', xmlDokId, eredmeny.hibak, jelolt.fajlnev,
        )
      }
    }
    if (jelolt.pdf) {
      const pdfDokId = await feltoltEsRegisztral(supabase, congId, userId, jelolt.pdf, 'application/pdf', eredmeny.hibak)
      if (pdfDokId) {
        pdfCsatolva = await szamlaDokumentumFrissites(
          supabase, congId, szamlaId, 'pdf_dokumentum_id', pdfDokId, eredmeny.hibak, jelolt.pdf.fajlnev,
        )
      }
    }

    eredmeny.ujSzamlak.push({
      fajlnev: jelolt.fajlnev,
      szamlaSzam: jelolt.meta.szamlaszam,
      szallitoNev: jelolt.meta.szallitoNev,
      osszeg: Math.abs(jelolt.meta.vegosszeg as number),
      penznem: jelolt.penznem,
      pdfCsatolva,
    })
  }

  revalidatePath('/dokumentumtar')
  return { eredmeny, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 2) Lapozott számla-lista (kifizetve-szűrővel, kereséssel)
// ─────────────────────────────────────────────────────────────────

export async function listSzallitoiSzamlak(
  input: SzallitoiSzamlaListaInput = {},
): Promise<{ rows: SzallitoiSzamla[]; osszesen: number; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { rows: [], osszesen: 0, error: NINCS_GYULEKEZET }

  const oldalMeret = Math.min(Math.max(1, input.oldalMeret ?? DEFAULT_OLDAL_MERET), MAX_OLDAL_MERET)
  const oldal = Math.max(1, input.oldal ?? 1)
  const from = (oldal - 1) * oldalMeret
  const to = from + oldalMeret - 1
  const ascending = input.irany === 'asc'

  let query = supabase
    .from('szallitoi_szamla')
    .select('*', { count: 'exact' })
    .eq('congregation_id', congId)

  if (input.kifizetve === true) query = query.eq('kifizetve', true)
  else if (input.kifizetve === false) query = query.eq('kifizetve', false)

  const kereses = (input.kereses || '').trim()
  if (kereses) {
    // ilike-escape (% _ \) + a PostgREST .or() szintaxisát törő karakterek
    // (vessző, zárójel) eltávolítása — a keresés így is literális marad.
    const escaped = kereses
      .replace(/[,()]/g, ' ')
      .replace(/[\\%_]/g, (m) => `\\${m}`)
      .trim()
    if (escaped) {
      query = query.or(`szallito_nev.ilike.%${escaped}%,szamla_szam.ilike.%${escaped}%`)
    }
  }

  const { data, error, count } = await query
    .order('kiallitas_datum', { ascending, nullsFirst: false })
    .order('id', { ascending })
    .range(from, to)

  if (error) {
    return { rows: [], osszesen: 0, error: friendlyDbError('A számlák betöltése sikertelen', error) }
  }
  return { rows: (data || []) as SzallitoiSzamla[], osszesen: count ?? 0, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 3) Kifizetve-állapot váltása
// ─────────────────────────────────────────────────────────────────

/**
 * A számla kifizetve-állapotának átbillentése. A szűrő a JELENLEGI (ellentétes)
 * állapotra is illeszt — ha közben más már átállította, 0 sort érintünk, és
 * hangosan jelezzük (elveszett-frissítés elleni őr).
 */
export async function setSzamlaKifizetve(
  id: string,
  kifizetve: boolean,
): Promise<{ success: boolean; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { success: false, error: NINCS_GYULEKEZET }

  const { data, error } = await supabase
    .from('szallitoi_szamla')
    .update({ kifizetve, kifizetve_at: kifizetve ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('congregation_id', congId)
    .eq('kifizetve', !kifizetve)
    .select('id')
  if (error) {
    return { success: false, error: friendlyDbError('A kifizetve-állapot mentése sikertelen', error) }
  }
  if (!data || data.length === 0) {
    return {
      success: false,
      error: kifizetve
        ? 'A számla nem található, vagy már kifizetettként szerepel — frissítsd a listát.'
        : 'A számla nem található, vagy már kifizetetlenként szerepel — frissítsd a listát.',
    }
  }
  revalidatePath('/dokumentumtar')
  return { success: true, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 4) Számla ↔ kiadás kapcsolatok (több kiadás, összeg-résszel)
// ─────────────────────────────────────────────────────────────────

/**
 * A számla egy részösszegének hozzákapcsolása egy kiadáshoz. Hangos őr:
 * a részösszegek együtt nem haladhatják meg a számla összegét.
 */
export async function linkSzamlaKiadas(input: {
  szamlaId: string
  kiadasId: number
  osszegResz: number
}): Promise<{ kapcsolat: SzamlaKiadasKapcsolat | null; error: string | null }> {
  const { supabase, congId, userId } = await getCongId()
  if (!congId) return { kapcsolat: null, error: NINCS_GYULEKEZET }

  if (!Number.isFinite(input.osszegResz) || input.osszegResz <= 0) {
    return { kapcsolat: null, error: 'A kapcsolt összegnek 0-nál nagyobbnak kell lennie.' }
  }
  // 2 tizedesre kerekítve tárolunk (numeric(14,2)) — a fillér-összevetés stabil.
  const osszegResz = Math.round(input.osszegResz * 100) / 100

  const { data: szamla, error: szamlaErr } = await supabase
    .from('szallitoi_szamla')
    .select('id, osszeg, penznem')
    .eq('id', input.szamlaId)
    .eq('congregation_id', congId)
    .maybeSingle()
  if (szamlaErr) {
    return { kapcsolat: null, error: friendlyDbError('A számla lekérése sikertelen', szamlaErr) }
  }
  if (!szamla) return { kapcsolat: null, error: 'A számla nem található ebben a gyülekezetben.' }

  // A kiadás a saját gyülekezetből, élő (nem törölt, nem sztornózott) legyen —
  // törölt/sztornózott kiadáshoz kapcsolni félrevezető fedezet-számítást adna.
  const { data: kiadas, error: kiadasErr } = await supabase
    .from('kiadas')
    .select('id')
    .eq('id', input.kiadasId)
    .eq('congregation_id', congId)
    .eq('deleted', false)
    .eq('stornozott', false)
    .maybeSingle()
  if (kiadasErr) {
    return { kapcsolat: null, error: friendlyDbError('A kiadás lekérése sikertelen', kiadasErr) }
  }
  if (!kiadas) {
    return { kapcsolat: null, error: 'A kiadás nem található (vagy törölt/sztornózott) — frissítsd a listát.' }
  }

  // Fillérre pontos fedezet-őr: a meglévő részek + az új rész ≤ számla-összeg.
  const { data: reszek, error: reszErr } = await supabase
    .from('szallitoi_szamla_kiadas')
    .select('osszeg_resz, kiadas:kiadas_id (deleted, stornozott)')
    .eq('szamla_id', input.szamlaId)
    .eq('congregation_id', congId)
  if (reszErr) {
    return { kapcsolat: null, error: friendlyDbError('A meglévő kapcsolatok lekérése sikertelen', reszErr) }
  }
  // ⚠️ 2026-09-03 (átvilágítás P1): a HALOTT kapcsolatok (törölt/sztornózott
  // kiadás) NEM foglalják a fedezetet. Enélkül egy elgépelt és utóbb
  // sztornózott kiadás örökre lezárta a számlát: az ÚJ, helyes kiadást már nem
  // lehetett hozzákapcsolni, és semmi nem árulta el, miért.
  const eddigFiller = ((reszek || []) as unknown as Array<{
    osszeg_resz: number
    kiadas: { deleted?: boolean | null; stornozott?: boolean | null } | null
  }>)
    .filter((r) => !(r.kiadas?.deleted || r.kiadas?.stornozott))
    .reduce((osszesen, r) => osszesen + Math.round(Number(r.osszeg_resz) * 100), 0)
  const szamlaOsszeg = Number((szamla as { osszeg: number }).osszeg)
  const ujOsszesenFiller = eddigFiller + Math.round(osszegResz * 100)
  if (ujOsszesenFiller > Math.round(szamlaOsszeg * 100)) {
    const maradek = (Math.round(szamlaOsszeg * 100) - eddigFiller) / 100
    return {
      kapcsolat: null,
      error: `A kapcsolt összegek (${(ujOsszesenFiller / 100).toFixed(2)}) meghaladnák a számla összegét (${szamlaOsszeg.toFixed(2)} ${(szamla as { penznem: string }).penznem}). Még kapcsolható: ${Math.max(0, maradek).toFixed(2)}.`,
    }
  }

  const { data, error } = await supabase
    .from('szallitoi_szamla_kiadas')
    .insert([
      {
        szamla_id: input.szamlaId,
        kiadas_id: input.kiadasId,
        congregation_id: congId,
        osszeg_resz: osszegResz,
        created_by_profile_id: userId ?? null,
      },
    ])
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') {
      return { kapcsolat: null, error: 'Ez a kiadás már hozzá van kapcsolva ehhez a számlához.' }
    }
    return { kapcsolat: null, error: friendlyDbError('A kapcsolat mentése sikertelen', error) }
  }
  revalidatePath('/dokumentumtar')
  return { kapcsolat: data as SzamlaKiadasKapcsolat, error: null }
}

/** Egy számla↔kiadás kapcsolat bontása. */
export async function unlinkSzamlaKiadas(
  kapcsolatId: string,
): Promise<{ success: boolean; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { success: false, error: NINCS_GYULEKEZET }

  const { data, error } = await supabase
    .from('szallitoi_szamla_kiadas')
    .delete()
    .eq('id', kapcsolatId)
    .eq('congregation_id', congId)
    .select('id')
  if (error) {
    return { success: false, error: friendlyDbError('A kapcsolat bontása sikertelen', error) }
  }
  if (!data || data.length === 0) {
    return { success: false, error: 'A kapcsolat nem található — lehet, hogy már bontották.' }
  }
  revalidatePath('/dokumentumtar')
  return { success: true, error: null }
}

/** Egy számla összes kiadás-kapcsolata, a kiadás alapadataival együtt. */
export async function listSzamlaKiadasKapcsolatok(
  szamlaId: string,
): Promise<{ rows: SzamlaKiadasKapcsolat[]; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { rows: [], error: NINCS_GYULEKEZET }

  const { data, error } = await supabase
    .from('szallitoi_szamla_kiadas')
    .select('*, kiadas:kiadas_id (id, datum, osszeg, nyugta, iratszam, atvevo)')
    .eq('szamla_id', szamlaId)
    .eq('congregation_id', congId)
    .order('created_at', { ascending: true })
  if (error) {
    return { rows: [], error: friendlyDbError('A kapcsolatok betöltése sikertelen', error) }
  }
  return { rows: (data || []) as SzamlaKiadasKapcsolat[], error: null }
}

// ─────────────────────────────────────────────────────────────────
// Köteg-párosítás állapot (2026-08-28, Endre UX-köre): egy oldalnyi számla
// MINDEN kapcsolatát egy körben — a listán így azonnal látszik, melyiknek
// van meg a párja a könyvelésben, és HOL (bank vagy kassza).
// ─────────────────────────────────────────────────────────────────

export async function listSzamlaParositasok(szamlaIds: string[]): Promise<{
  data: Record<string, SzamlaParositasBejegyzes[]>
  error: string | null
}> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { data: {}, error: NINCS_GYULEKEZET }
  if (!szamlaIds || szamlaIds.length === 0) return { data: {}, error: null }

  // A bank-nevek egyben (kis tábla).
  const { data: bankok, error: bankErr } = await supabase
    .from('bankszamlak')
    .select('id, bank_neve')
    .eq('congregation_id', congId)
  if (bankErr) {
    return { data: {}, error: friendlyDbError('A bankszámlák betöltése sikertelen', bankErr) }
  }
  const bankNevById = new Map(
    ((bankok || []) as Array<{ id: number; bank_neve: string }>).map((b) => [b.id, b.bank_neve]),
  )

  // ⚠️ A `.in()` szűrő az URL-be kerül — ~100 azonosító fölött a proxy 414-et
  // dob, és az őr „nem tudjuk igazolni"-t írna. 80-asával darabolunk, és a
  // hibát MINDIG továbbadjuk (a repó dokumentált hibaosztálya).
  const eredmeny: Record<string, SzamlaParositasBejegyzes[]> = {}
  for (let i = 0; i < szamlaIds.length; i += 80) {
    const szelet = szamlaIds.slice(i, i + 80)
    const { data, error } = await supabase
      .from('szallitoi_szamla_kiadas')
      // 2026-09-03 (átvilágítás P1): a `deleted`/`stornozott` zászlót IS lekérjük.
      // A szűrés SZÁNDÉKOSAN TS-ben történik, nem beágyazott PostgREST-szűrővel
      // (`!inner`): az ELREJTENÉ a sort, és a lelkész sosem tudná meg, hogy
      // bontania kell a kapcsolatot. Látszódnia kell — pirosan.
      .select('szamla_id, kiadas:kiadas_id (id, datum, osszeg, bankszamla_id, deleted, stornozott)')
      .in('szamla_id', szelet)
      .eq('congregation_id', congId)
    if (error) {
      return { data: {}, error: friendlyDbError('A párosítások betöltése sikertelen', error) }
    }
    for (const sor of (data || []) as unknown as Array<{
      szamla_id: string
      kiadas: {
        id: number
        datum: string | null
        osszeg: number
        bankszamla_id: number | null
        deleted?: boolean | null
        stornozott?: boolean | null
      } | null
    }>) {
      if (!sor.kiadas) continue
      const lista = eredmeny[sor.szamla_id] ?? (eredmeny[sor.szamla_id] = [])
      lista.push({
        kiadasId: sor.kiadas.id,
        datum: sor.kiadas.datum,
        osszeg: Number(sor.kiadas.osszeg) || 0,
        bankszamlaId: sor.kiadas.bankszamla_id,
        // HALOTT KAPCSOLAT: a kiadást azóta törölték vagy sztornózták.
        ervenytelen: !!sor.kiadas.deleted || !!sor.kiadas.stornozott,
        bankNev:
          sor.kiadas.bankszamla_id != null
            ? bankNevById.get(sor.kiadas.bankszamla_id) ?? `#${sor.kiadas.bankszamla_id}`
            : null,
      })
    }
  }
  return { data: eredmeny, error: null }
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
 * Egy kibontott fájl feltöltése a dokumentumtár-bucketbe + metaadat-sor
 * beszúrása ('szallitoi-szamlak' kategória, a kontraktus-úttal). Hiba esetén
 * a hibak tömbbe ír (hangosan), és null-t ad vissza; ha a metaadat-sor
 * beszúrása bukik, a már feltöltött objektumot kompenzálva törli (ne
 * maradjon árva fájl a privát bucketben).
 */
async function feltoltEsRegisztral(
  supabase: SupabaseKliens,
  congId: string,
  userId: string | null | undefined,
  fajl: KibontottSzamlaFajl,
  mime: string,
  hibak: string[],
): Promise<string | null> {
  const path = `${congId}/szallitoi-szamlak/${crypto.randomUUID()}-${sanitizeGydokFileName(fajl.fajlnev)}`

  const { error: uploadErr } = await supabase.storage
    .from(GYDOK_BUCKET)
    // A Uint8Array NÉZETET adjuk át (nem a mögöttes buffert!) — a jszip
    // adhat eltolt nézetet, a nyers buffer idegen bájtokat is vinne.
    .upload(path, fajl.adat, { contentType: mime, upsert: false })
  if (uploadErr) {
    hibak.push(`${fajl.fajlnev}: a fájl feltöltése a tárhelyre sikertelen: ${uploadErr.message}`)
    return null
  }

  const { data, error: insertErr } = await supabase
    .from('gyulekezeti_dokumentum')
    .insert([
      {
        congregation_id: congId,
        kategoria: 'szallitoi-szamlak',
        file_name: fajl.fajlnev,
        storage_path: path,
        mime_type: mime,
        meret_bytes: fajl.adat.byteLength,
        created_by_profile_id: userId ?? null,
      },
    ])
    .select('id')
    .single()
  if (insertErr) {
    // Kompenzáció: a feltöltött objektum törlése, hogy ne maradjon árva fájl.
    await supabase.storage.from(GYDOK_BUCKET).remove([path])
    hibak.push(
      `${fajl.fajlnev}: ${friendlyDbError('a dokumentum-bejegyzés rögzítése sikertelen', insertErr)}`,
    )
    return null
  }
  return (data as { id: string }).id
}

/**
 * A számla-sor xml_/pdf_dokumentum_id mezőjének beállítása. A szűrő a mező
 * NULL voltára is illeszt — versenyhelyzetben nem írunk felül meglévő
 * hivatkozást. 0 érintett sor = hangos jelzés a hibak tömbben.
 */
async function szamlaDokumentumFrissites(
  supabase: SupabaseKliens,
  congId: string,
  szamlaId: string,
  mezo: 'xml_dokumentum_id' | 'pdf_dokumentum_id',
  dokumentumId: string,
  hibak: string[],
  fajlnev: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('szallitoi_szamla')
    .update({ [mezo]: dokumentumId })
    .eq('id', szamlaId)
    .eq('congregation_id', congId)
    .is(mezo, null)
    .select('id')
  if (error) {
    hibak.push(`${fajlnev}: a fájl-hivatkozás mentése sikertelen: ${error.message}`)
    return false
  }
  if (!data || data.length === 0) {
    hibak.push(`${fajlnev}: a fájl-hivatkozás nem került mentésre (a számlához már tartozik fájl).`)
    return false
  }
  return true
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
