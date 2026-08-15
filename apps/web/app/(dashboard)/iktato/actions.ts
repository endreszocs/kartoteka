'use server'

import { revalidatePath } from 'next/cache'
import { selectAllPaged } from '@kartoteka/supabase-client'
import { filingEntrySchema, type FilingEntryInput } from '@/lib/validations/filing'
import type { FilingEntry, IktatoYearlyClosure } from '@/lib/constants/filing'
// 2026-08-10 (K4 iktatószám-diagnosztika #5): egyetlen, pointer-tudatos
// előnézet-implementáció — a korábbi két külön MAX+1 másolat helyett.
import { computeSequencePreview, readSequencePointer } from '@/lib/filing/sequence-preview'
import type { SequencePreview, SequenceScopeKey } from '@/lib/filing/sequence-preview'
// 2026-08-15 (egyházmegyei szint, S4): a hatókör a KÖZÖS module-scope helperből
// jön (gyülekezet VAGY egyházmegye) — minden lekérdezés `.eq(ctx.scopeCol,
// ctx.scopeId)`-vel szűr, a sorszám-kiosztás pedig scope-onként külön számsoron
// fut (next_iktato_sequence / next_iktato_sequence_dio RPC).
import {
  getModuleScopeContext,
  moduleWriteBlock,
  type ModuleScopeContext,
} from '@/lib/auth/module-scope'

/** A régi `getCongId()` scope-tudatos utódja — ctx === null: nincs hatókör. */
async function getScopeCtx(): Promise<{ ctx: ModuleScopeContext | null }> {
  const res = await getModuleScopeContext()
  if ('error' in res) return { ctx: null }
  return { ctx: res }
}

/** A scope-kulcs a sequence-preview modul számláló-olvasóihoz. */
function scopeKeyOf(ctx: ModuleScopeContext): SequenceScopeKey {
  return { col: ctx.scopeCol, id: ctx.scopeId }
}

export async function getFilingEntries(year: number, direction: string): Promise<FilingEntry[]> {
  const { ctx } = await getScopeCtx()
  if (!ctx) return []
  const { supabase } = ctx
  // 2026-07-17 (F6): a PostgREST alapértelmezetten legfeljebb 1000 sort ad
  // vissza kérésenként — egy 1000+ iratos évnél a lista, a keresés ÉS az
  // iktatókönyv-nyomtatás is némán csonkulna (K6 óta mindig direction='all'
  // töltődik, az irány-szűrés kliens-oldali). Ezért 1000-es range-oldalakban
  // lapozunk, amíg rövid oldal nem érkezik (F4-minta: munkanaplo/actions.ts
  // getWorklogs). A másodlagos .order('id') a determinisztikus lapozáshoz
  // kell: nélküle az oldalhatáron sor maradhatna ki vagy duplázódhatna.
  // 2026-08-11 (5. kör, P3 #15): a kézi ciklus helyett a KÖZÖS `selectAllPaged`.
  // A régi stop-feltétel (`page.length < PAGE_SIZE`) HIBÁS volt: ha a Supabase
  // „Max Rows" 1000 alá kerül, a szerver a kért 1000-es lapra kevesebbet ad, és
  // az iktatókönyv az ELSŐ lap után megállt volna — némán a felét listázva és
  // nyomtatva. `orderColumn: null`, mert a rendezés itt DIREKT fordított
  // (sequence_number DESC, id DESC) és az `id` már egyedi döntetlen-bontó.
  let query = supabase.from('iktato').select('*').eq(ctx.scopeCol, ctx.scopeId).eq('year', year).eq('deleted', false)
  if (direction === 'incoming' || direction === 'outgoing') query = query.eq('direction', direction)
  const { data, error } = await selectAllPaged<FilingEntry>(
    query.order('sequence_number', { ascending: false }).order('id', { ascending: false }),
    { orderColumn: null, dedupeBy: 'id' },
  )
  if (error) {
    // A meglévő kontraktus szerint hiba esetén üres lista megy vissza —
    // részleges (csonka) listát viszont NEM adunk, az lenne a néma csonkulás.
    console.warn('[getFilingEntries] lekérdezés hiba:', error.message)
    return []
  }
  return data
}

/**
 * Preview-becslés a következő iktato-sorszámra. **NEM atomic** — két párhuzamos
 * hívás ugyanazt a számot adhatja. Csak UI-előnézethez használható, az
 * INSERT-nél a `next_iktato_sequence` SECURITY DEFINER RPC-t kell hívni
 * (lásd `saveFilingEntry`, DIAGNOSTICS P3-5).
 *
 * 2026-08-10 (K4 iktatószám-diagnosztika #5): a becslés mostantól POINTER-TUDATOS
 * — `GREATEST(pointer, MAX) + 1` —, mert a kiosztás a pointerből dolgozik, a
 * régi `MAX+1` pedig egy sikertelen INSERT után TARTÓSAN alábecsülte a számot.
 */
export async function getNextSequenceNumber(year: number): Promise<number> {
  const { ctx } = await getScopeCtx()
  if (!ctx) return 1
  const preview = await computeSequencePreview(ctx.supabase, scopeKeyOf(ctx), year)
  return preview.sequenceNumber
}

/**
 * A következő iktatószám ELŐNÉZETE, kanonikus `${year}/${n}` alakban is.
 *
 * Ez a KÖZÖS előnézet-akció: az iktató-varázsló, az „Igazolás / levél
 * kiállítása" dialógus és a sablon-generátor is ezt hívja — így ugyanazt a
 * számot látják. NEM foglal számot (nem hívja a `next_iktato_sequence` RPC-t);
 * a végleges szám mindig a `saveFilingEntry` által visszaadott
 * `sequenceNumber`, és eltérés esetén AZ a mérvadó.
 */
export async function getNextFilingNumberPreview(
  year: number,
): Promise<SequencePreview & { error: string | null }> {
  const { ctx } = await getScopeCtx()
  if (!ctx) {
    return { year, sequenceNumber: 0, iratszam: '', pointerVisible: false, error: 'Nincs aktív gyülekezet vagy egyházmegye.' }
  }
  const preview = await computeSequencePreview(ctx.supabase, scopeKeyOf(ctx), year)
  return { ...preview, error: null }
}

// ─── 2026-07-25: Visszamenőleges iktatás (kézi sorszám a számláló alatt) ───
//
// A pointer-olvasás 2026-08-10 óta a megosztott lib/filing/sequence-preview
// modulban él (readSequencePointer) — a visszamenőleges kapu SZÁNDÉKOSAN a
// NYERS pointert használja, nem a GREATEST-előnézetet (lásd az ottani doksit).

/**
 * Visszamenőleges iktatáshoz: a jelenlegi sorszám-számláló (pointer) állása és
 * az ALATTA lévő szabad (ki nem osztott) sorszámok. Biztonsági elv: az automata
 * sorszámozás (next_iktato_sequence RPC) csak felfelé lépked, ezért a pointer
 * alatti szabad számokat sosem osztja ki újra → a kézi kiadásuk nem okozhat
 * jövőbeli ütközést. A `szabadSzamok` az első legfeljebb 30 szabad szám
 * (növekvően), az `osszesSzabad` a teljes darabszám.
 */
export async function getRetroactiveInfo(year: number): Promise<{
  pointer: number
  szabadSzamok: number[]
  osszesSzabad: number
  error: string | null
}> {
  const { ctx } = await getScopeCtx()
  if (!ctx) {
    return { pointer: 0, szabadSzamok: [], osszesSzabad: 0, error: 'Nincs bejelentkezett felhasználó.' }
  }
  const { supabase } = ctx
  const pointer = await readSequencePointer(supabase, scopeKeyOf(ctx), year)
  if (pointer <= 0) {
    return {
      pointer: 0,
      szabadSzamok: [],
      osszesSzabad: 0,
      error: 'Visszamenőleges iktatáshoz előbb legyen legalább egy automatikus iktatás ebben az évben.',
    }
  }
  // Foglaltnak CSAK a nem törölt sorok számítanak: a partial unique index
  // (iktato_unique_active_cong_year_seq, WHERE deleted = false — lásd a
  // 2026-05-17-es SQL-t) a törölt sor számát újra kiadhatóvá teszi.
  // 2026-08-11 (5. kör, P3 #15): KÖZÖS `selectAllPaged` a kézi ciklus helyett.
  // A régi `page.length < PAGE_SIZE` stop-feltétel leszállított szerver-plafonnál
  // az első lap után kilépett volna — a foglalt sorszámok fele „szabadnak"
  // látszott volna, és a lelkész egy MÁR KIADOTT iktatószámot kapott volna
  // felajánlva. A rendezés a hívónál marad (`orderColumn: null`).
  const { data: occupiedRows, error } = await selectAllPaged<{ sequence_number: number }>(
    supabase
      .from('iktato')
      .select('sequence_number')
      .eq(ctx.scopeCol, ctx.scopeId)
      .eq('year', year)
      .eq('deleted', false)
      .order('sequence_number', { ascending: true })
      .order('id', { ascending: true }),
    { orderColumn: null },
  )
  if (error) {
    return {
      pointer,
      szabadSzamok: [],
      osszesSzabad: 0,
      error: `A foglalt sorszámok lekérése sikertelen: ${error.message}`,
    }
  }
  const occupied = new Set<number>()
  for (const row of occupiedRows) occupied.add(row.sequence_number)
  // Szabad = az 1..pointer tartomány nem foglalt számai. Az első 30 növekvően
  // (a chip-lista ebből mutat ~15-öt), a teljes darabszám számítással.
  const szabadSzamok: number[] = []
  for (let n = 1; n <= pointer && szabadSzamok.length < 30; n++) {
    if (!occupied.has(n)) szabadSzamok.push(n)
  }
  let foglaltAPointerAlatt = 0
  for (const n of occupied) {
    if (n >= 1 && n <= pointer) foglaltAPointerAlatt++
  }
  const osszesSzabad = Math.max(0, pointer - foglaltAPointerAlatt)
  return { pointer, szabadSzamok, osszesSzabad, error: null }
}

export async function saveFilingEntry(data: FilingEntryInput) {
  const parsed = filingEntrySchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { ctx } = await getScopeCtx()
  if (!ctx) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-08-15 (S4): a számvevő ellenőr — a felület is letiltja, de a
  // szerver-oldali kapu a mérvadó (beszédes magyar üzenet nyers RLS-hiba helyett).
  const blocked = moduleWriteBlock(ctx)
  if (blocked) return { error: blocked.error }
  const { supabase } = ctx
  const d = parsed.data
  const year = new Date(d.kelt).getFullYear()

  // 2026-05-29 Fázis 3: lezárt évre tilos új bejegyzést felvenni vagy meglévőt módosítani.
  const { data: closure } = await supabase
    .from('iktato_yearly_closures')
    .select('closed_at')
    .eq(ctx.scopeCol, ctx.scopeId)
    .eq('year', year)
    .maybeSingle()
  if (closure) {
    return {
      error: `A ${year}-es iktatókönyv ${closure.closed_at?.slice(0, 10)} óta lezárt — nem lehet új bejegyzést felvenni vagy módosítani. Lezárás feloldása csak admin/master jogosultsággal lehetséges.`,
    }
  }

  const record: Record<string, unknown> = {
    direction: d.direction, kelt: d.kelt, subject: d.subject,
    sender_or_recipient: d.sender_or_recipient || null,
    file_folder: d.file_folder || null,
    targykivonat: d.targykivonat || null, elintezes_ideje: d.elintezes_ideje || null,
    elintezes_modja: d.elintezes_modja || null, irattarijel: d.irattarijel || null,
    // 2026-08-15 (S4): a scope-oszlop dinamikus (congregation_id VAGY
    // diocese_id) — a DB-oldali CHECK (iktato_pontosan_egy_scope) őrzi, hogy
    // pontosan az egyik legyen kitöltve.
    megjegyzes: d.megjegyzes || null, deleted: false, [ctx.scopeCol]: ctx.scopeId, year,
    // 2026-05-28: EREK 2024-es ügykörjegyzék szerinti új mezők
    external_ref_szam: d.external_ref_szam || null,
    external_ref_kelt: d.external_ref_kelt || null,
    beerkezes_ideje: d.beerkezes_ideje || null,
    mellekletek_szama: d.mellekletek_szama ?? null,
    valasz_iktatoszam: d.valasz_iktatoszam || null,
    ugykor_kod: d.ugykor_kod || null,
    retention_type: d.retention_type || null,
    // 2026-05-29 Fázis 3: másodpéldány-flag
    has_duplicate: d.has_duplicate ?? false,
  }
  if (d.id) {
    const { error } = await supabase.from('iktato').update(record).eq('id', d.id).eq(ctx.scopeCol, ctx.scopeId)
    if (error) return { error: `Hiba: ${error.message}` }
  } else if (d.manualSequenceNumber != null) {
    // ── 2026-07-25: VISSZAMENŐLEGES iktatás kézi sorszámmal (csak ÚJ iratra) ──
    // Biztonsági elv: kézi szám CSAK a sorszám-számláló (pointer) ALATTI
    // tartományból adható ki — az automata (next_iktato_sequence RPC) csak
    // felfelé lépked, így az alatta lévő szabad számokat sosem osztja ki újra
    // → nincs jövőbeli ütközés. A pointer ITT NEM változik (nincs RPC-hívás)!
    const manualSeq = d.manualSequenceNumber
    const pointer = await readSequencePointer(supabase, scopeKeyOf(ctx), year)
    if (pointer <= 0) {
      return { error: 'Visszamenőleges iktatáshoz előbb legyen legalább egy automatikus iktatás ebben az évben.' }
    }
    if (manualSeq > pointer) {
      return {
        error: `Visszamenőleg csak a jelenlegi számláló (${pointer}) alatti szabad számok adhatók ki — a jövőbeli számokat az automatikus sorszámozás osztja.`,
      }
    }
    record.sequence_number = manualSeq
    const { error } = await supabase.from('iktato').insert([record])
    if (error) {
      // 23505 = unique_violation — az iktato_unique_active_cong_year_seq
      // partial unique index (deleted=false) utasította el a duplikátumot.
      if (error.code === '23505') {
        return { error: `A ${year}/${manualSeq} iktatószám már foglalt — válassz másik szabad számot.` }
      }
      return { error: `Hiba: ${error.message}` }
    }
    revalidatePath('/iktato')
    // Az insert-ág meglévő visszatérési alakja (lásd az automata ág megjegyzését).
    return { success: true, year, sequenceNumber: manualSeq }
  } else {
    // DIAGNOSTICS P3-5: atomic per-(scope, year) sorszám az RPC-ből.
    // A korábbi `getNextSequenceNumber(year)` SELECT MAX + INSERT két lépéses
    // mintát használt — két párhuzamos hívás ugyanazt a sorszámot kaphatta.
    // Az RPC INSERT...ON CONFLICT DO UPDATE RETURNING-gel row-szintű
    // lock-kal sorosít. Migrációk: 2026-05-17-iktato-sequence-pointer-rpc.sql
    // + 2026-08-15-egyhazmegyei-iktato-leltar-s4.sql (megyei változat).
    //
    // 2026-08-15 (S4): megyénként+évenként SAJÁT számsor — a megyei kiosztást
    // a next_iktato_sequence_dio RPC végzi (a hívó jogosultságát a szerep-szűrt
    // current_user_diocese_ids()-hez köti, ahogy a gyülekezeti RPC a
    // profiles.congregation_id-hez).
    const { data: nextSeq, error: rpcErr } =
      ctx.scope === 'diocese'
        ? await supabase.rpc('next_iktato_sequence_dio', {
            p_diocese_id: ctx.scopeId,
            p_year: year,
          })
        : await supabase.rpc('next_iktato_sequence', {
            p_congregation_id: ctx.scopeId,
            p_year: year,
          })
    if (rpcErr || nextSeq === null || nextSeq === undefined) {
      return {
        error: `Sorszám lekérése sikertelen: ${rpcErr?.message ?? 'a next_iktato_sequence RPC nem adott vissza értéket'}`,
      }
    }
    record.sequence_number = nextSeq as number
    const { error } = await supabase.from('iktato').insert([record])
    if (error) {
      // 2026-08-10 (K4 iktatószám-diagnosztika #10): a 23505 eddig NYERS
      // Postgres-szövegként ért a lelkészhez („duplicate key value violates
      // unique constraint …"). Ez a hiba azt jelenti, hogy a számláló és a
      // tényleges sorok elcsúsztak (pl. régi, RPC-t megkerülő beszúrás vagy
      // import után elmaradt pointer-szinkron). A számláló KÖZBEN előrelépett,
      // ezért az ismételt próbálkozás rendszerint sikerül.
      if (error.code === '23505') {
        return {
          error: `A ${year}/${nextSeq} iktatószám már foglalt — a sorszám-számláló elcsúszott. Próbáld újra: a számláló közben továbblépett. Ha ismétlődik, jelezd a rendszergazdának (sorszám-számláló újraszinkronizálása szükséges).`,
        }
      }
      return { error: `Hiba: ${error.message}` }
    }
    revalidatePath('/iktato')
    // 2026-07-17 (F6 review): az insert-ág visszaadja a ténylegesen kiosztott
    // sorszámot — a kiállító dialógus (certificate-issue-dialog) ebből képzi
    // az iratszámot. A korábbi (tárgy + kelt) alapú visszakeresés párhuzamos
    // iktatásnál MÁSIK irat számát találhatta meg. Az update-ág és a többi
    // hívó (filing-main) csak a success/error mezőt nézi — őket nem érinti.
    return { success: true, year, sequenceNumber: nextSeq as number }
  }
  revalidatePath('/iktato')
  return { success: true }
}

export async function deleteFilingEntry(id: string) {
  const { ctx } = await getScopeCtx()
  if (!ctx) return { error: 'Nincs bejelentkezett felhasználó.' }
  const blocked = moduleWriteBlock(ctx)
  if (blocked) return { error: blocked.error }
  const { error } = await ctx.supabase.from('iktato').update({ deleted: true }).eq('id', id).eq(ctx.scopeCol, ctx.scopeId)
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/iktato')
  return { success: true }
}

export async function getFilingStats(year: number) {
  const { ctx } = await getScopeCtx()
  if (!ctx) return { total: 0, incoming: 0, outgoing: 0, pending: 0 }
  const { supabase } = ctx
  // 2026-08-10 (K4 iktatószám-diagnosztika): a korábbi implementáció EGY
  // lapozatlan SELECT sorait számolta meg JS-ben — a PostgREST 1000-soros
  // alapértelmezett limitje miatt egy 1000+ iratos évnél a statisztika némán
  // 1000-nél megállt (a getFilingEntries ezt már 2026-07-17 óta lapozza).
  // Szerver-oldali `count: 'exact', head: true` — nem lapozás-függő és olcsóbb.
  const base = () =>
    supabase
      .from('iktato')
      .select('id', { count: 'exact', head: true })
      .eq(ctx.scopeCol, ctx.scopeId)
      .eq('year', year)
      .eq('deleted', false)
  const [totalRes, incomingRes, outgoingRes, pendingRes] = await Promise.all([
    base(),
    base().eq('direction', 'incoming'),
    base().eq('direction', 'outgoing'),
    base().is('elintezes_ideje', null),
  ])
  return {
    total: totalRes.count ?? 0,
    incoming: incomingRes.count ?? 0,
    outgoing: outgoingRes.count ?? 0,
    pending: pendingRes.count ?? 0,
  }
}

// ─── 2026-05-29 Fázis 3: Évvégi iktatókönyv-lezárás ─────────────────────

/** Az aktuális hatókör (gyülekezet vagy egyházmegye) összes évzárása. */
export async function getYearlyClosures(): Promise<IktatoYearlyClosure[]> {
  const { ctx } = await getScopeCtx()
  if (!ctx) return []
  const { data } = await ctx.supabase
    .from('iktato_yearly_closures')
    .select('*')
    .eq(ctx.scopeCol, ctx.scopeId)
    .order('year', { ascending: false })
  return (data || []) as IktatoYearlyClosure[]
}

/** Egy adott évre vonatkozó lezárás (ha létezik). */
export async function getYearClosure(year: number): Promise<IktatoYearlyClosure | null> {
  const { ctx } = await getScopeCtx()
  if (!ctx) return null
  const { data } = await ctx.supabase
    .from('iktato_yearly_closures')
    .select('*')
    .eq(ctx.scopeCol, ctx.scopeId)
    .eq('year', year)
    .maybeSingle()
  return (data as IktatoYearlyClosure | null) ?? null
}

/**
 * Évvégi lezárás. A megadott évre vonatkozóan lezárja az iktatókönyvet —
 * onnantól se új bejegyzést, se módosítást nem fogad el a `saveFilingEntry`.
 * Csak a folyó év vagy korábbi év zárható le (jövőre vonatkozó lezárás tilos).
 */
export async function closeFilingYear(params: { year: number; closingNote?: string }) {
  const { ctx } = await getScopeCtx()
  if (!ctx) return { error: 'Nincs bejelentkezett felhasználó.' }
  const blocked = moduleWriteBlock(ctx)
  if (blocked) return { error: blocked.error }
  const { supabase, userId } = ctx
  const currentYear = new Date().getFullYear()
  if (params.year > currentYear) {
    return { error: `Jövőre vonatkozó évvégi lezárás nem engedélyezett (${params.year} > ${currentYear}).` }
  }
  const existing = await getYearClosure(params.year)
  if (existing) {
    return { error: `A ${params.year}-es év már lezárva (${existing.closed_at?.slice(0, 10)}).` }
  }
  // A lezárás pillanatában lévő bejegyzések száma — audit-célból tároljuk.
  // 2026-07-11 P2: head:true mellett a data mindig null — a darabszám a válasz
  // `count` mezőjében jön, onnan kell olvasni.
  const { count } = await supabase
    .from('iktato')
    .select('id', { count: 'exact', head: true })
    .eq(ctx.scopeCol, ctx.scopeId)
    .eq('year', params.year)
    .eq('deleted', false)
  const totalEntries = count ?? null

  const { error } = await supabase.from('iktato_yearly_closures').insert([
    {
      // 2026-08-15 (S4): scope-oszlop dinamikusan — a CHECK
      // (iktato_yearly_closures_pontosan_egy_scope) őrzi az integritást.
      [ctx.scopeCol]: ctx.scopeId,
      year: params.year,
      closing_note: params.closingNote || null,
      total_entries_at_close: totalEntries,
      // 2026-07-11 P2: audit — ki zárta le (profiles.id = auth user id).
      closed_by_profile_id: userId ?? null,
    },
  ])
  if (error) return { error: `Lezárás sikertelen: ${error.message}` }
  revalidatePath('/iktato')
  return { success: true, totalEntries }
}

/**
 * Évvégi lezárás feloldása. A jogosultság-ellenőrzést és a törlést a
 * SECURITY DEFINER `reopen_iktato_year` RPC végzi — a korábbi direkt
 * DELETE az RLS DELETE-policy hiánya miatt néma no-op volt (2026-07-11 P2).
 */
export async function reopenFilingYear(year: number) {
  const { ctx } = await getScopeCtx()
  if (!ctx) return { error: 'Nincs bejelentkezett felhasználó.' }
  const { supabase } = ctx

  // 2026-08-15 (S4): MEGYEI évzárás feloldása. A gyülekezeti utat egy
  // SECURITY DEFINER RPC végzi (admin/master-kapuval), mert a gyülekezet
  // felett ott áll az egyházmegye mint kontroll-szint. A megye felett
  // interaktív felettes szint (még) nincs — a feloldás az esperes /
  // egyházmegyei admin joga, és a diocese-láb RLS (FOR ALL, szerep-szűrt
  // current_user_diocese_ids) pontosan ezt engedi; a számvevőt a
  // moduleWriteBlock zárja ki. Direkt DELETE — a `.select('id')` miatt a
  // 0-soros (némán semmit sem törlő) eset is hangos.
  if (ctx.scope === 'diocese') {
    const blocked = moduleWriteBlock(ctx)
    if (blocked) return { error: blocked.error }
    const { data: torolt, error: delErr } = await supabase
      .from('iktato_yearly_closures')
      .delete()
      .eq('diocese_id', ctx.scopeId)
      .eq('year', year)
      .select('id')
    if (delErr) return { error: `Feloldás sikertelen: ${delErr.message}` }
    if (!torolt || torolt.length === 0) {
      return { error: 'Ez az év nem volt lezárva — nincs mit feloldani. Frissítsd a listát.' }
    }
    revalidatePath('/iktato')
    return { success: true }
  }

  const { data, error } = await supabase.rpc('reopen_iktato_year', {
    p_congregation_id: ctx.scopeId,
    p_year: year,
  })
  if (error) {
    // PGRST202 = a PostgREST nem találja a függvényt, 42883 = undefined function
    const rpcMissing =
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /could not find the function/i.test(error.message)
    return {
      error: rpcMissing
        ? 'A feloldó funkció (reopen_iktato_year) még nincs telepítve az adatbázisban — futtasd le a hozzá tartozó migrációt, majd próbáld újra.'
        : `Feloldás sikertelen: ${error.message}`,
    }
  }
  // Az RPC FOUND-ot ad vissza: false = nem volt lezárás-sor erre az évre
  // (jogosultsági hiba esetén az RPC kivételt dob, azt a fenti error-ág kezeli).
  if (data === false) {
    return { error: 'Ez az év nem volt lezárva — nincs mit feloldani. Frissítsd a listát.' }
  }
  revalidatePath('/iktato')
  return { success: true }
}
