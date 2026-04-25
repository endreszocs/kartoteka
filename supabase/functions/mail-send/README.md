# `mail-send` Edge Function

**Cél:** egységes email-küldési secret-gateway a Kartotéka web és desktop kliens számára. A Brevo / Resend API kulcsokat **NEM** a kliens bundle-ban tároljuk — itt, Supabase secrets között élnek.

**Fázis:** M6.4a — a Tauri migrációs roadmap első Edge Function mintája. Utána jön `oblio-oauth`, `oblio-invoice`, `ai-chat`.

## Hogyan hívható

### Kliens-oldali hívás (web vagy desktop, ugyanaz)

```ts
import { getSupabaseClient } from '@kartoteka/supabase-client' // vagy helyi factory

const supabase = getSupabaseClient()
const { data, error } = await supabase.functions.invoke('mail-send', {
  body: {
    to: { email: 'lelkesz@example.ro', name: 'Kovács Pál' },
    subject: 'Üdvözlet a Kartotéka rendszerből',
    text: 'Kedves Pál, ...',
    html: '<p>Kedves Pál, ...</p>',
    tags: ['access-request-approved'],
    // provider?: 'brevo' | 'resend'  — opcionális override
  },
})
// data: { success: true, provider: 'brevo', messageId: '...' }
// error: HTTP error (401 unauthenticated, 400 bad body, 500 config)
```

### Viselkedés

1. **Auth**: csak `authenticated` Supabase user JWT-vel (a kliens automatikusan adja a `Authorization: Bearer` header-t az `invoke()` során).
2. **Provider választás**: `args.provider` → `EMAIL_PROVIDER` env → `brevo` (default).
3. **Fallback**: ha az elsődleges provider fail (5xx vagy hálózati hiba), automatikusan próbáljuk a másikat.
4. **Bulk címzett**: Brevo korlátlan egy request-ben, Resend max 50 → itt 50-es chunkokra bontva.
5. **Error flow**: mindig `200 OK` JSON-nel válaszol (a `MailSendResult`-ot) — az error mezőben van a probléma leírása, nem dob HTTP hibát. Kivétel: 400 (bad body), 401 (unauthenticated), 405 (nem POST).

## Deploy lépések (Endrének, Supabase CLI-vel)

### 1. Secrets beállítása (egyszer, ill. kulcs-cserekor)

```bash
# Brevo (elsődleges)
supabase secrets set BREVO_API_KEY="xkeysib-..."
supabase secrets set BREVO_FROM_EMAIL="no-reply@kartoteka.ro"
supabase secrets set BREVO_FROM_NAME="Kartotéka Rendszer"

# Resend (fallback)
supabase secrets set RESEND_API_KEY="re_..."
supabase secrets set RESEND_FROM="Kartotéka <noreply@kartoteka.ro>"

# Opcionális: provider default override
supabase secrets set EMAIL_PROVIDER="brevo"
```

> A `SUPABASE_URL` és `SUPABASE_ANON_KEY` automatikusan beállításra kerül a Supabase-ben, ezeket külön nem kell megadni.

### 2. Deploy

```bash
cd "D:/Egyházi APP/KARTOTEKA"
supabase functions deploy mail-send
```

### 3. Verifikáció (curl + user JWT)

```bash
# 1. Szerezz egy user JWT-t a Supabase Studio-ből (Authentication → Users → JWT)
# 2. Hívd meg az Edge Fn-t:

curl -X POST "https://<project-ref>.supabase.co/functions/v1/mail-send" \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": {"email": "endreszocs@gmail.com", "name": "Endre"},
    "subject": "M6.4a smoke test",
    "text": "Ez egy teszt üzenet a mail-send Edge Function-ből.",
    "html": "<p>Ez egy <b>teszt üzenet</b> a mail-send Edge Function-ből.</p>",
    "tags": ["m6-4a-smoketest"]
  }'

# Várható: {"success":true,"provider":"brevo","messageId":"..."}
```

### 4. Logok

```bash
supabase functions logs mail-send --tail
```

## Hogyan csatlakozik a @kartoteka/core-hoz (M7 alatt)

Az M7 pénzügyi wave és az M6.6 előtt a `@kartoteka/core/mail/send.ts` kliens-oldali wrapper fog születni, ami az `invoke('mail-send', ...)` hívást csomagolja:

```ts
// packages/core/src/mail/send.ts (M7 alatt)
export interface MailSendArgs { /* ... */ }
export interface MailSendResult { /* ... */ }

export async function sendMailUseCase(
  args: MailSendArgs,
  ctx: { supabase: SupabaseClient },
): Promise<MailSendResult> {
  const { data, error } = await ctx.supabase.functions.invoke<MailSendResult>(
    'mail-send',
    { body: args },
  )
  if (error) {
    return { success: false, provider: 'disabled', error: error.message }
  }
  return data!
}
```

Ezzel a web Server Action-ök és a desktop kliens **ugyanazt a use-case függvényt** hívják — és a secret (API kulcs) egyikhez sem kerül közel.

## Biztonsági megjegyzések

- **Rate-limit**: az Edge Function nem limitál saját jogon. A Brevo/Resend saját rate-limit-je véd. Ha broadcast-kontextusban tömeges küldés lesz (system_broadcasts), érdemes egy táblán vagy env-ben konfigurált throttle.
- **Abuse prevention**: a `to` cím listát csak authenticated user adhatja. Egy autentikált lelkész is csinálhatna spamet — ha ez kockázat, a payload-on server-side validálás (pl. `to.length <= 100`) kerülne ide.
- **GDPR**: a Brevo EU-n (Franciaország) fut, a Resend globális. Ha szigorú GDPR-kötöttség kell, a `RESEND_FROM`-ot ne add meg, a fallback kimarad.

## Törlés

Ha a function dezaktiválandó:
```bash
supabase functions delete mail-send
```
A kliens oldalon a `sendMailUseCase` ekkor `success: false, provider: 'disabled'` választ ad.
