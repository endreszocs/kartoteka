/**
 * Kartotéka — Offline szinkronizálási motor
 * Online állapotban: Supabase → IndexedDB háttér-szinkronizálás
 * Offline állapotban: mutációk sync_queue-ba mentése
 * Visszakapcsolódáskor: sync_queue feldolgozása → Supabase push
 *
 * API:
 *   offlineSync.syncTable(table, selectCols, filters)  — egy tábla szinkronizálása Supabase → IDB
 *   offlineSync.syncAll()                              — összes fontos tábla szinkronizálása
 *   offlineSync.pushQueue()                            — várakozó offline mutációk push-olása
 *   offlineSync.getStatus()                            — szinkronizálási állapot
 *   offlineSync.queueMutation(table, action, data)     — offline mutáció sorba állítása
 */
(function() {

    // Szinkronizálandó táblák konfigurációja
    var SYNC_TABLES = [
        { table: 'szemely', select: '*', filterField: 'congregation_id' },
        { table: 'csalad', select: 'id, id_ferfi, id_no, congregation_id', filterField: 'congregation_id' },
        { table: 'befizetes', select: 'id, osszeg, datum, id_szemely, id_csalad, irattipus, fizetettev, congregation_id, deleted, belso_mozgas_xkey', filterField: 'congregation_id' },
        { table: 'kiadas', select: 'id, osszeg, datum, irattipus, congregation_id, deleted, belso_mozgas_xkey', filterField: 'congregation_id' },
        { table: 'munkanaplo', select: '*', filterField: 'congregation_id' },
        { table: 'gyulekezeti_programok', select: '*', filterField: 'congregation_id' },
        { table: 'iktato', select: '*', filterField: 'congregation_id' },
        { table: 'leltar_tetelek', select: '*', filterField: 'congregation_id' },
        { table: 'elkoltozott', select: 'id, id_szemely', filterField: null },
        { table: 'presbiter', select: '*', filterField: null },
        { table: 'felmentes', select: '*', filterField: null },
        { table: 'gyerek', select: 'id, id_szemely, id_csalad', filterField: null },
        // Referencia adatok (ritkán változnak)
        { table: 'szamadasicel', select: '*', filterField: null },
        { table: 'befizetescel', select: 'id, id_szamadasicel', filterField: null },
        { table: 'kiadascel', select: 'id, id_szamadasicel', filterField: null },
        { table: 'nevnap', select: 'id, nev1, nev2, nev3, honap, nap', filterField: null }
    ];

    var _syncInProgress = false;
    var _lastSyncTime = null;

    // ── Egy tábla szinkronizálása: Supabase → IndexedDB ─────
    function syncTable(tableDef) {
        if (!window._supabase || !navigator.onLine) return Promise.resolve(false);

        var query = window._supabase.from(tableDef.table).select(tableDef.select);

        // Congregation szűrő, ha van
        if (tableDef.filterField && window.activeCongregationId) {
            query = query.eq(tableDef.filterField, window.activeCongregationId);
        }

        return query.then(function(result) {
            if (result.error) {
                console.warn('[Sync] Hiba a "' + tableDef.table + '" szinkronizálásakor:', result.error.message);
                return false;
            }
            var data = result.data || [];
            return window.offlineDB.clear(tableDef.table).then(function() {
                return window.offlineDB.putAll(tableDef.table, data);
            }).then(function() {
                return true;
            });
        }).catch(function(err) {
            console.warn('[Sync] Hálózati hiba a "' + tableDef.table + '" szinkronizálásakor:', err.message);
            return false;
        });
    }

    // ── Összes tábla szinkronizálása ────────────────────────
    function syncAll() {
        if (_syncInProgress) return Promise.resolve(false);
        if (!navigator.onLine) return Promise.resolve(false);
        if (!window._supabase) return Promise.resolve(false);

        _syncInProgress = true;
        console.log('[Sync] Teljes szinkronizálás indítása...');

        return window.offlineDB.open().then(function() {
            // Referencia adatok (kis méret, ritkán változik) — párhuzamosan
            var refTables = SYNC_TABLES.filter(function(t) { return !t.filterField; });
            var congTables = SYNC_TABLES.filter(function(t) { return !!t.filterField; });

            return Promise.all(refTables.map(syncTable)).then(function(refResults) {
                var refOk = refResults.filter(Boolean).length;
                console.log('[Sync] Referencia táblák: ' + refOk + '/' + refTables.length);

                // Congregation-szintű adatok
                if (window.activeCongregationId) {
                    return Promise.all(congTables.map(syncTable)).then(function(congResults) {
                        var congOk = congResults.filter(Boolean).length;
                        console.log('[Sync] Gyülekezeti adatok: ' + congOk + '/' + congTables.length);
                        return refOk + congOk;
                    });
                }
                return refOk;
            });
        }).then(function(totalOk) {
            _lastSyncTime = new Date().toISOString();
            window.offlineDB.setMeta('lastSync', _lastSyncTime);
            window.offlineDB.setMeta('lastSyncTables', totalOk);
            _syncInProgress = false;
            console.log('[Sync] Szinkronizálás kész — ' + totalOk + ' tábla frissítve');
            return true;
        }).catch(function(err) {
            _syncInProgress = false;
            console.error('[Sync] Szinkronizálási hiba:', err);
            return false;
        });
    }

    // ── Offline mutáció sorba állítása ──────────────────────
    function queueMutation(table, action, data) {
        return window.offlineDB.addToSyncQueue({
            table: table,
            action: action,  // 'insert', 'update', 'delete'
            data: data,
            timestamp: new Date().toISOString()
        });
    }

    // ── Sync queue feldolgozása (push) ──────────────────────
    function pushQueue() {
        if (!navigator.onLine || !window._supabase) return Promise.resolve(0);

        return window.offlineDB.getSyncQueue().then(function(entries) {
            if (!entries || entries.length === 0) return 0;

            console.log('[Sync] ' + entries.length + ' várakozó mutáció feldolgozása...');
            var processed = 0;

            // Szekvenciális feldolgozás (sorrend fontos)
            return entries.reduce(function(chain, entry) {
                return chain.then(function() {
                    return _processSyncEntry(entry).then(function(ok) {
                        if (ok) {
                            processed++;
                            return window.offlineDB.removeSyncEntry(entry.id);
                        } else {
                            console.warn('[Sync] Sikertelen mutáció:', entry.table, entry.action);
                        }
                    });
                });
            }, Promise.resolve()).then(function() {
                if (processed > 0) {
                    console.log('[Sync] ' + processed + '/' + entries.length + ' mutáció szinkronizálva');
                }
                return processed;
            });
        });
    }

    // ── Egy sync entry feldolgozása ─────────────────────────
    function _processSyncEntry(entry) {
        var supabase = window._supabase;
        if (!supabase) return Promise.resolve(false);

        try {
            if (entry.action === 'insert') {
                return supabase.from(entry.table).insert(entry.data).then(function(res) {
                    return !res.error;
                });
            }
            if (entry.action === 'update') {
                var id = entry.data.id;
                var updateData = Object.assign({}, entry.data);
                delete updateData.id;
                return supabase.from(entry.table).update(updateData).eq('id', id).then(function(res) {
                    return !res.error;
                });
            }
            if (entry.action === 'delete') {
                return supabase.from(entry.table).delete().eq('id', entry.data.id).then(function(res) {
                    return !res.error;
                });
            }
        } catch (err) {
            console.error('[Sync] Feldolgozási hiba:', err);
            return Promise.resolve(false);
        }
        return Promise.resolve(false);
    }

    // ── Szinkronizálási állapot ─────────────────────────────
    function getStatus() {
        return window.offlineDB.getSyncQueue().then(function(queue) {
            return window.offlineDB.getMeta('lastSync').then(function(lastSync) {
                return {
                    online: navigator.onLine,
                    lastSync: lastSync || _lastSyncTime,
                    pendingMutations: queue ? queue.length : 0,
                    syncInProgress: _syncInProgress
                };
            });
        });
    }

    // ── Online visszakapcsolódáskor: push + sync ────────────
    window.addEventListener('online', function() {
        console.log('[Sync] Online — szinkronizálás indítása...');
        // Először push-oljuk a várakozó mutációkat
        pushQueue().then(function() {
            // Majd frissítjük az offline adatokat
            return syncAll();
        });
    });

    // ── Háttér szinkronizálás: 5 percenként ─────────────────
    var _bgSyncInterval = null;
    function startBackgroundSync() {
        if (_bgSyncInterval) return;
        _bgSyncInterval = setInterval(function() {
            if (navigator.onLine && !_syncInProgress) {
                syncAll();
            }
        }, 300000); // 5 perc
    }

    // Első szinkronizálás az oldal betöltése után (késleltetett)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() {
                if (navigator.onLine) syncAll().then(startBackgroundSync);
                else startBackgroundSync();
            }, 3000);
        });
    } else {
        setTimeout(function() {
            if (navigator.onLine) syncAll().then(startBackgroundSync);
            else startBackgroundSync();
        }, 3000);
    }

    // ── Publikus API ────────────────────────────────────────
    window.offlineSync = {
        syncTable: function(table, select, filters) {
            return syncTable({ table: table, select: select || '*', filterField: filters || null });
        },
        syncAll: syncAll,
        pushQueue: pushQueue,
        queueMutation: queueMutation,
        getStatus: getStatus
    };

})();
