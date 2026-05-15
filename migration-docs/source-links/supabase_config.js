// --- js/supabase_config.js ---
// NOTE: ez egy v0.x legacy snapshot (migration reference) — productionben env-ből
// (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`). A konkrét értékek
// maszkolva: lásd Railway / `.env.local`.

const SUPABASE_URL = 'https://<YOUR-PROJECT-REF>.supabase.co';
const SUPABASE_ANON_KEY = '<NEXT_PUBLIC_SUPABASE_ANON_KEY>';

// A 'window' objektumhoz kapcsoljuk, így minden HTML oldal garantáltan látni fogja a _supabase változót!
if (typeof supabase !== 'undefined') {
    window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error("Hiba: A Supabase alapkönyvtár nem töltődött be a CDN-ről!");
}

// ── Auth Guard — nem bejelentkezett felhasználók átirányítása ───
// Az index.html (login oldal) kihagyja, csak a /pages/ alatti oldalak ellenőriznek
(function() {
    var isLoginPage = (window.location.pathname.indexOf('/pages/') === -1) ||
                      window.location.pathname.endsWith('/index.html');
    if (isLoginPage || !window._supabase) return;

    window._supabase.auth.getSession().then(function(result) {
        var session = result.data && result.data.session;
        if (!session) {
            // Nincs aktív session → visszairányítás a bejelentkezési oldalra
            console.warn('[Auth Guard] Nincs bejelentkezve — átirányítás a bejelentkezési oldalra');
            window.location.href = '../index.html';
        }
    }).catch(function() {
        window.location.href = '../index.html';
    });

    // Session lejárat figyelése — ha kijelentkezik egy másik lapon, ez is átirányít
    window._supabase.auth.onAuthStateChange(function(event) {
        if (event === 'SIGNED_OUT') {
            window.location.href = '../index.html';
        }
    });
})();

// ── Service Worker regisztráció ──────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        // SW a gyökérben van, az oldal a pages/ mappában — relatív útvonal
        var swPath = window.location.pathname.includes('/pages/') ? '../sw.js' : 'sw.js';
        navigator.serviceWorker.register(swPath, { scope: '/' }).then(function(reg) {
            // Automatikus frissítés ellenőrzés
            reg.addEventListener('updatefound', function() {
                var newWorker = reg.installing;
                newWorker.addEventListener('statechange', function() {
                    if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                        console.log('[SW] Új verzió elérhető — frissítés oldal újratöltésekor');
                    }
                });
            });
        }).catch(function(err) {
            console.warn('[SW] Regisztráció sikertelen:', err.message);
        });
    });
}