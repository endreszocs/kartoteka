// ============================================================
//  KARTOTÉKA — Komponens Cache (sessionStorage)
//  HTML komponensek (sidebar, header, modálok) cache-elése
//  hogy ne kelljen minden oldalváltásnál újra fetch-elni
// ============================================================

(function() {
    var COMP_VERSION = '2026.04.04e';
    var COMP_PREFIX  = 'krt_comp_';
    var VER_KEY      = 'krt_comp_version';

    // Verzió ellenőrzés — ha változott, cache törlés
    var storedVer = sessionStorage.getItem(VER_KEY);
    if (storedVer !== COMP_VERSION) {
        for (var i = sessionStorage.length - 1; i >= 0; i--) {
            var key = sessionStorage.key(i);
            if (key && key.indexOf(COMP_PREFIX) === 0) {
                sessionStorage.removeItem(key);
            }
        }
        sessionStorage.setItem(VER_KEY, COMP_VERSION);
    }

    /**
     * HTML komponens betöltése sessionStorage cache-ből vagy hálózatról
     * @param {string} url - relatív URL (pl. 'components/sidebar.html')
     * @returns {Promise<string>} HTML tartalom
     */
    window.fetchComponent = function(url) {
        var cacheKey = COMP_PREFIX + url;
        var cached = sessionStorage.getItem(cacheKey);
        if (cached) return Promise.resolve(cached);

        return fetch(url).then(function(r) {
            return r.text();
        }).then(function(text) {
            try { sessionStorage.setItem(cacheKey, text); } catch(e) { /* quota */ }
            return text;
        });
    };

    /**
     * Modál lazy betöltése — csak első megnyitáskor fetch-el
     * @param {string} url - komponens URL
     * @param {string} placeholderId - DOM elem ID ahova beillesztjük
     * @returns {Promise<void>}
     */
    window.lazyLoadModal = function(url, placeholderId) {
        var el = document.getElementById(placeholderId);
        if (!el) return Promise.resolve();
        if (el.innerHTML && el.innerHTML.trim().length > 10) return Promise.resolve();
        return fetchComponent(url).then(function(html) {
            el.innerHTML = html;
        });
    };
})();
