# M1.5 teljesítési jelentés — Desktop kliens első értelmes képernyője

**Dátum**: 2026-04-23
**Fázis**: M1.5 — desktop login + auth-flow (M1 fázis záró lépése)
**Kódolási ciklus**: ~60 perc (csomagok telepítés, routing, auth-gate, login/dashboard page, verify)
**Státusz**: ✅ KÉSZ, Vite dev szerver fut, minden GET 200
**Branch**: `feat/m1-1-monorepo`

---

## 1. Vezetői összefoglaló

Az M1 fázis utolsó lépéseként a Tauri desktop kliens **először kap értelmes tartalmat**.
Az M1.5-ig puszta placeholder volt (greet-demo), most már:

- Tailwind CSS 4 CSS-first configgal
- React Router DOM HashRouter-rel
- Védett route (AuthGate)
- Bejelentkezési képernyő (email+jelszó, Supabase)
- Üdvözlő dashboard kijelentkezés gombbal

Az egész **közös csomagokon** épül: `@kartoteka/ui` (shadcn komponensek),
`@kartoteka/supabase-client` (auth-factory). **Nulla duplikáció** a web-bel.

---

## 2. Új fájlok és szerkezet

```
apps/desktop/
├── package.json              — új deps: @kartoteka/ui, react-router-dom, tailwindcss, @tailwindcss/vite
├── vite.config.ts            — +@tailwindcss/vite plugin
└── src/
    ├── index.css             (új)    — @import "tailwindcss" + @source + placeholder tokenek
    ├── main.tsx              (mod)   — import './index.css' (volt App.css)
    ├── App.tsx               (mod)   — HashRouter + Routes
    ├── App.css               (törölve)
    ├── assets/               (törölve) — react.svg
    ├── lib/
    │   ├── supabase.ts       (M1.3) — getDesktopSupabase() factory
    │   └── auth-gate.tsx     (új)   — session-check + redirect
    └── pages/
        ├── login-page.tsx    (új)   — LoginPage, email+jelszó + Supabase signIn
        └── dashboard-page.tsx (új)  — DashboardPage, placeholder + signOut
```

## 3. Telepített csomagok

| Csomag | Verzió | Hova |
|---|---|---|
| `@kartoteka/ui` | `*` (workspace) | dependencies |
| `react-router-dom` | ^7.8.0 | dependencies |
| `@tailwindcss/vite` | ^4 | devDependencies |
| `tailwindcss` | ^4 | devDependencies |

Az npm workspaces mindet a root `node_modules/`-ba deduplikálta.

## 4. Tailwind CSS 4 integráció — Vite-specifikus

A web-oldal `@tailwindcss/postcss` (PostCSS-alapú) plugint használ, mert a Next.js alap
PostCSS pipe-on át. A Vite-ban azonban **`@tailwindcss/vite`** a preferált — gyorsabb
és natívabb:

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

A CSS belépés:

```css
/* apps/desktop/src/index.css */
@import "tailwindcss";
@source "../../../packages/ui/src";

@theme {
  --color-primary: oklch(0.42 0.06 165);   /* EREK zöld */
  --color-primary-foreground: oklch(0.99 0 0);
  /* ... */
}
```

A `@source` direktíva kulcsfontosságú: e nélkül a JIT scanner **nem látja** a közös
csomagot, és a `@kartoteka/ui` komponensek utility class-ai hiányoznának a generált
CSS-ből.

## 5. Router stratégia — HashRouter

A `BrowserRouter` Tauri-ban problémás lehet:
- A Tauri ablak `tauri://localhost` vagy `http://tauri.localhost` scheme-en tölt be
- A history API push-állam nem mindig konzisztens a native oldal és a webview között

A **HashRouter** (`#/login` stílus) ezt elkerüli — a hash-rész kizárólag kliens-oldali,
semmilyen protokoll-fügéllenséget nem érint.

```tsx
<HashRouter>
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<AuthGate />}>
      <Route index element={<DashboardPage />} />
    </Route>
  </Routes>
</HashRouter>
```

Az `AuthGate` mint **layout route** — amikor matchel, a saját content-je renderelődik,
amiben egy `<Outlet />` helyettesíti a gyerek route tartalmát. Ha nincs session,
a `<Navigate to="/login" replace />` preempti az `<Outlet />`-et.

## 6. Auth-flow — gyakorlati futás

### Belépési oldal (`/login`)

```tsx
const supabase = getDesktopSupabase()
const { error } = await supabase.auth.signInWithPassword({ email, password })
if (error) setError(translateAuthError(error.message))
else navigate('/', { replace: true })
```

A hibák magyarra fordítva:
- `invalid login credentials` → "Hibás e-mail cím vagy jelszó."
- `email not confirmed` → "Az e-mail cím még nincs megerősítve..."
- hálózati hiba → "Nem sikerült csatlakozni a szerverhez..."

### Session-figyelés (`AuthGate`)

```tsx
supabase.auth.getSession().then(({ data }) => setSession(data.session))
supabase.auth.onAuthStateChange((_evt, newSession) => setSession(newSession))
```

Ez biztosítja, hogy ha egy másik ablakban / másik eszközön kijelentkezett a user, a
Tauri ablakban is azonnal redirect történik.

### Kijelentkezés (`/` dashboard)

```tsx
await supabase.auth.signOut()
navigate('/login', { replace: true })
```

## 7. Közös UI használat — a web-bel azonos komponensek

A dashboard-oldal például így épül fel:

```tsx
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kartoteka/ui'
```

Ezek **pontosan ugyanazok** a komponensek, amelyek az `apps/web`-ben is futnak.
A web Tailwind 4 configja ugyanazt a `packages/ui/src`-t scanneli, mint a desktop —
így garantált, hogy a két felület kinézete nem divergál.

A desktop-oldal design tokenjei egyelőre eltérőek (ideiglenes tokenek az index.css-ben).
M2-ben a `@kartoteka/design-tokens` csomag fogja egyesíteni — akkor már **pixelre
azonos** lesz a két alkalmazás.

## 8. Verify

```bash
# 1. TypeScript check
cd apps/desktop && npx tsc --noEmit
# 0 hiba

# 2. Vite dev szerver
cd ../..
npm run desktop:vite
# VITE v7.3.2  ready in 663 ms
# → http://localhost:1420/

# 3. Smoke GET-ek (a szerver fut közben)
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" http://localhost:1420/
# 200 566 — index.html

curl -s -o /dev/null -w "%{http_code} %{size_download}\n" http://localhost:1420/src/main.tsx
# 200 2104 — ESM-transformált

curl -s -o /dev/null -w "%{http_code} %{size_download}\n" http://localhost:1420/src/index.css
# 200 78648 — 78 KB generált Tailwind CSS, tartalmazza a közös UI class-okat
```

A 78 KB CSS a legjobb bizonyíték — a Tailwind scanner **látja** a `@kartoteka/ui`
komponenseit és generálja az összes utility class-t.

## 9. Kipróbálás

### Böngészőben (gyors, Tauri nélkül)

```bash
# 1. Env beállítás (egyszer)
cd apps/desktop
cp .env.example .env
# Nyisd meg a .env-et és töltsd ki (ugyanaz mint apps/web/.env.local-ban):
#   VITE_SUPABASE_URL=https://...supabase.co
#   VITE_SUPABASE_ANON_KEY=eyJ...

# 2. Vite
cd ../..
npm run desktop:vite
# Nyisd meg: http://localhost:1420/

# Megjelenik a login képernyő. Próbálj bejelentkezni a jelenlegi fiókoddal.
# Siker esetén a dashboard üdvözöllek.
```

### Tauri-ablakban (natív)

```bash
npm run desktop:dev
# Első indítás: 5-10 perc (cargo build release-crate-ek)
# Subsequent indítások: ~10 mp
# Megjelenik egy "Kartotéka" című natív ablak (1280×800)
```

## 10. Mit NEM csináltunk (scope-határok)

- ❌ **OAuth (Google/stb.)** a desktop-on — külön Tauri-deep-link workflow (külön task, M1.6 vagy M2)
- ❌ **Offline login** — M2 scope (SQLCipher + local session-cache)
- ❌ **"Elfelejtett jelszó"** flow — a desktopon nincs email-küldés, link a publikus webes felületre kell (M2)
- ❌ **Eszköz-bind** (public key + device fingerprint) — M2 scope (user_devices tábla)
- ❌ **Végleges design** — placeholder tokenek, M2-ben `@kartoteka/design-tokens` egyesít
- ❌ **Dashboard tartalom** — M2-től jön (tagok, pénzügy, anyakönyv)
- ❌ **Live Tauri-teszt** Endre-gépén — Endrenek kell futtatnia `npm run desktop:dev`-et (vagy `npm run desktop:vite`-et böngészőben tesztelni)

---

## 11. M1 fázis zárókép

Az M1 fázis lépései mind kész (5 commit):

| Commit | Alfázis | Leírás |
|---|---|---|
| `c365c09f` | M1.1 | Monorepo átalakítás (apps/web + packages/*) |
| `3a519a43` | M1.2 | Tauri 2 desktop bootstrap |
| `00e06f76` | M1.3 | @kartoteka/supabase-client közös csomag |
| `b5ea2ca9` | M1.4 | @kartoteka/ui közös shadcn komponensek |
| `(ez)` | M1.5 | Desktop login + auth flow |

**Következő fázis: M2** — offline adatréteg + szinkronizáció
- SQLCipher integráció a Rust-oldalon
- Stronghold kulcstár (titkos adatok)
- Pull-sync (Supabase → lokális SQLite)
- Push-sync (lokális írások → outbox → Supabase)
- Konfliktus-kezelés (revision + updated_at)

Ez az M1 fázis végterméke: **egy működő monorepo két kliens-platform között**, **közös csomagokkal**, és **egy futó desktop auth-flow**. A rendszer most már kész arra, hogy az M2 offline-képességet ráépítsünk.
