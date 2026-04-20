// --- js/mass_import_api.js ---

let currentImportData = []; // Az Excel nyers adatai
let currentImportHeaders = []; // Az Excel oszlopnevei

// =============================================================================
// HIVATALOS EREK KÖNYVELÉSI TÉTELEK — automatikus adatbázis-szinkron
// Ha egy tétel hiányzik a szamadasicel táblából, itt automatikusan pótlódik.
// Forrás: Adatok_2026.xlsx (Hibak munkalap)
// =============================================================================
const _OFFICIAL_CEL_ITEMS = [
    // Bevételek (type = 'B')
    {id:'101.01',nev:'Egyházfenntartói járulék',type:'B',iscel:true,sorszam:110},
    {id:'101.02',nev:'Bevételek a különböző egyházi szolgálatokért',type:'B',iscel:true,sorszam:120},
    {id:'101.03',nev:'Perselypénz',type:'B',iscel:true,sorszam:130},
    {id:'101.04',nev:'Adományok hívektől, egyházi intézményektől',type:'B',iscel:true,sorszam:140},
    {id:'101.05',nev:'Úrasztali adományok',type:'B',iscel:true,sorszam:150},
    {id:'101.06',nev:'Sírhelyek eladásából, bérleti díjából, gondozásából származó bevételek',type:'B',iscel:true,sorszam:160},
    {id:'101.07',nev:'Központi járulékok - egyházmegyei bevétel',type:'B',iscel:true,sorszam:170},
    {id:'101.08',nev:'Egyházközségek fizetésalapja - emei bevétel',type:'B',iscel:true,sorszam:180},
    {id:'102.01',nev:'Gyerek és ifjúsági tevékenységek bevételei',type:'B',iscel:true,sorszam:210},
    {id:'102.02',nev:'Nőszövetségi tevékenységek bevételei',type:'B',iscel:true,sorszam:220},
    {id:'102.03',nev:'Presbiterszövetségi tevékenységek bevételei',type:'B',iscel:true,sorszam:230},
    {id:'102.04',nev:'Diakóniai célú adományok',type:'B',iscel:true,sorszam:240},
    {id:'102.05',nev:'Missziós célú adományok',type:'B',iscel:true,sorszam:250},
    {id:'102.06',nev:'Legátumok - adományok teológiai hallgatók támogatására',type:'B',iscel:true,sorszam:260},
    {id:'103.01',nev:'Segélyszervezetektől, alapítványoktól, helyi szervezetektől származó adományok',type:'B',iscel:true,sorszam:310},
    {id:'103.02',nev:'Pályázatokból',type:'B',iscel:true,sorszam:320},
    {id:'103.03',nev:'Más bevételek',type:'B',iscel:true,sorszam:330},
    {id:'103.04',nev:'Banki kamatok, árfolyam nyereségek, kötvények jövedelme, osztalékok',type:'B',iscel:true,sorszam:340},
    {id:'103.05',nev:'Hozzájárulás konferenciák és szeretetvendégségek szervezéséhez',type:'B',iscel:true,sorszam:350},
    {id:'103.06',nev:'Iratterjesztés - bevétel',type:'B',iscel:true,sorszam:360},
    {id:'103.07',nev:'Javak és részvények értékesítéséből',type:'B',iscel:true,sorszam:370},
    {id:'103.08',nev:'Számlavisszatérítések',type:'B',iscel:true,sorszam:380},
    {id:'103.09',nev:'Szponzortámogatások, adók 3,5 %-a',type:'B',iscel:true,sorszam:390},
    {id:'104.01',nev:'Mezőgazdasági jövedelem',type:'B',iscel:true,sorszam:410},
    {id:'104.02',nev:'Erdőgazdálkodási jövedelem',type:'B',iscel:true,sorszam:420},
    {id:'104.03',nev:'Más gazdasági bevételek',type:'B',iscel:true,sorszam:430},
    {id:'104.04',nev:'Épületek bérjövedelme',type:'B',iscel:true,sorszam:440},
    {id:'104.05',nev:'Területek bérjövedelme',type:'B',iscel:true,sorszam:450},
    {id:'105.01',nev:'Más egyházi intézményektől kapott támogatás',type:'B',iscel:true,sorszam:510},
    {id:'105.02',nev:'Állami intézménytől kapott támogatás (APIA, stb.)',type:'B',iscel:true,sorszam:520},
    {id:'105.03',nev:'Kongrua és járulékai',type:'B',iscel:true,sorszam:530},
    {id:'106.01',nev:'Bevételek más egyházi intézmények részére',type:'B',iscel:true,sorszam:610},
    {id:'106.02',nev:'Biztosítások - bevétel',type:'B',iscel:true,sorszam:620},
    {id:'106.03',nev:'Missziói segélyek',type:'B',iscel:true,sorszam:630},
    {id:'106.04',nev:'Bérjövedelmek 10%-a',type:'B',iscel:true,sorszam:640},
    {id:'106.05',nev:'Bevételek egyházközségek részére',type:'B',iscel:true,sorszam:650},
    {id:'106.06',nev:'Bevételek a felsőbb egyházi intézmények részére',type:'B',iscel:true,sorszam:660},
    {id:'107.01',nev:'Kapott hitelek',type:'B',iscel:true,sorszam:710},
    {id:'107.02',nev:'Visszakapott hitelek',type:'B',iscel:true,sorszam:720},
    // Kiadások (type = 'K')
    {id:'201.01',nev:'Fizetés alap',type:'K',iscel:true,sorszam:1010},
    {id:'201.02',nev:'Közköltségek (fűtés, világítás, víz stb.)',type:'K',iscel:true,sorszam:1020},
    {id:'201.03',nev:'Házbérek',type:'K',iscel:true,sorszam:1030},
    {id:'201.04',nev:'Épületadó, földadó biztosítás',type:'K',iscel:true,sorszam:1040},
    {id:'201.05',nev:'Szállítóeszközök üzemeltetési költségei',type:'K',iscel:true,sorszam:1050},
    {id:'201.06',nev:'Napidíj, utazási költségek',type:'K',iscel:true,sorszam:1060},
    {id:'201.07',nev:'Posta, telefon, internet',type:'K',iscel:true,sorszam:1070},
    {id:'201.08',nev:'Irodaszerek, nyomtatványok',type:'K',iscel:true,sorszam:1080},
    {id:'201.09',nev:'Fogyóanyagok, más anyagok',type:'K',iscel:true,sorszam:1090},
    {id:'201.10',nev:'Szolgáltatások költségei',type:'K',iscel:true,sorszam:1100},
    {id:'201.11',nev:'Protokoll',type:'K',iscel:true,sorszam:1110},
    {id:'201.12',nev:'Kis értékű leltári tárgyak beszerzése',type:'K',iscel:true,sorszam:1120},
    {id:'201.13',nev:'Karbantartási kiadások',type:'K',iscel:true,sorszam:1130},
    {id:'201.14',nev:'Más javadalmak',type:'K',iscel:true,sorszam:1140},
    {id:'201.15',nev:'Nettó fizetések',type:'K',iscel:true,sorszam:1150},
    {id:'201.16',nev:'Javadalmak utáni adó',type:'K',iscel:true,sorszam:1160},
    {id:'201.17',nev:'Társadalombiztosítás',type:'K',iscel:true,sorszam:1170},
    {id:'201.18',nev:'Egészségügyi biztosítás',type:'K',iscel:true,sorszam:1180},
    {id:'201.19',nev:'Munkabiztosítási hozzájárulás - 2,25%',type:'K',iscel:true,sorszam:1190},
    {id:'202.01',nev:'Gyerek és ifjúsági tevékenységek kiadásai',type:'K',iscel:true,sorszam:2010},
    {id:'202.02',nev:'Nőszövetségi tevékenységek kiadásai',type:'K',iscel:true,sorszam:2020},
    {id:'202.03',nev:'Presbiterszövetségi tevékenységek kiadásai',type:'K',iscel:true,sorszam:2030},
    {id:'202.04',nev:'Egyházközségek, vagy más egyházi intézmények támogatása',type:'K',iscel:true,sorszam:2040},
    {id:'202.05',nev:'Kiadások diakóniai célokra',type:'K',iscel:true,sorszam:2050},
    {id:'202.06',nev:'Missziós célú kiadások',type:'K',iscel:true,sorszam:2060},
    {id:'202.07',nev:'Teológiai hallgatók tanulmányi segélye - legátumok',type:'K',iscel:true,sorszam:2070},
    {id:'202.08',nev:'Egyháztagok segélyezése',type:'K',iscel:true,sorszam:2080},
    {id:'203.01',nev:'Szociális-kulturális tevékenységek támogatása',type:'K',iscel:true,sorszam:3010},
    {id:'203.02',nev:'Más kiadások',type:'K',iscel:true,sorszam:3020},
    {id:'203.03',nev:'Kezelési költségek, árfolyam veszteségek, kötvényeladási veszteségek',type:'K',iscel:true,sorszam:3030},
    {id:'203.04',nev:'Konferenciák és szeretetvendégségek költségei',type:'K',iscel:true,sorszam:3040},
    {id:'203.05',nev:'Iratterjesztés - kiadás',type:'K',iscel:true,sorszam:3050},
    {id:'203.06',nev:'Központi járulékok',type:'K',iscel:true,sorszam:3060},
    {id:'203.07',nev:'Bérjövedelmek 10%-a központi járulékba',type:'K',iscel:true,sorszam:3070},
    {id:'204.01',nev:'Mezőgazdasági kiadások',type:'K',iscel:true,sorszam:4010},
    {id:'204.02',nev:'Erdőgazdálkodási kiadások',type:'K',iscel:true,sorszam:4020},
    {id:'204.03',nev:'Más gazdasági kiadások',type:'K',iscel:true,sorszam:4030},
    {id:'204.04',nev:'Bérbeadott épületek javítása és karbantartása',type:'K',iscel:true,sorszam:4040},
    {id:'205.01',nev:'Új beruházások',type:'K',iscel:true,sorszam:5010},
    {id:'205.02',nev:'Általános javítások',type:'K',iscel:true,sorszam:5020},
    {id:'206.01',nev:'Kiadás más egyházi intézmény részére',type:'K',iscel:true,sorszam:6010},
    {id:'206.02',nev:'Biztosítások - kiadás',type:'K',iscel:true,sorszam:6020},
    {id:'206.03',nev:'Kifizetett missziói segélyek',type:'K',iscel:true,sorszam:6030},
    {id:'206.04',nev:'Kifizetett bérjövedelmek 10%-a',type:'K',iscel:true,sorszam:6040},
    {id:'206.05',nev:'Kiadások egyházközségek részére',type:'K',iscel:true,sorszam:6050},
    {id:'206.06',nev:'Kiadások a felsőbb egyházi intézmények részére',type:'K',iscel:true,sorszam:6060},
    {id:'207.01',nev:'Törlesztett hitelek',type:'K',iscel:true,sorszam:7010},
    {id:'207.02',nev:'Kiadott hitelek',type:'K',iscel:true,sorszam:7020},
];

async function _ensureOfficialSzamadasicelItems() {
    try {
        // Lekérjük a meglévő tételek ID-jait
        const { data: existing } = await _supabase.from('szamadasicel').select('id');
        const existingIds = new Set((existing || []).map(r => r.id));

        // Csak a hiányzókat szúrjuk be
        const missing = _OFFICIAL_CEL_ITEMS.filter(item => !existingIds.has(item.id));
        if (missing.length > 0) {
            await _supabase.from('szamadasicel').insert(missing);
        }

        // iscel = true javítás a meglévőkre (ha valamelyiknél false/null volt)
        const needsUpdate = _OFFICIAL_CEL_ITEMS.filter(item => existingIds.has(item.id));
        if (needsUpdate.length > 0) {
            // Batch update: csak azokat frissítjük ahol iscel != true
            const { data: wrongIscel } = await _supabase.from('szamadasicel')
                .select('id').in('id', needsUpdate.map(i => i.id)).eq('iscel', false);
            if (wrongIscel && wrongIscel.length > 0) {
                await _supabase.from('szamadasicel')
                    .update({ iscel: true })
                    .in('id', wrongIscel.map(r => r.id));
            }
            // NULL iscel javítás
            const { data: nullIscel } = await _supabase.from('szamadasicel')
                .select('id').in('id', needsUpdate.map(i => i.id)).is('iscel', null);
            if (nullIscel && nullIscel.length > 0) {
                await _supabase.from('szamadasicel')
                    .update({ iscel: true })
                    .in('id', nullIscel.map(r => r.id));
            }
        }
    } catch(e) {
        console.warn('_ensureOfficialSzamadasicelItems hiba:', e);
    }
}

window.openMassImportModal = function() {
    document.getElementById('import-file-members').value = '';
    document.getElementById('mapping-container-members').classList.add('d-none');
    const finFile = document.getElementById('import-file-finance');
    if (finFile) { finFile.value = ''; document.getElementById('mapping-container-finance').classList.add('d-none'); }
    const wlFile = document.getElementById('import-file-worklog');
    if (wlFile) { wlFile.value = ''; document.getElementById('mapping-container-worklog').classList.add('d-none'); }
    const regFile = document.getElementById('import-file-registry');
    if (regFile) { regFile.value = ''; document.getElementById('mapping-container-registry').classList.add('d-none'); }
    new bootstrap.Modal(document.getElementById('modal-mass-import')).show();
};

window.handleExcelUpload = async function(event, type) {
    if (typeof loadLib === 'function') await loadLib('xlsx');
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (json.length < 2) { alert("A fájl üres, vagy nincs benne adat!"); return; }

        if (type === 'members') {
            currentImportHeaders = json[0];
            currentImportData = XLSX.utils.sheet_to_json(worksheet);
            generateMappingTableMembers();
        } else if (type === 'finance') {
            financeImportHeaders = json[0];
            financeImportData = XLSX.utils.sheet_to_json(worksheet);
            generateMappingTableFinance();
        } else if (type === 'worklog') {
            worklogImportHeaders = json[0];
            worklogImportData = XLSX.utils.sheet_to_json(worksheet);
            generateMappingTableWorklog();
        } else if (type === 'registry') {
            registryImportHeaders = json[0];
            registryImportData = XLSX.utils.sheet_to_json(worksheet);
            generateMappingTableRegistry();
        }
    };
    reader.readAsArrayBuffer(file);
};

window.generateMappingTableMembers = function() {
    const tbody = document.getElementById('mapping-body-members');
    
    const dbFields = [
        { val: '', label: '-- Kihagyás (Ne importálja) --' },
        { val: 'teljes_nev', label: 'TELJES NÉV (Egyben - A gép szétválasztja!)' },
        { val: 'namepattern', label: 'Előtag / Prefix (id., ifj., özv., elv.)' },
        { val: 'csaladnev', label: 'Családnév (Külön)' },
        { val: 'k_nev', label: 'Keresztnév (Külön)' },
        { val: 'szcs_nev', label: 'Leánykori / Születési név (A gép okosan metszi)' },
        { val: 'cnp', label: 'CNP / Személyi szám (Ha van)' },
        { val: 'sz_datum', label: 'Születési dátum (Pl. 1980-01-20)' },
        { val: 'sz_hely', label: 'Születési hely (Település)' },
        { val: 'neme', label: 'Neme (Férfi/Nő)' },
        { val: 'szig', label: 'Személyigazolvány száma' },
        { val: 'taj', label: 'TAJ szám' },
        { val: 'nemzetiseg', label: 'Nemzetiség' },
        { val: 'vallas', label: 'Vallás / Felekezet' },
        { val: 'foglalkozas', label: 'Foglalkozás' },
        { val: 'lakhely', label: 'Lakhely / Település neve' },
        { val: 'utca', label: 'Utca neve' },
        { val: 'hsz', label: 'Házszám' },
        { val: 'telefon', label: 'Telefonszám' },
        { val: 'email', label: 'E-mail cím' },
        { val: 'apja', label: 'Apa neve' },
        { val: 'anyja', label: 'Anya neve' },
        { val: 'megjegyzes', label: 'Megjegyzés' },
        { val: 'halal_info', label: 'Elhunyt (Dátum, vagy szöveg: X / Igen)' }
    ];

    let html = '';
    currentImportHeaders.forEach((header, index) => {
        if(!header) return;
        
        let autoSelect = '';
        const lowerH = header.toLowerCase();
        if (lowerH.includes('név') || lowerH.includes('nev')) autoSelect = 'teljes_nev';
        if (lowerH.includes('család') || lowerH.includes('vezeté')) autoSelect = 'csaladnev';
        if (lowerH.includes('kereszt')) autoSelect = 'k_nev';
        if (lowerH.includes('szül') && lowerH.includes('dátum')) autoSelect = 'sz_datum';
        if (lowerH.includes('szül') && lowerH.includes('hely')) autoSelect = 'sz_hely';
        if (lowerH.includes('lakhely') || lowerH.includes('város') || lowerH.includes('falu')) autoSelect = 'lakhely';
        if (lowerH.includes('cnp') || lowerH.includes('személyi')) autoSelect = 'cnp';
        if (lowerH.includes('előtag') || lowerH.includes('prefix')) autoSelect = 'namepattern';
        if (lowerH.includes('vallás') || lowerH.includes('vallas') || lowerH.includes('felekezet')) autoSelect = 'vallas';
        if (lowerH.includes('email') || lowerH.includes('e-mail')) autoSelect = 'email';
        if (lowerH.includes('megjegyzés')) autoSelect = 'megjegyzes';
        if (lowerH.includes('halál') || lowerH.includes('elhunyt') || lowerH.includes('meghalt')) autoSelect = 'halal_info';

        const optionsHtml = dbFields.map(f => `<option value="${f.val}" ${f.val === autoSelect ? 'selected' : ''}>${f.label}</option>`).join('');
        
        html += `
        <tr>
            <td class="fw-bold text-dark align-middle"><i class="ti ti-arrow-right text-muted me-2"></i>${header}</td>
            <td><select class="form-select border-blue fw-bold mapping-select" data-excel-col="${header}">${optionsHtml}</select></td>
        </tr>`;
    });

    tbody.innerHTML = html;
    document.getElementById('import-row-count-members').innerText = `${currentImportData.length} tag importálásra kész!`;
    document.getElementById('mapping-container-members').classList.remove('d-none');
};

window.executeMembersImport = async function() {
    const btn = document.getElementById('btn-execute-import-members');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Importálás folyamatban...';
    btn.disabled = true;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        const { data: profile } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();
        if (!profile.congregation_id) throw new Error("Kritikus hiba: Nincs gyülekezet azonosító!");

        const selects = document.querySelectorAll('.mapping-select');
        const mapping = {};
        selects.forEach(sel => { if (sel.value) mapping[sel.getAttribute('data-excel-col')] = sel.value; });

        if (Object.keys(mapping).length === 0) throw new Error("Nem választott ki egyetlen importálandó oszlopot sem!");

        const membersToInsert = [];
        const deathRecordsToInsert = []; 
        
        let defaultFallbackLocality = null; 
        let skippedDuplicates = 0;

        for (let i = 0; i < currentImportData.length; i++) {
            const row = currentImportData[i];
            let entry = {
                congregation_id: profile.congregation_id,
                isvisible: true,
                type: 'E',
                befizetoev: new Date().getFullYear(),
                csaladfo: false,
                meghalt: false,
                vallas: 'Református'
            };

            // 1. LÉPÉS: A teljes sor adatainak kiolvasása egy átmeneti memóriába!
            let rawVals = {};
            for (const [excelCol, dbField] of Object.entries(mapping)) {
                const val = row[excelCol] ? String(row[excelCol]).trim() : null;
                if (val) rawVals[dbField] = val;
            }

            // Egyszerű szöveges/dátum mezők átemelése
            if (rawVals['namepattern']) entry.namepattern = rawVals['namepattern'];
            if (rawVals['csaladnev']) entry.csaladnev = rawVals['csaladnev'];
            if (rawVals['k_nev']) entry.k_nev = rawVals['k_nev'];
            if (rawVals['szcs_nev']) entry.szcs_nev = rawVals['szcs_nev'];
            if (rawVals['cnp']) entry.cnp = rawVals['cnp'];
            if (rawVals['szig']) entry.szig = rawVals['szig'];
            if (rawVals['taj']) entry.taj = rawVals['taj'];
            if (rawVals['nemzetiseg']) entry.nemzetiseg = rawVals['nemzetiseg'];
            if (rawVals['vallas']) entry.vallas = rawVals['vallas'];
            if (rawVals['megjegyzes']) entry.megjegyzes = rawVals['megjegyzes'];
            if (rawVals['email']) entry.email = rawVals['email'];
            if (rawVals['foglalkozas']) entry.foglalkozas = rawVals['foglalkozas'];
            if (rawVals['hsz']) entry.c_szam = String(rawVals['hsz']);
            if (rawVals['telefon']) entry.telefon = String(rawVals['telefon']);
            if (rawVals['apja']) entry.apjaneve = rawVals['apja'];
            if (rawVals['anyja']) entry.anyjaneve = rawVals['anyja'];

            if (rawVals['neme']) {
                const l = rawVals['neme'].toLowerCase();
                entry.ferfi = !(l.includes('nő') || l.includes('no') || l === 'feleség' || l === 'lány');
            }

            if (rawVals['sz_datum']) {
                if (!isNaN(rawVals['sz_datum'])) {
                    const date = new Date((rawVals['sz_datum'] - (25567 + 1)) * 86400 * 1000); 
                    entry.sz_datum = date.toISOString().split('T')[0];
                } else { entry.sz_datum = rawVals['sz_datum']; }
            }

            let fullNameRaw = rawVals['teljes_nev'];
            if (fullNameRaw && !entry.csaladnev) {
                const parts = fullNameRaw.split(' ');
                entry.csaladnev = parts[0];
                entry.k_nev = parts.length > 1 ? parts.slice(1).join(' ') : '-';
            }

            if (entry.szcs_nev && entry.k_nev) {
                let metszettSzcsNev = entry.szcs_nev;
                const kNevReszek = entry.k_nev.split(' ');
                kNevReszek.forEach(resz => {
                    if(resz.trim() !== '') {
                        const regex = new RegExp("\\b" + resz.trim() + "\\b", "ig");
                        metszettSzcsNev = metszettSzcsNev.replace(regex, '');
                    }
                });
                entry.szcs_nev = metszettSzcsNev.replace(/\s+/g, ' ').trim(); 
            }

            // --- 🚨 2. LÉPÉS: KIKÉNYSZERÍTETT SORREND (Előbb a település, majd az utca) ---
            if (rawVals['sz_hely']) {
                entry.sz_helyid = await window.getOrCreateLocality(rawVals['sz_hely']);
            }

            if (rawVals['lakhely']) {
                entry.c_helysegid = await window.getOrCreateLocality(rawVals['lakhely']);
            }

            if (rawVals['utca']) {
                let locId = entry.c_helysegid; // Már biztosan tudjuk, van-e lakhely!
                
                if (!locId) {
                    const displayN = (entry.csaladnev || '') + ' ' + (entry.k_nev || '');
                    const promptName = displayN.trim() !== '' ? displayN : 'Egy tag';

                    if (!defaultFallbackLocality) {
                        let userPrompt = prompt(`FIGYELEM!\n${promptName} adatainál az Excelben szerepel a(z) "${rawVals['utca']}" utca, de nem adtak meg hozzá települést (lakhelyet).\n\nKérem, írja be a TELEPÜLÉS nevét:`, "Gyülekezet települése");
                        
                        if (userPrompt === null || userPrompt.trim() === "") {
                            throw new Error("Importálás megszakítva: Az utcákhoz kötelező települést megadni!");
                        }
                        defaultFallbackLocality = userPrompt.trim();
                    }
                    locId = await window.getOrCreateLocality(defaultFallbackLocality);
                    entry.c_helysegid = locId; 
                }
                entry.c_utcaid = await window.getOrCreateStreet(rawVals['utca'], locId);
            }

            // 3. LÉPÉS: Halálozás és CNP generálás
            let halalRaw = rawVals['halal_info'];
            let deathDateToSave = null;
            if (halalRaw) {
                const hLower = String(halalRaw).toLowerCase().trim();
                if (hLower === 'igen' || hLower === 'true' || hLower === '1' || hLower === 'x' || hLower.includes('meghalt') || hLower.includes('elhunyt') || !isNaN(Date.parse(halalRaw)) || !isNaN(halalRaw)) {
                    entry.meghalt = true; 
                    if (!isNaN(halalRaw) && halalRaw > 10000) { 
                        const d = new Date((halalRaw - (25567 + 1)) * 86400 * 1000);
                        deathDateToSave = d.toISOString().split('T')[0];
                    } else if (!isNaN(Date.parse(halalRaw))) {
                        const d = new Date(halalRaw);
                        deathDateToSave = d.toISOString().split('T')[0];
                    }
                }
            }

            if (!entry.cnp) {
                const datePart = entry.sz_datum ? entry.sz_datum.replace(/-/g, '').substring(2) : "000000";
                entry.cnp = `9${datePart}${Math.floor(10000 + Math.random() * 90000)}`;
            }
            
            if (entry.ferfi === undefined) entry.ferfi = true;

            // 4. LÉPÉS: Duplikáció szűrés
            if (entry.csaladnev) {
                let isDuplicate = false;
                
                if (entry.cnp && !entry.cnp.startsWith('9000000')) {
                    isDuplicate = allMembersData.some(m => m.cnp === entry.cnp);
                }
                
                if (!isDuplicate && entry.csaladnev && entry.k_nev && entry.sz_datum) {
                    isDuplicate = allMembersData.some(m => 
                        m.csaladnev.toLowerCase() === entry.csaladnev.toLowerCase() && 
                        m.k_nev.toLowerCase() === entry.k_nev.toLowerCase() && 
                        m.sz_datum === entry.sz_datum
                    );
                }

                if (isDuplicate) {
                    skippedDuplicates++;
                } else {
                    if (deathDateToSave) entry._tempDeathDate = deathDateToSave; 
                    membersToInsert.push(entry);
                }
            }
        }

        if (membersToInsert.length === 0 && skippedDuplicates === 0) {
            throw new Error("A feldolgozás során nem találtunk érvényes sorokat!");
        }

        const cleanMembersToInsert = membersToInsert.map(m => {
            const { _tempDeathDate, ...rest } = m;
            return rest;
        });

        if (cleanMembersToInsert.length > 0) {
            const { data: insertedMembers, error: insertErr } = await _supabase.from('szemely').insert(cleanMembersToInsert).select('id, cnp');
            if (insertErr) throw insertErr;

            insertedMembers.forEach(im => {
                const originalMember = membersToInsert.find(m => m.cnp === im.cnp);
                if (originalMember && originalMember._tempDeathDate) {
                    deathRecordsToInsert.push({
                        id_szemely: im.id,
                        congregation_id: profile.congregation_id,
                        hdatum: originalMember._tempDeathDate,
                        hoka: 'Tömeges importálás',
                        munkanaploba: false
                    });
                }
            });

            if (deathRecordsToInsert.length > 0) {
                await _supabase.from('temetes').insert(deathRecordsToInsert);
            }
            
            let resultMsg = `Sikeres művelet!\n${insertedMembers.length} ÚJ tag sikeresen beimportálva az adatbázisba!`;
            if (deathRecordsToInsert.length > 0) resultMsg += `\n(Ebből ${deathRecordsToInsert.length} fő elhunytként, dátummal rögzítve a temetési anyakönyvbe.)`;
            if (skippedDuplicates > 0) resultMsg += `\n\n🛡️ Okos Szűrő: ${skippedDuplicates} tagot a gép automatikusan kihagyott, mert már szerepeltek a nyilvántartásban!`;
            
            alert(resultMsg);
        } else {
            alert(`Sikeres művelet (de nem történt mentés)!\n\n🛡️ Okos Szűrő: A fájlban lévő mind a(z) ${skippedDuplicates} tag MÁR SZEREPELT a nyilvántartásban, így a gép nem duplikálta őket!`);
        }
        
        bootstrap.Modal.getInstance(document.getElementById('modal-mass-import')).hide();
        
        if (typeof window.loadMembers === 'function') await window.loadMembers();

    } catch (err) {
        alert("HIBA AZ IMPORTÁLÁS SORÁN:\n" + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
};

// ============================================================================
// 4. VAGYONLELTÁR (3.43 EXCEL) TÖMEGES IMPORTÁLÁSA (Kettős Nyilvántartás)
// ============================================================================

window.leltarImportDataToSave = [];

window.handleLeltarExcelUpload = async function(event) {
    if (typeof loadLib === 'function') await loadLib('xlsx');
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        window.leltarImportDataToSave = [];
        const stats = {};

        const sheetsToProcess = [
            { name: 'Alapeszkozok', cat: 'Alapeszközök' },
            { name: 'Csekely_erteku_targyak', cat: 'Csekély értékű' },
            { name: 'Telkek_foldek_erdok', cat: 'Telkek_Földek' },
            { name: 'Konyvek', cat: 'Könyvek' },
            { name: 'Kegyszerek', cat: 'Kegyszerek' },
            { name: 'Karpjegyek_reszvenyek', cat: 'Kárpótlási' },
            { name: 'Bizomanyi', cat: 'Bizományi' }
        ];

        sheetsToProcess.forEach(sheetInfo => {
            const sheet = workbook.Sheets[sheetInfo.name];
            if (!sheet) return;
            
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
            let count = 0;

            let c_megn = -1, c_lelt = -1, c_hely = -1, c_ev = -1, c_ho = -1, c_nap = -1, c_ertek = -1, c_menny = -1, c_mertek = -1, c_biz = -1, c_haszn = -1, c_szerzo = -1;
            for(let r = 0; r < 8; r++) {
                if(!json[r]) continue;
                for(let c = 0; c < json[r].length; c++) {
                    let val = String(json[r][c] || '').toLowerCase().replace(/\s+/g, '');
                    if(val.includes('megnevezés') || val === 'cím') c_megn = c;
                    if(val.includes('szerző')) c_szerzo = c;
                    if(val.includes('leltáriszám') || val.includes('leltari\nszam')) c_lelt = c;
                    if(val.includes('helyszín') || val.includes('felelős')) c_hely = c;
                    if(val.includes('beszerzésiérték')) c_ertek = c;
                    if(val.includes('mennyiség')) c_menny = c;
                    if(val.includes('mérték') && val.includes('egység')) c_mertek = c;
                    if(val.includes('irat') && val.includes('száma')) c_biz = c;
                    if(val.includes('használati') && val.includes('idő')) c_haszn = c;
                    if(val === 'év' && c_ev === -1) c_ev = c;
                    if(val === 'hó' && c_ho === -1) c_ho = c;
                    if(val === 'nap' && c_nap === -1) c_nap = c;
                }
            }

            if(c_megn === -1) c_megn = (sheetInfo.cat === 'Könyvek') ? 5 : 4;
            if(c_szerzo === -1) c_szerzo = 4; if(c_lelt === -1) c_lelt = 7;
            if(c_hely === -1) c_hely = 6; if(c_ertek === -1) c_ertek = 11;
            if(c_menny === -1) c_menny = 12; if(c_mertek === -1) c_mertek = 13;
            if(c_biz === -1) c_biz = 14; if(c_ev === -1) c_ev = 8;
            if(c_ho === -1) c_ho = 9; if(c_nap === -1) c_nap = 10;
            if(c_haszn === -1) c_haszn = 19;

            for (let i = 4; i < json.length; i++) {
                const row = json[i];
                if (!row || row.length < 5) continue;
                
                const regiLeltariSzam = row[c_lelt]; 
                let megnevezes = row[c_megn];
                let szerzo = null;
                
                if (sheetInfo.cat === 'Könyvek') { szerzo = row[c_szerzo]; megnevezes = row[c_megn]; }

                if (!megnevezes && !regiLeltariSzam) continue;
                let mStr = String(megnevezes).toLowerCase();
                let lStr = String(regiLeltariSzam).toLowerCase();
                if (mStr.includes('megnevezés') || mStr.includes('áthozat') || mStr === '0') continue;
                if (mStr.includes('összesen') || mStr.includes('total')) continue;
                if (lStr.includes('összesen') || lStr.includes('total')) continue;

                const ev = row[c_ev], ho = row[c_ho], nap = row[c_nap];
                let datum = null;
                if (ev !== undefined && ev !== null && String(ev).trim() !== '') {
                    const eNum = parseInt(String(ev).trim(), 10);
                    if (!isNaN(eNum) && eNum >= 1000 && eNum <= 2100) {
                        const safeHo = (!isNaN(parseInt(ho, 10)) && ho >= 1 && ho <= 12) ? String(ho).padStart(2, '0') : '01';
                        const safeNap = (!isNaN(parseInt(nap, 10)) && nap >= 1 && nap <= 31) ? String(nap).padStart(2, '0') : '01';
                        datum = `${eNum}-${safeHo}-${safeNap}`;
                    }
                }
                
                // Beletesszük a listába (Az ÚJ leltári számot a mentéskor generáljuk hozzá!)
                window.leltarImportDataToSave.push({
                    kategoria: sheetInfo.cat,
                    szerzo: szerzo ? String(szerzo).trim() : null,
                    megnevezes: megnevezes ? String(megnevezes).trim() : 'Névtelen',
                    regi_leltari_szam: regiLeltariSzam ? String(regiLeltariSzam).trim() : null, // 🚨 RÉGI SZÁM
                    helyszin: row[c_hely] ? String(row[c_hely]).trim() : '',
                    beszerzes_datuma: datum,
                    beszerzes_bizonylat: String(row[c_biz] || '').trim(),
                    beszerzesi_ertek: parseFloat(row[c_ertek]) || 0,
                    mennyiseg: parseFloat(row[c_menny]) || 1,
                    mertekegyseg: String(row[c_mertek] || 'db').trim(),
                    hasznalati_ido_ev: sheetInfo.cat === 'Alapeszközök' ? (parseFloat(row[c_haszn]) || null) : null
                });
                count++;
            }
            stats[sheetInfo.cat] = count;
        });

        document.getElementById('leltar-import-stats').classList.remove('d-none');
        document.getElementById('leltar-stats-grid').innerHTML = Object.keys(stats).map(k => `
            <div class="col-md-3"><div class="card border-0 shadow-sm" style="border-left: 4px solid #d6336c !important;"><div class="card-body p-3 text-center"><div class="text-muted small fw-bold text-uppercase">${k}</div><div class="fs-2 fw-bold text-pink">${stats[k]} db</div></div></div></div>
        `).join('');
    };
    reader.readAsArrayBuffer(file);
};

window.executeLeltarMassImport = async function() {
    if (window.leltarImportDataToSave.length === 0) { alert("Nincs betöltött adat!"); return; }

    const btn = document.getElementById('btn-execute-leltar-import');
    const origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sorszámozás és Importálás...';
    btn.disabled = true;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        if (!user) throw new Error("Nem található bejelentkezett felhasználó!");

        // 🚨 1. LÉPÉS: Lekérjük a jelenlegi MAX sorszámokat a kategóriákhoz
        const prefixMap = { 'Alapeszközök': 'AE', 'Csekély értékű': 'CS', 'Telkek_Földek': 'T', 'Könyvek': 'K', 'Kegyszerek': 'KG', 'Bizományi': 'B', 'Kárpótlási': 'KR' };
        let maxCounters = { 'Alapeszközök': 0, 'Csekély értékű': 0, 'Telkek_Földek': 0, 'Könyvek': 0, 'Kegyszerek': 0, 'Bizományi': 0, 'Kárpótlási': 0 };

        const { data: existingItems } = await _supabase.from('leltar_tetelek').select('kategoria, leltari_szam').eq('congregation_id', activeCongregationId);
        if (existingItems) {
            existingItems.forEach(t => {
                const prefix = prefixMap[t.kategoria];
                if (prefix && t.leltari_szam && t.leltari_szam.startsWith(prefix + '-')) {
                    const num = parseInt(t.leltari_szam.split('-')[1], 10);
                    if (!isNaN(num)) maxCounters[t.kategoria] = Math.max(maxCounters[t.kategoria], num);
                }
            });
        }

        // 🚨 2. LÉPÉS: Intelligens sorszám kiosztás az Excel sorrendjében
        const recordsToInsert = window.leltarImportDataToSave.map(r => {
            const prefix = prefixMap[r.kategoria] || 'L';
            maxCounters[r.kategoria]++;
            return {
                ...r,
                leltari_szam: `${prefix}-${maxCounters[r.kategoria]}`, // Az ÚJ okos szám
                congregation_id: activeCongregationId,
                userid: user.id,
                is_deleted: false
            };
        });

        // 3. LÉPÉS: Feldarabolt feltöltés (Chunking) a biztonságért
        const chunkSize = 900;
        for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
            const chunk = recordsToInsert.slice(i, i + chunkSize);
            const { error } = await _supabase.from('leltar_tetelek').insert(chunk);
            if (error) throw error;
        }

        alert(`Sikeres művelet!\nÖsszesen ${recordsToInsert.length} vagyontárgy kapott új sorszámot és került be a Leltárba!`);
        bootstrap.Modal.getInstance(document.getElementById('modal-mass-import')).hide();
        document.getElementById('import-file-leltar').value = '';
        document.getElementById('leltar-import-stats').classList.add('d-none');
        if (typeof window.initLeltar === 'function') await window.initLeltar();

    } catch (err) { alert("Hiba az importálás során: " + err.message); }
    finally { btn.innerHTML = origText; btn.disabled = false; }
};

// ============================================================================
// PÉNZÜGYI ADATOK TÖMEGES IMPORTÁLÁSA
// ============================================================================

let financeImportData = [], financeImportHeaders = [];
let worklogImportData = [], worklogImportHeaders = [];
let registryImportData = [], registryImportHeaders = [];

window.onFinanceTypeChange = function() {
    if (financeImportData.length > 0) generateMappingTableFinance(); // async, nem kell await itt
};

window.onRegistryTypeChange = function() {
    if (registryImportData.length > 0) generateMappingTableRegistry();
};

window.generateMappingTableFinance = async function() {
    const tbody = document.getElementById('mapping-body-finance');
    if (!tbody) return;
    const dbFields = [
        { val: '', label: '-- Kihagyás (Ne importálja) --' },
        { val: 'datum', label: 'Dátum (egészben, pl. 2025-01-15) *' },
        { val: 'datum_ev', label: 'Dátum – ÉV (ha 3 oszlopra bontva)' },
        { val: 'datum_ho', label: 'Dátum – HÓNAP (ha 3 oszlopra bontva)' },
        { val: 'datum_nap', label: 'Dátum – NAP (ha 3 oszlopra bontva)' },
        { val: 'osszeg', label: 'Összeg (RON) *' },
        { val: 'irattipus', label: 'Típus (Készpénz / Átutalás)' },
        { val: 'forrasa_cim', label: 'Tag neve + Lakcíme (egy oszlopban – automatikus személypárosítás)' },
        { val: 'forrasa', label: 'Tag neve / Forrás (csak szöveg, párosítás nélkül)' },
        { val: 'nyugta', label: 'Nyugta száma' },
        { val: 'iratszam', label: 'Iratszám / Bizonylatszám' },
        { val: 'megjegyzes', label: 'Megjegyzés / Leírás' },
        { val: 'fizetettev', label: 'Pénzügyi év (pl. 2025)' },
        { val: 'cel_kod', label: 'Könyvelési kód (pl. 1.1, 2.3 – pontos kód-egyezés)' },
        { val: 'cel_nev', label: 'Kategória neve (szöveg – manuális egyeztetéssel)' },
    ];

    let html = '';
    financeImportHeaders.forEach(header => {
        if (!header) return;
        let autoSelect = '';
        const lh = String(header).toLowerCase();
        // Dátum auto-detect – 3 oszlopos esetben (rövid, pontos nevek)
        if (lh === 'év' || lh === 'ev' || lh === 'year') autoSelect = 'datum_ev';
        else if (lh === 'hó' || lh === 'ho' || lh === 'hónap' || lh === 'month') autoSelect = 'datum_ho';
        else if (lh === 'nap' || lh === 'day') autoSelect = 'datum_nap';
        else if (lh.includes('dátum') || lh.includes('datum') || lh.includes('date')) autoSelect = 'datum';
        if (lh.includes('összeg') || lh.includes('osszeg') || lh.includes('amount')) autoSelect = 'osszeg';
        if (lh.includes('típus') || lh.includes('tipus') || lh.includes('irattipus') || lh.includes('pénznem')) autoSelect = 'irattipus';
        if (lh.includes('forrás') || lh.includes('forras') || lh.includes('befizet') || lh.includes('átvevő') || lh.includes('atvevo')) autoSelect = 'forrasa_cim';
        if (lh.includes('nyugta')) autoSelect = 'nyugta';
        if (lh.includes('iratszám') || lh.includes('iratszam') || lh.includes('bizonylat') || lh.includes('számlaszám')) autoSelect = 'iratszam';
        if (lh.includes('megjegyz') || lh.includes('leírás') || lh.includes('leiras')) autoSelect = 'megjegyzes';
        if ((lh.includes('fizetett') && lh.includes('év')) || lh === 'pénzügyi év') autoSelect = 'fizetettev';
        // Könyvelési kód: ha pontosan "kód"-ot tartalmaz
        if (lh.includes('kód') && (lh.includes('könyv') || lh.includes('cél') || lh.includes('cel'))) autoSelect = 'cel_kod';
        // Kategória neve: ha "kategória", "megnevezés", "tétel neve" stb. – de NEM "kód"
        if ((lh.includes('kategó') || lh.includes('katego') || lh.includes('megnevezés') || lh.includes('megnevezes') || lh.includes('tétel') || lh.includes('tetel')) && !lh.includes('kód') && !lh.includes('kod')) autoSelect = 'cel_nev';

        const opts = dbFields.map(f => `<option value="${f.val}"${f.val === autoSelect ? ' selected' : ''}>${f.label}</option>`).join('');
        html += `<tr><td class="fw-bold text-dark align-middle"><i class="ti ti-arrow-right text-muted me-2"></i>${header}</td><td><select class="form-select border-success fw-bold finance-mapping-select" data-excel-col="${header}" onchange="updateFinanceCatMatchSection()">${opts}</select></td></tr>`;
    });
    tbody.innerHTML = html;
    document.getElementById('import-row-count-finance').innerText = `${financeImportData.length} sor importálásra kész!`;
    document.getElementById('mapping-container-finance').classList.remove('d-none');

    // Könyvelési tételek betöltése: fallback dropdown ÉS kategória-egyeztetés
    const financeType = document.querySelector('input[name="finance-type"]:checked')?.value || 'befizetes';
    const isBev = financeType === 'befizetes';
    const celType = isBev ? 'B' : 'K';
    const fallbackSel = document.getElementById('finance-fallback-cel');
    try {
        // EGYSZERŰ: közvetlenül szamadasicel-ből töltünk, befizetescel/kiadascel NEM kell itt
        // Az option value = szamadasicel szöveges kód (pl. '104.05') — integer ID-t az execute-nál keresünk
        const { data: szCelData } = await _supabase
            .from('szamadasicel')
            .select('id, nev, sorszam')
            .eq('type', celType)
            .like('id', '%.%')
            .order('sorszam');

        // Globálisan tároljuk (updateFinanceCatMatchSection is használja)
        // id = szamadasicel szöveges kód (NEM befizetescel integer!)
        window._financeCelOptions = (szCelData || []).map(c => ({
            id: c.id,
            kod: c.id,
            nev: c.nev || '',
            label: `${c.id} – ${c.nev || ''}`
        }));

        if (fallbackSel) {
            fallbackSel.innerHTML = '<option value="">-- Nincs alapértelmezett --</option>' +
                window._financeCelOptions.map(o => `<option value="${o.kod}">${o.label}</option>`).join('');
        }
    } catch(e) {
        console.error('Hiba a könyvelési tételek betöltésekor:', e);
        if (fallbackSel) fallbackSel.innerHTML = '<option value="">-- Hiba a betöltésnél --</option>';
    }

    // Kategória egyeztetés frissítése (ha auto-detect cel_nev-et talált)
    updateFinanceCatMatchSection();
};

window.updateFinanceCatMatchSection = function() {
    const section = document.getElementById('finance-cat-match-section');
    const body = document.getElementById('finance-cat-match-body');
    if (!section || !body) return;

    // Van-e cel_nev párosítva?
    let celNevCol = null;
    document.querySelectorAll('.finance-mapping-select').forEach(sel => {
        if (sel.value === 'cel_nev') celNevCol = sel.getAttribute('data-excel-col');
    });

    if (!celNevCol || financeImportData.length === 0 || !window._financeCelOptions) {
        section.classList.add('d-none');
        return;
    }

    // Egyedi kategória nevek az Excelből
    const uniqueVals = [...new Set(
        financeImportData.map(r => r[celNevCol]).filter(v => v !== undefined && v !== null && String(v).trim() !== '')
    )].map(String);

    if (uniqueVals.length === 0) { section.classList.add('d-none'); return; }

    const celOpts = window._financeCelOptions;

    function autoMatch(excelNev) {
        const en = excelNev.toLowerCase().trim();
        // 1. Pontos egyezés (nev mezőre)
        let found = celOpts.find(o => o.nev.toLowerCase() === en);
        if (found) return found.id;
        // 2. Az Excel neve tartalmazza a DB tétel nevét (rövidítés)
        found = celOpts.find(o => o.nev.toLowerCase() && en.includes(o.nev.toLowerCase().substring(0, Math.min(6, o.nev.length))));
        if (found) return found.id;
        // 3. A DB tétel neve tartalmazza az Excel nevét
        found = celOpts.find(o => o.nev.toLowerCase().includes(en));
        if (found) return found.id;
        // 4. Kód alapján
        found = celOpts.find(o => o.kod.toLowerCase() === en);
        if (found) return found.id;
        return '';
    }

    let html = '';
    uniqueVals.forEach(val => {
        const bestId = autoMatch(val);
        const opts = '<option value="">-- Nem egyezteti / Alapértelmezett --</option>' +
            celOpts.map(o => `<option value="${o.id}"${String(o.id) === String(bestId) ? ' selected' : ''}>${o.label}</option>`).join('');
        const matchIcon = bestId ? '<span class="badge bg-success-lt me-2 small">Auto</span>' : '<span class="badge bg-warning-lt me-2 small">Kézi</span>';
        html += `
        <div class="row g-2 align-items-center mb-2">
            <div class="col-md-5">
                <div class="p-2 border rounded bg-white fw-bold text-dark small">
                    ${matchIcon}<i class="ti ti-tag me-1 text-muted"></i>"${val}"
                </div>
            </div>
            <div class="col-md-1 text-center"><i class="ti ti-arrow-right text-success fs-4"></i></div>
            <div class="col-md-6">
                <select class="form-select form-select-sm border-success finance-cat-match-select" data-excel-cat="${val}">${opts}</select>
            </div>
        </div>`;
    });
    body.innerHTML = html;
    section.classList.remove('d-none');
};

window.executeFinanceImport = async function() {
    const btn = document.getElementById('btn-execute-import-finance');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Importálás folyamatban...';
    btn.disabled = true;
    try {
        const { data: { user } } = await _supabase.auth.getUser();
        const { data: profile } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();
        if (!profile?.congregation_id) throw new Error("Nincs gyülekezet azonosító!");

        const financeType = document.querySelector('input[name="finance-type"]:checked')?.value || 'befizetes';
        const isBev = financeType === 'befizetes';
        const tableName = isBev ? 'befizetes' : 'kiadas';
        const celTable = isBev ? 'befizetescel' : 'kiadascel';
        const celFkField = isBev ? 'id_befizetescel' : 'id_kiadascel';

        const { data: celData } = await _supabase.from(celTable).select('id, id_szamadasicel');
        // celMap: szamadasicel szöveges kód → befizetescel/kiadascel integer ID
        // celMap: szamadasicel szöveges kód → befizetescel/kiadascel integer ID
        // (az SQL script gondoskodik arról, hogy minden tételhez legyen bejegyzés)
        const celMap = {};
        celData?.forEach(c => { if (c.id_szamadasicel) celMap[c.id_szamadasicel.trim()] = c.id; });

        // Segédfüggvény: szamadasicel kód → integer ID (csak keresés, nincs auto-create)
        function getCelIntId(szCelKod) {
            if (!szCelKod) return null;
            return celMap[String(szCelKod).trim()] || null;
        }

        // Alapértelmezett cél (opcionális): ha van kiválasztva, azokra a sorokra használja ahol nincs kategória-egyezés
        const fallbackCelKod = document.getElementById('finance-fallback-cel')?.value || '';
        const fallbackCelId = getCelIntId(fallbackCelKod) || null;

        // Kategória-egyeztetés: Excel kategória neve → szamadasicel kód
        const catNameMap = {};
        document.querySelectorAll('.finance-cat-match-select').forEach(sel => {
            const excelCat = sel.getAttribute('data-excel-cat');
            if (excelCat && sel.value) catNameMap[excelCat] = sel.value;
        });

        const mapping = {};
        document.querySelectorAll('.finance-mapping-select').forEach(sel => { if (sel.value) mapping[sel.getAttribute('data-excel-col')] = sel.value; });

        const hasDatumOszlop = Object.values(mapping).includes('datum') || Object.values(mapping).includes('datum_ev');
        if (!hasDatumOszlop) throw new Error("Legalább egy Dátum mező megjelölése kötelező (egész dátum VAGY Év oszlop)!");
        if (!Object.values(mapping).includes('osszeg')) throw new Error("Az Összeg mező megjelölése kötelező!");

        // Személy betöltése: csak ha forrasa_cim van párosítva (névpárosításhoz)
        let allMembers = null;
        if (Object.values(mapping).includes('forrasa_cim')) {
            const { data: members } = await _supabase.from('szemely')
                .select('id, csaladnev, k_nev')
                .eq('congregation_id', profile.congregation_id);
            allMembers = members || [];
        }

        function matchPerson(nevCimSzoveg) {
            if (!nevCimSzoveg || !allMembers) return null;
            const parts = nevCimSzoveg.trim().split(/\s+/);
            // Próbálj 2 szavas nevet (leggyakoribb), aztán 3 szavasat
            for (let n = 2; n <= Math.min(3, parts.length); n++) {
                const cs = parts[0].toLowerCase();
                const kn = parts.slice(1, n).join(' ').toLowerCase();
                const found = allMembers.find(m =>
                    m.csaladnev?.toLowerCase() === cs &&
                    m.k_nev?.toLowerCase() === kn
                );
                if (found) return found.id;
            }
            return null;
        }

        const currentYear = new Date().getFullYear();
        const records = [];
        let skippedCount = 0;
        financeImportData.forEach((row, i) => {
            const raw = {};
            for (const [col, field] of Object.entries(mapping)) {
                const v = row[col] !== undefined && row[col] !== null ? String(row[col]).trim() : null;
                if (v) raw[field] = v;
            }
            if (!raw['osszeg'] || isNaN(parseFloat(raw['osszeg']))) return;

            // Pénztármaradvány átugrása — nem valódi bevétel, az előző év záróegyenlege
            if (raw['cel_nev'] && raw['cel_nev'].toLowerCase().includes('pénztármaradv')) {
                skippedCount++; return;
            }
            if (raw['cel_kod'] && String(raw['cel_kod']).replace(',', '.').trim() === '100.01') {
                skippedCount++; return;
            }

            // Dátum összerakása (egész VAGY 3 oszlop)
            let datum;
            if (raw['datum_ev']) {
                const ev = parseInt(raw['datum_ev']) || currentYear;
                const ho = String(parseInt(raw['datum_ho']) || 1).padStart(2, '0');
                const nap = String(parseInt(raw['datum_nap']) || 1).padStart(2, '0');
                datum = `${ev}-${ho}-${nap}`;
            } else {
                datum = raw['datum'] || new Date().toISOString().split('T')[0];
                if (!isNaN(datum) && Number(datum) > 10000) {
                    datum = new Date((Number(datum) - (25567 + 1)) * 86400 * 1000).toISOString().split('T')[0];
                }
            }

            // Könyvelési cél: 1. kategória-egyeztetés (cel_nev) → 2. kód-egyezés (cel_kod) → 3. fallback
            // KöltsSzám normalizálás: '101,01' → '101.01' (Excel vesszőt használ pont helyett)
            let celId = null;
            if (raw['cel_nev'] && catNameMap[raw['cel_nev']]) {
                celId = getCelIntId(catNameMap[raw['cel_nev']]);
            } else if (raw['cel_kod']) {
                const normalizedKod = String(raw['cel_kod']).replace(',', '.').trim();
                celId = getCelIntId(normalizedKod) || fallbackCelId;
            } else {
                celId = fallbackCelId;
            }

            const fizetettev = raw['fizetettev'] ? parseInt(raw['fizetettev']) : parseInt((datum || '').substring(0, 4) || currentYear);

            // Személypárosítás forrasa_cim alapján
            let forrasNev = raw['forrasa'] || raw['forrasa_cim'] || '';
            let szemId = raw['forrasa_cim'] ? matchPerson(raw['forrasa_cim']) : null;

            const rec = {
                congregation_id: profile.congregation_id,
                datum: datum,
                osszeg: parseFloat(raw['osszeg']),
                irattipus: raw['irattipus'] || 'Készpénz',
                megjegyzes: raw['megjegyzes'] || '',
                deleted: false,
                csalad: false,
                userid: user.id,
                xkey: `${isBev ? 'B' : 'K'}-${Date.now()}-${i}`,
                [celFkField]: celId,
            };
            if (raw['nyugta']) rec.nyugta = raw['nyugta'];
            if (raw['iratszam']) rec.iratszam = raw['iratszam'];

            if (isBev) {
                rec.fizetettev = fizetettev;
                rec.forrasa = forrasNev;
                if (szemId) rec.id_szemely = szemId;
            } else {
                rec.atvevo = forrasNev;
                if (szemId) rec.atvevoid = szemId;
            }
            records.push(rec);
        });

        if (records.length === 0) throw new Error("Nem találtunk érvényes pénzügyi adatokat a fájlban!");

        // Ellenőrzés: minden sornak kell könyvelési tétel
        const missingCel = records.filter(r => !r[celFkField]);
        if (missingCel.length > 0) {
            throw new Error(`${missingCel.length} sorhoz nem sikerült könyvelési tételt rendelni!\n\nMegoldás:\n• Ellenőrizd a Kategória Egyeztetés részt, hogy minden Excel-kategória párosítva van-e\n• VAGY válassz alapértelmezett tételt a sárga Fallback mezőből`);
        }

        // ─── DUPLIKÁCIÓ-ELLENŐRZÉS ───────────────────────────────────────────
        // Az iratszám az egyedi azonosító bizonylaton. Ha már szerepel az adatbázisban,
        // az ugyanannak az Excel-importnak a megismétlése (kettős könyvelés).
        let finalRecords = records;
        const iratszamList = records.filter(r => r.iratszam).map(r => r.iratszam);
        if (iratszamList.length > 0) {
            const { data: existing } = await _supabase.from(tableName)
                .select(isBev ? 'iratszam, datum, fizetettev' : 'iratszam, datum')
                .eq('congregation_id', profile.congregation_id)
                .eq('deleted', false)
                .in('iratszam', iratszamList);

            if (existing && existing.length > 0) {
                const existingSet = new Set(existing.map(r => r.iratszam));
                const dupRecs = records.filter(r => r.iratszam && existingSet.has(r.iratszam));
                const newRecs = records.filter(r => !r.iratszam || !existingSet.has(r.iratszam));

                const dupInfo = existing.slice(0, 5).map(r =>
                    `• Iratszám: ${r.iratszam} | ${r.datum}${isBev && r.fizetettev ? ' | ' + r.fizetettev + '. évi járulék' : ''}`
                ).join('\n');
                const extra = existing.length > 5 ? `\n...és még ${existing.length - 5} db.` : '';

                const skip = confirm(
                    `⚠️ DUPLIKÁCIÓ ÉSZLELVE!\n\n` +
                    `${dupRecs.length} tétel már szerepel az adatbázisban azonos iratszámmal:\n\n` +
                    dupInfo + extra +
                    `\n\nEzek valószínűleg egy korábbi import eredményei.\n\n` +
                    `✅ OK → Kihagyja a már meglévőket, csak az újakat importálja (${newRecs.length} db)\n` +
                    `❌ Mégse → Visszalép, ellenőrizze az adatokat`
                );
                if (!skip) throw new Error('Import megszakítva – ellenőrizze a duplikátumokat!');
                finalRecords = newRecs;
                if (finalRecords.length === 0) {
                    alert('Minden rekord már szerepel az adatbázisban – nincs új importálnivaló!');
                    bootstrap.Modal.getInstance(document.getElementById('modal-mass-import')).hide();
                    return;
                }
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        const linkedCount = finalRecords.filter(r => isBev ? r.id_szemely : r.atvevoid).length;

        const chunkSize = 500;
        for (let i = 0; i < finalRecords.length; i += chunkSize) {
            const { error } = await _supabase.from(tableName).insert(finalRecords.slice(i, i + chunkSize));
            if (error) throw error;
        }

        let msg = `Sikeres importálás!\n${finalRecords.length} ${isBev ? 'bevételi' : 'kiadási'} tétel mentve!`;
        const skippedDup = records.length - finalRecords.length;
        if (skippedDup > 0) msg += `\n(${skippedDup} duplikátum kihagyva – már szerepelt az adatbázisban.)`;
        if (linkedCount > 0) msg += `\n${linkedCount} személy párosítva a nyilvántartással.`;
        if (skippedCount > 0) msg += `\n(${skippedCount} Pénztármaradvány sor kihagyva — ezek nem valódi bevételek.)`;
        alert(msg);
        bootstrap.Modal.getInstance(document.getElementById('modal-mass-import')).hide();
        document.getElementById('import-file-finance').value = '';
        document.getElementById('mapping-container-finance').classList.add('d-none');
        financeImportData = []; financeImportHeaders = [];
    } catch (err) {
        alert("HIBA AZ IMPORTÁLÁS SORÁN:\n" + err.message);
    } finally { btn.innerHTML = origHtml; btn.disabled = false; }
};

// ============================================================================
// MUNKANAPLÓ TÖMEGES IMPORTÁLÁSA
// ============================================================================

window.generateMappingTableWorklog = function() {
    const tbody = document.getElementById('mapping-body-worklog');
    if (!tbody) return;
    const dbFields = [
        { val: '', label: '-- Kihagyás (Ne importálja) --' },
        { val: 'idopont', label: 'Dátum / Időpont *' },
        { val: 'kategoria', label: 'Kategória (szolgalat / egyeb)' },
        { val: 'jellege', label: 'Jellege / Alkalom típusa' },
        { val: 'cim', label: 'Cím / Helyszín' },
        { val: 'alapige', label: 'Alapige' },
        { val: 'megjegyzes', label: 'Megjegyzés / Leírás' },
        { val: 'jelenlet_osszesen', label: 'Jelenlét – Összesen' },
        { val: 'jelenlet_ferfi', label: 'Jelenlét – Férfi' },
        { val: 'jelenlet_no', label: 'Jelenlét – Nő' },
        { val: 'jelenlet_gyermek', label: 'Jelenlét – Gyermek' },
        { val: 'persely', label: 'Perselypénz (RON)' },
    ];
    let html = '';
    worklogImportHeaders.forEach(header => {
        if (!header) return;
        let autoSelect = '';
        const lh = String(header).toLowerCase();
        if (lh.includes('dátum') || lh.includes('datum') || lh.includes('idő') || lh.includes('ido') || lh.includes('date')) autoSelect = 'idopont';
        if (lh.includes('kateg') || lh.includes('tipus') || lh.includes('típus')) autoSelect = 'kategoria';
        if (lh.includes('jelle') || lh.includes('alkalom')) autoSelect = 'jellege';
        if (lh.includes('cím') || lh.includes('cim') || lh.includes('helyszín')) autoSelect = 'cim';
        if (lh.includes('alapige') || lh.includes('ige')) autoSelect = 'alapige';
        if (lh.includes('megjegyz') || lh.includes('leírás') || lh.includes('leiras')) autoSelect = 'megjegyzes';
        if (lh.includes('összesen') || lh.includes('total') || lh.includes('osszesen')) autoSelect = 'jelenlet_osszesen';
        if (lh.includes('férfi') || lh.includes('ferfi')) autoSelect = 'jelenlet_ferfi';
        if (lh.includes('nő') || (lh.includes('no') && !lh.includes('naplo'))) autoSelect = 'jelenlet_no';
        if (lh.includes('gyermek') || lh.includes('gyerek') || lh.includes('child')) autoSelect = 'jelenlet_gyermek';
        if (lh.includes('persely') || lh.includes('gyűjtés') || lh.includes('gyujtes')) autoSelect = 'persely';
        const opts = dbFields.map(f => `<option value="${f.val}"${f.val === autoSelect ? ' selected' : ''}>${f.label}</option>`).join('');
        html += `<tr><td class="fw-bold text-dark align-middle"><i class="ti ti-arrow-right text-muted me-2"></i>${header}</td><td><select class="form-select fw-bold worklog-mapping-select" style="border-color:#ae3ec9;" data-excel-col="${header}">${opts}</select></td></tr>`;
    });
    tbody.innerHTML = html;
    document.getElementById('import-row-count-worklog').innerText = `${worklogImportData.length} sor importálásra kész!`;
    document.getElementById('mapping-container-worklog').classList.remove('d-none');
};

window.executeWorklogImport = async function() {
    const btn = document.getElementById('btn-execute-import-worklog');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Importálás folyamatban...';
    btn.disabled = true;
    try {
        const { data: { user } } = await _supabase.auth.getUser();
        const { data: profile } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();
        if (!profile?.congregation_id) throw new Error("Nincs gyülekezet azonosító!");

        const mapping = {};
        document.querySelectorAll('.worklog-mapping-select').forEach(sel => { if (sel.value) mapping[sel.getAttribute('data-excel-col')] = sel.value; });

        if (!Object.values(mapping).includes('idopont')) throw new Error("A Dátum / Időpont mező megjelölése kötelező!");

        const records = [];
        worklogImportData.forEach(row => {
            const raw = {};
            for (const [col, field] of Object.entries(mapping)) {
                const v = row[col] !== undefined && row[col] !== null ? String(row[col]).trim() : null;
                if (v) raw[field] = v;
            }
            if (!raw['idopont']) return;
            let idopont = raw['idopont'];
            if (!isNaN(idopont) && Number(idopont) > 10000) {
                idopont = new Date((Number(idopont) - (25567 + 1)) * 86400 * 1000).toISOString().split('T')[0];
            }
            records.push({
                congregation_id: profile.congregation_id,
                idopont: idopont,
                kategoria: raw['kategoria'] || 'szolgalat',
                jellege: raw['jellege'] || '',
                cim: raw['cim'] || '',
                alapige: raw['alapige'] || '',
                megjegyzes: raw['megjegyzes'] || '',
                jelenlet_osszesen: parseInt(raw['jelenlet_osszesen']) || 0,
                jelenlet_ferfi: parseInt(raw['jelenlet_ferfi']) || 0,
                jelenlet_no: parseInt(raw['jelenlet_no']) || 0,
                jelenlet_gyermek: parseInt(raw['jelenlet_gyermek']) || 0,
                persely: parseFloat(raw['persely']) || 0,
            });
        });

        if (records.length === 0) throw new Error("Nem találtunk érvényes munkanapló adatokat a fájlban!");

        const chunkSize = 500;
        for (let i = 0; i < records.length; i += chunkSize) {
            const { error } = await _supabase.from('munkanaplo').insert(records.slice(i, i + chunkSize));
            if (error) throw error;
        }

        alert(`Sikeres importálás!\n${records.length} munkanapló bejegyzés mentve az adatbázisba!`);
        bootstrap.Modal.getInstance(document.getElementById('modal-mass-import')).hide();
        document.getElementById('import-file-worklog').value = '';
        document.getElementById('mapping-container-worklog').classList.add('d-none');
        worklogImportData = []; worklogImportHeaders = [];
    } catch (err) {
        alert("HIBA AZ IMPORTÁLÁS SORÁN:\n" + err.message);
    } finally { btn.innerHTML = origHtml; btn.disabled = false; }
};

// ============================================================================
// ANYAKÖNYVEK TÖMEGES IMPORTÁLÁSA (Személypárosítással)
// ============================================================================

window.generateMappingTableRegistry = function() {
    const tbody = document.getElementById('mapping-body-registry');
    if (!tbody) return;
    const regType = document.querySelector('input[name="registry-type"]:checked')?.value || 'keresztseg';

    const baseFields = [
        { val: '', label: '-- Kihagyás (Ne importálja) --' },
        { val: 'datum', label: 'Esemény Dátuma *' },
        { val: 'szemely_nev', label: 'Személy Neve (párosításhoz)' },
        { val: 'lelkeszneve', label: 'Szolgáló Lelkész neve' },
        { val: 'okirat', label: 'Okirat / Sorszám' },
        { val: 'megjegyzes', label: 'Megjegyzés' },
    ];
    const extraMap = {
        keresztseg: [{ val: 'apa_neve', label: 'Apa neve' }, { val: 'anya_neve', label: 'Anya neve' }],
        konfirmalas: [{ val: 'keresztelesideje', label: 'Keresztelés időpontja' }],
        hazassag: [{ val: 'ferfi_nev', label: 'Vőlegény neve' }, { val: 'no_nev', label: 'Menyasszony neve' }, { val: 'tanuk', label: 'Tanúk neve' }],
        temetes: [{ val: 'hdatum', label: 'Halál dátuma' }, { val: 'hoka', label: 'Halál oka' }, { val: 'tdatum', label: 'Temetés dátuma' }],
    };
    const dbFields = [...baseFields, ...(extraMap[regType] || [])];

    let html = '';
    registryImportHeaders.forEach(header => {
        if (!header) return;
        let autoSelect = '';
        const lh = String(header).toLowerCase();
        if (lh.includes('dátum') || lh.includes('datum') || lh.includes('date')) autoSelect = 'datum';
        if (lh.includes('név') || lh.includes('nev') || lh.includes('name')) autoSelect = 'szemely_nev';
        if (lh.includes('lelkész') || lh.includes('lelkesz')) autoSelect = 'lelkeszneve';
        if (lh.includes('okirat') || lh.includes('sorszám') || lh.includes('szám')) autoSelect = 'okirat';
        if (lh.includes('megjegyz')) autoSelect = 'megjegyzes';
        if (regType === 'keresztseg') {
            if (lh.includes('apa') || lh.includes('apja')) autoSelect = 'apa_neve';
            if (lh.includes('anya') || lh.includes('anyja')) autoSelect = 'anya_neve';
        }
        if (regType === 'hazassag') {
            if (lh.includes('vőlegény') || lh.includes('volegeny') || lh.includes('férj') || lh.includes('ferj')) autoSelect = 'ferfi_nev';
            if (lh.includes('menyasszony') || lh.includes('feleség') || lh.includes('feleség')) autoSelect = 'no_nev';
            if (lh.includes('tanú') || lh.includes('tanu')) autoSelect = 'tanuk';
        }
        if (regType === 'temetes') {
            if (lh.includes('halál') || lh.includes('halal') || lh.includes('elhunyt')) autoSelect = 'hdatum';
            if (lh.includes('oka') || lh === 'ok') autoSelect = 'hoka';
            if (lh.includes('temet')) autoSelect = 'tdatum';
        }
        if (regType === 'konfirmalas' && lh.includes('keresztel')) autoSelect = 'keresztelesideje';
        const opts = dbFields.map(f => `<option value="${f.val}"${f.val === autoSelect ? ' selected' : ''}>${f.label}</option>`).join('');
        html += `<tr><td class="fw-bold text-dark align-middle"><i class="ti ti-arrow-right text-muted me-2"></i>${header}</td><td><select class="form-select border-orange fw-bold registry-mapping-select" data-excel-col="${header}">${opts}</select></td></tr>`;
    });
    tbody.innerHTML = html;
    document.getElementById('import-row-count-registry').innerText = `${registryImportData.length} sor importálásra kész!`;
    document.getElementById('mapping-container-registry').classList.remove('d-none');
};

window.executeRegistryImport = async function() {
    const btn = document.getElementById('btn-execute-import-registry');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Importálás folyamatban...';
    btn.disabled = true;
    try {
        const { data: { user } } = await _supabase.auth.getUser();
        const { data: profile } = await _supabase.from('profiles').select('congregation_id').eq('id', user.id).single();
        if (!profile?.congregation_id) throw new Error("Nincs gyülekezet azonosító!");

        const regType = document.querySelector('input[name="registry-type"]:checked')?.value || 'keresztseg';
        const isHazassag = regType === 'hazassag';

        const mapping = {};
        document.querySelectorAll('.registry-mapping-select').forEach(sel => { if (sel.value) mapping[sel.getAttribute('data-excel-col')] = sel.value; });

        // Gyülekezet összes tagja betöltve – névpárosításhoz
        const { data: allMembers } = await _supabase.from('szemely')
            .select('id, csaladnev, k_nev')
            .eq('congregation_id', profile.congregation_id);

        function findMember(nev) {
            if (!nev || !allMembers) return null;
            const parts = nev.trim().split(/\s+/);
            if (parts.length < 2) return null;
            const cs = parts[0].toLowerCase();
            const kn = parts.slice(1).join(' ').toLowerCase();
            return allMembers.find(m =>
                m.csaladnev?.toLowerCase() === cs &&
                m.k_nev?.toLowerCase() === kn
            )?.id || null;
        }

        function parseDate(v) {
            if (!v) return null;
            if (!isNaN(v) && Number(v) > 10000) return new Date((Number(v) - (25567 + 1)) * 86400 * 1000).toISOString().split('T')[0];
            return v;
        }

        const records = [];
        let notFoundCount = 0;
        registryImportData.forEach(row => {
            const raw = {};
            for (const [col, field] of Object.entries(mapping)) {
                const v = row[col] !== undefined && row[col] !== null ? String(row[col]).trim() : null;
                if (v) raw[field] = v;
            }

            const datum = parseDate(raw['datum']);
            if (!datum && !raw['hdatum']) return;

            const rec = { congregation_id: profile.congregation_id, datum: datum };
            if (raw['lelkeszneve']) rec.lelkeszneve = raw['lelkeszneve'];
            if (raw['okirat']) rec.okirat = raw['okirat'];
            if (raw['megjegyzes']) rec.megjegyzes = raw['megjegyzes'];

            if (isHazassag) {
                rec.id_ferfi = raw['ferfi_nev'] ? findMember(raw['ferfi_nev']) : null;
                rec.id_no = raw['no_nev'] ? findMember(raw['no_nev']) : null;
                if (raw['tanuk']) rec.tanuk = raw['tanuk'];
                if (!rec.id_ferfi && !rec.id_no) notFoundCount++;
            } else {
                rec.id_szemely = raw['szemely_nev'] ? findMember(raw['szemely_nev']) : null;
                if (!rec.id_szemely) notFoundCount++;
                if (regType === 'keresztseg') {
                    if (raw['apa_neve']) rec.apaneve = raw['apa_neve'];
                    if (raw['anya_neve']) rec.anyaneve = raw['anya_neve'];
                } else if (regType === 'konfirmalas') {
                    if (raw['keresztelesideje']) rec.keresztelesideje = raw['keresztelesideje'];
                } else if (regType === 'temetes') {
                    if (raw['hdatum']) rec.hdatum = parseDate(raw['hdatum']);
                    else rec.hdatum = datum;
                    if (raw['hoka']) rec.hoka = raw['hoka'];
                    if (raw['tdatum']) rec.tdatum = parseDate(raw['tdatum']);
                }
            }
            records.push(rec);
        });

        if (records.length === 0) throw new Error("Nem találtunk érvényes anyakönyvi adatokat a fájlban!");

        if (notFoundCount > 0 && !confirm(`${records.length} bejegyzésből ${notFoundCount} személynév nem párosítható (néveltérés vagy hiányzó tag).\n\nFolytatja az importálást személyhivatkozás nélkül?`)) {
            throw new Error("Importálás megszakítva.");
        }

        const chunkSize = 500;
        for (let i = 0; i < records.length; i += chunkSize) {
            const { error } = await _supabase.from(regType).insert(records.slice(i, i + chunkSize));
            if (error) throw error;
        }

        const typeLabels = { keresztseg: 'Keresztelési', konfirmalas: 'Konfirmációs', hazassag: 'Házassági', temetes: 'Temetési' };
        const warnText = notFoundCount > 0 ? `\n(${notFoundCount} bejegyzés személyhivatkozás nélkül mentve)` : '';
        alert(`Sikeres importálás!\n${records.length} ${typeLabels[regType] || ''} anyakönyvi bejegyzés mentve!${warnText}`);
        bootstrap.Modal.getInstance(document.getElementById('modal-mass-import')).hide();
        document.getElementById('import-file-registry').value = '';
        document.getElementById('mapping-container-registry').classList.add('d-none');
        registryImportData = []; registryImportHeaders = [];
    } catch (err) {
        alert("HIBA AZ IMPORTÁLÁS SORÁN:\n" + err.message);
    } finally { btn.innerHTML = origHtml; btn.disabled = false; }
};