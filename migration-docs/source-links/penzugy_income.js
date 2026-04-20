// --- js/penzugy_income.js (Cím-Szótárral okosított verzió) ---

window.currentIncomeRows = [];
window.currentHouseholdMembers = [];
window.selectedIncomePerson = null;

// 🚨 ÚJ: Intelligens Cím-Szótár (Háttérben letölti az utcaneveket az ID-khoz)
window.streetCache = {};
window.localityCache = {};

window.preloadAddressDictionary = async function() {
    try {
        var { data: utcak } = await _supabase.from('adrstreet').select('id, name');
        if (utcak) utcak.forEach(u => window.streetCache[u.id] = u.name);

        var { data: helysegek } = await _supabase.from('adrlocality').select('id, name');
        if (helysegek) helysegek.forEach(h => window.localityCache[h.id] = h.name);
    } catch (err) {
        console.warn("Címszótár betöltése sikertelen:", err);
    }
};
// Indításkor azonnal letölti a szótárat a memóriába
setTimeout(() => window.preloadAddressDictionary(), 1000);


// 1. Kereső modul
window.searchMembers = function(query) {
    document.getElementById('b-id_szemely').value = ""; 
    window.selectedIncomePerson = null;
    window.currentHouseholdMembers = [];
    document.getElementById('family-info-badge').classList.add('d-none');
    
    var resultsContainer = document.getElementById('search-results');
    var qRaw = query.trim();
    
    if (qRaw.length < 2) {
        resultsContainer.classList.add('d-none');
        window.renderIncomeRows(); 
        return;
    }

    if (!window.allChurchMembers || window.allChurchMembers.length === 0) {
        resultsContainer.innerHTML = `<div class="list-group-item text-danger bg-light"><i class="ti ti-alert-triangle me-2"></i>A tagok listája még nem töltött be! Kérem, várjon pár másodpercet.</div>`;
        resultsContainer.classList.remove('d-none');
        return;
    }

    var normalizeStr = (str) => {
        if (!str) return "";
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    };
    
    var qNorm = normalizeStr(qRaw); 

    var activeMembers = window.allChurchMembers.filter(m => m.isvisible !== false && m.meghalt !== true);
    
    var matches = activeMembers.filter(m => {
        var name1 = normalizeStr(`${m.csaladnev || ''} ${m.k_nev || ''}`);
        var name2 = normalizeStr(`${m.k_nev || ''} ${m.csaladnev || ''}`); 
        return name1.includes(qNorm) || name2.includes(qNorm);
    });

    // Cégek keresése a mentett cégek között
    var companyMatches = (window._savedCompanies || []).filter(c => {
        return normalizeStr(c.nev).includes(qNorm) || (c.adoszam && normalizeStr(c.adoszam).includes(qNorm));
    });

    if (matches.length === 0 && companyMatches.length === 0) {
        resultsContainer.innerHTML = `<div class="list-group-item text-danger bg-white fw-bold border-bottom"><i class="ti ti-user-off me-2"></i>Nincs találat az egyháztagok és cégek között. (Külsős befizető)</div>`;
    } else {
        var html = '';
        // Cégek először
        html += companyMatches.map(c => {
            var info = c.adoszam ? `Adószám: ${c.adoszam}` : 'Cég / Szervezet';
            return `<button type="button" class="list-group-item list-group-item-action py-2 bg-white border-bottom" onclick="document.getElementById('b-forrasa-input').value='${c.nev.replace(/'/g, "\\'")}';document.getElementById('b-id_szemely').value='';document.getElementById('search-results').classList.add('d-none');">
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="fw-bold text-orange" style="font-size: 1.1em;"><i class="ti ti-building me-1"></i>${c.nev}</span>
                            <span class="badge bg-orange-lt text-orange">Cég</span>
                        </div>
                        <div class="small text-muted mt-1">${info}</div>
                    </button>`;
        }).join('');
        // Személyek
        html += matches.map(m => {
            var ageStr = "?";
            if (m.sz_datum) {
                var birthYear = new Date(m.sz_datum).getFullYear();
                var currY = new Date().getFullYear();
                if (birthYear > 1900) ageStr = (currY - birthYear) + " éves";
            }

            var utcaNeve = "";
            if (m.adrstreet && m.adrstreet.name) utcaNeve = m.adrstreet.name;
            else if (m.c_utcaid) utcaNeve = window.streetCache[m.c_utcaid] || `Utca kód: ${m.c_utcaid}`;

            var helysegNeve = "";
            if (m.adrlocality && m.adrlocality.name) helysegNeve = m.adrlocality.name;
            else if (m.c_helysegid) helysegNeve = window.localityCache[m.c_helysegid] || "";

            var cimTomb = [];
            if (helysegNeve) cimTomb.push(helysegNeve);
            if (utcaNeve) cimTomb.push(utcaNeve);
            if (m.c_szam) cimTomb.push(m.c_szam);

            var cim = cimTomb.length > 0 ? cimTomb.join(', ') : 'Nincs pontos cím rögzítve';

            return `<button type="button" class="list-group-item list-group-item-action py-2 bg-white border-bottom" onclick="window.selectMemberForIncome(${m.id})">
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="fw-bold text-primary" style="font-size: 1.1em;">${m.csaladnev} ${m.k_nev}</span>
                            <span class="badge bg-secondary text-white">${ageStr}</span>
                        </div>
                        <div class="small text-dark mt-1"><i class="ti ti-home me-1 text-muted"></i>${cim}</div>
                    </button>`;
        }).join('');
        resultsContainer.innerHTML = html;
    }
    resultsContainer.classList.remove('d-none');
};

window.selectMemberForIncome = function(id) {
    var person = window.allChurchMembers.find(m => m.id === id);
    if (!person) return;

    window.selectedIncomePerson = person;
    document.getElementById('b-id_szemely').value = person.id;
    document.getElementById('b-forrasa-input').value = `${person.csaladnev} ${person.k_nev}`;
    document.getElementById('search-results').classList.add('d-none');

    window.currentHouseholdMembers = window.allChurchMembers.filter(m => {
        if (m.isvisible === false || m.meghalt === true) return false;
        if (person.family_id && m.family_id === person.family_id) return true;
        if (person.c_utcaid && person.c_szam && m.c_utcaid === person.c_utcaid && m.c_szam === person.c_szam) return true;
        return m.id === person.id; 
    });

    var badge = document.getElementById('family-info-badge');
    var badgeText = document.getElementById('family-info-text');
    badge.classList.remove('d-none');
    
    if (window.currentHouseholdMembers.length > 1) {
        badgeText.innerText = `A nyilvántartás szerint a családhoz összesen ${window.currentHouseholdMembers.length} aktív tag tartozik.`;
    } else {
        badgeText.innerText = `A nyilvántartás alapján egyedülálló személy.`;
    }

    window.currentIncomeRows = [{
        id: Date.now(),
        year: new Date().getFullYear(),
        amount: window.evesJarulek || 0,
        memberId: person.id
    }];
    
    window.renderIncomeRows();
};

window.renderIncomeRows = function() {
    var container = document.getElementById('dynamic-income-rows');
    if (!container) return; 
    
    var html = '';
    var total = 0;

    var safeYear = new Date().getFullYear();
    if (!window.currentIncomeRows || window.currentIncomeRows.length === 0) {
        window.currentIncomeRows = [{ id: Date.now(), year: safeYear, amount: 0, memberId: null }];
    }

    window.currentIncomeRows.forEach((row, index) => {
        total += Number(row.amount) || 0;
        
        var memberOptions = '';
        if (window.currentHouseholdMembers.length > 0) {
            memberOptions = window.currentHouseholdMembers.map(m => 
                `<option value="${m.id}" ${m.id == row.memberId ? 'selected' : ''}>${m.csaladnev} ${m.k_nev}</option>`
            ).join('');
        } else {
            memberOptions = `<option value="">Külsős befizető / Szervezet</option>`;
        }

        html += `
        <div class="d-flex gap-2 align-items-center bg-white p-2 border rounded shadow-sm">
            <div style="width: 105px;">
                <label class="form-label small fw-bold text-primary mb-1" title="Melyik évi egyházfenntartói járulékot fizeti be? (Nem a fizetés éve, hanem amelyikre vonatkozik!)">
                    <i class="ti ti-calendar-due me-1"></i>Melyik évre?
                </label>
                <input type="number" class="form-control form-control-sm fw-bold text-center border-primary" value="${row.year}" min="2000" max="2099" onchange="window.updateIncomeRow(${index}, 'year', this.value)" title="Melyik évi járulékot fizeti (pl. 2024, ha az előző évet fizeti ki most)">
            </div>
            <div style="flex-grow: 1;">
                <label class="form-label small text-muted mb-1">Kire vonatkozik?</label>
                <select class="form-select form-select-sm" onchange="window.updateIncomeRow(${index}, 'memberId', this.value)">
                    ${memberOptions}
                </select>
            </div>
            <div style="width: 110px;">
                <label class="form-label small text-muted mb-1">Összeg</label>
                <input type="number" step="0.01" class="form-control form-control-sm text-end fw-bold text-success border-success" value="${row.amount}" onchange="window.updateIncomeRow(${index}, 'amount', this.value)">
            </div>
            <div style="width: 35px; padding-top: 22px;">
                ${window.currentIncomeRows.length > 1 ? `<button type="button" class="btn btn-sm btn-icon btn-outline-danger" onclick="window.removeIncomeRow(${index})" title="Tétel törlése"><i class="ti ti-trash"></i></button>` : ''}
            </div>
        </div>`;
    });

    container.innerHTML = html;
    
    var totalEl = document.getElementById('b-total-sum');
    if (totalEl) totalEl.innerText = total.toFixed(2);
};
// ==========================================
// INTELLIGENS SOR- ÉS DÁTUMKEZELŐ RENDSZER
// ==========================================

// 🚨 ÚJ FUNKCIÓ: Utolsó nyugtaszám és dátum automatikus kikeresése
window.loadLastReceiptData = async function() {
    try {
        var currYear = new Date().getFullYear().toString();
        var { data, error } = await _supabase.from('befizetes')
            .select('datum, iratszam')
            .eq('congregation_id', activeCongregationId)
            .eq('deleted', false)
            .ilike('irattipus', '%észpénz%')
            .is('belso_mozgas_xkey', null)
            .gte('datum', `${currYear}-01-01`)
            .lte('datum', `${currYear}-12-31`);

        var dInput = document.getElementById('b-datum');
        var iInput = document.getElementById('b-iratszam');
        var nyInput = document.getElementById('b-nyugta');
        var potlasChk = document.getElementById('b-is-potlas');
        
        // Ha pótlás van bekapcsolva, ne írjuk felül az üres mezőket automatikusan
        if (potlasChk && potlasChk.checked) return;

        if (data && data.length > 0) {
            var maxNum = 0;
            var lastDate = '';
            data.forEach(r => {
                var numMatch = String(r.iratszam).match(/(\d+)/);
                if (numMatch) {
                    var n = parseInt(numMatch[1], 10);
                    if (n > maxNum) {
                        maxNum = n;
                        lastDate = r.datum;
                    }
                }
            });

            if (maxNum > 0) {
                iInput.value = maxNum + 1;
                nyInput.value = maxNum + 1;
                if (lastDate) dInput.value = lastDate;
                return;
            }
        }
        
        // Ha nincs idei nyugta (Év első nyugtája)
        iInput.value = '';
        nyInput.value = '';
        dInput.value = '';
    } catch (e) { console.error("Hiba az utolsó nyugta keresésekor", e); }
};

// Bekötjük a Nyugtafigyelőt az ablak megnyitásához
document.addEventListener('show.bs.modal', function (e) {
    if (e.target.id === 'modal-befizetes') window.loadLastReceiptData();
});

window.addIncomeRow = function() {
    if (!window.currentIncomeRows) window.currentIncomeRows = [];
    var safeYear = new Date().getFullYear(); // 🚨 JAVÍTÁS: Mindig az aktuális év az alap!
    var lastRow = window.currentIncomeRows.length > 0 ? window.currentIncomeRows[window.currentIncomeRows.length - 1] : null;
    
    var nextMember = window.selectedIncomePerson?.id || null;
    if (lastRow) nextMember = lastRow.memberId;

    window.currentIncomeRows.push({
        id: Date.now() + Math.random(),
        year: safeYear, 
        amount: window.evesJarulek || 0,
        memberId: nextMember
    });
    
    window.renderIncomeRows();
};

window.removeIncomeRow = function(index) {
    window.currentIncomeRows.splice(index, 1);
    window.renderIncomeRows();
};

window.updateIncomeRow = function(index, field, value) {
    window.currentIncomeRows[index][field] = value;
    
    // 🚨 ÚJ FUNKCIÓ: Automatikus megjegyzés generálás eltérő év esetén
    if (field === 'year') {
        var currY = new Date().getFullYear();
        if (parseInt(value) !== currY) {
            var celSelect = document.getElementById('b-id_befizetescel');
            // Kivesszük a cél nevét a legördülőből (pl. "101.01 - Egyházfenntartás" -> "Egyházfenntartás")
            var rawText = celSelect.options[celSelect.selectedIndex]?.text || '';
            var celText = rawText.includes('-') ? rawText.split('-')[1].trim() : rawText;
            
            var megjegyzesEl = document.getElementById('b-megjegyzes');
            var newText = `${celText} ${value}-re`;
            
            // Csak akkor fűzzük hozzá, ha még nincs benne
            if (!megjegyzesEl.value.includes(newText)) {
                megjegyzesEl.value = megjegyzesEl.value ? megjegyzesEl.value + ', ' + newText : newText;
            }
        }
    }
    
    if (field === 'amount') window.renderIncomeRows();
};

// FIX: Golyóálló mentési motor javított járulék-validációval
window.saveBefizetes = async function(e) {
    e.preventDefault();

    var celId = document.getElementById('b-id_befizetescel').value;
    if (!celId) {
        alert('Kérjük válasszon Befizetési Célt!');
        document.getElementById('b-id_befizetescel').focus();
        return;
    }

    var szemelyId = document.getElementById('b-id_szemely').value;
    var isKulsos = !szemelyId;

    // FIX: a celId a befizetescel INTEGER id-ja → bevCelMap-on keresztül kell lekérni a szamadasicel kódot
    var celKod = window.bevCelMap ? window.bevCelMap[celId] : null;
    var celAdat = celKod ? window.szamadasiCellek?.find(c => c.id === celKod) : null;
    var isJarulek = celKod && (
        celKod === '101.01' ||
        celKod.startsWith('101.01') ||
        (celAdat?.nev || '').toLowerCase().includes('fenntart') ||
        (celAdat?.nev || '').toLowerCase().includes('járulék')
    );

    if (isKulsos && isJarulek) {
        // Egyházfenntartói járuléknál KÖTELEZŐ az egyháztag kiválasztása
        var forrasInput = document.getElementById('b-forrasa-input');
        var nev = forrasInput?.value?.trim() || '';
        var confirm_external = nev
            ? confirm(
                `⛔ FIGYELEM!\n\n"${nev}" nincs kiválasztva az egyháztag-nyilvántartásból.\n\n` +
                `Egyházfenntartói járulékot csak nyilvántartott egyháztag fizethet, ` +
                `mert csak ekkor követhető nyilván a fizetési státusz!\n\n` +
                `Kérjük, keresse meg a tagot a listában, vagy rögzítse a tagnyilvántartóban.\n\n` +
                `Folytatja KÜLSŐS BEFIZETŐKÉNT? (Figyelem: a tagnyilvántartásban NEM fog megjelenni fizettként!)`
            )
            : false;

        if (!confirm_external) {
            document.getElementById('b-forrasa-input')?.focus();
            return;
        }
        // Ha mégis folytatja, figyelmeztető badge jelenik meg
    }

    var btn = e.submitter;
    var origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Ellenőrzés...';
    btn.disabled = true;

    try {
        var { data: { user } } = await _supabase.auth.getUser();

        var datum = document.getElementById('b-datum').value;
        var today = new Date().toISOString().split('T')[0];
        if (datum > today) {
            alert('⛔ Jövőbeli dátumot nem lehet rögzíteni!\n\nA dátum nem lehet nagyobb mint a mai nap (' + today + ').\nHa előre tervez, rögzítse a tranzakciót az esedékes napon.');
            btn.innerHTML = origText;
            btn.disabled = false;
            return;
        }
        var irattipus = document.getElementById('b-irattipus').value;
        var nyugta = document.getElementById('b-nyugta').value;
        var iratszam = document.getElementById('b-iratszam').value.trim();
        var megjegyzes = document.getElementById('b-megjegyzes').value;
        var alapForras = document.getElementById('b-forrasa-input').value;
        var potlasChk = document.getElementById('b-is-potlas');
        var isPotlas = potlasChk ? potlasChk.checked : false;

        // ─── DUPLIKÁCIÓ-ELLENŐRZÉS iratszám alapján ──────────────────────────
        // Ha van iratszám, megnézzük hogy ez a bizonylat már be van-e rögzítve.
        // Pótlás módban NEM ellenőrzünk (szándékosan javítunk egy meglévőt).
        if (iratszam && !isPotlas) {
            var { data: existing } = await _supabase.from('befizetes')
                .select('id, datum, fizetettev, forrasa')
                .eq('congregation_id', activeCongregationId)
                .eq('iratszam', iratszam)
                .eq('deleted', false)
                .limit(5);

            if (existing && existing.length > 0) {
                var info = existing.map(r =>
                    `• #${r.id} | ${r.datum} | ${r.fizetettev ? r.fizetettev + '. évi' : ''} | ${r.forrasa || '–'}`
                ).join('\n');
                var cont = confirm(
                    `⚠️ DUPLIKÁCIÓ VESZÉLY!\n\n` +
                    `A(z) "${iratszam}" iratszámú bizonylat már szerepel az adatbázisban:\n\n` +
                    info +
                    `\n\nHa ezt most ismét menti, kettős könyvelés keletkezik!\n\n` +
                    `✅ OK → Folytatja (szándékos pótlást végez)\n` +
                    `❌ Mégse → Visszalép ellenőrizni`
                );
                if (!cont) {
                    btn.innerHTML = origText;
                    btn.disabled = false;
                    return;
                }
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Mentés...';

        // 🚨 JAVÍTÁS: Itt adunk hozzá az xkey-hez egy 'index'-et, így lehetetlen a duplikáció!
        var recordsToInsert = window.currentIncomeRows.map((row, idx) => {
            var memberObj = window.currentHouseholdMembers.find(m => m.id == row.memberId);
            var forrasNev = memberObj ? `${memberObj.csaladnev} ${memberObj.k_nev}` : alapForras;

            return {
                xkey: 'B-' + Date.now().toString(36).toUpperCase() + '-' + idx + '-' + Math.random().toString(36).substring(2, 6),
                congregation_id: activeCongregationId,
                id_befizetescel: celId,
                datum: datum,
                irattipus: irattipus, 
                nyugta: nyugta,       
                iratszam: iratszam,   
                megjegyzes: megjegyzes,
                fizetettev: row.year,
                osszeg: parseFloat(row.amount) || 0,
                id_szemely: row.memberId || null,
                forrasa: forrasNev,
                csalad: false,
                deleted: false,
                is_potlas: isPotlas,
                userid: user.id
            };
        });

        var finalRecords = recordsToInsert.filter(r => r.osszeg > 0);
        if (finalRecords.length === 0) throw new Error("Nem adott meg érvényes összeget!");

        var { error } = await _supabase.from('befizetes').insert(finalRecords);
        if (error) throw error;
        
        bootstrap.Modal.getInstance(document.getElementById('modal-befizetes')).hide();
        document.getElementById('form-befizetes').reset();
        
        if (potlasChk) potlasChk.checked = false;
        window.searchMembers(''); 
        
        if (typeof window.loadTranzakciok === 'function') await window.loadTranzakciok();
        if (typeof window.loadKasszaTransactions === 'function') await window.loadKasszaTransactions();
        if (typeof window.loadBankTransactions === 'function') await window.loadBankTransactions();

    } catch (err) {
        alert("Hiba a mentés során: " + err.message);
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
    }
};


// ============================================================================
// TÁBLÁZATOS GYORS BEVITELI MÓD
// ============================================================================

var _batchIsBatchMode   = false;
var _batchRowCounter    = 0;
var _batchActiveRowId   = null;    // melyik sor dropdownja nyitott
var _batchActiveDdType  = null;    // 'cel' | 'szem'
var _batchLastKeyWasDel = false;   // inline autocomplete flag
var _batchDdFocusIdx    = -1;      // billentyű-navigáció indexe

// Reset függvény — modal bezáráskor hívjuk
window._resetBatchRowCounter = function() { _batchRowCounter = 0; };

// ── Lebegő legördülő (position:fixed – nem vágja le az overflow:auto) ────────
function _batchGetFloatDd() {
    var dd = document.getElementById('batch-float-dd');
    if (!dd) {
        dd = document.createElement('div');
        dd.id = 'batch-float-dd';
        dd.className = 'list-group shadow-lg';
        dd.style.cssText = 'position:fixed;z-index:99999;display:none;max-height:240px;overflow-y:auto;background:#fff;border:1px solid #dee2e6;border-radius:4px;';
        dd.addEventListener('mousedown', e => e.preventDefault()); // ne triggeralja a blur-t
        document.body.appendChild(dd);
    }
    return dd;
}

function _batchShowDdAt(inputEl, html) {
    var dd   = _batchGetFloatDd();
    var rect = inputEl.getBoundingClientRect();
    dd.innerHTML   = html;
    dd.style.left  = rect.left + 'px';
    dd.style.top   = (rect.bottom + 2) + 'px';
    dd.style.width = Math.max(rect.width, 240) + 'px';
    dd.style.display = 'block';
    _batchDdFocusIdx = -1;
}

function _batchHideDd() {
    var dd = document.getElementById('batch-float-dd');
    if (dd) dd.style.display = 'none';
    _batchActiveRowId  = null;
    _batchActiveDdType = null;
    _batchDdFocusIdx   = -1;
}

function _batchDdMoveFocus(dir) {
    var dd = document.getElementById('batch-float-dd');
    if (!dd || dd.style.display === 'none') return false;
    var btns = dd.querySelectorAll('button');
    if (!btns.length) return false;
    _batchDdFocusIdx = Math.max(0, Math.min(_batchDdFocusIdx + dir, btns.length - 1));
    btns.forEach((b, i) => b.classList.toggle('active', i === _batchDdFocusIdx));
    btns[_batchDdFocusIdx].scrollIntoView({ block: 'nearest' });
    return true;
}

// ── Módváltó ──────────────────────────────────────────────────────────────────
window.toggleBatchMode = function() {
    _batchIsBatchMode = !_batchIsBatchMode;
    var singleView = document.getElementById('single-income-view');
    var batchView  = document.getElementById('batch-income-view');
    var dialog     = document.getElementById('modal-befizetes-dialog');
    var title      = document.getElementById('befizetes-modal-title');
    var toggleBtn  = document.getElementById('btn-toggle-batch-mode');

    if (_batchIsBatchMode) {
        singleView.classList.add('d-none');
        batchView.classList.remove('d-none');
        dialog.classList.remove('modal-lg');
        dialog.classList.add('modal-xl');
        title.innerHTML    = '<i class="ti ti-table me-2"></i>Tömeges Bevitel — Táblázatos Mód';
        toggleBtn.innerHTML = '<i class="ti ti-forms me-1"></i>Egyedi mód';
        var today = new Date().toISOString().split('T')[0];
        document.getElementById('batch-default-datum').value = today;
        if (document.getElementById('batch-income-tbody').children.length === 0) {
            window.addBatchRow();
            window.addBatchRow();
            window.addBatchRow();
        }
    } else {
        singleView.classList.remove('d-none');
        batchView.classList.add('d-none');
        dialog.classList.remove('modal-xl');
        dialog.classList.add('modal-lg');
        title.innerHTML    = '<i class="ti ti-arrow-down-circle me-2"></i>Új Bevétel Rögzítése';
        toggleBtn.innerHTML = '<i class="ti ti-table me-1"></i>Táblázatos mód';
    }
};

// Modal bezárásakor visszaállítunk
document.addEventListener('DOMContentLoaded', function() {
    var modalEl = document.getElementById('modal-befizetes');
    if (!modalEl) return;
    modalEl.addEventListener('hidden.bs.modal', function() {
        _batchHideDd();
        if (_batchIsBatchMode) window.toggleBatchMode();
        var tbody = document.getElementById('batch-income-tbody');
        if (tbody) tbody.innerHTML = '';
        _batchRowCounter = 0;
        window._batchUpdateSummary();
    });
});

// ── Jogcím opciók lekérése (csak megnevezés, kód nélkül) ──────────────────────
function _batchGetCelOptions() {
    var sel = document.getElementById('b-id_befizetescel');
    if (!sel) return [];
    return Array.from(sel.options)
        .filter(o => o.value && (o.text.includes(' - ') || o.value.startsWith('_BM:')))
        .map(o => {
            if (o.value.startsWith('_BM:')) {
                return { id: o.value, name: o.text.trim() };
            }
            return { id: o.value, name: o.text.split(' - ').slice(1).join(' - ').trim() };
        });
}

// ── Év-badge frissítése ───────────────────────────────────────────────────────
window._batchUpdateEvBadge = function(rowId) {
    var evEl    = document.getElementById('bev-' + rowId);
    var badgeEl = document.getElementById('bev-badge-' + rowId);
    if (!evEl || !badgeEl) return;
    var ev      = parseInt(evEl.value);
    var curYear = new Date().getFullYear();
    var countEl = document.getElementById('bevcount-' + rowId);
    var count = parseInt((countEl || {}).value) || 1;
    // Badge: évi tájékoztató
    var badgeHtml = '';
    if (count > 1) {
        var endEv = ev + count - 1;
        badgeHtml = '<span class="badge bg-warning text-dark">' + ev + '-' + endEv + ' évre</span>';
    } else if (ev && ev !== curYear) {
        badgeHtml = '<span class="badge bg-warning text-dark">' + ev + '-évre</span>';
    }
    // Link megtartása
    var linkEl = badgeEl.querySelector('a');
    var linkText = linkEl ? linkEl.textContent : 'Több évre...';
    badgeEl.innerHTML = badgeHtml +
        '<a href="#" class="small text-primary" style="font-size:.72em;" onclick="event.preventDefault();window._batchToggleMultiYear(' + rowId + ')">' + linkText + '</a>';
};

// ── Többéves kezelés — al-sorok évenként ─────────────────────────────────────
window._batchToggleMultiYear = function(rowId) {
    var badgeEl = document.getElementById('bev-badge-' + rowId);
    var countEl = document.getElementById('bevcount-' + rowId);
    var evEl = document.getElementById('bev-' + rowId);
    var endEvEl = document.getElementById('bev-endev-' + rowId);
    var sepEl = document.getElementById('bev-sep-' + rowId);
    if (!badgeEl || !countEl || !evEl || !endEvEl || !sepEl) return;

    var startEv = parseInt(evEl.value) || new Date().getFullYear();
    var isVisible = !endEvEl.classList.contains('d-none');

    if (isVisible) {
        // Toggle off: elrejtés
        endEvEl.classList.add('d-none');
        sepEl.classList.add('d-none');
        endEvEl.value = '';
        countEl.value = 1;
        var link = badgeEl.querySelector('a');
        if (link) link.textContent = 'Több évre...';
        window._batchRenderSubYears(rowId);
    } else {
        // Toggle on: megjelenítés
        endEvEl.classList.remove('d-none');
        sepEl.classList.remove('d-none');
        endEvEl.value = startEv + 1;
        endEvEl.min = startEv + 1;
        countEl.value = 2;
        var link = badgeEl.querySelector('a');
        if (link) link.textContent = 'Egy évre';
        window._batchRenderSubYears(rowId);
        endEvEl.focus();
    }
};

window._batchSyncEndYear = function(rowId) {
    var evEl = document.getElementById('bev-' + rowId);
    var endEvEl = document.getElementById('bev-endev-' + rowId);
    if (!evEl || !endEvEl || endEvEl.classList.contains('d-none')) return;
    var startEv = parseInt(evEl.value) || new Date().getFullYear();
    var countEl = document.getElementById('bevcount-' + rowId);
    var count = parseInt((countEl || {}).value) || 1;
    if (count > 1) {
        endEvEl.value = startEv + count - 1;
        endEvEl.min = startEv + 1;
    }
    window._batchRenderSubYears(rowId);
};

window._batchUpdateEndYear = function(rowId) {
    var evEl = document.getElementById('bev-' + rowId);
    var endEvEl = document.getElementById('bev-endev-' + rowId);
    var countEl = document.getElementById('bevcount-' + rowId);
    if (!evEl || !endEvEl || !countEl) return;
    var startEv = parseInt(evEl.value) || new Date().getFullYear();
    var endEv = parseInt(endEvEl.value) || startEv;
    if (endEv < startEv) { endEvEl.value = startEv; endEv = startEv; }
    if (endEv - startEv > 9) { endEvEl.value = startEv + 9; endEv = startEv + 9; }
    countEl.value = endEv - startEv + 1;
    window._batchRenderSubYears(rowId);
};

// ── Al-sorok renderelése évenként az Év+Összeg cellán belül ──
window._batchRenderSubYears = function(rowId) {
    var countEl = document.getElementById('bevcount-' + rowId);
    var evEl = document.getElementById('bev-' + rowId);
    var subCont = document.getElementById('bsub-cont-' + rowId);
    var osszegEl = document.getElementById('bosszeg-' + rowId);
    if (!countEl || !evEl || !subCont || !osszegEl) return;

    var count = parseInt(countEl.value) || 1;
    if (count < 1) { countEl.value = 1; count = 1; }
    if (count > 10) { countEl.value = 10; count = 10; }
    var startEv = parseInt(evEl.value) || new Date().getFullYear();

    if (count <= 1) {
        // Egy évre — al-sorok eltávolítása, fő mező szerkeszthető
        subCont.innerHTML = '';
        osszegEl.readOnly = false;
        osszegEl.style.opacity = '';
        osszegEl.style.fontStyle = '';
        // Auto-megjegyzés törlése
        var megjEl = document.getElementById('bmegjeg-' + rowId);
        if (megjEl && megjEl.value.match(/^\d{4}-\d{4} évre/)) megjEl.value = '';
        return;
    }

    // Több évre — al-sorok megjelenítése, fő mező readonly (összeg)
    osszegEl.readOnly = true;
    osszegEl.style.opacity = '0.7';
    osszegEl.style.fontStyle = 'italic';

    var html = '<div class="border-top mt-1 pt-1" style="font-size:0.82rem;">';
    var total = 0;
    var perYear = window._jarulekPerYear || {};
    var defaultJ = window.evesJarulek || 0;

    for (var y = 0; y < count; y++) {
        var ev = startEv + y;
        var evJarulek = perYear[String(ev)] || defaultJ;
        // Meglévő al-sor értéke megmarad ha van
        var existingInput = document.getElementById('bsub-' + rowId + '-' + ev);
        var val = existingInput ? parseFloat(existingInput.value) || 0 : evJarulek;
        total += val;
        html += '<div class="d-flex align-items-center gap-1 mb-1">'
            + '<span class="badge bg-light text-dark border" style="min-width:38px;font-size:.75em;">' + ev + '</span>'
            + '<input type="number" id="bsub-' + rowId + '-' + ev + '" class="form-control form-control-sm text-end text-success py-0" step="0.01" min="0" value="' + val.toFixed(2) + '" style="width:72px;height:24px;font-size:.82em;" '
            + 'onchange="window._batchSubYearChange(' + rowId + ')" '
            + 'oninput="window._batchSubYearChange(' + rowId + ')">'
            + '</div>';
    }
    html += '</div>';
    subCont.innerHTML = html;
    osszegEl.value = total.toFixed(2);
    window._batchUpdateEvBadge(rowId);
    window._batchUpdateSummary();

    // Megjegyzés automatikus kitöltése az évtartománnyal
    var megjEl = document.getElementById('bmegjeg-' + rowId);
    if (megjEl) {
        var endEv = startEv + count - 1;
        var evInfo = startEv + '-' + endEv + ' évre (' + count + ' év)';
        // Csak akkor töltjük ki ha üres vagy már automatikusan volt kitöltve
        if (!megjEl.value || megjEl.value.match(/^\d{4}-\d{4} évre/)) {
            megjEl.value = evInfo;
        }
    }
};

// ── Al-sor összeg változás → fő összeg frissítés ──
window._batchSubYearChange = function(rowId) {
    var countEl = document.getElementById('bevcount-' + rowId);
    var evEl = document.getElementById('bev-' + rowId);
    var osszegEl = document.getElementById('bosszeg-' + rowId);
    if (!countEl || !evEl || !osszegEl) return;

    var count = parseInt(countEl.value) || 1;
    var startEv = parseInt(evEl.value) || new Date().getFullYear();
    var total = 0;
    for (var y = 0; y < count; y++) {
        var inp = document.getElementById('bsub-' + rowId + '-' + (startEv + y));
        total += inp ? (parseFloat(inp.value) || 0) : 0;
    }
    osszegEl.value = total.toFixed(2);
    window._batchUpdateSummary();
};

// ── Egy sor HTML-je ───────────────────────────────────────────────────────────
function _batchRowHtml(rowNum) {
    var id = ++_batchRowCounter;
    var tbody = document.getElementById('batch-income-tbody');
    var prevCelText = '', prevCelId = '', prevEv = new Date().getFullYear();
    var prevDatum = '';
    if (tbody && tbody.lastElementChild) {
        var lastId = tbody.lastElementChild.dataset.rowId;
        if (lastId) {
            prevCelText = (document.getElementById('bcel-text-' + lastId) || {}).value || '';
            prevCelId   = (document.getElementById('bcel-id-' + lastId) || {}).value   || '';
            prevEv      = parseInt((document.getElementById('bev-' + lastId) || {}).value) || prevEv;
            prevDatum   = (document.getElementById('bdatum-' + lastId) || {}).value || '';
        }
    }
    if (!prevDatum) {
        prevDatum = new Date().toISOString().split('T')[0];
    }
    var curYear   = new Date().getFullYear();
    var initBadge = (prevEv && prevEv !== curYear)
        ? '<span class="badge bg-warning text-dark">' + prevEv + '-évre</span>'
        : '';
    return '\
    <tr id="batch-tr-' + id + '" data-row-id="' + id + '">\
        <td class="text-center text-muted small align-middle fw-bold">' + rowNum + '</td>\
        <td class="p-1">\
            <input type="date" id="bdatum-' + id + '"\
                   class="form-control form-control-sm"\
                   value="' + prevDatum + '"\
                   onchange="window._batchCheckRowDate(' + id + ',\'bev\')"\
                   onkeydown="window._batchFieldKeydown(event,\'bcel-text-' + id + '\')">\
            <div id="bdatum-badge-' + id + '" class="mt-1"></div>\
        </td>\
        <td class="p-1">\
            <input type="text" id="bcel-text-' + id + '"\
                   class="form-control form-control-sm"\
                   placeholder="Pl. Egyházfenntartói..."\
                   value="' + prevCelText.replace(/"/g, '&quot;') + '"\
                   autocomplete="off"\
                   onkeydown="window._batchCelKeydown(event,' + id + ')"\
                   oninput="window._batchCelInput(this,' + id + ')"\
                   onfocus="window._batchCelFocus(this,' + id + ')"\
                   onblur="setTimeout(function(){if(_batchActiveDdType===\'cel\'&&_batchActiveRowId===' + id + ')_batchHideDd();},200)">\
            <input type="hidden" id="bcel-id-' + id + '" value="' + prevCelId + '">\
        </td>\
        <td class="p-1">\
            <input type="text" id="bszem-text-' + id + '"\
                   class="form-control form-control-sm"\
                   placeholder="Személy neve..."\
                   autocomplete="off"\
                   onkeydown="window._batchSzemKeydown(event,' + id + ')"\
                   oninput="window._batchSzemInput(this,' + id + ')"\
                   onfocus="_batchActiveRowId=' + id + ';_batchActiveDdType=\'szem\';"\
                   onblur="setTimeout(function(){if(_batchActiveDdType===\'szem\'&&_batchActiveRowId===' + id + ')_batchHideDd();},200)">\
            <input type="hidden" id="bszem-id-' + id + '" value="">\
        </td>\
        <td class="p-1 text-center" style="min-width:80px;">\
            <div class="d-flex align-items-center justify-content-center gap-1">\
                <input type="number" id="bev-' + id + '"\
                       class="form-control form-control-sm text-center fw-bold border-primary"\
                       value="' + prevEv + '" min="2000" max="2099" style="width:68px;"\
                       onchange="window._batchUpdateEvBadge(' + id + ');window._batchSyncEndYear(' + id + ')"\
                       onkeydown="window._batchFieldKeydown(event,\'bosszeg-' + id + '\')">\
                <span id="bev-sep-' + id + '" class="text-muted d-none">-</span>\
                <input type="number" id="bev-endev-' + id + '"\
                       class="form-control form-control-sm text-center fw-bold border-warning d-none"\
                       value="" min="2000" max="2099" style="width:68px;"\
                       onchange="window._batchUpdateEndYear(' + id + ')">\
            </div>\
            <input type="hidden" id="bevcount-' + id + '" value="1">\
            <div id="bev-badge-' + id + '" class="text-center" style="line-height:1.2;">' + initBadge + '\
                <a href="#" class="small text-primary" style="font-size:.72em;"\
                   onclick="event.preventDefault();window._batchToggleMultiYear(' + id + ')">Több évre...</a>\
            </div>\
        </td>\
        <td class="p-1">\
            <input type="number" id="bosszeg-' + id + '"\
                   class="form-control form-control-sm text-end text-success fw-bold"\
                   placeholder="0.00" step="0.01" min="0"\
                   oninput="window._batchUpdateSummary()"\
                   onkeydown="window._batchFieldKeydown(event,\'birat-' + id + '\')">\
            <div id="bsub-cont-' + id + '"></div>\
        </td>\
        <td class="p-1">\
            <input type="text" id="birat-' + id + '"\
                   class="form-control form-control-sm"\
                   placeholder="Pl. 123/2026"\
                   onkeydown="window._batchFieldKeydown(event,\'bmegjeg-' + id + '\')"\
                   onblur="window._batchCheckIratszam(' + id + ',\'bev\')">\
            <div id="birat-badge-' + id + '" class="mt-1"></div>\
        </td>\
        <td class="p-1">\
            <input type="text" id="bmegjeg-' + id + '"\
                   class="form-control form-control-sm"\
                   placeholder="Megjegyzés..."\
                   onkeydown="window._batchMegjegKeydown(event, ' + id + ')">\
        </td>\
        <td class="p-1 text-center align-middle">\
            <button type="button" class="btn btn-sm btn-icon btn-outline-danger"\
                    onclick="window.removeBatchRow(' + id + ')" title="Sor törlése">\
                <i class="ti ti-x"></i>\
            </button>\
        </td>\
    </tr>';
}

// ── Sor hozzáadása ────────────────────────────────────────────────────────────
window.addBatchRow = function() {
    var tbody = document.getElementById('batch-income-tbody');
    if (!tbody) return;
    var rowNum = tbody.children.length + 1;
    tbody.insertAdjacentHTML('beforeend', _batchRowHtml(rowNum));
    var newId = _batchRowCounter;
    document.getElementById('bcel-text-' + newId)?.focus();

    // Iratszám auto-fill ha van öröklött kategória
    var celId = (document.getElementById('bcel-id-' + newId) || {}).value;
    var iratEl = document.getElementById('birat-' + newId);
    if (celId && iratEl && !iratEl.value) {
        if (celId.startsWith('_BM:')) {
            iratEl.value = 'BM-' + (window._nextTransferNum + window._batchTransferOffset) + '/' + new Date().getFullYear();
            window._batchTransferOffset++;
        } else {
            var defIrattipus = (document.getElementById('batch-default-irattipus') || {}).value;
            if (defIrattipus === 'Készpénz') {
                iratEl.value = window._nextReceiptNum + window._batchReceiptOffset;
                window._batchReceiptOffset++;
            }
        }
    }

    window._batchUpdateSummary();
};

// ── Sor törlése ───────────────────────────────────────────────────────────────
window.removeBatchRow = function(id) {
    document.getElementById(`batch-tr-${id}`)?.remove();
    var tbody = document.getElementById('batch-income-tbody');
    Array.from(tbody.children).forEach((tr, i) => {
        var fc = tr.querySelector('td:first-child');
        if (fc) fc.textContent = i + 1;
    });
    window._batchUpdateSummary();
};

// ── Összesítő frissítése ──────────────────────────────────────────────────────
window._batchUpdateSummary = function() {
    var tbody = document.getElementById('batch-income-tbody');
    if (!tbody) return;
    var total = 0;
    var tetelSzam = 0;
    var rows = tbody.querySelectorAll('tr[data-row-id]');
    rows.forEach(function(tr) {
        var rowId = tr.dataset.rowId;
        total += parseFloat((document.getElementById('bosszeg-' + rowId) || {}).value || 0) || 0;
        var evCount = parseInt((document.getElementById('bevcount-' + rowId) || {}).value) || 1;
        tetelSzam += evCount;
    });
    var countText = rows.length + ' sor';
    if (tetelSzam > rows.length) countText += ' (' + tetelSzam + ' tétel)';
    document.getElementById('batch-row-count').textContent = countText;
    document.getElementById('batch-total-sum').textContent = 'Összesen: ' + total.toLocaleString('hu-HU', { minimumFractionDigits: 2 }) + ' RON';
};

// ── Általános mező Enter → fókusz következő mezőre ────────────────────────────
window._batchFieldKeydown = function(event, nextId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        document.getElementById(nextId)?.focus();
    }
};

// ── Megjegyzés mező Enter → új sor ────────────────────────────────────────────
window._batchMegjegKeydown = function(event, rowId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        var tbody = document.getElementById('batch-income-tbody');
        if (!tbody) { window.addBatchRow(); return; }
        var rows = Array.from(tbody.querySelectorAll('tr[data-row-id]'));
        var currentIdx = rows.findIndex(function(tr) { return tr.dataset.rowId == rowId; });
        if (currentIdx >= 0 && currentIdx < rows.length - 1) {
            // Van következő sor → ugrás arra
            var nextRowId = rows[currentIdx + 1].dataset.rowId;
            document.getElementById('bcel-text-' + nextRowId)?.focus();
        } else {
            // Utolsó sor → új sor létrehozása
            window.addBatchRow();
        }
    }
};

// ── Jogcím (Költségvetési tétel) kezelők ──────────────────────────────────────

window._batchCelFocus = function(input, rowId) {
    _batchActiveRowId  = rowId;
    _batchActiveDdType = 'cel';
    _batchShowCelList(input, rowId);
};

window._batchCelKeydown = function(event, rowId) {
    if (event.key === 'Backspace' || event.key === 'Delete') {
        _batchLastKeyWasDel = true;
        document.getElementById(`bcel-id-${rowId}`).value = '';
        return;
    }
    _batchLastKeyWasDel = false;

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (_batchDdMoveFocus(1)) _batchApplyDdFocusToCel(rowId);
        return;
    }
    if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (_batchDdMoveFocus(-1)) _batchApplyDdFocusToCel(rowId);
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        var dd = document.getElementById('batch-float-dd');
        if (dd && dd.style.display !== 'none' && _batchDdFocusIdx >= 0) {
            var btn = dd.querySelectorAll('button')[_batchDdFocusIdx];
            if (btn) { btn.dispatchEvent(new MouseEvent('mousedown')); return; }
        }
        // Elfogadjuk az aktuális kitöltést és ugrunk tovább
        _batchHideDd();
        document.getElementById(`bszem-text-${rowId}`)?.focus();
    }
    if (event.key === 'Escape') _batchHideDd();
};

window._batchCelInput = function(input, rowId) {
    _batchActiveRowId  = rowId;
    _batchActiveDdType = 'cel';
    document.getElementById(`bcel-id-${rowId}`).value = '';

    if (_batchLastKeyWasDel) {
        _batchShowCelList(input, rowId);
        return;
    }
    var q = input.value;
    if (!q.trim()) { _batchShowCelList(input, rowId); return; }

    var opts  = _batchGetCelOptions();
    var first = opts.find(o => o.name.toLowerCase().startsWith(q.toLowerCase()));
    if (first) {
        // Inline autocomplete: felhasználó betűi + kijelölt kiegészítés
        var fill = q + first.name.substring(q.length);
        input.value = fill;
        input.setSelectionRange(q.length, fill.length);
        document.getElementById(`bcel-id-${rowId}`).value = first.id;
    }
    _batchShowCelList(input, rowId);
};

function _batchShowCelList(input, rowId) {
    // A lekérdezés = felhasználó által ténylegesen begépelt rész (kijelölés előtti)
    var typedLen = (input.selectionStart < input.selectionEnd) ? input.selectionStart : input.value.length;
    var q = input.value.substring(0, typedLen).trim().toLowerCase();
    var opts = _batchGetCelOptions();
    var matches = q.length === 0 ? opts : opts.filter(o => o.name.toLowerCase().includes(q));

    if (matches.length === 0) {
        _batchShowDdAt(input, '<div class="list-group-item text-muted small py-2">Nincs találat</div>');
        return;
    }
    _batchShowDdAt(input, matches.slice(0, 50).map(o =>
        `<button type="button" class="list-group-item list-group-item-action py-2 small"
                 data-cel-id="${o.id}" data-cel-name="${o.name.replace(/"/g, '&quot;')}"
                 onmousedown="window._batchCelSelect(${rowId},'${o.id}','${o.name.replace(/'/g, "\\'")}')">
            ${o.name}
         </button>`
    ).join(''));
}

function _batchApplyDdFocusToCel(rowId) {
    var dd = document.getElementById('batch-float-dd');
    if (!dd || _batchDdFocusIdx < 0) return;
    var btn = dd.querySelectorAll('button')[_batchDdFocusIdx];
    if (!btn) return;
    var name  = btn.dataset.celName || btn.textContent.trim();
    var celId = btn.dataset.celId   || '';
    var input = document.getElementById(`bcel-text-${rowId}`);
    if (input) { input.value = name; input.setSelectionRange(name.length, name.length); }
    document.getElementById(`bcel-id-${rowId}`).value = celId;
}

window._batchCelSelect = function(rowId, celId, celName) {
    var textEl   = document.getElementById(`bcel-text-${rowId}`);
    var hiddenEl = document.getElementById(`bcel-id-${rowId}`);
    if (textEl)   { textEl.value = celName; textEl.setSelectionRange(celName.length, celName.length); }
    if (hiddenEl) hiddenEl.value = celId;
    _batchHideDd();

    // Iratszám auto-kitöltés
    var iratEl = document.getElementById('birat-' + rowId);
    if (iratEl && !iratEl.value) {
        if (celId.startsWith('_BM:')) {
            var currYear = new Date().getFullYear();
            iratEl.value = 'BM-' + (window._nextTransferNum + window._batchTransferOffset) + '/' + currYear;
            window._batchTransferOffset++;
        } else {
            var defIrattipus = document.getElementById('batch-default-irattipus')?.value;
            if (defIrattipus === 'Készpénz') {
                iratEl.value = window._nextReceiptNum + window._batchReceiptOffset;
                window._batchReceiptOffset++;
            }
        }
    }

    // Kedvezmény jelző frissítése (járulék kategória esetén)
    window._batchCheckJarulekKedvezmeny(rowId);
    document.getElementById(`bszem-text-${rowId}`)?.focus();
};

// ── Személy autocomplete kezelők ──────────────────────────────────────────────

window._batchSzemKeydown = function(event, rowId) {
    if (event.key === 'ArrowDown') { event.preventDefault(); _batchDdMoveFocus(1);  return; }
    if (event.key === 'ArrowUp')   { event.preventDefault(); _batchDdMoveFocus(-1); return; }
    if (event.key === 'Enter') {
        event.preventDefault();
        var dd = document.getElementById('batch-float-dd');
        if (dd && dd.style.display !== 'none' && _batchDdFocusIdx >= 0) {
            var btn = dd.querySelectorAll('button')[_batchDdFocusIdx];
            if (btn) { btn.dispatchEvent(new MouseEvent('mousedown')); return; }
        }
        _batchHideDd();
        document.getElementById(`bev-${rowId}`)?.focus();
    }
    if (event.key === 'Escape') _batchHideDd();
};

window._batchSzemInput = function(input, rowId) {
    _batchActiveRowId  = rowId;
    _batchActiveDdType = 'szem';
    document.getElementById(`bszem-id-${rowId}`).value = '';

    var q = input.value.trim();
    if (q.length < 2) { _batchHideDd(); return; }

    var qLow = q.toLowerCase();
    var members = (window.allChurchMembers || []).filter(m => {
        var full = ((m.csaladnev || '') + ' ' + (m.k_nev || '')).toLowerCase();
        return full.includes(qLow);
    }).slice(0, 10);

    // Cégek keresése
    var companyMatches = (window._savedCompanies || []).filter(function(c) {
        return c.nev.toLowerCase().indexOf(qLow) >= 0 || (c.adoszam && c.adoszam.toLowerCase().indexOf(qLow) >= 0);
    }).slice(0, 5);

    if (members.length === 0 && companyMatches.length === 0) {
        _batchShowDdAt(input, '<div class="list-group-item text-muted small py-2">Nincs találat</div>');
        return;
    }
    var html = '';
    // Cégek
    companyMatches.forEach(function(c) {
        var escapedName = c.nev.replace(/'/g, "\\'");
        html += '<button type="button" class="list-group-item list-group-item-action py-2 small"'
            + ' onmousedown="document.getElementById(\'bszem-text-' + rowId + '\').value=\'' + escapedName + '\';document.getElementById(\'bszem-id-' + rowId + '\').value=\'\';window._batchHideDd();">'
            + '<span class="fw-bold text-orange"><i class="ti ti-building me-1"></i>' + c.nev + '</span>'
            + ' <span class="badge bg-orange-lt text-orange">Cég</span>'
            + (c.adoszam ? '<div class="text-muted" style="font-size:.8em">' + c.adoszam + '</div>' : '')
            + '</button>';
    });
    // Személyek
    var today = new Date();
    html += members.map(m => {
        var name = `${m.csaladnev || ''} ${m.k_nev || ''}`.trim();
        var ageStr = '';
        if (m.sz_datum) {
            var age = today.getFullYear() - new Date(m.sz_datum).getFullYear();
            ageStr = ` <span class="badge bg-secondary-lt text-dark">${age} é</span>`;
        }
        var addr = [m.adrlocality?.name, m.adrstreet?.name, m.c_szam].filter(Boolean).join(' ');
        return `<button type="button" class="list-group-item list-group-item-action py-2 small"
                        onmousedown="window._batchSzemSelect(${rowId},${m.id},'${name.replace(/'/g, "\\'")}')">
                    <span class="fw-bold text-primary">${name}</span>${ageStr}
                    ${addr ? `<div class="text-muted" style="font-size:.8em"><i class="ti ti-map-pin me-1"></i>${addr}</div>` : ''}
                </button>`;
    }).join('');
    _batchShowDdAt(input, html);
};

window._batchSzemSelect = function(rowId, szemId, szemName) {
    var textEl   = document.getElementById(`bszem-text-${rowId}`);
    var hiddenEl = document.getElementById(`bszem-id-${rowId}`);
    if (textEl)   textEl.value   = szemName;
    if (hiddenEl) hiddenEl.value = szemId;
    _batchHideDd();
    // Kedvezmény jelző frissítése
    window._batchCheckJarulekKedvezmeny(rowId);
    document.getElementById(`bev-${rowId}`)?.focus();
};

// ── Járulék kedvezmény jelző a batch módban ──
window._batchCheckJarulekKedvezmeny = function(rowId) {
    var badgeCont = document.getElementById('bdatum-badge-' + rowId);
    if (!badgeCont) return;

    // Csak járulék kategóriánál (101.01) jelezzünk
    var celId = (document.getElementById('bcel-id-' + rowId) || {}).value;
    if (!celId || celId.startsWith('_BM:')) return;
    var celKod = window.bevCelMap ? window.bevCelMap[celId] : null;
    if (celKod !== '101.01') return;

    var kedvezmenyek = window._jarulekKedvezmenyek || [];
    if (kedvezmenyek.length === 0) return;

    var ev = (document.getElementById('bev-' + rowId) || {}).value || String(new Date().getFullYear());
    var datum = (document.getElementById('bdatum-' + rowId) || {}).value || '';
    var szemId = parseInt((document.getElementById('bszem-id-' + rowId) || {}).value) || 0;
    var alap = (window._jarulekPerYear && window._jarulekPerYear[ev]) || window.evesJarulek || 0;

    var hints = [];

    // Időszaki kedvezmények — dátum alapján
    var idoszakKedv = kedvezmenyek.filter(function(k) {
        return k.ev === ev && k.tipus === 'idoszak' && k.hatarid;
    });
    if (datum && idoszakKedv.length > 0) {
        var datumMD = datum.substring(5); // MM-DD
        idoszakKedv.forEach(function(k) {
            if (datumMD <= k.hatarid) {
                hints.push({ label: k.hatarid + ' előtt', osszeg: k.kedv_osszeg, css: 'bg-warning text-dark' });
            }
        });
    }

    // Kor alapú kedvezmények — személy életkora alapján
    if (szemId > 0) {
        var szemely = (window.allChurchMembers || []).find(function(m) { return m.id === szemId; });
        if (szemely && szemely.sz_datum) {
            var szEv = parseInt(szemely.sz_datum.substring(0, 4));
            var kor = new Date().getFullYear() - szEv;
            var korKedv = kedvezmenyek.filter(function(k) {
                return k.ev === ev && k.tipus === 'kor' && k.kor_tol && kor >= k.kor_tol;
            });
            korKedv.forEach(function(k) {
                var kedvOsszeg = k.fix_osszeg ? k.fix_osszeg : Math.round(alap * (k.szazalek || 100) / 100);
                hints.push({ label: kor + ' éves (' + k.kor_tol + '+)', osszeg: kedvOsszeg, css: 'bg-info text-dark' });
            });
        }
    }

    // Megjelenítés a dátum badge-ben (nem törli a meglévő dátum figyelmeztetést)
    var existingDateBadge = badgeCont.querySelector('.badge-date-warn');
    var kedvHtml = '';
    if (hints.length > 0) {
        // A legjobb (legkisebb) kedvezményt emeljük ki
        hints.sort(function(a, b) { return a.osszeg - b.osszeg; });
        var best = hints[0];
        kedvHtml = '<div class="kedv-hint mt-1"><span class="badge ' + best.css + '" style="font-size:.72em;">'
            + '<i class="ti ti-discount me-1"></i>' + best.label + ': ' + best.osszeg + ' RON'
            + '</span></div>';
    }
    // Régi kedvezmény hint törlése és új beszúrása
    var oldHint = badgeCont.querySelector('.kedv-hint');
    if (oldHint) oldHint.remove();
    if (kedvHtml) badgeCont.insertAdjacentHTML('beforeend', kedvHtml);
};

// ── Összes Mentése ────────────────────────────────────────────────────────────
window.saveBatchIncome = async function() {
    var tbody = document.getElementById('batch-income-tbody');
    if (!tbody) return;

    var defaultDatum     = document.getElementById('batch-default-datum').value;
    var defaultIrattipus = document.getElementById('batch-default-irattipus').value;
    var defaultNyugta    = document.getElementById('batch-default-nyugta').value;
    var today            = new Date().toISOString().split('T')[0];

    if (!defaultDatum) { alert('Kérlek add meg az alapértelmezett dátumot!'); return; }
    if (defaultDatum > today) { alert('⛔ Jövőbeli dátumot nem lehet rögzíteni!'); return; }

    var { data: { user } } = await _supabase.auth.getUser();
    if (!user) { alert('Nincs bejelentkezve!'); return; }

    var rows    = Array.from(tbody.querySelectorAll('tr[data-row-id]'));
    var records = [];
    var errors  = [];

    rows.forEach((tr, i) => {
        var id      = tr.dataset.rowId;
        var celId   = document.getElementById(`bcel-id-${id}`)?.value;
        var szemId  = document.getElementById(`bszem-id-${id}`)?.value;
        var szemNev = document.getElementById(`bszem-text-${id}`)?.value?.trim();
        var ev      = parseInt(document.getElementById(`bev-${id}`)?.value || new Date().getFullYear());
        var osszeg  = parseFloat(document.getElementById(`bosszeg-${id}`)?.value);
        var irat    = document.getElementById(`birat-${id}`)?.value?.trim() || null;
        var megjeg  = document.getElementById(`bmegjeg-${id}`)?.value?.trim() || null;

        if (!celId)               { errors.push(`${i+1}. sor: Költségvetési tétel nincs kiválasztva!`); return; }
        if (!osszeg || osszeg <= 0) { errors.push(`${i+1}. sor: Érvényes összeg szükséges`); return; }

        records.push({
            xkey: 'B-' + Date.now().toString(36).toUpperCase() + '-' + i + '-' + Math.random().toString(36).substring(2, 6),
            congregation_id: activeCongregationId,
            id_befizetescel: parseInt(celId),
            datum:      defaultDatum,
            irattipus:  defaultIrattipus,
            nyugta:     defaultNyugta,
            iratszam:   irat,
            fizetettev: ev,
            osszeg:     osszeg,
            id_szemely: szemId ? parseInt(szemId) : null,
            forrasa:    szemNev || null,
            megjegyzes: megjeg,
            csalad:     false,
            deleted:    false,
            userid:     user.id
        });
    });

    if (errors.length > 0) { alert('Hibás sorok:\n\n' + errors.join('\n')); return; }
    if (records.length === 0) { alert('Nincs érvényes sor a mentéshez!'); return; }

    // Duplikáció-ellenőrzés iratszám alapján
    var iratszamList = records.filter(r => r.iratszam).map(r => r.iratszam);
    if (iratszamList.length > 0) {
        var { data: existing } = await _supabase.from('befizetes')
            .select('iratszam')
            .eq('congregation_id', activeCongregationId)
            .eq('deleted', false)
            .in('iratszam', iratszamList);
        if (existing && existing.length > 0) {
            var existSet = new Set(existing.map(r => r.iratszam));
            var dupCount = records.filter(r => r.iratszam && existSet.has(r.iratszam)).length;
            if (!confirm(`⚠️ ${dupCount} sor már szerepel az adatbázisban azonos iratszámmal!\nFolytatja?`)) return;
        }
    }

    var btn = document.querySelector('#batch-income-view .btn-success');
    var origHtml = btn.innerHTML;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Mentés (${records.length} sor)...`;
    btn.disabled = true;

    try {
        var { error } = await _supabase.from('befizetes').insert(records);
        if (error) throw error;

        alert(`✅ ${records.length} bevétel sikeresen rögzítve!`);
        var tbodyEl = document.getElementById('batch-income-tbody');
        tbodyEl.innerHTML = '';
        _batchRowCounter = 0;
        window.addBatchRow();
        window.addBatchRow();
        window.addBatchRow();
        window._batchUpdateSummary();

        if (typeof loadTranzakciok === 'function') loadTranzakciok();
        if (typeof window.loadKasszaTransactions === 'function') window.loadKasszaTransactions();
        if (typeof window.loadBankTransactions === 'function') window.loadBankTransactions();
    } catch (err) {
        alert('Hiba a mentés során: ' + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled  = false;
    }
};