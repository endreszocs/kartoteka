import { redirect } from 'next/navigation'

/**
 * 2026-07-11 (admin-redesign 2. kör): a „Könyvelők és számvevők" oldal
 * beolvadt a Felhasználók oldalba (második fül: „Könyvelői hozzárendelések").
 * Ez az útvonal átirányít — a régi könyvjelzők és belső hivatkozások így
 * továbbra is működnek, és nincs kettős karbantartás.
 */
export default function Page() {
  redirect('/admin/felhasznalok?tab=konyvelok')
}
