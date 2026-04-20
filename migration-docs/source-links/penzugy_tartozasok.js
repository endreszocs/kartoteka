// ============================================================================
// GYÜLEKEZETI TARTOZÁSOK MODUL
// Járulék és bérleti kintlévőségek nyilvántartása
// ============================================================================

var _tartozasokLoaded = false;
var _berletiSzerzodesek = [];

// ── Évszűrő inicializálás ──────────────────────────────────────────────────
function _initTartozasokFilters() {
    var tolEl = document.getElementById('tartozas-ev-tol');
    var igEl  = document.getElementById('tartozas-ev-ig');
    if (!tolEl || !igEl || tolEl.options.length > 0) return;

    var curYear = new Date().getFullYear();
    for (var y = curYear; y >= 2020; y--) {
        tolEl.add(new Option(y, y));
        igEl.add(new Option(y, y));
    }
    // Alapértelmezés: előző év — aktuális év
    tolEl.value = curYear - 1;
    igEl.value = curYear;
}

// ── Fő betöltő függvény ────────────────────────────────────────────────────
window.loadTartozasok = async function() {
    _initTartozasokFilters();

    var loadingEl = document.getElementById('tartozasok-loading');
    if (loadingEl) loadingEl.classList.remove('d-none');

    var evTol = parseInt((document.getElementById('tartozas-ev-tol') || {}).value) || (new Date().getFullYear() - 1);
    var evIg  = parseInt((document.getElementById('tartozas-ev-ig') || {}).value) || new Date().getFullYear();

    if (evTol > evIg) { var tmp = evTol; evTol = evIg; evIg = tmp; }

    try {
        // Kategória ID-k megkeresése a bevCelMap-ből
        var jarulekCelIds = [];
        var berletCelIds = [];
        for (var celId in window.bevCelMap) {
            var kod = window.bevCelMap[celId];
            if (kod === '101.01') jarulekCelIds.push(parseInt(celId));
            if (kod === '104.04' || kod === '104.05') berletCelIds.push(parseInt(celId));
        }

        // Párhuzamos Supabase lekérdezések
        var queries = [
            // 1. Járulék befizetések az évtartományban
            _supabase.from('befizetes').select('id_szemely, osszeg, fizetettev')
                .eq('congregation_id', activeCongregationId)
                .eq('deleted', false)
                .in('id_befizetescel', jarulekCelIds.length > 0 ? jarulekCelIds : [-1])
                .gte('fizetettev', evTol)
                .lte('fizetettev', evIg),
            // 2. Bérleti befizetések az évtartományban
            _supabase.from('befizetes').select('id_szemely, osszeg, fizetettev, forrasa, id_befizetescel')
                .eq('congregation_id', activeCongregationId)
                .eq('deleted', false)
                .in('id_befizetescel', berletCelIds.length > 0 ? berletCelIds : [-1])
                .gte('fizetettev', evTol)
                .lte('fizetettev', evIg),
            // 3. Bérleti szerződések
            _supabase.from('berleti_szerzodes').select('*')
                .eq('congregation_id', activeCongregationId)
                .eq('deleted', false),
            // 4. Felmentések
            _supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege')
                .eq('congregation_id', activeCongregationId),
            // 5. Évenkénti járulék a bealitas táblából
            _supabase.from('bealitas').select('id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid')
                .eq('congregation_id', activeCongregationId),
            // 6. Gyülekezeti beállítás: elmaradás számítás módja
            _supabase.from('congregations').select('tartozas_szamitas_mod')
                .eq('id', activeCongregationId)
                .single(),
            // 7. Kedvezmények (kor, jövedelem, időszaki) — graceful ha tábla nem létezik
            _supabase.from('jarulek_kedvezmeny').select('*')
                .eq('congregation_id', activeCongregationId)
                .eq('aktiv', true)
                .then(function(r) { return r; })
                .catch(function() { return { data: [] }; })
        ];

        var results = await Promise.all(queries);

        var jarulekBev = (results[0].data || []);
        var berletBev  = (results[1].data || []);
        _berletiSzerzodesek = (results[2].data || []);
        var felmentesek = (results[3].data || []);

        // Évenkénti járulék map: { 2023: { osszeg: 220, kedv: 160 }, ... }
        var jarulekPerYear = {};
        (results[4].data || []).forEach(function(b) {
            jarulekPerYear[b.id] = {
                osszeg: parseFloat(b.eves_jarulek) || 0,
                kedv: parseFloat(b.jarulek_kedvezmenyes) || 0,
                hatarid: b.jarulek_hatarid || '07-01'
            };
        });

        // Elmaradás számítás módja (graceful: ha az oszlop nem létezik)
        var szamitasMod = 'akkori';
        try { szamitasMod = (results[5].data || {}).tartozas_szamitas_mod || 'akkori'; } catch(e) {}

        // Kedvezmények (kor, jövedelem, időszaki)
        var kedvezmenyek = [];
        try { kedvezmenyek = results[6].data || []; } catch(e) {}

        // Feldolgozás és renderelés
        var jarulekTotal = _renderJarulekTartozas(evTol, evIg, jarulekBev, felmentesek, jarulekPerYear, szamitasMod, kedvezmenyek);
        var berletTotal  = _renderBerletTartozas(evTol, evIg, berletBev);
        _renderOsszesito(jarulekTotal, berletTotal);

        _tartozasokLoaded = true;
    } catch (err) {
        console.error('Tartozások betöltési hiba:', err);
    } finally {
        if (loadingEl) loadingEl.classList.add('d-none');
    }
};

// ============================================================================
// JÁRULÉK KINTLÉVŐSÉG SZÁMÍTÁS
// ============================================================================

function _renderJarulekTartozas(evTol, evIg, befizetesek, felmentesek, jarulekPerYear, szamitasMod, kedvezmenyek) {
    var tbody = document.getElementById('jarulek-ev-tbody');
    var detailCont = document.getElementById('jarulek-reszletes-container');
    if (!tbody) return 0;

    var defaultJarulek = window.evesJarulek || 0;
    var aktivTagok = (window.allChurchMembers || []).filter(function(m) {
        return m.isvisible !== false && m.meghalt !== true;
    });

    // Kedvezmények csoportosítása: { év: { kor: [...], idoszak: [...], jovedelem: [...] } }
    var kedvByEv = {};
    (kedvezmenyek || []).forEach(function(k) {
        var kev = String(k.ev);
        if (!kedvByEv[kev]) kedvByEv[kev] = { kor: [], idoszak: [], jovedelem: [] };
        if (kedvByEv[kev][k.tipus]) kedvByEv[kev][k.tipus].push(k);
    });

    // Felmentett személyek szűrése
    var felmentettIds = {};
    (felmentesek || []).forEach(function(f) {
        if (f.id_szemely) {
            for (var y = (f.kezdete || 2000); y <= (f.vege || 2099); y++) {
                if (!felmentettIds[y]) felmentettIds[y] = {};
                felmentettIds[y][f.id_szemely] = true;
            }
        }
    });

    // Befizetések csoportosítása: { év: { szemely_id: összeg } }
    var bevByEv = {};
    befizetesek.forEach(function(b) {
        var ev = b.fizetettev;
        if (!bevByEv[ev]) bevByEv[ev] = {};
        var sid = b.id_szemely || 0;
        bevByEv[ev][sid] = (bevByEv[ev][sid] || 0) + parseFloat(b.osszeg);
    });

    // Személy elvárás számítás: kor kedvezmény figyelembevételével
    function _szemelyElvaras(m, ev, evJarulek) {
        var evKedvek = kedvByEv[String(ev)];
        if (!evKedvek || evKedvek.kor.length === 0) return evJarulek;

        // Életkor számítás
        var eletkor = 0;
        if (m.sz_datum) {
            var szEv = parseInt(m.sz_datum.substring(0, 4));
            if (szEv > 1900) eletkor = ev - szEv;
        }

        // Legjobb kor-kedvezmény keresés (a legnagyobb kedvezményt adó)
        var bestKedv = null;
        evKedvek.kor.forEach(function(k) {
            if (eletkor >= (k.kor_tol || 999)) {
                if (!bestKedv) { bestKedv = k; return; }
                // Azt választjuk ami kisebb összeget ad (= nagyobb kedvezmény)
                var akt = k.fix_osszeg ? k.fix_osszeg : (evJarulek * (k.szazalek || 100) / 100);
                var best = bestKedv.fix_osszeg ? bestKedv.fix_osszeg : (evJarulek * (bestKedv.szazalek || 100) / 100);
                if (akt < best) bestKedv = k;
            }
        });

        if (bestKedv) {
            if (bestKedv.fix_osszeg) return parseFloat(bestKedv.fix_osszeg);
            if (bestKedv.szazalek) return evJarulek * parseFloat(bestKedv.szazalek) / 100;
        }
        return evJarulek;
    }

    var html = '';
    var detailHtml = '';
    var osszhatra = 0;

    for (var ev = evIg; ev >= evTol; ev--) {
        // Nem felmentett aktív tagok száma
        var nemFelmentett = aktivTagok.filter(function(m) {
            return !(felmentettIds[ev] && felmentettIds[ev][m.id]);
        });
        var tagszam = nemFelmentett.length;
        var evInfo = (jarulekPerYear && jarulekPerYear[ev]) ? jarulekPerYear[ev] : null;
        // szamitasMod: 'aktualis' = mindig az aktuális járulékkal, 'akkori' = akkori évi járulékkal
        var evJarulek = (szamitasMod === 'aktualis') ? defaultJarulek : (evInfo ? evInfo.osszeg : defaultJarulek);

        // Kedvezmény infó (időszaki + kor) az adott évre
        var evKedvek = kedvByEv[String(ev)];
        var vanKorKedv = evKedvek && evKedvek.kor.length > 0;
        var vanIdoszakKedv = evKedvek && evKedvek.idoszak.length > 0;

        // Elvárás: személyenként számolva (kor kedvezmény figyelembevétele)
        var elvaras = 0;
        var kedvezmenyes = 0;
        nemFelmentett.forEach(function(m) {
            var szemElvar = _szemelyElvaras(m, ev, evJarulek);
            elvaras += szemElvar;
            if (szemElvar < evJarulek) kedvezmenyes++;
        });

        var befizetett = 0;
        var evBev = bevByEv[ev] || {};
        for (var sid in evBev) { befizetett += evBev[sid]; }

        // Hátralék: személyenként számolva (kor kedvezménnyel)
        var hatralekEv = 0;
        nemFelmentett.forEach(function(m) {
            var fizettOsszeg = (evBev[m.id] || 0);
            var szemElvar = _szemelyElvaras(m, ev, evJarulek);
            hatralekEv += Math.max(0, szemElvar - fizettOsszeg);
        });
        osszhatra += hatralekEv;

        var rowClass = hatralekEv > 0 ? 'table-danger' : '';
        // Kedvezmény jelző szövegek
        var kedvInfo = '';
        if (vanKorKedv) {
            kedvInfo += ' <span class="badge bg-cyan-lt ms-1" title="Kor alapú kedvezmény aktív">' + kedvezmenyes + ' fő kedv.</span>';
        }
        if (vanIdoszakKedv) {
            var idKedv = evKedvek.idoszak[0];
            var idInfo = idKedv.kedv_osszeg ? (idKedv.kedv_osszeg + ' RON') : (idKedv.szazalek + '%');
            kedvInfo += ' <span class="badge bg-warning-lt ms-1" title="Időszaki kedvezmény: ' + (idKedv.hatarid || '') + '-ig">' + idInfo + '</span>';
        }

        html += '<tr class="' + rowClass + '">' +
            '<td class="fw-bold">' + ev + '</td>' +
            '<td class="text-center">' + tagszam + '</td>' +
            '<td class="text-end">' + _fmtPenz(elvaras) + kedvInfo + '</td>' +
            '<td class="text-end text-success">' + _fmtPenz(befizetett) + '</td>' +
            '<td class="text-end text-danger fw-bold">' + _fmtPenz(hatralekEv) + '</td>' +
            '<td class="text-center">' +
                (hatralekEv > 0 ? '<button class="btn btn-sm btn-icon btn-outline-danger" onclick="document.getElementById(\'jarulek-detail-' + ev + '\').classList.toggle(\'d-none\')" title="Részletek"><i class="ti ti-chevron-down"></i></button>' : '') +
            '</td>' +
        '</tr>';

        // Személyenkénti részletek (rejtett, lenyitható)
        if (hatralekEv > 0) {
            detailHtml += '<div id="jarulek-detail-' + ev + '" class="d-none border rounded mb-2 p-2 bg-white">';
            detailHtml += '<h6 class="fw-bold text-danger mb-2"><i class="ti ti-users me-1"></i>' + ev + ' — Tartozó személyek</h6>';
            detailHtml += '<table class="table table-sm table-bordered mb-0"><thead class="bg-light"><tr><th>Név</th><th class="text-end">Elvárás</th><th class="text-end">Befizetett</th><th class="text-end text-danger">Tartozás</th><th>Kedvezmény</th></tr></thead><tbody>';

            nemFelmentett.forEach(function(m) {
                var fizettOsszeg = (evBev[m.id] || 0);
                var szemElvar = _szemelyElvaras(m, ev, evJarulek);
                var tartozas = Math.max(0, szemElvar - fizettOsszeg);
                if (tartozas > 0) {
                    var nev = ((m.csaladnev || '') + ' ' + (m.k_nev || '')).trim() || ('ID:' + m.id);
                    var kedvBadge = '';
                    if (szemElvar < evJarulek) {
                        var kedvPct = Math.round((1 - szemElvar / evJarulek) * 100);
                        kedvBadge = '<span class="badge bg-cyan-lt" title="Kor alapú kedvezmény">-' + kedvPct + '%</span>';
                    }
                    detailHtml += '<tr>' +
                        '<td>' + nev + '</td>' +
                        '<td class="text-end">' + _fmtPenz(szemElvar) + '</td>' +
                        '<td class="text-end text-success">' + _fmtPenz(fizettOsszeg) + '</td>' +
                        '<td class="text-end text-danger fw-bold">' + _fmtPenz(tartozas) + '</td>' +
                        '<td class="text-center">' + kedvBadge + '</td>' +
                    '</tr>';
                }
            });

            detailHtml += '</tbody></table></div>';
        }
    }

    tbody.innerHTML = html || '<tr><td colspan="6" class="text-center text-muted py-3">Nincs járulék adat a megadott időszakban</td></tr>';
    if (detailCont) detailCont.innerHTML = detailHtml;

    var totalEl = document.getElementById('jarulek-osszeg-total');
    if (totalEl) totalEl.textContent = _fmtPenz(osszhatra) + ' RON';

    return osszhatra;
}

// ============================================================================
// BÉRLETI DÍJ KINTLÉVŐSÉG SZÁMÍTÁS
// ============================================================================

function _renderBerletTartozas(evTol, evIg, befizetesek) {
    var tbody = document.getElementById('berlet-tbody');
    if (!tbody) return 0;

    var aktivSzerzodesek = _berletiSzerzodesek.filter(function(sz) { return sz.aktiv; });

    if (aktivSzerzodesek.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Nincs aktív bérleti szerződés. <a href="#" onclick="window.openBerletiSzerzodes();return false;" class="fw-bold">Új szerződés hozzáadása</a></td></tr>';
        var totalEl = document.getElementById('berlet-osszeg-total');
        if (totalEl) totalEl.textContent = '0 RON';
        return 0;
    }

    // Befizetések csoportosítása: { szemely_id: { ev: összeg }, "név": { ev: összeg } }
    var bevBySzemely = {};
    var bevByNev = {};
    befizetesek.forEach(function(b) {
        var ev = b.fizetettev;
        if (b.id_szemely) {
            if (!bevBySzemely[b.id_szemely]) bevBySzemely[b.id_szemely] = {};
            bevBySzemely[b.id_szemely][ev] = (bevBySzemely[b.id_szemely][ev] || 0) + parseFloat(b.osszeg);
        }
        if (b.forrasa) {
            var nev = b.forrasa.trim().toLowerCase();
            if (!bevByNev[nev]) bevByNev[nev] = {};
            bevByNev[nev][ev] = (bevByNev[nev][ev] || 0) + parseFloat(b.osszeg);
        }
    });

    var html = '';
    var osszhatra = 0;

    aktivSzerzodesek.forEach(function(sz) {
        // Számoljuk ki az éves elvárást
        var evesDij = sz.fizetesi_ciklus === 'havi' ? parseFloat(sz.osszeg) * 12 : parseFloat(sz.osszeg);

        // Befizetések összesítése az évtartományban
        var fizettOssz = 0;
        var elvartOssz = 0;

        for (var ev = evTol; ev <= evIg; ev++) {
            // Ellenőrizzük, hogy az adott évben aktív volt-e a szerződés
            var szKezdetEv = new Date(sz.kezdet).getFullYear();
            var szVegeEv = sz.vege ? new Date(sz.vege).getFullYear() : 9999;
            if (ev < szKezdetEv || ev > szVegeEv) continue;

            // Részéves kezelés
            var aranyos = evesDij;
            if (ev === szKezdetEv) {
                var szKezdetHo = new Date(sz.kezdet).getMonth();
                aranyos = evesDij * (12 - szKezdetHo) / 12;
            }
            if (ev === szVegeEv && sz.vege) {
                var szVegeHo = new Date(sz.vege).getMonth() + 1;
                aranyos = evesDij * szVegeHo / 12;
            }
            elvartOssz += aranyos;

            // Befizetés keresés: személy ID vagy név alapján
            var eviFizetes = 0;
            if (sz.id_szemely && bevBySzemely[sz.id_szemely]) {
                eviFizetes += (bevBySzemely[sz.id_szemely][ev] || 0);
            }
            var nevKey = (sz.berlo_nev || '').trim().toLowerCase();
            if (nevKey && bevByNev[nevKey]) {
                eviFizetes += (bevByNev[nevKey][ev] || 0);
            }
            fizettOssz += eviFizetes;
        }

        var hatralekSz = Math.max(0, elvartOssz - fizettOssz);
        osszhatra += hatralekSz;

        var tipus = sz.tipus === 'epulet' ? 'Épület' : 'Terület';
        var rowClass = hatralekSz > 0 ? 'table-warning' : '';

        html += '<tr class="' + rowClass + '">' +
            '<td class="fw-bold">' + (sz.berlo_nev || '') + '</td>' +
            '<td>' + (sz.leiras || '') + '</td>' +
            '<td class="text-center"><span class="badge ' + (sz.tipus === 'epulet' ? 'bg-primary' : 'bg-green') + '">' + tipus + '</span></td>' +
            '<td class="text-end">' + _fmtPenz(evesDij) + '</td>' +
            '<td class="text-end text-success">' + _fmtPenz(fizettOssz) + '</td>' +
            '<td class="text-end text-danger fw-bold">' + _fmtPenz(hatralekSz) + '</td>' +
            '<td class="text-center">' +
                '<button class="btn btn-sm btn-icon btn-outline-warning" onclick="window.openBerletiSzerzodes(\'' + sz.id + '\')" title="Szerkesztés"><i class="ti ti-edit"></i></button>' +
            '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    var totalEl = document.getElementById('berlet-osszeg-total');
    if (totalEl) totalEl.textContent = _fmtPenz(osszhatra) + ' RON';

    return osszhatra;
}

// ============================================================================
// ÖSSZESÍTŐ
// ============================================================================

function _renderOsszesito(jarulekTotal, berletTotal) {
    var osszes = jarulekTotal + berletTotal;
    var el = document.getElementById('tartozas-osszes-total');
    if (el) el.textContent = _fmtPenz(osszes) + ' RON';

    var jEl = document.getElementById('tartozas-jarulek-sum');
    if (jEl) jEl.textContent = _fmtPenz(jarulekTotal);

    var bEl = document.getElementById('tartozas-berlet-sum');
    if (bEl) bEl.textContent = _fmtPenz(berletTotal);
}

// ── Pénz formázás ──────────────────────────────────────────────────────────
function _fmtPenz(n) {
    return (n || 0).toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================================
// BÉRLETI SZERZŐDÉS CRUD
// ============================================================================

// ── Bérlő típus váltás (személy / cég) ──
window._bsToggleBerloTipus = function() {
    var tipus = (document.querySelector('input[name="bs-berlo-tipus"]:checked') || {}).value || 'szemely';
    document.getElementById('bs-szemely-section').classList.toggle('d-none', tipus !== 'szemely');
    document.getElementById('bs-ceg-section').classList.toggle('d-none', tipus !== 'ceg');
};

// ── Okos személykereső a bérleti szerződéshez ──
window._bsSzemelySearch = function(query) {
    var dropdown = document.getElementById('bs-szemely-dropdown');
    if (!dropdown) return;
    var q = (query || '').toLowerCase().trim();
    if (q.length < 1) { dropdown.classList.remove('show'); return; }

    var members = (window.allChurchMembers || []).filter(function(m) {
        if (m.isvisible === false || m.meghalt === true) return false;
        var nev = ((m.csaladnev || '') + ' ' + (m.k_nev || '')).toLowerCase();
        return nev.indexOf(q) >= 0;
    });

    if (members.length === 0) {
        dropdown.innerHTML = '<div class="px-3 py-2 text-muted small">Nincs találat</div>';
        dropdown.classList.add('show');
        return;
    }

    var html = '';
    members.slice(0, 15).forEach(function(m) {
        var nev = ((m.csaladnev || '') + ' ' + (m.k_nev || '')).trim();
        var kor = '';
        if (m.sz_datum) {
            var szEv = parseInt(m.sz_datum.substring(0, 4));
            if (szEv > 1900) kor = (new Date().getFullYear() - szEv) + ' éves';
        }
        var utca = (m.adrstreet && m.adrstreet.name) ? m.adrstreet.name : '';
        var helyseg = (m.adrlocality && m.adrlocality.name) ? m.adrlocality.name : '';
        var hsz = m.c_szam || '';
        var cim = [utca, hsz, helyseg].filter(Boolean).join(', ');
        html += '<a href="#" class="dropdown-item py-1 px-3" onclick="event.preventDefault();window._bsSzemelySelect(' + m.id + ',\'' + nev.replace(/'/g, "\\'") + '\')">'
            + '<div class="fw-bold">' + nev + '</div>'
            + '<small class="text-muted">' + [kor, cim].filter(Boolean).join(' · ') + '</small>'
            + '</a>';
    });
    dropdown.innerHTML = html;
    dropdown.classList.add('show');
};

window._bsSzemelySelect = function(id, nev) {
    document.getElementById('bs-berlo-nev').value = nev;
    document.getElementById('bs-id-szemely').value = id;
    document.getElementById('bs-szemely-dropdown').classList.remove('show');
};

// Kattintáson kívül záródjon a dropdown
document.addEventListener('click', function(e) {
    if (!e.target.closest('#bs-szemely-section')) {
        var dd = document.getElementById('bs-szemely-dropdown');
        if (dd) dd.classList.remove('show');
    }
    if (!e.target.closest('#bs-leltari-szam') && !e.target.closest('#bs-leltar-dropdown')) {
        var dd2 = document.getElementById('bs-leltar-dropdown');
        if (dd2) dd2.classList.remove('show');
    }
});

// ── Leltári szám kereső ──
var _bsLeltarItems = null;

window._bsLeltarSearch = async function(query) {
    var dropdown = document.getElementById('bs-leltar-dropdown');
    if (!dropdown) return;

    // Egyszer betöltjük a leltári tételeket
    if (_bsLeltarItems === null) {
        var res = await _supabase.from('leltar_tetelek')
            .select('leltari_szam, megnevezes, kategoria, helyszin')
            .eq('congregation_id', activeCongregationId)
            .eq('is_deleted', false);
        _bsLeltarItems = res.data || [];
    }

    var q = (query || '').toLowerCase().trim();
    if (q.length < 1) { dropdown.classList.remove('show'); return; }

    var matches = _bsLeltarItems.filter(function(item) {
        return (item.leltari_szam || '').toLowerCase().indexOf(q) >= 0
            || (item.megnevezes || '').toLowerCase().indexOf(q) >= 0
            || (item.kategoria || '').toLowerCase().indexOf(q) >= 0
            || (item.helyszin || '').toLowerCase().indexOf(q) >= 0;
    });

    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="px-3 py-2 text-muted small">Nincs találat</div>';
        dropdown.classList.add('show');
        return;
    }

    var html = '';
    matches.slice(0, 10).forEach(function(item) {
        var leltarInfo = [(item.megnevezes || ''), (item.kategoria || ''), (item.helyszin || '')].filter(Boolean).join(' · ');
        html += '<a href="#" class="dropdown-item py-1 px-3" onclick="event.preventDefault();window._bsLeltarSelect(\'' + (item.leltari_szam || '').replace(/'/g, "\\'") + '\',\'' + (item.megnevezes || '').replace(/'/g, "\\'") + '\')">'
            + '<div class="fw-bold">' + (item.leltari_szam || '') + '</div>'
            + '<small class="text-muted">' + leltarInfo + '</small>'
            + '</a>';
    });
    dropdown.innerHTML = html;
    dropdown.classList.add('show');
};

window._bsLeltarSelect = function(szam, megnevezes) {
    document.getElementById('bs-leltari-szam').value = szam;
    document.getElementById('bs-leltar-dropdown').classList.remove('show');
    // Ha leírás üres, kitöltjük
    var leirasEl = document.getElementById('bs-leiras');
    if (leirasEl && !leirasEl.value.trim()) leirasEl.value = megnevezes;
};

// ── Modal megnyitás ──
window.openBerletiSzerzodes = function(id) {
    var modal = document.getElementById('modal-berleti-szerzodes');
    if (!modal) return;

    // Mezők törlése
    document.getElementById('bs-edit-id').value = '';
    document.getElementById('bs-berlo-nev').value = '';
    document.getElementById('bs-id-szemely').value = '';
    document.getElementById('bs-targy').value = '';
    document.getElementById('bs-leiras').value = '';
    document.getElementById('bs-leltari-szam').value = '';
    document.getElementById('bs-telekkonyvi-szam').value = '';
    document.querySelector('input[name="bs-tipus"][value="terulet"]').checked = true;
    document.querySelector('input[name="bs-berlo-tipus"][value="szemely"]').checked = true;
    document.getElementById('bs-osszeg').value = '';
    document.getElementById('bs-ciklus').value = 'eves';
    document.getElementById('bs-kezdet').value = '';
    document.getElementById('bs-vege').value = '';
    document.getElementById('bs-megjegyzes').value = '';
    document.getElementById('bs-ceg-nev').value = '';
    document.getElementById('bs-ceg-adoszam').value = '';
    document.getElementById('btn-delete-szerzodes').classList.add('d-none');
    window._bsToggleBerloTipus();

    if (id) {
        var sz = _berletiSzerzodesek.find(function(s) { return s.id === id; });
        if (sz) {
            document.getElementById('bs-edit-id').value = sz.id;
            document.getElementById('bs-berlo-nev').value = sz.berlo_nev || '';
            document.getElementById('bs-id-szemely').value = sz.id_szemely || '';
            document.getElementById('bs-targy').value = sz.targy || '';
            document.getElementById('bs-leiras').value = sz.leiras || '';
            document.getElementById('bs-leltari-szam').value = sz.leltari_szam || '';
            document.getElementById('bs-telekkonyvi-szam').value = sz.telekkonyvi_szam || '';
            var tipusRadio = document.querySelector('input[name="bs-tipus"][value="' + (sz.tipus || 'terulet') + '"]');
            if (tipusRadio) tipusRadio.checked = true;
            document.getElementById('bs-osszeg').value = sz.osszeg || '';
            document.getElementById('bs-ciklus').value = sz.fizetesi_ciklus || 'eves';
            document.getElementById('bs-kezdet').value = sz.kezdet ? sz.kezdet.split('T')[0] : '';
            document.getElementById('bs-vege').value = sz.vege ? sz.vege.split('T')[0] : '';
            document.getElementById('bs-megjegyzes').value = sz.megjegyzes || '';
            document.getElementById('btn-delete-szerzodes').classList.remove('d-none');
            // Cég vagy személy
            if (sz.ceg_nev) {
                document.querySelector('input[name="bs-berlo-tipus"][value="ceg"]').checked = true;
                document.getElementById('bs-ceg-nev').value = sz.ceg_nev || '';
                document.getElementById('bs-ceg-adoszam').value = sz.ceg_adoszam || '';
            }
            window._bsToggleBerloTipus();
        }
    }

    var bsModal = new bootstrap.Modal(modal);
    bsModal.show();
};

window.saveBerletiSzerzodes = async function() {
    var berloTipus = (document.querySelector('input[name="bs-berlo-tipus"]:checked') || {}).value || 'szemely';
    var berloNev = '';
    var cegNev = null;
    var cegAdoszam = null;

    if (berloTipus === 'ceg') {
        cegNev = (document.getElementById('bs-ceg-nev').value || '').trim();
        cegAdoszam = (document.getElementById('bs-ceg-adoszam').value || '').trim() || null;
        berloNev = cegNev;
        if (!cegNev) { alert('A cégnevet meg kell adni!'); return; }
    } else {
        berloNev = (document.getElementById('bs-berlo-nev').value || '').trim();
        if (!berloNev) { alert('A bérlő nevét meg kell adni!'); return; }
    }

    var leiras   = (document.getElementById('bs-leiras').value || '').trim();
    var targy    = (document.getElementById('bs-targy').value || '').trim();
    var osszeg   = parseFloat(document.getElementById('bs-osszeg').value);
    var kezdet   = document.getElementById('bs-kezdet').value;

    if (!leiras)   { alert('A terület/épület leírását meg kell adni!'); return; }
    if (!osszeg || osszeg <= 0) { alert('Érvényes összeget kell megadni!'); return; }
    if (!kezdet)   { alert('A szerződés kezdetét meg kell adni!'); return; }

    var authRes = await _supabase.auth.getUser();
    var user = authRes.data.user;
    if (!user) { alert('Nincs bejelentkezett felhasználó!'); return; }

    var tipus = (document.querySelector('input[name="bs-tipus"]:checked') || {}).value || 'terulet';
    var szamadasicel = tipus === 'epulet' ? '104.04' : '104.05';

    var rec = {
        congregation_id: activeCongregationId,
        berlo_nev: berloNev,
        id_szemely: berloTipus === 'szemely' ? (parseInt(document.getElementById('bs-id-szemely').value) || null) : null,
        targy: targy || null,
        leiras: leiras,
        tipus: tipus,
        osszeg: osszeg,
        fizetesi_ciklus: document.getElementById('bs-ciklus').value || 'eves',
        kezdet: kezdet,
        vege: document.getElementById('bs-vege').value || null,
        id_szamadasicel: szamadasicel,
        leltari_szam: (document.getElementById('bs-leltari-szam').value || '').trim() || null,
        telekkonyvi_szam: (document.getElementById('bs-telekkonyvi-szam').value || '').trim() || null,
        ceg_nev: cegNev,
        ceg_adoszam: cegAdoszam,
        megjegyzes: (document.getElementById('bs-megjegyzes').value || '').trim() || null,
        userid: user.id
    };

    var editId = document.getElementById('bs-edit-id').value;
    var result;

    if (editId) {
        result = await _supabase.from('berleti_szerzodes').update(rec).eq('id', editId);
    } else {
        result = await _supabase.from('berleti_szerzodes').insert(rec);
    }

    if (result.error) {
        alert('Mentési hiba: ' + result.error.message);
        return;
    }

    var modalInst = bootstrap.Modal.getInstance(document.getElementById('modal-berleti-szerzodes'));
    if (modalInst) modalInst.hide();

    window.loadTartozasok();
};

window.deleteBerletiSzerzodes = async function() {
    var editId = document.getElementById('bs-edit-id').value;
    if (!editId) return;

    if (!confirm('Biztosan deaktiválja ezt a szerződést?')) return;

    var result = await _supabase.from('berleti_szerzodes')
        .update({ aktiv: false, deleted: true })
        .eq('id', editId);

    if (result.error) {
        alert('Hiba: ' + result.error.message);
        return;
    }

    var modalInst = bootstrap.Modal.getInstance(document.getElementById('modal-berleti-szerzodes'));
    if (modalInst) modalInst.hide();

    window.loadTartozasok();
};
