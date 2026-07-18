"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getEffectiveAccessContext } from "@/lib/auth/effective-access";
import { runMemberNewsletterWorker } from "@/lib/email/member-newsletter-worker";
import { isMemberPortalAuthEnabled } from "@/lib/member-portal/feature-flags";
import { canAccessPublicSiteAdmin } from "@/lib/public-site/admin-access";

const PAGE_PATH = "/publikus-oldal/tagi-portal";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ScopedTable =
  | "member_congregation_applications"
  | "member_person_change_requests"
  | "member_newsletter_campaigns";

function value(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

function outcome(kind: "success" | "error", message: string): never {
  const params = new URLSearchParams({ [kind]: message });
  redirect(`${PAGE_PATH}?${params.toString()}`);
}

/**
 * Every mutation gets a fresh auth + effective congregation evaluation. The
 * database RPC performs its own authorization again; this guard prevents an
 * action endpoint from being a broader capability than its page.
 */
async function requirePastoralMemberPortalAccess() {
  if (!isMemberPortalAuthEnabled())
    outcome("error", "A tagi portál még nincs bekapcsolva.");

  const access = await getEffectiveAccessContext();
  if (
    !access.user ||
    !access.effectiveCongregationId ||
    !canAccessPublicSiteAdmin(access, "write")
  ) {
    outcome("error", "Nincs jogosultságod a tagi portál kezeléséhez.");
  }

  return {
    supabase: access.supabase,
    congregationId: access.effectiveCongregationId,
  };
}

async function requireScopedRecord(
  table: ScopedTable,
  id: string,
  congregationId: string,
) {
  if (!UUID_PATTERN.test(id)) outcome("error", "Érvénytelen azonosító.");

  const access = await requirePastoralMemberPortalAccess();
  if (access.congregationId !== congregationId)
    outcome("error", "A gyülekezeti hatókör megváltozott.");

  const { data, error } = await access.supabase
    .from(table)
    .select("id, congregation_id")
    .eq("id", id)
    .eq("congregation_id", congregationId)
    .maybeSingle();

  if (error || !data)
    outcome(
      "error",
      "A kiválasztott tétel nem érhető el ebben a gyülekezetben.",
    );
  return access;
}

function reportRpcFailure(operation: string, code?: string) {
  console.error(
    `[member-portal-admin] ${operation} sikertelen`,
    code ?? "unknown",
  );
  outcome(
    "error",
    "A műveletet most nem sikerült elvégezni. Próbáld meg újra.",
  );
}

export async function approveMemberApplication(formData: FormData) {
  const applicationId = value(formData, "application_id");
  const personSelection = value(formData, "person_selection");
  const personMatch = personSelection.match(/#([1-9]\d*)$/);
  const personId = personMatch ? Number(personMatch[1]) : Number.NaN;
  const decisionMessage = value(formData, "decision_message");
  const congregationId = value(formData, "congregation_id");

  if (
    !Number.isSafeInteger(personId) ||
    personId < 1 ||
    decisionMessage.length > 2000
  ) {
    outcome(
      "error",
      "Válassz személyt a találati listából, és legfeljebb 2000 karakteres üzenetet adj meg.",
    );
  }

  const access = await requireScopedRecord(
    "member_congregation_applications",
    applicationId,
    congregationId,
  );
  const { error } = await access.supabase.rpc(
    "member_portal_approve_application",
    {
      p_application_id: applicationId,
      p_person_id: personId,
      p_decision_message: decisionMessage || null,
    },
  );
  if (error) reportRpcFailure("Csatlakozási kérelem jóváhagyása", error.code);

  revalidatePath(PAGE_PATH);
  outcome("success", "A tagi kérelem jóváhagyva és a személyhez kapcsolva.");
}

export async function rejectMemberApplication(formData: FormData) {
  const applicationId = value(formData, "application_id");
  const reason = value(formData, "reason");
  const congregationId = value(formData, "congregation_id");
  if (reason.length < 3 || reason.length > 2000) {
    outcome("error", "Az elutasítás indoklása 3–2000 karakter legyen.");
  }

  const access = await requireScopedRecord(
    "member_congregation_applications",
    applicationId,
    congregationId,
  );
  const { error } = await access.supabase.rpc(
    "member_portal_reject_application",
    {
      p_application_id: applicationId,
      p_reason: reason,
    },
  );
  if (error) reportRpcFailure("Csatlakozási kérelem elutasítása", error.code);

  revalidatePath(PAGE_PATH);
  outcome("success", "A tagi kérelem elutasítva.");
}

export async function reviewPersonChange(formData: FormData) {
  const requestId = value(formData, "request_id");
  const decision = value(formData, "decision");
  const message = value(formData, "decision_message");
  const congregationId = value(formData, "congregation_id");
  if (
    (decision !== "approve" && decision !== "reject") ||
    message.length > 2000 ||
    (decision === "reject" && message.length === 0)
  ) {
    outcome(
      "error",
      "Elutasításkor adj meg indoklást; az üzenet legfeljebb 2000 karakter lehet.",
    );
  }

  const access = await requireScopedRecord(
    "member_person_change_requests",
    requestId,
    congregationId,
  );
  const { error } = await access.supabase.rpc(
    "member_portal_staff_review_person_change",
    {
      p_request_id: requestId,
      p_decision: decision,
      p_decision_message: message || null,
    },
  );
  if (error) reportRpcFailure("Személyesadat-módosítás elbírálása", error.code);

  revalidatePath(PAGE_PATH);
  outcome(
    "success",
    decision === "approve"
      ? "A személyesadat-módosítás jóváhagyva."
      : "A személyesadat-módosítás elutasítva.",
  );
}

export async function createNewsletterDraft(formData: FormData) {
  const campaignKind = value(formData, "campaign_kind");
  const subject = value(formData, "subject");
  const body = value(formData, "body");
  if (
    !["general", "announcements", "events"].includes(campaignKind) ||
    subject.length < 1 ||
    subject.length > 200 ||
    /[\r\n]/.test(subject) ||
    body.length < 1 ||
    body.length > 50000
  ) {
    outcome(
      "error",
      "A hírlevél tárgya 1–200 karakter, a szövege 1–50 000 karakter lehet.",
    );
  }

  const { supabase, congregationId } =
    await requirePastoralMemberPortalAccess();
  const { error } = await supabase.rpc(
    "member_portal_create_newsletter_campaign",
    {
      p_congregation_id: congregationId,
      p_idempotency_key: crypto.randomUUID(),
      p_campaign_kind: campaignKind,
      p_subject: subject,
      p_body_text: body,
    },
  );
  if (error) reportRpcFailure("Hírlevél-vázlat létrehozása", error.code);

  revalidatePath(PAGE_PATH);
  outcome("success", "A hírlevél vázlatként elkészült.");
}

export async function queueNewsletterCampaign(formData: FormData) {
  const campaignId = value(formData, "campaign_id");
  const congregationId = value(formData, "congregation_id");
  const access = await requireScopedRecord(
    "member_newsletter_campaigns",
    campaignId,
    congregationId,
  );
  const { error } = await access.supabase.rpc(
    "member_portal_queue_newsletter_campaign",
    {
      p_campaign_id: campaignId,
    },
  );
  if (error) reportRpcFailure("Hírlevél várólistára helyezése", error.code);

  revalidatePath(PAGE_PATH);
  outcome(
    "success",
    "A címzettek pillanatképe elkészült, a kampány várólistára került.",
  );
}

export async function deliverNewsletterCampaign(formData: FormData) {
  const campaignId = value(formData, "campaign_id");
  const congregationId = value(formData, "congregation_id");
  await requireScopedRecord(
    "member_newsletter_campaigns",
    campaignId,
    congregationId,
  );

  let result: Awaited<ReturnType<typeof runMemberNewsletterWorker>>;
  try {
    result = await runMemberNewsletterWorker({ campaignId, batchSize: 10 });
  } catch (error: unknown) {
    console.error(
      "[member-portal-admin] Hírlevél-kézbesítés indítása sikertelen",
      error instanceof Error ? error.message : "unknown",
    );
    outcome(
      "error",
      "A kézbesítést most nem sikerült elindítani. A kampány a várólistán maradt; ellenőrizd a levelezési és worker-beállításokat.",
    );
  }

  revalidatePath(PAGE_PATH);

  if (result.settlementErrors > 0) {
    console.error(
      "[member-portal-admin] A hírlevél-kézbesítés lezárása részben sikertelen",
      {
        campaignId,
        settlementErrors: result.settlementErrors,
      },
    );
    outcome(
      "error",
      "A levelező szolgáltató válaszolt, de néhány kézbesítés állapotát nem sikerült biztonságosan lezárni. Ne indítsd újra rögtön; ellenőrizd később az állapotot.",
    );
  }

  if (result.claimed === 0) {
    outcome(
      "success",
      "Most nincs azonnal kézbesíthető levél ebben a kampányban. A késleltetett újrapróbálkozásokat a háttérfolyamat folytatja.",
    );
  }

  const details = [
    `${result.sent} sikeresen elküldve`,
    result.retried > 0
      ? `${result.retried} későbbi újrapróbálkozásra vár`
      : null,
    result.failed > 0 ? `${result.failed} végleg sikertelen` : null,
  ].filter(Boolean);

  outcome(
    result.failed > 0 ? "error" : "success",
    `A kézbesítés elindult: ${details.join(", ")}. A hátralévő címzetteket a háttérfolyamat folytatja.`,
  );
}

export async function cancelNewsletterCampaign(formData: FormData) {
  const campaignId = value(formData, "campaign_id");
  const reason = value(formData, "reason");
  const congregationId = value(formData, "congregation_id");
  if (reason.length < 1 || reason.length > 1000)
    outcome("error", "Adj meg legfeljebb 1000 karakteres törlési indokot.");

  const access = await requireScopedRecord(
    "member_newsletter_campaigns",
    campaignId,
    congregationId,
  );
  const { error } = await access.supabase.rpc(
    "member_portal_cancel_newsletter_campaign",
    {
      p_campaign_id: campaignId,
      p_reason: reason,
    },
  );
  if (error) reportRpcFailure("Hírlevélkampány leállítása", error.code);

  revalidatePath(PAGE_PATH);
  outcome(
    "success",
    "A hírlevélkampány leállítva; a várólistás kézbesítések törölve.",
  );
}
