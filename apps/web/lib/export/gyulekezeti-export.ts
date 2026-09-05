/**
 * TELJES GYÜLEKEZETI ADATEXPORT — a csomag ÖSSZEÁLLÍTÁSA (2026-08-23).
 *
 * MIÉRT VAN: az Adatvédelmi tájékoztató 9. szakasza és az ÁSZF 12. pontja
 * géppel olvasható adatkiadást ígér (adathordozhatóság + megszűnéskori
 * adatkiadás). Modul-szintű Excel-export eddig is volt, de „a gyülekezet
 * TELJES adata egy csomagban" nem — ez a fájl azt állítja elő.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MI VAN ITT ÉS MI NINCS
 * ════════════════════════════════════════════════════════════════════════════
 * ITT: TISZTA, mellékhatás nélküli függvények — a terv (mely táblák, milyen
 * úton), a HATÓKÖR-KAPU, a csomag összeállítása, a ZIP tartalma, a fájlnév.
 * NINCS itt: egyetlen adatbázis-hívás sem. A lekérdezés a szerver-akcióban
 * (`app/(dashboard)/profile/adatvedelem-actions.ts`) fut.
 *
 * ⚠️ IMPORT-MENTES (a `tabla-cimek.ts` kivételével, ami maga is import-mentes):
 * a `scripts/selftest-adatexport.mjs` önállóan betölti és végigméri. Ha ide
 * valaha `server-only` vagy Supabase-import kerülne, az önellenőrzés némán
 * kihagyhatóvá válna — a betöltés ezért SZÁNDÉKOSAN elbukik ilyenkor.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ A HATÓKÖR: FAIL-CLOSED, KIZÁRÓLAG A SAJÁT GYÜLEKEZET
 * ════════════════════════════════════════════════════════════════════════════
 * A projekt bizonyított hibaosztálya (2026-08-09, 3. kör): NULL skalár hatókör
 * + `if (id) filter` = NÉMA, TELJES adatszivárgás. Egy adatexportnál ez a
 * lehető legrosszabb kimenet: egyetlen kattintással töltené le valaki EGY MÁSIK
 * gyülekezet — vagy az egész ország — teljes anyakönyvét.
 *
 * Ezért a kapu (`exportHatokorEllenorzes`) NEM „ha van id, szűrj" alakú, hanem
 * ENGEDÉLYEZŐ: csak akkor ad `ok: true`-t, ha a hatókör BIZONYÍTOTTAN egyetlen
 * gyülekezet (`scope === 'congregation'`, `scopeCol === 'congregation_id'`, és
 * a `scopeId` valódi, nem üres). Minden más eset — feloldhatatlan hatókör,
 * megyei/kerületi munkatér, hiányzó azonosító — MAGYARÁZÓ ÜZENET, NULLA ADAT.
 */

import { tablaCim } from '@/lib/export/tabla-cimek'

// ─────────────────────────────────────────────────────────────────────────────
// 1) HATÓKÖR-KAPU
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A `getModuleScopeContext()` eredményének MINIMÁLIS, strukturális alakja.
 * Szándékosan nem importáljuk a `ModuleScopeContext` típust: ez a fájl
 * import-mentes marad, és a kapu így egy `{ error }`-t is megkap.
 */
export interface HatokorBemenet {
  scope?: string | null
  scopeCol?: string | null
  scopeId?: string | null
  scopeName?: string | null
  error?: string | null
}

export type ExportHatokor =
  | { ok: true; congregationId: string; congregationName: string | null }
  | { ok: false; uzenet: string }

/** A megtagadás magyar szövegei — a felület SZÓ SZERINT ezt mutatja. */
export const HATOKOR_UZENETEK = {
  nincsKontextus:
    'A hatókör nem oldható fel, ezért adatot nem adunk ki. Jelentkezz be újra, ' +
    'és ha a hiba megmarad, szólj a rendszergazdának.',
  nemGyulekezeti:
    'A teljes adatexport GYÜLEKEZETI munkatérben érhető el. Most egyházmegyei ' +
    'vagy egyházkerületi hatókörben dolgozol — válts vissza a gyülekezetedre ' +
    '(fejléc → munkatér-váltás), és próbáld újra.',
  nincsGyulekezet:
    'Nem található gyülekezet a fiókodhoz, ezért adatot nem adunk ki. ' +
    'Ha ez tévedés, a rendszergazda tudja hozzárendelni a gyülekezetet.',
} as const

/**
 * A hatókör-kapu. `ok: false` esetén a hívó KÖTELES megállni: TILOS szűretlen
 * (vagy „majd a lekérdezés úgyis szűr" alapon írt) lekérdezést futtatnia.
 */
export function exportHatokorEllenorzes(
  bemenet: HatokorBemenet | null | undefined,
): ExportHatokor {
  if (!bemenet) return { ok: false, uzenet: HATOKOR_UZENETEK.nincsKontextus }

  // A feloldó saját hibaüzenete elsőbbséget élvez — az mondja meg, MIÉRT.
  const hiba = (bemenet.error || '').trim()
  if (hiba) return { ok: false, uzenet: hiba }

  if (bemenet.scope !== 'congregation') {
    return { ok: false, uzenet: HATOKOR_UZENETEK.nemGyulekezeti }
  }
  // Öv és nadrágtartó: a scope-oszlopnak is a gyülekezetinek kell lennie.
  // Ha valaki egyszer átírja a feloldót, itt állunk meg, nem a lekérdezésnél.
  if (bemenet.scopeCol !== 'congregation_id') {
    return { ok: false, uzenet: HATOKOR_UZENETEK.nemGyulekezeti }
  }
  const id = (bemenet.scopeId || '').trim()
  if (!id) return { ok: false, uzenet: HATOKOR_UZENETEK.nincsGyulekezet }

  return { ok: true, congregationId: id, congregationName: bemenet.scopeName ?? null }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) AZ EXPORT TERVE — mely táblák, milyen úton
// ─────────────────────────────────────────────────────────────────────────────

export type SzarmaztatottKulcs = 'csalad' | 'gyerek' | 'sirhely'

/**
 * `kozvetlen`     — a táblán VAN `congregation_id` oszlop, arra szűrünk.
 * `szarmaztatott` — a táblán NINCS gyülekezet-oszlop, a szülőn keresztül
 *                   érhető el (a `kulcs` mondja meg, MELYIK bevett úton — a
 *                   szerver-akció exhaustive `switch`-e futtatja).
 *
 * ⚠️ MIÉRT NEVESÍTETT KULCS ÉS NEM SZABAD SZÖVEGŰ SZŰRŐ: a származtatott utak
 * kézzel írt szűrői pontosan az a hibaosztály, ami a mentés-besorolásnál
 * elsült (`t.source_congregation_id = $1` — ilyen oszlop nem is volt). Egy
 * nevesített kulcsot a fordító és az önellenőrzés is számon tud kérni.
 */
export type ExportForras =
  | { mod: 'kozvetlen' }
  | { mod: 'szarmaztatott'; kulcs: SzarmaztatottKulcs }

export interface ExportTervElem {
  tabla: string
  cim: string
  forras: ExportForras
  /** Rövid magyar magyarázat a csomag olvasójának. */
  leiras: string
}

const kozvetlen = (tabla: string, leiras: string): ExportTervElem => ({
  tabla,
  cim: tablaCim(tabla),
  forras: { mod: 'kozvetlen' },
  leiras,
})

/**
 * A CSOMAG TARTALMA — SORRENDBEN. A szülő MINDIG a gyereke előtt áll, hogy a
 * csomag olvasható legyen, és hogy a származtatott lekérdezésnek legyen mire
 * támaszkodnia.
 *
 * ⚠️ AMI NINCS BENNE, AZT KI IS MONDJUK (lásd `CSOMAG_TAJEKOZTATO`): a
 * feltöltött FÁJLOK (dokumentumtár, csatolmányok, címerek) tartalma nem része
 * a csomagnak — azok a tárolóban élnek.
 */
export const EXPORT_TERV: ExportTervElem[] = [
  kozvetlen('szemely', 'A gyülekezet nyilvántartott személyei minden rögzített adatukkal.'),
  // 2026-09-05: a hivatalos személyi szám (CNP) külön táblában él. AZ EXPORT
  // ALLOWLIST — ami nincs itt, az némán kimaradna a „teljes" csomagból, pedig
  // az érintettnek joga van hozzá. Fail-safe irány: inkább BENNE legyen.
  kozvetlen('szemely_szemelyi_szam', 'A hivatalos állami személyi szám (CNP), ha rögzítve van.'),
  kozvetlen('haztartas', 'Háztartások (a személyek lakóközösségei).'),
  kozvetlen('haztartas_tag', 'Ki melyik háztartáshoz tartozik, mettől meddig.'),
  kozvetlen('szemely_kapcsolat', 'Rokoni és házastársi kapcsolatok személyek között.'),
  {
    tabla: 'csalad',
    cim: tablaCim('csalad'),
    forras: { mod: 'szarmaztatott', kulcs: 'csalad' },
    leiras:
      'Az örökölt (régi) családszerkezet. Nincs saját gyülekezet-oszlopa, ' +
      'a gyülekezet személyein keresztül gyűjtjük össze.',
  },
  {
    tabla: 'gyerek',
    cim: tablaCim('gyerek'),
    forras: { mod: 'szarmaztatott', kulcs: 'gyerek' },
    leiras: 'Az örökölt családszerkezet gyermek-kapcsolatai.',
  },
  kozvetlen('keresztseg', 'Keresztelési anyakönyvi bejegyzések.'),
  kozvetlen('konfirmalas', 'Konfirmációi anyakönyvi bejegyzések.'),
  kozvetlen('hazassag', 'Házassági anyakönyvi bejegyzések.'),
  kozvetlen('temetes', 'Temetési anyakönyvi bejegyzések.'),
  kozvetlen('elkoltozott', 'Elköltözött személyek nyilvántartása.'),
  kozvetlen('presbiter', 'A presbitérium tagjai.'),
  kozvetlen('csoport', 'Gyülekezeti csoportok (ifjúság, kórus stb.).'),
  kozvetlen('befizetes', 'Minden bevételi tétel (járulék, adomány, perselypénz stb.).'),
  kozvetlen('kiadas', 'Minden kiadási tétel.'),
  kozvetlen('bankszamlak', 'A gyülekezet bankszámlái.'),
  kozvetlen('chitanta_tombok', 'Nyugtatömbök és sorszám-tartományaik.'),
  kozvetlen('jarulek_kedvezmeny', 'Járulék-kedvezmények.'),
  kozvetlen('felmentes', 'Járulék-mentességek.'),
  kozvetlen('leltar_tetelek', 'A gyülekezet leltári tételei.'),
  kozvetlen('iktato', 'Az iktatókönyv bejegyzései.'),
  kozvetlen('iktato_sablonok', 'A gyülekezet saját irat-sablonjai.'),
  kozvetlen('gyulekezeti_programok', 'Alkalmak, programok, események.'),
  kozvetlen('munkanaplo', 'A lelkipásztori munkanapló bejegyzései.'),
  kozvetlen('presbiteri_jegyzokonyvek', 'Presbiteri jegyzőkönyvek.'),
  kozvetlen('berleti_szerzodes', 'Bérleti szerződések.'),
  kozvetlen('sirhelytemeto', 'A gyülekezethez tartozó temetők.'),
  {
    tabla: 'sirhely',
    cim: tablaCim('sirhely'),
    forras: { mod: 'szarmaztatott', kulcs: 'sirhely' },
    leiras: 'Sírhelyek. A gyülekezet temetőin keresztül gyűjtjük össze.',
  },
  kozvetlen('bealitas', 'A gyülekezet beállításai (hivatalos név, cím, járulék-szabályok).'),
]

/**
 * ALLOWLIST. A szerver-akció a KLIENSTŐL kapja a tábla nevét — ez a függvény a
 * kapu: ami nincs a tervben, azt SOHA nem kérdezzük le.
 */
export function tervElem(tabla: string | null | undefined): ExportTervElem | null {
  const kulcs = (tabla || '').trim()
  if (!kulcs) return null
  return EXPORT_TERV.find((e) => e.tabla === kulcs) ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) A CSOMAG ÖSSZEÁLLÍTÁSA
// ─────────────────────────────────────────────────────────────────────────────

export type ExportTablaAllapot = 'ok' | 'hianyzik' | 'nincs_jog' | 'hiba'

export interface ExportTablaEredmeny {
  tabla: string
  cim?: string | null
  allapot: ExportTablaAllapot
  sorok?: Record<string, unknown>[] | null
  uzenet?: string | null
  /** `true`, ha a sor-plafon miatt nem minden sor került bele. */
  csonkolt?: boolean
}

export interface ExportCsomagBemenet {
  gyulekezetId?: string | null
  gyulekezetNev?: string | null
  keszitetteNev?: string | null
  keszitetteEmail?: string | null
  /** ISO időbélyeg. Hiányában a hívás pillanata. */
  keszult?: string | null
  eredmenyek?: ExportTablaEredmeny[] | null
}

export interface ExportCsomagTabla {
  cim: string
  leiras: string
  allapot: ExportTablaAllapot
  uzenet: string | null
  csonkolt: boolean
  sorokSzama: number
  sorok: Record<string, unknown>[]
}

export interface GyulekezetiExportCsomag {
  formatum: 'kartoteka-gyulekezeti-adatexport'
  verzio: 1
  keszult: string
  gyulekezet: { id: string; nev: string | null }
  keszitette: { nev: string | null; email: string | null }
  osszegzes: {
    tablakSzama: number
    sorokSzama: number
    teljes: boolean
    hianyzoTablak: string[]
    hibasTablak: string[]
    csonkoltTablak: string[]
  }
  tablak: Record<string, ExportCsomagTabla>
  tajekoztato: string[]
}

/**
 * A csomag mellé írt, EMBERNEK szóló magyarázat. Nem díszítés: ez mondja ki,
 * mi NINCS benne — hogy senki ne higgye teljesnek, ami nem az.
 */
export const CSOMAG_TAJEKOZTATO: string[] = [
  'Ez a fájl a gyülekezet adatainak géppel olvasható (JSON) másolata, az Adatvédelmi tájékoztató 9. szakasza és az ÁSZF 12. pontja szerint.',
  'A „tablak" alatt minden nyilvántartás a saját neve alatt szerepel; a „sorok" a nyers adatbázis-sorok, oszlopnevekkel együtt.',
  'A csomag CSAK a saját gyülekezet adatait tartalmazza — más gyülekezet adata soha nem kerül bele.',
  'NINCS benne: a feltöltött fájlok tartalma (dokumentumtár, iktatói csatolmányok, képek) — azok külön, a saját felületükről tölthetők le.',
  'NINCS benne: más felhasználók fiókadatai és jelszavai, valamint a rendszer közös (országos) törzsadata.',
  'Ha egy nyilvántartás állapota „hianyzik", az azt jelenti, hogy az a modul ebben a rendszerben még nincs bekapcsolva — nem azt, hogy adat veszett el.',
  'A csomag SZEMÉLYES ADATOKAT tartalmaz. Titkosított meghajtón tárold, és csak annak add tovább, akinek jogszabály szerint joga van hozzá.',
  'A letöltést a rendszer naplózza (ki, mikor, hány sor) — a bejegyzés a fenti betekintés-kimutatásban is megjelenik.',
]

const uresOsszegzes = (): GyulekezetiExportCsomag['osszegzes'] => ({
  tablakSzama: 0,
  sorokSzama: 0,
  teljes: true,
  hianyzoTablak: [],
  hibasTablak: [],
  csonkoltTablak: [],
})

/**
 * A csomag összeállítása. TISZTA: ugyanarra a bemenetre mindig ugyanaz a
 * kimenet, és ÜRES bemenetre is ÉRVÉNYES csomagot ad — nem dob.
 */
export function csomagotOsszeallit(
  bemenet: ExportCsomagBemenet | null | undefined,
): GyulekezetiExportCsomag {
  const b = bemenet ?? {}
  const eredmenyek = Array.isArray(b.eredmenyek) ? b.eredmenyek : []

  const tablak: Record<string, ExportCsomagTabla> = {}
  const osszegzes = uresOsszegzes()

  for (const e of eredmenyek) {
    if (!e || typeof e.tabla !== 'string' || !e.tabla.trim()) continue
    const terv = tervElem(e.tabla)
    const sorok = Array.isArray(e.sorok) ? e.sorok : []
    const allapot: ExportTablaAllapot = e.allapot ?? 'hiba'

    tablak[e.tabla] = {
      cim: e.cim || terv?.cim || tablaCim(e.tabla),
      leiras: terv?.leiras ?? '',
      allapot,
      uzenet: e.uzenet ?? null,
      csonkolt: e.csonkolt === true,
      sorokSzama: sorok.length,
      sorok,
    }

    osszegzes.tablakSzama += 1
    osszegzes.sorokSzama += sorok.length
    if (allapot === 'hianyzik') osszegzes.hianyzoTablak.push(e.tabla)
    if (allapot === 'hiba' || allapot === 'nincs_jog') osszegzes.hibasTablak.push(e.tabla)
    if (e.csonkolt === true) osszegzes.csonkoltTablak.push(e.tabla)
  }

  // „Teljes" = nem bukott el és nem csonkult egyetlen nyilvántartás sem. A
  // hiányzó (még be nem kapcsolt) modul NEM rontja el a teljességet — az nem
  // adatvesztés, hanem nem létező funkció.
  osszegzes.teljes = osszegzes.hibasTablak.length === 0 && osszegzes.csonkoltTablak.length === 0

  return {
    formatum: 'kartoteka-gyulekezeti-adatexport',
    verzio: 1,
    keszult: (b.keszult || '').trim() || new Date().toISOString(),
    gyulekezet: { id: (b.gyulekezetId || '').trim(), nev: b.gyulekezetNev ?? null },
    keszitette: { nev: b.keszitetteNev ?? null, email: b.keszitetteEmail ?? null },
    osszegzes,
    tablak,
    tajekoztato: [...CSOMAG_TAJEKOZTATO],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) FÁJLNÉV ÉS ZIP-TARTALOM (szintén tiszta — a kliens csak lemezre írja)
// ─────────────────────────────────────────────────────────────────────────────

/** Ékezet- és szóköz-mentes, fájlnévbe biztonságosan írható alak. */
export function szlug(szoveg: string | null | undefined): string {
  const nyers = (szoveg || '').trim()
  if (!nyers) return 'gyulekezet'
  // NFD-re bontjuk (az „ő" → „o" + ékezet), majd MINDEN nem-ASCII karaktert
  // eldobunk — így a mellékjelek eltűnnek, az alapbetű megmarad. Szándékosan
  // nem írunk ide nyers kombináló karaktereket: azok a forrásban láthatatlanok,
  // és egy szerkesztő némán normalizálhatná őket.
  const ekezetTelen = nyers.normalize('NFD').replace(/[^\p{ASCII}]/gu, '').toLowerCase()
  const tiszta = ekezetTelen.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return tiszta || 'gyulekezet'
}

export function exportFajlNev(
  csomag: GyulekezetiExportCsomag,
  kiterjesztes: 'json' | 'zip',
): string {
  const nap = (csomag.keszult || '').slice(0, 10) || 'ismeretlen-datum'
  return `kartoteka-adatexport-${szlug(csomag.gyulekezet.nev)}-${nap}.${kiterjesztes}`
}

export interface ZipBejegyzes {
  nev: string
  tartalom: string
}

/**
 * A ZIP tartalma: egy emberi olvasnivaló, a teljes csomag, és táblánként egy
 * külön JSON — hogy a nagy csomag darabonként is feldolgozható legyen.
 */
export function zipTartalom(csomag: GyulekezetiExportCsomag): ZipBejegyzes[] {
  const bejegyzesek: ZipBejegyzes[] = []

  const fejlec = [
    'KARTOTÉKA — TELJES GYÜLEKEZETI ADATEXPORT',
    '==========================================',
    '',
    `Gyülekezet: ${csomag.gyulekezet.nev || '(nincs név)'}`,
    `Készült: ${csomag.keszult}`,
    `Készítette: ${csomag.keszitette.nev || '(ismeretlen)'}${
      csomag.keszitette.email ? ` <${csomag.keszitette.email}>` : ''
    }`,
    `Nyilvántartások: ${csomag.osszegzes.tablakSzama} · Sorok összesen: ${csomag.osszegzes.sorokSzama}`,
    '',
    ...csomag.tajekoztato.map((s) => `- ${s}`),
    '',
    'FÁJLOK:',
    '- csomag.json — a teljes csomag egyetlen fájlban',
    '- tablak/<nev>.json — nyilvántartásonként külön',
    '',
  ].join('\r\n')
  bejegyzesek.push({ nev: 'olvassel.txt', tartalom: fejlec })

  bejegyzesek.push({ nev: 'csomag.json', tartalom: JSON.stringify(csomag, null, 2) })

  for (const [tabla, adat] of Object.entries(csomag.tablak)) {
    bejegyzesek.push({
      nev: `tablak/${tabla}.json`,
      tartalom: JSON.stringify(
        {
          tabla,
          cim: adat.cim,
          leiras: adat.leiras,
          allapot: adat.allapot,
          uzenet: adat.uzenet,
          csonkolt: adat.csonkolt,
          sorokSzama: adat.sorokSzama,
          sorok: adat.sorok,
        },
        null,
        2,
      ),
    })
  }

  return bejegyzesek
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) DARABOLÁS ÉS LAPOZÁS — a 414-es URL-korlát és az 1000 soros plafon ellen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Az azonosító-listás (`.in(...)`) szűrő az URL-be kerül. ~100 azonosító fölött
 * a proxy 414-gyel eldobja a kérést — és a hívó ilyenkor NEM nulla sort kap,
 * hanem HIBÁT. Ezért minden azonosító-alapú lekérdezést 80-asával darabolunk.
 * (Ez a projekt egyik dokumentált hibaosztálya.)
 */
export const IN_DARAB_MERET = 80

export function darabol<T>(
  tomb: readonly T[] | null | undefined,
  meret: number = IN_DARAB_MERET,
): T[][] {
  const forras = Array.isArray(tomb) ? tomb : []
  const n = Number.isFinite(meret) && meret > 0 ? Math.floor(meret) : IN_DARAB_MERET
  const ki: T[][] = []
  for (let i = 0; i < forras.length; i += n) ki.push(forras.slice(i, i + n))
  return ki
}

/** A PostgREST egy kérésben legfeljebb 1000 sort ad — ennyivel lapozunk. */
export const LAP_MERET = 1000
/** Táblánkénti felső korlát, hogy egy nagy gyülekezet se fagyassza le a böngészőt. */
export const TABLA_SOR_PLAFON = 20000
