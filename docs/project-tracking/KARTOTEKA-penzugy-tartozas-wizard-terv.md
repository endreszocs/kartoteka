# Tervdokumentum — Pénzügyi wizard: utólagos egyházfenntartás pótlás

**Státusz**: tervezés (2026-04-21)
**Kapcsolódó user-kérés**: "A pénzügyi résznél a tartozások és az eddigi évek egyházfenntartásos részét wizardól egy gombbal lehessen elindítani. Ezt is tervezd meg alaposan!"

---

## 1. Probléma-megfogalmazás

**Forgatókönyv**: Egy egyháztag évekig nem fizetett, és most egyszerre kifizeti például az elmúlt 4 év egyházfenntartását. A lelkész jelenleg **külön-külön** kell 4 befizetés-rekordot rögzítenie:
- 1 befizetés 2022-re
- 1 befizetés 2023-ra
- 1 befizetés 2024-re
- 1 befizetés 2025-re

Minden rekordhoz nyugta, iratszám, kedvezmény-számítás, dátum. **~2-3 perc / év, kézzel**. Hiba-hajlamú (pl. rossz kedvezmény, rossz év).

**Cél**: egy **wizard** — 1 gombnyomás, néhány lépésben minden pótlás egyben rögzítve, konzisztensen.

---

## 2. Elhelyezés a UI-ban

A gomb **három helyen** jelenjen meg (ugyanaz a wizard, különböző kontextusban):

| Kontextus | Hol | Gomb |
|---|---|---|
| Tag detail modal | Pénzügyi szekció | "**⇧ Tartozás pótlása**" (ha van > 0 RON tartozás) |
| Család detail modal | Pénzügyi szekció | "**⇧ Családi tartozás pótlása**" |
| Pénzügy dashboard (Tag tartozások lista) | Sor-szintű művelet | "⇧" ikon gomb a tagnál |

**Nem mindenkinél látszik**: ha nincs tartozása, a gomb rejtett.

---

## 3. A wizard lépései

### Bemutatkozó (Step 0)

```
┌─── Utólagos egyházfenntartás pótlás ──────────────────┐
│                                                        │
│  Szőcs Endre — jelenlegi tartozása:                   │
│                                                        │
│  ┌──────┬─────────┬────────┬──────┬────────────┐     │
│  │ Év   │ Éves díj│ Kedv.  │ Fiz. │ Állapot     │     │
│  ├──────┼─────────┼────────┼──────┼────────────┤     │
│  │ 2022 │ 100 RON │   0    │ 100  │ ❌ Tartozik │     │
│  │ 2023 │ 120 RON │   0    │ 120  │ ❌ Tartozik │     │
│  │ 2024 │ 150 RON │  20    │ 130  │ ❌ Tartozik │     │
│  │ 2025 │ 150 RON │  20    │ 130  │ ❌ Tartozik │     │
│  └──────┴─────────┴────────┴──────┴────────────┘     │
│                                                        │
│  Összesen: 480 RON                                    │
│                                                        │
│  [Tovább]                                             │
└────────────────────────────────────────────────────────┘
```

### Évek kiválasztása (Step 1)

Default: minden évre `☑`. A lelkész kivesz bizonyos éveket, ha csak részletet pótol.

```
┌─── Milyen évekre pótolsz? ────────────────────────────┐
│                                                        │
│  ☑ 2022 — 100 RON                                     │
│  ☑ 2023 — 120 RON                                     │
│  ☑ 2024 — 130 RON  (a 150 díj - 20 kedv.)            │
│  ☑ 2025 — 130 RON  (a 150 díj - 20 kedv.)            │
│                                                        │
│  Kiválasztott: 4 év, összesen 480 RON                 │
│                                                        │
│  [Vissza]  [Tovább]                                   │
└────────────────────────────────────────────────────────┘
```

### Befizetés adatai (Step 2)

```
┌─── Befizetés adatai ──────────────────────────────────┐
│                                                        │
│  Dátum: [2026-04-21]                                  │
│  Bankszámla: [BCR (default) ▼]                        │
│  Megjegyzés: [_________________]                      │
│                                                        │
│  ℹ️ A rendszer 4 nyugtát generál automatikusan,       │
│    minden évre egyet. A következő iratszám: K-2026/42 │
│                                                        │
│  [Vissza]  [Tovább]                                   │
└────────────────────────────────────────────────────────┘
```

### Előnézet + megerősítés (Step 3)

```
┌─── Ellenőrzés előtt a mentésre ───────────────────────┐
│                                                        │
│  ┌──────┬─────────┬──────────┬──────┬──────────────┐ │
│  │ Év   │ Eredeti │ Kedv.    │ Fiz. │ Nyugta       │ │
│  ├──────┼─────────┼──────────┼──────┼──────────────┤ │
│  │ 2022 │ 100     │ — (nincs)│ 100  │ K-2026/42    │ │
│  │ 2023 │ 120     │ —        │ 120  │ K-2026/43    │ │
│  │ 2024 │ 150     │ 20 (idősz)│ 130 │ K-2026/44    │ │
│  │ 2025 │ 150     │ 20 (idősz)│ 130 │ K-2026/45    │ │
│  └──────┴─────────┴──────────┴──────┴──────────────┘ │
│                                                        │
│  Összesen: 480 RON, 4 nyugta                          │
│  Dátum: 2026-04-21 · Bank: BCR                        │
│                                                        │
│  [Vissza]  [💾 Rögzítés]                              │
└────────────────────────────────────────────────────────┘
```

### Siker + összegzés (Step 4)

```
┌─── Kész! ─────────────────────────────────────────────┐
│                                                        │
│  ✅ 4 év pótlás rögzítve Szőcs Endre számára.         │
│                                                        │
│  Nyugták: K-2026/42-45 (PDF generálva)                │
│  Teljes összeg: 480 RON → BCR bankszámla              │
│                                                        │
│  [Nyugtatömb letöltése PDF-ben]                       │
│  [Bezárás]                                            │
└────────────────────────────────────────────────────────┘
```

---

## 4. Technikai terv

### 4.1. Tartozás-számítás (már megvan a rendszerben)

A meglévő `congregation_annual_fees` tábla + a `tartozas_szamitas_mod` kapcsoló (akkori / aktuális) adja az év-szintű díjat.

Az **utólagos pótlásnál** fontos döntés: **mindig az akkori díjjal** dolgozzon-e a wizard, vagy figyelje a `tartozas_szamitas_mod`-ot?

**Javaslat**: mindig az **akkori díjjal** — mert a lelkész éppen az elmúlt éveket pótolja. Ha a gyülekezet szabálya az "aktuális" mód, akkor **külön tájékoztatás** a wizard elején:

> "A gyülekezet beállítása: aktuális díj. A pótlásnál a **visszamenőleges akkori díjat** használjuk. Ha ez nem helyes, a wizard előtt változtasd meg a beállítást."

### 4.2. Kedvezmények alkalmazása

A `congregation_fee_discounts` tábla évre szűrt sorait használjuk. Minden év-oszlopnál külön-külön alkalmazzuk:

- **idoszak** típus: csak akkor, ha a befizetés dátuma a határidőn belül van. **Utólagos pótlásnál** ez általában NEM teljesül (a mai dátum 2026, a határidő 2024-ra volt). **Javaslat**: a wizard **ne alkalmazza** automatikusan az időszaki kedvezményt, csak ha a lelkész **manuálisan bejelöli** egy sornál ("alkalmazd").
- **kor** típus: ha a tag életkora az adott évben >= korhatár, automatikusan.
- **jovedelem** típus: csak manuális kijelöléssel (presbitériumi döntésnek kell lennie).

**UI**: az év-sornál egy "kedvezmény" oszlopban látszik a javasolt kedvezmény, és egy "⚙️" gombbal a lelkész felülbírálja.

### 4.3. Iratszám-generálás

A meglévő iratszám-logika használva. Minden év egy új `befizetes` rekord, külön iratszámmal (K-2026/42, K-2026/43, stb.).

**Tranzakció**: vagy mind a N rekord befejeződik, vagy semmi. Ha egy közben hiba van, rollback.

### 4.4. Adatmodell — új tábla vagy meglévő?

A `befizetes` táblához **nem kell új oszlop**. Minden év egy sort kap, a `fizetettev` oszlop tárolja az évet. Ez már most is így működik.

**Opciós kiegészítés** (csak ha szükséges): egy `batch_id` oszlop (uuid), ami összefogja a wizard-alapú N rekordot, hogy később együtt meg lehessen jeleníteni ("ebben a pótlásban 4 év rögzítve").

### 4.5. Stornózás

Ha a lelkész utólag hibásnak találja a pótlást (pl. tévesen rögzítette), akkor **egyenként** vagy **batch-esen** tudja stornózni? A `batch_id` oszlop bevezetésével a **batch storno** lehetséges: 1 kattintás, mind a N rekord stornozva.

**Javaslat**: MVP-ben egyenként storno. A batch_id bevezetése később, ha igény van rá.

### 4.6. Server action struktúra

```typescript
// app/(dashboard)/penzugy/tartozas-wizard-actions.ts

export async function calculateMemberDebt(memberId: number): Promise<{
  years: Array<{
    year: number
    baseAmount: number         // az év díja
    discountAmount: number     // alkalmazható kedvezmény (automatikus)
    finalAmount: number        // fizetendő
    discountLabel: string      // "idoszak", "kor", "jovedelem" vagy null
  }>
  totalDebt: number
}>

export async function bulkPayMember(
  memberId: number,
  payments: Array<{
    year: number
    amount: number
    discountAmount: number
    bankAccountId: number
    datum: string
    megjegyzes: string
  }>
): Promise<{ receipts: string[]; error?: string }>
```

---

## 5. UX szempontok

### Hangvétel

A wizard neve (hivatalosan): **"Utólagos egyházfenntartás pótlás"** vagy röviden: **"Tartozás pótlása"**.

A wizardben nyugodt, pásztori hangnem — a lelkész vegye tudomásul, hogy a tag most fizetett, nem kell sietnie:

- ~~"Fizesse meg a teljes tartozást"~~ (kemény)
- ✅ "Hányadik évre is emlékezik meg a testvérünk ma?" (pásztori)

### Megerősítés

A mentés előtti **Step 3** (Előnézet) kritikus — a lelkész **lássa** pontosan, mi fog történni. Lebontva, évekre, összeggel, nyugtaszámmal.

A mentés után **ne lehessen visszacsinálni** egyszerűen — az egyes rekordok stornozhatók, de egyszerre nem. Ezért a megerősítő gomb legyen **"💾 Rögzítés"** és ne "Tovább" / "OK".

### Hiba-esetek

- **Nincs bankszámla**: a wizard blokkolva — a lelkész először állítson be bankszámlát.
- **Nincs tartozás**: a gomb sem látszik (nincs mit pótolni).
- **A gyülekezet alapdíja nincs beállítva**: a wizard blokkolva — figyelmeztetés: "Először állítsd be az éves díjat a Gyülekezetünk adatai → Pénzügy → Alapdíj fülön."

---

## 6. Implementáció lépéseinek javaslata

Ha a terv jóváhagyva, **4 fázisban**:

### Fázis 1 — Server action-ök
- `calculateMemberDebt()` — a tartozás év-szintű számítása a `congregation_annual_fees` + `congregation_fee_discounts` alapján
- `bulkPayMember()` — tranzakcióval N db `befizetes` rekord rögzítése

### Fázis 2 — Wizard UI (komponens)
- `components/modals/tartozas-wizard.tsx` — 5 lépéses wizard a fentebbi mock-up alapján
- Framer Motion animáció a lépések között
- Reuszable a tag / család / pénzügy dashboard 3 kontextusra

### Fázis 3 — Beillesztés a 3 kontextusba
- Tag modal: gomb + wizard megnyitás
- Család modal: gomb + wizard megnyitás  
- Pénzügy dashboard (tartozás-lista): sor-szintű gomb

### Fázis 4 — Tesztelés + finomítás
- Éles tag adatokkal tesztelés
- Nyugta-PDF generálás ellenőrzés
- UX finomítás (a lelkész visszajelzése alapján)

**Becslés**: 2-3 munkanap.

---

## 7. Kérdések a user-hez — jóváhagyáshoz

1. **Az utólagos pótlásnál** a díj: **akkori** (az év saját díja) vagy **aktuális** (mai) legyen alapértelmezett? Lehet-e váltás a wizardben?
2. **Kedvezmény**: az időszaki kedvezmény (pl. "július 1-ig") utólagos pótlásnál **automatikusan** alkalmazódjon, vagy a lelkész **manuálisan** kapcsolja be?
3. **Család-szint**: ha egy család tartozik, a wizard **egyszerre az összes családtagra** rögzítse, vagy csak a családfőre?
4. **Nyugtázás**: egy évhez egy nyugta, vagy az egész pótlás egy nyugta több évről?
5. **Batch_id oszlop**: most vezessük be (MVP+) vagy várjunk?

**A jóváhagyás után implementálom**.
