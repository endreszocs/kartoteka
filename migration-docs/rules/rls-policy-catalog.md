# RLS Policy-katalógus

**Dátum**: 2026-04-23 (M0.4 fázis)
**Cél**: minden `public` schema tábla RLS-védelmének referenciája. Amikor új táblát hozunk létre, ezt a dokumentumot frissítsük.

---

## 0. Alapelvek

1. **Minden `public` tábla RLS-védett**. Kivétel: csak `schema_migrations` és hasonló Supabase-belső.
2. **Default deny, explicit allow**: ha nincs policy, minden blokkolva (kivéve service_role, ami kikerüli az RLS-t).
3. **A service_role kulcs mindent lát** — ezért SOHA nem kerülhet böngészőbe. Csak `lib/supabase/admin-client.ts`-ben használjuk, server-only.
4. **Minden új tábla migráció kötelező tartalmaz**: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` + legalább egy policy.

---

## 1. Segédfüggvények (2026-04-23 SQL)

Újrafelhasználható RLS-policy-kben:

| Függvény | Cél |
|----------|-----|
| `public.is_admin()` | Aktuális user `profiles.role = 'admin'`? |
| `public.is_egyhazkeruleti_admin()` | admin vagy egyhazkeruleti_admin? |
| `public.same_congregation(uuid)` | Aktuális user a megadott congregation_id-hoz tartozik? |
| `public.is_current_user_approved()` | A user status IN ('approved', 'active')? |
| `public.is_user_approved(uuid)` | Tetszőleges user_id jóváhagyott-e? |

---

## 2. Policy-minták (sablonok)

### 2.1 Congregation-szintű tábla (pl. szemely, befizetes, kiadas)

```sql
ALTER TABLE public.<tábla> ENABLE ROW LEVEL SECURITY;

-- Ugyanabba a congregation_id-ba tartozó user olvashatja
CREATE POLICY "congregation_members_read"
  ON public.<tábla>
  FOR SELECT
  USING (
    public.same_congregation(congregation_id)
    OR public.is_admin()
  );

-- Csak a congregation user-ei írhatnak
CREATE POLICY "congregation_members_write"
  ON public.<tábla>
  FOR INSERT
  WITH CHECK (
    public.same_congregation(congregation_id)
    OR public.is_admin()
  );

-- UPDATE + DELETE: ugyanaz
```

### 2.2 User-saját tábla (pl. user_preferences)

```sql
CREATE POLICY "owner_only"
  ON public.<tábla>
  FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
```

### 2.3 Admin-only tábla (pl. system_finance_costs)

```sql
CREATE POLICY "admin_only"
  ON public.<tábla>
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
```

### 2.4 Lookup-tábla (pl. adrstreet, adrlocality, nevnap)

```sql
-- Olvasható minden hitelesített user-nek
CREATE POLICY "lookup_read"
  ON public.<tábla>
  FOR SELECT
  TO authenticated
  USING (true);

-- Írás csak admin-nak
CREATE POLICY "lookup_write"
  ON public.<tábla>
  FOR INSERT WITH CHECK (public.is_admin());
-- + UPDATE + DELETE
```

### 2.5 Anon-elérhető tábla (pl. access_requests, public_sites)

```sql
CREATE POLICY "anon_insert"
  ON public.<tábla>
  FOR INSERT
  WITH CHECK (true);  -- nincs megkötés

CREATE POLICY "admin_manages"
  ON public.<tábla>
  FOR SELECT USING (public.is_admin());
-- + UPDATE + DELETE
```

---

## 3. Tábla-státuszok (riport 2026-04-23 alapján)

Az audit SQL futtatása után itt listázzuk azokat a táblákat, amelyeknél **hiányzik** vagy **hibás** a policy. Amikor egy tábla rendben van, átkerül a "✅ OK" szekcióba.

### 🟥 Hiányzó RLS / Hiányzó policy (pótlás szükséges)

_(Az audit SQL futása után Endre tölti fel.)_

### 🟨 Gyanús (pl. túl nyitott anon policy)

_(Az audit SQL futása után Endre tölti fel.)_

### ✅ OK

- `access_requests` (M0.1) — 3 policy: anon INSERT, admin SELECT + UPDATE
- `system_finance_costs` (2026-04-18) — admin-only
- `system_pricing_tiers` (2026-04-18) — admin-only
- `congregation_subscriptions` (2026-04-18) — admin-only

_(Teljes lista az audit után Endre tölti fel.)_

---

## 4. Szabály az új táblákhoz

Minden új tábla SQL migráció **kötelezően** tartalmaz:

```sql
-- 1. Tábla létrehozás
CREATE TABLE public.new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id UUID REFERENCES public.congregations,  -- ha releváns
  ...
);

-- 2. RLS BE
ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;

-- 3. Legalább egy policy
CREATE POLICY "<tábla>_<művelet>" ON public.new_table FOR SELECT
  USING (
    public.same_congregation(congregation_id)
    OR public.is_admin()
  );

-- 4. Dokumentálás: ezt a fájlt is frissítsd
```

Ha **admin** csak saját user-adatait olvassa: `user_id = auth.uid()` feltétel.

Ha **anon** is elérheti (pl. publikus form): `WITH CHECK (true)` INSERT-re, admin SELECT + UPDATE.

---

## 5. Service_role biztonság

A service_role kulcs MEGKERÜLI az RLS-t. Ezért:

- ✅ `lib/supabase/admin-client.ts` — service_role használat, `import 'server-only'`
- ❌ **NE** kerüljön böngésző-bundle-be (Next.js `NEXT_PUBLIC_*` nélkül)
- ❌ **NE** export-oljuk `'use client'` fájlból
- ❌ **NE** commit-oljuk `.env.example`-be (csak `.env.local`-ba)
- ✅ Supabase Dashboard → Settings → API → Service role secret — csak admin látja

**Használat-eset**: admin invite-user, admin revoke-device, admin audit-log bulk-read, Storage signed URL-t ad ki szerver-oldalon.

---

## 6. Ellenőrző lista minden új táblához

- [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` megvan?
- [ ] Legalább egy `CREATE POLICY` megvan?
- [ ] A policy-k **használják** a segédfüggvényeket (`is_admin()`, `same_congregation()`)?
- [ ] A dokumentáció frissítve?
- [ ] Van audit-log trigger, ha érzékeny adatok módosulhatnak?
