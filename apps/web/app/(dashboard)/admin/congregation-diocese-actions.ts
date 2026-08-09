'use server'

/**
 * Gyülekezet ⇄ egyházmegye kötés javítása — admin server actions (2026-08-10).
 *
 * MIÉRT KELL (K4 regisztráció-diagnosztika #5):
 *   A regisztráció SOSEM hoz létre gyülekezetet, és a választott egyházmegye
 *   csak a `profiles`-ba kerül — a `congregations.diocese_id`-t az egész
 *   alkalmazásban mindössze két hely írta (a Beállítások és a Gyülekezet-
 *   beállító varázsló), mindkettő `|| null`-lal. Egy elkattintás ezért NULL-ra
 *   állíthatta a kötést, és onnantól a gyülekezet:
 *     • egyetlen egyházmegyei/kerületi felületen sem látszott (fail-closed scope),
 *     • irat-beküldésekor senkit nem értesített (document-actions),
 *     • a regisztrációs választóból is kiesett (diocese_id IS NOT NULL szűrő),
 *   azaz az állapot a felületről JAVÍTHATATLAN volt — csak kézi SQL-lel.
 *   Ez az action zárja be ezt a hurkot.
 *
 * JOGOSULTSÁG:
 *   • master / teljes admin: bármely gyülekezet, bármely egyházmegyébe.
 *   • egyházkerületi admin: CSAK a saját kerülete gyülekezetét, és CSAK a saját
 *     kerülete egyházmegyéjébe (lib/auth/admin-scope.ts assert-ek).
 *     Az „árva" (egyházmegye nélküli) gyülekezet nem tartozik egyetlen
 *     kerülethez sem, ezért azt szándékosan csak korlátlan admin rendezheti —
 *     különben a kerületi admin más kerület gyülekezetét is elvihetné.
 */

import { revalidatePath } from 'next/cache'

import { logAuditEvent } from '@/lib/audit/log'
import { requireAdminAccess } from '@/lib/auth/admin-access'
import {
  assertCongregationInScope,
  assertDioceseInScope,
  getAdminDistrictScope,
  getScopedDioceseIds,
} from '@/lib/auth/admin-scope'
import type {
  AssignCongregationDioceseResult,
  AssignableDiocese,
  AssignableDiocesesResult,
} from './congregation-diocese-shared'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A hozzárendelhető egyházmegyék listája (egyházkerület-névvel), az admin
 * hatókörére szűrve. A kerületi admin csak a saját kerülete egyházmegyéit kapja.
 */
export async function listAssignableDioceses(): Promise<AssignableDiocesesResult> {
  let access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: true })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nincs jogosultsága.' }
  }

  const scopedDioceseIds = await getScopedDioceseIds(access)
  const query = access.supabase
    .from('dioceses')
    .select('id, name, district_id, districts(name)')
    .order('name')
  if (scopedDioceseIds) query.in('id', scopedDioceseIds)

  const { data, error } = await query
  if (error) return { error: `Az egyházmegyék betöltése sikertelen: ${error.message}` }

  const rows: AssignableDiocese[] = (data || []).map((d) => {
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
      districtId: raw.district_id,
      districtName: dist?.name ?? null,
    }
  })

  return { rows, accessLevel: access.accessLevel }
}

/**
 * A gyülekezet egyházmegyéjének beállítása / javítása.
 *
 * A `dioceseId` KÖTELEZŐEN érvényes uuid — a kötés TÖRLÉSÉRE szándékosan nincs
 * művelet (pont az volt az eredeti hibaosztály).
 */
export async function assignCongregationDiocese(
  congregationId: string,
  dioceseId: string,
): Promise<AssignCongregationDioceseResult> {
  if (!UUID_RE.test(congregationId || '')) return { error: 'Érvénytelen gyülekezet-azonosító.' }
  if (!UUID_RE.test(dioceseId || '')) {
    return { error: 'Válasszon egyházmegyét — az egyházmegye-kötés nem törölhető, csak lecserélhető.' }
  }

  let access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: true })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nincs jogosultsága.' }
  }
  const scope = getAdminDistrictScope(access)

  // 1) A gyülekezet jelenlegi állapota
  const { data: congRow, error: congErr } = await access.supabase
    .from('congregations')
    .select('id, nev_hu, name, diocese_id')
    .eq('id', congregationId)
    .maybeSingle()
  if (congErr) return { error: `A gyülekezet betöltése sikertelen: ${congErr.message}` }
  if (!congRow) return { error: 'A gyülekezet nem található.' }

  const cong = congRow as { id: string; nev_hu: string | null; name: string | null; diocese_id: string | null }
  const congName = cong.nev_hu || cong.name || 'a gyülekezet'
  const previousDioceseId = cong.diocese_id

  if (previousDioceseId === dioceseId) {
    return { error: `${congName} már ehhez az egyházmegyéhez tartozik — nincs mit módosítani.` }
  }

  // 2) Hatókör-ellenőrzés (master/teljes admin: mindkettő azonnal visszatér)
  try {
    if (previousDioceseId) {
      // Meglévő kötés áthelyezése: a FORRÁS is a hatókörben kell legyen.
      await assertCongregationInScope(access, congregationId)
    } else if (!scope.unrestricted) {
      // Árva gyülekezet: egyetlen kerülethez sem tartozik → csak korlátlan admin.
      return {
        error:
          'Egyházmegye nélküli („árva") gyülekezetet csak a fő rendszergazda / teljes admin rendelhet egyházmegyéhez.',
      }
    }
    // A CÉL egyházmegye mindig a hatókörben kell legyen.
    await assertDioceseInScope(access, dioceseId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nincs jogosultsága ehhez a művelethez.' }
  }

  // 3) A cél egyházmegye adatai (a legacy szöveges oszlopok szinkronjához + a profil-skalárokhoz)
  const { data: dioRow, error: dioErr } = await access.supabase
    .from('dioceses')
    .select('id, name, district_id, districts(name)')
    .eq('id', dioceseId)
    .maybeSingle()
  if (dioErr) return { error: `Az egyházmegye betöltése sikertelen: ${dioErr.message}` }
  if (!dioRow) return { error: 'A választott egyházmegye nem található.' }
  const dio = dioRow as unknown as {
    id: string
    name: string
    district_id: string | null
    districts: { name: string | null } | { name: string | null }[] | null
  }
  const districtRel = Array.isArray(dio.districts) ? dio.districts[0] : dio.districts
  const districtName = districtRel?.name ?? null

  // 4) Mentés. A legacy SZÖVEGES `egyhazmegye`/`district` oszlopokat is együtt
  //    írjuk: az éves jelentés (lib/annual-report/generator.ts) ezeket részesíti
  //    előnyben a valódi join-nal szemben, így a hivatalos nyomtatványon eddig
  //    a régi, seed-elt egyházmegye-név maradhatott.
  const warnings: string[] = []
  const fullPayload: Record<string, unknown> = {
    diocese_id: dioceseId,
    egyhazmegye: dio.name,
    ...(districtName ? { district: districtName } : {}),
  }

  // A `.select('id')` KRITIKUS: RLS-elutasításnál a Supabase NEM ad hibát, csak
  // 0 érintett sort — enélkül a felület sikert jelezne egy meg nem történt
  // mentésre (néma no-op hibaosztály).
  let updated = await access.supabase
    .from('congregations')
    .update(fullPayload)
    .eq('id', congregationId)
    .select('id')

  // Régi DB-n hiányozhat a legacy `egyhazmegye`/`district` oszlop → a kötés
  // mentése akkor se bukjon el; a diocese_id-t magát viszont SOHA nem hagyjuk ki.
  if (updated.error && /column|does not exist|schema cache|could not find/i.test(updated.error.message)) {
    warnings.push(
      'A legacy szöveges „egyházmegye/egyházkerület" oszlopok nem frissültek (az adatbázis nem ismeri őket).',
    )
    updated = await access.supabase
      .from('congregations')
      .update({ diocese_id: dioceseId })
      .eq('id', congregationId)
      .select('id')
  }

  if (updated.error) return { error: `A mentés sikertelen: ${updated.error.message}` }
  if (!updated.data || updated.data.length === 0) {
    return {
      error:
        'A mentés nem történt meg (az adatbázis jogosultság-szabálya elutasította). A congregations UPDATE-jogot a profiles.role = admin / esperes / egyhazmegyei_admin szerep adja — ellenőrizze a saját profil-szerepét, vagy futtassa a migration-docs/sql/2026-08-10-gyulekezet-megye-kotes-javitas.sql javító SQL-t.',
    }
  }

  // 5) Propagáció: a gyülekezet felhasználóinak profiles.diocese_id / district_id
  //    skalárja. A fail-closed scope (lib/auth/level-scope.ts) ezekből dolgozik,
  //    és a lib/users/activate-on-role-assign.ts is a gyülekezet diocese_id-jából
  //    olvasta őket — árva gyülekezetnél tehát a lelkész skalárjai is NULL-ban
  //    maradtak. Meglévő, biztonságos helper: az `admin_activate_user`
  //    SECURITY DEFINER RPC (COALESCE-szel ír, aktív fióknál is — lásd
  //    migration-docs/sql/2026-07-01-admin-activate-user-reassign.sql).
  //    Best-effort: a hibája NEM buktatja a fő műveletet, csak figyelmeztetés.
  //    ⚠️ CSAK AKTÍV profilokra: az `admin_activate_user` egy `pending` fiókot
  //    AKTIVÁLNA (ez a fő feladata) — egy egyházmegye-javítás nem hagyhat jóvá
  //    véletlenül függőben lévő hozzáféréseket.
  const { data: affectedProfiles } = await access.supabase
    .from('profiles')
    .select('id')
    .eq('congregation_id', congregationId)
    .eq('status', 'active')

  let syncedProfiles = 0
  let failedProfiles = 0
  for (const p of (affectedProfiles || []) as Array<{ id: string }>) {
    const { error: rpcErr } = await access.supabase.rpc('admin_activate_user', {
      p_user_id: p.id,
      p_congregation_id: congregationId,
      p_diocese_id: dioceseId,
      p_district_id: dio.district_id,
    })
    if (rpcErr) failedProfiles += 1
    else syncedProfiles += 1
  }
  if (failedProfiles > 0) {
    warnings.push(
      `${failedProfiles} felhasználó egyházmegye/egyházkerület mezője nem frissült — futtassa a javító SQL B5 blokkját.`,
    )
  }

  await logAuditEvent(
    {
      action: 'admin.congregation.diocese_assigned',
      targetTable: 'congregations',
      targetId: congregationId,
      metadata: {
        congregation_name: congName,
        previous_diocese_id: previousDioceseId,
        new_diocese_id: dioceseId,
        new_diocese_name: dio.name,
        district_name: districtName,
        synced_profiles: syncedProfiles,
        failed_profiles: failedProfiles,
      },
    },
    access.supabase,
  )

  revalidatePath('/admin/gyulekezetek')
  revalidatePath('/admin')
  revalidatePath('/', 'layout')

  return {
    success: previousDioceseId
      ? `${congName} átkerült ide: ${dio.name}.`
      : `${congName} egyházmegyéje beállítva: ${dio.name}.`,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}
