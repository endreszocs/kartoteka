/**
 * BETEKINTÉS-KIMUTATÁS — az audit-bejegyzés → KÖZÉRTHETŐ MAGYAR MONDAT
 * fordítása (2026-08-23).
 *
 * MIÉRT VAN: az Adatvédelmi tájékoztató 18. szakasza betekintés-kimutatást
 * ígér. A napló MEGVAN (`public.audit_log` + `audit.record_version`), de nyers,
 * angol kulcsszavas sorokban áll (`member.save`, `UPDATE`, `befizetes`) — ez
 * egy érintettnek nem kimutatás, hanem gépi zaj. Ez a fájl fordítja emberi
 * mondatra.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ AMIT A NAPLÓ MA TUD — ÉS AMIT NEM. EZT A FELÜLET IS KIMONDJA.
 * ════════════════════════════════════════════════════════════════════════════
 * A rendszer a VÁLTOZÁSOKAT naplózza (létrehozás, módosítás, törlés) és a
 * belépéseket. A PUSZTA MEGTEKINTÉS (egy lista megnyitása, egy adatlap
 * elolvasása) MA NEM KERÜL NAPLÓBA. Ezért ez a kimutatás azt mondja meg,
 * KI NYÚLT AZ ADATOKHOZ — nem azt, hogy ki nézte meg őket.
 *
 * ⛔ EZT TILOS ELKENNI. Egy kimutatás, ami „ki nézte meg" címmel változásokat
 *    sorol fel, HAMIS BIZTONSÁGÉRZETET ad: az érintett azt hinné, üres lista =
 *    senki nem látta az adatait. A `NAPLO_KORLATOK` szövegei ezért nem
 *    díszítés, hanem a kimutatás igazságtartalmának a része.
 *
 * ⚠️ IMPORT-MENTES (a `tabla-cimek.ts` kivételével) — a
 * `scripts/selftest-adatexport.mjs` önállóan betölti és végigméri.
 */

import { tablaCim } from '@/lib/export/tabla-cimek'

// ─────────────────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `esemeny` — `public.audit_log` sor (action-kulcsos rendszer-esemény).
 * `rekord`  — `audit.record_version` sor (INSERT / UPDATE / DELETE egy táblán).
 */
export type BetekintesForras = 'esemeny' | 'rekord'

export interface BetekintesBejegyzes {
  id: string
  /** ISO időbélyeg. */
  mikor: string
  /** A cselekvő neve. `null` = nem deríthető ki (rendszer / törölt fiók). */
  kiNeve?: string | null
  kiEmail?: string | null
  /** `audit_log.action`, vagy `record_version.op` (INSERT/UPDATE/DELETE). */
  muvelet: string
  /** Az érintett tábla neve, ha van. */
  tabla?: string | null
  forras: BetekintesForras
  /** `true`, ha a bejelentkezett felhasználó SAJÁT tevékenysége. */
  sajat?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// A napló korlátai — a felület SZÓ SZERINT ezt írja ki
// ─────────────────────────────────────────────────────────────────────────────

export const NAPLO_KORLATOK: string[] = [
  'A rendszer a VÁLTOZÁSOKAT naplózza: ki hozott létre, módosított vagy törölt egy bejegyzést, és ki mikor lépett be.',
  'A puszta megtekintés (egy lista megnyitása, egy adatlap elolvasása) ma NEM kerül naplóba — ezért az üres kimutatás nem bizonyítja, hogy senki nem látta az adatokat.',
  'A kimutatás csak azokat a bejegyzéseket mutatja, amelyekhez jogosultságod van: a saját tevékenységedet, illetve a saját gyülekezeted adatain végzett műveleteket.',
  'A napló nem írható át és nem törölhető a felületről — ez a rendszer emlékezete.',
]

// ─────────────────────────────────────────────────────────────────────────────
// Szótárak
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `audit_log.action` → MAGYAR ÁLLÍTMÁNY (a cselekvő az alany).
 *
 * ⚠️ AMI NINCS BENNE, AZT NEM TALÁLJUK KI: az ismeretlen kulcs a nyers
 * kódjával jelenik meg, „ismeretlen műveletet végzett" felvezetéssel. Inkább
 * legyen csúnya, mint hamis.
 */
export const MUVELET_MONDATOK: Record<string, string> = {
  login: 'belépett a rendszerbe',
  logout: 'kilépett a rendszerből',
  login_failed: 'sikertelenül próbált belépni',
  'mfa.mentokod_belepes': 'mentőkóddal lépett be',
  'mfa.mentokod_hibas': 'hibás mentőkódot adott meg',
  'mfa.mentokodok_generalva': 'új mentőkódokat készített a fiókjához',
  god_mode_deactivate: 'kilépett a rendszergazdai módból',

  'member.save': 'mentett egy személyi adatlapot',
  'member.remove': 'kivett egy személyt a nyilvántartásból',
  'member.restore': 'visszaállított egy korábban kivett személyt',
  'member.delete.permanent': 'VÉGLEGESEN törölt egy személyt',
  'member.consent_update': 'módosított egy adatkezelési hozzájárulást',
  'member.note_update': 'módosított egy személyhez fűzött megjegyzést',
  'member.link_parents': 'szülő-gyermek kapcsolatot rögzített',
  'member.transfer_certificate': 'áthelyezési bizonyítványt állított ki',

  'family.save': 'mentett egy családot',
  'family.delete': 'törölt egy családot',
  'family.divorce': 'rögzítette egy házasság felbontását',
  'family.assign_member': 'családhoz rendelt egy személyt',
  'family.complete_parent': 'kiegészítette egy család szülői adatait',
  'family.visit_save': 'családlátogatást rögzített',
  'family.wipe_structure': 'törölte egy család szerkezetét',

  'registry.event_update': 'módosított egy anyakönyvi eseményt',
  'registry.note_update': 'módosított egy anyakönyvi megjegyzést',

  'presbyter.save': 'mentett egy presbiteri adatlapot',
  'presbyter.delete': 'törölt egy presbiteri adatlapot',

  'district.save': 'mentett egy körzetet',
  'district.delete': 'törölt egy körzetet',
  'district.assign_family': 'körzethez rendelt egy családot',
  'district.remove_family': 'kivett egy családot a körzetből',
  'district.auto_plan_applied': 'automatikus körzet-beosztást alkalmazott',

  'access_request.approve': 'jóváhagyott egy hozzáférési kérelmet',
  'admin_invite.send': 'meghívót küldött egy új felhasználónak',
  'profile_congregation.approve': 'jóváhagyta egy munkatárs hozzáférését a gyülekezethez',
  'profile_congregation.reject': 'elutasította egy munkatárs hozzáférési kérelmét',
  'profile_congregation.revoke': 'visszavonta egy munkatárs hozzáférését',
  'profile_role.assign': 'szerepkört adott egy felhasználónak',
  'profile_role.revoke': 'visszavont egy szerepkört',
  'user.activate_via_role_assign': 'aktivált egy felhasználói fiókot',
  'user.quick_approve': 'gyorsan jóváhagyott egy felhasználót',
  'user.erase': 'törölt egy felhasználói fiókot',

  'device.register': 'új eszközt regisztrált',
  'device.revoke': 'visszavont egy eszköz-hozzáférést',
  'device.restore': 'visszaállított egy eszköz-hozzáférést',
  'license.issue': 'licencet adott ki',
  'license.extend': 'meghosszabbított egy licencet',
  'license.revoke': 'visszavont egy licencet',
  'license.restore': 'visszaállított egy licencet',
  'license.update': 'módosított egy licencet',

  'transfer.initiate': 'elindított egy gyülekezet-átadást',
  'transfer.complete': 'lezárt egy gyülekezet-átadást',
  'transfer.invite_sent': 'átadási meghívót küldött',
  'transfer.remark.add': 'észrevételt fűzött egy átadáshoz',
  'transfer.review.approve': 'jóváhagyta egy átadás ellenőrzését',

  'validation.run': 'adatellenőrzést futtatott',
  'validation.resolve': 'lezárt egy adatellenőrzési hibát',
  'validation.ignore': 'figyelmen kívül hagyott egy adatellenőrzési hibát',
  'validation.reopen': 'újranyitott egy adatellenőrzési hibát',

  'voter.override_set': 'kézzel módosított egy választói jogosultságot',
  'voter.recompute': 'újraszámolta a választói névjegyzéket',

  'document.download': 'letöltött egy dokumentumot',
  'adatexport.gyulekezet': 'letöltötte a gyülekezet teljes adatcsomagját',
  'adatvedelem.betekintes_naplo': 'megnyitotta a betekintés-kimutatást',
}

/** `record_version.op` → magyar állítmány-töredék. */
export const REKORD_MUVELETEK: Record<string, string> = {
  INSERT: 'új bejegyzést rögzített',
  UPDATE: 'módosított egy bejegyzést',
  DELETE: 'törölt egy bejegyzést',
}

// ─────────────────────────────────────────────────────────────────────────────
// Fordítás
// ─────────────────────────────────────────────────────────────────────────────

/** Ki cselekedett — soha nem üres, és soha nem talál ki nevet. */
export function cselekvoNeve(b: Pick<BetekintesBejegyzes, 'kiNeve' | 'kiEmail' | 'sajat'>): string {
  if (b.sajat) return 'Te'
  const nev = (b.kiNeve || '').trim()
  if (nev) return nev
  const email = (b.kiEmail || '').trim()
  if (email) return email
  return 'A rendszer (nem azonosított felhasználó)'
}

/** ISO → „2026. 08. 23. 14:07". Érvénytelen bemenetnél a nyers értéket adja. */
export function auditIdopont(iso: string | null | undefined): string {
  const nyers = (iso || '').trim()
  if (!nyers) return 'ismeretlen időpont'
  const d = new Date(nyers)
  if (Number.isNaN(d.getTime())) return nyers
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}. ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * A KÖZÉRTHETŐ MAGYAR MONDAT. Tiszta függvény: ugyanarra a sorra mindig
 * ugyanaz a mondat, és HIÁNYOS sorra sem dob — „ismeretlen"-t mond.
 */
export function auditMondat(bejegyzes: BetekintesBejegyzes | null | undefined): string {
  if (!bejegyzes) return 'Ismeretlen bejegyzés.'

  const ki = cselekvoNeve(bejegyzes)
  const mikor = auditIdopont(bejegyzes.mikor)
  const muvelet = (bejegyzes.muvelet || '').trim()

  if (bejegyzes.forras === 'rekord') {
    const op = REKORD_MUVELETEK[muvelet.toUpperCase()]
    const hol = `a(z) „${tablaCim(bejegyzes.tabla)}" nyilvántartásban`
    if (!op) {
      return `${mikor} — ${ki} ismeretlen műveletet végzett (${muvelet || 'nincs megadva'}) ${hol}.`
    }
    return `${mikor} — ${ki} ${op} ${hol}.`
  }

  const allitmany = MUVELET_MONDATOK[muvelet]
  if (!allitmany) {
    // ⛔ SOHA nem találunk ki jelentést: a nyers kulcs látszik.
    return `${mikor} — ${ki} ismeretlen műveletet végzett („${muvelet || 'nincs megadva'}").`
  }

  const tabla = (bejegyzes.tabla || '').trim()
  const hol = tabla ? ` (érintett nyilvántartás: ${tablaCim(tabla)})` : ''
  return `${mikor} — ${ki} ${allitmany}${hol}.`
}

/**
 * Rövid, chip-be való címke a művelet SÚLYÁHOZ. A felület ez alapján színez —
 * a törlés és a végleges törlés nem nézhet ki ugyanúgy, mint egy belépés.
 */
export type MuveletSuly = 'belepes' | 'letrehozas' | 'modositas' | 'torles' | 'egyeb'

export function muveletSulya(bejegyzes: BetekintesBejegyzes | null | undefined): MuveletSuly {
  const muvelet = (bejegyzes?.muvelet || '').trim()
  if (!muvelet) return 'egyeb'

  if (bejegyzes?.forras === 'rekord') {
    switch (muvelet.toUpperCase()) {
      case 'INSERT':
        return 'letrehozas'
      case 'UPDATE':
        return 'modositas'
      case 'DELETE':
        return 'torles'
      default:
        return 'egyeb'
    }
  }

  if (muvelet === 'login' || muvelet === 'logout' || muvelet === 'login_failed') return 'belepes'
  if (muvelet.startsWith('mfa.')) return 'belepes'
  if (/(\.|^)(delete|remove|revoke|erase|wipe)/.test(muvelet)) return 'torles'
  if (/(\.|^)(save|update|set|assign|link|complete)/.test(muvelet)) return 'modositas'
  return 'egyeb'
}
