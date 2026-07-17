import "server-only";

import { sendEmail } from "./send";
import {
  buildMemberNewsletterEmail,
  type MemberNewsletterLocale,
} from "./templates/member-newsletter";
import type { EmailSendResult } from "./types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CampaignKind = "general" | "announcements" | "events";

interface ClaimedDelivery {
  delivery_id: string;
  claim_token: string;
  campaign_id: string;
  campaign_kind: CampaignKind;
  subject: string;
  body_text: string;
  recipient_email: string;
  recipient_display_name: string;
  preferred_locale: MemberNewsletterLocale;
  attempt_count: number;
}

interface RetryResult {
  delivery_status?: "queued" | "failed" | "cancelled";
}

export interface MemberNewsletterWorkerOptions {
  /** Ha meg van adva, a claim csak ezt az egy kampányt dolgozza fel. */
  campaignId?: string;
  batchSize?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  baseRetrySeconds?: number;
}

export interface MemberNewsletterWorkerResult {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  settlementErrors: number;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value as number));
}

function envInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return boundedInteger(parsed, fallback, minimum, maximum);
}

function isCampaignKind(value: unknown): value is CampaignKind {
  return value === "general" || value === "announcements" || value === "events";
}

function isLocale(value: unknown): value is MemberNewsletterLocale {
  return value === "hu" || value === "ro" || value === "en";
}

function isClaimedDelivery(value: unknown): value is ClaimedDelivery {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.delivery_id === "string" &&
    UUID_PATTERN.test(row.delivery_id) &&
    typeof row.claim_token === "string" &&
    UUID_PATTERN.test(row.claim_token) &&
    typeof row.campaign_id === "string" &&
    UUID_PATTERN.test(row.campaign_id) &&
    isCampaignKind(row.campaign_kind) &&
    typeof row.subject === "string" &&
    row.subject.length >= 1 &&
    row.subject.length <= 200 &&
    typeof row.body_text === "string" &&
    row.body_text.length >= 1 &&
    row.body_text.length <= 50_000 &&
    typeof row.recipient_email === "string" &&
    row.recipient_email.length <= 320 &&
    EMAIL_PATTERN.test(row.recipient_email) &&
    typeof row.recipient_display_name === "string" &&
    row.recipient_display_name.length >= 1 &&
    row.recipient_display_name.length <= 200 &&
    isLocale(row.preferred_locale) &&
    Number.isSafeInteger(row.attempt_count) &&
    (row.attempt_count as number) >= 1
  );
}

function sanitizeProviderError(value: string | undefined): string {
  const normalized = (
    value || "A levelezési szolgáltató ismeretlen hibát jelzett."
  )
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(
      /\b(?:sb_secret_|sbp_|xkeysib-|re_)[A-Za-z0-9._-]{12,}\b/g,
      "[secret]",
    )
    .replace(/\s+/g, " ")
    .trim();

  return (
    normalized || "A levelezési szolgáltató üres hibát adott vissza."
  ).slice(0, 1000);
}

function unexpectedSendFailure(error: unknown): EmailSendResult {
  const message =
    error instanceof Error ? error.message : "Ismeretlen küldési hiba.";
  return {
    success: false,
    provider: "disabled",
    error: message,
  };
}

/**
 * Egy rövid, korlátozott worker-batch feldolgozása. A claim és a lezárás
 * adatbázis-RPC, ezért több Railway példány vagy kézi indítás mellett is
 * konkurenciabiztos. A küldés szándékosan címzettenként külön provider-hívás.
 */
export async function runMemberNewsletterWorker(
  options: MemberNewsletterWorkerOptions = {},
): Promise<MemberNewsletterWorkerResult> {
  if (options.campaignId && !UUID_PATTERN.test(options.campaignId)) {
    throw new Error("Érvénytelen newsletter worker campaignId.");
  }

  const batchSize = boundedInteger(
    options.batchSize,
    envInteger("NEWSLETTER_WORKER_BATCH_SIZE", 10, 1, 25),
    1,
    25,
  );
  const leaseSeconds = boundedInteger(
    options.leaseSeconds,
    envInteger("NEWSLETTER_WORKER_LEASE_SECONDS", 900, 60, 1800),
    60,
    1800,
  );
  const maxAttempts = boundedInteger(
    options.maxAttempts,
    envInteger("NEWSLETTER_WORKER_MAX_ATTEMPTS", 4, 1, 10),
    1,
    10,
  );
  const baseRetrySeconds = boundedInteger(
    options.baseRetrySeconds,
    envInteger("NEWSLETTER_WORKER_RETRY_BASE_SECONDS", 300, 30, 3600),
    30,
    3600,
  );

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc(
    "member_portal_worker_claim_newsletter_deliveries",
    {
      p_limit: batchSize,
      p_lease_seconds: leaseSeconds,
      p_campaign_id: options.campaignId ?? null,
    },
  );

  if (error) {
    throw new Error(
      `A newsletter delivery claim sikertelen (${error.code || "unknown"}).`,
    );
  }

  const rawRows: unknown[] = Array.isArray(data) ? data : [];
  const rows = rawRows.filter(isClaimedDelivery);
  if (rows.length !== rawRows.length) {
    throw new Error(
      "A newsletter claim RPC érvénytelen adatszerkezetet adott vissza.",
    );
  }

  const result: MemberNewsletterWorkerResult = {
    claimed: rows.length,
    sent: 0,
    retried: 0,
    failed: 0,
    settlementErrors: 0,
  };

  for (const row of rows) {
    let sendResult: EmailSendResult;
    try {
      sendResult = await sendEmail(
        buildMemberNewsletterEmail({
          recipientEmail: row.recipient_email,
          recipientDisplayName: row.recipient_display_name,
          preferredLocale: row.preferred_locale,
          campaignKind: row.campaign_kind,
          subject: row.subject,
          bodyText: row.body_text,
        }),
      );
    } catch (sendError: unknown) {
      sendResult = unexpectedSendFailure(sendError);
    }

    if (sendResult.success) {
      const completion = await supabase.rpc(
        "member_portal_worker_complete_newsletter_delivery",
        {
          p_delivery_id: row.delivery_id,
          p_claim_token: row.claim_token,
          p_provider: sendResult.provider,
          p_provider_message_id: sendResult.messageId ?? null,
        },
      );

      if (completion.error) {
        result.settlementErrors += 1;
        console.error(
          "[member-newsletter-worker] A sikeres provider-küldés DB-lezárása sikertelen.",
          {
            deliveryId: row.delivery_id,
            code: completion.error.code || "unknown",
          },
        );
      } else {
        result.sent += 1;
      }
      continue;
    }

    const retry = await supabase.rpc(
      "member_portal_worker_retry_newsletter_delivery",
      {
        p_delivery_id: row.delivery_id,
        p_claim_token: row.claim_token,
        p_provider: sendResult.provider,
        p_error: sanitizeProviderError(sendResult.error),
        p_max_attempts: maxAttempts,
        p_base_retry_seconds: baseRetrySeconds,
      },
    );

    if (retry.error) {
      result.settlementErrors += 1;
      console.error(
        "[member-newsletter-worker] A sikertelen provider-küldés DB-lezárása sikertelen.",
        { deliveryId: row.delivery_id, code: retry.error.code || "unknown" },
      );
      continue;
    }

    const retryPayload = retry.data as RetryResult | null;
    if (retryPayload?.delivery_status === "failed") result.failed += 1;
    else result.retried += 1;
  }

  return result;
}
