# Bankszámlák közötti átvezetés (bank↔bank) + valutaváltás — terv

_2026-07-11 · senior könyvelői spec (OMFP 1802/2014) + implementációs terv_

## Cél

A felhasználó két esetet kért:

1. **Azonos devizás bank→bank átutalás** (pl. RON A számla → RON B számla): nem
   bevétel/kiadás, csak pénz-helyváltás — a számadásból KINETTÓZÓDIK, mint a
   kassza↔bank letétel/felvétel.
2. **Keresztdevizás átváltás** (pl. 1000 EUR a devizás számláról → ~4970 RON a
   RON számlán, a bank tényleges árfolyamán): a két láb ÖSSZEGE KÜLÖNBÖZŐ, ezért
   párosítani kell, és a BNR-hez képesti árfolyam-különbözetet nyereség/veszteségként
   kell könyvelni.

## Könyvelési elv (OMFP 1802/2014)

Egy átvezetés KÉT független dimenziót érint, amelyeket SOHA nem szabad összemosni:

- **Nyilvántartási (register) dimenzió** — a RON-egyenleg számlánként. Az átvezetés
  ÁTMOZGATJA az értéket, de nettósítva 0 hatás.
- **Eredmény (bevétel/kiadás) dimenzió** — az átvezetés MAGA sosem bevétel/kiadás
  (belső mozgás). Csak az **árfolyam-különbözet** hat az eredményre.

### Keresztdevizás átváltás könyvelése

| láb | dimenzió | érték | kód |
|-----|----------|-------|-----|
| KIADÁS (forrás, EUR számla) | register | −1000 EUR → RON könyv szerint a **művelet-napi BNR**-en (pl. ×4.9752 = 4975.20) | belső (402.02) |
| BEVÉTEL (cél, RON számla) | register | +4970.00 RON (a bank TÉNYLEGES jóváírása) | belső (402.02) |
| **Árfolyam-különbözet** | **eredmény** | 4970.00 − 4975.20 = **−5.20** | **203.03 veszteség** (ha +: **103.04 nyereség**) |

**Invariáns:** `cél_láb.ron − forrás_láb.ron_BNR-en == árfolyam_különbözet` (előjeles:
+ = nyereség/103.04, − = veszteség/203.03). Azonos devizánál mindkét oldal RON-értéke
egyenlő → 0 különbözet, nincs FX-sor.

## Tárolandó adatok

**Lábanként** (befizetes/kiadas sor, közös `belso_mozgas_xkey`): `osszeg` (eredeti
deviza), `osszeg_ron` (RON-ekvivalens), `arfolyam`, `bankszamla_id`, kód 402.02.

**Páronként** (megjegyzésben / xkey-hez kötve): `bnr_arfolyam`, `bank_arfolyam`
(= cél_RON / forrás_deviza), `fx_kulonbozet` (előjeles), `fx_kod` (103.04 / 203.03).

## Párosítási szabály

- **Elsődleges (kézi rögzítéskor):** közös `belso_mozgas_xkey` — a két láb egyszerre
  jön létre, garantáltan párosított.
- **Import esetén (két külön kivonat):** a `computeInternalMovementHealth` mostantól
  **RON-ekvivalensre** párosít (nem a nyers összegre) toleranciával — lásd lent, KÉSZ.

## Állapot — mi KÉSZ (v0.9.63 után)

- ✅ **Keresztdevizás PÁROSÍTÁS** (`internal-movement-health.ts`): ha legalább az
  egyik fél devizás, a RON-ekvivalensek közelségére párosít (±5% banki rés-tolerancia);
  minden-RON párnál marad a pontos összeg-egyezés (nincs false-pozitív). Így az
  importált EUR-kiadás és a RON-bevétel párja már összeáll (⏳ → ✓).
- ✅ **Devizás tétel szerkesztése**: a szerkesztő a számla valutáját írja ki (nem fix
  „RON"), és devizás számlánál a **tényleges RON-értéket + árfolyamot kézzel javítható**
  (a bank adói/rése miatt eltérhet a BNR-től); a mentés a `osszeg_ron`/`arfolyam`-ot is
  frissíti (eddig elavult).

## Állapot — HÁTRALÉVŐ (külön feladat)

- ⏳ **Kézi bank→bank ÁTVEZETÉS rögzítő UI**: jelenleg csak kassza↔bank rögzíthető a
  felületről (a bank→bank rögzítő dialógus holt kód). Teendő: a `saveInternalTransfer`
  `bank_bank`/`valutacsere` ágát a KANONIKUS PÁR-modellre állítani (kiadas forrás +
  befizetes cél, közös xkey, 402.02, lábankénti `osszeg`/`osszeg_ron`/`arfolyam`), és
  keresztdevizásnál az **árfolyam-különbözet automatikus könyvelése** 103.04/203.03
  sorként. UI: a Bank fülön „Átvezetés másik számlára" gomb, deviza + cél-összeg + árfolyam
  mezőkkel. A `belsomozgas` mester-tábla ekkor elhagyható (vagy csak audit).
- A dokumentum a wf_dfc7bed5-85b kutatás alapján készült (5 ág: edit-dialog, internal-model,
  pairing-health, transfer-entry, accounting-spec).
