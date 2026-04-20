// --- js/auth_roles.js ---

async function applySidebarRoles() {
    try {
        // getCachedProfile() — sessionStorage cache, 0 API hívás meleg indításnál
        const profile = typeof getCachedProfile === 'function' ? await getCachedProfile() : null;
        if (!profile) return;

        const isMasterAdmin = (profile.email === 'endreszocs@gmail.com');

        const role = profile.role || 'lelkesz';
        const hasCongregation = !!profile.congregation_id;
        
        // ÚJ DIAGNÓZIS ALAPJÁN: Az egyhazmegyei_admin hozzáadva!
        const isEsperes = (role === 'esperes') || (role === 'egyhazmegyei_admin') || (role === 'admin') || isMasterAdmin;
        const isAdmin = (role === 'admin') || isMasterAdmin;

        if (isEsperes) {
            document.getElementById('menu-em-header')?.classList.remove('d-none');
            document.getElementById('menu-em-link')?.classList.remove('d-none');
            document.querySelectorAll('.nav-btn-diocese').forEach(el => el.classList.remove('d-none'));
        }
        if (isAdmin) {
            document.getElementById('menu-ker-header')?.classList.remove('d-none');
            document.getElementById('menu-ker-link')?.classList.remove('d-none');
            document.querySelectorAll('.nav-btn-district').forEach(el => el.classList.remove('d-none'));
        }
        if (isMasterAdmin) {
            document.getElementById('menu-admin-link')?.classList.remove('d-none');
        }
        if (hasCongregation) {
            document.querySelectorAll('.nav-btn-congregation').forEach(el => el.classList.remove('d-none'));
        }
        
    } catch (err) {
        console.error("Szerepkör ellenőrzési hiba:", err);
    }
}

async function initHeaderData() {
    try {
        // getCachedProfile() — sessionStorage cache, 0 API hívás meleg indításnál
        const profile = typeof getCachedProfile === 'function' ? await getCachedProfile() : null;
        if (!profile) return;

        const pastorNameEl = document.getElementById('header-pastor-name');
        const congNameEl = document.getElementById('header-congregation-name');

        if (pastorNameEl && profile.full_name) pastorNameEl.innerText = profile.full_name;
        if (congNameEl && profile.congregation_id) {
            const congName = await getCachedCongregationName(profile.congregation_id);
            congNameEl.innerText = congName || 'Nincs gyülekezet rendelve';
        }
    } catch (err) {
        console.error('Hiba a fejléc betöltésekor:', err);
    }
}

async function signOut() {
    try {
        await _supabase.auth.signOut();
        window.location.href = '../index.html'; 
    } catch (error) {
        console.error('Hiba a kijelentkezéskor:', error);
    }
}

// ==========================================
// 🚨 SZUPERADMIN (GOD MODE) LOGIKA 🚨
// ==========================================

const MASTER_PIN = "1517"; // Titkos PIN kód a belépéshez
const GOD_MODE_DURATION = 2 * 60 * 60 * 1000; // 2 óra milliszekundumban
let godModeTimer = null;

// Ezt a funkciót hívjuk meg a header.html gombjából
window.openGodModeModal = function() {
    document.getElementById('god-mode-pin').value = '';
    document.getElementById('god-mode-error').classList.add('d-none');
    new bootstrap.Modal(document.getElementById('modal-god-mode-login')).show();
};

// PIN kód ellenőrzése
window.activateGodMode = function() {
    const pin = document.getElementById('god-mode-pin').value;
    if (pin === MASTER_PIN) {
        const expiryTime = Date.now() + GOD_MODE_DURATION;
        sessionStorage.setItem('god_mode_expiry', expiryTime);
        
        bootstrap.Modal.getInstance(document.getElementById('modal-god-mode-login')).hide();
        applyGodModeUI();
        startGodModeTimer();
    } else {
        document.getElementById('god-mode-error').classList.remove('d-none');
    }
};

// Kijelentkezés a Szuperadmin módból
window.deactivateGodMode = function() {
    sessionStorage.removeItem('god_mode_expiry');
    if (godModeTimer) clearInterval(godModeTimer);
    
    // Frissítjük az oldalt, hogy minden gomb visszatérjen a normál állapotba
    window.location.reload(); 
};

// Dinamikusan betölti a Tömeges Import függőségeit, ha még nem töltötték be az aktuális oldal
function _loadMassImportGlobally() {
    if (window._massImportLoading) return;
    window._massImportLoading = true;

    const loadScript = (src) => new Promise((resolve) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => { console.warn('Szkript betöltési hiba:', src); resolve(); };
        document.head.appendChild(s);
    });

    loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js')
        .then(() => Promise.all([
            loadScript('js/mass_import_api.js'),
            loadScript('js/superadmin_import_api.js')
        ]))
        .then(() => {
            let ph = document.getElementById('modal-mass-import-placeholder');
            if (!ph) {
                ph = document.createElement('div');
                ph.id = 'modal-mass-import-placeholder';
                document.body.appendChild(ph);
            }
            if (!ph.innerHTML.trim()) {
                fetch('components/modal_mass_import.html')
                    .then(r => r.text())
                    .then(html => { ph.innerHTML = html; })
                    .catch(err => console.warn('Modal betöltési hiba:', err));
            }
        })
        .catch(err => console.error('Tömeges Import betöltési hiba:', err));
}

// UI frissítése, ha aktív a God Mode
window.applyGodModeUI = function() {
    const expiry = sessionStorage.getItem('god_mode_expiry');
    if (expiry && Date.now() < parseInt(expiry)) {
        // Fejléc pirosra festése és figyelmeztető sáv megjelenítése
        const header = document.querySelector('header.navbar');
        if (header) header.style.background = 'linear-gradient(to right, #ffe3e3, #ffffff)';

        const godBanner = document.getElementById('god-mode-active-banner');
        if (godBanner) godBanner.classList.remove('d-none');

        // Tömeges Import gomb megjelenítése + függőségek betöltése ha szükséges
        const massImportBtn = document.getElementById('btn-mass-import');
        if (massImportBtn) {
            massImportBtn.classList.remove('d-none');
            if (!window.openMassImportModal) _loadMassImportGlobally();
        }

        // Nem-ellenőrzés gomb megjelenítése (csak tagnyilvantartas.html-en van ilyen)
        const genderCheckBtn = document.getElementById('btn-gender-check');
        if (genderCheckBtn) genderCheckBtn.classList.remove('d-none');
    }
};

// A 2 órás időzítő
window.startGodModeTimer = function() {
    const expiry = sessionStorage.getItem('god_mode_expiry');
    if (!expiry) return;

    if (godModeTimer) clearInterval(godModeTimer);
    
    godModeTimer = setInterval(() => {
        const timeLeft = parseInt(expiry) - Date.now();
        
        if (timeLeft <= 0) {
            // Lejárt az idő!
            deactivateGodMode();
        } else if (timeLeft <= 60000 && timeLeft > 59000) {
            // Pontosan 1 perc van hátra -> Figyelmeztetés
            new bootstrap.Modal(document.getElementById('modal-god-mode-warning')).show();
        }
    }, 1000); // Másodpercenként ellenőriz
};

// 🚨 Eredeti funkciók kiegészítése!
// Beépítjük a God Mode indítást a meglévő ellenőrzésbe
const originalApplySidebarRoles = applySidebarRoles;
applySidebarRoles = async function() {
    await originalApplySidebarRoles(); // Lefut a régi

    try {
        // getCachedProfile() — nem generál extra API hívást
        const profile = typeof getCachedProfile === 'function' ? await getCachedProfile() : null;
        if (profile && profile.email === 'endreszocs@gmail.com') {
            const secretDoor = document.getElementById('god-mode-menu-item');
            if (secretDoor) secretDoor.classList.remove('d-none');
        }

        // Ellenőrizzük, aktív-e a God Mode
        if (sessionStorage.getItem('god_mode_expiry')) {
            applyGodModeUI();
            startGodModeTimer();
        }

        // Admin override banner: ha a rendszergazda más gyülekezet adatait nézi
        // BIZTONSÁGI ELLENŐRZÉS: csak aktív engedéllyel!
        const adminOverride = sessionStorage.getItem('admin_override_congregation');
        if (adminOverride && profile && profile.email === 'endreszocs@gmail.com') {
            try {
                const ov = JSON.parse(adminOverride);
                if (ov.id) {
                    // Ellenőrizzük, van-e aktív, jóváhagyott engedély
                    const { data: accessOk } = await _supabase.from('admin_access_requests')
                        .select('id, expires_at')
                        .eq('congregation_id', ov.id)
                        .eq('status', 'approved')
                        .gt('expires_at', new Date().toISOString())
                        .limit(1);

                    if (accessOk && accessOk.length > 0) {
                        // Aktív engedély — banner megjelenítése hátralévő idővel
                        const remaining = Math.round((new Date(accessOk[0].expires_at) - Date.now()) / 60000);
                        if (ov.name) _showAdminOverrideBanner(ov.name, remaining);
                    } else {
                        // Nincs engedély — override törlése, visszairányítás
                        sessionStorage.removeItem('admin_override_congregation');
                        if (typeof invalidateProfileCache === 'function') invalidateProfileCache();
                        alert('A hozzáférési engedély lejárt vagy nem létezik.\n\nVisszairányítás az admin oldalra.');
                        window.location.href = 'admin.html';
                    }
                }
            } catch(e) { console.error('Admin engedély-ellenőrzés hiba:', e); }
        }
    } catch (err) { console.error(err); }
};

// Admin override banner megjelenítése (hátralévő idő mutatásával)
function _showAdminOverrideBanner(congName, remainingMinutes) {
    if (document.getElementById('admin-override-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'admin-override-banner';
    banner.style.cssText = 'background:linear-gradient(90deg,#dc2626,#b91c1c);color:white;padding:8px 16px;text-align:center;font-weight:700;font-size:0.9rem;position:relative;z-index:9999;';
    const timeStr = remainingMinutes ? ' <span class="badge bg-white text-dark ms-2" style="font-size:0.75rem;"><i class="ti ti-clock me-1"><\/i>' + remainingMinutes + ' perc hátra<\/span>' : '';
    banner.innerHTML = '<i class="ti ti-shield-lock me-2"><\/i>Engedélyezett hozzáférés — ' +
        congName + ' gyülekezet adatai' + timeStr +
        '<button onclick="exitAdminOverride()" class="btn btn-sm btn-outline-light ms-3" style="padding:2px 12px;font-size:0.8rem;">' +
        '<i class="ti ti-arrow-back me-1"><\/i>Kilépés<\/button>';
    document.body.insertBefore(banner, document.body.firstChild);
}

// Admin override kilépés
window.exitAdminOverride = function() {
    sessionStorage.removeItem('admin_override_congregation');
    if (typeof invalidateProfileCache === 'function') invalidateProfileCache();
    // Cache-busting: timestamp paraméter, hogy biztosan frissüljön
    window.location.href = 'admin.html?t=' + Date.now();
};