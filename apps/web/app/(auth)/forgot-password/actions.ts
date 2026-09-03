'use server'

import { createClient } from '@/lib/supabase/server'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth'

export async function resetPassword(data: ForgotPasswordInput) {
  const parsed = forgotPasswordSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  // 2026-05-02 (v0.9.44) — KRITIKUS FIX: a redirectTo eddig hiányzott!
  // A Supabase a magic-link kattintáskor a default Site URL-re vitte
  // a user-t (vagy egy nemlétező oldalra), és az új jelszó megadása
  // soha nem történt meg.
  //
  // Most explicit: /reset-password — ott egy ÚJ JELSZÓ form fogadja a tokent.
  const PRODUCTION_FALLBACK = 'https://kartoteka.app'
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === 'production' ? PRODUCTION_FALLBACK : 'http://localhost:3000')

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/reset-password`,
  })

  if (error) {
    // 2026-05-18 — A korábbi verzió csendben elnyelte a Supabase hibát,
    // így dev közben lehetetlen volt eldönteni, mi a baj (SMTP rate-limit?
    // hibás projekt-konfiguráció? hálózati hiba?). Mostantól:
    //  • mindig logoljuk szerver-oldalra (console.error → terminál / Vercel logs)
    //  • a 429 (rate limit) saját, hasznos üzenetet kap
    //  • dev módban a tényleges Supabase üzenet is megjelenik a usernek
    //  • prod-ban marad a generikus szöveg (nem áruljuk el, létezik-e az email)
    console.error('[forgot-password] supabase.auth.resetPasswordForEmail hiba:', {
      name: error.name,
      status: error.status,
      code: error.code,
      message: error.message,
    })

    const isRateLimit =
      error.status === 429 ||
      error.code === 'over_email_send_rate_limit' ||
      /rate.?limit/i.test(error.message)

    if (isRateLimit) {
      return {
        error:
          'Túl sok jelszó-visszaállító kérés. A Supabase beépített e-mail küldője óránként csak néhány levelet enged. Kérjük, próbálja újra kb. 1 óra múlva.',
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      return {
        error: `Hiba történt (dev): ${error.message}${error.code ? ` [${error.code}]` : ''}`,
      }
    }

    // Prod: nem árulunk el semmit arról, létezik-e az email (adatvédelem)
    return { error: 'Hiba történt. Kérem, próbálja újra később.' }
  }

  // Mindig sikeres üzenetet adunk (akkor is ha az email nem létezik)
  return {
    success: 'A jelszó-visszaállító linket sikeresen elküldtük az e-mail címére!',
  }
}

// 2026-05-02 (v0.9.44): új jelszó beállítása a recovery-token után.
// A Supabase a `?code=...&type=recovery` paramétert visszaadja, az
// `exchangeCodeForSession`-nel session jön létre, és onnan az
// `updateUser({ password })` állítja be az új jelszót.
//
// Ezt a `/reset-password` oldalon hívjuk a kliens-oldalról (server action helyett
// kliens kód, mert a session fogad a kliens-oldalon kell hogy lefusson).
export async function setNewPassword(newPassword: string): Promise<{
  success?: string
  error?: string
}> {
  if (!newPassword || newPassword.length < 8) {
    return { error: 'A jelszó legalább 8 karakter hosszú legyen.' }
  }
  if (newPassword.length > 72) {
    return { error: 'A jelszó legfeljebb 72 karakter lehet (bcrypt limit).' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'A token már lejárt vagy érvénytelen. Kérjen új jelszó-visszaállító linket.' }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: `A jelszó frissítése nem sikerült: ${error.message}` }

  // ══════════════════════════════════════════════════════════════════════════
  // A TÖBBI MUNKAMENET VISSZAVONÁSA (2026-09-04, P1)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ AMI ROSSZ VOLT: a jelszóváltás után SEMMILYEN munkamenet-visszavonás
  //    nem történt a mi oldalunkról — a repóban egyetlen `scope: 'global'` vagy
  //    `scope: 'others'` kiléptetés sem volt. Aki jelszót állított vissza, mert
  //    attól tartott, hogy valaki hozzáfért a fiókjához, PONTOSAN azt nem érte
  //    el, amiért csinálta: a betolakodó munkamenete tovább élt.
  //
  // ⛔ MIÉRT NEM ELÉG A PROJEKT-BEÁLLÍTÁSRA HAGYATKOZNI: a Supabase-nek van
  //    ilyen kapcsolója, de (a) nem a kódban van, tehát egy projekt-migráció
  //    vagy egy új környezet némán elveszítheti, és (b) a 2026-09-04-i mérés
  //    szerint a munkameneteknek NINCS abszolút lejáratuk (`not_after` mind
  //    NULL, a legrégebbi élő munkamenet 122 napos) — vagyis ami nem lesz
  //    kifejezetten visszavonva, az gyakorlatilag örökké él.
  //
  // ✅ MIÉRT `others` ÉS NEM `global`: a `global` a MOSTANI munkamenetet is
  //    megölné, tehát a felhasználót azonnal kidobná arról az oldalról, ahol
  //    épp az új jelszót állította be — és a siker-üzenetet már nem is látná.
  //    Az `others` mindent visszavon, KIVÉVE ezt az egyet.
  //
  // ⚠️ SZÁNDÉKOLT MELLÉKHATÁS: a desktop kliens tárolt munkamenete is
  //    megszűnik, tehát jelszóváltás után a lelkésznek a desktopon újra be
  //    kell lépnie. Ez helyes: pont ez a lényeg.
  //
  // A hiba NEM buktatja meg a műveletet — a jelszó ekkor MÁR meg van változtatva,
  // a visszagörgetés nem lehetséges. De NEM is hallgatjuk el: a felhasználónak
  // tudnia kell, ha a régi munkamenetek esetleg élve maradtak.
  const { error: kileptetesHiba } = await supabase.auth.signOut({ scope: 'others' })
  if (kileptetesHiba) {
    console.error(
      '[reset-password] A többi munkamenet visszavonása nem sikerült:',
      kileptetesHiba.message,
    )
    return {
      success:
        'A jelszót sikeresen beállítottuk. ' +
        'FIGYELEM: a többi eszközön lévő bejelentkezéseket most nem sikerült megszüntetni — ' +
        'ha attól tart, hogy valaki hozzáfért a fiókjához, jelezze a rendszergazdának.',
    }
  }

  return {
    success:
      'A jelszót sikeresen beállítottuk, és a többi eszközön lévő bejelentkezéseket megszüntettük. ' +
      'Most már be tud lépni az új jelszóval.',
  }
}
