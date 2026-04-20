# Sírhelyek + Missziós Műhely + Értesítések — Implementáció validálás

Összevetve: `rules/` + `workflows/` vs. implementált kód.

Utolsó frissítés: 2026-04-06

---

## 1. Hiányzó funkciók

### IMPLEMENTÁLT — kész

| # | Funkció | Modul | Állapot |
|---|---------|-------|---------|
| ✅ | Temető CRUD (soft delete) | Sírhelyek | KÉSZ |
| ✅ | Sírhely CRUD (5 állapot) | Sírhelyek | KÉSZ |
| ✅ | Bérleti szerződés CRUD (25 éves alapértelmezett) | Sírhelyek | KÉSZ |
| ✅ | Elhunyt regisztráció (családi sírhely — több elhunyt) | Sírhelyek | KÉSZ |
| ✅ | Temető + állapot szűrő | Sírhelyek | KÉSZ |
| ✅ | Táblázat ↔ kártya nézet váltás | Sírhelyek | KÉSZ |
| ✅ | Statisztika kártyák (összesen, szabad, foglalt, lejárt) | Sírhelyek | KÉSZ |
| ✅ | Kettős map (bérlet + elhunyt per sírhely inline) | Sírhelyek | KÉSZ |
| ✅ | Értesítés csengő (olvasatlan badge) | Értesítések | KÉSZ |
| ✅ | Értesítés dropdown lista (utolsó 20 olvasatlan) | Értesítések | KÉSZ |
| ✅ | Supabase Realtime subscribe (INSERT figyelés, user_id szűrő) | Értesítések | KÉSZ |
| ✅ | Olvasott jelölés + részletes modal | Értesítések | KÉSZ |
| ✅ | Header integráció (bell a profil mellé) | Értesítések | KÉSZ |

### HIÁNYZIK

| # | Funkció | Modul | Prioritás | Leírás |
|---|---------|-------|:---------:|--------|
| H1 | **CSV export** | Sírhelyek | P2 | A `exportSirhelyek()` action nincs, a felületen nincs export gomb |
| H2 | **Bérlet szerkesztés** | Sírhelyek | P2 | A `rentalDialog` mindig új bérletként nyílik, nincs `editRental` mód |
| H3 | **Elhunyt szerkesztés** | Sírhelyek | P2 | A `deceasedDialog` mindig új elhunytként nyílik, nincs `editDeceased` mód |
| H4 | **Admin hozzáférés jóváhagyás/elutasítás gombok** | Értesítések | **P1** | A `notification-bell.tsx` detail modalban NINCS jóváhagyás/elutasítás gomb admin értesítéseknél |
| H5 | **Toast új értesítésnél** | Értesítések | P2 | A Realtime callback-ben nincs toast megjelenítés — csak a badge szám frissül (`loadNotifications`) |
| H6 | **Missziós Műhely: segédanyag feltöltés + CRUD** | Missziós Műhely | P2 (Fázis 9) | Placeholder — teljes funkcionálitás később |
| H7 | **Missziós Műhely: ötlet wizard + szavazás** | Missziós Műhely | P2 (Fázis 9) | Placeholder |
| H8 | **Missziós Műhely: közös munka workspace** | Missziós Műhely | P3 (Fázis 9) | Placeholder |
| H9 | **Missziós Műhely: gamifikáció (pontok + szintek + jelvények)** | Missziós Műhely | P3 (Fázis 9) | Placeholder |
| H10 | **Missziós Műhely: ranglista** | Missziós Műhely | P3 (Fázis 9) | Placeholder |

---

## 2. Nem implementált szabályok

| # | Szabály | Állapot | Megjegyzés |
|---|---------|---------|-----------|
| S1 | Sírhelyek: 5 állapot | ✅ | |
| S2 | Sírhelyek: 25 éves bérlet alapértelmezés | ✅ | |
| S3 | Sírhelyek: több bérlet + több elhunyt per sírhely | ✅ | |
| S4 | Sírhelyek: soft delete (temető + sírhely) | ✅ | |
| S5 | Sírhelyek: elhunyt szabad szöveges név | ✅ | |
| S6 | Sírhelyek: CSV export | ❌ | HIÁNYZIK (= H1) |
| S7 | Értesítések: user_id szűrő | ✅ | |
| S8 | Értesítések: Supabase Realtime | ✅ | |
| S9 | Értesítések: típusonkénti ikon/szín | ✅ | 6 típus konfigurálva |
| S10 | Értesítések: admin hozzáférés workflow | ❌ | HIÁNYZIK (= H4) |
| S11 | Missziós Műhely: gyülekezet-független | ✅ | A placeholder nincs congregation_id szűrve |
| S12 | Missziós Műhely: anyag feltöltés R2-re | ❌ | Placeholder (Fázis 9) |
| S13 | Missziós Műhely: értékelés 1-5 | ❌ | Placeholder |
| S14 | Missziós Műhely: ötlet életciklus (6 státusz) | ❌ | Placeholder |
| S15 | Missziós Műhely: gamifikáció (6 szint, 11 szabály) | ❌ | Placeholder |
| S16 | Missziós Műhely: R2 secret szerveren | — | Nincs implementálva (de a terv szerint Server Action) |

---

## 3. Lehetséges bugok

| # | Bug | Fájl | Leírás | Súlyosság |
|---|-----|------|--------|-----------|
| B1 | **Bérlet: a `deleteRental` fizikai DELETE** | `sirhelyek/actions.ts` | A bérleteknél `DELETE` fut, nem `UPDATE deleted=true`. A szabály szerint soft delete kellene. Az elhunyt is fizikai DELETE. A temető és sírhely helyesen soft delete. | KÖZEPES |
| B2 | **Értesítés: dropdown z-index ütközhet modal-okkal** | `notification-bell.tsx` | A dropdown `z-50`-vel nyílik, de a Dialog-ok is `z-50`. Ha egy modal nyitva van és az értesítés bell-re kattintunk, a dropdown a modal mögé kerülhet. | ALACSONY |
| B3 | **Értesítés: a Realtime channel nem unsubscribe-ol komponens unmount-kor oldal-navigálásnál** | `notification-bell.tsx` | A `useEffect` cleanup a `supabase.removeChannel(channel)`-t hívja, ami helyes. De a channel referencia a closure-ban van — ha a `userId` változik, az előző channel nem biztos hogy kitisztul. | ALACSONY |

---

## 4. Edge case hiányok

| # | Edge case | Modul | Állapot |
|---|-----------|-------|---------|
| E1 | Temető törlés: vannak sírhelyei | Sírhelyek | ✅ Soft delete, sírhelyek megmaradnak |
| E2 | Sírhely törlés: vannak bérletek + elhunytak | Sírhelyek | ⚠️ A sírhely soft delete, de a bérlet/elhunyt NEM soft delete (fizikai DELETE-nél elvesznének) |
| E3 | Bérlet lejárt → állapot manuális | Sírhelyek | ✅ Ismert — nincs auto-váltás |
| E4 | Két elhunyt azonos név | Sírhelyek | ✅ Megengedett |
| E5 | 20+ olvasatlan értesítés | Értesítések | ✅ Csak az utolsó 20 jelenik meg |
| E6 | Realtime csatorna megszakad | Értesítések | ✅ A Supabase auto-reconnect kezeli |
| E7 | Admin hozzáférés: kérelem nem létezik | Értesítések | ❌ Nem implementált (= H4) |
| E8 | Admin hozzáférés: már elbírált | Értesítések | ❌ Nem implementált (= H4) |
| E9 | PWA install | Értesítések | ❌ Nem implementált (P3 — Fázis 9) |
| E10 | Missziós Műhely: fájl > 20 MB | Missziós Műhely | ❌ Placeholder |
| E11 | Missziós Műhely: szavazás auto-lezárás | Missziós Műhely | ❌ Placeholder |

---

## 5. Összefoglaló

### Implementáltsági állapot

| Kategória | Összes | Kész | Hiányzik | % |
|-----------|--------|------|----------|---|
| **Sírhelyek szabályok** | 6 | 5 | 1 (CSV) | 83% |
| **Értesítések szabályok** | 4 | 3 | 1 (admin gombok) | 75% |
| **Missziós Műhely szabályok** | 6 | 1 | 5 (placeholder) | 17% |
| **Edge case-ek** | 11 | 6 | 5 | 55% |
| **Bugok** | — | — | 1 közepes, 2 alacsony | — |

### Javítandó — prioritás szerint

**P1:**

| # | Mit | Hol |
|---|-----|-----|
| H4 | Admin hozzáférés jóváhagyás/elutasítás gombok | `notification-bell.tsx` — admin típusú értesítésnél gombok + Server Action |

**P2:**

| # | Mit |
|---|-----|
| B1 | Bérlet + elhunyt: soft delete (fizikai DELETE → UPDATE deleted=true) |
| H1 | CSV export |
| H2+H3 | Bérlet/elhunyt szerkesztés mód |
| H5 | Toast új értesítésnél |

**P3 (Fázis 9):**

| # | Mit |
|---|-----|
| H6–H10 | Missziós Műhely teljes implementáció |
| E9 | PWA install |
