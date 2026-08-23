'use server'

/**
 * ADATVÉDELMI FEDEZET (Profil) — szerver-akciók (2026-08-23).
 *
 *   A) BETEKINTÉS-KIMUTATÁS — „ki nyúlt az adatokhoz" (Adatvédelmi
 *      tájékoztató 18. szakasz).
 *   B) TELJES GYÜLEKEZETI ADATEXPORT — géppel olvasható adatkiadás
 *      (Adatvédelmi tájékoztató 9. szakasz + ÁSZF 12. pont).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ HATÓKÖR — FAIL-CLOSED, MINDEN HÍVÁSNÁL ÚJRA
 * ════════════════════════════════════════════════════════════════════════════
 * Az export TÖBB hívásban áll össze (nyilvántartásonként egy szelet, hogy a
 * felület mutathassa a haladást). MINDEN szelet ÚJRA feloldja és ÚJRA
 * ellenőrzi a hatókört — a kliens csak a tábla NEVÉT küldi, és azt is csak az
 * `EXPORT_TERV` allowlistjéből fogadjuk el. A gyülekezet azonosítója SOHA nem
 * érkezik a klienstől: azt mindig a szerver oldja fel.
 *
 * ⚠️ HIÁNYZÓ TÁBLA NEM HIBAOLDAL: a Supabase 42P01 / PGRST205 kóddal válaszol
 * a nem létező táblára. Ilyenkor a szelet állapota `hianyzik`, magyar
 * magyarázattal — a felület nem fest piros hibaoldalt, és a csomag elkészül a
 * többi nyilvántartással.
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getModuleScopeContext } from '@/lib/auth/module-scope'
import { logAuditEvent } from '@/lib/audit/log'
import {
  EXPORT_TERV,
  LAP_MERET,
  TABLA_SOR_PLAFON,
  darabol,
  exportHatokorEllenorzes,
  tervElem,
  type ExportTablaAllapot,
  type ExportTablaEredmeny,
  type SzarmaztatottKulcs,
} from '@/lib/export/gyulekezeti-export'
import type { BetekintesBejegyzes } from '@/lib/export/betekintes-naplo'
import type {
  BetekintesSzelet,
  BetekintesValasz,
  ExportSzeletValasz,
  ExportTervValasz,
} from '@/app/(dashboard)/profile/adatvedelem-shared'

// A plafon a `-shared.ts`-ben él (a kliens is ezt mutatja) — itt szándékosan
// nem másoljuk le, hanem importáljuk, hogy a kettő ne húzhasson szét.
import { BETEKINTES_PLAFON } from '@/app/(dashboard)/profile/adatvedelem-shared'

type SupabaseLikeError = { code?: string | null; message?: string | null } | null

// ─────────────────────────────────────────────────────────────────────────────
// Közös segédek
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A DB-hiba besorolása MAGYARUL. A hiányzó tábla/oszlop NEM hiba, hanem „ez a
 * modul még nincs bekapcsolva" — ezt a felhasználó is így érti.
 */
function hibaBesorolas(
  tabla: string,
  error: SupabaseLikeError,
): { allapot: ExportTablaAllapot; uzenet: string } {
  const kod = (error?.code || '').trim()
  const uzenet = (error?.message || '').trim()

  // 42P01 = nincs ilyen tábla, 42703 = nincs ilyen oszlop,
  // PGRST205/PGRST204 = a PostgREST séma-gyorsítótára nem ismeri.
  if (kod === '42P01' || kod === '42703' || kod === 'PGRST205' || kod === 'PGRST204') {
    return {
      allapot: 'hianyzik',
      uzenet:
        `Ez a nyilvántartás („${tabla}") ebben a rendszerben még nincs bekapcsolva, ` +
        'ezért nem került a csomagba. Ez nem adatvesztés.',
    }
  }
  if (kod === '42501' || kod === 'PGRST301' || /permission denied/i.test(uzenet)) {
    return {
      allapot: 'nincs_jog',
      uzenet: `Ehhez a nyilvántartáshoz („${tabla}") nincs olvasási jogosultságod.`,
    }
  }
  return {
    allapot: 'hiba',
    uzenet: `A(z) „${tabla}" nyilvántartás nem tölthető be. Részlet: ${uzenet || 'ismeretlen hiba'}`,
  }
}

type SupabaseKliens = Awaited<ReturnType<typeof getEffectiveAccessContext>>['supabase']

interface LapozottEredmeny {
  sorok: Record<string, unknown>[]
  csonkolt: boolean
  error: SupabaseLikeError
}

/**
 * Lapozott lekérdezés — a PostgREST egy kérésben legfeljebb 1000 sort ad
 * (ismert, néma hibaosztály: a 1001. sortól minden „eltűnne").
 *
 * A `szuro` visszaadja a felépített lekérdezést; a lapozást és a plafont ez a
 * függvény kezeli. Determinisztikus sorrend (`id`) nélkül a lapozás sorokat
 * duplikálna és sorokat hagyna ki.
 */
async function lapozva(
  epit: (tol: number, ig: number) => PromiseLike<{ data: unknown; error: SupabaseLikeError }>,
): Promise<LapozottEredmeny> {
  const osszes: Record<string, unknown>[] = []
  let tol = 0
  let csonkolt = false

  for (;;) {
    const { data, error } = await epit(tol, tol + LAP_MERET - 1)
    if (error) return { sorok: [], csonkolt: false, error }
    const lap = (Array.isArray(data) ? data : []) as Record<string, unknown>[]
    for (const sor of lap) osszes.push(sor)
    if (lap.length < LAP_MERET) break
    if (osszes.length >= TABLA_SOR_PLAFON) {
      csonkolt = true
      break
    }
    tol += LAP_MERET
  }

  return {
    sorok: csonkolt ? osszes.slice(0, TABLA_SOR_PLAFON) : osszes,
    csonkolt,
    error: null,
  }
}

/** Egy gyülekezeti hatókörű tábla ÖSSZES sora (lapozva). */
async function kozvetlenSorok(
  supabase: SupabaseKliens,
  tabla: string,
  congId: string,
): Promise<LapozottEredmeny> {
  return lapozva((tol, ig) =>
    supabase
      .from(tabla)
      .select('*')
      .eq('congregation_id', congId)
      .order('id', { ascending: true })
      .range(tol, ig),
  )
}

/** Egy gyülekezeti hatókörű tábla AZONOSÍTÓI (könnyű lekérdezés, lapozva). */
async function azonositok(
  supabase: SupabaseKliens,
  tabla: string,
  congId: string,
): Promise<{ idk: (string | number)[]; error: SupabaseLikeError }> {
  const eredmeny = await lapozva((tol, ig) =>
    supabase
      .from(tabla)
      .select('id')
      .eq('congregation_id', congId)
      .order('id', { ascending: true })
      .range(tol, ig),
  )
  if (eredmeny.error) return { idk: [], error: eredmeny.error }
  const idk = eredmeny.sorok
    .map((s) => s.id as string | number | null | undefined)
    .filter((v): v is string | number => v !== null && v !== undefined)
  return { idk, error: null }
}

/**
 * Azonosító-listás lekérdezés DARABOLVA.
 *
 * ⚠️ 80-asával. A `.in()` szűrő az URL-be kerül; ~100 azonosító fölött a proxy
 * 414-gyel eldobja a kérést — és ilyenkor NEM nulla sort kapunk, hanem HIBÁT,
 * amit tovább KELL adni (különben „nincs adat" látszik ott, ahol van).
 */
async function darabolvaIn(
  supabase: SupabaseKliens,
  tabla: string,
  oszlop: string,
  ertekek: (string | number)[],
): Promise<{ sorok: Record<string, unknown>[]; error: SupabaseLikeError }> {
  const gyujto: Record<string, unknown>[] = []
  for (const darab of darabol(ertekek)) {
    const { data, error } = await supabase.from(tabla).select('*').in(oszlop, darab)
    if (error) return { sorok: [], error }
    for (const sor of (data ?? []) as Record<string, unknown>[]) gyujto.push(sor)
  }
  return { sorok: gyujto, error: null }
}

function egyediSorok(sorok: Record<string, unknown>[]): Record<string, unknown>[] {
  const latott = new Set<string>()
  const ki: Record<string, unknown>[] = []
  for (const sor of sorok) {
    const kulcs = String(sor.id ?? JSON.stringify(sor))
    if (latott.has(kulcs)) continue
    latott.add(kulcs)
    ki.push(sor)
  }
  return ki
}

/** A `csalad` sorai a gyülekezet személyein keresztül. */
async function csaladSorok(
  supabase: SupabaseKliens,
  congId: string,
): Promise<{ sorok: Record<string, unknown>[]; error: SupabaseLikeError }> {
  const szemelyek = await azonositok(supabase, 'szemely', congId)
  if (szemelyek.error) return { sorok: [], error: szemelyek.error }
  if (szemelyek.idk.length === 0) return { sorok: [], error: null }

  const ferj = await darabolvaIn(supabase, 'csalad', 'id_ferfi', szemelyek.idk)
  if (ferj.error) return { sorok: [], error: ferj.error }
  const no = await darabolvaIn(supabase, 'csalad', 'id_no', szemelyek.idk)
  if (no.error) return { sorok: [], error: no.error }

  return { sorok: egyediSorok([...ferj.sorok, ...no.sorok]), error: null }
}

/**
 * A származtatott (gyülekezet-oszlop nélküli) táblák lekérdezése.
 *
 * ⚠️ EXHAUSTIVE `switch` `never`-ellenőrzésű `default`-tal: ha valaha új
 * származtatott kulcs kerül a tervbe, a FORDÍTÓ szól — nem az lesz, hogy a
 * nyilvántartás némán kimarad a csomagból (ez a projekt bevett szabálya).
 */
async function szarmaztatottSorok(
  supabase: SupabaseKliens,
  kulcs: SzarmaztatottKulcs,
  congId: string,
): Promise<{ sorok: Record<string, unknown>[]; error: SupabaseLikeError }> {
  switch (kulcs) {
    case 'csalad':
      return csaladSorok(supabase, congId)

    case 'gyerek': {
      const csaladok = await csaladSorok(supabase, congId)
      if (csaladok.error) return { sorok: [], error: csaladok.error }
      const idk = csaladok.sorok
        .map((s) => s.id as string | number | null | undefined)
        .filter((v): v is string | number => v !== null && v !== undefined)
      if (idk.length === 0) return { sorok: [], error: null }
      return darabolvaIn(supabase, 'gyerek', 'id_csalad', idk)
    }

    case 'sirhely': {
      const temetok = await azonositok(supabase, 'sirhelytemeto', congId)
      if (temetok.error) return { sorok: [], error: temetok.error }
      if (temetok.idk.length === 0) return { sorok: [], error: null }
      return darabolvaIn(supabase, 'sirhely', 'temetoid', temetok.idk)
    }

    default: {
      const _sohasem: never = kulcs
      return {
        sorok: [],
        error: { code: 'ISMERETLEN_KULCS', message: `Ismeretlen származtatott kulcs: ${_sohasem}` },
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// B) TELJES GYÜLEKEZETI ADATEXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Az export TERVE — mit fog a felület végigjárni, és kinek a nevében.
 * Itt dől el a hatókör; ha nem oldható fel, MAGYARÁZÓ ÜZENET jön, nem adat.
 */
export async function exportTervBetoltes(): Promise<ExportTervValasz> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { ok: false, uzenet: 'Nincs bejelentkezve.' }

  const ctx = await getModuleScopeContext()
  const hatokor = exportHatokorEllenorzes(ctx)
  if (!hatokor.ok) return { ok: false, uzenet: hatokor.uzenet }

  return {
    ok: true,
    gyulekezetId: hatokor.congregationId,
    gyulekezetNev: hatokor.congregationName ?? access.congregationName ?? null,
    keszitetteNev: access.fullName || access.profile?.full_name || null,
    keszitetteEmail: access.profile?.email || access.user.email || null,
    lepesek: EXPORT_TERV.map((e) => ({ tabla: e.tabla, cim: e.cim })),
  }
}

/**
 * EGY nyilvántartás sorai. A felület nyilvántartásonként hívja, hogy a
 * haladás látszódjon, és hogy egy nagy gyülekezet se fusson időtúllépésbe.
 */
export async function exportSzeletBetoltes(tabla: string): Promise<ExportSzeletValasz> {
  const terv = tervElem(tabla)
  // ⛔ ALLOWLIST: a klienstől érkező táblanevet SOHA nem adjuk tovább nyersen.
  if (!terv) {
    return { ok: false, uzenet: 'Ismeretlen nyilvántartás — az export ezt nem kérdezi le.' }
  }

  const ctx = await getModuleScopeContext()
  const hatokor = exportHatokorEllenorzes(ctx)
  if (!hatokor.ok) return { ok: false, uzenet: hatokor.uzenet }
  // A kapu után a kontextus BIZONYÍTOTTAN feloldott — ez az ág nem érhető el,
  // de kimondjuk, hogy a fordító is lássa (és hogy soha ne legyen `as` csalás).
  if ('error' in ctx) return { ok: false, uzenet: ctx.error }

  const supabase = ctx.supabase
  const congId = hatokor.congregationId

  try {
    if (terv.forras.mod === 'kozvetlen') {
      const eredmeny = await kozvetlenSorok(supabase, terv.tabla, congId)
      if (eredmeny.error) {
        const b = hibaBesorolas(terv.tabla, eredmeny.error)
        return {
          ok: true,
          eredmeny: { tabla: terv.tabla, cim: terv.cim, allapot: b.allapot, sorok: [], uzenet: b.uzenet },
        }
      }
      const kimenet: ExportTablaEredmeny = {
        tabla: terv.tabla,
        cim: terv.cim,
        allapot: 'ok',
        sorok: eredmeny.sorok,
        uzenet: eredmeny.csonkolt
          ? `Csak az első ${TABLA_SOR_PLAFON} sor került a csomagba — a nyilvántartás ennél több sort tartalmaz.`
          : null,
        csonkolt: eredmeny.csonkolt,
      }
      return { ok: true, eredmeny: kimenet }
    }

    const szarmaztatott = await szarmaztatottSorok(supabase, terv.forras.kulcs, congId)
    if (szarmaztatott.error) {
      const b = hibaBesorolas(terv.tabla, szarmaztatott.error)
      return {
        ok: true,
        eredmeny: { tabla: terv.tabla, cim: terv.cim, allapot: b.allapot, sorok: [], uzenet: b.uzenet },
      }
    }
    const csonkolt = szarmaztatott.sorok.length > TABLA_SOR_PLAFON
    return {
      ok: true,
      eredmeny: {
        tabla: terv.tabla,
        cim: terv.cim,
        allapot: 'ok',
        sorok: csonkolt ? szarmaztatott.sorok.slice(0, TABLA_SOR_PLAFON) : szarmaztatott.sorok,
        uzenet: csonkolt
          ? `Csak az első ${TABLA_SOR_PLAFON} sor került a csomagba — a nyilvántartás ennél több sort tartalmaz.`
          : null,
        csonkolt,
      },
    }
  } catch (err) {
    const uzenet = err instanceof Error ? err.message : 'ismeretlen hiba'
    return {
      ok: true,
      eredmeny: {
        tabla: terv.tabla,
        cim: terv.cim,
        allapot: 'hiba',
        sorok: [],
        uzenet: `A(z) „${terv.cim}" nyilvántartás nem tölthető be. Részlet: ${uzenet}`,
      },
    }
  }
}

/**
 * Az elkészült export NAPLÓZÁSA. Egy teljes gyülekezeti adatcsomag letöltése
 * önmagában is adatkezelési esemény — jelenjen meg a betekintés-kimutatásban.
 */
export async function exportNaplozas(tablakSzama: number, sorokSzama: number): Promise<{ ok: true }> {
  const ctx = await getModuleScopeContext()
  const hatokor = exportHatokorEllenorzes(ctx)
  if (!hatokor.ok) return { ok: true }

  // A SZEREPKÖRT is rögzítjük: a teljes gyülekezeti dosszié letöltése ma
  // MINDEN gyülekezeti hatókörű felhasználónak elérhető (a tartalmat táblánként
  // az RLS szűri). Ha később szerepkörhöz kell kötni, ez a mező mutatja meg,
  // ki élt vele — visszamenőleg is.
  const access = await getEffectiveAccessContext()

  await logAuditEvent({
    action: 'adatexport.gyulekezet',
    targetTable: 'congregations',
    targetId: hatokor.congregationId,
    metadata: {
      tablak: Number.isFinite(tablakSzama) ? tablakSzama : 0,
      sorok: Number.isFinite(sorokSzama) ? sorokSzama : 0,
      szerep: access.role,
    },
  })
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// A) BETEKINTÉS-KIMUTATÁS
// ─────────────────────────────────────────────────────────────────────────────

function napokkalEzelott(napok: number): string {
  const n = Number.isFinite(napok) && napok > 0 ? Math.min(Math.floor(napok), 3650) : 30
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

function naploHianyzik(error: SupabaseLikeError): boolean {
  const kod = (error?.code || '').trim()
  const uzenet = (error?.message || '').trim()
  return (
    kod === '42P01' ||
    kod === 'PGRST202' ||
    kod === 'PGRST205' ||
    /does not exist|schema cache|could not find the function/i.test(uzenet)
  )
}

/**
 * A kimutatás egy szelete.
 *
 * ⛔ HATÓKÖR:
 *   · `sajat`      — KIZÁRÓLAG a bejelentkezett felhasználó saját sorai. A
 *                    szűrőt EXPLICIT kiírjuk (`user_id = <saját>`), nem bízzuk
 *                    pusztán az RLS-re: a policy `user_id = auth.uid() OR
 *                    is_admin()`, tehát egy rendszergazda enélkül MINDENKI
 *                    sorát látná a saját kimutatásában.
 *   · `gyulekezet` — a gyülekezet adatain végzett műveletek, a hatókör-kapun
 *                    át (`get_record_audit` RPC, a saját gyülekezet id-jével).
 *                    Ha a hatókör nem oldható fel: magyarázat, nulla adat.
 */
export async function betekintesNaploBetoltes(
  szelet: BetekintesSzelet,
  napok: number,
): Promise<BetekintesValasz> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { ok: false, uzenet: 'Nincs bejelentkezve.' }

  const tol = napokkalEzelott(napok)
  const sajatNev = access.fullName || access.profile?.full_name || null
  const sajatEmail = access.profile?.email || access.user.email || null

  if (szelet === 'sajat') {
    const { data, error } = await access.supabase
      .from('audit_log')
      .select('id, action, target_table, created_at')
      .eq('user_id', access.user.id)
      .gte('created_at', tol)
      .order('created_at', { ascending: false })
      .limit(BETEKINTES_PLAFON)

    if (error) {
      if (naploHianyzik(error)) {
        return {
          ok: true,
          bejegyzesek: [],
          naploElerheto: false,
          megjegyzes:
            'A tevékenység-napló ebben a rendszerben még nincs bekapcsolva, ezért a kimutatás üres. ' +
            'Ez nem azt jelenti, hogy nem történt semmi — csak azt, hogy a napló-réteg még nem áll rendelkezésre.',
          csonkolt: false,
        }
      }
      return { ok: false, uzenet: `A napló nem tölthető be: ${error.message}` }
    }

    const sorok = (data ?? []) as {
      id: string
      action: string
      target_table: string | null
      created_at: string
    }[]

    const bejegyzesek: BetekintesBejegyzes[] = sorok.map((s) => ({
      id: String(s.id),
      mikor: s.created_at,
      kiNeve: sajatNev,
      kiEmail: sajatEmail,
      muvelet: s.action,
      tabla: s.target_table,
      forras: 'esemeny',
      sajat: true,
    }))

    return {
      ok: true,
      bejegyzesek,
      naploElerheto: true,
      megjegyzes: null,
      csonkolt: bejegyzesek.length >= BETEKINTES_PLAFON,
    }
  }

  // ── gyülekezeti szelet ────────────────────────────────────────────────────
  const ctx = await getModuleScopeContext()
  const hatokor = exportHatokorEllenorzes(ctx)
  if (!hatokor.ok) return { ok: false, uzenet: hatokor.uzenet }

  const { data, error } = await access.supabase.rpc('get_record_audit', {
    p_congregation_id: hatokor.congregationId,
    p_actor_id: null,
    p_table: null,
    p_from: tol,
    p_to: null,
    p_limit: BETEKINTES_PLAFON,
  })

  if (error) {
    if (naploHianyzik(error)) {
      return {
        ok: true,
        bejegyzesek: [],
        naploElerheto: false,
        megjegyzes:
          'A rekord-szintű változás-napló ebben a rendszerben még nincs bekapcsolva ' +
          '(migration-docs/sql/2026-06-05n-row-audit.sql), ezért a kimutatás üres. ' +
          'Ez nem adatvesztés — a napló-réteg telepítése után a bejegyzések itt fognak megjelenni.',
        csonkolt: false,
      }
    }
    return { ok: false, uzenet: `A napló nem tölthető be: ${error.message}` }
  }

  const sorok = (data ?? []) as {
    id: number
    ts: string
    table_name: string
    op: string
    actor_id: string | null
    actor_name: string | null
  }[]

  const bejegyzesek: BetekintesBejegyzes[] = sorok.map((s) => ({
    id: String(s.id),
    mikor: s.ts,
    kiNeve: s.actor_name,
    kiEmail: null,
    muvelet: s.op,
    tabla: s.table_name,
    forras: 'rekord',
    sajat: !!s.actor_id && s.actor_id === access.user?.id,
  }))

  return {
    ok: true,
    bejegyzesek,
    naploElerheto: true,
    megjegyzes: null,
    csonkolt: bejegyzesek.length >= BETEKINTES_PLAFON,
  }
}
