/**
 * Iktató — pecsét- és aláírás-kép segédek a nyomtatványokhoz (24. pont).
 *
 * A gyülekezet feltöltött PECSÉT- és ALÁÍRÁS-képe (congregations.pecset_url /
 * alairas_url — a cimer_url „logos" bucket-mintája szerint tárolva) a
 * nyomtatott iratokra kerül: a pecsét KÖZÉPRE (halványan, a dátum mellé),
 * az aláírás-kép az aláíró neve/vonala FÖLÉ. Ha nincs feltöltött kép, minden
 * nyomtatvány a mai formájában marad (üres vonal / szaggatott P.H. kör).
 *
 * MIÉRT data: URI: az előnézet-iframe minden szerkesztésnél teljes
 * dokumentum-újratöltést kap (srcDoc), a távoli kép ilyenkor újra hálózatról
 * töltődne és el-eltűnne; a PDF-mentés (html2canvas) pedig a más-originű képet
 * CORS miatt kihagyhatja. Ezért a képeket EGYSZER letöltjük és data: URI-ként
 * ágyazzuk a nyomtatvány-HTML-be — pontosan úgy, ahogy a címer a
 * certificate-issue-dialogban (2026-07-25-ös user-észrevétel nyomán).
 *
 * Tisztán kliens-oldali modul (fetch + FileReader) — csak 'use client'
 * komponensből hívható.
 */

/** A gyülekezet irat-képei (pecsét + aláírás) — nyers vagy data: URL-ként. */
export interface IratKepek {
  pecsetUrl: string | null
  alairasUrl: string | null
}

/**
 * Egy kép letöltése és data: URI-vá alakítása. Hibánál (hálózat, 404, …)
 * NULL — a hívó dönt: az eredeti URL-lel próbálkozik tovább, vagy kihagyja
 * a képet (a nyomtatvány szövege sosem függ ettől).
 */
export async function kepDataUrl(url: string | null | undefined): Promise<string | null> {
  const src = (url || '').trim()
  if (!src) return null
  // A már beágyazott kép változatlanul jó — nincs mit letölteni.
  if (src.startsWith('data:')) return src
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    return dataUrl.startsWith('data:') ? dataUrl : null
  } catch {
    return null
  }
}

/**
 * Egy kép data: URI-ja, hibánál az EREDETI URL — a `<img>` így a beágyazás
 * kudarca esetén is megpróbálja hálózatról betölteni (a fejléc-címer bevált
 * fallback-viselkedése).
 */
export async function kepDataUrlVagyEredeti(url: string | null | undefined): Promise<string | null> {
  const src = (url || '').trim()
  if (!src) return null
  return (await kepDataUrl(src)) || src
}

/**
 * A pecsét + aláírás képpár beágyazása data: URI-ként (párhuzamosan).
 * A hiányzó/hibás kép null-ként jön vissza — a nyomtatvány-építők ilyenkor
 * a mai (kép nélküli) formát adják.
 */
export async function iratKepekBeagyazva(kepek: IratKepek): Promise<IratKepek> {
  const [pecsetUrl, alairasUrl] = await Promise.all([
    kepDataUrlVagyEredeti(kepek.pecsetUrl),
    kepDataUrlVagyEredeti(kepek.alairasUrl),
  ])
  return { pecsetUrl, alairasUrl }
}
