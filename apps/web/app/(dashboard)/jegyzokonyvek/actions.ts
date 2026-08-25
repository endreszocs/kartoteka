'use server'

import { revalidatePath } from 'next/cache'
import { selectAllPaged } from '@kartoteka/supabase-client'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { presbiterSzerepCimke } from '@/lib/tisztsegek/shared'

// ---------------------------------------------------------------------------
// Jegyzőkönyv CRUD
// ---------------------------------------------------------------------------

export async function getMinutesList(year: number) {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) return []

  const { data } = await access.supabase
    .from('presbiteri_jegyzokonyvek')
    .select('id, ev, ules_sorszam, datum, hely, allapot, elnok_neve, created_at')
    .eq('congregation_id', access.effectiveCongregationId)
    .eq('ev', year)
    .order('ules_sorszam', { ascending: true })

  return data || []
}

export async function getMinutesById(id: string) {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) return null

  const { data: jk } = await access.supabase
    .from('presbiteri_jegyzokonyvek')
    .select('*')
    .eq('id', id)
    .eq('congregation_id', access.effectiveCongregationId)
    .single()

  if (!jk) return null

  const [resztvevokRes, napirendRes, hatarozatokRes] = await Promise.all([
    access.supabase.from('jegyzokonyv_resztvevok').select('*').eq('jegyzokonyv_id', id).order('szerep'),
    access.supabase.from('jegyzokonyv_napirendi_pontok').select('*').eq('jegyzokonyv_id', id).order('sorszam'),
    access.supabase.from('jegyzokonyv_hatarozatok').select('*').eq('jegyzokonyv_id', id).order('sorszam'),
  ])

  return {
    ...jk,
    resztvevok: resztvevokRes.data || [],
    napirendi_pontok: napirendRes.data || [],
    hatarozatok: hatarozatokRes.data || [],
  }
}

export async function getNextUlesSorszam(year: number): Promise<number> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) return 1

  const { data } = await access.supabase
    .from('presbiteri_jegyzokonyvek')
    .select('ules_sorszam')
    .eq('congregation_id', access.effectiveCongregationId)
    .eq('ev', year)
    .order('ules_sorszam', { ascending: false })
    .limit(1)

  return (data?.[0]?.ules_sorszam || 0) + 1
}

export async function getNextHatarozatSorszam(year: number): Promise<number> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) return 1

  const { data } = await access.supabase
    .from('jegyzokonyv_hatarozatok')
    .select('sorszam')
    .eq('ev', year)
    .order('sorszam', { ascending: false })
    .limit(1)

  return (data?.[0]?.sorszam || 0) + 1
}

export async function saveMinutes(input: {
  id?: string
  tipus?: 'presbiteri' | 'kozgyulesi'
  datum: string
  hely?: string
  kezdes?: string
  zaras?: string
  elnok_neve?: string
  jegyzo_neve?: string
  hitelesito1?: string
  hitelesito2?: string
  igevers?: string
  felolvasas?: string
  megjegyzes?: string
  resztvevok: Array<{ nev: string; statusz: string; szerep?: string }>
  napirendi_pontok: Array<{
    sorszam: number
    cim: string
    eloado?: string
    targyalas?: string
    szavazas_igen?: number
    szavazas_nem?: number
    szavazas_tartozkodo?: number
  }>
  hatarozatok: Array<{
    sorszam: number
    szoveg: string
    felelos?: string
    hatarido?: string
    napirendi_pont_sorszam?: number
  }>
}): Promise<{ success?: boolean; id?: string; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) return { error: 'Nincs bejelentkezve.' }

  const { supabase } = access
  const congregationId = access.effectiveCongregationId
  const year = new Date(input.datum).getFullYear()

  let jkId = input.id

  if (jkId) {
    // Update meglévő
    const { error } = await supabase
      .from('presbiteri_jegyzokonyvek')
      .update({
        datum: input.datum, hely: input.hely || null,
        kezdes: input.kezdes || null, zaras: input.zaras || null,
        elnok_neve: input.elnok_neve || null, jegyzo_neve: input.jegyzo_neve || null,
        hitelesito1: input.hitelesito1 || null, hitelesito2: input.hitelesito2 || null,
        igevers: input.igevers || null, felolvasas: input.felolvasas || null,
        megjegyzes: input.megjegyzes || null, updated_at: new Date().toISOString(),
      })
      .eq('id', jkId).eq('congregation_id', congregationId)

    if (error) return { error: `Hiba: ${error.message}` }
  } else {
    // Új jegyzőkönyv
    const ulesSorszam = await getNextUlesSorszam(year)
    const { data, error } = await supabase
      .from('presbiteri_jegyzokonyvek')
      .insert({
        congregation_id: congregationId, tipus: input.tipus || 'presbiteri',
        ev: year, ules_sorszam: ulesSorszam,
        datum: input.datum, hely: input.hely || null,
        kezdes: input.kezdes || null, zaras: input.zaras || null,
        elnok_neve: input.elnok_neve || null, jegyzo_neve: input.jegyzo_neve || null,
        hitelesito1: input.hitelesito1 || null, hitelesito2: input.hitelesito2 || null,
        igevers: input.igevers || null, felolvasas: input.felolvasas || null,
        megjegyzes: input.megjegyzes || null, allapot: 'draft',
      })
      .select('id')

    if (error) return { error: `Hiba: ${error.message}` }
    jkId = data?.[0]?.id
  }

  if (!jkId) return { error: 'Ismeretlen hiba.' }

  // Résztvevők újraírás
  await supabase.from('jegyzokonyv_resztvevok').delete().eq('jegyzokonyv_id', jkId)
  if (input.resztvevok.length > 0) {
    await supabase.from('jegyzokonyv_resztvevok').insert(
      input.resztvevok.map((r) => ({ jegyzokonyv_id: jkId!, nev: r.nev, statusz: r.statusz, szerep: r.szerep || null })),
    )
  }

  // Napirendi pontok újraírás
  await supabase.from('jegyzokonyv_napirendi_pontok').delete().eq('jegyzokonyv_id', jkId)
  const napirendiMap = new Map<number, string>()
  if (input.napirendi_pontok.length > 0) {
    const { data: npData } = await supabase.from('jegyzokonyv_napirendi_pontok').insert(
      input.napirendi_pontok.map((np) => ({
        jegyzokonyv_id: jkId!,
        sorszam: np.sorszam, cim: np.cim, eloado: np.eloado || null,
        targyalas: np.targyalas || null,
        szavazas_igen: np.szavazas_igen || 0, szavazas_nem: np.szavazas_nem || 0,
        szavazas_tartozkodo: np.szavazas_tartozkodo || 0,
      })),
    ).select('id, sorszam')

    npData?.forEach((row: { id: string; sorszam: number }) => {
      napirendiMap.set(row.sorszam, row.id)
    })
  }

  // Határozatok újraírás
  await supabase.from('jegyzokonyv_hatarozatok').delete().eq('jegyzokonyv_id', jkId)
  if (input.hatarozatok.length > 0) {
    await supabase.from('jegyzokonyv_hatarozatok').insert(
      input.hatarozatok.map((h) => ({
        jegyzokonyv_id: jkId!,
        napirendi_pont_id: h.napirendi_pont_sorszam ? napirendiMap.get(h.napirendi_pont_sorszam) || null : null,
        sorszam: h.sorszam, ev: year, szoveg: h.szoveg,
        felelos: h.felelos || null, hatarido: h.hatarido || null, allapot: 'elfogadva',
      })),
    )
  }

  revalidatePath('/jegyzokonyvek')
  return { success: true, id: jkId }
}

export async function finalizeMinutes(id: string): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) return { error: 'Nincs bejelentkezve.' }

  const { error } = await access.supabase
    .from('presbiteri_jegyzokonyvek')
    .update({ allapot: 'veglegesitett', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('congregation_id', access.effectiveCongregationId)

  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/jegyzokonyvek')
  return { success: true }
}

export async function deleteMinutes(id: string): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) return { error: 'Nincs bejelentkezve.' }

  const { error } = await access.supabase
    .from('presbiteri_jegyzokonyvek')
    .delete()
    .eq('id', id)
    .eq('congregation_id', access.effectiveCongregationId)
    .eq('allapot', 'draft')

  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/jegyzokonyvek')
  return { success: true }
}

// ── Presbiterek lekérdezése (a résztvevők automatikus kitöltéséhez) ──

export async function getPresbyterNames(): Promise<Array<{ nev: string; telefon: string | null; tisztseg: string | null }>> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) return []

  // 2026-08-26 (5. kör): CSAK az AKTÍV mandátumú sorok kerülnek a jelenléti
  // ívre, a szerep-címke a kódolt fokozat/funkcióból képződik (a pót- és
  // tiszteletbeli presbiter „tanácskozási joggal" jelzést kap — a kvórum-
  // számítás ERRE ismer rá). !inner: idegen gyülekezet személye nem duzzaszt.
  const ma = new Date().toISOString().slice(0, 10)
  const futtat = (ujOszlopokkal: boolean) =>
    access.supabase
      .from('presbiter')
      .select(
        ujOszlopokkal
          ? 'tisztseg, fokozat, funkcio, kezdete, vege, id_szemely, szemely:szemely!id_szemely!inner(csaladnev, k_nev, telefon)'
          : 'tisztseg, id_szemely, szemely:szemely!id_szemely!inner(csaladnev, k_nev, telefon)',
      )
      .eq('szemely.congregation_id', access.effectiveCongregationId)

  let res = await futtat(true)
  const migracioElott = Boolean(res.error && /fokozat|funkcio|kezdete|vege/.test(res.error.message || ''))
  if (migracioElott) res = await futtat(false)
  if (res.error) return []

  type Sor = {
    tisztseg: string | null
    fokozat?: string | null
    funkcio?: string | null
    kezdete?: string | null
    vege?: string | null
    id_szemely?: number | null
    szemely: { csaladnev: string; k_nev: string; telefon: string | null } | null
  }
  const sorok = ((res.data || []) as unknown as Sor[])
    // aktív mandátum (migráció előtt minden sor "aktív" — nincs dátum-adat)
    .filter(r => (!r.kezdete || r.kezdete <= ma) && (!r.vege || r.vege >= ma))

  // Személyenként EGY sor (történeti/több-körzetes duplikátum ellen) — a
  // legmagasabb rangú (funkció > fokozat) marad.
  const rang = (r: Sor) => (r.funkcio === 'fogondnok' ? 0 : r.funkcio === 'gondnok' ? 1 : r.fokozat === 'pot' ? 3 : r.fokozat === 'tiszteletbeli' ? 4 : 2)
  const szemelyenkent = new Map<number | string, Sor>()
  for (const r of sorok) {
    const kulcs = r.id_szemely ?? `${r.szemely?.csaladnev}|${r.szemely?.k_nev}`
    const eddigi = szemelyenkent.get(kulcs)
    if (!eddigi || rang(r) < rang(eddigi)) szemelyenkent.set(kulcs, r)
  }

  return [...szemelyenkent.values()].map(row => {
    const szemely = row.szemely
    const szerep = migracioElott || row.fokozat == null
      ? row.tisztseg || null
      : presbiterSzerepCimke(row.fokozat, row.funkcio)
    return {
      nev: szemely ? `${szemely.csaladnev} ${szemely.k_nev}` : 'Ismeretlen',
      telefon: szemely?.telefon || null,
      tisztseg: szerep,
    }
  })
}

// ── Meghívó létrehozása és iktatóba rögzítése ──

/**
 * Meghívó iktatása.
 *
 * 2026-08-10 (K4 iktatószám-diagnosztika #1 — P0): ez a függvény volt az
 * `iktato/actions.ts`-en KÍVÜLI egyetlen `iktato`-beszúrás, és a 2026-05-17
 * előtti, NEM atomikus `MAX(sequence_number) + 1` mintát használta:
 *   • soha nem léptette a sorszám-számlálót (`iktato_sequence_pointers`),
 *     ezért a KÖVETKEZŐ automatikus iktatás pont a most kiadott számot kapta,
 *     és kőkeményen elbukott az `iktato_unique_active_cong_year_seq` parciális
 *     unique indexen (nyers „duplicate key" hiba a lelkésznél),
 *   • két párhuzamos meghívó ugyanazt a számot kapta,
 *   • a MAX nem szűrt `deleted = false`-ra (minden más olvasó igen),
 *   • nem volt évzárás-ellenőrzés (lezárt évbe is iktatott),
 *   • nem állított ügykör-kódot.
 * Mostantól ugyanazt az atomikus `next_iktato_sequence` RPC-t hívja, mint az
 * összes többi iktatás, és VISSZAADJA a ténylegesen kiosztott iktatószámot,
 * hogy a nyomtatott meghívóra a valódi szám kerüljön.
 */
export async function createInvitation(input: {
  datum: string
  hely: string
  kezdes: string
  tipus: 'presbiteri' | 'kozgyulesi'
  napirendi_pontok: string[]
}): Promise<{ success?: boolean; iktatoszam?: string; year?: number; sequenceNumber?: number; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) return { error: 'Nincs bejelentkezve.' }

  const { supabase } = access
  const congId = access.effectiveCongregationId
  const year = new Date(input.datum).getFullYear()
  if (!Number.isFinite(year)) return { error: 'Érvénytelen dátum.' }
  const tipusLabel = input.tipus === 'presbiteri' ? 'presbiteri gyűlésre' : 'közgyűlésre'

  // Évzárás-ellenőrzés — ugyanaz a kapu, mint a saveFilingEntry-ben.
  const { data: closure } = await supabase
    .from('iktato_yearly_closures')
    .select('closed_at')
    .eq('congregation_id', congId)
    .eq('year', year)
    .maybeSingle()
  if (closure) {
    return {
      error: `A ${year}-es iktatókönyv ${(closure as { closed_at: string | null }).closed_at?.slice(0, 10)} óta lezárt — nem lehet bele meghívót iktatni.`,
    }
  }

  // Atomikus sorszám-kiosztás (row-lock, a számlálót is lépteti).
  const { data: nextSeq, error: rpcErr } = await supabase.rpc('next_iktato_sequence', {
    p_congregation_id: congId,
    p_year: year,
  })
  if (rpcErr || nextSeq === null || nextSeq === undefined) {
    return {
      error: `Sorszám lekérése sikertelen: ${rpcErr?.message ?? 'a next_iktato_sequence RPC nem adott vissza értéket'}`,
    }
  }
  const sequenceNumber = nextSeq as number

  const { error } = await supabase.from('iktato').insert({
    congregation_id: congId,
    year,
    sequence_number: sequenceNumber,
    direction: 'outgoing',
    kelt: input.datum,
    subject: `Meghívó ${tipusLabel}`,
    sender_or_recipient: 'Presbitérium',
    targykivonat: `Meghívó ${tipusLabel} — ${input.datum}, ${input.hely}, ${input.kezdes}`,
    file_folder: 'Levelezés',
    deleted: false,
    userid: access.user.id,
  })

  if (error) {
    if (error.code === '23505') {
      return {
        error: `A ${year}/${sequenceNumber} iktatószám már foglalt — a sorszám-számláló elcsúszott. Próbáld újra: a számláló közben továbblépett.`,
      }
    }
    return { error: `Iktatási hiba: ${error.message}` }
  }

  revalidatePath('/iktato')
  revalidatePath('/jegyzokonyvek')
  // A kanonikus formátum az egész alkalmazásban `${year}/${sequence_number}`.
  return { success: true, iktatoszam: `${year}/${sequenceNumber}`, year, sequenceNumber }
}

// ── Véglegesített pénzügyi adatok lekérdezése (csatoláshoz) ──

export async function getFinancialSummaryForAttachment(year: number): Promise<{
  szamadas?: { totalIncome: number; totalExpense: number; balance: number; categories: Array<{ name: string; budget: number; actual: number }> }
  koltsegvetes?: { totalIncome: number; totalExpense: number; balance: number }
  vagyonleltar?: { itemCount: number; totalValue: number; categories?: Array<{ name: string; count: number; value: number }> }
} | null> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) return null

  const { supabase } = access
  const congId = access.effectiveCongregationId

  // Számadás adatok (bevétel/kiadás az adott évre)
  const [incResult, expResult] = await Promise.all([
    supabase.from('befizetes').select('osszeg').eq('congregation_id', congId).eq('deleted', false).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`),
    supabase.from('kiadas').select('osszeg').eq('congregation_id', congId).eq('deleted', false).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`),
  ])

  const totalIncome = (incResult.data || []).reduce((s, r: { osszeg: number }) => s + Number(r.osszeg || 0), 0)
  const totalExpense = (expResult.data || []).reduce((s, r: { osszeg: number }) => s + Number(r.osszeg || 0), 0)

  // Leltár adatok (helyes oszlopnevek: beszerzesi_ertek, is_deleted, kategoria)
  // 2026-08-14 (10. pont): LAPOZVA — lapozás nélkül a PostgREST 1000 soros
  // plafonja némán csonkolta volna a jegyzőkönyv-melléklet vagyonleltárát
  // 1000+ tételes gyülekezetnél (pl. könyvtár). A dedupe kulcsa nélkül futna
  // az alap 'id'-vel, de az id-t nem kérjük le → orderColumn: 'id' rendez,
  // dedupeBy: null (a sorok id nélkül jönnek, kulcsuk nincs).
  const { data: leltarData } = await selectAllPaged<{
    kategoria: string
    beszerzesi_ertek?: number
    mennyiseg?: number
  }>(
    supabase
      .from('leltar_tetelek')
      .select('kategoria, beszerzesi_ertek, mennyiseg')
      .eq('congregation_id', congId)
      .eq('is_deleted', false),
    { dedupeBy: null },
  )

  const itemCount = leltarData?.length || 0
  const totalValue = (leltarData || []).reduce((s, r: { beszerzesi_ertek?: number; mennyiseg?: number }) =>
    s + Number(r.beszerzesi_ertek || 0) * Number(r.mennyiseg || 1), 0)

  // Kategóriánkénti bontás
  const categoryMap = new Map<string, { count: number; value: number }>()
  for (const r of (leltarData || []) as Array<{ kategoria: string; beszerzesi_ertek?: number; mennyiseg?: number }>) {
    const cat = r.kategoria || 'Egyéb'
    const cur = categoryMap.get(cat) || { count: 0, value: 0 }
    cur.count += 1
    cur.value += Number(r.beszerzesi_ertek || 0) * Number(r.mennyiseg || 1)
    categoryMap.set(cat, cur)
  }
  const leltarCategories = [...categoryMap.entries()].map(([name, data]) => ({ name, ...data }))

  return {
    szamadas: { totalIncome, totalExpense, balance: totalIncome - totalExpense, categories: [] },
    koltsegvetes: { totalIncome, totalExpense, balance: totalIncome - totalExpense },
    vagyonleltar: { itemCount, totalValue, categories: leltarCategories },
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchMinutes(query: string, year?: number) {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) return []

  // Keresés határozatok és napirendi pontok szövegében
  const { data: hatResults } = await access.supabase
    .from('jegyzokonyv_hatarozatok')
    .select('sorszam, ev, szoveg, jegyzokonyv_id, presbiteri_jegyzokonyvek!inner(datum, ules_sorszam, ev, congregation_id)')
    .eq('presbiteri_jegyzokonyvek.congregation_id', access.effectiveCongregationId)
    .ilike('szoveg', `%${query}%`)
    .order('ev', { ascending: false })
    .limit(20)

  return (hatResults || []).map((r: Record<string, unknown>) => {
    const jk = r.presbiteri_jegyzokonyvek as { datum: string; ules_sorszam: number; ev: number } | null
    return {
      type: 'hatarozat' as const,
      hatarozat_szam: `${r.sorszam}/${r.ev}`,
      szoveg: (r.szoveg as string || '').slice(0, 150),
      datum: jk?.datum || '',
      ules_sorszam: jk?.ules_sorszam || 0,
      ev: jk?.ev || 0,
      jegyzokonyv_id: r.jegyzokonyv_id as string,
    }
  })
}
