# A-M7.3 — Befizetés (pénzbeszedés) — scope-felderítés

**Dátum:** 2026-04-24
**Státusz:** terv — a kódolás a következő session-ben indul
**Kapcsolódó:** A-M7.2 chitanța-kör lezárása (6+1 alfázis ma)

---

## 1. Miért most, miért ez?

A chitanța-kör (A-M7.2) pénztárgépszerű nyugta-kiállítás; de a lelkész napi rendszerességgel **rögzít bejövő pénzt** (járulék, persely, adomány, bérlet) a `befizetes` táblába. A chitanța *csak egy mellékes papír*, a fő entitás a befizetés maga.

Ez a wave az A-M7 pénzügyi kör gerince:
- Lista (a tag vagy család múltbeli befizetései)
- Rögzítés (új befizetés)
- Sztornó (soft-delete)
- Excel-import kapcsolódás (később)
- Bank-import kapcsolódás (későbbi A-M7.5+)

---

## 2. `befizetes` tábla (Database_schema.sql #264)

**33 oszlop:**

```
id                 INTEGER PK (befizetes_id_seq)
xkey               VARCHAR NOT NULL  -- kliens-generált kulcs (legacy)
id_csalad          INTEGER NULL      -- FK csalad
id_szemely         INTEGER NULL      -- FK szemely
forrasa            TEXT NOT NULL     -- kassza/bank/pénztár
id_befizetescel    INTEGER NOT NULL  -- FK befizetescel
datum              DATE NOT NULL
osszeg             NUMERIC NOT NULL
nyugta             TEXT NOT NULL     -- a chitanta sorszám hivatkozás
iratszam           TEXT NOT NULL     -- saját iratszám
irattipus          TEXT NOT NULL
csalad             BOOLEAN NOT NULL
megjegyzes         TEXT
deleted            BOOLEAN NOT NULL
created            TIMESTAMP
fizetettev         INTEGER NOT NULL  -- melyik évre szól
userid             UUID NOT NULL
melleklet          INTEGER
synced             BOOLEAN DEFAULT false
congregation_id    UUID NOT NULL
is_potlas          BOOLEAN DEFAULT false
bankszamla_id      INTEGER NULL
belso_mozgas_xkey  VARCHAR NULL
revision           BIGINT NOT NULL DEFAULT 0    -- ✅ már van
updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()  -- ✅ már van
stornozott         BOOLEAN NOT NULL DEFAULT false
stornozott_at      TIMESTAMPTZ NULL
stornozott_indok   TEXT NULL
stornozott_by      UUID NULL
osszeg_ron         NUMERIC NULL
arfolyam           NUMERIC NULL
```

**FK kapcsolatok:**
- `id_befizetescel` → `befizetescel`
- `bankszamla_id` → `bankszamlak`
- `id_szemely` → `szemely`
- `userid` → `auth.users`
- `congregation_id` → `congregations`
- `stornozott_by` → `profiles`

**Kapcsolódó `befizetescel` tábla** (#304): kategória-lista, kb. 50 előre definiált bejegyzés (járulék, persely, adomány, stb.). Offline-hoz lokálisan kell mirrorolni.

---

## 3. Meglévő web-kód (77 Server Action → átalakítandó use-case-ekké)

**Fájl:** `apps/web/app/(dashboard)/penzugy/actions.ts` (~2412 sor)

Közvetlen befizetés-érintő függvények:

| Függvény | Célja | A-M7.3 fázis |
|---|---|---|
| `initFinance(year)` | Éves finance-view-dashboard init (befizetes + kiadas agg) | A-M7.4 |
| `saveIncome(data)` | Egyetlen befizetés rögzítése | **A-M7.3b** |
| `saveIncomeWithLinkedInventory(data, inv)` | Befizetés + inventory-link (szék, perselypénz) | A-M7.6 |
| `saveIncomeBatch(rows)` | Több befizetés egyszerre (Excel-paste) | A-M7.6 |
| `saveExpense*` | Kiadások — külön use-case (befizetés sztornozása, terv) | A-M7.4 |
| `deleteTransaction(type, id)` | Soft-delete (befizetes vagy kiadas) | **A-M7.3c** |
| `getNextReceiptNumber(year)` | `iratszam` auto-generáció | **A-M7.3b** (része) |
| `searchMembersForFinance(query)` | Tag-autocomplete a form-ban | A-M7.3b |
| `getFamilyIdForPerson(id)` | FK-resolver | A-M7.3b |
| `checkReceiptDuplicate(iratszam)` | Duplikátum-check | A-M7.3b |
| `getUnlinkedPayments()` | Linkelelen fizetések (admin) | A-M7.4 |
| `linkPaymentToPerson(pid, sid)` | Admin-funkciók | A-M7.4 |
| `saveInternalTransfer(data)` | Belső pénzmozgás (bank↔kassza) | A-M7.5 |

**Első A-M7.3 kör (célzott):**
- A-M7.3a: **`listIncomeUseCase`** — read-only, a tag/család befizetéseit listázza (mint a `RecentChitantasSection`)
- A-M7.3b: **`saveIncomeUseCase`** — új befizetés rögzítése (online-first, offline a következő körben)
- A-M7.3c: **`deleteIncomeUseCase`** (soft-delete) — sztornó-szerű viselkedés

---

## 4. Offline-képesség döntés (A-M7.3 után fogjuk megtenni)

A chitanța-kör mintája szerint **N lépés**:
1. Rust v12 migráció: `befizetes_local` tábla (33 oszlop)
2. `befizetescel_local` tábla (~50 sor, kategóriák mirror)
3. Pull-szink (`pullBefizetesek(congregationId)`)
4. Offline write (ha igen — lásd lejjebb)

**Nyitott kérdés:** az `iratszam` auto-generálás online-only? A jelenlegi `getNextReceiptNumber` a szerveren évente inkrementál. Offline ezt nem lehet megcsinálni, **kivéve** ha:
- Az iratszám-wallet rendszert (analóg a chitanta-walletre) bevezetjük — évente előre lefoglalunk N iratszámot

**Javaslat:** Az A-M7.3a/b/c **ONLINE-ONLY** első körben (mint a chitanta A-M7.2b volt). Az offline (iratszam-wallet) az A-M7.3d lesz, ha a lelkészi igény valóban erős.

---

## 5. A-M7.3a — javasolt első kód-lépés

**Cél:** `listIncomeUseCase` — a `befizetes` táblából a congregation + év szűrővel listáz, join-al a `szemely` + `befizetescel` + `bankszamlak`-ra a megjelenítéshez.

**Fájl:** `packages/core/src/finance/befizetes/list.ts`

**Signature (tervezett):**
```ts
export interface ListIncomeInput {
  congregationId: string
  year: number
  /** Csak egy adott tag fizetései — opcionális szűkítő */
  szemelyId?: number | null
  /** Csak egy adott cél (járulék, persely stb.) */
  befizetescelId?: number | null
  /** Rendezés: 'datum-desc' (default) vagy 'datum-asc' */
  orderBy?: 'datum-desc' | 'datum-asc'
  limit?: number
}
export type ListIncomeResult =
  | { success: true; rows: IncomeListRow[] }
  | { success: false; error: string }
```

**Result-row** (a UI-hoz kellő minimális mezők):
```ts
export interface IncomeListRow {
  id: number
  datum: string
  osszeg: number
  osszeg_ron: number | null
  arfolyam: number | null
  forrasa: string
  iratszam: string
  befizetescel_nev: string       // join
  szemely_nev: string | null     // join (ha id_szemely van)
  nyugta: string
  csalad: boolean
  megjegyzes: string | null
  stornozott: boolean
  stornozott_indok: string | null
  created: string | null
}
```

**Web Server Action adapter:** `apps/web/app/(dashboard)/penzugy/befizetes-actions.ts` (új fájl, 30-50 sor) — `'use server'` wrapper, `getEffectiveAccessContext`-et injektál.

**Desktop integráció** egyelőre nincs — azt a következő iteráció hozza, amikor egy `/penzugy/befizetes` desktop-oldalt épít.

**Zod séma:** `packages/validations/src/finance/befizetes-list.ts` (új fájl)

---

## 6. Becsült idő-igény — A-M7.3a/b/c

Ugyanaz a minta mint a chitanta-list/issue/storno volt:

- **A-M7.3a (list)** — ~60-90 perc (egyetlen core use-case, zod, web wrapper, alapvető tesztelés)
- **A-M7.3b (save)** — ~2-3 óra (save + getNextReceiptNumber + searchMembers + checkDuplicate + getFamilyIdForPerson, minden a core-ba megy)
- **A-M7.3c (delete/storno)** — ~30-60 perc

**Plusz desktop UI (ha rászánjuk):** ~2 óra egy `/penzugy/befizetes` oldalra lista + rögzítő form-mal.

**Teljes A-M7.3 online-kör (3a+3b+3c+UI):** ~5-6 óra kódolási idő, osztva 1-2 sessionre.

---

## 7. Kockázat-list

1. **Családi befizetés vs. egyéni** — a `csalad` boolean + `id_csalad`/`id_szemely` kizárólagos. Offline validációt kell írni a zod-ban.
2. **Iratszam-duplikátum** — a `checkReceiptDuplicate` kliens-race-safe? Ma szerver-oldalon fut.
3. **Multi-currency (osszeg_ron + arfolyam)** — ha a user nem RON-ban fizet (EUR, HUF), a BNR árfolyam-hívás szükséges. Ez **Edge Function** kell legyen.
4. **Belső mozgás** — a `belso_mozgas_xkey` a kassza↔bank transferrel összekapcsolódik, komplexebb. Az A-M7.5-be tartozó.

---

## 8. Javaslat a folytatásra

**A következő session-ben kezdjük az A-M7.3a-val** (listIncomeUseCase):

1. Zod séma + core use-case + web adapter (3 fájl új)
2. TS typecheck
3. Dokumentáció (project log + CHANGELOG mentesülve amíg user-facing UI nem jön)

Ha a chitanta-kör mintája szolid (és az), az A-M7.3a-c ~3-4 óra alatt kész, és akkor haladhatunk a `/penzugy/befizetes` desktop oldalra.

**Ha közben új pénzügyi igény jön** (pl. Endre jelzi, hogy a bank-import sürgős) — átrendezhető a sorrend.

---

## 9. A-M7 eddigi lezárt alfázisok — visszanéző

| Alfázis | Szállítás | Státusz |
|---|---|---|
| A-M7.1a | listChitantaTombokUseCase | ✅ 2026-04-22 |
| A-M7.1b | createChitantaTombUseCase | ✅ 2026-04-22 |
| A-M7.1c | Desktop chitanta-tombok oldal | ✅ 2026-04-22 |
| A-M7.2a | Aktív-tömb panel | ✅ 2026-04-22 |
| A-M7.2b | issueChitantaUseCase (online) | ✅ 2026-04-23 |
| A-M7.2c | Desktop chitanta-form | ✅ 2026-04-23 |
| A-M7.2e-list | listChitantasUseCase + stornoChitantaUseCase | ✅ 2026-04-23 |
| A-M7.2f | getChitantaForPrintUseCase + print dialog | ✅ 2026-04-24 |
| A-M7.2d1 | Offline wallet-infra | ✅ 2026-04-24 |
| A-M7.2d2a | chitantak_local + atomikus claim | ✅ 2026-04-24 |
| A-M7.2d2b | Offline kiállítás flow | ✅ 2026-04-24 |
| A-M7.2d2c | Auto-push | ✅ 2026-04-24 |
| A-M7.2d2d | Konfliktus-UX | ✅ 2026-04-24 |
| A-M7.2e (polish) | Shell sync-indicator + exp-backoff | ✅ 2026-04-24 |

**13 alfázis 3 nap alatt** (2026-04-22..24) — a teljes chitanța-kör E2E offline-capable, konfliktus-kezeléssel, szerverre-pushsal.

**Következő:** A-M7.3 — befizetés-kör indítása.
