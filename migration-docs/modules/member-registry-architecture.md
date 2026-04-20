# Tagnyilvántartás — Architektúra terv

**Stack:** Next.js 16 + Supabase + Tailwind CSS 4 + shadcn/ui
**Kapcsolódó dokumentáció:**
- Elemzés: `modules/member-registry.md`
- Üzleti szabályok: `rules/member-registry-rules.md`
- Felhasználói folyamatok: `workflows/member-registry-flow.md`
- Implementációs terv: `todo/phase-3-member-registry.md`

---

## 1. Komponensek

### Komponens hierarchia

```
app/(dashboard)/tagnyilvantartas/page.tsx     ← SERVER (orchestrátor)
│
└── <MemberTabs />                            ← CLIENT (fül-váltó)
    │
    ├── [Áttekintés fül]
    │   └── <OverviewTab />                   ← CLIENT
    │       ├── <AgeGroupsChart />            ← nemek + 11 korcsoport progress bar
    │       └── <ForecastCards />             ← 5/10 éves előrejelzés
    │
    ├── [Személyek fül]
    │   └── <PersonsTab />                    ← CLIENT (fő munkafelület)
    │       ├── <MemberSearch />              ← keresőmező (szóköz-darabolás)
    │       ├── <MemberTable />              ← sorok, rendezés
    │       │   └── <MemberStatusBadge />    ← Rendezve/Felmentett/Hátralékos/...
    │       │
    │       ├── <MemberDetailsDialog />       ← modal: kartoték adatlap
    │       │   └── családi kapcsolatok szekció (szülők, házastárs, gyerekek — szöveges)
    │       │
    │       ├── <MemberFormDialog />           ← modal: tag felvétel/szerkesztés
    │       │   ├── [Személyes fül]
    │       │   │   ├── <ParentSearch />      ← szülő okos kereső
    │       │   │   └── <ParentQuickAddDialog /> ← modal-ban modal: szülő gyorsrögzítés
    │       │   ├── [Anyakönyvi fül]
    │       │   └── [Pénzügyi fül]
    │       │
    │       └── <MemberRemoveDialog />        ← modal: kivezetés (4 mód)
    │
    ├── [Családok fül]
    │   └── <FamiliesTab />                   ← CLIENT
    │       ├── <FamilyCard />               ← egy család kártya
    │       ├── <FamilyDetailsDialog />       ← modal: család adatlap
    │       └── <FamilyFormDialog />          ← modal: család CRUD
    │
    ├── [Presbiterek fül]
    │   └── <PresbytersTab />                 ← CLIENT
    │       └── <PresbiterFormDialog />       ← modal: presbiter CRUD
    │
    ├── [Körzetek fül]
    │   └── <DistrictsTab />                  ← CLIENT
    │       ├── <DistrictFormDialog />        ← modal: körzet CRUD
    │       ├── <DistrictFamiliesDialog />    ← modal: családok hozzárendelés
    │       │   └── <DistrictFamilies />     ← család lista + hozzárendelés gombok
    │       └── <UnassignedFamiliesDialog /> ← modal: körzet nélküliek
    │
    └── [Választók fül]
        └── <VotersTab />                     ← CLIENT
            ├── <VoterList />                ← szűrt táblázat
            ├── <VotersPrintDialog />        ← nyomtatás
            └── <GenderCheckDialog />        ← God Mode: nem-ellenőrzés
```

### Server vs Client döntés

| Komponens | Típus | Indoklás |
|-----------|:-----:|---------|
| `page.tsx` | **Server** | Kezdeti adatlekérdezés (5 párhuzamos query) |
| `MemberTabs` | **Client** | Fül-váltás interakció |
| Minden fül és modal | **Client** | Szűrés, rendezés, keresés, form-ok, CRUD műveletek — mind kliens-oldali interakció |

**Miért majdnem minden Client?**

A tagnyilvántartás a rendszer leginteraktívabb oldala: szűrés, keresés, rendezés, modal stack, szülő keresés — mindez folyamatos kliens-oldali interakciót igényel. A Server Component csak a kezdeti nagy adatlekérdezést végzi, utána a kliens dolgozik a memóriában lévő adatokkal.

### shadcn/ui használat

| shadcn/ui | Hol |
|-----------|-----|
| `Tabs, TabsList, TabsTrigger, TabsContent` | 6 fő fül |
| `Dialog, DialogContent, DialogHeader, DialogTitle` | Minden modal (12 db) |
| `Card, CardContent, CardHeader` | Családok kártyák, áttekintés kártyák, előrejelzés |
| `Badge` | Fizetési státusz, korcsoport, járulék évek, presbiter tisztség |
| `Button` | Minden akciógomb |
| `Input` | Form mezők, keresők |
| `Label` | Form címkék |
| `Select, SelectTrigger, SelectContent, SelectItem` | Szűrő dropdown-ok (státusz, nem, rendezés, körzet, vallás) |
| `Separator` | Szekciók elválasztása (kartoték, form fülek) |
| `Table, TableHeader, TableBody, TableRow, TableCell` | Tag lista, presbiterek, választók, batch |
| `Progress` | Korcsoport progress bar-ok |

---

## 2. Oldal struktúra

### Route

```
/tagnyilvantartas → app/(dashboard)/tagnyilvantartas/page.tsx
```

### Layout: fül-alapú egyoldalas alkalmazás

```
┌─────────────────────────────────────────────────────────────────────┐
│  Áttekintés │ Személyek │ Családok │ Presbiterek │ Körzetek │ Vál. │  ← Fülek
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [Aktív fül tartalma — a fülváltás nem cserél oldalt]              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
     + [Kontextuális akciógomb az aktív fül felett — pl. „+ Új tag"]
```

### Személyek fül elrendezése

```
┌──────────────────────────────────────────────────────────────────┐
│  [🔍 Keresés _______________] [Szűrő: Aktív ▼] [+ Új tag]     │
├──────────────────────────────────────────────────────────────────┤
│  342 fő a nyilvántartásban                                       │
├───────┬─────────────────────────┬──────┬─────────┬──────┬───────┤
│  Név ▼│  Cím                    │ Kor  │ Szül.d. │ Fogl.│Státusz│
├───────┼─────────────────────────┼──────┼─────────┼──────┼───────┤
│  özv. │  Kovászna, Fő u. 12    │ 72 év│ 1954-03 │ Tanár│ ✅    │
│  Nt.  │                         │      │         │      │Rendez.│
│  Kovács│                         │      │         │      │       │
│  Mária│                         │      │         │      │       │
├───────┼─────────────────────────┼──────┼─────────┼──────┼───────┤
│  ...  │  ...                    │ ...  │ ...     │ ...  │ ...   │
└───────┴─────────────────────────┴──────┴─────────┴──────┴───────┘
```

### Áttekintés fül elrendezése

```
┌────────────────────────────────┬─────────────────────────────────┐
│  NEMEK                         │  KORCSOPORTOK (11 db)           │
│  👨 142 (48%) ████████░░       │  0-6   ██░░░ 14 fő  5%        │
│  👩 156 (52%) █████████░       │  7-12  ███░░ 22 fő  7%        │
│  Összesen: 298                 │  13-14 █░░░░  8 fő  3%        │
│                                │  ...                            │
├────────────────────────────────┤  81-100 ██░░░ 12 fő  4%        │
│  ÁTLAGÉLETKOR                  │  100+  ░░░░░  0 fő  0%        │
│  47.2 év                       ├─────────────────────────────────┤
│  ♂ 45.8 év (142 fő)           │  ELŐREJELZÉS                    │
│  ♀ 48.5 év (156 fő)           │           5 év    10 év         │
├────────────────────────────────┤  📖 Konfirm.  12       28      │
│  HALÁLOZÁSI ÁTLAG              │  ☑️ Választók  18       42      │
│  74.2 év                       │  ❤️ 75+        38       52      │
│  ♂ 72.1 év  ♀ 76.8 év         │  👴 80+        22       35      │
├────────────────────────────────┼─────────────────────────────────┤
│  REKORDOK                      │  TOP 15 CSALÁDNEVEK             │
│  👑 Kovács J. — 96 éves       │  1. Kovács ████████ 14         │
│  🍼 Nagy A. — 1 éves          │  2. Nagy   ██████░░ 11         │
│                                │  ...                            │
│  TELEPÜLÉSEK (top 5)           │                                 │
│  Kovászna  ████████ 120       │  TOP 15 KERESZTNEVEK            │
│  Sepsiszentgyörgy ██ 34       │  1. János ██████ 9             │
│  ...                           │  2. Mária ████░░ 7             │
├────────────────────────────────┴─────────────────────────────────┤
│  STÁTUSZ: 42 elhunyt │ 18 elköltözött │ 3 kitért                │
└──────────────────────────────────────────────────────────────────┘
```

### Responsive viselkedés

| Breakpoint | Személyek | Áttekintés | Családok |
|-----------|-----------|-----------|---------|
| `lg` (≥1024px) | Teljes táblázat 6 oszlop | 2 oszlop grid | Kártya grid 2×N |
| `md` (≥768px) | Táblázat: cím + foglalkozás rejtve | 1 oszlop, egymás alatt | Kártya grid 1×N |
| `sm` (<768px) | Kártya nézet (nem táblázat) | 1 oszlop | Kártya lista |

---

## 3. State kezelés

### page.tsx (Server) → props átadás

A page.tsx egyetlen `Promise.all()`-ban lekérdezi az 5 fő adatforrást és enriched adatként adja tovább a `<MemberTabs />`-nek.

```
page.tsx props → MemberTabs:
  initialMembers:     EnrichedMember[]    ← szemely + fizetési státusz + családId
  initialFamilies:    Family[]            ← csalad + férj/feleség nevek
  paidPersonIds:      number[]            ← idei fizetők (személy szinten)
  paidFamilyIds:      number[]            ← idei fizetők (család szinten)
  exemptPersonIds:    number[]            ← felmentettek
  exemptFamilyIds:    number[]            ← felmentettek (család szinten)
  personToFamilyMap:  Record<number, number>  ← személy → család mapping
  congregationId:     string
  isGodMode:          boolean
```

### MemberTabs (Client) — fő állapotkezelő

```
activeTab:          string           ← 'overview' | 'persons' | 'families' | ...
members:            EnrichedMember[] ← kliens-oldali másolat (szűrés/rendezés/törlés ezen)
families:           Family[]         ← kliens-oldali másolat
```

A `members` és `families` tömbök a kliens memóriájában élnek. A szűrés, rendezés, keresés mind ezen dolgozik — nincs új szerver-hívás minden interakciónál.

### PersonsTab állapotok

```
searchQuery:        string           ← keresőmező értéke
statusFilter:       string           ← 'aktív' | 'meghalt' | 'elkoltozott' | ...
sortState:          { col, dir }     ← rendezés (név/kor/cím/foglalkozás, asc/desc)

detailsDialogOpen:  boolean
detailsMember:      EnrichedMember | null

formDialogOpen:     boolean
editingMember:      EnrichedMember | null   ← null = új tag

removeDialogOpen:   boolean
removingMember:     { id, name } | null
```

### MemberFormDialog állapotok

```
form state:         react-hook-form + zodResolver(memberSchema)
  csaladnev, k_nev, ferfi, sz_datum, ...
  belepes_oka:      'alap' | 'bekoltozott' | 'attert'
  kereszteles:      { datum, hely, lelkesz }
  konfirmacio:      { datum, hely, lelkesz }
  szulo_apa_cnp:    string | null
  szulo_anya_cnp:   string | null

activeFormTab:      string           ← 'personal' | 'registry' | 'financial'
parentSearchOpen:   { apa: boolean, anya: boolean }
parentQuickAddOpen: boolean
parentQuickAddType: 'apa' | 'anya'
loading:            boolean
```

### MemberRemoveDialog állapotok

```
step:               'choose' | 'form'
reason:             'meghalt' | 'elkoltozott' | 'kitert' | 'torles' | null
form fields:        (reason-specifikus — halál dátum, temetés dátum, stb.)
loading:            boolean
```

### FamiliesTab állapotok

```
searchQuery:        string
sortType:           'name_asc' | 'name_desc' | 'address_asc'
familyDialogOpen:   boolean
editingFamily:      Family | null
familyDetailsOpen:  boolean
detailsFamily:      Family | null
```

### FamilyFormDialog állapotok

```
selectedHusband:    { id, name } | null
selectedWife:       { id, name } | null
selectedChildren:   { id, name }[]
addressSource:      'ferfi' | 'no'
selectedDistrict:   number | null
```

### DistrictsTab állapotok

```
districts:          District[]        ← körzetek (CRUD után frissül)
districtFamiliesOpen: boolean
currentDistrictId:  number | null
unassignedOpen:     boolean
```

### VotersTab állapotok

```
voters:             Voter[]           ← összeállított választói lista
filters:            { search, korzet, nem, jarulek, jarulekEv, sort }
```

### Nincs globális state

Minden állapot a komponens fáján belül lokálisan kezelt. Indoklás:
- A fő adatok (`members`, `families`) a `MemberTabs`-ban élnek és prop-ként mennek le
- A modal-ok a szülő fülből kapják az `open/onOpenChange` props-ot
- A Server Action-ök `revalidatePath`-et hívnak → a page.tsx újra renderel → friss props
- A kliens-oldali lista frissítése (törlés/módosítás után) azonnali memória-módosítással történik (optimistic update) + háttérben `revalidatePath`

---

## 4. API hívások

### Server Component lekérdezés (page.tsx — egyszer, betöltéskor)

5 párhuzamos Supabase lekérdezés:

| # | Tábla | Szűrő | Eredmény |
|---|-------|-------|---------|
| 1 | `szemely` | `isvisible=true`, JOIN `adrstreet`, `adrlocality` | `Member[]` |
| 2 | `befizetes` | `fizetettev = aktuális év`, `deleted ≠ true` | `{ id_szemely, id_csalad }[]` |
| 3 | `felmentes` | érvényes tartomány | `{ id_szemely, id_csalad }[]` |
| 4 | `csalad` | — | `{ id, id_ferji, id_no }[]` |
| 5 | `gyerek` | — | `{ id_szemely, id_csalad }[]` |

### Server Action hívások (kliens → szerver)

#### Személyek

| Művelet | Server Action | Ki hívja | Mikor |
|---------|--------------|---------|-------|
| Tag kartoték betöltés | `getMemberDetails(id)` | MemberDetailsDialog | modal megnyitás |
| Tag mentés | `saveMember(data)` | MemberFormDialog | form submit |
| Tag kivezetés | `removeMember(id, reason, details)` | MemberRemoveDialog | form submit |
| Település getOrCreate | `getOrCreateLocality(name)` | saveMember belül | tag mentéskor |
| Utca getOrCreate | `getOrCreateStreet(name, localityId)` | saveMember belül | tag mentéskor |

#### Családok

| Művelet | Server Action | Ki hívja | Mikor |
|---------|--------------|---------|-------|
| Családok betöltés | `getFamilies()` | FamiliesTab | fül váltás |
| Család adatlap | `getFamilyDetails(id)` | FamilyDetailsDialog | modal megnyitás |
| Család mentés | `saveFamily(data)` | FamilyFormDialog | form submit |
| Család törlés | `deleteFamily(id)` | FamiliesTab | törlés gomb + confirm |

#### Presbiterek + Körzetek

| Művelet | Server Action | Ki hívja | Mikor |
|---------|--------------|---------|-------|
| Presbiterek betöltés | `getPresbyters()` | PresbytersTab | fül váltás |
| Presbiter mentés | `savePresbyter(data)` | PresbiterFormDialog | form submit |
| Presbiter törlés | `deletePresbyter(personId)` | PresbytersTab | törlés gomb |
| Körzetek betöltés | `getDistricts()` | DistrictsTab | fül váltás |
| Körzet mentés | `saveDistrict(data)` | DistrictFormDialog | form submit |
| Körzet törlés | `deleteDistrict(id)` | DistrictsTab | törlés gomb |
| Család hozzárendelés | `assignFamilyToDistrict(fId, dId)` | DistrictFamiliesDialog | gomb |
| Család leválasztás | `removeFamilyFromDistrict(fId)` | DistrictFamiliesDialog | gomb |
| Auto hozzárendelés | `autoAssignFamilies(ids, dId)` | DistrictFamiliesDialog | gomb |

#### Választók

| Művelet | Server Action | Ki hívja | Mikor |
|---------|--------------|---------|-------|
| Választók betöltés | `getVoters()` | VotersTab | fül váltás |
| Zárolás | `lockVoterList(year)` | VotersTab | gomb |
| Feloldás | `unlockVoterList(year)` | VotersTab | gomb (esperes+) |

#### God Mode

| Művelet | Server Action | Ki hívja | Mikor |
|---------|--------------|---------|-------|
| Nem-eltérések | `getGenderMismatches()` | GenderCheckDialog | modal megnyitás |
| Javítások mentés | `saveGenderFixes(fixes)` | GenderCheckDialog | gomb |

### Adatfolyam diagram

```
SZERVER (page.tsx)                         KLIENS
━━━━━━━━━━━━━━━━━━                        ━━━━━━━━━━━━━━━━━━
                                           
 Supabase ──5× query──► enriched data      
     │                                     
     └── initialMembers, families ────────► MemberTabs
                                             │
                                    ┌────────┼────────────────┐
                                    ▼        ▼                ▼
                              PersonsTab  FamiliesTab    DistrictsTab
                                    │        │                │
                              (szűrés,   (keresés,      (hozzárendelés)
                               rendezés,  rendezés)          │
                               keresés)      │                │
                                    │        │                │
                               modal-ok  modal-ok        modal-ok
                                    │        │                │
                              ──────┴────────┴────────────────┘
                                    │
                               Server Action hívás
                                    │
          Supabase ◄── Server Action ◄───┘
               │
               └── revalidatePath ──► page.tsx újra renderel
                    + optimistic update ──► kliens memória frissül
```

---

## 5. Auth kezelés

### Rétegek

```
1. réteg: Middleware
   └── Session + token frissítés → ha nincs user → /login

2. réteg: Dashboard layout
   └── getUser() → profil → pending check → God Mode check

3. réteg: page.tsx
   └── getUser() → profil → congregation_id
   └── A Supabase kliens automatikusan a user nevében fut → RLS szűr
   └── isGodMode prop a MemberTabs-nak (God Mode funkciók megjelenítéséhez)

4. réteg: Server Actions
   └── Minden action-ben: getUser() → profil → congregation_id
   └── INSERT-nél: congregation_id a profilból (NEM a klienstől)
   └── DELETE-nél: RLS véd + pénzügyi ellenőrzés + fallback
```

### Funkció-szintű jogosultságok

| Funkció | Ki látja a gombot | Szerver-oldali ellenőrzés |
|---------|-------------------|--------------------------|
| Tag CRUD | Mindenki | RLS (congregation_id) |
| Család CRUD | Mindenki | RLS |
| Presbiter/Körzet | Mindenki | RLS |
| Választók zárolás | Mindenki | RLS |
| Választók feloldás | Esperes + Admin + Master Admin | Server Action: `isEsperesRole()` check |
| Nem-ellenőrzés gomb | Master Admin + God Mode | `isGodMode` prop → gomb render |
| Nem-ellenőrzés mentés | Master Admin | Server Action: `isMasterAdmin()` check |

### Congregation ID védelme

A kliens SOHA nem küldi a `congregation_id`-t. Minden Server Action-ben:
1. `getUser()` → `user.id`
2. `profiles` tábla → `congregation_id`
3. Ez kerül az INSERT-be

Ha valaki a kliens-kódot manipulálná és más `congregation_id`-t próbálna küldeni, a Server Action figyelmen kívül hagyja — mindig a profilból olvassa.

---

## 6. Validáció elhelyezése

### Zod sémák helye

**Fájl:** `lib/validations/members.ts`

Minden séma itt van definiálva — kliens ÉS szerver is importálja.

### Sémák

#### memberSchema (tag felvétel / szerkesztés)

```
id:              number | undefined
csaladnev:       string, min(1), "A családnév kötelező"
k_nev:           string, min(1), "A keresztnév kötelező"
szcs_nev:        string | undefined
ferfi:           boolean, "A nem megadása kötelező"
sz_datum:        string (YYYY-MM-DD) | null
sz_hely_text:    string | undefined
foglalkozas:     string | undefined
vallas:          string, default "Református"
c_helyseg_text:  string, min(1), "A település kötelező"
c_utca_text:     string, min(1), "Az utca kötelező"
c_szam:          string, default "1"
c_tombhaz:       string | undefined
c_lepcsohaz:     string | undefined
c_emelet:        string | undefined
c_ajto:          string | undefined
telefon:         string | undefined
email:           string, email() | undefined
megjegyzes:      string | undefined
belepes_oka:     enum("alap", "bekoltozott", "attert")
// Beköltözött extra
bek_datum:       string | undefined (kötelező ha belepes_oka = bekoltozott)
bek_honnan:      string | undefined
bek_igazolas:    string | undefined
// Áttért extra
att_datum:       string | undefined (kötelező ha belepes_oka = attert)
att_felekezet:   string | undefined
att_honnan:      string | undefined
// Szülők
id_apja_cnp:     string | undefined
id_anyja_cnp:    string | undefined
apjaneve:        string | undefined
anyjaneve:       string | undefined
// Anyakönyv
kereszteles:     { datum, hely, lelkesz } | undefined
konfirmacio:     { datum, hely, lelkesz } | undefined
// Pénzügyi
fizeto_status:   enum("fizet", "felmentett", "nem_fizet") | undefined
```

#### removeSchema (tag kivezetés)

```
id:              number, kötelező
reason:          enum("meghalt", "elkoltozott", "kitert", "torles")
// Elhunyt
hdatum:          string (kötelező ha reason = meghalt)
tdatum:          string (kötelező ha reason = meghalt)
hhely:           string | undefined
thely:           string | undefined
hoka:            string | undefined
lelkesz:         string | undefined
munkanaplo:      boolean | undefined
// Elköltözött
kolt_datum:      string | undefined
kolt_hova:       string | undefined
kulfold:         boolean | undefined
kolt_megj:       string | undefined
// Kitért
kitert_datum:    string | undefined
kitert_vallas:   string | undefined
kitert_hova:     string | undefined
kitert_megj:     string | undefined
```

#### familySchema

```
id:              number | undefined
id_ferfi:        number | null     (legalább egy fél kötelező — refine)
id_no:           number | null
gyerekIds:       number[]
c_utcaid:        number | undefined
c_szam:          string | undefined
id_csoport:      number | null
```

#### districtSchema

```
id:              number | undefined
nev:             string, min(1), "A körzet neve kötelező"
isaktiv:         boolean, default true
```

#### presbyerSchema

```
id_szemely:      number, kötelező, "Válasszon egyháztagot"
tisztseg:        string, default "Presbiter"
id_csoport:      number | null
```

### Hol fut a validáció

| Réteg | Mit validál | Hogyan | Hibajelzés |
|-------|-----------|--------|-----------|
| **Kliens — form** | MemberFormDialog | `react-hook-form` + `zodResolver(memberSchema)` | Mező alatti piros hibaüzenet |
| **Kliens — form** | FamilyFormDialog | `zodResolver(familySchema)` | Mező alatti hiba |
| **Kliens — form** | MemberRemoveDialog | `zodResolver(removeSchema)` | Mező alatti hiba |
| **Szerver — action** | `saveMember()` | `memberSchema.safeParse(data)` | `{ error }` return → toast |
| **Szerver — action** | `removeMember()` | `removeSchema.safeParse(data)` | `{ error }` return → toast |
| **Szerver — action** | `saveFamily()` | `familySchema.safeParse(data)` | `{ error }` return → toast |
| **Szerver — action** | `saveDistrict()` | `districtSchema.safeParse(data)` | `{ error }` return → toast |
| **Szerver — action** | `savePresbyter()` | `presbyerSchema.safeParse(data)` | `{ error }` return → toast |
| **Adatbázis — RLS** | congregation_id | Supabase policy | Supabase error (silent fail) |

### Üzleti validációk a szerveren (nem Zod)

| Szabály | Hol | Mi történik |
|---------|-----|-------------|
| Család: legalább férj VAGY feleség | `saveFamily()` | `{ error: "Legalább egy felet meg kell adni" }` |
| Törlés: pénzügyi tranzakció ellenőrzés | `removeMember()` | Ha van → elrejtés fallback |
| Törlés: RLS blokkolás | `removeMember()` | Ha DELETE nem tér vissza sorral → elrejtés fallback |
| Törlés: munkanapló csatolás | `removeMember()` | Kliens confirm → szerver paraméter |
| Presbiter: személy kötelező | `savePresbyter()` | `{ error: "Válasszon egyháztagot" }` |
| Választók feloldás: esperes+ | `unlockVoterList()` | `isEsperesRole()` check → `{ error }` |
| Nem-ellenőrzés: Master Admin | `saveGenderFixes()` | `isMasterAdmin()` check → `{ error }` |

### Validáció NEM szükséges

| Adat | Miért nem |
|------|----------|
| Személyek lista (olvasás) | Nincs user input |
| Családfa adatok | Csak olvasás |
| Áttekintés számítások | Csak olvasás |
| Település/utca getOrCreate | A szerver automatikusan kezeli |

---

## Összefoglaló: fájlok és felelősségek

```
ADATRÉTEG
├── lib/constants/members.ts          ← státuszok, korcsoportok, badge színek, nem-heurisztika
├── lib/utils/member-helpers.ts       ← formatNameWithPrefix(), calculatePaymentStatus(),
│                                        guessGender(), generateCnp()
├── lib/validations/members.ts        ← Zod: memberSchema, removeSchema, familySchema,
│                                        districtSchema, presbyerSchema
│
SZERVER RÉTEG
├── app/(dashboard)/tagnyilvantartas/
│   ├── page.tsx                      ← 5 pár. query → enriched data → MemberTabs props
│   ├── actions.ts                    ← getMembers, getMemberDetails, saveMember,
│   │                                    removeMember, getOrCreateLocality/Street
│   ├── family-actions.ts            ← getFamilies, saveFamily, deleteFamily
│   ├── presbyter-actions.ts         ← presbiter+körzet CRUD, család-körzet hozzárendelés
│   ├── voter-actions.ts             ← getVoters, lock/unlockVoterList
│   └── gender-actions.ts           ← getGenderMismatches, saveGenderFixes
│
MEGJELENÍTÉSI RÉTEG (Client)
├── components/members/
│   ├── member-tabs.tsx               ← fül-váltó orchestrátor
│   ├── overview-tab.tsx              ← demográfia + korcsoportok + előrejelzés
│   │   ├── age-groups-chart.tsx
│   │   └── forecast-cards.tsx
│   ├── persons-tab.tsx               ← személyek lista + szűrés + rendezés
│   │   ├── member-table.tsx
│   │   ├── member-search.tsx
│   │   ├── member-status-badge.tsx
│   │   └── parent-search.tsx
│   ├── families-tab.tsx              ← családok lista
│   │   └── family-card.tsx
│   ├── presbyters-tab.tsx            ← presbiterek lista
│   ├── districts-tab.tsx             ← körzetek + család hozzárendelés
│   │   └── district-families.tsx
│   └── voters-tab.tsx                ← választók szűrt lista
│       └── voter-list.tsx
│
MODAL RÉTEG (Client)
├── components/modals/
│   ├── member-details-dialog.tsx     ← kartoték adatlap
│   ├── member-form-dialog.tsx        ← tag felvétel/szerkesztés (3 fül)
│   ├── member-remove-dialog.tsx      ← kivezetés (4 mód)
│   ├── parent-quick-add-dialog.tsx   ← szülő gyorsrögzítés
│   ├── family-details-dialog.tsx     ← család adatlap
│   ├── family-form-dialog.tsx        ← család CRUD
│   ├── presbyter-form-dialog.tsx     ← presbiter CRUD
│   ├── district-form-dialog.tsx      ← körzet CRUD
│   ├── district-families-dialog.tsx  ← körzet–család hozzárendelés
│   ├── unassigned-families-dialog.tsx← körzet nélküliek
│   ├── gender-check-dialog.tsx       ← nem-ellenőrzés (God Mode)
│   └── voters-print-dialog.tsx       ← választók nyomtatás
```
