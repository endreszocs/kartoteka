// ═══════════════════════════════════════════════════════════════════════════
// Missziós Műhely — Gamifikáció modul
// Pontrendszer, szintrendszer (6 szint), jelvényrendszer (12 jelvény)
// Statisztika kezelés, ranglista, jelvények modal
// ═══════════════════════════════════════════════════════════════════════════

var MmGamification = (function() {
    'use strict';

    var _user = null;
    var _kategoriak = [];
    var _jelvenyTipusok = [];
    var _myStats = null;
    var _myJelvenyek = [];

    // ── Szintrendszer (6 szint) ──
    var SZINTEK = [
        { nev: 'Újonc',                min: 0,    max: 49,   ikon: 'ti ti-seedling',              szin: '#adb5bd', leiras: 'Üdv a Missziós Műhelyben!' },
        { nev: 'Szolgálattevő',         min: 50,   max: 149,  ikon: 'ti ti-heart-handshake',       szin: '#206bc4', leiras: 'Aktívan részt veszel a közösségben!' },
        { nev: 'Lelkes Misszionárius',  min: 150,  max: 349,  ikon: 'ti ti-flame',                 szin: '#f59f00', leiras: 'Lángoló lelkesedéssel szolgálsz!' },
        { nev: 'Tapasztalt Munkatárs',  min: 350,  max: 699,  ikon: 'ti ti-star',                  szin: '#f76707', leiras: 'Tapasztalatod értékes a közösségnek!' },
        { nev: 'Közösségépítő',         min: 700,  max: 1199, ikon: 'ti ti-building-community',    szin: '#ae3ec9', leiras: 'Igazi közösségépítő vagy!' },
        { nev: 'Missziói Bajnok',       min: 1200, max: 99999,ikon: 'ti ti-trophy',                szin: '#d63939', leiras: 'A misszió bajnoka — példakép!' }
    ];

    // ── Pontozási szabályok ──
    var PONT_SZABALYOK = {
        'otlet_bekuldve':       { pont: 10, stat: 'otletek_szama',        leiras: 'Ötlet beküldése' },
        'otlet_tovabbjutott':   { pont: 25, stat: 'elfogadott_otletek',   leiras: 'Ötlet továbbjutott (közös munka)' },
        'otlet_megvalosult':    { pont: 50, stat: 'megvalosult_otletek',  leiras: 'Ötlet megvalósult' },
        'szavazat_adva':        { pont: 2,  stat: 'tamogatasok_adva',     leiras: 'Szavazat/támogatás adása' },
        'csatlakozas':          { pont: 5,  stat: null,                   leiras: 'Projekthez csatlakozás' },
        'hozzaszolas':          { pont: 3,  stat: 'hozzaszolasok_szama',  leiras: 'Hozzászólás írása' },
        'segedanyag_feltoltes': { pont: 8,  stat: 'segedanyagok_feltoltve', leiras: 'Segédanyag feltöltése' },
        'ot_csillag_kapott':    { pont: 3,  stat: null,                   leiras: '5 csillagos értékelés kapott' },
        'feladat_teljesitve':   { pont: 5,  stat: 'feladatok_teljesitve', leiras: 'Feladat teljesítése' },
        '50_letoltes':          { pont: 15, stat: null,                   leiras: 'Segédanyag 50+ letöltés (egyszeri)' },
        'ertekeles_adva':       { pont: 1,  stat: 'ertekelesek_adva',     leiras: 'Értékelés adása' }
    };

    // ══════════════════════════════════════════════════════════════════════
    // INIT
    // ══════════════════════════════════════════════════════════════════════

    async function init(user, kategoriak) {
        _user = user;
        _kategoriak = kategoriak;
        await _loadJelvenyTipusok();
        await _loadMyStats();
        await _loadMyJelvenyek();
        _updateJelvenyCount();
    }

    async function _loadJelvenyTipusok() {
        var { data } = await window._supabase
            .from('mm_jelveny_tipusok')
            .select('*')
            .order('sorrend');
        _jelvenyTipusok = data || [];
    }

    async function _loadMyStats() {
        var { data } = await window._supabase
            .from('mm_felhasznalo_statisztika')
            .select('*')
            .eq('user_id', _user.id)
            .maybeSingle();

        if (!data) {
            // Első használat — statisztika rekord létrehozása
            var { data: newStat } = await window._supabase
                .from('mm_felhasznalo_statisztika')
                .insert({ user_id: _user.id })
                .select()
                .single();
            _myStats = newStat;
        } else {
            _myStats = data;
        }
    }

    async function _loadMyJelvenyek() {
        var { data } = await window._supabase
            .from('mm_felhasznalo_jelveny')
            .select('*, mm_jelveny_tipusok(*)')
            .eq('user_id', _user.id);
        _myJelvenyek = data || [];
    }

    function _updateJelvenyCount() {
        var el = document.getElementById('mm-jelveny-count');
        if (el) el.textContent = _myJelvenyek.length;
    }

    // ══════════════════════════════════════════════════════════════════════
    // PONT HOZZÁADÁS
    // ══════════════════════════════════════════════════════════════════════

    async function addPoints(eventType, userId) {
        var szabaly = PONT_SZABALYOK[eventType];
        if (!szabaly) return;

        try {
            // Statisztika lekérdezés/létrehozás
            var { data: stat } = await window._supabase
                .from('mm_felhasznalo_statisztika')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();

            if (!stat) {
                await window._supabase.from('mm_felhasznalo_statisztika')
                    .insert({ user_id: userId });
                stat = { osszpontszam: 0, otletek_szama: 0, elfogadott_otletek: 0, megvalosult_otletek: 0,
                         tamogatasok_adva: 0, hozzaszolasok_szama: 0, segedanyagok_feltoltve: 0,
                         feladatok_teljesitve: 0, ertekelesek_adva: 0, szint: 'Újonc' };
            }

            // Pont és statisztika frissítés
            var updateData = {
                osszpontszam: (stat.osszpontszam || 0) + szabaly.pont,
                frissitve: new Date().toISOString()
            };

            if (szabaly.stat && stat[szabaly.stat] !== undefined) {
                updateData[szabaly.stat] = (stat[szabaly.stat] || 0) + 1;
            }

            // Szint kiszámítása
            var newPontszam = updateData.osszpontszam;
            var newSzint = _getSzintByPont(newPontszam);
            updateData.szint = newSzint.nev;

            // Szintlépés ellenőrzés
            var oldSzint = stat.szint || 'Újonc';
            var szintLepett = oldSzint !== newSzint.nev;

            await window._supabase
                .from('mm_felhasznalo_statisztika')
                .update(updateData)
                .eq('user_id', userId);

            // Szintlépés értesítés
            if (szintLepett) {
                await MmApi.sendNotification(userId, 'success',
                    'Szintlépés!',
                    'Gratulálunk! Elérted a(z) "' + newSzint.nev + '" szintet a Missziós Műhelyben!');
            }

            // Jelvény ellenőrzés
            await _checkJelvenyek(userId, updateData);

            // Saját stats frissítés ha az aktuális user
            if (userId === _user.id) {
                _myStats = Object.assign(_myStats || {}, updateData);
                _updateJelvenyCount();
            }

        } catch (err) {
            console.error('Pont hozzáadási hiba:', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // JELVÉNY ELLENŐRZÉS
    // ══════════════════════════════════════════════════════════════════════

    async function _checkJelvenyek(userId, stats) {
        // Meglévő jelvények lekérdezése
        var { data: meglevoJelvenyek } = await window._supabase
            .from('mm_felhasznalo_jelveny')
            .select('jelveny_id')
            .eq('user_id', userId);

        var meglevoBadgeIds = (meglevoJelvenyek || []).map(function(j) { return j.jelveny_id; });

        // Ellenőrzési szabályok
        var ellenorzesek = [
            { kod: 'elso_otlet',      check: function(s) { return (s.otletek_szama || 0) >= 1; } },
            { kod: 'otletgyaros',     check: function(s) { return (s.otletek_szama || 0) >= 5; } },
            { kod: 'tamogato',        check: function(s) { return (s.tamogatasok_adva || 0) >= 10; } },
            { kod: 'tamogato_bajnok', check: function(s) { return (s.tamogatasok_adva || 0) >= 25; } },
            { kod: 'feltolto',        check: function(s) { return (s.segedanyagok_feltoltve || 0) >= 5; } },
            { kod: 'siker',           check: function(s) { return (s.megvalosult_otletek || 0) >= 1; } },
            { kod: 'nagy_siker',      check: function(s) { return (s.megvalosult_otletek || 0) >= 3; } },
            { kod: 'top_ertekelo',    check: function(s) { return (s.ertekelesek_adva || 0) >= 20; } },
            { kod: 'hozzaszolo',      check: function(s) { return (s.hozzaszolasok_szama || 0) >= 50; } },
            { kod: 'mentor',          check: function(s) { return (s.feladatok_teljesitve || 0) >= 10; } }
        ];

        for (var i = 0; i < ellenorzesek.length; i++) {
            var e = ellenorzesek[i];
            var jelvenyTipus = _jelvenyTipusok.find(function(jt) { return jt.kod === e.kod; });
            if (!jelvenyTipus) continue;

            // Már megvan?
            if (meglevoBadgeIds.indexOf(jelvenyTipus.id) !== -1) continue;

            // Jogosult?
            if (e.check(stats)) {
                await _awardJelveny(userId, jelvenyTipus);
            }
        }

        // Közösségi ember — külön lekérdezéssel
        var kozossegiJelveny = _jelvenyTipusok.find(function(jt) { return jt.kod === 'kozossegi'; });
        if (kozossegiJelveny && meglevoBadgeIds.indexOf(kozossegiJelveny.id) === -1) {
            var { count: csatlakozasCount } = await window._supabase
                .from('mm_szavazatok')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('tipus', 'csatlakozas');
            if (csatlakozasCount >= 3) {
                await _awardJelveny(userId, kozossegiJelveny);
            }
        }
    }

    async function _awardJelveny(userId, jelvenyTipus) {
        try {
            await window._supabase.from('mm_felhasznalo_jelveny').insert({
                user_id: userId,
                jelveny_id: jelvenyTipus.id
            });

            // Értesítés
            await MmApi.sendNotification(userId, 'success',
                'Új jelvény: ' + jelvenyTipus.nev + '!',
                jelvenyTipus.leiras);

            // Saját jelvények frissítése
            if (userId === _user.id) {
                await _loadMyJelvenyek();
                _updateJelvenyCount();
            }
        } catch (e) {
            // UNIQUE constraint hiba → már megvan (race condition)
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SZINTRENDSZER
    // ══════════════════════════════════════════════════════════════════════

    function _getSzintByPont(pont) {
        for (var i = SZINTEK.length - 1; i >= 0; i--) {
            if (pont >= SZINTEK[i].min) return SZINTEK[i];
        }
        return SZINTEK[0];
    }

    function getSzintInfo(pont) {
        return _getSzintByPont(pont || 0);
    }

    // ══════════════════════════════════════════════════════════════════════
    // JELVÉNYEK MODAL
    // ══════════════════════════════════════════════════════════════════════

    async function openJelvenyModal() {
        await _loadMyStats();
        await _loadMyJelvenyek();

        var pont = _myStats ? _myStats.osszpontszam || 0 : 0;
        var szint = _getSzintByPont(pont);

        // Szint fejléc
        document.getElementById('mm-jelv-szint-ikon').className = szint.ikon + ' text-white';
        document.getElementById('mm-jelv-szint-avatar').style.background = szint.szin;
        document.getElementById('mm-jelv-szint-nev').textContent = szint.nev;
        document.getElementById('mm-jelv-szint-leiras').textContent = szint.leiras;
        document.getElementById('mm-jelv-pontszam').textContent = pont;

        // Progress a következő szinthez
        var nextSzint = SZINTEK.find(function(s) { return s.min > pont; });
        if (nextSzint) {
            var progressPercent = ((pont - szint.min) / (nextSzint.min - szint.min)) * 100;
            document.getElementById('mm-jelv-szint-progress').style.width = progressPercent + '%';
            document.getElementById('mm-jelv-szint-info').textContent =
                pont + ' / ' + nextSzint.min + ' pont a következő szinthez (' + nextSzint.nev + ')';
        } else {
            document.getElementById('mm-jelv-szint-progress').style.width = '100%';
            document.getElementById('mm-jelv-szint-info').textContent = 'Elérted a legmagasabb szintet!';
        }

        // Statisztikák
        if (_myStats) {
            document.getElementById('mm-jelv-stat-otlet').textContent = _myStats.otletek_szama || 0;
            document.getElementById('mm-jelv-stat-seg').textContent = _myStats.segedanyagok_feltoltve || 0;
            document.getElementById('mm-jelv-stat-tamogatas').textContent = _myStats.tamogatasok_adva || 0;
            document.getElementById('mm-jelv-stat-hozzaszolas').textContent = _myStats.hozzaszolasok_szama || 0;
            document.getElementById('mm-jelv-stat-feladat').textContent = _myStats.feladatok_teljesitve || 0;
            document.getElementById('mm-jelv-stat-megval').textContent = _myStats.megvalosult_otletek || 0;
        }

        // Jelvények grid
        var jelvenyGrid = document.getElementById('mm-jelv-grid');
        var myJelvenyIds = _myJelvenyek.map(function(j) { return j.jelveny_id; });

        var gridHtml = '';
        _jelvenyTipusok.forEach(function(jt) {
            var earned = myJelvenyIds.indexOf(jt.id) !== -1;
            var earnedJelveny = earned ? _myJelvenyek.find(function(j) { return j.jelveny_id === jt.id; }) : null;

            gridHtml += '<div class="col-6 col-md-4 col-lg-3">' +
                '<div class="card text-center' + (earned ? '' : ' opacity-50') + '" style="border:2px solid ' + (earned ? jt.szin : '#dee2e6') + ';">' +
                '<div class="card-body py-3">' +
                '<div class="mb-2"><i class="' + jt.ikon + (earned ? ' mm-badge-new' : '') + '" style="font-size:2rem;color:' + (earned ? jt.szin : '#adb5bd') + ';"></i></div>' +
                '<div class="fw-bold small">' + jt.nev + '</div>' +
                '<div class="text-muted" style="font-size:0.7rem;">' + jt.leiras + '</div>' +
                (earned && earnedJelveny ? '<div class="text-success small mt-1"><i class="ti ti-circle-check me-1"></i>' + MmApi.formatDate(earnedJelveny.elnyerve) + '</div>' : '') +
                (!earned ? '<div class="text-muted small mt-1"><i class="ti ti-lock me-1"></i>' + jt.feltetel + '</div>' : '') +
                '</div></div></div>';
        });
        jelvenyGrid.innerHTML = gridHtml;

        // Szintrendszer leírás
        var szintekHtml = '';
        SZINTEK.forEach(function(s) {
            var isCurrent = s.nev === szint.nev;
            szintekHtml += '<div class="list-group-item' + (isCurrent ? ' list-group-item-primary' : '') + '">' +
                '<div class="d-flex align-items-center">' +
                '<i class="' + s.ikon + ' me-3" style="font-size:1.5rem;color:' + s.szin + ';"></i>' +
                '<div class="flex-fill">' +
                '<div class="fw-bold">' + s.nev + (isCurrent ? ' <span class="badge bg-primary">Jelenlegi</span>' : '') + '</div>' +
                '<div class="text-muted small">' + s.leiras + '</div>' +
                '</div>' +
                '<div class="text-muted">' + s.min + '+ pont</div>' +
                '</div></div>';
        });
        document.getElementById('mm-jelv-szintek').innerHTML = szintekHtml;

        var bsModal = new bootstrap.Modal(document.getElementById('modal-mm-jelveny'));
        bsModal.show();
    }

    // ── Publikus API ──
    return {
        init: init,
        addPoints: addPoints,
        getSzintInfo: getSzintInfo,
        openJelvenyModal: openJelvenyModal
    };
})();
