import supabase from './supabase.js';
import { checkAuthStatus } from './auth.js';

// Immediate authentication check at top-level
const session = await checkAuthStatus();
if (!session) {
    window.location.href = 'login.html';
}

// Data Storage
let data = {
    apartments: [],
    blocks: [],
    houses: [],
    tenants: [],
    payments: [],
    currentMonth: new Date().toISOString().slice(0, 7) // YYYY-MM format
};

function saveToLocalStorage() {
    localStorage.setItem('rent_mgmt_cache', JSON.stringify(data));
}

function loadFromLocalStorage() {
    const cached = localStorage.getItem('rent_mgmt_cache');
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            data = { ...data, ...parsed };
        } catch (e) { console.error("Error loading cache:", e); }
    }
}

// Switch tabs
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.getElementById(tabName).classList.add('active');
    if (typeof event !== 'undefined' && event.target) {
        event.target.classList.add('active');
    }
    
    // Refresh content when switching tabs
    refreshAllDropdowns();
    if (tabName === 'dashboard') displayDashboard();
    if (tabName === 'reports') generateReport();
    if (tabName === 'payments') {
        updateCurrentMonthDisplay();
        updatePaymentTenantSelect();
        displayPaymentHistory();
    }
    if (tabName === 'apartments') displayApartmentBlocks();
    if (tabName === 'houses') displayHouses();
    if (tabName === 'tenants') displayTenants();

    if (window.innerWidth <= 1024) {
        closeSidebar();
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('open');
}

function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    sidebar.classList.remove('open');
}

function displayDashboard() {
    // 1. Summary Stats
    const apartments = data.apartments.length;
    const blocks = data.blocks.length;
    const houses = data.houses.length;
    const occupied = data.houses.filter(h => h.is_occupied).length;
    const available = houses - occupied;
    const activeTenants = data.tenants.filter(t => t.is_active).length;
    
    const totalCollection = data.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalArrears = data.tenants.reduce((sum, t) => sum + Number(t.current_arrears || 0), 0);

    // Update UI counters
    document.getElementById('dashApartments').innerText = apartments;
    document.getElementById('dashBlocks').innerText = blocks;
    document.getElementById('dashHouses').innerText = houses;
    document.getElementById('dashOccupied').innerText = occupied;
    document.getElementById('dashAvailable').innerText = available;
    document.getElementById('dashTenants').innerText = activeTenants;
    document.getElementById('dashCollection').innerText = `KSH ${totalCollection.toLocaleString()}`;
    document.getElementById('dashArrears').innerText = `KSH ${totalArrears.toLocaleString()}`;

    // 2. Recent Payments Table
    const container = document.getElementById('dashPaymentHistory');
    if (!container) return;

    const recentPayments = [...data.payments]
        .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
        .slice(0, 10);

    let html = '<table><thead><tr><th>Tenant</th><th>Amount</th><th>Date</th><th>Type</th></tr></thead><tbody>';
    
    recentPayments.forEach(payment => {
        const tenant = data.tenants.find(t => t.id == payment.tenant_id);
        html += `<tr>
            <td>${tenant ? escapeHtml(tenant.name) : 'N/A'}</td>
            <td>KSH ${payment.amount.toLocaleString()}</td>
            <td>${payment.payment_date}</td>
            <td>${payment.type ? payment.type.replace('_', ' ') : 'N/A'}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    if (recentPayments.length === 0) {
        html = '<p class="empty-state">No payments recorded yet</p>';
    }
    container.innerHTML = html;
}

// Create Apartment
export async function createApartment() {
    const name = document.getElementById('apartmentName').value.trim();
    const location = document.getElementById('apartmentLocation').value.trim();
    
    if (!name) {
        alert('Please enter apartment name');
        return;
    }

    // Optimistic UI: Add temporary apartment immediately
    const tempId = 'temp-' + Date.now();
    const tempApt = { id: tempId, name, location, user_id: 'pending' };
    data.apartments.push(tempApt);
    saveToLocalStorage();
    displayApartmentBlocks();
    refreshAllDropdowns();

    const { data: { user } } = await supabase.auth.getUser();
    const { data: newApt, error } = await supabase
        .from('apartments')
        .insert([{ name, location, user_id: user.id }])
        .select()
        .single();

    if (error) {
        // Revert optimistic update on failure
        data.apartments = data.apartments.filter(a => a.id !== tempId);
        saveToLocalStorage();
        displayApartmentBlocks();
        refreshAllDropdowns();
        alert('Error creating apartment: ' + error.message);
        return;
    }
    
    // Replace temp record with official DB record
    const idx = data.apartments.findIndex(a => a.id === tempId);
    if (idx !== -1) data.apartments[idx] = newApt;
    saveToLocalStorage();
    
    document.getElementById('apartmentName').value = '';
    document.getElementById('apartmentLocation').value = '';
    
    refreshAllDropdowns();
    displayApartmentBlocks();
    alert('Apartment created successfully!');
}

// Create Block
export async function createBlock() {
    const apartmentId = document.getElementById('blockApartmentSelect').value;
    const blockName = document.getElementById('blockName').value.trim();
    
    if (!apartmentId || !blockName) {
        alert('Please select apartment and enter block name');
        return;
    }

    // Optimistic UI: Add temporary block
    const tempId = 'temp-' + Date.now();
    const tempBlock = { id: tempId, apartment_id: parseInt(apartmentId), name: blockName.toUpperCase() };
    data.blocks.push(tempBlock);
    saveToLocalStorage();
    displayApartmentBlocks();

    const { data: newBlock, error } = await supabase
        .from('blocks')
        .insert([{ 
            apartment_id: parseInt(apartmentId), 
            name: blockName.toUpperCase() 
        }])
        .select()
        .single();

    if (error) {
        data.blocks = data.blocks.filter(b => b.id !== tempId);
        saveToLocalStorage();
        displayApartmentBlocks();
        alert('Error creating block: ' + error.message);
        return;
    }
    
    const idx = data.blocks.findIndex(b => b.id === tempId);
    if (idx !== -1) data.blocks[idx] = newBlock;
    saveToLocalStorage();
    
    document.getElementById('blockName').value = '';
    refreshAllDropdowns();
    displayApartmentBlocks();
    alert('Block created successfully!');
}

// Create House
export async function createHouse() {
    const apartmentId = document.getElementById('houseApartmentSelect').value;
    const blockId = document.getElementById('houseBlockSelect').value;
    const numberOfHouses = parseInt(document.getElementById('numberOfHouses').value);
    const monthlyRent = document.getElementById('monthlyRent').value;
    
    if (!apartmentId || !blockId || !numberOfHouses || !monthlyRent) {
        alert('Please fill all fields');
        return;
    }
    
    if (numberOfHouses < 1 || numberOfHouses > 100) {
        alert('Please enter a number between 1 and 100');
        return;
    }
    
    // Get block name for house number generation
    const block = data.blocks.find(b => b.id == blockId);
    if (!block) {
        alert('Block not found');
        return;
    }
    
    // Create multiple houses
    const housesToCreate = [];
    for (let i = 1; i <= numberOfHouses; i++) {
        housesToCreate.push({
            apartment_id: parseInt(apartmentId),
            block_id: parseInt(blockId),
            house_number: `${block.name}${i}`,
            monthly_rent: parseFloat(monthlyRent),
            is_occupied: false
        });
    }
    
    const { data: newHouses, error } = await supabase
        .from('houses')
        .insert(housesToCreate)
        .select();

    if (error) {
        alert('Error creating houses: ' + error.message);
        return;
    }
    
    data.houses.push(...newHouses);
    
    document.getElementById('numberOfHouses').value = '';
    document.getElementById('monthlyRent').value = '';
    
    refreshAllDropdowns();
    displayHouses();
    alert(`${newHouses.length} houses created successfully!`);
}

// Add Tenant
export async function addTenant() {
    const houseId = document.getElementById('tenantHouseSelect').value;
    const name = document.getElementById('tenantName').value.trim();
    const phone = document.getElementById('tenantPhone').value.trim();
    const arrears = document.getElementById('tenantArrears').value;
    const moveInDate = document.getElementById('tenantMoveInDate').value;
    
    if (!houseId || !name || !phone) {
        alert('Please fill all required fields');
        return;
    }
    
    const house = data.houses.find(h => h.id == houseId);
    if (house?.is_occupied) {
        alert('This house is already occupied');
        return;
    }

    // Insert Tenant
    const { data: newTenant, error: tError } = await supabase
        .from('tenants')
        .insert([{
            house_id: parseInt(houseId),
            name: name,
            phone: phone,
            previous_arrears: parseFloat(arrears) || 0,
            current_arrears: parseFloat(arrears) || 0,
            move_in_date: moveInDate,
            is_active: true
        }])
        .select()
        .single();

    if (tError) {
        alert('Error adding tenant: ' + tError.message);
        return;
    }

    // Update House Status
    await supabase.from('houses').update({ is_occupied: true }).eq('id', houseId);
    if (house) house.is_occupied = true;
    
    data.tenants.push(newTenant);
    
    // Record initial arrears
    if (parseFloat(arrears) > 0) {
        const { data: newPayment } = await supabase
            .from('payments')
            .insert([{
                tenant_id: newTenant.id,
                amount: 0,
                arrears_before: parseFloat(arrears),
                arrears_after: parseFloat(arrears),
                month: data.currentMonth,
                type: 'initial_arrears',
                payment_date: moveInDate || new Date().toISOString().split('T')[0],
                note: 'Previous arrears'
            }])
            .select()
            .single();
        if (newPayment) data.payments.push(newPayment);
    }
    
    document.getElementById('tenantName').value = '';
    document.getElementById('tenantPhone').value = '';
    document.getElementById('tenantArrears').value = '0';
    document.getElementById('tenantMoveInDate').value = '';
    
    refreshAllDropdowns();
    displayTenants();
    displayHouses();
    alert('Tenant added successfully!');
}

// Record Payment
export async function recordPayment() {
    const tenantId = document.getElementById('paymentTenantSelect').value;
    const amount = document.getElementById('paymentAmount').value;
    const paymentDate = document.getElementById('paymentDate').value;
    
    if (!tenantId || !amount || !paymentDate) {
        alert('Please fill all fields');
        return;
    }
    
    const tenant = data.tenants.find(t => t.id == tenantId);
    const house = data.houses.find(h => h.id == tenant?.house_id);
    if (!tenant || !house) return;
    
    const paymentAmount = parseFloat(amount);
    const monthlyRent = parseFloat(house.monthly_rent);
    const arrearsBefore = tenant.current_arrears;
    const arrearsAfter = arrearsBefore - paymentAmount;

    // Optimistic UI: Update tenant balance and add pending payment
    const tempId = 'temp-' + Date.now();
    const oldArrears = tenant.current_arrears;
    const tempPayment = { 
        id: tempId, tenant_id: parseInt(tenantId), amount: paymentAmount, 
        month: data.currentMonth, type: 'rent_payment', payment_date: paymentDate, note: 'Processing...' 
    };
    tenant.current_arrears = arrearsAfter;
    data.payments.push(tempPayment);
    saveToLocalStorage();
    displayPaymentHistory();
    updatePaymentInfo();
    
    const { data: newPayment, error: pError } = await supabase
        .from('payments')
        .insert([{
            tenant_id: parseInt(tenantId),
            amount: paymentAmount,
            arrears_before: arrearsBefore,
            arrears_after: arrearsAfter,
            month: data.currentMonth,
            type: 'rent_payment',
            payment_date: paymentDate,
            note: paymentAmount >= monthlyRent ? 'Full Payment' : 'Partial Payment'
        }])
        .select()
        .single();

    if (pError) {
        // Revert on failure
        tenant.current_arrears = oldArrears;
        data.payments = data.payments.filter(p => p.id !== tempId);
        saveToLocalStorage();
        displayPaymentHistory();
        updatePaymentInfo();
        alert('Error recording payment: ' + pError.message);
        return;
    }

    await supabase.from('tenants').update({ current_arrears: arrearsAfter }).eq('id', tenantId);
    
    const idx = data.payments.findIndex(p => p.id === tempId);
    if (idx !== -1) data.payments[idx] = newPayment;
    saveToLocalStorage();
    
    document.getElementById('paymentAmount').value = '';
    updatePaymentTenantSelect();
    displayPaymentHistory();
    updatePaymentInfo();
    alert('Payment recorded successfully!');
}

// Vacate Tenant
export async function vacateTenant(tenantId) {
    if (!confirm('Are you sure you want to mark this tenant as vacated? The house will become available.')) {
        return;
    }

    const tenant = data.tenants.find(t => t.id == tenantId);
    if (!tenant) return;

    const houseId = tenant.house_id;

    // Update tenant status in Supabase
    const { error: tError } = await supabase
        .from('tenants')
        .update({ is_active: false })
        .eq('id', tenantId);

    if (tError) {
        alert('Error vacating tenant: ' + tError.message);
        return;
    }

    // Make the house available in Supabase
    const { error: hError } = await supabase
        .from('houses')
        .update({ is_occupied: false })
        .eq('id', houseId);

    if (hError) {
        console.error('Error updating house status:', hError.message);
    }

    // Update local data
    tenant.is_active = false;
    const house = data.houses.find(h => h.id == houseId);
    if (house) house.is_occupied = false;

    saveToLocalStorage();
    displayTenants();
    displayHouses();
    displayDashboard();
    refreshAllDropdowns();
    alert('Tenant vacated successfully. The house is now available for new tenants.');
}

// Reset Monthly Cycle
export async function resetMonthlyCycle() {
    if (!confirm('Are you sure you want to start a new month? This will add current month\'s rent to all tenants.')) {
        return;
    }
    
    const today = new Date();
    const newMonth = today.toISOString().slice(0, 7);
    
    if (newMonth === data.currentMonth) {
        alert('Already in current month');
        return;
    }

    const { error: cError } = await supabase.from('rent_cycles').insert([{ month: newMonth }]);
    if (cError && cError.code !== '23505') {
        alert('Error updating month cycle: ' + cError.message);
        return;
    }
    
    const updates = data.tenants
        .filter(t => t.is_active)
        .map(tenant => {
            const house = data.houses.find(h => h.id == tenant.house_id);
            return {
                ...tenant,
                current_arrears: tenant.current_arrears + (house ? parseFloat(house.monthly_rent) : 0)
            };
        });

    if (updates.length > 0) {
        const { error: tError } = await supabase.from('tenants').upsert(updates);
        if (tError) {
            alert('Error updating tenant arrears: ' + tError.message);
            return;
        }
    }
    
    data.currentMonth = newMonth;
    await window.loadInitialData();
    
    updateCurrentMonthDisplay();
    displayPaymentHistory();
    updatePaymentTenantSelect();
    alert('Month cycle updated to ' + newMonth);
}

// Helper Functions
function refreshAllDropdowns() {
    // Apartment dropdowns
    const apartmentSelects = [
        'blockApartmentSelect',
        'houseApartmentSelect',
        'tenantApartmentSelect',
        'houseFilterApartment',
        'reportApartmentSelect'
    ];
    
    apartmentSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Choose apartment...</option>';
            data.apartments.forEach(apt => {
                select.innerHTML += `<option value="${apt.id}">${escapeHtml(apt.name)}</option>`;
            });
        }
    });
    
    updatePaymentTenantSelect();
}

function loadBlocks(selectId, apartmentId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = '<option value="">Choose block...</option>';
    if (apartmentId) {
        const blocks = data.blocks.filter(b => b.apartment_id == apartmentId);
        blocks.forEach(block => {
            select.innerHTML += `<option value="${block.id}">Block ${escapeHtml(block.name)}</option>`;
        });
    }
}

function loadHouses(selectId, apartmentId, blockId = null) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = '<option value="">Choose house...</option>';
    if (apartmentId) {
        let houses = data.houses.filter(h => h.apartment_id == apartmentId);
        if (blockId) {
            houses = houses.filter(h => h.block_id == blockId);
        }
        houses.forEach(house => {
            const block = data.blocks.find(b => b.id == house.block_id);
            select.innerHTML += `<option value="${house.id}">${block ? 'Block ' + escapeHtml(block.name) + ' - ' : ''}${escapeHtml(house.house_number)} (${house.monthly_rent} KSH) ${house.is_occupied ? '✓ Occupied' : 'Available'}</option>`;
        });
    }
}

function filterHousesByBlock(selectId, apartmentId, blockId) {
    loadHouses(selectId, apartmentId, blockId);
}

function updatePaymentTenantSelect() {
    const select = document.getElementById('paymentTenantSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">Choose tenant...</option>';
    data.tenants.forEach(tenant => {
        if (tenant.is_active) {
            const house = data.houses.find(h => h.id == tenant.house_id);
            if (house) {
                const block = data.blocks.find(b => b.id == house.block_id);
                const apartment = data.apartments.find(a => a.id == house.apartment_id);
                select.innerHTML += `<option value="${tenant.id}">${escapeHtml(tenant.name)} - ${apartment ? escapeHtml(apartment.name) : ''} Block ${block ? escapeHtml(block.name) : ''} ${escapeHtml(house.house_number)}</option>`;
            }
        }
    });
}

function updatePaymentInfo() {
    const tenantId = document.getElementById('paymentTenantSelect').value;
    if (!tenantId) {
        document.getElementById('paymentHouseInfo').value = '';
        document.getElementById('paymentMonthlyRent').value = '';
        document.getElementById('paymentArrears').value = '';
        return;
    }
    
    const tenant = data.tenants.find(t => t.id == tenantId);
    if (tenant) {
        const house = data.houses.find(h => h.id == tenant.house_id);
        if (house) {
            const block = data.blocks.find(b => b.id == house.block_id);
            const apartment = data.apartments.find(a => a.id == house.apartment_id);
            document.getElementById('paymentHouseInfo').value = `${apartment?.name} - Block ${block?.name} - ${house.house_number}`;
            document.getElementById('paymentMonthlyRent').value = `${house.monthly_rent} KSH`;
            document.getElementById('paymentArrears').value = `${tenant.current_arrears} KSH`;
        }
    }
}

function updateCurrentMonthDisplay() {
    const display = document.getElementById('currentMonthDisplay');
    if (display) {
        display.textContent = data.currentMonth;
    }
}

// Display Functions
function displayApartmentBlocks() {
    const container = document.getElementById('apartmentBlocksList');
    if (!container) return;
    
    let html = '';
    data.apartments.forEach(apt => {
        html += `<div class="apartment-panel">`;
        html += `<h3>${escapeHtml(apt.name)}</h3>`;
        if (apt.location) html += `<p>${escapeHtml(apt.location)}</p>`;
        
        const blocks = data.blocks.filter(b => b.apartment_id == apt.id);
        if (blocks.length > 0) {
            html += `<div class="block-list"><strong>Blocks:</strong> `;
            blocks.forEach(block => {
                const housesCount = data.houses.filter(h => h.block_id == block.id).length;
                html += `<span class="block-pill">Block ${escapeHtml(block.name)} (${housesCount} houses)</span>`;
            });
            html += `</div>`;
        } else {
            html += `<p class="empty-state">No blocks created yet</p>`;
        }
        
        html += `</div>`;
    });
    
    container.innerHTML = html || '<p>No apartments created yet</p>';
}

function displayHouses() {
    const container = document.getElementById('housesList');
    if (!container) return;
    
    const filterApartment = document.getElementById('houseFilterApartment')?.value;
    
    let houses = data.houses;
    if (filterApartment) {
        houses = houses.filter(h => h.apartment_id == filterApartment);
    }
    
    let html = '<table><thead><tr><th>House</th><th>Block</th><th>Apartment</th><th>Rent</th><th>Status</th></tr></thead><tbody>';
    
    houses.forEach(house => {
        const block = data.blocks.find(b => b.id == house.block_id);
        const apartment = data.apartments.find(a => a.id == house.apartment_id);
        html += `<tr>
            <td>${escapeHtml(house.house_number)}</td>
            <td>Block ${block ? escapeHtml(block.name) : 'N/A'}</td>
            <td>${apartment ? escapeHtml(apartment.name) : 'N/A'}</td>
            <td>${house.monthly_rent} KSH</td>
            <td class="${house.is_occupied ? 'status-paid' : 'status-pending'}">${house.is_occupied ? 'Occupied' : 'Available'}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function displayTenants() {
    const container = document.getElementById('tenantsList');
    if (!container) return;
    
    let html = '<table><thead><tr><th>Tenant</th><th>House</th><th>Phone</th><th>Arrears</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    
    data.tenants.forEach(tenant => {
        const house = data.houses.find(h => h.id == tenant.house_id);
        if (house) {
            const block = data.blocks.find(b => b.id == house.block_id);
            const apartment = data.apartments.find(a => a.id == house.apartment_id);
            html += `<tr>
                <td>${escapeHtml(tenant.name)}</td>
                <td>${apartment?.name} - Block ${block?.name} - ${house.house_number}</td>
                <td>${escapeHtml(tenant.phone)}</td>
                <td class="${tenant.current_arrears > 0 ? 'status-pending' : 'status-paid'}">${tenant.current_arrears} KSH</td>
                <td><span class="${tenant.is_active ? 'status-paid' : 'status-pending'}">${tenant.is_active ? 'Active' : 'Vacated'}</span></td>
                <td>
                    ${tenant.is_active ? `<button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.85rem;" onclick="vacateTenant(${tenant.id})">Vacate</button>` : ''}
                </td>
            </tr>`;
        }
    });
    
    html += '</tbody></table>';
    container.innerHTML = html || '<p>No tenants registered yet</p>';
}

function displayPaymentHistory() {
    const container = document.getElementById('paymentHistory');
    if (!container) return;
    
    const currentMonthPayments = data.payments.filter(p => p.month === data.currentMonth);
    
    let html = '<table><thead><tr><th>Date</th><th>Tenant</th><th>Amount</th><th>Type</th><th>Note</th></tr></thead><tbody>';
    
    currentMonthPayments.forEach(payment => {
        const tenant = data.tenants.find(t => t.id == payment.tenant_id);
        html += `<tr>
            <td>${payment.payment_date}</td>
            <td>${tenant ? escapeHtml(tenant.name) : 'N/A'}</td>
            <td>${payment.amount} KSH</td>
            <td>${payment.type}</td>
            <td>${escapeHtml(payment.note || '')}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html || '<p>No payments this month</p>';
}

function generateReport() {
    const apartmentId = document.getElementById('reportApartmentSelect')?.value;
    const container = document.getElementById('reportTable');
    if (!container) return;
    
    // Update summary
    document.getElementById('totalHouses').textContent = data.houses.length;
    document.getElementById('totalTenants').textContent = data.tenants.filter(t => t.is_active).length;
    
    const currentMonthPayments = data.payments.filter(p => p.month === data.currentMonth);
    const totalCollection = currentMonthPayments.reduce((sum, p) => sum + p.amount, 0);
    document.getElementById('monthlyCollection').textContent = totalCollection + ' KSH';
    
    let tenants = data.tenants;
    if (apartmentId) {
        tenants = tenants.filter(t => {
            const house = data.houses.find(h => h.id == t.house_id);
            return house && house.apartment_id == apartmentId;
        });
    }
    
    let html = '<table><thead><tr><th>Tenant</th><th>House</th><th>Monthly Rent</th><th>Previous Arrears</th><th>Current Arrears</th><th>Status</th></tr></thead><tbody>';
    
    tenants.forEach(tenant => {
        const house = data.houses.find(h => h.id == tenant.house_id);
        if (house) {
            const block = data.blocks.find(b => b.id == house.block_id);
            const apartment = data.apartments.find(a => a.id == house.apartment_id);
            const status = tenant.current_arrears === 0 ? 'Paid' : tenant.current_arrears > parseFloat(house.monthly_rent) ? 'Overdue' : 'Partial';
            
            html += `<tr>
                <td>${escapeHtml(tenant.name)}</td>
                <td>${apartment?.name} - Block ${block?.name} - ${house.house_number}</td>
                <td>${house.monthly_rent} KSH</td>
                <td>${tenant.previous_arrears} KSH</td>
                <td class="${status === 'Paid' ? 'status-paid' : status === 'Overdue' ? 'status-pending' : 'status-partial'}">${tenant.current_arrears} KSH</td>
                <td class="${status === 'Paid' ? 'status-paid' : status === 'Overdue' ? 'status-pending' : 'status-partial'}">${status}</td>
            </tr>`;
        }
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// Export to Excel
function exportToExcel() {
    const apartmentId = document.getElementById('reportApartmentSelect')?.value;
    
    let tenants = data.tenants;
    if (apartmentId) {
        tenants = tenants.filter(t => {
            const house = data.houses.find(h => h.id == t.house_id);
            return house && house.apartment_id == apartmentId;
        });
    }
    
    const exportData = tenants.map(tenant => {
        const house = data.houses.find(h => h.id == tenant.house_id);
        const block = data.blocks.find(b => b.id == house?.block_id);
        const apartment = data.apartments.find(a => a.id == house?.apartment_id);
        
        return {
            'Tenant Name': tenant.name,
            'Phone': tenant.phone,
            'Apartment': apartment?.name || '',
            'Block': block?.name || '',
            'House Number': house?.house_number || '',
            'Monthly Rent': house?.monthly_rent || 0,
            'Previous Arrears': tenant.previous_arrears,
            'Current Arrears': tenant.current_arrears,
            'Status': tenant.currentArrears === 0 ? 'Paid' : 'Pending',
            'Move-in Date': tenant.move_in_date
        };
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rent Report");
    
    const fileName = `Rent_Report_${data.currentMonth}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

window.loadInitialData = async function() {
    const { data: apartments } = await supabase.from('apartments').select('*');
    const { data: blocks } = await supabase.from('blocks').select('*');
    const { data: houses } = await supabase.from('houses').select('*');
    const { data: tenants } = await supabase.from('tenants').select('*');
    const { data: payments } = await supabase.from('payments').select('*');
    const { data: cycles } = await supabase.from('rent_cycles').select('month').order('created_at', { ascending: false });

    data.apartments = apartments || [];
    data.blocks = blocks || [];
    data.houses = houses || [];
    data.tenants = tenants || [];
    data.payments = payments || [];
    if (cycles && cycles.length > 0) data.currentMonth = cycles[0].month;
    saveToLocalStorage();
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
}

// Initialize
// Reveal UI only after auth is confirmed
const shell = document.querySelector('.app-shell');
if (shell) shell.style.display = 'grid';

// Load from cache first for instant UI response (Optimistic UI)
loadFromLocalStorage();
refreshAllDropdowns();
displayApartmentBlocks();
displayDashboard();
updateCurrentMonthDisplay();

// Then fetch fresh data from Supabase to sync
await window.loadInitialData();
refreshAllDropdowns();
updateCurrentMonthDisplay();
displayDashboard();
displayApartmentBlocks();

// Set default payment date to today
const paymentDateInput = document.getElementById('paymentDate');
if (paymentDateInput) {
    paymentDateInput.value = new Date().toISOString().split('T')[0];
}

// Check month cycle
const today = new Date();
const currentMonth = today.toISOString().slice(0, 7);
if (currentMonth !== data.currentMonth && data.tenants.length > 0) {
    if (confirm('New month detected. Would you like to update the rent cycle?')) {
        resetMonthlyCycle();
    }
}

// Expose functions to global scope for HTML event listeners
Object.assign(window, {
    switchTab,
    toggleSidebar,
    createApartment,
    createBlock,
    createHouse,
    addTenant,
    recordPayment,
    vacateTenant,
    resetMonthlyCycle,
    loadBlocks,
    loadHouses,
    filterHousesByBlock,
    updatePaymentInfo,
    generateReport,
    exportToExcel,
    displayHouses
});
