# Sprint U.5 · Felhasználók és Szerepkörök egyesítése

**Verzió:** v0.9.46 → **v0.9.47** (csak web, Railway auto-deploy). Desktop NEM érintett.
**Lezárás dátuma:** 2026-05-03

## Háttér és kiváltó panasz

Endre észlelte, hogy egy lelkésznek (`beketivadar@gmail.com`) a `/admin/szerepkorok` oldalon kiosztott szerepkört, mégis a login formon a *„Fiókja még jóváhagyásra vár a kerületi SzuperAdmin által!"* üzenetet kapta belépéskor. A felmérés három érdemi problémát tárt fel:

1. **A „jóváhagyás" kettős fogalma** (Diag-1): a `createProfileRole` nem érintette a `profiles.status` mezőt — csak a `profile_roles` táblát írta. A login form `profiles.status === 'active'`-t nézi.
2. **Admin guard-rétegek inkonzisztenciája** (Diag-2): a `admin/layout.tsx`, `requireMasterAdmin()` és `canManage()` három különböző szabállyal védte ugyanazt — egy `egyhazkeruleti_admin` beléphetett a layoutba, de minden gomb hibára futott.
3. **`ertesitesek` mezőnév-hibák** (Diag-3): az `actions.ts` `quickApproveUser/approveUser/deleteUser` `type/title/body` mezőkkel írt, ami silent fail-elt — a tábla `cim/uzenet/tipus/olvasva` mezőket vár.

## Felhasználói döntések (AskUserQuestion)

- **D1**: `/admin/felhasznalok` egyesített + `/admin/szerepkorok` redirect.
- **D2**: Auto-szinkron `profile_roles` → `profiles.role` szerver-helperrel.
- **D3**: Minden szerepkör/user-művelet audit-loggolva.
- **D4**: Bulk csak Excel-export, single-user akciók egyenként.
- **D5**: Lelkészi jóváhagyás audit-bővítés ebben a sprintben.
- **D6**: szerepkör-kiosztás aktiválja a pending fiókot is.
- **D7**: közös `requireAdminAccess` helper.

## Fázisok

### F1 · Helper-réteg (5 új fájl)
- `apps/web/lib/audit/log.ts` — `logAuditEvent` a `log_audit_event` SQL function fölé
- `apps/web/lib/users/sync-legacy-role.ts` — `profiles.role` szinkronizálás
- `apps/web/lib/users/types.ts` — közös típusok
- `apps/web/lib/users/activate-on-role-assign.ts` — D6 megvalósítás
- `apps/web/lib/auth/admin-access.ts` — D7 közös guard

### F2 · Server actions konszolidálás
- `actions.ts`: `requireMasterAdmin` átdelegál a `requireAdminAccess`-re. `quickApproveUser/approveUser/deleteUser` mezőnév-fix + audit. `approveUser` automatikusan `lelkesz` profile_role-t illeszt be. Új `rejectPendingUser`. `updateUserRole` deprek álva.
- `profile-roles-actions.ts`: `canManage` cserélve `requireAdminAccess`-re. `createProfileRole` audit + auto-activate (D6) + sync. `revokeProfileRole` audit + sync.

### F3 · Komponens-aldirectory váz (9 fájl)
- `user-card-skeleton.tsx`, `empty-state.tsx`, `role-badge-inline.tsx`
- `role-assign-popover.tsx` (D6 banner pending-en)
- `advanced-role-dialog.tsx` (átemelt CreateProfileRoleDialog + D6 banner)
- `approve-pending-dialog.tsx`, `reject-pending-dialog.tsx`
- `delete-user-dialog.tsx`, `revoke-role-dialog.tsx` (AlertDialog-szerű)

### F4 · UnifiedUsersTab fő komponens
- `pending-user-actions.tsx`, `user-card.tsx`, `unified-users-tab.tsx`
- `users-tab.tsx` és `profile-roles-tab.tsx` egysoros re-export-okká szűkültek

### F5 · Page, sidebar, admin layout, login üzenet
- `/admin/felhasznalok/page.tsx` — UserCog ikon, violet→indigo gradient
- `/admin/szerepkorok/page.tsx` — `redirect('/admin/felhasznalok')`
- `dashboard-layout-client.tsx` — Szerepkörök menüpont eltávolítva, Felhasználók ikon UserCog-ra
- `admin-overview-dashboard.tsx` — Szerepkörök tile eltávolítva, Felhasználók description frissítve
- `admin-tabs-v3.tsx` — `roles` tab eltávolítva
- `admin/layout.tsx` (D7 fix) — `master || admin || egyhazkeruletiAdmin` kapu
- `login/actions.ts`, `login/page.tsx`, `oauth-complete/actions.ts`, `register/actions.ts`, `pending-approval-client.tsx` — pasztorális üzenet 4 helyen

### F6 · Lelkészi jóváhagyás audit (D5)
- `profile/kapcsolatok/actions.ts` `approveAssignment/rejectAssignment/revokeAssignmentByPastor` mind audit-loggolva (`profile_congregation.{approve,reject,revoke}` action-ökkel)

### F7 · UX polish
A Sprint U.5 keretében már F3-F4-ben implementált:
- Skeleton loading state a `UnifiedUsersTab`-ban
- Optimistic UI a `useTransition`-ön át
- AlertDialog-szerű modálok confirm/prompt helyett (4 modál)
- Mobile-first reszponzív card-ok

### F8 · Dokumentáció + verify
- `docs/CHANGELOG.md` új bejegyzés (`2026-05-03d`)
- `docs/release-notes-v0.9.47.md` új release notes
- `apps/web/package.json` v0.9.47-re bumpolva
- `MEMORY.md` index + `feedback_unified_users_szerepkorok.md` + `project_aktiv_fejlesztes.md` frissítve
- Project log (ez a fájl)

## Build verify

- **Lint**: `npm run lint` a Sprint U.5 érintett ~25 fájlra **zöld**.
- **Build**: `npm run build` jelenleg uncommitted **deleted** fájlok miatt nem fut le:
  - `apps/web/components/finance/finance-import/steps/*` (7 fájl)
  - `apps/web/public/sw*.js` (2 fájl)
  - Ezek Endre korábbi munkájához tartoznak (a finance-import wizard v1 LEZÁRVA volt v0.9.46-ban a CHANGELOG szerint).
  - **A release előtt Endre rendezi**: `git restore` vagy `git add` + commit.

## Manual smoke (tervezett)

1. Master admin login → `/admin/felhasznalok` → user-cards skeleton → tényleges lista.
2. Pending user → "Gyors jóváhagyás" → toast + reload + `ertesitesek` insert működik.
3. Pending user → "Részletes jóváhagyás" → modal → diocese + congregation → toast + auto `lelkesz` profile_role.
4. Pending user → "Elutasítás" → modal + indoklás → toast + audit-log.
5. **D6 SMOKE — a panasz okozta bug**: pending user → "+ Új szerepkör" → borostyán-banner → 2-lépcsős flow → szerep kiosztva → user `status` automatikusan `active` → audit-log két event (`profile_role.assign` + `user.activate_via_role_assign`) → **a lelkész be tud lépni**.
6. Active user → "+ Új szerepkör" popover → optimistic role-badge → server-confirm.
7. Role-badge × hover → revoke → AlertDialog + indoklás → szürkül.
8. Active user → "Törlés" → AlertDialog "TÖRLÉS" megerősítés → toast.
9. `/admin/szerepkorok` → automatikus redirect.
10. **D7 SMOKE**: `egyhazkeruleti_admin` user → `/admin/felhasznalok` → működik (korábban hibára futott).
11. Pasztorális login-üzenet pending user-nél.
12. Mobile (390×844): card teljes egészében, popover auto-flip.

## Sprint U.6 előjegyzés

- A többi admin-action (`access-requests-actions`, `broadcasts-actions`, `devices-licenses-actions`, `wipe-actions`, `system-finance-actions`, `profile-congregations-actions`) is `requireAdminAccess`-en át menjen.
- A `users-tab.tsx` és `profile-roles-tab.tsx` re-export wrapper teljes eltávolítása (admin-tabs-v3 közvetlen UnifiedUsersTab-import).
- Permissions JSONB editor a `profile_roles.permissions` mezőhöz.
- Audit-log böngésző UI az admin oldalon.
- Profile switcher / dual-role active context cookie (multi-role Fázis 4).
