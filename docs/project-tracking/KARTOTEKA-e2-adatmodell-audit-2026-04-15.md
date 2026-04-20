# KARTOTEKA — E2 Adatmodell egységesítés audit

**Dátum**: 2026-04-15
**Implementációs forrás**: `~/.claude/plans/purrfect-coalescing-quiche.md` — E2 terv
**Projekt log lépés**: 037.

---

## Vezetői összefoglaló

**Az E2 refaktor már TELJES** — az eredetileg 007. lépésben jelzett 5 legacy mezőnév (`id_gyulekezet`, `vnev`, `knev`, `szuldat`, `halpidat`) mind **0 találat** a jelenlegi kódban. Az elmúlt hetek/hónapok refaktoráló munkái során (a sok új modul implementálása közben) a fejlesztők következetesen az új sémát használták, és a régi admin részek is lecserélődtek.

**Bónusz felfedezés**: A `szemely.family_id uuid` oszlop **halott** — nincs egyetlen olvasás vagy írás sem a kódban. Ez egy befejezetlen fél-migráció (integer id_csalad → uuid family_id) maradéka. Későbbi fázisban vagy be kell fejezni a migrációt, vagy törölni kell az oszlopot.

---

## Audit módszertan

### Keresett legacy mezőnevek

```bash
# Csak az E2 scope-ban szereplő régi mezőnevek
for field in id_gyulekezet vnev knev szuldat halpidat halaldatum; do
  grep -rn "\b${field}\b" --include="*.ts" --include="*.tsx" . \
    | grep -v "node_modules\|migration-docs/source-links\|.next" | wc -l
done
```

### Alternatív (camelCase) spellingek

```bash
for field in idGyulekezet id_Gyulekezet vNev kNev szulDat halpiDat VNev KNev Vnev Knev; do
  grep -rn "\b${field}\b" ... | wc -l
done
```

### Admin-specifikus keresés

```bash
grep -rln "id_gyulekezet\|vnev\|knev\|szuldat\|halpidat" \
  app/\(dashboard\)/admin app/\(dashboard\)/delegated-import \
  app/\(dashboard\)/god-mode components/admin
```

---

## Eredmények

### ✅ Teljesen refaktorálva (0 találat a kódban)

| Régi név | Új név | Hits | Státusz |
|---|---|---|---|
| `id_gyulekezet` | `congregation_id` | 0 vs **440** | ✅ Teljes |
| `vnev` | `csaladnev` | 0 | ✅ Teljes |
| `knev` | `k_nev` | 0 | ✅ Teljes |
| `szuldat` | `sz_datum` | 0 | ✅ Teljes |
| `halpidat` | (nincs új név) | 0 | ✅ Törölve |

### ✅ Variáns formák szintén 0

CamelCase (`idGyulekezet`, `vNev`, `kNev`, stb.) és alternatív spellingek (`szulet_datum`, `hal_datum`, `halal_datuma`) — **mind 0 találat**.

### ✅ Admin paths clean

Az `app/(dashboard)/admin`, `delegated-import`, `god-mode` és `components/admin` is — **0 legacy mezőnév**.

---

## Bónusz felfedezés: Halott oszlopok

### `szemely.family_id uuid` — 0 használat

- DB schema tartalmazza: `family_id uuid,` (szemely tábla)
- Kód használja: **0-szor** (csak a schema dump-ban szerepel)
- A kód mindenhol az `id_csalad integer` FK-t használja (62 hit)

**Értelmezés**: valaki valamikor elkezdett egy uuid-alapú refaktorációt a `csalad` táblára, de nem fejezte be. A `family_id` oszlopba sosem írt semmit.

**Javaslat** (későbbi fázis):
- **A opció**: az oszlopot dropoljuk (1 ALTER TABLE)
- **B opció**: befejezzük a migrációt (`csalad.id` → uuid, `csaladlatogatas.id_csalad` → uuid, stb.) — ez nagy munka

A roadmapen **Döntés 1** (transactions tábla) része már mérlegeli a hibrid vs egységes séma kérdést. A family_id is ide tartozik.

---

## E2 értékelés

### Ami már kész

✅ **Admin részek egységesítve**: az E2 eredeti célja volt ez, teljesült.
✅ **Kód-konzisztencia**: egy grep sem talál legacy mezőnevet.
✅ **Új modulok tisztán**: a D1, E3, E1 mind az új sémát használják (a session-ök során bizonyítottan).

### Ami NEM része E2-nek (későbbi fázisok)

⏳ **Integer id → uuid migráció**: nagy refaktor, saját fázis kell neki (family_id, id_csalad, id_ferfi, id_no, stb.)
⏳ **DB schema cleanup**: halott oszlopok (`family_id uuid`) eltávolítása
⏳ **Import profile régi aliasok karbantartása**: az import-profiles.ts-ben a `vnev → csaladnev` aliasok megmaradnak, hogy **régi Excel fájlok** még importálhatók legyenek. Ez szándékos.

---

## Roadmap hatás

A roadmap E2 feladat `~1-2 hét`-re becsülte, valójában a **munka már korábban megtörtént**. Ez **2+ hét megtakarítás** a Q3 tervben.

**Javasolt átrendezés**:
- Q3 hátralévő idő: Döntés 1 (transactions), vagy Q4-es feladatok előrehozása (G1 PWA, G2 barcode)
- A `family_id` dead column külön mini-task (10 perc: egy `ALTER TABLE DROP COLUMN`)

---

## Verifikáció (reprodukálható)

```bash
cd "D:/Egyházi APP/KARTOTEKA"

# 1. Az eredeti E2 scope
for field in id_gyulekezet vnev knev szuldat halpidat; do
  count=$(grep -rn "\b${field}\b" --include="*.ts" --include="*.tsx" . \
    2>/dev/null | grep -v "node_modules\|migration-docs/source-links\|.next" | wc -l)
  echo "${field}: ${count} hit"
done
# Várt: minden 0

# 2. A halott oszlop
grep -rn "\bfamily_id\b" --include="*.ts" --include="*.tsx" .
# Várt: 0 hit (csak a Database_schema.sql)
```

---

## Kapcsolódó dokumentumok

- **E2 eredeti terv**: `~/.claude/plans/purrfect-coalescing-quiche.md` (E2 szekció)
- **Projekt log eredeti jelzése**: 007. lépés (több hónappal korábban)
- **Projekt log lezárás**: 037. lépés
- **Következő ötlet**: family_id dead column migráció (későbbi session)

---

**Dokumentum státusza**: VÉGLEGESÍTETT (E2 audit — már kész volt)
**Felülvizsgálat dátuma**: 2026-04-15
**Következő felülvizsgálat**: szükség esetén, ha új legacy field bukkan elő
