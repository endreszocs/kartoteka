# Aladár AI Asszisztens + Admin Panel — Elemzés

**Fázis 8 — két különálló modul**

| Modul | Forrás | Sor | Függvény | Tábla |
|-------|--------|:---:|:--------:|:-----:|
| Aladár AI | `ai_chat.js` + `ai_config.js` | 1156 | 29 | 1 |
| Admin Panel | `admin_api.js` + `superadmin_import_api.js` | 2823 | 68 | 9 |
| **Összesen** | **4 fájl** | **3979** | **97** | **9** |

---

## 1. Modul célja

### Aladár AI Asszisztens
Minden oldalon elérhető AI chat widget, amely a lelkészeknek segít a Kartotéka rendszer használatában. Magyar nyelven válaszol, ismeri a modulokat, a pénzügyi fogalmakat és az egyházi terminológiát. Három AI szolgáltató automatikus fallback rendszerével működik (OpenRouter → Groq → Gemini).

### Admin Panel (Rendszergazda)
A Master Admin (God Mode) számára elérhető rendszerszintű felügyeleti panel: gyülekezetek áttekintése, felhasználói regisztrációk jóváhagyása, szerepkör-kezelés, támogatási jegyek, adatminőség-ellenőrzés és tömeges Excel import (bevétel, munkanapló, keresztelés, iktatás).

---

## 2. Fő funkciók

### 2.1. Aladár AI

- **Chat widget** — fix pozíciójú buborék (jobb alsó sarok), megnyitható/bezárható
- **Magyar nyelv** — a system prompt magyar nyelvű, ismeri az egyházi terminológiát
- **Három AI szolgáltató** fallback rendszerrel:
  - OpenRouter (minimax, stepfun, nemotron — ingyenes modellek)
  - Groq (llama-3.3-70b, llama-3.1-8b)
  - Gemini (gemini-2.0-flash, gemini-1.5-flash)
- **Rate limiting** — 2500ms szünet kérések között
- **Kontextus ablak** — utolsó 10 üzenet
- **Max válasz** — 1800 token
- **Kérdés osztályozás** — üdvözlés / rendszer kérdés / off-topic → okos válaszirányítás
- **Session perzisztencia** — sessionStorage-ban megmarad oldal-navigációnál
- **Figyelemfelkeltés** — 3 perc inaktivitás → gondolat-buborék, 1h/2h mérföldkő üzenetek
- **Markdown renderelés** — vastag, dőlt, kódblokk, lista, sortörés

### 2.2. Admin Panel

#### Áttekintés (Dashboard)
- KPI kártyák: gyülekezetek száma, aktív felhasználók, élő tagok, függő támogatási jegyek
- Egyházmegyénkénti megoszlás (tagszám + gyülekezet szám)
- Sürgős teendők
- Top 10 gyülekezet (tagszám szerint)
- Rendszerállapot

#### Gyülekezet kezelés
- Lista szűréssel (keresés + egyházmegye + rendezés)
- Gyülekezet részletek modal (tagok + pénzügyi összesítés)
- Admin Override: belépés bármely gyülekezetbe (Master Admin jóváhagyás nélkül)
- Hozzáférés kérelem: nem-admin felhasználók kérhetik a hozzáférést

#### Felhasználó kezelés
- Függő regisztrációk listája (jóváhagyásra váró)
- Jóváhagyás: egyházmegye kiválasztás → gyülekezet létrehozás → fiók aktiválás
- Aktív felhasználók: szerepkör módosítás (lelkész/esperes/egyházmegyei_admin/admin)
- Keresés szűrő

#### Támogatási jegyek
- Beérkezett üzenetek listája
- Válasz küldés
- Jegy lezárás/archiválás

#### Adatminőség ellenőrzés
- Hiányzó CNP (személyi szám) felderítés
- Ismeretlen nem (ferfi=null) felderítés
- Hiányzó születési dátum
- Gyülekezetenként bontva + összesítés

#### Tömeges import (4 típus)
- **Bevétel (Kassza):** Excel → befizetes (személy párosítással, kategória kóddal)
- **Munkanapló:** Excel → munkanaplo (hivatalos EREK sablon VAGY egyedi formátum)
- **Keresztelés:** Excel → keresztseg (fuzzy név+dátum párosítás a szemely táblával)
- **Iktatás:** Excel → iktato (iktatószám szétbontás: sorszám/év)
- Mindegyik: 100 rekordos batch INSERT, dátum multi-formátum parsing

---

## 3. Használt adatok

### Aladár AI

| Tábla | Művelet | Megjegyzés |
|-------|---------|-----------|
| `profiles` | SELECT | Lelkész nevének lekérdezése (egyetlen query) |

### Admin Panel

| Tábla | Művelet | Megjegyzés |
|-------|---------|-----------|
| `dioceses` | SELECT | Egyházmegyék listája |
| `congregations` | SELECT, INSERT, UPDATE | Gyülekezetek kezelése |
| `profiles` | SELECT, UPDATE | Felhasználók (szerepkör, státusz, gyülekezet) |
| `szemely` | SELECT | Tagok (KPI-khoz, minőség-ellenőrzéshez, import párosításhoz) |
| `support_messages` | SELECT, INSERT, UPDATE | Támogatási jegyek |
| `admin_access_requests` | SELECT, INSERT, UPDATE | Hozzáférés kérelmek |
| `befizetes` | INSERT | Bevétel import |
| `befizetescel` + `szamadasicel` | SELECT | Bevételi kategória kódok |
| `munkanaplo` | INSERT | Munkanapló import |
| `keresztseg` | INSERT | Keresztelés import |
| `iktato` | INSERT | Iktatás import |
| `ertesitesek` | INSERT | Értesítések küldés (jóváhagyáskor) |

---

## 4. Függvények listája

### Aladár AI (29 db — kulcsok)

| Függvény | Leírás |
|----------|--------|
| `buildSystemPrompt(name)` | Rendszer-prompt generálás (magyar, modul-ismeretek) |
| `callWithFallback(text)` | Multi-provider fallback (OpenRouter → Groq → Gemini) |
| `classifyQuestion(text)` | Kérdés osztályozás (üdvözlés/rendszer/off-topic) |
| `sendMessage()` | Üzenet küldés (rate limit + fallback + DOM frissítés) |
| `saveSession()` / `loadSession()` | sessionStorage perzisztencia |
| `showAttentionAnimation()` | Figyelemfelkeltés (3 perc inaktivitás) |
| `mdToHtml(text)` | Markdown → HTML konverzió |

### Admin Panel (68 db — kulcsok)

| Kategória | Függvények |
|-----------|-----------|
| Biztonság | `adminSecurityCheck()` — masterAdmin email ellenőrzés |
| Áttekintés | `loadAdminOverview()`, `renderOverviewDioceses()`, `renderSystemStatus()` |
| Gyülekezet | `loadCongregations()`, `filterCongregations()`, `openCongDetails()`, `enterCongregation()` |
| Felhasználó | `loadAllUsers()`, `approveUser()`, `saveUserRole()`, `filterUsers()` |
| Támogatás | `openSupportReply()`, `sendSupportReply()`, `closeSupportTicket()` |
| Minőség | `runQualityCheck()` — CNP/nem/dátum hiány felderítés |
| Import | `handleBevExcel()`, `executeBevImport()`, `handleMnExcel()`, `executeMnImport()`, `handleKeresztsegExcel()`, `runPersonMatching()`, `executeKeresztsegImport()`, `handleIktatoExcel()`, `executeIktatoImport()` |

---

## 5. Függőségek

| Könyvtár/Szolgáltatás | Modul | Használat |
|----------------------|-------|-----------|
| **OpenRouter API** | AI | `https://openrouter.ai/api/v1/chat/completions` |
| **Groq API** | AI | `https://api.groq.com/openai/v1/chat/completions` |
| **Gemini API** | AI | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |
| **SheetJS (xlsx)** | Admin Import | Excel parsing |
| **Supabase Realtime** | Admin | Hozzáférés kérelem figyelés |

---

## 6. Állapotkezelés

### AI
| Változó | Tartalom |
|---------|----------|
| `isOpen` | Chat ablak nyitva/zárva |
| `conversationHistory` | Üzenet tömb (role + content) |
| `pastorFirstName` | Lelkész keresztneve |
| `activeProviderIndex` | Aktuális fallback szolgáltató |

### Admin
| Változó | Tartalom |
|---------|----------|
| `_allCongregations` | Gyülekezetek |
| `_allDioceses` | Egyházmegyék |
| `_allUsers` | Felhasználók |
| `_allSupportTickets` | Támogatási jegyek |
| `_qualityResults` | Minőség-ellenőrzés eredmények |

---

## 7. UI kapcsolatok

### AI
- Fix pozíciójú widget (jobb alsó sarok, 370×580px)
- Buborék ikon → kattintásra nyílik/zárul
- Auto-expandáló textarea (max 90px)
- Gondolat-buborék animáció (3 perc inaktivitás)
- Markdown renderelés a válaszokban
- Billentyű: Enter=küld, Shift+Enter=új sor, Escape=bezár

### Admin
- **5 fő fül:** Áttekintés, Gyülekezetek, Felhasználók, Támogatás, Import
- **Modal-ok:** gyülekezet részletek, támogatás válasz, import preview, hozzáférés kérelem
- **KPI kártyák:** gyülekezetek, felhasználók, tagok, jegyek
- **Szűrők:** keresés + egyházmegye + rendezés

---

## 8. Hibakezelés

| Modul | Helyzet | Viselkedés |
|-------|---------|-----------|
| AI | Szolgáltató hiba/rate limit | Automatikus fallback a következő szolgáltatóra |
| AI | Minden szolgáltató kimerült | „Jelenleg nem tudok válaszolni" üzenet |
| AI | Nincs API kulcs konfigurálva | A widget nem jelenik meg |
| Admin | Nem masterAdmin próbál belépni | Hiba képernyő: „Nincs jogosultsága" |
| Admin | Import: hibás Excel formátum | Alert a hibákkal, nem importál |
| Admin | Import: személy nem párosítható | Megjelöli „nem párosított"-ként, a felhasználó dönt |
| Admin | Jóváhagyás: gyülekezet létrehozás hiba | Alert, a fiók nem aktiválódik |

---

## 9. Rejtett működés

### AI — Multi-provider fallback rendszer
Az AI widget 3 szolgáltatón és 7 modellen próbálkozik sorrendben:
1. OpenRouter: minimax/m2.5 → stepfun/flash → nvidia/nemotron
2. Groq: llama-3.3-70b → llama-3.1-8b
3. Gemini: gemini-2.0-flash → gemini-1.5-flash

Ha egy provider rate limit-be ütközik VAGY hibát dob, automatikusan a következőre ugrik. A felhasználó ezt nem veszi észre — csak a válaszidő változhat.

### AI — System prompt tudásbázis
A `buildSystemPrompt()` tartalmazza a teljes Kartotéka modul-ismeretet:
- Tagnyilvántartás (személy, család, presbiter, körzet, választó)
- Pénzügyi modul (bevétel, kiadás, költségvetés, számadás, járulék)
- Anyakönyv (8 típus)
- Munkanapló, Leltár, Iktatás, Sírhelyek
- Általános egyházi fogalmak és jogi háttér

### AI — API kulcsok kliens-oldalon (biztonsági kockázat!)
A régi rendszerben az API kulcsok a `ai_config.js`-ben **kliens-oldalon** vannak. A Next.js migrációban ezeknek **Server Action-ön / Route Handler-en** keresztül kell menni — a kulcsok a `.env.local`-ban.

### Admin — Felhasználó jóváhagyás: gyülekezet automatikus létrehozás
Ha a jóváhagyott felhasználónak nincs gyülekezete a rendszerben, az admin:
1. Kiválaszt egy egyházmegyét
2. A rendszer létrehozza az új gyülekezetet (`congregations` INSERT)
3. A felhasználó profiljában beállítja a `congregation_id`-t
4. A státuszt `active`-ra állítja
5. Értesítést küld a felhasználónak

### Admin — Tömeges import: multi-formátum dátum parsing
Az `_parseExcelDate()` 6+ formátumot ismer:
- Excel serial szám (pl. 45323 → 2024-01-15)
- ISO formátum (2024-01-15)
- DD.MM.YYYY (magyar/román)
- DD/MM/YYYY
- YYYY.MM.DD
- Magyar szöveges (pl. "2024. január 15.")

### Admin — Keresztelés import: fuzzy személypárosítás
A `runPersonMatching()` az importált nevek és a `szemely` tábla közötti párosítást végzi:
- Név normalizálás: kisbetű + ékezet eltávolítás
- Családnév + keresztnév egyezés
- Születési dátum egyezés (ha van)
- Amennyiben nincs 100%-os egyezés → a felhasználó manuálisan választ
