# Kartotéka v0.5.2

A v0.5.1 telepítője után jelzett kritikus hiba javítva: az auto-updater jelezte az új verziót, de **nem volt UI-gomb a letöltéshez**.

## 🐛 Javítások

- **Frissítés letöltése most már működik** — eddig az „Adat & biztonság" fülön az „Ellenőrzés most" gomb megtalálta az új verziót, de utána nem lehetett honnan letölteni és telepíteni. Mostantól **külön „Frissítés" fül** van a Beállításokban, teljes folyamattal: ellenőrzés → release-notes → **„Letöltés és telepítés"** gomb → letöltés-progress (MB / MB) → automatikus újraindítás.
- **Családok-oldal layout-egységesítés** — a `families-page.tsx` még megtartotta a régi lokális max-width wrapper-t, ami dupla `<main>` elemet és felesleges paddingot adott a v0.5.1 új teljes-szélességű shell-éhez képest. Mostantól a tagnyilvántartás-oldallal vizuálisan azonos.

## ✨ Új — dedikált „Frissítés" fül a Beállításokban

A Beállítások menüben új fül a „Publikus oldal" és „Adat & biztonság" között:

- **Aktuális verzió** kártyán kiemelve (Tauri runtime API-ból)
- **Automatikus ellenőrzés** a fül megnyitásakor (online esetén)
- **Magyarázott állapotok**:
  - 🟢 *„A legfrissebb verzió fut"*
  - 🟡 *„Új verzió elérhető"* + release-notes + **„Letöltés és telepítés" gomb**
  - 🔵 *„Letöltés és telepítés folyamatban…"* — progress-bar + MB / MB
  - 🟢 *„Telepítés sikeres — újraindítás folyamatban…"*
  - 🔴 *„Hiba történt"* — pontos üzenet + újrapróbálás
- **Offline állapotban** világos magyarázat

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

Részletek: `docs/CHANGELOG.md`
