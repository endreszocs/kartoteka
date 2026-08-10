import { createHash, timingSafeEqual } from "node:crypto";

import { runExpiryReminderWorker } from "@/lib/dashboard/expiry-reminder-worker";

/**
 * HETI LEJÁRAT-EMLÉKEZTETŐ worker — 2026-08-11.
 *
 * POST /api/internal/expiry-reminders
 *   Authorization: Bearer <EXPIRY_REMINDER_SECRET>
 *
 * A védelem BIT-AZONOS az `app/api/internal/member-newsletters/route.ts`
 * mintájával (Bearer + SHA-256 + `timingSafeEqual`): szándékosan NINCS új
 * hitelesítési séma. A hash-elés azért kell, mert a `timingSafeEqual` eltérő
 * hosszú puffereknél dobna — a fix hosszú digest ezt kizárja, és a hosszból
 * sem szivárog információ.
 *
 * Heti ütemezés (bármelyik külső ütemezővel — Vercel Cron, GitHub Actions,
 * cron + curl). Az idempotencia a workerben van: egy ISO-héten belüli második
 * futás NEM ír második értesítést, tehát a többszöri hívás ártalmatlan.
 */

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
  const secret = process.env.EXPIRY_REMINDER_SECRET?.trim() || "";
  if (secret.length < 32) {
    console.error(
      "[expiry-reminders] EXPIRY_REMINDER_SECRET hiányzik vagy túl rövid (min. 32 karakter).",
    );
    return noStoreJson({ ok: false, error: "Worker nincs konfigurálva." }, 503);
  }

  if (!isAuthorized(request, secret)) {
    return noStoreJson({ ok: false, error: "Unauthorized." }, 401);
  }

  try {
    const result = await runExpiryReminderWorker();
    // Ha akár EGY gyülekezetnél is elhasalt a számítás, a válasz NEM ok —
    // különben az ütemező „zöld" futást látna, miközben lelkészek maradtak
    // értesítés nélkül. A néma féleredmény a legrosszabb kimenet.
    const ok = result.failed === 0;
    return noStoreJson({ ok, ...result }, ok ? 200 : 500);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[expiry-reminders] A futás sikertelen.", message);
    return noStoreJson(
      { ok: false, error: "A lejárat-emlékeztető futása sikertelen." },
      500,
    );
  }
}
