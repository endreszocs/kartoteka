// --- pages/js/member_api.js ---

let allMembersData = [];
let currentEditingMemberId = null;
let memberSortState = { col: 'id', dir: 'desc' }; // Alapértelmezett: legfrissebb felül

window.sortByColumn = function(col) {
    if (memberSortState.col === col) {
        memberSortState.dir = memberSortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
        memberSortState.col = col;
        memberSortState.dir = 'asc';
    }
    updateSortArrows();
    filterAndSortMembers();
};

function updateSortArrows() {
    const cols = ['name', 'age', 'birth', 'address', 'job'];
    cols.forEach(col => {
        const icon = document.getElementById(`sort-icon-${col}`);
        if (!icon) return;
        if (memberSortState.col === col) {
            icon.className = memberSortState.dir === 'asc'
                ? 'ti ti-sort-ascending sort-icon text-primary'
                : 'ti ti-sort-descending sort-icon text-primary';
        } else {
            icon.className = 'ti ti-selector sort-icon text-muted';
        }
    });
}

// --- GLOBÁLIS ABLAK NAVIGÁTOR (MODAL STACK) ---
window.appModalStack = [];
window.isSystemClosingModal = false;

window.openNextModal = function(currentModalId, nextModalFunc) {
    window.appModalStack.push(currentModalId);
    window.isSystemClosingModal = true;
    const inst = bootstrap.Modal.getInstance(document.getElementById(currentModalId));
    if (inst) inst.hide();
    
    setTimeout(() => {
        window.isSystemClosingModal = false;
        nextModalFunc(); // Megnyitjuk a következőt
    }, 400); // Várunk az eltűnési animációra
};

// Figyeljük az összes ablak bezárását (Az 'X' vagy 'Mégse' gombot)
document.addEventListener('hidden.bs.modal', function (event) {
    // Stack navigáció: visszalépünk az előző ablakhoz
    if (!window.isSystemClosingModal && window.appModalStack.length > 0) {
        const prevModalId = window.appModalStack.pop();
        setTimeout(() => {
            bootstrap.Modal.getOrCreateInstance(document.getElementById(prevModalId)).show();
        }, 50);
    }

    // Backdrop cleanup: ha nincs több nyitott modal, takarítunk
    setTimeout(() => {
        const openModals = document.querySelectorAll('.modal.show');
        if (openModals.length === 0) {
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('padding-right');
        }
    }, 300);
});

// 🚨 A HIÁNYZÓ NÉV-FORMÁZÓ MOTOR (PREFIXEKHEZ) 🚨
window.formatNameWithPrefix = function(member, spouse = null, mode = 'html') {
    if (!member) return '-';
    let prefixes = [];
    
    if (member.allapot === 'elvált') prefixes.push('elv.');
    
    let isOzvegy = (member.allapot === 'özvegy');
    if (!isOzvegy && spouse && spouse.meghalt) isOzvegy = true;
    if (isOzvegy) prefixes.push('özv.');

    if (member.namepattern) prefixes.push(member.namepattern);
    
    const prefixText = prefixes.length > 0 ? prefixes.join(' ') + ' ' : '';
    if (mode === 'html' && prefixText) return `<span class="text-danger fw-bold me-1">${prefixText}</span>${member.csaladnev} ${member.k_nev}`;
    if (mode === 'print' && prefixText) return `<b>${prefixText}</b>${member.csaladnev} ${member.k_nev}`;
    return `${prefixText}${member.csaladnev} ${member.k_nev}`;
};

// ==========================================
// 1. TÁBLÁZAT BETÖLTÉSE
// ==========================================
async function loadMembers() {
    try {
        var profile = typeof getCachedProfile === 'function' ? await getCachedProfile() : null;
        if (!profile) {
            const { data: { user } } = await _supabase.auth.getUser();
            if (!user) return;
            const { data: p } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();
            profile = p;
        }
        if (!profile || !profile.congregation_id) return;

        const currentYear = new Date().getFullYear();
        const _q = typeof cachedQuery === 'function' ? cachedQuery : function(_k, fn) { return fn(); };
        const congId = profile.congregation_id;

        const [membersRes, paymentsRes, exemptionsRes, familiesRes, childrenRes] = await Promise.all([
            _q('members_' + congId, () => _supabase.from('szemely').select(`*, adrstreet!c_utcaid(name), adrlocality!c_helysegid(name)`).eq('congregation_id', congId).eq('isvisible', true).order('id', { ascending: false })),
            _q('members_payments_' + currentYear, () => _supabase.from('befizetes').select('id_szemely, id_csalad').eq('congregation_id', congId).eq('fizetettev', currentYear).or('deleted.eq.false,deleted.is.null')),
            _q('members_exemptions', () => _supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege')),
            _q('members_families', () => _supabase.from('csalad').select('id, id_ferfi, id_no')),
            _q('members_children', () => _supabase.from('gyerek').select('id_szemely, id_csalad'))
        ]);

        if (membersRes.error) throw membersRes.error;

        const personToFamily = {};
        if (familiesRes.data) familiesRes.data.forEach(f => { if (f.id_ferfi) personToFamily[f.id_ferfi] = f.id; if (f.id_no) personToFamily[f.id_no] = f.id; });
        if (childrenRes.data) childrenRes.data.forEach(c => { if (c.id_szemely) personToFamily[c.id_szemely] = c.id_csalad; });
        window.personToFamilyMap = personToFamily; // Globális elérés a személy-modal "Ugrás a Családhoz" gombjához

        const paidPersons = new Set(), paidFamilies = new Set();
        if (paymentsRes.data) paymentsRes.data.forEach(p => { if (p.id_szemely) paidPersons.add(p.id_szemely); if (p.id_csalad) paidFamilies.add(p.id_csalad); });
        window.paidPersonsSet = paidPersons; // Szűrőhöz: egyházfenntartást fizető = egyháztag

        const exemptPersons = new Set(), exemptFamilies = new Set();
        if (exemptionsRes.data) exemptionsRes.data.forEach(e => {
            if (currentYear >= (e.kezdete || 0) && currentYear <= (e.vege || 2099)) {
                if (e.id_szemely) exemptPersons.add(e.id_szemely);
                if (e.id_csalad) exemptFamilies.add(e.id_csalad);
            }
        });

        allMembersData = membersRes.data.map(m => {
            const famId = personToFamily[m.id];
            let statusHtml = '<span class="badge bg-danger">Hátralékos</span>';
            if (m.meghalt) statusHtml = '<span class="badge bg-dark">Elhunyt</span>';
            else if (m.elkoltozott) statusHtml = '<span class="badge bg-secondary">Elköltözött</span>';
            else if (m.member_status === 'kitért') statusHtml = '<span class="badge bg-warning text-dark">Kitért</span>';
            else {
                if (exemptPersons.has(m.id) || (famId && exemptFamilies.has(famId))) statusHtml = '<span class="badge bg-warning text-dark"><i class="ti ti-shield-check me-1"></i>Felmentett</span>';
                else if (paidPersons.has(m.id) || (famId && paidFamilies.has(famId))) statusHtml = '<span class="badge bg-success"><i class="ti ti-check me-1"></i>Rendezve</span>';
            }
            return { ...m, calc_status_html: statusHtml };
        });

        // Alapertelmezett szuro alkalmazasa ("Aktiv gyulekezeti tagok") az oldal betoltesekor
        window.filterAndSortMembers();
        populateParentsDatalist(allMembersData);
    // 🚨 ÚJ: AZ ÁTTEKINTÉS GENERÁLÁSA 🚨
        if (typeof window.generateOverviewDashboard === 'function') {
            window.generateOverviewDashboard(membersRes.data);
        }
        
    } catch (err) { console.error("Hiba:", err); }
}
// ==========================================
// 🚨 ÚJ: ÁTTEKINTÉS (VEZÉRLŐPULT) MOTOR 🚨
// ==========================================
window.generateOverviewDashboard = function(allMembersFromDb) {
    if (!allMembersFromDb) return;

    const currentYear = new Date().getFullYear();
    
    // Alap halmazok — élő tagok, más felekezetűek kizárva (üres vallás = református)
    // Csak református tagok és azok, akiknél nincs kitöltve a vallás mező
    const aliveMembers = allMembersFromDb.filter(m => {
        if (m.meghalt || m.elkoltozott || m.member_status === 'törölt') return false;
        const v = (m.vallas || '').trim().toLowerCase();
        return v === '' || v === 'református';
    });
    const total = aliveMembers.length;
    
    const deadMembers = allMembersFromDb.filter(m => m.meghalt && m.sz_datum);
    
    // 1. Nemek
    const menCount = aliveMembers.filter(m => m.ferfi).length;
    const womenCount = total - menCount;
    const menPct = total > 0 ? Math.round((menCount / total) * 100) : 0;
    const womenPct = total > 0 ? Math.round((womenCount / total) * 100) : 0;

    document.getElementById('dash-total-members').innerText = total;
    document.getElementById('dash-men-count').innerText = `${menCount} fő (${menPct}%)`;
    document.getElementById('dash-women-count').innerText = `${womenCount} fő (${womenPct}%)`;
    document.getElementById('dash-men-bar').style.width = `${menPct}%`;
    document.getElementById('dash-women-bar').style.width = `${womenPct}%`;

    // 2. Korcsoportok és Átlagéletkor (bővített idős kategóriákkal)
    const ages = {
        '0-6': 0, '7-12': 0, '13-14': 0, '15-18': 0, '19-30': 0,
        '31-40': 0, '41-65': 0, '66-75': 0, '76-80': 0, '81-100': 0, '100+': 0
    };
    const ageColors = {
        '0-6': '#4dabf7', '7-12': '#3bc9db', '13-14': '#38d9a9', '15-18': '#69db7c',
        '19-30': '#a9e34b', '31-40': '#ffd43b', '41-65': '#ffa94d',
        '66-75': '#ff8787', '76-80': '#e599f7', '81-100': '#b197fc', '100+': '#da77f2'
    };
    const ageLabels = {
        '0-6': 'Kisgyermek', '7-12': 'Gyermek', '13-14': 'Serdülő', '15-18': 'Ifjú',
        '19-30': 'Fiatal felnőtt', '31-40': 'Felnőtt', '41-65': 'Középkorú',
        '66-75': 'Idős', '76-80': 'Agg', '81-100': 'Matuzsálem', '100+': 'Százéves+'
    };
    let totalAge = 0;
    let ageCount = 0;
    let ageDetails = []; // egyedi életkorok az előrejelzéshez
    let menTotalAge = 0, menAgeCount = 0;
    let womenTotalAge = 0, womenAgeCount = 0;

    aliveMembers.forEach(m => {
        if (m.sz_datum) {
            const age = currentYear - new Date(m.sz_datum).getFullYear();
            if (age >= 0) {
                totalAge += age;
                ageCount++;
                ageDetails.push(age);
                if (m.ferfi === true) { menTotalAge += age; menAgeCount++; }
                else if (m.ferfi === false) { womenTotalAge += age; womenAgeCount++; }
                if (age <= 6) ages['0-6']++;
                else if (age <= 12) ages['7-12']++;
                else if (age <= 14) ages['13-14']++;
                else if (age <= 18) ages['15-18']++;
                else if (age <= 30) ages['19-30']++;
                else if (age <= 40) ages['31-40']++;
                else if (age <= 65) ages['41-65']++;
                else if (age <= 75) ages['66-75']++;
                else if (age <= 80) ages['76-80']++;
                else if (age <= 100) ages['81-100']++;
                else ages['100+']++;
            }
        }
    });

    const avgAge = ageCount > 0 ? (totalAge / ageCount).toFixed(1) : 0;
    const avgAgeMen = menAgeCount > 0 ? (menTotalAge / menAgeCount).toFixed(1) : '-';
    const avgAgeWomen = womenAgeCount > 0 ? (womenTotalAge / womenAgeCount).toFixed(1) : '-';
    const avgAgeEl = document.getElementById('dash-avg-age');
    if (avgAgeEl) {
        avgAgeEl.innerHTML = `
            <div class="fw-bold mb-1" style="font-size:1.3rem;">${avgAge} év</div>
            <div class="d-flex justify-content-center gap-3" style="font-size:0.78rem;">
                <span class="text-blue"><i class="ti ti-gender-male me-1"></i>${avgAgeMen} év <span class="text-muted">(${menAgeCount} fő)</span></span>
                <span class="text-pink"><i class="ti ti-gender-female me-1"></i>${avgAgeWomen} év <span class="text-muted">(${womenAgeCount} fő)</span></span>
            </div>`;
    }

    const tbodyAges = document.getElementById('dash-age-groups');
    if (tbodyAges) {
        tbodyAges.innerHTML = Object.keys(ages).map(key => {
            const count = ages[key];
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const color = ageColors[key] || '#0ca678';
            return `
            <tr>
                <td class="w-1 fw-bold text-nowrap" style="font-size:0.8rem;" title="${ageLabels[key]}">${key} év</td>
                <td class="w-100 align-middle"><div class="progress progress-sm"><div class="progress-bar" style="width:${pct}%;background:${color}"></div></div></td>
                <td class="w-1 text-end fw-bold text-nowrap" style="font-size:0.8rem;">${count}</td>
                <td class="w-1 text-end text-muted text-nowrap" style="font-size:0.75rem;">${pct}%</td>
            </tr>`;
        }).join('');
    }

    // Előrejelzés: mire számíthat a gyülekezet
    const forecastEl = document.getElementById('dash-age-forecast');
    if (forecastEl && ageDetails.length > 0) {
        // 5 és 10 éves előrejelzés
        const forecast = (yearsAhead) => {
            let konfirmando = 0, valaszto = 0, idos75 = 0, idos80 = 0;
            ageDetails.forEach(age => {
                const futureAge = age + yearsAhead;
                if (futureAge >= 13 && futureAge <= 15 && age < 13) konfirmando++;
                if (futureAge >= 18 && age < 18) valaszto++;
                if (futureAge > 75) idos75++;
                if (futureAge > 80) idos80++;
            });
            return { konfirmando, valaszto, idos75, idos80 };
        };

        const f5 = forecast(5);
        const f10 = forecast(10);

        // Választójog: 18+ jelenleg
        const currentVoters = ageDetails.filter(a => a >= 18).length;
        // Konfirmandusok: 13-14 évesek
        const currentKonfirmando = ages['13-14'];
        // Iskoláskorú (7-18)
        const schoolAge = ages['7-12'] + ages['13-14'] + ages['15-18'];
        // 80 év felettiek jelenleg (81+)
        const currentOver80 = ages['81-100'] + ages['100+'];

        forecastEl.innerHTML = `
            <div class="row g-2">
                <div class="col-6">
                    <div class="card card-sm bg-blue-lt border-0">
                        <div class="card-body p-2 text-center">
                            <div class="text-muted" style="font-size:0.7rem;">Jelenlegi választók</div>
                            <div class="fw-bold text-blue" style="font-size:1.1rem;">${currentVoters} fő</div>
                        </div>
                    </div>
                </div>
                <div class="col-6">
                    <div class="card card-sm bg-green-lt border-0">
                        <div class="card-body p-2 text-center">
                            <div class="text-muted" style="font-size:0.7rem;">Konfirmandusok</div>
                            <div class="fw-bold text-green" style="font-size:1.1rem;">${currentKonfirmando} fő</div>
                        </div>
                    </div>
                </div>
                <div class="col-6">
                    <div class="card card-sm bg-orange-lt border-0">
                        <div class="card-body p-2 text-center">
                            <div class="text-muted" style="font-size:0.7rem;">Iskoláskorú (7-18)</div>
                            <div class="fw-bold text-orange" style="font-size:1.1rem;">${schoolAge} fő</div>
                        </div>
                    </div>
                </div>
                <div class="col-6">
                    <div class="card card-sm bg-red-lt border-0">
                        <div class="card-body p-2 text-center">
                            <div class="text-muted" style="font-size:0.7rem;">80 év felettiek</div>
                            <div class="fw-bold text-red" style="font-size:1.1rem;">${currentOver80} fő</div>
                        </div>
                    </div>
                </div>
                <div class="col-12 mt-1">
                    <table class="table table-sm table-borderless mb-0" style="font-size:0.78rem;">
                        <thead><tr class="text-muted"><th></th><th class="text-center">5 év</th><th class="text-center">10 év</th></tr></thead>
                        <tbody>
                            <tr>
                                <td class="text-muted"><i class="ti ti-book me-1"></i>Új konfirmandusok</td>
                                <td class="text-center fw-bold text-green">${f5.konfirmando}</td>
                                <td class="text-center fw-bold text-green">${f10.konfirmando}</td>
                            </tr>
                            <tr>
                                <td class="text-muted"><i class="ti ti-checkbox me-1"></i>Új választók (18+)</td>
                                <td class="text-center fw-bold text-blue">${f5.valaszto}</td>
                                <td class="text-center fw-bold text-blue">${f10.valaszto}</td>
                            </tr>
                            <tr>
                                <td class="text-muted"><i class="ti ti-heart me-1"></i>75 év felettiek</td>
                                <td class="text-center fw-bold text-orange">${f5.idos75}</td>
                                <td class="text-center fw-bold text-orange">${f10.idos75}</td>
                            </tr>
                            <tr>
                                <td class="text-muted"><i class="ti ti-old me-1"></i>80 év felettiek</td>
                                <td class="text-center fw-bold text-red">${f5.idos80}</td>
                                <td class="text-center fw-bold text-red">${f10.idos80}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    // 3. Halálozási Átlagéletkor — nemek szerint
    let deadMenAge = 0, deadMenCount = 0;
    let deadWomenAge = 0, deadWomenCount = 0;
    deadMembers.forEach(m => {
        if (m.sz_datum) {
            const deathYear = m.updated_at ? new Date(m.updated_at).getFullYear() : currentYear;
            const age = deathYear - new Date(m.sz_datum).getFullYear();
            if (age > 0 && age < 130) {
                if (m.ferfi) { deadMenAge += age; deadMenCount++; }
                else { deadWomenAge += age; deadWomenCount++; }
            }
        }
    });
    const avgDeathMen = deadMenCount > 0 ? (deadMenAge / deadMenCount).toFixed(1) : '-';
    const avgDeathWomen = deadWomenCount > 0 ? (deadWomenAge / deadWomenCount).toFixed(1) : '-';
    const avgDeathAll = (deadMenCount + deadWomenCount) > 0 ? ((deadMenAge + deadWomenAge) / (deadMenCount + deadWomenCount)).toFixed(1) : '-';

    const deathEl = document.getElementById('dash-avg-death');
    if (deathEl) {
        deathEl.innerHTML = `
            <div class="fw-bold mb-1" style="font-size:1.3rem;">${avgDeathAll} év</div>
            <div class="d-flex justify-content-center gap-3" style="font-size:0.78rem;">
                <span class="text-blue"><i class="ti ti-gender-male me-1"></i>${avgDeathMen} év <span class="text-muted">(${deadMenCount} fő)</span></span>
                <span class="text-pink"><i class="ti ti-gender-female me-1"></i>${avgDeathWomen} év <span class="text-muted">(${deadWomenCount} fő)</span></span>
            </div>`;
    }

    // 4. Rekordok & Érdekességek
    const recordsEl = document.getElementById('dash-records');
    if (recordsEl) {
        // Legidősebb és legfiatalabb tag
        let oldest = null, youngest = null;
        aliveMembers.forEach(m => {
            if (!m.sz_datum) return;
            const bd = new Date(m.sz_datum);
            if (!oldest || bd < new Date(oldest.sz_datum)) oldest = m;
            if (!youngest || bd > new Date(youngest.sz_datum)) youngest = m;
        });
        const fmtAge = (m) => {
            if (!m || !m.sz_datum) return '-';
            return currentYear - new Date(m.sz_datum).getFullYear();
        };
        const fmtName = (m) => m ? `${m.csaladnev} ${m.k_nev}` : '-';

        // Települési megoszlás top 5
        const localities = {};
        aliveMembers.forEach(m => {
            const loc = m.adrlocality?.name;
            if (loc) localities[loc] = (localities[loc] || 0) + 1;
        });
        const topLoc = Object.entries(localities).sort((a,b) => b[1] - a[1]).slice(0, 5);
        const locMax = topLoc.length > 0 ? topLoc[0][1] : 1;

        recordsEl.innerHTML = `
            <div class="border rounded p-2 mb-2">
                <div class="text-muted fw-bold mb-2" style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;">
                    <i class="ti ti-award me-1"></i>Rekordok
                </div>
                <div class="d-flex align-items-center gap-2 mb-2">
                    <span class="avatar avatar-sm bg-orange-lt text-orange"><i class="ti ti-crown"></i></span>
                    <div style="font-size:0.82rem;"><span class="fw-bold">${fmtName(oldest)}</span> <span class="text-muted">— ${fmtAge(oldest)} éves (legidősebb)</span></div>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <span class="avatar avatar-sm bg-green-lt text-green"><i class="ti ti-baby-carriage"></i></span>
                    <div style="font-size:0.82rem;"><span class="fw-bold">${fmtName(youngest)}</span> <span class="text-muted">— ${fmtAge(youngest)} éves (legfiatalabb)</span></div>
                </div>
            </div>
            <div class="border rounded p-2">
                <div class="text-muted fw-bold mb-2" style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;">
                    <i class="ti ti-map-pin me-1"></i>Települések (top 5)
                </div>
                ${topLoc.map(([name, cnt]) => {
                    const pct = Math.round((cnt / locMax) * 100);
                    return `<div class="d-flex align-items-center gap-2 mb-1" style="font-size:0.78rem;">
                        <span class="fw-bold text-dark text-truncate" style="min-width:90px;">${name}</span>
                        <div class="flex-fill"><div class="progress progress-sm"><div class="progress-bar bg-primary" style="width:${pct}%"></div></div></div>
                        <span class="text-muted text-nowrap">${cnt}</span>
                    </div>`;
                }).join('')}
            </div>`;
    }

    // 5. Státusz összesítés
    const statusEl = document.getElementById('dash-status-breakdown');
    if (statusEl) {
        const deadCount = allMembersFromDb.filter(m => m.meghalt).length;
        const movedCount = allMembersFromDb.filter(m => m.elkoltozott).length;
        const leftCount = allMembersFromDb.filter(m => m.member_status === 'kitért').length;
        statusEl.innerHTML = `
            <div class="d-flex justify-content-around text-center mt-3 pt-2 border-top" style="font-size:0.78rem;">
                <div><div class="fw-bold text-dark" style="font-size:1.1rem;">${deadCount}</div><div class="text-muted">Elhunyt</div></div>
                <div><div class="fw-bold text-secondary" style="font-size:1.1rem;">${movedCount}</div><div class="text-muted">Elköltözött</div></div>
                <div><div class="fw-bold text-warning" style="font-size:1.1rem;">${leftCount}</div><div class="text-muted">Kitért</div></div>
            </div>`;
    }

    // 6. Top 15 Nevek (Családnevek és Keresztnevek)
    const famNames = {}, firstNames = {};
    aliveMembers.forEach(m => {
        if (m.csaladnev) { const n = m.csaladnev.trim(); famNames[n] = (famNames[n] || 0) + 1; }
        if (m.k_nev) { const n = m.k_nev.trim().split(' ')[0]; firstNames[n] = (firstNames[n] || 0) + 1; }
    });

    const getTop15Html = (nameObj, icon, color) => {
        const sorted = Object.entries(nameObj).sort((a,b) => b[1] - a[1]).slice(0, 15);
        if (sorted.length === 0) return '<div class="p-3 text-muted text-center">Nincs elegendő adat.</div>';
        const maxCount = sorted[0][1];
        return sorted.map((item, index) => {
            const barPct = maxCount > 0 ? Math.round((item[1] / maxCount) * 100) : 0;
            return `
            <div class="d-flex align-items-center gap-2 py-1" style="font-size:0.78rem;">
                <span class="badge bg-${color}-lt" style="min-width:24px;">${index + 1}.</span>
                <span class="fw-bold text-dark text-truncate" style="min-width:80px;">${item[0]}</span>
                <div class="flex-fill"><div class="progress progress-sm"><div class="progress-bar bg-${color}" style="width:${barPct}%"></div></div></div>
                <span class="text-muted text-nowrap">${item[1]}</span>
            </div>`;
        }).join('');
    };

    document.getElementById('dash-top-fam-names').innerHTML = getTop15Html(famNames, 'ti ti-users', 'blue');
    document.getElementById('dash-top-first-names').innerHTML = getTop15Html(firstNames, 'ti ti-user', 'pink');
};

function displayMembers(members) {
    const tbody = document.getElementById('member-list-body');
    if (!tbody) return;
    if (!members || members.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">Nincs még rögzített tag.</td></tr>';
        document.getElementById('member-count').innerText = "0 fő"; return;
    }
    document.getElementById('member-count').innerText = `${members.length} fő a nyilvántartásban`;
    tbody.innerHTML = members.map(m => {
        let age = '-';
        if (m.sz_datum) age = Math.abs(new Date(Date.now() - new Date(m.sz_datum).getTime()).getUTCFullYear() - 1970);
        const utca = m.adrstreet ? m.adrstreet.name : '?';
        const reszletek = [m.c_tombhaz ? `Bl.${m.c_tombhaz}` : '', m.c_lepcsohaz ? `Sc.${m.c_lepcsohaz}` : '', m.c_ajto ? `Ap.${m.c_ajto}` : ''].filter(Boolean).join(', ');
        const lakcim = `${utca} ${m.c_szam || ''} ${reszletek ? `(${reszletek})` : ''}`.trim();
        
        const formattedName = window.formatNameWithPrefix(m, m._spouse, 'html');

        return `
            <tr class="table-row-hover" style="cursor:pointer;">
                <td onclick="openMemberDetails(${m.id})">
                    <div class="fw-bold text-primary fs-4">${formattedName} ${m.ferfi ? '<i class="ti ti-gender-male text-blue"></i>' : '<i class="ti ti-gender-female text-pink"></i>'}</div>
                    <div class="text-muted small mt-1"><i class="ti ti-map-pin me-1"></i>${lakcim}</div>
                </td>
                <td onclick="openMemberDetails(${m.id})" class="align-middle"><span class="badge bg-blue-lt fs-5">${age} év</span></td>
                <td onclick="openMemberDetails(${m.id})" class="align-middle"><i class="ti ti-calendar text-muted me-1"></i>${m.sz_datum || '-'}</td>
                <td onclick="openMemberDetails(${m.id})" class="align-middle fw-bold">${m.adrlocality?.name || '-'}</td>
                <td onclick="openMemberDetails(${m.id})" class="align-middle text-muted">${m.foglalkozas || '-'}</td>
                <td class="align-middle">
                    <div class="d-flex align-items-center justify-content-between">
                        ${m.calc_status_html}
                        <button class="btn btn-sm btn-outline-danger ms-3 shadow-sm" onclick="event.stopPropagation(); openRemoveModal(${m.id}, '${m.csaladnev} ${m.k_nev}')" title="Tag kivezetése / Törlése">
                            <i class="ti ti-user-minus"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

window.filterAndSortMembers = function() {
    if (!allMembersData || allMembersData.length === 0) return;

    const query = document.getElementById('member-search-input').value.toLowerCase();
    const status = document.getElementById('member-status-filter').value;

    // 1. Szűrés (Keresés és Státusz)
    let filtered = allMembersData.filter(m => {
        const nameMatch = `${m.csaladnev} ${m.k_nev}`.toLowerCase().includes(query);
        const addressMatch = `${m.adrlocality?.name || ''} ${m.adrstreet?.name || ''} ${m.c_szam || ''}`.toLowerCase().includes(query);
        const searchMatch = nameMatch || addressMatch;

        let statusMatch = true;
        if (status === 'aktív' || status === '') {
            // Alapértelmezett nézet: élő + (református VAGY nincs megadva vallás VAGY egyházfenntartást fizet)
            const isAlive = !m.meghalt && !m.elkoltozott && m.member_status !== 'kitért' && m.member_status !== 'törölt';
            const v = (m.vallas || '').trim().toLowerCase();
            const isRefOrEmpty = v === '' || v === 'református';
            const isPayer = window.paidPersonsSet?.has(m.id);
            statusMatch = isAlive && (isRefOrEmpty || isPayer);
        } else if (status === 'meghalt') {
            statusMatch = !!m.meghalt;
        } else if (status === 'elköltözött') {
            statusMatch = !!m.elkoltozott;
        } else if (status === 'kitért') {
            statusMatch = m.member_status === 'kitért';
        } else if (status === 'mas_vallasu') {
            // Más vallásúak (nem református és nem fizet)
            const v = (m.vallas || '').trim().toLowerCase();
            const isNotRef = v !== '' && v !== 'református';
            statusMatch = isNotRef && !m.meghalt;
        } else if (status === 'mind' || status === 'minden') {
            statusMatch = true; // Mindenki látható
        }

        return searchMatch && statusMatch;
    });

    // 2. Rendezés az aktuális oszlop-állapot szerint
    const { col, dir } = memberSortState;
    filtered.sort((a, b) => {
        let valA, valB;
        switch (col) {
            case 'name':
                valA = `${a.csaladnev || ''} ${a.k_nev || ''}`.toLowerCase();
                valB = `${b.csaladnev || ''} ${b.k_nev || ''}`.toLowerCase();
                break;
            case 'age':
            case 'birth':
                // Idősebb = kisebb dátum = nagyobb kor; fordított rendezésnél fiatal kerül előre
                valA = a.sz_datum || '9999-99-99';
                valB = b.sz_datum || '9999-99-99';
                break;
            case 'address':
                valA = `${a.adrlocality?.name || ''} ${a.adrstreet?.name || ''} ${a.c_szam || ''}`.toLowerCase();
                valB = `${b.adrlocality?.name || ''} ${b.adrstreet?.name || ''} ${b.c_szam || ''}`.toLowerCase();
                break;
            case 'job':
                valA = (a.foglalkozas || '').toLowerCase();
                valB = (b.foglalkozas || '').toLowerCase();
                break;
            default: // 'id' = legfrissebb felül
                return dir === 'desc' ? b.id - a.id : a.id - b.id;
        }
        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    displayMembers(filtered);
};

function populateParentsDatalist(members) {
    // Ezek az elemek csak akkor léteznek, ha a régi datalist-alapú keresés van használatban.
    // Az új élő keresés (search-results-apa/anya) esetén nem kell futtatni.
    const dlFathers = document.getElementById('dl-fathers');
    const dlMothers = document.getElementById('dl-mothers');
    if (!dlFathers || !dlMothers) return;
    const formatOpt = m => `<option data-id="${m.id}" value="${m.csaladnev} ${m.k_nev} (${m.sz_datum || '?'}) - ${m.adrlocality?.name || '?'} ${m.adrstreet?.name || ''} ${m.c_szam || ''}"></option>`;
    dlFathers.innerHTML = members.filter(m => m.ferfi).map(formatOpt).join('');
    dlMothers.innerHTML = members.filter(m => !m.ferfi).map(formatOpt).join('');
}

function extractId(inputId, hiddenId, datalistId) {
    const inputVal = document.getElementById(inputId).value;
    const hiddenInput = document.getElementById(hiddenId);
    hiddenInput.value = ""; 
    const options = document.getElementById(datalistId).options;
    for (let i = 0; i < options.length; i++) { if (options[i].value === inputVal) { hiddenInput.value = options[i].getAttribute('data-id'); break; } }
}

// ==========================================
// 2. KARTOTÉK (RÉSZLETEK) ÉS VALÓS IDEJÚ LEKÉRDEZÉS
// ==========================================
window.openMemberDetails = async function(id) {
  try {
    const member = allMembersData.find(m => m.id === id);
    if (!member) { console.warn('openMemberDetails: tag nem található, id=', id); return; }

    // 🚨 JAVÍTÁS: Itt hívjuk be az intelligens név-formázót a HTML kódhoz!
    document.getElementById('det-full-name').innerHTML = window.formatNameWithPrefix(member, member._spouse, 'html');
    document.getElementById('det-cnp').innerText = member.cnp || 'Nincs rögzítve';
    document.getElementById('det-status').innerHTML = member.calc_status_html;
    
    const szHelyNeve = member.sz_helyid ? allLocalities.find(l => l.id === member.sz_helyid)?.name || '' : '';
    document.getElementById('det-birth').innerHTML = `${member.sz_datum || '-'} <br> ${szHelyNeve}`;
    
    document.getElementById('det-job').innerText = member.foglalkozas || '-';
    document.getElementById('det-rel').innerText = member.vallas || 'Református';
    document.getElementById('det-phone').innerText = member.telefon || '-';
    document.getElementById('det-email').innerText = member.email || '-';
    document.getElementById('det-address').innerText = `${member.adrlocality?.name || ''}, ${member.adrstreet?.name || ''} ${member.c_szam || ''}`;
    document.getElementById('det-father').innerText = member.apjaneve || '-';
    document.getElementById('det-mother').innerText = member.anyjaneve || '-';
    document.getElementById('det-notes').innerText = member.megjegyzes || 'Nincs megjegyzés rögzítve.';

    const [kereszt, konfirm, temetesRes, bekolt, attert, paymentsRes, bevCelRes, szamadasCelRes] = await Promise.all([
        _supabase.from('keresztseg').select('*, adrlocality!helyid(name)').eq('id_szemely', id).maybeSingle(),
        _supabase.from('konfirmalas').select('*, adrlocality!helyid(name)').eq('id_szemely', id).maybeSingle(),
        _supabase.from('temetes').select('*, adrlocality!thelyid(name)').eq('id_szemely', id).maybeSingle(),
        _supabase.from('bekoltozott').select('*, adrlocality!honnanid(name)').eq('id_szemely', id).maybeSingle(),
        _supabase.from('attert').select('*, adrlocality!honnanid(name)').eq('id_szemely', id).maybeSingle(),
        _supabase.from('befizetes').select('*').eq('id_szemely', id).or('deleted.eq.false,deleted.is.null').order('datum', {ascending: false}),
        _supabase.from('befizetescel').select('id, id_szamadasicel'),
        _supabase.from('szamadasicel').select('id, nev')
    ]);

    document.getElementById('det-k-datum').innerText = kereszt.data?.datum?.split('T')[0] || '-';
    document.getElementById('det-k-hely').innerText = kereszt.data?.adrlocality?.name || '-';
    document.getElementById('det-k-lelkesz').innerText = kereszt.data?.lelkeszneve || '-';

    document.getElementById('det-f-datum').innerText = konfirm.data?.datum?.split('T')[0] || '-';
    document.getElementById('det-f-hely').innerText = konfirm.data?.adrlocality?.name || '-';
    document.getElementById('det-f-lelkesz').innerText = konfirm.data?.lelkeszneve || '-';

    // Temetés adatok kitöltése
    document.getElementById('det-t-datum').innerText = temetesRes.data?.tdatum?.split('T')[0] || '-';
    document.getElementById('det-t-hely').innerText = temetesRes.data?.adrlocality?.name || '-';
    document.getElementById('det-t-lelkesz').innerText = temetesRes.data?.lelkeszneve || '-';

    const histCard = document.getElementById('det-history-card');
    const histEmpty = document.getElementById('det-history-empty');
    if (bekolt.data || attert.data) {
        histCard.style.display = 'block';
        histEmpty.style.display = 'none';
        const d = bekolt.data || attert.data;
        document.getElementById('det-history-title').innerHTML = bekolt.data ? '<i class="ti ti-truck-delivery me-2"></i>Beköltözött' : '<i class="ti ti-arrows-exchange me-2"></i>Áttért';
        document.getElementById('det-history-date').innerText = d.mikor?.split('T')[0] || '-';
        document.getElementById('det-history-from').innerText = d.adrlocality?.name || (attert.data ? d.felekezet : '-');
        document.getElementById('det-history-cert').innerText = d.igazolas || '-';
    } else {
        histCard.style.display = 'none';
        histEmpty.style.display = 'block';
    }

    let payHtml = '';
    let payTotal = 0;
    
    if (paymentsRes && paymentsRes.data && paymentsRes.data.length > 0) {
        const szamMap = {};
        if (szamadasCelRes && szamadasCelRes.data) szamadasCelRes.data.forEach(sz => szamMap[sz.id] = sz.nev);
        const celMap = {};
        if (bevCelRes && bevCelRes.data) bevCelRes.data.forEach(c => celMap[c.id] = szamMap[c.id_szamadasicel] || 'Egyházi befizetés');
        
        payHtml = paymentsRes.data.map(p => {
            payTotal += Number(p.osszeg || 0);
            const celNev = celMap[p.id_befizetescel] || 'Egyházi befizetés';
            const yearText = p.fizetettev ? `${p.fizetettev}. évre` : '';
            const bizonylatSzam = p.nyugtaszam || p.bizonylatszam || p.iratszam || p.dokumentumszam || '-';
            return `
            <tr>
                <td class="align-middle">${p.datum ? p.datum.split('T')[0] : '-'}</td>
                <td class="align-middle fw-bold text-dark">${bizonylatSzam}</td>
                <td class="align-middle text-muted">${celNev} <span class="fw-bold text-dark ms-1">${yearText}</span></td>
                <td class="text-end fw-bold align-middle text-success">${Number(p.osszeg || 0).toFixed(2)} RON</td>
            </tr>
            `;
        }).join('');
    } else {
        payHtml = `<tr><td colspan="4" class="text-center text-muted py-4"><i class="ti ti-info-circle me-2 fs-2 text-primary"></i><br><span class="fw-bold">Nincs a saját nevén rögzített befizetés.</span><br><small class="text-muted">(Ha az összeget a Pénzügy modulban a Családi kasszához rögzítette, akkor az itt nem jelenik meg, csak a Családok fülön!)</small></td></tr>`;
    }
    
    document.getElementById('det-payments-body').innerHTML = payHtml;
    document.getElementById('det-payments-total').innerText = `Összesen: ${payTotal.toFixed(2)} RON`;

    // A varázslat: nyissuk meg a következőt, de tegyük a vermet (Stack) memóriába a jelenlegit!
    document.getElementById('btn-edit-member').onclick = () => {
        window.openNextModal('modal-details', () => openEditMember(member, kereszt.data, konfirm.data, bekolt.data, attert.data));
    };

    // "Ugrás a Családhoz" gomb: csak ha a személyhez van bejegyzett család
    const familyId = window.personToFamilyMap ? window.personToFamilyMap[member.id] : null;
    const btnFamily = document.getElementById('btn-goto-family');
    if (btnFamily) {
        if (familyId && typeof window.openFamilyDetails === 'function') {
            btnFamily.classList.remove('d-none');
            btnFamily.onclick = () => {
                bootstrap.Modal.getInstance(document.getElementById('modal-details'))?.hide();
                setTimeout(() => window.openFamilyDetails(familyId), 350);
            };
        } else {
            btnFamily.classList.add('d-none');
        }
    }

    const detailsModalEl = document.getElementById('modal-details');
    if (!detailsModalEl) { console.error('openMemberDetails: modal-details elem nem található!'); return; }
    // Családfa csak akkor tölt be, ha a modal teljesen látható (shown event)
    detailsModalEl.addEventListener('shown.bs.modal', () => loadFamilyTree(member), { once: true });
    bootstrap.Modal.getOrCreateInstance(detailsModalEl).show();
  } catch (err) {
    console.error('openMemberDetails hiba:', err);
    alert('Hiba a személy adatlapjának megnyitásakor: ' + err.message);
  }
};

// ==========================================
// CSALÁDFA BETÖLTÉSE (FamilyTree.js)
// ==========================================
let familyTreeInstance = null;

async function loadFamilyTree(member) {
    if (typeof loadLib === 'function') await loadLib('familytree');

    // Letisztult családfa sablonok beállítása (egyszer fut le)
    if (typeof FamilyTree !== 'undefined' && !FamilyTree.templates.ferfi) {
        var nW = 220, nH = 80;
        // Férfi avatar SVG (fej + váll sziluett)
        var maleAvatar = '<circle cx="35" cy="30" r="12" fill="{af}" opacity="0.8"></circle>' +
            '<path d="M18,58 C18,46 26,40 35,40 C44,40 52,46 52,58" fill="{af}" opacity="0.5"></path>';
        // Női avatar SVG (fej + váll + haj sziluett)
        var femaleAvatar = '<circle cx="35" cy="30" r="12" fill="{af}" opacity="0.8"></circle>' +
            '<path d="M18,58 C18,46 26,40 35,40 C44,40 52,46 52,58" fill="{af}" opacity="0.5"></path>' +
            '<path d="M23,25 C23,16 28,14 35,14 C42,14 47,16 47,25 L47,30 C47,30 44,28 42,30 C40,28 38,27 35,28 C32,27 30,28 28,30 C26,28 23,30 23,30 Z" fill="{af}" opacity="0.35"></path>';
        function buildNodeSvg(borderColor, bgColor, avatarFill, avatarSvg) {
            var av = avatarSvg.replace(/\{af\}/g, avatarFill);
            return '<rect x="0" y="0" width="' + nW + '" height="' + nH + '" rx="10" ry="10" fill="' + bgColor + '" stroke="' + borderColor + '" stroke-width="1.5"></rect>' +
                '<line x1="68" y1="12" x2="68" y2="' + (nH - 12) + '" stroke="' + borderColor + '" stroke-width="0.5" opacity="0.3"></line>' +
                av;
        }
        var fieldDefs = {
            field_0: '<text x="78" y="30" font-size="13" font-weight="600" font-family="Inter,sans-serif" fill="#1e293b">{val}</text>',
            field_1: '<text x="78" y="47" font-size="10.5" font-family="Inter,sans-serif" fill="#64748b">{val}</text>',
            field_2: '<text x="78" y="62" font-size="9.5" font-family="Inter,sans-serif" fill="#94a3b8">{val}</text>'
        };
        function makeTpl(nodeSvg) {
            var t = Object.assign({}, FamilyTree.templates.hugo);
            t.size = [nW, nH];
            t.node = nodeSvg;
            t.field_0 = fieldDefs.field_0;
            t.field_1 = fieldDefs.field_1;
            t.field_2 = fieldDefs.field_2;
            t.ripple = { radius: 0, color: 'transparent', rect: null };
            return t;
        }
        // Férfi — kék szegély, halvány kék háttér
        FamilyTree.templates.ferfi = makeTpl(buildNodeSvg('#3b82f6', '#f0f7ff', '#3b82f6', maleAvatar));
        // Nő — rózsaszín szegély, halvány rózsaszín háttér
        FamilyTree.templates.no = makeTpl(buildNodeSvg('#ec4899', '#fdf2f8', '#ec4899', femaleAvatar));
        // Elhunyt férfi — szürkés, halványított
        FamilyTree.templates.ferfi_elhunyt = makeTpl('<g opacity="0.45">' + buildNodeSvg('#94a3b8', '#f8fafc', '#94a3b8', maleAvatar) + '</g>');
        // Elhunyt nő — szürkés, halványított
        FamilyTree.templates.no_elhunyt = makeTpl('<g opacity="0.45">' + buildNodeSvg('#94a3b8', '#f8fafc', '#94a3b8', femaleAvatar) + '</g>');
        // Kiválasztott személy — zöld keret
        FamilyTree.templates.kivalasztott = makeTpl(buildNodeSvg('#0ca678', '#ecfdf5', '#0ca678', maleAvatar));
    }

    const container = document.getElementById('det-family-tree');
    const emptyDiv  = document.getElementById('det-tree-empty');
    const badge     = document.getElementById('det-tree-badge');
    const legendDiv = document.getElementById('det-tree-legend');
    if (!container) return;

    // Előző fa törlése
    container.innerHTML = '';
    if (familyTreeInstance) { try { familyTreeInstance.destroy?.(); } catch(e) {} familyTreeInstance = null; }
    if (emptyDiv) emptyDiv.style.display = 'none';
    if (legendDiv) legendDiv.style.display = 'none';
    container.style.display = 'block';
    if (badge) badge.textContent = 'Betöltés...';

    try {
        // 1. Az összes szükséges személy azonosítójának gyűjtése (CNP alapján visszafelé)
        const nodes = [];
        const visited = new Set();

        // Segédfüggvény: személy betöltése CNP alapján
        async function fetchByCnp(cnp) {
            if (!cnp || visited.has(cnp)) return null;
            visited.add(cnp);
            const { data } = await _supabase.from('szemely')
                .select('id, cnp, csaladnev, k_nev, ferfi, sz_datum, meghalt, id_apja, id_anyja')
                .eq('cnp', cnp).maybeSingle();
            return data;
        }

        // Segédfüggvény: személy betöltése ID alapján
        async function fetchById(id) {
            if (!id || visited.has(`id_${id}`)) return null;
            visited.add(`id_${id}`);
            const { data } = await _supabase.from('szemely')
                .select('id, cnp, csaladnev, k_nev, ferfi, sz_datum, meghalt, id_apja, id_anyja')
                .eq('id', id).maybeSingle();
            return data;
        }

        // Személy → FamilyTree node-dá alakítása
        var _ftYear = new Date().getFullYear();
        function toNode(p, fid, mid, isSelf) {
            var tag;
            if (isSelf) {
                tag = 'kivalasztott';
            } else {
                var genderTag = p.ferfi ? 'ferfi' : 'no';
                tag = p.meghalt ? genderTag + '_elhunyt' : genderTag;
            }
            var bornText = '';
            if (p.sz_datum) {
                var bYear = new Date(p.sz_datum).getFullYear();
                var age = _ftYear - bYear;
                bornText = 'sz. ' + bYear + ' (' + age + ' év)';
            }
            return {
                id: p.id,
                pids: [],
                fid: fid || undefined,
                mid: mid || undefined,
                name: `${p.csaladnev || ''} ${p.k_nev || ''}`.trim(),
                born: bornText,
                gender: p.ferfi ? 'male' : 'female',
                deceased: p.meghalt ? '✝ Elhunyt' : '',
                tags: [tag],
                _cnp: p.cnp,
                _apja_cnp: p.id_apja,
                _anyja_cnp: p.id_anyja
            };
        }

        // 2. A személy saját node-ja
        const selfNode = toNode(member, null, null, true);
        nodes.push(selfNode);
        visited.add(`id_${member.id}`); // Megakadályozza a duplikációt

        // 3. Apa és apa szülei (max 2 generáció felfelé)
        const father = await fetchByCnp(member.id_apja);
        let fatherId = null, motherOfFatherId = null, fatherOfFatherId = null;
        if (father) {
            fatherId = father.id;
            const ffNode = toNode(father, null, null);
            nodes.push(ffNode);

            const ff = await fetchByCnp(father.id_apja);
            const mf = await fetchByCnp(father.id_anyja);
            if (ff) { fatherOfFatherId = ff.id; nodes.push(toNode(ff, null, null)); }
            if (mf) { motherOfFatherId = mf.id; nodes.push(toNode(mf, null, null)); }
            if (ff && mf) { nodes.find(n => n.id === ff.id).pids = [mf.id]; nodes.find(n => n.id === mf.id).pids = [ff.id]; }
            if (fatherOfFatherId || motherOfFatherId) {
                ffNode.fid = fatherOfFatherId || undefined;
                ffNode.mid = motherOfFatherId || undefined;
            }
        }

        // 4. Anya és anya szülei
        const mother = await fetchByCnp(member.id_anyja);
        let motherId = null;
        if (mother) {
            motherId = mother.id;
            const mmNode = toNode(mother, null, null);
            nodes.push(mmNode);

            const fm = await fetchByCnp(mother.id_apja);
            const mm = await fetchByCnp(mother.id_anyja);
            let fmId = null, mmId = null;
            if (fm) { fmId = fm.id; nodes.push(toNode(fm, null, null)); }
            if (mm) { mmId = mm.id; nodes.push(toNode(mm, null, null)); }
            if (fm && mm) { nodes.find(n => n.id === fm.id).pids = [mm.id]; nodes.find(n => n.id === mm.id).pids = [fm.id]; }
            if (fmId || mmId) { mmNode.fid = fmId || undefined; mmNode.mid = mmId || undefined; }
        }

        // Szülők összekapcsolása a szülő node-okon
        if (fatherId && motherId) {
            nodes.find(n => n.id === fatherId).pids = [motherId];
            nodes.find(n => n.id === motherId).pids = [fatherId];
        }
        selfNode.fid = fatherId || undefined;
        selfNode.mid = motherId || undefined;

        // 5. Saját família (ahol szülő: id_ferfi vagy id_no)
        const { data: ownFamily } = await _supabase.from('csalad')
            .select('id, id_ferfi, id_no')
            .or(`id_ferfi.eq.${member.id},id_no.eq.${member.id}`)
            .maybeSingle();

        if (ownFamily) {
            // Házastárs
            const spouseId = ownFamily.id_ferfi === member.id ? ownFamily.id_no : ownFamily.id_ferfi;
            if (spouseId) {
                const spouse = await fetchById(spouseId);
                if (spouse) {
                    const spouseNode = toNode(spouse, null, null);
                    spouseNode.pids = [member.id];
                    selfNode.pids = [spouse.id];
                    nodes.push(spouseNode);
                }
            }
            // Gyermekek
            const { data: ownChildren } = await _supabase.from('gyerek')
                .select('id_szemely').eq('id_csalad', ownFamily.id);
            if (ownChildren?.length > 0) {
                const spId = selfNode.pids[0] || null;
                for (const c of ownChildren) {
                    const child = await fetchById(c.id_szemely);
                    if (child) nodes.push(toNode(child,
                        member.ferfi ? member.id : spId,
                        member.ferfi ? spId : member.id
                    ));
                }
            }
        }

        // 5b. Születési família (ahol gyermekként szerepel a gyerek táblában)
        const { data: birthLink } = await _supabase.from('gyerek')
            .select('id_csalad').eq('id_szemely', member.id).maybeSingle();
        if (birthLink?.id_csalad) {
            const { data: birthFamily } = await _supabase.from('csalad')
                .select('id, id_ferfi, id_no').eq('id', birthLink.id_csalad).maybeSingle();
            if (birthFamily) {
                // Apa (ha CNP-alapú lookup még nem találta meg)
                if (!fatherId && birthFamily.id_ferfi && birthFamily.id_ferfi !== member.id) {
                    const dad = await fetchById(birthFamily.id_ferfi);
                    if (dad) { fatherId = dad.id; nodes.push(toNode(dad, null, null)); }
                }
                // Anya
                if (!motherId && birthFamily.id_no && birthFamily.id_no !== member.id) {
                    const mom = await fetchById(birthFamily.id_no);
                    if (mom) { motherId = mom.id; nodes.push(toNode(mom, null, null)); }
                }
                // Szülők összekapcsolása
                if (fatherId && motherId) {
                    const dn = nodes.find(n => n.id === fatherId);
                    const mn = nodes.find(n => n.id === motherId);
                    if (dn && !dn.pids.length) dn.pids = [motherId];
                    if (mn && !mn.pids.length) mn.pids = [fatherId];
                }
                if (fatherId || motherId) {
                    selfNode.fid = fatherId || undefined;
                    selfNode.mid = motherId || undefined;
                }
                // Testvérek
                const { data: sibs } = await _supabase.from('gyerek')
                    .select('id_szemely').eq('id_csalad', birthFamily.id).neq('id_szemely', member.id);
                if (sibs?.length > 0) {
                    for (const s of sibs) {
                        const sib = await fetchById(s.id_szemely);
                        if (sib) nodes.push(toNode(sib, fatherId || undefined, motherId || undefined));
                    }
                }
            }
        }

        console.log('[FamilyTree] Összegyűjtött node-ok száma:', nodes.length, nodes.map(n => n.name));

        // 7. Van-e elegendő adat?
        if (nodes.length <= 1) {
            container.style.display = 'none';
            if (emptyDiv) emptyDiv.style.display = 'block';
            if (legendDiv) legendDiv.style.display = 'none';
            if (badge) badge.textContent = 'Nincs adat';
            return;
        }

        // Statisztika a badge-ben: férfiak/nők/elhunytak
        var maleCount = nodes.filter(n => n.gender === 'male').length;
        var femaleCount = nodes.filter(n => n.gender === 'female').length;
        var deceasedCount = nodes.filter(n => n.deceased).length;
        var badgeText = `${nodes.length} személy`;
        if (deceasedCount > 0) badgeText += ` (${deceasedCount} elhunyt)`;
        if (badge) badge.textContent = badgeText;

        // Jelmagyarázat megjelenítése
        if (legendDiv) legendDiv.style.display = 'flex';

        // 8. Fa megjelenítése — nemek szerinti színezéssel
        familyTreeInstance = new FamilyTree(container, {
            nodes: nodes,
            nodeBinding: {
                field_0: 'name',
                field_1: 'born',
                field_2: 'deceased'
            },
            nodeMenu: { details: { text: 'Részletek' } },
            editForm: { enabled: false },
            toolbar: { zoom: true, fit: true },
            template: 'hugo',
            scaleInitial: FamilyTree.match.boundary,
            enableSearch: false,
            mouseScrool: FamilyTree.action.zoom,
        });

    } catch (err) {
        console.error('Hiba a családfa betöltésekor:', err);
        if (badge) badge.textContent = 'Hiba';
    }
}

// ==========================================
// 3. SZERKESZTŐ ABLAK ÉS RÖGZÍTÉS
// ==========================================
window.openEditMember = function(member, kereszt, konfirm, bekolt, attert) {
    bootstrap.Modal.getInstance(document.getElementById('modal-details')).hide();
    currentEditingMemberId = member.id;
    document.getElementById('m-pre-screen').classList.add('d-none');
    document.getElementById('member-registration-form').classList.remove('d-none');
    document.getElementById('add-member-title').innerHTML = '<i class="ti ti-user-edit me-2"></i>Tag adatainak módosítása';
    document.querySelector('#member-registration-form button[type="submit"]').innerHTML = '<i class="ti ti-device-floppy me-2"></i>Módosítások mentése';

    document.getElementById('m-csaladnev').value = member.csaladnev || '';
    document.getElementById('m-k_nev').value = member.k_nev || '';
    document.getElementById('m-szcs_nev').value = member.szcs_nev || '';
    document.getElementById('m-ferfi').value = member.ferfi ? 'true' : 'false';
    document.getElementById('m-sz_datum').value = member.sz_datum || '';
    document.getElementById('m-sz_hely_text').value = member.sz_helyid ? allLocalities.find(l => l.id === member.sz_helyid)?.name || '' : '';
    document.getElementById('m-foglalkozas').value = member.foglalkozas || '';
    document.getElementById('m-vallas').value = member.vallas || 'Református';
    
    document.getElementById('m-lakhely_text').value = member.c_helysegid ? member.adrlocality?.name : '';
    document.getElementById('m-c_utca_text').value = member.c_utcaid ? member.adrstreet?.name : '';
    document.getElementById('m-c_szam').value = member.c_szam || '';
    document.getElementById('m-tombhaz').value = member.c_tombhaz || '';
    document.getElementById('m-lepcsohaz').value = member.c_lepcsohaz || '';
    document.getElementById('m-emelet').value = member.c_emelet || '';
    document.getElementById('m-ajto').value = member.c_ajto || '';
    document.getElementById('m-telefon').value = member.telefon || '';
    document.getElementById('m-email').value = member.email || '';
    document.getElementById('m-father-input').value = member.apjaneve || '';
    document.getElementById('m-mother-input').value = member.anyjaneve || '';

    document.getElementById('m-megjegyzes').value = member.megjegyzes || '';
    
    if (bekolt) {
        selectEntryReason('bekoltozott');
        document.getElementById('m-extra-datum').value = bekolt.mikor?.split('T')[0] || '';
        document.getElementById('m-extra-honnan').value = bekolt.adrlocality?.name || '';
        document.getElementById('m-extra-igazolas').value = bekolt.igazolas || '';
        document.getElementById('m-extra-megjegyzes').value = bekolt.megjegyzes || '';
    } else if (attert) {
        selectEntryReason('attert');
        document.getElementById('m-extra-datum').value = attert.mikor?.split('T')[0] || '';
        document.getElementById('m-extra-felekezet').value = attert.felekezet || '';
        document.getElementById('m-extra-honnan').value = attert.adrlocality?.name || '';
    } else {
        selectEntryReason('alap');
    }

    if (kereszt) {
        document.getElementById('m-reg-kereszt-datum').value = kereszt.datum?.split('T')[0] || '';
        document.getElementById('m-reg-kereszt-hely').value = kereszt.adrlocality?.name || '';
        document.getElementById('m-reg-kereszt-lelkesz').value = kereszt.lelkeszneve || '';
    }
    if (konfirm) {
        document.getElementById('m-reg-konfirm-datum').value = konfirm.datum?.split('T')[0] || '';
        document.getElementById('m-reg-konfirm-hely').value = konfirm.adrlocality?.name || '';
        document.getElementById('m-reg-konfirm-lelkesz').value = konfirm.lelkeszneve || '';
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-add-member')).show();
};

window.resetToPreScreen = function() {
    currentEditingMemberId = null;
    document.getElementById('add-member-title').innerHTML = '<i class="ti ti-user-plus me-2"></i>Új gyülekezeti tag felvétele';
    document.querySelector('#member-registration-form button[type="submit"]').innerHTML = '<i class="ti ti-device-floppy me-2"></i>Tag végleges mentése';
    
    document.getElementById('m-pre-screen').classList.remove('d-none');
    document.getElementById('member-registration-form').classList.add('d-none');
    document.getElementById('member-registration-form').reset();
    document.getElementById('m-belepes_oka').value = '';
    const firstTab = document.querySelector('#member-registration-form .nav-tabs a[href="#tab-add-personal"]');
    if (firstTab) new bootstrap.Tab(firstTab).show();
};

window.selectEntryReason = function(reason) {
    document.getElementById('m-belepes_oka').value = reason;
    document.getElementById('m-pre-screen').classList.add('d-none');
    document.getElementById('member-registration-form').classList.remove('d-none');
    const extraBox = document.getElementById('extra-reason-container');
    const felekBox = document.getElementById('box-extra-felekezet');
    if (reason === 'bekoltozott' || reason === 'attert') {
        extraBox.classList.remove('d-none');
        felekBox.style.display = (reason === 'attert') ? 'block' : 'none';
        document.getElementById('extra-reason-title').innerHTML = (reason === 'bekoltozott') ? '<i class="ti ti-truck-delivery me-2"></i>Beköltözés Részletei' : '<i class="ti ti-arrows-exchange me-2"></i>Áttérés Részletei';
    } else { extraBox.classList.add('d-none'); }
};

window.toggleRegistryLocal = function(type) {
    const isLocal = document.getElementById(`m-reg-${type}-islocal`).checked;
    const helyBox = document.getElementById(`box-${type}-hely`);
    const helyInput = document.getElementById(`m-reg-${type}-hely`);
    if (isLocal) {
        helyBox.style.display = 'none';
        helyInput.value = currentSettings?.intezmenyneve || "Helyi gyülekezet";
    } else {
        helyBox.style.display = 'block';
        helyInput.value = ''; 
    }
};

// ==========================================
// 🚨 A FŐ TAG-MENTŐ MOTOR (AUTOMATIKUS CSALÁD LÉTREHOZÁSSAL)
// ==========================================
async function handleFormSubmit(e) {
    e.preventDefault();
    const btn = e.submitter;
    const origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Mentés...';
    btn.disabled = true;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        const { data: profileArray } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).limit(1);
        const profile = profileArray[0];

        const getVal = (id, def = '') => { 
            const el = document.getElementById(id); 
            return el ? el.value : def; 
        };

        const helysegId = await getOrCreateLocality(getVal('m-lakhely_text', 'Ismeretlen'));
        const utcaId = await getOrCreateStreet(getVal('m-c_utca_text', 'Ismeretlen'), helysegId);

        let finalCnp = "";
        if (!currentEditingMemberId) {
            const dob = getVal('m-sz_datum');
            const datePart = dob ? dob.replace(/-/g, '').substring(2) : "000000";
            finalCnp = `999${Math.floor(1000000 + Math.random() * 9000000)}`;
        }

        const memberData = {
            csaladnev: getVal('m-csaladnev'),
            k_nev: getVal('m-k_nev'),
            szcs_nev: getVal('m-szcs_nev'),
            ferfi: getVal('m-ferfi', 'true') === 'true',
            sz_datum: getVal('m-sz_datum') || null,
            sz_helyid: getVal('m-sz_hely_text') ? await getOrCreateLocality(getVal('m-sz_hely_text')) : null,
            apjaneve: getVal('m-father-input') || getVal('m-apjaneve') || null,
            anyjaneve: getVal('m-mother-input') || getVal('m-anyjaneve') || null,
            
            // 🚨 1. HIÁNYZÓ LÁNCSZEM PÓTOLVA: Szülők CNP azonosítóinak lementése!
            id_apja: getVal('m-id_apja') || null,
            id_anyja: getVal('m-id_anyja') || null,
            
            c_helysegid: helysegId,
            c_utcaid: utcaId,
            c_szam: getVal('m-c_szam', '1'),
            c_tombhaz: getVal('m-tombhaz') || null,
            c_lepcsohaz: getVal('m-lepcsohaz') || null,
            c_emelet: getVal('m-emelet') || null,
            c_ajto: getVal('m-ajto') || null,
            
            telefon: getVal('m-telefon'),
            email: getVal('m-email') || null,
            foglalkozas: getVal('m-foglalkozas') || null,
            vallas: getVal('m-vallas', 'Református'),
            megjegyzes: getVal('m-megjegyzes') || null
        };

        let savedMemberId = currentEditingMemberId;

        if (currentEditingMemberId) {
            const { error } = await _supabase.from('szemely').update(memberData).eq('id', currentEditingMemberId);
            if (error) throw error;
        } else {
            memberData.cnp = finalCnp;
            memberData.congregation_id = profile.congregation_id;
            memberData.isvisible = true;
            memberData.type = 'E';
            memberData.befizetoev = new Date().getFullYear();
            memberData.csaladfo = false;
            memberData.meghalt = false;

            const { data: insertedMemberArray, error } = await _supabase.from('szemely').insert([memberData]).select('id');
            if (error) throw error;
            if (!insertedMemberArray || insertedMemberArray.length === 0) throw new Error("Adatbázis hiba: Nem kaptunk vissza azonosítót!");
            
            savedMemberId = insertedMemberArray[0].id;
            
            if (getVal('m-fizeto_status') === 'felmentett') {
                await _supabase.from('felmentes').insert([{
                    id_szemely: savedMemberId, felmento: 'Rendszer', datum: new Date().toISOString(), oka: 'Új tag felvétele', kezdete: new Date().getFullYear(), vege: 2099
                }]);
            }
        }

        // =================================================================
        // 🚨 2. ÚJ MOTOR: AUTOMATIKUS CSALÁD LÉTREHOZÁS ÉS GYERMEK BEKÖTÉSE
        // =================================================================
        const apaCnp = memberData.id_apja;
        const anyaCnp = memberData.id_anyja;

        if (apaCnp || anyaCnp) {
            let ferfiId = null, noId = null;

            // Szülők valódi ID-jának megkeresése
            if (apaCnp) {
                const { data: aData } = await _supabase.from('szemely').select('id').eq('cnp', apaCnp).limit(1);
                if (aData && aData.length > 0) ferfiId = aData[0].id;
            }
            if (anyaCnp) {
                const { data: mData } = await _supabase.from('szemely').select('id').eq('cnp', anyaCnp).limit(1);
                if (mData && mData.length > 0) noId = mData[0].id;
            }

            if (ferfiId || noId) {
                // Megnézzük, van-e már Család Kartotékjuk
                let query = _supabase.from('csalad').select('id').eq('isaktiv', true);
                if (ferfiId) query = query.eq('id_ferfi', ferfiId);
                if (noId) query = query.eq('id_no', noId);
                
                const { data: existingFam } = await query.limit(1);
                let famId = null;

                if (existingFam && existingFam.length > 0) {
                    famId = existingFam[0].id;
                } else {
                    // Ha nincs, a gép automatikusan létrehozza a Háztartást a gyermek lakcímén!
                    const famEntry = {
                        id_ferfi: ferfiId,
                        id_no: noId,
                        c_utcaid: utcaId,
                        c_szam: getVal('m-c_szam', '1'),
                        isaktiv: true
                    };
                    const { data: newFam } = await _supabase.from('csalad').insert([famEntry]).select('id');
                    if (newFam && newFam.length > 0) famId = newFam[0].id;
                }

                // A gyermeket azonnal beregisztrálja ehhez a családhoz!
                if (famId) {
                    const { data: checkGyerek } = await _supabase.from('gyerek').select('id').eq('id_szemely', savedMemberId).eq('id_csalad', famId).limit(1);
                    if (!checkGyerek || checkGyerek.length === 0) {
                        await _supabase.from('gyerek').insert([{ id_csalad: famId, id_szemely: savedMemberId }]);
                    }
                }
            }
        }
        // =================================================================

        const kDatum = getVal('m-reg-kereszt-datum');
        if (kDatum) {
            const kHelyText = getVal('m-reg-kereszt-hely');
            const kData = { id_szemely: savedMemberId, datum: kDatum, helyid: kHelyText ? await getOrCreateLocality(kHelyText) : null, lelkeszneve: getVal('m-reg-kereszt-lelkesz'), munkanaploba: false, congregation_id: profile.congregation_id };
            
            const { data: extK } = await _supabase.from('keresztseg').select('id').eq('id_szemely', savedMemberId).limit(1);
            if (extK && extK.length > 0) await _supabase.from('keresztseg').update(kData).eq('id', extK[0].id);
            else await _supabase.from('keresztseg').insert([kData]);
        }

        const fDatum = getVal('m-reg-konfirm-datum');
        if (fDatum) {
            const fHelyText = getVal('m-reg-konfirm-hely');
            const fData = { id_szemely: savedMemberId, datum: fDatum, helyid: fHelyText ? await getOrCreateLocality(fHelyText) : null, lelkeszneve: getVal('m-reg-konfirm-lelkesz'), congregation_id: profile.congregation_id };
            
            const { data: extF } = await _supabase.from('konfirmalas').select('id').eq('id_szemely', savedMemberId).limit(1);
            if (extF && extF.length > 0) await _supabase.from('konfirmalas').update(fData).eq('id', extF[0].id);
            else await _supabase.from('konfirmalas').insert([fData]);
        }

        if (window.isReturningToAnyakonyv) {
            window.isReturningToAnyakonyv = false;
            alert(`✅ A gyermek (${memberData.csaladnev} ${memberData.k_nev}) adatait sikeresen mentettük az adatbázisba!`);
            
            const tabFin = document.querySelector('.nav-link.tab-fin');
            const tabReg = document.querySelector('.nav-link.tab-reg');
            const tabPers = document.querySelector('.nav-link.tab-pers');
            if (tabFin) tabFin.parentElement.style.display = 'block';
            if (tabReg) tabReg.parentElement.style.display = 'block';
            if (tabPers) tabPers.innerHTML = '<i class="ti ti-user me-2"></i>Személyes';

            bootstrap.Modal.getInstance(document.getElementById('modal-add-member')).hide();
            
            setTimeout(() => {
                bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-anyakonyv')).show();
                if (typeof selectMemberForAk === 'function') {
                    selectMemberForAk(savedMemberId, `${memberData.csaladnev} ${memberData.k_nev}`, 'szemely');
                }
            }, 500);

        } else {
            bootstrap.Modal.getInstance(document.getElementById('modal-add-member')).hide();
            const toast = document.getElementById('successToast');
            if (toast) new bootstrap.Toast(toast).show();
            else alert("✅ Sikeres mentés!");
            
            if (typeof invalidateCachePrefix === 'function') invalidateCachePrefix('members');
            if (typeof loadMembers === 'function') loadMembers();
            // 🚨 Frissítjük a Családok táblázatát is, ha épp azon az oldalon lennénk!
            if (typeof loadFamilies === 'function') loadFamilies();
        }

    } catch (err) { 
        console.error("Hiba a mentés motorban:", err);
        if (!err.message.includes("megszakítva a felhasználó által")) alert("Hiba a mentéskor: " + err.message); 
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
    }
}

function setupAddMemberSmartLogic() {
    const dobInput = document.getElementById('m-sz_datum');
    const relInput = document.getElementById('m-vallas');
    if (dobInput) {
        dobInput.addEventListener('change', function() {
            if (!this.value) return;
            const age = Math.abs(new Date(Date.now() - new Date(this.value).getTime()).getUTCFullYear() - 1970);
            const payContainer = document.getElementById('m-fizeto-container');
            if (age < 18) { payContainer.style.display = 'none'; if(document.getElementById('m-fizeto_status')) document.getElementById('m-fizeto_status').value = 'nem_fizet'; } 
            else { payContainer.style.display = 'block'; }
        });
    }
    if (relInput) {
        relInput.addEventListener('input', function() {
            const isRef = ['református', 'reformatul', 'reformat'].includes(this.value.toLowerCase().trim());
            const tagSelect = document.getElementById('m-egyhaztag');
            if(tagSelect) { tagSelect.value = isRef ? 'igen' : 'nem'; tagSelect.disabled = !isRef; }
            if(document.getElementById('hint-religion')) document.getElementById('hint-religion').innerHTML = isRef ? 'Református tag.' : '<span class="text-danger fw-bold">Csak református lehet egyháztag!</span>';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal-add-member');
    if (modal) modal.addEventListener('show.bs.modal', function(event) { if (!currentEditingMemberId) resetToPreScreen(); });
    setTimeout(setupAddMemberSmartLogic, 1500);
});

// ==========================================
// 🚨 ÚJ: TAG KIVEZETÉSE / TÖRLÉSE LOGIKA 🚨
// ==========================================

window.openRemoveModal = function(id, name) {
    document.getElementById('rm-member-id').value = id;
    document.getElementById('rm-full-name').innerText = name;
    resetRemoveScreen();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-remove-member')).show();
};

window.resetRemoveScreen = function() {
    document.getElementById('rm-step-1').classList.remove('d-none');
    document.getElementById('rm-step-2').classList.add('d-none');
    document.getElementById('rm-footer').classList.add('d-none');
    ['meghalt', 'elkoltozott', 'kitert', 'torles'].forEach(id => document.getElementById(`box-${id}`).classList.add('d-none'));
    document.getElementById('member-remove-form').reset();
    document.getElementById('rm-action-type').value = '';
};

window.selectRemoveReason = function(reason) {
    document.getElementById('rm-action-type').value = reason;
    document.getElementById('rm-step-1').classList.add('d-none');
    document.getElementById('rm-step-2').classList.remove('d-none');
    document.getElementById('rm-footer').classList.remove('d-none');
    
    document.getElementById(`box-${reason}`).classList.remove('d-none');

    document.getElementById('rm-hdatum').required = (reason === 'meghalt');
    document.getElementById('rm-tdatum').required = (reason === 'meghalt');
};


// ==========================================
// 🚨 ÚJ: TAG KIVEZETÉSE / TÖRLÉSE LOGIKA (ATOMBIZTOS) 🚨
// ==========================================

// 1. PÁNCÉLSZEKRÉNY AZ AZONOSÍTÓNAK (Ezt nem törölheti ki a böngésző reset!)
window.currentRemovingMemberId = null;

// Gombnyomáskor elmentjük az ID-t a páncélszekrénybe
window.openRemoveModal = function(id, name) {
    window.currentRemovingMemberId = id; 
    document.getElementById('rm-full-name').innerText = name;
    resetRemoveScreen();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-remove-member')).show();
};

window.resetRemoveScreen = function() {
    document.getElementById('rm-step-1').classList.remove('d-none');
    document.getElementById('rm-step-2').classList.add('d-none');
    document.getElementById('rm-footer').classList.add('d-none');
    ['meghalt', 'elkoltozott', 'kitert', 'torles'].forEach(id => {
        const el = document.getElementById(`box-${id}`);
        if(el) el.classList.add('d-none');
    });
    document.getElementById('member-remove-form').reset();
    document.getElementById('rm-action-type').value = '';
};

window.selectRemoveReason = function(reason) {
    document.getElementById('rm-action-type').value = reason;
    document.getElementById('rm-step-1').classList.add('d-none');
    document.getElementById('rm-step-2').classList.remove('d-none');
    document.getElementById('rm-footer').classList.remove('d-none');
    
    const box = document.getElementById(`box-${reason}`);
    if(box) box.classList.remove('d-none');

    const hDatum = document.getElementById('rm-hdatum');
    const tDatum = document.getElementById('rm-tdatum');
    if (hDatum) hDatum.required = (reason === 'meghalt');
    if (tDatum) tDatum.required = (reason === 'meghalt');
};

// ==========================================
// 🚨 TAG KIVEZETÉSE / TÖRLÉSE LOGIKA (VÉGLEGES)
// ==========================================

window.openRemoveModal = function(id, name) {
    document.getElementById('rm-member-id').value = id;
    document.getElementById('rm-full-name').innerText = name;
    resetRemoveScreen();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-remove-member')).show();
};

window.resetRemoveScreen = function() {
    document.getElementById('rm-step-1').classList.remove('d-none');
    document.getElementById('rm-step-2').classList.add('d-none');
    document.getElementById('rm-footer').classList.add('d-none');
    ['meghalt', 'elkoltozott', 'kitert', 'torles'].forEach(id => {
        const el = document.getElementById(`box-${id}`);
        if(el) el.classList.add('d-none');
    });
    document.getElementById('member-remove-form').reset();
    document.getElementById('rm-action-type').value = '';
};

window.selectRemoveReason = function(reason) {
    document.getElementById('rm-action-type').value = reason;
    document.getElementById('rm-step-1').classList.add('d-none');
    document.getElementById('rm-step-2').classList.remove('d-none');
    document.getElementById('rm-footer').classList.remove('d-none');
    
    const box = document.getElementById(`box-${reason}`);
    if(box) box.classList.remove('d-none');

    const hDatum = document.getElementById('rm-hdatum');
    const tDatum = document.getElementById('rm-tdatum');
    if (hDatum) hDatum.required = (reason === 'meghalt');
    if (tDatum) tDatum.required = (reason === 'meghalt');
};

// ==========================================
// TAGOK KIVEZETÉSE ÉS TÖRLÉSE (MUNKANAPLÓ SZINKRONNAL)
// ==========================================
window.handleRemoveSubmit = async function(e) {
    e.preventDefault(); 
    const btn = document.getElementById('btn-rm-submit');
    const origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Feldolgozás...';
    btn.disabled = true;

    try {
        const idText = document.getElementById('rm-member-id').value;
        const id = parseInt(idText, 10);
        const reason = document.getElementById('rm-action-type').value;
        
        if (!id || isNaN(id)) throw new Error("A tag azonosítója (ID) hiányzik vagy hibás!");

        const { data: { user } } = await _supabase.auth.getUser();
        const { data: profile } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();

        if (reason === 'torles') {
            const { data: payments } = await _supabase.from('befizetes').select('id').eq('id_szemely', id).neq('deleted', true).limit(1);
            
            if (payments && payments.length > 0) {
                const { data: updData, error: hideErr } = await _supabase.from('szemely').update({ 
                    isvisible: false, member_status: 'törölt', congregation_id: profile.congregation_id 
                }).eq('id', id).select('id');
                
                if (hideErr) throw hideErr;
                if (!updData || updData.length === 0) throw new Error("A szerver (RLS Házirend) csendben blokkolta az elrejtést! Ellenőrizze az adatbázis jogosultságokat!");
                
                alert("Tájékoztatás:\nA taghoz már tartozik pénzügyi tranzakció. A könyvelés biztonsága érdekében a gép véglegesen nem törölte, de SIKERESEN ELREJTETTE a névsorból!");
            } else {
                try {
                    // 🚨 MUNKANAPLÓ (SZOLGÁLATOK) LEKÉRDEZÉSE ÉS RÁKÉRDEZÉS 🚨
                    const [kData, fData, tData] = await Promise.all([
                        _supabase.from('keresztseg').select('munkanaplo_id').eq('id_szemely', id).not('munkanaplo_id', 'is', null),
                        _supabase.from('konfirmalas').select('munkanaplo_id').eq('id_szemely', id).not('munkanaplo_id', 'is', null),
                        _supabase.from('temetes').select('munkanaplo_id').eq('id_szemely', id).not('munkanaplo_id', 'is', null)
                    ]);
                    
                    const munkanaploIds = [...(kData.data||[]), ...(fData.data||[]), ...(tData.data||[])]
                                            .map(x => x.munkanaplo_id).filter(id => id);

                    if (munkanaploIds.length > 0) {
                        if (confirm("Ehhez a személyhez szolgálat(ok) is van(nak) rögzítve a Lelkészi Munkanaplóban.\n\nSzeretné a hozzá tartozó SZOLGÁLATOKAT IS VÉGLEG TÖRÖLNI a Munkanaplóból?\n\n(Ha az 'OK'-ra kattint, a szolgálat törlődik. Ha a 'Mégse' gombot választja, a szolgálat a naplóban megmarad, csak a tag neve tűnik el a rendszerből.)")) {
                            await _supabase.from('munkanaplo').delete().in('id', munkanaploIds).eq('congregation_id', profile.congregation_id);
                        }
                    }

                    // Csatolt adatok takarítása
                    await Promise.all([
                        _supabase.from('keresztseg').delete().eq('id_szemely', id),
                        _supabase.from('konfirmalas').delete().eq('id_szemely', id),
                        _supabase.from('bekoltozott').delete().eq('id_szemely', id),
                        _supabase.from('attert').delete().eq('id_szemely', id),
                        _supabase.from('felmentes').delete().eq('id_szemely', id),
                        _supabase.from('gyerek').delete().eq('id_szemely', id),
                        _supabase.from('presbiter').delete().eq('id_szemely', id),
                        _supabase.from('csoporttagok').delete().eq('id_szemely', id)
                    ]);
                    
                    const { data: delData, error: delErr } = await _supabase.from('szemely').delete().eq('id', id).select('id');
                    if (delErr) throw delErr; 
                    if (!delData || delData.length === 0) throw new Error("RLS_BLOCK");

                    alert("Sikeres művelet:\nA hibásan rögzített tag nyomtalanul eltűnt a rendszerből!");
                } catch (cleanupErr) {
                    const { data: updData2, error: hideErr2 } = await _supabase.from('szemely').update({ 
                        isvisible: false, member_status: 'törölt', congregation_id: profile.congregation_id 
                    }).eq('id', id).select('id');
                    
                    if (hideErr2) throw hideErr2;
                    if (!updData2 || updData2.length === 0) throw new Error("A szerver sem törölni, sem elrejteni nem engedte a tagot! Futtassa le az SQL kódot!");

                    alert("Sikeres művelet:\nAz adatbázis biztonsági szabályai miatt a fizikai törlés blokkolva lett, de a gép SIKERESEN ELREJTETTE a tagot a névsorból!");
                }
            }
        } else if (reason === 'meghalt') {
            const hHelyId = document.getElementById('rm-hhely').value ? await getOrCreateLocality(document.getElementById('rm-hhely').value) : null;
            const tHelyId = document.getElementById('rm-thely').value ? await getOrCreateLocality(document.getElementById('rm-thely').value) : null;
            await _supabase.from('temetes').insert([{
                id_szemely: id, congregation_id: profile.congregation_id, hdatum: document.getElementById('rm-hdatum').value, 
                tdatum: document.getElementById('rm-tdatum').value, hoka: document.getElementById('rm-hoka').value || null, 
                lelkeszneve: document.getElementById('rm-lelkesz').value || null, munkanaploba: document.getElementById('rm-munkanaplo').checked, 
                hhelyid: hHelyId, thelyid: tHelyId
            }]);
            const { data: upd, error: err } = await _supabase.from('szemely').update({ meghalt: true, congregation_id: profile.congregation_id }).eq('id', id).select('id');
            if (err || !upd || upd.length === 0) throw new Error("Hiba a haláleset rögzítésekor (Néma RLS blokkolás)!");
            alert("A haláleset sikeresen adminisztrálva!");
        } else if (reason === 'elkoltozott') {
            const hovaId = document.getElementById('rm-kolt-hova').value ? await getOrCreateLocality(document.getElementById('rm-kolt-hova').value) : null;
            await _supabase.from('elkoltozott').insert([{
                id_szemely: id, congregation_id: profile.congregation_id, mikor: document.getElementById('rm-kolt-datum').value || new Date().toISOString(), 
                kulfoldre: document.getElementById('rm-kulfold').checked, megjegyzes: document.getElementById('rm-kolt-megj').value || null, hovaid: hovaId
            }]);
            const { data: upd, error: err } = await _supabase.from('szemely').update({ elkoltozott: true, member_status: 'elköltözött', congregation_id: profile.congregation_id }).eq('id', id).select('id');
            if (err || !upd || upd.length === 0) throw new Error("Hiba az elköltözés rögzítésekor!");
            alert("Az elköltözés sikeresen adminisztrálva!");
        } else if (reason === 'kitert') {
            const hovaId = document.getElementById('rm-kitert-hova').value ? await getOrCreateLocality(document.getElementById('rm-kitert-hova').value) : null;
            const ujVallas = document.getElementById('rm-kitert-vallas').value || 'Ismeretlen';
            await _supabase.from('kitert').insert([{
                id_szemely: id, congregation_id: profile.congregation_id, felekezet: ujVallas, mikor: document.getElementById('rm-kitert-datum').value || new Date().toISOString(), 
                megjegyzes: document.getElementById('rm-kitert-megj').value || null, hovaid: hovaId
            }]);
            const { data: upd, error: err } = await _supabase.from('szemely').update({ member_status: 'kitért', vallas: ujVallas, congregation_id: profile.congregation_id }).eq('id', id).select('id');
            if (err || !upd || upd.length === 0) throw new Error("Hiba a kitérés rögzítésekor!");
            alert("A kitérés / egyházból való kilépés sikeresen adminisztrálva!");
        }

        const modalInst = bootstrap.Modal.getInstance(document.getElementById('modal-remove-member'));
        if (modalInst) modalInst.hide();
        
        // AZONNALI KÉPERNYŐ-FRISSÍTÉS A MEMÓRIÁBÓL
        if (reason === 'torles') {
            allMembersData = allMembersData.filter(m => m.id !== id);
        } else {
            const memberObj = allMembersData.find(m => m.id === id);
            if (memberObj) {
                if (reason === 'meghalt') memberObj.meghalt = true;
                if (reason === 'elkoltozott') memberObj.elkoltozott = true;
                if (reason === 'kitert') memberObj.member_status = 'kitért';
            }
        }

        if (typeof window.filterAndSortMembers === 'function') {
            window.filterAndSortMembers();
        }

    } catch (err) { 
        alert("HIBA TÖRTÉNT A FELDOLGOZÁS SORÁN:\n\n" + err.message); 
    } finally { 
        btn.innerHTML = origText; 
        btn.disabled = false; 
    }
};

// ==========================================
// 🚨 OKOS KERESŐ: SZÓKÖZ-DARABOLÓVAL, KOR-VÉDELEMMEL, MACSKAKÖRÖM-BIZTOSAN
// ==========================================
window.searchParentForMember = async function(val, type) {
    const resDiv = document.getElementById(`search-results-${type}`);
    const hiddenId = type === 'apa' ? 'm-id_apja' : 'm-id_anyja';
    
    if (val.trim() === '') {
        const hiddenEl = document.getElementById(hiddenId);
        if (hiddenEl) hiddenEl.value = '';
        const badge = document.getElementById(`info-badge-${type}`);
        if(badge) badge.remove();
        if (resDiv) resDiv.style.display = 'none';
        return;
    }
    
    if (val.length < 3) { if (resDiv) resDiv.style.display = 'none'; return; }
    
    const isFerfi = type === 'apa';
    
    // Kettévágjuk a nevet
    const parts = val.trim().split(/\s+/);
    let query = _supabase.from('szemely')
        .select(`id, csaladnev, k_nev, cnp, sz_datum, c_szam, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)`)
        .eq('ferfi', isFerfi);

    if (parts.length === 1) {
        query = query.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`);
    } else {
        query = query.ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`);
    }
        
    const { data, error } = await query.limit(5);
    if (error) console.error(`🚨 SUPABASE KERESÉSI HIBA (${type}):`, error);
        
    if (data && data.length > 0) {
        resDiv.innerHTML = data.map(m => {
            // Életkor
            let ageStr = '? éves';
            if (m.sz_datum) {
                const birthYear = parseInt(m.sz_datum.substring(0, 4));
                const currentYear = new Date().getFullYear();
                if (!isNaN(birthYear) && birthYear > 1800) ageStr = `${currentYear - birthYear} éves`;
            }
            
            // Cím
            const telepules = (m.adrlocality && m.adrlocality.name) ? m.adrlocality.name : '';
            const utca = (m.adrstreet && m.adrstreet.name) ? m.adrstreet.name : '';
            const hazszam = m.c_szam ? m.c_szam : '';
            let cimTomb = [];
            if (telepules) cimTomb.push(telepules);
            if (utca) cimTomb.push(utca);
            if (hazszam) cimTomb.push(hazszam);
            let cimStr = cimTomb.length > 0 ? cimTomb.join(', ') : 'Nincs pontos cím megadva';
            
            // 🚨 BIZTONSÁGOS KATTINTÁS (Kikerüljük a HTML macskakörmöket!)
            const safeName = `${m.csaladnev} ${m.k_nev}`.replace(/'/g, "\\'");
            const safeAge = ageStr.replace(/'/g, "\\'");
            const safeCim = cimStr.replace(/'/g, "\\'");

            return `
            <div class="search-item p-2 border-bottom cursor-pointer" onclick="selectParentForMember('${safeName}', '${m.cnp || ''}', '${type}', '${safeAge}', '${safeCim}')">
                <div class="d-flex align-items-center">
                    <i class="ti ti-user fs-3 me-2 ${isFerfi ? 'text-blue' : 'text-pink'}"></i>
                    <div>
                        <div class="fw-bold">${m.csaladnev} ${m.k_nev}</div>
                        <div class="text-muted small">${ageStr} | <i class='ti ti-home me-1'></i>${cimStr}</div>
                    </div>
                </div>
            </div>`;
        }).join('');
    } else {
        resDiv.innerHTML = `
            <div class="p-2 text-center bg-light">
                <span class="small text-danger d-block mb-1 fw-bold">Nincs a nyilvántartásban!</span>
                <button type="button" class="btn btn-sm btn-success w-100" onclick="quickAddParentFromMemberForm('${val}', '${type}')">
                    <i class="ti ti-user-plus me-1"></i>Új ${type === 'apa' ? 'Édesapa' : 'Édesanya'} Gyorsrögzítése
                </button>
            </div>`;
    }
    resDiv.style.display = 'block';
};

// 🚨 A KIVÁLASZTÓ MOTOR (Fantom-Mező Létrehozóval a Vallás betöltéséhez!)
window.selectParentForMember = function(name, cnp, type, ageStr = '', cimStr = '') {
    const inputId = type === 'apa' ? 'm-apjaneve' : 'm-anyjaneve';
    const hiddenId = type === 'apa' ? 'm-id_apja' : 'm-id_anyja';
    
    // 🚨 BIZTONSÁGI INTÉZKEDÉS: Ha nincs meg a HTML-ben a rejtett ID mező, létrehozzuk láthatatlanul!
    let hiddenField = document.getElementById(hiddenId);
    if (!hiddenField) {
        hiddenField = document.createElement('input');
        hiddenField.type = 'hidden';
        hiddenField.id = hiddenId;
        const form = document.getElementById('member-registration-form');
        if(form) form.appendChild(hiddenField);
    }

    const inputField = document.getElementById(inputId);
    if (inputField) inputField.value = name;
    
    // Most már garantáltan lementi a CNP-t, így a gép meg tudja keresni a vallást!
    if (hiddenField) hiddenField.value = cnp || ''; 
    
    if (inputField) {
        let infoDiv = document.getElementById(`info-badge-${type}`);
        if (!infoDiv) {
            infoDiv = document.createElement('div');
            infoDiv.id = `info-badge-${type}`;
            infoDiv.className = `small mt-2 p-2 rounded bg-${type === 'apa' ? 'blue' : 'pink'}-lt text-${type === 'apa' ? 'blue' : 'pink'} fw-bold border`;
            inputField.parentNode.appendChild(infoDiv);
        }
        
        let infoHtml = `<i class="ti ti-check me-1"></i> Újként rögzítve az adatbázisba`;
        if (ageStr && cimStr) {
            infoHtml = `<i class="ti ti-check me-1"></i> ${ageStr} | <i class="ti ti-home me-1"></i>${cimStr}`;
        }
        infoDiv.innerHTML = infoHtml;
    }
    
    const resDiv = document.getElementById(`search-results-${type}`);
    if (resDiv) resDiv.style.display = 'none';
};

// ==========================================
// 5. A Biztonságos Mentés Motor
// ==========================================
window.saveDynamicParent = async function(type, isFerfi) {
    try {
        const cN = document.getElementById('dp-csaladnev').value.trim();
        const kN = document.getElementById('dp-knev').value.trim();
        const telepules = document.getElementById('dp-telepules').value.trim();
        const utca = document.getElementById('dp-utca').value.trim();
        const hszam = document.getElementById('dp-hszam').value.trim();

        if (!cN || !kN || !telepules || !utca || !hszam) { 
            alert("Kérem, töltsön ki minden csillaggal (*) jelölt kötelező mezőt a mentéshez!"); 
            return; 
        }

        const foglalkozas = document.getElementById('dp-foglalkozas').value;
        const szDatum = document.getElementById('dp-szdatum').value || null;
        const vallas = document.getElementById('dp-vallas').value || 'Református';
        const isMeghalt = document.getElementById('dp-meghalt').checked;

        let locId = null;
        const { data: locData } = await _supabase.from('adrlocality').select('id').ilike('name', telepules).limit(1);
        if (locData && locData.length > 0) { locId = locData[0].id; } 
        else {
            if (confirm(`A(z) '${telepules}' település még nincs az adatbázisban.\nKívánja rögzíteni a szótárba?`)) {
                const { data: countyData } = await _supabase.from('adrcounty').select('id').limit(1);
                const safeCountyId = (countyData && countyData.length > 0) ? countyData[0].id : 1;
                const { data: newLoc, error: locErr } = await _supabase.from('adrlocality').insert([{ name: telepules, countyid: safeCountyId }]).select('id');
                if (locErr || !newLoc || newLoc.length === 0) throw new Error("Adatbázis hiba a település mentésekor!");
                locId = newLoc[0].id;
            } else return; 
        }

        let strId = null;
        const { data: strData } = await _supabase.from('adrstreet').select('id').ilike('name', utca).eq('localityid', locId).limit(1);
        if (strData && strData.length > 0) { strId = strData[0].id; } 
        else {
            if (confirm(`A(z) '${utca}' utca még nem létezik '${telepules}' településen.\nKívánja rögzíteni a szótárba?`)) {
                const { data: newStr, error: strErr } = await _supabase.from('adrstreet').insert([{ name: utca, localityid: locId }]).select('id');
                if (strErr || !newStr || newStr.length === 0) throw new Error("Adatbázis hiba az utca mentésekor!");
                strId = newStr[0].id;
            } else return; 
        }

        const generatedCnp = "999" + Math.floor(Math.random() * 9000000000 + 1000000000).toString();
        const currentYear = new Date().getFullYear();

        const entry = {
            csaladnev: cN, k_nev: kN, cnp: generatedCnp, foglalkozas: foglalkozas, sz_datum: szDatum, vallas: vallas,
            ferfi: isFerfi, type: 'L', member_status: 'aktív', isvisible: true, csaladfo: false, meghalt: isMeghalt,
            c_helysegid: locId, c_utcaid: strId, c_szam: hszam, befizetoev: currentYear 
        };

        const { data, error } = await _supabase.from('szemely').insert([entry]).select('id, cnp');
        if (error || !data || data.length === 0) { alert("Hiba a szülő mentésekor: " + (error?.message || 'Ismeretlen hiba')); return; }
        
        alert(`✅ Az édes${isFerfi ? 'apa' : 'anya'} (${cN} ${kN}) adatait és címét sikeresen mentettük az adatbázisba!`);
        window.closeDynamicParent();
        
        let ageStr = '? éves';
        if (szDatum) {
            const birthYear = parseInt(szDatum.substring(0, 4));
            if (!isNaN(birthYear) && birthYear > 1800) ageStr = `${currentYear - birthYear} éves${isMeghalt ? ' ✝' : ''}`;
        } else if (isMeghalt) ageStr = '✝';

        const cimStr = `${telepules}, ${utca}, ${hszam}`;
        const finalName = `${cN} ${kN}`;
        const finalCnp = data[0].cnp || generatedCnp;

        // 🚨 Itt is biztonságosan adjuk át az adatokat!
        selectParentForMember(finalName, finalCnp, type, ageStr, cimStr);
        
    } catch (err) { alert("Váratlan hiba történt a mentés során: " + err.message); }
};

// 3. MELLÉKATTINTÁS (Click-Outside) ÉRZÉKELŐ
document.addEventListener('click', function(event) {
    const isClickInsideApa = event.target.closest('#search-results-apa') || event.target.closest('#m-apjaneve');
    if (!isClickInsideApa) {
        const resApa = document.getElementById('search-results-apa');
        if (resApa) resApa.style.display = 'none';
    }
    
    const isClickInsideAnya = event.target.closest('#search-results-anya') || event.target.closest('#m-anyjaneve');
    if (!isClickInsideAnya) {
        const resAnya = document.getElementById('search-results-anya');
        if (resAnya) resAnya.style.display = 'none';
    }
});

// ==========================================
// 4. A Dinamikus Szülő-Rögzítő Ablak (Bővítve a kötelező Cím mezőkkel)
// ==========================================
window.quickAddParentFromMemberForm = function(searchedName, type) {
    const isFerfi = (type === 'apa');
    const parts = searchedName.trim().split(' ');
    const cN = parts[0] || '';
    const kN = parts.slice(1).join(' ') || '';

    const oldModal = document.getElementById('dynamic-parent-modal');
    if (oldModal) oldModal.remove();

    const familyNameLabel = isFerfi ? 'Családnév' : 'Leánykori családnév';

    const modalHtml = `
    <div class="modal modal-blur fade" id="dynamic-parent-modal" tabindex="-1" style="z-index: 1060;">
        <div class="modal-dialog modal-dialog-centered modal-lg"> <div class="modal-content shadow-lg border-0">
                <div class="modal-header bg-${isFerfi ? 'blue' : 'pink'} text-white">
                    <h5 class="modal-title"><i class="ti ti-user-plus me-2"></i>Új ${isFerfi ? 'Édesapa' : 'Édesanya'} Rögzítése</h5>
                    <button type="button" class="btn-close btn-close-white" onclick="closeDynamicParent()"></button>
                </div>
                <div class="modal-body p-4">
                    <div class="alert alert-warning shadow-sm border-0 mb-4">
                        <div class="d-flex">
                            <div><i class="ti ti-alert-triangle fs-2 me-3 text-warning"></i></div>
                            <div>
                                <h4 class="alert-title">Kötelező adatok!</h4>
                                <div class="text-muted small">A pontos azonosításhoz a név mellett a <b>teljes lakcím</b> megadása is szigorúan kötelező!</div>
                            </div>
                        </div>
                    </div>
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label fw-bold">${familyNameLabel} *</label>
                            <input type="text" id="dp-csaladnev" class="form-control border-${isFerfi ? 'blue' : 'pink'}" value="${cN}">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label fw-bold">Keresztnév *</label>
                            <input type="text" id="dp-knev" class="form-control border-${isFerfi ? 'blue' : 'pink'}" value="${kN}">
                        </div>

                        <div class="col-md-5 mt-4">
                            <label class="form-label fw-bold text-primary">Település *</label>
                            <input type="text" id="dp-telepules" class="form-control border-primary" placeholder="pl. Kovászna">
                        </div>
                        <div class="col-md-5 mt-4">
                            <label class="form-label fw-bold text-primary">Utca *</label>
                            <input type="text" id="dp-utca" class="form-control border-primary" placeholder="pl. Fő utca">
                        </div>
                        <div class="col-md-2 mt-4">
                            <label class="form-label fw-bold text-primary">Házszám *</label>
                            <input type="text" id="dp-hszam" class="form-control border-primary" placeholder="pl. 12">
                        </div>

                        <div class="col-12 mt-4 mb-2 border-top pt-3">
                            <label class="form-check form-switch cursor-pointer">
                                <input class="form-check-input form-check-input-lg" type="checkbox" id="dp-meghalt">
                                <span class="form-check-label fw-bold text-danger" style="font-size:1.1rem;"><i class="ti ti-coffin me-1"></i>A szülő már elhunyt</span>
                            </label>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label fw-bold">Foglalkozás</label>
                            <input type="text" id="dp-foglalkozas" class="form-control" placeholder="pl. Tanító">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label fw-bold">Születési dátum</label>
                            <input type="date" id="dp-szdatum" class="form-control">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label fw-bold">Vallás</label>
                            <input type="text" id="dp-vallas" class="form-control" value="Református">
                        </div>
                    </div>
                </div>
                <div class="modal-footer bg-light">
                    <button type="button" class="btn btn-link link-secondary" onclick="closeDynamicParent()">Mégse</button>
                    <button type="button" class="btn btn-${isFerfi ? 'primary' : 'danger'} fw-bold" onclick="saveDynamicParent('${type}', ${isFerfi})">
                        <i class="ti ti-device-floppy me-2"></i>Mentés a Családfába
                    </button>
                </div>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('dynamic-parent-modal')).show();
};

window.closeDynamicParent = function() {
    window.isSystemClosingModal = true; 
    const modalInst = bootstrap.Modal.getInstance(document.getElementById('dynamic-parent-modal'));
    if (modalInst) modalInst.hide();
    setTimeout(() => { window.isSystemClosingModal = false; }, 500);
};


// ==========================================
// 🚨 HIÁNYZÓ CÍM-KEZELŐ FUNKCIÓK (VISSZAÁLLÍTVA)
// ==========================================

window.getOrCreateLocality = async function(localityName, countyId = 1) {
    if (!localityName || localityName.trim() === '') return 1; // 1 = Ismeretlen/Alapértelmezett
    let name = localityName.trim();
    
    // 1. Megnézzük, létezik-e már a település
    const { data, error } = await _supabase.from('adrlocality')
        .select('id').ilike('name', name).limit(1).single();
        
    if (data) return data.id;
    
    // 2. Ha nem létezik, létrehozzuk!
    const { data: insData, error: insErr } = await _supabase.from('adrlocality')
        .insert([{ name: name, countyid: countyId }]).select('id').single();
        
    return insData ? insData.id : 1;
};

window.getOrCreateStreet = async function(streetName, localityId = 1) {
    if (!streetName || streetName.trim() === '') return 1;
    let name = streetName.trim();
    
    // 1. Megnézzük, létezik-e már az utca abban a településben
    const { data, error } = await _supabase.from('adrstreet')
        .select('id').ilike('name', name).eq('localityid', localityId).limit(1).single();
        
    if (data) return data.id;
    
    // 2. Ha nem létezik, létrehozzuk!
    const { data: insData, error: insErr } = await _supabase.from('adrstreet')
        .insert([{ name: name, localityid: localityId }]).select('id').single();
        
    return insData ? insData.id : 1;
};

// ==========================================
// 🚨 ANYAKÖNYVI VISSZATÉRÉS - VÉDŐOLTÁS MOTOR (INTERCEPTOR V6)
// ==========================================

// Ez a segédfunkció garantálja, hogy egyetlen kötelező mező se hiányozzon!
function injectHiddenIfNotExists(id, defVal) {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('input');
        el.type = 'hidden';
        el.id = id;
        el.value = defVal;
        const form = document.getElementById('member-registration-form');
        if(form) form.appendChild(el);
    } else if (!el.value && defVal !== undefined) {
        el.value = defVal;
    }
}

setTimeout(() => {
    const form = document.getElementById('member-registration-form');
    if (!form) return;

    const originalOnSubmit = form.onsubmit;

    form.onsubmit = async function(event) {
        event.preventDefault(); // Megakadályozzuk az oldal összeomlását

        if (window.isReturningToAnyakonyv) {
            // 🚨 VÉDŐOLTÁS: Láthatatlanul létrehozzuk és feltöltjük a hiányzó mezőket!
            // Így az eredeti mentés garantáltan nem fogja dobni a "Cannot read properties" hibát!
            injectHiddenIfNotExists('m-cnp', "999" + Math.floor(Math.random() * 9000000000 + 1000000000).toString());
            injectHiddenIfNotExists('m-c_utcaid', '1');
            injectHiddenIfNotExists('m-c_helysegid', '1');
            injectHiddenIfNotExists('m-befizetoev', new Date().getFullYear().toString());
            injectHiddenIfNotExists('m-csaladfo', 'false');
            injectHiddenIfNotExists('m-meghalt', 'false');
            injectHiddenIfNotExists('m-isvisible', 'true');
            injectHiddenIfNotExists('m-ferfi', 'false'); 
        }

        const cN = document.getElementById('m-csaladnev')?.value || '';
        const kN = document.getElementById('m-k_nev')?.value || '';

        try {
            // 🚨 MOST MÁR BIZTONSÁGOSAN LEFUTHAT AZ EREDETI MENTÉS
            if (originalOnSubmit) {
                await originalOnSubmit.call(form, event);
            } else if (typeof handleFormSubmit === 'function') {
                await handleFormSubmit(event);
            }
        } catch (err) {
            console.error("Hiba az eredeti mentés során:", err);
            alert("A rendszer megállította a mentést a következő hiba miatt:\n\n" + err.message);
            return; // Megállítjuk a folyamatot, nem zárjuk be az ablakot!
        }

        // Ha a mentés lefutott, ellenőrizzük, bekerült-e!
        if (window.isReturningToAnyakonyv) {
            const { data, error } = await _supabase.from('szemely')
                .select('id, cnp').eq('csaladnev', cN).eq('k_nev', kN)
                .order('id', {ascending: false}).limit(1).single();

            if (error || !data) {
                alert(`Figyelem! Az adatbázis megtagadta a rögzítést.\nOk: ${error?.message || 'Ismeretlen ok'}`);
                return;
            }

            // SIKERES MENTÉS!
            alert(`✅ A gyermek (${cN} ${kN}) adatait sikeresen mentettük az adatbázisba!`);
            window.isReturningToAnyakonyv = false;
            
            // Fülek visszaállítása
            const tabFin = document.querySelector('.nav-link.tab-fin');
            const tabReg = document.querySelector('.nav-link.tab-reg');
            const tabPers = document.querySelector('.nav-link.tab-pers');
            if (tabFin) tabFin.parentElement.style.display = 'block';
            if (tabReg) tabReg.parentElement.style.display = 'block';
            if (tabPers) tabPers.innerHTML = '<i class="ti ti-user me-2"></i>Személyes';

            // Visszatérés az Anyakönyvbe
            window.isSystemClosingModal = true;
            const tagModal = bootstrap.Modal.getInstance(document.getElementById('modal-add-member'));
            if (tagModal) tagModal.hide();

            setTimeout(() => {
                window.isSystemClosingModal = false;
                const akModal = new bootstrap.Modal(document.getElementById('modal-anyakonyv'));
                akModal.show();
                
                if (typeof selectMemberForAk === 'function') {
                    selectMemberForAk(data.id, `${cN} ${kN}`, 'szemely');
                }
            }, 500);
        }
    };
}, 1500);

// ==========================================
// NEM-ELLENŐRZÉS LOGIKA (God Mode)
// ==========================================

function _guessGenderFromFirstName(firstName) {
    if (!firstName) return 'Férfi';
    const fn = firstName.toLowerCase().trim().split(/\s+/)[0];
    const maleExceptions = ['béla', 'árpád', 'attila', 'géza', 'kálmán', 'zoltán', 'milán', 'iván', 'nándor', 'andor', 'tibor', 'ödön', 'ábrahám', 'illés', 'tamás', 'andrás', 'lukács', 'miklós', 'péter', 'viktor'];
    if (maleExceptions.some(e => fn === e)) return 'Férfi';
    if (fn.endsWith('a') || fn.endsWith('e')) return 'Nő';
    return 'Férfi';
}

window.openGenderCheckModal = function() {
    const members = (typeof allMembersData !== 'undefined') ? allMembersData : [];
    const toFix = members.filter(m => {
        if (m.meghalt || m.elkoltozott) return false;
        if (m.ferfi === null || m.ferfi === undefined) return true;
        const guessFerfi = _guessGenderFromFirstName(m.k_nev) === 'Férfi';
        return guessFerfi !== m.ferfi;
    });
    const withGender = members.filter(m => !m.meghalt && !m.elkoltozott && m.ferfi !== null && m.ferfi !== undefined);

    const stats = document.getElementById('gender-check-stats');
    stats.innerHTML = `
        <div class="row g-2 mb-2">
            <div class="col-auto">
                <div class="alert alert-warning mb-0 py-2">
                    <b>${toFix.length}</b> tagnál hiányzik a nem adat
                </div>
            </div>
            <div class="col-auto">
                <div class="alert alert-success mb-0 py-2">
                    <b>${withGender.length}</b> tagnál már kitöltött
                </div>
            </div>
        </div>`;

    const tbody = document.getElementById('gender-check-tbody');
    tbody.innerHTML = '';
    const footerInfo = document.getElementById('gender-check-footer-info');

    if (toFix.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-success py-4"><i class="ti ti-check me-2"></i>Minden aktív tag esetén meg van adva a nem!</td></tr>';
        footerInfo.textContent = '';
    } else {
        toFix.forEach(m => {
            const fullName = [m.namepattern, m.csaladnev, m.k_nev].filter(Boolean).join(' ');
            const guessFerfi = _guessGenderFromFirstName(m.k_nev) === 'Férfi';
            const badgeCls = guessFerfi ? 'bg-blue' : 'bg-pink';
            const badgeLabel = guessFerfi ? 'Férfi' : 'Nő';
            const storedLabel = m.ferfi === null || m.ferfi === undefined ? '—' : (m.ferfi ? 'Férfi' : 'Nő');
            const storedCls = m.ferfi === null || m.ferfi === undefined ? 'text-muted' : (m.ferfi ? 'text-blue fw-bold' : 'text-pink fw-bold');
            tbody.innerHTML += `
                <tr>
                    <td class="fw-medium">${fullName || '—'}</td>
                    <td class="text-muted">${m.k_nev || '—'}</td>
                    <td class="${storedCls}">${storedLabel}</td>
                    <td><span class="badge ${badgeCls} text-white">${badgeLabel}</span></td>
                    <td>
                        <select class="form-select form-select-sm" data-member-id="${m.id}" style="min-width:110px;">
                            <option value="true" ${guessFerfi ? 'selected' : ''}>Férfi</option>
                            <option value="false" ${!guessFerfi ? 'selected' : ''}>Nő</option>
                            <option value="">-- Ne módosítsa --</option>
                        </select>
                    </td>
                </tr>`;
        });
        footerInfo.textContent = `${toFix.length} elem listázva — a "Ne módosítsa" opciót választva kihagyja azt a tagot`;
    }

    new bootstrap.Modal(document.getElementById('modal-gender-check')).show();
};

window.saveGenderFixes = async function() {
    const selects = document.querySelectorAll('#gender-check-tbody select[data-member-id]');
    const toUpdate = [];
    selects.forEach(sel => {
        if (sel.value !== '') {
            toUpdate.push({ id: parseInt(sel.dataset.memberId), ferfi: sel.value === 'true' });
        }
    });

    if (toUpdate.length === 0) {
        alert('Nincs módosítandó adat (minden tag "Ne módosítsa" opcióval van jelölve).');
        return;
    }

    const btn = document.querySelector('#modal-gender-check .btn-success');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Mentés...'; }

    let ok = 0, errCount = 0;
    for (const item of toUpdate) {
        const { error } = await _supabase.from('szemely').update({ ferfi: item.ferfi }).eq('id', item.id);
        if (error) {
            console.error('Frissítési hiba:', item.id, error.message);
            errCount++;
        } else {
            ok++;
            if (typeof allMembersData !== 'undefined') {
                const idx = allMembersData.findIndex(m => m.id === item.id);
                if (idx !== -1) allMembersData[idx].ferfi = item.ferfi;
            }
        }
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy me-2"></i>Kijelöltek mentése'; }

    alert(`Mentés kész!\n✅ ${ok} tag frissítve${errCount > 0 ? `\n❌ ${errCount} hiba` : ''}.`);
    bootstrap.Modal.getInstance(document.getElementById('modal-gender-check')).hide();

    if (typeof generateOverviewDashboard === 'function') generateOverviewDashboard(allMembersData);
};

// ==========================================
// FÜLVÁLTÁS GOMBKEZELÉS
// ==========================================

window.switchMainTabs = function(tabName) {
    var allBtns = ['btn-show-new-member','btn-show-new-family','btn-show-new-presbiter','btn-show-new-korzet','btn-print-korzetek','btn-print-valasztok'];
    allBtns.forEach(function(id) { var el = document.getElementById(id); if (el) el.classList.add('d-none'); });

    if (tabName === 'member') {
        document.getElementById('btn-show-new-member')?.classList.remove('d-none');
    } else if (tabName === 'family') {
        document.getElementById('btn-show-new-family')?.classList.remove('d-none');
    } else if (tabName === 'presbiter') {
        document.getElementById('btn-show-new-presbiter')?.classList.remove('d-none');
    } else if (tabName === 'korzet') {
        document.getElementById('btn-show-new-korzet')?.classList.remove('d-none');
        document.getElementById('btn-print-korzetek')?.classList.remove('d-none');
    } else if (tabName === 'valaszto') {
        document.getElementById('btn-print-valasztok')?.classList.remove('d-none');
    }
};