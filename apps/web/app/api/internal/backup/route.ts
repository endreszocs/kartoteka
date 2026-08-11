import { createHash, timingSafeEqual } from "node:crypto";

import { loadBackupKey } from "@/lib/backup/keys";
import { runBackupWorker } from "@/lib/backup/worker";

/**
 * NAPI BIZTONSÁGI MENTÉS worker — 2026-08-11.
 *
 * POST /api/internal/backup
 *   Authorization: Bearer <BACKUP_WORKER_SECRET>
 *
 * A védelem BIT-AZONOS az `app/api/internal/expiry-reminders/route.ts` és a
 * `.../member-newsletters/route.ts` mintájával (Bearer + SHA-256 +
 * `timingSafeEqual`): szándékosan NINCS új hitelesítési séma. A hash-elés azért
 * kell, mert a `timingSafeEqual` eltérő hosszú puffereknél dobna — a fix hosszú
 * digest ezt kizárja, és a hosszból sem szivárog információ.
 *
 * ⚠️ HOSZTING-FÜGGETLEN: a végpont bármelyik ütemezővel hívható (Railway cron,
 *    GitHub Actions, cron + curl). A Railway beépített cronja csak az EGYIK
 *    lehetséges hívó — a mentés nem köthető egyetlen szolgáltatóhoz.
 *
 * ✅ ELŐFELTÉTEL — TELJESÍTVE (2026-08-11): a `lib/supabase/middleware.ts`
 *    `isInternalWorkerRoute()` ága átengedi az `/api/internal/*` útvonalakat.
 *    Enélkül a böngésző-session nélküli gépi kérés `/login`-ra terelődött, és a
 *    cron NÉMÁN semmit sem csinált — a napi mentés egyáltalán nem futott le.
 *    Ellenőrzés élesben:
 *      curl -i -X POST -H 'Authorization: Bearer <titok>' \
 *           https://kartoteka.app/api/internal/backup
 *    JSON törzsnek kell jönnie; HTML vagy 307 = a kivétel nincs élesben.
 *
 * ⚠️ NINCS „BEKÖTENDŐ" GYÁR ÉS NINCS „BEKÖTENDŐ" RIASZTÓ.
 *    Korábban itt kellett volna meghívni a `setBackupStorageFactory(...)` és a
 *    `setBackupAlerter(...)` függvényeket. Ezek a hívások soha nem születtek meg,
 *    és emiatt (a) minden mentés a Supabase Storage-ba került, miközben a
 *    felület Drive-ot mutatott, (b) egyetlen bukott mentésről sem ment e-mail
 *    és harang. Ezért a döntés MOST az alapértelmezésben van:
 *      · tároló  → `lib/backup/storage.ts` → `resolveBackupStorage()`
 *                  (Drive, ha össze van kötve; különben Supabase Storage, és
 *                   a napló + a fájl fejléce rögzíti, MELYIK volt),
 *      · riasztó → `lib/backup/worker.ts` → `aktivRiaszto()` →
 *                  `lib/backup/alerts.ts` (e-mail + harang).
 *    A `set*` függvények megmaradtak, de kizárólag TESZTELÉSRE.
 *
 * ⚠️ HÁROM KÜLÖN TITOK: `BACKUP_WORKER_SECRET` (ki indíthat) ≠
 *    `BACKUP_ENCRYPTION_KEY` (az adat titkosítása) ≠ Drive refresh token.
 *    Ennek a titoknak a kiszivárgása csak annyit ér, hogy valaki mentést tud
 *    INDÍTANI — olvasni NEM.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A teljes országos futás sokáig tart (gyülekezetenként több MB titkosítása és
// visszaolvasása). A hírlevél-worker 240 másodperce itt kevés lenne.
export const maxDuration = 900;

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

  // ⛔ FAIL CLOSED: titkosítási kulcs nélkül EL SEM INDULUNK. Nincs fallback,
  //    nincs „majd titkosítatlanul". Inkább ne legyen mentés, mint hogy legyen
  //    egy visszafejthető — a fájlok személyes adatot és CNP-t tartalmaznak.
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

  try {
    const result = await runBackupWorker();

    // Ha akár EGY hatókör is elhasalt, a válasz NEM ok — különben az ütemező
    // „zöld" futást látna, miközben gyülekezetek maradtak mentés nélkül.
    // A néma féleredmény a legrosszabb kimenet.
    const ok = result.sikertelen === 0;

    return noStoreJson(
      {
        ok,
        runDate: result.runDate,
        futott: result.futott,
        sikeres: result.sikeres,
        sikertelen: result.sikertelen,
        kihagyva: result.kihagyva,
        figyelmeztetesek: result.figyelmeztetesek,
        // A részletek a `backup_log`-ban vannak; itt csak annyi, amiből a cron
        // naplójában látszik, MELYIK gyülekezet maradt ki, NÉVVEL.
        hatokorok: result.hatokorok.map((h) => ({
          scope: h.scope,
          nev: h.congregationNev,
          ok: h.ok,
          kihagyva: h.kihagyva,
          sorok: h.totalRows,
          stage: h.stage,
          hiba: h.hiba,
        })),
      },
      ok ? 200 : 500,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[backup] A futás sikertelen.", message);
    return noStoreJson(
      { ok: false, error: "A biztonsági mentés futása sikertelen.", reszlet: message },
      500,
    );
  }
}
