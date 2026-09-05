'use server'

/**
 * Igehirdetési terv — server actions (2026-08-09).
 *
 * Tábla: igehirdetesi_terv (migration-docs/sql/2026-08-09-igehirdetesi-terv.sql).
 * Amíg a migráció nincs lefuttatva, a lista { needsSql: true }-t ad (bevett
 * graceful-degradation minta, 42P01/PGRST205 felismeréssel).
 *
 * Extrák:
 *  - naptár-kapcsolat: kérésre gyulekezeti_programok sor (tipus 'istentisztelet')
 *    jön létre / frissül — így a dashboard-naptár ÉS a Google ICS-feed is viszi;
 *  - emlékeztető: oldalbetöltéskor (lista-hívás) app-értesítés (ertesitesek)
 *    készül azokra a tervekre, amelyeknél az emlékeztető-ablak megnyílt;
 *  - munkanaplóvá alakítás: a bevált marker-minta (id_jellege = 'igeterv:<id>')
 *    + visszamutató munkanaplo_id — idempotens.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { selectAllPaged } from '@kartoteka/supabase-client'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { feladoMezok } from '@/lib/notifications/felado'
import { insertErtesites } from '@/lib/notifications/ertesites-insert'
import type {
  SermonPlan,
  SermonPlanInput,
  SermonPlanListResult,
} from '@/lib/worklog/igeterv-types'

const planSchema = z.object({
  id: z.string().uuid().optional(),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum'),
  napszak: z.enum(['de', 'du', 'este']).default('de'),
  alkalom: z.string().max(200).nullable().optional(),
  cim: z.string().max(300).nullable().optional(),
  textus: z.string().max(200).nullable().optional(),
  bibliaolvasas: z.string().max(200).nullable().optional(),
  enekek: z.string().max(200).nullable().optional(),
  szolgalattevo: z.string().max(200).nullable().optional(),
  megjegyzes: z.string().max(2000).nullable().optional(),
  emlekeztetoNapok: z.number().int().min(0).max(60).nullable().optional(),
  naptarban: z.boolean().optional(),
})

/** A tábla még nem létezik (a migráció nincs lefuttatva)? */
function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '42P01' || err.code === 'PGRST205') return true
  const m = (err.message || '').toLowerCase()
  return m.includes('igehirdetesi_terv') && (m.includes('does not exist') || m.includes('schema cache'))
}

function mapRow(r: Record<string, unknown>): SermonPlan {
  return {
    id: String(r.id),
    datum: String(r.datum || '').slice(0, 10),
    napszak: (r.napszak as SermonPlan['napszak']) || 'de',
    alkalom: (r.alkalom as string | null) || null,
    cim: (r.cim as string | null) || null,
    textus: (r.textus as string | null) || null,
    bibliaolvasas: (r.bibliaolvasas as string | null) || null,
    enekek: (r.enekek as string | null) || null,
    szolgalattevo: (r.szolgalattevo as string | null) || null,
    megjegyzes: (r.megjegyzes as string | null) || null,
    emlekeztetoNapok: r.emlekezteto_napok == null ? null : Number(r.emlekezteto_napok),
    emlekeztetoElkuldve: (r.emlekezteto_elkuldve as string | null) || null,
    munkanaploId: r.munkanaplo_id == null ? null : Number(r.munkanaplo_id),
    programId: (r.program_id as string | null) || null,
    updatedAt: (r.updated_at as string | null) || null,
  }
}

// ─── Lista (+ esedékes emlékeztetők kiküldése) ──────────────────────────────

export async function listSermonPlans(year: number): Promise<SermonPlanListResult> {
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  // 2026-08-11 (5. kör, P3 #15): KÖZÖS `selectAllPaged` a kézi ciklus helyett —
  // a `page.length < PAGE` stop-feltétel leszállított szerver-plafonnál az első
  // lap után kilépett volna, és az igehirdetési terv némán az év egy részét
  // mutatta volna (a hiányzó alkalmakra emlékeztető sem ment volna ki).
  const { data: all, error } = await selectAllPaged<Record<string, unknown>>(
    supabase
      .from('igehirdetesi_terv')
      .select('*')
      .eq('congregation_id', congregationId)
      .eq('deleted', false)
      .gte('datum', `${year}-01-01`)
      .lte('datum', `${year}-12-31`)
      .order('datum', { ascending: true })
      .order('napszak', { ascending: true }),
    // A `datum + napszak` NEM egyedi (egy napon több alkalom is lehet ugyanabban
    // a napszakban), ezért a helper alapértelmezett `id` ASC döntetlen-bontója
    // KELL — nélküle a laphatáron sor csúszhatna ki vagy duplázódhatna.
  )
  if (error) {
    if (isMissingTableError(error)) return { needsSql: true, plans: [] }
    return { error: `A terv betöltése sikertelen: ${error.message}` }
  }

  const plans = all.map(mapRow)
  const creatorById = new Map<string, string | null>(
    all.map((r) => [String(r.id), (r.userid as string | null) || null]),
  )

  // Esedékes emlékeztetők: datum - emlekezteto_napok <= MA <= datum, még nem küldve.
  // Review-fixek: (1) a dátum-matek UTC-ben (T12:00Z horgony) — a helyi-idő +
  // toISOString keverés szerver-időzónától függő ±1 napot adott; (2) ELŐBB
  // pecsételünk feltételesen (resolution: csak ahol még NULL), és csak a
  // ténylegesen megpecsételt sorra megy értesítés — két párhuzamos oldalbetöltés
  // sem duplázhat; (3) a címzett a terv RÖGZÍTŐJE (userid), fallback a néző.
  let remindersSent = 0
  const today = new Date().toISOString().slice(0, 10)
  const due = plans.filter((p) => {
    if (p.emlekeztetoNapok == null || p.emlekeztetoElkuldve) return false
    if (p.datum < today) return false
    const trigger = new Date(`${p.datum}T12:00:00Z`)
    trigger.setUTCDate(trigger.getUTCDate() - p.emlekeztetoNapok)
    return trigger.toISOString().slice(0, 10) <= today
  })
  for (const p of due) {
    const { data: stamped } = await supabase
      .from('igehirdetesi_terv')
      .update({ emlekezteto_elkuldve: new Date().toISOString() })
      .eq('id', p.id)
      .eq('congregation_id', congregationId)
      .is('emlekezteto_elkuldve', null)
      .select('id')
    if (!stamped || stamped.length === 0) continue // más betöltés már elvitte

    const cimResz = [p.alkalom, p.cim].filter(Boolean).join(' — ')
    const emlekezteto = await insertErtesites(
      supabase,
      {
        user_id: creatorById.get(p.id) || user.id,
        congregation_id: congregationId,
        cim: 'Igehirdetési emlékeztető',
        uzenet: `${p.datum} (${p.napszak}): ${cimResz || 'tervezett alkalom'}${p.textus ? ` · Textus: ${p.textus}` : ''}${p.enekek ? ` · Énekek: ${p.enekek}` : ''}`,
        tipus: 'info',
        hivatkozas: '/munkanaplo',
        olvasva: false,
        // Gépi emlékeztető — a feladó a rendszer, nem a lelkész, aki az oldalt megnyitotta.
        ...feladoMezok('rendszer'),
      },
      { forras: 'igeterv-emlekezteto' },
    )
    if (!emlekezteto.error) remindersSent += 1
  }

  return { plans, remindersSent }
}

// ─── Mentés (naptár-kapcsolattal) ───────────────────────────────────────────

export async function saveSermonPlan(input: SermonPlanInput): Promise<{ success?: boolean; needsSql?: boolean; error?: string }> {
  const parsed = planSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user, congregationId, fullName } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const d = parsed.data
  const record: Record<string, unknown> = {
    datum: d.datum,
    napszak: d.napszak,
    alkalom: d.alkalom?.trim() || null,
    cim: d.cim?.trim() || null,
    textus: d.textus?.trim() || null,
    bibliaolvasas: d.bibliaolvasas?.trim() || null,
    enekek: d.enekek?.trim() || null,
    szolgalattevo: d.szolgalattevo?.trim() || null,
    megjegyzes: d.megjegyzes?.trim() || null,
    emlekezteto_napok: d.emlekeztetoNapok ?? null,
    updated_at: new Date().toISOString(),
  }

  let planId = d.id ?? null
  let existingProgramId: string | null = null

  if (planId) {
    const { data: existing, error: exErr } = await supabase
      .from('igehirdetesi_terv')
      .select('program_id, emlekezteto_napok, datum')
      .eq('id', planId)
      .eq('congregation_id', congregationId)
      .maybeSingle()
    if (exErr && isMissingTableError(exErr)) return { needsSql: true }
    existingProgramId = (existing?.program_id as string | null) || null
    // Az emlékeztető-beállítás VAGY a dátum változásánál a „már elküldve" pecsét
    // törlődik, hogy az új időpontra újra kimehessen az értesítés.
    const existingDatum = String(existing?.datum || '').slice(0, 10)
    if (
      (existing?.emlekezteto_napok ?? null) !== (d.emlekeztetoNapok ?? null) ||
      (existingDatum && existingDatum !== d.datum)
    ) {
      record.emlekezteto_elkuldve = null
    }
    const { error } = await supabase
      .from('igehirdetesi_terv')
      .update(record)
      .eq('id', planId)
      .eq('congregation_id', congregationId)
    if (error) {
      if (isMissingTableError(error)) return { needsSql: true }
      return { error: `Mentés sikertelen: ${error.message}` }
    }
  } else {
    const { data: inserted, error } = await supabase
      .from('igehirdetesi_terv')
      .insert({ ...record, congregation_id: congregationId, userid: user.id })
      .select('id')
      .single()
    if (error) {
      if (isMissingTableError(error)) return { needsSql: true }
      return { error: `Mentés sikertelen: ${error.message}` }
    }
    planId = String(inserted?.id)
  }

  // Naptár-kapcsolat (gyulekezeti_programok) — best-effort, a terv-mentést nem dönti be.
  if (planId) {
    const programCim = [d.alkalom?.trim(), d.cim?.trim()].filter(Boolean).join(' — ') || 'Istentisztelet (terv)'
    const programRecord: Record<string, unknown> = {
      cim: programCim,
      datum: d.datum,
      tipus: 'istentisztelet',
      prioritas: 'normal',
      megjegyzes: [d.textus ? `Textus: ${d.textus}` : null, d.enekek ? `Énekek: ${d.enekek}` : null]
        .filter(Boolean)
        .join(' · ') || null,
      updated_at: new Date().toISOString(),
    }
    try {
      if (d.naptarban && !existingProgramId) {
        const { data: prog, error: progErr } = await supabase
          .from('gyulekezeti_programok')
          .insert({
            ...programRecord,
            congregation_id: congregationId,
            letrehozta_id: user.id,
            letrehozta_nev: fullName || '',
          })
          .select('id')
          .single()
        if (!progErr && prog?.id) {
          await supabase
            .from('igehirdetesi_terv')
            .update({ program_id: prog.id })
            .eq('id', planId)
            .eq('congregation_id', congregationId)
        }
      } else if (d.naptarban && existingProgramId) {
        await supabase
          .from('gyulekezeti_programok')
          .update(programRecord)
          .eq('id', existingProgramId)
          .eq('congregation_id', congregationId)
      } else if (!d.naptarban && existingProgramId) {
        await supabase
          .from('gyulekezeti_programok')
          .delete()
          .eq('id', existingProgramId)
          .eq('congregation_id', congregationId)
        await supabase
          .from('igehirdetesi_terv')
          .update({ program_id: null })
          .eq('id', planId)
          .eq('congregation_id', congregationId)
      }
    } catch {
      /* best-effort — a naptár-szinkron hibája nem dönti be a terv-mentést */
    }
  }

  revalidatePath('/munkanaplo')
  revalidatePath('/dashboard')
  return { success: true }
}

// ─── Törlés (soft) ──────────────────────────────────────────────────────────

export async function deleteSermonPlan(id: string): Promise<{ success?: boolean; error?: string }> {
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data: existing } = await supabase
    .from('igehirdetesi_terv')
    .select('program_id')
    .eq('id', id)
    .eq('congregation_id', congregationId)
    .maybeSingle()

  const { error } = await supabase
    .from('igehirdetesi_terv')
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('congregation_id', congregationId)
  if (error) return { error: `Törlés sikertelen: ${error.message}` }

  // A kapcsolt naptár-bejegyzés is törlődik (best-effort).
  if (existing?.program_id) {
    await supabase
      .from('gyulekezeti_programok')
      .delete()
      .eq('id', existing.program_id)
      .eq('congregation_id', congregationId)
  }

  revalidatePath('/munkanaplo')
  revalidatePath('/dashboard')
  return { success: true }
}

// ─── Munkanaplóvá alakítás (marker-minta, idempotens) ───────────────────────

export async function convertSermonPlanToWorklog(id: string): Promise<{ success?: boolean; munkanaploId?: number; error?: string }> {
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data: planRow, error: planErr } = await supabase
    .from('igehirdetesi_terv')
    .select('*')
    .eq('id', id)
    .eq('congregation_id', congregationId)
    .eq('deleted', false)
    .maybeSingle()
  if (planErr) return { error: `A terv nem olvasható: ${planErr.message}` }
  if (!planRow) return { error: 'Ismeretlen terv-bejegyzés.' }
  const plan = mapRow(planRow)

  const marker = `igeterv:${plan.id}`

  // Idempotencia: ha már van ÉLŐ marker-es munkanapló-sor, csak a visszamutatót
  // pótoljuk. (A soft-törölt sor nem számít — abból újra lehet konvertálni.)
  const { data: existing } = await supabase
    .from('munkanaplo')
    .select('id')
    .eq('congregation_id', congregationId)
    .eq('id_jellege', marker)
    .eq('deleted', false)
    .limit(1)
  if (existing && existing.length > 0) {
    const existingId = Number(existing[0].id)
    await supabase
      .from('igehirdetesi_terv')
      .update({ munkanaplo_id: existingId })
      .eq('id', plan.id)
      .eq('congregation_id', congregationId)
    revalidatePath('/munkanaplo')
    return { success: true, munkanaploId: existingId }
  }

  const baseRecord: Record<string, unknown> = {
    idopont: plan.datum,
    jellege: 'Istentisztelet',
    id_jellege: marker,
    cim: [plan.alkalom, plan.cim].filter(Boolean).join(' — ') || null,
    bibliaolvasas: plan.bibliaolvasas,
    alapige: plan.textus,
    enekek: plan.enekek,
    szolgalt: plan.szolgalattevo,
    megjegyzes: plan.megjegyzes,
    kategoria: 'szolgalat',
    jelenlet_ferfi: 0,
    jelenlet_no: 0,
    jelenlet_gyermek: 0,
    jelenlet_osszesen: 0,
    persely: null,
    congregation_id: congregationId,
    deleted: false,
    du: plan.napszak === 'du',
    napszak: plan.napszak,
  }

  let insertRes = await supabase.from('munkanaplo').insert(baseRecord).select('id').single()
  if (insertRes.error && /napszak/i.test(insertRes.error.message || '')) {
    // F1-migráció előtti séma: napszak nélkül, a legacy `du` mezővel.
    const legacy = { ...baseRecord }
    delete legacy.napszak
    insertRes = await supabase.from('munkanaplo').insert(legacy).select('id').single()
  }
  if (insertRes.error) {
    return { error: `A munkanapló-bejegyzés létrehozása sikertelen: ${insertRes.error.message}` }
  }

  const munkanaploId = Number(insertRes.data?.id)
  await supabase
    .from('igehirdetesi_terv')
    .update({ munkanaplo_id: munkanaploId, updated_at: new Date().toISOString() })
    .eq('id', plan.id)
    .eq('congregation_id', congregationId)

  revalidatePath('/munkanaplo')
  return { success: true, munkanaploId }
}
