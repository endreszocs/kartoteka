# Core — Next.js Architektúra Terv

Stack: Next.js 15 (App Router) + Supabase SSR + Tailwind CSS + shadcn/ui

---

## 1. Komponensek

### Komponens térkép

```
components/
├── layout/
│   ├── sidebar.tsx              [Server]   Oldalsó menü
│   ├── sidebar-mobile.tsx       [Client]   Mobil hamburger toggle
│   ├── sidebar-item.tsx         [Server]   Egyetlen menüpont (aktív jelölés)
│   ├── sidebar-section.tsx      [Server]   Menü szekció fejléc (pl. "Egyházmegye")
│   ├── header.tsx               [Server]   Fejléc (név, gyülekezet, avatar)
│   ├── header-user-menu.tsx     [Client]   Dropdown (profil, gyülekezet, kijelentkezés)
│   ├── god-mode-banner.tsx      [Server]   Piros sáv God Mode-ban
│   ├── admin-override-banner.tsx [Client]  Piros sáv + kilépés gomb + visszaszámláló
│   └── breadcrumb.tsx           [Server]   Útvonal jelző (Dashboard > Pénzügy > Bevétel)
│
├── auth/
│   ├── login-form.tsx           [Client]   E-mail + jelszó + hibaüzenet
│   ├── register-form.tsx        [Client]   Regisztrációs űrlap (5 mező + feltételek)
│   ├── oauth-buttons.tsx        [Client]   Google + Apple gombok
│   ├── forgot-password-form.tsx [Client]   Jelszó reset (e-mail mező)
│   ├── oauth-complete-form.tsx  [Client]   OAuth kiegészítés (név, telefon, gyülekezet)
│   └── terms-dialog.tsx         [Client]   Felhasználói Feltételek felugró ablak
│
├── modals/
│   ├── profile-dialog.tsx       [Client]   Profil szerkesztés (shadcn Dialog)
│   ├── congregation-dialog.tsx  [Client]   Gyülekezet szerkesztés (többlapos)
│   └── god-mode-dialog.tsx      [Client]   OTP bevitel (God Mode aktiválás)
│
└── ui/                          [shadcn]   shadcn/ui primitívek
    ├── button.tsx
    ├── input.tsx
    ├── dialog.tsx
    ├── dropdown-menu.tsx
    ├── avatar.tsx
    ├── badge.tsx
    ├── card.tsx
    ├── form.tsx                            (react-hook-form + zod)
    ├── select.tsx
    ├── tabs.tsx
    ├── toast.tsx                           (sonner)
    └── separator.tsx
```

### Server vs Client szabály

| Típus | Mikor | Példa |
| ----- | ----- | ----- |
| **Server Component** | Nincs interakció, nincs state, adatot jelenít meg | sidebar, header, god-mode-banner |
| **Client Component** | Van kattintás, form kitöltés, toggle, dropdown, visszaszámláló | login-form, header-user-menu, admin-override-banner |

**Ökölszabály:** Minden komponens Server, KIVÉVE ha `useState`, `useEffect`, `onClick`, form submit, vagy böngésző API kell (pl. `sessionStorage`, `navigator`).

---

## 2. Oldal struktúra

### Route térkép

```
app/
├── layout.tsx                                    ROOT LAYOUT
│   ├── HTML lang="hu"
│   ├── Inter font betöltés
│   ├── Tailwind globals.css
│   ├── Toaster (sonner) — globális értesítések
│   └── {children}
│
├── (auth)/                                       AUTH CSOPORT (publikus)
│   ├── layout.tsx
│   │   ├── Splash screen (feltételesen)
│   │   ├── Templom háttérkép
│   │   ├── EREK címer
│   │   └── Központosított kártya keret
│   │
│   ├── login/page.tsx                            BEJELENTKEZÉS
│   │   ├── LoginForm
│   │   ├── OAuthButtons
│   │   └── Linkek: Regisztráció, Elfelejtett jelszó
│   │
│   ├── register/page.tsx                         REGISZTRÁCIÓ
│   │   ├── RegisterForm
│   │   ├── OAuthButtons
│   │   ├── TermsDialog
│   │   └── Link: Bejelentkezés
│   │
│   ├── forgot-password/page.tsx                  JELSZÓ RESET
│   │   ├── ForgotPasswordForm
│   │   └── Link: Vissza a bejelentkezéshez
│   │
│   ├── oauth-complete/page.tsx                   OAUTH KIEGÉSZÍTÉS
│   │   ├── OAuthCompleteForm
│   │   └── TermsDialog
│   │
│   └── auth/callback/route.ts                    OAUTH CALLBACK
│       └── GET handler: token csere → redirect
│
└── (dashboard)/                                  VÉDETT CSOPORT
    ├── layout.tsx
    │   ├── [SZERVER] Profil lekérdezés
    │   ├── [SZERVER] Szerepkör meghatározás
    │   ├── [SZERVER] God Mode ellenőrzés
    │   ├── [SZERVER] Admin Override ellenőrzés
    │   ├── Sidebar (props: role, isMaster, hasCongregation, godMode)
    │   ├── Header (props: profile, congregationName, congregationLogo)
    │   ├── GodModeBanner (feltételes)
    │   ├── AdminOverrideBanner (feltételes)
    │   ├── ProfileDialog
    │   ├── CongregationDialog
    │   └── {children}
    │
    ├── page.tsx                                  / → redirect
    │   └── Szerver: role alapján redirect a megfelelő dashboard-ra
    │
    ├── dashboard/page.tsx                        GYÜLEKEZETI DASHBOARD
    ├── dashboard-kerulet/page.tsx                KERÜLETI DASHBOARD
    └── dashboard-egyhazmegye/page.tsx            EGYHÁZMEGYEI DASHBOARD
```

### Layout hierarchia (renderelési sorrend)

```
RootLayout (app/layout.tsx)
  └── AuthLayout VAGY DashboardLayout (route csoport alapján)
        └── Page Component (az aktuális oldal)
```

Az `(auth)` és `(dashboard)` csoportok **kölcsönösen kizáróak** — egy felhasználó vagy az egyiket vagy a másikat látja.

---

## 3. State kezelés

### Nincs globális state store

A Core modulnak **NEM kell Zustand/Redux**. Minden adat vagy szerveren van, vagy egyetlen komponens scope-jában.

### State elhelyezés

| Adat | Hol él | Miért ott |
| ---- | ------ | --------- |
| Felhasználó profil (id, név, email, role, congregation_id) | **Server Component** (layout.tsx lekéri, props-ként adja tovább) | Nem változik oldal betöltés közben |
| Gyülekezet neve és címere | **Server Component** (layout.tsx) | Statikus adat, ritkán változik |
| God Mode aktív-e | **Server Component** (layout.tsx ellenőrzi a DB-t) | Biztonsági okokból szerveren kell legyen |
| Admin Override aktív-e + hátralévő idő | **Client Component** (admin-override-banner.tsx) | Visszaszámláló kliens-oldali timer |
| Sidebar nyitva/zárva (mobil) | **Client Component** (sidebar-mobile.tsx) | UI toggle, lokális state |
| Header dropdown nyitva/zárva | **Client Component** (header-user-menu.tsx) | UI toggle, shadcn DropdownMenu kezeli |
| Profil modal nyitva/zárva + form mezők | **Client Component** (profile-dialog.tsx) | Form interakció |
| Gyülekezet modal nyitva/zárva + form mezők | **Client Component** (congregation-dialog.tsx) | Form interakció |
| Login/Register form mezők + hibák | **Client Component** (login-form.tsx, register-form.tsx) | Form interakció |
| Splash screen megtörtént-e | **Cookie** (`kartoteka_splash` flag) | Szerver-oldali feltételes renderelés |
| Felhasználói Feltételek tartalom | **Client state** (terms-dialog.tsx — fetch once) | Lazy betöltés első megnyitáskor |

### Minta: profil adat áramlása

```
app/(dashboard)/layout.tsx [Server]
  │
  ├── const supabase = createServerClient(cookies)
  ├── const { data: { user } } = await supabase.auth.getUser()
  ├── const { data: profile } = await supabase.from('profiles')...
  ├── const role = profile.role
  ├── const isMaster = user.email === process.env.MASTER_ADMIN_EMAIL
  │
  ├── <Sidebar role={role} isMaster={isMaster} hasCong={!!profile.congregation_id} />
  ├── <Header profile={profile} congName={congName} congLogo={congLogo} />
  └── {children}
```

**Nincs `getCachedProfile()` — nincs sessionStorage cache.**
A Server Component **minden kérésnél friss adatot kap** a Supabase-től (a cookie session-t a middleware frissíti). Ez gyorsabb mint a régi rendszer cache + invalidáció logikája.

---

## 4. API hívások

### Supabase hívások helye

| Művelet | Hol hívjuk | Kliens típus | Miért |
| ------- | ---------- | ------------ | ----- |
| `auth.getUser()` | `layout.tsx` (Server) | `createServerClient` | Szerver-oldali session ellenőrzés |
| `profiles.select()` | `layout.tsx` (Server) | `createServerClient` | Profil adat a sidebar/header-hez |
| `congregations.select()` | `layout.tsx` (Server) | `createServerClient` | Gyülekezet név/címer |
| `admin_access_requests.select()` | `layout.tsx` (Server) | `createServerClient` | Override érvényesség |
| `auth.signInWithPassword()` | Server Action | `createServerClient` | Bejelentkezés |
| `auth.signUp()` | Server Action | `createServerClient` | Regisztráció |
| `auth.signInWithOAuth()` | Client Component | `createBrowserClient` | OAuth redirect (böngészőben indul) |
| `auth.resetPasswordForEmail()` | Server Action | `createServerClient` | Jelszó reset |
| `auth.signOut()` | Server Action | `createServerClient` | Kijelentkezés |
| `profiles.upsert()` | Server Action | `createServerClient` | Profil mentés |
| `congregations.update()` | Server Action | `createServerClient` | Gyülekezet mentés |
| `storage.upload()` | Server Action | `createServerClient` | Címer feltöltés |
| `dioceses.select()` | Server Action / Server Component | `createServerClient` | Egyházmegye dropdown |

### Server Action minta

```
app/(auth)/login/actions.ts         → signIn, signInWithOAuth
app/(auth)/register/actions.ts      → signUp, completeOAuthProfile
app/(auth)/forgot-password/actions.ts → resetPassword
app/(dashboard)/actions.ts          → signOut
app/(dashboard)/profile/actions.ts  → updateProfile
app/(dashboard)/congregation/actions.ts → updateCongregation, uploadCrest
app/(dashboard)/god-mode/actions.ts → requestOTP, validateOTP, deactivateGodMode
```

**Szabály:** Minden adatbázis-módosítás Server Action-ön keresztül. Soha nem hívunk `insert/update/delete`-et Client Component-ből közvetlenül.

### A régi rendszer 47 `auth.getUser()` hívása → 1 hívás

A `(dashboard)/layout.tsx` **egyszer** hívja a `getUser()`-t, és az eredményt props-ként adja tovább. Egyetlen oldal betöltés = egyetlen auth hívás. Az összes gyermek komponens a props-ból kapja a profilt.

---

## 5. Auth kezelés

### Három rétegű védelem

```
┌─────────────────────────────────────────────────────────────┐
│  1. RÉTEG: Next.js Middleware (middleware.ts)                │
│     → Minden /dashboard/* kérést elfog                       │
│     → Session cookie ellenőrzés                              │
│     → Ha nincs session → redirect /login                     │
│     → Ha van session → session frissítés (token rotation)    │
│     → Szerver-oldali, nem megkerülhető                       │
├─────────────────────────────────────────────────────────────┤
│  2. RÉTEG: Server Component (layout.tsx)                     │
│     → Profil lekérdezés + szerepkör ellenőrzés               │
│     → Ha pending → redirect /login + signOut                 │
│     → Ha nincs congregation_id → korlátozott menü            │
│     → A sidebar HTML-je sosem generálódik jogosulatlan elemeknek │
├─────────────────────────────────────────────────────────────┤
│  3. RÉTEG: Supabase RLS (PostgreSQL)                         │
│     → Adatbázis szintű sor-szűrés                            │
│     → Még ha valaki megkerülné az 1-2 réteget,               │
│       az adatbázis nem ad ki más gyülekezet adatait           │
└─────────────────────────────────────────────────────────────┘
```

### Session kezelés

| Szempont | Régi rendszer | Új rendszer |
| -------- | ------------- | ----------- |
| Session tároló | Supabase localStorage + sessionStorage | **httpOnly cookie** |
| Session frissítés | Kliens JS (`onAuthStateChange`) | **Middleware** (automatikus) |
| Session lejárat | Kliens figyeli | **Szerver figyeli** (middleware) |
| Kijelentkezés más fülön | `onAuthStateChange` listener | **Cookie törlés** → middleware redirect |
| Hackelhető? | Igen (sessionStorage manipulálható) | **Nem** (httpOnly cookie nem JS-ezhető) |

### OAuth callback flow

```
1. Felhasználó kattint "Google" gombra
2. [Client] supabase.auth.signInWithOAuth({ redirectTo: '/auth/callback' })
3. Böngésző → Google → engedélyezés
4. Google → redirect: /auth/callback?code=XYZ
5. [Server] app/(auth)/auth/callback/route.ts:
   a) code → session token csere (exchangeCodeForSession)
   b) Cookie beállítás
   c) Profil ellenőrzés:
      - VAN profil + active → redirect /dashboard
      - VAN profil + pending → signOut → redirect /login?error=pending
      - NINCS profil → redirect /oauth-complete
6. [Server/Client] A céloldal betöltődik
```

### Szerepkör meghatározás (layout.tsx-ben)

```
Bemenet: profile.role + user.email

Számított értékek (NEM adatbázis oszlopok — futásidőben számolt):
  isMasterAdmin = (user.email === process.env.MASTER_ADMIN_EMAIL)
  isAdmin       = (role === 'admin') || isMasterAdmin
  isEsperes     = (role === 'esperes') || (role === 'egyhazmegyei_admin') || isAdmin
  hasCongregation = !!profile.congregation_id
  isGodMode     = aktív god_mode session a DB-ben (expires_at > now)
  hasOverride   = aktív admin_access_requests (status='approved', expires_at > now)

Ezeket props-ként kapja:
  <Sidebar role isMasterAdmin isAdmin isEsperes hasCongregation isGodMode />
  <Header profile congregationName congregationLogo />
  <GodModeBanner isActive />
  <AdminOverrideBanner override={overrideData} />
```

---

## 6. Validáció elhelyezése

### Két rétegű validáció

```
┌────────────────────────────────┐
│  KLIENS (azonnali visszajelzés) │
│  react-hook-form + zod          │
│  → required mezők               │
│  → formátum (email, min length) │
│  → UI hibák (piros keret, szöveg) │
└──────────────┬─────────────────┘
               │ submit
               ▼
┌────────────────────────────────┐
│  SZERVER (biztonsági validáció)  │
│  zod.parse() a Server Action-ben │
│  → ugyanaz a séma mint kliens   │
│  → + üzleti szabályok           │
│  → + adatbázis constraint-ek    │
└────────────────────────────────┘
```

**Szabály:** A kliens validáció UX célú (gyors feedback). A szerver validáció biztonsági célú (nem megkerülhető). Mindkét helyen UGYANAZ a Zod séma.

### Validációs sémák (Zod)

```
lib/validations/
├── auth.ts
│   ├── loginSchema         { email: email(), password: min(1) }
│   ├── registerSchema      { fullName: min(2), phone: min(5), congregation: min(2),
│   │                         email: email(), password: min(6), termsAccepted: literal(true) }
│   ├── forgotPasswordSchema { email: email() }
│   └── oauthCompleteSchema { fullName: min(2), phone: min(5), congregation: min(2),
│                              termsAccepted: literal(true) }
│
├── profile.ts
│   └── profileSchema       { fullName: min(2), birthDate: date().optional() }
│
└── congregation.ts
    └── congregationSchema  { nevHu: min(2), nevRo: optional(), nevEn: optional(),
                              adoszam: optional(), cim: optional(), email: email().optional(),
                              telefon: optional(), web: url().optional(),
                              evesJarulek: number().min(0), jarulekKedvezmenyes: number().min(0),
                              jarulekHatarid: regex(/^\d{2}-\d{2}$/),
                              iban: optional(), bank: optional(),
                              dioceseId: uuid().optional(),
                              tartozasSzamitasMod: enum(['akkori', 'aktualis']) }
```

### Validáció helye komponensenként

| Komponens | Kliens (UX) | Szerver (biztonság) | Adatbázis (constraint) |
| --------- | ----------- | ------------------- | ---------------------- |
| login-form | email format, required | Supabase auth error → magyar üzenet | — |
| register-form | required, min length, checkbox | zod parse + signUp error | profiles.status DEFAULT 'pending' |
| oauth-complete-form | required, checkbox | zod parse + insert error | — |
| forgot-password-form | email format | resetPasswordForEmail error | — |
| profile-dialog | required name | zod parse + upsert | — |
| congregation-dialog | required nevHu, number format | zod parse + update | jarulek CHECK >= 0 |
| god-mode-dialog | required OTP (6 számjegy) | DB token egyezés + lejárat | — |

### Hibaüzenetek megjelenítése

| Hiba típus | Hol jelenik meg | Komponens |
| ---------- | --------------- | --------- |
| Mező validáció (kliens) | Mező alatt piros szöveg | `<FormMessage />` (shadcn) |
| Szerver hiba (Server Action) | Form felett piros banner | Egyedi `<FormError message={...} />` |
| Supabase auth hiba | Form felett piros banner | Lefordított hibaüzenet (angol → magyar) |
| Sikeres művelet | Toast (jobb felső sarok) | `sonner` toast |

### Supabase hibaüzenetek fordítása

| Supabase angol | Magyar megfelelő |
| -------------- | ---------------- |
| "Invalid login credentials" | "Érvénytelen e-mail cím vagy jelszó." |
| "Email not confirmed" | "Kérem, erősítse meg az e-mail címét!" |
| "User already registered" | "Ez az e-mail cím már regisztrálva van." |
| "Password should be at least 6 characters" | "A jelszónak legalább 6 karakter hosszúnak kell lennie." |
| "Email rate limit exceeded" | "Túl sok próbálkozás. Kérem, várjon néhány percet." |

---

## Összefoglaló: a teljes Core adat-áramlása

```
Böngésző kérés (GET /dashboard)
       │
       ▼
middleware.ts
  ├── Cookie-ból session olvasás
  ├── Ha nincs → redirect /login (VÉGE)
  ├── Ha van → session token frissítés (rotation)
  └── Továbbenged
       │
       ▼
app/(dashboard)/layout.tsx [Server Component]
  ├── createServerClient(cookies)
  ├── supabase.auth.getUser()                    ← EGYETLEN auth hívás
  ├── supabase.from('profiles').select().single() ← EGYETLEN profil hívás
  ├── supabase.from('congregations').select()     ← EGYETLEN gyülekezet hívás
  ├── Szerepkör számítás (isMaster, isAdmin, isEsperes)
  ├── God Mode check (DB lekérdezés: aktív-e?)
  ├── Admin Override check (DB: érvényes engedély?)
  │
  ├── <Sidebar ... />                 ← Props-ból renderel, nem kérdez DB-t
  ├── <Header ... />                  ← Props-ból renderel
  ├── <GodModeBanner ... />           ← Feltételes, props-ból
  ├── <AdminOverrideBanner ... />     ← Feltételes, kliens timer
  └── {children}                      ← Az aktuális page.tsx
       │
       ▼
app/(dashboard)/dashboard/page.tsx [Server Component]
  ├── A layout MÁR lekérte a profilt
  ├── Itt csak a dashboard-specifikus adatok kellenek
  └── (Ez Phase 2 — most üres placeholder)
```

**Eredmény: 3 DB lekérdezés oldal betöltésenként (profil + gyülekezet + god mode/override)**
**Régi rendszer: 12-47 DB lekérdezés**
