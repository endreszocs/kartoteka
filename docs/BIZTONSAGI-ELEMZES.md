# Kartotéka — biztonsági elemzés (8. pont, 2026-08-15)

Ez a dokumentum a 18 pontos lista **8. pontjának** („kétlépcsős belépés + a
rendszer biztonsági elemzése") kimenete. Rögzíti, milyen védelmi rétegekből
áll a rendszer, mit javított a 8. kör (A–D szelet), és mi maradt ismert,
vállalt kockázatként — a hozzá tartozó teendőkkel.

---

## 1. A védelmi rétegek térképe

| Réteg | Mi védi | Hol lakik |
|---|---|---|
| **Belépés** | jelszó (Supabase Auth) + opcionális TOTP második lépcső + 8 egyszer használatos mentőkód | `login/actions.ts`, `login/ellenorzes`, `profile/biztonsag` |
| **Munkamenet** | aal1/aal2 szint a JWT-ben; middleware aal-őr minden védett úton; session-mode süti (24 h / tartós) | `lib/supabase/middleware.ts` |
| **Adat** | RLS minden érzékeny táblán (roles-first hatókör) + **restrictive `mfa_opt_in_aal2`** policy 14 táblán: 2FA-s fióknál csak aal2-es munkamenet fér hozzá | `2026-08-15-mfa-optin-rls.sql` |
| **Rendszergazdai kapu** | master-admin e-mail + 6 jegyű PIN (scrypt-hash) + brute-force limit (5 hiba / 10 perc) + HMAC-aláírt, felhasználóhoz kötött god-mode süti (2 h) | `god-mode/actions-v4.ts`, `lib/auth/god-mode-session.ts` |
| **Delegált import** | saját forgatható PIN + modul- és gyülekezet-kötött süti + szerveroldali kapuőr (fail-closed) | `delegated-import/guard.ts` |
| **Titkok** | Oblio/Drive kulcsok pgcrypto-val titkosítva (`VAULT_ENCRYPTION_KEY`); mentőkódok és god-mode PIN scrypt-hash-ben | `lib/supabase/secret-vault.ts`, `lib/auth/pin-hash.ts` |
| **Napló** | audit_log minden érzékeny műveletről, mostantól IP + eszköz (user-agent) adattal; sikertelen belépés és kijelentkezés is | `lib/audit/log.ts`, `/admin/naplo` |
| **Desktop** | OS-keyring session + Argon2id offline PIN; a 2FA kód-lépcső a desktop loginban is él; AuthGate aal-ellenőrzés | `apps/desktop/src/pages/login-page.tsx`, `lib/auth-gate.tsx` |

A 2FA **opt-in**: akinek nincs bekapcsolva, annak SEMMI nem változik; aki
bekapcsolja, annál a kód-lépcső minden belépési úton (jelszó, Google, nyitva
felejtett fül, desktop) ÉS adatbázis-szinten (RLS) is kötelező.

## 2. A 8. körben javított sebezhetőségek

| # | Ami rossz volt | Kockázat | Javítás |
|---|---|---|---|
| 1 | Nem volt második faktor — egy kiszivárgott jelszó teljes hozzáférést adott | ⛔ kritikus | A+B szelet: TOTP + mentőkódok + desktop-lépcső (PR #157, #158) |
| 2 | A 2FA-t a UI kényszerítette volna, az API-t nyers tokennel meg lehetett volna kerülni | ⛔ kritikus | C szelet: restrictive `mfa_opt_in_aal2` policy 14 táblán — a kényszer az adatbázisban lakik |
| 3 | A god-mode PIN **nyersen** állt a `system_settings`-ben — DB-olvasással/mentésből kiolvasható | magas | D: scrypt-hash tárolás + lusta felminősítés az első sikeres belépéskor; a friss PIN-mentés eleve hash-t ír |
| 4 | A PIN-összevetés `!==` volt — időzítés-alapú szivárgás | közepes | D: minden ágon scrypt + `timingSafeEqual` (konstans idejű) |
| 5 | A `god_mode_until` süti sima epoch-szám volt — a master session birtokában a PIN **megkerülhető** volt egy kézzel írt sütivel | magas | D: HMAC-SHA256-aláírt, felhasználóhoz kötött érték (kulcs a service-kulcsból derivált); örökölt süti érvénytelen (fail-closed) |
| 6 | Az audit_log `ip`/`user_agent` oszlopa sosem töltődött | közepes | D: a webes réteg a kérés fejléceiből tölti (RPC-bővítés: `2026-08-15-audit-ip-useragent.sql`) |
| 7 | A sikertelen belépés és a kijelentkezés láthatatlan volt a naplóban | közepes | D: `login_failed` (IP+eszköz+próbált e-mail) és `logout` audit-esemény |
| 8 | A jogi szöveg „bevezetés alatt"-nak mondta a 2FA-t | kicsi | A: frissítve — a szöveg már nem hazudik |

## 3. Ismert maradék kockázatok és teendők

| # | Kockázat | Súly | Teendő |
|---|---|---|---|
| 1 | **`VAULT_ENCRYPTION_KEY` hiányában a titok-szef a GOD_MODE_PIN-re esik vissza** (`secret-vault.ts:22`) — a titkosítási kulcs így egy 6 jegyű szám. A kód-oldali csere önmagában TILOS: a már titkosított Oblio/Drive-titkok az eredeti kulccsal fejthetők csak vissza. | magas | Endre: ellenőrizd a Railway env-ben a `VAULT_ENCRYPTION_KEY`-t. Ha hiányzik: beállítás UTÁN a mentett Oblio-kulcsokat egyszer újra kell menteni a felületen (újra-titkosítás az új kulccsal). |
| 2 | A `GOD_MODE_PIN` env-változó (ha be van állítva) továbbra is nyers szöveg a Railway-ben | közepes | Ajánlott: a PIN éljen csak a DB-ben (hash-elve), az env-változó törölhető, ha a DB-sor létezik. |
| 3 | A delegált import örökölt tartaléka (god-mode PIN elfogadása) a hash-eléssel **megszűnik** — ha nincs `delegated_import_pin`, a delegált import PIN-es útja nem használható | kicsi (szándékolt) | Ha kell a delegált import: vedd fel a `system_settings.delegated_import_pin` sort külön 6 jegyű kóddal (a PIN-mentés felülete figyelmeztet erre). |
| 4 | A desktop AuthGate aal-ellenőrzése hibánál fail-open (dokumentált döntés) — a valódi őr az RLS | kicsi | Nincs teendő: az adatot a C szelet RLS-e védi; a kapu csak kényelmi réteg. |
| 5 | A desktop offline PIN (Argon2id) a lokális cache-t nyitja — a 2FA erre nem terjed ki (offline nincs TOTP-ellenőrzés) | kicsi | Dokumentált kivétel; a lokális adat a gép fiókjával + keyringgel védett. |
| 6 | A tag-törlő RPC régi (2026-06-10-es) verziója él — a portál-kompat lánc (2026-07-17) még nem futott le | követés | Külön kör: portál-rollout a 3 függő SQL-lel (a selftest T17 őrzi, hogy addig senki ne cserélje). |
| 7 | Mentőkódos belépésnél a 2FA automatikusan kikapcsol (vészkijárat-modell) — a felület 15 mp-es figyelmeztetést ad, de a visszakapcsolás a felhasználón múlik | kicsi | A `mfa.mentokod_belepes` audit-esemény alapján az /admin/naplo-ban követhető, kinél maradt ki a visszakapcsolás. |

## 4. Üzemeltetési teendők (Endre)

1. **Futtasd le** a `2026-08-15-audit-ip-useragent.sql`-t (a web enélkül is
   naplóz, csak IP nélkül — a régi hívásra esik vissza).
2. **Railway env:** ellenőrizd a `VAULT_ENCRYPTION_KEY`-t (3.1. pont) —
   ez a legfontosabb maradék teendő.
3. **Kapcsold be a 2FA-t a saját (master admin) fiókodon** — a desktop-lépcső
   él, az akadály elhárult. Profil → Biztonság → Kétlépcsős belépés.
4. A következő god-mode belépésnél a PIN-t egyszer újra be kell írni (a régi
   süti-formátum érvénytelen), és a PIN ekkor automatikusan hash-re minősül át
   — az /admin/naplo-ban `pin_storage: legacy_upgraded` jelzi.
5. Ha delegált importot használnál: vedd fel a `delegated_import_pin` sort
   (3.3. pont).

---

*Készült: 2026-08-15, a 8. kör D szeletével (Claude). A dokumentum élő —
minden biztonsági érintésű kör frissítse.*
