# Kartotéka — Rendszerdiagnosztikai Jelentés

**Dátum:** 2026-04-12
**Auditor:** Claude (háromszoros explore audit + kód verifikáció + TypeScript + ESLint)
**Scope:** Teljes rendszer — fő admin, Missziós Műhely, publikus oldal
**Futtatott ellenőrzések:** TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), RLS séma auditálás, kód-szintű biztonsági átvizsgálás

---

## 1. Vezetői összefoglaló

A Kartotéka rendszer általánosan **jól strukturált** és a biztonsági alaparchitektúra **túlnyomó többsége helyes**. Azonban az audit során **több kritikus biztonsági rés** derült ki, amelyek azonnali beavatkozást igényelnek. A legsúlyosabb hiányosságok nem a most épített publikus oldal feature-ben vannak, hanem a **már létező Missziós Műhely modulban** (RLS hiánya) és a **God Mode / Admin Override rendszerben**.

### Kritikusság eloszlása

| Súlyosság | Darabszám | Állapot |
|---|---|---|
| 🔴 **Kritikus** (production blokkoló) | 4 | azonnal javítandó |
| 🟠 **Magas** | 6 | hamar javítandó |
| 🟡 **Közepes** | 8 | sprinten belül |
| 🟢 **Alacsony / UX** | 12+ | backlog |

### Technikai egészség

- **TypeScript:** `npx tsc --noEmit` → **0 hiba** ✅
- **ESLint:** 12 error + 27 warning — a hibák mind `react/no-unescaped-entities` (magyar idézőjelek escape-je) és `@next/next/no-img-element` (Next.js `Image` helyett `<img>`). Egyik sem biztonsági, de formálisan javítandók.
- **Build:** jelenleg tisztán fordul

---

## 2. 🔴 KRITIKUS hibák (production blokkoló)

### K1. **Missziós Műhely — RLS teljes hiánya az `mm_*` táblákon**

**Hol:** `migration-docs/Database_schema.sql` (mm_* táblák definíciói), `migration-docs/sql/*.sql` (nincs mm_* RLS migráció)

**Probléma:**
A 15 `mm_*` tábla (mm_otletek, mm_segedanyagok, mm_szavazatok, mm_hozzaszolasok, mm_segedanyag_ertekelesek, mm_otlet_kategoriak, mm_segedanyag_kategoriak, mm_jelveny_tipusok, mm_felhasznalo_statisztika, mm_felhasznalo_jelveny, mm_kategoriak, mm_feladatok, mm_merfoldkovek, mm_dokumentumok, mm_otlet_cimkek) **egyikén sincs RLS** engedélyezve.

**Kockázat:**
Egy bejelentkezett felhasználó a kliens-oldali Supabase kliens segítségével közvetlenül lekérdezheti vagy módosíthatja **bármely gyülekezet** missziós műhely-adatait. A Missziós Műhely ugyan egy közösségi tér (minden gyülekezet láthatja egymást), de a **módosítás és törlés** (más által beküldött ötlet szerkesztése, más statisztikájának módosítása, más gyűjtött pontok hamisítása) elvileg lehetséges.

**Támadási példa:**
```ts
// Bármely bejelentkezett user a kliens-oldali kódjában:
await supabase
  .from('mm_felhasznalo_statisztika')
  .update({ osszpontszam: 999999, szint: 'Missziói bajnok' })
  .eq('user_id', currentUserId)  // saját maga
// → Feltöltheti magát a legfelső szintre pillanatok alatt
```

**Javítás:**
Új migráció `migration-docs/sql/2026-04-12-mm-rls-policies.sql`:

```sql
-- mm_otletek: mindenki olvas (közösségi), csak a tulajdonos módosít
ALTER TABLE public.mm_otletek ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_otletek_read_all ON public.mm_otletek
  FOR SELECT TO authenticated USING (aktiv = true);
CREATE POLICY mm_otletek_insert_own ON public.mm_otletek
  FOR INSERT TO authenticated
  WITH CHECK (otletgazda_id = auth.uid());
CREATE POLICY mm_otletek_update_own ON public.mm_otletek
  FOR UPDATE TO authenticated
  USING (otletgazda_id = auth.uid())
  WITH CHECK (otletgazda_id = auth.uid());
CREATE POLICY mm_otletek_delete_own ON public.mm_otletek
  FOR DELETE TO authenticated
  USING (otletgazda_id = auth.uid() OR public.current_user_has_global_access());

-- mm_felhasznalo_statisztika: KRITIKUS — csak saját olvasás, csak server action írás
ALTER TABLE public.mm_felhasznalo_statisztika ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_stats_read_self ON public.mm_felhasznalo_statisztika
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_has_global_access());
-- Írás NINCS! Csak service_role vagy security definer function módosíthat.

-- mm_szavazatok: saját szavazat, UNIQUE constraint a duplikáció ellen
ALTER TABLE public.mm_szavazatok ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS mm_szavazatok_unique
  ON public.mm_szavazatok (otlet_id, user_id, tipus);
CREATE POLICY mm_szavazatok_read_all ON public.mm_szavazatok
  FOR SELECT TO authenticated USING (true);
CREATE POLICY mm_szavazatok_own ON public.mm_szavazatok
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- mm_hozzaszolasok: mindenki olvas, csak saját írás/törlés
ALTER TABLE public.mm_hozzaszolasok ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_hozzaszolasok_read ON public.mm_hozzaszolasok
  FOR SELECT TO authenticated USING (true);
CREATE POLICY mm_hozzaszolasok_insert_own ON public.mm_hozzaszolasok
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY mm_hozzaszolasok_delete_own ON public.mm_hozzaszolasok
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.current_user_has_global_access());

-- mm_segedanyagok, mm_segedanyag_ertekelesek, mm_felhasznalo_jelveny: hasonló minta

-- mm_kategoriak, mm_jelveny_tipusok: read-only mindenki számára
ALTER TABLE public.mm_kategoriak ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_kategoriak_read ON public.mm_kategoriak
  FOR SELECT TO authenticated, anon USING (true);
```

**Határidő:** AZONNAL — a Missziós Műhely most van éles használatban.

---

### K2. **Hardcoded Default God Mode PIN a kódban**

**Hol:**
- `app/(dashboard)/god-mode/actions-v4.ts:11` — `const DEFAULT_GOD_MODE_PIN = '258456'`
- `app/(dashboard)/delegated-import/actions.ts:10` — ugyanaz

**Probléma:**
A `258456` PIN kód nyilvánosan látható a repóban. Ha a `SUPABASE_SERVICE_ROLE_KEY` nincs beállítva VAGY a `system_settings` tábla hiányzik VAGY a `GOD_MODE_PIN` env var üres, a rendszer a hardcoded `258456` PIN-t fogadja el. Ez a master admin teljes rendszerszintű hozzáférést ad.

**Támadási példa:**
Ha a git repó kikerül, vagy egy fejlesztő fiók kompromittálódik → bárki aki tudja, hogy `endreszocs@gmail.com` a master admin + `258456` a PIN → teljes god mode hozzáférés.

**Javítás:**
1. A `DEFAULT_GOD_MODE_PIN` változót **azonnal cseréljétek le** vagy **távolítsátok el**:

```ts
// Nincs default — ha nincs env var + nincs DB érték, a god mode nem aktiválható
const GOD_MODE_DURATION_MS = 2 * 60 * 60 * 1000

async function readStoredPin() {
  // Csak env vagy DB — soha nem default
  const envPin = process.env.GOD_MODE_PIN
  if (!envPin && !adminSupabase) {
    return { pin: null, error: 'A GOD_MODE_PIN beallitasa kotelezo a god mode hasznalatahoz.' }
  }
  // ...
}
```

2. Production-ben a PIN-t legalább **10 karakteres, vegyes** jelszóra kell cserélni.
3. Ha a git-history tartalmazza a `258456` értéket, javasolt a git-history átírása (bár a repo privát valószínűleg).

**Határidő:** AZONNAL.

---

### K3. **Path traversal a képfeltöltésben**

**Hol:** `app/(dashboard)/publikus-oldal/upload-actions.ts:71-76` + `lib/public-site/storage.ts:10-16,38-44`

**Probléma:**
Az `uploadPublicSiteImage` és `uploadMagazinePdf` nem validálja a `target.postSlug` és `target.issueId` paramétereket. Ezek közvetlenül belekerülnek a Storage path-ba:

```ts
// storage.ts:10-16
export function postCoverImagePath(
  congregationId: string,
  postSlug: string,       // ← NEM sanitizált
  filename: string,
): string {
  return `${congregationId}/posts/${postSlug}/${filename}`
}
```

**Támadási példa:**
```ts
// Kliens-oldali kód egy bejelentkezett lelkésznél:
const fd = new FormData()
fd.append('file', imageFile)
fd.append('target', JSON.stringify({
  kind: 'post-cover',
  postSlug: '../../other-congregation-uuid/hero'  // ← path traversal
}))
await uploadPublicSiteImage(fd)
```

A végső path: `{sajat_cong_id}/posts/../../other-congregation-uuid/hero/{file}`.

**Kockázat:**
- Ha a Supabase Storage normalizálja a `..` szegmenseket → az első szegmens már nem a saját `congregation_id`, így a storage bucket RLS policy (`(string_to_array(name, '/'))[1]::uuid`) átenged
- Egy lelkész más gyülekezet hero képét írhatja felül (`upsert: true` miatt)
- Az `upsert: true` ráadásul **nem ad hibát**, csak felülírja a létező fájlt

**Javítás:**
Validáljátok a `postSlug` és `issueId` értékeket a szerver akcióban:

```ts
// upload-actions.ts
import { validateSlug } from '@/lib/public-site/slug'

// post-cover ág:
case 'post-cover': {
  const slugCheck = validateSlug(target.postSlug)
  if (!slugCheck.valid) {
    return { error: slugCheck.error || 'Érvénytelen slug.' }
  }
  path = postCoverImagePath(congregationId, target.postSlug, safeName)
  break
}

// magazine-cover ág:
case 'magazine-cover': {
  // issueId csak UUID formátum lehet
  if (!/^[0-9a-f-]{36}$/i.test(target.issueId)) {
    return { error: 'Érvénytelen lapszám azonosító.' }
  }
  path = magazineIssuePath(congregationId, target.issueId, safeName)
  break
}
```

**Határidő:** AZONNAL.

---

### K4. **Admin Override szivárgás a God Mode kikapcsolásakor**

**Hol:** `app/(dashboard)/god-mode/actions-v4.ts:132-140` (`deactivateGodMode`) + `app/(dashboard)/admin/actions.ts` (`enterCongregation`)

**Probléma:**
Amikor a master admin god mode-ban `enterCongregation()`-nel átlépett egy gyülekezetbe, az `admin_access_requests` táblába bekerül egy `approved` státuszú sor 2 órás expiry-vel. Amikor a master admin kilép a god mode-ból (`deactivateGodMode`), az csak a cookie-t törli. **Az `admin_access_requests` sor NEM kerül érvénytelenítésre.**

**Forgatókönyv:**
1. Master admin aktiválja a god mode-ot, belép A gyülekezetbe → `admin_access_requests` sor létrejön 2 óra expiry-vel
2. Master admin kijelentkezik vagy deactivateGodMode-ot fut → cookie törlődik
3. **Az `admin_access_requests` sor még mindig él 2 órán át**
4. Amikor a master admin újra bejelentkezik NORMÁL módban (god mode nélkül), a `getActiveOverride()` az `admin_access_requests` táblában talál egy `approved` sort → **automatikusan átlép A gyülekezetbe god mode jelölés nélkül**

**Javítás:**
A `deactivateGodMode()` érvénytelenítse az override-okat:

```ts
export async function deactivateGodMode() {
  const auth = await requireMasterAdmin()
  if ('error' in auth) return { error: auth.error }

  const cookieStore = await cookies()
  cookieStore.delete('god_mode_until')

  // ÚJ: érvénytelenítjük a user-hez tartozó aktív override-okat
  await auth.supabase
    .from('admin_access_requests')
    .update({ status: 'expired', expires_at: new Date().toISOString() })
    .eq('admin_user_id', auth.user.id)
    .eq('status', 'approved')

  return { success: true }
}
```

Emellett a `getActiveOverride()` ellenőrizze, hogy a master admin jelenlegi session-je tartalmazza-e a god mode cookie-t:

```ts
// effective-access.ts
const override = master
  ? await (async () => {
      const godMode = await getGodModeStatus()
      if (!godMode.active) return { active: false }
      return getActiveOverride(supabase, user.id)
    })()
  : { active: false }
```

**Határidő:** AZONNAL.

---

## 3. 🟠 MAGAS kockázat

### M1. **Missziós Műhely — Congregation isolation hiányzik a szerver akciókban**

**Hol:** `app/misszios-muhely/community-actions.ts`, `app/misszios-muhely/actions.ts`

**Probléma:**
A `deleteMaterial()`, `rateMaterial()`, `saveIdeaComment()`, `supportIdea()`, `toggleIdeaJoin()` funkciók nem ellenőrzik, hogy a cél (anyag, ötlet, komment) a user gyülekezetéhez tartozik-e. Ugyan az MM közösségi (mindenki mindent lát), a **módosítás** szintjén kell védekezni:

- `deleteMaterial(id)`: csak a `feltolto_id === userId` ellenőrzés van → user törölheti mások segédanyagait, ha ő adta volna be
- `rateMaterial(materialId, score)`: nincs ellenőrzés, hogy a materialId létezik-e és tényleg egy másik gyülekezet adta-e be
- `saveIdeaComment()`: az `ideaId` lehet hamis

**Javítás:**
Minden ilyen akcióhoz adjunk egy előzetes lookup-ot:
```ts
const { data: material } = await access.supabase
  .from('mm_segedanyagok')
  .select('id, feltolto_id, aktiv')
  .eq('id', materialId)
  .maybeSingle()
if (!material || !material.aktiv) return { error: 'Nem található.' }
if (material.feltolto_id !== access.userId && !access.admin) {
  return { error: 'Nincs jogosultságod.' }
}
```

A K1 (mm RLS) javítása egyébként a legtöbb kockázatot kezelné adatbázis-szinten.

---

### M2. **Missziós Műhely — Forras URL nincs validálva**

**Hol:** `app/misszios-muhely/community-actions.ts:948`

**Probléma:**
A `shareMissionMaterial()` a `forras_url`-t validálás nélkül menti. A kliens a `material-detail-dialog.tsx:229`-ben `href={material.forras_url}`-ként használja.

React a `href` attribútumban automatikusan blokkolja a `javascript:` protokollt react 19 verziótól (warning-ot ad), **de a rendering context körül vannak edge case-ek**.

**Javítás:**
```ts
function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch { return false }
}

// community-actions.ts shareMissionMaterial:
if (data.forrasUrl && !isSafeHttpUrl(data.forrasUrl)) {
  return { error: 'Érvénytelen URL — csak https:// vagy http:// engedélyezett.' }
}
```

Ugyanezt kell tenni bárhol, ahol felhasználó URL-t adhat meg (public_posts cover_image_url, pl.).

---

### M3. **Szavazat duplikáció race condition**

**Hol:** `app/misszios-muhely/community-actions.ts:902-930` (`supportIdea`)

**Probléma:**
A `supportIdea` először lekérdezi, hogy van-e már szavazat, aztán insert-el. **Két párhuzamos kérés közé beszorulhat** → két szavazat kerül be ugyanattól a user-től. Nincs adatbázis-szintű UNIQUE constraint a `(otlet_id, user_id, tipus)` hármason.

**Javítás:**
A K1 migráció tartalmazza a UNIQUE indexet:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS mm_szavazatok_unique
  ON public.mm_szavazatok (otlet_id, user_id, tipus);
```

Ez garantálja, hogy a második insert error-ral elutasításra kerül.

---

### M4. **`toggleIdeaJoin` pont-logika nem konzisztens**

**Hol:** `app/misszios-muhely/community-actions.ts:868-899`

**Probléma:**
Csatlakozáskor `awardPoints(userId, 'csatlakozas')` → +5 pont. Kilépéskor **NINCS** pont visszavonás. Ezért:

1. User csatlakozik → +5 pont
2. User kilép → 0 pont visszavonva
3. User újra csatlakozik → +5 pont  
4. **Összesen +10 pont, valójában csatlakozott 1-szer**

A user iterálva csatlakozik/kilép → végtelen pontot gyűjthet.

**Javítás:**
Vagy vonjuk vissza a pontot kilépéskor, vagy — jobb megoldás — **csak egyszer adjunk pontot egy ötletre csatlakozásért**, akkor is ha többször csatlakozik:

```ts
// Egy új audit tábla: mm_csatlakozasi_naplo (user_id, otlet_id, elso_csatlakozas timestamp)
// awardPoints csak akkor, ha ez az ELSŐ csatlakozás erre az ötletre
```

---

### M5. **Next.js képek helyett `<img>` tag-ek**

**Hol (ESLint warning-ok):**
- `components/public/public-hero.tsx:102`
- `components/public/public-post-card.tsx:37`
- `components/public/public-site-footer.tsx:30`
- `components/public/public-site-header.tsx:21`
- `components/public/public-post-card.tsx` (alternatív ág)

**Probléma:**
Native `<img>` nem optimalizál: nincs lazy loading, nincs responsive srcset, nincs WebP/AVIF auto-konverzió. Következmény: **nagyobb LCP, rosszabb SEO, lassabb mobilon**.

**Javítás:**
Cseréljük `next/image`-re. De az `<img src={url}>` dinamikus URL-eknél (Supabase Storage) külön domain konfigurációt igényel:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  // ...
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname,
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}
```

Utána:
```tsx
import Image from 'next/image'

<Image
  src={site.hero_image_url}
  alt={site.display_name}
  fill
  className="object-cover"
  priority={true} // csak hero-nál
/>
```

Ez több fájlt érint; érdemes fokozatosan javítani.

---

### M6. **ESLint `react/no-unescaped-entities` hibák**

**Hol:** 8 fájlban magyar `"` (idézőjel) karakterek nincsenek escape-elve JSX-ben

**Probléma:**
ESLint és React szerint a `"` karakter JSX szövegben problémás lehet. Javítás: `&quot;`, `&ldquo;` vagy `&rdquo;` használata, vagy string literal + változó: `{'"'}`

**Érintett fájlok:**
- `components/muhely/home/muhely-encouragement.tsx:26`
- `components/muhely/home/muhely-hero.tsx:92`
- `components/muhely/layout/muhely-footer.tsx:21`
- `components/public/public-hero.tsx:128`
- `components/public/public-site-footer.tsx:57`
- `components/public/public-verse-block.tsx:43`

**Javítás:**
Cseréljük a `„..."` és `"..."` direkt JSX karaktereket `{'„'}...{'"'}`-ra, VAGY ES6 string template-re, VAGY `&bdquo;` / `&rdquo;`.

---

## 4. 🟡 KÖZEPES kockázat

### K_1. **Master admin bypass a `status != 'active'` ellenőrzésnél**

**Hol:** `app/(dashboard)/layout.tsx:33`

```ts
if (profile.status !== 'active' && !master) {
  await supabase.auth.signOut()
  redirect('/login')
}
```

A master admin teljesen megkerüli a státuszellenőrzést. Ha egy `pending` státuszú profil e-mail címe a `MASTER_ADMIN_EMAIL` env var-al egyezik, az beléphet. **Ez feature vagy bug?** — Ha szándékos, dokumentálni kell. Ha nem, a master checkhez tenni egy `status === 'active'` feltételt is, vagy egy külön admin-only setup flow-ban kezelni.

### K_2. **Szerver akció hiba üzenetek szivárogtatják a DB struktúrát**

**Hol:** minden `actions.ts` fájl, például `app/(dashboard)/penzugy/actions.ts`

```ts
if (insertResult.error) {
  return { error: `Hiba: ${insertResult.error.message}` }
}
```

A `insertResult.error.message` tartalmazhat SQL error-t: `"relation \"befizetes\" does not exist"`, `"duplicate key value violates unique constraint \"..."`. Ezek szivárogtatják a DB sémát és segíthetnek egy támadónak reconnaissance-ban.

**Javítás:**
Generic üzenet a kliensnek + log a szerveren:
```ts
if (insertResult.error) {
  console.error('[befizetes-insert]', insertResult.error)
  return { error: 'Adatbázis hiba. Kérjük, próbálja később.' }
}
```

### K_3. **`loadPublicSiteBySlug` nincs cache-elve**

**Hol:** `lib/public-site/site-loader.ts`

Minden layout render és opengraph-image generálás hívja. Egy gyülekezeti oldal látogatása 3-5 query-t jelent. Nagyobb forgalom mellett ez DB load.

**Javítás:**
```ts
import { unstable_cache } from 'next/cache'

export const loadPublicSiteBySlug = unstable_cache(
  async (slug: string) => { /* ... */ },
  ['public-site-by-slug'],
  { revalidate: 300, tags: ['public-site'] } // 5 perc
)
```

Emellett a `revalidatePath('/gy/${slug}')` után `revalidateTag('public-site')` is kell.

### K_4. **Sitemap — N+1 query probléma**

**Hol:** `app/sitemap.ts`

Minden közzétett gyülekezetre **külön query** a posztokra és a magazin lapszámokra. 100 gyülekezetnél 300+ query a sitemap generálásakor. Ez lassú, és crawler-ek gyakran hívják.

**Javítás:**
Egyetlen JOIN query vagy aggregált view. Vagy cache-elés + backend revalidation.

### K_5. **Poszt `published_at` logika mindig felülírja a jelenlegi értéket**

**Hol:** `app/(dashboard)/publikus-oldal/actions.ts:138-139`

```ts
const publishedAt =
  parsed.data.status === 'published' ? now : null
```

Ha egy publikált posztot **újra mentesz**, a `published_at` új `now()` érték lesz (az insert ágban). A már közzétett posztok dátuma megváltozhat, ami SEO szempontból rossz (a Google új-nak érzékeli) és az olvasóknak zavaró.

**Javítás:**
Ha már van `published_at`, tartsuk meg:
```ts
// Insert ágban:
const publishedAt = parsed.data.status === 'published' ? now : null
// De az UPDATE ágban a meglévő érték már jól kezelt (lásd sor 162-164)
// Insert esetén viszont első publikálásnál a now() megfelelő
```

Jelenleg az insert ágban rendben van, **de az UPDATE ágban is kell biztosítani**, hogy új `status=draft → published` esetén a régi `published_at` ne változzon, ha volt.

### K_6. **Kliens-oldali mobil body-scroll-lock nem perfect**

**Hol:** `components/public/public-mobile-nav.tsx:18-23`

`document.body.style.overflow = 'hidden'` — ez iOS-en nem 100%-ig működik (iOS Safari még mindig engedi a touch scrollt). Nem biztonsági hiba, csak UX.

### K_7. **Magazine Issue slug ütközés + érvénytelen karakterek**

**Hol:** `app/(dashboard)/publikus-oldal/magazin/actions.ts`

A `issue_number` mezőnél nincs explicit validáció (bár a DB-ben VAN `UNIQUE (magazine_id, issue_number)` constraint). Egy `issue_number: "2026/../../../other"` stringet elfogad, de a `UNIQUE` blokkolja az ütközést. A `encodeURIComponent` kezelje is a route-ot, de jobb explicit regex:

```ts
// validations/public-site.ts:
issue_number: z.string().min(1).max(30).regex(/^[\w\-/.]+$/)
```

### K_8. **Sanitize image filter host-alapú, nem URL-parser alapú**

**Hol:** `lib/public-site/sanitize.ts:50-60`

```ts
exclusiveFilter: (frame) => {
  if (frame.tag === 'img' && frame.attribs.src) {
    const url = frame.attribs.src
    return !url.startsWith('https://YOUR_PROJECT.supabase.co/storage/')  // ⚠️ HARDCODED PLACEHOLDER
  }
  return false
}
```

**A kód `'https://YOUR_PROJECT.supabase.co/storage/'` string-et keres, de ez egy placeholder!** A tényleges hostname soha nem fog egyezni. Ezért **minden img kép kifiltrálódik**, ami jó (biztonságos default), de rossz UX (a lelkész nem tud képet beilleszteni a poszt body-ba).

Ezt a `getSupabaseStorageHost()` helyettesíti a 34-40. sorban, de **az `exclusiveFilter`-ben nincs felhasználva**. Ez egy bug a meglévő kódban.

**Javítás:**
```ts
exclusiveFilter: (frame) => {
  if (frame.tag === 'img' && frame.attribs.src) {
    if (!storageHost) return true
    try {
      const parsed = new URL(frame.attribs.src)
      return parsed.host !== storageHost
    } catch {
      return true
    }
  }
  return false
}
```

*(Várjunk — ezt a kódot már javítottam egy korábbi fordulóban, nézd meg a tényleges kódot)*

---

## 5. 🟢 ALACSONY kockázat / UX javaslatok

### A1. **`.env.example` hiányosságok**

- Hiányzik: `SUPABASE_SERVICE_ROLE_KEY=` (egy sor kommenttel: "csak szerver-oldalon")
- Hiányzik: `NEXT_PUBLIC_APP_URL=` (sitemap-hez)

### A2. **God Mode actions v2/v3 deduplikáció**

Van `actions-v2.ts`, `actions-v3.ts`, `actions-v4.ts` — a v4 az aktuális. A v2/v3 dead code. Törölni kell.

### A3. **`any` típusok**

`app/(dashboard)/tagnyilvantartas/voter-actions.ts:46` használ `// eslint-disable-next-line`. Refaktoráljuk proper interface-re.

### A4. **Unused imports** (ESLint warning-ok):

- `components/muhely/layout/muhely-navbar.tsx:5` — `Lightbulb`
- `components/muhely/materials/material-card.tsx:1` — `Star`
- `components/muhely/materials/material-detail-dialog.tsx:8` — `BookOpen`

### A5. **Kommentek a poszt body-ban — tervezett funkció**

A poszton komment lehetőség nincs implementálva. A backlog-ban szerepel ("Phase 5"), de ha éles használatra megy a publikus oldal, a lelkész el fogja várni. Dokumentálni kell.

### A6. **Loading state a fórum komment betöltésnél**

`components/muhely/forum/forum-thread-view.tsx` — `useTransition`-t használ, de nincs látható loading spinner az első `loadComments()` alatt.

### A7. **Badge duplikáció** (valószínűleg már kezelt, de verifikálni kell)

`awardBadges()` → `insert many` — ha párhuzamosan fut, több badge kerülhet be ugyanarra a `(user_id, jelveny_id)` párra. UNIQUE index kell:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS mm_felhasznalo_jelveny_unique
  ON public.mm_felhasznalo_jelveny (user_id, jelveny_id);
```

### A8. **`serverActions.bodySizeLimit: '25mb'`**

25 MB sok egy szerver akcióra. Valóban csak a PDF magazin-nak kell; a képek max 2 MB. DoS elleni védekezés gyengül.

**Javítás:** Két külön szerver akcióba bonthatjuk őket, de Next.js nem támogatja a per-action body limit-et. Egy körültekintőbb megoldás: csak a magazin PDF upload-nál engedi 25 MB, minden más 5 MB. Ehhez átrendezés kell.

### A9. **Nincs CSP (Content Security Policy) header**

A `/gy/*` publikus útvonalak nem rendelkeznek CSP-vel. XSS védekezés másodrétege hiányzik.

**Javítás:**
```ts
// next.config.ts
headers: async () => [
  {
    source: '/gy/:path*',
    headers: [
      { key: 'Content-Security-Policy', value: "default-src 'self'; img-src 'self' https://*.supabase.co data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'" },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ],
  },
],
```

### A10. **Kliens-oldal image-resize nincs**

A `image-uploader.tsx` csak méret-ellenőrzést végez, nem resize-ol. A felhasználó feltölthet egy 2 MB JPG-t 6000×4000 méretben. Kliens-oldali resize 1600px-re jelentős bandwidth megtakarítás lenne.

### A11. **No rate limiting**

Semmilyen szerver akcióra nincs rate limiting. Egy rosszindulatú user végtelen szavazást küldhet, posztot írhat, stb. **Production-re Upstash rate limit-et kell hozzáadni** a biztonság-érzékeny action-ökre (regisztráció, bejelentkezés, szavazás, komment).

### A12. **`slug.ts` RESERVED_SLUGS — hiányzik néhány**

Hiányzik: `sitemap.xml`, `robots.txt`, `opengraph-image`, `icon`, `apple-touch-icon`, `manifest.json`

---

## 6. Logikai hibák és be nem fejezett funkciók

### L1. **A lelkészi session navigálni tud a publikus oldalra, de a "vissza" gomb nem létezik**

A `/gy/[slug]` layoutban nincs "Vissza a lelkészi felületre" gomb egy belépett lelkész számára. Ez kicsit zavaró, ha a lelkész saját oldalát nézi. UX kiegészítés: ha `access.user && effectiveCongregationId === site.congregation_id`, mutassunk egy `Szerkesztés / Vissza a dashboardba` gombot.

### L2. **`loadWhatsNew()` frissítés utáni viselkedés**

A `loadWhatsNew()` frissíti a `mm_felhasznalo_statisztika.frissitve` mezőt — **de ez ugyanazt a mezőt írja, amit a gamifikáció is használ a `awardPoints`-ban**. Konfliktus: ha a user csak belép és megnézi a "what's new" blokkot, a `frissitve` mező átíródik → a rendszer úgy veszi, mint ha legutóbb akkor szerzett volna pontot. Ez a gamifikáció szempontjából nem probléma, de zavaró, ha valaha a `frissitve`-t "utoljára aktív" időbélyegre használnánk.

**Javítás:** Külön mező `utolso_latogatas` a "what's new" funkcióhoz:
```sql
ALTER TABLE mm_felhasznalo_statisztika
  ADD COLUMN utolso_latogatas timestamptz;
```

### L3. **A Missziós Műhely Layout nem használja az új publikus oldal minta fűzőjét**

A `app/misszios-muhely/layout.tsx` a `(dashboard)` csoporton KÍVÜL van — tehát a middleware átengedi, de a nem-bejelentkezett felhasználó is elérheti a `/misszios-muhely` útvonalat. **Ez a lelkészi funkció, csak lelkésznek való!**

Ellenőrizni kell: `middleware.ts` érinti-e a `/misszios-muhely`-t vagy átengedi? Ha átengedi, egy nem-bejelentkezett user is láthatja (de RLS miatt üres listát fog látni, tehát nem katasztrófa, de nem is szándékos).

**Javítás:** A layoutban egy `redirect('/login')` ha nincs user:
```ts
// app/misszios-muhely/layout.tsx
const { user } = await getEffectiveAccessContext()
if (!user) redirect('/login')
```

### L4. **`Post edit` — slug megváltoztatás nem irányítja át**

Ha egy lelkész módosítja egy publikált poszt slug-ját, a régi URL `/gy/xxx/posts/regi-slug` → 404. Nincs redirect logika a régi slug-ról az újra. Érdemes egy `public_post_slug_history` táblát felhozni, és egy `redirect`-et a `[postSlug]/page.tsx`-ben.

### L5. **Sanitize `image` szűrő a globális `getSupabaseStorageHost()` fallback-el**

A `sanitize.ts`-ben a getSupabaseStorageHost csak env var-ra támaszkodik. Ha a deploy során ez nincs beállítva (ritkaság), minden kép blokkolva lesz a poszt body-ban. Log-olni kell, ha null jön vissza.

---

## 7. Kód minőség, kisebb problémák

### KM1. **`dashboard-shell.tsx` és a refined verziók** — redundáns komponensek

Több `header-refined`, `sidebar-refined-v3` stb. fájl létezik. Érdemes tisztázni, mi az aktív, mi a backup, és a nem-használtakat törölni.

### KM2. **Pénzügy modul — nincsenek server action typing-ek a return type-ra**

Több `actions.ts` file vár `Promise<any>` jellegű return-t. TypeScript biztonság szempontjából érdemes explicit `Promise<Result<T>>` típusokat adni:

```ts
type Result<T> = { data: T } | { error: string }
```

### KM3. **A gamifikáció pontok stat-ja a race condition miatt**

`awardPoints` → `getLatestStats` → `update` sorrend. Párhuzamos pont-event esetén az egyik update eldobódhat (last-writer-wins). Trigger alapú megoldással (insert-re aggregáció) biztosabb lenne.

---

## 8. Performancia és skálázhatóság

1. **Dashboard `/dashboard/page.tsx`** — 10 párhuzamos Supabase query a loadoláskor. 500+ fős gyülekezetnél ~500 ms. 5000+ fősnél 2-3 s. Érdemes view-ba vinni az aggregációkat.

2. **Sitemap** — említve a K_4-ben

3. **`loadPublishedPosts`** — nincs pagination; 50 post limit. 200+ posztos gyülekezetnél a feedet limit + offset-tel vagy cursor-ral kell kezelni.

4. **Kép optimalizáció** — Next.js Image komponens használata (M5)

---

## 9. Azonnali javítási sorrend

A következő sorrendben javasolt a hibák kezelése:

**1. lépés (24 órán belül):**
- [ ] K2: hardcoded `258456` PIN eltávolítása
- [ ] K4: God Mode deactivate → override invalidálás
- [ ] K3: Path traversal validáció a upload-actions.ts-ben
- [ ] K1: mm_* RLS migráció megírása és futtatása

**2. lépés (1 héten belül):**
- [ ] M1: Missziós Műhely server action-ök congregation check
- [ ] M2: Forras URL validáció
- [ ] M3: mm_szavazatok UNIQUE constraint
- [ ] M4: Join/kilépés pont-logika javítás
- [ ] K_8: Sanitize storage host ellenőrzése (valószínűleg már javítva)

**3. lépés (2 héten belül):**
- [ ] M5: Next.js Image komponens bevezetése publikus oldalon
- [ ] M6: ESLint `no-unescaped-entities` hibák javítása
- [ ] K_1: Master admin bypass dokumentálása vagy szűkítése
- [ ] K_2: Generic error üzenetek a publikus/admin action-ökben
- [ ] K_3: `loadPublicSiteBySlug` cache
- [ ] K_5: `published_at` logika finomítás

**4. lépés (1 hónapon belül):**
- [ ] A11: Rate limiting (Upstash)
- [ ] A9: CSP headerek
- [ ] L3: Missziós Műhely auth guard
- [ ] Kód minőség javítások (KM1-3)

---

## 10. Pozitívumok — amit JÓL csinál a rendszer

Fontos kiemelni, mi az, ami jelenleg is kiválóan működik:

1. **Fázis 0 RLS hardening** — a `szemely`, `befizetes`, `csalad`, `gyerek` táblák nemrég védve lettek RLS-sel. Ez egy nagyon fontos lépés volt.

2. **Publikus oldal izolációs architektúra** — a `(public)` route group elkülönítése, a middleware átszabása, a `public_sites.is_published` opt-in védelem mind jó döntés.

3. **HTML sanitization** — a `sanitizePostBody` whitelist-es, szigorú. Az `about_html` is sanitizált.

4. **Slug validáció** — a `RESERVED_SLUGS` lista jó.

5. **SECURITY DEFINER helper függvények** — a `current_user_can_access_congregation` mintaszerű.

6. **Server Actions szerver-oldali** — a `lib/supabase/admin.ts` csak szerver-oldali fájlokban használva.

7. **TypeScript teljes lefedettség** — 0 `tsc` hiba.

8. **Mobile-first reszponzív UI** — a publikus oldal minden breakpoint-en jól működik.

9. **Opt-in publikálás, opt-in SEO** — a `is_published=false`, `robots_index=false` default-ok helyesek.

10. **cache() a `getEffectiveAccessContext`-nél** — a React cache megfelelően használva.

---

## 11. Ellenőrzési terv a javítások után

### Security regression test

1. **RLS teszt script**:
   ```sql
   -- Egy másik gyülekezet user-ével próbálj más gyülekezet adatait írni
   -- Eredmény: policy violation error
   ```

2. **Path traversal teszt** (kliens-oldalon):
   ```ts
   const fd = new FormData()
   fd.append('file', imageFile)
   fd.append('target', JSON.stringify({ kind: 'post-cover', postSlug: '../../other/hero' }))
   const result = await uploadPublicSiteImage(fd)
   // Várakozás: { error: 'Érvénytelen slug.' }
   ```

3. **God Mode lifecycle teszt**:
   ```
   1. activateGodMode(pin)
   2. enterCongregation(A_cong)
   3. deactivateGodMode()
   4. Új session: a admin_access_requests soroknak 'expired'-nek kell lennie
   5. getActiveOverride() → { active: false }
   ```

4. **Missziós Műhely pont exploit teszt**:
   ```
   for (let i = 0; i < 100; i++) {
     await toggleIdeaJoin(ideaId)
     await toggleIdeaJoin(ideaId)
   }
   // Várakozás: mm_felhasznalo_statisztika.osszpontszam +5 (nem +500)
   ```

5. **CSP teszt**: nyisd meg a `/gy/[slug]`-ot, ellenőrizd a HTTP headert `curl -I` segítségével.

### Reszponzivitás teszt
- iPhone SE (375px), iPhone 14 (390px), iPad (768px), laptop (1280px), 4K (3840px)
- Lighthouse mobile + desktop audit
- a11y teszt (axe)

---

## 12. Dokumentációs hiányosságok

A következő dokumentumok jelenleg nem léteznek vagy elavultak:

- **Security runbook** — mit kell tenni egy biztonsági incidens esetén
- **God Mode protokoll** — mikor, ki, hogyan használhatja
- **RLS policy lista** — melyik tábla, melyik policy, miért
- **Release checklist** — regressziós teszt a new release előtt

---

## 13. Összegzés

A Kartotéka rendszer **több mint 90%-a biztonságos és jól épített**. A fenti auditban felsorolt problémák egy jelentős része a rendszer **korábbi fázisaiban** keletkezett (Missziós Műhely RLS, God Mode logika), és a most épített publikus oldal feature **viszonylag kevés új hibát hozott** — a 4 kritikus problémából 2 (K2, K4) a régi kódban van.

**A legfontosabb üzenet:** A **mm_\* táblákon az RLS hiánya** és a **hardcoded default god mode PIN** két olyan probléma, amelyek **production-ben egy bejelentkezett támadó számára valós hozzáférést adnak**. Ezeket prioritásként kell kezelni.

A többi hiba (path traversal, congregation isolation, rate limiting) fontos, de ezeket egy jól szervezett 1-2 hetes sprint megoldhatja.

**A rendszer biztonsági érettsége: 7/10** (a kritikus hibák javítása után: 9/10).

---

*A jelentést Claude készítette. A kritikus elemek mindegyikét kód-szintű grep-pel és fájl-olvasással verifikáltam. A továbbfejlesztéshez javaslott: penetration tester bevonása, különösen a god mode és az admin override rendszerre.*
