'use server'

/**
 * 2026-07-11 (S6-#3): ÉVKEZDŐ (nyitó) egyenlegek szerkesztése a Gyülekezet
 * beállításaiból — a LEGELSŐ (vagy bármely) év készpénz- és bankszámla-nyitói.
 *
 * Miért: a teljes egyenleg-lánc (kassza/bank egyenleg, évi átvitel, számadás
 * nyitó sorai) ezekből az évkezdő értékekből számol évről évre. Ha a legelső
 * év nyitója hiányzik vagy rossz, MINDEN későbbi egyenleg torzul. Eddig a
 * készpenz_nyito_egyenleg-et CSAK az import írta, kézi szerkesztésre nem volt
 * felület; a bankszámla-nyitót csak a bank-import varázsló kérdezte.
 *
 * Védelem: véglegesített (zárt) év nyitója nem írható — a zárt év beküldött
 * számadását változtatná meg. Ilyenkor javítási engedély kell.
 */

import { revalidatePath } from 'next/cache'

import { upsertBankszamlaNyitoEgyenlegUseCase } from '@kartoteka/core'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export interface OpeningBalancesSettings {
  /** A legelső év, amelyre adat (tétel vagy nyitó) létezik — alapértelmezett szerkesztési év. */
  earliestYear: number
  /** Választható évek (legelső..folyó). */
  availableYears: number[]
  /** Készpénz-nyitók évenként. */
  cashRows: Array<{ eve: number; nyito_egyenleg: number; forrasa: string }>
  /** Bankszámla-nyitók (számla+év). */
  bankRows: Array<{
    bankszamla_id: number
    eve: number
    nyito_egyenleg_valuta: number
    nyito_egyenleg_ron: number
    arfolyam: number | null
    forrasa: string
  }>
  /** Véglegesített évek (számadás VAGY költségvetés zárva) — ezek nyitója nem szerkeszthető. */
  finalizedYears: number[]
}

export async function getOpeningBalancesSettings(
  /** 2026-07-17 (F4 guard): a hívó felület által ELVÁRT gyülekezet — ha eltér az
   *  effektív scope-tól, hangos hibát adunk a néma rossz-gyülekezet olvasás helyett. */
  expectedCongregationId?: string,
): Promise<{
  data?: OpeningBalancesSettings
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }
  if (expectedCongregationId && expectedCongregationId !== congregationId) {
    return { error: 'A megnyitott gyülekezet nem egyezik az aktív munkamenet gyülekezetével — a nyitó egyenlegek nem szerkeszthetők innen.' }
  }
  const supabase = access.supabase

  const [bevMinRes, kiaMinRes, cashRes, bankRes, bealitasRes] = await Promise.all([
    supabase.from('befizetes').select('datum').eq('congregation_id', congregationId)
      .eq('deleted', false).order('datum', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('kiadas').select('datum').eq('congregation_id', congregationId)
      .eq('deleted', false).order('datum', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('keszpenz_nyito_egyenleg').select('eve, nyito_egyenleg, forrasa')
      .eq('congregation_id', congregationId).order('eve', { ascending: true }),
    supabase.from('bankszamla_nyito_egyenleg')
      .select('bankszamla_id, eve, nyito_egyenleg_valuta, nyito_egyenleg_ron, arfolyam, forrasa')
      .eq('congregation_id', congregationId).order('eve', { ascending: true }),
    supabase.from('bealitas').select('id, accounting_finalized, budget_finalized')
      .eq('congregation_id', congregationId),
  ])

  const currentYear = new Date().getFullYear()
  const candidateYears: number[] = [currentYear]
  const bevDatum = (bevMinRes.data as { datum: string } | null)?.datum
  const kiaDatum = (kiaMinRes.data as { datum: string } | null)?.datum
  if (bevDatum) candidateYears.push(new Date(bevDatum).getFullYear())
  if (kiaDatum) candidateYears.push(new Date(kiaDatum).getFullYear())
  for (const r of (cashRes.data || []) as Array<{ eve: number }>) candidateYears.push(r.eve)
  for (const r of (bankRes.data || []) as Array<{ eve: number }>) candidateYears.push(r.eve)
  const earliestYear = Math.min(...candidateYears.filter((y) => Number.isFinite(y) && y >= 2000))

  const availableYears: number[] = []
  for (let y = earliestYear; y <= currentYear; y += 1) availableYears.push(y)

  // 2026-08-11 (5. kör, K5-#32 hibaosztály-lezárás): FAIL-CLOSED. A
  // `(bealitasRes.data || [])` korábban elnyelte a lekérdezési hibát, és üres
  // `finalizedYears` listát adott — a panel ilyenkor MINDEN évet szerkeszthetőnek
  // mutatott, köztük a már véglegesítetteket is. A zár-állapotot vagy tudjuk,
  // vagy nem nyitjuk ki a felületet: hibánál inkább nem töltjük be a panelt.
  if (bealitasRes.error) {
    console.error(
      '[nyito-egyenleg] A zárás-állapot (bealitas) lekérdezése HIBÁRA FUTOTT — a panel ' +
        'fail-closed nem tölt be, hogy ne mutasson lezárt évet szerkeszthetőnek.',
      bealitasRes.error,
    )
    return {
      error:
        `Nem sikerült lekérdezni, mely évek vannak véglegesítve (${bealitasRes.error.message}), ` +
        'ezért a nyitó egyenlegek panelt biztonságból nem nyitjuk meg — különben egy már lezárt ' +
        'év is szerkeszthetőnek látszana. Próbáld újra néhány perc múlva; ha újra hibázik, ' +
        'jelezd a rendszergazdának.',
    }
  }

  const finalizedYears = ((bealitasRes.data || []) as Array<{
    id: string
    accounting_finalized: boolean | null
    budget_finalized: boolean | null
  }>)
    .filter((b) => b.accounting_finalized === true || b.budget_finalized === true)
    .map((b) => Number(b.id))
    .filter((y) => Number.isFinite(y))

  return {
    data: {
      earliestYear,
      availableYears,
      cashRows: ((cashRes.data || []) as Array<{ eve: number; nyito_egyenleg: number | string; forrasa: string }>).map(
        (r) => ({ eve: r.eve, nyito_egyenleg: Number(r.nyito_egyenleg) || 0, forrasa: r.forrasa }),
      ),
      bankRows: ((bankRes.data || []) as Array<{
        bankszamla_id: number
        eve: number
        nyito_egyenleg_valuta: number | string
        nyito_egyenleg_ron: number | string
        arfolyam: number | string | null
        forrasa: string
      }>).map((r) => ({
        bankszamla_id: r.bankszamla_id,
        eve: r.eve,
        nyito_egyenleg_valuta: Number(r.nyito_egyenleg_valuta) || 0,
        nyito_egyenleg_ron: Number(r.nyito_egyenleg_ron) || 0,
        arfolyam: r.arfolyam == null ? null : Number(r.arfolyam),
        forrasa: r.forrasa,
      })),
      finalizedYears,
    },
  }
}

export interface SaveOpeningBalancesInput {
  eve: number
  /** Készpénz-nyitó RON-ban (null = nem változtatjuk / nincs megadva). */
  keszpenz: number | null
  /** Bankszámla-nyitók a számla valutájában (+ FX-nél árfolyam). */
  bankok: Array<{
    bankszamla_id: number
    nyito_valuta: number
    arfolyam?: number | null
  }>
  /** 2026-07-17 (F4 guard): a hívó felület által ELVÁRT gyülekezet (lásd getOpeningBalancesSettings). */
  expectedCongregationId?: string
}

export async function saveOpeningBalancesSettings(
  input: SaveOpeningBalancesInput,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }
  if (input.expectedCongregationId && input.expectedCongregationId !== congregationId) {
    return { error: 'A megnyitott gyülekezet nem egyezik az aktív munkamenet gyülekezetével — a mentés megszakítva (rossz gyülekezet nyitóját írta volna felül).' }
  }
  const supabase = access.supabase

  if (!Number.isFinite(input.eve) || input.eve < 2000 || input.eve > 2100) {
    return { error: 'Érvénytelen év.' }
  }

  // Zárt-év védelem: a nyitó egyenleg a beküldött számadás része — zárt évre
  // csak javítási engedéllyel módosítható.
  const { data: bealitas, error: bealitasErr } = await supabase
    .from('bealitas')
    .select('accounting_finalized, budget_finalized')
    .eq('congregation_id', congregationId)
    .eq('id', String(input.eve))
    .maybeSingle()
  // 2026-08-11 (5. kör, K5-#32 hibaosztály-lezárás): FAIL-CLOSED. Korábban az
  // `error` el lett dobva, és a `bealitas?.accounting_finalized === true` egy
  // hibás lekérdezésre (`bealitas === null`) `false` lett — vagyis a zár-olvasás
  // bármilyen hibája NÉMÁN engedte felülírni egy már véglegesített és beküldött
  // év NYITÓ EGYENLEGÉT, ami a beküldött számadás kiindulópontja: az egész év
  // egyenlege elcsúszott volna a papíron leadotthoz képest. A „nincs `bealitas`
  // sor" NEM hiba (`maybeSingle` → `data: null, error: null`) — az évet még nem
  // konfigurálták, tehát nincs is véglegesítve.
  if (bealitasErr) {
    console.error(
      `[nyito-egyenleg] A(z) ${input.eve}. évi zárás-állapot lekérdezése HIBÁRA FUTOTT ` +
        '— fail-closed, a mentés nem futhat le.',
      bealitasErr,
    )
    return {
      error:
        `Nem sikerült ellenőrizni, hogy a(z) ${input.eve}. év véglegesítve van-e ` +
        `(${bealitasErr.message}), ezért a nyitó egyenleg mentését biztonságból megszakítottuk ` +
        '— egy már lezárt év nyitóját nem írhatjuk felül véletlenül. Próbáld újra néhány perc ' +
        'múlva; ha újra hibázik, jelezd a rendszergazdának.',
    }
  }
  if (bealitas?.accounting_finalized === true || bealitas?.budget_finalized === true) {
    return {
      error: `A(z) ${input.eve}. év véglegesítve van — a nyitó egyenlege a beküldött számadás része. Módosításhoz kérj javítási engedélyt az egyházmegyétől.`,
    }
  }

  // Készpénz-nyitó (RON) — upsert (congregation_id, eve) kulcson.
  if (input.keszpenz != null) {
    if (!Number.isFinite(input.keszpenz)) return { error: 'Érvénytelen készpénz-nyitó összeg.' }
    const { error } = await supabase.from('keszpenz_nyito_egyenleg').upsert(
      {
        congregation_id: congregationId,
        eve: input.eve,
        nyito_egyenleg: input.keszpenz,
        forrasa: 'manual',
        megjegyzes: 'Gyülekezet beállításaiban rögzítve.',
        updated_by: access.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'congregation_id,eve' },
    )
    if (error) return { error: `Készpénz-nyitó mentése sikertelen: ${error.message}` }
  }

  // Bankszámla-nyitók — a meglévő core use-case-en át (RON/FX kezelés egyben).
  for (const b of input.bankok) {
    if (!Number.isFinite(b.nyito_valuta)) {
      return { error: 'Érvénytelen bankszámla-nyitó összeg.' }
    }
    const res = await upsertBankszamlaNyitoEgyenlegUseCase(
      {
        congregationId,
        bankszamla_id: b.bankszamla_id,
        eve: input.eve,
        nyito_egyenleg_valuta: b.nyito_valuta,
        arfolyam: typeof b.arfolyam === 'number' && b.arfolyam > 0 ? b.arfolyam : null,
        forrasa: 'manual',
        megjegyzes: 'Gyülekezet beállításaiban rögzítve.',
      },
      { supabase, runtime: 'web', userId: access.user.id },
    )
    if (res.error) return { error: `Bankszámla-nyitó mentése sikertelen: ${res.error}` }
  }

  revalidatePath('/penzugy')
  return { success: true }
}
