# KARTOTEKA — Pénzügyi modul: kiegészítő jogi pontosítások (arendare + e-Factura kivétel)

**Dátum**: 2026-04-16
**Állapot**: kutatási eredmény, a korábbi tervek kiegészítése
**Érinti**: `KARTOTEKA-oblio-efactura-integracio-terv-2026-04-16.md`, `KARTOTEKA-tva-figyelo-terv-2026-04-16.md`, `KARTOTEKA-penzugy-feladatlista-2026-04-16.md`

---

## Vezetői összefoglaló

Az eredeti terv az „**bérleti szerződésből kötelezően e-Factura**" feltételezésre épített. A részletes román jogi kutatás **ezt finomítja**:

- **Arendare, locațiune, concesiune, leasing imobil** ügyletek **KI VANNAK VÉVE** az e-Factura kötelezettség alól (OUG 120/2021 + OUG 69/2024 + OUG 138/2024)
- **Kivétel a kivétel alól**: új építésű épületek és **építési telkek** — ezekre **kötelező** e-Factura
- **Egyéb gazdasági tevékenység** (pl. rendezvényre terembérlet, kiadvány értékesítés, tábordíj): **kötelezi** a gyülekezetet az SPV-regisztrációra, és onnantól **minden** számlát SPV-n keresztül kell küldeni
- **ONG / cult religios 2025.07.01 óta** köteles e-Facturát kiállítani, ha **gazdasági tevékenysége** van
- **B2C** (magánszeménynek): 2025.01.01 óta kötelező, szankciók 2025.07.01 óta. CNP opcionális a számlán.

**A következményei**:
1. Az **Oblio integráció nem kötelező elem** a bérleti szerződéshez — **opció**, amit a lelkész vagy a gyülekezet állapota szerint használ
2. **A rendszernek tudnia kell**, melyik gyülekezet „csak bérlet" típusú (nem SPV-köteles) és melyik „vegyes" (SPV-köteles)
3. A felhasználói felületen **egyértelmű** legyen: mikor számla, mikor chitanță, mikor e-Factura
4. A TVA-plafon számítás **változatlanul** számol az arendă/chirie bevétellel (art. 310)

---

## Jogszabályi részletek

### 1. E-Factura kötelezettség ONG/cult esetén

Forrás: **OUG 120/2021** + **OUG 69/2024** + **OUG 138/2024**, részletezve az [ANAF](https://www.anaf.ro) és [avocatnet.ro](https://www.avocatnet.ro/articol_67338/e-Factura-ONG-urile-cultele-%C8%99i-partidele-trebuie-s%C4%83-foloseasc%C4%83-sistemul-de-la-1-iulie-2025.html) oldalon.

**Kronológia**:
- **2024.07.01 – 2025.06.30**: átmeneti mentesség ONG-knak, kultusoknak, mezőgazdászoknak, politikai pártoknak
- **2025.07.01**-től **kötelező**, ha gazdasági tevékenységet végez
- **2025.01.01**-től B2C e-Factura (magánszeménynek), szankciók **2025.07.01**-től

**Ki „gazdasági tevékenységet végez"?**
- Bevételt termel rendszeresen ellenérték fejében
- Pl. bérleti díj, tábordíj, kiadvány-értékesítés, terembérlés

**Ha csak adomány, persely, járulék, szertartás (kollektív tagi érdek)**: nem gazdasági → nincs SPV-kötelezettség.

### 2. E-Factura kivétel a bérletekre

Forrás: **OUG 120/2021 + Codul fiscal art. 292 alin. (2)**, részletezve a [ContApp](https://contapp.ro/blog/operatiuni-scutite-de-tva-operatiuni-scutite-de-e-factura/) blogon.

**Szövegpontos lista** — e-Factura kötelezettség ALÓL MENTES:
- `arendare` (mezőgazdasági bérlet)
- `locațiune` (általános bérlet)
- `concesiune` (koncesszió)
- `leasing imobil` (ingatlan lízing)

**Kivétel ez alól (tehát SPV-kötelező)**:
- **Új építésű épület** értékesítése (nem bérlete!)
- **Építési telek** értékesítése

Egyházi gyakorlat: régi templom, régi parókia, régi föld bérbeadása → **nem** SPV-köteles. Új építésű parókia értékesítése → SPV-köteles (ritka eset).

**DE**: ha a gyülekezet az SPV-regisztrációba **egyéb** gazdasági tevékenység miatt bekerül, onnantól **mindent** az SPV-n kell küldeni, ideértve a mentesség alatti bérleti számlákat is.

### 3. TVA-plafon 395 000 RON — MI SZÁMÍT BELE

Forrás: **Codul fiscal art. 310** + **OG 22/2025**, részletezve az [InfoTVA](https://infotva.manager.ro/articole/infotva/majorare-plafon-tva-la-395000-lei-conform-og-222025-exemplu-concret-de-aplicare-pentru-firme-24382.html) oldalon.

Plafonba **BELESZÁMÍT** (art. 310 alapján):
- Art. 292 alin. (2) **lit. a)** — pénzügyi/banki szolgáltatás
- Art. 292 alin. (2) **lit. b)** — biztosítás
- Art. 292 alin. (2) **lit. e)** — **arendare, locațiune, concesiune** — ✅ **IDE TARTOZIK A GYÜLEKEZET**
- Art. 292 alin. (2) **lit. f)** — ingatlan értékesítés

**Tehát**: még ha e-Factura alól mentes is az arendă, **a TVA-plafonba beleszámít**. Ez egyértelmű.

### 4. Impozit pe profit — ÚJ területe a figyelőnek

Forrás: **Codul fiscal art. 15 alin. (3)** — [noulcodfiscal.ro art. 15](https://www.noulcodfiscal.ro/titlu-2/capitol-2/articol-15.html)

**ONG/cult mentesség** a **jövedelemadó (impozit pe profit)** alól a gazdasági bevételeire:
- **15 000 EUR** plafonig
- **ÉS** max. az összes bevétel **10%-áig**
- Felette **16% impozit pe profit** a többletre

Gyakorlati jelentőség:
- Ha a gyülekezet csak 50 000 RON bérleti bevételt szed, egyéb bevétele 400 000 RON → a gazdasági bevétel az összes 11%-a, ami már túllépi a 10%-ot → adóköteles a plafon feletti rész
- **Két küszöb egyszerre**: abszolút (15 000 EUR ≈ 75 000 RON) és relatív (10% a teljes bevételből)

**Ez egy külön figyelő** lenne — **most nem implementáljuk**, de a TVA-figyelő számítási alapját (`tva_plafonba_szamit`) fel lehet használni a jövőben.

### 5. Contract de arendare — speciális kérdések

Forrás: [Cod civil art. 1836+](https://lege5.ro/gratuit/gq3dinjxg44a/contractul-de-arendare), [ANAF Ghid arenda 2025 PDF](https://static.anaf.ro/static/10/Anaf/AsistentaContribuabili_r/Ghid_arenda_2025.pdf)

- **Kötelező regisztráció** a **consiliul local** (helyi önkormányzat) adóhatóságánál **15 napon belül** a szerződés aláírásától
- **Bizonylat**: a bérbeadó nem köteles factura-t, de általában kiállítja. **Alternatíva**: szerződés + banki kivonat + chitanță
- **Forrásadó (10%)**: **csak ha a bérbeadó magánszemély**. A **gyülekezetnél (ONG)** NEM alkalmazandó — a gyülekezet saját nonprofit szabályrendszere szerint könyvel

### 6. B2C e-Factura (magánszemély bérlő)

Forrás: [contabilitatedigitala.ro – B2C](https://www.contabilitatedigitala.ro/e-factura-2025-tot-ce-trebuie-sa-stii-despre-facturile-b2c-pentru-persoane-fizice/)

- **2025.01.01**-től kötelező a B2C e-Factura (magánszeménynek kiállított)
- **2025.07.01**-től szankciók
- **CNP átadása opcionális** a számlán — ha nincs, **13 db nulla** kerül a címzett adómezőjébe

**Gyakorlati hatás a gyülekezetre**: ha egy magánszeménynek (pl. mezőgazdának) arendă miatt számlát állít ki, és SPV-regisztrált, ezt B2C e-Facturaként kell küldenie. Ha **nem SPV-regisztrált** és csak arendă van, papír-chitanță vagy egyszerű számla elég.

---

## Módosítások a korábbi tervdokumentumokhoz

### 1. `KARTOTEKA-oblio-efactura-integracio-terv-2026-04-16.md` frissítés

**Új oszlop a `congregations` táblán** (a meglévő `tva_alany` mellett):

```sql
ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS e_factura_kotelezett boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS e_factura_kotelezett_tol date,
  ADD COLUMN IF NOT EXISTS e_factura_kotelezettseg_indoka text;

COMMENT ON COLUMN public.congregations.e_factura_kotelezett IS
  'TRUE, ha a gyülekezet SPV-regisztrált és köteles minden számlát az ANAF SPV-n keresztül küldeni.';
COMMENT ON COLUMN public.congregations.e_factura_kotelezettseg_indoka IS
  'Szabadszöveges magyarázat: miért kötelezett (pl. „rendezvény-terembérlés 2025-től", „építési telek értékesítés").';
```

**Új logika az Oblio számla-kiállítás dönteni előtt**:
- Ha `e_factura_kotelezett = true` → mindig SPV-n keresztül (Oblio)
- Ha `e_factura_kotelezett = false` ÉS a szerződés `jogi_tipus` egyike `locatiune/arendare/concesiune` → **opcionális** Oblio (vagy papír-chitanță)
- Ha `e_factura_kotelezett = false` ÉS a szerződés ingatlan-értékesítés új építésűre → **kötelező** SPV

**UI változás** a „Számlát kiállít" gombnál:
- Ha opcionális: tooltip „Ez a számla nem köteles e-Facturára. Kiállítod mégis elektronikusan (Oblio), vagy papíron?"
- Ha kötelező: tooltip „Ez a számla **köteles** e-Facturára (SPV). Kiállítjuk Oblio-val."
- Ha „csak papír": a modal egy egyszerűsített chitanță-sablont kínál (HTML → PDF, nem hívja az Oblio-t)

### 2. `KARTOTEKA-tva-figyelo-terv-2026-04-16.md` frissítés

**Megerősítés** (nincs változás): a TVA-plafonba **beleszámít** az arendă, chirie, concesiune — ez az eredeti terv szerint `tva_plafonba_szamit = true` a `104.xx` kódokra.

**Új alternatíva**: a gyülekezetenkénti `e_factura_kotelezett` flag **automatikus** frissítése a TVA-plafon átlépésekor? **Javaslat**: NEM automatizáljuk — a SPV-regisztráció a könyvelő feladata, nem a szoftveré. Csak figyelmeztetést adunk.

### 3. `KARTOTEKA-penzugy-feladatlista-2026-04-16.md` új feladatok

**WC-1 (TVA figyelő) bővítés**:
- Új alfeladat **1.1.b**: `congregations.e_factura_kotelezett` + `e_factura_kotelezett_tol` + `e_factura_kotelezettseg_indoka` oszlopok hozzáadása
- Új alfeladat **1.5.b**: a TVA widget mellé egy **„e-Factura státusz"** info-sor: „Ez a gyülekezet jelenleg NEM e-Factura köteles" vagy „E-Factura köteles [dátumtól], mert: [indok]"

**WC-2 (Oblio) bővítés**:
- Új alfeladat **2.6.b**: a számla-kiállítás logika felhasználja a `e_factura_kotelezett` flag-et, és **papír-chitanță** opciót is kínál
- Új alfeladat **2.6.c**: új komponens `components/finance/chitanta-generator.tsx` — egyszerű chitanță HTML→PDF, az Oblio-t megkerülve (ingyenes alternatíva)
- Új alfeladat **2.5.b**: az Oblio beállítás modalban info-doboz: „Figyelem: ha a gyülekezeted csak bérleti ügyleteket bonyolít, lehet, hogy nem kell e-Factura. Olvasd el az Útmutató **12. szekcióját** először."

**WC-4 (Útmutató) frissítés**:
- **12. szekció (TVA)**: tartalmazza az **e-Factura kivétel** pontos magyarázatát
- **13. szekció (e-Factura)**:
  - Mielőtt az Oblio-t részletezzük: **mikor van egyáltalán szükség** e-Facturára?
  - Döntési fa: „Milyen bevételed van? → Ez alapján kell-e SPV-regisztráció?"
  - Konkrét példák: „Parochia csak bérleti díjat szed → nincs e-Factura. Parochia ad rendezvényre terembérletet egy cégnek → kell e-Factura, attól kezdve mindenre."

### 4. `bealeti_szerzodes.jogi_tipus` → javasolt enum

**Megerősítés** a feladatlistából (változatlan):
```sql
jogi_tipus text DEFAULT 'locatiune' CHECK (
  jogi_tipus = ANY (ARRAY['locatiune','arendare','comodat','concesiune'])
)
```

**Tooltip**:
- `locatiune`: általános bérleti szerződés (épület, terület, eszköz)
- `arendare`: mezőgazdasági bérleti szerződés (föld, gazdálkodás céljából)
- `comodat`: haszonkölcsön (ingyenes használatba adás)
- `concesiune`: koncesszió (hosszú távú, ritkán használt)

---

## A Használati útmutató 12. (TVA) és 13. (e-Factura) szekciók új tartalma

### Szekció 12 — TVA-plafon: mit számolunk?

```
A TVA-plafon 395 000 RON a te gyülekezetedben.

A rendszer csak azokat a bevételeket számolja bele, amelyek
a román adótörvény szerint "gazdasági tevékenységből" származnak:

  ✓ bérleti díj (chirie, arendare, concesiune)
  ✓ terembérlet rendezvényekre, koncertekre, külső feleknek
  ✓ kiadvány, könyv, gyülekezeti magazin értékesítése
  ✓ táborok, oktatási programok díja külsősöknek

NEM számítjuk bele:

  ✗ egyházfenntartói járulék
  ✗ persely, adomány
  ✗ keresztelő, esketés, temetés szertartási díja
  ✗ haszonkölcsön (comodat) használat — mert ingyenes

Fontos:

- Naptári év szerint számolunk (január 1 - december 31)
- 80%-nál (316 000 RON): sárga — figyelj a könyvelővel
- 90%-nál (355 500 RON): narancs — sürgős megbeszélés
- 100%-nál (395 000 RON): piros — 10 napon belül 010-es beadás
  az ANAF-hoz, amit a könyvelő csinál

Jogi alap: Codul fiscal art. 310 (plafon) + art. 292 (2) lit. e)
(bérlet beleszámít), OG 22/2025 (395 000 RON érvényes 2025.09.01-től).
```

### Szekció 13 — E-Factura: nem mindig kell!

```
Figyelem — a legtöbb gyülekezetnek nem kell e-Factura.

Az alábbi bérleti típusok MENTESEK az e-Factura alól:

  ✓ locațiune (általános bérlet, pl. régi ház)
  ✓ arendare (mezőgazdasági föld)
  ✓ concesiune (koncesszió)
  ✓ comodat (ingyenes, nem is kell számla)

Papír chitanță vagy egyszerű számla elég ezekre.

E-Factura KÖTELEZŐ ezekre:

  ✗ új építésű épület értékesítése (nem bérlete!)
  ✗ építési telek értékesítése
  ✗ bármilyen egyéb gazdasági tevékenység (rendezvény-szervezés,
    kiadvány értékesítés, tábor szervezés stb.)

Ha a gyülekezeted bármelyik "egyéb" tevékenységbe belefut,
a könyvelő regisztrálja a gyülekezetet az ANAF SPV-ben,
és onnantól MINDEN számlát - a bérletieket is - elektronikusan
kell kiállítani.

A rendszerben a beállításoknál jelöld be, ha a gyülekezet
e-Factura köteles - onnantól a "Számlát kiállít" gomb
automatikusan az Oblio-n keresztül elektronikus számlát küld.

Ha NEM kötelező, a rendszer egy egyszerűsített chitanță-t
kínál, amit kinyomtathatsz és aláírhatsz.

Jogi alap: OUG 120/2021 + OUG 69/2024 + OUG 138/2024,
Codul fiscal art. 292 (2) lit. e) (mentesség az arendă/locațiune
alól az e-Factura kötelezettségben).
```

---

## Új nyitott kérdések a felhasználónak

1. **„Chitanță generátor"**: az Oblio-mentes esetben egy egyszerűsített nyugta/számla nyomtatvány — **igen/nem**, és **mi legyen a formátuma** (A5/A4, milyen mezők, hivatalos fejléc)?
2. **`e_factura_kotelezett` flag kezelés**: ki állíthatja a gyülekezeti beállításokban — csak `admin`, vagy a `lelkesz` is? **Javaslat**: `admin` és a felettes `esperes`, mert a könyvelővel egyeztetett szakmai döntés.
3. **Számla formátum**: a gyülekezetek jelenleg milyen számla-papírt használnak bérletre? (Oblio-ban előre megadott, ha van sablon, azt használhatjuk.)
4. **Impozit pe profit figyelő**: **most** vagy **később**? Én **később**-re szavazok, mert pontos könyvelési adat kell hozzá.

---

## Frissített alapfeltételezés

A **2025.07.01 utáni „mindenki köteles e-Factura"** egyszerűsített tétel **pontatlan** volt. A valóságban:

1. **ONG/cult** csak akkor köteles, ha **gazdasági tevékenységet** végez
2. Az **arendare/locațiune/concesiune** bérlet **mentes** az e-Factura alól, **kivéve** ha a gyülekezet már egyéb ok miatt SPV-regisztrált
3. **B2C** (magánszemélynek) 2025.01.01 óta hatályos, szankciók 2025.07.01 óta

Emiatt az Oblio integráció **nem kötelező szoftverrész**, hanem **használható eszköz** azoknak a gyülekezeteknek, akik:
- Új építésű ingatlant adnak el (ritka)
- Egyéb gazdasági tevékenységet is folytatnak (terembérlet rendezvényre, kiadvány-értékesítés)
- **Önként választják** (kényelmi szempontból, mert az Oblio amúgy is használatos a gyülekezetnél)

Ez a rendszert **rugalmasabbá teszi** és a legtöbb kis gyülekezetnek nem kell az Oblio licenc költségét vállalnia.
