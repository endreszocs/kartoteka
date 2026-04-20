// ============================================================
//  KARTOTÉKA — Dashboard API  (teljes átírás)
// ============================================================

const HU_MONTHS = ['Január','Február','Március','Április','Május','Június',
                   'Július','Augusztus','Szeptember','Október','November','December'];
const HU_MONTHS_SHORT = ['Jan','Feb','Már','Ápr','Máj','Jún',
                         'Júl','Aug','Sze','Okt','Nov','Dec'];
const HU_DAYS = ['vasárnap','hétfő','kedd','szerda','csütörtök','péntek','szombat'];

// ── Segédfüggvények ──────────────────────────────────────────
function _greeting() {
    const h = new Date().getHours();
    if (h < 6)  return 'Jó éjszakát!';
    if (h < 12) return 'Jó reggelt kívánunk!';
    if (h < 18) return 'Jó napot kívánunk!';
    return 'Jó estét kívánunk!';
}

function _formatHuDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getFullYear()}. ${HU_MONTHS[dt.getMonth()]} ${dt.getDate()}.`;
}

function _ageFromDate(dateStr) {
    if (!dateStr) return null;
    const today = new Date();
    const b = new Date(dateStr);
    let age = today.getFullYear() - b.getFullYear();
    const m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
    return age;
}

// ── BELÉPÉSI PONT ─────────────────────────────────────────────
async function loadDashboardData() {
    const today = new Date();
    const curYear = today.getFullYear();

    // Hero banner feltöltése azonnal (nem vár adatbázisra)
    _fillHeroBanner(today);

    // ── EGYETLEN NAGY LEKÉRDEZÉS (cachedQuery) ────────────────
    // Korábban ~30 Supabase hívás volt, most ~10 párhuzamos, 2 perces cache-el
    const chartStartDate = `${curYear - 1}-${String(today.getMonth() + 1).padStart(2,'0')}-01`;
    const _q = typeof cachedQuery === 'function' ? cachedQuery : function(_k, fn) { return fn(); };

    const [
        szemResult,
        elkoltozottResult,
        csaladResult,
        befizetesResult,
        kiadasResult,
        payersResult,
        presbResult,
        nevnapResult,
        munkanaploResult,
        recentResult
    ] = await Promise.all([
        _q('dash_szemely', () => _supabase.from('szemely').select('id, csaladnev, k_nev, namepattern, sz_datum, ferfi, meghalt').eq('meghalt', false)),
        _q('dash_elkoltozott', () => _supabase.from('elkoltozott').select('id_szemely')),
        _q('dash_csalad_count', () => _supabase.from('csalad').select('*', { count: 'exact', head: true })),
        _q('dash_befizetes_' + chartStartDate, () => _supabase.from('befizetes').select('osszeg, datum').gte('datum', chartStartDate)),
        _q('dash_kiadas_' + chartStartDate, () => _supabase.from('kiadas').select('osszeg, datum').gte('datum', chartStartDate)),
        _q('dash_payers_' + curYear, () => _supabase.from('befizetes').select('*', { count: 'exact', head: true }).eq('fizetettev', curYear)),
        _q('dash_presb', () => _supabase.from('presbiter').select('*', { count: 'exact', head: true })),
        _q('nevnap_all', () => _supabase.from('nevnap').select('nev1, nev2, nev3, honap, nap'), 3600000),
        _q('dash_munkanaplo_week', () => _supabase.from('munkanaplo').select('*', { count: 'exact', head: true })
            .gte('idopont', _weekStart(today)).lte('idopont', _weekEnd(today) + 'T23:59:59'), 60000),
        _q('dash_recent', () => _supabase.from('munkanaplo').select('idopont, jellege, cim, created_at')
            .order('created_at', { ascending: false }).limit(10), 60000)
    ]);

    // Közös adatok előkészítése
    const allMembers = szemResult.data || [];
    const elkoltozottIds = new Set((elkoltozottResult.data || []).map(e => e.id_szemely));
    const activeMembers = allMembers.filter(m => !elkoltozottIds.has(m.id));
    const allBefizetes = befizetesResult.data || [];
    const allKiadas = kiadasResult.data || [];
    const allNevnapok = nevnapResult.data || [];

    // Közös objektum, amit minden függvény kap
    const shared = {
        allMembers, activeMembers, elkoltozottIds,
        allBefizetes, allKiadas, allNevnapok,
        totalFamilies: csaladResult.count,
        payersCount: payersResult.count,
        presbCount: presbResult.count,
        weekEvents: munkanaploResult.count,
        recentActivity: recentResult.data
    };

    // Párhuzamos UI frissítés (nincs már hálózati hívás)
    await Promise.all([
        _loadKPICards(today, shared),
        _loadBirthdaysAndNamedays(today, shared),
        _loadCharts(today, shared),
        _loadAnnualProgram(curYear, today),
        _loadRecentActivity(shared),
        _loadBottomStats(today, shared)
    ]);
}

function _weekStart(today) {
    const d = new Date(today);
    d.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
}
function _weekEnd(today) {
    const d = new Date(today);
    d.setDate(today.getDate() - ((today.getDay() + 6) % 7) + 6);
    return d.toISOString().slice(0, 10);
}

// ── HERO BANNER ───────────────────────────────────────────────
async function _fillHeroBanner(today) {
    const dayName  = HU_DAYS[today.getDay()];
    const dateStr  = `${today.getFullYear()}. ${HU_MONTHS[today.getMonth()]} ${today.getDate()}. — ${dayName}`;

    const greetEl  = document.getElementById('dash-greeting');
    const dateEl   = document.getElementById('dash-date-line');
    const congEl   = document.getElementById('dash-congregation-line');

    if (dateEl) dateEl.textContent = dateStr;

    // Lelkész neve + gyülekezet — getCachedProfile() használata (0 API hívás cache-ből)
    try {
        const prof = await getCachedProfile();
        if (prof) {
            const name = prof.full_name ? `, ${prof.full_name.split(' ').slice(-1)[0]} testvér!` : '!';
            if (greetEl) greetEl.textContent = _greeting().replace('!', name);
            if (congEl && prof.congregation_id) {
                const congName = await getCachedCongregationName(prof.congregation_id);
                if (congName) congEl.textContent = `📍 ${congName}`;
            }
        }
    } catch(e) {
        if (greetEl) greetEl.textContent = _greeting();
    }

    // Névnap a bannerbe — a teljes nevnap tábla later a shared-ből jön,
    // de a banner azonnal tölt, tehát 1 extra kérdés marad
    const { data: todayNames } = await _supabase.from('nevnap')
        .select('nev1,nev2,nev3')
        .eq('honap', String(today.getMonth() + 1))
        .eq('nap', String(today.getDate())).single();
    const namesEl = document.getElementById('dash-today-names');
    if (namesEl && todayNames) {
        const names = [todayNames.nev1, todayNames.nev2, todayNames.nev3].filter(Boolean);
        namesEl.innerHTML = `<i class="ti ti-rosette me-1"></i>Ma névnapja van: <b>${names.join(', ')}</b>`;
    }
}

// ── KPI KÁRTYÁK ────────────────────────────────────────────────
async function _loadKPICards(today, shared) {
    const curMonth = today.getMonth() + 1;
    const curYear = today.getFullYear();
    const monthStart = `${curYear}-${String(curMonth).padStart(2,'0')}-01`;

    // Havi bevétel — kliens-oldali szűrés a már lekérdezett adatból
    const monthIncome = shared.allBefizetes
        .filter(r => r.datum >= monthStart)
        .reduce((s, r) => s + Number(r.osszeg), 0);

    _setText('kpi-active-members', shared.activeMembers.length || '—');
    _setText('kpi-families', shared.totalFamilies ?? '—');
    _setText('kpi-month-income', monthIncome > 0 ? monthIncome.toLocaleString('hu') : '0');
    _setText('kpi-week-events', shared.weekEvents ?? '—');
}

// ── SZÜLETÉS- ÉS NÉVNAPOSOK ────────────────────────────────────
async function _loadBirthdaysAndNamedays(today, shared) {
    const mm_dd = today.toISOString().slice(5, 10);
    const curYear = today.getFullYear();

    // Mai születésnaposok — kliens-oldali szűrés a shared adatból
    const bdays = shared.activeMembers.filter(p => p.sz_datum && p.sz_datum.slice(5, 10) === mm_dd);

    const bEl = document.getElementById('list-birthdays');
    if (bEl) {
        if (bdays.length > 0) {
            bEl.innerHTML = bdays.map(p => {
                const age = p.sz_datum ? curYear - new Date(p.sz_datum).getFullYear() : null;
                const name = [p.namepattern, p.csaladnev, p.k_nev].filter(Boolean).join(' ');
                return `<div class="celebrant-item">
                    <i class="ti ti-cake text-blue fs-5"></i>
                    <div class="celebrant-name">${name}</div>
                    ${age ? `<span class="celebrant-badge bg-blue-lt text-blue">${age} éves</span>` : ''}
                </div>`;
            }).join('');
        } else {
            bEl.innerHTML = '<div class="text-muted small px-2">Ma nincs születésnapos.</div>';
        }
    }

    // Mai névnaposok — kliens-oldali szűrés a shared névnap adatból
    const namesRow = shared.allNevnapok.find(
        n => n.honap === String(today.getMonth() + 1) && n.nap === String(today.getDate())
    );

    const nEl = document.getElementById('list-namedays');
    if (nEl) {
        if (namesRow) {
            const todayNames = [namesRow.nev1, namesRow.nev2, namesRow.nev3].filter(Boolean);
            // Névnapos tagok — kliens-oldali szűrés a shared adatból
            const memberNames = shared.activeMembers.filter(m => todayNames.includes(m.k_nev));

            if (memberNames.length > 0) {
                nEl.innerHTML = memberNames.map(p => {
                    const name = [p.namepattern, p.csaladnev, p.k_nev].filter(Boolean).join(' ');
                    return `<div class="celebrant-item nameday">
                        <i class="ti ti-rosette text-green fs-5"></i>
                        <div class="celebrant-name">${name}</div>
                    </div>`;
                }).join('');
            } else {
                nEl.innerHTML = `<div class="text-muted small px-2">Ma: <em>${todayNames.join(', ')}</em> — nincs érintett tag.</div>`;
            }
        } else {
            nEl.innerHTML = '<div class="text-muted small px-2">—</div>';
        }
    }

    // Következő 14 nap születésnapjai — shared adatból
    _loadUpcomingBirthdays(today, shared);
}

function _loadUpcomingBirthdays(today, shared) {
    const el = document.getElementById('list-upcoming-birthdays');
    const badge = document.getElementById('upcoming-count-badge');
    if (!el) return;

    const upcoming = [];
    const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    shared.activeMembers.filter(m => m.sz_datum).forEach(m => {
        const b = new Date(m.sz_datum);
        // Idei születésnap
        let nextBday = new Date(today.getFullYear(), b.getMonth(), b.getDate());
        if (nextBday.getTime() <= todayMs) nextBday.setFullYear(today.getFullYear() + 1);
        const diffDays = Math.round((nextBday.getTime() - todayMs) / 86400000);
        if (diffDays > 0 && diffDays <= 14) {
            upcoming.push({ ...m, nextBday, diffDays, age: today.getFullYear() + (nextBday.getFullYear() > today.getFullYear() ? 1 : 0) - b.getFullYear() });
        }
    });

    upcoming.sort((a, b) => a.diffDays - b.diffDays);

    if (badge) badge.textContent = `${upcoming.length} fő`;

    if (upcoming.length === 0) {
        el.innerHTML = '<div class="text-muted small p-3">A következő 14 napban nincs születésnap.</div>';
        return;
    }

    el.innerHTML = upcoming.map(p => {
        const name = [p.namepattern, p.csaladnev, p.k_nev].filter(Boolean).join(' ');
        const dayLabel = p.diffDays === 1 ? 'holnap' : `${p.diffDays} nap`;
        const mon = HU_MONTHS_SHORT[p.nextBday.getMonth()];
        const day = p.nextBday.getDate();
        return `<div class="upcoming-item">
            <div class="upcoming-date-badge">
                <div class="day">${day}</div>
                <div>${mon}</div>
            </div>
            <div class="flex-grow-1">
                <div class="fw-medium" style="font-size:0.9rem;">${name}</div>
                <div class="text-muted" style="font-size:0.78rem;">${p.age} éves lesz</div>
            </div>
            <span class="badge ${p.diffDays <= 3 ? 'bg-red-lt text-red' : 'bg-orange-lt text-orange'}" style="font-size:0.75rem;">${dayLabel}</span>
        </div>`;
    }).join('');
}

// ── GRAFIKONOK ─────────────────────────────────────────────────
async function _loadCharts(today, shared) {
    // ApexCharts lazy betöltése — csak ha kell
    if (typeof loadLib === 'function') await loadLib('apexcharts');
    _renderIncomeChart(today, shared);
    _renderAgeGroupChart(shared);
}

function _renderIncomeChart(today, shared) {
    const months = [];
    const incomes = [];
    const expenses = [];

    // Kliens-oldali hónap-szűrés — 0 hálózati hívás (korábban 16)
    for (let i = 7; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-01`;
        const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const endStr = end.toISOString().slice(0,10);

        const monthInc = shared.allBefizetes.filter(r => r.datum >= start && r.datum <= endStr);
        const monthExp = shared.allKiadas.filter(r => r.datum >= start && r.datum <= endStr);

        incomes.push(Math.round(monthInc.reduce((s, r) => s + Number(r.osszeg), 0)));
        expenses.push(Math.round(monthExp.reduce((s, r) => s + Number(r.osszeg), 0)));
        months.push(`${HU_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`);
    }

    const el = document.getElementById('chart-monthly-income');
    if (!el || typeof ApexCharts === 'undefined') return;

    new ApexCharts(el, {
        chart: { type: 'bar', height: 240, toolbar: { show: false }, fontFamily: 'Inter Var, sans-serif' },
        series: [
            { name: 'Bevétel (RON)', data: incomes },
            { name: 'Kiadás (RON)', data: expenses }
        ],
        xaxis: { categories: months, labels: { style: { fontSize: '11px' } } },
        yaxis: { labels: { formatter: v => v.toLocaleString('hu') + ' RON', style: { fontSize: '11px' } } },
        colors: ['#2fb344', '#d63939'],
        plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
        dataLabels: { enabled: false },
        grid: { borderColor: '#f1f5f9', strokeDashArray: 4 },
        tooltip: { y: { formatter: v => v.toLocaleString('hu') + ' RON' } },
        legend: { position: 'top', horizontalAlign: 'right', fontSize: '12px' }
    }).render();
}

function _renderAgeGroupChart(shared) {
    const groups = { '0–17': 0, '18–35': 0, '36–60': 0, '61–80': 0, '80+': 0 };
    const curYear = new Date().getFullYear();

    shared.activeMembers.forEach(m => {
        if (!m.sz_datum) return;
        const age = curYear - new Date(m.sz_datum).getFullYear();
        if (age < 18)      groups['0–17']++;
        else if (age < 36) groups['18–35']++;
        else if (age < 61) groups['36–60']++;
        else if (age < 81) groups['61–80']++;
        else               groups['80+']++;
    });

    const el = document.getElementById('chart-age-groups');
    if (!el || typeof ApexCharts === 'undefined') return;

    new ApexCharts(el, {
        chart: { type: 'donut', height: 220, fontFamily: 'Inter Var, sans-serif' },
        series: Object.values(groups),
        labels: Object.keys(groups),
        colors: ['#4299e1','#48bb78','#ed8936','#9f7aea','#fc8181'],
        plotOptions: { pie: { donut: { size: '60%' } } },
        dataLabels: { formatter: (val, opts) => `${opts.w.config.series[opts.seriesIndex]} fő` },
        legend: { position: 'bottom', fontSize: '12px' },
        tooltip: { y: { formatter: v => `${v} fő` } }
    }).render();
}

// ── GYÜLEKEZETI PROGRAMSZERVEZŐ ────────────────────────────────
let _allPrograms = {};
let _currentProgramMonth = null;
let _programYear = new Date().getFullYear();

const PROG_TIPUS_EMOJI = {
    istentisztelet: '⛪', bibliaora: '📖', imaora: '🙏', ifjusagi: '🎯',
    gyerekprogram: '🧒', konferencia: '🎤', hangverseny: '🎵', kozossegi: '🤝',
    presbiteri: '📋', latogatas: '🏠', unnep: '🎄', tabor: '⛺',
    evangelizacio: '📣', diakoniai: '❤️', noszovetseg: '🌸', egyeb: '📌'
};
const PROG_TIPUS_LABELS = {
    istentisztelet: '⛪ Istentisztelet', bibliaora: '📖 Bibliaóra', imaora: '🙏 Imaóra',
    ifjusagi: '🎯 Ifjúsági', gyerekprogram: '🧒 Gyerekprogram', konferencia: '🎤 Konferencia',
    hangverseny: '🎵 Hangverseny', kozossegi: '🤝 Közösségi', presbiteri: '📋 Presbiteri',
    latogatas: '🏠 Látogatás', unnep: '🎄 Ünnep', tabor: '⛺ Tábor',
    evangelizacio: '📣 Evangélizáció', diakoniai: '❤️ Diakónia', noszovetseg: '🌸 Nőszövetség',
    egyeb: '📌 Egyéb'
};
// Közös szín map — naptár pont és lista pont is ezt használja
const PROG_TIPUS_COLOR = {
    istentisztelet: '#3b82f6', bibliaora: '#f59e0b', imaora: '#8b5cf6', ifjusagi: '#ec4899',
    gyerekprogram: '#14b8a6', konferencia: '#ef4444', hangverseny: '#6366f1', kozossegi: '#10b981',
    presbiteri: '#6b7280', latogatas: '#f97316', unnep: '#eab308', tabor: '#22c55e',
    evangelizacio: '#d946ef', diakoniai: '#f43f5e', noszovetseg: '#ec4899', egyeb: '#94a3b8'
};

// Segédfüggvény: típus emoji (egyéb esetén egyedi emoji)
function _progEmoji(e) {
    if (e.tipus === 'egyeb' && e.egyedi_emoji) return e.egyedi_emoji;
    return PROG_TIPUS_EMOJI[e.tipus] || '📌';
}
// Segédfüggvény: típus megjelenítendő név
function _progTypusLabel(e) {
    if (e.tipus === 'egyeb' && e.egyedi_tipus_nev) return e.egyedi_tipus_nev;
    return (PROG_TIPUS_LABELS[e.tipus] || 'Egyéb').replace(/^.*?\s/, ''); // emoji nélkül
}
// Segédfüggvény: típus szín
function _progColor(e) {
    return PROG_TIPUS_COLOR[e.tipus] || '#94a3b8';
}

const PROG_PRIORITAS_CSS = {
    alacsony: 'bg-secondary-lt text-secondary',
    normal: '',
    fontos: 'bg-orange-lt text-orange',
    kiemelt: 'bg-red-lt text-red fw-bold'
};

async function loadProgramForYear(year) {
    year = parseInt(year);
    _programYear = year;
    _allPrograms = {};

    const tabsEl   = document.getElementById('program-month-tabs');
    const calGridEl = document.getElementById('program-calendar-grid');
    const listViewEl = document.getElementById('program-list-view');
    if (calGridEl) calGridEl.innerHTML = '<div class="text-muted text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Betöltés...</div>';
    if (listViewEl) listViewEl.innerHTML = '';

    const { data: events } = await _supabase.from('gyulekezeti_programok')
        .select('*')
        .gte('datum', `${year}-01-01`)
        .lte('datum', `${year}-12-31`)
        .order('datum')
        .order('ido_kezdes');

    // Csoportosítás hónapok szerint
    for (let i = 0; i < 12; i++) _allPrograms[i] = [];
    (events || []).forEach(e => {
        const m = new Date(e.datum).getMonth();
        _allPrograms[m].push(e);
    });

    // Hónap fülek
    const today = new Date();
    const curMonth = (year === today.getFullYear()) ? today.getMonth() : 0;
    if (tabsEl) {
        tabsEl.innerHTML = HU_MONTHS.map((name, i) => {
            const isToday = (year === today.getFullYear() && i === today.getMonth());
            const count = _allPrograms[i]?.length || 0;
            const doneCount = (_allPrograms[i] || []).filter(e => e.teljesitett).length;
            const badge = count > 0
                ? ` <span class="badge ${doneCount === count ? 'bg-green-lt text-green' : 'bg-teal-lt text-teal'}" style="font-size:0.7rem;">${doneCount}/${count}</span>`
                : '';
            return `<button class="program-tab-btn${i === curMonth ? ' active' : ''}${isToday ? ' today' : ''}"
                onclick="showProgramMonth(${i})" id="prog-tab-${i}">
                ${HU_MONTHS_SHORT[i]}${badge}
            </button>`;
        }).join('');
    }

    _currentProgramMonth = curMonth;
    showProgramMonth(curMonth, today);

    // Motiváló üzenet ha üres
    const inspireEl = document.getElementById('program-empty-inspire');
    const totalEvents = (events || []).length;
    if (inspireEl) inspireEl.classList.toggle('d-none', totalEvents > 0);
}

window.showProgramMonth = function(monthIdx, today) {
    today = today || new Date();
    const events = _allPrograms[monthIdx] || [];

    _currentProgramMonth = monthIdx;

    // Mini naptár renderelés
    _renderCalendarGrid(monthIdx, events, today);
    // Mini lista renderelés
    _renderMiniList(monthIdx, events);
};

function _escHtmlDash(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Mini naptár rács (pont-alapú, col-lg-4) ─────────────────────
const CAL_DAYS_HU = ['H', 'K', 'Sz', 'Cs', 'P', 'Szo', 'V'];

function _renderCalendarGrid(monthIdx, events, today) {
    const gridEl = document.getElementById('program-calendar-grid');
    if (!gridEl) return;

    const year = _programYear;
    const todayStr = today.toISOString().slice(0, 10);
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    let startDow = new Date(year, monthIdx, 1).getDay() - 1;
    if (startDow < 0) startDow = 6;

    // Események napokra bontva
    const dayEvents = {};
    for (let d = 1; d <= daysInMonth; d++) dayEvents[d] = [];
    events.forEach(e => {
        const sd = new Date(e.datum + 'T00:00:00');
        const ed = e.datum_vege ? new Date(e.datum_vege + 'T00:00:00') : sd;
        for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) {
            if (d.getMonth() === monthIdx && d.getFullYear() === year) {
                dayEvents[d.getDate()] = dayEvents[d.getDate()] || [];
                dayEvents[d.getDate()].push(e);
            }
        }
    });

    let html = '<div class="prog-cal-wrap"><div class="prog-cal">';
    CAL_DAYS_HU.forEach(d => { html += `<div class="prog-cal-header">${d}</div>`; });
    for (let i = 0; i < startDow; i++) html += '<div class="prog-cal-cell"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const isPast = dateStr < todayStr;
        const isSunday = new Date(dateStr + 'T00:00:00').getDay() === 0;
        const evts = dayEvents[d] || [];

        let cls = 'prog-cal-day';
        if (isToday) cls += ' today';
        else if (isPast) cls += ' past';
        if (isSunday) cls += ' sunday';
        if (evts.length > 0) cls += ' has-events';
        if (evts.length > 1) cls += ' multi';

        const tooltip = evts.length > 0
            ? `${HU_MONTHS[monthIdx]} ${d}. — ${evts.map(e => _progEmoji(e) + ' ' + e.cim).join(', ')}`
            : `${HU_MONTHS[monthIdx]} ${d}.`;

        // Típus színű pontok (max 3)
        let dotsHtml = '';
        if (evts.length > 0) {
            const uniqueColors = [...new Set(evts.map(e => _progColor(e)))].slice(0, 3);
            dotsHtml = '<div class="prog-cal-dots">' + uniqueColors.map(c => `<span style="background:${c}"></span>`).join('') + '</div>';
        }
        html += `<div class="prog-cal-cell"><div class="${cls}" onclick="onCalDayClick(${d},${monthIdx})" title="${_escHtmlDash(tooltip)}">${d}${dotsHtml}</div></div>`;
    }

    const totalCells = startDow + daysInMonth;
    const rem = totalCells % 7;
    if (rem > 0) for (let i = 0; i < 7 - rem; i++) html += '<div class="prog-cal-cell"></div>';

    html += '</div></div>';
    gridEl.innerHTML = html;

    // Hónap label frissítése
    const labelEl = document.getElementById('prog-month-label');
    if (labelEl) labelEl.textContent = `${HU_MONTHS[monthIdx]} ${year}`;
}

// Mini lista renderelés a naptár alá
function _renderMiniList(monthIdx, events) {
    const el = document.getElementById('program-list-view');
    if (!el) return;

    if (events.length === 0) {
        el.innerHTML = `<div class="text-muted text-center py-2" style="font-size:0.78rem">
            Nincs tervezett program.
        </div>`;
        return;
    }

    el.innerHTML = events.map(e => {
        const d = new Date(e.datum + 'T00:00:00');
        const dayStr = `${d.getDate()}.`;
        const color = _progColor(e);
        const emoji = _progEmoji(e);
        const doneCls = e.teljesitett ? ' done' : '';
        const timeStr = e.ido_kezdes ? e.ido_kezdes.slice(0, 5) : '';
        let dateLabel = dayStr;
        if (e.datum_vege && e.datum_vege !== e.datum) {
            const d2 = new Date(e.datum_vege + 'T00:00:00');
            dateLabel += `–${d2.getDate()}.`;
        }
        return `<div class="prog-mini-item" onclick="openProgramModal('${e.id}')" title="${_escHtmlDash(e.cim)}">
            <div class="prog-mini-dot" style="background:${color}"></div>
            <div class="prog-mini-date">${dateLabel}</div>
            <span style="font-size:0.75rem">${emoji}</span>
            <div class="prog-mini-title${doneCls}">${_escHtmlDash(e.cim)}</div>
            ${timeStr ? `<div class="prog-mini-time">${timeStr}</div>` : ''}
        </div>`;
    }).join('');
}

// Naptár nap kattintás → új program az adott napra
window.onCalDayClick = function(day, monthIdx) {
    const dateStr = `${_programYear}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    openProgramModal(null);
    setTimeout(() => { document.getElementById('prog-datum').value = dateStr; }, 100);
};

// Hónapváltás nyilakkal
window.progNavMonth = function(dir) {
    let m = _currentProgramMonth + dir;
    let y = _programYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    if (y !== _programYear) {
        _programYear = y;
        const sel = document.getElementById('dash-program-year');
        if (sel) sel.value = y;
        loadProgramForYear(y).then(() => {
            _currentProgramMonth = m;
            showProgramMonth(m);
        });
    } else {
        _currentProgramMonth = m;
        showProgramMonth(m);
    }
};

// ── Egyéb típus toggle ──
window.toggleEgyediTipus = function() {
    const val = document.getElementById('prog-tipus').value;
    const show = val === 'egyeb';
    document.getElementById('prog-egyedi-tipus-row')?.classList.toggle('d-none', !show);
    document.getElementById('prog-egyedi-emoji-row')?.classList.toggle('d-none', !show);
    if (show) {
        setTimeout(() => document.getElementById('prog-egyedi-tipus')?.focus(), 100);
    }
};

// ── Emoji picker ──
const EMOJI_LIST = [
    // Egyházi / vallási
    '⛪','✝️','🙏','📖','🕊️','🔔','💒','🕯️',
    // Események
    '🎤','🎵','🎶','🎭','🎪','🏕️','⛺','🎓',
    // Emberek / közösség
    '👥','👨‍👩‍👧‍👦','👶','🧒','👨‍🏫','🤝','💪','❤️',
    // Figyelmeztetés / fontos
    '⚠️','🔴','🟢','🔵','⭐','🌟','💡','🔥',
    // Naptár / idő
    '📅','📆','🗓️','⏰','🕐','📋','📝','✏️',
    // Közlekedés / helyszín
    '🏠','🏛️','🚌','🚗','✈️','🌍','📍','🗺️',
    // Étel / társas
    '🍞','🍷','☕','🎂','🎁','🎄','🎊','🎉',
    // Természet / évszak
    '🌸','🌻','🍂','❄️','☀️','🌙','⛰️','🌊',
    // Egyéb hasznos
    '📣','📢','💌','📧','💰','🏆','🎯','🛠️',
    '📚','🎒','🩺','🤲','👑','🦅','🐑','🌿'
];

window.toggleEmojiPicker = function() {
    const panel = document.getElementById('emoji-picker-panel');
    if (!panel) return;
    const isHidden = panel.classList.contains('d-none');
    panel.classList.toggle('d-none');
    if (isHidden && !panel.dataset.built) {
        const grid = document.getElementById('emoji-picker-grid');
        grid.innerHTML = EMOJI_LIST.map(e =>
            `<button type="button" class="emoji-pick-btn" onclick="pickEmoji('${e}')">${e}</button>`
        ).join('');
        panel.dataset.built = '1';
    }
};

window.pickEmoji = function(emoji) {
    document.getElementById('prog-egyedi-emoji').value = emoji;
    document.getElementById('emoji-picker-panel')?.classList.add('d-none');
};

// Kattintás kívülre bezárja
document.addEventListener('click', function(ev) {
    const panel = document.getElementById('emoji-picker-panel');
    if (panel && !panel.classList.contains('d-none')) {
        if (!ev.target.closest('#prog-egyedi-emoji-row')) {
            panel.classList.add('d-none');
        }
    }
});

// ── Program modal megnyitás ──
window.openProgramModal = function(editId, defaultMonth) {
    const modal = new bootstrap.Modal(document.getElementById('modal-program'));
    const titleEl = document.getElementById('modal-program-title');

    // Mezők resetelése
    document.getElementById('prog-edit-id').value = '';
    document.getElementById('prog-cim').value = '';
    document.getElementById('prog-datum').value = '';
    document.getElementById('prog-datum-vege').value = '';
    document.getElementById('prog-ido-kezdes').value = '';
    document.getElementById('prog-ido-befejezes').value = '';
    document.getElementById('prog-helyszin').value = '';
    document.getElementById('prog-tipus').value = 'istentisztelet';
    document.getElementById('prog-prioritas').value = 'normal';
    document.getElementById('prog-ismetlodes').value = '';
    document.getElementById('prog-megjegyzes').value = '';
    document.getElementById('prog-egyedi-tipus').value = '';
    document.getElementById('prog-egyedi-emoji').value = '';
    document.getElementById('prog-egyedi-tipus-row')?.classList.add('d-none');
    document.getElementById('prog-egyedi-emoji-row')?.classList.add('d-none');

    if (editId) {
        // Szerkesztés mód — keresés a betöltött programok között
        let prog = null;
        for (let m = 0; m < 12; m++) {
            prog = (_allPrograms[m] || []).find(p => p.id === editId);
            if (prog) break;
        }
        if (prog) {
            titleEl.innerHTML = '<i class="ti ti-pencil me-2"></i>Program szerkesztése';
            document.getElementById('prog-edit-id').value = prog.id;
            document.getElementById('prog-cim').value = prog.cim || '';
            document.getElementById('prog-datum').value = prog.datum || '';
            document.getElementById('prog-datum-vege').value = prog.datum_vege || '';
            document.getElementById('prog-ido-kezdes').value = prog.ido_kezdes ? prog.ido_kezdes.slice(0,5) : '';
            document.getElementById('prog-ido-befejezes').value = prog.ido_befejezes ? prog.ido_befejezes.slice(0,5) : '';
            document.getElementById('prog-helyszin').value = prog.helyszin || '';
            document.getElementById('prog-tipus').value = prog.tipus || 'istentisztelet';
            document.getElementById('prog-prioritas').value = prog.prioritas || 'normal';
            document.getElementById('prog-ismetlodes').value = prog.ismetlodes_tipus || '';
            document.getElementById('prog-megjegyzes').value = prog.megjegyzes || '';
            document.getElementById('prog-egyedi-tipus').value = prog.egyedi_tipus_nev || '';
            document.getElementById('prog-egyedi-emoji').value = prog.egyedi_emoji || '';
            if (prog.tipus === 'egyeb') toggleEgyediTipus();
        }
    } else {
        titleEl.innerHTML = '<i class="ti ti-calendar-plus me-2"></i>Új program';
        // Ha van alapértelmezett hónap, állítsuk be a dátumot
        if (defaultMonth !== undefined) {
            const year = _programYear || new Date().getFullYear();
            const day = String(1).padStart(2, '0');
            const mon = String(defaultMonth + 1).padStart(2, '0');
            document.getElementById('prog-datum').value = `${year}-${mon}-${day}`;
        }
    }

    modal.show();
    setTimeout(() => document.getElementById('prog-cim').focus(), 300);
};

// ── Program mentés ──
window.saveProgram = async function() {
    const cim = document.getElementById('prog-cim').value.trim();
    const datum = document.getElementById('prog-datum').value;
    if (!cim) { alert('Add meg a program nevét!'); return; }
    if (!datum) { alert('Add meg a dátumot!'); return; }

    const btn = document.getElementById('btn-save-program');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Mentés...';

    const editId = document.getElementById('prog-edit-id').value;
    const ismetlodesVal = document.getElementById('prog-ismetlodes').value || null;

    const datumVege = document.getElementById('prog-datum-vege').value || null;
    if (datumVege && datumVege < datum) { alert('A záró dátum nem lehet a kezdő dátum előtt!'); btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy me-1"></i>Mentés'; return; }

    const record = {
        cim: cim,
        datum: datum,
        datum_vege: datumVege,
        ido_kezdes: document.getElementById('prog-ido-kezdes').value || null,
        ido_befejezes: document.getElementById('prog-ido-befejezes').value || null,
        helyszin: document.getElementById('prog-helyszin').value.trim() || null,
        tipus: document.getElementById('prog-tipus').value,
        prioritas: document.getElementById('prog-prioritas').value,
        ismétlődő: !!ismetlodesVal,
        ismetlodes_tipus: ismetlodesVal,
        egyedi_tipus_nev: document.getElementById('prog-tipus').value === 'egyeb'
            ? (document.getElementById('prog-egyedi-tipus').value.trim() || null) : null,
        egyedi_emoji: document.getElementById('prog-tipus').value === 'egyeb'
            ? (document.getElementById('prog-egyedi-emoji').value.trim() || null) : null,
        megjegyzes: document.getElementById('prog-megjegyzes').value.trim() || null,
        updated_at: new Date().toISOString()
    };

    try {
        if (editId) {
            const { error } = await _supabase.from('gyulekezeti_programok').update(record).eq('id', editId);
            if (error) throw error;
        } else {
            // Új program — user és gyülekezet adatok hozzáadása
            const { data: { user } } = await _supabase.auth.getUser();
            const { data: prof } = await _supabase.from('profiles')
                .select('full_name, congregation_id').eq('id', user.id).single();

            record.letrehozta_id = user.id;
            record.letrehozta_nev = prof?.full_name || '';
            record.congregation_id = prof?.congregation_id;

            const { error } = await _supabase.from('gyulekezeti_programok').insert(record);
            if (error) throw error;
        }

        bootstrap.Modal.getInstance(document.getElementById('modal-program')).hide();
        await loadProgramForYear(_programYear);
    } catch (err) {
        console.error('Program mentési hiba:', err);
        alert('Hiba történt a mentés során: ' + (err.message || err));
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy me-1"></i>Mentés';
};

// ── Program teljesítve jelölés ──
window.toggleProgramDone = async function(progId, done) {
    await _supabase.from('gyulekezeti_programok').update({
        teljesitett: done,
        teljesites_datum: done ? new Date().toISOString() : null
    }).eq('id', progId);
    await loadProgramForYear(_programYear);
};

// ── Program törlés ──
window.deleteProgram = async function(progId) {
    if (!confirm('Biztosan törlöd ezt a programot?')) return;
    const { error } = await _supabase.from('gyulekezeti_programok').delete().eq('id', progId);
    if (error) { console.error(error); alert('Törlési hiba!'); return; }
    await loadProgramForYear(_programYear);
};

// ── ÉVES TERV NYOMTATÁS (A3, 12 hónap) ──────────────────────
window.printEvesTermezo = function() {
    const year = _programYear;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Gyülekezet neve a címhez
    const congEl = document.getElementById('dash-congregation-line');
    const congName = congEl ? congEl.textContent.replace('📍 ', '').trim() : 'Gyülekezet';

    // ── Események összegyűjtése dátum szerint ──
    const eventsByDate = {};
    let totalEvents = 0;
    for (let m = 0; m < 12; m++) {
        const events = _allPrograms[m] || [];
        totalEvents += events.length;
        events.forEach(e => {
            const sd = new Date(e.datum + 'T00:00:00');
            const ed = e.datum_vege ? new Date(e.datum_vege + 'T00:00:00') : sd;
            for (let dd = new Date(sd); dd <= ed; dd.setDate(dd.getDate() + 1)) {
                const key = dd.toISOString().slice(0, 10);
                if (!eventsByDate[key]) eventsByDate[key] = [];
                if (!eventsByDate[key].find(x => x.id === e.id)) {
                    eventsByDate[key].push(e);
                }
            }
        });
    }

    // ── Hetek kiszámítása ──
    const DOW_NAMES = ['Vas.', 'Hétfő', 'Kedd', 'Szerda', 'Csüt.', 'Péntek', 'Szom.'];

    function getWeeksForMonth(yr, mo) {
        const daysInMonth = new Date(yr, mo + 1, 0).getDate();
        const weeks = [];
        let currentWeek = [null, null, null, null, null, null, null];
        for (let d = 1; d <= daysInMonth; d++) {
            const dow = new Date(yr, mo, d).getDay();
            currentWeek[dow] = d;
            if (dow === 6 || d === daysInMonth) {
                weeks.push(currentWeek);
                if (d < daysInMonth) currentWeek = [null, null, null, null, null, null, null];
            }
        }
        return weeks;
    }

    let maxWeeks = 0;
    const monthWeeks = [];
    for (let m = 0; m < 12; m++) {
        const w = getWeeksForMonth(year, m);
        monthWeeks.push(w);
        if (w.length > maxWeeks) maxWeeks = w.length;
    }

    // ── Használt típusok jelmagyarázathoz ──
    const usedTypes = new Set();
    for (let m = 0; m < 12; m++) {
        (_allPrograms[m] || []).forEach(e => usedTypes.add(e.tipus));
    }

    // ── Teljes HTML generálás ──
    let html = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8">
    <title>${_escHtmlDash(congName)} — Éves programterv ${year}</title>
    <style>
        @page { size: A3 landscape; margin: 8mm; }
        @media print { .toolbar { display: none !important; } }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            color: #1e293b; background: #f1f5f9;
        }

        /* ── Műveleti sáv (nem nyomtatódik) ── */
        .toolbar {
            position: sticky; top: 0; z-index: 100;
            background: linear-gradient(135deg, #1e3a5f 0%, #0f766e 100%);
            padding: 10px 24px; display: flex; align-items: center; justify-content: space-between;
            box-shadow: 0 2px 12px rgba(0,0,0,.15);
        }
        .toolbar .tb-title { color: #fff; font-size: 14px; font-weight: 600; }
        .toolbar .tb-sub { color: rgba(255,255,255,.7); font-size: 11px; margin-left: 8px; }
        .toolbar .tb-actions { display: flex; gap: 8px; }
        .tb-btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
            border: none; cursor: pointer; transition: all .15s;
        }
        .tb-btn svg { width: 18px; height: 18px; }
        .tb-btn-print { background: #fff; color: #1e3a5f; }
        .tb-btn-print:hover { background: #e0f2fe; }
        .tb-btn-pdf { background: #0ca678; color: #fff; }
        .tb-btn-pdf:hover { background: #059669; }
        .tb-btn-close { background: rgba(255,255,255,.15); color: #fff; padding: 8px 14px; }
        .tb-btn-close:hover { background: rgba(255,255,255,.25); }

        /* ── Oldal tartalom ── */
        .page-wrap {
            background: #fff; max-width: 1600px; margin: 16px auto; padding: 20px 24px;
            border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08);
        }
        @media print {
            body { background: #fff; }
            .page-wrap { margin: 0; padding: 0; border-radius: 0; box-shadow: none; max-width: 100%; }
        }

        /* ── Fejléc ── */
        .header {
            text-align: center; padding: 16px 0 12px;
            border-bottom: 3px solid #1e3a5f; margin-bottom: 10px;
        }
        .header .cross { font-size: 28px; display: block; margin-bottom: 2px; }
        .header .church {
            font-size: 18px; font-weight: 800; color: #1e3a5f;
            letter-spacing: 1px; text-transform: uppercase;
        }
        .header .title-row {
            display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 6px;
        }
        .header .title-line {
            flex: 1; max-width: 120px; height: 2px;
            background: linear-gradient(90deg, transparent, #0ca678, transparent);
        }
        .header .title {
            font-size: 13px; color: #64748b; font-weight: 500; letter-spacing: 0.5px;
        }
        .header .year-badge {
            display: inline-block; background: linear-gradient(135deg, #0ca678, #059669);
            color: #fff; font-size: 26px; font-weight: 900;
            padding: 6px 32px; border-radius: 8px; margin-top: 8px;
            letter-spacing: 3px; box-shadow: 0 2px 8px rgba(12,166,120,.3);
        }
        .header .stats {
            margin-top: 6px; font-size: 10px; color: #94a3b8;
        }
        .header .stats b { color: #0ca678; }

        /* ── Fő táblázat ── */
        .year-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.5px; }
        .year-table th, .year-table td { border: 1px solid #cbd5e1; padding: 0; vertical-align: middle; }

        /* Hónap fejléc */
        .month-hdr {
            background: linear-gradient(180deg, #1e3a5f, #162d4a);
            color: #fff; text-align: center; font-weight: 700;
            font-size: 10px; padding: 6px 2px; text-transform: uppercase; letter-spacing: 1.5px;
        }
        /* Nap-oszlop fejléc */
        .dow-hdr {
            background: #f0fdf4; text-align: center; font-weight: 700; font-size: 7.5px;
            padding: 2px 1px; color: #1e3a5f; width: 40px; min-width: 40px; max-width: 40px;
            border-right: 2px solid #1e3a5f !important;
        }
        .dow-hdr.sun-hdr { background: #fef2f2; color: #b91c1c; }

        /* Nap cellák */
        .day-cell {
            height: 15px; padding: 1px 3px; overflow: hidden; white-space: nowrap;
            transition: background .1s;
        }
        .day-cell .day-num {
            display: inline-block; font-weight: 700; font-size: 8px; color: #374151;
            min-width: 14px; text-align: right; margin-right: 3px;
        }
        .day-cell .day-event {
            font-size: 6.5px; color: #1e3a5f; font-weight: 600;
            overflow: hidden; text-overflow: ellipsis;
        }

        /* Vasárnap */
        .day-cell.sunday { background: #fff1f2; }
        .day-cell.sunday .day-num { color: #dc2626; font-weight: 800; }
        .day-cell.sunday .day-event { color: #991b1b; font-weight: 700; }

        /* Szombat */
        .day-cell.saturday { background: #fefce8; }
        .day-cell.saturday .day-num { color: #a16207; }

        /* Események */
        .day-cell.has-event { background: #ecfdf5; }
        .day-cell.has-event .day-event { color: #065f46; }
        .day-cell.sunday.has-event { background: #ffe4e6; }

        /* Ma */
        .day-cell.today-cell { background: #d1fae5 !important; outline: 2px solid #0ca678; outline-offset: -2px; }
        .day-cell.today-cell .day-num {
            background: #0ca678; color: #fff; border-radius: 50%;
            width: 15px; height: 15px; text-align: center; line-height: 15px;
        }

        /* Üres cella */
        .day-cell.empty-cell { background: #f8fafc; }

        /* Hét elválasztó */
        .week-sep td {
            height: 3px; padding: 0;
            background: linear-gradient(90deg, #e2e8f0, #cbd5e1, #e2e8f0);
        }

        /* Jelmagyarázat */
        .legend {
            display: flex; flex-wrap: wrap; gap: 4px 16px; justify-content: center;
            margin-top: 8px; padding: 6px 12px;
            background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;
        }
        .legend-item {
            display: inline-flex; align-items: center; gap: 4px;
            font-size: 8px; color: #475569; font-weight: 500;
        }
        .legend-dot {
            width: 8px; height: 8px; border-radius: 50%; display: inline-block;
            box-shadow: 0 1px 2px rgba(0,0,0,.15);
        }

        /* Lábléc */
        .footer {
            text-align: center; margin-top: 8px; font-size: 8px; color: #94a3b8;
            border-top: 2px solid #1e3a5f; padding-top: 6px;
            display: flex; justify-content: space-between; align-items: center;
        }
        .footer .f-left, .footer .f-right { font-size: 7px; }
        .footer .f-center { font-weight: 600; color: #64748b; }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
    </head><body>`;

    // ── Műveleti sáv (toolbar) ──
    html += `<div class="toolbar">
        <div>
            <span class="tb-title">Éves Programterv — ${year}</span>
            <span class="tb-sub">${_escHtmlDash(congName)} | ${totalEvents} program</span>
        </div>
        <div class="tb-actions">
            <button class="tb-btn tb-btn-print" onclick="window.print()" title="Nyomtatás (A3 fekvő)">
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
                Nyomtatás
            </button>
            <button class="tb-btn tb-btn-pdf" onclick="savePDF()" title="Mentés PDF-ként">
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 3v4a1 1 0 001 1h4M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"/><path d="M12 17v-6M9 14l3 3 3-3"/></svg>
                Mentés PDF
            </button>
            <button class="tb-btn tb-btn-close" onclick="window.close()" title="Bezárás">
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
        </div>
    </div>`;

    html += '<div class="page-wrap" id="print-content">';

    // ── Fejléc ──
    html += `<div class="header">
        <span class="cross">✝</span>
        <div class="church">${_escHtmlDash(congName)}</div>
        <div class="title-row">
            <span class="title-line"></span>
            <span class="title">Tervezett egyházi év</span>
            <span class="title-line"></span>
        </div>
        <div class="year-badge">${year}</div>
        <div class="stats">Összesen <b>${totalEvents}</b> tervezett program</div>
    </div>`;

    // ── Fő táblázat ──
    html += '<table class="year-table">';
    html += '<thead><tr>';
    html += '<th class="dow-hdr" style="background:#1e3a5f;color:#fff;font-size:7px;">Nap</th>';
    for (let m = 0; m < 12; m++) {
        html += `<th class="month-hdr">${HU_MONTHS[m]}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (let w = 0; w < maxWeeks; w++) {
        for (let dow = 0; dow < 7; dow++) {
            html += '<tr>';
            const isSunHdr = dow === 0;
            html += `<td class="dow-hdr${isSunHdr ? ' sun-hdr' : ''}">${DOW_NAMES[dow]}</td>`;

            for (let m = 0; m < 12; m++) {
                const weeks = monthWeeks[m];
                const dayNum = (w < weeks.length) ? weeks[w][dow] : null;
                if (dayNum === null) {
                    html += '<td class="day-cell empty-cell"></td>';
                } else {
                    const dateStr = `${year}-${String(m+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
                    const isSunday = dow === 0;
                    const isSaturday = dow === 6;
                    const isToday = dateStr === todayStr;
                    const evts = eventsByDate[dateStr] || [];
                    const hasEvent = evts.length > 0;

                    let cls = 'day-cell';
                    if (isSunday) cls += ' sunday';
                    else if (isSaturday) cls += ' saturday';
                    if (hasEvent) cls += ' has-event';
                    if (isToday) cls += ' today-cell';

                    let evtText = '';
                    if (hasEvent) {
                        const mainEvt = evts[0];
                        const emoji = _progEmoji(mainEvt);
                        evtText = emoji + ' ' + _escHtmlDash(mainEvt.cim);
                        if (evts.length > 1) evtText += ` <b>+${evts.length - 1}</b>`;
                    }

                    html += `<td class="${cls}">`;
                    html += `<span class="day-num">${dayNum}</span>`;
                    if (evtText) html += `<span class="day-event">${evtText}</span>`;
                    html += '</td>';
                }
            }
            html += '</tr>';
        }
        if (w < maxWeeks - 1) {
            html += '<tr class="week-sep">';
            for (let c = 0; c < 13; c++) html += '<td></td>';
            html += '</tr>';
        }
    }

    html += '</tbody></table>';

    // ── Jelmagyarázat ──
    html += '<div class="legend">';
    html += '<span class="legend-item" style="font-weight:700;color:#1e3a5f;margin-right:4px;">Jelmagyarázat:</span>';
    usedTypes.forEach(tipus => {
        const color = PROG_TIPUS_COLOR[tipus] || '#94a3b8';
        const emoji = PROG_TIPUS_EMOJI[tipus] || '📌';
        const label = (PROG_TIPUS_LABELS[tipus] || 'Egyéb').replace(/^.*?\s/, '');
        html += `<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${emoji} ${label}</span>`;
    });
    html += '</div>';

    // ── Lábléc ──
    html += `<div class="footer">
        <span class="f-left">Készült: ${_formatHuDate(today)}</span>
        <span class="f-center">✝ ${_escHtmlDash(congName)} — ${year}. évi programterv</span>
        <span class="f-right">Kartotéka Egyházi Nyilvántartási Rendszer</span>
    </div>`;

    html += '</div>'; // page-wrap

    // ── PDF mentés szkript ──
    html += `<script>
    function savePDF() {
        var el = document.getElementById('print-content');
        var tb = document.querySelector('.toolbar');
        if (tb) tb.style.display = 'none';
        var opt = {
            margin: 5,
            filename: '${_escHtmlDash(congName).replace(/'/g, "\\'")} - Eves programterv ${year}.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' }
        };
        html2pdf().set(opt).from(el).save().then(function() {
            if (tb) tb.style.display = '';
        });
    }
    <\/script>`;

    html += '</body></html>';

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
};

// ── GYORS BEVITEL (táblázatos, tömeges rögzítés) ──────────────
let _batchRowCounter = 0;

const BATCH_TIPUS_OPTIONS = Object.entries(PROG_TIPUS_LABELS).map(
    ([val, label]) => `<option value="${val}">${label}</option>`
).join('');

const BATCH_PRIO_OPTIONS = `
    <option value="alacsony">Alacsony</option>
    <option value="normal" selected>Normál</option>
    <option value="fontos">Fontos</option>
    <option value="kiemelt">Kiemelt</option>`;

function _batchRowHtml(idx) {
    return `<tr id="batch-row-${idx}">
        <td class="text-center text-muted align-middle" style="font-size:0.75rem">${idx + 1}</td>
        <td><input type="text" class="form-control form-control-sm batch-cim" placeholder="Program neve..." data-row="${idx}"></td>
        <td><input type="date" class="form-control form-control-sm batch-datum" data-row="${idx}"></td>
        <td><input type="date" class="form-control form-control-sm batch-datum-vege" data-row="${idx}" title="Többnapos: záró dátum"></td>
        <td><input type="time" class="form-control form-control-sm batch-ido" data-row="${idx}"></td>
        <td><input type="time" class="form-control form-control-sm batch-ido-vege" data-row="${idx}"></td>
        <td><select class="form-select form-select-sm batch-tipus" data-row="${idx}">${BATCH_TIPUS_OPTIONS}</select></td>
        <td><input type="text" class="form-control form-control-sm batch-helyszin" placeholder="Helyszín" data-row="${idx}"></td>
        <td><select class="form-select form-select-sm batch-prio" data-row="${idx}">${BATCH_PRIO_OPTIONS}</select></td>
        <td><select class="form-select form-select-sm batch-ismetlodes" data-row="${idx}">
            <option value="">Nem</option>
            <option value="heti">Heti</option>
            <option value="ketheti">Kétheti</option>
            <option value="havi">Havi</option>
        </select></td>
        <td class="text-center align-middle">
            <button class="btn btn-ghost-danger btn-sm btn-icon" onclick="removeBatchRow(${idx})" title="Sor törlése">
                <i class="ti ti-x"></i>
            </button>
        </td>
    </tr>`;
}

window.openBatchEntry = function() {
    _batchRowCounter = 0;
    const tbody = document.getElementById('batch-tbody');
    tbody.innerHTML = '';
    // Induláskor 10 üres sor
    for (let i = 0; i < 10; i++) addBatchRow();
    _updateBatchCount();
    const modal = new bootstrap.Modal(document.getElementById('modal-batch-program'));
    modal.show();
    // Fókusz az első cím mezőre
    setTimeout(() => {
        const first = tbody.querySelector('.batch-cim');
        if (first) first.focus();
    }, 300);
};

window.addBatchRow = function() {
    const tbody = document.getElementById('batch-tbody');
    const idx = _batchRowCounter++;
    tbody.insertAdjacentHTML('beforeend', _batchRowHtml(idx));
    _updateBatchCount();
    // Automatikus Tab-navigáció: Enter → következő sor
    const lastCim = tbody.querySelector(`tr:last-child .batch-cim`);
    if (lastCim) {
        lastCim.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                const nextRow = this.closest('tr').nextElementSibling;
                if (nextRow) {
                    nextRow.querySelector('.batch-cim')?.focus();
                } else {
                    addBatchRow();
                    setTimeout(() => {
                        const last = document.querySelector('#batch-tbody tr:last-child .batch-cim');
                        if (last) last.focus();
                    }, 50);
                }
            }
        });
    }
};

window.addBatchRows = function(count) {
    for (let i = 0; i < count; i++) addBatchRow();
    // Görgetés az aljára
    const body = document.querySelector('#modal-batch-program .modal-body');
    if (body) body.scrollTop = body.scrollHeight;
};

window.removeBatchRow = function(idx) {
    const row = document.getElementById(`batch-row-${idx}`);
    if (row) row.remove();
    _updateBatchCount();
};

function _updateBatchCount() {
    const el = document.getElementById('batch-row-count');
    const filled = document.querySelectorAll('#batch-tbody .batch-cim');
    let count = 0;
    filled.forEach(inp => { if (inp.value.trim()) count++; });
    if (el) el.textContent = count > 0 ? `${count} kitöltött sor` : '';
}

window.saveBatchPrograms = async function() {
    const rows = document.querySelectorAll('#batch-tbody tr');
    const records = [];
    const errors = [];

    rows.forEach((row, i) => {
        const cim = row.querySelector('.batch-cim')?.value.trim();
        const datum = row.querySelector('.batch-datum')?.value;
        if (!cim && !datum) return; // üres sor — kihagyás
        if (!cim) { errors.push(`${i+1}. sor: hiányzó programnév`); return; }
        if (!datum) { errors.push(`${i+1}. sor: hiányzó dátum`); return; }

        const datumVege = row.querySelector('.batch-datum-vege')?.value || null;
        if (datumVege && datumVege < datum) { errors.push(`${i+1}. sor: záró dátum a kezdő dátum előtt`); return; }

        const ismetVal = row.querySelector('.batch-ismetlodes')?.value || null;
        records.push({
            cim: cim,
            datum: datum,
            datum_vege: datumVege,
            ido_kezdes: row.querySelector('.batch-ido')?.value || null,
            ido_befejezes: row.querySelector('.batch-ido-vege')?.value || null,
            tipus: row.querySelector('.batch-tipus')?.value || 'istentisztelet',
            helyszin: row.querySelector('.batch-helyszin')?.value.trim() || null,
            prioritas: row.querySelector('.batch-prio')?.value || 'normal',
            ismétlődő: !!ismetVal,
            ismetlodes_tipus: ismetVal,
            megjegyzes: null
        });
    });

    if (errors.length > 0) {
        alert('Javítsd ki a hibákat:\n\n' + errors.join('\n'));
        return;
    }

    if (records.length === 0) {
        alert('Nincs kitöltött sor a mentéshez!');
        return;
    }

    const btn = document.getElementById('btn-save-batch');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Mentés (${records.length} program)...`;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        const { data: prof } = await _supabase.from('profiles')
            .select('full_name, congregation_id').eq('id', user.id).single();

        // Kiegészítés user adatokkal
        records.forEach(r => {
            r.letrehozta_id = user.id;
            r.letrehozta_nev = prof?.full_name || '';
            r.congregation_id = prof?.congregation_id;
        });

        // Tömeges INSERT
        const { error } = await _supabase.from('gyulekezeti_programok').insert(records);
        if (error) throw error;

        bootstrap.Modal.getInstance(document.getElementById('modal-batch-program')).hide();
        await loadProgramForYear(_programYear);
        alert(`✅ ${records.length} program sikeresen mentve!`);
    } catch (err) {
        console.error('Batch mentési hiba:', err);
        alert('Hiba a mentés során: ' + (err.message || err));
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy me-1"></i>Összes mentése';
};

// Kitöltött sorok számolása input-on
document.addEventListener('input', function(ev) {
    if (ev.target.classList.contains('batch-cim')) _updateBatchCount();
});

async function _loadAnnualProgram(year, today) {
    // Év-választó feltöltése
    const sel = document.getElementById('dash-program-year');
    if (sel) {
        sel.innerHTML = '';
        for (let y = year + 1; y >= year - 3; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = `${y}. év`;
            if (y === year) opt.selected = true;
            sel.appendChild(opt);
        }
    }
    await loadProgramForYear(year);
}

// ── FRISS BEJEGYZÉSEK ──────────────────────────────────────────
async function _loadRecentActivity(shared) {
    const recent = shared ? shared.recentActivity : null;

    const el = document.getElementById('list-recent-activity');
    if (!el) return;

    if (!recent || recent.length === 0) {
        el.innerHTML = '<div class="text-muted small p-3">Nincs friss bejegyzés.</div>';
        return;
    }

    const typeColors = {
        'istentisztelet': 'bg-blue-lt text-blue', 'temetés': 'bg-dark-lt text-dark',
        'konfirmáció': 'bg-purple-lt text-purple', 'esküvő': 'bg-pink-lt text-pink',
        'keresztelő': 'bg-teal-lt text-teal', 'presbiteri': 'bg-warning-lt text-warning'
    };

    el.innerHTML = recent.map(r => {
        const d = _formatHuDate(r.idopont);
        const type = (r.jellege || '').toLowerCase();
        const colorCls = Object.keys(typeColors).find(k => type.includes(k))
            ? typeColors[Object.keys(typeColors).find(k => type.includes(k))]
            : 'bg-secondary-lt text-secondary';
        return `<div class="activity-item">
            <div class="activity-dot" style="margin-top:8px;"></div>
            <div class="flex-grow-1">
                <div class="d-flex align-items-start gap-2">
                    <span class="badge ${colorCls}" style="font-size:0.72rem; margin-top:1px;">${r.jellege || '—'}</span>
                    <div class="fw-medium" style="font-size:0.88rem;">${r.cim || '—'}</div>
                </div>
                <div class="text-muted" style="font-size:0.78rem;">${d}</div>
            </div>
        </div>`;
    }).join('');
}

// ── ALSÓ STATISZTIKAI SÁV ─────────────────────────────────────
async function _loadBottomStats(today, shared) {
    let men = 0, women = 0, children = 0, ageSum = 0, ageCount = 0;
    const curYearN = today.getFullYear();

    shared.activeMembers.forEach(m => {
        const age = m.sz_datum ? curYearN - new Date(m.sz_datum).getFullYear() : null;
        if (age !== null) { ageSum += age; ageCount++; }
        if (age !== null && age < 18) children++;
        else if (m.ferfi === true) men++;
        else women++;
    });
    const avgAge = ageCount > 0 ? Math.round(ageSum / ageCount) : 0;

    const balance = shared.allBefizetes.reduce((s, r) => s + Number(r.osszeg), 0)
                  - shared.allKiadas.reduce((s, r) => s + Number(r.osszeg), 0);

    _setText('stat-men', men);
    _setText('stat-women', women);
    _setText('stat-children', children);
    _setText('stat-avg-age', avgAge + ' év');
    _setText('stat-payers-year', shared.payersCount ?? '—');
    _setText('stat-presbiterek', shared.presbCount ?? '—');
    _setText('stat-balance', balance.toLocaleString('hu') + ' RON');
}

// ── Segéd ─────────────────────────────────────────────────────
function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
