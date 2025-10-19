// --- PASTE YOUR FIREBASE CONFIGURATION OBJECT HERE ---
const firebaseConfig = {
  apiKey: "AIzaSyBjhow9uM8oRu4by2xBbz9lLRBaxrcbWBk",
  authDomain: "mahavir-financial-report.firebaseapp.com",
  projectId: "mahavir-financial-report",
  storageBucket: "mahavir-financial-report.firebasestorage.app",
  messagingSenderId: "777637223605",
  appId: "1:777637223605:web:6b9c69aea41b71ed0132fc",
  measurementId: "G-XSM4TR3KN7"
};

// --- FIREBASE INITIALIZATION ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let shopDataRef;
let unsubscribe; // To detach the real-time listener on logout

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
let currentActivePage = 'homepage'; // Default to homepage
let editingItemId = null; // To track which item is being edited
let updateInfo = null; // To store available update info

// --- APP STARTUP & AUTHENTICATION ---
document.addEventListener('DOMContentLoaded', () => {
    updateClock(); // Initial clock update
    setInterval(updateClock, 1000); // Update clock every second

    const loginBtn = document.getElementById('login_button');
    const signupBtn = document.getElementById('signup_button');
    const logoutBtn = document.getElementById('logout_button');

    loginBtn.addEventListener('click', handleLogin);
    signupBtn.addEventListener('click', handleSignup);
    logoutBtn.addEventListener('click', handleLogout);
    
    auth.onAuthStateChanged(user => {
        if (user) {
            document.getElementById('user_email_display').textContent = user.email;
            shopDataRef = db.collection('shops').doc(user.uid);
            setupRealtimeListener();
            document.getElementById('main_app_container').classList.remove('hidden');
            document.getElementById('auth_container').classList.add('hidden');
            document.getElementById('loading_container').classList.add('hidden');
        } else {
            if (unsubscribe) unsubscribe();
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

    // --- Updater IPC Listeners ---
    if (window.electronAPI) {
        window.electronAPI.onUpdateAvailable((info) => {
            updateInfo = info;
            const updateBell = document.getElementById('update_notification_bell');
            updateBell.classList.remove('hidden');
            updateBell.onclick = () => {
                showConfirmModal(`A new update (v${info.version}) is available. Download now?`, () => {
                    const modal = document.getElementById('update_modal');
                    modal.classList.add('flex');
                    window.electronAPI.startDownload();
                });
            };
        });

        window.electronAPI.onDownloadProgress((progressObj) => {
            const progressBar = document.getElementById('progress_bar');
            const updateDetails = document.getElementById('update_details');
            
            progressBar.style.width = `${progressObj.percent}%`;
            const speed = (progressObj.bytesPerSecond / 1024 / 1024).toFixed(2);
            const downloaded = (progressObj.transferred / 1024 / 1024).toFixed(2);
            const total = (progressObj.total / 1024 / 1024).toFixed(2);
            
            updateDetails.textContent = `Downloading at ${speed} MB/s (${downloaded} MB / ${total} MB)`;
        });

        window.electronAPI.onUpdateDownloaded(() => {
            document.getElementById('update_title').textContent = 'Update Ready';
            document.getElementById('update_message').textContent = 'The new version has been downloaded. Restart the application to apply the update.';
            document.getElementById('progress_bar_container').classList.add('hidden');
            document.getElementById('update_details').classList.add('hidden');

            const restartButton = document.getElementById('restart_button');
            restartButton.classList.remove('hidden');
            restartButton.onclick = () => {
                window.electronAPI.restartApp();
            };
        });
        
        window.electronAPI.onUpdateError((err) => {
            console.error('Update Error:', err);
            const modal = document.getElementById('update_modal');
            modal.classList.remove('flex');
            showStatus('update_check_status', 'Update failed. Check logs.', true);
        });

        window.electronAPI.onUpdateNotAvailable(() => {
            showStatus('update_check_status', 'You are on the latest version.', false);
        });
    }
});


function setAuthError(message) {
    document.getElementById('auth_error').textContent = message;
}

function getFriendlyAuthError(error) {
    switch (error.code) {
        case 'auth/invalid-email': return 'The email address is badly formatted.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential': return 'Incorrect email or password. Please try again.';
        case 'auth/email-already-in-use': return 'This email address is already registered.';
        case 'auth/weak-password': return 'Password is too weak. It must be at least 6 characters.';
        default: console.error('Unhandled Auth Error:', error); return 'An unexpected error occurred. Please try again.';
    }
}

function handleLogin() {
    const email = document.getElementById('auth_email').value;
    const password = document.getElementById('auth_password').value;
    setAuthError('');
    auth.signInWithEmailAndPassword(email, password)
        .catch(error => setAuthError(getFriendlyAuthError(error)));
}

function handleSignup() {
    const email = document.getElementById('auth_email').value;
    const password = document.getElementById('auth_password').value;
    setAuthError('');
    auth.createUserWithEmailAndPassword(email, password)
        .catch(error => setAuthError(getFriendlyAuthError(error)));
}

function handleLogout() {
    auth.signOut();
}

// --- DATA PERSISTENCE (FIRESTORE) ---
function setupRealtimeListener() {
    unsubscribe = shopDataRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            stock = data.stock || [];
            salesLog = data.salesLog || [];
            repairLog = data.repairLog || [];
            rechargeLog = data.rechargeLog || [];
            apiKey = data.apiKey || '';
            categories = data.categories || ["Mobile Accessory", "Repair Part", "SIM Card", "Other"];
        } else {
            console.log("No data in Firestore. Initializing document for this user.");
            categories = ["Mobile Accessory", "Repair Part", "SIM Card", "Speakers", "Buds", "Earphones", "Other"];
            saveData();
        }
        navigate(currentActivePage);
    }, error => {
        console.error("Error listening to shop data:", error);
    });
}

async function saveData() {
    if (!shopDataRef) return;
    try {
        const dataToSave = { stock, categories, salesLog, repairLog, rechargeLog, apiKey };
        await shopDataRef.set(dataToSave, { merge: true });
    } catch (error) {
        console.error("Error saving data to Firestore:", error);
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
        case 'check_inventory': renderInventory(); break;
        case 'record_sale': 
            if(document.getElementById('barcode_scan_input')) document.getElementById('barcode_scan_input').focus();
            break;
        case 'sales_details':
            document.getElementById('sales_start_date').value = today;
            document.getElementById('sales_end_date').value = today;
            document.getElementById('sales_search').value = '';
            renderSalesDetails();
            break;
        case 'repair_details':
             document.getElementById('repair_start_date').value = today;
             document.getElementById('repair_end_date').value = today;
             document.getElementById('repair_search').value = '';
             renderRepairDetails();
             break;
        case 'recharge_details':
             document.getElementById('recharge_start_date').value = today;
             document.getElementById('recharge_end_date').value = today;
             document.getElementById('recharge_company_filter').value = 'All Companies';
             document.getElementById('recharge_search').value = '';
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
// --- UTILITY & MODAL FUNCTIONS ---
function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('clock').textContent = `${hours}:${minutes}:${seconds}`;
}

function showStatus(elementId, message, isError = false) {
    const el = document.getElementById(elementId);
    if(!el) return;
    el.textContent = message;
    el.className = `h-6 text-center ${isError ? 'text-red-400' : 'text-green-400'}`;
    if (el.id !== 'sell_price_status' && el.id !== 'adjust_status') {
       el.classList.add('mt-4');
    }
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
    newYesButton.addEventListener('click', () => {
        onConfirm();
        closeConfirmModal();
    });
    modal.classList.add('flex');
}
function closeConfirmModal(){ document.getElementById('confirm_modal').classList.remove('flex'); }

// --- CATEGORY MANAGEMENT ---
function openCategoryManager() { renderCategoryList(); document.getElementById('category_manager_modal').classList.add('flex'); }
function closeCategoryManager() { document.getElementById('category_manager_modal').classList.remove('flex'); }
function renderCategoryList() {
    const listEl = document.getElementById('category_list');
    listEl.innerHTML = categories.map(cat => `<div class="flex justify-between items-center bg-gray-700 p-2 rounded"><span>${cat}</span><button onclick="removeCategory('${cat}')" class="text-red-400 hover:text-red-300 font-bold">X</button></div>`).join('');
}
async function addCategory() {
    const input = document.getElementById('new_category_name');
    const newCat = input.value.trim();
    if (newCat && !categories.find(c => c.toLowerCase() === newCat.toLowerCase())) {
        categories.push(newCat);
        await saveData();
        input.value = '';
    }
}
function removeCategory(catToRemove) {
    showConfirmModal(`Are you sure you want to remove the category "${catToRemove}"?`, async () => {
        categories = categories.filter(c => c !== catToRemove);
        await saveData();
    });
}
function removeAllCategories() {
    showConfirmModal("Are you sure you want to remove all categories?", async () => {
        categories = ["Other"];
        await saveData();
    });
}
function renderCategoryDropdowns() {
    const selects = document.querySelectorAll('select[id*="category"]');
    selects.forEach(select => {
        if (select) {
            const isFilter = select.id.includes('filter');
            select.innerHTML = isFilter ? '<option value="All Categories">All Categories</option>' : '';
            categories.forEach(cat => { select.innerHTML += `<option value="${cat}">${cat}</option>`; });
        }
    });
}

// --- STOCK MANAGEMENT ---
async function saveStockItem() {
    const name = document.getElementById('product_name').value.trim();
    const barcode = document.getElementById('barcode').value.trim();
    const category = document.getElementById('product_category').value;
    const purchasePrice = parseFloat(document.getElementById('purchase_price').value) || 0;
    const quantity = parseInt(document.getElementById('quantity').value);

    if(!name || !category || isNaN(quantity) || quantity < 0) {
        showStatus('stock_status', 'Please fill Product Name, Category, and a valid Quantity.', true); 
        return;
    }

    if (barcode && stock.find(item => item.barcode === barcode)) {
        showStatus('stock_status', 'Error: This barcode is already assigned.', true); return;
    }
    const existingItem = stock.find(item => item.name.toLowerCase() === name.toLowerCase());
    if (existingItem) {
        showConfirmModal(`Product "${name}" already exists. Add quantity?`, async () => {
             existingItem.quantity += quantity;
             if (barcode && !existingItem.barcode) existingItem.barcode = barcode;
             await saveData();
             showStatus('stock_status', `Added ${quantity} to "${name}".`);
             document.getElementById('quantity').value = '';
        });
    } else {
        stock.push({ id: Date.now(), name, barcode, category, purchasePrice, quantity });
        await saveData();
        showStatus('stock_status', `Successfully saved "${name}".`);
        document.getElementById('product_name').value = '';
        document.getElementById('barcode').value = '';
        document.getElementById('purchase_price').value = '';
        document.getElementById('quantity').value = '';
    }
}

function renderInventory() {
    const listEl = document.getElementById('inventory_list');
    const filter = document.getElementById('inventory_category_filter').value;
    const filteredStock = (filter === 'All Categories') ? stock : stock.filter(item => item.category === filter);
    listEl.innerHTML = '';
    if (filteredStock.length === 0) {
        listEl.innerHTML = '<div class="text-center text-gray-500 p-4 col-span-7">No items in inventory.</div>'; return;
    }
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
                    <button onclick="openAdjustQuantityModal(${item.id})" class="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-2 py-1 rounded">Adjust</button>
                    <button onclick="confirmRemoveItem(${item.id})" class="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-2 py-1 rounded">Remove</button>
                </div>
            </div>`;
    });
}

function confirmRemoveItem(itemId) {
    const item = stock.find(i => i.id === itemId);
    if(!item) return;
    showConfirmModal(`Remove "${item.name}" completely?`, async () => {
        stock = stock.filter(i => i.id !== itemId);
        await saveData();
        showStatus('inventory_status', `"${item.name}" removed.`);
    });
}
function openAdjustQuantityModal(itemId) {
    const item = stock.find(i => i.id === itemId);
    if(!item) return;
    const modal = document.getElementById('adjust_quantity_modal');
    modal.querySelector('#adjust_product_name').textContent = `Adjusting: ${item.name}`;
    modal.querySelector('#adjust_current_quantity').textContent = `Current Quantity: ${item.quantity}`;
    modal.querySelector('#quantity_to_remove').value = '';
    modal.querySelector('#adjust_quantity_confirm').onclick = () => adjustQuantity(item.id);
    modal.classList.add('flex');
}
async function adjustQuantity(itemId) {
    const item = stock.find(i => i.id === itemId);
    const qtyToRemove = parseInt(document.getElementById('quantity_to_remove').value);
    if(isNaN(qtyToRemove) || qtyToRemove <= 0) { showStatus('adjust_status', 'Enter a valid positive number.', true); return; }
    if(qtyToRemove > item.quantity) { showStatus('adjust_status', `Cannot remove more than available (${item.quantity}).`, true); return; }
    item.quantity -= qtyToRemove;
    if(item.quantity <= 0) stock = stock.filter(i => i.id !== itemId);
    await saveData();
    closeAdjustQuantityModal();
    showStatus('inventory_status', `Stock for "${item.name}" updated.`);
}
function closeAdjustQuantityModal() { document.getElementById('adjust_quantity_modal').classList.remove('flex'); }

function openEditStockModal(itemId) {
    editingItemId = itemId;
    const item = stock.find(i => i.id === itemId);
    if (!item) return;

    const categorySelect = document.getElementById('edit_product_category');
    categorySelect.innerHTML = '';
    categories.forEach(cat => {
        categorySelect.innerHTML += `<option value="${cat}">${cat}</option>`;
    });

    document.getElementById('edit_product_name').value = item.name;
    document.getElementById('edit_barcode').value = item.barcode || '';
    document.getElementById('edit_product_category').value = item.category;
    document.getElementById('edit_purchase_price').value = item.purchasePrice;
    document.getElementById('save_changes_btn').onclick = saveStockChanges;
    document.getElementById('edit_stock_modal').classList.add('flex');
}

function closeEditStockModal() {
    editingItemId = null;
    document.getElementById('edit_stock_modal').classList.remove('flex');
}

async function saveStockChanges() {
    if (!editingItemId) return;
    const item = stock.find(i => i.id === editingItemId);
    if (!item) return;
    const newName = document.getElementById('edit_product_name').value.trim();
    const newBarcode = document.getElementById('edit_barcode').value.trim();
    const newCategory = document.getElementById('edit_product_category').value;
    const newPurchasePrice = parseFloat(document.getElementById('edit_purchase_price').value) || 0;

    if (!newName) {
        showStatus('edit_stock_status', 'Product name cannot be empty.', true);
        return;
    }
    if (newBarcode && newBarcode !== item.barcode && stock.some(s => s.id !== editingItemId && s.barcode === newBarcode)) {
        showStatus('edit_stock_status', 'This barcode is already in use by another item.', true);
        return;
    }
    
    item.name = newName;
    item.barcode = newBarcode;
    item.category = newCategory;
    item.purchasePrice = newPurchasePrice;

    await saveData();
    closeEditStockModal();
    showStatus('inventory_status', `"${item.name}" was updated successfully.`);
}

// --- RECORD SALE ---
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
    const profit = (sellPrice - product.purchasePrice);
    currentSale.push({ ...product, sellPrice, sellQuantity: 1, totalProfit: profit });
    renderCart();
    showStatus('sale_entry_status', `Added: ${product.name}`);
    closeSellPriceModal();
}
function handleBarcodeScan() {
    const barcodeInput = document.getElementById('barcode_scan_input');
    const barcodeValue = barcodeInput.value.trim();
    if (!barcodeValue) return;
    const product = stock.find(item => item.barcode === barcodeValue);
    barcodeInput.value = '';
    if (product) {
        if (product.quantity > 0) openSellPriceModal(product);
        else showStatus('sale_entry_status', `"${product.name}" is out of stock.`, true);
    } else showStatus('sale_entry_status', 'Barcode not found.', true);
}
function openProductSearch() { document.getElementById('product_search_input').value = ''; filterProductSearch(); document.getElementById('product_search_modal').classList.add('flex'); document.getElementById('product_search_input').focus(); }
function closeProductSearch() { document.getElementById('product_search_modal').classList.remove('flex');}
function filterProductSearch() {
    const searchTerm = document.getElementById('product_search_input').value.toLowerCase();
    const resultsEl = document.getElementById('product_search_results');
    resultsEl.innerHTML = '';
    const filtered = stock.filter(i => i.name.toLowerCase().includes(searchTerm) && i.quantity > 0);
    if (filtered.length === 0) { resultsEl.innerHTML = '<div class="text-gray-400 p-2">No products found.</div>'; return; }
    filtered.forEach(item => { resultsEl.innerHTML += `<button onclick="selectProductForSale(${item.id})" class="w-full text-left p-2 rounded hover:bg-gray-700">${item.name} (Qty: ${item.quantity})</button>`; });
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
    if(isNaN(sellingPrice) || isNaN(quantity) || sellingPrice <= 0 || quantity <= 0) { showStatus('sale_entry_status', 'Enter valid price and quantity.', true); return; }
    if(quantity > selectedProductForSale.quantity) { showStatus('sale_entry_status', `Not enough stock. Only ${selectedProductForSale.quantity} available.`, true); return; }
    const profit = (sellingPrice - selectedProductForSale.purchasePrice) * quantity;
    currentSale.push({ ...selectedProductForSale, sellPrice, sellQuantity: quantity, totalProfit: profit });
    renderCart();
    selectedProductForSale = null;
    document.getElementById('select_product_button').textContent = 'Click to select...';
    document.getElementById('available_stock').textContent = '';
    document.getElementById('selling_price').value = '';
    document.getElementById('quantity_sold').value = '1';
    showStatus('sale_entry_status', 'Item added.');
}
function renderCart() {
    const cartEl = document.getElementById('cart_items');
    cartEl.innerHTML = '';
    if (currentSale.length === 0) { cartEl.innerHTML = '<div class="text-gray-400 text-center p-4">Cart is empty</div>'; }
    else { currentSale.forEach((item, index) => { cartEl.innerHTML += `<div class="grid grid-cols-5 gap-2 items-center bg-gray-700 p-2 rounded"><div class="col-span-2 truncate">${item.name}</div><div class="text-center">${item.sellQuantity}</div><div class="text-center">${formatCurrency(item.sellPrice)}</div><div class="flex justify-end"><button onclick="removeItemFromSale(${index})" class="text-red-400 text-xs hover:text-red-300">Remove</button></div></div>`; }); }
    updateCartSummary();
}
function removeItemFromSale(index) { currentSale.splice(index, 1); renderCart(); }
function updateCartSummary() {
    const totalAmount = currentSale.reduce((sum, item) => sum + (item.sellPrice * item.sellQuantity), 0);
    const totalProfit = currentSale.reduce((sum, item) => sum + item.totalProfit, 0);
    document.getElementById('cart_total_amount').textContent = `Total: ${formatCurrency(totalAmount)}`;
    document.getElementById('cart_total_profit').textContent = `Profit: ${formatCurrency(totalProfit)}`;
}
async function completeSale() {
    if(currentSale.length === 0) { showStatus('sale_status', 'Cart is empty.', true); return; }
    currentSale.forEach(saleItem => {
        const stockItem = stock.find(item => item.id === saleItem.id);
        if (stockItem) stockItem.quantity -= saleItem.sellQuantity;
        salesLog.push({ timestamp: new Date().toISOString(), productName: saleItem.name, category: saleItem.category, quantity: saleItem.sellQuantity, sellPrice: saleItem.sellPrice, total: saleItem.sellPrice * saleItem.sellQuantity, profit: saleItem.totalProfit });
    });
    stock = stock.filter(item => item.quantity > 0);
    await saveData();
    currentSale = [];
    renderCart();
    showStatus('sale_status', 'Sale completed!');
}
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
        filtered.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(sale => {
            listEl.innerHTML += `<tr class="border-b border-gray-700 hover:bg-gray-700/50"><td class="p-2">${new Date(sale.timestamp).toLocaleString()}</td><td class="p-2">${sale.productName}</td><td class="p-2">${sale.quantity}</td><td class="p-2">${formatCurrency(sale.sellPrice)}</td><td class="p-2">${formatCurrency(sale.total)}</td><td class="p-2">${formatCurrency(sale.profit)}</td></tr>`;
            totalRevenue += sale.total;
            totalProfit += sale.profit;
        });
    } else listEl.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-gray-500">No sales data.</td></tr>';
    document.getElementById('sales_total_revenue').textContent = `Total Revenue: ${formatCurrency(totalRevenue)}`;
    document.getElementById('sales_total_profit').textContent = `Total Profit: ${formatCurrency(totalProfit)}`;
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
    if (search) {
        filtered = filtered.filter(r => 
            r.customerName.toLowerCase().includes(search) || 
            (r.mobileNumber && r.mobileNumber.includes(search))
        );
    }
    let totalCost = 0, totalRevenue = 0, totalProfit = 0;
    if (filtered.length > 0) {
        filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(r => {
            listEl.innerHTML += `<tr class="border-b border-gray-700 hover:bg-gray-700/50"><td class="p-2">${new Date(r.timestamp).toLocaleString()}</td><td class="p-2">${r.customerName}</td><td class="p-2">${r.mobileNumber || '-'}</td><td class="p-2">${formatCurrency(r.cost)}</td><td class="p-2">${formatCurrency(r.sellPrice)}</td><td class="p-2">${formatCurrency(r.profit)}</td></tr>`;
            totalCost += r.cost; totalRevenue += r.sellPrice; totalProfit += r.profit;
        });
    } else listEl.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-gray-500">No repair data.</td></tr>';
    document.getElementById('repair_total_cost').textContent = `Total Cost: ${formatCurrency(totalCost)}`;
    document.getElementById('repair_total_revenue').textContent = `Total Revenue: ${formatCurrency(totalRevenue)}`;
    document.getElementById('repair_total_profit').textContent = `Total Profit: ${formatCurrency(totalProfit)}`;
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

    let totalAmount = 0;
    if (filtered.length > 0) {
        filtered.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(r => {
            listEl.innerHTML += `<tr class="border-b border-gray-700 hover:bg-gray-700/50"><td class="p-2">${new Date(r.timestamp).toLocaleString()}</td><td class="p-2">${r.mobileNumber || '-'}</td><td class="p-2">${r.company}</td><td class="p-2">${formatCurrency(r.amount)}</td></tr>`;
            totalAmount += r.amount;
        });
    } else listEl.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">No recharge data.</td></tr>';
    document.getElementById('recharge_total_amount').textContent = `Total Recharge Amount: ${formatCurrency(totalAmount)}`;
}
async function saveRepairLog() {
    const customerName = document.getElementById('repair_customer_name').value.trim();
    const mobileNumber = document.getElementById('repair_mobile').value.trim();
    const cost = parseFloat(document.getElementById('repair_cost').value);
    const sellPrice = parseFloat(document.getElementById('repair_sell_price').value);
    if(!customerName || !mobileNumber || isNaN(cost) || isNaN(sellPrice)) { showStatus('repair_status', 'Please fill all fields.', true); return; }
    repairLog.push({ timestamp: new Date().toISOString(), customerName, mobileNumber, cost, sellPrice, profit: sellPrice - cost });
    await saveData();
    showStatus('repair_status', 'Repair logged.');
    document.getElementById('repair_customer_name').value = '';
    document.getElementById('repair_mobile').value = '';
    document.getElementById('repair_cost').value = '';
    document.getElementById('repair_sell_price').value = '';
}
async function saveRechargeLog() {
    const mobileNumber = document.getElementById('recharge_mobile').value.trim();
    const company = document.getElementById('recharge_company').value;
    const amount = parseFloat(document.getElementById('recharge_amount').value);
    if(!mobileNumber || isNaN(amount) || amount <= 0) { showStatus('recharge_status', 'Please enter a valid mobile number and amount.', true); return; }
    rechargeLog.push({ timestamp: new Date().toISOString(), mobileNumber, company, amount });
    await saveData();
    showStatus('recharge_status', 'Recharge logged.');
    document.getElementById('recharge_mobile').value = '';
    document.getElementById('recharge_amount').value = '';
}

// --- REPORTS ---
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
    if (!apiKey) { showStatus('report_status', 'Please enter your Gemini API key in Settings.', true); return; }
    const periods = getPeriodRanges(); if (!periods) { showStatus('report_status', 'Please enter valid period details.', true); return; }
    const summaryContainer = document.getElementById('ai_summary_container');
    const summaryContent = document.getElementById('ai_summary_content');
    summaryContainer.classList.remove('hidden');
    summaryContent.innerHTML = '<p>Gathering data and analyzing...</p>';
    const currentData = getReportData(periods.current), previousData = getReportData(periods.previous);
    const dataToText = (data) => `Total Profit: ${formatCurrency(data.sales.reduce((s,i)=>s+i.profit,0) + data.repairs.reduce((s,i)=>s+i.profit,0))}\nSales Count: ${data.sales.length}\nRepair Count: ${data.repairs.length}\nRecharge Count: ${data.recharges.length}`;
    const prompt = `You are a business analyst for a small mobile shop...`; // Unchanged
    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) { const errorBody = await response.json(); throw new Error(`API call failed: ${errorBody.error.message}`); }
        const result = await response.json();
        summaryContent.innerHTML = renderAIMarkdown(result.candidates[0].content.parts[0].text);
    } catch (e) { summaryContent.innerHTML = `<p class="text-red-400">Failed to get AI insights. Error: ${e.message}</p>`; }
}
function renderAIMarkdown(markdown) {
    let html = markdown;
    html = html.replace(/^## (.*$)/gim, '<h4 class="text-lg font-bold mt-4 mb-2 text-green-300">$1</h4>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>').replace(/<\/ul>\s*<ul>/g, '');
    return html.replace(/\n/g, '<br>');
}
function generatePDFReport() {
    try {
        if (!window.jspdf || !window.jspdf.jsPDF) { showStatus('report_status', 'PDF library not loaded.', true); return; }
        const { jsPDF } = window.jspdf; const doc = new jsPDF();
        if (typeof doc.autoTable !== 'function') { showStatus('report_status', 'PDF table plugin not loaded.', true); return; }
        const periods = getPeriodRanges(); if (!periods) { showStatus('report_status', 'Please enter valid period details.', true); return; }
        const { title, current } = periods;
        const { sales, repairs, recharges } = getReportData(current);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
        doc.text("Mahavir Mobile Shop - Financial Report", doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
        doc.setFontSize(12); doc.text(title, doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
        let finalY = 30;
        if (sales.length > 0) {
            doc.autoTable({ startY: finalY + 5, head: [['Sales']], headStyles: { fillColor: [41, 128, 185] } });
            doc.autoTable({ head: [['Product', 'Qty', 'Total', 'Profit']], body: sales.map(s => [s.productName, s.quantity, formatCurrencyForPDF(s.total), formatCurrencyForPDF(s.profit)])});
            finalY = doc.autoTable.previous.finalY;
        }
        if (repairs.length > 0) {
            doc.autoTable({ startY: finalY + 10, head: [['Repairs']], headStyles: { fillColor: [230, 126, 34] } });
            doc.autoTable({ head: [['Customer', 'Revenue', 'Profit']], body: repairs.map(r => [r.customerName, formatCurrencyForPDF(r.sellPrice), formatCurrencyForPDF(r.profit)])});
            finalY = doc.autoTable.previous.finalY;
        }
        if (recharges.length > 0) {
             doc.autoTable({ startY: finalY + 10, head: [['Recharges']], headStyles: { fillColor: [39, 174, 96] } });
             doc.autoTable({ head: [['Company', 'Amount']], body: recharges.map(r => [r.company, formatCurrencyForPDF(r.amount)])});
             finalY = doc.autoTable.previous.finalY;
        }
        const totalSalesRevenue = sales.reduce((s,i)=>s+i.total,0), totalSalesProfit = sales.reduce((s,i)=>s+i.profit,0);
        const totalRepairRevenue = repairs.reduce((s,i)=>s+i.sellPrice,0), totalRepairProfit = repairs.reduce((s,i)=>s+i.profit,0);
        const grandTotalRevenue = totalSalesRevenue + totalRepairRevenue + recharges.reduce((s,i)=>s+i.amount,0);
        const grandTotalProfit = totalSalesProfit + totalRepairProfit;
        doc.autoTable({ startY: finalY + 15, head: [['Summary']], headStyles: { fillColor: [127, 140, 141] } });
        doc.autoTable({ body: [ ['Total Sales Revenue', formatCurrencyForPDF(totalSalesRevenue)], ['Total Repair Revenue', formatCurrencyForPDF(totalRepairRevenue)], ['Total Recharge Revenue', formatCurrencyForPDF(recharges.reduce((s,i)=>s+i.amount,0))], [{ content: 'GRAND TOTAL REVENUE', styles: { fontStyle: 'bold' } }, { content: formatCurrencyForPDF(grandTotalRevenue), styles: { fontStyle: 'bold' } }], ['Total Sales Profit', formatCurrencyForPDF(totalSalesProfit)], ['Total Repair Profit', formatCurrencyForPDF(totalRepairProfit)], [{ content: 'GRAND TOTAL PROFIT', styles: { fontStyle: 'bold' } }, { content: formatCurrencyForPDF(grandTotalProfit), styles: { fontStyle: 'bold' } }], ] });
        doc.save(`${title.replace(/[\/ ]/g, '-')}.pdf`);
        showStatus('report_status', `Report generated!`);
    } catch(e) { console.error("PDF Generation Error:", e); showStatus('report_status', 'Error generating PDF.', true); }
}

// --- SETTINGS & BACKUP ---
async function saveApiKey() { apiKey = document.getElementById('api_key_input').value.trim(); await saveData(); showStatus('api_key_status', 'API Key saved.'); }
function promptResetAllData() {
    showConfirmModal("Reset all cloud data for this account? This cannot be undone.", async () => {
        stock = []; categories = ["Other"]; salesLog = []; repairLog = []; rechargeLog = []; apiKey = '';
        await saveData();
        showStatus('api_key_status', 'Cloud data for this account has been reset.');
    });
}
function saveBackupToFile() {
  const backupData = { stock, categories, salesLog, repairLog, rechargeLog, apiKey, savedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mahavir-shop-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showStatus('api_key_status', 'Local backup file saved!');
}
function showAllInventory() {
    document.getElementById('inventory_category_filter').value = 'All Categories';
    renderInventory();
}

async function getCustomAIInsight() {
    if (!apiKey) {
        showStatus('report_status', 'Please enter your Gemini API key in Settings.', true);
        return;
    }

    const customPrompt = document.getElementById('custom_ai_prompt').value.trim();
    if (!customPrompt) {
        showStatus('report_status', 'Please enter a question for the AI.', true);
        return;
    }

    const summaryContainer = document.getElementById('ai_summary_container');
    const summaryContent = document.getElementById('ai_summary_content');
    summaryContainer.classList.remove('hidden');
    summaryContent.innerHTML = '<p>Processing your custom query...</p>';

    const dataForAI = {
        inventory: stock.map(({ name, quantity, purchasePrice }) => ({ name, quantity, purchasePrice })),
        sales: salesLog.map(({ productName, quantity, sellPrice, profit, timestamp }) => ({ productName, quantity, sellPrice, profit, date: new Date(timestamp).toLocaleDateString() })),
        repairs: repairLog.map(({ customerName, mobileNumber, cost, sellPrice, profit, timestamp }) => ({ customerName, mobileNumber, cost, sellPrice, profit, date: new Date(timestamp).toLocaleDateString() })),
        recharges: rechargeLog.map(({ mobileNumber, company, amount, timestamp }) => ({ mobileNumber, company, amount, date: new Date(timestamp).toLocaleDateString() }))
    };

    const dataString = JSON.stringify(dataForAI, null, 2);

    const fullPrompt = `
        You are a helpful business assistant for a mobile shop owner.
        Based *only* on the JSON data provided below, answer the user's question.
        Format your answer clearly using Markdown. If the data is insufficient to answer the question, state that.

        Shop Data:
        \`\`\`json
        ${dataString}
        \`\`\`

        User's Question: "${customPrompt}"
    `;

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ text: fullPrompt }] }] };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`API call failed: ${errorBody.error.message}`);
        }

        const result = await response.json();
        const summaryMarkdown = result.candidates[0].content.parts[0].text;
        summaryContent.innerHTML = renderAIMarkdown(summaryMarkdown);

    } catch (e) {
        console.error("Custom AI Insights Error:", e);
        summaryContent.innerHTML = `<p class="text-red-400">Failed to get AI insights. Error: ${e.message}</p>`;
    }
}
function checkForUpdate() {
    showStatus('update_check_status', 'Checking for updates...', false);
    if (window.electronAPI) {
        window.electronAPI.checkForUpdate();
    }
}

