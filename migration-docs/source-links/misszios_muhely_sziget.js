// ═══════════════════════════════════════════════════════════════════════════
// Missziós Műhely — Standalone „Sziget" modul
// Önálló dizájnú oldal teljes Supabase integrációval
// Auth, kategóriák, segédanyagok, ötletek, szavazás, gamifikáció, értesítések
// ═══════════════════════════════════════════════════════════════════════════

var MmSziget = (function() {
    'use strict';

    // ── Belső állapot ──
    var _user = null;
    var _kategoriak = [];
    var _segedanyagok = [];
    var _otletek = [];
    var _filteredSeg = [];
    var _filteredOtletek = [];
    var _selectedKatId = '';
    var _selectedOtletStatusz = '';
    var _jelvenyTipusok = [];
    var _myStats = null;
    var _myJelvenyek = [];
    var _wizardStep = 1;

    // ── Font Awesome ikon leképezés (kategória név → FA ikon) ──
    var KAT_IKON_MAP = {
        'Ifjúsági misszió':  'fas fa-users',
        'Családlátogatás':   'fas fa-home',
        'Bibliakör':         'fas fa-book-bible',
        'Diakónia':          'fas fa-hand-holding-heart',
        'Evangélizáció':     'fas fa-bullhorn',
        'Gyülekezetépítés':  'fas fa-church',
        'Zenei szolgálat':   'fas fa-music',
        'Roma misszió':      'fas fa-people-group',
        'Szórványgondozás':  'fas fa-map-marked-alt',
        'Digitális misszió': 'fas fa-laptop-code',
        'Ökumenikus':        'fas fa-handshake',
        'Nőszövetség':       'fas fa-heart',
        'Presbiteri képzés': 'fas fa-user-tie',
        'Gyerekmisszió':     'fas fa-child'
    };

    // ── Kategória CSS class leképezés ──
    var KAT_CSS_MAP = {
        'Ifjúsági misszió':  'cat-youth',
        'Családlátogatás':   'cat-family',
        'Bibliakör':         'cat-bible',
        'Diakónia':          'cat-diakonia',
        'Evangélizáció':     'cat-evangel',
        'Gyülekezetépítés':  'cat-church',
        'Zenei szolgálat':   'cat-music',
        'Roma misszió':      'cat-roma',
        'Szórványgondozás':  'cat-diaspora',
        'Digitális misszió': 'cat-digital',
        'Ökumenikus':        'cat-ecumen',
        'Nőszövetség':       'cat-women',
        'Presbiteri képzés': 'cat-elder',
        'Gyerekmisszió':     'cat-children'
    };

    // ── Kategória szín párok (bg, text, gradient) ──
    var KAT_SZIN_MAP = {
        'Ifjúsági misszió':  { bg: '#ede9fe', color: '#7c3aed', grad: 'linear-gradient(90deg,#7c3aed,#a78bfa)' },
        'Családlátogatás':   { bg: '#fce7f3', color: '#db2777', grad: 'linear-gradient(90deg,#db2777,#f472b6)' },
        'Bibliakör':         { bg: '#dbeafe', color: '#2563eb', grad: 'linear-gradient(90deg,#2563eb,#60a5fa)' },
        'Diakónia':          { bg: '#fef3c7', color: '#d97706', grad: 'linear-gradient(90deg,#d97706,#fbbf24)' },
        'Evangélizáció':     { bg: '#d1fae5', color: '#059669', grad: 'linear-gradient(90deg,#059669,#34d399)' },
        'Gyülekezetépítés':  { bg: '#e0e7ff', color: '#4338ca', grad: 'linear-gradient(90deg,#4338ca,#6366f1)' },
        'Zenei szolgálat':   { bg: '#ffe4e6', color: '#e11d48', grad: 'linear-gradient(90deg,#e11d48,#fb7185)' },
        'Roma misszió':      { bg: '#ffedd5', color: '#ea580c', grad: 'linear-gradient(90deg,#ea580c,#fb923c)' },
        'Szórványgondozás':  { bg: '#f0fdf4', color: '#16a34a', grad: 'linear-gradient(90deg,#16a34a,#4ade80)' },
        'Digitális misszió': { bg: '#ecfeff', color: '#0891b2', grad: 'linear-gradient(90deg,#0891b2,#22d3ee)' },
        'Ökumenikus':        { bg: '#faf5ff', color: '#9333ea', grad: 'linear-gradient(90deg,#9333ea,#a855f7)' },
        'Nőszövetség':       { bg: '#fff1f2', color: '#f43f5e', grad: 'linear-gradient(90deg,#f43f5e,#fb7185)' },
        'Presbiteri képzés': { bg: '#f0f9ff', color: '#0284c7', grad: 'linear-gradient(90deg,#0284c7,#38bdf8)' },
        'Gyerekmisszió':     { bg: '#e0f7fa', color: '#00838f', grad: 'linear-gradient(90deg,#00838f,#26c6da)' }
    };

    // ── Szintrendszer (6 szint) ──
    var SZINTEK = [
        { nev: 'Újonc',                min: 0,    max: 49,   ikon: 'fas fa-seedling',        szin: '#adb5bd' },
        { nev: 'Szolgálattevő',        min: 50,   max: 149,  ikon: 'fas fa-hand-holding-heart', szin: '#206bc4' },
        { nev: 'Lelkes Misszionárius',  min: 150,  max: 349,  ikon: 'fas fa-fire',             szin: '#f59f00' },
        { nev: 'Tapasztalt Munkatárs',  min: 350,  max: 699,  ikon: 'fas fa-star',             szin: '#f76707' },
        { nev: 'Közösségépítő',         min: 700,  max: 1199, ikon: 'fas fa-people-roof',      szin: '#ae3ec9' },
        { nev: 'Missziói Bajnok',       min: 1200, max: 99999,ikon: 'fas fa-trophy',           szin: '#d63939' }
    ];

    // ── Pontozási szabályok ──
    var PONT_SZABALYOK = {
        'otlet_bekuldve':       { pont: 10, stat: 'otletek_szama' },
        'otlet_tovabbjutott':   { pont: 25, stat: 'elfogadott_otletek' },
        'otlet_megvalosult':    { pont: 50, stat: 'megvalosult_otletek' },
        'szavazat_adva':        { pont: 2,  stat: 'tamogatasok_adva' },
        'csatlakozas':          { pont: 5,  stat: null },
        'hozzaszolas':          { pont: 3,  stat: 'hozzaszolasok_szama' },
        'segedanyag_feltoltes': { pont: 8,  stat: 'segedanyagok_feltoltve' },
        'ot_csillag_kapott':    { pont: 3,  stat: null },
        'feladat_teljesitve':   { pont: 5,  stat: 'feladatok_teljesitve' },
        '50_letoltes':          { pont: 15, stat: null },
        'ertekeles_adva':       { pont: 1,  stat: null }
    };

    // ══════════════════════════════════════════════════════════════════════
    // INIT
    // ══════════════════════════════════════════════════════════════════════

    async function init() {
        try {
            showLoading(true);
            await _loadUser();
            if (!_user) return;

            _updateNavbar();
            await _loadKategoriak();
            _renderKategoriak();
            _renderOtletFormKategoriak();

            await Promise.all([
                _loadSegedanyagok(),
                _loadOtletek(),
                _loadHeroStats(),
                _loadNotifCount(),
                _loadGamification()
            ]);

            _checkSzavazasDeadlines();
            showLoading(false);
        } catch (err) {
            console.error('MmSziget init hiba:', err);
            showLoading(false);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // AUTH
    // ══════════════════════════════════════════════════════════════════════

    async function _loadUser() {
        var session = await window._supabase.auth.getSession();
        if (!session.data.session) {
            window.location.href = '../index.html';
            return;
        }
        var uid = session.data.session.user.id;
        var { data: profile } = await window._supabase
            .from('profiles')
            .select('id, full_name, role, congregation_id')
            .eq('id', uid)
            .single();

        var gyulNev = '';
        if (profile && profile.congregation_id) {
            var { data: cong } = await window._supabase
                .from('congregations')
                .select('nev_hu')
                .eq('id', profile.congregation_id)
                .single();
            if (cong) gyulNev = cong.nev_hu;
        }

        _user = {
            id: uid,
            nev: profile ? profile.full_name : 'Ismeretlen',
            gyulekezet: gyulNev,
            role: profile ? profile.role : 'lelkesz',
            congregation_id: profile ? profile.congregation_id : null
        };
    }

    function _updateNavbar() {
        // Avatár inicializálás
        var avatarEl = document.getElementById('mm-nav-avatar');
        if (avatarEl && _user) {
            var initials = _user.nev.split(' ').map(function(n) { return n.charAt(0); }).join('').substring(0, 2).toUpperCase();
            avatarEl.textContent = initials;
            avatarEl.title = _user.nev + ' (' + _user.gyulekezet + ')';
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // KATEGÓRIÁK
    // ══════════════════════════════════════════════════════════════════════

    async function _loadKategoriak() {
        var { data, error } = await window._supabase
            .from('mm_kategoriak')
            .select('*')
            .order('sorrend');
        if (error) { console.error('Kategóriák hiba:', error); return; }
        _kategoriak = data || [];
    }

    function _renderKategoriak() {
        var grid = document.getElementById('mm-categories-grid');
        if (!grid) return;

        var html = '';
        _kategoriak.forEach(function(k) {
            var cssClass = KAT_CSS_MAP[k.nev] || '';
            var faIcon = KAT_IKON_MAP[k.nev] || 'fas fa-folder';
            html += '<div class="cat-card ' + cssClass + '" onclick="MmSziget.filterByKategoria(' + k.id + ',\'' + _escHtml(k.nev) + '\')" data-kat-id="' + k.id + '">' +
                '<div class="cat-icon"><i class="' + faIcon + '"></i></div>' +
                '<div class="cat-name">' + _escHtml(k.nev) + '</div>' +
                '<div class="cat-count" id="mm-kat-count-' + k.id + '">...</div>' +
                '</div>';
        });
        grid.innerHTML = html;
    }

    function _renderOtletFormKategoriak() {
        var container = document.getElementById('mm-form-kategoriak');
        if (!container) return;
        var html = '';
        _kategoriak.forEach(function(k) {
            html += '<span class="form-chip" data-kat-id="' + k.id + '" onclick="MmSziget.toggleFormChip(this)">' + _escHtml(k.nev) + '</span>';
        });
        container.innerHTML = html;
    }

    function _updateKategoriaCounts() {
        _kategoriak.forEach(function(k) {
            var segCount = _segedanyagok.filter(function(s) {
                return s.mm_segedanyag_kategoriak && s.mm_segedanyag_kategoriak.some(function(sk) { return sk.kategoria_id === k.id; });
            }).length;
            var otletCount = _otletek.filter(function(o) {
                return o.mm_otlet_kategoriak && o.mm_otlet_kategoriak.some(function(ok) { return ok.kategoria_id === k.id; });
            }).length;
            var total = segCount + otletCount;
            var el = document.getElementById('mm-kat-count-' + k.id);
            if (el) el.textContent = total + ' anyag';
        });
    }

    function filterByKategoria(katId, katNev) {
        _selectedKatId = (_selectedKatId == katId) ? '' : katId;

        // Highlight selected
        document.querySelectorAll('.cat-card').forEach(function(c) {
            c.classList.toggle('selected', c.dataset.katId == _selectedKatId);
        });

        _filterSegedanyagok();
        _filterOtletek();

        // Görgess a segédanyagokhoz
        var resSection = document.getElementById('resources');
        if (resSection) resSection.scrollIntoView({ behavior: 'smooth' });

        if (_selectedKatId) {
            showToast('Szűrés: ' + katNev);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SEGÉDANYAGOK
    // ══════════════════════════════════════════════════════════════════════

    async function _loadSegedanyagok() {
        var { data, error } = await window._supabase
            .from('mm_segedanyagok')
            .select('*, mm_segedanyag_kategoriak(kategoria_id)')
            .eq('aktiv', true)
            .order('created_at', { ascending: false });

        if (error) { console.error('Segédanyagok hiba:', error); return; }
        _segedanyagok = data || [];
        _filteredSeg = _segedanyagok.slice();
        _renderSegedanyagGrid();
        _updateKategoriaCounts();
    }

    function _filterSegedanyagok() {
        _filteredSeg = _segedanyagok.filter(function(s) {
            if (_selectedKatId) {
                var hasKat = s.mm_segedanyag_kategoriak && s.mm_segedanyag_kategoriak.some(function(sk) {
                    return sk.kategoria_id == _selectedKatId;
                });
                if (!hasKat) return false;
            }
            return true;
        });
        _renderSegedanyagGrid();
    }

    function _renderSegedanyagGrid() {
        var grid = document.getElementById('mm-resources-grid');
        if (!grid) return;

        if (_filteredSeg.length === 0) {
            grid.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted);grid-column:1/-1;">' +
                '<i class="fas fa-folder-open" style="font-size:48px;margin-bottom:16px;display:block;opacity:0.3"></i>' +
                '<p style="font-size:16px">Még nincsenek segédanyagok' + (_selectedKatId ? ' ebben a kategóriában' : '') + '</p>' +
                '<button class="nav-cta" onclick="MmSziget.openSegUploadModal()" style="margin-top:16px">' +
                '<i class="fas fa-plus" style="margin-right:6px"></i>Első segédanyag feltöltése</button></div>';
            return;
        }

        var html = '';
        _filteredSeg.forEach(function(s) {
            var katNevek = _getKategoriaNevek(s.mm_segedanyag_kategoriak);
            var firstKat = katNevek[0] || { nev: 'Egyéb', szin: {} };
            var szin = firstKat.szin || { bg: '#f1f5f9', color: '#64748b', grad: 'linear-gradient(90deg,#64748b,#94a3b8)' };
            var fmtIcon = _getFormatIcon(s.formatum);

            html += '<div class="res-card" onclick="MmSziget.openSegedanyagDetail(\'' + s.id + '\')">' +
                '<div class="res-card-top" style="background:' + szin.grad + '"></div>' +
                '<div class="res-card-body">' +
                '<div class="res-card-meta">' +
                '<span class="res-card-tag" style="background:' + szin.bg + ';color:' + szin.color + '">' + _escHtml(firstKat.nev) + '</span>';
            if (s.forras_nev) {
                html += '<span class="res-card-source"><i class="fas fa-globe"></i> ' + _escHtml(s.forras_nev) + '</span>';
            }
            html += '</div>' +
                '<div class="res-card-title">' + _escHtml(s.cim) + '</div>' +
                '<div class="res-card-desc">' + _escHtml(s.leiras || '') + '</div>' +
                '</div>' +
                '<div class="res-card-footer">' +
                '<span class="res-card-stat"><i class="fas fa-download"></i> ' + (s.letoltes_szam || 0) + '</span>' +
                '<span class="res-card-stat"><i class="fas fa-star" style="color:#f59f00"></i> ' + (s.atlag_ertekeles ? Number(s.atlag_ertekeles).toFixed(1) : '-') + '</span>' +
                '<span class="res-card-stat"><i class="' + fmtIcon + '"></i> ' + (s.formatum || 'PDF') + '</span>' +
                '<a href="#" class="res-card-open" onclick="event.stopPropagation(); MmSziget.openSegedanyagDetail(\'' + s.id + '\')">Megnyitás <i class="fas fa-external-link-alt"></i></a>' +
                '</div></div>';
        });
        grid.innerHTML = html;
    }

    // ── Segédanyag részletes modal ──
    async function openSegedanyagDetail(segId) {
        var seg = _segedanyagok.find(function(s) { return s.id === segId; });
        if (!seg) return;

        var katNevek = _getKategoriaNevek(seg.mm_segedanyag_kategoriak);
        var firstKat = katNevek[0] || { nev: 'Egyéb', szin: {} };
        var szin = firstKat.szin || { bg: '#f1f5f9', color: '#64748b', grad: 'linear-gradient(90deg,#64748b,#94a3b8)' };

        // Értékelések betöltése
        var { data: ertekelesek } = await window._supabase
            .from('mm_segedanyag_ertekelesek')
            .select('*')
            .eq('segedanyag_id', segId)
            .order('created_at', { ascending: false });

        var sajatErtekeles = (ertekelesek || []).find(function(e) { return e.user_id === _user.id; });

        var katBadgesHtml = katNevek.map(function(k) {
            return '<span style="display:inline-block;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;background:' +
                (k.szin ? k.szin.bg : '#f1f5f9') + ';color:' + (k.szin ? k.szin.color : '#64748b') + ';margin:0 4px 4px 0">' + _escHtml(k.nev) + '</span>';
        }).join('');

        var currentRating = sajatErtekeles ? sajatErtekeles.pontszam : 0;
        var starsHtml = '<span class="mm-star-group" data-current="' + currentRating + '">';
        for (var i = 1; i <= 5; i++) {
            var starColor = i <= currentRating ? '#f59f00' : '#ddd';
            starsHtml += '<i class="fas fa-star mm-star" data-value="' + i + '" style="font-size:24px;cursor:pointer;color:' + starColor + ';margin-right:4px;transition:color 0.15s" onclick="MmSziget.rateSegedanyag(\'' + segId + '\',' + i + ')"></i>';
        }
        starsHtml += '</span>';

        var ertekelesListHtml = '';
        (ertekelesek || []).forEach(function(e) {
            var name = 'Ismeretlen';
            ertekelesListHtml += '<div style="padding:12px 0;border-bottom:1px solid var(--border-light)">' +
                '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<strong style="font-size:14px">' + _escHtml(name) + '</strong>' +
                '<span>' + _renderStarsSmall(e.pontszam) + '</span>' +
                '</div>' +
                (e.velemeny ? '<p style="font-size:13px;color:var(--text-light);margin:6px 0 0">' + _escHtml(e.velemeny) + '</p>' : '') +
                '</div>';
        });

        var modalContent = document.getElementById('mm-modal-seg-detail-content');
        if (!modalContent) return;

        modalContent.innerHTML =
            '<div style="height:8px;background:' + szin.grad + ';border-radius:var(--radius-xl) var(--radius-xl) 0 0;margin:-36px -36px 24px"></div>' +
            '<button class="modal-close" onclick="MmSziget.closeModal(\'seg-detail\')"><i class="fas fa-times"></i></button>' +
            '<h3>' + _escHtml(seg.cim) + '</h3>' +
            '<div style="margin-bottom:16px">' + katBadgesHtml + '</div>' +
            '<div style="font-size:14px;line-height:1.7;color:var(--text-light)">' + _formatLeiras(seg.leiras) + '</div>' +
            '<div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;padding:16px;background:var(--bg);border-radius:var(--radius);font-size:13px;color:var(--text-muted)">' +
            '<span><i class="fas fa-user"></i> ' + _escHtml(seg.feltolto_nev || 'Ismeretlen') + '</span>' +
            '<span><i class="fas fa-map-marker-alt"></i> ' + _escHtml(seg.feltolto_gyulekezet || '') + '</span>' +
            '<span><i class="fas fa-download"></i> ' + (seg.letoltes_szam || 0) + ' letöltés</span>' +
            '<span><i class="fas fa-star" style="color:#f59f00"></i> ' + (seg.atlag_ertekeles ? Number(seg.atlag_ertekeles).toFixed(1) : '-') + ' (' + (seg.ertekelesek_szama || 0) + ')</span>' +
            '</div>' +
            // Megtekintés / Letöltés gombok
            (seg.csatolmany_url || seg.forras_url ?
                '<div style="margin-bottom:24px;display:flex;flex-wrap:wrap;gap:8px">' +
                (seg.csatolmany_url ?
                    '<a href="https://docs.google.com/gview?url=' + encodeURIComponent(seg.csatolmany_url) + '" target="_blank" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:8px" ' +
                    'onclick="MmSziget.incrementLetoltes(\'' + segId + '\')">' +
                    '<i class="fas fa-eye"></i> Megtekintés</a>' : '') +
                '<a href="' + (seg.csatolmany_url || seg.forras_url) + '" target="_blank" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:8px" ' +
                'onclick="MmSziget.incrementLetoltes(\'' + segId + '\')">' +
                '<i class="fas fa-download"></i> ' + (seg.csatolmany_url ? 'Letöltés' : 'Megnyitás') + '</a>' +
                (seg.feltolto_id === _user.id ?
                    '<button class="btn btn-secondary" style="margin-left:8px" onclick="MmSziget.openSegUploadModal(\'' + segId + '\')"><i class="fas fa-edit"></i> Szerkesztés</button>' +
                    '<button class="btn btn-secondary" style="margin-left:8px;color:#d63939;border-color:#d63939" onclick="MmSziget.deleteSegedanyag(\'' + segId + '\')"><i class="fas fa-trash"></i> Törlés</button>'
                : '') +
                '</div>' : '') +
            // Értékelés
            '<div style="border-top:1px solid var(--border);padding-top:20px;margin-top:20px">' +
            '<h4 style="font-size:16px;font-weight:700;margin-bottom:12px">Értékelés</h4>' +
            '<div style="margin-bottom:16px">' + starsHtml + '</div>' +
            '<textarea id="mm-seg-velemeny" placeholder="Írd le a véleményed... (opcionális)" style="width:100%;padding:12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-family:inherit;font-size:14px;resize:vertical;min-height:60px"></textarea>' +
            '</div>' +
            // Értékelések lista
            (ertekelesListHtml ? '<div style="margin-top:20px"><h4 style="font-size:16px;font-weight:700;margin-bottom:8px">Vélemények (' + (ertekelesek || []).length + ')</h4>' + ertekelesListHtml + '</div>' : '');

        _openModal('seg-detail');

        // Csillag hover effekt
        setTimeout(function() {
            var starGroup = document.querySelector('.mm-star-group');
            if (!starGroup) return;
            var stars = starGroup.querySelectorAll('.mm-star');
            stars.forEach(function(star) {
                star.addEventListener('mouseenter', function() {
                    var hoverVal = parseInt(star.getAttribute('data-value'));
                    stars.forEach(function(s) {
                        s.style.color = parseInt(s.getAttribute('data-value')) <= hoverVal ? '#f59f00' : '#ddd';
                    });
                });
                star.addEventListener('mouseleave', function() {
                    var current = parseInt(starGroup.getAttribute('data-current')) || 0;
                    stars.forEach(function(s) {
                        s.style.color = parseInt(s.getAttribute('data-value')) <= current ? '#f59f00' : '#ddd';
                    });
                });
            });
        }, 50);
    }

    async function rateSegedanyag(segId, pontszam) {
        var velemeny = '';
        var velEl = document.getElementById('mm-seg-velemeny');
        if (velEl) velemeny = velEl.value.trim();

        var { error } = await window._supabase
            .from('mm_segedanyag_ertekelesek')
            .upsert({
                segedanyag_id: segId,
                user_id: _user.id,
                pontszam: pontszam,
                velemeny: velemeny || null
            }, { onConflict: 'segedanyag_id,user_id' });

        if (error) { showToast('Hiba az értékelésnél!'); console.error(error); return; }

        // Átlag újraszámítás
        var { data: allRatings } = await window._supabase
            .from('mm_segedanyag_ertekelesek')
            .select('pontszam')
            .eq('segedanyag_id', segId);

        if (allRatings && allRatings.length > 0) {
            var sum = allRatings.reduce(function(a, b) { return a + b.pontszam; }, 0);
            var avg = sum / allRatings.length;
            await window._supabase.from('mm_segedanyagok').update({
                atlag_ertekeles: avg.toFixed(2),
                ertekelesek_szama: allRatings.length
            }).eq('id', segId);
        }

        // Pont a felhasználónak
        await addPoints('ertekeles_adva', _user.id);

        // 5 csillag → pont a feltöltőnek
        if (pontszam === 5) {
            var seg = _segedanyagok.find(function(s) { return s.id === segId; });
            if (seg && seg.feltolto_id !== _user.id) {
                await addPoints('ot_csillag_kapott', seg.feltolto_id);
            }
        }

        showToast(pontszam + ' csillagos értékelés rögzítve!');
        await _loadSegedanyagok();
        openSegedanyagDetail(segId);
    }

    async function incrementLetoltes(segId) {
        var seg = _segedanyagok.find(function(s) { return s.id === segId; });
        if (!seg) return;
        var ujSzam = (seg.letoltes_szam || 0) + 1;

        await window._supabase.from('mm_segedanyagok').update({ letoltes_szam: ujSzam }).eq('id', segId);

        if (ujSzam === 50 && seg.feltolto_id) {
            await addPoints('50_letoltes', seg.feltolto_id);
            await _sendNotification(seg.feltolto_id, 'success', 'Elérted az 50 letöltést!',
                'A "' + seg.cim + '" segédanyagod 50-szer lett letöltve! +15 pont', null);
        }
    }

    // ── Segédanyag törlése ──
    async function deleteSegedanyag(segId) {
        var seg = _segedanyagok.find(function(s) { return s.id === segId; });
        if (!seg) return;

        // Csak a feltöltő törölheti
        if (seg.feltolto_id !== _user.id) {
            showToast('Csak a feltöltő törölheti a segédanyagot!');
            return;
        }

        if (!confirm('Biztosan törlöd a "' + seg.cim + '" segédanyagot? Ez a művelet nem visszavonható!')) return;

        try {
            // Kategória junction törlése
            await window._supabase.from('mm_segedanyag_kategoriak').delete().eq('segedanyag_id', segId);
            // Értékelések törlése
            await window._supabase.from('mm_segedanyag_ertekelesek').delete().eq('segedanyag_id', segId);
            // Segédanyag törlése
            var { error } = await window._supabase.from('mm_segedanyagok').delete().eq('id', segId);
            if (error) throw error;

            showToast('Segédanyag sikeresen törölve!');
            closeModal('seg-detail');
            await _loadSegedanyagok();
            _renderSegedanyagGrid();
        } catch (err) {
            console.error('Törlési hiba:', err);
            showToast('Hiba történt a törlés során!');
        }
    }

    // ── Segédanyag feltöltés modal ──
    function openSegUploadModal(editId) {
        var modalContent = document.getElementById('mm-modal-seg-upload-content');
        if (!modalContent) return;

        var seg = editId ? _segedanyagok.find(function(s) { return s.id === editId; }) : null;

        var katCheckboxes = _kategoriak.map(function(k) {
            var checked = seg && seg.mm_segedanyag_kategoriak &&
                seg.mm_segedanyag_kategoriak.some(function(sk) { return sk.kategoria_id === k.id; }) ? 'checked' : '';
            return '<label style="display:inline-flex;align-items:center;gap:6px;margin:4px 8px 4px 0;font-size:13px;cursor:pointer">' +
                '<input type="checkbox" name="mm-seg-upload-kat" value="' + k.id + '" ' + checked + '> ' + _escHtml(k.nev) + '</label>';
        }).join('');

        modalContent.innerHTML =
            '<button class="modal-close" onclick="MmSziget.closeModal(\'seg-upload\')"><i class="fas fa-times"></i></button>' +
            '<h3>' + (seg ? '<i class="fas fa-edit"></i> Szerkesztés' : '<i class="fas fa-upload"></i> Új segédanyag') + '</h3>' +
            '<p>Oszd meg a gyülekezetedben bevált anyagokat a közösséggel!</p>' +
            '<input type="hidden" id="mm-seg-edit-id" value="' + (editId || '') + '">' +
            '<div class="form-group">' +
            '<label class="form-label">Cím *</label>' +
            '<input type="text" class="form-input" id="mm-seg-upload-cim" value="' + _escHtml(seg ? seg.cim : '') + '" placeholder="Segédanyag címe">' +
            '</div>' +
            '<div class="form-group">' +
            '<label class="form-label">Leírás <span class="form-hint">max 300 karakter</span></label>' +
            '<textarea class="form-textarea" id="mm-seg-upload-leiras" maxlength="300" style="min-height:80px" placeholder="Rövid leírás...">' + _escHtml(seg ? seg.leiras || '' : '') + '</textarea>' +
            '</div>' +
            '<div class="form-group">' +
            '<label class="form-label">Kategória(k) *</label>' +
            '<div>' + katCheckboxes + '</div>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group"><label class="form-label">Formátum</label>' +
            '<select class="form-select" id="mm-seg-upload-formatum">' +
            '<option value="PDF"' + (seg && seg.formatum === 'PDF' ? ' selected' : '') + '>PDF</option>' +
            '<option value="DOCX"' + (seg && seg.formatum === 'DOCX' ? ' selected' : '') + '>DOCX</option>' +
            '<option value="PPTX"' + (seg && seg.formatum === 'PPTX' ? ' selected' : '') + '>PPTX</option>' +
            '<option value="video"' + (seg && seg.formatum === 'video' ? ' selected' : '') + '>Videó</option>' +
            '<option value="link"' + (seg && seg.formatum === 'link' ? ' selected' : '') + '>Link</option>' +
            '<option value="csomag"' + (seg && seg.formatum === 'csomag' ? ' selected' : '') + '>Csomag</option>' +
            '</select></div>' +
            '<div class="form-group"><label class="form-label">Forrás neve</label>' +
            '<input type="text" class="form-input" id="mm-seg-upload-forras-nev" value="' + _escHtml(seg ? seg.forras_nev || '' : '') + '" placeholder="pl. Google Drive"></div>' +
            '</div>' +
            '<div class="form-group"><label class="form-label">Forrás URL</label>' +
            '<input type="url" class="form-input" id="mm-seg-upload-forras-url" value="' + _escHtml(seg ? seg.forras_url || '' : '') + '" placeholder="https://..."></div>' +
            '<div class="form-group"><label class="form-label">Fájl feltöltése <span class="form-hint">max 20 MB</span></label>' +
            '<input type="file" id="mm-seg-upload-file" class="form-input" accept=".pdf,.docx,.pptx,.xlsx,.zip,.jpg,.png,.mp4"></div>' +
            '<div class="form-submit-row">' +
            '<button class="btn btn-secondary" onclick="MmSziget.closeModal(\'seg-upload\')">Mégse</button>' +
            '<button class="btn btn-primary" id="mm-seg-upload-btn" onclick="MmSziget.handleSegUploadSubmit()">' +
            '<i class="fas fa-check" style="margin-right:6px"></i>' + (seg ? 'Mentés' : 'Feltöltés') + '</button>' +
            '</div>';

        _openModal('seg-upload');
    }

    async function handleSegUploadSubmit() {
        var cim = document.getElementById('mm-seg-upload-cim').value.trim();
        if (!cim) { showToast('A cím megadása kötelező!'); return; }

        var selectedKats = [];
        document.querySelectorAll('input[name="mm-seg-upload-kat"]:checked').forEach(function(cb) {
            selectedKats.push(parseInt(cb.value));
        });
        if (selectedKats.length === 0) { showToast('Legalább egy kategória szükséges!'); return; }

        var btn = document.getElementById('mm-seg-upload-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mentés...';

        try {
            var editId = document.getElementById('mm-seg-edit-id').value;
            var csatolmanyUrl = null;

            // Fájl feltöltés (Cloudflare R2)
            var fileInput = document.getElementById('mm-seg-upload-file');
            if (fileInput && fileInput.files.length > 0) {
                var file = fileInput.files[0];
                try {
                    var r2Result = await window.uploadToR2(file, 'segedanyagok', _user.id);
                    csatolmanyUrl = r2Result.url;
                } catch (uploadErr) {
                    showToast(uploadErr.message || 'Fájl feltöltési hiba!');
                    console.error('R2 upload hiba:', uploadErr);
                    btn.disabled = false;
                    return;
                }
            }

            var record = {
                cim: cim,
                leiras: document.getElementById('mm-seg-upload-leiras').value.trim() || null,
                formatum: document.getElementById('mm-seg-upload-formatum').value,
                forras_nev: document.getElementById('mm-seg-upload-forras-nev').value.trim() || null,
                forras_url: document.getElementById('mm-seg-upload-forras-url').value.trim() || null,
                feltolto_id: _user.id,
                feltolto_nev: _user.nev,
                feltolto_gyulekezet: _user.gyulekezet,
                updated_at: new Date().toISOString()
            };
            if (csatolmanyUrl) record.csatolmany_url = csatolmanyUrl;

            if (editId) {
                await window._supabase.from('mm_segedanyagok').update(record).eq('id', editId);
                // Kategóriák újra
                await window._supabase.from('mm_segedanyag_kategoriak').delete().eq('segedanyag_id', editId);
                var katRows = selectedKats.map(function(kid) { return { segedanyag_id: editId, kategoria_id: kid }; });
                await window._supabase.from('mm_segedanyag_kategoriak').insert(katRows);
                showToast('Segédanyag frissítve!');
            } else {
                var { data: newSeg, error: insErr } = await window._supabase.from('mm_segedanyagok').insert(record).select().single();
                if (insErr) throw insErr;
                var katRows2 = selectedKats.map(function(kid) { return { segedanyag_id: newSeg.id, kategoria_id: kid }; });
                await window._supabase.from('mm_segedanyag_kategoriak').insert(katRows2);
                await addPoints('segedanyag_feltoltes', _user.id);
                showToast('Segédanyag sikeresen feltöltve! +8 pont');
            }

            closeModal('seg-upload');
            await _loadSegedanyagok();
        } catch (err) {
            showToast('Hiba történt a mentésnél!');
            console.error(err);
        }
        btn.disabled = false;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ÖTLETEK
    // ══════════════════════════════════════════════════════════════════════

    async function _loadOtletek() {
        var { data, error } = await window._supabase
            .from('mm_otletek')
            .select('*, mm_otlet_kategoriak(kategoria_id)')
            .eq('aktiv', true)
            .order('created_at', { ascending: false });

        if (error) { console.error('Ötletek hiba:', error); return; }
        _otletek = data || [];
        _filteredOtletek = _otletek.slice();
        _renderOtletGrid();
        _updateIdeaTabs();
    }

    function _filterOtletek() {
        _filteredOtletek = _otletek.filter(function(o) {
            if (_selectedOtletStatusz && o.statusz !== _selectedOtletStatusz) return false;
            if (_selectedKatId) {
                var hasKat = o.mm_otlet_kategoriak && o.mm_otlet_kategoriak.some(function(ok) {
                    return ok.kategoria_id == _selectedKatId;
                });
                if (!hasKat) return false;
            }
            return true;
        });
        _renderOtletGrid();
    }

    function _updateIdeaTabs() {
        var counts = { all: _otletek.length, szavazas: 0, kozos_munka: 0, megvalosult: 0 };
        _otletek.forEach(function(o) {
            if (o.statusz === 'szavazas' || o.statusz === 'uj') counts.szavazas++;
            else if (o.statusz === 'kozos_munka') counts.kozos_munka++;
            else if (o.statusz === 'megvalosult') counts.megvalosult++;
        });
        var tabEls = document.querySelectorAll('.idea-tab .tab-count');
        if (tabEls[0]) tabEls[0].textContent = counts.all;
        if (tabEls[1]) tabEls[1].textContent = counts.szavazas;
        if (tabEls[2]) tabEls[2].textContent = counts.kozos_munka;
        if (tabEls[3]) tabEls[3].textContent = counts.megvalosult;
    }

    function _renderOtletGrid() {
        var grid = document.getElementById('mm-ideas-grid');
        if (!grid) return;

        if (_filteredOtletek.length === 0) {
            grid.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted);grid-column:1/-1">' +
                '<i class="fas fa-lightbulb" style="font-size:48px;margin-bottom:16px;display:block;opacity:0.3"></i>' +
                '<p style="font-size:16px">Még nincsenek ötletek' + (_selectedOtletStatusz ? ' ebben a státuszban' : '') + '</p></div>';
            return;
        }

        var html = '';
        _filteredOtletek.forEach(function(o) {
            var katNevek = _getKategoriaNevek(o.mm_otlet_kategoriak);
            var statusBadge = _getStatusBadge(o.statusz);
            var initials = (o.otletgazda_nev || 'NN').split(' ').map(function(n) { return n.charAt(0); }).join('').substring(0, 2).toUpperCase();
            var avatarColor = _hashColor(o.otletgazda_nev || 'NN');

            // Progress info
            var progressHtml = '';
            if (o.statusz === 'szavazas' || o.statusz === 'uj') {
                var pct = Math.min(100, Math.round((o.tamogatasok_szama || 0) / 5 * 100));
                progressHtml = '<div class="idea-progress"><div class="idea-progress-header">' +
                    '<span class="idea-progress-label">Támogatottság</span>' +
                    '<span class="idea-progress-value">' + (o.tamogatasok_szama || 0) + '/5 szavazat</span></div>' +
                    '<div class="idea-progress-bar"><div class="idea-progress-fill" style="width:' + pct + '%"></div></div></div>';
            } else if (o.statusz === 'kozos_munka') {
                progressHtml = '<div class="idea-progress"><div class="idea-progress-header">' +
                    '<span class="idea-progress-label">Kidolgozottság</span>' +
                    '<span class="idea-progress-value">' + (o.kidolgozottsag || 0) + '%</span></div>' +
                    '<div class="idea-progress-bar"><div class="idea-progress-fill" style="width:' + (o.kidolgozottsag || 0) + '%"></div></div></div>';
            }

            // Idő info
            var timeHtml = '';
            if (o.szavazas_vege && (o.statusz === 'szavazas' || o.statusz === 'uj')) {
                var daysLeft = Math.ceil((new Date(o.szavazas_vege) - new Date()) / (1000 * 60 * 60 * 24));
                timeHtml = '<div class="idea-time"><i class="fas fa-clock"></i> ' +
                    (daysLeft > 0 ? daysLeft + ' nap van hátra a szavazásból' : 'Szavazás lejárt') + '</div>';
            } else if (o.statusz === 'kozos_munka') {
                timeHtml = '<div class="idea-time"><i class="fas fa-users"></i> ' + (o.csatlakozok_szama || 0) + ' lelkész dolgozik rajta</div>';
            }

            // Tag-ek
            var tagsHtml = katNevek.map(function(k) {
                return '<span class="idea-tag">' + _escHtml(k.nev) + '</span>';
            }).join('');

            html += '<div class="idea-card" onclick="MmSziget.openOtletDetail(\'' + o.id + '\')">' +
                '<div class="idea-card-header">' +
                '<div class="idea-author-avatar" style="background:' + avatarColor + '">' + initials + '</div>' +
                '<div class="idea-author-info">' +
                '<div class="idea-author-name">' + _escHtml(o.otletgazda_nev || 'Ismeretlen') + '</div>' +
                '<div class="idea-author-church">' + _escHtml(o.otletgazda_gyulekezet || '') + '</div>' +
                '</div>' +
                '<span class="idea-phase ' + statusBadge.css + '">' + statusBadge.label + '</span>' +
                '</div>' +
                '<div class="idea-card-body">' +
                '<div class="idea-title">' + _escHtml(o.cim) + '</div>' +
                '<div class="idea-desc">' + _escHtml(o.leiras || '') + '</div>' +
                '<div class="idea-tags">' + tagsHtml + '</div>' +
                '</div>' +
                progressHtml + timeHtml +
                '<div class="idea-card-footer">' +
                '<button class="idea-vote-btn" onclick="event.stopPropagation();MmSziget.toggleTamogatas(\'' + o.id + '\',this)"><i class="fas fa-thumbs-up"></i> Támogatom (' + (o.tamogatasok_szama || 0) + ')</button>' +
                '<button class="idea-comment-btn" onclick="event.stopPropagation();MmSziget.openOtletDetail(\'' + o.id + '\')"><i class="fas fa-comment"></i> ' + (o.hozzaszolasok_szama || 0) + '</button>' +
                (o.statusz === 'kozos_munka' ? '<button class="idea-collab-btn" onclick="event.stopPropagation();MmSziget.toggleCsatlakozas(\'' + o.id + '\')"><i class="fas fa-users"></i> Csatlakozás</button>' : '') +
                '</div></div>';
        });
        grid.innerHTML = html;

        // Szavazott gombok jelölése
        _markVotedButtons();
    }

    async function _markVotedButtons() {
        if (!_user) return;
        var { data: myVotes } = await window._supabase
            .from('mm_szavazatok')
            .select('otlet_id, tipus')
            .eq('user_id', _user.id);

        if (!myVotes) return;
        myVotes.forEach(function(v) {
            if (v.tipus === 'tamogatas') {
                var btn = document.querySelector('.idea-vote-btn[onclick*="' + v.otlet_id + '"]');
                if (btn) btn.classList.add('voted');
            }
        });
    }

    // ── Szavazás (támogatás) ──
    async function toggleTamogatas(otletId, btnEl) {
        var { data: existing } = await window._supabase
            .from('mm_szavazatok')
            .select('id')
            .eq('otlet_id', otletId)
            .eq('user_id', _user.id)
            .eq('tipus', 'tamogatas');

        var otlet = _otletek.find(function(o) { return o.id === otletId; });
        if (!otlet) return;

        if (existing && existing.length > 0) {
            await window._supabase.from('mm_szavazatok').delete().eq('id', existing[0].id);
            var ujSzam = Math.max(0, (otlet.tamogatasok_szama || 0) - 1);
            await window._supabase.from('mm_otletek').update({ tamogatasok_szama: ujSzam }).eq('id', otletId);
            if (btnEl) btnEl.classList.remove('voted');
            showToast('Szavazat visszavonva');
        } else {
            await window._supabase.from('mm_szavazatok').insert({
                otlet_id: otletId, user_id: _user.id, tipus: 'tamogatas'
            });
            var ujSzam2 = (otlet.tamogatasok_szama || 0) + 1;
            await window._supabase.from('mm_otletek').update({ tamogatasok_szama: ujSzam2 }).eq('id', otletId);
            if (btnEl) btnEl.classList.add('voted');
            showToast('Szavazatod rögzítve! +2 pont');

            await addPoints('szavazat_adva', _user.id);

            // Értesítés az ötletgazdának
            if (otlet.otletgazda_id !== _user.id) {
                await _sendNotification(otlet.otletgazda_id, 'info', 'Új támogatás!',
                    _user.nev + ' támogatja a(z) "' + otlet.cim + '" ötletedet.', null);
            }

            // 5 támogatás → közös munka
            if (ujSzam2 >= 5 && (otlet.statusz === 'szavazas' || otlet.statusz === 'uj')) {
                await _promoteToKozosMunka(otletId);
            }
        }
        await _loadOtletek();
    }

    async function toggleCsatlakozas(otletId) {
        var { data: existing } = await window._supabase
            .from('mm_szavazatok')
            .select('id')
            .eq('otlet_id', otletId)
            .eq('user_id', _user.id)
            .eq('tipus', 'csatlakozas');

        var otlet = _otletek.find(function(o) { return o.id === otletId; });
        if (!otlet) return;

        if (existing && existing.length > 0) {
            await window._supabase.from('mm_szavazatok').delete().eq('id', existing[0].id);
            await window._supabase.from('mm_otletek').update({ csatlakozok_szama: Math.max(0, (otlet.csatlakozok_szama || 0) - 1) }).eq('id', otletId);
            showToast('Kilépés a projektből');
        } else {
            await window._supabase.from('mm_szavazatok').insert({
                otlet_id: otletId, user_id: _user.id, tipus: 'csatlakozas'
            });
            await window._supabase.from('mm_otletek').update({ csatlakozok_szama: (otlet.csatlakozok_szama || 0) + 1 }).eq('id', otletId);
            await addPoints('csatlakozas', _user.id);
            showToast('Csatlakoztál a projekthez! +5 pont');

            if (otlet.otletgazda_id !== _user.id) {
                await _sendNotification(otlet.otletgazda_id, 'info', 'Valaki csatlakozott!',
                    _user.nev + ' csatlakozott a(z) "' + otlet.cim + '" projekthez.', null);
            }
        }
        await _loadOtletek();
    }

    async function _promoteToKozosMunka(otletId) {
        await window._supabase.from('mm_otletek').update({ statusz: 'kozos_munka' }).eq('id', otletId);
        var otlet = _otletek.find(function(o) { return o.id === otletId; });
        if (otlet) {
            await addPoints('otlet_tovabbjutott', otlet.otletgazda_id);
            await _sendNotification(otlet.otletgazda_id, 'success', 'Ötleted továbbjutott!',
                'A(z) "' + otlet.cim + '" ötleted elérte az 5 támogatást! Közös munka fázisba lépett. +25 pont', null);
        }
        showToast('Az ötlet elérte az 5 támogatást → Közös munka fázisba lépett!');
    }

    // ── Ötlet részletes modal ──
    async function openOtletDetail(otletId) {
        var otlet = _otletek.find(function(o) { return o.id === otletId; });
        if (!otlet) return;

        var katNevek = _getKategoriaNevek(otlet.mm_otlet_kategoriak);
        var statusBadge = _getStatusBadge(otlet.statusz);
        var initials = (otlet.otletgazda_nev || 'NN').split(' ').map(function(n) { return n.charAt(0); }).join('').substring(0, 2).toUpperCase();

        // Hozzászólások betöltése
        var { data: hozzaszolasok } = await window._supabase
            .from('mm_hozzaszolasok')
            .select('*')
            .eq('otlet_id', otletId)
            .order('created_at', { ascending: true });

        // Saját szavazat ellenőrzés
        var { data: myVotes } = await window._supabase
            .from('mm_szavazatok')
            .select('tipus')
            .eq('otlet_id', otletId)
            .eq('user_id', _user.id);

        var hasVoted = myVotes && myVotes.some(function(v) { return v.tipus === 'tamogatas'; });
        var hasJoined = myVotes && myVotes.some(function(v) { return v.tipus === 'csatlakozas'; });

        var katBadgesHtml = katNevek.map(function(k) {
            return '<span style="display:inline-block;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;background:' +
                (k.szin ? k.szin.bg : '#f1f5f9') + ';color:' + (k.szin ? k.szin.color : '#64748b') + ';margin:0 4px 4px 0">' + _escHtml(k.nev) + '</span>';
        }).join('');

        var commentsHtml = '';
        (hozzaszolasok || []).forEach(function(h) {
            var name = h.user_nev || 'Ismeretlen';
            var hInitials = name.split(' ').map(function(n) { return n.charAt(0); }).join('').substring(0, 2).toUpperCase();
            commentsHtml += '<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-light)">' +
                '<div style="width:36px;height:36px;border-radius:50%;background:var(--gradient-primary);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:12px;flex-shrink:0">' + hInitials + '</div>' +
                '<div style="flex:1"><div style="display:flex;justify-content:space-between"><strong style="font-size:13px">' + _escHtml(name) + '</strong>' +
                '<span style="font-size:11px;color:var(--text-muted)">' + _formatDate(h.created_at) + '</span></div>' +
                '<p style="font-size:14px;color:var(--text-light);margin:4px 0 0;line-height:1.5">' + _escHtml(h.szoveg) + '</p></div></div>';
        });

        var modalContent = document.getElementById('mm-modal-otlet-detail-content');
        if (!modalContent) return;

        modalContent.innerHTML =
            '<button class="modal-close" onclick="MmSziget.closeModal(\'otlet-detail\')"><i class="fas fa-times"></i></button>' +
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">' +
            '<div style="width:48px;height:48px;border-radius:14px;background:' + _hashColor(otlet.otletgazda_nev || '') + ';display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:18px">' + initials + '</div>' +
            '<div><div style="font-weight:600;font-size:15px">' + _escHtml(otlet.otletgazda_nev || 'Ismeretlen') + '</div>' +
            '<div style="font-size:12px;color:var(--text-muted)">' + _escHtml(otlet.otletgazda_gyulekezet || '') + ' · ' + _formatDate(otlet.created_at) + '</div></div>' +
            '<span class="idea-phase ' + statusBadge.css + '" style="margin-left:auto">' + statusBadge.label + '</span></div>' +
            '<h3 style="margin-bottom:12px">' + _escHtml(otlet.cim) + '</h3>' +
            '<div style="margin-bottom:12px">' + katBadgesHtml + '</div>' +
            '<p style="font-size:15px;line-height:1.7;color:var(--text-light);white-space:pre-wrap">' + _escHtml(otlet.leiras || '') + '</p>' +
            // Statisztikák
            '<div style="display:flex;gap:16px;padding:16px;background:var(--bg);border-radius:var(--radius);margin:16px 0;font-size:13px">' +
            '<span><i class="fas fa-thumbs-up" style="color:var(--primary)"></i> ' + (otlet.tamogatasok_szama || 0) + ' támogatás</span>' +
            '<span><i class="fas fa-users" style="color:var(--accent-dark)"></i> ' + (otlet.csatlakozok_szama || 0) + ' csatlakozó</span>' +
            '<span><i class="fas fa-comment" style="color:var(--text-muted)"></i> ' + (otlet.hozzaszolasok_szama || 0) + ' hozzászólás</span>' +
            '</div>' +
            // Akció gombok
            '<div style="display:flex;gap:8px;margin-bottom:24px">' +
            '<button class="idea-vote-btn' + (hasVoted ? ' voted' : '') + '" onclick="MmSziget.toggleTamogatas(\'' + otletId + '\',this)">' +
            '<i class="fas fa-thumbs-up"></i> ' + (hasVoted ? 'Visszavonom' : 'Támogatom') + '</button>' +
            (otlet.statusz === 'kozos_munka' ?
                '<button class="idea-collab-btn" style="' + (hasJoined ? 'opacity:0.7' : '') + '" onclick="MmSziget.toggleCsatlakozas(\'' + otletId + '\')">' +
                '<i class="fas fa-users"></i> ' + (hasJoined ? 'Kilépés' : 'Csatlakozás') + '</button>' : '') +
            (otlet.otletgazda_id === _user.id ?
                '<button class="btn btn-secondary" style="margin-left:auto;color:#d63939;border-color:#d63939" onclick="MmSziget.deleteOtlet(\'' + otletId + '\')">' +
                '<i class="fas fa-trash"></i> Törlés</button>' : '') +
            '</div>' +
            // Hozzászólások
            '<div style="border-top:1px solid var(--border);padding-top:20px">' +
            '<h4 style="font-size:16px;font-weight:700;margin-bottom:12px">Hozzászólások (' + (hozzaszolasok || []).length + ')</h4>' +
            commentsHtml +
            '<div style="margin-top:16px;display:flex;gap:8px">' +
            '<textarea id="mm-otlet-comment-input" placeholder="Írd le a hozzászólásod..." style="flex:1;padding:12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-family:inherit;font-size:14px;resize:none;min-height:48px"></textarea>' +
            '<button class="btn btn-primary" style="align-self:flex-end" onclick="MmSziget.submitHozzaszolas(\'' + otletId + '\')">' +
            '<i class="fas fa-paper-plane"></i></button></div></div>';

        _openModal('otlet-detail');
    }

    // ── Ötlet törlése (csak ötletgazda) ──
    async function deleteOtlet(otletId) {
        var otlet = _otletek.find(function(o) { return o.id === otletId; });
        if (!otlet) return;

        if (otlet.otletgazda_id !== _user.id) {
            showToast('Csak az ötletgazda törölheti az ötletet!');
            return;
        }

        if (!confirm('Biztosan törlöd a "' + otlet.cim + '" ötletet? Ez a művelet nem visszavonható!')) return;

        try {
            // Kapcsolódó adatok törlése (cascade miatt a legtöbb automatikus, de biztos ami biztos)
            await window._supabase.from('mm_hozzaszolasok').delete().eq('otlet_id', otletId);
            await window._supabase.from('mm_szavazatok').delete().eq('otlet_id', otletId);
            await window._supabase.from('mm_otlet_kategoriak').delete().eq('otlet_id', otletId);
            await window._supabase.from('mm_feladatok').delete().eq('otlet_id', otletId);
            // Ötlet törlése
            var { error } = await window._supabase.from('mm_otletek').delete().eq('id', otletId);
            if (error) throw error;

            showToast('Ötlet sikeresen törölve!');
            closeModal('otlet-detail');
            await _loadOtletek();
            _renderOtletGrid();
        } catch (err) {
            console.error('Ötlet törlési hiba:', err);
            showToast('Hiba történt a törlés során!');
        }
    }

    async function submitHozzaszolas(otletId) {
        var input = document.getElementById('mm-otlet-comment-input');
        if (!input) return;
        var szoveg = input.value.trim();
        if (!szoveg) { showToast('Írj be egy hozzászólást!'); return; }

        var { error } = await window._supabase.from('mm_hozzaszolasok').insert({
            otlet_id: otletId,
            user_id: _user.id,
            user_nev: _user.nev,
            user_gyulekezet: _user.gyulekezet,
            szoveg: szoveg
        });
        if (error) { showToast('Hiba a hozzászólásnál!'); console.error(error); return; }

        // Számláló növelés
        var otlet = _otletek.find(function(o) { return o.id === otletId; });
        if (otlet) {
            await window._supabase.from('mm_otletek').update({
                hozzaszolasok_szama: (otlet.hozzaszolasok_szama || 0) + 1
            }).eq('id', otletId);
        }

        await addPoints('hozzaszolas', _user.id);

        // Értesítés
        if (otlet && otlet.otletgazda_id !== _user.id) {
            await _sendNotification(otlet.otletgazda_id, 'info', 'Új hozzászólás!',
                _user.nev + ' hozzászólt a(z) "' + otlet.cim + '" ötletedhez.', null);
        }

        showToast('Hozzászólás elküldve! +3 pont');
        await _loadOtletek();
        openOtletDetail(otletId);
    }

    // ── Ötlet beküldés (form) ──
    async function handleOtletSubmit() {
        var cim = document.getElementById('mm-otlet-cim').value.trim();
        var leiras = document.getElementById('mm-otlet-leiras').value.trim();
        if (!cim || !leiras) { showToast('A cím és leírás megadása kötelező!'); return; }

        var selectedKats = [];
        document.querySelectorAll('#mm-form-kategoriak .form-chip.selected').forEach(function(chip) {
            selectedKats.push(parseInt(chip.dataset.katId));
        });
        if (selectedKats.length === 0) { showToast('Válassz legalább egy kategóriát!'); return; }

        var celcsoport = document.getElementById('mm-otlet-celcsoport').value || 'Mindenki';
        var ido = document.getElementById('mm-otlet-ido').value || '2-3 hónap';

        var btn = document.getElementById('mm-otlet-submit-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px"></i>Beküldés...'; }

        try {
            // Fájl feltöltés (Cloudflare R2)
            var csatolmanyUrl = null;
            var fileInput = document.getElementById('mm-otlet-file');
            if (fileInput && fileInput.files.length > 0) {
                var file = fileInput.files[0];
                try {
                    var r2Result = await window.uploadToR2(file, 'otletek', _user.id);
                    csatolmanyUrl = r2Result.url;
                } catch (uploadErr) {
                    showToast(uploadErr.message || 'Fájl feltöltési hiba!');
                    console.error('R2 upload hiba:', uploadErr);
                    btn.disabled = false;
                    return;
                }
            }

            var now = new Date();
            var vegeDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

            var { data: newOtlet, error } = await window._supabase.from('mm_otletek').insert({
                cim: cim,
                leiras: leiras,
                celcsoport: celcsoport,
                becsult_ido: ido,
                statusz: 'szavazas',
                szavazas_kezdete: now.toISOString(),
                szavazas_vege: vegeDate.toISOString(),
                otletgazda_id: _user.id,
                otletgazda_nev: _user.nev,
                otletgazda_gyulekezet: _user.gyulekezet,
                csatolmany_url: csatolmanyUrl
            }).select().single();

            if (error) throw error;

            // Kategóriák
            var katRows = selectedKats.map(function(kid) { return { otlet_id: newOtlet.id, kategoria_id: kid }; });
            await window._supabase.from('mm_otlet_kategoriak').insert(katRows);

            // Címkék
            var cimkekInput = document.getElementById('mm-otlet-cimkek');
            if (cimkekInput && cimkekInput.value.trim()) {
                var cimkek = cimkekInput.value.split(',').map(function(c) { return c.trim(); }).filter(function(c) { return c; });
                var cimkeRows = cimkek.map(function(c) { return { otlet_id: newOtlet.id, cimke: c }; });
                await window._supabase.from('mm_otlet_cimkek').insert(cimkeRows);
            }

            await addPoints('otlet_bekuldve', _user.id);
            showToast('Ötlet sikeresen beküldve! A közösség 30 napon belül szavaz róla. +10 pont');

            // Form reset
            document.getElementById('mm-otlet-cim').value = '';
            document.getElementById('mm-otlet-leiras').value = '';
            document.querySelectorAll('#mm-form-kategoriak .form-chip.selected').forEach(function(c) { c.classList.remove('selected'); });
            if (cimkekInput) cimkekInput.value = '';

            await _loadOtletek();

            // Görgess az ötletekhez
            var ideasSection = document.getElementById('ideas');
            if (ideasSection) ideasSection.scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            showToast('Hiba az ötlet beküldésénél!');
            console.error(err);
        }
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane" style="margin-right:6px"></i>Ötlet beküldése'; }
    }

    // ── Szavazási határidők ellenőrzése ──
    async function _checkSzavazasDeadlines() {
        var most = new Date();
        _otletek.forEach(async function(o) {
            if ((o.statusz === 'szavazas' || o.statusz === 'uj') && o.szavazas_vege) {
                var vege = new Date(o.szavazas_vege);
                if (most > vege && (o.tamogatasok_szama || 0) < 5) {
                    await window._supabase.from('mm_otletek').update({ statusz: 'archivalt' }).eq('id', o.id);
                    await _sendNotification(o.otletgazda_id, 'warning', 'Szavazási idő lejárt',
                        'A(z) "' + o.cim + '" ötleted nem érte el az 5 támogatást. Dolgozd ki részletesebben és nyújtsd be újra!', null);
                }
            }
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // HERO STATS + KERESÉS
    // ══════════════════════════════════════════════════════════════════════

    async function _loadHeroStats() {
        var { count: segCount } = await window._supabase.from('mm_segedanyagok').select('id', { count: 'exact', head: true }).eq('aktiv', true);
        var { count: otletCount } = await window._supabase.from('mm_otletek').select('id', { count: 'exact', head: true }).eq('aktiv', true);
        var { count: projektCount } = await window._supabase.from('mm_otletek').select('id', { count: 'exact', head: true }).eq('statusz', 'kozos_munka');
        var { count: userCount } = await window._supabase.from('profiles').select('id', { count: 'exact', head: true });

        _animateCounter('mm-stat-segedanyag', segCount || 0);
        _animateCounter('mm-stat-otlet', otletCount || 0);
        _animateCounter('mm-stat-lelkesz', userCount || 0);
        _animateCounter('mm-stat-projekt', projektCount || 0);
    }

    function _animateCounter(elId, target) {
        var el = document.getElementById(elId);
        if (!el) return;
        var current = 0;
        var step = Math.max(1, Math.ceil(target / 40));
        var interval = setInterval(function() {
            current += step;
            if (current >= target) { current = target; clearInterval(interval); }
            el.textContent = current;
        }, 30);
    }

    function handleSearch(val) {
        var sugEl = document.getElementById('mm-search-suggestions');
        if (!sugEl) return;

        if (!val || val.length < 2) {
            sugEl.classList.remove('active');
            return;
        }

        var normalizedVal = val.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        var results = [];

        // Keresés segédanyagokban
        _segedanyagok.forEach(function(s) {
            var normalizedCim = (s.cim || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (normalizedCim.indexOf(normalizedVal) !== -1) {
                results.push({ type: 'seg', id: s.id, title: s.cim, tag: 'Segédanyag', icon: 'fas fa-file-alt' });
            }
        });

        // Keresés ötletekben
        _otletek.forEach(function(o) {
            var normalizedCim = (o.cim || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (normalizedCim.indexOf(normalizedVal) !== -1) {
                results.push({ type: 'otlet', id: o.id, title: o.cim, tag: 'Ötlet', icon: 'fas fa-lightbulb' });
            }
        });

        // Keresés kategóriákban
        _kategoriak.forEach(function(k) {
            var normalizedNev = k.nev.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (normalizedNev.indexOf(normalizedVal) !== -1) {
                results.push({ type: 'kat', id: k.id, title: k.nev, tag: 'Kategória', icon: 'fas fa-folder' });
            }
        });

        if (results.length === 0) {
            sugEl.innerHTML = '<div class="search-sug-header">Nincs találat</div>';
        } else {
            var html = '<div class="search-sug-header">Találatok (' + results.length + ')</div>';
            results.slice(0, 8).forEach(function(r) {
                html += '<div class="search-sug-item" onclick="MmSziget.selectSearchResult(\'' + r.type + '\',\'' + r.id + '\')">' +
                    '<i class="' + r.icon + '"></i><span>' + _escHtml(r.title) + '</span>' +
                    '<span class="sug-tag">' + r.tag + '</span></div>';
            });
            sugEl.innerHTML = html;
        }
        sugEl.classList.add('active');
    }

    function selectSearchResult(type, id) {
        document.getElementById('mm-search-suggestions').classList.remove('active');
        if (type === 'seg') openSegedanyagDetail(id);
        else if (type === 'otlet') openOtletDetail(id);
        else if (type === 'kat') filterByKategoria(parseInt(id), '');
    }

    function performSearch() {
        var val = document.getElementById('mm-search-input').value.trim();
        if (!val) return;

        var normalizedVal = val.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // Szűrés mindkét listában
        _filteredSeg = _segedanyagok.filter(function(s) {
            var searchable = ((s.cim || '') + ' ' + (s.leiras || '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return searchable.indexOf(normalizedVal) !== -1;
        });
        _renderSegedanyagGrid();

        _filteredOtletek = _otletek.filter(function(o) {
            var searchable = ((o.cim || '') + ' ' + (o.leiras || '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return searchable.indexOf(normalizedVal) !== -1;
        });
        _renderOtletGrid();

        document.getElementById('mm-search-suggestions').classList.remove('active');
        showToast('Keresés: „' + val + '" — ' + (_filteredSeg.length + _filteredOtletek.length) + ' találat');

        var resSection = document.getElementById('resources');
        if (resSection) resSection.scrollIntoView({ behavior: 'smooth' });
    }

    // ══════════════════════════════════════════════════════════════════════
    // GAMIFIKÁCIÓ
    // ══════════════════════════════════════════════════════════════════════

    async function _loadGamification() {
        try {
            var { data: tipusok } = await window._supabase.from('mm_jelveny_tipusok').select('*').order('sorrend');
            _jelvenyTipusok = tipusok || [];
        } catch (e) { _jelvenyTipusok = []; }

        try {
            var { data: stats } = await window._supabase
                .from('mm_felhasznalo_statisztika')
                .select('*')
                .eq('user_id', _user.id)
                .single();
            _myStats = stats;
        } catch (e) { _myStats = null; }

        try {
            var { data: jelvenyek } = await window._supabase
                .from('mm_felhasznalo_jelveny')
                .select('jelveny_id, elnyerve')
                .eq('user_id', _user.id);
            _myJelvenyek = jelvenyek || [];
        } catch (e) { _myJelvenyek = []; }
    }

    async function addPoints(eventType, userId) {
        var szabaly = PONT_SZABALYOK[eventType];
        if (!szabaly) return;

        // Statisztika betöltés/létrehozás
        var { data: stats } = await window._supabase
            .from('mm_felhasznalo_statisztika')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (!stats) {
            await window._supabase.from('mm_felhasznalo_statisztika').insert({ user_id: userId });
            stats = { user_id: userId, osszpontszam: 0, szint: 'Újonc' };
        }

        var updateObj = {
            osszpontszam: (stats.osszpontszam || 0) + szabaly.pont,
            frissitve: new Date().toISOString()
        };

        if (szabaly.stat && stats[szabaly.stat] !== undefined) {
            updateObj[szabaly.stat] = (stats[szabaly.stat] || 0) + 1;
        }

        // Szint meghatározás
        var ujOsszpont = updateObj.osszpontszam;
        var ujSzint = SZINTEK[0].nev;
        for (var i = SZINTEK.length - 1; i >= 0; i--) {
            if (ujOsszpont >= SZINTEK[i].min) { ujSzint = SZINTEK[i].nev; break; }
        }
        updateObj.szint = ujSzint;

        // Szintlépés értesítés
        if (ujSzint !== stats.szint && userId === _user.id) {
            await _sendNotification(userId, 'success', 'Szintlépés!',
                'Gratulálunk! Elérted a „' + ujSzint + '" szintet! (' + ujOsszpont + ' pont)', null);
        }

        await window._supabase.from('mm_felhasznalo_statisztika').update(updateObj).eq('user_id', userId);

        // Jelvények ellenőrzése
        if (userId === _user.id) {
            await _checkJelvenyek(userId, Object.assign({}, stats, updateObj));
        }
    }

    async function _checkJelvenyek(userId, stats) {
        var checks = [
            { kod: 'elso_otlet', feltetel: (stats.otletek_szama || 0) >= 1 },
            { kod: 'otletgyaros', feltetel: (stats.otletek_szama || 0) >= 5 },
            { kod: 'tamogato', feltetel: (stats.tamogatasok_adva || 0) >= 10 },
            { kod: 'tamogato_bajnok', feltetel: (stats.tamogatasok_adva || 0) >= 25 },
            { kod: 'feltolto', feltetel: (stats.segedanyagok_feltoltve || 0) >= 5 },
            { kod: 'siker', feltetel: (stats.megvalosult_otletek || 0) >= 1 },
            { kod: 'nagy_siker', feltetel: (stats.megvalosult_otletek || 0) >= 3 },
            { kod: 'hozzaszolo', feltetel: (stats.hozzaszolasok_szama || 0) >= 50 },
            { kod: 'mentor', feltetel: (stats.feladatok_teljesitve || 0) >= 10 },
            { kod: 'top_ertekelo', feltetel: (stats.ertekelesek_adva || 0) >= 20 }
        ];

        for (var i = 0; i < checks.length; i++) {
            var ch = checks[i];
            if (!ch.feltetel) continue;

            var tipus = _jelvenyTipusok.find(function(j) { return j.kod === ch.kod; });
            if (!tipus) continue;

            var alreadyHas = _myJelvenyek.some(function(j) { return j.jelveny_id === tipus.id; });
            if (alreadyHas) continue;

            await window._supabase.from('mm_felhasznalo_jelveny').insert({
                user_id: userId,
                jelveny_id: tipus.id
            });
            _myJelvenyek.push({ jelveny_id: tipus.id, elnyerve: new Date().toISOString() });

            await _sendNotification(userId, 'success', 'Új jelvény!',
                'Elnyerted a „' + tipus.nev + '" jelvényt! ' + tipus.leiras, null);
            showToast('Új jelvény: ' + tipus.nev + '!');
        }
    }

    // ── Jelvények modal ──
    function openJelvenyModal() {
        var modalContent = document.getElementById('mm-modal-jelveny-content');
        if (!modalContent) return;

        var szint = SZINTEK[0];
        var pont = _myStats ? (_myStats.osszpontszam || 0) : 0;
        for (var i = SZINTEK.length - 1; i >= 0; i--) {
            if (pont >= SZINTEK[i].min) { szint = SZINTEK[i]; break; }
        }
        var nextSzint = SZINTEK[Math.min(SZINTEK.indexOf(szint) + 1, SZINTEK.length - 1)];
        var progressPct = szint === nextSzint ? 100 : Math.round((pont - szint.min) / (nextSzint.min - szint.min) * 100);

        var initials = _user.nev.split(' ').map(function(n) { return n.charAt(0); }).join('').substring(0, 2).toUpperCase();

        // Jelvény lista
        var jelveniekHtml = _jelvenyTipusok.map(function(jt) {
            var earned = _myJelvenyek.some(function(j) { return j.jelveny_id === jt.id; });
            var faIcon = _tablerToFa(jt.ikon);
            return '<div style="text-align:center;padding:16px;border-radius:var(--radius);border:1px solid var(--border);background:' +
                (earned ? 'var(--primary-bg)' : 'var(--bg)') + ';opacity:' + (earned ? '1' : '0.4') + '">' +
                '<div style="width:48px;height:48px;border-radius:50%;background:' + (earned ? jt.szin : '#ddd') + ';display:flex;align-items:center;justify-content:center;margin:0 auto 8px;color:white;font-size:20px">' +
                '<i class="' + faIcon + '"></i></div>' +
                '<div style="font-weight:600;font-size:13px">' + _escHtml(jt.nev) + '</div>' +
                '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + _escHtml(jt.feltetel) + '</div>' +
                '</div>';
        }).join('');

        // Szintrendszer leírás
        var szintekHtml = SZINTEK.map(function(s) {
            var isCurrent = s.nev === szint.nev;
            return '<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;' +
                (isCurrent ? 'background:var(--primary-bg);border:1px solid var(--primary)' : '') + '">' +
                '<i class="' + s.ikon + '" style="font-size:20px;color:' + s.szin + ';width:24px;text-align:center"></i>' +
                '<div style="flex:1"><span style="font-weight:' + (isCurrent ? '700' : '500') + ';font-size:14px">' + s.nev + '</span></div>' +
                '<span style="font-size:12px;color:var(--text-muted)">' + s.min + '+ pont</span></div>';
        }).join('');

        modalContent.innerHTML =
            '<button class="modal-close" onclick="MmSziget.closeModal(\'jelveny\')"><i class="fas fa-times"></i></button>' +
            '<div style="text-align:center;margin-bottom:24px">' +
            '<div style="width:64px;height:64px;border-radius:50%;background:var(--gradient-accent);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-weight:700;font-size:24px;color:var(--primary-dark)">' + initials + '</div>' +
            '<h3 style="margin-bottom:4px">' + _escHtml(_user.nev) + '</h3>' +
            '<div style="font-size:14px;color:var(--text-muted)">' + _escHtml(_user.gyulekezet) + '</div>' +
            '<div style="display:inline-flex;align-items:center;gap:6px;margin-top:12px;padding:6px 16px;border-radius:20px;background:var(--primary-bg);color:var(--primary);font-weight:700;font-size:14px">' +
            '<i class="' + szint.ikon + '"></i> ' + szint.nev + ' · ' + pont + ' pont</div>' +
            '<div style="max-width:300px;margin:12px auto 0"><div style="height:8px;border-radius:4px;background:var(--border);overflow:hidden">' +
            '<div style="height:100%;border-radius:4px;background:var(--gradient-primary);width:' + progressPct + '%"></div></div>' +
            '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Következő szint: ' + nextSzint.nev + ' (' + nextSzint.min + ' pont)</div></div></div>' +
            '<h4 style="font-size:16px;font-weight:700;margin-bottom:12px">Jelvényeim (' + _myJelvenyek.length + '/' + _jelvenyTipusok.length + ')</h4>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;margin-bottom:24px">' + jelveniekHtml + '</div>' +
            '<h4 style="font-size:16px;font-weight:700;margin-bottom:12px">Szintrendszer</h4>' +
            '<div style="display:flex;flex-direction:column;gap:4px">' + szintekHtml + '</div>';

        _openModal('jelveny');
    }

    // ══════════════════════════════════════════════════════════════════════
    // ÉRTESÍTÉSEK
    // ══════════════════════════════════════════════════════════════════════

    async function _loadNotifCount() {
        try {
            var { count } = await window._supabase
                .from('ertesitesek')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', _user.id)
                .eq('olvasva', false);

            var badge = document.getElementById('mm-nav-notif-count');
            if (badge) {
                if (count && count > 0) {
                    badge.textContent = count > 9 ? '9+' : count;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (e) { /* ertesitesek tábla még nem létezik */ }
    }

    async function _sendNotification(userId, tipus, cim, uzenet, hivatkozas) {
        try {
            await window._supabase.from('ertesitesek').insert({
                user_id: userId,
                tipus: tipus,
                cim: cim,
                uzenet: uzenet,
                hivatkozas: hivatkozas
            });
        } catch (e) { /* ertesitesek tábla még nem létezik */ }
    }

    // ══════════════════════════════════════════════════════════════════════
    // TAB VÁLTÁS
    // ══════════════════════════════════════════════════════════════════════

    function switchIdeaTab(btn, statusz) {
        document.querySelectorAll('.idea-tab').forEach(function(t) { t.classList.remove('active'); });
        btn.classList.add('active');
        _selectedOtletStatusz = statusz;
        _filterOtletek();
    }

    // ══════════════════════════════════════════════════════════════════════
    // MODAL RENDSZER
    // ══════════════════════════════════════════════════════════════════════

    function _openModal(name) {
        var overlay = document.getElementById('mm-modal-' + name);
        if (overlay) overlay.classList.add('active');
    }

    function closeModal(name) {
        var overlay = document.getElementById('mm-modal-' + name);
        if (overlay) overlay.classList.remove('active');
    }

    // ══════════════════════════════════════════════════════════════════════
    // SEGÉDFÜGGVÉNYEK
    // ══════════════════════════════════════════════════════════════════════

    function showLoading(show) {
        var el = document.getElementById('mm-loading-overlay');
        if (el) el.style.display = show ? 'flex' : 'none';
    }

    function showToast(text) {
        var toast = document.getElementById('toast');
        var toastText = document.getElementById('toastText');
        if (!toast || !toastText) return;
        toastText.textContent = text;
        toast.classList.add('show');
        setTimeout(function() { toast.classList.remove('show'); }, 3500);
    }

    function toggleFormChip(chip) {
        chip.classList.toggle('selected');
    }

    function _escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _formatLeiras(text) {
        if (!text) return '<p style="color:#94a3b8;font-style:italic">Nincs leírás.</p>';

        var escaped = _escHtml(text);

        var lines;
        if (escaped.indexOf('\n') !== -1) {
            lines = escaped.split('\n');
        } else {
            escaped = escaped
                .replace(/\s+(Cél:)/g, '\n$1')
                .replace(/\s+(Missziós kategória:)/g, '\n$1')
                .replace(/\s+(Egyházi ünnepkör:)/g, '\n$1')
                .replace(/\s+(Módszertan:)/g, '\n$1')
                .replace(/\s+(Korosztály:)/g, '\n$1')
                .replace(/\s+(Nehézségi szint:)/g, '\n$1')
                .replace(/\s+(Időtartam:)/g, '\n$1')
                .replace(/\s+(Szükséges kellékek)/g, '\n$1')
                .replace(/\s+(Előkészületek:)/g, '\n$1')
                .replace(/\s+(Bevezető\s*[–\-])/g, '\n$1')
                .replace(/\s+(Alapige)/g, '\n$1')
                .replace(/\s+(Igemagyarázat)/g, '\n$1')
                .replace(/\s+(Összefoglalás)/g, '\n$1')
                .replace(/\s+(Záró ima)/g, '\n$1')
                .replace(/\s+(Záró ének)/g, '\n$1')
                .replace(/\s+(Házi feladat)/g, '\n$1')
                .replace(/\s+(Befejezés)/g, '\n$1')
                .replace(/\s+(Alkalmazás)/g, '\n$1')
                .replace(/\s+(Ráhangolódás)/g, '\n$1')
                .replace(/\s+(Feldolgozás)/g, '\n$1')
                .replace(/\s+(Közös megbeszélés)/g, '\n$1')
                .replace(/\s+(Kérdések)/g, '\n$1')
                .replace(/\s+(Csoportmunka)/g, '\n$1')
                .replace(/\s+(Megbeszélés)/g, '\n$1');

            escaped = escaped.replace(/\s*•\s*/g, '\n• ');
            escaped = escaped.replace(/([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}])/gu, '\n$1');
            escaped = escaped.replace(/\s+(\d+\.\s+(?:játék|feladat|lépés|kérdés|rész))/g, '\n$1');

            lines = escaped.split('\n');
        }

        var sectionHeaders = [
            'Cél:', 'Missziós kategória:', 'Egyházi ünnepkör:', 'Módszertan:',
            'Korosztály:', 'Nehézségi szint:', 'Időtartam:', 'Szükséges kellékek',
            'Előkészületek:', 'Bevezető', 'Alapige', 'Igemagyarázat',
            'Összefoglalás', 'Záró ima', 'Záró ének', 'Házi feladat',
            'Befejezés', 'Alkalmazás', 'Ráhangolódás', 'Feldolgozás',
            'Közös megbeszélés', 'Kérdések', 'Csoportmunka', 'Megbeszélés'
        ];

        var html = '';
        var inBulletList = false;

        lines.forEach(function(line) {
            line = line.trim();
            if (!line) return;

            var isBullet = line.charAt(0) === '•' || line.charAt(0) === '-' || line.charAt(0) === '–';

            if (!isBullet && inBulletList) {
                html += '</ul>';
                inBulletList = false;
            }

            if (isBullet) {
                if (!inBulletList) {
                    html += '<ul style="padding-left:1.2rem;margin-bottom:8px">';
                    inBulletList = true;
                }
                html += '<li style="margin-bottom:4px">' + line.substring(1).trim() + '</li>';
                return;
            }

            if (line.indexOf('MISSZIÓS MŰHELY') === 0) {
                html += '<div style="background:rgba(59,130,246,0.1);padding:8px 12px;border-radius:8px;margin-bottom:12px;font-size:13px;color:#3b82f6">' + line + '</div>';
                return;
            }

            var isSection = false;
            for (var i = 0; i < sectionHeaders.length; i++) {
                if (line.indexOf(sectionHeaders[i]) === 0 || (line.length > 2 && line.substring(1).trim().indexOf(sectionHeaders[i]) === 0) || (line.length > 3 && line.substring(2).trim().indexOf(sectionHeaders[i]) === 0)) {
                    isSection = true;
                    break;
                }
            }

            if (isSection) {
                var colonIdx = line.indexOf(':');
                if (colonIdx > 0 && colonIdx < line.length - 1) {
                    html += '<p style="margin-bottom:6px"><strong style="color:var(--primary,#0ca678)">' + line.substring(0, colonIdx + 1) + '</strong> ' + line.substring(colonIdx + 1).trim() + '</p>';
                } else {
                    html += '<h4 style="margin:16px 0 8px;font-size:15px;color:var(--primary,#0ca678)">' + line + '</h4>';
                }
                return;
            }

            var firstChar = line.codePointAt(0);
            if (firstChar > 255) {
                html += '<h4 style="margin:16px 0 8px;font-size:15px">' + line + '</h4>';
                return;
            }

            if (/^\d+\.\s+(játék|feladat|lépés|kérdés|rész)/.test(line)) {
                html += '<h4 style="margin:16px 0 8px;font-size:15px;color:var(--text)">' + line + '</h4>';
                return;
            }

            html += '<p style="text-align:justify;line-height:1.7;margin-bottom:8px">' + line + '</p>';
        });

        if (inBulletList) html += '</ul>';
        return html;
    }

    function _formatDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
    }

    function _getFormatIcon(formatum) {
        var map = {
            'PDF': 'fas fa-file-pdf', 'DOCX': 'fas fa-file-word', 'PPTX': 'fas fa-file-powerpoint',
            'video': 'fas fa-video', 'link': 'fas fa-link', 'csomag': 'fas fa-folder'
        };
        return map[formatum] || 'fas fa-file';
    }

    function _getStatusBadge(statusz) {
        var map = {
            'uj': { css: 'phase-new', label: 'Új' },
            'szavazas': { css: 'phase-vote', label: 'Szavazás' },
            'kozos_munka': { css: 'phase-active', label: 'Közös munka' },
            'megvalosult': { css: 'phase-develop', label: 'Megvalósult' },
            'archivalt': { css: 'phase-new', label: 'Archivált' },
            'piszkozat': { css: 'phase-new', label: 'Piszkozat' }
        };
        return map[statusz] || { css: '', label: statusz };
    }

    function _getKategoriaNevek(katJunction) {
        if (!katJunction || katJunction.length === 0) return [];
        return katJunction.map(function(kj) {
            var kat = _kategoriak.find(function(k) { return k.id === kj.kategoria_id; });
            return kat ? { nev: kat.nev, szin: KAT_SZIN_MAP[kat.nev] || null } : null;
        }).filter(function(k) { return k; });
    }

    function _renderStarsSmall(pontszam) {
        var html = '';
        for (var i = 1; i <= 5; i++) {
            html += '<i class="fas fa-star" style="font-size:12px;color:' + (i <= pontszam ? '#f59f00' : '#ddd') + '"></i>';
        }
        return html;
    }

    function _hashColor(str) {
        var colors = [
            'linear-gradient(135deg,#7c3aed,#a78bfa)', 'linear-gradient(135deg,#059669,#34d399)',
            'linear-gradient(135deg,#db2777,#f472b6)', 'linear-gradient(135deg,#d97706,#fbbf24)',
            'linear-gradient(135deg,#2563eb,#60a5fa)', 'linear-gradient(135deg,#0891b2,#22d3ee)',
            'linear-gradient(135deg,#e11d48,#fb7185)', 'linear-gradient(135deg,#4338ca,#6366f1)'
        ];
        var hash = 0;
        for (var i = 0; i < (str || '').length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
        return colors[Math.abs(hash) % colors.length];
    }

    function _tablerToFa(tablerIcon) {
        var map = {
            'ti-bulb': 'fas fa-lightbulb', 'ti-bulb-filled': 'fas fa-lightbulb',
            'ti-thumb-up': 'fas fa-thumbs-up', 'ti-thumb-up-filled': 'fas fa-thumbs-up',
            'ti-users-group': 'fas fa-people-group', 'ti-upload': 'fas fa-upload',
            'ti-trophy': 'fas fa-trophy', 'ti-crown': 'fas fa-crown',
            'ti-star': 'fas fa-star', 'ti-message-dots': 'fas fa-comment-dots',
            'ti-school': 'fas fa-graduation-cap', 'ti-circle-check': 'fas fa-circle-check',
            'ti-seedling': 'fas fa-seedling', 'ti-heart-handshake': 'fas fa-hand-holding-heart',
            'ti-flame': 'fas fa-fire', 'ti-building-community': 'fas fa-people-roof'
        };
        return map[tablerIcon] || 'fas fa-award';
    }

    function scrollToSection(id) {
        var el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelectorAll('.nav-link').forEach(function(l) { l.classList.remove('active'); });
    }

    // ══════════════════════════════════════════════════════════════════════
    // PUBLIKUS API
    // ══════════════════════════════════════════════════════════════════════

    return {
        init: init,
        filterByKategoria: filterByKategoria,
        openSegedanyagDetail: openSegedanyagDetail,
        rateSegedanyag: rateSegedanyag,
        incrementLetoltes: incrementLetoltes,
        openSegUploadModal: openSegUploadModal,
        handleSegUploadSubmit: handleSegUploadSubmit,
        deleteSegedanyag: deleteSegedanyag,
        openOtletDetail: openOtletDetail,
        toggleTamogatas: toggleTamogatas,
        toggleCsatlakozas: toggleCsatlakozas,
        submitHozzaszolas: submitHozzaszolas,
        deleteOtlet: deleteOtlet,
        handleOtletSubmit: handleOtletSubmit,
        switchIdeaTab: switchIdeaTab,
        openJelvenyModal: openJelvenyModal,
        closeModal: closeModal,
        handleSearch: handleSearch,
        performSearch: performSearch,
        selectSearchResult: selectSearchResult,
        showToast: showToast,
        toggleFormChip: toggleFormChip,
        scrollToSection: scrollToSection
    };
})();

// ── DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', function() {
    MmSziget.init();
});
