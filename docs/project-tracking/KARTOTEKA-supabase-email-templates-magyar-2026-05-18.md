# Kartotéka — Supabase Auth Email Templates magyarítása + branding (2026-05-18)

## Helyzet

A Supabase Auth alapból angol, minimalista email template-ekkel jön. Ezek:
- Angolul vannak (tárgy + body)
- Egyszerű inline HTML, nincs branding, nincs logo, nincs footer
- A Gmail/Outlook spam-szűrőknek "default Supabase email" mintázat → könnyen spam-be esnek

## Mit kell csinálni

Supabase Dashboard → **Authentication → Emails → Templates** lapon **4 template-et** kell átírni magyarra:

1. **Confirm signup** — új user regisztráció megerősítése
2. **Reset password** — jelszó-visszaállítás (most ezt teszteltük!)
3. **Magic Link** — passwordless login (ha használjuk)
4. **Invite user** — adminisztrátor által meghívott user

Mindegyiknél van **Subject** (tárgy) és **Body** (HTML) mező.

A Supabase-template-változók ezek lehetnek a body-ban:
- `{{ .ConfirmationURL }}` — a magic link URL
- `{{ .Token }}` — 6-jegyű OTP kód (ha used)
- `{{ .Email }}` — a recipient email
- `{{ .SiteURL }}` — a Site URL beállításból
- `{{ .RedirectTo }}` — a redirect URL paraméter

## Template-ek

### 1. Reset Password

**Subject:**
```
Kartotéka — Jelszó-visszaállítás
```

**Body (HTML):**
```html
<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Jelszó-visszaállítás — Kartotéka</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif; color:#1e293b; line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f8fafc;">
    <tr>
      <td align="center" style="padding:40px 20px;">

        <!-- Outer card -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 2px 8px rgba(15,23,42,0.06);">

          <!-- Header band -->
          <tr>
            <td style="background:linear-gradient(135deg, #14532d 0%, #166534 100%); padding:32px 32px 28px;" align="center">
              <img src="https://kartoteka.app/kartoteka-logo.png" alt="Kartotéka" width="72" height="72" style="display:block; border-radius:50%; background:#ffffff; padding:8px;">
              <h1 style="margin:16px 0 0; color:#ffffff; font-size:22px; font-weight:600; letter-spacing:0.3px;">KARTOTÉKA</h1>
              <p style="margin:4px 0 0; color:#bbf7d0; font-size:13px;">Egyházi nyilvántartó rendszer</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:40px 32px 24px;">
              <h2 style="margin:0 0 16px; color:#0f172a; font-size:20px; font-weight:600;">Jelszó visszaállítása</h2>
              <p style="margin:0 0 16px; color:#475569; font-size:15px;">Békesség Istentől!</p>
              <p style="margin:0 0 24px; color:#475569; font-size:15px;">
                Ön (vagy valaki más) jelszó-visszaállítást kért a Kartotéka rendszerben az alábbi e-mail-címhez:
                <strong style="color:#0f172a;">{{ .Email }}</strong>
              </p>
              <p style="margin:0 0 28px; color:#475569; font-size:15px;">
                Új jelszó beállításához kattintson az alábbi gombra:
              </p>

              <!-- CTA button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 32px;">
                <tr>
                  <td align="center" style="background:#15803d; border-radius:10px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none; letter-spacing:0.2px;">
                      Új jelszó beállítása
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback URL -->
              <p style="margin:0 0 8px; color:#64748b; font-size:13px;">
                Ha a gomb nem működik, másolja be ezt a linket a böngészőjébe:
              </p>
              <p style="margin:0 0 28px; word-break:break-all;">
                <a href="{{ .ConfirmationURL }}" style="color:#15803d; font-size:13px; text-decoration:underline;">{{ .ConfirmationURL }}</a>
              </p>

              <!-- Security notice -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#fef3c7; border-left:3px solid #d97706; border-radius:6px; margin:0 0 20px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0; color:#78350f; font-size:13px;">
                      <strong>Fontos:</strong> a link <strong>1 órán át</strong> érvényes. Ha nem Ön kérte a jelszó-visszaállítást, nyugodtan figyelmen kívül hagyhatja ezt az e-mailt — a jelszava változatlan marad.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f1f5f9; padding:24px 32px; border-top:1px solid #e2e8f0;" align="center">
              <p style="margin:0 0 6px; color:#475569; font-size:13px; font-weight:600;">Kartotéka — Egyházi nyilvántartó rendszer</p>
              <p style="margin:0 0 12px; color:#64748b; font-size:12px;">
                <a href="https://kartoteka.app" style="color:#15803d; text-decoration:none;">kartoteka.app</a>
                &nbsp;·&nbsp;
                <a href="https://kartoteka.app/sugo" style="color:#15803d; text-decoration:none;">Súgó</a>
                &nbsp;·&nbsp;
                <a href="https://kartoteka.app/kapcsolat" style="color:#15803d; text-decoration:none;">Kapcsolat</a>
              </p>
              <p style="margin:0; color:#94a3b8; font-size:11px;">
                Ezt az e-mailt automatikus rendszer küldte. Kérjük, ne válaszoljon erre a címre.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
```

### 2. Confirm Signup (regisztráció megerősítése)

**Subject:**
```
Kartotéka — E-mail cím megerősítése
```

**Body (HTML):**
```html
<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>E-mail cím megerősítése — Kartotéka</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif; color:#1e293b; line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f8fafc;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 2px 8px rgba(15,23,42,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg, #14532d 0%, #166534 100%); padding:32px 32px 28px;" align="center">
              <img src="https://kartoteka.app/kartoteka-logo.png" alt="Kartotéka" width="72" height="72" style="display:block; border-radius:50%; background:#ffffff; padding:8px;">
              <h1 style="margin:16px 0 0; color:#ffffff; font-size:22px; font-weight:600; letter-spacing:0.3px;">KARTOTÉKA</h1>
              <p style="margin:4px 0 0; color:#bbf7d0; font-size:13px;">Egyházi nyilvántartó rendszer</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px 24px;">
              <h2 style="margin:0 0 16px; color:#0f172a; font-size:20px; font-weight:600;">Köszöntjük a Kartotéka rendszerben!</h2>
              <p style="margin:0 0 16px; color:#475569; font-size:15px;">Békesség Istentől!</p>
              <p style="margin:0 0 24px; color:#475569; font-size:15px;">
                Köszönjük, hogy regisztrált a Kartotéka egyházi nyilvántartó rendszerbe az
                <strong style="color:#0f172a;">{{ .Email }}</strong> címmel.
              </p>
              <p style="margin:0 0 28px; color:#475569; font-size:15px;">
                Az utolsó lépés az e-mail-címe megerősítése. Kérjük, kattintson az alábbi gombra:
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 32px;">
                <tr>
                  <td align="center" style="background:#15803d; border-radius:10px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none; letter-spacing:0.2px;">
                      E-mail cím megerősítése
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px; color:#64748b; font-size:13px;">
                Ha a gomb nem működik, másolja be ezt a linket a böngészőjébe:
              </p>
              <p style="margin:0 0 28px; word-break:break-all;">
                <a href="{{ .ConfirmationURL }}" style="color:#15803d; font-size:13px; text-decoration:underline;">{{ .ConfirmationURL }}</a>
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#ecfdf5; border-left:3px solid #15803d; border-radius:6px; margin:0 0 20px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0; color:#14532d; font-size:13px;">
                      <strong>Mi következik?</strong> A regisztrációja kerületi jóváhagyáshoz kötött. A megerősítés után értesítjük Önt, amint a hozzáférés engedélyezve lett.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#f1f5f9; padding:24px 32px; border-top:1px solid #e2e8f0;" align="center">
              <p style="margin:0 0 6px; color:#475569; font-size:13px; font-weight:600;">Kartotéka — Egyházi nyilvántartó rendszer</p>
              <p style="margin:0 0 12px; color:#64748b; font-size:12px;">
                <a href="https://kartoteka.app" style="color:#15803d; text-decoration:none;">kartoteka.app</a>
                &nbsp;·&nbsp;
                <a href="https://kartoteka.app/sugo" style="color:#15803d; text-decoration:none;">Súgó</a>
                &nbsp;·&nbsp;
                <a href="https://kartoteka.app/kapcsolat" style="color:#15803d; text-decoration:none;">Kapcsolat</a>
              </p>
              <p style="margin:0; color:#94a3b8; font-size:11px;">
                Ezt az e-mailt automatikus rendszer küldte. Kérjük, ne válaszoljon erre a címre.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### 3. Magic Link (passwordless login)

**Subject:**
```
Kartotéka — Bejelentkezési link
```

**Body (HTML):** azonos struktúra, csak a középső content-szakasz más:
```html
              <h2 style="margin:0 0 16px; color:#0f172a; font-size:20px; font-weight:600;">Bejelentkezés a Kartotéka rendszerbe</h2>
              <p style="margin:0 0 16px; color:#475569; font-size:15px;">Békesség Istentől!</p>
              <p style="margin:0 0 24px; color:#475569; font-size:15px;">
                Ön bejelentkezést kért a Kartotéka rendszerbe az
                <strong style="color:#0f172a;">{{ .Email }}</strong> címmel.
              </p>
              <p style="margin:0 0 28px; color:#475569; font-size:15px;">
                A belépéshez kattintson az alábbi gombra:
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 32px;">
                <tr>
                  <td align="center" style="background:#15803d; border-radius:10px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none; letter-spacing:0.2px;">
                      Belépés a Kartotékába
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px; color:#64748b; font-size:13px;">
                Ha a gomb nem működik, másolja be ezt a linket a böngészőjébe:
              </p>
              <p style="margin:0 0 28px; word-break:break-all;">
                <a href="{{ .ConfirmationURL }}" style="color:#15803d; font-size:13px; text-decoration:underline;">{{ .ConfirmationURL }}</a>
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#fef3c7; border-left:3px solid #d97706; border-radius:6px; margin:0 0 20px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0; color:#78350f; font-size:13px;">
                      <strong>Fontos:</strong> a link <strong>1 órán át</strong> érvényes és csak egyszer használható. Ha nem Ön kérte a bejelentkezést, figyelmen kívül hagyhatja ezt az e-mailt.
                    </p>
                  </td>
                </tr>
              </table>
```

(Header + footer szakasz azonos a Reset Password-éval.)

### 4. Invite User (admin meghívás)

**Subject:**
```
Kartotéka — Meghívás a rendszer használatára
```

**Body (HTML):** azonos struktúra, csak a középső content-szakasz más:
```html
              <h2 style="margin:0 0 16px; color:#0f172a; font-size:20px; font-weight:600;">Önt meghívták a Kartotékába</h2>
              <p style="margin:0 0 16px; color:#475569; font-size:15px;">Békesség Istentől!</p>
              <p style="margin:0 0 24px; color:#475569; font-size:15px;">
                A Kartotéka egyházi nyilvántartó rendszer egy adminisztrátora meghívta Önt
                az <strong style="color:#0f172a;">{{ .Email }}</strong> címen.
              </p>
              <p style="margin:0 0 28px; color:#475569; font-size:15px;">
                A hozzáférés aktiválásához és az első jelszó beállításához kattintson az alábbi gombra:
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 32px;">
                <tr>
                  <td align="center" style="background:#15803d; border-radius:10px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none; letter-spacing:0.2px;">
                      Belépés beállítása
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px; color:#64748b; font-size:13px;">
                Ha a gomb nem működik, másolja be ezt a linket a böngészőjébe:
              </p>
              <p style="margin:0 0 28px; word-break:break-all;">
                <a href="{{ .ConfirmationURL }}" style="color:#15803d; font-size:13px; text-decoration:underline;">{{ .ConfirmationURL }}</a>
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#ecfdf5; border-left:3px solid #15803d; border-radius:6px; margin:0 0 20px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0; color:#14532d; font-size:13px;">
                      <strong>A meghívás 7 napig érvényes.</strong> Ha lejár, kérjen újat a meghívótól. Ha nem ismeri a Kartotékát és úgy gondolja, hogy ezt az e-mailt tévedésből kapta, figyelmen kívül hagyhatja.
                    </p>
                  </td>
                </tr>
              </table>
```

(Header + footer szakasz azonos a Reset Password-éval.)

## Hogyan kell beszúrni a Supabase-be

1. Supabase Dashboard → **Kartotéka projekt** → bal menü **Authentication** → **Emails** → **Templates** fül
2. Mind a 4 template-nél:
   - Subject mezőbe a magyar tárgyat
   - Body mezőbe (HTML editor) a fenti HTML-t
   - **Save**
3. A `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .Token }}` változókat NE cseréld le — a Supabase tölti ki őket küldéskor.

## Asset-ek

A HTML hivatkozik a `https://kartoteka.app/kartoteka-logo.png`-ra. Ellenőrizd, hogy ez a fájl tényleg ott van a `apps/web/public/`-ban. Ha másképp hívják, írd át a `src` attribútumot.

## Tesztelés

1. Save után localhost-on `/forgot-password` → email
2. Gmail-ben nyitod meg → magyar nyelvű, dizájnos email kell érkezzen
3. Ha kép nem jelenik meg (nem töltődik be), az asset path-t ellenőrizni kell
