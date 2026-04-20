// ============================================================================
// penzugy_unified_modal.js
// Egységes Bevétel/Kiadás Modal — Orchestráció, belső mozgás, kettős könyvelés
// FONTOS: Ez a script a penzugy_income.js és penzugy_expense.js UTÁN töltődjön!
// ============================================================================

var _unifiedActiveTab = 'income';
var _unifiedBatchMode = false;

// ============================================================================
// DÁTUM ELLENŐRZÉS — Visszamenőleges rögzítés tiltása
// ============================================================================

window._lastRecordedDate = null;

// Utolsó rögzített tétel dátumának lekérdezése (befizetes + kiadas közül a későbbi)
window._getLastRecordedDate = async function() {
    var bevPromise = _supabase.from('befizetes')
        .select('datum')
        .eq('congregation_id', activeCongregationId)
        .eq('deleted', false)
        .order('datum', { ascending: false })
        .limit(1);
    var kiaPromise = _supabase.from('kiadas')
        .select('datum')
        .eq('congregation_id', activeCongregationId)
        .eq('deleted', false)
        .order('datum', { ascending: false })
        .limit(1);
    var results = await Promise.all([bevPromise, kiaPromise]);
    var bevDate = results[0].data && results[0].data[0] ? results[0].data[0].datum : null;
    var kiaDate = results[1].data && results[1].data[0] ? results[1].data[0].datum : null;
    if (!bevDate) return kiaDate;
    if (!kiaDate) return bevDate;
    return bevDate > kiaDate ? bevDate : kiaDate;
};

// Dátum mező változásakor figyelmeztetés
window._checkDateBackward = function(input, badgeId) {
    var badge = document.getElementById(badgeId);
    if (!badge) return;
    var val = input.value;
    if (!val || !window._lastRecordedDate) {
        badge.innerHTML = '';
        input.classList.remove('border-warning');
        return;
    }
    if (val < window._lastRecordedDate) {
        badge.innerHTML = '<span class="badge bg-warning text-dark">\u26a0 Korábbi dátum mint az utolsó rögzítés (' + window._lastRecordedDate + ')! Mentés nem lehetséges.</span>';
        input.classList.add('border-warning');
    } else {
        badge.innerHTML = '';
        input.classList.remove('border-warning');
    }
};

// ============================================================================
// SORONKÉNTI DÁTUM VALIDÁCIÓ
// ============================================================================

window._batchCheckRowDate = function(rowId, side) {
    var prefix = (side === 'bev') ? 'bdatum-' : 'kdatum-';
    var input = document.getElementById(prefix + rowId);
    var badge = document.getElementById(prefix + 'badge-' + rowId);
    if (!input || !badge) return;
    badge.innerHTML = '';
    input.classList.remove('border-danger', 'border-warning');

    var val = input.value;
    if (!val) return;

    var today = new Date().toISOString().split('T')[0];
    if (val > today) {
        badge.innerHTML = '<span class="badge bg-danger">Jövőbeli dátum nem engedélyezett!</span>';
        input.classList.add('border-danger');
        return;
    }
    if (window._lastRecordedDate && val < window._lastRecordedDate) {
        badge.innerHTML = '<span class="badge bg-warning text-dark">Figyelem: visszamenőleges dátum (' + window._lastRecordedDate + ' előtti)</span>';
        input.classList.add('border-warning');
    }
};

// ============================================================================
// IRATSZÁM SORSZÁMOZÁS — Két különálló számsor
// ============================================================================

// Normál nyugta max szám lekérdezése (belső mozgás NÉLKÜL)
window._getNextReceiptNumber = async function() {
    var currYear = new Date().getFullYear();
    var { data } = await _supabase.from('befizetes')
        .select('iratszam')
        .eq('congregation_id', activeCongregationId)
        .eq('deleted', false)
        .ilike('irattipus', '%észpénz%')
        .is('belso_mozgas_xkey', null)
        .gte('datum', currYear + '-01-01')
        .lte('datum', currYear + '-12-31');
    var maxNum = 0;
    (data || []).forEach(function(r) {
        var m = String(r.iratszam).match(/(\d+)/);
        if (m && parseInt(m[1]) > maxNum) maxNum = parseInt(m[1]);
    });
    return maxNum + 1;
};

// Belső mozgás következő sorszám (COUNT DISTINCT belso_mozgas_xkey)
window._getNextTransferNumber = async function() {
    var currYear = new Date().getFullYear();
    var { data } = await _supabase.from('befizetes')
        .select('belso_mozgas_xkey')
        .eq('congregation_id', activeCongregationId)
        .eq('deleted', false)
        .not('belso_mozgas_xkey', 'is', null)
        .gte('datum', currYear + '-01-01')
        .lte('datum', currYear + '-12-31');
    var keys = new Set();
    (data || []).forEach(function(r) { if (r.belso_mozgas_xkey) keys.add(r.belso_mozgas_xkey); });
    return keys.size + 1;
};

// Batch sorszám számlálók
window._nextReceiptNum = 1;
window._nextTransferNum = 1;
window._batchReceiptOffset = 0;
window._batchTransferOffset = 0;

// Iratszám ellenőrzés (duplikátum, kimaradt szám)
window._batchCheckIratszam = async function(rowId, side) {
    var inputId = (side === 'bev') ? 'birat-' + rowId : 'kirat-' + rowId;
    var badgeId = (side === 'bev') ? 'birat-badge-' + rowId : 'kirat-badge-' + rowId;
    var input = document.getElementById(inputId);
    var badge = document.getElementById(badgeId);
    if (!input || !badge) return;

    var val = input.value.trim();
    if (!val) { badge.innerHTML = ''; input.classList.remove('border-danger', 'border-warning'); return; }

    // BM- prefixes → belső mozgás, nincs dupla-check
    if (val.startsWith('BM-')) { badge.innerHTML = ''; input.classList.remove('border-danger', 'border-warning'); return; }

    var numMatch = val.match(/(\d+)/);
    if (!numMatch) { badge.innerHTML = ''; return; }
    var num = parseInt(numMatch[1]);

    // 1. Duplikátum ellenőrzés (DB lekérdezés)
    var table = (side === 'bev') ? 'befizetes' : 'kiadas';
    var { data: existing } = await _supabase.from(table)
        .select('id')
        .eq('congregation_id', activeCongregationId)
        .eq('iratszam', val)
        .eq('deleted', false)
        .limit(1);

    input.classList.remove('border-danger', 'border-warning');

    if (existing && existing.length > 0) {
        badge.innerHTML = '<span class="badge bg-danger">Már létezik!</span>';
        input.classList.add('border-danger');
        return;
    }

    // 2. Batch-on belüli duplikátum ellenőrzés
    var prefix = (side === 'bev') ? 'birat-' : 'kirat-';
    var batchNums = [];
    document.querySelectorAll('input[id^="' + prefix + '"]').forEach(function(el) {
        if (el.id === inputId) return; // saját sor kihagyása
        var m2 = el.value.trim().match(/(\d+)/);
        if (m2) batchNums.push(parseInt(m2[1]));
    });
    if (batchNums.includes(num)) {
        badge.innerHTML = '<span class="badge bg-danger">Duplikátum a batch-ben!</span>';
        input.classList.add('border-danger');
        return;
    }

    // 3. Sorrend ellenőrzés (csak bevételnél)
    if (side === 'bev') {
        var expected = window._nextReceiptNum;
        // Kimaradt számok: expected-tól num-1-ig, amik NEM szerepelnek más batch sorban
        var missing = [];
        for (var i = expected; i < num; i++) {
            if (!batchNums.includes(i)) missing.push(i);
        }
        if (missing.length > 0) {
            badge.innerHTML = '<span class="badge bg-warning text-dark">Kimaradt: ' + missing[0] + '\u2013' + missing[missing.length - 1] + '</span>';
            input.classList.add('border-warning');
        } else if (num < expected) {
            badge.innerHTML = '<span class="badge bg-secondary">Visszaugrás</span>';
        } else {
            badge.innerHTML = '';
        }
    } else {
        badge.innerHTML = '';
    }
};

// ============================================================================
// 1. MODAL MEGNYITÁS
// ============================================================================

window.openUnifiedModal = function(defaultTab) {
    defaultTab = defaultTab || 'income';
    _unifiedActiveTab = defaultTab;
    _unifiedBatchMode = false;

    // ── Űrlapok alapállapotba ────────────────────────────────────
    var formBev = document.getElementById('form-befizetes');
    var formKia = document.getElementById('form-kiadas');
    if (formBev) formBev.reset();
    if (formKia) formKia.reset();

    // ── Állapotváltozók reset ────────────────────────────────────
    window.currentIncomeRows = [{
        id: Date.now(),
        year: new Date().getFullYear(),
        amount: window.evesJarulek || 0,
        memberId: null
    }];
    window.currentExpenseRows = [];
    window.selectedIncomePerson = null;
    window.currentHouseholdMembers = [];
    window.selectedExpensePersonId = null;

    // ── Nézetek reset ───────────────────────────────────────────
    document.getElementById('single-income-view')?.classList.remove('d-none');
    document.getElementById('batch-income-view')?.classList.add('d-none');
    document.getElementById('single-expense-view')?.classList.remove('d-none');
    document.getElementById('batch-expense-view')?.classList.add('d-none');

    var batchBtn = document.getElementById('btn-toggle-batch-mode');
    if (batchBtn) {
        batchBtn.innerHTML = '<i class="ti ti-table me-1"></i>T\u00e1bl\u00e1zatos m\u00f3d';
    }

    // ── Belső mozgás szekciók elrejtése ─────────────────────────
    document.getElementById('b-transfer-bank-section')?.classList.add('d-none');
    document.getElementById('k-transfer-bank-section')?.classList.add('d-none');
    document.getElementById('b-valutacsere-section')?.classList.add('d-none');
    document.getElementById('k-valutacsere-section')?.classList.add('d-none');
    _removeSecondBankSelector('b');
    _removeSecondBankSelector('k');
    // Bank picker select/label visszaállítás (előző BM kiválasztás után elrejthette)
    ['b', 'k'].forEach(function(p) {
        var bs = document.getElementById(p + '-transfer-bankszamla');
        var bl = bs?.previousElementSibling;
        if (bs) bs.classList.remove('d-none');
        if (bl && bl.tagName === 'LABEL') { bl.classList.remove('d-none'); bl.textContent = 'Bankszámla kiválasztása *'; }
    });

    // ── Kiadás bontás reset ─────────────────────────────────────
    var splitChk = document.getElementById('chk-expense-split');
    if (splitChk) {
        splitChk.checked = false;
        if (typeof window.toggleExpenseSplit === 'function') window.toggleExpenseSplit();
    }

    // ── Leltár / kereső reset ───────────────────────────────────
    document.getElementById('div-leltar-koto')?.classList.add('d-none');
    document.getElementById('search-results')?.classList.add('d-none');
    document.getElementById('search-results-expense')?.classList.add('d-none');
    document.getElementById('family-info-badge')?.classList.add('d-none');

    // ── Dátum beállítás ─────────────────────────────────────────
    var today = new Date().toISOString().split('T')[0];
    var kDatum = document.getElementById('k-datum');
    if (kDatum) kDatum.value = today;

    // ── Fül aktiválás ───────────────────────────────────────────
    var incomeTab = document.getElementById('utab-income-tab');
    var expenseTab = document.getElementById('utab-expense-tab');
    var incomePane = document.getElementById('unified-tab-income');
    var expensePane = document.getElementById('unified-tab-expense');

    if (defaultTab === 'expense') {
        incomeTab?.classList.remove('active');
        expenseTab?.classList.add('active');
        incomePane?.classList.remove('show', 'active');
        expensePane?.classList.add('show', 'active');
    } else {
        incomeTab?.classList.add('active');
        expenseTab?.classList.remove('active');
        incomePane?.classList.add('show', 'active');
        expensePane?.classList.remove('show', 'active');
    }

    // ── Badge-ek / Staging info reset ───────────────────────────
    _updateUnifiedBadges(0, 0);

    // ── Bevételi sorok renderelése ──────────────────────────────
    if (typeof window.renderIncomeRows === 'function') window.renderIncomeRows();

    // ── Utolsó nyugtaszám betöltése ─────────────────────────────
    if (typeof window.loadLastReceiptData === 'function') window.loadLastReceiptData();

    // ── Utolsó rögzített dátum betöltése (visszamenőleges tiltáshoz) ──
    window._getLastRecordedDate().then(function(d) {
        window._lastRecordedDate = d;
    }).catch(function(e) { console.error('Utolsó dátum lekérdezés hiba:', e); });

    // ── Modal megnyitás ─────────────────────────────────────────
    var modalEl = document.getElementById('modal-unified-transaction');
    var existing = bootstrap.Modal.getInstance(modalEl);
    if (existing) { existing.show(); } else { new bootstrap.Modal(modalEl).show(); }
};


// ============================================================================
// 2. FÜL VÁLTÁS
// ============================================================================

window._unifiedTabChanged = function(tab) {
    _unifiedActiveTab = tab;
    // Batch gomb mindkét fülön látszik
};


// ============================================================================
// 3. BATCH MÓD TOGGLE (felülírja a penzugy_income.js verziót)
// ============================================================================

window.toggleBatchMode = async function() {
    _unifiedBatchMode = !_unifiedBatchMode;
    var toggleBtn = document.getElementById('btn-toggle-batch-mode');
    var today = new Date().toISOString().split('T')[0];

    // ── Bevétel nézet szinkron ──
    var singleIncome = document.getElementById('single-income-view');
    var batchIncome  = document.getElementById('batch-income-view');

    // ── Kiadás nézet szinkron ──
    var singleExpense = document.getElementById('single-expense-view');
    var batchExpense  = document.getElementById('batch-expense-view');

    if (_unifiedBatchMode) {
        singleIncome?.classList.add('d-none');
        batchIncome?.classList.remove('d-none');
        singleExpense?.classList.add('d-none');
        batchExpense?.classList.remove('d-none');
        if (toggleBtn) toggleBtn.innerHTML = '<i class="ti ti-forms me-1"></i>Egyedi m\u00f3d';

        // ÚJ: Sorszámozás inicializálás
        try {
            window._nextReceiptNum = await window._getNextReceiptNumber();
            window._nextTransferNum = await window._getNextTransferNumber();
        } catch(e) { console.error('Sorszám lekérdezés hiba:', e); }
        window._batchReceiptOffset = 0;
        window._batchTransferOffset = 0;

        // Bevétel batch init
        var batchDatum = document.getElementById('batch-default-datum');
        if (batchDatum && !batchDatum.value) batchDatum.value = today;
        if (document.getElementById('batch-income-tbody')?.children.length === 0) {
            if (typeof window.addBatchRow === 'function') {
                window.addBatchRow();
                window.addBatchRow();
                window.addBatchRow();
            }
            // Focus az első sorra (ne a 3.-on maradjon)
            var firstIncRow = document.getElementById('batch-income-tbody')?.querySelector('tr[data-row-id]');
            if (firstIncRow) {
                var firstIncId = firstIncRow.dataset.rowId;
                setTimeout(function() { document.getElementById('bcel-text-' + firstIncId)?.focus(); }, 50);
            }
        }

        // Kiadás batch init
        var batchExpDatum = document.getElementById('batch-expense-default-datum');
        if (batchExpDatum && !batchExpDatum.value) batchExpDatum.value = today;
        if (document.getElementById('batch-expense-tbody')?.children.length === 0) {
            if (typeof window.addBatchExpenseRow === 'function') {
                window.addBatchExpenseRow();
                window.addBatchExpenseRow();
                window.addBatchExpenseRow();
            }
            // Focus az első kiadás sorra
            var firstExpRow = document.getElementById('batch-expense-tbody')?.querySelector('tr[data-row-id]');
            if (firstExpRow) {
                var firstExpId = firstExpRow.dataset.rowId;
                setTimeout(function() { document.getElementById('kcel-text-' + firstExpId)?.focus(); }, 50);
            }
        }
    } else {
        singleIncome?.classList.remove('d-none');
        batchIncome?.classList.add('d-none');
        singleExpense?.classList.remove('d-none');
        batchExpense?.classList.add('d-none');
        if (toggleBtn) toggleBtn.innerHTML = '<i class="ti ti-table me-1"></i>T\u00e1bl\u00e1zatos m\u00f3d';
    }
};


// ============================================================================
// 4. BELSŐ MOZGÁS KATEGÓRIA DETEKTÁLÁS
// ============================================================================
// Az opció értéke _BM: prefixszel kezdődik a dinamikusan generált belső mozgás opcióknál:
//   _BM:kassza_bank:bankId       — készpénzletétel bankba
//   _BM:bank_kassza:bankId       — készpénzfelvétel bankból
//   _BM:bank_bank:srcId:tgtId    — banki átutalás
//   _BM:valutacsere              — valutacsere (bankpickerrel)

function _parseBmValue(val) {
    if (!val || !val.startsWith('_BM:')) return null;
    var parts = val.substring(4).split(':');
    var transferType = parts[0];
    var bankId1 = parts[1] ? parseInt(parts[1]) : null;
    var bankId2 = parts[2] ? parseInt(parts[2]) : null;
    return { transferType: transferType, bankId1: bankId1, bankId2: bankId2 };
}

function _isTransferCel(celId, side) {
    if (!celId) return { isTransfer: false };

    // Dinamikus _BM: értékek kezelése
    var bm = _parseBmValue(celId);
    if (bm) {
        return {
            isTransfer: true,
            transferType: bm.transferType,
            bankId1: bm.bankId1,
            bankId2: bm.bankId2,
            celNev: 'Belső mozgás',
            celKod: null
        };
    }

    return { isTransfer: false };
}

function _onTransferCategoryChange(prefix, celId) {
    var result = _isTransferCel(celId, prefix === 'b' ? 'income' : 'expense');
    var section = document.getElementById(prefix + '-transfer-bank-section');
    var valutaSection = document.getElementById(prefix + '-valutacsere-section');

    if (!result.isTransfer) {
        section?.classList.add('d-none');
        valutaSection?.classList.add('d-none');
        _removeSecondBankSelector(prefix);
        // Bank picker láthatóság reset (korábbi BM kiválasztás után)
        var bankSelectReset = document.getElementById(prefix + '-transfer-bankszamla');
        var bankLabelReset = bankSelectReset?.previousElementSibling;
        if (bankSelectReset) bankSelectReset.classList.remove('d-none');
        if (bankLabelReset && bankLabelReset.tagName === 'LABEL') {
            bankLabelReset.classList.remove('d-none');
            bankLabelReset.textContent = 'Bankszámla kiválasztása *';
        }
        return;
    }

    // Fizetési mód auto-beállítás
    var irattipusEl = document.getElementById(prefix + '-irattipus');

    // Bank picker elemek
    var bankSelect = document.getElementById(prefix + '-transfer-bankszamla');
    var bankLabel = bankSelect?.previousElementSibling;

    if (result.transferType === 'kassza_bank' || result.transferType === 'bank_kassza') {
        // Kassza↔bank: bank már kiválasztva az opcióból → info mutatás, picker elrejtés
        section?.classList.remove('d-none');
        valutaSection?.classList.add('d-none');
        _removeSecondBankSelector(prefix);
        if (bankSelect) bankSelect.classList.add('d-none');
        if (bankLabel && bankLabel.tagName === 'LABEL') bankLabel.classList.add('d-none');

        if (irattipusEl) {
            if (result.transferType === 'kassza_bank') {
                irattipusEl.value = (prefix === 'k') ? 'Készpénz' : 'Banki átutalás';
            } else {
                irattipusEl.value = (prefix === 'b') ? 'Készpénz' : 'Banki átutalás';
            }
        }

        var infoEl = document.getElementById(prefix + '-transfer-info');
        var bankNev = _getBankName(result.bankId1);
        if (infoEl) {
            if (result.transferType === 'kassza_bank') {
                infoEl.textContent = 'Készpénzletétel: ' + bankNev + ' számlára.';
            } else {
                infoEl.textContent = 'Készpénzfelvétel: ' + bankNev + ' számláról.';
            }
        }

    } else if (result.transferType === 'bank_bank') {
        // Bank↔bank: bankok már az opcióból jönnek → info mutatás, picker elrejtés
        section?.classList.remove('d-none');
        valutaSection?.classList.add('d-none');
        _removeSecondBankSelector(prefix);
        if (bankSelect) bankSelect.classList.add('d-none');
        if (bankLabel && bankLabel.tagName === 'LABEL') bankLabel.classList.add('d-none');

        if (irattipusEl) irattipusEl.value = 'Banki átutalás';

        var infoEl2 = document.getElementById(prefix + '-transfer-info');
        if (infoEl2) {
            infoEl2.textContent = 'Banki átutalás: ' + _getBankName(result.bankId1) + ' → ' + _getBankName(result.bankId2);
        }

    } else if (result.transferType === 'valutacsere') {
        // Valutacsere: kell két bankszámla-választó + árfolyam
        section?.classList.remove('d-none');
        valutaSection?.classList.remove('d-none');
        if (bankSelect) bankSelect.classList.remove('d-none');
        if (bankLabel && bankLabel.tagName === 'LABEL') {
            bankLabel.classList.remove('d-none');
            bankLabel.textContent = 'Forrás bankszámla *';
        }
        _populateTransferBankSelector(prefix);
        _ensureSecondBankSelector(prefix);

        if (irattipusEl) irattipusEl.value = 'Banki átutalás';

        var infoElV = document.getElementById(prefix + '-transfer-info');
        if (infoElV) infoElV.textContent = 'Valutacsere két bankszámla között.';
    }
}

// Kategória change figyelés
document.addEventListener('change', async function(e) {
    if (e.target.id === 'b-id_befizetescel') {
        _onTransferCategoryChange('b', e.target.value);
        // Belső mozgás → BM iratszám auto-fill
        if (e.target.value.startsWith('_BM:')) {
            try {
                var nextBm = await window._getNextTransferNumber();
                var iratEl = document.getElementById('b-iratszam');
                if (iratEl) iratEl.value = 'BM-' + nextBm + '/' + new Date().getFullYear();
            } catch(err) { console.error('BM sorszám hiba:', err); }
        }
    }
    if (e.target.id === 'k-id_kiadascel') {
        _onTransferCategoryChange('k', e.target.value);
        // Belső mozgás → BM iratszám auto-fill
        if (e.target.value.startsWith('_BM:')) {
            try {
                var nextBm = await window._getNextTransferNumber();
                var iratEl = document.getElementById('k-iratszam');
                if (iratEl) iratEl.value = 'BM-' + nextBm + '/' + new Date().getFullYear();
            } catch(err) { console.error('BM sorszám hiba:', err); }
        }
    }
    // Kiadás bontás toggle bekötés
    if (e.target.id === 'chk-expense-split') {
        if (typeof window.toggleExpenseSplit === 'function') window.toggleExpenseSplit();
    }
});

// Kiadás bontás "Új tétel" gomb bekötés
document.addEventListener('click', function(e) {
    if (e.target.closest && e.target.closest('#btn-add-expense-row')) {
        if (typeof window.addExpenseRow === 'function') window.addExpenseRow();
    }
});


// ============================================================================
// 5. BANKSZÁMLA VÁLASZTÓ FELTÖLTÉS
// ============================================================================

function _populateTransferBankSelector(prefix) {
    var select = document.getElementById(prefix + '-transfer-bankszamla');
    if (!select) return;
    _fillBankSelect(select);
}

function _fillBankSelect(select) {
    var accounts = window.bankAccounts || [];
    select.innerHTML = '<option value="">-- Válasszon bankszámlát --</option>' +
        accounts.map(function(b) {
            var szin = b.szin || '#206bc4';
            return '<option value="' + b.id + '" data-szin="' + szin + '">\u25CF ' +
                   b.bank_neve + ' (' + b.valuta + ') \u2014 ' + (b.iban || 'Nincs IBAN') + '</option>';
        }).join('');
}

function _ensureSecondBankSelector(prefix) {
    var containerId = prefix + '-transfer-bank-2-wrapper';
    if (document.getElementById(containerId)) return;

    var section = document.getElementById(prefix + '-transfer-bank-section');
    if (!section) return;

    var wrapper = document.createElement('div');
    wrapper.id = containerId;
    wrapper.className = 'mt-2';
    wrapper.innerHTML =
        '<label class="form-label fw-bold" style="color:#7e57c2;">Cél bankszámla *</label>' +
        '<select id="' + prefix + '-transfer-bankszamla-2" class="form-select" style="border-color:#7e57c2;">' +
        '<option value="">-- Válasszon cél bankszámlát --</option></select>';

    // Valutacsere szekció elé szúrjuk
    var valutaSection = document.getElementById(prefix + '-valutacsere-section');
    if (valutaSection) {
        section.insertBefore(wrapper, valutaSection);
    } else {
        section.appendChild(wrapper);
    }

    // Feltöltés
    _fillBankSelect(wrapper.querySelector('select'));
}

function _removeSecondBankSelector(prefix) {
    var wrapper = document.getElementById(prefix + '-transfer-bank-2-wrapper');
    if (wrapper) wrapper.remove();
}


// ============================================================================
// 6. VALUTACSERE KALKULÁTOR
// ============================================================================

window._calcTransferRate = function(prefix) {
    var ronAmount = _getCurrentAmount(prefix);
    var celOsszeg = parseFloat(document.getElementById(prefix + '-cel-osszeg')?.value) || 0;
    var arfolyamEl = document.getElementById(prefix + '-arfolyam');
    var previewEl = document.getElementById(prefix + '-arfolyam-preview');

    if (ronAmount > 0 && celOsszeg > 0) {
        var rate = ronAmount / celOsszeg;
        if (arfolyamEl) arfolyamEl.value = rate.toFixed(4);
        if (previewEl) previewEl.textContent = celOsszeg.toFixed(2) + ' EUR \u00d7 ' + rate.toFixed(4) + ' = ' + ronAmount.toFixed(2) + ' RON';
    }
};

window._calcTransferAmount = function(prefix) {
    var ronAmount = _getCurrentAmount(prefix);
    var arfolyam = parseFloat(document.getElementById(prefix + '-arfolyam')?.value) || 0;
    var celOsszegEl = document.getElementById(prefix + '-cel-osszeg');
    var previewEl = document.getElementById(prefix + '-arfolyam-preview');

    if (arfolyam > 0 && ronAmount > 0) {
        var celOsszeg = ronAmount / arfolyam;
        if (celOsszegEl) celOsszegEl.value = celOsszeg.toFixed(2);
        if (previewEl) previewEl.textContent = celOsszeg.toFixed(2) + ' EUR \u00d7 ' + arfolyam.toFixed(4) + ' = ' + ronAmount.toFixed(2) + ' RON';
    }
};

function _getCurrentAmount(prefix) {
    if (prefix === 'b') {
        return (window.currentIncomeRows || []).reduce(function(s, r) { return s + (Number(r.amount) || 0); }, 0);
    } else {
        var isSplit = document.getElementById('chk-expense-split')?.checked;
        if (isSplit) {
            return (window.currentExpenseRows || []).reduce(function(s, r) { return s + (Number(r.amount) || 0); }, 0);
        }
        return parseFloat(document.getElementById('k-osszeg')?.value) || 0;
    }
}


// ============================================================================
// 7. MENTÉS — EGYSÉGES
// ============================================================================

window.saveUnifiedTransaction = async function() {
    var btn = document.getElementById('btn-unified-save');
    var origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Ment\u00e9s...';
    btn.disabled = true;

    try {
        var authRes = await _supabase.auth.getUser();
        var user = authRes.data.user;
        if (!user) throw new Error('Nincs bejelentkezett felhasználó!');

        var today = new Date().toISOString().split('T')[0];
        var incomeRecords = [];
        var expenseRecords = [];

        // ── BEVÉTEL GYŰJTÉS ─────────────────────────────────────
        if (_unifiedBatchMode) {
            incomeRecords = _collectBatchIncomeRecords(user, today);
        } else {
            incomeRecords = _collectSingleIncomeRecords(user, today);
        }

        // ── KIADÁS GYŰJTÉS ──────────────────────────────────────
        if (_unifiedBatchMode) {
            expenseRecords = _collectBatchExpenseRecords(user, today);
        } else {
            expenseRecords = _collectExpenseRecords(user, today);
        }

        // Legalább egy oldalt ki kell tölteni
        if (incomeRecords.length === 0 && expenseRecords.length === 0) {
            alert('Nincs mentendő tétel! Töltse ki legalább az egyik fület.');
            return;
        }

        // ── BELSŐ MOZGÁS PÁROK GENERÁLÁSA ───────────────────────
        var transferIncomes = incomeRecords.filter(function(r) { return r._isTransfer; });
        var transferExpenses = expenseRecords.filter(function(r) { return r._isTransfer; });

        transferIncomes.forEach(function(r) {
            var bmKey = 'BM-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
            r.belso_mozgas_xkey = bmKey;
            var counterpart = _generateCounterpart(r, bmKey, 'income');
            expenseRecords.push(counterpart);
        });

        transferExpenses.forEach(function(r) {
            var bmKey = 'BM-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
            r.belso_mozgas_xkey = bmKey;
            var counterpart = _generateCounterpart(r, bmKey, 'expense');
            incomeRecords.push(counterpart);
        });

        // Belső flagek törlése insert előtt
        incomeRecords = _cleanInternalFlags(incomeRecords);
        expenseRecords = _cleanInternalFlags(expenseRecords);

        // Dátum szerinti rendezés (kronológiai sorrend az adatbázisban)
        incomeRecords.sort(function(a, b) { return a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0; });
        expenseRecords.sort(function(a, b) { return a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0; });

        // ── ADATBÁZIS INSERT ────────────────────────────────────
        if (incomeRecords.length > 0) {
            var bevResult = await _supabase.from('befizetes').insert(incomeRecords);
            if (bevResult.error) throw new Error('Bevétel mentési hiba: ' + bevResult.error.message);
        }

        if (expenseRecords.length > 0) {
            var kiaResult = await _supabase.from('kiadas').insert(expenseRecords);
            if (kiaResult.error) throw new Error('Kiadás mentési hiba: ' + kiaResult.error.message);

            // Leltár automatikus felvétel
            await _handleLeltarInsert(expenseRecords, user);
        }

        // ── MODAL BEZÁRÁS + FRISSÍTÉS ───────────────────────────
        var modalInst = bootstrap.Modal.getInstance(document.getElementById('modal-unified-transaction'));
        if (modalInst) modalInst.hide();

        if (typeof window.loadTranzakciok === 'function') await window.loadTranzakciok();
        if (typeof window.loadKasszaTransactions === 'function') await window.loadKasszaTransactions();
        if (typeof window.loadBankAccounts === 'function') await window.loadBankAccounts();

        // Árva mozgás ellenőrzés
        setTimeout(function() {
            if (typeof window.checkTransferOrphans === 'function') window.checkTransferOrphans();
        }, 500);

        // Több tételes mentésnél visszajelzés
        var totalItems = incomeRecords.length + expenseRecords.length;
        if (totalItems > 2) {
            alert('\u2705 ' + totalItems + ' tétel sikeresen rögzítve! (' + incomeRecords.length + ' bevétel, ' + expenseRecords.length + ' kiadás)');
        }

    } catch (err) {
        if (err.message === '__VALIDATION_STOP__') return;
        alert('Hiba a mentés során: ' + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
};


// ── Egyedi bevétel összegyűjtés ─────────────────────────────────────────────

function _collectSingleIncomeRecords(user, today) {
    var celId = document.getElementById('b-id_befizetescel')?.value;
    if (!celId) return [];

    var szemelyId = document.getElementById('b-id_szemely')?.value;
    var datum = document.getElementById('b-datum')?.value;
    if (!datum) return [];

    if (datum > today) {
        alert('\u26d4 Bevétel: Jövőbeli dátumot nem lehet rögzíteni!\nA dátum nem lehet nagyobb mint a mai nap (' + today + ').');
        throw new Error('__VALIDATION_STOP__');
    }
    if (window._lastRecordedDate && datum < window._lastRecordedDate) {
        alert('\u26d4 Bevétel: Visszamenőleges rögzítés nem engedélyezett!\n\nAz utolsó rögzített tétel dátuma: ' + window._lastRecordedDate + '\nA megadott dátum: ' + datum + '\n\nKérjük, használjon az utolsó rögzítés dátumánál későbbi vagy azzal megegyező dátumot!');
        throw new Error('__VALIDATION_STOP__');
    }

    // Belső mozgás detektálás (_BM: prefixű értékek)
    var transferInfo = _isTransferCel(celId, 'income');

    // Normál kategória: járulék figyelmeztetés külsős befizetőnél
    if (!transferInfo.isTransfer) {
        var celKod = window.bevCelMap ? window.bevCelMap[celId] : null;
        var celAdat = celKod ? (window.szamadasiCellek || []).find(function(c) { return c.id === celKod; }) : null;
        var isJarulek = celKod && (
            celKod === '101.01' || celKod.startsWith('101.01') ||
            (celAdat?.nev || '').toLowerCase().includes('fenntart') ||
            (celAdat?.nev || '').toLowerCase().includes('járulék')
        );

        if (!szemelyId && isJarulek) {
            var forrasInput = document.getElementById('b-forrasa-input');
            var nev = forrasInput?.value?.trim() || '';
            var confirmExt = nev
                ? confirm('\u26d4 FIGYELEM!\n\n"' + nev + '" nincs kiválasztva az egyháztag-nyilvántartásból.\n\nEgyházfenntartói járulékot csak nyilvántartott egyháztag fizethet!\n\nFolytatja KÜLSŐS BEFIZETŐKÉNT?')
                : false;
            if (!confirmExt) throw new Error('__VALIDATION_STOP__');
        }
    }

    var irattipus = document.getElementById('b-irattipus')?.value;
    var nyugta = document.getElementById('b-nyugta')?.value;
    var iratszam = (document.getElementById('b-iratszam')?.value || '').trim();
    var megjegyzes = document.getElementById('b-megjegyzes')?.value;
    var alapForras = document.getElementById('b-forrasa-input')?.value;

    // Belső mozgás: bank adatok és validáció
    var transferBankId = null;
    var transferBankId2 = null;
    var celOsszeg = null;
    var arfolyam = null;

    if (transferInfo.isTransfer) {
        if (transferInfo.transferType === 'valutacsere') {
            // Valutacsere: bankpickerből
            transferBankId = document.getElementById('b-transfer-bankszamla')?.value;
            transferBankId2 = document.getElementById('b-transfer-bankszamla-2')?.value;
            if (!transferBankId || !transferBankId2) {
                alert('Valutacserénél mindkét bankszámla kiválasztása kötelező!');
                throw new Error('__VALIDATION_STOP__');
            }
            if (transferBankId === transferBankId2) {
                alert('A forrás és a cél bankszámla nem lehet ugyanaz!');
                throw new Error('__VALIDATION_STOP__');
            }
            celOsszeg = parseFloat(document.getElementById('b-cel-osszeg')?.value) || null;
            arfolyam = parseFloat(document.getElementById('b-arfolyam')?.value) || null;
        } else {
            // kassza_bank / bank_kassza / bank_bank: bank ID-k az opció értékéből jönnek
            transferBankId = transferInfo.bankId1 ? String(transferInfo.bankId1) : null;
            transferBankId2 = transferInfo.bankId2 ? String(transferInfo.bankId2) : null;
        }
    }

    // id_befizetescel meghatározása
    var realBevCelId;
    if (transferInfo.isTransfer) {
        // Belső mozgás: a bevételi oldal kategória attól függ, készpénz vagy banki
        var bmIds = window._bmBevCelIds || {};
        if (transferInfo.transferType === 'bank_kassza') {
            realBevCelId = bmIds.keszpenz; // kassza kap készpénzt
        } else {
            realBevCelId = bmIds.banki;    // bank kap jóváírást
        }
    } else {
        realBevCelId = parseInt(celId);
    }

    var records = (window.currentIncomeRows || []).map(function(row, idx) {
        var memberObj = (window.currentHouseholdMembers || []).find(function(m) { return m.id == row.memberId; });
        var forrasNev = transferInfo.isTransfer ? 'Belső mozgás' : (memberObj ? (memberObj.csaladnev + ' ' + memberObj.k_nev) : alapForras);

        var rec = {
            xkey: 'B-' + Date.now().toString(36).toUpperCase() + '-' + idx + '-' + Math.random().toString(36).substring(2, 6),
            congregation_id: activeCongregationId,
            id_befizetescel: realBevCelId,
            datum: datum,
            irattipus: irattipus,
            nyugta: transferInfo.isTransfer ? 'Belső mozgás' : nyugta,
            iratszam: iratszam,
            megjegyzes: megjegyzes,
            fizetettev: row.year,
            osszeg: parseFloat(row.amount) || 0,
            id_szemely: transferInfo.isTransfer ? null : (row.memberId || null),
            forrasa: forrasNev,
            csalad: false,
            deleted: false,
            userid: user.id
        };

        // Bankszámla hozzárendelés
        if (transferInfo.isTransfer) {
            if (transferInfo.transferType === 'bank_kassza') {
                // bank→kassza bevétel: nem banki, hanem készpénzes (kassza oldal)
                // bankszamla_id nem kell a bevételi oldalon (kassza)
            } else if (transferInfo.transferType === 'kassza_bank') {
                // kassza→bank bevétel: NEM fordul elő bevétel oldalon (ez kiadás)
                // Ha mégis: bankszamla_id = a bank
                rec.bankszamla_id = parseInt(transferBankId);
            } else if (transferInfo.transferType === 'bank_bank') {
                // bank→bank bevétel: a cél bank (bankId2) kap jóváírást
                rec.bankszamla_id = parseInt(transferBankId2);
            } else if (transferInfo.transferType === 'valutacsere') {
                rec.bankszamla_id = parseInt(transferBankId2);
            }

            rec._isTransfer = true;
            rec._transferType = transferInfo.transferType;
            rec._transferBankId = transferBankId;
            rec._transferBankId2 = transferBankId2;
            if (celOsszeg) rec._celOsszeg = celOsszeg;
            if (arfolyam) rec._arfolyam = arfolyam;
        }

        return rec;
    });

    return records.filter(function(r) { return r.osszeg > 0; });
}


// ── Batch bevétel összegyűjtés ──────────────────────────────────────────────

function _collectBatchIncomeRecords(user, today) {
    var tbody = document.getElementById('batch-income-tbody');
    if (!tbody) return [];

    var defaultIrattipus = document.getElementById('batch-default-irattipus')?.value;
    var defaultNyugta = document.getElementById('batch-default-nyugta')?.value;

    var rows = Array.from(tbody.querySelectorAll('tr[data-row-id]'));
    if (rows.length === 0) return [];

    var records = [];
    var errors = [];

    rows.forEach(function(tr, i) {
        var id = tr.dataset.rowId;
        var rowDatum = (document.getElementById('bdatum-' + id) || {}).value;
        var celId = document.getElementById('bcel-id-' + id)?.value;
        var szemId = document.getElementById('bszem-id-' + id)?.value;
        var szemNev = (document.getElementById('bszem-text-' + id)?.value || '').trim();
        var ev = parseInt(document.getElementById('bev-' + id)?.value || new Date().getFullYear());
        var osszeg = parseFloat(document.getElementById('bosszeg-' + id)?.value);
        var irat = (document.getElementById('birat-' + id)?.value || '').trim() || null;
        var megjeg = (document.getElementById('bmegjeg-' + id)?.value || '').trim() || null;

        // Soronkénti dátum validáció
        if (!rowDatum) { errors.push((i + 1) + '. sor: Dátum megadása kötelező!'); return; }
        if (rowDatum > today) { errors.push((i + 1) + '. sor: Jövőbeli dátum nem engedélyezett!'); return; }
        if (window._lastRecordedDate && rowDatum < window._lastRecordedDate) {
            errors.push((i + 1) + '. sor: Visszamenőleges rögzítés nem engedélyezett! (utolsó: ' + window._lastRecordedDate + ')');
            return;
        }

        if (!celId) { errors.push((i + 1) + '. sor: Költségvetési tétel nincs kiválasztva!'); return; }
        if (!osszeg || osszeg <= 0) { errors.push((i + 1) + '. sor: Érvényes összeg szükséges'); return; }

        // Belső mozgás detektálás (_BM: prefixű értékek)
        var transferInfo = _isTransferCel(celId, 'income');

        if (transferInfo.isTransfer && transferInfo.transferType === 'valutacsere') {
            errors.push((i + 1) + '. sor: Valutacsere csak egyedi módban rögzíthető!');
            return;
        }

        var rec;
        if (transferInfo.isTransfer) {
            var bmIds = window._bmBevCelIds || {};
            var realBevCelId = (transferInfo.transferType === 'bank_kassza') ? bmIds.keszpenz : bmIds.banki;
            rec = {
                xkey: 'B-' + Date.now().toString(36).toUpperCase() + '-' + i + '-' + Math.random().toString(36).substring(2, 6),
                congregation_id: activeCongregationId,
                id_befizetescel: realBevCelId,
                datum: rowDatum,
                irattipus: (transferInfo.transferType === 'bank_kassza') ? 'Készpénz' : 'Banki átutalás',
                nyugta: 'Belső mozgás',
                iratszam: irat,
                fizetettev: ev,
                osszeg: osszeg,
                forrasa: 'Belső mozgás',
                megjegyzes: megjeg,
                csalad: false,
                deleted: false,
                userid: user.id,
                _isTransfer: true,
                _transferType: transferInfo.transferType,
                _transferBankId: transferInfo.bankId1 ? String(transferInfo.bankId1) : null,
                _transferBankId2: transferInfo.bankId2 ? String(transferInfo.bankId2) : null
            };
            // Bankszámla hozzárendelés
            if (transferInfo.transferType === 'bank_bank') {
                rec.bankszamla_id = parseInt(transferInfo.bankId2);
            } else if (transferInfo.transferType === 'kassza_bank') {
                rec.bankszamla_id = parseInt(transferInfo.bankId1);
            }
        } else {
            rec = {
                xkey: 'B-' + Date.now().toString(36).toUpperCase() + '-' + i + '-' + Math.random().toString(36).substring(2, 6),
                congregation_id: activeCongregationId,
                id_befizetescel: parseInt(celId),
                datum: rowDatum,
                irattipus: defaultIrattipus,
                nyugta: defaultNyugta,
                iratszam: irat,
                fizetettev: ev,
                osszeg: osszeg,
                id_szemely: szemId ? parseInt(szemId) : null,
                forrasa: szemNev || null,
                megjegyzes: megjeg,
                csalad: false,
                deleted: false,
                userid: user.id
            };
        }

        // Többéves klónozás — al-sorok alapján
        var evCount = parseInt((document.getElementById('bevcount-' + id) || {}).value) || 1;
        if (evCount > 1 && !rec._isTransfer) {
            var startEv = ev;
            for (var y = 0; y < evCount; y++) {
                var subEv = startEv + y;
                var klonRec = {};
                for (var k in rec) { klonRec[k] = rec[k]; }
                klonRec.fizetettev = subEv;
                // Al-sor összegét használjuk ha van, különben éves járulék
                var subInput = document.getElementById('bsub-' + id + '-' + subEv);
                klonRec.osszeg = subInput ? (parseFloat(subInput.value) || 0) : (window.evesJarulek > 0 ? window.evesJarulek : rec.osszeg);
                klonRec.xkey = 'B-' + Date.now().toString(36).toUpperCase() + '-' + i + 'y' + y + '-' + Math.random().toString(36).substring(2, 6);
                klonRec.megjegyzes = (rec.megjegyzes ? rec.megjegyzes + ' | ' : '') + startEv + '-' + (startEv + evCount - 1) + ' (' + (y + 1) + '/' + evCount + ')';
                records.push(klonRec);
            }
        } else {
            records.push(rec);
        }
    });

    if (errors.length > 0) {
        alert('Hibás sorok:\n\n' + errors.join('\n'));
        throw new Error('__VALIDATION_STOP__');
    }
    return records;
}


// ── Kiadás összegyűjtés ─────────────────────────────────────────────────────

function _collectExpenseRecords(user, today) {
    var celId = document.getElementById('k-id_kiadascel')?.value;
    if (!celId) return [];

    var kDatum = document.getElementById('k-datum')?.value;
    if (!kDatum) return [];

    if (kDatum > today) {
        alert('\u26d4 Kiadás: Jövőbeli dátumot nem lehet rögzíteni!\nA dátum nem lehet nagyobb mint a mai nap (' + today + ').');
        throw new Error('__VALIDATION_STOP__');
    }
    if (window._lastRecordedDate && kDatum < window._lastRecordedDate) {
        alert('\u26d4 Kiadás: Visszamenőleges rögzítés nem engedélyezett!\n\nAz utolsó rögzített tétel dátuma: ' + window._lastRecordedDate + '\nA megadott dátum: ' + kDatum + '\n\nKérjük, használjon az utolsó rögzítés dátumánál későbbi vagy azzal megegyező dátumot!');
        throw new Error('__VALIDATION_STOP__');
    }

    // Belső mozgás detektálás
    var transferInfo = _isTransferCel(celId, 'expense');

    // Bank adatok és validáció
    var transferBankId = null;
    var transferBankId2 = null;
    var celOsszeg = null;
    var arfolyam = null;

    if (transferInfo.isTransfer) {
        if (transferInfo.transferType === 'valutacsere') {
            transferBankId = document.getElementById('k-transfer-bankszamla')?.value;
            transferBankId2 = document.getElementById('k-transfer-bankszamla-2')?.value;
            if (!transferBankId || !transferBankId2) {
                alert('Valutacserénél mindkét bankszámla kiválasztása kötelező!');
                throw new Error('__VALIDATION_STOP__');
            }
            if (transferBankId === transferBankId2) {
                alert('A forrás és a cél bankszámla nem lehet ugyanaz!');
                throw new Error('__VALIDATION_STOP__');
            }
            celOsszeg = parseFloat(document.getElementById('k-cel-osszeg')?.value) || null;
            arfolyam = parseFloat(document.getElementById('k-arfolyam')?.value) || null;
        } else {
            transferBankId = transferInfo.bankId1 ? String(transferInfo.bankId1) : null;
            transferBankId2 = transferInfo.bankId2 ? String(transferInfo.bankId2) : null;
        }
    }

    // id_kiadascel meghatározása
    var realKiaCelId;
    if (transferInfo.isTransfer) {
        var bmIds = window._bmKiaCelIds || {};
        if (transferInfo.transferType === 'kassza_bank') {
            realKiaCelId = bmIds.keszpenz; // kasszából megy ki készpénz
        } else {
            realKiaCelId = bmIds.banki;    // bankról megy ki
        }
    } else {
        realKiaCelId = parseInt(celId);
    }

    var sharedXkey = 'K-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5);

    var baseRecord = {
        congregation_id: activeCongregationId,
        id_kiadascel: realKiaCelId,
        datum: kDatum,
        irattipus: document.getElementById('k-irattipus')?.value,
        nyugta: transferInfo.isTransfer ? 'Belső mozgás' : document.getElementById('k-nyugta')?.value,
        iratszam: document.getElementById('k-iratszam')?.value,
        megjegyzes: document.getElementById('k-megjegyzes')?.value || null,
        atvevo: transferInfo.isTransfer ? 'Belső mozgás' : document.getElementById('k-atvevo-input')?.value,
        atvevoid: transferInfo.isTransfer ? null : (document.getElementById('k-atvevoid')?.value ? parseInt(document.getElementById('k-atvevoid').value, 10) : null),
        deleted: false,
        userid: user.id
    };

    var isSplit = document.getElementById('chk-expense-split')?.checked;
    var records = [];

    if (!transferInfo.isTransfer && isSplit && window.currentExpenseRows && window.currentExpenseRows.length > 0) {
        window.currentExpenseRows.forEach(function(row, i) {
            records.push(Object.assign({}, baseRecord, {
                xkey: sharedXkey + '-' + i,
                osszeg: parseFloat(row.amount) || 0,
                vonatkozo_idoszak: row.period
            }));
        });
    } else {
        var osszeg = parseFloat(document.getElementById('k-osszeg')?.value) || 0;
        if (osszeg <= 0) return [];
        records.push(Object.assign({}, baseRecord, {
            xkey: sharedXkey,
            osszeg: osszeg,
            vonatkozo_idoszak: null
        }));
    }

    if (transferInfo.isTransfer) {
        // Bankszámla hozzárendelés
        records.forEach(function(r) {
            if (transferInfo.transferType === 'kassza_bank') {
                // kassza→bank kiadás: kasszából megy, bankszamla_id = cél bank
                r.bankszamla_id = parseInt(transferBankId);
            } else if (transferInfo.transferType === 'bank_kassza') {
                // bank→kassza kiadás: NEM jellemző kiadás oldalon
            } else if (transferInfo.transferType === 'bank_bank') {
                // bank→bank kiadás: forrás bank (bankId1) veszít
                r.bankszamla_id = parseInt(transferBankId);
            } else if (transferInfo.transferType === 'valutacsere') {
                r.bankszamla_id = parseInt(transferBankId);
            }

            r._isTransfer = true;
            r._transferType = transferInfo.transferType;
            r._transferBankId = transferBankId;
            r._transferBankId2 = transferBankId2;
            if (celOsszeg) r._celOsszeg = celOsszeg;
            if (arfolyam) r._arfolyam = arfolyam;
        });
    }

    return records.filter(function(r) { return r.osszeg > 0; });
}


// ============================================================================
// 8. BELSŐ MOZGÁS PÁR GENERÁLÁS (KETTŐS KÖNYVELÉS)
// ============================================================================

function _generateCounterpart(record, bmKey, sourceSide) {
    var transferType = record._transferType;
    var transferBankId = record._transferBankId;
    var transferBankId2 = record._transferBankId2;
    var bankNev1 = _getBankName(transferBankId);
    var bankNev2 = _getBankName(transferBankId2);
    var bmBev = window._bmBevCelIds || {};
    var bmKia = window._bmKiaCelIds || {};

    if (sourceSide === 'income') {
        // Bevétel → pár kiadás (kiadas) létrehozása
        // Ha bevétel = bank_kassza (kassza kapott pénzt) → pár kiadás = bank terhelés
        // Ha bevétel = bank_bank (cél bank kapott) → pár kiadás = forrás bank terhelés
        var counterKiaCelId;
        var counterBankId = null;
        var counterIrattipus;
        var megjegyzes;

        if (transferType === 'bank_kassza') {
            counterKiaCelId = bmKia.banki;  // bank oldal terhelés
            counterBankId = parseInt(transferBankId);
            counterIrattipus = 'Banki átutalás';
            megjegyzes = 'Belső mozgás — készpénzfelvétel ' + bankNev1;
        } else if (transferType === 'bank_bank') {
            counterKiaCelId = bmKia.banki;  // forrás bank terhelés
            counterBankId = parseInt(transferBankId);
            counterIrattipus = 'Banki átutalás';
            megjegyzes = 'Belső mozgás — ' + bankNev1 + ' → ' + bankNev2;
        } else if (transferType === 'valutacsere') {
            counterKiaCelId = bmKia.banki;
            counterBankId = parseInt(transferBankId);
            counterIrattipus = 'Banki átutalás';
            megjegyzes = 'Valutacsere, árfolyam: ' + (record._arfolyam || '?');
        } else {
            // kassza_bank bevétel oldalon nem jellemző, de kezeljük
            counterKiaCelId = bmKia.keszpenz;
            counterIrattipus = 'Készpénz';
            megjegyzes = 'Belső mozgás — ' + bankNev1;
        }

        return {
            xkey: 'K-PAIR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6),
            congregation_id: record.congregation_id,
            id_kiadascel: counterKiaCelId,
            datum: record.datum,
            osszeg: record.osszeg,
            irattipus: counterIrattipus,
            bankszamla_id: counterBankId,
            nyugta: 'Belső mozgás',
            iratszam: '',
            atvevo: 'Belső mozgás',
            megjegyzes: megjegyzes,
            belso_mozgas_xkey: bmKey,
            deleted: false,
            userid: record.userid
        };

    } else {
        // Kiadás → pár bevétel (befizetes) létrehozása
        // Ha kiadás = kassza_bank (kasszából ment) → pár bevétel = bank jóváírás
        // Ha kiadás = bank_bank (forrás bankból ment) → pár bevétel = cél bank jóváírás
        var counterBevCelId;
        var counterBankIdB = null;
        var counterIrattipusB;
        var megjegyzesB;

        if (transferType === 'kassza_bank') {
            counterBevCelId = bmBev.banki;  // bank oldal jóváírás
            counterBankIdB = parseInt(transferBankId);
            counterIrattipusB = 'Banki átutalás';
            megjegyzesB = 'Belső mozgás — készpénzletétel ' + bankNev1;
        } else if (transferType === 'bank_bank') {
            counterBevCelId = bmBev.banki;  // cél bank jóváírás
            counterBankIdB = parseInt(transferBankId2);
            counterIrattipusB = 'Banki átutalás';
            megjegyzesB = 'Belső mozgás — ' + bankNev1 + ' → ' + bankNev2;
        } else if (transferType === 'valutacsere') {
            counterBevCelId = bmBev.banki;
            counterBankIdB = parseInt(transferBankId2);
            counterIrattipusB = 'Banki átutalás';
            megjegyzesB = 'Valutacsere, árfolyam: ' + (record._arfolyam || '?');
        } else {
            // bank_kassza kiadás oldalon nem jellemző, de kezeljük
            counterBevCelId = bmBev.keszpenz;
            counterIrattipusB = 'Készpénz';
            megjegyzesB = 'Belső mozgás — ' + bankNev1;
        }

        return {
            xkey: 'B-PAIR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6),
            congregation_id: record.congregation_id,
            id_befizetescel: counterBevCelId,
            datum: record.datum,
            fizetettev: new Date().getFullYear(),
            osszeg: (transferType === 'valutacsere' && record._celOsszeg) ? record._celOsszeg : record.osszeg,
            irattipus: counterIrattipusB,
            bankszamla_id: counterBankIdB,
            nyugta: 'Belső mozgás',
            iratszam: '',
            forrasa: 'Belső mozgás',
            csalad: false,
            megjegyzes: megjegyzesB,
            belso_mozgas_xkey: bmKey,
            deleted: false,
            userid: record.userid
        };
    }
}

function _getBankName(bankId) {
    if (!bankId) return 'Bank';
    var acc = (window.bankAccounts || []).find(function(b) { return String(b.id) === String(bankId); });
    return acc ? (acc.bank_neve + ' (' + acc.valuta + ')') : 'Bank';
}

// _findCounterpartCelId már nem szükséges — a _bmBevCelIds/_bmKiaCelIds globálokat használjuk
function _findCounterpartCelId(celId, sourceSide) {
    var sourceMap = sourceSide === 'income' ? window.bevCelMap : window.kiaCelMap;
    var kod = sourceMap ? sourceMap[celId] : null;
    if (!kod) return null;

    var cell = (window.szamadasiCellek || []).find(function(c) { return c.id === kod; });
    if (!cell) return null;
    var nev = (cell.nev || '').toLowerCase();

    // Kulcsszavak a belső mozgás kategóriákhoz
    var keywords = ['készpénz', 'banki', 'valuta', 'deviza'];
    var matchedKeyword = keywords.find(function(kw) { return nev.includes(kw); });
    if (!matchedKeyword) return null;

    // Ellentétes oldali kategória keresés
    var targetSide = sourceSide === 'income' ? 'K' : 'B';
    var targetMap = sourceSide === 'income' ? window.kiaCelMap : window.bevCelMap;

    // Invertált map: szamadasicel kód → target integer id
    var invertedMap = {};
    if (targetMap) {
        Object.keys(targetMap).forEach(function(intId) {
            invertedMap[targetMap[intId]] = intId;
        });
    }

    // Név-alapú egyezés keresés
    var matchCell = (window.szamadasiCellek || []).find(function(c) {
        if (c.type !== targetSide || !c.iscel) return false;
        var cn = (c.nev || '').toLowerCase();
        return cn.includes(matchedKeyword);
    });

    if (matchCell && invertedMap[matchCell.id]) {
        return parseInt(invertedMap[matchCell.id]);
    }

    return null;
}


// ============================================================================
// 9. LELTÁR AUTOMATIKUS FELVÉTEL
// ============================================================================

async function _handleLeltarInsert(expenseRecords, user) {
    var leltarChk = document.getElementById('chk-leltar-koto');
    if (!leltarChk || !leltarChk.checked) return;

    // Csak nem-belső-mozgás kiadásokra
    var normalExpenses = expenseRecords.filter(function(r) { return !r.belso_mozgas_xkey; });
    if (normalExpenses.length === 0) return;

    var osszesErtek = normalExpenses.reduce(function(s, r) { return s + (r.osszeg || 0); }, 0);
    var leltarName = document.getElementById('k-leltar-megnevezes')?.value ||
                     document.getElementById('k-megjegyzes')?.value || 'Új pénztári beszerzés';
    var bizTipus = document.getElementById('k-nyugta')?.value || 'Nyugta';
    var bizSzam = document.getElementById('k-iratszam')?.value;
    var bizonylat = bizSzam ? (bizTipus + ' ' + bizSzam) : bizTipus;

    await _supabase.from('leltar_tetelek').insert([{
        congregation_id: activeCongregationId,
        kategoria: 'Várólista',
        megnevezes: leltarName,
        leltari_szam: 'FÜGGŐ',
        penzugy_xkey: normalExpenses[0].xkey,
        beszerzes_datuma: normalExpenses[0].datum,
        beszerzes_bizonylat: bizonylat,
        beszerzesi_ertek: osszesErtek,
        mennyiseg: 1,
        mertekegyseg: 'db',
        is_deleted: false,
        userid: user.id
    }]);
}


// ============================================================================
// 10. BELSŐ FLAGEK TÖRLÉSE (INSERT ELŐTT)
// ============================================================================

function _cleanInternalFlags(records) {
    return records.map(function(r) {
        var clean = Object.assign({}, r);
        delete clean._isTransfer;
        delete clean._transferType;
        delete clean._transferBankId;
        delete clean._transferBankId2;
        delete clean._celOsszeg;
        delete clean._arfolyam;
        return clean;
    });
}


// ============================================================================
// 11. BADGE ÉS STAGING INFO FRISSÍTÉS
// ============================================================================

function _updateUnifiedBadges(incomeCount, expenseCount) {
    var iBadge = document.getElementById('utab-income-badge');
    var eBadge = document.getElementById('utab-expense-badge');

    if (iBadge) {
        iBadge.textContent = incomeCount;
        iBadge.classList.toggle('d-none', incomeCount === 0);
    }
    if (eBadge) {
        eBadge.textContent = expenseCount;
        eBadge.classList.toggle('d-none', expenseCount === 0);
    }

    var info = document.getElementById('unified-staging-info');
    if (info) {
        var parts = [];
        if (incomeCount > 0) parts.push('Bevétel: ' + incomeCount + ' tétel');
        if (expenseCount > 0) parts.push('Kiadás: ' + expenseCount + ' tétel');
        info.textContent = parts.join(' | ');
    }
}


// ============================================================================
// 12. MODAL BEZÁRÁSKORI CLEANUP
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    var modalEl = document.getElementById('modal-unified-transaction');
    if (!modalEl) return;

    modalEl.addEventListener('hidden.bs.modal', function() {
        // Batch mód reset
        if (_unifiedBatchMode) {
            _unifiedBatchMode = false;
            document.getElementById('single-income-view')?.classList.remove('d-none');
            document.getElementById('batch-income-view')?.classList.add('d-none');
            document.getElementById('single-expense-view')?.classList.remove('d-none');
            document.getElementById('batch-expense-view')?.classList.add('d-none');
            var toggleBtn = document.getElementById('btn-toggle-batch-mode');
            if (toggleBtn) toggleBtn.innerHTML = '<i class="ti ti-table me-1"></i>T\u00e1bl\u00e1zatos m\u00f3d';
        }

        // Batch sorok törlés + counter reset
        var tbody = document.getElementById('batch-income-tbody');
        if (tbody) tbody.innerHTML = '';
        var etbody = document.getElementById('batch-expense-tbody');
        if (etbody) etbody.innerHTML = '';
        if (typeof window._resetBatchRowCounter === 'function') window._resetBatchRowCounter();
        _batchExpenseRowCounter = 0;

        // Belső mozgás szekciók reset
        document.getElementById('b-transfer-bank-section')?.classList.add('d-none');
        document.getElementById('k-transfer-bank-section')?.classList.add('d-none');
        document.getElementById('b-valutacsere-section')?.classList.add('d-none');
        document.getElementById('k-valutacsere-section')?.classList.add('d-none');
        _removeSecondBankSelector('b');
        _removeSecondBankSelector('k');

        // Lebegő legördülő elrejtése (batch módból)
        var dd = document.getElementById('batch-float-dd');
        if (dd) dd.style.display = 'none';

        // Batch összegző frissítés
        if (typeof window._batchUpdateSummary === 'function') window._batchUpdateSummary();
        if (typeof window._batchExpenseUpdateSummary === 'function') window._batchExpenseUpdateSummary();
    });

    // Megnyitáskor: utolsó nyugtaszám betöltése
    modalEl.addEventListener('show.bs.modal', function() {
        if (typeof window.loadLastReceiptData === 'function') window.loadLastReceiptData();
    });
});


// ============================================================================
// 13. KIADÁS TÁBLÁZATOS MÓD (BATCH)
// ============================================================================

var _batchExpenseRowCounter = 0;
var _batchExpActiveRowId    = null;
var _batchExpActiveDdType   = null;
var _batchExpLastKeyWasDel  = false;
var _batchExpDdFocusIdx     = -1;

// ── Lebegő legördülő (újrahasznosítjuk a bevételi float-dd-t) ────────────

function _batchExpGetFloatDd() {
    var dd = document.getElementById('batch-exp-float-dd');
    if (!dd) {
        dd = document.createElement('div');
        dd.id = 'batch-exp-float-dd';
        dd.className = 'list-group shadow-lg';
        dd.style.cssText = 'position:fixed;z-index:99999;display:none;max-height:240px;overflow-y:auto;background:#fff;border:1px solid #dee2e6;border-radius:4px;';
        dd.addEventListener('mousedown', function(e) { e.preventDefault(); });
        document.body.appendChild(dd);
    }
    return dd;
}

function _batchExpShowDdAt(inputEl, html) {
    var dd   = _batchExpGetFloatDd();
    var rect = inputEl.getBoundingClientRect();
    dd.innerHTML   = html;
    dd.style.left  = rect.left + 'px';
    dd.style.top   = (rect.bottom + 2) + 'px';
    dd.style.width = Math.max(rect.width, 240) + 'px';
    dd.style.display = 'block';
    _batchExpDdFocusIdx = -1;
}

function _batchExpHideDd() {
    var dd = document.getElementById('batch-exp-float-dd');
    if (dd) dd.style.display = 'none';
    _batchExpActiveRowId  = null;
    _batchExpActiveDdType = null;
    _batchExpDdFocusIdx   = -1;
}

function _batchExpDdMoveFocus(dir) {
    var dd = document.getElementById('batch-exp-float-dd');
    if (!dd || dd.style.display === 'none') return false;
    var btns = dd.querySelectorAll('button');
    if (!btns.length) return false;
    _batchExpDdFocusIdx = Math.max(0, Math.min(_batchExpDdFocusIdx + dir, btns.length - 1));
    btns.forEach(function(b, i) { b.classList.toggle('active', i === _batchExpDdFocusIdx); });
    btns[_batchExpDdFocusIdx].scrollIntoView({ block: 'nearest' });
    return true;
}

// ── Kiadás jogcím opciók ────────────────────────────────────────────────

function _batchExpGetCelOptions() {
    var sel = document.getElementById('k-id_kiadascel');
    if (!sel) return [];
    return Array.from(sel.options)
        .filter(function(o) { return o.value && (o.text.includes(' - ') || o.value.startsWith('_BM:')); })
        .map(function(o) {
            if (o.value.startsWith('_BM:')) {
                return { id: o.value, name: o.text.trim() };
            }
            return { id: o.value, name: o.text.split(' - ').slice(1).join(' - ').trim() };
        });
}

// ── Egy sor HTML-je (kiadás) ────────────────────────────────────────────

function _batchExpenseRowHtml(rowNum) {
    var id = ++_batchExpenseRowCounter;
    var tbody = document.getElementById('batch-expense-tbody');
    var prevCelText = '', prevCelId = '', prevDatum = '';
    if (tbody && tbody.lastElementChild) {
        var lastId = tbody.lastElementChild.dataset.rowId;
        if (lastId) {
            prevCelText = (document.getElementById('kcel-text-' + lastId) || {}).value || '';
            prevCelId   = (document.getElementById('kcel-id-' + lastId) || {}).value   || '';
            prevDatum   = (document.getElementById('kdatum-' + lastId) || {}).value || '';
        }
    }
    if (!prevDatum) {
        prevDatum = new Date().toISOString().split('T')[0];
    }
    return '<tr id="batch-exp-tr-' + id + '" data-row-id="' + id + '">' +
        '<td class="text-center text-muted small align-middle fw-bold">' + rowNum + '</td>' +
        '<td class="p-1">' +
            '<input type="date" id="kdatum-' + id + '"' +
                ' class="form-control form-control-sm"' +
                ' value="' + prevDatum + '"' +
                ' onchange="window._batchCheckRowDate(' + id + ',\'kia\')"' +
                ' onkeydown="window._batchExpFieldKeydown(event,\'kcel-text-' + id + '\')">' +
            '<div id="kdatum-badge-' + id + '" class="mt-1"></div>' +
        '</td>' +
        '<td class="p-1">' +
            '<input type="text" id="kcel-text-' + id + '"' +
                ' class="form-control form-control-sm"' +
                ' placeholder="Pl. Közüzemi..."' +
                ' value="' + prevCelText.replace(/"/g, '&quot;') + '"' +
                ' autocomplete="off"' +
                ' onkeydown="window._batchExpCelKeydown(event,' + id + ')"' +
                ' oninput="window._batchExpCelInput(this,' + id + ')"' +
                ' onfocus="window._batchExpCelFocus(this,' + id + ')"' +
                ' onblur="setTimeout(function(){if(_batchExpActiveDdType===\'cel\'&&_batchExpActiveRowId===' + id + ')_batchExpHideDd();},200)">' +
            '<input type="hidden" id="kcel-id-' + id + '" value="' + prevCelId + '">' +
        '</td>' +
        '<td class="p-1">' +
            '<input type="text" id="katvevo-text-' + id + '"' +
                ' class="form-control form-control-sm"' +
                ' placeholder="Partner neve..."' +
                ' autocomplete="off"' +
                ' onkeydown="window._batchExpPartnerKeydown(event,' + id + ')"' +
                ' oninput="window._batchExpPartnerInput(this,' + id + ')"' +
                ' onfocus="_batchExpActiveRowId=' + id + ';_batchExpActiveDdType=\'partner\';"' +
                ' onblur="setTimeout(function(){if(_batchExpActiveDdType===\'partner\'&&_batchExpActiveRowId===' + id + ')_batchExpHideDd();},200)">' +
            '<input type="hidden" id="katvevo-id-' + id + '" value="">' +
        '</td>' +
        '<td class="p-1">' +
            '<input type="number" id="kosszeg-' + id + '"' +
                ' class="form-control form-control-sm text-end text-danger fw-bold"' +
                ' placeholder="0.00" step="0.01" min="0"' +
                ' oninput="window._batchExpenseUpdateSummary()"' +
                ' onkeydown="window._batchExpFieldKeydown(event,\'kirat-' + id + '\')">' +
        '</td>' +
        '<td class="p-1">' +
            '<input type="text" id="kirat-' + id + '"' +
                ' class="form-control form-control-sm"' +
                ' placeholder="Pl. F-2026/01"' +
                ' onkeydown="window._batchExpFieldKeydown(event,\'knyugta-' + id + '\')"' +
                ' onblur="window._batchCheckIratszam(' + id + ',\'kia\')">' +
            '<div id="kirat-badge-' + id + '" class="mt-1"></div>' +
        '</td>' +
        '<td class="p-1">' +
            '<select id="knyugta-' + id + '" class="form-select form-select-sm"' +
                ' onkeydown="window._batchExpFieldKeydown(event,\'kmegjeg-' + id + '\')">' +
                '<option value="Factură (Számla)">Factură</option>' +
                '<option value="Chitanță (Nyugta)">Chitanță</option>' +
                '<option value="Bon fiscal">Bon fiscal</option>' +
                '<option value="Dispoziție de plată">Disp. plată</option>' +
                '<option value="Extras de cont (Kivonat)">Bankkivonat</option>' +
                '<option value="Stat de plată (Bérjegyzék)">Bérjegyzék</option>' +
                '<option value="Egyéb">Egyéb</option>' +
            '</select>' +
        '</td>' +
        '<td class="p-1">' +
            '<input type="text" id="kmegjeg-' + id + '"' +
                ' class="form-control form-control-sm"' +
                ' placeholder="Megjegyzés..."' +
                ' onkeydown="window._batchExpMegjegKeydown(event,' + id + ')">' +
        '</td>' +
        '<td class="p-1 text-center align-middle">' +
            '<button type="button" class="btn btn-sm btn-icon btn-outline-danger"' +
                ' onclick="window.removeBatchExpenseRow(' + id + ')" title="Sor törlése">' +
                '<i class="ti ti-x"></i>' +
            '</button>' +
        '</td>' +
    '</tr>';
}

// ── Sor hozzáadása ──────────────────────────────────────────────────────

window.addBatchExpenseRow = function() {
    var tbody = document.getElementById('batch-expense-tbody');
    if (!tbody) return;
    var rowNum = tbody.children.length + 1;
    tbody.insertAdjacentHTML('beforeend', _batchExpenseRowHtml(rowNum));
    var newId = _batchExpenseRowCounter;
    var firstInput = document.getElementById('kcel-text-' + newId);
    if (firstInput) firstInput.focus();
    window._batchExpenseUpdateSummary();
};

// ── Sor törlése ─────────────────────────────────────────────────────────

window.removeBatchExpenseRow = function(id) {
    var tr = document.getElementById('batch-exp-tr-' + id);
    if (tr) tr.remove();
    var tbody = document.getElementById('batch-expense-tbody');
    if (tbody) {
        Array.from(tbody.children).forEach(function(tr, i) {
            var fc = tr.querySelector('td:first-child');
            if (fc) fc.textContent = i + 1;
        });
    }
    window._batchExpenseUpdateSummary();
};

// ── Összesítő frissítése ────────────────────────────────────────────────

window._batchExpenseUpdateSummary = function() {
    var tbody = document.getElementById('batch-expense-tbody');
    if (!tbody) return;
    var total = 0;
    var rows = tbody.querySelectorAll('tr[data-row-id]');
    rows.forEach(function(tr) {
        total += parseFloat((document.getElementById('kosszeg-' + tr.dataset.rowId) || {}).value || 0) || 0;
    });
    var countEl = document.getElementById('batch-expense-row-count');
    var totalEl = document.getElementById('batch-expense-total-sum');
    if (countEl) countEl.textContent = rows.length + ' sor';
    if (totalEl) totalEl.textContent = 'Összesen: ' + total.toLocaleString('hu-HU', { minimumFractionDigits: 2 }) + ' RON';
};

// ── Általános mező Enter → fókusz következő mezőre ─────────────────────

window._batchExpFieldKeydown = function(event, nextId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        var el = document.getElementById(nextId);
        if (el) el.focus();
    }
};

// ── Megjegyzés mező Enter → következő sor / új sor ─────────────────────

window._batchExpMegjegKeydown = function(event, rowId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        var tbody = document.getElementById('batch-expense-tbody');
        if (!tbody) { window.addBatchExpenseRow(); return; }
        var rows = Array.from(tbody.querySelectorAll('tr[data-row-id]'));
        var currentIdx = rows.findIndex(function(tr) { return tr.dataset.rowId == rowId; });
        if (currentIdx >= 0 && currentIdx < rows.length - 1) {
            var nextRowId = rows[currentIdx + 1].dataset.rowId;
            var nextEl = document.getElementById('kcel-text-' + nextRowId);
            if (nextEl) nextEl.focus();
        } else {
            window.addBatchExpenseRow();
        }
    }
};

// ── Jogcím (Költségvetési tétel) kezelők ────────────────────────────────

window._batchExpCelFocus = function(input, rowId) {
    _batchExpActiveRowId  = rowId;
    _batchExpActiveDdType = 'cel';
    _batchExpShowCelList(input, rowId);
};

window._batchExpCelKeydown = function(event, rowId) {
    if (event.key === 'Backspace' || event.key === 'Delete') {
        _batchExpLastKeyWasDel = true;
        var hiddenEl = document.getElementById('kcel-id-' + rowId);
        if (hiddenEl) hiddenEl.value = '';
        return;
    }
    _batchExpLastKeyWasDel = false;

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (_batchExpDdMoveFocus(1)) _batchExpApplyDdFocusToCel(rowId);
        return;
    }
    if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (_batchExpDdMoveFocus(-1)) _batchExpApplyDdFocusToCel(rowId);
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        var dd = document.getElementById('batch-exp-float-dd');
        if (dd && dd.style.display !== 'none' && _batchExpDdFocusIdx >= 0) {
            var btn = dd.querySelectorAll('button')[_batchExpDdFocusIdx];
            if (btn) { btn.dispatchEvent(new MouseEvent('mousedown')); return; }
        }
        _batchExpHideDd();
        var nextEl = document.getElementById('katvevo-text-' + rowId);
        if (nextEl) nextEl.focus();
    }
    if (event.key === 'Escape') _batchExpHideDd();
};

window._batchExpCelInput = function(input, rowId) {
    _batchExpActiveRowId  = rowId;
    _batchExpActiveDdType = 'cel';
    var hiddenEl = document.getElementById('kcel-id-' + rowId);
    if (hiddenEl) hiddenEl.value = '';

    if (_batchExpLastKeyWasDel) {
        _batchExpShowCelList(input, rowId);
        return;
    }
    var q = input.value;
    if (!q.trim()) { _batchExpShowCelList(input, rowId); return; }

    var opts  = _batchExpGetCelOptions();
    var first = opts.find(function(o) { return o.name.toLowerCase().startsWith(q.toLowerCase()); });
    if (first) {
        var fill = q + first.name.substring(q.length);
        input.value = fill;
        input.setSelectionRange(q.length, fill.length);
        if (hiddenEl) hiddenEl.value = first.id;
    }
    _batchExpShowCelList(input, rowId);
};

function _batchExpShowCelList(input, rowId) {
    var typedLen = (input.selectionStart < input.selectionEnd) ? input.selectionStart : input.value.length;
    var q = input.value.substring(0, typedLen).trim().toLowerCase();
    var opts = _batchExpGetCelOptions();
    var matches = q.length === 0 ? opts : opts.filter(function(o) { return o.name.toLowerCase().includes(q); });

    if (matches.length === 0) {
        _batchExpShowDdAt(input, '<div class="list-group-item text-muted small py-2">Nincs találat</div>');
        return;
    }
    _batchExpShowDdAt(input, matches.slice(0, 50).map(function(o) {
        return '<button type="button" class="list-group-item list-group-item-action py-2 small"' +
               ' data-cel-id="' + o.id + '" data-cel-name="' + o.name.replace(/"/g, '&quot;') + '"' +
               ' onmousedown="window._batchExpCelSelect(' + rowId + ',\'' + o.id + '\',\'' + o.name.replace(/'/g, "\\'") + '\')">' +
               o.name + '</button>';
    }).join(''));
}

function _batchExpApplyDdFocusToCel(rowId) {
    var dd = document.getElementById('batch-exp-float-dd');
    if (!dd || _batchExpDdFocusIdx < 0) return;
    var btn = dd.querySelectorAll('button')[_batchExpDdFocusIdx];
    if (!btn) return;
    var name  = btn.dataset.celName || btn.textContent.trim();
    var celId = btn.dataset.celId   || '';
    var input = document.getElementById('kcel-text-' + rowId);
    if (input) { input.value = name; input.setSelectionRange(name.length, name.length); }
    var hiddenEl = document.getElementById('kcel-id-' + rowId);
    if (hiddenEl) hiddenEl.value = celId;
}

window._batchExpCelSelect = function(rowId, celId, celName) {
    var textEl   = document.getElementById('kcel-text-' + rowId);
    var hiddenEl = document.getElementById('kcel-id-' + rowId);
    if (textEl)   { textEl.value = celName; textEl.setSelectionRange(celName.length, celName.length); }
    if (hiddenEl) hiddenEl.value = celId;
    _batchExpHideDd();

    // Iratszám auto-kitöltés (kiadás)
    var iratEl = document.getElementById('kirat-' + rowId);
    if (iratEl && !iratEl.value) {
        if (celId.startsWith('_BM:')) {
            var currYear = new Date().getFullYear();
            iratEl.value = 'BM-' + (window._nextTransferNum + window._batchTransferOffset) + '/' + currYear;
            window._batchTransferOffset++;
        }
    }

    var nextEl = document.getElementById('katvevo-text-' + rowId);
    if (nextEl) nextEl.focus();
};

// ── Partner / Átvevő autocomplete kezelők ───────────────────────────────

window._batchExpPartnerKeydown = function(event, rowId) {
    if (event.key === 'ArrowDown') { event.preventDefault(); _batchExpDdMoveFocus(1);  return; }
    if (event.key === 'ArrowUp')   { event.preventDefault(); _batchExpDdMoveFocus(-1); return; }
    if (event.key === 'Enter') {
        event.preventDefault();
        var dd = document.getElementById('batch-exp-float-dd');
        if (dd && dd.style.display !== 'none' && _batchExpDdFocusIdx >= 0) {
            var btn = dd.querySelectorAll('button')[_batchExpDdFocusIdx];
            if (btn) { btn.dispatchEvent(new MouseEvent('mousedown')); return; }
        }
        _batchExpHideDd();
        var nextEl = document.getElementById('kosszeg-' + rowId);
        if (nextEl) nextEl.focus();
    }
    if (event.key === 'Escape') _batchExpHideDd();
};

window._batchExpPartnerInput = function(input, rowId) {
    _batchExpActiveRowId  = rowId;
    _batchExpActiveDdType = 'partner';
    var hiddenEl = document.getElementById('katvevo-id-' + rowId);
    if (hiddenEl) hiddenEl.value = '';

    var q = input.value.trim();
    if (q.length < 2) { _batchExpHideDd(); return; }

    var members = (window.allChurchMembers || []).filter(function(m) {
        var full = ((m.csaladnev || '') + ' ' + (m.k_nev || '')).toLowerCase();
        return full.includes(q.toLowerCase());
    }).slice(0, 10);

    if (members.length === 0) {
        _batchExpShowDdAt(input, '<div class="list-group-item text-muted small py-2"><i class="ti ti-building-store me-1"></i>Külsős partner</div>');
        return;
    }
    var today = new Date();
    _batchExpShowDdAt(input, members.map(function(m) {
        var name = ((m.csaladnev || '') + ' ' + (m.k_nev || '')).trim();
        var ageStr = '';
        if (m.sz_datum) {
            var age = today.getFullYear() - new Date(m.sz_datum).getFullYear();
            ageStr = ' <span class="badge bg-secondary-lt text-dark">' + age + ' é</span>';
        }
        var addr = [m.adrlocality ? m.adrlocality.name : null, m.adrstreet ? m.adrstreet.name : null, m.c_szam].filter(Boolean).join(' ');
        return '<button type="button" class="list-group-item list-group-item-action py-2 small"' +
               ' onmousedown="window._batchExpPartnerSelect(' + rowId + ',' + m.id + ',\'' + name.replace(/'/g, "\\'") + '\')">' +
               '<span class="fw-bold text-danger">' + name + '</span>' + ageStr +
               (addr ? '<div class="text-muted" style="font-size:.8em"><i class="ti ti-map-pin me-1"></i>' + addr + '</div>' : '') +
               '</button>';
    }).join(''));
};

window._batchExpPartnerSelect = function(rowId, szemId, szemName) {
    var textEl   = document.getElementById('katvevo-text-' + rowId);
    var hiddenEl = document.getElementById('katvevo-id-' + rowId);
    if (textEl)   textEl.value   = szemName;
    if (hiddenEl) hiddenEl.value = szemId;
    _batchExpHideDd();
    var nextEl = document.getElementById('kosszeg-' + rowId);
    if (nextEl) nextEl.focus();
};

// ── Batch kiadás gyűjtő (mentéshez) ────────────────────────────────────

function _collectBatchExpenseRecords(user, today) {
    var tbody = document.getElementById('batch-expense-tbody');
    if (!tbody) return [];

    var defaultIrattipus = (document.getElementById('batch-expense-default-irattipus') || {}).value;

    var rows = Array.from(tbody.querySelectorAll('tr[data-row-id]'));
    if (rows.length === 0) return [];

    var records = [];
    var errors  = [];

    rows.forEach(function(tr, i) {
        var id       = tr.dataset.rowId;
        var rowDatum = (document.getElementById('kdatum-' + id) || {}).value;
        var celId    = (document.getElementById('kcel-id-' + id) || {}).value;
        var partId   = (document.getElementById('katvevo-id-' + id) || {}).value;
        var partNev  = ((document.getElementById('katvevo-text-' + id) || {}).value || '').trim();
        var osszeg   = parseFloat((document.getElementById('kosszeg-' + id) || {}).value);
        var irat     = ((document.getElementById('kirat-' + id) || {}).value || '').trim() || null;
        var rowNyugta = (document.getElementById('knyugta-' + id) || {}).value || 'Factură (Számla)';
        var megjeg   = ((document.getElementById('kmegjeg-' + id) || {}).value || '').trim() || null;

        // Soronkénti dátum validáció
        if (!rowDatum) { errors.push((i + 1) + '. sor: Dátum megadása kötelező!'); return; }
        if (rowDatum > today) { errors.push((i + 1) + '. sor: Jövőbeli dátum nem engedélyezett!'); return; }
        if (window._lastRecordedDate && rowDatum < window._lastRecordedDate) {
            errors.push((i + 1) + '. sor: Visszamenőleges rögzítés nem engedélyezett! (utolsó: ' + window._lastRecordedDate + ')');
            return;
        }

        if (!celId)               { errors.push((i + 1) + '. sor: Költségvetési tétel nincs kiválasztva!'); return; }
        if (!osszeg || osszeg <= 0) { errors.push((i + 1) + '. sor: Érvényes összeg szükséges'); return; }

        // Belső mozgás detektálás (_BM: prefixű értékek)
        var transferInfo = _isTransferCel(celId, 'expense');

        if (transferInfo.isTransfer && transferInfo.transferType === 'valutacsere') {
            errors.push((i + 1) + '. sor: Valutacsere csak egyedi módban rögzíthető!');
            return;
        }

        var rec;
        if (transferInfo.isTransfer) {
            var bmIds = window._bmKiaCelIds || {};
            var realKiaCelId = (transferInfo.transferType === 'kassza_bank') ? bmIds.keszpenz : bmIds.banki;
            rec = {
                xkey: 'K-' + Date.now().toString(36).toUpperCase() + '-' + i + '-' + Math.random().toString(36).substring(2, 6),
                congregation_id: activeCongregationId,
                id_kiadascel: realKiaCelId,
                datum:      rowDatum,
                irattipus:  (transferInfo.transferType === 'kassza_bank') ? 'Készpénz' : 'Banki átutalás',
                nyugta:     'Belső mozgás',
                iratszam:   irat,
                osszeg:     osszeg,
                atvevo:     'Belső mozgás',
                megjegyzes: megjeg,
                deleted:    false,
                userid:     user.id,
                _isTransfer: true,
                _transferType: transferInfo.transferType,
                _transferBankId: transferInfo.bankId1 ? String(transferInfo.bankId1) : null,
                _transferBankId2: transferInfo.bankId2 ? String(transferInfo.bankId2) : null
            };
            // Bankszámla hozzárendelés
            if (transferInfo.transferType === 'bank_bank') {
                rec.bankszamla_id = parseInt(transferInfo.bankId1);
            } else if (transferInfo.transferType === 'bank_kassza') {
                rec.bankszamla_id = parseInt(transferInfo.bankId1);
            }
        } else {
            rec = {
                xkey: 'K-' + Date.now().toString(36).toUpperCase() + '-' + i + '-' + Math.random().toString(36).substring(2, 6),
                congregation_id: activeCongregationId,
                id_kiadascel: parseInt(celId),
                datum:      rowDatum,
                irattipus:  defaultIrattipus,
                nyugta:     rowNyugta,
                iratszam:   irat,
                osszeg:     osszeg,
                atvevo:     partNev || null,
                atvevoid:   partId ? parseInt(partId) : null,
                megjegyzes: megjeg,
                deleted:    false,
                userid:     user.id
            };
        }
        records.push(rec);
    });

    if (errors.length > 0) {
        alert('Hibás sorok (kiadás):\n\n' + errors.join('\n'));
        throw new Error('__VALIDATION_STOP__');
    }
    return records;
}


// ============================================================================
// 14. ÁRVA BELSŐ MOZGÁS FIGYELMEZTETÉS
// ============================================================================

window.checkTransferOrphans = function() {
    var bevKeys = new Set(
        (window.allBefizetes || [])
            .filter(function(b) { return b.belso_mozgas_xkey; })
            .map(function(b) { return b.belso_mozgas_xkey; })
    );
    var kiaKeys = new Set(
        (window.allKiadas || [])
            .filter(function(k) { return k.belso_mozgas_xkey; })
            .map(function(k) { return k.belso_mozgas_xkey; })
    );

    var orphanCount = 0;
    bevKeys.forEach(function(k) { if (!kiaKeys.has(k)) orphanCount++; });
    kiaKeys.forEach(function(k) { if (!bevKeys.has(k)) orphanCount++; });

    if (orphanCount > 0) {
        console.warn('\u26a0\ufe0f ' + orphanCount + ' árva belső mozgás bejegyzés található!');
    }

    return orphanCount;
};
