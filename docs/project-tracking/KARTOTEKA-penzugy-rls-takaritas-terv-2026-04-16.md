# KARTOTEKA — WC-7.4 RLS takarítási és bővítési terv (pénzügyi táblák)

**Dátum**: 2026-04-16
**Állapot**: állapotfeltárás kész, takarítási terv készül
**Hatálya**: 10 pénzügyi tábla + 3 központi RLS helper függvény
**Felhasználói döntés**: „Takarítsuk ki és építsk tisztává" — a meglévő problémákat NEM halasztjuk későbbre

---

## Vezetői összefoglaló

Az állapotfeltárás **súlyos meglévő problémákat** tárt fel a pénzügyi modul RLS-rétegében. Ezek **nem a WC-7 miatt keletkeztek**, hanem a rendszer korábbi, többrétegű RLS evolúciója során halmozódtak fel. A WC-7.4 most együtt kezeli:

1. A meglévő problémákat (túl-permisszív policy-k, duplikáció, `true` feltételek)
2. Az új szerepkörök (`konyvelo`, `egyhazmegyei_szamvevo`, `egyhazkeruleti_admin`) integrálását

---

## Feltárt problémák részletesen

### A) Túl-permisszív „maradvány" policy-k — **kritikus biztonsági hiba**

Ezek a policy-k a PostgreSQL RLS **OR-logikája** miatt minden más szigorúbb policy-t **hatástalanná tesznek**. Bármelyik permissive policy engedélyezi a műveletet, ezért egy `true` feltételű policy **kinyitja** a táblát mindenkinek, függetlenül attól, milyen egyéb policy-k vannak.

| Tábla | Problémás policy | Feltétel | Hatás |
|---|---|---|---|
| `befizetes` | `"Teljes hozzaferes befizetes"` ALL | `auth.role() = 'authenticated'` | **Bármely bejelentkezett user** mindent csinálhat a táblával |
| `befizetes` | `"Mindenki olvashatja a befizeteseket"` SELECT | `true` | **Mindenki** minden befizetést lát (más gyülekezetek is!) |
| `kiadas` | `"Teljes hozzaferes kiadas"` ALL | `auth.role() = 'authenticated'` | Ugyanaz, mint fent |
| `koltsegvetes` | `"Teljes hozzaferes koltsegvetes"` ALL | `auth.role() = 'authenticated'` | Ugyanaz |
| `congregations` | `congregations_read` SELECT | `true` | Minden gyülekezet-adat nyilvános bejelentkezett usernek (most lehet, hogy szándékos a publikus site miatt — ezt ellenőrizni kell) |
| `szamadasicel` | `szamadasicel_read` SELECT | `true` | Globális katalógus — valószínűleg szándékos, mindenki olvashatja |

**Feladat**: a `"Teljes hozzaferes ..."` és a `"Mindenki olvashatja ..."` policy-kat **törölni kell**. Ezek fejlesztési / migrációs időszak maradványai.

### B) Duplikált policy-k

| Tábla | Duplikáció |
|---|---|
| `congregations` | `"Mindenki lathatja a gyulekezeteket"` ÉS `"Mindenki láthatja a gyülekezeteket"` — **azonos** szabály, csak ékezetkülönbség |
| `jarulek_kedvezmeny` | 9 policy! Régi (`jarulek_kedvezmeny_{select,update,delete,insert}`) és új (`_scope`-os) rendszer együtt él |

**Feladat**: ékezetes duplikáció → egy verzió marad. Régi/új rendszer duplikáció → eldönteni, melyik a helyes, a másikat törölni.

### C) Admin shortcut policy-k eltérő stílusokkal

Több tábla **saját admin policy-t** tartalmaz `auth.jwt() ->> 'email' = 'endreszocs@gmail.com'` vagy `role = 'admin'` feltétellel:

- `admin_read_all_bankszamlak`
- `admin_read_all_congregations`
- `admin_insert_all_kiadas`
- `admin_read_all_kiadas`
- `admin_read_all_befizetes`
- `admin_insert_all_befizetes`

**Probléma**: email hardcoded (`endreszocs@gmail.com`), inkonzisztens a `MASTER_ADMIN_EMAIL` env változóval. A logika lokálisan duplikálva, nem használja a `current_user_has_global_access()` helper függvényt.

**Feladat**: ezeket átírni, hogy a **központi helper-t** használják (`current_user_has_global_access()`). A master admin logikát **ott** (a helperben) tartjuk, nem policy-kban.

### D) Kettős absztrakciós szint

A rendszerben **két fajta** policy él együtt:

1. **Új stílus**: `current_user_can_access_congregation(congregation_id)` VAGY `current_user_congregation_id() + current_user_has_global_access()` — **jó absztrakció**
2. **Régi stílus**: `congregation_id IN (SELECT profiles.congregation_id FROM profiles WHERE id = auth.uid())` — **inline szűrés, nem használ helpert**

**Feladat**: a régi stílusú policy-kat átírni az új helper-rendszerre, hogy **egy helyen** lehessen bővíteni minden szerepkörre.

---

## A 3 központi helper függvény bővítése (kulcs lépés)

Miután visszaérkezik a 3 függvény definíciója, a bővítési szándék:

### `current_user_has_global_access()`

**Jelenleg (hipotézis)**: `role = 'admin' OR email = MASTER_ADMIN_EMAIL`

**Új logika**:
```
role = 'admin'
OR email = MASTER_ADMIN_EMAIL
OR role = 'egyhazkeruleti_admin'    -- ÚJ: kerületi admin is "globális" jellegű a saját kerületén belül
                                      -- (a tényleges kerület-szűrés már a congregation/diocese szinten érvényesül)
```

### `current_user_can_access_congregation(p_congregation_id uuid)`

**Jelenleg (hipotézis)**: `congregation_id = current_user_congregation_id() OR current_user_has_global_access()`

**Új logika**:
```
congregation_id = current_user_congregation_id()
OR current_user_has_global_access()
OR EXISTS (
    -- Kerületi admin a kerülete alatti összes gyülekezethez hozzáfér
    SELECT 1 FROM congregations c
    JOIN dioceses d ON d.id = c.diocese_id
    JOIN profiles p ON p.id = auth.uid()
    WHERE c.id = p_congregation_id
      AND p.role = 'egyhazkeruleti_admin'
      AND d.district_id = p.district_id
)
OR EXISTS (
    -- Egyházmegyei admin / esperes / egyházmegyei számvevő a megyéje alatti gyülekezetekhez
    SELECT 1 FROM congregations c
    JOIN profiles p ON p.id = auth.uid()
    WHERE c.id = p_congregation_id
      AND p.role = ANY (ARRAY['egyhazmegyei_admin','esperes','egyhazmegyei_szamvevo'])
      AND c.diocese_id = p.diocese_id
)
OR EXISTS (
    -- Könyvelő/számvevő a many-to-many hozzárendeléseken keresztül
    SELECT 1 FROM profile_congregations pc
    WHERE pc.profile_id = auth.uid()
      AND pc.congregation_id = p_congregation_id
      AND pc.active = true
)
```

Ez **egy helyen** bővíti a szerepkör-logikát — minden policy, ami ezt a függvényt használja, **automatikusan** követi az új szabályokat.

### `current_user_congregation_id()`

**Jelenleg**: `SELECT congregation_id FROM profiles WHERE id = auth.uid()`

**Nem változik** — ez a user fő gyülekezetét adja vissza. Könyvelő/számvevő esetén `NULL` lehet, amit a `can_access_congregation` függvény kezel.

---

## Takarítási és bővítési stratégia

### Fázis 1: Helper függvények bővítése (1 SQL fájl)

- `current_user_has_global_access()` bővítés
- `current_user_can_access_congregation()` bővítés
- Új helper: `current_user_can_edit_tva_flags()` → csak admin + konyvelo
- Új helper: `current_user_has_readonly_access_to_congregation(uuid)` → szamvevo szempontú csak-olvasás

### Fázis 2: Policy takarítás táblánként (külön SQL, táblánkénti)

Minden táblán:
1. **Törölni** a `"Teljes hozzaferes"`, `"Mindenki ..."`, `congregations_read true`-féle policy-kat
2. **Törölni** a duplikált ékezetes policy-kat
3. **Régi stílusú** inline policy-kat **átírni** a helper-függvényekre (VAGY meghagyni, ha a helper úgyis lefedi)
4. **Az admin shortcut policy-kat törölni**, ha a helper már kezeli őket
5. **Egyetlen, egyértelmű** permissive policy a táblán: `USING current_user_can_access_congregation(congregation_id)` formával

### Fázis 3: Szamadasicel speciális bánásmód

A `szamadasicel` globális katalógus — mindenki olvashatja (`authenticated`). De a `tva_plafonba_szamit` és `tva_mentesseg_hivatkozas` mezőket **csak `konyvelo` és `admin` szerkesztheti**.

- **SELECT** policy: `true` (mindenki, ami szándékos)
- **UPDATE** policy: `current_user_can_edit_tva_flags()` → csak konyvelo + admin

PostgreSQL nem támogat oszlop-szintű RLS-t közvetlenül. Megoldás: **az UPDATE policy érvényes a teljes sorra**, de az **alkalmazás kódban** szűrjük, hogy csak a TVA oszlopokat lehet módosítani. Vagy **CHECK constraint + trigger** oldja meg szigorúan.

### Fázis 4: Congregations speciális bánásmód

Hasonló helyzet: a `congregations` tábla **sok oszlopát** a lelkész állíthatja (saját gyülekezetére), de a TVA / e-Factura mezőket csak admin + konyvelo + lelkesz (felhasználói döntés szerint).

Eldöntendő: a policy szintjén ezt **nem** tudjuk oszlopra bontani — az alkalmazás szintjén (Server Action) kell szűrni.

### Fázis 5: Tesztelés

- **Fejlesztői fiók** minden szerepkörhöz (7 szerepkör → 7 fiók)
- Minden fiókkal minden pénzügyi tábla CRUD-tesztje
- Kimenetek dokumentálása

---

## Kockázatok

1. **Live app hozzáférés megszakadhat** — ha egy takarítás közben egy szigorú policy lép életbe, az esperes/lelkész pillanatnyilag nem tud pl. bevételt rögzíteni. **Mitigáció**: a takarítási SQL-t **Supabase branch-en** futtatjuk először (MCP `create_branch`), ott tesztelünk, azután merge production-ba.

2. **Alkalmazás-szintű kódnak külön kell tisztán maradnia** — a Server Action-ök továbbra is végzik a saját jogosultsági ellenőrzést (defence in depth). Nem hagyatkozunk CSAK az RLS-re.

3. **A `jarulek_kedvezmeny` 9 policy-ja** — a kettős rendszer takarításánál **meg kell értenünk**, melyik az aktuális. A `_scope`-os policy-k valószínűleg a frissebbek, de ezt a git log alapján ellenőrizzük.

4. **A `congregations.congregations_read true`** lehet, hogy a **publikus gyülekezeti oldal** funkciónak szükséges (amit ti már bevezettetek — `public_site_enabled` mezőn keresztül). Mielőtt törlöm, **ellenőrizni kell**, hogy a `/gy/[slug]` publikus oldalak továbbra is működjenek.

---

## Következő lépés

1. **Te futtasd** a `current_user_*` függvények definíciójának lekérdezését (már küldtem az SQL-t az előző üzenetben)
2. **A definíciók alapján** elkészítem a Fázis 1 + 2 SQL-t (Supabase branch-en tesztelésre kész)
3. **Közösen eldöntjük**: Supabase branch-en teszteljük, vagy direkt production-ba (fejlesztői fázis miatt biztonságos lenne direkt, mivel 1 felhasználó van)

---

## Nyitott kérdések

1. A `congregations.congregations_read true` szándékos-e a publikus oldal miatt? (Ellenőrizni a `/gy/[slug]` és a publikus magazin miatt)
2. A `jarulek_kedvezmeny` kettős policy-rendszeréből melyik a friss? (git log segít)
3. A `szamadasicel` mezők konzervatív update policy-ját alkalmazás-szintű ellenőrzés vagy CHECK constraint + trigger védje? (Alapértelmezés: alkalmazás-szintű, egyszerűbb)
4. Supabase branch-en teszteljük, vagy direkt production (most fejlesztői fázis)?

---

## **ÚJ KOCKÁZAT** — `current_user_has_global_access()` túl tág

A 3 helper függvény lekérdezéséből kiderült: a jelenlegi `current_user_has_global_access()` így néz ki:

```sql
SELECT EXISTS (
  SELECT 1 FROM profiles p
  WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND p.role IN ('admin', 'esperes', 'egyhazmegyei_admin')
);
```

**Probléma**: az **`esperes` és `egyhazmegyei_admin`** itt **globálisnak** minősülnek — azaz RLS-szinten **bármelyik gyülekezet minden adatát** láthatják (nem csak a saját egyházmegyéjüket). Ez **túl tág** biztonsági szempontból.

**Hatás jelenlegi állapotban**: az alkalmazás kódja valószínűleg **szerver oldalon szűr** (pl. az esperes csak a saját megyéjét látja a dashboardon), így a felhasználói szempontból a rendszer helyesen viselkedik. Az RLS itt csak **engedélyező réteg**, nem **szigorító**.

**Mit csinálok a WC-7 körben**:
- **Nem nyúlok hozzá** (kockázatos)
- A `current_user_can_access_congregation()` bővítésben **külön ágat** adok a kerületi admin, megyei számvevő és konyvelo szerepkörökre (nem a `has_global_access()`-en át), mert ezek szerepkör-specifikus szűrést igényelnek
- **Későbbi körre** (külön munkacsomag) hagyom az `esperes` és `egyhazmegyei_admin` szűkítését

**Javasolt későbbi szűkítés** (külön munkacsomag, NEM a WC-7 része):
```sql
-- Új verzió: has_global_access csak admin
SELECT EXISTS (
  SELECT 1 FROM profiles p
  WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND p.role = 'admin'
);

-- Új, szerepkör-specifikus helperek:
-- has_esperes_access(target_diocese_id): esperes a saját megyéjében
-- has_megyei_admin_access(target_diocese_id): ugyanez
```

Ehhez **audit kell**:
- Végignézni, hogy az alkalmazás kódja hol támaszkodik az `esperes` RLS-szintű globális hozzáférésére
- Átnézni minden pénzügyi Server Action-t: szerver oldalon helyesen szűr-e minden esperes-kérésre
- Akkor véglegesítik a policy-kat

**Ez most csak dokumentációs bejegyzés** — egy jövőbeli fejlesztési kör prioritás listájára kerül.
