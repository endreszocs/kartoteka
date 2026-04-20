# Sírhelyek + Missziós Műhely + Értesítések — Elemzés

**Fázis 7 — három különálló modul**

| Modul | Forrás | Sor | Tábla | Függvény |
|-------|--------|:---:|:-----:|:--------:|
| Sírhelyek | `sirhely_api.js` | 729 | 4 | 28 |
| Missziós Műhely | `misszios_muhely_*.js` (4 fájl) + `r2_config.js` | 4333 | 14 | 76 |
| Értesítések | `notifications.js` | 590 | 2 | 7 |
| **Összesen** | **7 fájl** | **5652** | | **111** |

---

## 1. Modul célja

### Sírhelyek
A gyülekezet temetőinek nyilvántartása: sírhely parcellák, bérleti szerződések (25 éves ciklus), elhunyt személyek sírhelyhez rendelése, státuszkezelés. Exportálható CSV formátumban.

### Missziós Műhely
Lelkészek közötti tudásmegosztó platform: segédanyagok feltöltése/értékelése/letöltése, ötletek benyújtása és szavazás, közös projektek (feladatok + mérföldkövek + dokumentumok), gamifikáció (6 szint, 11 pontszabály, jelvények). Két nézet: dashboard (füleken belül a Kartotéka oldalon) és önálló oldal (Sziget — külön URL, saját design).

### Értesítések
Valós idejű értesítési rendszer: értesítés csengő + lista + részletes modal, Supabase Realtime csatorna, admin hozzáférés jóváhagyás/elutasítás workflow, PWA install prompt.

---

## 2. Fő funkciók

### 2.1. Sírhelyek

- **Temető CRUD** — név, helyszín, megjegyzés
- **Sírhely CRUD** — parcella szám, sor, hely, állapot (szabad/foglalt/lejárt/zárt/fenntartott)
- **Bérleti kezelés** — bérlő neve, kezdet/vég (25 év), összeg
- **Elhunyt regisztráció** — név, született, elhunyt, temetés dátuma, sírhely-hozzárendelés
- **Nézet váltás** — táblázat VAGY kártya nézet
- **Szűrés** — temető + állapot
- **Statisztika** — összesen, szabad, foglalt, lejárt
- **CSV export**

### 2.2. Missziós Műhely

#### Segédanyagok
- **Feltöltés** — fájl (PDF/DOCX/PPTX/XLSX/kép/videó) Cloudflare R2-re, kategória, leírás
- **Értékelés** — 1–5 csillag, átlagszámítás
- **Letöltés** — számlálóval
- **Kategória szűrés**
- **Keresés**

#### Ötletek és szavazás
- **Ötlet létrehozás** — 4 lépéses wizard (cím → leírás → kategóriák → szavazási határidő)
- **Ötlet életciklus:** piszkozat → új → szavazás → közös munka → megvalósult → archivált
- **Szavazás** — támogatás (like/unlike), automatikus lezárás a határidő lejártakor
- **Közös projekt** — feladatok, mérföldkövek, dokumentumok, csapat
- **Kommentek**

#### Gamifikáció
- **6 szint:** Újonc (0) → Szolgálattevő (50) → Lelkes Misszionárius (150) → Tapasztalt Munkatárs (350) → Közösségépítő (700) → Missziói Bajnok (1200+)
- **11 pont-szabály:** ötlet beküldve (10), továbbjutott (25), megvalósult (50), szavazat (2), csatlakozás (5), hozzászólás (3), segédanyag feltöltés (8), 5 csillag kapott (3), feladat teljesítve (5), 50 letöltés (15), értékelés adva (1)
- **Jelvények** — 12 típus, automatikus odaítélés

### 2.3. Értesítések

- **Lista** — utolsó 20 olvasatlan, típusonként ikon/szín
- **Részletek** — modal teljes tartalommal
- **Realtime** — Supabase Realtime csatorna (INSERT figyelés)
- **Toast** — új értesítésnél felugró toast
- **Admin hozzáférés** — jóváhagyás/elutasítás workflow (`admin_access_requests`)
- **PWA** — telepítési prompt, offline/online indikátor

---

## 3. Használt adatok

### Sírhelyek

| Tábla | Művelet |
|-------|---------|
| `sirhelytemeto` | CRUD (temetők) |
| `sirhely` | CRUD (parcellák) |
| `sirhelyberles` | CRUD (bérletek) |
| `sirhelyelhunyt` | CRUD (elhunyt személyek) |

### Missziós Műhely

| Tábla | Művelet |
|-------|---------|
| `mm_kategoriak` | SELECT |
| `mm_segedanyagok` | CRUD |
| `mm_segedanyag_kategoriak` | INSERT, DELETE (junction) |
| `mm_segedanyag_ertekelesek` | INSERT, UPDATE |
| `mm_otletek` | CRUD |
| `mm_szavazatok` | INSERT, DELETE |
| `mm_hozzaszolasok` | INSERT |
| `mm_feladatok` | CRUD |
| `mm_merfoldkovek` | CRUD |
| `mm_dokumentumok` | INSERT |
| `mm_jelveny_tipusok` | SELECT |
| `mm_felhasznalo_statisztika` | SELECT, UPSERT |
| `mm_felhasznalo_jelveny` | SELECT, INSERT |
| `ertesitesek` | INSERT (értesítés küldés) |

### Értesítések

| Tábla | Művelet |
|-------|---------|
| `ertesitesek` | SELECT, UPDATE (olvasott jelölés) |
| `admin_access_requests` | SELECT, UPDATE (jóváhagyás/elutasítás) |

### Cloudflare R2 tároló

| Konfig | Érték |
|--------|-------|
| Worker URL | `kartoteka-r2.endreszocs.workers.dev` |
| Max fájl | 20 MB |
| Engedélyezett: | PDF, DOCX, PPTX, XLSX, ZIP, JPG, PNG, WEBP, MP4, WEBM |

---

## 4. Függvények listája

### Sírhelyek (28 db)
| Kategória | Függvények |
|-----------|-----------|
| Temető | `loadTemetok`, `openTemetoModal`, `saveTemeto`, `editTemeto`, `deleteTemeto` |
| Sírhely | `loadSirhelyek`, `openSirhelyModal`, `saveSirhely`, `deleteSirhely`, `setSirhelyView` |
| Bérlet | `openBerlesModal`, `saveBerles`, `deleteBerles` |
| Elhunyt | `openElhunytModal`, `saveElhunyt`, `deleteElhunyt` |
| Segéd | `exportSirhelyek`, `_applyFilters`, `_updateSirhelyStats` |

### Missziós Műhely (76 db — kulcsok)
| Kategória | Függvények |
|-----------|-----------|
| Segédanyag | `loadSegedanyagok`, `handleSegedanyagSubmit`, `rateSegedanyag`, `incrementLetoltes`, `deleteSegedanyag` |
| Ötlet | `loadOtletek`, `handleOtletSubmit`, `toggleTamogatas`, `toggleCsatlakozas`, `submitHozzaszolas`, `markAsMegvalosult` |
| Közös munka | `openKozosMunka`, `addFeladat`, `toggleFeladatStatus`, `addMerfoldko`, `toggleMerfoldko`, `uploadDokumentum` |
| Gamifikáció | `addPoints`, `getSzintInfo`, `openJelvenyModal` |

### Értesítések (7 db)
| Függvény | Leírás |
|----------|--------|
| `loadNotifications` | Utolsó 20 olvasatlan betöltés |
| `openNotificationDetail` | Részletes modal |
| `markAsRead` | Olvasottnak jelölés |
| `_setupRealtimeNotifications` | Supabase Realtime csatorna |
| `_showRealtimeToast` | Toast új értesítésnél |
| `approveAdminAccess` | Admin hozzáférés jóváhagyás |
| `denyAdminAccess` | Admin hozzáférés elutasítás |

---

## 5. Függőségek

| Könyvtár | Modul | Használat |
|----------|-------|-----------|
| Cloudflare R2 (Worker) | Missziós Műhely | Fájl feltöltés |
| Supabase Realtime | Értesítések | Valós idejű értesítés |
| Bootstrap 5 | Mind | Modal-ok |

---

## 6. Állapotkezelés

### Sírhelyek
| Változó | Tartalom |
|---------|----------|
| `_sirhelyView` | `'table'` vagy `'cards'` |
| `_temetok` | Temetők listája |
| `_sirhelyek` | Sírhely parcellák |
| `_berlesekMap` | sirhelyId → bérletek |
| `_elhunytakMap` | sirhelyId → elhunytak |

### Missziós Műhely
| Változó | Tartalom |
|---------|----------|
| `_user` | Bejelentkezett felhasználó (id, név, gyülekezet, szerep) |
| `_kategoriak` | Kategóriák listája |
| `_segedanyagok` / `_filteredSeg` | Segédanyagok (összes / szűrt) |
| `_otletek` / `_filteredOtletek` | Ötletek (összes / szűrt) |
| `_wizardStep` | Ötlet wizard aktuális lépés |
| `_myStats` / `_myJelvenyek` | Gamifikáció: pontok + jelvények |

### Értesítések
| Változó | Tartalom |
|---------|----------|
| `_notificationCache` | id → értesítés adat |
| `_notifRealtimeChannel` | Supabase Realtime csatorna |

---

## 7. UI kapcsolatok

### Sírhelyek
- Temető szűrő dropdown + állapot szűrő
- Nézet váltó: táblázat ↔ kártya
- Statisztika kártyák (szabad/foglalt/lejárt)
- 4 modal: temető, sírhely (bérletek + elhunytak inline), bérlet, elhunyt

### Missziós Műhely (Dashboard)
- 4 fül: Segédanyagok, Ötletek, Közös munka, Ranglista
- 6 modal: segédanyag upload/detail, ötlet wizard/detail, közös munka workspace, jelvények

### Missziós Műhely (Sziget)
- Önálló oldal, saját CSS, Font Awesome
- Szekciók: hero banner + kategória grid + anyagok + ötletek + keresés + jelvények

### Értesítések
- Csengő ikon a header-ben (olvasatlan szám badge)
- Dropdown lista (utolsó 20)
- Részletes modal
- Toast (új értesítésnél)

---

## 8. Hibakezelés

| Modul | Helyzet | Viselkedés |
|-------|---------|-----------|
| Sírhelyek | Soft delete | `deleted = true`, nem jelenik meg |
| Missziós Műhely | R2 feltöltés hiba | Alert üzenet, a rekord nem mentődik |
| Missziós Műhely | Szavazási határidő lejárt | Automatikus lezárás (`checkSzavazasDeadlines`) |
| Értesítések | Realtime csatorna hiba | Csendben reconnect |
| Értesítések | Admin hozzáférés: nincs kérelem | Hiba üzenet |

---

## 9. Rejtett működés

### Sírhelyek — kettős map
Az elhunytak és bérletek nem külön lekérdezésben töltődnek, hanem a sírhely betöltésekor `sirhelyId → elhunyt[]` és `sirhelyId → berles[]` map-ek épülnek. Ez lehetővé teszi, hogy a sírhely kártyán/sorban inline megjelenjen az összes elhunyt és bérleti adat.

### Missziós Műhely — ötlet életciklus automata
A `checkSzavazasDeadlines()` függvény automatikusan átvizsgálja a szavazási határidőket és a lejártakat `kozos_munka` státuszba lépteti. Ez a Cron-jellegű ellenőrzés oldalbetöltéskor fut.

### Missziós Műhely — gamifikáció pont rendszer
Az `addPoints()` minden pont-szerzési eseménynél meghívódik (ötlet, szavazat, hozzászólás, feltöltés, stb.), és automatikusan frissíti:
1. A `mm_felhasznalo_statisztika` tábla megfelelő oszlopát
2. A `pont` összesítést
3. Ellenőrzi, hogy jár-e új jelvény → ha igen, INSERT `mm_felhasznalo_jelveny`

### Értesítések — Realtime csatorna
A `_setupRealtimeNotifications()` a Supabase Realtime API-t használja: `SUBSCRIBE` az `ertesitesek` tábla INSERT eseményeire, szűrve a bejelentkezett user ID-jára. Új értesítésnél toast jelenik meg és a badge szám frissül.

### R2 feltöltés — auth secret
A Cloudflare Worker egy shared secret-tel hitelesíti a feltöltéseket. Ez kliens-oldali kódban van — biztonsági kockázat. A Next.js migrációban a feltöltésnek Server Action-ön keresztül kellene mennie.
