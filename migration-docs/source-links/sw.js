/**
 * Kartotéka — Service Worker
 * Statikus assetek cache-first, API hívások network-first stratégiával.
 */

var CACHE_VERSION = 'kartoteka-v23';
var STATIC_CACHE = CACHE_VERSION + '-static';
var DYNAMIC_CACHE = CACHE_VERSION + '-dynamic';

// Statikus assetek — azonnal cache-elődnek telepítéskor
var PRECACHE_URLS = [
    // Vendor könyvtárak
    'assets/vendor/tabler/css/tabler.min.css',
    'assets/vendor/tabler-icons/tabler-icons.min.css',
    'assets/vendor/tabler-icons/fonts/tabler-icons.woff2',
    'assets/vendor/bootstrap/bootstrap.bundle.min.js',
    'assets/vendor/supabase/supabase.min.js',
    'assets/vendor/inter/inter.css',
    'assets/vendor/inter/InterVariable.woff2',
    // JS bundle-ök (ÖSSZES)
    'pages/js/dist/common.min.js',
    'pages/js/dist/dashboard.min.js',
    'pages/js/dist/admin.min.js',
    'pages/js/dist/anyakonyv.min.js',
    'pages/js/dist/tagnyilvantartas.min.js',
    'pages/js/dist/penzugy.min.js',
    'pages/js/dist/munkanaplo.min.js',
    'pages/js/dist/leltar.min.js',
    'pages/js/dist/misszios.min.js',
    'pages/js/dist/iktato.min.js',
    'pages/js/dist/sirhelyek.min.js',
    'pages/js/dist/misszios_sziget.min.js',
    'pages/js/dist/egyhazmegye.min.js',
    // CSS
    'assets/css/styles.css',
    // Képek
    'assets/images/favicon.png',
    'assets/images/icon-192.png',
    'assets/images/icon-512.png',
    // Manifest
    'manifest.json'
];

// HTML oldalak — cache-first (de hálózatról frissül háttérben)
var HTML_PAGES = [
    'index.html',
    'pages/dashboard.html',
    'pages/tagnyilvantartas.html',
    'pages/penzugy.html',
    'pages/anyakonyv.html',
    'pages/munkanaplo.html',
    'pages/iktato.html',
    'pages/leltar.html',
    'pages/misszios_muhely.html',
    'pages/sirhelyek.html',
    'pages/hasznalati_utmutato.html',
    'pages/felhasznaloi_feltetelek.html',
    'pages/dashboard_egyhazmegye.html',
    'pages/dashboard_kerulet.html',
    'pages/lelkeszi_misszios_muhely.html',
    'pages/csaladok.html',
    'pages/admin.html'
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(STATIC_CACHE).then(function(cache) {
            console.log('[SW] Precache telepítése...');
            return cache.addAll(PRECACHE_URLS.concat(HTML_PAGES));
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(name) {
                    return name.startsWith('kartoteka-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE;
                }).map(function(name) {
                    console.log('[SW] Régi cache törölve:', name);
                    return caches.delete(name);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // Csak GET kéréseket cache-elünk (HEAD, POST, PATCH, DELETE nem cache-elhető)
    if (event.request.method !== 'GET') {
        return;
    }

    // Auth hívások — SOHA nem cache-eltek
    if (url.pathname.includes('/auth/') || url.pathname.includes('/token')) {
        return;
    }

    // Supabase REST API hívások — network-first, cache fallback
    if (url.hostname.includes('supabase.co') && url.pathname.includes('/rest/')) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Supabase Storage (statikus fájlok) — stale-while-revalidate
    if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
        event.respondWith(staleWhileRevalidate(event.request));
        return;
    }

    // CDN erőforrások (lazy-loaded könyvtárak) — cache-first
    if (url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('cdnjs.cloudflare.com') ||
        url.hostname.includes('cdn.sheetjs.com') ||
        url.hostname.includes('balkan.app')) {
        event.respondWith(cacheFirst(event.request, DYNAMIC_CACHE));
        return;
    }

    // Lokális JS bundle-ök és HTML komponensek — network-first (mindig friss kód)
    if (url.pathname.includes('/dist/') || url.pathname.includes('/components/')) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Lokális statikus assetek (CSS, font, kép) — cache-first
    if (event.request.destination === 'style' ||
        event.request.destination === 'script' ||
        event.request.destination === 'font' ||
        event.request.destination === 'image') {
        event.respondWith(cacheFirst(event.request, STATIC_CACHE));
        return;
    }

    // HTML oldalak — stale-while-revalidate
    if (event.request.destination === 'document' ||
        event.request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(staleWhileRevalidate(event.request));
        return;
    }

    // Egyéb — network-first
    event.respondWith(networkFirst(event.request));
});

// ── STRATÉGIÁK ───────────────────────────────────────────────

/**
 * Cache-first: cache-ből szolgál, ha van; egyébként hálózat + cache frissítés
 */
function cacheFirst(request, cacheName) {
    return caches.match(request).then(function(cached) {
        if (cached) return cached;
        return fetch(request).then(function(response) {
            if (response.ok) {
                var clone = response.clone();
                caches.open(cacheName).then(function(cache) {
                    cache.put(request, clone);
                });
            }
            return response;
        }).catch(function() {
            // Offline — nincs cache, nincs hálózat
            return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
    });
}

/**
 * Network-first: hálózatról szolgál, ha lehet; egyébként cache fallback
 */
function networkFirst(request) {
    return fetch(request).then(function(response) {
        if (response.ok) {
            var clone = response.clone();
            caches.open(DYNAMIC_CACHE).then(function(cache) {
                cache.put(request, clone);
            });
        }
        return response;
    }).catch(function() {
        return caches.match(request).then(function(cached) {
            return cached || new Response('{"error":"offline"}', {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            });
        });
    });
}

/**
 * Stale-while-revalidate: cache-ből azonnal szolgál + háttérben frissít
 */
function staleWhileRevalidate(request) {
    return caches.open(DYNAMIC_CACHE).then(function(cache) {
        return cache.match(request).then(function(cached) {
            var fetchPromise = fetch(request).then(function(response) {
                if (response.ok) {
                    cache.put(request, response.clone());
                }
                return response;
            }).catch(function() {
                return cached;
            });
            return cached || fetchPromise;
        });
    });
}

// ── ÜZENETEK ─────────────────────────────────────────────────
self.addEventListener('message', function(event) {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    if (event.data === 'clearCache') {
        caches.keys().then(function(names) {
            names.forEach(function(name) { caches.delete(name); });
        });
    }
});
