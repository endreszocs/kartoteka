# KARTOTÉKA — M0.5 audit-log VIEW + Google OAuth production redirect javítás (2026-04-25)

**Fázis**: M0.5 hotfix (Tauri-infra admin) + production OAuth konfiguráció
**Dátum**: 2026-04-25
**Típus**: Bugfix (két éles hiba elhárítása)
**Deploy**: Endre engedélyére vár; ez a project log a kódváltozásokat dokumentálja, a Supabase/Railway konfigurációs lépéseket Endre maga végzi

---

## 1) Mit javítottunk

### 1.1 Google OAuth `localhost:3000` redirect productionben

**Tünet**: A Railway production deploy-on (`https://kartotekaweb-production.up.railway.app`) a Google fiókos bejelentkezés `http://localhost:3000`-ra dobja vissza a felhasználót, ahelyett hogy a Kartotéka élő címére térne vissza. Ezzel Googlevel senki nem tud bejelentkezni a production webfelületen.

**Diagnózis**: A frontend (`apps/web/components/auth/oauth-buttons.tsx:19`) `window.location.origin`-t ad át a Supabase `signInWithOAuth({ redirectTo })`-jának. Productionben ez helyesen `https://kartotekaweb-production.up.railway.app`. A Supabase azonban a `redirectTo`-t **csak akkor fogadja el**, ha az URL szerepel az engedélyezett listán (Site URL vagy Redirect URLs). Ha nem, **silent fallback** a Site URL-re — ami valószínűleg `http://localhost:3000`. Tehát a kód **nem hibás**, a gyökérok a Supabase Auth Dashboard URL-allowlist hiányossága.

**Megoldás (Endre csinálja a dashboardokon)**:
- Supabase Dashboard → Authentication → URL Configuration:
  - **Site URL**: `https://kartotekaweb-production.up.railway.app`
  - **Redirect URLs** lista (külön sorok):
    - `https://kartotekaweb-production.up.railway.app/auth/callback`
    - `https://kartotekaweb-production.up.railway.app/oauth-complete`
    - `http://localhost:3000/auth/callback` (fejlesztéshez)
    - `http://localhost:3000/oauth-complete` (fejlesztéshez)
- Railway Dashboard → `triumphant-grace` → `@kartoteka/web` → Variables:
  - `NEXT_PUBLIC_APP_URL = https://kartotekaweb-production.up.railway.app`
  - `NEXT_PUBLIC_SITE_URL = https://kartotekaweb-production.up.railway.app`

A Railway env változók mentése automatikus redeploy-t indít. A Supabase Dashboard mentés azonnal érvényes.

**Hatás**: a `apps/web/app/(dashboard)/admin/access-requests-actions.ts:154` és `apps/web/app/(public)/hozzaferes-kerese/actions.ts:157` admin invite e-mailek a helyes URL-t adják, és a `sitemap.ts` / `robots.ts` is a Railway URL-t. A Google OAuth flow visszatérési pontja immár nem `localhost`.

### 1.2 Admin → „Eszközök, licencek, napló" → Napló fül `audit_log` ↔ `profiles` relationship hiba

**Tünet**: Az M0.5 admin Napló sub-tab Supabase hibát kap:
> `Could not find a relationship between 'audit_log' and 'profiles' in the schema cache`

**Diagnózis**: A `migration-docs/sql/2026-04-23-m0-5-devices-licenses-audit.sql:121–132` definíciója szerint az `audit_log.user_id` `REFERENCES auth.users(id) ON DELETE SET NULL` (nullable). A társ-táblák (`user_devices.user_id`, `licenses.user_id`) viszont `NOT NULL ... ON DELETE CASCADE` — ezeknél ugyanez a `profiles!user_id(...)` syntax működik. A nullable FK + a `profiles`-ra mutató közvetlen FK hiánya miatt a PostgREST relationship inference itt nem találja a kapcsolatot.

**Megoldás**: új lapos DB nézet, `audit_log_with_profiles`, ami az `audit_log + profiles` LEFT JOIN-t adja `WITH (security_invoker = true)` opcióval. Az invoker user RLS-je érvényben marad mind az `audit_log`, mind a `profiles` rétegen — semmilyen RLS-megkerülés nem történik. A frontend `listAuditLog` egyetlen sorban átáll a VIEW-ra; a mapping a már lapos rekordot olvassa.

**Migration file**: `migration-docs/sql/2026-04-25-m0-5-audit-log-view.sql` — futtatható + ellenőrző SELECT-ekkel egyben (`feedback_sql_ellenorzes_egyben.md` szerint).

### 1.3 Memory útvonal-hivatkozások felülvizsgálata

**Tünet**: Endre kérése, hogy a memory fájlokban a régi `D:\Egyházi APP` és `C:\Users\Barátosi Egyház` útvonalak frissüljenek.

**Eredmény**: Két körös sweep (szigorú + bővített) — a 37 memory `.md` fájlban **0 cserélendő hivatkozás**. A `D:` drive nincs sehol; idegen felhasználói nevek (`C:\Users\<nem-endre>`) nincsenek; régi domainek, régi projektnév-variánsok, régi GitHub repo-k mind tiszták. Egy szövegkörnyezeti `Barátosi` előfordulás van (`project_dev_toolchain_windows.md:65`) UTF-8 mojibake illusztrációhoz — **NEM** path. Egy opcionális modernizálási lehetőség: `feedback_dokumentalj_mindent.md:3` description Obsidian → Notion (a 2026-04-25 átállás reflektálása). **Nem kötelező, kihagyva**.

---

## 2) Érintett fájlok

### Új fájlok

| Fájl | Cél |
|------|-----|
| `migration-docs/sql/2026-04-25-m0-5-audit-log-view.sql` | SQL migration: `audit_log_with_profiles` VIEW + GRANT + ellenőrző SELECT-ek |
| `docs/project-tracking/KARTOTEKA-M0-5-audit-view-oauth-config-2026-04-25.md` | Ez a project log |

### Módosított fájlok

| Fájl | Sor/régió | Változás |
|------|-----------|----------|
| `apps/web/app/(dashboard)/admin/devices-licenses-actions.ts` | 232–266 (`listAuditLog`) | `from('audit_log')` → `from('audit_log_with_profiles')`, `select('*, profiles!user_id(email)')` → `select('*')`, mapping átállás `row['user_email']`-re |
| `docs/CHANGELOG.md` | tetejére új bejegyzés (parser-formátum) | `key: 2026-04-25-oauth-prod-redirect-and-audit-log-view`, category: bugfix |

### Manuális (Endre dashboardokon)

| Helyszín | Művelet |
|----------|---------|
| Supabase Dashboard → Authentication → URL Configuration | Site URL + Redirect URLs frissítése |
| Railway Dashboard → @kartoteka/web → Variables | `NEXT_PUBLIC_APP_URL` + `NEXT_PUBLIC_SITE_URL` env változók |
| Supabase Studio SQL Editor | `migration-docs/sql/2026-04-25-m0-5-audit-log-view.sql` futtatása |

### NEM módosul

- `packages/` — nincs változás
- `apps/desktop/` — nincs változás (Tauri kliens érintetlen)
- `apps/web/components/auth/oauth-buttons.tsx` — `window.location.origin` jó productionben, ha az allowlist rendben
- `apps/web/app/(auth)/auth/callback/route.ts` — érintetlen
- `apps/web/app/(dashboard)/admin/devices-licenses-shared.ts` (`AuditLogEntry` típus) — érintetlen, a meglévő `user_email?: string | null` mező elég
- `listUserDevices`, `listLicenses` — működnek, NOT NULL FK miatt nem szenvednek a problémától

---

## 3) Verification

### 3.1 SQL futtatás után (Endre, Supabase Studio)

A migration fájl végén futtatható ellenőrző SELECT-ek:
- `view_exists`: 1 (status: OK)
- `security_invoker`: reloptions tartalmazza `security_invoker=true`-t (status: OK)
- `grants_authenticated`: ≥1 (status: OK)
- `sample_count`: a meglévő audit-log sorok száma
- `sample_rows`: legutóbbi 3 rekord ID + action + user_email + created_at

### 3.2 Frontend lokál (`npm run dev --workspace=@kartoteka/web`)

1. `/admin?tab=devices-licenses` → Napló sub-tab
2. Várt: lista feltöltődik, a toast nem ad hibát; ha vannak korábbi access_request.approve/reject sorok, a `user_email` mező ki van töltve
3. NEM admin user esetén: `requireAdmin` továbbra is blokkol → "Csak rendszergazda férhet hozzá."

### 3.3 Production verification (csak deploy után — Endre engedéllyel)

1. Inkognitó ablak → `https://kartotekaweb-production.up.railway.app/login` → Google bejelentkezés → várt: visszatér ugyanennek a domainnek a `/auth/callback` címére (NEM localhost), majd a megfelelő dashboard
2. Admin user → `/admin` → Eszközök, licencek, napló → Napló fül → audit-bejegyzések listája

---

## 4) Rizikó-megfontolások

1. **PostgreSQL verzió**: a `WITH (security_invoker = true)` opció PG 15+ kell. Supabase modern instance-okon alapértelmezett. Az ellenőrző SELECT 3.2 ezt explicit jelzi.
2. **Supabase schema cache TTL**: a VIEW létrehozása után 30–60 mp-ig nem feltétlen látszik PostgREST-en. Ha az első frontend-teszt hibás, várj egy keveset; opcionális reset: `NOTIFY pgrst, 'reload schema';` Supabase Studio-ban.
3. **`AuditLogEntry` típus**: a frontend `row['user_email']` mintát használ (Record<string, unknown> cast), nem szigorú típus. A VIEW oszlop-szignatúra (`user_email TEXT`) pontosan illik.
4. **OAuth deep-link a Tauri desktop-hoz (M5+)**: a jövőbeli Tauri kliensnek `kartoteka://auth/callback` deep-link redirect kell — ezt az M5-be tervezzük, most NEM adjuk hozzá a Redirect URLs-hez.

---

## 5) Konvenciók követése

- ✅ `feedback_supabase_access.md` — SQL fájlt írtam a `migration-docs/sql/`-be, Endre futtatja
- ✅ `feedback_sql_ellenorzes_egyben.md` — ellenőrző SELECT-ek futtatható formában a fájl végén, status oszloppal
- ✅ `feedback_tauri_rls_kotelezo.md` — VIEW `security_invoker=true` opciója megőrzi az alaptábla RLS-eket
- ✅ `feedback_check_source.md` + `feedback_verify_before_change.md` — minden DB és kód állapotot olvasással ellenőriztem (`migration-docs/sql/2026-04-23-m0-5-devices-licenses-audit.sql`, `devices-licenses-actions.ts`, `oauth-buttons.tsx`, `auth/callback/route.ts`, `devices-licenses-shared.ts`)
- ✅ `feedback_dokumentalj_mindent.md` — operatív log + CHANGELOG; Notion napló külön Endre + Claude együtt
- ✅ `feedback_changelog_mentes.md` — parser-formátum, egyedi `key`, `category: bugfix`, dátum-regex helyes (`## [2026-04-25]`)
- ✅ `Ne deployolj addig amíg nem kérem` — kódváltozás lokál branchen, commit/push csak Endre engedélyével

---

## 6) Hátralévő lépések

1. ⏳ Endre futtatja: `migration-docs/sql/2026-04-25-m0-5-audit-log-view.sql` Supabase Studio-ban
2. ⏳ Endre Supabase Dashboard URL Configuration mentés
3. ⏳ Endre Railway env változók mentés
4. ⏳ Helyi `npm run dev` smoke test (Napló fül)
5. ⏳ Endre engedélyezi a deploy-t → commit + push
6. ⏳ Production verification (OAuth + audit_log)
7. ⏳ Notion napló-oldal: „2026-04-25 — OAuth production redirect + audit_log VIEW" — Endre + Claude együtt rögzíti
