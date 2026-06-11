# KARTOTÉKA — Pénzügyi észrevételek: diagnózis, javítások és fejlesztési terv (2026-06-11)

> Endre 8 élesben talált észrevételének feldolgozása. Elv: ÓVATOS javítás,
> találgatás helyett diagnózis; minden nagyobb fejlesztés ITT van megtervezve,
> implementáció csak Endre jóváhagyása után.
> Kapcsolódó: `KARTOTEKA-penzugy-teljes-audit-2026-06-11.md` (teljes audit) ·
> `migration-docs/sql/2026-06-11h-diagnoszt-penzugy-eszrevetelek.sql` (futtatandó!).

---

## A) AZONNAL JAVÍTVA (ebben a körben, kód kész)

### 1. ✅ Státusz-jelzők a headerben (1. észrevétel)
**Volt:** az „Offline munkamenet" és a szinkron-jelvények `fixed` pozícióval a
tartalom FÖLÖTT lebegtek (jobb-felül + alul-középen) — kitakarták a modulokat.
**Lett:** a `KartotekaHeader`/`KartotekaShell` új, opcionális `headerExtra`
bővítőpontot kapott; a desktop a három jelvényt (munkamenet, szinkron-számláló,
auto-szinkron sáv) inline módban a header jobb sávjába teszi, a súgó-gomb elé.
A web-et nem érinti (opcionális prop). Fájlok: `kartoteka-header.tsx`,
`kartoteka-shell.tsx`, `SessionStatusBadge/SyncStatusBadge` (position prop),
`auto-sync-status-bar.tsx`, `auth-gate.tsx` (lebegő render törölve),
`desktop-shell.tsx` (headerExtra bekötés).

### 2. ✅ Kategória-aggregátok + egyházmegyei tételek kiszűrve (2. észrevétel)
**Diagnózis:** a rögzítő a `befizetescel`/`kiadascel` MINDEN aktív sorát
kínálta — köztük az aggregát kategóriafejeket („Egyházi tevékenységből származó
bevételek (5+...+12)", „Múlt évi pénztármaradvány (2+3)"…) és a nem-gyülekezeti
szintű tételeket. A hiba a WEBEN IS megvolt (azonos képlet).
**Szabály (a hivatalos katalógus ellen igazolva):** könyvelhető = a kód
illeszkedik a `^(10[1-7]|20[1-7])\.\d+$` mintára (pontosan a hivatalos
39 bevétel + 48 kiadás = 87 levél) ÉS gyülekezeti szintű. A kanonikus
belső-mozgás kódok az összevont rögzítőben maradnak (a belső-mozgás sor-típushoz).
**Hatókör:** web `finance-tabs.tsx` (CSAK gyülekezeti scope-ban — az
egyházmegyei mód VÁLTOZATLAN), desktop `penzugy-page.tsx`, desktop dedikált
Bevétel/Kiadás oldalak. Közös helper: `isGyulekezetiKonyvelhetoKod`
(`packages/ui-app/src/finance/types.ts`).
**⚠️ ELLENŐRZÉS (Endre):** futtasd a diagnoszt-SQL 2–3. lekérdezését — a
kizártak közt CSAK aggregát/egyenleg/belső-mozgás/egyházmegyei sor lehet, és a
maradó darabszám ~39+48. Ha bármi hiányzik, jelezd!

### 3. ✅ „permission denied for table befizetes" (5. észrevétel)
**Diagnózis (magas konfidencia):** NEM adatbázis-hiba. A rögzítő
`navigator.onLine` alapján döntött az online mentésről — PIN-es (offline)
munkamenetben viszont nincs Supabase-session, így működő internettel a kérés
`anon` szerepkörrel ment, amit a Postgres helyesen utasít el. (A web ugyanazt a
kódot futtatja, de ott nincs PIN-mód — ezért csak desktopon jött elő.)
**Javítás:** új `useSessionOnline` hook / `isOnlineWithSession()` —
ONLINE = hálózat ÉS érvényes session. PIN-módban a rögzítés a bevált OFFLINE
ágon fut (iratszám-tárca + outbox), és a következő online belépéskor
szinkronizálódik. Átállítva: összevont rögzítő + Bevétel/Kiadás/Belső mozgás
oldalak.
**⚠️ MEGERŐSÍTÉS (Endre):** futtasd a diagnoszt-SQL 1. lekérdezését — elvárt,
hogy az `authenticated` szerepkörnek van joga, az `anon`-nak nincs. Ha az
authenticated-nél hiányzik a SELECT/INSERT a `befizetes`/`kiadas` táblákra,
az KÜLÖN hiba — azonnal jelezd, és adok javító SQL-t.

### 4. ✅ Belső mozgás egyértelmű megnevezésekkel (4. észrevétel)
- **Összevont rögzítő** (web+desktop közös komponens): a belső-mozgás opciók
  címkéje a gyülekezet SAJÁT banki megnevezését hordozza — egy bankszámlánál
  „Készpénzletétel a(z) BCR (RON) számlára" (a mentett nevet szó szerint
  használja); több banknál irány-címke + a sor bank-választója dönt.
  **Ha nincs rögzített bankszámla, a belső-mozgás opciók el sem jelennek meg.**
  A mentett kategória és a hivatalos Excelbe írt katalógus-név VÁLTOZATLAN
  (a SUMIF-kompatibilitás érinthetetlen).
- **Belső mozgás oldal (desktop):** a forrás/cél szabad szövegmező helyett a
  rögzített bankszámlák legördülője (név + deviza); a kassza-oldal fix
  „Kassza"; bank nélkül világos üzenet. (Elgépelt banknév = rossz betű-lap az
  Excelben — ez mostantól kizárt.)

### 5. ✅ Sidebar „halott részek" (7. észrevétel) — audit + javítás
Teljes menü ↔ route összevetés eredménye:

| Menüpont | Cél | Állapot | Intézkedés |
|---|---|---|---|
| Profilom | /profile | ❌ nincs desktop-oldal (Hamarosan-placeholder) | desktopon ELREJTVE |
| Admin Panel | /admin | ❌ nincs desktop-oldal | desktopon ELREJTVE |
| Egyházmegye | /dashboard-egyhazmegye | ❌ nincs desktop-oldal | desktopon ELREJTVE |
| Egyházkerület | /dashboard-kerulet | ❌ nincs desktop-oldal | desktopon ELREJTVE |
| Pénzügy-almenü: Áttekintés/Tranzakciók/Számadás/Tartozások | külön oldalak | ⚠️ DUPLIKÁLT (a /penzugy tab-oldal ugyanazt adja) | almenü a tab-horgonyokra mutat (webazonos); + új „Kassza" link |
| Minden más menüpont | — | ✅ élő route | — |

Mechanizmus: új opcionális `hiddenMenuHrefs` prop a közös sidebar-ban — a web
változatlan. A régi route-ok megmaradtak (közvetlen URL működik).

### 6. ✅ Kimutatasok_2026.xlsx — írás TILOS (8. észrevétel)
Kódszinten igazolva: SEMMI nem ír a Kimutatások-fájlba (a Rust-oldali
`find_adatok_file` kizárólag `Adatok_*.xlsx`-et fogad el írási célnak).
A korábbi tervjavaslatot („számadás-export a Kimutatásokba") TÖRÖLTÜK az
audit-dokumentumból, az elv rögzítve: minden tétel az Adatok-fájlba megy, a
Kimutatások onnan automatikusan származtat.

---

## B) MEGTERVEZVE — Endre jóváhagyására vár (implementáció a következő körben)

### B1. Tag-keresés a „Befizető / forrás" mezőben (3. észrevétel)
**Cél:** az összevont rögzítő bevétel-sorában a befizető a tagnyilvántartásból
kereshető, és a befizetés `id_szemely`-hez (családi módban `id_csalad`-hoz)
kapcsolódik (egyházfenntartás, adomány — a tartozás-motor így látja!).
**Terv (web-paritás-biztos):**
1. A közös `CombinedEntryBody` ÚJ, opcionális propja:
   `onSearchMembers?: (query: string) => Promise<Array<{id, csaladnev, k_nev}>>`
   — ha nincs megadva, a mező marad sima szöveg (a web addig változatlan).
2. A bevétel-sor `EntryRow`-ja opcionális `szemelyId`/`csaladId` mezőt kap; a
   „Befizető / forrás" mező autocomplete-té bővül (a dedikált Bevétel oldal
   meglévő tag-keresőjének mintájára: 2 karaktertől keres, kiválasztásnál a
   név beíródik + az id rögzül, X-szel leválasztható).
3. `SaveIncomeBatchRow` bővítés: `id_szemely?: number|null`, `id_csalad?: number|null`
   — a `saveIncomeUseCase` ezt MÁR MOST támogatja (nincs core-változás).
4. Bekötés: desktop → `searchMembersForFinanceUseCase`; web → meglévő
   `searchMembersAction`. Excel G-oszlop: a kiválasztott tag neve megy.
**Becslés:** ~3-4 óra, közepes kockázat (közös komponens — web build + desktop
build + kézi próba mindkét oldalon kötelező).

### B2. Pénzügyi Súgó vizuális felújítása (6. észrevétel)
**Cél:** „szájbarágós", lépésről lépésre vezetett, vizuális súgó.
**Terv-vázlat:**
1. **Szerkezet:** a meglévő `FinanceSugoTab` kategória-szekciói maradnak, de
   minden téma elejére „Mikor kell ez neked?" egysoros helyzet-példa kerül
   (pl. „Vasárnap megszámoltad a perselypénzt → Kassza, bevétel").
2. **Vizuális elemek:** számozott lépés-kártyák (1→2→3 színes körökkel, a
   tagnyilvantartas-help mintájára); folyamat-ábrák a kulcs-folyamatokhoz
   (rögzítés → nyugta → Excel; sztornó-lánc; offline → szinkron út) — egyszerű
   SVG/CSS, nem képernyőkép (nem évül el); „Gyakori hibák" piros kártyák
   (pl. „Banki tételt ne a Kasszába!").
3. **Hangnem:** minden szekció pasztorális nyelvű — a meglévő CHANGELOG-stílus
   („nem kell kétszer beírni…") kiterjesztése.
4. **Terjedelem:** ~10 fő-téma × 1 folyamatábra/lépéssor; a desktop
   „Asztali (offline) verzió" szekciója kiegészül az Excel-szinkron
   magyarázatával (bank-párosítás, „Excel nyitva" jelzés, várakozó tételek).
**Becslés:** ~1 nap, alacsony kockázat (csak megjelenítés).

### B3. Belső-mozgás opciók bankonként kibontva (4. észrevétel folytatása)
Több bankszámlánál a legördülő bankonként külön opciót adhatna
(„Készpénzletétel a(z) BCR (RON) számlára" / „… a(z) OTP (EUR) számlára"),
ami a kategóriát ÉS a bankot egyben állítja — a külön bank-választó kiesik.
Mélyebb beavatkozás a közös sor-modellbe → külön kör, B1-gyel együtt érdemes.

### B4. Desktop bank-import bankszámla-hozzárendelés (audit P1 — folyamatban)
Már kiadott külön feladat (chip): számlaválasztó + `bankszamla_id` átadás +
utána az import-tételek Excel-betű-lapra írása.

### B5. Egyéb függőben lévő (a teljes auditból)
- E2E Excel-teszt aláírt buildkel (checklista az auditban) + E4 keresztellenőrzés.
- bank↔bank / valutacsere Excel-írás.
- PIN-kód csere a Beállításokból (A-M15).
- Web dialógus-verziók takarítása; Oblio token-rotáció; friss séma-dump.

---

## C) KÉRDÉSEK ENDRÉHEZ (válasz után lépünk)

1. **Diagnoszt-SQL eredményei** (`2026-06-11h-diagnoszt-penzugy-eszrevetelek.sql`):
   (a) az 1. lekérdezésben az `authenticated`-nek van-e SELECT/INSERT joga a
   `befizetes`/`kiadas` táblákra? (b) a 2. lekérdezés kizárt-listájában van-e
   olyan tétel, amit könyvelni szoktatok? (c) a 3. darabszám ~39/48-e?
2. **B1 tag-keresés:** jóváhagyod a fenti tervet? (A „Befizető / forrás" mező
   családi befizetést is tudjon-e — a dedikált oldalon már van családi mód?)
3. **Dedikált Bevétel/Kiadás oldalak:** ott a belső-mozgás kategóriákat
   KIVETTÜK (bank-párosítás nélkül ott nem értelmezhetők; a Belső mozgás
   oldal a helyük). Rendben van így?
4. **B2 súgó:** a vázolt irány (lépés-kártyák + folyamatábrák + „gyakori
   hibák") megfelel-e; van-e konkrét téma, amit elsőként kérsz?
