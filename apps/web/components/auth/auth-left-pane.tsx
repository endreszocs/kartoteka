/**
 * AuthLeftPane — bejelentkező oldal bal panele.
 *
 * Sablon: `Kartotéka-handoff-bejelentkezes → Bejelentkezes.html → LeftPane`.
 *
 * Tartalom:
 * - Greeting: "Áldás, békesség!" (Cormorant Garamond 72px)
 * - Lede: rövid bemutatás
 * - 3 feature (44×44 ikon + cím + leírás)
 * - Verse: bibliai idézet (Róma 15,33)
 *
 * Reszponzív: 980px alatt egy oszlopra esik vissza (a layout vezérli),
 * 540px alatt a heading 44px-re csökken.
 */

import { Cloud, ShieldCheck, Users } from 'lucide-react'

const FEATURES = [
  {
    Icon: ShieldCheck,
    title: 'Biztonságos hozzáférés',
    desc: 'Adataid védelméről korszerű titkosítás és jogosultságkezelés gondoskodik.',
  },
  {
    Icon: Cloud,
    title: 'Online és offline használat',
    desc: 'Használd a rendszert bárhol, bármikor. Szinkronizálható offline módban is.',
  },
  {
    Icon: Users,
    title: 'Lelkészekre szabott rendszer',
    desc: 'A gyülekezetek mindennapi munkáját támogató, átlátható és hatékony eszköz.',
  },
]

export function AuthLeftPane() {
  return (
    <div className="kt-auth-left">
      <h1 className="kt-auth-greeting">Áldás, békesség!</h1>
      <p className="kt-auth-lede">
        Lépj be a Kartotéka Egyházi Nyilvántartó rendszerbe, vagy hozz létre új
        fiókot.
      </p>

      <div className="kt-auth-features">
        {FEATURES.map(({ Icon, title, desc }, i) => (
          <div
            key={title}
            className="kt-auth-feature"
            style={{ animationDelay: `${0.3 + i * 0.12}s` }}
          >
            <div className="kt-auth-feat-ico">
              <Icon className="size-[22px]" strokeWidth={1.6} />
            </div>
            <div>
              <h3 className="kt-auth-feat-title">{title}</h3>
              <p className="kt-auth-feat-desc">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="kt-auth-verse">
        <p className="kt-auth-verse-text">
          „Isten pedig a békességnek Istene legyen ti veletek mindenkor!"
        </p>
        <span className="kt-auth-verse-ref">Róma 15,33</span>
      </div>
    </div>
  )
}
