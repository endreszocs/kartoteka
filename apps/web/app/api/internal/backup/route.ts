import { createHash, timingSafeEqual } from "node:crypto";

import { loadBackupKey } from "@/lib/backup/keys";
import {
  getBackupRunAllapot,
  startBackupRun,
  type BackupRunAllapot,
} from "@/lib/backup/supervisor";

/**
 * NAPI BIZTONSÁGI MENTÉS worker — 2026-08-11, ÁTÁLLÍTVA 2026-08-14.
 *
 * POST /api/internal/backup   → ELINDÍTJA a mentést, AZONNAL válaszol (202)
 * GET  /api/internal/backup   → a futás állapota (fut-e, haladás, hiba)
 *   Authorization: Bearer <BACKUP_WORKER_SECRET>  (mindkettőn)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 2026-08-14: MIÉRT NEM A KÉRÉSBEN FUT A SZELET — MÉRT ESET, NEM ELMÉLET
 * ════════════════════════════════════════════════════════════════════════════
 * Az első éles ütemezett futás (GitHub Actions, 04:19 UTC) HTTP 524-gyel
 * bukott: a kérés 125 másodpercig futott, és a kartoteka.app előtt ülő
 * Cloudflare ~100 másodpercnél MINDEN kérést elvág — a szelet 10 perces
 * időkerete tehát SOHA nem érhetett véget egy HTTP-kérésen belül. Ugyanezt a
 * leckét a felület már megtanulta (lib/backup/supervisor.ts fejléce): „a munka
 * ne egy HTTP-kérésben lakjon". Mostantól a cron is a supervisor leválasztott
 * háttér-ciklusát indítja — a POST ezredmásodpercek alatt válaszol, proxy-
 * időkorlát nem érheti utol. A hívó (napi-mentes.yml) az indítás után RÖVIDEN
 * pollozza a GET-et: a korai, rendszerszintű hibát (nincs kulcs, halott
 * tároló) hangosan jelzi, a hosszú futás befejezését pedig az admin →
 * Biztonsági mentés oldal és az őrszem-riasztás igazolja.
 *
 * A védelem BIT-AZONOS az `app/api/internal/expiry-reminders/route.ts` és a
 * `.../member-newsletters/route.ts` mintájával (Bearer + SHA-256 +
 * `timingSafeEqual`): szándékosan NINCS új hitelesítési séma. A hash-elés azért
 * kell, mert a `timingSafeEqual` eltérő hosszú puffereknél dobna — a fix hosszú
 * digest ezt kizárja, és a hosszból sem szivárog információ.
 *
 * ⚠️ HOSZTING-FÜGGETLEN: a végpont bármelyik ütemezővel hívható (GitHub
 *    Actions, cron + curl). A futás maga a Node-folyamatban él — ez azért
 *    működik, mert saját szerverünk van (`output: 'standalone'`, `next start`);
 *    lásd a supervisor fejlécének figyelmeztetését.
 *
 * ✅ ELŐFELTÉTEL — TELJESÍTVE (2026-08-11): a `lib/supabase/middleware.ts`
 *    `isInternalWorkerRoute()` ága átengedi az `/api/internal/*` útvonalakat.
 *    Enélkül a böngésző-session nélküli gépi kérés `/login`-ra terelődött, és a
 *    cron NÉMÁN semmit sem csinált.
 *
 * ⚠️ NINCS „BEKÖTENDŐ" GYÁR ÉS NINCS „BEKÖTENDŐ" RIASZTÓ: a tároló a
 *    `resolveBackupStorage()` (Drive, ha össze van kötve), a riasztó az
 *    `aktivRiaszto()` (e-mail + harang) — a döntés az alapértelmezésben van.
 *
 * ⚠️ HÁROM KÜLÖN TITOK: `BACKUP_WORKER_SECRET` (ki indíthat) ≠
 *    `BACKUP_ENCRYPTION_KEY` (az adat titkosítása) ≠ Drive refresh token.
 *    Ennek a titoknak a kiszivárgása csak annyit ér, hogy valaki mentést tud
 *    INDÍTANI vagy az állapotát látni — olvasni a mentéseket NEM.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Az indítás és az állapot-olvasás ezredmásodpercek — a régi 900 mp-es keret a
// kérésben-futó szelethez kellett (2026-08-14 előtt), az a modell megszűnt.
export const maxDuration = 60;

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

/** Közös kapu: hibánál Response-t ad, rendben esetén null-t. */
function hitelesites(request: Request): Response | null {
  const secret = process.env.BACKUP_WORKER_SECRET?.trim() || "";
  if (secret.length < 32) {
    console.error(
      "[backup] BACKUP_WORKER_SECRET hiányzik vagy túl rövid (min. 32 karakter).",
    );
    return noStoreJson({ ok: false, error: "Worker nincs konfigurálva." }, 503);
  }
  if (!isAuthorized(request, secret)) {
    return noStoreJson({ ok: false, error: "Unauthorized." }, 401);
  }
  return null;
}

/**
 * A cron-naplóba szánt tömör állapot. A teljes részletesség (lépés-listák,
 * teendők) az admin → Biztonsági mentés oldalé — ide a döntéshez elég jel megy.
 */
function tomorAllapot(a: BackupRunAllapot) {
  return {
    fut: a.fut,
    runDate: a.runDate,
    indultAt: a.indultAt,
    vegzettAt: a.vegzettAt,
    szelet: a.szelet,
    sikeres: a.sikeres,
    sikertelen: a.sikertelen,
    korabbanKesz: a.korabbanKesz,
    hatralevo: a.hatralevo,
    foglalt: a.foglalt,
    befejezesOka: a.befejezesOka,
    utolsoHiba: a.utolsoHiba,
    figyelmeztetesek: a.figyelmeztetesek.slice(0, 10),
    bukottak: a.bukottak.slice(0, 10),
  };
}

export async function POST(request: Request): Promise<Response> {
  const kapu = hitelesites(request);
  if (kapu) return kapu;

  // ⛔ FAIL CLOSED: titkosítási kulcs nélkül EL SEM INDULUNK. Nincs fallback,
  //    nincs „majd titkosítatlanul". Inkább ne legyen mentés, mint hogy legyen
  //    egy visszafejthető — a fájlok személyes adatot és CNP-t tartalmaznak.
  //    Itt ellenőrizzük (nem a háttérben), hogy a hívó HANGOS hibát kapjon.
  try {
    loadBackupKey();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "ismeretlen";
    console.error("[backup] A titkosítási kulcs nem tölthető be.", message);
    return noStoreJson(
      { ok: false, error: "A mentés titkosítási kulcsa nincs beállítva." },
      503,
    );
  }

  const indulas = startBackupRun();
  return noStoreJson(
    {
      ok: true,
      // `false` = már futott egy mentés ebben a folyamatban — nem indítottunk
      // másodikat. Ez nem hiba: a hívó ugyanúgy az állapotot figyeli tovább.
      inditva: indulas.indult,
      allapot: tomorAllapot(indulas.allapot),
    },
    202,
  );
}

export async function GET(request: Request): Promise<Response> {
  const kapu = hitelesites(request);
  if (kapu) return kapu;
  return noStoreJson({ ok: true, allapot: tomorAllapot(getBackupRunAllapot()) }, 200);
}
