// ============================================================
//  KARTOTÉKA — Session Cache
//  Felhasználói profil és gyülekezeti adatok cache-elése
//  sessionStorage-ban, hogy ne kelljen minden oldalon
//  újra lekérdezni a Supabase-t
// ============================================================

(function() {
    var PROFILE_KEY = 'krt_profile';
    var PROFILE_TTL = 5 * 60 * 1000; // 5 perc

    /**
     * Felhasználói profil lekérdezése cache-ből vagy Supabase-ből
     * Tartalmazza: id, full_name, role, congregation_id, email, user_id
     * @returns {Promise<object|null>}
     */
    window.getCachedProfile = async function() {
        // Cache ellenőrzés
        var cached = sessionStorage.getItem(PROFILE_KEY);
        if (cached) {
            try {
                var parsed = JSON.parse(cached);
                if (Date.now() - parsed._ts < PROFILE_TTL) return parsed;
            } catch(e) { /* sérült cache, újra lekérdezzük */ }
        }

        // Supabase lekérdezés
        if (!window._supabase) return null;
        var userRes = await _supabase.auth.getUser();
        if (!userRes.data || !userRes.data.user) return null;
        var user = userRes.data.user;

        var profRes = await _supabase.from('profiles')
            .select('id, full_name, role, congregation_id')
            .eq('id', user.id)
            .single();

        if (!profRes.data) return null;

        var result = {
            id: profRes.data.id,
            full_name: profRes.data.full_name,
            role: profRes.data.role,
            congregation_id: profRes.data.congregation_id,
            email: user.email,
            user_id: user.id,
            _ts: Date.now()
        };

        // Rendszergazda gyülekezet-váltás: override congregation_id
        // BIZTONSÁGI ELLENŐRZÉS: csak jóváhagyott, nem lejárt engedéllyel!
        var adminOverride = sessionStorage.getItem('admin_override_congregation');
        if (adminOverride && user.email === 'endreszocs@gmail.com') {
            try {
                var ov = JSON.parse(adminOverride);
                if (ov.id) {
                    // Ellenőrizzük, van-e aktív engedély
                    var accessCheck = await _supabase.from('admin_access_requests')
                        .select('id, expires_at')
                        .eq('congregation_id', ov.id)
                        .eq('status', 'approved')
                        .gt('expires_at', new Date().toISOString())
                        .limit(1);

                    if (accessCheck.data && accessCheck.data.length > 0) {
                        result.congregation_id = ov.id;
                    } else {
                        // Nincs érvényes engedély — override törlése!
                        sessionStorage.removeItem('admin_override_congregation');
                        console.warn('Admin override törölve: nincs aktív engedély.');
                    }
                }
            } catch(e) {
                console.error('Admin engedély-ellenőrzés hiba:', e);
            }
        }

        try { sessionStorage.setItem(PROFILE_KEY, JSON.stringify(result)); } catch(e) {}
        return result;
    };

    /**
     * Gyülekezet neve lekérdezése cache-ből vagy Supabase-ből
     * @param {string} congregationId - gyülekezet UUID
     * @returns {Promise<string>}
     */
    window.getCachedCongregationName = async function(congregationId) {
        if (!congregationId) return '';
        var CONG_KEY = 'krt_cong_' + congregationId;
        var cached = sessionStorage.getItem(CONG_KEY);
        if (cached) return cached;

        var res = await _supabase.from('congregations')
            .select('name')
            .eq('id', congregationId)
            .single();

        var name = (res.data && res.data.name) || '';
        if (name) {
            try { sessionStorage.setItem(CONG_KEY, name); } catch(e) {}
        }
        return name;
    };

    /**
     * Profil cache invalidálása (pl. profil szerkesztés után)
     */
    window.invalidateProfileCache = function() {
        sessionStorage.removeItem(PROFILE_KEY);
    };
})();
