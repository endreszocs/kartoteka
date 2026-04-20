let allStreets = [], allLocalities = [], memberPool = [];

async function loadLookupData() {
    try {
        console.log("Segédadatok betöltése...");

        const [utcak, helyek, tagok] = await Promise.all([
            _supabase.from('adrstreet').select('id, name'),
            _supabase.from('adrlocality').select('id, name'),
            _supabase.from('szemely').select('id, csaladnev, k_nev, ferfi, cnp').eq('meghalt', false)
        ]);

        // Utcák betöltése (Biztonsági ellenőrzéssel)
        allStreets = utcak.data || [];
        const streetEl = document.getElementById('street-list');
        if (streetEl) streetEl.innerHTML = allStreets.map(u => `<option value="${u.name}">`).join('');

        // Helységek betöltése
        allLocalities = helyek.data || [];
        const locEl = document.getElementById('locality-list');
        if (locEl) locEl.innerHTML = allLocalities.map(h => `<option value="${h.name}">`).join('');

        // Személyek betöltése a szülők listájához
        memberPool = tagok.data || [];
        const format = (p) => `${p.csaladnev} ${p.k_nev}`;
        
        const fatherEl = document.getElementById('father-list');
        if (fatherEl) fatherEl.innerHTML = memberPool.filter(p => p.ferfi).map(p => `<option value="${format(p)}">`).join('');

        const motherEl = document.getElementById('mother-list');
        if (motherEl) motherEl.innerHTML = memberPool.filter(p => !p.ferfi).map(p => `<option value="${format(p)}">`).join('');

    } catch (err) {
        console.error("Lookup hiba:", err.message);
    }
}

function syncParentId(type) {
    const nameInput = document.getElementById(`m-${type}-name`);
    if (!nameInput) return; // Ha nincs ilyen mező, kilépünk
    
    const val = nameInput.value;
    const found = memberPool.find(m => `${m.csaladnev} ${m.k_nev}` === val);
    const idField = document.getElementById(`m-id_${type === 'father' ? 'apja' : 'anyja'}`);
    if (idField) idField.value = found ? found.cnp : "";
}

function setupLookupListeners() {
    ['father', 'mother'].forEach(type => {
        const input = document.getElementById(`m-${type}-name`);
        // Csak akkor rakunk rá figyelőt, ha az elem létezik!
        if (input) input.addEventListener('input', () => syncParentId(type));
    });
}

// ==========================================
// ÚJ: TELEPÜLÉS ÉS UTCA OKOS-KERESŐ (MENTÉSHEZ)
// ==========================================

window.getOrCreateLocality = async function(name) {
    if (!name) return null;
    const searchName = name.trim().toLowerCase();
    
    // 1. Keresés a már betöltött memóriában
    const found = allLocalities.find(l => l.name.toLowerCase() === searchName);
    if (found) return found.id;
    
    // 2. HA NINCS MEG: Rákérdez a létrehozásra!
    const confirmSave = confirm(`A(z) "${name}" település még nem szerepel az adatbázisban. Szeretné most létrehozni és elmenteni?`);
    if (!confirmSave) throw new Error("Település mentése megszakítva a felhasználó által.");

    // 3. MEGYE (County) KERESÉSE: Mivel kötelező a megye, "kölcsönkérjük" egy meglévő település megyekódját!
    const { data: fallbackLoc } = await _supabase.from('adrlocality').select('countyid').limit(1);
    const defaultCountyId = (fallbackLoc && fallbackLoc.length > 0) ? fallbackLoc[0].countyid : 1;

    // 4. Létrehozzuk az új települést a Supabase-ben!
    const { data, error } = await _supabase.from('adrlocality').insert([{
        name: name.trim(),
        countyid: defaultCountyId,
        usagecnt: 1
    }]).select().single();

    if (error) {
        alert("Hiba az új település mentésekor: " + error.message);
        throw error;
    }

    // 5. Hozzáadjuk a helyi memóriához, hogy a legördülő menü azonnal frissüljön!
    allLocalities.push(data);
    const locEls = document.querySelectorAll('datalist#locality-list');
    locEls.forEach(el => {
        el.innerHTML = allLocalities.map(h => `<option value="${h.name}">`).join('');
    });

    return data.id; // Visszaadjuk az új település ID-ját a tagnak!
};

window.getOrCreateStreet = async function(name, localityId) {
    if (!name) return null;
    const searchName = name.trim().toLowerCase();
    
    const found = allStreets.find(s => s.name.toLowerCase() === searchName);
    if (found) return found.id;
    
    // HA NEM TALÁLTA MEG: Rákérdez a létrehozásra!
    const confirmSave = confirm(`A(z) "${name}" utca még nem szerepel az adatbázisban. Szeretné most létrehozni és elmenteni?`);
    if (!confirmSave) throw new Error("Utca mentése megszakítva a felhasználó által.");

    if (!localityId) {
        alert("Hiba: Nem tudjuk, melyik településhez tartozik az utca! Kérem, előbb adjon meg egy érvényes települést!");
        throw new Error("Hiányzó település ID az utca mentéséhez");
    }

    // 1. Létrehozzuk az új utcát a Supabase-ben, hozzákötve a településhez!
    const { data, error } = await _supabase.from('adrstreet').insert([{
        name: name.trim(),
        localityid: localityId,
        usagecnt: 1
    }]).select().single();

    if (error) {
        alert("Hiba az új utca mentésekor: " + error.message);
        throw error;
    }

    // 2. Hozzáadjuk a helyi memóriához, hogy a legördülő menü azonnal frissüljön!
    allStreets.push(data);
    const streetEl = document.getElementById('street-list');
    if (streetEl) streetEl.innerHTML = allStreets.map(u => `<option value="${u.name}">`).join('');

    return data.id; // Visszaadjuk az új utca ID-ját a tagnak!
};