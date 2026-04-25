# M6.4a — `mail-send` Edge Function (secret-gateway minta)

**Dátum:** 2026-04-22
**Fázis:** M6.4a — a Tauri migrációs roadmap Edge Function gateway-ének első darabja
**Státusz:** ✅ Kód + deploy-doc kész; 🟡 Endre deploy-olja Supabase CLI-vel

Roadmap: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## Miért kell

A Tauri desktop **soha nem tartalmazhat** külső API kulcsot (Brevo, Resend, Oblio, Anthropic). A memória (`feedback_tauri_rls_kotelezo`) szerint minden external API hívás **Supabase Edge Function-re** megy — ott a secret a Supabase secrets közötti, a kliens csak authenticated user JWT-vel éri el.

Az M6.4a célja: **egy első, működő minta** kialakítása, amelyet a többi 3 Edge Fn (`oblio-oauth`, `oblio-invoice`, `ai-chat`) mintául követ.

A `mail-send` azért ideális első minta, mert:
- Egyszerű payload, nincs OAuth-refresh-token bonyodalom
- Két provider (Brevo default, Resend fallback) — jól mutatja a provider-kezelés pattern-t
- Tiszta REST API-k mindkét oldalon (nincs `npm:` modulfüggőség)
- A meglévő `apps/web/lib/email/{send,providers/brevo,providers/resend}.ts` kódot 1:1 portolja Deno-ra

## A megoldás

**Új fájlok:**
- [`supabase/functions/mail-send/index.ts`](../../supabase/functions/mail-send/index.ts) — Deno runtime Edge Function
- [`supabase/functions/mail-send/README.md`](../../supabase/functions/mail-send/README.md) — deploy + secret setup + curl test

**Szerkezet** (index.ts):
1. CORS headers (web + desktop egyaránt hívhat)
2. OPTIONS / method check
3. **Auth**: a req `Authorization` header-ből user JWT-t veszünk, a Supabase Anon klienssel `supabase.auth.getUser()`-rel ellenőrzzük (unauthenticated → 401)
4. JSON body parse + validate (`to, subject, text, html` kötelező)
5. Provider választás: `args.provider` → `EMAIL_PROVIDER` env → `brevo` (default)
6. Küldés a választott provider-rel
7. **Fallback**: ha a primary fail → automatikusan megpróbálja a másikat
8. Mindig 200 JSON-t ad (`MailSendResult`), az error mezővel — ezzel könnyebb a kliensnek kezelni

**Két provider**:
- **Brevo**: REST API `POST https://api.brevo.com/v3/smtp/email` — EU GDPR, 300/nap free
- **Resend**: REST API `POST https://api.resend.com/emails` — globális, 50 cím/request chunk (bulk limit)

## Deploy lépések (Endrének)

### 1. Secrets beállítása (Supabase CLI)

```bash
supabase secrets set BREVO_API_KEY="xkeysib-..."
supabase secrets set BREVO_FROM_EMAIL="no-reply@kartoteka.ro"
supabase secrets set BREVO_FROM_NAME="Kartotéka Rendszer"
supabase secrets set RESEND_API_KEY="re_..."
supabase secrets set RESEND_FROM="Kartotéka <noreply@kartoteka.ro>"
supabase secrets set EMAIL_PROVIDER="brevo"
```

### 2. Deploy

```bash
cd "D:/Egyházi APP/KARTOTEKA"
supabase functions deploy mail-send
```

### 3. Verifikáció (curl, user JWT-vel — részletes curl a README-ben)

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/mail-send" \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"to":{"email":"endreszocs@gmail.com"},"subject":"M6.4a smoketest",...}'
```

Várt válasz: `{"success":true,"provider":"brevo","messageId":"..."}`

## Hogyan csatlakozik a kódbázishoz

**Rövid távon** (M6.4a, most): a függvény önállóan működik, de **még nincs kliens-oldali wrapper**. Az M7 pénzügyi wave elején (`packages/core/src/mail/send.ts`) kerül be a `sendMailUseCase(args, ctx)` wrapper, amely `supabase.functions.invoke('mail-send', ...)`-ot hív.

**Hosszabb távon**: minden Server Action, amely ma `apps/web/lib/email/send.ts`-ből importál, áll majd át a `sendMailUseCase` core-use-case-re. Ez:
1. A `access-requests-actions.ts` approve/reject email
2. A broadcast rendszer (`broadcasts-actions.ts`)
3. A `device-revoke` értesítés
4. A support-form auto-acknowledge

A meglévő `apps/web/lib/email/send.ts` **nem törlődik azonnal** — backward-compat szempontból megmarad, amíg az M7 use-case-refaktor alatt át nem költöznek a hívások. Ez **nincs scope-ban M6.4a-hoz**.

## Mi NEM volt scope-ban

- `oblio-oauth` Edge Fn — M7-ben
- `oblio-invoice` Edge Fn — M7-ben
- `ai-chat` Edge Fn (a `/api/ai/chat` áttelepítése) — M11-ben (notifications/dashboard wave)
- `@kartoteka/core/mail/send.ts` kliens wrapper — M7 elején
- Throttle / rate-limit logika — M14 CI/CD alatt érdemes; ma a Brevo/Resend saját rate-limit-je véd

## Tesztelési terv

1. **Smoketest** (Endre, a deploy után): curl-lel Brevo-val, ellenőrizni, hogy megkapja az emailt
2. **Provider override test**: curl-lel `"provider": "resend"` paraméterrel — mindkettő működjön
3. **Fallback test**: ideiglenesen törölt BREVO_API_KEY → fallback Resend
4. **Unauthenticated test**: curl auth nélkül → 401

## Kapcsolódó fájlok

- [`supabase/functions/mail-send/index.ts`](../../supabase/functions/mail-send/index.ts) (új, 200 sor)
- [`supabase/functions/mail-send/README.md`](../../supabase/functions/mail-send/README.md) (új)
- [`apps/web/lib/email/send.ts`](../../apps/web/lib/email/send.ts) (forrás, M7-ig változatlan)
- [`apps/web/lib/email/providers/brevo.ts`](../../apps/web/lib/email/providers/brevo.ts) (minta)
- [`apps/web/lib/email/providers/resend.ts`](../../apps/web/lib/email/providers/resend.ts) (minta)
- [`supabase/functions/issue-license/index.ts`](../../supabase/functions/issue-license/index.ts) (ellenőrzött Edge Fn mintadarab)

## Következő M6 lépések

- **M6.4b** — további Edge Fn-ök (`oblio-oauth`, `oblio-invoice`) — M7 elején, mert az Oblio OAuth-refresh-token kezelés komplex és Test-only környezetet igényel
- **M6.3** — `/api/standalone/*` felülvizsgálat (döntési pont Endrével: azonnal törlés vagy deprecation-stage?)
- **M6.6** — Desktop auth Tauri keyring-be (Rust `src-tauri/src/auth.rs` új modul)
- **M6.8** — Offline orchestrator átemelése `apps/web/lib/offline/*` → `packages/offline-sync/src/*`

Az M6.2 teljes zöld, az M6.7 kész — az M7 pénzügyi wave **nagyon közel van az indulához**.
