/**
 * Cloudflare R2 — Kliens oldali konfiguráció
 * ============================================
 * A Missziós Műhely fájl feltöltéséhez használt R2 Worker beállítások.
 *
 * BEÁLLÍTÁS:
 * 1. Hozd létre a Cloudflare Worker-t (lásd: cloudflare/r2-upload-worker.js)
 * 2. Írd be a Worker URL-t az R2_WORKER_URL mezőbe
 * 3. Írd be az AUTH_SECRET kulcsot (ugyanaz, amit a Worker env-ben beállítottál)
 */

window.R2_CONFIG = {
    // A Cloudflare Worker URL-je (telepítés után kapott URL)
    // Példa: 'https://kartoteka-r2.your-subdomain.workers.dev'
    WORKER_URL: 'https://kartoteka-r2.endreszocs.workers.dev',

    // Autentikációs kulcs (ugyanaz mint a Worker-ben beállított AUTH_SECRET).
    // 2026-09-06: a valódi érték KIVÉVE — verziókövetve állt, és a repót olvasva
    // bárki korlátlanul tölthetett volna fel fájlt a tárolóba. A titok a git
    // TÖRTÉNETÉBEN megmarad, ezért a Cloudflare oldalán ROTÁLNI is kell:
    // Workers & Pages -> kartoteka-r2 -> Settings -> Variables and Secrets.
    AUTH_SECRET: '<R2_AUTH_SECRET>',

    // Maximum fájlméret (byte-ban) — 20 MB
    MAX_FILE_SIZE: 20 * 1024 * 1024,

    // Engedélyezett fájlkiterjesztések
    ALLOWED_EXTENSIONS: ['pdf', 'docx', 'pptx', 'xlsx', 'zip', 'jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm']
};

/**
 * Fájl feltöltése Cloudflare R2-re a Worker proxy-n keresztül
 * @param {File} file — a feltöltendő fájl
 * @param {string} folder — almappa (pl. 'segedanyagok' vagy 'otletek')
 * @param {string} userId — feltöltő felhasználó ID-ja
 * @returns {Promise<{url: string, path: string}>} — publikus URL és fájl útvonal
 */
window.uploadToR2 = async function(file, folder, userId) {
    var config = window.R2_CONFIG;

    // Konfig ellenőrzés
    if (!config.WORKER_URL || config.WORKER_URL === 'WORKER_URL_IDE') {
        throw new Error('R2 Worker URL nincs beállítva! Szerkeszd a pages/js/r2_config.js fájlt.');
    }

    // Méret ellenőrzés
    if (file.size > config.MAX_FILE_SIZE) {
        throw new Error('A fájl mérete meghaladja a megengedett ' + (config.MAX_FILE_SIZE / 1024 / 1024) + ' MB-ot!');
    }

    // Kiterjesztés ellenőrzés
    var ext = file.name.split('.').pop().toLowerCase();
    if (!config.ALLOWED_EXTENSIONS.includes(ext)) {
        throw new Error('Nem engedélyezett fájltípus: .' + ext);
    }

    // Fájl útvonal generálás: folder/userId/timestamp_filename
    var filePath = folder + '/' + userId + '/' + Date.now() + '_' + file.name;

    // FormData összeállítás
    var formData = new FormData();
    formData.append('file', file);
    formData.append('path', filePath);

    // Feltöltés a Worker-re
    var response = await fetch(config.WORKER_URL + '/upload', {
        method: 'POST',
        headers: {
            'X-Auth-Token': config.AUTH_SECRET
        },
        body: formData
    });

    if (!response.ok) {
        var errData = await response.json().catch(function() { return { error: 'Ismeretlen hiba' }; });
        throw new Error(errData.error || 'Feltöltési hiba: ' + response.status);
    }

    var result = await response.json();
    return {
        url: result.url,
        path: result.path
    };
};
