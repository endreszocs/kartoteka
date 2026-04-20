# Egyházmegyei pénzügy + leltár tervezet (2026-04-18)

## Kiindulás

**Alapelv 5 (feedback_gyulekezeti_autonomia.md)**:
> "Egyházmegye saját pénzügye — külön (jövőbeli profilváltás alapú modul)"

Endre kérése (2026-04-18):
> "Tervezd meg, hogy legyen pénzügyi és leltár oldala az egyházmegyének is! És profilváltással lehessen adatokat bevinni oda, a meglévő rendszer használatával!"

**Jelenlegi állapot**:
- **`/dashboard-egyhazmegye`**: az esperes / egyházmegyei admin csak a gyülekezetek KÖTELEZŐ dokumentumait látja (költségvetés, számadás, vagyonleltár, választók). Nincs saját pénzügyi felület.
- **`profile_roles` tábla**: támogatja `scope='diocese'` szerepköröket, de az `effective-access` kontextus csak `effectiveCongregationId`-t ad — nincs `effectiveDioceseId`.
- **Pénzügyi táblák** (`befizetes`, `kiadas`, `leltar`, `materials`, `material_movements`, `chitanta_tombok`, `bealitas`): mind `congregation_id` FK-val. Nincs diocese-szintű adatok tárolására hely.

## Cél

1. Az egyházmegyének legyen SAJÁT pénzügyi oldala (bevétel, kiadás, kassza, bank, költségvetés, számadás, nyugta).
2. Legyen SAJÁT leltári oldala (tárgyi leltár + anyagraktár).
3. A felhasználó (pl. esperes) profilváltással válthat gyülekezeti ↔ egyházmegyei nézet között.
4. A meglévő UI komponensek (FinanceTabs, InventoryMain) újra felhasználhatóak — NE legyen duplikált kód.

---

## Tervezési opciók

### A) Polimorf `scope_id` + `scope_type` oszlop a meglévő táblákban ❌

Minden pénzügyi táblához:
```sql
ALTER TABLE befizetes
  ADD COLUMN scope_type text DEFAULT 'congregation' CHECK (scope_type IN ('congregation','diocese','district')),
  ADD COLUMN scope_id uuid; -- vagy marad congregation_id + új diocese_id
```

**Hátrány**: minden RLS policy-t, action-t, lekérdezést át kell írni. Nagy kockázat, sok törés.

### B) Külön diocese-táblák ⚠️

Új táblák: `diocese_befizetes`, `diocese_kiadas`, `diocese_leltar`, stb.

**Hátrány**: duplikált séma és logika, hosszú távon karbantarthatatlan.

### C) Az egyházmegye mint virtuális gyülekezet ✅ **JAVASOLT**

Minden egyházmegyéhez létrehozunk egy SPECIÁLIS `congregations` rekordot:
- `name = 'Sepsi Egyházmegye központja'` (pl.)
- `diocese_id` FK → `dioceses`
- Új `kind` (vagy `type`) oszlop: `congregations.kind = 'diocese_office' | 'congregation'`
- A `congregations` tábla normál módon viselkedik, de az UI a `kind`-ból tudja, hogy ez EGYHÁZMEGYEI tétel

**Előnye**:
- Minden meglévő RLS, action, UI változatlanul működik
- Az egyházmegyének ugyanúgy van `befizetes`, `kiadas`, `leltar` stb. rekordja, csak a `congregation_id` az egyházmegyei iroda rekordra mutat
- A profilváltás meglevő mechanizmusán keresztül működik: az esperes `profile_roles` sora `scope='diocese'`, `scope_id=<diocese_id>` → a rendszer feloldja `effectiveCongregationId`-vé (az egyházmegyei iroda congregation rekord ID-ja)
- **Nyomtatványok különbözhetnek**: a nyugta/Registru Casa/Számadás sablonok a `congregations.kind` alapján változhatnak (pl. "EGYHÁZMEGYE KÖZPONTJA" fejléc)

**Hátrány**:
- A `congregation_id` szó szerint értelmében nem pontos (az egyik most "egyházmegyei iroda" típust jelent), de a kód szempontjából OK
- Az autonómia-alapelvek érvényesítésénél figyelni kell: a gyülekezeti lekérdezéseknek csak a `kind='congregation'` sorokat szabad visszaadniuk

---

## Javasolt megvalósítás (C opció)

### 1. SQL migráció

```sql
-- A) Új oszlop a congregations táblán
ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'congregation'
    CHECK (kind IN ('congregation', 'diocese_office', 'district_office'));

CREATE INDEX IF NOT EXISTS congregations_kind_idx
  ON public.congregations (kind);

COMMENT ON COLUMN public.congregations.kind IS
  'congregation = normál gyülekezet; diocese_office = egyházmegyei iroda (virtuális gyülekezet); district_office = egyházkerületi iroda';

-- B) Minden egyházmegyéhez létrehozunk egy diocese_office rekordot
INSERT INTO public.congregations (id, name, nev_hu, nev_ro, diocese_id, kind, adoszam)
SELECT
  gen_random_uuid(),
  d.name || ' — Egyházmegyei iroda',
  COALESCE(d.nev_hu, d.name) || ' — Egyházmegyei iroda',
  COALESCE(d.nev_ro, d.name) || ' — Protopopiat',
  d.id,
  'diocese_office',
  NULL
FROM public.dioceses d
WHERE NOT EXISTS (
  SELECT 1 FROM public.congregations c
  WHERE c.diocese_id = d.id AND c.kind = 'diocese_office'
);
```

### 2. Effective-access bővítés

`lib/auth/effective-access.ts`:
- Új mezők: `effectiveDioceseId`, `activeScope: 'congregation' | 'diocese'`
- Ha `profile_roles.scope = 'diocese'` aktív, akkor a diocese_office congregation_id-t adjuk vissza `effectiveCongregationId`-nek
- Plusz `activeScope = 'diocese'` flag-gel

A hívó kódok (action-ök, UI) semmit nem kell változtassanak — az `effectiveCongregationId` mutat a helyes rekordra (vagy normál gyülekezet, vagy egyházmegyei iroda).

### 3. Profilváltó UI

A `ProfileSwitcher` komponens már kezeli a `scope='diocese'` sorokat. Amikor átvált:
- `switchActiveProfileRole()` beállítja a cookie-t
- `effective-access` elkezdi visszaadni a diocese_office congregation_id-t
- A `/penzugy`, `/leltar` oldalak automatikusan az egyházmegyei iroda pénzügyét / leltárát mutatják

### 4. UI finomítások

A `/penzugy` és `/leltar` oldalak fejlécei jelezzék, hogy egyházmegyei kontextusban vagyunk:
- Indigo színvilág (elkülönül a gyülekezeti zöld/tealtől)
- Fejléc: "Sepsi Egyházmegyei iroda — Pénzügyi modul"
- Pecsét ikon (egyházmegye)

Néhány módul elrejtendő egyházmegyei kontextusban:
- **Nyugtatömb**: kell? (Ha az egyházmegye is ad ki nyugtákat saját tömbbel.) VAGY NEM KELL.
- **Gyülekezeti járulék (101.01)**: a kategóriák különbözhetnek — az egyházmegyének saját bevételi kódjai vannak.

### 5. Számadási célok (kategóriák) különállása

A `szamadasicel` táblában már van `szint` oszlop (2026-04-17 migráció):
- `szint = 'gyulekezet'` → gyülekezeti szint
- `szint = 'egyhazmegye'` → egyházmegyei tételek (pl. Kongrua, Központi járulékok — amelyek GYÜLEKEZETI szinten el vannak rejtve)
- `szint = 'kerulet'` → kerületi tételek

Az egyházmegyei pénzügyi oldalon az `egyhazmegye` + `gyulekezet` szintű tételek látszanak. A gyülekezetinél csak `gyulekezet`.

A `befizetescel` / `kiadascel` junction táblákat is át kell nézni — valószínűleg egyházmegyei iroda rekordhoz saját junction sorokat kell hozzáadni (hogy az UI dropdown-ban megjelenjenek).

### 6. Nyomtatványok

A kerületi nyomtatványok pointolnak a `congregations` adatra (nev, cim, adoszam). A `kind='diocese_office'` rekordnál:
- `nev` = pl. "Sepsi Református Egyházmegye"
- `cim` = az egyházmegyei iroda címe
- `adoszam` = az egyházmegye CIF-je (külön, nem a gyülekezeté)

A nyugta / Registru Casa / Számadás sablon a `congregations` rekordból húzza az adatokat, úgyhogy **automatikusan az egyházmegyei fejléccel** jelennek meg.

### 7. Biztonság (RLS)

A profile_roles `scope='diocese'` sor a policy-nek mondja:
```sql
OR EXISTS (
  SELECT 1 FROM profile_roles pr
  WHERE pr.profile_id = auth.uid()
    AND pr.active AND pr.approval_status='approved'
    AND pr.scope='diocese'
    AND pr.scope_id = (
      SELECT diocese_id FROM congregations WHERE id = <tábla>.congregation_id
    )
)
```

Tehát ha a congregation_id egy `diocese_office` rekord (amelynek `diocese_id` szintén ki van töltve), az az egyházmegyei user hozzáférheti.

---

## Kérdések Endre döntéshez

**Ezekre várok választ, mielőtt implementálom:**

### Q1. Egyházmegyei NYUGTATÖMBÖK kellenek?
- Az egyházmegye ad ki saját nyugtákat, külön sorozattal? Vagy nincs erre szüksége, csak számlák (Oblio)?

### Q2. Egyházmegyei könyvelési kategóriák (szamadasicel)
- Az egyházmegyének saját kategóriái (pl. "Kongrua bevétel", "Kerületi járulék kiadás")? Vagy ugyanaz a chart mint a gyülekezeteknek?
- Meglévő `szint='egyhazmegye'` tételek használható már?

### Q3. Egyházmegyei CIF / adóadatok
- Az egyházmegyének van-e saját adószáma? Ha igen, hol tároljuk (új `dioceses.adoszam` mező)?

### Q4. Költségvetés / Számadás éves jelentés
- Az egyházmegyének is van saját éves költségvetése + számadása, amit beküld a kerületnek?
- Ha igen, a document_submissions rendszer működik-e erre is (diocese_office → district_office)?

### Q5. Leltár / Vagyonleltári jelentés
- Az egyházmegyei tárgyakat az esperes/egyházmegyei admin vezeti?
- A vagyonleltári jelentés beküldési workflow ugyanaz (egyházmegye → kerület)?

### Q6. Profilváltás UX
- Az esperes automatikusan lásson-e egy "🏛️ Egyházmegyei iroda" profil-opciót a switcher-ben? Vagy kézzel kell az admin-nak hozzáadni egy `profile_roles` sort?

### Q7. Elsőbbség — mit csináljunk ELŐBB?
- (a) Előbb SQL migráció + effective-access bővítés → tesztelés basic szinten
- (b) Egyszerre teljes UI + minden modul
- Az (a) gyorsabb egy első próbakörhöz. A (b) egy nagyobb release.

---

## Összegzés

**Javaslat:** C opció (virtuális gyülekezet mint egyházmegyei iroda) — minimális változtatás, maximális kompatibilitás.

**Fázisok:**
1. SQL: `congregations.kind` oszlop + minden egyházmegyéhez 1 `diocese_office` rekord
2. `dioceses.adoszam` + `dioceses.cim` oszlopok (ha Q3 → igen)
3. `lib/auth/effective-access.ts` bővítés: `activeScope`, `effectiveDioceseId`
4. `ProfileSwitcher`: diocese scope-os sorok engedélyezése
5. UI: fejléc-akcent (indigo szín) egyházmegyei módban
6. Nyomtatványok: automatikus az új congregation rekordból
7. (opcionális) Nyugtatömb: diocese-kontextusban elrejt VAGY saját tömb

**Nem érintett:**
- Pénzügyi, leltári, anyagraktári tábla-struktúra változatlan
- RLS szabályok csak profile_roles-szel bővülnek (már támogatja)
- Minden UI komponens (FinanceTabs, InventoryMain stb.) változatlan
