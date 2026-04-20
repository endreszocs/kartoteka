# Tervdokumentum — A két tartozás-rendszer egyesítése

**Státusz**: tervezés (2026-04-21)
**Felfedezés**: miközben a F5.1 fázisban be akartam integrálni a `calculateMemberDebt()` függvényt a Tagnyilvántartás modal „Hátralék" tab-jába, kiderült: **két párhuzamos tartozás-rendszer** él a kódban.

---

## 1. A két rendszer

### Rendszer A — Régi (`bealitas` tábla alapú)

- **Tábla**: `public.bealitas`
- **Forma**: egy sor per év (az `id` a YYYY év string)
- **Mezők**: sok (intezmenyneve, lelkesz, logo, isszemelyibefizetes, felmentes70felul, stb.) + `eves_jarulek`, `jarulek_kedvezmenyes`, `jarulek_hatarid`
- **Használja**: `app/(dashboard)/tagnyilvantartas/actions.ts` → `getMemberDetails()` → `computeJarulekForMemberYear()`
- **Megjelenés**: MemberDetailsDialogV2 „Hátralék" tab
- **Számol**: évenkénti díj, kedvezmények, felmentések (exemptions), 70+ felettiek, stb.

### Rendszer B — Új (`congregation_annual_fees` tábla alapú)

- **Tábla**: `public.congregation_annual_fees`
- **Forma**: egy sor per (congregation_id, year)
- **Mezők**: tiszta (year + eves_jarulek, + opcionális jarulek_kedvezmenyes/hatarid)
- **Használja**: 
  - `AnnualFeesPanel` a CongregationDialogV2-ben (inline-edit)
  - `calculateMemberDebt()` a `penzugy/tartozas-actions.ts`-ben
- **Megjelenés**: most még **sehol a UI-ban** (a calculateMemberDebt eredménye)
- **Számol**: 18 évtől, kedvezmény-ellenőrzés, custom_fees (gyülekezet-specifikus díjak)

---

## 2. A probléma

Ha a lelkész az **új** `AnnualFeesPanel`-ben módosítja pl. a 2025-ös éves díjat, az a `congregation_annual_fees`-be kerül — **de** a MemberDetailsDialogV2 Hátralék tab-ja a `bealitas`-ból olvas. **Nincs szinkron**.

Ugyanakkor a régi `bealitas` egy soka-mezős konfigurációs tábla a `congregations` helyett (ott van a logo, lelkesz, intezmenyneve is), nem csak az éves díj. Nem törölhető egyszerűen.

---

## 3. A javasolt megoldás

### 3.A — Rövid távon: bidirekcionális sync

A `saveAnnualFee()` (tartozas-actions.ts) mentsen **mindkét táblába** (upsert):
- `congregation_annual_fees` — a fő
- `bealitas` — a régi, a 4 pénzügyi mezőre

A `deleteAnnualFee()` ugyanígy törölje mindkét helyről (vagy csak a bealitas pénzügyi mezőket nullázza).

**Előny**: a régi UI (MemberDetailsDialog Hátralék) továbbra is működik.
**Hátrány**: kódduplikáció, két helyen tárolás.

### 3.B — Közép távon: refactor

A `computeJarulekForMemberYear()` átírása `congregation_annual_fees`-re. Plus a logikát **gazdagítani** a `calculateMemberDebt`-ből:
- 18 évtől szabály
- Horizont-kezdet az utolsó fizetésből
- `congregation_custom_fees` beszámítás

Aztán a `bealitas` pénzügyi mezői **elhagyhatók** — az `eves_jarulek` stb. csak `congregation_annual_fees`-ben marad. A `bealitas` megmarad a nem-pénzügyi mezőkkel (intezmenyneve, logo, lelkesz).

**Előny**: tiszta, egyetlen forrás.
**Hátrány**: nagy refactor — minden meglévő tartozás-kártyát át kell alakítani.

### 3.C — Hosszú távon: a bealitas teljes elhagyása

A `bealitas` többi mezőjét fokozatosan a `congregations` táblába kell migrálni (sok már ott van: `adoszam`, `bank`, `iban`, `eves_jarulek`, stb.). A `bealitas` tábla törölhető.

---

## 4. Javaslat — melyiket csináljuk?

**Most (rövid távon)**: Semmit — a jelenlegi funkciók egymástól függetlenül működnek:
- Az `AnnualFeesPanel` a Gyülekezet-modalon kezeli az **új típusú** díj-rögzítést (akár 20 évre visszamenőleg, kedvezmény nélkül)
- A `MemberDetailsDialog` Hátralék tab-ja a **régi** rendszer szerint számol (amihez a lelkész a `bealitas`-t kezelte — most már a UI erre nincs)

**Mielőtt új feature-t teszünk rá**: döntsük el, merre megyünk.

### Melyik tartozás-számítás a „valódi" MVP?

A user a tervdokumentumban (KARTOTEKA-eves-egyhazfenntartas-tabla-terv.md) jóváhagyta a **B** rendszert. A **refactor B-re** tehát a cél — de csak fokozatosan.

### Fázis-terv a refactor-ra

**1. fázis** (1 nap): bidirekcionális sync (3.A). Azonnali mellékhatás-mentesítés. A lelkész az új UI-ból szerkeszt, a régi modal frissül.

**2. fázis** (2-3 nap): `computeJarulekForMemberYear` átírás — 18 év + horizont + custom_fees. A régi `MemberDetailsDialog` Hátralék tab-ja mostantól az új algoritmust használja.

**3. fázis** (opcionális): `bealitas` pénzügyi mezőinek elhagyása.

---

## 5. Kérdés a user-hez

Mit szeretnél:
- **A**: Most semmit — teszteld a jelenlegi funkciókat, és egy későbbi sessionben döntesz
- **B**: Kezdjük az 1. fázissal (bidirekcionális sync) — egyszerű, azonnali szinkronizálás
- **C**: Ugorjunk a 2. fázisra (teljes refactor) — hosszabb, de tisztább

A rövid döntés-sugallatom: **B** — 1 órás munka, azonnal használható.

De a user dönt.
