'use client'

/**
 * LegalDialog — Adatvédelem / ÁSZF / Súgó / Kapcsolat tartalmak
 * egyetlen komponensben.
 *
 * A bejelentkezés (`(auth)/layout.tsx`) és a hozzáférés-kérő
 * (`(public)/hozzaferes-kerese/page.tsx`) oldal footer-éből nyitható,
 * valamint az `AccessRequestForm` "elolvastam" pipa-link-jeiből.
 *
 * Felelősség-kizáró záradékok minden szövegben — a rendszer szellemi
 * alapja (Beke Tivadar egyházi nyilvántartási rendszere) és a
 * fejlesztő/üzemeltető (Szőcs Endre rendszergazda) megnevezve.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BookOpen, Mail, Shield, ScrollText } from 'lucide-react'

export type LegalKind = 'privacy' | 'terms' | 'help' | 'contact'

interface LegalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: LegalKind
}

const TITLES: Record<LegalKind, string> = {
  privacy: 'Adatvédelmi tájékoztató',
  terms: 'Általános Szerződési Feltételek',
  help: 'Súgó',
  contact: 'Kapcsolat',
}

const ICONS: Record<LegalKind, typeof Shield> = {
  privacy: Shield,
  terms: ScrollText,
  help: BookOpen,
  contact: Mail,
}

export function LegalDialog({ open, onOpenChange, kind }: LegalDialogProps) {
  const Icon = ICONS[kind]
  const title = TITLES[kind]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span
              className="flex size-10 items-center justify-center rounded-xl"
              style={{
                background: 'rgba(74, 135, 98, 0.1)',
                border: '1px solid rgba(74, 135, 98, 0.25)',
                color: '#275638',
              }}
              aria-hidden
            >
              <Icon className="size-5" strokeWidth={1.6} />
            </span>
            <span className="font-heading text-xl">{title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="kt-legal-content space-y-4 text-[14px] leading-relaxed text-slate-700">
          {kind === 'privacy' && <PrivacyContent />}
          {kind === 'terms' && <TermsContent />}
          {kind === 'help' && <HelpContent />}
          {kind === 'contact' && <ContactContent />}
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <Button onClick={() => onOpenChange(false)}>Bezárás</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ================== TARTALMAK ================== */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-5 mb-2 font-heading text-[15px] font-semibold text-slate-900">
      {children}
    </h3>
  )
}

function PrivacyContent() {
  return (
    <>
      <p>
        A jelen tájékoztató az <strong>Erdélyi Református Egyházkerület</strong> (a továbbiakban:
        <em> EREK</em>, mint adatkezelő) által üzemeltetett <strong>Kartotéka</strong> egyházi
        nyilvántartó rendszerre vonatkozik. Hatályos: 2026.
      </p>

      <SectionTitle>1. Az adatkezelő és a rendszergazda</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Adatkezelő:</strong> Erdélyi Református Egyházkerület</li>
        <li><strong>Rendszergazda:</strong> Szőcs Endre — az EREK megbízásából</li>
        <li><strong>Tárolási hely:</strong> Európai Unió (Supabase, Frankfurt am Main)</li>
      </ul>

      <SectionTitle>2. Az adatkezelés célja</SectionTitle>
      <p>
        A Kartotéka kizárólag <strong>egyházi célokból</strong> kezeli a gyülekezeti tagok és
        családok adatait: tagnyilvántartás, anyakönyvi események (keresztelés, házasság, temetés),
        egyházi hozzájárulás (járulék), pasztorális látogatások, gyülekezeti programok és
        sirhelynyilvántartás.
      </p>

      <SectionTitle>3. Jogalap</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>EU 2016/679</strong> (GDPR) <em>9. cikk (2) bekezdés d) pontja</em> —
          vallási szervezet jogszerű tevékenysége tagjai és kapcsolódó személyek vonatkozásában
        </li>
        <li><strong>Romániai 190/2018. sz. törvény</strong> a GDPR végrehajtására</li>
        <li>Az érintett (vagy törvényes képviselője) hozzájárulása, ahol szükséges</li>
      </ul>

      <SectionTitle>4. Kezelt adatok köre</SectionTitle>
      <p>
        Személyes adatok: név, születési hely és dátum, lakcím, telefonszám, e-mail-cím, vallási
        hovatartozás, családi állapot, foglalkozás. Egyházi események: keresztelés, konfirmáció,
        házasság, temetés. Pénzügyi adatok: éves egyházi járulék, adományok.
      </p>

      <SectionTitle>5. Adatbiztonság</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li>TLS 1.3 titkosítás minden hálózati kommunikációban</li>
        <li>Row Level Security (RLS) — a gyülekezeti adatok elkülönített hozzáférése</li>
        <li>Szerepkör-alapú jogosultság (RBAC) + naplózás</li>
        <li>Kétfaktoros hitelesítés a rendszergazdai műveleteknél</li>
        <li>Rendszeres biztonsági mentés EU-n belül</li>
      </ul>

      <SectionTitle>6. Hozzáférés és átadás harmadik félnek</SectionTitle>
      <p>
        Az adatokat <strong>kizárólag</strong> az érintett gyülekezet lelkésze, a kerületi
        engedéllyel rendelkező felhasználók és a rendszergazda láthatják. Harmadik fél részére
        adat kizárólag jogszabályi kötelezettség (pl. bírósági megkeresés) esetén kerül átadásra.
        A rendszergazdai (override) hozzáférés időkorlátozott és <strong>naplózott</strong>.
      </p>

      <SectionTitle>7. Megőrzési idő</SectionTitle>
      <p>
        Az egyházi anyakönyvi adatokat az egyházi szabályozás szerint <strong>tartós megőrzéssel
        </strong> kezeljük. Egyéb személyes adatokat addig kezelünk, amíg a tagsági viszony fennáll,
        illetve amíg a jogszabály ezt megengedi.
      </p>

      <SectionTitle>8. Az érintettek jogai</SectionTitle>
      <p>
        A GDPR alapján Ön kérheti adatainak elérését (15. cikk), helyesbítését (16. cikk), törlését
        (17. cikk — vallási nyilvántartás esetén korlátozott), kezelésének korlátozását (18. cikk)
        és tiltakozhat a kezelés ellen (21. cikk). Panaszt tehet a Romániai Adatvédelmi Hatóságnál
        (ANSPDCP).
      </p>

      <SectionTitle>9. Felelősségi nyilatkozat</SectionTitle>
      <p>
        A Kartotéka rendszer szellemi alapja <strong>Beke Tivadar</strong> egyházi nyilvántartási
        rendszere — a rendszergazda <strong>Szőcs Endre</strong> ezt fejlesztette tovább digitális
        formába az EREK megbízásából. Az adatok <strong>pontosságáért, frissítéséért és
        jogszerű használatáért</strong> az adatbevitelt végző felhasználó (lelkész, gyülekezet,
        egyházmegye) felel — sem a rendszergazda, sem a rendszer szellemi alapját adó személy
        nem vállal felelősséget az adatkezelésből eredő károkért.
      </p>

      <SectionTitle>10. Kapcsolat</SectionTitle>
      <p>
        Adatvédelmi kérdésekben forduljon a rendszergazdához (<em>Szőcs Endre</em>) az
        egyházkerületi hivatal csatornáin keresztül.
      </p>
    </>
  )
}

function TermsContent() {
  return (
    <>
      <p>
        A jelen Általános Szerződési Feltételek (a továbbiakban: <em>ÁSZF</em>) a
        <strong> Kartotéka</strong> egyházi nyilvántartó rendszer használatára vonatkoznak. A
        rendszerbe való belépéssel a felhasználó elfogadja a jelen feltételeket.
      </p>

      <SectionTitle>1. A szolgáltatás</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Megnevezés:</strong> Kartotéka egyházi nyilvántartó rendszer</li>
        <li><strong>Üzemeltető:</strong> Erdélyi Református Egyházkerület</li>
        <li><strong>Rendszergazda:</strong> Szőcs Endre — az EREK megbízásából fejleszti és üzemelteti</li>
        <li><strong>Szellemi alap:</strong> Beke Tivadar egyházi nyilvántartási rendszerének digitális
          továbbfejlesztése
        </li>
      </ul>

      <SectionTitle>2. Hozzáférés</SectionTitle>
      <p>
        A rendszer használatára kizárólag az EREK rendszergazdájának <strong>előzetes,
        írásbeli</strong> jóváhagyásával jogosult felhasználó (lelkész, esperes, egyházmegyei
        admin, könyvelő, számvevő, kerületi admin) jogosult. A hozzáférés <strong>személyhez
        kötött</strong> és nem ruházható át.
      </p>

      <SectionTitle>3. A felhasználó kötelezettségei</SectionTitle>
      <ul className="list-disc pl-5 space-y-1">
        <li>A rendszert kizárólag <strong>egyházi-szolgálati célra</strong> használja.</li>
        <li>A bevitt adatok <strong>pontosságáért és aktualitásáért</strong> felel.</li>
        <li>A bejelentkezési adatait (e-mail, jelszó) <strong>titokban tartja</strong>; harmadik
          személynek nem adja át.
        </li>
        <li>Tiltott a rendszer biztonsági mechanizmusainak megkerülése, az adatok jogosulatlan
          kinyerése és továbbadása.
        </li>
      </ul>

      <SectionTitle>4. Az üzemeltető jogai</SectionTitle>
      <p>
        Az üzemeltető jogosult a hozzáférést azonnali hatállyal felfüggeszteni vagy visszavonni,
        amennyiben a felhasználó megsérti az ÁSZF-et, jogszabályt vagy az egyházi rendet. A
        rendszer karbantartás miatt időszakosan elérhetetlen lehet — erről a lehetőségek szerint
        előzetes tájékoztatást ad.
      </p>

      <SectionTitle>5. A rendszer „úgy ahogy van" jellege</SectionTitle>
      <p>
        A Kartotéka rendszer a felhasználó számára <strong>„as is"</strong> (úgy, ahogy van)
        alapon érhető el. Az üzemeltető a tőle telhető legnagyobb gondossággal jár el, de
        <strong> nem garantálja</strong> a hibamentes működést, a folyamatos elérhetőséget vagy
        bármely konkrét célra való alkalmasságot.
      </p>

      <SectionTitle>6. Felelősség-kizárás</SectionTitle>
      <p>
        A rendszergazda (Szőcs Endre) és a szellemi alapot adó személy (Beke Tivadar) <strong>nem
        vállal felelősséget</strong>:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>A felhasználó által bevitt adatok hibájáért, hiányosságáért</li>
        <li>A felhasználó által okozott adatvesztésért, adatmódosításért</li>
        <li>Harmadik fél (pl. felhőszolgáltató, internet) hibája miatt bekövetkező
          szolgáltatáskiesésért
        </li>
        <li>Vis maior (természeti csapás, kibertámadás, hatósági intézkedés) okozta károkért</li>
        <li>A rendszer használatából eredő közvetett vagy következményi károkért</li>
      </ul>
      <p>
        A felelősség mértéke — amennyiben jogszabály ezt megengedi — minden esetben legfeljebb
        <strong> 0 lej</strong>, mivel a szolgáltatás <strong>ingyenes</strong> az EREK gyülekezetei
        és tagjai számára.
      </p>

      <SectionTitle>7. Szellemi tulajdon</SectionTitle>
      <p>
        A rendszer kódja, dizájnja és dokumentációja a fejlesztő (Szőcs Endre) szellemi
        tulajdona; az EREK használati jogot kapott. A „Kartotéka" elnevezés és a rendszer
        szellemi alapja Beke Tivadar egyházi nyilvántartási rendszerére vezethető vissza, akinek
        munkáját tisztelettel megőrizzük.
      </p>

      <SectionTitle>8. Módosítások</SectionTitle>
      <p>
        Az ÁSZF-et az üzemeltető bármikor módosíthatja. A módosításról a rendszerben tájékoztatást
        ad; a folyamatos használat a módosított ÁSZF elfogadásának minősül.
      </p>

      <SectionTitle>9. Joghatóság</SectionTitle>
      <p>
        A jelen ÁSZF-re Romániai jog vonatkozik. Vita esetén a felek békés rendezésre törekednek;
        ennek sikertelensége esetén az illetékes romániai bíróság rendelkezik joghatósággal.
      </p>
    </>
  )
}

function HelpContent() {
  return (
    <>
      <p>
        A Kartotéka rendszer használatáról az alábbi gyakori kérdésekre adunk választ. További
        kérdés esetén a rendszergazdához (<em>Szőcs Endre</em>) fordulhat.
      </p>

      <SectionTitle>Hogyan kérhetek hozzáférést?</SectionTitle>
      <p>
        A bejelentkező oldalon az „Új fiók létrehozása" gombra kattintva nyitható meg a
        hozzáférés-kérő űrlap. Az adatok megadása után az egyházkerületi rendszergazda
        általában <strong>1–3 munkanap</strong> alatt válaszol. Jóváhagyás után e-mailben
        belépési linket kap.
      </p>

      <SectionTitle>Mire való a Kartotéka?</SectionTitle>
      <p>
        A Kartotéka az EREK gyülekezeteinek mindennapi munkáját támogató digitális
        nyilvántartó rendszer: tagnyilvántartás, anyakönyv (keresztelés, házasság, temetés),
        egyházi járulék, családok és körzetek, programok, sírhelyek, jegyzőkönyvek és pénzügyi
        áttekintés.
      </p>

      <SectionTitle>Elfelejtettem a jelszavam</SectionTitle>
      <p>
        A bejelentkező oldalon kattintson az „Elfelejtett jelszó?" linkre. A megadott e-mail-címre
        helyreállító linket küldünk.
      </p>

      <SectionTitle>Milyen adatokat kezel a rendszer?</SectionTitle>
      <p>
        Egyházi célú személyes és pénzügyi adatokat, a gyülekezeti életéhez szükséges mértékben.
        A részleteket az <em>Adatvédelmi tájékoztató</em> tartalmazza.
      </p>

      <SectionTitle>Mit tegyek, ha biztonsági aggályom van?</SectionTitle>
      <p>
        Ha hibás bejelentkezést, gyanús aktivitást vagy adatbiztonsági problémát tapasztal,
        haladéktalanul értesítse a rendszergazdát. A rendszergazdai műveletek <strong>naplózva
        vannak</strong>, így minden hozzáférés visszakövethető.
      </p>

      <SectionTitle>Offline használat</SectionTitle>
      <p>
        A rendszer korlátozott offline képességekkel rendelkezik — internet nélkül is
        megtekinthetők a már szinkronizált adatok. A módosítások online kapcsolat helyreállása
        után automatikusan szinkronizálódnak.
      </p>

      <SectionTitle>Kit kérdezzek a használatról?</SectionTitle>
      <p>
        A rendszergazdát: <strong>Szőcs Endre</strong>. Részletes elérhetőség a Kapcsolat
        pontban.
      </p>
    </>
  )
}

function ContactContent() {
  return (
    <>
      <SectionTitle>Adatkezelő</SectionTitle>
      <p>
        <strong>Erdélyi Református Egyházkerület</strong><br />
        Romániai bejegyzésű egyházi szervezet
      </p>

      <SectionTitle>Rendszergazda</SectionTitle>
      <p>
        <strong>Szőcs Endre</strong><br />
        A Kartotéka rendszer fejlesztője és üzemeltetője<br />
        Az EREK megbízásából
      </p>

      <SectionTitle>Kapcsolatfelvétel</SectionTitle>
      <p>
        Az alábbi témákban a rendszergazdához fordulhat:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Hozzáférés kérelme, regisztráció és jóváhagyás</li>
        <li>Bejelentkezési problémák, jelszó-helyreállítás</li>
        <li>Adatvédelmi kérdések (GDPR jogok, helyesbítés, törlés)</li>
        <li>Technikai hibák, bug-bejelentés, javaslatok</li>
        <li>Új modul-kérelem, fejlesztési javaslat</li>
      </ul>
      <p>
        A pontos elérhetőséget (e-mail, telefon) az egyházkerületi hivatal biztosítja az
        EREK belső csatornáin keresztül.
      </p>

      <SectionTitle>Szellemi alap</SectionTitle>
      <p>
        A Kartotéka rendszer szellemi alapja <strong>Beke Tivadar</strong> egyházi
        nyilvántartási rendszere, akinek úttörő munkáját tisztelettel megőrizzük és
        digitálisan továbbfejlesztjük.
      </p>

      <SectionTitle>Jogi cím — adatvédelmi panaszok</SectionTitle>
      <p>
        Az érintett a romániai <strong>Adatvédelmi Hatóságnál</strong> (Autoritatea Națională de
        Supraveghere a Prelucrării Datelor cu Caracter Personal — ANSPDCP) tehet panaszt:
        Bukarest, B-dul G-ral. Gheorghe Magheru 28-30, 010336.
      </p>
    </>
  )
}
