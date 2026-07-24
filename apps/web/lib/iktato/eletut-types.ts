/**
 * Iktató F8b — háromnyelvű életút-/családi igazolás típusai (B1).
 *
 * Az életút-adatgyűjtő (app/(dashboard)/iktato/eletut-actions.ts) és a
 * kiállító-felület közös típusai. Külön fájlban, mert a `'use server'`
 * modul NEM exportálhat típust/konstanst (Next.js 16 runtime-szabály).
 *
 * A szerkezet a kutatási jelentést követi:
 * docs/project-tracking/KARTOTEKA-eletutigazolas-kutatas-2026-07-25.md
 * (CIEC-stílusú számozott mezők: A) személy · B) egyházi életút
 * anyakönyvi hivatkozással · C) család/gyermekek · D) elhalálozás + nyughely).
 */

/** A) A személy törzsadatai (szemely tábla). */
export interface EletutSzemely {
  /** Családnév + keresztnév. */
  teljesNev: string
  /** Születési (leánykori) családnév — szemely.szcs_nev; üresnél null. */
  szuletesiNev: string | null
  /** ISO dátum (YYYY-MM-DD) vagy null. */
  szuletesiDatum: string | null
  /** szemely.sz_helyid → adrlocality.name feloldva. */
  szuletesiHely: string | null
  apjaNeve: string | null
  /** Az anya neve (szemely.anyjaneve — a formulák szerint születési névvel). */
  anyjaNeve: string | null
  vallas: string | null
  /** szemely.meghalt VAGY létező temetési bejegyzés alapján. */
  elhunyt: boolean
}

/** B) Keresztelés (keresztseg tábla; dátum-fallback: konfirmalas.keresztelesideje). */
export interface EletutKereszteles {
  datum: string | null
  /** keresztseg.helyid → adrlocality.name feloldva. */
  hely: string | null
  /** keresztseg.lelkeszneve. */
  lelkesz: string | null
  /** Opcionális elem az igazoláson (kutatási jelentés: „Óvatosan"). */
  keresztszulok: string | null
  /** keresztseg.egyhazi_szam — anyakönyvi kötet/folyószám hivatkozás. */
  anyakonyviSzam: string | null
}

/** B) Konfirmáció (konfirmalas tábla). */
export interface EletutKonfirmacio {
  datum: string | null
  /** konfirmalas.egyhazi_szam. */
  anyakonyviSzam: string | null
}

/** B) Egy egyházi házasságkötés (hazassag tábla — mindkét oldali keresés). */
export interface EletutHazassag {
  datum: string | null
  /** A másik fél (hazassag.id_ferfi / id_no) neve a szemely-sorából. */
  hazastarsNev: string | null
  /** Opcionális elem az igazoláson (kutatási jelentés: „Óvatosan"). */
  tanuk: string | null
  /** hazassag.egyhazi_szam. */
  anyakonyviSzam: string | null
}

/** C) Egy gyermek a keresztelési adataival. */
export interface EletutGyermek {
  nev: string
  szuletesiDatum: string | null
  keresztelesDatum: string | null
  /** A gyermek keresztelésének anyakönyvi száma (keresztseg.egyhazi_szam). */
  anyakonyviSzam: string | null
}

/** D) Elhalálozás + temetés (temetes tábla). */
export interface EletutElhalalozas {
  /** temetes.hdatum. */
  halalDatum: string | null
  /** temetes.tdatum. */
  temetesDatum: string | null
  /** temetes.lelkeszneve — a szolgálatot végző lelkész. */
  lelkesz: string | null
  /** temetes.thelyid → adrlocality.name feloldva (a temetés helysége). */
  temetoHely: string | null
  /** temetes.egyhazi_szam. */
  anyakonyviSzam: string | null
}

/** Egy egyháztag teljes egyházi életútja az igazolás-kiállításhoz. */
export interface EletutAdat {
  szemely: EletutSzemely
  kereszteles: EletutKereszteles | null
  konfirmacio: EletutKonfirmacio | null
  /** Dátum szerint növekvő sorrendben — üres tömb, ha nincs egyházi házasság. */
  hazassagok: EletutHazassag[]
  /** Születési dátum szerint növekvő sorrendben — üres tömb, ha nincs gyermek. */
  gyermekek: EletutGyermek[]
  elhalalozas: EletutElhalalozas | null
  /**
   * Nyughely-szöveg: „{temető}, {parcella} parcella, {sor}. sor, {szám}. sírhely"
   * — a Sírhelyek modul láncából (sirhelyelhunyt → sirhely → sirhelytemeto)
   * feloldva, ha az elhunyt hozzá van rendelve egy sírhelyhez; egyébként null
   * (ilyenkor a kiállításkor kézzel adható meg — lásd EletutHiany).
   */
  sirhely: string | null
}

/**
 * Egy hiányzó, de az igazoláshoz kötelező adat — nyomtatható TODO-tétel
 * PONTOS útmutatóval, hogy a rendszerben hová kell bevezetni.
 */
export interface EletutHiany {
  /** Stabil gépi azonosító, pl. 'kereszteles.egyhazi_szam', 'hazassag.0.datum'. */
  mezoId: string
  /** Emberi címke, pl. 'Keresztelés anyakönyvi száma'. */
  cimke: string
  /** Pl. 'Anyakönyv → Kereszteltek fül → a személy sora → „Egyházi szám" mező'. */
  hovaVezesse: string
}

/** A kiállító-felület teljes adatcsomagja (B2 — előnézet + iktatás). */
export interface EletutIgazolasData {
  adat: EletutAdat
  hianyok: EletutHiany[]
  /** A kérelmező neve (cél-záradék: „…kérésére adtam ki"). */
  kerelmezo: string
  /** A kiállítás célja (cél-záradék: „…felhasználás céljából"). */
  cel: string
}
