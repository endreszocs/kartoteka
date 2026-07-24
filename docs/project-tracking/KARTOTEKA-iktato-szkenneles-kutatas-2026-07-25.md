# Iktató dokumentum-digitalizálás — kutatási jelentés és architektúra-terv

**Dátum:** 2026-07-25 · **Cél:** a papíralapú iratok bevitele (telefonos fotó, QR-os desktop→mobil átadás, tömörítés, digitális iktató-pecsét, PDF/email) — az F8c fázis terv-inputja. Web-kutatás összegzése.

## 1. QR-kódos telefon-átadás (desktop → mobil feltöltés)

**Architektúra:** a QR SOHA nem a fájlt/kulcsot hordozza, hanem egy rövid életű feltöltő-munkamenet URL-jét.

1. Desktop: „Fotózás telefonnal" gomb → `upload_sessions` sor (uuid, iktató-tétel-ref, congregation_id, **token_hash** [a tokent hash-elve tároljuk!], expires_at [5–10 perc], max_files [pl. 20], uploaded_count, status/revoked_at, created_by).
2. QR tartalma: `https://kartoteka.app/m/feltoltes/<token>` (rövid URL — QR-sűrűség).
3. Telefon: publikus, mobil-optimalizált feltöltő-oldal (⚠️ middleware public-listára — a /reset-password csapda!), bejelentkezés nélkül, token az egyetlen belépő; `<input type="file" accept="image/*" capture="environment">` + előnézet.
4. Feltöltés: a telefon NEM kap Supabase-kulcsot — a server action validál (hash-egyezés, lejárat, revokálás, darabszám), majd **fájlonként `createSignedUploadUrl()`** (fixen 2 órás, útvonalanként EGY sikeres feltöltés — a 2. kliens 409-et kap) → `uploadToSignedUrl()`. Mindig uuid-alapú egyedi path!
5. Regisztrálás: server action írja a csatolmány-sort + növeli a számlálót.
6. Desktop-frissítés: **Supabase Realtime Broadcast privát csatorna** (`upload:<sessionId>` topic; RLS a realtime.messages-en + kliens `setAuth()`; public/private flag EGYEZZEN mindkét oldalon, különben némán elveszik!) + **2–3 mp-es polling-fallback**.

**Biztonság:** token TTL 5–10 perc + „Munkamenet lezárása" gomb (revokálás); bucket-szintű file_size_limit + allowed_mime_types + server-oldali magic-byte ellenőrzés; a desktop mutassa a beérkezett képek számát (idegen feltöltés feltűnik); az URL-be SEMMI személyes adat; a mobil-ág minden DB-írása server actionön át, a congregation a SESSION-SORBÓL (ne a bejelentkezett userből — scope-divergencia hibaosztály!).

**QR-könyvtár: `uqr`** (unjs, ~4,4 kB gzip, 0 függőség, renderSVG) — a `qrcode` (~8,8 kB) az alternatíva.

## 2. Kliens-oldali tömörítés

- Cél: **hosszabb él 2500 px** (~210 DPI A4-en), **JPEG q0,75–0,8** → tipikusan 300–800 kB/lap. Előbb átméretezés, csak utána quality-hangolás.
- **WebP-t KERÜLNI**: a pdf-lib csak embedJpg/embedPng-t tud — a későbbi PDF-fűzés/pecsételés miatt JPEG a biztos.
- **Könyvtár: `browser-image-compression`** (~19,6 kB gzip): maxWidthOrHeight 2500, initialQuality 0.8, maxSizeMB 1, fileType 'image/jpeg', useWebWorker true — kezeli az **EXIF-orientációt** (különben elforgatott képek!) és az **iOS Safari canvas-plafont** (különben néma üres canvas).

## 3. Éldetektálás/kivágás

- jscanify: érett, de OpenCV.js-függő (**~8 MB WASM**) — mobilnetes környezetben vállalhatatlan alapértelmezettnek.
- scanic: Rust→WASM, <100 kB, ígéretes, de fiatal (~48★).
- **Döntés: 1. fázisban KIHAGYNI** (sima fotó + tömörítés lefedi az igény 90%-át); 2. fázisban a scanic lazy-loaddal, ha terepen kell.

## 4. Digitális iktató-pecsét (Bates-stamping analógia)

- **Alapértelmezett: „footer-strip"** — a tömörített kép canvasát alul +80–120 px fehér sávval megnöveljük, a pecsét (iktatószám, dátum, iratcsomó, gyülekezet) ebbe kerül → GARANTÁLTAN nem takar. Natív canvas, 0 kB.
- Másodlagos jelzésként mehet félig átlátszó „bélyegző-doboz" a jobb felső sarokba (20–30% opacitás), de a hiteles adat a footer-sávban.
- **PDF-eknél: pdf-lib** (~178 kB gzip, CSAK a pecsételő útvonalon lazy-load): drawText a margóra (~25 pt a lapszéltől) vagy MediaBox-bővítés („whitespace border"); iktatói konvenció: legalább az első oldalon.
- **Eredeti + pecsételt KÜLÖN tárolva** (`.../original/` + `.../stamped/`): az eredeti a hiteles master; megjelenítés/nyomtatás a pecsételtet használja. A pecsét-metaadat a DB-ben is (a kép csak hordozó). A pecsételés a TÖMÖRÍTETT képre épüljön.

## 5. Email/PDF

- 1. fázis: PDF/kép elég (email → „Nyomtatás → Mentés PDF-ként" nulla fejlesztés).
- 2. fázis: **postal-mime** (.eml, böngésző+worker, 0 függőség) — törzs PDF-be + csatolmányok külön iktatva; .msg (@kenjiuno/msgreader) csak konkrét Outlook-igénynél.

## 6. Komponens-összefoglaló

| Komponens | Megoldás | Könyvtár |
|---|---|---|
| QR (desktop) | SVG-QR a mobil-URL-lel | uqr ~4,4 kB |
| Token | upload_sessions tábla, hash-elt token, 5–10 p TTL, max_files, revokálható | — |
| Mobil feltöltés | publikus route + server action → createSignedUploadUrl → uploadToSignedUrl | supabase-js |
| Méret/MIME-védelem | bucket-limit + server magic-byte | — |
| Desktop-frissítés | Realtime Broadcast privát csatorna + polling-fallback | supabase-js |
| Tömörítés | 2500 px, JPEG q0,75–0,8, worker | browser-image-compression ~19,6 kB |
| Éldetektálás | 1. fázis: nincs; 2.: scanic lazy | — |
| Pecsét képre | canvas footer-strip | natív, 0 kB |
| Pecsét PDF-re | pdf-lib margó/MediaBox, lazy | pdf-lib ~178 kB |
| Tárolás | eredeti + pecsételt külön path, pecsét-adat DB-ben | — |
| Email | 2. fázis: postal-mime (.eml) | postal-mime |

## 7. Buktatók (tömör)

1. A signed upload URL fixen 2 órás — az APP-TOKEN a biztonsági határ.
2. Útvonal-ütközés = 409 → mindig uuid-path.
3. EXIF-orientáció + iOS-canvas-plafon → browser-image-compression kezeli.
4. Realtime public/private flag-egyezés + setAuth() + RLS-policy, különben néma vesztés.
5. Mobil-route a middleware public-listájára.
6. RLS: a mobil-ág congregation-je a session-sorból.
7. Smart CDN: a signed URL cache-kulcs — hozzáférés-elvonás = fájl-törlés, nem token-lejárat; megjelenítésnél URL-újrahasználat.
8. OpenCV.js 8 MB — csak lazy + fallback mellett, ha egyáltalán.
9. QR-token a telefon böngésző-előzményében marad → rövid TTL + revokálás + naplózás.

## Források

Corbado/OLOID/Backendless QR-login minták, iryonetwork/qrfu, Supabase docs (createSignedUploadUrl, Storage v3 blog, file limits, bucket fundamentals, Smart CDN, Realtime Broadcast + Authorization), unjs/uqr, npm qrcode, bundlephobia méretek, Donaldcwl/browser-image-compression, CZUR/SecureScan/bitfarm DPI-ajánlások, puffinsoft/jscanify, Scanbot-tutorial, marquaye/scanic, OpenCV.js méret-viták, Dynamsoft, Honeybadger pdf-lib, BatesStamp/DigitalOwl (Bates-gyakorlat), postalsys/postal-mime, eml-parser, @kenjiuno/msgreader.
