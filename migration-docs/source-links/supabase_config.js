// --- js/supabase_config.js ---

const SUPABASE_URL = 'https://bjytiawckbibqmtlezfl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqeXRpYXdja2JpYnFtdGxlemZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDA5NTgsImV4cCI6MjA4ODk3Njk1OH0.0AChRcblBvDNPl_kEvxu9Fc9vDqBEKXlMmpyy-gyBQM'; 

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