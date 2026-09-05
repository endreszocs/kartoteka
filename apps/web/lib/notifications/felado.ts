/**
 * ÉRTESÍTÉSEK — KITŐL JÖN AZ ÜZENET? (feladó-modell, 2026-09-05)
 *
 * A tulajdonos kérése: az értesítések felülete legyen olyan, mint egy
 * beszélgetés-ablak — látni, KITŐL, MIKOR, MIT. Az `ertesitesek` tábla viszont
 * 2026-04 óta feladó nélkül él: egy `tipus` (info/warning/danger/…) és egy
 * szabad szöveg. A 36 beszúró hely egyike sem rögzítette, ki küldi.
 *
 * KÉT RÉTEG, SZÁNDÉKOSAN:
 *  1. ÚJ OSZLOPOK (`felado_tipus`, `felado_nev`, `felado_id`) — a
 *     2026-09-05-ertesitesek-felado.sql hozza létre, és a beszúró helyek
 *     mostantól kitöltik (a `feladoMezok()` segéddel).
 *  2. LEVEZETÉS a régi sorokra (`feladoBontas()`): amíg a migráció nem futott,
 *     vagy egy régi sorban nincs feladó, a típusból és a hivatkozásból
 *     ÓVATOSAN következtetünk. Sosem találunk ki személyt: ha nem tudjuk,
 *     „Kartotéka rendszer" a feladó.
 *
 * ⚠️ DIREKTÍVA-MENTES FÁJL (se 'use server', se 'use client'): a szerver-akció,
 *    a csengő és a beszélgetés-nézet ugyanezt használja.
 */

export type FeladoTipus =
  | 'rendszer'       // automatikus (mentés-riasztás, lejárat-emlékeztető, ANAF-csengő)
  | 'rendszergazda'  // a Kartotéka rendszergazdája (hírlevél, támogatási válasz, jóváhagyás)
  | 'egyhazkerulet'  // egyházkerületi tisztségviselő / kerületi folyamat
  | 'egyhazmegye'    // egyházmegyei tisztségviselő / esperes / megyei folyamat
  | 'gyulekezet'     // egy gyülekezet (átjelentkezés, iktató-átadás, lelkész)
  | 'felhasznalo'    // egy nevesített felhasználó (pl. regisztráló)

export interface Felado {
  tipus: FeladoTipus
  /** Megjelenített név, pl. „Kézdi-Orbai Református Egyházmegye", „Kartotéka rendszer". */
  nev: string
  /** Az entitás azonosítója (profil / gyülekezet / egyházmegye / kerület), ha van. */
  id: string | null
  /** true = a feladót NEM az adatbázis mondta, hanem a típusból következtettük. */
  levezetett: boolean
}

export const FELADO_TIPUS_CIMKE: Record<FeladoTipus, string> = {
  rendszer: 'Kartotéka rendszer',
  rendszergazda: 'Rendszergazda',
  egyhazkerulet: 'Egyházkerület',
  egyhazmegye: 'Egyházmegye',
  gyulekezet: 'Gyülekezet',
  felhasznalo: 'Felhasználó',
}

/** A beszúró helyek ezt írják az új oszlopokba (kulcsok = DB-oszlopnevek). */
export interface FeladoMezok {
  felado_tipus: FeladoTipus
  felado_nev: string
  felado_id: string | null
}

export function feladoMezok(tipus: FeladoTipus, nev?: string | null, id?: string | null): FeladoMezok {
  return {
    felado_tipus: tipus,
    felado_nev: (nev ?? '').trim() || FELADO_TIPUS_CIMKE[tipus],
    felado_id: id ?? null,
  }
}

/** Egy sor azon mezői, amelyekből a feladó megállapítható. */
export interface FeladoForrasSor {
  tipus?: string | null
  hivatkozas?: string | null
  cim?: string | null
  /** A törzs eleje — a regisztrációs értesítésnél innen jön a név. */
  uzenet?: string | null
  felado_tipus?: string | null
  felado_nev?: string | null
  felado_id?: string | null
  /** Az érintett gyülekezet azonosítója (a sor congregation_id-ja), ha van. */
  congregationId?: string | null
  /** Az érintett gyülekezet neve, ha a hívó már feloldotta. */
  congregationNev?: string | null
}

/** Hivatkozás nélküli, de biztosan rendszergazdai üzenet-címek (a beszúró helyekből). */
const RENDSZERGAZDA_CIMEK = [
  'hozzáférése aktiválva',
  'hozzáférés-kérelme nem került elfogadásra',
  'válasz a támogatási kérdésre',
  'üdvözöljük a kartotékában',
]

/** Gépi (service_role) folyamatok admin-útvonalai — ezek RENDSZER-üzenetek, nem személyé. */
const RENDSZER_ADMIN_UTAK = ['/admin/biztonsagi-mentes', '/admin/veszelyes-zona', '/admin/felhasznalok']

/**
 * A MEGYEI felület régi (2026-09-05 előtti) sorai: a hivatkozásuk a gyülekezeti
 * javító-oldalra mutat (nem /dashboard-egyhazmegye), ezért csak a CÍMBŐL
 * ismerhetők fel. A küldő az egyházmegye (döntés a javítási kérelemről,
 * visszaküldött dokumentum). Az új sorok explicit feladót kapnak.
 */
const EGYHAZMEGYE_CIMEK = ['javítási kérelem jóváhagyva', 'javítási kérelem elutasítva', 'visszaküldött dokumentum']

/** A regisztráló neve legfeljebb ennyi lehet — fölötte nem név, hanem törzs (SQL-tükör). */
const REGISZTRALO_NEV_MAX = 120

const FELADO_TIPUSOK: readonly FeladoTipus[] = ['rendszer', 'rendszergazda', 'egyhazkerulet', 'egyhazmegye', 'gyulekezet', 'felhasznalo']

function ervenyesFeladoTipus(t: string | null | undefined): t is FeladoTipus {
  return (FELADO_TIPUSOK as readonly string[]).includes(t ?? '')
}

/**
 * A feladó — az új oszlopokból, vagy (régi soroknál) óvatos levezetéssel.
 *
 * A levezetés SZABÁLYAI (fájl:sor a beszúró helyekre a 2026-09-05-i felmérésben):
 *  · `registration` típus → a regisztráló felhasználó (nevét a cím hordozza) → 'felhasznalo'
 *  · `support_reply` → rendszergazda
 *  · `release` / hírlevél („Kartotéka — …" cím) → rendszergazda
 *  · hivatkozás `/admin/…`, `admin_access:` → rendszergazda
 *  · hivatkozás `/dashboard-kerulet…` → egyházkerület
 *  · hivatkozás `/dashboard-egyhazmegye…` → egyházmegye
 *  · hivatkozás `/notifications…` (átjelentkezés), `/iktato…` (átadás) → gyülekezet
 *    (a név az érintett gyülekezet neve, ha ismert)
 *  · cím „Javítási kérelem jóváhagyva/elutasítva…", „Visszaküldött dokumentum…"
 *    (a megyei felület régi sorai) → egyházmegye
 *  · `warning` / `danger` mentés-, ANAF-, lejárat-riasztás és minden más → rendszer
 */
export function feladoBontas(sor: FeladoForrasSor): Felado {
  if (ervenyesFeladoTipus(sor.felado_tipus)) {
    return {
      tipus: sor.felado_tipus,
      nev: (sor.felado_nev ?? '').trim() || FELADO_TIPUS_CIMKE[sor.felado_tipus],
      id: sor.felado_id ?? null,
      levezetett: false,
    }
  }

  const tipus = (sor.tipus ?? '').toLowerCase()
  const hiv = (sor.hivatkozas ?? '').toLowerCase()
  const cim = (sor.cim ?? '').trim()
  const cimKis = cim.toLowerCase()
  const uzenet = (sor.uzenet ?? '').trim()
  const vanGyulekezet = Boolean(sor.congregationId)

  // ⚠️ A szabályokat a 2026-09-05-i brief a BESZÚRÓ HELYEK megnyitásával
  //    pontosította (5 osztály volt hibás az első vázlatban). A SQL-oldali
  //    ertesites_felado_levezetes() ugyanezeket tükrözi — ha itt változtatsz,
  //    ott is.
  if (tipus === 'registration') {
    // „Kovács János (kovacs@…) regisztrált…" — a név a TÖRZS eleje, a cím
    // ('Új regisztráció (Google)') nem hordozza.
    // CSAK ha van „ (" — különben a TELJES törzs válna névvé; és a 120 fölötti
    // „név" sem név. Ugyanez a két kapu él az SQL-levezetőben.
    const nev = uzenet.includes(' (') ? uzenet.slice(0, uzenet.indexOf(' (')).trim() : ''
    const ervenyesNev = nev.length > 0 && nev.length <= REGISZTRALO_NEV_MAX ? nev : 'Regisztráló felhasználó'
    return { tipus: 'felhasznalo', nev: ervenyesNev, id: null, levezetett: true }
  }
  if (tipus === 'support_reply' || tipus === 'release') {
    return { tipus: 'rendszergazda', nev: FELADO_TIPUS_CIMKE.rendszergazda, id: null, levezetett: true }
  }
  if (/^kartotéka\s+[—–-]/i.test(cim) || RENDSZERGAZDA_CIMEK.some((c) => cimKis.startsWith(c))) {
    return { tipus: 'rendszergazda', nev: FELADO_TIPUS_CIMKE.rendszergazda, id: null, levezetett: true }
  }
  // Gépi (service_role) admin-útvonalak: mentés-riasztás, visszaállítás,
  // „gyülekezet megürült" → RENDSZER, nem személy.
  if (RENDSZER_ADMIN_UTAK.some((u) => hiv.startsWith(u))) {
    return { tipus: 'rendszer', nev: FELADO_TIPUS_CIMKE.rendszer, id: null, levezetett: true }
  }
  if (hiv.startsWith('/admin') || hiv.startsWith('admin_access:')) {
    return { tipus: 'rendszergazda', nev: FELADO_TIPUS_CIMKE.rendszergazda, id: null, levezetett: true }
  }
  if (hiv.startsWith('/dashboard-kerulet')) {
    return { tipus: 'egyhazkerulet', nev: FELADO_TIPUS_CIMKE.egyhazkerulet, id: null, levezetett: true }
  }
  if (hiv.startsWith('/dashboard-egyhazmegye')) {
    // Gyülekezet nélküli sor = a kerület → megye lánc (felterjesztés);
    // gyülekezettel = a gyülekezet beküldése a megyének (költségvetés, irat).
    if (!vanGyulekezet) {
      return { tipus: 'egyhazkerulet', nev: FELADO_TIPUS_CIMKE.egyhazkerulet, id: null, levezetett: true }
    }
    return {
      tipus: 'gyulekezet',
      nev: (sor.congregationNev ?? '').trim() || FELADO_TIPUS_CIMKE.gyulekezet,
      id: sor.congregationId ?? null,
      levezetett: true,
    }
  }
  if (hiv.startsWith('/notifications') || hiv.startsWith('/iktato')) {
    // Átjelentkezés / iktató-átadás: a sor congregation_id-ja a CÍMZETT oldala,
    // a küldő a MÁSIK gyülekezet — akit a régi sorból nem találunk ki.
    return { tipus: 'gyulekezet', nev: 'Másik gyülekezet', id: null, levezetett: true }
  }
  if (cimKis.startsWith('hozzáférés jóváhagyva') || cimKis.startsWith('hozzáférés elutasítva')) {
    // A jóváhagyó gyülekezet lelkésze döntött — gyülekezeti feladó.
    return {
      tipus: 'gyulekezet',
      nev: (sor.congregationNev ?? '').trim() || FELADO_TIPUS_CIMKE.gyulekezet,
      id: sor.congregationId ?? null,
      levezetett: true,
    }
  }
  if (EGYHAZMEGYE_CIMEK.some((c) => cimKis.startsWith(c))) {
    // A megyei felület régi sorai (a hivatkozás a gyülekezeti javító-oldalra
    // mutat) — a döntést az egyházmegye hozta, a nevét a régi sorból nem tudjuk.
    return { tipus: 'egyhazmegye', nev: FELADO_TIPUS_CIMKE.egyhazmegye, id: null, levezetett: true }
  }
  return { tipus: 'rendszer', nev: FELADO_TIPUS_CIMKE.rendszer, id: null, levezetett: true }
}

/**
 * Beszélgetés-kulcs: ugyanattól a feladótól jövő üzenetek EGY szálba kerülnek.
 * Nevesített entitásnál az azonosító, egyébként a típus + név.
 */
export function beszelgetesKulcs(f: Pick<Felado, 'tipus' | 'nev' | 'id'>): string {
  return f.id ? `${f.tipus}:${f.id}` : `${f.tipus}:${f.nev.toLowerCase()}`
}

/**
 * A KÜLDŐ oldali szál-kulcs: a beszúró hely ebből építi a mélylinket
 * (`/notifications?felado=<kulcs>`), UGYANABBÓL a képletből, amelyből az
 * olvasó a szálat. MIÉRT (2026-09-05, bírálói P2): a támogatási válasz első
 * változata a csupasz `?felado=rendszergazda`-ra mutatott, miközben a szál
 * kulcsa `rendszergazda:<uuid>` — a mélylink soha nem talált szálat. Egy
 * képlet, két oldal: a `scripts/selftest-ertesites-nezet.mjs` bizonyítja,
 * hogy a küldő kulcsa = az olvasó (`feladoBontas` → `beszelgetesKulcs`) kulcsa.
 */
export function feladoMezokKulcsa(m: FeladoMezok): string {
  return beszelgetesKulcs({ tipus: m.felado_tipus, nev: m.felado_nev, id: m.felado_id })
}
