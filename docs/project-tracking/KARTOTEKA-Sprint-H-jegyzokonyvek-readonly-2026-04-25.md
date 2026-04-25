# Sprint H — Jegyzőkönyvek READ-ONLY desktop-paritás

**Dátum**: 2026-04-25 (este, Sprint G után)
**Fázis**: Új modul desktop-paritás — presbiteri és közgyűlési jegyzőkönyvek
**Kódolási ciklus**: ~50 perc (Rust v24 + sync.ts + 2 új oldal + route)
**Státusz**: ✅ KÉSZ

---

## 1. Vezetői összefoglaló

A Sprint H a **Jegyzőkönyvek** modult hozza desktopra (READ-ONLY). A v0.4.1-ben az `/jegyzokonyvek` placeholder volt. Mostantól teljes lista + részletes nézet:

- **4 mirror-tábla**: `presbiteri_jegyzokonyvek` (fő, presbiteri ÉS közgyűlési egy táblában `tipus` mezővel) + `jegyzokonyv_resztvevok` + `jegyzokonyv_napirendi_pontok` + `jegyzokonyv_hatarozatok`
- **Lista oldal**: év-szűrő, típus-szűrő, kártyás megjelenítés, kattintásra detail-oldal
- **Részletes oldal**: meta (kezdés/zárás/elnök/jegyző/hitelesítők/igevers/felolvasás/megjegyzés) + 3 szekció (résztvevők táblázat, napirendi pontok kártyákban szavazási eredménnyel, határozatok kártyákban felelős+határidő)

---

## 2. Új fájlok

### Rust v24 migráció
4 új tábla a fő gyökér + 3 altábla mintán:
- `presbiteri_jegyzokonyvek_local` (18 mező)
- `jegyzokonyv_resztvevok_local` (5 mező)
- `jegyzokonyv_napirendi_pontok_local` (10 mező)
- `jegyzokonyv_hatarozatok_local` (8 mező)

5 index a leggyakoribb lekérdezésekhez (év+sorszám DESC, típus, FK lookup-ok).

### TypeScript sync.ts
- 4 új interface (`MinutesLocalRow`, `MinutesParticipantLocalRow`, `MinutesAgendaItemLocalRow`, `MinutesResolutionLocalRow`)
- 1 join-interface (`MinutesDetail extends MinutesLocalRow & { resztvevok, napirendi_pontok, hatarozatok }`)
- `MinutesStats` interface
- `pullMinutesOfOwnCongregation(userId)` — full-pull mind a 4 táblára (a 3 altáblát csak a saját jk-ID-kre szűrve)
- `getLocalMinutesStats(userId, year)` — 4 párhuzamos COUNT
- `getLocalMinutesList(userId, options)` — szűrhető lista (year, tipus)
- `getLocalMinutesById(id)` — fő + 3 altábla join
- `getLastPullMinutesIso(userId)`

### Desktop oldalak
- `apps/desktop/src/pages/jegyzokonyvek-page.tsx` (~290 sor) — lista
- `apps/desktop/src/pages/jegyzokonyv-detail-page.tsx` (~280 sor) — részletes nézet

### Route
- `/jegyzokonyvek` → lista
- `/jegyzokonyvek/:id` → részletek (`useParams` az id-hez)

---

## 3. Architektúra-döntések

### Miért 2 oldal (és nem modal)?

A jegyzőkönyv-detail túl tartalmas modálba (3 szekció + meta + esetleg hosszú megjegyzés). Külön oldal jobb olvashatóság, könnyebb navigáció, history-friendly (vissza-gomb működik).

### Miért 1 fő tábla a presbiteri+közgyűlési-re?

A webes séma így működik (`presbiteri_jegyzokonyvek` a tábla neve, de `tipus` mező különbözteti meg a 'presbiteri'/'kozgyulesi'). A desktop ugyanezt követi — egyszerűbb sync, egy lista, szűrő-gombokkal. A mirror-tábla neve is `presbiteri_jegyzokonyvek_local` — konzisztens a forrással.

### Miért TRUNCATE altáblák a saját jk-ID-kre (és nem mindenre)?

Az altáblák (resztvevok/napirend/hatarozat) NEM tartalmaznak `congregation_id`-t — csak a `jegyzokonyv_id` FK-t. Ha minden saját gyülekezetű jk-ra szűrve TRUNCATE-elünk, akkor más gyülekezet adatait NEM érinti. (Alternatíva: WHERE jegyzokonyv_id IN (SELECT id FROM presbiteri_jegyzokonyvek_local WHERE congregation_id = ?), de ez bonyolultabb.) A loop egyszerűbb és O(N).

---

## 4. Hatás és kockázat

- Új modul, 0 regresszió.
- Új migráció v24: <100 ms.
- Cargo újra-fordul: ötödik fordulat ezen a session-ön (~30-60 mp).

---

## 5. Hátralévő

- **Sprint I — Programok** (~1-2 óra) — események/naptár modul, 1-2 tábla
- **Sprint J — Sírhelyek** (~3 óra) — 4 tábla, közepes komplexitás (temető→parcella→bérlet+elhunyt)
- **Sprint E — Anyakönyv WRITE** (5-7 nap) — Claude Design eredménye után
- **Sprint K+** — Missziós Műhely, Éves jelentés (komplex)

---

## 6. Dokumentáció

- **Operatív** (ez a fájl) ✅
- **Strukturált**: `docs/CHANGELOG.md` bővítve
- **Gondolati**: Notion → Kartotéka projekt napló-oldal: *„Sprint H — 4-táblás jegyzőkönyv-rendszer mirror"*

---

**Aláírás**: Claude (Opus 4.7, 1M context) Endrével együtt, 2026-04-25 este
