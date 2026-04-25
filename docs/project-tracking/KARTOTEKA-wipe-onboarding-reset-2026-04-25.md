# KARTOTEKA — wipe utáni onboarding reset

**Dátum**: 2026-04-25
**Státusz**: elkészítve, Endre futtatja az SQL-t
**Téma**: resetelt gyülekezetnél nem indult újra a beépített wizard

## Kiinduló probléma

Endre jelezte, hogy egy gyülekezeti reset / wipe után az első belépéskor a
beépített wizardnak újra meg kellett volna jelennie, mert a gyülekezet és a
lelkész alapadatai hiányos állapotba kerültek. Ez nem történt meg.

## Diagnózis

A kódban két külön setup-flow él egymás mellett:

1. **`/welcome` web-onboarding wizard**
   - Fő belépési guard: `apps/web/app/(dashboard)/layout.tsx`
   - Döntés alapja: `profiles.onboarding_completed_at`
   - A kliensoldali wizard további feltétele: `wizard_progress.completed_at`

2. **Dashboard auto-open gyülekezeti setup modal**
   - `apps/web/app/(dashboard)/dashboard/page.tsx`
   - `components/dashboard/congregation-setup-auto-open.tsx`
   - `checkCongregationSetupStatus()` alapján csak a gyülekezeti mezőket figyeli

A wipe-RPC viszont eddig:

- megtartotta a `profiles` sort
- nem nullázta a `profiles.onboarding_completed_at` mezőt
- nem nullázta a `walkthrough_completed` állapotot
- nem törölte a `wizard_progress` sorokat

Ezért reset után a rendszer továbbra is „kész onboarding”-nak látta a profilt.

Kritikus részlet:

- Ha csak a `profiles.onboarding_completed_at` mezőt nulláznánk,
  a `WelcomeWizardClient` a megmaradt `wizard_progress.completed_at` miatt
  azonnal visszadobná a usert a `/dashboard`-ra.

## Választott javítás

Új SQL migráció készült:

- `migration-docs/sql/2026-04-25-wipe-onboarding-reset.sql`

Mit csinál:

- újradefiniálja a `public.wipe_congregation_data(UUID, TEXT)` függvényt
- megtartja a korábbi profile-védelmet (`profiles`, `profile_roles`, `user_devices`, `user_login_attempts` a keep-listában)
- wipe után a `profiles.congregation_id = target_congregation_id` sorokra:
  - `walkthrough_completed = false`
  - `walkthrough_skipped_at = NULL`
  - `onboarding_completed_at = NULL`
- törli a hozzájuk tartozó `wizard_progress` sorokat

## Miért ez a legbiztonságosabb irány

- Nem változtatja meg globálisan a dashboard belépési logikát.
- Nem találgat új „hiányos adat” heurisztikákat.
- Kifejezetten a reset/wipe use-case-re javít.
- Összhangba hozza a DB-állapotot a kívánt termékviselkedéssel: wipe után újrakezdett onboarding.

## Érintett fájlok

- Új: `migration-docs/sql/2026-04-25-wipe-onboarding-reset.sql`

## Következő lépés

Endre futtatja az SQL-t a Supabase SQL editorban, majd egy wipeolt gyülekezetes
felhasználóval újraellenőrzi:

1. belépés
2. `/welcome` wizard megjelenik-e
3. a wizard végigvihető-e
4. utána rendben nyílik-e a dashboard

## Már érintett gyülekezetek egyszeri javítása

Fontos különbség:

- a `2026-04-25-wipe-onboarding-reset.sql` a wipe-függvény jövőbeli futásait javítja
- a már korábban wipe-olt gyülekezeteknél külön egyszeri állapot-helyreállítás kell

Ehhez külön, kézi UUID-megadással futtatható SQL készült:

- `migration-docs/sql/2026-04-25-repair-existing-wiped-onboarding-state.sql`

Ez azért külön fájl, hogy ne találgasson a rendszer gyülekezetet vagy felhasználót:

- csak a megadott `congregation_id`-ra hat
- nem töröl profilt
- csak az onboarding-flag-eket nullázza és a `wizard_progress` sorokat törli
