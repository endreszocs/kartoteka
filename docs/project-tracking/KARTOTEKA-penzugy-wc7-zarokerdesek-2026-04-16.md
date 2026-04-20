# KARTOTEKA — WC-7 záró döntések és 1 tisztázandó fogalom

**Dátum**: 2026-04-16
**Állapot**: 3 záró kérdésből 2 véglegesítve, 1 tisztázás szükséges

---

## Felhasználói döntések

### 1. Könyvelő regisztrációs flow
**Válasz**: „Regisztráció után az admin vagy az egyházkerületi admin adhat hozzáférést és rendelheti hozzá ahhoz a gyülekezetekhez, amiket könyvel."

**Implementáció**:
1. A könyvelő a normál regisztrációs felületen létrehoz egy fiókot (email + jelszó)
2. A profil alapértelmezetten `status = 'pending'`, `role = 'lelkesz'` (meglévő default)
3. Az **admin** vagy **egyházkerületi admin** (lásd tisztázás alább) az `/admin` felületen látja a függőben lévőket
4. Aktiválja: `status = 'active'`, `role = 'konyvelo'`
5. **Many-to-many** hozzárendelés (lásd 3. pont): kijelöli a gyülekezeteket
6. A könyvelő belépéskor látja a hozzárendelt gyülekezetek listáját, egy **gyülekezetváltó** UI-val dolgozik

### 2. Számvevő hozzárendelés
**Válasz**: „Az egyházmegyei admin is, és a rendszer admin is"

**Implementáció**:
- `egyhazmegyei_admin` rendelhet `egyhazmegyei_szamvevo`-t a **saját** egyházmegyéjébe (a `diocese_id` szűrés)
- `admin` bármely egyházmegyéhez
- RLS policy kivezetésekor erre gondolnunk kell

### 3. Könyvelő hatókör — many-to-many táblával
**Válasz**: „Rögtön many-to-many tábla"

**Implementáció**:

```sql
CREATE TABLE public.profile_congregations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  congregation_id uuid NOT NULL,
  role_scope text NOT NULL DEFAULT 'konyvelo' CHECK (
    role_scope = ANY (ARRAY['konyvelo','egyhazmegyei_szamvevo'])
  ),
  assigned_by uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  active boolean DEFAULT true,
  CONSTRAINT profile_congregations_pkey PRIMARY KEY (id),
  CONSTRAINT profile_congregations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id),
  CONSTRAINT profile_congregations_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id),
  CONSTRAINT profile_congregations_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id),
  CONSTRAINT profile_congregations_unique UNIQUE (profile_id, congregation_id)
);

CREATE INDEX idx_profile_congregations_profile ON public.profile_congregations (profile_id) WHERE active = true;
CREATE INDEX idx_profile_congregations_congregation ON public.profile_congregations (congregation_id) WHERE active = true;

COMMENT ON TABLE public.profile_congregations IS
  'Many-to-many kapcsolat: egy konyvelo vagy szamvevo több gyülekezethez is hozzá lehet rendelve. A lelkész/esperes továbbra is a profiles.congregation_id/diocese_id mezőn (1:1).';
```

**Következmények**:

- A könyvelő **nem** használja a `profiles.congregation_id`-ot (az marad NULL vagy egy „elsődleges")
- A belépéskor a rendszer lekérdezi a `profile_congregations` táblát, és megjeleníti a **gyülekezetváltó** komponenst
- **Aktív gyülekezet** kliens oldali állapot (Zustand / context) + szerver oldali cookie
- Minden pénzügyi lekérdezés az **aktív gyülekezetre** szűrődik
- RLS policy-k: ellenőriznek a `profile_congregations`-ben, nemcsak a `profiles.congregation_id`-ben

### UI követelmények

- **Fejlécen** gyülekezetváltó dropdown (ha a felhasználónak több gyülekezete van)
- Csak `konyvelo` és `egyhazmegyei_szamvevo` szerepkörnek jelenik meg
- Admin felület: **új oldal** a `/admin/felhasználók/<user>/gyülekezetek` — hozzárendelés-kezelés
- Navigációs kontextus: minden oldal megmutatja, melyik gyülekezet kontextusában vagyunk

---

## VÉGLEGES DÖNTÉS (2026-04-16)

> **„Az admin jelentse a rendszergazdai admint, és a kerületi admin az új szerepkör legyen!"**

Ez **3 új szerepkört** jelent (7 szerepkör összesen):

```typescript
type Role =
  | 'lelkesz'                 // meglévő
  | 'esperes'                 // meglévő
  | 'egyhazmegyei_admin'      // meglévő
  | 'egyhazkeruleti_admin'    // ÚJ — districts szinten
  | 'admin'                   // meglévő, most tisztán rendszergazdai
  | 'konyvelo'                // ÚJ — szakmai pénzügyi review
  | 'egyhazmegyei_szamvevo'   // ÚJ — egyházmegyei auditor
```

### Szerepkör-hierarchia

```
admin (rendszergazda)
  └── egyhazkeruleti_admin (kerület szintje)
        └── egyhazmegyei_admin / esperes / egyhazmegyei_szamvevo (egyházmegye)
              └── lelkesz / konyvelo (gyülekezet)
```

### Szerepkörök döntési jogosultságai (levezetve a felhasználói válaszokból + logikai kiegészítéssel)

| Művelet | `admin` | `egyhazkeruleti_admin` | `egyhazmegyei_admin` | `esperes` | Indoklás |
|---|:---:|:---:|:---:|:---:|---|
| Könyvelő aktiválása + gyülekezet-hozzárendelés | ✅ | ✅ | ❌ | ❌ | Felhasználói döntés |
| Számvevő hozzárendelése egyházmegyéhez | ✅ | ✅ | ✅ | ❌ | Felhasználói döntés + kerületi admin logikus |
| Számvevő visszavonása | ✅ | ✅ | ✅ | ❌ | Ugyanott, ahol létrejön |
| Kerületi admin aktiválása | ✅ | ❌ | ❌ | ❌ | Csak rendszer admin |
| `/dashboard-kerulet` elérés | ✅ | ✅ (saját) | ❌ | ❌ | Kerület szint |

### Az előző helyzetkép ma már nem releváns (de dokumentálva marad referenciaként)

A válaszodban **„egyházkerületi admin"** szerepel. Rendszerellenőrzés után pontos helyzetkép:

### Amit a kódban látok

| Elem | Állapot |
|---|---|
| `profiles.district_id` mező | **Létezik** a DB-ben, FK a `districts` táblára |
| `districts` tábla | Létezik, az egyházkerület entitása |
| `Role` type | `'lelkesz' \| 'esperes' \| 'egyhazmegyei_admin' \| 'admin'` — **nincs** `egyhazkeruleti_admin` |
| `/dashboard-kerulet` oldal | **Létezik**, de csak `admin` vagy `master admin` szerepkörnek elérhető (`app/(dashboard)/dashboard-kerulet/page.tsx:25`) |
| `egyhazmegyei_admin` használat | Egyházmegyei dashboardon és admin action-ökben |

### A két lehetséges értelmezés

**(A) A meglévő `admin` a kerület admin is**
- Jelenleg ez a valós helyzet: a `/dashboard-kerulet` oldalt csak `admin` vagy master admin látja
- Az `admin` szerepkör rendszerszintű, de **gyakorlatban** az egyházkerületet képviseli
- Új szerepkör nem kell, csak néhol a megfogalmazást egységesíthetjük (pl. UI-ban „Kerületi admin" címke az admin-nak)
- **Egyszerűbb**, gyorsabb, nem igényel új RLS policy-t

**(B) Új `egyhazkeruleti_admin` szerepkör a `districts` szintjén**
- A minta a meglévő `egyhazmegyei_admin` (dioceses szinten)
- A `profiles.district_id` mező fogja azonosítani a hatókört
- `Role` type bővítése 5-re, majd a könyvelő/számvevő még kettővel → **7 szerepkör**
- RLS policy-k: sok tábla, mindenhol új policy-t kell írni erre
- Következmények:
  - A `dashboard-kerulet` oldalt `egyhazkeruleti_admin` is látja (a saját kerületére szűrve)
  - A könyvelő regisztrációs flow-ban az `egyhazkeruleti_admin` is aktiválhat könyvelőt, de **csak** a saját kerülete alatti gyülekezetekhez
  - A számvevő hozzárendelésnél az `egyhazkeruleti_admin` is jogosult, de **csak** a saját kerülete alatti egyházmegyékhez

### Mire van szükségem a döntéshez

- Az egyházkerületnek **van-e** olyan személy a jelenlegi szervezetben, aki **nem** a rendszer adminja, de a **teljes kerület** pénzügyi adataihoz hozzáférhet?
- Ha **igen** → (B) opció, új szerepkör
- Ha **nem** (az admin = ez a személy) → (A) opció, marad a meglévő szerepkör

### Amit közben előkészítettem (mindkét úthoz)

- A `profile_congregations` many-to-many tábla terve — **független** ettől a döntéstől, készíthető
- TypeScript `Role` bővítés sablon — a (B) esetén +3 érték (`konyvelo`, `egyhazmegyei_szamvevo`, `egyhazkeruleti_admin`), az (A) esetén csak +2
- `canReviewFinancial()`, `canEditTvaFlags()` helper függvények — mindkét úthoz írhatók
- A meglévő role-ellenőrzési pontok listája (rendszerben 4 helyen):
  - `app/(dashboard)/admin/actions.ts`
  - `app/(dashboard)/tagnyilvantartas/family-actions.ts`
  - `lib/auth/effective-access.ts`
  - `lib/auth/roles.ts`
- Mindezek **átírásra szorulnak** a WC-7 során, a választott opció szerint

---

## Ha minden tisztázódott, indulhat a WC-7

### A WC-7 első 4 lépése

Amint az „egyházkerületi admin" kérdése eldőlt:

1. **DB migráció** — `migration-docs/2026-04-16-uj-szerepkorok.sql`
   - `profiles.role CHECK` bővítés az új értékekkel
   - `profile_congregations` új tábla létrehozása
   - (ha kell) `egyhazkerületi_admin` hozzáadása

2. **TypeScript type frissítés** — `lib/types/auth.ts`
   - `Role` enum bővítés

3. **Role helperek** — `lib/auth/roles.ts`
   - `isKonyveloRole()`, `isSzamvevoRole()`
   - `canEditTvaFlags()`, `canReviewFinancial()`
   - Ha új „egyházkerületi admin" is jön: `isEgyhazkeruletiAdminRole()`

4. **RLS policy audit script** — teszt, ami minden szerepkörre minden táblán végigmegy

### Ellenőrzőpont

A 4. lépés után megállok és bemutatom:
- Mi változott adatbázisban
- Milyen RLS policy-k működnek
- Milyen RLS policy-kat kell még hozzáírni

Utána a UI fejlesztés jön (gyülekezetváltó, admin hozzárendelés).

---

## Frissített sorrend

```
WC-0 LEZÁRVA
  ↓
[kérdés: egyházkerületi admin tisztázás]
  ↓
WC-7  Új szerepkörök (konyvelo + egyhazmegyei_szamvevo + many-to-many) — ~8-10 lépés
  ↓
WC-1  TVA figyelő — ~8 lépés
  ↓
WC-2  Oblio / e-Factura — ~14 lépés
  ↓
WC-8  Lokális PDF sync — ~6 lépés
  ↓
WC-3  Amortizáció — ~8 lépés
  ↓
WC-5  Egyházmegyei dashboard — ~4 lépés
  ↓
WC-4  Használati útmutató — ~15+ szekció tartalom
  ↓
WC-6  Zárás
```
