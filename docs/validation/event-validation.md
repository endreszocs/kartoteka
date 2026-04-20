# Fázis 8 — Aladár AI + Admin Panel — Validáció

**Dátum:** 2026-04-06
**Forrásdokumentumok:**
- `migration-docs/rules/ai-assistant-admin-panel-rules.md`
- `migration-docs/workflows/ai-assistant-admin-panel-flow.md`
- `migration-docs/modules/ai-assistant-admin-panel.md`

---

## 1. Hiányzó funkciók

### 1.1 ALADÁR AI — KRITIKUS

| # | Hiányzó funkció | Forrás (rules/flow) | Hatás |
|---|-----------------|---------------------|-------|
| H1 | **Kérdés osztályozás (classifyQuestion)** — üdvözlés/rendszer/off-topic szétválasztás | Rules §2 „Kérdés osztályozás", Flow 2 B.1/B.2/B.3 | Üdvözlés (pl. „Szia") is az API-hoz megy, felesleges API hívás + lassabb válasz. A spec szerint üdvözlésre helyi válasz kell API nélkül. |
| H2 | **Figyelemfelkeltés rendszer** — 3 perc inaktivitás gondolat-buborék, 1h/2h mérföldkő üzenetek | Rules §2 „Figyelemfelkeltés", Flow 3 teljes egészében | A felhasználó nem kap proaktív segítséget. A spec 4 triggers-t ír: 3 perc, 10 mp üdvözlés, 1h, 2h. |
| H3 | **API kulcs ellenőrzés — widget elrejtés** — ha nincs egyetlen konfigurált API kulcs sem, a widget NEM jelenik meg | Rules §6 edge case #1, Flow 1 döntési pont | A widget mindig megjelenik, de ha nincs kulcs, a felhasználó hibaüzenetet kap válasz helyett. |
| H4 | **10 mp üdvözlő üzenet** — első oldal betöltés után 10 mp → „Üdvözlöm, {Lelkész neve}!" | Flow 1 lépés 4 | A lelkész nem kap proaktív köszöntést. |
| H5 | **Rate limit „Kérem várjon..." figyelmeztetés** — UI feedback a rate limit alatt | Flow 2 A) döntési pont | A küldés gomb letiltódik, de nincs szöveges visszajelzés. |

### 1.2 ADMIN PANEL — KRITIKUS

| # | Hiányzó funkció | Forrás | Hatás |
|---|-----------------|--------|-------|
| H6 | **Sürgős teendők szekció** az Áttekintés fülön | Flow 4 lépés 5 (3. pont) | A Master Admin nem látja a teendőket egy helyen. |
| H7 | **Rendszerállapot szekció** az Áttekintés fülön | Flow 4 lépés 5 (5. pont) | Nincs rendszerállapot kijelzés (DB méret, utolsó backup, stb.). |
| H8 | **Nem Master Admin → hiba képernyő** — a page.tsx `redirect('/dashboard')`-et csinál, nem hibaoldalt mutat | Flow 4 döntési pont, Rules §1 | Csendben átirányít — a felhasználó nem érti miért. A spec „Nincs jogosultsága" hiba képernyőt ír. |
| H9 | **Tömeges import — teljes implementáció** — 4 típus (bevétel, munkanapló, keresztelés, iktatás) mind placeholder | Flow 10, 11, 12 + Rules §3 import validációk | Az Import fül jelenleg nem működik. Placeholder szöveg van. |

### 1.3 ADMIN PANEL — KÖZEPES

| # | Hiányzó funkció | Forrás | Hatás |
|---|-----------------|--------|-------|
| H10 | **Hozzáférés kérelem rendszer** — nem-admin felhasználók kérhetik a gyülekezet hozzáférését | Modules §2.2 „Hozzáférés kérelem" | Csak admin override van, a normál hozzáférés kérelem nem. (Megjegyzés: ez a notifications modulban van részben.) |

---

## 2. Nem implementált szabályok

| # | Szabály | Forrás | Implementáció állapota |
|---|---------|--------|----------------------|
| SZ1 | **Üdvözlés → helyi válasz, NEM hív API-t** | Rules §2 „Kérdés osztályozás", Flow 2 B.1 | Hiányzik — minden kérdés az API-hoz megy |
| SZ2 | **Figyelemfelkeltés óránként egyszer** (localStorage rate limit) | Rules §2 „Figyelemfelkeltés" utolsó pont | A figyelemfelkeltés rendszer teljes egészében hiányzik |
| SZ3 | **Ha a chat nyitva van → figyelemfelkeltés NEM jelenik meg** | Flow 3 döntési pont | Hiányzik (maga a figyelemfelkeltés hiányzik) |
| SZ4 | **Lezárt jegy NEM nyitható újra** | Rules §4, Rules §6 „Támogatás" | A support-tab.tsx-ben nincs explicit védelem — a lezárt jegyeknél nem jelenik meg a válasz form (UI szinten jó), de a `replySupportTicket` szerver action-ben nincs `status !== 'closed'` ellenőrzés |
| SZ5 | **Jóváhagyás egyirányú** (pending → active, nem visszafordítható) | Rules §4 | Nincs explicit védelem az action-ben — az `approveUser` nem ellenőrzi, hogy a user státusza `pending`-e |
| SZ6 | **Szerepkör módosítás: felhasználó aktív státuszú kell legyen** | Rules §3 „Szerepkör módosítás" | Az `updateUserRole` action-ben van `.eq('status', 'active')` — RENDBEN |

---

## 3. Lehetséges bugok

| # | Bug leírás | Fájl:sor | Hatás | Súlyosság |
|---|-----------|----------|-------|-----------|
| B1 | **`approveUser` nem ellenőrzi a user jelenlegi státuszát** — ha kétszer hívják meg (pl. dupla kattintás), a gyülekezet létrehozás duplán futhat | [actions.ts](app/(dashboard)/admin/actions.ts) `approveUser()` | Dupla gyülekezet létrehozás lehetséges | Közepes |
| B2 | **`replySupportTicket` nem ellenőrzi, hogy a jegy `closed` státuszú-e** — programmatikusan hívható lezárt jegyre is | [actions.ts](app/(dashboard)/admin/actions.ts) `replySupportTicket()` | Lezárt jegyre is érkezhet válasz (sérül a rules §4 szabály) | Közepes |
| B3 | **`getCongregationDetails` — `memberCount` a limit 100 miatt hibás** — a query `.limit(100)`, de a `memberCount` a `members.length`-ből jön, tehát max 100-at mutat | [actions.ts](app/(dashboard)/admin/actions.ts) `getCongregationDetails()` | 100+ tagos gyülekezeteknél pontatlan szám | Közepes |
| B4 | **`getAdminOverview` — `dioceseStats` tagszám lekérdezés N+1 probléma + `.in()` limitáció** — ha egy egyházmegyében sok gyülekezet van, az `.in()` query túl hosszú lehet | [actions.ts](app/(dashboard)/admin/actions.ts) `getAdminOverview()` | Lassú betöltés sok egyházmegyénél, esetleg Supabase query limit | Alacsony |
| B5 | **`enterCongregation` — nem frissíti a profil `congregation_id`-t** — csak `admin_access_requests`-be ír, a layout az override-ot keresi, de a modulok a `profile.congregation_id`-t használják | [actions.ts](app/(dashboard)/admin/actions.ts) `enterCongregation()` | Az override banner megjelenik, de a modulok a saját gyülekezet adatait mutatják (nem a cél gyülekezetét) — ez függ a layout implementációtól | Magas |
| B6 | **`selectedDiocese` állapot megosztott a pending felhasználók között** — ha a Master Admin megnyitja az egyik user jóváhagyását, kiválaszt egyházmegyét, bezárja, megnyit egy másikat, az egyházmegye megmarad | [users-tab.tsx](components/admin/users-tab.tsx):46-47 | Téves egyházmegye a másik felhasználónak | Alacsony |
| B7 | **AI chat widget — `dangerouslySetInnerHTML` XSS kockázat** — a `mdToHtml` a válaszból HTML-t generál, de az AI válasza tartalmazhat `<script>` taget vagy onEvent attribútumokat | [ai-chat-widget.tsx](components/ai/ai-chat-widget.tsx):126 | XSS injection lehetőség az AI válaszon keresztül — bár a kockázat alacsony (az AI provider szűri), de nem nulla | Közepes |
| B8 | **Gyülekezet részletek modal — `details` state nem törlődik másik gyülekezet megnyitásakor** — ha az előző gyülekezet adatai betöltődtek, az új kattintáskor azokat mutatja a loading alatt | [congregations-tab.tsx](components/admin/congregations-tab.tsx):49-58 | Az előző gyülekezet adatai villannak a loading előtt | Alacsony |

---

## 4. Edge case hiányok

| # | Edge case (spec-ből) | Elvárt viselkedés | Implementáció állapota |
|---|---------------------|-------------------|----------------------|
| E1 | **Nincs egyetlen API kulcs sem konfigurálva** | Az AI widget NEM jelenik meg | Hiányzik — a widget mindig megjelenik |
| E2 | **Minden szolgáltató rate limit-be ütközik** | „Jelenleg nem tudok válaszolni. Kérem, próbálja néhány perc múlva." | Implementálva — route.ts 503 válasz |
| E3 | **A felhasználó gyorsan egymás után küld üzeneteket** | Rate limit: küldés gomb letiltódik 2.5 mp-re | Implementálva — de a „Kérem várjon..." szöveg hiányzik |
| E4 | **Nagyon hosszú kérdés (>500 karakter)** | A rendszer elküldi, de a kontextus ablak szűkül | Nincs explicit kezelés (a kontextus max 10 üzenet OK, de nincs karakter limit figyelmeztetés) |
| E5 | **A lelkész neve nem lekérdezhető** | Üdvözlés név nélkül: „Jó napot kívánok!" | Implementálva — route.ts firstName fallback üres string → system prompt név nélkül |
| E6 | **Jóváhagyás: a gyülekezet már létezik** | NEM hoz létre új gyülekezetet | Implementálva — `ilike` keresés az `approveUser`-ben |
| E7 | **Szerepkör módosítás: a felhasználó éppen be van jelentkezve** | A változás a következő oldalbetöltésnél érvényesül | Implementálva — a `revalidatePath` nem frissíti más felhasználó sessionjét |
| E8 | **Támogatás: üres válasz** | Validáció blokkolja | Implementálva — `replySupportTicket` ellenőrzi |
| E9 | **Adatminőség: nincs egyetlen hiba sem** | „Gratulálunk! Minden rendben!" | Implementálva — overview-tab.tsx |
| E10 | **Adatminőség: gyülekezet tagok nélkül** | Nem jelenik meg a listában | Implementálva — `if (!members \|\| members.length === 0) continue` |
| E11 | **Import: nem xlsx formátum** | Hiba: „Nem támogatott fájlformátum" | Hiányzik — az import placeholder |
| E12 | **Import: 1000+ rekord — 100-as batch + progress** | Progress jelzés | Hiányzik — az import placeholder |
| E13 | **Import: adatbázis hiba egy batch-nél** | Részleges import (többi batch OK) | Hiányzik — az import placeholder |

---

## 5. Összesítés

| Kategória | Kritikus | Közepes | Alacsony | Összesen |
|-----------|:--------:|:-------:|:--------:|:--------:|
| Hiányzó funkciók | 5 (H1-H5) | 4 (H6-H9) | 1 (H10) | **10** |
| Nem implementált szabályok | 3 (SZ1-SZ3) | 1 (SZ4) | — | **4** |
| Lehetséges bugok | 1 (B5) | 3 (B1,B2,B3) | 4 (B4,B6,B7,B8) | **8** |
| Edge case hiányok | 1 (E1) | 1 (E3) | 3 (E11-E13) | **5** |
| **Összesen** | **10** | **9** | **8** | **27** |

---

## 6. Prioritási javaslat javításhoz

### Azonnali javítás (Sprint 1 hiányok — AI widget)
1. **H1** — `classifyQuestion()` implementálás (üdvözlés/rendszer/off-topic)
2. **H3** — API kulcs ellenőrzés → widget elrejtés ha nincs kulcs
3. **B7** — XSS védelem a `mdToHtml`-ben (HTML entity escape az AI válaszban)
4. **H5** — Rate limit vizuális feedback

### Közepes prioritás
5. **B5** — `enterCongregation` override logika ellenőrzés (függ a layout-tól)
6. **B1** — `approveUser` dupla-kattintás védelem (status check)
7. **B2** — `replySupportTicket` closed check
8. **B3** — `getCongregationDetails` memberCount külön count query
9. **H6/H7** — Sürgős teendők + rendszerállapot szekciók
10. **B8** — Details state reset másik gyülekezet megnyitásakor

### Későbbi fázis (Fázis 9)
11. **H2/H4** — Figyelemfelkeltés rendszer (3 perc, 10 mp, 1h, 2h)
12. **H9** — Tömeges import teljes implementáció (4 típus)
13. **H8** — Hiba képernyő redirect helyett

---

## 7. Megjegyzések

- Az **Import fül** (H9) tudatosan placeholder — a batch Excel import komplex funkció, amit a Fázis 9-ben terveztünk. A 4 típus (bevétel, munkanapló, keresztelés, iktatás) mind SheetJS-t igényel + fuzzy matching + batch processing.
- A **Figyelemfelkeltés** (H2) szintén tudatosan halasztott — elsődlegesen a core AI chat funkcionalitás volt a cél.
- Az **AI kérdés osztályozás** (H1) a legfontosabb hiányzó logika, mert felesleges API hívásokat okoz üdvözlésnél.
- A **B5 (enterCongregation)** csak akkor bug, ha a dashboard layout a `profile.congregation_id`-t használja és nem az `admin_access_requests`-t ellenőrzi — ez a korábbi fázisban implementált override logikától függ.
