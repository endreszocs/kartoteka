import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  BadgeCheck,
  BellRing,
  ClipboardCheck,
  Clock3,
  FilePenLine,
  HeartHandshake,
  MailCheck,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
  XCircle,
} from "lucide-react";

import {
  approveMemberApplication,
  cancelNewsletterCampaign,
  createNewsletterDraft,
  deliverNewsletterCampaign,
  queueNewsletterCampaign,
  rejectMemberApplication,
  reviewPersonChange,
} from "./actions";
import { NewsletterSubmitButton } from "./newsletter-submit-button";
import { PublicSiteAdminNav } from "@/components/admin/public-site/public-site-admin-nav";
import { getEffectiveAccessContext } from "@/lib/auth/effective-access";
import { canAccessPublicSiteAdmin } from "@/lib/public-site/admin-access";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Tagi portál kezelése · Kartotéka",
  description:
    "Tagi csatlakozási kérelmek, adatmódosítások és hírlevelek kezelése.",
};

const PORTAL_ENABLED = process.env.MEMBER_PORTAL_AUTH_ENABLED === "true";

type Application = {
  id: string;
  congregation_id: string;
  applicant_full_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  applicant_birth_date: string | null;
  applicant_message: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
  decision_message: string | null;
  // Supabase nested many-to-one selects are represented as an array by the
  // generated client, even though the account FK is singular.
  member_accounts: Array<{
    display_name: string;
    email: string;
    status: string;
  }>;
};

type ChangeRequest = {
  request_id: string;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  member_account_id: string;
  account_display_name: string;
  account_email: string;
  person_id: number;
  person_display_name: string;
  base_person_revision: number;
  current_person_revision: number;
  requested_patch: Record<string, unknown>;
  decision_message: string | null;
};

type Campaign = {
  id: string;
  congregation_id: string;
  campaign_kind: "general" | "announcements" | "events";
  subject: string;
  body_text: string;
  status: "draft" | "queued" | "sending" | "sent" | "failed" | "cancelled";
  recipient_snapshot_count: number | null;
  delivery_sent_count: number;
  delivery_failed_count: number;
  delivery_cancelled_count: number;
  created_at: string;
  queued_at: string | null;
  delivery_started_at: string | null;
  delivery_completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};

type PersonOption = {
  id: number;
  csaladnev: string | null;
  k_nev: string | null;
  szcs_nev: string | null;
  sz_datum: string | null;
  email: string | null;
  telefon: string | null;
};

const CHANGE_FIELD_LABELS: Record<string, string> = {
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

function formatDate(
  value: string | null | undefined,
  includeTime = false,
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function personOptionLabel(person: PersonOption): string {
  const currentName = [person.csaladnev, person.k_nev]
    .filter(Boolean)
    .join(" ")
    .trim();
  const name = currentName || person.szcs_nev || `Személy #${person.id}`;
  const details = [
    person.sz_datum ? `szül.: ${formatDate(person.sz_datum)}` : null,
    person.email || person.telefon,
    `#${person.id}`,
  ].filter(Boolean);
  return `${name} — ${details.join(" · ")}`;
}

function formatChangeValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Igen" : "Nem";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (value === null) return "Üresre törlés";
  return "Módosított érték";
}

function statusLabel(status: string): string {
  return (
    {
      pending_email: "E-mail megerősítésre vár",
      pending_review: "Elbírálásra vár",
      approved: "Jóváhagyva",
      rejected: "Elutasítva",
      withdrawn: "Visszavonva",
      pending: "Elbírálásra vár",
      conflict: "Ütközés",
      draft: "Vázlat",
      queued: "Várólistán",
      sending: "Kézbesítés alatt",
      sent: "Elküldve",
      failed: "Hibával lezárva",
      cancelled: "Leállítva",
    }[status] ?? status
  );
}

function statusClass(status: string): string {
  if (["approved", "sent"].includes(status))
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (["pending_review", "pending", "draft"].includes(status))
    return "bg-amber-50 text-amber-900 ring-amber-200";
  if (["queued", "sending"].includes(status))
    return "bg-sky-50 text-sky-800 ring-sky-200";
  if (["rejected", "cancelled", "conflict", "failed"].includes(status))
    return "bg-rose-50 text-rose-800 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-bold ring-1 ring-inset",
        statusClass(status),
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function FlashMessage({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  if (!success && !error) return null;
  const positive = Boolean(success);
  return (
    <div
      role={positive ? "status" : "alert"}
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4 text-sm shadow-sm",
        positive
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-rose-200 bg-rose-50 text-rose-950",
      )}
    >
      {positive ? (
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />
      ) : (
        <XCircle className="mt-0.5 size-5 shrink-0 text-rose-700" />
      )}
      <p className="leading-6">{success || error}</p>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Clock3;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-9 text-center">
      <Icon className="mx-auto size-7 text-slate-400" aria-hidden="true" />
      <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
        {detail}
      </p>
    </div>
  );
}

function HiddenId({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

export default async function MemberPortalAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const access = await getEffectiveAccessContext();
  if (!access.user) redirect("/login");
  if (!canAccessPublicSiteAdmin(access, "write")) redirect("/publikus-oldal");

  const congregationId = access.effectiveCongregationId;
  if (!congregationId) redirect("/publikus-oldal");

  const messages = await searchParams;

  // Safe rollout: no member table/RPC access while the feature is disabled.
  if (!PORTAL_ENABLED) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-5 py-4 sm:py-6">
        <header className="card-raised relative overflow-hidden p-5 sm:p-7">
          <div className="absolute -right-10 -top-16 size-52 rounded-full bg-violet-200/40 blur-3xl" />
          <div className="absolute -bottom-20 left-1/3 size-48 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700">
              Tagi kapcsolatok
            </p>
            <h1 className="mt-2 font-heading text-3xl text-slate-900 sm:text-4xl">
              Tagi portál kezelése
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              A kezelőfelület elkészült, de a tagi Auth és az izolált adatmodell
              még nincs élesítve. Itt addig sem olvasunk tagi adatot vagy
              futtatunk RPC-t.
            </p>
          </div>
        </header>
        <PublicSiteAdminNav active="memberPortal" canWrite />
        <section className="card-raised overflow-hidden border-amber-200">
          <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-6 sm:p-8">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                <ShieldCheck className="size-6" />
              </div>
              <h2 className="mt-5 font-heading text-2xl text-slate-900">
                Biztonságos bekapcsolási állapot
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                A felület kizárólag akkor lesz működőképes, ha a member-portal
                migrációk és a token-hook ellenőrzése után a{" "}
                <code className="rounded bg-white px-1.5 py-0.5 text-xs">
                  MEMBER_PORTAL_AUTH_ENABLED=true
                </code>{" "}
                környezeti változó is be van állítva.
              </p>
            </div>
            <div className="p-6 sm:p-8">
              <ol className="space-y-4 text-sm text-slate-700">
                <li className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">
                    1
                  </span>
                  <span>
                    Alkalmazások: e-mailt megerősített tagok kérelmei,
                    személyhez kapcsolási döntéssel.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                    2
                  </span>
                  <span>
                    Adatmódosítások: a tag javaslata és a nyilvántartás aktuális
                    verziója egy helyen.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">
                    3
                  </span>
                  <span>
                    Hírlevelek: vázlat, rögzített címzettlista és
                    visszakövethető, címzettenkénti kézbesítés.
                  </span>
                </li>
              </ol>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const [applicationsResult, changesResult, campaignsResult, personsResult] =
    await Promise.all([
      access.supabase
        .from("member_congregation_applications")
        .select(
          "id, congregation_id, applicant_full_name, applicant_email, applicant_phone, applicant_birth_date, applicant_message, status, submitted_at, created_at, decision_message, member_accounts(display_name, email, status)",
        )
        .eq("congregation_id", congregationId)
        .in("status", ["pending_review", "approved"])
        .order("submitted_at", { ascending: true, nullsFirst: false })
        .limit(50),
      access.supabase.rpc("member_portal_staff_list_person_changes", {
        p_congregation_id: congregationId,
        p_status: "pending",
        p_limit: 100,
      }),
      access.supabase
        .from("member_newsletter_campaigns")
        .select(
          "id, congregation_id, campaign_kind, subject, body_text, status, recipient_snapshot_count, delivery_sent_count, delivery_failed_count, delivery_cancelled_count, created_at, queued_at, delivery_started_at, delivery_completed_at, cancelled_at, cancellation_reason",
        )
        .eq("congregation_id", congregationId)
        .order("created_at", { ascending: false })
        .limit(12),
      access.supabase
        .from("szemely")
        .select("id, csaladnev, k_nev, szcs_nev, sz_datum, email, telefon")
        .eq("congregation_id", congregationId)
        .eq("isvisible", true)
        .eq("meghalt", false)
        .order("csaladnev", { ascending: true })
        .order("k_nev", { ascending: true })
        .limit(2000),
    ]);

  const applications = applicationsResult.error
    ? []
    : ((applicationsResult.data ?? []) as Application[]);
  const changePayload = changesResult.error
    ? null
    : (changesResult.data as { items?: ChangeRequest[] } | null);
  const changes = Array.isArray(changePayload?.items)
    ? changePayload.items
    : [];
  const campaigns = campaignsResult.error
    ? []
    : ((campaignsResult.data ?? []) as Campaign[]);
  const persons = personsResult.error
    ? []
    : ((personsResult.data ?? []) as PersonOption[]);
  const loadWarning = Boolean(
    applicationsResult.error ||
    changesResult.error ||
    campaignsResult.error ||
    personsResult.error,
  );

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-5 py-4 sm:py-6">
      <header className="card-raised relative overflow-hidden p-5 sm:p-7">
        <div className="absolute -right-10 -top-16 size-52 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 size-48 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700">
              Tagi kapcsolatok
            </p>
            <h1 className="mt-2 font-heading text-3xl text-slate-900 sm:text-4xl">
              Tagi portál kezelése
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Kérelmek, személyesadat-módosítások és a gyülekezeti hírlevél
              kizárólag a jelenlegi gyülekezeti hatókörben.
            </p>
          </div>
          <div className="inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200 lg:self-auto">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Elkülönített tagi adatok
          </div>
        </div>
      </header>

      <PublicSiteAdminNav active="memberPortal" canWrite />
      <FlashMessage success={messages.success} error={messages.error} />

      {loadWarning ? (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
        >
          Egy vagy több lista most nem tölthető be. A nem megjelenő adatokat nem
          értelmezzük üres állapotként; frissítsd később az oldalt.
        </div>
      ) : null}

      <section
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Tagi portál összesítő"
      >
        <div className="card-raised p-4">
          <UsersRound className="size-5 text-violet-700" />
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {
              applications.filter((item) => item.status === "pending_review")
                .length
            }
          </p>
          <p className="text-sm text-slate-500">elbírálásra váró kérelem</p>
        </div>
        <div className="card-raised p-4">
          <FilePenLine className="size-5 text-amber-700" />
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {changes.length}
          </p>
          <p className="text-sm text-slate-500">függő adatmódosítás</p>
        </div>
        <div className="card-raised p-4">
          <MailCheck className="size-5 text-sky-700" />
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {
              campaigns.filter((item) =>
                ["queued", "sending"].includes(item.status),
              ).length
            }
          </p>
          <p className="text-sm text-slate-500">
            küldésre váró vagy aktív kampány
          </p>
        </div>
      </section>

      <section
        className="card-raised overflow-hidden"
        aria-labelledby="applications-heading"
      >
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <HeartHandshake className="size-5" />
            </div>
            <div>
              <h2
                id="applications-heading"
                className="font-heading text-2xl text-slate-900"
              >
                Csatlakozási kérelmek
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                A jóváhagyáskor a kérelmezőt egy már létező nyilvántartási
                személyhez kell kapcsolni.
              </p>
            </div>
          </div>
        </div>
        {persons.length > 0 ? (
          <datalist id="member-person-options">
            {persons.map((person) => (
              <option key={person.id} value={personOptionLabel(person)} />
            ))}
          </datalist>
        ) : null}
        <div className="divide-y divide-slate-100">
          {applications.length === 0 ? (
            <div className="p-5 sm:p-6">
              <EmptyState
                icon={UserRoundCheck}
                title="Nincs megjeleníthető kérelem"
                detail="A tag e-mailes megerősítése után itt jelenik meg az elbírálásra váró csatlakozási kérelem."
              />
            </div>
          ) : (
            applications.map((application) => (
              <article key={application.id} className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900">
                        {application.applicant_full_name}
                      </h3>
                      <StatusBadge status={application.status} />
                    </div>
                    <p className="mt-1 break-all text-sm text-slate-600">
                      {application.applicant_email}
                      {application.applicant_phone
                        ? ` · ${application.applicant_phone}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Beküldve:{" "}
                      {formatDate(
                        application.submitted_at ?? application.created_at,
                        true,
                      )}
                      {application.applicant_birth_date
                        ? ` · Szül.: ${formatDate(application.applicant_birth_date)}`
                        : ""}
                    </p>
                    {application.applicant_message ? (
                      <p className="mt-3 max-w-3xl rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                        {application.applicant_message}
                      </p>
                    ) : null}
                  </div>
                  {application.status === "pending_review" ? (
                    <div className="grid w-full gap-3 xl:max-w-xl">
                      <form
                        action={approveMemberApplication}
                        className="grid gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 sm:grid-cols-[1fr_auto]"
                      >
                        <HiddenId
                          name="application_id"
                          value={application.id}
                        />
                        <HiddenId
                          name="congregation_id"
                          value={congregationId}
                        />
                        <label
                          className="grid gap-1.5 text-xs font-bold text-emerald-950 sm:col-span-2"
                          htmlFor={`person-${application.id}`}
                        >
                          <span>Kapcsolás a nyilvántartott személyhez</span>
                          <input
                            id={`person-${application.id}`}
                            name="person_selection"
                            list="member-person-options"
                            required
                            disabled={persons.length === 0}
                            autoComplete="off"
                            placeholder={
                              persons.length > 0
                                ? "Kezdd el gépelni a nevet, dátumot vagy elérhetőséget…"
                                : "A személylista most nem elérhető"
                            }
                            className="min-h-11 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
                          />
                        </label>
                        <label
                          className="grid gap-1.5 text-xs font-bold text-emerald-950 sm:col-span-2"
                          htmlFor={`approve-message-${application.id}`}
                        >
                          <span>Üzenet a tagnak (opcionális)</span>
                          <input
                            id={`approve-message-${application.id}`}
                            name="decision_message"
                            maxLength={2000}
                            placeholder="Például: Szeretettel köszöntünk a tagi portálon!"
                            className="min-h-11 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-normal outline-none focus:ring-4 focus:ring-emerald-500/20"
                          />
                        </label>
                        <button
                          disabled={persons.length === 0}
                          className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/25 disabled:cursor-not-allowed disabled:bg-slate-400 sm:col-start-2"
                          type="submit"
                        >
                          Kapcsolás és jóváhagyás
                        </button>
                      </form>
                      <form
                        action={rejectMemberApplication}
                        className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50/70 p-3 sm:flex-row"
                      >
                        <HiddenId
                          name="application_id"
                          value={application.id}
                        />
                        <HiddenId
                          name="congregation_id"
                          value={congregationId}
                        />
                        <label
                          className="grid min-w-0 flex-1 gap-1.5 text-xs font-bold text-rose-950"
                          htmlFor={`reject-reason-${application.id}`}
                        >
                          <span>Elutasítás indoklása</span>
                          <input
                            id={`reject-reason-${application.id}`}
                            name="reason"
                            minLength={3}
                            maxLength={2000}
                            required
                            placeholder="Írd le röviden, miért nem hagyható jóvá a kérelem."
                            className="min-h-11 min-w-0 rounded-xl border border-rose-200 bg-white px-3 text-sm font-normal outline-none focus:ring-4 focus:ring-rose-500/20"
                          />
                        </label>
                        <button
                          className="min-h-11 rounded-xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-800 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/20 sm:self-end"
                          type="submit"
                        >
                          Elutasítás
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section
        className="card-raised overflow-hidden"
        aria-labelledby="changes-heading"
      >
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <ClipboardCheck className="size-5" />
            </div>
            <div>
              <h2
                id="changes-heading"
                className="font-heading text-2xl text-slate-900"
              >
                Személyesadat-módosítások
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Csak a függő kérések láthatók. Jóváhagyás előtt a rendszer
                verzióütközést is ellenőriz.
              </p>
            </div>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {changes.length === 0 ? (
            <div className="p-5 sm:p-6">
              <EmptyState
                icon={FilePenLine}
                title="Nincs függő módosítás"
                detail="A tag által beküldött személyesadat-változtatások itt várnak majd jóváhagyásra."
              />
            </div>
          ) : (
            changes.map((change) => (
              <article key={change.request_id} className="p-5 sm:p-6">
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,.8fr)]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900">
                        {change.person_display_name}
                      </h3>
                      <StatusBadge status={change.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      Tagi fiók: {change.account_display_name} ·{" "}
                      <span className="break-all">{change.account_email}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Beküldve: {formatDate(change.submitted_at, true)} ·
                      Személy #{change.person_id} · verzió{" "}
                      {change.base_person_revision} → aktuális{" "}
                      {change.current_person_revision}
                    </p>
                    <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                      {Object.entries(change.requested_patch).map(
                        ([field, fieldValue]) => (
                          <div
                            key={field}
                            className="rounded-xl bg-slate-50 p-3"
                          >
                            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                              {CHANGE_FIELD_LABELS[field] ??
                                field.replaceAll("_", " ")}
                            </dt>
                            <dd className="mt-1 break-words text-sm text-slate-800">
                              {formatChangeValue(fieldValue)}
                            </dd>
                          </div>
                        ),
                      )}
                    </dl>
                  </div>
                  <form
                    action={reviewPersonChange}
                    className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
                  >
                    <HiddenId name="request_id" value={change.request_id} />
                    <HiddenId name="congregation_id" value={congregationId} />
                    <label
                      htmlFor={`review-message-${change.request_id}`}
                      className="text-sm font-bold text-slate-800"
                    >
                      Válasz a tagnak
                    </label>
                    <textarea
                      id={`review-message-${change.request_id}`}
                      name="decision_message"
                      maxLength={2000}
                      rows={4}
                      placeholder="Jóváhagyásnál opcionális, elutasításnál kötelező indoklás."
                      className="w-full rounded-xl border border-amber-200 bg-white p-3 text-sm outline-none focus:ring-4 focus:ring-amber-500/20"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        name="decision"
                        value="approve"
                        type="submit"
                        className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/25"
                      >
                        Jóváhagyás
                      </button>
                      <button
                        name="decision"
                        value="reject"
                        type="submit"
                        className="min-h-11 rounded-xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-800 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/20"
                      >
                        Elutasítás
                      </button>
                    </div>
                  </form>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section
        className="card-raised overflow-hidden"
        aria-labelledby="newsletter-heading"
      >
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
              <BellRing className="size-5" />
            </div>
            <div>
              <h2
                id="newsletter-heading"
                className="font-heading text-2xl text-slate-900"
              >
                Gyülekezeti hírlevél
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                A várólistára helyezés rögzíti az akkor jóváhagyott címzetteket.
                Ezután a kézbesítés kézzel elindítható, és a háttérfolyamat
                biztonságosan folytatja.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
          <form
            action={createNewsletterDraft}
            className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 sm:p-5"
          >
            <h3 className="font-bold text-slate-900">Új hírlevélvázlat</h3>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                <span>Típus</span>
                <select
                  name="campaign_kind"
                  defaultValue="general"
                  className="min-h-11 rounded-xl border border-sky-200 bg-white px-3 text-sm outline-none focus:ring-4 focus:ring-sky-500/20"
                >
                  <option value="general">Általános</option>
                  <option value="announcements">Hirdetések</option>
                  <option value="events">Események</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                <span>Tárgy</span>
                <input
                  name="subject"
                  required
                  maxLength={200}
                  className="min-h-11 rounded-xl border border-sky-200 bg-white px-3 text-sm outline-none focus:ring-4 focus:ring-sky-500/20"
                  placeholder="Például: Vasárnapi alkalmaink"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                <span>Üzenet</span>
                <textarea
                  name="body"
                  required
                  maxLength={50000}
                  rows={7}
                  className="rounded-xl border border-sky-200 bg-white p-3 text-sm outline-none focus:ring-4 focus:ring-sky-500/20"
                  placeholder="Írd ide a hírlevél szövegét…"
                />
              </label>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white transition hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-600/25"
              >
                <FilePenLine className="size-4" />
                Vázlat mentése
              </button>
            </div>
          </form>
          <div className="space-y-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <Clock3 className="mr-2 inline size-4 text-amber-700" />A rendszer
              csak a szolgáltató által elfogadott levelet számolja{" "}
              <strong>elküldöttnek</strong>. A sikertelen címzetteket
              korlátozott számú, késleltetett újrapróbálkozás védi.
            </div>
            {campaigns.length === 0 ? (
              <EmptyState
                icon={MailCheck}
                title="Még nincs hírlevélkampány"
                detail="A vázlat mentése után itt kezelheted a címzett-pillanatképet és a kézbesítést."
              />
            ) : (
              campaigns.map((campaign) => (
                <article
                  key={campaign.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900">
                          {campaign.subject}
                        </h3>
                        <StatusBadge status={campaign.status} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {campaign.campaign_kind === "general"
                          ? "Általános"
                          : campaign.campaign_kind === "announcements"
                            ? "Hirdetések"
                            : "Események"}{" "}
                        · {formatDate(campaign.created_at, true)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-700">
                      {campaign.recipient_snapshot_count ?? "—"} címzett
                    </p>
                  </div>
                  <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {campaign.body_text}
                  </p>
                  {campaign.status !== "draft" ? (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-emerald-50 px-2 py-2 text-emerald-800">
                        <strong className="block text-base">
                          {campaign.delivery_sent_count}
                        </strong>
                        elküldve
                      </div>
                      <div className="rounded-xl bg-rose-50 px-2 py-2 text-rose-800">
                        <strong className="block text-base">
                          {campaign.delivery_failed_count}
                        </strong>
                        sikertelen
                      </div>
                      <div className="rounded-xl bg-slate-50 px-2 py-2 text-slate-700">
                        <strong className="block text-base">
                          {campaign.delivery_cancelled_count}
                        </strong>
                        leállítva
                      </div>
                    </div>
                  ) : null}
                  {campaign.status === "draft" ? (
                    <form action={queueNewsletterCampaign} className="mt-4">
                      <HiddenId name="campaign_id" value={campaign.id} />
                      <HiddenId name="congregation_id" value={congregationId} />
                      <NewsletterSubmitButton
                        tone="sky"
                        idleLabel="Címzettek rögzítése"
                        pendingLabel="Címzettek rögzítése…"
                      />
                    </form>
                  ) : null}
                  {["queued", "sending"].includes(campaign.status) ? (
                    <form action={deliverNewsletterCampaign} className="mt-4">
                      <HiddenId name="campaign_id" value={campaign.id} />
                      <HiddenId name="congregation_id" value={congregationId} />
                      <NewsletterSubmitButton
                        tone="emerald"
                        idleLabel={
                          campaign.status === "queued"
                            ? "Kézbesítés indítása"
                            : "Kézbesítés folytatása"
                        }
                        pendingLabel="Kézbesítés folyamatban…"
                      />
                    </form>
                  ) : null}
                  {campaign.status === "queued" ? (
                    <form
                      action={cancelNewsletterCampaign}
                      className="mt-3 flex flex-col gap-2 sm:flex-row"
                    >
                      <HiddenId name="campaign_id" value={campaign.id} />
                      <HiddenId name="congregation_id" value={congregationId} />
                      <label
                        className="grid min-w-0 flex-1 gap-1.5 text-xs font-bold text-rose-950"
                        htmlFor={`campaign-cancel-reason-${campaign.id}`}
                      >
                        <span>Leállítás indoka</span>
                        <input
                          id={`campaign-cancel-reason-${campaign.id}`}
                          name="reason"
                          required
                          maxLength={1000}
                          placeholder="Például: a hirdetés időpontja megváltozott."
                          className="min-h-11 min-w-0 rounded-xl border border-rose-200 px-3 text-sm font-normal outline-none focus:ring-4 focus:ring-rose-500/20"
                        />
                      </label>
                      <NewsletterSubmitButton
                        tone="rose"
                        idleLabel="Kampány leállítása"
                        pendingLabel="Kampány leállítása…"
                      />
                    </form>
                  ) : null}
                  {campaign.status === "sent" &&
                  campaign.delivery_completed_at ? (
                    <p className="mt-3 text-xs text-slate-500">
                      Kézbesítés lezárva:{" "}
                      {formatDate(campaign.delivery_completed_at, true)}
                    </p>
                  ) : null}
                  {campaign.status === "failed" ? (
                    <p className="mt-3 text-sm leading-6 text-rose-700">
                      A megadott újrapróbálkozások után is maradt sikertelen
                      címzett. A részletek megőrződtek; javított címmel új
                      kampány indítható.
                    </p>
                  ) : null}
                  {campaign.status === "cancelled" &&
                  campaign.cancellation_reason ? (
                    <p className="mt-3 text-sm text-slate-500">
                      Leállítás oka: {campaign.cancellation_reason}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
