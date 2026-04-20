// --- js/penzugy_expense.js ---

window.currentExpenseRows = [];
window.selectedExpensePersonId = null;

// BIZTONSÁGOS ESEMÉNYFIGYELŐ BEKÖTÉS (Induláskor)
// 🚨 ÚJ: Figyeli, hogy leltárköteles-e a kiválasztott kiadás!
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'k-id_kiadascel') {
        const sel = e.target;
        const text = sel.options[sel.selectedIndex].text.toLowerCase();
        const leltarDiv = document.getElementById('div-leltar-koto');
        const leltarChk = document.getElementById('chk-leltar-koto');

        if (leltarDiv && leltarChk) {
            // Kulcsszavak, amik aktiválják a leltár várólistát
            if (text.includes('beruházás') || text.includes('felszerelés') || text.includes('leltár') || text.includes('eszköz') || text.includes('gép') || text.includes('bútor')) {
                leltarDiv.classList.remove('d-none');
                leltarChk.checked = true;
            } else {
                leltarDiv.classList.add('d-none');
                leltarChk.checked = false;
            }
        }
    }
});

// 🚨 ÚJ: Okoskereső a Kiadásokhoz (Átvevő)
window.searchExpenseMembers = function(query) {
    document.getElementById('k-atvevoid').value = ""; 
    window.selectedExpensePersonId = null;
    
    const resultsContainer = document.getElementById('search-results-expense');
    const qRaw = query.trim();
    
    if (qRaw.length < 2) {
        resultsContainer.classList.add('d-none');
        return;
    }

    if (!window.allChurchMembers || window.allChurchMembers.length === 0) {
        resultsContainer.innerHTML = `<div class="list-group-item text-danger bg-light"><i class="ti ti-alert-triangle me-2"></i>A tagok listája még nem töltött be!</div>`;
        resultsContainer.classList.remove('d-none');
        return;
    }

    const normalizeStr = (str) => {
        if (!str) return "";
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    };
    
    const qNorm = normalizeStr(qRaw); 

    const activeMembers = window.allChurchMembers.filter(m => m.isvisible !== false && m.meghalt !== true);
    
    const matches = activeMembers.filter(m => {
        const name1 = normalizeStr(`${m.csaladnev || ''} ${m.k_nev || ''}`);
        const name2 = normalizeStr(`${m.k_nev || ''} ${m.csaladnev || ''}`); 
        return name1.includes(qNorm) || name2.includes(qNorm);
    });

    // Cégek keresése a mentett cégek között
    const companyMatches = (window._savedCompanies || []).filter(c => {
        return normalizeStr(c.nev).includes(qNorm) || (c.adoszam && normalizeStr(c.adoszam).includes(qNorm));
    });

    if (matches.length === 0 && companyMatches.length === 0) {
        resultsContainer.innerHTML = `<div class="list-group-item text-muted bg-white fw-bold border-bottom"><i class="ti ti-building-store me-2"></i>Nincs egyháztag/cég találat. (A gép Külsős Partnerként rögzíti)</div>`;
    } else {
        let html = '';
        // Cégek először
        html += companyMatches.map(c => {
            const info = c.adoszam ? `Adószám: ${c.adoszam}` : 'Cég / Szervezet';
            return `<button type="button" class="list-group-item list-group-item-action py-2 bg-white border-bottom" onclick="document.getElementById('k-atvevo-input').value='${c.nev.replace(/'/g, "\\'")}';document.getElementById('k-atvevoid').value='';document.getElementById('search-results-expense').classList.add('d-none');">
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="fw-bold text-orange" style="font-size: 1.1em;"><i class="ti ti-building me-1"></i>${c.nev}</span>
                            <span class="badge bg-orange-lt text-orange">Cég</span>
                        </div>
                        <div class="small text-muted mt-1">${info}</div>
                    </button>`;
        }).join('');
        // Személyek
        html += matches.map(m => {
            let utcaNeve = "";
            if (m.adrstreet && m.adrstreet.name) utcaNeve = m.adrstreet.name;
            else if (m.c_utcaid) utcaNeve = (window.streetCache && window.streetCache[m.c_utcaid]) ? window.streetCache[m.c_utcaid] : `Utca kód: ${m.c_utcaid}`;

            let helysegNeve = "";
            if (m.adrlocality && m.adrlocality.name) helysegNeve = m.adrlocality.name;
            else if (m.c_helysegid) helysegNeve = (window.localityCache && window.localityCache[m.c_helysegid]) ? window.localityCache[m.c_helysegid] : "";

            let cimTomb = [];
            if (helysegNeve) cimTomb.push(helysegNeve);
            if (utcaNeve) cimTomb.push(utcaNeve);
            if (m.c_szam) cimTomb.push(m.c_szam);

            const cim = cimTomb.length > 0 ? cimTomb.join(', ') : 'Nincs pontos cím rögzítve';

            return `<button type="button" class="list-group-item list-group-item-action py-2 bg-white border-bottom" onclick="window.selectMemberForExpense(${m.id}, '${m.csaladnev} ${m.k_nev}')">
                        <div class="fw-bold text-danger" style="font-size: 1.1em;">${m.csaladnev} ${m.k_nev}</div>
                        <div class="small text-dark mt-1"><i class="ti ti-home me-1 text-muted"></i>${cim}</div>
                    </button>`;
        }).join('');
        resultsContainer.innerHTML = html;
    }
    resultsContainer.classList.remove('d-none');
};

window.selectMemberForExpense = function(id, name) {
    window.selectedExpensePersonId = id;
    document.getElementById('k-atvevoid').value = id;
    document.getElementById('k-atvevo-input').value = name;
    document.getElementById('search-results-expense').classList.add('d-none');
};

window.toggleExpenseSplit = function() {
    const isSplit = document.getElementById('chk-expense-split').checked;
    const simpleCont = document.getElementById('expense-simple-container');
    const dynCont = document.getElementById('dynamic-expense-rows');
    const totalCont = document.getElementById('expense-total-container');
    const btnAdd = document.getElementById('btn-add-expense-row');
    const simpleInput = document.getElementById('k-osszeg');

    if (isSplit) {
        simpleCont.classList.add('d-none');
        simpleInput.removeAttribute('required');
        dynCont.classList.remove('d-none');
        totalCont.classList.remove('d-none');
        btnAdd.classList.remove('d-none');
        
        if (window.currentExpenseRows.length === 0) {
            window.currentExpenseRows = [{ id: Date.now(), period: '', amount: simpleInput.value || 0 }];
        }
        window.renderExpenseRows();
    } else {
        simpleCont.classList.remove('d-none');
        simpleInput.setAttribute('required', 'true');
        dynCont.classList.add('d-none');
        totalCont.classList.add('d-none');
        btnAdd.classList.add('d-none');
    }
};

window.renderExpenseRows = function() {
    const container = document.getElementById('dynamic-expense-rows');
    if (!container) return;
    
    let html = '';
    let total = 0;

    window.currentExpenseRows.forEach((row, index) => {
        total += Number(row.amount) || 0;
        html += `
        <div class="d-flex gap-2 align-items-center bg-white p-2 border rounded shadow-sm">
            <div style="flex-grow: 1;">
                <label class="form-label small text-muted mb-1">Vonatkozó időszak (pl. 2026 Január)</label>
                <input type="text" class="form-control form-control-sm border-danger" value="${row.period}" placeholder="Időszak megadása..." onchange="window.updateExpenseRow(${index}, 'period', this.value)">
            </div>
            <div style="width: 120px;">
                <label class="form-label small text-muted mb-1">Összeg</label>
                <input type="number" step="0.01" class="form-control form-control-sm text-end fw-bold text-danger border-danger" value="${row.amount}" onchange="window.updateExpenseRow(${index}, 'amount', this.value)">
            </div>
            <div style="width: 35px; padding-top: 22px;">
                ${window.currentExpenseRows.length > 1 ? `<button type="button" class="btn btn-sm btn-icon btn-outline-danger" onclick="window.removeExpenseRow(${index})" title="Tétel törlése"><i class="ti ti-trash"></i></button>` : ''}
            </div>
        </div>`;
    });

    container.innerHTML = html;
    document.getElementById('k-total-sum').innerText = total.toFixed(2);
};

window.addExpenseRow = function() {
    if (!window.currentExpenseRows) window.currentExpenseRows = [];
    window.currentExpenseRows.push({ id: Date.now(), period: '', amount: 0 });
    window.renderExpenseRows();
};

window.removeExpenseRow = function(index) {
    window.currentExpenseRows.splice(index, 1);
    window.renderExpenseRows();
};

window.updateExpenseRow = function(index, field, value) {
    window.currentExpenseRows[index][field] = value;
    if (field === 'amount') window.renderExpenseRows();
};

window.saveKiadas = async function(e) {
    e.preventDefault();
    const btn = document.querySelector('#modal-kiadas button[type="submit"]');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Mentés...';
    btn.disabled = true;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        if (!user) throw new Error("Nincs bejelentkezett felhasználó!");

        const kDatum = document.getElementById('k-datum').value;
        const today = new Date().toISOString().split('T')[0];
        if (kDatum > today) {
            alert('⛔ Jövőbeli dátumot nem lehet rögzíteni!\n\nA dátum nem lehet nagyobb mint a mai nap (' + today + ').');
            btn.innerHTML = origHtml;
            btn.disabled = false;
            return;
        }

        const recordsToInsert = [];
        // 🚨 Közös azonosító generálása a Pénzügy és a Leltár összekötéséhez!
        const sharedXkey = 'K-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5);

        const baseRecord = {
            congregation_id: activeCongregationId,
            id_kiadascel: parseInt(document.getElementById('k-id_kiadascel').value, 10),
            datum: kDatum,
            irattipus: document.getElementById('k-irattipus').value,
            nyugta: document.getElementById('k-nyugta').value,
            iratszam: document.getElementById('k-iratszam').value,
            megjegyzes: document.getElementById('k-megjegyzes').value || null,
            atvevo: document.getElementById('k-atvevo-input').value,
            atvevoid: document.getElementById('k-atvevoid').value ? parseInt(document.getElementById('k-atvevoid').value, 10) : null,
            deleted: false,
            userid: user.id
        };

        const isSplit = document.getElementById('chk-expense-split')?.checked;
        
        if (isSplit && window.currentExpenseRows.length > 0) {
            window.currentExpenseRows.forEach((row, i) => {
                recordsToInsert.push({
                    ...baseRecord,
                    xkey: sharedXkey + '-' + i, // Ha bontott, sorszámozzuk az xkey-t
                    osszeg: row.amount || 0,
                    vonatkozo_idoszak: row.period
                });
            });
        } else {
            recordsToInsert.push({
                ...baseRecord,
                xkey: sharedXkey,
                osszeg: parseFloat(document.getElementById('k-osszeg').value) || 0,
                vonatkozo_idoszak: null
            });
        }

        if (recordsToInsert.length === 0) throw new Error("Nem adott meg érvényes összeget!");

        const { error } = await _supabase.from('kiadas').insert(recordsToInsert);
        if (error) throw error;
        
        // 🚨 2. LELTÁR LÁNCREAKCIÓ (Várólista)
        const leltarChk = document.getElementById('chk-leltar-koto');
        if (leltarChk && leltarChk.checked) {
            let osszesLeltariErtek = 0;
            recordsToInsert.forEach(r => osszesLeltariErtek += r.osszeg);
            
            const leltarName = document.getElementById('k-leltar-megnevezes').value || baseRecord.megjegyzes || 'Új pénztári beszerzés';
            const bizTipus = document.getElementById('k-nyugta').value || 'Nyugta';
            const bizSzam = document.getElementById('k-iratszam').value;
            const veglegesBizonylat = bizSzam ? `${bizTipus} ${bizSzam}` : bizTipus; // 🚨 Így áthozza a számot!
            
            const leltarPayload = {
                congregation_id: activeCongregationId,
                kategoria: 'Várólista',
                megnevezes: leltarName,
                leltari_szam: 'FÜGGŐ',
                penzugy_xkey: recordsToInsert[0].xkey, /* 🚨 Ez köti össze az adatbázisban a kettőt! */
                beszerzes_datuma: baseRecord.datum,
                beszerzes_bizonylat: veglegesBizonylat,
                beszerzesi_ertek: osszesLeltariErtek,
                mennyiseg: 1,
                mertekegyseg: 'db',
                is_deleted: false,
                userid: user.id
            };
            await _supabase.from('leltar_tetelek').insert([leltarPayload]);
        }

        bootstrap.Modal.getInstance(document.getElementById('modal-kiadas')).hide();
        document.getElementById('form-kiadas').reset();
        document.getElementById('k-datum').value = new Date().toISOString().split('T')[0];
        
        const leltarDiv = document.getElementById('div-leltar-koto');
        if (leltarDiv) leltarDiv.classList.add('d-none');
        
        if (typeof window.toggleExpenseSplit === 'function') {
            document.getElementById('chk-expense-split').checked = false;
            window.toggleExpenseSplit(); 
        }
        
        if (typeof window.loadTranzakciok === 'function') await window.loadTranzakciok();
        if (typeof window.loadKasszaTransactions === 'function') await window.loadKasszaTransactions();
        if (typeof window.loadBankTransactions === 'function') await window.loadBankTransactions();

    } catch (err) {
        alert("Hiba a mentés során: " + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
};