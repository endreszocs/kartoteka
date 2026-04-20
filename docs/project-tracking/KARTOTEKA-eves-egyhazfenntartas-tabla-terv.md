# Tervdokumentum — Éves egyházfenntartási díjak táblázat + tartozás-horizont logika

**Státusz**: tervezés (2026-04-21)
**Kapcsolódó user-kérés**: "Az éves előzmények fület a pénzügyek fülbe olvaszd be és legyen sokkal egyértelműbb átláthatóbb és szebb akár 10 évre visszamenőleg is lehessen beállítani a régi egyházfenntartások összegeit. Azokra már nem lehet kedvezményt beállítani, mert az már elmaradásnak számítanak!"

---

## 1. A kérés lényege

Három összekapcsolódó változás:

1. **Szerkezet**: az "Éves előzmények" külső tab megszűnik, a tartalma beolvad a **Pénzügy → Alapdíj** al-tabba.
2. **UX**: 10 évre visszamenőleg lehessen évenkénti egyházfenntartást beállítani.
3. **Szabály**: régebbi évekre **nincs** kedvezmény (elmaradásnak számít, teljes összeg fizetendő).
4. **Tartozás-logika**: a rendszer a tartozást **az utolsó rögzített kifizetéstől** számolja vissza, NEM a legkorábbi rögzített díjtól.

---

## 2. UI koncepció — Alapdíj al-tab

### Új szerkezet

```
┌─── ALAPDÍJ AL-TAB ──────────────────────────────────┐
│                                                       │
│ ┌─ Aktuális év (2026) — szerkeszthető ──────────────┐│
│ │ Teljes éves díj: [200] RON                         ││
│ │                                                     ││
│ │ ℹ️ A fizetési határidő automatikusan dec. 31.       ││
│ │   Kedvezmények a "Kedvezmények" fülön állíthatók.  ││
│ └─────────────────────────────────────────────────────┘│
│                                                       │
│ ┌─ Tartozás számítási módja ─────────────────────────┐│
│ │ [kártyás radio: Akkori / Aktuális összeg]          ││
│ │ [infó-box példával]                                ││
│ └─────────────────────────────────────────────────────┘│
│                                                       │
│ ┌─ Évenkénti díjak (visszamenőleg) ──────────────────┐│
│ │ Itt rögzítheted a korábbi évek tagsági díjait,     ││
│ │ akár 10 évre visszamenőleg. Ezekre már nincs       ││
│ │ kedvezmény — a régebbi évek befizetetlen tételei   ││
│ │ elmaradásnak számítanak.                           ││
│ │                                                     ││
│ │ ┌──────┬──────────┬──────────────────────────────┐ ││
│ │ │ Év   │ Díj (RON)│                              │ ││
│ │ ├──────┼──────────┼──────────────────────────────┤ ││
│ │ │ 2025 │ 180      │ [Szerkeszt] [🗑]             │ ││
│ │ │ 2024 │ 150      │ [Szerkeszt] [🗑]             │ ││
│ │ │ 2023 │ 150      │ [Szerkeszt] [🗑]             │ ││
│ │ │ 2022 │ 120      │ [Szerkeszt] [🗑]             │ ││
│ │ │ 2021 │ (nincs)  │ [+ Hozzáadás]                │ ││
│ │ │ 2020 │ (nincs)  │ [+ Hozzáadás]                │ ││
│ │ │ ...  │ (nincs)  │ [+ Hozzáadás]                │ ││
│ │ │ 2017 │ (nincs)  │ [+ Hozzáadás]                │ ││
│ │ └──────┴──────────┴──────────────────────────────┘ ││
│ │                                                     ││
│ │ ℹ️ A tartozást a rendszer visszamenőlegesen        ││
│ │   számolja — addig az évig, ameddig a tag utolsó   ││
│ │   kifizetése történt. Ha a tag utoljára 2020-ra    ││
│ │   fizetett, a tartozás 2021-től indul.             ││
│ └─────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────┘
```

### Részletek

- **Aktuális év (pl. 2026)**: a `congregations.eves_jarulek` mezőben tárolva, szerkeszthető. A kedvezmények ehhez az évhez tartoznak.
- **Visszamenőleges évek**: a `congregation_annual_fees` táblában (már létezik). Új/módosítás/törlés CRUD.
- **Kedvezmény oszlop nincs** a régebbi éveknél — ez explicit UX-szabály.
- **10 év default**: a lelkész lát 10 sort (aktuális év - 10). Bővíthető "További évek" gombbal, ha régebbi kell.

---

## 3. Tartozás-horizont logika — részletesen

### Az alapelv

**A tartozás nem mindentől, csak az utolsó fizetéstől számolódik.**

### A számítás lépései egy tag `m`-re:

1. **Gyűjtsd össze a tag befizetéseit**:
   ```sql
   SELECT DISTINCT fizetettev FROM befizetes
    WHERE id_szemely = :m
      AND deleted = false
      AND stornozott = false
   ```

2. **Határozd meg a tartozás-horizont kezdetét**:
   - Ha van legalább egy befizetés: `lastPaidYear = MAX(fizetettev)` → horizontStart = lastPaidYear + 1
   - Ha nincs egyetlen befizetés sem: **fallback-szabály** (lásd 3.1.)

3. **Állítsd össze a tartozás-éveket**:
   ```
   FOR év = horizontStart → currentYear:
     Ha a `congregation_annual_fees`-ben van díj erre az évre:
       Ha a tag befizetései < éves díj:
         +debtYear: { év, fizetendő = éves díj - eddig_befizetett }
     Különben:
       Átugrás — nincs rögzítve erre az évre díj, nincs tartozás
   ```

4. **Összeg**: `totalDebt = SUM(debtYears)`

### 3.1. Fallback: sosem fizetett

Ha a tagnak nincs egyetlen befizetése sem (új tag, vagy még sosem rögzítették), akkor **mettől számoljuk a tartozást**?

**Javasolt opciók** (a user-nek választásra):

| Opció | Logika | Hangulat |
|---|---|---|
| **A** | A tag csatlakozási évétől (`bekoltozott.mikor` vagy `szemely.confirmation_date`) | Személyes — „mióta vagy velünk" |
| **B** | A `congregation_annual_fees` legkorábbi évétől | Gyülekezet-szintű — „amíg díj van rögzítve" |
| **C** | Az aktuális évtől (csak mostantól kezdve) | Új start — „kezdjünk tisztán" |
| **D** | Ne mutassa tartozásnak, amíg nincs első befizetés | Puha — „még új a tag, várunk" |

**Javaslatom**: **B opció** (legkorábbi rögzített díj-év) **ÉS** a lelkész gyülekezet-szintű beállításként a "Alapdíj" al-tabon **megadhassa** a **tartozás-horizont legkorábbi évét** (pl. „nem megyünk 2020 elé").

### 3.2. Részleges befizetés

Ha a tag egy évre csak részben fizetett (pl. 150-ből 80-at adott), akkor a fennmaradó (70 RON) **tartozás** lesz arra az évre, és a következő év is tartozik (ha nincs külön rá befizetés).

### 3.3. Tartozás-mód interakciója

A `tartozas_szamitas_mod` kapcsoló (akkori / aktuális) most is működik, csak a **díj** számítást módosítja:
- `akkori`: az év saját, rögzített díja
- `aktualis`: a legfrissebb (aktuális évi) díj minden tartozó évre

Ez független a tartozás-horizont kezdetétől.

### 3.4. Példák

**Példa 1**: Szokványos eset
- Éves díjak: 2020=100, 2021=120, 2022=130, 2023=150, 2024=180, 2025=200, 2026=200
- Tag befizetései: 2020, 2021, 2022 (mind teljes)
- Utolsó fizetett év: 2022 → horizont: 2023-tól
- Tartozás: 2023(150) + 2024(180) + 2025(200) + 2026(200) = **730 RON**

**Példa 2**: Nem-folytonos évek
- Tag befizetései: 2020, 2023 (közben 2021-22 nem fizetett, de 2023 igen)
- Utolsó fizetett év: 2023 → horizont: 2024-től
- Tartozás: 2024(180) + 2025(200) + 2026(200) = **580 RON**
- **Figyelem**: a 2021-2022 nincs visszaszámítva! Ez **szándékos**, a user szabálya szerint.

**Példa 3**: Részleges befizetés
- Éves díjak: 2024=180, 2025=200, 2026=200
- Tag befizetései: 2024 (100 RON), 2025 (0), 2026 (0)
- Utolsó fizetett év (bármi): 2024 → horizont: 2025-től
- Tartozás: 
  - 2024-re: 180-100 = **80 RON hátralék** (részleges miatt még fizetendő)
  - 2025: 200, 2026: 200
  - Összesen: **480 RON**
  
  **Kérdés**: a részleges 2024-et beleszámoljuk a horizontba? 
  
  **Javaslatom**: IGEN, a részleges fizetés nem "teljes fizetés" — a horizont-éves tartozást külön kezeljük.

**Példa 4**: Sosem fizetett + B-opció
- Éves díjak: 2020=100, ..., 2026=200
- Tag befizetései: 0
- Horizont: a legkorábbi rögzített díjtól (2020)
- Tartozás: 2020(100) + 2021(120) + ... + 2026(200) = **1080 RON**

---

## 4. Adatmodell — már minden létezik

A `congregation_annual_fees` tábla már létezik (2026-04-09 sql):

```sql
CREATE TABLE congregation_annual_fees (
  congregation_id uuid NOT NULL,
  year integer NOT NULL,
  eves_jarulek numeric NOT NULL,
  jarulek_kedvezmenyes numeric,        -- mostantól nem használjuk (régi mezők)
  jarulek_hatarid text,                -- mostantól nem használjuk
  note text,
  PRIMARY KEY (congregation_id, year)
);
```

**Nem kell új migráció** — a mezők már léteznek. Csak a **UI szabály**: a `jarulek_kedvezmenyes` nem szerkeszthető a régebbi éveknél.

---

## 5. Új server action-ök

### 5.1. Módosítandó már meglévő action-ök

- `getCongregationAnnualFees(congregationId)` — már létezik, visszaadja a táblát. **Nem változik.**
- `saveCongregationAnnualFee(congregationId, payload)` — már létezik. **Egyszerűsítjük**: csak az `year` és `eves_jarulek` kötelező, a `jarulek_kedvezmenyes` és `hatarid` nélkül.
- `deleteCongregationAnnualFee(congregationId, year)` — új action, a sor törléséhez.

### 5.2. Új action: tartozás-számítás

```typescript
// app/(dashboard)/penzugy/tartozas-actions.ts

export interface DebtYear {
  year: number
  baseAmount: number       // az év éves díja
  paidAmount: number       // eddigi befizetés erre az évre
  owedAmount: number       // fizetendő = baseAmount - paidAmount
  hasFee: boolean          // rögzítve van-e az év díja
}

export async function calculateMemberDebt(
  memberId: number,
  congregationId: string,
): Promise<{
  horizonStart: number     // melyik évtől számol
  horizonReason: 'last-payment' | 'fallback-earliest-fee' | 'no-data'
  years: DebtYear[]
  totalOwed: number
}>
```

Logika (pszeudokód):
```typescript
const payments = await getPaidYears(memberId)  // DISTINCT fizetettev
const fees = await getAnnualFees(congregationId)  // [{year, eves_jarulek}]
const currentYear = new Date().getFullYear()

let horizonStart: number
let horizonReason: string
if (payments.length > 0) {
  horizonStart = Math.max(...payments) + 1
  horizonReason = 'last-payment'
} else if (fees.length > 0) {
  horizonStart = Math.min(...fees.map(f => f.year))
  horizonReason = 'fallback-earliest-fee'
} else {
  return { horizonStart: currentYear, horizonReason: 'no-data', years: [], totalOwed: 0 }
}

const years: DebtYear[] = []
for (let y = horizonStart; y <= currentYear; y++) {
  const fee = fees.find(f => f.year === y)
  if (!fee) continue
  const paidAmount = await getTotalPaidForYear(memberId, y)
  const owedAmount = Math.max(0, fee.eves_jarulek - paidAmount)
  if (owedAmount > 0) {
    years.push({ year: y, baseAmount: fee.eves_jarulek, paidAmount, owedAmount, hasFee: true })
  }
}

const totalOwed = years.reduce((s, y) => s + y.owedAmount, 0)
return { horizonStart, horizonReason, years, totalOwed }
```

---

## 6. UX változás — Éves előzmények tab eltűnése

A külső `<TabsList>` szerkezete:

**Előtte**:
```
Alapadatok | Pénzügy | Szervezet | Éves előzmények
```

**Utána**:
```
Alapadatok | Pénzügy | Szervezet
```

A "Éves előzmények" tab teljes tartalma a Pénzügy → Alapdíj al-tabra kerül, az "Évenkénti díjak" szekcióba.

---

## 7. Implementációs lépések

### Fázis 1 — Action-ök
- `deleteCongregationAnnualFee` hozzáadása
- `saveCongregationAnnualFee` egyszerűsítése (csak `year` + `eves_jarulek`)
- `calculateMemberDebt` hozzáadása (új fájl: `app/(dashboard)/penzugy/tartozas-actions.ts`)

### Fázis 2 — UI
- `CongregationDialogV2`:
  - Az "Éves előzmények" tab törlése
  - A Pénzügy → Alapdíj al-tabon új **"Évenkénti díjak"** Panel táblázattal
  - Soronkénti inline edit + delete gomb
  - "Hozzáadás" gomb az új évhez

### Fázis 3 — Tesztelés
- Új tag: nincs befizetés → fallback-szabály működik
- Régi tag: fizetett 2020-ig → horizont 2021-től
- Részleges fizetés: 2024 90 RON = 180 - 90 = 90 RON tartozás

**Becslés**: 1-2 munkanap.

---

## 8. Kérdések a user-hez jóváhagyáshoz

1. **Ha a tag sosem fizetett** — mettől számoljuk a tartozást?
   - (A) A tag csatlakozási évétől (ha ismert)
   - (B) A legkorábbi rögzített díj évétől ← **javaslatom**
   - (C) Az aktuális évtől (csak mostantól)
   - (D) Ne mutassa, amíg nincs első befizetés
   - (E) Gyülekezet-szintű beállítás: a lelkész ad meg egy "horizont-korlátot" (pl. 2020-nál régebbi nem számít)

2. **Részleges befizetés** (pl. 2024 csak 100/180 RON) — az az év beleszámít a tartozásba?
   - ✅ Igen (javaslatom) — a fennmaradó 80 RON tartozás
   - ❌ Nem — csak a teljes nem-fizetés számít

3. **Éves díj törlése**: ha a lelkész törli pl. a 2022-es évet, az összes 2022-re vonatkozó befizetés mi lesz?
   - Figyelmeztetéssel, de megmarad (a számítás `hasFee: false`-ra ugrik)
   - Csak akkor törölhető, ha nincs rá befizetés

4. **10 év default**: a lelkész lát 10 évet visszafelé. Ha régebbi kell, "További évek" gomb — hány évet dob be?
   - +5 év egyszerre (összesen 15, 20, 25)
   - vagy egyesével

5. **Aktuális év (pl. 2026)**: a `congregations.eves_jarulek` mezőben van, vagy **a `congregation_annual_fees`-ben** is szerepeljen?
   - Javaslatom: **párhuzamos** — a `congregations.eves_jarulek` marad (az aktív UI-mezőhöz), **és** a `congregation_annual_fees`-be is automatikusan tükröződik (egyszerűbb a számítás, mert egyetlen forrást használunk).

---

## 9. User válaszai (2026-04-21) + frissített logika

| # | Kérdés | User válasza |
|---|---|---|
| 1 | Sosem fizetett tag | ✅ **18 éves kortól számol**; a tartozásnál **az életkor is látszódjon** |
| 2 | Részleges befizetés | ✅ Igen, a maradék tartozás; **kedvezmény-ellenőrzés**: aki a feltételnek megfelelt, teljesen kifizetettnek számít |
| 3 | Éves díj törlése | nem érdekes — csak warning elég |
| 4 | Évek limit | **nincs** — 20-30 évet is engedjünk |
| 5 | Aktuális év | `congregations.eves_jarulek` marad, **jan. 1-én sárga banner** a dashboard-on |

### 9.1. Új tartozás-számítás (végleges)

```typescript
export interface DebtYear {
  year: number
  baseAmount: number          // az év egyházfenntartási díja
  customFeesSum: number       // a gyülekezeti egyéb díjak összege erre az évre (2026-04-21 új feature)
  paidAmount: number          // eddigi befizetés
  ageInThatYear: number       // tag életkora az adott évben
  discountApplied: boolean    // a kedvezmény feltétele alapján teljesen kifizetettnek számít
  owedAmount: number          // fizetendő
}

export interface MemberDebt {
  ageNow: number              // tag mostani életkora (UI-n a tartozás mellett)
  horizonStart: number | null // melyik évtől számolunk
  years: DebtYear[]           // csak azok az évek, amire tartozás van
  totalOwed: number
}

export async function calculateMemberDebt(memberId, congregationId): Promise<MemberDebt> {
  const member = await getMember(memberId)  // szuletesiev kell
  const currentYear = new Date().getFullYear()
  const ageNow = currentYear - member.szuletesiev

  // 18 év alatti: nincs tartozás
  if (ageNow < 18) {
    return { ageNow, horizonStart: null, years: [], totalOwed: 0 }
  }

  const payments = await getMemberPayments(memberId)     // érvényes befizetések
  const annualFees = await getAnnualFees(congregationId)
  const customFees = await getActiveCustomFees(congregationId)
  const discounts = await getDiscounts(congregationId)

  // Horizont-kezdet
  const lastPaidYear = payments.length > 0 ? Math.max(...payments.map(p => p.fizetettev)) : null
  const eighteenthBirthday = member.szuletesiev + 18
  const horizonStart = lastPaidYear !== null
    ? lastPaidYear + 1
    : eighteenthBirthday  // Sosem fizetett: 18. évtől

  // Évek
  const years: DebtYear[] = []
  for (let y = horizonStart; y <= currentYear; y++) {
    const fee = annualFees.find(f => f.year === y)
    if (!fee) continue  // nincs díj erre az évre → nincs tartozás

    const ageInThatYear = y - member.szuletesiev

    // Gyülekezet-specifikus díjak erre az évre + a tag életkorára
    const customFeesSum = customFees
      .filter(cf => cf.year_from <= y && (cf.year_to === null || cf.year_to >= y))
      .filter(cf => cf.kor_tol === null || ageInThatYear >= cf.kor_tol)
      .filter(cf => cf.kor_ig === null || ageInThatYear <= cf.kor_ig)
      .reduce((s, cf) => s + cf.amount, 0)

    const paidAmount = getPaidForYear(payments, y)

    // Kedvezmény-ellenőrzés
    const discountApplied = checkDiscountQualifies({
      year: y,
      ageInThatYear,
      paidAmount,
      paymentsForYear: payments.filter(p => p.fizetettev === y),
      discounts: discounts.filter(d => d.ev === y && d.aktiv),
      baseAmount: fee.eves_jarulek,
    })

    if (discountApplied) {
      // Feltételnek megfelelt → teljesen kifizetett
      if (customFeesSum > paidAmount) {
        // De a gyülekezet-egyéb díjak még tartoznak
        years.push({ year: y, baseAmount: fee.eves_jarulek, customFeesSum, paidAmount, ageInThatYear, discountApplied: true, owedAmount: customFeesSum - Math.max(0, paidAmount - fee.eves_jarulek) })
      }
      continue
    }

    const totalDue = fee.eves_jarulek + customFeesSum
    const owed = Math.max(0, totalDue - paidAmount)
    if (owed > 0) {
      years.push({ year: y, baseAmount: fee.eves_jarulek, customFeesSum, paidAmount, ageInThatYear, discountApplied: false, owedAmount: owed })
    }
  }

  return {
    ageNow,
    horizonStart,
    years,
    totalOwed: years.reduce((s, y) => s + y.owedAmount, 0),
  }
}

function checkDiscountQualifies(ctx): boolean {
  // Időszaki: ha a befizetés a határidőn belül történt ÉS elérte a kedvezményes összeget
  for (const d of ctx.discounts.filter(d => d.tipus === 'idoszak').sort((a, b) => a.sorrend - b.sorrend)) {
    const deadline = new Date(`${ctx.year}-${d.hatarid}`)
    const paidByDeadline = ctx.paymentsForYear
      .filter(p => new Date(p.datum) <= deadline)
      .reduce((s, p) => s + p.osszeg, 0)
    if (paidByDeadline >= d.kedv_osszeg) return true
  }
  // Kor-alapú: ha a tag életkora eléri a korhatárt ÉS a befizetés eléri a kedvezményes díjat
  for (const d of ctx.discounts.filter(d => d.tipus === 'kor')) {
    if (ctx.ageInThatYear >= d.kor_tol) {
      const discountedFee = ctx.baseAmount * (1 - d.szazalek / 100)
      if (ctx.paidAmount >= discountedFee) return true
    }
  }
  // Szociális: csak manuálisan
  return false
}
```

### 9.2. Januári sárga banner

Egy új komponens: `components/layout/current-year-fee-banner.tsx`. A dashboard-shell-en belül renderelődik, minden dashboard-oldalon. Ellenőrzi:
- `congregations.eves_jarulek` > 0?
- VAGY `congregation_annual_fees` tartalmaz sort az aktuális évre?

Ha egyik sem, megjelenik a banner:

```
┌───────────────────────────────────────────────────────────────┐
│ ⚠️ Új évet kezdtünk! Állítsd be a 2027-es egyházfenntartás    │
│    díját, hogy a tagok tartozásai helyesen számolódjanak.      │
│    [Beállítom most →] [Emlékeztess később]                     │
└───────────────────────────────────────────────────────────────┘
```

A "Beállítom most" gomb megnyitja a CongregationDialog-ot a Pénzügy → Alapdíj fülön.

A "Emlékeztess később" csak elrejti a bannert (localStorage egy ideig), de **január 31-ig** újra megjelenik (akár többször).

### 9.3. Tag-tartozás UI példa (DebtCard)

```
┌─ Szőcs Endre (38 éves) ──────────────────────────────────────┐
│                                                                │
│ Tartozás 2023-tól (utolsó fizetés: 2022):                     │
│                                                                │
│ ┌──────┬───────────┬─────────┬────────────┬─────────┐        │
│ │ Év   │ Díj (egyh.)│ Egyéb  │ Befizetés  │ Tartozás │        │
│ ├──────┼───────────┼─────────┼────────────┼─────────┤        │
│ │ 2023 │ 150 RON   │ +50    │ 0          │ 200 RON  │        │
│ │ 2024 │ 150 RON   │ +50    │ 0          │ 200 RON  │        │
│ │ 2025 │ 180 RON   │ +50    │ 100        │ 130 RON  │        │
│ │ 2026 │ 200 RON   │ +50    │ 0          │ 250 RON  │        │
│ └──────┴───────────┴─────────┴────────────┴─────────┘        │
│                                                                │
│ Összesen: 780 RON                                             │
│ [⇧ Utólagos pótlás wizard]                                    │
└────────────────────────────────────────────────────────────────┘
```

---

## 10. Implementációs fázisok (frissítve)

### Fázis 1 — Server action-ök
- `app/(dashboard)/penzugy/tartozas-actions.ts` → `calculateMemberDebt()`
- `saveCongregationAnnualFee` egyszerűsítése
- `deleteCongregationAnnualFee` (warning-gal)

### Fázis 2 — UI — Éves táblázat az Alapdíj al-tabon
- "Évenkénti díjak (visszamenőleg)" Panel
- Inline edit + delete
- Bármennyi év bevezethető

### Fázis 3 — UI — Éves előzmények tab törlése
- Külső TabsList-ből eltávolítva
- Tartalma beolvasztva

### Fázis 4 — UI — Januári sárga banner
- `CurrentYearFeeBanner` komponens
- Dashboard-shell integráció

### Fázis 5 — UI — Tag tartozás-megjelenítés
- DebtCard komponens a tag/család modalokhoz
- Életkor-címke
- Horizont magyarázat ("utolsó fizetés: 2022")

**Megbecsült idő**: 2-3 munkanap.

**A fázisok jóváhagyás után implementálhatók.**
