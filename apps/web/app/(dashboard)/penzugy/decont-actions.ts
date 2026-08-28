'use server'

/**
 * Decont (elszámolás) — server akciók.
 *
 * A decont az UTÓLAG előkerülő számlák hivatalos rögzítésére szolgál.
 * Mivel a könyvelés nem enged korábbi dátumra rögzíteni, a tételek az
 * AKTUÁLIS (decont) dátumra kerülnek könyvelésre `kiadas` rekordként —
 * a számla saját (régi) dátuma csak a nyomtatott dokumentumon jelenik meg.
 *
 * Sorszámozás: gyülekezetenként + évente 1-től (penzugyi_bizonylat_sorszam
 * tábla + next_bizonylat_szam RPC). Lásd:
 *   migration-docs/sql/2026-06-06-decont-dispozitie-sorszam.sql
 *
 * Csak congregation scope-on érhető el (a decont gyülekezeti bizonylat).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-08-17 (kerületi S5): AZ EGYHÁZKERÜLET SEM HASZNÁLJA — SZÁNDÉKOSAN
 * ═══════════════════════════════════════════════════════════════════════════
 * A modul MIND AZ ÖT hatókör-kapuja `ctx.scope !== 'congregation'` alakú, tehát
 * a kerület — az egyházmegyéhez hasonlóan — KIMARAD, kód-változtatás nélkül. Ez
 * NEM véletlen, hanem a helyes viselkedés: a decont a gyülekezeti pénztáros és
 * a lelkész közötti előleg-elszámolás bizonylata, a sorszáma pedig a
 * `penzugyi_bizonylat_sorszam` táblából jön, aminek `congregation_id` a
 * hatóköre (nincs megyei/kerületi számsora). A felső szintek a saját
 * kiadásaikat közvetlenül a `diocese_kiadas` / `district_kiadas` táblába
 * könyvelik.
 *
 * ⚠️ HA EZ VALAHA MEGVÁLTOZIK: az öt kapu közül a `saveDecont`-ban lévő az
 * egyetlen ÍRÓ — a másik négy néma üres listát / `1`-es sorszámot ad. Egy
 * felső szintre nyitás tehát NEM egyetlen `if` átírása: kell hozzá szintenkénti
 * bizonylat-számsor és a `kiadas`/`befizetes` táblanevek térképre cserélése
 * (`tablesFor`), különben a kerületi decont a GYÜLEKEZETI könyvekbe írna.
 */

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { localTodayIso } from '@kartoteka/validations'
import {
  financeWriteBlock,
  getFinanceScopeContext,
  isYearFinalized,
  yearFinalizedCheckErrorMessage,
} from '@/lib/auth/finance-scope'

/**
 * 2026-08-11 (K5-#11): a kapott előleg VISSZAVÉTELÉNEK kanonikus jogcíme.
 *
 * A modul saját hivatalos útmutatója (components/finance/penzugy-help.tsx,
 * „Hitelek (107 / 207)" fejezet) így rendelkezik:
 *   - 207.02 „Kiadott hitelek": „Elszámolásra előlegként kifizetett összeget ide
 *     könyvelünk." (az előleg KIADÁSAKOR — a gyakorlatban Dispoziție de plată-val)
 *   - 107.02 „Visszakapott hitelek": „…ha elszámolásra előleget ad ki,
 *     elszámoláskor itt vesszük vissza és a kiadásokat a megfelelő helyre
 *     könyveljük." (az elszámoláskor, azaz a decontnál)
 */
const DECONT_ELOLEG_VISSZAVET_KOD = '107.02'

export interface DecontItemInput {
  actNr: string
  actType: string
  actDate: string // a számla saját dátuma (csak dokumentum)
  issuer: string
  explanation: string
  amount: number
  id_kiadascel?: number | null
}

export interface SaveDecontInput {
  date: string // yyyy-mm-dd — könyvelési (decont) dátum
  personName: string
  jelleg: string
  approvedBy: string
  advance: number
  defaultCategoryId: number // alap kiadás-kategória (id_kiadascel)
  items: DecontItemInput[]
}

/** A következő decont-sorszám MEGTEKINTÉSE (nem foglalja le). */
export async function getNextDecontNumber(year: number): Promise<number> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return 1
  if (ctx.scope !== 'congregation') return 1
  const { data } = await ctx.supabase
    .from('penzugyi_bizonylat_sorszam')
    .select('utolso_szam')
    .eq('congregation_id', ctx.scopeId)
    .eq('ev', year)
    .eq('tipus', 'decont')
    .maybeSingle()
  const last = (data as { utolso_szam?: number } | null)?.utolso_szam ?? 0
  return last + 1
}

export interface DecontListItem {
  id: string
  sorszam: number
  datum: string
  elszamolo_nev: string
  osszkoltseg: number
}

/** Mentett decontok listája (újranyomtatáshoz). */
export async function listDeconts(year: number): Promise<DecontListItem[]> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx || ctx.scope !== 'congregation') return []
  const { data } = await ctx.supabase
    .from('decont')
    .select('id, sorszam, datum, elszamolo_nev, osszkoltseg')
    .eq('congregation_id', ctx.scopeId)
    .eq('ev', year)
    .eq('deleted', false)
    .order('sorszam', { ascending: true })
  return ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    sorszam: Number(r.sorszam),
    datum: String(r.datum).slice(0, 10),
    elszamolo_nev: String(r.elszamolo_nev || ''),
    osszkoltseg: Number(r.osszkoltseg) || 0,
  }))
}

export interface DecontReprintData {
  sorszam: number
  date: string
  personName: string
  jelleg: string
  approvedBy: string
  advance: number
  items: Array<{ actNr: string; actType: string; actDate: string; issuer: string; explanation: string; amount: number }>
}

/** Egy mentett decont adatai a hű újranyomtatáshoz (a snapshot jsonb-ből). */
export async function getDecontForReprint(id: string): Promise<DecontReprintData | null> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx || ctx.scope !== 'congregation') return null
  const { data } = await ctx.supabase
    .from('decont')
    .select('sorszam, datum, elszamolo_nev, jovahagyta, jelleg, kapott_eloleg, tetelek')
    .eq('id', id)
    .eq('congregation_id', ctx.scopeId)
    .maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  const tetelek = Array.isArray(r.tetelek) ? (r.tetelek as Record<string, unknown>[]) : []
  return {
    sorszam: Number(r.sorszam),
    date: String(r.datum).slice(0, 10),
    personName: String(r.elszamolo_nev || ''),
    jelleg: String(r.jelleg || ''),
    approvedBy: String(r.jovahagyta || ''),
    advance: Number(r.kapott_eloleg) || 0,
    items: tetelek.map((t) => ({
      actNr: String(t.act_nr || ''),
      actType: String(t.act_type || ''),
      actDate: String(t.act_date || ''),
      issuer: String(t.issuer || ''),
      explanation: String(t.explanation || ''),
      amount: Number(t.amount) || 0,
    })),
  }
}

export interface DecontReprintOption {
  id: string
  label: string
  data: DecontReprintData
}

/** Mentett decontok teljes adata + címke a Nyomtatási központ újranyomtatásához. */
export async function listDecontReprint(year: number): Promise<DecontReprintOption[]> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx || ctx.scope !== 'congregation') return []
  const { data } = await ctx.supabase
    .from('decont')
    .select('id, sorszam, datum, elszamolo_nev, jovahagyta, jelleg, kapott_eloleg, osszkoltseg, tetelek')
    .eq('congregation_id', ctx.scopeId)
    .eq('ev', year)
    .eq('deleted', false)
    .order('sorszam', { ascending: true })
  const saved: DecontReprintOption[] = ((data || []) as Record<string, unknown>[]).map((r) => {
    const tetelek = Array.isArray(r.tetelek) ? (r.tetelek as Record<string, unknown>[]) : []
    const datum = String(r.datum).slice(0, 10)
    return {
      id: String(r.id),
      label: `#${r.sorszam} · ${datum} · ${String(r.elszamolo_nev || '—')}`,
      data: {
        sorszam: Number(r.sorszam),
        date: datum,
        personName: String(r.elszamolo_nev || ''),
        jelleg: String(r.jelleg || ''),
        approvedBy: String(r.jovahagyta || ''),
        advance: Number(r.kapott_eloleg) || 0,
        items: tetelek.map((t) => ({
          actNr: String(t.act_nr || ''),
          actType: String(t.act_type || ''),
          actDate: String(t.act_date || ''),
          issuer: String(t.issuer || ''),
          explanation: String(t.explanation || ''),
          amount: Number(t.amount) || 0,
        })),
      },
    }
  })

  // IMPORTÁLT decont-típusú tételek (irattípus „decont…") — külön decont rekord nélkül,
  // egy 1-soros elszámolásként megjelenítve/újranyomtatva.
  const { data: kiaDec } = await ctx.supabase
    .from('kiadas')
    .select('id, datum, osszeg, iratszam, atvevo, megjegyzes')
    .eq('congregation_id', ctx.scopeId)
    .eq('deleted', false)
    .ilike('irattipus', '%decont%')
    .gte('datum', `${year}-01-01`)
    .lt('datum', `${year + 1}-01-01`)
    .order('datum', { ascending: true })
  const imported: DecontReprintOption[] = ((kiaDec || []) as Record<string, unknown>[]).map((r) => {
    const datum = String(r.datum).slice(0, 10)
    const name = String(r.atvevo || '—')
    const sorszam = Number(String(r.iratszam || '').replace(/\D/g, '')) || 0
    const explanation = String(r.megjegyzes || '')
    return {
      id: `imp-k-${r.id}`,
      label: `#${sorszam || '—'} · ${datum} · ${name} · importált`,
      data: {
        sorszam,
        date: datum,
        personName: name,
        jelleg: '',
        approvedBy: '',
        advance: 0,
        items: [
          {
            actNr: String(r.iratszam || ''),
            actType: 'Decont',
            actDate: datum,
            issuer: name,
            explanation,
            amount: Number(r.osszeg) || 0,
          },
        ],
      },
    }
  })

  return [...saved, ...imported]
}

export async function saveDecont(input: SaveDecontInput): Promise<
  { success: true; sorszam: number; decontId: string } | { error: string }
> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU. Ma redundáns (a decont gyülekezeti
  // funkció, ott a `readOnly` mindig false), de SZÁNDÉKOSAN itt marad: ha a
  // decont valaha felső szintű (megyei/kerületi) hatókört is kap, a kapu már a
  // helyén van, és nem egy néma 0-soros mentés hívja fel rá a figyelmet.
  const writeBlock = financeWriteBlock(ctx)
  if (writeBlock) return writeBlock
  // A kapu SZÁNDÉKOSAN a gyülekezeti sajátosságot nevezi meg: így MINDEN felső
  // szint (egyházmegye ÉS 2026-08-17 óta egyházkerület) egyformán kimarad —
  // egy új szint nem eshet be némán a gyülekezeti könyvelésbe.
  if (ctx.scope !== 'congregation') {
    return { error: 'A decont csak gyülekezeti módban érhető el.' }
  }

  // Alap-validáció
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: 'Érvénytelen dátum.' }
  // 2026-07-10 (S3-#9): jövőbeli dátum tiltása — ugyanaz a szabály, mint az
  // incomeSchema zod-refine-ja (lib/validations/finance.ts: datum <= today()).
  if (input.date > localTodayIso()) {
    return { error: 'Jövőbeli dátum nem engedélyezett' }
  }
  if (!input.personName.trim()) return { error: 'Az elszámoló neve kötelező.' }
  if (!input.defaultCategoryId) return { error: 'Válassz kiadás-kategóriát.' }

  const items = (input.items || []).filter(
    (r) => Number(r.amount) > 0 && (r.explanation.trim() || r.issuer.trim() || r.actNr.trim()),
  )
  if (items.length === 0) return { error: 'Legalább egy érvényes tétel szükséges.' }

  const year = Number(input.date.slice(0, 4))
  // 2026-08-11 (K5-#32, 2. lépés): az `isYearFinalized` fail-closed DOB, ha a
  // zár-állapotot nem tudja lekérdezni (elnyelt hiba sosem nyithat ki egy már
  // véglegesített és beküldött évet). Try/catch nélkül ez nyers szerver-action
  // hibaként bukott el; itt a modul szokásos `{ error: '…' }` alakjára fordítjuk,
  // hogy a lelkész magyar, cselekvésre váltható üzenetet lásson.
  let finalized: boolean
  try {
    finalized = await isYearFinalized(ctx, year)
  } catch (err) {
    return { error: yearFinalizedCheckErrorMessage(err, year) }
  }
  if (finalized) {
    return { error: `A ${year}. év számadása már le van zárva — decont nem rögzíthető. Kérj feloldást (javítási engedélyt) az egyházmegyétől.` }
  }

  const total = items.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const advance = Number(input.advance) || 0
  const kulonbozet = total - advance

  // 0) 2026-08-11 (K5-#11): a KAPOTT ELŐLEG visszavezetésének jogcíme.
  //
  // HIBA VOLT: a `kapott_eloleg` csak a decont FEJLÉCÉBE került, a 3) lépés pedig
  // a tételek TELJES összegét (`total`) könyvelte új készpénz-kiadásként — a
  // `kulonbozet` sehol nem jelent meg, ellentételező bevétel pedig nem keletkezett.
  // Következmény: 1000 lej előleg kiadva (207.02, kassza −1000), majd 1000 lejnyi
  // számláról decont → a rendszer MÉG EGYSZER −1000 lejt könyvelt. A Registru Casa
  // könyv szerinti egyenlege MINDEN decontnál az előleg összegével kevesebb lett,
  // mint a fizikai pénztár.
  //
  // A jogcím-feloldás SZÁNDÉKOSAN a sorszám-foglalás ELŐTT fut: így egy hiányzó
  // 107.02 kategória nem éget el egy decont-sorszámot a hivatalos sorozatból.
  let elolegCelId: number | null = null
  if (advance > 0) {
    const { data: celRow, error: celErr } = await ctx.supabase
      .from('befizetescel')
      .select('id')
      .eq('id_szamadasicel', DECONT_ELOLEG_VISSZAVET_KOD)
      .maybeSingle()
    if (celErr) {
      return { error: `A(z) ${DECONT_ELOLEG_VISSZAVET_KOD} bevételi jogcím lekérése sikertelen: ${celErr.message}` }
    }
    if (!celRow) {
      return {
        error:
          `Hiányzik a(z) ${DECONT_ELOLEG_VISSZAVET_KOD} („Visszakapott hitelek") bevételi kategória, ` +
          'ezért a kapott előleget nem tudjuk visszavezetni — a kassza egyenlege hibás lenne. ' +
          'Vedd fel a kategóriát a Pénzügy → Beállítások menüben, vagy írj 0-t a „Kapott előleg" mezőbe, ha nem volt előleg.',
      }
    }
    elolegCelId = Number((celRow as { id: number }).id)
  }

  // 1) Sorszám lefoglalása (atomikus RPC)
  const { data: szamData, error: szamErr } = await ctx.supabase.rpc('next_bizonylat_szam', {
    p_congregation_id: ctx.scopeId,
    p_ev: year,
    p_tipus: 'decont',
  })
  if (szamErr) return { error: `Sorszám hiba: ${szamErr.message}` }
  const sorszam = Number(szamData)

  // 2) Decont fejléc beszúrása (megkapjuk az id-t a kiadás-linkhez)
  const tetelekSnapshot = items.map((r) => ({
    act_nr: r.actNr,
    act_type: r.actType,
    act_date: r.actDate,
    issuer: r.issuer,
    explanation: r.explanation,
    amount: Number(r.amount) || 0,
    id_kiadascel: r.id_kiadascel || input.defaultCategoryId,
  }))

  const { data: decontRow, error: decontErr } = await ctx.supabase
    .from('decont')
    .insert([
      {
        congregation_id: ctx.scopeId,
        ev: year,
        sorszam,
        datum: input.date,
        elszamolo_nev: input.personName.trim(),
        jovahagyta: input.approvedBy?.trim() || null,
        jelleg: input.jelleg?.trim() || null,
        kapott_eloleg: advance,
        osszkoltseg: total,
        kulonbozet,
        tetelek: tetelekSnapshot,
        created_by: ctx.userId,
      },
    ])
    .select('id')
    .single()

  if (decontErr) return { error: `Decont mentés hiba: ${decontErr.message}` }
  const decontId = (decontRow as { id: string }).id

  // 3) Tételek könyvelése kiadásként az AKTUÁLIS (decont) dátumra
  for (let i = 0; i < items.length; i += 1) {
    const r = items[i]
    const docNum = (r.actNr || `Decont ${sorszam}`).slice(0, 40)
    const payload = {
      osszeg: Number(r.amount) || 0,
      datum: input.date,
      id_kiadascel: r.id_kiadascel || input.defaultCategoryId,
      iratszam: docNum,
      irattipus: 'Készpénz',
      megjegyzes: `Decont #${sorszam}/${year} — ${r.explanation || ''}`.trim(),
      deleted: false,
      congregation_id: ctx.scopeId,
      nyugta: docNum,
      xkey: randomUUID(),
      atvevo: r.issuer || 'Decont',
      userid: ctx.userId,
      decont_id: decontId,
    }
    const { error: kErr } = await ctx.supabase.from('kiadas').insert([payload])
    if (kErr) {
      // Visszagörgetés: a már beszúrt kiadások + a decont törlése
      await ctx.supabase.from('kiadas').update({ deleted: true }).eq('decont_id', decontId)
      await ctx.supabase.from('decont').update({ deleted: true }).eq('id', decontId)
      return { error: `${i + 1}. tétel könyvelése sikertelen: ${kErr.message}` }
    }
  }

  // 4) 2026-08-11 (K5-#11): a KAPOTT ELŐLEG visszavezetése a 107.02 jogcímre.
  //
  // Az előleg kiadásakor a kassza már csökkent (207.02 „Kiadott hitelek"), a 3)
  // lépés pedig a tételek teljes összegével MÉG EGYSZER csökkenti. Ez a
  // készpénz-bevétel veszi vissza az előleget, így a kassza NETTÓ változása
  // −(total − advance) = −kulonbozet lesz, ami pontosan a fizikai pénzmozgás
  // (a különbözetet a pénztáros fizeti ki, illetve negatív különbözetnél az
  // elszámoló adja vissza).
  //
  // A `befizetes` táblában NINCS `decont_id` oszlop (csak a `kiadas`-ban), ezért
  // a kapcsolat a megjegyzésen + a lentebb elkapott soron át él. Ha valaha
  // bekerül a `befizetes.decont_id`, ide is be kell tenni.
  //
  // iratszam === nyugta SZÁNDÉKOS: a nyugtafigyelő (extractNumberedReceiptRows)
  // és a gyülekezeti nyugtaszám-generátor is kihagyja a „tükrözött" sorokat, így
  // ez a technikai bevétel nem tolja el a hivatalos nyugta-sorozatot.
  if (advance > 0 && elolegCelId) {
    const docNum = `DEC-${sorszam}/${year}`
    const { error: bErr } = await ctx.supabase.from('befizetes').insert([
      {
        osszeg: advance,
        datum: input.date,
        id_befizetescel: elolegCelId,
        id_szemely: null,
        id_csalad: null,
        csalad: false,
        forrasa: input.personName.trim(),
        iratszam: docNum,
        nyugta: docNum,
        irattipus: 'Készpénz',
        fizetettev: year,
        megjegyzes: `Decont #${sorszam}/${year} — kapott előleg visszavezetése (${DECONT_ELOLEG_VISSZAVET_KOD})`,
        deleted: false,
        congregation_id: ctx.scopeId,
        xkey: randomUUID(),
        userid: ctx.userId,
      },
    ])
    if (bErr) {
      // Visszagörgetés: fél elszámolás NEM maradhat — a kassza egyenlege
      // különben pont az előleg összegével csúszna el.
      await ctx.supabase.from('kiadas').update({ deleted: true }).eq('decont_id', decontId)
      await ctx.supabase.from('decont').update({ deleted: true }).eq('id', decontId)
      return {
        error:
          `A kapott előleg visszavezetése (${DECONT_ELOLEG_VISSZAVET_KOD}) nem sikerült, ezért az egész ` +
          `elszámolást visszavontuk — így a kassza egyenlege helyes marad. Próbáld újra (részlet: ${bErr.message}).`,
      }
    }
  }

  revalidatePath('/penzugy')
  return { success: true, sorszam, decontId }
}
