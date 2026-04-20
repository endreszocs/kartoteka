# Sírhelyek + Missziós Műhely + Értesítések — Architektúra terv

**Stack:** Next.js 16 + Supabase + Tailwind CSS 4 + shadcn/ui

---

## 1. Komponensek

### Három önálló terület — két route + egy header-integráció

```
═══ /sirhelyek ════════════════════════════════════════════════
app/(dashboard)/sirhelyek/page.tsx           ← SERVER
│
└── <CemeteryMain />                         ← CLIENT
    ├── Temető dropdown + állapot szűrő + nézet váltó (tábla/kártya)
    ├── Statisztika kártyák (összesen, szabad, foglalt, lejárt)
    ├── Sírhely tábla VAGY kártya grid
    │   └── soronként: bérletek + elhunytak inline
    │
    ├── <CemeteryDialog />                   ← modal: temető CRUD
    ├── <PlotDialog />                       ← modal: sírhely CRUD
    ├── <RentalDialog />                     ← modal: bérlet CRUD (25 éves)
    └── <DeceasedDialog />                   ← modal: elhunyt CRUD


═══ /misszios-muhely ══════════════════════════════════════════
app/(dashboard)/misszios-muhely/page.tsx     ← SERVER
│
└── <MissionTabs />                          ← CLIENT (4 fül)
    │
    ├── [Segédanyagok fül]
    │   ├── Kategória szűrő (chip-ek)
    │   ├── <MaterialsList />                ← anyag kártyák (cím, kategória, ⭐, letöltés szám)
    │   ├── <MaterialUploadDialog />         ← modal: feltöltés (R2 Server Action)
    │   └── <MaterialDetailDialog />         ← modal: részletek + ⭐ értékelés + letöltés
    │
    ├── [Ötletek fül]
    │   ├── Státusz szűrő + kategória szűrő
    │   ├── <IdeasList />                    ← ötlet kártyák (cím, szavazat, státusz badge)
    │   ├── <IdeaWizardDialog />             ← modal: 4 lépéses wizard
    │   └── <IdeaDetailDialog />             ← modal: szavazás + kommentek
    │
    ├── [Közös munka fül]
    │   └── <SharedProjectDialog />          ← modal: feladatok + mérföldkövek + dokumentumok + csapat
    │
    └── [Ranglista fül]
        ├── <Leaderboard />                  ← pont-rangsor táblázat
        └── <BadgesDialog />                 ← modal: jelvények grid + szint progress


═══ Értesítések (header-be integrálva) ════════════════════════
components/layout/header.tsx                  ← MÓDOSÍTOTT
│
└── <NotificationBell />                     ← CLIENT (Supabase Realtime)
    ├── Csengő ikon + olvasatlan badge
    ├── Dropdown lista (utolsó 20)
    └── <NotificationDetailDialog />         ← modal: teljes tartalom + admin gombok
```

### Server vs Client

| Komponens | Típus | Indoklás |
|-----------|:-----:|---------|
| `sirhelyek/page.tsx` | **Server** | congregation_id |
| `misszios-muhely/page.tsx` | **Server** | user profil + kategóriák |
| Minden más | **Client** | Szűrés, CRUD, Realtime, modal-ok |

### shadcn/ui

| shadcn/ui | Hol |
|-----------|-----|
| `Tabs` | Missziós Műhely 4 fül |
| `Dialog` | 11 modal |
| `Card` | Statisztika, anyag, ötlet, jelvény kártyák |
| `Badge` | Állapot, kategória, szint, szavazat, olvasatlan |
| `Button` | CRUD + szavazás + csatlakozás + toggle |
| `Input, Label, Select` | Form mezők |
| `DropdownMenu` | Értesítés dropdown |

---

## 2. Oldal struktúra

### Sírhelyek layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Temető: [Központi ▼]  Állapot: [Minden ▼]  [📋/🃏] [+ Temető] │
├────────────┬────────────┬────────────┬────────────┐              │
│  42 összes │  18 szabad │  20 foglalt│  4 lejárt  │  ← Stat.    │
├────────────┴────────────┴────────────┴────────────┘              │
│  ┌─────────┬───────────┬────────┬──────────────────┬──────────┐ │
│  │ Parcella│ Állapot   │ Bérlő  │ Elhunyt(ak)     │ Művelet  │ │
│  │ A/1/3   │ 🟢 Foglalt│ Nagy J.│ Kovács I. (†2020)│ [✏️][✕] │ │
│  │ B/2/1   │ ⚪ Szabad │ —      │ —               │ [✏️][✕] │ │
│  └─────────┴───────────┴────────┴──────────────────┴──────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Missziós Műhely layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Segédanyagok │ Ötletek │ Közös munka │ Ranglista                │
├──────────────────────────────────────────────────────────────────┤
│  [Hittan] [Családlátogatás] [Ifjúsági] [Zene] ...  ← Kategória │
│                                            [+ Feltöltés]        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ 📄 Igehirdetés│ │ 🎵 Énekfüzet │ │ 📊 Felmérés  │            │
│  │ ⭐⭐⭐⭐☆ 4.2  │ │ ⭐⭐⭐⭐⭐ 4.8│ │ ⭐⭐⭐☆☆ 3.1 │            │
│  │ 📥 42 letölt. │ │ 📥 128 let. │ │ 📥 15 letölt.│            │
│  │ Nt. Kovács J. │ │ Nt. Nagy P. │ │ Nt. Kis M.  │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└──────────────────────────────────────────────────────────────────┘
```

### Értesítés bell (header-ben)

```
┌──── Header ──────────────────────────────────────── 🔔③ ─────┐
│                                                    │          │
│                                           ┌────────▼────────┐│
│                                           │ Értesítések      ││
│                                           │ ────────────     ││
│                                           │ 🟢 Hozzáférés j.││
│                                           │ 🔵 Új regisztr. ││
│                                           │ 🟡 Figyelmeztetés││
│                                           └─────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### Responsive

| Breakpoint | Sírhelyek | Missziós Műhely | Értesítések |
|-----------|-----------|----------------|-------------|
| `lg` | Teljes tábla | 3 oszlop kártya grid | Dropdown |
| `md` | Rejtett oszlopok | 2 oszlop | Dropdown |
| `sm` | Kártya nézet | 1 oszlop | Teljes képernyős lista |

---

## 3. State kezelés

### CemeteryMain

```
cemeteries:         Cemetery[]        ← temetők
plots:              Plot[]            ← sírhelyek (bérlet+elhunyt map-pal)
cemeteryFilter:     string            ← '' | temető ID
statusFilter:       string            ← '' | állapot
viewMode:           'table' | 'cards'
loading:            boolean
// Modal-ok
cemeteryDialogOpen: boolean
plotDialogOpen:     boolean
rentalDialogOpen:   boolean
deceasedDialogOpen: boolean
editItem:           any | null
currentPlotId:      number | null     ← melyik sírhelyhez adunk bérlet/elhunyt
```

Derived: `filteredPlots`, `stats { total, free, occupied, expired }`

### MissionTabs

```
activeTab:          'segedanyagok' | 'otletek' | 'kozos_munka' | 'ranglista'
categories:         Category[]
// Segédanyagok
materials:          Material[]
materialFilter:     string            ← kategória ID
// Ötletek
ideas:              Idea[]
ideaStatusFilter:   string            ← '' | 'uj' | 'szavazas' | 'kozos_munka' | ...
ideaCategoryFilter: string
// Gamifikáció
myStats:            UserStats | null
myBadges:           Badge[]
leaderboard:        LeaderboardEntry[]
// Modal-ok
uploadOpen:         boolean
materialDetailOpen: boolean
ideaWizardOpen:     boolean
ideaDetailOpen:     boolean
sharedProjectOpen:  boolean
badgesOpen:         boolean
selectedMaterial:   Material | null
selectedIdea:       Idea | null
wizardStep:         number            ← 1-4
```

### NotificationBell

```
notifications:      Notification[]    ← utolsó 20 olvasatlan
unreadCount:        number
detailOpen:         boolean
selectedNotif:      Notification | null
realtimeChannel:    RealtimeChannel | null
```

### Nincs globális state

Minden modulo saját lokális state-et kezel. A Missziós Műhely **gyülekezet-független** → nincs `congregation_id` szűrő a state-ben.

---

## 4. API hívások

### Sírhelyek

| Művelet | Server Action | Mikor |
|---------|--------------|-------|
| Temetők betöltés | `getCemeteries()` | Mount |
| Sírhelyek betöltés | `getPlots()` | Mount (bérlet+elhunyt map-pal) |
| Temető CRUD | `saveCemetery()` / `deleteCemetery()` | Submit / törlés |
| Sírhely CRUD | `savePlot()` / `deletePlot()` | Submit / törlés |
| Bérlet CRUD | `saveRental()` / `deleteRental()` | Submit / törlés |
| Elhunyt CRUD | `saveDeceased()` / `deleteDeceased()` | Submit / törlés |

### Missziós Műhely

| Művelet | Server Action | Mikor |
|---------|--------------|-------|
| Kategóriák | `getCategories()` | Mount |
| Anyagok betöltés | `getMaterials()` | Mount / szűrő |
| Anyag feltöltés | `saveMaterial()` + `uploadToR2()` | Submit |
| Anyag értékelés | `rateMaterial(id, score)` | Csillag kattintás |
| Letöltés számláló | `incrementDownload(id)` | Letöltés gomb |
| Ötletek betöltés | `getIdeas()` | Fül váltás |
| Ötlet létrehozás | `saveIdea()` | Wizard submit |
| Szavazás | `toggleVote(ideaId)` | Támogatás gomb |
| Komment | `postComment(ideaId, text)` | Submit |
| Feladat CRUD | `saveTask()` / `toggleTask()` | Közös munka |
| Mérföldkő | `saveMilestone()` / `toggleMilestone()` | Közös munka |
| Dokumentum | `uploadDocument()` | Feltöltés |
| Megvalósult | `markAsRealized(ideaId)` | Gomb |
| Határidő check | `checkDeadlines()` | Mount (automatikus) |
| Ranglista | `getLeaderboard()` | Fül váltás |
| Statisztika | `getUserStats()` | Mount |
| Jelvények | `getBadges()` | Modal megnyitás |
| Pont hozzáadás | `addPoints(event, userId)` | Bármely pont-szerzési esemény |

### Értesítések

| Művelet | Hogyan | Mikor |
|---------|--------|-------|
| Betöltés | Server Action: `loadNotifications()` | Mount |
| Olvasott jelölés | Server Action: `markAsRead(id)` | Kattintás |
| Admin jóváhagyás | Server Action: `approveAdminAccess(notifId)` | Gomb |
| Admin elutasítás | Server Action: `denyAdminAccess(notifId)` | Gomb |
| Realtime | Supabase Realtime subscribe | Mount (kliens-oldali) |

A Realtime **kliens-oldalon** fut (a `createClient()` browser kliensével):
```
supabase.channel('notifications')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ertesitesek', filter: `user_id=eq.${userId}` }, callback)
  .subscribe()
```

### Adatfolyam

```
SZERVER (page.tsx)                         KLIENS
━━━━━━━━━━━━━━━━━                         ━━━━━━━━━━━━━━━━━━━━

 congId / userId ──────────────────────► CemeteryMain / MissionTabs / NotificationBell
                                           │
                                      mount → getCemeteries() / getMaterials() / loadNotifications()
                                           │
          Supabase ◄── Server Action ◄─────┘
               │
               └── data[] ────────────► state (plots / materials / notifications)
                                           │
                                      action → savePlot() / toggleVote() / markAsRead()
                                           │
          Supabase ◄── Server Action ◄─────┘
               │
               └── revalidatePath ──► újratöltés

                                      ═══ ÉRTESÍTÉSEK REALTIME ═══
          Supabase Realtime ──INSERT──► NotificationBell callback
                                           │
                                      toast + badge frissítés (kliens-oldalon)
```

---

## 5. Auth kezelés

### Rétegek

```
1. Middleware → session
2. Layout → getUser() → profil
3. page.tsx:
   └── Sírhelyek: congregation_id prop
   └── Missziós Műhely: userId + userName + congregationName props
4. Server Actions:
   └── Sírhelyek: congregation_id profilból (RLS szűr)
   └── Missziós Műhely: userId profilból (NEM congregation-szűrt!)
   └── R2 feltöltés: secret .env.local-ból (SOHA nem kliens)
   └── Értesítések: userId (saját értesítések)
   └── Admin hozzáférés: a célgyülekezet lelkésze (profil check)
```

### Különleges auth: Missziós Műhely

A Missziós Műhely **NEM** gyülekezet-alapú — minden bejelentkezett felhasználó lát MINDEN anyagot és ötletet. A `congregation_id` szűrő NEM alkalmazódik. Viszont a feltöltőt/szerzőt `userId`-val azonosítjuk (saját anyag/ötlet törlés).

### R2 feltöltés biztonsága

```
RÉGI (kliens-oldali — BIZTONSÁGI KOCKÁZAT):
  window.R2_CONFIG.AUTH_SECRET = 'abc123...'  ← a böngészőben látható!

ÚJ (Server Action — BIZTONSÁGOS):
  .env.local: R2_AUTH_SECRET=abc123...
  Server Action: uploadToR2(formData) → fetch(R2_WORKER_URL, { headers: { Authorization: process.env.R2_AUTH_SECRET } })
```

---

## 6. Validáció elhelyezése

### Zod sémák

**`lib/validations/cemetery.ts`:**

```
cemeterySchema:    { nev: string kötelező }
plotSchema:        { temeto_id: number kötelező, allapot: enum(5) kötelező }
rentalSchema:      { berlo_nev: string kötelező, kezdet: string kötelező, veg: string kötelező }
deceasedSchema:    { nev: string kötelező }
```

**`lib/validations/mission.ts`:**

```
materialSchema:    { cim: string kötelező, file: File kötelező (≤20MB, whitelist) }
ideaSchema:        { cim: string kötelező, leiras: string kötelező, kategoriak: string[] min(1) }
taskSchema:        { cim: string kötelező }
milestoneSchema:   { cim: string kötelező, datum: string kötelező }
```

### Hol fut

| Réteg | Mit | Hogyan |
|-------|-----|--------|
| **Kliens** | Form-ok | State-check (kötelező mezők) → gomb letiltás |
| **Kliens** | Fájl feltöltés | Méret + formátum check (kliens-oldalon azonnal) |
| **Kliens** | Törlés | `confirm()` dialógus |
| **Szerver** | Minden CRUD | Zod `safeParse` |
| **Szerver** | R2 feltöltés | Méret + formátum + secret check |
| **Szerver** | Admin hozzáférés | profil check (célgyülekezet lelkésze) |
| **DB** | Sírhelyek | RLS `congregation_id` |
| **DB** | Értesítések | RLS `user_id` |

### Üzleti validációk szerveren

| Szabály | Hol | Mi történik |
|---------|-----|-------------|
| R2 fájl ≤ 20 MB | `uploadToR2()` | Error ha túl nagy |
| R2 formátum whitelist | `uploadToR2()` | Error ha nem engedélyezett |
| Értékelés: egy user egy anyagot egyszer | `rateMaterial()` | UPSERT (nem duplikálódik) |
| Szavazat: egy user egy ötletre egyszer | `toggleVote()` | SELECT + INSERT/DELETE |
| Jelvény egyediség | `addPoints()` | SELECT check → INSERT ha nincs |
| Gamifikáció stat auto-create | `addPoints()` | UPSERT ha nincs rekord |
| Szavazás lezárás | `checkDeadlines()` | `szavazas_vege < now` → UPDATE status |

---

## Összefoglaló: fájlok és felelősségek

```
ADATRÉTEG (4 fájl)
├── lib/constants/cemetery.ts         ← 5 állapot, badge színek
├── lib/constants/mission.ts          ← kategóriák, státuszok, pont szabályok, szintek, fájl limitek
├── lib/validations/cemetery.ts       ← Zod: cemetery, plot, rental, deceased
├── lib/validations/mission.ts        ← Zod: material, idea, task, milestone

SZERVER RÉTEG (5 fájl)
├── app/(dashboard)/sirhelyek/
│   ├── page.tsx                      ← Server: congregation_id
│   └── actions.ts                    ← Temető + sírhely + bérlet + elhunyt CRUD, stats
├── app/(dashboard)/misszios-muhely/
│   ├── page.tsx                      ← Server: user profil
│   ├── actions.ts                    ← Anyag + ötlet + szavazás + gamifikáció CRUD
│   └── upload-actions.ts            ← R2 feltöltés (secret szerveren)

MEGJELENÍTÉSI RÉTEG (6 fájl)
├── components/cemetery/
│   └── cemetery-main.tsx             ← Szűrők + stat + tábla/kártya + nézet váltó
├── components/mission/
│   ├── mission-tabs.tsx              ← 4 fül orchestrátor
│   ├── materials-list.tsx           ← Anyag kártyák (⭐ + letöltés)
│   ├── ideas-list.tsx               ← Ötlet kártyák (szavazat + státusz)
│   └── leaderboard.tsx              ← Pont-rangsor
├── components/layout/
│   └── notification-bell.tsx         ← Csengő + Realtime + dropdown

MODAL RÉTEG (11 fájl)
├── components/modals/
│   ├── cemetery-dialog.tsx           ← Temető CRUD
│   ├── plot-dialog.tsx               ← Sírhely + állapot
│   ├── rental-dialog.tsx             ← Bérlet (25 éves)
│   ├── deceased-dialog.tsx           ← Elhunyt
│   ├── material-upload-dialog.tsx    ← Feltöltés (R2 Server Action)
│   ├── material-detail-dialog.tsx    ← Részletek + ⭐ értékelés
│   ├── idea-wizard-dialog.tsx        ← 4 lépéses wizard
│   ├── idea-detail-dialog.tsx        ← Szavazás + komment
│   ├── shared-project-dialog.tsx     ← Feladatok + mérföldkövek + docs
│   ├── badges-dialog.tsx             ← Jelvények + szint progress
│   └── notification-detail-dialog.tsx← Értesítés + admin gombok

MÓDOSÍTOTT (1 fájl)
├── components/layout/header.tsx      ← NotificationBell integráció
```
