# Aladár AI + Admin Panel — Architektúra terv

**Stack:** Next.js 16 + Supabase + Tailwind CSS 4 + shadcn/ui

---

## 1. Komponensek

### Két különálló terület — 1 globális widget + 1 admin route

```
═══ AI WIDGET (globális — minden oldalon) ═════════════════════
app/(dashboard)/layout.tsx                   ← MÓDOSÍTOTT
│
└── <AiChatWidget />                         ← CLIENT
    ├── Buborék ikon (fix jobb alsó sarok)
    ├── Chat ablak (370×580px)
    │   ├── Üzenet lista (felhasználó jobbra, AI balra, markdown)
    │   ├── Gépelés animáció
    │   └── Input + küldés (Enter/Shift+Enter)
    ├── Figyelemfelkeltés (gondolat-buborék, milestone üzenetek)
    └── Session kezelés (sessionStorage)
         │
         └── fetch('/api/ai/chat') ──► Route Handler (szerveren)
                                        └── API kulcsok .env.local-ból
                                        └── Multi-provider fallback


═══ /admin ════════════════════════════════════════════════════
app/(dashboard)/admin/page.tsx               ← SERVER (isMasterAdmin check)
│
└── <AdminTabs />                            ← CLIENT (5 fül)
    │
    ├── [Áttekintés fül]
    │   └── <OverviewTab />                  ← KPI kártyák + egyházmegye + top gyülekezetek + minőség
    │
    ├── [Gyülekezetek fül]
    │   └── <CongregationsTab />             ← Lista + szűrés + Admin Override
    │       └── <CongregationDetailsDialog /> ← modal: tagok + pénzügy
    │
    ├── [Felhasználók fül]
    │   └── <UsersTab />                     ← Függő (jóváhagyás) + Aktív (szerepkör)
    │
    ├── [Támogatás fül]
    │   └── <SupportTab />                   ← Jegy lista
    │       └── <SupportReplyDialog />       ← modal: válasz + lezárás
    │
    └── [Import fül]
        └── <ImportTab />                    ← 4 alfül (bevétel, munkanapló, keresztelés, iktatás)


═══ /api/ai/chat (Route Handler) ══════════════════════════════
app/api/ai/chat/route.ts                     ← SERVER (API kulcsok szerveren)
    └── POST: message + history → multi-provider fallback → válasz
```

### Server vs Client

| Komponens | Típus | Indoklás |
|-----------|:-----:|---------|
| `layout.tsx` (módosítás) | **Server** | AI widget beágyazás |
| `AiChatWidget` | **Client** | Interaktív chat, sessionStorage, fetch API |
| `route.ts` (AI) | **Server** | API kulcsok .env.local-ból, NEM kliens |
| `admin/page.tsx` | **Server** | isMasterAdmin check |
| Admin minden fül + modal | **Client** | CRUD, szűrés, jóváhagyás |

---

## 2. Oldal struktúra

### AI widget (overlay — minden oldalon)

```
┌─────────────────────────────────────────────────────────────┐
│  [Bármely oldal tartalma]                                   │
│                                                             │
│                                                             │
│                                          ┌────────────────┐ │
│                                          │ 💬 Aladár      │ │
│                                          │ ──────────     │ │
│                                          │ 🤖 Üdvözlöm!  │ │
│                                          │    Miben segít │ │
│                                          │    hetek?      │ │
│                                          │                │ │
│                                          │ 👤 Hogyan röz. │ │
│                                          │    zítsek bev. │ │
│                                          │                │ │
│                                          │ 🤖 A Pénzügy  │ │
│                                          │    oldalon...  │ │
│                                          │ ──────────     │ │
│                                          │ [Kérdés____]📤 │ │
│                                          └────────────────┘ │
│                                                    [💬]     │ ← buborék ikon
└─────────────────────────────────────────────────────────────┘
```

### Admin Panel layout

```
┌──────────────────────────────────────────────────────────────┐
│  ⚙️ Rendszergazda Panel                                     │
├──────────────────────────────────────────────────────────────┤
│  Áttekintés │ Gyülekezetek │ Felhasználók │ Támogatás │ Import│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 42       │ │ 38       │ │ 12.450   │ │ 5        │       │
│  │gyülekezet│ │felh.     │ │tag       │ │jegy      │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│  Egyházmegyei megoszlás:                                    │
│  ├── Kolozs-Kalotaszegi  │ 8 gyülekezet │ 2.340 tag        │
│  ├── Marosi              │ 6 gyülekezet │ 1.890 tag        │
│  └── ...                                                    │
│                                                              │
│  Top 10 gyülekezet (tagszám):                               │
│  1. Kolozsvár         │ 650 tag                             │
│  2. Marosvásárhely    │ 420 tag                             │
│  ...                                                        │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. State kezelés

### AiChatWidget (Client)

```
isOpen:               boolean              ← chat ablak nyitva/zárva
isLoading:            boolean              ← API kérés folyamatban
conversationHistory:  { role, content }[]  ← max 10 üzenet
pastorFirstName:      string               ← sessionStorage-ból vagy API-ból
lastSentTime:         number               ← rate limit timestamp
hasGreeted:           boolean              ← első üdvözlés megtörtént
```

A `conversationHistory` **sessionStorage**-ban perzisztál (oldal-navigálásnál megmarad, fül bezárásnál elvész).

### AdminTabs (Client)

```
activeTab:            string               ← 'overview'|'congregations'|'users'|'support'|'import'
// Overview
overview:             { congregations, users, members, tickets, dioceses } | null
qualityResults:       QualityResult[] | null
// Congregations
congregations:        Congregation[]
congFilter:           { search, diocese, sort }
detailsOpen:          boolean
selectedCongId:       number | null
// Users
pendingUsers:         Profile[]
activeUsers:          Profile[]
// Support
tickets:              SupportMessage[]
replyOpen:            boolean
selectedTicket:       SupportMessage | null
```

Nincs globális state — minden az `AdminTabs`-ban vagy az egyes fülekben lokálisan.

---

## 4. API hívások

### AI Chat

| Művelet | Típus | Endpoint | Mikor |
|---------|-------|----------|-------|
| Üzenet küldés | `fetch` (kliens) | `POST /api/ai/chat` | Chat submit |

A Route Handler szerveren:
1. Auth check (`getUser()`)
2. System prompt összeállítás
3. Fallback lánc: OpenRouter (3 modell) → Groq (2) → Gemini (2)
4. Return: `{ reply: string }` vagy `{ error: string }`

### Admin Panel

| Művelet | Server Action | Mikor |
|---------|--------------|-------|
| Áttekintés | `getAdminOverview()` | Mount |
| Gyülekezetek | `getCongregations()` | Fül váltás |
| Gyülekezet részletek | `getCongregationDetails(id)` | Modal megnyitás |
| Admin Override | `enterCongregation(id)` | Gomb |
| Felhasználók | `getAllUsers()` | Fül váltás |
| Jóváhagyás | `approveUser(userId, dioceseId)` | Gomb |
| Szerepkör | `saveUserRole(userId, role)` | Dropdown change |
| Támogatás | `getSupportTickets()` | Fül váltás |
| Válasz | `sendSupportReply(ticketId, text)` | Submit |
| Lezárás | `closeSupportTicket(ticketId)` | Gomb |
| Minőség | `runQualityCheck()` | Gomb |
| Import | `importIncome(congId, rows)` / `importWorklog(...)` / `importBaptism(...)` / `importFiling(...)` | Gomb |

### Adatfolyam

```
KLIENS (AiChatWidget)                   SZERVER
━━━━━━━━━━━━━━━━━━━━                   ━━━━━━━━━━━━━━━━━━
                                        
 fetch POST /api/ai/chat ──────────────► route.ts
   { message, history }                    │
                                           ├── OPENROUTER_API_KEY → OpenRouter API
                                           ├── GROQ_API_KEY → Groq API (fallback)
                                           └── GEMINI_API_KEY → Gemini API (fallback)
                                           │
   { reply } ◄─────────────────────────────┘


KLIENS (AdminTabs)                      SZERVER
━━━━━━━━━━━━━━━━━━                     ━━━━━━━━━━━━━━━━━━

 Server Action: getAdminOverview() ────► isMasterAdmin check → 5× query
   { overview } ◄──────────────────────┘

 Server Action: approveUser() ─────────► isMasterAdmin check → INSERT/UPDATE
   { success } ◄──────────────────────┘
```

---

## 5. Auth kezelés

### AI Widget — Route Handler

```
1. Kliens: fetch('/api/ai/chat', { body: { message, history } })
2. Route Handler:
   └── createClient() → getUser() → ha nincs user → 401
   └── process.env.OPENROUTER_API_KEY / GROQ / GEMINI
   └── A kliens SOHA nem látja az API kulcsokat
```

### Admin Panel — Master Admin Only

```
1. page.tsx (Server Component):
   └── getUser() → email
   └── isMasterAdmin(email) → ha NEM → redirect /dashboard
2. Server Actions:
   └── MINDEN action-ben: isMasterAdmin(email) check
   └── Ha nem Master Admin → { error: 'Nincs jogosultsága' }
3. Sidebar:
   └── Az „Admin Panel" menüpont CSAK isMasterAdmin-nak jelenik meg (Fázis 1-ben már implementálva)
```

### Admin Override (belépés más gyülekezetbe)

```
1. enterCongregation(congId):
   └── isMasterAdmin check
   └── INSERT admin_access_requests (status: 'approved', expires_at: +24h)
   └── A layout.tsx már kezeli az override bannert (Fázis 1-ben implementálva)
```

---

## 6. Validáció elhelyezése

### AI

| Réteg | Mit | Hogyan |
|-------|-----|--------|
| **Kliens** | Üres üzenet | Küldés gomb letiltva ha üres |
| **Kliens** | Rate limit | `lastSentTime + 2500ms` check |
| **Szerver** | Auth | `getUser()` → 401 ha nincs |
| **Szerver** | API kulcs létezés | Ha nincs kulcs → skip szolgáltató |

### Admin

| Réteg | Mit | Hogyan |
|-------|-----|--------|
| **Kliens** | Jóváhagyás: egyházmegye kötelező | Gomb letiltva ha nincs kiválasztva |
| **Kliens** | Válasz: nem üres szöveg | Gomb letiltva |
| **Kliens** | Import: fájl típus .xlsx | Input accept attribútum |
| **Szerver** | Minden action | `isMasterAdmin(email)` check |
| **Szerver** | Jóváhagyás | Pending user létezik + egyházmegye létezik |
| **Szerver** | Import | Soronkénti validáció (összeg > 0, dátum érvényes, stb.) |

### Üzleti validációk szerveren

| Szabály | Hol | Mi történik |
|---------|-----|-------------|
| AI: minden szolgáltató kimerült | Route Handler | `{ error: "Jelenleg nem tudok válaszolni." }` |
| Admin: nem Master Admin | Minden action | `{ error: "Nincs jogosultsága." }` |
| Jóváhagyás: gyülekezet már létezik | `approveUser` | NEM hoz létre újat → meglévőhöz rendel |
| Import: összeg ≤ 0 | `importIncome` | Sor kihagyás (nem hiba) |
| Import: személy nem párosítható | `importIncome` | `id_szemely = null` (később párosítható) |
| Import: batch hiba | Minden import | Részleges import → hibás batch skip, többi megy |

---

## Összefoglaló: fájlok és felelősségek

```
ADATRÉTEG (2 fájl)
├── lib/constants/ai.ts               ← szolgáltatók, modellek, rate limit, max token
├── lib/constants/admin.ts            ← szerepkörök, import batch, minőség mezők

SZERVER RÉTEG (4 fájl)
├── app/api/ai/chat/route.ts          ← Route Handler: API kulcsok szerveren, fallback lánc
├── app/(dashboard)/admin/
│   ├── page.tsx                      ← Server: isMasterAdmin check
│   ├── actions.ts                    ← overview, congregations, users, support, quality
│   └── import-actions.ts            ← 4 import típus + személypárosítás

MEGJELENÍTÉSI RÉTEG (7 fájl)
├── components/ai/
│   └── ai-chat-widget.tsx            ← Teljes widget (buborék + chat + session + markdown)
├── components/admin/
│   ├── admin-tabs.tsx               ← 5 fül orchestrátor
│   ├── overview-tab.tsx             ← KPI + egyházmegye + top + minőség
│   ├── congregations-tab.tsx        ← Lista + szűrés + Override
│   ├── users-tab.tsx                ← Függő + aktív + szerepkör
│   ├── support-tab.tsx              ← Jegyek
│   └── import-tab.tsx               ← 4 import alfül

MODAL RÉTEG (2 fájl)
├── components/modals/
│   ├── congregation-details-dialog.tsx ← Tagok + pénzügy
│   └── support-reply-dialog.tsx       ← Jegy válasz + lezárás

MÓDOSÍTOTT (1 fájl)
├── app/(dashboard)/layout.tsx         ← AI widget integráció
```
