# Sírhelyek + Missziós Műhely + Értesítések — Üzleti szabályok

---

## 1. Jogosultságok

### Sírhelyek

| Művelet | Lelkész | Esperes | Admin | Master Admin |
|---------|:-------:|:-------:|:-----:|:------------:|
| Temető CRUD | ✅ saját gyül. | ✅ | ✅ | ✅ |
| Sírhely CRUD | ✅ | ✅ | ✅ | ✅ |
| Bérlet CRUD | ✅ | ✅ | ✅ | ✅ |
| Elhunyt CRUD | ✅ | ✅ | ✅ | ✅ |
| CSV export | ✅ | ✅ | ✅ | ✅ |

Nincs emelt jogosultság — teljes CRUD a saját gyülekezetén belül.

### Missziós Műhely

| Művelet | Lelkész | Esperes | Admin | Master Admin |
|---------|:-------:|:-------:|:-----:|:------------:|
| Segédanyag megtekintés | ✅ MINDENKI | ✅ | ✅ | ✅ |
| Segédanyag feltöltés | ✅ | ✅ | ✅ | ✅ |
| Segédanyag értékelés | ✅ | ✅ | ✅ | ✅ |
| Segédanyag törlés | saját ✅ | saját ✅ | saját ✅ | bárki ✅ |
| Ötlet benyújtás | ✅ | ✅ | ✅ | ✅ |
| Szavazás | ✅ | ✅ | ✅ | ✅ |
| Közös projekt részvétel | ✅ | ✅ | ✅ | ✅ |
| Ötlet törlés | saját ✅ | saját ✅ | saját ✅ | bárki ✅ |

A Missziós Műhely **gyülekezet-független** — minden lelkész lát MINDEN anyagot és ötletet, a saját gyülekezetétől függetlenül. Ez tudásmegosztó platform, nem gyülekezeti adatkezelés.

### Értesítések

| Művelet | Lelkész | Esperes | Admin | Master Admin |
|---------|:-------:|:-------:|:-----:|:------------:|
| Saját értesítések olvasás | ✅ | ✅ | ✅ | ✅ |
| Admin hozzáférés jóváhagyás | ❌ | ❌ | ❌ | ✅ (csak ha az ő gyülekezetébe kérik) |
| Admin hozzáférés elutasítás | ❌ | ❌ | ❌ | ✅ |

Minden felhasználó CSAK a saját értesítéseit látja (`user_id` szűrő).

---

## 2. Szabályok

### SÍRHELYEK

#### Sírhely állapotok

| Állapot | Jelentés |
|---------|---------|
| **szabad** | Üres, bérelhető |
| **foglalt** | Aktív bérleti szerződéssel rendelkezik |
| **lejárt** | A bérleti szerződés lejárt (25 év letelt) |
| **zárt** | Véglegesen lezárt (nem bérelhető tovább) |
| **fenntartott** | A gyülekezet által fenntartott (nem bérelhető) |

#### Bérleti szerződés

- Alapértelmezett bérleti időtartam: **25 év**
- A bérlő neve szabad szöveges (nem kell a tagnyilvántartásban lennie)
- Egy sírhelyhez **több** bérleti szerződés is tartozhat (időben egymás után)
- Egy sírhelyhez **több** elhunyt is tartozhat (családi sírhely)

#### Elhunyt regisztráció

- Az elhunyt NEM kell a tagnyilvántartásban legyen — szabad szöveges név
- A született és elhunyt dátum opcionális
- Egy elhunyt CSAK egy sírhelyhez tartozhat

### MISSZIÓS MŰHELY

#### Segédanyag típusok

Elfogadott formátumok: PDF, DOCX, PPTX, XLSX, ZIP, JPG, JPEG, PNG, WEBP, MP4, WEBM
Maximális fájlméret: **20 MB**

#### Értékelés rendszer

- 1–5 csillag
- Egy felhasználó egy anyagot **egyszer** értékelhet (de módosíthatja)
- Az átlagos pontszám az anyag kártyáján jelenik meg
- A letöltési szám automatikusan növekszik minden letöltéskor

#### Ötlet életciklus

| Státusz | Jelentés | Ki váltja ki |
|---------|---------|-------------|
| **piszkozat** | Vázlat, még nem publikus | Szerző |
| **uj** | Beküldve, látható | Szerző (beküldés) |
| **szavazas** | Szavazási időszak aktív | Automatikus (beküldéskor) |
| **kozos_munka** | Szavazás lezárult, közös projekt | Automatikus (határidő lejárt) |
| **megvalosult** | A projekt megvalósult | Szerző / Admin |
| **archivalt** | Archiválva (nem aktív) | Szerző / Admin |

#### Szavazás

- Egy felhasználó egy ötletre **egyszer** szavazhat (toggle: támogatás be/ki)
- A szavazási határidő (`szavazas_vege`) lejártakor az ötlet automatikusan `kozos_munka` státuszba lép
- Az automatikus lezárás az oldal betöltésekor fut (`checkSzavazasDeadlines`)

#### Közös projekt

- A szavazás után az ötlet közös projektté válik
- A projekthez **feladatok**, **mérföldkövek** és **dokumentumok** tartozhatnak
- Bárki csatlakozhat a projektcsapathoz (toggle)
- A feladatok és mérföldkövek teljesíthetők (toggle)

#### Gamifikáció — pont rendszer

| Esemény | Pont | Statisztika mező |
|---------|:----:|-----------------|
| Ötlet beküldve | 10 | otletek_szama |
| Ötlet továbbjutott (szavazáson átment) | 25 | elfogadott_otletek |
| Ötlet megvalósult | 50 | megvalosult_otletek |
| Szavazat adva | 2 | tamogatasok_adva |
| Csatlakozás projekthez | 5 | — |
| Hozzászólás | 3 | hozzaszolasok_szama |
| Segédanyag feltöltés | 8 | segedanyagok_feltoltve |
| 5 csillag kapott (anyagra) | 3 | — |
| Feladat teljesítve | 5 | feladatok_teljesitve |
| 50 letöltés elérve (anyag) | 15 | — (egyszeri) |
| Értékelés adva | 1 | ertekelesek_adva |

#### Gamifikáció — szint rendszer

| Szint | Név | Pont tartomány |
|:-----:|-----|:-------------:|
| 1 | Újonc | 0–49 |
| 2 | Szolgálattevő | 50–149 |
| 3 | Lelkes Misszionárius | 150–349 |
| 4 | Tapasztalt Munkatárs | 350–699 |
| 5 | Közösségépítő | 700–1199 |
| 6 | Missziói Bajnok | 1200+ |

#### Jelvények

- 12 jelvénytípus (a `mm_jelveny_tipusok` táblában definiálva)
- Automatikus odaítélés pont- és statisztika-küszöbök alapján
- Egy felhasználó egy jelvénytípust **egyszer** kaphat meg

### ÉRTESÍTÉSEK

#### Értesítés típusok

| Típus | Szín | Ikon | Mikor keletkezik |
|-------|------|------|-----------------|
| **info** | Kék | ℹ️ | Általános tájékoztatás |
| **success** | Zöld | ✅ | Sikeres művelet (pl. jóváhagyás) |
| **warning** | Sárga | ⚠️ | Figyelmeztetés |
| **danger** | Piros | 🔴 | Hiba, elutasítás |
| **support_reply** | Lila | 🎧 | Támogatási válasz |
| **registration** | — | — | Új regisztráció (Fázis 1-ben implementálva) |

#### Admin hozzáférés workflow

1. A Master Admin hozzáférést kér egy másik gyülekezet adataihoz
2. A célgyülekezet lelkésze értesítést kap
3. A lelkész **jóváhagyja** (approved + időkorlát) VAGY **elutasítja** (denied)
4. A Master Admin értesítést kap az eredményről

---

## 3. Validációk

### Sírhelyek

#### Temető
| Mező | Szabály |
|------|---------|
| Név | **Kötelező** |
| Helyszín | Opcionális |

#### Sírhely
| Mező | Szabály |
|------|---------|
| Temető | **Kötelező** (a meglévő temetőkből) |
| Parcella / sor / hely | Opcionális (szabad szöveg) |
| Állapot | **Kötelező** (5 közül) |

#### Bérlet
| Mező | Szabály |
|------|---------|
| Bérlő neve | **Kötelező** |
| Kezdet dátum | **Kötelező** |
| Vég dátum | **Kötelező** (alapértelmezés: kezdet + 25 év) |
| Összeg | Opcionális |

#### Elhunyt
| Mező | Szabály |
|------|---------|
| Név | **Kötelező** |
| Született / Elhunyt dátum | Opcionális |
| Temetés dátuma | Opcionális |

### Missziós Műhely

#### Segédanyag
| Mező | Szabály |
|------|---------|
| Cím | **Kötelező** |
| Fájl | **Kötelező** (max 20 MB, engedélyezett formátumok) |
| Kategória | Minimum 1 **kötelező** |
| Leírás | Opcionális |

#### Ötlet
| Mező | Szabály |
|------|---------|
| Cím | **Kötelező** |
| Leírás | **Kötelező** |
| Kategória | Minimum 1 **kötelező** |
| Szavazási határidő | Opcionális (de ajánlott) |

### Iktatás (Értesítések)

Értesítés létrehozás (belső — más modulokból):
| Mező | Szabály |
|------|---------|
| user_id | **Kötelező** (a címzett) |
| tipus | **Kötelező** (info/success/warning/danger/support_reply) |
| cim | **Kötelező** |
| uzenet | **Kötelező** |

---

## 4. Korlátozások

### Sírhelyek
- Soft delete (deleted flag) — a temető, sírhely, bérlet, elhunyt nem törlődik fizikailag
- Egy elhunyt csak egy sírhelyhez tartozhat
- A bérleti időtartam nem korlátozza a rendszert — lejárt bérlet esetén a sírhely „lejárt" állapotba kerül

### Missziós Műhely
- Fájl méret: max **20 MB**
- Fájl típusok: whitelist (PDF, DOCX, PPTX, XLSX, ZIP, képek, videó)
- Egy felhasználó egy anyagot egyszer értékelhet
- Egy felhasználó egy ötletre egyszer szavazhat
- Egy jelvénytípust egyszer kaphat meg
- A R2 feltöltés a Next.js-ben **Server Action-ön** keresztül kell menjen (biztonsági okokból)

### Értesítések
- Csak a saját értesítések láthatók
- Az admin hozzáférés jóváhagyás/elutasítás CSAK a Master Admin számára elérhető

---

## 5. Workflow szabályok

### Sírhely parcella kezelés

```
1. Lelkész létrehoz egy temetőt (név + helyszín)
2. A temetőhöz sírhelyeket ad hozzá (parcella/sor/hely + állapot)
3. Ha „foglalt" → bérleti szerződés rögzítés (bérlő + kezdet + vég + összeg)
4. Ha elhunyt van → elhunyt regisztráció (név + dátumok)
5. A sírhely kártyáján/sorában inline megjelenik az összes bérlet és elhunyt
6. Ha a bérlet lejár (25 év) → az állapot manuálisan „lejárt"-ra állítható
```

### Segédanyag feltöltés

```
1. Lelkész a „Feltöltés" gombra kattint
2. Kitölti: cím, leírás, kategóriák (chip-ek), fájl kiválasztás
3. A rendszer ellenőrzi: fájlméret ≤ 20 MB, formátum engedélyezett
4. Feltöltés Cloudflare R2-re (Server Action-ön keresztül)
5. A rekord mentődik: mm_segedanyagok + mm_segedanyag_kategoriak
6. Gamifikáció: +8 pont „segédanyag feltöltés"
```

### Ötlet életciklus

```
1. Lelkész létrehoz egy ötletet (4 lépéses wizard)
2. Az ötlet „szavazás" státuszba kerül (ha van szavazási határidő)
3. Más lelkészek szavaznak (támogatás be/ki)
4. A határidő lejár → az ötlet automatikusan „közös munka" státuszba lép
5. A projektcsapat feladatokat, mérföldköveket, dokumentumokat kezel
6. A projekt megvalósul → a szerző „megvalósult" státuszba lépteti
7. Gamifikáció pontok minden lépésnél
```

### Értesítés workflow (admin hozzáférés)

```
1. Master Admin hozzáférést kér (admin_access_requests INSERT)
2. A célgyülekezet lelkésze értesítést kap (ertesitesek INSERT)
3. A lelkész megnyitja az értesítést → „Jóváhagyás" / „Elutasítás" gombok
4. Jóváhagyás → admin_access_requests.status = 'approved' + időkorlát
5. VAGY Elutasítás → admin_access_requests.status = 'denied'
6. A Master Admin értesítést kap az eredményről
```

---

## 6. Edge case-ek

### Sírhelyek

| Eset | Mi történik |
|------|-------------|
| Temető törlés: vannak sírhelyei | A temető soft-delete-elődik, a sírhelyek megmaradnak (de a szűrőből eltűnik) |
| Sírhely törlés: vannak bérletek + elhunytak | A sírhely soft-delete, a bérletek és elhunytak megmaradnak az adatbázisban |
| Bérlet lejárt de nem módosítják az állapotot | A rendszer NEM módosítja automatikusan — manuális lépés szükséges |
| Két elhunyt ugyanazzal a névvel | Megengedett (nincs egyediség ellenőrzés) |
| CSV export: nincs sírhely | „Nincs exportálható adat" figyelmeztetés |

### Missziós Műhely

| Eset | Mi történik |
|------|-------------|
| Fájl méret > 20 MB | Feltöltés BLOKKOLVA — hibaüzenet |
| Nem engedélyezett fájl formátum | Feltöltés BLOKKOLVA |
| R2 Worker nem elérhető | Hiba üzenet, a rekord NEM mentődik |
| Értékelés: már értékelt anyag | A korábbi értékelés MÓDOSUL (nem duplikálódik) |
| Szavazás: a határidő lejárt de az oldal nincs frissítve | A legközelebbi oldalbetöltésnél az auto-check lezárja |
| Ötlet törlés: vannak szavazatok + kommentek | Az ötlet törlődik, a kapcsolt adatok NEM kaszkádolnak |
| Közös munka: nincs csapattag | Megengedett — a projekt „üres" marad |
| Gamifikáció: a felhasználónak nincs statisztika rekordja | Automatikus létrehozás az első pont-szerzésnél |
| Jelvény: már megkapta | NEM duplikálódik (egyedi user+badge pár) |

### Értesítések

| Eset | Mi történik |
|------|-------------|
| 20-nál több olvasatlan értesítés | Csak az utolsó 20 jelenik meg a listában |
| Realtime csatorna megszakad | Csendben reconnect — a felhasználó nem veszi észre |
| Admin hozzáférés: a kérelem nem létezik | Hiba üzenet |
| Admin hozzáférés: a kérelem már elbírált | A gombok nem jelennek meg (csak az eredmény) |
| PWA install: már telepítve | A banner NEM jelenik meg |
| Értesítés: üres üzenet | Validáció blokkolja (cim + uzenet kötelező) |
