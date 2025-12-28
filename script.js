// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBHRri-xYrfFPrE13AvAlxeamNjUfgQFrU",
  authDomain: "mahavir-sales.firebaseapp.com",
  projectId: "mahavir-sales",
  storageBucket: "mahavir-sales.firebasestorage.app",
  messagingSenderId: "21443607416",
  appId: "1:21443607416:web:3a94c030e1edd4330ca68d"
};

// --- FIREBASE INITIALIZATION ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let shopDataRef; // Points to the main document (Stock & Settings)
let unsubStock, unsubSales, unsubRepairs, unsubRecharges; // Listeners

// --- STATE MANAGEMENT ---
let stock = [];
let categories = [];
let salesLog = [];
let repairLog = [];
let rechargeLog = [];
let currentSale = [];
let selectedProductForSale = null;
let apiKey = '';
let productForPriceEntry = null;
let currentActivePage = 'homepage'; 
let editingItemId = null; 
let updateInfo = null; 

// --- APP STARTUP & AUTHENTICATION ---
document.addEventListener('DOMContentLoaded', () => {
    updateClock(); 
    setInterval(updateClock, 1000); 

    const loginBtn = document.getElementById('login_button');
    const signupBtn = document.getElementById('signup_button');
    const logoutBtn = document.getElementById('logout_button');

    if(loginBtn) loginBtn.addEventListener('click', handleLogin);
    if(signupBtn) signupBtn.addEventListener('click', handleSignup);
    if(logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    auth.onAuthStateChanged(user => {
        if (user) {
            document.getElementById('user_email_display').textContent = user.email;
            
            // Set up references
            shopDataRef = db.collection('shops').doc(user.uid);
            
            // Start listening to the "Folders"
            initializeAppAndListen(user.uid);

            document.getElementById('main_app_container').classList.remove('hidden');
            document.getElementById('auth_container').classList.add('hidden');
            document.getElementById('loading_container').classList.add('hidden');
        } else {
            // Unsubscribe from all listeners when logging out
            if (unsubStock) unsubStock();
            if (unsubSales) unsubSales();
            if (unsubRepairs) unsubRepairs();
            if (unsubRecharges) unsubRecharges();

            stock = []; categories = []; salesLog = []; repairLog = []; rechargeLog = []; apiKey = '';
            document.getElementById('main_app_container').classList.add('hidden');
            document.getElementById('auth_container').classList.remove('hidden');
            document.getElementById('loading_container').classList.add('hidden');
        }
    });

    const barcodeInput = document.getElementById('barcode_scan_input');
    if (barcodeInput) {
        barcodeInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleBarcodeScan();
            }
        });
    }
    
    // Check for updates logic (kept simple for now)
    if (window.electronAPI) {
        window.electronAPI.onUpdateNotAvailable(() => {
            showStatus('update_check_status', 'You are on the latest version.', false);
        });
    }
});

function handleLogin() {
    const email = document.getElementById('auth_email').value;
    const password = document.getElementById('auth_password').value;
    document.getElementById('auth_error').textContent = '';
    auth.signInWithEmailAndPassword(email, password)
        .catch(error => document.getElementById('auth_error').textContent = error.message);
}

function handleSignup() {
    const email = document.getElementById('auth_email').value;
    const password = document.getElementById('auth_password').value;
    document.getElementById('auth_error').textContent = '';
    auth.createUserWithEmailAndPassword(email, password)
        .catch(error => document.getElementById('auth_error').textContent = error.message);
}

function handleLogout() {
    auth.signOut();
}

// --- NEW DATA STRUCTURE INITIALIZATION ---
async function initializeAppAndListen(userId) {
    // 1. Check if the Main Document exists, if not create it
    const doc = await shopDataRef.get();
    if (!doc.exists) {
        await shopDataRef.set({
            stock: [],
            apiKey: '',
            categories: ["Mobile Accessory", "Repair Part", "SIM Card", "Speakers", "Buds", "Earphones", "Other"]
        });
    }

    // 2. Listener for Main Document (Stock & Categories)
    unsubStock = shopDataRef.onSnapshot(snapshot => {
        const data = snapshot.data();
        if(data) {
            stock = data.stock || [];
            apiKey = data.apiKey || '';
            categories = data.categories || ["Mobile Accessory", "Repair Part", "Other"];
            navigate(currentActivePage); // Refresh UI
        }
    });

    // 3. Listener for SALES Sub-collection
    unsubSales = shopDataRef.collection('sales').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        salesLog = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(currentActivePage === 'sales_details' || currentActivePage === 'homepage') navigate(currentActivePage);
    });

    // 4. Listener for REPAIRS Sub-collection
    unsubRepairs = shopDataRef.collection('repairs').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        repairLog = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(currentActivePage === 'repair_details') navigate(currentActivePage);
    });

    // 5. Listener for RECHARGES Sub-collection
    unsubRecharges = shopDataRef.collection('recharges').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        rechargeLog = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(currentActivePage === 'recharge_details') navigate(currentActivePage);
    });
}

// --- OPTIMIZED SAVING FUNCTION (FIXED) ---

// Only saves Stock and Categories (Main Document)
async function saveMainData() {
    if (!shopDataRef) return;
    try {
        // FIXED: Using .set with merge:true instead of .update
        // This ensures data is saved even if the document was missing
        await shopDataRef.set({ stock, categories, apiKey }, { merge: true });
    } catch (error) {
        console.error("Error saving main data:", error);
        alert("Error Saving Data: " + error.message);
    }
}

// --- NAVIGATION ---
function navigate(pageId) {
    currentActivePage = pageId;
    document.querySelectorAll('.page-content').forEach(page => page.classList.add('hidden'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.remove('hidden');

    document.querySelectorAll('.sidebar-btn').forEach(btn => btn.classList.remove('active'));
    const activeButton = document.querySelector(`.sidebar-btn[onclick="navigate('${pageId}')"]`);
    if(activeButton) activeButton.classList.add('active');

    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();

    switch(pageId) {
        case 'homepage': renderHomepage(); break;
        case 'add_stock': renderCategoryDropdowns(); break;
        case 'check_inventory': renderCategoryDropdowns(); renderInventory(); break;
        case 'record_sale': 
            if(document.getElementById('barcode_scan_input')) document.getElementById('barcode_scan_input').focus();
            break;
        case 'sales_details':
            document.getElementById('sales_start_date').value = today;
            document.getElementById('sales_end_date').value = today;
            renderSalesDetails();
            break;
        case 'repair_details':
             document.getElementById('repair_start_date').value = today;
             document.getElementById('repair_end_date').value = today;
             renderRepairDetails();
             break;
        case 'recharge_details':
             document.getElementById('recharge_start_date').value = today;
             document.getElementById('recharge_end_date').value = today;
             renderRechargeDetails();
             break;
        case 'reports':
            document.getElementById('report_month_year').value = currentYear;
            document.getElementById('report_year').value = currentYear;
            document.getElementById('ai_summary_container').classList.add('hidden');
            break;
        case 'settings':
            document.getElementById('api_key_input').value = apiKey;
            break;
    }
}

// --- HOMEPAGE ---
function renderHomepage() {
    const today = new Date().toISOString().split('T')[0];
    const todaysSales = salesLog.filter(s => s.timestamp.startsWith(today));
    
    const todayRevenue = todaysSales.reduce((sum, sale) => sum + sale.total, 0);
    const todayProfit = todaysSales.reduce((sum, sale) => sum + sale.profit, 0);

    document.getElementById('today_revenue').textContent = formatCurrency(todayRevenue);
    document.getElementById('today_profit').textContent = formatCurrency(todayProfit);
    
    const lowStockItems = stock.filter(item => item.quantity <= 5);
    const lowStockList = document.getElementById('low_stock_list');
    lowStockList.innerHTML = '';
    if (lowStockItems.length > 0) {
        lowStockItems.forEach(item => {
            lowStockList.innerHTML += `<p class="text-gray-300 p-2 bg-gray-700 rounded-md mb-2">${item.name} - <span class="font-bold">${item.quantity} left</span></p>`;
        });
    } else {
        lowStockList.innerHTML = '<p class="text-gray-400">No low stock items. Great job!</p>';
    }
}

// --- UTILITY ---
function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString();
}
function showStatus(elementId, message, isError = false) {
    const el = document.getElementById(elementId);
    if(!el) return;
    el.textContent = message;
    el.className = `h-6 text-center ${isError ? 'text-red-400' : 'text-green-400'}`;
    setTimeout(() => { if(el) el.textContent = ''; }, 4000);
}
function formatCurrency(amount) { return `₹${Number(amount || 0).toFixed(2)}`; }
function formatCurrencyForPDF(amount) { return `Rs. ${Number(amount || 0).toFixed(2)}`; }

function showConfirmModal(text, onConfirm) {
    const modal = document.getElementById('confirm_modal');
    modal.querySelector('#confirm_modal_text').textContent = text;
    const oldYesButton = modal.querySelector('#confirm_modal_yes');
    const newYesButton = oldYesButton.cloneNode(true);
    oldYesButton.parentNode.replaceChild(newYesButton, oldYesButton);
    newYesButton.textContent = "Yes";
    newYesButton.className = "bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-6 rounded-md";
    newYesButton.addEventListener('click', () => { onConfirm(); closeConfirmModal(); });
    modal.classList.add('flex');
}
function closeConfirmModal(){ document.getElementById('confirm_modal').classList.remove('flex'); }

// --- CATEGORIES (FIXED) ---
async function addCategory() {
    const input = document.getElementById('new_category_name');
    const newCat = input.value.trim();
    if (newCat && !categories.find(c => c.toLowerCase() === newCat.toLowerCase())) {
        categories.push(newCat);
        await saveMainData(); // Update Main Doc
        input.value = '';
        renderCategoryList(); 
        renderCategoryDropdowns(); // FIXED: Updates dropdowns immediately
    }
}
function removeCategory(catToRemove) {
    showConfirmModal(`Remove category "${catToRemove}"?`, async () => {
        categories = categories.filter(c => c !== catToRemove);
        await saveMainData();
        renderCategoryList();
        renderCategoryDropdowns(); // FIXED: Updates dropdowns immediately
    });
}
function removeAllCategories() {
    showConfirmModal("Remove all categories?", async () => {
        categories = ["Other"];
        await saveMainData();
        renderCategoryList();
        renderCategoryDropdowns(); // FIXED: Updates dropdowns immediately
    });
}
function openCategoryManager() { renderCategoryList(); document.getElementById('category_manager_modal').classList.add('flex'); }
function closeCategoryManager() { document.getElementById('category_manager_modal').classList.remove('flex'); }
function renderCategoryList() {
    const listEl = document.getElementById('category_list');
    listEl.innerHTML = categories.map(cat => `<div class="flex justify-between items-center bg-gray-700 p-2 rounded"><span>${cat}</span><button onclick="removeCategory('${cat}')" class="text-red-400 hover:text-red-300 font-bold">X</button></div>`).join('');
}
function renderCategoryDropdowns() {
    const selects = document.querySelectorAll('select[id*="category"]');
    selects.forEach(select => {
        if (select) {
            const isFilter = select.id.includes('filter');
            const currentVal = select.value;
            select.innerHTML = isFilter ? '<option value="All Categories">All Categories</option>' : '';
            categories.forEach(cat => { select.innerHTML += `<option value="${cat}">${cat}</option>`; });
            if(currentVal && Array.from(select.options).some(o => o.value === currentVal)) select.value = currentVal;
        }
    });
}

// --- STOCK ---
async function saveStockItem() {
    const name = document.getElementById('product_name').value.trim();
    const barcode = document.getElementById('barcode').value.trim();
    const catEl = document.getElementById('product_category');
    const category = catEl ? catEl.value : "Other";
    const purchasePrice = parseFloat(document.getElementById('purchase_price').value) || 0;
    const quantity = parseInt(document.getElementById('quantity').value);

    if(!name || !category || isNaN(quantity) || quantity < 0) {
        showStatus('stock_status', 'Please fill all fields.', true); return;
    }

    if (barcode && stock.find(item => item.barcode === barcode)) {
        showStatus('stock_status', 'Error: Barcode already exists.', true); return;
    }
    const existingItem = stock.find(item => item.name.toLowerCase() === name.toLowerCase());
    if (existingItem) {
        showConfirmModal(`Product "${name}" exists. Add quantity?`, async () => {
             existingItem.quantity += quantity;
             if (barcode && !existingItem.barcode) existingItem.barcode = barcode;
             await saveMainData(); // Update Main Doc
             showStatus('stock_status', `Added ${quantity} to "${name}".`);
             document.getElementById('quantity').value = '';
        });
    } else {
        stock.push({ id: Date.now(), name, barcode, category, purchasePrice, quantity });
        await saveMainData(); // Update Main Doc
        showStatus('stock_status', `Saved "${name}".`);
        document.getElementById('product_name').value = '';
        document.getElementById('barcode').value = '';
        document.getElementById('purchase_price').value = '';
        document.getElementById('quantity').value = '';
    }
}
function renderInventory() {
    const listEl = document.getElementById('inventory_list');
    const filterEl = document.getElementById('inventory_category_filter');
    const filter = filterEl ? filterEl.value : 'All Categories';
    const filteredStock = (filter === 'All Categories') ? stock : stock.filter(item => item.category === filter);
    listEl.innerHTML = '';
    if (filteredStock.length === 0) { listEl.innerHTML = '<div class="text-center text-gray-500 p-4 col-span-7">No items.</div>'; return; }
    filteredStock.forEach(item => {
        listEl.innerHTML += `
            <div class="grid grid-cols-7 gap-4 items-center bg-gray-700 p-2 rounded">
                <div class="col-span-2 truncate">${item.name}</div>
                <div class="truncate">${item.barcode || '-'}</div>
                <div class="truncate">${item.category}</div>
                <div class="text-right">${formatCurrency(item.purchasePrice)}</div>
                <div class="text-center">${item.quantity}</div>
                <div class="text-center space-x-1">
                    <button onclick="openEditStockModal(${item.id})" class="bg-yellow-600 hover:bg-yellow-500 text-white font-bold text-xs px-2 py-1 rounded">Edit</button>
                    <button onclick="openAdjustQuantityModal(${item.id})" class="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-2 py-1 rounded">Adj</button>
                    <button onclick="confirmRemoveItem(${item.id})" class="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-2 py-1 rounded">Del</button>
                </div>
            </div>`;
    });
}
function confirmRemoveItem(itemId) {
    const item = stock.find(i => i.id === itemId);
    if(!item) return;
    showConfirmModal(`Remove "${item.name}"?`, async () => {
        stock = stock.filter(i => i.id !== itemId);
        await saveMainData();
        showStatus('inventory_status', `Removed.`);
    });
}
async function adjustQuantity(itemId) {
    const item = stock.find(i => i.id === itemId);
    const qtyToRemove = parseInt(document.getElementById('quantity_to_remove').value);
    if(isNaN(qtyToRemove) || qtyToRemove <= 0) { showStatus('adjust_status', 'Invalid number.', true); return; }
    if(qtyToRemove > item.quantity) { showStatus('adjust_status', 'Not enough stock.', true); return; }
    item.quantity -= qtyToRemove;
    await saveMainData();
    closeAdjustQuantityModal();
    showStatus('inventory_status', `Updated.`);
}
async function saveStockChanges() {
    if (!editingItemId) return;
    const item = stock.find(i => i.id === editingItemId);
    if (!item) return;
    const newName = document.getElementById('edit_product_name').value.trim();
    const newBarcode = document.getElementById('edit_barcode').value.trim();
    const newCategory = document.getElementById('edit_product_category').value;
    const newPurchasePrice = parseFloat(document.getElementById('edit_purchase_price').value) || 0;
    
    item.name = newName; item.barcode = newBarcode; item.category = newCategory; item.purchasePrice = newPurchasePrice;
    await saveMainData();
    closeEditStockModal();
    showStatus('inventory_status', `Updated.`);
}
function openAdjustQuantityModal(itemId) {
    const item = stock.find(i => i.id === itemId);
    const modal = document.getElementById('adjust_quantity_modal');
    modal.querySelector('#adjust_product_name').textContent = item.name;
    modal.querySelector('#adjust_current_quantity').textContent = `Qty: ${item.quantity}`;
    modal.querySelector('#quantity_to_remove').value = '';
    modal.querySelector('#adjust_quantity_confirm').onclick = () => adjustQuantity(item.id);
    modal.classList.add('flex');
}
function closeAdjustQuantityModal() { document.getElementById('adjust_quantity_modal').classList.remove('flex'); }
function openEditStockModal(itemId) {
    editingItemId = itemId;
    const item = stock.find(i => i.id === itemId);
    const categorySelect = document.getElementById('edit_product_category');
    categorySelect.innerHTML = '';
    categories.forEach(cat => { categorySelect.innerHTML += `<option value="${cat}" ${cat === item.category ? 'selected' : ''}>${cat}</option>`; });
    document.getElementById('edit_product_name').value = item.name;
    document.getElementById('edit_barcode').value = item.barcode || '';
    document.getElementById('edit_purchase_price').value = item.purchasePrice;
    document.getElementById('save_changes_btn').onclick = saveStockChanges;
    document.getElementById('edit_stock_modal').classList.add('flex');
}
function closeEditStockModal() { editingItemId = null; document.getElementById('edit_stock_modal').classList.remove('flex'); }

// --- SALES ---
function handleBarcodeScan() {
    const barcodeInput = document.getElementById('barcode_scan_input');
    const barcodeValue = barcodeInput.value.trim();
    if (!barcodeValue) return;
    const product = stock.find(item => item.barcode === barcodeValue);
    barcodeInput.value = '';
    if (product) {
        if (product.quantity > 0) openSellPriceModal(product);
        else showStatus('sale_entry_status', `Out of stock.`, true);
    } else showStatus('sale_entry_status', 'Not found.', true);
}
function openSellPriceModal(product) {
    productForPriceEntry = product;
    const modal = document.getElementById('sell_price_modal');
    modal.querySelector('#sell_price_product_name').textContent = product.name;
    modal.querySelector('#sell_price_input').value = Math.round(product.purchasePrice * 1.5);
    modal.querySelector('#sell_price_confirm').onclick = confirmSellPrice;
    modal.classList.add('flex');
    modal.querySelector('#sell_price_input').focus();
}
function closeSellPriceModal() { productForPriceEntry = null; document.getElementById('sell_price_modal').classList.remove('flex'); document.getElementById('barcode_scan_input').focus(); }
function confirmSellPrice() {
    const sellPrice = parseFloat(document.getElementById('sell_price_input').value);
    if (isNaN(sellPrice) || sellPrice <= 0) { showStatus('sell_price_status', 'Invalid price.', true); return; }
    const product = productForPriceEntry;
    currentSale.push({ ...product, sellPrice, sellQuantity: 1, totalProfit: (sellPrice - product.purchasePrice) });
    renderCart();
    closeSellPriceModal();
}
function openProductSearch() { document.getElementById('product_search_input').value = ''; filterProductSearch(); document.getElementById('product_search_modal').classList.add('flex'); document.getElementById('product_search_input').focus(); }
function closeProductSearch() { document.getElementById('product_search_modal').classList.remove('flex');}
function filterProductSearch() {
    const searchTerm = document.getElementById('product_search_input').value.toLowerCase();
    const resultsEl = document.getElementById('product_search_results');
    resultsEl.innerHTML = '';
    const filtered = stock.filter(i => i.name.toLowerCase().includes(searchTerm) && i.quantity > 0);
    if (filtered.length === 0) { resultsEl.innerHTML = '<div class="text-gray-400 p-2">No products.</div>'; return; }
    filtered.forEach(item => { resultsEl.innerHTML += `<button onclick="selectProductForSale(${item.id})" class="w-full text-left p-2 rounded hover:bg-gray-700">${item.name} (${item.quantity})</button>`; });
}
function selectProductForSale(itemId) {
    selectedProductForSale = stock.find(item => item.id === itemId);
    if (selectedProductForSale) {
        document.getElementById('select_product_button').textContent = selectedProductForSale.name;
        document.getElementById('available_stock').textContent = `Avail: ${selectedProductForSale.quantity}`;
    }
    closeProductSearch();
}
function addItemToSale() {
    if (!selectedProductForSale) { showStatus('sale_entry_status', 'Select a product.', true); return; }
    const sellingPrice = parseFloat(document.getElementById('selling_price').value);
    const quantity = parseInt(document.getElementById('quantity_sold').value);
    if(isNaN(sellingPrice) || isNaN(quantity) || sellingPrice <= 0 || quantity <= 0) return;
    if(quantity > selectedProductForSale.quantity) { showStatus('sale_entry_status', `Stock low.`, true); return; }
    
    currentSale.push({ ...selectedProductForSale, sellPrice: sellingPrice, sellQuantity: quantity, totalProfit: (sellingPrice - selectedProductForSale.purchasePrice) * quantity });
    renderCart();
    selectedProductForSale = null;
    document.getElementById('select_product_button').textContent = 'Click to select...';
    document.getElementById('available_stock').textContent = '';
    document.getElementById('selling_price').value = '';
    document.getElementById('quantity_sold').value = '1';
}
function renderCart() {
    const cartEl = document.getElementById('cart_items');
    cartEl.innerHTML = '';
    if (currentSale.length === 0) { cartEl.innerHTML = '<div class="text-gray-400 text-center p-4">Empty</div>'; }
    else { currentSale.forEach((item, index) => { cartEl.innerHTML += `<div class="grid grid-cols-5 gap-2 items-center bg-gray-700 p-2 rounded"><div class="col-span-2 truncate">${item.name}</div><div class="text-center">${item.sellQuantity}</div><div class="text-center">${formatCurrency(item.sellPrice)}</div><div class="flex justify-end"><button onclick="removeItemFromSale(${index})" class="text-red-400 text-xs hover:text-red-300">X</button></div></div>`; }); }
    updateCartSummary();
}
function removeItemFromSale(index) { currentSale.splice(index, 1); renderCart(); }
function updateCartSummary() {
    const totalAmount = currentSale.reduce((sum, item) => sum + (item.sellPrice * item.sellQuantity), 0);
    const totalProfit = currentSale.reduce((sum, item) => sum + item.totalProfit, 0);
    document.getElementById('cart_total_amount').textContent = `Total: ${formatCurrency(totalAmount)}`;
    document.getElementById('cart_total_profit').textContent = `Profit: ${formatCurrency(totalProfit)}`;
}

// --- OPTIMIZED SALE COMPLETION ---
async function completeSale() {
    if(currentSale.length === 0) return;
    
    // 1. Process items and update local stock
    const batchPromises = currentSale.map(saleItem => {
        const stockItem = stock.find(item => item.id === saleItem.id);
        if (stockItem) stockItem.quantity -= saleItem.sellQuantity;

        // 2. Add to "sales" SUB-COLLECTION (Fast!)
        return shopDataRef.collection('sales').add({
            timestamp: new Date().toISOString(),
            productName: saleItem.name,
            category: saleItem.category,
            quantity: saleItem.sellQuantity,
            sellPrice: saleItem.sellPrice,
            total: saleItem.sellPrice * saleItem.sellQuantity,
            profit: saleItem.totalProfit
        });
    });

    await Promise.all(batchPromises); // Wait for all sales to be added
    await saveMainData(); // Update inventory levels in Main Doc

    currentSale = [];
    renderCart();
    showStatus('sale_status', 'Sale completed!');
}

// --- HISTORY VIEWS ---
function renderSalesDetails() {
    const listEl = document.getElementById('sales_details_list');
    listEl.innerHTML = '';
    let filtered = [...salesLog];
    const start = document.getElementById('sales_start_date').value;
    const end = document.getElementById('sales_end_date').value;
    const search = document.getElementById('sales_search').value.toLowerCase();
    
    if (start) filtered = filtered.filter(s => s.timestamp.split('T')[0] >= start);
    if (end) filtered = filtered.filter(s => s.timestamp.split('T')[0] <= end);
    if (search) filtered = filtered.filter(s => s.productName.toLowerCase().includes(search));
    
    let totalRevenue = 0, totalProfit = 0;
    if (filtered.length > 0) {
        filtered.forEach(sale => {
            listEl.innerHTML += `<tr class="border-b border-gray-700 hover:bg-gray-700/50"><td class="p-2">${new Date(sale.timestamp).toLocaleString()}</td><td class="p-2">${sale.productName}</td><td class="p-2">${sale.quantity}</td><td class="p-2">${formatCurrency(sale.sellPrice)}</td><td class="p-2">${formatCurrency(sale.total)}</td><td class="p-2">${formatCurrency(sale.profit)}</td></tr>`;
            totalRevenue += sale.total; totalProfit += sale.profit;
        });
    } else listEl.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-gray-500">No data.</td></tr>';
    document.getElementById('sales_total_revenue').textContent = `Total: ${formatCurrency(totalRevenue)}`;
    document.getElementById('sales_total_profit').textContent = `Profit: ${formatCurrency(totalProfit)}`;
}

// --- REPAIR ---
async function saveRepairLog() {
    const customerName = document.getElementById('repair_customer_name').value.trim();
    const mobileNumber = document.getElementById('repair_mobile').value.trim();
    const cost = parseFloat(document.getElementById('repair_cost').value);
    const sellPrice = parseFloat(document.getElementById('repair_sell_price').value);
    if(!customerName || !mobileNumber || isNaN(cost) || isNaN(sellPrice)) return;
    
    // Add to "repairs" SUB-COLLECTION
    await shopDataRef.collection('repairs').add({
        timestamp: new Date().toISOString(),
        customerName, mobileNumber, cost, sellPrice, profit: sellPrice - cost
    });
    
    showStatus('repair_status', 'Logged.');
    document.getElementById('repair_customer_name').value = '';
    document.getElementById('repair_mobile').value = '';
    document.getElementById('repair_cost').value = '';
    document.getElementById('repair_sell_price').value = '';
}
function renderRepairDetails() {
    const listEl = document.getElementById('repair_details_list');
    listEl.innerHTML = '';
    let filtered = [...repairLog];
    const start = document.getElementById('repair_start_date').value;
    const end = document.getElementById('repair_end_date').value;
    const search = document.getElementById('repair_search').value.toLowerCase();
    
    if (start) filtered = filtered.filter(r => r.timestamp.split('T')[0] >= start);
    if (end) filtered = filtered.filter(r => r.timestamp.split('T')[0] <= end);
    if (search) filtered = filtered.filter(r => r.customerName.toLowerCase().includes(search) || (r.mobileNumber && r.mobileNumber.includes(search)));
    
    let totalCost=0, totalRev=0, totalProf=0;
    if (filtered.length > 0) {
        filtered.forEach(r => {
            listEl.innerHTML += `<tr class="border-b border-gray-700 hover:bg-gray-700/50"><td class="p-2">${new Date(r.timestamp).toLocaleString()}</td><td class="p-2">${r.customerName}</td><td class="p-2">${r.mobileNumber || '-'}</td><td class="p-2">${formatCurrency(r.cost)}</td><td class="p-2">${formatCurrency(r.sellPrice)}</td><td class="p-2">${formatCurrency(r.profit)}</td></tr>`;
            totalCost += r.cost; totalRev += r.sellPrice; totalProf += r.profit;
        });
    } else listEl.innerHTML = '<tr><td colspan="6" class="text-center p-4">No data.</td></tr>';
    document.getElementById('repair_total_cost').textContent = `Cost: ${formatCurrency(totalCost)}`;
    document.getElementById('repair_total_revenue').textContent = `Rev: ${formatCurrency(totalRev)}`;
    document.getElementById('repair_total_profit').textContent = `Prof: ${formatCurrency(totalProf)}`;
}

// --- RECHARGE ---
async function saveRechargeLog() {
    const mobileNumber = document.getElementById('recharge_mobile').value.trim();
    const company = document.getElementById('recharge_company').value;
    const amount = parseFloat(document.getElementById('recharge_amount').value);
    if(!mobileNumber || isNaN(amount)) return;
    
    // Add to "recharges" SUB-COLLECTION
    await shopDataRef.collection('recharges').add({
        timestamp: new Date().toISOString(), mobileNumber, company, amount
    });
    
    showStatus('recharge_status', 'Logged.');
    document.getElementById('recharge_mobile').value = '';
    document.getElementById('recharge_amount').value = '';
}
function renderRechargeDetails() {
    const listEl = document.getElementById('recharge_details_list');
    listEl.innerHTML = '';
    let filtered = [...rechargeLog];
    const start = document.getElementById('recharge_start_date').value;
    const end = document.getElementById('recharge_end_date').value;
    const company = document.getElementById('recharge_company_filter').value;
    const search = document.getElementById('recharge_search').value.toLowerCase();

    if (start) filtered = filtered.filter(r => r.timestamp.split('T')[0] >= start);
    if (end) filtered = filtered.filter(r => r.timestamp.split('T')[0] <= end);
    if (company !== 'All Companies') filtered = filtered.filter(r => r.company === company);
    if (search) filtered = filtered.filter(r => r.mobileNumber && r.mobileNumber.toLowerCase().includes(search));
    
    let totalAmt = 0;
    if (filtered.length > 0) {
        filtered.forEach(r => {
            listEl.innerHTML += `<tr class="border-b border-gray-700 hover:bg-gray-700/50"><td class="p-2">${new Date(r.timestamp).toLocaleString()}</td><td class="p-2">${r.mobileNumber || '-'}</td><td class="p-2">${r.company}</td><td class="p-2">${formatCurrency(r.amount)}</td></tr>`;
            totalAmt += r.amount;
        });
    } else listEl.innerHTML = '<tr><td colspan="4" class="text-center p-4">No data.</td></tr>';
    document.getElementById('recharge_total_amount').textContent = `Total: ${formatCurrency(totalAmt)}`;
}

// --- API KEY & SETTINGS ---
async function saveApiKey() { 
    apiKey = document.getElementById('api_key_input').value.trim(); 
    await saveMainData();
    showStatus('api_key_status', 'Saved.'); 
}

function promptResetAllData() {
    showConfirmModal("DELETE ALL DATA PERMANENTLY?", async () => {
        // This only deletes the MAIN document. Deleting subcollections in Firestore requires specific cloud functions or manual deletion loop.
        // For this simple app, we will just clear the stock in main doc.
        stock = []; categories = ["Other"]; apiKey = '';
        await saveMainData();
        showStatus('api_key_status', 'Main data reset. (History remains in cloud)');
    });
}

function checkForUpdate() {
    showStatus('update_check_status', 'Checking...', false);
    if (window.electronAPI) window.electronAPI.checkForUpdate();
}

// --- REPORTING & PDF ---
function toggleReportOptions() { const type = document.getElementById('report_type').value; document.getElementById('monthly_options').classList.toggle('hidden', type !== 'Monthly'); document.getElementById('yearly_options').classList.toggle('hidden', type !== 'Yearly'); }
function getPeriodRanges() {
    const type = document.getElementById('report_type').value;
    let current = { start: new Date(), end: new Date() }, previous = { start: new Date(), end: new Date() }, title = '';
    if (type === 'Daily') {
        title = `Daily Report for ${new Date().toLocaleDateString()}`;
        current.start = new Date(new Date().setHours(0,0,0,0)); current.end = new Date(new Date().setHours(23,59,59,999));
        previous.start = new Date(new Date(current.start).setDate(current.start.getDate() - 1));
        previous.end = new Date(new Date(current.end).setDate(current.end.getDate() - 1));
    } else if (type === 'Monthly') {
        const month = parseInt(document.getElementById('report_month').value), year = parseInt(document.getElementById('report_month_year').value);
        if(isNaN(month) || isNaN(year) || year < 2000) return null;
        title = `Monthly Report for ${month}/${year}`;
        current.start = new Date(year, month - 1, 1); current.end = new Date(year, month, 0, 23, 59, 59, 999);
        previous.start = new Date(year, month - 2, 1); previous.end = new Date(year, month - 1, 0, 23, 59, 59, 999);
    } else if (type === 'Yearly') {
        const year = parseInt(document.getElementById('report_year').value); if(isNaN(year) || year < 2000) return null;
        title = `Yearly Report for ${year}`;
        current.start = new Date(year, 0, 1); current.end = new Date(year, 11, 31, 23, 59, 59, 999);
        previous.start = new Date(year - 1, 0, 1); previous.end = new Date(year - 1, 11, 31, 23, 59, 59, 999);
    }
    return { title, current, previous };
}
function getReportData(period) {
    const sales = salesLog.filter(s => new Date(s.timestamp) >= period.start && new Date(s.timestamp) <= period.end);
    const repairs = repairLog.filter(r => new Date(r.timestamp) >= period.start && new Date(r.timestamp) <= period.end);
    const recharges = rechargeLog.filter(r => new Date(r.timestamp) >= period.start && new Date(r.timestamp) <= period.end);
    return { sales, repairs, recharges };
}
async function getAIInsights() {
    if (!apiKey) { showStatus('report_status', 'No API Key.', true); return; }
    const periods = getPeriodRanges(); if (!periods) return;
    document.getElementById('ai_summary_container').classList.remove('hidden');
    document.getElementById('ai_summary_content').innerHTML = '<p>Analyzing...</p>';
    const currentData = getReportData(periods.current);
    
    const prompt = `Analyze this shop data for ${periods.title}:
    Sales Profit: ${formatCurrency(currentData.sales.reduce((s,i)=>s+i.profit,0))}
    Repair Profit: ${formatCurrency(currentData.repairs.reduce((s,i)=>s+i.profit,0))}
    Recharge Revenue: ${formatCurrency(currentData.recharges.reduce((s,i)=>s+i.amount,0))}
    Provide 3 concise insights and 1 recommendation.`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        const result = await response.json();
        document.getElementById('ai_summary_content').innerHTML = result.candidates[0].content.parts[0].text.replace(/\n/g, '<br>');
    } catch (e) { document.getElementById('ai_summary_content').innerHTML = 'AI Error.'; }
}
async function getCustomAIInsight() {
    if (!apiKey) { showStatus('report_status', 'No API Key.', true); return; }
    const q = document.getElementById('custom_ai_prompt').value.trim();
    if (!q) return;
    document.getElementById('ai_summary_container').classList.remove('hidden');
    document.getElementById('ai_summary_content').innerHTML = '<p>Processing...</p>';
    
    const dataForAI = { inventory: stock, sales: salesLog.slice(0, 50), repairs: repairLog.slice(0, 50) }; 
    // Sending only last 50 items to keep prompt small, real production app needs smarter filtering
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ contents: [{ parts: [{ text: `Answer based on this JSON: ${JSON.stringify(dataForAI)}. User Question: ${q}` }] }] }) });
        const result = await response.json();
        document.getElementById('ai_summary_content').innerHTML = result.candidates[0].content.parts[0].text.replace(/\n/g, '<br>');
    } catch (e) { document.getElementById('ai_summary_content').innerHTML = 'AI Error.'; }
}
function generatePDFReport() {
    // (Existing PDF logic kept identical for brevity, assumes jspdf is loaded)
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    const periods = getPeriodRanges(); if (!periods) return;
    const { sales, repairs, recharges } = getReportData(periods.current);
    doc.text("Financial Report", 10, 10);
    doc.text(`Sales Rev: ${sales.reduce((a,b)=>a+b.total,0)}`, 10, 20);
    doc.save("report.pdf");
    showStatus('report_status', `PDF Saved.`);
}
function saveBackupToFile() {
    const blob = new Blob([JSON.stringify({stock, salesLog, repairLog, rechargeLog}, null, 2)], {type : 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup.json'; a.click();
}