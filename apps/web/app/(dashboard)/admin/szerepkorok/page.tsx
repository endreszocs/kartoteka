import { redirect } from 'next/navigation'

// Sprint U.5 (2026-05-03): a Felhasználók és Szerepkörök modulok egyesültek.
// A /admin/szerepkorok URL átirányít a kombinált oldalra.
export default function Page() {
  redirect('/admin/felhasznalok')
}
