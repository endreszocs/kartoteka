// 2026-08-25: Napi ige + bátorító üzenet — KÖZÖS ADAT-KONTRAKTUS.
//
// Az év MINDEN napjára (a szökőévi február 29-ét is beleértve: 366 kulcs)
// egy igehely + egy rövid, bátorító üzenet a rendszert használó egyházi
// munkatársaknak (lelkészek, adminisztrátorok, könyvelők, gondnokok).
//
// A kulcs 'MM-DD' alakú ('01-01' … '12-31', +'02-29'). Az igehely-hivatkozás
// a @kartoteka/biblia parseReference/validateReference által elfogadott
// magyar alak (pl. 'Zsolt 23,1', '1Móz 1,1', 'Jn 3,16', 'Mt 5,3-5') — a
// selftest minden hivatkozást géppel ellenőriz a Károli-katalógus ellen.

export interface NapiIge {
  /** Igehely-hivatkozás (Károli), pl. 'Zsolt 46,2' — validateReference-kompatibilis. */
  ige: string
  /** 1–2 mondatos bátorító üzenet az egyházi munkatársaknak, magyarul. */
  uzenet: string
}

/** 'MM-DD' kulcs (szökőnap: '02-29'). */
export type NapiIgeNaptar = Record<string, NapiIge>

/** Egy nap olvasmányai az egyéves bibliaolvasó tervben. */
export interface OlvasotervNap {
  /** A nap sorszáma (1–365). */
  nap: number
  /** Olvasmányok fejezet-szinten, pl. ['1Móz 1-2', 'Mt 1'] — validateReference-kompatibilis. */
  olvasmanyok: string[]
}

/**
 * A mai naptári napból a 365 napos terv nap-sorszáma.
 * SZÖKŐÉV-SZABÁLY: a terv 365 napos; szökőévben február 29. „ráérő nap"
 * (null — a felület pótló/elmélkedő napot mutat), február 29. UTÁN pedig a
 * nap-sorszám eggyel csökken, így a terv december 31-én ugyanúgy a 365.
 * napnál zár, és egyetlen olvasmány sem marad ki.
 */
export function olvasotervNapSorszam(datum: Date): number | null {
  const ev = datum.getFullYear()
  const szokoev = (ev % 4 === 0 && ev % 100 !== 0) || ev % 400 === 0
  const start = Date.UTC(ev, 0, 1)
  const ma = Date.UTC(ev, datum.getMonth(), datum.getDate())
  const napAzEvben = Math.floor((ma - start) / 86400000) + 1 // 1..365/366
  if (!szokoev) return napAzEvben
  const szokonap = 31 + 29 // febr. 29. sorszáma szökőévben (60)
  if (napAzEvben === szokonap) return null
  return napAzEvben > szokonap ? napAzEvben - 1 : napAzEvben
}

/** 'MM-DD' kulcs egy dátumból (a napi igéhez — a '02-29' valódi kulcs). */
export function napiIgeKulcs(datum: Date): string {
  const h = String(datum.getMonth() + 1).padStart(2, '0')
  const n = String(datum.getDate()).padStart(2, '0')
  return `${h}-${n}`
}
