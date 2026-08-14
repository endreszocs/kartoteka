// 2026-07-16 (F5/J2): Éves hivatalos lelkészi jelentés — KÖZÖS ADAT-KONTRAKTUS.
//
// Ez a fájl a jelentés-modul minden rétegének (aggregátor-akciók, szerkesztő-UI,
// nyomtatás/PDF, beküldés) közös nyelve:
//  - JELENTES_MEZOK: a teljes I–X. fejezet mező-katalógusa, fejezet-sorrendben.
//    Minden mezőnek STABIL azonosítója van (pl. 'I.2a') — ezek a kulcsok
//    szerepelnek a lelkeszi_jelentes tábla kezi_adatok / felulirasok jsonb
//    mezőiben és a véglegesítéskori snapshotban is, ezért NEM átnevezhetők.
//  - auto: true = az app ÉLŐ adatból számolja (anyakönyv, munkanapló, pénzügy);
//    a felhasználó felülírhatja (felulirasok). auto: false = kézi mező (kezi).
//  - Prioritás olvasáskor: felulirasok > auto > kezi (mezoErtek).
//
// A 'use server' szabály miatt (Next.js 16: 'use server' fájl CSAK async
// function-t exportálhat) a típusok/konstansok ITT élnek, az akciók a
// app/(dashboard)/munkanaplo/lelkeszi-jelentes-actions.ts-ben.

export type JelentesFejezet = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII' | 'IX' | 'X'

export interface JelentesMezo {
  /** Stabil mező-azonosító, pl. 'I.1', 'II.3a' — jsonb-kulcs, NEM átnevezhető. */
  id: string
  fejezet: JelentesFejezet
  label: string
  tipus: 'szam' | 'szoveg' | 'hosszu_szoveg'
  /** true = élő adatból számolt (felülírható), false = kézi mező. */
  auto: boolean
  /** pl. 'fő', 'RON', '%', 'alkalom' */
  egyseg?: string
}

export const FEJEZET_CIMEK: Record<JelentesFejezet, string> = {
  I: 'Lélekszám',
  II: 'Istentisztelet',
  III: 'Gyülekezetgondozás',
  IV: 'Belmisszió',
  V: 'Vallásoktatás',
  VI: 'Szeretetszolgálat',
  VII: 'Anyagi helyzet',
  VIII: 'Ingatlanok',
  IX: 'Események',
  X: 'Missziói terv',
}

/**
 * A hivatalos éves lelkészi jelentés teljes mező-katalógusa (minta-PDF +
 * tervdoc A.2 szerkezete szerint). Az auto-mezők számítási forrása a
 * lelkeszi-jelentes-actions.ts aggregátorában van dokumentálva.
 */
export const JELENTES_MEZOK: JelentesMezo[] = [
  // ── I. Lélekszám ──────────────────────────────────────────────────────────
  // I.1: az ELŐZŐ évi véglegesített lelkészi jelentés dec. 31-i lélekszámából
  // (ha van ilyen sor) — különben null, és kézzel felülírandó.
  { id: 'I.1', fejezet: 'I', label: 'Lélekszám az előző év december 31-én', tipus: 'szam', auto: true, egyseg: 'fő' },
  // keresztseg tábla + szemely.ferfi bontás
  { id: 'I.2a', fejezet: 'I', label: 'Keresztelt — férfi', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'I.2b', fejezet: 'I', label: 'Keresztelt — nő', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'I.2c', fejezet: 'I', label: 'Keresztelt — együtt', tipus: 'szam', auto: true, egyseg: 'fő' },
  // temetes tábla (tdatum) + szemely.ferfi bontás
  { id: 'I.3a', fejezet: 'I', label: 'Temetett — férfi', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'I.3b', fejezet: 'I', label: 'Temetett — nő', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'I.3c', fejezet: 'I', label: 'Temetett — együtt', tipus: 'szam', auto: true, egyseg: 'fő' },
  // Betért/kitért/költözött: az adatmodellből évre bontva NEM levezethető
  // (a member_status csak a JELENLEGI állapotot tárolja, nem évhez kötött
  // eseményt) → kézi mezők.
  { id: 'I.4a', fejezet: 'I', label: 'Betért — férfi', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.4b', fejezet: 'I', label: 'Betért — nő', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.4c', fejezet: 'I', label: 'Betért — együtt', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.5a', fejezet: 'I', label: 'Kitért — férfi', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.5b', fejezet: 'I', label: 'Kitért — nő', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.5c', fejezet: 'I', label: 'Kitért — együtt', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.6a', fejezet: 'I', label: 'Beköltözött — férfi', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.6b', fejezet: 'I', label: 'Beköltözött — nő', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.6c', fejezet: 'I', label: 'Beköltözött — együtt', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.7a', fejezet: 'I', label: 'Kiköltözött — férfi', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.7b', fejezet: 'I', label: 'Kiköltözött — nő', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.7c', fejezet: 'I', label: 'Kiköltözött — együtt', tipus: 'szam', auto: false, egyseg: 'fő' },
  // Számolt egyenlegek (negatív = apadás)
  { id: 'I.8', fejezet: 'I', label: 'Természetes szaporulat / apadás (keresztelt − temetett)', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'I.9', fejezet: 'I', label: 'Általános szaporulat / apadás (keresztelt + betért + beköltözött − temetett − kitért − kiköltözött)', tipus: 'szam', auto: true, egyseg: 'fő' },
  // szemely tábla (isvisible, élő, nem kizárt member_status)
  { id: 'I.10', fejezet: 'I', label: 'Lélekszám december 31-én', tipus: 'szam', auto: true, egyseg: 'fő' },
  // 2026-07-17 (PR-2 F1.7): auto — a perzisztált voter_eligible flagből számol
  // (a lelkész felülírhatja, mint minden auto-mezőt).
  { id: 'I.11', fejezet: 'I', label: 'Választói névjegyzékben szereplők', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'I.12', fejezet: 'I', label: 'Családok — egyező vallású', tipus: 'szam', auto: false, egyseg: 'család' },
  { id: 'I.13', fejezet: 'I', label: 'Családok — vegyes vallású', tipus: 'szam', auto: false, egyseg: 'család' },
  { id: 'I.14', fejezet: 'I', label: 'Özvegyek', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.15', fejezet: 'I', label: 'Egyedülállók', tipus: 'szam', auto: false, egyseg: 'fő' },
  // hazassag tábla (datum, vegyes)
  { id: 'I.16', fejezet: 'I', label: 'Házassági eskü (esketések száma)', tipus: 'szam', auto: true, egyseg: 'pár' },
  { id: 'I.17', fejezet: 'I', label: 'Ebből vegyes házasság', tipus: 'szam', auto: true, egyseg: 'pár' },
  { id: 'I.18', fejezet: 'I', label: 'Nemzetiségünkhöz tartozók lélekszáma', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.19', fejezet: 'I', label: 'Külföldön élők', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.20', fejezet: 'I', label: 'Öt éve vagy régebben egyházfenntartói járulékot nem fizetők', tipus: 'szam', auto: false, egyseg: 'fő' },
  // A minta-PDF I. fejezetének a katalógusból eddig hiányzó tételei (15., 19.,
  // 20. tétel) — kézi mezők, append-only pótlás (2026-07-17).
  { id: 'I.21', fejezet: 'I', label: 'Az egyházfenntartás személyenkénti éves meghatározott összege', tipus: 'szam', auto: false, egyseg: 'RON' },
  { id: 'I.22', fejezet: 'I', label: 'Más településen élő egyháztagok száma', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'I.23', fejezet: 'I', label: 'Más gyülekezetben is tagságot vállaló egyháztagok száma', tipus: 'szam', auto: false, egyseg: 'fő' },

  // ── II. Istentisztelet ───────────────────────────────────────────────────
  // Forrás: munkanapló évi sorai, típus→oszlop besorolás a hivatalos
  // nyomtatott munkanapló szabálya szerint (classifyForOfficialJournal).
  // Átlagjelenlét: a jelenlétet TÉNYLEGESEN rögzítő alkalmak átlaga (1 tizedes);
  // % = átlagjelenlét a dec. 31-i lélekszám százalékában.
  { id: 'II.1a', fejezet: 'II', label: 'Közönséges vasárnap délelőtti istentisztelet — alkalmak', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'II.1b', fejezet: 'II', label: 'Vasárnap délelőtt — átlagjelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.1c', fejezet: 'II', label: 'Vasárnap délelőtt — jelenlét a lélekszám %-ában', tipus: 'szam', auto: true, egyseg: '%' },
  { id: 'II.2a', fejezet: 'II', label: 'Közönséges vasárnap délutáni istentisztelet — alkalmak', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'II.2b', fejezet: 'II', label: 'Vasárnap délután — átlagjelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.2c', fejezet: 'II', label: 'Vasárnap délután — jelenlét a lélekszám %-ában', tipus: 'szam', auto: true, egyseg: '%' },
  { id: 'II.3a', fejezet: 'II', label: 'Ünnepnapi istentisztelet — alkalmak', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'II.3b', fejezet: 'II', label: 'Ünnepnapi — átlagjelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.3c', fejezet: 'II', label: 'Ünnepnapi — jelenlét a lélekszám %-ában', tipus: 'szam', auto: true, egyseg: '%' },
  { id: 'II.4a', fejezet: 'II', label: 'Sátoros ünnepi istentisztelet — alkalmak', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'II.4b', fejezet: 'II', label: 'Sátoros ünnepi — átlagjelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.4c', fejezet: 'II', label: 'Sátoros ünnepi — jelenlét a lélekszám %-ában', tipus: 'szam', auto: true, egyseg: '%' },
  // Sátoros ünnepek naponkénti bontása — az adott napi ÖSSZES jelenlét
  // (az ünnepnap neve a getUnnepInfo ünnep-katalógusából).
  { id: 'II.5a', fejezet: 'II', label: 'Karácsony I. napja — jelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.5b', fejezet: 'II', label: 'Karácsony II. napja — jelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.5c', fejezet: 'II', label: 'Húsvét I. napja — jelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.5d', fejezet: 'II', label: 'Húsvét II. napja — jelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.5e', fejezet: 'II', label: 'Pünkösd I. napja — jelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.5f', fejezet: 'II', label: 'Pünkösd II. napja — jelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  // Harmadnapi (III. napi) sátoros ünnepek — az ünnepnap a getUnnepInfo
  // katalógusában ('Karácsony/Húsvét/Pünkösd harmadnapja').
  { id: 'II.5g', fejezet: 'II', label: 'Karácsony III. napja — jelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.5h', fejezet: 'II', label: 'Húsvét III. napja — jelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.5i', fejezet: 'II', label: 'Pünkösd III. napja — jelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.6a', fejezet: 'II', label: 'Hétköznapi istentisztelet — alkalmak', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'II.6b', fejezet: 'II', label: 'Hétköznapi — átlagjelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.7a', fejezet: 'II', label: 'Bűnbánati istentisztelet — alkalmak', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'II.7b', fejezet: 'II', label: 'Bűnbánati — átlagjelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'II.8a', fejezet: 'II', label: 'Bibliaóra (felnőtt + ifjúsági) — alkalmak', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'II.8b', fejezet: 'II', label: 'Bibliaóra — átlagjelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  // 2026-08-14 (18. pont 3C — a spec II.1 f/g/h képletei): a II.9 a pontos
  // kazuália-készletre szűkült (keresztelők + esketések + felkészítők +
  // Virrasztó + temetések); a II.10/II.11 KÉZIBŐL AUTO lett — a hivatalos
  // űrlap [M]-et (munkanaplóból) kér. A címke frissülhet, az id SOHA.
  { id: 'II.9', fejezet: 'II', label: 'Kazuáliák és felkészítők — alkalmak', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'II.10', fejezet: 'II', label: 'Más alkalmak (ünnepély, szeretetvendégség, imahét, úrvacsora, egyéb)', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'II.11', fejezet: 'II', label: 'Digitális (online) alkalmak', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  // Úrvacsora: 'Úrvacsora' típusú alkalmak + minden sor, ahol úrvacsorázó-szám
  // van rögzítve (uv_templomban / uv_betegnel).
  { id: 'II.12', fejezet: 'II', label: 'Úrvacsoraosztások száma', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'II.13', fejezet: 'II', label: 'Átlag úrvacsorázó alkalmanként', tipus: 'szam', auto: true, egyseg: 'fő' },
  // Az úrvacsorázók nemenkénti bontását a munkanapló nem tárolja → kézi mezők.
  { id: 'II.13a', fejezet: 'II', label: 'Átlag úrvacsorázó — férfi', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'II.13b', fejezet: 'II', label: 'Átlag úrvacsorázó — nő', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'II.14', fejezet: 'II', label: 'Betegnél úrvacsorázók az évben összesen', tipus: 'szam', auto: true, egyseg: 'fő' },

  // ── III. Gyülekezetgondozás ──────────────────────────────────────────────
  { id: 'III.1', fejezet: 'III', label: 'Felnőtt bibliaórák száma', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'III.2', fejezet: 'III', label: 'Ifjúsági bibliaórák (IKE) száma', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  // 2026-08-14 (18. pont 3D — spec III.1: típusonkénti bontás): ÚJ,
  // append-only mezők a hivatalos taxonómia bibliaóra-típusaira.
  { id: 'III.2b', fejezet: 'III', label: 'Presbiteri bibliaórák száma', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'III.2c', fejezet: 'III', label: 'Nőszövetségi bibliaórák száma', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'III.2d', fejezet: 'III', label: 'Házasok bibliaórái — alkalmak', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'III.2e', fejezet: 'III', label: 'Más bibliaóra 1 — alkalmak (megnevezés a megjegyzésben)', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'III.2f', fejezet: 'III', label: 'Más bibliaóra 2 — alkalmak (megnevezés a megjegyzésben)', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'III.3', fejezet: 'III', label: 'Vallásos ünnepélyek száma', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'III.4', fejezet: 'III', label: 'Szeretetvendégségek száma', tipus: 'szam', auto: false, egyseg: 'alkalom' },
  { id: 'III.5', fejezet: 'III', label: 'Imaheti alkalmak száma', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'III.6', fejezet: 'III', label: 'Imahét — átlagjelenlét', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'III.7', fejezet: 'III', label: 'Családlátogatások száma', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'III.8', fejezet: 'III', label: 'Egyéb látogatások száma (beteg-, kórház-, börtönlátogatás stb.)', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'III.9', fejezet: 'III', label: 'Presbiterek száma', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'III.10', fejezet: 'III', label: 'Presbiteri gyűlések száma', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  { id: 'III.11', fejezet: 'III', label: 'Körzetek száma', tipus: 'szam', auto: false, egyseg: 'db' },
  { id: 'III.12', fejezet: 'III', label: 'Egyházközségi közgyűlések száma', tipus: 'szam', auto: false, egyseg: 'alkalom' },
  { id: 'III.13', fejezet: 'III', label: 'Vizitációk (esperesi / püspöki)', tipus: 'szoveg', auto: false },
  { id: 'III.14', fejezet: 'III', label: 'Testvérgyülekezeti kapcsolat', tipus: 'szoveg', auto: false },
  { id: 'III.15', fejezet: 'III', label: 'Fegyelmi ügyek', tipus: 'szoveg', auto: false },
  // Rétegalkalmak — a munkanapló-típusokból nem szétválogathatók → kézi mezők.
  { id: 'III.16', fejezet: 'III', label: 'Presbiteri bibliaóra alkalmai', tipus: 'szam', auto: false, egyseg: 'alkalom' },
  // 2026-08-11 (6. kör): a III.17 KÉZI MARAD, de már NEM néma — a munkanapló
  // „Nőszövetségi összejövetel" sorai JAVASLATKÉNT megjelennek mellette
  // (MUNKANAPLO_JAVASLAT_MEZOK + JelentesJavaslat). Az `auto: true`-ra váltás
  // TILOS, az okát lásd a MUNKANAPLO_JAVASLAT_MEZOK kommentjében.
  { id: 'III.17', fejezet: 'III', label: 'Nőszövetségi bibliaóra alkalmai', tipus: 'szam', auto: false, egyseg: 'alkalom' },
  { id: 'III.18', fejezet: 'III', label: 'Házaspári bibliaóra alkalmai', tipus: 'szam', auto: false, egyseg: 'alkalom' },

  // ── IV. Belmisszió (kézi fejezet) ────────────────────────────────────────
  { id: 'IV.1', fejezet: 'IV', label: 'Nőszövetség tevékenysége', tipus: 'hosszu_szoveg', auto: false },
  { id: 'IV.2', fejezet: 'IV', label: 'Ifjúsági munka (IKE)', tipus: 'hosszu_szoveg', auto: false },
  { id: 'IV.3', fejezet: 'IV', label: 'Énekkar / kórus', tipus: 'szoveg', auto: false },
  { id: 'IV.4', fejezet: 'IV', label: 'Egyéb belmissziói tevékenység', tipus: 'hosszu_szoveg', auto: false },

  // ── V. Vallásoktatás ─────────────────────────────────────────────────────
  { id: 'V.1', fejezet: 'V', label: 'Vallásórás gyermekek száma', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'V.2', fejezet: 'V', label: 'Vallásórás csoportok száma', tipus: 'szam', auto: false, egyseg: 'csoport' },
  // munkanapló: katekézis kategóriájú alkalmak
  { id: 'V.3', fejezet: 'V', label: 'Katekézis-alkalmak száma az évben', tipus: 'szam', auto: true, egyseg: 'alkalom' },
  // 2026-08-14 (18. pont, EREK-spec 3.1): ÚJ mező, append-only id — a
  // „vallásórára járt átlag" nevezője a Vallásóra 1. csoport alkalmainak
  // száma (= vallásórás hetek), NEM az összes vallásóra. Régi (csoport
  // nélküli) típusnevekkel rögzített évre nincs helyes nevező → null, kézi.
  { id: 'V.3b', fejezet: 'V', label: 'Vallásórára járt átlag egy alkalommal', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'V.4', fejezet: 'V', label: 'Kiskonfirmációra járók száma', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'V.5a', fejezet: 'V', label: 'Konfirmandusok I. év — fiú', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'V.5b', fejezet: 'V', label: 'Konfirmandusok I. év — lány', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'V.6a', fejezet: 'V', label: 'Konfirmandusok II. év — fiú', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'V.6b', fejezet: 'V', label: 'Konfirmandusok II. év — lány', tipus: 'szam', auto: false, egyseg: 'fő' },
  // konfirmalas tábla + szemely.ferfi bontás
  { id: 'V.7a', fejezet: 'V', label: 'Konfirmált — fiú', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'V.7b', fejezet: 'V', label: 'Konfirmált — lány', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'V.7c', fejezet: 'V', label: 'Konfirmált — együtt', tipus: 'szam', auto: true, egyseg: 'fő' },
  { id: 'V.8', fejezet: 'V', label: 'Áttért / felnőtt konfirmált', tipus: 'szam', auto: false, egyseg: 'fő' },
  { id: 'V.9', fejezet: 'V', label: 'Gyermekistentisztelet alkalmai', tipus: 'szam', auto: false, egyseg: 'alkalom' },
  { id: 'V.10', fejezet: 'V', label: 'Vasárnapi iskola alkalmai', tipus: 'szam', auto: false, egyseg: 'alkalom' },

  // ── VI. Szeretetszolgálat (kézi fejezet) ─────────────────────────────────
  { id: 'VI.1', fejezet: 'VI', label: 'Szeretetszolgálati (diakóniai) tevékenység', tipus: 'hosszu_szoveg', auto: false },
  { id: 'VI.2', fejezet: 'VI', label: 'Támogatottak száma', tipus: 'szam', auto: false, egyseg: 'fő' },

  // ── VII. Anyagi helyzet ──────────────────────────────────────────────────
  // Járulék/persely: befizetes tábla, számadási cél kód szerint
  // (101.01 = egyházfenntartói járulék, 101.03 = perselypénz), az évben
  // ténylegesen beérkezett (nem törölt, nem stornózott, nem belső mozgás).
  { id: 'VII.1', fejezet: 'VII', label: 'Egyházfenntartói járulék évi összege', tipus: 'szam', auto: true, egyseg: 'RON' },
  { id: 'VII.2', fejezet: 'VII', label: 'Egyházfenntartói járulék egy lélekre', tipus: 'szam', auto: true, egyseg: 'RON' },
  { id: 'VII.3', fejezet: 'VII', label: 'Perselypénz évi összege', tipus: 'szam', auto: true, egyseg: 'RON' },
  { id: 'VII.4', fejezet: 'VII', label: 'Perselypénz egy lélekre', tipus: 'szam', auto: true, egyseg: 'RON' },
  // Zárszámadás: a VÉGLEGESÍTETT számadás kanonikus snapshotjából
  // (bealitas.szamadas_zaro_adatok). Amíg nincs véglegesített számadás,
  // a b/c mezők null-ok — a UI ezt jelzi.
  // 2026-08-14 (18. pont 3D): AUTO — az előző évi VÉGLEGESÍTETT jelentés
  // egyenlege (VII.8); anélkül null marad, kézzel tölthető.
  { id: 'VII.5', fejezet: 'VII', label: 'Zárszámadás — előző évi maradvány (a)', tipus: 'szam', auto: true, egyseg: 'RON' },
  { id: 'VII.6', fejezet: 'VII', label: 'Zárszámadás — évi bevétel (b)', tipus: 'szam', auto: true, egyseg: 'RON' },
  { id: 'VII.7', fejezet: 'VII', label: 'Zárszámadás — évi kiadás (c)', tipus: 'szam', auto: true, egyseg: 'RON' },
  { id: 'VII.8', fejezet: 'VII', label: 'Zárszámadás — egyenleg (a + b − c)', tipus: 'szam', auto: true, egyseg: 'RON' },
  // 2026-08-14 (K2): a korábbi „(járulék-hátralék)" toldalék PONT azt kérte,
  // amit az EREK Útmutató kifejezetten KIZÁR: „Nem számítható be kinnlevőségnek
  // a kintlevő egyházfenntartói járulék, mivel nem tervezhető és nem behajtható.
  // … Nem számíthatnak kinnlevőségnek a csak megígért adományok, perselypénz stb."
  // Az id NEM változhat (jsonb-kulcs) — csak a felirat mond mást.
  // 2026-08-14 (18. pont 3D): AUTO — a Számadás hivatalos 129–133. ill.
  // 117–127. sorainak összege (a Tartozások-rögzítőből, bealitas.
  // szamadas_tartozasok) — a jelentés így KÖTELEZŐEN egyezik a számadással.
  { id: 'VII.9', fejezet: 'VII', label: 'Kintlévőség (bérleti díj, kiadott hitel stb. — az egyházfenntartói járulék-hátralék NEM számít bele)', tipus: 'szam', auto: true, egyseg: 'RON' },
  { id: 'VII.10', fejezet: 'VII', label: 'Kifizetési kötelezettségek', tipus: 'szam', auto: true, egyseg: 'RON' },

  // ── VIII. Ingatlanok (kézi fejezet) ──────────────────────────────────────
  { id: 'VIII.1', fejezet: 'VIII', label: 'Ingatlanok állapota, változások', tipus: 'hosszu_szoveg', auto: false },
  { id: 'VIII.2', fejezet: 'VIII', label: 'Építkezés, felújítás az évben', tipus: 'hosszu_szoveg', auto: false },

  // ── IX. Események ────────────────────────────────────────────────────────
  { id: 'IX.1', fejezet: 'IX', label: 'A gyülekezet életének fontosabb eseményei', tipus: 'hosszu_szoveg', auto: false },

  // ── X. Missziói terv ─────────────────────────────────────────────────────
  { id: 'X.1', fejezet: 'X', label: 'Missziói terv a következő évre', tipus: 'hosszu_szoveg', auto: false },
]

// ─────────────────────────────────────────────────────────────────────────
// MUNKANAPLÓ-ALAPÚ JAVASLAT egy KÉZI rubrikához (2026-08-11, 6. kör)
// ─────────────────────────────────────────────────────────────────────────
//
// MI A BAJ, AMIT MEGOLD
//   A lelkész rendesen rögzíti a „Nőszövetségi összejövetel" alkalmat a
//   munkanaplóba; a hivatalos nyomtatott napló 15. oszlopába be is kerül
//   (print-columns.ts, `noszovetsegi` oszlop). A lelkészi jelentés III.17
//   rubrikája („Nőszövetségi bibliaóra alkalmai") viszont sehol nem látta —
//   a jelentés-aggregátor `case 'noszovetsegi'` ága ÜRES volt. A lelkész
//   ugyanazt az adatot évente kétszer vitte fel, vagy egyszer sem.
//
// MIÉRT JAVASLAT ÉS NEM AUTO — HÁROM OK, mindhárom aláírt papíron üt vissza
//   1) RÉSZLEGES ELSŐ ÉV. Aki a naplózást év közben kezdi, annak a munkanapló
//      az év töredékét ismeri. Auto-mezőnél a rendszer LEFELÉ hamisítana egy
//      aláírt, az egyházmegyének beküldött nyomtatványon.
//   2) A KÉZI ÉRTÉK NÉMA ELVESZTÉSE. A `mezoErtek` prioritása
//      `felulirasok > auto > kezi`: ha a III.17 auto lenne, a lelkész korábbi,
//      KÉZZEL beírt száma azonnal láthatatlanná válna — ráadásul a
//      `saveLelkesziJelentes` `keziMezok` szűrője a következő mentéskor
//      KI IS DOBNÁ a `kezi_adatok`-ból (a szűrő az `auto: false` mezőkre jár).
//      A véglegesítés pedig az így kapott számot FAGYASZTJA BE a snapshotba.
//   3) NEM UGYANAZ A FOGALOM. A napló típusa „Nőszövetségi ÖSSZEJÖVETEL",
//      a rubrika „Nőszövetségi BIBLIAÓRA alkalmai". Az egyenlőségjelet a
//      lelkész teszi ki, nem a program.
//
// A megoldás ezért ugyanaz, mint a különleges alkalmaknál (kulonleges-alkalom-
// shared.ts): a rubrika KÉZI marad, és a rendszer JAVASLATOT tesz mellé egy
// koppintással beírható gombbal — tételes „mi számít bele?" listával, hogy a
// lelkész ELLENŐRIZHESSE, mit ír alá.

/** Egy beszámított munkanapló-alkalom a javaslat tételes listájához. */
export interface JelentesJavaslatTetel {
  /** 'YYYY-MM-DD' — az alkalom napja. */
  datum: string
  /** Az alkalom címe (a napló `cim` mezője), ennek hiányában a `jellege`. */
  cim: string
  /** Az alkalom jelenléte, ha rögzítve van (0 vagy hiányzó → null). */
  jelenlet: number | null
}

/** Egy KÉZI rubrikához tartozó munkanapló-alapú javaslat. */
export interface JelentesJavaslat {
  /** A javasolt szám — MINDIG `tetelek.length` (nincs két igazság). */
  ertek: number
  tetelek: JelentesJavaslatTetel[]
}

/** mezoId → javaslat. Hiányzó kulcs = ehhez a mezőhöz nincs mit javasolni. */
export type JelentesJavaslatok = Record<string, JelentesJavaslat>

/**
 * ALLOW-LISTA: mely KÉZI rubrikák mellé tesz a munkanapló javaslatot.
 *
 * Szándékosan szűk. A munkanapló-TULAJDONÚ rubrikák (II.*, III.1, III.2,
 * III.3, III.5–III.8, III.10, V.3) már `auto: true`-k — oda javaslatot tenni
 * kettős számolás lenne. Ide CSAK olyan mező kerülhet, amely
 *  · `auto: false` (kézi), ÉS
 *  · egy hivatalos munkanapló-oszlopnak felel meg, amely ma sehol nem
 *    összegződik a jelentésben.
 *
 * ⛔ Az itt szereplő mezőt SOHA ne állítsd `auto: true`-ra — a fenti három ok
 *    miatt. A javaslat-sor védőhálóból nem is jelenik meg auto-mező mellett.
 */
export const MUNKANAPLO_JAVASLAT_MEZOK: ReadonlySet<string> = new Set(['III.17'])

/**
 * Címlap / határozati adatok: iktatószámok, tárgyalási szám+dátum, aláírók.
 * A lelkeszi_jelentes.hatarozat jsonb mezőben tárolódik (Partial-ként).
 */
export interface HatarozatAdatok {
  presbiteriSzam: string
  presbiteriDatum: string
  kozgyulesiSzam: string
  kozgyulesiDatum: string
  egyhazkozsegiIktatoszam: string
  egyhazmegyeiIktatoszam: string
  lelkipasztor: string
  fogondnok: string
}

export interface LelkesziJelentesData {
  ev: number
  congregationName: string
  /** Az egyházmegye neve a címlapra (a gyülekezet → egyházmegye láncból); null, ha nem feloldható. */
  egyhazmegyeNev: string | null
  /** Esperesi hivatal felé történt beküldés állapota; null, ha még nem volt beküldés. */
  submission: { status: string; submittedAt: string | null } | null
  /** Élő adatból számolt értékek mezőnként (auto: true mezők; null = nincs adat). */
  auto: Record<string, number | string | null>
  /** Kézi mezők értékei (auto: false mezők). */
  kezi: Record<string, number | string | null>
  /** Auto-mezők kézi felülírásai — olvasáskor ez a legerősebb. */
  felulirasok: Record<string, number | string | null>
  hatarozat: Partial<HatarozatAdatok>
  statusz: 'szerkesztes' | 'veglegesitve'
  veglegesitveAt: string | null
}

/**
 * Egy mező megjelenítendő értéke: felulirasok > auto > kezi prioritással.
 * Az üres string felülírást "nincs felülírva"-ként kezeljük, így a UI-ban a
 * felülírás törlése visszaadja az auto értéket.
 */
export function mezoErtek(data: LelkesziJelentesData, mezoId: string): number | string | null {
  const felul = data.felulirasok[mezoId]
  if (felul !== undefined && felul !== null && felul !== '') return felul
  const auto = data.auto[mezoId]
  if (auto !== undefined && auto !== null) return auto
  const kezi = data.kezi[mezoId]
  return kezi === undefined ? null : kezi
}

/**
 * Magyar írásmódú szám értelmezése: a '12.345,67' és a '12 345,67' alak is
 * szám (a szóköz-tagoló lehet normál / nem törő / keskeny nem törő szóköz is);
 * a csak-pontos ezres tagolás ('1.234.567') szintén felismerhető. Nem
 * értelmezhető bemenetre (üres, szöveg, több tizedesjel) null.
 */
export function parseHuSzam(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === null || value === undefined) return null
  // A \s a JS-ben a nem törő (U+00A0) és a keskeny nem törő (U+202F) szóközt is fedi.
  let s = String(value).trim().replace(/\s+/g, '')
  if (!s) return null
  if (s.includes(',')) {
    // Magyar alak: a pont ezres tagoló, a vessző a tizedesjel. Csak az ELSŐ
    // vesszőt cseréljük — több vessző esetén a lenti minta elbukik (→ null).
    s = s.replaceAll('.', '').replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // Csak-pontos ezres tagolás (pl. '1.234.567') — a pontok tagolók;
    // minden más pontos alak ('12.5') tizedespontként marad.
    s = s.replaceAll('.', '')
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * A számolt auto-mezők (I.8, I.9, VII.8) újraszámítása a felhasználó által
 * már beírt értékek figyelembevételével. ÚJ auto-rekordot ad vissza (a
 * bemeneteket nem módosítja), amelyben ez a három mező újraszámolt, minden
 * más auto-érték változatlan.
 *
 * Egy összetevő értéke — ertek(id): felulirasok[id] (ha nem üres) → kezi[id]
 * (ha nem üres) → auto[id], magyar szám-parse-szal (parseHuSzam); a nem-szám
 * érték null-nak számít.
 *  - I.8   = ertek('I.2c') − ertek('I.3c') — null, ha bármelyik null;
 *  - I.9   = I.8 + n0('I.4c') + n0('I.6c') − n0('I.5c') − n0('I.7c'),
 *            ahol n0: null→0 — null, ha I.8 null;
 *  - VII.8 = round2(n0('VII.5') + ertek('VII.6') − ertek('VII.7')) — null,
 *            ha VII.6 vagy VII.7 null (a hiányzó előző évi maradvány 0).
 */
export function deriveAutoMezok(
  auto: Record<string, number | string | null>,
  kezi: Record<string, number | string | null>,
  felulirasok: Record<string, number | string | null>,
): Record<string, number | string | null> {
  const nyersErtek = (mezoId: string): number | string | null => {
    const felul = felulirasok[mezoId]
    if (felul !== undefined && felul !== null && felul !== '') return felul
    const k = kezi[mezoId]
    if (k !== undefined && k !== null && k !== '') return k
    const a = auto[mezoId]
    return a === undefined ? null : a
  }
  const ertek = (mezoId: string): number | null => parseHuSzam(nyersErtek(mezoId))
  const n0 = (v: number | null): number => (v === null ? 0 : v)
  const round2 = (v: number): number => Math.round(v * 100) / 100

  // I.8 — természetes szaporulat / apadás (keresztelt − temetett)
  const keresztelt = ertek('I.2c')
  const temetett = ertek('I.3c')
  const i8 = keresztelt === null || temetett === null ? null : keresztelt - temetett

  // I.9 — általános szaporulat / apadás (a hiányzó kézi összetevők 0-nak számítanak)
  const i9 =
    i8 === null
      ? null
      : i8 + n0(ertek('I.4c')) + n0(ertek('I.6c')) - n0(ertek('I.5c')) - n0(ertek('I.7c'))

  // VII.8 — zárszámadási egyenleg (a + b − c)
  const bevetel = ertek('VII.6')
  const kiadas = ertek('VII.7')
  const vii8 =
    bevetel === null || kiadas === null ? null : round2(n0(ertek('VII.5')) + bevetel - kiadas)

  return { ...auto, 'I.8': i8, 'I.9': i9, 'VII.8': vii8 }
}
