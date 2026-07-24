const endpoint = process.env.NEWSLETTER_WORKER_ENDPOINT?.trim();
const secret = process.env.NEWSLETTER_WORKER_SECRET?.trim();

if (!endpoint) {
  throw new Error("NEWSLETTER_WORKER_ENDPOINT nincs beállítva.");
}
if (!secret || secret.length < 32) {
  throw new Error("NEWSLETTER_WORKER_SECRET nincs beállítva vagy túl rövid.");
}

const url = new URL(endpoint);
if (
  url.protocol !== "https:" &&
  url.hostname !== "localhost" &&
  url.hostname !== "127.0.0.1"
) {
  throw new Error(
    "A NEWSLETTER_WORKER_ENDPOINT csak HTTPS lehet productionben.",
  );
}

const response = await fetch(url, {
  method: "POST",
  headers: {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  },
  body: "{}",
  signal: AbortSignal.timeout(240_000),
});

const responseText = await response.text();
let payload;
try {
  payload = JSON.parse(responseText);
} catch {
  payload = { ok: false, error: "A worker nem JSON választ adott." };
}

if (!response.ok || payload?.ok !== true) {
  console.error("[member-newsletter-cron] Sikertelen worker-futás.", {
    status: response.status,
    result: payload,
  });
  process.exitCode = 1;
} else {
  console.log("[member-newsletter-cron] Worker-futás kész.", payload);
}
