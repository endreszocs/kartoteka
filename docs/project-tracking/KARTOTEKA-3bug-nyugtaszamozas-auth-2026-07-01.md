# Kartotéka — 3 hiba diagnózisa és javítása (2026-07-01)

Ág: `fix/receipt-numbering-and-auth` · Állapot: **kód kész, NINCS deploy** (a felhasználó
kifejezett kérésére csak jelzésre deployolunk). A Bug 2 DB-oldali, kézzel futtatandó SQL-ekkel.

Módszertan: 4-ágenses párhuzamos kód-audit (receipt data model / entry UI / server actions / auth),
majd célzott javítás. A teljes ágens-riport: a session `tasks/wv4zp8iv4.output` fájlban.

---

## Bug 1 — Ismeretlen Google-fiók a regisztrációs oldalra kerül „nincs regisztrálva" helyett

### Gyökérok
- A `handle_new_user` DB-trigger MINDEN friss `auth.users` sorra létrehoz egy `pending` profilt —
  a Google-lel belépő ismeretlen emailre is.
- A `resolvePostLoginDestination` (`apps/web/lib/auth/post-login-destination.ts`) ezt „hiányos
  regisztrációnak" látta (van profil, nincs egyházmegye, nincs access_request) → `'complete'` →
  `/oauth-complete` regisztrációs űrlap. A jelszavas útnak VAN „nincs regisztrálva" ellenőrzése
  (`login_email_status`), az OAuth-nak nem volt.

### Javítás (kód — shippel a következő deploynál)
- `post-login-destination.ts`: új `'not_registered'` cél + `opts.via` paraméter. OAuth-ágon az
  ismeretlen email `'not_registered'`-et ad (nem `'complete'`).
- `auth/callback/route.ts`: `via:'oauth'`; `not_registered` → signOut + `/login?error=not_registered`.
- `login/actions.ts`: `via:'password'` (a jelszavas viselkedés változatlan — a `'complete'` megmarad).
- `login/page.tsx`: `error=not_registered` → „Ez az e-mail cím nincs regisztrálva…".

### Mellékhatás + követő (opcionális SQL)
- A trigger által létrehozott `pending` profil bent marad. Diagnosztika + kézi törlés:
  `migration-docs/sql/2026-07-01-bug1-arva-oauth-profilok-diagnostika.sql`.
- Hosszabb távú keményítés (nem ebben a körben): a `handle_new_user` trigger ne hozzon létre
  profilt meghívó/access_request nélküli OAuth-userre.

---

## Bug 2 — Második email UGYANAHHOZ az egyházközséghez, de nem lát adatot

### Gyökérok (szigorúan ellenőrizve a kódból)
- Minden egyházközségi tábla RLS-e a `current_user_can_access_congregation()` →
  `current_user_congregation_id()` függvényen dönt, ami KIZÁRÓLAG a hívó SAJÁT
  `profiles.congregation_id` skalárját nézi `status='active'` mellett
  (`migration-docs/sql/2026-04-12-phase-0-rls-hardening.sql:39-100`).
- A `profile_roles` (több-szerep) táblát az RLS **nem** veszi figyelembe — az app-réteg
  (`effective-access.ts`) viszont igen. Ezért ha a második fiók `profiles.congregation_id`-ja
  NULL/rossz (vagy `status<>'active'`), a DB üres listát ad, hiába „jó" a profile_role.
- A legvalószínűbb csapda: `admin_activate_user` a congregation_id-t CSAK `pending` állapotban írta
  (`2026-05-04-admin-user-status-rpc.sql:117`). Egy már `active` második fiók egyházközségét így
  nem lehetett (újra)beállítani.

### Kapcsolódás a nyugta-autofillhez
- Ha a második fiókon nincs scope (NULL congregation), a `getNextReceiptNumbers` sem talál előzményt
  → a Chitanță „Kerületi sz." autofill üres marad. **Bug 2 rendezése az autofillt is helyreteszi**
  ezen a fiókon (a rögzítő kliens-logikája és bekötése helyes — ellenőrizve).

### Javítás (DB — a felhasználó futtatja Supabase SQL editorban)
1. **Diagnosztika:** `2026-07-01-bug2-masodik-email-diagnostika.sql` — a MŰKÖDŐ és a HIBÁS fiók
   profil/profile_roles összevetése, az egyházközség adatszámai, „mit látna az RLS".
2. **Célzott javítás:** `2026-07-01-bug2-masodik-email-javitas.sql` — a második fiók
   `profiles.congregation_id`-ját a működő fiók egyházközségére állítja + `status='active'`, és
   biztosít egy jóváhagyott+aktív congregation-scope `profile_roles` sort. Idempotens.
3. **Megelőzés (RPC):** `2026-07-01-admin-activate-user-reassign.sql` — az `admin_activate_user`
   már-aktív fiókra is beírja a megadott org-mezőket (visszafelé kompatibilis).
4. **OPCIONÁLIS rendszerszintű:** `2026-07-01-bug2-rls-comembership-OPCIONALIS.sql` — az RLS
   `current_user_can_access_congregation` bővítése co-membershipre (jóváhagyott+aktív
   congregation-scope profile_role). Éles előtt staging-teszt ajánlott.

---

## Bug 3 — Nyugtafigyelő téves riasztás + Kerületi sz. / Irat sz. megkülönböztetés

### Adatmodell (megerősítve)
- `befizetes.iratszam` = **Kerületi sz.** (kerülettől kapott, nyomtatott, nagy szám — pl. 115019).
- `befizetes.nyugta`   = **Irat sz.** (gyülekezet saját, évente újrainduló sorszáma — pl. 1..77).
- Kiadásnál nincs külön gyülekezeti szám (`kiadas.nyugta` = `iratszam` tükör).
- Legacy/import „tükör" sorok: `nyugta === iratszam`.

### Gyökérok (nyugtafigyelő)
- `computeReceiptHealth` (`penzugy/actions.ts:152`) a `iratszam || nyugta` értéket EGY sorozatként
  ellenőrizte → a nagy kerületi (~115019) és a kis gyülekezeti (1..77) számokat összemosta:
  ~115000 hamis „hiányzó", ~310 hamis „duplikátum", hamis dátumhibák.

### Javítás (kód)
- **Nyugtafigyelő:** mostantól kizárólag a gyülekezeti saját sorszámot (`nyugta`) követi, a tükör
  sorokat (`nyugta === iratszam`) kihagyva, az év tényleges első–utolsó nyugtája között (nem 1-től).
  UI: cimke-pontosítás + 50 elemes védelmi cap a listákon (`finance-tabs.tsx`).
- **Mindkét szám látszik a listákban:** `CashbookTab` + `TransactionsTab` „Iratszám" oszlopa most a
  Kerületi sz.-ot fő értékként, alatta az Irat sz.-ot (nyugta) mutatja, ha külön rögzített.
  (A rögzítő ablak eddig is mutatta mindkettőt.)
- **Autofill:** a kliens-logika és a bekötés helyes (ellenőrizve: `CombinedEntryBody.tsx`
  handleDocTypeChange/fillReceiptNumbers, `combined-entry-dialog.tsx` bekötés, `getNextReceiptNumbers`).
  A „nem tölt ki" tünet a hozzáférhető előzmény hiányából ered (Bug 2 scope) — annak rendezésével áll helyre.

### Érintett fájlok
- `apps/web/app/(dashboard)/penzugy/actions.ts` (computeReceiptHealth)
- `apps/web/components/finance/finance-tabs.tsx` (riasztás szövege + cap)
- `packages/ui-app/src/finance/CashbookTab.tsx`, `TransactionsTab.tsx` (mindkét szám a listában)

---

## Commitok (fix/receipt-numbering-and-auth ág)
1. `fix(penzugy+auth)`: nyugtafigyelő az Irat sz.-t figyeli + ismeretlen Google-fiók elutasítása
2. `feat(penzugy)`: a listákban is látszik a Kerületi sz. és az Irat sz.
3. (ez a doc + Bug 2 SQL-ek + CHANGELOG)

## Hátralévő / a felhasználóra vár
- Bug 2 SQL-ek lefuttatása a Supabase SQL editorban (diagnosztika → javítás; opcionálisan RPC + RLS).
- Deploy a felhasználó kifejezett jelzésére (`csak akkor deployolj ha megkérlek rá`).
