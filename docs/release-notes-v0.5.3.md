# Kartotéka v0.5.3

Három észrevétel javítva, plusz egy új dashboard-widget.

## 🐛 Javítások

- **Telepítő ablakok feliratai magyarul** — eddig egyes ablakok címkéi (újratelepítés-oldal rádiógombok, „Felhasználói adatok törlése" checkbox az eltávolítóban, WebView2-üzenetek) **üresen** jelentek meg, mert a Tauri 23 saját stringje nem volt lefordítva. Mostantól teljes magyar fordítás `customLanguageFiles`-on keresztül.
- **„A munkamenet hamarosan lejár" warning online állapotban** — a `session-state.ts` az **access tokenre** (1 órás auto-refresh ciklus) figyelmeztetett, ami mindig 7 napon belüli volt. Mostantól: van session → 🟢 *Online*, semmi felesleges riasztás.

## ✨ Új — Korelosztás widget (5 korcsoport)

Új dashboard-widget az irányítópulton, **háromosztatú sorban** a *„Ma köszöntjük"* (születésnapok) és a *„Gyülekezeti programok"* mellett:

- **0–14** (gyermekek), **15–29** (fiatalok), **30–49** (felnőttek), **50–69** (érettek), **70+** (idősek)
- Színkódolt vízszintes bar minden csoportra + szám + arány (%)
- Élő frissítés a percenkénti auto-szinkronnal

A felső sorban 3 oszlopban: Köszöntések + Programok + Korelosztás. A *„Friss munkanapló"* lekerült saját sorba, teljes szélességen.

## 🎨 UI finomítás

- A *„Köszöntések"* widget címe pontosabb: **„Ma köszöntjük"** + *„Születésnapok és névnapok"* (eyebrow).

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

Részletek: `docs/CHANGELOG.md`
