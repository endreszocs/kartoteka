# Fázis 8 — Aladár AI + Admin Panel: Részletes implementációs terv

**Előfeltétel:** Fázis 1–7 LEZÁRVA
**Forrás elemzés:** `modules/ai-assistant-admin-panel.md`
**Üzleti szabályok:** `rules/ai-assistant-admin-panel-rules.md`
**Felhasználói folyamatok:** `workflows/ai-assistant-admin-panel-flow.md`
**Becsült időigény:** 3–4 nap

---

## 1. Backend (Supabase)

### Használt táblák — NEM kell létrehozni, már léteznek

| Tábla | Modul | Művelet |
|-------|-------|---------|
| `profiles` | AI + Admin | SELECT (AI: lelkész neve; Admin: összes felhasználó), UPDATE (szerepkör, státusz) |
| `dioceses` | Admin | SELECT |
| `congregations` | Admin | SELECT, INSERT (jóváhagyáskor auto-létrehozás), UPDATE |
| `szemely` | Admin | SELECT (KPI + minőség + import párosítás) |
| `support_messages` | Admin | SELECT, INSERT (válasz), UPDATE (lezárás) |
| `admin_access_requests` | Admin | SELECT, INSERT (override), UPDATE |
| `ertesitesek` | Admin | INSERT (jóváhagyás/válasz értesítés) |
| `befizetes` | Admin Import | INSERT (bevétel import) |
| `befizetescel` + `szamadasicel` | Admin Import | SELECT (kategória kódok) |
| `munkanaplo` | Admin Import | INSERT |
| `keresztseg` | Admin Import | INSERT |
| `iktato` | Admin Import | INSERT |

### Külső API-k

| Szolgáltatás | Használat | .env.local kulcs |
|-------------|-----------|-----------------|
| **OpenRouter** | AI chat (elsődleges) | `OPENROUTER_API_KEY` |
| **Groq** | AI chat (fallback 2) | `GROQ_API_KEY` |
| **Gemini** | AI chat (fallback 3) | `GEMINI_API_KEY` |

**KRITIKUS:** A régi rendszerben az API kulcsok **kliens-oldalon** voltak. A Next.js-ben ezek **Route Handler-ön** (`app/api/ai/chat/route.ts`) keresztül mennek — a kulcsok SOHA nem kerülnek a kliens-kódba.

### Auth

- **AI:** Route Handler — `getUser()` ellenőrzés (bejelentkezett-e?)
- **Admin:** Server Actions — `isMasterAdmin(email)` ellenőrzés MINDEN action-ben

### Role kezelés

| Funkció | Ki éri el |
|---------|----------|
| AI chat | Minden bejelentkezett felhasználó |
| Admin Panel (összes funkció) | **KIZÁRÓLAG Master Admin** |

---

## 2. Frontend (Next.js)

### Oldalak

| Route | Fájl | Típus |
|-------|------|-------|
| `/admin` | `app/(dashboard)/admin/page.tsx` | Server Component |
| `/api/ai/chat` | `app/api/ai/chat/route.ts` | Route Handler (API) |

Az **AI widget** NEM külön oldal — a layout-ba integrálódik (minden oldalon megjelenik).

### Komponensek — AI Asszisztens

| Fájl | Tartalom |
|------|----------|
| `components/ai/ai-chat-widget.tsx` | Teljes AI widget: buborék ikon, chat ablak, üzenet lista, input, markdown render, figyelemfelkeltés |

### Komponensek — Admin Panel

| Fájl | Tartalom |
|------|----------|
| `components/admin/admin-tabs.tsx` | 5 fül orchestrátor (Áttekintés, Gyülekezetek, Felhasználók, Támogatás, Import) |
| `components/admin/overview-tab.tsx` | KPI kártyák + egyházmegye megoszlás + top gyülekezetek |
| `components/admin/congregations-tab.tsx` | Gyülekezet lista + szűrés + Admin Override |
| `components/admin/users-tab.tsx` | Függő regisztrációk + aktív felhasználók + szerepkör |
| `components/admin/support-tab.tsx` | Támogatási jegyek + válasz + lezárás |
| `components/admin/import-tab.tsx` | 4 import alfül (bevétel, munkanapló, keresztelés, iktatás) |
| `components/modals/congregation-details-dialog.tsx` | Gyülekezet részletek (tagok + pénzügy) |
| `components/modals/support-reply-dialog.tsx` | Támogatási jegy válasz |

### Server Actions + Route Handler

| Fájl | Függvények |
|------|-----------|
| `app/api/ai/chat/route.ts` | `POST` — AI chat (multi-provider fallback, API kulcsok szerveren) |
| `app/(dashboard)/admin/actions.ts` | `getAdminOverview()`, `getCongregations()`, `getCongregationDetails()`, `enterCongregation()`, `getAllUsers()`, `approveUser()`, `saveUserRole()`, `getSupportTickets()`, `sendSupportReply()`, `closeSupportTicket()`, `runQualityCheck()` |
| `app/(dashboard)/admin/import-actions.ts` | `importIncome()`, `importWorklog()`, `importBaptism()`, `importFiling()`, `matchPersonByName()` |

### Utility fájlok

| Fájl | Tartalom |
|------|----------|
| `lib/constants/ai.ts` | Szolgáltató konfig (nevek, endpointok — NEM kulcsok!), modell listák, rate limit, max token |
| `lib/constants/admin.ts` | Szerepkör opciók, minőség-ellenőrzés mezők, import batch méret |

---

## 3. Funkciók

### 3.1 — AI Chat Route Handler

**`POST /api/ai/chat`**

Input: `{ message: string, history: { role, content }[] }`

Szerver logika:
1. Auth ellenőrzés (`getUser()`)
2. System prompt összeállítás (magyar, modul-ismeretek)
3. Multi-provider fallback:
   - `OPENROUTER_API_KEY` → 3 modell
   - `GROQ_API_KEY` → 2 modell
   - `GEMINI_API_KEY` → 2 modell
4. Első sikeres válasz visszaadása
5. Ha mind hibázik → `{ error: "Jelenleg nem tudok válaszolni." }`

**BIZTONSÁGI INTÉZKEDÉS:** Az API kulcsok a `.env.local`-ban vannak, a Route Handler szerveren fut — a kliens SOHA nem látja a kulcsokat.

### 3.2 — Admin Panel

**`getAdminOverview()`:**
- 5 párhuzamos query (dioceses, congregations, profiles, szemely count, support_messages)
- KPI számítás: gyülekezetek, aktív felhasználók, élő tagok, függő jegyek

**`approveUser(userId, dioceseId)`:**
1. Egyházmegye ellenőrzés
2. Gyülekezet keresés (a regisztrációkor megadott név alapján)
3. Ha nincs → INSERT `congregations`
4. UPDATE `profiles`: status='active', congregation_id, diocese_id
5. INSERT `ertesitesek` a felhasználónak

**`runQualityCheck()`:**
- SELECT szemely (id, congregation_id, cnp, ferfi, sz_datum)
- Gyülekezetenként csoportosítás → hibák számolása

**`importIncome(congId, rows)`:**
- Zod validáció soronként
- 100-as batch INSERT `befizetes`
- Személypárosítás: `matchPersonByName(name, congId)` → `szemely.id`

### 3.3 — Validációk

**AI:**
- Üzenet: nem üres string
- Rate limit: szerver-oldalon is (opcionális — a kliens is limitál)

**Admin — Felhasználó jóváhagyás:**
- userId: létező pending felhasználó
- dioceseId: létező egyházmegye
- Master Admin e-mail: `.env.local` MASTER_ADMIN_EMAIL

**Admin — Import:**
- Bevétel: osszeg > 0, datum érvényes, kategória kód létezik
- Munkanapló: datum kötelező, kategória kötelező
- Keresztelés: név kötelező, datum kötelező
- Iktatás: iktatószám formátum `{N}/{YYYY}`

---

## 4. Prioritás — lépések sorrendje

### SPRINT 1: AI Asszisztens (~1 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **1.1** | AI konstansok (modellek, limitek — NEM kulcsok) | `lib/constants/ai.ts` |
| **1.2** | Route Handler (multi-provider fallback, kulcsok szerveren) | `app/api/ai/chat/route.ts` |
| **1.3** | AI Chat Widget (buborék, chat ablak, markdown, session, figyelemfelkeltés) | `components/ai/ai-chat-widget.tsx` |
| **1.4** | Layout integráció (widget minden oldalon) | `app/(dashboard)/layout.tsx` módosítás |

### SPRINT 2: Admin Panel — alapok (~1 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **2.1** | Admin konstansok | `lib/constants/admin.ts` |
| **2.2** | Admin Server Actions (áttekintés, gyülekezetek, felhasználók) | `admin/actions.ts` |
| **2.3** | Admin Page + Tabs | `admin/page.tsx`, `admin/admin-tabs.tsx` |
| **2.4** | Áttekintés fül (KPI) | `admin/overview-tab.tsx` |
| **2.5** | Felhasználók fül (jóváhagyás + szerepkör) | `admin/users-tab.tsx` |
| **2.6** | Gyülekezetek fül (lista + Admin Override) | `admin/congregations-tab.tsx` |

### SPRINT 3: Támogatás + Minőség + Import (~1.5 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **3.1** | Támogatás fül (jegy lista + válasz + lezárás) | `admin/support-tab.tsx`, `modals/support-reply-dialog.tsx` |
| **3.2** | Adatminőség ellenőrzés | (overview-tab.tsx részeként) |
| **3.3** | Import Server Actions + UI | `admin/import-actions.ts`, `admin/import-tab.tsx` |

### SPRINT 4: Build (~0.5 nap)

| Lépés | Mit |
|-------|-----|
| **4.1** | Sidebar: Admin Panel menüpont (már megvan, de ellenőrzés) |
| **4.2** | Build ellenőrzés |

### Összesített ütemezés

```
Sprint 1 ■■■■░░░░░░░░░░  (1 nap)    AI Asszisztens (Route Handler + Widget + Layout)
Sprint 2 ░░░░■■■■░░░░░░  (1 nap)    Admin alapok (áttekintés + felhasználók + gyülekezetek)
Sprint 3 ░░░░░░░░■■■■■░  (1.5 nap)  Támogatás + minőség + import
Sprint 4 ░░░░░░░░░░░░░■  (0.5 nap)  Build
                                      ────────────────────────
                                      Összesen: ~4 nap
```

---

## 5. Függőségek

### Környezeti változók (.env.local — ÚJ)

```
OPENROUTER_API_KEY=sk-or-v1-...
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIzaSy...
```

Legalább 1 kulcs kötelező — ha egyetlen sincs, az AI widget nem jelenik meg.

### Telepítendő npm csomag

Nincs új csomag szükséges.

### Fájl-függőségi fa

```
lib/constants/ai.ts                  ← szolgáltatók, modellek (NEM kulcsok)
lib/constants/admin.ts               ← szerepkörök, import batch méret
    │
    ▼
app/api/ai/chat/route.ts             ← Route Handler (kulcsok .env.local-ból)
    │
app/(dashboard)/admin/
├── page.tsx                          ← Server: isMasterAdmin check
├── actions.ts                        ← overview, users, congregations, support, quality
├── import-actions.ts                ← 4 import típus + személypárosítás
    │
    ▼
components/ai/
├── ai-chat-widget.tsx               ← Teljes widget (buborék + chat + markdown + session)

components/admin/
├── admin-tabs.tsx                   ← 5 fül orchestrátor
├── overview-tab.tsx                 ← KPI + minőség + top gyülekezetek
├── congregations-tab.tsx            ← Lista + override
├── users-tab.tsx                    ← Jóváhagyás + szerepkör
├── support-tab.tsx                  ← Jegyek + válasz
├── import-tab.tsx                   ← 4 import alfül

components/modals/
├── congregation-details-dialog.tsx  ← Tagok + pénzügy
├── support-reply-dialog.tsx         ← Jegy válasz

MÓDOSÍTOTT
├── app/(dashboard)/layout.tsx       ← AI widget integráció
```

**Összesen: ~16 új/módosított fájl**
- 1 Route Handler
- 1 Server Page
- 2 Server Action fájl
- 1 AI widget
- 6 Admin Client Component
- 2 Modal
- 2 Utility fájl
- 1 Módosított layout

### Modul-függőségek

| Fázis 8 funkció | Függ-e más modultól? |
|-----------------|---------------------|
| AI widget | NEM — önálló, layout-ba integrált |
| Admin: felhasználó jóváhagyás | ÍR `profiles` + `congregations` + `ertesitesek` (Fázis 1 táblák) |
| Admin: Admin Override | ÍR `admin_access_requests` (Fázis 1 tábla) |
| Admin: minőség ellenőrzés | OLVAS `szemely` (Fázis 3 tábla) |
| Admin: bevétel import | ÍR `befizetes` (Fázis 4 tábla) |
| Admin: munkanapló import | ÍR `munkanaplo` (Fázis 6 tábla) |
| Admin: keresztelés import | ÍR `keresztseg` (Fázis 5 tábla) |
| Admin: iktatás import | ÍR `iktato` (Fázis 6 tábla) |

---

## Elfogadási kritériumok

| # | Kritérium | Modul |
|---|-----------|-------|
| 1 | AI widget: megjelenik minden oldalon (ha van API kulcs) | AI |
| 2 | AI: multi-provider fallback (OpenRouter → Groq → Gemini) | AI |
| 3 | AI: API kulcsok CSAK szerveren (.env.local), NEM kliens-kódban | AI |
| 4 | AI: rate limiting (2500ms), session perzisztencia, markdown render | AI |
| 5 | Admin: KIZÁRÓLAG Master Admin érheti el | Admin |
| 6 | Admin: KPI áttekintés (gyülekezetek, felhasználók, tagok, jegyek) | Admin |
| 7 | Admin: felhasználó jóváhagyás (egyházmegye → gyülekezet auto → aktiválás) | Admin |
| 8 | Admin: szerepkör módosítás (4 szint, azonnali) | Admin |
| 9 | Admin: Admin Override (belépés bármely gyülekezetbe, 24h) | Admin |
| 10 | Admin: támogatási jegy válasz + lezárás | Admin |
| 11 | Admin: adatminőség ellenőrzés (CNP/nem/dátum, gyülekezetenként) | Admin |
| 12 | Admin: tömeges import (bevétel + munkanapló + keresztelés + iktatás) | Admin |
| 13 | Build 0 hibával lefordul | Mind |
