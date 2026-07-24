import "server-only";

import type { EmailSendArgs } from "../types";

export type MemberNewsletterLocale = "hu" | "ro" | "en";

export interface MemberNewsletterEmailInput {
  recipientEmail: string;
  recipientDisplayName: string;
  preferredLocale: MemberNewsletterLocale;
  campaignKind: "general" | "announcements" | "events";
  subject: string;
  bodyText: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const footerByLocale: Record<MemberNewsletterLocale, string> = {
  hu: "Azért kapta ezt a levelet, mert a gyülekezeti tagi portálon hozzájárult a hírlevelek fogadásához. Beállításait bármikor módosíthatja a tagi portálon.",
  ro: "Ați primit acest mesaj deoarece ați acceptat buletinele informative în portalul membrilor parohiei. Preferințele pot fi modificate oricând în portal.",
  en: "You received this message because you opted in to newsletters in the congregation member portal. You can change your preferences in the portal at any time.",
};

/**
 * A lelkipásztor által írt tárgy és törzs kizárólag szövegként kerül a levélbe.
 * Az escape kötelező: a kampány törzse nem megbízható HTML-forrás.
 */
export function buildMemberNewsletterEmail(
  input: MemberNewsletterEmailInput,
): EmailSendArgs {
  const safeSubject = escapeHtml(input.subject);
  const safeBody = escapeHtml(input.bodyText).replaceAll("\n", "<br>");
  const footer = footerByLocale[input.preferredLocale];

  const html = `<!doctype html>
<html lang="${input.preferredLocale}">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,'Segoe UI',sans-serif;color:#1e293b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:24px 28px;background:#0f766e;color:#ffffff;">
            <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">Gyülekezeti hírlevél</div>
            <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;">${safeSubject}</h1>
          </td></tr>
          <tr><td style="padding:28px;font-size:16px;line-height:1.7;overflow-wrap:anywhere;word-break:break-word;">
            ${safeBody}
          </td></tr>
          <tr><td style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.6;">
            ${escapeHtml(footer)}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return {
    to: {
      email: input.recipientEmail,
      name: input.recipientDisplayName,
    },
    subject: input.subject,
    text: `${input.bodyText}\n\n---\n${footer}`,
    html,
    tags: ["member-newsletter", input.campaignKind],
  };
}
