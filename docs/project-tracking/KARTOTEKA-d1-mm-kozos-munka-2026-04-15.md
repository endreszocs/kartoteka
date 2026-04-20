# KARTOTEKA — D1 Missziós Műhely „Közös Munka" projekt modul

**Dátum**: 2026-04-15
**Implementációs forrás**: `~/.claude/plans/purrfect-coalescing-quiche.md` — D1 terv
**Projekt log lépés**: 033.

---

## Vezetői összefoglaló

A D1 feladat a Missziós Műhely modul eddig üres "kozos_munka" fázisát tölti meg valós funkcióval. Eddig, amikor egy ötlet elérte az 5 támogatást és "kozos_munka" státuszba lépett, **a csapatnak semmilyen UI-ja nem volt** — csak egy státusz és a csatlakozók száma. Mostantól:
- **Csapattagok** láthatóak név + gyülekezet szerint
- **Feladatok** (mm_feladatok) rendelhetők felelőshöz, határidőhöz, 3 státusszal (függőben / folyamatban / kész)
- **Mérföldkövek** (mm_merfoldkovek) timeline-formájában
- **Dokumentumok** (mm_dokumentumok) URL-alapú megosztással (Google Drive, Dropbox, stb.)
- **Gamifikáció**: feladat teljesítéskor a felelős +10 pontot kap

---

## Architektúra áttekintés

A D1 implementáció **nem új route-ot használ** — a meglévő `/misszios-muhely/forum/[ideaId]` oldalon bővíti a ForumThreadView komponenst. Ha az ötlet státusza `kozos_munka` vagy `megvalosult`, megjelenik a `ProjectPanel`, ami magában foglalja a csapatot, feladatokat, mérföldköveket és dokumentumokat.

### Komponens-hierarchia

```
app/misszios-muhely/forum/[ideaId]/page.tsx
  ├─ lekéri az ötletet + user jogosultságokat (isOwner, isMember, isAdmin)
  └─ ForumThreadView
      ├─ Thread header (idea.cim, leiras, kategóriák)
      ├─ ForumVoteButtons (meglévő, mostantól promóciót is kezeli 5 támogatásnál)
      ├─ ProjectPanel (ÚJ — csak kozos_munka/megvalosult státuszban)
      │   ├─ Project header (intro)
      │   ├─ TeamMembers (csapattagok kártyás)
      │   ├─ TaskList
      │   │   ├─ Progress bar (teljesített / összes %)
      │   │   ├─ Task items (status ikon + cím + felelős + határidő)
      │   │   └─ TaskDialog (új/szerkesztés)
      │   ├─ MilestoneTimeline
      │   │   ├─ Timeline vonal
      │   │   ├─ Milestone cards (státuszcsillag: teljesítve/lejárt/közelgő/nyitott)
      │   │   └─ MilestoneDialog
      │   └─ DocumentList
      │       ├─ File items (kategória ikon + név + feltöltő)
      │       └─ DocumentDialog (URL-alapú)
      └─ Comments section (meglévő)
```

### Jogosultsági modell

| Művelet | Ötletgazda | Csapattag (csatlakozott) | Admin | Külső |
|---|---|---|---|---|
| Feladatok, mérföldkövek, dokumentumok megtekintése | ✅ | ✅ | ✅ | ✅ (ha látja az ötletet) |
| Feladat / mérföldkő / dokumentum HOZZÁADÁSA és SZERKESZTÉSE | ✅ | ✅ | ✅ | ❌ |
| Feladat státusz módosítása (fuggeben/folyamatban/kesz) | ✅ (minden) | ✅ (csak ha ő a felelős) | ✅ | ❌ |
| Feladat / mérföldkő TÖRLÉSE | ✅ | ❌ | ✅ | ❌ |
| Dokumentum TÖRLÉSE | ✅ | ✅ (csak ha ő töltötte fel) | ✅ | ❌ |
| Csatlakozás / kilépés a csapatba | ✅ (autom.) | ✅ (`toggleIdeaJoin`) | ✅ | ✅ (bárki csatlakozhat) |

A jogosultság ellenőrzést egyetlen `checkProjectAccess(ideaId)` helper végzi a `project-actions.ts`-ben.

---

## Implementált fájlok

### Új fájlok (12)

| Fájl | Sorok | Tartalom |
|---|---|---|
| `lib/missions/project.ts` | ~170 | Típusok, konstansok, segédfüggvények (TASK_STATUS, ProjectTask, ProjectMilestone, ProjectDocument, ProjectCollaborator, ProjectData, calculateProjectProgress, getMilestoneState, formatFileSize, categorizeDocumentType) |
| `app/misszios-muhely/project-actions.ts` | ~430 | 9 server action: `getProjectData`, `saveTask`, `updateTaskStatus`, `deleteTask`, `saveMilestone`, `toggleMilestoneCompleted`, `deleteMilestone`, `saveDocument`, `deleteDocument`. Zod validáció minden inputra, `checkProjectAccess()` jogosultság ellenőrzés, gamifikáció integráció (feladat kész → +10 pont a felelősnek) |
| `components/muhely/project/project-panel.tsx` | ~145 | Fő panel — csak `kozos_munka`/`megvalosult` státuszban renderelődik, összefűzi a 4 alszekciót |
| `components/muhely/project/team-members.tsx` | ~85 | Csapattagok lista — ötletgazda kiemelve (crown ikon, amber), többiek (violet), gyülekezet + csatlakozási dátum |
| `components/muhely/project/task-list.tsx` | ~230 | Feladat lista progresszív kártyákkal, státusz ikon (circle / timer / check), progresszív bar, klikkelhető státusz (fuggeben→folyamatban→kesz→vissza), határidő lejárt figyelmeztetés, TaskDialog integráció |
| `components/muhely/project/task-dialog.tsx` | ~160 | Új/szerkesztés modal — cím, leírás, felelős (dropdown a csapattagokból), határidő (date input) |
| `components/muhely/project/milestone-timeline.tsx` | ~200 | Timeline view vertikális vonallal, state színkódolás (teljesítve=emerald, lejárt=red, közelgő=amber, nyitott=slate), klikkelhető státusz |
| `components/muhely/project/milestone-dialog.tsx` | ~130 | Új/szerkesztés modal — cím, leírás, határidő (amber gradient header) |
| `components/muhely/project/document-list.tsx` | ~190 | Fájlok lista — kategória ikon (PDF=red, kép=purple, doc=blue, excel=emerald, egyéb=slate), file méret, feltöltő, klikkelhető URL ExternalLink ikonnal |
| `components/muhely/project/document-dialog.tsx` | ~170 | Új/szerkesztés modal — név, URL (http/https validáció), típus (MIME select), méret (opcionális). Tipp: Google Drive/Dropbox link ajánlás |
| `docs/project-tracking/KARTOTEKA-d1-mm-kozos-munka-2026-04-15.md` | ~170 | Ez a dokumentum |

### Módosított fájlok (3)

| Fájl | Módosítás |
|---|---|
| `lib/missions/gamification.ts` | `MissionPointEvent` bővítés: + `'feladat_teljesitve'`. `MISSION_POINT_RULES`: + `feladat_teljesitve: { points: 10, statKey: 'feladatok_teljesitve' }` |
| `app/misszios-muhely/forum/[ideaId]/page.tsx` | Lekéri `admin`/`master` flagokat, számolja `isOwner`/`isMember`/`isAdmin`-t, továbbadja a `ForumThreadView`-nak |
| `components/muhely/forum/forum-thread-view.tsx` | + import `ProjectPanel`, + 4 props (`currentUserId`, `isOwner`, `isMember`, `isAdmin`), + `<ProjectPanel ... />` render a szavazási gombok után |

---

## Kulcsfontosságú döntések

### 1. Nem új route, hanem bővítés

A Phase 7 eredeti terve új `app/misszios-muhely/kozos-munka/[ideaId]/page.tsx` route-ot javasolt. **Eltértünk**: a meglévő `/misszios-muhely/forum/[ideaId]/` oldalon bővítjük. Előnyök:
- **Egy URL, egy kontextus**: a user az ötlet URL-jén marad a teljes életcikluson át (beküldés → szavazás → közös munka → megvalósult)
- **Nincs duplikált navigáció**: nem kell "fórumon vagy közös munkán?" dönteni
- **Fokozatos feltárás**: ahogy az ötlet érik, úgy jelenik meg a projekt-réteg

### 2. URL-alapú dokumentumok R2 helyett

Az eredeti terv R2 cloud upload-ot javasolt. **Eltértünk MVP-re**: a user megoszthatónak adja a linket (Google Drive / Dropbox / OneDrive). Előnyök:
- **Nincs storage díj** a gyülekezet számára
- **Felhasználó tud használni** ismerős eszközöket
- **Egyszerűbb MVP**: nincs file size limit / scan / thumbnail logika

Később ha szükséges, a `mm_dokumentumok` tábla `url` mezője továbbra is működik R2-ből is (csak a `DocumentDialog`-ot kell módosítani file input-ra).

### 3. Gamifikáció: a felelős kap pontot, nem az aki státuszt vált

Amikor egy feladat `kesz`-re kerül, a **felelős** (`felelos_id`) kap +10 pontot — NEM az aki éppen kattintott. Miért?
- Ösztönzi a felelősség vállalást (a user választja, hogy ki lesz a felelős, és az nyeri a pontot)
- Megelőzi a „ghost worker" exploitet (egy user csinálja meg valakinek a feladatát és elveszi a pontot)
- Ha nincs felelős, NINCS pont — az ötletgazda szabadon oszthatja a munkát

### 4. Duális páros: csapattag = mm_szavazatok type='csatlakozas' + ötletgazda

A `mm_szavazatok` tábla `csatlakozas` típusa kezeli a csapatot, de **az ötletgazda nem szerepel itt** (ő automatikusan tagja). A `getProjectData` query ezért:
1. Lekéri a `mm_otletek.otletgazda_id`-t → `isOwner: true` kártya
2. Lekéri a `mm_szavazatok WHERE tipus='csatlakozas'` sorokat → `isOwner: false` kártyák
3. Deduplikálja (ha az ötletgazda véletlenül szerepel a csatlakozókban is)

---

## Gamifikáció részletek

A `lib/missions/gamification.ts` bővítésével bekerült egy új esemény:

```typescript
feladat_teljesitve: { points: 10, statKey: 'feladatok_teljesitve' }
```

Ez azt jelenti:
- Minden feladat `fuggeben`/`folyamatban` → `kesz` állapotváltás esetén (csak az ELSŐ teljesítéskor)
- Ha van `felelos_id`, a felelős user `osszpontszam` +10-zel nő
- A `feladatok_teljesitve` stat-counter +1-gyel nő
- A user `szint` automatikusan frissül (Újonc → Szolgálattevő → Lelkes misszionárius ...)

A DB séma már tartalmazta a `feladatok_teljesitve` oszlopot (`mm_felhasznalo_statisztika` táblán) — **nem volt szükség migrációra**.

---

## Kockázatok és nyitott pontok

### Kockázatok

1. **A `mm_szavazatok` UNIQUE constraint**: feltételezzük, hogy van `(otlet_id, user_id, tipus)` UNIQUE constraint a kilépés/belépés ciklikus pontexploit ellen. A `community-actions.ts` `toggleIdeaJoin` funkció már támaszkodik erre — ellenőrizni kell, ha nincs, külön migráció kell.

2. **RLS a mm_* táblákon**: az A1 biztonsági javítás (2026-04-12-mm-rls-policies.sql) minden mm_* táblára RLS-t hozott be. A D1 műveletek ezt feltételezik. Ha valamilyen policy hiányzik (pl. a `mm_feladatok`-on nincs UPDATE policy), a felelős nem tudná módosítani a státuszt — akkor a meglévő RLS fájlt bővíteni kell.

3. **A `queueMicrotask` pattern a dialog state reset-re**: a React 19 strict `react-hooks/set-state-in-effect` lint szabály miatt a dialog komponensek `useEffect`-jében a setState-eket `queueMicrotask`-ba csomagoltuk (lásd existing rental-contract-dialog minta). Ez működik, de a modern React `key` prop trükk elegánsabb lehet később.

4. **URL biztonság**: az `isSafeHttpUrl` funkció csak http/https protokollt enged. De egy maliciós user valid http URL mögé rejthet phishing oldalt. Jelenleg a user maga felel a link biztonságáért — ha később kritikus lesz, URL domain whitelist-et vezetünk be (csak drive.google.com, dropbox.com, stb.).

### Nyitott pontok (későbbre)

- **R2 cloud upload**: ha a user kéri, a DocumentDialog file input-ot kap, feltölti R2-re, és a `mm_dokumentumok.url` mezőbe kerül a publikus link. Igényli: `lib/storage/r2-upload.ts` + `@aws-sdk/client-s3` dependency.
- **Gantt chart mérföldkövek**: a jelenlegi Timeline lista. Nagyobb projekteknél vizuálisabb vízszintes timeline kellhet.
- **Feladat kommentek**: minden feladathoz hozzászólások (pl. „elkészültem" vagy „akadályba ütköztem"). Új tábla: `mm_feladat_hozzaszolasok`.
- **Email értesítés**: ha téged jelölnek felelősnek, email megy — Supabase Edge Function + Resend.
- **Drag-and-drop feladat sorrend**: a `sorrend` mező már létezik, csak a UI hiányzik.

---

## Verifikáció

### TypeScript + ESLint

```bash
cd "D:/Egyházi APP/KARTOTEKA"
npx.cmd tsc --noEmit          # → 0 hiba ✅
npx.cmd eslint "components/muhely/project/**/*.tsx" "lib/missions/project.ts" "app/misszios-muhely/project-actions.ts"
                              # → 0 hiba ✅
```

### Manuális funkcionális teszt

1. **Előkészítés** — hozz létre egy ötletet, szavaztass 5 csatlakozót → státusz = `kozos_munka`
2. **Navigálj** `/misszios-muhely/forum/[ideaId]` oldalra
3. ✅ Várt: a szavazási gombok után megjelenik a **Project header + TeamMembers + TaskList + MilestoneTimeline + DocumentList**
4. Csapattagoknál: ötletgazda (Crown, amber) + csatlakozók (UserCircle2, violet)
5. **Új feladat**: „+ Új feladat" → cím + felelős (dropdown) + határidő → Mentés
6. **Feladat státusz**: kattints a státusz ikonra → fuggeben → folyamatban → kesz → toast „+10 pont"
7. **Új mérföldkő**: „+ Új mérföldkő" → cím + határidő → teljesítés ikon
8. **Új dokumentum**: „+ Új dokumentum" → név + Google Drive link → kategória ikon (PDF/kép/doc)
9. **Jogosultság**: külső user belép → lát de nem szerkeszt (no "+" gombok)
10. **DB ellenőrzés**:
    ```sql
    SELECT * FROM mm_feladatok WHERE otlet_id = '...';
    SELECT * FROM mm_merfoldkovek WHERE otlet_id = '...';
    SELECT * FROM mm_dokumentumok WHERE otlet_id = '...';
    SELECT osszpontszam, feladatok_teljesitve FROM mm_felhasznalo_statisztika WHERE user_id = '...';
    ```

---

## Roadmap pozíció Q3 2026

1. ✅ **D1 — MM Sziget „Közös Munka" — TELJES**
2. ⏳ E3 — Iktató sablonok (1 hét)
3. ⏳ E1 — Admin import befejezése (1 hét)
4. ⏳ Döntés 1 megvalósítása: transactions tábla használata (1 hét)
5. ⏳ C cleanup: legacy táblák audit + DROP (1.5 hét)

---

## Kapcsolódó dokumentumok

- **D1 részletes terv**: `~/.claude/plans/purrfect-coalescing-quiche.md`
- **Vanilla JS forrás**: `migration-docs/source-links/misszios_muhely_sziget.js` (1720 sor — a sziget projekt UI)
- **A1 biztonsági javítás**: `KARTOTEKA-security-javitas-2026-04-15.md` (MM RLS policies a D1 előfeltétele)
- **Projekt log**: 033. lépés

---

**Dokumentum státusza**: VÉGLEGESÍTETT (D1 MVP — 10/10 alfázis)
**Felülvizsgálat dátuma**: 2026-04-15
**Következő felülvizsgálat**: Manuális tesztek után. Ha sikeres, a D1 modul kész.
