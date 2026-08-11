import { createHash, timingSafeEqual } from "node:crypto";

import { KEZI_IDOKERET_MS, korlatokBeolvasasa } from "@/lib/backup/batch";
import { loadBackupKey } from "@/lib/backup/keys";
import { exportLepesek, mentesTeendo, ujFutasLepesek, vagd } from "@/lib/backup/steps";
import { BackupWorkerError, runBackupWorker } from "@/lib/backup/worker";

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

  // ── A SZELET KORLÁTAI ──────────────────────────────────────────────────────
  // A teljes országos futás (784 hatókör) EGY kérésbe nem fér bele. A hívó ezért
  // szeletet kér: mennyi ideig dolgozzon, és legfeljebb hány hatökörrel. A
  // korlátokat SZÁNDÉKOSAN itt is vágjuk (`korlatokBeolvasasa`) — a végpont
  // hitelesített, de egy elgépelt érték se tudja átvinni a 15 perces HTTP-korlátot.
  let torzs: Record<string, unknown> = {};
  try {
    const nyers: unknown = await request.json();
    if (nyers && typeof nyers === "object") torzs = nyers as Record<string, unknown>;
  } catch {
    // Üres vagy hibás törzs = alapértelmezett szelet. A cron „{}"-t küld.
  }
  const kezi = torzs.forras === "admin-felulet";
  const korlatok = korlatokBeolvasasa({
    nyersIdo: torzs.maxFutasiIdoMs ?? process.env.BACKUP_MAX_RUN_MS,
    nyersDarab: torzs.maxHatokor ?? process.env.BACKUP_MAX_SCOPES,
    // A felületről indított szelet RÖVIDEBB: a böngésző nem vár negyed órát, és
    // a haladás így láthatóan előre megy, ahelyett hogy egy pörgő ikon lenne.
    alapIdoMs: kezi ? KEZI_IDOKERET_MS : undefined,
  });

  try {
    const result = await runBackupWorker({
      maxFutasiIdoMs: korlatok.maxFutasiIdoMs,
      maxHatokor: korlatok.maxHatokor,
    });

    // ══════════════════════════════════════════════════════════════════════
    // KÉT KÜLÖN KÉRDÉS — KÉT KÜLÖN MEZŐ (2026-08-11 JAVÍTÁS)
    // ══════════════════════════════════════════════════════════════════════
    // Korábban itt `const ok = result.sikertelen === 0` állt, és a HTTP-státusz
    // is ebből lett. Vagyis EGYETLEN bukott gyülekezet 500-at adott, amire a
    // cron `break`-elt és a felületi ciklus `return`-ölt — a maradék ~700
    // hatókör mentése aznap ELMARADT. Mivel a napi kulcs csak az IGAZOLT
    // hatóköröket hagyja ki, egy TARTÓSAN bukó gyülekezet (túl nagy fájl, rossz
    // szűrő) minden éjjel ugyanott állította meg a futást: a cron 4 órányi
    // szelet-kerete helyett 10 percet dolgozott, és a rendszer SOHA nem ért
    // végig. Ez regresszió is volt: a szeletelés ELŐTT a hatökör-cikluson
    // belüli try/catch továbblépett, most a szeletek KÖZÖTT állt meg.
    //
    //   `ok`            = A SZELET elvégezte a dolgát (haladt). Ebből dönt a
    //                     hívó arról, kér-e még egy szeletet. HTTP 200.
    //   `mindenSikeres` = MINDEN hatókör sikerült. Ebből lesz a piros felület
    //                     és az 1-es cron kilépési kód — de NEM ebből lesz a
    //                     megállás.
    //
    // ⚠️ 500 KIZÁRÓLAG akkor jár, ha a szelet SEMMIT nem vitt el: akkor a
    //    következő szelet sem vinne, és a végtelen ciklus rosszabb a bevallott
    //    féleredménynél.
    const szeletHaladt = result.feldolgozva + result.kihagyva > 0;
    const mindenSikeres = result.sikertelen === 0;
    const ok = szeletHaladt;

    // A bukott hatókörök NÉVVEL — ez kell a cron-naplóba és a felületre. A
    // sikeres 780 sort SZÁNDÉKOSAN nem küldjük vissza: a részletek a
    // `backup_log`-ban vannak, és egy 784 elemű tömb csak elfedné a lényeget.
    const bukottak = result.hatokorok
      .filter((h) => h.ok !== true)
      .slice(0, 50)
      .map((h) => ({
        scope: h.scope,
        nev: h.congregationNev,
        ok: h.ok,
        kihagyva: h.kihagyva,
        sorok: h.totalRows,
        stage: h.stage,
        hiba: h.hiba ? vagd(h.hiba, 400) : null,
        // A hat lépés pipával/kereszttel — a felület ezt jeleníti meg.
        lepesek: exportLepesek(h.stage),
        teendo: h.hiba ? mentesTeendo(h.hiba).szoveg : null,
      }));

    return noStoreJson(
      {
        ok,
        // ⚠️ A SZELET sikere ≠ minden hatókör sikere. A hívó a folytatásról az
        //    `ok`/`hatralevo` alapján dönt, a piros jelentésről a
        //    `mindenSikeres`/`sikertelen` alapján.
        mindenSikeres,
        szeletHaladt,
        runDate: result.runDate,
        futott: result.futott,
        sikeres: result.sikeres,
        sikertelen: result.sikertelen,
        kihagyva: result.kihagyva,
        osszes: result.osszes,
        feldolgozva: result.feldolgozva,
        hatralevo: result.hatralevo,
        // ⚠️ Ennyi hatókört egy MÁSIK, éppen futó mentés tartott a kezében
        //    (bérlet a napló-soron). Nem kész és nem hibás — a `hatralevo`
        //    TARTALMAZZA. A hívó ebből tudja, hogy a megállás oka nem baj,
        //    hanem párhuzamosság.
        foglalt: result.foglalt,
        futottVegig: result.futottVegig,
        lepesek: result.lepesek,
        figyelmeztetesek: result.figyelmeztetesek,
        hatokorok: bukottak,
        // A bukás TÉNYE a törzsben megy — és KIMONDJA a következményét is,
        // hogy senki ne higgye késznek a mentést egy 200-as válasz láttán.
        error: !szeletHaladt
          ? "A szelet EGYETLEN hatókört sem vitt el (0 feldolgozott, 0 kihagyott). " +
            "Nem folytatjuk, mert a következő szelet sem vinne el semmit."
          : mindenSikeres
            ? undefined
            : `${result.sikertelen} hatókör mentése ELBUKOTT ebben a szeletben` +
              (result.hatralevo > 0
                ? `, és további ${result.hatralevo} hatókörhöz ez a szelet hozzá sem ért. ` +
                  "A futás FOLYTATÓDIK — a bukott hatóköröket a következő szelet újrapróbálja."
                : ". A futás minden más hatókörhöz hozzáért."),
      },
      // ⚠️ A HTTP-státusz a SZELET kimenetelét jelzi, NEM a hatókör-hibákét.
      //    500 csak akkor, ha a szelet semmit nem vitt el (különben a hívó
      //    megállna, és a maradék ~700 hatókör mentése elmaradna).
      ok ? 200 : 500,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    // A TELJES technikai szöveg a szerver-naplóba megy — ott nincs hosszkorlát.
    console.error("[backup] A futás sikertelen.", message);

    // ⚠️ 2026-08-11 JAVÍTÁS. Korábban innen CSAK az „A biztonsági mentés futása
    //    sikertelen." mondat ment ki, és a `reszlet`-et a hívó szerver-akció
    //    típusa nem is ismerte — vagyis a szerveren MEGLÉVŐ pontos diagnózist a
    //    saját kódunk rejtette el a tulajdonos elől. Mostantól megy a lépés-lista
    //    (meddig jutottunk), a teendő (mit tegyen) és a részlet (mi történt).
    const beszedes = error instanceof BackupWorkerError ? error : null;
    const teendo = beszedes ? beszedes.teendo : mentesTeendo(message).szoveg;
    return noStoreJson(
      {
        ok: false,
        mindenSikeres: false,
        szeletHaladt: false,
        futottVegig: false,
        error: "A biztonsági mentés futása sikertelen.",
        reszlet: vagd(message, 600),
        teendo,
        sqlFajl: beszedes ? beszedes.sqlFajl : mentesTeendo(message).sql,
        lepesek: beszedes ? beszedes.lepesek : ujFutasLepesek(),
      },
      500,
    );
  }
}
