import { randomUUID } from "node:crypto";

import Image from "next/image";
import {
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  Church,
  Clock3,
  Home,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Network,
  Phone,
  ReceiptText,
  Save,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

import type {
  MemberChangeRequest,
  MemberNewsletterPreferences,
  MemberOverview,
} from "@/lib/member-portal/member-data";
import {
  saveMemberNewsletterPreferences,
  signOutMemberPortal,
  submitMemberPersonChange,
  withdrawMemberPersonChange,
} from "@/app/(public)/gy/[slug]/tagi-fiok/actions";
import styles from "./dashboard-member-preview.module.css";

const NAV_ITEMS = [
  {
    href: "#attekintes",
    label: "Kezdőlap",
    shortLabel: "Kezdőlap",
    icon: Home,
  },
  {
    href: "#adataim",
    label: "Saját adataim",
    shortLabel: "Adataim",
    icon: UserRound,
  },
  {
    href: "#csalad",
    label: "Családi kapcsolatok",
    shortLabel: "Család",
    icon: Network,
  },
  {
    href: "#befizetesek",
    label: "Saját befizetéseim",
    shortLabel: "Befizetés",
    icon: ReceiptText,
  },
  {
    href: "#beallitasok",
    label: "Beállítások",
    shortLabel: "Beállítás",
    icon: BellRing,
  },
] as const;

const THEME_HERO: Record<string, string> = {
  "filmszeru-tortenet": "/public-site/themes/elo-kert/baratosi-hero-v2.png",
  "elo-kert": "/public-site/themes/elo-kert/hero.png",
  "csendes-parokia": "/public-site/themes/csendes-parokia/hero.png",
  "zsoltaros-orokseg": "/public-site/themes/zsoltaros-orokseg/hero.png",
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  hazastars: "Házastárs",
  szulo: "Szülő",
  gyermek: "Gyermek",
  testver: "Testvér",
  felteszver: "Féltestvér",
  nagyszulo: "Nagyszülő",
  unoka: "Unoka",
  mostohaszulo: "Mostohaszülő",
  mostohagyermek: "Mostohagyermek",
  gondviselo: "Gondviselő",
  gondozott: "Gondozott",
  orokbefogado: "Örökbefogadó",
  orokbefogadott: "Örökbefogadott",
  egyeb: "Egyéb kapcsolat",
};

const FIELD_LABELS: Record<string, string> = {
  szcs_nev: "Születési név",
  csaladnev: "Családnév",
  k_nev: "Keresztnév",
  ferjk_nev: "Házassági név",
  apjaneve: "Apa neve",
  anyjaneve: "Anya neve",
  sz_datum: "Születési dátum",
  vallas: "Vallás",
  foglalkozas: "Foglalkozás",
  nemzetiseg: "Nemzetiség",
  c_szam: "Házszám",
  c_tombhaz: "Tömbház",
  c_lepcsohaz: "Lépcsőház",
  c_emelet: "Emelet",
  c_ajto: "Ajtó",
  c_szcim: "Irányítószám",
  telefon: "Telefonszám",
  email: "E-mail-cím",
  social_profil_url: "Közösségi profil",
  photo_consent: "Fotó-hozzájárulás",
  mailing_consent: "Postai kapcsolattartás",
};

const NOTICE_COPY: Record<string, string> = {
  "change-submitted": "A módosítási kérelmet elküldtük a lelkipásztornak.",
  "change-withdrawn": "A függő módosítási kérelmet visszavonta.",
  "newsletter-saved": "A hírlevél-beállításokat elmentettük.",
  "no-change": "Nem találtunk beküldhető változást.",
  "pending-exists": "Már van lelkipásztori ellenőrzésre váró kérelme.",
  "invalid-person-data": "Egy vagy több megadott adat formátuma nem megfelelő.",
  "load-error": "A személyes adatok most nem tölthetők be biztonságosan.",
  "save-error": "A módosítási kérelmet most nem sikerült rögzíteni.",
  "withdraw-error": "A kérelmet most nem sikerült visszavonni.",
  "newsletter-error": "A hírlevél-beállítást most nem sikerült menteni.",
};

interface MemberDashboardProps {
  congregationName: string;
  slug: string;
  themeKey: string;
  overview: MemberOverview;
  preferences: MemberNewsletterPreferences;
  changeRequests: MemberChangeRequest[];
  notice?: string;
}

function BrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <Church />
    </span>
  );
}

function Navigation({
  congregationName,
  compact = false,
}: {
  congregationName: string;
  compact?: boolean;
}) {
  return (
    <nav
      className={compact ? styles.compactNav : styles.sideNav}
      aria-label={
        compact ? "Tagi portál mobil navigáció" : "Tagi portál navigáció"
      }
    >
      {!compact && (
        <div className={styles.sideBrand}>
          <BrandMark />
          <div>
            <strong>Tagi portál</strong>
            <span>{congregationName}</span>
          </div>
        </div>
      )}
      <ul>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <a href={item.href}>
                <Icon aria-hidden="true" />
                <span>{compact ? item.shortLabel : item.label}</span>
                {!compact && (
                  <ChevronRight
                    className={styles.navChevron}
                    aria-hidden="true"
                  />
                )}
              </a>
            </li>
          );
        })}
      </ul>
      {!compact && (
        <div className={styles.sidePrivacy}>
          <LockKeyhole aria-hidden="true" />
          <p>
            Csak az Önhöz kapcsolt, jóváhagyott személyes adatok jelennek meg.
          </p>
        </div>
      )}
    </nav>
  );
}

function initials(name: string): string {
  const result = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("hu-HU"))
    .join("");
  return result || "TP";
}

function formatDate(value: string | null | undefined, withYear = true): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", {
    year: withYear ? "numeric" : undefined,
    month: "long",
    day: "numeric",
    timeZone: "Europe/Bucharest",
  }).format(date);
}

function numericMoney(value: number | string | null): number | null {
  if (value === null) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatMoney(value: number | string | null): string {
  const number = numericMoney(value);
  if (number === null) return "—";
  return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(number)} lej`;
}

function FormField({
  label,
  name,
  value,
  type = "text",
}: {
  label: string;
  name: string;
  value: string | null;
  type?: "text" | "email" | "date" | "url" | "tel";
}) {
  return (
    <label className={styles.editField}>
      <span>{label}</span>
      <input name={name} type={type} defaultValue={value ?? ""} />
    </label>
  );
}

function ProfileSection({
  overview,
  slug,
  pendingRequest,
}: {
  overview: MemberOverview;
  slug: string;
  pendingRequest?: MemberChangeRequest;
}) {
  const { person, account } = overview;
  const displayName =
    account.display_name ||
    [person.csaladnev, person.k_nev].filter(Boolean).join(" ");
  const address = [
    person.address.postal_code,
    person.address.house_number && `${person.address.house_number}. szám`,
    person.address.building && `${person.address.building}. tömb`,
    person.address.staircase && `${person.address.staircase}. lépcsőház`,
    person.address.floor && `${person.address.floor}. emelet`,
    person.address.door && `${person.address.door}. ajtó`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section
      id="adataim"
      className={`${styles.card} ${styles.profileCard}`}
      aria-labelledby="profile-title"
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Személyes adatlap</p>
          <h2 id="profile-title">Saját adataim</h2>
        </div>
        <span className={styles.verifiedBadge}>
          <ShieldCheck aria-hidden="true" /> Ellenőrzött
        </span>
      </div>
      <div className={styles.profileIdentity}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(displayName)}
        </span>
        <div>
          <strong>{displayName}</strong>
          <span>Nyilvántartási azonosító: KT–{person.person_id}</span>
        </div>
      </div>
      <dl className={styles.detailList}>
        <div>
          <dt>
            <Mail aria-hidden="true" /> E-mail-cím
          </dt>
          <dd>{person.email || account.email}</dd>
        </div>
        <div>
          <dt>
            <Phone aria-hidden="true" /> Telefonszám
          </dt>
          <dd>{person.phone || "—"}</dd>
        </div>
        <div>
          <dt>
            <MapPin aria-hidden="true" /> Címkiegészítés
          </dt>
          <dd>{address || "—"}</dd>
        </div>
        <div>
          <dt>
            <CalendarDays aria-hidden="true" /> Születési dátum
          </dt>
          <dd>{formatDate(person.sz_datum)}</dd>
        </div>
      </dl>

      {pendingRequest ? (
        <p className={styles.formGuard}>
          <Clock3 aria-hidden="true" /> A függő kérelem lezárásáig új módosítás
          nem küldhető.
        </p>
      ) : (
        <details className={styles.editDetails}>
          <summary>
            Adatmódosítás kezdeményezése <ChevronRight aria-hidden="true" />
          </summary>
          <form action={submitMemberPersonChange} className={styles.editForm}>
            <input type="hidden" name="slug" value={slug} />
            <input
              type="hidden"
              name="client_request_id"
              value={randomUUID()}
            />
            <input
              type="hidden"
              name="base_person_revision"
              value={person.revision}
            />
            <fieldset>
              <legend>Név és személyes adatok</legend>
              <div className={styles.editGrid}>
                <FormField
                  label="Születési név"
                  name="szcs_nev"
                  value={person.szcs_nev}
                />
                <FormField
                  label="Családnév"
                  name="csaladnev"
                  value={person.csaladnev}
                />
                <FormField
                  label="Keresztnév"
                  name="k_nev"
                  value={person.k_nev}
                />
                <FormField
                  label="Házassági név"
                  name="ferjk_nev"
                  value={person.ferjk_nev}
                />
                <FormField
                  label="Apa neve"
                  name="apjaneve"
                  value={person.apjaneve}
                />
                <FormField
                  label="Anya neve"
                  name="anyjaneve"
                  value={person.anyjaneve}
                />
                <FormField
                  label="Születési dátum"
                  name="sz_datum"
                  type="date"
                  value={person.sz_datum}
                />
                <FormField label="Vallás" name="vallas" value={person.vallas} />
                <FormField
                  label="Foglalkozás"
                  name="foglalkozas"
                  value={person.foglalkozas}
                />
                <FormField
                  label="Nemzetiség"
                  name="nemzetiseg"
                  value={person.nemzetiseg}
                />
              </div>
            </fieldset>
            <fieldset>
              <legend>Elérhetőség és címkiegészítés</legend>
              <div className={styles.editGrid}>
                <FormField
                  label="Telefonszám"
                  name="telefon"
                  type="tel"
                  value={person.phone}
                />
                <FormField
                  label="E-mail-cím"
                  name="email"
                  type="email"
                  value={person.email}
                />
                <FormField
                  label="Irányítószám"
                  name="c_szcim"
                  value={person.address.postal_code}
                />
                <FormField
                  label="Házszám"
                  name="c_szam"
                  value={person.address.house_number}
                />
                <FormField
                  label="Tömbház"
                  name="c_tombhaz"
                  value={person.address.building}
                />
                <FormField
                  label="Lépcsőház"
                  name="c_lepcsohaz"
                  value={person.address.staircase}
                />
                <FormField
                  label="Emelet"
                  name="c_emelet"
                  value={person.address.floor}
                />
                <FormField
                  label="Ajtó"
                  name="c_ajto"
                  value={person.address.door}
                />
                <FormField
                  label="Közösségi profil (https)"
                  name="social_profil_url"
                  type="url"
                  value={person.social_profile_url}
                />
              </div>
            </fieldset>
            <div className={styles.consentGrid}>
              <label>
                <input
                  type="checkbox"
                  name="photo_consent"
                  defaultChecked={person.photo_consent ?? false}
                />{" "}
                Fotó-hozzájárulás
              </label>
              <label>
                <input
                  type="checkbox"
                  name="mailing_consent"
                  defaultChecked={person.mailing_consent ?? false}
                />{" "}
                Postai kapcsolattartás
              </label>
            </div>
            <p className={styles.formHelp}>
              A mentés kérelmet küld. Az eredeti nyilvántartás csak
              lelkipásztori jóváhagyás után változik.
            </p>
            <button type="submit" className={styles.primaryAction}>
              <Save aria-hidden="true" /> Kérelem elküldése
            </button>
          </form>
        </details>
      )}
    </section>
  );
}

function ChangeRequestSection({
  request,
  slug,
}: {
  request?: MemberChangeRequest;
  slug: string;
}) {
  if (!request) {
    return (
      <section
        className={`${styles.card} ${styles.requestCard}`}
        aria-labelledby="request-title"
      >
        <div className={styles.requestTopline}>
          <span className={styles.statusIcon}>
            <Check aria-hidden="true" />
          </span>
          <div>
            <p className={styles.eyebrow}>Ügyintézés</p>
            <h2 id="request-title">Nincs függő módosítás</h2>
          </div>
        </div>
        <p className={styles.requestSummary}>
          A nyilvántartás az utolsó jóváhagyott adatokat mutatja.
        </p>
      </section>
    );
  }

  const fields = Object.keys(request.requested_patch).map(
    (key) => FIELD_LABELS[key] ?? key,
  );
  return (
    <section
      className={`${styles.card} ${styles.requestCard}`}
      aria-labelledby="request-title"
    >
      <div className={styles.requestTopline}>
        <span className={styles.statusIcon}>
          <Clock3 aria-hidden="true" />
        </span>
        <div>
          <p className={styles.eyebrow}>Beküldött módosítás</p>
          <h2 id="request-title">Lelkipásztori ellenőrzésre vár</h2>
        </div>
      </div>
      <p className={styles.requestSummary}>
        {fields.join(", ")} • beküldve: {formatDate(request.submitted_at)}
      </p>
      <ol className={styles.requestSteps} aria-label="Adatmódosítás folyamata">
        <li data-state="complete">
          <span>
            <Check aria-hidden="true" />
          </span>
          <div>
            <strong>Beküldve</strong>
            <small>{formatDate(request.submitted_at)}</small>
          </div>
        </li>
        <li data-state="current" aria-current="step">
          <span>
            <Clock3 aria-hidden="true" />
          </span>
          <div>
            <strong>Ellenőrzés alatt</strong>
            <small>A lelkipásztor átnézi.</small>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Jóváhagyva</strong>
            <small>Ezután frissül a nyilvántartás.</small>
          </div>
        </li>
      </ol>
      <div className={styles.statusNote} role="status">
        <ShieldCheck aria-hidden="true" />
        <span>A jelenlegi adatok a jóváhagyásig változatlanok.</span>
      </div>
      <form
        action={withdrawMemberPersonChange}
        className={styles.inlineActionForm}
      >
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="request_id" value={request.id} />
        <button type="submit" className={styles.textButton}>
          Kérelem visszavonása
        </button>
      </form>
    </section>
  );
}

function FamilySection({ overview }: { overview: MemberOverview }) {
  const relations = overview.family_tree.relationships;
  const householdMembers = overview.family_tree.households.flatMap(
    (household) => household.members,
  );
  const uniquePeople = new Map<number, { name: string; label: string }>();
  relations.forEach((relation) =>
    uniquePeople.set(relation.person_id, {
      name: relation.display_name,
      label:
        RELATIONSHIP_LABELS[relation.relationship] ?? relation.relationship,
    }),
  );
  householdMembers
    .filter((member) => !member.self)
    .forEach((member) => {
      if (!uniquePeople.has(member.person_id))
        uniquePeople.set(member.person_id, {
          name: member.display_name,
          label: member.role || "Háztartástag",
        });
    });

  return (
    <section
      id="csalad"
      className={`${styles.card} ${styles.familyCard}`}
      aria-labelledby="family-title"
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Kapcsolati nézet</p>
          <h2 id="family-title">Családi kapcsolatok</h2>
        </div>
        <span className={styles.countBadge}>
          <UsersRound aria-hidden="true" /> {uniquePeople.size} személy
        </span>
      </div>
      {uniquePeople.size > 0 ? (
        <div
          className={styles.familyTree}
          role="list"
          aria-label="Jóváhagyott családi és háztartási kapcsolatok"
        >
          <div
            className={`${styles.familyGeneration} ${styles.productionFamilyGrid}`}
          >
            {[...uniquePeople.entries()].map(([personId, person]) => (
              <article
                className={styles.familyPerson}
                key={personId}
                role="listitem"
              >
                <span aria-hidden="true">{initials(person.name)}</span>
                <div>
                  <strong>{person.name}</strong>
                  <small>{person.label}</small>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className={styles.emptyState}>
          Jelenleg nincs megjeleníthető, azonos gyülekezethez tartozó kapcsolat.
        </p>
      )}
      <p className={styles.paymentPrivacy}>
        <ShieldCheck aria-hidden="true" /> A nézet csak minimális kapcsolati
        adatokat mutat, ugyanabból a gyülekezeti nyilvántartásból.
      </p>
    </section>
  );
}

function PaymentsSection({ overview }: { overview: MemberOverview }) {
  const items = overview.payments.items;
  const year = new Date().getFullYear();
  const yearTotal = items.reduce((sum, payment) => {
    if (payment.voided || !payment.date?.startsWith(`${year}-`)) return sum;
    return sum + (numericMoney(payment.amount_ron ?? payment.amount) ?? 0);
  }, 0);

  return (
    <section
      id="befizetesek"
      className={`${styles.card} ${styles.paymentsCard}`}
      aria-labelledby="payments-title"
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Pénzügyi saját nézet</p>
          <h2 id="payments-title">Saját befizetéseim</h2>
        </div>
        <span className={styles.privateBadge}>
          <LockKeyhole aria-hidden="true" /> Csak Ön látja
        </span>
      </div>
      <div className={styles.paymentSummary}>
        <div>
          <span>{year}-ban befizetve</span>
          <strong>{formatMoney(yearTotal)}</strong>
        </div>
        <div>
          <span>Nyilvántartott tételek</span>
          <strong>{overview.payments.total_count}</strong>
        </div>
      </div>
      {items.length > 0 ? (
        <ul
          className={styles.paymentList}
          aria-label="Legutóbbi saját befizetések"
        >
          {items.map((payment) => (
            <li key={payment.id}>
              <span className={styles.paymentIcon} aria-hidden="true">
                <ReceiptText />
              </span>
              <div className={styles.paymentPurpose}>
                <strong>{payment.purpose || "Befizetés"}</strong>
                <span>{formatDate(payment.date)}</span>
              </div>
              <span
                className={styles.paymentStatus}
                data-voided={payment.voided ? "" : undefined}
              >
                <Check aria-hidden="true" />{" "}
                {payment.voided ? "Stornózva" : "Könyvelve"}
              </span>
              <strong className={styles.paymentAmount}>
                {formatMoney(payment.amount_ron ?? payment.amount)}
              </strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyState}>
          Jelenleg nincs saját személyéhez kapcsolt befizetés.
        </p>
      )}
      <p className={styles.paymentPrivacy}>
        <ShieldCheck aria-hidden="true" /> Családtagok és más tagok befizetései
        nem jelennek meg.
      </p>
    </section>
  );
}

function NewsletterSection({
  overview,
  preferences,
  slug,
}: {
  overview: MemberOverview;
  preferences: MemberNewsletterPreferences;
  slug: string;
}) {
  return (
    <section
      id="beallitasok"
      className={`${styles.card} ${styles.newsletterCard}`}
      aria-labelledby="newsletter-title"
    >
      <div className={styles.newsletterIcon}>
        <BellRing aria-hidden="true" />
      </div>
      <div className={styles.newsletterCopy}>
        <p className={styles.eyebrow}>Kapcsolattartás</p>
        <h2 id="newsletter-title">Gyülekezeti hírlevél</h2>
        <p>
          Válassza ki, milyen gyülekezeti híreket szeretne e-mailben megkapni.
        </p>
        <span className={styles.newsletterAddress}>
          <Mail aria-hidden="true" /> {overview.account.email}
        </span>
      </div>
      <form
        action={saveMemberNewsletterPreferences}
        className={styles.newsletterForm}
      >
        <input type="hidden" name="slug" value={slug} />
        <label className={styles.switchLabel}>
          <span className={styles.switchCopy}>
            <strong>Hírlevél fogadása</strong>
            <small>
              {preferences.email_opt_in ? "Bekapcsolva" : "Kikapcsolva"}
            </small>
          </span>
          <input
            type="checkbox"
            role="switch"
            name="email_opt_in"
            defaultChecked={preferences.email_opt_in}
          />
          <span className={styles.switchTrack} aria-hidden="true">
            <span />
          </span>
        </label>
        <div className={styles.preferenceChecks}>
          <label>
            <input
              type="checkbox"
              name="announcements_opt_in"
              defaultChecked={preferences.announcements_opt_in}
            />{" "}
            Hirdetések és fontos tudnivalók
          </label>
          <label>
            <input
              type="checkbox"
              name="events_opt_in"
              defaultChecked={preferences.events_opt_in}
            />{" "}
            Alkalmak és események
          </label>
          <label>
            Nyelv
            <select
              name="preferred_locale"
              defaultValue={preferences.preferred_locale}
            >
              <option value="hu">Magyar</option>
              <option value="ro">Română</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <button type="submit" className={styles.primaryAction}>
          <Save aria-hidden="true" /> Beállítások mentése
        </button>
      </form>
    </section>
  );
}

export function MemberDashboard({
  congregationName,
  slug,
  themeKey,
  overview,
  preferences,
  changeRequests,
  notice,
}: MemberDashboardProps) {
  const selectedTheme = themeKey in THEME_HERO ? themeKey : "elo-kert";
  const hero = THEME_HERO[selectedTheme];
  const pendingRequest = changeRequests.find(
    (request) => request.status === "pending",
  );
  const firstName =
    overview.account.display_name.trim().split(/\s+/).at(-1) || "Testvér";
  const noticeCopy = notice ? NOTICE_COPY[notice] : undefined;
  const nowLabel = new Intl.DateTimeFormat("hu-HU", {
    dateStyle: "full",
    timeZone: "Europe/Bucharest",
  }).format(new Date());

  return (
    <div className={styles.dashboardPage} data-dashboard-theme={selectedTheme}>
      <a className={styles.skipLink} href="#dashboard-main">
        Ugrás a tartalomhoz
      </a>
      <Navigation congregationName={congregationName} />
      <div className={styles.pageColumn}>
        <header className={styles.topBar}>
          <div className={styles.mobileBrand}>
            <BrandMark />
            <div>
              <strong>Tagi portál</strong>
              <span>{congregationName}</span>
            </div>
          </div>
          <span className={styles.secureBadge}>
            <ShieldCheck aria-hidden="true" /> Biztonságos személyes terület
          </span>
          <form action={signOutMemberPortal} className={styles.logoutForm}>
            <input type="hidden" name="slug" value={slug} />
            <button type="submit">
              <LogOut aria-hidden="true" /> Kilépés
            </button>
          </form>
        </header>
        <Navigation congregationName={congregationName} compact />
        <main id="dashboard-main" className={styles.main} tabIndex={-1}>
          {noticeCopy ? (
            <div className={styles.noticeBanner} role="status">
              <Check aria-hidden="true" /> {noticeCopy}
            </div>
          ) : null}
          <section
            id="attekintes"
            className={styles.heroCard}
            aria-labelledby="dashboard-title"
          >
            <Image
              className={styles.heroImage}
              src={hero}
              alt=""
              fill
              priority
              sizes="(max-width: 1023px) 100vw, 76vw"
              aria-hidden="true"
            />
            <div className={styles.heroOverlay} />
            <div className={styles.heroContent}>
              <p className={styles.heroEyebrow}>Békesség Istentől!</p>
              <h1 id="dashboard-title">Üdvözöljük, {firstName}!</h1>
              <p>
                Itt egy helyen követheti személyes gyülekezeti adatait és
                ügyeit.
              </p>
              <div className={styles.heroMeta}>
                <span>
                  <ShieldCheck aria-hidden="true" /> Jóváhagyott tagi fiók
                </span>
                <span>
                  <CalendarDays aria-hidden="true" /> {nowLabel}
                </span>
              </div>
            </div>
          </section>
          <div className={styles.dashboardGrid}>
            <ProfileSection
              overview={overview}
              slug={slug}
              pendingRequest={pendingRequest}
            />
            <ChangeRequestSection request={pendingRequest} slug={slug} />
            <FamilySection overview={overview} />
            <PaymentsSection overview={overview} />
            <NewsletterSection
              overview={overview}
              preferences={preferences}
              slug={slug}
            />
          </div>
          <aside
            className={styles.privacyBanner}
            aria-labelledby="privacy-title"
          >
            <span className={styles.privacyIcon}>
              <LockKeyhole aria-hidden="true" />
            </span>
            <div>
              <h2 id="privacy-title">
                Az adatai elkülönítve és védetten jelennek meg
              </h2>
              <p>
                Kizárólag az Önhöz kapcsolt adatok láthatók. A beküldött
                módosítás csak lelkipásztori jóváhagyás után kerül a
                nyilvántartásba.
              </p>
            </div>
          </aside>
        </main>
        <footer className={styles.footer}>
          <span>{congregationName}</span>
          <span>Tagi portál • védett személyes felület</span>
        </footer>
      </div>
    </div>
  );
}
