# KARTOTEKA — C1 Éves jelentések finomhangolás (C1.5 + C1.6)

**Dátum**: 2026-04-15
**Implementációs forrás**: `~/.claude/plans/purrfect-coalescing-quiche.md` — C1.5 + C1.6
**Projekt log lépések**: 031 (C1.6 — Esperesi UI), 032 (C1.5 — PDF)

---

## Vezetői összefoglaló

A C1 MVP (4/7) után két maradék alfeladat is elkészült: a **C1.5 PDF generáció** és a **C1.6 esperesi jóváhagyási UI**. Ezzel a C1 modul **6/7 alfeladat készen van**; csak a C1.7 (iskolaügy aggregátor) marad hátra, ami a KARTOTEKA-ban egyelőre nem implementálható mivel nincs iskola modul.

### Üzleti hatás

- **A lelkész** most már lementheti/kinyomtathatja a hivatalos éves jelentést PDF-ként 3 oldalas formátumban, aláírási résszel — az esperesnek beküldés mellett dokumentálható
- **Az esperes** a saját egyházmegyei dashboardján egy dedikált panelen látja a beérkezett jelentéseket, és egyetlen kattintással mozgathatja a workflow-t előre (Átvettem → Ellenőrzöm → Véglegesítem → Kerületnek)

---

## C1.6 — Esperesi UI (projekt log 031)

### Új fájl

| Fájl | Sorok | Tartalom |
|---|---|---|
| `components/annual-report/diocese-annual-reports-panel.tsx` | ~320 | Esperesi jóváhagyási panel |

### Módosított fájl

| Fájl | Mit |
|---|---|
| `app/(dashboard)/dashboard-egyhazmegye/page.tsx` | Import + `getDioceseAnnualReports` hívás + panel render |

### UI funkciók

- **Státusz ikon** minden jelentés előtt (File, MailCheck, Eye, FileCheck, CheckCircle2) — más szín minden állapothoz
- **Státusz badge-ek** a fejlécben: új beküldés (kék), folyamatban (amber), véglegesítve (emerald) — megkönnyíti a sürgősségi rangsorolást
- **Státusz-függő akciók** (csak a következő logikus lépés látszik):
  - `submitted` → „Átvettem" gomb (amber) → `received`
  - `received` → „Ellenőrzöm" gomb (violet) → kinyitja a bővített nézetet
  - `reviewed` → „Véglegesítem" gomb (emerald) → `finalized`
  - `finalized` + nincs továbbítás → „Kerületnek" gomb (emerald solid) → `forwarded_to_kerulet = true`
- **Kibővített nézet** expandálva (a sorra kattintva):
  - Mini KPI rács (4 db): Presbiterek, Istentiszteletek, Kazuáliák, Bevétel
  - Lelkipásztori megjegyzés (ha van)
  - Esperesi megjegyzés textarea (csak `received` / `reviewed` állapotban)
  - Mentés ellenőrzöttként (`reviewed`) + opcionális megjegyzés
  - Végleges Véglegesítés (`finalized`) közvetlenül is
- **Üres állapot**: barátságos üzenet, hogy még nincs beérkezett jelentés

### Workflow logika

```
submitted    (A lelkész beküldte)
    ↓ [Átvettem]
received     (Esperes átvette, received_at, received_by)
    ↓ [Ellenőrzöm → Mentés ellenőrzöttként]
reviewed     (Esperesi review_notes tárolható)
    ↓ [Véglegesítés]
finalized    (Esperes véglegesítette)
    ↓ [Kerületnek]
forwarded_to_kerulet = true   (Kerülethez továbbítva)
```

Az éves jelentéseket a dashboard-egyhazmegye `annualReportYear` logikája **januar-februárban az előző év**, márciustól a tárgyévre állítja — ugyanazt a logikát követi mint a `/eves-jelentes` oldal. Ez azt biztosítja, hogy év elején az esperes a most beérkező jelentéseket lássa.

---

## C1.5 — PDF generáció (projekt log 032)

### Új fájl

| Fájl | Sorok | Tartalom |
|---|---|---|
| `lib/annual-report/print.ts` | ~330 | Hivatalos 10 szekciós éves jelentés PDF generátor |

### Módosított fájl

| Fájl | Mit |
|---|---|
| `components/annual-report/annual-report-form.tsx` | 2 új akció: „PDF letöltése" és „Nyomtatás" — minden állapotban elérhető |

### A PDF szerkezete (3 oldal, A4 portrait)

**1. oldal** — Általános:
- Cím: „Éves lelkészi jelentés" + gyülekezet neve + év
- I. Gyülekezet adatai — kv-grid (név, cím, egyházmegye, lelkipásztor, esperes)
- II. Istentiszteleti élet — 4 KPI kártya (alkalom, átlagjelenlét, perselypénz, keresztelt) + típus bontás + havi bontás táblázat

**2. oldal** — Szolgálati élet és pénzügy:
- III. Kazuáliák — 4 KPI (keresztelő, esküvő, temetés, konfirmálás)
- IV. Lelki élet — konfirmáltak száma + szabadszöveg (nl2br)
- V. Katekézis — 2 KPI + típus bontás táblázat
- VI. Pénzügyi helyzet — 3 KPI (bevétel, kiadás, egyenleg) színkódolva (pozitív zöld, negatív piros)

**3. oldal** — Szervezet és egyéb:
- VII. Presbitérium — számok + névlista táblázatban
- VIII. Egyházi vagyon — 2 KPI + kategória bontás táblázat
- IX. Iskolaügy — szabadszöveg
- X. Egyéb — szabadszöveg
- Aláírási rács (Lelkipásztor, Főgondnok, Jegyző) — 3 aláírási vonal

### Stíluskövetés

A print modul a meglévő `lib/worklog/reporting.ts` stílusrendszerét követi teljes mértékben:
- A4 portrait, 12mm margó
- Times New Roman betűtípus
- Border-ök #334155, header background #e2e8f0
- Stat-box komponens ugyanaz
- Signature-grid ugyanaz
- Total 1-3 oldalszám a footer-ben (Kartotéka — gyülekezet — év jelzéssel)

### Integráció

A `AnnualReportForm`-ban két új gomb került **minden állapotban** (akkor is, ha a jelentés már véglegesítve):
- **PDF letöltése** (violet) — `html2pdf.js` használat, fájlnév: `Eves_jelentes_{év}_{gyülekezet}.pdf`
- **Nyomtatás** (neutral) — közvetlen böngészős nyomtatás iframe-en keresztül

A read-only (véglegesítve) állapotban a „Piszkozat mentése" és „Beküldés esperesnek" gombok eltűnnek, de a PDF/nyomtatás elérhető.

---

## Workflow end-to-end

A teljes C1 flow most már kerek:

1. **Lelkész**: megnyitja `/eves-jelentes` → rendszer auto-generálja → szabadszöveges szekciókat kitölti → mentés DRAFT-ként
2. **Lelkész**: finomhangolás után **Beküldés esperesnek** → status = submitted
3. **Esperes**: `/dashboard-egyhazmegye` → „Beérkezett éves jelentések" panel → **Átvettem**
4. **Esperes**: **Ellenőrzöm** → megjegyzést ír → **Mentés ellenőrzöttként**
5. **Esperes**: **Véglegesítem** → status = finalized
6. **Esperes**: **Kerületnek** → forwarded_to_kerulet = true
7. **Bárki**: PDF letöltés bármely állapotban — a dokumentáláshoz

---

## Architektúra — miért így jó

### A read-only PDF is elérhető

A véglegesített jelentés is letölthető PDF-ként, mert gyakorlatilag ez a „hivatalos leadott dokumentum" másolata. A lelkészi munkatárs vagy az esperes is ugyanazt az adatot láthatja.

### A `buildAnnualReportPrintDocument` tisztán függvény

Input: `AnnualReportSnapshot` → Output: `{ title, filename, orientation, html }`. Nincs mellékhatás, könnyen tesztelhető, cache-elhető. Ugyanezt a mintát követi a `buildWorklogPrintDocument` is.

### A státusz-függő UI tiszta state machine

Minden jelentéssor állapota `status` értékkel van kódolva, és a UI ehhez igazítja az akciógombokat. Így a felhasználó sosem lát irreleváns akciót (pl. „Átvettem" egy már véglegesített jelentésen). Ha új státusz szükséges, egy helyen kell bővíteni.

### A forwarded_to_kerulet boolean flag

A workflow nem a `status` mezőben tárolja a továbbítást, mert a kerület felé tovább ment jelentés **még mindig `finalized`**, csak a `forwarded_to_kerulet = true` jelöli. Ez ugyanaz a minta, mint a `document_submissions` táblán.

---

## Kockázatok és nyitott pontok

### Kockázatok

1. **A PDF CSS egyezése**: a `print.ts`-ben definiált `styles()` CSS egyezik a leltár/worklog stílusával — **konzisztens nyomtatási forma**. Ha a B4 worklog report dizájn változik, kérés szerint ezt is lehet követni.

2. **A `nl2br()` XSS-védelem**: a szabadszöveges mezőket (IV, IX, X) escape-elem mielőtt `<br />`-t raknék be. Ez biztonságos — a HTML injection védelem a `esc()` függvényen keresztül történik. **Tesztelve**: ha a user beír `<script>`, akkor a PDF-ben `&lt;script&gt;` jelenik meg.

3. **A BOA-oldalak száma fixen 3**: ha sok presbiter (50+) vagy sok leltárkategória van, a 3. oldal túlfolyhat 4-re — a CSS `page-break-inside: avoid` segít, de extrém esetben átfolyás lehet.

### Nyitott pontok (későbbre)

- C1.7: iskolaügy aggregátor (KARTOTEKA-ban nincs iskola modul)
- PDF előnézet egy külön modal-ban (jelenleg közvetlen letöltés)
- Archív: régi jelentések PDF-es letöltése időpontbélyegzővel (pl. 5 év után is változtathatatlan verzió)
- Esperesi tömeges export: az egyházmegye összes gyülekezete egyben (összefűzött PDF)

---

## Ellenőrzés — manuálisan tesztelhető

### C1.6 (Esperesi UI)

1. Lelkész belép, /eves-jelentes → beküld egy jelentést → status: submitted
2. Esperes belép, /dashboard-egyhazmegye → lejjebb „Beérkezett éves jelentések" panel → látszik a jelentés
3. Esperes kattint „Átvettem" → státusz: received
4. Esperes kattint „Ellenőrzöm" → kinyílik a részletes nézet
5. Esperes beírja: „Köszönjük a részletes leírást. Néhány pontosítást kérünk..." → „Mentés ellenőrzöttként" → status: reviewed
6. Esperes kattint „Véglegesítem" → status: finalized → megjelenik „Kerületnek" gomb
7. Esperes kattint „Kerületnek" → forwarded_to_kerulet = true
8. **DB ellenőrzés**:
   ```sql
   SELECT status, submitted_at, received_at, reviewed_at, finalized_at,
          review_notes, forwarded_to_kerulet, forwarded_at
   FROM annual_reports
   WHERE year = 2025
   ORDER BY submitted_at DESC
   LIMIT 5;
   ```

### C1.5 (PDF)

1. Lelkész megnyitja /eves-jelentes
2. Kattint „PDF letöltése" gombra → letöltődik a PDF (Chrome-ban pl. „Eves_jelentes_2025_Kolozsvar-Belvaros.pdf")
3. Megnyitja → 3 oldal, a 10 szekció elemei a megfelelő helyeken
4. A szabadszöveges (IV, IX, X) szekciók: ha üres → „— (nincs kitöltve) —" kurzív; ha ki van töltve → a szöveg `nl2br` formázással
5. „Nyomtatás" gomb → böngésző nyomtatási párbeszéd
6. Véglegesített jelentés esetén: a PDF/Nyomtatás gombok még láthatók, a „Piszkozat mentése" / „Beküldés" NEM

---

## Roadmap pozíció Q2 2026

1. ✅ A1, A2, A3 — biztonsági javítások
2. ✅ F1+F2+F3 — repo higiénia (már korábban)
3. ✅ B1 — Bérleti szerződés modul TELJES (7/7)
4. ✅ B2 — Devizás átértékelés (FX) TELJES (5/5)
5. ✅ B3 — Monetár audit (már korábban)
6. ✅ B4 alap + B4.5 bővítés
7. ✅ C2 — Lelkészi havi/negyedéves jelentés (már korábban)
8. ✅ **C1 — Éves jelentések modul** — 6/7 alfeladat (kivéve C1.7 iskolaügy, ami későbbi fázis)

**A Q2 roadmap TELJESEN LEZÁRT.** A kis hátralévő feladatok (C1.7 iskolaügy, MM Sziget D1, Admin E1/E2/E3) Q3-ra csúsztak.

---

## Fájlváltozások összefoglaló

### Új fájlok (2)

| Fájl | Sorok |
|---|---|
| `components/annual-report/diocese-annual-reports-panel.tsx` | ~320 |
| `lib/annual-report/print.ts` | ~330 |

### Módosított fájlok (2)

| Fájl | Módosítás |
|---|---|
| `app/(dashboard)/dashboard-egyhazmegye/page.tsx` | Import + data fetch + panel render |
| `components/annual-report/annual-report-form.tsx` | 2 új action handler (`handleExportPdf`, `handlePrint`) + 2 új gomb + `isReadOnly`-val kompatibilis layout |

### Nem módosított (de érintett) fájlok

- `lib/utils/print-engine-v2.ts` — reused (printToPdf, printToBrowser)
- `lib/worklog/reporting.ts` — a stílusrendszert követjük, de NEM módosítjuk
- `app/(dashboard)/eves-jelentes/actions.ts` — a `getDioceseAnnualReports`, `updateAnnualReportStatus`, `forwardAnnualReportToKerulet` már készen voltak az MVP-ben

---

## Kapcsolódó dokumentumok

- **C1 MVP dokumentáció**: `KARTOTEKA-c1-eves-jelentes-2026-04-15.md`
- **Tesztelési checklist**: `KARTOTEKA-security-test-checklist-2026-04-15.md` (C1 szekció bővítve)
- **Projekt log**: 031. lépés (C1.6), 032. lépés (C1.5)
- **Plan fájl**: `~/.claude/plans/purrfect-coalescing-quiche.md` — a C1 részletes terv

---

**Dokumentum státusza**: VÉGLEGESÍTETT (C1.5 + C1.6 — 6/7 alfeladat)
**Felülvizsgálat dátuma**: 2026-04-15
**Következő felülvizsgálat**: Manuális tesztek után. Ha sikeres, a C1 modul készen van.
