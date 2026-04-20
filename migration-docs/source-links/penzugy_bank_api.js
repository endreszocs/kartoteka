// --- js/penzugy_bank_api.js ---

window.bankAccounts = [];
let bcrParsedRows = [];
let allKasszaTransactions = []; 

// ============================================================================
// 1. KASSZA (KÉSZPÉNZ) MOTOR
// ============================================================================
window.loadKasszaTransactions = async function() {
    const tbody = document.getElementById('kassza-list-body');
    if (!tbody || !activeCongregationId) return;

    try {
        const [bevRes, kiaRes] = await Promise.all([
            _supabase.from('befizetes').select('*').eq('congregation_id', activeCongregationId).ilike('irattipus', '%észpénz%').eq('deleted', false),
            _supabase.from('kiadas').select('*').eq('congregation_id', activeCongregationId).ilike('irattipus', '%észpénz%').eq('deleted', false)
        ]);

        let allKassza = [];
        
        if (bevRes.data) {
            bevRes.data.forEach(b => {
                const rawDate = b.datum ? String(b.datum) : `${currentYear}-01-01`;
                const d = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
                if (d.startsWith(currentYear)) {
                    allKassza.push({ ...b, isIncome: true, realDate: d });
                }
            });
        }
        
        if (kiaRes.data) {
            kiaRes.data.forEach(k => {
                const rawDate = k.datum ? String(k.datum) : `${currentYear}-01-01`;
                const d = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
                if (d.startsWith(currentYear)) {
                    allKassza.push({ ...k, isIncome: false, realDate: d });
                }
            });
        }

        // Belső mozgás flag: belso_mozgas_xkey-vel rendelkező tételek lila stílussal
        allKassza.forEach(t => { if (t.belso_mozgas_xkey) t.isBm = true; });

        allKassza.sort((a, b) => new Date(a.realDate) - new Date(b.realDate));
        window.allKasszaTransactions = allKassza;

        const filterVal = document.getElementById('kassza-month-filter')?.value || 'all';
        if (typeof window.renderKasszaTable === 'function') {
            window.renderKasszaTable(filterVal);
        }

    } catch (err) { 
        console.error("Kassza betöltési hiba:", err); 
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4 fw-bold"><i class="ti ti-alert-triangle me-2 fs-2 d-block mb-2"></i>Rendszerhiba a Kassza betöltésekor!<br><code class="text-dark mt-2 d-block">${err.message}</code></td></tr>`;
    }
};

window.filterKassza = function() {
    const filterVal = document.getElementById('kassza-month-filter').value;
    window.renderKasszaTable(filterVal);
};

window.renderKasszaTable = function(monthFilter) {
    const tbody = document.getElementById('kassza-list-body');
    if (!tbody) return;

    let currentBalance = window.autoCarryoverCash || 0;
    let monthOpeningBalance = window.autoCarryoverCash || 0;
    
    let displayRows = [];
    let monthIncomeTotal = 0;
    let monthExpenseTotal = 0;

    window.allKasszaTransactions.forEach(t => {
        const tMonth = t.realDate.split('-')[1];

        if (monthFilter !== 'all') {
            if (tMonth > monthFilter) return;
            if (tMonth < monthFilter) {
                if (t.isIncome) monthOpeningBalance += Number(t.osszeg);
                else monthOpeningBalance -= Number(t.osszeg);
                currentBalance = monthOpeningBalance;
                return; 
            }
        }

        if (t.isIncome) {
            currentBalance += Number(t.osszeg);
            monthIncomeTotal += Number(t.osszeg);
        } else {
            currentBalance -= Number(t.osszeg);
            monthExpenseTotal += Number(t.osszeg);
        }

        const rawBizTipus = t.nyugta || t.irattipus_biz || '';
        const bizTipus = rawBizTipus.includes('Chitant') ? 'Chitanta' : rawBizTipus;
        const bizSzam = (t.iratszam && t.iratszam !== 'BCR Import' && t.iratszam !== t.nyugta) ? t.iratszam : '';

        const partner = t.forrasa || t.atvevo || 'Gyülekezeti tag';

        let cim = '';
        let kor = '';
        if (t.id_szemely && window.allChurchMembers) {
            const m = window.allChurchMembers.find(x => x.id === t.id_szemely);
            if (m) {
                let utcaNeve = m.adrstreet?.name || (window.streetCache ? window.streetCache[m.c_utcaid] : '');
                let helysegNeve = m.adrlocality?.name || (window.localityCache ? window.localityCache[m.c_helysegid] : '');
                let cimTomb = [];
                if (helysegNeve) cimTomb.push(helysegNeve);
                if (utcaNeve) cimTomb.push(utcaNeve);
                if (m.c_szam) cimTomb.push(m.c_szam);
                cim = cimTomb.join(', ');
                if (m.sz_datum) {
                    kor = String(new Date().getFullYear() - new Date(m.sz_datum).getFullYear());
                }
            }
        }

        const celKod = t.isIncome ? window.bevCelMap?.[t.id_befizetescel] : window.kiaCelMap?.[t.id_kiadascel];
        const celNev = window.szamadasiCellek?.find(c => c.id === celKod)?.nev || '';
        const forrasInfo = [kor ? kor + ' éves' : '', cim].filter(Boolean).join(' · ');

        const bmStyle = t.isBm ? 'background: linear-gradient(90deg,rgba(94,53,177,0.06),transparent); border-left: 3px solid #7e57c2 !important;' : '';
        const clickAction = t.isBm ? '' : `onclick="window.openQuickEdit('${t.isIncome ? 'B' : 'K'}', ${t.id}, false)"`;
        displayRows.unshift(`
            <tr style="${bmStyle}cursor: pointer; transition: background 0.2s;" onmouseover="this.style.backgroundColor='#f1f5f9'" onmouseout="this.style.backgroundColor='${t.isBm ? 'rgba(94,53,177,0.04)' : 'transparent'}'" ${clickAction}>
                <td class="align-middle text-nowrap">${t.realDate}</td>
                <td class="align-middle">
                    <div class="fw-semibold ${t.isBm ? 'text-purple' : 'text-dark'}">${t.isBm ? '<i class="ti ti-transfer me-1 text-purple"></i>' : ''}${celNev || (t.isBm ? bizTipus : '—')}</div>
                    ${!t.isBm && bizTipus ? `<div class="small text-muted mt-1" style="font-size:0.78rem;">${bizTipus}</div>` : ''}
                </td>
                <td class="align-middle fw-bold text-dark">${bizSzam || (t.isBm ? '—' : '-')}</td>
                <td class="align-middle">
                    <div class="fw-bold ${t.isBm ? 'text-purple' : 'text-dark'}">${partner}</div>
                    ${!t.isBm && forrasInfo ? `<div class="small text-muted mt-1" style="font-size:0.78rem;"><i class="ti ti-map-pin me-1"></i>${forrasInfo}</div>` : ''}
                    ${t.isBm && t.megjegyzes ? `<div class="small text-muted mt-1" style="font-size:0.78rem;"><i class="ti ti-message me-1"></i>${t.megjegyzes}</div>` : ''}
                </td>
                <td class="text-end fw-bold align-middle text-success">${t.isIncome ? Number(t.osszeg).toFixed(2) : '-'}</td>
                <td class="text-end fw-bold align-middle text-danger">${!t.isIncome ? Number(t.osszeg).toFixed(2) : '-'}</td>
            </tr>
        `);
    });

    if (monthFilter !== 'all') {
        const monthNames = ["", "Január", "Február", "Március", "Április", "Május", "Június", "Július", "Augusztus", "Szeptember", "Október", "November", "December"];
        const mName = monthNames[parseInt(monthFilter)];
        
        if (displayRows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-5"><i class="ti ti-cash fs-1 d-block mb-2 text-success opacity-50"></i>Nincs készpénzes forgalom ebben a hónapban (${mName}).</td></tr>`;
        } else {
            displayRows.unshift(`
                <tr class="table-success text-success fw-bold">
                    <td colspan="4" class="text-end align-middle">${mName} havi összesített forgalom / Záró egyenleg:</td>
                    <td class="text-end align-middle">+${monthIncomeTotal.toFixed(2)}</td>
                    <td class="text-end align-middle">-${monthExpenseTotal.toFixed(2)}</td>
                </tr>
            `);
            displayRows.push(`
                <tr class="table-light text-muted fw-bold border-top border-2">
                    <td colspan="4" class="text-end align-middle">Pénztári Nyitó Egyenleg (${mName} 1.):</td>
                    <td colspan="2" class="text-end align-middle text-dark fs-4">${monthOpeningBalance.toFixed(2)} RON</td>
                </tr>
            `);
            tbody.innerHTML = displayRows.join('');
        }
        
        const kcb = document.getElementById('kassza-current-balance');
        if (kcb) kcb.innerText = `${currentBalance.toFixed(2)} RON`;
        
    } else {
        if (displayRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-5"><i class="ti ti-cash fs-1 d-block mb-2 text-success opacity-50"></i>Nincs készpénzes forgalom az adott évben.</td></tr>';
        } else {
            tbody.innerHTML = displayRows.join('');
        }
        const kcb = document.getElementById('kassza-current-balance');
        if (kcb) kcb.innerText = `${currentBalance.toFixed(2)} RON`;
    }
};

// ============================================================================
// 2. BANKSZÁMLÁK ÉS BANKI FORGALOM MOTOR
// ============================================================================
window.loadBankAccounts = async function() {
    if (!activeCongregationId) return;
    try {
        const { data, error } = await _supabase.from('bankszamlak').select('*').eq('congregation_id', activeCongregationId).eq('aktiv', true);
        if (error) throw error;
        
        window.bankAccounts = data || [];
        const selector = document.getElementById('bank-account-selector');
        if (selector) {
            selector.innerHTML = '<option value="">-- Válasszon bankszámlát --</option>' + window.bankAccounts.map(b =>
                `<option value="${b.id}" data-szin="${b.szin || '#206bc4'}">\u25CF ${b.bank_neve} (${b.valuta}) \u2014 ${b.iban || 'Nincs IBAN'}</option>`
            ).join('');
            // Ha pontosan 1 aktív bankszámla van, automatikusan kiválasztjuk
            if (window.bankAccounts.length === 1) {
                selector.value = window.bankAccounts[0].id;
                if (typeof window.loadBankTransactions === 'function') window.loadBankTransactions();
            }
        }
    } catch (err) { console.error("Bank hiba:", err); }
};

window.openNewBankModal = function() {
    document.getElementById('nb-bank-name').value = '';
    document.getElementById('nb-iban').value = '';
    document.getElementById('nb-nyito').value = '0';
    new bootstrap.Modal(document.getElementById('modal-new-bank')).show();
};

window.saveNewBankAccount = async function() {
    const name = document.getElementById('nb-bank-name').value;
    const iban = document.getElementById('nb-iban').value;
    const valuta = document.getElementById('nb-valuta').value;
    const nyito = parseFloat(document.getElementById('nb-nyito').value) || 0;

    if (!name) { alert("A Bank neve kötelező!"); return; }

    const szin = document.getElementById('nb-szin')?.value || '#206bc4';

    try {
        const { error } = await _supabase.from('bankszamlak').insert([{
            congregation_id: activeCongregationId,
            bank_neve: name,
            iban: iban,
            valuta: valuta,
            nyito_egyenleg: nyito,
            szin: szin
        }]);
        if (error) throw error;
        
        bootstrap.Modal.getInstance(document.getElementById('modal-new-bank')).hide();
        await window.loadBankAccounts();
        alert("Sikeresen rögzítve!");
    } catch(err) { alert("Hiba: " + err.message); }
};

window.loadBankTransactions = async function() {
    const accId = document.getElementById('bank-account-selector')?.value;
    const tbody = document.getElementById('bank-list-body');
    const balEl = document.getElementById('bank-current-balance');
    
    if (!tbody) return;
    
    if (!accId) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-5"><i class="ti ti-building-bank fs-1 d-block mb-2 text-info opacity-50"></i>Válasszon egy bankszámlát a fenti listából!</td></tr>';
        if (balEl) balEl.innerText = "0.00 RON";
        return;
    }

    const acc = window.bankAccounts.find(b => b.id == accId);
    if (!acc) return;

    try {
        const [bevRes, kiaRes] = await Promise.all([
            _supabase.from('befizetes').select('*').eq('congregation_id', activeCongregationId).eq('bankszamla_id', accId).eq('deleted', false),
            _supabase.from('kiadas').select('*').eq('congregation_id', activeCongregationId).eq('bankszamla_id', accId).eq('deleted', false)
        ]);

        let allBank = [];
        
        if (bevRes.data) {
            bevRes.data.forEach(b => {
                const rawDate = b.datum ? String(b.datum) : `${currentYear}-01-01`;
                const d = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
                allBank.push({ ...b, isIncome: true, realDate: d });
            });
        }
        
        if (kiaRes.data) {
            kiaRes.data.forEach(k => {
                const rawDate = k.datum ? String(k.datum) : `${currentYear}-01-01`;
                const d = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
                allBank.push({ ...k, isIncome: false, realDate: d });
            });
        }

        // Belső mozgás flag: belso_mozgas_xkey-vel rendelkező tételek lila stílussal
        allBank.forEach(t => { if (t.belso_mozgas_xkey) t.isBm = true; });

        allBank.sort((a, b) => new Date(a.realDate) - new Date(b.realDate));
        window.allBankTransactions = allBank;

        let currentBalance = Number(acc.nyito_egyenleg || 0); 
        let html = '';

        const displayRows = [];
        allBank.forEach(t => {
            if (t.isIncome) currentBalance += Number(t.osszeg);
            else currentBalance -= Number(t.osszeg);
            
            const partner = t.forrasa || t.atvevo || 'Gyülekezeti tag';

            const rawBankBizTipus = t.nyugta || t.irattipus_biz || '';
            const bizTipus = rawBankBizTipus.includes('Chitant') ? 'Chitanta' : rawBankBizTipus;
            const bizSzam = (t.iratszam && t.iratszam !== 'BCR Import' && t.iratszam !== t.nyugta) ? t.iratszam : '';

            let cim = '';
            let kor = '';
            if (t.id_szemely && window.allChurchMembers) {
                const m = window.allChurchMembers.find(x => x.id === t.id_szemely);
                if (m) {
                    let utcaNeve = m.adrstreet?.name || (window.streetCache ? window.streetCache[m.c_utcaid] : '');
                    let helysegNeve = m.adrlocality?.name || (window.localityCache ? window.localityCache[m.c_helysegid] : '');
                    let cimTomb = [];
                    if (helysegNeve) cimTomb.push(helysegNeve);
                    if (utcaNeve) cimTomb.push(utcaNeve);
                    if (m.c_szam) cimTomb.push(m.c_szam);
                    cim = cimTomb.join(', ');
                    if (m.sz_datum) {
                        kor = String(new Date().getFullYear() - new Date(m.sz_datum).getFullYear());
                    }
                }
            }

            const celKod = t.isIncome ? window.bevCelMap?.[t.id_befizetescel] : window.kiaCelMap?.[t.id_kiadascel];
            const celNev = window.szamadasiCellek?.find(c => c.id === celKod)?.nev || '';
            const partnerInfo = [kor ? kor + ' éves' : '', cim].filter(Boolean).join(' · ');

            const bankBmStyle   = t.isBm ? 'background:linear-gradient(90deg,rgba(94,53,177,0.06),transparent);border-left:3px solid #7e57c2 !important;' : '';
            const bankClickAct  = t.isBm ? '' : `onclick="window.openQuickEdit('${t.isIncome ? 'B' : 'K'}', ${t.id}, true)"`;
            displayRows.unshift(`
                <tr style="${bankBmStyle}cursor:pointer;transition:background 0.2s;" onmouseover="this.style.backgroundColor='#f1f5f9'" onmouseout="this.style.backgroundColor='${t.isBm ? 'rgba(94,53,177,0.04)' : 'transparent'}'" ${bankClickAct}>
                    <td class="align-middle text-nowrap">${t.realDate}</td>
                    <td class="align-middle">
                        <div class="fw-semibold ${t.isBm ? 'text-purple' : 'text-dark'}">${t.isBm ? '<i class="ti ti-transfer me-1 text-purple"></i>' : ''}${celNev || (t.isBm ? bizTipus : '—')}</div>
                        ${!t.isBm && bizTipus ? `<div class="small text-muted mt-1" style="font-size:0.78rem;">${bizTipus}</div>` : ''}
                    </td>
                    <td class="align-middle fw-bold text-dark">${bizSzam || '—'}</td>
                    <td class="align-middle">
                        <div class="fw-bold ${t.isBm ? 'text-purple' : 'text-dark'}">${partner}</div>
                        ${!t.isBm && partnerInfo ? `<div class="small text-muted mt-1" style="font-size:0.78rem;"><i class="ti ti-map-pin me-1"></i>${partnerInfo}</div>` : ''}
                        ${t.isBm && t.forrasa ? `<div class="small text-muted mt-1" style="font-size:0.78rem;"><i class="ti ti-message me-1"></i>${t.forrasa}</div>` : ''}
                    </td>
                    <td class="text-end fw-bold align-middle text-success">${t.isIncome ? Number(t.osszeg).toFixed(2) : '-'}</td>
                    <td class="text-end fw-bold align-middle text-danger">${!t.isIncome ? Number(t.osszeg).toFixed(2) : '-'}</td>
                </tr>
            `);
        });

        if (displayRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-5">Nincs tranzakció ezen a számlán.</td></tr>';
        } else {
            tbody.innerHTML = displayRows.join(''); 
        }

        if (balEl) balEl.innerText = `${currentBalance.toFixed(2)} ${acc.valuta}`;

    } catch (err) { 
        console.error("Bank betöltési hiba:", err); 
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4 fw-bold"><i class="ti ti-alert-triangle me-2 fs-2 d-block mb-2"></i>Rendszerhiba a Bank betöltésekor!<br><code class="text-dark mt-2 d-block">${err.message}</code></td></tr>`;
    }
};

// ============================================================================
// 3. INTELLIGENS BCR IMPORTÁLÓ MOTOR (Visszaállítva!)
// ============================================================================
window.triggerBankImport = function() {
    const accId = document.getElementById('bank-account-selector').value;
    if (!accId) { alert("Kérem, előbb válassza ki (vagy rögzítse), hogy melyik bankszámlára szeretne importálni!"); return; }
    let fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv, .xlsx, .xls';
    fileInput.onchange = window.handleBCRFile;
    fileInput.click();
};

window.handleBCRFile = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        let headerRowIdx = -1;
        for(let i=0; i<json.length; i++) {
            if(json[i] && json[i][0] === 'Data inregistrarii') { headerRowIdx = i; break; }
        }

        if (headerRowIdx === -1) { alert("A rendszer nem ismeri fel a BCR formátumot! Kérem, a letöltött bankkivonatot töltse fel módosítás nélkül."); return; }

        bcrParsedRows = [];
       
	   for (let i = headerRowIdx + 1; i < json.length; i++) {
            const row = json[i];
            if (!row || !row[0]) continue; 

            let rawDate = row[0];
            let dateStr = rawDate;
            
            if (typeof rawDate === 'number' || (!isNaN(rawDate) && rawDate > 10000)) {
                const d = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
                dateStr = d.toISOString().split('T')[0];
            } else if (typeof rawDate === 'string') {
                if (rawDate.includes('.') && rawDate.split('.').length === 3) {
                    const p = rawDate.split('.');
                    if (p[0].length === 2) dateStr = `${p[2]}-${p[1]}-${p[0]}`;
                }
            }

            let inAmt = parseFloat(row[6]) || 0;
            let outAmt = parseFloat(row[7]) || 0;
            if (outAmt < 0) outAmt = Math.abs(outAmt); 

            if (inAmt === 0 && outAmt === 0) continue;

            bcrParsedRows.push({
                date: dateStr,
                partner: row[1] || 'Ismeretlen partner',
                inAmount: inAmt,
                outAmount: outAmt,
                isIncome: inAmt > 0,
                desc: row[9] || '',
                ref: row[4] ? String(row[4]).trim() : ''
            });
        }
	   
        if (bcrParsedRows.length === 0) { alert("A kivonat nem tartalmaz érvényes tranzakciót."); return; }

        window.renderBCRPreviewTable();
        new bootstrap.Modal(document.getElementById('modal-bank-import')).show();
    };
    reader.readAsArrayBuffer(file);
};

window.renderBCRPreviewTable = function() {
    const tbody = document.getElementById('bcr-import-body');
    const bevOptions = '<option value="">-- Kihagyás --</option>' + window.szamadasiCellek.filter(c => c.type === 'B' && c.iscel).map(c => `<option value="${c.id}">${c.id} - ${c.nev}</option>`).join('');
    const kiaOptions = '<option value="">-- Kihagyás --</option>' + window.szamadasiCellek.filter(c => c.type === 'K' && c.iscel).map(c => `<option value="${c.id}">${c.id} - ${c.nev}</option>`).join('');

    let html = '';
    bcrParsedRows.forEach((r, idx) => {
        const icon = r.isIncome ? '<i class="ti ti-arrow-down text-success fs-2"></i>' : '<i class="ti ti-arrow-up text-danger fs-2"></i>';
        const opts = r.isIncome ? bevOptions : kiaOptions;
        
        html += `
            <tr>
                <td class="align-middle text-center">${icon}</td>
                <td class="align-middle fw-bold text-nowrap">${r.date}</td>
                <td class="align-middle">
                    <div class="fw-bold text-dark">${r.partner}</div>
                    <div class="small text-muted text-truncate" style="max-width:300px;" title="${r.desc}">${r.desc}</div>
                </td>
                <td class="text-end fw-bold text-success align-middle">${r.inAmount > 0 ? r.inAmount.toFixed(2) : '-'}</td>
                <td class="text-end fw-bold text-danger align-middle">${r.outAmount > 0 ? r.outAmount.toFixed(2) : '-'}</td>
                <td class="align-middle">
                    <select class="form-select form-select-sm border-${r.isIncome ? 'success' : 'danger'} fw-bold bcr-cat-select" data-idx="${idx}">
                        ${opts}
                    </select>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    document.getElementById('bcr-import-stats').innerText = `Feldolgozásra vár: ${bcrParsedRows.length} tétel`;
};

window.executeBankImport = async function() {
    const accId = document.getElementById('bank-account-selector').value;
    const btn = document.getElementById('btn-save-bcr-import');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Könyvelés folyamatban...';
    btn.disabled = true;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        if (!user) throw new Error("Kritikus hiba: Nem található bejelentkezett felhasználó!");

        const bevToInsert = [];
        const kiaToInsert = [];
        const leltarToInsert = []; // 🚨 Várólista gyűjtője
        const selects = document.querySelectorAll('.bcr-cat-select');
        
        selects.forEach(sel => {
            const catId = sel.value;
            if (!catId) return; 

            const idx = sel.getAttribute('data-idx');
            const row = bcrParsedRows[idx];
            const internalId = row.isIncome ? window.bevCelMapReversed[catId] : window.kiaCelMapReversed[catId];
            if (!internalId) return;

            const baseKey = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5);

            if (row.isIncome) {
                bevToInsert.push({
                    xkey: 'B-' + baseKey, congregation_id: activeCongregationId, bankszamla_id: accId,
                    id_befizetescel: internalId, datum: row.date, irattipus: 'Banki átutalás', forrasa: row.partner,
                    megjegyzes: row.desc, osszeg: row.inAmount, nyugta: 'BCR Import', iratszam: row.ref || '',
                    fizetettev: new Date(row.date).getFullYear(), csalad: false, deleted: false, userid: user.id
                });
            } else {
                kiaToInsert.push({
                    xkey: 'K-' + baseKey, congregation_id: activeCongregationId, bankszamla_id: accId,
                    id_kiadascel: internalId, datum: row.date, irattipus: 'Banki átutalás', atvevo: row.partner,
                    megjegyzes: row.desc, osszeg: row.outAmount, nyugta: 'BCR Import', iratszam: row.ref || '',
                    deleted: false, userid: user.id
                });
                
                // 🚨 LELTÁR LÁNCREAKCIÓ a Bankból!
                const catName = sel.options[sel.selectedIndex].text.toLowerCase();
                const isLeltar = catName.includes('beruházás') || catName.includes('felszerelés') || catName.includes('leltár') || catName.includes('eszköz') || catName.includes('gép') || catName.includes('bútor');
                
                if (isLeltar) {
                    leltarToInsert.push({
                        congregation_id: activeCongregationId, kategoria: 'Várólista',
                        megnevezes: row.desc || 'Banki beszerzés', leltari_szam: 'FÜGGŐ',
                        beszerzes_datuma: row.date, beszerzes_bizonylat: 'BCR Import',
                        beszerzesi_ertek: row.outAmount, mennyiseg: 1, mertekegyseg: 'db',
                        is_deleted: false, userid: user.id
                    });
                }
            }
        });

        if (bevToInsert.length === 0 && kiaToInsert.length === 0) { alert("Nem jelölt ki egyetlen tételt sem könyvelésre!"); return; }

        if (bevToInsert.length > 0) {
            const { error } = await _supabase.from('befizetes').insert(bevToInsert);
            if (error) throw error;
        }
        if (kiaToInsert.length > 0) {
            const { error } = await _supabase.from('kiadas').insert(kiaToInsert);
            if (error) throw error;
        }
        if (leltarToInsert.length > 0) {
            const { error } = await _supabase.from('leltar_tetelek').insert(leltarToInsert);
            if (error) console.error("Leltár Várólista mentési hiba: ", error);
        }

        bootstrap.Modal.getInstance(document.getElementById('modal-bank-import')).hide();
        let mText = `Sikeres könyvelés!\n\nImportált Bevételek: ${bevToInsert.length} db\nImportált Kiadások: ${kiaToInsert.length} db`;
        if (leltarToInsert.length > 0) mText += `\n\nFigyelem! A gép ${leltarToInsert.length} db tételt felvett a Vagyonleltár várólistájára is!`;
        alert(mText);
        
        if (typeof window.loadTranzakciok === 'function') await window.loadTranzakciok();
        if (typeof window.loadKasszaTransactions === 'function') await window.loadKasszaTransactions();
        if (typeof window.loadBankTransactions === 'function') await window.loadBankTransactions();

    } catch (err) { alert("Hiba az importálás során: " + err.message); } 
    finally { btn.innerHTML = origHtml; btn.disabled = false; }
};

// ============================================================================
// 4. KASSZAKÖNYV (PÉNZTÁRJELENTÉS) ELŐNÉZET ÉS NYOMTATÓ MOTOR (Visszaállítva!)
// ============================================================================
window.generateKasszakonyvPDF = function() {
    const filterEl = document.getElementById('kassza-month-filter');
    if (!filterEl) return;
    const filterVal = filterEl.value;
    
    let openingBalance = window.autoCarryoverCash || 0;
    let currentBalance = window.autoCarryoverCash || 0;
    let monthIncomeTotal = 0;
    let monthExpenseTotal = 0;
    let printRows = [];

    const monthNames = ["", "Január", "Február", "Március", "Április", "Május", "Június", "Július", "Augusztus", "Szeptember", "Október", "November", "December"];
    const periodName = filterVal === 'all' ? `${currentYear}. Teljes Év` : `${currentYear}. ${monthNames[parseInt(filterVal, 10)]}`;

    window.allKasszaTransactions.forEach(t => {
        const tMonth = parseInt(t.realDate.split('-')[1], 10);
        const fMonth = parseInt(filterVal, 10);

        if (filterVal !== 'all') {
            if (tMonth > fMonth) return;
            if (tMonth < fMonth) {
                if (t.isIncome) openingBalance += Number(t.osszeg);
                else openingBalance -= Number(t.osszeg);
                currentBalance = openingBalance;
                return;
            }
        }

        if (t.isIncome) {
            currentBalance += Number(t.osszeg);
            monthIncomeTotal += Number(t.osszeg);
        } else {
            currentBalance -= Number(t.osszeg);
            monthExpenseTotal += Number(t.osszeg);
        }
        printRows.push(t);
    });

    if (printRows.length === 0 && filterVal !== 'all' && monthIncomeTotal === 0 && monthExpenseTotal === 0) {
        alert("Nincs nyomtatható forgalom a kiválasztott időszakban!");
        return;
    }

    const gyulekezetNeve = (typeof currentSettings !== 'undefined' && currentSettings && currentSettings.intezmenyneve) ? currentSettings.intezmenyneve : 'Ref. Egyházközség';
    
    let rowsHtml = '';
    let index = 1;
    printRows.forEach(t => {
        let iratTipus = 'Doc.';
        if (t.irattipus === 'Készpénz') iratTipus = 'Chit.';
        if (t.irattipus === 'Banki átutalás') iratTipus = 'OP';
        if (t.megjegyzes && t.megjegyzes.toLowerCase().includes('számla')) iratTipus = 'Fact.';
        
        const iratszam = t.iratszam || t.nyugta || '-';
        const partner = t.forrasa || t.atvevo || '';
        const megjegyzes = t.megjegyzes ? ` - ${t.megjegyzes}` : '';
        const magyarazat = `<b>${partner}</b>${megjegyzes}`;
        
        const celKod = t.isIncome ? window.bevCelMap?.[t.id_befizetescel] : window.kiaCelMap?.[t.id_kiadascel];
        
        rowsHtml += `
            <tr style="font-size: 11px;">
                <td style="border: 1px solid #000; padding: 4px; text-align: center;">${index++}</td>
                <td style="border: 1px solid #000; padding: 4px; text-align: center;">${iratszam}</td>
                <td style="border: 1px solid #000; padding: 4px; text-align: center;"><b>${iratTipus}</b></td>
                <td style="border: 1px solid #000; padding: 4px;">${magyarazat}</td>
                <td style="border: 1px solid #000; padding: 4px; text-align: right;">${t.isIncome ? parseFloat(t.osszeg).toFixed(2) : ''}</td>
                <td style="border: 1px solid #000; padding: 4px; text-align: right;">${!t.isIncome ? parseFloat(t.osszeg).toFixed(2) : ''}</td>
                <td style="border: 1px solid #000; padding: 4px; text-align: center;">${celKod || ''}</td>
            </tr>
        `;
    });
     
    const titulusok = ['Lelkipásztor', 'Gondnok', 'Pénztáros', 'Könyvelő', 'Irodavezető', 'Adminisztrátor', 'Esperes', 'Főgondnok', 'Ellenőr', 'Főjegyző'];
    const generateSigOptions = (selected) => titulusok.map(t => `<option value="${t}" ${t === selected ? 'selected' : ''}>${t}</option>`).join('');
    
    const sig1Default = localStorage.getItem('print_kassza_sig1') || 'Pénztáros';
    const sig2Default = localStorage.getItem('print_kassza_sig3') || 'Ellenőr';

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="hu">
        <head>
            <meta charset="UTF-8">
            <title>Registru de Casă - ${periodName}</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
            <style>
                body { font-family: 'Times New Roman', Times, serif; background-color: #525659; margin: 0; padding: 0; display: flex; justify-content: center; }
                .toolbar { position: fixed; top: 0; left: 0; right: 0; background-color: #323639; padding: 15px 20px; display: flex; justify-content: center; gap: 15px; z-index: 1000; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
                .btn { padding: 10px 20px; font-size: 14px; font-weight: bold; color: white; border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-family: Arial, sans-serif; }
                .btn-print { background-color: #206bc4; } .btn-print:hover { background-color: #1a569d; }
                .btn-pdf { background-color: #d63939; } .btn-pdf:hover { background-color: #b02a2a; }
                .page { background: white; width: 210mm; min-height: 297mm; padding: 15mm; margin-top: 80px; margin-bottom: 40px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); box-sizing: border-box; position: relative; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #000; padding: 4px; }
                .sig-select { margin-top: 5px; padding: 3px; font-size: 11px; width: 100%; text-align: center; border: 1px solid #ccc; background: #f9f9f9; border-radius: 3px; cursor: pointer; font-family: Arial, sans-serif; }
                @media print { body { background: white; display: block; } .toolbar { display: none !important; } .page { margin: 0; padding: 0; box-shadow: none; width: auto; min-height: auto; } .no-print { display: none !important; } }
            </style>
        </head>
        <body>
            <div class="toolbar">
                <button class="btn btn-print" onclick="window.print()">Nyomtatás Papírra</button>
                <button class="btn btn-pdf" onclick="generatePDF()">Mentés PDF-ként</button>
            </div>
            <div class="page" id="print-area">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                    <div style="width: 30%; font-weight: bold; font-size: 12px;">${gyulekezetNeve}<br>(unitate - egység)</div>
                    <div style="width: 40%; text-align: center;"><h2 style="margin: 0; font-size: 18px;">REGISTRU DE CASĂ</h2><h2 style="margin: 0; font-size: 18px;">KASSZAKÖNYV</h2></div>
                    <div style="width: 30%; text-align: right; font-size: 12px; font-weight: bold;">A/L/Z/-É/H/N<br>${periodName}</div>
                </div>
                <table>
                    <thead>
                        <tr style="text-align: center; font-size: 11px; font-weight: bold;">
                            <th style="width: 5%;">Nr.crt<br><br>S.sz.</th><th style="width: 10%;">Nr.act.casă<br><br>Iratszám</th><th style="width: 10%;">Act<br><br>Irat</th>
                            <th style="width: 35%;">Explicaţia - Magyarázat</th><th style="width: 12%;">Incasări<br>Bevételek</th><th style="width: 12%;">Plăți<br>Kiadások</th><th style="width: 16%;">Simbol cont.<br>Költségv.sz.</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="font-size: 11px; font-weight: bold;"><td colspan="4" style="text-align: right;">Sold ziua precedentă - Előző napi egyenleg:</td><td style="text-align: right;">${openingBalance.toFixed(2)}</td><td></td><td></td></tr>
                        ${rowsHtml}
                        <tr style="font-size: 11px; font-weight: bold;"><td colspan="4" style="text-align: right;">Total - Összesen:</td><td style="text-align: right;">${monthIncomeTotal.toFixed(2)}</td><td style="text-align: right;">${monthExpenseTotal.toFixed(2)}</td><td></td></tr>
                        <tr style="font-size: 11px; font-weight: bold;"><td colspan="4" style="text-align: right;">Sold zi - Napi egyenleg - ${periodName}</td><td style="text-align: right;">${currentBalance.toFixed(2)}</td><td></td><td></td></tr>
                    </tbody>
                </table>
                <div style="margin-top: 40px; display: flex; justify-content: space-around; text-align: center;">
                    <div style="width: 30%;">
                        <div style="font-weight: bold; font-size: 12px; margin-bottom: 20px;">Intocmit - Készítette</div>
                        <div style="border-bottom: 1px dotted #000; margin-bottom: 5px; height: 30px;"></div>
                        <div id="sig1" style="font-size: 11px; font-style: italic;">${sig1Default}</div>
                        <select id="sel-sig1" class="no-print sig-select" onchange="updateSig('sig1', this.value)">${generateSigOptions(sig1Default)}</select>
                    </div>
                    <div style="width: 30%;">
                        <div style="font-weight: bold; font-size: 12px; margin-bottom: 20px;">Verificat - Ellenőrizte</div>
                        <div style="border-bottom: 1px dotted #000; margin-bottom: 5px; height: 30px;"></div>
                        <div id="sig2" style="font-size: 11px; font-style: italic;">${sig2Default}</div>
                        <select id="sel-sig2" class="no-print sig-select" onchange="updateSig('sig2', this.value)">${generateSigOptions(sig2Default)}</select>
                    </div>
                </div>
            </div>
            <script>
                function updateSig(id, val) { document.getElementById(id).innerText = val; localStorage.setItem('print_kassza_' + id, val); }
                function generatePDF() {
                    const btn = document.querySelector('.btn-pdf'); const origHtml = btn.innerHTML; btn.innerHTML = 'Generálás...'; btn.disabled = true;
                    const selects = document.querySelectorAll('.no-print'); selects.forEach(s => s.style.display = 'none');
                    html2pdf().set({ margin: 10, filename: 'Registru_de_Casa_${currentYear}_${filterVal}.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(document.getElementById('print-area')).save().then(() => {
                        selects.forEach(s => s.style.display = 'block'); btn.innerHTML = origHtml; btn.disabled = false;
                    });
                }
            </script>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) { printWindow.document.write(htmlContent); printWindow.document.close(); } 
    else { alert("A böngésző blokkolta az ablak megnyitását. Kérem, engedélyezze a pop-upokat!"); }
};

// ============================================================================
// 5. KATTINTÁSRA FELUGRÓ GYORSSZERKESZTŐ ÉS INIT (Páncélozott Verzió)
// ============================================================================

// Töröljük ki a régit (bárhol is legyen a HTML-ben)
document.querySelectorAll('#modal-quick-edit').forEach(el => el.remove());

// Létrehozzuk az újat az okoskeresővel
const qeHtml = `
<div class="modal modal-blur fade" id="modal-quick-edit" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content shadow-lg border-0">
            <div class="modal-header bg-dark text-white">
                <h5 class="modal-title fw-bold"><i class="ti ti-edit me-2"></i>Tétel Gyorsszerkesztése</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body bg-light">
                <div id="qe-lock-warning" class="alert alert-warning py-2 mb-3 d-none fw-bold small shadow-sm border-warning">
                    <i class="ti ti-lock me-2 fs-3 align-middle"></i> Bankból importált tétel! A számviteli fegyelem miatt az Összeg és a Dátum zárolva van!
                </div>
                <div class="row g-3">
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-muted">Dátum</label>
                        <input type="date" id="qe-datum" class="form-control fw-bold">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-muted">Összeg (RON)</label>
                        <input type="number" step="0.01" id="qe-osszeg" class="form-control text-end fw-bold text-primary">
                    </div>
                    <div class="col-12">
                        <label class="form-label small fw-bold text-dark">Könyvelési Cél (Költségvetés)</label>
                        <select id="qe-cel" class="form-select border-secondary fw-bold"></select>
                    </div>
                    
                    <div class="col-12 position-relative">
                        <label class="form-label small fw-bold text-dark">Befizető / Partner Neve</label>
                        <div class="input-group">
                            <span class="input-group-text bg-white"><i class="ti ti-search text-primary"></i></span>
                            <input type="text" id="qe-partner" class="form-control fw-bold" placeholder="Gépelje be a nevet..." oninput="window.UniversalSmartSearch(this.value, 'qe-search-results', 'selectQuickEditPerson')" autocomplete="off">
                        </div>
                        <input type="hidden" id="qe-partner-id">
                        <div id="qe-search-results" class="list-group position-absolute w-100 shadow-lg bg-white border d-none" style="z-index: 9999; max-height: 250px; overflow-y: auto;"></div>
                    </div>

                    <div class="col-12">
                        <label class="form-label small fw-bold text-dark">Megjegyzés</label>
                        <input type="text" id="qe-megjegyzes" class="form-control">
                    </div>
                </div>
            </div>
            <div class="modal-footer bg-white d-flex justify-content-between">
                <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Mégse</button>
                <button type="button" class="btn btn-primary fw-bold px-4" onclick="window.saveQuickEdit()"><i class="ti ti-device-floppy me-2"></i>Módosítások Mentése</button>
            </div>
        </div>
    </div>
</div>`;
document.body.insertAdjacentHTML('beforeend', qeHtml);

window.selectQuickEditPerson = function(id, name) {
    document.getElementById('qe-partner').value = name;
    document.getElementById('qe-partner-id').value = id;
    document.getElementById('qe-search-results').classList.add('d-none');
};

window.currentEditTx = null; 
window.currentEditType = null; 

window.openQuickEdit = function(type, id, isBank) {
    const list = isBank ? window.allBankTransactions : window.allKasszaTransactions;
    
    if (!list) { alert("Rendszerhiba: A tranzakciók nincsenek a memóriában!"); return; }

    const tx = list.find(t => t.id === id && t.isIncome === (type === 'B'));
    if (!tx) { alert("Nem található a tétel az adatok között!"); return; }

    window.currentEditTx = tx;
    window.currentEditType = type;

    document.getElementById('qe-datum').value = tx.realDate;
    document.getElementById('qe-osszeg').value = parseFloat(tx.osszeg).toFixed(2);
    document.getElementById('qe-partner').value = type === 'B' ? (tx.forrasa || '') : (tx.atvevo || '');
    document.getElementById('qe-megjegyzes').value = tx.megjegyzes || '';

    const selectEl = document.getElementById('qe-cel');
    const mapObj = type === 'B' ? window.bevCelMap : window.kiaCelMap;
    const mapByKod = {}; Object.keys(mapObj).forEach(k => mapByKod[mapObj[k]] = k);
    const validCellek = window.szamadasiCellek.filter(c => c.type === type && c.iscel === true && c.id.includes('.'));
    
    selectEl.innerHTML = '<option value="">-- Válasszon tételt --</option>' + validCellek.map(c => {
        const intId = mapByKod[c.id.trim()];
        return intId ? `<option value="${intId}">${c.id} - ${c.nev}</option>` : '';
    }).join('');
    selectEl.value = type === 'B' ? tx.id_befizetescel : tx.id_kiadascel;

    const isImported = tx.irattipus && tx.irattipus.toLowerCase().includes('bank');
    const amtInput = document.getElementById('qe-osszeg');
    const dateInput = document.getElementById('qe-datum');
    const warningDiv = document.getElementById('qe-lock-warning');

    if (isImported) {
        amtInput.disabled = true; dateInput.disabled = true; warningDiv.classList.remove('d-none');
    } else {
        amtInput.disabled = false; dateInput.disabled = false; warningDiv.classList.add('d-none');
    }

    const modalEl = document.getElementById('modal-quick-edit');
    const myModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    myModal.show();
};

window.saveQuickEdit = async function() {
    const tx = window.currentEditTx;
    if (!tx) return;

    try {
        const btn = document.querySelector('#modal-quick-edit .btn-primary');
        if (btn) { btn.innerHTML = 'Mentés...'; btn.disabled = true; }

        const table = window.currentEditType === 'B' ? 'befizetes' : 'kiadas';
        const payload = {
            datum: document.getElementById('qe-datum').value,
            megjegyzes: document.getElementById('qe-megjegyzes').value,
        };

        if (window.currentEditType === 'B') {
            payload.forrasa = document.getElementById('qe-partner').value;
            payload.id_befizetescel = parseInt(document.getElementById('qe-cel').value, 10);
        } else {
            payload.atvevo = document.getElementById('qe-partner').value;
            payload.id_kiadascel = parseInt(document.getElementById('qe-cel').value, 10);
        }

        const amtInput = document.getElementById('qe-osszeg');
        if (!amtInput.disabled) { payload.osszeg = parseFloat(amtInput.value); }

        const { error } = await _supabase.from(table).update(payload).eq('id', tx.id);
        if (error) throw error;

        const modalEl = document.getElementById('modal-quick-edit');
        if (modalEl) {
            const modalInstance = bootstrap.Modal.getInstance(modalEl);
            if (modalInstance) modalInstance.hide();
        }
        
        if (typeof window.loadTranzakciok === 'function') await window.loadTranzakciok();
        if (typeof window.loadKasszaTransactions === 'function') await window.loadKasszaTransactions();
        if (typeof window.loadBankTransactions === 'function') await window.loadBankTransactions();

    } catch (err) {
        alert("Hiba a módosítás során: " + err.message);
    } finally {
        const btn = document.querySelector('#modal-quick-edit .btn-primary');
        if (btn) { btn.innerHTML = '<i class="ti ti-device-floppy me-2"></i>Módosítások Mentése'; btn.disabled = false; }
    }
};

// 🚨 AZ ELTŰNT INDÍTÓ MOTOR (Enélkül semmi nem tölt be!)
setTimeout(() => {
    // Generáljuk a fordított map-et a BCR importhoz
    window.bevCelMapReversed = {};
    window.kiaCelMapReversed = {};
    if(window.bevCelMap) Object.entries(window.bevCelMap).forEach(([k, v]) => window.bevCelMapReversed[v] = k);
    if(window.kiaCelMap) Object.entries(window.kiaCelMap).forEach(([k, v]) => window.kiaCelMapReversed[v] = k);

    if (activeCongregationId) {
        if (typeof window.loadKasszaTransactions === 'function') window.loadKasszaTransactions();
        if (typeof window.loadBankAccounts === 'function') window.loadBankAccounts();
    }
    
    const btnNewBank = document.querySelector('.btn-outline-info[title="Új bankszámla rögzítése"]');
    if (btnNewBank) btnNewBank.onclick = window.openNewBankModal;

    const btnBcr = document.querySelector('.btn-info i.ti-file-import')?.parentElement;
    if (btnBcr) btnBcr.onclick = window.triggerBankImport;
}, 1500);

// ============================================================================
// VALUTA ÁTÉRTÉKELÉS MODUL
// Év végi devizás bankszámla átértékelés (BNR árfolyammal)
// ============================================================================

var _vaCalcData = [];

window.openValutaAtert = function() {
    var modal = document.getElementById('modal-valuta-atert');
    if (!modal) return;

    // Év választó feltöltése
    var evSel = document.getElementById('va-ev');
    if (evSel && evSel.options.length <= 1) {
        evSel.innerHTML = '';
        var curY = new Date().getFullYear();
        for (var y = curY; y >= curY - 5; y--) {
            evSel.add(new Option(y, y));
        }
        // Alapértelmezés: előző év (mert általában az előző év végi átértékelés történik)
        evSel.value = curY - 1;
    }

    new bootstrap.Modal(modal).show();
    window._vaLoadYear();
};

window._vaLoadYear = async function() {
    var ev = parseInt(document.getElementById('va-ev').value);
    var cont = document.getElementById('va-accounts-container');
    if (!cont) return;

    // Devizás bankszámlák szűrése (nem RON)
    var devizas = (window.bankAccounts || []).filter(function(b) {
        return b.valuta && b.valuta !== 'RON';
    });

    if (devizas.length === 0) {
        cont.innerHTML = '<div class="alert alert-info py-2 small text-center"><i class="ti ti-info-circle me-1"></i>Nincs devizás bankszámla rögzítve. Az átértékelés csak nem-RON bankszámlákra vonatkozik.</div>';
        document.getElementById('va-osszesito').classList.add('d-none');
        document.getElementById('va-save-btn').disabled = true;
        return;
    }

    // Korábbi átértékelések lekérdezése
    var korRes = await _supabase.from('valuta_atert').select('*')
        .eq('congregation_id', activeCongregationId).eq('ev', ev)
        .catch(function() { return { data: [] }; });
    var korabbi = (korRes && korRes.data) || [];

    if (korabbi.length > 0) {
        document.getElementById('va-korabbi').classList.remove('d-none');
        var korHtml = '<table class="table table-sm table-bordered mb-0"><thead class="bg-light"><tr><th>Számla</th><th>Valuta</th><th class="text-end">Árfolyam</th><th class="text-end">Különbözet</th><th>Típus</th></tr></thead><tbody>';
        korabbi.forEach(function(k) {
            var acc = (window.bankAccounts || []).find(function(b) { return b.id === k.bankszamla_id; });
            var tipBadge = k.tipus === 'nyereseg' ? '<span class="badge bg-success">Nyereség</span>' : '<span class="badge bg-danger">Veszteség</span>';
            korHtml += '<tr><td>' + (acc ? acc.bank_neve : '?') + '</td><td>' + k.valuta + '</td><td class="text-end">' + k.uj_arfolyam + '</td><td class="text-end fw-bold">' + parseFloat(k.kulonbozet).toFixed(2) + ' RON</td><td>' + tipBadge + '</td></tr>';
        });
        korHtml += '</tbody></table>';
        document.getElementById('va-korabbi-lista').innerHTML = korHtml;
    } else {
        document.getElementById('va-korabbi').classList.add('d-none');
    }

    // Bankszámlák megjelenítése
    _vaCalcData = devizas.map(function(b) {
        return {
            id: b.id,
            neve: b.bank_neve,
            valuta: b.valuta,
            nyitoEgyenleg: parseFloat(b.nyito_egyenleg) || 0,
            marAtert: korabbi.find(function(k) { return k.bankszamla_id === b.id; })
        };
    });

    var html = '<table class="table table-sm table-bordered mb-0"><thead class="bg-light"><tr>'
        + '<th>Bankszámla</th><th>Valuta</th>'
        + '<th class="text-end">Egyenleg (deviza)</th>'
        + '<th class="text-end">Könyvi érték (RON)</th>'
        + '<th class="text-end">Új árfolyam</th>'
        + '<th class="text-end">Új RON érték</th>'
        + '<th class="text-end fw-bold">Különbözet</th>'
        + '</tr></thead><tbody id="va-rows">';

    _vaCalcData.forEach(function(d, i) {
        html += '<tr data-va-idx="' + i + '">'
            + '<td class="fw-bold">' + d.neve + '</td>'
            + '<td><span class="badge bg-info-lt">' + d.valuta + '</span></td>'
            + '<td class="text-end"><input type="number" step="0.01" class="form-control form-control-sm text-end fw-bold va-deviza-egyenleg" value="0" style="width:120px;display:inline-block;" oninput="window._vaCalc()"></td>'
            + '<td class="text-end"><input type="number" step="0.01" class="form-control form-control-sm text-end va-regi-ron" value="0" style="width:120px;display:inline-block;" oninput="window._vaCalc()"></td>'
            + '<td class="text-end va-uj-arfolyam">—</td>'
            + '<td class="text-end va-uj-ron">—</td>'
            + '<td class="text-end fw-bold va-kulonb">—</td>'
            + '</tr>';
    });

    html += '</tbody></table>';
    cont.innerHTML = html;
    document.getElementById('va-osszesito').classList.remove('d-none');
    window._vaCalc();
};

window._vaCalc = function() {
    var eurArfolyam = parseFloat(document.getElementById('va-arfolyam-eur').value) || 0;
    var hufArfolyam = parseFloat(document.getElementById('va-arfolyam-huf').value) || 0;

    var rows = document.querySelectorAll('#va-rows tr[data-va-idx]');
    var osszNyereseg = 0;
    var osszVeszteseg = 0;
    var vanAdat = false;

    rows.forEach(function(row) {
        var idx = parseInt(row.dataset.vaIdx);
        var d = _vaCalcData[idx];
        if (!d) return;

        var arfolyam = 0;
        if (d.valuta === 'EUR') arfolyam = eurArfolyam;
        else if (d.valuta === 'HUF') arfolyam = hufArfolyam;

        var devizaEgyenleg = parseFloat(row.querySelector('.va-deviza-egyenleg').value) || 0;
        var regiRon = parseFloat(row.querySelector('.va-regi-ron').value) || 0;

        d._devizaEgyenleg = devizaEgyenleg;
        d._regiRon = regiRon;
        d._ujArfolyam = arfolyam;

        if (arfolyam > 0 && devizaEgyenleg > 0) {
            var ujRon = devizaEgyenleg * arfolyam;
            var kulonb = ujRon - regiRon;
            d._ujRon = ujRon;
            d._kulonb = kulonb;
            vanAdat = true;

            row.querySelector('.va-uj-arfolyam').textContent = arfolyam.toFixed(4);
            row.querySelector('.va-uj-ron').textContent = ujRon.toFixed(2);

            var kulonbEl = row.querySelector('.va-kulonb');
            kulonbEl.textContent = (kulonb >= 0 ? '+' : '') + kulonb.toFixed(2) + ' RON';
            kulonbEl.className = 'text-end fw-bold ' + (kulonb >= 0 ? 'text-success' : 'text-danger');

            if (kulonb >= 0) osszNyereseg += kulonb;
            else osszVeszteseg += Math.abs(kulonb);
        } else {
            row.querySelector('.va-uj-arfolyam').textContent = '—';
            row.querySelector('.va-uj-ron').textContent = '—';
            row.querySelector('.va-kulonb').textContent = '—';
            row.querySelector('.va-kulonb').className = 'text-end fw-bold';
            d._ujRon = 0;
            d._kulonb = 0;
        }
    });

    document.getElementById('va-nyereseg').textContent = osszNyereseg.toFixed(2) + ' RON';
    document.getElementById('va-veszteseg').textContent = osszVeszteseg.toFixed(2) + ' RON';
    document.getElementById('va-save-btn').disabled = !vanAdat;
};

// BNR árfolyam lekérdezés (XML API)
window._vaFetchBnr = async function() {
    try {
        var resp = await fetch('https://www.bnr.ro/nbrfxrates.xml');
        var text = await resp.text();
        var parser = new DOMParser();
        var xml = parser.parseFromString(text, 'text/xml');
        var rates = xml.querySelectorAll('Rate');
        rates.forEach(function(r) {
            var currency = r.getAttribute('currency');
            var multiplier = parseInt(r.getAttribute('multiplier') || '1');
            var value = parseFloat(r.textContent);
            if (currency === 'EUR') {
                document.getElementById('va-arfolyam-eur').value = (value / multiplier).toFixed(4);
            } else if (currency === 'HUF') {
                document.getElementById('va-arfolyam-huf').value = (value / multiplier).toFixed(4);
            }
        });
        window._vaCalc();
        alert('BNR árfolyamok sikeresen betöltve!');
    } catch(e) {
        alert('BNR árfolyam lekérés sikertelen: ' + e.message + '\nKérem, manuálisan adja meg az árfolyamot (bnr.ro).');
    }
};

window.saveValutaAtert = async function() {
    var ev = parseInt(document.getElementById('va-ev').value);
    var btn = document.getElementById('va-save-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Feldolgozás...';

    try {
        var authRes = await _supabase.auth.getUser();
        var user = authRes.data.user;
        if (!user) throw new Error('Nincs bejelentkezett felhasználó!');

        // Dátum: az adott év dec. 31.
        var datum = ev + '-12-31';

        // 103.04 és 203.03 junction ID-k keresése
        var bevCelId103 = null;
        var kiaCelId203 = null;
        for (var celId in window.bevCelMap) {
            if (window.bevCelMap[celId] === '103.04') { bevCelId103 = parseInt(celId); break; }
        }
        for (var celId2 in window.kiaCelMap) {
            if (window.kiaCelMap[celId2] === '203.03') { kiaCelId203 = parseInt(celId2); break; }
        }

        if (!bevCelId103 && !kiaCelId203) {
            alert('Nem található a 103.04 (árfolyam nyereség) vagy 203.03 (árfolyam veszteség) költségvetési tétel. Kérjük, futtassa a szamadasicel_sync.sql-t!');
            return;
        }

        var savedCount = 0;

        for (var i = 0; i < _vaCalcData.length; i++) {
            var d = _vaCalcData[i];
            if (!d._kulonb || d._devizaEgyenleg <= 0 || d._ujArfolyam <= 0) continue;

            var kulonb = d._kulonb;
            var tipus = kulonb >= 0 ? 'nyereseg' : 'veszteseg';
            var abszKulonb = Math.abs(kulonb);
            var regiArfolyam = d._regiRon / d._devizaEgyenleg;

            var atertRec = {
                congregation_id: activeCongregationId,
                bankszamla_id: d.id,
                ev: ev,
                valuta: d.valuta,
                deviza_egyenleg: d._devizaEgyenleg,
                regi_arfolyam: parseFloat(regiArfolyam.toFixed(4)),
                regi_ron_ertek: d._regiRon,
                uj_arfolyam: d._ujArfolyam,
                uj_ron_ertek: d._ujRon,
                kulonbozet: parseFloat(kulonb.toFixed(2)),
                tipus: tipus,
                arfolyam_datum: datum,
                arfolyam_forras: 'BNR',
                userid: user.id
            };

            // Nyereség → bevétel (103.04), Veszteség → kiadás (203.03)
            if (tipus === 'nyereseg' && bevCelId103) {
                var bevRec = {
                    congregation_id: activeCongregationId,
                    datum: datum,
                    osszeg: abszKulonb,
                    forrasa: 'Árfolyam-különbözet (' + d.valuta + ' — ' + d.neve + ')',
                    irattipus: 'Banki átutalás',
                    iratszam: 'ÁRF/' + ev,
                    fizetettev: ev,
                    id_befizetescel: bevCelId103,
                    megjegyzes: 'Automatikus: ' + ev + '. évi záró átértékelés. ' + d.valuta + ' ' + d._devizaEgyenleg + ' × ' + d._ujArfolyam + ' = ' + d._ujRon.toFixed(2) + ' RON (előző: ' + d._regiRon.toFixed(2) + ' RON)',
                    userid: user.id,
                    deleted: false
                };
                var bevInsert = await _supabase.from('befizetes').insert(bevRec).select('id').single();
                if (bevInsert.data) atertRec.befizetes_id = bevInsert.data.id;
            } else if (tipus === 'veszteseg' && kiaCelId203) {
                var kiaRec = {
                    congregation_id: activeCongregationId,
                    datum: datum,
                    osszeg: abszKulonb,
                    atvevo: 'Árfolyam-különbözet (' + d.valuta + ' — ' + d.neve + ')',
                    irattipus: 'Banki átutalás',
                    iratszam: 'ÁRF/' + ev,
                    fizetettev: ev,
                    id_kiadascel: kiaCelId203,
                    megjegyzes: 'Automatikus: ' + ev + '. évi záró átértékelés. ' + d.valuta + ' ' + d._devizaEgyenleg + ' × ' + d._ujArfolyam + ' = ' + d._ujRon.toFixed(2) + ' RON (előző: ' + d._regiRon.toFixed(2) + ' RON)',
                    userid: user.id,
                    deleted: false
                };
                var kiaInsert = await _supabase.from('kiadas').insert(kiaRec).select('id').single();
                if (kiaInsert.data) atertRec.kiadas_id = kiaInsert.data.id;
            }

            // Átértékelés rekord mentése
            await _supabase.from('valuta_atert').insert(atertRec);
            savedCount++;
        }

        if (savedCount === 0) {
            alert('Nincs könyvelendő átértékelés (0 különbözet vagy hiányzó adatok).');
        } else {
            alert(savedCount + ' bankszámla átértékelése sikeresen könyvelve!\n\nAz árfolyam-különbözet a megfelelő költségvetési tételre került:\n• Nyereség → 103.04\n• Veszteség → 203.03');
            var modalInst = bootstrap.Modal.getInstance(document.getElementById('modal-valuta-atert'));
            if (modalInst) modalInst.hide();
            // Frissítés
            if (typeof window.loadBankTransactions === 'function') window.loadBankTransactions();
        }
    } catch(err) {
        alert('Hiba az átértékelésnél: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-check me-1"></i>Átértékelés könyvelése';
    }
};