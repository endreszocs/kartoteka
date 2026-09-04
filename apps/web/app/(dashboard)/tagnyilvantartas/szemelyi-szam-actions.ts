'use server'

/**
 * A HIVATALOS SZEMÉLYI SZÁM (CNP) kezelése — 2026-09-05.
 *
 * Endre észrevétele nyomán a hivatalos állami azonosító KÜLÖN táblába került
 * (`szemely_szemelyi_szam`), szűkebb hozzáféréssel, mint a `szemely` bármely
 * oszlopa. A `szemely.cnp` marad annak, ami valójában: EGYHÁZI BELSŐ
 * azonosító, egyben a szülő-kapcsolatok idegen kulcsa.
 *
 * ⚠️ MIÉRT KÜLÖN ACTION, ÉS MIÉRT NEM A TAGLISTÁVAL EGYÜTT JÖN?
 * A taglista (`getMembers`) az EGÉSZ gyülekezet sorait beleteszi a szerver-
 * válaszba. Ha a hivatalos szám ott utazna, a maszkolás puszta látvány volna:
 * az érték a hálózati válaszban a szem-ikon megnyomása nélkül is ott lenne.
 * Ezért EGYETLEN személyre, KÉRÉSRE töltjük be — és a betöltést naplózzuk.
 *
 * ⚠️ A NAPLÓ SOHA NEM TARTALMAZZA MAGÁT A SZÁMOT. Csak azt, KI, MIKOR, KINEK
 * a számát nézte meg vagy írta át.
 *
 * A 'use server' fájl Next.js 16 alatt CSAK async függvényt exportálhat —
 * a típusok és a szinkron segédek a `@/lib/members/szemelyi-szam`-ban élnek.
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { logAuditEvent } from '@/lib/audit/log'
import {
  ellenorizSzemelyiSzam,
  type SzemelyiSzamAllapot,
  type SzemelyiSzamMentesEredmeny,
} from '@/lib/members/szemelyi-szam'

/** A tábla hiányát (a migráció még nem futott) NÉMÁN kell tűrnünk. */
const TABLA_HIANY_MINTA = /relation .* does not exist|schema cache|could not find|does not exist/i

const URES: SzemelyiSzamAllapot = { van: false, ertek: null, orszag: null, modositva: null, hiba: null }

type Kontextus = Awaited<ReturnType<typeof getEffectiveCongregationContext>>
type KapuEredmeny =
  | { ok: false; hiba: string }
  | { ok: true; supabase: Kontextus['supabase']; congregationId: string; userId: string }

/** A hívó jogosult-e ehhez a személyhez? Fail-closed: kétségnél NEM. */
async function kapu(personId: number): Promise<KapuEredmeny> {
  if (!Number.isInteger(personId) || personId <= 0) return { ok: false, hiba: 'Érvénytelen személy-azonosító.' }
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  if (!congregationId || !userId) return { ok: false, hiba: 'Nincs bejelentkezett felhasználó.' }

  const { data: person, error } = await supabase
    .from('szemely')
    .select('id, congregation_id')
    .eq('id', personId)
    .maybeSingle()
  if (error) return { ok: false, hiba: 'A személy nem tölthető be.' }
  if (!person) return { ok: false, hiba: 'Ez a személy nem érhető el.' }
  if ((person as { congregation_id: string | null }).congregation_id !== congregationId) {
    // A hivatalos azonosítót SZÁNDÉKOSAN csak a saját gyülekezet láthatja —
    // ezt az adatbázis-policy is így zárja, itt csak érthető üzenetet adunk.
    return { ok: false, hiba: 'A hivatalos személyi szám csak a tag saját gyülekezetében látható.' }
  }
  return { ok: true, supabase, congregationId, userId }
}

/**
 * Van-e rögzítve hivatalos szám? ÉRTÉKET NEM AD VISSZA, és NEM naplóz —
 * ezt hívja a karton betöltéskor, hogy a mező állapota látszódjon.
 */
export async function vanSzemelyiSzam(personId: number): Promise<SzemelyiSzamAllapot> {
  const k = await kapu(personId)
  if (!k.ok) return { ...URES, hiba: k.hiba }

  const { data, error } = await k.supabase
    .from('szemely_szemelyi_szam')
    .select('orszag, modositva')
    .eq('id_szemely', personId)
    .maybeSingle()

  if (error) {
    if (TABLA_HIANY_MINTA.test(error.message)) {
      return {
        ...URES,
        hiba: 'A hivatalos személyi szám tárolása még nincs élesítve (a migráció nem futott le).',
      }
    }
    console.error('[vanSzemelyiSzam] hiba:', error.message)
    return { ...URES, hiba: 'A hivatalos személyi szám állapota most nem tölthető be.' }
  }
  if (!data) return URES
  const sor = data as { orszag: string | null; modositva: string | null }
  return { van: true, ertek: null, orszag: sor.orszag, modositva: sor.modositva, hiba: null }
}

/**
 * A hivatalos szám FELFEDÉSE. Ez az egyetlen út, ami az értéket visszaadja —
 * és minden hívása naplózódik (érték nélkül).
 */
export async function getSzemelyiSzam(personId: number): Promise<SzemelyiSzamAllapot> {
  const k = await kapu(personId)
  if (!k.ok) return { ...URES, hiba: k.hiba }

  const { data, error } = await k.supabase
    .from('szemely_szemelyi_szam')
    .select('szemelyi_szam, orszag, modositva')
    .eq('id_szemely', personId)
    .maybeSingle()

  if (error) {
    if (TABLA_HIANY_MINTA.test(error.message)) {
      return { ...URES, hiba: 'A hivatalos személyi szám tárolása még nincs élesítve.' }
    }
    console.error('[getSzemelyiSzam] hiba:', error.message)
    return { ...URES, hiba: 'A hivatalos személyi szám most nem tölthető be.' }
  }
  if (!data) return URES

  // ⚠️ A napló SOHA nem viszi magát a számot — csak azt, ki nézte meg kiét.
  await logAuditEvent({
    action: 'member.szemelyi_szam_megtekintve',
    targetTable: 'szemely',
    targetId: String(personId),
  })

  const sor = data as { szemelyi_szam: string; orszag: string | null; modositva: string | null }
  return { van: true, ertek: sor.szemelyi_szam, orszag: sor.orszag, modositva: sor.modositva, hiba: null }
}

/**
 * A hivatalos szám mentése. Üres bemenet = a szám TÖRLÉSE (nem üres sztring:
 * a táblán CHECK tiltja az üres értéket).
 */
export async function saveSzemelyiSzam(personId: number, nyers: string, orszag = 'RO'): Promise<SzemelyiSzamMentesEredmeny> {
  const k = await kapu(personId)
  if (!k.ok) return { siker: false, hiba: k.hiba, romanCnp: false, torolve: false }

  const orszagKod = (orszag || 'RO').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(orszagKod)) {
    return { siker: false, hiba: 'Az országkód két nagybetű (például RO vagy HU).', romanCnp: false, torolve: false }
  }

  const e = ellenorizSzemelyiSzam(nyers)
  if (!e.rendben) return { siker: false, hiba: e.hiba, romanCnp: false, torolve: false }

  // ── TÖRLÉS ────────────────────────────────────────────────────────────────
  if (!e.tisztitott) {
    const { error } = await k.supabase.from('szemely_szemelyi_szam').delete().eq('id_szemely', personId)
    if (error) {
      if (TABLA_HIANY_MINTA.test(error.message)) {
        return { siker: false, hiba: 'A hivatalos személyi szám tárolása még nincs élesítve.', romanCnp: false, torolve: false }
      }
      console.error('[saveSzemelyiSzam] törlés hiba:', error.message)
      return { siker: false, hiba: 'A személyi szám törlése nem sikerült.', romanCnp: false, torolve: false }
    }
    await logAuditEvent({
      action: 'member.szemelyi_szam_torolve',
      targetTable: 'szemely',
      targetId: String(personId),
    })
    revalidatePath('/tagnyilvantartas')
    return { siker: true, hiba: null, romanCnp: false, torolve: true }
  }

  // ── RÖGZÍTÉS / MÓDOSÍTÁS ─────────────────────────────────────────────────
  const { error } = await k.supabase.from('szemely_szemelyi_szam').upsert(
    {
      id_szemely: personId,
      congregation_id: k.congregationId,
      szemelyi_szam: e.tisztitott,
      orszag: orszagKod,
      modositotta: k.userId,
      modositva: new Date().toISOString(),
    },
    { onConflict: 'id_szemely' },
  )

  if (error) {
    if (TABLA_HIANY_MINTA.test(error.message)) {
      return { siker: false, hiba: 'A hivatalos személyi szám tárolása még nincs élesítve.', romanCnp: false, torolve: false }
    }
    // Az egyediségi index a VALÓDI duplikátumot fogja meg — ezt magyarul kell
    // megmondani, különben nyers angol Postgres-szöveg jut a lelkészhez.
    if (error.code === '23505' || /uq_szemelyi_szam_gyulekezet|duplicate key/i.test(error.message)) {
      return {
        siker: false,
        hiba:
          'Ez a személyi szám a gyülekezetben MÁR egy másik személyhez tartozik. ' +
          'Vagy elgépelés történt, vagy ugyanaz az ember kétszer szerepel a nyilvántartásban.',
        romanCnp: e.romanCnp,
        torolve: false,
      }
    }
    console.error('[saveSzemelyiSzam] mentés hiba:', error.message)
    return { siker: false, hiba: `A személyi szám mentése nem sikerült: ${error.message}`, romanCnp: false, torolve: false }
  }

  await logAuditEvent({
    action: 'member.szemelyi_szam_mentve',
    targetTable: 'szemely',
    targetId: String(personId),
    metadata: { orszag: orszagKod, roman_cnp: e.romanCnp },
  })
  revalidatePath('/tagnyilvantartas')
  return { siker: true, hiba: null, romanCnp: e.romanCnp, torolve: false }
}
