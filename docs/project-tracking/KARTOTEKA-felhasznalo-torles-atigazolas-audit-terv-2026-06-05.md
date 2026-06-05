# Kartotéka — Fejlesztési terv: Felhasználó-törlés, Gyülekezet-átadás, Audit-napló

**Dátum:** 2026-06-05
**Státusz:** TERVEZET (megvalósítás előtt jóváhagyásra vár)
**Szerző:** fejlesztői előkészítés (Endre kérésére), kódbázis-feltérképezéssel + webes best-practice kutatással

Ez a dokumentum **három** kért fejlesztés átfogó terve. Most **nem** írunk éles kódot — a cél az átgondolt javaslat, hogy Endre eldönthesse, mit és milyen sorrendben valósítsunk meg.

---

## 0. Vezetői összefoglaló

| # | Funkció | Lényeg | Nehézség | Új DB-objektum |
|---|---------|--------|----------|----------------|
| 1 | **Felhasználó-törlés** | Lelkész kilép/nyugdíjba megy → fiók megszűnik, de a gyülekezeti (pénzügyi, anyakönyvi) adat megmarad | Közepes | `erasure_requests` + `anonymized_at` oszlopok |
| 2 | **Gyülekezet-átadás** | Lelkész másik gyülekezetbe megy → a korábbi gyülekezet koordinálását más veszi át, **rendszergazda + egyházmegyei számvevő közös jóváhagyásával** | Magas | `congregation_transfers` + audit |
| 3 | **Audit-napló** | Ki, mikor, mit módosított — visszakövethető, visszaélés-vizsgálathoz | Közepes (van alap!) | `audit.record_version` + `activity_log` bővítés |

**Kulcs-felismerés:** a 3. ponthoz **már van alap** — létezik `audit_log` tábla, `log_audit_event()` RPC, `audit_log_with_profiles` nézet és `apps/web/lib/audit/log.ts`. Jelenleg viszont **csak az eszköz-műveletekhez** (device revoke/restore) van bekötve. Tehát ez nagyrészt **kiterjesztés**, nem nulláról építés.

**Közös, mindhárom funkciót érintő, KRITIKUS technikai alap:** amikor a rendszer **service-role klienssel** ír (a Kartotéka sok helyen ezt teszi, hogy megkerülje az RLS-t), az adatbázis **nem látja, ki a felhasználó** (`auth.uid()` NULL lesz). Ezért az audit/törlés/átadás minden írásánál a felhasználó azonosítóját **explicit be kell injektálni** egy tranzakció-lokális változóba (`set_config('app.actor_id', …, true)`). Enélkül az audit-sorok „névtelenek" lennének — ez a jelenlegi legnagyobb rejtett kockázat.

---

## 0/b. Eldöntött részletek (2026-06-05, Endre)

- **#1 Törlés:** a **végleges törlés** a jó út, de **CSAK a személyes adat + az autentikáló email** anonimizálódik/törlődik — **semmi más nem törlődik** (a gyülekezetet más veszi át). + **Lelkészi szolgálati napló** fül a gyülekezeti adatok közt (mikor regisztrált / vette át / adta át — lelkész-lista pontos időpontokkal). **[IMPLEMENTÁLVA: F2a, lásd lent]**
- **#2 Átadás indítása:** az átadást a **TÁVOZÓ lelkész** indítja egy gombbal, amikor készen áll → **értesítést kap az adott egyházmegye számvevője ÉS a rendszergazda**. Ha az egyházmegyében **nincs még regisztrált számvevő**, akkor **a rendszergazda jóváhagyása elég** (a rendszergazda veszi fel a kapcsolatot a számvevővel). A **rendszergazda adja meg** a beérkező lelkésznek a jóváhagyást a gyülekezeti **lelkészi szerepre**.
- **#3 Audit:** a terv szerint.

**Megvalósítás-haladás:** F1 (audit-alap) ✅ · F2a (lelkészi szolgálati napló) ✅ · F2b (fiók végleges törlése = GDPR-anonimizálás) ✅ · **F3a (átadás INDÍTÁSA + értesítés)** ✅ — mind deployolva. Az `initiate_congregation_transfer()` RPC + `congregation_transfers`/`congregation_remarks` táblák; a távozó lelkész a „Lelkészek" fülön indítja → admin + egyházmegyei számvevő értesül (in-app + email). Következik: **F3b** (read-only review + jóváhagyás/meghagyás), **F3c** (végrehajtás + bejövő lelkész jóváhagyása/meghívása), **F4** (sor-szintű audit).

**Endre újabb észrevételei (2026-06-05), beépítendők:**
- **Bejövő lelkész email** (F3c): a rendszergazda jóváhagyásakor az új lelkész emailt kap; ha még NINCS a rendszerben, regisztrálnia kell (a meglévő hozzáférés-kérés flow-n át, amit az admin a gyülekezethez hagy jóvá).
- **Saját profil törlése** (új, ÚTon): a lelkész a **header lenyíló menü → Beállítások**-ban törölheti a saját profilját → a gyülekezet **megürül** (felelős nélkül marad), ezt a **rendszergazda látja** (üres gyülekezet + értesítés). Self-erasure RPC (a felhasználó saját magát anonimizálja), congregation_id ürül, tenure lezárul.
- **Inaktív gyülekezetek** (új, tervbe): ahol **1 éve nincs aktivitás** → `congregations.status='inactive'`. Kell egy congregations.status oszlop + utolsó-aktivitás jel + `pg_cron` napi/heti söprés. (F4 körül, az audit/last_seen alapokra építve.)

---

## 1. Meglévő infrastruktúra (amire építünk)

A feltérképezés alapján ezekre támaszkodunk (ne építsünk újra meglévőt):

### Felhasználó / szerepkör / gyülekezet
- **`profiles`** — `id` (FK `auth.users`), `status` (`pending`|`active`|`rejected`), `role` (elsődleges), `congregation_id`, `diocese_id`, `district_id`, `revision`, `updated_at`, `onboarding_completed_at`. A `handle_new_user` trigger hozza létre minden `auth.users` insertkor.
- **`profile_roles`** — több-szerepkör (scope: `system`/`district`/`diocese`/`congregation`, `approval_status`, `granted_by`/`approved_by`/`revoked_by` + időbélyegek). **Már van benne revoke-mechanizmus!**
- **`profile_congregations`** — könyvelő/számvevő ↔ gyülekezet több-a-többhöz (`role_scope`, `approval_status`, `active`). Admin RPC-k: `admin_create_or_reinit_assignment()`, `admin_revoke_assignment()`.
- **`access_requests`** — regisztrációs kérelmek, `reviewed_by`/`reviewed_at`/`resulting_user_id`, `ip_hash`, `user_agent`. (Az átigazolás-állapotgép mintája lehet.)
- **`admin_access_requests`** — admin ideiglenes hozzáférés egy gyülekezethez, a **lelkész jóváhagyásával** (`approved_at`, `pastor_user_id`, `expires_at`). **Ez már egy egyszerű két-fél-jóváhagyási minta** — az átadás bővített változata lehet.
- **Admin user-státusz RPC-k** — `admin_activate_user()`, `admin_reject_user()`, `admin_create_or_reinit_assignment()` (SECURITY DEFINER, belső jogosultság-ellenőrzéssel).

### Audit / soft-delete (MÁR LÉTEZIK)
- **`audit_log`** tábla — `user_id`, `device_id`, `action`, `target_table`, `target_id`, `metadata` (JSONB), `ip`, `user_agent`, `created_at`. Insert-only, RLS (saját + admin). Helper RPC: **`log_audit_event(...)`**. Forrás: `migration-docs/sql/2026-04-23-m0-5-devices-licenses-audit.sql`.
- **`audit_log_with_profiles`** nézet — admin UI-hoz (user_email, user_full_name JOIN). `security_invoker = true`.
- **`apps/web/lib/audit/log.ts`** — `logAuditEvent()` app-szintű wrapper (fire-and-forget). Jelenleg csak `devices-licenses-actions.ts` használja.
- **Sync-tracking** — ~60 táblán `revision` (BIGINT) + `updated_at` + `sync_tracking_touch()` trigger (offline-sync + optimista zár). **Ez NEM audit** (nem őrzi a régi értéket, sem ki módosította), de jelzi, mely táblák „user-szerkeszthetők".
- **Pénzügyi storno** — `befizetes`/`kiadas`: `stornozott`, `stornozott_at`, `stornozott_indok`, `stornozott_by` (ki sztornózott). Jó minta a „ki + mikor + miért".
- **Soft-delete minták** — `deleted` (pénzügy), `isvisible` + `member_status='törölt'` (tagok), `archived`/`archived_at` (értesítések).
- **`ip_hash`** — GDPR-barát IP-tárolás (`lib/utils/ip-hash.ts`, SHA-256 + só).
- **Service-role admin kliens** — `lib/supabase/admin-client.ts` (`getSupabaseAdminClient()`), az RLS megkerülésére.

### Hiányosságok (amiket ez a terv pótol)
- A **god-mode** aktiválás/admin-override **nincs auditálva**.
- Nincs **`last_login`/`last_seen`** a `profiles`-on.
- Nincs **soros adat-szintű audit** („mi volt a régi érték") — csak revision-számláló.
- A service-role írásoknál a **felhasználó azonosítója elveszik** az adatbázisban.
- Nincs **felhasználó-törlés** és **gyülekezet-átadás** munkafolyamat.

---

## 2. Funkció #1 — Felhasználó törlése (GDPR-konform)

### Probléma
Egy lelkész felhagy a hivatással / nyugdíjba megy → szeretné törölni a profilját. **DE** a gyülekezet pénzügyi (járulék) és anyakönyvi adatai **jogi megőrzési kötelezettség** alatt állnak, és a „ki rögzítette" hivatkozások nem törölhetők következmény nélkül.

### Best-practice irány (kutatás alapján)
- **Nem kemény törlés**, hanem **helyben anonimizálás (soft-delete)** + a megosztott (gyülekezeti) adat megtartása. A GDPR „elfeledtetéshez való jog" (17. cikk) **összeegyeztethető** a jogi megőrzéssel (17(3) cikk) **visszafordíthatatlan anonimizálással**.
- A **személyes PII-t** (saját név, email, telefon) anonimizáljuk; a **gyülekezeti megosztott adat** érintetlen marad.
- A `created_by`/`rögzítette` hivatkozásokat **NE** `SET NULL`-ozzuk, ha kell az audit-nyom — a (most már anonimizált) profil-sor maradjon a helyén, hivatkozhatóan.
- A Supabase `auth.users` törlése **külön lépés**: `supabase.auth.admin.deleteUser(id)` (csak service-role, szerver-oldal). Ez **nem** kaszkádol a `public` táblákra — ezért kétlépcsős, egyetlen RPC-be zárt folyamat kell.

### Javasolt megoldás

**A. Adatmodell-bővítés**
- `profiles`: új `anonymized_at timestamptz`, `deleted_at timestamptz`, és bővített `status` érték: `'deleted'` (a `pending`/`active`/`rejected` mellé).
- Új **`erasure_requests`** ledger (megfelelőség bizonyításához): `id`, `subject_user_id`, `requested_by`, `requested_at`, `reason`, `legal_basis text` (pl. „adóügyi/anyakönyvi megőrzés — 17(3)"), `anonymized_fields jsonb`, `retained_data text`, `executed_at`, `executed_by`.

**B. Folyamat (kétféle „törlés")**
1. **Deaktiválás (visszafordítható)** — `status='inactive'` (új), a fiók nem léphet be, de minden adat marad. Ez a „nyugdíjba ment, de még visszajöhet / archív" eset. Egyszerű admin-művelet.
2. **Végleges törlés / anonimizálás (visszafordíthatatlan)** — egyetlen `SECURITY DEFINER` RPC, `admin_erase_user(p_user_id, p_reason, p_legal_basis)`:
   - Jogosultság-ellenőrzés (csak admin; lásd lent: ki kezdeményezhet).
   - **Tiltó feltétel:** ha a felhasználó **egy gyülekezet egyetlen aktív koordinátora**, a törlés **csak átadás után** engedélyezett (lásd #2). → A rendszer figyelmeztet: „Előbb add át a gyülekezetet."
   - Anonimizálás: `full_name → 'Törölt felhasználó'`, `email → 'deleted+<uuid>@kartoteka.invalid'` (vagy hash), `phone → NULL`, `birth_date → NULL`; `profile_roles`/`profile_congregations` → `active=false`, `approval_status='revoked'`.
   - `anonymized_at = now()`, `status='deleted'`.
   - `erasure_requests` sor írása (mit anonimizáltunk, mit tartottunk meg, jogalap).
   - **Audit** (lásd #3): `action='user.erase'`.
   - Végül **opcionálisan** `auth.admin.deleteUser()` (a login végleg megszűnik) — vagy soft-delete az auth oldalon. *Döntési pont (lásd lent).*
3. **Saját kérés (önkiszolgáló):** a lelkész a profilján kérheti a törlést → ez egy **kérelmet** hoz létre (`erasure_requests`, `status='requested'`), amit **admin hagy jóvá** (nem azonnali, mert előbb ellenőrizni kell a gyülekezet-átadást). Ez illeszkedik a GitHub/Google mintához (a tulajdonosi adat átadása megelőzi a fiók megszűnését).

**C. Ki kezdeményezhet / hagyhat jóvá?**
- Önkiszolgáló kérés: bárki a saját fiókjára.
- Végrehajtás: **admin** (`isAdminRole`), a gyülekezet-átadottság ellenőrzése után. (Opcionálisan magasabb biztonság: a végleges törlés is két-fél-jóváhagyással, mint a #2 — de ez túlzás lehet; döntési pont.)

**D. GDPR-megfelelőség**
- Anonimizálás visszafordíthatatlan (név csere, email hash/tombstone, telefon NULL) — összhangban a meglévő `ip_hash` filozófiával.
- `erasure_requests` ledger = bizonyíték a hatóság felé + a megtartott adat jogalapja.
- Az **audit-naplóban is anonimizálni** kell a PII-t (lásd #3), de a vázat (ki-mikor-mit, anonim azonosítóval) megőrizzük.

### Nyitott döntések (#1)
- **D1.1** A végleges törlésnél az `auth.users`-t **kemény töröljük** (login végleg eltűnik) vagy **soft-delete**-eljük? Javaslat: kemény törlés (a fiók valóban megszűnik), az anonimizált `profiles`/adat marad.
- **D1.2** Legyen-e külön „deaktiválás" (visszafordítható, archív) a „törlés" mellett? Javaslat: **igen** — sok valós eset csak nyugdíj/szünet, nem végleges törlés.
- **D1.3** A végleges törléshez kell-e két-fél-jóváhagyás (mint #2), vagy elég az admin? Javaslat: elég az admin + a kötelező „gyülekezet átadva" előfeltétel.

---

## 3. Funkció #2 — Átigazolás másik gyülekezetbe (kontrollált átadás)

### Probléma
A lelkész másik gyülekezetbe megy. A **korábbi** gyülekezet (amit eddig ő koordinált) profilját/adatait ezután **más** fogja irányítani. Az átadás-átvétel a **rendszergazda** ÉS az **egyházmegyei számvevő** közös munkájával történjen.

### Best-practice irány (kutatás: GitHub / Google Workspace / Stripe / Atlassian + maker-checker)
- **„Re-point, ne migrálj"** — a gyülekezeti adat a `congregation_id`-hez tartozik, nem a felhasználóhoz. Az átadás **csak a felelős-mutatót** mozgatja, **nulla adatmásolás** (GitHub: az issue-k/history a repónál maradnak; Stripe: a connected account adata marad).
- **Két, független szerepű jóváhagyó** (admin + számvevő) — ez a „négy/hat-szem-elv" (maker-checker) szigorúbb változata. **Rendszer-szinten kikényszerítve** (DB CHECK + tranzakciós RPC), nem csak szabályzatban.
- A **bejövő** felelős **explicit elfogadja** az átvételt (GitHub/Stripe minta) — kivéve a „nincs még utód → ideiglenes gondnok" eset.
- A **távozó** lelkész **lefokozva, nem törölve** — opcionális rövid átfedési ablak, majd hozzáférés visszavonása.
- **Időkorlát** (`expires_at`) + **visszavonhatóság**; befejezett átadás **visszafordítása csak új, ellentétes irányú átadással** (szintén két-fél jóváhagyással).
- A **távozó nem kell, hogy cselekedjen** — az admin+számvevő pár akkor is végigviszi, ha a lelkész már elment (Google/Atlassian minta). Ez kulcs.

### Javasolt megoldás

**A. Adatmodell**
- `congregations`: opcionális `responsible_user_id uuid` (a jelenlegi felelős). *Megjegyzés:* jelenleg nincs explicit „tulajdonos" oszlop — a kapcsolat `profiles.congregation_id`-n át van. Az átadáshoz tisztább egy explicit mutató; de megoldható a `profiles.congregation_id` újrahuzalozásával is. **Döntési pont (D2.1).**
- Új **`congregation_transfers`** (állapotgép-rekord):
  `id`, `congregation_id`, `from_user_id`, `to_user_id`, `status`, `reason`, `initiated_by`, `admin_id`, `admin_approved_at`, `auditor_id`, `auditor_approved_at`, `accepted_at`, `executed_at`, `expires_at`, `created_at`, `version int`.
  CHECK constraintek (rendszer-szintű kikényszerítés):
  - `distinct_approvers`: `admin_id <> auditor_id` (igazi négy-szem).
  - `distinct_from_to`: `from_user_id <> to_user_id`.
- Új **`congregation_transfer_audit`** (append-only állapotátmenet-napló) — vagy a közös `audit_log`/`activity_log` használata (lásd #3).

**B. Állapotgép**
```
DRAFT → REQUESTED → (admin jóváhagy ÉS számvevő jóváhagy, sorrend mindegy) → READY
      → (bejövő lelkész elfogad) → EXECUTING → COMPLETED
oldal-kijáratok: REJECTED | CANCELLED | EXPIRED | FAILED
```
- `READY` csak akkor, ha **mindkét** időbélyeg megvan, **két különböző** felhasználótól, **két különböző** szerepben.
- Végrehajtás (atomikus, idempotens, egyetlen `SECURITY DEFINER` RPC `execute_congregation_transfer(transfer_id)`):
  1. Újra-ellenőrzi mindkét jóváhagyást + a jóváhagyók szerep-tagságát (admin; a számvevő **ehhez a gyülekezethez tartozó egyházmegyében**).
  2. Átállítja a felelőst (`responsible_user_id` és/vagy a bejövő `profiles.congregation_id`).
  3. A távozót **lefokozza** (read-only/observer az adott gyülekezeten) — opcionális átfedési ablakkal, majd visszavonás.
  4. `profile_roles`/`profile_congregations` frissítése (régi gyülekezet-scope revoke, új grant).
  5. Audit-sorok írása minden átmenetről.
- **Értesítés**: mind a négy fél (távozó, bejövő, admin, számvevő) emailt kap (Brevo / `noreply@kartoteka.app`).

**B/2. Ellenőrző átadás-átvétel — read-only belépés + jóváhagyás (Endre kiegészítése, 2026-06-05)**

A jóváhagyás NEM „vakon" történik: a rendszergazda és a számvevő **ténylegesen átnézi a gyülekezet adatait**, mielőtt rábólint. Folyamat:

1. **Engedélyezés** — a (távozó) lelkész az átadás indításakor **engedélyt ad**, hogy a rendszergazda és a számvevő **belépjen a gyülekezet felületére**. Időkorlátos, gyülekezet-scope-os, **CSAK-OLVASHATÓ** hozzáférés (review-grant).
2. **Read-only review** — az admin és a számvevő külön-külön belép a gyülekezet nézetébe (tagok, pénzügy, anyakönyv, iktató, leltár stb.). **Mindent láthat, de semmit nem írhat/javíthat** — minden gomb/mező csak-olvasható. (A meglévő „belépés más gyülekezetébe" mechanizmus **read-only** változata.)
3. **Döntés / meghagyás** (fél-enként):
   - **„Rendben — átadás jóváhagyva"** gomb → beállítja az adott fél `*_approved_at` időbélyegét.
   - **„Észrevétel / meghagyás"** → szöveges megjegyzés, ami **a gyülekezethez rögzül** (új `congregation_remarks`: `congregation_id`, `transfer_id`, `author_id`, `author_role` admin|szamvevo, `szoveg`, `created_at`, `resolved`). A meghagyás NEM hagyja jóvá az átadást — visszairányít a rendezésre.
4. **Konvergencia** — ha **mindkét fél** (admin ÉS számvevő) a „Rendben"-t választotta → `READY`. Ha bármelyik meghagyást írt → `BLOCKED_BY_REMARKS`, amíg a meghagyásokat nem rendezik (`resolved`) és a fél újra jóvá nem hagy.
5. **Megnyílik az út** — `READY` (+ a bejövő lelkész elfogadása) után a végrehajtó RPC lefut, és az **új lelkész a szabály szerint** használhatja a rendszert; a review-grant lejár/visszavonódik.

**Biztonság / átláthatóság:** a read-only hozzáférés **a lelkész engedélyéhez** kötött, **időkorlátos**, és minden belépés/áttekintés/jóváhagyás **auditált** (`action='transfer.review.enter' | 'transfer.review.approve' | 'transfer.remark.add'`). A read-only kikényszerítés **rendszer-szintű** (a review-grant `access_mode='readonly'`, az RLS/RPC-k tiltják az írást). A meghagyások a gyülekezethez **láthatóan** rögzülnek.

**C. Élhelyzetek**
- **Nincs még utód** → az átvevő az **ideiglenes gondnok** (számvevő vagy admin); auto-elfogadás; `caretaker_held=true` jelző, hogy a UI állandó utódra ösztönözzön.
- **Visszafordítás** → új, ellentétes irányú átadás (teljes két-fél jóváhagyással), nem csendes rollback.
- **Ugyanazon rendszeren belüli költözés** → a fiók megmarad, csak a `congregation_id` huzalozódik újra + a régi gyülekezet hozzáférése visszavonva.
- **Admin == számvevő** → a `distinct_approvers` CHECK blokkolja.

**D. RLS / jogosultság**
- `congregation_transfers` RLS: a ki-/belépő lelkész a sajátját látja; admin mindet; számvevő csak a saját egyházmegyéjén belülieket. Az RLS a **láthatóságot** szabja; az RPC a **helyességet** kényszeríti.
- A `pg_cron` söpri a lejárt `REQUESTED`/`READY` rekordokat (`EXPIRED`) és küld emlékeztetőt (24h emlékeztető / 72h lejárat).

### Nyitott döntések (#2)
- **D2.1** Vezessünk-e be explicit `congregations.responsible_user_id` oszlopot, vagy maradjon a `profiles.congregation_id`-alapú kötés? Javaslat: **explicit oszlop** — tisztább átadás, egyértelmű „ki a felelős".
- **D2.2** A bejövő lelkész **elfogadása** kötelező legyen-e? Javaslat: **igen** (kivéve gondnok). Biztosítja a beleegyezést és a téves-cél elkerülését.
- **D2.3** Átfedési ablak alapértéke: **0 nap (tiszta váltás)** érzékeny egyházi/pénzügyi adatnál; az admin explicit adhat átmeneti ablakot. Javaslat: 0 nap default.
- **D2.4** Ki **kezdeményezhet** átadást? Javaslat: admin **vagy** a távozó lelkész (még távozás előtt) **vagy** a számvevő.

---

## 4. Funkció #3 — Audit-napló / tevékenység-követés

### Probléma
Visszakövethető legyen, **ki, mikor, mit** módosított egy adott időszakban — visszaélések és felelősök azonosításához.

### Best-practice irány (kutatás: Supabase supa_audit / pgAudit / GDPR)
- **Egyetlen, generikus JSONB audit-tábla** (supa_audit minta: `op`, `ts`, tábla, `record` + `old_record` JSONB) — nincs séma-migráció, ha a forrás-táblák változnak; egy helyen az egész rendszer „ki mit változtatott".
- **KRITIKUS:** a **felhasználó azonosítóját be kell injektálni** (`set_config('app.actor_id', …, true)`) minden írás-RPC elején, mert a service-role / SECURITY DEFINER írásoknál `auth.uid()` NULL. A triggerben: `COALESCE(current_setting('app.actor_id', true), current_setting('request.jwt.claim.sub', true))::uuid`.
- **Két, kiegészítő adatfolyam:**
  1. **Sor-változás** (trigger-alapú, generikus audit-tábla) — DB-szintű „mi változott".
  2. **App-esemény** (explicit `activity_log`, a szerver-action-ökből) — bejelentkezés, export, PDF, **god-mode aktiválás**, admin-override, „érzékeny rekord megtekintve". A triggerek ezeket NEM látják, de a számvevőt pont ezek érdeklik.
- **Append-only / sérthetetlen** — csak `INSERT` jog; `UPDATE`/`DELETE` REVOKE; külön `audit` séma; opcionálisan hash-lánc.
- **Index**: BRIN a `ts`-en (idő-tartomány gyors), BTREE `(actor_id, ts)` és `(tenant_id, ts)`. **Havi partíció** + `pg_cron` a karbantartáshoz.
- **RLS olvasásra**: csak admin + az adott egyházmegye **számvevője** láthatja (a trigger SECURITY DEFINER-rel ír, így az írás nem törik).
- **GDPR**: törléskor az audit-sorokat **anonimizáljuk** (PII csere a `metadata`/JSONB-ben), nem töröljük (17(3) megőrzés).

### Javasolt megoldás (3 fázisban, a meglévőre építve)

**3/A — „Olcsó győzelem": a meglévő `audit_log` kiterjesztése app-eseményekre.**
- `lib/audit/log.ts` már kész — bekötjük a **fontos admin/biztonsági műveletekbe**, amik MA nincsenek auditálva:
  - god-mode be/ki, admin-override be/ki,
  - access-request jóváhagyás/elutasítás,
  - felhasználó-státusz váltás, szerep grant/revoke,
  - felhasználó-törlés (#1), gyülekezet-átadás (#2),
  - pénzügyi évzárás/feloldás, tömeges törlés.
- `profiles.last_seen_at` bevezetése (middleware/auth-callback frissíti) → „ki használta a rendszert egy időszakban".
- **Actor-id injektálás** bevezetése a meglévő admin RPC-kben (ez a legfontosabb javítás).

**3/B — Adat-szintű audit a kulcstáblákra (supa_audit minta).**
- Új `audit` séma + generikus `audit.record_version` tábla + trigger-függvény.
- Rákötjük a **biztonság/pénzügy szempontból kritikus** táblákra (nem mind a 60-ra — teljesítmény): `befizetes`, `kiadas`, `szemely` (PII), `profiles`, `profile_roles`, `congregations`, `bealitas`, `jarulek_kedvezmeny`, `felmentes`.
- A trigger a `app.actor_id`-ből veszi a felhasználót.

**3/C — Auditor-felület + GDPR-anonimizálás.**
- Admin/számvevő UI: „Tevékenység-napló" — szűrés időszakra, felhasználóra, gyülekezetre, műveletre; a sor-változásnál a régi→új érték megtekintése.
- Havi partíció + `pg_cron` retenció.
- A #1 törlés-folyamat anonimizálja az audit PII-t (vázat megőrizve).

### Nyitott döntések (#3)
- **D3.1** Mely táblák kapjanak **sor-szintű** auditot (3/B)? Javaslat: a fenti kritikus lista (pénzügy + PII + jogosultság), nem mind.
- **D3.2** Mennyi a **retenció**? Javaslat: pl. 5 év (igazodva az egyházi/adóügyi megőrzéshez), havi partícióval.
- **D3.3** A számvevő **olvashatja-e** a teljes gyülekezeti audit-naplót, vagy csak a pénzügyit? Javaslat: a saját egyházmegyéje gyülekezeteinek auditját, pénzügyi fókusszal.

---

## 5. Közös alapok (mindhárom funkcióhoz)

1. **`app.actor_id` injektálás** — minden írás-RPC és service-role írás elején `set_config('app.actor_id', <user-uuid>, true)`. **Ez az első és legfontosabb lépés**, a #3 és a megbízható audit alapja.
2. **`audit`/`erasure`/`transfer` SECURITY DEFINER RPC-k** — a meglévő minta (belső jogosultság-ellenőrzés) követése.
3. **Anonimizálás-primitív** — a meglévő `ip_hash` filozófia kiterjesztése email/telefon törlésére.
4. **RLS olvasásra, append-only írásra** — audit/transfer/erasure táblákon.
5. **Email-értesítés** — a meglévő Brevo / `noreply@kartoteka.app` setup.
6. **Minden SQL külön fájlként** a `migration-docs/sql/`-be (a user futtatja kézzel — nincs Supabase MCP a Kartotékához).

---

## 6. Javasolt ütemterv (fázisok)

| Fázis | Tartalom | Függ |
|-------|----------|------|
| **F0** | `app.actor_id` injektálás a meglévő admin RPC-kbe + `last_seen_at` | — |
| **F1** | #3/A: meglévő `audit_log` bekötése a kritikus admin/biztonsági műveletekbe + auditor-olvasás RLS | F0 |
| **F2** | #1: deaktiválás + GDPR-anonimizáló törlés (`erasure_requests`, RPC, UI) | F0 |
| **F3** | #2: `congregation_transfers` állapotgép (admin+számvevő dual-control, elfogadás, végrehajtó RPC, értesítések) | F2 (a törlés előfeltétele az átadottság) |
| **F4** | #3/B–C: sor-szintű audit a kulcstáblákra + auditor-UI + partíció/retenció + audit-anonimizálás | F1 |

**Javasolt kezdés:** **F0 + F1** (legkisebb kockázat, azonnali érték: „ki mit csinált" a fontos műveleteknél), majd **F2** (törlés), végül **F3** (átadás) és **F4** (teljes audit).

---

## 7. Összegzett nyitott döntések (Endre dönt)

1. **D1.1** Végleges törlésnél `auth.users` kemény törlés vs. soft-delete? *(Javaslat: kemény.)*
2. **D1.2** Külön „deaktiválás" (archív) a törlés mellett? *(Javaslat: igen.)*
3. **D2.1** Explicit `congregations.responsible_user_id` oszlop? *(Javaslat: igen.)*
4. **D2.2** A bejövő lelkész kötelező elfogadása? *(Javaslat: igen, kivéve gondnok.)*
5. **D2.3** Átfedési ablak default 0 nap? *(Javaslat: igen.)*
6. **D3.1** Mely táblák kapjanak sor-szintű auditot? *(Javaslat: pénzügy + PII + jogosultság.)*
7. **D3.2** Audit-retenció hossza? *(Javaslat: ~5 év, havi partíció.)*
8. **Sorrend** — F0+F1 → F2 → F3 → F4 rendben van-e?

---

## 8. Hivatkozott források (best-practice kutatás)

**Audit-naplózás / Postgres-Supabase:**
- Supabase — Postgres Auditing in 150 lines of SQL: https://supabase.com/blog/postgres-audit
- supa_audit extension: https://github.com/supabase/supa_audit
- Felhasználó-id triggerben (service-role pitfall): https://github.com/orgs/supabase/discussions/22769
- pgAudit vs supa_audit: https://pganalyze.com/blog/5mins-postgres-auditing-pgaudit-supabase-supa-audit

**GDPR-törlés:**
- Supabase `auth.admin.deleteUser`: https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
- Right to be Forgotten vs Audit Trail: https://axiom.co/blog/the-right-to-be-forgotten-vs-audit-trail-mandates
- GDPR-konform törlés: https://www.reform.app/blog/best-practices-gdpr-compliant-data-deletion

**Tulajdonos-átadás / maker-checker:**
- Maker-Checker implementációs útmutató: https://www.opcito.com/blogs/maker-checker-implementation-guide-for-secure-fintech-systems
- 2/4/6-szem-elv (procedurális vs. rendszer-szintű): https://www.processmaker.com/blog/2-eyes-4-eyes-6-eyes-principle/
- GitHub repo-átadás (elfogadás, lejárat, lefokozás): https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository
- Google Workspace tulajdon-átadás (admin-vezérelt, mindenki értesül): https://support.google.com/a/answer/1247799
- Stripe fiók-tulajdonos váltás (2FA, meghívás+elfogadás): https://support.stripe.com/questions/change-the-owner-of-a-stripe-account

---

*Ez a dokumentum tervezet. A megvalósítás Endre jóváhagyása és a fenti döntések tisztázása után, fázisonként, külön commit-okban történik.*
