// --- js/penzugy_monetar.js ---
function initMonetar(softwareBalance) {
    const cimletek = [500, 200, 100, 50, 20, 10, 5, 1, 0.5, 0.1, 0.05, 0.01];
    const tbody = document.getElementById('monetar-body');
    if (!tbody) return;
    
    tbody.innerHTML = cimletek.map(c => `<tr>
        <td class="fw-bold align-middle">${c.toFixed(2)} RON</td>
        <td><input type="number" min="0" class="form-control text-center monetar-input" data-val="${c}" value="0" oninput="calculateMonetar()"></td>
        <td class="text-end fw-bold align-middle text-primary" id="sum-${c}">0.00 RON</td>
    </tr>`).join('');
    
    document.getElementById('monetar-software-balance-info').innerText = "Szoftver szerint: " + softwareBalance.toFixed(2) + " RON";
    window.currentSoftBal = softwareBalance;
    calculateMonetar();
}

function calculateMonetar() {
    let physicalTotal = 0;
    document.querySelectorAll('.monetar-input').forEach(input => {
        const val = parseFloat(input.dataset.val);
        const qty = parseInt(input.value) || 0;
        const sum = val * qty;
        document.getElementById(`sum-${val}`).innerText = sum.toFixed(2) + " RON";
        physicalTotal += sum;
    });
    
    document.getElementById('monetar-physical-total').innerText = "Fizikai: " + physicalTotal.toFixed(2) + " RON";
    const diff = physicalTotal - window.currentSoftBal;
    const diffEl = document.getElementById('monetar-diff');
    
    diffEl.innerText = (diff > 0 ? '+' : '') + diff.toFixed(2) + ' RON';
    diffEl.className = "mb-0 fw-bold " + (Math.abs(diff) < 0.01 ? "text-success" : (diff < 0 ? "text-danger" : "text-warning"));
}