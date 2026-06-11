# Tagnyilvántartás: családi kártyák + személy-avatarok + karton-nyomtatás
**Dátum:** 2026-06-11 (este) · **Kérte:** Endre · **Státusz:** ✅ implementálva (web + desktop párhuzamosan)

## A kérés
1. A `tagnyilvantartas#families` rácsnézet csúnya → szép, dizájnos kártyanézet.
2. Személyekhez kép társítása Facebook/Instagram profil-link megadásával (utánajárással: hogyan lehet a nyilvános profilképet avatarként átvenni) — a családi lapon minden tag képe látsszon, modern, animált.
3. A karton-nyomtatás nem található.
4. Web + desktop párhuzamosan; a tágabb környezet javítása is.

---

## 1. KUTATÁS — közösségi profilkép átvétele (gyakorlati tesztekkel, 2026-06-11)

| Módszer | Eredmény | Következtetés |
|---|---|---|
| `graph.facebook.com/{NUMERIKUS_ID}/picture` (token nélkül) | ✅ HTTP 200, image/jpeg; a `?redirect=false` JSON `is_silhouette` flagje megmondja, valódi-e | **A MEGBÍZHATÓ ÚT** — `facebook.com/profile.php?id=…` linkeknél |
| FB username → Graph | ❌ 2018 óta csak numerikus ID megy tokennel/anélkül | username-ből nincs hivatalos út |
| Instagram HTML og:image (lakossági IP-ről is) | ❌ login-fal, a profilkép-URL nincs az SSR HTML-ben | best-effort próba marad |
| `facebook.com/{username}` HTML | ❌ HTTP 400 | best-effort |
| unavatar.io aggregátor | ❌ 403 (bot-szűrés) + 25 kérés/nap/IP | élesre alkalmatlan |
| **fbcdn/cdninstagram kép-URL-ek** | aláírt, **lejáró** URL-ek (`_nc_ohc` token) | **hotlink TILOS** — letöltés + saját Storage kötelező |

**Architektúra ennek megfelelően:**
- **Kézi képfeltöltés = mindig működő főút** (fájl-tallózás + kliens-oldali átméretezés 512px JPEG-re).
- **Link-alapú letöltés = kényelmi út**: `profile.php?id=` → Graph (megbízható); username/IG → og:image best-effort, őszinte hibaüzenettel + tipp („mentsd le és töltsd fel — 10 mp").
- A kép MINDIG a saját `avatars` Storage bucketbe kerül (public read); a `szemely.kep` a public URL-t kapja (cache-törő `?v=` paraméterrel), a `szemely.social_profil_url` a linket (kapcsolattartási érték önmagában is).
- **Desktopon a letöltés Rust-oldalon** fut (`fetch_image`/`fetch_page_text`, reqwest+rustls) — a webview fetch-et a kép-CDN-ek CORS-a blokkolja; ráadásul lakossági IP-ről megy (erősebb best-effort, mint a szerver-IP-s web).
- GDPR: nyilvánosan közzétett profilkép, a lelkész tudatos társításával; a UI jelzi, hogy a kép saját tárhelyre kerül.

## 2. MIT ÉPÍTETTÜNK

### Közös réteg — `packages/ui-app/src/members/` (D-hullám első darabja!)
- `social-avatar.ts` — link-parser (fb-id/fb-username/instagram), Graph URL-építők, og:image-kinyerő, `avatarStoragePath`
- `MemberAvatar.tsx` + `MemberAvatarStack` — kör-avatar (kép fade-in / determinisztikus színes monogram), elhunyt-jelzés (†, szépia), átfedő stack „+N"-nel
- `FamilyCardModern.tsx` — az ÚJ családi kártya: státusz-színsáv, avatar-stack, szerep-ikonos felnőtt-sorok, gyermek-chipek, körzet+létszám badge-ek, hover-lift + kártyán belüli nyomtatás-gomb
- `AvatarEditorBody.tsx` — platform-független szerkesztő (link-input + letöltés / kézi feltöltés / kép-törlés / mentés)
- `family-card-print.ts` — a webes karton-HTML-builder VÁLTOZATLANUL közösítve (`buildFamilyCardHtml`)

### Web
- `avatar-actions.ts` — `fetchSocialAvatarImage` (Graph→og:image lánc) + `saveMemberAvatar` (Storage upload + szemely update)
- `getFamilies` — szülő-select += `kep`; + **gyerek-szerep** a haztartas_tag-ból → a kártya teljes tag-listát kap
- `getFamilyDetails` — mindhárom személy-select += `kep, social_profil_url`
- families-tab kártyanézet → `FamilyCardModern` (onPrint a kártyán)
- részletlap (`family-details-dialog-refined`): MemberPanel ikon-korong → valódi avatar + kamera-gomb → `AvatarEditorDialog`; gyerek-sor ♂/♀ korong → avatar
- karton-print-dialóg: a buildert a közösből importálja

### Desktop
- Rust: `avatar.rs` (`fetch_image`, `fetch_page_text`) + `reqwest` (rustls — nincs openssl-függés)
- `db.rs` **v31**: `szemely_local` += `kep`, `social_profil_url`; pull-szinkron bővítve (`sync.ts`)
- `lib/avatar.ts` — a webes akciók desktop-tükre (B6 verified-session őr + lokális tükör azonnali frissítése)
- families-page: **kártya/lista nézet-váltó** (LS), kártya-grid a közös komponenssel (batch-SQL a tag-adatokra), kártyán nyomtatás-gomb
- `family-card-print-dialog.tsx` (ÚJ) — a webes karton-dialóg tükre (online data-loader + közös builder + élő iframe-előnézet) → **a karton-nyomtatás desktopon is elérhető**
- family-detail-dialog: szülő-sorok + gyerek-sorok avatarral; kamera-gomb → AvatarEditor

### SQL (Endre futtatja!)
- **`migration-docs/sql/2026-06-11p-szemely-social-avatar.sql`** — `szemely.social_profil_url` oszlop + `avatars` bucket + 4 policy + ellenőrző SELECT.
  A kép-mentés addig „Fut már a …sql?" hibaüzenetet ad, amíg ez nincs lefuttatva.

## 3. NYITOTT / KÉSŐBBI
- A személyi karton (MemberDetailsDialogV2 / member-oldal) avatar-szerkesztője — most a családi lapról érhető el; oda is kitehető.
- ~~Web `getFamilies` szerep-értékek~~ → **LEZÁRVA (2026-06-12):** az író-kód (`syncHouseholdFromCsalad`) a kanonikus **'gyermek'** szerepet menti — a getFamilies 'gyerek'-szűrője bug volt (a gyermekek nem jelentek volna meg a kártyákon); javítva 'gyermek'+'unoka'-ra.
- Avatar-cache offline-ra (a kép-URL szinkronizált, a kép maga online töltődik; offline monogram-fallback van).
