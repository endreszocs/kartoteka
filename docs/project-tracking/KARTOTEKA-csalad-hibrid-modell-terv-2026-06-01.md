# Kartotéka — Hibrid család-modell migrációs terv

**Dátum**: 2026-06-01
**Felelős**: Szőcs Endre (lelkipásztor) + Claude
**Cél**: A jelenlegi „egy család = férj + feleség + 1 cím" modell lecserélése
  egy három-rétegű hibrid modellre, ami a modern életszituációkat is lefedi
  (válás, újraházasodás, többgenerációs együttélés, egyetemista gyerek).

---

## 1. Háttér

### 1.1 Jelenlegi modell

```
csalad (tábla)
├── id_ferfi  → szemely.id    (egy férj)
├── id_no     → szemely.id    (egy feleség)
├── c_utcaid  → adrstreet.id  (cím)
├── c_szam, c_tombhaz, c_ajto stb.
└── id_csoport, isaktiv

gyerek (kapcsolótábla)
├── id_csalad  → csalad.id
└── id_szemely → szemely.id
```

**Korlátok**:
- 1 család = MAX 2 felnőtt + N gyerek + 1 cím
- Elvált szülő: a gyerek csak EGY családhoz tartozik
- Patchwork-család: mostohaszülő nem fér el
- Egyetemista: nem lehet egyszerre két cím
- Költözés: a régi cím elveszik (felülírjuk)

### 1.2 Új (cél) modell

Három különálló réteg:

```
┌──────────────────────────────────────────────────────────────┐
│  szemely (változatlan, ÉLŐ tábla — minden adat itt él)      │
└──────────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌──────────────────────┐      ┌──────────────────────────────┐
│  haztartas_tag       │      │  szemely_kapcsolat           │
│  (M:N kapcsolótábla) │      │  (M:N kapcsolótábla)         │
│  + szerep            │      │  + típus (szülő/házastárs/  │
│  + is_primary        │      │    testvér/gondviselő...)   │
│  + ervenyes_tol/ig   │      │  + ervenyes_tol/ig          │
└──────────────────────┘      └──────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│  haztartas                                                   │
│  ├── megnevezes (pl. "Kovács család — Templom u.")           │
│  ├── id_cim → cim.id                                         │
│  ├── id_csoport, isaktiv                                     │
│  └── ervenyes_tol, ervenyes_ig                               │
└──────────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│  cim                                                         │
│  ├── id_utca → adrstreet.id                                  │
│  ├── szam, tombhaz, lepcsohaz, emelet, ajto                  │
│  ├── tipus (otthon / ideiglenes / munka)                     │
│  └── ervenyes_tol, ervenyes_ig                               │
└──────────────────────────────────────────────────────────────┘
```

**Kulcs-tulajdonságok**:
- **`szemely`** SOHA nem szűnik meg, csak változik (státusz: élő/elhunyt)
- **`haztartas`** az aktuális lakóközösség — KÖLTÖZÉSKOR új háztartás születik (a régi `ervenyes_ig` dátumot kap)
- **`szemely_kapcsolat`** az életen át tartó rokoni kötelékek — sose törlődik, csak `ervenyes_ig` jelölődik (pl. válásnál a házastársi kapcsolat lezárul, de a szülő-gyerek megmarad)
- **`cim`** külön él — egy háztartás kaphat új címet (új `cim` rekord, a régi inaktív lesz)

### 1.3 Backward compatibility

A **régi `csalad` + `gyerek` táblák MARADNAK** legalább a Fázis 3 végéig.
A migráció **dual-write** pattern-szerű: minden új létrehozás mindkét helyre
megy, amíg a régi nézetek nem cserélődnek le.

---

## 2. Fázis-terv

### Fázis 0 — SQL alap (1 nap) ✅ JELEN COMMIT

**Cél**: Új táblák létrehozása, RLS policy-k, indexek. A régi rendszer
működik tovább. Senki nem használja még az új táblákat.

**Tartalom**:
- `cim` tábla (új)
- `haztartas` tábla (új)
- `haztartas_tag` tábla (új)
- `szemely_kapcsolat` tábla (új)
- RLS policy-k (congregation_id alapján, mint a többi tábla)
- Indexek (id_szemely, id_haztartas, ervenyes_tol stb.)
- A `szemely.family_id` (orphan UUID oszlop) érintetlen marad

**Fájl**: `migration-docs/sql/2026-06-01-fazis0-haztartas-tablak.sql`

**Mit NEM csinálunk**: meglévő adatok átemelése, UI változtatás, action-frissítés.

### Fázis 1 — Adat-szinkron (2-3 nap)

**Cél**: Minden új `csalad` rekord automatikusan tükröződik a `haztartas`-on
is (dual-write). Egyszeri backfill a meglévő adatokra.

**Tartalom**:
1. **Backfill SQL** (`migration-docs/sql/2026-06-01-fazis1-backfill.sql`):
   - Minden `csalad` → `haztartas` (1 új cím-rekord, 1 háztartás-rekord)
   - `id_ferfi`/`id_no` → 2 `haztartas_tag` rekord (szerep: férj/feleség)
   - `gyerek.id_szemely` → `haztartas_tag` (szerep: gyermek)
   - `id_ferfi + id_no` → `szemely_kapcsolat` (típus: házastársi)
   - Minden `gyerek` → `szemely_kapcsolat` 2 rekord (apa-gyerek + anya-gyerek)
2. **Dual-write action-ök**: a `saveFamilyAction`, `addChildToFamilyAction`
   stb. minden update-et **MINDKÉT** táblába ír.
3. **Konzisztencia-trigger** (Postgres): ha valaki közvetlenül a `csalad`-on
   módosít (legacy import), egy trigger automatikusan szinkronizál.

**Mit NEM csinálunk**: UI változtatás. A lelkész ugyanazt látja, mint most.

### Fázis 2 — UI átépítés (4-5 nap)

**Cél**: A tagnyilvántartás + családlátogatás UI-ja az új modellből olvas.

**Tartalom**:
1. **Új háztartás-detail dialog** (kibővített család-detail):
   - „Tagok" lista szerepekkel (lehet több szülő, mostohaszülő, lakó)
   - „Vér szerinti rokoni kötelékek" külön szekció (`szemely_kapcsolat`-ból)
   - „Korábbi háztartások" idővonal (történet)
2. **Új tag rögzítése**:
   - Választás: meglévő háztartáshoz hozzáad VAGY új háztartást nyit
   - Új kapcsolat rögzítése külön (vér szerinti szülő/testvér/házastárs)
3. **Költözés mint külön akció**:
   - „Költözés rögzítése" gomb → új cím + új `haztartas` (a régi lezárul)
   - A háztartás-azonosság megmarad (csak a cím változik)
4. **Anyakönyvi dialog-ok átállítása**:
   - A baptism-dialog a `szemely_kapcsolat`-ból olvassa a vér szerinti szülőket
   - A marriage-dialog a `szemely_kapcsolat` „házastárs" típusát írja
   - Régi `gyerek` tábla már csak olvasható (read-only fallback)

### Fázis 3 — Régi nézetek deprecation (1-2 nap)

**Cél**: Minden olvasás az új modellből. A `csalad` tábla read-only legacy.

**Tartalom**:
- `csalad` + `gyerek` táblákra `revoke insert/update/delete` (csak select)
- Vue-szerű view-k legacy SQL-ből: `csalad_view AS SELECT ... FROM haztartas ...`
- Dokumentáció frissítése (CLAUDE.md, AGENTS.md)

### Fázis 4 — Történeti rétegek (opcionális, később)

- Háztartás-tagsági idővonal nézet
- „Ki kivel élt 2018-ban" időutazó lekérdezés
- Statisztikák (átlagos háztartás-méret, költözések évente)

---

## 3. Részletes táblastruktúra (Fázis 0)

### 3.1 `cim` tábla

```sql
CREATE TABLE public.cim (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES congregations(id),
  id_utca integer REFERENCES adrstreet(id),
  szam varchar,
  tombhaz varchar,
  lepcsohaz varchar,
  emelet varchar,
  ajto varchar,
  tipus text NOT NULL DEFAULT 'otthon'
    CHECK (tipus IN ('otthon', 'ideiglenes', 'munka', 'kolozsda', 'egyeb')),
  ervenyes_tol date,
  ervenyes_ig date,
  megjegyzes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 0
);
```

### 3.2 `haztartas` tábla

```sql
CREATE TABLE public.haztartas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES congregations(id),
  megnevezes text,                        -- pl. "Kovács család — Templom u. 3"
  id_cim uuid REFERENCES cim(id),
  id_csoport integer REFERENCES csoport(id),
  isaktiv boolean NOT NULL DEFAULT true,
  ervenyes_tol date,
  ervenyes_ig date,                        -- ha NULL: jelenlegi háztartás
  legacy_csalad_id integer,                -- 1-1 link a régi csalad.id-re (migráció audit-hoz)
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 0
);
```

### 3.3 `haztartas_tag` tábla

```sql
CREATE TABLE public.haztartas_tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_haztartas uuid NOT NULL REFERENCES haztartas(id) ON DELETE CASCADE,
  id_szemely integer NOT NULL REFERENCES szemely(id),
  szerep text NOT NULL
    CHECK (szerep IN ('csaladfo', 'hazastars', 'gyermek', 'mostohaszulo',
                      'gondviselo', 'unoka', 'nagyszulo', 'lakotars',
                      'alberlet', 'egyeb')),
  is_primary boolean NOT NULL DEFAULT false, -- a háztartás "fő" tagja
  ervenyes_tol date,
  ervenyes_ig date,                          -- ha NULL: jelenleg tag
  megjegyzes text,
  congregation_id uuid NOT NULL REFERENCES congregations(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 0,

  -- Egy ember nem lehet kétszer ugyanazon háztartásban aktív tag
  UNIQUE (id_haztartas, id_szemely, ervenyes_ig)
);
```

### 3.4 `szemely_kapcsolat` tábla

```sql
CREATE TABLE public.szemely_kapcsolat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_szemely_1 integer NOT NULL REFERENCES szemely(id),
  id_szemely_2 integer NOT NULL REFERENCES szemely(id),
  tipus text NOT NULL
    CHECK (tipus IN ('hazastars', 'szulo_gyermek', 'testver', 'felteszver',
                     'nagyszulo_unoka', 'mostohaszulo_mostohagyermek',
                     'gondviselo', 'orokbe_fogado', 'egyeb')),
  -- A "szulo_gyermek" típusban szemely_1 = szülő, szemely_2 = gyermek
  -- A "hazastars"/"testver" szimmetrikus
  ver_szerinti boolean NOT NULL DEFAULT true,
  ervenyes_tol date,
  ervenyes_ig date,                       -- pl. válás: hazastars kapcsolat lezárul
  megjegyzes text,
  congregation_id uuid NOT NULL REFERENCES congregations(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 0,

  CHECK (id_szemely_1 <> id_szemely_2)
);
```

---

## 4. Adatmigrációs logika (Fázis 1, részletes)

### 4.1 Backfill algoritmus

Minden `csalad` rekordra:
1. Új `cim` rekord (kihámozva: id_utca + szám + tombhaz + ajto stb.)
2. Új `haztartas` rekord (id_cim = ↑, megnevezés = "[férj-vezetékneve] család — [utca][szám]", legacy_csalad_id = csalad.id)
3. Ha `id_ferfi` IS NOT NULL: `haztartas_tag` (szerep='csaladfo', is_primary=true)
4. Ha `id_no` IS NOT NULL: `haztartas_tag` (szerep='hazastars')
5. Ha mindkettő: `szemely_kapcsolat` (típus='hazastars')
6. Minden `gyerek` rekordra:
   - `haztartas_tag` (szerep='gyermek')
   - `szemely_kapcsolat` (típus='szulo_gyermek', szemely_1=apa, szemely_2=gyerek)
   - `szemely_kapcsolat` (típus='szulo_gyermek', szemely_1=anya, szemely_2=gyerek)

### 4.2 Dual-write minta (új akciók)

Minden új member-form / family-form action:

```ts
async function saveFamilyAction(input) {
  await db.transaction(async (tx) => {
    // 1. Régi adatok mentése (csalad + gyerek)
    const csaladId = await saveCsaladLegacy(tx, input)

    // 2. Új adatok mentése (cim + haztartas + haztartas_tag + szemely_kapcsolat)
    const haztartasId = await saveHaztartasNew(tx, input, csaladId)
    return { csaladId, haztartasId }
  })
}
```

---

## 5. UI változások (Fázis 2)

### 5.1 Tagnyilvántartás főnézet

**MOST**: lista a `szemely`-ekkel, kattintásra megnyílik a tag-form.

**ÚJ**: lista marad. A tag-formban új szekció:
- „Háztartás" — melyik háztartásban él (lehet több!)
- „Rokoni kapcsolatok" — szülei, házastársa, gyermekei (link-ek)

### 5.2 Új gyermek rögzítése (új ember + család)

**MOST**: az új `szemely`-t felveszi, kiválasztja a családot.

**ÚJ wizard**:
1. Új személy adatai (név, születés, vallás…)
2. Vér szerinti szülők — kapcsolat-rögzítő (szülő-gyermek)
3. Háztartás — meglévőhöz hozzá (szülők háztartása, alapértelmezett) VAGY új háztartás

### 5.3 Költözés

**MOST**: a `csalad` címét felülírjuk.

**ÚJ**: külön „Költözés rögzítése" akció.
- Régi háztartás → `ervenyes_ig = today`
- Új háztartás → ugyanazokkal a tagokkal, új címmel, `ervenyes_tol = today`

### 5.4 Családlátogatási napló

A jelenlegi `csaladlatogatas` táblát **érintetlenül hagyjuk**, csak hozzáadunk
egy `id_haztartas uuid` oszlopot is. Új látogatások az új tábla-modellre is
hivatkoznak; a régi rekordok továbbra is olvashatók.

---

## 6. Súgó-szekció a tagnyilvántartásban

A felhasználói felületen az új `family-modell` kategória a súgóban:
részletesen elmagyarázza a 3 réteget, példákkal (válás, költözés, egyetemista).

Implementáció: [tagnyilvantartas-help.tsx](apps/web/components/members/tagnyilvantartas-help.tsx) bővítése egy
új `family-modell` kategóriával — Fázis 0-ban.

---

## 7. Migráció biztonsága

- **Backup**: minden fázis előtt Supabase automatic backup + manuális dump
- **Reverzibilitás**: a Fázis 0 → Fázis 2 között bármikor visszaállítható,
  mert a régi `csalad` + `gyerek` tábla érintetlen
- **Tesztelés**: dev-database-en, valós seed adattal (a `migration-docs/sql/`
  alapadat-import után)

---

## 8. Becsült munkaidő

| Fázis | Munkaidő | Risk |
|---|---|---|
| 0 — SQL alap | 1 nap (kész) | Alacsony |
| 1 — Backfill + dual-write | 2-3 nap | Közepes (transaction-szintű) |
| 2 — UI átépítés | 4-5 nap | Közepes (sok komponens) |
| 3 — Deprecation | 1-2 nap | Alacsony |
| **Összesen** | **8-11 nap** | — |

---

## 9. Súgó-szekció (lelkipásztoroknak)

A teljes magyarázat magyar nyelven, ember-nyelvi szinten, a
`tagnyilvantartas-help.tsx` súgóban él. Itt csak a kategóriák listája:

- „Mi a család az új modellben?"
- „A 3 különálló kartonlap"
- „Élet-példák (válás, költözés, egyetemista)"
- „Mit kell nekem csinálnom?"
- „Mit nem változik?"

---

## 10. Hivatkozások

- [Planning Center – Households](https://pcopeople.zendesk.com/hc/en-us/articles/360013131054-Households)
- [Rock RMS – Person & Family Field Guide](https://community.rockrms.com/documentation/bookcontent/5)
- [Debrecen-Nagytemplom Adatkezelési minta](https://www.nagytemplom.hu/adatkezelesi-tajekoztato-az-egyhaztagok-nyilvantartasa-targyaban/)
- [MBS Inc. – Family Structures in ChMSes](https://www.mbsinc.com/the-challenge-of-todays-family-structures-in-chmses/)
