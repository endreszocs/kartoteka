/**
 * NAPI BIZTONSÁGI MENTÉS — cron-indító (2026-08-11).
 *
 * A `run-member-newsletter-worker.mjs` mintájára. Railway → Settings →
 * Cron Schedule: `17 2 * * *`, parancs: `node apps/web/scripts/run-backup-worker.mjs`.
 *
 * ⚠️ A RAILWAY CRON UTC-BEN JÁR („schedules are based on UTC"), nem romániai
 *    időben. A `17 2 * * *` tehát NYÁRON 05:17, TÉLEN 04:17 Bukarestben — a
 *    Railway nem ismer időzónát, így a futás évente kétszer egy órát vándorol.
 *    A mentésnek ez nem számít; a félrevezető dokumentáció viszont igen, ezért
 *    áll itt a valós érték. (A repóban korábban HÁROM, egymásnak ellentmondó
 *    cron-állítás volt — ez a fájl, a telepítési útmutató és a selftest.)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SZELETEKBEN FUT — MERT 784 HATÓKÖR EGY KÉRÉSBE NEM FÉR BELE (2026-08-11)
 * ════════════════════════════════════════════════════════════════════════════
 * 783 aktív gyülekezet + a rendszerszintű hatókör mentése nagyságrendileg
 * 150 000 adatbázis-körfordulás — órákban mérve. Egyetlen HTTP-kérés ennyit
 * nem bír el, és amikor elvágódik, félúton hagyja a munkát: a napló-sorok „fut"
 * állapotban ragadnak, a cron pedig egyetlen semmitmondó hibát ír.
 *
 * Ezért ez a szkript SZELETEKBEN kéri a mentést. Minden hívás annyit dolgozik,
 * amennyi az időkeretbe belefér, majd megmondja, MENNYI MARADT (`hatralevo`).
 * A napi kulcs (`backup_log` egyedi indexe) miatt a következő szelet pontosan
 * ott folytatja, ahol az előző abbahagyta — külön „folytatási token" nélkül.
 *
 * ⚠️ AZ ELKÉSZÜLT MENTÉSEK SOHA NEM VESZNEK EL. Minden hatókör a saját napló-
 *    sorát kapja, és lezárul, MIELŐTT a következő elindulna. Egy 300-nál
 *    elakadt futás 300 IGAZOLT mentést hagy maga után, nem nullát.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EGY BUKOTT GYÜLEKEZET NEM ÁLLÍTHATJA MEG A TÖBBI 783-AT (2026-08-11 JAVÍTÁS)
 * ════════════════════════════════════════════════════════════════════════════
 * A szelet-ciklus korábban `break`-elt, ha a válasz `ok: false` volt — a végpont
 * pedig `ok: false`-t (500-at) adott, ha BÁRMELYIK hatökör elbukott a szeletben.
 * A kettő együtt azt jelentette, hogy EGYETLEN tartósan bukó gyülekezet (túl nagy
 * fájl, elrontott szűrő) minden éjjel ugyanott állította meg a futást: a cron a
 * 4 órányi keretéből 10 percet dolgozott, és a maradék ~700 hatókörhöz HOZZÁ SEM
 * ÉRT. Éjszakáról éjszakára ugyanaz, mert a `run_date` váltásával a nap újraindul.
 *
 * Mostantól két külön fogalom van:
 *   · `payload.ok`            — a SZELET elvégezte a dolgát (haladt) → FOLYTATJUK,
 *   · `payload.mindenSikeres` — MINDEN hatókör sikerült → csak a kilépési kódot
 *                               és a napló színét dönti el, a folytatást NEM.
 *
 * KIVÉTEL — hogy egy rendszerszintű baj (halott Drive, lejárt token) ne
 * generáljon 784 hibát és 784 riasztó levelet: ha egy szelet NULLA sikerrel és
 * legalább egy bukással zárul, MEGÁLLUNK, és ezt ki is mondjuk a naplóban.
 *
 * ⚠️ A szkript 1-es kilépési kóddal áll le, ha BÁRMELYIK gyülekezet mentése
 *    bukott, VAGY ha a futás nem ért végig. Ez azért fontos, mert a felületi
 *    figyelmeztető sávot csak az látja, aki belép — a cron-előzményben viszont
 *    PIROSAN látszik a bukás akkor is, ha hetekig senki nem nyitja meg az appot.
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

/**
 * Ennyi szeletnél tovább egy éjszakai futás nem megy.
 *
 * ⚠️ MIÉRT KELL FELSŐ KORLÁT. Ha egy hatókör TARTÓSAN bukik, a hátralévők
 *    száma nem csökkenne, és a cron a végtelenségig hívogatná a szervert. A
 *    korlát inkább bevallja a féleredményt — a végtelen ciklus rosszabb.
 *    24 szelet × 10 perc ≈ 4 óra: bőven elég 784 hatókörre.
 */
const MAX_SZELET = Number(process.env.BACKUP_MAX_SZELET || 24);

/** Egy szelet lefuttatása. Fail-closed: minden nem-JSON válasz HIBA. */
async function futtatSzelet() {
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
  return { response, payload };
}

/** A bukott hatókörök NÉVVEL — a cron-naplóból is látszódjon, KI maradt ki. */
function bukottNevek(payload) {
  const lista = Array.isArray(payload?.hatokorok)
    ? payload.hatokorok.filter((h) => h && h.ok !== true && h.kihagyva !== true)
    : [];
  return lista.map((h) => `${h.nev || h.scope}: ${h.hiba || "ismeretlen"}`);
}

let osszSikeres = 0;
/**
 * Ennyi hatókör MÁR AZELŐTT kész volt, hogy ez a futás elindult — az ELSŐ szelet
 * értéke, rögzítve.
 *
 * ⚠️ NEM ÖSSZEADVA. Minden szelet a MAI NAP EGÉSZÉT látja, tehát a 2. szelet
 *    `kihagyva` mezőjében már benne vannak az 1. szelet SAJÁT sikerei is —
 *    összeadva a napló többet mutatna késznek, mint amennyi hatókör egyáltalán
 *    létezik.
 */
let korabbanKesz = null;
/**
 * A bukott hatókörök száma az UTOLSÓ szeletből.
 *
 * ⚠️ NEM ÖSSZEADVA. A napi kulcs csak az IGAZOLT hatóköröket hagyja ki, tehát egy
 *    korábban elbukott gyülekezetet MINDEN következő szelet újrapróbál — az
 *    összeg így sokszorosan számolna ugyanarra a gyülekezetre.
 */
let utolsoSikertelen = 0;
/** Volt-e BÁRMIKOR bukott hatókör? Ebből lesz az 1-es kilépési kód. */
let voltBukas = false;
let utolso = null;
let vegigment = false;

for (let szelet = 1; szelet <= MAX_SZELET; szelet++) {
  const { response, payload } = await futtatSzelet();
  utolso = payload;

  // ── (1) A SZELET MAGA bukott el (hitelesítés, előkészítő fázis, átirányítás,
  //        nem-JSON válasz, vagy „a szelet semmit nem vitt el"). Itt tényleg
  //        nincs értelme folytatni: a következő szelet ugyanebbe futna bele.
  if (!response.ok || payload?.ok !== true) {
    console.error("[backup-cron] A SZELET NEM FUTOTT LE.", {
      szelet,
      status: response.status,
      error: payload?.error,
      // ⚠️ 2026-08-11: EZ A MEZŐ HIÁNYZOTT. A végpont a `reszlet`-ben küldi a
      //    VALÓDI okot (pl. „BESOROLATLAN ÉLŐ TÁBLA (17 db): …"), a cron-napló
      //    viszont csak a semmitmondó `error`-t írta ki — vagyis a diagnózis
      //    ugyanúgy elveszett éjjel, mint a felületen nappal.
      reszlet: payload?.reszlet,
      teendo: payload?.teendo,
      sqlFajl: payload?.sqlFajl,
      // Meddig jutott a futás: melyik lépésnél állt meg. (KIZÁRÓLAG a szigorú
      // `=== false` a bukás — a „folyamatban" és a „figyelmeztetés" nem az.)
      megallt: Array.isArray(payload?.lepesek)
        ? (payload.lepesek.find((l) => l && l.ok === false)?.cimke ?? "ismeretlen lépés")
        : undefined,
      runDate: payload?.runDate,
      sikeres: payload?.sikeres,
      sikertelen: payload?.sikertelen,
      bukottak: bukottNevek(payload),
      figyelmeztetesek: payload?.figyelmeztetesek,
    });
    process.exitCode = 1;
    break;
  }

  osszSikeres += Number(payload.sikeres || 0);
  if (korabbanKesz === null) korabbanKesz = Number(payload.kihagyva || 0);
  utolsoSikertelen = Number(payload.sikertelen || 0);

  const hatralevo = Number(payload.hatralevo || 0);
  console.log("[backup-cron] Szelet kész.", {
    szelet,
    runDate: payload.runDate,
    sikeres: payload.sikeres,
    kihagyva: payload.kihagyva,
    sikertelen: payload.sikertelen,
    // Ennyi hatókört egy MÁSIK futás tartott a kezében (pl. a tulajdonos épp a
    // felületről indított mentést). Nem hiba — a következő szelet újrapróbálja.
    foglalt: payload.foglalt,
    hatralevo,
    osszes: payload.osszes,
  });

  // ── (2) BUKOTT HATÓKÖRÖK — feljegyezzük, DE NEM ÁLLUNK MEG. Egyetlen tartósan
  //        bukó gyülekezet nem foszthatja meg a másik 783-at a mentéstől.
  if (utolsoSikertelen > 0) {
    voltBukas = true;
    console.error("[backup-cron] Bukott hatókörök ebben a szeletben — FOLYTATJUK.", {
      szelet,
      sikertelen: utolsoSikertelen,
      hatralevo,
      bukottak: bukottNevek(payload),
    });

    // ⛔ KIVÉTEL: NULLA siker + volt bukás = rendszerszintű baj (halott Drive,
    //    lejárt token, elérhetetlen adatbázis). Ilyenkor a folytatás 784 hibát
    //    és 784 riasztó levelet generálna — megállunk, és KIMONDJUK, miért.
    if (Number(payload.sikeres || 0) === 0) {
      console.error(
        "[backup-cron] A szelet EGYETLEN hatókört sem tudott lementeni, viszont " +
          `${utolsoSikertelen} elbukott. Ez rendszerszintű baj (tároló, hálózat vagy ` +
          "adatbázis), nem egy gyülekezet gondja — MEGÁLLUNK, hogy ne generáljunk " +
          "több száz riasztást. " +
          `${hatralevo} hatókör mentése MA ELMARADT.`,
        { szelet, bukottak: bukottNevek(payload) },
      );
      process.exitCode = 1;
      break;
    }
  }

  if (payload.futottVegig === true || hatralevo <= 0) {
    vegigment = true;
    break;
  }

  // ⚠️ HALADÁS-FELTÉTEL — A `sikeres` A MÉRVADÓ (2026-08-11, 2. menet).
  //    Először `feldolgozva + kihagyva` volt, aztán `feldolgozva`. Egyik sem a
  //    haladást mérte:
  //      · a `kihagyva` egy FOLYTATÁSNÁL mindig nagy (a mai már kész hatókörök),
  //      · a `feldolgozva` a BUKOTT hatókört is számolja.
  //    A KÖVETKEZŐ SZELET LISTÁJÁT viszont KIZÁRÓLAG a siker szűkíti: a
  //    folytatási pont csak az `ok` + `drive_verified_at` sorokból épül. Egy
  //    csupa-bukás szelet tehát ugyanazt a listát kezdené elölről, a
  //    végtelenségig. Ugyanez a feltétel áll a `batch.ts` `kellMegSzelet`
  //    függvényében és a felületi felügyelőben — a három út SOHA nem sodródhat
  //    szét. A `hatralevo > 0` kikötés kell hozzá: a „minden kész" eset is 0
  //    sikerrel zárul, de az nem megállás, hanem BEFEJEZÉS (azt a fenti ág már
  //    elkapta).
  if (Number(payload.sikeres || 0) === 0 && hatralevo > 0) {
    console.error(
      "[backup-cron] A szelet NEM HALADT: egyetlen hatókör mentése sem KÉSZÜLT EL. " +
        "Megállunk, hogy ne pörögjön végtelen ciklusban ugyanazon a listán.",
      {
        szelet,
        hatralevo,
        feldolgozva: payload.feldolgozva,
        sikertelen: payload.sikertelen,
        foglalt: payload.foglalt,
      },
    );
    process.exitCode = 1;
    break;
  }
}

if (process.exitCode !== 1) {
  if (!vegigment) {
    // ⚠️ A BEFEJEZETLEN FUTÁS NEM ZÖLD. Ha a szelet-korlát elfogyott és maradt
    //    hatókör, azt KIMONDJUK — különben a cron-előzmény zöld lenne, miközben
    //    gyülekezetek maradtak mentés nélkül.
    console.error("[backup-cron] A futás NEM ÉRT VÉGIG.", {
      szeletKorlat: MAX_SZELET,
      sikeres: osszSikeres,
      kihagyva: korabbanKesz ?? 0,
      sikertelen: utolsoSikertelen,
      hatralevo: utolso?.hatralevo,
      figyelmeztetesek: utolso?.figyelmeztetesek,
    });
    process.exitCode = 1;
  } else if (utolsoSikertelen > 0) {
    // ⚠️ TARTÓSAN bukott hatókörök: az utolsó szelet is újrapróbálta őket (a napi
    //    kulcs csak az IGAZOLTAT hagyja ki), és megint elbuktak. Ezek MA nem
    //    kaptak mentést — NÉVVEL a naplóba.
    process.exitCode = 1;
    console.error("[backup-cron] A futás VÉGIGMENT, de MARADTAK bukott hatókörök.", {
      sikeres: osszSikeres,
      kihagyva: korabbanKesz ?? 0,
      sikertelen: utolsoSikertelen,
      bukottak: bukottNevek(utolso),
      figyelmeztetesek: utolso?.figyelmeztetesek,
    });
  } else if (voltBukas) {
    // ⚠️ ÁTMENETI bukás: volt bukott hatókör, de egy KÉSŐBBI szelet újrapróbálta,
    //    és sikerült — a mentés TELJES. A kilépési kód mégis 1, mert erről a
    //    tulajdonos kapott riasztó levelet, és a cron-előzménynek egyeznie kell
    //    azzal, amit a levélben olvasott.
    process.exitCode = 1;
    console.error(
      "[backup-cron] A futás VÉGIGMENT, minden hatókör mentése MEGVAN — de közben " +
        "volt átmeneti bukás (az újrapróbálás sikerült).",
      {
        sikeres: osszSikeres,
        kihagyva: korabbanKesz ?? 0,
        figyelmeztetesek: utolso?.figyelmeztetesek,
      },
    );
  } else {
    console.log("[backup-cron] Mentés-futás kész.", {
      runDate: utolso?.runDate,
      osszes: utolso?.osszes,
      sikeres: osszSikeres,
      kihagyva: korabbanKesz ?? 0,
      figyelmeztetesek: utolso?.figyelmeztetesek,
    });
  }
}
