/**
 * Adat-MENTES almodul: a normalizáló és az Enek típus a 608 KB-os korpusz
 * nélkül importálható (`@kartoteka/enekeskonyv/src/normalize`). Kliens-oldali,
 * billentyűzés-idejű használatra — a korpuszt igénylő kereső API-t az index.ts
 * adja, azt dynamic import()-tal érdemes behúzni.
 */

export interface Enek {
  /** Az ének sorszáma (1–504). */
  szam: number
  /** Betűs változat jele ('a'/'b'/'c'), vagy null ha nincs. */
  betu: string | null
  /** Teljes azonosító, pl. '23' vagy '400b'. Egyedi. */
  azonosito: string
  /** Cím — a genfi zsoltároknál (1–150) null, a dicséreteknél mindig van. */
  cim: string | null
  /** Tematikus szakasz neve (a legközelebbi megelőző fejléc; zsoltároknál "Zsoltárok"). */
  szakasz: string
  /** Versszakok teljes szövege, versszakonként sortörésekkel ('\n'). */
  versszakok: string[]
  /** Az első versszak első sora (zsoltároknál ez a gyakorlati "cím"). */
  elsoSor: string
}

/**
 * Kereséshez normalizál: kisbetűsít, lecsupaszítja az ékezeteket (á→a, ő→o, ű→u…)
 * és összevonja a szóközöket. A web és a desktop UI is ezt használja, hogy a
 * lekérdezés és az adat azonos alakra kerüljön.
 */
export function normalizeSearchText(szoveg: string): string {
  return szoveg
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
