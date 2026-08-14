/**
 * NAPI BIZTONSÁGI MENTÉS — cron-indító (2026-08-11, ÁTÍRVA 2026-08-15).
 *
 * Railway → Settings → Cron Schedule: `17 2 * * *`,
 * parancs: `node apps/web/scripts/run-backup-worker.mjs`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 2026-08-15 JAVÍTÁS — EZ A SZKRIPT NULLA MENTÉSRE „KÉSZ"-T JELENTETT
 * ════════════════════════════════════════════════════════════════════════════
 * A végpont 2026-08-14 óta a supervisor-modellt beszéli: a POST már NEM futtat
 * szeletet, hanem ELINDÍTJA a szerveren a futást, és 202-vel, `{ ok, inditva,
 * allapot }` törzzsel azonnal visszatér. Ez a szkript viszont még a RÉGI
 * szelet-mezőket (`sikeres`, `hatralevo`, `futottVegig`) olvasta — amik ebben a
 * válaszban NINCSENEK BENNE. A `Number(undefined || 0)` mindegyikre 0-t adott,
 * a `hatralevo <= 0` ág pedig ezt „nincs több munka"-ként értelmezte: a szkript
 * az ELSŐ kör után „végigment, kész"-t naplózott és 0-s (ZÖLD) kilépési kóddal
 * állt le — MIKÖZBEN EGYETLEN GYÜLEKEZET MENTÉSE SEM KÉSZÜLT EL, sőt a futás
 * még el sem kezdődött igazán.
 *
 * A következménye a lehető legrosszabb fajta: a napi mentés hetekig elmaradhat,
 * és a cron-előzményben végig zöld pipa áll. Egy néma hiba a mentésnél annyit
 * ér, mintha mentés sem volna — a baj akkor derülne ki, amikor már vissza
 * kellene állítani.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIT CSINÁL MOSTANTÓL: INDÍT, MAJD VÉGIG FIGYEL
 * ════════════════════════════════════════════════════════════════════════════
 *   1) POST  → elindítja a futást a szerveren (ezredmásodpercek alatt válaszol),
 *   2) GET   → félpercenként megkérdezi az állapotot, amíg a futás véget nem ér,
 *   3) a VÉGÁLLAPOTBÓL dönt: 0-s kilépési kód KIZÁRÓLAG akkor, ha a futás
 *      `kesz` okkal ért véget, nem maradt bukott hatókör, ÉS a mai napra
 *      tényleg van elkészült mentés.
 *
 * ⚠️ A HTTP-STÁTUSZKÓDOT MINDIG A TÖRZS FELDOLGOZÁSA ELŐTT NÉZZÜK. Egy proxy-
 *    hibaoldal vagy egy bejelentkező képernyő nem JSON: ha előbb a törzset
 *    próbálnánk értelmezni, a valódi ok (524, 502, /login-ra terelés) elveszne
 *    egy semmitmondó „JSON-elemzési hiba" mögött. Ez pontosan az a csapda,
 *    amibe a 2026-08-14-i első éles futás beleesett.
 *
 * ⚠️ MIÉRT VÁRJA VÉGIG, HA A GITHUB ACTIONS-VÁLTOZAT NEM. A cron-előzményben a
 *    KILÉPÉSI KÓD az egyetlen jel, amit a tulajdonos hetekig lát — ha „még fut"
 *    állapotban lépnénk ki, megint azt kellene találgatni, mi lett a futásból.
 *    Egy Railway cron-folyamat nyugodtan élhet órákig (nincs előtte proxy, és
 *    félpercenként egy ezredmásodperces GET semmibe nem kerül); a GitHub
 *    Actions runner-percei viszont fizetősek, ezért ott 5 perc figyelés után a
 *    verdiktet az admin → Biztonsági mentés oldal és az őrszem-riasztás adja.
 *
 * ⚠️ EGY SZERZŐDÉS, KÉT HÍVÓ — NE SODRÓDJANAK SZÉT. A testvér-megvalósítás a
 *    `.github/workflows/napi-mentes.yml` (az a MAI, elsődleges út). Ha a végpont
 *    válasza valaha változik, MINDKETTŐT át kell írni. A szerződés forrása:
 *    `apps/web/app/api/internal/backup/route.ts` + `lib/backup/supervisor.ts`.
 *
 * ⚠️ A RAILWAY CRON UTC-BEN JÁR („schedules are based on UTC"), nem romániai
 *    időben. A `17 2 * * *` tehát NYÁRON 05:17, TÉLEN 04:17 Bukarestben — a
 *    Railway nem ismer időzónát, így a futás évente kétszer egy órát vándorol.
 *    A mentésnek ez nem számít; a félrevezető dokumentáció viszont igen, ezért
 *    áll itt a valós érték.
 *
 * ⚠️ BEVALLOTT KORLÁT: a szerver állapota az UTOLSÓ szelet bukásait mutatja. Ha
 *    egy gyülekezet mentése előbb elbukott, de egy későbbi szelet újrapróbálta
 *    és sikerült, azt innen már nem látjuk — a napi mentés akkor is TELJES. Az
 *    átmeneti bukásról a tulajdonos e-mailt kap (őrszem-riasztás).
 *
 * KILÉPÉSI KÓDOK:  0 = a mai mentés végigment, bukás nélkül.
 *                  1 = MINDEN MÁS (el sem indult, elakadt, hibára futott,
 *                      maradt bukott gyülekezet, vagy nem tudtuk követni).
 */

const endpoint = process.env.BACKUP_WORKER_ENDPOINT?.trim();
const secret = process.env.BACKUP_WORKER_SECRET?.trim();

if (!endpoint) {
  console.error(
    "[backup-cron] A napi mentés EL SEM INDULT: nincs beállítva, hova szóljon. " +
      "Teendő: Railway → Variables → új változó, BACKUP_WORKER_ENDPOINT = https://kartoteka.app/api/internal/backup",
  );
  process.exit(1);
}
if (!secret || secret.length < 32) {
  console.error(
    "[backup-cron] A napi mentés EL SEM INDULT: a BACKUP_WORKER_SECRET hiányzik, vagy 32 karakternél rövidebb. " +
      "Teendő: Railway → Variables. A titok generálását a mentés-beállítási útmutató 2. része írja le.",
  );
  process.exit(1);
}

let url;
try {
  url = new URL(endpoint);
} catch {
  console.error(
    `[backup-cron] A napi mentés EL SEM INDULT: a BACKUP_WORKER_ENDPOINT nem érvényes webcím („${endpoint}"). ` +
      "Teendő: Railway → Variables, a helyes érték: https://kartoteka.app/api/internal/backup",
  );
  process.exit(1);
}

if (
  url.protocol !== "https:" &&
  url.hostname !== "localhost" &&
  url.hostname !== "127.0.0.1"
) {
  console.error(
    "[backup-cron] A napi mentés EL SEM INDULT: a BACKUP_WORKER_ENDPOINT csak HTTPS-cím lehet élesben " +
      "(a titok különben titkosítatlanul utazna). Teendő: Railway → Variables.",
  );
  process.exit(1);
}

// ⚠️ 2026-08-15: a szeletelés ÁTKÖLTÖZÖTT A SZERVERRE (lib/backup/supervisor.ts),
//    ez a változó tehát már semmit nem szabályoz. Némán elnyelni félrevezető
//    volna — aki beállította, azt hinné, hogy hat valamire.
if (process.env.BACKUP_MAX_SZELET) {
  console.warn(
    "[backup-cron] FIGYELEM: a BACKUP_MAX_SZELET változó 2026-08-15 óta nem csinál semmit — " +
      "a mentés szeletelését a szerver intézi. Nyugodtan törölheted a Railway-változók közül.",
  );
}

/** Pozitív szám a környezeti változóból, különben az alapérték. */
function szam(ertek, alap) {
  const n = Number(ertek);
  return Number.isFinite(n) && n > 0 ? n : alap;
}

/** Két állapot-lekérdezés között ennyit várunk. */
const POLL_MS = szam(process.env.BACKUP_POLL_MS, 30_000);

/**
 * Ennél tovább a szkript nem várja a szervert.
 *
 * ⚠️ MIÉRT PONT 11 ÓRA. A szerver saját felső korlátja 10 óra
 *    (`HATTER_MAX_FUTAS_MS`), tehát ép esetben MINDIG a szerver fejezi be előbb,
 *    és mi a valódi végállapotból döntünk. A 11. óra csak arra kell, hogy egy
 *    beragadt (soha véget nem érő) futás se tartsa örökké életben ezt a
 *    folyamatot — akkor viszont HANGOSAN, 1-es kóddal lépünk ki.
 */
const MAX_VARAKOZAS_MS = szam(process.env.BACKUP_POLL_MAX_MS, 11 * 3_600_000);

/** Ennyi EGYMÁS UTÁNI sikertelen állapot-lekérdezés után feladjuk (≈5 perc). */
const MAX_EGYMAS_UTANI_HIBA = 10;

/** Egy HTTP-kérés időkerete. Az indítás és az állapot-olvasás is gyors. */
const KERES_TIMEOUT_MS = 60_000;

/** Ennyi néma perc után szólunk, hogy nem látszik haladás (de még várunk). */
const PANGAS_FIGYELMEZTETES_MS = 60 * 60_000;

const varj = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Hosszú, tördelt hibatörzs rövidítése a naplóhoz. */
function rovid(szoveg) {
  const s = String(szoveg || "").replace(/\s+/g, " ").trim();
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

/** A bukott hatókörök NÉVVEL — a cron-naplóból is látszódjon, KI maradt ki. */
function bukottNevek(allapot) {
  return Array.isArray(allapot?.bukottak)
    ? allapot.bukottak.map(
        (b) => `${b?.nev || b?.scope || "ismeretlen hatókör"}: ${b?.hiba || "ismeretlen hiba"}`,
      )
    : [];
}

/**
 * Egy kérés a workerhez. Fail-closed: MINDEN bizonytalan válasz hiba.
 *
 * ⚠️ A SORREND KÖTÖTT: hálózati hiba → átirányítás → STÁTUSZKÓD → csak azután
 *    JSON. A törzsből addig egyetlen döntés sem születhet, amíg a státuszkód
 *    nem mondta ki, hogy egyáltalán a workerünk felelt-e.
 */
async function keres(method) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${secret}`,
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify({ forras: "railway-cron" }) : undefined,
      // ⚠️ NEM követjük az átirányítást: ha a proxy /login-ra terelne, a
      //    bejelentkező oldal 200-at adna HTML-lel, és a hiba oka („nincs proxy-
      //    kivétel az /api/internal/* alatt") elveszne a JSON-elemzési hibában.
      redirect: "manual",
      signal: AbortSignal.timeout(KERES_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      hiba:
        "A szerver nem válaszolt (" +
        (error instanceof Error ? error.message : "ismeretlen hálózati hiba") +
        ").",
    };
  }

  if (response.status >= 300 && response.status < 400) {
    return {
      ok: false,
      hiba:
        "A worker helyett ÁTIRÁNYÍTÁS érkezett (" +
        response.status +
        " → " +
        (response.headers.get("location") || "ismeretlen cél") +
        "). A bejelentkezési proxy elterelte a gépi kérést: az /api/internal/* útvonalakat át kell engedni.",
    };
  }

  const szoveg = await response.text().catch(() => "");

  // ⚠️ A STÁTUSZKÓD ELŐSZÖR. A 202 (indítás) és a 200 (állapot) a jó válaszok;
  //    minden más a szerver hibája, és a törzs ilyenkor NEM adatforrás, csak
  //    diagnosztikai nyom.
  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      hiba: `A szerver hibát jelzett (HTTP ${response.status}).`,
      reszlet: rovid(szoveg),
    };
  }

  let payload;
  try {
    payload = JSON.parse(szoveg);
  } catch {
    return {
      ok: false,
      hiba:
        "A szerver nem a mentés válaszát küldte (nem JSON, content-type: " +
        (response.headers.get("content-type") || "ismeretlen") +
        ").",
      reszlet: rovid(szoveg),
    };
  }

  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      hiba: payload?.error || "A szerver elutasította a kérést.",
      reszlet: payload?.reszlet,
    };
  }

  const allapot = payload.allapot;
  // ⛔ FAIL-CLOSED: ha az állapot hiányzik vagy más alakú, NEM tippelünk. Éppen
  //    ez a némán zöldre futás oka volt 2026-08-14 és 08-15 között: hiányzó
  //    mezőkből lett 0, a 0-ból pedig „kész".
  if (!allapot || typeof allapot.fut !== "boolean") {
    return {
      ok: false,
      hiba:
        "A szerver válaszából hiányzik a futás állapota — a mentést nem tudjuk követni. " +
        "Ez akkor fordul elő, ha a szerver és ez a szkript nem ugyanabból a verzióból való.",
      reszlet: rovid(szoveg),
    };
  }

  return { ok: true, payload, allapot };
}

/** Emberi mondat arról, miért nem ért végig a futás. */
function magyarazat(allapot) {
  const hatralevo = allapot?.hatralevo;
  switch (allapot?.befejezesOka) {
    case "hiba":
      return (
        "A szerver hibára futott: " +
        (allapot.utolsoHiba || "a részletek az Admin → Biztonsági mentés oldalon látszanak") +
        ". Teendő: nyisd meg az Admin → Biztonsági mentés oldalt, ott áll, melyik lépésnél állt meg."
      );
    case "nem_halad":
      return (
        "A mentés elakadt: egyetlen újabb gyülekezet mentése sem készült el, ezért a szerver megállt, " +
        "hogy ne pörögjön a végtelenségig ugyanazon a listán. Teendő: Admin → Biztonsági mentés, " +
        "és nézd meg, él-e a Google Drive kapcsolat."
      );
    case "korlat":
      return (
        "Elfogyott a szerver időkerete, és " +
        (hatralevo ?? "több") +
        " gyülekezet MA nem kapott mentést. A következő futás ott folytatja, ahol abbamaradt — " +
        "de ha ez ismételten előfordul, szólj, mert a mentés nem fér bele az éjszakába."
      );
    case "leallitva":
      return "A mentést valaki leállította az Admin → Biztonsági mentés oldalon. Teendő: indítsd újra, ha nem szándékos volt.";
    default:
      return (
        `A futás ismeretlen okkal ért véget („${allapot?.befejezesOka ?? "nincs megadva"}"). ` +
        "Ez azt jelenti, hogy a szerver és ez a szkript nem ugyanabból a verzióból való — jelezd a fejlesztőnek."
      );
  }
}

/**
 * A VÉGÁLLAPOT ÍTÉLETE. 0-s kód CSAK teljes, bukásmentes napi mentésre.
 *
 * ⚠️ A „nulla mentés" KÜLÖN ÁG. A `kesz` ok önmagában nem elég: ha sem most nem
 *    készült mentés, sem korábban ma, akkor a futás ugyan „végigért" a saját
 *    üres listáján, de a mai napra NINCS mentés — ez bukás, nem siker.
 */
function ertekeles(allapot) {
  const sikeres = Number(allapot.sikeres || 0);
  const korabbanKesz = Number(allapot.korabbanKesz || 0);
  const sikertelen = Number(allapot.sikertelen || 0);
  const kozos = {
    runDate: allapot.runDate,
    sikeres,
    korabbanKesz,
    sikertelen,
    hatralevo: allapot.hatralevo,
    foglalt: allapot.foglalt,
    figyelmeztetesek: allapot.figyelmeztetesek,
  };

  if (allapot.befejezesOka !== "kesz") {
    console.error(`[backup-cron] A NAPI MENTÉS NEM ÉRT VÉGIG. ${magyarazat(allapot)}`, {
      ...kozos,
      utolsoHiba: allapot.utolsoHiba,
      bukottak: bukottNevek(allapot),
    });
    return 1;
  }

  if (sikeres + korabbanKesz === 0) {
    console.error(
      "[backup-cron] A szerver szerint a futás végigment, DE MA EGYETLEN MENTÉS SEM KÉSZÜLT EL. " +
        "Ez nem siker: vagy nem volt mit menteni (ami maga is baj), vagy a hatókör-lista üresen jött vissza. " +
        "Teendő: nyisd meg az Admin → Biztonsági mentés oldalt, és indíts kézzel egy mentést.",
      kozos,
    );
    return 1;
  }

  if (sikertelen > 0) {
    console.error(
      "[backup-cron] A napi mentés végigment, DE MARADTAK gyülekezetek mentés nélkül. " +
        "Teendő: Admin → Biztonsági mentés, és nézd meg az alább felsorolt gyülekezeteket.",
      { ...kozos, bukottak: bukottNevek(allapot) },
    );
    return 1;
  }

  console.log("[backup-cron] A NAPI MENTÉS KÉSZ — minden gyülekezet mentése megvan.", kozos);
  return 0;
}

async function fo() {
  // ── 1) INDÍTÁS — a POST azonnal visszatér, a futás a szerveren él ─────────
  const inditas = await keres("POST");
  if (!inditas.ok) {
    console.error(
      "[backup-cron] A NAPI MENTÉS EL SEM INDULT — MENTÉS NEM KÉSZÜLT. " +
        "Teendő: nyisd meg az Admin → Biztonsági mentés oldalt, és indíts kézzel egy mentést.",
      { hiba: inditas.hiba, reszlet: inditas.reszlet },
    );
    return 1;
  }

  const indulas = inditas.allapot;
  if (inditas.payload.inditva === false) {
    console.log(
      "[backup-cron] Már futott egy mentés a szerveren — nem indítottunk másodikat, azt figyeljük tovább.",
      { runDate: indulas.runDate, indultAt: indulas.indultAt },
    );
  } else {
    console.log("[backup-cron] A mentés elindult a szerveren.", {
      runDate: indulas.runDate,
      indultAt: indulas.indultAt,
    });
  }

  /**
   * A FIGYELT FUTÁS AZONOSÍTÓJA az indulás időbélyege.
   *
   * ⚠️ MIÉRT KELL. A szerver állapota a Node-folyamatban él: egy telepítés vagy
   *    újraindulás megöli a futást, és az állapot ÜRESRE áll (fut=false,
   *    befejezesOka=null). Enélkül az ellenőrzés nélkül ezt egy „befejezett"
   *    futásnak néznénk — vagyis pontosan ugyanabba a hibába esnénk vissza,
   *    amit ez a javítás megszüntet.
   */
  const figyeltIndultAt = indulas.indultAt;
  if (!figyeltIndultAt) {
    console.error(
      "[backup-cron] A szerver nem mondta meg, mikor indult a mentés, így nem tudjuk követni. " +
        "Teendő: nyisd meg az Admin → Biztonsági mentés oldalt, ott látszik, mi történt.",
      { allapot: indulas },
    );
    return 1;
  }

  // Elméletben nem fordulhat elő (az indítás után a futás fut), de ha mégis:
  // a végállapotból ítélünk, nem tippelünk.
  if (indulas.fut === false) return ertekeles(indulas);

  // ── 2) FIGYELÉS — amíg a szerver be nem fejezi ────────────────────────────
  const kezdet = Date.now();
  let hibasEgymasUtan = 0;
  let utolsoNaplo = Date.now();
  let utolsoValtozas = Date.now();
  let pangasJelezve = false;
  let elozoSzelet = -1;
  let elozoSikeres = -1;

  while (Date.now() - kezdet < MAX_VARAKOZAS_MS) {
    await varj(POLL_MS);

    const valasz = await keres("GET");
    if (!valasz.ok) {
      hibasEgymasUtan += 1;
      console.error(
        `[backup-cron] Az állapot-lekérdezés nem sikerült (${hibasEgymasUtan}. alkalommal egymás után).`,
        { hiba: valasz.hiba, reszlet: valasz.reszlet },
      );
      if (hibasEgymasUtan >= MAX_EGYMAS_UTANI_HIBA) {
        console.error(
          "[backup-cron] A szerver percek óta nem válaszol, ezért NEM TUDJUK, elkészült-e a mai mentés. " +
            "Inkább hibát jelentünk, mint hogy sikert állítsunk. " +
            "Teendő: nyisd meg az Admin → Biztonsági mentés oldalt.",
        );
        return 1;
      }
      continue;
    }
    hibasEgymasUtan = 0;

    const allapot = valasz.allapot;

    if (allapot.indultAt !== figyeltIndultAt) {
      console.error(
        "[backup-cron] A FIGYELT MENTÉS NYOMA ELTŰNT: a szerver időközben újraindult, vagy egy másik " +
          "mentés indult el helyette. Ami eddig elkészült, az megvan és nem vész el — de EZ a futás " +
          "félbemaradt. Teendő: nyisd meg az Admin → Biztonsági mentés oldalt, és indítsd újra a mentést.",
        { figyeltIndultAt, mostIndultAt: allapot.indultAt, fut: allapot.fut },
      );
      return 1;
    }

    const sikeresMost = Number(allapot.sikeres || 0);
    const szelet = Number(allapot.szelet || 0);
    const most = Date.now();

    if (szelet !== elozoSzelet || sikeresMost !== elozoSikeres) {
      utolsoValtozas = most;
      pangasJelezve = false;
    }

    // Naplózás csak változáskor, plusz 10 percenként egy életjel — különben egy
    // négyórás futás több száz azonos sort írna a cron-naplóba.
    if (szelet !== elozoSzelet || sikeresMost !== elozoSikeres || most - utolsoNaplo >= 600_000) {
      console.log("[backup-cron] Halad a mentés.", {
        szelet,
        sikeres: allapot.sikeres,
        korabbanKesz: allapot.korabbanKesz,
        sikertelen: allapot.sikertelen,
        // Ennyi hatókört egy MÁSIK futás tart a kezében (pl. a tulajdonos épp a
        // felületről indított mentést). Nem hiba — a szerver újrapróbálja.
        foglalt: allapot.foglalt,
        hatralevo: allapot.hatralevo,
      });
      utolsoNaplo = most;
      elozoSzelet = szelet;
      elozoSikeres = sikeresMost;
    }

    if (!pangasJelezve && most - utolsoValtozas >= PANGAS_FIGYELMEZTETES_MS) {
      // Nem lépünk ki: egy szelet 10 perc, tehát a rövid csend NORMÁLIS. Egy óra
      // némaság viszont már gyanús — kimondjuk, hogy a naplóban nyoma legyen.
      console.warn(
        "[backup-cron] Egy órája nem látszik haladás a mentésen. Még várunk (a szervernek saját " +
          "időkorlátja van), de ha ez a futás hibával zárul, itt kezdd a keresést.",
        { szelet, sikeres: allapot.sikeres, hatralevo: allapot.hatralevo },
      );
      pangasJelezve = true;
    }

    if (!allapot.fut) return ertekeles(allapot);
  }

  console.error(
    "[backup-cron] IDŐTÚLLÉPÉS: a mentés a megengedett idő alatt sem fejeződött be, ezért nem tudjuk, " +
      "teljes-e. Ami elkészült, az megvan. Teendő: nyisd meg az Admin → Biztonsági mentés oldalt.",
    { varakozasOra: Math.round(MAX_VARAKOZAS_MS / 3_600_000) },
  );
  return 1;
}

// ⚠️ A `catch` NEM ELHAGYHATÓ: egy elkapatlan hiba nyers veremkiírást adna, a
//    tulajdonos pedig fejlesztői zsargont látna a cron-naplóban. A kilépési kód
//    így is 1 — hibát SOHA nem nyelünk el sikerként.
process.exitCode = await fo().catch((error) => {
  console.error(
    "[backup-cron] Váratlan hiba a mentés indítása vagy figyelése közben — NEM TUDJUK, elkészült-e a mai mentés. " +
      "Teendő: nyisd meg az Admin → Biztonsági mentés oldalt.",
    error instanceof Error ? error.message : error,
  );
  return 1;
});
