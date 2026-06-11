# Kartotéka — Email setup + saját domain átállás zárókép (2026-05-18)

**Session-idő:** ~2 óra (2026-05-18 ~22:00 - 2026-05-18 ~03:14 UTC+3)
**Eredmény:** transactional email küldés végre működik, saját `kartoteka.app` domain production-ön, magyar dizájnos email template-ek élesben.

---

## Kontextus

A user a `/forgot-password` flow-on "Hiba történt. Kérem, próbálja újra később." üzenetet kapott — semmi email nem ment ki. A debug 4 egymásra rétegződő hibát hozott felszínre, amik mind az SMTP-pipeline-on voltak.

## Időrendi áttekintés

### 1. Kódbeli hibafelfedés (~22:00)
A [apps/web/app/(auth)/forgot-password/actions.ts](apps/web/app/(auth)/forgot-password/actions.ts) eredetileg **csendben elnyelte** a Supabase hibaüzenetet, és csak generikus szöveggel válaszolt. Átírtam, hogy:
- Mindig logoljon szerver-oldalra (`console.error` → terminál + Vercel/Railway logs)
- 429 rate-limit specifikus magyar üzenetet adjon
- Dev módban felfedje az eredeti Supabase üzenetet
- Prod-ban maradjon a generikus üzenet (adatvédelem)

### 2. Brevo SMTP hibák feltárása (~22:30 - 00:30)
A direkt curl `https://[supabase-project].supabase.co/auth/v1/recover` tesztből kiderült: `HTTP 500 / "Error sending recovery email" / unexpected_failure`.

Lépésről lépésre kizárva:
- ❌ NEM Supabase rate-limit (0 recovery az utóbbi órában)
- ❌ NEM Brevo Free tervi kvóta (üres logs)
- ❌ NEM Brevo SMTP key érvénytelen (új generálás után is fail)
- ⚠️ **GYAN: `endreszocs@gmail.com` mint sender címet a Brevo NEM küldheti ki**, mert Gmail DMARC `p=reject` policy blokkolja a `@gmail.com` domain mást általi küldését (2024 február óta szigorúan érvényes Brevo-anti-spoof).

### 3. Domain beszerzés + Brevo autentikáció (~00:30 - 01:30)
A user megvette a **`kartoteka.app`** domaint Cloudflare Registrar-on (~$10-12/év).

- Brevo Dashboard → Senders, Domains → **Add domain `kartoteka.app`**
- **🎉 Cloudflare Domain Connect**: a Brevo automatikusan vitte fel a 4 DNS rekordot (Brevo code TXT, DKIM 1 CNAME, DKIM 2 CNAME, DMARC TXT) — manuális DNS szerkesztés kihagyva
- **Check configuration** → mind a 4 rekord zöld pipa ("values match")
- Új sender: `Kartotéka Rendszer <noreply@kartoteka.app>` — Verified, saját DKIM, DMARC OK
- Régi `endreszocs@gmail.com` sender törölve
- Supabase SMTP Settings → Sender email átírva `noreply@kartoteka.app`-ra

### 4. A PERDÖNTŐ hiba — Brevo IP allowlist (~01:30 - 02:00)
Az új sender ellenére még mindig `HTTP 500`. A Supabase Auth Logs → Logs Explorer-ben a `request_id` keresésével megjelent a tényleges Brevo SMTP válasz:

```
"error":"525 5.7.1 Unauthorized IP address"
```

Ez a Brevo specifikus hibakód: az **SMTP IP-allowlist BE VOLT KAPCSOLVA**, üres engedélyezett IP-listával — vagyis MINDEN IP blokkolva volt. A Supabase nem ad fix IP-t (változó AWS IP-pool), így IP-allowlist + Supabase SMTP **nem fér össze**.

**Megoldás:** Brevo → Security → Authorized IPs → `Deactivate for SMTP keys` gomb. Ezt 1 kattintással kikapcsolta a user, és **azonnal** megjött az első email a `noreply@kartoteka.app`-tól.

### 5. Custom domain átállás Railway-en (~02:00 - 02:30)
A user a Railway Dashboard-on hozzáadta a `kartoteka.app` + `www.kartoteka.app` custom domain-eket. Cloudflare DNS rekordok automatikusan élesedtek. A `NEXT_PUBLIC_APP_URL=https://kartoteka.app` env var is felment.

A Supabase Dashboard → Authentication → URL Configuration:
- **Site URL**: `https://kartoteka.app`
- **Redirect URLs**: `https://kartoteka.app/**`, `https://www.kartoteka.app/**`, `http://localhost:3000/**`

### 6. Kód-átállás `kartoteka.app`-ra (~02:30)
9 előfordulás 8 kód-fájlban cserélve `https://kartotekaweb-production.up.railway.app` → `https://kartoteka.app`:

| Fájl | Mire |
|---|---|
| [supabase/functions/issue-license/index.ts](supabase/functions/issue-license/index.ts) | CORS allowlist (2 előfordulás) |
| [apps/web/lib/broadcasts/email.ts](apps/web/lib/broadcasts/email.ts) | broadcast email logo URL |
| [apps/web/app/(auth)/forgot-password/actions.ts](apps/web/app/(auth)/forgot-password/actions.ts) | reset-password redirect fallback |
| [apps/web/app/(public)/hozzaferes-kerese/actions.ts](apps/web/app/(public)/hozzaferes-kerese/actions.ts) | signup confirm redirect |
| [apps/desktop/src/pages/home-page.tsx](apps/desktop/src/pages/home-page.tsx) | daily-verse API URL (Tauri) |
| [apps/web/components/auth/oauth-buttons.tsx](apps/web/components/auth/oauth-buttons.tsx) | Google OAuth redirect |
| [apps/web/components/auth/legal-dialog.tsx](apps/web/components/auth/legal-dialog.tsx) | terms dialog UI szöveg |
| [apps/web/app/(dashboard)/admin/access-requests-actions.ts](apps/web/app/(dashboard)/admin/access-requests-actions.ts) | admin invite-link fallback |

### 7. Magyar dizájnos email template-ek (~02:30 - 02:50)
A Supabase default email template-ek angolul + nem branded → spam-be esnek könnyen. Készült 4 magyar dizájnos HTML template (Kartotéka logó, zöld branding, footer):

- Reset Password
- Confirm Signup
- Magic Link
- Invite User

Doc: [KARTOTEKA-supabase-email-templates-magyar-2026-05-18.md](KARTOTEKA-supabase-email-templates-magyar-2026-05-18.md)

A user manuálisan bemásolta a Supabase Dashboard → Email Templates-be. Az új sender `noreply@kartoteka.app` + magyar branded HTML együtt → professzionális email.

### 8. Middleware fix /reset-password (~02:50)
Az új email link kattintásakor még mindig `/login?error=access_denied&error_code=otp_expired`. A root cause:

[apps/web/lib/supabase/middleware.ts:13-19](apps/web/lib/supabase/middleware.ts#L13-L19) — a `/reset-password` route **nem szerepelt** a `PUBLIC_AUTH_ROUTES`-on, és a middleware anonim user-t (nem volt session) a `/login`-ra dobta a query stringgel együtt.

**Megoldás:** `'/reset-password'` hozzáadva a `PUBLIC_AUTH_ROUTES`-hoz. Az anonim user is, a logged-in user is átengedve — a kliens-oldali kód [components/auth/reset-password-form.tsx](apps/web/components/auth/reset-password-form.tsx) `useEffect`-ben maga ellenőrzi a Supabase session-t.

### 9. Git commit + push + Railway deploy (~03:00 - 03:14)
- Commit: [`6b21b9a1`](https://github.com/endreszocs/kartoteka/commit/6b21b9a1) — "feat(web): saját kartoteka.app domain átállás + email setup (Brevo)"
- 10 fájl változás: 386 insertion + 20 deletion
- Push to main: `3dd04e98..6b21b9a1` ✓
- Railway automatikus deploy: **2 perc 2 másodperc** (03:11:40 - 03:13:42)
- Live verifikáció: `https://kartoteka.app/reset-password` → HTTP 200 OK ✓

---

## Live verifikáció (2026-05-18 03:14)

| Endpoint | Status | Megjegyzés |
|---|---|---|
| `https://kartoteka.app` | 307 → `/login` | Cloudflare proxy + Railway europe-west4 |
| `https://www.kartoteka.app` | 307 → `/login` | www variant működik |
| `https://kartoteka.app/forgot-password` | 200 OK | Next.js SSG cache HIT |
| `https://kartoteka.app/reset-password` | 200 OK | **middleware fix élesben** |
| `https://kartoteka.app/kartoteka-logo.png` | 200 OK | logó asset 483 KB, email-ekben behúzható |
| `POST /auth/v1/recover` | 200 OK | Brevo SMTP fogadja, email megy |

---

## Maradt pending feladatok

### Azonnali (E2E teszt)
1. **Friss recovery email-t kérni** + **azonnal kattintás** Gmail-ből (a Gmail link-preview robot előtt) → a magyar email kell érkezzen, a reset link a `/reset-password`-re vigye, az új jelszó beállítás működjön
2. Spam folder vs Inbox: első emailek valószínűleg spam-ben, "Not spam" jelölés segít

### Hét napon belül
1. **Supabase Edge Function re-deploy** (`issue-license`) — a CORS allowlist `kartoteka.app`-ra változott, Tauri desktop app-hoz kell. Parancs:
   ```
   npx supabase functions deploy issue-license
   ```
2. **Old Railway URL fokozatosan kivezetni** — egyelőre még él (`https://kartotekaweb-production.up.railway.app`), később a Railway Dashboard-on a default URL-t le lehet tiltani

### 1-2 hét múlva
1. **DMARC szigorítás** — most `p=none` van (Brevo default). Ha a Brevo DMARC riportok tisztán mutatják minden saját email átment SPF+DKIM-en, érdemes `p=quarantine`-ra emelni a Cloudflare `_dmarc.kartoteka.app` rekordban. Ez csökkenti a spam-be esést hosszú távon.
2. **Email warm-up monitoring** — Brevo Statistics-ban követni a "Delivered / Bounced / Spam reports" arányokat. Új sender domain ~2 hét után tisztul.

---

## Tanulságok jövőbeli email-setup-okhoz

1. **Gmail/Yahoo/Outlook freemail címet SOHA nem szabad sender-ként használni** SMTP relay-nél. A Brevo (és minden modern SMTP) automatikusan blokkolja a `@gmail.com` mást általi küldését (DMARC `p=reject`). Saját domain + DKIM/SPF/DMARC kötelező.

2. **Brevo Security → Authorized IPs lap MINDIG ellenőrizni** új setup-nál — alapból "Activated" lehet SMTP-re, és üres lista = mindent blokkol. A Supabase nem ad fix IP-t, így ezt KI kell kapcsolni.

3. **Cloudflare Domain Connect 1-klikkes DNS setup** — ha a domain DNS Cloudflare-en van, a Brevo automatikusan vitte fel a 4 rekordot (SPF, DKIM 1+2, DMARC). Manuális DNS szerkesztés kihagyható.

4. **Supabase Auth Logs > Brevo Transactional Logs** — ha a Brevo Logs üres, a Supabase **el sem érte** a Brevo-t (autentikációs fail). Akkor a Supabase Logs Explorer → Auth → request_id keresés mutatja a tényleges SMTP hibát szövegesen.

5. **Új email-flow setup esetén MIDDLEWARE-t ellenőrizni** — a Next.js auth middleware könnyen átirányítja a public auth-related route-okat (mint `/reset-password`) az anonim user esetében. A `PUBLIC_AUTH_ROUTES` listára kell tenni, hogy átengedje.

---

## Memory bejegyzések (auto-memory)

A session tudása mentve:
- `production_domain_kartoteka_app.md` (reference) — kartoteka.app domain
- `email_setup_brevo_2026_05_18.md` (project) — Brevo SMTP setup + 5 gotcha
- `auth_reset_password_flow.md` (project) — Supabase recovery flow + middleware
- `MEMORY.md` index frissítve

Helye: `C:\Users\endre\.claude\projects\c--Users-endre-Documents-APPS-Egyh-zi-APP-KARTOTEKA\memory\`
