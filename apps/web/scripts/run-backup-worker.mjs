/**
 * NAPI BIZTONSÁGI MENTÉS — cron-indító (2026-08-11).
 *
 * A `run-member-newsletter-worker.mjs` mintájára. Railway → Settings →
 * Cron Schedule: `0 23 * * *` (= 02:00 Europe/Bucharest nyáron, 01:00 télen),
 * parancs: `node apps/web/scripts/run-backup-worker.mjs`.
 *
 * ⚠️ A szkript 1-es kilépési kóddal áll le, ha BÁRMELYIK gyülekezet mentése
 *    bukott. Ez azért fontos, mert a felületi figyelmeztető sávot csak az látja,
 *    aki belép — a cron-előzményben viszont PIROSAN látszik a bukás akkor is,
 *    ha hetekig senki nem nyitja meg az alkalmazást.
 */

const endpoint = process.env.BACKUP_WORKER_ENDPOINT?.trim();
const secret = process.env.BACKUP_WORKER_SECRET?.trim();

if (!endpoint) {
  throw new Error("BACKUP_WORKER_ENDPOINT nincs beállítva.");
}
if (!secret || secret.length < 32) {
  throw new Error("BACKUP_WORKER_SECRET nincs beállítva vagy túl rövid.");
}

const url = new URL(endpoint);
if (
  url.protocol !== "https:" &&
  url.hostname !== "localhost" &&
  url.hostname !== "127.0.0.1"
) {
  throw new Error("A BACKUP_WORKER_ENDPOINT csak HTTPS lehet productionben.");
}

// 15 perc: az országos futás gyülekezetenként titkosít, feltölt ÉS visszaolvas.
// A hírlevél-worker 240 másodperce itt kevés lenne, és a néma időtúllépés
// pontosan úgy nézne ki, mint egy sikertelen mentés — csak napló nélkül.
const response = await fetch(url, {
  method: "POST",
  headers: {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  },
  body: "{}",
  // ⚠️ NEM követjük az átirányítást: ha a proxy /login-ra terelne, a
  //    bejelentkező oldal 200-at adna HTML-lel, és a hiba oka („nincs proxy-
  //    kivétel az /api/internal/* alatt") elveszne a JSON-elemzési hibában.
  redirect: "manual",
  signal: AbortSignal.timeout(900_000),
});

const responseText = await response.text();
let payload;
if (response.status >= 300 && response.status < 400) {
  payload = {
    ok: false,
    error:
      "A worker helyett ÁTIRÁNYÍTÁS érkezett (" +
      response.status +
      " → " +
      (response.headers.get("location") || "ismeretlen cél") +
      "). A bejelentkezési proxy elterelte a gépi kérést: az /api/internal/* útvonalakat át kell engedni. MENTÉS NEM KÉSZÜLT.",
  };
} else {
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = {
      ok: false,
      error:
        "A worker nem JSON választ adott (" +
        response.status +
        ", content-type: " +
        (response.headers.get("content-type") || "ismeretlen") +
        "). MENTÉS NEM KÉSZÜLT.",
    };
  }
}

if (!response.ok || payload?.ok !== true) {
  const bukottak = Array.isArray(payload?.hatokorok)
    ? payload.hatokorok.filter((h) => h && h.ok !== true)
    : [];
  console.error("[backup-cron] SIKERTELEN mentés-futás.", {
    status: response.status,
    error: payload?.error,
    runDate: payload?.runDate,
    sikeres: payload?.sikeres,
    sikertelen: payload?.sikertelen,
    // NÉVVEL, hogy a cron-naplóból is látszódjon, MELYIK gyülekezet maradt ki.
    bukottak: bukottak.map((h) => `${h.nev || h.scope}: ${h.hiba || "ismeretlen"}`),
    figyelmeztetesek: payload?.figyelmeztetesek,
  });
  process.exitCode = 1;
} else {
  console.log("[backup-cron] Mentés-futás kész.", {
    runDate: payload.runDate,
    futott: payload.futott,
    sikeres: payload.sikeres,
    kihagyva: payload.kihagyva,
    figyelmeztetesek: payload.figyelmeztetesek,
  });
}
