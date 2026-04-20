# Onboarding refaktor — 2026-04-20

**Cél (a user kérése):** 4 pont — (1) wizard lépésenkénti mentés, (2) egyházmegye megjelenítés Step 2-ben, (3) modern onboarding dizájn + pending screen + walkthrough, (4) offline rendszer újratervezése **külön fázis lesz**.

Az egész csomag **3 fázisra** osztva — az A fázis most kész (wizard perzisztencia), a B (onboarding UI) és C (walkthrough) következik.

---

## A fázis — LEZÁRVA (2026-04-20)

**Lényeg**: a wizard állapota most minden lépés után **Supabase-be ment**. A lelkész kilépés után onnan folytatja, ahol abbahagyta. Az egyházmegye neve megjelenik a Step 2-ben, ha a gyülekezethez már be van állítva. A web-módban (nem-standalone) a wizard Step 2-től indul (a licensz-lépés kimarad). A dashboard layout guard a nem-onboardolt user-t a `/welcome`-ra tereli.

### SQL migráció

**Fájl**: `migration-docs/sql/2026-04-20-wizard-onboarding-schema.sql`

**Tartalom:**
1. `profiles` bővítés: `walkthrough_completed`, `walkthrough_skipped_at`, `onboarding_completed_at` oszlopok (`ADD COLUMN IF NOT EXISTS`).
2. Új tábla `wizard_progress` — `user_id` PK, `current_step`, `completed_steps`, `data jsonb`, `started_at`, `completed_at`, `updated_at`. GRANT + RLS (5 policy: 4 saját + 1 admin) + trigger az `updated_at`-ra.
3. `dioceses` seed — 15 erdélyi egyházmegye, `WHERE NOT EXISTS` alapon (idempotens).
4. Fájl végén 6 diagnosztikus SELECT (a `feedback_sql_ellenorzes_egyben.md` szerint) — a migráció helyességét méri.

**Futtatás**: Endre dolga (Supabase Studio).

### Új fájlok

| Fájl | Szerep |
|---|---|
| `app/(setup)/welcome/actions.ts` | `getCongregationContext`, `getWizardProgress`, `saveWizardStep`, `restartWizard`, `completeWizard` server actions |
| `components/standalone/wizard/step-5-finish-web.tsx` | Step 5 web-specifikus befejező (`completeWizard` hívás + redirect) |
| `migration-docs/sql/2026-04-20-wizard-onboarding-schema.sql` | SQL migráció (fent) |

### Módosított fájlok

| Fájl | Mi változott |
|---|---|
| `app/(setup)/welcome/page.tsx` | `isStandaloneMode()` detektálás, `mode` prop átadás a kliensnek |
| `components/standalone/welcome-wizard-client.tsx` | `mode` prop, `getWizardProgress` init, `saveStep` handler-ek, Step 5 mode-aware render |
| `components/standalone/wizard/step-2-congregation.tsx` | **Egyházmegye badge** (Landmark ikon), `saving` prop, async `onNext` |
| `components/standalone/wizard/step-3-pastor.tsx` | `saving` prop, async `onNext`, Loader2 ikon |
| `components/standalone/wizard/step-4-finance.tsx` | `saving` prop, async `onNext`, Loader2 ikon |
| `app/(dashboard)/layout.tsx` | Új onboarding guard — ha `profile.onboarding_completed_at IS NULL` + gyülekezeti kontextus → `redirect('/welcome')` |

### Ellenőrzés

- `npx tsc --noEmit` → exit 0 ✓
- `npx eslint <módosított fájlok>` → exit 0 ✓
- SQL fájl self-check: 6 diagnosztikus SELECT a végén, a Supabase Studio futtatáskor látható eredménnyel

### Schema drift megjegyzés

A diagnózis közben felfedeztem: a `save-initial` endpoint `congregations.bejegyzesiszam`, `bealitas.nyito_keszpenz`, `bealitas.nyito_bank` mezőket INSERT-el, de ezek a `Database_schema.sql` szerint **nem léteznek**. Vagy a schema.sql elavult (valós DB-ben léteznek), vagy a `save-initial` kód hibás és csendben null-eredménnyel fut.

**A `completeWizard` védelme**: a kétes mezőket külön try-block-okban írjuk, ha a mező nem létezik, csak console-ra log-ol, nem bukik az egész folyamat.

**Javasolt utólagos feladat**: külön diagnosztikai SQL-ben ellenőrizni ezeket a mezőket a valós DB-ben, és ha hiányoznak, vagy hozzáadni, vagy a `save-initial` kódot javítani.

### Mit ad a lelkésznek

- **Kilépés után folytatás**: Step 2-n félbehagyta → visszajön, Step 2-ről folytatódik (de a kitöltött mezők visszatöltve).
- **Egyházmegye vizuális megjelenítés**: Step 2 tetején sky-színű infopanel az egyházmegye nevével.
- **Biztonságos mentés**: minden Tovább gomb DB-be commitol előbb, utána lép.
- **Web + standalone egy kódbázison**: a runtime detektálás dönti el, Step 1 kell-e vagy sem.

---

## B fázis — LEZÁRVA (2026-04-20, délután)

**Lényeg**: a bejelentkezés és regisztráció modern, barátságos és animált. A regisztrált, de még nem jóváhagyott lelkészek egy szép várakozó képernyőt látnak, nincs többé kidobó `/login?error=pending` üzenet.

### Új fájlok
- `app/(auth)/pending/page.tsx` — pending route server-side status ellenőrzéssel
- `app/(auth)/pending/actions.ts` — signOutFromPending server action
- `components/auth/pending-approval-client.tsx` — animált UI, keresztnévvel megszólítás, pulse ring, kijelentkezés

### Átírt fájlok
- `app/(auth)/layout.tsx` — split-panel (desktop: bal űrlap / jobb hero-panel biblia idézettel; mobile: csak űrlap)
- `app/(setup)/layout.tsx` — mode-aware (standalone licensz-check + web auth+status+onboarding check)
- `app/(dashboard)/layout.tsx` — pending status → redirect `/pending` (előtte signOut+login volt)
- `components/auth/register-form.tsx` — 3-szekciós checklist: Személyes / Szolgálat / Fiók, framer-motion staggerrel, zöld pipák
- `app/(auth)/register/actions.ts` — bővített mentés: birth_date, diocese_id, service_started_at (pastor_profiles preemptív)
- `lib/validations/auth.ts` — registerSchema és oauthCompleteSchema bővítés
- `lib/broadcasts/email.ts` — felesleges `@ts-expect-error` eltávolítva

### Ellenőrzés
- `npx tsc --noEmit` → **exit 0** (0 hiba)
- `npx eslint` → **exit 0** (0 figyelmeztetés)
- Dokumentálva: CHANGELOG (2026-04-20b bejegyzés), Obsidian vault (napló frissítve)

### Nyitott: a B fázis minor update
- Login form framer-motion fade-in (kb. 10 sor kód)
- Wizard step-átmenetek (Step 1 → 2 → 3... animáció)
- Ezek a B fázis UX-polish-jának folytatása, önálló commit-tal

## C fázis — LEZÁRVA (2026-04-20, késő délután)

**Lényeg**: a dashboard-ra érkező lelkészt **automatikus interaktív túra** fogadja — spotlight overlay-vel, pulzáló amber kerettel, lépésről lépésre bemutatja a sidebar menüpontjait. 10 step, keresztnévvel szólítás. Minden lépés kihagyható (Esc vagy "Kihagyom" gomb). Befejezéskor vagy kihagyáskor `profiles.walkthrough_completed = true`.

Emellett új **HelpTooltip** primitív, amit a modulok mellé bárhol tehetünk kérdőjeles súgóként. A wizard step-átmenetek és a login form is framer-motion animációt kaptak.

### Új fájlok (4)
- `app/(dashboard)/profile/walkthrough-actions.ts` — 3 server action (markComplete, skip, restart)
- `components/onboarding/walkthrough/walkthrough-steps.ts` — 10 step konfiguráció
- `components/onboarding/walkthrough/walkthrough-client.tsx` — spotlight + tooltip + navigation
- `components/ui/help-tooltip.tsx` — kérdőjeles popover

### Átírt fájlok (4)
- `app/(dashboard)/layout.tsx` — profile lekérdezés bővítése, `extractFirstName()` helper, WalkthroughClient render
- `components/layout/sidebar-adaptive-v4.tsx` — `data-walkthrough` attribútumok (menüpontok + sidebar wrapper)
- `components/standalone/welcome-wizard-client.tsx` — AnimatePresence + step-átmenetek + progress bar animáció
- `components/auth/login-form.tsx` — framer-motion stagger

### Ellenőrzés
- `npx tsc --noEmit` → **exit 0** (0 hiba)
- `npx eslint` → **exit 0** (0 figyelmeztetés)
- Dokumentálva: CHANGELOG (2026-04-20c bejegyzés), Obsidian vault (napló frissítve)

### Nyitott — apró polish
- `data-walkthrough="user-menu"` a headerben, `data-walkthrough="dashboard-widgets"` a `/dashboard` page-en (jelenleg ezek a step-ek target nélkül center-ben lebegnek, ami működik, csak nem pontos)
- Profile oldalon egy "Túra újraindítása" gomb a `restartWalkthrough()`-hoz — support/debug célra

---

## A teljes onboarding csomag — ÉLES

A 3 fázis együtt **egy komplett onboarding élményt** ad:

1. **A (SQL + server)**: wizard lépésenkénti mentés, egyházmegye badge, web-módú wizard, dashboard layout guard
2. **B (UI/UX)**: split-panel auth layout, 3-szekciós checklist regisztráció, pending várakozó képernyő, setup layout mode-aware
3. **C (interaktív)**: walkthrough + tooltipek + wizard animációk + login animációk

**Eredmény**: a regisztrációtól a dashboard-ra érkezésig a lelkész **egy végigvezetett, animált, barátságos folyamatot** él át — a WOW-faktor, amit Endre kért.
