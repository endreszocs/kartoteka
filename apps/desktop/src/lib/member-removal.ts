/**
 * member-removal — a webes négyutas tag-kivezetés desktop-tükre
 * (2026-08-15, desktop-paritás 2. szelet — „A törlés egy nyelvet beszéljen").
 *
 * FORRÁS (viselkedés-azonos tükör): apps/web/app/(dashboard)/tagnyilvantartas/
 * actions.ts → `removeMember` + `checkPersonReferences`. Ha ott változik a
 * kivezetés-lánc, EZT A FÁJLT IS frissíteni kell — a két fájl kölcsönösen
 * hivatkozik egymásra (a repó ismert hibaosztálya: „a második felület a régi
 * implementációt őrzi"). A megosztható darabok már közösek: a séma és a
 * típusok a @kartoteka/validations-ből, a település-feloldás és a választói
 * újraszámítás a @kartoteka/core-ból jön, a dialógus a @kartoteka/ui-app-ból.
 *
 * MIÉRT online-only (paritás-terv 2. szelet + 4.4. kockázat): a kivezetés
 * ritka és felelős művelet — anyakönyvi lánccal, RPC-vel, választói
 * újraszámítással. Offline outbox-ba tenni TILOS (fail-closed): kapcsolat
 * vagy session nélkül a művelet HANGOSAN elutasít, nem áll várakozó sorba.
 *
 * MIÉRT vannak kézi őrök (4.8. kockázat): desktopon nincs middleware és nincs
 * Server Action — a webes KÉZI tulajdonjog-ellenőrzést (IDOR-védelem) itt is
 * végrehajtjuk, az RLS-en FELÜL. Minden szűrő fail-closed (memória-hibaosztály:
 * „skalár hatókör + `if (id) filter` = néma teljes szivárgás").
 */

import { getOrCreateLocality, refreshVoterEligibility } from '@kartoteka/core'
import {
  szemelyRemoveSchema,
  type PersonReferenceItem,
  type PersonReferencesResult,
  type SzemelyRemoveInput,
  type SzemelyRemoveResult,
} from '@kartoteka/validations'

import { errorMessage } from './error'
import { dbExecute } from './local-db'
import { getDesktopSupabase } from './supabase'
import { getVerifiedSession } from './verified-session'

// ── Audit-napló (a webes lib/audit/log.ts tükre, desktop-kontextusra) ──

/**
 * Fail-soft audit: a naplózás hibája SOHA nem buktatja el az üzleti műveletet.
 * A webes változattal azonos RPC (`log_audit_event`); ip/user-agent desktopról
 * nincs — null megy (a webes 7-paraméteres forma), régi szerveren (PGRST202)
 * az 5-paraméteres formára esünk vissza, pontosan mint a web.
 *
 * 2026-08-15 (3. szelet): exportálva — a desktop Kuka (lib/recycle-bin.ts)
 * ugyanezt a naplózót használja (közös helper, nem széthúzó másolat).
 */
export async function logAuditDesktop(input: {
  action: string
  targetTable?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const supabase = getDesktopSupabase()
    const { error } = await supabase.rpc('log_audit_event', {
      p_action: input.action,
      p_target_table: input.targetTable ?? null,
      p_target_id: input.targetId ?? null,
      p_metadata: input.metadata ?? null,
      p_device_id: null,
      p_ip: null,
      p_user_agent: null,
    })
    if (error) {
      if (error.code === 'PGRST202') {
        const legacy = await supabase.rpc('log_audit_event', {
          p_action: input.action,
          p_target_table: input.targetTable ?? null,
          p_target_id: input.targetId ?? null,
          p_metadata: input.metadata ?? null,
          p_device_id: null,
        })
        if (legacy.error) {
          console.warn(`[AUDIT] log_audit_event sikertelen (${input.action}): ${legacy.error.message}`)
        }
        return
      }
      console.warn(`[AUDIT] log_audit_event sikertelen (${input.action}): ${error.message}`)
    }
  } catch (err) {
    console.warn(`[AUDIT] log_audit_event kivétel (${input.action}): ${errorMessage(err)}`)
  }
}

// ── Előzetes kapcsolat-ellenőrzés (a webes checkPersonReferences tükre) ──

/**
 * A törlés-dialógus ELŐZETES ellenőrzése: mi hivatkozik a személyre, és a
 * művelet végleges törlés vagy elrejtés lesz-e. Csak olvas
 * (szemely_kapcsolatok RPC). Fail-soft: ha az RPC nem érhető el,
 * `available: false` — a dialógus az általános figyelmeztetést mutatja.
 *
 * ⚠️ Modul-szintű, referencia-stabil függvény — a közös MemberRemoveDialog
 * effekt-dependenciája (inline lambda újraindítaná a betöltést).
 */
export async function checkPersonReferencesDesktop(
  personId: number,
): Promise<PersonReferencesResult> {
  const ures: PersonReferencesResult = { available: false, blokkolo: [], veleTorlodik: [] }
  if (!Number.isInteger(personId)) return ures

  try {
    const supabase = getDesktopSupabase()
    const { data, error } = await supabase.rpc('szemely_kapcsolatok', { p_szemely_id: personId })
    if (error) {
      // 42883 = a 2026-08-14-szemely-torles-ket-utja.sql még nem futott le.
      console.warn('[checkPersonReferencesDesktop]', error.message)
      return ures
    }
    const res = data as {
      status?: string
      blokkolo?: PersonReferenceItem[]
      vele_torlodik?: PersonReferenceItem[]
    } | null
    if (!res || res.status !== 'ok') {
      return {
        ...ures,
        error: res?.status === 'forbidden' ? 'Nincs jogosultság az ellenőrzéshez.' : undefined,
      }
    }
    return {
      available: true,
      blokkolo: res.blokkolo ?? [],
      veleTorlodik: res.vele_torlodik ?? [],
    }
  } catch (err) {
    console.warn('[checkPersonReferencesDesktop] kivétel:', errorMessage(err))
    return ures
  }
}

// ── A négyutas kivezetés (a webes removeMember tükre) ────────

export async function removeMemberDesktop(
  congregationId: string,
  data: SzemelyRemoveInput,
): Promise<SzemelyRemoveResult> {
  const parsed = szemelyRemoveSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Fail-closed hatókör-őr: üres congregation_id-vel SOHA nem írunk.
  if (!congregationId) {
    return { error: 'Hiányzó gyülekezet-azonosító — a kivezetés nem futtatható.' }
  }

  // 4.3. kockázat: MINDEN felhő-írás a verified-session őrön át
  // (session + lejárat + fiók-egyezőség) — hibánál érthető magyar üzenet.
  const verified = await getVerifiedSession()
  if (!verified.ok) return { error: verified.message }

  const supabase = getDesktopSupabase()
  const { id, reason } = parsed.data

  // 2026-06-10 (Fázis 1) webes minta: tulajdonjog-ellenőrzés — a kivezetés
  // CSAK a saját gyülekezet tagjára futhat (IDOR-védelem). Enélkül a
  // 'meghalt'/'elkoltozott'/'kitert' ágak más gyülekezet tagjára is szúrnának
  // be temetési/elköltözési rekordot.
  const { data: ownedPerson, error: ownErr } = await supabase
    .from('szemely')
    .select('id')
    .eq('id', id)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (ownErr) return { error: `A tag ellenőrzése nem sikerült: ${ownErr.message}` }
  if (!ownedPerson) return { error: 'A megadott tag nem található az aktív gyülekezetben.' }

  try {
    if (reason === 'meghalt') {
      const hHelyId = parsed.data.hhely ? await getOrCreateLocality(supabase, parsed.data.hhely) : null
      const tHelyId = parsed.data.thely ? await getOrCreateLocality(supabase, parsed.data.thely) : null
      const { error: temetesErr } = await supabase.from('temetes').insert([{
        id_szemely: id, congregation_id: congregationId, hdatum: parsed.data.hdatum,
        tdatum: parsed.data.tdatum, hoka: parsed.data.hoka || null,
        lelkeszneve: parsed.data.lelkesz || null, munkanaploba: parsed.data.munkanaplo || false,
        hhelyid: hHelyId, thelyid: tHelyId,
      }])
      // Fail-closed szigorítás a webhez képest (szándékos, 4.8. kockázat):
      // ha a temetés-rekord nem jött létre, NEM állítjuk elhunyttá a tagot —
      // különben pont az anyakönyv-kihagyásos adatminőség-rés születne újra,
      // amit ez a szelet felszámol. (A webes ág ezt a hibát ma eltűri —
      // jelölt webes utókövetésre.)
      if (temetesErr) {
        return { error: `A temetés-bejegyzés rögzítése nem sikerült: ${temetesErr.message}` }
      }
      const { error } = await supabase
        .from('szemely')
        .update({ meghalt: true, member_status: 'elhunyt', congregation_id: congregationId })
        .eq('id', id)
        .eq('congregation_id', congregationId)
      if (error) return { error: `Hiba: ${error.message}` }

      // 2026-06-10 (Fázis 3, P1-7b) webes minta: a háztartás-tagság és a
      // párkapcsolat (házastárs + élettárs) lezárása a halál napjával —
      // best-effort, a hiba figyelmeztetésként jut el a lelkészhez, nem némán.
      const figyelmeztetesek: string[] = []
      try {
        const { error: haztErr } = await supabase
          .from('haztartas_tag')
          .update({ ervenyes_ig: parsed.data.hdatum })
          .eq('id_szemely', id)
          .is('ervenyes_ig', null)
          .eq('congregation_id', congregationId)
        if (haztErr) {
          console.error('[removeMemberDesktop] háztartás-tagság lezárása sikertelen:', haztErr.message)
          figyelmeztetesek.push('Az elhunyt háztartási tagsága nem zárult le — nyisd meg a Családok fülön a kartont, és ellenőrizd.')
        }
        const { error: parErr } = await supabase
          .from('szemely_kapcsolat')
          .update({ ervenyes_ig: parsed.data.hdatum })
          .in('tipus', ['hazastars', 'elettars'])
          .or(`id_szemely_1.eq.${id},id_szemely_2.eq.${id}`)
          .is('ervenyes_ig', null)
          .eq('congregation_id', congregationId)
        if (parErr) {
          console.error('[removeMemberDesktop] párkapcsolat lezárása sikertelen:', parErr.message)
          figyelmeztetesek.push('A házastársi/élettársi kapcsolat lezárása nem sikerült — a családfán a pár egyelőre együtt jelenik meg. Végezd el újra a kivezetést.')
        }
      } catch (e) {
        console.warn('[removeMemberDesktop] hibrid-modell lezárás sikertelen (nem blokkoló):', errorMessage(e))
        figyelmeztetesek.push('A háztartási tagság és a párkapcsolat lezárása nem sikerült — nyisd meg a Családok fülön a kartont, és ellenőrizd.')
      }

      // 2026-08-15 (átvilágítás 23.) webes minta: választói jogosultság
      // újraszámítása — enélkül az elhunyt a névjegyzéken maradna.
      const voterMeghalt = await refreshVoterEligibility(supabase, congregationId, 'removeMemberDesktop/meghalt')
      if (voterMeghalt.warning) figyelmeztetesek.push(voterMeghalt.warning)

      await logAuditDesktop({ action: 'member.remove', targetTable: 'szemely', targetId: String(id), metadata: { reason: 'meghalt' } })
      return {
        success: true,
        message: 'A haláleset sikeresen adminisztrálva.',
        warning: figyelmeztetesek.length > 0 ? figyelmeztetesek.join(' ') : undefined,
      }
    }

    if (reason === 'elkoltozott') {
      const hovaId = parsed.data.kolt_hova ? await getOrCreateLocality(supabase, parsed.data.kolt_hova) : null
      const { error: elkErr } = await supabase.from('elkoltozott').insert([{
        id_szemely: id, congregation_id: congregationId,
        mikor: parsed.data.kolt_datum || new Date().toISOString(),
        kulfoldre: parsed.data.kulfold || false, megjegyzes: parsed.data.kolt_megj || null, hovaid: hovaId,
      }])
      // Fail-closed szigorítás (lásd a 'meghalt' ág kommentjét): rekord nélkül
      // nem állítunk státuszt.
      if (elkErr) return { error: `Az elköltözés-bejegyzés rögzítése nem sikerült: ${elkErr.message}` }
      // A webes tanulság (2026-07-17, PR-2 F1.2): a szemely táblának NINCS
      // elkoltozott oszlopa — csak a member_status áll át.
      const { error } = await supabase
        .from('szemely')
        .update({ member_status: 'elköltözött', congregation_id: congregationId })
        .eq('id', id)
        .eq('congregation_id', congregationId)
      if (error) return { error: `Hiba: ${error.message}` }
      const voterElkoltozott = await refreshVoterEligibility(supabase, congregationId, 'removeMemberDesktop/elkoltozott')
      await logAuditDesktop({ action: 'member.remove', targetTable: 'szemely', targetId: String(id), metadata: { reason: 'elkoltozott' } })
      return { success: true, message: 'Az elköltözés sikeresen adminisztrálva.', warning: voterElkoltozott.warning }
    }

    if (reason === 'kitert') {
      const hovaId = parsed.data.kitert_hova ? await getOrCreateLocality(supabase, parsed.data.kitert_hova) : null
      const { error: kitErr } = await supabase.from('kitert').insert([{
        id_szemely: id, congregation_id: congregationId, felekezet: parsed.data.kitert_vallas || 'Ismeretlen',
        mikor: parsed.data.kitert_datum || new Date().toISOString(), megjegyzes: parsed.data.kitert_megj || null, hovaid: hovaId,
      }])
      if (kitErr) return { error: `A kitérés-bejegyzés rögzítése nem sikerült: ${kitErr.message}` }
      const { error } = await supabase
        .from('szemely')
        .update({ member_status: 'kitért', vallas: parsed.data.kitert_vallas || 'Ismeretlen', congregation_id: congregationId })
        .eq('id', id)
        .eq('congregation_id', congregationId)
      if (error) return { error: `Hiba: ${error.message}` }
      const voterKitert = await refreshVoterEligibility(supabase, congregationId, 'removeMemberDesktop/kitert')
      await logAuditDesktop({ action: 'member.remove', targetTable: 'szemely', targetId: String(id), metadata: { reason: 'kitert' } })
      return { success: true, message: 'A kitérés sikeresen adminisztrálva.', warning: voterKitert.warning }
    }

    if (reason === 'torles') {
      // 2026-08-14 (1. döntés, „naplózott törlés") webes minta: a törlés ELŐTT
      // pillanatképet veszünk a személyről és a vele törlődő kapcsolatairól —
      // ha az RPC tényleg VÉGLEGESEN töröl, a pillanatkép az audit_log-ba
      // kerül (visszakereshető, ki kit törölt, mikor, és mi tűnt el vele).
      const { data: pillanatSor } = await supabase
        .from('szemely')
        .select('*')
        .eq('id', id)
        .eq('congregation_id', congregationId)
        .maybeSingle()
      const szemelyPillanat = pillanatSor
        ? ({ ...(pillanatSor as Record<string, unknown>) } as Record<string, unknown>)
        : null
      if (szemelyPillanat) delete szemelyPillanat.kep // a base64 fénykép nem naplóba való
      let veleTorlodik: unknown = null
      try {
        const { data: kapcs } = await supabase.rpc('szemely_kapcsolatok', { p_szemely_id: id })
        veleTorlodik = (kapcs as { vele_torlodik?: unknown } | null)?.vele_torlodik ?? null
      } catch {
        // fail-soft: a kapcsolat-lista nélkül is naplózunk
      }

      // A törlés/elrejtés döntését az atomikus, jogosultság-ellenőrzött RPC
      // hozza (tagnyilvantartas_tag_torles — a szerveren MÁR él, SQL nem kell):
      // pénzügyi/anyakönyvi/védett kapcsolat → elrejtés; különben végleges
      // törlés; váratlan FK-ütközés → elrejtés-fallback.
      const { data: rpcData, error: rpcErr } = await supabase.rpc('tagnyilvantartas_tag_torles', { p_szemely_id: id })
      if (rpcErr) {
        // A migrációs utótag CSAK hiányzó függvénynél jogos — más hibánál
        // (pl. a tagi-portál életciklus-őre) félrevezetne.
        const hianyzoFuggveny = rpcErr.code === '42883' || rpcErr.message.includes('tagnyilvantartas_tag_torles')
        return {
          error: `A törlés nem sikerült: ${rpcErr.message}${
            hianyzoFuggveny ? ' (Lefutott már a 2026-06-10-es adatbázis-migráció?)' : ''
          }`,
        }
      }

      const status = (rpcData as { status?: string } | null)?.status
      const torlesVegrehajtva =
        status === 'deleted' || (typeof status === 'string' && status.startsWith('hidden_'))
      const voterTorles = torlesVegrehajtva
        ? await refreshVoterEligibility(supabase, congregationId, 'removeMemberDesktop/torles')
        : { ok: true as const, warning: undefined }
      await logAuditDesktop({ action: 'member.remove', targetTable: 'szemely', targetId: String(id), metadata: { reason: 'torles', eredmeny: status || 'ismeretlen' } })

      if (status === 'deleted') {
        // A VÉGLEGES törlés kiemelt naplója teljes sor-pillanatképpel (a
        // webes minta tükre). A logAuditDesktop fail-soft.
        await logAuditDesktop({
          action: 'member.delete.permanent',
          targetTable: 'szemely',
          targetId: String(id),
          metadata: { szemely: szemelyPillanat, vele_torolt: veleTorlodik },
        })
        // Lokális tükör-takarítás: a szerveren FIZIKAI DELETE történt, amiről
        // a delta-pull sosem szerez tudomást (F6.5), az id-söprés pedig 12
        // órás időzárral fut — a most törölt tag ezért AZONNAL kikerül a
        // helyi másolatból is. Fail-soft: hibánál a söprés a védőháló.
        try {
          await dbExecute(
            `DELETE FROM szemely_local WHERE id = ?1 AND congregation_id = ?2`,
            [id, congregationId],
          )
        } catch (err) {
          console.warn('[removeMemberDesktop] a lokális tükör-takarítás kimaradt:', errorMessage(err))
        }
      }

      switch (status) {
        case 'deleted':
          return { success: true, message: 'A tag véglegesen törölve. A törlésről napló készült.', warning: voterTorles.warning }
        case 'hidden_payments':
          return { success: true, message: 'A tag elrejtve a névsorból (pénzügyi tranzakció miatt nem törölhető véglegesen).', warning: voterTorles.warning }
        case 'hidden_registry':
          return { success: true, message: 'A tag elrejtve a névsorból (anyakönyvi bejegyzései miatt nem törölhető véglegesen).', warning: voterTorles.warning }
        case 'hidden_kapcsolat':
          return { success: true, message: 'A tag elrejtve a névsorból (védett kapcsolatai miatt nem törölhető véglegesen).', warning: voterTorles.warning }
        case 'hidden_fk':
          return { success: true, message: 'A tag elrejtve a névsorból (kapcsolódó rekordok miatt nem törölhető véglegesen).', warning: voterTorles.warning }
        case 'forbidden':
          return { error: 'Nincs jogosultság a tag törléséhez.' }
        case 'not_found':
          return { error: 'A megadott tag nem található.' }
        default:
          return { error: 'Ismeretlen válasz a törlési művelettől.' }
      }
    }

    return { error: 'Ismeretlen művelet.' }
  } catch (err) {
    // Hálózat-megszakadás művelet közben: hangos magyar hiba, nem néma bukás.
    return { error: `A kivezetés nem sikerült: ${errorMessage(err)}` }
  }
}
