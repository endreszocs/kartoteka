# A-M7.3d5 — Befizetés-lista CSV/Excel export

**Dátum:** 2026-04-24
**Scope:** Excel-kompatibilis CSV export a befizetés-lista szűrt vagy teljes nézetéből
**Státusz:** ✅ kész — zero dependency, natívan Excel-olvasható
**Kapcsolódó:** A-M7.3d4 (szűrők)

---

## 1. Mit ad ma a lelkésznek?

A befizetés-lista fejlécében új **„Excel export"** gomb — egy kattintással letölthető az aktuális nézet (szűrt vagy teljes) CSV-ként. Excelbe nyitva azonnal olvasható magyar ékezetekkel.

**Fájlnév-konvenció:**
- `befizetesek-2026.csv` — teljes éves lista
- `befizetesek-2026-szurt.csv` — ha szűrő aktív

**Oszlopok:**

1. Dátum
2. Iratszám
3. Típus (Készpénz / Banki)
4. Tag
5. Kategória
6. Család-szintű (igen / nem)
7. Összeg (RON)
8. Fizetett év
9. Sztornó (igen / nem)
10. Sztornó indoklás
11. Megjegyzés

### Mire használhatja a lelkész?

- **Éves beszámoló**: Excelben összesítés, pivot-tábla, diagram
- **Archiválás**: a gyülekezet pénzügyi dokumentumtárába
- **Egyházmegyei riport**: egy másik fél számára átadni a lista
- **Könyvelői átadás**: a könyvelőnek egy „átadott" anyag

---

## 2. Mi változott?

### 2.1 Új helper — `befizetes-csv.ts`

**Fájl:** `apps/desktop/src/lib/export/befizetes-csv.ts` (~130 sor)

Három exportált függvény:

```ts
buildBefizetesCsv(rows: BefizetesListRow[]): string
downloadCsv(csv: string, filename: string): void
buildBefizetesCsvFilename(year: number, filtersActive: boolean): string
```

**Tervezési döntések:**

1. **CSV, nem XLSX** — zero dependency, natívan Excel-olvasható UTF-8 BOM-mal. Az XLSX a későbbi A-M10 `@kartoteka/excel`-ben jön, amikor a teljes fájl-kezelés egységes lesz.

2. **Pontosvessző-elválasztás** — EU Excel konvenció. A magyar locale-nak ez a default, nem kell „hely-szerinti importálás" varázslót nyitni.

3. **UTF-8 BOM** (`\uFEFF`) — enélkül az Excel a magyar ékezeteket „Ã¡"-ként olvassa. A BOM apró, de kritikus a user-élményben.

4. **CRLF sorvég** (`\r\n`) — Excel-kompat (Windows-konvenció).

5. **RFC 4180-kompat escape** — ha az érték `"`, `;`, `,`, `\n`, `\r` karaktert tartalmaz, idézőjelbe csomagolva; belső `"` → `""`.

6. **Browser download API** (`Blob` + `URL.createObjectURL` + `<a download>`) — a Tauri WebView támogatja, nincs szükség új Tauri-pluginra. A későbbi `@kartoteka/storage` réteg szebb Tauri-dialog-ot ad majd.

7. **1000ms-os `URL.revokeObjectURL` késleltetés** — a browser-nek idő kell a download elindításához; azonnali revoke-kal esetenként megszakad.

### 2.2 Export-gomb a `RecentIncomeSection`-ben

A „Frissítés" gomb mellé került egy „Excel export" gomb:

```tsx
<Button
  onClick={() => {
    const csv = buildBefizetesCsv(rows)
    const filename = buildBefizetesCsvFilename(year, filtersActive)
    downloadCsv(csv, filename)
  }}
  disabled={loading || rows.length === 0}
  title="CSV export (Excel-kompatibilis, UTF-8 BOM)"
>
  <Download className="mr-1.5 size-4" />
  Excel export
</Button>
```

- Disabled ha loading vagy üres lista
- Tooltip a tech-hátteret magyarázza
- A `rows` az aktuálisan szűrt listát tartalmazza — a user azt kapja, amit lát

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ **37 fájl**, 0 tiltott |

**Nem tesztelt:**
- E2E smoke: letölt → megnyit Excelben → magyar ékezetek helyesek (a BOM miatt majdnem biztos)
- 500 sornál nagyobb lista export-teljesítmény — a reduce + Blob triviális, nem gond

---

## 4. Mi marad hátra

- **XLSX export** (natív Excel-formátum, formázással) — az A-M10 `@kartoteka/excel` csomagjának része lesz
- **Dátumintervallum-export** (pl. „márciustól áprilisig") — a szűrők kiegészítésekor jön
- **Bank-kivonat-formátum** — egy specifikus CSV, amit a könyvelő bank-import-be tölthet

---

## 5. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — rövid user-facing bejegyzés
3. **Obsidian** — nem szükséges, inkrementális polish
