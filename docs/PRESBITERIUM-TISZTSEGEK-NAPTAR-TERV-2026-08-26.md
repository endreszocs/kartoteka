# Presbitérium, tisztségek, bizottságok + gyülekezeti naptár — TERV (5. kör)

**Dátum:** 2026-08-26 · **Állapot:** ENDRE JÓVÁHAGYÁSÁRA VÁR · **Előzmény:** teljes kód-felmérés
+ 3 lencsés (kompatibilitás / GDPR-biztonság / egyházjog-UX) adverzariális terv-kritika (49 találat beépítve).

---

## 0. Vezetői összefoglaló és a fő architektúra-döntés

**A mai állapot:** a presbiterség egyetlen szabadszöveges `tisztseg` mező a `presbiter`
táblában — nincs dátum, nincs pót/teljes megkülönböztetés, nincs történet (a mentés
töröl+újraír), a „Gondnok" csak konvenció. Kántor, diakónus, nőszövetségi/IKE-elnök,
önkéntesek, bizottságok: **semmilyen adatmodell nincs**. A weboldal presbiterekből csak
darabszámot mutat; a programnaptárnak nincs publikálás-kapcsolója; az ünnep-számítás
három, egymásnak részben ellentmondó kódhelyen él.

**Architektúra: C-HIBRID.** Az első tervváltozat (minden tisztség egy vadonatúj táblába,
a `presbiter` tábla kivezetése) a kritikán elbukott: legalább 15 integrációs pont törne
(a személytörlő SECURITY DEFINER RPC ujjlenyomat-őrrel védve, körzet-törlés és
körzet-varázsló, offline Dexie- és Excel-tükör, desktop-sync, Kuka-címkék, GDPR-export,
mentés-besorolás, publikus darabszám-RPC, teszt-seedek). Ezért:

1. **A `presbiter` tábla MEGMARAD és BŐVÜL** (fokozat, funkció, mandátum, egység,
   publikus) — a presbitérium minden meglévő fogyasztója (kvórum, éves jelentés,
   weboldal-darabszám, körzetkezelés, offline, törlő-RPC) érvényben marad, csak
   szűrés-pontosítást kap.
2. **ÚJ, kis `tisztsegek` tábla** a NEM-presbiteri tisztségeknek (kántor, diakónus,
   elnökök, önkéntesek, bizottsági tagok, egyházmegyei küldött) — itt nincs átállás,
   nincs migrálandó fogyasztó, az integrációs teher (törlő-RPC, export, mentés, kuka)
   egyszeri és ismert.

---

## 1. Adatmodell (1 db SQL-fájl, Endre futtatja)

### 1.1 `presbiter` tábla bővítése

| Oszlop | Típus | Szabály |
|---|---|---|
| `fokozat` | text | CHECK `('teljes','pot','tiszteletbeli')`, DEFAULT `'teljes'` — a tiszteletbeli létező egyházi kategória, szavazati jog nélkül |
| `funkcio` | text | CHECK `('fogondnok','gondnok')`; **CHECK: funkcio esetén fokozat='teljes'** (pótpresbiter nem lehet gondnok — egyházjog) |
| `kezdete` | date | mandátum kezdete |
| `vege` | date | mandátum vége; NULL = nincs megadva |
| `egyseg_id` | uuid FK gyulekezeti_egysegek | **társegyházközség**: az egyházrésznek saját presbitériuma van (a 2026-08-25-ös kör ígérete) — enélkül a két presbitérium összemosódna |
| `publikus` | boolean | DEFAULT false — weboldal-kijelölés |
| `megjegyzes` | text | |

- A `tisztseg` szabadszöveg **megmarad** (visszafelé kompatibilitás), de a UI többé nem
  ezt szerkeszti — kódlistából generált címke.
- **Egyszeri backfill** a mai szabadszövegből, ékezet-toleránsan, HOSSZABB minta előbb:
  `főgondnok → pótpresbiter/pót → gondnok → presbiter → (minden más érintetlen)`;
  a fel nem ismert értékekről a migráció **visszajelző listát ad** (nem térképez némán).
- „Aktív" definíció EGY helyen (közös helper + azonos SQL-kifejezés minden RPC-ben):
  `(kezdete IS NULL OR kezdete <= ma) AND (vege IS NULL OR vege >= ma)` — a jövőbeli
  kezdetű mandátum így nem publikálódik/számít idő előtt.

### 1.2 Új `tisztsegek` tábla (nem-presbiteri tisztségek)

`id uuid PK · congregation_id uuid NOT NULL (trigger tölti a személyből ÉS ellenőrzi az
egyezést — kereszt-gyülekezeti sor nem jöhet létre) · id_szemely int FK szemely ·
tipus CHECK ('kantor','diakonus','noszovetsegi_elnok','ike_elnok','onkentes',
'bizottsagi_tag','egyhazmegyei_kuldott','egyeb') · bizottsag varchar
(gazdasagi | leltarozo | diakoniai — UI-kódlista, szándékosan NEM DB-CHECK, hogy a 4.
bizottság UI-bővítés legyen, ne migráció) · bizottsagi_szerep CHECK ('elnok','tag') ·
jelleg CHECK ('hivatasos','onkentes') — kántorhoz · egyeb_megnevezes varchar ·
egyseg_id uuid FK · kezdete date · vege date · publikus boolean DEFAULT false ·
is_deleted boolean DEFAULT false (Kuka!) · megjegyzes text · created_at/updated_at/revision`

Cross-CHECK-ek: bizottsag/bizottsagi_szerep csak `bizottsagi_tag`-nál; jelleg csak
`kantor`-nál; egyeb_megnevezes csak `egyeb`-nél.

### 1.3 Kapcsolódó mezők

- `bealitas` (évfüggetlen beállításként a congregations-ön): **`presbiteri_ciklus_ev` int DEFAULT 3**
  (Erdély: 3 év; Királyhágómellék eltérhet — gyülekezetenként állítható).
- `szemely`: **`nev_publikalas_consent` boolean + `nev_publikalas_consent_at` timestamptz**
  — a GDPR-igazolhatósághoz nem elég a pipa, a mikor is kell; a member-form GDPR-blokkja
  harmadik checkboxot kap, előtöltéssel (a photo_consent mintájára).

### 1.4 A migrációs fájl kötelező elemei (a kritika alapján)

Egyetlen fájlban, önhordó őrökkel (NINCS TEMP — ismert hibaosztály):
- RLS a `tisztsegek`-re a presbiter-minta szerint + **explicit döntés a felsőbb szintű
  (esperes/kerületi) olvasásról** (a legújabb táblák additív megyei/kerületi policy-kat
  kapnak — az új táblára ezek NEM öröklődnek maguktól);
- **`backup_table_policy` INSERT ugyanebben a fájlban** (besorolatlan tábla = az éjszakai
  mentés HANGOS leállása — élesben már elsült hibaosztály);
- **`tagnyilvantartas_tag_torles` RPC bővítése** (`DELETE FROM tisztsegek WHERE id_szemely=…`)
  + a **biztonsági ujjlenyomat-őr újragenerálása** (a törzs őr nélkül nem cserélhető!);
- `szemely_kapcsolatok` + `szemely_kapcsolat_lista` katalógus új „tisztségek" sora;
- explicit `REVOKE ALL FROM anon` a táblán + verifikáció;
- `NOTIFY pgrst, 'reload schema'`;
- záró UNION ALL verifikáció darabszám-asszertekkel (backfill-egyeztetés, RLS
  bekapcsolva, anon-tiltás, policy-darabszám).

---

## 2. Fogyasztó-átállások (a kritika teljes leltára — mind nevesítve)

| Hely | Teendő |
|---|---|
| `savePresbyter` (DELETE+INSERT) | id-alapú UPDATE; történet = lezárás `vege`-vel, új ciklus = új sor; hard delete → Kuka |
| Jegyzőkönyv-kvórum (`minutes-editor`) | **kvórum-alap = aktív ÉS fokozat='teljes'** — egyházjogi szabály, nem opció (pót: „tanácskozási joggal" címke a jelenléti íven); selftest-mutáns: a régi (pót is számít) viselkedés bukjon |
| `getPresbyterNames` | aktív-szűrés + `!inner` join (fail-closed, több-gyülekezetes olvasónál ne duzzadjon „Ismeretlen" sorokkal) |
| Jelenléti ív szerep-képzés | személyenként EGY sor, kompozit címke (funkció > fokozat); bizottsági tagság presbiteri ülésen nem jelenik meg |
| Éves jelentés VII + lelkészi jelentés III.9 | aktív presbiterek; III.9 auto-töltés BEKÖTÉSE (ma üresen áll) |
| Web-dashboard „Presbiterek" csempe | aktív-szűrés |
| Desktop-dashboard | ma a `szemely.member_status='presbiter'`-ből számol (HARMADIK igazságforrás!) — átáll a presbiter táblára |
| `public_site_stats` presbiter-darabszám RPC | aktív+teljes szűrés (különben a weboldal száma elszakad a fültől) |
| Körzetkezelés (deleteDistrict, usage, auto-varázsló) | a hibrid miatt NEM törik — csak aktív-szűrés pontosítás |
| `PROFILE_PRESBYTERS` import | új oszlopok: Fokozat, Funkció, Mandátum kezdete/vége |
| Offline (Dexie + Excel „Presbiterek" lap) | a presbiter-lap megkapja az új oszlopokat; a `tisztsegek` v1-ben **online-only** (kimondva — 8. döntés) |
| GDPR-export, tábla-cím szótár, betekintés-napló, Kuka-címkék, teszt-seed/teardown | `tisztsegek`-lábak mindenhova |

---

## 3. Felület

- A tagnyilvántartás „Presbiterek" füle → **„Tisztségek"**, benne **3 al-fül**
  (mobile-first: az 5 al-fül 375 px-en két egymásba ágyazott csonkolódó fül-sort adna):
  1. **Presbitérium** — fokozat (teljes/pót/tb.), funkció-badge (főgondnok/gondnok),
     körzet, **mandátum-oszlop 4-állapotú badge-dzsel** (zöld él · sárga <6 hónap ·
     piros lejárt · szürke nincs megadva), egység-szűrő társegyházközségnél,
     kánoni létszám-őr (figyelmeztető sáv, ha az aktív teljes létszám <4 vagy >36);
  2. **Bizottságok** — a 3 bizottság egymás alatti szekcióként, elnök kiemelve
     (3–7 fős listákhoz nem jár külön-külön fül);
  3. **Egyéb tisztségek** — kántor (hivatásos/önkéntes), diakónus, nőszövetségi elnök,
     IKE-elnök, önkéntesek, egyházmegyei küldött.
- **Backfill-banner** az élesítés után: „Mikor volt az utolsó presbiterválasztás?" —
  egy dátummal tömegesen töltődik a kezdete + a ciklusból számolt vége (soronként
  felülírható). Enélkül a mandátum-kijelzés — a kör fő célja — üresen indulna.
- **„Új presbiteri ciklus" varázsló**: minden aktív sor lezárása → névsor-kijelölés
  (meglévők pipával + új személyek) → fokozat/funkció → vége automatikusan. 25 fős
  presbitériumnál e nélkül ~50 kézi művelet lenne 3 évente.
- Mentés-őr: két aktív főgondnok nem lehet („Már van aktív főgondnok: X — lezárod a
  mandátumát?").
- **Expiry-radar** integráció: mandátum-lejárat tétel a dashboard-radaron.
- Rögzítő dialógus: kódlistás tisztség-választó (a szabad Input megszűnik); kántornál
  hivatásos/önkéntes; nem-tag kántor esete: a rögzítő jelzi a megoldási utat.

---

## 4. Weboldal-publikálás

- **„Tisztségviselőink" szekció** a publikus oldalon: `public_sites.show_tisztsegek`
  kapcsoló + új RPC a bevált v2-minta TELJES fegyelmével (privát séma + wrapper,
  `search_path=''`, exact ACL: REVOKE mind a 6 szerepről, GRANT csak anon, marker-őr,
  slug-regex, LIMIT). **A kapu az RPC WHERE-ágában** (nem a UI-ban — az anon kulccsal az
  RPC közvetlenül is hívható!): `publikus ÉS aktív ÉS szemely.nev_publikalas_consent ÉS
  nem elhunyt ÉS látható ÉS gyülekezet-egyezés`. Kimenő oszlop: tisztség-címke + név,
  semmi más.
- **„Közelgő események" szekció**: `gyulekezeti_programok.publikus boolean DEFAULT false`
  + kapcsoló a program-dialógusban + `show_events` site-kapcsoló + RPC (cím, dátum, idő,
  helyszín — leírás/megjegyzés SOHA; időablak: ma → +90 nap, LIMIT).
- **Jogi szövegek**: adatkezelési tájékoztató bővül (tisztség/mandátum adatkör +
  „nyilvános weboldal-látogatók" címzett); a consent-visszavonás automatikusan leállítja
  a publikálást. (GDPR 9. cikk: az egyházi tisztség vallási meggyőződésre utaló adat —
  a hozzájárulás nem opcionális kényelem, hanem jogalap.)

---

## 5. Gyülekezeti naptár (feltöltés + a feltárt hibák)

| # | Teendő |
|---|---|
| D1 | **EGY ünnep-forrás** — a jelenlegi HÁROM hely (reformed-holidays.ts, annual-plan-print saját húsvét-számítása, ICS) egyetlen bővített, 12 ünnepes modulra áll át (+Húsvéthétfő, +Pünkösdhétfő, +Karácsony 2. napja, Virágvasárnap egységesen) |
| D2 | Ünnepek megjelenítése a KÉPERNYŐ-naptárban (overlay-badge) — ma csak nyomtatásban és ICS-ben látszanak |
| D3 | `ismetlodes_vege` oszlop + **'évi' ismétlődés-típus** (búcsú, hálaadás, VBH évente); a kibontó-logika a közös rétegbe (web+desktop EGY forrásból, 400-as plafon, teszttel); a desktop SQLite-tükör oszlop-átvezetésével együtt |
| D4 | `getProgramsForYear` lapozás (selectAllPaged — a limit nélküli query az 1000 soros néma plafon hibaosztálya) + a visszatekintő ablak kimondott döntéssé |
| D5 | **Naptár-feltöltés**: „Ünnepnapi alkalmak előtöltése" a tömeges rögzítőben (az év ünnepeihez istentisztelet-javaslatok) + `PROFILE_PROGRAMS` Excel/CSV import-profil + éves lista-előnézet az ellenőrzéshez |
| D6 | **ICS-feed adatvédelem**: alapértelmezetten MEGJEGYZÉS NÉLKÜLI feed, a teljes tartalom opt-in (a token Google/Apple szerverére szinkronizál — a temetési megjegyzés lelkigondozói adat lehet); token-visszavonás lehetősége |
| D7 | Sorozat „teljesítve" pipa: sorozatnál átmenetileg letiltva magyarázattal (a pipa ma az ÖSSZES előfordulást teljesítettnek mutatná); a sorozat-kivételek (egy alkalom törlése/áthelyezése) kimondottan KÜLÖN körre marad az átfogó időzóna-rendezéssel együtt |

Az ékezetes `"ismétlődő"` oszlopnév marad (az átnevezés kockázata nagyobb a hasznánál) —
dokumentált tudomásulvétel.

---

## 6. Bizonyítás (selftest-őrszemek, mutáns-negatívokkal)

kvórum (pót beleszámít → BUKIK) · RPC-consent (UI-only kapu mutáns → BUKIK) ·
ünnep-egyforrás (második húsvét-számítás megjelenése → BUKIK) · aktív-definíció
(jövőbeli kezdet publikálódik → BUKIK) · backfill-normalizálás sorrendje
(főgondnok→gondnok LIKE-csapda) · törlő-RPC tisztsegek-lába.

---

## 7. NYITOTT DÖNTÉSEK (Endre jóváhagyására)

1. **Architektúra**: a C-hibrid (presbiter-bővítés + külön tisztsegek tábla) mehet?
2. **Al-fülek**: a kért 4 helyett **3** (Presbitérium / Bizottságok / Egyéb) — mobilon
   ez a jó; a 3 bizottság a Bizottságok fülön belül szekciókként él. Elfogadod?
3. **Ciklus + kvórum**: 3 év alapértelmezés gyülekezetenként állíthatóan; kvórum = aktív
   TELJES értékű presbiterek (pót tanácskozási joggal); a lelkész hivatalbóli tagsága a
   kvórum-alapban: beleszámít-e?
4. **„Határidőnapló"-kijelölés**: úgy értjük, hogy a gyülekezeti PROGRAMNAPTÁR
   eseményein lesz „megjelenhet a weboldalon" kapcsoló (ilyen ma sehol nincs — most
   teremtjük meg). Így értetted?
5. **Név-publikálás**: személyenkénti hozzájárulás-pipa kötelező a weboldalra kerüléshez
   (GDPR 9. cikk). Vállaljátok a begyűjtését?
6. **Ünnepek**: overlay-ként jelenjenek meg a naptárban (javaslat), vagy valódi
   program-sorokként szúrjuk be őket?
7. **Desktop-átvezetés** (naptár-oszlopok + presbiter-szám forrás): ebben a körben vagy
   külön körben?
8. **Offline**: a nem-presbiteri tisztségek v1-ben online-only (a presbiter-lap
   offline marad, bővített oszlopokkal). Rendben?
