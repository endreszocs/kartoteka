import { redirect } from 'next/navigation'

// 2026-07-11 (admin-redesign): a Hozzáférés-kérelmek önálló oldala megszűnt.
// Az oldal 2026-06-06 óta nem szerepelt a menüben (csak direkt URL-lel volt
// elérhető), és a pending kérelmek teljes elbírálása — a kért gyülekezet/
// egyházmegye/egyházkerület kontextus, az indoklás, a csatolt dokumentum
// megnyitása, a jóváhagyás és az indoklásos elutasítás — a Felhasználók
// oldal kérelem-bannerében él. A régi URL átirányít (szerepkorok-minta).
export default function Page() {
  redirect('/admin/felhasznalok')
}
