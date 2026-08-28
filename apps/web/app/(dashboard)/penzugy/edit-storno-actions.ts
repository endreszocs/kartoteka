'use server'

/**
 * Pénzügyi tétel szerkesztés és stornó server akciók.
 *
 * Két fő művelet:
 *   1. updateTransactionBasic — az alapadatok (dátum, összeg, jogcím,
 *      partner, iratszám, megjegyzés) módosítása egy meglévő tételen.
 *   2. stornoTransaction — stornózás kötelező indoklással. A tétel
 *      stornózott=true jelzéssel marad a listában, de az összesítőből
 *      és az egyenlegből kimarad.
 *
 * 2026-04-18 SCOPE-AWARE REFAKTOR: diocese és congregation scope-on is
 * működik. A scope-specifikus táblaneveket és oszlopokat a
 * `getFinanceScopeContext` + `tablesFor(scope)` helper adja.
 *
 * 2026-08-17 (kerületi S5): HARMADIK hatókör — az EGYHÁZKERÜLET (`district`).
 * A tábla-/oszlopválasztás VÁLTOZATLANUL a `tablesFor(ctx.scope)` térképből jön,
 * tehát a kerület automatikusan a `district_*` táblákra dolgozik. Amit KÉZZEL
 * kellett javítani: két `scope === 'diocese' ? … : …` ternárius (a stornó és a
 * stornó-visszavonás `select`-je), mert azok a kerületet NÉMÁN a GYÜLEKEZETI
 * ágra ejtették — lásd ott a részletes MIÉRT-et.
 *
 * FONTOS: a véglegesített (számadás lezárva) évekre vonatkozó tételek
 *         NEM szerkeszthetők — a felhasználó előbb javítási kérelmet ad.
 */

import { revalidatePath } from 'next/cache'
import {
  financeWriteBlock,
  getFinanceScopeContext,
  tablesFor,
  isYearFinalized,
  yearFinalizedCheckErrorMessage,
  type FinanceScope,
  type FinanceScopeContext,
} from '@/lib/auth/finance-scope'

export type TransactionType = 'befizetes' | 'kiadas'

/**
 * KITŐL kér a felhasználó javítási engedélyt egy már véglegesített évre?
 *
 * MIÉRT KELL EZ A HELPER: a modul két zár-üzenete eddig FIX „az egyházmegyétől"
 * szöveget írt, hatókörtől függetlenül. A kerületi ág megjelenésével ez azt
 * jelentené, hogy az egyházkerületet a SAJÁT ALÁRENDELT szintjéhez küldjük
 * engedélyért — értelmetlen utasítás egy hivatalos zárás feloldásához.
 *
 * ⚠️ MIÉRT AD A `diocese` ÁG TOVÁBBRA IS „az egyházmegyétől"-t (és miért NEM
 *    „az egyházkerülettől"-t, ahogy a penzugy/actions.ts `felettesSzintTol`
 *    helpere): mert ez a szelet KIZÁRÓLAG a kerületi ágat érintheti — a megyei
 *    viselkedés BYTE-RA változatlan kell maradjon. A két fájl szövege tehát MA
 *    is széthúz (actions.ts:179 az egyházkerülethez küldi a megyét, ez a fájl
 *    az egyházmegyéhez); ez ELŐZETESEN IS FENNÁLLÓ eltérés, Endre döntésére vár,
 *    NEM ebben a szeletben javítjuk csendben.
 *
 * ⚠️ A `district` ág `null`-t ad: a rendszerben a kerület FÖLÖTT nincs olyan
 *    szint, amelyik a feloldást elbírálná (a megyei kérelmet a kerület bírálja
 *    el — a kerületét senki). Ezért a hívó egy felettest NEM NEVEZŐ, tényszerű
 *    mondatot ír ki. Ha Endre kijelöl elbírálót (Zsinat / kerületi közgyűlés),
 *    itt EGY helyen kell átírni.
 *
 * EXHAUSTIVE SWITCH: egy negyedik szint FORDÍTÁSI HIBÁT ad, nem néma
 * „az egyházmegyétől"-t egy olyan szintnek, amelynek köze sincs a megyéhez.
 */
function javitasiEngedelyForrasa(scope: FinanceScope): string | null {
  switch (scope) {
    case 'congregation':
      return 'az egyházmegyétől'
    case 'diocese':
      return 'az egyházmegyétől'
    case 'district':
      return null
    default: {
      const _nemKezelt: never = scope
      throw new Error(`Ismeretlen pénzügyi hatókör: ${String(_nemKezelt)}`)
    }
  }
}

/**
 * Megmondja, hogy egy tétel az ADOTT TÍPUSÚ utolsó-e az éveben + scope-ban.
 * A dátum-szerkesztést csak az utolsó tételre engedjük: ha valaki köztes
 * dátumot írna, az ELRONTANÁ a kronológiát és a nyugtaszámozást.
 *
 * Kliens oldali UI-ból hívjuk meg, mielőtt megmutatja a szerkesztő dialogot.
 */
export async function isLastTransactionOfType(args: {
  type: TransactionType
  id: number
}): Promise<{ isLast?: boolean; error?: string }> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  const T = tablesFor(ctx.scope)
  const table = args.type === 'befizetes' ? T.befizetes : T.kiadas

  // Lekérjük a tétel dátumát
  const { data: current, error: currentErr } = await ctx.supabase
    .from(table)
    .select('datum')
    .eq('id', args.id)
    .eq(T.scopeCol, ctx.scopeId)
    .maybeSingle()

  // 2026-08-11 (5. kör, K5-#32 testvér-vizsgálat): a hiba korábban elveszett
  // (`const { data: current } = …`), és a `!current?.datum` ág `isLast: false`-t
  // adott — az még a szigorúbb irány, de némán. Most kimondjuk a hibát.
  if (currentErr) {
    return { error: `A tétel dátumát nem sikerült lekérdezni: ${currentErr.message}` }
  }
  if (!current?.datum) return { isLast: false }

  // Van-e ugyanabban az évben és a jelen tételnél későbbi dátumú tétel?
  const year = new Date(current.datum as string).getFullYear()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  const { data: later, error: laterErr } = await ctx.supabase
    .from(table)
    .select('id')
    .eq(T.scopeCol, ctx.scopeId)
    .eq('deleted', false)
    .gt('datum', current.datum as string)
    .lte('datum', yearEnd)
    .gte('datum', yearStart)
    .limit(1)

  // 2026-08-11 (5. kör): FAIL-OPEN VOLT. A `const { data: later } = …` eldobta az
  // `error`-t, és a `return { isLast: !later || later.length === 0 }` egy HIBÁS
  // lekérdezésre (later === null) `isLast: true`-t adott — vagyis a UI éppen
  // akkor engedte volna a DÁTUM átírását, amikor nem tudtuk ellenőrizni, hogy
  // van-e későbbi tétel az évben. Egy köztes dátum átírása pont azt rontja el,
  // amit ez a guard véd: a kronológiát és a nyugtaszám-sorrendet. Fail-closed:
  // ha nem tudjuk, NEM engedjük.
  if (laterErr) {
    return {
      error:
        `Nem sikerült ellenőrizni, hogy ez a tétel az év utolsó tétele-e ` +
        `(${laterErr.message}), ezért a dátum most biztonságból nem módosítható. ` +
        'Próbáld újra néhány perc múlva; a többi mező szerkesztése ettől független.',
    }
  }

  return { isLast: !later || later.length === 0 }
}

/**
 * Egy befizetés jelenlegi tag-hozzárendelésének lekérdezése a szerkesztő dialóghoz
 * (ki van/nincs hozzárendelve). Csak congregation scope + befizetés esetén értelmes.
 */
export async function getTransactionPersonInfo(args: {
  type: TransactionType
  id: number
}): Promise<{ id_szemely?: number | null; id_csalad?: number | null; nev?: string | null; forrasa?: string | null; error?: string }> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  if (ctx.scope !== 'congregation' || args.type !== 'befizetes') return {}
  const T = tablesFor(ctx.scope)

  const { data } = await ctx.supabase
    .from(T.befizetes)
    .select('id_szemely, id_csalad, forrasa')
    .eq('id', args.id)
    .eq(T.scopeCol, ctx.scopeId)
    .maybeSingle()
  if (!data) return {}
  const row = data as { id_szemely: number | null; id_csalad: number | null; forrasa: string | null }

  let nev: string | null = null
  if (row.id_szemely) {
    const { data: sz } = await ctx.supabase
      .from('szemely')
      .select('csaladnev, k_nev')
      .eq('id', row.id_szemely)
      .maybeSingle()
    if (sz) {
      const s = sz as { csaladnev: string | null; k_nev: string | null }
      nev = [s.csaladnev, s.k_nev].filter(Boolean).join(' ').trim() || null
    }
  }
  return { id_szemely: row.id_szemely, id_csalad: row.id_csalad, nev, forrasa: row.forrasa }
}

export interface UpdateTransactionInput {
  type: TransactionType
  id: number
  datum?: string
  osszeg?: number
  /** 2026-07-11 (S11): devizás számla — a RON-ekvivalens és az árfolyam is
   *  szerkeszthető (a tényleges banki átváltás értéke, adók/rés miatt eltérhet
   *  a BNR-től). RON számlán osszeg_ron == osszeg, arfolyam == 1. */
  osszeg_ron?: number | null
  arfolyam?: number | null
  megjegyzes?: string | null
  /** Kassza/bank jogcím kategória — a befizetescel/kiadascel PK-ja
   * (congregation) vagy a szamadasicel kód-indexe (diocese). */
  id_cel?: number | null
  /** Iratszám (chitanta sorszám vagy számla sorszám). */
  iratszam?: string | null
  /** Partner — vagy szemely FK, vagy szabad szöveges forrás. */
  id_szemely?: number | null
  id_csalad?: number | null
  forrasa?: string | null
}

export async function updateTransactionBasic(
  input: UpdateTransactionInput,
): Promise<{ success?: boolean; error?: string }> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(ctx)
  if (writeBlock) return writeBlock
  const T = tablesFor(ctx.scope)
  const table = input.type === 'befizetes' ? T.befizetes : T.kiadas

  // 2026-08-11 (5. kör, P0 adat-integritás): HIBA VOLT — a véglegesített-év
  // ellenőrzés az `if (input.datum)` ágon BELÜL futott, a hívó szerkesztő
  // dialógus (components/modals/transaction-edit-dialog.tsx) viszont
  // SZÁNDÉKOSAN `datum: undefined`-et küld minden tételre, ami nem az év
  // utolsó tétele — vagyis gyakorlatilag MINDEN korábbi sorra. Így egy már
  // véglegesített ÉS beküldött évben az összeg, a jogcím, az iratszám és a
  // befizető tag NÉMÁN átírható volt: a kinyomtatott/beküldött számadás és a
  // képernyőn látszó adat széthúzott.
  //
  // Javítás: a tétel JELENLEGI dátumát mindig kiolvassuk a DB-ből (ahogy a
  // stornoTransaction is teszi lentebb), és MINDEN update-nél ellenőrzünk.
  // Ha új dátum is érkezik, a RÉGI és az ÚJ évre is (átmozgatás egy zárt évbe
  // ugyanolyan súlyos, mint egy zárt évből kimozgatás).
  const { data: currentRow, error: currentErr } = await ctx.supabase
    .from(table)
    .select(ctx.scope === 'congregation' ? 'datum, belso_mozgas_xkey' : 'datum')
    .eq('id', input.id)
    .eq(T.scopeCol, ctx.scopeId)
    .maybeSingle()

  if (currentErr) {
    return { error: `A tétel ellenőrzése nem sikerült: ${currentErr.message}` }
  }
  if (!currentRow) return { error: 'A tétel nem található.' }

  // 2026-08-27 — BELSO MOZGAS: A SZERKESZTES ITT ALL MEG.
  // Egy belső mozgás KÉT sorból áll (bevétel + kiadás), közös kulccsal. Ez a
  // függvény EGYETLEN sort ír át, a párt nem is olvassa — egy összeg- vagy
  // dátum-módosítás tehát SZÉTHÚZNÁ a párt. A következmény nem kozmetikai: az
  // egészség-ellenőrző az összeg és a dátum egyezésére párosít, ezért a
  // széthúzott pár MINDKÉT lába hamis „párosítatlan" riasztást kapna, rossz
  // tanáccsal („importáld a banki kivonatot") — miközben a pár megvan, csak
  // elrontottuk.
  // A FELÜLETEN a ceruza el van rejtve az ilyen sorokon, DE ez egy use-server
  // végpont: a POST attól még élt. Most itt is bezárul.
  const bmXkeyEdit = (currentRow as { belso_mozgas_xkey?: string | null }).belso_mozgas_xkey
  if (ctx.scope === 'congregation' && bmXkeyEdit) {
    return {
      error:
        'Ez a tétel egy kassza ↔ bank átvezetés része, ezért külön nem szerkeszthető — ' +
        'a párja némán elcsúszna tőle. Ha az összeg vagy a dátum hibás, töröld az ' +
        'átvezetést (a rendszer mindkét oldalát törli), és rögzítsd újra a helyes adatokkal.',
    }
  }

  const yearsToCheck = new Set<number>()
  const currentDatum = (currentRow as { datum?: string | null }).datum
  if (currentDatum) {
    const y = new Date(currentDatum).getFullYear()
    if (Number.isFinite(y)) yearsToCheck.add(y)
  }
  if (input.datum) {
    const y = new Date(input.datum).getFullYear()
    if (Number.isFinite(y)) yearsToCheck.add(y)
  }

  // 2026-08-11 (K5-#32, 2. lépés): az `isYearFinalized` fail-closed DOB, ha a
  // zár-állapotot nem tudja lekérdezni. Try/catch nélkül ez nyers szerver-action
  // hibaként bukott el, és a lelkész nem tudta, mit tegyen. A művelet továbbra is
  // meghiúsul (ez a helyes: zárt évet elnyelt hiba miatt sosem nyitunk ki), de a
  // modul szokásos `{ error: '…' }` alakjában, magyar, cselekvésre váltható
  // üzenettel.
  for (const year of yearsToCheck) {
    let finalized: boolean
    try {
      finalized = await isYearFinalized(ctx, year)
    } catch (err) {
      return { error: yearFinalizedCheckErrorMessage(err, year) }
    }
    if (finalized) {
      // A záró mondat HATÓKÖR-FÜGGŐ (lásd `javitasiEngedelyForrasa`): a
      // gyülekezeti és a megyei szöveg BETŰRE a korábbi, a kerület pedig nem kap
      // olyan utasítást, hogy a saját alárendelt szintjétől kérjen engedélyt.
      const forras = javitasiEngedelyForrasa(ctx.scope)
      return {
        error:
          `A ${year}. évi számadás már véglegesítve (és beküldve) van, ezért ez a tétel nem módosítható. ` +
          (forras
            ? `Kérj feloldást (javítási engedélyt) ${forras}, és a jóváhagyás után javítsd.`
            : 'A javításhoz előbb fel kell oldani a lezárt évet.'),
      }
    }
  }

  // Alap update objektum — csak azokat írjuk, amelyek meg vannak adva
  const updateData: Record<string, unknown> = {}
  if (input.datum !== undefined) updateData.datum = input.datum
  if (input.osszeg !== undefined) updateData.osszeg = input.osszeg
  // 2026-07-11 (S11): devizás számlánál a RON-ekvivalens + árfolyam is frissül,
  // különben szerkesztés után a osszeg_ron elavulna (az egyenleg RON-ban ezt olvassa).
  if (input.osszeg_ron !== undefined) updateData.osszeg_ron = input.osszeg_ron
  if (input.arfolyam !== undefined) updateData.arfolyam = input.arfolyam
  if (input.megjegyzes !== undefined) updateData.megjegyzes = input.megjegyzes?.trim() || null
  if (input.iratszam !== undefined) {
    updateData.iratszam = input.iratszam?.trim() || null
  }

  // Kategória oszlop scope-specifikus
  if (input.type === 'befizetes') {
    if (input.id_cel !== undefined) {
      updateData[T.categoryColBefizetes] = await resolveCategoryValue(ctx, input.id_cel)
    }
    // A tag-referenciák csak congregation módban léteznek
    if (ctx.scope === 'congregation') {
      if (input.id_szemely !== undefined) updateData.id_szemely = input.id_szemely
      if (input.id_csalad !== undefined) updateData.id_csalad = input.id_csalad
    }
    if (input.forrasa !== undefined) updateData.forrasa = input.forrasa?.trim() || null
  } else {
    if (input.id_cel !== undefined) {
      updateData[T.categoryColKiadas] = await resolveCategoryValue(ctx, input.id_cel)
    }
  }

  // Update timestamp
  updateData.updated_at = new Date().toISOString()

  if (Object.keys(updateData).length === 1) {
    // Csak updated_at → nincs valódi változás
    return { error: 'Nem adtál meg módosítandó mezőt.' }
  }

  const { error } = await ctx.supabase
    .from(table)
    .update(updateData)
    .eq('id', input.id)
    .eq(T.scopeCol, ctx.scopeId)

  if (error) return { error: `Mentés sikertelen: ${error.message}` }

  revalidatePath('/penzugy')
  return { success: true }
}

/**
 * A FELSŐ SZINTEKEN (egyházmegye, 2026-08-17 óta egyházkerület is) a kategória
 * oszlop `id_szamadasicel` (string kód), gyülekezeti hatókörben
 * `id_befizetescel`/`id_kiadascel` (int). A UI mindkét esetben int-et küld —
 * felső szinten ezt kóddá konvertáljuk a `szamadasicel.sorszam` alapján
 * (ua. mint az insertDioceseIncomeRecord-ban).
 *
 * ⚠️ A KAPU SZÁNDÉKOSAN a GYÜLEKEZETI sajátosságot nevezi meg
 * (`=== 'congregation'`), nem az egyik felső szintet: így a kerület a HELYES
 * (kód-konvertáló) ágra esik. Ha itt `=== 'diocese'` állna, a kerületi jogcím
 * némán int-ként kerülne a `district_*.id_szamadasicel` szöveges oszlopba.
 */

/**
 * A belső mozgás pár MINDKÉT lábának évei (2026-08-27).
 *
 * MIÉRT KELL: a sztornó és a sztornó-visszavonás az UPDATE-et a közös
 * `belso_mozgas_xkey`-re adja ki, tehát MINDKÉT lábat átírja — az év-zár
 * ellenőrzés viszont CSAK a kattintott sor dátumára futott. Egy évfordulós
 * átvezetés két oldala ELTÉRŐ évre eshet (kassza-láb dec. 31., bank-láb
 * jan. 2. — „úton lévő pénz"), és ilyenkor a friss év lábának sztornózása
 * NÉMÁN átbillentette volna a MÁR VÉGLEGESÍTETT és beküldött év egyenlegét is.
 * A törlési ág (deleteTransaction) ezt mindig helyesen csinálta.
 *
 * FAIL-CLOSED: ha a párt nem tudjuk felderíteni, azt sem tudjuk, mely éveket
 * érintené a művelet — ilyenkor hibát adunk vissza, nem tippelünk.
 */
async function belsoMozgasParEvei(
  ctx: FinanceScopeContext,
  xkey: string,
  sajatDatum: string | null | undefined,
): Promise<{ evek: number[] } | { error: string }> {
  const [befRes, kiaRes] = await Promise.all([
    ctx.supabase.from('befizetes').select('datum')
      .eq('belso_mozgas_xkey', xkey).eq('congregation_id', ctx.scopeId),
    ctx.supabase.from('kiadas').select('datum')
      .eq('belso_mozgas_xkey', xkey).eq('congregation_id', ctx.scopeId),
  ])
  if (befRes.error || kiaRes.error) {
    const msg = befRes.error?.message || kiaRes.error?.message || 'ismeretlen'
    return {
      error:
        `A belső mozgás párjának ellenőrzése nem sikerült (${msg}), ezért a műveletet ` +
        'biztonságból megszakítottuk — egy lezárt év másik lába némán elmozdulhatna. ' +
        'Próbáld újra; ha újra hibázik, jelezd a rendszergazdának.',
    }
  }
  const evek = new Set<number>()
  const hozzaad = (d: string | null | undefined) => {
    if (!d) return
    const y = new Date(d).getFullYear()
    if (Number.isFinite(y)) evek.add(y)
  }
  hozzaad(sajatDatum)
  for (const x of [...(befRes.data || []), ...(kiaRes.data || [])]) {
    hozzaad((x as { datum?: string | null }).datum)
  }
  return { evek: [...evek].sort() }
}

async function resolveCategoryValue(
  ctx: FinanceScopeContext,
  id_cel: number | null,
): Promise<number | string | null> {
  if (id_cel == null) return null
  if (ctx.scope === 'congregation') return id_cel

  // Felső szint (egyházmegye / egyházkerület): int → kód konverzió
  const { data: cells } = await ctx.supabase
    .from('szamadasicel')
    .select('id, sorszam')
    .order('sorszam')
  const rows = (cells || []) as Array<{ id: string; sorszam: number }>
  const found = rows.find((c) => c.sorszam === id_cel)
  if (found) return found.id
  const direct = rows.find((c) => c.id === String(id_cel))
  if (direct) return direct.id
  return null
}

export async function stornoTransaction(args: {
  type: TransactionType
  id: number
  indok: string
}): Promise<{ success?: boolean; error?: string }> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(ctx)
  if (writeBlock) return writeBlock
  const T = tablesFor(ctx.scope)
  const table = args.type === 'befizetes' ? T.befizetes : T.kiadas

  const indok = (args.indok || '').trim()
  if (indok.length < 5) {
    return { error: 'A stornó indoklás legalább 5 karakter legyen.' }
  }

  // Először lekérdezzük a tétel dátumát a véglegesítés-ellenőrzéshez.
  //
  // ⛔ 2026-08-17 (kerületi S5) — NÉMA GYÜLEKEZETI VISSZAESÉS JAVÍTÁSA.
  // Itt eddig `ctx.scope === 'diocese' ? … : …` állt, vagyis a „minden más" ág
  // a GYÜLEKEZETI oszloplistát adta. A `belso_mozgas_xkey` (belső pénzmozgás
  // kassza⇄bank) viszont GYÜLEKEZETI SAJÁTOSSÁG: sem a `diocese_*`, sem a
  // `district_*` táblán nincs ilyen oszlop. A kerületi tétel stornózásakor
  // tehát a PostgREST a nem létező oszlopra hibázott volna, a `data` null lesz,
  // és a felhasználó „A tétel nem található." üzenetet kapott volna egy létező,
  // a képernyőn ott álló tételre — miközben a stornó egyáltalán nem fut le.
  // Ezért a kapu mostantól a GYÜLEKEZETI sajátosságot nevezi meg. A gyülekezeti
  // és a megyei oszloplista BETŰRE változatlan.
  const selectCols =
    ctx.scope === 'congregation' ? 'datum, belso_mozgas_xkey, stornozott' : 'datum, stornozott'

  const { data: row } = await ctx.supabase
    .from(table)
    .select(selectCols)
    .eq('id', args.id)
    .eq(T.scopeCol, ctx.scopeId)
    .maybeSingle()

  if (!row) return { error: 'A tétel nem található.' }
  const r = row as { datum?: string; belso_mozgas_xkey?: string | null; stornozott?: boolean }
  if (r.stornozott) return { error: 'Ez a tétel már stornózva van.' }

  // 2026-08-27: a pár MINDKÉT lábának évét ellenőrizzük (lásd belsoMozgasParEvei).
  let ellenorzendoEvek: number[] = []
  if (ctx.scope === 'congregation' && r.belso_mozgas_xkey) {
    const par = await belsoMozgasParEvei(ctx, r.belso_mozgas_xkey, r.datum)
    if ('error' in par) return { error: par.error }
    ellenorzendoEvek = par.evek
  } else if (r.datum) {
    const y = new Date(r.datum).getFullYear()
    if (Number.isFinite(y)) ellenorzendoEvek = [y]
  }
  for (const year of ellenorzendoEvek) {
    // 2026-08-11 (K5-#32, 2. lépés): fail-closed dobás → magyar `{ error }` alak.
    let finalized: boolean
    try {
      finalized = await isYearFinalized(ctx, year)
    } catch (err) {
      return { error: yearFinalizedCheckErrorMessage(err, year) }
    }
    if (finalized) {
      // Hatókör-függő záró mondat — lásd `javitasiEngedelyForrasa`.
      const forras = javitasiEngedelyForrasa(ctx.scope)
      return {
        error:
          `A ${year}. évi számadás már véglegesítve van. ` +
          (forras
            ? `Először kérj javítási engedélyt ${forras}.`
            : 'A stornóhoz előbb fel kell oldani a lezárt évet.'),
      }
    }
  }

  const payload = {
    stornozott: true,
    stornozott_at: new Date().toISOString(),
    stornozott_indok: indok,
    stornozott_by: ctx.userId,
    updated_at: new Date().toISOString(),
  }

  // Belső mozgás pairing csak congregation scope-ban releváns
  if (ctx.scope === 'congregation' && r.belso_mozgas_xkey) {
    const { error: bErr } = await ctx.supabase
      .from('befizetes')
      .update(payload)
      .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
      .eq('congregation_id', ctx.scopeId)
    if (bErr) return { error: `Stornózás sikertelen: ${bErr.message}` }

    const { error: kErr } = await ctx.supabase
      .from('kiadas')
      .update(payload)
      .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
      .eq('congregation_id', ctx.scopeId)
    if (kErr) return { error: `Stornózás sikertelen: ${kErr.message}` }
  } else {
    const { error } = await ctx.supabase
      .from(table)
      .update(payload)
      .eq('id', args.id)
      .eq(T.scopeCol, ctx.scopeId)
    if (error) return { error: `Stornózás sikertelen: ${error.message}` }
  }

  // Ha a befizetéshez tartozott oblio számla, azt is stornózzuk — csak congregation scope
  if (args.type === 'befizetes' && ctx.scope === 'congregation') {
    await ctx.supabase
      .from('oblio_szamlak')
      .update({
        stornozott: true,
        stornozott_at: new Date().toISOString(),
        stornozott_indok: `A befizetés stornózva: ${indok}`,
      })
      .eq('befizetes_id', args.id)
      .eq('congregation_id', ctx.scopeId)
      .eq('stornozott', false)
  }

  revalidatePath('/penzugy')
  return { success: true }
}

export async function undoStornoTransaction(args: {
  type: TransactionType
  id: number
}): Promise<{ success?: boolean; error?: string }> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(ctx)
  if (writeBlock) return writeBlock
  const T = tablesFor(ctx.scope)
  const table = args.type === 'befizetes' ? T.befizetes : T.kiadas

  // ⛔ 2026-08-17 (kerületi S5): ugyanaz a néma visszaesés, mint a
  // `stornoTransaction`-ben — a `belso_mozgas_xkey` GYÜLEKEZETI oszlop, ezért a
  // kapu a gyülekezeti sajátosságot nevezi meg, nem az egyik felső szintet.
  // Enélkül a kerületi stornó visszavonása „A tétel nem található."-val bukott
  // volna el egy létező tételen.
  const selectCols =
    ctx.scope === 'congregation' ? 'stornozott_by, belso_mozgas_xkey, datum' : 'stornozott_by, datum'

  const { data: row } = await ctx.supabase
    .from(table)
    .select(selectCols)
    .eq('id', args.id)
    .eq(T.scopeCol, ctx.scopeId)
    .maybeSingle()

  if (!row) return { error: 'A tétel nem található.' }
  const r = row as { stornozott_by?: string | null; belso_mozgas_xkey?: string | null; datum?: string }

  // 2026-08-27: a pár MINDKÉT lábának évét ellenőrizzük (lásd belsoMozgasParEvei).
  let visszaEvek: number[] = []
  if (ctx.scope === 'congregation' && r.belso_mozgas_xkey) {
    const par = await belsoMozgasParEvei(ctx, r.belso_mozgas_xkey, r.datum)
    if ('error' in par) return { error: par.error }
    visszaEvek = par.evek
  } else if (r.datum) {
    const y = new Date(r.datum).getFullYear()
    if (Number.isFinite(y)) visszaEvek = [y]
  }
  for (const year of visszaEvek) {
    // 2026-08-11 (K5-#32, 2. lépés): fail-closed dobás → magyar `{ error }` alak.
    let finalized: boolean
    try {
      finalized = await isYearFinalized(ctx, year)
    } catch (err) {
      return { error: yearFinalizedCheckErrorMessage(err, year) }
    }
    if (finalized) {
      return { error: `A ${year}. évi számadás véglegesítve van — a stornó nem vonható vissza.` }
    }
  }

  const payload = {
    stornozott: false,
    stornozott_at: null,
    stornozott_indok: null,
    stornozott_by: null,
    updated_at: new Date().toISOString(),
  }

  if (ctx.scope === 'congregation' && r.belso_mozgas_xkey) {
    // 2026-08-27: a hibákat EDDIG SENKI NEM NÉZTE (await érték nélkül) — egy
    // RLS- vagy hálózati hiba némán elnyelődött, a felület pedig sikert jelzett,
    // miközben a pár egyik (vagy mindkét) lába stornózva maradt.
    const befRes = await ctx.supabase
      .from('befizetes')
      .update(payload)
      .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
      .eq('congregation_id', ctx.scopeId)
    if (befRes.error) return { error: `Visszavonás sikertelen: ${befRes.error.message}` }
    const kiaRes = await ctx.supabase
      .from('kiadas')
      .update(payload)
      .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
      .eq('congregation_id', ctx.scopeId)
    if (kiaRes.error) {
      return {
        error:
          `A belső mozgás bevétel-oldalán a stornó visszavonva, a kiadás-oldalán viszont NEM ` +
          `(${kiaRes.error.message}). Nézd meg a tételt, és jelezd a rendszergazdának.`,
      }
    }
  } else {
    const { error } = await ctx.supabase
      .from(table)
      .update(payload)
      .eq('id', args.id)
      .eq(T.scopeCol, ctx.scopeId)
    if (error) return { error: `Visszavonás sikertelen: ${error.message}` }
  }

  revalidatePath('/penzugy')
  return { success: true }
}
