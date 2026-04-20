# Core modul — Auth, Session, Layout, Profil, Gyülekezet

## 1. Modul célja

A Core modul biztosítja a rendszer alapvető működését: ki van bejelentkezve, milyen jogokkal, melyik gyülekezet adatait látja, és hogyan néz ki az oldal kerete (sidebar, header). **Minden más modul erre épül — ez az alap.**

---

## 2. Részelemek és felelősségeik

### 2.1 supabase_config.js (58 sor)

**Felelősség:** Supabase kliens inicializálás + Auth Guard + Service Worker regisztráció

**Három egymástól független feladatot lát el:**

| Feladat | Leírás |
| ------- | ------ |
| Kliens init | `window._supabase = supabase.createClient(URL, ANON_KEY)` — globális kliens |
| Auth Guard | `/pages/` alatti oldalakon: ha nincs session → redirect `../index.html` |
| SW regisztráció | Service Worker regisztrálása a scope: '/' értékkel |

**Állapotkezelés:**
- `window._supabase` — globális, az ÖSSZES modul ezen keresztül éri el a DB-t
- `SUPABASE_URL` és `SUPABASE_ANON_KEY` — hardcoded konstansok

**Auth Guard logika:**
1. `getSession()` hívás → ha nincs session → redirect
2. `onAuthStateChange('SIGNED_OUT')` → redirect (ha másik lapon kijelentkezik)
3. Az `index.html` ki van véve (login oldal)

**Edge case-ek:**
- Ha a Supabase CDN nem töltődik be → `console.error` de nincs fallback
- Ha a session lejárt de a token refresh sikeres → nem redirectel (helyes)
- Ha a hálózat offline → `catch` ág redirectel (HELYTELEN — offline módban ne redirecteljen!)

**Biztonsági megjegyzések:**
- ANON_KEY nyilvános (szándékos) — a biztonság az RLS-re épül
- Nincs service_role kulcs kliensoldali kódban (helyes)

---

### 2.2 session_cache.js (112 sor)

**Felelősség:** Felhasználói profil és gyülekezet adatainak cache-elése sessionStorage-ban

**Három publikus függvény:**

| Függvény | Visszatérés | Cache TTL |
| -------- | ----------- | --------- |
| `getCachedProfile()` | `{id, full_name, role, congregation_id, email, user_id}` | 5 perc |
| `getCachedCongregationName(id)` | `string` (gyülekezet neve) | Session végéig |
| `invalidateProfileCache()` | void | — (cache törlés) |

**Adatfolyam (getCachedProfile):**
1. sessionStorage ellenőrzés (`krt_profile` kulcs)
2. Ha van és < 5 perc → return cached
3. Ha nincs → `auth.getUser()` + `profiles.select()` → cache írás
4. Admin override ellenőrzés (lásd alább)

**Admin override mechanizmus (kritikus üzleti logika):**
- Ha `sessionStorage.admin_override_congregation` létezik ÉS a user `endreszocs@gmail.com`
- Ellenőrzi: van-e `admin_access_requests` tábla bejegyzés ahol `status='approved'` ÉS `expires_at > now()`
- Ha van → `congregation_id` felülírás a profil objektumban
- Ha nincs → override törlés + figyelmeztetés
- **Ez lehetővé teszi, hogy a rendszergazda más gyülekezet adatait lássa — de csak engedéllyel!**

**Edge case-ek:**
- Ha a profil cache sérült (érvénytelen JSON) → try/catch, újra lekérdez
- Ha a sessionStorage tele van (quota exceeded) → silent fail, nem cache-el
- A `getCachedCongregationName` nincs TTL-lel védve — session végéig cache-el (elfogadható)

---

### 2.3 auth_roles.js (259 sor)

**Felelősség:** Szerepkör-alapú UI vezérlés + God Mode + Admin override banner

**Három logikai blokk:**

#### A) Sidebar szerepkör-kezelés (applySidebarRoles)

**Jogosultsági hierarchia (alulról felfelé):**

| Szint | Szerepkör (`role`) | Látható menüelemek |
| ----- | ------------------ | ------------------ |
| 1 | `lelkesz` | Gyülekezeti modulok (ha van congregation_id) |
| 2 | `esperes` / `egyhazmegyei_admin` | + Egyházmegyei dashboard |
| 3 | `admin` | + Kerületi dashboard |
| 4 | Master admin (email check) | + Admin panel, God Mode |

**Master admin azonosítás:** `profile.email === 'endreszocs@gmail.com'` — 7 helyen hardcoded!

**UI elrejtés módszere:** `d-none` CSS osztály hozzáadása/eltávolítása DOM elemeken. A menüelemek a HTML-ben `d-none`-nal vannak alapból elrejtve, és csak a megfelelő jogkör esetén jelennek meg.

#### B) God Mode (szuperadmin)

| Paraméter | Érték |
| --------- | ----- |
| PIN kód | `"1517"` (hardcoded!) |
| Időtartam | 2 óra |
| Tárolás | `sessionStorage.god_mode_expiry` (timestamp) |
| Figyelmeztetés | 1 perc a lejárat előtt (modal) |
| Extra funkciók | Tömeges import, nem-ellenőrzés, admin felület |

**God Mode aktiválás folyamata:**
1. Header-ben rejtett gomb → modal megnyitás
2. PIN bevitel → egyezés ellenőrzés → `sessionStorage` mentés
3. UI változások: piros fejléc, figyelmeztető banner, extra gombok
4. Lazy script betöltés: `mass_import_api.js` + `superadmin_import_api.js`
5. 2 óra után automatikus deaktiválás + oldal újratöltés

#### C) Admin Override Banner

- Ha a rendszergazda más gyülekezet adatait nézi → piros banner a lap tetején
- Mutatja: gyülekezet nevét + hátralévő perceket
- "Kilépés" gomb → override törlés + redirect admin oldalra
- **Biztonsági ellenőrzés:** minden oldalbetöltésnél ellenőrzi az `admin_access_requests` táblát

**Függvények listája:**

| Függvény | Scope | Leírás |
| -------- | ----- | ------ |
| `applySidebarRoles()` | modul | Sidebar menü elemek elrejtése/megjelenítése szerepkör alapján |
| `initHeaderData()` | modul | Fejléc kitöltése (név, gyülekezet) — DUPLIKÁCIÓ a congregation_api.js-sel! |
| `signOut()` | modul | Kijelentkezés + redirect |
| `window.openGodModeModal()` | globális | God Mode PIN modal megnyitása |
| `window.activateGodMode()` | globális | PIN ellenőrzés + God Mode aktiválás |
| `window.deactivateGodMode()` | globális | God Mode deaktiválás + oldal újratöltés |
| `window.applyGodModeUI()` | globális | God Mode UI változások (banner, gombok) |
| `window.startGodModeTimer()` | globális | 2 órás visszaszámláló indítása |
| `window.exitAdminOverride()` | globális | Admin override kilépés |
| `_loadMassImportGlobally()` | privát | Lazy script betöltés God Mode-hoz |
| `_showAdminOverrideBanner()` | privát | Admin override banner DOM injektálás |

---

### 2.4 profile_api.js (65 sor)

**Felelősség:** Felhasználói profil megnyitása és mentése

| Függvény | Leírás |
| -------- | ------ |
| `openProfileModal()` | Profil adatok betöltése → modal megnyitás |
| `saveProfileData(e)` | Profil mentés → profiles tábla + auth metadata frissítés |

**Mentett mezők:** `full_name`, `birth_date`
**Nem módosítható:** email (csak megjelenítés)

**Edge case-ek:**
- `auth.getUser()` hívás — NEM használja a session cache-t (redundáns API hívás!)
- `upsert` használata — ha nincs profil sor, létrehozza (robusztus)
- Mentés után `initHeaderData()` hívás — frissíti a fejlécet cache nélkül

---

### 2.5 congregation_api.js (174 sor)

**Felelősség:** Gyülekezet adatok betöltése, szerkesztése + Header inicializálás

**DUPLIKÁCIÓ:** Az `initHeaderData()` függvény ITT is és az `auth_roles.js`-ben is definiálva van! A congregation_api.js verzió a részletesebb (monogram, avatar, címer). A `DOMContentLoaded` event listener is itt van (174. sor), ami 800ms késleltetéssel hívja.

| Függvény | Scope | Leírás |
| -------- | ----- | ------ |
| `initHeaderData()` | modul | Header kitöltés: név, monogram, avatar, gyülekezet név/címer |
| `window.openCongregationModal()` | globális | Gyülekezet szerkesztő modal megnyitása + adatok betöltése |
| `saveCongregationData(e)` | modul | Gyülekezet mentés (15+ mező, címer feltöltés, egyházmegye dropdown) |
| `window.openCongregationPenzugyTab()` | globális | Gyülekezet modal megnyitása pénzügyi fülön |

**Gyülekezet mentett mezők:**
- Alapadatok: `nev_hu`, `nev_ro`, `nev_en`, `adoszam`, `cim`, `email`, `telefon`, `web`
- Pénzügyi: `eves_jarulek`, `jarulek_kedvezmenyes`, `jarulek_hatarid`, `iban`, `bank`, `tartozas_szamitas_mod`
- Szervezeti: `diocese_id`, `egyhazmegye`
- Vizuális: `cimer_url` (Supabase Storage feltöltés)

**Edge case-ek:**
- Ha a `tartozas_szamitas_mod` oszlop nem létezik → retry mechanizmus (delete mező + újra mentés)
- Címer feltöltés: Supabase Storage `logos` bucket → publicUrl generálás
- Ha nincs `congregation_id` → "Várakozás a SzuperAdmin jóváhagyására..." üzenet

---

### 2.6 component_cache.js (57 sor)

**Felelősség:** HTML komponensek (sidebar, header, modálok) cache-elése sessionStorage-ban

| Függvény | Leírás |
| -------- | ------ |
| `window.fetchComponent(url)` | HTML betöltés cache-ből vagy fetch-csel |
| `window.lazyLoadModal(url, placeholderId)` | Modal lazy betöltés (csak első megnyitáskor) |

**Cache invalidáció:** `COMP_VERSION` konstans (`'2026.04.04e'`). Ha változik → összes `krt_comp_*` kulcs törlése sessionStorage-ból.

**A MIGRÁCIÓ SZEMPONTJÁBÓL EZ A MODUL ELTŰNIK** — Next.js-ben a komponensek React komponensek, nincs szükség HTML fetch-re.

---

### 2.7 index.html — Login/Splash oldal

**Felelősség:** Bejelentkezés, regisztráció, jelszó reset, OAuth, splash screen

**Négy nézet (view-section):**

| Nézet ID | Tartalom |
| -------- | -------- |
| `view-login` | E-mail + jelszó bejelentkezés + Google/Apple OAuth gombok |
| `view-register` | Lelkészi regisztráció (név, telefon, gyülekezet, email, jelszó, feltételek elfogadás) |
| `view-forgot` | Jelszó visszaállítás (email → reset link) |
| `view-oauth-profile` | OAuth után kiegészítő adatbekérés (név, telefon, gyülekezet) |

**Splash screen:**
- 3.5 mp animáció → fade-out → login nézet
- SessionStorage flag → második betöltésnél kihagyja
- Háttér: református templom fotó (church-bg.jpg, 275 KB)

**Bejelentkezés utáni routing:**

```
Bejelentkezés sikeres
  ├── isMaster VAGY isActive?
  │     ├── hasCongregation → /pages/dashboard.html
  │     ├── isMaster VAGY admin → /pages/dashboard_kerulet.html
  │     ├── esperes → /pages/dashboard_egyhazmegye.html
  │     └── egyéb → /pages/dashboard.html
  └── NEM aktív
        └── signOut() + "Fiókja jóváhagyásra vár"
```

**OAuth callback flow:**
1. Oldal betöltéskor 500ms késleltetéssel `handleOAuthCallback()`
2. `getSession()` → ha van session → profil ellenőrzés
3. Ha nincs profil → kiegészítő adatbekérés (view-oauth-profile)
4. Ha van profil → routing (mint fent)
5. Ha `pending` → signOut + figyelmeztetés

**Disabled providerek:** `['apple']` — Apple gombra kattintva barátságos üzenet

---

## 3. Használt adatbázis táblák

| Tábla | Művelet | Melyik fájl |
| ----- | ------- | ----------- |
| `profiles` | SELECT, INSERT, UPSERT | session_cache, profile_api, index.html |
| `congregations` | SELECT, UPDATE | congregation_api, session_cache |
| `dioceses` | SELECT | congregation_api |
| `admin_access_requests` | SELECT | session_cache, auth_roles |
| `auth.users` | getUser, signIn, signUp, signOut, resetPassword, OAuth | supabase_config, index.html |
| Supabase Storage (`logos` bucket) | UPLOAD | congregation_api |

---

## 4. Globális változók és állapot

| Változó | Típus | Leírás |
| ------- | ----- | ------ |
| `window._supabase` | Supabase Client | A rendszer egyetlen DB kapcsolata |
| `window.getCachedProfile` | async function | Profil lekérdezés cache-ből |
| `window.getCachedCongregationName` | async function | Gyülekezet név lekérdezés |
| `window.invalidateProfileCache` | function | Cache törlés |
| `window.fetchComponent` | function | HTML cache betöltés |
| `window.lazyLoadModal` | function | Modal lazy load |
| `sessionStorage.krt_profile` | JSON string | Profil cache (5 perc TTL) |
| `sessionStorage.krt_comp_*` | string | Komponens HTML cache |
| `sessionStorage.god_mode_expiry` | timestamp | God Mode lejárat |
| `sessionStorage.admin_override_congregation` | JSON | Admin gyülekezet-váltás |
| `sessionStorage.kartoteka_splash_done` | flag | Splash screen egyszeri megjelenítés |

---

## 5. Függőségi térkép

```
index.html
  └── supabase_config.js (kliens init — NEM auth guard mert login oldal)

Bármely /pages/*.html oldal:
  └── common.min.js
        ├── supabase_config.js → window._supabase + Auth Guard + SW
        ├── component_cache.js → fetchComponent, lazyLoadModal
        ├── session_cache.js → getCachedProfile (függ: _supabase)
        ├── auth_roles.js → applySidebarRoles (függ: getCachedProfile)
        ├── profile_api.js → openProfileModal (függ: _supabase)
        ├── congregation_api.js → initHeaderData (függ: getCachedProfile, _supabase)
        └── [többi modul...]
```

---

## 6. Hibakezelés

| Helyzet | Jelenlegi kezelés | Megjegyzés |
| ------- | ----------------- | ---------- |
| Supabase CDN nem töltődik be | `console.error` | Nincs UI fallback — fehér képernyő |
| Session lejárt | Redirect index.html | Helyes |
| Profil nem létezik | null return | Csendes fail — UI nem töltődik be |
| Admin override lejárt | Alert + redirect admin.html | Helyes |
| sessionStorage tele | Silent fail | Cache nem íródik, de működik |
| Offline + Auth Guard | Redirect index.html | **HIBÁS** — offline módban ne redirecteljen! |
| God Mode PIN hibás | Error badge | Nincs rate limiting! |

---

## 7. Azonosított problémák és kockázatok

### KRITIKUS
1. **Master admin email 7 helyen hardcoded** — bármilyen változás 7 fájlt érint
2. **God Mode PIN (`"1517"`) kliens kódban** — bárki kiolvassa a minifikált JS-ből
3. **`initHeaderData()` duplikálva** — auth_roles.js és congregation_api.js is definiálja, a congregation_api.js verziója nyer (DOMContentLoaded)
4. **Offline Auth Guard redirect** — ha offline, nem kellene az index.html-re irányítani

### KÖZEPES
5. **`auth.getUser()` redundáns hívások** — profile_api.js közvetlenül hívja ahelyett hogy getCachedProfile()-t használna
6. **Nincs rate limiting a God Mode PIN-nél** — brute force lehetséges
7. **sessionStorage.admin_override_congregation manipulálható** — de az RLS véd (backend)

### ALACSONY
8. **Splash screen sessionStorage flag** — inkognitó módban mindig megjelenik (nem hiba, feature)
9. **800ms késleltetés az initHeaderData-nál** — mágikus szám, nem dinamikus

---

## 8. Rejtett működés (nem nyilvánvaló logika)

1. **A `congregation_api.js` DOMContentLoaded listenere (174. sor)** 800ms késleltetéssel hívja az `initHeaderData()`-t — ez azért van, mert a header HTML komponensnek be kell töltődnie (`fetchComponent` aszinkron), és ha túl korán hívjuk, a DOM elemek még nem léteznek.

2. **Az `applySidebarRoles` függvény felülírja önmagát** (189. sor) — a `const originalApplySidebarRoles = applySidebarRoles;` + `applySidebarRoles = async function()...` minta kvázi "middleware"-ként működik: először lefut az eredeti, utána a God Mode és admin override logika.

3. **Az admin override dupla ellenőrzése** — mind a `session_cache.js` (52-76. sor), mind az `auth_roles.js` (208-235. sor) ellenőrzi az `admin_access_requests` táblát. Ez redundáns, de biztonsági szempontból jó (defense in depth).

4. **A `_loadMassImportGlobally()` CDN-ről tölt** — a `sheetjs` könyvtárat `@latest` verzióval a CDN-ről tölti be God Mode-ban, ami cache-elhetetlen. A többi könyvtár self-hosted.

5. **OAuth callback 500ms késleltetés** — a `DOMContentLoaded` után 500ms-t vár, mert a Supabase SDK-nak időre van szüksége a session token feldolgozásához a URL hash-ből.

---

## 9. Next.js migrációs megfeleltetés

| Jelenlegi | Next.js megfelelő |
| --------- | ----------------- |
| `supabase_config.js` (kliens init) | `lib/supabase/client.ts` (createBrowserClient) + `lib/supabase/server.ts` (createServerClient) |
| Auth Guard (supabase_config.js) | `middleware.ts` (Next.js Middleware) |
| `session_cache.js` | React Context (`AuthProvider`) + server-side `getUser()` |
| `auth_roles.js` (sidebar) | Server Component: layout.tsx → role check → conditional render |
| God Mode | Server Action + DB-based token (nem PIN!) |
| Admin override | Server-side session + DB ellenőrzés |
| `profile_api.js` | `app/api/profile/route.ts` Server Action |
| `congregation_api.js` | `app/api/congregation/route.ts` + Server Component |
| `component_cache.js` | **ELTŰNIK** — React komponensek natívan kezelve |
| `index.html` | `app/(auth)/login/page.tsx` + `app/(auth)/register/page.tsx` |
| Master admin email | `.env.local` → `MASTER_ADMIN_EMAIL` |
| God Mode PIN | **Törlendő** → server-side OTP e-mailben |
| `window._supabase` | **Eltűnik** — minden modul saját importtal használja |
| sessionStorage cache | **Eltűnik** — React state + server-side session |
