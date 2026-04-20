# KARTOTEKA — TVA (ÁFA) figyelő + comodat / locațiune megkülönböztetés

**Dátum**: 2026-04-16
**Állapot**: tervezés
**Kapcsolódó**: `KARTOTEKA-penzugy-fejlesztesi-roadmap-2026-04-16.md`, `KARTOTEKA-oblio-efactura-integracio-terv-2026-04-16.md`

---

## Vezetői összefoglaló

A gyülekezet **kultusz-jogi személy**, amely az **Codul fiscal art. 292 alin. (1) lit. k)** alapján **mentes az ÁFA-tól**, **amennyiben csak** tagdíj/járulék/adomány/szertartási szolgáltatás típusú bevétele van. **Ha azonban** bérleti díjat, könyvet, terembérletet vagy hasonló **gazdasági tevékenységet** folytat, az ÁFA-plafon **(2025.09.01 óta 395 000 RON, 2026-ban változatlan)** alkalmazandó. **Túllépéskor** 10 napon belül be kell nyújtani a **010-es** nyomtatványt az ANAF-hoz, és a következő hó elsejétől TVA-alannyá válik.

A rendszer **figyelő funkciót** kap, amely:
1. **Minden bevétel-kategóriához** (`szamadasicel` 1xx) egy **zászlót** rendel: beleszámít-e a plafon-forgalomba
2. **Naptári éves kumulált** forgalmat mér
3. **3 szintű** jelzés: 80% (sárga), 90% (narancs), 100% (piros)
4. **A lelkipásztornak ad magyarázatot** + utasítja, hogy a könyvelővel egyeztesse a 010-es beadását

---

## Jogszabályi alap

### A fő hivatkozások

| Jogszabály | Cikk | Tartalom |
|---|---|---|
| Legea 227/2015 (Codul fiscal) | **art. 310 alin. (1)** | Kis vállalkozás ÁFA-mentesség plafon |
| OG nr. 22/2025 | módosítás | A plafon **300 000 → 395 000 RON** emelés, **2025.09.01-től** |
| Codul fiscal | **art. 292 alin. (1) lit. k)** | Nonprofit szervezet (köztük kultusz) tagi kollektív érdek szerinti szolgáltatása mentes |
| Codul fiscal | **art. 292 alin. (2) lit. e)** | Ingatlan-bérbeadás mentes **levonási jog nélkül**, **de beleszámít** a plafon-forgalomba |
| Codul fiscal | **art. 292 alin. (3)** | Taxare prin opțiune — az ONG önként ÁFA-alannyá válhat, ha levonási jogot akar |
| Cod civil | **art. 2146-2157** | Comodat (haszonkölcsön, ingyenes használat) szabályai |

### Comodat vs. locațiune összefoglaló táblázat

| Kritérium | Comodat | Locațiune (chirie) |
|---|---|---|
| Jelleg | Ingyenes használat | Ellenérték fejében használat |
| Jogi alap | Cod civil 2146-2157 | Cod civil + Codul fiscal |
| Számla ki van állítva? | **Nem** | **Igen**, ÁFA-mentesen (lit. e) vagy ÁFA-sal (opció) |
| ÁFA-plafonba számít? | **NEM** | **IGEN** (függetlenül attól, hogy mentes vagy sem) |
| Ellenőrzés | Szerződés maga igazolja az ingyenességet | Bérleti díj és számla |

### Mi számít a plafon-forgalomba (gyülekezeti kontextus)

| Kategória | Beleszámít? | Megjegyzés |
|---|---|---|
| Egyházfenntartói járulék | ❌ Nem | Tagi kollektív érdek, art. 292 (1) lit. k) |
| Persely, adomány | ❌ Nem | Nem ellenérték |
| Keresztelő, esketés, temetés díja | ❌ Nem | Vallási szertartás, art. 292 (1) lit. k) |
| Liturgikus tárgy tagnak értékesítve | ❌ Nem | Szoros kapcsolat a vallási tevékenységgel |
| **Bérleti díj (chirie, locațiune)** | ✅ **IGEN** | Art. 292 (2) lit. e) — mentes, **de számít** |
| **Terembérlet harmadik félnek** | ✅ **IGEN** | Ugyanaz, gazdasági tevékenység |
| **Könyv/újság eladás külső feleknek** | ✅ **IGEN** | Gazdasági tevékenység |
| **Tábor- és oktatási díj külsősöknek** | ✅ **IGEN** | Bizonyos esetekben lit. f) mentes, de a plafonba számít |
| **Temetői sírhely-újraváltás** | ⚠️ Bizonytalan | Alapértelmezés **IGEN**, konfigurálható |
| **Comodat alapú használat** | ❌ Nem | Nincs ellenérték |
| **Felújítási támogatás, pályázat** | ❌ Nem | Szubvenció, nem gazdasági bevétel |

---

## Adatmodell változtatások

### 1. `szamadasicel` bővítés — `tva_plafonba_szamit` zászló

```sql
ALTER TABLE public.szamadasicel
  ADD COLUMN IF NOT EXISTS tva_plafonba_szamit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tva_mentesseg_hivatkozas text;

COMMENT ON COLUMN public.szamadasicel.tva_plafonba_szamit IS
  'TRUE, ha a célkódra érkező bevétel beleszámít a TVA-plafon (395 000 RON) forgalmába (gazdasági tevékenység).';
COMMENT ON COLUMN public.szamadasicel.tva_mentesseg_hivatkozas IS
  'Opcionális jogszabályi hivatkozás (pl. art. 292 alin. (1) lit. k) Codul fiscal) a kategória ÁFA-mentességi alapjához.';
```

**Seed frissítés**: a meglévő célkódoknál (EREK PÉNZÜGYEK alapján):
- `101` Egyházfenntartás, `102` Misszió, `103` Egyéb egyházi: `tva_plafonba_szamit = false`
- `104` Gazdasági tevékenység: `tva_plafonba_szamit = true`
- `105` Szubvenció: `tva_plafonba_szamit = false`

(Finom szint: a `104.xx` alkódoknál lehet egyedileg állítani — pl. `104.05` bérleti díj `true`, `104.99` egyéb esetleg `false`.)

### 2. `berleti_szerzodes` bővítés — comodat megkülönböztetés

A meglévő `tipus` mező értékei `'terulet', 'epulet'` — ezek **a szerződés tárgyát** jelölik, nem a **jogi típusát**. Új mező:

```sql
ALTER TABLE public.berleti_szerzodes
  ADD COLUMN IF NOT EXISTS jogi_tipus text DEFAULT 'locatiune' CHECK (
    jogi_tipus = ANY (ARRAY['locatiune','comodat','concesiune'])
  );

COMMENT ON COLUMN public.berleti_szerzodes.jogi_tipus IS
  'Szerződés jogi típusa: locatiune (bérleti, ellenérték ellenében), comodat (ingyenes használat), concesiune (koncesszió). Hatással van az ÁFA-plafon számításra és az e-Factura kiállításra.';
```

**Logika**:
- `locatiune` → generál bevételt, beleszámít a plafonba, e-Factura kötelező
- `comodat` → **nincs** bevétel (`osszeg = 0` kötelező), nem számít plafonba, **nem** állítható ki számla
- `concesiune` → bonyolultabb, alapértelmezés `locatiune` kezelés

**Validáció**: ha `jogi_tipus = 'comodat'` és `osszeg > 0` → hibajelzés a formon („Haszonkölcsön esetén az összeg kötelezően 0. Ha ellenérték van, inkább bérleti szerződés (locațiune)").

### 3. `congregations` vagy `bealitas` — TVA státusz tárolása

```sql
ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS tva_alany boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tva_alany_tol date,
  ADD COLUMN IF NOT EXISTS tva_kod text;

COMMENT ON COLUMN public.congregations.tva_alany IS
  'TRUE, ha a gyülekezet TVA-alany (átlépte a plafont vagy taxare prin opțiune).';
COMMENT ON COLUMN public.congregations.tva_alany_tol IS
  'Az a dátum, amelytől a gyülekezet TVA-alany (az ANAF által visszaigazolt hatálybalépés).';
COMMENT ON COLUMN public.congregations.tva_kod IS
  'TVA-kód (CUI TVA), pl. RO12345678. Csak ha tva_alany = TRUE.';
```

**Logika**: ha `tva_alany = true`, a figyelő nem plafon-közeledést jelez, hanem **TVA-számítást és -bevallást** kellene mutatnia. Ez későbbi fejlesztés — most csak az **alany-alatti** gyülekezetre fókuszálunk.

---

## Számítási logika

### A forgalom-összesítő

```typescript
// lib/finance/tva-plafon.ts (új fájl)

export interface TvaPlafonResult {
  year: number
  szamoltForgalomRon: number        // A beszámított bevételek összege
  tvaPlafonRon: number              // Hatályos plafon (alapértelmezés 395000)
  szazalek: number                  // 0-100+
  szint: 'nyugodt' | 'sarga' | 'narancs' | 'piros'
  beszamitoTetelek: Array<{
    szamadasicelKod: string
    celNev: string
    osszesen: number
  }>
  utolsoFrissites: Date
}

export async function calculateTvaPlafon(
  supabase: SupabaseClient,
  congregationId: string,
  year: number = new Date().getFullYear(),
): Promise<TvaPlafonResult>
```

**Lépések**:
1. Lekérdezi a `szamadasicel`-eket ahol `tva_plafonba_szamit = true`
2. Lekérdezi a `befizetes`-eket az adott évre (`fizetettev = year` VAGY `datum BETWEEN '{year}-01-01' AND '{year}-12-31'`) ahol a célkód a fenti listában
3. A `berleti_szerzodes` alapján a `comodat` szerződések explicite kizárva (akkor is, ha `jogi_tipus` még üres a táblában, fallback: `osszeg = 0` → comodat)
4. Összesít, % számít, szintet rendel

**Alapértelmezett plafon és szintek** (konstansok):
```typescript
export const TVA_PLAFON_RON = 395_000           // OG 22/2025 szerint 2025.09.01-től
export const TVA_FIGYELMEZTETES_SARGA = 0.80    // 316 000 RON
export const TVA_FIGYELMEZTETES_NARANCS = 0.90  // 355 500 RON
export const TVA_FIGYELMEZTETES_PIROS = 1.00    // 395 000 RON
```

---

## UI megjelenítés

### 1. Pénzügyi Dashboard tetején — TVA-widget

A `components/finance/dashboard-tab.tsx`-be új kártya kerül **feltételesen** (csak ha a szamoltForgalom > 0, tehát van legalább egy plafonba számító tétel):

```
┌──────────────────────────────────────────────┐
│  ⚠️  TVA (ÁFA) plafon figyelő               │
│                                               │
│  Eddigi 2026-os gazdasági forgalom:          │
│      156 200 RON  /  395 000 RON             │
│                                               │
│  ▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░  39%         │
│                                               │
│  Állapot: NYUGODT                            │
│  Beszámító kategóriák: 104.05 bérleti díj,  │
│     104.10 terembérlet                       │
│                                               │
│  [Részletek] [Kategória-beállítások]         │
└──────────────────────────────────────────────┘
```

**Színek szint szerint**:
- Nyugodt (< 80%): szürke háttér, információs hang
- Sárga (80-90%): `bg-amber-50 border-amber-200`, figyelő hang
- Narancs (90-100%): `bg-orange-50 border-orange-300`, sürgető hang
- Piros (> 100%): `bg-red-50 border-red-300`, kritikus, kiemelt

### 2. Részletek modal

Katt a „Részletek"-re → modal megnyílik:
- **Havi bontás**: melyik hónapban mennyi beszámító bevétel volt
- **Kategória-bontás**: célkódonként
- **Szerződés-bontás**: melyik bérleti szerződésből mennyi jött
- **Útmutató-link**: mit csinálj, ha a küszöb közeledik

### 3. Kategória-beállítások

A `szamadasicel` katalógust kezelő admin felületen (ha van — ha nincs, építeni kell egy egyszerűt):
- Minden kategória mellett egy **kapcsoló**: „Számít a TVA-plafonba?"
- Mellette **jogszabályi hivatkozás** szöveges mező
- **Figyelmeztetés**, ha a flag változik: „Ez hatással van a TVA-számításra. Biztos vagy benne?"

### 4. Bérleti szerződés form

A `components/finance/rental-tab.tsx`-be új mező:
- **Szerződés jogi típusa**: [ locatiune / comodat / concesiune ]
- Ha `comodat`, az összeg mező automatikusan 0 és disable-olt, felirat: „Haszonkölcsön — ingyenes használat, nem keletkezik bevétel."
- **Magyarázó tooltip** a mezőnél:
  > „**Locațiune** (bérleti): a bérlő fizet a használatért → az összeg beleszámít a TVA-plafonba.
  > **Comodat** (haszonkölcsön): ingyenes használatba adás (pl. Diaconia, ifjúsági egyesület) → NEM számít.
  > **Concesiune**: speciális koncesszió, kérd ki a könyvelő véleményét."

### 5. Figyelmeztetés átlépéskor

Ha a `szazalek >= 100`:
- **Piros toast** a rendszer megnyitásakor
- **Értesítés** (`ertesitesek` táblába) a lelkésznek és az esperesnek:
  > „A(z) [gyülekezet neve] gyülekezet 2026-ban átlépte a TVA-plafont (395 000 RON). A törvény szerint **10 napon belül** a könyvelőnek be kell nyújtania a 010-es nyomtatványt az ANAF-hoz, és a következő hónap elsejétől a gyülekezet TVA-alannyá válik. Sürgős: keressétek fel a könyvelőt."
- **Dashboard piros sávval** a lap tetején

---

## Server actions

### Új fájl: `app/(dashboard)/penzugy/tva-actions.ts`

```typescript
'use server'

// TVA-plafon számítás egy évre
export async function calculateTvaPlafonForYear(year: number): Promise<TvaPlafonResult>

// TVA-alany státusz lekérdezés
export async function getTvaStatus(congregationId: string): Promise<TvaStatus>

// TVA-alany státusz frissítés (admin)
export async function setTvaStatus(args: {
  congregationId: string
  isTvaAlany: boolean
  tvaAlanyTol?: string
  tvaKod?: string
}): Promise<void>

// Kategória zászló frissítés (admin)
export async function setKategoriaPlafonFlag(args: {
  szamadasicelId: string
  tvaPlafonbaSzamit: boolean
  hivatkozas?: string
}): Promise<void>
```

---

## Tesztelési szempontok

1. **Alap eset**: egyetlen bérleti szerződés, 800 RON/hó, 12 hó = 9 600 RON → `szazalek ≈ 2.4%`, `nyugodt`
2. **Sárga küszöb**: bérleti szerződés 30 000 RON/hó → évente 360 000 RON → `szazalek ≈ 91%`, `narancs`
3. **Piros küszöb**: 40 000 RON/hó → 480 000 RON → `szazalek ≈ 121%`, `piros`, figyelmeztetés + értesítés
4. **Comodat figyelmen kívül**: ha egy szerződés `jogi_tipus = 'comodat'`, az abból származó bevételek (ha lennének) ne legyenek a plafonba
5. **Kategóriahatár változás**: ha admin átkapcsolja a `104.05`-öt `false`-ra, a forgalom azonnal csökkenjen (a widgetben)
6. **Évváltás**: 2026. január 1-jén a számláló **nullázódik** (csak az aktuális évi forgalom)
7. **Mentes kategória**: `101` járulékon 500 000 RON befizetett → ne jelezzen **semmit**, mert nem gazdasági
8. **TVA-alany gyülekezet**: ha `tva_alany = true` a `congregations`-on, a widget **más üzenetet** mutat („Ön már TVA-alany, ez a figyelő nem aktív.") — vagy rejtse el

---

## Fejlesztési ütemterv

### A. Backend
1. DB migráció (új oszlopok 3 táblán) — egy migráció-fájl
2. Seed frissítés: a meglévő `szamadasicel` sorokon a flag értékek beállítása
3. `lib/finance/tva-plafon.ts` — számítási logika
4. `app/(dashboard)/penzugy/tva-actions.ts` — server actions

### B. Frontend
5. Dashboard widget (`dashboard-tab.tsx` bővítés)
6. Részletek modal
7. Kategória-beállítások admin oldal (ha még nincs, egyszerű lista kapcsolókkal)
8. Bérleti szerződés form: `jogi_tipus` mező
9. Értesítés + toast a piros átlépéskor

### C. Dokumentáció
10. Használati útmutató 12. szekció: TVA
11. Jogszabályi hivatkozások referenciája (`docs/user-guide/tva-jogszabalyok.md`)

---

## Kockázatok

1. **Jogszabályi változás** — a plafon összege, a mentesség, vagy a comodat besorolás módosulhat. **Minden konstans** legyen konfigurálható (adatbázisban vagy env változókban), és az Útmutató **minden kritikus szabálynál** jelezze a hatályosság dátumát.
2. **Téves zászlózás** — ha admin rosszul állítja be a kategória-flag-et, a figyelő téves képet ad. **Audit log** kell a flag változtatásokra: ki, mikor, miről mire.
3. **Bizonytalan jogi kategóriák** (temetői díj, tábordíj) — a rendszer **alapértelmezetten beszámítja**, de a lelkész felülbírálhatja a könyvelővel egyeztetve. **Tooltip** és **útmutató** egyértelmű legyen.
4. **Comodat visszaélés** — ha a lelkész „comodat"-ra címkéz egy valójában bérleti szerződést, hogy elkerülje a plafon-számítást, az **adózási kockázat**. A rendszer nem tudja ezt eldönteni, de **figyelmeztető szöveg** a formon („A comodat szerződés VALÓDI ingyenes használatot jelent. Ha bármilyen ellenérték — pl. rezsi-hozzájárulás — van, az már locațiune.").
5. **Gördülő 12 hónap vs. naptári év** — a jogszabály naptári évet használ (art. 310 alin. (1)); a rendszer is ezt kövesse. Ha valaha 12 hónapra váltás jönne, a logika kész legyen rá.

---

## Nyitott kérdések

1. **Mely gyülekezetek vannak már TVA-alanyok?** (Ha vannak, ők a widget más módját kapják — pl. ÁFA-bevallási figyelő. Most az alapfigyelőt az alany-alattiakra építjük.)
2. **A kategória-zászlók kezdeti (seed) beállítása** — ezt én összeállítom alapértelmezett javaslatként, de a **végső jóváhagyást könyvelő szakmai review-val** javaslom.
3. **Admin kategória-szerkesztő felület** — már van ilyen valahol a rendszerben? (A „szamadasicel" listát hol lehet szerkeszteni? Én nem láttam még; ha nincs, akkor készítünk egy egyszerűt erre is.)
4. **A comodat szerződés** maradjon a `berleti_szerzodes` táblában, vagy **külön entitás** legyen? — **Javaslat**: maradjon ugyanabban, csak `jogi_tipus` mezővel megkülönböztetve. Egyszerűbb UI, kevesebb kódduplikáció.
5. **Nyomtatványok** — a 010-es és esetleges TVA-bevallások nyomtatott sablonjait mi ne generáljuk (az a könyvelő és a SAGA/Oblio dolga). **Jóváhagyás**: igen, ezek maradjanak a könyvelőnél.
