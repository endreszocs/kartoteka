/**
 * Kartotéka — Smart Query wrapper
 * Átlátszóan kezeli az online/offline állapotot.
 * Online: Supabase query + eredmény IndexedDB-be mentése
 * Offline: IndexedDB-ből olvasás
 *
 * Használat:
 *   var result = await smartQuery('szemely', '*', { congregation_id: activeCongregationId });
 *   // Visszaadja: { data: [...], error: null, source: 'network'|'cache' }
 *
 *   await smartMutate('szemely', 'insert', recordData);
 *   // Online: Supabase-be ír + IDB frissítés
 *   // Offline: IDB-be ír + sync_queue-ba rak
 */
(function() {

    /**
     * Lekérdezés online/offline átlátszó kezeléssel.
     * @param {string} table — tábla neve
     * @param {string} [select='*'] — mezők
     * @param {Object} [filters={}] — szűrők { mezőnév: érték }
     * @param {Object} [options={}] — extra opciók: { order, limit, gte, lte }
     * @returns {Promise<{data, error, count, source}>}
     */
    window.smartQuery = function(table, select, filters, options) {
        select = select || '*';
        filters = filters || {};
        options = options || {};

        if (navigator.onLine && window._supabase) {
            return _networkQuery(table, select, filters, options);
        }
        return _offlineQuery(table, filters, options);
    };

    // ── Hálózati lekérdezés + IDB mentés ────────────────────
    function _networkQuery(table, select, filters, options) {
        var query = window._supabase.from(table).select(select, options.count ? { count: 'exact' } : undefined);

        // Szűrők alkalmazása
        for (var key in filters) {
            if (filters[key] !== undefined && filters[key] !== null) {
                query = query.eq(key, filters[key]);
            }
        }

        // Opciók
        if (options.gte) {
            for (var gKey in options.gte) {
                query = query.gte(gKey, options.gte[gKey]);
            }
        }
        if (options.lte) {
            for (var lKey in options.lte) {
                query = query.lte(lKey, options.lte[lKey]);
            }
        }
        if (options.order) {
            query = query.order(options.order.column, { ascending: options.order.ascending !== false });
        }
        if (options.limit) {
            query = query.limit(options.limit);
        }
        if (options.head) {
            query = query.limit(0);
        }

        return query.then(function(result) {
            // Háttérben mentjük IndexedDB-be (nem blokkoljuk a választ)
            if (!result.error && result.data && result.data.length > 0 && window.offlineDB) {
                window.offlineDB.putAll(table, result.data).catch(function() {});
            }
            result.source = 'network';
            return result;
        }).catch(function(err) {
            // Hálózati hiba → fallback offline-ra
            console.warn('[SmartQuery] Hálózati hiba, offline fallback:', table, err.message);
            return _offlineQuery(table, filters, options);
        });
    }

    // ── Offline lekérdezés IndexedDB-ből ────────────────────
    function _offlineQuery(table, filters, options) {
        if (!window.offlineDB) {
            return Promise.resolve({ data: [], error: { message: 'Offline DB nem elérhető' }, source: 'error' });
        }

        return window.offlineDB.getAll(table).then(function(allData) {
            var data = allData || [];

            // Kliens-oldali szűrés
            if (filters && Object.keys(filters).length > 0) {
                data = data.filter(function(row) {
                    for (var key in filters) {
                        if (filters[key] !== undefined && filters[key] !== null) {
                            if (row[key] !== filters[key]) return false;
                        }
                    }
                    return true;
                });
            }

            // gte/lte szűrés
            if (options.gte) {
                for (var gKey in options.gte) {
                    var gVal = options.gte[gKey];
                    data = data.filter(function(row) { return row[gKey] >= gVal; });
                }
            }
            if (options.lte) {
                for (var lKey in options.lte) {
                    var lVal = options.lte[lKey];
                    data = data.filter(function(row) { return row[lKey] <= lVal; });
                }
            }

            // Rendezés
            if (options.order) {
                var col = options.order.column;
                var asc = options.order.ascending !== false;
                data.sort(function(a, b) {
                    if (a[col] < b[col]) return asc ? -1 : 1;
                    if (a[col] > b[col]) return asc ? 1 : -1;
                    return 0;
                });
            }

            // Limit
            if (options.limit) {
                data = data.slice(0, options.limit);
            }

            return {
                data: options.head ? null : data,
                error: null,
                count: data.length,
                source: 'cache'
            };
        }).catch(function(err) {
            return { data: [], error: { message: err.message }, source: 'error' };
        });
    }

    /**
     * Mutáció online/offline kezeléssel.
     * @param {string} table — tábla neve
     * @param {string} action — 'insert', 'update', 'delete'
     * @param {Object} data — rekord adatok (update/delete: id mező kötelező)
     * @returns {Promise<{data, error, source}>}
     */
    window.smartMutate = function(table, action, data) {
        if (navigator.onLine && window._supabase) {
            return _networkMutate(table, action, data);
        }
        return _offlineMutate(table, action, data);
    };

    function _networkMutate(table, action, data) {
        var supabase = window._supabase;
        var promise;

        if (action === 'insert') {
            promise = supabase.from(table).insert(data).select();
        } else if (action === 'update') {
            var id = data.id;
            var updateData = Object.assign({}, data);
            delete updateData.id;
            promise = supabase.from(table).update(updateData).eq('id', id).select();
        } else if (action === 'delete') {
            promise = supabase.from(table).delete().eq('id', data.id);
        } else {
            return Promise.resolve({ error: { message: 'Ismeretlen művelet: ' + action } });
        }

        return promise.then(function(result) {
            // IDB frissítés háttérben
            if (!result.error && window.offlineDB) {
                if (action === 'delete') {
                    window.offlineDB.delete(table, data.id).catch(function() {});
                } else if (result.data && result.data[0]) {
                    window.offlineDB.put(table, result.data[0]).catch(function() {});
                }
            }
            result.source = 'network';
            return result;
        }).catch(function(err) {
            // Hálózati hiba → offline mutáció
            console.warn('[SmartMutate] Hálózati hiba, offline queue:', table, action, err.message);
            return _offlineMutate(table, action, data);
        });
    }

    function _offlineMutate(table, action, data) {
        if (!window.offlineDB) {
            return Promise.resolve({ error: { message: 'Offline DB nem elérhető' }, source: 'error' });
        }

        // Lokális IDB módosítás
        var idbPromise;
        if (action === 'insert') {
            // Generálunk egy ideiglenes ID-t
            if (!data.id) data.id = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            idbPromise = window.offlineDB.put(table, data);
        } else if (action === 'update') {
            idbPromise = window.offlineDB.put(table, data);
        } else if (action === 'delete') {
            idbPromise = window.offlineDB.delete(table, data.id);
        } else {
            return Promise.resolve({ error: { message: 'Ismeretlen művelet' } });
        }

        return idbPromise.then(function() {
            // Sync queue-ba tesszük
            return window.offlineSync.queueMutation(table, action, data);
        }).then(function() {
            return { data: [data], error: null, source: 'offline' };
        }).catch(function(err) {
            return { error: { message: err.message }, source: 'error' };
        });
    }

})();
