/**
 * Kifizetetlen számlák ablaka (7. pont C szelet) — típusok.
 *
 * Sima lib (NEM 'use server') — a Next.js 16 alatt a 'use server' fájl CSAK
 * async function-t exportálhat, ezért a típusok/segédek itt élnek, és a
 * kifizetetlen-actions.ts + a UI innen importál.
 *
 * KÉT FORRÁS, KÉT IRÁNY — ez a lényegi tartalmi különbség:
 *  - 'helyi'  = a feltöltött (ZIP/XML) SZÁLLÍTÓI számla → a gyülekezet TARTOZIK
 *               (irány: 'fizetendo'). Erre van „Kifizetés rögzítése" (kiadás).
 *  - 'oblio'  = az Oblio-fiókban KIÁLLÍTOTT számla, amit a vevő még nem
 *               fizetett ki (collected=0) → a gyülekezetnek TARTOZNAK
 *               (irány: 'kintlevoseg'). Erre NEM kínálunk kiadás-rögzítést —
 *               az fordított irányú (téves) könyvelés lenne.
 */

// ─────────────────────────────────────────────────────────────────
// Egyesített kifizetetlen tétel
// ─────────────────────────────────────────────────────────────────

export interface KifizetetlenTetel {
  /** 'helyi' = szallitoi_szamla sor · 'oblio' = az Oblio API collected=0 találata. */
  forras: 'helyi' | 'oblio'
  /** 'fizetendo' = mi tartozunk · 'kintlevoseg' = nekünk tartoznak. */
  irany: 'fizetendo' | 'kintlevoseg'
  /** Helyi forrásnál a szallitoi_szamla.id — Oblio-tételnél null. */
  szamlaId: string | null
  /** Helyi forrásnál: 'szamla' | 'jovairo' (az összeg mindkettőnél pozitív). */
  tipus: 'szamla' | 'jovairo' | null
  /** Helyi: szállító neve · Oblio: a vevő (aki tartozik). */
  partnerNev: string | null
  szamlaSzam: string | null
  kiallitasDatum: string | null
  fizetesiHatarido: string | null
  osszeg: number
  /** ISO 4217 (RON / EUR / …). */
  penznem: string
  /** Helyi forrás: a dokumentumtár-beli PDF / XML (megnyitáshoz). */
  pdfDokumentumId: string | null
  xmlDokumentumId: string | null
  /** Oblio forrás: a számla PDF-linkje az Oblio-tól. */
  pdfUrl: string | null
  megjegyzes: string | null
}

/** A getKifizetetlenSzamlak action eredménye — MINDKÉT forrás állapota hangosan látszik. */
export interface KifizetetlenEredmeny {
  /** Fizetési határidő szerint rendezve (legsürgősebb elöl, határidő nélküliek a végén). */
  tetelek: KifizetetlenTetel[]
  /** A helyi (szallitoi_szamla) rész hibája — ha nem null, a helyi lista HIÁNYZIK. */
  helyiHiba: string | null
  /** Van-e beállított, aktív Oblio-kapcsolat a gyülekezetnél. */
  oblioAktiv: boolean
  /** Az Oblio-lekérés hibája — ha nem null, az online rész HIÁNYZIK (a helyi attól még él). */
  oblioHiba: string | null
  /** true = az Oblio-lista elérte a lapméretet — lehet ennél több kifizetetlen is. */
  oblioTobbLehet: boolean
}

// ─────────────────────────────────────────────────────────────────
// Kiadás-jelöltek a számla↔kiadás kapcsoláshoz
// ─────────────────────────────────────────────────────────────────

/** Egy élő (nem törölt, nem sztornózott) kiadás-sor mint kapcsolási jelölt. */
export interface KiadasJelolt {
  id: number
  datum: string | null
  osszeg: number
  atvevo: string | null
  nyugta: string | null
  iratszam: string | null
}

// ─────────────────────────────────────────────────────────────────
// A „Kifizetés rögzítése" dialógushoz szükséges pénzügy-törzsadatok
// ─────────────────────────────────────────────────────────────────

/**
 * A CombinedEntryDialog bemenete (jogcím-listák + bankszámlák) — a
 * getKifizetesRogzitoAdatok action tölti, a finance-tabs kategória-építési
 * szabályaival bit-azonosan (közös helperek: isGyulekezetiKonyvelhetoKod,
 * BELSO_MOZGAS_ROGZITO_KODS).
 */
export interface KifizetesRogzitoAdatok {
  incomeCategories: { id: number; kod: string; nev: string }[]
  expenseCategories: { id: number; kod: string; nev: string }[]
  bankAccounts: { id: number; bank_neve: string }[]
  error: string | null
}

// ─────────────────────────────────────────────────────────────────
// Közös segédek
// ─────────────────────────────────────────────────────────────────

/** A mai nap ISO-dátuma (YYYY-MM-DD) — a lejárt-számításhoz. */
export function maiIsoDatum(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Lejárt-e a határidő (szöveg-összehasonlítás YYYY-MM-DD alakon — időzóna-biztos). */
export function lejartE(fizetesiHatarido: string | null, maIso: string): boolean {
  if (!fizetesiHatarido) return false
  return fizetesiHatarido.slice(0, 10) < maIso
}

/** Napok száma a határidőig (negatív = ennyi napja lejárt); null ha nincs határidő. */
export function napokAHataridoig(fizetesiHatarido: string | null, maIso: string): number | null {
  if (!fizetesiHatarido) return null
  const h = new Date(fizetesiHatarido.slice(0, 10) + 'T00:00:00Z').getTime()
  const m = new Date(maIso + 'T00:00:00Z').getTime()
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return Math.round((h - m) / 86_400_000)
}

/** Összeg lelkész-barát formában (ro-RO ezres-tagolás, 2 tizedes). */
export function formatOsszeg(osszeg: number, penznem: string): string {
  const n = Number.isFinite(osszeg) ? osszeg : 0
  return `${n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${penznem}`
}
