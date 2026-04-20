# KARTOTÉKA Diagnosztikai Dokumentum

Dátum: 2026-04-07
Állapot: aktív munkadokumentum
Cél: közös referenciaanyag a hibajavítási, stabilizálási és továbbfejlesztési munkákhoz

## 1. Dokumentum célja

Ez a dokumentum a KARTOTÉKA rendszer jelenlegi állapotának diagnózisa.
Azért készült, hogy a további közös munka során:

- ugyanarról a rendszerről beszéljünk,
- lássuk, mi van ténylegesen kész,
- elkülönítsük a funkcionális hiányokat a technikai adósságtól,
- és legyen egy egyértelmű fontossági sorrend a javításokhoz.

## 2. Rendszerkontextus

- Termék: pásztori nyilvántartó rendszer
- Stack: Next.js + Tailwind CSS + shadcn/ui + Supabase
- Célcsoport: református lelkipásztorok Erdélyben
- Termékcél: öröm legyen használni, meleg, emberközpontú dizájn

## 3. Rövid rendszerkép

A KARTOTÉKA nem prototípus, hanem valós egyházi adminisztrációs rendszer magja.
A gyülekezeti működéshez szükséges fő domainmodulok többsége jelen van, és üzletileg értelmezhető állapotban működik.

Erősségek:

- világos domain-szétválasztás,
- sok szerveroldali üzleti logika,
- modern Next.js + Supabase architektúra,
- több helyen jó UX-alapok,
- egyházi használatra szabott modulok.

Gyengeségek:

- vegyes adatmodell-örökség,
- részben félkész felsőszintű admin funkciók,
- repo-higiéniai problémák,
- dokumentációs és valós rendszerállapot közti eltérések,
- hiányzó tesztelési háló.

## 4. Architektúra röviden

Az alkalmazás App Routeres Next.js rendszer.
Külön `(auth)` és `(dashboard)` route-csoporttal dolgozik, szerveroldali Supabase sessionkezeléssel és middleware-védelemmel.

Fő működési jellemzők:

- a gyökér `/` auth alapján irányít,
- a dashboard layout szerveroldalon tölti a usert, profilt, gyülekezetet, szerepkört, God Mode-ot és admin override állapotot,
- a legtöbb moduloldal szerveroldali belépési pont + nagyobb klienskomponens kombináció,
- van beépített AI asszisztens is többprovideres fallbackkel.

## 5. Adatbázis diagnózis

Elsődleges referenciafájl:

- `migration-docs/Database_schema.sql`

### 5.1 Fő adatcsoportok a séma alapján

Az SQL séma alapján a rendszerben jól elkülöníthető adatcsoportok vannak:

- Auth és hozzáférés:
  - `profiles`
  - `admin_access_requests`
  - `access`
  - `users`

- Szervezeti struktúra:
  - `congregations`
  - `dioceses`
  - `districts`
  - `bealitas`

- Tagnyilvántartás:
  - `szemely`
  - `csalad`
  - `gyerek`
  - `csoport`
  - `presbiter`

- Anyakönyv:
  - `keresztseg`
  - `konfirmalas`
  - `hazassag`
  - `temetes`
  - `bekoltozott`
  - `elkoltozott`
  - `attert`
  - `kitert`

- Pénzügy:
  - `befizetes`
  - `kiadas`
  - `bealitas`
  - `bankszamlak`
  - `belsomozgas`
  - `koltsegvetes`
  - `monetar`
  - `szamadasicel`

- Operatív adminisztráció:
  - `munkanaplo`
  - `iktato`
  - `leltar_tetelek`
  - `sirhely`
  - `sirhelyberles`
  - `sirhelyelhunyt`
  - `sirhelytemeto`

- Közösségi és támogató funkciók:
  - `support_messages`
  - `ertesitesek`
  - `gyulekezeti_programok`
  - `mm_*` Missziós Műhely táblák

### 5.2 A séma legfontosabb tanulsága

A rendszer hibrid adatvilágban él:

- van modern, `uuid` alapú, angolosabb szerkezeti réteg,
- és van erős örökölt, integeres, magyar mezőnevű domainréteg.

Ez önmagában nem baj, de hosszú távon:

- nehezíti a karbantartást,
- növeli az admin és összesítő logika hibakockázatát,
- és könnyebben okoz kódbeli mezőnév-keveredést.

### 5.3 Bizonyított séma-drift a kód és az SQL referencia között

Az SQL referenciafájl és a kód több helyen nem ugyanazt a valóságot írja le.

Példák:

- `support_messages`
  - az SQL szerint mezők: `category`, `module`, `message`, `admin_reply`, `urgency`
  - a kód szerint mezők: `content`, `type`, `parent_id`
  - következtetés: vagy a sémafájl elavult, vagy a jelenlegi kód más adatbázis-állapotra épül

- `admin_access_requests`
  - az SQL szerint a `reason` mező kötelező
  - a kód több helyen úgy szúr be rekordot, hogy `reason` nincs megadva
  - következtetés: a futó adatbázis valószínűleg eltér az itt tárolt referencia-sémától

- `congregations`
  - a pénzügyi kód olvassa a `tartozas_szamitas_mod` mezőt
  - ez a mező a referencia SQL-ben nem látszik
  - következtetés: sémafrissítés történhetett, amit a dokumentált SQL még nem követ

### 5.4 Következmény

Nagyon fontos: a `Database_schema.sql` jelenleg kiváló kontextusfájl, de nem tekinthető önmagában teljesen megbízható, aktuális forrásigazságnak.

Ezért a további munkában a helyes sorrend:

1. kódviselkedés,
2. tényleges adatbázis-állapot,
3. referencia SQL és dokumentáció összehangolása.

## 6. Moduldiagnózis

### 6.1 Erős, ténylegesen működő modulok

- Dashboard
- Tagnyilvántartás
- Pénzügyi mag
- Anyakönyv
- Munkanapló
- Leltár
- Iktatás
- Sírhelyek
- Support
- Missziós Műhely

### 6.2 Részleges vagy hiányos modulok

- Pénzügy:
  - `Monetár` fül placeholder

- Admin:
  - Import fül deklaráltan fejlesztés alatt

- Felsőszintű irányítópultok:
  - `dashboard-egyhazmegye`
  - `dashboard-kerulet`
  - jelenleg placeholder oldalak

## 7. Kritikus megállapítások

### 7.1 Jogosultsági kockázatok

- A Missziós Műhelyben a segédanyag törlése jelenleg nem ellenőrzi a tulajdonjogot vagy adminszerepet.
- Az admin override jelenleg elsősorban layout-szintű név- és arculatcserének látszik; nem bizonyított, hogy a teljes adat-hozzáférési réteg is követi.

### 7.2 Adat- és séma-kockázatok

- A régi és új mezőnevek együttélése valós karbantarthatósági kockázat.
- A kód és a referencia-séma között bizonyított drift van.
- Az admin és aggregációs logika a leginkább veszélyeztetett terület.

### 7.3 Minőségbiztosítási kockázatok

- nincs automatizált tesztkészlet,
- nincs `.gitignore`,
- a repo zajos,
- a lint jelenleg nem tiszta,
- a fő README nem a valós rendszert dokumentálja.

### 7.4 Termék- és UX-kockázatok

- a vizuális nyelv jó irányú, de még inkább hűvös admin, mint meleg pásztori segédrendszer,
- a felsőbb adminszintek félkészsége miatt a rendszerélmény szerepkörönként egyenetlen.

## 8. Fontossági lista

### P0 – Azonnali, blokkoló vagy biztonsági szint

1. Missziós Műhely törlésjog javítása
2. Admin override teljes működési validálása
3. Kód és tényleges adatbázis közti séma-drift feltárása
4. Repo védelme:
   - `.gitignore`
   - `node_modules` kivezetése a verziózásból
   - alap release-higiénia

### P1 – Rövid távú stabilizálás

1. Lint hibák app-szintű rendezése
2. README újraírása a valós termékre
3. Env minta létrehozása
4. Régi és új admin/adatösszesítő mezőhasználat auditja
5. Support és AI adatkezelési kockázatok tisztázása

### P2 – Funkcionális befejezés

1. Kerületi dashboard
2. Egyházmegyei dashboard
3. Admin import
4. Pénzügyi monetár modul

### P3 – Minőség és élmény fejlesztése

1. Alap tesztelési stratégia kiépítése
2. Dokumentáció egységesítése
3. Melegebb, emberközpontúbb vizuális rendszerhangolás
4. UX finomhangolás lelkipásztori használatra

## 9. Javasolt javítási sorrend

### Fázis 1 – Biztonság és működési helyesség

- jogosultsági rések javítása
- override működés tisztázása
- séma-drift audit

### Fázis 2 – Repo és release alapok

- `.gitignore`
- zajcsökkentés a git állapotban
- README
- env minta
- lint scope helyrerakása

### Fázis 3 – Adatmodell-konszolidáció

- admin és összesítő rétegek mezőneveinek egységesítése
- régi és új sémaelemek szétválasztása
- dokumentált adatmodell kialakítása

### Fázis 4 – Hiányzó funkciók befejezése

- felsőszintű dashboardok
- import
- monetár

### Fázis 5 – Emberközpontú termékesítés

- melegebb vizuális tónus
- pasztorálisabb mikroszövegek
- nyugodtabb, bizalmat keltő felületi hangulat

## 10. Hogyan használjuk ezt a dokumentumot

Ez a dokumentum a további közös munka során:

- állapotkép,
- döntési alap,
- és prioritási referencia.

Minden javítási kör előtt érdemes ehhez visszanyúlni, és megjelölni:

- mi lett javítva,
- mi maradt nyitva,
- mi változott a prioritási sorrendben.

## 11. Rövid végkövetkeztetés

A KARTOTÉKA alapja erős.
Nem az a helyzet, hogy „szét van esve a rendszer”, hanem az, hogy van egy értékes, működő mag, amely körül most rendszerszintű konszolidációra van szükség.

A legfontosabb sorrend:

1. helyes és biztonságos működés,
2. tiszta repo és megbízható dokumentáció,
3. adatmodell-egységesítés,
4. hiányzó funkciók befejezése,
5. emberközpontú finomhangolás.

## 12. Javítási Állapotfrissítés - 2026-04-07

Az első P0 jellegű javítási kör elkészült.

Elvégzett javítások:

- Központi effektív gyülekezet-hozzáférési segéd készült: `lib/auth/effective-access.ts`
- A dashboard layout most már központi forrásból számolja az admin override-ot, a szerepköröket és az effektív gyülekezetet
- A layout UI-profilja override esetén már az effektív `congregation_id` értéket kapja tovább
- A Missziós Műhely `deleteMaterial()` művelete most már tulajdonosi vagy admin jogosultságot kér
- A Missziós Műhely `voteIdea()` most már a `tipus = 'tamogatas'` adattal ment, majd újraszámolja a támogatásszámot
- Az alábbi modulok az effektív gyülekezet-azonosítóra lettek átállítva:
  - leltár
  - munkanapló
  - iktató
  - sírhelyek
  - pénzügy több kritikus művelete
  - anyakönyv
  - tagnyilvántartás több kritikus művelete
  - programok
  - dashboard főoldal
- Több módosító művelet most már `congregation_id` alapján is szűr update/delete esetben
- A dashboard főoldal lekérdezései most már az effektív gyülekezetre szűrnek a tagsági, pénzügyi és munkanapló-adatoknál
- A módosított fájlokra futtatott célzott eslint ellenőrzés hiba nélkül lefutott

Megmaradt nyitott témák:

- A teljes repo-lint továbbra sincs rendben; ez külön repo-higiéniai fázis marad
- A családkezelés és néhány történeti táblakapcsolat továbbra is séma-örökséget hordoz
- A kerületi és egyházmegyei dashboard, az admin import és a monetár továbbra is külön befejezendő funkcionális téma

Frissített prioritás:

1. Repo-higiénia és teljes lint-konszolidáció
2. Séma-drift és adatmodell-egységesítés
3. Felsőszintű hiányzó funkciók befejezése
4. UX és emberközpontú hangolás
