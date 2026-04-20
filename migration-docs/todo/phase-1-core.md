# Phase 1 — Core (Auth + Layout) implementációs terv

---

## 1. Backend (Supabase)

### 1.1 Meglévő táblák — NEM módosulnak

Az adatbázis KÖZÖS a régi és az új rendszer között. Semmi nem változik a sémában.

| Tábla | Oszlopok (fontosak) | Megjegyzés |
| ----- | ------------------- | ---------- |
| **profiles** | id (uuid, PK→auth.users), email, full_name, phone, congregation (text), birth_date, status ('pending'/'active'), role ('lelkesz'/'esperes'/'egyhazmegyei_admin'/'admin'), congregation_id (FK→congregations), diocese_id, district_id, created_at | A role mező szöveges — nincs enum constraint |
| **congregations** | id (uuid, PK), name, nev_hu, nev_ro, nev_en, diocese (text), district (text), diocese_id (FK→dioceses), adoszam, cim, email, telefon, web, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid, iban, bank, cimer_url, tartozas_szamitas_mod, created_at | A `diocese` és `district` szöveges oszlopok legacy — a `diocese_id` az igazi FK |
| **dioceses** | id (uuid, PK), name, district_id (FK→districts), created_at | Egyházmegyék |
| **districts** | id (uuid, PK), name, created_at | Egyházkerületek (jelenleg 1: EREK) |
| **admin_access_requests** | id (uuid, PK), admin_user_id (FK→auth.users), congregation_id (FK→congregations), pastor_user_id (FK→profiles), reason, status ('pending'/'approved'/'denied'/'expired'), approved_at, denied_at, expires_at, created_at | Admin override engedélyek |

### 1.2 Meglévő RLS policy-k — megtartva

- `profiles`: felhasználó csak a saját profilját olvassa/módosítsa
- `congregations`: felhasználó csak a saját gyülekezetéét olvassa
- `admin_access_requests`: admin látja a sajátjait, lelkész a hozzá címzetteket
- **Supabase Storage** (`logos` bucket): publikus olvasás, bejelentkezett felhasználó írhat

### 1.3 Új: környezeti változó a Master Admin e-mailhez

Jelenleg 7 helyen hardcoded. Az új rendszerben:

| Változó | Helye | Értéke |
| ------- | ----- | ------ |
| `MASTER_ADMIN_EMAIL` | `.env.local` | `endreszocs@gmail.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | `https://bjytiawckbibqmtlezfl.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | `eyJhbG...` |

### 1.4 God Mode átalakítás — PIN helyett DB token

Jelenleg: kliens oldali PIN (`"1517"`), sessionStorage-ban
Új rendszerben: **szerver-oldali, adatbázis-alapú token**

| Elem | Jelenlegi | Új |
| ---- | --------- | --- |
| Aktiválás | PIN bevitel → kliens-oldali egyezés | E-mailben küldött OTP kód → szerver-oldali validálás |
| Tárolás | sessionStorage (böngészőben) | Supabase session metadata VAGY god_mode tábla |
| Ellenőrzés | Kliens JavaScript | Szerver-oldali middleware / Server Component |
| Lejárat | 2 óra (kliens számol) | 2 óra (szerver számol, expires_at oszlop) |

---

## 2. Frontend (Next.js)

### 2.1 Projekt struktúra

```
D:\KARTOTEKA\
├── .env.local
├── next.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── middleware.ts                          ← Auth Guard (route védelem)
├── lib/
│   ├── supabase/
│   │   ├── client.ts                     ← Böngészős kliens (createBrowserClient)
│   │   ├── server.ts                     ← Szerveres kliens (createServerClient)
│   │   └── middleware.ts                 ← Middleware kliens (updateSession)
│   ├── auth/
│   │   ├── roles.ts                      ← Szerepkör definíciók és helper-ek
│   │   └── master-admin.ts              ← Master Admin ellenőrzés (env-ből)
│   └── types/
│       ├── database.ts                   ← Supabase generated types
│       └── auth.ts                       ← Profile, Role, Session típusok
├── app/
│   ├── layout.tsx                        ← Root layout (metadata, fontok)
│   ├── (auth)/                           ← Auth csoport — NEM védett, NEM tartalmaz sidebar-t
│   │   ├── layout.tsx                    ← Auth layout (splash háttér, kártya stílus)
│   │   ├── login/
│   │   │   └── page.tsx                  ← Bejelentkezés + OAuth
│   │   ├── register/
│   │   │   └── page.tsx                  ← Regisztráció
│   │   ├── forgot-password/
│   │   │   └── page.tsx                  ← Jelszó visszaállítás
│   │   ├── oauth-complete/
│   │   │   └── page.tsx                  ← OAuth kiegészítő adatbekérés
│   │   └── auth/callback/
│   │       └── route.ts                  ← OAuth callback (szerver-oldali token csere)
│   └── (dashboard)/                      ← Védett csoport — sidebar + header
│       ├── layout.tsx                    ← Dashboard layout (sidebar, header, profil dropdown)
│       ├── page.tsx                      ← Irányítópult (redirect: /dashboard)
│       ├── dashboard/
│       │   └── page.tsx                  ← Gyülekezeti irányítópult
│       ├── dashboard-kerulet/
│       │   └── page.tsx                  ← Kerületi irányítópult
│       └── dashboard-egyhazmegye/
│           └── page.tsx                  ← Egyházmegyei irányítópult
└── components/
    ├── layout/
    │   ├── sidebar.tsx                   ← Oldalsó menü (szerepkör-függő)
    │   ├── header.tsx                    ← Fejléc (név, monogram, gyülekezet, dropdown)
    │   ├── god-mode-banner.tsx           ← God Mode piros sáv
    │   └── admin-override-banner.tsx     ← Admin override piros sáv
    ├── auth/
    │   ├── login-form.tsx                ← E-mail/jelszó form
    │   ├── register-form.tsx             ← Regisztrációs form
    │   ├── oauth-buttons.tsx             ← Google/Apple gombok
    │   ├── forgot-password-form.tsx      ← Jelszó reset form
    │   └── oauth-complete-form.tsx       ← OAuth kiegészítés
    ├── modals/
    │   ├── profile-modal.tsx             ← Profil szerkesztő
    │   ├── congregation-modal.tsx        ← Gyülekezet szerkesztő
    │   └── god-mode-modal.tsx            ← God Mode aktiválás
    └── ui/
        ├── splash-screen.tsx             ← Köszöntő képernyő
        └── terms-modal.tsx               ← Felhasználói Feltételek modal
```

### 2.2 Oldalak részletezése

#### `middleware.ts` — Auth Guard

**Felelősség:** Minden `/dashboard/*` route védelme — session nélkül redirect `/login`-ra

**Logika:**
1. Supabase session frissítés (cookie-ből)
2. Ha nincs session → redirect `/login`
3. Ha van session → enged tovább
4. Az `/login`, `/register`, `/forgot-password` oldalak NEM védettek

#### `app/(auth)/layout.tsx` — Auth Layout

**Felelősség:** A bejelentkezési oldalak közös kerete

**Tartalmazza:**
- Háttérkép (church-bg.jpg)
- Splash screen komponens (első látogatáskor)
- Központosított kártya stílus
- EREK címer

#### `app/(dashboard)/layout.tsx` — Dashboard Layout (a legfontosabb!)

**Felelősség:** Minden védett oldal közös kerete

**Szerver-oldali logika:**
1. Supabase szerveres klienssel profil lekérdezés
2. Szerepkör meghatározás
3. Master Admin ellenőrzés (env változóból)
4. Admin override ellenőrzés (admin_access_requests tábla)
5. God Mode ellenőrzés
6. Ezek az adatok props-ként lekerülnek a sidebar és header komponensekbe

**Tartalmazza:**
- Sidebar (szerepkör-függő menüelemek)
- Header (név, monogram/avatar, gyülekezet, dropdown)
- God Mode banner (ha aktív)
- Admin Override banner (ha aktív)
- `{children}` — az aktuális oldal tartalma

---

## 3. Funkciók

### 3.1 Bejelentkezés (CRUD: Read + Auth)

| Funkció | Típus | Hol fut |
| ------- | ----- | ------- |
| E-mail/jelszó bejelentkezés | Server Action | Szerveren |
| Google OAuth indítás | Kliens | Böngészőben (redirect) |
| OAuth callback token csere | Route Handler | Szerveren (`/auth/callback/route.ts`) |
| Session cookie beállítás | Middleware | Szerveren |
| Bejelentkezés utáni routing | Server Action | Szerveren (role check → redirect) |

**Validáció:**
- E-mail: kötelező, érvényes formátum
- Jelszó: kötelező
- Profil státusz: `active` VAGY Master Admin → enged, `pending` → signOut + üzenet

### 3.2 Regisztráció (CRUD: Create)

| Funkció | Típus | Hol fut |
| ------- | ----- | ------- |
| E-mail regisztráció | Server Action | Szerveren |
| OAuth kiegészítés | Server Action | Szerveren |
| Profil sor létrehozás | Server Action | Szerveren (status: 'pending') |

**Validáció:**
- Teljes név: kötelező, minimum 2 karakter
- Telefonszám: kötelező
- Gyülekezet: kötelező (szöveges — nem dropdown)
- E-mail: kötelező, érvényes, egyedi
- Jelszó: minimum 6 karakter
- Feltételek elfogadása: kötelező checkbox

### 3.3 Profil szerkesztés (CRUD: Read + Update)

| Funkció | Típus | Hol fut |
| ------- | ----- | ------- |
| Profil betöltés | Server Component | Szerveren |
| Profil mentés | Server Action | Szerveren |
| Auth metaadat frissítés | Server Action | Szerveren |

**Validáció:**
- Teljes név: kötelező
- Születési dátum: opcionális, érvényes dátum

### 3.4 Gyülekezet szerkesztés (CRUD: Read + Update)

| Funkció | Típus | Hol fut |
| ------- | ----- | ------- |
| Gyülekezet adatok betöltés | Server Component | Szerveren |
| Egyházmegyék dropdown | Server Component | Szerveren (dioceses tábla) |
| Gyülekezet mentés | Server Action | Szerveren |
| Címer feltöltés | Server Action | Szerveren (Supabase Storage) |

**Validáció:**
- Magyar név (nev_hu): kötelező
- Éves járulék: szám, minimum 0
- Járulék határidő: HH-NN formátum
- Címer: képfájl (max méret korlát)

### 3.5 God Mode (CRUD: Create + Read + Delete)

| Funkció | Típus | Hol fut |
| ------- | ----- | ------- |
| God Mode aktiválás kérés | Server Action | Szerveren (OTP küldés e-mailben) |
| OTP validálás | Server Action | Szerveren (DB check) |
| God Mode állapot ellenőrzés | Server Component | Szerveren (layout.tsx-ben) |
| God Mode deaktiválás | Server Action | Szerveren (DB törlés) |

### 3.6 Admin Override (CRUD: Read)

| Funkció | Típus | Hol fut |
| ------- | ----- | ------- |
| Override érvényesség ellenőrzés | Server Component | Szerveren (layout.tsx-ben) |
| Override kilépés | Server Action | Szerveren (session törlés) |

---

## 4. Prioritás — lépések sorrendje

### 4.1 Alapozás (1. nap)

```
□ Next.js projekt inicializálás (create-next-app)
  ├── TypeScript + Tailwind CSS + App Router
  ├── package.json: @supabase/ssr, @supabase/supabase-js
  └── .env.local: SUPABASE_URL, SUPABASE_ANON_KEY, MASTER_ADMIN_EMAIL

□ Supabase kliens beállítás
  ├── lib/supabase/client.ts (createBrowserClient)
  ├── lib/supabase/server.ts (createServerClient — cookies)
  └── lib/supabase/middleware.ts (updateSession)

□ Típusdefiníciók
  ├── lib/types/database.ts (Supabase CLI: npx supabase gen types)
  └── lib/types/auth.ts (Profile, Role enum, Session)

□ Middleware (Auth Guard)
  └── middleware.ts: session check → /login redirect
```

### 4.2 Auth oldalak (2. nap)

```
□ Auth layout
  └── app/(auth)/layout.tsx (háttérkép, kártya stílus)

□ Login oldal
  ├── app/(auth)/login/page.tsx
  ├── components/auth/login-form.tsx (e-mail/jelszó)
  ├── components/auth/oauth-buttons.tsx (Google + Apple tiltva)
  └── Server Action: signInWithPassword → role check → redirect

□ OAuth callback
  └── app/(auth)/auth/callback/route.ts (token csere)

□ Regisztrációs oldal
  ├── app/(auth)/register/page.tsx
  ├── components/auth/register-form.tsx
  └── Server Action: signUp → profiles.insert(status: 'pending')

□ Jelszó visszaállítás
  ├── app/(auth)/forgot-password/page.tsx
  └── Server Action: resetPasswordForEmail

□ OAuth kiegészítés
  ├── app/(auth)/oauth-complete/page.tsx
  └── Server Action: profiles.insert + signOut
```

### 4.3 Dashboard Layout (3. nap)

```
□ Sidebar komponens
  ├── components/layout/sidebar.tsx
  ├── Szerepkör-függő menüelemek (props: role, isMasterAdmin, hasCongregation)
  └── Mobil responsive (hamburger menü)

□ Header komponens
  ├── components/layout/header.tsx
  ├── Monogram/avatar generálás
  ├── Gyülekezet név + címer
  └── Dropdown: Profil, Gyülekezet, Kijelentkezés

□ Dashboard layout
  ├── app/(dashboard)/layout.tsx
  ├── Szerver-oldali profil lekérdezés
  ├── Szerepkör meghatározás
  ├── Props átadás sidebar-nak és header-nek
  └── God Mode / Admin Override banner
```

### 4.4 Profil és Gyülekezet (4. nap)

```
□ Profil modal
  ├── components/modals/profile-modal.tsx
  ├── Server Action: profiles.update + auth.updateUser
  └── Header frissítés mentés után (revalidatePath)

□ Gyülekezet modal
  ├── components/modals/congregation-modal.tsx
  ├── Egyházmegye dropdown (Server Component data fetch)
  ├── Címer feltöltés (Supabase Storage)
  ├── Server Action: congregations.update
  └── Retry logika a tartozas_szamitas_mod mezőre
```

### 4.5 God Mode és Admin Override (5. nap)

```
□ God Mode
  ├── components/modals/god-mode-modal.tsx
  ├── Server Action: OTP generálás + e-mail küldés
  ├── Server Action: OTP validálás + god_mode session beállítás
  ├── components/layout/god-mode-banner.tsx
  └── Layout-ben: god mode állapot ellenőrzés

□ Admin Override
  ├── components/layout/admin-override-banner.tsx
  ├── Layout-ben: admin_access_requests ellenőrzés
  └── Server Action: override kilépés

□ Splash screen
  ├── components/ui/splash-screen.tsx (kliens komponens)
  └── Cookie-ban tárolt flag (nem sessionStorage)

□ Felhasználói Feltételek modal
  ├── components/ui/terms-modal.tsx
  └── Tartalom fetch a felhasznaloi_feltetelek.html-ből VAGY statikus szöveg
```

---

## 5. Függőségek

### 5.1 npm csomagok

| Csomag | Verzió | Cél |
| ------ | ------ | --- |
| `next` | 15.x | Framework |
| `react` | 19.x | UI |
| `typescript` | 5.x | Típusok |
| `tailwindcss` | 4.x | Stílusok |
| `@supabase/supabase-js` | 2.x | Supabase kliens |
| `@supabase/ssr` | 0.5.x | Supabase SSR (cookie session) |
| `@tabler/icons-react` | 3.x | Ikonok (csak használt ikonok, nem teljes font!) |
| `zod` | 3.x | Validáció (form-ok szerver-oldali validálása) |

### 5.2 Belső függőségek (sorrend kritikus!)

```
1. .env.local                  ← ELSŐ: env változók (build time + runtime)
2. lib/supabase/*.ts           ← MÁSODIK: kliens/szerver inicializálás
3. lib/types/*.ts              ← HARMADIK: típusdefiníciók
4. lib/auth/roles.ts           ← NEGYEDIK: szerepkör logika
5. middleware.ts               ← ÖTÖDIK: route védelem (függ: lib/supabase/middleware.ts)
6. app/(auth)/*                ← HATODIK: auth oldalak (függ: 2, 3)
7. components/layout/*         ← HETEDIK: sidebar, header (függ: 4)
8. app/(dashboard)/layout.tsx  ← NYOLCADIK: védett layout (függ: 2, 3, 4, 7)
9. components/modals/*         ← KILENCEDIK: modal-ok (függ: 2, 3)
```

### 5.3 Külső függőségek

| Szolgáltatás | Mire kell | Változik a migráció során? |
| ------------ | --------- | -------------------------- |
| Supabase Auth | Bejelentkezés, regisztráció, OAuth, jelszó reset | NEM — ugyanaz az API |
| Supabase DB | profiles, congregations, dioceses, admin_access_requests | NEM — közös DB |
| Supabase Storage | Címer feltöltés (logos bucket) | NEM — ugyanaz |
| Google OAuth | Google bejelentkezés | NEM — a redirect URL változik (új domain) |

### 5.4 A Phase 1 végállapota

Amikor a Phase 1 kész, a következőknek kell működniük:

```
✅ Bejelentkezés (e-mail + Google)
✅ Regisztráció (e-mail + Google OAuth kiegészítés)
✅ Jelszó visszaállítás
✅ Session kezelés (cookie-alapú, nem sessionStorage)
✅ Auth Guard (middleware — nem JS hackelhető)
✅ Bejelentkezés utáni routing (szerepkör-alapú)
✅ Kijelentkezés
✅ Sidebar (szerepkör-függő menüelemek)
✅ Header (név, monogram, gyülekezet, dropdown)
✅ Profil szerkesztés (modal)
✅ Gyülekezet szerkesztés (modal + címer feltöltés)
✅ God Mode (szerver-oldali, OTP-alapú)
✅ Admin Override (banner + lejárat-ellenőrzés)
✅ Splash screen
✅ Felhasználói Feltételek modal
✅ Master Admin email: env változóból (nem hardcoded)
❌ Dashboard tartalom (az Phase 2-ben)
❌ Bármelyik üzleti modul (Phase 3+)
```

### 5.5 Tesztelési checklist

| # | Teszt | Elvárt eredmény |
| --- | ----- | --------------- |
| 1 | `/login` megnyitása bejelentkezés nélkül | Login oldal jelenik meg |
| 2 | `/dashboard` megnyitása bejelentkezés nélkül | Redirect → `/login` |
| 3 | Hibás e-mail/jelszó | "Érvénytelen e-mail cím vagy jelszó" |
| 4 | Pending profillal belépés | Kijelentkeztetés + figyelmeztetés |
| 5 | Active profillal + gyülekezettel belépés | Redirect → `/dashboard` |
| 6 | Active profillal + admin + gyülekezet nélkül | Redirect → `/dashboard-kerulet` |
| 7 | Google bejelentkezés (létező profil) | Redirect → megfelelő dashboard |
| 8 | Google bejelentkezés (új felhasználó) | OAuth kiegészítő form |
| 9 | Regisztráció → belépés | "Jóváhagyásra vár" üzenet |
| 10 | Sidebar menü lelkész szerepkörrel | Csak gyülekezeti menüpontok |
| 11 | Sidebar menü admin szerepkörrel | + Kerületi dashboard gomb |
| 12 | Sidebar menü Master Adminnal | + Admin panel + God Mode |
| 13 | Profil szerkesztés → mentés | Header frissül |
| 14 | Gyülekezet szerkesztés → mentés | Header gyülekezet név frissül |
| 15 | God Mode aktiválás | OTP e-mail → piros banner → 2 óra |
| 16 | Admin Override aktív engedéllyel | Piros banner + célgyülekezet adatai |
| 17 | Admin Override lejárt engedéllyel | Figyelmeztetés + redirect admin |
| 18 | Apple gomb kattintás | "Hamarosan elérhető" üzenet |
| 19 | Jelszó visszaállítás | Reset link elküldve (nem árulja el, létezik-e az e-mail) |
| 20 | Kijelentkezés | Redirect → `/login`, más fülön is kijelentkezik |
