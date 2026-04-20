# Fázis 7 — Sírhelyek + Missziós Műhely + Értesítések: Részletes implementációs terv

**Előfeltétel:** Fázis 1–6 LEZÁRVA
**Forrás elemzés:** `modules/cemeteries-mission-notifications.md`
**Üzleti szabályok:** `rules/cemeteries-mission-notifications-rules.md`
**Felhasználói folyamatok:** `workflows/cemeteries-mission-notifications-flow.md`
**Becsült időigény:** 4–5 nap

---

## 1. Backend (Supabase)

### Használt táblák — NEM kell létrehozni, már léteznek

#### Sírhelyek (4 tábla)

| Tábla | Művelet |
|-------|---------|
| `sirhelytemeto` | CRUD (soft delete) |
| `sirhely` | CRUD (soft delete) |
| `sirhelyberles` | CRUD |
| `sirhelyelhunyt` | CRUD |

#### Missziós Műhely (14 tábla)

| Tábla | Művelet |
|-------|---------|
| `mm_kategoriak` | SELECT |
| `mm_segedanyagok` | CRUD |
| `mm_segedanyag_kategoriak` | INSERT, DELETE |
| `mm_segedanyag_ertekelesek` | INSERT, UPDATE |
| `mm_otletek` | CRUD |
| `mm_szavazatok` | INSERT, DELETE |
| `mm_hozzaszolasok` | INSERT |
| `mm_feladatok` | CRUD |
| `mm_merfoldkovek` | CRUD |
| `mm_dokumentumok` | INSERT |
| `mm_jelveny_tipusok` | SELECT |
| `mm_felhasznalo_statisztika` | SELECT, UPSERT |
| `mm_felhasznalo_jelveny` | SELECT, INSERT |
| `ertesitesek` | INSERT |

#### Értesítések (2 tábla)

| Tábla | Művelet |
|-------|---------|
| `ertesitesek` | SELECT, UPDATE |
| `admin_access_requests` | SELECT, UPDATE |

### RLS

- **Sírhelyek:** `congregation_id` alapú (saját gyülekezet)
- **Missziós Műhely:** **NEM gyülekezet-szűrt** — mindenki lát mindent (közösségi platform)
- **Értesítések:** `user_id` alapú (saját értesítések)

### Auth

- Server Actions: `getUser()` → profil
- Sírhelyek: `congregation_id` profilból
- Missziós Műhely: `user_id` profilból (gyülekezet-független)
- R2 feltöltés: Server Action-ön keresztül (secret NEM a kliensen)

### Role kezelés

| Funkció | Ki éri el |
|---------|----------|
| Sírhelyek: minden CRUD | Saját gyülekezet lelkésze |
| Missziós Műhely: anyag/ötlet feltöltés | Minden bejelentkezett felhasználó |
| Missziós Műhely: saját anyag/ötlet törlés | Szerző |
| Értesítések: saját olvasás | Minden bejelentkezett felhasználó |
| Admin hozzáférés jóváhagyás | A célgyülekezet lelkésze |

---

## 2. Frontend (Next.js)

### Oldalak

| Route | Fájl | Típus |
|-------|------|-------|
| `/sirhelyek` | `app/(dashboard)/sirhelyek/page.tsx` | Server Component |
| `/misszios-muhely` | `app/(dashboard)/misszios-muhely/page.tsx` | Server Component |

Az **értesítések** NEM külön oldal — a header `components/layout/` részébe integrálódik (csengő ikon + dropdown).

### Komponensek — Sírhelyek

| Fájl | Tartalom |
|------|----------|
| `components/cemetery/cemetery-main.tsx` | Szűrők + statisztika + tábla/kártya nézet + nézet váltó |
| `components/modals/cemetery-dialog.tsx` | Temető CRUD |
| `components/modals/plot-dialog.tsx` | Sírhely CRUD (bérletek + elhunytak inline) |
| `components/modals/rental-dialog.tsx` | Bérlet CRUD |
| `components/modals/deceased-dialog.tsx` | Elhunyt CRUD |

### Komponensek — Missziós Műhely

| Fájl | Tartalom |
|------|----------|
| `components/mission/mission-tabs.tsx` | 4 fül (Segédanyagok, Ötletek, Közös munka, Ranglista) |
| `components/mission/materials-list.tsx` | Segédanyag kártyák (cím, kategória, értékelés, letöltés) |
| `components/mission/ideas-list.tsx` | Ötlet kártyák (cím, szavazat, státusz) |
| `components/mission/leaderboard.tsx` | Ranglista táblázat |
| `components/modals/material-upload-dialog.tsx` | Segédanyag feltöltés |
| `components/modals/material-detail-dialog.tsx` | Segédanyag részletek + értékelés |
| `components/modals/idea-wizard-dialog.tsx` | Ötlet létrehozás (4 lépéses wizard) |
| `components/modals/idea-detail-dialog.tsx` | Ötlet részletek + szavazás + kommentek |
| `components/modals/shared-project-dialog.tsx` | Közös munka workspace (feladatok + mérföldkövek + dokumentumok) |
| `components/modals/badges-dialog.tsx` | Jelvények grid + szint kijelzés |

### Komponensek — Értesítések

| Fájl | Tartalom |
|------|----------|
| `components/layout/notification-bell.tsx` | Csengő ikon + olvasatlan badge + dropdown lista |
| `components/modals/notification-detail-dialog.tsx` | Értesítés részletek + admin hozzáférés gombok |

### Server Actions

| Fájl | Függvények |
|------|-----------|
| `sirhelyek/actions.ts` | `getCemeteries()`, `saveCemetery()`, `deleteCemetery()`, `getPlots()`, `savePlot()`, `deletePlot()`, `saveRental()`, `deleteRental()`, `saveDeceased()`, `deleteDeceased()`, `getPlotStats()` |
| `misszios-muhely/actions.ts` | `getCategories()`, `getMaterials()`, `saveMaterial()`, `deleteMaterial()`, `rateMaterial()`, `incrementDownload()`, `getIdeas()`, `saveIdea()`, `deleteIdea()`, `toggleVote()`, `postComment()`, `getTasks()`, `saveTask()`, `toggleTask()`, `saveMilestone()`, `toggleMilestone()`, `uploadDocument()`, `markAsRealized()`, `checkDeadlines()`, `getLeaderboard()`, `getUserStats()`, `getBadges()`, `addPoints()` |
| `misszios-muhely/upload-actions.ts` | `uploadToR2(formData)` (Server Action — R2 secret szerveren) |

### Utility fájlok

| Fájl | Tartalom |
|------|----------|
| `lib/constants/cemetery.ts` | Állapotok, badge színek |
| `lib/constants/mission.ts` | Kategóriák, ötlet státuszok, pont szabályok, szint rendszer, fájl limtek |
| `lib/validations/cemetery.ts` | Zod: cemeterySchema, plotSchema, rentalSchema, deceasedSchema |
| `lib/validations/mission.ts` | Zod: materialSchema, ideaSchema, taskSchema, milestoneSchema |

---

## 3. Funkciók

### 3.1 — Sírhelyek CRUD

**`savePlot(data)` szerver logika:**
1. Zod validáció
2. INSERT/UPDATE `sirhely`
3. `congregation_id` profilból

**Bérleti számítás:** Alapértelmezett vég dátum = kezdet + 25 év (kliens-oldalon számolva, szerver validálja).

**Szűrés:** temető ID + állapot → kliens-oldali szűrés (az összes adat betöltve).

### 3.2 — Missziós Műhely

**`saveMaterial(data)` + `uploadToR2(formData)` szerver logika:**
1. Zod validáció
2. **Server Action** → R2 Worker-re feltöltés (a secret a `.env.local`-ban)
3. INSERT `mm_segedanyagok` (cím, leírás, fájl URL, formátum, méret)
4. INSERT `mm_segedanyag_kategoriak` (junction)
5. `addPoints('segedanyag_feltoltes', userId)`

**`toggleVote(ideaId)` szerver logika:**
1. SELECT meglévő szavazat
2. Ha van → DELETE (visszavonás)
3. Ha nincs → INSERT (támogatás)
4. `addPoints('szavazat_adva', userId)`

**`addPoints(eventType, userId)` szerver logika:**
1. SELECT/INSERT `mm_felhasznalo_statisztika` (upsert ha nincs)
2. Pont hozzáadás a szabály alapján
3. Statisztika mező inkrementálás
4. Jelvény ellenőrzés → ha jár új → INSERT `mm_felhasznalo_jelveny`

### 3.3 — Értesítések

**Notification bell (kliens):**
1. Mount-kor: `loadNotifications()` → utolsó 20 olvasatlan
2. Supabase Realtime subscribe: `ertesitesek` INSERT, `user_id = currentUser`
3. Új értesítés → toast + badge frissítés

**Admin hozzáférés szerver logika:**
1. SELECT `admin_access_requests` a notif ID alapján
2. UPDATE status → `approved` (+ `expires_at`) VAGY `denied`
3. INSERT `ertesitesek` a kérelmezőnek (eredmény)

---

## 4. Prioritás — lépések sorrendje

### SPRINT 1: Sírhelyek (~1.5 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **1.1** | Konstansok + Zod | `lib/constants/cemetery.ts`, `lib/validations/cemetery.ts` |
| **1.2** | Server Actions | `sirhelyek/actions.ts` |
| **1.3** | Page + CemeteryMain (szűrők + statisztika + tábla) | `sirhelyek/page.tsx`, `cemetery/cemetery-main.tsx` |
| **1.4** | Modal-ok (temető, sírhely, bérlet, elhunyt) | 4 modal fájl |

### SPRINT 2: Missziós Műhely — alapok (~2 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **2.1** | Konstansok + Zod | `lib/constants/mission.ts`, `lib/validations/mission.ts` |
| **2.2** | Server Actions (anyag + ötlet + szavazás + gamifikáció) | `misszios-muhely/actions.ts` |
| **2.3** | R2 feltöltés Server Action | `misszios-muhely/upload-actions.ts` |
| **2.4** | Page + MissionTabs + MaterialsList + IdeasList + Leaderboard | `misszios-muhely/page.tsx`, 4 komponens |
| **2.5** | Material dialógok (feltöltés + részletek) | 2 modal |
| **2.6** | Idea dialógok (wizard + detail + shared project) | 3 modal |
| **2.7** | Badges modal + gamifikáció UI | 1 modal |

### SPRINT 3: Értesítések (~0.5 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **3.1** | NotificationBell (header integráció) | `components/layout/notification-bell.tsx` |
| **3.2** | Notification detail modal (admin hozzáférés gombok) | `modals/notification-detail-dialog.tsx` |
| **3.3** | Header frissítés (bell integráció) | `components/layout/header.tsx` módosítás |

### SPRINT 4: Build (~0.5 nap)

| Lépés | Mit |
|-------|-----|
| **4.1** | Build ellenőrzés |

### Összesített ütemezés

```
Sprint 1 ■■■■■■░░░░░░░░░░  (1.5 nap)  Sírhelyek (temető + parcella + bérlet + elhunyt)
Sprint 2 ░░░░░░■■■■■■■■░░  (2 nap)    Missziós Műhely (anyag + ötlet + szavazás + gamifikáció)
Sprint 3 ░░░░░░░░░░░░░░■░  (0.5 nap)  Értesítések (bell + realtime + admin)
Sprint 4 ░░░░░░░░░░░░░░░■  (0.5 nap)  Build
                                        ──────────────────────
                                        Összesen: ~4.5 nap
```

---

## 5. Függőségek

### Telepítendő npm csomag

Nincs új csomag szükséges. A Supabase Realtime a meglévő `@supabase/ssr` csomagon belül elérhető.

### Külső szolgáltatás

| Szolgáltatás | Használat | Konfig |
|-------------|-----------|--------|
| **Cloudflare R2** | Fájl feltöltés (Missziós Műhely) | `R2_WORKER_URL` + `R2_AUTH_SECRET` a `.env.local`-ban |

**FONTOS:** A régi rendszerben az R2 auth secret **kliens-oldali kódban** volt. A Next.js-ben ez **Server Action-ön** megy → a secret a `.env.local`-ban, soha nem a kliensen.

### Fájl-függőségi fa

```
lib/constants/cemetery.ts             ← NINCS FÜGGŐSÉGE
lib/constants/mission.ts              ← NINCS FÜGGŐSÉGE
lib/validations/cemetery.ts           ← függ: cemetery.ts
lib/validations/mission.ts            ← függ: mission.ts
    │
    ▼
app/(dashboard)/sirhelyek/
├── page.tsx                          ← Server: congregation_id
├── actions.ts                        ← Temető + sírhely + bérlet + elhunyt CRUD

app/(dashboard)/misszios-muhely/
├── page.tsx                          ← Server: user profil
├── actions.ts                        ← Anyag + ötlet + szavazás + gamifikáció
├── upload-actions.ts                ← R2 feltöltés (secret szerveren)
    │
    ▼
components/cemetery/
├── cemetery-main.tsx                 ← Szűrők + stat + tábla/kártya

components/mission/
├── mission-tabs.tsx                  ← 4 fül
├── materials-list.tsx               ← Anyag kártyák
├── ideas-list.tsx                   ← Ötlet kártyák
├── leaderboard.tsx                  ← Ranglista

components/layout/
├── notification-bell.tsx            ← Csengő + badge + dropdown + Realtime
├── header.tsx                       ← Bell integráció (módosítás)

components/modals/
├── cemetery-dialog.tsx              ← Temető CRUD
├── plot-dialog.tsx                  ← Sírhely + bérlet + elhunyt inline
├── rental-dialog.tsx                ← Bérlet CRUD
├── deceased-dialog.tsx              ← Elhunyt CRUD
├── material-upload-dialog.tsx       ← Feltöltés (R2)
├── material-detail-dialog.tsx       ← Részletek + értékelés
├── idea-wizard-dialog.tsx           ← 4 lépéses wizard
├── idea-detail-dialog.tsx           ← Szavazás + komment
├── shared-project-dialog.tsx        ← Feladatok + mérföldkövek + docs
├── badges-dialog.tsx                ← Jelvények + szint
├── notification-detail-dialog.tsx   ← Értesítés + admin gombok
```

**Összesen: ~28 új/módosított fájl**
- 2 Server Page
- 3 Server Action fájl
- 6 Client Component
- 11 Modal Component
- 4 Utility fájl
- 2 Módosított fájl (header, notification bell)

### Modul-függőségek

| Fázis 7 funkció | Függ-e más modultól? |
|-----------------|---------------------|
| Sírhelyek | NEM — önálló modul, saját táblák |
| Missziós Műhely | NEM — gyülekezet-független közösségi platform |
| Értesítések bell | MÓDOSÍTJA a `header.tsx`-et (Fázis 1 layout) |
| Admin hozzáférés | OLVAS/ÍR `admin_access_requests` (Fázis 1 tábla) |
| Értesítés küldés (regisztráció) | Fázis 1-ben már implementálva (`register/actions.ts`) |

---

## Elfogadási kritériumok

| # | Kritérium | Modul |
|---|-----------|-------|
| 1 | Temető CRUD + sírhely CRUD (5 állapot) | Sírhelyek |
| 2 | Bérleti szerződés (25 éves, többszörös) + elhunyt (családi sírhely) | Sírhelyek |
| 3 | Táblázat ↔ kártya nézet váltás + temető/állapot szűrő | Sírhelyek |
| 4 | Segédanyag feltöltés (R2 Server Action) + értékelés + letöltés | Missziós Műhely |
| 5 | Ötlet 4 lépéses wizard + szavazás (toggle) | Missziós Műhely |
| 6 | Szavazás automatikus lezárás (határidő → közös munka) | Missziós Műhely |
| 7 | Közös projekt: feladatok + mérföldkövek + dokumentumok | Missziós Műhely |
| 8 | Gamifikáció: 6 szint + 11 pont szabály + jelvények | Missziós Műhely |
| 9 | Ranglista (pont csökkenő) | Missziós Műhely |
| 10 | Értesítés bell: olvasatlan badge + dropdown + olvasás jelölés | Értesítések |
| 11 | Supabase Realtime: új értesítésnél toast + badge frissítés | Értesítések |
| 12 | Admin hozzáférés jóváhagyás/elutasítás | Értesítések |
| 13 | R2 secret CSAK szerveren (.env.local), soha nem kliens-kódban | Biztonság |
| 14 | Build 0 hibával lefordul | Mind |
