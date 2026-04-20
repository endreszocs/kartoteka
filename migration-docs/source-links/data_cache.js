/**
 * Kartotéka — Adatcache réteg
 * Memória-alapú cache Supabase lekérdezésekhez.
 * Ismételt lekérdezések eliminálása TTL-alapú cache-eléssel.
 *
 * Használat:
 *   var result = await cachedQuery('szemely_list', function() {
 *       return _supabase.from('szemely').select('*');
 *   }, 120000);  // 2 perc TTL
 *
 *   invalidateCache('szemely_list');   // egy kulcs törlése
 *   invalidateCachePrefix('szemely');  // prefix alapú törlés
 *   invalidateCache();                 // teljes cache törlése
 */
(function() {
    var _cache = {};

    /**
     * Lekérdezés cache-eléssel.
     * @param {string} key — egyedi kulcs (pl. 'dashboard_szemely')
     * @param {Function} queryFn — Supabase lekérdezést visszaadó függvény
     * @param {number} [ttlMs=120000] — cache élettartam milliszekundumban (alapértelmezés: 2 perc)
     * @returns {Promise<{data, error, count}>}
     */
    window.cachedQuery = function(key, queryFn, ttlMs) {
        ttlMs = ttlMs || 120000;
        var entry = _cache[key];
        if (entry && (Date.now() - entry.ts < ttlMs)) {
            return Promise.resolve(entry.result);
        }
        return queryFn().then(function(result) {
            _cache[key] = { result: result, ts: Date.now() };
            // Háttérben IndexedDB-be is mentjük (offline fallback)
            if (result && result.data && window.offlineDB) {
                var table = _extractTable(key);
                if (table) window.offlineDB.putAll(table, result.data).catch(function() {});
            }
            return result;
        }).catch(function(err) {
            // Hálózati hiba → IndexedDB fallback
            var table = _extractTable(key);
            if (table && window.offlineDB) {
                return window.offlineDB.getAll(table).then(function(data) {
                    var result = { data: data || [], error: null, source: 'indexeddb' };
                    _cache[key] = { result: result, ts: Date.now() };
                    return result;
                });
            }
            throw err;
        });
    };

    // Cache kulcsból táblanév kinyerése (pl. 'dash_szemely' → 'szemely')
    function _extractTable(key) {
        var tables = ['szemely','elkoltozott','csalad','befizetes','kiadas','presbiter','nevnap','munkanaplo',
                      'gyulekezeti_programok','anyakonyv','iktato','leltar_tetelek','szamadasicel','befizetescel',
                      'kiadascel','felmentes','gyerek'];
        for (var i = 0; i < tables.length; i++) {
            if (key.indexOf(tables[i]) !== -1) return tables[i];
        }
        return null;
    }

    /**
     * Cache törlése.
     * @param {string} [key] — ha megadva, csak azt a kulcsot törli; egyébként mindent
     */
    window.invalidateCache = function(key) {
        if (key) {
            delete _cache[key];
        } else {
            _cache = {};
        }
    };

    /**
     * Prefix alapú cache törlés (pl. 'szemely' törli: 'szemely_list', 'szemely_detail' stb.)
     * @param {string} prefix
     */
    window.invalidateCachePrefix = function(prefix) {
        for (var k in _cache) {
            if (k.indexOf(prefix) === 0) {
                delete _cache[k];
            }
        }
    };

    /**
     * Cache statisztika (debug célra)
     */
    window.getCacheStats = function() {
        var keys = Object.keys(_cache);
        var stats = { entries: keys.length, keys: [] };
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var age = Math.round((Date.now() - _cache[k].ts) / 1000);
            stats.keys.push(k + ' (' + age + 's)');
        }
        return stats;
    };
})();
