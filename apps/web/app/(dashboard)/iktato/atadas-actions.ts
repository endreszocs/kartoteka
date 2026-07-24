'use server'

/**
 * Iktató F8b (B3) — egyháztag-átadás flow szerver akciói.
 *
 *  - searchCongregations: ékezet-toleráns gyülekezet-kereső az ÖSSZES
 *    congregation közt (a saját kizárva, max 12) — az „Egyháztag átadása
 *    másik egyházközségnek" sablon {{cel_gyulekezet}} mezőjéhez.
 *  - registerAtadas: az átadás TÉNYÉNEK rögzítése (elkoltozott-sor
 *    hova_congregation_id-vel + member_status) ÉS a cél-gyülekezet
 *    értesítése.
 *
 * ÉRTESÍTÉSI CSATORNÁK (2026-07-25-ös vizsgálat):
 *  1. GARANTÁLT — member_transfer_notifications: az elkoltozott-ba szúrt sor
 *     (hova_congregation_id kitöltve) AFTER INSERT triggere
 *     (create_transfer_notification_on_elkoltozott, SECURITY DEFINER,
 *     postgres owner — 2026-04-30d + 2026-07-17 legacy-compat SQL) hozza
 *     létre a pending átjelentkezési kérelmet, amit a cél-gyülekezet
 *     lelkésze a bell-badge-ben/inboxában lát (listInboundTransfer-
 *     Notifications) és el is fogadhat. Az RLS-t a definer jog hidalja át —
 *     ez az EGYETLEN biztonságos kereszt-gyülekezeti írási út.
 *  2. BEST-EFFORT — ertesitesek: a részletes szöveg (+ a dokumentum
 *     szövege) a cél-gyülekezet lelkész(ei)nek. Az ertesitesek RLS-e
 *     (ertesitesek_user: user_id = auth.uid() OR global — 2026-04-13
 *     rls-hybrid-admin-tables.sql, WITH CHECK nélküli FOR ALL, így a USING
 *     az insertre is érvényes) a más felhasználónak szóló beszúrást SIMA
 *     lelkésznél elutasítja — ilyenkor warning megy vissza, a flow nem
 *     bukik el (a submitDocument/document-actions.ts ugyanezt best-effort
 *     kezeli). Globális jogú usernél (admin/master) az üzenet kézbesül.
 *
 * ⚠️ NÉMA-ÜRES-LISTA HIBAOSZTÁLY: minden DB-hiba az `error`/`warnings`
 * mezőben jön vissza, sosem nyelődik el üres eredménnyé. Csak verifikált
 * oszlopok: congregations (name, nev_hu, nev_ro, diocese_id), dioceses
 * (name), szemely (csaladnev, k_nev, member_status), elkoltozott
 * (id_szemely, kulfoldre, mikor, megjegyzes, congregation_id,
 * hova_congregation_id), ertesitesek (user_id, congregation_id, cim,
 * uzenet, tipus, hivatkozas), profiles (id, congregation_id, role, status),
 * profile_roles (profile_id, scope, scope_id, role, approval_status, active).
 */

import { revalidatePath } from 'next/cache'

import { logAuditEvent } from '@/lib/audit/log'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { personSearchScore, tokenize } from '@/lib/import/person-search-match'
import type {
  CongregationSearchHit,
  RegisterAtadasInput,
  RegisterAtadasResult,
} from '@/lib/iktato/atadas-types'

// ─────────────────────────────────────────────────────────────────
// 1) Gyülekezet-kereső (cél-egyházközség kiválasztásához)
// ─────────────────────────────────────────────────────────────────

/**
 * Név-keresés az ÖSSZES gyülekezet közt (a saját kizárva, max 12 találat).
 *
 * A congregations SELECT-je minden bejelentkezett usernek nyitott
 * (congregations_read policy: USING (true) — 2026-04-13-rls-reference-tables
 * .sql; a valassz-profilt/scope-lekérdezések is erre építenek), így nincs
 * RLS-korlát a névsoron. A bevált searchPersonsForCertificate mintát
 * követi: determinisztikus .order('id') + 1000-es lapozás (a PostgREST
 * 1000-es alaplimitje felett is minden gyülekezet kereshető marad), majd
 * JS-szűrés a person-search-match ékezet- és pozíció-független
 * illesztőjével (name + nev_hu + nev_ro is találat, ékezet nélkül is).
 */
export async function searchCongregations(
  query: string,
): Promise<{ results: CongregationSearchHit[]; error: string | null }> {
  const { supabase, congId } = await getCongId()
  if (!congId) return { results: [], error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }

  const trimmed = (query || '').trim()
  if (trimmed.length < 2) return { results: [], error: null }
  const tokens = tokenize(trimmed)
  if (tokens.length === 0) return { results: [], error: null }

  type NameRel = { name: string | null } | { name: string | null }[] | null
  type CongRow = {
    id: string
    name: string | null
    nev_hu: string | null
    nev_ro: string | null
    megye: NameRel
  }
  const one = (v: NameRel): string | null => {
    const row = Array.isArray(v) ? v[0] || null : v
    return (row?.name || '').trim() || null
  }

  const PAGE_SIZE = 1000
  const rows: CongRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('congregations')
      .select('id, name, nev_hu, nev_ro, megye:dioceses!diocese_id(name)')
      .neq('id', congId)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) return { results: [], error: `Gyülekezet-keresési hiba: ${error.message}` }
    const page = (data || []) as unknown as CongRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  // JS-szűrés: MINDEN token szerepeljen a nevek valamelyikében (magyar,
  // hivatalos vagy román név) — a pontozás a szó-eleji egyezést jutalmazza.
  const scored: Array<{ c: CongRow; score: number }> = []
  for (const c of rows) {
    const score = personSearchScore(
      { nameParts: [c.name, c.nev_hu, c.nev_ro], addressParts: [one(c.megye)] },
      tokens,
    )
    if (score === null) continue
    scored.push({ c, score })
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.c.nev_hu || a.c.name || '').localeCompare(b.c.nev_hu || b.c.name || '', 'hu'),
  )

  const results: CongregationSearchHit[] = scored.slice(0, 12).map(({ c }) => ({
    id: c.id,
    nev: (c.nev_hu || '').trim() || (c.name || '').trim() || 'Ismeretlen gyülekezet',
    megye: one(c.megye),
  }))
  return { results, error: null }
}

// ─────────────────────────────────────────────────────────────────
// 2) Az átadás rögzítése + a cél-gyülekezet értesítése
// ─────────────────────────────────────────────────────────────────

/**
 * Az egyháztag-átadás TÉNYÉNEK rögzítése a kiállított (és már iktatott)
 * igazolás alapján:
 *
 *  1. tulajdonjog-ellenőrzés (a tag a SAJÁT gyülekezeté — IDOR-védelem,
 *     a removeMember 2026-06-10-es mintája),
 *  2. elkoltozott-sor beszúrása hova_congregation_id-vel + az iktatószámmal
 *     a megjegyzésben → a SECURITY DEFINER trigger automatikusan létrehozza
 *     a cél-gyülekezet pending átjelentkezési kérelmét (ez a garantált
 *     kereszt-gyülekezeti értesítés — a megjegyzés a member_snapshot-ba is
 *     bekerül, így a cél-lelkész az iktatószámot is látja),
 *  3. szemely.member_status = 'elköltözött' (a removeMember 'elkoltozott'
 *     ágával azonosan),
 *  4. best-effort ertesitesek-üzenet a cél-gyülekezet lelkészeinek a kért
 *     szöveggel + a dokumentum szövegével (RLS-elutasításnál warning),
 *  5. F8c: best-effort kereszt-iktatás — az igazolás a FOGADÓ gyülekezet
 *     iktatójába BEJÖVŐ iratként is bekerül (iktato_atadas_bejegyzes
 *     SECURITY DEFINER RPC, hivatkozással a küldő iktatószámára); hibája
 *     warning, a kiosztott fogadó-oldali iktatószám a warnings-ban és a
 *     fogadoIktatoszam mezőben jön vissza.
 *
 * Duplikátum-őr: ha a taghoz MÁR van függő (pending) átjelentkezési kérelem
 * ugyanahhoz a cél-gyülekezethez, új elkoltozott-sort nem szúrunk be (nem
 * duplázzuk a kérelmet), de a státusz-frissítés és az értesítés lefut.
 */
export async function registerAtadas(input: RegisterAtadasInput): Promise<RegisterAtadasResult> {
  const warnings: string[] = []

  // ── Bemenet-validálás (zod nélkül is szigorú) ────────────────────
  const szemelyId = input?.szemelyId
  const celCongregationId = (input?.celCongregationId || '').trim()
  const iktatoszam = (input?.iktatoszam || '').trim()
  const dokumentumHtml = input?.dokumentumHtml || ''
  if (!Number.isInteger(szemelyId) || szemelyId <= 0) {
    return { success: false, error: 'Érvénytelen személy-azonosító.', warnings }
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(celCongregationId)) {
    return { success: false, error: 'Érvénytelen cél-egyházközség azonosító.', warnings }
  }
  if (!iktatoszam || iktatoszam.length > 40) {
    return {
      success: false,
      error: 'Az iktatószám kötelező (előbb iktasd az igazolást a kiállítóban).',
      warnings,
    }
  }

  const { supabase, congId, userId } = await getCongId()
  if (!congId) return { success: false, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.', warnings }
  if (celCongregationId === congId) {
    return { success: false, error: 'A cél-egyházközség nem lehet a saját gyülekezet.', warnings }
  }

  // ── Tulajdonjog + nevek (egy körben: saját tag, saját + cél gyülekezet) ──
  const [personRes, congRes] = await Promise.all([
    supabase
      .from('szemely')
      .select('id, csaladnev, k_nev')
      .eq('id', szemelyId)
      .eq('congregation_id', congId)
      .maybeSingle(),
    supabase
      .from('congregations')
      .select('id, name, nev_hu')
      .in('id', [congId, celCongregationId]),
  ])
  if (personRes.error) {
    return { success: false, error: `A tag ellenőrzése sikertelen: ${personRes.error.message}`, warnings }
  }
  if (!personRes.data) {
    return { success: false, error: 'A megadott tag nem található az aktív gyülekezetben.', warnings }
  }
  if (congRes.error) {
    return { success: false, error: `A gyülekezetek lekérése sikertelen: ${congRes.error.message}`, warnings }
  }
  type CongNameRow = { id: string; name: string | null; nev_hu: string | null }
  const congName = (id: string): string | null => {
    const row = ((congRes.data || []) as CongNameRow[]).find((c) => c.id === id)
    if (!row) return null
    return (row.nev_hu || '').trim() || (row.name || '').trim() || null
  }
  const sajatNev = congName(congId) || 'gyülekezetünk'
  const celNev = congName(celCongregationId)
  if (!celNev) {
    return { success: false, error: 'A cél-egyházközség nem található.', warnings }
  }
  const tagNev =
    [personRes.data.csaladnev, personRes.data.k_nev]
      .map((s) => (s || '').trim())
      .filter(Boolean)
      .join(' ') || 'az egyháztag'

  // ── Duplikátum-őr: van-e már FÜGGŐ kérelem ehhez a cél-gyülekezethez? ──
  // (RLS: a forrás-gyülekezet látja a sajátjait — mtn_access. Megjegyzés: a
  // policy a profiles-skalár current_user_congregation_id()-re épül; scope-
  // divergenciánál a guard legfeljebb nem talál — az nem blokkoló hiba.)
  let skipElkoltozott = false
  const { data: pendingRows, error: pendingErr } = await supabase
    .from('member_transfer_notifications')
    .select('id')
    .eq('szemely_id', szemelyId)
    .eq('target_congregation_id', celCongregationId)
    .eq('status', 'pending')
    .limit(1)
  if (pendingErr) {
    warnings.push(`A függő átjelentkezési kérelmek ellenőrzése nem sikerült (${pendingErr.message}) — a rögzítés e nélkül folytatódott.`)
  } else if ((pendingRows || []).length > 0) {
    skipElkoltozott = true
    warnings.push('Ehhez a taghoz már van függő átjelentkezési kérelem a cél-gyülekezet felé — új kérelem nem jött létre, csak az igazolás ténye rögzült.')
  }

  // ── Az átadás rögzítése: elkoltozott-sor (trigger → cél-értesítés) ──
  if (!skipElkoltozott) {
    const { error: insErr } = await supabase.from('elkoltozott').insert([
      {
        id_szemely: szemelyId,
        congregation_id: congId,
        mikor: new Date().toISOString(),
        kulfoldre: false,
        // A trigger a megjegyzést a member_snapshot-ba másolja → a
        // cél-lelkész az inboxában az iktatószámot is látja.
        megjegyzes: `Egyháztag-átadási igazolás — iktatószám: ${iktatoszam}`,
        hovaid: null,
        hova_congregation_id: celCongregationId,
      },
    ])
    if (insErr) {
      return { success: false, error: `Az átadás rögzítése sikertelen: ${insErr.message}`, warnings }
    }
  }

  // ── Tag-státusz: elköltözött (a removeMember 'elkoltozott' ága szerint) ──
  const { error: updErr } = await supabase
    .from('szemely')
    .update({ member_status: 'elköltözött', congregation_id: congId })
    .eq('id', szemelyId)
    .eq('congregation_id', congId)
  if (updErr) {
    return {
      success: false,
      error: `Az átadás rögzült (a cél-gyülekezet átjelentkezési értesítést kapott), de a tag státuszának átállítása nem sikerült: ${updErr.message}`,
      warnings,
    }
  }

  // ── Best-effort in-app értesítés a cél-gyülekezet lelkészeinek ────
  // Címzett-kör a submitDocument (document-actions.ts) + profile_roles
  // scope-minta (system-finance-actions.ts) szerint; a profiles SELECT
  // mindenkinek nyitott (profiles_read_all), a profile_roles-lekérés RLS-hibája
  // nem blokkol. Az INSERT sima lelkésznél az ertesitesek RLS-én elbukhat —
  // ilyenkor warning, a garantált csatorna (átjelentkezési kérelem) már él.
  try {
    const [profRes, roleRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id')
        .eq('congregation_id', celCongregationId)
        .eq('role', 'lelkesz')
        .eq('status', 'active'),
      supabase
        .from('profile_roles')
        .select('profile_id')
        .eq('scope', 'congregation')
        .eq('scope_id', celCongregationId)
        .eq('role', 'lelkesz')
        .eq('approval_status', 'approved')
        .eq('active', true),
    ])
    const recipientIds = new Set<string>()
    for (const r of (profRes.data || []) as Array<{ id: string }>) recipientIds.add(r.id)
    for (const r of (roleRes.data || []) as Array<{ profile_id: string }>) recipientIds.add(r.profile_id)

    if (recipientIds.size === 0) {
      warnings.push('A cél-gyülekezethez nem található aktív lelkész-profil — részletes in-app üzenet nem ment ki (az átjelentkezési kérelmet a beépített workflow így is kézbesíti).')
    } else {
      const uzenetFo = `A(z) ${sajatNev} egyháztag-átadási igazolást állított ki ${tagNev} részére az Önök egyházközsége felé (${iktatoszam}).`
      const dokSzoveg = htmlToPlainText(dokumentumHtml)
      const uzenet = dokSzoveg
        ? `${uzenetFo}\n\n— A kiállított dokumentum szövege —\n${dokSzoveg}`
        : uzenetFo
      const rows = Array.from(recipientIds).map((rid) => ({
        user_id: rid,
        congregation_id: celCongregationId,
        cim: `Egyháztag-átadási igazolás érkezett: ${tagNev}`,
        uzenet,
        tipus: 'info',
        hivatkozas: '/notifications',
      }))
      const { error: notifErr } = await supabase.from('ertesitesek').insert(rows)
      if (notifErr) {
        warnings.push(`A részletes in-app üzenetet az értesítés-tábla jogosultsági szabálya (RLS) elutasította (${notifErr.message}) — a cél-gyülekezet a beépített átjelentkezési kérelmet (iktatószámmal) ettől függetlenül megkapja.`)
      }
    }
  } catch (e) {
    warnings.push(`A részletes in-app üzenet küldése nem sikerült (${e instanceof Error ? e.message : 'ismeretlen hiba'}) — az átjelentkezési kérelem kézbesült.`)
  }

  // ── F8c: az igazolás iktatása a FOGADÓ gyülekezetnél BEJÖVŐ iratként ──
  // A kereszt-gyülekezeti írást a SECURITY DEFINER iktato_atadas_bejegyzes
  // RPC végzi (2026-07-25-f8c-atadas-kereszt-iktatas.sql): auth-horgonya a
  // fenti elkoltozott-trigger által létrehozott (vagy már meglévő pending)
  // átjelentkezési kérelem. Best-effort: ha az RPC hibázik (pl. a migráció
  // még nem fut le, vagy a fogadó éve lezárt), csak warning megy vissza —
  // az átadás és a kérelem ettől függetlenül él.
  let fogadoIktatoszam: string | null = null
  try {
    const ma = new Date().toISOString().slice(0, 10)
    const { data: crossData, error: crossErr } = await supabase.rpc('iktato_atadas_bejegyzes', {
      p_szemely_id: szemelyId,
      p_target_congregation_id: celCongregationId,
      p_direction: 'incoming',
      p_subject: `Egyháztag-átadási igazolás — ${tagNev} (érkezett: ${sajatNev})`,
      p_sender_or_recipient: sajatNev,
      p_kelt: ma,
      p_external_ref_szam: iktatoszam,
      p_targykivonat: `${tagNev} egyháztag-átadási igazolása a(z) ${sajatNev} egyházközségtől (küldő iktatószám: ${iktatoszam}).`,
    })
    if (crossErr) {
      // PGRST202 / 42883 = az RPC még nincs telepítve az adatbázisban.
      const rpcMissing =
        crossErr.code === 'PGRST202' ||
        crossErr.code === '42883' ||
        /could not find the function/i.test(crossErr.message)
      warnings.push(
        rpcMissing
          ? 'Az igazolás a fogadó gyülekezet iktatójába NEM került be: a kereszt-gyülekezeti iktató funkció (iktato_atadas_bejegyzes) még nincs telepítve az adatbázisban — az átjelentkezési kérelem ettől függetlenül kézbesült.'
          : `Az igazolás a fogadó gyülekezet iktatójába nem került be (${crossErr.message}) — az átjelentkezési kérelem ettől függetlenül kézbesült.`,
      )
    } else {
      const parsedCross = (crossData || null) as {
        year?: number
        sequence_number?: number
      } | null
      if (
        parsedCross &&
        typeof parsedCross.year === 'number' &&
        typeof parsedCross.sequence_number === 'number'
      ) {
        fogadoIktatoszam = `${parsedCross.year}/${parsedCross.sequence_number}`
        warnings.push(
          `Az igazolás a(z) ${celNev} iktatókönyvében bejövő iratként is iktatva lett: ${fogadoIktatoszam} (hivatkozással a ${iktatoszam} iktatószámra).`,
        )
      } else {
        warnings.push(
          'A fogadó-oldali iktatás megtörtént, de a kiosztott iktatószám nem olvasható ki a válaszból.',
        )
      }
    }
  } catch (e) {
    warnings.push(
      `Az igazolás fogadó-oldali iktatása nem sikerült (${e instanceof Error ? e.message : 'ismeretlen hiba'}) — az átjelentkezési kérelem kézbesült.`,
    )
  }

  await logAuditEvent(
    {
      action: 'member.transfer_certificate',
      targetTable: 'szemely',
      targetId: String(szemelyId),
      metadata: {
        iktatoszam,
        cel_congregation_id: celCongregationId,
        actor_id: userId ?? null,
        duplicate_pending_skip: skipElkoltozott,
        // F8c: a fogadó gyülekezetnél kiosztott bejövő iktatószám (ha sikerült).
        fogado_iktatoszam: fogadoIktatoszam,
      },
    },
    supabase,
  )

  revalidatePath('/tagnyilvantartas')
  revalidatePath('/anyakonyv')
  revalidatePath('/notifications')
  return { success: true, error: null, warnings, fogadoIktatoszam }
}

// ─────────────────────────────────────────────────────────────────
// Belső segédek (nem exportáltak — 'use server' fájl csak async
// function-t exportálhat, lásd MEMORY: nextjs16_use_server_only_async)
// ─────────────────────────────────────────────────────────────────

async function getCongId() {
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId, userId }
}

/**
 * A kiállított dokumentum HTML-je → olvasható sima szöveg az értesítés
 * törzsébe (az ertesitesek.uzenet text-oszlop, de a bell-dropdown sima
 * szövegként jeleníti meg). Túl hosszú dokumentumnál levágjuk.
 */
function htmlToPlainText(html: string): string {
  const MAX_LEN = 6000
  const text = String(html || '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
  if (text.length <= MAX_LEN) return text
  return `${text.slice(0, MAX_LEN)}\n… (a szöveg levágva — a teljes dokumentum a kiállító gyülekezet iktatójában, a fenti iktatószámon érhető el)`
}
