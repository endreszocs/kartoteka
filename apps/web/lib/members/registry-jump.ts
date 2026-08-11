/**
 * UGRÁS A HIBALISTÁRÓL A SZEMÉLYI KARTONRA (2026-08-11)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * MIÉRT KELL: az új térkép-hiba üzenete azt kéri, hogy a lelkész „nyissa meg a
 * személyi kartont, és ott javítsa". A tagnyilvántartás Hibák füle viszont egy
 * MÁSIK fül, és a kartont a „Személyek" fül nyitja — vagyis a lelkésznek eddig
 * fejben kellett tartania a nevet, átváltania, majd kikeresnie. Egy javítási
 * utasítás annyit ér, amennyire végig lehet menni rajta.
 *
 * MIÉRT ÍGY (sessionStorage és nem prop / URL-paraméter):
 *   · A két fül SOHA nincs egyszerre a DOM-ban (`member-tabs-v4` feltételesen
 *     rendereli) — a hibalista UNMOUNTOLÓDIK, mielőtt a személylista megjelenne.
 *     Reacten át tehát nincs mit átadni, csak a fül-váltó állapotát kellene
 *     megbolygatni: az sok, sérülékeny huzalozás egy apró kényelmi lépésért.
 *   · URL-paraméter esetén a NÉV bekerülne a címsorba, és onnan a
 *     szerver-logokba. A projekt szabálya: személyes adat nem megy query
 *     stringbe. A `sessionStorage` a böngészőt nem hagyja el.
 *   · EGYSZER használatos: kiolvasáskor törlődik, tehát egy későbbi
 *     fül-visszaváltás nem szűri le újra „magától" a listát.
 *
 * A tár elérése MINDIG `try/catch`-ben: privát böngészőablakban és letiltott
 * sütiknél a `sessionStorage` puszta olvasása is dobhat. Ilyenkor a funkció
 * némán elmarad — a hibalista és a személylista is működik nélküle.
 */

const JUMP_KEY = 'kartoteka:tagnyilvantartas:ugras-kereses'

/**
 * MIT KÉRÜNK A SZEMÉLYLISTÁTÓL.
 *
 * ⚑ 2026-08-11 — KÉT IRÁNY, EGY CSATORNA. A név-alapú ugrás mellé kellett egy
 *   TELEPÜLÉS-alapú is: a Hibák fül „hiányzik a település" tétele
 *   TELEPÜLÉSENKÉNT EGY sor, de élesben 70 tagot érint, és a javítás
 *   TAGONKÉNTI. Lista nélkül a lelkésznek 70-szer kellene végigjárnia a
 *   karton → mentés → „Hibák újraellenőrzése" (teljes gyülekezet!) kört, hogy
 *   megtudja, ki a következő. A település-szűrő egyetlen koppintással kiteszi
 *   mind a 70 tagot egy listába.
 */
export interface MemberJumpRequest {
  /** A keresőmezőbe kerülő szöveg (a tag neve). */
  kereses: string | null
  /** A település-szűrő értéke (a `PersonFilters.locality` a nevet várja). */
  telepules: string | null
}

function tarolj(request: MemberJumpRequest): void {
  try {
    window.sessionStorage.setItem(JUMP_KEY, JSON.stringify(request))
  } catch {
    // Nincs tár — a fülváltás ettől még megtörténik, csak szűrés nélkül.
  }
}

/** A hibalistáról: „ezt a tagot keresd elő a Személyek fülön". */
export function requestMemberJump(searchText: string | null | undefined): void {
  const value = (searchText || '').trim()
  if (!value) return
  tarolj({ kereses: value, telepules: null })
}

/** A hibalistáról: „mutasd MINDENKIT, aki ezen a településen lakik". */
export function requestLocalityJump(localityName: string | null | undefined): void {
  const value = (localityName || '').trim()
  if (!value) return
  tarolj({ kereses: null, telepules: value })
}

/** A személylistáról: „kért valaki ugrást?" — és rögtön el is felejtjük. */
export function consumeMemberJump(): MemberJumpRequest | null {
  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(JUMP_KEY)
    if (raw) window.sessionStorage.removeItem(JUMP_KEY)
  } catch {
    return null
  }
  if (!raw || !raw.trim()) return null

  // ⚠️ VISSZAFELÉ KOMPATIBILIS: a korábbi változat NYERS nevet tárolt. Egy
  //    telepítés pillanatában a lelkész böngészőjében még ott ülhet egy ilyen
  //    érték — JSON-ként értelmezve az kivételt dobna, és az ugrás elveszne.
  try {
    const parsed = JSON.parse(raw) as Partial<MemberJumpRequest> | null
    if (parsed && typeof parsed === 'object') {
      const kereses = (parsed.kereses || '').trim() || null
      const telepules = (parsed.telepules || '').trim() || null
      return kereses || telepules ? { kereses, telepules } : null
    }
  } catch {
    // nem JSON → régi formátum
  }
  return { kereses: raw.trim(), telepules: null }
}
