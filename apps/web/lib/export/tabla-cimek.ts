/**
 * TÁBLA-CÍMEK — a nyers adatbázis-táblanevek KÖZÉRTHETŐ MAGYAR nevei.
 *
 * ⚠️ MIÉRT KÜLÖN, EGYETLEN FÁJLBAN.
 * Két felület használja ugyanezt a szótárat:
 *   · a teljes gyülekezeti adatexport (`gyulekezeti-export.ts`) — a csomag
 *     minden táblájához emberi címet ír;
 *   · a betekintés-kimutatás (`betekintes-naplo.ts`) — az audit-bejegyzés
 *     magyar mondatában ez a név szerepel („… a Személyek nyilvántartásban").
 * Ha mindkettő a SAJÁT másolatát tartaná, a két felület NÉMÁN széthúzna: az
 * exportban „Bevételi tételek", a naplóban még mindig „befizetes" állna. Ez a
 * projekt egyik ismert hibaosztálya, ezért a szótár EGY helyen él.
 *
 * ⚠️ IMPORT-MENTES. A `scripts/selftest-adatexport.mjs` önállóan betölti —
 * ide SOHA ne kerüljön projekt-import (`server-only`, Supabase kliens stb.),
 * mert azzal az önellenőrzés némán tesztelhetetlenné válna.
 */

/**
 * Ismert táblanevek → magyar cím. NEM teljes: a rendszernek 150+ táblája van,
 * itt csak azok szerepelnek, amelyek a gyülekezeti adatexportban vagy a
 * tevékenység-naplóban ténylegesen előfordulnak.
 */
export const TABLA_CIMEK: Record<string, string> = {
  szemely: 'Személyek',
  szemely_szemelyi_szam: 'Hivatalos személyi szám (CNP)',
  csalad: 'Családok (örökölt nyilvántartás)',
  gyerek: 'Gyermek-kapcsolatok (örökölt nyilvántartás)',
  haztartas: 'Háztartások',
  haztartas_tag: 'Háztartás-tagságok',
  szemely_kapcsolat: 'Személyek közötti kapcsolatok',
  keresztseg: 'Keresztelési anyakönyv',
  konfirmalas: 'Konfirmációi anyakönyv',
  hazassag: 'Házassági anyakönyv',
  temetes: 'Temetési anyakönyv',
  elkoltozott: 'Elköltözöttek',
  presbiter: 'Presbiterek',
  csoport: 'Gyülekezeti csoportok',
  befizetes: 'Bevételi tételek',
  kiadas: 'Kiadási tételek',
  bankszamlak: 'Bankszámlák',
  chitanta_tombok: 'Nyugtatömbök',
  jarulek_kedvezmeny: 'Járulék-kedvezmények',
  felmentes: 'Járulék-mentességek',
  leltar_tetelek: 'Leltári tételek',
  iktato: 'Iktatókönyv',
  iktato_sablonok: 'Irat-sablonok',
  gyulekezeti_programok: 'Gyülekezeti alkalmak és programok',
  munkanaplo: 'Munkanapló',
  presbiteri_jegyzokonyvek: 'Presbiteri jegyzőkönyvek',
  berleti_szerzodes: 'Bérleti szerződések',
  sirhelytemeto: 'Temetők',
  sirhely: 'Sírhelyek',
  bealitas: 'Gyülekezeti beállítások',
  // A tevékenység-naplóban előforduló, de nem exportált táblák:
  profiles: 'Felhasználói profilok',
  profile_roles: 'Szerepkörök',
  congregations: 'Gyülekezeti törzsadat',
}

/**
 * A tábla magyar címe. ISMERETLEN táblánál NEM talál ki nevet: a nyers
 * táblanevet adja vissza idézőjelek nélkül — így a kimutatás soha nem állít
 * olyat, amit nem tudunk.
 */
export function tablaCim(tabla: string | null | undefined): string {
  const kulcs = (tabla || '').trim()
  if (!kulcs) return 'ismeretlen nyilvántartás'
  return TABLA_CIMEK[kulcs] ?? kulcs
}
