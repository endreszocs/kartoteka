/**
 * Kartotéka — Offline adatbázis (IndexedDB)
 * A legfontosabb Supabase táblák helyi tükrei offline működéshez.
 *
 * API:
 *   offlineDB.open()                         — adatbázis megnyitása
 *   offlineDB.putAll(store, rows)            — tömeges írás (Supabase → IndexedDB)
 *   offlineDB.getAll(store)                  — összes rekord lekérdezése
 *   offlineDB.get(store, id)                 — egy rekord ID alapján
 *   offlineDB.put(store, record)             — egy rekord írása/frissítése
 *   offlineDB.delete(store, id)              — egy rekord törlése
 *   offlineDB.query(store, indexName, value) — index alapú lekérdezés
 *   offlineDB.count(store)                   — rekordszám
 *   offlineDB.clear(store)                   — store törlése
 *   offlineDB.addToSyncQueue(entry)          — offline mutáció sorba állítása
 *   offlineDB.getSyncQueue()                 — várakozó szinkronizálások
 *   offlineDB.removeSyncEntry(id)            — szinkronizált bejegyzés törlése
 *   offlineDB.setMeta(key, value)            — metaadat írása
 *   offlineDB.getMeta(key)                   — metaadat olvasása
 */
(function() {
    var DB_NAME = 'kartoteka_offline';
    var DB_VERSION = 1;
    var _db = null;

    // ── Object store definíciók ──────────────────────────────
    // { name: storeName, keyPath: 'id', indexes: [{name, keyPath, unique}] }
    var STORES = [
        {
            name: 'szemely',
            keyPath: 'id',
            indexes: [
                { name: 'congregation_id', keyPath: 'congregation_id' },
                { name: 'meghalt', keyPath: 'meghalt' }
            ]
        },
        {
            name: 'csalad',
            keyPath: 'id',
            indexes: [
                { name: 'congregation_id', keyPath: 'congregation_id' }
            ]
        },
        {
            name: 'befizetes',
            keyPath: 'id',
            indexes: [
                { name: 'congregation_id', keyPath: 'congregation_id' },
                { name: 'datum', keyPath: 'datum' },
                { name: 'id_szemely', keyPath: 'id_szemely' }
            ]
        },
        {
            name: 'kiadas',
            keyPath: 'id',
            indexes: [
                { name: 'congregation_id', keyPath: 'congregation_id' },
                { name: 'datum', keyPath: 'datum' }
            ]
        },
        {
            name: 'munkanaplo',
            keyPath: 'id',
            indexes: [
                { name: 'congregation_id', keyPath: 'congregation_id' },
                { name: 'idopont', keyPath: 'idopont' }
            ]
        },
        {
            name: 'gyulekezeti_programok',
            keyPath: 'id',
            indexes: [
                { name: 'congregation_id', keyPath: 'congregation_id' },
                { name: 'datum', keyPath: 'datum' }
            ]
        },
        {
            name: 'anyakonyv',
            keyPath: 'id',
            indexes: [
                { name: 'congregation_id', keyPath: 'congregation_id' }
            ]
        },
        {
            name: 'iktato',
            keyPath: 'id',
            indexes: [
                { name: 'congregation_id', keyPath: 'congregation_id' }
            ]
        },
        {
            name: 'leltar_tetelek',
            keyPath: 'id',
            indexes: [
                { name: 'congregation_id', keyPath: 'congregation_id' }
            ]
        },
        {
            name: 'szamadasicel',
            keyPath: 'id',
            indexes: [
                { name: 'sorszam', keyPath: 'sorszam' }
            ]
        },
        {
            name: 'befizetescel',
            keyPath: 'id',
            indexes: []
        },
        {
            name: 'kiadascel',
            keyPath: 'id',
            indexes: []
        },
        {
            name: 'nevnap',
            keyPath: 'id',
            autoIncrement: true,
            indexes: [
                { name: 'honap_nap', keyPath: ['honap', 'nap'] }
            ]
        },
        {
            name: 'elkoltozott',
            keyPath: 'id',
            indexes: [
                { name: 'id_szemely', keyPath: 'id_szemely' }
            ]
        },
        {
            name: 'presbiter',
            keyPath: 'id',
            indexes: []
        },
        {
            name: 'felmentes',
            keyPath: 'id',
            indexes: [
                { name: 'id_szemely', keyPath: 'id_szemely' }
            ]
        },
        {
            name: 'gyerek',
            keyPath: 'id',
            indexes: [
                { name: 'id_szemely', keyPath: 'id_szemely' },
                { name: 'id_csalad', keyPath: 'id_csalad' }
            ]
        },
        // Szinkronizálási sor — offline mutációk
        {
            name: 'sync_queue',
            keyPath: 'id',
            autoIncrement: true,
            indexes: [
                { name: 'table', keyPath: 'table' },
                { name: 'status', keyPath: 'status' }
            ]
        },
        // Metaadatok (utolsó szinkronizálás időpontja stb.)
        {
            name: 'meta',
            keyPath: 'key',
            indexes: []
        }
    ];

    // ── Adatbázis megnyitása ─────────────────────────────────
    function open() {
        if (_db) return Promise.resolve(_db);
        return new Promise(function(resolve, reject) {
            var request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = function(event) {
                var db = event.target.result;
                STORES.forEach(function(def) {
                    if (db.objectStoreNames.contains(def.name)) return;
                    var opts = { keyPath: def.keyPath };
                    if (def.autoIncrement) opts.autoIncrement = true;
                    var store = db.createObjectStore(def.name, opts);
                    (def.indexes || []).forEach(function(idx) {
                        store.createIndex(idx.name, idx.keyPath, { unique: idx.unique || false });
                    });
                });
            };

            request.onsuccess = function(event) {
                _db = event.target.result;
                resolve(_db);
            };

            request.onerror = function(event) {
                console.error('[OfflineDB] Megnyitási hiba:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    // ── Egy rekord írása/frissítése ──────────────────────────
    function put(storeName, record) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).put(record);
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    // ── Tömeges írás (Supabase válasz → IndexedDB) ──────────
    function putAll(storeName, rows) {
        if (!rows || rows.length === 0) return Promise.resolve();
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readwrite');
                var store = tx.objectStore(storeName);
                for (var i = 0; i < rows.length; i++) {
                    store.put(rows[i]);
                }
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    // ── Összes rekord lekérdezése ────────────────────────────
    function getAll(storeName) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readonly');
                var request = tx.objectStore(storeName).getAll();
                request.onsuccess = function() { resolve(request.result); };
                request.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    // ── Egy rekord ID alapján ────────────────────────────────
    function get(storeName, id) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readonly');
                var request = tx.objectStore(storeName).get(id);
                request.onsuccess = function() { resolve(request.result); };
                request.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    // ── Rekord törlése ──────────────────────────────────────
    function del(storeName, id) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).delete(id);
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    // ── Index alapú lekérdezés ──────────────────────────────
    function query(storeName, indexName, value) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readonly');
                var index = tx.objectStore(storeName).index(indexName);
                var request = index.getAll(value);
                request.onsuccess = function() { resolve(request.result); };
                request.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    // ── Rekordszám ──────────────────────────────────────────
    function count(storeName) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readonly');
                var request = tx.objectStore(storeName).count();
                request.onsuccess = function() { resolve(request.result); };
                request.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    // ── Store törlése ───────────────────────────────────────
    function clear(storeName) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).clear();
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    // ── Sync queue: offline mutáció sorba állítása ───────────
    function addToSyncQueue(entry) {
        // entry: { table, action: 'insert'|'update'|'delete', data, timestamp }
        entry.status = 'pending';
        entry.timestamp = entry.timestamp || new Date().toISOString();
        return put('sync_queue', entry);
    }

    // ── Sync queue: várakozó bejegyzések ────────────────────
    function getSyncQueue() {
        return query('sync_queue', 'status', 'pending');
    }

    // ── Sync queue: feldolgozott bejegyzés törlése ──────────
    function removeSyncEntry(id) {
        return del('sync_queue', id);
    }

    // ── Meta: kulcs-érték pár írása ─────────────────────────
    function setMeta(key, value) {
        return put('meta', { key: key, value: value, updated: new Date().toISOString() });
    }

    // ── Meta: kulcs-érték pár olvasása ──────────────────────
    function getMeta(key) {
        return get('meta', key).then(function(entry) {
            return entry ? entry.value : null;
        });
    }

    // ── Publikus API ────────────────────────────────────────
    window.offlineDB = {
        open: open,
        put: put,
        putAll: putAll,
        getAll: getAll,
        get: get,
        delete: del,
        query: query,
        count: count,
        clear: clear,
        addToSyncQueue: addToSyncQueue,
        getSyncQueue: getSyncQueue,
        removeSyncEntry: removeSyncEntry,
        setMeta: setMeta,
        getMeta: getMeta
    };
})();
