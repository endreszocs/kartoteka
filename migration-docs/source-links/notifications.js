// ═══════════════════════════════════════════════════════════════════
// notifications.js — Értesítések kezelése (csengő, Realtime, toast)
// Az ertesitesek tábla lekérdezése, megjelenítése, valós idejű frissítés
// ═══════════════════════════════════════════════════════════════════

(function() {

    // Értesítések tárolása a kinagyított nézethez
    window._notificationCache = {};

    // ── Értesítések betöltése a csengőbe ──
    window.loadNotifications = async function() {
        if (!window._supabase) return;

        try {
            // Aktuális felhasználó lekérdezése (diagnosztika)
            var userRes = await _supabase.auth.getUser();
            var currentUserId = (userRes.data && userRes.data.user) ? userRes.data.user.id : null;
            var currentEmail = (userRes.data && userRes.data.user) ? userRes.data.user.email : null;
            console.log('[Értesítések] Felhasználó:', currentEmail, '| auth.uid():', currentUserId);

            // Az RLS policy szűri: user_id = auth.uid() VAGY congregation_id egyezés
            var { data: notifs, error } = await _supabase
                .from('ertesitesek')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) {
                console.error('[Értesítések] Lekérdezési hiba:', error);
                throw error;
            }

            console.log('[Értesítések] Betöltve:', (notifs || []).length, 'db');

            var list = document.getElementById('notification-list');
            var badge = document.getElementById('notification-badge');
            if (!list || !badge) return;

            if (!notifs || notifs.length === 0) {
                list.innerHTML = '<div class="list-group-item text-center py-4 text-muted small"><i class="ti ti-mail-opened fs-2 d-block mb-2 text-gray-300"></i>Nincsenek új értesítések.</div>';
                badge.classList.add('d-none');
                window._notificationCache = {};
                return;
            }

            // Cache az összes értesítést a kinagyított nézethez
            window._notificationCache = {};
            notifs.forEach(function(n) { window._notificationCache[n.id] = n; });

            var unreadCount = 0;
            var html = '';

            notifs.forEach(function(n) {
                if (!n.olvasva) unreadCount++;

                var icon = 'ti-info-circle'; var color = 'blue';
                if (n.tipus === 'success') { icon = 'ti-check'; color = 'green'; }
                if (n.tipus === 'danger') { icon = 'ti-alert-triangle'; color = 'red'; }
                if (n.tipus === 'warning') { icon = 'ti-alert-circle'; color = 'yellow'; }
                if (n.tipus === 'support_reply') { icon = 'ti-headset'; color = 'purple'; }

                var bgClass = n.olvasva ? '' : 'bg-blue-lt border-start border-3 border-blue';
                var dateStr = new Date(n.created_at).toLocaleString('hu-HU', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});

                // Csonkolt üzenet a listában (max 80 karakter)
                var shortMsg = (n.uzenet || '').length > 80 ? n.uzenet.substring(0, 80) + '...' : (n.uzenet || '');

                html += '<div class="list-group-item ' + bgClass + ' px-3 py-3" style="cursor:pointer; transition: 0.2s;" onclick="openNotificationDetail(\'' + n.id + '\', this)">' +
                    '<div class="row align-items-start">' +
                        '<div class="col-auto pt-1"><span class="avatar avatar-xs bg-' + color + ' text-white rounded-circle"><i class="ti ' + icon + '"></i></span></div>' +
                        '<div class="col text-break pe-0">' +
                            '<div class="text-body fw-bold lh-sm mb-1">' + (n.cim || '').replace(/</g, '&lt;') + '</div>' +
                            '<div class="text-muted small lh-sm" style="font-size:0.75rem;">' + shortMsg.replace(/</g, '&lt;') + '</div>' +
                        '</div>' +
                        '<div class="col-auto ps-2 text-muted" style="font-size:0.7rem;">' + dateStr + '</div>' +
                    '</div>' +
                '</div>';
            });

            list.innerHTML = html;

            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
        } catch (err) {
            console.error("Értesítések lekérése sikertelen:", err);
        }
    };

    // ── Értesítés kinagyított megnyitása ──
    window.openNotificationDetail = async function(id, elem) {
        var n = window._notificationCache[id];
        if (!n) return;

        // Olvasottnak jelölés (ha még nem az)
        if (elem && elem.classList.contains('bg-blue-lt')) {
            try {
                await _supabase.from('ertesitesek').update({ olvasva: true }).eq('id', id);
                elem.classList.remove('bg-blue-lt', 'border-start');
                var badge = document.getElementById('notification-badge');
                var count = parseInt(badge.textContent) || 0;
                if (count > 1) { badge.textContent = count - 1; }
                else { badge.classList.add('d-none'); }
            } catch(err) { console.error(err); }
        }

        // Modal feltöltése
        var icon = 'ti-info-circle'; var color = 'blue'; var typeLabel = 'Rendszerüzenet';
        if (n.tipus === 'success') { icon = 'ti-check'; color = 'green'; typeLabel = 'Sikeres művelet'; }
        if (n.tipus === 'danger') { icon = 'ti-alert-triangle'; color = 'red'; typeLabel = 'Figyelmeztetés'; }
        if (n.tipus === 'warning') { icon = 'ti-alert-circle'; color = 'yellow'; typeLabel = 'Figyelmeztetés'; }
        if (n.tipus === 'support_reply') { icon = 'ti-headset'; color = 'purple'; typeLabel = 'Válasz a segítségkérésre'; }
        if (n.tipus === 'admin_access') { icon = 'ti-lock-access'; color = 'red'; typeLabel = 'Hozzáférés-kérés'; }

        var dateStr = new Date(n.created_at).toLocaleString('hu-HU', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        document.getElementById('notif-detail-icon').className = 'ti ' + icon + ' me-2';
        document.getElementById('notif-detail-title').textContent = n.cim || 'Értesítés';
        document.getElementById('notif-detail-type').innerHTML = '<span class="badge bg-' + color + '-lt text-' + color + '">' + typeLabel + '</span>';
        document.getElementById('notif-detail-date').textContent = dateStr;

        // Üzenet tartalom — sortörésekkel
        var msgHtml = (n.uzenet || 'Nincs részletes tartalom.').replace(/</g, '&lt;').replace(/\n/g, '<br>');
        document.getElementById('notif-detail-message').innerHTML = msgHtml;

        // Hivatkozás gomb
        var linkBtn = document.getElementById('notif-detail-link');
        // Admin hozzáférés-kérés: jóváhagyás/elutasítás gombok
        var accessBtns = document.getElementById('notif-detail-access-buttons');
        if (n.tipus === 'admin_access' && n.hivatkozas === 'admin_access_approve') {
            if (linkBtn) linkBtn.classList.add('d-none');
            if (accessBtns) {
                accessBtns.classList.remove('d-none');
                accessBtns.innerHTML = '<div class="d-flex gap-2 justify-content-center">' +
                    '<button class="btn btn-success" onclick="approveAdminAccess(\'' + n.id + '\')"><i class="ti ti-check me-1"><\/i>Jóváhagyom (2 óra)<\/button>' +
                    '<button class="btn btn-danger" onclick="denyAdminAccess(\'' + n.id + '\')"><i class="ti ti-x me-1"><\/i>Elutasítom<\/button>' +
                    '<\/div>';
            }
        } else {
            if (accessBtns) accessBtns.classList.add('d-none');
            if (n.hivatkozas) {
                linkBtn.href = n.hivatkozas;
                linkBtn.classList.remove('d-none');
            } else {
                linkBtn.classList.add('d-none');
            }
        }

        // Modal megnyitása
        var modalEl = document.getElementById('modal-notification-detail');
        var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    };

    // Legacy kompatibilitás
    window.markAsRead = async function(id, elem) {
        window.openNotificationDetail(id, elem);
    };

    // ═══════════════════════════════════════════════════════════════
    // REALTIME ÉRTESÍTÉSEK — Supabase Realtime subscription
    // ═══════════════════════════════════════════════════════════════

    window._setupRealtimeNotifications = async function() {
        if (!window._supabase) return;

        try {
            var res = await _supabase.auth.getUser();
            if (!res.data || !res.data.user) return;
            var userId = res.data.user.id;

            // Korábbi feliratkozás leállítása (ha van)
            if (window._notifRealtimeChannel) {
                _supabase.removeChannel(window._notifRealtimeChannel);
            }

            // Feliratkozás az ertesitesek tábla INSERT eseményeire
            var channel = _supabase
                .channel('ertesitesek-realtime-' + userId.substring(0, 8))
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'ertesitesek'
                }, function(payload) {
                    console.log('[Realtime] Új értesítés érkezett:', payload.new);
                    window.loadNotifications();

                    var n = payload.new;
                    if (n && n.cim) {
                        window._showRealtimeToast(n.cim, n.uzenet || '', n.tipus || 'info');
                    }
                })
                .subscribe(function(status) {
                    console.log('[Realtime] Értesítések csatorna státusz:', status);
                });

            window._notifRealtimeChannel = channel;
            console.log('[Realtime] Értesítések feliratkozás aktív.');

        } catch (err) {
            console.error('[Realtime] Értesítés feliratkozás hiba:', err);
        }
    };

    // ── Toast értesítés (jobb felső sarok, automatikusan eltűnik) ──
    window._showRealtimeToast = function(title, message, type) {
        var container = document.getElementById('realtime-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'realtime-toast-container';
            container.style.cssText = 'position:fixed; top:70px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:10px; max-width:380px;';
            document.body.appendChild(container);
        }

        var iconMap = {
            info: 'ti-info-circle text-blue',
            success: 'ti-check text-green',
            danger: 'ti-alert-triangle text-red',
            warning: 'ti-alert-circle text-yellow',
            support_reply: 'ti-headset text-purple'
        };
        var bgMap = {
            info: 'bg-blue-lt border-blue',
            success: 'bg-green-lt border-green',
            danger: 'bg-red-lt border-red',
            warning: 'bg-yellow-lt border-yellow',
            support_reply: 'bg-purple-lt border-purple'
        };
        var icon = iconMap[type] || iconMap.info;
        var bg = bgMap[type] || bgMap.info;

        var shortMsg = (message || '').length > 100 ? message.substring(0, 100) + '...' : message;

        var toast = document.createElement('div');
        toast.className = 'card shadow-lg border-start border-3 ' + bg;
        toast.style.cssText = 'animation: slideInRight 0.3s ease-out; cursor:pointer; min-width:300px;';
        toast.innerHTML = '<div class="card-body p-3">' +
            '<div class="d-flex align-items-start">' +
                '<span class="avatar avatar-sm rounded-circle bg-white shadow-sm me-3 mt-1"><i class="ti ' + icon + ' fs-3"></i></span>' +
                '<div class="flex-fill">' +
                    '<div class="fw-bold text-body mb-1">' + (title || '').replace(/</g, '&lt;') + '</div>' +
                    '<div class="text-muted small">' + shortMsg.replace(/</g, '&lt;') + '</div>' +
                '</div>' +
                '<button type="button" class="btn-close ms-2" style="font-size:0.6rem;" onclick="this.closest(\'.card\').remove()"></button>' +
            '</div>' +
        '</div>';

        toast.addEventListener('click', function(e) {
            if (e.target.classList.contains('btn-close')) return;
            var bellBtn = document.querySelector('[aria-label="Értesítések"]');
            if (bellBtn) bellBtn.click();
            toast.remove();
        });

        container.appendChild(toast);

        // Hang értesítés
        try {
            var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.value = 0.1;
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            osc.stop(audioCtx.currentTime + 0.3);
        } catch(e) { /* hang nem támogatott */ }

        // Automatikus eltűnés 8 mp után
        setTimeout(function() {
            if (toast.parentNode) {
                toast.style.animation = 'fadeOut 0.5s ease-out forwards';
                setTimeout(function() { if (toast.parentNode) toast.remove(); }, 500);
            }
        }, 8000);
    };

    // CSS animációk hozzáadása
    if (!document.getElementById('realtime-toast-styles')) {
        var styleEl = document.createElement('style');
        styleEl.id = 'realtime-toast-styles';
        styleEl.textContent = '@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } @keyframes fadeOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100%); } }';
        document.head.appendChild(styleEl);
    }

    // ── Inicializálás: várakozás a header DOM betöltésére ──
    function _tryNotifInit() {
        var bell = document.getElementById('notification-badge');
        if (bell && window._supabase) {
            console.log('[Értesítések] Inicializálás...');
            window.loadNotifications();
            // Realtime 1 mp-cel később (auth kell hozzá)
            setTimeout(function() { window._setupRealtimeNotifications(); }, 1000);
        } else {
            if (!_tryNotifInit._count) _tryNotifInit._count = 0;
            _tryNotifInit._count++;
            if (_tryNotifInit._count < 30) setTimeout(_tryNotifInit, 500);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(_tryNotifInit, 1500); });
    } else {
        setTimeout(_tryNotifInit, 1500);
    }

    // ── Online/Offline indikátor ─────────────────────────────
    function _createOfflineBanner() {
        if (document.getElementById('offline-banner')) return;
        var banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#ef4444;color:#fff;text-align:center;padding:6px 12px;font-size:0.85rem;font-weight:600;display:none;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
        banner.innerHTML = '<i class="ti ti-wifi-off" style="margin-right:6px;"></i>Offline mód — az adatok a helyi gyorsítótárból származnak';
        document.body.insertBefore(banner, document.body.firstChild);
    }

    function _showOffline() {
        _createOfflineBanner();
        var b = document.getElementById('offline-banner');
        if (b) b.style.display = 'block';
        document.body.style.paddingTop = '34px';
    }

    function _hideOffline() {
        var b = document.getElementById('offline-banner');
        if (b) b.style.display = 'none';
        document.body.style.paddingTop = '';
    }

    window.addEventListener('offline', _showOffline);
    window.addEventListener('online', _hideOffline);
    if (!navigator.onLine) _showOffline();

    // Periodikus navigator.onLine ellenőrzés (fallback — egyes böngészők nem mindig triggerelnek offline eventet)
    var _lastOnlineState = navigator.onLine;
    setInterval(function() {
        if (navigator.onLine !== _lastOnlineState) {
            _lastOnlineState = navigator.onLine;
            if (navigator.onLine) { _hideOffline(); } else { _showOffline(); }
        }
    }, 2000);

    // ── PWA Telepítési prompt ─────────────────────────────────
    var _deferredInstallPrompt = null;

    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        _deferredInstallPrompt = e;

        // Oldal-szintű letiltás (pl. lelkeszi_misszios_muhely.html)
        if (window.__SKIP_PWA_BANNER) return;

        // Ne mutassuk ha a felhasználó nemrég elutasította (7 nap)
        var dismissed = localStorage.getItem('pwa_install_dismissed');
        if (dismissed && (Date.now() - parseInt(dismissed)) < 604800000) return;

        // Ne mutassuk ha már telepítve van (standalone módban fut)
        if (window.matchMedia('(display-mode: standalone)').matches) return;

        // 3 mp késleltetés — ne zavarjuk rögtön az oldal betöltésekor
        setTimeout(_showInstallBanner, 3000);
    });

    window.addEventListener('appinstalled', function() {
        _deferredInstallPrompt = null;
        _hideInstallBanner();
        console.log('[PWA] Alkalmazás sikeresen telepítve!');
    });

    function _showInstallBanner() {
        if (document.getElementById('pwa-install-banner')) return;

        var imgPath = window.location.pathname.indexOf('/pages/') !== -1
            ? '../assets/images/icon-192.png'
            : 'assets/images/icon-192.png';

        var banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9998;max-width:460px;width:calc(100% - 32px);animation:slideUp 0.4s ease-out;';
        banner.innerHTML = '<div class="card shadow-lg border-0" style="border-radius:12px;overflow:hidden;">' +
            '<div class="card-body p-3">' +
                '<div class="d-flex align-items-center">' +
                    '<img src="' + imgPath + '" width="48" height="48" style="border-radius:12px;" class="me-3" alt="Kartotéka">' +
                    '<div class="flex-fill">' +
                        '<div class="fw-bold text-body">Kartotéka telepítése</div>' +
                        '<div class="text-muted small">Alkalmazásként a kezdőképernyőre</div>' +
                    '</div>' +
                    '<button id="pwa-install-btn" class="btn btn-primary btn-sm me-2" style="white-space:nowrap;"><i class="ti ti-download me-1"></i>Telepítés</button>' +
                    '<button id="pwa-dismiss-btn" class="btn btn-ghost-secondary btn-sm btn-icon"><i class="ti ti-x"></i></button>' +
                '</div>' +
            '</div>' +
        '</div>';

        document.body.appendChild(banner);

        document.getElementById('pwa-install-btn').addEventListener('click', function() {
            if (_deferredInstallPrompt) {
                _deferredInstallPrompt.prompt();
                _deferredInstallPrompt.userChoice.then(function(result) {
                    console.log('[PWA] Telepítési döntés:', result.outcome);
                    _deferredInstallPrompt = null;
                    _hideInstallBanner();
                });
            }
        });

        document.getElementById('pwa-dismiss-btn').addEventListener('click', function() {
            localStorage.setItem('pwa_install_dismissed', Date.now().toString());
            _hideInstallBanner();
        });
    }

    function _hideInstallBanner() {
        var b = document.getElementById('pwa-install-banner');
        if (b) {
            b.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(function() { if (b.parentNode) b.remove(); }, 300);
        }
    }

    // PWA telepítés manuális indítása (pl. beállítások menüből)
    window.triggerPWAInstall = function() {
        if (_deferredInstallPrompt) {
            _deferredInstallPrompt.prompt();
            _deferredInstallPrompt.userChoice.then(function(result) {
                console.log('[PWA] Telepítési döntés:', result.outcome);
                _deferredInstallPrompt = null;
            });
        } else if (window.matchMedia('(display-mode: standalone)').matches) {
            alert('Az alkalmazás már telepítve van!');
        } else {
            alert('A telepítés jelenleg nem elérhető.\nHasználd a böngésző menüt:\nChrome/Edge: ⋮ → Alkalmazás telepítése\nSafari: Megosztás → Kezdőképernyőre');
        }
    };

    // slideUp animáció
    if (!document.getElementById('pwa-install-styles')) {
        var s = document.createElement('style');
        s.id = 'pwa-install-styles';
        s.textContent = '@keyframes slideUp{from{transform:translateX(-50%) translateY(100%);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}';
        document.head.appendChild(s);
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN HOZZÁFÉRÉS-KÉRÉS JÓVÁHAGYÁS / ELUTASÍTÁS
    // A lelkész oldaláról — az értesítési modalból érhető el
    // ═══════════════════════════════════════════════════════════════

    window.approveAdminAccess = async function(notifId) {
        if (!confirm('Biztosan jóváhagyja a rendszergazda hozzáférését?\n\nA hozzáférés 2 óra után automatikusan lejár.')) return;

        try {
            var n = window._notificationCache[notifId];
            if (!n) { alert('Értesítés nem található!'); return; }

            // Megkeressük a congregation_id-t az értesítésből
            var congId = n.congregation_id;

            // Megkeressük a függőben lévő kérést
            var { data: requests, error: fetchErr } = await _supabase.from('admin_access_requests')
                .select('id')
                .eq('congregation_id', congId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(1);

            if (fetchErr) throw fetchErr;
            if (!requests || requests.length === 0) {
                alert('Nem található függőben lévő hozzáférés-kérés.');
                return;
            }

            var requestId = requests[0].id;
            var expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 óra

            // Jóváhagyás
            var { error: updateErr } = await _supabase.from('admin_access_requests')
                .update({
                    status: 'approved',
                    approved_at: new Date().toISOString(),
                    expires_at: expiresAt
                })
                .eq('id', requestId);

            if (updateErr) throw updateErr;

            // Értesítés küldése az adminnak
            var { data: adminProfile } = await _supabase.from('admin_access_requests')
                .select('admin_user_id')
                .eq('id', requestId)
                .single();

            if (adminProfile) {
                await _supabase.from('ertesitesek').insert([{
                    user_id: adminProfile.admin_user_id,
                    congregation_id: congId,
                    cim: 'Hozzáférés jóváhagyva!',
                    uzenet: 'A lelkész jóváhagyta a hozzáférési kérelmet. A hozzáférés 2 óráig érvényes.',
                    tipus: 'success'
                }]);
            }

            // Modal bezárása + visszajelzés
            var modalEl = document.getElementById('modal-notification-detail');
            var modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            alert('Hozzáférés jóváhagyva! A rendszergazda 2 órán belül hozzáférhet a gyülekezet adataihoz.');

        } catch (err) {
            console.error('Hozzáférés jóváhagyási hiba:', err);
            alert('Hiba történt: ' + err.message);
        }
    };

    window.denyAdminAccess = async function(notifId) {
        if (!confirm('Biztosan elutasítja a rendszergazda hozzáférés-kérelmét?')) return;

        try {
            var n = window._notificationCache[notifId];
            if (!n) { alert('Értesítés nem található!'); return; }

            var congId = n.congregation_id;

            // Megkeressük a függőben lévő kérést
            var { data: requests, error: fetchErr } = await _supabase.from('admin_access_requests')
                .select('id')
                .eq('congregation_id', congId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(1);

            if (fetchErr) throw fetchErr;
            if (!requests || requests.length === 0) {
                alert('Nem található függőben lévő hozzáférés-kérés.');
                return;
            }

            var requestId = requests[0].id;

            // Elutasítás
            var { error: updateErr } = await _supabase.from('admin_access_requests')
                .update({
                    status: 'denied',
                    denied_at: new Date().toISOString()
                })
                .eq('id', requestId);

            if (updateErr) throw updateErr;

            // Értesítés küldése az adminnak
            var { data: adminProfile } = await _supabase.from('admin_access_requests')
                .select('admin_user_id')
                .eq('id', requestId)
                .single();

            if (adminProfile) {
                await _supabase.from('ertesitesek').insert([{
                    user_id: adminProfile.admin_user_id,
                    congregation_id: congId,
                    cim: 'Hozzáférés elutasítva',
                    uzenet: 'A lelkész elutasította a hozzáférési kérelmet.',
                    tipus: 'warning'
                }]);
            }

            // Modal bezárása + visszajelzés
            var modalEl = document.getElementById('modal-notification-detail');
            var modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            alert('Hozzáférés-kérés elutasítva.');

        } catch (err) {
            console.error('Hozzáférés elutasítási hiba:', err);
            alert('Hiba történt: ' + err.message);
        }
    };

})();
