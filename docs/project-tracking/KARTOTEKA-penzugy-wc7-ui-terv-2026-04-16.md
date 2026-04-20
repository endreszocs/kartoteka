# KARTOTEKA — WC-7.5 / 7.6 / 7.7 / 7.8 — UI integráció és felhasználókezelés

**Dátum**: 2026-04-16
**Állapot**: tervezés → implementáció
**Előfeltétel**: WC-7.1-7.4 KÉSZ (DB + helper + RLS)

---

## 🛡️ VEZÉRELV — Gyülekezeti autonómia

> Minden gyülekezet önálló és autonóm. A lelkész explicit jóváhagyása nélkül könyvelő és számvevő nem fér hozzá. A UX hangnem végig tiszteletteljes — a lelkész sosem érezheti, hogy az engedélye nélkül történik bármi a gyülekezete adataival.

---

## Alfeladatok és fájlok

### WC-7.5 — `effective-access.ts` és sidebar bővítés

**Cél**: a 7 szerepkör integrálása a rendszer auth/layout rétegébe.

**Fájlok**:
- `lib/auth/effective-access.ts`:
  - új derived prop: `isEgyhazkeruletiAdmin`
  - új derived prop: `isKonyvelo`
  - új derived prop: `isSzamvevo`
  - új derived: `assignedCongregations` — approved hozzárendelések listája (konyvelo/szamvevo számára)
- `components/layout/dashboard-layout-client.tsx`:
  - a fenti új prop-ok átadása a sidebar-nak
- `components/layout/sidebar-adaptive-v4.tsx`:
  - új `SidebarProps` mezők: `isEgyhazkeruletiAdmin`, `isKonyvelo`, `isSzamvevo`
  - az `isAdmin` átadás helyett `isEgyhazkeruletiAdmin` használata a `districtItems` szekcióra
  - új szekció: **Pénzügyi review** (konyvelo/szamvevo) — csak a Pénzügy menü + a hozzárendelt gyülekezetek választó
  - UX: ha konyvelo/szamvevo és 0 approved hozzárendelés → üdvözlő üzenet: „Várakozás lelkészi jóváhagyásra"

### WC-7.6 — Admin felület: könyvelő/számvevő hozzárendelés

**Cél**: az admin és kerületi admin hozzárendelhet könyvelőt/számvevőt gyülekezetekhez.

**Fájlok**:
- `app/(dashboard)/admin/profile-congregations-actions.ts` — ÚJ
  - `createAssignmentRequest(profileId, congregationId, roleScope, reason)` — a lelkésznek kérést küld, értesítést ír
  - `listAssignments(filter)` — lista minden hozzárendelésről (szerepkör szerint szűrt)
  - `revokeAssignment(id, reason)` — admin visszavonása
- `components/admin/profile-congregations-tab.tsx` — ÚJ admin subtab
  - Felhasználó + gyülekezet választás
  - Kötelező magyarázat ("miért kérjük ezt a hozzáférést")
  - **Lista**: aktuális hozzárendelések, státuszokkal (pending, approved, rejected, revoked)
  - Küldés → `ertesitesek` sor a lelkésznek
- `components/admin/users-tab.tsx` bővítés:
  - `ROLES` array → 7 szerepkör
  - Új szerepkörhöz új választó + további lépés (gyülekezet hozzárendelés)

### WC-7.7 — Lelkészi jóváhagyási felület

**Cél**: a lelkész tiszteletteljes, de kontrollált felületen lássa és kezelje a gyülekezetéhez érkezett hozzáférési kéréseket.

**Fájlok**:
- `app/(dashboard)/profile/kapcsolatok/page.tsx` — ÚJ oldal
  - Lista: pending / approved / rejected / revoked
  - Jóváhagy / Elutasít / Visszavon gombok
- `app/(dashboard)/profile/kapcsolatok/actions.ts` — ÚJ
  - `approveAssignment(id)` — active = true, approval_status = approved, approved_at, approved_by
  - `rejectAssignment(id, reason)` — approval_status = rejected
  - `revokeAssignment(id, reason)` — active = false, approval_status = revoked
  - Minden művelet értesítést küld vissza az adminnak (aki kezdeményezte) és az érintett könyvelőnek/számvevőnek
- `components/layout/header-refined-v3.tsx`:
  - Notification bell bővítés — pending kérés counter a lelkésznek
- **UX tón**:
  - Tiszteletteljes megfogalmazás: „[admin neve] kérte, hogy [könyvelő neve] hozzáférhessen a gyülekezet adataihoz. Indok: [reason]. Te döntesz."
  - „Jóváhagyás" / „Elutasítás" gombok szélesebb magyarázattal
  - Visszavonáskor (approved → revoked) is kötelező indoklás

### WC-7.8 — Szerepkör-ellenőrzési pontok audit az app-ban

**Cél**: végigmenni a ~4 meglévő fájlon (`admin/actions.ts`, `tagnyilvantartas/family-actions.ts`, `lib/auth/effective-access.ts`, `lib/auth/roles.ts`) és minden `role ===` vagy `isAdminRole` ellenőrzést auditálni.

**Nem szabad elfelejteni**:
- Bármilyen Server Action, ami szerepkör szerint szűr, fel kell készüljön a 3 új szerepkörre
- Ahol eddig csak „admin" volt → most lehet „admin VAGY egyhazkeruleti_admin" (a kerületi admin helyén)
- `konyvelo` és `szamvevo` szerepkörök: NE kapjanak meg olyan jogosultságot, amit nem akarunk (pl. tagi adatok módosítása → tilos)

---

## Sorrend

1. **WC-7.5** (legalapvetőbb, minden ezen alapul)
2. **WC-7.6** (admin kezdeményezhet hozzárendelést)
3. **WC-7.7** (lelkész jóváhagyhat/elutasíthat)
4. **WC-7.8** (audit, végső polish)

---

## Mit írjunk most meg, mit későbbre?

### MOST (ebben a körben)

- **WC-7.5**: bővítések a `effective-access.ts`-ben + sidebar
- **Minimális WC-7.6**: `ROLES` bővítés a `users-tab.tsx`-ben, hogy legalább beállítható legyen a szerepkör. A teljes profile_congregations admin felület későbbre
- **WC-7.8**: gyors grep audit, hogy nincsen-e törött hivatkozás az új szerepkörökhöz

### KÉSŐBBRE (külön kör)

- Teljes WC-7.6 (`profile-congregations-tab.tsx` + actions)
- Teljes WC-7.7 (lelkészi jóváhagyási felület)

**Ok**: a teljes UI-kör nagy munka. Ha elindulunk a WC-1-tel (TVA figyelő), időközben megcsinálhatjuk a WC-7.6/7.7-et. A WC-7.5 + WC-7.8 elég ahhoz, hogy a rendszer ne törjön.

---

## Kockázat

Az `effective-access.ts` módosítása **rendszerszintű** változtatás — ha hibázom, sok oldal elromolhat. Ezért:
- Tsc és ESLint minden lépés után
- A layout prop-okat **backward compatible** módon bővítem (új mezők opcionálisak, `?: boolean` típusként)
- Minden új szerepkör „alapértelmezésben" hozzáférés nélkül indul (rendszerszintű dashboard nem mutat nekik semmit, amíg ki nem dolgozzuk)
