# Release notes konvenció

A Kartotéka kétféle release-dokumentációval dolgozik:

1. **`CHANGELOG.md`** — **kanonikus**, gép-feldolgozható, minden release-bejegyzést tartalmaz (frontmatter-mezőkkel: `key`, `category`, `version`, `targets`). Az admin felület broadcast-funkciójának forrása.
2. **`release-notes-v{X.Y.Z}.md`** — **opcionális**, **pasztorális** hangvételű, narratív üzenet a lelkipásztoroknak. NEM CHANGELOG-duplikáció — ez egy „blogbejegyzés" a felhasználónak.

## Mikor kell `release-notes-vX.Y.Z.md`?

**KÖTELEZŐ:**
- Minden **major release**-nél (`v0.X.0` patch-szint = 0, pl. `v0.6.0`, `v0.7.0`, `v0.8.0`)
- Olyan release-eknél, ahol **a felhasználói UX érdemben átalakult** (új modul, új flow, jelentős átszervezés)

**OPCIONÁLIS** (mérlegelés alapján):
- Patch release (`v0.X.Y`, ahol `Y > 0`) — csak ha tartalmaz egy konkrét, a felhasználónak elmondandó UX-eseményt (pl. egy panasz feloldása, új-szabály-magyarázat, vagy bekapott visszajelzés)

**TILOS:**
- Tiszta bugfix release-ek hozzá (a CHANGELOG-bejegyzés elég)
- Belső refaktor, lint-cleanup, security-patch (a CHANGELOG + commit-üzenet elég)
- Web-only patch-ek, ha NEM tartalmaznak felhasználói reaktivumot

## Hangvétel

A release-notes md egy **levél** a lelkipásztoroknak, nem fejlesztői beszámoló:
- Megszólítás: „Kedves Endre, kedves Lelkipásztorok!"
- Hungarian, pasztorális, biblikus utalások megengedettek
- Technikai jargon kerülése: „Sprint", „workspace", „IPC", „migráció" — átfogalmazás kell
- A „Mi változott?" szakasz a fő — felhasználó-perspektíva
- Záró áldás / köszönet — Endre stílusa szerint

## Index — meglévő release-notes md-k (2026-05-17)

### v0.5.x — kezdeti M-fázisok (6 fájl)
v0.5.0, v0.5.1, v0.5.2, v0.5.3, v0.5.4, v0.5.5

### v0.6.x — M5-M6 fázisok (4 fájl)
v0.6.0, v0.6.1, v0.6.2, v0.6.3

### v0.7.x — M7-M8 fázisok (10 fájl)
v0.7.0, v0.7.1, v0.7.2, v0.7.3, v0.7.5, v0.7.6, v0.7.7, v0.7.8, v0.7.9, v0.7.10, v0.7.11
(v0.7.4 kihagyva)

### v0.8.x — Sprint R vizuális megújulás (7 fájl)
v0.8.1, v0.8.2, v0.8.3, v0.8.4, v0.8.5, v0.8.6, v0.8.7
(v0.8.0 kihagyva)

### v0.9.x — onboarding + pénzügy import (3 fájl)
v0.9.3, v0.9.46, v0.9.47

## Szándékosan kihagyott (NEM hiányoznak, hanem belső patch-ek)

A `v0.9.4` — `v0.9.45` és a `v0.9.48` — `v0.9.54` web-only patch release-ek, amelyek a CHANGELOG.md-ben szerepelnek, de **NEM kapnak külön md-t** (sem most, sem visszamenőlegesen) — a fenti konvenció szerint a tartalmuk vagy belső refaktor, vagy nem releváns pasztorális szempontból a felhasználónak.

Kivétel: ha utólag Endre úgy dönti meg, hogy a `v0.9.51` welcome-wizard átdolgozás vagy a `v0.9.53` egyházfenntartás-import wizard ÉRDEMES egy md-re, az később pótolható — de NEM kötelező.

## Jövőbeli release-eknél

- **Új major** (`v0.10.0`, `v1.0.0`): **mindig** új md
- **Új patch** (`v0.X.Y+1`): az aktuális PR mérete dönt
  - Felhasználói reaktivum? → md
  - Belső technikai? → csak CHANGELOG

A md fájlnévkonvenció: `docs/release-notes-vX.Y.Z.md` (kebab-case nem szükséges, mert a verzió már egyértelmű).

---

*DIAGNOSTICS P2-14: a 7 hiányzó md (v0.9.{48..54}) **szándékos hiány**, nem teendő-tétel. Ez a doksi rögzíti a konvenciót.*
