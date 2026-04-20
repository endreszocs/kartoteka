# KARTOTEKA — Oblio / e-Factura integráció

**Dátum**: 2026-04-16
**Állapot**: tervezés
**Kapcsolódó**: `KARTOTEKA-penzugy-fejlesztesi-roadmap-2026-04-16.md`, `KARTOTEKA-tva-figyelo-terv-2026-04-16.md`

---

## Vezetői összefoglaló

A román **OUG 120/2021 módosítva + OG 70/2024** értelmében **2025. július 1. óta** minden **ONG és vallási kultus köteles** az **e-Factura** (ANAF SPV) rendszert használni, **ha gazdasági tevékenységet folytat**. A gyülekezetek elsődleges gazdasági tevékenysége a **bérleti díj (locațiune)** — tehát ez a kötelezettség **ma már élesben érvényben van**.

A **felhasználó döntése (2026-04-16)**: minden gyülekezet **saját Oblio fiókkal** rendelkezik. Ez a legegyszerűbb és legtisztább konfigurációt teszi lehetővé — **gyülekezetenként tárolt API-kulcs**.

**Integráció lényege**: a KARTOTEKA a `berleti_szerzodes` alapján egy kattintással **számlát állít ki** az Oblio REST API-n keresztül → az Oblio **automatikusan** feltölti az ANAF SPV-be → a státuszt a KARTOTEKA polling-gal visszaolvasja → a **befizetést rögzítésekor** az Oblio-ban is „collect"-ként jelöli a számlát.

---

## Műszaki alap — Oblio API

### Autentikáció
- **Bearer token**, amelyet `POST /api/authorize/token` végponttal kapsz **email + API secret** páros ellenében
- Az API secret a felhasználó Oblio fiókjában: **Beállítások → Account Data → Generate API secret**
- **Token élettartama**: 1 óra (alap), automatikus frissítés szükséges szerver oldalon
- **Rate limit**: 60 kérés/perc (forrás: Oblio doksi)

### Fő végpontok

| Végpont | Metódus | Cél |
|---|---|---|
| `/api/authorize/token` | POST | Bearer token igénylés |
| `/api/docs/invoice` | POST | **Számla kiállítás** |
| `/api/docs/invoice` | GET | Számla lekérdezés CIF + sorozat + szám alapján |
| `/api/docs/invoice/collect` | PUT | **Kifizetés rögzítése** (befizetéskor) |
| `/api/docs/invoice` | DELETE | **Sztornó** |
| `/api/docs/proforma` | POST/GET | Proforma (előszámla) |
| `/api/docs/notice` | POST | Aviz (szállítólevél) — nem releváns itt |
| `/api/docs/receipt` | POST | Chitanță (nyugta) — opcionális |
| `/api/nomenclature/companies` | GET | A fiók alá tartozó cégek listája (CIF-ek) |
| `/api/nomenclature/clients` | GET/POST | Partnerek (bérlők) |
| `/api/nomenclature/products` | GET/POST | Termékek/szolgáltatások katalógusa |
| `/api/nomenclature/series` | GET | Számlasorozatok |

### e-Factura SPV
- **Automatikus** feltöltés — nincs külön „send to SPV" hívás
- Az Oblio cron-szerűen ellenőrzi és push-olja a kiállított számlákat a CIF-en keresztül ANAF-hoz
- **Státusz visszaolvasás**: `GET /api/docs/invoice` válaszban `eFactura` objektum tartalmazza
  - `status`: `pending` / `accepted` / `rejected`
  - `uuid`: ANAF index szám
  - `errors`: ha `rejected`, a hibakódok

---

## Adatmodell változtatások

### 1. Új tábla: `oblio_fiokok`

```sql
CREATE TABLE public.oblio_fiokok (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  api_secret_encrypted text NOT NULL,
  cif text NOT NULL,
  sorozat_default text,
  nev_default_service text DEFAULT 'Chirie spațiu',
  aktiv boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  utolso_token text,
  utolso_token_expires_at timestamp with time zone,
  CONSTRAINT oblio_fiokok_pkey PRIMARY KEY (id),
  CONSTRAINT oblio_fiokok_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);

COMMENT ON TABLE public.oblio_fiokok IS
  'Gyülekezetenkénti Oblio API-fiók konfiguráció. Az api_secret titkosítva tárolódik (pgcrypto vagy Supabase vault).';
COMMENT ON COLUMN public.oblio_fiokok.cif IS
  'A gyülekezet CUI/CIF kódja, amely alatt a számlák kiállításra kerülnek.';
COMMENT ON COLUMN public.oblio_fiokok.sorozat_default IS
  'Alapértelmezett számlasorozat, pl. "KA" vagy "FAC".';
```

**Biztonság**:
- Az `api_secret` **soha ne tárolódjon plain text-ben** — pgcrypto-val `pgp_sym_encrypt` / `pgp_sym_decrypt`, vagy Supabase Vault extension
- **RLS policy**: csak a saját gyülekezetének `admin` vagy `lelkesz` szerepkörű tagja láthatja/írhatja, de az `api_secret` mező **még neki sem visszaolvasható** (csak szerver oldali edge function-ból)
- **Ne jelenjen meg** kliens kódban, csak server action-ökben

### 2. Új tábla: `oblio_szamlak`

```sql
CREATE TABLE public.oblio_szamlak (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  oblio_fiok_id uuid NOT NULL,
  berleti_szerzodes_id uuid,
  befizetes_id integer,
  sorozat text NOT NULL,
  szam integer NOT NULL,
  szamla_datum date NOT NULL,
  esedekesseg date,
  klienesseg_nev text NOT NULL,
  klienesseg_cui text,
  osszeg_net numeric NOT NULL,
  osszeg_tva numeric DEFAULT 0,
  osszeg_brut numeric NOT NULL,
  pdf_url text,
  e_factura_uuid text,
  e_factura_status text DEFAULT 'pending' CHECK (
    e_factura_status = ANY (ARRAY['pending','sent','accepted','rejected','not_applicable'])
  ),
  e_factura_errors jsonb,
  utolso_szinkronizalas_at timestamp with time zone,
  collected_at timestamp with time zone,
  stornozott boolean DEFAULT false,
  stornozott_at timestamp with time zone,
  stornozott_indok text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT oblio_szamlak_pkey PRIMARY KEY (id),
  CONSTRAINT oblio_szamlak_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id),
  CONSTRAINT oblio_szamlak_oblio_fiok_id_fkey FOREIGN KEY (oblio_fiok_id) REFERENCES public.oblio_fiokok(id),
  CONSTRAINT oblio_szamlak_berleti_szerzodes_id_fkey FOREIGN KEY (berleti_szerzodes_id) REFERENCES public.berleti_szerzodes(id),
  CONSTRAINT oblio_szamlak_befizetes_id_fkey FOREIGN KEY (befizetes_id) REFERENCES public.befizetes(id),
  CONSTRAINT oblio_szamlak_sorozat_szam_unique UNIQUE (oblio_fiok_id, sorozat, szam)
);

CREATE INDEX idx_oblio_szamlak_congregation ON public.oblio_szamlak (congregation_id);
CREATE INDEX idx_oblio_szamlak_berleti ON public.oblio_szamlak (berleti_szerzodes_id);
CREATE INDEX idx_oblio_szamlak_status ON public.oblio_szamlak (e_factura_status) WHERE e_factura_status IN ('pending','sent');
```

### 3. `berleti_szerzodes` bővítés — Oblio-hoz kapcsolódó mezők

```sql
ALTER TABLE public.berleti_szerzodes
  ADD COLUMN IF NOT EXISTS oblio_auto_szamlaz boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS oblio_klienesseg_id text,  -- Oblio partner ID, ha van
  ADD COLUMN IF NOT EXISTS oblio_termek_kod text;      -- Oblio termék/szolgáltatás kód
```

---

## Architektúra

```
┌───────────────────────────────────────────────────────────┐
│  Kliens (Next.js React komponens)                         │
│  - Bérleti szerződés listában "Számlát kiállít" gomb      │
│  - Számla-historia nézet                                  │
│  - Manuális számla form (egyedi eset)                     │
└────────────────────┬──────────────────────────────────────┘
                     │ (server action hívás)
                     ▼
┌───────────────────────────────────────────────────────────┐
│  Server Actions — app/(dashboard)/penzugy/oblio-actions.ts│
│  - issueInvoice(berletiSzerzodesId, options)              │
│  - markInvoicePaid(oblioSzamlaId, befizetesId)           │
│  - syncInvoiceStatus(oblioSzamlaId)                       │
│  - stornoInvoice(oblioSzamlaId, reason)                   │
│  - getConfiguration(congregationId)                       │
│  - saveConfiguration(payload)                             │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│  Oblio Client — lib/finance/oblio/                        │
│  - oblio-client.ts: REST API wrapper                      │
│  - oblio-auth.ts: token management (cache + refresh)      │
│  - oblio-types.ts: API response / request típusok        │
│  - oblio-errors.ts: egységes hibakezelés                  │
│  - oblio-invoice-builder.ts: KARTOTEKA → Oblio DTO       │
└────────────────────┬──────────────────────────────────────┘
                     │ HTTPS REST
                     ▼
┌───────────────────────────────────────────────────────────┐
│  Oblio.eu (Bucureşti)                                     │
│  - Számla generálás                                       │
│  - PDF generálás                                          │
│  - Automatikus ANAF SPV feltöltés                         │
└───────────────────────────────────────────────────────────┘
```

**Miért ez a réteges architektúra?**
- A `lib/finance/oblio/` **lecserélhető** — ha a jövőben SmartBill-re vagy saját ANAF SPV XML generátorra váltanánk, csak ezt kell cserélni.
- A **server action-ök** üzleti logikát tartalmaznak (pl. amortizált szerződésből hogyan készül számla), nem közvetlenül hívnak API-t.
- A **kliens** csak eredményt lát, nem közvetlenül REST API-t.

---

## UI flow — főbb képernyők

### 1. Beállítás: Oblio fiók rögzítése

**Hely**: Gyülekezeti Beállítások → „Integrációk" új szekció → „Oblio e-Factura"

**Form mezők**:
- Email (az Oblio fiók emailje)
- API secret (jelszó-mező, csillagozva, mentés után nem látszik)
- CIF / CUI (a gyülekezet adószáma, pl. `23456789`)
- Alapértelmezett számlasorozat (opcionális, pl. `KA`)
- Alapértelmezett termék-megnevezés (pl. „Chirie spațiu")

**Tesztelés gomb**: „Kapcsolat tesztelése"
- Meghívja az Oblio `/api/nomenclature/companies`-ot → ha sikeres, zöld pipa + a kapott cégnév
- Ha sikertelen, egyértelmű hibaüzenet

**Segítség-szekció**: „Hol kapom meg az API secret-et?" → kép + 3-lépéses magyarázat Oblio fiókban

### 2. Számlakiállítás bérleti szerződésből

**Hely**: `rental-tab.tsx` — minden bérleti szerződés sorában új gomb: **„Számlát kiállít"**

**Előfeltétel**:
- Oblio fiók konfigurálva és aktív
- A szerződés `jogi_tipus = 'locatiune'` (comodat nem)
- Az `osszeg > 0`

**Modal**:
- **Szolgáltatás leírása**: előtöltve a szerződés `targy` + hónap-év, szerkeszthető
- **Összeg**: a szerződés `osszeg` értékéből előtöltve
- **Számla dátuma**: alapértelmezés mai nap
- **Fizetési határidő**: alapértelmezés +15 nap
- **TVA**: `0% (scutit fără drept de deducere — art. 292 alin. 2 lit. e)` alapértelmezés, ha a gyülekezet **nem** TVA-alany; 19% ha TVA-alany
- **Partner**:
  - Ha a szerződésben van `id_szemely` (magánszemély) → előtöltés
  - Ha `ceg_nev` és `ceg_adoszam` → előtöltés, és felkínál „Partner hozzáadása Oblio-hoz" ha még nincs
- **Megjegyzés**: szabad szöveg
- **Gombok**: [Mégse] [Számla kiállítása]

**Siker esetén**:
- Toast: „Számla kiállítva: KA 00123 — 800 RON"
- A szerződés sorában megjelenik a számlaszám és státusz chip
- Háttérben polling indul az e-Factura státusz lekérdezésére (2-3 perc múlva)

**Hiba esetén**:
- Részletes hibaüzenet (mit mondott az Oblio API)
- Újrapróbálkozás opció

### 3. Számla-historia a bérleti szerződésnél

- Kibontható kártya a szerződés alatt: az eddig kibocsátott számlák listája
- Oszlopok: dátum, sorszám, összeg, e-Factura státusz, PDF letöltés, [Sztornó] gomb
- **ÚJ (felhasználói kérés 2026-04-16)**: **„Állapot-ellenőrzés" gomb** minden számlánál → re-sync az Oblio-val, mutat minden aktuális adatot (státusz, PDF URL)
- **PDF letöltés**: a tárolt `pdf_url` alapján (Oblio-ból direkt), új ablakban nyílik meg a böngészőben, vagy közvetlen letöltés
- **Megjelent-e Oblio-ban ellenőrzés**: ha a lokális `oblio_szamlak.e_factura_status` eltér az éppen visszaérkezett Oblio állapottól, frissítjük + zöld pipa „Oblio-ban: megjelent"

### 4. Befizetés rögzítésekor — Oblio kifizetés jelzés

A meglévő `income-dialog-v3.tsx`-be új logika:
- Ha a bevétel **bérleti szerződéshez** kapcsolódik, ahol van nyitott (`collected_at IS NULL`) Oblio számla
- Jelezd: „Ennek a szerződésnek van kiállított számlája (KA 00123). Szeretnéd kifizetettként jelölni az Oblio-ban is?"
- Checkbox alapértelmezés: **igen**
- Mentéskor server-side `PUT /api/docs/invoice/collect` hívás
- `oblio_szamlak.collected_at = now()` és `befizetes_id` kapcsolás

### 5. Dashboard widget: nyitott e-Factura státuszok

A Pénzügyi Dashboard-on új kártya **feltételesen** (ha van legalább 1 `sent` vagy `pending` státuszú számla):
- „Utolsó 30 nap e-Factura állapotok"
- Pl. „12 elfogadva ✓ | 2 folyamatban ⏳ | 1 elutasítva ✗"
- Kattintás → részletes lista

---

## Hibakezelés

### Lehetséges hibák és kezelésük

| Hiba | Ok | Kezelés |
|---|---|---|
| 401 Unauthorized | Hibás vagy lejárt token | Automatikus token-refresh, max. 1 retry |
| 403 Forbidden | Nincs joga a CIF-re | Üzenet: „Nincs joga ehhez a céghez, ellenőrizd a CIF-et." |
| 404 Not Found | Nem létező számla | Üzenet: „A számla nem található az Oblio-ban." |
| 422 Unprocessable | Validációs hiba (pl. hibás CUI formátum) | Részletes üzenet az API-ból |
| 429 Too Many Requests | Rate limit | Exponenciális backoff, retry max 3× |
| 500 Internal Server Error | Oblio oldali gond | Üzenet: „Oblio szolgáltatás átmenetileg nem elérhető. Próbáld újra pár perc múlva." |
| Hálózati timeout (>10s) | Lassú API | Üzenet: „Kapcsolódási időtúllépés." |
| ANAF SPV `rejected` | XML validáció hiba ANAF oldalon | Részletes ANAF hibakód megjelenítése, **nem automata retry** (javítás kell) |

### Idempotencia

Ha a felhasználó **kétszer kattint** a „Számla kiállítása" gombra:
- A server action elsőként **ellenőrzi**, hogy a `berleti_szerzodes_id + hónap + év` kombinációra **van-e már számla** ebben az időszakban
- Ha igen, **nem duplikál**, hanem visszaadja a meglévőt figyelmeztetéssel

---

## Számla-generálás adatkezelése

### Alapértelmezett számla-sablon a bérleti szerződésből

```typescript
// lib/finance/oblio/oblio-invoice-builder.ts

export function buildInvoicePayload(args: {
  berletiSzerzodes: BerletiSzerzodesRow
  congregation: CongregationRow
  oblioFiok: OblioFiokRow
  szamlaDatum: string
  esedekesseg: string
  osszeg: number
  megjegyzes?: string
}): OblioInvoicePayload {
  return {
    cif: args.oblioFiok.cif,
    client: {
      cif: args.berletiSzerzodes.ceg_adoszam || undefined,
      name: args.berletiSzerzodes.ceg_nev || args.berletiSzerzodes.berlo_nev,
      address: /* bérlő címe */,
      // vagy magánszemély esetén: CNP, név, cím
    },
    issueDate: args.szamlaDatum,
    dueDate: args.esedekesseg,
    useStock: 0,
    language: 'RO',
    precision: 2,
    currency: 'RON',
    products: [{
      name: `Chirie ${args.berletiSzerzodes.targy || 'spațiu'} - luna ${/* pl. martie 2026 */}`,
      measuringUnit: 'buc',
      currency: 'RON',
      quantity: 1,
      price: args.osszeg,
      vatPercentage: 0,  // scutit (art. 292 alin. 2 lit. e)
      vatName: 'Scutit fără drept de deducere',
      productType: 'Serviciu',
    }],
    seriesName: args.oblioFiok.sorozat_default,
    internalNote: args.megjegyzes,
    mentions: `Factură emisă conform art. 292 alin. (2) lit. e) din Codul fiscal (scutit fără drept de deducere). Contract de locațiune nr. ${args.berletiSzerzodes.id}.`,
  }
}
```

**Fontos**: ha a gyülekezet TVA-alany, a `vatPercentage` és `vatName` más lesz. A logika a `congregations.tva_alany` mezőre épül.

---

## Tesztelés

### Sandbox / test környezet
- Az Oblio sandbox API nem publikus; a teszteléshez külön **teszt-fiók** kell
- **Javaslat**: az első fejlesztés egy általunk nyitott „KARTOTEKA-test" Oblio fiók, fiktív CIF-fel
- Automata teszt: **mocked Oblio client** (nem hívjuk az éles API-t unit tesztben)

### E2E scenáriók

1. Új bérleti szerződés (locatiune, 800 RON/hó) → „Számlát kiállít" → válasz érkezik → státusz `pending` → 30 mp múlva polling → `accepted`
2. Comodat szerződés → „Számlát kiállít" gomb **nem jelenik meg** (vagy disabled tooltippel)
3. Befizetés rögzítése → modalban „kifizetettként jelöljem az Oblio-ban is?" → igen → `collect` hívás → `collected_at` beállítva
4. Sztornó → `DELETE` hívás → `stornozott = true`
5. Duplikáció védelem: ugyanarra a hónapra kétszer → figyelmeztetés, nem duplikál
6. Hibás CIF → új szerződés Oblio-ban nem létező céggel → 422 hiba → részletes üzenet
7. SPV rejection → `e_factura_status = 'rejected'` → piros chip + hibakód

---

## Fejlesztési ütemterv

### A. Infrastruktúra (backend)
1. DB migráció (2 új tábla + `berleti_szerzodes` és `congregations` bővítés)
2. pgcrypto vagy Supabase Vault-beállítás a secret titkosításhoz
3. `lib/finance/oblio/` könyvtár felépítése

### B. Oblio kliens
4. Token-kezelés cache-sel
5. Alap végpontok (POST invoice, GET invoice, PUT collect, DELETE storno)
6. Hibakezelés + retry
7. Mock kliens tesztekhez

### C. Server actions
8. `oblio-actions.ts` — issueInvoice, markInvoicePaid, syncInvoiceStatus, stornoInvoice
9. `oblio-config-actions.ts` — getConfiguration, saveConfiguration, testConnection

### D. Frontend
10. Beállítás modal (integráció-szekció)
11. Rental tab — „Számlát kiállít" gomb + modal
12. Számla-historia kártya
13. Income dialog bővítés (collect jelzés)
14. Dashboard widget

### E. Polling / background sync
15. Supabase cron vagy Next.js revalidate mechanizmussal a `pending`/`sent` státuszú számlák státuszfrissítése óránként

### F. Dokumentáció
16. Használati útmutató 13. szekció (e-Factura)
17. Telepítési útmutató a lelkészeknek: Oblio fiók regisztráció + API secret megszerzése

---

## Árazási modell (gyülekezet szempontjából)

- **Oblio Smart csomag: 29 €/év** — korlátlan számla, korlátlan partner
- **Oblio ingyenes szint**: max. 3 dokumentum/hó — **nem elég** egy aktív bérleti portfóliónál
- **Ajánlás a lelkészeknek**: „Ha havi 3-nál több számlát állítasz ki, vedd meg a Smart csomagot — nagyjából 145 lei/év."

A KARTOTEKA-tól **nem kérünk** az Oblio licencért semmit — a lelkész a saját Oblio-ján rendelkezik.

---

## Kockázatok

1. **API változás** (endpoint, mezők, auth mechanizmus) — az abstrakciós réteg miatt **lokalizált hatás**. Figyelő: az Oblio doksi RSS-éről, vagy havonta manuális ellenőrzés.
2. **Token expiráció** — rossz implementáció esetén minden kérés 2× megy (első: expired, második: retry). **Mitigáció**: proaktív refresh a lejárat előtt 5 perccel.
3. **ANAF SPV outage** — az Oblio sem tud mit kezdeni vele. **Mitigáció**: a `pending` állapot visszapollingolódik, és 24 óra után ha még `pending`, figyelmeztetés a lelkésznek.
4. **Oblio Smart licenc lejárat** — ha a gyülekezet nem fizet, a számlakiállítás **hibát dob**. **Mitigáció**: 7 nappal a lejárat előtt figyelmeztetés a dashboardon.
5. **CUI / CIF validáció** — rossz formátumú gyülekezeti CIF esetén az ANAF elutasítja. **Mitigáció**: a beállítás-mentéskor formátumellenőrzés + `/api/nomenclature/companies` hívás validációnak.
6. **Magánszemély vs. cég bérlő** — a CNP (13 jegyű személyi kód) és a CUI (5-10 jegyű cégkód) eltérő. A szerződésben mindkettőt támogatni kell.
7. **Korábbi kézi számlák** — ha a gyülekezet eddig papíron számlázott, a **számsorozat folytonosság** kérdés. **Mitigáció**: a felhasználó beállíthatja a kezdő sorszámot a sorozatban.
8. **Biztonság — API secret szivárgás** — RLS + vault + soha ne logold. Audit log: ki, mikor állított be új secretet.

---

## Nyitott kérdések

1. **Oblio fiók regisztráció segédanyag** — készítsek egy screenshotos útmutatót a lelkészeknek, hogyan nyissanak Oblio fiókot és hogyan szerezzék meg az API secret-et? — **Javaslat**: igen, ez a rendszer használhatóságához fontos.
2. **Automata havi számlázás** — egy havi ciklusú bérleti szerződés esetén a rendszer **automatikusan** állítsa ki a havi számlát, vagy mindig **kézi jóváhagyás** legyen? — **Javaslat**: **kézi jóváhagyás** az első körben, később opcionális „auto-számlázás" bekapcsolható kategória-szinten.
3. **Számla nyelve** — a román ANAF-hoz román, de a KARTOTEKA-ban megjelenített szövegek magyar. A számla **román nyelven** megy az Oblio-nak → az ANAF is románul kéri. A KARTOTEKA-beli kijelző **magyar nyelvű** lesz (user-friendly).
4. **Proforma támogatás** — egyes gyülekezetek először proformát küldenek, fizetéskor konvertálják számlára. **Javaslat**: **későbbi kör**, most csak sima számla.
5. **Partner regiszter** — az Oblio-ban van, a KARTOTEKA-ban még nincs. Készítsünk-e KARTOTEKA-oldali partner-katalógust, vagy **minden számla-kiállításkor** a felhasználó megadja a bérlő adatait (illetve az `berleti_szerzodes.berlo_nev`, `ceg_nev`, `ceg_adoszam` meglévő mezőkből veszi)? — **Javaslat**: elég a meglévő mezőkből, partner-regiszter **nem szükséges** az első körben.
6. **Sztornó kezelés** — ha valaki kifizetett számlát sztornóz, az **Oblio-ban DELETE** is megy, vagy csak **lokálisan** jelöljük? — **Javaslat**: **mindkettő** (Oblio DELETE + lokális `stornozott = true`). A `DELETE` az Oblio-ban csak ha nincs kiállítva (pl. még tervezet); ha már elkészült és SPV-be felment, valójában **sztornó-számla** kell (külön POST).
