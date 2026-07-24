import { createHash, timingSafeEqual } from "node:crypto";

import { runMemberNewsletterWorker } from "@/lib/email/member-newsletter-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function secureTokenEquals(candidate: string, expected: string): boolean {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

function isAuthorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const candidate = authorization.slice("Bearer ".length).trim();
  return candidate.length > 0 && secureTokenEquals(candidate, secret);
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.NEWSLETTER_WORKER_SECRET?.trim() || "";
  if (secret.length < 32) {
    console.error(
      "[member-newsletter-worker] NEWSLETTER_WORKER_SECRET hiányzik vagy túl rövid.",
    );
    return noStoreJson({ ok: false, error: "Worker nincs konfigurálva." }, 503);
  }

  if (!isAuthorized(request, secret)) {
    return noStoreJson({ ok: false, error: "Unauthorized." }, 401);
  }

  try {
    const result = await runMemberNewsletterWorker();
    const ok = result.settlementErrors === 0;
    return noStoreJson({ ok, ...result }, ok ? 200 : 500);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      "[member-newsletter-worker] A batch feldolgozása sikertelen.",
      message,
    );
    return noStoreJson(
      { ok: false, error: "A worker futása sikertelen." },
      500,
    );
  }
}
