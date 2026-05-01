# Tagnyilvántartás vegyes finomítás — Sprint terv (2026-05-02)

A felhasználó 6 pontos észrevétele alapján. Az 1. pont (Settings dialog
szélesítés) v0.9.28-ban már beépítve. A többi pont scope-becsléssel
és implementációs tervvel:

## ✅ 1. Settings dialog UX (KÉSZ — v0.9.28)

- `DialogContent max-w` 3xl → **5xl/6xl** (768 → 1152/1280px)
- Bal sidebar `w-44/sm:w-52` → **w-48/sm:w-60** (180/208 → 192/240px)
- Tabs gap `4/sm:5` → **5/sm:7**

A tartalom most szellősen elfér a tabok mellett, ÉS a panel jelentősen
szélesebb desktop-on.

## 📋 2. Családok szerkesztése + körzet rögzítés

**Érintett fájl**: `apps/web/components/modals/family-form-dialog.tsx`

**Jelenlegi probléma** (felhasználó észrevétele):
- A FamilyFormDialog-ban NEM lehet egy családot körzethez rendelni
- Pedig a `csalad` táblának van `id_korzet` mezője a meglévő séma szerint

**Implementáció**:
1. `getDistricts()` action a `(dashboard)/tagnyilvantartas/presbyter-actions.ts`-ből
2. Új `<Select>` mező a FamilyFormDialog-ban: "Körzet" — opcionális
3. `submitFamily()` action bővítés: `id_korzet` mentése
4. RLS check: csak a saját gyülekezet körzetei kerüljenek a select-be

**Becsült munka**: ~1 óra

## 📋 3. Presbiter smart-search bővítés

**Érintett fájl**: `apps/web/components/modals/presbyter-form-dialog.tsx`
(vagy a benne használt `<MemberSearchSelect>` / `<SearchableSelect>`)

**Jelenlegi probléma**:
- A presbiter-rögzítésnél a person-keresőben csak a név látszik
- Hiányzik az életkor és a lakhely (utca + házszám)

**Implementáció**:
1. A `member-search-select.tsx` (vagy ami használatban van) `<option>`-rendere bővítve:
   - Vezetéknév + Keresztnév (`csaladnev k_nev`)
   - **Életkor** (`ageFromDate(sz_datum)`)
   - **Lakhely** (`utca.name + c_szam`)
2. A két plusz mező egy halvány `<span>`-ben a név mellett (kisebb font, muted-foreground)
3. Mobile: csak a név + életkor; desktop: minden info

**Becsült munka**: ~30 perc

## 📋 4. Családok táblázat sortolás/keresés/szűrés

**Érintett fájl**: `apps/web/components/members/families-tab-v2.tsx`

**Jelenlegi probléma**:
- A táblázat "elrendezése nem egyértelmű" (felhasználó)
- Hiányzik sortolás (név, dátum), keresés (név), szűrés (körzet, státusz)

**Implementáció**:
1. **Header-search input** — családnév/férfi-név/nő-név alapján szűr (debounced)
2. **Filter chip-ek**:
   - Körzet szerint (multi-select)
   - Státusz szerint (aktív / megszűnt)
   - "Csak hibás családok" (kapcsolódik a 6. ponthoz)
3. **Sortable column-ok**:
   - Férj név (asc/desc)
   - Feleség név (asc/desc)
   - Cím (utca, házszám)
   - Körzet
   - Tagok száma
   - Utolsó módosítás
4. **Pagination** (50/100/200 sor/oldal)
5. **Row hover state** + click → FamilyDetailsDialog

**Becsült munka**: ~3 óra

## 📋 5. Családfa bug-vizsgálat

**Érintett fájl**: `apps/web/components/modals/family-tree-dialog.tsx` (505 sor)

**Felhasználó észrevétele**: "hol jól működik hol nem"

**Diagnosztika lépései**:
1. Tesztcase-ek — különböző családi struktúrák:
   - Egyedülálló tag (gyermek nélkül, házastárs nélkül) → "Nincs elegendő adat"
   - Csak házastárs (nincs gyermek, nincs szülő) → 2 csomópont
   - Teljes család (szülők + gyermekek) → 4-6 csomópont
   - Több generáció (nagyszülők is) → mély fa
   - Mostohaszülő, nevelt gyermek → komplex
2. Adatbázis-konzisztencia: `gyerek` tábla és `csalad` tábla kapcsolatok
3. CNP-alapú szülő-keresés (`fetchByCnp`) — ha CNP üres vagy hibás, hibát ad-e
4. Console error-ok ellenőrzése a már működő tabbon

**Becsült munka**: ~2 óra (diagnosztika + 1-2 fix)

## 📋 6. Tagnyilvántartás hibák modul (NAGY ÚJ MODUL)

**Becsült munka**: **8-12 óra** (1-2 nap fókuszált munkával)

### 6.1. SQL migráció

Új tábla a hibák tárolására. **SQL-fájl helye**: `migration-docs/sql/2026-05-02-member-validation-errors.sql`

```sql
CREATE TABLE member_validation_errors (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT NOT NULL REFERENCES szemely(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,                    -- pl. 'email', 'sz_datum', 'cnp'
  error_type TEXT NOT NULL,                    -- 'missing', 'format', 'logic', 'duplicate'
  error_message TEXT NOT NULL,                 -- emberi olvasható hibaszöveg
  severity TEXT NOT NULL CHECK (severity IN ('critical','medium','warning')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','resolved','ignored')),
  congregation_id BIGINT NOT NULL REFERENCES gyulekezet(id) ON DELETE CASCADE,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  ignored_by UUID REFERENCES auth.users(id),
  ignored_reason TEXT,
  ignored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mve_member ON member_validation_errors(member_id);
CREATE INDEX idx_mve_congregation ON member_validation_errors(congregation_id);
CREATE INDEX idx_mve_status ON member_validation_errors(status) WHERE status = 'open';
CREATE INDEX idx_mve_severity ON member_validation_errors(severity, status);

-- RLS policy: csak az adott gyülekezet látja saját hibáit
ALTER TABLE member_validation_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY mve_select ON member_validation_errors FOR SELECT
  USING (current_user_can_access_congregation(congregation_id));

CREATE POLICY mve_insert ON member_validation_errors FOR INSERT
  WITH CHECK (current_user_can_access_congregation(congregation_id));

CREATE POLICY mve_update ON member_validation_errors FOR UPDATE
  USING (current_user_can_access_congregation(congregation_id));

-- Trigger: ha a `szemely` táblán változás van, az érintett hibákat
-- "open" → "needs_recheck" állapotba állítja, és kötegelt háttér-job
-- (cron / postgres pg_cron) újra-validálja
CREATE FUNCTION mve_recheck_on_member_update() RETURNS TRIGGER AS $$
BEGIN
  UPDATE member_validation_errors
    SET status = 'open', updated_at = now()
  WHERE member_id = NEW.id AND status = 'open';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mve_recheck
  AFTER UPDATE ON szemely
  FOR EACH ROW EXECUTE FUNCTION mve_recheck_on_member_update();
```

**Megjegyzés**: a felhasználó futtatja a Supabase-en (én NEM férek hozzá).

### 6.2. Validation engine

Új lib fájl: `apps/web/lib/members/validation-engine.ts`

```ts
export type ValidationError = {
  member_id: number
  field_name: string
  error_type: 'missing' | 'format' | 'logic' | 'duplicate'
  error_message: string
  severity: 'critical' | 'medium' | 'warning'
}

export function validateMember(member: SzemelyRow, ctx: ValidationContext): ValidationError[] {
  const errors: ValidationError[] = []

  // Kötelező mezők
  if (!member.csaladnev?.trim()) errors.push(missingField('csaladnev', 'Hiányzik a vezetéknév', 'critical'))
  if (!member.k_nev?.trim()) errors.push(missingField('k_nev', 'Hiányzik a keresztnév', 'critical'))
  if (!member.sz_datum) errors.push(missingField('sz_datum', 'Hiányzik a születési dátum', 'critical'))
  if (!member.anyjaneve?.trim()) errors.push(missingField('anyjaneve', 'Hiányzik az anyja neve', 'medium'))

  // Lakcím
  if (!member.id_locality && !member.id_utca) {
    errors.push(missingField('lakcim', 'Hiányzik a lakcím', 'medium'))
  }

  // Telefon, e-mail formátum
  if (member.telefon && !isValidPhone(member.telefon)) {
    errors.push(formatError('telefon', 'Hibás telefonszám-formátum', 'medium'))
  }
  if (member.email && !isValidEmail(member.email)) {
    errors.push(formatError('email', 'Hibás e-mail formátum', 'medium'))
  }

  // Logikai
  if (member.sz_datum && new Date(member.sz_datum) > new Date()) {
    errors.push(logicError('sz_datum', 'Jövőbeli születési dátum', 'critical'))
  }
  if (member.sz_datum && yearsAgo(member.sz_datum) > 130) {
    errors.push(logicError('sz_datum', 'Irreálisan régi születési dátum', 'warning'))
  }

  // Duplikációk: ezt a context (összes tag listája) alapján külön
  // function ellenőrzi (findDuplicates) — egy lekérdezéssel.

  return errors
}

export function findDuplicates(members: SzemelyRow[]): Map<number, ValidationError[]> {
  // Email, telefon, név+sz_datum, CNP alapján
  ...
}
```

### 6.3. Server actions

Új action-fájl: `apps/web/app/(dashboard)/tagnyilvantartas/validation-actions.ts`

- `runValidation(congregationId)` — minden tag újra-validálása, INSERT/UPDATE a `member_validation_errors`-be
- `getValidationErrors(filters)` — szűrt lekérdezés
- `resolveError(errorId)` — manuálisan "resolved"-re állítás
- `ignoreError(errorId, reason)` — admin-jogosultsággal "ignored"-re állítás
- `recheckMember(memberId)` — egyetlen tag újraértékelése

### 6.4. UI komponensek

Új útvonal: `apps/web/app/(dashboard)/tagnyilvantartas/hibak/page.tsx`
(vagy `member-tabs-v4.tsx` új fülre épülve — bbegy fül-implementáció gyorsabb)

**Komponensek**:
- `ValidationErrorsTab.tsx` — main view
  - Fejléc: 5 KPI card (összes hiba / kritikus / hiányzó / duplikációk / mai javítások)
  - Filter sor: keresés + súlyosság + típus + státusz
  - Toggle: hibánkénti / tagonkénti nézet
  - Táblázat (sortable)
  - "Hibák újraellenőrzése" gomb
- `ValidationErrorRow.tsx` — egy sor megjelenítése (severity-badge + message + actions)
- `DuplicateComparisonDialog.tsx` — két tag összehasonlítása side-by-side
- `IgnoreErrorDialog.tsx` — admin: figyelmen kívül hagyás indoklással

**Export**:
- Excel/CSV export — már van shared `excel-export-panel.tsx`, ehhez igazítható

### 6.5. Naplózás

A `member_validation_errors` tábla `resolved_by`, `resolved_at`, `ignored_by`, `ignored_at`, `ignored_reason` mezői már naplózást szolgálnak.

### 6.6. Becsült total

| Lépés | Idő |
|---|---|
| 6.1. SQL migráció | 1 ó |
| 6.2. Validation engine | 2 ó |
| 6.3. Server actions | 1 ó |
| 6.4. UI komponensek | 4-5 ó |
| 6.5. Naplózás-integráció | 1 ó |
| **Összesen** | **9-10 óra** |

---

## Sprint felosztás (javasolt)

**Sprint U.1** (1-2 nap):
- 1. Settings dialog ✅ (v0.9.28)
- 2. Családok szerkesztése + körzet
- 3. Presbiter smart-search
- 4. Családok táblázat sortolás/szűrés

**Sprint U.2** (2 nap):
- 5. Családfa diagnosztika + fix
- 6. Tagnyilvántartás hibák modul (TELJES — SQL + engine + UI + export)

A felhasználó ütemtervtől függően ezeket egy vagy több ülésben dolgozzuk fel.
