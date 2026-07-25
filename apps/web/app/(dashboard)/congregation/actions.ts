'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { normalizeDebtCalcMode } from '@/lib/constants/finance'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import {
  transferInitiatedEmail,
  transferCompletedEmail,
  transferInviteEmail,
} from '@/lib/email/templates/congregation-transfer'
import { logAuditEvent } from '@/lib/audit/log'

// 2026-07-17 (F5): HH-NN érvényes tartománnyal (hónap 01-12, nap 01-31) — a puszta
// \d{2}-\d{2} a '13-01'-et is átengedte, amit a motor a KÖVETKEZŐ évre görgetett
// (az időszaki kedvezmény egész évben „elérhetőnek" látszott).
const MONTH_DAY_REGEX = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/

const congregationSchema = z.object({
  id: z.string().uuid(),
  // 2026-06-21: a welcome-varázsló „Hivatalos név" mezője (a `name` oszlopba) — eddig csak a
  // varázslóban volt szerkeszthető, a Beállítások felülírta `nevHu`-val. Mostantól itt is állítható.
  nev: z.string().optional(),
  nevHu: z.string().min(2, 'A magyar név kötelező.'),
  nevRo: z.string().optional(),
  nevEn: z.string().optional(),
  adoszam: z.string().optional(),
  cim: z.string().optional(),
  // 2026-06-21: strukturált hivatalos cím (a welcome-varázslóból) — utólag is szerkeszthető.
  megye: z.string().max(200).optional(),
  varos: z.string().max(200).optional(),
  iranyitoszam: z.string().max(20).optional(),
  hazszam: z.string().max(50).optional(),
  country: z.string().max(100).optional(),
  adrlocality_id: z.number().int().positive().nullable().optional(),
  adrstreet_id: z.number().int().positive().nullable().optional(),
  email: z.string().email().optional().or(z.literal('')),
  telefon: z.string().optional(),
  web: z.string().optional(),
  evesJarulek: z.number().min(0).default(100),
  jarulekKedvezmenyes: z.number().min(0).default(0),
  jarulekHatarid: z.string().regex(MONTH_DAY_REGEX).default('07-01'),
  iban: z.string().optional(),
  bank: z.string().optional(),
  dioceseId: z.string().uuid().optional().or(z.literal('')),
  tartozasSzamitasMod: z.enum(['akkori', 'aktualis']).default('akkori'),
  cimerUrl: z.string().url().optional().or(z.literal('')),
})

const bankAccountSchema = z.object({
  id: z.number().int().positive().optional(),
  bankNeve: z.string().min(2, 'A bankszámla nevéhez legalább 2 karakter kell.'),
  iban: z.string().optional(),
  valuta: z.string().min(1).default('RON'),
  nyitoEgyenleg: z.number().default(0),
  szin: z.string().default('#206bc4'),
  ikon: z.string().default('building-2'),
  isDefault: z.boolean().default(false),
  aktiv: z.boolean().default(true),
})

const feeDiscountSchema = z
  .object({
    id: z.string().uuid().optional(),
    ev: z.number().int().min(2000).max(2100),
    tipus: z.enum(['idoszak', 'kor', 'jovedelem', 'foglalkozas']),
    sorrend: z.number().int().min(0).default(0),
    aktiv: z.boolean().default(true),
    kezdet: z.string().regex(MONTH_DAY_REGEX, 'Érvénytelen hónap-nap (HH-NN), pl. 07-01.').optional().or(z.literal('')),
    hatarid: z.string().regex(MONTH_DAY_REGEX, 'Érvénytelen hónap-nap (HH-NN), pl. 07-01.').optional().or(z.literal('')),
    kedvOsszeg: z.number().min(0).nullable().optional(),
    korTol: z.number().int().min(0).nullable().optional(),
    szazalek: z.number().min(0).max(100).nullable().optional(),
    fixOsszeg: z.number().min(0).nullable().optional(),
    jovLeiras: z.string().optional().or(z.literal('')),
    /** 2026-07-17 (F5): a kor-kedvezmény módja — % (levonandó) vagy fix RON (fizetendő). */
    korMode: z.enum(['szazalek', 'fix']).optional(),
  })
  // Q8 (user-döntés): a 0 RON-os időszaki szabály TILOS — a motor nem-szabályként
  // eldobná, miközben a kártya „él"-ként mutatná (néma no-op).
  .refine((d) => d.tipus !== 'idoszak' || (d.kedvOsszeg ?? 0) >= 1, {
    message: 'Az időszaki kedvezményes összeg legalább 1 RON legyen.',
    path: ['kedvOsszeg'],
  })
  // A járulék 18 éves kortól jár — 0-s korhatár (üres input) minden felnőttre érvényesítené.
  // 2026-07-25 (G1): fordított időszak (kezdet > hatarid) tiltása — a motor
  // ilyenkor jan. 1-től a vég-dátumig MINDENKIRE a kedvezményes árat adná.
  .refine((d) => d.tipus !== 'idoszak' || !d.kezdet || !d.hatarid || d.kezdet <= d.hatarid, {
    message: 'A kezdő dátum nem lehet későbbi a vég dátumnál (pl. 01-01 → 07-01).',
    path: ['kezdet'],
  })
  .refine((d) => d.tipus !== 'kor' || (d.korTol ?? 0) >= 18, {
    message: 'A korhatár legalább 18 év legyen.',
    path: ['korTol'],
  })

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined) {
  const lower = error?.message?.toLowerCase() || ''
  return error?.code === '42P01' || (lower.includes('relation') && lower.includes('does not exist'))
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined) {
  const lower = error?.message?.toLowerCase() || ''
  return lower.includes('column') || lower.includes('schema cache') || lower.includes('could not find')
}

function isPermissionError(error: { code?: string; message?: string } | null | undefined) {
  const lower = error?.message?.toLowerCase() || ''
  return error?.code === '42501' || lower.includes('permission denied') || lower.includes('not allowed')
}

function normalizeBankAccountRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    bank_neve: String(row.bank_neve || 'Bankszámla'),
    iban: typeof row.iban === 'string' ? row.iban : null,
    valuta: typeof row.valuta === 'string' && row.valuta ? row.valuta : 'RON',
    aktiv: typeof row.aktiv === 'boolean' ? row.aktiv : true,
    nyito_egyenleg:
      typeof row.nyito_egyenleg === 'number'
        ? row.nyito_egyenleg
        : row.nyito_egyenleg == null
          ? 0
          : Number(row.nyito_egyenleg) || 0,
    szin: typeof row.szin === 'string' && row.szin ? row.szin : '#206bc4',
    ikon: typeof row.ikon === 'string' && row.ikon ? row.ikon : 'building-2',
    is_default: typeof row.is_default === 'boolean' ? row.is_default : false,
  }
}

function normalizeFeeDiscountRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    ev: Number(row.ev) || new Date().getFullYear(),
    tipus: row.tipus === 'idoszak' || row.tipus === 'kor' || row.tipus === 'jovedelem' || row.tipus === 'foglalkozas' ? row.tipus : 'idoszak',
    sorrend: Number(row.sorrend) || 0,
    aktiv: typeof row.aktiv === 'boolean' ? row.aktiv : true,
    kezdet: typeof row.kezdet === 'string' ? row.kezdet : null,
    hatarid: typeof row.hatarid === 'string' ? row.hatarid : null,
    kedv_osszeg: row.kedv_osszeg == null ? null : Number(row.kedv_osszeg) || 0,
    kor_tol: row.kor_tol == null ? null : Number(row.kor_tol) || 0,
    szazalek: row.szazalek == null ? null : Number(row.szazalek) || 0,
    fix_osszeg: row.fix_osszeg == null ? null : Number(row.fix_osszeg) || 0,
    jov_leiras: typeof row.jov_leiras === 'string' ? row.jov_leiras : null,
  }
}

async function requireActiveCongregation(id: string) {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.profile) return { error: 'Nincs bejelentkezett felhasználó.' as const }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' as const }
  if (access.effectiveCongregationId !== id) {
    return { error: 'A megadott gyülekezet nem érhető el az aktuális munkamenetből.' as const }
  }

  return { access }
}

async function getAnnualFeeRowsCompat(congregationId: string) {
  const supabase = await createClient()
  // 2026-07-17 (F1-3): a panel a MOTOR által ténylegesen használt `bealitas`
  // év-sorokat mutatja (elsődleges forrás) — korábban a congregation_annual_fees-t
  // olvasta, amit a tartozás-számítás sosem használt, így a panel „működni
  // látszott", miközben a rögzített díjak hatástalanok voltak. A legacy sorok
  // csak azokra az évekre jelennek meg, amelyekhez nincs bealitas sor (a régen
  // rögzített díj nem tűnik el; újramentéskor átkerül a bealitas-ba).
  const [bealitasRes, legacyRes] = await Promise.all([
    supabase
      .from('bealitas')
      .select('id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid')
      .eq('congregation_id', congregationId),
    supabase
      .from('congregation_annual_fees')
      .select('*')
      .eq('congregation_id', congregationId)
      .order('year', { ascending: false }),
  ])

  if (bealitasRes.error) throw new Error(bealitasRes.error.message)

  const rows: Array<{
    year: number
    eves_jarulek: number
    jarulek_kedvezmenyes: number | null
    jarulek_hatarid: string | null
    note: string | null
  }> = []
  const seenYears = new Set<number>()
  for (const b of (bealitasRes.data || []) as Array<{ id: string; eves_jarulek: number | null; jarulek_kedvezmenyes: number | null; jarulek_hatarid: string | null }>) {
    const year = Number(b.id)
    if (!Number.isFinite(year) || year < 1900) continue
    seenYears.add(year)
    rows.push({
      year,
      eves_jarulek: Number(b.eves_jarulek) || 0,
      jarulek_kedvezmenyes: b.jarulek_kedvezmenyes == null ? null : Number(b.jarulek_kedvezmenyes) || 0,
      jarulek_hatarid: b.jarulek_hatarid || null,
      note: null,
    })
  }

  let warning: string | undefined
  if (legacyRes.error) {
    if (isMissingRelationError(legacyRes.error)) {
      warning =
        'Az éves egyházfenntartási előzményekhez még futtatni kell a `migration-docs/sql/2026-04-09-profile-and-congregation-extensions.sql` és a `migration-docs/sql/2026-04-09-extension-table-policies.sql` fájlokat.'
    } else if (isPermissionError(legacyRes.error)) {
      warning =
        'Az éves előzmények táblája már létezik, de az aktuális adatbázis-jogosultság nem engedi az olvasását. Futtasd le a `migration-docs/sql/2026-04-09-extension-table-policies.sql` fájlt.'
    } else {
      warning = legacyRes.error.message
    }
  } else {
    for (const row of (legacyRes.data || []) as Array<Record<string, unknown>>) {
      const year = Number(row.year)
      if (!Number.isFinite(year) || seenYears.has(year)) continue
      rows.push({
        year,
        eves_jarulek: Number(row.eves_jarulek) || 0,
        jarulek_kedvezmenyes: row.jarulek_kedvezmenyes == null ? null : Number(row.jarulek_kedvezmenyes) || 0,
        jarulek_hatarid: typeof row.jarulek_hatarid === 'string' ? row.jarulek_hatarid : null,
        note: 'Régi rögzítés — mentsd újra, hogy a számítás is figyelembe vegye.',
      })
    }
  }

  rows.sort((a, b) => b.year - a.year)
  return { rows, schemaReady: true, ...(warning ? { warning } : {}) }
}

// 2026-07-17 (F1-2 P0): a Beállítások-ablak díjmezői CSAK a congregations táblát
// írták, miközben a Tartozás-motor kizárólag a bealitas év-sorból számol (az csak
// az év ELSŐ pénzügy-megnyitásakor másolódik át egyszer) — az év közbeni
// díj/kedvezmény/határidő-módosítás így némán hatástalan volt. Ez a helper a
// meglévő aktuális évi bealitas sort szinkronban tartja. Ha nincs év-sor, nem hoz
// létre (az első pénzügy-megnyitás a friss congregations-értékekből teszi meg);
// véglegesített évhez nem nyúl. Visszatérés: figyelmeztető szöveg vagy null.
async function syncFeeSettingsToCurrentYearBealitas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  congregationId: string,
  fees: { evesJarulek?: number | null; jarulekKedvezmenyes?: number | null; jarulekHatarid?: string | null },
): Promise<string | null> {
  const yearId = String(new Date().getFullYear())
  const { data: row, error } = await supabase
    .from('bealitas')
    .select('id, budget_finalized, accounting_finalized')
    .eq('congregation_id', congregationId)
    .eq('id', yearId)
    .maybeSingle()
  // A select-hiba ≠ „nincs év-sor": hibánál jelezzük, hogy a szinkron elmaradt,
  // különben a díjmódosítás némán nem érne el a Tartozás-motorig.
  if (error) {
    console.error('[syncFeeSettings] A bealitas év-sor olvasása hibázott:', error)
    return `A gyülekezeti alapadat mentve, de az idei (${yearId}) pénzügyi beállítás ellenőrzése nem sikerült: ${error.message}`
  }
  if (!row) return null
  if (row.budget_finalized || row.accounting_finalized) {
    return `Figyelem: a(z) ${yearId}. évi beállítás véglegesítve van, ezért a díjmódosítás az idei számításokra nem hat.`
  }
  const updates: Record<string, unknown> = {}
  if (fees.evesJarulek != null) updates.eves_jarulek = fees.evesJarulek
  if (fees.jarulekKedvezmenyes != null) updates.jarulek_kedvezmenyes = fees.jarulekKedvezmenyes
  if (fees.jarulekHatarid) updates.jarulek_hatarid = fees.jarulekHatarid
  if (Object.keys(updates).length === 0) return null
  const { error: updateError } = await supabase
    .from('bealitas')
    .update(updates)
    .eq('congregation_id', congregationId)
    .eq('id', yearId)
  if (updateError) {
    return `A gyülekezeti alapadat mentve, de az aktuális évi (${yearId}) pénzügyi beállítás frissítése nem sikerült: ${updateError.message}`
  }
  return null
}

export async function updateCongregation(data: z.infer<typeof congregationSchema>) {
  const parsed = congregationSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const permission = await requireActiveCongregation(parsed.data.id)
  if ('error' in permission) return { error: permission.error }

  const { supabase } = permission.access
  const updates: Record<string, unknown> = {
    // A hivatalos `name` a dedikált „Hivatalos név" mezőből; ha üres VAGY csak whitespace, a magyar
    // (rövid) névre esünk vissza, hogy a `name` soha ne ürüljön ki / ne legyen csupa szóköz (eddig a
    // Beállítások mindig nevHu-val írta felül).
    name: parsed.data.nev?.trim() || parsed.data.nevHu,
    nev_hu: parsed.data.nevHu,
    nev_ro: parsed.data.nevRo || null,
    nev_en: parsed.data.nevEn || null,
    adoszam: parsed.data.adoszam || null,
    cim: parsed.data.cim || null,
    megye: parsed.data.megye || null,
    varos: parsed.data.varos || null,
    iranyitoszam: parsed.data.iranyitoszam || null,
    hazszam: parsed.data.hazszam || null,
    country: parsed.data.country || null,
    adrlocality_id: parsed.data.adrlocality_id ?? null,
    adrstreet_id: parsed.data.adrstreet_id ?? null,
    email: parsed.data.email || null,
    telefon: parsed.data.telefon || null,
    web: parsed.data.web || null,
    eves_jarulek: parsed.data.evesJarulek,
    jarulek_kedvezmenyes: parsed.data.jarulekKedvezmenyes,
    jarulek_hatarid: parsed.data.jarulekHatarid,
    iban: parsed.data.iban || null,
    bank: parsed.data.bank || null,
    diocese_id: parsed.data.dioceseId || null,
    // 2026-07-17 (F5, Q6): a mód kivezetve — mindig 'akkori' íródik (a régi
    // kliensből érkező 'aktualis' sem kerülhet vissza a DB-be).
    tartozas_szamitas_mod: 'akkori',
    cimer_url: parsed.data.cimerUrl || null,
  }

  let { error } = await supabase.from('congregations').update(updates).eq('id', parsed.data.id)

  if (error?.message?.includes('tartozas_szamitas_mod')) {
    delete updates.tartozas_szamitas_mod
    const retry = await supabase.from('congregations').update(updates).eq('id', parsed.data.id)
    error = retry.error
  }

  if (error) return { error: `Hiba: ${error.message}` }

  // 2026-07-17 (F1-2): a díjmezők átvezetése az aktuális évi bealitas sorba,
  // hogy a Tartozások/auto-összeg azonnal az új értékekkel számoljon.
  const syncWarning = await syncFeeSettingsToCurrentYearBealitas(supabase, parsed.data.id, {
    evesJarulek: parsed.data.evesJarulek,
    jarulekKedvezmenyes: parsed.data.jarulekKedvezmenyes,
    jarulekHatarid: parsed.data.jarulekHatarid,
  })

  revalidatePath('/', 'layout')
  return {
    success: syncWarning
      ? `A gyülekezet adatai sikeresen frissültek. ${syncWarning}`
      : 'A gyülekezet adatai sikeresen frissültek.',
  }
}

export async function getDioceses() {
  const supabase = await createClient()
  // A districts JOIN-nal együtt — a CongregationDialog-ban az egyházkerület
  // nevét is meg tudjuk jeleníteni (2026-04-21j).
  const { data } = await supabase
    .from('dioceses')
    .select('id, name, district_id, districts(name)')
    .order('name')
  if (!data) return []
  return data.map((d) => {
    const raw = d as unknown as {
      id: string
      name: string
      district_id: string | null
      districts: { name: string | null } | { name: string | null }[] | null
    }
    const dist = Array.isArray(raw.districts) ? raw.districts[0] : raw.districts
    return {
      id: raw.id,
      name: raw.name,
      district_id: raw.district_id,
      district_name: dist?.name ?? null,
    }
  })
}

export async function getCongregation(id: string) {
  const permission = await requireActiveCongregation(id)
  if ('error' in permission) return null

  const { supabase } = permission.access
  const { data } = await supabase.from('congregations').select('*').eq('id', id).single()
  if (!data) return null

  return {
    ...data,
    tartozas_szamitas_mod: normalizeDebtCalcMode((data as Record<string, unknown>).tartozas_szamitas_mod),
  }
}

export interface CongregationPastorRow {
  id: string
  user_id: string | null
  full_name: string
  role: string
  started_at: string
  ended_at: string | null
  end_reason: string | null
}

/**
 * 2026-06-05: lelkészi szolgálati napló — a gyülekezetben szolgáló (és korábban
 * szolgált) lelkészek, pontos időpontokkal. A `congregation_pastor_history`
 * táblából. Ha a tábla még nem létezik (SQL nem futott), üres listát ad
 * `schemaReady:false` jelzéssel — a UI ekkor segítő üzenetet mutat.
 */
export async function getCongregationPastors(
  congregationId: string,
): Promise<{ rows: CongregationPastorRow[]; schemaReady: boolean; error?: string }> {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { rows: [], schemaReady: true, error: permission.error }

  const { supabase } = permission.access
  const { data, error } = await supabase
    .from('congregation_pastor_history')
    .select('id, user_id, full_name, role, started_at, ended_at, end_reason')
    .eq('congregation_id', congregationId)
    .order('started_at', { ascending: false })

  if (error) {
    // Hiányzó tábla (42P01) → schemaReady:false
    const missing = /relation .* does not exist|schema cache/i.test(error.message)
    return { rows: [], schemaReady: !missing, error: missing ? undefined : error.message }
  }
  return { rows: (data || []) as CongregationPastorRow[], schemaReady: true }
}

/**
 * 2026-06-05 (F3a) — Lelkészcsere-átadás INDÍTÁSA.
 * A távozó lelkész elindítja az átadást → létrejön egy `congregation_transfers`
 * rekord (status='requested'), és értesül a RENDSZERGAZDA + az egyházmegye
 * SZÁMVEVŐJE (in-app értesítés + email). Ha az egyházmegyében nincs számvevő,
 * csak az admin(ok) értesülnek (a felhasználó döntése: ez elég).
 */
export async function initiateCongregationTransfer(input: {
  congregationId: string
  reason?: string
}): Promise<{ success?: boolean; error?: string; auditorsNotified?: number; alreadyOpen?: boolean }> {
  const permission = await requireActiveCongregation(input.congregationId)
  if ('error' in permission) return { error: permission.error }
  const { supabase, user } = permission.access

  // 1) Átadás rekord létrehozása (RPC — jogosultság-ellenőrzéssel)
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('initiate_congregation_transfer', {
    p_congregation_id: input.congregationId,
    p_reason: input.reason?.trim() || null,
  })
  if (rpcErr) {
    const missing = /relation .* does not exist|schema cache|function .* does not exist/i.test(rpcErr.message)
    return {
      error: missing
        ? 'Az átadás-funkció adatbázis-része még nincs telepítve (2026-06-05g SQL).'
        : rpcErr.message,
    }
  }
  const info = (rpcRes || {}) as { transfer_id?: string; already_open?: boolean; diocese_id?: string | null }
  if (info.already_open) {
    return { success: true, alreadyOpen: true, auditorsNotified: 0 }
  }

  // 2) Értesítendők (service-role: az RLS ne szűrje a más-profilú címzetteket)
  let auditorsNotified = 0
  try {
    const { getSupabaseAdminClient } = await import('@/lib/supabase/admin-client')
    const admin = getSupabaseAdminClient()

    const { data: congRow } = await admin
      .from('congregations')
      .select('nev_hu, name')
      .eq('id', input.congregationId)
      .maybeSingle()
    const congName =
      ((congRow as { nev_hu?: string | null; name?: string | null } | null)?.nev_hu) ||
      ((congRow as { name?: string | null } | null)?.name) ||
      'a gyülekezet'

    const fromName = permission.access.fullName || 'A lelkész'

    // Rendszergazdák
    const { data: admins } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .eq('role', 'admin')
      .eq('status', 'active')
      .not('email', 'is', null)

    // Egyházmegyei számvevők (az adott egyházmegyében)
    let auditors: Array<{ id: string; email: string; full_name: string | null }> = []
    if (info.diocese_id) {
      const { data: auds } = await admin
        .from('profiles')
        .select('id, email, full_name')
        .eq('role', 'egyhazmegyei_szamvevo')
        .eq('diocese_id', info.diocese_id)
        .eq('status', 'active')
        .not('email', 'is', null)
      auditors = (auds || []) as typeof auditors
    }
    auditorsNotified = auditors.length

    const portalUrl =
      (process.env.NEXT_PUBLIC_APP_URL || 'https://kartoteka.app') + '/admin?tab=access-requests'

    const recipients: Array<{ id: string; email: string; full_name: string | null; role: 'rendszergazda' | 'számvevő' }> = [
      ...((admins || []) as Array<{ id: string; email: string; full_name: string | null }>).map((a) => ({
        ...a,
        role: 'rendszergazda' as const,
      })),
      ...auditors.map((a) => ({ ...a, role: 'számvevő' as const })),
    ]
    // Dedup (id szerint), és a saját magát (kezdeményező) kihagyjuk
    const seen = new Set<string>()
    for (const r of recipients) {
      if (!r.email || seen.has(r.id) || r.id === user?.id) continue
      seen.add(r.id)

      await admin.from('ertesitesek').insert([
        {
          congregation_id: input.congregationId,
          user_id: r.id,
          cim: `Lelkészcsere-átadás indult: ${congName}`,
          uzenet: `${fromName} elindította a(z) ${congName} gyülekezet átadását. Kérjük, nézd át a gyülekezet adatait, és hagyd jóvá vagy rögzíts meghagyásokat.`,
          tipus: 'warning',
          hivatkozas: '/admin?tab=access-requests',
        },
      ])

      const emailRes = await sendEmail(
        transferInitiatedEmail({
          recipientEmail: r.email,
          recipientName: r.full_name || undefined,
          recipientRole: r.role,
          congregationName: congName,
          fromPastorName: fromName,
          reason: input.reason?.trim() || null,
          portalUrl,
        }),
      )
      if (!emailRes.success) {
        console.error(`[transfer-initiate] email hiba (${r.email}):`, emailRes.error)
      }
    }
  } catch (err) {
    console.error('[transfer-initiate] értesítés hiba:', err instanceof Error ? err.message : err)
    // Nem blokkoljuk — az átadás már létrejött, az admin a felületen is látja.
  }

  await logAuditEvent({
    action: 'transfer.initiate',
    targetTable: 'congregation_transfers',
    targetId: info.transfer_id ?? null,
    metadata: { congregation_id: input.congregationId, auditors_notified: auditorsNotified },
  }, supabase)

  revalidatePath('/congregation')
  return { success: true, auditorsNotified }
}

export interface OpenTransferRemark {
  id: string
  author_role: string | null
  szoveg: string
  resolved: boolean
  created_at: string
}
export interface OpenTransfer {
  id: string
  status: string
  from_full_name: string | null
  reason: string | null
  admin_approved_at: string | null
  auditor_approved_at: string | null
  created_at: string
  expires_at: string | null
  /** A bejelentkezett felhasználó felülvizsgáló szerepe: 'admin' | 'szamvevo' | null */
  my_review_role: 'admin' | 'szamvevo' | null
  remarks: OpenTransferRemark[]
}

/** 2026-06-05 (F3b): a gyülekezet nyitott átadása + meghagyások (felülvizsgálathoz). */
export async function getOpenTransfer(
  congregationId: string,
): Promise<{ transfer: OpenTransfer | null; error?: string }> {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { transfer: null, error: permission.error }
  const { supabase } = permission.access
  const { data, error } = await supabase.rpc('get_open_transfer_for_congregation', {
    p_congregation_id: congregationId,
  })
  if (error) {
    const missing = /function .* does not exist|schema cache/i.test(error.message)
    return { transfer: null, error: missing ? undefined : error.message }
  }
  return { transfer: (data as OpenTransfer | null) ?? null }
}

/** Átadás jóváhagyása (admin vagy számvevő). */
export async function approveTransfer(transferId: string): Promise<{ status?: string; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('transfer_approve', { p_transfer_id: transferId })
  if (error) return { error: error.message }
  await logAuditEvent({ action: 'transfer.review.approve', targetTable: 'congregation_transfers', targetId: transferId }, supabase)
  revalidatePath('/congregation')
  return { status: (data as { status?: string } | null)?.status }
}

/** Meghagyás (észrevétel) rögzítése — blokkolja az átadást rendezésig. */
export async function addTransferRemark(transferId: string, szoveg: string): Promise<{ success?: boolean; error?: string }> {
  if (!szoveg.trim()) return { error: 'A meghagyás szövege kötelező.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('transfer_add_remark', { p_transfer_id: transferId, p_szoveg: szoveg.trim() })
  if (error) return { error: error.message }
  await logAuditEvent({ action: 'transfer.remark.add', targetTable: 'congregation_transfers', targetId: transferId }, supabase)
  revalidatePath('/congregation')
  return { success: true }
}

/**
 * 2026-06-05 (F3c) — Átadás VÉGREHAJTÁSA (csak rendszergazda, status='ready').
 * A rendszergazda megadja a bejövő lelkész email-címét:
 *   - ha létezik a rendszerben → hozzárendeljük a gyülekezethez (RPC), email,
 *   - ha NEM létezik → meghívó emailt küldünk (regisztráljon), és az átadás
 *     'ready' marad, amíg a regisztráció + jóváhagyás megtörténik.
 */
export async function completeTransfer(input: {
  transferId: string
  incomingEmail: string
  congregationId: string
}): Promise<{ success?: boolean; needsRegistration?: boolean; error?: string }> {
  const permission = await requireActiveCongregation(input.congregationId)
  if ('error' in permission) return { error: permission.error }
  if (!permission.access.admin) return { error: 'Csak a rendszergazda véglegesítheti az átadást.' }
  const { supabase } = permission.access

  const email = (input.incomingEmail || '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Adj meg egy érvényes email-címet a bejövő lelkészhez.' }
  }

  const { getSupabaseAdminClient } = await import('@/lib/supabase/admin-client')
  const admin = getSupabaseAdminClient()

  // Gyülekezet neve az emailekhez
  const { data: congRow } = await admin
    .from('congregations')
    .select('nev_hu, name')
    .eq('id', input.congregationId)
    .maybeSingle()
  const congName =
    ((congRow as { nev_hu?: string | null; name?: string | null } | null)?.nev_hu) ||
    ((congRow as { name?: string | null } | null)?.name) ||
    'a gyülekezet'

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kartoteka.app'

  // Létezik-e a bejövő lelkész?
  const { data: existing } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .ilike('email', email)
    .maybeSingle()
  const found = existing as { id: string; full_name: string | null; email: string | null } | null

  if (!found) {
    // Nincs a rendszerben → meghívó email + to_email rögzítése
    await admin.from('congregation_transfers').update({ to_email: email }).eq('id', input.transferId)
    const inviteRes = await sendEmail(
      transferInviteEmail({ recipientEmail: email, congregationName: congName, registerUrl: `${appUrl}/hozzaferes-kerese` }),
    )
    if (!inviteRes.success) console.error('[completeTransfer] invite email hiba:', inviteRes.error)
    await logAuditEvent(
      { action: 'transfer.invite_sent', targetTable: 'congregation_transfers', targetId: input.transferId, metadata: { email } },
      supabase,
    )
    return { needsRegistration: true }
  }

  // Létezik → véglegesítés az RPC-vel
  const { error: rpcErr } = await supabase.rpc('complete_congregation_transfer', {
    p_transfer_id: input.transferId,
    p_to_user_id: found.id,
  })
  if (rpcErr) return { error: rpcErr.message }

  if (found.email) {
    const doneRes = await sendEmail(
      transferCompletedEmail({
        recipientEmail: found.email,
        recipientName: found.full_name || undefined,
        congregationName: congName,
        loginUrl: `${appUrl}/login`,
      }),
    )
    if (!doneRes.success) console.error('[completeTransfer] completed email hiba:', doneRes.error)
  }

  await logAuditEvent(
    { action: 'transfer.complete', targetTable: 'congregation_transfers', targetId: input.transferId, metadata: { to_user_id: found.id } },
    supabase,
  )
  revalidatePath('/congregation')
  return { success: true }
}

export async function getCongregationAnnualFees(congregationId: string) {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { error: permission.error, rows: [], schemaReady: false }

  try {
    return await getAnnualFeeRowsCompat(congregationId)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Az éves előzmények betöltése sikertelen.',
      rows: [],
      schemaReady: false,
    }
  }
}

// 2026-07-17 (F5): a saveCongregationAnnualFee TÖRÖLVE — halott kód volt: egyetlen
// hívója a szintén árva (sehonnan nem importált) congregation-dialog.tsx, és a
// számítás által nem olvasott congregation_annual_fees tükör-táblába írt.

export async function getCongregationBankAccounts(congregationId: string) {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { error: permission.error, rows: [], schemaReady: false }

  const { supabase } = permission.access
  const fullResult = await supabase
    .from('bankszamlak')
    .select('id, bank_neve, iban, valuta, aktiv, nyito_egyenleg, szin, ikon, is_default')
    .eq('congregation_id', congregationId)
    .order('created_at', { ascending: true })

  if (fullResult.error) {
    if (isMissingColumnError(fullResult.error)) {
      const fallback = await supabase
        .from('bankszamlak')
        .select('id, bank_neve, iban, valuta, aktiv, nyito_egyenleg, szin')
        .eq('congregation_id', congregationId)
        .order('created_at', { ascending: true })

      if (fallback.error) return { error: fallback.error.message, rows: [], schemaReady: false }

      return {
        rows: ((fallback.data || []) as Record<string, unknown>[]).map(normalizeBankAccountRow),
        schemaReady: false,
        warning:
          'A bankszámla ikon, szín és alapértelmezett jelölés teljes használatához még futtatni kell a `migration-docs/sql/2026-04-09-god-mode-and-congregation-finance.sql` fájlt.',
      }
    }

    if (isPermissionError(fullResult.error)) {
      return {
        rows: [],
        schemaReady: false,
        warning:
          'A bankszámla-bővítések táblája elérhető, de az aktuális adatbázis-jogosultság nem engedi az olvasását. Futtasd le a `migration-docs/sql/2026-04-09-extension-table-policies.sql` fájlt.',
      }
    }

    return { error: fullResult.error.message, rows: [], schemaReady: true }
  }

  return {
    rows: ((fullResult.data || []) as Record<string, unknown>[])
      .map(normalizeBankAccountRow)
      .sort((left, right) => Number(right.is_default) - Number(left.is_default)),
    schemaReady: true,
  }
}

export async function saveCongregationBankAccount(
  congregationId: string,
  payload: z.infer<typeof bankAccountSchema>,
) {
  const parsed = bankAccountSchema.safeParse(payload)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { error: permission.error }

  const { supabase } = permission.access
  const record = {
    congregation_id: congregationId,
    bank_neve: parsed.data.bankNeve,
    iban: parsed.data.iban?.trim() || null,
    valuta: parsed.data.valuta.trim().toUpperCase(),
    aktiv: parsed.data.aktiv,
    nyito_egyenleg: parsed.data.nyitoEgyenleg,
    szin: parsed.data.szin || '#206bc4',
    ikon: parsed.data.ikon || 'building-2',
    is_default: parsed.data.isDefault,
  }

  if (parsed.data.isDefault) {
    const resetResult = await supabase
      .from('bankszamlak')
      .update({ is_default: false })
      .eq('congregation_id', congregationId)

    if (resetResult.error && isMissingColumnError(resetResult.error)) {
      return {
        error:
          'Az alapértelmezett bankszámla és ikon kezeléséhez még futtatni kell a `migration-docs/sql/2026-04-09-god-mode-and-congregation-finance.sql` fájlt.',
      }
    }

    if (resetResult.error) {
      if (isPermissionError(resetResult.error)) {
        return {
          error:
            'A bankszámla-beállítások mentéséhez az aktuális adatbázis-jogosultság még nem elég. Futtasd le a `migration-docs/sql/2026-04-09-extension-table-policies.sql` fájlt.',
        }
      }

      return { error: resetResult.error.message }
    }
  }

  const result = parsed.data.id
    ? await supabase
        .from('bankszamlak')
        .update(record)
        .eq('id', parsed.data.id)
        .eq('congregation_id', congregationId)
    : await supabase.from('bankszamlak').insert(record)

  if (result.error) {
    if (isMissingColumnError(result.error)) {
      return {
        error:
          'A bankszámla ikon, szín és alapértelmezett beállítás teljes használatához még futtatni kell a `migration-docs/sql/2026-04-09-god-mode-and-congregation-finance.sql` fájlt.',
      }
    }

    if (isPermissionError(result.error)) {
      return {
        error:
          'A bankszámla-beállítások táblája már létezik, de az aktuális adatbázis-jogosultság nem engedi a mentést. Futtasd le a `migration-docs/sql/2026-04-09-extension-table-policies.sql` fájlt.',
      }
    }

    return { error: result.error.message }
  }

  if (parsed.data.isDefault) {
    await supabase
      .from('congregations')
      .update({
        bank: parsed.data.bankNeve,
        iban: parsed.data.iban?.trim() || null,
      })
      .eq('id', congregationId)
  }

  revalidatePath('/', 'layout')
  return { success: 'A bankszámla sikeresen elmentve.' }
}

export async function deleteCongregationBankAccount(congregationId: string, bankAccountId: number) {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { error: permission.error }

  const { supabase } = permission.access
  const result = await supabase
    .from('bankszamlak')
    .delete()
    .eq('id', bankAccountId)
    .eq('congregation_id', congregationId)

  if (result.error) return { error: result.error.message }

  revalidatePath('/', 'layout')
  return { success: 'A bankszámla sikeresen törölve.' }
}

export async function getCongregationFeeDiscounts(congregationId: string) {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { error: permission.error, rows: [], schemaReady: false }

  const { supabase } = permission.access
  const result = await supabase
    .from('jarulek_kedvezmeny')
    .select('*')
    .eq('congregation_id', congregationId)
    .order('ev', { ascending: false })
    .order('sorrend', { ascending: true })
    // 2026-07-25 (G1): determinisztikus tiebreak — a „Sorrend" mező kivezetésével
    // az azonos sorrend-értékű sorok között a rögzítés ideje dönt (a lista
    // szemantikus rendezését a panel maga végzi).
    .order('created_at', { ascending: true })

  if (result.error) {
    if (isMissingRelationError(result.error)) {
      return {
        rows: [],
        schemaReady: false,
        warning:
          'A kedvezményrendszer tárolásához még futtatni kell a `migration-docs/sql/2026-04-09-god-mode-and-congregation-finance.sql` és a `migration-docs/sql/2026-04-09-extension-table-policies.sql` fájlokat.',
      }
    }

    if (isPermissionError(result.error)) {
      return {
        rows: [],
        schemaReady: false,
        warning:
          'A kedvezményszabályok táblája már létezik, de az aktuális adatbázis-jogosultság nem engedi az olvasását. Futtasd le a `migration-docs/sql/2026-04-09-extension-table-policies.sql` fájlt.',
      }
    }

    return { error: result.error.message, rows: [], schemaReady: true }
  }

  return {
    rows: ((result.data || []) as Record<string, unknown>[]).map(normalizeFeeDiscountRow),
    schemaReady: true,
  }
}

export async function saveCongregationFeeDiscount(
  congregationId: string,
  payload: z.infer<typeof feeDiscountSchema>,
) {
  const parsed = feeDiscountSchema.safeParse(payload)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { error: permission.error }

  const { supabase } = permission.access
  const record = {
    ...(parsed.data.id ? { id: parsed.data.id } : {}),
    congregation_id: congregationId,
    ev: parsed.data.ev,
    tipus: parsed.data.tipus,
    sorrend: parsed.data.sorrend,
    aktiv: parsed.data.aktiv,
    kezdet: parsed.data.tipus === 'idoszak' ? parsed.data.kezdet || null : null,
    hatarid: parsed.data.tipus === 'idoszak' ? parsed.data.hatarid || null : null,
    kedv_osszeg: parsed.data.tipus === 'idoszak' ? parsed.data.kedvOsszeg ?? null : null,
    kor_tol: parsed.data.tipus === 'kor' ? parsed.data.korTol ?? null : null,
    // 2026-07-17 (F5): a kor-kedvezmény KÉTMÓDÚ — % (levonandó) VAGY fix RON
    // (fizetendő; a motor a fix_osszeg-et preferálja). Eddig kor-ra a fix_osszeg
    // feltétel nélkül NULL volt → a wizard fix-módú szabálya szerkesztés-mentéskor
    // némán 50% levonássá romlott.
    szazalek:
      parsed.data.tipus === 'kor'
        ? (parsed.data.korMode === 'fix' ? null : parsed.data.szazalek ?? null)
        : parsed.data.tipus === 'jovedelem'
          ? parsed.data.szazalek ?? null
          : null,
    // fix összeg: kor (fix mód), szociális (jovedelem) VAGY foglalkozás-alapú
    // (a fizetendő összeg; 0 = mentesül)
    fix_osszeg:
      parsed.data.tipus === 'kor'
        ? (parsed.data.korMode === 'fix' ? parsed.data.fixOsszeg ?? null : null)
        : parsed.data.tipus === 'jovedelem' || parsed.data.tipus === 'foglalkozas'
          ? parsed.data.fixOsszeg ?? null
          : null,
    // jov_leiras: szociális → szabad szöveg; foglalkozás → vesszős kulcsszavak (a tag foglalkozás-mezőjéhez)
    jov_leiras:
      parsed.data.tipus === 'jovedelem' || parsed.data.tipus === 'foglalkozas'
        ? parsed.data.jovLeiras?.trim() || null
        : null,
  }

  const result = await supabase
    .from('jarulek_kedvezmeny')
    .upsert(record, { onConflict: 'id' })

  if (result.error) {
    if (isMissingRelationError(result.error)) {
      return {
        error:
          'A kedvezményrendszer tárolásához még futtatni kell a `migration-docs/sql/2026-04-09-god-mode-and-congregation-finance.sql` fájlt.',
      }
    }

    if (isPermissionError(result.error)) {
      return {
        error:
          'A kedvezményrendszer táblája már létezik, de az aktuális adatbázis-jogosultság nem engedi a mentést. Futtasd le a `migration-docs/sql/2026-04-09-extension-table-policies.sql` fájlt.',
      }
    }

    // Ellenálló a `kezdet` oszlop hiányára (régi séma): CSAK ha pont a hiányzó oszlop a hiba,
    // próbáljuk újra nélküle — így genuine hibát (RLS, constraint) NEM nyelünk el, és UPDATE-útnál
    // nem hagyunk bent elavult kezdet-értéket (a törölt kulcsot a Supabase nem írná felül). Így a
    // kedvezmény (nyitott időablakkal) elmenthető nyers Postgres-hiba nélkül; a `kezdet` oszlop
    // pótlása a végleges megoldás.
    if (isMissingColumnError(result.error)) {
      const recordWithoutKezdet = { ...record } as Record<string, unknown>
      delete recordWithoutKezdet.kezdet
      const retry = await supabase
        .from('jarulek_kedvezmeny')
        .upsert(recordWithoutKezdet, { onConflict: 'id' })
      if (!retry.error) {
        revalidatePath('/', 'layout')
        return { success: 'A kedvezmény sikeresen elmentve.' }
      }
    }

    return { error: result.error.message }
  }

  revalidatePath('/', 'layout')
  return { success: 'A kedvezmény sikeresen elmentve.' }
}

export async function deleteCongregationFeeDiscount(congregationId: string, discountId: string) {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { error: permission.error }

  const { supabase } = permission.access
  const result = await supabase
    .from('jarulek_kedvezmeny')
    .delete()
    .eq('id', discountId)
    .eq('congregation_id', congregationId)

  if (result.error) return { error: result.error.message }

  revalidatePath('/', 'layout')
  return { success: 'A kedvezmény törölve.' }
}

// ─────────────────────────────────────────────────────────────────────────
// GYÜLEKEZET-SPECIFIKUS DÍJAK (2026-04-21) — congregation_custom_fees
// ─────────────────────────────────────────────────────────────────────────

export interface CustomFeeRow {
  id: string
  name: string
  description: string | null
  amount: number
  currency: string
  year_from: number
  year_to: number | null
  kor_tol: number | null
  kor_ig: number | null
  aktiv: boolean
}

const customFeeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Adj meg egy nevet a díjnak.').max(120),
  description: z.string().max(500).optional().or(z.literal('')),
  amount: z.number().min(0, 'Az összeg nem lehet negatív.'),
  currency: z.string().default('RON'),
  yearFrom: z.number().int().min(1900).max(2999),
  yearTo: z.number().int().min(1900).max(2999).optional().nullable(),
  korTol: z.number().int().min(0).max(150).optional().nullable(),
  korIg: z.number().int().min(0).max(150).optional().nullable(),
  aktiv: z.boolean().default(true),
})

const MISSING_TABLE_HINT =
  'A gyülekezet-specifikus díjak tárolásához még futtatni kell a `migration-docs/sql/2026-04-21-congregation-custom-fees.sql` fájlt.'

function isMissingTableError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '42P01' ||
    (error.message ? error.message.toLowerCase().includes('does not exist') : false)
  )
}

export async function getCongregationCustomFees(congregationId: string): Promise<
  | { rows: CustomFeeRow[]; schemaReady: true }
  | { rows: []; schemaReady: false; warning?: string; error?: string }
> {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { rows: [], schemaReady: false, error: permission.error }

  const { supabase } = permission.access
  const { data, error } = await supabase
    .from('congregation_custom_fees')
    .select('id, name, description, amount, currency, year_from, year_to, kor_tol, kor_ig, aktiv')
    .eq('congregation_id', congregationId)
    .order('year_from', { ascending: false })
    .order('name')

  if (error) {
    if (isMissingTableError(error)) {
      return { rows: [], schemaReady: false, warning: MISSING_TABLE_HINT }
    }
    return { rows: [], schemaReady: false, error: error.message }
  }

  return { rows: (data || []) as CustomFeeRow[], schemaReady: true }
}

export async function saveCongregationCustomFee(
  congregationId: string,
  payload: z.infer<typeof customFeeSchema>,
) {
  const parsed = customFeeSchema.safeParse(payload)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { error: permission.error }

  const { supabase } = permission.access
  const record = {
    congregation_id: congregationId,
    name: parsed.data.name.trim(),
    description: parsed.data.description?.trim() || null,
    amount: parsed.data.amount,
    currency: parsed.data.currency.trim().toUpperCase() || 'RON',
    year_from: parsed.data.yearFrom,
    year_to: parsed.data.yearTo ?? null,
    kor_tol: parsed.data.korTol ?? null,
    kor_ig: parsed.data.korIg ?? null,
    aktiv: parsed.data.aktiv,
  }

  const result = parsed.data.id
    ? await supabase
        .from('congregation_custom_fees')
        .update(record)
        .eq('id', parsed.data.id)
        .eq('congregation_id', congregationId)
    : await supabase
        .from('congregation_custom_fees')
        .insert(record)

  if (result.error) {
    if (isMissingTableError(result.error)) return { error: MISSING_TABLE_HINT }
    return { error: result.error.message }
  }

  revalidatePath('/', 'layout')
  return { success: 'A gyülekezeti díj elmentve.' }
}

export async function deleteCongregationCustomFee(congregationId: string, feeId: string) {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { error: permission.error }

  const { supabase } = permission.access
  const result = await supabase
    .from('congregation_custom_fees')
    .delete()
    .eq('id', feeId)
    .eq('congregation_id', congregationId)

  if (result.error) {
    if (isMissingTableError(result.error)) return { error: MISSING_TABLE_HINT }
    return { error: result.error.message }
  }

  revalidatePath('/', 'layout')
  return { success: 'A gyülekezeti díj törölve.' }
}

// ─────────────────────────────────────────────────────────────────────────
// SETUP WIZARD (2026-04-19) — gyülekezeti alapadatok kötelező bevitele
// ─────────────────────────────────────────────────────────────────────────

/**
 * Kötelező mezők, amelyek hiánya triggeri a setup wizardot. Ha bármelyik üres
 * → a wizard kötelezően megnyílik az első belépéskor (a /dashboard-on).
 * A banner is ezt ellenőrzi minden oldal-betöltésnél.
 */
const REQUIRED_CONGREGATION_SETUP_FIELDS = [
  'nev_hu', 'adoszam', 'megye', 'varos', 'cim',
  'email', 'telefon', 'bank', 'iban', 'cimer_url',
] as const

export interface CongregationSetupStatus {
  needsSetup: boolean
  missingFields: string[]
  congregationId: string | null
}

/**
 * Ellenőrzi, hogy a gyülekezet alapadatai teljesen ki vannak-e töltve.
 * Csak akkor hívd, ha a user aktív profile_role scope-ja 'congregation'
 * (vagy admin fallback).
 */
export async function checkCongregationSetupStatus(
  congregationId?: string,
): Promise<CongregationSetupStatus> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { needsSetup: false, missingFields: [], congregationId: null }

  const targetId = congregationId || access.effectiveCongregationId || null
  if (!targetId) return { needsSetup: false, missingFields: [], congregationId: null }

  const { data } = await access.supabase
    .from('congregations')
    .select('*')
    .eq('id', targetId)
    .maybeSingle()

  if (!data) {
    return {
      needsSetup: true,
      missingFields: [...REQUIRED_CONGREGATION_SETUP_FIELDS],
      congregationId: targetId,
    }
  }

  const row = data as Record<string, unknown>
  const missing: string[] = []
  for (const field of REQUIRED_CONGREGATION_SETUP_FIELDS) {
    const value = row[field]
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      missing.push(field)
    }
  }

  return {
    needsSetup: missing.length > 0,
    missingFields: missing,
    congregationId: targetId,
  }
}

/**
 * A setup wizard teljes mentése. Validáció után frissíti a `congregations`
 * sort a kötelező mezőkkel.
 */
const congregationSetupSchema = z.object({
  id: z.string().uuid(),
  // Hivatalos név (→ congregations.name). Opcionális: ha üres, a magyar (rövid) névre esünk vissza.
  nev: z.string().optional().or(z.literal('')),
  nev_hu: z.string().min(2, 'A magyar név kötelező.'),
  nev_ro: z.string().optional().or(z.literal('')),
  nev_en: z.string().optional().or(z.literal('')),
  adoszam: z.string().min(1, 'Az adószám kötelező.'),
  megye: z.string().min(1, 'A megye kötelező.'),
  varos: z.string().min(1, 'A város / település kötelező.'),
  cim: z.string().min(1, 'A cím kötelező.'),
  email: z.string().email('Érvénytelen email.'),
  telefon: z.string().min(1, 'A telefon kötelező.'),
  web: z.string().optional().or(z.literal('')),
  bank: z.string().min(1, 'A bank neve kötelező.'),
  iban: z.string().min(1, 'Az IBAN kötelező.'),
  cimer_url: z.string().url('Érvénytelen címer URL.'),
  // Új cím-mezők — opcionálisak a teljes mentéskor is (a step-save már elmenti őket)
  iranyitoszam: z.string().optional().or(z.literal('')),
  hazszam: z.string().optional().or(z.literal('')),
  country: z.string().optional().or(z.literal('')),
  adrlocality_id: z.number().int().nullable().optional(),
  adrstreet_id: z.number().int().nullable().optional(),
  // #Endre 2026-07-02: egyházmegye + pénzügyi alap átmigrálva a „Gyülekezetünk adatai" ablakból.
  diocese_id: z.string().uuid().optional().or(z.literal('')),
  eves_jarulek: z.number().min(0).default(100),
  jarulek_kedvezmenyes: z.number().min(0).default(0),
  jarulek_hatarid: z.string().regex(MONTH_DAY_REGEX, 'Formátum: HH-NN (pl. 07-01)').default('07-01'),
  tartozas_szamitas_mod: z.enum(['akkori', 'aktualis']).default('akkori'),
})

export type CongregationSetupInput = z.infer<typeof congregationSetupSchema>

export async function saveCongregationSetup(
  input: CongregationSetupInput,
): Promise<{ ok?: true; error?: string; fieldErrors?: Record<string, string> }> {
  const parsed = congregationSetupSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Hiányos vagy érvénytelen adat.', fieldErrors }
  }

  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  // Jogosultság: csak a saját gyülekezet lelkésze (vagy admin override)
  const canManage =
    access.admin ||
    access.master ||
    access.egyhazkeruletiAdmin ||
    access.profile?.congregation_id === parsed.data.id

  if (!canManage) return { error: 'Nincs jogosultság a gyülekezet szerkesztéséhez.' }

  const payload = {
    // A hivatalos `name` a dedikált „Hivatalos név" mezőből; ha üres VAGY csak whitespace, a magyar
    // (rövid) névre esünk vissza, hogy a NOT NULL `name` soha ne ürüljön ki. (Eddig a setup MINDIG
    // nev_hu-val írta felül a hivatalos nevet — ez clobbolta a Beállításokban megadott hivatalos nevet.)
    name: parsed.data.nev?.trim() || parsed.data.nev_hu,
    nev_hu: parsed.data.nev_hu,
    nev_ro: parsed.data.nev_ro || null,
    nev_en: parsed.data.nev_en || null,
    adoszam: parsed.data.adoszam,
    megye: parsed.data.megye,
    varos: parsed.data.varos,
    cim: parsed.data.cim,
    email: parsed.data.email,
    telefon: parsed.data.telefon,
    web: parsed.data.web || null,
    bank: parsed.data.bank,
    iban: parsed.data.iban,
    cimer_url: parsed.data.cimer_url,
    // Új cím-mezők
    iranyitoszam: parsed.data.iranyitoszam || null,
    hazszam: parsed.data.hazszam || null,
    country: parsed.data.country || 'Románia',
    adrlocality_id: parsed.data.adrlocality_id ?? null,
    adrstreet_id: parsed.data.adrstreet_id ?? null,
    // #Endre 2026-07-02: egyházmegye + pénzügyi alap (átmigrálva a „Gyülekezetünk adatai" ablakból)
    diocese_id: parsed.data.diocese_id || null,
    eves_jarulek: parsed.data.eves_jarulek,
    jarulek_kedvezmenyes: parsed.data.jarulek_kedvezmenyes,
    jarulek_hatarid: parsed.data.jarulek_hatarid,
    tartozas_szamitas_mod: parsed.data.tartozas_szamitas_mod,
  }

  let updateError = (await access.supabase
    .from('congregations')
    .update(payload)
    .eq('id', parsed.data.id)).error

  // Régi DB-ken hiányozhat pl. a tartozas_szamitas_mod oszlop → az új mezők nélkül újrapróbáljuk,
  // hogy a mag-adatok akkor is elmentődjenek (a setup-mentés ne bukjon el egy hiányzó oszlopon).
  if (updateError && /column|does not exist|schema cache|could not find|violates/i.test(updateError.message)) {
    const safe = { ...payload } as Record<string, unknown>
    for (const k of ['diocese_id', 'eves_jarulek', 'jarulek_kedvezmenyes', 'jarulek_hatarid', 'tartozas_szamitas_mod']) delete safe[k]
    updateError = (await access.supabase.from('congregations').update(safe).eq('id', parsed.data.id)).error
  }

  if (updateError) return { error: updateError.message }

  // 2026-07-17 (F1-2): a setup-varázsló díjmezői is szinkronba kerülnek az aktuális
  // évi bealitas sorral (ugyanaz az ok, mint az updateCongregation-nél).
  const feeSyncWarning = await syncFeeSettingsToCurrentYearBealitas(access.supabase, parsed.data.id, {
    evesJarulek: parsed.data.eves_jarulek,
    jarulekKedvezmenyes: parsed.data.jarulek_kedvezmenyes,
    jarulekHatarid: parsed.data.jarulek_hatarid,
  })
  if (feeSyncWarning) console.warn('[saveCongregationSetup]', feeSyncWarning)

  revalidatePath('/dashboard')
  revalidatePath('/penzugy')
  revalidatePath('/', 'layout')
  return { ok: true }
}

// ────────────────────────────────────────────────────────────────────
// Partial save — a wizard Tovább gombja minden step után ezt hívja.
// A lelkész kilépéskor nem veszít adatot: ami ki van töltve, megmarad.
// A végső `saveCongregationSetup` továbbra is szigorúan validálja a teljes
// form-ot, mielőtt a wizard "kész"-nek deklarálja.
// ────────────────────────────────────────────────────────────────────

const congregationSetupPartialSchema = z.object({
  id: z.string().uuid(),
  nev: z.string().optional(),
  nev_hu: z.string().optional(),
  nev_ro: z.string().nullable().optional(),
  nev_en: z.string().nullable().optional(),
  adoszam: z.string().optional(),
  megye: z.string().optional(),
  varos: z.string().optional(),
  cim: z.string().optional(),
  email: z.string().optional(),
  telefon: z.string().optional(),
  web: z.string().nullable().optional(),
  bank: z.string().optional(),
  iban: z.string().optional(),
  cimer_url: z.string().optional(),
  // Új cím-mezők (2026-04-21)
  iranyitoszam: z.string().optional(),
  hazszam: z.string().optional(),
  country: z.string().optional(),
  adrlocality_id: z.number().int().nullable().optional(),
  adrstreet_id: z.number().int().nullable().optional(),
})

export type CongregationSetupPartialInput = z.infer<typeof congregationSetupPartialSchema>

export async function saveCongregationSetupStep(
  input: CongregationSetupPartialInput,
): Promise<{ ok?: true; error?: string }> {
  const parsed = congregationSetupPartialSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Érvénytelen adat a lépéshez.' }
  }

  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  const canManage =
    access.admin ||
    access.master ||
    access.egyhazkeruletiAdmin ||
    access.profile?.congregation_id === parsed.data.id

  if (!canManage) return { error: 'Nincs jogosultság a gyülekezet szerkesztéséhez.' }

  // Csak a ténylegesen megadott (nem-undefined) mezőket frissítjük.
  // A nev_hu-t is csak akkor, ha nem üres — mert a `name` NOT NULL szinkronját
  // is tartanunk kell.
  const d = parsed.data
  const patch: Record<string, unknown> = {}

  // A hivatalos `name` a dedikált „Hivatalos név" (nev) mezőből; a rövid magyar nevet (nev_hu) külön
  // tartjuk, hogy a setup NE írja felül a hivatalos nevet (eddig nev_hu-val clobbolta).
  if (d.nev !== undefined) {
    const trimmed = d.nev.trim()
    if (trimmed.length > 0) patch.name = trimmed
  }
  if (d.nev_hu !== undefined) {
    const trimmed = d.nev_hu.trim()
    if (trimmed.length > 0) patch.nev_hu = trimmed
  }
  if (d.nev_ro !== undefined) patch.nev_ro = d.nev_ro?.trim() || null
  if (d.nev_en !== undefined) patch.nev_en = d.nev_en?.trim() || null
  if (d.adoszam !== undefined) patch.adoszam = d.adoszam.trim() || null
  if (d.megye !== undefined) patch.megye = d.megye.trim() || null
  if (d.varos !== undefined) patch.varos = d.varos.trim() || null
  if (d.cim !== undefined) patch.cim = d.cim.trim() || null
  if (d.email !== undefined) patch.email = d.email.trim() || null
  if (d.telefon !== undefined) patch.telefon = d.telefon.trim() || null
  if (d.web !== undefined) patch.web = d.web?.trim() || null
  if (d.bank !== undefined) patch.bank = d.bank.trim() || null
  if (d.iban !== undefined) patch.iban = d.iban.trim() || null
  if (d.cimer_url !== undefined) patch.cimer_url = d.cimer_url.trim() || null
  if (d.iranyitoszam !== undefined) patch.iranyitoszam = d.iranyitoszam.trim() || null
  if (d.hazszam !== undefined) patch.hazszam = d.hazszam.trim() || null
  if (d.country !== undefined) patch.country = d.country.trim() || null
  if (d.adrlocality_id !== undefined) patch.adrlocality_id = d.adrlocality_id
  if (d.adrstreet_id !== undefined) patch.adrstreet_id = d.adrstreet_id

  if (Object.keys(patch).length === 0) {
    // Nincs mit menteni — üres patch. Nem hiba.
    return { ok: true }
  }

  const { error } = await access.supabase
    .from('congregations')
    .update(patch)
    .eq('id', d.id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Címer feltöltés a `logos` Storage bucket-be.
 * Fájlnév séma: `congregations/{congregation_id}/{timestamp}-{safeName}`
 */
export async function uploadCongregationCimer(
  congregationId: string,
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  const canManage =
    access.admin ||
    access.master ||
    access.egyhazkeruletiAdmin ||
    access.profile?.congregation_id === congregationId

  if (!canManage) return { error: 'Nincs jogosultság a címer feltöltéséhez.' }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return { error: 'Nincs fájl.' }
  }

  if (file.size > 2_097_152) {
    return { error: 'A fájl mérete nem lehet több, mint 2 MB.' }
  }
  const allowedMime = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedMime.includes(file.type)) {
    return { error: 'Csak JPG, PNG vagy WEBP formátum engedélyezett.' }
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `congregations/${congregationId}/${Date.now()}-${safeName}`

  const { error: upErr } = await access.supabase.storage
    .from('logos')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    })

  if (upErr) return { error: `Feltöltés hiba: ${upErr.message}` }

  const { data: urlData } = access.supabase.storage
    .from('logos')
    .getPublicUrl(path)

  return { url: urlData.publicUrl }
}

/**
 * A setup wizard-hoz meglévő adatok betöltése. Az ugyanazokat a mezőket
 * adja vissza, amelyeket a saveCongregationSetup ment, plusz:
 *  - diocese_name + district_name (read-only info az alapadatok szekcióba)
 *  - existing_bank (ha a congregations.bank üres de van bankszamlak rekord,
 *    a wizard előtölti ebből — így a lelkész látja, hogy "már be van állítva")
 */
export async function getCongregationForSetup(
  congregationId?: string,
): Promise<{
  data?: {
    id: string
    name: string | null
    nev_hu: string
    nev_ro: string | null
    nev_en: string | null
    adoszam: string | null
    megye: string | null
    varos: string | null
    cim: string | null
    email: string | null
    telefon: string | null
    web: string | null
    bank: string | null
    iban: string | null
    cimer_url: string | null
    diocese_name: string | null
    district_name: string | null
    existing_bank_count: number
    // Új cím-mezők (2026-04-21)
    iranyitoszam: string | null
    hazszam: string | null
    country: string | null
    adrlocality_id: number | null
    adrstreet_id: number | null
    diocese_id: string | null
    eves_jarulek: number | null
    jarulek_kedvezmenyes: number | null
    jarulek_hatarid: string | null
    tartozas_szamitas_mod: 'akkori' | 'aktualis' | null
  }
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  const targetId = congregationId || access.effectiveCongregationId || null
  if (!targetId) return { error: 'Nincs gyülekezet megadva.' }

  // Congregation + dioceses JOIN + districts (kettős JOIN)
  const { data, error } = await access.supabase
    .from('congregations')
    .select(`
      id, nev_hu, name, nev_ro, nev_en, adoszam, megye, varos, cim,
      email, telefon, web, bank, iban, cimer_url,
      iranyitoszam, hazszam, country, adrlocality_id, adrstreet_id,
      diocese_id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid, tartozas_szamitas_mod,
      dioceses ( name, district_id, districts ( name ) )
    `)
    .eq('id', targetId)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Gyülekezet nem található.' }

  const row = data as Record<string, unknown>

  // diocese + district név kibontása a JOIN-eredményből
  // A Supabase shape: dioceses = { name, district_id, districts: { name } } | [{...}] | null
  let dioceseName: string | null = null
  let districtName: string | null = null
  const dRaw = row.dioceses
  if (dRaw) {
    const d = Array.isArray(dRaw) ? dRaw[0] : (dRaw as Record<string, unknown>)
    if (d && typeof d === 'object') {
      dioceseName = (d.name as string | null) || null
      const dist = (d as Record<string, unknown>).districts
      if (dist) {
        const distObj = Array.isArray(dist) ? dist[0] : (dist as Record<string, unknown>)
        if (distObj && typeof distObj === 'object') {
          districtName = (distObj.name as string | null) || null
        }
      }
    }
  }

  // A "fő" bankszámla: scope='gyulekezet' + aktiv=true, első találat
  // (a congregations.bank/iban szöveges mezőktől függetlenül)
  let existingBank: { bank_neve: string | null; iban: string | null } | null = null
  let existingBankCount = 0
  const bankQuery = await access.supabase
    .from('bankszamlak')
    .select('bank_neve, iban, is_default, aktiv')
    .eq('congregation_id', targetId)
    .eq('aktiv', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (bankQuery.data && bankQuery.data.length > 0) {
    existingBankCount = bankQuery.data.length
    const first = bankQuery.data[0] as Record<string, unknown>
    existingBank = {
      bank_neve: (first.bank_neve as string | null) || null,
      iban: (first.iban as string | null) || null,
    }
  }

  // Ha a congregations.bank/iban szöveges mező üres, DE van bankszamlak rekord,
  // az első bankszamlak adatait használjuk vizuális feltöltésként.
  const congregationBank = row.bank as string | null
  const congregationIban = row.iban as string | null
  const effectiveBank =
    (congregationBank && congregationBank.trim()) || existingBank?.bank_neve || null
  const effectiveIban =
    (congregationIban && congregationIban.trim()) || existingBank?.iban || null

  return {
    data: {
      id: row.id as string,
      name: (row.name as string | null) || null,
      nev_hu: (row.nev_hu as string | null) || (row.name as string | null) || '',
      nev_ro: row.nev_ro as string | null,
      nev_en: row.nev_en as string | null,
      adoszam: row.adoszam as string | null,
      megye: row.megye as string | null,
      varos: row.varos as string | null,
      cim: row.cim as string | null,
      email: row.email as string | null,
      telefon: row.telefon as string | null,
      web: row.web as string | null,
      bank: effectiveBank,
      iban: effectiveIban,
      cimer_url: row.cimer_url as string | null,
      diocese_name: dioceseName,
      district_name: districtName,
      existing_bank_count: existingBankCount,
      // Új cím-mezők
      iranyitoszam: row.iranyitoszam as string | null,
      hazszam: row.hazszam as string | null,
      country: row.country as string | null,
      adrlocality_id: row.adrlocality_id as number | null,
      adrstreet_id: row.adrstreet_id as number | null,
      diocese_id: row.diocese_id as string | null,
      eves_jarulek: row.eves_jarulek as number | null,
      jarulek_kedvezmenyes: row.jarulek_kedvezmenyes as number | null,
      jarulek_hatarid: row.jarulek_hatarid as string | null,
      tartozas_szamitas_mod: row.tartozas_szamitas_mod as 'akkori' | 'aktualis' | null,
    },
  }
}
