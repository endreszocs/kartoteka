# Kartotéka v0.7.9 — Sprint Q Fázis 2.3 (Sprint Q F2 LEZÁRVA)

## 🏁 OblioEllenőrzés tab közös csomagba — Sprint Q F2 lezárul

A Pénzügy → OblioEllenőrzés moduljából a **teljes 1730 soros tab** átkerült a
`@kartoteka/ui-app/finance/oblio/` shared csomagba. Ezzel a Sprint Q Fázis 2
**3/3 sub-sprintje teljes**, és a teljes Oblio modul iOS-future-proof.

### Felhasználói szempontból

A frissítés UI-szempontból **nem hoz látható változást** — az OblioEllenőrzés
fül az importtól a kézi párosításig, a 3-fülű diagnosztikán át a kiadás-
bevezetés wizard-ig és a nyomtatási központig pontosan ugyanúgy működik,
mint v0.7.8-ban.

### Háttérben (Sprint Q F2.3 paritás-előkészítés)

**Új shared elemek a `@kartoteka/ui-app/finance/oblio/` mappában:**

- `OblioEllenorzesTab` — teljes 1730 soros tab (callback + slot pattern)
- `OblioFileSystem` interface (oblio-filesystem.ts) — platform-független
  file-rendszer-réteg, 11 művelet (folder status, ZIP, archív újraellenőrzés,
  törlés, átnevezés, …)
- `BrowserOblioFileSystem` adapter (web oldalon, oblio-folder.ts) — File System
  Access API mögé burkolva, hogy iOS-en később egy másik adapter-rel
  kicserélhető legyen (pl. `TauriOblioFileSystem` → Tauri-fs)
- 4 dialog (kézi párosítás, diagnosztika, kiadás-wizard, nyomtatás) **slot
  prop**-ként megy be a tab-ba — Dialog shell maradéktalanul webnél, body
  a sharedban (v0.7.8 minta)

**Új callback prop-ok a webes wrapper felé:**

- `onLoadMatchesAndKiadasok`, `onBulkSaveMatches`, `onSaveSingleMatch`,
  `onRemoveMatch`, `onRecordDownloadNow`
- `onToast`, `onOpenSettings`
- `dialogSlot` × 4 (mindegyik dialog egy renderelő callback)

### Mi marad webnél állandóan

- 3 server-only lib (`oblio-auth`, `oblio-client`, `oblio-invoice-builder`) —
  Next.js `'use server'` direktívával, soha nem kerülhet kliensoldalra
- 5 server-action wrapper a webes oldalon, ami a sharedba `onXxx` callback-ként
  megy be

### iOS-future-proof állapot

A teljes Oblio modul az `OblioFileSystem` interface mögé burkolva. A web
ma a böngésző File System Access API-jával adja vissza ezt — Tauri-mobile
alatt majd egy `TauriOblioFileSystem` adapter ad ugyanennek az interface-nek
egy szigetelt sandbox folder felett dolgozó implementációt, kódváltoztatás
nélkül a tab maga.

### Sprint Q F2 áttekintés

| Sub-sprint | Verzió | Hatókör |
|--------|--------|---------|
| F2.1 | v0.7.7 | 10 lib (types, matcher, ubl-parser, pdf, print-builder, cache) + dexie + pdfjs-dist deps |
| F2.2 | v0.7.8 | 4 modal-body + 2 sub-komp (warnings, folder-card) |
| **F2.3** | **v0.7.9** | **Tab + OblioFileSystem interface — Sprint Q F2 LEZÁRVA** |

---

Részletek: `docs/CHANGELOG.md`
