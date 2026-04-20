// --- js/penzugy_transactions.js ---

// ==========================================
// 1. TRANZAKCIÓK LISTÁZÁSA ÉS TÖRLÉSE (Legújabb legfelül)
// ==========================================
async function loadTranzakciok() {
    try {
        const { data: b } = await _supabase.from('befizetes')
            .select('*').eq('congregation_id', activeCongregationId).eq('fizetettev', currentYear)
            .eq('deleted', false).order('id', {ascending: false});
            
        const { data: k } = await _supabase.from('kiadas')
            .select('*').eq('congregation_id', activeCongregationId).eq('deleted', false)
            .gte('datum', `${currentYear}-01-01`).lte('datum', `${currentYear}-12-31`)
            .order('id', {ascending: false});
        
        window.allBefizetes = b || [];
        window.allKiadas = k || [];

        window.jarulekPaid = {};
        window.allBefizetes.forEach(d => {
            const kod = window.bevCelMap ? window.bevCelMap[d.id_befizetescel] : null;
            if (kod === '101.01' && d.id_szemely) {
                window.jarulekPaid[d.id_szemely] = (window.jarulekPaid[d.id_szemely] || 0) + Number(d.osszeg || 0);
            }
        });

        try { checkMissingReceipts(window.allBefizetes); } catch (e) { console.error("Hiba a nyugtafigyelőben:", e); }
        try { checkUnlinkedPayments(window.allBefizetes); } catch (e) { console.error("Hiba a párosítás-ellenőrzőben:", e); }
        try { renderFinanceTable('bevetel-list-body', window.allBefizetes, 'text-success', 'id_befizetescel', window.bevCelMap); } catch (e) { console.error("Hiba a bevételek rajzolásakor:", e); }
        try { renderFinanceTable('kiadas-list-body', window.allKiadas, 'text-danger', 'id_kiadascel', window.kiaCelMap); } catch (e) { console.error("Hiba a kiadások rajzolásakor:", e); }
        
        if (typeof loadSzamadas === 'function') await loadSzamadas();

        // Egységes Tranzakciók tab automatikus frissítése ha látható
        if (typeof window._onTranzakciokLoaded === 'function') window._onTranzakciokLoaded();

    } catch (globalErr) {
        console.error("Kritikus adatbázis hiba a tranzakciók letöltésekor:", globalErr);
    }
}

// 1.A PÁNCÉLOZOTT ÉS ÖNDIAGNOSZTIZÁLÓ LISTARAIZOLÓ
function renderFinanceTable(htmlId, data, color, celIdName, celMap) {
    const body = document.getElementById(htmlId);
    if (!body) return;
    
    if (!data || data.length === 0) { 
        body.innerHTML = '<tr><td colspan="5" class="text-center p-4">Nincs rögzített bizonylat.</td></tr>'; 
        return; 
    }

    const sortedData = [...data].sort((a, b) => {
        const dateA = a.datum ? new Date(a.datum).getTime() : 0;
        const dateB = b.datum ? new Date(b.datum).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
        return (b.id || 0) - (a.id || 0);
    });

    let html = '';
    let currentDatum = null;

    sortedData.forEach(d => {
        const rawDatum = d.datum ? String(d.datum) : "1900-01-01";
        const cleanDatum = rawDatum.includes('T') ? rawDatum.split('T')[0] : rawDatum;
        d.datum = cleanDatum; 

        if (cleanDatum !== currentDatum) {
            currentDatum = cleanDatum;
            const isBevetel = htmlId.includes('bevetel');
            const btnHtml = isBevetel
                ? `<button class="btn btn-sm btn-outline-primary ms-3 shadow-sm bg-white" onclick="printDailyJournal('${cleanDatum}')" title="Napi Pénztárnapló (Bevétel+Kiadás)"><i class="ti ti-printer me-1"></i> Napi Pénztárnapló</button>`
                : `<button class="btn btn-sm btn-outline-danger ms-3 shadow-sm bg-white" onclick="printExpenseSheet('${cleanDatum}')" title="Napi Kiadási Kísérőív"><i class="ti ti-printer me-1"></i> Kiadási Kísérőív</button>`;

            html += `
            <tr class="table-light">
                <td colspan="5" class="fw-bold text-dark text-center border-bottom border-top py-2" style="background-color: #f1f5f9; font-size: 0.95rem;">
                    <i class="ti ti-calendar-event me-2 text-muted"></i> Napi forgalom: <span class="text-primary">${cleanDatum}</span> ${btnHtml}
                </td>
            </tr>`;
        }

        const kod = celMap ? celMap[d[celIdName]] : d[celIdName]; 
        const celNev = window.szamadasiCellek?.find(c => c.id === kod)?.nev || 'Ismeretlen';
        
        let docSzam = "";
        let potlasJelzes = "";
        
        if (d.is_potlas && d.megjegyzes) {
            const safeMegjegyzes = String(d.megjegyzes);
            const match = safeMegjegyzes.match(/Elszámolás:\s*([^|]+)/);
            docSzam = match && match[1] ? match[1].trim() : "";
            if (docSzam) {
                potlasJelzes = `<div class="badge bg-warning-lt text-dark mt-1" style="font-size:0.65rem;" title="${safeMegjegyzes}"><i class="ti ti-receipt-refund me-1"></i>Pótolva: ${docSzam}</div>`;
            }
        }
        
        const bizTipus = d.nyugta || '';
        const bizSzam = d.iratszam || '';
        const bizStr = `${bizTipus} ${bizSzam}`.trim() || '-';
            
        html += `<tr>
            <td>
                <div class="fw-bold">${cleanDatum}</div>
                <div class="small text-muted">Bizonylat: <strong class="text-dark">${bizStr}</strong></div>
                ${potlasJelzes}
            </td>
            <td><span class="badge bg-blue-lt">${d.forrasa || d.atvevo || 'Ismeretlen'}</span></td>
            <td><small class="text-muted">${kod || d[celIdName] || '-'}</small><br>${celNev}</td>
            <td class="text-end fw-bold ${color}">${Number(d.osszeg || 0).toLocaleString('hu-HU', { minimumFractionDigits: 2 })} RON</td>
            <td class="text-end text-nowrap">
                ${d.is_potlas && docSzam ? `<button class="btn btn-sm btn-ghost-primary me-1" onclick="reprintElszamolas('${docSzam}', '${htmlId.includes('bevetel') ? 'B' : 'K'}', '${cleanDatum}')" title="Elszámolás Újranyomtatása"><i class="ti ti-printer"></i></button>` : ''}
                <button class="btn btn-sm btn-ghost-danger" onclick="deleteTransaction('${htmlId.includes('bevetel') ? 'befizetes' : 'kiadas'}', '${d.id}')" title="Bizonylat visszavonása (soft-delete — audit trail megmarad)"><i class="ti ti-trash"></i></button>
            </td>
        </tr>`;
    });

    body.innerHTML = html;
}

// 1.B TÖRLÉS (SOFT-DELETE — az audit trail megőrzésével)
// A tétel nem törlődik fizikailag az adatbázisból, csak "deleted=true" jelzést kap.
// Csak az utolsó rögzített tétel törölhető — régebbi hibát a Gyorsszerkesztővel vagy stornóval kell javítani.
async function deleteTransaction(type, id) {
    if (!confirm(
        "Biztosan visszavonja ezt a bizonylatot?\n\n" +
        "A tétel nem törlődik fizikailag — az audit trail (könyvvizsgálati nyomvonal) megőrzése érdekében " +
        "csak \"töröltként\" jelöljük meg, és eltűnik a listából.\n\n" +
        "Ha régebbi hibát kell javítani, használja a Kassza/Bank fülön a tétel-szerkesztést (rákattintás), " +
        "vagy rögzítsen egy ellentétes előjelű stornó-tételt."
    )) return;

    try {
        // Biztonsági ellenőrzés: csak a legutolsó rögzített tétel vonható vissza
        const { data: latestRecords, error: fetchErr } = await _supabase
            .from(type).select('id')
            .eq('congregation_id', activeCongregationId)
            .eq('deleted', false)
            .order('id', { ascending: false }).limit(1);

        if (fetchErr) throw fetchErr;

        if (latestRecords && latestRecords.length > 0) {
            const latestId = latestRecords[0].id;
            if (latestId.toString() !== id.toString()) {
                alert(
                    "⛔ BIZTONSÁGI KORLÁTOZÁS\n\n" +
                    "A számviteli fegyelem megőrzése érdekében csak a legutoljára rögzített (legfelső) tételt lehet visszavonni!\n\n" +
                    "Régebbi hibát javítani:\n" +
                    "• Kassza/Bank fülön kattintson a sorra → Gyorsszerkesztés\n" +
                    "• Rögzítsen egy ellentétes előjelű stornó-tételt ugyanolyan összegben"
                );
                return;
            }
        }

        // FIX: Soft-delete — fizikai törlés helyett csak megjelöljük töröltként
        const { error: updateErr } = await _supabase
            .from(type).update({ deleted: true }).eq('id', id);
        if (updateErr) throw updateErr;

        await loadTranzakciok();
        if (typeof window.loadKasszaTransactions === 'function') await window.loadKasszaTransactions();
        if (typeof window.loadBankTransactions === 'function') await window.loadBankTransactions();

    } catch (err) {
        alert("Hiba történt a visszavonás során: " + err.message);
    }
}

// ==========================================
// 2. OKOS KERESŐ MOTOR
// ==========================================
function removeAccents(str) {
    return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
}

function searchMembers(query) {
    document.getElementById('b-id_szemely').value = ""; 
    toggleFamilyView(); 

    const resultsContainer = document.getElementById('search-results');
    
    if (!window.allChurchMembers || window.allChurchMembers.length === 0) {
        resultsContainer.innerHTML = '<div class="list-group-item bg-dark text-danger fw-bold border-secondary" style="background-color: #1e293b !important;"><i class="ti ti-alert-triangle me-2"></i>Rendszerhiba: Nincsenek tagok betöltve!</div>';
        resultsContainer.classList.remove('d-none');
        return;
    }

    const q = removeAccents(query.toLowerCase().trim());
    if (q.length < 2) {
        resultsContainer.classList.add('d-none');
        const saveBtn = document.getElementById('btn-save-income');
        if (saveBtn) saveBtn.disabled = false; 
        return;
    }

    const matches = window.allChurchMembers.filter(m => {
        const v_csalad = m.csaladnev ? m.csaladnev : '';
        const v_knev = m.k_nev ? m.k_nev : '';
        const normalizedFullName = removeAccents(`${v_csalad} ${v_knev}`.toLowerCase());
        return normalizedFullName.includes(q);
    });

    if (matches.length === 0) {
        resultsContainer.innerHTML = `<div class="list-group-item border-secondary" style="background-color: #1e293b; color: #f8fafc;">
            <i class="ti ti-info-circle me-2 text-azure"></i>Nincs egyháztag találat. <span class="text-secondary small">(Külsős befizetőként rögzíthető)</span>
        </div>`;
    } else {
        resultsContainer.innerHTML = matches.map(m => {
            const fullName = `${m.csaladnev || ''} ${m.k_nev || ''}`;
            const age = calculateAge(m.sz_datum);
            const address = `Utcai azonosító: ${m.c_utcaid || '?'} / Házszám: ${m.c_szam || '?'}`;
            
            return `
                <button type="button" class="list-group-item list-group-item-action py-2 border-secondary" 
                        style="background-color: #1e293b; color: #f8fafc; transition: 0.2s;" 
                        onmouseover="this.style.backgroundColor='#334155'" 
                        onmouseout="this.style.backgroundColor='#1e293b'"
                        onclick="selectMember(${m.id}, '${fullName.replace(/'/g, "\\'")}')">
                    <div class="fw-bold" style="color: #4facfe !important;">
                        ${fullName} 
                        <span class="badge ms-2" style="background-color: rgba(79, 172, 254, 0.15); color: #e0f2fe; border: 1px solid rgba(79, 172, 254, 0.4);">${age} éves</span>
                    </div>
                    <div class="small mt-1" style="color: #94a3b8;"><i class="ti ti-map-pin me-1"></i>${address}</div>
                </button>
            `;
        }).join('');
    }
    resultsContainer.classList.remove('d-none');
}

function calculateAge(birthDateStr) {
    if (!birthDateStr) return '?';
    const diff = new Date() - new Date(birthDateStr);
    return Math.floor(diff / 31557600000);
}

function selectMember(id, fullName) {
    document.getElementById('b-id_szemely').value = id;
    document.getElementById('b-forrasa-input').value = fullName;
    document.getElementById('search-results').classList.add('d-none');
    toggleFamilyView();
    checkSingleJarulekWarning(); 
}

document.addEventListener('click', function(e) {
    const input = document.getElementById('b-forrasa-input');
    if (input && !input.contains(e.target)) {
        document.getElementById('search-results')?.classList.add('d-none');
    }
});

// ==========================================
// 3. CSALÁDTAGOK ELOSZTÁSA
// ==========================================
function toggleFamilyView() {
    const isFamily = document.getElementById('b-csalad').checked;
    const container = document.getElementById('family-members-container');
    const selectedId = document.getElementById('b-id_szemely').value;
    const listContainer = document.getElementById('family-members-list');
    const statusBadge = document.getElementById('family-sum-status');
    const saveBtn = document.getElementById('btn-save-income');
    
    if (isFamily) {
        container.classList.remove('d-none');
        if (selectedId) {
            loadFamilyMembers(selectedId);
        } else {
            listContainer.innerHTML = '<div class="text-danger small p-2"><i class="ti ti-alert-triangle me-1"></i> Családi szétosztáshoz kérjük, válasszon ki egy regisztrált egyháztagot a listából!</div>';
            statusBadge.className = 'badge bg-danger';
            statusBadge.innerText = 'Válasszon tagot!';
            if(saveBtn) saveBtn.disabled = true; 
        }
    } else {
        container.classList.add('d-none');
        if(saveBtn) saveBtn.disabled = false; 
    }
}

function loadFamilyMembers(selectedId) {
    const selectedMember = window.allChurchMembers.find(m => m.id == selectedId);
    const listContainer = document.getElementById('family-members-list');

    if (!selectedMember || !selectedMember.c_utcaid) {
        listContainer.innerHTML = '<div class="text-warning small p-2 fw-bold">Ennek a személynek nincs rögzítve az utca/házszáma, így a rendszer nem látja a háztartás többi tagját!</div>';
        return;
    }

    const family = window.allChurchMembers.filter(m => 
        m.c_utcaid === selectedMember.c_utcaid && m.c_szam === selectedMember.c_szam
    );

    const celSelect = document.getElementById('b-id_befizetescel');
    const isJarulek = celSelect && window.bevCelMap[celSelect.value] === '101.01';
    const elvart = window.evesJarulek || 0;

    listContainer.innerHTML = family.map(f => {
        const name = `${f.csaladnev || ''} ${f.k_nev || ''}`;
        const isMain = (f.id == selectedId);

        let jarulekStatus = '';
        if (isJarulek && elvart > 0) {
            const befizetve = window.jarulekPaid[f.id] || 0;
            if (befizetve >= elvart) {
                jarulekStatus = `<div class="badge bg-success-lt mt-1"><i class="ti ti-check me-1"></i>Rendezve (${befizetve} RON)</div>`;
            } else if (befizetve > 0) {
                jarulekStatus = `<div class="badge bg-warning-lt mt-1 text-dark"><i class="ti ti-alert-circle me-1"></i>Részlet: ${befizetve} RON (Hátralék: ${elvart - befizetve})</div>`;
            } else {
                jarulekStatus = `<div class="badge bg-danger-lt mt-1"><i class="ti ti-x me-1"></i>Nincs fizetve (Elvárt: ${elvart})</div>`;
            }
        }

        return `
            <div class="row align-items-center mb-2 pb-2 border-bottom">
                <div class="col-7">
                    <div class="fw-bold ${isMain ? 'text-primary' : ''}">${name} ${isMain ? '(Befizető)' : ''}</div>
                    <div class="small text-muted">${calculateAge(f.sz_datum)} éves</div>
                    ${jarulekStatus}
                </div>
                <div class="col-5">
                    <div class="input-group input-group-sm">
                        <input type="number" step="0.01" min="0" class="form-control family-amount-input text-end fw-bold" data-id="${f.id}" data-name="${name}" value="0" oninput="validateFamilySum()">
                        <span class="input-group-text">RON</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    validateFamilySum();
}

function validateFamilySum() {
    if (!document.getElementById('b-csalad').checked) return;

    const totalExpected = parseFloat(document.getElementById('b-osszeg').value) || 0;
    let familySum = 0;
    
    document.querySelectorAll('.family-amount-input').forEach(i => {
        familySum += parseFloat(i.value) || 0;
    });

    const diff = totalExpected - familySum;
    const statusBadge = document.getElementById('family-sum-status');
    const saveBtn = document.getElementById('btn-save-income');

    if (Math.abs(diff) < 0.01 && totalExpected > 0) {
        statusBadge.className = 'badge bg-success';
        statusBadge.innerHTML = '<i class="ti ti-check me-1"></i> Elosztás hibátlan!';
        if(saveBtn) saveBtn.disabled = false; 
    } else {
        statusBadge.className = 'badge bg-warning text-dark';
        statusBadge.innerHTML = `Fennmaradó: ${diff.toFixed(2)} RON`;
        if(saveBtn) saveBtn.disabled = true; 
    }
}

// ==========================================
// 4. MENTÉS MOTOR (Bevétel és Kiadás) 
// ==========================================
async function saveBefizetes(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-income');
    if(!btn) return;
    const origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Mentés...'; 
    btn.disabled = true;

    try {
        const celSelectVal = document.getElementById('b-id_befizetescel').value;
        const celKod = window.bevCelMap[celSelectVal];
        const isFamily = document.getElementById('b-csalad').checked;
        const sz_id = document.getElementById('b-id_szemely').value;
        const elvart = window.evesJarulek || 0;

        if (celKod === '101.01' && elvart > 0) {
            let alreadyPaidNames = [];

            if (isFamily && sz_id) {
                document.querySelectorAll('.family-amount-input').forEach(input => {
                    const amt = parseFloat(input.value) || 0;
                    if (amt > 0) {
                        const pId = input.getAttribute('data-id');
                        const eddigFizetett = window.jarulekPaid[pId] || 0;
                        if (eddigFizetett >= elvart) {
                            alreadyPaidNames.push(`- ${input.getAttribute('data-name')} (Eddig fizetett idén: ${eddigFizetett} RON)`);
                        }
                    }
                });
            } else if (sz_id) {
                const amt = parseFloat(document.getElementById('b-osszeg').value) || 0;
                if (amt > 0) {
                    const eddigFizetett = window.jarulekPaid[sz_id] || 0;
                    if (eddigFizetett >= elvart) {
                        alreadyPaidNames.push(`- ${document.getElementById('b-forrasa-input').value} (Eddig fizetett idén: ${eddigFizetett} RON)`);
                    }
                }
            }

            if (alreadyPaidNames.length > 0) {
                const msg = "⛔ BIZTONSÁGI FIGYELMEZTETÉS!\n\nAz alábbi személy(ek) idén már kifizették a teljes egyházfenntartói járulékot:\n" + 
                            alreadyPaidNames.join('\n') + 
                            "\n\nBiztosan ezen a jogcímen akarja menteni a mostani összeget?\n\n" +
                            "[OK] = Mentés folytatása\n" +
                            "[Mégse] = Vissza az ablakhoz";
                
                if (!confirm(msg)) {
                    btn.innerHTML = origText; btn.disabled = false; return; 
                }
            }
        }

        const { data: { user } } = await _supabase.auth.getUser();
        if (!user) throw new Error("Nincs bejelentkezett felhasználó!");

        const recordsToInsert = [];
        const baseRecord = {
            congregation_id: activeCongregationId,
            id_befizetescel: parseInt(celSelectVal, 10), 
            datum: document.getElementById('b-datum').value,
            irattipus: document.getElementById('b-irattipus').value,
            nyugta: document.getElementById('b-nyugta').value,
            iratszam: document.getElementById('b-nyugta').value, 
            csalad: isFamily,
            megjegyzes: document.getElementById('b-megjegyzes').value || null,
            fizetettev: parseInt(currentYear, 10),
            deleted: false, synced: false, userid: user.id 
        };

        if (isFamily && sz_id) {
            document.querySelectorAll('.family-amount-input').forEach(input => {
                const amt = parseFloat(input.value) || 0;
                if (amt > 0) {
                    recordsToInsert.push({
                        ...baseRecord,
                        xkey: 'B-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5),
                        osszeg: amt,
                        id_szemely: parseInt(input.getAttribute('data-id'), 10),
                        forrasa: input.getAttribute('data-name')
                    });
                }
            });
        } else {
            recordsToInsert.push({
                ...baseRecord,
                xkey: 'B-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5),
                osszeg: parseFloat(document.getElementById('b-osszeg').value),
                id_szemely: sz_id ? parseInt(sz_id, 10) : null,
                forrasa: document.getElementById('b-forrasa-input').value
            });
        }

        const { error } = await _supabase.from('befizetes').insert(recordsToInsert);
        if (error) throw error;
        
        bootstrap.Modal.getInstance(document.getElementById('modal-befizetes')).hide();
        document.getElementById('form-befizetes').reset();
        document.getElementById('b-datum').value = new Date().toISOString().split('T')[0];
        document.getElementById('b-id_szemely').value = "";
        document.getElementById('family-members-container').classList.add('d-none');
        
        await loadTranzakciok(); 
    } catch (err) { 
        alert("Hiba a bevétel mentésekor: " + err.message); 
    } finally { 
        btn.innerHTML = origText; btn.disabled = false; 
    }
}

// 5. INTELLIGENS ASSZISZTENS FUNKCIÓK
function checkMissingReceipts(bevData) {
    let container = document.getElementById('missing-receipts-warning');
    if (!container) {
        container = document.createElement('div');
        container.id = 'missing-receipts-warning';
        container.className = 'mb-3';
        const tabsContainer = document.getElementById('finance-tabs')?.closest('.card-header');
        if (tabsContainer) {
            tabsContainer.parentNode.insertBefore(container, tabsContainer);
        } else return;
    }

    if (!bevData || !Array.isArray(bevData) || bevData.length === 0) { container.innerHTML = ''; return; }

    const cashData = bevData.filter(d => 
        d.irattipus === 'Készpénz' || (d.nyugta && String(d.nyugta).includes('Chitan'))
    );

    const receipts = cashData.map(d => {
        let raw = d.iratszam || d.nyugta || "";
        let match = String(raw).match(/(\d+)/); 
        return match ? parseInt(match[0], 10) : NaN;
    }).filter(n => !isNaN(n) && n > 0).sort((a, b) => a - b);

    if (receipts.length < 2) { container.innerHTML = ''; return; }

    const min = receipts[0];
    const max = receipts[receipts.length - 1];
    const missing = [];
    const receiptSet = new Set(receipts);

    for (let i = min; i <= max; i++) {
        if (!receiptSet.has(i)) missing.push(i);
    }

    if (missing.length > 0) {
        container.innerHTML = `
            <div class="alert alert-warning shadow-sm border-warning mx-3 mt-3 mb-0" role="alert">
                <div class="d-flex align-items-center">
                    <div><i class="ti ti-alert-triangle text-warning fs-1 me-3"></i></div>
                    <div>
                        <h4 class="alert-title text-warning fw-bold mb-1">Figyelem: Hiányzó nyugtaszámok!</h4>
                        <div class="text-muted small mb-2">A kiadott készpénzes nyugták között ugrás van (az év első nyugtája: ${min}). A következő sorszámok kimaradtak: <strong class="text-dark fs-5">${missing.join(', ')}</strong></div>
                        <button type="button" class="btn btn-warning btn-sm fw-bold shadow-sm" onclick="window.openMissingReceiptsModal([${missing.join(',')}])">
                            <i class="ti ti-receipt-refund me-1"></i> Elmaradt nyugták azonnali pótlása (Elszámolás)
                        </button>
                    </div>
                </div>
            </div>
        `;
    } else {
        container.innerHTML = '';
    }
}

function checkSingleJarulekWarning() {
    const celSelect = document.getElementById('b-id_befizetescel');
    const sz_id = document.getElementById('b-id_szemely').value;
    const isFamily = document.getElementById('b-csalad').checked;

    let warningDiv = document.getElementById('jarulek-warning-container');
    if (warningDiv) warningDiv.remove();

    if (isFamily || !sz_id || !celSelect || !celSelect.value) return;

    const celKod = window.bevCelMap[celSelect.value];
    if (celKod === '101.01') {
        const befizetve = window.jarulekPaid[sz_id] || 0;
        const elvart = window.evesJarulek || 0;

        if (elvart > 0) {
            warningDiv = document.createElement('div');
            warningDiv.id = 'jarulek-warning-container';

            if (befizetve >= elvart) {
                warningDiv.innerHTML = `<div class="alert alert-success py-2 mt-2 mb-0 small fw-bold shadow-sm"><i class="ti ti-check me-2"></i>Ez a személy idén már kifizette a teljes egyházfenntartói járulékot (${befizetve} RON)! Kívánja Adományként könyvelni a mostani összeget?</div>`;
            } else if (befizetve > 0) {
                warningDiv.innerHTML = `<div class="alert alert-warning py-2 mt-2 mb-0 small fw-bold text-dark shadow-sm"><i class="ti ti-alert-circle me-2"></i>Részben már fizetett idén: ${befizetve} RON. Hátralék: ${elvart - befizetve} RON.</div>`;
            } else {
                warningDiv.innerHTML = `<div class="alert alert-info py-2 mt-2 mb-0 small fw-bold text-dark shadow-sm"><i class="ti ti-info-circle me-2"></i>Idén még nem fizetett egyházfenntartói járulékot. Elvárt összeg: ${elvart} RON.</div>`;
            }
            celSelect.parentNode.appendChild(warningDiv);
        }
    }
}

document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'b-id_befizetescel') {
        const isFamily = document.getElementById('b-csalad').checked;
        const sz_id = document.getElementById('b-id_szemely').value;
        if (isFamily && sz_id) loadFamilyMembers(sz_id);
        else checkSingleJarulekWarning();
    }
});

// ==========================================
// 6. UTÓLAGOS ELSZÁMOLÁS (Okos Kártyás Motor)
// ==========================================
window.openMissingReceiptsModal = function(missingArray) {
    window.pendingMissingReceipts = missingArray;
    const modalEl = document.getElementById('modal-elszamolas');
    const elszModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    elszModal.show();
};

window.elszState = { cards: [] };

document.addEventListener('show.bs.modal', (e) => {
    if (e.target.id === 'modal-elszamolas') {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('elsz-datum').value = today;
        
        const tipusSelect = document.getElementById('elsz-tipus');
        if (window.pendingMissingReceipts && window.pendingMissingReceipts.length > 0) {
            tipusSelect.value = 'B';
            window.elszState.cards = window.pendingMissingReceipts.map(ny => window.createNewElszCard(ny, ''));
            window.pendingMissingReceipts = null; 
        } else {
            window.elszState.cards = [window.createNewElszCard('', today)];
        }
        window.renderElszCards();
    }
});

const elszamolasIsExcluded = (kod, nev) => {
    if (!kod || kod.startsWith('100.')) return true;
    const n = (nev || '').toLowerCase();
    return (n.includes('készpénz') || n.includes('banki') || n.includes('központi') || n.includes('fizetésalapja'));
};

window.createNewElszCard = function(nyugta, datum) {
    return {
        id: Date.now() + Math.floor(Math.random() * 10000),
        nyugta: nyugta, datum: datum, celId: '', szemelyId: null, szemelyNev: '', familyMembers: [], megjegyzes: '',
        items: [{ id: Date.now() + Math.random(), year: new Date().getFullYear(), memberId: null, amount: 0 }]
    };
};

window.addElszCard = function() {
    const datum = document.getElementById('elsz-datum').value;
    window.elszState.cards.push(window.createNewElszCard('', datum));
    window.renderElszCards();
};

window.removeElszCard = function(cardId) {
    window.elszState.cards = window.elszState.cards.filter(c => c.id !== cardId);
    window.renderElszCards();
};

window.renderElszCards = function() {
    const container = document.getElementById('elszamolas-cards-container');
    const tipus = document.getElementById('elsz-tipus').value;
    let html = '';

    const validCellek = szamadasiCellek.filter(c => c.type === tipus && c.iscel === true && c.id.includes('.') && !elszamolasIsExcluded(c.id, c.nev));
    const mapObj = tipus === 'B' ? window.bevCelMap : window.kiaCelMap;
    const mapByKod = {}; Object.keys(mapObj).forEach(k => mapByKod[mapObj[k]] = k);
    const celOptions = '<option value="">-- Válasszon tételt --</option>' + validCellek.map(c => {
        const intId = mapByKod[c.id.trim()];
        return intId ? `<option value="${intId}">${c.id} - ${c.nev}</option>` : '';
    }).join('');

    window.elszState.cards.forEach((card, cIndex) => {
        let cardTotal = 0;
        const itemsHtml = card.items.map((item, iIndex) => {
            cardTotal += parseFloat(item.amount) || 0;
            let memberOptions = card.familyMembers.length > 0
                ? card.familyMembers.map(m => `<option value="${m.id}" ${m.id == item.memberId ? 'selected' : ''}>${m.csaladnev} ${m.k_nev}</option>`).join('')
                : `<option value="">Külsős befizető / Partner</option>`;

            return `
            <div class="d-flex gap-2 align-items-center mb-1">
                <input type="number" class="form-control form-control-sm text-center" value="${item.year}" style="width:70px;" onchange="window.updateElszItem(${card.id}, ${item.id}, 'year', this.value)">
                <select class="form-control form-control-sm" style="flex:1;" onchange="window.updateElszItem(${card.id}, ${item.id}, 'memberId', this.value)">
                    ${memberOptions}
                </select>
                <input type="number" step="0.01" class="form-control form-control-sm text-end fw-bold text-success" value="${item.amount}" style="width:100px;" onchange="window.updateElszItem(${card.id}, ${item.id}, 'amount', this.value)">
                ${card.items.length > 1 ? `<button type="button" class="btn btn-sm btn-icon btn-outline-danger border-0 py-0" onclick="window.removeElszItem(${card.id}, ${item.id})"><i class="ti ti-x"></i></button>` : '<div style="width:28px;"></div>'}
            </div>`;
        }).join('');

        const familyBadgeHtml = card.familyMembers.length > 1
            ? `<div class="text-info small fw-bold mb-2"><i class="ti ti-users me-1"></i>${card.familyMembers.length} családtag</div>` : '';

        html += `
        <div class="card border-orange shadow-sm" style="border-left: 3px solid var(--tblr-orange) !important;">
            <div class="card-body p-3">
                <!-- Fejléc: bizonylat szám + dátum + törlés -->
                <div class="d-flex gap-2 align-items-center mb-3">
                    <div class="input-group input-group-sm" style="width:130px;">
                        <span class="input-group-text py-0 small">Biz.sz.</span>
                        <input type="text" class="form-control fw-bold text-orange" value="${card.nyugta}" placeholder="124" onchange="window.updateElszCard(${card.id}, 'nyugta', this.value)" required>
                    </div>
                    <input type="date" class="form-control form-control-sm" value="${card.datum}" style="width:140px;" onchange="window.updateElszCard(${card.id}, 'datum', this.value)" required>
                    <select class="form-select form-select-sm" style="flex:1;" required onchange="window.updateElszCard(${card.id}, 'celId', this.value)">
                        ${celOptions.replace(`value="${card.celId}"`, `value="${card.celId}" selected`)}
                    </select>
                    ${window.elszState.cards.length > 1 ? `<button type="button" class="btn btn-sm btn-icon btn-outline-danger py-0" onclick="window.removeElszCard(${card.id})" title="Kártya törlése"><i class="ti ti-x"></i></button>` : ''}
                </div>

                <!-- Befizető kereső -->
                <div class="position-relative mb-2">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text py-0"><i class="ti ti-search"></i></span>
                        <input type="text" class="form-control" value="${card.szemelyNev}" placeholder="Befizető / partner neve..." oninput="window.UniversalSmartSearch(this.value, 'elsz-res-${card.id}', 'selectElszPerson', {cardId: ${card.id}})" autocomplete="off" required>
                    </div>
                    <div id="elsz-res-${card.id}" class="list-group position-absolute w-100 shadow-lg bg-white border d-none" style="z-index: 9999; max-height: 200px; overflow-y: auto;"></div>
                </div>
                ${familyBadgeHtml}

                <!-- Tételek -->
                <div class="bg-light rounded p-2 mb-2">
                    <div class="d-flex gap-2 align-items-center mb-1 small text-muted fw-bold">
                        <div style="width:70px;">Év</div>
                        <div style="flex:1;">Személy / részlet</div>
                        <div style="width:100px;" class="text-end">Összeg</div>
                        <div style="width:28px;"></div>
                    </div>
                    ${itemsHtml}
                </div>
                <div class="d-flex justify-content-between align-items-center">
                    <button type="button" class="btn btn-sm btn-ghost-orange py-0" onclick="window.addElszItem(${card.id})"><i class="ti ti-plus me-1"></i>Tétel</button>
                    <div class="d-flex gap-2 align-items-center">
                        <input type="text" class="form-control form-control-sm" value="${card.megjegyzes}" placeholder="Megjegyzés..." style="width:180px;" onchange="window.updateElszCard(${card.id}, 'megjegyzes', this.value)">
                        <span class="fw-bold text-success text-nowrap">${cardTotal.toFixed(2)} RON</span>
                    </div>
                </div>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

window.updateAllElszCellek = function() { window.renderElszCards(); };

window.selectElszPerson = function(personId, personName, extraParams) {
    const cardId = extraParams.cardId;
    const card = window.elszState.cards.find(c => c.id === cardId);
    if (!card) return;

    card.szemelyId = personId; card.szemelyNev = personName;
    const person = window.allChurchMembers.find(m => m.id === personId);
    if (person) {
        card.familyMembers = window.allChurchMembers.filter(m => {
            if (m.isvisible === false || m.meghalt === true) return false;
            if (person.family_id && m.family_id === person.family_id) return true;
            if (person.c_utcaid && person.c_szam && m.c_utcaid === person.c_utcaid && m.c_szam === person.c_szam) return true;
            return m.id === person.id; 
        });
        if (card.items.length > 0) card.items[0].memberId = person.id;
    }
    window.renderElszCards();
};

window.updateElszCard = function(cardId, field, value) {
    const card = window.elszState.cards.find(c => c.id === cardId);
    if (card) { card[field] = value; window.renderElszCards(); } 
};

window.addElszItem = function(cardId) {
    const card = window.elszState.cards.find(c => c.id === cardId);
    if (!card) return;
    const lastItem = card.items.length > 0 ? card.items[card.items.length - 1] : null;
    const nextYear = lastItem ? parseInt(lastItem.year) + 1 : new Date().getFullYear();
    card.items.push({ id: Date.now() + Math.random(), year: nextYear, memberId: lastItem ? lastItem.memberId : card.szemelyId, amount: window.evesJarulek || 0 });
    window.renderElszCards();
};

window.removeElszItem = function(cardId, itemId) {
    const card = window.elszState.cards.find(c => c.id === cardId);
    if (card) { card.items = card.items.filter(i => i.id !== itemId); window.renderElszCards(); }
};

window.updateElszItem = function(cardId, itemId, field, value) {
    const card = window.elszState.cards.find(c => c.id === cardId);
    if (!card) return;
    const item = card.items.find(i => i.id === itemId);
    if (item) { item[field] = value; window.renderElszCards(); }
};

window.saveAndPrintElszamolas = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-elszamolas');
    const origText = btn.innerHTML;
    btn.innerHTML = 'Feldolgozás...'; btn.disabled = true;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        if (!user) throw new Error("Nincs bejelentkezett felhasználó!");

        const tipus = document.getElementById('elsz-tipus').value;
        const elszDatum = document.getElementById('elsz-datum').value;
        const ev = elszDatum.split('-')[0];
        const table = tipus === 'B' ? 'befizetes' : 'kiadas';

        const { data: existing } = await _supabase.from(table).select('megjegyzes').eq('congregation_id', activeCongregationId).eq('fizetettev', ev).ilike('megjegyzes', `%Elszámolás: ${ev}/%`);
        let maxNum = 0;
        existing?.forEach(row => {
            const match = row.megjegyzes?.match(new RegExp(`Elszámolás: ${ev}\\/(\\d+)`));
            if (match && parseInt(match[1]) > maxNum) maxNum = parseInt(match[1]);
        });
        const docSzam = `${ev}/${maxNum + 1}`;

        const recordsToInsert = [];
        let totalOsszeg = 0;
        let printHtml = '';
        let sorszamCrt = 1;

        window.elszState.cards.forEach(card => {
            const mapObj = tipus === 'B' ? window.bevCelMap : window.kiaCelMap;
            const kodStr = mapObj[card.celId] || ''; 
            const cellaAdat = szamadasiCellek.find(c => c.id === kodStr);
            const nevHu = cellaAdat ? cellaAdat.nev : 'Ismeretlen Tétel';
            const nevRo = (cellaAdat && cellaAdat.nevro) ? cellaAdat.nevro : '-';

            let printCim = '';
            if (card.szemelyId && window.allChurchMembers) {
                const m = window.allChurchMembers.find(x => x.id == card.szemelyId);
                if (m) {
                    let utcaNeve = m.adrstreet?.name || (window.streetCache ? window.streetCache[m.c_utcaid] : '');
                    let helysegNeve = m.adrlocality?.name || (window.localityCache ? window.localityCache[m.c_helysegid] : '');
                    let cimTomb = [];
                    if (helysegNeve) cimTomb.push(helysegNeve);
                    if (utcaNeve) cimTomb.push(utcaNeve);
                    if (m.c_szam) cimTomb.push(m.c_szam);
                    if (cimTomb.length > 0) printCim = cimTomb.join(', ');
                }
            }

            card.items.forEach(item => {
                const rOsszeg = parseFloat(item.amount) || 0;
                if (rOsszeg <= 0) return; 
                totalOsszeg += rOsszeg;
                
                let printNev = card.szemelyNev;
                if (card.familyMembers.length > 0 && item.memberId) {
                    const tag = card.familyMembers.find(m => m.id == item.memberId);
                    if (tag) printNev = `${tag.csaladnev} ${tag.k_nev}`;
                }

                let forrasHtml = `<strong>${printNev}</strong>`;
                if (printCim) forrasHtml += `<br><span style="font-size:0.85em; color:#555;">${printCim}</span>`;
                forrasHtml += `<br><small class="text-muted">(${item.year}. év)</small>`;

                printHtml += `<tr>
                    <td style="text-align:center;">${sorszamCrt++}.</td>
                    <td>${card.datum}</td>
                    <td>${card.nyugta}</td>
                    <td>
                        <strong style="font-size: 1.1em;">[${kodStr}]</strong><br>
                        <span class="hu-text">${nevHu}</span><br>
                        <span class="ro-text">${nevRo}</span>
                    </td>
                    <td>${forrasHtml}</td>
                    <td style="text-align:right; font-weight:bold; font-size:1.1em;">${rOsszeg.toFixed(2)}</td>
                </tr>`;

                let baseRecord = {
                    congregation_id: activeCongregationId, datum: card.datum, irattipus: "Készpénz", nyugta: card.nyugta, iratszam: card.nyugta,
                    osszeg: rOsszeg, megjegyzes: `Elszámolás: ${docSzam} ${card.megjegyzes ? ' | ' + card.megjegyzes : ''}`, deleted: false, is_potlas: true, userid: user.id
                };

                if (tipus === 'B') {
                    baseRecord.id_befizetescel = parseInt(card.celId, 10); baseRecord.fizetettev = parseInt(item.year, 10);
                    baseRecord.forrasa = printNev; baseRecord.id_szemely = item.memberId ? parseInt(item.memberId, 10) : null;
                    baseRecord.csalad = false; baseRecord.synced = false;
                    baseRecord.xkey = 'B-POT-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5);
                } else {
                    baseRecord.id_kiadascel = parseInt(card.celId, 10); baseRecord.atvevo = printNev;
                    baseRecord.vonatkozo_idoszak = item.year.toString();
                    baseRecord.xkey = 'K-POT-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5);
                }
                recordsToInsert.push(baseRecord);
            });
        });

        if (recordsToInsert.length === 0) throw new Error("Nem adott meg érvényes összeget a kártyákon!");

        const { error } = await _supabase.from(table).insert(recordsToInsert);
        if (error) throw error;

        bootstrap.Modal.getInstance(document.getElementById('modal-elszamolas')).hide();
        await loadTranzakciok();

        window.generateElszamolasPDF(docSzam, elszDatum, printHtml, totalOsszeg);

    } catch (err) { alert("Hiba a mentés során: " + err.message); } 
    finally { btn.innerHTML = '<i class="ti ti-printer me-2"></i> Mentés és Nyomtatás'; btn.disabled = false; }
};

async function reprintElszamolas(docSzam, tipus, elszDatum) {
    try {
        const table = tipus === 'B' ? 'befizetes' : 'kiadas';
        const celIdName = tipus === 'B' ? 'id_befizetescel' : 'id_kiadascel';
        const nevMezo = tipus === 'B' ? 'forrasa' : 'atvevo';

        const { data: rows, error } = await _supabase.from(table)
            .select('*').eq('congregation_id', activeCongregationId)
            .eq('deleted', false).ilike('megjegyzes', `Elszámolás: ${docSzam}%`).order('id', {ascending: true}); 

        if (error) throw error;
        if (!rows || rows.length === 0) { alert("Nem találhatóak a dokumentumhoz tartozó tételek!"); return; }

        let totalOsszeg = 0; let printHtml = ''; let sorszamCrt = 1;

        rows.forEach(r => {
            const kodStr = tipus === 'B' ? window.bevCelMap[r[celIdName]] : window.kiaCelMap[r[celIdName]];
            const cellaAdat = szamadasiCellek.find(c => c.id === kodStr);
            const nevHu = cellaAdat ? cellaAdat.nev : 'Ismeretlen Tétel';
            const nevRo = (cellaAdat && cellaAdat.nevro) ? cellaAdat.nevro : '-';
            const rOsszeg = parseFloat(r.osszeg);
            totalOsszeg += rOsszeg;

            let printCim = '';
            if (r.id_szemely && window.allChurchMembers) {
                const m = window.allChurchMembers.find(x => x.id === r.id_szemely);
                if (m) {
                    let utcaNeve = m.adrstreet?.name || (window.streetCache ? window.streetCache[m.c_utcaid] : '');
                    let helysegNeve = m.adrlocality?.name || (window.localityCache ? window.localityCache[m.c_helysegid] : '');
                    let cimTomb = [];
                    if (helysegNeve) cimTomb.push(helysegNeve);
                    if (utcaNeve) cimTomb.push(utcaNeve);
                    if (m.c_szam) cimTomb.push(m.c_szam);
                    if (cimTomb.length > 0) printCim = cimTomb.join(', ');
                }
            }

            let forrasHtml = `<strong>${r[nevMezo]}</strong>`;
            if (printCim) forrasHtml += `<br><span style="font-size:0.85em; color:#555;">${printCim}</span>`;
            if (r.fizetettev) forrasHtml += `<br><small class="text-muted">(${r.fizetettev}. év)</small>`;
            else if (r.vonatkozo_idoszak) forrasHtml += `<br><small class="text-muted">(${r.vonatkozo_idoszak})</small>`;
            
            printHtml += `<tr>
                <td style="text-align:center;">${sorszamCrt++}.</td>
                <td>${r.datum}</td>
                <td>${r.nyugta || r.iratszam || '-'}</td>
                <td>
                    <strong style="font-size: 1.1em;">[${kodStr}]</strong><br>
                    <span class="hu-text">${nevHu}</span><br>
                    <span class="ro-text">${nevRo}</span>
                </td>
                <td>${forrasHtml}</td>
                <td style="text-align:right; font-weight:bold; font-size:1.1em;">${rOsszeg.toFixed(2)}</td>
            </tr>`;
        });
        window.generateElszamolasPDF(docSzam, elszDatum, printHtml, totalOsszeg);

    } catch (err) { alert("Hiba az újranyomtatás során: " + err.message); }
}

function generateElszamolasPDF(docSzam, elszDatum, tableRowsHTML, totalOsszeg) {
    const egyhazmegye = currentSettings?.egyhazmegye || "..............................";
    const egyhazkozseg_hu = currentSettings?.intezmenyneve || "..............................";
    const egyhazkozseg_ro = currentSettings?.intezmenyneve_ro || "..............................";
    const lelkeszNeve = currentSettings?.lelkesz || "..............................";

    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if(!printWindow) { alert("Engedélyezze a pop-upokat!"); return; }
    printWindow.document.write(`
        <html><head><title>Elszámolás / Decontare - ${docSzam}</title>
            <style>
                body { font-family: 'Times New Roman', serif; color: black; padding: 20px 40px; font-size: 11pt; margin: 0; }
                .no-print { background: #f1f5f9; padding: 15px; text-align: center; border-bottom: 2px solid #cbd5e1; margin-bottom: 20px; font-family: sans-serif; }
                .no-print button { padding: 10px 25px; font-size: 16px; background: #0054a6; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
                @media print { .no-print { display: none !important; } @page { margin: 1.5cm; } }
                .header h4 { font-size: 13pt; margin: 3px 0; font-weight: normal; }
                .title { text-align: center; margin: 25px 0; }
                .title h2 { font-weight: bold; margin: 0; font-size: 18pt; }
                .title h4 { font-weight: normal; margin-top: 5px; color: #333; }
                .text-content { font-size: 11pt; margin-bottom: 20px; line-height: 1.4; text-align: justify; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 30px; }
                th, td { border: 1px solid black; padding: 4px 6px; font-size: 10pt; text-align: left; vertical-align: middle; }
                th { font-weight: bold; text-align: center; background-color: #fcfcfc; }
                .kod-szoveg { display: block; margin-bottom: 2px; }
                .hu-text { font-weight: bold; }
                .ro-text { font-style: italic; color: #444; font-size: 8.5pt;}
                .signatures { display: flex; justify-content: space-between; margin-top: 50px; text-align: center; font-size: 11pt; }
                .signatures div { width: 22%; }
                .signatures hr { border-top: 1px solid black; margin: 0 auto 5px auto; width: 90%; }
                .date-bottom { text-align: right; margin-top: 30px; font-size: 11pt; }
            </style></head>
        <body>
            <div class="no-print"><strong style="font-size: 18px; margin-right: 20px;">🖨️ Nyomtatási Előnézet</strong><button onclick="window.print()">Nyomtatás Indítása</button></div>
            <div class="header"><h4>Erdélyi Református Egyházkerület / Eparhia Reformată din Ardeal</h4><h4>Protopopiatul <strong>${egyhazmegye}</strong> Egyházmegye</h4><h4>Egyházközség / Parohia: <strong>${egyhazkozseg_hu} / ${egyhazkozseg_ro}</strong></h4></div>
            <div class="title"><h2>ELSZÁMOLÁS / DECONTARE</h2><h4>Száma / Nr: <strong>${docSzam}</strong></h4></div>
            <p class="text-content">Alulírott <strong>${lelkeszNeve}</strong>, a mai napon az alábbi, korábban kimaradt vagy utólagosan rögzítendő bizonylatokat hiánypótlás céljából elszámolom, és a pénztárkönyvbe bevezetem. / <br><em>Subsemnatul(a) decontez următoarele documente și le introduc în registrul de casă.</em></p>
            <table><thead><tr><th style="width: 5%;">Nr.</th><th style="width: 11%;">Dátum<br><em>Data</em></th><th style="width: 10%;">Bizonylat<br><em>Nr. act.</em></th><th style="width: 38%;">Megnevezés (Kód)<br><em>Explicație (Cod)</em></th><th style="width: 23%;">Név / Forrás<br><em>Nume / Sursă</em></th><th style="width: 13%;">Összeg<br><em>Suma (RON)</em></th></tr></thead>
            <tbody>${tableRowsHTML}</tbody><tfoot><tr><th colspan="5" style="text-align:right;">ÖSSZESEN / TOTAL:</th><th style="font-size:12pt; text-align:right;">${totalOsszeg.toFixed(2)}</th></tr></tfoot></table>
            <div class="signatures"><div><hr>Ellenőr<br><em>Cenzor</em></div><div><hr>Utalványozó<br><em>Ordonator</em></div><div><hr>Pénztáros<br><em>Casier</em></div><div><hr>Elszámoló<br><em>Decontant</em></div></div>
            <div class="date-bottom">Dátum / Data: <strong>${elszDatum}</strong></div>
        </body></html>
    `);
    printWindow.document.close(); printWindow.focus();
}

function countUniqueDays(transactions, upToDate) {
    const days = new Set();
    transactions.forEach(t => { if (t.datum <= upToDate) days.add(t.datum); });
    return days.size;
}

const titulusok = ['Lelkipásztor', 'Gondnok', 'Pénztáros', 'Könyvelő', 'Irodavezető', 'Adminisztrátor', 'Esperes', 'Főgondnok', 'Ellenőr', 'Főjegyző'];
const generateSigOptions = (selected) => titulusok.map(t => `<option value="${t}" ${t === selected ? 'selected' : ''}>${t}</option>`).join('');

window.printExpenseSheet = function(datum) {
    const gyulNev = currentSettings?.intezmenyneve || "..............................";
    const dailyKia = window.allKiadas.filter(k => k.datum === datum).sort((a,b) => a.id - b.id);
    if(dailyKia.length === 0) return alert("Erre a napra nincs rögzített kiadás!");

    const pageNumber = countUniqueDays(window.allKiadas, datum);
    let rowsHtml = ''; let sum = 0; let minNyugta = Infinity; let maxNyugta = 0;

    dailyKia.forEach(k => {
        const osszeg = parseFloat(k.osszeg); sum += osszeg;
        const num = parseInt(k.nyugta);
        if(!isNaN(num)) { if(num < minNyugta) minNyugta = num; if(num > maxNyugta) maxNyugta = num; }
        const kod = window.kiaCelMap[k.id_kiadascel];
        const celNev = window.szamadasiCellek?.find(c => c.id === kod)?.nev || 'Ismeretlen';

        rowsHtml += `<tr>
            <td style="text-align:center;">${k.nyugta || '-'}</td>
            <td style="text-align:center;">${k.iratszam || '-'}</td>
            <td style="text-align:center;">${k.irattipus || '-'}</td>
            <td><strong>[${kod}] ${celNev}</strong><br><span style="font-size:0.9em; color:#444;">Kiadás megnevezése: ${k.atvevo || ''} ${k.megjegyzes ? '- '+k.megjegyzes : ''}</span></td>
            <td style="text-align:right; font-weight:bold;">${osszeg.toFixed(2)}</td>
        </tr>`;
    });

    const szamSzoveg = minNyugta !== Infinity ? `${minNyugta}${minNyugta !== maxNyugta ? '-'+maxNyugta : ''} sz. kiadás` : "Kiadások";
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    printWindow.document.write(`
        <html><head><title>Kiadási Kísérőív - ${datum}</title>
        <style>
            @page { size: A4 portrait; margin: 1.5cm; } body { font-family: Arial, sans-serif; color: black; margin: 0; padding: 0; }
            .no-print { background: #f1f5f9; padding: 15px; border-bottom: 2px solid #cbd5e1; text-align: center; margin-bottom: 20px; font-family: sans-serif; }
            .no-print select { padding: 5px; margin: 0 10px; font-size: 14px; } .no-print button { padding: 8px 20px; font-size: 16px; background: #0054a6; color: white; border: none; cursor: pointer; border-radius: 5px; font-weight: bold; }
            @media print { .no-print { display: none !important; } } .content { padding: 0 20px; } h3 { margin: 0; font-size: 14pt; }
            .title { text-align: center; margin: 30px 0; } .title h2 { font-weight: bold; margin: 0; font-size: 18pt; text-decoration: underline; } .title h4 { font-weight: normal; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; } th, td { border: 1px solid black; padding: 10px; font-size: 11pt; text-align: left; }
            th { text-align: center; background-color: #f4f4f4; } .total-row th { text-align: right; } .signatures { display: flex; justify-content: space-between; margin-top: 80px; text-align: center; } .signatures div { width: 30%; }
        </style></head>
        <body>
            <div class="no-print">
                <strong style="font-size:18px;">🖨️ Nyomtatási Előnézet</strong><br><br>
                Aláíró 1: <select id="sel-sig1" onchange="updateSig('sig1', this.value)"></select>
                Aláíró 2: <select id="sel-sig2" onchange="updateSig('sig2', this.value)"></select>
                Aláíró 3: <select id="sel-sig3" onchange="updateSig('sig3', this.value)"></select>
                <button onclick="window.print()" style="margin-left: 20px;">Nyomtatás Indítása</button>
            </div>
            <div class="content">
                <h3>${gyulNev} Ref. Egyházközség</h3><div class="title"><h2>KIADÁSI KÍSÉRŐÍV</h2></div>
                <table><thead><tr><th>Kiad.<br>SZ.</th><th>Iratszám</th><th>Irat</th><th>Költségv. Tétel<br>Kiadás megnevezése:</th><th>Összeg</th></tr></thead>
                <tbody>${rowsHtml}</tbody><tfoot><tr class="total-row"><th colspan="4">Összesen kiadás - ${datum}.</th><th style="font-size:13pt;">${sum.toFixed(2)}</th></tr></tfoot></table>
                <p style="font-weight:bold;">${szamSzoveg} ${datum}.</p>
                <div class="signatures"><div><br><br>..............................<br><strong id="sig1">Lelkipásztor</strong></div><div><br><br>..............................<br><strong id="sig2">Főgondnok</strong></div><div><br><br>..............................<br><strong id="sig3">Ellenőr</strong></div></div>
                <div style="text-align:right; margin-top:40px; font-size:10pt;">pg. ${pageNumber}</div>
            </div>
            <script>
                const options = \`${generateSigOptions('')}\`; document.getElementById('sel-sig1').innerHTML = options; document.getElementById('sel-sig2').innerHTML = options; document.getElementById('sel-sig3').innerHTML = options;
                document.getElementById('sel-sig1').value = localStorage.getItem('print_kiser_sig1') || 'Lelkipásztor'; document.getElementById('sel-sig2').value = localStorage.getItem('print_kiser_sig2') || 'Főgondnok'; document.getElementById('sel-sig3').value = localStorage.getItem('print_kiser_sig3') || 'Ellenőr';
                function updateSig(id, val) { document.getElementById(id).innerText = val; localStorage.setItem('print_kiser_' + id, val); } updateSig('sig1', document.getElementById('sel-sig1').value); updateSig('sig2', document.getElementById('sel-sig2').value); updateSig('sig3', document.getElementById('sel-sig3').value);
            </script>
        </body></html>
    `); printWindow.document.close();
};

window.printDailyJournal = function(datum) {
    const gyulNev = currentSettings?.intezmenyneve || "..............................";
    let pageNumber = 1;
    if (typeof countUniqueDays === 'function') { pageNumber = countUniqueDays([...window.allBefizetes, ...window.allKiadas], datum); }

    // Nyitó egyenleg = előző évi átvitel + idei (dátum előtti) forgalom
    let soldPrecedentCash = window.autoCarryoverCash || 0;
    let soldPrecedentBank = window.autoCarryoverBank || 0;
    window.allBefizetes.forEach(b => {
        const d = b.datum ? String(b.datum).split('T')[0] : '';
        if (d < datum) { if (b.irattipus === 'Készpénz') soldPrecedentCash += parseFloat(b.osszeg || 0); else soldPrecedentBank += parseFloat(b.osszeg || 0); }
    });
    window.allKiadas.forEach(k => {
        const d = k.datum ? String(k.datum).split('T')[0] : '';
        if (d < datum) { if (k.irattipus === 'Készpénz') soldPrecedentCash -= parseFloat(k.osszeg || 0); else soldPrecedentBank -= parseFloat(k.osszeg || 0); }
    });

    const dailyBev = window.allBefizetes.filter(b => b.datum === datum).map(b => ({...b, tipus: 'B'}));
    const dailyKia = window.allKiadas.filter(k => k.datum === datum).map(k => ({...k, tipus: 'K'}));
    const dailyAll = [...dailyBev, ...dailyKia].sort((a,b) => a.id - b.id);
    
    let rulajIncasariCash = 0; let rulajPlatiCash = 0; let rulajIncasariBank = 0; let rulajPlatiBank = 0; 
    let rowsHtml = ''; let sorszam = 1;

    dailyAll.forEach(tx => {
        const osszeg = parseFloat(tx.osszeg);
        const kod = tx.tipus === 'B' ? window.bevCelMap[tx.id_befizetescel] : window.kiaCelMap[tx.id_kiadascel];
        const cellaAdat = window.szamadasiCellek?.find(c => c.id === kod);
        const celNevHu = cellaAdat?.nev || 'Ismeretlen';
        const celNevRo = cellaAdat?.nevro ? ` / <em>${cellaAdat.nevro}</em>` : '';
        const forras = tx.tipus === 'B' ? tx.forrasa : tx.atvevo;
        const bizSzam = `${tx.nyugta || ''} ${tx.iratszam || ''}`.trim() || '-';
        
        let incCashStr = ''; let plaCashStr = ''; let incBankStr = ''; let plaBankStr = '';
        if (tx.irattipus === 'Készpénz') {
            if (tx.tipus === 'B') { rulajIncasariCash += osszeg; incCashStr = osszeg.toFixed(2); }
            else { rulajPlatiCash += osszeg; plaCashStr = osszeg.toFixed(2); }
        } else {
            if (tx.tipus === 'B') { rulajIncasariBank += osszeg; incBankStr = osszeg.toFixed(2); }
            else { rulajPlatiBank += osszeg; plaBankStr = osszeg.toFixed(2); }
        }

        rowsHtml += `<tr>
            <td style="text-align:center;">${sorszam++}</td>
            <td style="text-align:center;">${tx.datum}</td>
            <td style="text-align:center;">${tx.irattipus || 'Nyugta'}<br><b>${bizSzam}</b></td>
            <td><strong>[${kod || '-'}]</strong> ${celNevHu}${celNevRo} <br> <small>${forras} ${tx.megjegyzes ? '- '+tx.megjegyzes : ''}</small></td>
            <td style="text-align:right; background-color: #f8fff8;">${incCashStr}</td>
            <td style="text-align:right; background-color: #fff8f8;">${plaCashStr}</td>
            <td style="text-align:right; background-color: #f8fcf8;">${incBankStr}</td>
            <td style="text-align:right; background-color: #f8fcf8;">${plaBankStr}</td>
        </tr>`;
    });

    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if(!printWindow) { alert("A böngésző blokkolta az ablak megnyitását. Kérem engedélyezze a pop-up ablakokat!"); return; }
    
    printWindow.document.write(`
        <html><head><title>Napi Összesítő Napló - ${datum}</title>
        <style>
            @page { size: A4 landscape; margin: 1.5cm; } body { font-family: 'Times New Roman', serif; color: black; margin: 0; padding: 0; }
            .no-print { background: #f1f5f9; padding: 15px; border-bottom: 2px solid #cbd5e1; text-align: center; margin-bottom: 20px; font-family: sans-serif; }
            .no-print select { padding: 5px; margin: 0 10px; font-size: 14px; } .no-print button { padding: 8px 20px; font-size: 16px; background: #0054a6; color: white; border: none; cursor: pointer; border-radius: 5px; font-weight: bold; }
            @media print { .no-print { display: none !important; } } .content { padding: 0 20px; } .header { text-align: center; margin-bottom: 30px; } .header h2 { font-weight: bold; font-size: 16pt; margin: 0; } .header h4 { font-weight: normal; font-size: 12pt; margin: 5px 0 0 0; text-align: left; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 10pt; } th, td { border: 1px solid black; padding: 4px 6px; text-align: left; vertical-align: middle; } th { text-align: center; background-color: #f9f9f9; } .right { text-align: right; font-weight: bold; }
            .signatures { display: flex; justify-content: space-around; margin-top: 50px; text-align: center; } .signatures div { width: 30%; }
        </style></head>
        <body>
            <div class="no-print">
                <strong style="font-size:18px;">🖨️ Nyomtatási Előnézet (Fekvő)</strong><br><br>
                Aláíró 1: <select id="sel-sig1" onchange="updateSig('sig1', this.value)"></select> Aláíró 2: <select id="sel-sig2" onchange="updateSig('sig2', this.value)"></select>
                <button onclick="window.print()" style="margin-left: 20px;">Nyomtatás Indítása</button>
            </div>
            <div class="content">
                <div class="header"><h2>NAPI ÖSSZESÍTŐ PÉNZTÁR ÉS BANK NAPLÓ / JURNAL ZILNIC DE CASA SI BANCA</h2><h4>Unitatea: <strong>${gyulNev}</strong></h4></div>
                <table><thead><tr>
                    <th rowspan="2" style="width:5%;">Nr. crt.</th><th rowspan="2" style="width:9%;">Data</th><th rowspan="2" style="width:14%;">Documentul<br>(Bizonylat)</th><th rowspan="2" style="width:36%;">Explicatii<br>(Magyarázat)</th>
                    <th colspan="2" style="background-color: #eafbea;">CASA (KÉSZPÉNZ)</th><th colspan="2" style="background-color: #eaf3fb;">BANCA (BANK)</th>
                </tr><tr>
                    <th style="width:9%; background-color: #eafbea;">Incasari (Bev.)</th><th style="width:9%; background-color: #eafbea;">Plati (Kiad.)</th><th style="width:9%; background-color: #eaf3fb;">Incasari (Bev.)</th><th style="width:9%; background-color: #eaf3fb;">Plati (Kiad.)</th>
                </tr></thead>
                <tbody>
                    <tr><td colspan="4" class="right">Sold precedent / Előző egyenleg</td><td colspan="2" class="right text-center" style="background-color: #f8fff8;">${soldPrecedentCash.toFixed(2)} RON</td><td colspan="2" class="right text-center" style="background-color: #f8fcf8;">${soldPrecedentBank.toFixed(2)} RON</td></tr>
                    ${rowsHtml}
                    <tr style="background-color: #f9f9f9;"><td colspan="4" class="right">Rulaj curent / Napi forgalom</td><td class="right">${rulajIncasariCash.toFixed(2)}</td><td class="right">${rulajPlatiCash.toFixed(2)}</td><td class="right">${rulajIncasariBank.toFixed(2)}</td><td class="right">${rulajPlatiBank.toFixed(2)}</td></tr>
                    <tr style="background-color: #f1f5f9;"><td colspan="4" class="right">Sold ziua urmatoare / Záró egyenleg</td><td colspan="2" class="right text-center" style="font-size:12pt;">${(soldPrecedentCash + rulajIncasariCash - rulajPlatiCash).toFixed(2)} RON</td><td colspan="2" class="right text-center" style="font-size:12pt;">${(soldPrecedentBank + rulajIncasariBank - rulajPlatiBank).toFixed(2)} RON</td></tr>
                </tbody></table>
                <div class="signatures"><div><br><br>..............................<br><strong id="sig1">Pénztáros</strong></div><div><br><br>..............................<br><strong id="sig2">Könyvelő</strong></div></div>
                <div style="text-align:right; margin-top:30px; font-size:10pt;">pg. ${pageNumber}</div>
            </div>
            <script>
                const titulusok = ['Lelkipásztor', 'Gondnok', 'Pénztáros', 'Könyvelő', 'Irodavezető', 'Adminisztrátor', 'Esperes', 'Főgondnok', 'Ellenőr', 'Főjegyző'];
                const generateSigOptions = (selected) => titulusok.map(t => \`<option value="\${t}" \${t === selected ? 'selected' : ''}>\${t}</option>\`).join('');
                const options = generateSigOptions(''); document.getElementById('sel-sig1').innerHTML = options; document.getElementById('sel-sig2').innerHTML = options;
                document.getElementById('sel-sig1').value = localStorage.getItem('print_naplo_sig1') || 'Pénztáros'; document.getElementById('sel-sig2').value = localStorage.getItem('print_naplo_sig2') || 'Könyvelő';
                function updateSig(id, val) { document.getElementById(id).innerText = val; localStorage.setItem('print_naplo_' + id, val); } updateSig('sig1', document.getElementById('sel-sig1').value); updateSig('sig2', document.getElementById('sel-sig2').value);
            </script>
        </body></html>
    `); printWindow.document.close();
};

window.UniversalSmartSearch = function(query, resultsContainerId, onSelectFunctionName, extraParamsObj = null) {
    const resultsContainer = document.getElementById(resultsContainerId);
    const qRaw = query.trim();
    if (qRaw.length < 2) { resultsContainer.classList.add('d-none'); return; }
    if (!window.allChurchMembers || window.allChurchMembers.length === 0) {
        resultsContainer.innerHTML = `<div class="list-group-item text-danger bg-light"><i class="ti ti-alert-triangle me-2"></i>A tagok listája még nem töltött be!</div>`;
        resultsContainer.classList.remove('d-none'); return;
    }
    const normalizeStr = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
    const qNorm = normalizeStr(qRaw);
    
    const activeMembers = window.allChurchMembers.filter(m => m.isvisible !== false && m.meghalt !== true);
    const matches = activeMembers.filter(m => {
        const name1 = normalizeStr(`${m.csaladnev || ''} ${m.k_nev || ''}`);
        const name2 = normalizeStr(`${m.k_nev || ''} ${m.csaladnev || ''}`);
        return name1.includes(qNorm) || name2.includes(qNorm);
    }).slice(0, 10); 

    if (matches.length === 0) {
        resultsContainer.innerHTML = `<div class="list-group-item text-danger bg-white fw-bold border-bottom"><i class="ti ti-user-off me-2"></i>Nincs találat az aktív egyháztagok között. (Külsős)</div>`;
    } else {
        resultsContainer.innerHTML = matches.map(m => {
            let ageStr = "?";
            if (m.sz_datum) {
                const birthYear = new Date(m.sz_datum).getFullYear();
                if (birthYear > 1900) ageStr = (new Date().getFullYear() - birthYear) + " éves";
            }
            let utcaNeve = m.adrstreet?.name || (window.streetCache && window.streetCache[m.c_utcaid] ? window.streetCache[m.c_utcaid] : `Kód: ${m.c_utcaid}`);
            let helysegNeve = m.adrlocality?.name || (window.localityCache && window.localityCache[m.c_helysegid] ? window.localityCache[m.c_helysegid] : "");
            let cimTomb = []; if (helysegNeve) cimTomb.push(helysegNeve); if (utcaNeve) cimTomb.push(utcaNeve); if (m.c_szam) cimTomb.push(m.c_szam);
            const cim = cimTomb.length > 0 ? cimTomb.join(', ') : 'Nincs pontos cím rögzítve';
            const extraStr = extraParamsObj ? `, ${JSON.stringify(extraParamsObj).replace(/"/g, '&quot;')}` : '';
            const safeName = `${m.csaladnev || ''} ${m.k_nev || ''}`.replace(/'/g, "\\'");
            const onClickCode = `window.${onSelectFunctionName}(${m.id}, '${safeName}'${extraStr})`;

            return `<button type="button" class="list-group-item list-group-item-action py-2 bg-white border-bottom" onclick="${onClickCode}">
                        <div class="d-flex justify-content-between align-items-center"><span class="fw-bold text-primary" style="font-size: 1.05em;">${m.csaladnev} ${m.k_nev}</span><span class="badge bg-secondary text-white">${ageStr}</span></div>
                        <div class="small text-dark mt-1"><i class="ti ti-home me-1 text-muted"></i>${cim}</div>
                    </button>`;
        }).join('');
    }
    resultsContainer.classList.remove('d-none');
}
