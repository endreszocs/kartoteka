# 2026-09-05 — Asztali eszköz-kapcsolás, naptár-rétegek, értesítés-feladó — építészeti jegyzet

Ez a jegyzet a 2026-09-04/05-i kör NEM nyilvánvaló döntéseit rögzíti, hogy a következő
munkamenet ne találja ki újra. A felmérés (11 lencse, 61 ügynök, 4 területi brief) és a
megvalósítás ugyanezen a napon készült a `feat/naptar-desktop-ertesites-profil` ágon.

## 1. Asztali app ⇄ webes fiók: „tévé-belépés" (device-flow)

**Miért nem OAuth a Tauri webview-ban:** a webview-ba nincs OAuth-visszairányítás
(`detectSessionInUrl:false`), deep-link plugin nincs, és a Google-fiókos lelkésznek nincs
jelszava. A web viszont már tud Google-lel belépni.

**A folyamat** (kód: `apps/desktop/src/lib/desktop-kapcsolas.ts`,
`apps/web/lib/desktop-kapcsolas/szerver.ts`, `apps/web/app/api/desktop-kapcsolas/*`,
`apps/web/app/(dashboard)/desktop-kapcsolas/*`, SQL `2026-09-05-desktop-kapcsolas.sql`):

1. Az asztali app 256 bites titkos kódot generál (`@kartoteka/supabase-client`
   `desktop-kapcsolas-kod.ts` — a kód-aritmetika EGY helyen a két oldalnak), és
   `POST /api/desktop-kapcsolas/inditas`-szal beküldi. A szerver CSAK a SHA-256-ot tárolja
   + a 6 jegyű ellenőrző kódot (más doménnel származtatva: a hash-ből nem vezethető le).
   Válasz: NEM titkos kérés-azonosító.
2. Az app a rendszer-böngészőben megnyitja `/api/desktop-kapcsolas/nyit?id=…` → a szerver
   sütibe teszi az azonosítót és a `/desktop-kapcsolas` oldalra visz (a (dashboard) csoport
   MINDEN kapuja mögött: bejelentkezés, aktív státusz, 2FA, munkamenet). Kijelentkezett
   látogató a /login-ra kerül; belépés után a kezdőlap tetején sáv viszi vissza.
3. A lelkész összehasonlítja a 6 jegyű kódot az asztali képernyővel (phishing-védelem:
   idegen kéréssel érkező hivatkozásnál más szám állna a gépén) és jóváhagy. A szerver-akció
   újra ellenőrzi az aktív státuszt ÉS a 2FA-t (`kellEMasodikFaktor`), majd
   `auth.admin.generateLink({type:'magiclink'})` `hashed_token`-jét teszi a sorba.
4. Az app 2 mp-enként `POST /api/desktop-kapcsolas/allapot`-tal kérdez a TITKOS kóddal; a
   tokent PONTOSAN EGYSZER kapja meg (atomikus UPDATE `allapot='jovahagyva'` feltétellel,
   a token NULL-ra íródik), majd `supabase.auth.verifyOtp({token_hash, type:'magiclink'})`.
   Innentől minden a jelszavas belépés útján megy (2FA-lépcső, PIN, szinkron).

**Elfelejtett PIN = ugyanez az út.** A PIN sosem hagyja el a gépet (Argon2id a keyringben);
„Elfelejtettem a kódot" → helyi PIN törlése → újra-összekapcsolás a weben → új PIN.
A Profil → Biztonság → „Asztali alkalmazás" kártya listázza a gépeket és kijelentkezteti
a többi eszközt (`signOut({scope:'others'})`).

**Spam-fék:** IP-hash alapú óránkénti plafon; IP NÉLKÜL (nincs proxy-fejléc) a szigorúbb
GLOBÁLIS plafon él — a régi „NULL ip_hash → átenged" mintát szándékosan nem másoltuk.

**CSP:** a Tauri `connect-src` kapta a `https://kartoteka.app` origót; a webes origó
felülírható `VITE_WEB_ORIGIN`-nel (dev).

## 2. Az asztali munkamenet tárolása (P0)

A `@supabase/ssr` `createBrowserClient` FELÜLÍRJA az átadott `auth.storage`-ot (a spread után
jön a saját süti-tároló) — 2026-04-22 óta a keyring-adapter halott kód volt, a session a
WebView sütijében élt. Javítás: `packages/supabase-client/src/browser.ts` — ha `authOptions`
van (asztali), NYERS `@supabase/supabase-js` `createClient` (`flowType:'implicit'`).
Őrszem: `scripts/selftest-desktop-session-tarolo.mjs` (a mutáns bizonyítja, hogy a teszt a
felülírást méri).

**Windows kulcstár-plafon:** a Credential Manager 2560 bájt/entry (UTF-16) — a Supabase
session JSON nem fér el egy bejegyzésben → a Rust `auth.rs` DARABOL (`<key>.n` fejléc +
`<key>.0..k`), olvasáskor bármely darab hiánya → `None` (fail-closed).

## 3. Naptár-rétegek: egy igazságforrás

- A `gyulekezeti_programok` a TERV (5 új típus: kereszteles/eskuvo/konfirmacio/temetes/
  szabadsag). Az anyakönyv a TÉNY. A kettő EGY kapcsolattal (`anyakonyv_tabla`,
  `anyakonyv_id`, részleges egyedi index) kötődik; a naptár sosem ír anyakönyvet.
- `getNaptarRetegek(year)` (`apps/web/app/(dashboard)/naptar/retegek-actions.ts`) OLVASSA
  az anyakönyvi eseményeket (konfirmáció naponként csoportosítva), a születésnapokat és a
  névnapokat — a `naptar_szemely_alap(uuid)` + `naptar_szemely_nevnapok(uuid)` SECURITY
  INVOKER függvényekből (RLS érvényes). Ugyanezt hívja a lelkészi Google-feed V2 is.
- MAGÁN típusok (szabadság + 4 anyakönyvi): SOHA nem publikusak — három kapu: a mentés
  (`buildProgramRecord`), a DB-trigger (`gyulekezeti_programok_magan_tipus_kapu`) és a
  nyilvános RPC-k WHERE-je (`public_site_events` V1/V2, `public_calendar_feed`).
- Névnap-egyeztetés: `naptar_nev_kulcs(text)` = ékezet/kis-nagybetű/szóköz/kötőjel nélkül
  (a webes `normalizeMemberStatus` SQL-tükre); a keresztnév tagjai külön is egyeznek, a
  pont-végű előtag-tokenek (ifj., dr.) kiesnek.

## 4. Értesítés-feladó

`ertesitesek.felado_tipus / felado_nev / felado_id / felado_levezetett / uzenet_format /
broadcast_id`. INSERT-trigger tölti a hiányzó feladót a régi kódutakon
(`ertesites_felado_levezetes` — az alkalmazás `feladoBontas()` tükre,
`apps/web/lib/notifications/felado.ts`); UPDATE-trigger írásvédi. A markdown CSAK
`uzenet_format='markdown'` (hírlevél) sornál renderelődik — a felhasználói szabad szöveg
sosem fut markdownon (XSS-elv).

## 5. Ami TUDATOSAN maradt

- RLS a program/anyakönyv táblákon a skalár `current_user_congregation_id()`-re épül —
  profilváltós lelkésznél a réteg némán üres lehet. Állapotfelmérés kell (pg_policies), és
  csak azután policy-csere `current_user_can_access_congregation(congregation_id)`-re.
- Vezérige DB-oszlop (`congregations.eves_vezerige`): a nyomtatvány szerkeszthető
  mezőt ad, mentés nélkül. Külön döntés.
- Támogatási szál kétirányúsága, e-mail-módosítás, privát avatar-vödör: nyitott kérdések a
  briefekben (`scratchpad/felmeres/brief-*.md` a munkamenetben; a lényeg a memóriában).
